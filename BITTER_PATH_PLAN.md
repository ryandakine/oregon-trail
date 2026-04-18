# The Bitter Path — Hidden Horror Win Condition

**Status:** Plan. Not implemented. Pending autoplan review.
**Scope:** Make High tone (horror) beatable via one secret mechanic: cannibalism at a specific moment. Discoverable without tutorials. Hinted at as a challenge.
**Effort:** ~4–6 hours. 4 bisectable commits.
**Lives on top of:** post-Phase-B.2 worker (`36ce1d55`), current game state.

---

## § 0. TL;DR

Right now, horror tier is effectively unwinnable (0 arrivals in 60 synthetic playthroughs; real players won't fare much better because the constraint is real: food economy + disease pressure + horror-tier event severity).

**Ship one hidden mechanic.** When the player is starving AND a party member has recently died AND tone is High, a special event fires — *"The Long Night"* — with three choices. Two of them are normal starving-piety choices. The third, *"Do what the trail demands"*, costs permanent sanity across the surviving party and implicitly references the Donner Party. It feeds the party. Resets starvation. Makes reaching Oregon achievable.

It is never explained. The tone screen adds one line that says it's possible. Landmark text and NPC dialogue throughout horror runs reference the Donner company in period voice. When the conditions approach, the LLM journal surfaces period-voice hints. The player figures it out.

**Why this is the right shape:**
- Matches PLAN.md:82 "Psychological horror and moral decay" literally.
- Historically grounded (Donner Party 1846-47, already referenced in `historical-context.json`).
- Single-run-discoverable. No localStorage tracking. No cross-session state.
- The viral screenshot is the newspaper after a successful run: *"Party of five reached Willamette Valley. Four returned."*
- Existing horror-tier warning already covers it ("graphic illness, death, and moral collapse" — cannibalism is within scope).

---

## § 1. Mechanic — "The Long Night"

### Trigger conditions

All must be true at the start of a simulated day:

1. `state.settings.tone_tier === "high"` — horror tier only
2. `state.supplies.food === 0` — out of food
3. `state.simulation.starvation_days >= 2` — starving, not just ran out
4. `state.deaths.length >= 1` — at least one party member has died
5. A death in `state.deaths` has `date` within the last 3 game-days — recent enough to feel connected
6. `state.simulation.bitter_path_taken !== true` — not taken yet this run

When all six hold, the simulation returns `trigger: "bitter_path"` with `triggerData: { dead_member_name, dead_member_cause, days_since_death }`. No normal event fires that day.

### The event

Single scene, HTML overlay matching existing event.js pattern but with horror-tier styling (crimson + deep black).

**Title:** "The Long Night"

**Description** (LLM-generated, seeded with context about the dead member and the days of starvation):

> The LLM receives the dead member's name, how they died, how many days ago, plus the surviving party's sanity/morale. It writes a Cormac-McCarthy-register paragraph. No explicit description of the act. Examples the prompt gives the model:
>
> - "Sarah died four nights past. You haven't spoken of her since. The wagon is quiet. The food barrel is empty. Martha looks at the covered shape under the canvas and does not look away."
> - "The oxen have not moved in two days. Tom lies where he lay. The fire has not been built. Ethan sharpens his knife with long slow strokes."

**Three choices:**

1. **"Pray, and starve with dignity."** — starvation continues. No state change except `bitter_path_taken = true` (prevents re-firing).
2. **"Travel on. Hope for game."** — same state effect as (1), different journal voice.
3. **"Do what the trail demands."** — the hidden win.
   - `supplies.food += 60`
   - `simulation.starvation_days = 0`
   - For each alive member: `sanity = max(0, sanity - 30)`, `morale = max(0, morale - 20)`
   - `simulation.bitter_path_taken = true`
   - Journal entry: brief, period voice, no graphic detail.
   - End-of-run newspaper gets a `bitter_path_survivor` flag for framing.

All three options set `bitter_path_taken = true` (so the event doesn't nag) but only option 3 applies food/sanity changes.

### State additions

In `worker/src/types.ts`:
```ts
interface SimulationState {
  // ...existing fields
  bitter_path_taken: boolean;  // NEW
}

type TriggerType = ... | "bitter_path";  // NEW in the union
```

In `worker/src/state.ts createInitialState`:
```ts
simulation: {
  // ...existing
  bitter_path_taken: false,
}
```

### HMAC back-compat

Old signed states without `bitter_path_taken` get `false` injected before verification. Tests cover the legacy-state path.

### API endpoint

New route `POST /api/bitter_path` in `worker/src/index.ts`:
- Body: `{ signed_state, event, choice_index }` (matches `/api/choice` shape)
- Validates signature, verifies event hash matches `pending_event_hash`
- Applies consequences per choice_index
- Signs new state, returns

Mirrors `/api/choice` structurally. No new auth pattern.

---

## § 2. Hints — three layers

### Layer 1: Challenge pitch (tone screen)

One line added to the High tone card in `public/scenes/tone.js`:

> **High — "Psychological horror and moral decay"**
> Contains: graphic illness, death, moral collapse.
> *They say the trail can still be crossed under this sky. Those who did never spoke of it.*

Single sentence. No mechanical hint. Frames it as a challenge.

### Layer 2: Ambient hints (always-on in horror runs)

Static text additions in `worker/src/historical-context.json` for three landmarks:

- **Fort Bridger (horror-tier dialogue):** "I rode the Sierra last winter. The party ahead of us made it through, but they did not come back whole."
- **Chimney Rock (horror-tier text):** "The register names forty-eight from the Donner company. Only half reached California. Those who did were changed."
- **Fort Hall (horror-tier prompt hook):** 20% chance an NPC dialogue references winter crossings obliquely.

Implemented as new `dialogue.high` / `flavor.high` arrays in the context file + small prompt-template addition.

### Layer 3: Situational hints (trigger-adjacent)

In `worker/src/prompt-assembly.ts`, when state satisfies `tone=high AND food < 50 AND (deaths.length >= 1 OR starvation_days >= 1)`, append to the LLM user prompt:

> The narrator has begun to think of the Donner stories, though has not said so aloud. If the scene allows, mention this obliquely in period voice.

Example LLM outputs:
- "I thought of the Donner stories tonight for the first time. Martha was sleeping."
- "The old trapper's words at Fort Bridger came back to me. I did not say them aloud."

This surfaces in journal entries visible between day advances. Hint lands when player is near the trigger.

---

## § 3. LLM prompt additions

In `worker/src/prompt-templates.ts`, the High-tone system prompt appended:

```
If food is critically low (< 50 lbs) AND a party member has died recently, 
the narrator may reference the Donner company of 1846 obliquely. Never instruct 
the player. Never break period voice. Period figures would have known the story; 
they would not have spoken of what it implied. Use ellipsis, pause, and what 
is not said.
```

Prompt cost: ~80 additional tokens per horror-tier call when trigger is close. Negligible.

A dedicated system prompt for The Long Night event in `worker/src/anthropic.ts` — separate from normal events, exact Donner context, strict period voice.

---

## § 4. Commit plan (4 bisectable commits)

Tag `pre-bitter-path` before C1.

### C1 — Types, state, HMAC back-compat
Files: `worker/src/types.ts`, `worker/src/state.ts`, `worker/src/hmac.ts`, `worker/tests/state.test.ts`
- Add `bitter_path_taken: boolean` to `SimulationState`
- Add `"bitter_path"` to `TriggerType` union
- Init to `false` in `createInitialState`
- HMAC verify path: inject default `false` if missing (legacy signed states)
- 3 new tests: field initialized, legacy state accepted, tampered field rejected

### C2 — Simulation trigger + API endpoint
Files: `worker/src/simulation.ts`, `worker/src/index.ts`, `worker/src/anthropic.ts`, `worker/src/prompt-templates.ts`, `worker/tests/simulation.test.ts`
- Trigger detection (~15 lines in `advanceDays` before normal event check)
- Long Night event generator in `anthropic.ts` — dedicated system prompt
- `/api/bitter_path` endpoint — validates + applies consequences
- Horror tone system prompt appended with Donner reference clause
- 5 new tests: trigger fires when all 6 conditions met; doesn't fire on Low/Medium; doesn't re-fire after taken; choice 3 updates food+sanity+flag; choices 1/2 update flag only

### C3 — Client scene + engine wiring
Files: `public/engine.js`, `public/main.js`, `public/scenes/bitter_path.js` (NEW)
- New scene matching `event.js` structure, horror styling (crimson accent)
- `engine.resolveBitterPath(choice_index)` method, state transition to BITTER_PATH
- Scene map + stateChange bridge updated
- Smoke-travel passes through the new scene

### C4 — Hints: challenge pitch + ambient text + situational prompt
Files: `public/scenes/tone.js`, `worker/src/historical-context.json`, `worker/src/prompt-templates.ts`, `worker/src/prompt-assembly.ts`
- Tone screen High card gets the challenge-pitch line
- `historical-context.json` landmarks gain `dialogue.high` / `flavor.high` arrays
- `prompt-assembly.ts` appends situational Donner prompt when triggers approach
- Visual-qa runs on tone scene to verify the new line

---

## § 5. Testing strategy

### Unit (vitest)
- 8 new tests across `state.test.ts` and `simulation.test.ts`
- Covers trigger detection, option consequences, HMAC legacy
- Total: 126 → 134 tests

### Playthrough harness extension
- `scripts/playthrough.mjs` gets a `--takeBitterPath` flag (default false)
- When true: on `bitter_path` trigger, picks choice index 2
- Run calibration with `--takeBitterPath`: expect arrival rate > 0% on horror tier
- Run without: expect arrival rate = 0% (unchanged)
- This is the mechanical proof the mechanic works

### Manual acceptance
- Play High tone end-to-end, die, observe challenge pitch + ambient hints
- Play High tone, starve a party member, observe situational hint
- Play High tone, take The Bitter Path, confirm food resets + sanity drops + flag sticks
- Reach Oregon on horror tier. Screenshot the newspaper. That's the success artifact.

---

## § 6. Pre-mortem

1. **Player never triggers the event** — conditions are tight (food=0 AND recent death AND 2+ starvation days). A run where food lasts past the first death doesn't trigger. Mitigation: the hint layer drives players toward the state. Real playthroughs at post-B.2 have median 250 miles + starvation-dominated deaths, so the conditions co-occur often.
2. **Challenge pitch too obvious / too cryptic.** One line is risky. Manual user test before shipping.
3. **Cannibalism offends some players.** Covered by existing tone-selection warning. Period voice, no graphic description. Options 1 and 2 exist for players who don't want it.
4. **LLM writes it badly** (breaks period voice, Halloween-cliché). Dedicated system prompt for Long Night event with strict tone constraint. Cached fallback for LLM timeouts.
5. **Bug: flag sets but consequences don't apply on option 1/2** (or reverse). Three separate unit tests, one per choice, verify exact state deltas.
6. **Game becomes too easy after taking the path.** Disease + starvation + sanity-reduced events still hit after. ~1500 miles left to Oregon at typical trigger mile. Monitor via telemetry.

---

## § 7. Out of scope (explicit)

- Multiple cannibalism choices per run — one only, flag-enforced.
- Cross-run memory of the path — no localStorage, no run counter.
- Alternative win paths (Stranger, Ritual) — rejected per design pick.
- Extending to Low/Medium tones — horror only.
- Graphic descriptions — period voice, implication only.

---

## § 8. Rollback

`git tag pre-bitter-path` before C1. Each of C1–C4 independently revertable.

---

## § 9. Review gauntlet

- [ ] `/autoplan` — CEO + Eng + Design dual voices
- [ ] Pre-mortem (complete above)
- [ ] Fix findings, re-review if >3 P1s
- [ ] Ryan final approval → begin C1

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | pending | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | pending | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | pending | — |
| Design Review | `/plan-design-review` | UI/UX + narrative voice | 0 | pending | — |

**VERDICT:** Plan written. Ready for autoplan.
