import type {
  GameState,
  SignedGameState,
  SimulationState,
  Profession,
  ToneTier,
  Supplies,
  EventChoice,
  EventResponse,
  StoreItem,
  ChallengeConstraints,
  BitterPathOutcome,
  PendingEffect,
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

// Every run departs Independence on this date. Exported so run-length math
// (scoring.ts) derives days-elapsed from the same constant the initial state
// is built with — no drift.
export const TRAIL_START_DATE = "1848-04-15";

// ── Rest / Make Camp tuning (shared) ────────────
// Extracted from inline literals in handleLandmark (Phase 2, 2026-06-10) so
// landmark rest and /api/camp heal from the SAME numbers — divergence between
// the two rest paths is a free-healing exploit.
export const REST_HEAL_PER_DAY = 10;              // health per rest day, capped at 100
export const REST_FOOD_PER_MEMBER_PER_DAY = 3;    // landmark rest food cost (filling-rations equivalent)
// Make Camp also settles nerves. High tier halves this — the horror tier does
// not get cheap sanity recovery (never soften the High tier).
export const CAMP_SANITY_RESTORE_PER_DAY = 10;

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

// ── GameState schema version + migration framework ──
// Current schema version. Bump on every signed-field addition; legacy states
// without a `state_version` are treated as v1. See docs/spec/gamestate-v2.md §2.
export const STATE_VERSION = 2;

// Defensive cap on the delayed-effects queue. Effects are server-enqueued, so a
// queue this deep signals a bug — but bound it so a runaway can't bloat the
// signed (and HMAC'd) state blob. See docs/spec/gamestate-v2.md §3.2.
export const MAX_PENDING_EFFECTS = 24;

// Append a delayed effect, dropping the OLDEST on overflow. Server-side only
// (event/consequence handlers + the sim) — the client can't mutate the signed
// blob. Does NOT clamp: delay magnitudes are intentional and are clamped at
// drain time via CONSEQUENCE_BOUNDS (the single source of truth). Mutates `sim`.
export function enqueuePendingEffect(sim: SimulationState, effect: PendingEffect): void {
  sim.pending_effects.push(effect);
  if (sim.pending_effects.length > MAX_PENDING_EFFECTS) {
    sim.pending_effects = sim.pending_effects.slice(-MAX_PENDING_EFFECTS);
  }
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
    state_version: STATE_VERSION,
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
      date: TRAIL_START_DATE,
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
      pending_event_trigger: null,
      landmark_rest_used: [],
      bitter_path_taken: "none",
      recent_event_titles: [],
      pending_effects: [],
    },
    meta: {
      run_id: crypto.randomUUID(),
      event_count: 0,
    },
  };

  const signature = await signState(state, secret);
  return { state, signature };
}

// Single upgrade path for legacy signed states. Runs AFTER verifyState succeeds
// on a structuredClone — the signature covered the legacy shape; the next
// re-sign covers the migrated shape (identical posture to the pre-versioning
// shim this replaces). Additive only: never removes or renames a signed field.
// To add a field later: bump STATE_VERSION, add one `if (v < N)` block, and add
// one legacy-round-trip test (docs/spec/gamestate-v2.md §2.3).
function migrateState(input: GameState): GameState {
  const state = structuredClone(input);

  // A genuine pre-versioning (v1) state lacks EVERY field added to the signed
  // schema since the original game loop, even though the canonical types mark
  // them required. Read them through local optional-typed views so the absence
  // checks are honest — no `as`, no false "no overlap".
  const versioned: { state_version?: number } = state;
  const settings: { challenge_id?: string | null } = state.settings;
  const sim: {
    bitter_path_taken?: BitterPathOutcome;
    pending_event_trigger?: SimulationState["pending_event_trigger"];
    pending_event_hash?: string | null;
    recent_event_titles?: string[];
    landmark_rest_used?: string[];
    pending_effects?: PendingEffect[];
  } = state.simulation;

  // v1 → v2: inject defaults for every field added un-versioned since the
  // original schema — settings.challenge_id, the two Bitter Path shims,
  // recent_event_titles, landmark_rest_used — plus the new pending_effects.
  // Folding the older un-versioned adds in here is what makes a migrated state
  // byte-identical to a fresh one (spec §4) and satisfies §2.3 (fold un-versioned
  // adds into the framework). Each defaults to the same value createInitialState uses.
  if ((versioned.state_version ?? 1) < 2) {
    if (settings.challenge_id === undefined) settings.challenge_id = null;
    if (sim.bitter_path_taken === undefined) sim.bitter_path_taken = "none";
    if (sim.pending_event_trigger === undefined) {
      // Legacy state with a pending hash is mid-event; without one, idle.
      // Bitter Path triggers never pre-dated this field — never default to it.
      sim.pending_event_trigger = sim.pending_event_hash ? "event" : null;
    }
    if (sim.recent_event_titles === undefined) sim.recent_event_titles = [];
    if (sim.landmark_rest_used === undefined) sim.landmark_rest_used = [];
    if (sim.pending_effects === undefined) sim.pending_effects = [];
  }

  state.state_version = STATE_VERSION;
  return state;
}

export async function verifyIncomingState(
  signed: SignedGameState,
  secret: string,
): Promise<{ valid: true; state: GameState } | { valid: false; error: string }> {
  const ok = await verifyState(signed.state, signed.signature, secret);
  if (!ok) {
    return { valid: false, error: "invalid_signature" };
  }
  return { valid: true, state: migrateState(signed.state) };
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

  // Clamp negative days/miles from LLM (and all other per-field bounds).
  clampConsequences(c);

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

  // Apply personality_effects to specific members by name.
  // Clamp per-event delta too — an unclamped "sanity: -200" can zero a member in one event.
  for (const [name, effects] of Object.entries(event.personality_effects)) {
    const member = next.party.members.find((m) => m.name === name);
    if (!member || !member.alive) continue;
    if (effects.sanity !== undefined) {
      const delta = clampPersonalityEffect("sanity", effects.sanity);
      member.sanity = Math.max(0, Math.min(100, member.sanity + delta));
    }
    if (effects.morale !== undefined) {
      const delta = clampPersonalityEffect("morale", effects.morale);
      member.morale = Math.max(0, Math.min(100, member.morale + delta));
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

// Per-field sane caps on LLM consequences. The ±10000 guard in anthropic.ts keeps
// the JSON from exploding, but "health: -100" still passes that and wipes the party
// because it applies to every living member. These bounds reflect game-design intent:
// a single event bruises; it doesn't end the run. A catastrophic event (High tone
// tier) costs at most ~40 health — still survivable with medicine and rest.
const CONSEQUENCE_BOUNDS: Record<string, [number, number]> = {
  health:       [-40, 25],
  morale:       [-30, 25],
  sanity:       [-30, 25],
  food:         [-150, 150],
  ammo:         [-50, 60],
  clothing:     [-3, 3],
  spare_parts:  [-2, 3],
  medicine:     [-3, 5],
  money:        [-5000, 5000],
  oxen:         [-2, 2],
  days:         [0, 5],
  miles:        [0, 50],
};

function clampToBounds(key: string, val: number): number {
  const bounds = CONSEQUENCE_BOUNDS[key];
  if (!bounds) return val;
  return Math.max(bounds[0], Math.min(bounds[1], val));
}

// The numeric fields an event/effect consequence delta can carry. Iterating
// this typed list (rather than Object.keys) lets clampConsequences take the
// consequence shape directly — no `as` cast — and only ever touches real
// consequence keys.
const CONSEQUENCE_DELTA_KEYS: readonly (keyof EventChoice["consequences"])[] = [
  "health", "food", "ammo", "clothing", "spare_parts",
  "medicine", "money", "oxen", "morale", "miles", "days",
];

// Clamp each present field to CONSEQUENCE_BOUNDS, in place. Shared by immediate
// event resolution (applyEventAndSign) and the delayed-effect drain so both
// honor the same anti-cheat bounds — the single clamp path (spec §4).
export function clampConsequences(c: EventChoice["consequences"]): void {
  for (const key of CONSEQUENCE_DELTA_KEYS) {
    const val = c[key];
    if (val === undefined) continue;
    c[key] = clampToBounds(key, val);
  }
}

// Exported for per-member personality_effects clamping in applyEventAndSign
export function clampPersonalityEffect(key: "sanity" | "morale", val: number): number {
  return clampToBounds(key, val);
}
