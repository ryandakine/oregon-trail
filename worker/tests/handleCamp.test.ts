import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCamp, handleLandmark, type Env } from "../src/index";
import { advanceDays } from "../src/simulation";
import {
  createInitialState,
  verifyIncomingState,
  REST_HEAL_PER_DAY,
  REST_FOOD_PER_MEMBER_PER_DAY,
  CAMP_SANITY_RESTORE_PER_DAY,
} from "../src/state";
import { signState } from "../src/hmac";
import ctx from "../src/historical-context.json";
import type { CampResponse, GameState, HistoricalContext, SignedGameState } from "../src/types";

// POST /api/camp (Phase 2 Bet 3): gates (HMAC / pending event / phase), one
// day in place via the SAME per-day attrition path advanceDays runs, then
// rest healing from the shared landmark-rest constants. High tier: sanity
// restore halved. Plus the landmark-rest extraction regression.

const SECRET = "camp-test-secret";
const MEMBERS: [string, string, string, string] = ["Bob", "Cara", "Dan", "Ellen"];
const ORIGIN = "*";
const historical = ctx as unknown as HistoricalContext;

const ENV: Env = {
  HMAC_SECRET: SECRET,
  ANTHROPIC_API_KEY: "unused",
  ALLOWED_ORIGIN: "*",
};

function makeRequest(body: unknown, path = "/api/camp"): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sign(state: GameState): Promise<SignedGameState> {
  return { state, signature: await signState(state, SECRET) };
}

async function travelState(
  tone: "low" | "medium" | "high" = "medium",
): Promise<GameState> {
  const { state } = await createInitialState("Alice", MEMBERS, "farmer", tone, SECRET);
  state.position.miles_traveled = 100;
  state.supplies.food = 100;
  state.supplies.oxen = 6;
  return state;
}

beforeEach(() => {
  // Pin randomness: no disease onset (p ≤ ~0.014), no cure roll, no event
  // roll — attrition assertions stay exact.
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleCamp — gates", () => {
  it("403s a tampered/invalidly-signed state", async () => {
    const state = await travelState();
    const badSig = await signState(state, "wrong-secret");
    const res = await handleCamp(makeRequest({ signed_state: { state, signature: badSig } }), ENV, ORIGIN);
    expect(res.status).toBe(403);
  });

  it("rejects with resolve_pending_event while an event is pending", async () => {
    const state = await travelState();
    state.simulation.pending_event_hash = "deadbeef";
    state.simulation.pending_event_trigger = "event";
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("resolve_pending_event");
  });

  it("rejects wrong_phase before departure (miles 0)", async () => {
    const state = await travelState();
    state.position.miles_traveled = 0;
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_phase");
  });

  it("rejects wrong_phase after arrival (full trail distance)", async () => {
    const state = await travelState();
    state.position.miles_traveled = 1764;
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_phase");
  });

  it("rejects wrong_phase when the party is wiped", async () => {
    const state = await travelState();
    for (const m of state.party.members) {
      m.alive = false;
      m.health = 0;
    }
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_phase");
  });
});

describe("handleCamp — one day in place", () => {
  it("advances one day, leaves miles unchanged, heals, and re-signs verifiably", async () => {
    const state = await travelState();
    for (const m of state.party.members) {
      m.health = 50;
      m.sanity = 50;
    }
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CampResponse;
    const next = body.signed_state.state;

    expect(next.position.miles_traveled).toBe(100); // miles unchanged
    expect(next.position.date).toBe("1848-04-16"); // exactly one day
    expect(body.summary.date).toBe("1848-04-15"); // the day spent camping

    // food at ration rate (filling 1.5 × 5 alive), NOT landmark's 3/member
    expect(body.summary.food_consumed).toBe(7.5);
    expect(next.supplies.food).toBe(92.5);

    // rest healing via the shared constant
    for (const m of next.party.members) {
      expect(m.health).toBe(50 + REST_HEAL_PER_DAY);
      expect(m.sanity).toBe(50 + CAMP_SANITY_RESTORE_PER_DAY); // medium: full restore
    }
    expect(body.summary.healed).toHaveLength(5);
    for (const h of body.summary.healed) {
      expect(h.hp_delta).toBe(REST_HEAL_PER_DAY);
    }

    // the returned state verifies under the same secret (HMAC chain intact)
    const verified = await verifyIncomingState(body.signed_state, SECRET);
    expect(verified.valid).toBe(true);
  });

  it("consumes food at the CURRENT ration setting (bare_bones ≠ landmark flat rate)", async () => {
    const state = await travelState();
    state.settings.rations = "bare_bones";
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const body = (await res.json()) as CampResponse;
    expect(body.summary.food_consumed).toBe(5); // 1 × 5 alive
  });

  it("caps healing at 100 and reports the real hp_delta", async () => {
    const state = await travelState();
    for (const m of state.party.members) m.health = 95;
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const body = (await res.json()) as CampResponse;
    for (const m of body.signed_state.state.party.members) expect(m.health).toBe(100);
    for (const h of body.summary.healed) expect(h.hp_delta).toBe(5);
  });
});

describe("handleCamp — attrition parity with advanceDays", () => {
  it("camp food consumption matches advanceDays day-1 for the same state", async () => {
    const state = await travelState();
    state.settings.rations = "meager";
    // travelState() sits at mile 100; resolve the two upstream crossings or
    // advanceDays returns the river trigger before simulating a single day.
    // Camp itself never checks crossings BY DESIGN (no movement) — this only
    // unblocks the advanceDays comparison path, not an equivalence claim.
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river"];

    const campRes = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const campBody = (await campRes.json()) as CampResponse;

    const sim = advanceDays(structuredClone(state), historical);
    expect(sim.summaries.length).toBeGreaterThan(0);
    expect(campBody.summary.food_consumed).toBe(sim.summaries[0].food_consumed);
    expect(campBody.summary.food_consumed).toBe(1.2 * 5);
  });

  it("starvation ticks during camp exactly as on the trail (no free healing)", async () => {
    const state = await travelState();
    state.supplies.food = 0;
    state.simulation.starvation_days = 4; // past the grace window
    for (const m of state.party.members) {
      m.health = 50;
      m.morale = 50;
    }
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const body = (await res.json()) as CampResponse;
    const next = body.signed_state.state;

    expect(next.simulation.starvation_days).toBe(5);
    expect(body.summary.food_consumed).toBe(0);
    expect(body.summary.notes).toContain("Starvation taking its toll");
    for (const m of next.party.members) {
      expect(m.health).toBe(50); // -10 starvation, then +10 rest heal — net zero
      expect(m.morale).toBe(40); // starvation morale hit is NOT healed back
    }
  });

  it("disease keeps progressing during camp (days_sick + health loss before heal)", async () => {
    const state = await travelState();
    state.supplies.medicine = 0;
    const sick = state.party.members[0];
    sick.health = 50;
    sick.disease = { id: "cholera", days_sick: 0, stage: "active", medicine_used_today: false };
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const body = (await res.json()) as CampResponse;
    const sickAfter = body.signed_state.state.party.members[0];

    // cholera: ceil(100*0.5/3) = 17/day, then +10 rest heal → 43
    expect(sickAfter.health).toBe(50 - 17 + REST_HEAL_PER_DAY);
    expect(sickAfter.disease?.days_sick).toBe(1);
  });

  it("a member who dies during camp is recorded and not healed", async () => {
    const state = await travelState();
    state.supplies.food = 0;
    state.simulation.starvation_days = 6;
    state.party.members[0].health = 5; // -10 starvation → dead
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const body = (await res.json()) as CampResponse;
    const next = body.signed_state.state;

    expect(next.party.members[0].alive).toBe(false);
    expect(next.deaths.map((d) => d.name)).toContain("Alice");
    expect(body.summary.notes.some((n) => n.includes("has died"))).toBe(true);
    expect(body.summary.healed.map((h) => h.name)).not.toContain("Alice");
    expect(body.summary.healed).toHaveLength(4);
  });
});

describe("handleCamp — High tier sanity penalty", () => {
  it("halves the sanity restore on high tone (health heal unchanged)", async () => {
    const state = await travelState("high");
    for (const m of state.party.members) {
      m.health = 50;
      m.sanity = 50;
    }
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }), ENV, ORIGIN);
    const body = (await res.json()) as CampResponse;
    for (const m of body.signed_state.state.party.members) {
      expect(m.sanity).toBe(50 + CAMP_SANITY_RESTORE_PER_DAY / 2);
      expect(m.health).toBe(50 + REST_HEAL_PER_DAY); // hp heal NOT softened
    }
  });
});

describe("handleLandmark rest — unchanged after constant extraction", () => {
  it("still heals +10 and deducts the flat 3 lbs/member/day", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    state.simulation.visited_landmarks = ["lm_fort_kearney"];
    state.supplies.food = 100;
    for (const m of state.party.members) m.health = 50;
    const res = await handleLandmark(
      makeRequest({ signed_state: await sign(state), landmark_id: "lm_fort_kearney", action: "rest" }, "/api/landmark"),
      ENV,
      ORIGIN,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signed_state: SignedGameState };
    const next = body.signed_state.state;
    expect(REST_HEAL_PER_DAY).toBe(10);
    expect(REST_FOOD_PER_MEMBER_PER_DAY).toBe(3);
    for (const m of next.party.members) expect(m.health).toBe(60);
    expect(next.supplies.food).toBe(100 - 3 * 5);
  });
});
