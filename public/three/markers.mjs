// Trailside grave markers for the DEATH scene (M6).
//
// All jitter is seeded from the grave name via a fast integer hash so the
// same name renders identically across frames — no Math.random().
//
// Integrator places the returned group near the wagon in the DEATH scene.
// The scene's desaturated, overcast sky handles the somber mood; these
// markers stay small and period-accurate (1848 frontier graves were rough).

import * as THREE from 'three';
import { toonRamp } from './textures.mjs';

// ── Palette (anchored to models.mjs C{} hex values) ──
const C = {
  woodDark:  0x372312,
  woodLight: 0x8b5a2d,
  stone:     0x8d8d85,
  stoneDark: 0x6a6a62,
  dirt:      0x3e2b1a,
  dirtLight: 0x5a3d26,
  pebble:    0x7a7a72,
};

// Re-implemented locally (not imported from models.mjs per constraints).
// Toon off the shared ramp so a grave reads in the same material family as the
// wagon standing beside it.
function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
}
function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Fast deterministic hash → float in [0, 1). No Math.random().
function hash(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 16777619)) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}
// Multiple draws from the same seed string.
function seeded(name) {
  let idx = 0;
  return () => hash(name, idx++);
}

// Low earth mound: flattened sphere on the ground plane.
function makeMound(r, seed) {
  const s = seeded(seed + '_mound');
  const mat = toon(C.dirtLight);
  const mound = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(r, 10, 7),
    mat,
  ));
  mound.scale.set(1 + s() * 0.12, 0.35 + s() * 0.08, 1 + s() * 0.12);
  mound.position.y = r * 0.18;
  return mound;
}

// A few scattered pebbles around the base.
const _pebbleMat = toon(C.pebble);
function addScatterStones(group, count, spread, seed) {
  const s = seeded(seed + '_stones');
  for (let i = 0; i < count; i++) {
    const r = 0.04 + s() * 0.04;
    const stone = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), _pebbleMat));
    const a = s() * Math.PI * 2, d = 0.18 + s() * spread;
    stone.position.set(Math.cos(a) * d, r * 0.6, Math.sin(a) * d);
    stone.scale.set(1 + s() * 0.5, 0.55 + s() * 0.3, 1 + s() * 0.5);
    group.add(stone);
  }
}

// ── Variant: rough weathered headstone ──
function makeHeadstone(name) {
  const group = new THREE.Group();
  const s = seeded(name);

  const mound = makeMound(0.38, name);
  group.add(mound);

  // Slightly irregular slab — box with a mild tilt as if settled.
  const w = 0.30 + s() * 0.06;
  const h = 0.42 + s() * 0.10;
  const d = 0.08 + s() * 0.04;
  const slab = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    toon(C.stone),
  ));
  // Settled tilt — each grave leans its own direction.
  slab.rotation.z = (s() - 0.5) * 0.18;   // ±~5°
  slab.rotation.x = (s() - 0.5) * 0.08;
  slab.position.y = h * 0.5 + 0.04;
  group.add(slab);

  addScatterStones(group, 4, 0.22, name);
  return group;
}

// ── Variant: two crossed wooden boards ──
function makeCross(name) {
  const group = new THREE.Group();
  const s = seeded(name);

  const mound = makeMound(0.36, name);
  group.add(mound);

  const woodMat = toon(C.woodDark);
  const tilt = (s() - 0.5) * 0.14;

  // Vertical post.
  const vPost = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.60, 0.055),
    woodMat,
  ));
  vPost.position.y = 0.30;
  vPost.rotation.z = tilt;
  group.add(vPost);

  // Horizontal crossbar, two-thirds up.
  const hBar = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.055, 0.055),
    woodMat,
  ));
  hBar.position.y = 0.40 + tilt * 0.12;
  hBar.rotation.z = tilt;
  group.add(hBar);

  addScatterStones(group, 3, 0.20, name);
  return group;
}

// ── Variant: cairn — stacked irregular stones ──
function makeCairn(name) {
  const group = new THREE.Group();
  const s = seeded(name);
  group.add(makeMound(0.30, name));
  const cairnMat = toon(C.stoneDark);
  // [count, y, spread]
  for (const [count, y, spread] of [[5,0.08,0.22],[4,0.18,0.16],[3,0.28,0.10],[1,0.36,0.04]]) {
    for (let i = 0; i < count; i++) {
      const r = 0.07 + s() * 0.045;
      const stone = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), cairnMat));
      const a = (i / count) * Math.PI * 2 + s() * 0.6, d = s() * spread;
      stone.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
      stone.scale.set(1 + s() * 0.4, 0.6 + s() * 0.3, 1 + s() * 0.4);
      group.add(stone);
    }
  }
  addScatterStones(group, 4, 0.24, name);
  return group;
}

const VARIANTS = ['headstone', 'cross', 'cairn'];

// ── Public API ──

export function createTombstone({ name = 'Unknown', variant } = {}) {
  const v = variant || VARIANTS[Math.floor(hash(name, 99) * VARIANTS.length)];
  const group = new THREE.Group();

  const inner = v === 'cross' ? makeCross(name)
    : v === 'cairn' ? makeCairn(name)
    : makeHeadstone(name);

  group.add(inner);

  function dispose() {
    group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        // Never dispose the shared module-level _pebbleMat — a second grave
        // would then render with a disposed material. Geometry is per-mesh.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m !== _pebbleMat) m.dispose();
      }
    });
  }

  return { group, dispose };
}

export function createGraveRow({ count = 3, names = [] } = {}) {
  const group = new THREE.Group();
  const disposers = [];

  const SPACING = 1.1;
  const half = (count - 1) * SPACING * 0.5;

  for (let i = 0; i < count; i++) {
    const name = names[i] || `Grave_${i}`;
    const v = VARIANTS[Math.floor(hash(name, 7) * VARIANTS.length)];
    const ts = createTombstone({ name, variant: v });
    // Slight positional jitter so the row isn't perfectly mechanical.
    const jx = (hash(name, 11) - 0.5) * 0.18;
    const jz = (hash(name, 13) - 0.5) * 0.25;
    ts.group.position.set(i * SPACING - half + jx, 0, jz);
    group.add(ts.group);
    disposers.push(ts.dispose);
  }

  function dispose() {
    for (const d of disposers) d();
  }

  return { group, dispose };
}
