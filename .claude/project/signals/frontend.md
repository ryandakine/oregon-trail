# frontend

## What it does

Zero-build static frontend served by Cloudflare Pages. Vanilla JS + Kaplay 3001 (CDN) render a 640x480 pixel-art canvas game. `GameEngine` is a client-side state machine; it calls the worker API and bridges results into Kaplay scene transitions. The client holds the signed state blob and renders what the server returns — no simulation logic lives here.

## Artifacts

- [`public/index.html`](../../../public/index.html) — shell: canvas + `#html-overlay` + `#newspaper-overlay` + `#tombstone-overlay` divs; OG meta tags; `#a11y-status` live region; `<noscript>` fallback; PWA manifest link; Plausible analytics script (points to analytics.osi-cyber.com)
- [`public/main.js`](../../../public/main.js) — Kaplay init (640x480, `crisp/stretch/letterbox: true`, `pixelDensity: min(3, max(2, DPR))`); IBM Plex Mono font load with fallback; all 17 scene modules registered; `stateChange` bridge from `engine` → `k.go(sceneName)`; unpkg→jsDelivr CDN fallback; `window.__ERRORS` capture
- [`public/engine.js`](../../../public/engine.js) — `GameEngine` class on `window.engine`: state machine, API client, event emitter; hardcoded production worker URL (`oregon-trail-api.trails710.workers.dev`) — must be manually changed for local dev; lazy-fetches `/api/prices` before store scene
- [`public/lib/draw.mjs`](../../../public/lib/draw.mjs) — `PALETTE` (32-color array from [`assets/palette.hex`](../../../assets/palette.hex)) + all primitive draw helpers: `drawSky`, `drawCloud`, `drawHills`, `drawMountains`, `drawGround`, `drawTrail`, `drawWagon`, `drawOx`, `drawPioneer`, `drawTree`, `drawRock`, `drawGrassTuft`, `drawCrow`, `drawDeadTree`, `drawHealthIcon`, `addHighlights` (seeded RNG). No runtime scale params — ported verbatim from [`mockups/primitive-mockup.html`](../../../mockups/primitive-mockup.html).
- [`public/lib/hud.mjs`](../../../public/lib/hud.mjs) — `addTopHud`, `addBottomHud`, `updateHud`, `attachResizeRebuild`; `UI_SCALE` 1.4x below 500px; landmark ticks with K/C/L/S/F/B monograms (gold when passed); hp thresholds at 70/40/20
- [`public/lib/tone.mjs`](../../../public/lib/tone.mjs) — `applyToneOverlay`: Low=warm, Medium=neutral, High=cool+vignette+pulse+scanlines; z-layers 45-48 (below HUD at z=50+)
- [`public/scenes/`](../../../public/scenes) — 17 scene files, each exports `register(k, engine)` calling `k.scene(name, cb)`: `title.js`, `profession.js`, `names.js`, `tone.js`, `store.js`, `travel.js`, `event.js`, `bitter_path.js`, `landmark.js`, `river.js`, `hunting.js`, `death.js`, `arrival.js`, `wipe.js`, `newspaper.js`, `share.js`, `loading.js`
- [`public/newspaper.js`](../../../public/newspaper.js) — newspaper DOM renderer (separate from `scenes/newspaper.js` Kaplay scene)
- [`public/tombstone.js`](../../../public/tombstone.js) — tombstone DOM renderer
- [`public/sw.js`](../../../public/sw.js) — service worker registered in `index.html` for PWA caching
- [`public/manifest.json`](../../../public/manifest.json) — PWA manifest; icons at 192/512 maskable + standard
- [`public/fonts/`](../../../public/fonts) — IBM Plex Mono 400 + 700 TTF (loaded via `k.loadFont`)
- [`public/_headers`](../../../public/_headers) — Cloudflare Pages HTTP headers config

## Docs

- [`AESTHETIC_SPEC.md`](../../../AESTHETIC_SPEC.md) — 32-color palette spec, primitive rendering rules, pixel art constraints
- [`FRONTEND_TEST_PLAN.md`](../../../FRONTEND_TEST_PLAN.md) — Playwright scene smoke test design and coverage plan
- [`IMPLEMENTATION_PLAN_v3.md`](../../../IMPLEMENTATION_PLAN_v3.md) — v3 Kaplay rebuild implementation record (1154 lines)
- [`mockups/primitive-mockup.html`](../../../mockups/primitive-mockup.html) — source mockup; `draw.mjs` helpers ported mechanically from this file

## Coupling

- [`public/engine.js`](../../../public/engine.js) hardcodes the worker URL — must match [`wrangler.toml`](../../../wrangler.toml) `name` field when worker is renamed or deployed to a new account. Coupling to worker domain.
- [`public/engine.js`](../../../public/engine.js) fallback `STORE_PRICES` diverges silently if [`worker/src/state.ts`](../../../worker/src/state.ts) `STORE_PRICES` changes. No compile-time check.
- Scene files use `#html-overlay` for event descriptions and name input — this div must be present in `index.html` exactly as `html-overlay`. Removing or renaming it breaks event/names/store scenes.
- [`public/scenes/bitter_path.js`](../../../public/scenes/bitter_path.js) expects trigger kind `"bitter_path"` from the server. The content-warning gate in the scene fires only on that trigger; routing a normal event through this scene is blocked server-side by trigger-kind verification.
- [`public/lib/draw.mjs`](../../../public/lib/draw.mjs) was ported verbatim from [`mockups/primitive-mockup.html`](../../../mockups/primitive-mockup.html) with three mechanical substitutions — adding new draw helpers must follow the same port pattern or visual inconsistency results.

## Conventions worth knowing

- No build step — no webpack, no Vite, no TypeScript compiler for [`public/`](../../../public). All type safety lives in the worker.
- ES modules loaded via `<script type="module">`. Scenes import via relative paths; Kaplay loads from CDN.
- Colors use RGB arrays: `k.color(212, 160, 23)` for gold, `k.color(200, 190, 170)` for parchment.
- Canvas text uses IBM Plex Mono loaded as `"plex"` (not Kaplay built-in bitmap); falls back to built-in on 404.
- New scenes: file in `public/scenes/<name>.js`, export `default(k, engine)` that calls `register(k, engine)` pattern, import in `main.js` `Promise.all` array, add to `sceneMap` in `main.js`.
- New draw helpers: go in [`public/lib/draw.mjs`](../../../public/lib/draw.mjs); port mechanically from [`mockups/primitive-mockup.html`](../../../mockups/primitive-mockup.html) with substitutions: `P.x` → `...PALETTE.x`, `k.__rectEllipse(w,h)` → `ellipseRect(k,w,h)`, module-level add calls → `export function drawX(k, ...)`.
- `style.css` is a legacy artifact — NOT loaded by current `index.html`.
- Frontend API calls go through `engine.api()` in `engine.js` — never raw `fetch` in scene files.
