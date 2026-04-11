# Weekend 1: Game Loop Implementation Plan

## New Files to Create

```
public/
  index.html          ← Page shell + DOM structure
  style.css           ← Terminal aesthetic + newspaper + mobile
  game.js             ← State machine + game mechanics + API client
  ui.js               ← DOM renderers + input handling
  newspaper.js        ← Sepia broadsheet renderer + PNG download
worker/src/
  index.ts            ← Worker entry point + routes + CORS
  anthropic.ts        ← Haiku API client + response parser + fallbacks
  context-loader.ts   ← Historical context lookup functions
```

Existing files (`types.ts`, `prompt-assembly.ts`, `prompt-templates.ts`, `hmac.ts`, `state.ts`, `historical-context.json`) are consumed but NOT modified.

---

## UNIT A: Worker API (worker/src/)

### index.ts — Worker Entry Point

Routes:
- `POST /api/start` → parse StartRequest, sanitize names (alphanum+space, max 20ch), call createInitialState(), generate trail rumor via Anthropic (1 sentence), return `{ signed_state, rumor }`
- `POST /api/store` → verify HMAC, validate purchases vs money, call applyStoreAndSign(), return `{ signed_state }`
- `POST /api/event` → verify HMAC, load context, call assembleEventPrompt(), call Anthropic (8s timeout), parse EventResponse, on failure retry once then return fallback event, re-sign state, return `{ event, signed_state }`
- `POST /api/choice` → verify HMAC, validate choice_index, call applyEventAndSign(), return `{ signed_state }`
- `POST /api/newspaper` → verify HMAC, build newspaper prompt from full_journal, return `{ newspaper_name, date, headline, byline, article_paragraphs }`
- `POST /api/epitaph` → verify HMAC, generate 1-line gravestone inscription, return `{ inscription }`

Infrastructure:
- CORS: `Access-Control-Allow-Origin` locked to `ALLOWED_ORIGIN` env var. OPTIONS preflight handler.
- Rate limiting: in-memory Map, 10 calls/min per `CF-Connecting-IP`, 60s sliding window.
- Error responses: `{ error: string }` JSON with appropriate HTTP status.
- Env bindings: `HMAC_SECRET`, `ANTHROPIC_API_KEY`, `ENVIRONMENT`, `ALLOWED_ORIGIN`

### anthropic.ts — LLM Client

Exports:
- `callAnthropic(system, user, apiKey, opts?)` → Promise<string>. Uses `fetch` + `AbortController` for 8s timeout. POST to `api.anthropic.com/v1/messages`, model `claude-haiku-4-5-20250415`, max_tokens default 800.
- `parseEventResponse(raw)` → EventResponse. Strips markdown fences via regex, JSON.parse, validates shape (title string, description string, choices 1-4 with label+consequences, personality_effects record, journal_entry string). Validates consequence keys against allowed set.
- `FALLBACK_EVENTS: Record<ToneTier, EventResponse[]>` — 5 pre-written parametric events per tier for LLM failures.

### context-loader.ts — Context Lookups

Exports:
- `getSegment(ctx, segmentId)` → TrailSegment | undefined
- `getSegmentForMile(ctx, milesTraveled)` → TrailSegment — walks ordered segments, computes cumulative distance, returns current segment. **Critical function.**
- `getLandmarksForSegment(ctx, segmentId)` → Landmark[]
- `getNextLandmark(ctx, milesTraveled)` → Landmark | undefined — first landmark with mile_marker > milesTraveled
- `getWeather(ctx, month, region)` → WeatherProfile | undefined
- `getDisease(ctx, diseaseId)` → DiseaseProfile | undefined
- `getNationsForSegment(ctx, segmentId)` → IndigenousNation[]
- `getCurrentRiverCrossings(ctx, segmentId)` → RiverCrossing[]

---

## UNIT B: Game Engine (public/game.js)

### State Machine

```
TITLE → PROFESSION → NAMES → TONE → STORE → TRAVEL → EVENT → CHOICE_MADE →
  (loop back to TRAVEL until arrival or wipe)
TRAVEL → RIVER | LANDMARK | DEATH | ARRIVAL | WIPE
ARRIVAL/WIPE → NEWSPAPER → SHARE
```

### GameEngine Class

Holds `signedState` from server + local tracking (full journal in localStorage, death records).

Event emitter pattern: `on(event, fn)`, `emit(event, data)`. Events:
- `stateChange(from, to, data)` — UI rebuilds screen
- `dayTick(date, miles, supplies, members)` — UI updates counters
- `eventReceived(event)` — UI displays narrative
- `deathOccurred(member, epitaph)` — UI shows death
- `error(message, recoverable)` — UI shows narrative error

### Travel Mechanics (advanceOneDay)

Each tick = 1 game day, displayed with 400ms visual beat:

1. **Advance miles:** `milesPerDay = {steady:12, strenuous:16, grueling:20}[pace] * weatherModifier`
2. **Consume food:** `{filling:3, meager:2, bare_bones:1}[rations] * aliveCount` lbs/day
3. **Starvation:** food=0 for 3+ days → health -10/day, morale -10/day
4. **Pace health cost:** grueling → -2 hp/day all, -3 morale/day
5. **Disease check:** per alive member, `random() < baseProbability * riskMultiplier`. Max 1 new disease/day. Risk multiplier: +0.5 elevated region, +0.5 elevated month, +0.5 bare_bones rations, +0.3 grueling pace
6. **Disease progression:** daily hp loss = `ceil(100 * mortality_rate / progression_days)`. Medicine halves loss and consumes 1 dose. After progression_days: 50% cure, 50% continues half-progression.
7. **Death check:** health=0 → mark dead, call /api/epitaph, transition DEATH
8. **Segment check:** `getSegmentForMile()` — update current_segment_id if changed
9. **Landmark check:** miles >= nextLandmark.mile_marker → transition LANDMARK
10. **River check:** segment has river_crossings → transition RIVER (once per crossing)
11. **Event check:** daysSinceLastEvent >= 2 AND (>= 5 OR random() < 0.3) → call /api/event, transition EVENT. Target: 15-20 events per run.
12. **Arrival check:** miles >= 1764 → transition ARRIVAL
13. **Wipe check:** all dead OR (food=0 AND money=0 AND oxen=0) → transition WIPE

### River Crossing Mechanics

Three options:
- **Ford:** success = `(6 - ford_difficulty) / 5 * (oxen >= 6 ? 1.0 : 0.7)`. Spring depth harder. Fail: lose 10-30% food, random member -20 to -40 hp, +2 days.
- **Caulk & float:** success = 0.7 flat. Fail: lose 20-50% food+ammo, random member -60 hp (drowning risk). +1 day.
- **Ferry:** costs ferry_cost * 100 cents. Always succeeds. +0.5 day. Disabled if not available or can't afford.

### Store Pricing

| Item | Unit | Price (cents) | Supplies key |
|------|------|---------------|-------------|
| Food | 10 lbs | 30 | food += 10 |
| Ammo | 20 rounds | 200 | ammo += 20 |
| Clothing | 1 set | 300 | clothing += 1 |
| Spare parts | 1 | 200 | spare_parts += 1 |
| Medicine | 3 doses | 100 | medicine += 3 |
| Oxen | 1 yoke (2) | 5000 | oxen += 2 |

Starting money: farmer=$400 (40000c), carpenter=$800 (80000c), banker=$1600 (160000c).

Store tooltips:
- Food: "200 lbs per person for the full journey"
- Oxen: "6 minimum (3 yoke) to pull a loaded wagon"
- Clothing: "Essential for mountain crossings"
- Spare parts: "Broken axles and tongues can strand you"
- Medicine: "Reduces disease mortality by half"

---

## UNIT C: Frontend UI (public/)

### index.html — Page Shell

```html
<div id="terminal">
  <div id="top-bar"></div>
  <div id="game-area">
    <aside id="roster"></aside>
    <main id="narrative"></main>
  </div>
  <div id="action-bar"></div>
</div>
<div id="newspaper-overlay" class="hidden"></div>
```

Scripts: style.css, game.js, ui.js, newspaper.js, html2canvas CDN.
Meta: OG tags for sharing (title, description, image).

### style.css — Terminal Aesthetic

- `--amber: #ffb000; --bg: #0a0a0a;` on `#terminal`
- `max-width: 80ch; font-family: 'IBM Plex Mono', monospace; font-size: 14px;`
- `#roster`: 20ch left gutter, health bars, strikethrough dead members
- `#narrative`: flex-1, scrollable
- Box-drawing borders via CSS (Unicode characters)
- Typing cursor animation: blinking amber block
- Choice hover: inverted colors (amber bg, black text)
- Mobile `@media (max-width: 600px)`: 40ch terminal, roster collapses to compact top bar, full-width tap targets (min 44px)
- Newspaper `.newspaper`: sepia #f4e4c1 bg, serif font, 1200x675 aspect, 2-column layout

### ui.js — DOM Layer

`GameUI` class, takes engine in constructor, subscribes to events.

Screen renderers (one per state):
- `renderTitle(rumor)` — game name + AI trail rumor (typing animation)
- `renderProfession()` — 3 options with money shown
- `renderNames()` — terminal-style input prompts, one at a time
- `renderTone()` — own screen AFTER names, with descriptions + High tier warning
- `renderStore(supplies, money)` — category list, +/- controls, running total, tooltips
- `renderTravel(state)` — top bar (date/miles/landmark/weather), roster, auto-advancing day ticks
- `renderEvent(event)` — title + description with typing animation, then numbered choices. **Agency-steal at High tier:** if any member sanity < 30, 2s pause then "Before you can decide, [Name] acts—" and auto-selects
- `renderRiver(crossing)` — ford/caulk/ferry options with difficulty hints
- `renderLandmark(landmark)` — description + diary quote, rest/trade/continue options
- `renderDeath(member, epitaph)` — somber screen, slow typing, share epitaph button
- `renderArrival(state)` — Oregon City, survivor summary
- `renderNewspaper(data)` — delegates to newspaper.js
- `renderShare()` — Twitter/Reddit/copy/replay buttons

Typing animation: `typeText(element, text, speed=30)` — character by character, 30ms/char.

Input: global keydown for numbers (choices) + Enter (continue). Click handlers. Debounced.

---

## UNIT D: Newspaper Renderer (public/newspaper.js)

Takes `{ newspaper_name, date, headline, byline, article_paragraphs, survivors, deaths }`.

Renders sepia broadsheet in `#newspaper-overlay`:
- Masthead: newspaper name (serif, small-caps, letter-spacing), date, "Powered by OSI"
- Double-rule border
- Headline (uppercase, centered, 1.8rem)
- 2-column article text
- Footer with OSI CTA link

"Download as Image" button via html2canvas (CDN). 1200x675 at 2x scale for retina.

Share buttons: pre-filled Twitter text + URL, Reddit link, clipboard copy.

---

## Parallelization

4 worktree agents, all independent:

| Agent | Files | Dependencies |
|-------|-------|-------------|
| A: Worker API | index.ts, anthropic.ts, context-loader.ts | Imports existing: types, state, hmac, prompt-assembly, context JSON |
| B: Game Engine | game.js | Calls worker API (mock-able). Standalone JS. |
| C: Frontend UI | index.html, style.css, ui.js | Consumes game.js events (interface defined above). |
| D: Newspaper | newspaper.js | Standalone. Takes data object, renders HTML. |

Interface contracts between units are fully defined in the type system and event specs above.

---

## Verification

1. `npx vitest run` — existing 63 tests still pass (foundation unchanged)
2. `npx wrangler dev` — Worker starts, test endpoints with curl:
   - `curl -X POST localhost:8787/api/start -d '{"leader_name":"James","member_names":["Mary","John","Sarah","Thomas"],"profession":"farmer","tone_tier":"medium"}'`
   - Use returned signed_state for subsequent calls
3. Open `public/index.html` in browser (via `npx wrangler pages dev public/` or simple file server)
4. Play through a full run start-to-finish
5. Verify newspaper renders and PNG downloads
6. Test on mobile viewport (375px)
7. Test High tier: verify agency-steal triggers when sanity drops
