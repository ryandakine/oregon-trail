// Instanced grass-tuft field (M1 polish).
//
// Cross-quad billboards textured with the painted tuft sprite, scattered on a
// deterministic hash grid in ABSOLUTE trail space (absZ), excluded from the
// trail itself. The instanced mesh lives inside a group that translates with
// the scroll for perfectly smooth motion; when the accumulated offset exceeds
// REBUILD_STEP the matrices are re-seeded around the new scroll position.
// Everything derives from scrollZ + cell hashes — no wall-clock, no unseeded
// RNG — so freezeAt(d) yields identical pixels across runs.

import * as THREE from 'three';

const CELL = 2.1;          // hash-grid cell size (one potential tuft per cell)
const HALF_W = 42;         // scatter width: covers what gameplay cameras see
const AHEAD = 150;         // absZ span ahead of the wagon (world -Z)
const BEHIND = 28;         // behind the wagon
const REBUILD_STEP = 9;    // re-seed when the world has scrolled this far
const TRAIL_CLEAR = 3.0;   // keep tufts off the trail + feather
const DENSITY = 0.62;      // accept ratio per cell

function hash2(a, b, k) {
  const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function createGrass({ terrain, tuftTexture, count = 2400 } = {}) {
  const group = new THREE.Group();

  // Cross-quad geometry: two unit planes crossed at 90°, base at y=0.
  const p1 = new THREE.PlaneGeometry(1, 1);
  const p2 = new THREE.PlaneGeometry(1, 1);
  p2.rotateY(Math.PI / 2);
  const geo = mergeQuads(p1, p2);
  geo.translate(0, 0.5, 0);

  const mat = new THREE.MeshLambertMaterial({
    map: tuftTexture,
    alphaTest: 0.5, // cut the premultiplied-darkened antialias fringe
    side: THREE.DoubleSide,
    // Lambert (not Standard): thousands of alpha-tested quads don't need PBR,
    // and it keeps the mobile tier honest.
  });
  // Grass cards are VERTICAL quads — their geometric normals are horizontal, so
  // a high sun leaves them almost unlit (they rendered as black spikes). Shade
  // every blade with the world-up normal instead, so tufts take exactly the
  // lighting of the ground they grow from, from every viewing angle.
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      // Provide exactly what the replaced chunk provides — `normal` and
      // `nonPerturbedNormal`. (geometryNormal is declared later by
      // lights_fragment_begin; redeclaring it here fails to compile.)
      `vec3 normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
       vec3 nonPerturbedNormal = normal;`,
    );
  };
  // Tufts shouldn't catch the directional shadow pass (acne on alpha cards).
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // group translates every frame; bounds go stale
  group.add(mesh);

  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  let builtAt = null; // scrollZ value the field was last seeded around

  function rebuild(scrollZ) {
    builtAt = scrollZ;
    let n = 0;
    const gz0 = Math.floor((scrollZ - AHEAD) / CELL);
    const gz1 = Math.ceil((scrollZ + BEHIND) / CELL);
    const gx0 = Math.floor(-HALF_W / CELL);
    const gx1 = Math.ceil(HALF_W / CELL);
    outer:
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (hash2(gx, gz, 41) > DENSITY) continue;
        const x = (gx + hash2(gx, gz, 42)) * CELL;
        const absZ = (gz + hash2(gx, gz, 43)) * CELL;
        if (Math.abs(x) > HALF_W) continue;
        // Keep the trail and its feather clear.
        if (Math.abs(x - terrain.trailXAt(absZ)) < TRAIL_CLEAR) continue;
        const y = terrain.heightAt(x, absZ) - 0.04; // sink the base
        const s = 0.55 + hash2(gx, gz, 44) * 0.75;
        pos.set(x, y, absZ - scrollZ);          // group-local at build time
        quat.setFromAxisAngle(Y_AXIS, hash2(gx, gz, 45) * Math.PI);
        scl.set(s, s * (0.85 + hash2(gx, gz, 46) * 0.5), s);
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(n, m4);
        n++;
        if (n >= count) break outer;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    group.position.z = 0;
  }

  return {
    group,
    update(scrollZ) {
      if (builtAt === null || Math.abs(scrollZ - builtAt) > REBUILD_STEP) rebuild(scrollZ);
      else group.position.z = scrollZ - builtAt; // smooth scroll between seeds
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// Minimal two-geometry merge (positions/normals/uvs) — avoids importing
// BufferGeometryUtils for one fixed, known-layout case.
function mergeQuads(a, b) {
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.getAttribute(name), B = b.getAttribute(name);
    const out = new Float32Array((A.count + B.count) * A.itemSize);
    out.set(A.array, 0);
    out.set(B.array, A.count * A.itemSize);
    geo.setAttribute(name, new THREE.BufferAttribute(out, A.itemSize));
  }
  const ia = a.getIndex().array, ib = b.getIndex().array;
  const idx = new Uint16Array(ia.length + ib.length);
  idx.set(ia, 0);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + a.getAttribute('position').count;
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
