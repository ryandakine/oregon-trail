import { describe, it, expect } from "vitest";
import {
  handleChoice,
  handleRiver,
  handleStore,
  handleHunt,
  handleLandmark,
  hashEvent,
  nextFallbackEvent,
  __resetFallbackCursor,
} from "../src/index";
import type { ToneTier } from "../src/types";
import { createInitialState } from "../src/state";
import { signState } from "../src/hmac";
import type { EventResponse, GameState, SignedGameState } from "../src/types";

// LLM-free handler suite. handleChoice/handleRiver/handleStore/handleHunt/
// handleLandmark never call Anthropic — they verify the signed state, the
// anti-cheat pair (event_hash + trigger-kind), and apply deterministic effects.
// Pattern ported from handleBitterPath.test.ts.

const SECRET = "test-secret-for-handlers-suite";
const MEMBERS: [string, string, string, string] = ["Bob", "Cara", "Dan", "Ellen"];
const ORIGIN = "*";

const ENV = {
  HMAC_SECRET: SECRET,
  ANTHROPIC_API_KEY: "unused",
  ALLOWED_ORIGIN: "*",
} as unknown as Parameters<typeof handleChoice>[1];

const NORMAL_EVENT: EventResponse = {
  title: "Broken Wheel",
  description: "A wheel cracks on a deep rut.",
  choices: [
    { label: "Repair with spare parts", consequences: { spare_parts: -1, days: 1 } },
    { label: "Press on slowly", consequences: { miles: -5, morale: -5 } },
  ],
  personality_effects: {},
  journal_entry: "A wheel cracked on a bad rut today.",
};

function makeRequest(body: unknown, path = "/api/choice"): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sign(state: GameState): Promise<SignedGameState> {
  const signature = await signState(state, SECRET);
  return { state, signature };
}

// State with a pending NORMAL event (trigger="event"), hash matching NORMAL_EVENT.
async function makeEventPending(): Promise<{ state: GameState; signed: SignedGameState }> {
  const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
  state.position.miles_traveled = 100;
  state.supplies.spare_parts = 3;
  const hash = await hashEvent(NORMAL_EVENT);
  state.simulation.pending_event_hash = hash;
  state.simulation.pending_event_trigger = "event";
  return { state, signed: await sign(state) };
}

// State with a pending BITTER_PATH event but the same hash — proves the cross-
// endpoint exploit (route a bitter_path hash through /api/choice) is closed.
async function makeBitterPending(): Promise<{ signed: SignedGameState }> {
  const { state } = await createInitialState("Alice", MEMBERS, "farmer", "high", SECRET);
  state.position.miles_traveled = 100;
  const hash = await hashEvent(NORMAL_EVENT);
  state.simulation.pending_event_hash = hash;
  state.simulation.pending_event_trigger = "bitter_path";
  return { signed: await sign(state) };
}

describe("handleChoice — anti-cheat pair (event_hash + trigger-kind)", () => {
  it("resolves a valid normal event: clears pending hash, applies choice, records title", async () => {
    const { signed } = await makeEventPending();
    const req = makeRequest({ signed_state: signed, event: NORMAL_EVENT, choice_index: 0 });
    const res = await handleChoice(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState };
    const sim = body.signed_state.state.simulation;
    expect(sim.pending_event_hash).toBeNull();
    expect(sim.pending_event_trigger).toBeNull();
    // choice 0 consumes a spare part
    expect(body.signed_state.state.supplies.spare_parts).toBe(2);
    // anti-repetition: resolved title is recorded
    expect(sim.recent_event_titles).toContain("Broken Wheel");
  });

  it("rejects a fabricated event body with event_hash_mismatch (anti-fabrication)", async () => {
    const { signed } = await makeEventPending();
    const tampered: EventResponse = {
      ...NORMAL_EVENT,
      choices: [{ label: "Free food", consequences: { food: 10000 } }],
    };
    const req = makeRequest({ signed_state: signed, event: tampered, choice_index: 0 });
    const res = await handleChoice(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("event_hash_mismatch");
  });

  it("rejects a bitter_path pending hash routed through /api/choice with wrong_trigger_kind", async () => {
    const { signed } = await makeBitterPending();
    const req = makeRequest({ signed_state: signed, event: NORMAL_EVENT, choice_index: 0 });
    const res = await handleChoice(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("wrong_trigger_kind");
  });

  it("rejects out-of-range choice_index", async () => {
    const { signed } = await makeEventPending();
    for (const idx of [-1, 2, 99]) {
      const req = makeRequest({ signed_state: signed, event: NORMAL_EVENT, choice_index: idx });
      const res = await handleChoice(req, ENV, ORIGIN);
      expect(res.status, `idx=${idx}`).toBe(400);
      expect((await res.json() as { error: string }).error).toBe("invalid_choice_index");
    }
  });

  it("rejects a tampered (re-signed) state with bad HMAC", async () => {
    const { state } = await makeEventPending();
    // Mutate AFTER signing with a different secret → signature invalid
    const badSig = await signState(state, "wrong-secret");
    const req = makeRequest({ signed_state: { state, signature: badSig }, event: NORMAL_EVENT, choice_index: 0 });
    const res = await handleChoice(req, ENV, ORIGIN);
    expect(res.status).toBe(403);
  });

  it("caps recent_event_titles at 5 (oldest dropped)", async () => {
    const { state } = await makeEventPending();
    state.simulation.recent_event_titles = ["E1", "E2", "E3", "E4", "E5"];
    const req = makeRequest({ signed_state: await sign(state), event: NORMAL_EVENT, choice_index: 1 });
    const res = await handleChoice(req, ENV, ORIGIN);
    const body = await res.json() as { signed_state: SignedGameState };
    const titles = body.signed_state.state.simulation.recent_event_titles;
    expect(titles).toHaveLength(5);
    expect(titles).not.toContain("E1");
    expect(titles[titles.length - 1]).toBe("Broken Wheel");
  });
});

describe("handleRiver — positional gate (river_not_reached)", () => {
  // seg_01 has rc_wakarusa_creek (mile 27) and rc_kansas_river (mile 55).
  async function riverState(milesTraveled: number): Promise<SignedGameState> {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    state.position.current_segment_id = "seg_01";
    state.position.miles_traveled = milesTraveled;
    state.supplies.oxen = 6;
    return sign(state);
  }

  it("rejects crossing a river the party has not yet reached", async () => {
    const signed = await riverState(0); // mile 0, Kansas River is at mile 55
    const req = makeRequest({ signed_state: signed, crossing_id: "rc_kansas_river", choice: "ferry" }, "/api/river");
    const res = await handleRiver(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("river_not_reached");
  });

  it("rejects a nearer crossing too (mile 20 < Wakarusa mile 27)", async () => {
    const signed = await riverState(20);
    const req = makeRequest({ signed_state: signed, crossing_id: "rc_wakarusa_creek", choice: "ford" }, "/api/river");
    const res = await handleRiver(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("river_not_reached");
  });

  it("allows the crossing once the party has reached the mile marker", async () => {
    const signed = await riverState(60); // past Kansas River mile 55
    const req = makeRequest({ signed_state: signed, crossing_id: "rc_kansas_river", choice: "ferry" }, "/api/river");
    const res = await handleRiver(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; narrative: string };
    expect(body.signed_state.state.simulation.resolved_crossings).toContain("rc_kansas_river");
  });

  it("rejects an unknown crossing_id before the positional check", async () => {
    const signed = await riverState(60);
    const req = makeRequest({ signed_state: signed, crossing_id: "rc_nonexistent", choice: "ford" }, "/api/river");
    const res = await handleRiver(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("crossing_not_found");
  });

  it("rejects an invalid choice", async () => {
    const signed = await riverState(60);
    const req = makeRequest({ signed_state: signed, crossing_id: "rc_kansas_river", choice: "swim" }, "/api/river");
    const res = await handleRiver(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_choice");
  });
});

describe("handleStore — departure gate", () => {
  it("rejects purchases after departure (miles_traveled > 0)", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    state.position.miles_traveled = 50;
    const req = makeRequest({ signed_state: await sign(state), purchases: [{ item: "food", quantity: 1 }] }, "/api/store");
    const res = await handleStore(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toContain("store_closed");
  });

  it("rejects an invalidly-signed state with 403", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    const badSig = await signState(state, "wrong-secret");
    const req = makeRequest({ signed_state: { state, signature: badSig }, purchases: [] }, "/api/store");
    const res = await handleStore(req, ENV, ORIGIN);
    expect(res.status).toBe(403);
  });

  it("accepts a valid pre-departure purchase", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    const req = makeRequest({ signed_state: await sign(state), purchases: [{ item: "food", quantity: 1 }] }, "/api/store");
    const res = await handleStore(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
  });
});

describe("handleHunt — phase + ammo gates", () => {
  async function huntState(milesTraveled: number, ammo: number): Promise<SignedGameState> {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    state.position.miles_traveled = milesTraveled;
    state.supplies.ammo = ammo;
    return sign(state);
  }

  it("rejects hunting before departure (miles_traveled === 0)", async () => {
    const req = makeRequest({ signed_state: await huntState(0, 100), ammo_spent: 10 }, "/api/hunt");
    const res = await handleHunt(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("hunt_not_available");
  });

  it("rejects spending more ammo than the party holds", async () => {
    const req = makeRequest({ signed_state: await huntState(100, 5), ammo_spent: 10 }, "/api/hunt");
    const res = await handleHunt(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("insufficient_ammo");
  });

  it("rejects spending more than the 30-round per-hunt cap", async () => {
    const req = makeRequest({ signed_state: await huntState(100, 100), ammo_spent: 31 }, "/api/hunt");
    const res = await handleHunt(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toContain("ammo_cap_exceeded");
  });

  it("deducts ammo and advances a day on a valid hunt", async () => {
    const signed = await huntState(100, 30);
    const beforeDate = signed.state.position.date;
    const req = makeRequest({ signed_state: signed, ammo_spent: 10 }, "/api/hunt");
    const res = await handleHunt(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; results: { shots: number } };
    expect(body.signed_state.state.supplies.ammo).toBe(20);
    expect(body.signed_state.state.position.date).not.toBe(beforeDate);
    expect(body.results.shots).toBe(10);
  });
});

describe("handleLandmark — visit gate", () => {
  it("rejects acting on a landmark the party has not visited", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    const req = makeRequest({ signed_state: await sign(state), landmark_id: "lm_fort_kearney", action: "rest" }, "/api/landmark");
    const res = await handleLandmark(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("landmark_not_visited");
  });

  it("rests at a visited landmark: heals living members, advances a day", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    state.simulation.visited_landmarks = ["lm_fort_kearney"];
    state.supplies.food = 100;
    for (const m of state.party.members) m.health = 50;
    const beforeDate = state.position.date;
    const req = makeRequest({ signed_state: await sign(state), landmark_id: "lm_fort_kearney", action: "rest" }, "/api/landmark");
    const res = await handleLandmark(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState };
    expect(body.signed_state.state.position.date).not.toBe(beforeDate);
    for (const m of body.signed_state.state.party.members) {
      expect(m.health).toBe(60); // +10
    }
  });
});

describe("nextFallbackEvent — no-repeat round-robin over FALLBACK_EVENTS", () => {
  it("cycles through every event in a tier without repeating before the pool is exhausted", () => {
    for (const tier of ["low", "medium", "high"] as ToneTier[]) {
      __resetFallbackCursor();
      const seen: string[] = [];
      // 12 events/tier — pull exactly that many; expect all distinct titles.
      for (let i = 0; i < 12; i++) {
        seen.push(nextFallbackEvent(tier).title);
      }
      expect(new Set(seen).size, `tier=${tier} should yield 12 distinct titles`).toBe(12);
    }
  });

  it("never serves the same event twice in a row", () => {
    __resetFallbackCursor();
    let prev = "";
    for (let i = 0; i < 30; i++) {
      const title = nextFallbackEvent("high").title;
      expect(title, `repeat at i=${i}`).not.toBe(prev);
      prev = title;
    }
  });

  it("wraps around after exhausting the pool", () => {
    __resetFallbackCursor();
    const first = nextFallbackEvent("low").title;
    for (let i = 0; i < 11; i++) nextFallbackEvent("low"); // advance through the rest of the 12
    // 13th pull wraps to the start
    expect(nextFallbackEvent("low").title).toBe(first);
  });
});
