// Night-camp module: campfire + camp dressing.
//
// Exports:
//   createCampfire({ glowTexture })  →  { group, light, firePos, update(dt,t), setPhase(t), dispose() }
//   createCampDressing({ textures }) →  { group, dispose() }
//
// Animation model: everything is a pure function of t (seconds, passed in from
// the integrator). No Math.random() — all scatter seeded via LCG / coord hash.
// Bloom path: flame meshes use MeshStandardMaterial with high emissiveIntensity
// so they cross the UnrealBloom threshold (0.85). The PointLight is the camp
// key light; its intensity flickers deterministically from t.

import * as THREE from 'three';
import { toonRamp } from './textures.mjs';

// ── PALETTE (from public/lib/draw.mjs + models.mjs) ──────────────────────────
const C = {
  wood:      0x5a3a1f,
  woodLight: 0x8b5a2d,
  woodDark:  0x372312,
  stone:     0x968e84,
  stoneLight: 0xbab2a8,
  dirtMid:   0x8b6033,
  // Camp-specific
  logBark:   0x372312, // woodDark — charred logs
  coalBed:   0xff5510, // glowing ember orange
  flameOuter: 0xff7a18, // orange outer flame
  flameInner: 0xffd14d, // bright yellow inner flame
  flameLight: 0xff8830, // PointLight tint
  glowPool:  0xff8a30, // ground glow decal tint
  // Camp dressing
  blanket:   0x7a5c3e, // muted warm brown bedroll
  pot:       0x2a2420, // dark iron pot
  tripodWood: 0x5a3a1f,
};

// ── Local material helpers (not imported from models.mjs per constraint) ──────

// Toon for the lit dressing (logs, bedroll, tripod, pot) so camp props band
// with the rest of the cast. The flame/coal materials below stay Standard: they
// are self-lit emissive above the bloom threshold, not shaded surfaces.
function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Deterministic LCG seeded from two integers ────────────────────────────────
// Returns a float in [0, 1). Call repeatedly for a sequence.
function lcgNext(state) {
  // LCG constants from Numerical Recipes
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return { val: next / 0xffffffff, state: next };
}

function lcgSeed(a, b) {
  const s0 = (Math.imul(a | 0, 2654435761) ^ (b | 0)) >>> 0;
  return (Math.imul(s0, 1664525) + 1013904223) >>> 0;
}

// ── Flame LatheGeometry profile (7 points, spec-mandated) ────────────────────
const FLAME_PROFILE = [
  [0,     0   ],
  [0.16,  0.1 ],
  [0.27,  0.28],
  [0.3,   0.45],
  [0.22,  0.66],
  [0.1,   0.84],
  [0.001, 0.95],
].map(([r, y]) => new THREE.Vector2(r, y));

// ── createCampfire ────────────────────────────────────────────────────────────

export function createCampfire({ glowTexture } = {}) {
  const group = new THREE.Group();

  // ── 1. Log pile: 5 short cylinders leaning inward in a teepee ──────────────
  const logMat = toon(C.logBark);
  const logGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.82, 8);
  const LOG_COUNT = 5;
  for (let i = 0; i < LOG_COUNT; i++) {
    const ang = (i / LOG_COUNT) * Math.PI * 2;
    // Deterministic per-log jitter via LCG
    let rng = { state: lcgSeed(i * 17, 99) };
    rng = lcgNext(rng.state);
    const angJit = (rng.val - 0.5) * 0.32;
    rng = lcgNext(rng.state);
    const leanJit = rng.val * 0.08;

    const finalAng = ang + angJit;
    const log = shadowed(new THREE.Mesh(logGeo, logMat));

    // Position: lay tip near center, butt outward
    const radius = 0.34;
    log.position.set(
      Math.sin(finalAng) * radius,
      0.2,
      Math.cos(finalAng) * radius,
    );

    // Lean inward: tilt the cylinder so the top points toward the fire center
    log.rotation.z = Math.sin(finalAng) * (0.72 + leanJit);
    log.rotation.x = Math.cos(finalAng) * (0.72 + leanJit);
    group.add(log);
  }

  // ── 2. Coal bed: small emissive cluster at the base ──────────────────────
  // Three small squashed spheres form the ember bed; emissiveIntensity animated
  const coalMeshes = [];
  const coalGeo = new THREE.SphereGeometry(0.14, 8, 6);
  for (let i = 0; i < 3; i++) {
    let rng = { state: lcgSeed(i * 41, 7) };
    rng = lcgNext(rng.state);
    const ox = (rng.val - 0.5) * 0.22;
    rng = lcgNext(rng.state);
    const oz = (rng.val - 0.5) * 0.22;
    const coal = new THREE.Mesh(
      coalGeo,
      new THREE.MeshStandardMaterial({
        color: 0x330d00,
        emissive: new THREE.Color(C.coalBed),
        emissiveIntensity: 2.5,
        roughness: 1.0,
        metalness: 0,
      }),
    );
    coal.scale.set(1.0, 0.32, 1.0); // squash flat
    coal.position.set(ox, 0.04, oz);
    coal.receiveShadow = true;
    group.add(coal);
    coalMeshes.push(coal);
  }

  // ── 3. Flame: two nested LatheGeometry cones for bloom ───────────────────
  const flameGeo = new THREE.LatheGeometry(FLAME_PROFILE, 8);

  // Outer flame: orange, slightly larger, lower emissiveIntensity
  const outerFlameMat = new THREE.MeshStandardMaterial({
    color: 0xff5500,
    emissive: new THREE.Color(C.flameOuter),
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
    roughness: 1.0,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const outerFlame = new THREE.Mesh(flameGeo, outerFlameMat);
  outerFlame.scale.setScalar(1.0); // base scale, animation multiplies on top
  outerFlame.position.y = 0.05;
  outerFlame.renderOrder = 2;
  group.add(outerFlame);

  // Inner flame: narrower, brighter yellow — crosses bloom threshold at higher intensity
  const innerFlameGeo = new THREE.LatheGeometry(FLAME_PROFILE, 8);
  const innerFlameMat = new THREE.MeshStandardMaterial({
    color: 0xff9900,
    emissive: new THREE.Color(C.flameInner),
    emissiveIntensity: 5.0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
    roughness: 1.0,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const innerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat);
  innerFlame.scale.set(0.55, 0.88, 0.55); // narrower and shorter
  innerFlame.position.y = 0.05;
  innerFlame.renderOrder = 3;
  group.add(innerFlame);

  // ── 4. PointLight: camp key light ────────────────────────────────────────
  const light = new THREE.PointLight(C.flameLight, 12, 16, 2);
  light.position.set(0, 1.0, 0);
  group.add(light);

  // ── 5. Ground glow decal ─────────────────────────────────────────────────
  if (glowTexture) {
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: new THREE.Color(C.glowPool),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.y = 0.04;
    glowMesh.renderOrder = 1;
    group.add(glowMesh);
  }

  // ── firePos: tip of flame area, for ember particle emitter ───────────────
  const firePos = new THREE.Vector3(0, 1.0, 0);

  // ── Animation: pure function of t ────────────────────────────────────────
  function pose(t) {
    // Outer flame: two-frequency scale flutter
    outerFlame.scale.set(
      1 + Math.sin(t * 7) * 0.08,
      1.1 + Math.cos(t * 5) * 0.12,
      1 + Math.sin(t * 6) * 0.08,
    );
    // Inner flame follows outer but with slightly different frequencies
    innerFlame.scale.set(
      0.55 * (1 + Math.sin(t * 7 + 0.6) * 0.07),
      0.88 * (1.1 + Math.cos(t * 5 + 0.4) * 0.10),
      0.55 * (1 + Math.sin(t * 6 + 0.5) * 0.07),
    );
    // Slow Y rotation for wispy visual interest (deterministic)
    outerFlame.rotation.y = t * 0.3;
    innerFlame.rotation.y = t * 0.3 + 0.5;

    // Light flicker: two-frequency
    light.intensity = 12 + Math.sin(t * 9) * 2.5 + Math.sin(t * 23) * 1.2;

    // Coal ember pulse
    const coalIntensity = 2.5 + Math.sin(t * 4) * 0.4;
    for (const coal of coalMeshes) {
      coal.material.emissiveIntensity = coalIntensity;
    }

    // Update firePos to the current world-space tip (y ~1.0)
    // It's in local space — integrator reads it relative to group.position
    firePos.set(0, 1.0 * outerFlame.scale.y, 0);
  }

  return {
    group,
    light,
    firePos,
    update(_dt, t) { pose(t); },
    setPhase(t) { pose(t); },
    dispose() {
      flameGeo.dispose();
      innerFlameGeo.dispose();
      coalGeo.dispose();
      logGeo.dispose();
      outerFlameMat.dispose();
      innerFlameMat.dispose();
      logMat.dispose();
      for (const coal of coalMeshes) coal.material.dispose();
    },
  };
}

// ── createCampDressing ────────────────────────────────────────────────────────

export function createCampDressing({ textures } = {}) {
  const group = new THREE.Group();
  const geos = [];   // geometries to dispose
  const mats = [];   // materials to dispose (tracked once each)

  // Register a geometry and return a Mesh; material must already be tracked.
  function mesh(geo, mat) {
    geos.push(geo);
    return new THREE.Mesh(geo, mat);
  }

  // Track a material once and return it.
  function trackMat(m) {
    mats.push(m);
    return m;
  }

  // Helper: bark material with optional texture maps — tracked once.
  function barkMat(fallbackColor) {
    const maps = textures?.barkMaps?.() ?? null;
    if (maps) {
      return trackMat(toon(0xffffff, { map: maps.map }));
    }
    return trackMat(toon(fallbackColor));
  }

  function plankMat(fallbackColor) {
    const maps = textures?.plankMaps?.() ?? null;
    if (maps) {
      return trackMat(toon(0xffffff, { map: maps.map }));
    }
    return trackMat(toon(fallbackColor));
  }

  // ── 2-3 sitting logs: low cylinders on their side around the fire ─────────
  // Positions seeded deterministically
  const sitLogMat = barkMat(C.woodDark);
  const SIT_LOG_POSITIONS = [
    // [x, z, rotY]  — seeded manually so screenshot is stable
    [ 1.8,  0.4, 0.42],
    [-1.6,  0.6, -0.52],
    [ 0.2, -1.9, 1.20],
  ];
  for (const [lx, lz, rotY] of SIT_LOG_POSITIONS) {
    const geo = new THREE.CylinderGeometry(0.15, 0.18, 1.1, 10);
    const m = shadowed(mesh(geo, sitLogMat));
    // Lay on its side: rotate 90° around Z, then orient around Y
    m.rotation.z = Math.PI / 2;
    m.rotation.y = rotY;
    m.position.set(lx, 0.17, lz);
    group.add(m);
  }

  // ── Bedroll: flattened box in muted blanket color ─────────────────────────
  const bedMat = trackMat(toon(C.blanket));
  {
    const geo = new THREE.BoxGeometry(0.55, 0.14, 1.4);
    const bed = shadowed(mesh(geo, bedMat));
    bed.position.set(-2.2, 0.07, -0.9);
    bed.rotation.y = -0.3;
    group.add(bed);
    // Pillow bump at one end
    const pilGeo = new THREE.BoxGeometry(0.48, 0.10, 0.32);
    const pil = shadowed(mesh(pilGeo, bedMat));
    pil.position.set(-2.28, 0.15, -1.48);
    pil.rotation.y = -0.3;
    group.add(pil);
  }

  // ── Cook tripod: 3 thin cylinders meeting at apex + small pot ────────────
  // Tripod centered over origin (the fire) at y~1.5 apex
  const tripodMat = plankMat(C.tripodWood);
  const TRIPOD_LEGS = 3;
  const TRIPOD_RADIUS = 0.52;
  const TRIPOD_APEX_Y = 1.48;
  const LEG_LENGTH = 1.65;

  for (let i = 0; i < TRIPOD_LEGS; i++) {
    const ang = (i / TRIPOD_LEGS) * Math.PI * 2;
    const footX = Math.sin(ang) * TRIPOD_RADIUS;
    const footZ = Math.cos(ang) * TRIPOD_RADIUS;

    // Midpoint of the leg (center of cylinder)
    const midX = footX * 0.5;
    const midY = TRIPOD_APEX_Y * 0.5;
    const midZ = footZ * 0.5;

    const geo = new THREE.CylinderGeometry(0.025, 0.032, LEG_LENGTH, 6);
    const leg = shadowed(mesh(geo, tripodMat));
    leg.position.set(midX, midY, midZ);

    // Tilt from vertical by the lean angle, yaw to face inward
    const leanAngle = Math.atan2(TRIPOD_RADIUS, TRIPOD_APEX_Y);
    leg.rotation.order = 'YXZ';
    leg.rotation.y = ang + Math.PI;
    leg.rotation.x = leanAngle;

    group.add(leg);
  }

  // Chain / hook line from apex (a thin vertical cylinder stub)
  {
    const chainGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.38, 5);
    const chainMat = trackMat(toon(0x2a2420));
    const chain = mesh(chainGeo, chainMat);
    chain.position.set(0, TRIPOD_APEX_Y - 0.22, 0);
    group.add(chain);
  }

  // Small pot hanging on the chain
  {
    const potGeo = new THREE.CylinderGeometry(0.13, 0.10, 0.20, 10);
    const potMat = trackMat(toon(C.pot));
    const pot = shadowed(mesh(potGeo, potMat));
    pot.position.set(0, TRIPOD_APEX_Y - 0.52, 0);
    group.add(pot);
    // Pot rim
    const rimGeo = new THREE.TorusGeometry(0.13, 0.015, 6, 16);
    const rim = mesh(rimGeo, potMat);
    rim.position.set(0, TRIPOD_APEX_Y - 0.42, 0);
    group.add(rim);
  }

  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
