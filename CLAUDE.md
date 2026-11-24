# Oregon Trail AI Edition — CLAUDE.md

**Project:** Oregon Trail AI Edition (trail.osi-cyber.com)
**Owner:** Ryan / On-Site Intelligence — free browser-playable marketing asset, portfolio-grade AI demo.

<atomic-signals>

## Project signals (auto-loaded)

@.claude/project/signals.md

</atomic-signals>

## Orientation — read before touching code

1. Read this file, then the plan file matching the task: `PLAN.md` (original architecture, 59-decision audit trail), `THREEJS_REBUILD_PLAN.md` (3D layer), `DIFFICULTY_SYSTEM_PLAN.md`, `RATE_LIMIT_SPEND_CAP_PLAN.md`, `BITTER_PATH_PLAN.md`/`BITTER_PATH_C3_PLAN.md` — `ls *.md` for the current set, it grows.
2. `git status && git log --oneline -5`.
3. `npx vitest run` — confirm green before and after (418 passed / 1 skipped across 26 files: 16 worker suites, 10 frontend suites mixing vitest and Playwright scene smokes).
4. State your understanding of the task before editing anything. Ask when uncertain — every time, not just when stuck. Prefer the smallest change that works; open a separate task before refactoring anything not asked for.

**The things that matter most:**

1. **Server-side simulation, client is mostly display.** All game logic runs in the Cloudflare Worker (`worker/src/simulation.ts:advanceDays()`). The frontend renders state and sends choices back. Never move simulation logic to the client. (Client computes weekly-challenge seeds, daily share state, and local fallback newspaper — display/sharing, not simulation.)
2. **HMAC-signed game state is the anti-cheat.** Every `GameState` blob is signed via HMAC-SHA256 (`worker/src/hmac.ts`). Client can't modify state, only send choices.
3. **Three tone tiers are the product differentiator.** Low (classroom-safe), Medium (morally gray, default), High (psychological horror — the marketing hook). Never remove or water it down.
4. **No database.** Client holds the signed state blob; journal in localStorage; only in-memory rate-limit counters server-side. Design choice for near-zero ops cost and horizontal scale, not a shortcut.
5. **Two render paths share one GameState.** Kaplay (2D, CDN) always renders; a Three.js 3D world layer (`public/three/`, 14 modules, vendored under `public/vendor/three`) can render behind a transparent Kaplay canvas. `public/render-mode.mjs:shouldInit3D()` decides which, in strict precedence order: `?test` always forces 2D-only first (never break the scene-smoke harness) → explicit `mode==="2d"` forces off → explicit `mode==="3d"` forces on → default/"auto" is `hasGfx || isDesktop`, where `hasGfx` is the manual `?gfx` URL escape hatch and `isDesktop` is a **pointer-type media query** (`pointer:fine` and not `pointer:coarse`) — there is no WebGL capability check anywhere in this decision. A state→3D adapter drives 3D from the same signed GameState the 2D scenes use — no second source of truth. See `THREEJS_REBUILD_PLAN.md`.
6. **GameState carries a delayed-effects queue.** `state.simulation.pending_effects: PendingEffect[]` (`worker/src/types.ts`, capped at `MAX_PENDING_EFFECTS` in `state.ts`) lets the LLM emit consequences that resolve on a later day. Same rule as everything else in GameState: add/remove a field on one side without updating the other and `deepCanonicalize()` breaks HMAC verification silently.

**Forbidden — Claude Code must not:**
- Push directly to `master`. PR to `kaplay-rebuild` (active branch; Pages `production_branch` is still `master`).
- Commit `.dev.vars`, API keys, HMAC secrets, Cloudflare account IDs, or Telegram bot tokens.
- Move simulation logic (`advanceDays`, disease, starvation, death) to the client.
- Break the HMAC signing chain (skip `verifyIncomingState`/`signState`) or the event-hash/trigger-kind double-check on `/api/choice`, `/api/bitter_path`, `/api/bitter_path_skip`.
- Allow `/api/advance` while `pending_event_hash` is set, or `/api/store` after `miles_traveled > 0`.
- Remove or soften the High tone tier, or advertise the Bitter Path mechanic in public-facing copy.
- Add npm runtime dependencies to `public/` (zero-dependency by design — Kaplay + vendored three.js only) or a build step for it (no webpack/vite).
- Add a database or server-side session storage.

---

## 1. Stack

Base stack — Cloudflare Worker + Pages, Kaplay 2D vanilla-JS frontend, `claude-haiku-4-5-20251001`, domain trail.osi-cyber.com, devDeps — is in the auto-loaded `signals.md`; only what signals lacks is below.

| Layer | Tech | Notes |
|---|---|---|
| Frontend (3D, optional) | Three.js 0.165, vendored | `public/three/`, `public/vendor/three/`, toggled by `render-mode.mjs` |
| State | HMAC-SHA256 signed JSON blob | Client holds state, server verifies + mutates — the anti-cheat (see §3.2) |
| Storage | None (localStorage for journal/resume) | No database *by design* — near-zero ops, horizontal scale |
| Share/OG | `/r/*`, `/og/*` routed to the worker ahead of Pages | `SHARE_BASE_URL` in `wrangler.toml`; falls back to unbranded workers.dev origin if routes can't bind |
| Canary | Hourly cron (`scheduled()` in `index.ts`) pings `callAnthropic()`, alerts `@osi_dispatch_bot` via Telegram on failure | Built after a dead-key AI-outage went unnoticed for weeks — see memory `project_oregon_trail_ai_dark_incident` |
| Analytics | Plausible, self-hosted at analytics.osi-cyber.com | Script tag in `index.html` |

**Do not introduce:** a database, a build system for `public/`, React/Vue/Svelte, a second LLM provider, server-side session storage.

---

## 2. Key files

- API routes: `worker/src/index.ts` (route switch + handlers). New endpoint = new `case` here.
- Types: `worker/src/types.ts` (501 lines) — single source of truth for `GameState`.
- Game logic: `worker/src/state.ts` (mutation helpers, `pending_effects` queue, store prices), `worker/src/simulation.ts` (`advanceDays()`, server-side only).
- AI: `worker/src/anthropic.ts` (`callAnthropic()`, `parseEventResponse()`, `FALLBACK_EVENTS`), `prompt-assembly.ts`/`prompt-templates.ts` (prompt builder + per-tier system prompts, incl. `buildBitterPathSituationalHint()`), `context-loader.ts` (lookups into `historical-context.json`).
- Anti-cheat: `worker/src/hmac.ts` (`signState()`, `verifyState()`, `deepCanonicalize()`).
- Money/rate-limits: `worker/src/paid-guard.ts`. Scoring: `worker/src/scoring.ts`. Share links: `worker/src/share-stub.ts`.
- `worker/tests/` — 16 vitest suites (one per module above, plus `handleCamp`, `handlers`, `paid-guard-integration`, `palette`, `delayed-effects`).
- Frontend entry: `public/index.html` (shell + import map), `public/engine.js` (`GameEngine` — hardcodes prod worker URL, override to `http://localhost:8787` for local dev), `public/main.js` (Kaplay init, scene registration, CDN fallback, 3D init gate).
- 2D primitives: `public/lib/draw.mjs` (canonical renderer since the 2026-06-11 graphics pass — don't port from `mockups/primitive-mockup.html`, which lags), plus `hud.mjs`, `tone.mjs`, `palette.mjs`.
- 3D layer: `public/three/` (14 modules: terrain/sky/water/fauna/grass/camp/landmarks/textures/markers/vfx/audio/models/bootstrap/fps-gate), `public/vendor/three/` (vendored, no npm install), `public/render-mode.mjs` (2D/3D toggle, see Orientation §5).
- Scenes: `public/scenes/` — 17 files, one per scene, each exports `register(k, engine)`.
- `test/frontend/` — 10 suites (vitest + Playwright): scene smokes, three-adapter, render-mode, fps-gate, share/camp flows.
- Deploy: `scripts/deploy-pages.sh`, `scripts/deploy-smoke.mjs`. `wrangler.toml` — `main = worker/src/index.ts`, ratelimits, cron canary, share routes.

**Rules of the road:**
- New game logic → `simulation.ts`/`state.ts`, never the frontend. New types → `types.ts`.
- New primitive draw helpers → `draw.mjs`; keep exported signatures backward-compatible (trailing opts objects only) — 5+ scenes call these. Verify with `node scripts/visual-qa.mjs`.
- New 3D world elements → `public/three/`, wired through the state→3D adapter, not scene files directly.
- Frontend API calls go through `engine.api()`, never raw `fetch` in scene files.
- Historical data changes → `worker/src/historical-context.json`.

---

## 3. Architecture Invariants (break these and things quietly corrupt)

**3.1 Server-side simulation only.** Client POSTs `/api/advance`, server simulates 1-5 days, returns summaries/trigger/new signed state. Client renders what it gets. Never replicate this logic client-side.

**3.2 HMAC signing chain.** Every mutating call: client sends `{signed_state}` → server `verifyIncomingState()` (rejects on bad signature) → mutates a `structuredClone()` → `signState()` → returns new `{signed_state}`. `deepCanonicalize()` sorts keys before hashing, so field order doesn't matter — but adding/removing a GameState field on one side without the other breaks verification silently (this now includes `pending_effects`, see Orientation §6).

**3.3 Event hash + trigger-kind binding.** On `/api/advance` triggering an event: server generates it, SHA-256 hashes it, stores the hash in `pending_event_hash` and the trigger kind (`event`/`bitter_path`) in `pending_event_trigger`. On resolve (`/api/choice`, `/api/bitter_path`, `/api/bitter_path_skip`): server re-hashes the submitted event and rejects `event_hash_mismatch` on mismatch, verifies `pending_event_trigger` matches the endpoint and rejects `wrong_trigger_kind` otherwise, then clears both fields. Prevents clients fabricating favorable events or routing a normal event through `/api/bitter_path`. New consumer handlers must enforce both checks.

**3.4 Advance blocked while event pending.** `/api/advance` returns `resolve_pending_event` if `pending_event_hash !== null`; client must call `/api/choice` first.

**3.5 Store only before departure.** `/api/store` rejects once `position.miles_traveled > 0`.

**3.6 River crossings — intent, not fully enforced.** `simulation.ts` blocks advancement on an unresolved crossing and returns trigger `river`. **Known gap:** `/api/river` accepts any crossing method without verifying the party is actually at a river mile marker. Tech debt, not a feature.

**3.7 LLM consequence clamping.** `parseEventResponse()` clamps all consequence values to ±10000; `clampConsequences()` forces `days >= 0`, `miles >= 0`. Never trust raw LLM output for numeric state changes.

**3.8 Bitter Path (hidden, horror-tier only).** Fires only when ALL hold: `tone_tier === "high"`, a death within 3 game-days, and (starvation_days ≥ 5 OR (food=0 AND starvation_days ≥ 2 AND avg alive-member health < 40)). One-shot per run via `bitter_path_taken` (`none|dignified|hopeful|taken|refused`). Discoverability is in-game hints only, never advertised: the horror-tier tone pitch, `tone_flavor.high` blocks at Fort Bridger/Chimney Rock in `historical-context.json`, and `buildBitterPathSituationalHint()` in `prompt-assembly.ts` (fires when a horror-tier run nears the gate — Donner-adjacent narration, never names the act). Any of these three touch points can leak or break discoverability; edit carefully. **Kill switch:** `BITTER_PATH_ENABLED` worker env var (`wrangler secret put`, default true); pending resolutions still process so mid-flight players don't strand. **Telemetry:** `bitter_path_triggered`, `bitter_path_cw_shown`, `bitter_path_cw_continue`, `bitter_path_cw_skip`, `bitter_path_choice_{dignified|hopeful|taken}`, `bitter_path_outcome_{arrival|wipe}` via Plausible; silent when analytics blocked.

---

## 4. Live Technical Debt

1. **Rate limiter — two tiers.** The coarse all-route limiter is per-isolate flood-damping (counts within one Worker isolate's memory — not a global cap, resets on isolate recycle). Paid (Anthropic) routes additionally go through `worker/src/paid-guard.ts`: Cloudflare's `PAID_LIMITER` Rate Limiting binding (15/min/IP, per-colo) + an in-memory per-IP daily sub-cap (`PAID_PER_IP_DAY_CAP`, default 60). On block, serves the existing fallback (never 429 mid-advance). The real global $ ceiling is the Anthropic account spend budget in-console — the worker guard is the per-IP complement, not the global cap.
2. **No TypeScript in frontend, by design.** Would require a build system, which is forbidden. All type safety lives in the worker.

When adding features, check whether the change makes either of these worse — they're accepted tradeoffs, not bugs.

---

## 5. API Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/start` | Create new game | None |
| POST | `/api/store` | Buy supplies at Independence | HMAC |
| POST | `/api/advance` | Simulate 1-5 days of travel | HMAC |
| POST | `/api/choice` | Resolve an LLM event choice | HMAC + event hash |
| POST | `/api/camp` | Make Camp (disabled while an event is pending) | HMAC |
| POST | `/api/newspaper` | Generate end-of-game newspaper | HMAC |
| POST | `/api/epitaph` | Generate gravestone inscription | HMAC |
| POST | `/api/river` | Resolve river crossing | HMAC |
| POST | `/api/landmark` | Rest or trade at landmark | HMAC |
| POST | `/api/hunt` | Hunting mini-game | HMAC |
| POST | `/api/bitter_path` | Resolve the Long Night (0=dignified, 1=hopeful, 2=taken) | HMAC + event hash + trigger kind |
| POST | `/api/bitter_path_skip` | Opt out via content-warning gate; sets `refused`, zero mechanical effect | HMAC + event hash + trigger kind |
| GET | `/api/prices` | Store prices (server source of truth; client falls back to hardcoded on failure) | None |
| GET | `/api/challenge` | Current weekly challenge | None |

"HMAC" = request must include `signed_state`, verified before processing. `/r/*` and `/og/*` are separate worker-routed (not `/api`) share/OG-image paths — see §1 Share/OG.

---

## 6. Scene System

Kaplay scenes map 1:1 to `GameEngine` states, bridged in `main.js`: `engine.on("stateChange") → k.go(sceneName, data)`.

```
TITLE → PROFESSION → NAMES → TONE → STORE → TRAVEL ⟳
                                                ↓
                            EVENT / LANDMARK / RIVER / HUNTING / DEATH
                                                ↓
                                         BITTER_PATH (horror-tier only, hidden)
                                                ↓
                                    ARRIVAL or WIPE → NEWSPAPER → SHARE
```

Each scene file exports `register(k, engine)` → `k.scene(name, callback)`. Inside: build Kaplay objects, subscribe via `engine.on()`, clean up in `k.onSceneLeave()`, call `engine.advance()`/`engine.makeChoice()`/etc. on input. `#html-overlay` div handles text-heavy UI (event descriptions, name input, trade lists).

---

## 7. Prompt Engineering

System prompts per tier in `prompt-templates.ts`; user prompt assembled in `prompt-assembly.ts` from budgeted blocks: location (300 tok), party (200 tok), recent events — last 5 journal entries (300 tok), conditional — active diseases/nations (200 tok). Total input target ~1,500 tokens. Output caps: 800 (events), 600 (newspaper), 60 (epitaph).

**Critical rules:** the `JSON_FORMAT_BLOCK` output-format instruction is appended to every system prompt — don't remove it. `parseEventResponse()` validates strictly; change the schema, update both the format block and the parser together. `FALLBACK_EVENTS` (5/tier) must match the `EventResponse` type exactly — they fire when LLM calls fail. Consequence units: food in pounds, ammo in rounds, money in cents.

---

## 8. Code Style

**Worker (TS):** strict mode; explicit types everywhere (some `as any` remains as tech debt); mutate via `structuredClone()`, never in-place on verified state; errors as `{error: "error_code"}` JSON with matching HTTP status; historical-context access preferably via `context-loader.ts` (raw JSON traversal also exists in `prompt-assembly.ts`/`index.ts`).

**Frontend (vanilla JS):** no build step, ES modules via `<script type="module">`; Kaplay self-hosted at `/vendor/kaplay.mjs` (jsDelivr `@3001` fallback if it fails to load — no unpkg; self-hosting is for offline-PWA precache); `GameEngine` is a class on `window.engine`; canvas 640x480, `crisp/stretch/letterbox: true`; colors as RGB arrays; loads a custom TTF (`k.loadFont("plex", "/fonts/ibm-plex-mono-700.ttf")`, set as default `font: "plex"`), falling back to Kaplay's built-in bitmap font only if that load throws; events via `engine.on/off("eventName", handler)`.

---

## 9. Operational

- **Secrets:** `HMAC_SECRET`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` via `wrangler secret put` — never in code, never a committed `.dev.vars` (gitignored).
- **Deploy:** `bun run deploy` — worker tests → `wrangler deploy` → `scripts/deploy-pages.sh` (push to a CF Pages preview branch → `scripts/deploy-smoke.mjs` force-renders river/hunting/bitter_path-CW/landmark against the preview, refuses promotion on any scene throw → promote `--branch=master`, i.e. trail.osi-cyber.com, only on clean smoke). Added 2026-04-18 after two P0 scene-render bugs (`ford_difficulty.toUpperCase()`, styled-text `[N]` labels) shipped via a zero-pre-check `wrangler pages deploy`.
  - Worker only: `bun run deploy:worker`. Pages only: `bun run deploy:pages`. Smoke only (no deploy): `bun run deploy:smoke`.
  - Health check: `curl -sf https://trail.osi-cyber.com` returns 200.
  - No CI, no git-provider auto-deploy — manual, run from repo root.
- **Tests:** `npx vitest run` (or `bun run test`) — must be green (418 passed / 1 skipped) before committing.
- **Local dev:** `npx wrangler dev` (worker on :8787) + `npx serve public`. Override `engine.js`'s hardcoded prod URL to `http://localhost:8787` manually.
- **CORS:** `ALLOWED_ORIGIN` env var is read but unset in `wrangler.toml` → defaults to `*`. Set explicitly if origin restriction is needed.
- **Active branch:** `kaplay-rebuild`. `master` still holds the old ASCII terminal UI and is the Pages `production_branch`.

---

## Project Context
Query `osi-context.get_bundle("oregon-trail")` at session start for project decisions, gotchas, and cross-project rules.

