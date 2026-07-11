// public/three/sky.mjs — Oregon Trail 3D render layer: procedural sky (M1).
//
// Architecture constraints:
//   • Plain ESM, no build step. `three` and `three/addons/...` resolve via the
//     importmap in index.html against /vendor/three/.
//   • Owns EXACTLY this file. No edits to any other file.
//   • ALL randomness deterministic (seeded LCG / coordinate-hash). No Math.random().
//   • Dispose-friendly: every GPU resource is reachable via the returned object.
//   • update(dt, t, cameraPos) is a pure function of t for visual state — no
//     wall-clock dependency. dt is used only for cloud drift (also driven by t).
//
// PALETTE anchors from draw.mjs (RGB → 0xRRGGBB):
//   sky          [109,128,250] 0x6d80fa
//   skyPale      [168,201,255] 0xa8c9ff
//   skyDawn      [255,190,130] 0xffbe82
//   skyDusk      [200,120,100] 0xc87864
//   skyTwilight  [58,64,112]   0x3a4070
//   skyNight     [30,30,60]    0x1e1e3c
//   sunCore      [255,238,175] 0xffeaaf
//   sunGlow      [255,215,130] 0xffd782
//   moon         [226,228,216] 0xe2e4d8
//   skyNightHorizon     [42,42,74]   0x2a2a4a
//   skyTwilightHorizon  [58,50,80]   0x3a3250
//   sicklyHorizon       [197,208,122] 0xc5d07a  (not used but noted)

import * as THREE from 'three';
import { PALETTE } from '../lib/palette.mjs';

// ─── Seeded LCG ─────────────────────────────────────────────────────────────
// Lehmer / Park-Miller LCG.  All procedural randomness routes through here so
// runs produce identical geometry for pixel-diff regression.

function lcgCreate(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    // multiplier 1664525, increment 1013904223 (Numerical Recipes)
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ─── Palette helpers ─────────────────────────────────────────────────────────

function rgb(r, g, b) {
  // Palette values are sRGB bytes (from palette.mjs); three.js lights/shaders work
  // in LINEAR space. Passing sRGB bytes through raw systematically over-brightens
  // and desaturates the whole sky/fog/light pipeline (ACES then renders it as a
  // pastel wash — verified by probing uZenith at runtime).
  return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
}

/** Named key from palette.mjs → linear THREE.Color */
function prgb(key) {
  const c = PALETTE[key];
  return rgb(c[0], c[1], c[2]);
}

function lerpColor(out, a, b, t) {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

// Hermite (smoothstep) ease in [0,1]
function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// ─── Time-of-day keyframes ────────────────────────────────────────────────────
// t in [0, 1): 0 = midnight, 0.25 = dawn, 0.50 = noon, 0.75 = dusk.
//
// Each entry: { zenith, horizon, sunColor, sunIntensity,
//               hemiSky, hemiGround, hemiIntensity,
//               fogColor, ambientBoost }
//
// All THREE.Color instances are pre-allocated and reused.  lerpPalette()
// writes into a pre-allocated output object to avoid per-frame allocations.

const KEYS = [
  // t=0.00  midnight
  {
    t: 0.00,
    zenith:        prgb('skyNight'),
    horizon:       prgb('skyNightHorizon'),
    sunColor:      rgb(100, 110, 180),   // cool blue moonlight
    sunIntensity:  0.12,
    hemiSky:       rgb(40, 50, 90),
    hemiGround:    rgb(20, 25, 35),
    hemiIntensity: 0.10,
    fogColor:      rgb(25, 28, 52),
    ambientBoost:  0.0,
  },
  // t=0.20  pre-dawn twilight
  {
    t: 0.20,
    zenith:        prgb('skyTwilight'),
    horizon:       prgb('skyTwilightHorizon'),
    sunColor:      rgb(180, 140, 100),
    sunIntensity:  0.30,
    hemiSky:       rgb(80, 85, 130),
    hemiGround:    rgb(45, 50, 50),
    hemiIntensity: 0.18,
    fogColor:      rgb(60, 58, 88),
    ambientBoost:  0.05,
  },
  // t=0.25  dawn
  {
    t: 0.25,
    zenith:        prgb('sky'),
    horizon:       prgb('skyDawn'),
    sunColor:      prgb('sunGlow'),
    sunIntensity:  1.40,
    hemiSky:       prgb('skyPale'),
    hemiGround:    prgb('hemiGround'),
    hemiIntensity: 0.30,
    fogColor:      rgb(220, 185, 150),
    ambientBoost:  0.10,
  },
  // t=0.38  morning (between dawn and noon)
  {
    t: 0.38,
    zenith:        prgb('sky'),
    horizon:       rgb(138, 172, 242),   // skyPale deepened — pure skyPale washes white under ACES
    sunColor:      prgb('sunCore'),
    sunIntensity:  2.60,
    hemiSky:       rgb(207, 232, 255),
    hemiGround:    prgb('hemiGround'),
    hemiIntensity: 0.50,
    fogColor:      rgb(184, 212, 232),
    ambientBoost:  0.15,
  },
  // t=0.50  noon
  {
    t: 0.50,
    zenith:        rgb(85, 110, 240),    // slightly deeper blue at zenith
    horizon:       prgb('skyPale'),
    sunColor:      prgb('sunCore'),
    sunIntensity:  3.00,
    hemiSky:       rgb(207, 232, 255),
    hemiGround:    prgb('hemiGround'),
    hemiIntensity: 0.55,
    fogColor:      rgb(190, 215, 235),
    ambientBoost:  0.18,
  },
  // t=0.68  golden hour approach
  {
    t: 0.68,
    zenith:        rgb(109, 128, 200),
    horizon:       rgb(230, 160, 100),
    sunColor:      rgb(255, 220, 140),   // warm gold
    sunIntensity:  2.50,
    hemiSky:       rgb(200, 210, 255),
    hemiGround:    rgb(90, 80, 45),
    hemiIntensity: 0.42,
    fogColor:      rgb(210, 175, 135),
    ambientBoost:  0.12,
  },
  // t=0.75  dusk
  {
    t: 0.75,
    zenith:        prgb('skyTwilight'),
    horizon:       prgb('skyDusk'),
    sunColor:      rgb(220, 100, 60),    // fiery dusk
    sunIntensity:  1.20,
    hemiSky:       rgb(140, 110, 160),
    hemiGround:    rgb(70, 50, 35),
    hemiIntensity: 0.22,
    fogColor:      rgb(160, 105, 88),
    ambientBoost:  0.08,
  },
  // t=0.85  after-sunset twilight
  {
    t: 0.85,
    zenith:        rgb(40, 44, 90),
    horizon:       rgb(80, 55, 90),
    sunColor:      rgb(120, 80, 100),
    sunIntensity:  0.25,
    hemiSky:       rgb(60, 65, 110),
    hemiGround:    rgb(30, 30, 40),
    hemiIntensity: 0.12,
    fogColor:      rgb(50, 48, 78),
    ambientBoost:  0.02,
  },
  // t=1.00  wraps back to midnight (duplicate entry for wrap math)
  {
    t: 1.00,
    zenith:        rgb(30, 30, 60),
    horizon:       rgb(42, 42, 74),
    sunColor:      rgb(100, 110, 180),
    sunIntensity:  0.12,
    hemiSky:       rgb(40, 50, 90),
    hemiGround:    rgb(20, 25, 35),
    hemiIntensity: 0.10,
    fogColor:      rgb(25, 28, 52),
    ambientBoost:  0.0,
  },
];

// Pre-allocated output for lerpPalette — zero per-frame heap.
const _pal = {
  zenith:        new THREE.Color(),
  horizon:       new THREE.Color(),
  sunColor:      new THREE.Color(),
  sunIntensity:  0,
  hemiSky:       new THREE.Color(),
  hemiGround:    new THREE.Color(),
  hemiIntensity: 0,
  fogColor:      new THREE.Color(),
  ambientBoost:  0,
};

function lerpPalette(t) {
  // Find the bracketing keyframes.
  let lo = KEYS[0], hi = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t < KEYS[i + 1].t) {
      lo = KEYS[i];
      hi = KEYS[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t;
  const raw  = span < 1e-9 ? 0 : (t - lo.t) / span;
  const f    = smoothstep(raw);   // hermite ease

  lerpColor(_pal.zenith,     lo.zenith,     hi.zenith,     f);
  lerpColor(_pal.horizon,    lo.horizon,    hi.horizon,    f);
  lerpColor(_pal.sunColor,   lo.sunColor,   hi.sunColor,   f);
  lerpColor(_pal.hemiSky,    lo.hemiSky,    hi.hemiSky,    f);
  lerpColor(_pal.hemiGround, lo.hemiGround, hi.hemiGround, f);
  lerpColor(_pal.fogColor,   lo.fogColor,   hi.fogColor,   f);
  _pal.sunIntensity  = lo.sunIntensity  + (hi.sunIntensity  - lo.sunIntensity)  * f;
  _pal.hemiIntensity = lo.hemiIntensity + (hi.hemiIntensity - lo.hemiIntensity) * f;
  _pal.ambientBoost  = lo.ambientBoost  + (hi.ambientBoost  - lo.ambientBoost)  * f;
  return _pal;
}

// ─── Sun/moon direction ───────────────────────────────────────────────────────
// t in [0,1).  Sun rises NE, arcs south, sets NW.  Moon follows −sunDir.
// Elevation arc: peaks at noon (t=0.5), below horizon for t in [~0.0, ~0.18]
// and [~0.82, ~1.0].  Azimuth sweeps 180° over the visible arc.

const _sunDir = new THREE.Vector3();

function sunDirAt(t) {
  // Map t to an angle: 0=midnight → π below horizon, 0.5=noon → π/2 above.
  const angle = (t - 0.25) * 2 * Math.PI; // -π/2 at midnight, +π/2 at noon
  const elevation = Math.sin(angle);       // -1..+1, positive = above horizon

  // Azimuth: sweeps from east (t=0.25 dawn) through south (t=0.5) to west (t=0.75)
  const azimuth = (t - 0.5) * Math.PI;    // -π/2..+π/2 across the day arc

  // Never exactly zenith: cap elevation slightly below 1.
  const elev = Math.max(-1, Math.min(0.98, elevation));

  // Convert spherical to cartesian (Y-up world):
  //   x = cos(elev)*sin(azimuth)   (+x = east)
  //   y = sin(elev)                (+y = up)
  //   z = cos(elev)*cos(azimuth)   (+z = south/toward camera)
  const cosE = Math.sqrt(1 - elev * elev);
  _sunDir.set(
    cosE * Math.sin(azimuth),
    elev,
    cosE * Math.cos(azimuth),
  );
  return _sunDir.clone().normalize();
}

// ─── Dome shader ──────────────────────────────────────────────────────────────
// 3-stop vertical gradient (zenith / horizon / below-horizon haze) driven by
// uniforms updated each frame.  Sun glow: two phong lobes (wide warm + tight
// core) toward uSunDir.  Moon disc lobe at -uSunDir, faded in at night.
// Stars are rendered separately (see star geometry below).

const DOME_VERT = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAG = /* glsl */`
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;       // below-horizon haze colour
  uniform vec3 uSunDir;     // normalised; moon is at -uSunDir
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform float uMoonStrength;  // 0=day, 1=night
  uniform float uNightFade;     // 0=day, 1=night  (for stars / moon)

  varying vec3 vWorldPos;

  void main() {
    vec3 dir = normalize(vWorldPos);

    // ── 3-stop vertical gradient ──
    float y = dir.y;                          // -1 (nadir) .. +1 (zenith)
    // Blue must arrive CLOSE to the horizon: at typical gameplay camera angles
    // the visible sky band is y in [0.0, 0.3], so a 0.6 blend ceiling renders
    // the whole frame in horizon color (washed white at midday).
    float aboveHorizon = smoothstep(-0.08, 0.14, y);
    float skyBlend     = smoothstep(0.02,  0.32, y);
    // Horizon warmth concentrates on the SUN's side of the sky (dawn/dusk glow
    // hugging the sun azimuth) instead of ringing the whole horizon — a uniform
    // warm ring mixed with blue reads as milky overcast.
    vec3 flatDir = normalize(vec3(dir.x, 0.0, dir.z));
    vec3 flatSun = normalize(vec3(uSunDir.x, 0.0001, uSunDir.z));
    float sunSide = pow(max(dot(flatDir, flatSun), 0.0), 2.5);
    vec3 horizonCol = mix(mix(uHorizon, uZenith, 0.55), uHorizon, sunSide);
    vec3 col = mix(uHaze, horizonCol, aboveHorizon);
    col = mix(col, uZenith, skyBlend * aboveHorizon);

    // ── Sun: wide warm glow + tight core ──
    float sunDot  = max(dot(dir, uSunDir), 0.0);
    float sunWide = pow(sunDot, 8.0);
    float sunCore = pow(sunDot, 90.0);
    col += uSunColor * uSunIntensity * sunWide * 0.28;
    col += uSunColor * uSunIntensity * sunCore * 0.60;

    // ── Moon disc at -sunDir (night only) ──
    vec3 moonDir = -uSunDir;
    float moonDot  = max(dot(dir, moonDir), 0.0);
    float moonWide = pow(moonDot, 14.0);
    float moonDisc = pow(moonDot, 800.0);
    // Moon colour from draw.mjs palette: [226,228,216]
    vec3 moonCol = vec3(0.887, 0.894, 0.847);
    col += moonCol * uMoonStrength * moonWide * 0.12;
    col += moonCol * uMoonStrength * moonDisc * 1.20;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ─── Stars ────────────────────────────────────────────────────────────────────
// Deterministic Points geometry.  Faded by uNightFade uniform.

const STAR_COUNT = 380;
const STAR_SEED  = 0x57A125;   // arbitrary constant; never change (pixel-diff)

function buildStars() {
  const rng = lcgCreate(STAR_SEED);
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes     = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    // Fibonacci-sphere-ish but cheap: rejection-sample upper hemisphere bias,
    // then full sphere — deterministic via LCG.
    const u     = rng() * 2 - 1;           // cos(inclination)
    const theta = rng() * 2 * Math.PI;     // azimuth
    const sinI  = Math.sqrt(Math.max(0, 1 - u * u));
    // Position on radius 580 (just inside dome at 600).
    positions[i * 3]     = sinI * Math.cos(theta) * 580;
    positions[i * 3 + 1] = u * 580;
    positions[i * 3 + 2] = sinI * Math.sin(theta) * 580;
    sizes[i] = 1.2 + rng() * 2.4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes,     1));

  const mat = new THREE.PointsMaterial({
    color: 0xe8e8f0,
    size: 2.0,
    sizeAttenuation: false,
    fog: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const stars = new THREE.Points(geo, mat);
  stars.renderOrder = -9;
  return stars;
}

// ─── Clouds ───────────────────────────────────────────────────────────────────
// 8-14 deterministic billboarded sprites.  Positions/phases seeded; drift
// integrates time t (pure function, no internal wall-clock).

const CLOUD_SEED     = 0xC10ADF5;
const CLOUD_COUNT    = 11;          // within [8, 14]
const CLOUD_WRAP_X   = 500;         // half-width of the x wrap range
const CLOUD_Y_MIN    = 120;
const CLOUD_Y_MAX    = 200;
const CLOUD_Z_MIN    = -80;
const CLOUD_Z_MAX    = 120;

function buildClouds(cloudTexture) {
  const rng = lcgCreate(CLOUD_SEED);
  const sprites = [];
  const phases  = [];   // x-drift phase per cloud [0, CLOUD_WRAP_X*2)
  const drifts  = [];   // drift speed per cloud (world-units / s of t)

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      fog: false,
      depthWrite: false,
      opacity: 0.82,
    });
    const sprite = new THREE.Sprite(mat);

    const scaleW = 100 + rng() * 160;
    const scaleH = scaleW * (0.35 + rng() * 0.20);
    sprite.scale.set(scaleW, scaleH, 1);

    const startX = (rng() * 2 - 1) * CLOUD_WRAP_X;
    const y      = CLOUD_Y_MIN + rng() * (CLOUD_Y_MAX - CLOUD_Y_MIN);
    const z      = CLOUD_Z_MIN + rng() * (CLOUD_Z_MAX - CLOUD_Z_MIN);
    sprite.position.set(startX, y, z);

    // Store initial X as phase anchor so drift is relative-to-start.
    phases.push(startX);
    // Drift 0.3–1.2 world-units per normalised t unit (i.e. per full day).
    drifts.push(0.3 + rng() * 0.9);

    sprite.renderOrder = -8;
    sprites.push(sprite);
  }

  return { sprites, phases, drifts };
}

// ─── Main factory ─────────────────────────────────────────────────────────────

/**
 * createSky({ cloudTexture })
 *
 * @param {Object}       opts
 * @param {THREE.Texture} opts.cloudTexture  — Caller-supplied sprite texture.
 *
 * @returns {{
 *   group:     THREE.Group,
 *   update:    (dt: number, t: number, cameraPos: THREE.Vector3) => void,
 *   sunDirAt:  (t: number) => THREE.Vector3,
 *   applyTo:   (targets: { sun, hemi, scene }, t: number) => object,
 *   dispose:   () => void,
 * }}
 */
export function createSky({ cloudTexture }) {
  const group = new THREE.Group();
  group.name = 'sky';

  // ── Dome ──
  const domeGeo = new THREE.SphereGeometry(600, 32, 20);

  const domeUniforms = {
    uZenith:        { value: new THREE.Color(0x1e1e3c) },
    uHorizon:       { value: new THREE.Color(0x2a2a4a) },
    uHaze:          { value: new THREE.Color(0x18182e) },
    uSunDir:        { value: new THREE.Vector3(0, 1, 0) },
    uSunColor:      { value: new THREE.Color(0xffeaaf) },
    uSunIntensity:  { value: 0.12 },
    uMoonStrength:  { value: 1.0 },
    uNightFade:     { value: 1.0 },
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms:       domeUniforms,
    vertexShader:   DOME_VERT,
    fragmentShader: DOME_FRAG,
    side:           THREE.BackSide,
    fog:            false,
    depthWrite:     false,
  });

  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  group.add(dome);

  // ── Stars ──
  const stars = buildStars();
  group.add(stars);

  // ── Clouds ──
  const { sprites: cloudSprites, phases: cloudPhases, drifts: cloudDrifts } =
    buildClouds(cloudTexture);
  const cloudGroup = new THREE.Group();
  for (const s of cloudSprites) cloudGroup.add(s);
  group.add(cloudGroup);

  // ── Internal state ──
  const _tmpSunDir = new THREE.Vector3();

  // Overcast 0..1 — storms grey the dome, desaturate + dim the sun, raise cloud
  // cover. Applied to the palette in both update() and applyTo() so the dome,
  // lights, and fog all darken together (particles alone don't read as a storm).
  let _overcast = 0;
  const _ovTint = rgb(150, 152, 156); // overwritten by setOvercast(v, color)
  function applyOvercast(pal) {
    const k = _overcast;
    if (k <= 0) return pal;
    pal.zenith.lerp(_ovTint, 0.72 * k);
    pal.horizon.lerp(_ovTint, 0.82 * k);
    pal.fogColor.lerp(_ovTint, 0.78 * k);
    pal.hemiSky.lerp(_ovTint, 0.6 * k);
    pal.sunColor.lerp(_ovTint, 0.7 * k);
    pal.sunIntensity *= (1 - 0.78 * k);
    pal.hemiIntensity *= (1 - 0.18 * k);
    return pal;
  }

  // ── update ────────────────────────────────────────────────────────────────
  // Pure function of t for all visual state (dt used only for cloud drift
  // which is also driven by t so remains deterministic across equal-t calls).

  function update(dt, t, cameraPos) {
    // Ride the camera (dome must follow so it's always centred on the viewer).
    if (cameraPos) {
      group.position.copy(cameraPos);
    }

    const pal = applyOvercast(lerpPalette(t));
    const sunDir = sunDirAt(t);

    // ── Dome uniforms ──
    domeUniforms.uZenith.value.copy(pal.zenith);
    domeUniforms.uHorizon.value.copy(pal.horizon);

    // Haze: below-horizon colour blends fog toward the zenith for continuity.
    domeUniforms.uHaze.value.copy(pal.fogColor).lerp(pal.zenith, 0.15);

    domeUniforms.uSunDir.value.copy(sunDir);
    domeUniforms.uSunColor.value.copy(pal.sunColor);
    domeUniforms.uSunIntensity.value = pal.sunIntensity;

    // Night fade: smooth 0 (day) → 1 (night) based on sun elevation.
    const sunElevation = sunDir.y;  // -1..+1
    const nightFade = smoothstep(1 - Math.max(0, Math.min(1, (sunElevation + 0.15) / 0.35)));
    domeUniforms.uMoonStrength.value  = nightFade;
    domeUniforms.uNightFade.value     = nightFade;

    // ── Stars opacity ──
    stars.material.opacity = nightFade * 0.95;

    // ── Cloud drift (deterministic: position = phase + driftSpeed * t * fullDayUnits) ──
    // We use t as the time source so the same t always gives the same cloud
    // position, making screenshots pixel-stable.
    const dayUnits = 400;   // world-units to traverse over one full t cycle
    const cloudOpacityDay = 0.82;
    const cloudOpacityNight = 0.22;
    let cloudOpacity = cloudOpacityDay + (cloudOpacityNight - cloudOpacityDay) * nightFade;
    // Overcast thickens the cloud deck.
    cloudOpacity = Math.max(cloudOpacity, 0.45 + 0.5 * _overcast);

    for (let i = 0; i < cloudSprites.length; i++) {
      const sprite = cloudSprites[i];
      // Drift along +X; wrap in [-CLOUD_WRAP_X, +CLOUD_WRAP_X].
      const rawX = cloudPhases[i] + cloudDrifts[i] * t * dayUnits;
      const wrap = CLOUD_WRAP_X * 2;
      sprite.position.x = ((((rawX + CLOUD_WRAP_X) % wrap) + wrap) % wrap) - CLOUD_WRAP_X;
      sprite.material.opacity = cloudOpacity;
      // Grey the clouds toward storm-cloud under overcast.
      if (_overcast > 0) sprite.material.color.setRGB(1 - 0.35 * _overcast, 1 - 0.33 * _overcast, 1 - 0.3 * _overcast);
      else sprite.material.color.setRGB(1, 1, 1);
    }
  }

  // ── applyTo ───────────────────────────────────────────────────────────────
  // Positions the DirectionalLight, sets hemi colors/intensity, fog color.
  // Returns the current palette entry for the integrator.

  const WAGON_POS = new THREE.Vector3(0, 0, 0);
  const SUN_DIST  = 200;

  function applyTo(targets, t) {
    const pal    = applyOvercast(lerpPalette(t));
    const sunDir = sunDirAt(t);

    if (targets.sun) {
      targets.sun.color.copy(pal.sunColor);
      targets.sun.intensity = pal.sunIntensity;
      // Position = wagonPos + sunDir * distance.
      targets.sun.position.copy(WAGON_POS)
        .addScaledVector(sunDir, SUN_DIST);
      // Keep target at wagon position (bootstrap adds sun.target to scene).
      if (targets.sun.target) {
        targets.sun.target.position.copy(WAGON_POS);
      }
    }

    if (targets.hemi) {
      targets.hemi.color.copy(pal.hemiSky);
      targets.hemi.groundColor.copy(pal.hemiGround);
      targets.hemi.intensity = pal.hemiIntensity;
    }

    if (targets.scene && targets.scene.fog) {
      targets.scene.fog.color.copy(pal.fogColor);
    }

    return pal;
  }

  // ── dispose ───────────────────────────────────────────────────────────────
  function dispose() {
    domeGeo.dispose();
    domeMat.dispose();

    stars.geometry.dispose();
    stars.material.dispose();

    for (const sprite of cloudSprites) {
      sprite.material.dispose();
      // Note: cloudTexture is caller-owned; we do not dispose it here.
    }
  }

  // v: 0..1 cover. color: optional THREE.Color the dome/light grey toward
  // (cool grey for rain/snow, warm ochre for a dust storm). LINEAR space.
  function setOvercast(v, color) {
    _overcast = Math.max(0, Math.min(1, v));
    if (color) _ovTint.copy(color);
  }

  return {
    group,
    update,
    sunDirAt,
    applyTo,
    setOvercast,
    dispose,
  };
}
