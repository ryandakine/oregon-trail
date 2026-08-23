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
const REBUILD_STEP = 9;    // re-seed every this many world-units of scroll
const BEHIND = 28 + REBUILD_STEP; // behind the wagon, + one step of seed lag
const TRAIL_CLEAR = 3.0;   // keep tufts off the trail + feather
const DENSITY = 0.62;      // accept ratio per cell
const CULL_BUCKET = 16;    // quantise the fog cull radius (see fogCullDistance)

function hash2(a, b, k) {
  const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Tufts past the fog far distance render as 100% fog colour — drawing them is
// pure cost. The fog is read off whichever scene the field is mounted in, so the
// radius tracks the weather fog pulls without the integrator pushing a value
// down. Quantised into buckets because pose() re-derives fog.far every frame
// from the live weather intensity, and re-seeding on each micro-change would
// rebuild the whole field every frame.
function fogCullDistance(obj) {
  for (let n = obj; n; n = n.parent) {
    if (!n.fog) continue;
    const far = n.fog.isFogExp2 ? 2.6 / Math.max(n.fog.density, 1e-4) : n.fog.far;
    // Culling measures horizontal distance from the wagon at the origin, but fog
    // measures view depth from a camera up to ~12u off it — hence the margin.
    return Math.ceil((far * 1.06 + 8) / CULL_BUCKET) * CULL_BUCKET;
  }
  return Infinity;
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
    sh.uniforms.uTime = { value: 0 };
    // Wind sway: displace blade-top vertices in local space (before the
    // instanceMatrix multiply in project_vertex) so each tuft sways as one
    // rigid blade. Base (uv.y=0) stays pinned; tip (uv.y=1) gets full amp —
    // that's the pivot-at-base look. Phase keyed off world XZ so the field
    // doesn't sway in lockstep.
    sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 grassWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
       float sway = sin(uTime * 1.6 + grassWorld.x * 0.6 + grassWorld.z * 0.4) * 0.09 * uv.y;
       transformed.x += sway;
       transformed.z += sway;`,
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      // Provide exactly what the replaced chunk provides — `normal` and
      // `nonPerturbedNormal`. (geometryNormal is declared later by
      // lights_fragment_begin; redeclaring it here fails to compile.)
      `vec3 normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
       vec3 nonPerturbedNormal = normal;`,
    );
    mat.userData.shader = sh;
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

  let builtAt = null;   // quantised scroll anchor the field was last seeded around
  let builtCull = 0;    // fog cull radius the field was last seeded under

  function rebuild(anchorZ) {
    builtAt = anchorZ;
    builtCull = fogCullDistance(group);
    const cull2 = builtCull * builtCull;
    let n = 0;
    const gz0 = Math.floor((anchorZ - AHEAD) / CELL);
    const gz1 = Math.ceil((anchorZ + BEHIND) / CELL);
    const gx0 = Math.floor(-HALF_W / CELL);
    const gx1 = Math.ceil(HALF_W / CELL);
    outer:
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (hash2(gx, gz, 41) > DENSITY) continue;
        const x = (gx + hash2(gx, gz, 42)) * CELL;
        const absZ = (gz + hash2(gx, gz, 43)) * CELL;
        if (Math.abs(x) > HALF_W) continue;
        // Group-local at build time; also the cull radius the fog is measured on.
        const lz = absZ - anchorZ;
        if (x * x + lz * lz > cull2) continue;
        // Keep the trail and its feather clear.
        if (Math.abs(x - terrain.trailXAt(absZ)) < TRAIL_CLEAR) continue;
        // Keep grass out of river channels (blades poking out of the water).
        if (terrain.carveDepthAt && terrain.carveDepthAt(absZ) > 0.12) continue;
        // Keep grass off leveled structure pads (fort/settlement footprints).
        if (terrain.padWeightAt && terrain.padWeightAt(x, absZ) > 0.35) continue;
        const y = terrain.heightAt(x, absZ) - 0.04; // sink the base
        const s = 0.5 + hash2(gx, gz, 44) * 0.55; // 0.5-1.05u — knee height, not waist
        pos.set(x, y, lz);
        quat.setFromAxisAngle(Y_AXIS, hash2(gx, gz, 45) * Math.PI);
        scl.set(s, s * (0.8 + hash2(gx, gz, 46) * 0.35), s);
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(n, m4);
        n++;
        if (n >= count) break outer;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    update(scrollZ) {
      // The seed anchor is quantised to REBUILD_STEP so it is a pure function of
      // scrollZ. It used to be whatever scroll value the free-running frames
      // happened to leave, which meant freezeAt(d) re-seeded a slightly
      // different band depending on the history in front of it — the file's own
      // pixel-stability contract, unmet. BEHIND absorbs the resulting seed lag.
      const anchor = Math.floor(scrollZ / REBUILD_STEP) * REBUILD_STEP;
      if (builtAt !== anchor || fogCullDistance(group) !== builtCull) rebuild(anchor);
      // Smooth scroll between seeds. A tuft is baked at local (absZ - builtAt)
      // and has to land at world (absZ - scrollZ), so the group carries
      // builtAt - scrollZ. The negated form drifted the field the WRONG WAY at
      // double speed — up to 4u off the terrain by the end of a seed interval,
      // popping back flat on every re-seed.
      group.position.z = builtAt - scrollZ;
      // Driven by scrollZ (pure function of d, same as wagon/team setPhase) —
      // never wall clock, so freezeAt(d) stays pixel-stable.
      if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = scrollZ;
    },
    // Force a re-seed on the next update — terrain features changed under the
    // field (river carved/cleared) while the scroll position stood still.
    invalidate() { builtAt = null; },
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
