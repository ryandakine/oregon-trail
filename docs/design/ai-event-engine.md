# AI Event Engine — cost-vs-freshness system (V1)

**Status:** design draft, pending review gauntlet
**Scope:** V1 only. Exploration / node-graph world is V2 and explicitly out of scope here.
**Goal:** deep, fresh, never-repeating AI events under a hard per-session cost ceiling.

---

## 0. V1 scope (locked)

V1 is a **significantly improved version of the existing game**, not a new one:
1. **Graphics** — the new Three.js 3D layer on desktop, the existing (and polished) 2D Kaplay on mobile.
2. **Events** — this document: much deeper live-AI events without the live-AI cost.
3. **Party management** — stronger (separate spec).
4. **Consequences** — better / more legible (separate spec).

Exploration mode (branching node overworld, tappable town hubs) = **V2**. Not built now.

---

## 1. The problem, in this codebase's terms

- Live Claude Haiku per event = real money + ~8s latency. Can't run it on every event.
- `scripts/generate-cache.js` batch-generates events into `scripts/fallback-events.json` (1.25 MB). **CORRECTED after review (the committed file was parsed):** it holds **`low=200, medium=184, high=0` = 384 events, ~257 unique titles** — NOT 600/200-per-tier. **The HIGH (horror) tier — the marketing hook — has ZERO pre-generated events** (the generator silently dropped high-tier parse/forbidden failures). **Verified: nothing in `worker/src` loads this file at all.** The live game falls back to the 5–13 hardcoded `FALLBACK_EVENTS` per tier in `anthropic.ts`. So the first required work is **re-running the generator to actually produce high-tier (slotted) content** — everything else is downstream of that.
- So today the system is binary and bad: **live AI, or 5 stale events.** There is no cheap-fresh middle.

The engine below is that middle layer + a governor. It treats live AI as a scarce premium spent deliberately, and makes a cheap pool do the bulk of the work while still feeling fresh.

---

## 2. Architecture: three content tiers + one governor

```
                 ┌──────────────── governor (pure fn, server-side) ────────────────┐
 event trigger → │  AI down/blocked? → Tier1 (or Tier0)                             │
 (advance/       │  spotlight moment & budget left? → Tier2 (live), spend 1 budget  │ → EventResponse
  landmark/...)  │  else → Tier1 (parameterized pool, unseen variant)               │   (validated+clamped+signed)
                 └──────────────────────────────────────────────────────────────────┘
```

**Tier 0 — Hardcoded floor (exists).** The 5/tier in `anthropic.ts`. Last resort only (pool + AI both unavailable). Keep as-is.

**Tier 1 — Parameterized pool (the workhorse — NEW runtime use of the 600-event pool).**
The 600 pre-generated events become the primary cheap content source, but **parameterized** so 600 base prose pieces produce effectively thousands of distinct experiences:
- Each pool event is tagged with an **archetype** (`bandits`, `disease`, `river_hazard`, `weather`, `scavenge`, `stranger`, `animal`, `moral_choice`, `breakdown`, …) and **conditions** (segment/terrain, miles range, resource state, tone tier).
- Literal names/numbers in the prose are replaced with **slots** at generation time. At runtime the slots are filled: names from the live party or `historical-context.json` (nations/forts/figures); consequence magnitudes sampled within per-archetype ranges then **clamped by the existing `clampConsequences`** (anti-cheat preserved).
- Runtime path: pick archetype by weighted conditions → pick an **unseen** prose variant → fill slots → assemble `EventResponse` → validate (`parseEventResponse`) → clamp → sign. **Zero LLM calls, instant.**

**Tier 2 — Live spotlight AI (budgeted premium).**
Reserved for the moments that justify the cost + latency:
- the **first event** of a run (sets the tone), **landmark beats**, the **horror-tier Bitter Path** trigger, **milestone events** (a member crosses a health threshold, the halfway mile-marker), and a couple of **wildcard** slots.
- Bounded by a **per-session live budget** `SESSION_LIVE_BUDGET` (e.g. 5), tracked as `live_calls_used` in the **HMAC-signed `GameState`** so a localStorage reset can't farm free live generation.
- Live output is validated + clamped by the same path — identical `EventResponse` schema, identical anti-cheat.

---

## 3. The governor — explicit cached-vs-live rules

`decideSource(state, ctx)` is a pure server-side function. No vibes; every branch is a code predicate.

| Condition (checked in order) | Source | Notes |
|---|---|---|
| Paid-guard blocked OR Anthropic budget hit | **Tier 1** (Tier 0 if pool exhausted) | Never block gameplay on a degraded AI path. |
| `isSpotlight(ctx)` AND `live_calls_used < SESSION_LIVE_BUDGET` | **Tier 2 (live)** | Spend 1 budget; increment `live_calls_used` in signed state. |
| Otherwise | **Tier 1** (parameterized pool, unseen variant) | The default for ~90% of events. |
| Tier 1 archetype pool fully seen this run | **Tier 1 re-parameterized** | Re-fill an old variant with fresh slots (new member/numbers/outcome) rather than repeat verbatim. |

`isSpotlight(ctx)` = `firstEventOfRun || atLandmark || bitterPathGate || memberHealthThresholdCrossed || milestoneMile`. Deterministic, testable.

---

## 4. Freshness is multiplicative, not "600 events"

A single archetype variant fans out across independent dimensions:

```
distinct_experience = prose_variant × party_member_involved × consequence_outcome × segment_context × number_magnitudes
```

A run shows ~10–15 events. With ~20 variants/archetype × the slot dimensions, the chance of a player seeing the same *experience* twice in a run is low even before de-dup — and de-dup makes verbatim repeats impossible.

**Randomization knobs (the constraint #3 ask):**
- **Names** — party members for personal events; historical names for world events.
- **Numbers** — consequence magnitudes sampled in per-archetype ranges, scaled by difficulty + segment hazard, then clamped.
- **Tone** — the 3 tiers pick the pool; intra-tier variants add spread; **High keeps the horror differentiator**.
- **Consequences** — outcome variance per choice via a seeded roll, so the same setup yields different stories.
- **Context** — inject segment/terrain/weather/recent-journal so events feel situated (river events near rivers, disease when a member is sick).

---

## 5. Never-repeat (de-duplication)

- `seen_event_ids` (compact id list / rolling hash, **not** full text) lives in the **signed `GameState`**.
- Tier 1 selection excludes seen ids; on archetype exhaustion, re-parameterize rather than repeat.
- In signed state so a client reset can't un-see events to re-roll content — keeps the no-repeat promise honest and anti-cheat-clean.
- Bounded: a run sees ~15 events, so the set stays small; store ids/hashes, never prose.

---

## 6. Cost model + ceiling enforcement

| Layer | Bounds | Cost |
|---|---|---|
| **Per-session live budget** (signed state) | live calls per run (~5) | the per-player UX/$ governor |
| **Existing paid-guard** (per-IP/day cap, CF rate limit) | per-IP, per-colo bursts | unchanged |
| **Anthropic account budget** | the real global $ ceiling | unchanged |
| **Offline pre-generation** (`generate-cache.js` on a schedule) | refresh/grow the pool | one-time, amortized — the only place AI $ is spent at scale |

Net: **~90%+ of runtime events cost $0** (Tier 1); live AI is spent only on the 4–6 moments that justify it. The expensive AI spend moves *off the hot path* into a scheduled batch job.

---

## 7. Where it lives (files)

- **NEW** `worker/src/event-engine.ts` — governor + selector + slot-filler.
- **NEW** `worker/src/event-archetypes.ts` — archetype registry: tags, conditions, slot schemas, consequence ranges, weights.
- **TRANSFORM** `scripts/fallback-events.json` → a **tagged + slotted** pool. Storage decision (by measured size after slotting): bundle into the worker if small enough, else a **Cloudflare KV** namespace read by archetype key (avoids shipping 1.25 MB in the worker).
- **EXTEND** `scripts/generate-cache.js` — emit **slotted** output directly (prompt the generator to produce `{member}`/`{number}` slots, not regex-replace after), tag by archetype, run on a schedule (GitHub Action) to refresh.
- **EXTEND** `worker/src/types.ts` + `state.ts` — add `live_calls_used: number` and `seen_event_ids` to `GameState` (HMAC-signed).
- **UNCHANGED** — `parseEventResponse`, `clampConsequences`, `paid-guard`, the HMAC chain, the 3 tone tiers, the Bitter Path mechanic. Both pool and live paths emit a validated, clamped `EventResponse`.

---

## 8. Trade-offs / risks (be honest)

- **Pool staleness** — 600 base events refreshed rarely → power users notice. Mitigation: multiplicative slot freshness + periodic regeneration + grow the pool. **Track repeat-rate as a metric.**
- **Slotting quality** — auto-slotting AI prose ("twenty Pawnee riders" → slot the number) is error-prone via regex. Generate slotted output *at generation time* (instruct the model), don't post-process. Real work; the riskiest part.
- **KV read latency/cost** — if the pool lives in KV, each event = a KV read (fast/cheap, not free). Decide bundle-vs-KV by measured slotted size.
- **"Live feels better" gap** — players may sense pooled vs live. Spend the live budget where it's most visible (openers, landmarks, climaxes) so live events anchor perceived quality.
- **Anti-cheat surface** — `live_calls_used` + `seen_event_ids` go through `deepCanonicalize`/HMAC. Adding `GameState` fields without updating both client and worker breaks verification *silently* (documented invariant). Lockstep change.
- **Content QA** — pre-generated prose ships without per-line human review; the generation-time forbidden-word guard + schema validation must run over the whole pool, not just live output.

---

## 9. Next

1. ~~Review gauntlet~~ — DONE (Grok + 3 opus reviewers reading the code). See §10.
2. Owner sign-off on the **revised simpler design** (§10) before any spec.
3. Then a `docs/spec/ai-event-engine.md` implementation contract.

---

## 10. Review trail (Grok + opus gauntlet, 2026-06-13)

Reviewers read the actual worker. Findings that **corrected this doc** and the **recommended descope**:

**Factual errors in v1 of this doc (now fixed):**
- "600 events" → real file is **384 (high tier EMPTY)**, ~257 unique. The multiplicative-freshness math (§4) assumed slotted, independent dimensions over 600 — none of which exists. Honest claim is ~250 unique + cross-run no-verbatim-repeat, **measured, not asserted**.
- `event-archetypes.ts` and slots **do not exist**; the corpus is finished free-form prose with literal names (James/Mary/…) and literal numbers. "Parameterize the existing pool" is not a transform — it requires **regenerating slotted**, which couples to the high-tier regen anyway.

**The anti-cheat reframe (Grok #1 confirmed structural):** `/api/start` takes no input and is not IP/session-linked — it mints a fresh `live_calls_used=0` state on demand. So a per-session budget in client-held signed state stops **tampering** (HMAC) but **not farming** (call `/api/start` N times → 5×N live calls). The real backstop is **`paid-guard.ts` (15/min/IP + 60/IP/day) + the Anthropic account budget** — not the signed counter. `replay` (snapshot an early full-budget state, replay it) is unsolvable without server identity (no-DB invariant). So `live_calls_used` is **in-run pacing only**, and `seen_event_ids` does **not** "keep the no-repeat promise honest" — replay breaks it.

**Grok findings that were OVERSTATED for this codebase:** the "forgeable client ctx" ones (#2/#9). `/api/advance` receives only signed state; trigger type + segment/terrain/miles/deaths/landmark are computed server-side in `advanceDays()`; `meta.event_count` is server-incremented + signed. So `isSpotlight` over signed state is **unforgeable** — the design's `decideSource(state, ctx)` invented a forgeable input the architecture never needed. **Fix: `decideSource(state, triggerResult)`** where `triggerResult` is the server `advanceDays` output.

**Real implementation landmines (all verified):**
- **HMAC migration:** adding fields needs the post-verify default-injection shim that `verifyIncomingState` already uses for `bitter_path_taken`/`pending_event_trigger`, + a `hmac.test.ts` case proving a legacy state still verifies. (Lockstep is worker sign⟷verify+defaults, not a frontend change.)
- **Failed-call accounting:** increment any live counter ONLY in the success branch after `parseEventResponse` (mirroring `eventSource='llm'`), never in catch/guard-blocked — else a timeout burns the premium for a fallback.
- **Clamp single-source-of-truth:** `CONSEQUENCE_BOUNDS` (state.ts) already clamps per field (health[-40,25], food[-150,150], days[0,5], miles[0,50]). Archetype sample ranges must be **subsets**, asserted by test; sample → clamp → THEN fill prose, or "lost 200 lbs" diverges from a –150 apply.
- **Slot-coverage validator:** after fill, assert zero residual `/\{[A-Z_]+\}/` and reject→fallback (same posture as `isLongNightForbidden`).
- **Bitter Path stays OUTSIDE any live budget** — it's one-shot, already bounded by its own trigger + paid-guard, and is the horror payoff; never starve it to a fallback.

**RECOMMENDED DESCOPE (consensus): drop the multi-tier governor for V1.** It's a lot of HMAC-break risk to "enforce" a budget that `/api/start` farming defeats anyway. V1 =
1. **Regenerate the pool WITH high tier + slots** (unavoidable either way; the riskiest part).
2. **Tier 1 parameterized pool as the default** for all events.
3. **ONE live rule: `event_count === 0` → live, else pool.** Server-signed, unforgeable, **no new counter field, no HMAC migration.** Live the opener (the most-screenshotted moment) and you close ~80% of the perceived-quality gap.
4. **Leave the Bitter Path's existing live path untouched.**
5. `seen_event_ids` becomes **optional** (with ~250 unique × ~15-event runs, verbatim repeat is already unlikely; add it only if telemetry shows repeats).

This drops `live_calls_used` entirely → no farming-budget theater, no migration of two fields, far less surface. Defer the multi-budget governor to V2 pending real repeat-rate telemetry. **Pending owner sign-off.**
