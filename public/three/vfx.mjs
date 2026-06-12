// Oregon Trail 3D render layer — particle VFX system (M1).
//
// Single THREE.Points ring-buffer (CAPACITY 4096).  Every emitter is
// deterministic: a seeded LCG drives all per-particle randomness so the
// screenshot harness can call reset(seed) + setWeather + simulate(120, 1/60)
// and get identical pixels every run.
//
// ATLAS layout (4×4 grid, 256px per cell, painted procedurally):
//   Row 0:  0=glowSoft  1=smoke  2=flame    3=trace
//   Row 1:  4=debris    5=snow   6=<spare>  7=<spare>
//   Row 2:  8..11 spare
//   Row 3:  12..15 spare
// Only indices 0-5 are authored; cells 6-15 fall back to a painted disc.
//
// MOTION MODEL: the caravan is stationary at the origin; the world scrolls
// +Z.  Weather volumes are always centred on the origin.  wagonDust /
// embers accept world-space coords provided by the integrator.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAPACITY = 4096;
const ATLAS_GRID = 4;
const ATLAS_CELL = 256;

// Named atlas cell indices
const SPR = {
  glowSoft: 0,
  smoke:    1,
  flame:    2,
  trace:    3,
  debris:   4,
  snow:     5,
};

// ---------------------------------------------------------------------------
// Seeded LCG — same coefficients as textures.mjs; independent state.
// NEVER call Math.random() inside this module.
// ---------------------------------------------------------------------------

let _rngSeed = 9973;

function rng() {
  _rngSeed = (_rngSeed * 1103515245 + 12345) & 0x7fffffff;
  return _rngSeed / 0x7fffffff;
}

function rngReseed(s) {
  _rngSeed = (s | 0) & 0x7fffffff;
}

// ---------------------------------------------------------------------------
// Procedural sprite atlas
// ---------------------------------------------------------------------------

/**
 * Paint one atlas cell at canvas position (cx, cy).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx  pixel x of top-left corner
 * @param {number} cy  pixel y of top-left corner
 * @param {number} idx cell index 0-15
 */
function paintCell(ctx, cx, cy, idx) {
  const C = ATLAS_CELL;
  const mx = cx + C / 2;
  const my = cy + C / 2;
  const r  = C / 2;

  ctx.save();
  ctx.clearRect(cx, cy, C, C);

  if (idx === SPR.glowSoft) {
    // Soft radial white disc — additive glow, rain splat, generic
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, r);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.35,'rgba(255,255,255,0.65)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.20)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();

  } else if (idx === SPR.smoke) {
    // Lumpy grey puff — three overlapping radial gradients, slightly off-centre
    const offsets = [[-12, -8, r * 0.62], [0, 6, r * 0.72], [14, -4, r * 0.58]];
    for (const [ox, oy, pr] of offsets) {
      const g = ctx.createRadialGradient(mx + ox, my + oy, 0, mx + ox, my + oy, pr);
      g.addColorStop(0,   'rgba(160,155,148,0.62)');
      g.addColorStop(0.5, 'rgba(140,136,130,0.30)');
      g.addColorStop(1,   'rgba(130,127,122,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx + ox, my + oy, pr, 0, Math.PI * 2); ctx.fill();
    }

  } else if (idx === SPR.flame) {
    // Teardrop warm gradient — orange core, yellow tip, alpha at edges
    const tipY  = cy + C * 0.12;
    const baseY = cy + C * 0.88;
    const g = ctx.createRadialGradient(mx, baseY, 2, mx, tipY, r * 0.9);
    g.addColorStop(0,    'rgba(255,220,60,0.95)');
    g.addColorStop(0.25, 'rgba(255,130,30,0.85)');
    g.addColorStop(0.65, 'rgba(200,60,10,0.40)');
    g.addColorStop(1,    'rgba(160,40,0,0)');
    ctx.fillStyle = g;
    // teardrop path: fat base, tapers to a point at the top
    ctx.beginPath();
    ctx.moveTo(mx, tipY);
    ctx.bezierCurveTo(mx + r * 0.55, my, mx + r * 0.55, baseY, mx, baseY);
    ctx.bezierCurveTo(mx - r * 0.55, baseY, mx - r * 0.55, my, mx, tipY);
    ctx.fill();

  } else if (idx === SPR.trace) {
    // Thin vertical streak — rain line, motion trace
    const g = ctx.createLinearGradient(mx, cy, mx, cy + C);
    g.addColorStop(0,    'rgba(220,235,255,0)');
    g.addColorStop(0.15, 'rgba(220,235,255,0.95)');
    g.addColorStop(0.85, 'rgba(200,220,255,0.95)');
    g.addColorStop(1,    'rgba(200,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(mx - 3, cy, 6, C);

  } else if (idx === SPR.debris) {
    // Small angular speck — dirt chunk, rock fragment
    ctx.fillStyle = 'rgba(180,160,120,0.92)';
    ctx.beginPath();
    // irregular pentagon
    const pts = 5;
    for (let k = 0; k < pts; k++) {
      const a = (k / pts) * Math.PI * 2 - 0.4;
      const rr = r * (0.28 + (k % 2) * 0.18);
      if (k === 0) ctx.moveTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
      else         ctx.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();

  } else if (idx === SPR.snow) {
    // Soft hexagonal dot — white disc with subtle hex outline
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 0.52);
    g.addColorStop(0,    'rgba(255,255,255,1)');
    g.addColorStop(0.6,  'rgba(235,242,255,0.75)');
    g.addColorStop(1,    'rgba(210,230,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, r * 0.52, 0, Math.PI * 2); ctx.fill();
    // faint hex arms
    ctx.strokeStyle = 'rgba(220,235,255,0.35)';
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a) * r * 0.48, my + Math.sin(a) * r * 0.48);
      ctx.stroke();
    }

  } else {
    // Fallback: plain soft disc for unused cells
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 0.72);
    g.addColorStop(0,  'rgba(255,255,255,0.9)');
    g.addColorStop(0.5,'rgba(255,255,255,0.35)');
    g.addColorStop(1,  'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, r * 0.72, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function buildAtlasTexture() {
  const SIZE = ATLAS_GRID * ATLAS_CELL;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < ATLAS_GRID * ATLAS_GRID; i++) {
    const cx = (i % ATLAS_GRID) * ATLAS_CELL;
    const cy = Math.floor(i / ATLAS_GRID) * ATLAS_CELL;
    paintCell(ctx, cx, cy, i);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace   = THREE.SRGBColorSpace;
  tex.minFilter    = THREE.LinearFilter;
  tex.magFilter    = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ---------------------------------------------------------------------------
// Shader source — gl_PointSize projects world-size to screen pixels,
// atlas UV with per-point rotation, fade-in first 25% of life.
// ---------------------------------------------------------------------------

const VERT = /* glsl */`
  attribute vec3  aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSprite;
  attribute float aRot;
  varying   vec3  vColor;
  varying   float vAlpha;
  varying   float vSprite;
  varying   float vRot;
  uniform   float uScale;

  void main() {
    vColor  = aColor;
    vAlpha  = aAlpha;
    vSprite = aSprite;
    vRot    = aRot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 0.5, 120.0);
    gl_Position  = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uAtlas;
  varying vec3  vColor;
  varying float vAlpha;
  varying float vSprite;
  varying float vRot;

  void main() {
    // rotate gl_PointCoord around cell centre
    vec2 pc = gl_PointCoord - 0.5;
    float cs = cos(vRot), sn = sin(vRot);
    pc = vec2(pc.x * cs - pc.y * sn, pc.x * sn + pc.y * cs);
    pc = clamp(pc + 0.5, 0.01, 0.99);

    float idx  = floor(vSprite + 0.5);
    float grid = ${ATLAS_GRID}.0;
    vec2 cell  = vec2(mod(idx, grid), floor(idx / grid));
    vec2 uv    = (cell + pc) / grid;
    uv.y = 1.0 - uv.y;   // canvas row-0 = visual top

    vec4 tex   = texture2D(uAtlas, uv);
    float lum  = max(tex.r, max(tex.g, tex.b));
    if (lum * vAlpha < 0.012) discard;
    gl_FragColor = vec4(vColor * tex.rgb, vAlpha * tex.a);
  }
`;

// ---------------------------------------------------------------------------
// createVfx — public factory
// ---------------------------------------------------------------------------

export function createVfx() {
  // ---- Float32 pools -------------------------------------------------------
  const pos    = new Float32Array(CAPACITY * 3);
  const vel    = new Float32Array(CAPACITY * 3);
  const col    = new Float32Array(CAPACITY * 3);
  const size   = new Float32Array(CAPACITY);
  const life   = new Float32Array(CAPACITY);
  const maxLif = new Float32Array(CAPACITY);
  const grav   = new Float32Array(CAPACITY);
  const alpha  = new Float32Array(CAPACITY);
  const sprite = new Float32Array(CAPACITY);
  const rot    = new Float32Array(CAPACITY);

  let head = 0;  // ring-buffer write head

  // ---- Geometry ------------------------------------------------------------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,    3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(col,    3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(size,   1));
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alpha,  1));
  geo.setAttribute('aSprite',  new THREE.BufferAttribute(sprite, 1));
  geo.setAttribute('aRot',     new THREE.BufferAttribute(rot,    1));
  // Bounding sphere covers the full weather volume and then some
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -13), 80);

  // ---- Material ------------------------------------------------------------
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite:  false,
    // AdditiveBlending saturates dark smoke; CustomBlending lets us do
    // additive-ish (src=One, dst=OneMinusSrcAlpha) which keeps smoke visible
    // while still brightening embers/rain.
    blending:         THREE.CustomBlending,
    blendSrc:         THREE.SrcAlphaFactor,
    blendDst:         THREE.OneMinusSrcAlphaFactor,
    blendEquation:    THREE.AddEquation,
    uniforms: {
      uScale: { value: 600 },
      uAtlas: { value: buildAtlasTexture() },
    },
    vertexShader:   VERT,
    fragmentShader: FRAG,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder   = 6;  // above terrain, below HUD

  // ---- Scratch colour to avoid per-spawn allocation -----------------------
  const _c = new THREE.Color();

  // ---- Internal spawn ------------------------------------------------------
  /**
   * Write one particle into the ring buffer.
   * @param {number}             x,y,z    world position
   * @param {number}             vx,vy,vz initial velocity (world units / sec)
   * @param {number|THREE.Color} color    hex int or Color instance
   * @param {number}             sz       world-space size in units
   * @param {number}             lifetime seconds
   * @param {number}             gravity  downward accel (positive = down; applied as -gravity to vy each tick)
   * @param {number}             spr      atlas cell index
   * @param {number}             rota     initial rotation in radians
   */
  function _spawn(x, y, z, vx, vy, vz, color, sz, lifetime, gravity, spr, rota) {
    const i = head;
    head = (head + 1) % CAPACITY;

    pos[i * 3]     = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3]     = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;

    _c.set(color);
    col[i * 3]     = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;

    size[i]   = sz;
    life[i]   = lifetime;
    maxLif[i] = lifetime;
    grav[i]   = gravity;
    alpha[i]  = 0;        // starts transparent, fade-in logic in update()
    sprite[i] = spr;
    rot[i]    = rota;
  }

  // ---- Weather state -------------------------------------------------------
  let _weatherKind      = 'none';
  let _weatherIntensity = 0;

  // ---- update() internals --------------------------------------------------
  function _stepPool(dt) {
    for (let i = 0; i < CAPACITY; i++) {
      if (life[i] <= 0) {
        if (size[i] !== 0) size[i] = 0;
        continue;
      }
      life[i] -= dt;
      // fade-in: first 25% of lifetime, fade-out: last 25%
      const f = Math.max(0, life[i] / maxLif[i]);
      const fadeIn  = 1 - f;                     // 0→1 over first 25% of total
      const fadeInA = fadeIn < 0.25 ? fadeIn * 4 : 1.0;
      const fadeOut = f < 0.25 ? f * 4 : 1.0;
      alpha[i] = fadeInA * fadeOut;

      // gravity is stored as downward-positive; subtract from vy
      vel[i * 3 + 1] -= grav[i] * dt;

      pos[i * 3]     += vel[i * 3]     * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

      if (life[i] <= 0) {
        size[i]  = 0;
        alpha[i] = 0;
      }
    }
  }

  function _markDirty() {
    const a = geo.attributes;
    a.position.needsUpdate = true;
    a.aSize.needsUpdate    = true;
    a.aAlpha.needsUpdate   = true;
    a.aColor.needsUpdate   = true;
    a.aSprite.needsUpdate  = true;
    a.aRot.needsUpdate     = true;
  }

  // ---- Continuous weather emitters ----------------------------------------
  // All spawn-probability gates use rng(), not Math.random().

  function _emitRain(dt, intensity) {
    // number of particles to spawn this frame: rate × dt × intensity.
    // Tuned against screenshots: at 180/s with a ~1s fall the steady state was
    // ~180 specks of 0.05u spread over a 56×54u volume — literally invisible.
    // Rain has to READ: ~500 streaks at 0.2-0.35u world size.
    const rate = 700 * intensity;
    const count = Math.floor(rate * dt + (rng() < (rate * dt % 1) ? 1 : 0));
    for (let i = 0; i < count; i++) {
      // Volume hugs the camera/caravan zone (cameras live in z -10..+12):
      // rain reads from streaks NEAR the lens; drops 30u out are sub-pixel.
      const x  = (rng() - 0.5) * 44;           // ±22
      const z  = -22 + rng() * 36;             // -22 to +14
      const y  = 8 + rng() * 6;                // spawn height 8-14
      const vx = (rng() - 0.5) * 0.8;
      const vy = -12 - rng() * 3;
      const vz = (rng() - 0.5) * 0.4;
      const lt = (y - 0) / Math.abs(vy) * (0.9 + rng() * 0.2); // time to ground
      // cool blue-grey
      const br = 0.75 + rng() * 0.25;
      _c.setRGB(br * 0.76, br * 0.84, br * 1.0);
      _spawn(x, y, z, vx, vy, vz, _c, 0.2 + rng() * 0.15, lt, 0, SPR.trace, 0);
    }
  }

  function _emitSnow(dt, intensity) {
    const rate = 60 * intensity;
    const count = Math.floor(rate * dt + (rng() < (rate * dt % 1) ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const x  = (rng() - 0.5) * 56;
      const z  = -40 + rng() * 54;
      const y  = 10 + rng() * 6;
      const vx = (rng() - 0.5) * 0.6;
      const vy = -1.5 - rng() * 0.5;
      const vz = (rng() - 0.5) * 0.6;
      const lt = (y / Math.abs(vy)) * (0.85 + rng() * 0.30);
      _spawn(x, y, z, vx, vy, vz, 0xeef4ff, 0.12 + rng() * 0.08, lt, 0.1, SPR.snow, rng() * Math.PI * 2);
    }
  }

  function _emitDust(dt, intensity) {
    const rate = 90 * intensity;
    const count = Math.floor(rate * dt + (rng() < (rate * dt % 1) ? 1 : 0));
    for (let i = 0; i < count; i++) {
      // Spawn from the windward side (+x) and blow toward -x
      const x  = 28 + rng() * 8;
      const y  = 0.2 + rng() * 3.5;
      const z  = -40 + rng() * 54;
      const vx = -(7 + rng() * 3);
      const vy =  0.3 + rng() * 0.8;
      const vz = (rng() - 0.5) * 1.5;
      const lt = 2.0 + rng() * 2.0;
      // Tan/ochre tones from PALETTE.dust [205,180,140]
      const br = 0.7 + rng() * 0.3;
      _c.setRGB(br * 0.80, br * 0.70, br * 0.55);
      _spawn(x, y, z, vx, vy, vz, _c, 0.5 + rng() * 0.6, lt, 0.5, SPR.smoke, rng() * Math.PI * 2);
    }
  }

  // ---- Public emitters -----------------------------------------------------

  /**
   * Dust puffs from wheel positions.
   * @param {number} x  world-space X
   * @param {number} y  world-space Y (wheel contact height)
   * @param {number} z  world-space Z
   */
  function wagonDust(x, y, z) {
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const vx = (rng() - 0.5) * 1.4;
      const vy =  1.2 + rng() * 1.6;
      const vz = (rng() - 0.5) * 1.0;
      const br = 0.65 + rng() * 0.25;
      _c.setRGB(br * 0.80, br * 0.70, br * 0.52);
      _spawn(x + (rng() - 0.5) * 0.4, y + 0.05, z + (rng() - 0.5) * 0.4,
        vx, vy, vz, _c, 0.22 + rng() * 0.18, 1.2 + rng() * 0.8, 0.35, SPR.smoke,
        rng() * Math.PI * 2);
    }
  }

  /**
   * Campfire: 70% warm flame tongues (grav -0.4) + 30% smoke puffs (grav -0.25).
   * @param {number} x,y,z  world-space fire position (base of flames)
   */
  function embers(x, y, z) {
    // Called each frame; spawn at ~8/sec total
    if (rng() > 0.133) return;   // gate: ~8 calls/sec on average

    if (rng() < 0.30) {
      // smoke puff
      _spawn(
        x + (rng() - 0.5) * 0.3, y + 1.0, z + (rng() - 0.5) * 0.3,
        (rng() - 0.5) * 0.35, 0.8 + rng() * 0.5, (rng() - 0.5) * 0.35,
        0x4a3e36, 0.55 + rng() * 0.35, 1.8 + rng() * 0.9,
        -0.25,   // negative = upward accel
        SPR.smoke, rng() * Math.PI * 2,
      );
    } else {
      // flame tongue
      const warm = rng() < 0.4 ? 0xffd14d : 0xff7a2a;
      _spawn(
        x + (rng() - 0.5) * 0.5, y + 0.5, z + (rng() - 0.5) * 0.5,
        (rng() - 0.5) * 0.5, 1.6 + rng() * 1.2, (rng() - 0.5) * 0.5,
        warm, 0.18 + rng() * 0.10, 0.8 + rng() * 0.6,
        -0.4,   // negative = upward accel
        SPR.flame, (rng() - 0.5) * 0.8,
      );
    }
  }

  // ---- Core update (live RAF path) ----------------------------------------
  function update(dt) {
    // Continuous weather emission
    if (_weatherKind === 'rain'  && _weatherIntensity > 0) _emitRain(dt, _weatherIntensity);
    if (_weatherKind === 'snow'  && _weatherIntensity > 0) _emitSnow(dt, _weatherIntensity);
    if (_weatherKind === 'dust'  && _weatherIntensity > 0) _emitDust(dt, _weatherIntensity);

    _stepPool(dt);
    _markDirty();
  }

  // ---- Deterministic simulate (harness path) ------------------------------
  /**
   * Run n fixed-timestep ticks — identical to update() but no RAF dependency.
   * @param {number} nSteps
   * @param {number} dt  seconds per step (default 1/60)
   */
  function simulate(nSteps, dt = 1 / 60) {
    for (let s = 0; s < nSteps; s++) {
      if (_weatherKind === 'rain'  && _weatherIntensity > 0) _emitRain(dt, _weatherIntensity);
      if (_weatherKind === 'snow'  && _weatherIntensity > 0) _emitSnow(dt, _weatherIntensity);
      if (_weatherKind === 'dust'  && _weatherIntensity > 0) _emitDust(dt, _weatherIntensity);
      _stepPool(dt);
    }
    _markDirty();
  }

  // ---- Control API --------------------------------------------------------

  /**
   * Reset the particle system to a clean slate.
   * @param {number} seed  LCG seed; use a constant across runs for reproducibility.
   */
  function reset(seed = 9973) {
    rngReseed(seed);
    life.fill(0);
    size.fill(0);
    alpha.fill(0);
    head = 0;
    _weatherKind      = 'none';
    _weatherIntensity = 0;
    _markDirty();
  }

  /**
   * @param {'none'|'rain'|'snow'|'dust'} kind
   * @param {number} intensity  0..1
   */
  function setWeather(kind, intensity) {
    _weatherKind      = kind;
    _weatherIntensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Update gl_PointSize scale when the viewport or FOV changes.
   * Call whenever the renderer is resized.
   * @param {number} heightPx  renderer height in device pixels
   * @param {number} fovDeg    vertical FOV of the camera
   */
  function setViewport(heightPx, fovDeg) {
    mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** Release GPU resources. */
  function dispose() {
    geo.dispose();
    mat.uniforms.uAtlas.value.dispose();
    mat.dispose();
  }

  return {
    /** Add to scene: scene.add(vfx.points) */
    points,
    update,
    simulate,
    reset,
    setWeather,
    wagonDust,
    embers,
    setViewport,
    dispose,
  };
}
