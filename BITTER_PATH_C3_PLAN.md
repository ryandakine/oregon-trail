# Bitter Path — C3 Implementation Plan

**Slice:** C3 — frontend scene, content-warning gate, engine wiring
**Parent:** `BITTER_PATH_PLAN.md` (v3, § 7 C3)
**Predecessors:** C1 shipped (state schema + HMAC), C2 shipped (simulation trigger + `/api/bitter_path` endpoint + fallbacks)
**Estimate:** 3-4 hr after revisions
**Status:** LOCKED after autoplan gauntlet 2026-04-18. Ready to implement.

---

## § 0. Autoplan Revisions (2026-04-18) — supersedes conflicting sections below

Ran the full gauntlet: Codex + 3 Claude subagents (CEO, Eng, Design). 4 independent reviews. Heavy convergence. Critical findings all agreed on. Ryan made the 3 taste calls.

### § 0.1 Decisions locked

**T1 — Back button:** Option **D**. Adds `bitter_path_taken = "refused"` enum value and a new `/api/bitter_path_skip` endpoint. Clean telemetry + honest UX. Bundled into C3.a.

**T2 — Content tone:** **Graphic content allowed.** Horror tier is the hook (CLAUDE.md § 1, § 10). Master plan § 10 line "Graphic descriptions — forbidden" is OVERRIDDEN. Changes required:
- `generateLongNight()` prompt drops the "no graphic descriptions" instruction
- Forbidden-word guard loosens: still rejects slurs, sexual content, modern-era breaks; allows "flesh", "blood", "bone", "hunger broke him"
- C2 fallback events for bitter_path get a rewrite pass to match new tone (they currently sanitize)
- CW modal rewritten as a REAL warning, not reassurance

**T3 — Typewriter timing:** **25ms/char** with a 10-second max-wait auto-show (defense against long LLM descriptions).

### § 0.2 Critical fixes applied (P0 findings — all reviewers agreed)

1. **C2 contract gap at `worker/src/index.ts:353`.** Fix ships BOTH `trigger_data: eventData` AND `trigger_meta: result.triggerData` for bitter_path. Populate both. Split to its own commit (**C2.1**), not bundled in C3.a.
2. **`public/scenes/title.js` is the real resume entry point, not engine.js alone.** title.js:237-244 hardcodes scene choice. C3 must wire it — either call `engine.getResumeScene()` there or add the bitter_path branch directly in title.js.
3. **Remove the misleading sanity check in § 6.3.** The check `if (bitter_path_taken !== 'none') transition('TRAVEL')` doesn't catch ghost-resolve because `bitter_path_taken` is still "none" at the moment it runs. Trust the server's `already_resolved` error path on POST instead.
4. **Fallback in C2 when `generateLongNight()` fails.** Currently no fallback — Anthropic 5xx breaks `/api/advance` entirely. Must add graphic-tone fallback events (3-4 variants keyed by cause, like `FALLBACK_EVENTS`).
5. **Tighten T16 regression test:** assert `trigger_data.choices.length === 3` AND `trigger_data.title === "The Long Night"` AND `trigger_meta.trigger_variant` present. Current T16 would pass even if someone swapped the fix.

### § 0.3 Medium fixes applied

- New tests: T21 (trigger_meta populated), T22 (two-tab race — server's `already_resolved` handled), T23 (mid-resolve timeout + retry preserves `currentBitterPath`), T24 (ESC/close overlay during CW modal), T25 (kill switch mid-flight preserves server resolution).
- New engine-dispatch test (`worker/tests/engine-dispatch.test.ts`, ~50 lines jsdom-ish) — covers the 8-case switch, closes the title.js resume regression hole.
- Post-choice outcome beat: 1.5s hold showing one of three canned lines before TRAVEL transition:
  - dignified: "They rest, and continue."
  - hopeful: "They continue."
  - taken: "Something broke in them. They continue."
- Scene: dead member's name rendered in subheading ("Your party lost {name} {N} days ago"). Uses `trigger_meta.dead_member_name` + `days_since_death`.
- CW modal button order: **[Skip] [Continue]** — safer action on the left, LTR scan pattern.
- CW modal footer: small text "An OSI production. Based on the Donner Party (1846)." — screenshot defense.
- Backdrop opacity drops to 0.75 (was 0.85) — stops stacking too dark with high-tier tone overlay (0.28 cool + 0.5 vignette + scanlines already applied by `tone.mjs`).
- Candles: CUT. Ship proper flame sprite in a later polish pass or skip entirely. 6px rects read as rendering bugs.
- Focus management: on CW render → focus Skip button. On scene render after typewriter → focus first choice.
- Reduced-motion typewriter fallback → 400ms opacity fade-in, not abrupt snap.
- `localStorage` set in try/catch (Safari private mode throws). Mirror `_saveRun()` pattern.
- Kill-switch mid-flight behavior documented: `BITTER_PATH_ENABLED=false` only gates trigger emission; pending resolutions still process on `/api/bitter_path`.

### § 0.4 New CW copy

```
CONTENT WARNING

This path depicts the Donner Party's 1846 choice to eat their dead.
The writing is graphic. If that's not for you, skip.

[Skip scene]                  [Continue]

An OSI production. Based on the Donner Party (1846).
```

### § 0.5 Revised commit structure (5 sub-commits)

**C2.1 — Backend contract fix + fallback + graphic-content unlock (25 min)**
- `worker/src/index.ts:353`: ship both `trigger_data` (eventData) and `trigger_meta` (simulation metadata)
- `worker/src/anthropic.ts`: drop "no graphic descriptions" from `generateLongNight()` prompt. Loosen `pickFallbackKey()` guard. Rewrite 3-4 fallback scenes with graphic tone.
- `worker/src/types.ts`: add `trigger_meta?: unknown` to `AdvanceResponse`
- `worker/tests/anthropic.test.ts`: new tests for trigger_meta + loosened guard
- Independent merge — clean bisect

**C3.a — New refused enum + skip endpoint (25 min)**
- `worker/src/types.ts`: add `"refused"` to `BitterPathOutcome`
- `worker/src/state.ts`: add `BITTER_PATH_REFUSED_EFFECTS` (mechanically mirrors dignified but logged separately)
- `worker/src/index.ts`: new `/api/bitter_path_skip` handler
- `worker/src/state.ts`: migration back-compat (existing saves have `bitter_path_taken: "none"` or "taken"/etc.)
- `worker/tests/`: tests for refused enum + skip endpoint

**C3.b — Engine wiring + title.js resume (30 min)**
- `public/engine.js`: `advance()` dispatch + `resolveBitterPath()` + `skipBitterPath()` + `_saveRun`/`_loadSavedRun`/`restart`/`getResumeScene` updates
- `public/scenes/title.js`: add BITTER_PATH branch to resume logic (lines 237-244)
- `public/main.js`: scene map + register

**C3.c — Scene + CW gate (60 min)**
- `public/scenes/bitter_path.js` NEW (~220 lines): CW modal, typewriter at 25ms with 10s max-wait, 3 choices, post-choice beat (1.5s), error handling, reduced-motion fallback (fade-in), focus management, a11y announce, dead-member subheading, screenshot-defense footer
- Manual dogfood on staging all 4 paths (skip, choice 0, choice 1, choice 2)

**C3.d — Tests (30 min)**
- `worker/tests/handleBitterPath.test.ts` (T3-T6)
- `worker/tests/handleBitterPathSkip.test.ts` (T9 refused path)
- `worker/tests/engine-dispatch.test.ts` (switch coverage via jsdom-ish shim)
- Tightened T16a/b + T21-T25
- `npx vitest run` green (expect ~160 tests after C3)

### § 0.6 Autoplan consensus tables

**CEO/Strategic**

| Dimension | Consensus | Notes |
|---|---|---|
| Premises valid? | ✓ | C2 contract gap correctly identified |
| Scope right? | ✓ | After C2.1 split, sizes cleanly |
| Horror tier promise upheld? | ✓ | After T2 decision, fully on mission |
| 6-month regret? | Low | After screenshot defense + telemetry wiring in C5 |

**Engineering**

| Dimension | Consensus | Notes |
|---|---|---|
| Architecture sound? | ✓ | After title.js + trigger_meta wiring |
| Tests sufficient? | ✓ | After T16a/b + T21-T25 + engine-dispatch test |
| Security covered? | ✓ | HMAC chain preserved; server idempotency documented |
| State machine correct? | ✓ | After misleading sanity check removed |
| Error paths handled? | ✓ | After C2 fallback added + retry semantics documented |

**Design**

| Dimension | Consensus | Notes |
|---|---|---|
| Info hierarchy | ✓ | Subheading with dead member name anchors scene |
| States specified | ✓ | Post-choice beat added |
| CW appropriate | ✓ | New copy leads with Donner + graphic acknowledgment |
| Visual treatment | ✓ | 0.75 backdrop + cut candles + crimson border retained |
| Motion respects users | ✓ | 25ms + 10s max + fade-in fallback |
| A11y complete | ✓ | Focus + live region + reduced-motion |
| Back path UX | ✓ | Option D = honest |

### § 0.7 Sections below

§ 2 through § 14 are the original plan text. Where they conflict with § 0 above, § 0 wins. Specifically overridden:
- § 2 fix spec (use § 0.2 #1)
- § 4.2 backdrop 0.85 (now 0.75)
- § 4.2 candle flicker (cut)
- § 5.2 CW copy (use § 0.4)
- § 5.3 Option A recommendation (now Option D — see § 0.1)
- § 6.3 sanity check (removed — see § 0.2 #3)
- § 10.1/10.2 file list (add title.js, new skip endpoint, new enum)
- § 12 commit structure (now 5 sub-commits — see § 0.5)

---

---

## § 1. Scope

Client-side plumbing for the Long Night path. Everything that turns `trigger === "bitter_path"` on the `/api/advance` response into a rendered scene, a content-warning gate, three resolved choices, and a back-to-travel transition.

In scope:
- New Kaplay scene `public/scenes/bitter_path.js`
- Engine route: detect bitter_path trigger, branch to the new scene instead of EVENT
- Engine method `resolveBitterPath(choiceIndex)` that POSTs `/api/bitter_path`
- First-run content-warning modal, `localStorage`-gated
- Resume-mid-flow handling
- Tests for every codepath

Out of scope (later slices):
- Telemetry / Plausible events (C5)
- Tone-screen challenge pitch + ambient hints (C4)
- Harness flag `--takeBitterPath` (C5)
- Merciful Traveler landmark event (separate commit)

---

## § 2. What C2 shipped that C3 consumes

C2 contract on `/api/advance` response (from `worker/src/index.ts:349-355`):

```js
{
  days_advanced: number,
  summaries: DaySummary[],
  trigger: "bitter_path",
  trigger_data: { dead_member_name, dead_member_cause, days_since_death, trigger_variant },
  signed_state: { state, signature }   // state.simulation.pending_event_hash is set
}
```

C2 contract on `/api/bitter_path` (from `worker/src/index.ts:401-470`):

- Request: `{ signed_state, event: EventResponse, choice_index: 0|1|2 }`
- Re-hashes `event`, compares to `state.simulation.pending_event_hash` — rejects `event_hash_mismatch`
- Rejects `already_resolved` if `state.simulation.bitter_path_taken !== "none"`
- Applies `bitterPathConsequences(choice_index)` from `anthropic.ts:474`
- Returns `{ signed_state, outcome: "dignified" | "hopeful" | "taken" }`

**Critical gap discovered during plan exploration** — flagged in § 11 for /plan-eng-review:

The C2 advance handler generates `eventData` via `generateLongNight()` and hashes it into `pending_event_hash` (`worker/src/index.ts:317-330`), but the response body only ships `eventData` to the client when `trigger === "event"`. For `trigger === "bitter_path"`, the client receives `trigger_data = result.triggerData` — the sim metadata — NOT the EventResponse.

The client therefore CANNOT currently POST a matching `event` body to `/api/bitter_path`, which will always fail with `event_hash_mismatch`.

**C3 needs to ship a one-line C2 fix:** change `worker/src/index.ts:353` from

```ts
trigger_data: result.trigger === "event" ? eventData : result.triggerData,
```

to

```ts
trigger_data:
  result.trigger === "event" || result.trigger === "bitter_path"
    ? eventData
    : result.triggerData,
```

And move the sim metadata (dead_member_name, variant, etc.) into a new response field `trigger_meta` if the scene needs it for display tuning.

Alternative (considered + rejected): put both into `trigger_data` via `{ event, meta }` envelope — cleaner but breaks existing fall-through for the `"event"` case. Reject; use the flat additive approach above.

This is a 5-line backend change, but because it crosses the C2/C3 seam, /plan-eng-review should sign off before the plan locks.

---

## § 3. Engine wiring (`public/engine.js`)

### § 3.1 Current `advance()` dispatch (engine.js:438-510)

The switch on `res.trigger` at line 469 has cases for `event`, `landmark`, `river`, `death`, `arrival`, `wipe`, and a default. No case for `bitter_path`. Today, a bitter_path trigger would fall through the default branch and schedule the next advance — silently swallowing the trigger.

### § 3.2 New branch

Add a case between `event` and `landmark` (match the order in `TriggerType`):

```js
case 'bitter_path':
  this.currentBitterPath = res.trigger_data;  // full EventResponse (after § 2 fix)
  this.currentBitterPathMeta = res.trigger_meta || null;  // optional sim metadata
  this._saveRun();
  this.transition('BITTER_PATH', res.trigger_data);
  break;
```

State machine gains the literal string `'BITTER_PATH'`. Scene map in `public/main.js:38-56` gets:

```js
BITTER_PATH: 'bitter_path',
```

### § 3.3 New engine method — `resolveBitterPath(choiceIndex)`

Mirror of `makeChoice()` (engine.js:519-536). Key differences:
- Endpoint `/api/bitter_path` instead of `/api/choice`
- After success, clears `currentBitterPath` and transitions to TRAVEL
- Emits a `bitterPathResolved` event so the scene can show a brief outcome screen before the travel scene replaces it
- Guards against double-click via `_resolvingBitterPath` flag

```js
async resolveBitterPath(choiceIndex) {
  if (this._resolvingBitterPath) return;      // spam-click guard
  if (choiceIndex < 0 || choiceIndex > 2) return;
  if (!this.currentBitterPath) return;
  this._resolvingBitterPath = true;
  this.emit('loading', true);
  try {
    const res = await this.api('/api/bitter_path', {
      signed_state: this.signedState,
      event: this.currentBitterPath,
      choice_index: choiceIndex,
    });
    this.signedState = res.signed_state;
    const outcome = res.outcome;
    this.currentBitterPath = null;
    this.currentBitterPathMeta = null;
    this._saveRun();
    this.emit('loading', false);
    this.emit('bitterPathResolved', { outcome, choiceIndex });
    this.transition('TRAVEL');
  } catch (e) {
    this.emit('loading', false);
    this.emit('error', { message: e.message, recoverable: true });
  } finally {
    this._resolvingBitterPath = false;
  }
}
```

### § 3.4 Save/resume

Update `_saveRun()` (engine.js:236-251) to include `currentBitterPath` and `currentBitterPathMeta` alongside `currentEvent`. Update `getResumeScene()` (engine.js:264-269) to check `currentBitterPath` ahead of `currentEvent`:

```js
getResumeScene() {
  if (this.currentBitterPath) return 'BITTER_PATH';
  if (this.currentEvent) return 'EVENT';
  if (this.currentRiver) return 'RIVER';
  if (this.currentLandmark) return 'LANDMARK';
  return 'TRAVEL';
}
```

Also update `_loadSavedRun()` to deserialize the new fields, and `restart()` (engine.js:689-704) to null them.

---

## § 4. The scene — `public/scenes/bitter_path.js` (NEW)

### § 4.1 File structure

Mirror `event.js` pattern exactly:

```js
import { addTopHud, addBottomHud } from "../lib/hud.mjs";

const CW_ACK_KEY = 'ot_bitter_path_cw_acked';
const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function register(k, engine) {
  k.scene("bitter_path", (sceneData) => {
    // ... impl
  });
}
```

### § 4.2 Layout

Canvas layer:
- 640x480 dim backdrop, `k.color(0, 0, 0)` at `k.opacity(0.85)` (darker than event.js's 0.6)
- Top HUD, bottom HUD (same as event.js)
- Decorative label: text `"THE LONG NIGHT"` at y=420, low opacity, dim gold — whisper not shout
- Two dim flame/candle objects (rect primitives tinted warm orange, 6px squares, z=49) flickering slowly on either side of the title. If `MOTION_OK` is false, keep them static. No gore imagery, no silhouettes beyond small dim shapes.

HTML overlay (`#html-overlay`):
- Crimson border accent override on the `.overlay-content` (darkened from gold to a muted dark red `#5a1a1a`). Not horror-meme red; sober. This is the signal players are in a different scene than the normal event.
- `<h2>` title: the event title from LLM (always "The Long Night")
- `<p>` with the event description, typewriter-revealed at 30ms/char (slightly slower than event.js's 25ms — gives the scene weight). Click-to-skip works, same pattern as event.js.
- Choices list: 3 buttons, labels from the canonical 3-choice set (enforced server-side by `generateLongNight` at `anthropic.ts:459-463`, so the client trusts whatever labels come back). Buttons are `.choice-btn` class with the existing hover treatment.

### § 4.3 Button behavior

Each button:
- Has a visible index prefix ("1.", "2.", "3.") same as event.js
- On click, calls `engine.resolveBitterPath(idx)` and immediately disables all three buttons
- Shows a dim "..." loader below the buttons while the API call is in flight
- Keyboard: 1/2/3 keys map to choices, same as event.js

No agency-steal countdown. The sanity-based auto-pick in event.js (event.js:105-129) is explicitly skipped here — bitter_path is a deliberate moment, not a pressure moment.

### § 4.4 Cleanup

`k.onSceneLeave()`: remove overlay `.active`, clear content, remove error listener, remove keypress handlers. Same pattern as event.js:163-166.

### § 4.5 Error handling

Same pattern as event.js:148-160 — on `engine.emit('error')`, inject a red `<p>` below the choices with the error message and re-enable the buttons for retry. The server is idempotent for hash-matching retries (it clears `pending_event_hash` only on success), so retry is safe.

Specific error cases the scene handles:
- `event_hash_mismatch` → display "State out of sync. Please reload." + reload button. Should never happen in the happy path after § 2 fix, but defend.
- `already_resolved` → display "This moment has passed." + auto-transition TRAVEL after 2s.
- Network/500 → generic "Try again" button re-invokes `resolveBitterPath(idx)` with last chosen index.

---

## § 5. Content-warning gate

### § 5.1 Flow

```
engine.transition('BITTER_PATH', eventData)
      │
      ▼
  bitter_path scene initialized
      │
      ▼
  check localStorage.getItem('ot_bitter_path_cw_acked')
      │
      ├──(value === 'true')──────────────► render scene normally (§ 4.2)
      │
      └──(null or !== 'true')─────────────► render CW modal first
                                               │
                                               ├──[Continue] ► localStorage.setItem('ot_bitter_path_cw_acked', 'true')
                                               │                  ▼
                                               │              render scene normally
                                               │
                                               └──[Back]      see § 5.3 (open question)
```

### § 5.2 CW modal content

Reuses `#html-overlay`, different overlay content structure. Plain text:

```
Content Warning

This path depicts historically-accurate survival choices
from 19th-century westward migration, including references
to cannibalism.

No graphic descriptions. Historical framing only.

[ Continue ]          [ Take me back ]
```

Styling: same `.overlay-content` container, but with:
- Crimson border (`#5a1a1a`, same as scene § 4.2)
- Two buttons inline (flex row), not the usual full-width stack
- "Continue" is the primary action (darker gold accent)
- "Take me back" is secondary (plain button, no accent)

### § 5.3 The "Back" problem — OPEN QUESTION FOR /plan-eng-review

The bitter_path event has ALREADY been triggered server-side. `state.simulation.pending_event_hash` is set. If the user clicks "Back" we have four options:

**Option A: Auto-resolve as Option 1 (dignified) silently**
- POST to `/api/bitter_path` with `choice_index: 0` on the user's behalf
- This matches the v1 "skip to outcome" pattern from `BITTER_PATH_PLAN.md § 2.3`
- Pro: game state advances cleanly, player gets a valid path
- Con: they made a choice without seeing the options — agency issue
- Con: modifies their run without consent

**Option B: Auto-resolve and route to TRAVEL, but surface in a toast**
- Same as A but show a brief notification: "Scene skipped. The party pressed on."
- Transparent about what happened
- Still somewhat paternalistic

**Option C: Leave state pending, bounce them to title**
- Doesn't resolve the event; game can't advance
- User is forced to confront the CW modal on next session too
- Broken UX

**Option D: Flag the run as "opted out of bitter_path content", degrade to fallback event**
- Set `bitter_path_taken = "refused"` (new enum value) via a new `/api/bitter_path_skip` endpoint
- Simulation treats this identically to "dignified" mechanically but marks it as opt-out for telemetry
- Newspaper framing takes a different branch
- Con: bigger scope, needs a new API endpoint, touches C1 enum

**Recommended:** Option A, on the basis of matching v1 plan intent and minimizing C3 scope. Flag this for /plan-eng-review to lock in.

Storage convention: `ot_bitter_path_cw_acked = 'true'` is stored on ACK regardless of which path the user picks. Even if they "Back", they've seen the CW, so re-showing it next time adds friction with no safety benefit.

### § 5.4 One-shot behavior

- On first BITTER_PATH transition ever (no `ot_bitter_path_cw_acked` in localStorage): show modal
- On any subsequent BITTER_PATH transition: skip modal, go straight to scene
- Cleared only by manual localStorage clear; never automatic
- Key is `ot_bitter_path_cw_acked` (namespaced with `ot_` prefix for consistency with existing `ot_saved_run`, `ot_journal`, `ot_daily_*`)

---

## § 6. State machine (explicit)

### § 6.1 Engine state transitions

```
TRAVEL ── advance() ───┬──► EVENT             (res.trigger === 'event')
                       ├──► LANDMARK          (res.trigger === 'landmark')
                       ├──► RIVER             (res.trigger === 'river')
                       ├──► DEATH             (res.trigger === 'death')
                       ├──► BITTER_PATH       (res.trigger === 'bitter_path')  ── NEW
                       ├──► ARRIVAL           (res.trigger === 'arrival')
                       ├──► WIPE              (res.trigger === 'wipe')
                       └──► (self-loop, schedule next advance)

BITTER_PATH ── (CW gate) ─┬──► BITTER_PATH scene body ── resolveBitterPath(0|1|2) ──► TRAVEL
                          │                                                              │
                          │                                                              └── success: state.bitter_path_taken != "none"
                          │
                          └── Back button ── (see § 5.3 open Q) ─► TRAVEL (with silent choice 0)
```

### § 6.2 Scene state (within bitter_path.js)

```
ENTRY
  │
  ▼
  check localStorage('ot_bitter_path_cw_acked')
  │                               │
  │  === 'true'                   │  !== 'true'
  ▼                               ▼
RENDER_SCENE                   RENDER_CW_MODAL
  │                               │
  │ typewriter running            │ awaiting click
  ▼                               ├── [Continue] ─► set ack, RENDER_SCENE
AWAITING_CHOICE                   └── [Back] ─► engine.resolveBitterPath(0) silently, TRAVEL
  │
  │ click button N
  ▼
RESOLVING (loader, buttons disabled)
  │
  ├── success ─► transition TRAVEL (engine handles)
  └── error   ─► AWAITING_CHOICE (re-enable buttons, show error)
```

### § 6.3 Resume semantics

Mid-flow tab close scenarios:

| State snapshot at close | On reload |
|---|---|
| Ack not set, CW modal showing | CW modal reappears — one-shot ack not granted yet |
| Ack set, typewriter or awaiting choice | Skip CW, render scene body from fresh |
| Ack set, RESOLVING (API in flight) | Scene re-renders in AWAITING_CHOICE; server state may already be resolved — if so, second POST returns `already_resolved` and scene transitions TRAVEL |
| `bitter_path_taken !== "none"` | Scene never fires; engine should not be in BITTER_PATH state. Defend via sanity check in scene entry. |

Sanity check at scene entry:

```js
if (engine.gameState?.simulation?.bitter_path_taken !== 'none') {
  engine.transition('TRAVEL');
  return;
}
```

---

## § 7. Tests

Ryan's rule: every codepath enumerated in § 3-§ 6 has a listed test. Test runners:

- **Worker unit tests (vitest):** `worker/tests/*.test.ts` — existing 149 after C2; C3 adds a new handleBitterPath test file
- **Frontend smoke tests:** no unit-test harness for `public/` by design (vanilla JS, no build). Use `scripts/playthrough.mjs` with a new `--takeBitterPath` flag — deferred to C5 per master plan § 7.
- **Contract tests for the new endpoint wiring:** new `worker/tests/index.bitter_path.test.ts` for the `handleBitterPath` flow.

### § 7.1 Engine unit tests

No existing test harness for `public/engine.js`. The cheap win is a standalone test module that imports `engine.js` into a jsdom-ish environment.

**Option X (recommended if /plan-eng-review asks):** Add a pure dispatch function in a new `public/engine-dispatch.mjs` module imported by both `engine.js` and a new worker-side test. Clean but adds a new file.

**Option Y:** Defer all frontend tests to C5 playthrough harness.

Default to Y + Playwright harness for C3 shipping unless eng review pushes back.

### § 7.2 Required test coverage (by path)

| # | Codepath | Test type | Location |
|---|---|---|---|
| T1 | `advance()` response with `trigger === 'bitter_path'` → engine transitions to BITTER_PATH state | Playwright integration | `scripts/playthrough.mjs --takeBitterPath=0` (deferred to C5; for C3, manual dogfood) |
| T2 | `advance()` response dispatch switch has all 7 cases | Static (grep check) | Manual inspection in /plan-eng-review |
| T3 | `resolveBitterPath(0)` POSTs `/api/bitter_path` with `choice_index: 0` and applies returned state | Worker integration | new `worker/tests/handleBitterPath.test.ts` |
| T4 | `resolveBitterPath(1)` same as T3 with index 1 | Worker integration | same file |
| T5 | `resolveBitterPath(2)` same as T3 with index 2, verifies food+60, starvation_days=0, sanity-30, morale-20 | Worker integration | same file |
| T6 | `resolveBitterPath(-1)` and `resolveBitterPath(3)` early-return without API call | Worker integration | same file (assert 400 invalid_choice_index) |
| T7 | CW gate: first visit shows modal (localStorage ack not set) | Manual/Playwright | dogfood |
| T8 | CW gate: second visit skips modal | Manual/Playwright | dogfood with `localStorage.setItem('ot_bitter_path_cw_acked','true')` pre-seeded |
| T9 | CW gate Back button path — auto-resolves as choice 0, transitions TRAVEL | Manual/Playwright | dogfood |
| T10 | Mid-flow resume: tab close after CW ack but before choice → resume re-enters BITTER_PATH scene | Manual | exercise via `_saveRun()` + reload |
| T11 | Retry path: simulate 500 from `/api/bitter_path`, click button again, succeed | Playwright | dogfood with API stub |
| T12 | Spam-click guard: 3 rapid clicks on same button → only one POST fires | Manual via devtools Network tab | dogfood |
| T13 | Keyboard shortcut 1/2/3 fires `resolveBitterPath(0|1|2)` | Manual | dogfood |
| T14 | Reduced-motion: flicker candles are static when `prefers-reduced-motion: reduce` matches | Manual | dogfood with devtools emulation |
| T15 | Contrast: modal text contrast passes AA | Manual | design-review tool |
| T16 | `trigger_data` is the full `EventResponse` (after § 2 fix) | Worker unit | extend `worker/tests/anthropic.test.ts` or new handler test |
| T17 | `already_resolved` error handled gracefully → transitions TRAVEL | Manual | dogfood with doctored state |
| T18 | `event_hash_mismatch` → reload prompt | Manual | dogfood |
| T19 | `currentBitterPath` saved to `ot_saved_run` and restored on reload | Manual | exercise `_saveRun()` |
| T20 | `restart()` clears bitter_path fields | Manual | dogfood "new game" from wipe |

Tests marked "Playwright" wait on C5. Tests marked "Manual" ship with C3 and are dogfooded by Ryan on staging before merging.

### § 7.3 Regression: tests that must still pass

- All 149 existing worker tests after C2
- Smoke-travel gate (`scripts/smoke-travel.sh`) — no regression

---

## § 8. Accessibility & polish

### § 8.1 Reduced motion

`MOTION_OK` detection pattern already in `public/scenes/travel.js:5` and `public/lib/tone.mjs:6`. Adopt:

```js
const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
```

- Typewriter: if `!MOTION_OK`, show full description immediately (no per-char reveal)
- Candle flicker: only animate if `MOTION_OK`
- High-tier tone overlay from `tone.mjs` already honors reduced-motion — no changes

### § 8.2 Contrast

The `#5a1a1a` crimson border sits on the existing `rgba(30, 22, 12, 0.95)` dark brown background (index.html:61). Text is `#f5e6c8` cream. Contrast test:
- Cream on dark brown: AA pass (approx 12:1)
- Crimson border on dark brown: border only, no text contrast requirement
- Button text cream on `#2a1f0e`: existing AA pass
- Headline `#d4a017` on dark brown: approx 7:1 — AA pass

### § 8.3 Hit targets

Existing `.choice-btn` from index.html:74-88 has `padding: 12px 16px` — approximately 44px tall. WCAG 2.5.5 target size pass. CW modal inline buttons get identical padding via new `.cw-button` class.

### § 8.4 Screen reader

`#a11y-status` live region exists at index.html:99. On:
- CW modal shown: announce "Content warning"
- Scene body rendered: announce "The Long Night. Choose one of three options."
- Resolution: announce "Choice resolved. Continuing."

---

## § 9. Risks & open questions

### § 9.1 Open questions for /plan-eng-review

**Q1. The "Back" button path (§ 5.3).** Which option A/B/C/D? Recommend A.

**Q2. The C2 contract gap (§ 2 end).** OK to ship the 5-line `worker/src/index.ts` fix in C3, or split into a C2.1 micro-commit? Recommend keeping in C3 since the scene can't ship without it.

**Q3. Frontend unit test harness.** Defer (Option Y) or add jsdom/vitest client shim now (Option X)?

**Q4. CW ack cross-run memory.** Master plan § 10 says "no cross-run memory" but CW ack is cross-run by necessity. Confirm localStorage is acceptable for this one key. Recommend yes — it's meta-UI state, not game state.

**Q5. Candle flicker detail.** Scene is described as "candles, night, silhouettes — NOT gore." Does pixel candle art (two 6px tinted rects) hit that bar, or does the scene need a minimal bespoke primitive addition to `public/lib/draw.mjs`? Recommend rect primitives for C3.

### § 9.2 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Spam-click during loading → double API call | `_resolvingBitterPath` flag in engine (§ 3.3), buttons disabled on click (§ 4.3) |
| R2 | User closes tab mid-CW before ack → next session re-shows CW | Acceptable; CW re-appears on fresh session |
| R3 | CW modal shown but overlay has content from lingering scene | Clear overlay on scene entry (same pattern as event.js:47) |
| R4 | `trigger_data` missing event body (see § 2) | Fix C2 gap in C3's first commit; block C3 merge until fixed |
| R5 | Sanity-steal accidentally applies to bitter_path scene | Scene does not re-implement agency-steal; verified in code review |
| R6 | Slow network sees "loading" >10s, user concludes hang | Add timeout warning after 6s: "Still working..." |
| R7 | Mid-typewriter, user hits 1/2/3 → choice fires before full text shown | By design, matches event.js behavior |
| R8 | Analytics hooks not instrumented — C5 refactor painful | Flag instrumentation points in code comments (§ 9.3) |
| R9 | Horror-tier palette makes text unreadable | Contrast check (§ 8.2) — AA verified in design-review |
| R10 | Safari serialization issues for `currentBitterPath` | `EventResponse` is flat JSON, no risk |

### § 9.3 Analytics instrumentation points (for C5)

Comments in code at these locations, documented here so C5 implementation is surgical:

```js
// [C5 ANALYTICS] bitter_path_scene_shown - on scene entry after CW ack
// [C5 ANALYTICS] bitter_path_cw_shown - when CW modal renders
// [C5 ANALYTICS] bitter_path_cw_continue - on continue click
// [C5 ANALYTICS] bitter_path_cw_back - on back click
// [C5 ANALYTICS] bitter_path_choice_0 - dignified
// [C5 ANALYTICS] bitter_path_choice_1 - hopeful
// [C5 ANALYTICS] bitter_path_choice_2 - taken
// [C5 ANALYTICS] bitter_path_retry - on error retry
```

---

## § 10. File list

### § 10.1 Files to modify

| Path | Lines of change | Summary |
|---|---|---|
| `public/engine.js` | ~60 | New `resolveBitterPath()` method (~40 lines), switch case in `advance()` (~6 lines), `_saveRun`/`_loadSavedRun`/`restart`/`getResumeScene` updates (~14 lines) |
| `public/main.js` | +1 | Add `BITTER_PATH: 'bitter_path'` to sceneMap; import scene module; register it |
| `worker/src/index.ts` | ~5 | Fix `trigger_data` inclusion for `bitter_path` trigger (§ 2) |
| `worker/src/types.ts` | +2 | Add `trigger_meta?: unknown` to `AdvanceResponse` interface |

### § 10.2 Files to create

| Path | Lines | Summary |
|---|---|---|
| `public/scenes/bitter_path.js` | ~180 | New scene: CW gate, scene body, typewriter, choices, error handling, cleanup. Mirrors `event.js` structure. |
| `worker/tests/handleBitterPath.test.ts` | ~150 | Unit tests for the `/api/bitter_path` handler. Mocks HMAC secret + bypasses HTTP. |

### § 10.3 Size budget

Total C3: ~400 lines added, ~10 lines modified across 6 files.

- `public/scenes/bitter_path.js` budget: ≤200 lines
- `public/engine.js` delta budget: ≤70 lines
- `worker/tests/handleBitterPath.test.ts` budget: ≤180 lines
- Worker index.ts + types.ts delta budget: ≤10 lines combined

### § 10.4 Files NOT touched in C3

Explicit non-targets (to prevent scope creep):
- `worker/src/simulation.ts` — C2 territory, no changes
- `worker/src/anthropic.ts` — C2 territory, no changes
- `public/scenes/event.js` — unchanged (bitter_path is separate scene)
- `public/scenes/tone.js` — C4 adds the challenge-pitch line
- `worker/src/historical-context.json` — C4 adds ambient hints
- `worker/src/prompt-assembly.ts` — C4 adds situational hints
- `scripts/playthrough.mjs` — C5 adds `--takeBitterPath` flag
- `public/index.html` — no HTML shell changes needed
- `public/sw.js` — no PWA cache changes

---

## § 11. Deliverable checklist for merge

C3 is ready to merge when:

- [ ] § 2 backend contract gap fixed (`trigger_data` includes event body for bitter_path)
- [ ] Engine dispatch branch for `bitter_path` added, saves/restores handle it
- [ ] `resolveBitterPath()` method shipped with spam-click guard
- [ ] `public/scenes/bitter_path.js` scene file shipped matching event.js patterns
- [ ] `public/main.js` imports and registers the scene
- [ ] CW modal shown on first visit, skipped on subsequent visits
- [ ] "Back" button path implements the chosen § 5.3 option (recommended A)
- [ ] Keyboard shortcuts 1/2/3 work
- [ ] Reduced-motion respected (typewriter + candle flicker)
- [ ] Contrast AA verified
- [ ] Resume mid-bitter-path works per § 6.3 matrix
- [ ] Error paths (`event_hash_mismatch`, `already_resolved`, network) handled
- [ ] `worker/tests/handleBitterPath.test.ts` landed, all tests pass
- [ ] Analytics instrumentation comments in place per § 9.3
- [ ] Dogfooded by Ryan on staging: all 3 choices + CW + back path all arrive at expected state
- [ ] `npx vitest run` green (expect ~155 tests)
- [ ] `scripts/smoke-travel.sh` green
- [ ] /plan-eng-review + /plan-design-review + /codex review gates cleared

---

## § 12. Sequencing & commits within C3

C3 splits into 3 sub-commits for bisectability:

**C3.a — Backend contract fix** (10 min)
- `worker/src/index.ts`: ship full `EventResponse` as `trigger_data` when trigger is bitter_path
- `worker/src/types.ts`: add optional `trigger_meta`
- `worker/tests/`: add test confirming contract
- Merge after /plan-eng-review signoff on § 2

**C3.b — Engine wiring + scene** (60 min)
- `public/engine.js`: dispatch + method + save/resume/restart
- `public/main.js`: register scene
- `public/scenes/bitter_path.js`: full scene, CW gate, typewriter, choices, errors, a11y, reduced-motion
- Manual dogfood on staging

**C3.c — Handler tests** (20 min)
- `worker/tests/handleBitterPath.test.ts`: 6-8 tests per § 7.2 T3-T6, T16-T18
- `npx vitest run` green

Tag `pre-bitter-path` was placed before C1. If C3 needs to roll back, revert C3.c → C3.b → C3.a. No state migration concerns: all C3 changes are UI + wire-contract.

---

## § 13. Review gauntlet expected asks

### /plan-eng-review
- Back path choice (§ 5.3)
- Should the C2 gap be split into its own commit?
- Why no frontend unit tests?
- What if `bitter_path_taken` is modified between the advance response and the resolve call?
- Should `event` body live on `state.simulation.pending_event` (server memory) instead of round-tripping the client? Answer: no, pattern consistency with `/api/choice` — hash protects against tampering.

### /plan-design-review
- Modal copy: "cannibalism" explicit vs euphemistic
- Crimson accent — too horror-cliché?
- Typewriter timing 30ms/char — slower/faster?
- Candle flicker — ship or cut?
- "Take me back" vs "No thanks" vs "Skip"
- Button order on CW modal (continue-first vs back-first for psychology)

### /codex review
- Spam-click race: is `_resolvingBitterPath` enough, or do we need a per-request token?
- localStorage key namespace — `ot_` prefix adoption consistent?
- Any way the CW ack can be manipulated adversarially to show graphic content to unacked players? Answer: no — the ack only gates client-side modal rendering; scene content is server-side gated
- Accessibility: live region timing — is the announce fast enough?
- Reduced-motion: typewriter fallback is abrupt — consider fade-in
- Error retry idempotency: server is idempotent by hash-match + `already_resolved`

---

## § 14. Risk-weighted timeline

| Phase | Best case | Worst case | Probable |
|---|---|---|---|
| C3.a backend fix + test | 10 min | 25 min | 15 min |
| C3.b scene + engine | 60 min | 120 min | 90 min |
| C3.c handler tests | 20 min | 40 min | 25 min |
| Reviews + bounce cycles | 0 | 3 hours | 1 hour |
| **Total** | **90 min** | **5 hours** | **2.5 hours** |

Matches master plan § 7 C3 estimate of 90 min in the best case; realistic with review cycles ~2.5 hours.

---

END OF PLAN.
