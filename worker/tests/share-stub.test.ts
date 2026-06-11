import { describe, it, expect } from "vitest";
import {
  createShareStub,
  verifyShareStub,
  sanitizeShareName,
  MAX_STUB_ID_LENGTH,
} from "../src/share-stub";
import type { StubPayload } from "../src/share-stub";
import type { GameState } from "../src/types";

// Stub contract suite (PHASE2_BIG_BETS_PLAN.md Bet 1): the id IS the data.
// Round-trip, tamper, oversize-DoS, name sanitization, id-length bound.

const ENV = { HMAC_SECRET: "share-stub-test-secret" };

function makeTerminalState(overrides: Partial<GameState> = {}): GameState {
  return {
    party: {
      leader_name: "Alice",
      members: [
        { name: "Alice", health: 80, alive: true, sanity: 70, morale: 60, disease: null },
        { name: "Bob", health: 60, alive: true, sanity: 50, morale: 50, disease: null },
        { name: "Carol", health: 40, alive: true, sanity: 40, morale: 40, disease: null },
        { name: "Dave", health: 0, alive: false, sanity: 0, morale: 0, disease: null },
        { name: "Eve", health: 0, alive: false, sanity: 0, morale: 0, disease: null },
      ],
    },
    supplies: { food: 50, ammo: 10, clothing: 2, spare_parts: 1, medicine: 0, money: 1000, oxen: 6 },
    position: {
      current_segment_id: "seg_16",
      miles_traveled: 1764,
      date: "1848-09-12", // 150 days after 1848-04-15
    },
    settings: { pace: "steady", rations: "filling", tone_tier: "high", challenge_id: "speed_run" },
    journal: [],
    deaths: [
      { name: "Dave", date: "1848-07-01", cause: "cholera", epitaph: null },
      { name: "Eve", date: "1848-08-01", cause: "drowning", epitaph: null },
    ],
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
    },
    meta: { run_id: "stub-test-run", event_count: 10 },
    ...overrides,
  };
}

function decodePayloadPart(id: string): { json: string; mac: string } {
  const [payload, mac] = id.split(".");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return { json: atob(padded), mac };
}

function encodePayloadPart(json: string): string {
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("share stub — round-trip", () => {
  it("create → verify returns the exact payload for an arrival state", async () => {
    const state = makeTerminalState();
    const id = await createShareStub(state, 2864, ENV);
    const stub: StubPayload | null = await verifyShareStub(id, ENV);
    expect(stub).not.toBeNull();
    expect(stub).toEqual({
      v: 1,
      o: "arrival",
      m: 1764,
      s: 3,
      p: 5,
      d: 150,
      t: "high",
      n: "Alice",
      c: "speed_run",
      sc: 2864,
    });
  });

  it("an all-dead state round-trips as a wipe", async () => {
    const state = makeTerminalState();
    for (const m of state.party.members) m.alive = false;
    state.position.miles_traveled = 412;
    const id = await createShareStub(state, 412, ENV);
    const stub = await verifyShareStub(id, ENV);
    expect(stub?.o).toBe("wipe");
    expect(stub?.s).toBe(0);
    expect(stub?.m).toBe(412);
  });

  it("t comes from state.settings.tone_tier", async () => {
    const state = makeTerminalState();
    state.settings.tone_tier = "low";
    const stub = await verifyShareStub(await createShareStub(state, 1, ENV), ENV);
    expect(stub?.t).toBe("low");
  });

  it("null challenge_id survives the round-trip as null", async () => {
    const state = makeTerminalState();
    state.settings.challenge_id = null;
    const stub = await verifyShareStub(await createShareStub(state, 1, ENV), ENV);
    expect(stub?.c).toBeNull();
  });
});

describe("share stub — tamper rejection", () => {
  it("rejects a payload edited after signing (score inflation)", async () => {
    const id = await createShareStub(makeTerminalState(), 100, ENV);
    const { json, mac } = decodePayloadPart(id);
    const inflated = json.replace('"sc":100', '"sc":999999');
    expect(inflated).not.toBe(json); // sanity: the replace really hit
    const forged = `${encodePayloadPart(inflated)}.${mac}`;
    expect(await verifyShareStub(forged, ENV)).toBeNull();
  });

  it("rejects a tampered MAC", async () => {
    const id = await createShareStub(makeTerminalState(), 100, ENV);
    const [payload, mac] = id.split(".");
    const flipped = mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A");
    expect(await verifyShareStub(`${payload}.${flipped}`, ENV)).toBeNull();
  });

  it("rejects a stub signed under a different secret", async () => {
    const id = await createShareStub(makeTerminalState(), 100, { HMAC_SECRET: "other-secret" });
    expect(await verifyShareStub(id, ENV)).toBeNull();
  });

  it("rejects structural garbage without throwing", async () => {
    for (const bad of ["", "no-dot-here", "a.b.c", ".", "x.", ".y", "!!!.???"]) {
      expect(await verifyShareStub(bad, ENV), `id=${JSON.stringify(bad)}`).toBeNull();
    }
  });
});

describe("share stub — oversize DoS cap", () => {
  it("rejects an id over the 600-char cap before decoding", async () => {
    expect(await verifyShareStub("a".repeat(MAX_STUB_ID_LENGTH + 1), ENV)).toBeNull();
  });

  it("rejects a valid stub padded past the cap", async () => {
    const id = await createShareStub(makeTerminalState(), 100, ENV);
    const padded = id + "A".repeat(MAX_STUB_ID_LENGTH - id.length + 1);
    expect(padded.length).toBeGreaterThan(MAX_STUB_ID_LENGTH);
    expect(await verifyShareStub(padded, ENV)).toBeNull();
  });
});

describe("share stub — name sanitization", () => {
  it("strips disallowed chars, collapses whitespace, caps at 16", () => {
    expect(sanitizeShareName("O'Malley-Smith Jr.")).toBe("O'Malley-Smith J");
    expect(sanitizeShareName("Ann    Marie")).toBe("Ann Marie");
    expect(sanitizeShareName('<img src=x> Bob "1"')).toBe("img srcx Bob");
    expect(sanitizeShareName("12345!@#$%")).toBe("A pioneer");
    expect(sanitizeShareName("")).toBe("A pioneer");
  });

  it("uses the leader's FIRST name, sanitized", async () => {
    const state = makeTerminalState();
    state.party.leader_name = "Mary Anne Bryant";
    const stub = await verifyShareStub(await createShareStub(state, 1, ENV), ENV);
    expect(stub?.n).toBe("Mary");
  });

  it("falls back to 'A pioneer' when nothing survives sanitization", async () => {
    const state = makeTerminalState();
    state.party.leader_name = "12345";
    const stub = await verifyShareStub(await createShareStub(state, 1, ENV), ENV);
    expect(stub?.n).toBe("A pioneer");
  });
});

describe("share stub — id length bound", () => {
  it("stays comfortably under the verify cap with worst-case fields", async () => {
    const state = makeTerminalState();
    state.party.leader_name = "Maximilianovitch Q"; // 16-char first name after cap
    state.settings.challenge_id = "starvation_march"; // longest real challenge id
    state.position.miles_traveled = 99999;
    const id = await createShareStub(state, 99999999, ENV);
    expect(id.length).toBeLessThanOrEqual(300); // plan expects ≈230
    expect(id.length).toBeLessThanOrEqual(MAX_STUB_ID_LENGTH);
    expect(await verifyShareStub(id, ENV)).not.toBeNull();
  });
});
