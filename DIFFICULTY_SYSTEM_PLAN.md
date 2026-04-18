<!-- /autoplan restore point: /home/ryan/.gstack/projects/oregon-trail/kaplay-rebuild-autoplan-restore-20260417-183231.md -->
# Difficulty System — Implementation Plan (v2 — revised after autoplan CEO phase)

**Status:** Rewritten 2026-04-17 after autoplan CEO phase rejected v1. 6/6 CONFIRMED rejections from Claude + Codex (dual-voice, independent). This version addresses every finding. Ready for re-review.

**Target:** Fix the "too hard for casuals" problem with minimum surface area. Four sequential phases, each with a measurement gate. Only escalate to structural changes if simpler tuning fails.

**Scope:** Phase A alone is ~1 hour. All four phases together are ~6–8 hrs only if every measurement gate says "still too hard."

**Origin:** v3 "died in 20 miles" → clamp-fix bug shipped 2026-04-17 (HEAD `30662f2`). Post-fix playtests: 249/351/98 miles at 32–46 days. Still 0/3 survival at Medium. **But:** sample size N=3, no telemetry, no user complaints beyond Ryan's test. Need data before architecture.

---

## § 0. TL;DR

v1 of this plan proposed a 3×3 tone×difficulty matrix with a new setup screen. Autoplan's CEO phase killed it on strategic grounds:

- "Solves unproven segmentation problem instead of proven fairness problem" (Codex)
- "Dilutes the horror hook — Easy+High becomes the most-picked cell" (Claude)
- "6 hours + 4 commits + new HMAC back-compat path for a problem a 30-minute tune may solve" (both voices)
- "Contradicts PLAN.md:85 — horror comes from mechanics, not atmosphere" (Codex)
- "Adaptive difficulty already accepted in PLAN.md:164 — this plan is the opposite move" (Codex)

**v2 responds with a measure-first, escalation-gated approach:**

| Phase | What | Effort | Ships iff |
|---|---|---|---|
| **A** | Measure: 20 automated playthroughs on post-bugfix v4. Produce `difficulty-calibration-v2.json`. | 1 hr | Always runs. Produces data, not code. |
| **B** | Global Medium tune: `disease_base ×0.7` + `starvation_grace 3→4`. One commit. | 30 min | Phase A shows median Medium wipe <500 miles OR first-event fatality within 15 days |
| **C** | Adaptive difficulty (PLAN.md:164). Server softens next 5 days after any party death. Invisible. | 2 hrs | Phase B re-measurement still shows wipe <50% at Medium across 10 runs |
| **D** | Tone-gated explicit axis. High tone FORCES Hard (no Easy+High). Only 7 real cells, presented as 2-button flow: tone screen gets a "challenge mode" checkbox. | 4 hrs | Phase C re-measurement STILL shows median wipe <50% at the default (no-checkbox) path |

Every phase ends with a re-run of the calibration and a decision gate. If any phase solves the survival-rate problem, we stop there.

**Most likely outcome per autoplan CEO findings:** Phase A or B is sufficient. Phase C ships for the product-vision value (already in PLAN.md:164). Phase D probably never ships.

---

## § 1. What changed from v1 (response to each CEO finding)

### Finding 1: "Solves unproven segmentation problem"
**v1:** assumed 3/3 playtests = user demand for a difficulty axis.
**v2:** Phase A measures with N=20 before any architectural work. If post-bugfix Medium is actually fine, we stop at Phase A.

### Finding 2: "Cuts against click→play wedge / product is a marketing funnel"
**v1:** added a whole new setup screen between TONE and STORE.
**v2:** Phase D's axis, if it ever ships, rides on the EXISTING tone screen as a checkbox ("Challenge mode ⚠️"), not a new scene. Zero new screens unless Phase D triggers.

### Finding 3: "Orthogonal axes contradicts horror thesis (PLAN.md:85)"
**v1:** strict orthogonality (Easy+High = horror visuals + easy math).
**v2:** **tone-gated.** High tone forces Hard difficulty. No Easy+High cell exists. 9-cell matrix collapses to an honest 7 cells where horror mechanics and horror narrative stay coupled (per PLAN.md:85).

### Finding 4: "Adaptive difficulty already accepted, this plan is the opposite move"
**v1:** didn't mention adaptive difficulty.
**v2:** Phase C **implements PLAN.md:164 directly.** Adaptive difficulty is the first non-tuning response before any explicit axis. Invisible softening when a party is struggling. This is what the product-vision document always said we'd ship.

### Finding 5: "9-cell matrix is fake product surface area"
**v1:** designed all 9 cells equally, deferred telemetry.
**v2:** Phase D builds at most 7 cells (High forces Hard), presented as a 2-state default/challenge UX. If Phase D never triggers, we never build ANY cells.

### Finding 6: "Attribution chaos — 6 difficulty levers, deaths feel arbitrary"
**v1:** celebrated "Easy + Banker" / "Hard + Farmer" as matrix interactions.
**v2:** Phase D is the ONLY new difficulty lever. It does NOT stack with profession — it replaces profession's stealth-difficulty role. When Phase D ships, profession goes back to pure flavor (same $400 start for all three). This removes a lever instead of adding one.

### Other risks addressed
- **Brand voice:** Phase D's UI copy doesn't say "Difficulty." It says "Challenge mode" (on) vs default. Matches the "It goes as dark as you want" brand sentence instead of SaaS-style preset picker.
- **HMAC injection path:** dropped. If Phase D ships, signed states from before the deploy are rejected; players start a fresh game. Safer than security-boundary back-compat. Accepted risk: mid-game players lose their run at deploy time. Acceptable for a 10-min game.

---

## § 2. Phase A — Measure (always runs)

**Duration:** 1 hour.
**Produces:** `.gstack/qa-reports/difficulty-calibration-v2.json`, a 20-run survival distribution.

### Steps

1. Run `scripts/playthrough.mjs` 20 times against post-bugfix v4 production (`trail.osi-cyber.com`):
   - 10 runs: farmer / steady / medium tone (the most-likely "casual first time" path)
   - 5 runs: farmer / steady / high tone (stress test the horror tier)
   - 5 runs: banker / steady / medium tone (money-rich baseline)

2. For each run, capture:
   - Miles traveled at death/arrival
   - Day of first member death
   - Deaths by cause (disease name, starvation, drowning, event)
   - Events handled (count)
   - % of runs that reach each landmark (Kearney / Chimney / Laramie / South Pass / Fort Hall / Blue Mtns)

3. Aggregate to a calibration JSON:
   ```json
   {
     "run_date": "2026-04-17",
     "worker_version": "e7d18d36",
     "scenarios": [
       { "name": "farmer-steady-medium", "runs": 10, "survived": N, "median_miles": N, "median_days_to_first_death": N, ... },
       ...
     ],
     "global_stats": {
       "wipe_rate_medium_default": 0.00,
       "first_event_fatality_rate": 0.00,
       "starvation_death_share": 0.00,
       "disease_death_share": 0.00
     }
   }
   ```

4. **Decision gate:** commit the calibration JSON. Read it. Three outcomes:

   - **Medium wipe rate ≥ 70% AND median wipe < 300 miles:** proceed to Phase B.
   - **Medium wipe rate 40–70% OR median wipe 300–700 miles:** proceed to Phase C (skip B, because Medium isn't clearly broken).
   - **Medium wipe rate < 40%:** STOP. Game is fine. Close this plan as "no change needed."

### Phase A acceptance
- JSON committed as regression reference
- Summary line in this doc: "Phase A measured {WIPE_RATE}% Medium wipe, median {MILES} miles. Proceeding to Phase {X}."

### No code changes in Phase A
Pure measurement. If we stop here, repo state is unchanged.

---

## § 3. Phase B — Global Medium tune (ships iff Phase A triggers)

**Duration:** 30 minutes.
**Files:** `worker/src/simulation.ts` (2 lines)

### Change
```ts
// simulation.ts
const DISEASE_PROBABILITY_MULTIPLIER = 0.7;  // NEW — was effectively 1.0
// Apply at line 138: `base_probability_per_day * riskMultiplier * DISEASE_PROBABILITY_MULTIPLIER`

// simulation.ts, line 107
if (next.simulation.starvation_days >= 4) {  // was 3 — one extra grace day
```

### Tests
- Add 2 vitest tests: disease onset ~30% less frequent with the multiplier, starvation kicks in day 4 not day 3.
- Existing 124 tests pass unchanged.

### Phase B re-measure
- Re-run the same 20-scenario Phase A suite against the local worker (`npx wrangler dev`) with the tune applied.
- If Medium wipe rate drops below 40% → ship it. Deploy. **STOP.**
- If Medium wipe rate still ≥ 40% → keep the tune, proceed to Phase C.

### Phase B acceptance
- 2 lines changed, 2 tests added
- Re-measurement JSON committed
- Decision logged: "Phase B tune {SUFFICIENT / INSUFFICIENT}. Proceeding to Phase C."

---

## § 4. Phase C — Adaptive difficulty (PLAN.md §5.8)

**Duration:** 2 hours.
**Files:** `worker/src/simulation.ts` (+30 lines), `worker/src/state.ts` (+1 field: `recent_death_grace_days`), `worker/tests/simulation.test.ts` (+4 tests)

**This is the implementation of PLAN.md §5.8 — already accepted in the original product vision (audit row #4 of the CEO plan).**

### Mechanism
After any party member dies, the server sets `state.simulation.recent_death_grace_days = 5`. For the next 5 simulation days:
- `DISEASE_PROBABILITY_MULTIPLIER × 0.5`
- `consequence_clamp negative side × 0.7`
- `starvation_grace += 2`

After 5 days (or another death), the grace counter resets. Multiple deaths in one day count as one death for grace purposes (no runaway softening).

### Why this is the right abstraction per PLAN.md:164
- "Well-stocked party gets harder challenges, struggling party gets recovery opportunities. Not cheating — good dungeon mastering."
- Invisible to the player → no UI churn, no new screens, no attribution chaos.
- Preserves the horror thesis: a party *can* still wipe, it just gets one breath after a death.

### Tests
- A party with a recent death suffers lower disease probability than a party without (seeded RNG)
- Grace resets after 5 days
- Grace doesn't stack from multiple same-day deaths
- Grace does not apply if `tone_tier === "high"` AND `profession === "banker"` — a deliberate carve-out so horror+rich players don't get a safety net (opinionated default; change later if telemetry says otherwise)

### Phase C re-measure
- Same 20 scenarios. If median Medium wipe rises above 500 miles AND wipe rate drops below 40% → ship. **STOP.**
- If not → Phase D (explicit axis is the lever of last resort).

### Phase C acceptance
- ~30 net lines, 4 new tests (132 total)
- Re-measurement JSON committed
- Decision logged

---

## § 5. Phase D — Tone-gated explicit challenge mode (ships only if A+B+C fail)

**Duration:** 4 hours.
**Files:** `worker/src/types.ts`, `worker/src/state.ts`, `worker/src/simulation.ts`, `worker/src/index.ts`, `public/engine.js`, `public/scenes/tone.js` (extension, NOT new scene).

**Ship this ONLY if Phase C's re-measurement still shows Medium wipe rate ≥ 50% after the adaptive softening.**

### Key difference from v1
- **No new scene.** Tone screen gets a checkbox below the three tone cards: `[ ] Challenge mode — faster disease, harsher events, no adaptive mercy`. Single checkbox, one line of copy. Zero additional clicks for default players.
- **Tone-gated.** High tone auto-checks "Challenge mode" and disables the box. Horror = Challenge, always. Preserves the horror hook (the CEO phase's #1 finding).
- **"Difficulty" is never the word.** UI copy is "Challenge mode." Matches the product brand voice.
- **No changes to profession tuning.** Profession goes back to being pure flavor. Banker and Farmer both start with the same $400 once Challenge mode is the explicit lever. (One less attribution axis — addresses CEO finding 6.)

### Wire format
- `StartRequest.challenge_mode?: boolean` (default `false`)
- `Settings.challenge_mode: boolean`
- If `tone_tier === "high"`, server forces `challenge_mode = true` regardless of client input.
- Challenge mode activates: disease multiplier 1.4, starvation grace 2, clamp negative side 1.3, adaptive softening DISABLED.
- Non-challenge mode = everything Phase B + C already established.

### The cell matrix (honest, not aspirational)

|  | Default (no checkbox) | Challenge mode (checked) |
|---|---|---|
| Low tone | Easy storytelling | Low narrative, harsher math |
| Medium tone | Default path | Medium narrative, harsher math |
| **High tone** | **Forced Challenge** | same as default High |

Six player-facing states collapse into four actual mechanical states:
1. Casual (default): Phase B tune + Phase C adaptive
2. Challenge Low: no adaptive, harsher disease, mild narrative
3. Challenge Medium: no adaptive, harsher disease, gray narrative
4. Challenge High = horror: no adaptive, harsher disease, horror narrative. **The viral-screenshot mode.**

### HMAC back-compat
- Dropped the inject-default path. Old signed states without `challenge_mode` are rejected. Players start fresh after deploy. Accepted trade.

### Phase D acceptance
- ~60 net lines
- 6 new tests (138 total)
- Re-measurement JSON for the checkbox path shows median Medium wipe above 700 miles
- Visual QA passes with new tone.js extended

---

## § 6. Sequencing + rollback

Tag `pre-difficulty-v2` at HEAD `30662f2` before any phase lands.

Phase A is always first. Each subsequent phase reads the measurement from the prior gate and only runs if triggered.

Revert order (if something regresses):
1. Phase D revert: `git revert <sha>` — players default to Phase A+B+C state
2. Phase C revert: adaptive difficulty off, Phase B tune remains
3. Phase B revert: Medium goes back to pre-tune
4. Phase A: no code, no revert needed

Each phase ships independently; nothing bundled.

---

## § 7. Testing strategy

- Phase A: `scripts/playthrough.mjs` regression suite already exists
- Phase B: 2 unit tests + re-measure
- Phase C: 4 unit tests + re-measure
- Phase D: 6 unit tests + visual-qa with extended tone scene + re-measure

**Total test delta if every phase ships:** +12 tests (136 total). v1 was +15 tests (139) for the axis alone. v2 is actually lighter despite the phased rigor.

### Calibration regression
After each phase ships, commit the re-measurement JSON. If 6 months later we want to re-tune, we have a reference distribution.

---

## § 8. What's explicitly out of scope

- Custom difficulty sliders (Rimworld-style)
- Per-biome or per-segment difficulty ramps
- 9-cell matrix with independent tone × difficulty picking (killed by CEO phase)
- "Difficulty" as a player-facing noun (killed — it's "Challenge mode")
- New setup screen (killed — checkbox on tone screen if anything)
- HMAC inject-default back-compat (killed — new game on deploy is fine)
- Telemetry wiring (deferred to follow-on, but Phase A's measurement JSON is our baseline)
- Rebalancing Medium globally *before* measuring (Phase A blocks this)

---

## § 9. Pre-mortem — 5 ways THIS version goes wrong

1. **Phase A measurement runs flaky against production** (LLM non-determinism, rate limits). *Mitigation:* add retries, or run against local `npx wrangler dev` with deterministic fallback events. 20 runs × 3 minutes = 1 hour, acceptable.
2. **Phase B tune is too aggressive, game becomes trivial** at Medium. *Mitigation:* the 0.7 multiplier + 1-day grace is intentionally modest. If re-measurement shows wipe rate <20%, roll back the 0.7 to 0.85.
3. **Phase C adaptive softening feels like cheating** to players who notice the pattern. *Mitigation:* "grace period" after a death is a real dramatic beat; journal entry can lampshade it ("The party buried Sarah. No one spoke for three days. The trail felt quieter."). This is PLAN.md:164's explicit framing ("not cheating — good dungeon mastering").
4. **Phase D's Challenge-mode checkbox on the tone screen is visually cluttered.** *Mitigation:* single line under the three cards, no extra screen, copy is short. Design review before shipping.
5. **The entire plan is premature.** Phase A measures and reveals Medium is already fine. We've spent 1 hour measuring, nothing to revert. Worst case is a non-problem caught early.

---

## § 10. Decision tree summary

```
Phase A (always) ─ measure
     │
     ├─ wipe < 40%? ─── STOP (game is fine, no changes)
     │
     ├─ wipe 40–70%? ── skip to Phase C (Medium not broken, just needs dungeon-master touch)
     │
     └─ wipe ≥ 70%? ─── Phase B (tune) → re-measure
                              │
                              ├─ wipe < 40%? ── STOP, ship B
                              │
                              └─ wipe ≥ 40%? ── Phase C (adaptive) → re-measure
                                                     │
                                                     ├─ wipe < 50%? ── STOP, ship B+C
                                                     │
                                                     └─ wipe ≥ 50%? ── Phase D (checkbox) → ship B+C+D
```

---

## § 11. Review gauntlet

- [ ] `/autoplan` (re-run) — dual-voice reviews on this revised plan
- [ ] Fix findings, re-review if >3 P1s
- [ ] User final approval → begin Phase A

---

## Previous CEO phase (v1) archived

See git commit `cc04fa0` for the full v1 CEO findings and consensus table. Six confirmed rejections on v1 drove every change in this v2. The v1 restore point is preserved at `~/.gstack/projects/oregon-trail/kaplay-rebuild-autoplan-restore-20260417-183231.md`.

---

## GSTACK REVIEW REPORT

Autoplan re-invoked on v2 plan 2026-04-17. **Second User Challenge — both voices again recommend modifying further.**

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review (v1) | `/plan-ceo-review` | Scope & strategy | 1 | **REJECTED** | 9 findings → drove v2 rewrite |
| CEO Review (v2) | `/plan-ceo-review` | Scope & strategy | 1 | **MODIFY FURTHER** | 5 findings; Phase D + Phase-C-design + profession-flatten flagged |
| Codex Review (v1) | `/codex review` | Independent 2nd opinion | 1 | **REJECT** | Aligned with CEO subagent v1 |
| Codex Review (v2) | `/codex review` | Independent 2nd opinion | 1 | **MODIFY FURTHER** | 6 findings; naming collision + harness narrow claim + C redesign |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | Pending (short-circuited 2nd time) | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | Pending | — |
| DX Review | `/plan-devex-review` | DX gaps | 0 | Skipped | — |

---

## CEO Phase v2 — Dual Voices Consensus

### What v2 got right (both voices confirmed)

- **Tone-gating fixes the horror-hook dilution** (v1's worst flaw). High tone forcing Challenge eliminates the Easy+High cell.
- **Phase C implementing PLAN.md:164** is real alignment; audit row #4 has been waiting 6 months.
- **Phase A as a gate** is a meaningful discipline that v1 lacked.

### What v2 got wrong (both voices converged)

| # | Issue | Claude | Codex | Consensus |
|---|---|---|---|---|
| 1 | **Phase D creates Medium+Challenge dilution vector** — the new Easy+High equivalent. Horror-light cell siphons viral users. | YES | YES | **Drop Phase D entirely** |
| 2 | **Phase C is rubber-banding, not DMing** — 5-day post-death mercy timer ≠ live-state-aware danger tuning. PLAN.md:164 means vary danger BEFORE disaster, based on party state. | YES | YES | **Redesign Phase C: live party-state reading (health, supplies, distance, recent events), not post-death grace** |
| 3 | **Profession flatten is a net regression** — Banker/Carpenter/Farmer money spread IS the invisible zero-UI difficulty axis already shipped. Don't erase it. | YES | YES | **Revert the "all $400" decision; keep the money spread** |
| 4 | **"Checkbox on tone screen" is implementation-minimal, not UX-minimal** — asking one screen to do two jobs (narrative + mechanics) adds cognitive load even without a new scene. | YES | YES | **If Phase D ever ships, it's a separate screen, not a tone-screen hijack** (or doesn't ship at all — preferred) |
| 5 | **Phase A gates calibrated to auto-proceed** — 40/50/70% thresholds + LLM noise floor at N=20 means Phase B almost always triggers. Narrow the harness's claim to "emergency calibration only," not "product truth." | YES | YES | **Add confidence intervals; explicit STOP-as-valid outcome; Phase A can merge alone before planning the rest** |
| 6 | **Codex-only:** `challenge_id` (weekly challenges) + new `challenge_mode` (Phase D) = naming + semantic collision. | N/A | YES | **If any explicit mode ever ships, don't name it "Challenge"** |

### The converged recommendation

Ship the 2-phase minimum. Redesign Phase C. Kill Phase D.

```
Phase A (always) ─── narrow claim: emergency calibration only
     │
     ├─ Medium wipe < 40% (with confidence interval) ─── STOP, re-plan if needed
     │
     └─ Medium wipe ≥ 40% ─── Phase B (30-min tune)
                                    │
                                    ├─ still broken? ─── Phase C' (redesigned)
                                    │
                                    └─ fixed? ─── STOP

Phase C' (redesigned): LIVE party state → danger curve
  - Read: avg_health, food_days_remaining, alive_count/party_size,
    recent_event_severity, miles_from_destination
  - Vary: disease_probability, event_consequence_clamp, landmark rest-bonuses
  - No post-death pity timer. No carve-outs. Always on. Matches PLAN.md:164
    "good dungeon mastering" literally — well-stocked gets harder, struggling
    gets recovery opportunities.

Phase D: DELETED. No checkbox, no second axis, no new lever.
  Profession money spread stays as the zero-UI difficulty signaling already
  in the product. If post-C data shows Medium+Farmer is still too hard,
  the response is either: more profession spread (Homesteader $2400), or
  more adaptive aggressiveness — NOT a user-facing toggle.
```

### Other fixes agreed on

- Keep profession money spread intact. Revert the "all $400" decision entirely. Phase D erasing profession flavor is a bad trade.
- Rename anything that isn't "tone" or "profession" to avoid colliding with weekly `challenge_id`.
- HMAC back-compat drop was correct; keep that decision even though Phase D doesn't ship.
- Phase A's playthrough harness is narrow (option 0, fixed loadout). Its conclusion can only be "is Medium catastrophically broken" — not a proxy for actual user fairness. Narrow the claim in the plan text.
- Ship Phase A alone, merge, close this doc, write a fresh follow-up plan from the data.

---

## PREMISE GATE — User Challenge (v2)

**What you said:** Rewrite the plan in v2 with phased approach + tone-gating + checkbox + profession-flatten.

**What both models recommend:**
- Ship Phase A alone as its own work unit. Merge. Re-plan from data.
- If and only if Phase A flags Medium as broken: ship Phase B (30-min tune).
- If and only if Phase B is insufficient: ship **redesigned Phase C** (live-state-aware adaptive difficulty, no post-death mercy timer).
- **Kill Phase D.** No checkbox, no second axis. Profession money spread stays.

**Why both models agree:**
- Medium+Challenge is the new Easy+High (dilution vector, same class of problem as v1's biggest flaw).
- Phase C as designed is rubber-banding, not DMing. PLAN.md:164 literally says "vary danger by party state" — not "pity timer after a death."
- Profession erasure trades zero-UI difficulty signaling for new-UI — the wrong direction.
- `challenge_mode` name collides with existing `challenge_id`.
- Phase A + B + redesigned C is the minimum that solves the actual problem. Phase D is architectural ambition that the evidence doesn't justify.

**What the models might be missing:**
- Your desire to ship a user-visible difficulty control as a product feature (not just an invisible softening)
- Taste preference for explicit player agency over hidden servant-of-the-DM magic
- Portfolio value of demonstrably-thoughtful difficulty design

**If the models are wrong, the cost is:** Phase A + B + C ships in ~3 hours. You look at telemetry for a month. If you still want Phase D, plan it separately with data.

**If the models are right and you push through to Phase D anyway, the cost is:**
- ~4 extra hours on a feature that may be net-negative for virality (Medium+Challenge dilution)
- Profession flavor erased
- Naming collision with weekly challenges
- A user-facing difficulty toggle that 80% of players will never touch

---

**VERDICT:** Both autoplan CEO phases (on v1 and v2) converged on the same final shape. Decision deferred to Ryan.
