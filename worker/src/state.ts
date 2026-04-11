import type {
  GameState,
  SignedGameState,
  Profession,
  ToneTier,
  Supplies,
  EventResponse,
  StoreItem,
} from "./types";
import { signState, verifyState } from "./hmac";

// ── Store Prices (cents per unit) ──────────────
export const STORE_PRICES: Record<string, { price_cents: number; unit_amount: number }> = {
  food:        { price_cents: 30,   unit_amount: 10 },  // 30c per 10 lbs
  ammo:        { price_cents: 200,  unit_amount: 20 },  // $2 per 20 rounds
  clothing:    { price_cents: 300,  unit_amount: 1 },   // $3 per set
  spare_parts: { price_cents: 200,  unit_amount: 1 },   // $2 per part
  medicine:    { price_cents: 100,  unit_amount: 3 },   // $1 per 3 doses
  oxen:        { price_cents: 5000, unit_amount: 2 },   // $50 per yoke (2 oxen)
};

const STARTING_MONEY: Record<Profession, number> = {
  farmer: 400_00,
  carpenter: 800_00,
  banker: 1600_00,
};

export async function createInitialState(
  leaderName: string,
  memberNames: [string, string, string, string],
  profession: Profession,
  toneTier: ToneTier,
  secret: string,
): Promise<SignedGameState> {
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
      money: STARTING_MONEY[profession],
      oxen: 0,
    },
    position: {
      current_segment_id: "seg_01",
      miles_traveled: 0,
      date: "1848-04-15",
    },
    settings: {
      pace: "steady",
      rations: "filling",
      tone_tier: toneTier,
    },
    journal: [],
    deaths: [],
    simulation: {
      starvation_days: 0,
      days_since_last_event: 0,
      resolved_crossings: [],
      visited_landmarks: [],
      pending_event_hash: null,
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
