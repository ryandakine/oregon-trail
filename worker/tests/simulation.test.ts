import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { advanceDays } from "../src/simulation";
import type { GameState, HistoricalContext } from "../src/types";
import ctx from "../src/historical-context.json";

const historical = ctx as unknown as HistoricalContext;

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
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

  it("filling rations consumes 3 per alive member per day", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.settings.rations = "filling";
    state.supplies.food = 500;

    const result = advanceDays(state, historical);
    // 5 alive members * 3 = 15 food per day
    for (const summary of result.summaries) {
      expect(summary.food_consumed).toBe(15);
    }
  });

  it("meager rations consumes 2 per alive member per day", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.settings.rations = "meager";
    state.supplies.food = 500;

    const result = advanceDays(state, historical);
    for (const summary of result.summaries) {
      expect(summary.food_consumed).toBe(10); // 5 * 2
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

  it("starvation kicks in after 3 days of food=0", () => {
    const state = makeState();
    state.position.miles_traveled = 320;
    state.position.current_segment_id = "seg_03";
    state.simulation.visited_landmarks = ["lm_independence", "lm_kansas_river", "lm_alcove_spring", "lm_fort_kearney"];
    state.simulation.resolved_crossings = ["rc_wakarusa_creek", "rc_kansas_river", "rc_big_blue_river", "rc_little_blue_river_multiple_fords"];
    state.supplies.food = 0;
    state.simulation.starvation_days = 2; // Already 2 days starving

    const result = advanceDays(state, historical);
    // After first day, starvation_days = 3, health/morale should drop
    expect(result.state.simulation.starvation_days).toBeGreaterThanOrEqual(3);
    // At least one member should have lost health from starvation
    const healthDrop = result.state.party.members.some((m) => m.health < 100);
    expect(healthDrop).toBe(true);
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
