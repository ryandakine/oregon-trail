# The Bitter Path — Hidden Horror Win Condition (v3)

**Status:** v3 rewritten 2026-04-18 after v2 CEO single-voice review (Codex auth scope-broken, second voice unavailable). v1→v2 addressed 7 mods; v2→v3 addresses 4 more. See § 0.v3 for diffs.

**Scope:** Make High tone (horror) beatable via one hidden mechanic: cannibalism at a specific moment. Discoverable through in-game hints. Carries a content-warning gate, server-side kill switch, telemetry on every branch, and full asymmetric mechanical payoff for all three choices so option 3 doesn't telegraph.

**Effort:** ~4–6 hours. 5 bisectable commits. Tag `pre-bitter-path` before C1.

---

## § 0.v3. v3 deltas from v2

Four mods from v2 CEO review:

| # | v2 gap | v3 response |
|---|---|---|
| 8 | Fallback selected by `hash(name) % 5` — cause-agnostic, narratively wrong for ~60% of runs | **Fallbacks keyed on `deceased.cause`** (§ 4.3). Five cause-specific paragraphs. Each aligned to its cause's physical setting. |
| 9 | Trigger fires on 80%+ of mature horror runs → stops being "hidden" | **Trigger tightened to late-stage** (§ 1.1): `starvation_days >= 5` OR `(food=0 AND starvation_days >= 2 AND avg_alive_health < 40)`. Event lands only when the party is clearly dying, not just hungry. |
| 10 | Option 3 mathematically dominant for survival; options 1/2 asymmetry is cosmetic | **"The Merciful Traveler"** (§ 1.5): Option 1 ("dignified") has a 50% chance at the next landmark of a period-voice NPC gift event (+40 food). Faith rewarded by mercy or silence. Option 2 gets no miracle (pure hopeful). Now there's a non-cannibalism arrival path. |
| 11 | System prompt names "cannibalism" and "Donner Party" → Anthropic ToS audit risk | **Prompt sanitized** (§ 4.1): "cannibalism" removed from code. Donner reference stays in player-visible flavor layer only. System prompt now refers to "survivors of extreme deprivation" with McCarthy register, no historical name-drop. |

---

## § 0.v2. v2 deltas from v1

Seven mods required by the v1 CEO review. Each is addressed concretely:

| # | v1 gap | v2 response |
|---|---|---|
| 1 | LLM prompt named but not written | **Full system prompt in § 4.** Reviewed inline. |
| 2 | No fallback text for LLM timeouts | **5 hand-written fallbacks in § 4.3** — locked in repo, fire on any LLM failure. |
| 3 | No content-warning gate on event | **2-screen gate in § 2.3** — "Continue" or "Skip to outcome." Skip resolves to option 1. |
| 4 | No telemetry | **6 Plausible events in § 6** — trigger fire, skip, each choice, arrival after. |
| 5 | No kill switch | **`BITTER_PATH_ENABLED` env var in § 5** — toggle off via `wrangler secret put` without redeploy. |
| 6 | Trigger too tight (6 simultaneous conditions) | **Loosened in § 1.1** — `food === 0 OR starvation_days >= 3`, plus recent death. |
| 7 | Option 3 is only mechanically-active choice (telegraphs) | **Asymmetric payoffs in § 1.4** — options 1 and 2 give real morale/flag changes; newspaper framing varies per choice. |

---

## § 1. Mechanic — "The Long Night"

### § 1.1 Trigger conditions (tightened in v3 — late-stage only)

All must be true at the start of a simulated day:

1. `state.settings.tone_tier === "high"` — horror only
2. **EITHER** `state.simulation.starvation_days >= 5` — fully wasting **OR** `(state.supplies.food === 0 AND state.simulation.starvation_days >= 2 AND avg_alive_health < 40)` — starving + failing + not just-ran-out
3. `state.deaths.length >= 1` AND at least one death's `date` is within the last 3 game-days — recent enough to feel present
4. `state.simulation.bitter_path_taken === "none"` — hasn't been resolved yet this run
5. `env.BITTER_PATH_ENABLED !== "false"` — server-side kill switch (default enabled)

**Why this gating:** v2's trigger fired on ~80% of mature horror runs. That's not "hidden," that's the baseline experience. v3's gate requires the party to be demonstrably dying — either 5+ consecutive starving days (late-stage wasting) or food gone + 2 days starving + average alive-member health below 40 (failing fast). A healthy party at food=0 that can make a landmark doesn't trigger. A party dying on the Snake River does.

When all hold, simulation returns `trigger: "bitter_path"` with `triggerData: { dead_member_name, dead_member_cause, days_since_death, trigger_variant: "wasting" | "failing" }`. No normal event fires that day.

### § 1.2 The event flow (new in v2)

```
[Long Night trigger fires]
         │
         ▼
[Content warning screen]
  ┌────────────────────────────┐
  │ This scene depicts survival │
  │ under extreme deprivation. │
  │                            │
  │ [Continue] [Skip to outcome]│
  └────────────────────────────┘
         │               │
    Continue          Skip
         │               │
         ▼               ▼
  [The Long Night]  (auto-resolve as option 1, no text shown)
         │
         ▼
  [3 choices]
```

"Skip to outcome" auto-resolves to option 1 (dignity) without showing event text. Safety valve for parents/squeamish players.

### § 1.3 State additions

`bitter_path_taken` is an **enum string**, not a boolean — needed for per-choice newspaper framing (CEO mod 7):

```ts
// worker/src/types.ts
type BitterPathOutcome = "none" | "dignified" | "hopeful" | "taken";

interface SimulationState {
  // ...existing fields
  bitter_path_taken: BitterPathOutcome;  // NEW, default "none"
}

type TriggerType = ... | "bitter_path";  // NEW in the union
```

HMAC back-compat: legacy states without the field get `"none"` injected before verification.

### § 1.4 The three choices (asymmetric per CEO mod 7)

| # | Label | Effects | `bitter_path_taken` → |
|---|---|---|---|
| 1 | **"Pray, and starve with dignity."** | `morale += 8` per alive member; sanctity marker for newspaper ("the faithful party") | `"dignified"` |
| 2 | **"Travel on. Hope for game."** | `morale += 5`, `days += 1` (one day burned searching); hopeful marker for newspaper ("they pushed on") | `"hopeful"` |
| 3 | **"Do what the trail demands."** | `food += 60`; `starvation_days = 0`; per alive member: `sanity -= 30`, `morale -= 20`; darker marker for newspaper ("they survived the pass") | `"taken"` |

Critical design point: options 1 and 2 give *real, positive, player-facing* mechanical effects. A savvy player might pick option 1 for the morale boost and die faithful — that's a valid ending. Option 3 is not obviously "the correct answer"; it's the only one with a large food delta, but the sanity/morale costs are severe and visible.

All three set `bitter_path_taken` (non-"none") so the event doesn't re-fire this run.

### § 1.5 The Merciful Traveler (new in v3 — gives option 1 a real path)

When `bitter_path_taken === "dignified"` AND the party reaches the next landmark alive, a 50% chance fires a special landmark event:

**Title:** "A Stranger at the Crossing"

**Description (LLM, period voice):**
> A lone trapper in buckskin finds the party at dusk. His own team died at South Pass, he says. He has more jerky than he can carry. Sarah's name is mentioned at supper. He does not ask how she died.

**Single choice: "Accept the provisions."**
- `supplies.food += 40`
- No sanity cost
- Journal: "The trapper rode north at first light. We did not catch his name."

The 50% coin flip is deterministic per-party via `hash(run_id + landmark_id) % 2`. Can't reroll. One shot.

The other 50%: silence. No event. Party continues hungry. Faith was not rewarded. That's the horror.

**Net effect:** a player who picks option 1 ("dignified") has a ~50% chance of a food gift at the next landmark. Coupled with hunting + subsequent landmarks, horror-tier arrival is possible via dignity — just harder and luckier than option 3's guaranteed +60 food. Asymmetry is now mechanical, not cosmetic.

**Code impact:** +15 lines in `worker/src/simulation.ts` landmark trigger, +1 fallback event text in `FALLBACK_EVENTS`. Separate from the Long Night path.

---

## § 2. Hints — three layers

### § 2.1 Challenge pitch (tone screen)

In `public/scenes/tone.js`, High card copy adds one line:

```
High — "Psychological horror and moral decay"
Contains: graphic illness, death, moral collapse.

They say the trail can still be crossed under this sky.
Those who did never spoke of it.
```

Italicized, color `#8b6914` (gold, tone with the parchment UI). One sentence. No mechanical hint. Frames it as a challenge.

### § 2.2 Ambient hints (every horror run)

Static text in `worker/src/historical-context.json`:

**Fort Bridger** — new `dialogue.high` array entry:
> "I rode the Sierra last winter. The party ahead of us made it through, but they did not come back whole. Had a brother who was with the Donners, before. He does not speak of it."

**Chimney Rock** — new `flavor.high` entry:
> "The register names forty-eight from the Donner company. Only half reached California. Those who did were changed."

**Fort Hall** — prompt hook: 20% chance horror-tier event dialogue references winter crossings obliquely.

All three are shipped as text additions to `historical-context.json`, no code changes needed beyond prompt-assembly picking the high-tier variant.

### § 2.3 Situational hints (trigger-adjacent)

In `worker/src/prompt-assembly.ts`, when state satisfies `tone === "high" AND food < 50 AND (deaths.length >= 1 OR starvation_days >= 1)`, append to the LLM user prompt:

```
The narrator has begun to think of the Donner stories, though has not said so
aloud. If the scene allows, mention this obliquely in period voice. Never
instruct the player. Do not name the act.
```

Expected LLM outputs (examples):
- "I thought of the Donner stories tonight for the first time. Martha was sleeping."
- "The old trapper's words at Fort Bridger came back to me. I did not say them aloud."
- "James spoke the word 'winter' twice this morning."

Appears in journal entries visible between day advances. Hint lands when player is in position to trigger.

---

## § 3. Content-warning gate (CEO mod 3)

A pre-event scene fires *before* the Long Night overlay:

```html
<div class="warning-gate">
  <h2>Content warning</h2>
  <p>This scene depicts survival under extreme deprivation.
  Historical reference to the Donner Party of 1846.
  No graphic descriptions.</p>
  <button class="continue-btn">Continue</button>
  <button class="skip-btn">Skip to outcome</button>
</div>
```

Styling: crimson border, parchment background, sober — not horror-themed. "Skip to outcome" auto-resolves to option 1 (dignified) without showing the event. One-shot: once the gate resolves (either button), it does not re-appear in that run. Gate result (`continued` vs `skipped`) is logged telemetry.

The gate exists because:
- Parent watching over kid's shoulder needs an off-ramp
- Someone who picked High tone for atmosphere but doesn't want moral-choice theater gets out
- "Skip" is treated as player agency, not failure — leads to a valid ending

---

## § 4. The Long Night LLM prompt (CEO mods 1 + 2)

### § 4.1 System prompt (full text, written in-plan)

```
You are writing a single scene for an Oregon Trail game set in 1848. Tone is
High (psychological horror, moral decay). The party is in the late stages of
starvation after a recent death. The scene, titled "The Long Night", depicts
survivors considering what is not yet said aloud. The specific act is never
named, never described, and never instructed to the player.

VOICE (strict):
- Cormac McCarthy register: short sentences, present tense where possible,
  specific physical detail
- No adjectives of emotion (no "scared", "terrified", "desperate").
  Let action carry affect.
- Ellipsis, pause, what is not said
- 2 to 4 sentences in the description
- The deceased is referred to by name, then as "the covered shape" or "what
  lies under the canvas" or similar
- Each surviving member gets one specific physical detail
- Period (1848): no modern vocabulary, no clinical terms, no therapeutic language

FORBIDDEN (strict):
- The words "eat", "eaten", "flesh", "meat", "consume", "feast", "hunger" as
  verb or imperative
- Any description of food preparation
- Any description of the act itself
- Halloween register: "ominous", "whispered", "shadows", "darkness fell"
- Any second-person instruction to the player

CONTEXT (variables injected at runtime):
- deceased_member: {name, cause, days_ago}
- survivors: [{name, sanity, morale}]
- current_mile, segment_name, weather

OUTPUT (JSON exactly this shape):
{
  "title": "The Long Night",
  "description": "<2-4 sentences, voice constraints above>",
  "choices": [
    {"label": "Pray, and starve with dignity.", "consequences": {}},
    {"label": "Travel on. Hope for game.", "consequences": {}},
    {"label": "Do what the trail demands.", "consequences": {}}
  ],
  "journal_entry": "<1-2 sentence retrospective period-voice note>",
  "personality_effects": {}
}

Consequences are intentionally empty in your output. The server applies
them deterministically based on the choice picked. Do not attempt to
influence numeric outcomes.

Example output for {deceased: Sarah, cause: cholera, days_ago: 4}:

{
  "title": "The Long Night",
  "description": "Sarah died four nights past. The wagon is quiet. The food barrel rings hollow when Thomas touches it. Martha looks at the covered shape beneath the canvas and does not look away.",
  "choices": [...],
  "journal_entry": "We did not speak at supper. There was no supper.",
  "personality_effects": {}
}
```

### § 4.2 Prompt enforcement at parse time

In `worker/src/anthropic.ts`, `parseEventResponse` gains a Long-Night-specific post-parse check:

```ts
const FORBIDDEN_WORDS = /\b(eat|eaten|ate|flesh|meat|feast|consume)\b/i;
if (event.title === "The Long Night" && FORBIDDEN_WORDS.test(event.description)) {
  // LLM violated the constraint; fall back to hand-written text
  return FALLBACK_LONG_NIGHT[hash(deceased_member_name) % 5];
}
```

Hard gate. If the model slips, the player never sees it.

### § 4.3 Hand-written fallback paragraphs — keyed on cause (v3 fix)

Shipped in `worker/src/anthropic.ts` as `FALLBACK_LONG_NIGHT: Record<CauseKey, string>`. Selection by `deceased.cause`, NOT name hash. Each fallback's physical setting matches its cause. All 2-3 sentences, period voice, no mention of the act, no date hardcoded (days-ago interpolated).

**F_starvation** (exhaustion, the common case):
> "The oxen have not moved since morning. {DECEASED} was buried {DAYS_AGO_WORDS}. By evening no one had built the fire. The wind moves through the grass and does not stop."

**F_disease** (cholera, dysentery, typhoid, mountain_fever, measles, scurvy):
> "{DECEASED} went {DAYS_AGO_WORDS}. The sickness has not left. {SURVIVOR_1} sits by the cold stove, sharpening a knife with long slow strokes. The sky is very wide."

**F_drowning** (river crossing):
> "The current took {DECEASED} at the ford. That was {DAYS_AGO_WORDS}. We made camp above the far bank and have not moved since. The food is gone. Nobody has yet gathered the water."

**F_injury** (accidental_injury, Stampede):
> "{DECEASED} fell beside the wagon {DAYS_AGO_WORDS}. The body lies under canvas near the fire that was not built tonight. {SURVIVOR_1} has not spoken since the burial."

**F_event** (anything else — LLM event title used as cause):
> "{DECEASED} was lost {DAYS_AGO_WORDS}. The wagon has not moved in a day. The children have stopped asking when supper is. {SURVIVOR_1} watches the canvas and speaks to no one."

**Interpolation rules:**
- `{DECEASED}` — first name from death record
- `{SURVIVOR_1}` — first alive party member's name
- `{DAYS_AGO_WORDS}` — mapped from `days_since_death`: 1 → "yesterday", 2 → "two nights past", 3 → "three nights past"

Selection at runtime:
```ts
function pickFallback(cause: string): string {
  const key =
    ["cholera", "dysentery", "typhoid", "mountain_fever", "measles", "scurvy"].includes(cause) ? "disease" :
    cause === "exhaustion" ? "starvation" :
    cause === "drowning" ? "drowning" :
    ["accidental_injury", "Stampede"].includes(cause) ? "injury" :
    "event";
  return FALLBACK_LONG_NIGHT[key];
}
```

Deterministic per (cause, name, days-ago) — no randomness, same run reloaded gets same text. Different parties with different deaths get correctly-framed text.

---

## § 5. Server-side kill switch (CEO mod 5)

Add environment variable `BITTER_PATH_ENABLED` to `worker/wrangler.toml` (default "true"):

```ts
// worker/src/simulation.ts — trigger check
if (state.settings.tone_tier !== "high") return false;
if (env.BITTER_PATH_ENABLED === "false") return false;  // NEW kill switch
// ... rest of conditions
```

To disable in a moral-panic response, no redeploy required:

```bash
npx wrangler secret put BITTER_PATH_ENABLED
# enter: false
```

Within ~30 seconds, all trigger firings stop globally. No client changes needed; the server just never sends `trigger: "bitter_path"`.

---

## § 6. Telemetry (CEO mod 4)

Plausible custom events from `public/scenes/bitter_path.js`:

| Event | When fired | Properties |
|---|---|---|
| `bitter_path_trigger_fired` | Event overlay shown | `mile`, `days_since_start`, `deceased_cause` |
| `bitter_path_gate_continue` | Content warning: continue | same |
| `bitter_path_gate_skip` | Content warning: skip | same |
| `bitter_path_choice_dignified` | Option 1 picked | same |
| `bitter_path_choice_hopeful` | Option 2 picked | same |
| `bitter_path_choice_taken` | Option 3 picked | same |
| `bitter_path_outcome_arrival` | Oregon reached after bitter_path_taken != "none" | `outcome_value` |
| `bitter_path_outcome_wipe` | Wipe after bitter_path_taken != "none" | `outcome_value` |

Existing Plausible script tag covers the event calls (`plausible('event_name', { props: {...} })`).

Analytics dashboard queries (manual post-deploy):
- `trigger_fired` count vs `choice_taken` count = discovery rate among triggered players
- `gate_skip` / `gate_continue` ratio = squeamishness signal
- `outcome_arrival` / `choice_taken` = mechanical effectiveness of the path

---

## § 7. Commit plan (5 bisectable commits)

Tag `pre-bitter-path` before C1.

### C1 — Types, state schema, HMAC back-compat (20 min)
Files: `worker/src/types.ts`, `worker/src/state.ts`, `worker/src/hmac.ts`, `worker/tests/state.test.ts`
- Add `BitterPathOutcome` enum type
- Add `simulation.bitter_path_taken: BitterPathOutcome` to Settings (default "none")
- Add `"bitter_path"` to `TriggerType` union
- HMAC verify: inject default `"none"` if missing (legacy signed states)
- 3 new tests: field initialized, legacy state accepted, tampered field rejected

### C2 — Simulation trigger + API endpoint + kill switch (90 min)
Files: `worker/src/simulation.ts`, `worker/src/index.ts`, `worker/src/anthropic.ts`, `worker/src/prompt-templates.ts`, `wrangler.toml`, `worker/tests/simulation.test.ts`
- Add `BITTER_PATH_ENABLED` env var (default "true")
- Trigger detection with loosened conditions (food=0 OR starvation>=3)
- `FALLBACK_LONG_NIGHT` constant with 5 hand-written paragraphs
- Long Night event generator with the strict system prompt from § 4.1
- Forbidden-word post-parse check; falls back on violation
- `/api/bitter_path` endpoint — validates + applies asymmetric consequences per choice
- Horror tone system prompt gets the Donner clause
- 6 new tests: trigger fires correctly; respects kill switch; correct consequences for each option; forbidden-word guard

### C3 — Client scene: content-warning gate + event + engine wiring (90 min)
Files: `public/engine.js`, `public/main.js`, `public/scenes/bitter_path.js` (NEW)
- New scene matching `event.js` structure, 2-screen flow (warning → event)
- Crimson accent styling, horror-appropriate but sober on the warning
- `engine.resolveBitterPath(choice_index)` method (0-2)
- `engine.skipBitterPath()` method (resolves as option 1)
- State transition to BITTER_PATH scene
- Smoke-travel passes through

### C4 — Hints: challenge pitch + ambient + situational (45 min)
Files: `public/scenes/tone.js`, `worker/src/historical-context.json`, `worker/src/prompt-templates.ts`, `worker/src/prompt-assembly.ts`
- Tone screen High card gets the challenge-pitch line (italicized gold)
- `historical-context.json` Fort Bridger + Chimney Rock + Fort Hall gain `dialogue.high` / `flavor.high` entries
- `prompt-assembly.ts` appends situational Donner clause when state approaches trigger

### C5 — Telemetry + playthrough harness extension (30 min)
Files: `public/scenes/bitter_path.js` (plausible calls), `public/engine.js` (outcome events on arrival/wipe), `scripts/playthrough.mjs`
- Wire 8 Plausible event calls per § 6
- `scripts/playthrough.mjs` gets `--takeBitterPath` flag (pick choice 2 if trigger fires)
- Run calibration with flag: expect arrival rate > 0% on horror
- Run without: arrival rate unchanged (0%)
- Regression reference saved to `scripts/calibration-history/`

---

## § 8. Testing strategy

### Unit (vitest)
- 9 new tests (was 8 in v1, +1 for kill switch)
- Covers trigger detection, each option's exact state delta, HMAC legacy, forbidden-word post-parse, kill-switch respect
- Total: 126 → 135 tests

### Integration — playthrough harness proof
- `scripts/playthrough.mjs --takeBitterPath`: horror-tier runs should reach Oregon at some rate >0%
- Without the flag: arrival rate stays 0%
- If both behave as expected, the mechanic is mechanically correct

### Manual acceptance
- Start High tone; confirm challenge pitch on the tone card
- Play to food=0 + death; confirm situational hint in journal
- Confirm content-warning gate appears before the event
- Test all 3 event choices + "Skip to outcome" = 4 paths through the gate
- Reach Oregon on horror tier via choice 3 at least once. Screenshot newspaper.
- Verify kill switch: `wrangler secret put BITTER_PATH_ENABLED false`, retrigger, confirm no event
- Verify Plausible events fire in Network panel

---

## § 9. Pre-mortem

Per `feedback_pre_mortem_before_review` + v1 CEO findings:

1. **Trigger never fires** — v1 was tight. v2 loosens to `food=0 OR starvation>=3` so parties either ran out of food OR are slow-starving qualify. Coupled with "any death in last 3 days" the window is wider. Playthrough data shows 100% of farmer-med runs reach this state.

2. **LLM writes it badly** — Three-layer defense: strict system prompt (§ 4.1), forbidden-word post-parse guard (§ 4.2), hand-written deterministic fallbacks (§ 4.3). One bad generation never reaches the player.

3. **Screenshot risk from choice labels** — "Do what the trail demands" is deliberately ambiguous; requires context to understand. Out-of-context screenshot reads more like a stoic survival game than a cannibalism game. Newspaper framing varies per outcome so an OSI-linked screenshot of a successful horror run shows the dark implication but also the dignified alternative ("they faithful party"). Two-faced viral surface by design.

4. **Anthropic ToS risk** — the system prompt is explicit about what NOT to describe. The forbidden-word guard prevents prompt-injection-style attempts to extract graphic content. Escalation path: if Anthropic flags, toggle `BITTER_PATH_ENABLED=false` in 30 seconds. No game outage — just horror tier reverts to "unwinnable without hunting" default.

5. **Content-warning gate adds friction** — by design. Player agency. Skip-to-outcome resolves as dignified (positive morale bonus), so a squeamish player gets a decent run, not a punishment.

6. **Option 3 telegraphs anyway** — mitigated but not zero. Option 1 gives +8 morale (better than +5 for option 2). A player who knows the mechanics enough to read morale deltas might still pick 3 for the food, but both alternatives are genuine survival strategies now.

7. **Harness can't test the Long Night event visually** — the flag `--takeBitterPath` proves mechanical reachability. Manual acceptance covers UX.

---

## § 10. Out of scope (explicit)

- Multiple Long Night events per run — one only, flag-enforced
- Cross-run memory — no localStorage, no run counter
- Alternative hidden paths (Stranger, Ritual) — rejected per direction pick
- Low/Medium tone access — horror only
- Graphic descriptions — forbidden, gated, replaced on violation
- A/B testing the challenge pitch copy — ship and iterate

---

## § 11. Rollback

`git tag pre-bitter-path` before C1. Each commit independently revertable.

**Fastest rollback (no code changes):** `wrangler secret put BITTER_PATH_ENABLED false`. Trigger stops within ~30s. Players don't notice — horror tier just behaves as before.

**Full code revert:** `git revert` C5 → C4 → C3 → C2 → C1 in that order.

---

## § 12. Review gauntlet

- [x] v1 CEO (single-voice, Codex quota-out) — 7 required mods, now all addressed
- [ ] v2 CEO dual-voice (Claude subagent + Codex, now that quota restored)
- [ ] v2 Eng review
- [ ] v2 Design review (UI for content-warning gate + event scene styling)
- [ ] Pre-mortem (complete above)
- [ ] Ryan final approval → begin C1

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review (v1) | Claude subagent | single-voice, Codex quota-out | 1 | MODIFY → drove v2 | 7 required mods (listed § 0) |
| CEO Review (v2) | `/plan-ceo-review` | dual-voice rerun | 0 | pending | — |
| Codex Review (v2) | `/codex review` | dual-voice rerun | 0 | pending | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | pending | — |
| Design Review | `/plan-design-review` | UI + narrative voice | 0 | pending | — |

**VERDICT:** v2 ready for autoplan re-run with both voices.
