# 5 Features Plan: Oregon Trail Visual & Gameplay Upgrade

**Total estimate:** ~14.5 hours with CC+gstack
**Build order:** Pause Menu → Landmarks → Travel Animation → Tombstone → Hunting

---

## Feature 1: Animated Travel Screen (3h)

Replace static terrain art with CSS parallax scrolling wagon + terrain.

### What Changes
- **ui.js:** Replace `renderTravel()` to build 3-layer parallax scene in #narrative. Wagon fixed at 30% from left, two terrain layers scroll via CSS translateX at different speeds. Day counter ticks via JS interval during API call.
- **game.js:** Emit `'advanceStarted'` before fetch in `advance()` so UI starts animation during server wait.
- **style.css:** Add `.travel-scene` (relative, overflow hidden, 20ch height), `.travel-bg`/`.travel-mg` (absolute, scrolling keyframes), `.travel-wagon` (fixed position), `@keyframes scroll-bg` (8s) and `@keyframes scroll-mg` (4s).

### Terrain Scroll Profiles (simple, repeating)
- Prairie: `__~~__~~__~~__`
- Mountains: `/\/\  /\  /\/\`
- Desert: `._. ._.  ._.`
- Forest: `|/|\  |/|\ `
- Bluffs: `_/\__/\_/\__`

### No Backend Changes

---

## Feature 2: NPC Dialogue at Landmarks (4h)

Fix broken landmark data + add rest/trade/talk interactions.

### What Changes

**worker/src/index.ts:**
- In `handleAdvance()`: when trigger is "landmark", look up full landmark from ctx and merge into trigger_data (description, diary_quote, type, trade_inventory, services)
- New route: `POST /api/landmark` → `handleLandmark()`
- REST action: advance date +1 day, heal all living members +10 hp (capped 100), re-sign
- TRADE action: validate items against landmark's trade_inventory, deduct money, add supplies, re-sign
- TALK action: call Anthropic with landmark context, return { speaker, dialogue }

**worker/src/types.ts:**
- Add `LandmarkRequest { signed_state, landmark_id, action: "rest"|"trade"|"talk", trade_items? }`

**public/game.js:**
- Replace no-op `resolveLandmark()` with real API call to `/api/landmark`
- Store `this.currentLandmark` when entering LANDMARK state
- REST/TRADE stay at LANDMARK (re-render), CONTINUE transitions to TRAVEL

**public/ui.js:**
- Refactor `renderLandmark()`: show full description + diary quote (now in trigger_data), 4 buttons (rest/trade/talk/continue)
- REST: show "+10 health, 1 day passed" message, re-render
- TRADE: show landmark's trade_inventory with store-grid UI pattern
- TALK: show NPC dialogue in box-drawing speech bubble
- Add `.npc-dialogue` and `.trade-grid` CSS classes

---

## Feature 3: Tombstone Image Sharing (2h)

Generate shareable PNG when party member dies.

### What Changes

**Create `public/tombstone.js` (~150 lines):**
- `renderTombstone(container, deathData)` — builds stone-gray styled div (600x800px)
- Shows: cross, name, dates, epitaph, "Mile X on the Oregon Trail"
- "Download" and "Share" buttons via html2canvas (already loaded)
- Same pattern as newspaper.js

**Fix death data flow:**
- `handleAdvance()` trigger_data for death is `{ deaths: [...] }` but UI expects single death
- Fix in game.js: extract first death from array, fetch epitaph via `/api/epitaph`, pass to UI
- Add `engine.generateEpitaph(name)` method

**public/ui.js:**
- Fix `renderDeath()` to handle correct data shape
- After epitaph loads, add "Download Tombstone" button
- Button opens `#tombstone-overlay` with rendered tombstone

**public/index.html:** Add `<div id="tombstone-overlay" class="hidden"></div>`

**public/style.css:** Tombstone styles — stone-gray bg (#8a8a7a), serif font, rounded top arch

---

## Feature 4: Pause Menu (1.5h)

ESC/P opens status overlay during travel. No backend changes.

### What Changes

**public/ui.js:**
- Add `_togglePause()` — shows/hides `#pause-overlay`, calls `engine.pauseAdvance()`/`engine.resumeAdvance()` (already exist)
- Add `renderPause()` — builds full status from `engine.gameState`:
  - Party: all members with health/morale/sanity/disease
  - Supplies: full inventory in 2 columns
  - Trail: miles, date, next landmark, % complete
  - Journal: last 10 entries from `engine.fullJournal`
  - Pace/rations controls
- Modify `onKeyDown()`: ESC/P during TRAVEL toggles pause

**public/index.html:** Add `<div id="pause-overlay" class="hidden"></div>`

**public/style.css:** Overlay styles — fixed fullscreen, 90% black bg, centered `.pause-menu` (70ch max), section headers in dim uppercase

---

## Feature 5: Hunting Mini-Game (4h)

Timed 15s hunting with ASCII animals moving across screen.

### What Changes

**New state: HUNTING** added to state machine.

**worker/src/index.ts:**
- New route: `POST /api/hunt` → `handleHunt()`
- Validates: ammo_spent <= current ammo, hits <= ammo_spent
- Applies: +food (rabbit×5, deer×15, buffalo×40), -ammo_spent, +1 day
- Re-signs state

**worker/src/types.ts:**
- Add `HuntRequest { signed_state, hits: { rabbit, deer, buffalo }, ammo_spent }`

**public/game.js:**
- Add `startHunt()` — pauses advance, transitions to HUNTING
- Add `submitHunt(hits, ammoSpent)` — calls `/api/hunt`, transitions to TRAVEL

**public/ui.js:**
- Add `renderHunt()` — builds arena (#narrative), starts 15s timer, spawns animals
- Animals: ASCII sprites (`>o)` rabbit, `{O>` deer, `{=OO=}>` buffalo) moving right-to-left via CSS animation
- Click/tap on animal = hit. Each hit costs 1 ammo, adds food.
- `_spawnAnimal()` — creates animated element every 1-2s with weighted random type
- `_endHunt()` — stops spawning, shows totals, submits to API
- Action bar: add "Hunt [H]" button during TRAVEL (shown when ammo > 0)

**public/style.css:**
- `.hunt-arena` — relative, overflow hidden, 25ch height
- `.hunt-animal` — absolute, cursor crosshair, CSS animation right-to-left
- `@keyframes hunt-move` — translateX animation
- `.hunt-hit` — scale + fade explosion effect
- Mobile: larger tap targets (1.5em font, 44px min)

### Animal Constants
```
rabbit:  { art: '>o)',      food: 5,  speed: 2s,   weight: 50% }
deer:    { art: '{O>',      food: 15, speed: 3.5s, weight: 35% }
buffalo: { art: '{=OO=}>', food: 40, speed: 5s,   weight: 15% }
```

---

## Parallelization Strategy

| Agent | Features | Backend? | Files |
|-------|----------|----------|-------|
| A | Feature 4 (Pause) + Feature 1 (Travel Animation) | NO | ui.js, style.css, game.js (emit event only) |
| B | Feature 2 (Landmarks) + Feature 3 (Tombstone) | YES | index.ts, types.ts, game.js, ui.js, tombstone.js |
| C | Feature 5 (Hunting) | YES | index.ts, types.ts, game.js, ui.js, style.css |

Features 4+1 are pure frontend. Features 2+3 share the trigger_data enrichment pattern. Feature 5 is independent.

---

## Verification

1. `npx vitest run` — all 107 existing tests still pass
2. `npx wrangler dev` — test new endpoints with curl:
   - `/api/landmark` with rest/trade/talk actions
   - `/api/hunt` with valid/invalid ammo counts
3. Open https://oregon-trail.pages.dev and play through:
   - Travel screen shows scrolling animation (not static art)
   - Press P/ESC during travel → pause menu shows all stats
   - Reach a landmark → rest heals, trade works, talk generates NPC dialogue
   - Party member dies → tombstone PNG downloads
   - Click Hunt → 15s mini-game with ASCII animals
4. Test on mobile viewport (375px)
5. Test High tier — agency-steal still works during events
