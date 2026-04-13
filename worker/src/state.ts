import type {
  GameState,
  SignedGameState,
  Profession,
  ToneTier,
  Supplies,
  EventResponse,
  StoreItem,
  ChallengeConstraints,
  Pace,
  Rations,
} from "./types";
import { signState, verifyState } from "./hmac";

// ── Store Prices (cents per unit) — single source of truth ──
export const STORE_PRICES: Record<string, { price_cents: number; unit_amount: number; unit_label: string; tooltip: string }> = {
  food:        { price_cents: 30,   unit_amount: 10, unit_label: '10 lbs',    tooltip: '200 lbs per person for the full journey' },
  ammo:        { price_cents: 200,  unit_amount: 20, unit_label: '20 rounds', tooltip: 'For hunting and defense' },
  clothing:    { price_cents: 300,  unit_amount: 1,  unit_label: '1 set',     tooltip: 'Essential for mountain crossings' },
  spare_parts: { price_cents: 200,  unit_amount: 1,  unit_label: '1 part',    tooltip: 'Broken axles and tongues can strand you' },
  medicine:    { price_cents: 100,  unit_amount: 3,  unit_label: '3 doses',   tooltip: 'Reduces disease mortality by half' },
  oxen:        { price_cents: 5000, unit_amount: 2,  unit_label: '1 yoke (2)', tooltip: '6 minimum (3 yoke) to pull a loaded wagon' },
};

const STARTING_MONEY: Record<Profession, number> = {
  farmer: 400_00,
  carpenter: 800_00,
  banker: 1600_00,
};

// ── Weekly Challenge Definitions ────────────────
export const WEEKLY_CHALLENGES: ChallengeConstraints[] = [
  { id: 'half_rations', money_multiplier: 0.5, force_pace: null, force_rations: null, force_tone: null, no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'speed_run', money_multiplier: 1, force_pace: 'grueling', force_rations: null, force_tone: null, no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'pacifist', money_multiplier: 1, force_pace: null, force_rations: null, force_tone: null, no_ammo: true, no_medicine: false, no_spare_parts: false, no_hunting: true },
  { id: 'bare_bones', money_multiplier: 1, force_pace: null, force_rations: 'bare_bones', force_tone: null, no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'nightmare', money_multiplier: 1, force_pace: null, force_rations: null, force_tone: 'high', no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'penny_pinch', money_multiplier: 0.25, force_pace: null, force_rations: null, force_tone: null, no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'starvation_march', money_multiplier: 0.75, force_pace: 'grueling', force_rations: 'meager', force_tone: null, no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'iron_man', money_multiplier: 1, force_pace: null, force_rations: null, force_tone: null, no_ammo: false, no_medicine: true, no_spare_parts: false, no_hunting: false },
  { id: 'rich_fool', money_multiplier: 1, force_pace: null, force_rations: null, force_tone: 'high', no_ammo: false, no_medicine: false, no_spare_parts: false, no_hunting: false },
  { id: 'minimalist', money_multiplier: 0.6, force_pace: null, force_rations: null, force_tone: null, no_ammo: false, no_medicine: false, no_spare_parts: true, no_hunting: false },
];

export function getChallengeById(id: string): ChallengeConstraints | undefined {
  return WEEKLY_CHALLENGES.find(c => c.id === id);
}

export function getCurrentChallenge(): ChallengeConstraints {
  const weekNum = Math.floor(Date.now() / 604800000);
  return WEEKLY_CHALLENGES[weekNum % WEEKLY_CHALLENGES.length];
}

export async function createInitialState(
  leaderName: string,
  memberNames: [string, string, string, string],
  profession: Profession,
  toneTier: ToneTier,
  secret: string,
  challengeId?: string | null,
): Promise<SignedGameState> {
  const challenge = challengeId ? getChallengeById(challengeId) : undefined;
  const startingMoney = challenge
    ? Math.floor(STARTING_MONEY[profession] * challenge.money_multiplier)
    : STARTING_MONEY[profession];

  const state: GameState = {
    party: {
      leader_name: leaderName,
      members: [leaderName, ...memberNames].map((name) => ({
        name,
        health: 100,
        alive: true,
        sanity: 100,
        morale: 100,
        disease: null,
      })),
    },
    supplies: {
      food: 0,
      ammo: 0,
      clothing: 0,
      spare_parts: 0,
      medicine: 0,
      money: startingMoney,
      oxen: 0,
    },
    position: {
      current_segment_id: "seg_01",
      miles_traveled: 0,
      date: "1848-04-15",
    },
    settings: {
      pace: challenge?.force_pace ?? "steady",
      rations: challenge?.force_rations ?? "filling",
      tone_tier: challenge?.force_tone ?? toneTier,
      challenge_id: challengeId ?? null,
    },
    journal: [],
    deaths: [],
    simulation: {
      starvation_days: 0,
      days_since_last_event: 0,
      resolved_crossings: [],
      visited_landmarks: [],
      pending_event_hash: null,
      landmark_rest_used: [],
    },
    meta: {
      run_id: crypto.randomUUID(),
      event_count: 0,
    },
  };

  const signature = await signState(state, secret);
  return { state, signature };
}

export async function verifyIncomingState(
  signed: SignedGameState,
  secret: string,
): Promise<{ valid: true; state: GameState } | { valid: false; error: string }> {
  const ok = await verifyState(signed.state, signed.signature, secret);
  if (!ok) {
    return { valid: false, error: "invalid_signature" };
  }
  return { valid: true, state: signed.state };
}

export async function applyEventAndSign(
  state: GameState,
  choiceIndex: number,
  event: EventResponse,
  secret: string,
): Promise<SignedGameState> {
  const next = structuredClone(state);
  const choice = event.choices[choiceIndex];
  const c = choice.consequences;

  // Clamp negative days/miles from LLM
  clampConsequences(c as Record<string, number | undefined>);

  // Apply supply consequences (clamped to 0)
  const supplyKeys: (keyof Supplies)[] = [
    "food", "ammo", "clothing", "spare_parts", "medicine", "money", "oxen",
  ];
  for (const key of supplyKeys) {
    if (c[key] !== undefined) {
      next.supplies[key] = Math.max(0, next.supplies[key] + c[key]!);
    }
  }

  // Apply health/morale to all living members
  for (const member of next.party.members) {
    if (!member.alive) continue;

    if (c.health !== undefined) {
      member.health = Math.max(0, Math.min(100, member.health + c.health));
      if (member.health === 0) {
        member.alive = false;
        next.deaths.push({
          name: member.name,
          date: next.position.date,
          cause: event.title || "unknown",
          epitaph: null,
        });
      }
    }
    if (c.morale !== undefined) {
      member.morale = Math.max(0, Math.min(100, member.morale + c.morale));
    }
  }

  // Apply personality_effects to specific members by name
  for (const [name, effects] of Object.entries(event.personality_effects)) {
    const member = next.party.members.find((m) => m.name === name);
    if (!member || !member.alive) continue;
    if (effects.sanity !== undefined) {
      member.sanity = Math.max(0, Math.min(100, member.sanity + effects.sanity));
    }
    if (effects.morale !== undefined) {
      member.morale = Math.max(0, Math.min(100, member.morale + effects.morale));
    }
  }

  // Advance miles
  if (c.miles !== undefined) {
    next.position.miles_traveled += c.miles;
  }

  // Advance date (UTC to avoid timezone drift)
  if (c.days !== undefined && c.days > 0) {
    const d = new Date(next.position.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + c.days);
    next.position.date = d.toISOString().split("T")[0];
  }

  // Journal: append entry, cap at 5 (keep last 5)
  next.journal.push(event.journal_entry);
  if (next.journal.length > 5) {
    next.journal = next.journal.slice(-5);
  }

  // Increment event count
  next.meta.event_count += 1;

  const signature = await signState(next, secret);
  return { state: next, signature };
}

export async function applyStoreAndSign(
  state: GameState,
  purchases: StoreItem[],
  secret: string,
): Promise<SignedGameState> {
  const next = structuredClone(state);

  let totalCost = 0;
  for (const purchase of purchases) {
    if (!Number.isInteger(purchase.quantity) || purchase.quantity <= 0) {
      throw new Error(`invalid_quantity: ${purchase.item} must be a positive integer`);
    }
    const priceInfo = STORE_PRICES[purchase.item];
    if (!priceInfo) throw new Error(`unknown_item: ${purchase.item}`);
    const cost = purchase.quantity * priceInfo.price_cents;
    const supplyAmount = purchase.quantity * priceInfo.unit_amount;
    totalCost += cost;
    next.supplies[purchase.item] += supplyAmount;
  }

  if (totalCost > next.supplies.money) {
    throw new Error("insufficient_funds");
  }
  next.supplies.money -= totalCost;

  const signature = await signState(next, secret);
  return { state: next, signature };
}

// Clamp days/miles from LLM to prevent negative values
export function clampConsequences(c: Record<string, number | undefined>): void {
  if (c.days !== undefined && c.days < 0) c.days = 0;
  if (c.miles !== undefined && c.miles < 0) c.miles = 0;
}
