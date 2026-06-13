import { describe, it, expect } from "vitest";
import { computeRunScore, runDays, isArrival, survivorCount } from "../src/scoring";
import type { GameState } from "../src/types";

// Pinned formula (PHASE2_BIG_BETS_PLAN.md Bet 2):
//   miles + survivors*200 + (arrival ? max(0, 2000 - days*10) : 0)
// Exact values + monotonicity. The trail is 1764 miles (historical-context).

function makeState(opts: {
  miles: number;
  alive: number;
  date: string;
}): GameState {
  const names = ["Alice", "Bob", "Carol", "Dave", "Eve"];
  return {
    state_version: 2,
    party: {
      leader_name: "Alice",
      members: names.map((name, i) => ({
        name,
        health: i < opts.alive ? 80 : 0,
        alive: i < opts.alive,
        sanity: 50,
        morale: 50,
        disease: null,
      })),
    },
    supplies: { food: 0, ammo: 0, clothing: 0, spare_parts: 0, medicine: 0, money: 0, oxen: 0 },
    position: { current_segment_id: "seg_01", miles_traveled: opts.miles, date: opts.date },
    settings: { pace: "steady", rations: "filling", tone_tier: "medium", challenge_id: null },
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
    meta: { run_id: "score-test", event_count: 0 },
  };
}

describe("runDays", () => {
  it("is 0 on departure day and counts whole days from 1848-04-15", () => {
    expect(runDays(makeState({ miles: 0, alive: 5, date: "1848-04-15" }))).toBe(0);
    expect(runDays(makeState({ miles: 0, alive: 5, date: "1848-04-16" }))).toBe(1);
    expect(runDays(makeState({ miles: 0, alive: 5, date: "1848-09-12" }))).toBe(150);
    expect(runDays(makeState({ miles: 0, alive: 5, date: "1848-11-01" }))).toBe(200);
  });
});

describe("computeRunScore — exact values", () => {
  it("wipe: miles only (no survivors, no arrival bonus)", () => {
    const state = makeState({ miles: 500, alive: 0, date: "1848-07-01" });
    expect(survivorCount(state)).toBe(0);
    expect(isArrival(state)).toBe(false);
    expect(computeRunScore(state)).toBe(500);
  });

  it("mid-trail with full party: miles + 5*200, no arrival bonus", () => {
    const state = makeState({ miles: 800, alive: 5, date: "1848-07-01" });
    expect(isArrival(state)).toBe(false);
    expect(computeRunScore(state)).toBe(800 + 1000);
  });

  it("arrival in 150 days with 3 survivors: 1764 + 600 + (2000 - 1500)", () => {
    const state = makeState({ miles: 1764, alive: 3, date: "1848-09-12" });
    expect(isArrival(state)).toBe(true);
    expect(computeRunScore(state)).toBe(1764 + 3 * 200 + 500);
  });

  it("arrival on day 200 exactly: bonus floor of 0 (not negative)", () => {
    const state = makeState({ miles: 1764, alive: 3, date: "1848-11-01" });
    expect(computeRunScore(state)).toBe(1764 + 600);
  });

  it("arrival past day 200: bonus clamped at 0, never negative", () => {
    const slow = makeState({ miles: 1764, alive: 5, date: "1848-12-21" }); // 250 days
    expect(computeRunScore(slow)).toBe(1764 + 1000);
  });

  it("full-distance miles with zero survivors is a wipe, not an arrival", () => {
    const state = makeState({ miles: 1764, alive: 0, date: "1848-09-12" });
    expect(isArrival(state)).toBe(false);
    expect(computeRunScore(state)).toBe(1764);
  });
});

describe("computeRunScore — monotonicity", () => {
  it("more survivors never scores lower", () => {
    for (let alive = 0; alive < 5; alive++) {
      const fewer = computeRunScore(makeState({ miles: 900, alive, date: "1848-07-01" }));
      const more = computeRunScore(makeState({ miles: 900, alive: alive + 1, date: "1848-07-01" }));
      expect(more, `alive=${alive}`).toBeGreaterThan(fewer);
    }
  });

  it("more miles never scores lower (same survivors/date)", () => {
    const near = computeRunScore(makeState({ miles: 900, alive: 4, date: "1848-07-01" }));
    const far = computeRunScore(makeState({ miles: 1000, alive: 4, date: "1848-07-01" }));
    expect(far).toBeGreaterThan(near);
  });

  it("a faster arrival never scores lower than a slower one", () => {
    const fast = computeRunScore(makeState({ miles: 1764, alive: 4, date: "1848-08-15" }));
    const slow = computeRunScore(makeState({ miles: 1764, alive: 4, date: "1848-10-15" }));
    expect(fast).toBeGreaterThan(slow);
    // and past the bonus horizon, slower stops costing (floor at 0)
    const crawl1 = computeRunScore(makeState({ miles: 1764, alive: 4, date: "1848-11-15" }));
    const crawl2 = computeRunScore(makeState({ miles: 1764, alive: 4, date: "1848-12-15" }));
    expect(crawl1).toBe(crawl2);
  });
});
