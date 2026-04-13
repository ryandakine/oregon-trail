# Oregon Trail AI Edition — CLAUDE.md

**Project:** Oregon Trail AI Edition (trail.osi-cyber.com)
**Version:** 0.1.0 (live, deployed 2026-04-12)
**Owner:** Ryan / On-Site Intelligence
**Purpose:** Free browser-playable marketing asset for OSI. Portfolio-grade AI demo.

---

## TL;DR — Read This First

**Before writing any code in this repo:**

1. Read this file in full.
2. Read `PLAN.md` for architecture decisions and the original 59-decision audit trail.
3. Run `git status` and `git log --oneline -5`.
4. Summarize your understanding of the task before editing anything.

**The five things that matter most:**

1. **Server-side simulation, client is mostly display.** All game logic runs in the Cloudflare Worker. The frontend (`public/`) renders state and sends choices back. Never move simulation logic to the client. (The client does compute weekly challenge seeds, daily share state, and local fallback newspaper — these are display/sharing concerns, not simulation.)
2. **HMAC-signed game state is the anti-cheat.** Every `GameState` blob is signed via HMAC-SHA256 (`worker/src/hmac.ts`). The client cannot modify state — only send choices. Breaking this pattern means players can cheat.
3. **Three tone tiers are the product differentiator.** Low (classroom-safe), Medium (morally gray, default), High (psychological horror). The horror tier IS the marketing hook. Never remove or water it down.
4. **No database. Minimal server state (only an in-memory rate limiter).** Client holds the signed state blob. Journal lives in localStorage. This is a design choice, not a shortcut. It means near-zero ops cost and horizontal scale.
5. **Kaplay renders everything.** 640x480 canvas, pixel aesthetic, 16 scenes. No HTML UI except the event overlay (`#html-overlay`), newspaper overlay, and tombstone overlay.

**Hard nos:**
- Don't push to main/master. PR to `kaplay-rebuild` (current active branch).
- Don't commit `.dev.vars` or hardcoded secrets.
- Don't move simulation logic to the client.
- Don't add a database.
- Don't break the HMAC signing chain.
- Don't add dependencies to `public/` — it's static files served by Cloudflare Pages.
- Don't soften the High tone tier.

---

## 1. Stack (do not change without discussion)

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Static HTML + Kaplay 3001 (CDN) + vanilla JS | `public/`, Cloudflare Pages |
| Backend | Cloudflare Worker (TypeScript) | `worker/src/`, Wrangler CLI |
| AI | Anthropic Claude Haiku 4.5 | Via `worker/src/anthropic.ts`, 8s timeout |
| State | HMAC-SHA256 signed JSON blob | Client holds state, server verifies + mutates |
| Storage | None (localStorage for journal/resume) | No database by design |
| Domain | trail.osi-cyber.com | CNAME to oregon-trail.pages.dev |
| Worker URL | oregon-trail-api.trails710.workers.dev | Secrets via `wrangler secret put` |
| Analytics | Plausible | Script tag in index.html |
| PWA | sw.js exists + manifest.json | Broken/incomplete — sw.js exists but no service worker registration in current index.html |

**Do not introduce:** a database, a build system for `public/`, React/Vue/Svelte, a second LLM provider, server-side session storage.

---

## 2. Repo Layout

```
oregon-trail/
├── worker/
│   ├── src/
│   │   ├── index.ts              # API routes + inline handlers for newspaper, epitaph, river, landmark, hunt. Keep routing here.
│   │   ├── types.ts              # Single source of truth for all types (403 lines)
│   │   ├── state.ts              # createInitialState, applyEventAndSign, applyStoreAndSign, store prices, challenges
│   │   ├── simulation.ts         # advanceDays() — THE core game loop (server-side only)
│   │   ├── anthropic.ts          # callAnthropic(), parseEventResponse(), FALLBACK_EVENTS
│   │   ├── prompt-assembly.ts    # Builds LLM prompts from game state + historical context
│   │   ├── prompt-templates.ts   # SYSTEM_PROMPTS for each tone tier
│   │   ├── context-loader.ts     # Lookup functions for historical-context.json
│   │   ├── hmac.ts               # signState(), verifyState(), deepCanonicalize()
│   │   └── historical-context.json  # ~164KB, 3839 lines. 16 segments, 18 landmarks, 7 diseases, 11 nations
│   └── tests/                    # 119 tests across 5 suites (vitest)
│       ├── hmac.test.ts
│       ├── state.test.ts
│       ├── simulation.test.ts
│       ├── prompt-assembly.test.ts
│       └── context-loader.test.ts
├── public/                       # Static files — Cloudflare Pages serves this directory
│   ├── index.html                # Shell: canvas + 3 overlay divs + OG meta tags
│   ├── engine.js                 # GameEngine class: state machine, API client, event emitter
│   ├── main.js                   # Kaplay init (640x480), scene registration, stateChange bridge
│   ├── scenes/                   # 16 Kaplay scenes (one file each)
│   │   ├── title.js              # Title screen, resume option, weekly challenge display
│   │   ├── profession.js         # Farmer/Carpenter/Banker selection
│   │   ├── names.js              # Party naming (uses #html-overlay for text input)
│   │   ├── tone.js               # Low/Medium/High tone selection
│   │   ├── store.js              # General store with guided purchasing
│   │   ├── travel.js             # Main travel scene: parallax, wagon, HUD, weather FX
│   │   ├── event.js              # LLM-generated event with choices (uses #html-overlay)
│   │   ├── landmark.js           # Fort/landmark arrival: rest, trade, continue
│   │   ├── river.js              # River crossing: ford, caulk, ferry
│   │   ├── hunting.js            # Hunting mini-game
│   │   ├── death.js              # Death notification + epitaph generation
│   │   ├── arrival.js            # Oregon City arrival
│   │   ├── wipe.js               # Total party wipe
│   │   ├── newspaper.js          # AI-generated 1848 newspaper (share artifact)
│   │   ├── share.js              # Share screen with watermark
│   │   └── loading.js            # Initial loading scene
│   ├── newspaper.js              # Newspaper DOM renderer (separate from scene)
│   ├── tombstone.js              # Tombstone DOM renderer
│   ├── sw.js                     # Service worker for PWA caching
│   ├── style.css                 # Legacy stylesheet — NOT loaded by current index.html
│   └── fonts/, icons/            # IBM Plex Mono, PWA icons
├── scripts/
│   ├── calibrate.js              # Prompt calibration runner
│   ├── generate-cache.js         # Pre-generate fallback events
│   └── fallback-events.json      # Cached fallback events
├── assets/                       # Source art assets (not served directly)
├── wrangler.toml                 # Worker config: main = worker/src/index.ts
├── package.json                  # Only devDeps: wrangler, vitest, @cloudflare/workers-types, typescript
└── *.md                          # Plans: PLAN.md, KAPLAY_REBUILD_PLAN.md, KAPLAY_FIXES_V3_PLAN.md, etc.
```

**Rules of the road:**
- New API endpoints go in `worker/src/index.ts` as a new `case` in the route switch + a handler function.
- New game logic goes in `worker/src/simulation.ts` or `worker/src/state.ts`, never in the frontend.
- New types go in `worker/src/types.ts` — it's the single source of truth.
- New Kaplay scenes go in `public/scenes/<name>.js`, export a `register(k, engine)` function, and get imported in `main.js`.
- Frontend API calls go through `engine.api()` in `engine.js`, never raw `fetch` in scene files.
- Historical data changes go in `worker/src/historical-context.json`.

---

## 3. Architecture Invariants (break these and things quietly corrupt)

### 3.1 Server-side simulation only
`simulation.ts:advanceDays()` is the game loop. The client calls POST `/api/advance`, the server simulates 1-5 days, and returns: days advanced, summaries, trigger type, trigger data, and a new signed state. The client renders what it gets back. Never replicate this logic client-side.

### 3.2 HMAC signing chain
Every API call that mutates state:
1. Client sends `{ signed_state: { state, signature } }`
2. Server calls `verifyIncomingState()` — rejects if signature is invalid
3. Server mutates a `structuredClone()` of the state
4. Server calls `signState()` on the new state
5. Server returns `{ signed_state: { state, signature } }`

`deepCanonicalize()` in `hmac.ts` sorts all object keys before hashing. This means field order doesn't matter, but adding/removing fields to GameState without updating both sides will break verification silently.

### 3.3 Event hash binding
When `/api/advance` triggers an event, the server:
1. Generates the event via LLM (or fallback)
2. SHA-256 hashes the event object
3. Stores the hash in `state.simulation.pending_event_hash`
4. Signs and returns the state + event

When `/api/choice` resolves the event:
1. Client sends the event object back + choice index
2. Server re-hashes the submitted event
3. Compares with `pending_event_hash` — rejects on mismatch
4. Clears `pending_event_hash`, applies consequences

This prevents clients from fabricating favorable events.

### 3.4 Advance blocked while event pending
If `state.simulation.pending_event_hash !== null`, `/api/advance` returns error `"resolve_pending_event"`. The client must call `/api/choice` first.

### 3.5 Store only before departure
`/api/store` rejects if `state.position.miles_traveled > 0`. Once you leave Independence, you trade at landmarks.

### 3.6 River crossings cannot be skipped (intent — not fully enforced)
`simulation.ts` checks for unresolved crossings at or before the party's current mile marker. If found, it returns trigger `"river"` and blocks further advancement until resolved via `/api/river`. **Known gap:** the `/api/river` handler accepts any crossing method without verifying the party is actually at a river mile marker. This is tech debt, not a feature.

### 3.7 LLM consequence clamping
`parseEventResponse()` in `anthropic.ts` validates and clamps all consequence values to +/-10000. `clampConsequences()` in `state.ts` forces `days >= 0` and `miles >= 0`. Never trust raw LLM output for numeric game state changes.

---

## 4. Current Technical Debt

Biggest risks, in priority order. Know these. Don't make them worse.

1. **Health dots in travel.js compare health to strings.** `m.health === "good"` but health is a number (0-100). The dots always show as red. Fix: threshold-based coloring (>70 green, >40 yellow, >20 orange, else red).
2. **Dead code from ASCII era.** `public/game.js`, `public/ui.js`, `public/style.css` contain ~4,500 lines from the pre-Kaplay terminal UI. These files still exist on disk but are NOT loaded by current `index.html`. They should be deleted.
3. **No retry/backoff on Anthropic calls.** `anthropic.ts` has a single 8s timeout. On 429/529, it falls through to fallback events instead of retrying. Acceptable for now but lossy under load.
4. **Newspaper trusts unsigned journal.** `generateNewspaper()` sends `full_journal` from localStorage. This is cosmetic-only (newspaper text), not game state, so it's accepted but noted.
5. **Rate limiter is in-memory.** Per-isolate, not per-worker. Cloudflare Workers can spawn multiple isolates, so the 200/min limit is approximate. Acceptable for a free game.
6. **No TypeScript in frontend.** `public/` is vanilla JS. All type safety is in the worker. Scene files have no type checking.
7. **Plausible script tag points to plausible.io not self-hosted instance.** Should point to analytics.osi-cyber.com if self-hosted Plausible is intended.

8. **Weekly challenge data duplicated in 3 places.** `state.ts`, `engine.js`, and `title.js` all contain weekly challenge seed/computation logic. Changes must be synced across all three.
9. **Store prices duplicated client/server.** `state.ts` (server) and `engine.js` (client) both define store item prices. These can drift silently.
10. **Resume always jumps to TRAVEL regardless of actual scene.** Known bug — if you quit during an event, landmark, or river crossing, resume drops you into TRAVEL and the pending state may be lost.
11. **Daily share reads nonexistent `position.days_elapsed`.** Known bug — the share feature references a field that doesn't exist on the position object.
12. **`handleNewspaper` and `handleHunt` not phase-gated.** These handlers in `index.ts` don't verify the game is in an appropriate phase before executing. A client could call `/api/hunt` at any time.
13. **PWA registration missing.** `sw.js` exists but no `navigator.serviceWorker.register()` call in current `index.html`. PWA install is broken.

**Rule:** when about to pick up new feature work, check this list first. If any of 1-13 would be made worse, surface it before writing code.

---

## 5. API Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/start` | Create new game | None |
| POST | `/api/store` | Buy supplies at Independence | HMAC |
| POST | `/api/advance` | Simulate 1-5 days of travel | HMAC |
| POST | `/api/choice` | Resolve an LLM event choice | HMAC + event hash |
| POST | `/api/newspaper` | Generate end-of-game newspaper | HMAC |
| POST | `/api/epitaph` | Generate gravestone inscription | HMAC |
| POST | `/api/river` | Resolve river crossing | HMAC |
| POST | `/api/landmark` | Rest or trade at landmark | HMAC |
| POST | `/api/hunt` | Hunting mini-game | HMAC |
| GET | `/api/challenge` | Get current weekly challenge | None |

"HMAC" means the request must include `signed_state` and the server verifies it before processing.

---

## 6. The Scene System

Kaplay scenes map 1:1 to `GameEngine` states. The bridge is in `main.js`:

```
engine.on("stateChange") → k.go(sceneName, data)
```

State machine flow:
```
TITLE → PROFESSION → NAMES → TONE → STORE → TRAVEL ⟳
                                                ↓
                            EVENT / LANDMARK / RIVER / HUNTING / DEATH
                                                ↓
                                    ARRIVAL or WIPE → NEWSPAPER → SHARE
```

Each scene file exports `register(k, engine)` which calls `k.scene(name, callback)`. Inside the callback:
- Build Kaplay objects (rects, text, circles) for the visual layer
- Subscribe to engine events via `engine.on()`
- Clean up listeners in `k.onSceneLeave()` to prevent memory leaks
- Call engine methods (`engine.advance()`, `engine.makeChoice()`, etc.) on user input

The `#html-overlay` div is used for text-heavy UI (event descriptions, name input, trade lists) that would be painful to render character-by-character on canvas.

---

## 7. Prompt Engineering

Prompts live in `worker/src/prompt-templates.ts` (system prompts per tier) and `worker/src/prompt-assembly.ts` (user prompt builder).

The user prompt is assembled from blocks, each with a token budget:
- **Location block** (300 tokens): segment, terrain, hazards, weather, nearby landmark
- **Party block** (200 tokens): members with hp/sanity/morale, supplies, pace/rations
- **Recent events block** (300 tokens): last 5 journal entries
- **Conditional block** (200 tokens): active diseases, Indigenous nations in region

Total input target: ~1,500 tokens. Output: max 800 tokens (events), 600 tokens (newspaper), 60 tokens (epitaph).

**Critical rules for prompt changes:**
- The JSON output format instruction is appended to every system prompt via `JSON_FORMAT_BLOCK`. Do not remove it.
- `parseEventResponse()` validates the JSON strictly. If you change the schema, update both the format block AND the parser.
- Fallback events in `FALLBACK_EVENTS` (5 per tier) fire when LLM calls fail. They must match the `EventResponse` type exactly.
- Consequence values are in game units: food in pounds, ammo in rounds, money in cents.

---

## 8. Code Style

### Worker (TypeScript)
- Strict mode (`"strict": true` in tsconfig).
- All functions have explicit types. Minimize `any` usage (some `as any` casts remain as tech debt).
- State mutations use `structuredClone()` — never mutate the verified state in-place.
- Errors returned as JSON `{ error: "error_code" }` with appropriate HTTP status.
- Historical context preferably accessed via `context-loader.ts` functions, though raw JSON traversal also exists in `prompt-assembly.ts` and `index.ts`.

### Frontend (vanilla JS)
- No build step. ES modules loaded via `<script type="module">`.
- Kaplay imported from CDN: `https://unpkg.com/kaplay@3001/dist/kaplay.mjs`.
- `GameEngine` is a class on `window.engine`. Scenes access it via the `engine` parameter.
- Canvas is 640x480, `crisp: true`, `stretch: true`, `letterbox: true`.
- Colors are RGB arrays: `k.color(212, 160, 23)` for gold, `k.color(200, 190, 170)` for parchment.
- Text uses Kaplay's built-in font (no custom font loading for canvas text).
- Engine events follow the pattern: `engine.on("eventName", handler)` / `engine.off("eventName", handler)`.

---

## 9. Operational Rules

- **Secrets:** `HMAC_SECRET` and `ANTHROPIC_API_KEY` set via `wrangler secret put`. Never in code, never in `.dev.vars` committed. `.dev.vars` is in `.gitignore`.
- **Deploy frontend:** Push to GitHub, Cloudflare Pages auto-deploys from `public/` directory.
- **Deploy worker:** `npx wrangler deploy` from repo root.
- **Tests:** `npx vitest run` — must see 119 tests pass before committing worker changes.
- **Local dev:** `npx wrangler dev` starts worker locally. Frontend needs a local HTTP server for `public/` (e.g., `npx serve public`). **Note:** `engine.js` hardcodes the production worker URL — you must manually override it to `http://localhost:8787` for local development.
- **CORS:** Worker reads `ALLOWED_ORIGIN` env var but it is not set in `wrangler.toml` — defaults to `*` (all origins). Set it explicitly if origin restriction is needed.
- **Active branch:** `kaplay-rebuild` — this is the working branch. `master` has the old ASCII terminal UI.

---

## 10. Forbidden Actions (consolidated)

Claude Code must not:
- Commit `.dev.vars`, API keys, HMAC secrets, or Cloudflare account IDs
- Move simulation logic (`advanceDays`, disease, starvation, death) to the client
- Break the HMAC signing chain (skip `verifyIncomingState` or `signState`)
- Skip event hash verification in `/api/choice`
- Allow `/api/advance` when `pending_event_hash` is set
- Allow `/api/store` after departure (miles_traveled > 0)
- Remove or weaken the High tone tier
- Add npm runtime dependencies (frontend is zero-dependency vanilla JS + Kaplay CDN)
- Trust LLM output without validation (all consequences must be parsed + clamped)
- Push directly to master
- Add a database or server-side session storage
- Add a build step for `public/` (no webpack, no vite for frontend)

---

## 11. Session Ritual

**Start of session:**
1. Read CLAUDE.md in full
2. Read the relevant plan file if the task matches one: `PLAN.md`, `KAPLAY_REBUILD_PLAN.md`, `KAPLAY_FIXES_V3_PLAN.md`, `FEATURES_PLAN.md`
3. Run `git status` and `git log --oneline -5`
4. Run `npx vitest run` to confirm tests pass
5. Check section 4 (Technical Debt) — is the task making any of 1-13 worse?
6. Summarize your understanding of the task before writing code

**End of session:**
1. Run `npx vitest run` and confirm all 119+ tests pass
2. Summarize what changed
3. List files modified
4. List any new technical debt introduced
5. Confirm `git status` is in expected state

---

## 12. When In Doubt

Priority:
1. Ask the user. Every time.
2. Read the relevant file in full before editing.
3. Check `PLAN.md` for the original design decision.
4. Prefer the smallest change that works.
5. If about to refactor something that wasn't asked for — stop. Open a separate task.

---

**Bottom line:** free marketing asset, near-zero ops cost, AI-generated events are the product, horror tier is the hook, server owns all game logic, client is mostly a display layer. Respect the HMAC chain, validate LLM output, keep the frontend zero-dependency, and run the 119 tests before committing.
