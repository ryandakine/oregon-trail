import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeDelayedEffects,
  FALLBACK_EVENTS,
  MAX_DELAYED_PER_CHOICE,
  DELAY_MIN_DAYS,
  DELAY_MAX_DAYS,
} from "../src/anthropic";
import {
  handleChoice,
  handleCamp,
  hashEvent,
  enqueueChoiceDelayedEffects,
  type Env,
} from "../src/index";
import { createInitialState, verifyIncomingState, clampConsequences } from "../src/state";
import { signState } from "../src/hmac";
import type { EventResponse, GameState, SignedGameState } from "../src/types";

// Consequences pillar — delayed effects (fuses) via pending_effects.
// See docs/design/consequences-pillar.md.

const SECRET = "delayed-effects-test-secret";
const MEMBERS: [string, string, string, string] = ["Bob", "Cara", "Dan", "Ellen"];
const ORIGIN = "*";
const ENV: Env = { HMAC_SECRET: SECRET, ANTHROPIC_API_KEY: "unused", ALLOWED_ORIGIN: "*" };

function makeRequest(body: unknown, path: string): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function sign(state: GameState): Promise<SignedGameState> {
  return { state, signature: await signState(state, SECRET) };
}

// ── sanitizeDelayedEffects (mint-time guard) ────────────────────────────────
describe("sanitizeDelayedEffects", () => {
  it("returns undefined for non-array / empty input", () => {
    expect(sanitizeDelayedEffects(undefined)).toBeUndefined();
    expect(sanitizeDelayedEffects("nope")).toBeUndefined();
    expect(sanitizeDelayedEffects([])).toBeUndefined();
  });

  it(`truncates count to MAX_DELAYED_PER_CHOICE (${MAX_DELAYED_PER_CHOICE})`, () => {
    const many = Array.from({ length: 6 }, () => ({ days_remaining: 3, consequences: { health: -5 } }));
    const out = sanitizeDelayedEffects(many)!;
    expect(out).toHaveLength(MAX_DELAYED_PER_CHOICE);
  });

  it("clamps days_remaining to [1,14], rounds, and defaults missing/invalid to 3", () => {
    const out = sanitizeDelayedEffects([
      { days_remaining: 99, consequences: { health: -5 } },   // > max
      { days_remaining: 0, consequences: { health: -5 } },    // <= 0 -> floor 1
      { days_remaining: 2.7, consequences: { health: -5 } },  // rounds to 3
    ])!;
    expect(out[0].days_remaining).toBe(DELAY_MAX_DAYS);
    expect(out[1].days_remaining).toBe(DELAY_MIN_DAYS);
    expect(out[2].days_remaining).toBe(3);
    // missing days_remaining defaults to 3
    expect(sanitizeDelayedEffects([{ consequences: { health: -5 } }])![0].days_remaining).toBe(3);
  });

  it("throws on an invalid consequence key (same rule as immediate effects)", () => {
    expect(() => sanitizeDelayedEffects([{ days_remaining: 2, consequences: { bogus: -5 } }])).toThrow(
      /invalid consequence key/,
    );
  });

  it("strips miles/days from a fuse's consequences (drain ignores them)", () => {
    const out = sanitizeDelayedEffects([
      { days_remaining: 2, consequences: { health: -10, miles: 5, days: 2 } },
    ])!;
    expect(out[0].consequences).toEqual({ health: -10 });
    expect("miles" in out[0].consequences).toBe(false);
    expect("days" in out[0].consequences).toBe(false);
  });

  it("drops a fuse whose consequences are only miles/days (empty after strip)", () => {
    expect(sanitizeDelayedEffects([{ days_remaining: 2, consequences: { miles: 5, days: 2 } }])).toBeUndefined();
    // mixed input: the empty-after-strip fuse is dropped; the real one survives
    const out = sanitizeDelayedEffects([
      { days_remaining: 2, consequences: { miles: 5 } },
      { days_remaining: 2, consequences: { health: -8 } },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].consequences).toEqual({ health: -8 });
  });

  it("caps on VALID output: 3 valid fuses survive even past leading junk", () => {
    const out = sanitizeDelayedEffects([
      null, "junk", { nope: true },
      { days_remaining: 2, consequences: { health: -1 } },
      { days_remaining: 2, consequences: { health: -2 } },
      { days_remaining: 2, consequences: { health: -3 } },
      { days_remaining: 2, consequences: { health: -4 } }, // 4th valid — dropped by cap
    ])!;
    expect(out).toHaveLength(MAX_DELAYED_PER_CHOICE);
    expect(out.map((f) => f.consequences.health)).toEqual([-1, -2, -3]);
  });

  it("normalizes target to the enum (invalid -> 'all') and drops non-string journal_entry", () => {
    const out = sanitizeDelayedEffects([
      { days_remaining: 2, consequences: { health: -5 }, target: "everyone", journal_entry: 42 },
      { days_remaining: 2, consequences: { health: -5 }, target: "actor", journal_entry: "It festered." },
    ])!;
    expect(out[0].target).toBe("all");
    expect(out[0].journal_entry).toBeUndefined();
    expect(out[1].target).toBe("actor");
    expect(out[1].journal_entry).toBe("It festered.");
  });
});

// ── FALLBACK_EVENTS fuses are valid + within game bounds ─────────────────────
describe("FALLBACK_EVENTS delayed effects", () => {
  it("every fallback fuse survives sanitize unchanged and sits within CONSEQUENCE_BOUNDS", () => {
    let fuseCount = 0;
    for (const tier of ["low", "medium", "high"] as const) {
      for (const event of FALLBACK_EVENTS[tier]) {
        for (const choice of event.choices) {
          if (!choice.delayed_effects) continue;
          fuseCount += choice.delayed_effects.length;
          // Re-running sanitize must be a no-op (already valid + bounded count/days).
          const reSanitized = sanitizeDelayedEffects(choice.delayed_effects);
          expect(reSanitized, `${tier}/${event.title}`).toEqual(choice.delayed_effects);
          for (const fuse of choice.delayed_effects) {
            expect(fuse.days_remaining).toBeGreaterThanOrEqual(DELAY_MIN_DAYS);
            expect(fuse.days_remaining).toBeLessThanOrEqual(DELAY_MAX_DAYS);
            // Within CONSEQUENCE_BOUNDS iff clampConsequences leaves it unchanged.
            const copy = { ...fuse.consequences };
            const orig = { ...fuse.consequences };
            clampConsequences(copy);
            expect(copy, `${tier}/${event.title} bounds`).toEqual(orig);
          }
        }
      }
    }
    expect(fuseCount).toBeGreaterThan(0); // exemplars exist
  });
});

// ── enqueueChoiceDelayedEffects (target resolution + chosen-only) ────────────
describe("enqueueChoiceDelayedEffects", () => {
  async function freshState(): Promise<GameState> {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    return state;
  }
  function eventWith(delayed: EventResponse["choices"][number]["delayed_effects"], personality = {}): EventResponse {
    return {
      title: "Snakebite",
      description: "A rattler strikes at the noon halt.",
      choices: [
        { label: "Press on", consequences: { health: -5 }, delayed_effects: delayed },
        { label: "Stop and tend it", consequences: { days: 1 } }, // no fuse
      ],
      personality_effects: personality,
      journal_entry: "A snake struck.",
    };
  }

  it("'all'/unset target enqueues with no member_name; sets server id + source", async () => {
    const state = await freshState();
    enqueueChoiceDelayedEffects(state, eventWith([{ days_remaining: 3, consequences: { health: -20 }, target: "all" }]), 0);
    expect(state.simulation.pending_effects).toHaveLength(1);
    const e = state.simulation.pending_effects[0];
    expect(e.member_name).toBeUndefined();
    expect(e.source).toBe("Snakebite");
    expect(e.id).toBeTruthy();
    expect(e.days_remaining).toBe(3);
    expect(e.consequences).toEqual({ health: -20 });
  });

  it("'actor' resolves to the first LIVING member named in personality_effects", async () => {
    const state = await freshState();
    enqueueChoiceDelayedEffects(state, eventWith([{ days_remaining: 2, consequences: { health: -10 }, target: "actor" }], { Cara: { morale: -5 } }), 0);
    expect(state.simulation.pending_effects[0].member_name).toBe("Cara");
  });

  it("'actor' falls back to the leader when the named member is dead", async () => {
    const state = await freshState();
    state.party.members.find((m) => m.name === "Cara")!.alive = false;
    enqueueChoiceDelayedEffects(state, eventWith([{ days_remaining: 2, consequences: { health: -10 }, target: "actor" }], { Cara: { morale: -5 } }), 0);
    expect(state.simulation.pending_effects[0].member_name).toBe("Alice"); // leader, living
  });

  it("'actor' with empty personality_effects resolves to the (living) leader", async () => {
    const state = await freshState();
    enqueueChoiceDelayedEffects(state, eventWith([{ days_remaining: 2, consequences: { health: -10 }, target: "actor" }]), 0);
    expect(state.simulation.pending_effects[0].member_name).toBe("Alice");
  });

  it("'actor' with the leader dead falls through to a living non-leader member", async () => {
    const state = await freshState();
    state.party.members.find((m) => m.name === "Alice")!.alive = false; // leader dead
    enqueueChoiceDelayedEffects(state, eventWith([{ days_remaining: 2, consequences: { health: -10 }, target: "actor" }]), 0);
    const name = state.simulation.pending_effects[0].member_name;
    expect(name).not.toBe("Alice"); // never the dead leader
    expect(name).toBe("Bob");       // first living member
  });

  it("a non-chosen choice's fuse is discarded", async () => {
    const state = await freshState();
    enqueueChoiceDelayedEffects(state, eventWith([{ days_remaining: 3, consequences: { health: -20 }, target: "all" }]), 1); // choice 1 has no fuse
    expect(state.simulation.pending_effects).toHaveLength(0);
  });
});

// ── handleChoice integration: fuse rides into the SIGNED state ───────────────
describe("handleChoice — delayed effects enqueue + survive signing", () => {
  const FUSE_EVENT: EventResponse = {
    title: "Snakebite",
    description: "A rattler strikes.",
    choices: [
      { label: "Press on", consequences: { health: -5 }, delayed_effects: [{ days_remaining: 3, consequences: { health: -20 }, target: "all", journal_entry: "The bite has festered." }] },
      { label: "Stop and tend it", consequences: { days: 1 } },
    ],
    personality_effects: {},
    journal_entry: "A snake struck.",
  };

  async function pending(): Promise<SignedGameState> {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    state.position.miles_traveled = 100;
    state.simulation.pending_event_hash = await hashEvent(FUSE_EVENT);
    state.simulation.pending_event_trigger = "event";
    return sign(state);
  }

  it("chosen choice's fuse is enqueued and survives into the signed state", async () => {
    const signed = await pending();
    const res = await handleChoice(makeRequest({ signed_state: signed, event: FUSE_EVENT, choice_index: 0 }, "/api/choice"), ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState };
    // Re-verify the RETURNED signature over the full state — proves the fuse is
    // part of the signed blob (enqueue-before-sign), not silently lost.
    const verified = await verifyIncomingState(body.signed_state, SECRET);
    expect(verified.valid).toBe(true);
    if (!verified.valid) throw new Error("unreachable");
    const fx = verified.state.simulation.pending_effects;
    expect(fx).toHaveLength(1);
    expect(fx[0].days_remaining).toBe(3);
    expect(fx[0].source).toBe("Snakebite");
    expect(fx[0].consequences).toEqual({ health: -20 });
    expect(fx[0].journal_entry).toBe("The bite has festered.");
  });

  it("choosing the no-fuse choice enqueues nothing", async () => {
    const signed = await pending();
    const res = await handleChoice(makeRequest({ signed_state: signed, event: FUSE_EVENT, choice_index: 1 }, "/api/choice"), ENV, ORIGIN);
    const body = await res.json() as { signed_state: SignedGameState };
    expect(body.signed_state.state.simulation.pending_effects).toHaveLength(0);
  });
});

// ── handleCamp integration: a camped day drains (closes the camp-stall) ──────
describe("handleCamp — drains delayed effects (camp-stall fix)", () => {
  beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0.999); }); // no disease/event rolls
  afterEach(() => { vi.restoreAllMocks(); });

  async function campState(): Promise<GameState> {
    const { state } = await createInitialState("Alice", MEMBERS, "farmer", "medium", SECRET);
    state.position.miles_traveled = 100;
    state.supplies.food = 200;
    state.supplies.oxen = 6;
    return state;
  }

  it("a camped day ticks + fires a due effect (no free stall)", async () => {
    const state = await campState();
    state.simulation.pending_effects = [
      { id: "e1", days_remaining: 1, consequences: { food: -30 }, source: "Spoiled rations", journal_entry: "Found the salt pork crawling." },
      { id: "e2", days_remaining: 3, consequences: { health: -10 }, source: "Slow wound" },
    ];
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }, "/api/camp"), ENV, ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json() as { signed_state: SignedGameState; summary: { notes: string[] } };
    const fx = body.signed_state.state.simulation.pending_effects;
    // e1 fired (removed); e2 decremented 3 -> 2, survives.
    expect(fx).toHaveLength(1);
    expect(fx[0].id).toBe("e2");
    expect(fx[0].days_remaining).toBe(2);
    // e1's journal surfaced in the camp notes (rendered to the player).
    expect(body.summary.notes).toContain("Found the salt pork crawling.");
  });

  it("a lethal fuse on a camped day records the death and that member does NOT heal (drain-before-heal)", async () => {
    const state = await campState();
    const bob = state.party.members.find((m) => m.name === "Bob")!;
    // 35 chosen so the ORDER is decisive: drain-before-heal → 35-40 → 0 (dies,
    // skipped by heal). If heal ran first → 35+10=45, then 45-40=5 → ALIVE at 5.
    // So `dead + health 0` can ONLY happen if the drain runs before the heal.
    bob.health = 35;
    state.simulation.pending_effects = [
      { id: "g", days_remaining: 1, consequences: { health: -40 }, source: "Gangrene", member_name: "Bob" },
    ];
    const res = await handleCamp(makeRequest({ signed_state: await sign(state) }, "/api/camp"), ENV, ORIGIN);
    const body = await res.json() as { signed_state: SignedGameState };
    const after = body.signed_state.state;
    const bobAfter = after.party.members.find((m) => m.name === "Bob")!;
    expect(bobAfter.alive).toBe(false);
    expect(bobAfter.health).toBe(0); // drain-before-heal; heal-first would leave him alive at 5
    expect(after.deaths.some((d) => d.name === "Bob" && d.cause === "Gangrene")).toBe(true);
    expect(after.simulation.pending_effects).toHaveLength(0); // fired + removed
  });
});
