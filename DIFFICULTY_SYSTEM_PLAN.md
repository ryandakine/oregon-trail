# Difficulty System — As Built

System doc for Oregon Trail AI Edition's difficulty mechanics as they exist in the deployed game. Reflects what's live on trail.osi-cyber.com after Phases A + B + B.2 (2026-04-17).

If you want the decision history, see `DIFFICULTY_STATUS.md`.
If you want raw calibration data, see `scripts/calibration-history/*.json`.
If you want the code, see `worker/src/simulation.ts`.

---

## 1. Overview

Difficulty in this game is the shape of the survival economy. There's no "Easy/Normal/Hard" toggle. Difficulty emerges from three player-set inputs interacting with a daily simulation loop:

**Inputs (set by the player):**
- `pace`: steady | strenuous | grueling
- `rations`: filling | meager | bare_bones
- `tone_tier`: low | medium | high (narrative intensity; also gates Bitter Path)

**Outputs (what the simulation produces):**
- miles gained per day
- food consumed per day
- health/morale deltas per member
- disease rolls per day
- starvation damage (after grace)
- event trigger frequency

All simulation runs server-side in `worker/src/simulation.ts::advanceDays()`. The client sends a signed state blob; the server advances 1-5 game days and returns the new signed state plus a trigger (travel | event | river | landmark | death | wipe | arrival | bitter_path).

There is no hidden difficulty slider. Profession affects starting money ($400 farmer / $800 carpenter / $1600 banker), which means banker starts with more supplies. That's the only baked-in difficulty modifier beyond the three inputs above.

---

## 2. Input dimensions

### 2.1 Pace
Set via `state.settings.pace`. Affects miles/day and health/morale.

```ts
const PACE_MILES: Record<Pace, number> = {
  steady: 12,
  strenuous: 16,
  grueling: 20,
};
```

`grueling` additionally applies a daily penalty to every alive member:
- health -2/day
- morale -3/day

`steady` and `strenuous` have no direct health/morale cost. `strenuous` is strictly "more miles, no penalty" — the cost is indirect (more days means more disease rolls and food burn per mile traveled is unchanged, but you complete the trip faster).

### 2.2 Rations
Set via `state.settings.rations`. Affects food consumed per person per day.

```ts
const RATIONS_PER_PERSON: Record<Rations, number> = {
  filling: 2,       // was 3 (Phase B.2)
  meager: 1.5,      // was 2 (Phase B.2)
  bare_bones: 1,
};
```

Total daily food burn = `RATIONS_PER_PERSON[rations] * aliveCount`. Food is clamped at 0 (no negative food; you just stop consuming).

Rations do not directly damage morale or health. Starvation only kicks in when `supplies.food === 0`.

### 2.3 Tone tier
Set via `state.settings.tone_tier`. Does not affect survival math directly. It affects:
- LLM system prompt (different narrative register per tier; see `worker/src/prompt-templates.ts`)
- Bitter Path eligibility: only `high` tier can trigger the `bitter_path` event

The tone tier is the product's marketing hook (horror tier = High). It is NOT a difficulty knob by design. The simulation loop treats low/medium/high identically for food, disease, and starvation math.

---

## 3. Effect model (current numbers)

Order of operations inside one simulated day in `advanceDays()`:

### 3.1 Movement
```
milesGained = round(PACE_MILES[pace] * weather.pace_modifier * oxen_modifier)
```

Oxen gate movement:
- 6+ oxen: 1.0×
- 4-5 oxen: 0.7×
- 2-3 oxen: 0.4×
- 0-1 oxen: 0 (party is stranded)

Weather `pace_modifier` comes from `historical-context.json`, keyed by (month, region). Typical range 0.8-1.1.

### 3.2 Food consumption
```
foodPerDay = RATIONS_PER_PERSON[rations] * aliveCount
food = max(0, food - foodPerDay)
```

With the Phase B.2 values above, a 5-person party on filling burns 10 lbs/day. Bare_bones with 5 alive is 5 lbs/day.

### 3.3 Starvation
When `food === 0`, `starvation_days` increments. Once `starvation_days >= STARVATION_GRACE_DAYS` (currently 4, was 3 pre-Phase-B), every alive member takes:
- health -10/day
- morale -10/day

First food purchase or successful hunt resets `starvation_days = 0`.

### 3.4 Disease roll
Max one new disease per party per day. For each alive, non-sick member, loop over `ctx.diseases`:

```
risk = 1 + (region_elevated ? 1 : 0) + (month_elevated ? 0.5 : 0)
P(contract) = disease.base_probability_per_day * risk * DISEASE_PROBABILITY_MULTIPLIER
```

`DISEASE_PROBABILITY_MULTIPLIER = 0.7` (Phase B). Base probabilities from `historical-context.json`:

| Disease | base P/day | progression | mortality |
|---|---|---|---|
| cholera | 0.008 | 3 | 0.50 |
| dysentery | 0.006 | 14 | 0.15 |
| accidental_injury | 0.005 | 7 | 0.25 |
| measles | 0.004 | 10 | 0.08 |
| mountain_fever | 0.004 | 14 | 0.12 |
| typhoid | 0.003 | 21 | 0.20 |
| scurvy | 0.003 | 30 | 0.10 |

Loop breaks on first successful roll. First member in the loop has priority if multiple would have rolled.

### 3.5 Disease progression
Each sick member loses `ceil(100 * mortality_rate / progression_days)` health per day. One dose of medicine halves that day's loss and consumes 1 medicine. After `progression_days`, 50/50 coin flip: cure or continue rolling.

Health at 0 = death. Cause is the disease id if sick, else `"exhaustion"`.

### 3.6 Event frequency
After all the above, if no terminal trigger (death/wipe/arrival/landmark/river/bitter_path) fires:

```ts
if (days_since_last_event >= 2 &&
    (days_since_last_event >= 5 || Math.random() < 0.3)) {
  return { trigger: "event" };
}
```

So: minimum 2 days between events, 30% chance each day from day 3-4, forced event on day 5. Expected gap is ~3-4 days. Events are LLM-generated per tone tier (or fallback from `anthropic.ts::FALLBACK_EVENTS`).

### 3.7 Bitter Path (high tier only)
Late-stage trigger; a special event variant. Fires only when all of:
- `tone_tier === "high"`
- `bitter_path_taken === "none"` (once per run)
- `deaths.length >= 1` (and most recent death within 3 game-days)
- EITHER `starvation_days >= 5` (variant: wasting)
- OR `food === 0 && starvation_days >= 2 && avgAliveHealth < 40` (variant: failing)

Server kill switch: `opts.bitterPathEnabled` (default true). See `BITTER_PATH_PLAN.md` for the narrative design.

---

## 4. Phase A — the measurement

Shipped `scripts/measure-calibration.mjs` and `scripts/playthrough.mjs`. The playthrough script drives the real deployed game via Playwright: picks a profession, names the party, buys a canned supply loadout, picks option 0 on every event, fords every river, continues at every landmark, and advances until WIPE / ARRIVAL / tick cap. The harness runs N playthroughs in parallel across 4 scenarios.

**Baseline (pre-Phase-B, worker `e7d18d36`, 2026-04-17):**

| Scenario | N | Wipe rate | 95% CI | Median miles | First-death day |
|---|---|---|---|---|---|
| farmer-steady-medium | 15 | 100.0% | [79.6%–100.0%] | 227 | 22 |
| carpenter-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 271 | 17 |
| farmer-steady-high | 5 | 80.0% | [37.6%–96.4%] | 148 | 22.5 |
| banker-steady-medium | 5 | 100.0% | [56.6%–100.0%] | 315 | 32 |

Cause distribution, farmer-steady-medium (74 deaths across 15 runs):
- exhaustion: 36 (49%) — starvation was already dominant
- dysentery 9, typhoid 8, measles 5, Stampede 5, cholera 4, mountain_fever 3, scurvy 2, drowning 2

**Gate:** Wilson 95% lower bound of wipe rate >= 70% OR early-death (first 10 days) rate >= 30% → PHASE_B. Farmer-medium LB 79.6%, so PHASE_B triggered.

Full JSON: `scripts/calibration-history/2026-04-17-phaseA-preB.json`.

---

## 5. Phase B — disease softening

Shipped commit `ed6729e`, worker `9592b64d`.

Two constants in `simulation.ts`:
```ts
const DISEASE_PROBABILITY_MULTIPLIER = 0.7;   // was implicitly 1.0
const STARVATION_GRACE_DAYS = 4;              // was 3
```

**Post-B measurement:** farmer-steady-medium 10/10 wipes (100%, 5 runs came back UNKNOWN during deploy propagation and were excluded). Median 221 miles.

What moved:
- dysentery deaths 9 → 3
- typhoid 8 → 5
- measles 5 → 2
- cholera 4 → 2
- exhaustion share: 49% → 56% (more people reached starvation instead of dying to disease first)

Disease was tamed. Wipe rate didn't move because starvation was the binding constraint, and the measurement harness cannot hunt to replenish food. This is what triggered Phase B.2.

Full JSON: `scripts/calibration-history/2026-04-17-phaseA-postB.json`.

---

## 6. Phase B.2 — ration runway

Shipped commit `92cac0b`, worker `36ce1d55`.

Dropped daily consumption for the two top rations:
```ts
filling: 3 → 2
meager: 2 → 1.5
bare_bones: 1 (unchanged)
```

Math: with 5 people on `filling`, old burn was 15 lbs/day on ~180 lbs starting food = 12-day runway. New burn is 10 lbs/day = 18-day runway.

**Post-B.2 measurement:**

| Scenario | N | Wipe rate | Median miles | Δ vs pre-B |
|---|---|---|---|---|
| farmer-steady-medium | 15 | 100.0% | 254 | +27 mi |
| carpenter-steady-medium | 5 | 100.0% | 369 | +98 mi |
| farmer-steady-high | 5 | 100.0% | 282 | +134 mi |
| banker-steady-medium | 5 | 100.0% | 411 | +96 mi |

Every scenario got meaningful additional runway. Still 100% wipe against the harness because the harness still cannot hunt. Real players who hunt when food drops will see significantly better survival.

Full JSON: `scripts/calibration-history/2026-04-17-phaseBv2-postB2.json`.

---

## 7. How to retune

The measurement → tune → re-measure loop is cheap. ~3-5 minutes end-to-end depending on parallelism.

### 7.1 Run the harness

```bash
cd /home/ryan/code/oregon-trail
node scripts/measure-calibration.mjs \
  --parallel=5 \
  --out=scripts/calibration-history/<YYYY-MM-DD>-<stage>.json
```

Flags:
- `--url=<worker>` — defaults to `https://trail.osi-cyber.com`. Point at a staging worker for pre-deploy measurement.
- `--parallel=<N>` — concurrent browser contexts. 5 is safe; 10 works if the machine can handle it.
- `--out=<path>` — JSON output path.

Writes JSON report and in-place updates `DIFFICULTY_STATUS.md`'s Measurements section. Exit code 10 when the gate triggers PHASE_B, 0 otherwise.

Scenarios are hardcoded at the top of `measure-calibration.mjs` (farmer/carpenter/banker × steady × medium + one farmer-steady-high). Edit there if you want different configs.

### 7.2 Interpret

- Wilson 95% CI lower bound on wipe rate. Gate: LB >= 70% = broken.
- First-10-days fatality rate. Gate: >= 30% = broken pacing.
- Cause distribution from the `deaths` array in each run.
- Median miles and median first-death day.

### 7.3 Tune

Constants live at the top of `worker/src/simulation.ts`:
```ts
const PACE_MILES = { steady: 12, strenuous: 16, grueling: 20 };
const RATIONS_PER_PERSON = { filling: 2, meager: 1.5, bare_bones: 1 };
const DISEASE_PROBABILITY_MULTIPLIER = 0.7;
const STARVATION_GRACE_DAYS = 4;
```

Change one thing at a time. Commit. Deploy worker (`npx wrangler deploy`). Wait for propagation (~60s). Re-measure.

Vitest suite at `worker/tests/simulation.test.ts` pins a historical 3-lb filling baseline via a fixture toggle so unit tests don't break when production values move. Do not break that toggle.

### 7.4 Harness limitation

`playthrough.mjs` picks option 0 on every event, fords every river, and continues at every landmark. It does not call `/api/hunt`. That means every harness run eventually starves. This is why Phase B.2 still shows 100% wipe against the harness despite real improvement.

To make the harness realistic: extend `playthrough.mjs` to call `window.engine.startHunt?.()` when `supplies.food < 50`. Not yet done.

---

## 8. Known issues / future work

**1. Phase C deferred.** Designed as live-state adaptive difficulty (see `PLAN.md:164`). Concept: parties demonstrably dying get gentle assists (e.g. food recovery at landmarks), parties thriving get pushed harder. Intentionally invisible to the player. Deferred until real user telemetry justifies it — the synthetic harness can't validate it because the harness can't represent "a real player struggling." The prior version of this doc (`DIFFICULTY_SYSTEM_PLAN.md` at commit `aa4e120`) has the full Phase C design if/when we come back to it.

**2. Starvation dominates.** Post-tune, ~56% of deaths are exhaustion. This is an artifact of the harness not hunting. If real telemetry shows the same share in real play, the next tune should be ration-side, not disease-side.

**3. No profession-based survival tuning.** Banker starts with more money, that's it. The three professions produce different runway purely through starting supplies. No hidden profession modifiers in the sim loop.

**4. Tone tier is survival-neutral.** By design. High tier is the horror experience, not a harder game. Bitter Path fires on high only, but it doesn't change survival math — it's narrative.

**5. Harness cannot hunt.** See § 7.4. Every measurement is pessimistic relative to real play. Real-user telemetry is the next real signal.

**6. Weather pace modifier is data-driven, not tunable.** Lives in `historical-context.json` per (month, region). If survivability needs a systemic shift rather than a tune, changing that JSON is more surgical than touching the constants in `simulation.ts`. Not recommended without a specific reason.

**7. Event frequency is not currently a difficulty knob.** 30% roll per day after day 3, forced at day 5. If you want fewer events (less danger, more travel), that lives in the tail of `advanceDays()` (the step labelled "13. Event check"). Don't touch casually — this affects feel as much as difficulty.

---

## 9. File map

| File | Purpose |
|---|---|
| `worker/src/simulation.ts` | The daily loop. All difficulty constants at top. |
| `worker/src/historical-context.json` | Disease probabilities, weather modifiers, regions. |
| `worker/src/types.ts` | Pace, Rations, GameState types. |
| `worker/tests/simulation.test.ts` | Pins historical 3-lb filling baseline via fixture toggle. Do not break. |
| `scripts/measure-calibration.mjs` | 30-run harness, Wilson CI, auto-updates STATUS.md. |
| `scripts/playthrough.mjs` | Single Playwright playthrough. Option 0 everywhere, no hunting. |
| `scripts/calibration-history/*.json` | Raw measurement records. Machine-readable. Append-only. |
| `DIFFICULTY_STATUS.md` | Phase ledger, decision log, current status. |
| `DIFFICULTY_SYSTEM_PLAN.md` | This file. System documentation as-built. |
