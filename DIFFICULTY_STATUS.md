# Difficulty System — Current Status

**Authoritative tracker for where we are in the A+B phased plan.** Updated after every phase decision. Human-readable counterpart to `.gstack/qa-reports/difficulty-calibration-*.json` (machine-readable).

See `DIFFICULTY_SYSTEM_PLAN.md` for the full plan. Phase C deferred until real user telemetry justifies it.

---

## 🎯 CURRENT PHASE: Phase A — Emergency Calibration

**Status:** Initializing (tracker just created)
**Started:** 2026-04-17
**Last updated:** 2026-04-17
**Owner:** Ryan + Claude
**Blocker:** none

---

## Phase ledger

| Phase | State | Result | Commit | Date |
|---|---|---|---|---|
| **A** — Measure 30 playthroughs, decide STOP/B | 🟡 in progress | — | — | 2026-04-17 |
| **B** — Disease ×0.7, starvation grace 3→4 | ⚪ gated on A | — | — | — |
| **C** — Live-state adaptive difficulty | ⛔ deferred | — | — | waiting for real user data |

Legend: 🟢 done · 🟡 in progress · 🔴 blocked · ⚪ not started · ⛔ deferred

---

## Decision log

_(appended to as decisions are made)_

| # | Date | Phase | Decision | Data | Rationale |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

---

## Last measurement

_(filled in after Phase A completes)_

**Calibration JSON:** not yet produced
**Worker version:** pending
**Scenarios run:** 0 / 30

### Results (filled in after Phase A):

| Scenario | N | Wipe rate | 95% CI | Median miles | First-death day |
|---|---|---|---|---|---|
| farmer-steady-medium | — | — | — | — | — |
| carpenter-steady-medium | — | — | — | — | — |
| farmer-steady-high | — | — | — | — | — |
| banker-steady-medium | — | — | — | — | — |

---

## What's next

Run Phase A. 30 playthroughs against production. Estimate ~10 min wall-clock.

```bash
cd /home/ryan/code/oregon-trail
node scripts/measure-calibration.mjs --runs=30 --url=https://trail.osi-cyber.com
```

Script produces `.gstack/qa-reports/difficulty-calibration-v3.json` + updates this file's "Last measurement" section.

---

## How to read this file

- **🟡 in progress:** something is running right now, or waiting on a human decision
- **🟢 done:** phase shipped, decision recorded, artifact committed
- **⛔ deferred:** explicitly on hold; do not work on this without changing status first
- **Phase ledger:** source of truth for what's shipped vs. what's pending
- **Decision log:** append-only audit trail; never edit past rows

If you're coming back to this project after a break: read this file first. Then `git log --oneline -10` to see recent commits. The last row in the decision log is where you left off.
