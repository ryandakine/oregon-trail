# Kaplay Visual Rebuild Plan

**Branch:** `kaplay-rebuild` (ASCII version stays on `master`)
**Engine:** Kaplay via CDN (`https://unpkg.com/kaplay@3000.1.17/dist/kaboom.mjs`)
**Resolution:** 640x360 internal, integer scaling to viewport
**Style:** SNES/Genesis pixel art (Oregon Trail II 1995 upgraded to Stardew Valley)

## Architecture

```
public/
  index.html           ← NEW: minimal HTML, loads Kaplay CDN + game scripts
  engine.js            ← KEPT: GameEngine class (API client, state machine, data)
  main.js              ← NEW: Kaplay init, asset loading, scene registration
  scenes/
    title.js           ← Title screen scene
    profession.js      ← Profession picker
    names.js           ← Name entry
    tone.js            ← Tone tier selector
    store.js           ← General store
    travel.js          ← Main travel loop (parallax scrolling landscape)
    event.js           ← AI-generated event display + choices
    landmark.js         ← Landmark interaction (rest/trade/talk)
    river.js           ← River crossing
    death.js           ← Death + epitaph + tombstone
    hunting.js         ← Hunting mini-game
    arrival.js         ← Oregon City arrival
    wipe.js            ← Game over
    newspaper.js       ← End-of-run newspaper
    share.js           ← Share screen + tip jar
  assets/              ← Symlink or copy of /assets/
```

Backend (`worker/src/`) is UNCHANGED. All 119 tests stay.

---

## What Stays vs What Changes

### STAYS (rename game.js → engine.js)
- `GameEngine` class (constructor, state machine, API client)
- `STORE_PRICES`, `STARTING_MONEY`, `RECOMMENDED_PURCHASES`
- `CHALLENGE_INFO`, `TRAIL_FLAVOR`, `WEATHER_FLAVOR`, `NPC_DIALOGUE`
- All API methods: `advance()`, `makeChoice()`, `resolveRiver()`, etc.
- `_saveRun()`, `_clearSavedRun()`, `_loadSavedRun()`
- Event emitter (`on`, `emit`, `transition`)

### DELETED
- `public/ui.js` (2,640 lines) — ALL DOM rendering replaced by Kaplay scenes
- `public/style.css` (1,321 lines) — no CSS needed, canvas renders everything
- `public/newspaper.js` (269 lines) — rebuilt as Kaplay scene
- `public/tombstone.js` (197 lines) — rebuilt as Kaplay scene
- All ASCII art constants (TERRAIN_ART, TERRAIN_FRAMES, WAGON_ART, LANDMARK_ART, etc.)
- `public/sw.js` — keep for PWA but update cached file list
- `public/html2canvas.min.js` — replaced by canvas screenshot from Kaplay

### NEW
- `public/main.js` — Kaplay init + asset loading + scene registration
- 15 scene files in `public/scenes/`
- Asset placeholder loading system

---

## public/index.html (new)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Oregon Trail — AI Edition</title>
  <meta name="theme-color" content="#1a1a2e">
  <link rel="manifest" href="/manifest.json">
  <style>
    * { margin: 0; padding: 0; }
    body { background: #1a1a2e; overflow: hidden; }
    canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
  </style>
</head>
<body>
  <script type="module" src="main.js"></script>
</body>
</html>
```

Minimal. No CSS framework. Canvas fills viewport.

---

## public/main.js (new)

```javascript
import kaplay from "https://unpkg.com/kaplay@3000.1.17/dist/kaboom.mjs";

// Init Kaplay
const k = kaplay({
  width: 640,
  height: 360,
  background: [26, 26, 46],  // #1a1a2e
  crisp: true,
  pixelDensity: 1,
  stretch: true,
  letterbox: true,
});

// ── Load Assets ──────────────────────────────────

// Placeholder for missing assets
k.loadSprite("placeholder", "/assets/_placeholder.png");

// Sprites (TODO: replace with real pixel art)
// Each loadSprite with a TODO comment for the asset description
k.loadSprite("wagon", "/assets/sprites/wagon.png");       // TODO: ASSET - 64x48 covered wagon, side view, canvas top
k.loadSprite("wagon_wheels", "/assets/sprites/wagon_wheels.png"); // TODO: ASSET - 64x16 wagon wheels, 4 animation frames
k.loadSprite("oxen", "/assets/sprites/oxen.png");          // TODO: ASSET - 32x32 ox pair, walking animation 4 frames
k.loadSprite("party_m", "/assets/sprites/party_male.png"); // TODO: ASSET - 16x32 male pioneer, walking 4 frames
k.loadSprite("party_f", "/assets/sprites/party_female.png"); // TODO: ASSET - 16x32 female pioneer, walking 4 frames

// Terrain backgrounds (parallax layers)
k.loadSprite("bg_prairie", "/assets/landmarks/bg_prairie.png");     // TODO: ASSET - 1280x360 prairie scrolling bg
k.loadSprite("bg_mountains", "/assets/landmarks/bg_mountains.png"); // TODO: ASSET - 1280x360 mountain range bg
k.loadSprite("bg_desert", "/assets/landmarks/bg_desert.png");       // TODO: ASSET - 1280x360 desert bg
k.loadSprite("bg_forest", "/assets/landmarks/bg_forest.png");       // TODO: ASSET - 1280x360 forest bg
k.loadSprite("bg_river", "/assets/landmarks/bg_river.png");         // TODO: ASSET - 1280x360 river valley bg
k.loadSprite("bg_bluffs", "/assets/landmarks/bg_bluffs.png");       // TODO: ASSET - 1280x360 sandstone bluffs bg
k.loadSprite("bg_canyon", "/assets/landmarks/bg_canyon.png");        // TODO: ASSET - 1280x360 canyon bg
k.loadSprite("bg_plains", "/assets/landmarks/bg_plains.png");       // TODO: ASSET - 1280x360 high plains bg

// Landmark scenes (full-screen backgrounds)
k.loadSprite("lm_fort", "/assets/landmarks/fort.png");             // TODO: ASSET - 640x360 frontier fort scene
k.loadSprite("lm_chimney_rock", "/assets/landmarks/chimney_rock.png"); // TODO: ASSET - 640x360 Chimney Rock
k.loadSprite("lm_river_cross", "/assets/landmarks/river_crossing.png"); // TODO: ASSET - 640x360 river crossing
k.loadSprite("lm_oregon_city", "/assets/landmarks/oregon_city.png");   // TODO: ASSET - 640x360 Oregon City

// UI elements
k.loadSprite("btn_frame", "/assets/ui/button_frame.png");   // TODO: ASSET - 9-slice button frame, 32x32
k.loadSprite("panel", "/assets/ui/panel.png");               // TODO: ASSET - 9-slice panel bg, 48x48
k.loadSprite("health_bar", "/assets/ui/health_bar.png");     // TODO: ASSET - health bar frame + fill, 64x8
k.loadSprite("icon_food", "/assets/ui/icon_food.png");       // TODO: ASSET - 16x16 food icon
k.loadSprite("icon_ammo", "/assets/ui/icon_ammo.png");       // TODO: ASSET - 16x16 ammo icon
k.loadSprite("icon_oxen", "/assets/ui/icon_oxen.png");       // TODO: ASSET - 16x16 oxen icon
k.loadSprite("icon_med", "/assets/ui/icon_medicine.png");    // TODO: ASSET - 16x16 medicine icon

// FX
k.loadSprite("rain", "/assets/fx/rain.png");         // TODO: ASSET - 8x16 rain drop, 2 frames
k.loadSprite("snow", "/assets/fx/snow.png");         // TODO: ASSET - 8x8 snowflake, 3 frames
k.loadSprite("dust", "/assets/fx/dust.png");         // TODO: ASSET - 16x16 dust cloud, 4 frames

// Font
k.loadFont("pixel", "/assets/fonts/pixel.ttf");      // TODO: ASSET - pixel font TTF (e.g., m5x7 or Press Start 2P)

// ── Load Engine ──────────────────────────────────

// Import GameEngine (non-module, loaded via script tag or bundled)
// For CDN simplicity, engine.js sets window.engine
await import("./engine.js");

// ── Register Scenes ──────────────────────────────

// Each scene file exports a function: (k, engine) => void
const sceneModules = await Promise.all([
  import("./scenes/title.js"),
  import("./scenes/profession.js"),
  import("./scenes/names.js"),
  import("./scenes/tone.js"),
  import("./scenes/store.js"),
  import("./scenes/travel.js"),
  import("./scenes/event.js"),
  import("./scenes/landmark.js"),
  import("./scenes/river.js"),
  import("./scenes/death.js"),
  import("./scenes/hunting.js"),
  import("./scenes/arrival.js"),
  import("./scenes/wipe.js"),
  import("./scenes/newspaper.js"),
  import("./scenes/share.js"),
]);

// Register all scenes
for (const mod of sceneModules) {
  mod.default(k, window.engine);
}

// ── Bridge: Engine → Kaplay Scenes ───────────────

// When engine transitions state, go() to the matching Kaplay scene
window.engine.on('stateChange', ({ to, data }) => {
  const sceneMap = {
    TITLE: 'title',
    PROFESSION: 'profession',
    NAMES: 'names',
    TONE: 'tone',
    STORE: 'store',
    TRAVEL: 'travel',
    EVENT: 'event',
    LANDMARK: 'landmark',
    RIVER: 'river',
    DEATH: 'death',
    HUNTING: 'hunting',
    ARRIVAL: 'arrival',
    WIPE: 'wipe',
    NEWSPAPER: 'newspaper',
    SHARE: 'share',
  };
  const sceneName = sceneMap[to];
  if (sceneName) {
    k.go(sceneName, data || {});
  }
});

// Start
window.engine.init();
```

---

## Scene Structure (each file pattern)

Every scene file follows this pattern:

```javascript
// scenes/title.js
export default function registerTitleScene(k, engine) {
  k.scene("title", (data) => {
    // Background
    k.add([k.sprite("bg_prairie"), k.pos(0, 0)]);

    // Title text
    k.add([
      k.text("THE OREGON TRAIL", { size: 32, font: "pixel" }),
      k.pos(k.width() / 2, 80),
      k.anchor("center"),
    ]);

    // Subtitle
    k.add([
      k.text("— AI Edition —", { size: 16, font: "pixel" }),
      k.pos(k.width() / 2, 120),
      k.anchor("center"),
      k.color(180, 180, 120),
    ]);

    // Buttons / choices
    // ... Kaplay UI components

    // Input handling
    k.onKeyPress("enter", () => {
      engine.transition("PROFESSION");
    });
  });
}
```

---

## 15 Scenes — Key Details

### 1. title.js
- Background: prairie landscape with wagon silhouette at sunset
- Title text centered, animated shimmer/glow
- Challenge box (sprite panel), resume option if saved run
- "Press ENTER" or click to start

### 2. profession.js
- Background: Independence town scene
- 3 clickable panels: Farmer ($400), Carpenter ($800), Banker ($1600)
- Each panel has an icon sprite + text

### 3. names.js
- Background: inside a wagon/tent
- Text input for leader + 4 companions (Kaplay text input or keyboard capture)
- Display entered names in a roster panel

### 4. tone.js
- Background: fork in the road (bright path, dim path, dark path)
- 3 tone option panels with descriptions
- Warning text for High tier

### 5. store.js
- Background: general store interior (shelves, counter, shopkeeper)
- Item grid with +/- buttons (sprite-based)
- Running total, recommended button
- Challenge restrictions shown as locked icons

### 6. travel.js (MOST COMPLEX)
- **3-layer parallax scrolling background** (sky, terrain, ground) based on current terrain type
- Wagon sprite fixed at ~30% from left, wheels animated, oxen walking
- Party members walking alongside (sprite animation)
- HUD overlay: date, miles, food, oxen, trail progress bar
- Day counter ticking during API call
- Weather FX particles (rain, snow, dust) based on season
- Flavor text appears as floating text bubbles
- Calls `engine.advance()`, renders day summaries, transitions on triggers

### 7. event.js
- Background dims/blurs (or scene-specific illustration if available)
- Event title at top in decorative text
- Description typed out character by character
- Choice buttons (sprite panels) appear after description
- Agency-steal effect at High tier: red flash, text override

### 8. landmark.js
- Full-screen landmark background (fort/chimney rock/etc.)
- Landmark name + description panel at bottom
- Action buttons: Rest (bed icon), Trade (coins icon), Talk (speech bubble), Continue (arrow)
- NPC dialogue in speech bubble panel

### 9. river.js
- River crossing background with animated water
- Crossing info panel (depth, difficulty)
- 3 option buttons with risk indicators (green/yellow/red)
- Animated crossing sequence on choice

### 10. death.js
- Somber scene: prairie at dusk, grave in center
- Tombstone sprite with name/date/epitaph text
- Epitaph types out slowly
- Share/download button (Kaplay screenshot API: `k.screenshot()`)

### 11. hunting.js
- Overhead meadow/forest scene
- Ammo selection (5/10/20)
- Results panel with animal icons + food gained

### 12. arrival.js
- Oregon City panorama background
- Survivor roster with portraits
- Score display
- "Read the newspaper" button

### 13. wipe.js
- Dark, barren scene
- "Your party has perished" text
- Death toll list

### 14. newspaper.js
- Sepia newspaper background sprite (full screen)
- Dynamic text fields for headline, article, deaths
- Download screenshot button via `k.screenshot()`

### 15. share.js
- Background with game stats summary
- Share buttons (Twitter, Reddit, copy link)
- Tip jar link
- Play again button

---

## Asset Placeholder System

When `loadSprite()` fails (file missing), Kaplay shows nothing. To handle gracefully:

```javascript
// In main.js, wrap all loadSprite with a try that falls back to placeholder
function safeLoadSprite(name, path) {
  try {
    k.loadSprite(name, path);
  } catch {
    console.warn(`Missing asset: ${path}, using placeholder`);
    // placeholder already loaded
  }
}
```

Or use Kaplay's `onError` for asset loading failures.

---

## Sharing (replaces html2canvas)

Kaplay has built-in screenshot: `k.screenshot()` returns a data URL. Use this for:
- Tombstone PNG download
- Newspaper PNG download
- Share via Web Share API (convert data URL to blob)

---

## HUD Component (shared across travel/event/landmark scenes)

A reusable HUD that displays party status:

```javascript
function addHUD(k, engine) {
  const gs = engine.gameState;
  // Top bar: date | miles | food | oxen
  k.add([k.text(`${gs.position.date}`, { size: 10, font: "pixel" }), k.pos(8, 4), k.fixed(), k.z(100)]);
  // Trail progress bar
  // Party roster with health bars
  // ...
}
```

---

## Parallelization for Build

Split into 3 work units for parallel agents:

| Agent | Files | Scope |
|-------|-------|-------|
| A | main.js, engine.js, index.html, manifest.json, sw.js | Core scaffolding, asset loading, scene bridge |
| B | scenes/title.js → scenes/store.js (setup screens) | Pre-game scenes |
| C | scenes/travel.js → scenes/share.js (gameplay scenes) | In-game scenes |

All 3 can work in parallel because scenes are self-contained files with a standard interface: `(k, engine) => void`.

---

## Missing Assets List (output after build)

After scaffolding, the code will contain TODO comments for every missing asset. Format:

```
MISSING ASSETS:
1. /assets/sprites/wagon.png — 64x48, covered wagon side view, canvas top, wooden body, spoked wheels
   Prompt: "Pixel art covered wagon, side view, 1848 American frontier, 64x48 pixels, SNES style, limited palette"
2. /assets/sprites/oxen.png — 32x32, ox pair, 4 walking animation frames
   Prompt: "Pixel art sprite sheet, two oxen pulling yoke, 4 frame walk cycle, 32x32 per frame, top-down slight angle"
3. /assets/landmarks/bg_prairie.png — 1280x360, scrolling prairie background
   Prompt: "Pixel art panoramic prairie landscape, rolling green hills, wildflowers, blue sky with clouds, 1280x360, SNES style"
... (full list generated at end of build)
```

---

## Verification

1. `npx vitest run` — all 119 backend tests still pass (backend unchanged)
2. Open `public/index.html` — Kaplay canvas renders, scenes transition
3. Click through: title → profession → names → tone → store → travel
4. Travel scene: parallax scrolling works, HUD displays, advance() fires
5. Event/landmark/river/death scenes render with placeholder art
6. Screenshot button works (k.screenshot())
7. Mobile: canvas scales with letterbox, tap targets work
