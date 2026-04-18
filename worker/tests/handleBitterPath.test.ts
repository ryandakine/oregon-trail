import { describe, it, expect } from "vitest";
import { handleBitterPath, handleBitterPathSkip, hashEvent } from "../src/index";
import { createInitialState } from "../src/state";
import { signState } from "../src/hmac";
import type { EventResponse, GameState, SignedGameState } from "../src/types";

const SECRET = "test-secret-for-handler-suite";
const MEMBERS = ["Bob", "Cara", "Dan"];
const ORIGIN = "*";

// Minimal env shape used by the handlers. No ANTHROPIC_API_KEY needed since
// these handlers never call the LLM; they only verify the submitted event
// against pending_event_hash and apply deterministic effects.
const ENV = {
  HMAC_SECRET: SECRET,
  ANTHROPIC_API_KEY: "unused",
  ALLOWED_ORIGIN: "*",
} as unknown as Parameters<typeof handleBitterPath>[1];

const LONG_NIGHT_EVENT: EventResponse = {
  title: "The Long Night",
  description: "Sarah was lost two nights past. Thomas sits by the cold stove and does not look up.",
  choices: [
    { label: "Pray, and starve with dignity.", consequences: {} },
    { label: "Travel on. Hope for game.", consequences: {} },
    { label: "Do what the trail demands.", consequences: {} },
  ],
  personality_effects: {},
  journal_entry: "We did what was left to us.",
};

// Seed a state ready for a bitter_path resolve: pending hash matches the event,
// bitter_path_taken = "none", food = 0, starvation_days = 5 (wasting variant),
// all members alive so consequences apply to someone.
async function makeBitterReadyState(): Promise<{ state: GameState; signed: SignedGameState; hash: string }> {
  const { state } = await createInitialState("Alice", MEMBERS, "farmer", "high", SECRET);
  state.supplies.food = 0;
  state.simulation.starvation_days = 5;
  state.simulation.bitter_path_taken = "none";
  const hash = await hashEvent(LONG_NIGHT_EVENT);
  state.simulation.pending_event_hash = hash;
  const signature = await signState(state, SECRET);
  return { state, signed: { state, signature }, hash };
}

function makeRequest(body: unknown, url = "https://worker.test/api/bitter_path"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleBitterPath — /api/bitter_path choice resolution", () => {
  it("choice 0 (dignified) — +8 morale per alive member, no food change, flag set", async () => {
    const { signed } = await makeBitterReadyState();
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT, choice_index: 0 });
    const res = await handleBitterPath(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; outcome: string };
    expect(body.outcome).toBe("dignified");
    expect(body.signed_state.state.simulation.bitter_path_taken).toBe("dignified");
    expect(body.signed_state.state.simulation.pending_event_hash).toBeNull();
    expect(body.signed_state.state.supplies.food).toBe(0);
    for (const m of body.signed_state.state.party.members) {
      if (m.alive) expect(m.morale).toBeGreaterThanOrEqual(Math.min(100, 50 + 8));
    }
  });

  it("choice 1 (hopeful) — +5 morale, +1 day, no food change, flag set", async () => {
    const { signed, state: originalState } = await makeBitterReadyState();
    const beforeDate = originalState.position.date;
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT, choice_index: 1 });
    const res = await handleBitterPath(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; outcome: string };
    expect(body.outcome).toBe("hopeful");
    expect(body.signed_state.state.simulation.bitter_path_taken).toBe("hopeful");
    expect(body.signed_state.state.position.date).not.toBe(beforeDate);
  });

  it("choice 2 (taken) — +60 food, starvation reset, -30 sanity, -20 morale, flag set", async () => {
    const { signed, state: before } = await makeBitterReadyState();
    const beforeMorale = new Map(before.party.members.filter(m => m.alive).map(m => [m.name, m.morale]));
    const beforeSanity = new Map(before.party.members.filter(m => m.alive).map(m => [m.name, m.sanity]));
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT, choice_index: 2 });
    const res = await handleBitterPath(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; outcome: string };
    expect(body.outcome).toBe("taken");
    expect(body.signed_state.state.simulation.bitter_path_taken).toBe("taken");
    expect(body.signed_state.state.supplies.food).toBe(60);
    expect(body.signed_state.state.simulation.starvation_days).toBe(0);
    for (const m of body.signed_state.state.party.members) {
      if (!m.alive) continue;
      const morBefore = beforeMorale.get(m.name) ?? 0;
      const sanBefore = beforeSanity.get(m.name) ?? 0;
      expect(m.morale, `morale for ${m.name}`).toBe(Math.max(0, Math.min(100, morBefore - 20)));
      expect(m.sanity, `sanity for ${m.name}`).toBe(Math.max(0, Math.min(100, sanBefore - 30)));
    }
  });

  it("rejects invalid choice_index with 400", async () => {
    const { signed } = await makeBitterReadyState();
    for (const idx of [-1, 3, 99, "bad", null]) {
      const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT, choice_index: idx });
      const res = await handleBitterPath(req, ENV, ORIGIN);
      expect(res.status, `choice_index=${idx}`).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe("invalid_choice_index");
    }
  });

  it("rejects mismatched event hash with 400 (anti-fabrication)", async () => {
    const { signed } = await makeBitterReadyState();
    const tampered: EventResponse = { ...LONG_NIGHT_EVENT, description: "fabricated alternative" };
    const req = makeRequest({ signed_state: signed, event: tampered, choice_index: 0 });
    const res = await handleBitterPath(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("event_hash_mismatch");
  });

  it("rejects already-resolved runs with 400 (replay guard)", async () => {
    const { state } = await makeBitterReadyState();
    state.simulation.bitter_path_taken = "taken";
    const signature = await signState(state, SECRET);
    const signed = { state, signature };
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT, choice_index: 0 });
    const res = await handleBitterPath(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("already_resolved");
  });
});

describe("handleBitterPathSkip — /api/bitter_path_skip refused path", () => {
  it("sets bitter_path_taken='refused', clears pending hash, no mechanical effects", async () => {
    const { signed, state: originalState } = await makeBitterReadyState();
    const foodBefore = originalState.supplies.food;
    const starvBefore = originalState.simulation.starvation_days;
    const moraleBefore = originalState.party.members.find(m => m.alive)?.morale;
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT });
    const res = await handleBitterPathSkip(req, ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; outcome: string };
    expect(body.outcome).toBe("refused");
    expect(body.signed_state.state.simulation.bitter_path_taken).toBe("refused");
    expect(body.signed_state.state.simulation.pending_event_hash).toBeNull();
    // Zero mechanical delta — not a reward, not a punishment
    expect(body.signed_state.state.supplies.food).toBe(foodBefore);
    expect(body.signed_state.state.simulation.starvation_days).toBe(starvBefore);
    const moraleAfter = body.signed_state.state.party.members.find(m => m.alive)?.morale;
    expect(moraleAfter).toBe(moraleBefore);
  });

  it("writes a skip-specific journal entry that does NOT reveal scene content", async () => {
    const { signed } = await makeBitterReadyState();
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT });
    const res = await handleBitterPathSkip(req, ENV, ORIGIN);
    const body = await res.json() as { signed_state: SignedGameState };
    const journal = body.signed_state.state.journal;
    expect(journal.length).toBeGreaterThan(0);
    const latest = journal[journal.length - 1];
    // Skip entry should NOT echo the event's graphic journal_entry
    expect(latest).not.toBe(LONG_NIGHT_EVENT.journal_entry);
    // Should describe the refusal in period voice
    expect(latest).toContain("turned away");
  });

  it("rejects mismatched event hash with 400", async () => {
    const { signed } = await makeBitterReadyState();
    const tampered: EventResponse = { ...LONG_NIGHT_EVENT, title: "Not The Long Night" };
    const req = makeRequest({ signed_state: signed, event: tampered });
    const res = await handleBitterPathSkip(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("event_hash_mismatch");
  });

  it("rejects already-resolved runs with 400 (can't skip after resolving)", async () => {
    const { state } = await makeBitterReadyState();
    state.simulation.bitter_path_taken = "dignified";
    const signature = await signState(state, SECRET);
    const signed = { state, signature };
    const req = makeRequest({ signed_state: signed, event: LONG_NIGHT_EVENT });
    const res = await handleBitterPathSkip(req, ENV, ORIGIN);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("already_resolved");
  });
});
