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

export function addHighlights(k, cx, cy, w, h, count, color, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const dx = (rng() - 0.5) * w * 0.7;
    const dy = (rng() - 0.5) * h * 0.7;
    const r = 1 + Math.floor(rng() * 2);
    k.add([k.circle(r), k.pos(cx + dx, cy + dy), k.color(...color), k.anchor("center"), k.opacity(0.7)]);
  }
}

export function drawSky(k, tone, dayPhase) {
  const phaseMap = {
    dawn:  { top: PALETTE.skyDawn,  horizon: PALETTE.skyPale, cloudOp: 0.9 },
    day:   { top: PALETTE.sky,      horizon: PALETTE.skyPale, cloudOp: 0.9 },
    dusk:  { top: PALETTE.skyDusk,  horizon: PALETTE.skyDawn, cloudOp: 0.7 },
    night: { top: PALETTE.skyNight, horizon: [42, 42, 74],    cloudOp: 0.3 },
  };
  const phase = (tone === "high")
    ? { top: PALETTE.skyTwilight, horizon: [58, 50, 80], cloudOp: 0.5 }
    : (phaseMap[dayPhase] ?? phaseMap.day);

  k.add([k.rect(640, 180), k.pos(0, 0),   k.color(...phase.top)]);
  k.add([k.rect(640, 40),  k.pos(0, 180), k.color(...phase.horizon), k.opacity(0.7)]);

  const clouds = [];
  for (const [cx, cy, s] of [[80, 60, 1.0], [280, 45, 0.8], [460, 70, 1.1], [580, 35, 0.7]]) {
    clouds.push(drawCloud(k, cx, cy, s, phase.cloudOp));
  }
  return { clouds };
}

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

export function drawGround(k) {
  const TS = 32;
  k.add([k.rect(640, 260), k.pos(0, 260), k.color(...PALETTE.grassMid)]);

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

  for (let y = 264; y < 480; y += 4) {
    const rowProgress = (y - 264) / (480 - 264);
    const trailLeft  = 230 - 230 * rowProgress;
    const trailRight = 410 + (640 - 410) * rowProgress;
    k.add([k.rect(3, 4), k.pos(trailLeft - 3, y), k.color(...PALETTE.grassBorder)]);
    k.add([k.rect(3, 4), k.pos(trailRight,    y), k.color(...PALETTE.grassBorder)]);
  }
}

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

export function drawWagon(k, cx, cy) {
  // Body
  k.add([k.rect(130, 36, { radius: 2 }), k.pos(cx - 65, cy - 5), k.color(...PALETTE.outline)]);
  k.add([k.rect(126, 32, { radius: 2 }), k.pos(cx - 63, cy - 3), k.color(...PALETTE.wood)]);
  for (let i = -55; i < 65; i += 18) {
    k.add([k.rect(2, 28), k.pos(cx + i, cy - 1), k.color(...PALETTE.outline), k.opacity(0.5)]);
  }
  k.add([k.rect(122, 4), k.pos(cx - 61, cy - 1), k.color(...PALETTE.woodLight), k.opacity(0.7)]);

  // Canvas top
  const canvasY = cy - 28;
  k.add([ellipseRect(k, 132, 52), k.pos(cx, canvasY),         k.color(...PALETTE.outline),   k.anchor("center")]);
  k.add([ellipseRect(k, 126, 46), k.pos(cx, canvasY),         k.color(...PALETTE.canvas),    k.anchor("center")]);
  k.add([ellipseRect(k, 122, 42), k.pos(cx + 2, canvasY + 2), k.color(...PALETTE.canvasMid), k.anchor("center"), k.opacity(0.5)]);
  for (let i = -50; i <= 50; i += 24) {
    k.add([k.rect(2, 44), k.pos(cx + i - 1, canvasY - 22), k.color(...PALETTE.outline), k.opacity(0.25)]);
  }

  // Wheels — 6 static spokes, no runtime rotation
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

  // Tongue
  k.add([k.rect(44, 4), k.pos(cx - 100, cy + 18), k.color(...PALETTE.outline)]);
  k.add([k.rect(40, 2), k.pos(cx - 98, cy + 19), k.color(...PALETTE.wood)]);

  // Deterministic mud splatter
  addHighlights(k, cx, cy + 18, 120, 8, 6, PALETTE.dirtDark, seedFrom(cx, cy));

  return {};
}

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
