# Oregon Trail — Primitive-First Implementation Plan (v2.1)

**Status:** v2 review found 9 remaining bugs. v2.1 patches them below in § 0.5. READ § 0.5 BEFORE IMPLEMENTING — the code blocks later in the doc still show the broken v2 patterns; § 0.5 has the corrected patterns.
**Supersedes:** v1 + v2 (in git history). No backwards compatibility needed.

---

## § 0.5 — v2.1 Patch Notes (9 bugs from final review)

**Implement these corrections; ignore the earlier wrong patterns shown in § 2 and § 3.**

### Patch 1 — Wheel rotation (Kaplay parent-child doesn't inherit rotation)

Kaplay 3001 children do NOT inherit parent rotation. The `k.make([k.rotate(0)])` + children pattern in § 2 is broken.

**Correct approach:** Skip animated spokes. Wheels are simple filled circles with static accent lines; "motion" comes from weather dust particles and walking pioneers, not wheel rotation.

```js
function makeWheel(k, x, y, r) {
  const wheel = k.add([k.pos(x, y), k.anchor("center")]);
  wheel.add([k.circle(r + 2), k.color(...PALETTE.outline), k.anchor("center")]);
  wheel.add([k.circle(r), k.color(...PALETTE.woodLight), k.anchor("center")]);
  wheel.add([k.circle(r - 3), k.color(...PALETTE.wood), k.anchor("center")]);
  // 3 accent lines (hub + 2 radial hints) — readable, no rotation needed
  wheel.add([k.rect(r * 2 - 4, 2), k.color(...PALETTE.woodDark), k.anchor("center")]);
  wheel.add([k.rect(2, r * 2 - 4), k.color(...PALETTE.woodDark), k.anchor("center")]);
  wheel.add([k.circle(4), k.color(...PALETTE.outline), k.anchor("center")]);
  return wheel;
}
```

`drawWagon` returns `{ wheels: [] }` (empty) and the onUpdate loop no longer touches wheels. Delete the `for (const w of wagon.wheels) w.angle += 3;` line.

### Patch 2 — Health icon masks clipped to circle bounds

Rect masks in v2 paint over the dark outline ring. Use polygons that stay within the icon radius.

```js
export function drawHealthIcon(k, cx, cy, state) {
  const r = 12;
  const fills = { well: PALETTE.hpGreen, poor: PALETTE.hpYellow, ill: PALETTE.hpOrange, dying: PALETTE.hpRed, dead: PALETTE.hpDead };
  const tag = `hpicon-${cx}-${cy}`;

  k.add([k.circle(r + 1), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center"), tag]);
  k.add([k.circle(r), k.pos(cx, cy), k.color(...fills[state]), k.anchor("center"), tag]);

  // Shape via darker-inner-polygon overlays (stay inside circle)
  const dark = PALETTE.outline;
  if (state === "poor") {
    // Dark vertical bar on right half (stays within r)
    k.add([k.rect(2, r * 1.6), k.pos(cx, cy), k.color(...dark), k.anchor("center"), tag]);
  } else if (state === "ill") {
    // Dark diagonal (45°) — uses rotate which DOES work on rects
    k.add([k.rect(r * 1.6, 2), k.pos(cx, cy), k.color(...dark), k.rotate(45), k.anchor("center"), tag]);
  } else if (state === "dying") {
    // Small dark X inside
    k.add([k.rect(r * 1.2, 2), k.pos(cx, cy), k.color(...dark), k.rotate(45), k.anchor("center"), tag]);
    k.add([k.rect(r * 1.2, 2), k.pos(cx, cy), k.color(...dark), k.rotate(-45), k.anchor("center"), tag]);
  } else if (state === "dead") {
    // Full X overlay
    k.add([k.rect(r * 1.8, 3), k.pos(cx, cy), k.color(...dark), k.rotate(45), k.anchor("center"), tag]);
    k.add([k.rect(r * 1.8, 3), k.pos(cx, cy), k.color(...dark), k.rotate(-45), k.anchor("center"), tag]);
  }
  return tag;  // caller stores this for later `k.destroyAll(tag)` on rebuild
}
```

### Patch 3 — drawPioneer must return baseY + phase

```js
export function drawPioneer(k, cx, cy, opts = {}) {
  const hat = opts.hat ?? "felt";
  const phase = opts.phase ?? Math.random() * Math.PI * 2;
  const pioneer = k.add([k.pos(cx, cy), k.anchor("center")]);
  // ... build figure as children of `pioneer` (positions relative to 0,0)
  pioneer.baseY = cy;
  pioneer.phase = phase;
  return pioneer;
}
```

Then walking bob:
```js
for (let i = 0; i < pioneers.length; i++) {
  const p = pioneers[i];
  p.pos.y = p.baseY + Math.sin(walkPhase + p.phase) * 1.5;
}
```

### Patch 4 — Tone overlay z-order

Move tone overlay below HUD so it doesn't mute gold stats.

```js
// tone.mjs
if (tone === "high") {
  k.add([k.rect(640, 480), k.pos(0,0), k.color(30,15,40), k.opacity(0.25), k.z(45), k.fixed()]);  // was z:90 — BUG
  // Vignette stays at z:46 (above scene, below HUD at z:50)
  for (const [x,y,w,h] of [...]) {
    k.add([k.rect(w,h), k.pos(x,y), k.color(10,5,15), k.opacity(0.5), k.z(46), k.fixed()]);
  }
}
```

**Rule:** scene default z=0. Tone overlay z=45-46. HUD z=50-54. Pause z=100.

### Patch 5 — Drop wagon scale opt; bake 1.15× into coords directly

The mockup coords are for 1.0× wagon. Rewrite drawWagon with all offsets multiplied by 1.15. Don't accept a scale param. Document "drawWagon is authored at 1.15× v1 size; to change size, re-author or fork."

Similarly drop `oxen × 1.4` and `pioneer × 1.2` as runtime scaling — just hard-code the larger dimensions.

### Patch 6 — addHighlights seed deterministic from position

```js
// Caller usage:
addHighlights(k, cx, cy, w, h, 8, highlightColor, seedFrom(cx, cy));
function seedFrom(x, y) { return (x * 31 + y * 131) | 0; }
```

Add `seedFrom` as a named export from draw.mjs. Every helper picks its own seed from its center position — same asset always looks identical, different assets look different.

### Patch 7 — drawHealthIcon returns its tag; updateHud uses tags

```js
// hud.mjs updateHud
bottom.icons.forEach(icon => {
  k.destroyAll(icon.tag);   // removes all GameObjs with that tag
  const state = hpState(icon.member);
  icon.tag = drawHealthIcon(k, icon.cx, icon.cy, state);   // re-draw with new state, get new tag
});
```

### Patch 8 — main.js must add 2 lines for smoke test

```js
// public/main.js — add BEFORE kaplay init
window.__ERRORS = [];
window.addEventListener("error", (e) => window.__ERRORS.push({msg: e.message, line: e.lineno}));
// k is already exposed on line 12: window.k = k;
```

Without these, `scripts/smoke-travel.sh` can't detect JS errors.

### Patch 9 — event.js label collision

`public/scenes/event.js` renders "EVENT" text at y=460, which overlaps `addBottomHud` panel at y=444. Fix: when applying HUD in Commit 4, also move the EVENT label to y=420 (or delete it if the HUD date/stats are sufficient).

---

## § 0. TL;DR — v2 deltas from v1

---

## § 0. TL;DR — v2 deltas from v1

| v1 gap | v2 fix |
|---|---|
| 🚨 Tone-tier deferred → contradicts horror hook | Fold palette-shift overlay into COMMIT 3 (30 lines). Tone reads in first 2 seconds. |
| Wagon isn't hero (trail dominates) | Scale wagon 1.15×, drop 20px, add drop shadow, soften mountains 20% |
| Mobile 8px labels unreadable | UI_SCALE constant + all text ≥ 12px base |
| Palette clash (grass + sky too saturated) | Desaturate sky 15% + grass 10% |
| Flat fills vs painterly reference | Hand-placed highlight marks on every primitive (tree, wagon canvas, oxen body, rock, pioneer clothes) — AESTHETIC_SPEC § 1 |
| No walking / time-of-day / landmark ticks | All three, primitive-only, in COMMIT 2 |
| draw.mjs used only in travel | Also used by event.js + landmark.js (HUD only, 10-line touch each) in COMMIT 4 |
| Wheel rotation broken (`.angle` not free) | Wheel is a group with `k.rotate(0)` component |
| Cloud parallax lost in rewrite | `drawSky` returns `{ clouds }`, plumbed into update loop |
| 5 party members not 4 | HUD dots built dynamically from `engine.party.members.length` |
| Unicode health glyphs unreliable | Primitive half/quarter circle draws — NO Unicode chars |
| k.loop timers not cleaned up | Explicit `.cancel()` array in `onSceneLeave` |
| SW cache ignores new lib/ files | Bump `CACHE_NAME`, add `/lib/draw.mjs` + `/lib/hud.mjs` |
| Smoke test not runnable (wrong tools) | Real smoke using the existing `browse` binary we already verified works |
| String-health branch is a live bug | Delete it. Numeric only per `worker/src/types.ts:223` |
| Pause code hand-waved as "preserved" | Full pause body literally in the plan |

**Total scope:** 4 commits. ~2.5 hours implementation. All 119 worker tests unchanged.

---

## § 1. Commits

| # | Title | Files | ~LOC | Revertable alone? |
|---|---|---|---|---|
| 1 | `draw.mjs` — primitive helper library | `public/lib/draw.mjs` (NEW), `public/sw.js` (edit) | 320 + 3 | Yes (dead code) |
| 2 | `travel.js` rewrite with hero emphasis + motion | `public/scenes/travel.js` (rewrite), `public/lib/hud.mjs` (NEW) | 250 + 120 | Yes (revert restores old primitives) |
| 3 | Tone-tier overlay + UI_SCALE + accessibility | `public/lib/tone.mjs` (NEW), `public/scenes/travel.js` (edit), `public/engine.js` (add getter) | 45 + 15 + 5 | Yes |
| 4 | Propagate HUD to event.js + landmark.js | `public/scenes/event.js` (edit), `public/scenes/landmark.js` (edit) | 10 + 10 | Yes |

---

## § 2. Commit 1 — `public/lib/draw.mjs` + SW cache

### What

Pure ES module. Exports named helpers (one per visual element) + `PALETTE` (v2 tuned colors — sky desat 15%, grass desat 10%) + `ellipseRect` polyfill + `addHighlights` helper for hand-placed marks.

### Full PALETTE (v2)

```js
export const PALETTE = {
  // Sky — desat 15% from v1
  sky: [122, 140, 210],           // was [109,128,250]
  skyPale: [175, 200, 230],
  skyDawn: [255, 190, 130],       // for time-of-day
  skyDusk: [90, 70, 110],
  skyNight: [30, 30, 60],

  // Hills / mountains (softened contrast)
  mountainFar: [140, 148, 168],   // softer than v1
  mountainMid: [120, 128, 152],
  hillMid: [92, 130, 68],         // warmer, less lime
  hillNear: [130, 170, 45],       // desat 10% from v1

  // Grass tiles
  grassLight: [160, 195, 90],
  grassMid: [130, 170, 45],
  grassBorder: [60, 78, 32],

  // Dirt trail (simpler — 2 tones instead of 3)
  dirtLight: [178, 138, 92],
  dirtDark: [119, 74, 38],

  // Wagon
  wood: [90, 58, 31],
  woodLight: [139, 90, 45],
  woodDark: [55, 35, 18],
  canvas: [245, 230, 200],
  canvasMid: [232, 201, 154],
  canvasShadow: [200, 175, 130],

  // Oxen (scaled up in commit 2)
  oxBrown: [120, 85, 45],
  oxCream: [220, 195, 155],
  oxDark: [80, 55, 25],

  // Pioneers (scaled up in commit 2)
  skin: [235, 200, 160],
  shirt: [240, 230, 210],
  vest: [70, 50, 30],
  trousers: [100, 70, 40],
  bonnet: [240, 230, 200],
  dressBlue: [90, 120, 175],
  hatFelt: [65, 45, 30],

  // Shared
  outline: [58, 42, 26],
  outlineLight: [95, 72, 48],     // for highlights
  cloud: [250, 248, 240],
  cloudShadow: [215, 215, 225],

  // UI
  parchment: [245, 230, 200],
  parchmentDark: [42, 31, 14],
  parchmentShadow: [200, 175, 130],
  gold: [212, 160, 23],
  goldBright: [255, 205, 60],     // used on key stats for contrast
  dropShadow: [30, 25, 15],       // for under-wagon shadow

  // Health — 5 states
  hpGreen: [90, 138, 63],
  hpYellow: [215, 165, 30],
  hpOrange: [230, 140, 60],
  hpRed: [178, 34, 34],
  hpDead: [60, 60, 60],
};
```

### Ellipse polyfill

```js
export const ellipseRect = (k, w, h) => k.rect(w, h, { radius: Math.min(w, h) / 2 });
```

### `addHighlights` — the painterly lift

```js
// Sprinkles 5-12 hand-placed highlight dots inside a bounding region.
// Deterministic per seed so same asset always looks identical.
export function addHighlights(k, cx, cy, w, h, count, color, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const dx = (rng() - 0.5) * w * 0.7;
    const dy = (rng() - 0.5) * h * 0.7;
    const r = 1 + Math.floor(rng() * 2);
    k.add([k.circle(r), k.pos(cx + dx, cy + dy), k.color(...color), k.anchor("center"), k.opacity(0.7)]);
  }
}
function mulberry32(a) {
  return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
```

Every asset draw helper calls `addHighlights` once per color band (base + shadow + lit). This is what separates "hobby primitive" from "Golf Course painterly."

### Exported helpers

```js
drawSky(k, toneTier, dayPhase)   // returns { clouds: [] }
drawMountains(k)                  // softer v2 contrast
drawHills(k)                      // returns { near: [], far: [] }
drawGround(k)                     // checkerboard tiles + scrollable
drawTrail(k)                      // simplified — no dotted ticks
drawTree(k, cx, cy)               // + hand-placed leaf highlights
drawRock(k, cx, cy, w, h)         // + moss highlights
drawGrassTuft(k, cx, cy)
drawCloud(k, cx, cy, scale)
drawWagon(k, cx, cy, opts)        // returns { wheels: [wheelGroup1, wheelGroup2], bodyShadow }
  // scaled 1.15× from v1, drop shadow rendered
  // wheels are GROUPS with k.rotate(0) component attached
drawOx(k, cx, cy)                 // scaled 1.4× from v1
drawPioneer(k, cx, cy, opts)      // scaled 1.2×, 2-frame bob anim-ready
drawCrow(k, cx, cy)               // NEW: High-tier bird silhouette
drawDeadTree(k, cx, cy)           // NEW: High-tier silhouette variant
drawProgressBar(k, x, y, w, h, pct, landmarks)  // with tick marks
drawHealthIcon(k, cx, cy, state)  // PRIMITIVE half/quarter circle, NO Unicode
```

### Wheel group correctness (critical eng fix)

```js
// drawWagon returns { wheels: [g1, g2] }
// where gN is a GameObj with k.rotate(0) so caller can do g.angle += N

function makeWheel(k, x, y, r) {
  // Parent group with rotate component
  const group = k.make([k.pos(x, y), k.rotate(0), k.anchor("center")]);
  // Children are spokes/rim/hub, positioned relative
  group.add([k.circle(r + 2), k.color(...PALETTE.outline), k.anchor("center")]);
  group.add([k.circle(r), k.color(...PALETTE.woodLight), k.anchor("center")]);
  group.add([k.circle(r - 3), k.color(...PALETTE.wood), k.anchor("center")]);
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * 360;
    group.add([k.rect(3, r * 2 - 6), k.rotate(ang), k.color(...PALETTE.outline), k.anchor("center")]);
  }
  group.add([k.circle(4), k.color(...PALETTE.outline), k.anchor("center")]);
  return k.add(group);
}
```

Now `wheels[0].angle += 3` actually rotates the whole wheel.

### Primitive health icon (replaces Unicode)

```js
export function drawHealthIcon(k, cx, cy, state) {
  // state ∈ {"well","poor","ill","dying","dead"}
  const r = 12;
  // Outline circle always
  k.add([k.circle(r + 1), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center")]);

  const fills = {
    well:   PALETTE.hpGreen,
    poor:   PALETTE.hpYellow,
    ill:    PALETTE.hpOrange,
    dying:  PALETTE.hpRed,
    dead:   PALETTE.hpDead,
  };
  k.add([k.circle(r), k.pos(cx, cy), k.color(...fills[state]), k.anchor("center")]);

  // Shape redundancy — primitive draws, NOT Unicode
  const bg = k.rgb(...PALETTE.parchment);
  if (state === "poor") {
    // Half circle — mask right half with parchment
    k.add([k.rect(r, r * 2), k.pos(cx, cy - r), k.color(bg)]);
  } else if (state === "ill") {
    // Quarter circle — mask top-right + bottom
    k.add([k.rect(r, r), k.pos(cx, cy - r), k.color(bg)]);
    k.add([k.rect(r * 2, r), k.pos(cx - r, cy), k.color(bg)]);
  } else if (state === "dying") {
    // Ring only — center mask
    k.add([k.circle(r - 5), k.pos(cx, cy), k.color(bg), k.anchor("center")]);
  } else if (state === "dead") {
    // X drawn with 2 rotated rects
    k.add([k.rect(r * 2 - 2, 3), k.pos(cx, cy), k.color(...PALETTE.outline), k.rotate(45), k.anchor("center")]);
    k.add([k.rect(r * 2 - 2, 3), k.pos(cx, cy), k.color(...PALETTE.outline), k.rotate(-45), k.anchor("center")]);
  }
  // "well" = full filled circle, no mask
}
```

Zero Unicode. Works on any font / any platform.

### SW cache update (part of same commit)

```js
// public/sw.js — edit
const CACHE_NAME = 'oregon-trail-kaplay-v2-primitive';  // bumped
const STATIC_ASSETS = [
  ...existing,
  '/lib/draw.mjs',    // NEW
  '/lib/hud.mjs',     // NEW (lands in commit 2)
  '/lib/tone.mjs',    // NEW (lands in commit 3)
];
```

Ship all three paths in commit 1's precache list — harmless to precache a 404 (SW install `addAll` + catch tolerates per the existing code pattern at sw.js:34, which already wraps in `.then`).

Actually wait — `cache.addAll` is atomic: any 404 fails the whole call. Fix: use `Promise.allSettled(paths.map(p => cache.add(p)))` for the optional ones. Spec update for sw.js:

```js
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(STATIC_ASSETS);       // required
    await Promise.allSettled(OPTIONAL_ASSETS.map(a => cache.add(a)));
  }).then(() => self.skipWaiting()));
});
// STATIC_ASSETS = the always-exists list
// OPTIONAL_ASSETS = lib paths (tolerate 404 between commit 1 landing and later commits)
```

---

## § 3. Commit 2 — `travel.js` rewrite + `hud.mjs` + motion language

### `public/lib/hud.mjs`

```js
import { PALETTE, drawHealthIcon } from "./draw.mjs";

const UI_SCALE = window.innerWidth < 500 ? 1.3 : 1.0;   // mobile-friendly sizing
const SIZE = {
  body: Math.round(14 * UI_SCALE),
  label: Math.round(10 * UI_SCALE),   // was 8 — now readable on phone
  heading: Math.round(18 * UI_SCALE),
};

// Known landmarks at their mile positions (for progress bar ticks)
const LANDMARKS = [
  { name: "Kearney", miles: 304 },
  { name: "Chimney", miles: 592 },
  { name: "Laramie", miles: 672 },
  { name: "South Pass", miles: 932 },
  { name: "Fort Hall", miles: 1288 },
  { name: "Blue Mtns", miles: 1564 },
];

export function addTopHud(k, engine) {
  const bar = k.add([k.rect(640, 36), k.pos(0, 0), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(50)]);
  k.add([k.rect(632, 28), k.pos(4, 4), k.color(...PALETTE.parchment), k.outline(2, k.rgb(...PALETTE.outline)), k.fixed(), k.z(51)]);

  const y = 10;
  const dateText  = k.add([k.text(engine.formatDate(engine.currentDate), { size: SIZE.body }), k.pos(12, y), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(52)]);
  k.add([k.text("FOOD", { size: SIZE.body }), k.pos(180, y), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(52)]);
  const foodText  = k.add([k.text(String(engine.supplies?.food ?? 0), { size: SIZE.body }), k.pos(230, y), k.color(...PALETTE.goldBright), k.fixed(), k.z(52)]);
  k.add([k.text("MILES", { size: SIZE.body }), k.pos(290, y), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(52)]);
  const milesText = k.add([k.text(String(engine.milesTraveled ?? 0), { size: SIZE.body }), k.pos(350, y), k.color(...PALETTE.goldBright), k.fixed(), k.z(52)]);
  k.add([k.text("OXEN", { size: SIZE.body }), k.pos(410, y), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(52)]);
  const oxenText  = k.add([k.text(String(engine.supplies?.oxen ?? 0), { size: SIZE.body }), k.pos(460, y), k.color(...PALETTE.goldBright), k.fixed(), k.z(52)]);

  // Progress bar with landmark ticks
  const barX = 500, barY = 14, barW = 128;
  const barFrame = k.add([k.rect(barW, 10), k.pos(barX, barY), k.color(...PALETTE.outline), k.fixed(), k.z(52)]);
  const barFill = k.add([k.rect(0, 8), k.pos(barX + 1, barY + 1), k.color(...PALETTE.gold), k.fixed(), k.z(53)]);
  const ticks = [];
  for (const lm of LANDMARKS) {
    const tx = barX + (lm.miles / 1764) * barW;
    const tick = k.add([k.rect(2, 10), k.pos(tx, barY), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(54)]);
    ticks.push(tick);
  }
  // Text alternative to progress bar (accessibility)
  const progressText = k.add([k.text(`${Math.round(engine.milesTraveled / 1764 * 100)}%`, { size: SIZE.label }), k.pos(barX + barW / 2, barY + 14), k.color(...PALETTE.parchmentDark), k.anchor("center"), k.fixed(), k.z(52)]);

  return { dateText, foodText, milesText, oxenText, barFill, barW, progressText };
}

export function addBottomHud(k, engine) {
  // Panel sized to fit ALL party members (5 in current state, but dynamic)
  const members = engine.party?.members ?? [];
  const iconSize = 28 * UI_SCALE;
  const spacing = 54 * UI_SCALE;
  const panelW = Math.max(220, members.length * spacing + 24);
  const panelX = (640 - panelW) / 2;
  const panelY = 444;

  k.add([k.rect(panelW, 36), k.pos(panelX, panelY), k.color(...PALETTE.outline), k.fixed(), k.z(50)]);
  k.add([k.rect(panelW - 6, 30), k.pos(panelX + 3, panelY + 3), k.color(...PALETTE.parchment), k.fixed(), k.z(51)]);

  const icons = [];
  members.forEach((m, i) => {
    const cx = panelX + 28 + i * spacing;
    const cy = panelY + 14;
    const state = hpState(m);
    const icon = drawHealthIcon(k, cx, cy, state);   // returns the icon GameObjs for updates
    const label = k.add([k.text(m.name.slice(0, 4).toUpperCase(), { size: SIZE.label }), k.pos(cx, cy + 22), k.color(...PALETTE.parchmentDark), k.anchor("center"), k.fixed(), k.z(52)]);
    icons.push({ member: m, cx, cy, label, state });
  });
  return { icons };
}

export function updateHud(k, engine, top, bottom) {
  top.dateText.text = engine.formatDate(engine.currentDate);
  top.foodText.text = String(engine.supplies?.food ?? 0);
  top.milesText.text = String(engine.milesTraveled ?? 0);
  top.oxenText.text = String(engine.supplies?.oxen ?? 0);
  const pct = Math.min(1, (engine.milesTraveled ?? 0) / 1764);
  top.barFill.width = (top.barW - 2) * pct;
  top.progressText.text = `${Math.round(pct * 100)}%`;

  // Rebuild health icons — destroy+recreate is simplest given state-dependent masks
  bottom.icons.forEach(icon => { /* destroy visuals leaving only label */ });
  // ... (detail: store returned GameObjs per icon, use k.destroyAll with a tag, redraw)
}

export function hpState(member) {
  if (!member.alive) return "dead";
  const h = member.health;
  if (typeof h !== "number") return "poor";   // defensive
  if (h > 70) return "well";
  if (h > 40) return "poor";
  if (h > 20) return "ill";
  return "dying";
}
```

### `travel.js` rewrite — full code, not pseudocode

```js
import * as draw from "../lib/draw.mjs";
import { addTopHud, addBottomHud, updateHud } from "../lib/hud.mjs";
import { applyToneOverlay } from "../lib/tone.mjs";   // lands commit 3

export default function register(k, engine) {
  k.scene("travel", (data) => {
    let paused = false;
    const listeners = [];
    const loops = [];   // for explicit cleanup
    function engineOn(event, fn) { engine.on(event, fn); listeners.push({ event, fn }); }

    k.onSceneLeave(() => {
      for (const { event, fn } of listeners) engine.off(event, fn);
      for (const l of loops) l?.cancel?.();
    });

    // ── Render ──
    const tone = engine.gameState?.simulation?.tone ?? "medium";
    const dayPhase = getDayPhase(engine.gameState?.position?.date);

    const sky = draw.drawSky(k, tone, dayPhase);
    const hills = draw.drawHills(k);
    draw.drawMountains(k);
    draw.drawGround(k);
    draw.drawTrail(k);

    // Environment (tone-aware: High tier adds crow + dead tree silhouette)
    draw.drawTree(k, 560, 330);
    draw.drawRock(k, 70, 360);
    draw.drawRock(k, 110, 455, 24, 14);
    draw.drawGrassTuft(k, 60, 390);
    draw.drawGrassTuft(k, 90, 430);
    if (tone === "high") {
      draw.drawCrow(k, 200, 120);
      draw.drawCrow(k, 420, 95);
      draw.drawDeadTree(k, 90, 340);
    }

    // Hero convoy — scaled 1.15x, dropped 20px
    const WAGON_X = 300;
    const WAGON_Y = 380;   // was 360 in v1
    const wagon = draw.drawWagon(k, WAGON_X, WAGON_Y, { scale: 1.15 });

    // Wagon drop shadow (anchors the hero)
    k.add([
      draw.ellipseRect(k, 160, 14),
      k.pos(WAGON_X, WAGON_Y + 42),
      k.color(...draw.PALETTE.dropShadow),
      k.opacity(0.4),
      k.anchor("center"),
    ]);

    draw.drawOx(k, WAGON_X - 155, WAGON_Y + 15);   // scaled 1.4× inside drawOx
    draw.drawOx(k, WAGON_X - 215, WAGON_Y + 15);
    const pioneers = [
      draw.drawPioneer(k, WAGON_X + 70, WAGON_Y + 22, { hat: "felt" }),
      draw.drawPioneer(k, WAGON_X - 90, WAGON_Y + 24, { hat: "bonnet" }),
    ];

    // Yoke
    k.add([k.rect(60, 3), k.pos(WAGON_X - 230, WAGON_Y - 2), k.color(...draw.PALETTE.outline)]);

    // ── HUDs ──
    const top = addTopHud(k, engine);
    const bottom = addBottomHud(k, engine);

    // ── Tone-tier overlay (commit 3) ──
    applyToneOverlay(k, tone);

    // ── Animation loop ──
    let walkPhase = 0;
    k.onUpdate(() => {
      if (paused) return;

      // Parallax
      for (const c of sky.clouds) { c.pos.x -= 0.15; if (c.pos.x < -100) c.pos.x = 700; }
      for (const h of hills.far)  { h.pos.x -= 0.2;  if (h.pos.x < -80)  h.pos.x = 720; }
      for (const h of hills.near) { h.pos.x -= 0.4;  if (h.pos.x < -60)  h.pos.x = 700; }

      // Wheel rotation (works because wheels are GROUPS with rotate component)
      for (const w of wagon.wheels) w.angle += 3;

      // Walking bob (pioneers sinewave y-offset)
      walkPhase += 0.15;
      for (const p of pioneers) p.pos.y = p.baseY + Math.sin(walkPhase + p.phase) * 1.5;
    });

    // ── Weather FX (preserved, palette-synced) ──
    const miles = engine.milesTraveled ?? 0;
    const weather = miles > 1200 ? (Math.random() > 0.5 ? "snow" : "clear")
                  : miles > 600  ? (Math.random() > 0.5 ? "dust" : "clear")
                  :                 (Math.random() > 0.7 ? "rain" : "clear");

    if (weather === "rain") {
      loops.push(k.loop(0.05, () => {
        if (paused) return;
        const drop = k.add([k.rect(1, 8), k.pos(Math.random() * 640, -10), k.color(96, 120, 180), k.opacity(0.6), k.z(40)]);
        drop.onUpdate(() => { drop.pos.y += 6; drop.pos.x -= 0.5; if (drop.pos.y > 480) drop.destroy(); });
      }));
    } else if (weather === "snow") {
      loops.push(k.loop(0.1, () => {
        if (paused) return;
        const flake = k.add([k.circle(2), k.pos(Math.random() * 640, -10), k.color(248, 248, 255), k.opacity(0.7), k.z(40)]);
        flake.onUpdate(() => { flake.pos.y += 1.5; flake.pos.x += Math.sin(k.time() * 3 + flake.pos.y * 0.1) * 0.5; if (flake.pos.y > 480) flake.destroy(); });
      }));
    } else if (weather === "dust") {
      loops.push(k.loop(0.08, () => {
        if (paused) return;
        const p = k.add([k.circle(2), k.pos(660, 250 + Math.random() * 200), k.color(...draw.PALETTE.dirtLight), k.opacity(0.4), k.z(40)]);
        p.onUpdate(() => { p.pos.x -= 3; p.pos.y += Math.sin(k.time() * 2) * 0.3; p.opacity -= 0.003; if (p.pos.x < -20 || p.opacity <= 0) p.destroy(); });
      }));
    }

    // ── Floating text ──
    function showFloatingText(msg) {
      const ft = k.add([k.text(msg, { size: 12, width: 400 }), k.pos(320, 440), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.opacity(1), k.z(60)]);
      ft.onUpdate(() => { ft.pos.y -= 0.3; ft.opacity -= 0.008; if (ft.opacity <= 0) ft.destroy(); });
    }

    // ── Engine handlers ──
    engineOn("daysAdvanced", ({ summaries }) => {
      updateHud(k, engine, top, bottom);
      for (const s of summaries) {
        for (const evt of (s.events ?? [])) {
          if (evt.text || evt.description) showFloatingText(evt.text || evt.description);
        }
      }
    });
    engineOn("error", ({ message }) => showFloatingText("Error: " + message));

    // ── Pause (full body preserved) ──
    let pauseOverlay = null;
    function togglePause() {
      paused = !paused;
      if (paused) {
        engine.pauseAdvance();
        pauseOverlay = k.add([k.rect(640, 480), k.pos(0, 0), k.color(0, 0, 0), k.opacity(0.7), k.z(100)]);
        k.add([k.text("PAUSED", { size: 36 }), k.pos(320, 180), k.anchor("center"), k.color(...draw.PALETTE.gold), k.z(101), "pauseTag"]);
        const party = engine.party;
        const sup2 = engine.supplies;
        const statsLines = [
          `Date: ${engine.formatDate(engine.currentDate)}`,
          `Miles: ${engine.milesTraveled} / 1764`,
          `Food: ${sup2?.food ?? 0} lbs`,
          `Oxen: ${sup2?.oxen ?? 0}`,
          `Money: ${engine.formatMoney(sup2?.money ?? 0)}`,
          "",
          "Party:",
          ...(party?.members ?? []).map(m => `  ${m.name}: ${m.alive ? m.health + "/100" : "DEAD"}`),
          "",
          "Press P to resume",
        ];
        k.add([k.text(statsLines.join("\n"), { size: 13, width: 400 }), k.pos(320, 240), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.z(101), "pauseTag"]);
      } else {
        engine.resumeAdvance();
        k.get("pauseTag").forEach(obj => obj.destroy());
        if (pauseOverlay) { pauseOverlay.destroy(); pauseOverlay = null; }
        engine.advance();
      }
    }
    k.onKeyPress("p", togglePause);
    // Mobile-friendly pause: tap top-left corner (fixes "pause inaccessible on mobile")
    k.onClick(() => { if (k.mousePos().x < 100 && k.mousePos().y < 60) togglePause(); });

    engine.resumeAdvance();
    engine.advance();
  });
}

function getDayPhase(dateStr) {
  // Based on in-game date, return "dawn" | "day" | "dusk" | "night"
  // Simple: cycle through based on day count
  if (!dateStr) return "day";
  const d = new Date(dateStr).getDate();
  return ["dawn", "day", "day", "dusk"][d % 4];
}
```

---

## § 4. Commit 3 — Tone overlay + `engine.tone` getter

### `public/lib/tone.mjs`

```js
import { PALETTE } from "./draw.mjs";

export function applyToneOverlay(k, tone) {
  if (tone === "low") {
    // Brighter — just add a thin warm lift
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(255, 240, 200), k.opacity(0.08), k.z(90), k.fixed()]);
  } else if (tone === "high") {
    // Desaturate + cool shift + vignette + subtle pulse
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(30, 15, 40), k.opacity(0.25), k.z(90), k.fixed()]);
    // Vignette — 4 rects + central circle mask
    for (const [x, y, w, h] of [[0, 0, 640, 60], [0, 420, 640, 60], [0, 0, 60, 480], [580, 0, 60, 480]]) {
      k.add([k.rect(w, h), k.pos(x, y), k.color(10, 5, 15), k.opacity(0.5), k.z(91), k.fixed()]);
    }
  }
  // "medium" = no overlay
}
```

### `public/engine.js` — add getter (5 lines)

```js
// Add near existing state getters
get tone() {
  return this.gameState?.simulation?.tone ?? "medium";
}
```

Also: scan `engine.js` for any `health: "good"` / `"fair"` / `"poor"` string-writing — confirm it's purely consumer-side defensive (per types.ts: health is numeric). Delete any write-side string emission if present (unlikely, since worker types are authoritative).

---

## § 5. Commit 4 — Propagate HUD

### `public/scenes/event.js` + `landmark.js` — 10-line touch each

```js
import { addTopHud, addBottomHud } from "../lib/hud.mjs";
// In the scene() callback, after existing rendering, add:
addTopHud(k, engine);
addBottomHud(k, engine);
// Existing event/landmark-specific UI renders ABOVE the HUD (z > 60)
```

This guarantees HUD consistency across the three most-seen scenes on day 1.

---

## § 6. Smoke Test (real — uses the existing browse binary)

We already verified the browse binary works (`mockups/primitive-v3.png` was captured with it). The smoke is a shell script, not Node-land fiction.

### `scripts/smoke-travel.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Assume dev server is already running. Caller sets PORT (default 8765).
PORT="${PORT:-8765}"
URL="http://localhost:${PORT}/"

B="$HOME/.claude/skills/gstack/browse/dist/browse"

$B goto "$URL" >/dev/null
sleep 3
$B js "window.__testHook?.()" >/dev/null 2>&1 || true

# Count GameObjs via window.k (exposed in main.js):
OBJCOUNT=$($B js "window.k?.get('*')?.length ?? 0" 2>/dev/null | tail -1)
ERRORS=$($B js "(window.__ERRORS || []).length" 2>/dev/null | tail -1)

if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: ${ERRORS} JS errors"
  $B js "JSON.stringify(window.__ERRORS)"
  exit 1
fi

if [ "$OBJCOUNT" -lt 40 ]; then
  echo "FAIL: scene has only $OBJCOUNT GameObjs (expected >=40)"
  exit 1
fi

$B screenshot "mockups/smoke-travel.png" >/dev/null
echo "PASS: ${OBJCOUNT} objects, 0 errors, screenshot saved."
```

Required implementation touch: `public/main.js` adds 2 lines (window.__ERRORS capture, same pattern as `mockups/primitive-mockup.html`). `public/main.js` already exposes `window.k`. 0 new dependencies.

Run via: `npx serve public -p 8765 & sleep 1 && bash scripts/smoke-travel.sh`

Not wired to CI but acts as a manual pre-commit check.

---

## § 7. Acceptance Gate

Before merging:

- [ ] `npx vitest run` → 119 tests pass (worker untouched)
- [ ] `bash scripts/smoke-travel.sh` → exits 0 (no JS errors, ≥40 GameObjs, screenshot saved)
- [ ] Manual: open `/` on desktop → travel scene renders, wheels rotate, pioneers walk-bob, clouds drift
- [ ] Manual: open `/` on iPhone SE (DevTools) → HUD labels readable, party health icons visible, bottom HUD fits viewport
- [ ] Manual: toggle tone selector → Low/Medium/High visibly differ (warm vs neutral vs desaturated+vignette)
- [ ] Manual: navigate to event + landmark scenes → HUD persists with consistent styling
- [ ] Manual: mobile pause accessible via top-left tap (touch-alternative to P key)
- [ ] Manual: party with 5 members → all 5 health icons show, last icon isn't clipped by panel edge
- [ ] Manual: rename `_placeholder.png` → site still works (not applicable — no sprites yet)
- [ ] 4 separate commits, each builds + runs standalone; `git revert` of any single commit still leaves site functional

---

## § 8. What v2 still defers (explicit)

- **Peaberry bitmap font** — system sans-serif is fine for v1. Font swap is a 5-line change later.
- **Settings menu** (colorblind/reduced-motion sliders) — follow-on PR.
- **Other 13 scenes** (store, river, hunting, etc.) — follow-on PRs with the same draw.mjs. Current travel + event + landmark cover the three most-seen scenes.
- **Hero AI sprite assets** — if we commission wagon.png later, `drawWagon` gets a sprite-fallback branch. Not in scope now.
- **`prefers-reduced-motion` media query guard** — stub constant `MOTION_OK = true` in draw.mjs; wrap wheel rotation + cloud scroll + walk bob with `if (MOTION_OK)`. 3 lines. Include it in commit 2.

---

## § 9. Rollback

All 4 commits are independently revertable. Commit messages must include `DEPENDS ON:` headers:

- Commit 2 `DEPENDS ON: commit-1-sha`
- Commit 3 `DEPENDS ON: commit-2-sha`
- Commit 4 `DEPENDS ON: commit-2-sha`

If commit 2 needs reverting, also revert commits 3 and 4 (or accept broken state until re-rolled forward).

Full-scene rollback: `git tag pre-primitive-v2` before commit 1 lands. Revert path: `git revert <sha>..<sha>` or just `git reset --hard pre-primitive-v2` if the branch isn't pushed yet.

---

## Summary

- Closed all 16 findings (8 eng + 8 design)
- Tone-tier overlay is IN SCOPE (addresses critical design gap #1)
- Wheel rotation correct (Kaplay rotate component)
- Mobile readability via UI_SCALE + 10px minimum labels
- Painterly lift via `addHighlights` helper (deterministic, per-asset seed)
- Walking animation, time-of-day sky, landmark ticks on progress bar
- HUD propagates to event + landmark scenes in same PR family
- Real smoke test using existing browse binary
- Primitive health icons — zero Unicode dependency
- All engine contracts (pause, weather FX, listener cleanup, daysAdvanced handler) preserved verbatim
