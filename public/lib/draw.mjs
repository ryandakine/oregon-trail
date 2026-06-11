// Oregon Trail — primitive draw helpers (v3)
// Port of mockups/primitive-mockup.html. See IMPLEMENTATION_PLAN_v3.md § 2.

export const PALETTE = {
  // Sky
  sky:         [109, 128, 250],
  skyPale:     [168, 201, 255],
  skyDawn:     [255, 190, 130],
  skyDusk:     [200, 120, 100],
  skyTwilight: [58, 64, 112],
  skyNight:    [30, 30, 60],

  // Hills / mountains
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

  // Sky detail (gfx pass)
  sunCore:     [255, 238, 175],
  sunGlow:     [255, 215, 130],
  moon:        [226, 228, 216],
  moonShade:   [60, 64, 96],
  skyNightHorizon:    [42, 42, 74],
  skyTwilightHorizon: [58, 50, 80],
  sicklyHorizon:      [197, 208, 122],

  // Terrain detail (gfx pass)
  mountainHaze: [152, 160, 188],
  mountainShade:[84, 96, 128],
  snow:         [238, 242, 248],
  grassDeep:    [108, 156, 44],
  flowerGold:   [236, 204, 92],
  flowerCream:  [246, 240, 222],
  scrubDead:    [126, 106, 70],
  rut:          [88, 56, 28],
  stone:        [150, 142, 132],
  stoneLight:   [186, 178, 168],
  dust:         [205, 180, 140],
  birdDark:     [72, 62, 50],
  straw:        [222, 190, 122],
  silhouetteFar:  [32, 38, 62],
  silhouetteNear: [22, 28, 48],

  // UI
  parchment:   [245, 230, 200],
  parchmentDark: [42, 31, 14],
  parchmentShadow: [200, 175, 130],
  gold:        [212, 160, 23],
  goldBright:  [255, 205, 60],
  dropShadow:  [30, 25, 15],

  // Health
  hpGreen:     [90, 138, 63],
  hpYellow:    [215, 165, 30],
  hpOrange:    [230, 140, 60],
  hpRed:       [178, 34, 34],
  hpDead:      [60, 60, 60],
};

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

  // Stepped gradient: 4 horizontal bands top→horizon, then a soft blend strip.
  const BANDS = 4;
  for (let i = 0; i < BANDS; i++) {
    const col = mixColor(phase.top, phase.horizon, i / (BANDS - 1));
    k.add([k.rect(640, 45), k.pos(0, i * 45), k.color(...col)]);
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
    celestial.add([k.circle(phase.r * 2.3), k.color(...mixColor(PALETTE.sunGlow, phase.horizon, 0.5)), k.opacity(0.25), k.anchor("center")]);
    celestial.add([k.circle(phase.r * 1.55), k.color(...PALETTE.sunGlow), k.opacity(0.35), k.anchor("center")]);
    celestial.add([k.circle(phase.r), k.color(...PALETTE.sunCore), k.anchor("center")]);
  } else if (phase.celestial === "moon") {
    celestial = k.add([k.pos(phase.cx, phase.cy)]);
    celestial.add([k.circle(phase.r * 1.6), k.color(...PALETTE.moon), k.opacity(0.12), k.anchor("center")]);
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

  // Canvas top
  const canvasY = cy - 28;
  k.add([ellipseRect(k, 132, 52), k.pos(cx, canvasY),         k.color(...C(PALETTE.outline)),   k.anchor("center")]);
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
  k.add([k.rect(16, 21, { radius: 4 }), k.pos(cx - 1, cy + 1), k.color(...C(PALETTE.outline))]);
  k.add([k.rect(13, 18, { radius: 3 }), k.pos(cx + 0.5, cy + 2.5), k.color(...C(PALETTE.woodLight))]);
  k.add([k.rect(13, 2), k.pos(cx + 0.5, cy + 6),  k.color(...C(PALETTE.woodDark))]);
  k.add([k.rect(13, 2), k.pos(cx + 0.5, cy + 14), k.color(...C(PALETTE.woodDark))]);

  // Hanging lantern at the rear — stays lit even when dimmed (dusk charm).
  k.add([k.rect(8, 2),  k.pos(cx + 62, cy - 6), k.color(...C(PALETTE.outline))]);
  k.add([k.rect(1, 5),  k.pos(cx + 68, cy - 4), k.color(...C(PALETTE.outline))]);
  k.add([k.circle(5),   k.pos(cx + 68.5, cy + 4), k.color(...PALETTE.gold), k.opacity(dim < 1 ? 0.45 : 0.3), k.anchor("center")]);
  k.add([k.rect(6, 8, { radius: 1 }), k.pos(cx + 65.5, cy + 0), k.color(...PALETTE.goldBright), k.outline(1, k.rgb(...C(PALETTE.outline)))]);

  // Wheels — 6 static spokes, no runtime rotation
  function wheel(wx, wy) {
    const r = 22;
    k.add([k.circle(r + 2), k.pos(wx, wy), k.color(...C(PALETTE.outline)),   k.anchor("center")]);
    k.add([k.circle(r),     k.pos(wx, wy), k.color(...C(PALETTE.woodLight)), k.anchor("center")]);
    k.add([k.circle(r - 3), k.pos(wx, wy), k.color(...C(PALETTE.wood)),      k.anchor("center")]);
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * 360;
      k.add([k.rect(3, r * 2 - 6), k.pos(wx, wy), k.color(...C(PALETTE.outline)), k.rotate(ang), k.anchor("center")]);
    }
    k.add([k.circle(5), k.pos(wx, wy), k.color(...C(PALETTE.outline)),   k.anchor("center")]);
    k.add([k.circle(3), k.pos(wx, wy), k.color(...C(PALETTE.woodLight)), k.anchor("center")]);
  }
  wheel(cx - 42, cy + 26);
  wheel(cx + 42, cy + 26);

  // Deterministic mud splatter
  addHighlights(k, cx, cy + 18, 120, 8, 6, C(PALETTE.dirtDark), seedFrom(cx, cy));

  return {};
}

export function drawOx(k, cx, cy, opts = {}) {
  // Bigger, better-proportioned ox built under one parent (1 root GameObj).
  // opts.animate: 2-frame diagonal leg walk + subtle head bob; toggle at
  // runtime via parent.walking (defaults true when animated).
  const p = k.add([k.pos(cx, cy)]);

  // Legs (kept as refs for the walk cycle), with darker hooves.
  const LEG_Y = 8;
  const legs = [-19, -10, 8, 16].map((lx) => {
    const leg = p.add([k.pos(lx, LEG_Y)]);
    leg.add([k.rect(5, 13), k.pos(0, 0), k.color(...PALETTE.oxBrown), k.outline(1, k.rgb(...PALETTE.outline))]);
    leg.add([k.rect(5, 3),  k.pos(0, 11), k.color(...PALETTE.outline)]);
    return leg;
  });

  // Tail (behind body).
  p.add([k.rect(2, 13), k.pos(25, -8), k.color(...PALETTE.oxDark), k.rotate(8)]);
  p.add([k.circle(2.5), k.pos(27, 5), k.color(...PALETTE.outline), k.anchor("center")]);

  // Body — outline, fill, shoulder hump, cream patch, belly shade.
  p.add([k.rect(52, 28, { radius: 5 }), k.pos(-26, -17), k.color(...PALETTE.outline)]);
  p.add([k.circle(11), k.pos(-15, -14), k.color(...PALETTE.outline), k.anchor("center")]);
  p.add([k.rect(48, 24, { radius: 4 }), k.pos(-24, -15), k.color(...PALETTE.oxBrown)]);
  p.add([k.circle(9),  k.pos(-15, -14), k.color(...PALETTE.oxBrown), k.anchor("center")]);
  p.add([ellipseRect(k, 22, 13), k.pos(8, -3), k.color(...PALETTE.oxCream), k.anchor("center"), k.opacity(0.85)]);
  p.add([k.rect(44, 5), k.pos(-22, 3), k.color(...PALETTE.oxDark), k.opacity(0.3)]);

  // Head — lowered as if pulling; ref kept for the bob. Horns poke up so
  // they stay visible above the yoke beam.
  const HEAD_Y = -6;
  const hd = p.add([k.pos(-30, HEAD_Y)]);
  hd.add([k.polygon([k.vec2(-1, 1), k.vec2(-8, -8), k.vec2(-4, -9), k.vec2(3, 0)]), k.pos(-4, -8), k.color(...PALETTE.canvasMid)]);
  hd.add([k.polygon([k.vec2(-3, 0), k.vec2(4, -9),  k.vec2(8, -8),  k.vec2(1, 1)]), k.pos(4, -8),  k.color(...PALETTE.canvasMid)]);
  hd.add([k.circle(11),  k.pos(0, 0), k.color(...PALETTE.outline), k.anchor("center")]);
  hd.add([k.circle(9.5), k.pos(0, 0), k.color(...PALETTE.oxBrown), k.anchor("center")]);
  hd.add([ellipseRect(k, 11, 8), k.pos(-3, 5), k.color(...PALETTE.oxCream), k.anchor("center"), k.opacity(0.9)]);
  hd.add([k.circle(1.4), k.pos(-2, -3), k.color(...PALETTE.black), k.anchor("center")]);

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
  const phase   = opts.phase ?? Math.random() * Math.PI * 2;

  const p = k.add([k.pos(cx, cy)]);
  p.add([k.rect(14, 26), k.pos(-7, -22), k.color(...PALETTE.outline)]);
  p.add([k.rect(12, 14), k.pos(-6, -20), k.color(...bodyCol)]);
  p.add([k.rect(12, 3),  k.pos(-6, -18), k.color(...PALETTE.shirt)]);
  p.add([k.circle(5.5),  k.pos(0, -26),  k.color(...PALETTE.outline), k.anchor("center")]);
  p.add([k.circle(4.5),  k.pos(0, -26),  k.color(...PALETTE.skin),    k.anchor("center")]);
  if (hat === "felt") {
    p.add([k.rect(16, 2), k.pos(-8, -32), k.color(...PALETTE.outline)]);
    p.add([k.rect(14, 2), k.pos(-7, -31), k.color(...PALETTE.hatFelt)]);
    p.add([k.rect(9, 5),  k.pos(-4.5, -35), k.color(...PALETTE.hatFelt), k.outline(1, k.rgb(...PALETTE.outline))]);
  } else if (hat === "straw") {
    p.add([ellipseRect(k, 18, 4), k.pos(0, -31), k.color(...PALETTE.outline), k.anchor("center")]);
    p.add([ellipseRect(k, 16, 3), k.pos(0, -31), k.color(...PALETTE.straw),   k.anchor("center")]);
    p.add([k.rect(8, 4), k.pos(-4, -36), k.color(...PALETTE.straw), k.outline(1, k.rgb(...PALETTE.outline))]);
  } else {
    p.add([ellipseRect(k, 9, 6),   k.pos(0, -31), k.color(...PALETTE.outline), k.anchor("center")]);
    p.add([ellipseRect(k, 7.5, 5), k.pos(0, -31), k.color(...PALETTE.bonnet),  k.anchor("center")]);
    p.add([k.rect(5, 3), k.pos(-2.5, -29), k.color(...PALETTE.bonnet)]);
  }
  const legL = p.add([k.rect(5, 8), k.pos(-6, -6), k.color(...legCol)]);
  const legR = p.add([k.rect(5, 8), k.pos( 1, -6), k.color(...legCol)]);

  p.baseY = cy;
  p.phase = phase;

  // opts.animate: internal walking bob + alternating leg lift. Static call
  // sites are unchanged (default false); toggle at runtime via p.walking.
  if (opts.animate) {
    p.walking = true;
    p.onUpdate(() => {
      if (!p.walking) return;
      const t = k.time() * 5 + p.phase;
      p.pos.y = p.baseY + Math.sin(t) * 1.5;
      legL.pos.y = -6 + (Math.sin(t) > 0 ? -1.5 : 0);
      legR.pos.y = -6 + (Math.sin(t) <= 0 ? -1.5 : 0);
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
  for (const c of canopy) k.add([k.circle(c.r + 2), k.pos(cx + c.x, cy + c.y), k.color(...PALETTE.outline), k.anchor("center")]);
  for (const c of canopy) k.add([k.circle(c.r),     k.pos(cx + c.x, cy + c.y), k.color(...PALETTE.hillMid),  k.anchor("center")]);
  for (const c of canopy) k.add([k.circle(c.r * 0.4), k.pos(cx + c.x - c.r*0.3, cy + c.y - c.r*0.3), k.color(...PALETTE.hillNear), k.opacity(0.8), k.anchor("center")]);
  addHighlights(k, cx, cy - 40, 80, 60, 8, PALETTE.hillNear, seedFrom(cx, cy));
}

export function drawRock(k, cx, cy, w = 36, h = 22) {
  k.add([ellipseRect(k, w + 2, h + 2), k.pos(cx, cy), k.color(...PALETTE.outline),  k.anchor("center")]);
  k.add([ellipseRect(k, w,     h),     k.pos(cx, cy), k.color(140, 135, 130),        k.anchor("center")]);
  k.add([ellipseRect(k, w * 0.5, h * 0.3), k.pos(cx - w*0.15, cy - h*0.25), k.color(180, 175, 170), k.anchor("center")]);
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
