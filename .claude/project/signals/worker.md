# worker

## What it does

Cloudflare Worker (TypeScript) that owns all game simulation, state management, LLM event generation, and anti-cheat signing. The client holds a signed state blob; the server verifies and mutates it on every API call. No database — state is stateless signed JSON.

## CLI code

- [`worker/src/index.ts`](../../../worker/src/index.ts) — route switch for all 12 API endpoints; inline handlers for newspaper, epitaph, river, landmark, hunt; also defines `Env` interface and the in-memory coarse rate limiter (200 req/min/IP)
- [`worker/src/simulation.ts`](../../../worker/src/simulation.ts) — `advanceDays()`: the core game loop (days, food, disease, starvation, death, trigger detection). Server-side only; never replicated client-side.
- [`worker/src/state.ts`](../../../worker/src/state.ts) — `createInitialState`, `applyEventAndSign`, `applyStoreAndSign`, store prices, weekly challenges, `STORE_PRICES`
- [`worker/src/anthropic.ts`](../../../worker/src/anthropic.ts) — `callAnthropic()` targeting `claude-haiku-4-5-20251001`; retry logic (8s→4s→2s, 429/529 only, fresh `AbortController` per attempt); `parseEventResponse()` with consequence validation + clamping; `FALLBACK_EVENTS` (5 per tier); bitter path generation
- [`worker/src/hmac.ts`](../../../worker/src/hmac.ts) — `signState()`, `verifyState()`, `deepCanonicalize()` (sorts all object keys before hashing so field order is irrelevant)
- [`worker/src/paid-guard.ts`](../../../worker/src/paid-guard.ts) — two-layer per-IP load shedding for Anthropic-spending routes: (B) CF native rate-limiting binding `PAID_LIMITER` (15/min/IP, per-colo) + (C) in-memory daily volume cap `PAID_PER_IP_DAY_CAP` (default 60/IP/day); degrading to fallback, never 429
- [`worker/src/prompt-assembly.ts`](../../../worker/src/prompt-assembly.ts) — assembles LLM user prompt from blocks: location (300 tok), party (200 tok), recent events (300 tok), conditional (200 tok); total ~1,500 tokens input
- [`worker/src/prompt-templates.ts`](../../../worker/src/prompt-templates.ts) — `SYSTEM_PROMPTS` keyed by tone tier; `JSON_FORMAT_BLOCK` appended to every system prompt
- [`worker/src/context-loader.ts`](../../../worker/src/context-loader.ts) — lookup functions over `historical-context.json`: `getSegmentForMile`, `getNextLandmark`, `getNextRiverCrossing`, `getWeather`, `getTotalTrailDistance`, `getLandmarkById`
- [`worker/src/types.ts`](../../../worker/src/types.ts) — single source of truth for all shared types (403 lines): `GameState`, `SignedGameState`, `ToneTier`, `Pace`, `Rations`, `Profession`, `TriggerType`, `EventResponse`, `DaySummary`, `RiverCrossing`, `TrailSegment`, `Landmark`, etc.
- [`worker/src/historical-context.json`](../../../worker/src/historical-context.json) — ~164 KB; 16 trail segments, 18 landmarks, 7 disease types, 11 Indigenous nations; read-only reference data used by context-loader and prompt-assembly

## Docs

- [`PLAN.md`](../../../PLAN.md) — original 59-decision architecture audit trail
- [`BITTER_PATH_PLAN.md`](../../../BITTER_PATH_PLAN.md) — design decisions for the Long Night horror mechanic
- [`BITTER_PATH_C3_PLAN.md`](../../../BITTER_PATH_C3_PLAN.md) — phase C3 calibration plan
- [`RATE_LIMIT_SPEND_CAP_PLAN.md`](../../../RATE_LIMIT_SPEND_CAP_PLAN.md) — paid-guard design and implementation record
- [`DIFFICULTY_SYSTEM_PLAN.md`](../../../DIFFICULTY_SYSTEM_PLAN.md), [`DIFFICULTY_REBALANCE_PLAN.md`](../../../DIFFICULTY_REBALANCE_PLAN.md), [`DIFFICULTY_STATUS.md`](../../../DIFFICULTY_STATUS.md) — simulation difficulty calibration history

## Coupling

- Changes to [`worker/src/types.ts`](../../../worker/src/types.ts) (`GameState` shape) break the HMAC signing chain — `deepCanonicalize` sorts all fields; adding/removing fields without updating both worker and frontend breaks signature verification silently.
- Changes to `EventResponse` schema require updating both `JSON_FORMAT_BLOCK` in `prompt-templates.ts` AND `parseEventResponse()` in `anthropic.ts`, plus the 5 `FALLBACK_EVENTS` entries — coupling to frontend domain at the engine API boundary.
- Changes to `STORE_PRICES` in `state.ts` are source of truth; `engine.js` (frontend) holds a hardcoded fallback that it lazy-replaces via `GET /api/prices`. Divergence between the two is silent.
- The Bitter Path mechanic gating logic lives in `simulation.ts`; the kill switch `BITTER_PATH_ENABLED` is a worker env var. Frontend `bitter_path.js` scene assumes trigger kind `"bitter_path"` is only ever emitted by the worker.
- [`wrangler.toml`](../../../wrangler.toml) declares `PAID_LIMITER` rate-limit binding with `namespace_id = "1001"` — must match the CF dashboard binding or deploys fail silently at runtime.

## Conventions worth knowing

- All state mutations use `structuredClone()` — the verified state is never mutated in-place.
- Errors returned as `{ error: "error_code" }` JSON with appropriate HTTP status — no exception strings exposed.
- `pending_event_hash` + `pending_event_trigger` in `GameState.simulation` are the anti-fabrication pair: `/api/choice`, `/api/bitter_path`, and `/api/bitter_path_skip` all verify both before processing.
- Consequence values are game units: food in pounds, ammo in rounds, money in cents — not percentages.
- `DISEASE_PROBABILITY_MULTIPLIER = 0.7` and `STARVATION_GRACE_DAYS = 4` are Phase B calibration constants tuned 2026-04-17; `RATIONS_PER_PERSON` filling = 1.5 lbs/person (Phase C v3 drop from 2).
- A cron trigger fires every 6 hours (`0 */6 * * *`) to run an AI-liveness canary; pages `@osi_dispatch_bot` via Telegram if LLM path is dead.
- `CORS` defaults to `*` — `ALLOWED_ORIGIN` env var is not set in [`wrangler.toml`](../../../wrangler.toml); origin restriction requires explicit wrangler secret.
