# Difficulty System — Current Status

**Authoritative tracker for where we are in the A+B phased plan.** Updated after every phase decision. Human-readable counterpart to `.gstack/qa-reports/difficulty-calibration-*.json` (machine-readable).

See `DIFFICULTY_SYSTEM_PLAN.md` for the full plan. Phase C deferred until real user telemetry justifies it.

---

## 🎯 CURRENT PHASE: Phase B — Medium tune

**Status:** 🟡 Phase A complete, Phase B triggered
**Started:** 2026-04-17
**Last updated:** 2026-04-17
**Owner:** Ryan + Claude
**Blocker:** none

---

## Phase ledger

| Phase | State | Result | Commit | Date |
|---|---|---|---|---|
| **A** — Measure 30 playthroughs, decide STOP/B | 🟢 done | PHASE_B_BORDERLINE | see calibration JSON | 2026-04-18 |
| **B** — Disease ×0.7, starvation grace 3→4 | 🟡 triggered — implementing | — | — | 2026-04-18 |
| **C** — Live-state adaptive difficulty | ⛔ deferred | — | — | waiting for real user data |

Legend: 🟢 done · 🟡 in progress · 🔴 blocked · ⚪ not started · ⛔ deferred

---

## Decision log

_(appended to as decisions are made)_

| # | Date | Phase | Decision | Data | Rationale |
|---|---|---|---|---|---|
| 1 | 2026-04-18 | A | PHASE_B | wipe 100.0% CI [79.6–100.0%] | farmer-medium wipe_rate_LB 79.6% ≥ 70%. Medium is clearly broken. Ship Phase B tune. |

---

## Last measurement

_(filled in after Phase A completes)_

**Calibration JSON:** `.gstack/qa-reports/difficulty-calibration-v3-postB.json`
**Worker version:** pending
**Scenarios run:** 30 / 30

### Results (filled in after Phase A):

| Scenario | N | Wipe rate | 95% CI | Median miles | First-death day |
|---|---|---|---|---|---|
| farmer-steady-medium | 15 | 66.7% | [41.7%–84.8%] | 176 | 22.5 |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 315 | 18 |
| farmer-steady-high | 5 | 100.0% | [56.6%–100.0%] | 211 | 25 |
| banker-steady-medium | 5 | 80.0% | [37.6%–96.4%] | 370 | 38 |

---

## What's next

Run Phase A. 30 playthroughs against production. Estimate ~10 min wall-clock.

```bash
cd /home/ryan/code/oregon-trail
node scripts/measure-calibration.mjs --runs=30 --url=https://trail.osi-cyber.com
```

Script produces `scripts/calibration-history/2026-04-17-phaseA-preB.json` + updates this file's "Last measurement" section.

---

## How to read this file

- **🟡 in progress:** something is running right now, or waiting on a human decision
- **🟢 done:** phase shipped, decision recorded, artifact committed
- **⛔ deferred:** explicitly on hold; do not work on this without changing status first
- **Phase ledger:** source of truth for what's shipped vs. what's pending
- **Decision log:** append-only audit trail; never edit past rows

If you're coming back to this project after a break: read this file first. Then `git log --oneline -10` to see recent commits. The last row in the decision log is where you left off.
