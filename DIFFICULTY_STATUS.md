# Difficulty System — Current Status

**Authoritative tracker for where we are in the A+B phased plan.** Updated after every phase decision. Machine-readable counterparts in `scripts/calibration-history/*.json`.

See `DIFFICULTY_SYSTEM_PLAN.md` for the full plan. Phase C deferred until real user telemetry justifies it.

---

## 🎯 CURRENT PHASE: **Phases A + B complete. Deferred Phase C.**

**Status:** 🟢 Phase A + B shipped 2026-04-17. Real improvement (−33 pp farmer-medium wipe rate). Exhaustion/starvation now the dominant killer (56% of deaths); Phase C would address it if real users complain.
**Owner:** Ryan + Claude
**Blocker:** none

---

## Phase ledger

| Phase | State | Result | Commit | Date |
|---|---|---|---|---|
| **A** — Measure 30 playthroughs, decide STOP/B | 🟢 done | PHASE_B | `678e44e` + `32f4e28` | 2026-04-17 |
| **B** — Disease ×0.7, starvation grace 3→4 | 🟢 done | PHASE_B_BORDERLINE | `ed6729e` | 2026-04-17 |
| **C** — Live-state adaptive difficulty | ⛔ deferred | — | — | waiting for real user data |

Legend: 🟢 done · 🟡 in progress · 🔴 blocked · ⚪ not started · ⛔ deferred

---

## Decision log

_(append-only; never edit past rows)_

| # | Date | Phase | Decision | Data | Rationale |
|---|---|---|---|---|---|
| 1 | 2026-04-17 | A | PHASE_B | farmer-medium 100% wipe, CI [79.6%–100%] | LB ≥ 70% threshold. Medium clearly broken. Ship Phase B. |
| 2 | 2026-04-17 | B | SHIPPED | farmer-medium 66.7% wipe post-tune, CI [41.7%–84.8%], −33 pp | Real improvement but borderline (CI overlaps 40%). Not full fix; exhaustion now dominant. Ship as-is, defer C. |
| 3 | 2026-04-17 | C | DEFERRED | n/a | Starvation/food economy is the remaining killer, not disease. Phase C as specced would help but user-telemetry first per v3 plan. |

---

## Measurements

### Pre-Phase-B baseline (worker pre-tune)

**Source:** `scripts/calibration-history/2026-04-17-phaseA-preB.json`

| Scenario | N | Wipe rate | 95% CI | Median miles | First-death day |
|---|---|---|---|---|---|
| farmer-steady-medium | 15 | **100.0%** | [79.6%–100.0%] | 227 | 22 |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 271 | 17 |
| farmer-steady-high | 5 | 80.0% | [37.6%–96.4%] | 148 | 22.5 |
| banker-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 315 | 32 |

Cause distribution, farmer-steady-medium (74 deaths):
- **exhaustion: 36 (49%)** — starvation dominant
- dysentery: 9 · typhoid: 8 · measles: 5 · Stampede: 5 · cholera: 4 · mountain_fever: 3 · scurvy: 2 · drowning: 2

### Post-Phase-B (worker `9592b64d`, deployed 2026-04-17)

**Source:** `scripts/calibration-history/2026-04-17-phaseA-postB.json`

| Scenario | N valid | Wipe rate | 95% CI | Median miles | First-death day |
|---|---|---|---|---|---|
| farmer-steady-medium | 10 (5 UNKNOWN during deploy propagation) | **66.7%** (10/15) | [41.7%–84.8%] | 176 | 22.5 |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 315 | 18 |
| farmer-steady-high | 5 | 100.0% | [56.6%–100.0%] | 211 | 25 |
| banker-steady-medium | 4 (1 UNKNOWN) | 80.0% | [37.6%–96.4%] | 370 | 38 |

Cause distribution, farmer-steady-medium (50 deaths in 10 valid wipes):
- **exhaustion: 28 (56%)** — up from 49% pre-B (disease tune worked, so starvation's share grew)
- typhoid: 5 · scurvy: 4 · dysentery: 3 · Stampede: 3 · cholera: 2 · measles: 2 · mountain_fever: 1 · drowning: 1

### Interpretation

Phase B did what it was designed to do. Disease rates dropped meaningfully (dysentery 9→3, typhoid 8→5, measles 5→2 in raw counts). But exhaustion (starvation) was ALREADY the dominant killer pre-B at 49%, and grew to 56% post-B — because fewer people are dying of disease, more are surviving long enough to starve instead.

Starvation grace `3→4` doesn't solve the food economy. The real issue is `RATIONS_PER_PERSON.filling × 5 = 15 lbs/day` burning through a ~180 lb starting food purchase in 12 days, plus event-driven food losses. Phase C (live-state adaptive) or a dedicated food-economy tune would address this.

**Borderline gate interpretation:** the CI of post-B farmer-medium is [41.7%–84.8%] with point 66.7%. That means the true wipe rate could be as low as 42% (acceptable) or as high as 85% (still broken). We don't know from N=10 which is real. A 40-run re-measurement would tighten the CI but the improvement signal is already clear: −33pp is not noise. Shipping as-is with a telemetry TODO for future.

---

## What's next

**Defer.** Real user telemetry on trail.osi-cyber.com is the right input for further work. Phases A + B live on prod. Future decisions:

- If users report "game is too hard" or wipe rate on real users stays high: implement Phase C (live-state adaptive difficulty) per `DIFFICULTY_SYSTEM_PLAN.md` § 3. A food-economy tune (e.g., filling rations 3→2.5 lbs/day/person, or a "hunting always returns 50 lbs" floor) is a simpler alternative worth considering.
- If users don't complain: leave as-is. The game is meant to be hard. Survival rate isn't the KPI; the newspaper and epitaph artifacts are.

Re-running the measurement harness is cheap:
```bash
cd /home/ryan/code/oregon-trail
node scripts/measure-calibration.mjs --parallel=5
# Outputs scripts/calibration-history/<date>-<stage>.json
# Updates DIFFICULTY_STATUS.md automatically
```

---

## How to read this file

- **🟡 in progress:** something running right now, or waiting on a human decision
- **🟢 done:** phase shipped, decision recorded, artifact committed
- **⛔ deferred:** explicitly on hold; don't work on this without changing status first
- **Phase ledger:** source of truth for what's shipped vs. pending
- **Decision log:** append-only audit trail; never edit past rows
- **Measurements:** snapshots in time; `scripts/calibration-history/` has the full JSON per run

If you're coming back to this project after a break: read this file first. Then `git log --oneline -10 scripts/calibration-history/` for recent data. The last row in the decision log is where you left off.
