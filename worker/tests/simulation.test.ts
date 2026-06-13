import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { advanceDays } from "../src/simulation";
import type { GameState, HistoricalContext, PendingEffect } from "../src/types";
import ctx from "../src/historical-context.json";

const historical = ctx as unknown as HistoricalContext;

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    state_version: 2,
    party: {
      leader_name: "Alice",
      members: [
        { name: "Alice", health: 100, alive: true, sanity: 100, morale: 100, disease: null },
        { name: "Bob", health: 100, alive: true, sanity: 100, morale: 100, disease: null },
        { name: "Carol", health: 100, alive: true, sanity: 100, morale: 100, disease: null },
        { name: "Dave", health: 100, alive: true, sanity: 100, morale: 100, disease: null },
        { name: "Eve", health: 100, alive: true, sanity: 100, morale: 100, disease: null },
      ],
    },
    supplies: {
      food: 500,
      ammo: 100,
      clothing: 5,
      spare_parts: 3,
      medicine: 10,
      money: 40000,
      oxen: 6,
    },
    position: {
      current_segment_id: "seg_01",
      miles_traveled: 0,
      date: "1848-04-15",
    },
    settings: {
      pace: "steady",
      rations: "filling",
      tone_tier: "medium",
      challenge_id: null,
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
      run_id: "test-run",
      event_count: 0,
    },
    ...overrides,
  };
}

describe("advanceDays - pace and miles", () => {
  beforeEach(() => {
    // Suppress random events/diseases by making Math.random always return 1
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("steady pace advances ~12 miles per day", () => {
    const state = makeState();
    // Put far from any landmarks/rivers to avoid triggers
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 0;
    state.settings.pace = "steady";

    const result = advanceDays(state, historical);
    // Should advance for multiple days since no triggers
    expect(result.summaries.length).toBeGreaterThan(0);
    // Each day should be roughly 12 miles (modified by weather)
    for (const summary of result.summaries) {
      // Allow for weather modifier: 12 * 0.7 = ~8 to 12 * 1.0 = 12
      expect(summary.miles).toBeGreaterThanOrEqual(8);
      expect(summary.miles).toBeLessThanOrEqual(20);
    }
  });

  it("strenuous pace advances ~16 miles per day", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 0;
    state.settings.pace = "strenuous";

    const result = advanceDays(state, historical);
    expect(result.summaries.length).toBeGreaterThan(0);
    for (const summary of result.summaries) {
      expect(summary.miles).toBeGreaterThanOrEqual(11);
      expect(summary.miles).toBeLessThanOrEqual(20);
    }
  });

  it("grueling pace advances ~20 miles per day", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 0;
    state.settings.pace = "grueling";

    const result = advanceDays(state, historical);
    expect(result.summaries.length).toBeGreaterThan(0);
    for (const summary of result.summaries) {
      expect(summary.miles).toBeGreaterThanOrEqual(14);
      expect(summary.miles).toBeLessThanOrEqual(24);
    }
  });
});

describe("advanceDays - food consumption", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filling rations consumes 1.5 per alive member per day (Phase C v3: was 2)", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.settings.rations = "filling";
    state.supplies.food = 500;

    const result = advanceDays(state, historical);
    // 5 alive members * 1.5 = 7.5 food per day after Phase C v3 tune
    for (const summary of result.summaries) {
      expect(summary.food_consumed).toBe(7.5);
    }
  });

  it("meager rations consumes 1.2 per alive member per day (Phase C v3: was 1.5)", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.settings.rations = "meager";
    state.supplies.food = 500;

    const result = advanceDays(state, historical);
    // 5 alive * 1.2 = 6 food per day after Phase C v3 tune
    for (const summary of result.summaries) {
      expect(summary.food_consumed).toBe(6);
    }
  });

  it("bare_bones rations consumes 1 per alive member per day", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.settings.rations = "bare_bones";
    state.supplies.food = 500;

    const result = advanceDays(state, historical);
    for (const summary of result.summaries) {
      expect(summary.food_consumed).toBe(5); // 5 * 1
    }
  });
});

describe("advanceDays - starvation", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starvation kicks in after 4 days of food=0 (Phase B grace: was 3)", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.supplies.food = 0;
    state.simulation.starvation_days = 3; // Already 3 days starving — one more and damage

    const result = advanceDays(state, historical);
    // After first sim day, starvation_days = 4, health should drop
    expect(result.state.simulation.starvation_days).toBeGreaterThanOrEqual(4);
    const healthDrop = result.state.party.members.some((m) => m.health < 100);
    expect(healthDrop).toBe(true);
  });

  it("Phase B grace: starvation day 3 is one sim-day short of damage", () => {
    // advanceDays loops 5 sim days per call, so this test verifies the GATE
    // position changed: with STARVATION_GRACE_DAYS=4, the 3→4 transition during
    // the loop is when damage starts. Starting at starvation_days=0 + food=0,
    // the first starvation event should appear on sim-day 4 of the 5-day loop
    // (previously appeared on sim-day 3).
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.supplies.food = 0;
    state.simulation.starvation_days = 0; // fresh 5-day starving window

    const result = advanceDays(state, historical);
    // Find the first day in summaries with a "Starvation" event
    let firstStarvationDayIdx = -1;
    for (let i = 0; i < result.summaries.length; i++) {
      if (result.summaries[i].events.some((e) => e.toLowerCase().includes("starvation"))) {
        firstStarvationDayIdx = i;
        break;
      }
    }
    // With grace=4, starvation_days counter goes 1, 2, 3, 4 across sim-days 1-4,
    // so the "Starvation" event fires on sim-day 4 (index 3). Previously with
    // grace=3 it fired on sim-day 3 (index 2).
    expect(firstStarvationDayIdx).toBeGreaterThanOrEqual(3);
  });

  it("starvation days reset when food is available", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.supplies.food = 500;
    state.simulation.starvation_days = 5;

    const result = advanceDays(state, historical);
    expect(result.state.simulation.starvation_days).toBe(0);
  });
});

describe("advanceDays - disease", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disease check respects probability (all random=0 triggers disease)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 0;

    const result = advanceDays(state, historical);
    // With random=0, at least one member should get sick
    const sickMembers = result.state.party.members.filter(
      (m) => m.alive && m.disease !== null,
    );
    expect(sickMembers.length).toBeGreaterThan(0);
  });

  it("disease probability multiplier (Phase B): mid-range random no longer triggers", () => {
    // With DISEASE_PROBABILITY_MULTIPLIER=0.7, a random value that used to trigger
    // now doesn't. Example: dysentery base_prob 0.03, region+month risk 1.5 → pre-B
    // threshold 0.045, post-B threshold 0.0315. random=0.040 is in the gap.
    vi.spyOn(Math, "random").mockReturnValue(0.040);
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 0;

    const result = advanceDays(state, historical);
    // With random=0.040 and the 0.7 multiplier, NO disease should fire for
    // low-base-probability diseases. The cap is at base*risk*0.7 ~ 0.0315.
    const sickMembers = result.state.party.members.filter(
      (m) => m.alive && m.disease !== null,
    );
    expect(sickMembers.length).toBe(0);
  });

  it("disease check with high random never triggers disease", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 0;

    const result = advanceDays(state, historical);
    const sickMembers = result.state.party.members.filter(
      (m) => m.disease !== null,
    );
    expect(sickMembers.length).toBe(0);
  });
});

describe("advanceDays - death trigger", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("death triggers when health reaches 0", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    // Set one member to very low health with starvation about to kick in
    state.party.members[1].health = 1;
    state.supplies.food = 0;
    state.simulation.starvation_days = 5; // Already deep in starvation
    state.settings.pace = "grueling"; // Extra health drain

    const result = advanceDays(state, historical);
    // Bob should die from health reaching 0
    expect(result.trigger).toBe("death");
    expect(result.state.deaths.length).toBeGreaterThan(0);
    const bob = result.state.party.members.find((m) => m.name === "Bob")!;
    expect(bob.alive).toBe(false);
    expect(bob.health).toBe(0);
  });
});

describe("advanceDays - landmark trigger", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("landmark trigger fires at correct mile marker", () => {
    // Kansas River landmark is at mile 83
    // With steady pace (~12mi/day), after ~7 days we should reach it
    const state = makeState();
    state.position.miles_traveled = 75;
    state.position.current_segment_id = "seg_01";
    state.simulation.visited_landmarks = ["lm_independence"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river"];
    state.simulation.days_since_last_event = 0;
    state.settings.pace = "steady";

    const result = advanceDays(state, historical);
    expect(result.trigger).toBe("landmark");
    expect(result.triggerData).toHaveProperty("landmark_id");
  });
});

describe("advanceDays - arrival trigger", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("arrival triggers at total trail distance", () => {
    const state = makeState();
    // Put very close to end
    state.position.miles_traveled = 1760;
    state.position.current_segment_id = "seg_16";
    state.simulation.visited_landmarks = historical.landmarks.map((l) => l.id);
    // Resolve all crossings
    const allCrossings = historical.segments.flatMap((s) => s.river_crossings.map((rc) => rc.id));
    state.simulation.resolved_crossings = allCrossings;
    state.simulation.days_since_last_event = 0;

    const result = advanceDays(state, historical);
    expect(result.trigger).toBe("arrival");
  });
});

describe("advanceDays - wipe trigger", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wipe triggers when all dead", () => {
    const state = makeState();
    // Kill all members
    for (const member of state.party.members) {
      member.alive = false;
      member.health = 0;
    }

    const result = advanceDays(state, historical);
    expect(result.trigger).toBe("wipe");
    expect(result.summaries.length).toBe(0);
  });
});

describe("advanceDays - event trigger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("event trigger respects days_since_last_event >= 5 guarantee", () => {
    // With random returning 1 (> 0.3), events should only trigger at >= 5 days
    vi.spyOn(Math, "random").mockReturnValue(1);

    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 4; // Will become 5 after first day

    const result = advanceDays(state, historical);
    // With random=1, the random < 0.3 check fails, so event only fires at >= 5
    expect(result.trigger).toBe("event");
    expect(result.state.simulation.days_since_last_event).toBeGreaterThanOrEqual(5);
  });

  it("event trigger fires early when random < 0.3 and days >= 2", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // < 0.3

    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.simulation.days_since_last_event = 1; // Will become 2 after first day

    const result = advanceDays(state, historical);
    // Random=0.1 will also trigger disease (random=0 check), but disease
    // shouldn't prevent event trigger. The event fires once days_since >= 2 and random < 0.3
    if (result.trigger === "death") {
      // Disease + death may preempt event - that's valid
      expect(result.state.deaths.length).toBeGreaterThan(0);
    } else {
      expect(result.trigger).toBe("event");
    }
  });
});

describe("advanceDays - date advancement", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("date advances by the number of days simulated", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.position.date = "1848-04-15";
    state.simulation.days_since_last_event = 4;

    const result = advanceDays(state, historical);
    const daysAdvanced = result.summaries.length;
    const expectedDate = new Date("1848-04-15T12:00:00Z");
    expectedDate.setUTCDate(expectedDate.getUTCDate() + daysAdvanced);
    expect(result.state.position.date).toBe(expectedDate.toISOString().split("T")[0]);
  });
});

describe("advanceDays - grueling pace effects", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grueling pace reduces health and morale", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.settings.pace = "grueling";
    state.simulation.days_since_last_event = 4;

    const result = advanceDays(state, historical);
    const daysSimulated = result.summaries.length;
    // Each day: -2 health, -3 morale
    for (const member of result.state.party.members) {
      if (member.alive) {
        expect(member.health).toBe(100 - 2 * daysSimulated);
        expect(member.morale).toBe(100 - 3 * daysSimulated);
      }
    }
  });
});

describe("advanceDays - Bitter Path trigger", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeBitterEligibleState(): GameState {
    const state = makeState();
    state.settings.tone_tier = "high";
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.supplies.food = 0;
    // Wasting variant: 5+ starvation days
    state.simulation.starvation_days = 5;
    // Recent death: yesterday
    state.position.date = "1848-05-10";
    state.deaths.push({ name: "Bob", date: "1848-05-09", cause: "exhaustion", epitaph: null });
    return state;
  }

  it("fires bitter_path trigger on wasting variant (starvation_days >= 5) with recent death", () => {
    const state = makeBitterEligibleState();
    const result = advanceDays(state, historical);
    expect(result.trigger).toBe("bitter_path");
    const td = result.triggerData as { dead_member_name: string; trigger_variant: string };
    expect(td.dead_member_name).toBe("Bob");
    expect(td.trigger_variant).toBe("wasting");
  });

  it("fires bitter_path trigger on failing variant (food=0 + starvation>=2 + avg_health<40)", () => {
    const state = makeBitterEligibleState();
    state.simulation.starvation_days = 2; // not yet wasting
    for (const m of state.party.members) m.health = 35; // failing
    const result = advanceDays(state, historical);
    expect(result.trigger).toBe("bitter_path");
    const td = result.triggerData as { trigger_variant: string };
    expect(td.trigger_variant).toBe("failing");
  });

  it("does NOT fire on medium or low tone tier", () => {
    const state = makeBitterEligibleState();
    state.settings.tone_tier = "medium";
    const result = advanceDays(state, historical);
    expect(result.trigger).not.toBe("bitter_path");
  });

  it("does NOT fire when bitterPathEnabled is false (kill switch)", () => {
    const state = makeBitterEligibleState();
    const result = advanceDays(state, historical, { bitterPathEnabled: false });
    expect(result.trigger).not.toBe("bitter_path");
  });

  it("does NOT fire after bitter_path_taken is set to anything other than 'none'", () => {
    const state = makeBitterEligibleState();
    state.simulation.bitter_path_taken = "taken";
    const result = advanceDays(state, historical);
    expect(result.trigger).not.toBe("bitter_path");
  });

  it("does NOT fire without a recent death (within 3 game-days)", () => {
    const state = makeBitterEligibleState();
    // Push the death 10 days ago
    state.deaths[0].date = "1848-04-30";
    const result = advanceDays(state, historical);
    expect(result.trigger).not.toBe("bitter_path");
  });
});

describe("advanceDays - river trigger", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("river trigger fires when reaching an unresolved crossing", () => {
    // Wakarusa Creek is at mile 27 in seg_01
    const state = makeState();
    state.position.miles_traveled = 20;
    state.position.current_segment_id = "seg_01";
    state.simulation.visited_landmarks = ["lm_independence"];
    state.simulation.resolved_crossings = [];
    state.simulation.days_since_last_event = 0;

    const result = advanceDays(state, historical);
    // Should reach mile 27 and trigger river
    expect(result.trigger).toBe("river");
    expect(result.triggerData).toHaveProperty("id");
  });
});

describe("advanceDays - pending_effects drain", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Open stretch in seg_03 with all nearby landmarks/crossings cleared, so the
  // only trigger that can fire is the event check — letting us advance exactly
  // one sim-day at a time by parking days_since_last_event at the >=5 guarantee.
  function makeOpenState(): GameState {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    return state;
  }

  it("effect does NOT fire early, fires on the scheduled day, clamped by CONSEQUENCE_BOUNDS", () => {
    const state = makeOpenState();
    state.simulation.days_since_last_event = 4; // event triggers after the 1st sim-day
    const effect: PendingEffect = {
      id: "fester",
      days_remaining: 2,
      consequences: { health: -999 }, // exceeds the health bound (-40)
      source: "Snakebite",
      member_name: "Alice",
    };
    state.simulation.pending_effects = [effect];

    // Advance #1 — exactly one sim-day. days_remaining 2 -> 1, NOT fired.
    const r1 = advanceDays(state, historical);
    expect(r1.summaries).toHaveLength(1);
    expect(r1.state.party.members.find((m) => m.name === "Alice")!.health).toBe(100);
    expect(r1.state.simulation.pending_effects).toHaveLength(1);
    expect(r1.state.simulation.pending_effects[0].days_remaining).toBe(1);

    // Advance #2 — one more sim-day. days_remaining 1 -> 0, FIRES.
    const r2 = advanceDays(r1.state, historical);
    // 100 + clamp(-999) === 100 - 40 === 60. Unclamped would be 0 (dead).
    expect(r2.state.party.members.find((m) => m.name === "Alice")!.health).toBe(60);
    expect(r2.state.simulation.pending_effects).toHaveLength(0);
  });

  it("a lethal delayed effect ends the run the same day, before the event-trigger check", () => {
    const state = makeOpenState();
    state.simulation.days_since_last_event = 4; // an event WOULD fire this day if not preempted
    const bob = state.party.members.find((m) => m.name === "Bob")!;
    bob.health = 30; // a single clamped blow (-40) is lethal
    const effect: PendingEffect = {
      id: "wound",
      days_remaining: 1,
      consequences: { health: -999 },
      source: "Festering wound",
      member_name: "Bob",
    };
    state.simulation.pending_effects = [effect];

    const result = advanceDays(state, historical);

    // Death short-circuits the day BEFORE the event check would have fired.
    expect(result.trigger).toBe("death");
    const bobAfter = result.state.party.members.find((m) => m.name === "Bob")!;
    expect(bobAfter.alive).toBe(false);
    expect(bobAfter.health).toBe(0);
    expect(
      result.state.deaths.some((d) => d.name === "Bob" && d.cause === "Festering wound"),
    ).toBe(true);
    expect(result.state.simulation.pending_effects).toHaveLength(0);
  });

  it("member_name targets one member; others are untouched", () => {
    const state = makeOpenState();
    state.simulation.days_since_last_event = 4;
    state.simulation.pending_effects = [{
      id: "bob-only",
      days_remaining: 1,
      consequences: { health: -20, morale: -15 },
      source: "Bad dream",
      member_name: "Bob",
    }];

    const r = advanceDays(state, historical);
    const bob = r.state.party.members.find((m) => m.name === "Bob")!;
    const alice = r.state.party.members.find((m) => m.name === "Alice")!;
    expect(bob.health).toBe(80);
    expect(bob.morale).toBe(85);
    expect(alice.health).toBe(100);
    expect(alice.morale).toBe(100);
  });

  it("an untargeted effect hits all living members (event semantics)", () => {
    const state = makeOpenState();
    state.simulation.days_since_last_event = 4;
    state.party.members[2].alive = false; // Carol is dead
    state.party.members[2].health = 0;
    state.simulation.pending_effects = [{
      id: "all",
      days_remaining: 1,
      consequences: { morale: -10 },
      source: "Grim news",
    }];

    const r = advanceDays(state, historical);
    for (const m of r.state.party.members) {
      if (m.name === "Carol") expect(m.morale).toBe(100); // dead member untouched
      else expect(m.morale).toBe(90);
    }
  });

  it("clamps morale on the drain path too (not just health)", () => {
    const state = makeOpenState();
    state.simulation.days_since_last_event = 4;
    state.simulation.pending_effects = [{
      id: "despair",
      days_remaining: 1,
      consequences: { morale: -999 }, // exceeds the morale bound (-30)
      source: "Despair",
      member_name: "Alice",
    }];

    const r = advanceDays(state, historical);
    // 100 + clamp(-999) === 100 - 30 === 70. Unclamped would floor at 0.
    expect(r.state.party.members.find((m) => m.name === "Alice")!.morale).toBe(70);
  });

  it("fires once on the correct day within a single multi-day advance (no double-decrement)", () => {
    const state = makeOpenState();
    // Low days_since_last_event + cleared landmarks/crossings → the loop runs the
    // full 5 sim-days (the event only fires at the day-5 guarantee), so the effect
    // is decremented across iterations of ONE advanceDays call.
    state.simulation.days_since_last_event = 0;
    state.simulation.pending_effects = [{
      id: "rot",
      days_remaining: 3,
      consequences: { health: -10 },
      source: "Slow rot",
      member_name: "Alice",
    }];

    const r = advanceDays(state, historical);
    expect(r.summaries).toHaveLength(5);
    // Decrements 3→2→1→0: fires exactly once on the 3rd sim-day. 100 - 10 = 90.
    expect(r.state.party.members.find((m) => m.name === "Alice")!.health).toBe(90);
    expect(r.state.simulation.pending_effects).toHaveLength(0);
  });
});
