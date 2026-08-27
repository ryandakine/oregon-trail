// 3D render layer bootstrap (M1: travel world).
//
// Mounts a Three.js canvas BEHIND the Kaplay canvas (z-index 0; Kaplay canvas is
// transparent so the HUD/overlays composite on top). Renderer: ACES tonemapping,
// PCFSoft shadows, hand-rolled RenderPass→UnrealBloom→OutputPass composer (no
// n8ao/pmndrs — importmap-clean, THREEJS_REBUILD_PLAN §3.3).
//
// World (M1): procedural terrain band with the trail painted in (terrain.mjs),
// procedural time-of-day sky dome (sky.mjs), canvas-painted textures
// (textures.mjs), and a caravan of procedural models (models.mjs) — wagon with
// rolling wheels, two oxen with diagonal-pair gaits, two pioneers walking.
//
// MOTION MODEL (§3.1): the caravan is STATIONARY at the origin; the WORLD
// scrolls past along +Z. scrollZ is the total distance traveled; every
// animation poses as a pure function of scrollZ, so freezeAt(d) renders a
// deterministic frame for the screenshot harness.
//
// Resilience: if anything here throws, the caller swallows it and the 2D game
// keeps working. The 3D layer is strictly additive and read-only on engine state.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { toHex } from '../lib/palette.mjs';
import { segmentBlend, segmentForMiles } from '../lib/segments.mjs';
import * as textures from './textures.mjs';
import { createTerrain, BIOMES } from './terrain.mjs';
import { createSky, HIGH_TONE_FOG } from './sky.mjs';
import { createWagon, createOxTeam, createPioneer, createContactShadow } from './models.mjs';
import { createGrass } from './grass.mjs';
import { createVfx } from './vfx.mjs';
import { createRiver, createBankDressing, ftToWorld } from './water.mjs';
import { createCampfire, createCampDressing } from './camp.mjs';
import { createLandmark } from './landmarks.mjs';
import { createDeer, createBison } from './fauna.mjs';
import { createTombstone } from './markers.mjs';
import { createTrailAudio } from './audio.mjs';
import { setRenderMode } from '../render-mode.mjs';
import { makeFpsGate } from './fps-gate.mjs';

// Scenes that own the 3D world. Menu/UI scenes hide the canvas so they look
// unchanged (Kaplay transparent → body background shows through).
const WORLD_STATES = new Set(['TRAVEL', 'RIVER', 'LANDMARK', 'HUNTING', 'DEATH', 'ARRIVAL']);

const WAGON_SPEED = 1.9; // world-units/sec — plodding ox pace, drives scroll + gaits

// Pure, DETERMINISTIC weather from distance. The game derives weather bands from
// miles (travel.js: >1200 snow-or-clear, >600 dust-or-clear, else rain-or-clear),
// but uses Math.random per transition — which would flicker the 3D storm on every
// stateChange. Instead hash a stable 150-mile band to a fixed 0..99 roll, so the
// same stretch of trail always yields the same weather. No PRNG anywhere.
//
// The mood arc BIASES this: each segment declares in segments.mjs how storm-prone
// its stretch of trail is, and that lean moves both the odds a band is stormy and
// how hard the storm lands — a dust segment storms more, and harder, than a green
// one; a segment whose bias is 'none' (the Willamette arrival) is always clear.
// The KIND still comes from the mile band. Swapping kind to the segment's own
// would move miles=1300 from snow to dust and miles=750 from dust to rain, and
// both of those are pinned by test/frontend/three-adapter.test.ts and are not
// this change's to move — see the follow-up note.
function weatherForMiles(miles) {
  const bias = segmentForMiles(miles).weatherBias;
  if (bias.kind === 'none') return { kind: 'none', intensity: 0 };
  const band = Math.floor((miles || 0) / 150);
  const roll = ((band * 2654435761) >>> 0) % 100; // stable per-band, no randomness
  const lean = 0.6 + bias.intensity;              // 1.0 at the arc's nominal 0.4
  const hit = (chance) => roll < chance * lean;
  const strength = (base) => Math.max(0, Math.min(1, base * lean));
  if (miles > 1200) return hit(55) ? { kind: 'snow', intensity: strength(0.6) } : { kind: 'none', intensity: 0 };
  if (miles > 600) return hit(45) ? { kind: 'dust', intensity: strength(0.5) } : { kind: 'none', intensity: 0 };
  return hit(30) ? { kind: 'rain', intensity: strength(0.5) } : { kind: 'none', intensity: 0 };
}

function tierFromQuery() {
  const p = new URLSearchParams(location.search).get('gfx');
  if (p === 'low' || p === 'high') return p;
  // Default high on desktop. A real mobile tier + device detect is the DEC-B
  // kill-gate (needs a real device), still open.
  return 'high';
}

// ── Grade pass (§A8): vignette + film grain + lift/gamma/gain + saturation in
// ONE fullscreen pass, appended AFTER OutputPass. It therefore runs on the
// final tone-mapped sRGB image — which is where a colourist grades, and the
// only place a vignette can darken without ACES clawing the exposure back.
// uTime is the render loop's own accumulated time (never wall clock), so
// freezeAt(d) still renders identical pixels every run.
const GRADE_SHADER = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse:    { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime:       { value: 0 },
    uVignette:   { value: 0.14 },
    uGrain:      { value: 0.015 },
    uLift:       { value: new THREE.Vector3(0, 0, 0) },
    uGain:       { value: new THREE.Vector3(1, 1, 1) },
    uGamma:      { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform vec3 uGamma;
    uniform float uSaturation;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;

      vec2 p = vUv * 2.0 - 1.0;
      color *= clamp(1.0 - dot(p, p) * uVignette, 0.0, 1.0);

      float n = hash(vUv * uResolution + uTime);
      color += (n - 0.5) * uGrain;

      color = pow(max(color * uGain + uLift, vec3(0.0)), 1.0 / uGamma);
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, uSaturation);

      gl_FragColor = vec4(color, 1.0);
    }`,
};

// Per-tone-tier grade. Low stays honest (classroom-safe); medium warms slightly;
// high compresses the value ceiling, pulls saturation down and lifts shadows to
// a cold blue — the horror-tier look from the research doc's §C2 grading rule.
const GRADE_TIERS = {
  low:    { vignette: 0.06, grain: 0.000, lift: [0.000, 0.000, 0.000], gain: [1.00, 1.00, 1.00], gamma: [1.00, 1.00, 1.00], saturation: 1.00 },
  medium: { vignette: 0.14, grain: 0.015, lift: [0.000, 0.000, 0.000], gain: [1.03, 1.01, 0.96], gamma: [1.00, 1.00, 1.00], saturation: 1.00 },
  high:   { vignette: 0.30, grain: 0.045, lift: [0.010, 0.014, 0.028], gain: [0.90, 0.93, 0.99], gamma: [0.98, 0.98, 1.00], saturation: 0.55 },
};

// ── Horror-tier atmosphere (§C3). The shrunken draw distance IS the tension:
// swap the linear ramp for FogExp2 that goes effectively opaque at HALF the
// preset's far plane, so the world closes into a near-black cold-blue shell and
// everything past it stops mattering (a perf win, not a cost — Silent Hill's
// original reason for doing it). FOG_OPAQUE_AT is the same density→far constant
// grass.mjs uses in fogCullDistance(), so the grass field re-seeds itself to the
// halved radius with no plumbing at all (§C9 sparse composition).
const FOG_OPAQUE_AT = 2.6;
const HIGH_FOG_SHRINK = 0.5;
const LINEAR_FOG_HEX = 0xc9ddec; // the exact fog the non-horror tiers restore to

// Hermite ease in [0,1] — matches sky.mjs so the lantern ramp and the sky's own
// night fade read off the same curve shape.
function smoothstep01(x) {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

export function initThree(engine) {
  const gfx = tierFromQuery();
  const HIGH = gfx === 'high';

  const canvas = document.createElement('canvas');
  canvas.id = 'three-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;display:none;';
  document.body.insertBefore(canvas, document.body.firstChild);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HIGH ? 1.75 : 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // OutputPass applies this
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = null; // the sky dome paints every background pixel
  scene.fog = new THREE.Fog(LINEAR_FOG_HEX, 60, 520);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 950);
  camera.position.set(6.5, 3.6, 11);
  camera.lookAt(0, 1.5, 0);

  // ── Lighting: warm directional key + cool hemisphere fill. Colors and
  // intensities are driven per-frame by sky.applyTo(t); these are bind points.
  const hemi = new THREE.HemisphereLight(0xcfe8ff, toHex('hemiGround'), 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedd0, 2.8);
  sun.position.set(9, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(HIGH ? 2048 : 1024, HIGH ? 2048 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  // HIGH: wide box covers the ~90u terrain band (2048 map, verified clean by
  // screenshot). LOW: tighter box keeps 1024-map texels dense enough that thin
  // geometry (wheel spokes ~0.036u) still resolves.
  const S = HIGH ? 60 : 40;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = HIGH ? 0.12 : 0.09;
  scene.add(sun);
  scene.add(sun.target);

  // Horror tier only: a cone rigidly mounted to the camera. Once the sun is
  // crushed to a cold, dim ceiling, this is what reaches anything out toward the
  // fog wall — the frame stops being a landscape and becomes whatever a beam
  // happens to find. Warm-sickly amber against cold fog: the tier's one
  // permitted temperature break.
  //
  // decay 0 (NOT physical 2, and not the 1.1 this was first built with) is the
  // load-bearing choice. Any inverse-power falloff big enough to reach the fog
  // wall at 60-120u is enormous on the 3-8u of ground directly under the camera,
  // and it landed as a searchlight puddle that owned the death frame — measured,
  // then swept. Flat falloff makes the fog the only thing attenuating distance,
  // which is what "the beam reaches as far as anything can be seen" actually
  // means. angle 0.50 rather than the 0.35 first specced: 0.35rad ≈ 20°, well
  // inside the camera's ~33-40° horizontal half-angle, so the cone rim landed as
  // a visible circle in frame. 0.50 + penumbra 0.85 puts the falloff at the
  // frame edge, where it reads as the light failing rather than as a lamp.
  // No shadow map: it would double the shadow cost on the tier already paying
  // for bloom + grade.
  //
  // DREAD_INTENSITY is the DAYLIGHT figure — pose() ramps it to zero as the sun
  // sets, because the beam's whole point is a light that shouldn't be needed at
  // noon. After dark the campfire is already the only light and has to stay the
  // warm anchor the tier subverts; a second source there just bleaches it.
  // Mounted by setGrade, posed off the camera in pose(), freed in disposeDread.
  const DREAD_INTENSITY = 2.4;
  const dread = new THREE.SpotLight(0xe2c98d, DREAD_INTENSITY, 0, 0.50, 0.85, 0);
  dread.castShadow = false;
  let dreadOn = false;
  const _dreadFwd = new THREE.Vector3();

  function setDread(on) {
    if (on === dreadOn) return;
    dreadOn = on;
    if (on) { scene.add(dread); scene.add(dread.target); }
    else { scene.remove(dread); scene.remove(dread.target); }
  }

  // ── World modules ──
  const terrain = createTerrain({ textures, biome: BIOMES.prairie });
  scene.add(terrain.group);

  // Ground backstop: a huge fogged disc below the terrain band. Rays that clear
  // a crest or exit the band hit fogged prairie color instead of the dome's
  // below-horizon haze — without this, falling terrain reads as a pale void.
  // Lambert (not Basic) so it darkens correctly at night, with a low-frequency
  // tiled grass map so near views don't read as flat paint.
  const backstopTex = textures.grassMaps().map.clone();
  backstopTex.repeat.set(260, 260);
  backstopTex.needsUpdate = true;
  const backstop = new THREE.Mesh(
    new THREE.CircleGeometry(1500, 48),
    new THREE.MeshLambertMaterial({ color: toHex('backstopPrairie'), map: backstopTex, fog: true }),
  );
  backstop.rotation.x = -Math.PI / 2;
  backstop.position.y = -4;
  backstop.renderOrder = -5; // after the dome, before world geometry
  scene.add(backstop);

  // Grass tufts — the single biggest "this is a real place" lift for the prairie.
  const grass = createGrass({ terrain, tuftTexture: textures.grassTuftTexture() });
  scene.add(grass.group);

  // Particle pool: weather (rain/snow/dust) + wagon dust + campfire embers.
  const vfx = createVfx();
  scene.add(vfx.points);
  vfx.setViewport(window.innerHeight, camera.fov);

  // ── Procedural audio (M6). Gated on first user gesture (autoplay policy);
  // never throws if WebAudio is unavailable. Scene/weather/moving are wired
  // through the same calls that drive the visuals.
  const audio = createTrailAudio();
  const AUDIO_SCENE = { travel: 'travel', river: 'river', fort: 'fort', night: 'camp', hunting: 'hunting', death: 'travel', arrival: 'arrival' };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, () => audio.start(), { once: true });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));

  // ── River crossing (M3): carve the terrain channel + mount the water sheet.
  // Mounted on demand (RIVER scene / river preset), torn down on exit.
  let river = null; // { water, dressing, absZ }
  function enterRiver({ widthFt = 230, fordDifficulty = 3 } = {}) {
    if (river) exitRiver();
    const absZ = scrollZ - 9.5; // just ahead of the halted wagon
    const w = ftToWorld(widthFt);
    // Cut the channel to a LEVEL bed below the average bank height, then float
    // the water sheet a fixed clearance above that bed — depth is uniform along
    // the whole sheet, so foam hugs only the real shorelines.
    const bankAvg = (terrain.heightAt(0, absZ - (w / 2 + 4)) + terrain.heightAt(0, absZ + (w / 2 + 4))) / 2;
    const bedY = bankAvg - 1.6;
    terrain.setRiver({ absZ, halfWidth: w / 2 + 3.0, bedY });
    const water = createRiver({
      waterNormals: textures.waterNormalMaps(),
      widthFt, fordDifficulty, terrain, riverZ: absZ,
      waterY: bedY + 1.25,
    });
    water.group.position.z = -scrollZ; // abs → world (scroll frozen at crossings)
    scene.add(water.group);
    const dressing = createBankDressing({ terrain, riverZ: absZ, textures });
    dressing.position.z = -scrollZ;
    scene.add(dressing);
    river = { water, dressing, absZ };
    grass.invalidate(); // re-seed tufts around the carved channel
    moving = false; // travel halts at a crossing
  }
  function exitRiver() {
    if (!river) return;
    scene.remove(river.water.group);
    scene.remove(river.dressing);
    river.water.dispose();
    terrain.setRiver(null);
    grass.invalidate();
    river = null;
    moving = true;
  }

  // ── Night camp (M4): campfire + dressing + the party gathered around it.
  let camp = null; // { fire, dressing, savedWalkers: [{x,z,rotY}] }
  function enterCamp() {
    if (camp) exitCamp();
    moving = false; // the wagon is parked for the night
    const fire = createCampfire({ glowTexture: textures.radialGlowTexture() });
    // Fire sits in front-left of the parked wagon, on the ground.
    fire.group.position.set(-3.2, 0, 1.8);
    caravan.add(fire.group);
    const dressing = createCampDressing({ textures });
    dressing.group.position.copy(fire.group.position);
    caravan.add(dressing.group);
    // Gather the party around the fire (saving travel positions to restore).
    const saved = walkers.map((w) => ({ x: w.group.position.x, z: w.group.position.z, rotY: w.group.rotation.y }));
    walkers[0].group.position.set(-1.7, 0, 1.4);
    walkers[0].group.rotation.y = -Math.PI * 0.62; // face the fire
    walkers[1].group.position.set(-4.0, 0, 0.6);
    walkers[1].group.rotation.y = Math.PI * 0.42;
    camp = { fire, dressing, saved };
  }
  function exitCamp() {
    if (!camp) return;
    caravan.remove(camp.fire.group);
    caravan.remove(camp.dressing.group);
    camp.fire.dispose();
    camp.dressing.dispose();
    walkers.forEach((w, i) => {
      w.group.position.x = camp.saved[i].x;
      w.group.position.z = camp.saved[i].z;
      w.group.rotation.y = camp.saved[i].rotY;
    });
    camp = null;
    moving = true;
  }

  // ── Landmark (M5): fort / Chimney Rock / settlement / etc. The wagon halts
  // outside; the landmark scene sits ahead of it (toward -Z), grounded on a
  // leveled pad so a large stockade doesn't clip the rolling terrain.
  let landmark = null; // { lm, worldZ }
  function enterLandmark({ type = 'fort', name = 'Fort Kearney' } = {}) {
    if (landmark) exitLandmark();
    moving = false;
    const worldZ = -16; // ahead of the parked wagon at world origin
    const absZ = scrollZ + worldZ;
    // Big structures get a level pad; natural rock formations sit on raw terrain.
    const padded = type === 'fort' || type === 'settlement' || type === 'destination';
    if (padded) terrain.setFlatPad({ absZ, x: 0, radius: 22, y: terrain.heightAt(0, absZ) });
    const lm = createLandmark({ type, name, textures });
    const gy = padded ? terrain.heightAt(0, absZ) : terrain.heightAt(0, absZ);
    lm.group.position.set(0, gy, worldZ);
    scene.add(lm.group);
    grass.invalidate();
    landmark = { lm, worldZ, padded };
  }
  function exitLandmark() {
    if (!landmark) return;
    scene.remove(landmark.lm.group);
    landmark.lm.dispose();
    if (landmark.padded) terrain.setFlatPad(null);
    grass.invalidate();
    landmark = null;
    moving = true;
  }

  // ── Hunting (M7): grazing game scattered across the meadow ahead. ──
  let hunting = null; // { animals: [{a, x, z, phase}] }
  function enterHunting() {
    if (hunting) exitHunting();
    moving = false;
    const animals = [];
    // Deterministic scatter ahead-and-left of the halted wagon (the hunting
    // grounds), placed at absolute world positions so they sit on the terrain.
    const placements = [
      { kind: 'deer', x: -6, z: -14, pose: 'graze', tint: 0 },
      { kind: 'deer', x: 3, z: -19, pose: 'graze', tint: 0.5 },
      { kind: 'deer', x: -11, z: -22, pose: 'alert', tint: 1 },
      { kind: 'bison', x: 9, z: -25, pose: 'graze', tint: 0 },
    ];
    for (const p of placements) {
      const a = p.kind === 'bison' ? createBison({ tint: p.tint }) : createDeer({ tint: p.tint });
      const absZ = scrollZ + p.z;
      a.group.position.set(p.x, terrain.heightAt(p.x, absZ), p.z);
      a.group.rotation.y = p.x < 0 ? 0.6 : -0.5; // quartered toward the trail
      if (a.setPose) a.setPose(p.pose);
      scene.add(a.group);
      animals.push({ a, phase: (p.x + p.z) * 0.1 });
    }
    hunting = { animals };
  }
  function exitHunting() {
    if (!hunting) return;
    for (const { a } of hunting.animals) { scene.remove(a.group); a.dispose(); }
    hunting = null;
    moving = true;
  }

  // ── Death (M7): a trailside grave beside the halted wagon, somber mood. ──
  let death = null; // { stone }
  function enterDeath() {
    if (death) exitDeath();
    moving = false;
    const stone = createTombstone({ name: 'Pioneer', variant: 'headstone' });
    const gx = 3.4, gz = -5.5;
    const absZ = scrollZ + gz;
    // A small flat pad gives the grave a bare-earth plot AND clears the
    // foreground grass that would otherwise bury the headstone.
    terrain.setFlatPad({ absZ, x: gx, radius: 5.5, y: terrain.heightAt(gx, absZ) });
    stone.group.position.set(gx, terrain.heightAt(gx, absZ), gz);
    stone.group.rotation.y = 0.4; // face the approaching camera
    scene.add(stone.group);
    grass.invalidate();
    death = { stone };
  }
  function exitDeath() {
    if (!death) return;
    scene.remove(death.stone.group);
    death.stone.dispose();
    terrain.setFlatPad(null);
    grass.invalidate();
    death = null;
    moving = true;
  }

  // ── Arrival (M7): Oregon City vista — the destination landmark. ──
  let arrival = null;
  function enterArrival() {
    if (arrival) exitArrival();
    moving = false;
    const worldZ = -18;
    const absZ = scrollZ + worldZ;
    terrain.setFlatPad({ absZ, x: 0, radius: 26, y: terrain.heightAt(0, absZ) });
    const lm = createLandmark({ type: 'destination', name: 'Oregon City' });
    lm.group.position.set(0, terrain.heightAt(0, absZ), worldZ);
    scene.add(lm.group);
    grass.invalidate();
    arrival = { lm };
  }
  function exitArrival() {
    if (!arrival) return;
    scene.remove(arrival.lm.group);
    arrival.lm.dispose();
    terrain.setFlatPad(null);
    grass.invalidate();
    arrival = null;
    moving = true;
  }

  const sky = createSky({ cloudTexture: textures.cloudTexture(), lowDetail: !HIGH });
  scene.add(sky.group);

  // ── Mood arc (Phase D): miles → look ──────────────────────────────────────
  // lib/segments.mjs owns the eight-segment ramp and the cross-fade; this is the
  // ONLY place the 3D layer reads it, and it hands each role to whichever module
  // renders that part of the frame:
  //
  //   ground / groundAlt → terrain.setBiomeBlend   (the 30%)
  //   zenith / horizon / accent → sky.setSegmentTint (the 60% + the 10%, and
  //                                the fog, which follows the tinted horizon)
  //   far → the backstop disc, so rays that clear a crest land in this
  //         segment's distance instead of prairie green
  //
  // Roles are key NAMES throughout — both modules resolve them against
  // palette.mjs themselves, so no hex ever appears here.
  let arcMiles = 0;
  let arcSegment = segmentForMiles(0);
  const _farA = new THREE.Color();
  const _farB = new THREE.Color();
  const _grassA = new THREE.Color();
  const _grassB = new THREE.Color();

  function applyArc(miles) {
    arcMiles = Math.max(0, Number(miles) || 0);
    const { a, b, t } = segmentBlend(arcMiles);
    // The quantised half of the terrain blend rewrites vertex heights; grass is
    // scattered on terrain.heightAt(), so it has to re-seed on the same step or
    // tufts hang above (or sink into) the new ground.
    if (terrain.setBiomeBlend(a, b, t)) grass.invalidate();
    sky.setSegmentTint(a, b, t);
    _farA.setHex(toHex(a.palette.far));
    _farB.setHex(toHex(b.palette.far));
    backstop.material.color.copy(_farA).lerp(_farB, t);
    // Tufts follow the segment ground chromaticity (0.65 keeps some green life
    // in every biome — full mix reads as dead AstroTurf on the alkali divide).
    _grassA.setHex(toHex(a.palette.ground));
    _grassB.setHex(toHex(b.palette.ground));
    grass.setTint(_grassA.lerp(_grassB, t), a.biome === 'prairie' && a === b ? 0 : 0.65);
    arcSegment = t < 0.5 ? a : b;
  }

  // Caravan: stationary group at the trail anchor; forward = -Z.
  const caravan = new THREE.Group();
  scene.add(caravan);

  // Inverted-hull outlines (§A10) are a HIGH-tier line item: ~50 extra meshes
  // across the caravan, ~13% of the travel frame's draw calls. The low tier
  // exists for GPUs that already can't hold 30fps — it does not pay for ink.
  const wagon = createWagon({ textures, outline: HIGH });
  wagon.group.rotation.y = -Math.PI / 2; // model forward (-X, tongue) → world -Z
  caravan.add(wagon.group);

  // Yoked pair + pole reaching back toward the wagon tongue.
  const team = createOxTeam({ outline: HIGH });
  team.group.position.set(0, 0, -3.0);
  caravan.add(team.group);

  const walkers = [
    createPioneer({ hat: 'felt', outline: HIGH }),
    createPioneer({ hat: 'bonnet', dress: true, outline: HIGH }),
  ];
  walkers[0].group.position.set(2.0, 0, 1.2);
  walkers[1].group.position.set(-2.4, 0, 3.2);
  for (const w of walkers) caravan.add(w.group);

  // Baked contact shadows under every ground-contact object (cheap AO, §5a #2).
  const wagonShadow = createContactShadow(2.8, 5.0, 0.4);
  wagonShadow.position.y = 0.04;
  caravan.add(wagonShadow);
  const teamShadow = createContactShadow(2.6, 3.2, 0.36);
  teamShadow.position.set(0, 0.04, -3.0);
  caravan.add(teamShadow);
  for (const w of walkers) {
    const s = createContactShadow(0.8, 0.8, 0.34);
    s.position.set(w.group.position.x, 0.04, w.group.position.z);
    caravan.add(s);
  }

  // ── Post: RenderPass → UnrealBloom → OutputPass(ACES) → grade. No pmndrs. ──
  let composer = null;
  let gradePass = null;
  let gradeTier = 'medium'; // tone tiers arrive with the run; harness paths get the default
  const _bufSize = new THREE.Vector2();
  if (HIGH) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.55, 0.85,
    ));
    composer.addPass(new OutputPass());
    gradePass = new ShaderPass(GRADE_SHADER);
    composer.addPass(gradePass);
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  // Tone tier → grade uniforms. The storm/death overcast scalar rides on top in
  // pose(), so a dust storm or a graveside frame gets a touch more falloff and
  // grain than the same tier does in clear weather.
  // Install the fog model the current tier wants. The horror tier's exponential
  // wall and the other tiers' linear ramp are different THREE objects, so this
  // swaps rather than reconfigures — three re-links fogged materials on its own
  // (WebGLRenderer.setProgram: `material.fog === true && materialProperties.fog
  // !== fog`), and it only fires on an actual tier flip, not per frame. pose()
  // owns the per-frame density/near/far under whichever model is mounted.
  function syncFog() {
    const wantExp2 = gradeTier === 'high';
    if (wantExp2 === !!scene.fog.isFogExp2) return;
    scene.fog = wantExp2
      ? new THREE.FogExp2(HIGH_TONE_FOG, FOG_OPAQUE_AT / Math.max(baseFogFar * HIGH_FOG_SHRINK, 1))
      : new THREE.Fog(LINEAR_FOG_HEX, baseFogNear, baseFogFar);
  }

  function setGrade(tier) {
    gradeTier = tier in GRADE_TIERS ? tier : 'medium';
    // The tier is one look, not three independent knobs: the grade pass, the
    // sky/fog palette clamp, the fog model and the camera spot all move together
    // or the horror tier reads as "someone turned the brightness down".
    sky.setTone(gradeTier);
    setDread(gradeTier === 'high');
    syncFog();
    if (!gradePass) return;
    const g = GRADE_TIERS[gradeTier];
    const u = gradePass.uniforms;
    u.uLift.value.set(...g.lift);
    u.uGain.value.set(...g.gain);
    u.uGamma.value.set(...g.gamma);
    u.uSaturation.value = g.saturation;
    u.uVignette.value = g.vignette;
    u.uGrain.value = g.grain;
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    // Grain is hashed per DEVICE pixel, so the grade pass wants the drawing
    // buffer size, not the CSS size (pixelRatio is up to 1.75 on this tier).
    if (gradePass) gradePass.uniforms.uResolution.value.copy(renderer.getDrawingBufferSize(_bufSize));
    vfx.setViewport(h, camera.fov);
  }
  if (gradePass) gradePass.uniforms.uResolution.value.copy(renderer.getDrawingBufferSize(_bufSize));
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // M0: swallow context-loss so the 2D game stays alive; a webglcontextrestored
  // rebuild lands with the full dispose/lifecycle work later in M1.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);

  // ── Per-scene presets (§5a): camera framing + fog depth + time-of-day.
  // Sun/hemi/fog COLOR all derive from the sky palette at todT, so a preset is
  // just framing + atmosphere depth + the fixed sun position on its arc.
  // Every preset re-states every knob — order independence is load-bearing.
  let todT = 0.34;
  const PRESETS = {
    // Front-quarter view: ox team leads into frame-left, wagon right-of-center
    // (rule of thirds), trail receding diagonally — not down the lens axis.
    // Fog far stays INSIDE the terrain band's Z extent (5×60u chunks) so the
    // world edge is always behind haze, never a visible hard line.
    travel: { t: 0.40, fov: 38, cam: [-7.0, 2.9, -7.5], look: [1.2, 1.5, 0.5], fog: [50, 240], lantern: 3.2 },
    // Elevated establishing shot from the near bank: high enough to look INTO
    // the channel (a grazing camera sees only the far foam shelf, never the
    // deep teal strip), halted wagon frame-left, noon sun for glints (§5a).
    river: { t: 0.52, fov: 40, cam: [10, 5.6, 4.0], look: [-4.5, -0.2, -10], fog: [40, 220], lantern: 3.2 },
    // Low hero angle looking up at the palisade gate, wagon small in the
    // foreground for scale (§5a). Fort sits at worldZ=-16; camera offset to one
    // side so the gate mouth and one side wall both read (not a flat-on shot).
    fort: { t: 0.60, fov: 44, cam: [4.5, 2.6, 7.5], look: [-1.0, 3.0, -14], fog: [50, 260], lantern: 3.2 },
    // Tight, intimate, slightly high angle looking down at the fire circle
    // beside the wagon (§5a): fire frame-left as the only key, wagon behind.
    night: { t: 0.005, fov: 40, cam: [-7.5, 3.4, 5.5], look: [-2.6, 0.7, 1.2], fog: [16, 90], lantern: 6 },
    // Hunting: golden-hour meadow, camera across the open ground at the grazing
    // game (deer/bison sit at z -14..-25), low and wide.
    hunting: { t: 0.46, fov: 46, cam: [11, 3.0, 3], look: [-3, 0.9, -18], fog: [60, 280], lantern: 3.2 },
    // Death: grey, overcast, desaturated; the grave foreground-center with the
    // wagon behind-left. Somber, low-key (mood applied in pose()).
    death: { t: 0.30, fov: 36, cam: [5.6, 1.25, -1.8], look: [3.4, 0.55, -5.5], fog: [28, 150], lantern: 3.2 },
    // Arrival: warm golden hour, welcoming wide vista of Oregon City. Camera
    // raised to look OVER the near meadow grass at the settlement.
    arrival: { t: 0.66, fov: 42, cam: [7, 4.8, 11], look: [-0.5, 2.2, -16], fog: [55, 300], lantern: 3.2 },
  };
  // Weather mood: storms grey the sky + pull fog in + emit particles, all from
  // one call, applied in pose() so live + frozen frames match.
  let weatherKind = 'none';
  let weatherIntensity = 0;
  const OVERCAST_BY_KIND = { none: 0, rain: 0.9, snow: 0.5, dust: 0.8 };
  // Overcast tint per kind (sRGB→linear): cool storm grey vs warm dust ochre.
  const OVERCAST_TINT = {
    rain: new THREE.Color(0x9598a0).convertSRGBToLinear(),
    snow: new THREE.Color(0xb9c0cc).convertSRGBToLinear(),
    dust: new THREE.Color(0xc2a065).convertSRGBToLinear(),
  };
  const DEATH_GREY = new THREE.Color(0x8a8c92).convertSRGBToLinear();
  function setWeather(kind, intensity = 1) {
    weatherKind = kind in OVERCAST_BY_KIND ? kind : 'none';
    weatherIntensity = weatherKind === 'none' ? 0 : Math.max(0, Math.min(1, intensity));
    vfx.setWeather(weatherKind, weatherIntensity);
    audio.setWeather(weatherKind, weatherIntensity);
  }

  // `opts` carries live trigger data from the engine state→3D adapter (river
  // width/difficulty, landmark type/name). Defaults preserve the harness's
  // zero-arg calls. The owned-scene mounts read it so a real crossing/landmark
  // renders the server's actual payload, not a hardcoded stand-in.
  function preset(name, opts = {}) {
    const p = PRESETS[name] || PRESETS.travel;
    // The river preset owns a mounted crossing; every other preset clears it.
    if (name === 'river' && !river) enterRiver(opts);
    else if (name !== 'river' && river) exitRiver();
    // The night preset owns a mounted camp; every other preset clears it.
    if (name === 'night' && !camp) enterCamp();
    else if (name !== 'night' && camp) exitCamp();
    // The fort preset owns a mounted landmark; every other preset clears it.
    // type/name come from the live `currentLandmark` (server-enriched); the
    // fort defaults are the harness fallback only.
    if (name === 'fort' && !landmark) enterLandmark({ type: opts.type || 'fort', name: opts.name || 'Fort Laramie' });
    else if (name !== 'fort' && landmark) exitLandmark();
    // Each remaining mounted scene is owned by its matching preset.
    if (name === 'hunting' && !hunting) enterHunting(); else if (name !== 'hunting' && hunting) exitHunting();
    if (name === 'death' && !death) enterDeath(); else if (name !== 'death' && death) exitDeath();
    if (name === 'arrival' && !arrival) enterArrival(); else if (name !== 'arrival' && arrival) exitArrival();
    todT = p.t;
    camera.fov = p.fov;
    camera.position.set(...p.cam);
    camera.lookAt(...p.look);
    camera.updateProjectionMatrix();
    baseFogNear = p.fog[0];
    baseFogFar = p.fog[1];
    // The preset's lantern value is the scene's LIT intensity (the camp wants a
    // hotter lamp than a dusk trail); pose() decides how lit it actually is from
    // the sun's elevation, then scales by this gain.
    lanternGain = p.lantern / (PRESETS.travel.lantern || 1);
    audio.setScene(AUDIO_SCENE[name] || 'travel');
    audio.setMoving(moving);
    pose(scrollZ); // re-light + re-pose under the new preset immediately
  }

  // ── Animation: everything is a pure function of scrollZ (+ todT) ──
  let scrollZ = 0;
  let moving = true;
  let frozen = false;
  let visible = false;
  let baseFogNear = 50;
  let baseFogFar = 240;
  let lanternGain = 1;

  // Deferred until now on purpose: setGrade → syncFog reads baseFogNear/Far, and
  // those are `let`s declared above this line. Calling it up beside the composer
  // build would hit their temporal dead zone. Nothing renders in between.
  setGrade(gradeTier);
  // Seat the arc at mile 0 before the first pose. arc_prairie is the identity
  // segment in both modules (terrain tintMix 0, sky strength 0), so the boot
  // frame is the exact pre-arc frame — the regression baseline.
  applyArc(0);

  function pose(d) {
    terrain.update(0, d);
    grass.update(d);
    // The caravan tracks the trail's sway/height at its own absolute position.
    const tx = terrain.trailXAt(d);
    caravan.position.set(tx, terrain.heightAt(tx, d), 0);
    wagon.setPhase(d);
    team.setPhase(d);
    walkers[0].setPhase(d + 0.2);
    walkers[1].setPhase(d + 1.1);
    // Overcast darkens the dome + lights BEFORE the sky writes them — driven by
    // weather, or forced grey for the somber death scene.
    let ov = OVERCAST_BY_KIND[weatherKind] * weatherIntensity;
    let ovTint = OVERCAST_TINT[weatherKind];
    if (death) { ov = Math.max(ov, 0.6); ovTint = DEATH_GREY; }
    sky.setOvercast(ov, ovTint);
    // scrollZ drives the ridge/hill silhouette rings' parallax drift, so the
    // horizon slides at a fraction of the foreground's speed instead of being
    // painted on. Same d as setPhase — one motion clock for the whole world.
    sky.update(0, todT, camera.position, d);
    sky.applyTo({ sun, hemi, scene }, todT);
    const sunDir = sky.sunDirAt(todT);
    // Lantern rides the sun (§A7): dead glass while the sun is up, burning from
    // dusk through night. Ramps in as the sun drops through ~16° of elevation.
    const duskness = 1 - smoothstep01((sunDir.y - 0.02) / 0.26);
    wagon.setLantern(duskness);
    wagon.lantern.material.emissiveIntensity *= lanternGain;
    // Weather pulls fog in (denser air). A dust storm collapses visibility to a
    // tan murk — that loss of distance IS the storm — so it gets a hard tight
    // fog, not a proportional pull.
    let fogNear, fogFar;
    if (weatherKind === 'dust') {
      fogNear = baseFogNear + (8 - baseFogNear) * weatherIntensity;
      fogFar = baseFogFar + (46 - baseFogFar) * weatherIntensity;
    } else {
      const fogPull = weatherIntensity * 0.55;
      fogNear = baseFogNear * (1 - fogPull * 0.6);
      fogFar = baseFogFar * (1 - fogPull * 0.7);
    }
    // The horror tier spends that same weather-adjusted far on an exponential
    // wall at half the distance instead of a linear ramp — so a dust storm still
    // collapses visibility, on top of the tier's own shrink, from one number.
    if (scene.fog.isFogExp2) {
      scene.fog.density = FOG_OPAQUE_AT / Math.max(fogFar * HIGH_FOG_SHRINK, 1);
    } else {
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }
    // Re-anchor the sun close to the caravan so the ortho shadow frustum
    // (near 1 / far 120) actually contains the world — sky.applyTo parks it
    // 200u out on the sun arc, far outside the shadow camera.
    sun.position.copy(sunDir).multiplyScalar(34);
    sun.target.position.set(0, 0, 0);
    // Rig the dread cone to the camera from the camera's own quaternion rather
    // than parenting it: the camera is never added to the scene graph (RenderPass
    // takes it directly), so a child light would never be collected. Pure
    // function of the preset's framing + duskness, so freezeAt stays pixel-stable.
    if (dreadOn) {
      _dreadFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      dread.position.copy(camera.position);
      dread.target.position.copy(camera.position).addScaledVector(_dreadFwd, 40);
      // Rides the same duskness ramp as the lantern, inverted — as the lantern
      // lights, the beam goes out.
      dread.intensity = DREAD_INTENSITY * (1 - duskness);
    }
    if (river) {
      river.water.update(0, fxTime);
      river.water.setSun(sunDir, sun.color);
      river.water.setSky(scene.fog.color);
    }
    if (camp) camp.fire.setPhase(fxTime);
    if (hunting) for (const { a, phase } of hunting.animals) a.setPhase(fxTime * 0.4 + phase);
    if (gradePass) {
      const g = GRADE_TIERS[gradeTier];
      const u = gradePass.uniforms;
      // The loop's own clock, never wall clock — freezeAt pins it to d. Wrapped
      // so a long session can't grow the hash input past float precision and
      // freeze the grain into a static pattern.
      u.uTime.value = fxTime % 100;
      u.uVignette.value = g.vignette + 0.10 * ov;
      u.uGrain.value = g.grain + 0.02 * ov;
    }
  }

  // renderer.info auto-resets on every internal render() call, and the composer
  // makes several per frame — accumulate manually so probes see the whole frame.
  renderer.info.autoReset = false;
  function renderOnce() {
    renderer.info.reset();
    if (composer) composer.render(); else renderer.render(scene, camera);
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }

  const clock = new THREE.Clock();
  let lastDustAt = 0; // scrollZ of the last dust kick — distance-gated, not time-gated
  let fxTime = 0; // water flows even while the wagon is halted at the bank

  // ── FPS auto-downgrade (DEC-B kill-gate safety net). The >=30fps gate was
  // never measured on real GPUs, and desktop gets 3D by default — a weak GPU
  // faceplants with no way out. Measure real rendered fps over a window; if the
  // average stays below DOWNGRADE_FPS for DOWNGRADE_BAD_WINDOWS *consecutive*
  // windows (hysteresis — one transient stall must not permanently demote a
  // capable GPU), kill the 3D loop, reveal the 2D game underneath, and persist
  // render mode to '2d' so the next load skips 3D.
  const DOWNGRADE_FPS = 24;
  const DOWNGRADE_BAD_WINDOWS = 3; // consecutive sub-target windows before downgrading
  const WARMUP_FRAMES = 30; // ignore shader-compile spikes on the first ~0.5s
  const SAMPLE_SECS = 3; // window of sampled render time before deciding
  const fpsGate = makeFpsGate({ targetFps: DOWNGRADE_FPS, badWindowsToDowngrade: DOWNGRADE_BAD_WINDOWS });
  let warmupLeft = WARMUP_FRAMES;
  let sampleTime = 0; // accumulated dt over real rendered frames
  let sampleCount = 0; // rendered frames in the window
  let killed = false; // stops the RAF loop once downgraded
  let rafId = 0; // last requestAnimationFrame handle (for cancelAnimationFrame)
  let downgraded = false; // one-shot guard on downgrade()

  // Frees only what the post chain owns (the grade pass material + quad).
  // Scene geometry/materials/renderer survive downgrade() — accepted: the
  // hidden canvas stops rendering, and a full renderer teardown here risks
  // more than the memory it returns.
  function disposePost() {
    if (!gradePass) return;
    if (composer) composer.removePass(gradePass);
    gradePass.dispose();
    gradePass = null;
  }

  // The dread spot is the only light this file mounts after init, so it needs an
  // explicit exit alongside the post chain — unmount it AND drop its shadow
  // resources, or a downgrade leaves a live light attached to a dead loop.
  function disposeDread() {
    setDread(false);
    dread.dispose();
  }

  function downgrade() {
    if (downgraded) return;
    downgraded = true;
    killed = true; // frame() early-returns AND stops re-scheduling
    if (rafId) cancelAnimationFrame(rafId);
    disposePost();
    disposeDread();
    api.hide(); // free the GPU canvas; the 2D Kaplay layer keeps running under it
    setRenderMode('2d'); // next load won't re-init 3D (render-mode.mjs try/catches)
    console.warn(
      `3D auto-downgraded to 2D: sustained <${DOWNGRADE_FPS} fps on this GPU. ` +
      'Switch back via the in-game 3D toggle once on better hardware.',
    );
  }

  function frame() {
    if (killed) return;
    rafId = requestAnimationFrame(frame);
    const dt = clock.getDelta();
    if (!visible || frozen) return;
    // Sample only real rendered frames (past the visible/frozen gate). Skip the
    // warm-up (shader compiles), drop dt>0.1s artifacts (tab-switch / RAF
    // throttle) and any frame while the tab is hidden, then decide once the
    // window fills.
    if (!downgraded) {
      if (warmupLeft > 0) {
        warmupLeft--;
      } else if (!document.hidden && dt <= 0.1) {
        sampleTime += dt;
        sampleCount++;
        if (sampleTime >= SAMPLE_SECS) {
          const avgFps = sampleCount / sampleTime;
          sampleTime = 0; sampleCount = 0; // always re-arm the next window
          // Downgrade only after DOWNGRADE_BAD_WINDOWS consecutive bad windows;
          // a single transient stall is absorbed and the streak resets.
          if (fpsGate.recordWindow(avgFps)) downgrade();
        }
      }
    }
    if (killed) return; // downgrade() may have just fired — skip this frame's render
    fxTime += dt;
    if (moving) scrollZ += WAGON_SPEED * dt;
    pose(scrollZ);
    // Wagon dust: a puff at each rear wheel every ~0.55u of travel (the vfx
    // emitter has no internal gate — per-frame calls would flood the pool).
    if (moving && scrollZ - lastDustAt > 0.55) {
      lastDustAt = scrollZ;
      const cy = caravan.position.y + 0.1;
      vfx.wagonDust(caravan.position.x - 1.02, cy, 1.25);
      vfx.wagonDust(caravan.position.x + 1.02, cy, 1.25);
    }
    // Campfire embers rise from the flame tip. localToWorld walks the full
    // parent chain (fire → caravan → scene) and updates world matrices, so it
    // already yields world coords — no extra caravan transform.
    if (camp) {
      const tip = camp.fire.group.localToWorld(camp.fire.firePos.clone());
      vfx.embers(tip.x, tip.y, tip.z);
    }
    vfx.update(dt);
    renderOnce();
  }
  frame();
  pose(0); // build the first terrain band + light state eagerly

  const api = {
    THREE, renderer, scene, camera, composer, gfx, sun, hemi,
    terrain, sky, wagon, team, walkers, vfx,
    preset, renderOnce,
    get lantern() { return wagon.lantern; },
    show() { visible = true; canvas.style.display = 'block'; resize(); },
    hide() { visible = false; canvas.style.display = 'none'; frozen = false; },
    setMoving(m) { moving = !!m; audio.setMoving(moving); },
    setWeather,
    setGrade,
    get grade() { return gradeTier; },
    // Drive the mood arc directly, for the screenshot harness and for probes
    // that want a mile marker without forging a signed GameState. Pure: same
    // miles + same preset → same pixels.
    setMiles(m) { applyArc(m); pose(scrollZ); },
    get segment() {
      return { id: arcSegment.id, biome: arcSegment.biome, name: arcSegment.name, miles: arcMiles };
    },
    // Read-only view of the active weather so tests (Builder D) can observe what
    // the state→3D bridge set. Mirrors the closure vars setWeather writes.
    get weather() { return { kind: weatherKind, intensity: weatherIntensity }; },
    audio,
    get camp() { return camp; },
    // Deterministically warm the campfire ember pool: emit from the fire tip +
    // step the seeded particle sim N times. Used by the night screenshot so the
    // still shows rising embers (the live emitter is rate-gated per frame).
    emitCampEmbers(steps, dt = 1 / 60) {
      if (!camp) return;
      for (let i = 0; i < steps; i++) {
        const tip = camp.fire.group.localToWorld(camp.fire.firePos.clone());
        vfx.embers(tip.x, tip.y, tip.z);
        vfx.simulate(1, dt);
      }
    },
    // Warm wagon trail dust for stills (live dust is gated on moving frames;
    // freezeAt alone never emits). Mirrors emitCampEmbers for dry travel shots.
    emitWagonDust(steps, dt = 1 / 60) {
      for (let i = 0; i < steps; i++) {
        const cy = caravan.position.y + 0.1;
        vfx.wagonDust(caravan.position.x - 1.02, cy, 1.25);
        vfx.wagonDust(caravan.position.x + 1.02, cy, 1.25);
        vfx.simulate(1, dt);
      }
    },
    // Pin the world to scroll-distance d and render one frame synchronously.
    // Pure function of (d, current preset) → identical pixels across runs
    // (fxTime is pinned to d too, so water phase is deterministic).
    freezeAt(d) { frozen = true; scrollZ = d; fxTime = d; pose(d); return renderOnce(); },
    unfreeze() { frozen = false; },
    ready: true,
  };

  // ── state→3D adapter (THREEJS_REBUILD_PLAN §3.4, status-correction P0) ──
  // Before this, the bridge only show/hid the canvas, so in real play the world
  // was stuck on the constant-scroll travel preset — blind to river, landmark,
  // death, hunting, arrival. Map each world state to its camera preset and feed
  // the server's trigger payload (`data` === `res.trigger_data`, also mirrored
  // on engine.currentRiver / engine.currentLandmark). Read-only: never mutates
  // state, never calls the API. Non-world states hide the canvas (the 2D event/
  // menu UI shows over the body background) — overlay cohesion is a later pass.
  if (engine && engine.on) {
    // The run's tone tier lives at GameState.settings.tone_tier (worker/src/
    // types.ts Settings). engine.tone is the accessor the 2D scenes read, kept
    // last in the chain as the fallback; medium when there is no run at all
    // (harness and test paths mount the world with no signed state).
    const toneTier = () => {
      const gs = engine.gameState;
      return (gs && gs.settings && gs.settings.tone_tier)
        || (gs && gs.simulation && gs.simulation.tone_tier)
        || engine.tone
        || 'medium';
    };
    const applyState = (to, data) => {
      if (!WORLD_STATES.has(to)) { api.hide(); return; }
      setGrade(toneTier());
      // Before the preset: preset() poses immediately, and pose() reads the
      // terrain biome and sky tint this call installs.
      applyArc(engine.milesTraveled);
      switch (to) {
        case 'TRAVEL':
          api.setMoving(true);
          preset('travel');
          break;
        case 'RIVER': {
          const r = data || engine.currentRiver || {};
          preset('river', {
            widthFt: r.width_ft ?? r.width,
            fordDifficulty: r.ford_difficulty ?? r.difficulty,
          });
          break;
        }
        case 'LANDMARK': {
          const lm = data || engine.currentLandmark || {};
          // type union (fort|natural|river_crossing|settlement|destination)
          // matches landmarks.mjs 1:1. EXCEPT river_crossing: its landmark
          // model is dry bank dressing (the water sheet is owned by the RIVER
          // state / enterRiver), so the fort preset would paint a ferry on dry
          // land. A river_crossing landmark (e.g. the mile-83 Kansas Crossing,
          // emitted as a LANDMARK waypoint before the river check) is just a
          // waypoint here — show the travel world, not a dry ferry.
          if (lm.type === 'river_crossing') { preset('travel'); break; }
          preset('fort', { type: lm.type, name: lm.name });
          break;
        }
        case 'HUNTING':
          preset('hunting');
          break;
        case 'DEATH':
          preset('death');
          break;
        case 'ARRIVAL':
          preset('arrival');
          break;
      }
      // Weather is 2D-only in scenes/travel.js, so the 3D rain/snow/dust never
      // fired in real play — bridge it here from the same miles the game uses.
      // The four travel-world states (incl. a river_crossing LANDMARK routed to
      // the travel preset above) get deterministic weatherForMiles; DEATH and
      // ARRIVAL are clear so the somber/welcoming moods read uncluttered.
      if (to === 'DEATH' || to === 'ARRIVAL') {
        setWeather('none', 0);
      } else {
        const w = weatherForMiles(engine.milesTraveled);
        setWeather(w.kind, w.intensity);
      }
      api.show();
    };
    engine.on('stateChange', ({ to, data }) => applyState(to, data));
    // stateChange is NOT enough for the mood arc. engine.transition() only fires
    // when a day's advance produced a trigger; the routine case (`default:` in
    // the advance handler) just schedules the next advance, so a party can cover
    // hundreds of miles without one — and the arc would sit frozen on whichever
    // segment the last landmark happened to be in. `daysAdvanced` fires on every
    // advance, triggered or not, which is the clock miles actually move on.
    // No pose() here: the render loop already poses every visible frame, and a
    // hidden or frozen world re-poses on its next preset().
    engine.on('daysAdvanced', () => applyArc(engine.milesTraveled));
  }

  window.__three = api;
  return api;
}
