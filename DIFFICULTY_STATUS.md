# Difficulty System — Current Status

**Authoritative tracker for where we are in the phased plan.** Updated after every phase decision. Machine-readable counterparts in `scripts/calibration-history/*.json`.

See `DIFFICULTY_SYSTEM_PLAN.md` for the full plan. Phase C deferred until real user telemetry justifies it.

---

## 🎯 CURRENT PHASE: **Phases A + B + B.2 complete. Deferred Phase C. Tuning exhausted against synthetic harness.**

**Status:** 🟢 Three tunes shipped. All extend run length by 25–130 miles depending on profession. None prevent wipe against the synthetic harness because `playthrough.mjs` cannot hunt — parties always starve eventually. Real human players would hunt and likely survive further. Next input: real user telemetry.
**Owner:** Ryan + Claude
**Blocker:** none

---

## Phase ledger

| Phase | State | Result | Commit | Worker | Date |
|---|---|---|---|---|---|
| **A** — Measure 30 playthroughs | 🟢 done | PHASE_B triggered | `678e44e` | `e7d18d36` (baseline) | 2026-04-17 |
| **B** — Disease ×0.7, starvation grace 3→4 | 🟢 done | Moved cause distribution, not wipe rate | `ed6729e` | `9592b64d` | 2026-04-17 |
| **B.2** — Filling rations 3→2, meager 2→1.5 | 🟢 done | Extended run length 27–134 mi; still 100% wipes in harness | `92cac0b` | `36ce1d55` | 2026-04-17 |
| **C** — Live-state adaptive difficulty | ⛔ deferred | — | — | — | waiting for real user data |

Legend: 🟢 done · 🟡 in progress · 🔴 blocked · ⚪ not started · ⛔ deferred

---

## Decision log

_(append-only; never edit past rows)_

| # | Date | Phase | Decision | Data | Rationale |
|---|---|---|---|---|---|
| 1 | 2026-04-17 | A | PHASE_B | farmer-medium 100% wipe (15/15), CI [79.6%–100%] | LB ≥ 70% threshold. Medium clearly broken. Ship Phase B. |
| 2 | 2026-04-17 | B | SHIPPED + RE-MEASURED | farmer-medium 10/10 valid wipes (100%), +27mi median vs pre-B | Not 66.7% (5 UNKNOWNs during deploy propagation inflated that). Disease causes down (dysentery 9→3, typhoid 8→5); starvation share grew 49%→56%. Cause distribution moved but wipe rate didn't. |
| 3 | 2026-04-17 | B.2 | SHIPPED | farmer 15/15 wipe (100%), median 254mi (+33 vs pre-B); banker 411mi (+96); carpenter 369mi (+98); farmer-high 282mi (+134) | Ration tune extends runs meaningfully across all profiles. Horror tier still brutal (100% wipe). |
| 4 | 2026-04-17 | (harness) | LIMITATION NOTED | synthetic playthrough.mjs cannot HUNT | All wipes are starvation-dominated because parties can't replenish food. Real users would hunt at low food. Further synthetic tuning has diminishing value. |
| 5 | 2026-04-17 | C | DEFERRED | n/a | Ship what's shipped. Collect real user telemetry before more tuning. |

---

## Measurements

### Pre-Phase-B baseline (worker `e7d18d36`, 2026-04-17)

**Source:** `scripts/calibration-history/2026-04-17-phaseA-preB.json`

| Scenario | N | Wipe rate | 95% CI | Median miles | First-death day |
|---|---|---|---|---|---|
| farmer-steady-medium | 15 | 100.0% | [79.6%–100.0%] | 227 | 22 |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 271 | 17 |
| farmer-steady-high | 5 | 80.0% | [37.6%–96.4%] | 148 | 22.5 |
| banker-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 315 | 32 |

Cause distribution, farmer-steady-medium (74 deaths):
- **exhaustion: 36 (49%)** — starvation dominant from the start
- dysentery: 9 · typhoid: 8 · measles: 5 · Stampede: 5 · cholera: 4 · mountain_fever: 3 · scurvy: 2 · drowning: 2

### Post-Phase-B (worker `9592b64d`, 2026-04-17)

**Source:** `scripts/calibration-history/2026-04-17-phaseA-postB.json`

| Scenario | N valid | Wipe rate | 95% CI | Median (valid only) |
|---|---|---|---|---|
| farmer-steady-medium | 10 (5 UNKNOWN during deploy) | **10/10 = 100%** | [69.2%–100%] | 221 |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 315 |
| farmer-steady-high | 5 | 100.0% | [56.6%–100.0%] | 211 |
| banker-steady-medium | 4 (1 UNKNOWN) | 4/4 = 100% | [51.0%–100%] | 370 |

Cause distribution shift, farmer-steady-medium (50 deaths in 10 valid wipes):
- **exhaustion: 28 (56%)** — up from 49% pre-B
- typhoid: 5 (was 8) · scurvy: 4 (was 2) · dysentery: 3 (was 9) · cholera: 2 (was 4) · measles: 2 (was 5)

Disease share dropped, starvation grew. Wipe rate unchanged.

### Post-Phase-B.2 (worker `36ce1d55`, 2026-04-17)

**Source:** `scripts/calibration-history/2026-04-17-phaseBv2-postB2.json`

| Scenario | N | Wipe rate | 95% CI | Median miles | Δ vs pre-B |
|---|---|---|---|---|---|
| farmer-steady-medium | 15 | 100.0% | [79.6%–100.0%] | **254** | +27 mi |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | **369** | +98 mi |
| farmer-steady-high | 5 | 100.0% | [56.6%–100.0%] | **282** | +134 mi |
| banker-steady-medium | 5 | 100.0% | [56.6%–100.0%] | **411** | +96 mi |

---

## Interpretation

Three observations from the calibration harness:

1. **Phase B moved cause distribution.** Disease deaths in farmer-medium dropped meaningfully (dysentery 9→3, typhoid 8→5). Starvation's share grew from 49% → 56% because fewer people were dying before they starved.

2. **Phase B.2 extended run length across the board.** farmer-high gained the most (148 → 282, +134 mi). Banker reached 411 mi median. But all scenarios still 100% wipe.

3. **The harness can't hunt.** `playthrough.mjs` handles TRAVEL, EVENT, RIVER, LANDMARK, DEATH — it does not handle the HUNTING scene. The engine has hunting (`/api/hunt`, yields food) but it's manual — a user has to invoke it. The synthetic harness just burns food and starves. Real users with nonzero attention will hunt when food drops. The 100% wipe rate is almost certainly pessimistic relative to real play.

**This is the point where further synthetic tuning has diminishing value.** The tuning is genuinely making runs longer (data confirms), but the binding constraint for a no-hunt harness is food runway, and extending runway indefinitely would make the game trivially easy for real users who DO hunt. The next useful signal is real user telemetry.

---

## What's next

**Ship the three tunes as-is.** Revisit in 2 weeks once there's real user data on trail.osi-cyber.com:

- If real users are wiping at mile ~200 like the harness, implement Phase C (live-state adaptive per PLAN.md:164) — parties that haven't hunted get gentle food recovery at landmarks, parties that are thriving get pushed harder.
- If real users are surviving further (because they hunt): leave as-is, the game is meant to be hard. Survival rate isn't the KPI; shareable artifacts (newspaper, epitaphs) are.
- If the game feels too easy now: revert B.2 rations.

Re-measuring is cheap:
```bash
cd /home/ryan/code/oregon-trail
node scripts/measure-calibration.mjs --parallel=5 \
  --out=scripts/calibration-history/<date>-<stage>.json
```

To make the harness more realistic later: extend `playthrough.mjs` to invoke `engine.startHunt()` when `supplies.food < 50`. Would tighten the measurement's claim to "is the game survivable with sensible play" instead of "is the game survivable with zero effort."

---

## How to read this file

- **🟡 in progress:** something running right now, or waiting on a human decision
- **🟢 done:** phase shipped, decision recorded, artifact committed
- **⛔ deferred:** explicitly on hold; don't work on this without changing status first
- **Phase ledger:** source of truth for what's shipped vs. pending
- **Decision log:** append-only audit trail; never edit past rows
- **Measurements:** snapshots in time; `scripts/calibration-history/` has the full JSON per run

If you're coming back to this project after a break: read this file first. Then `git log --oneline -10` for recent commits. The last row in the decision log is where you left off.
