import { describe, it, expect } from "vitest";
import {
  createInitialState,
  verifyIncomingState,
  applyEventAndSign,
  applyStoreAndSign,
  getChallengeById,
  getCurrentChallenge,
  WEEKLY_CHALLENGES,
} from "../src/state";
import type { EventResponse, SignedGameState } from "../src/types";

const SECRET = "test-state-secret-do-not-use-in-prod";
const MEMBERS: [string, string, string, string] = ["Beth", "Carl", "Dana", "Earl"];

describe("createInitialState", () => {
  it("farmer starts with $400 (40000 cents)", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    expect(state.supplies.money).toBe(400_00);
  });

  it("carpenter starts with $800 (80000 cents)", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "carpenter", "medium", SECRET);
    expect(state.supplies.money).toBe(800_00);
  });

  it("banker starts with $1600 (160000 cents)", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    expect(state.supplies.money).toBe(1600_00);
  });

  it("all 5 members start at health/sanity/morale 100", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    expect(state.party.members).toHaveLength(5);
    for (const member of state.party.members) {
      expect(member.health).toBe(100);
      expect(member.sanity).toBe(100);
      expect(member.morale).toBe(100);
      expect(member.alive).toBe(true);
      expect(member.disease).toBeNull();
    }
  });

  it("leader is first member", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    expect(state.party.leader_name).toBe("Alice");
    expect(state.party.members[0].name).toBe("Alice");
  });

  it("sets correct defaults", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "high", SECRET);
    expect(state.position.current_segment_id).toBe("seg_01");
    expect(state.position.miles_traveled).toBe(0);
    expect(state.position.date).toBe("1848-04-15");
    expect(state.settings.pace).toBe("steady");
    expect(state.settings.rations).toBe("filling");
    expect(state.settings.tone_tier).toBe("high");
    expect(state.settings.challenge_id).toBeNull();
    expect(state.journal).toEqual([]);
    expect(state.deaths).toEqual([]);
    expect(state.simulation.starvation_days).toBe(0);
    expect(state.simulation.days_since_last_event).toBe(0);
    expect(state.simulation.resolved_crossings).toEqual([]);
    expect(state.simulation.visited_landmarks).toEqual([]);
    expect(state.simulation.pending_event_hash).toBeNull();
    expect(state.simulation.landmark_rest_used).toEqual([]);
    expect(state.meta.event_count).toBe(0);
    expect(state.meta.run_id).toBeTruthy();
  });
});

describe("verifyIncomingState", () => {
  it("passes on unmodified state", async () => {
    const signed = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const result = await verifyIncomingState(signed, SECRET);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.state.party.leader_name).toBe("Alice");
    }
  });

  it("fails on tampered state", async () => {
    const signed = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const tampered: SignedGameState = {
      state: { ...signed.state, supplies: { ...signed.state.supplies, money: 999999 } },
      signature: signed.signature,
    };
    const result = await verifyIncomingState(tampered, SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("invalid_signature");
    }
  });
});

function makeEvent(overrides: Partial<EventResponse> = {}): EventResponse {
  return {
    title: "Test Event",
    description: "Something happened.",
    choices: [
      {
        label: "Choice A",
        consequences: { food: -50, health: -10, days: 2 },
      },
      {
        label: "Choice B",
        consequences: { food: 10, morale: 5 },
      },
    ],
    personality_effects: {},
    journal_entry: "We faced a test event.",
    ...overrides,
  };
}

describe("applyEventAndSign", () => {
  it("negative food doesn't go below 0", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    state.supplies.food = 20;
    const event = makeEvent({
      choices: [{ label: "Lose food", consequences: { food: -100 } }],
    });
    const result = await applyEventAndSign(state, 0, event, SECRET);
    expect(result.state.supplies.food).toBe(0);
  });

  it("health=0 flips alive to false", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const event = makeEvent({
      choices: [{ label: "Deadly", consequences: { health: -100 } }],
    });
    const result = await applyEventAndSign(state, 0, event, SECRET);
    for (const member of result.state.party.members) {
      expect(member.health).toBe(0);
      expect(member.alive).toBe(false);
    }
  });

  it("personality effects target correct member by name", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const event = makeEvent({
      choices: [{ label: "Ok", consequences: {} }],
      personality_effects: {
        Beth: { sanity: -20, morale: -15 },
      },
    });
    const result = await applyEventAndSign(state, 0, event, SECRET);
    const beth = result.state.party.members.find((m) => m.name === "Beth")!;
    expect(beth.sanity).toBe(80);
    expect(beth.morale).toBe(85);

    // Others unaffected
    const alice = result.state.party.members.find((m) => m.name === "Alice")!;
    expect(alice.sanity).toBe(100);
    expect(alice.morale).toBe(100);
  });

  it("journal caps at 5 entries after 6+ events", async () => {
    let { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const event = makeEvent({
      choices: [{ label: "Ok", consequences: {} }],
    });

    for (let i = 0; i < 7; i++) {
      const e = { ...event, journal_entry: `Entry ${i}` };
      const result = await applyEventAndSign(state, 0, e, SECRET);
      state = result.state;
    }

    expect(state.journal).toHaveLength(5);
    expect(state.journal[0]).toBe("Entry 2");
    expect(state.journal[4]).toBe("Entry 6");
  });

  it("event_count increments", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    expect(state.meta.event_count).toBe(0);

    const event = makeEvent({
      choices: [{ label: "Ok", consequences: {} }],
    });
    const r1 = await applyEventAndSign(state, 0, event, SECRET);
    expect(r1.state.meta.event_count).toBe(1);

    const r2 = await applyEventAndSign(r1.state, 0, event, SECRET);
    expect(r2.state.meta.event_count).toBe(2);
  });

  it("date advances correctly", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const event = makeEvent({
      choices: [{ label: "Travel", consequences: { days: 5 } }],
    });
    const result = await applyEventAndSign(state, 0, event, SECRET);
    expect(result.state.position.date).toBe("1848-04-20");
  });

  it("applies morale consequence to all living members", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    // Kill one member first
    state.party.members[2].alive = false;
    state.party.members[2].health = 0;

    const event = makeEvent({
      choices: [{ label: "Boost", consequences: { morale: -30 } }],
    });
    const result = await applyEventAndSign(state, 0, event, SECRET);

    for (const member of result.state.party.members) {
      if (member.name === state.party.members[2].name) {
        expect(member.morale).toBe(100); // Dead member unchanged
      } else {
        expect(member.morale).toBe(70);
      }
    }
  });
});

describe("applyStoreAndSign", () => {
  it("computes cost server-side and adds supplies", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET);
    const result = await applyStoreAndSign(
      state,
      [
        { item: "food", quantity: 10 },      // 10 units * 30c = 300c, adds 100 lbs
        { item: "oxen", quantity: 3 },        // 3 yoke * 5000c = 15000c, adds 6 oxen
      ],
      SECRET,
    );
    expect(result.state.supplies.food).toBe(100);   // 10 * 10 lbs
    expect(result.state.supplies.oxen).toBe(6);      // 3 * 2 oxen
    expect(result.state.supplies.money).toBe(1600_00 - 300 - 15000);
  });

  it("rejects purchase exceeding available money", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    await expect(
      applyStoreAndSign(state, [{ item: "oxen", quantity: 100 }], SECRET)
    ).rejects.toThrow("insufficient_funds");
  });

  it("handles empty purchases", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    const result = await applyStoreAndSign(state, [], SECRET);
    expect(result.state.supplies.money).toBe(400_00);
  });
});

describe("full round-trip", () => {
  it("create -> verify -> apply event -> verify", async () => {
    // Create
    const signed = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);

    // Verify
    const v1 = await verifyIncomingState(signed, SECRET);
    expect(v1.valid).toBe(true);
    if (!v1.valid) throw new Error("unreachable");

    // Apply event
    const event = makeEvent({
      choices: [{ label: "Ford river", consequences: { food: -20, days: 1 } }],
      personality_effects: { Carl: { sanity: -5 } },
    });
    const afterEvent = await applyEventAndSign(v1.state, 0, event, SECRET);

    // Verify again
    const v2 = await verifyIncomingState(afterEvent, SECRET);
    expect(v2.valid).toBe(true);
    if (!v2.valid) throw new Error("unreachable");

    expect(v2.state.supplies.food).toBe(0); // started at 0, -20 clamped to 0
    expect(v2.state.position.date).toBe("1848-04-16");
    expect(v2.state.meta.event_count).toBe(1);
    expect(v2.state.journal).toEqual(["We faced a test event."]);

    const carl = v2.state.party.members.find((m) => m.name === "Carl")!;
    expect(carl.sanity).toBe(95);
  });
});

describe("weekly challenges", () => {
  it("getChallengeById returns correct challenge", () => {
    const c = getChallengeById("pacifist");
    expect(c).toBeDefined();
    expect(c!.no_hunting).toBe(true);
    expect(c!.no_ammo).toBe(true);
  });

  it("getChallengeById returns undefined for unknown id", () => {
    expect(getChallengeById("nonexistent")).toBeUndefined();
  });

  it("getCurrentChallenge returns a valid challenge", () => {
    const c = getCurrentChallenge();
    expect(c).toBeDefined();
    expect(c.id).toBeTruthy();
    expect(WEEKLY_CHALLENGES).toContain(c);
  });

  it("half_rations challenge halves starting money", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "banker", "medium", SECRET, "half_rations");
    expect(state.supplies.money).toBe(Math.floor(1600_00 * 0.5));
    expect(state.settings.challenge_id).toBe("half_rations");
  });

  it("penny_pinch challenge quarters starting money", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET, "penny_pinch");
    expect(state.supplies.money).toBe(Math.floor(400_00 * 0.25));
    expect(state.settings.challenge_id).toBe("penny_pinch");
  });

  it("speed_run forces grueling pace", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET, "speed_run");
    expect(state.settings.pace).toBe("grueling");
    expect(state.settings.challenge_id).toBe("speed_run");
  });

  it("bare_bones forces bare_bones rations", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET, "bare_bones");
    expect(state.settings.rations).toBe("bare_bones");
  });

  it("nightmare forces high tone", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "low", SECRET, "nightmare");
    expect(state.settings.tone_tier).toBe("high");
  });

  it("starvation_march forces pace + rations + reduces money", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "carpenter", "medium", SECRET, "starvation_march");
    expect(state.settings.pace).toBe("grueling");
    expect(state.settings.rations).toBe("meager");
    expect(state.supplies.money).toBe(Math.floor(800_00 * 0.75));
  });

  it("null challengeId produces normal game", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET, null);
    expect(state.settings.challenge_id).toBeNull();
    expect(state.supplies.money).toBe(400_00);
    expect(state.settings.pace).toBe("steady");
  });

  it("undefined challengeId produces normal game", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    expect(state.settings.challenge_id).toBeNull();
    expect(state.supplies.money).toBe(400_00);
  });

  it("unknown challengeId produces normal game (no crash)", async () => {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET, "fake_challenge");
    expect(state.settings.challenge_id).toBe("fake_challenge");
    expect(state.supplies.money).toBe(400_00);
  });
});
