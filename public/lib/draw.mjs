// Oregon Trail — primitive draw helpers (v3)
// Port of mockups/primitive-mockup.html. See IMPLEMENTATION_PLAN_v3.md § 2.
// Colors live in palette.mjs (shared with three/*).

export { PALETTE, toHex, cssHex, toLinear01, rgbToHex } from "./palette.mjs";
import { PALETTE } from "./palette.mjs";

export const ellipseRect = (k, w, h) => k.rect(w, h, { radius: Math.min(w, h) / 2 });

export const seedFrom = (x, y) => (Math.round(x) * 31 + Math.round(y) * 131) | 0;

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Public seeded PRNG — all static scatter must come through this (repaint-stable).
export const seededRng = (seed) => mulberry32(seed | 0);

// Linear blend of two palette colors. Keeps PALETTE the single color source.
export const mixColor = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

// B1: shared ink-outline + shadow-hatch helpers. Warm-dark #3a2a1a
// (PALETTE.outline) register only — never pure black. Replaces ad-hoc
// double-draw outline offsets scattered across the composite drawers.
function inkOutline(k, parent, shape) {
  const { kind, x, y, extra = 2, color = PALETTE.outline } = shape;
  const target = parent ?? k;
  if (kind === "circle") {
    target.add([k.circle(shape.r + extra), k.pos(x, y), k.color(...color), k.anchor("center")]);
  } else if (kind === "oval") {
    target.add([ellipseRect(k, shape.w + extra * 2, shape.h + extra * 2), k.pos(x, y), k.color(...color), k.anchor("center")]);
  } else {
    const ropts = shape.radius != null ? { radius: shape.radius } : {};
    target.add([k.rect(shape.w + extra * 2, shape.h + extra * 2, ropts), k.pos(x - extra, y - extra), k.color(...color)]);
  }
}

// Shadow-side hatching (Darkest Dungeon trick): 2-4 short seeded diagonal
// strokes, low opacity, hand-placed scatter via the shared seededRng —
// linework density fakes detail on otherwise-flat shade fills.
function hatchShade(k, parent, cx, cy, w, h, opts = {}) {
  const rng = mulberry32(opts.seed ?? seedFrom(cx, cy));
  const n = opts.count ?? 2 + Math.floor(rng() * 3);
  const angle = opts.angle ?? -35;
  const len = opts.len ?? Math.max(6, Math.min(w, h) * 0.45);
  const op = opts.opacity ?? 0.22;
  const color = opts.color ?? PALETTE.outline;
  const target = parent ?? k;
  for (let i = 0; i < n; i++) {
    const x = cx + (rng() - 0.5) * w * 0.6;
    const y = cy + (rng() - 0.5) * h * 0.6;
    target.add([
      k.rect(len * (0.7 + rng() * 0.5), 1.4),
      k.pos(x, y), k.color(...color), k.opacity(op),
      k.rotate(angle + (rng() - 0.5) * 10), k.anchor("center"),
    ]);
  }
}

// B2: eased multi-ring glow — quadratic opacity falloff so 5-6 stacked flat
// circles read as a soft radial gradient instead of visible concentric rings.
export function drawGlow(k, parent, cx, cy, maxR, color, opts = {}) {
  const rings = opts.rings ?? 6;
  const baseOp = opts.opacity ?? 0.45;
  const target = parent ?? k;
  const grp = target.add([k.pos(cx, cy)]);
  for (let i = rings; i >= 1; i--) {
    const t = i / rings;
    grp.add([k.circle(maxR * t), k.color(...color), k.opacity(baseOp * (1 - t * t)), k.anchor("center")]);
  }
  return grp;
}

export function addHighlights(k, cx, cy, w, h, count, color, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const dx = (rng() - 0.5) * w * 0.7;
    const dy = (rng() - 0.5) * h * 0.7;
    const r = 1 + Math.floor(rng() * 2);
    k.add([k.circle(r), k.pos(cx + dx, cy + dy), k.color(...color), k.anchor("center"), k.opacity(0.7)]);
  }
}

export function drawSky(k, tone, dayPhase, opts = {}) {
  const phaseMap = {
    dawn:  { top: PALETTE.skyDawn,  horizon: PALETTE.skyPale,        cloudOp: 0.9, celestial: "sun",  cx: 130, cy: 150, r: 14 },
    day:   { top: PALETTE.sky,      horizon: PALETTE.skyPale,        cloudOp: 0.9, celestial: "sun",  cx: 520, cy: 64,  r: 12 },
    dusk:  { top: PALETTE.skyDusk,  horizon: PALETTE.skyDawn,        cloudOp: 0.7, celestial: "sun",  cx: 120, cy: 160, r: 15 },
    night: { top: PALETTE.skyNight, horizon: PALETTE.skyNightHorizon, cloudOp: 0.3, celestial: "moon", cx: 510, cy: 70,  r: 13 },
  };
  const phase = (tone === "high")
    ? { top: PALETTE.skyTwilight, horizon: PALETTE.skyTwilightHorizon, cloudOp: 0.5, celestial: null }
    : (phaseMap[dayPhase] ?? phaseMap.day);

  // Stepped gradient: 16 horizontal bands top→horizon, then a soft blend
  // strip. (Was 4×45px bands with visible seams — mixColor lerp is near-free.)
  const BANDS = 16;
  const bandH = 180 / BANDS;
  for (let i = 0; i < BANDS; i++) {
    const col = mixColor(phase.top, phase.horizon, i / (BANDS - 1));
    k.add([k.rect(640, bandH + 0.5), k.pos(0, i * bandH), k.color(...col)]);
  }
  k.add([k.rect(640, 40), k.pos(0, 180), k.color(...phase.horizon), k.opacity(0.7)]);
  if (tone === "high") {
    // Sickly green-yellow horizon accent (AESTHETIC_SPEC § 3 horror shift).
    k.add([k.rect(640, 18), k.pos(0, 196), k.color(...PALETTE.sicklyHorizon), k.opacity(0.14)]);
  }

  // Sun disc with concentric glow rings, or moon at night. None for high (bleak).
  let celestial = null;
  if (phase.celestial === "sun") {
    celestial = k.add([k.pos(phase.cx, phase.cy)]);
    drawGlow(k, celestial, 0, 0, phase.r * 2.6, PALETTE.sunGlow, { rings: 6, opacity: 0.42 });
    celestial.add([k.circle(phase.r), k.color(...PALETTE.sunCore), k.anchor("center")]);
  } else if (phase.celestial === "moon") {
    celestial = k.add([k.pos(phase.cx, phase.cy)]);
    drawGlow(k, celestial, 0, 0, phase.r * 1.9, PALETTE.moon, { rings: 5, opacity: 0.22 });
    celestial.add([k.circle(phase.r), k.color(...PALETTE.moon), k.anchor("center")]);
    celestial.add([k.circle(phase.r * 0.85), k.pos(phase.r * 0.4, -phase.r * 0.2), k.color(...PALETTE.moonShade), k.opacity(0.85), k.anchor("center")]);
  }

  const clouds = [];
  for (const [cx, cy, s] of [[80, 62, 1.0], [280, 48, 0.8], [460, 72, 1.1], [580, 38, 0.7]]) {
    clouds.push(drawCloud(k, cx, cy, s, phase.cloudOp));
  }
  return { clouds, celestial };
}

export function drawCloud(k, cx, cy, scale = 1, opacity = 0.9, opts = {}) {
  const rng = mulberry32(opts.seed ?? seedFrom(cx, cy));
  const parent = k.add([k.pos(cx, cy), k.opacity(opacity)]);

  // Varied puff layout, every puff tangent to a flat baseline (y=0) so the
  // underside reads flat; shadow pass below, lit pass nudged up = 2-tone.
  const n = 3 + Math.floor(rng() * 3);
  const parts = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const r = (10 + rng() * 8) * scale;
    parts.push({ x, r });
    x += r * (0.9 + rng() * 0.5);
  }
  const mid = (parts[0].x + parts[parts.length - 1].x) / 2;
  for (const p of parts) p.x -= mid;

  for (const p of parts) parent.add([k.circle(p.r + 1), k.pos(p.x, -p.r), k.color(...PALETTE.outline), k.opacity(0.12), k.anchor("center")]);
  for (const p of parts) parent.add([k.circle(p.r),     k.pos(p.x, -p.r), k.color(...PALETTE.cloudShadow), k.anchor("center")]);
  for (const p of parts) parent.add([k.circle(p.r),     k.pos(p.x, -p.r - 3 * scale), k.color(...PALETTE.cloud), k.anchor("center")]);
  return parent;
}

export function drawMountains(k, opts = {}) {
  // Far range — hazy, no outline, lighter (atmospheric perspective).
  const farPeak = (cx, w, h) => k.add([
    k.polygon([
      k.vec2(-w/2, 0), k.vec2(-w/5, -h), k.vec2(-w/16, -h*0.6),
      k.vec2(w/6, -h*0.85), k.vec2(w/3, -h*0.45), k.vec2(w/2, 0),
    ]),
    k.pos(cx, 228), k.color(...PALETTE.mountainHaze), k.opacity(0.8),
  ]);
  farPeak(80, 300, 52);
  farPeak(310, 340, 64);
  farPeak(540, 300, 46);

  // Near range — darker, ridge-shade facets on the right (shadow) side,
  // snow caps on the tallest peaks.
  const mtn = (cx, cy, w, h, col, snow) => {
    k.add([
      k.polygon([
        k.vec2(-w/2, 0), k.vec2(-w/4, -h*0.8), k.vec2(-w/8, -h*0.6),
        k.vec2(0, -h),   k.vec2(w/6, -h*0.7),  k.vec2(w/3, -h*0.4),
        k.vec2(w/2, 0),
      ]),
      k.pos(cx, cy), k.color(...col), k.outline(2, k.rgb(...PALETTE.outline)),
    ]);
    // Shadow facet hugging the right profile from summit to base.
    k.add([
      k.polygon([
        k.vec2(0, -h), k.vec2(w/6, -h*0.7), k.vec2(w/3, -h*0.4),
        k.vec2(w/2, 0), k.vec2(w/7, 0),
      ]),
      k.pos(cx, cy), k.color(...PALETTE.mountainShade), k.opacity(0.5),
    ]);
    // Small secondary facet under the left shoulder.
    k.add([
      k.polygon([
        k.vec2(-w/4, -h*0.8), k.vec2(-w/8, -h*0.6), k.vec2(-w/9, -h*0.3), k.vec2(-w/4, -h*0.35),
      ]),
      k.pos(cx, cy), k.color(...PALETTE.mountainShade), k.opacity(0.28),
    ]);
    if (snow) {
      k.add([
        k.polygon([
          k.vec2(-w/12, -h*0.76), k.vec2(-w/24, -h*0.82), k.vec2(0, -h),
          k.vec2(w/14, -h*0.78), k.vec2(w/24, -h*0.72), k.vec2(-w/28, -h*0.74),
        ]),
        k.pos(cx, cy), k.color(...PALETTE.snow), k.opacity(0.95),
      ]);
    }
  };
  mtn(150, 230, 280, 70, PALETTE.mountainFar, true);
  mtn(420, 230, 320, 55, PALETTE.mountainMid, false);
  mtn(320, 230, 180, 90, PALETTE.mountainDk, true);
}

export function drawHills(k) {
  // Continuous backing ridge so gaps between drifting hills never leak the
  // page background (visible as dark notches in the v2 renderer).
  k.add([k.rect(640, 40), k.pos(0, 222), k.color(...PALETTE.hillMid)]);

  // Soft rounded ridges, no hard outline (atmospheric, golf-course register).
  // Rolling tonal variation: three greens across the two parallax bands.
  const roundedHill = (cx, cy, w, h, col) => k.add([
    k.rect(w, h, { radius: [h, h, 0, 0] }),
    k.pos(cx - w/2, cy - h),
    k.color(...col),
  ]);
  const far = [
    roundedHill(120, 261, 240, 34, PALETTE.grassDeep),
    roundedHill(380, 261, 280, 40, PALETTE.grassDeep),
    roundedHill(620, 262, 200, 26, PALETTE.grassDeep),
  ];
  const near = [
    roundedHill(240, 263, 190, 18, PALETTE.grassLight),
    roundedHill(580, 262, 220, 26, PALETTE.grassLight),
  ];
  return { far, near };
}

// Trail trapezoid geometry (shared by drawGround scatter + drawTrail).
// Top edge y=330 x∈[230,410]; bottom edge y=470 x∈[0,640].
function trailEdgesAt(y) {
  if (y < 330) return null;
  const t = Math.min(1, (y - 330) / 140);
  return [230 - 230 * t, 410 + 230 * t];
}

export function drawGround(k, opts = {}) {
  const tone = opts.tone ?? "medium";
  k.add([k.rect(640, 220), k.pos(0, 260), k.color(...PALETTE.grassMid)]);

  // Soft horizon blend — kills the hard hills/ground seam.
  k.add([k.rect(640, 8), k.pos(0, 256), k.color(...PALETTE.hillMid),    k.opacity(0.55)]);
  k.add([k.rect(640, 5), k.pos(0, 262), k.color(...PALETTE.grassLight), k.opacity(0.3)]);

  const rng = mulberry32(seedFrom(640, 260));
  const onTrail = (x, y, pad) => {
    const edges = trailEdgesAt(y);
    return edges !== null && x > edges[0] - pad && x < edges[1] + pad;
  };

  // Subtle 2-tone meadow texture: irregular seeded patches, low contrast.
  let placed = 0;
  while (placed < 16) {
    const x = rng() * 640, y = 268 + rng() * 205;
    const w = 36 + rng() * 70, h = 9 + rng() * 13;
    const col = rng() < 0.5 ? PALETTE.grassLight : PALETTE.grassDeep;
    const op = 0.22 + rng() * 0.16;
    placed++;
    if (onTrail(x, y, 24)) continue;
    k.add([ellipseRect(k, w, h), k.pos(x, y), k.color(...col), k.opacity(op), k.anchor("center")]);
  }

  // Seeded grass tufts (parented: 1 root each).
  for (let i = 0; i < 12; i++) {
    const x = rng() * 640, y = 282 + rng() * 190;
    if (onTrail(x, y, 16)) continue;
    const tuft = k.add([k.pos(x, y)]);
    const blades = 2 + Math.floor(rng() * 2);
    for (let b = 0; b < blades; b++) {
      tuft.add([k.rect(2, 5 + rng() * 4), k.pos(-3 + b * 3, -(4 + rng() * 3)), k.color(...PALETTE.grassBorder), k.opacity(0.7)]);
    }
  }

  // Wildflower dots — or sparse dead scrub when tone is high (bleak, no color pops).
  if (tone === "high") {
    for (let i = 0; i < 6; i++) {
      const x = rng() * 640, y = 290 + rng() * 180;
      if (onTrail(x, y, 16)) continue;
      const scrub = k.add([k.pos(x, y)]);
      scrub.add([k.rect(2, 7), k.pos(0, -7), k.color(...PALETTE.scrubDead)]);
      scrub.add([k.rect(5, 2), k.pos(-2, -6), k.color(...PALETTE.scrubDead), k.rotate(-30)]);
    }
  } else {
    for (let i = 0; i < 11; i++) {
      const x = rng() * 640, y = 286 + rng() * 186;
      if (onTrail(x, y, 16)) continue;
      const col = rng() < 0.6 ? PALETTE.flowerGold : PALETTE.flowerCream;
      k.add([k.circle(1.5 + rng()), k.pos(x, y), k.color(...col), k.opacity(0.85), k.anchor("center")]);
    }
  }
}

export function drawTrail(k, opts = {}) {
  // Main bed — no hard outline; edges softened by fringe strips below.
  k.add([
    k.polygon([k.vec2(230, 0), k.vec2(410, 0), k.vec2(640, 140), k.vec2(0, 140)]),
    k.pos(0, 330),
    k.color(...PALETTE.dirtMid),
  ]);
  // Dark grass-border fringe hugging each edge (soft transition to meadow).
  k.add([
    k.polygon([k.vec2(228, 0), k.vec2(238, 0), k.vec2(14, 140), k.vec2(-4, 140)]),
    k.pos(0, 330), k.color(...PALETTE.grassBorder), k.opacity(0.45),
  ]);
  k.add([
    k.polygon([k.vec2(402, 0), k.vec2(412, 0), k.vec2(644, 140), k.vec2(626, 140)]),
    k.pos(0, 330), k.color(...PALETTE.grassBorder), k.opacity(0.45),
  ]);
  // Inner worn bed.
  k.add([
    k.polygon([k.vec2(240, 10), k.vec2(400, 10), k.vec2(600, 130), k.vec2(40, 130)]),
    k.pos(0, 330),
    k.color(...PALETTE.dirtDark),
  ]);

  // Twin wheel ruts — converging with perspective, run the trail length.
  for (const side of [-1, 1]) {
    k.add([
      k.polygon([
        k.vec2(320 + side * 40 - 2, 6),  k.vec2(320 + side * 40 + 2, 6),
        k.vec2(320 + side * 144 + 6, 138), k.vec2(320 + side * 144 - 6, 138),
      ]),
      k.pos(0, 330), k.color(...PALETTE.rut), k.opacity(0.7),
    ]);
  }

  // Faint center grass strip between the ruts.
  k.add([
    k.polygon([k.vec2(317, 14), k.vec2(323, 14), k.vec2(334, 132), k.vec2(306, 132)]),
    k.pos(0, 330), k.color(...PALETTE.hillMid), k.opacity(0.3),
  ]);

  // Scattered edge stones (seeded, 2-tone via outline).
  const rng = mulberry32(seedFrom(320, 330));
  for (let i = 0; i < 7; i++) {
    const t = 0.12 + rng() * 0.85;
    const side = rng() < 0.5 ? -1 : 1;
    const hw = 90 + 230 * t;
    const x = 320 + side * (hw - 8 - rng() * 10);
    const y = 330 + 140 * t;
    const w = 4 + rng() * 5;
    k.add([
      ellipseRect(k, w, w * 0.65),
      k.pos(x, y), k.color(...(rng() < 0.5 ? PALETTE.stone : PALETTE.stoneLight)),
      k.outline(1, k.rgb(...PALETTE.outline)), k.anchor("center"),
    ]);
  }
}

export function drawWagon(k, cx, cy, opts = {}) {
  // opts.dim < 1 darkens every palette color — used for the dusk-lit title wagon.
  const dim = opts.dim ?? 1;
  const C = (c) => (dim >= 1 ? c : c.map((v) => Math.round(v * dim)));

  // Tongue — angled up toward the ox yoke when hitched; opts.tongueDown
  // rests it on the ground (parked wagon, e.g. the title screen).
  const tongueAngle = opts.tongueDown ? 12 : -5;
  k.add([k.rect(96, 6), k.pos(cx - 58, cy + 16), k.color(...C(PALETTE.outline)), k.anchor("right"), k.rotate(tongueAngle)]);
  k.add([k.rect(92, 3), k.pos(cx - 59, cy + 16), k.color(...C(PALETTE.wood)),    k.anchor("right"), k.rotate(tongueAngle)]);

  // Undercarriage: reach beam between the axles + axle stubs behind the wheels.
  k.add([k.rect(96, 6), k.pos(cx - 48, cy + 23), k.color(...C(PALETTE.woodDark))]);
  k.add([k.rect(8, 10), k.pos(cx - 46, cy + 21), k.color(...C(PALETTE.outline))]);
  k.add([k.rect(8, 10), k.pos(cx + 38, cy + 21), k.color(...C(PALETTE.outline))]);

  // Body
  k.add([k.rect(130, 36, { radius: 2 }), k.pos(cx - 65, cy - 5), k.color(...C(PALETTE.outline))]);
  k.add([k.rect(126, 32, { radius: 2 }), k.pos(cx - 63, cy - 3), k.color(...C(PALETTE.wood))]);
  for (let i = -55; i < 65; i += 18) {
    k.add([k.rect(2, 28), k.pos(cx + i, cy - 1), k.color(...C(PALETTE.outline)), k.opacity(0.5)]);
  }
  k.add([k.rect(122, 4), k.pos(cx - 61, cy - 1), k.color(...C(PALETTE.woodLight)), k.opacity(0.7)]);
  hatchShade(k, k, cx - 38, cy + 12, 40, 18, { seed: seedFrom(cx, cy) + 5, angle: -35, opacity: 0.2, count: 3, color: C(PALETTE.outline) });

  // Canvas top
  const canvasY = cy - 28;
  inkOutline(k, k, { kind: "oval", x: cx, y: canvasY, w: 126, h: 46, extra: 2, color: C(PALETTE.outline) });
  k.add([ellipseRect(k, 126, 46), k.pos(cx, canvasY),         k.color(...C(PALETTE.canvas)),    k.anchor("center")]);
  k.add([ellipseRect(k, 122, 42), k.pos(cx + 2, canvasY + 2), k.color(...C(PALETTE.canvasMid)), k.anchor("center"), k.opacity(0.5)]);
  // Hoop shading: shadow band along the canvas underside + top highlight.
  k.add([ellipseRect(k, 116, 12), k.pos(cx, canvasY + 16), k.color(...C(PALETTE.canvasShadow)), k.anchor("center"), k.opacity(0.55)]);
  k.add([ellipseRect(k, 76, 8),   k.pos(cx - 6, canvasY - 14), k.color(...C(PALETTE.cloud)), k.anchor("center"), k.opacity(0.35)]);
  for (let i = -50; i <= 50; i += 24) {
    k.add([k.rect(2, 44), k.pos(cx + i - 1, canvasY - 22), k.color(...C(PALETTE.outline)), k.opacity(0.25)]);
    // Soft sag shadow trailing each bow rib.
    k.add([k.rect(3, 38), k.pos(cx + i + 1, canvasY - 18), k.color(...C(PALETTE.canvasShadow)), k.opacity(0.3)]);
  }

  // Side-mounted water barrel (between the wheels, on the body).
  inkOutline(k, k, { kind: "rect", x: cx + 0.5, y: cy + 2.5, w: 13, h: 18, extra: 2, radius: 4, color: C(PALETTE.outline) });
  k.add([k.rect(13, 18, { radius: 3 }), k.pos(cx + 0.5, cy + 2.5), k.color(...C(PALETTE.woodLight))]);
  k.add([k.rect(13, 2), k.pos(cx + 0.5, cy + 6),  k.color(...C(PALETTE.woodDark))]);
  k.add([k.rect(13, 2), k.pos(cx + 0.5, cy + 14), k.color(...C(PALETTE.woodDark))]);

  // Hanging lantern at the rear — stays lit even when dimmed (dusk charm).
  k.add([k.rect(8, 2),  k.pos(cx + 62, cy - 6), k.color(...C(PALETTE.outline))]);
  k.add([k.rect(1, 5),  k.pos(cx + 68, cy - 4), k.color(...C(PALETTE.outline))]);
  drawGlow(k, k, cx + 68.5, cy + 4, 8, PALETTE.gold, { rings: 5, opacity: dim < 1 ? 0.4 : 0.28 });
  k.add([k.rect(6, 8, { radius: 1 }), k.pos(cx + 65.5, cy + 0), k.color(...PALETTE.goldBright), k.outline(1, k.rgb(...C(PALETTE.outline)))]);

  // Wheels — 6 spokes. opts.rolling (truthy, or a speed number) drives
  // rotation; angle is a pure function of k.time() each frame (freezeAt-safe,
  // no accumulated dt state). Default (no opts.rolling anywhere) = speed 0 =
  // identical static render to before.
  function wheel(wx, wy, wopts = {}) {
    const r = 22;
    k.add([k.circle(r + 2), k.pos(wx, wy), k.color(...C(PALETTE.outline)),   k.anchor("center")]);
    k.add([k.circle(r),     k.pos(wx, wy), k.color(...C(PALETTE.woodLight)), k.anchor("center")]);
    k.add([k.circle(r - 3), k.pos(wx, wy), k.color(...C(PALETTE.wood)),      k.anchor("center")]);
    const spokes = k.add([k.pos(wx, wy), k.rotate(0)]);
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * 360;
      spokes.add([k.rect(3, r * 2 - 6), k.pos(0, 0), k.color(...C(PALETTE.outline)), k.rotate(ang), k.anchor("center")]);
    }
    k.add([k.circle(5), k.pos(wx, wy), k.color(...C(PALETTE.outline)),   k.anchor("center")]);
    k.add([k.circle(3), k.pos(wx, wy), k.color(...C(PALETTE.woodLight)), k.anchor("center")]);
    // handle.speed is in rotations/second; travel.js can call setSpeed() any
    // time after drawWagon() returns, whether or not opts.rolling was passed.
    const handle = { speed: wopts.rolling ? (typeof wopts.rolling === "number" ? wopts.rolling : 1) : 0 };
    spokes.onUpdate(() => {
      spokes.angle = (handle.speed * k.time() * 360) % 360;
    });
    return handle;
  }
  const wheelL = wheel(cx - 42, cy + 26, { rolling: opts.rolling });
  const wheelR = wheel(cx + 42, cy + 26, { rolling: opts.rolling });

  // Deterministic mud splatter
  addHighlights(k, cx, cy + 18, 120, 8, 6, C(PALETTE.dirtDark), seedFrom(cx, cy));

  return {
    wheels: {
      setSpeed(speed) { wheelL.speed = speed; wheelR.speed = speed; },
    },
  };
}

export function drawOx(k, cx, cy, opts = {}) {
  // Draft ox silhouette: hump, dewlap, long muzzle, thick horns, short legs.
  // opts.animate: 2-frame diagonal leg walk + subtle head bob.
  const p = k.add([k.pos(cx, cy)]);

  // Legs — thicker, shorter draft proportions (kept as refs for walk cycle).
  const LEG_Y = 10;
  const legs = [-20, -11, 9, 18].map((lx) => {
    const leg = p.add([k.pos(lx, LEG_Y)]);
    leg.add([k.rect(6, 11), k.pos(0, 0), k.color(...PALETTE.oxBrown), k.outline(2, k.rgb(...PALETTE.outline))]);
    leg.add([k.rect(6, 3),  k.pos(0, 9), k.color(...PALETTE.outline)]);
    return leg;
  });

  // Tail + tuft
  p.add([k.rect(2, 12), k.pos(26, -6), k.color(...PALETTE.oxDark), k.rotate(10)]);
  p.add([k.circle(3), k.pos(29, 6), k.color(...PALETTE.outline), k.anchor("center")]);

  // Body — longer barrel, shoulder hump, cream belly, dewlap.
  p.add([k.rect(56, 26, { radius: 5 }), k.pos(-28, -14), k.color(...PALETTE.outline)]);
  p.add([k.rect(52, 22, { radius: 4 }), k.pos(-26, -12), k.color(...PALETTE.oxBrown)]);
  // Hump
  p.add([k.circle(12), k.pos(-12, -18), k.color(...PALETTE.outline), k.anchor("center")]);
  p.add([k.circle(10), k.pos(-12, -18), k.color(...PALETTE.oxBrown), k.anchor("center")]);
  // Cream belly
  p.add([ellipseRect(k, 24, 12), k.pos(6, -2), k.color(...PALETTE.oxCream), k.anchor("center"), k.opacity(0.9)]);
  // Dewlap
  p.add([ellipseRect(k, 10, 7), k.pos(-28, 2), k.color(...PALETTE.oxBrown), k.anchor("center")]);
  p.add([k.rect(48, 4), k.pos(-24, 4), k.color(...PALETTE.oxDark), k.opacity(0.28)]);

  // Shadow-side flank hatching (rear haunch, opposite the cream belly light).
  hatchShade(k, p, 14, -9, 26, 14, { seed: seedFrom(cx, cy) + 11, angle: -30, opacity: 0.2, count: 3 });

  // Head — lowered pulling posture; thick horns, cream muzzle, eye.
  const HEAD_Y = -4;
  const hd = p.add([k.pos(-34, HEAD_Y)]);
  // Horns (thick, outward-up)
  hd.add([k.polygon([k.vec2(0, 0), k.vec2(-10, -12), k.vec2(-5, -13), k.vec2(3, -1)]), k.pos(-5, -9), k.color(...PALETTE.canvasMid)]);
  hd.add([k.polygon([k.vec2(0, 0), k.vec2(5, -13), k.vec2(10, -12), k.vec2(3, -1)]), k.pos(5, -9), k.color(...PALETTE.canvasMid)]);
  inkOutline(k, hd, { kind: "circle", x: 0, y: 0, r: 10.5, extra: 2 });
  hd.add([k.circle(10.5), k.pos(0, 0), k.color(...PALETTE.oxBrown), k.anchor("center")]);
  // Long cream muzzle
  hd.add([ellipseRect(k, 14, 9), k.pos(-5, 6), k.color(...PALETTE.oxCream), k.anchor("center")]);
  // Eye pit
  hd.add([k.circle(1.6), k.pos(-1, -3), k.color(...PALETTE.black), k.anchor("center")]);
  // Ear nubs
  hd.add([k.circle(2.5), k.pos(6, -6), k.color(...PALETTE.oxDark), k.anchor("center")]);

  if (opts.animate) {
    p.walking = true;
    const phase = opts.phase ?? 0;
    p.onUpdate(() => {
      if (!p.walking) return;
      const frame = Math.floor(k.time() * 3.2 + phase) % 2;
      legs.forEach((leg, i) => { leg.pos.y = LEG_Y + ((i % 2 === frame) ? -2 : 0); });
      hd.pos.y = HEAD_Y + Math.sin(k.time() * 6.4 + phase) * 1.2;
    });
  }
  return p;
}

export function drawPioneer(k, cx, cy, opts = {}) {
  const hat     = opts.hat  ?? "felt";
  const bodyCol = opts.body ?? PALETTE.vest;
  const legCol  = opts.legs ?? PALETTE.trousers;
  const phase   = opts.phase ?? 0;
  const dress   = opts.dress || (legCol === PALETTE.dressBlue && bodyCol === PALETTE.dressBlue);

  const p = k.add([k.pos(cx, cy)]);
  // Wider torso (shoulders > hips)
  p.add([k.rect(16, 24), k.pos(-8, -22), k.color(...PALETTE.outline)]);
  p.add([k.rect(14, 14), k.pos(-7, -20), k.color(...bodyCol)]);
  p.add([k.rect(14, 3),  k.pos(-7, -18), k.color(...PALETTE.shirt)]);
  // Shadow-side torso hatching (Darkest Dungeon trick, mirrors wagon/ox).
  hatchShade(k, p, -3, -13, 12, 16, { seed: seedFrom(cx, cy) + 13, angle: -35, opacity: 0.2, count: 2 });
  // Neck
  p.add([k.rect(4, 3), k.pos(-2, -25), k.color(...PALETTE.skin)]);
  inkOutline(k, p, { kind: "circle", x: 0, y: -28, r: 4.8, extra: 2 });
  p.add([k.circle(4.8),  k.pos(0, -28),  k.color(...PALETTE.skin),    k.anchor("center")]);
  if (hat === "felt") {
    p.add([k.rect(18, 2), k.pos(-9, -34), k.color(...PALETTE.outline)]);
    p.add([k.rect(16, 2), k.pos(-8, -33), k.color(...PALETTE.hatFelt)]);
    p.add([k.rect(10, 7), k.pos(-5, -39), k.color(...PALETTE.hatFelt), k.outline(2, k.rgb(...PALETTE.outline))]);
  } else if (hat === "straw") {
    p.add([ellipseRect(k, 18, 4), k.pos(0, -33), k.color(...PALETTE.outline), k.anchor("center")]);
    p.add([ellipseRect(k, 16, 3), k.pos(0, -33), k.color(...PALETTE.straw),   k.anchor("center")]);
    p.add([k.rect(8, 4), k.pos(-4, -38), k.color(...PALETTE.straw), k.outline(2, k.rgb(...PALETTE.outline))]);
  } else {
    // Bonnet with side flares
    inkOutline(k, p, { kind: "oval", x: 0, y: -32, w: 10, h: 6, extra: 2 });
    p.add([ellipseRect(k, 10, 6), k.pos(0, -32), k.color(...PALETTE.bonnet),  k.anchor("center")]);
    p.add([ellipseRect(k, 5, 6), k.pos(-7, -30), k.color(...PALETTE.bonnet), k.anchor("center")]);
    p.add([ellipseRect(k, 5, 6), k.pos(7, -30), k.color(...PALETTE.bonnet), k.anchor("center")]);
  }

  let legL, legR;
  if (dress) {
    // Skirt triangle mass
    p.add([k.polygon([k.vec2(-10, -8), k.vec2(10, -8), k.vec2(12, 6), k.vec2(-12, 6)]), k.pos(0, 0), k.color(...bodyCol), k.outline(2, k.rgb(...PALETTE.outline))]);
    legL = p.add([k.rect(1, 1), k.pos(0, 0)]); // dummy for animate
    legR = p.add([k.rect(1, 1), k.pos(0, 0)]);
  } else {
    legL = p.add([k.rect(5, 9), k.pos(-7, -6), k.color(...legCol), k.outline(2, k.rgb(...PALETTE.outline))]);
    legR = p.add([k.rect(5, 9), k.pos(2, -6), k.color(...legCol), k.outline(2, k.rgb(...PALETTE.outline))]);
  }

  p.baseY = cy;
  p.phase = phase;

  if (opts.animate) {
    p.walking = true;
    p.onUpdate(() => {
      if (!p.walking) return;
      const t = k.time() * 5 + p.phase;
      p.pos.y = p.baseY + Math.sin(t) * 2.0;
      if (!dress) {
        legL.pos.y = -6 + (Math.sin(t) > 0 ? -1.8 : 0);
        legR.pos.y = -6 + (Math.sin(t) <= 0 ? -1.8 : 0);
      }
    });
  }
  return p;
}

export function drawTree(k, cx, cy) {
  k.add([k.rect(16, 36), k.pos(cx - 8, cy - 20), k.color(...PALETTE.wood), k.outline(2, k.rgb(...PALETTE.outline))]);
  const canopy = [
    { x: 0,   y: -40, r: 34 },
    { x: -22, y: -28, r: 26 },
    { x: 22,  y: -28, r: 26 },
    { x: 0,   y: -60, r: 22 },
  ];
  for (const c of canopy) inkOutline(k, k, { kind: "circle", x: cx + c.x, y: cy + c.y, r: c.r, extra: 2 });
  for (const c of canopy) k.add([k.circle(c.r),     k.pos(cx + c.x, cy + c.y), k.color(...PALETTE.hillMid),  k.anchor("center")]);
  for (const c of canopy) k.add([k.circle(c.r * 0.4), k.pos(cx + c.x - c.r*0.3, cy + c.y - c.r*0.3), k.color(...PALETTE.hillNear), k.opacity(0.8), k.anchor("center")]);
  hatchShade(k, k, cx + canopy[0].x + canopy[0].r * 0.32, cy + canopy[0].y + canopy[0].r * 0.32, canopy[0].r * 0.7, canopy[0].r * 0.6, { seed: seedFrom(cx, cy) + 3, angle: -40, opacity: 0.22, count: 3 });
  addHighlights(k, cx, cy - 40, 80, 60, 8, PALETTE.hillNear, seedFrom(cx, cy));
}

export function drawRock(k, cx, cy, w = 36, h = 22) {
  inkOutline(k, k, { kind: "oval", x: cx, y: cy, w, h, extra: 2 });
  k.add([ellipseRect(k, w,     h),     k.pos(cx, cy), k.color(140, 135, 130),        k.anchor("center")]);
  k.add([ellipseRect(k, w * 0.5, h * 0.3), k.pos(cx - w*0.15, cy - h*0.25), k.color(180, 175, 170), k.anchor("center")]);
  hatchShade(k, k, cx + w * 0.18, cy + h * 0.2, w * 0.55, h * 0.5, { seed: seedFrom(cx, cy) + 7, angle: -28, opacity: 0.2, count: 3 });
  addHighlights(k, cx, cy, w, h, 6, PALETTE.hillMid, seedFrom(cx, cy));
}

export function drawGrassTuft(k, cx, cy) {
  k.add([k.rect(8, 3), k.pos(cx - 4, cy), k.color(...PALETTE.grassBorder)]);
  for (let i = 0; i < 4; i++) {
    k.add([k.rect(2, 5 + i), k.pos(cx - 3 + i * 2, cy - 4 - i), k.color(...PALETTE.hillMid)]);
  }
}

export function drawCrow(k, cx, cy) {
  k.add([ellipseRect(k, 8, 5), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center")]);
  k.add([k.rect(6, 2), k.pos(cx - 4, cy - 1), k.color(...PALETTE.outline), k.rotate(-20), k.anchor("center")]);
  k.add([k.rect(6, 2), k.pos(cx + 4, cy - 1), k.color(...PALETTE.outline), k.rotate( 20), k.anchor("center")]);
  k.add([k.polygon([k.vec2(0,0), k.vec2(3, 0), k.vec2(1.5, 2)]), k.pos(cx + 4, cy), k.color(...PALETTE.outlineLight)]);
}

export function drawDeadTree(k, cx, cy) {
  k.add([k.rect(10, 40), k.pos(cx - 5, cy - 20), k.color(...PALETTE.outlineLight), k.outline(2, k.rgb(...PALETTE.outline))]);
  k.add([k.rect(20, 2), k.pos(cx, cy - 20), k.color(...PALETTE.outline), k.rotate(-40), k.anchor("left")]);
  k.add([k.rect(18, 2), k.pos(cx, cy - 28), k.color(...PALETTE.outline), k.rotate( 20), k.anchor("left")]);
  k.add([k.rect(14, 2), k.pos(cx, cy - 10), k.color(...PALETTE.outline), k.rotate(-15), k.anchor("left")]);
}

// Drifting bird: 3 segments (body + two wings). Caller drives motion and
// calls bird.flap(t) from its own update loop (so pause/reduced-motion are
// honored by the scene, not here).
export function drawBird(k, cx, cy, opts = {}) {
  const col = opts.crow ? PALETTE.outline : PALETTE.birdDark;
  const s = opts.scale ?? 1;
  const p = k.add([k.pos(cx, cy)]);
  p.add([ellipseRect(k, 7 * s, 3 * s), k.pos(0, 0), k.color(...col), k.anchor("center")]);
  const wingL = p.add([k.rect(8 * s, 1.6 * s), k.pos(-2 * s, -1), k.color(...col), k.anchor("right"), k.rotate(-14)]);
  const wingR = p.add([k.rect(8 * s, 1.6 * s), k.pos(2 * s, -1),  k.color(...col), k.anchor("left"),  k.rotate(14)]);
  p.flap = (t) => {
    const a = Math.sin(t) * 26;
    wingL.angle = -8 - a;
    wingR.angle = 8 + a;
  };
  return p;
}

// Transient dust puff behind the wheels — grows, drifts back, fades, self-destroys.
export function spawnDustPuff(k, x, y, opts = {}) {
  const puff = k.add([
    k.circle(2 + Math.random() * 2),
    k.pos(x, y),
    k.color(...PALETTE.dust),
    k.opacity(0.3 + Math.random() * 0.1),
    k.anchor("center"),
    k.z(opts.z ?? 1),
  ]);
  puff.onUpdate(() => {
    puff.pos.x -= 0.35;
    puff.pos.y -= 0.12;
    puff.radius += 0.05;
    puff.opacity -= 0.007;
    if (puff.opacity <= 0) puff.destroy();
  });
  return puff;
}

let _hpIconCounter = 0;
export function drawHealthIcon(k, cx, cy, state) {
  const r = 12;
  const fills = { well: PALETTE.hpGreen, poor: PALETTE.hpYellow, ill: PALETTE.hpOrange, dying: PALETTE.hpRed, dead: PALETTE.hpDead };
  const tag = `hpicon-${++_hpIconCounter}`;
  const dark = PALETTE.outline;

  k.add([k.circle(r + 1), k.pos(cx, cy), k.color(...dark), k.anchor("center"), k.fixed(), k.z(52), tag]);
  k.add([k.circle(r),     k.pos(cx, cy), k.color(...(fills[state] ?? fills.poor)), k.anchor("center"), k.fixed(), k.z(52), tag]);

  if (state === "poor") {
    k.add([k.rect(2, r * 1.6), k.pos(cx, cy), k.color(...dark), k.anchor("center"), k.fixed(), k.z(53), tag]);
  } else if (state === "ill") {
    k.add([k.rect(r * 1.6, 2), k.pos(cx, cy), k.color(...dark), k.rotate(45), k.anchor("center"), k.fixed(), k.z(53), tag]);
  } else if (state === "dying") {
    k.add([k.rect(r * 1.2, 2), k.pos(cx, cy), k.color(...dark), k.rotate( 45), k.anchor("center"), k.fixed(), k.z(53), tag]);
    k.add([k.rect(r * 1.2, 2), k.pos(cx, cy), k.color(...dark), k.rotate(-45), k.anchor("center"), k.fixed(), k.z(53), tag]);
  } else if (state === "dead") {
    k.add([k.rect(r * 1.8, 3), k.pos(cx, cy), k.color(...dark), k.rotate( 45), k.anchor("center"), k.fixed(), k.z(53), tag]);
    k.add([k.rect(r * 1.8, 3), k.pos(cx, cy), k.color(...dark), k.rotate(-45), k.anchor("center"), k.fixed(), k.z(53), tag]);
  }
  return tag;
}
