<!-- /autoplan restore point: /home/ryan/.gstack/projects/oregon-trail/kaplay-rebuild-autoplan-restore-20260417-183231.md -->
# Difficulty System — Implementation Plan (v3 — converged)

**Status:** v3 rewritten 2026-04-17 after TWO autoplan CEO phases (v1 rejected, v2 sent back with 5 converged modifications). This version ships the converged minimum both Claude and Codex recommended. Phase D is gone. Phase C is redesigned. Ready for Eng + Design + final gate.

**What changed from v2:**
- **Phase D DELETED.** No checkbox. No explicit "Challenge mode." No second axis. Both voices flagged Medium+Challenge as the new Easy+High dilution vector.
- **Phase C REDESIGNED.** Was a post-death 5-day mercy timer (rubber-banding). Now a live-state-aware danger curve that reads party condition continuously and varies danger BEFORE disaster. Matches PLAN.md:164 literally.
- **Profession money spread KEPT.** Banker ($1600) / Carpenter ($800) / Farmer ($400) stays as the zero-UI difficulty signaling already shipped.
- **Phase A narrowed.** Its claim is "is default Medium catastrophically broken" — not "is the game fair for real users." Adds confidence intervals and an explicit STOP-as-valid outcome.
- **No new state field.** No `challenge_mode`, no naming collision with existing `challenge_id`.
- **HMAC back-compat:** no changes needed (no new state field).

**Effort:** Phase A alone is 1 hour. A+B is 1.5 hours. A+B+C is ~3.5 hours. No phase exceeds 2 hours on its own.

---

## § 0. TL;DR

Two full autoplan CEO cycles (Claude + Codex, independent) converged on this recommendation:

**Ship A → measure → maybe B → maybe C. No axis. No checkbox. No new UI.**

The v1 "3×3 matrix with new scene" concept is fully dead. The v2 "tone-gated checkbox" concept is dead. What remains:
- **Phase A** — measure. Merge. Re-plan if needed.
- **Phase B** — 30-min Medium tune (iff A triggers).
- **Phase C** — live-state adaptive difficulty per PLAN.md:164, not a pity timer (iff B insufficient).

**Fully invisible to the player.** No setup screen changes. Tone screen unchanged. Profession unchanged. Game difficulty softens invisibly for struggling parties (Phase C), period.

---

## § 1. Phase A — Emergency calibration (always runs)

**Claim:** is default Medium catastrophically broken after the 2026-04-17 clamp fix?
**Not a claim:** is the game fair for real users. (Synthetic harness can't answer that.)

**Duration:** 1 hour.
**Produces:** `.gstack/qa-reports/difficulty-calibration-v3.json`, regression reference.
**No code changes.** Pure measurement.

### Measurement harness — honest about its limits

`scripts/playthrough.mjs` drives the engine with:
- Fixed scenario loadouts (farmer/carpenter/banker × steady/strenuous)
- Always picks option 0 on events
- Production LLM (live Haiku 4.5, includes non-determinism)

This is fine for "is Medium broken." It is NOT fine for "is the game fair." Don't overclaim.

### Scenarios (30 runs, not 20 — we need confidence intervals)

- 15 runs: farmer-steady-medium (the casual-first-time path)
- 5 runs: carpenter-steady-medium
- 5 runs: farmer-steady-high (stress-test horror tier)
- 5 runs: banker-steady-medium (money-rich baseline)

### Capture per run
- Miles traveled at death/arrival
- Day of first member death
- Deaths by cause (specific disease, starvation, drowning, event)
- Events handled (count)
- % of runs that reach each landmark (Kearney / Chimney / Laramie / South Pass / Fort Hall / Blue Mtns)
- % of runs that reach Oregon (arrival)

### Aggregate + confidence intervals

For each scenario:
- `wipe_rate` with 95% Wilson confidence interval (N=15 gives ±~25% CI; N=5 gives ±~40% CI — acknowledge in report)
- `median_miles` with bootstrap 95% CI
- `median_days_to_first_death`

### Decision gate (explicit STOP)

Read the farmer-steady-medium bucket (N=15, the bucket with the tightest CI):

- **Upper bound of wipe_rate_CI < 40%:** STOP. Ship nothing. Game is fine. Re-plan if user reports something later. **This is a valid outcome.**
- **Wipe_rate point estimate 40–70%, CI overlaps 40%:** Borderline. Proceed to Phase B with acknowledgment that the tune may be premature; re-measure after.
- **Lower bound of wipe_rate_CI ≥ 70%:** Medium is clearly broken. Ship Phase B.
- **Any ambiguity in the farmer bucket:** look at first-event fatality rate. If >30% of runs have a death in the first 10 game-days, Medium is broken regardless of wipe rate.

### Phase A acceptance
- Calibration JSON committed
- Summary in this doc: "Phase A: farmer-medium wipe_rate {PCT}% [{LB}%–{UB}%], median {MILES} miles. Decision: {STOP / B / re-measure after B}."
- **If STOP:** close this plan. Autoplan gates are satisfied.

---

## § 2. Phase B — Global Medium tune (iff Phase A triggers)

**Duration:** 30 minutes.
**Files:** `worker/src/simulation.ts` (2 constants, 2 lines applied)
**Ships iff:** Phase A's farmer-medium wipe_rate lower bound ≥ 70%, OR first-event fatality rate > 30%.

### Change
```ts
// simulation.ts — module-level
const DISEASE_PROBABILITY_MULTIPLIER = 0.7;  // NEW
const STARVATION_GRACE_DAYS = 4;             // was 3

// simulation.ts:138 — disease onset check
if (Math.random() < disease.base_probability_per_day * riskMultiplier * DISEASE_PROBABILITY_MULTIPLIER) { ... }

// simulation.ts:107 — starvation activation
if (next.simulation.starvation_days >= STARVATION_GRACE_DAYS) { ... }
```

### Tests
- `simulation.test.ts`: 2 new tests
  - Disease onset with seeded RNG fires ~30% less often (statistical bound, not exact)
  - Starvation doesn't damage until day 4 (not day 3)
- Existing 124 tests pass unchanged.

### Phase B re-measurement
- Run the same 30-scenario Phase A harness against the tuned local worker (`npx wrangler dev`)
- Acknowledge the apples-to-oranges risk (local dev uses fallback events more often than prod LLM); note explicitly in the re-measure JSON that Phase B re-measures may trend slightly more favorable than Phase A due to fallback-event bias
- Gate:
  - Farmer-medium wipe_rate upper bound CI < 40%: ship Phase B, **STOP**
  - Still ≥ 40%: keep B, proceed to Phase C

### Phase B acceptance
- 2 constants + 2 lines changed, 2 tests added
- Re-measurement JSON committed
- Decision log: "Phase B: re-measured {PCT}% [{LB}%–{UB}%]. Decision: {STOP ship B / continue to C}."

---

## § 3. Phase C — Live-state adaptive difficulty (iff Phase B insufficient)

**This is the implementation of PLAN.md §5.8 — "LLM reads party state and tunes event danger. Well-stocked party gets harder challenges, struggling party gets recovery opportunities. Not cheating — good dungeon mastering."**

Not a post-death mercy timer. Not rubber-banding. Continuous state-aware danger tuning.

**Duration:** 2 hours.
**Files:** `worker/src/simulation.ts` (+60 lines), `worker/src/types.ts` (no new fields; derived from existing state), `worker/tests/simulation.test.ts` (+5 tests).

### Mechanism

A `partyCondition(state)` function derives a single `danger_modifier` in `[0.5, 1.5]` from observable state at each sim step:

```ts
// simulation.ts — derive continuously, never stored
function partyCondition(state: GameState): number {
  const alive = state.party.members.filter((m) => m.alive);
  if (alive.length === 0) return 1.0;  // wipe already, doesn't matter

  // Weighted signals — all continuous, no thresholds, no pity carve-outs
  const avgHealth = alive.reduce((s, m) => s + m.health, 0) / alive.length;  // 0–100
  const foodDays = state.supplies.food / Math.max(1, alive.length * 2);       // 0–∞, realistic 0–30
  const aliveRatio = alive.length / state.party.members.length;               // 0–1
  const progressRatio = state.position.miles_traveled / 1764;                 // 0–1, near-end gets no mercy
  const recentEventSeverity = lastNEventsMeanHealthDelta(state, 3);           // rolling negative average

  // Struggling parties get a lighter danger modifier; strong parties get pushed
  //   avgHealth 100 + foodDays 20 + aliveRatio 1 → 1.4 (game pushes harder)
  //   avgHealth  40 + foodDays  2 + aliveRatio 0.6 → 0.6 (game backs off)
  const healthSignal   = (avgHealth - 50) / 100;       // −0.5 to +0.5
  const foodSignal     = Math.max(-0.5, Math.min(0.5, (foodDays - 10) / 20));
  const aliveSignal    = (aliveRatio - 0.8) * 1.5;     // −1.2 to +0.3
  const progressAmplifier = 0.7 + 0.3 * progressRatio; // near-end parties get less mercy
  const severityRecovery = recentEventSeverity < -20 ? -0.2 : 0; // only kicks in after rough stretch

  const raw = 1.0 + (healthSignal + foodSignal + aliveSignal + severityRecovery);
  const amped = 1.0 + (raw - 1.0) * progressAmplifier;
  return Math.max(0.5, Math.min(1.5, amped));
}
```

### What the modifier does

Applied in existing simulation paths (no new state fields):

```ts
// simulation.ts:138 — disease onset
const danger = partyCondition(next);
if (Math.random() < disease.base_probability_per_day * riskMultiplier * DISEASE_PROBABILITY_MULTIPLIER * danger) { ... }

// state.ts clampConsequences — optionally scale negative bounds by `danger`
//   (pass `danger` through applyEventAndSign → clampConsequences)
```

**Result:** a struggling party (low health, low food, few alive) faces disease ~50% as often as baseline, for as long as they're struggling. Once they recover (eat well at a landmark, heal up), the game goes back to full difficulty. No timer. No "mercy mode." Continuous signal, invisible to the player.

### Why this matches PLAN.md:164 literally

> "LLM reads party state and tunes event danger. Well-stocked party gets harder challenges, struggling party gets recovery opportunities."

- ✅ Reads party state (health, supplies, alive, recent severity)
- ✅ Tunes danger (disease onset + consequence clamp)
- ✅ Well-stocked gets harder (modifier up to 1.5× at avgHealth 100 + foodDays 20)
- ✅ Struggling gets mercy (modifier down to 0.5× at avgHealth 30 + foodDays 2)
- ✅ Not cheating: fixed formula, no special-case carve-outs, deterministic given state

### What was rejected from v2's Phase C

- ❌ 5-day post-death mercy timer (rubber-banding)
- ❌ Flat multipliers (0.5 disease, +2 starvation grace) (over-tuning)
- ❌ "high + banker" carve-out (arbitrary design surface)
- ❌ Stored `recent_death_grace_days` field (unnecessary state)
- ❌ "Journal lampshade" framing (cheating perception)

### Progress amplifier — preserves the Horror ending

`progressAmplifier` grows from 0.7 at mile 0 to 1.0 at mile 1764. Early parties get stronger mercy; late parties get less. This means: the first 500 miles have active dungeon-master mercy, the final 500 miles feel unsoftened. **The horror ending stays brutal. The arbitrary early wipe becomes rare.** This is explicitly the "earned wipe at a dramatic point" product outcome Codex flagged as the real KPI.

### Tests (5 new)

- `partyCondition` returns ~1.0 for a full-health full-food full-party state (baseline)
- `partyCondition` returns <0.8 for low-health low-food state (struggling)
- `partyCondition` returns >1.2 for high-health over-provisioned state (pushing)
- Disease onset with seeded RNG is ~50% of baseline when party is struggling
- Progress amplifier reduces mercy near mile 1700 (final stretch stays hard)

### Phase C re-measurement
- Same 30-scenario harness
- Gate:
  - Farmer-medium wipe_rate UB < 50% AND high-tone wipe_rate LB > 80% (horror tier stays brutal)  → ship. **STOP.**
  - If horror tier wipe rate drops below 80%: the progress amplifier needs more weight. Tune once and re-measure.

### Phase C acceptance
- ~60 net lines in simulation.ts, 0 new fields in types.ts, 5 new tests (131 total)
- Re-measurement JSON committed
- Decision log: "Phase C: farmer-medium {PCT}% [{LB}%–{UB}%], high-tone {PCT}% [{LB}%–{UB}%]. Decision: {STOP / tune amplifier / abandon}."

---

## § 4. What's explicitly NOT in this plan

- Phase D (tone-gated checkbox, explicit "Challenge mode") — **deleted**
- 3×3 tone×difficulty matrix — **deleted**
- New setup screen — **deleted**
- New `difficulty` state field — **deleted**
- New `challenge_mode` field (would collide with existing `challenge_id`) — **deleted**
- Profession money flatten (all $400) — **deleted**
- HMAC back-compat path — unchanged (no new state field means no compat issue)
- Custom difficulty sliders — deleted
- Telemetry wiring — deferred; Phase A's JSON is the baseline until real telemetry ships

If the game still feels too hard after A+B+C and real user data (not synthetic playthroughs) justifies it, we plan Phase D separately with that data in hand. Not before.

---

## § 5. Sequencing + rollback

Tag `pre-difficulty-v3` at HEAD `ccbedfe` before any phase lands.

Phase A is always first, produces data only. Phase B, if it triggers, is a 2-constant commit. Phase C is a single-file addition.

Revert order:
1. Phase C revert: adaptive off, Phase B tune remains
2. Phase B revert: Medium goes back to pre-tune
3. Phase A: no code, no revert

Each phase ships independently. Standard `git revert <sha>` works for any.

---

## § 6. Testing strategy summary

| Phase | Unit tests added | Playthrough scenarios | Total tests if all ship |
|---|---|---|---|
| A | 0 | 30 runs measured, JSON committed | 124 |
| B | 2 | 30 reruns | 126 |
| C | 5 | 30 reruns | 131 |

Total delta if every phase ships: +7 tests. v1 was +15 for the axis. v2 was +12 for the phased plan. v3 is genuinely the minimum.

---

## § 7. Pre-mortem — how v3 fails

Per `feedback_pre_mortem_before_review`:

1. **Phase A's harness is too synthetic to detect real-user unfairness.** Explicitly acknowledged. Claim narrowed to "catastrophic breakage." If real users later complain and the harness said "fine," we add telemetry and re-plan. No loss.
2. **Phase B tune is too aggressive, Medium becomes trivial at survival-rate <20%.** Mitigation: ship with `DISEASE_PROBABILITY_MULTIPLIER = 0.7`, revert to 0.85 if re-measurement wipe rate falls below 20%. Not a user-blocking issue.
3. **Phase C's `partyCondition` has an unexpected feedback loop** (e.g., low-health parties get less disease but miss recovery events, getting stuck at low health forever). Mitigation: the progress amplifier prevents indefinite mercy — near-end parties get full danger regardless of condition. Tests assert this explicitly.
4. **Phase C is perceived as cheating by players who notice the pattern.** Mitigation: the continuous formula is harder to spot than a post-death timer. No carve-outs, no journal lampshading, no visible threshold. The signal is on the boundary of perceptibility.
5. **The whole plan is premature — Phase A finds Medium is fine.** That's a success outcome. Spent 1 hour measuring. Nothing to revert. Re-measurement JSON becomes a regression reference for any future balance work.

---

## § 8. Decision tree summary

```
Phase A (always) ─── measure farmer-medium with CI on N=15
     │
     ├─ wipe_rate UB < 40% ─── STOP. Ship nothing.
     │
     ├─ 40–70% ─── Phase B, then re-measure
     │              │
     │              ├─ UB < 40%? ─── STOP, ship B
     │              │
     │              └─ still ≥ 40%? ── Phase C
     │
     └─ LB ≥ 70% ── Phase B, then re-measure
                      │
                      └─ (same gate as above → STOP or Phase C)

Phase C (last resort):
     partyCondition() continuously varies danger
     Gate: farmer-medium < 50% wipe AND high-tone > 80% wipe (horror intact)
     If horror tier softens too much: tune progress amplifier
```

---

## § 9. Review gauntlet

- [x] CEO Review v1 — REJECTED (6/6 findings, drove v2 rewrite)
- [x] CEO Review v2 — MODIFY FURTHER (5 findings, drove this v3)
- [ ] CEO Review v3 — pending autoplan re-run
- [ ] Codex Review v3 — pending
- [ ] Eng Review — pending (not yet reached)
- [ ] Design Review — N/A (no UI changes in v3 — tone screen unchanged, no new scene, no new copy)
- [ ] DX Review — N/A (not dev-facing)

---

## § 10. History

- **v1** (first draft) — 3×3 matrix, new scene, tone/difficulty orthogonal, 6-8 hrs. Rejected by both CEO voices for diluting horror hook, over-architecting, contradicting PLAN.md:85.
- **v2** (revised after v1 rejection) — phased approach, tone-gated checkbox, profession flatten, 4 phases with measurement gates. Sent back by both voices: Medium+Challenge is new dilution vector; Phase C was rubber-banding; profession flatten was net loss.
- **v3 (current)** — converged minimum. No axis, no checkbox, no new field. Phase C redesigned as live-state-aware. Profession money spread intact. Ships in phases with honest measurement gates and an explicit STOP outcome.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review (v1) | `/plan-ceo-review` | Scope & strategy | 1 | **REJECTED** | 6/6 consensus reject |
| CEO Review (v2) | `/plan-ceo-review` | Scope & strategy | 1 | **MODIFY FURTHER** | 5 converged findings |
| CEO Review (v3) | `/plan-ceo-review` | Scope & strategy | 0 | Pending | — |
| Codex Review (v1) | `/codex review` | Independent 2nd opinion | 1 | **REJECT** | Aligned with CEO v1 |
| Codex Review (v2) | `/codex review` | Independent 2nd opinion | 1 | **MODIFY FURTHER** | Aligned with CEO v2 |
| Codex Review (v3) | `/codex review` | Independent 2nd opinion | 0 | Pending | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | Pending | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | N/A (no UI changes in v3) | — |
| DX Review | `/plan-devex-review` | DX gaps | 0 | N/A (not dev-facing) | — |

**VERDICT:** v3 ready for autoplan re-run. Both prior CEO phases converged on this exact shape.
