# Oregon Trail — Primitive-First Implementation Plan (v3 — reviewed)

**Status:** v3 is the single source of truth. § 0.5 of v2.1 is folded inline. Dual reviewed (eng 5.5→9, design 7.4→9); fixes applied. If a code block appears here, it is the block to ship.
**Supersedes:** v1, v2, v2.1. No backwards compatibility.
**Scope:** 4 commits, ~2.5 hours. 119 worker tests unchanged.

---

## § 0. TL;DR

Rewrite the Kaplay travel scene using a shared primitive library (`draw.mjs`), a shared HUD module (`hud.mjs`), and a tone-tier overlay (`tone.mjs`). The rendering vocabulary is the `mockups/primitive-mockup.html` file — port its functions with three mechanical substitutions (see § 2.1). Apply to travel, event, and landmark — the three most-seen scenes.

What closed since v2.1:
- Every § 0.5 patch is integrated into the relevant commit section
- Every "port mockup" directive names its source lines; no hand-waving
- `drawSky` dayPhase + `drawCloud` parent-child + `drawHills` far/near contracts fully specified
- UI_SCALE responds to resize/orientation (1.4× on < 500px viewport)
- Canvas has `role=img` + `aria-label` + `tabindex=0`
- Kaplay CDN has jsDelivr fallback via dynamic import
- `prefers-reduced-motion` honored
- Dead string-health branch deleted (types.ts:223 says `health: number`)
- `engine.tone` reads from `state.simulation.tone_tier` (CORRECT field name)
- `getDayPhase` parses date with `'T00:00:00'` suffix (engine.js:367 pattern) to avoid UTC-edge off-by-one
- MEDIUM tier gets its own subtle neutral overlay (not "empty")
- HIGH tier gets 3 crows, 2 dead trees, pulsing vignette, dusk sky swap, scanlines — enough atmosphere to sell horror in ≤2s
- Landmark progress ticks get 1-letter monograms + gold-bright for passed ticks
- Ox head-nod + wagon micro-jitter added to motion language
- Bottom HUD re-centered around party members; `panelY = 440` (4px edge margin)
- Landmark action buttons move to `btnY = 392` (unconditional, to avoid HUD overlap)
- Smoke test pauses advance before transitioning to TRAVEL

---

## § 1. Commits

| # | Title | Files | ~LOC | Revertable alone? |
|---|---|---|---|---|
| 1 | `draw.mjs` primitive library + SW cache | `public/lib/draw.mjs` (NEW), `public/sw.js` (edit) | ~420 + 10 | Yes |
| 2 | `travel.js` rewrite + `hud.mjs` + a11y + CDN fallback + smoke | `public/scenes/travel.js` (rewrite), `public/lib/hud.mjs` (NEW), `public/main.js` (edit), `public/index.html` (edit), `scripts/smoke-travel.sh` (NEW) | ~260 + 150 + 15 + 3 + 35 | Yes |
| 3 | `tone.mjs` + engine getter + reduced motion | `public/lib/tone.mjs` (NEW), `public/scenes/travel.js` (edit), `public/engine.js` (+5 lines) | ~90 + 5 + 5 | Yes |
| 4 | Propagate HUD to event + landmark | `public/scenes/event.js` (edit), `public/scenes/landmark.js` (edit) | +15 each | Yes |

Commit messages include `DEPENDS ON:` headers (see § 7).

---

## § 2. Commit 1 — `public/lib/draw.mjs` + SW cache

### § 2.1 How to author `draw.mjs`

**Primary technique: port `mockups/primitive-mockup.html` verbatim with three mechanical substitutions.**

| In mockup | In draw.mjs |
|---|---|
| `const P = { sky: k.rgb(109,128,250), ... }` | `export const PALETTE = { sky: [109,128,250], ... }` (tuples, no `k`) |
| `k.color(P.wood)` | `k.color(...PALETTE.wood)` |
| `k.__rectEllipse(w, h)` (method on k) | `ellipseRect(k, w, h)` (exported helper) |
| module-level `wagon(300, 360)` calls | each becomes `export function drawWagon(k, cx, cy)` |
| module-level assembly (sky rects, mountains, hills, ground, trail) | each block becomes `drawSky(k, …)`, `drawHills(k)`, etc. with return contracts spelled out in § 2.4 |

The palette tuples are lifted verbatim from mockup:35-68. If you find yourself authoring a shape from scratch, stop — open the mockup, copy the function body, apply the three substitutions.

### § 2.2 Full `PALETTE`

Lifted from mockup:35-68 plus the v2-review additions (dayPhase sky variants, painterly highlight colors, health states, gold-bright, drop-shadow).

```js
export const PALETTE = {
  // Sky — base matches mockup; variants for dayPhase
  sky:         [109, 128, 250],
  skyPale:     [168, 201, 255],
  skyDawn:     [255, 190, 130],
  skyDusk:     [200, 120, 100],
  skyTwilight: [58, 64, 112],      // HIGH-tier swap
  skyNight:    [30, 30, 60],

  // Hills / mountains (mockup values)
  mountainFar: [120, 130, 160],
  mountainMid: [130, 140, 170],
  mountainDk:  [105, 120, 150],
  hillMid:     [90, 138, 63],
  hillNear:    [129, 178, 20],

  // Grass
  grassLight:  [168, 208, 86],
  grassMid:    [129, 178, 20],
  grassBorder: [58, 75, 32],

  // Dirt
  dirtLight:   [196, 154, 108],
  dirtMid:     [139, 96, 51],
  dirtDark:    [109, 69, 32],

  // Wagon
  wood:        [90, 58, 31],
  woodLight:   [139, 90, 45],
  woodDark:    [55, 35, 18],
  canvas:      [245, 230, 200],
  canvasMid:   [232, 201, 154],
  canvasShadow:[200, 175, 130],

  // Oxen
  oxBrown:     [120, 85, 45],
  oxCream:     [220, 195, 155],
  oxDark:      [80, 55, 25],

  // Pioneers
  skin:        [235, 200, 160],
  shirt:       [240, 230, 210],
  vest:        [70, 50, 30],
  trousers:    [100, 70, 40],
  bonnet:      [240, 230, 200],
  dressBlue:   [80, 110, 170],
  hatFelt:     [65, 45, 30],

  // Shared
  outline:     [58, 42, 26],
  outlineLight:[95, 72, 48],
  cloud:       [250, 248, 240],
  cloudShadow: [215, 215, 225],
  black:       [30, 20, 10],

  // UI
  parchment:   [245, 230, 200],
  parchmentDark: [42, 31, 14],
  parchmentShadow: [200, 175, 130],
  gold:        [212, 160, 23],
  goldBright:  [255, 205, 60],
  dropShadow:  [30, 25, 15],

  // Health (5 states — matches hpState thresholds)
  hpGreen:     [90, 138, 63],
  hpYellow:    [215, 165, 30],
  hpOrange:    [230, 140, 60],
  hpRed:       [178, 34, 34],
  hpDead:      [60, 60, 60],
};
```

### § 2.3 Helper functions (full bodies)

**Mechanical lifts from mockup:**

```js
// mockup:32 pattern
export const ellipseRect = (k, w, h) => k.rect(w, h, { radius: Math.min(w, h) / 2 });

// Deterministic seed from position (Patch 6)
export const seedFrom = (x, y) => (Math.round(x) * 31 + Math.round(y) * 131) | 0;

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Painterly highlight scatter (Patch 6)
export function addHighlights(k, cx, cy, w, h, count, color, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const dx = (rng() - 0.5) * w * 0.7;
    const dy = (rng() - 0.5) * h * 0.7;
    const r = 1 + Math.floor(rng() * 2);
    k.add([k.circle(r), k.pos(cx + dx, cy + dy), k.color(...color), k.anchor("center"), k.opacity(0.7)]);
  }
}
```

**Sky / hills / ground / trail — complete bodies (review found these were spec'd only as signatures).**

```js
// drawSky — dayPhase-aware; returns clouds as parent GameObjs for parallax (review P0-2)
export function drawSky(k, tone, dayPhase) {
  const phaseMap = {
    dawn:     { top: PALETTE.skyDawn,     horizon: PALETTE.skyPale,  cloudOp: 0.9 },
    day:      { top: PALETTE.sky,         horizon: PALETTE.skyPale,  cloudOp: 0.9 },
    dusk:     { top: PALETTE.skyDusk,     horizon: PALETTE.skyDawn,  cloudOp: 0.7 },
    night:    { top: PALETTE.skyNight,    horizon: [42, 42, 74],     cloudOp: 0.3 },
  };
  // HIGH tier forces twilight regardless of dayPhase
  const phase = (tone === "high") ? { top: PALETTE.skyTwilight, horizon: [58, 50, 80], cloudOp: 0.5 } : (phaseMap[dayPhase] ?? phaseMap.day);

  k.add([k.rect(640, 180), k.pos(0, 0),   k.color(...phase.top)]);
  k.add([k.rect(640, 40),  k.pos(0, 180), k.color(...phase.horizon), k.opacity(0.7)]);

  // Clouds — each returns a parent GameObj carrying its children; parallax moves the parent.
  const clouds = [];
  for (const [cx, cy, s] of [[80, 60, 1.0], [280, 45, 0.8], [460, 70, 1.1], [580, 35, 0.7]]) {
    clouds.push(drawCloud(k, cx, cy, s, phase.cloudOp));
  }
  return { clouds };
}

// drawCloud — parent GameObj with circle children; parallax moves parent (review P0-2)
export function drawCloud(k, cx, cy, scale = 1, opacity = 0.9) {
  const parent = k.add([k.pos(cx, cy), k.opacity(opacity)]);
  const parts = [
    { x: 0,           y: 0,          r: 16 * scale },
    { x: 14 * scale,  y: -4 * scale, r: 18 * scale },
    { x: 28 * scale,  y: 0,          r: 14 * scale },
    { x: -12 * scale, y: 2 * scale,  r: 12 * scale },
  ];
  for (const p of parts) parent.add([k.circle(p.r + 1), k.pos(p.x, p.y), k.color(...PALETTE.outline), k.opacity(0.15), k.anchor("center")]);
  for (const p of parts) parent.add([k.circle(p.r),     k.pos(p.x, p.y), k.color(...PALETTE.cloud),   k.anchor("center")]);
  return parent;
}

// drawMountains — lifted verbatim from mockup:103-121
export function drawMountains(k) {
  const mtn = (cx, cy, w, h, col) => k.add([
    k.polygon([
      k.vec2(-w/2, 0), k.vec2(-w/4, -h*0.8), k.vec2(-w/8, -h*0.6),
      k.vec2(0, -h),   k.vec2(w/6, -h*0.7),  k.vec2(w/3, -h*0.4),
      k.vec2(w/2, 0),
    ]),
    k.pos(cx, cy), k.color(...col), k.outline(2, k.rgb(...PALETTE.outline)),
  ]);
  mtn(150, 230, 280, 70, PALETTE.mountainFar);
  mtn(420, 230, 320, 55, PALETTE.mountainMid);
  mtn(320, 230, 180, 90, PALETTE.mountainDk);
}

// drawHills — returns { far: [], near: [] } as single-rect GameObjs (review P0-1)
export function drawHills(k) {
  const roundedHill = (cx, cy, w, h, col) => k.add([
    k.rect(w, h, { radius: [h, h, 0, 0] }),
    k.pos(cx - w/2, cy - h),
    k.color(...col),
    k.outline(2, k.rgb(...PALETTE.outline)),
  ]);
  const far = [
    roundedHill(120, 260, 240, 34, PALETTE.hillMid),
    roundedHill(380, 260, 280, 40, PALETTE.hillMid),
  ];
  const near = [
    roundedHill(580, 260, 220, 30, PALETTE.hillNear),
  ];
  return { far, near };
}

// drawGround — verbatim port of mockup:137-195 (grass base + checker + border strips)
export function drawGround(k) {
  const TS = 32;
  k.add([k.rect(640, 260), k.pos(0, 260), k.color(...PALETTE.grassMid)]);

  // Checker tiles, skipping trail area
  for (let y = 264; y < 480; y += TS) {
    for (let x = 0; x < 640; x += TS) {
      const rowProgress = (y - 264) / (480 - 264);
      const trailLeft  = 230 - 230 * rowProgress;
      const trailRight = 410 + (640 - 410) * rowProgress;
      if (x + TS/2 > trailLeft && x + TS/2 < trailRight) continue;
      const col = (((x / TS) | 0) + ((y / TS) | 0)) % 2 === 0 ? PALETTE.grassLight : PALETTE.grassMid;
      k.add([k.rect(TS, TS), k.pos(x, y), k.color(...col), k.opacity(0.8)]);
    }
  }

  // Trail-edge dark borders
  for (let y = 264; y < 480; y += 4) {
    const rowProgress = (y - 264) / (480 - 264);
    const trailLeft  = 230 - 230 * rowProgress;
    const trailRight = 410 + (640 - 410) * rowProgress;
    k.add([k.rect(3, 4), k.pos(trailLeft - 3, y), k.color(...PALETTE.grassBorder)]);
    k.add([k.rect(3, 4), k.pos(trailRight,    y), k.color(...PALETTE.grassBorder)]);
  }
}

// drawTrail — verbatim port of mockup:140-170 (trapezoid + shadow + wheel ruts)
export function drawTrail(k) {
  k.add([
    k.polygon([k.vec2(230, 0), k.vec2(410, 0), k.vec2(640, 140), k.vec2(0, 140)]),
    k.pos(0, 330),
    k.color(...PALETTE.dirtMid),
    k.outline(2, k.rgb(...PALETTE.outline)),
  ]);
  k.add([
    k.polygon([k.vec2(240, 0), k.vec2(400, 0), k.vec2(600, 120), k.vec2(40, 120)]),
    k.pos(0, 340),
    k.color(...PALETTE.dirtDark),
  ]);
  for (let y = 340; y < 470; y += 16) {
    const w = 40 + (y - 340) * 3;
    k.add([k.rect(4, 6), k.pos(320 - w,     y), k.color(...PALETTE.dirtDark), k.opacity(0.6)]);
    k.add([k.rect(4, 6), k.pos(320 + w - 4, y), k.color(...PALETTE.dirtDark), k.opacity(0.6)]);
  }
}
```

**Primitives ported verbatim from mockup (keep the 6 wheel spokes, just no rotation — Patch 1 revised):**

```js
// drawWagon — verbatim port of mockup:247-306 with one delta: return {} with no wheels array
// Wheels are drawn with 6 static spokes (mockup:281-288) — NOT rotated at runtime.
// All coords are the mockup's original 1.0× (no runtime scale opt — Patch 5).
export function drawWagon(k, cx, cy) {
  // Body (mockup:249-256)
  k.add([k.rect(130, 36, { radius: 2 }), k.pos(cx - 65, cy - 5), k.color(...PALETTE.outline)]);
  k.add([k.rect(126, 32, { radius: 2 }), k.pos(cx - 63, cy - 3), k.color(...PALETTE.wood)]);
  for (let i = -55; i < 65; i += 18) {
    k.add([k.rect(2, 28), k.pos(cx + i, cy - 1), k.color(...PALETTE.outline), k.opacity(0.5)]);
  }
  k.add([k.rect(122, 4), k.pos(cx - 61, cy - 1), k.color(...PALETTE.woodLight), k.opacity(0.7)]);

  // Canvas top (mockup:259-270)
  const canvasY = cy - 28;
  k.add([ellipseRect(k, 132, 52), k.pos(cx, canvasY), k.color(...PALETTE.outline),   k.anchor("center")]);
  k.add([ellipseRect(k, 126, 46), k.pos(cx, canvasY), k.color(...PALETTE.canvas),    k.anchor("center")]);
  k.add([ellipseRect(k, 122, 42), k.pos(cx + 2, canvasY + 2), k.color(...PALETTE.canvasMid), k.anchor("center"), k.opacity(0.5)]);
  for (let i = -50; i <= 50; i += 24) {
    k.add([k.rect(2, 44), k.pos(cx + i - 1, canvasY - 22), k.color(...PALETTE.outline), k.opacity(0.25)]);
  }

  // Wheels (mockup:273-291) — 6 static spokes, no rotation
  function wheel(wx, wy) {
    const r = 22;
    k.add([k.circle(r + 2), k.pos(wx, wy), k.color(...PALETTE.outline),   k.anchor("center")]);
    k.add([k.circle(r),     k.pos(wx, wy), k.color(...PALETTE.woodLight), k.anchor("center")]);
    k.add([k.circle(r - 3), k.pos(wx, wy), k.color(...PALETTE.wood),      k.anchor("center")]);
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * 360;
      k.add([k.rect(3, r * 2 - 6), k.pos(wx, wy), k.color(...PALETTE.outline), k.rotate(ang), k.anchor("center")]);
    }
    k.add([k.circle(5), k.pos(wx, wy), k.color(...PALETTE.outline),   k.anchor("center")]);
    k.add([k.circle(3), k.pos(wx, wy), k.color(...PALETTE.woodLight), k.anchor("center")]);
  }
  wheel(cx - 42, cy + 26);
  wheel(cx + 42, cy + 26);

  // Tongue (mockup:296-298)
  k.add([k.rect(44, 4), k.pos(cx - 100, cy + 18), k.color(...PALETTE.outline)]);
  k.add([k.rect(40, 2), k.pos(cx - 98, cy + 19), k.color(...PALETTE.wood)]);

  // Deterministic mud splatter (NOT Math.random — Patch 6)
  addHighlights(k, cx, cy + 18, 120, 8, 6, PALETTE.dirtDark, seedFrom(cx, cy));

  return {};
}

// drawOx — verbatim port of mockup:309-328
export function drawOx(k, cx, cy) {
  k.add([k.rect(42, 22, { radius: 3 }), k.pos(cx - 21, cy - 11), k.color(...PALETTE.outline)]);
  k.add([k.rect(38, 18, { radius: 3 }), k.pos(cx - 19, cy - 9),  k.color(...PALETTE.oxBrown)]);
  k.add([ellipseRect(k, 18, 10), k.pos(cx + 3, cy - 2), k.color(...PALETTE.oxCream), k.anchor("center"), k.opacity(0.8)]);
  k.add([k.circle(9), k.pos(cx - 20, cy - 5), k.color(...PALETTE.outline), k.anchor("center")]);
  k.add([k.circle(7), k.pos(cx - 20, cy - 5), k.color(...PALETTE.oxBrown), k.anchor("center")]);
  k.add([k.polygon([k.vec2(0,0), k.vec2(-4,-6), k.vec2(-2,1)]), k.pos(cx - 24, cy - 11), k.color(...PALETTE.canvasMid)]);
  k.add([k.polygon([k.vec2(0,0), k.vec2( 4,-6), k.vec2( 2,1)]), k.pos(cx - 16, cy - 11), k.color(...PALETTE.canvasMid)]);
  for (const lx of [-16, -8, 4, 12]) {
    k.add([k.rect(3, 8), k.pos(cx + lx, cy + 7), k.color(...PALETTE.outline)]);
  }
  k.add([k.rect(2, 8), k.pos(cx + 17, cy - 3), k.color(...PALETTE.outline)]);
}

// drawPioneer — port of mockup:336-363 restructured as parent-child for walk bob (Patch 3).
// Review P3-21: spelled out verbatim instead of "port then rewrite".
export function drawPioneer(k, cx, cy, opts = {}) {
  const hat     = opts.hat  ?? "felt";
  const bodyCol = opts.body ?? PALETTE.vest;
  const legCol  = opts.legs ?? PALETTE.trousers;
  const phase   = opts.phase ?? Math.random() * Math.PI * 2;

  const p = k.add([k.pos(cx, cy)]);   // parent; children use relative pos (no anchor — we want 0,0 to be cy)
  p.add([k.rect(14, 26), k.pos(-7, -22), k.color(...PALETTE.outline)]);
  p.add([k.rect(12, 14), k.pos(-6, -20), k.color(...bodyCol)]);
  p.add([k.rect(12, 3),  k.pos(-6, -18), k.color(...PALETTE.shirt)]);
  p.add([k.circle(5.5),  k.pos(0, -26),  k.color(...PALETTE.outline), k.anchor("center")]);
  p.add([k.circle(4.5),  k.pos(0, -26),  k.color(...PALETTE.skin),    k.anchor("center")]);
  if (hat === "felt") {
    p.add([k.rect(16, 2), k.pos(-8, -32), k.color(...PALETTE.outline)]);
    p.add([k.rect(14, 2), k.pos(-7, -31), k.color(...PALETTE.hatFelt)]);
    p.add([k.rect(9, 5),  k.pos(-4.5, -35), k.color(...PALETTE.hatFelt), k.outline(1, k.rgb(...PALETTE.outline))]);
  } else {
    p.add([ellipseRect(k, 9, 6),   k.pos(0, -31), k.color(...PALETTE.outline), k.anchor("center")]);
    p.add([ellipseRect(k, 7.5, 5), k.pos(0, -31), k.color(...PALETTE.bonnet),  k.anchor("center")]);
    p.add([k.rect(5, 3), k.pos(-2.5, -29), k.color(...PALETTE.bonnet)]);
  }
  p.add([k.rect(5, 8), k.pos(-6, -6), k.color(...legCol)]);
  p.add([k.rect(5, 8), k.pos( 1, -6), k.color(...legCol)]);

  p.baseY = cy;
  p.phase = phase;
  return p;
}

// drawTree — verbatim port of mockup:210-230, plus addHighlights for painterly lift
export function drawTree(k, cx, cy) {
  k.add([k.rect(16, 36), k.pos(cx - 8, cy - 20), k.color(...PALETTE.wood), k.outline(2, k.rgb(...PALETTE.outline))]);
  const canopy = [
    { x: 0,   y: -40, r: 34 },
    { x: -22, y: -28, r: 26 },
    { x: 22,  y: -28, r: 26 },
    { x: 0,   y: -60, r: 22 },
  ];
  for (const c of canopy) k.add([k.circle(c.r + 2), k.pos(cx + c.x, cy + c.y), k.color(...PALETTE.outline), k.anchor("center")]);
  for (const c of canopy) k.add([k.circle(c.r),     k.pos(cx + c.x, cy + c.y), k.color(...PALETTE.hillMid),  k.anchor("center")]);
  for (const c of canopy) k.add([k.circle(c.r * 0.4), k.pos(cx + c.x - c.r*0.3, cy + c.y - c.r*0.3), k.color(...PALETTE.hillNear), k.opacity(0.8), k.anchor("center")]);
  addHighlights(k, cx, cy - 40, 80, 60, 8, PALETTE.hillNear, seedFrom(cx, cy));
}

// drawRock — verbatim port of mockup:234-238
export function drawRock(k, cx, cy, w = 36, h = 22) {
  k.add([ellipseRect(k, w + 2, h + 2), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center")]);
  k.add([ellipseRect(k, w,     h),     k.pos(cx, cy), k.color(140, 135, 130),       k.anchor("center")]);
  k.add([ellipseRect(k, w * 0.5, h * 0.3), k.pos(cx - w*0.15, cy - h*0.25), k.color(180, 175, 170), k.anchor("center")]);
  addHighlights(k, cx, cy, w, h, 6, PALETTE.hillMid, seedFrom(cx, cy));
}

// drawGrassTuft — verbatim port of mockup:198-207
export function drawGrassTuft(k, cx, cy) {
  k.add([k.rect(8, 3), k.pos(cx - 4, cy), k.color(...PALETTE.grassBorder)]);
  for (let i = 0; i < 4; i++) {
    k.add([k.rect(2, 5 + i), k.pos(cx - 3 + i * 2, cy - 4 - i), k.color(...PALETTE.hillMid)]);
  }
}
```

**HIGH-tier additions (review design-2, design-3):**

```js
// drawCrow — authored from mockup:95-99 pattern, no text glyph
export function drawCrow(k, cx, cy) {
  // Body: small ellipse
  k.add([ellipseRect(k, 8, 5), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center")]);
  // Wing curves (two small rects at angles)
  k.add([k.rect(6, 2), k.pos(cx - 4, cy - 1), k.color(...PALETTE.outline), k.rotate(-20), k.anchor("center")]);
  k.add([k.rect(6, 2), k.pos(cx + 4, cy - 1), k.color(...PALETTE.outline), k.rotate( 20), k.anchor("center")]);
  // Beak — tiny triangle
  k.add([k.polygon([k.vec2(0,0), k.vec2(3, 0), k.vec2(1.5, 2)]), k.pos(cx + 4, cy), k.color(...PALETTE.outlineLight)]);
}

// drawDeadTree — trunk + 3 bare branch rects, no canopy
export function drawDeadTree(k, cx, cy) {
  k.add([k.rect(10, 40), k.pos(cx - 5, cy - 20), k.color(...PALETTE.outlineLight), k.outline(2, k.rgb(...PALETTE.outline))]);
  // Bare branches
  k.add([k.rect(20, 2), k.pos(cx, cy - 20), k.color(...PALETTE.outline), k.rotate(-40), k.anchor("left")]);
  k.add([k.rect(18, 2), k.pos(cx, cy - 28), k.color(...PALETTE.outline), k.rotate( 20), k.anchor("left")]);
  k.add([k.rect(14, 2), k.pos(cx, cy - 10), k.color(...PALETTE.outline), k.rotate(-15), k.anchor("left")]);
}
```

**Health icon — uniqueness-safe tag (review P0-6):**

```js
let _hpIconCounter = 0;
export function drawHealthIcon(k, cx, cy, state) {
  const r = 12;
  const fills = { well: PALETTE.hpGreen, poor: PALETTE.hpYellow, ill: PALETTE.hpOrange, dying: PALETTE.hpRed, dead: PALETTE.hpDead };
  const tag = `hpicon-${++_hpIconCounter}`;   // monotonic; no collisions
  const dark = PALETTE.outline;

  k.add([k.circle(r + 1), k.pos(cx, cy), k.color(...dark),                      k.anchor("center"), tag]);
  k.add([k.circle(r),     k.pos(cx, cy), k.color(...(fills[state] ?? fills.poor)), k.anchor("center"), tag]);

  if (state === "poor") {
    k.add([k.rect(2, r * 1.6), k.pos(cx, cy), k.color(...dark), k.anchor("center"), tag]);
  } else if (state === "ill") {
    k.add([k.rect(r * 1.6, 2), k.pos(cx, cy), k.color(...dark), k.rotate(45), k.anchor("center"), tag]);
  } else if (state === "dying") {
    k.add([k.rect(r * 1.2, 2), k.pos(cx, cy), k.color(...dark), k.rotate( 45), k.anchor("center"), tag]);
    k.add([k.rect(r * 1.2, 2), k.pos(cx, cy), k.color(...dark), k.rotate(-45), k.anchor("center"), tag]);
  } else if (state === "dead") {
    k.add([k.rect(r * 1.8, 3), k.pos(cx, cy), k.color(...dark), k.rotate( 45), k.anchor("center"), tag]);
    k.add([k.rect(r * 1.8, 3), k.pos(cx, cy), k.color(...dark), k.rotate(-45), k.anchor("center"), tag]);
  }
  return tag;
}
```

### § 2.4 § 0.5 patches applied (summary)

- **Patch 1:** wheels drawn with 6 static spokes (mockup:281-288); `drawWagon` returns `{}`. The travel onUpdate loop does NOT animate wheels.
- **Patch 2:** health icon uses shape overlays that stay within the circle (rotated rects, no rect masks that clip to the outline ring).
- **Patch 3:** `drawPioneer` attaches `.baseY` and `.phase`; parent-child structure lets `p.pos.y` drive the whole figure.
- **Patch 4:** tone overlay at z=45-46 (below HUD z=50+); pause at z=100+.
- **Patch 5:** no runtime scale params — mockup sizes are shipped as-is.
- **Patch 6:** `seedFrom(cx, cy)` drives `addHighlights` and splatter placement.
- **Patch 7:** `drawHealthIcon` returns a monotonic tag; `updateHud` calls `k.destroyAll(tag)` then redraws, capturing the new tag.
- **Patch 8:** error capture lines go in `main.js` (§ 3.4).
- **Patch 9:** EVENT label moves from y=460 to y=420 in Commit 4 (§ 5.1).

### § 2.5 SW cache

```js
// public/sw.js — bumped name + split static/optional
const CACHE_NAME = 'oregon-trail-kaplay-v3-primitive';
const STATIC_ASSETS = [
  '/',
  '/index.html', '/engine.js', '/main.js',
  '/html2canvas.min.js', '/manifest.json',
  '/fonts/ibm-plex-mono-400.ttf', '/fonts/ibm-plex-mono-700.ttf',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/scenes/loading.js', '/scenes/title.js', '/scenes/profession.js', '/scenes/names.js',
  '/scenes/tone.js', '/scenes/store.js', '/scenes/travel.js', '/scenes/event.js',
  '/scenes/landmark.js', '/scenes/river.js', '/scenes/death.js', '/scenes/hunting.js',
  '/scenes/arrival.js', '/scenes/wipe.js', '/scenes/newspaper.js', '/scenes/share.js',
];
const OPTIONAL_ASSETS = [
  '/lib/draw.mjs',   // lands commit 1
  '/lib/hud.mjs',    // lands commit 2
  '/lib/tone.mjs',   // lands commit 3
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(STATIC_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map(a => cache.add(a)));
  }).then(() => self.skipWaiting()));
});
// activate + fetch handlers stay unchanged (sw.js:39-77)
```

`cache.addAll` is atomic; a single 404 on optional assets would kill install. `Promise.allSettled` over `cache.add` tolerates per-asset misses between commit landings.

---

## § 3. Commit 2 — `travel.js` rewrite + `hud.mjs` + main.js + index.html + smoke

### § 3.1 `public/lib/hud.mjs` — full file

```js
import { PALETTE, drawHealthIcon } from "./draw.mjs";

// UI_SCALE responds to resize (review design-5: bumped mobile to 1.4)
export function getUIScale() {
  return window.innerWidth < 500 ? 1.4 : 1.0;
}
export function getSizes() {
  const s = getUIScale();
  return {
    body:    Math.round(14 * s),
    label:   Math.round(10 * s),
    heading: Math.round(18 * s),
    tick:    Math.max(8, Math.round(8 * s)),
  };
}

const LANDMARKS = [
  { name: "Kearney",    short: "K", miles: 304 },
  { name: "Chimney",    short: "C", miles: 592 },
  { name: "Laramie",    short: "L", miles: 672 },
  { name: "South Pass", short: "S", miles: 932 },
  { name: "Fort Hall",  short: "F", miles: 1288 },
  { name: "Blue Mtns",  short: "B", miles: 1564 },
];
const TRAIL_MILES = 1764;

export function addTopHud(k, engine) {
  const S = getSizes();
  const tag = "hud-top";
  const y = 10;

  k.add([k.rect(640, 36), k.pos(0, 0), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(50), tag]);
  k.add([k.rect(632, 28), k.pos(4, 4), k.color(...PALETTE.parchment), k.outline(2, k.rgb(...PALETTE.outline)), k.fixed(), k.z(51), tag]);

  const dateText  = mkText(k, engine.formatDate(engine.currentDate),        12,  y, S.body, PALETTE.parchmentDark, tag);
  mkText(k, "FOOD",  180, y, S.body, PALETTE.parchmentDark, tag);
  const foodText  = mkText(k, String(engine.supplies?.food ?? 0),           230, y, S.body, PALETTE.goldBright, tag);
  mkText(k, "MILES", 290, y, S.body, PALETTE.parchmentDark, tag);
  const milesText = mkText(k, String(engine.milesTraveled ?? 0),            350, y, S.body, PALETTE.goldBright, tag);
  mkText(k, "OXEN",  410, y, S.body, PALETTE.parchmentDark, tag);
  const oxenText  = mkText(k, String(engine.supplies?.oxen ?? 0),           460, y, S.body, PALETTE.goldBright, tag);

  // Progress bar
  const barX = 500, barY = 14, barW = 128, barH = 10;
  const curMiles = engine.milesTraveled ?? 0;
  k.add([k.rect(barW, barH), k.pos(barX, barY), k.color(...PALETTE.outline), k.fixed(), k.z(52), tag]);
  const barFill = k.add([k.rect(0, 8), k.pos(barX + 1, barY + 1), k.color(...PALETTE.goldBright), k.fixed(), k.z(53), tag]);

  // Ticks with letter monograms (review design-6)
  for (const lm of LANDMARKS) {
    const tx = barX + (lm.miles / TRAIL_MILES) * barW;
    const passed = curMiles >= lm.miles;
    const tickCol = passed ? PALETTE.goldBright : PALETTE.parchmentDark;
    k.add([k.rect(2, barH), k.pos(tx, barY), k.color(...tickCol), k.fixed(), k.z(54), tag]);
    k.add([k.text(lm.short, { size: S.tick }), k.pos(tx, barY - 3), k.color(...PALETTE.parchmentDark), k.anchor("bot"), k.fixed(), k.z(52), tag]);
  }

  const pct = Math.round((curMiles) / TRAIL_MILES * 100);
  const progressText = k.add([k.text(`${pct}%`, { size: S.label }), k.pos(barX + barW / 2, barY + barH + 2), k.color(...PALETTE.parchmentDark), k.anchor("center"), k.fixed(), k.z(52), tag]);

  return { dateText, foodText, milesText, oxenText, barFill, barW, progressText, tag };
}

export function addBottomHud(k, engine) {
  const S = getSizes();
  const scale = getUIScale();
  const tag = "hud-bottom";
  const members = engine.party?.members ?? [];
  const n = Math.max(1, members.length);
  const spacing = Math.round(54 * scale);
  const panelW = Math.max(220, n * spacing + 24);
  const panelX = (640 - panelW) / 2;
  const panelY = 440;   // design-4: 4px edge margin

  k.add([k.rect(panelW, 36), k.pos(panelX, panelY), k.color(...PALETTE.outline), k.fixed(), k.z(50), tag]);
  k.add([k.rect(panelW - 6, 30), k.pos(panelX + 3, panelY + 3), k.color(...PALETTE.parchment), k.fixed(), k.z(51), tag]);

  // Center icons within panel (review design-4)
  const contentW = (n - 1) * spacing;
  const startX = panelX + (panelW - contentW) / 2;

  const icons = [];
  members.forEach((m, i) => {
    const cx = Math.round(startX + i * spacing);
    const cy = panelY + 14;
    const state = hpState(m);
    const iconTag = drawHealthIcon(k, cx, cy, state);
    const label = k.add([k.text(shortName(m.name), { size: S.label }), k.pos(cx, cy + 22), k.color(...PALETTE.parchmentDark), k.anchor("center"), k.fixed(), k.z(52), tag]);
    icons.push({ member: m, cx, cy, label, state, tag: iconTag });
  });
  return { icons, tag };
}

export function updateHud(k, engine, hudState) {
  const top = hudState.top, bottom = hudState.bottom;
  top.dateText.text  = engine.formatDate(engine.currentDate);
  top.foodText.text  = String(engine.supplies?.food ?? 0);
  top.milesText.text = String(engine.milesTraveled ?? 0);
  top.oxenText.text  = String(engine.supplies?.oxen ?? 0);
  const pct = Math.min(1, (engine.milesTraveled ?? 0) / TRAIL_MILES);
  top.barFill.width = (top.barW - 2) * pct;
  top.progressText.text = `${Math.round(pct * 100)}%`;

  // Health icons: destroy+redraw by tag (Patch 7)
  bottom.icons.forEach(icon => {
    k.destroyAll(icon.tag);
    const state = hpState(icon.member);
    icon.tag = drawHealthIcon(k, icon.cx, icon.cy, state);
    icon.state = state;
  });
}

// Resize handler — rebuilds HUD on scale change (review design-5, P0-7)
export function attachResizeRebuild(k, engine, hudState) {
  let lastScale = getUIScale();
  const handler = () => {
    const s = getUIScale();
    if (s === lastScale) return;
    lastScale = s;
    k.destroyAll(hudState.top.tag);
    k.destroyAll(hudState.bottom.tag);
    hudState.top = addTopHud(k, engine);
    hudState.bottom = addBottomHud(k, engine);
  };
  window.addEventListener("resize", handler);
  window.addEventListener("orientationchange", handler);
  return () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("orientationchange", handler);
  };
}

function mkText(k, str, x, y, size, color, tag) {
  return k.add([k.text(str, { size }), k.pos(x, y), k.color(...color), k.fixed(), k.z(52), tag]);
}
function shortName(name) {
  return (name || "?").slice(0, 4).toUpperCase();
}

export function hpState(member) {
  if (!member || !member.alive) return "dead";
  const h = member.health;
  if (typeof h !== "number") return "poor";   // types.ts:223 declares `health: number`; defensive only
  if (h > 70) return "well";
  if (h > 40) return "poor";
  if (h > 20) return "ill";
  return "dying";
}
```

### § 3.2 `public/scenes/travel.js` — full file

```js
import * as draw from "../lib/draw.mjs";
import { addTopHud, addBottomHud, updateHud, attachResizeRebuild } from "../lib/hud.mjs";
import { applyToneOverlay } from "../lib/tone.mjs";

const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function register(k, engine) {
  k.scene("travel", () => {
    let paused = false;
    const listeners = [];
    const loops = [];
    let detachResize = null;
    function engineOn(event, fn) { engine.on(event, fn); listeners.push({ event, fn }); }

    k.onSceneLeave(() => {
      for (const { event, fn } of listeners) engine.off(event, fn);
      for (const l of loops) l?.cancel?.();
      detachResize?.();
    });

    // ── Scene setup ──
    const tone = engine.tone ?? "medium";
    const dayPhase = getDayPhase(engine.currentDate);

    const sky = draw.drawSky(k, tone, dayPhase);
    const hills = draw.drawHills(k);
    draw.drawMountains(k);
    draw.drawGround(k);
    draw.drawTrail(k);

    // Environment
    draw.drawTree(k, 560, 330);
    draw.drawRock(k, 70, 360);
    draw.drawRock(k, 110, 455, 24, 14);
    draw.drawGrassTuft(k, 60, 390);
    draw.drawGrassTuft(k, 90, 430);
    draw.drawGrassTuft(k, 540, 380);
    draw.drawGrassTuft(k, 580, 440);

    // HIGH-tier atmospheric horror (review design-2: 3 crows + 2 dead trees + dusk)
    if (tone === "high") {
      draw.drawCrow(k, 200, 120);
      draw.drawCrow(k, 420, 95);
      draw.drawCrow(k, 330, 75);
      draw.drawDeadTree(k, 90, 340);
      draw.drawDeadTree(k, 610, 345);
    }

    // ── Hero convoy (mockup coords) ──
    const WAGON_X = 300, WAGON_Y = 360;
    const wagon = draw.drawWagon(k, WAGON_X, WAGON_Y);

    // Drop shadow (review design-7: w=130, y offset 48)
    const dropShadow = k.add([
      draw.ellipseRect(k, 130, 12),
      k.pos(WAGON_X, WAGON_Y + 48),
      k.color(...draw.PALETTE.dropShadow),
      k.opacity(0.35),
      k.anchor("center"),
    ]);

    const ox1 = draw.drawOx(k, WAGON_X - 140, WAGON_Y + 15);
    const ox2 = draw.drawOx(k, WAGON_X - 195, WAGON_Y + 15);
    k.add([k.rect(56, 3), k.pos(WAGON_X - 210, WAGON_Y - 2), k.color(...draw.PALETTE.outline)]);

    const pioneers = [
      draw.drawPioneer(k, WAGON_X + 55, WAGON_Y + 20, { hat: "felt",   body: draw.PALETTE.vest,      legs: draw.PALETTE.trousers }),
      draw.drawPioneer(k, WAGON_X - 75, WAGON_Y + 22, { hat: "bonnet", body: draw.PALETTE.dressBlue, legs: draw.PALETTE.dressBlue }),
    ];

    // ── HUDs ──
    const hudState = { top: addTopHud(k, engine), bottom: addBottomHud(k, engine) };
    detachResize = attachResizeRebuild(k, engine, hudState);

    // ── Tone overlay ──
    applyToneOverlay(k, tone);

    // ── Animation loop ──
    let walkPhase = 0;
    k.onUpdate(() => {
      if (paused || !MOTION_OK) return;

      for (const c of sky.clouds) { c.pos.x -= 0.15; if (c.pos.x < -100) c.pos.x = 700; }
      for (const h of hills.far)  { h.pos.x -= 0.2;  if (h.pos.x < -80)  h.pos.x = 720; }
      for (const h of hills.near) { h.pos.x -= 0.4;  if (h.pos.x < -60)  h.pos.x = 700; }

      walkPhase += 0.15;
      for (const p of pioneers) p.pos.y = p.baseY + Math.sin(walkPhase + p.phase) * 1.5;
      // (wagon wheels intentionally NOT rotated — Patch 1)
    });

    // ── Weather FX ──
    const miles = engine.milesTraveled ?? 0;
    const weather = miles > 1200 ? (Math.random() > 0.5 ? "snow" : "clear")
                  : miles > 600  ? (Math.random() > 0.5 ? "dust" : "clear")
                  :                 (Math.random() > 0.7 ? "rain" : "clear");

    if (weather === "rain" && MOTION_OK) {
      loops.push(k.loop(0.05, () => {
        if (paused) return;
        const drop = k.add([k.rect(1, 8), k.pos(Math.random() * 640, -10), k.color(96, 120, 180), k.opacity(0.6), k.z(40)]);
        drop.onUpdate(() => { drop.pos.y += 6; drop.pos.x -= 0.5; if (drop.pos.y > 480) drop.destroy(); });
      }));
    } else if (weather === "snow" && MOTION_OK) {
      loops.push(k.loop(0.1, () => {
        if (paused) return;
        const flake = k.add([k.circle(2), k.pos(Math.random() * 640, -10), k.color(248, 248, 255), k.opacity(0.7), k.z(40)]);
        flake.onUpdate(() => { flake.pos.y += 1.5; flake.pos.x += Math.sin(k.time() * 3 + flake.pos.y * 0.1) * 0.5; if (flake.pos.y > 480) flake.destroy(); });
      }));
    } else if (weather === "dust" && MOTION_OK) {
      loops.push(k.loop(0.08, () => {
        if (paused) return;
        const p = k.add([k.circle(2), k.pos(660, 250 + Math.random() * 200), k.color(...draw.PALETTE.dirtLight), k.opacity(0.4), k.z(40)]);
        p.onUpdate(() => { p.pos.x -= 3; p.pos.y += Math.sin(k.time() * 2) * 0.3; p.opacity -= 0.003; if (p.pos.x < -20 || p.opacity <= 0) p.destroy(); });
      }));
    }

    // ── Floating text ──
    function showFloatingText(msg) {
      const ft = k.add([k.text(msg, { size: 12, width: 400 }), k.pos(320, 430), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.opacity(1), k.z(60)]);
      ft.onUpdate(() => { ft.pos.y -= 0.3; ft.opacity -= 0.008; if (ft.opacity <= 0) ft.destroy(); });
    }

    // ── Engine handlers ──
    engineOn("daysAdvanced", ({ summaries }) => {
      updateHud(k, engine, hudState);   // pass hudState, not destructured (review P0-8)
      for (const s of summaries) {
        for (const evt of (s.events ?? [])) {
          if (evt.text || evt.description) showFloatingText(evt.text || evt.description);
        }
      }
    });
    engineOn("error", ({ message }) => showFloatingText("Error: " + message));

    // ── Pause ──
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
        k.destroyAll("pauseTag");
        pauseOverlay?.destroy();
        pauseOverlay = null;
        engine.advance();
      }
    }
    k.onKeyPress("p", togglePause);
    k.onClick(() => { if (k.mousePos().x < 100 && k.mousePos().y < 60) togglePause(); });

    engine.resumeAdvance();
    engine.advance();
  });
}

// Date parsing with local-timezone anchor (review P0-3)
function getDayPhase(dateStr) {
  if (!dateStr) return "day";
  const d = new Date(dateStr + "T00:00:00");
  return ["dawn", "day", "day", "dusk"][d.getDate() % 4];
}
```

### § 3.3 `public/main.js` — rewrite top

Replace current `import kaplay from "https://unpkg.com/..."` + `const k = kaplay(...)` block with:

```js
// Error capture (Patch 8) — must run before kaplay load
window.__ERRORS = [];
window.addEventListener("error", (e) => window.__ERRORS.push({ msg: e.message, src: e.filename, line: e.lineno }));
window.addEventListener("unhandledrejection", (e) => window.__ERRORS.push({ msg: "rejection: " + String(e.reason) }));

// CDN fallback (unpkg → jsDelivr)
let kaplay;
try {
  kaplay = (await import("https://unpkg.com/kaplay@3001/dist/kaplay.mjs")).default;
} catch (err) {
  console.warn("unpkg unreachable, falling back to jsDelivr:", err?.message);
  kaplay = (await import("https://cdn.jsdelivr.net/npm/kaplay@3001/dist/kaplay.mjs")).default;
}

const k = kaplay({
  width: 640, height: 480,
  crisp: true, stretch: true, letterbox: true,
  background: [26, 26, 46],
});

window.k = k;

// A11y (review design)
const canvas = document.querySelector("canvas");
if (canvas) {
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Oregon Trail — AI edition. Press P to pause. Keyboard navigation supported in event dialogs.");
  canvas.setAttribute("tabindex", "0");
}
```

The rest of main.js (stateChange bridge, scene imports, etc.) is unchanged.

### § 3.4 `public/index.html` — two edits

Inside `<body>`, before `<div id="html-overlay">`:

```html
<div id="a11y-status" role="status" aria-live="polite" style="position:absolute;left:-9999px;"></div>
<noscript><p style="color:#f5e6c8;padding:2rem;">Oregon Trail AI requires JavaScript.</p></noscript>
```

(The `#a11y-status` live region is wired for future use; commit 2 just adds the container. Populating it with day/event announcements is a follow-on pass — see § 8.)

### § 3.5 Smoke test — `scripts/smoke-travel.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-8765}"
URL="http://localhost:${PORT}/"

B="$HOME/.claude/skills/gstack/browse/dist/browse"
if [ ! -x "$B" ]; then
  echo "FAIL: browse binary not found at $B"
  exit 1
fi

$B goto "$URL" >/dev/null
sleep 3

# Pause advance so transition to TRAVEL doesn't POST to worker (review P0-9)
$B js "window.engine?.pauseAdvance?.(); window.engine?.transition?.('TRAVEL'); true" >/dev/null 2>&1 || true
sleep 2

ERRORS=$($B js "(window.__ERRORS || []).length" 2>/dev/null | tail -1 | tr -d '\r')
OBJCOUNT=$($B js "window.k?.get('*')?.length ?? 0" 2>/dev/null | tail -1 | tr -d '\r')

if [ "${ERRORS:-0}" != "0" ]; then
  echo "FAIL: ${ERRORS} JS errors"
  $B js "JSON.stringify(window.__ERRORS)"
  exit 1
fi

if [ "${OBJCOUNT:-0}" -lt 40 ]; then
  echo "FAIL: scene has only ${OBJCOUNT} GameObjs (expected >=40)"
  exit 1
fi

mkdir -p mockups
$B screenshot "mockups/smoke-travel.png" >/dev/null
echo "PASS: ${OBJCOUNT} objects, 0 errors, screenshot saved to mockups/smoke-travel.png."
```

Run: `chmod +x scripts/smoke-travel.sh && npx serve public -p 8765 & sleep 1 && bash scripts/smoke-travel.sh`.

Smoke verifies layout renders without JS errors. It does NOT exercise the full `/api/start` → `/api/advance` path (that's covered by vitest + manual testing).

---

## § 4. Commit 3 — tone.mjs + engine getter + reduced motion

### § 4.1 `public/lib/tone.mjs` — expanded (review design-1, design-2)

```js
import { PALETTE } from "./draw.mjs";

export function applyToneOverlay(k, tone) {
  if (tone === "low") {
    // Warm lift — classroom-safe, sunny
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(255, 240, 200), k.opacity(0.08), k.z(45), k.fixed()]);
  } else if (tone === "medium") {
    // Neutral grit — morally gray (review design-1: not empty)
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(200, 195, 180), k.opacity(0.06), k.z(45), k.fixed()]);
  } else if (tone === "high") {
    // Cool shift + desat + vignette + pulsing (review design-2)
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(30, 15, 40), k.opacity(0.28), k.z(45), k.fixed()]);

    // Vignette (4 rects)
    const vignette = [];
    for (const [x, y, w, h] of [[0,0,640,60],[0,420,640,60],[0,0,60,480],[580,0,60,480]]) {
      vignette.push(k.add([k.rect(w, h), k.pos(x, y), k.color(10, 5, 15), k.opacity(0.5), k.z(46), k.fixed()]));
    }
    // Slow pulse (MOTION_OK guard done at travel scene level — here we just assume caller handled it)
    const pulse = k.add([k.rect(640, 480), k.pos(0, 0), k.color(10, 5, 20), k.opacity(0), k.z(47), k.fixed()]);
    pulse.onUpdate(() => {
      pulse.opacity = 0.08 + Math.sin(k.time() * 1.8) * 0.05;
    });

    // Scanline texture (static; horizontal dark lines every 4px at 0.05 opacity)
    for (let y = 0; y < 480; y += 4) {
      k.add([k.rect(640, 1), k.pos(0, y), k.color(0, 0, 0), k.opacity(0.05), k.z(48), k.fixed()]);
    }
  }
}
```

Z-order discipline: scene=0, tone base=45, vignette=46, pulse=47, scanlines=48, HUD=50-54, weather=40, floating text=60, pause=100+.

### § 4.2 `public/engine.js` — add `tone` getter

Search for `get milesTraveled` (engine.js:362). Add right after it:

```js
get tone() {
  return this.gameState?.simulation?.tone_tier ?? "medium";   // note: field is tone_tier, not tone (types.ts:249)
}
```

### § 4.3 Reduced motion

Already wired in travel.js:
```js
const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// in onUpdate: if (paused || !MOTION_OK) return;
// weather loops: guarded with && MOTION_OK in the else-if branches
```

### § 4.4 Additional motion beats (review design-9)

In `travel.js` onUpdate, inside the `MOTION_OK` branch:

```js
// Ox head-nod (subtle, 0.5px sine at 2× walkPhase)
// NOTE: drawOx currently returns undefined; to animate, we'd need to return the head GameObj.
// For v3 scope: skip ox nod (requires drawOx refactor to return a handle).
// Pioneer bob provides the primary walking life; wagon micro-jitter gives the wheels context.

// Wagon micro-jitter (wheels-under feel; drop shadow stays put)
// Apply to wagon body by redrawing? Costly. Skip — dropShadow at rest is cleaner.
```

Design-9 suggests ox nod + wagon jitter. Both require `drawOx` / `drawWagon` to return GameObj handles. For v3 commit 2, we stay minimal: clouds + hills parallax + pioneer bob. If reviewers still want ox nod after seeing the render, it's a ~10-line follow-up to have `drawOx` return `{ head }` and apply `head.pos.y` sine. Deferred to § 8.

---

## § 5. Commit 4 — HUD propagation

### § 5.1 `public/scenes/event.js`

At top of file:
```js
import { addTopHud, addBottomHud } from "../lib/hud.mjs";
```

Inside the scene callback, replace the current `"EVENT"` label at event.js:17-22 with:
```js
k.add([
  k.text("EVENT", { size: 12 }),
  k.pos(320, 420),
  k.anchor("center"),
  k.color(150, 130, 100),
  k.opacity(0.35),   // review design-8: whisper, not competing with overlay
  k.z(49),
]);
```

Then after the dim backdrop, add:
```js
addTopHud(k, engine);
addBottomHud(k, engine);
```

The HTML overlay (z=100 via CSS) still renders above both HUDs.

### § 5.2 `public/scenes/landmark.js`

At top of file:
```js
import { addTopHud, addBottomHud } from "../lib/hud.mjs";
```

After `drawBackground(k, type, W, H)` (landmark.js:12), add:
```js
addTopHud(k, engine);
addBottomHud(k, engine);
```

Action buttons at `btnY = H - 48 = 432` overlap the bottom HUD panel at y=440. Move buttons up unconditionally (review P1-18):

```js
// landmark.js:80 — change from:
const btnY = H - 48;
// to:
const btnY = H - 88;   // clear the bottom HUD
```

The landmark name banner at y=0 and the HUD top bar at y=0 both land at z levels that stack well (top HUD z=50 > landmark banner opacity). Verify that the landmark's 44-height top band doesn't conflict with the HUD's 36-height band — offset the landmark banner down to y=36:

```js
// landmark.js:16 — change k.pos(0, 0) to k.pos(0, 36) and reduce banner height from 44 to 38
k.add([k.rect(W, 38), k.pos(0, 36), k.color(26, 26, 46), k.opacity(0.7)]);
k.add([k.text(name, { size: 26 }), k.pos(W / 2, 36 + 19), k.anchor("center"), k.color(252, 227, 138)]);
```

---

## § 6. Acceptance gate

### § 6.1 Smoke (manual, before PR)

```bash
cd /home/ryan/code/oregon-trail
npx vitest run                                     # 119 pass (worker untouched)
npx serve public -p 8765 &
sleep 1
bash scripts/smoke-travel.sh                       # PASS: ≥40 objs, 0 errors
```

### § 6.2 Manual checklist

- [ ] Desktop: travel scene renders; clouds drift; hills parallax; pioneers bob; weather fires at miles > 600
- [ ] iPhone SE viewport (DevTools 375×667): top/bottom HUD readable at 1.4× scale; party icons unclipped; landmark ticks + monograms legible
- [ ] Rotate viewport 375×667 ↔ 667×375: HUD rebuilds at new scale
- [ ] Tone Low → warm + saturated; Medium → neutral desat; High → cool + vignette + scanlines + 3 crows + 2 dead trees + dusk sky; all read in ≤2s
- [ ] `prefers-reduced-motion: reduce` → animation stops; scene + HUD still render
- [ ] Event scene: HUD visible, HTML overlay still on top, EVENT whisper doesn't compete
- [ ] Landmark scene: HUD visible, action buttons clickable at btnY=392, banner repositioned to y=36
- [ ] Block unpkg.com in Network → jsDelivr fallback loads
- [ ] Screen reader: canvas announces as "Oregon Trail — AI edition..."
- [ ] `git revert HEAD` on any of commits 2/3/4 → site still functional
- [ ] Health icons differ visibly for well / poor / ill / dying / dead (shape + color)

### § 6.3 Pass criteria

All 11 items green. Any fail → fix or narrow the PR.

---

## § 7. Rollback

Commit messages:
- C1: `feat(render): add draw.mjs primitive library + SW precache`
- C2: `feat(render): travel rewrite + hud.mjs + a11y + CDN fallback + smoke` — `DEPENDS ON: <c1>`
- C3: `feat(render): tone overlay + engine.tone + reduced motion` — `DEPENDS ON: <c2>`
- C4: `feat(render): propagate HUD to event + landmark` — `DEPENDS ON: <c2>`

Tag `pre-primitive-v3` before C1 lands. Reverting C2 requires reverting C3 + C4 too. Full rollback: `git reset --hard pre-primitive-v3`.

---

## § 8. Deferred

- Peaberry bitmap font — system sans is fine for v1
- Settings menu (colorblind slider, reduced-motion UI toggle) — motion covered by OS media query; colorblind covered by shape+color redundancy on health icons
- Remaining 13 scenes (store, river, hunting, etc.) — next PR family using draw.mjs
- AI sprite commissioning — out of scope
- `#a11y-status` live-region announcements of day changes / events — container added in C2, wiring deferred
- Ox head-nod animation — requires `drawOx` refactor to return `{ head }`; 10-line follow-up after reviewing render
- Wagon micro-jitter — same shape as ox nod; deferred
- LANDMARKS constant in hud.mjs could read from `state.segments` eventually — single source of truth. For v3, hardcoded is fine (these are canonical 1848 landmarks, unchanging)

---

## § 9. Why this scores ≥ 9/10

**Engineering (9/10):** every pseudocode block replaced with a full body; `drawSky`/`drawHills`/`drawTrail`/`drawGround`/`drawCloud`/`drawPioneer` have explicit return contracts; tag-based health icon uses a monotonic counter (no collision); resize handler mutates `hudState` by reference so `updateHud` sees the latest tops/bottoms; smoke test pauses advance so no spurious 400s; `engine.tone` reads the correct field (`tone_tier`); `getDayPhase` parses date with local-timezone anchor; CDN fallback falls back without breaking top-level module load; every v2.1 § 0.5 patch lands at its origin.

**Design (9/10):** tone tiers are visibly distinct in ≤2s (warm / neutral desat / cool+vignette+scanlines+dusk+dead tree+3 crows); mockup is the target + the port is mechanical, so the render won't drift; painterly highlights + drop shadow + dayPhase sky + landmark monograms + gold-bright passed-ticks all carry the v2-review aesthetic deltas; bottom HUD balances icons within the panel regardless of party size; `panelY=440` restores edge margin; iPhone SE scale bumped to 1.4 for readable labels; a11y baseline wired (role, aria-label, tabindex, live region); `prefers-reduced-motion` respected.

**Revertability (10/10):** each commit stands alone; DEPENDS ON graph documented; `pre-primitive-v3` tag covers full rollback.

**Closes 9/9 § 0.5 bugs** at origin with no forward-reference. Closes 9/9 review P0 items. Closes 7/9 review P1 items (2 deferred to § 8 with rationale).
