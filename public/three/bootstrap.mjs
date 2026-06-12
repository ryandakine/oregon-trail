// 3D render layer bootstrap (M0 scaffolding).
//
// Mounts a Three.js canvas BEHIND the Kaplay canvas (z-index 0; Kaplay canvas is
// transparent so the HUD/overlays composite on top). Sets up the renderer with
// ACES tonemapping + PCFSoft shadows + a hand-rolled bloom/output EffectComposer
// (no n8ao / no pmndrs — importmap-clean, see THREEJS_REBUILD_PLAN §3.3), and
// renders a placeholder lit world to prove the pipeline + the screenshot harness.
//
// Resilience: if anything in here throws, the caller swallows it and the existing
// Kaplay 2D game keeps working. The 3D layer is strictly additive and read-only
// on engine state.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Scenes that own the 3D world. Menu/UI scenes hide the canvas so they look
// unchanged (Kaplay transparent → body background shows through).
const WORLD_STATES = new Set(['TRAVEL', 'RIVER', 'LANDMARK', 'HUNTING', 'DEATH', 'ARRIVAL']);

function tierFromQuery() {
  const p = new URLSearchParams(location.search).get('gfx');
  if (p === 'low' || p === 'high') return p;
  // M0 default: high on desktop. A real mobile tier + device detection is the
  // DEC-B/M0 perf kill-gate (needs a real device), not implemented here yet.
  return 'high';
}

export function initThree(engine) {
  const gfx = tierFromQuery();
  const HIGH = gfx === 'high';

  const canvas = document.createElement('canvas');
  canvas.id = 'three-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;display:none;';
  // Insert as the first body child so it sits behind the Kaplay canvas.
  document.body.insertBefore(canvas, document.body.firstChild);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HIGH ? 1.75 : 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;     // OutputPass applies this
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const SKY = new THREE.Color(0x9fc4e8);
  scene.background = SKY;
  scene.fog = new THREE.Fog(0xb8d4e8, 60, 520);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 950);
  camera.position.set(6.5, 4.2, 11);
  camera.lookAt(0, 1.4, 0);

  // ── Lighting: warm directional key + cool hemisphere fill (§5a #3) ──
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x46603a, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedd0, 2.8);
  sun.position.set(9, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(HIGH ? 2048 : 1024, HIGH ? 2048 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  const S = 24;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  // ── Placeholder world (M0 proof — replaced by real terrain/wagon in M1) ──
  const world = new THREE.Group();
  scene.add(world);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x6f9a3e, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  // A worn dirt "trail" strip painted toward the camera
  const trail = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 400),
    new THREE.MeshStandardMaterial({ color: 0x8b6033, roughness: 1 }),
  );
  trail.rotation.x = -Math.PI / 2;
  trail.position.y = 0.01;
  trail.receiveShadow = true;
  world.add(trail);

  // Placeholder covered wagon: bed (box) + canvas arch (half-cylinder) + 4 wheels
  const wagon = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.75 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.6, metalness: 0.3 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 1.8), wood);
  bed.position.y = 1.25; bed.castShadow = true; bed.receiveShadow = true; wagon.add(bed);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.2, 20, 1, true, 0, Math.PI), cloth);
  arch.rotation.z = Math.PI / 2; arch.position.y = 1.85; arch.castShadow = true; wagon.add(arch);
  for (const [x, z] of [[-1.2, 0.95], [1.2, 0.95], [-1.2, -0.95], [1.2, -0.95]]) {
    const r = z > 0 ? 0.7 : 0.55;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.18, 18), iron);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(x, r, z); wheel.castShadow = true;
    wheel.userData.spin = true; wagon.add(wheel);
  }
  world.add(wagon);

  // Emissive lantern sphere to prove bloom fires through the composer
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffcc55, emissive: 0xffaa22, emissiveIntensity: 4 }),
  );
  lantern.position.set(-1.9, 1.55, 0.7);
  world.add(lantern);

  // ── Post: RenderPass → UnrealBloom → OutputPass(ACES). Hand-rolled, no pmndrs ──
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
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // M0: swallow context-loss so the 2D game stays alive; a webglcontextrestored
  // rebuild lands with the full dispose/lifecycle work in M1.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);

  const clock = new THREE.Clock();
  let visible = false;
  let frozen = false;
  let raf = 0;
  function pose(t) {
    // All time-driven animation goes through here so freezeAt() can pin an
    // exact phase — required for deterministic screenshots (plan §3.1: pixel
    // diffs are meaningless if the wheel angle varies run-to-run).
    wagon.children.forEach((c) => { if (c.userData.spin) c.rotation.z = t * 2.2; });
    arch.position.y = 1.85 + Math.sin(t * 1.3) * 0.015;
  }
  // renderer.info auto-resets on every internal render() call, and the composer
  // makes several per frame (scene, bloom, output) — so a read after
  // composer.render() would see only the final fullscreen pass (1 triangle).
  // Accumulate manually across the whole chain instead.
  renderer.info.autoReset = false;
  function renderOnce() {
    renderer.info.reset();
    if (composer) composer.render(); else renderer.render(scene, camera);
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible || frozen) return;
    pose(clock.getElapsedTime());
    renderOnce();
  }
  frame();

  // Per-scene camera + lighting presets (§5a per-scene cinematography). M0 uses
  // the same placeholder world; each preset proves the harness can frame and
  // light the four hero shots distinctly. Real scene content lands in M1–M5.
  function preset(name) {
    // Every preset re-states EVERY mutable knob (camera, sun, hemi, fog,
    // lantern) so presets are order-independent — a one-branch-only mutation
    // leaks into later presets and corrupts live scene cycling.
    if (name === 'travel') {
      camera.position.set(6.5, 3.6, 11); camera.lookAt(0, 1.5, 0); camera.fov = 35;
      sun.position.set(11, 9, 6); sun.color.set(0xffe0b0); sun.intensity = 3.0;
      hemi.intensity = 0.5; scene.background.set(0x9fc4e8); scene.fog.color.set(0xc9ddec);
      scene.fog.near = 60; scene.fog.far = 520;
      lantern.material.emissiveIntensity = 4;
    } else if (name === 'river') {
      camera.position.set(12, 3.2, 7); camera.lookAt(-1, 0.9, 0); camera.fov = 40;
      sun.position.set(4, 16, 8); sun.color.set(0xfff2d6); sun.intensity = 3.4;
      hemi.intensity = 0.6; scene.background.set(0xaccbe6); scene.fog.color.set(0xb6cfe0);
      scene.fog.near = 40; scene.fog.far = 400;
      lantern.material.emissiveIntensity = 4;
    } else if (name === 'fort') {
      camera.position.set(5, 1.9, 12); camera.lookAt(0, 2.4, 0); camera.fov = 38;
      sun.position.set(9, 11, 4); sun.color.set(0xffedd0); sun.intensity = 2.8;
      hemi.intensity = 0.5; scene.background.set(0x9fc4e8); scene.fog.color.set(0xc9ddec);
      scene.fog.near = 50; scene.fog.far = 470;
      lantern.material.emissiveIntensity = 4;
    } else if (name === 'night') {
      camera.position.set(4, 3.0, 8); camera.lookAt(0, 1.4, 0); camera.fov = 36;
      sun.position.set(-6, 8, -4); sun.color.set(0x3a4a78); sun.intensity = 0.25;
      hemi.intensity = 0.12; scene.background.set(0x0a0f1e); scene.fog.color.set(0x070b16);
      scene.fog.near = 20; scene.fog.far = 120;
      lantern.material.emissiveIntensity = 6;
    }
    camera.updateProjectionMatrix();
  }

  const api = {
    THREE, renderer, scene, camera, composer, gfx, sun, hemi, lantern, preset, renderOnce,
    show() { visible = true; canvas.style.display = 'block'; resize(); },
    hide() { visible = false; canvas.style.display = 'none'; frozen = false; },
    // Pin all animation to a fixed phase and render one frame synchronously.
    // Screenshot/smoke harnesses call freezeAt(0) before capture; returns the
    // frame's render stats ({calls, triangles}) as a "world actually drew"
    // probe (info.render.calls alone reads 1 from the composer's output pass).
    freezeAt(t) { frozen = true; pose(t); return renderOnce(); },
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
