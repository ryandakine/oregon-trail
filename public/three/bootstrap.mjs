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
import * as textures from './textures.mjs';
import { createTerrain, BIOMES } from './terrain.mjs';
import { createSky } from './sky.mjs';
import { createWagon, createOxTeam, createPioneer, createContactShadow } from './models.mjs';
import { createGrass } from './grass.mjs';
import { createVfx } from './vfx.mjs';
import { createRiver, createBankDressing, ftToWorld } from './water.mjs';
import { createCampfire, createCampDressing } from './camp.mjs';

// Scenes that own the 3D world. Menu/UI scenes hide the canvas so they look
// unchanged (Kaplay transparent → body background shows through).
const WORLD_STATES = new Set(['TRAVEL', 'RIVER', 'LANDMARK', 'HUNTING', 'DEATH', 'ARRIVAL']);

const WAGON_SPEED = 1.9; // world-units/sec — plodding ox pace, drives scroll + gaits

function tierFromQuery() {
  const p = new URLSearchParams(location.search).get('gfx');
  if (p === 'low' || p === 'high') return p;
  // Default high on desktop. A real mobile tier + device detect is the DEC-B
  // kill-gate (needs a real device), still open.
  return 'high';
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
  scene.fog = new THREE.Fog(0xc9ddec, 60, 520);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 950);
  camera.position.set(6.5, 3.6, 11);
  camera.lookAt(0, 1.5, 0);

  // ── Lighting: warm directional key + cool hemisphere fill. Colors and
  // intensities are driven per-frame by sky.applyTo(t); these are bind points.
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x46603a, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedd0, 2.8);
  sun.position.set(9, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(HIGH ? 2048 : 1024, HIGH ? 2048 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  const S = 24;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

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
    new THREE.MeshLambertMaterial({ color: 0xb9c4a0, map: backstopTex, fog: true }),
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

  const sky = createSky({ cloudTexture: textures.cloudTexture() });
  scene.add(sky.group);

  // Caravan: stationary group at the trail anchor; forward = -Z.
  const caravan = new THREE.Group();
  scene.add(caravan);

  const wagon = createWagon({ textures });
  wagon.group.rotation.y = -Math.PI / 2; // model forward (-X, tongue) → world -Z
  caravan.add(wagon.group);

  // Yoked pair + pole reaching back toward the wagon tongue.
  const team = createOxTeam();
  team.group.position.set(0, 0, -3.0);
  caravan.add(team.group);

  const walkers = [
    createPioneer({ hat: 'felt' }),
    createPioneer({ hat: 'bonnet', dress: true }),
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

  // ── Post: RenderPass → UnrealBloom → OutputPass(ACES). No pmndrs. ──
  let composer = null;
  if (HIGH) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.55, 0.85,
    ));
    composer.addPass(new OutputPass());
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    vfx.setViewport(h, camera.fov);
  }
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
    fort: { t: 0.62, fov: 38, cam: [5, 1.9, 12], look: [0, 2.4, 0], fog: [45, 230], lantern: 3.2 },
    // Tight, intimate, slightly high angle looking down at the fire circle
    // beside the wagon (§5a): fire frame-left as the only key, wagon behind.
    night: { t: 0.005, fov: 40, cam: [-7.5, 3.4, 5.5], look: [-2.6, 0.7, 1.2], fog: [16, 90], lantern: 6 },
  };
  function preset(name) {
    const p = PRESETS[name] || PRESETS.travel;
    // The river preset owns a mounted crossing; every other preset clears it.
    if (name === 'river' && !river) enterRiver({});
    else if (name !== 'river' && river) exitRiver();
    // The night preset owns a mounted camp; every other preset clears it.
    if (name === 'night' && !camp) enterCamp();
    else if (name !== 'night' && camp) exitCamp();
    todT = p.t;
    camera.fov = p.fov;
    camera.position.set(...p.cam);
    camera.lookAt(...p.look);
    camera.updateProjectionMatrix();
    scene.fog.near = p.fog[0];
    scene.fog.far = p.fog[1];
    wagon.lantern.material.emissiveIntensity = p.lantern;
    pose(scrollZ); // re-light + re-pose under the new preset immediately
  }

  // ── Animation: everything is a pure function of scrollZ (+ todT) ──
  let scrollZ = 0;
  let moving = true;
  let frozen = false;
  let visible = false;

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
    sky.update(0, todT, camera.position);
    sky.applyTo({ sun, hemi, scene }, todT);
    // Re-anchor the sun close to the caravan so the ortho shadow frustum
    // (near 1 / far 80) actually contains the world — sky.applyTo parks it
    // 200u out on the sun arc, far outside the shadow camera.
    sun.position.copy(sky.sunDirAt(todT)).multiplyScalar(34);
    sun.target.position.set(0, 0, 0);
    if (river) {
      river.water.update(0, fxTime);
      river.water.setSun(sky.sunDirAt(todT), sun.color);
      river.water.setSky(scene.fog.color);
    }
    if (camp) camp.fire.setPhase(fxTime);
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
  function frame() {
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    if (!visible || frozen) return;
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
    setMoving(m) { moving = !!m; },
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
    // Pin the world to scroll-distance d and render one frame synchronously.
    // Pure function of (d, current preset) → identical pixels across runs
    // (fxTime is pinned to d too, so water phase is deterministic).
    freezeAt(d) { frozen = true; scrollZ = d; fxTime = d; pose(d); return renderOnce(); },
    unfreeze() { frozen = false; },
    ready: true,
  };

  // Show only for world scenes; hide for menu/UI scenes so they look unchanged.
  if (engine && engine.on) {
    engine.on('stateChange', ({ to }) => {
      if (WORLD_STATES.has(to)) api.show(); else api.hide();
    });
  }

  window.__three = api;
  return api;
}
