# Spec: GameState v2 — versioned schema + migration framework

**Status:** implementation contract. Blocks all four V1 pillars (events, party, consequences, 3D-state-wiring). Lands FIRST, alone, in one PR.
**Derives from:** `docs/design/ai-event-engine.md` §10 (gauntlet) + the V1 review (schema-churn P0).
**Owner sign-off:** event descope approved (live-the-opener, no governor); schema-first sequencing approved.

---

## 1. Why this exists

Every V1 pillar wants to add `GameState` fields. `hmac.ts:deepCanonicalize` hashes the **entire** state tree, so **any** field add is a silent-verification-break window for legacy in-flight states. The worker already handles this ad-hoc for two prior adds (`bitter_path_taken`, `pending_event_trigger`) by **injecting defaults after HMAC verify** (`state.ts:verifyIncomingState` lines 145–164). Three more uncoordinated PRs = three more landmines and three copies of that shim.

This spec replaces the ad-hoc undefined-checks with **one versioned migration function**, adds the V1 field that's actually needed now (`pending_effects`), and proves legacy states still verify + round-trip with a test. After this lands, a new field is a one-line default in one place, not an HMAC audit.

---

## 2. The migration framework

### 2.1 Version marker
Add a top-level `state_version: number` to `GameState`. Current = `2`. Legacy signed states have **no** `state_version` (treated as v1).

```ts
// worker/src/state.ts
export const STATE_VERSION = 2;
```

### 2.2 `migrateState` — the single upgrade path
Runs **after** `verifyState` succeeds, on a `structuredClone` of the verified state (the signature covered the legacy shape; the next re-sign includes the new fields — identical posture to the existing shim). It upgrades any older state to `STATE_VERSION` by injecting defaults, never removing or renaming.

```ts
// worker/src/state.ts — replaces the inline back-compat block in verifyIncomingState
function migrateState(input: GameState): GameState {
  const state = structuredClone(input);
  const v = state.state_version ?? 1;

  // v1 → v2: the two pre-versioning shims, now formalized, plus pending_effects.
  if (v < 2) {
    const sim = state.simulation;
    if (sim.bitter_path_taken === undefined) sim.bitter_path_taken = "none";
    if (sim.pending_event_trigger === undefined) {
      sim.pending_event_trigger = sim.pending_event_hash ? "event" : null;
    }
    if (sim.pending_effects === undefined) sim.pending_effects = [];
  }

  state.state_version = STATE_VERSION;
  return state;
}
```

`verifyIncomingState` becomes: `verifyState → if !ok return invalid → return { valid: true, state: migrateState(signed.state) }`. No casts (`rules/typescript/style.md`): `SimulationState`'s new fields are declared optional-on-read only via the type evolution below, and the function reads them as possibly-`undefined` without `as`.

### 2.3 Rules for all future field adds (the contract this establishes)
- **Additive only.** Never remove or rename a signed field in a migration — legacy verify runs against the old shape; a rename changes what re-signs and silently diverges readers. Deprecate-in-place instead.
- **Default in `migrateState`, bump `STATE_VERSION`, add one `if (v < N)` block.** Nothing else touches the HMAC path.
- **Every bump adds a legacy-round-trip test** (§5). No bump merges without it.
- The **client holds the blob opaquely** and never constructs it — so "lockstep" is the worker **sign-path ⟷ verify-path**, not a frontend change. `createInitialState` must set `state_version: STATE_VERSION` and any new field's default so fresh states and migrated states are identical.

---

## 3. v1 → v2 field additions

### 3.1 `state_version` (top-level) — §2.

### 3.2 `simulation.pending_effects` — the delayed-consequence queue
The consequences pillar needs effects that land *later* (a wound that festers, spoiled food discovered in three days, a morale ripple). The current sim applies all consequences immediately; this queue is the minimal primitive for delay.

```ts
// worker/src/types.ts
export interface PendingEffect {
  id: string;                 // uuid; de-dup + journal/debug
  days_remaining: number;     // decremented per simulated day; fires at <= 0
  consequences: EventChoice["consequences"];   // SAME delta shape as events
  member_name?: string;       // optional target for {health,sanity,morale}
  source: string;             // e.g. "Snakebite", "disease:cholera" — provenance
  journal_entry?: string;     // optional line emitted when it fires
}

export interface SimulationState {
  // ...existing fields unchanged...
  pending_effects: PendingEffect[];   // v2+; default []
}

export interface GameState {
  state_version: number;              // v2+
  // ...existing fields unchanged...
}
```

**Enqueue:** server-side only — by event consequence handlers and the sim. The client cannot add effects (it can't mutate the signed blob). Enqueue does **not** clamp (delay magnitudes are intentional); the queue is capped at `MAX_PENDING_EFFECTS = 24`, dropping the **oldest** on overflow (defensive — effects are server-enqueued, so overflow signals a bug, but bound it so a runaway can't bloat the signed state).

**Drain:** inside `advanceDays`, on **each simulated day**: decrement every effect's `days_remaining`; for each that reaches `<= 0`, apply its `consequences` through the **existing `clampConsequences`** (so `CONSEQUENCE_BOUNDS` stays the single source of truth — anti-cheat preserved), apply optional `member_name` effects, push `journal_entry` if present, and remove it from the queue. Order: drain BEFORE the day's event-trigger check so a delayed death is reflected in that day's state.

### 3.3 Events — **no new signed field** (descope)
Per the approved descope (`ai-event-engine.md` §10): pool-by-default + live only `meta.event_count === 0`. `event_count` already exists and is server-signed. `seen_event_ids` is **deferred** (added later via this same framework only if repeat-rate telemetry justifies it). Events touch zero of the schema in V1.

### 3.4 Party — **no new signed field in V1**
"Stronger party management" = deepen the existing `health/sanity/morale/disease` axes into interacting systems (sim/event logic), which needs no new state. Per-member skills/relationships/inventory are **V2**; when they come, each rides §2.3 (one `if (v < N)` block, one round-trip test).

---

## 4. Invariants preserved (do not regress)

- `deepCanonicalize` is **unchanged** — still sorts the whole tree. The migration adds keys; canonicalization handles them automatically.
- All consequence application — immediate (events) and delayed (`pending_effects`) — goes through `clampConsequences` / `CONSEQUENCE_BOUNDS`. No second clamp path, no bypass.
- HMAC signing chain, server-authoritative sim, no-DB, the event hash + trigger-kind binding — all untouched.
- `createInitialState` sets `state_version` and `pending_effects: []`. A fresh state and a migrated legacy state are byte-identical after canonicalize.

---

## 5. Test contract (must ship in the same PR)

`worker/tests/hmac.test.ts`:
- A legacy v1 signed state (no `state_version`, no `pending_effects`, no `bitter_path_taken`) **still verifies**, and after `verifyIncomingState` has `state_version === 2`, `pending_effects === []`, `bitter_path_taken === "none"`, and the legacy `pending_event_trigger` shim result.
- The migrated state **re-signs and re-verifies** (round-trip) and canonicalizes identically to a fresh `createInitialState` of the same content.

`worker/tests/state.test.ts`:
- `createInitialState` includes `state_version: 2` and `pending_effects: []`.
- `MAX_PENDING_EFFECTS` overflow drops the oldest, never grows past the cap.

`worker/tests/simulation.test.ts`:
- An effect with `days_remaining: 2` does **not** fire on a 1-day advance, **does** fire on the next; the applied delta is **clamped** by `CONSEQUENCE_BOUNDS` (assert a magnitude that would exceed bounds lands at the bound).
- A delayed lethal effect drains **before** the event-trigger check (death reflected same day).

Full suite (`npx vitest run`) green before commit.

---

## 6. Rollout / sequencing

1. **This PR, alone.** Schema + `migrateState` + `pending_effects` queue/drain + tests. No pillar logic. Ship it, confirm prod states migrate (canary playthrough), then build on frozen ground.
2. **Codex review** (VS Code) on this PR specifically — the signed-state migration is exactly its niche; the gauntlet flagged HMAC migration as the highest-risk step.
3. Then: events (pool + live-the-opener), party deepening, consequences using `pending_effects` — each a separate PR on the now-stable schema.

---

## Change log
- 2026-06-13 — Created. Establishes `state_version` + `migrateState` framework and the `pending_effects` queue. Formalizes the two pre-existing ad-hoc shims (`bitter_path_taken`, `pending_event_trigger`) into the versioned path.
