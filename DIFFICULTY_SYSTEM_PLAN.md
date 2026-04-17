# Difficulty System — Implementation Plan (v1)

**Status:** Plan ready for review gauntlet. NOT implemented yet.
**Target:** Add orthogonal `difficulty: "easy" | "medium" | "hard"` axis alongside existing `tone_tier`, giving players 9 tone×difficulty combinations.
**Scope:** ~6–8 hours implementation. 4 commits. Covered by existing 124 worker tests + ~15 new tests.
**Origin:** Ryan reported v3 "died in 20 miles" — root bug (1-event wipe) fixed 2026-04-17. But the game stays too hard for casual first-time players (3/3 playtests wiped). Conclusion: don't water down Medium tone; add a difficulty axis so horror tier stays brutal AND casuals get a landing zone.

---

## § 0. TL;DR

Tone and difficulty are currently conflated in one field (`tone_tier`). That field does both narrative work (LLM system prompts, visual overlay, sanity mechanic) and implicit difficulty work (LLM event severity, game feel). Splitting them into two orthogonal axes gives us a 3×3 matrix:

|  | **Easy** | **Medium (current)** | **Hard** |
|---|---|---|---|
| **Low tone** | Classroom, ~80% survival | Family road trip, ~50% | Period-accurate, ~20% |
| **Medium tone** | Accessible, ~60% | Current default, ~30% | Hardcore history, ~10% |
| **High tone** | Creepy but fair, ~40% | The Haunting, ~15% | **Viral-screenshot cell**, ~3–5% |

**Axis ownership:**
- **Tone** = narrative only (LLM system prompt, fallback events, visual overlay, sanity mechanic, gore descriptions). No survival-math impact.
- **Difficulty** = survival economy only (disease rates, food consumption, starvation timing, event consequence clamps, starting money). No narrative change.

Any LLM prompt that currently receives `tone` does NOT need `difficulty` — difficulty is enforced server-side by the simulation and clamp math. Keeps prompt tokens unchanged.

---

## § 1. Research findings (that changed the plan)

Dispatched two agents in parallel. Key takeaways applied below:

**From Rimworld (Storyteller × Difficulty):** the mental model "tone = when/how events arrive, difficulty = how hard they hit" is the cleanest framing. Two sequential screens > one 9-cell grid. Players parse a grid as correlated rows/columns; two screens teach independence.

**From Frostpunk:** show numeric deltas on difficulty, prose on tone. "Food consumption +20%, disease chance +50%" beats "Harder."

**From Darkest Dungeon (Stygian):** Hard tier needs an explicit warning string. "Recommended after one full playthrough."

**From FTL (difficulty + AE toggle):** two independent toggles, side by side, with labels that are verbs/questions, not bare nouns. "How dark?" and "How hard?" beats "Tone" and "Difficulty."

**From Rimworld Custom (do NOT copy):** do not ship custom sliders. Preset tiers only. Telemetry says most players use presets anyway.

**From DF (anti-pattern):** do not expose raw parameter sheets. Abstract behind tiers.

**From Oregon Trail 1985 (profession-as-difficulty):** already have this — banker ($1600) is stealth-easy vs farmer ($400). Doesn't replace an explicit difficulty axis, but interacts with it: Easy + Banker = double-easy; Hard + Farmer = double-hard. Matrix stays honest.

---

## § 2. Codebase audit (what changes, where)

Dispatched Explore agent on /home/ryan/code/oregon-trail. Summary of touchpoints:

| Layer | File | Current | Change |
|---|---|---|---|
| Types | `worker/src/types.ts` | `ToneTier`, `Settings.tone_tier`, `StartRequest.tone_tier`, `ChallengeConstraints.force_tone` | Add `Difficulty`, `Settings.difficulty`, `StartRequest.difficulty?`, `ChallengeConstraints.force_difficulty` |
| State init | `worker/src/state.ts:58,96` | `createInitialState(…, toneTier, …)` writes tone + respects challenge.force_tone | Add `difficulty` param + write + respect challenge.force_difficulty |
| Challenges | `worker/src/state.ts:32–43` | 10 challenges, some set `force_tone` | Add `force_difficulty` to nightmare (hard) + rich_fool (optional medium). Others null. |
| Clamp | `worker/src/state.ts:241–287` | `clampConsequences(c)` applies fixed bounds | Add `difficulty` param; scale negative-side bounds by factor (0.7 easy / 1.0 med / 1.3 hard) |
| Simulation | `worker/src/simulation.ts:130–150` | Disease onset: `base_probability * regionRisk * monthRisk` | Add `* difficultyMultiplier` (0.5 / 1.0 / 1.5) |
| Simulation | `worker/src/simulation.ts:161–163` | Mortality: `ceil(100 * mortality_rate / progression_days)` | Scale by `difficultyMortality` (0.7 / 1.0 / 1.3) |
| Simulation | `worker/src/simulation.ts:19–29` | `PACE_MILES`, `RATIONS_PER_PERSON` constants | Unchanged — difficulty adjusts food-per-day via rations multiplier OR via a new `rationsEfficiency` multiplier |
| Simulation | `worker/src/simulation.ts:104–117` | Starvation kicks in after 3 days of 0 food | Add `starvation_grace_days` derived from difficulty (5 / 3 / 2) |
| API | `worker/src/index.ts:162–178` | `/api/start` validates `tone_tier`, passes to `createInitialState` | Validate `difficulty`, pass through |
| Prompts | `worker/src/prompt-assembly.ts:125` | `SYSTEM_PROMPTS[state.settings.tone_tier]` | UNCHANGED (difficulty stays server-side) |
| Client | `public/engine.js:395–409` | `selectTone(tier)` stores + sends | Add `selectDifficulty(level)`; send both on `/api/start` |
| Scenes | `public/scenes/tone.js` | Existing 3-card picker | UNCHANGED (still picks tone) |
| Scenes | `public/scenes/difficulty.js` | NEW — mirror of tone.js but shows numeric deltas + "recommended" pill | NEW FILE |
| State machine | `public/engine.js:303` | After TONE → STORE | Insert DIFFICULTY between TONE and STORE |
| Tests | `worker/tests/state.test.ts` | 36 tests, existing fixtures use `tone_tier` only | Add `difficulty` to all fixtures; add ~5 clamp-per-difficulty tests |
| Tests | `worker/tests/simulation.test.ts` | 19 tests | Add ~5 disease-scaling tests (easy vs hard) |
| Tests | `worker/tests/prompt-assembly.test.ts` | 31 tests | Add `difficulty` field to fixtures; no prompt behavior change |
| Visual QA | `scripts/visual-qa.mjs` | Tests 7 scenes | Add `difficulty` scene to the list |
| Playthrough | `scripts/playthrough.mjs` | Takes `--tone`, `--profession`, `--pace` | Add `--difficulty` flag |

**Estimated effort (from audit):** 5–7 hours. Plus ~30–60 min for the new scene + review feedback. Total: 6–8 hours.

---

## § 3. Commit plan (4 commits)

Each independently revertable. Tag `pre-difficulty` at current HEAD (commit `30662f2`) before C1.

### C1 — Types + state + simulation wiring (backend)
Files: `worker/src/types.ts`, `worker/src/state.ts`, `worker/src/simulation.ts`, `worker/src/index.ts`
- Add `Difficulty` type + `Settings.difficulty` + `StartRequest.difficulty`
- Extend `createInitialState` signature with `difficulty` (default `"medium"` for back-compat)
- Update `/api/start` validator + handler
- Add difficulty multipliers in `simulation.ts` (disease onset, mortality, starvation grace)
- Update `clampConsequences(c, difficulty?)` signature with difficulty-scaled bounds
- Add `force_difficulty` to `ChallengeConstraints`, set on `nightmare` challenge
- Update all existing worker tests to pass `difficulty` in fixtures (no behavior change)
- ~15 new tests: difficulty-scaled disease, difficulty-scaled clamp, challenge force_difficulty
- Acceptance: 139+ tests pass (was 124).

### C2 — Client engine + state machine (client logic)
Files: `public/engine.js`, `public/main.js`
- Add `selectDifficulty(level)` method on engine
- Add `DIFFICULTY` to scene map + state transition table
- Change TONE → DIFFICULTY → STORE (was TONE → STORE directly)
- Send `difficulty` in `/api/start` POST body
- Default `difficulty = "medium"` if client is older than server schema (safe back-compat)
- Update `engine.difficulty` getter parallel to `engine.tone`

### C3 — Difficulty scene (UI)
Files: `public/scenes/difficulty.js` (NEW), `public/main.js` (register)
- Mirror of `tone.js` structure — 3 cards, keyboard nav, click/tap support
- Shows numeric deltas per tier (Frostpunk pattern):
  - Easy: "Food burn -33%. Disease chance halved. Event consequences softened. Extra $200 starting money."
  - Medium: "Standard survival. Recommended for first run." (pill)
  - Hard: "Food burns 20% faster. Disease strikes more often. No mercy. ⚠️ Recommended after one full playthrough."
- Uses existing `draw.mjs` PALETTE (parchment + goldBright)
- No tone overlay on this scene (it's a UI screen, not a game scene)
- Passes `difficulty` to `engine.selectDifficulty()` which triggers STORE transition

### C4 — QA + docs
Files: `scripts/visual-qa.mjs`, `scripts/playthrough.mjs`, `CLAUDE.md`, `README.md`
- Add `difficulty` scene to visual-qa scope
- Add `--difficulty=easy|medium|hard` flag to playthrough
- Run 9 playthroughs (3 tones × 3 difficulties) to calibrate survival rates
- Adjust multipliers if survival rates wildly off target (Easy=80% / Medium=30% / Hard=5%)
- Document difficulty matrix in CLAUDE.md § 3 (Architecture Invariants) under new "3.8 Orthogonal tone and difficulty axes"
- Commit the 9-run playthrough output as `.gstack/qa-reports/difficulty-calibration.json` for future regression reference

---

## § 4. Proposed multiplier table (v1 — to be calibrated in C4)

Backend multipliers read from a single lookup table in `simulation.ts`:

```ts
const DIFFICULTY_MULTIPLIERS = {
  easy:   { disease: 0.5, mortality: 0.7, starvationGrace: 5, consequenceFactor: 0.7, startingMoneyBonus: 0.5 },
  medium: { disease: 1.0, mortality: 1.0, starvationGrace: 3, consequenceFactor: 1.0, startingMoneyBonus: 0.0 },
  hard:   { disease: 1.5, mortality: 1.3, starvationGrace: 2, consequenceFactor: 1.3, startingMoneyBonus: -0.25 },
};
```

| Variable | Easy | Medium | Hard |
|---|---|---|---|
| Disease onset probability × | 0.5 | 1.0 | 1.5 |
| Disease mortality rate × | 0.7 | 1.0 | 1.3 |
| Starvation grace days (time before 0 food starts killing) | 5 | 3 | 2 |
| Event negative consequence bound × | 0.7 | 1.0 | 1.3 |
| Starting money multiplier (on top of profession) | +50% | +0% | −25% |

**Rationale:** survival is driven by food × disease × events. One multiplier per axis prevents thrash. Starting money is the lowest-coupling lever — we can tune it post-launch without touching the simulation.

**Not touching on v1:**
- Pace/rations (player choice, already in-game)
- Hunting yields (too many second-order effects)
- Max concurrent diseases (nice-to-have but would need a new sim check)
- River crossing fail rates (separate system — save for v2)

---

## § 5. UI flow + copy

### Flow change

Before: `TITLE → PROFESSION → NAMES → TONE → STORE → TRAVEL`
After: `TITLE → PROFESSION → NAMES → TONE → DIFFICULTY → STORE → TRAVEL`

**No change to tone screen.** Difficulty screen is new, follows the tone screen's pattern.

### Difficulty screen copy

Header: "How hard is survival?"
Subhead: "Tone sets the mood. Difficulty sets the math."

Three cards in a row (follow existing `tone.js` card layout):

**Easy — "A gentler trail"**
- Food burns slower (−33% consumption)
- Disease is rare and mild (×0.5 chance, ×0.7 mortality)
- Events hit softer
- Starting money bonus: +50%
- Keyboard hint: press `1`

**Medium — "Pioneer standard" *(Recommended)*** [gold pill]
- The default 1848 experience
- Based on the original game's tuning
- Keyboard hint: press `2`

**Hard — "The trail gives no mercy"**
- Food burns faster (+20%)
- Disease strikes often and kills fast (×1.5 chance, ×1.3 mortality)
- Events cost more
- Starting money: −25%
- ⚠ Recommended after one full playthrough
- Keyboard hint: press `3`

**Accessibility:** Same keyboard nav + tap-target sizes as tone.js. `aria-label` on each card describing the effect.

**Persistence:** remembered in localStorage as `ot_last_difficulty` so repeat players don't re-pick (same pattern used for tone). Show selected-card highlight on re-entry.

---

## § 6. Testing strategy

### Unit tests (vitest, worker)
- `state.test.ts`: 5 new tests
  - createInitialState with each difficulty level sets `settings.difficulty` correctly
  - nightmare challenge forces both `tone_tier: "high"` AND `difficulty: "hard"`
  - `clampConsequences(c, "easy")` applies 0.7× scaling to negative bounds
  - `clampConsequences(c, "hard")` applies 1.3× scaling
  - back-compat: `createInitialState` without difficulty param defaults to "medium"
- `simulation.test.ts`: 5 new tests
  - Disease onset on easy ~50% less frequent over 100 simulated days than medium
  - Mortality on hard kills a diseased member ~30% faster than medium (seeded RNG)
  - Starvation on easy doesn't damage until day 5 (not day 3)
  - Starvation on hard damages from day 2 onward
  - Difficulty=medium produces identical results to pre-change state (regression guard)

### Integration — 9-run calibration
In C4: run `playthrough.mjs` 9 times (3 tones × 3 difficulties), farmer profession, steady pace, option-0 each event. Expected survival rates (rough target, not hard assertion):

|  | Easy | Medium | Hard |
|---|---|---|---|
| Low tone | 70–85% | 40–55% | 15–25% |
| Medium tone | 55–70% | 25–40% | 5–15% |
| High tone | 35–50% | 10–20% | 2–8% |

Each cell runs the simulation twice (low variance check). Results commit to `.gstack/qa-reports/difficulty-calibration.json` as a regression reference. If any cell is >20 percentage points off target, adjust `DIFFICULTY_MULTIPLIERS` and re-run — but NOT on the hot path; fold into a follow-up tuning commit.

### Visual QA
`visual-qa.mjs` gets a new scene entry for `difficulty`. Must show 3 cards, 0 JS errors, readable "Recommended" pill.

---

## § 7. Back-compat + migration

**Client forward-compat:** A player loading an old saved run (signed state with no `difficulty` field) should default to `"medium"`. Handled by `createInitialState` default + client-side `engine.difficulty` getter with `?? "medium"`.

**Server back-compat:** `/api/start` accepts optional `difficulty` on request body. Missing → default medium. Won't break anyone already mid-game; the signed state gets the new field on the next state mutation.

**HMAC chain:** adding a new field to GameState.settings triggers the key-sorting in `deepCanonicalize` (`hmac.ts`). No code change required, but existing in-flight signed states from before the deploy won't verify under the new schema. Two options:

1. **Include `difficulty: "medium"` as a default in the existing validator** — if an incoming signed state lacks the field, inject it before verify. Zero user friction.
2. **Reject old states and force a new game** — cleaner but annoys anyone mid-run at deploy time.

**Chose #1**: inject default in `verifyIncomingState()` before HMAC check. New tests cover the "old state passes validation" path.

---

## § 8. Rollback

- Tag `pre-difficulty` at `30662f2` before C1 lands.
- Each of C1–C4 independently revertable (`git revert <sha>`).
- If C1 reverts: back to current Medium-only game. Frontend C2/C3 gracefully default to medium.
- If all 4 revert: `git reset --hard pre-difficulty`.
- Cloudflare Pages + Worker rollback: re-deploy the previous build from the dashboard OR re-run `wrangler deploy` on the reverted commit.

---

## § 9. Pre-mortem — 5 ways this goes wrong

Per `feedback_pre_mortem_before_review`: list failures before handing to reviewers.

1. **Matrix is too coarse — 9 cells feel samey.** Medium-tone+Easy and Medium-tone+Medium feel identical because the multipliers are too close. *Mitigation:* the calibration step in C4 actually measures this with 9 playthroughs. If Easy and Medium end up within 10 points, widen the easy multipliers (0.5 → 0.3 on disease, starting money bonus +50% → +100%).
2. **Hard + High tone is unplayable — 0% survival makes it a stunt, not a game.** *Mitigation:* at launch, that's the Reddit-screenshot cell. Accept it. If telemetry shows >99% wipe, soften mortality on Hard+High only. Otherwise leave it.
3. **Adding a screen kills TTV (time-to-value) — players bounce before travel.** *Mitigation:* make the difficulty screen as fast as tone. Keyboard `1/2/3` presses land in <3 seconds. Default Medium is pre-highlighted + Enter-to-confirm works.
4. **The LLM doesn't know the difficulty, so its events feel wrong on Easy** (e.g., "Your party ate the dog" fires on Easy mode where that tonally doesn't fit). *Mitigation:* the LLM already gets tone. Difficulty stays mechanical. Easy on High tone still generates horror events — the difficulty just clamps the numeric consequence. Accept this; don't bloat the prompt with difficulty context.
5. **Back-compat injection of `difficulty: "medium"` into old signed states re-signs them with a new signature, breaking the "client holds state" invariant.** *Mitigation:* inject the field BEFORE verify (transparent to signature), only for the missing-field case. Unit test covers the exact path.

---

## § 10. Out of scope (explicit)

- Custom difficulty sliders (Rimworld-style). Ship presets only.
- Per-biome or per-segment difficulty ramps (ITB's island scaling). The trail already gets harder geographically; don't double up.
- New scene for PROFESSION difficulty interaction visualization. Profession remains flavor; difficulty is explicit.
- Rebalancing Medium tier to be easier globally. Ryan's decision: Medium stays where it is; Easy is the new on-ramp.
- "Nightmare" weekly challenge redesign. Leave existing challenges alone; they get `force_difficulty: null` except `nightmare` which becomes `"hard"`.
- Translating difficulty copy. English-only for v1.
- Telemetry on which cells players pick. Would need Plausible event wiring — follow-on PR.

---

## § 11. Review gauntlet

Per `feedback_always_full_review_gauntlet`: run all of these before implementation.

- [ ] `/plan-eng-review` — architecture (type split, multiplier table, HMAC back-compat)
- [ ] `/plan-design-review` — new screen UI, copy, "Recommended" pill (now that Step 0E is wired, should also declare the source of truth: this plan file is it, no Figma needed)
- [ ] `/codex review` — independent second opinion
- [ ] Fix findings, update this doc, re-review if >3 P1s
- [ ] User final approval → begin C1

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for full review pipeline, or individual reviews above.
