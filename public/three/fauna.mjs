// Procedural prairie fauna: deer + bison for the HUNTING scene (and ambient
// travel life). Animation model matches models.mjs: pose is a PURE FUNCTION of
// distance, so freezeAt-style determinism holds across screenshot harness runs.
//
// Integrator: scatter createDeer / createBison across the meadow, call
// update(dt, speed) each frame (or setPhase(d) for deterministic freeze).
// setPose("graze"|"alert"|"flee") changes stance without resetting gait.

import * as THREE from 'three';

// ── Tiny local helpers (avoid importing models.mjs) ──────────────────────────

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...opts });
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Deer palette ──────────────────────────────────────────────────────────────
const D = {
  body:    0x9c6b3f, // warm tan-brown
  dark:    0x6b4020, // shaded flanks / ears
  cream:   0xf0d9b0, // belly + inner leg
  white:   0xf5f0e8, // tail flash
  nose:    0x2a1a10,
  antler:  0xc8a870, // pale horn
};

// ── Bison palette ─────────────────────────────────────────────────────────────
const B = {
  front:   0x4a3120, // dark shaggy shoulders + head
  rear:    0x6b4828, // slightly lighter hindquarters
  horn:    0x2a2016,
  hoof:    0x1a1008,
  nose:    0x1e1208,
};

// ─────────────────────────────────────────────────────────────────────────────
// createDeer
// ─────────────────────────────────────────────────────────────────────────────
export function createDeer({ tint = 0 } = {}) {
  const group = new THREE.Group();

  const bodyColor = new THREE.Color(D.body).offsetHSL(0, 0, tint * 0.05);
  const bodyMat   = std(bodyColor, { roughness: 0.9 });
  const darkMat   = std(D.dark,   { roughness: 0.92 });
  const creamMat  = std(D.cream,  { roughness: 0.9 });
  const whiteMat  = std(D.white,  { roughness: 0.85 });
  const antlerMat = std(D.antler, { roughness: 0.7 });

  // Body: slim capsule, horizontal
  const body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 5, 10), bodyMat));
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.82;
  group.add(body);

  // Cream belly underside
  const belly = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.58, 4, 8), creamMat));
  belly.rotation.z = Math.PI / 2;
  belly.position.y = 0.66;
  group.add(belly);

  // White tail flash — a small sphere rear-right, shown when fleeing
  const tail = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), whiteMat));
  tail.position.set(-0.72, 0.88, 0);
  group.add(tail);

  // Neck: angled cylinder bridging body to head
  const neck = new THREE.Group();
  const neckMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.46, 8), bodyMat));
  neckMesh.position.y = 0.23;
  neck.add(neckMesh);
  neck.position.set(0.56, 0.94, 0);
  neck.rotation.z = -0.6; // default alert-ish upright angle; pose() overrides
  group.add(neck);

  // Head: small rounded box
  const headG = new THREE.Group();
  const skull = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.16), bodyMat));
  headG.add(skull);
  // Muzzle
  const muzzle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.13), creamMat));
  muzzle.position.set(0.18, -0.03, 0);
  headG.add(muzzle);
  // Nose dot
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), std(D.nose));
  nose.position.set(0.26, -0.03, 0);
  headG.add(nose);
  // Ears: two flat boxes angled out
  for (const s of [-1, 1]) {
    const ear = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.10), darkMat));
    ear.position.set(-0.04, 0.14, s * 0.12);
    ear.rotation.z = s * 0.45;
    headG.add(ear);
  }
  // Antlers: a main stem + two angled branches each side (thin cylinders)
  for (const s of [-1, 1]) {
    const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.32, 6), antlerMat));
    stem.position.set(-0.04, 0.28, s * 0.10);
    stem.rotation.z = s * 0.18;
    headG.add(stem);
    // two tine branches off the stem
    for (const [ty, tz, rz] of [[0.13, 0.04, 0.7], [0.20, -0.02, -0.5]]) {
      const tine = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.20, 6), antlerMat));
      tine.position.set(-0.04, ty, s * (0.10 + tz));
      tine.rotation.z = s * rz;
      tine.rotation.x = s * 0.3;
      headG.add(tine);
    }
  }
  // Attach head to neck tip
  headG.position.set(0.06, 0.40, 0); // relative to neck group origin
  neck.add(headG);

  // Legs: 4 thin cylinders — upper + lower + hoof
  const legs = [];
  for (const [x, z, pairPhase] of [
    [ 0.36,  0.18, 0],           // FL + RR in phase
    [-0.36, -0.18, 0],
    [ 0.36, -0.18, Math.PI],     // FR + RL opposite
    [-0.36,  0.18, Math.PI],
  ]) {
    const leg = new THREE.Group();
    const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.36, 7), bodyMat));
    upper.position.y = -0.18;
    leg.add(upper);
    const lower = new THREE.Group();
    const shin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.030, 0.34, 7), darkMat));
    shin.position.y = -0.17;
    lower.add(shin);
    const hoof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.09), std(0x1a1008)));
    hoof.position.y = -0.36;
    lower.add(hoof);
    lower.position.y = -0.35;
    leg.add(lower);
    leg.position.set(x, 0.74, z);
    group.add(leg);
    legs.push({ leg, lower, pairPhase });
  }

  // ── Pose state ────────────────────────────────────────────────────────────
  let poseMode  = 'alert'; // 'graze' | 'alert' | 'flee'
  let gaitDist  = 0;

  // neck.rotation.z: 0 = horizontal (graze), -0.6 = upright (alert/flee)
  const NECK_GRAZE = 0.55;   // tilted down toward ground
  const NECK_ALERT = -0.55;  // raised
  const STRIDE_WALK = 1.2;   // world-units per full gait cycle (walk / alert)
  const STRIDE_FLEE = 0.7;   // faster bounding gait
  const MAX_SWING_WALK = 0.35;
  const MAX_SWING_FLEE = 0.55;
  const TAIL_FLEE_Y   = 1.1; // raised tail angle when fleeing

  function applyPose(dist) {
    const flee   = poseMode === 'flee';
    const graze  = poseMode === 'graze';
    const stride = flee ? STRIDE_FLEE : STRIDE_WALK;
    const swing  = flee ? MAX_SWING_FLEE : MAX_SWING_WALK;
    const cycle  = (dist / stride) * Math.PI * 2;

    // Leg gait — diagonal pairs
    for (const { leg, lower, pairPhase } of legs) {
      const s = Math.sin(cycle + pairPhase) * swing;
      leg.rotation.z = s;
      lower.rotation.z = Math.max(0, -s) * 0.85;
    }

    // Neck angle blends toward target pose
    const targetNeck = graze ? NECK_GRAZE : NECK_ALERT;
    neck.rotation.z += (targetNeck - neck.rotation.z) * 0.12;

    // Body bob
    body.position.y = 0.82 + Math.abs(Math.sin(cycle)) * (flee ? 0.06 : 0.018);

    // Tail raises when fleeing
    const targetTailY = flee ? TAIL_FLEE_Y : 0.88;
    tail.position.y += (targetTailY - tail.position.y) * 0.12;
  }

  return {
    group,
    update(dt, speed) { gaitDist += speed * dt; applyPose(gaitDist); },
    setPhase(d)       { gaitDist = d; applyPose(d); },
    setPose(mode)     { poseMode = mode; },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createBison
// ─────────────────────────────────────────────────────────────────────────────
export function createBison({ tint = 0 } = {}) {
  const group = new THREE.Group();

  const frontMat = std(new THREE.Color(B.front).offsetHSL(0, 0, tint * 0.04), { roughness: 0.95 });
  const rearMat  = std(new THREE.Color(B.rear ).offsetHSL(0, 0, tint * 0.04), { roughness: 0.95 });
  const hornMat  = std(B.horn, { roughness: 0.6 });

  // Hindquarters: smaller ellipsoid rear
  const rear = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.52, 5, 10), rearMat));
  rear.rotation.z = Math.PI / 2;
  rear.position.set(-0.18, 1.02, 0);
  group.add(rear);

  // Heavy front body + iconic shoulder hump
  const front = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.50, 0.56, 5, 10), frontMat));
  front.rotation.z = Math.PI / 2;
  front.position.set(0.32, 1.12, 0);
  group.add(front);

  // Hump: the defining bison silhouette cue
  const hump = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), frontMat));
  hump.scale.set(0.76, 1.0, 0.82);
  hump.position.set(0.28, 1.56, 0);
  group.add(hump);

  // Short heavy neck
  const neck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.30, 0.28), frontMat));
  neck.position.set(0.72, 1.18, 0);
  neck.rotation.z = 0.22; // slight downward thrust — low bison posture
  group.add(neck);

  // Boxy low head (bison carries head low and forward)
  const headG = new THREE.Group();
  const skull = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.34), frontMat));
  headG.add(skull);
  // Shaggy brow shelf: thicker box overhanging the face
  const brow = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.38), frontMat));
  brow.position.set(0.22, 0.14, 0);
  headG.add(brow);
  const muzzle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.28), rearMat));
  muzzle.position.set(0.28, -0.06, 0);
  headG.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), std(B.nose));
  nose.position.set(0.42, -0.04, 0);
  headG.add(nose);
  // Horns: short curved — two angled cones
  for (const s of [-1, 1]) {
    const horn = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 8), hornMat));
    horn.position.set(0.08, 0.22, s * 0.22);
    horn.rotation.z = s * -1.3;
    horn.rotation.x = s * 0.3;
    headG.add(horn);
  }
  headG.position.set(0.96, 0.98, 0);
  headG.rotation.z = 0.28; // face tilted down
  group.add(headG);

  // Beard tuft: rough box under chin
  const beard = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.16), frontMat));
  beard.position.set(1.14, 0.64, 0);
  group.add(beard);

  // Tail: short, hangs low
  const tail = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.50, 6), rearMat));
  tail.position.set(-0.80, 0.96, 0);
  tail.rotation.z = 0.4;
  group.add(tail);

  // Legs: short and sturdy — 4 legs, diagonal-pair gait, slower than deer
  const legs = [];
  for (const [x, z, pairPhase] of [
    [ 0.40,  0.24, 0],
    [-0.44, -0.24, 0],
    [ 0.40, -0.24, Math.PI],
    [-0.44,  0.24, Math.PI],
  ]) {
    const leg = new THREE.Group();
    const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.40, 8), rearMat));
    upper.position.y = -0.20;
    leg.add(upper);
    const lower = new THREE.Group();
    const shin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.36, 8), frontMat));
    shin.position.y = -0.18;
    lower.add(shin);
    const hoof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.16), std(B.hoof)));
    hoof.position.y = -0.38;
    lower.add(hoof);
    lower.position.y = -0.38;
    leg.add(lower);
    leg.position.set(x, 0.90, z);
    group.add(leg);
    legs.push({ leg, lower, pairPhase });
  }

  const STRIDE = 1.8;       // long plodding cycle
  const MAX_SWING = 0.28;
  let gaitDist = 0;

  function applyPose(dist) {
    const cycle = (dist / STRIDE) * Math.PI * 2;
    for (const { leg, lower, pairPhase } of legs) {
      const s = Math.sin(cycle + pairPhase) * MAX_SWING;
      leg.rotation.z = s;
      lower.rotation.z = Math.max(0, -s) * 0.75;
    }
    front.position.y = 1.12 + Math.abs(Math.sin(cycle)) * 0.022;
    rear.position.y  = 1.02 + Math.abs(Math.sin(cycle + Math.PI)) * 0.016;
    // Subtle head sway side-to-side as the heavy front shifts
    headG.rotation.y = Math.sin(cycle) * 0.06;
  }

  return {
    group,
    update(dt, speed) { gaitDist += speed * dt; applyPose(gaitDist); },
    setPhase(d)       { gaitDist = d; applyPose(d); },
    // Bison don't have distinct poses — setPhase drives everything.
    // Accept the call so the integrator can treat both animals uniformly.
    setPose(_mode)    { /* no-op for bison */ },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
  };
}
