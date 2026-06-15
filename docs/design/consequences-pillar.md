# Design: Consequences pillar — delayed effects via `pending_effects`

**Status:** design + implementation contract. Lands as its own PR on the stable GameState v2 schema (gamestate-v2.md §6.3).
**Derives from:** `docs/design/ai-event-engine.md` (V1 vision) + a 3-approach design panel (LLM-emitted / deterministic / hybrid) judged adversarially. Approach **A (LLM-emitted)** won (50 vs 49 vs 41): the only design that delivers the product hook — the AI authoring delayed dread — with anti-cheat that holds once the event-hash binding is accounted for.

---

## 1. Goal

The `pending_effects` queue + `drainPendingEffects` shipped in GameState v2 as the *primitive*; nothing enqueues into it. This pillar adds the **enqueuer**: events can schedule a consequence to land N days later — a wound that festers, water that poisons days on, a debt that comes due. The LLM authors the fuse; the server owns every number.

## 2. Approach (locked decisions)

### 2.1 How effects are specified — LLM-emitted, sibling field
Add an **optional** `delayed_effects?: PendingEffectSpec[]` as a **sibling on `EventChoice`** (NOT inside `consequences`). Sibling placement is load-bearing: it keeps `delayed_effects` out of `ALLOWED_CONSEQUENCE_KEYS` (a fuse smuggled into `consequences` is still rejected) while the existing nested-`consequences` validation loop in `parseEventResponse` applies to the fuse's payload verbatim.

```ts
// types.ts
export interface PendingEffectSpec {
  days_remaining: number;                       // clamped to [1,14] at mint
  consequences: EventChoice["consequences"];    // same delta shape; miles/days stripped
  journal_entry?: string;
  target?: "actor" | "all";                     // server-resolved to member_name; default "all"
}
// EventChoice gains: delayed_effects?: PendingEffectSpec[];
```

`EventChoice` is **unsigned** (part of the client-echoed event body, bound by `pending_event_hash`), so **no new signed field, no `migrateState` bump, no legacy round-trip test.** `pending_effects` already exists in v2; `state_version` stays 2.

### 2.2 Where enqueue happens — exactly one enqueuer this PR: `handleChoice`
After the hash + trigger checks pass and **before** `applyEventAndSign`, read the **chosen** choice's `delayed_effects`, resolve `target` → `member_name` server-side, build a `PendingEffect`, and `enqueuePendingEffect(stateForApply.simulation, …)`. Non-chosen choices' fuses are discarded. Enqueue onto `stateForApply` (the clone) before signing so it rides into the signed state.

`target` resolution (server-side, never LLM free-text):
- `"actor"` → first **living** member named in `event.personality_effects`, else the leader (`party.leader_name`). Deterministic.
- `"all"` (default) → `member_name` undefined (drain hits all living).

`PendingEffect.id` = `crypto.randomUUID()`, `source` = `event.title || "event"` — both server-set.

**Deferred enqueuers** (each a follow-up once this path is proven): sim disease/starvation ripples, landmark/river/hunt. They touch bespoke inline math and widen the anti-cheat surface to the sim — out of scope here.

### 2.3 Camp-stall — drain in `handleCamp` too
The v2 spec (§3.2) flagged this: drain was `advanceDays`-only, so a player could camp to stall a festering effect indefinitely (free healing, no consequence). `handleCamp` already runs a full `applyDailyAttrition` day — a camped day **is** a real day. Fix: export `drainPendingEffects` and call it in `handleCamp` **after** `applyDailyAttrition` and **before** the rest-heal loop (mirrors `advanceDays` order: attrition → drain → heal). The heal loop already skips dead members, so a member killed by a drained lethal fuse won't heal. Fired `journal_entry` goes into the camp `notes`.

### 2.4 Anti-cheat — two server-side layers (client already neutralized)
The event-hash binding (`handleChoice` rejects `event_hash_mismatch`) makes `body.event` byte-identical to server-issued content, so the client **cannot** inject or alter a fuse. Enqueue-time bounds are therefore a *misbehaving-LLM* guard, not a client guard, and belong at the single mint point.

- **Layer 1 — mint** (`sanitizeDelayedEffects`, called from `parseEventResponse`): truncate count to `MAX_DELAYED_PER_CHOICE = 3`; `days_remaining` → finite check → `Math.round` → clamp `[DELAY_MIN_DAYS=1, DELAY_MAX_DAYS=14]` (default 3 if missing/invalid — the field the spec flagged as unbounded); nested `consequences` pass the existing `ALLOWED_CONSEQUENCE_KEYS` + `|val|>10000` loop, then **strip `miles`/`days`** (delete, tolerant — the drain ignores them, so a fuse must never silently pay for a no-op); `target` validated to the enum else `"all"`; non-string `journal_entry` dropped. Fallback events are hand-authored already-valid (and tested against the sanitizer + `CONSEQUENCE_BOUNDS`).
- **Layer 2 — drain** (already shipped, unchanged): `clampConsequences` / `CONSEQUENCE_BOUNDS` at fire time — the single magnitude source of truth.

`handleChoice` does **not** re-validate (redundant — the hash carries the minted, sanitized content through).

### 2.5 UI surfacing — surprise, not foreshadow
No pending-effect indicator (choice labels carry zero consequence numbers today; a "will hurt later" badge is a tonal break and a spoiler that undercuts the horror payoff). Fired effects surface through the existing channel — `drainPendingEffects` pushes `journal_entry` into the day events / camp notes.

**Mandatory render fix (frontend):** `travel.js` `daysAdvanced` renders only `evt.text || evt.description`, but `applyDailyAttrition` **and** `drainPendingEffects` push **plain strings** into `summary.events` — so fired fuses (and pre-existing attrition lines like "Starvation taking its toll") render nothing on the travel scene. One-line fix: coerce string day-events before `showFloatingText`. Zero HMAC/schema impact.

## 3. Scope

**In this PR:** `types.ts` (spec + sibling field); `anthropic.ts` (`sanitizeDelayedEffects` + consts + call from `parseEventResponse` + 1–2 fallback exemplars per tier, high strongest); `index.ts` (`handleChoice` enqueue + `member_name` resolution; `handleCamp` drain); `simulation.ts` (export `drainPendingEffects`); `prompt-templates.ts` (`JSON_FORMAT_BLOCK` optional-field doc + high-tier one-liner); `travel.js` string-render fix; all tests.

**Deferred:** sim/landmark/river/hunt enqueuers; foreshadow UI; persisting drained `journal_entry` into the 5-line `state.journal`; `miles`/`days` delayed effects; `migrateState` bump (none needed).

## 4. Test contract

`worker/tests/anthropic.test.ts`
- `sanitizeDelayedEffects`: count >3 truncates to 3; `days_remaining` clamps to [1,14], `Math.round`s, defaults to 3 when missing/invalid, normalizes ≤0 to ≥1; invalid consequence key rejected (via existing loop); `miles`/`days` stripped (not rejected); `target` invalid → `"all"`; non-string `journal_entry` dropped.
- Every `FALLBACK_EVENTS` `delayed_effects` survives `sanitizeDelayedEffects` unchanged AND its consequences sit within `CONSEQUENCE_BOUNDS`.

`worker/tests/handlers.test.ts` (or `handleCamp.test.ts`)
- `handleChoice`: the chosen choice's `delayed_effects` is enqueued and **survives into the signed state**; a non-chosen choice's fuse is discarded; `target:"actor"` with empty `personality_effects` resolves to a living member (leader); enqueue-before-sign survival.
- `handleCamp`: a camped day **drains** (decrements + fires due effects); a lethal fuse on a camped day records the death and that member does **not** heal (drain-before-heal order).

Full `npx vitest run` green before commit. Frontend string-render fix covered by a frontend assertion or a manual smoke note.

## 5. Open risks (carried, documented)
- `target:"actor"` is heuristic: `personality_effects` is empty on every shipped fallback and many LLM events, so actor collapses to the leader (still a real living member — never dead/nonexistent). Acceptable for V1.
- `MAX_PENDING_EFFECTS=24` drops the **oldest** on overflow; a pathological 3-fuse-per-event run could evict a still-pending fuse. Rare and self-correcting (survivors bounded by `CONSEQUENCE_BOUNDS`). Documented, not engineered around in V1.
- `target:"actor"` is resolved to a `member_name` at enqueue time, **before** `applyEventAndSign` applies the same choice's *immediate* consequences. If that immediate hit kills the resolved actor, the fuse later no-ops (the drain skips dead members). Semantically fine ("a wound can't fester on a corpse"), but it's a fuse that's authored yet never fires. Accepted for V1; revisit if the consequences pillar wants death-transfer semantics.
- A lethal fuse fired during `handleCamp` can wipe the last living member, but `handleCamp` returns a normal `CampResponse` with no `wipe` terminal trigger (unlike `advanceDays`). This is **pre-existing** — `applyDailyAttrition` already kills during camp — and the drain only widens the source, not the gap. Out of scope here; a follow-up could add uniform camp-wipe signaling.

## Change log
- 2026-06-14 — Created. Approach A (LLM-emitted, sibling `delayed_effects` on `EventChoice`), one enqueuer (`handleChoice`), camp-drain fix, mint-time sanitizer, travel render fix. No signed-field change.
