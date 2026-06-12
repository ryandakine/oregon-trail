// Procedural hero models: covered wagon, oxen, pioneers (M1).
//
// Translates the 2D vocabulary of public/lib/draw.mjs (drawWagon/drawOx/
// drawPioneer) into lit, shadowed 3D. Per THREEJS_REBUILD_PLAN DEC-A these are
// the procedural baseline; the wagon/oxen may later be swapped for CC0 glb hero
// models behind the same { group, update } contract without touching callers.
//
// Animation model (§3.1): everything animates IN PLACE — wheel spin and gait
// phase advance from distance traveled (speed * dt), never from wall-clock, so
// freezeAt-style determinism holds: pose(phase) is a pure function.

import * as THREE from 'three';

// PALETTE anchors from public/lib/draw.mjs, as hex.
const C = {
  wood: 0x5a3a1f, woodLight: 0x8b5a2d, woodDark: 0x372312,
  canvas: 0xf5e6c8, iron: 0x2b2620, rut: 0x583821,
  oxBrown: 0x78552d, oxCream: 0xdcc39b, oxDark: 0x503719,
  skin: 0xebc8a0, shirt: 0xf0e6d2, vest: 0x46321e, trousers: 0x644628,
  hatFelt: 0x412d1e, bonnet: 0xf0e6c8, dressBlue: 0x506eaa,
  lanternGlow: 0xffaa22,
};

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

// Fresnel rim light (§5a #5): view-angle emissive rim so hero silhouettes pop
// off the terrain. Patches the emissive chunk — works on Standard + Lambert.
function addRim(mat, color = [0.5, 0.6, 0.8], strength = 0.12) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(${color[0]}, ${color[1]}, ${color[2]}) * ${strength.toFixed(3)} *
        pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`,
    );
  };
  return mat;
}

// Baked contact shadow (§5a #2): a soft dark radial decal under each
// ground-contact object — the cheap AO stand-in that grounds wagon wheels and
// hooves without SSAO (which is off the no-pmndrs build).
let _contactTex = null;
function contactShadowTexture() {
  if (_contactTex) return _contactTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _contactTex = new THREE.CanvasTexture(c);
  return _contactTex;
}

export function createContactShadow(width, length, peak = 0.42) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshBasicMaterial({
      color: 0x141008, // warm near-black, not pure black
      transparent: true,
      opacity: peak,
      alphaMap: contactShadowTexture(),
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1; // above terrain
  return mesh;
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Spoked wheel: rim torus + hub + spokes, ironwork dark, wood spokes ──
function makeWheel(radius) {
  const g = new THREE.Group();
  const rim = shadowed(new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.09, 8, 24), std(C.rut, { roughness: 0.7 }),
  ));
  g.add(rim);
  const hub = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, radius * 0.22, 10), std(C.woodDark),
  ));
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  const spokeMat = std(C.woodLight);
  for (let i = 0; i < 10; i++) {
    const spoke = shadowed(new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.07, radius * 0.92, radius * 0.05), spokeMat,
    ));
    spoke.rotation.z = (i / 10) * Math.PI * 2;
    spoke.position.set(
      Math.sin(spoke.rotation.z) * radius * 0.46 * -1,
      Math.cos(spoke.rotation.z) * radius * 0.46,
      0,
    );
    g.add(spoke);
  }
  return g;
}

// ── Covered wagon ──
// Layout along +X (direction of travel is -Z visually, but the wagon group is
// yawed by the integrator); here: bed long axis = X, wheels at ±X, tongue at -X.
export function createWagon({ textures } = {}) {
  const group = new THREE.Group();
  const plank = textures ? textures.plankMaps() : null;
  const cloth = textures ? textures.canvasClothMaps() : null;

  const woodMat = plank
    ? new THREE.MeshStandardMaterial({ map: plank.map, normalMap: plank.normalMap, roughness: 0.85 })
    : std(C.wood);
  const clothMat = cloth
    ? new THREE.MeshStandardMaterial({ map: cloth.map, normalMap: cloth.normalMap, roughness: 0.78 })
    : std(C.canvas);
  addRim(clothMat, [0.55, 0.6, 0.75], 0.10); // soft sky rim sells the bonnet's curve

  // Bed box + side boards rising slightly outward
  const bed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.7), woodMat));
  bed.position.y = 1.35;
  group.add(bed);
  const boardMat = std(C.woodDark);
  for (const s of [-1, 1]) {
    const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 0.08), boardMat));
    rail.position.set(0, 1.84, s * 0.88);
    group.add(rail);
  }

  // Canvas bonnet: open half-cylinder, slightly flared at both ends (classic
  // prairie-schooner silhouette), seams from the cloth texture's stitch lines.
  const bonnet = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.02, 3.3, 22, 4, true, 0, Math.PI), clothMat,
  ));
  bonnet.rotation.z = Math.PI / 2;
  bonnet.scale.set(1, 1, 1.12); // gentle bulge
  bonnet.position.y = 1.95;
  bonnet.material.side = THREE.DoubleSide;
  group.add(bonnet);
  // Dark interior discs at the openings so you don't see through the wagon.
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x14100a });
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.92, 18, 0, Math.PI), holeMat);
    cap.position.set(s * 1.64, 1.95, 0);
    cap.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(cap);
  }

  // Undercarriage: two axles + reach beam
  const axleMat = std(C.woodDark);
  for (const x of [-1.25, 1.25]) {
    const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 8), axleMat));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(x, 0.62, 0);
    group.add(axle);
  }
  const reach = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.12), axleMat));
  reach.position.y = 0.62;
  group.add(reach);

  // Tongue: angled beam forward (-X) toward the team, with a yoke crossbar.
  const tongue = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.11), std(C.woodLight)));
  tongue.position.set(-2.6, 0.75, 0);
  tongue.rotation.z = -0.1;
  group.add(tongue);
  const yoke = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.7), std(C.woodDark)));
  yoke.position.set(-3.55, 0.92, 0);
  group.add(yoke);

  // Side barrel + rear lantern (emissive — bloom supplies the glow).
  const barrel = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.55, 12),
    textures
      ? new THREE.MeshStandardMaterial({ map: textures.plankMaps().map, roughness: 0.9 })
      : std(C.woodLight),
  ));
  barrel.position.set(0.7, 1.45, 0.98);
  group.add(barrel);
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffcc55, emissive: C.lanternGlow, emissiveIntensity: 3.2 }),
  );
  lantern.position.set(1.78, 1.7, 0.6);
  group.add(lantern);

  // Wheels: rear pair large (r=.72) front pair small (r=.55), period-correct.
  const wheels = [];
  for (const [x, z, r] of [[1.25, 1.02, 0.72], [1.25, -1.02, 0.72], [-1.25, 1.02, 0.55], [-1.25, -1.02, 0.55]]) {
    const w = makeWheel(r);
    w.position.set(x, r, z);
    group.add(w);
    wheels.push({ node: w, r });
  }

  let rollPhase = 0;
  function pose(phase) {
    for (const { node, r } of wheels) node.rotation.z = -phase / r;
    // Body rock: small, derived from wheel phase so it freezes deterministically.
    const rock = Math.sin(phase * 1.7) * 0.008 + Math.sin(phase * 0.9) * 0.006;
    bed.rotation.x = rock;
    bonnet.rotation.x = rock * 1.4;
    bonnet.position.y = 1.95 + Math.sin(phase * 1.3) * 0.012;
  }

  return {
    group,
    lantern,
    // speed in world-units/sec; phase advances by distance so wheels never slide.
    update(dt, speed) { rollPhase += speed * dt; pose(rollPhase); },
    setPhase(p) { rollPhase = p; pose(p); },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}

// ── Yoked ox team: two oxen + yoke beam + pole back to the wagon tongue ──
// Forward = -Z (the caravan's travel direction); the caller just positions the
// group ahead of the wagon. Yoked oxen walk nearly in step (slight desync).
export function createOxTeam() {
  const group = new THREE.Group();
  const oxen = [createOx({ tint: 0 }), createOx({ tint: 1 })];
  oxen[0].group.position.x = -0.62;
  oxen[1].group.position.x = 0.62;
  for (const ox of oxen) {
    ox.group.rotation.y = Math.PI / 2; // ox model forward (+X, head) → -Z
    group.add(ox.group);
  }
  // Yoke beam across both necks, just behind the heads, with two bow loops.
  const yokeMat = std(C.woodDark);
  const yoke = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.13, 0.16), yokeMat));
  yoke.position.set(0, 1.28, -0.42);
  group.add(yoke);
  for (const s of [-1, 1]) {
    const bow = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 12, Math.PI), std(C.woodLight)));
    bow.position.set(s * 0.62, 1.26, -0.42);
    bow.rotation.x = Math.PI; // open side up, loop under the neck
    group.add(bow);
  }
  // Pole from the yoke ring back toward the wagon tongue.
  const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.4, 8), std(C.woodLight)));
  pole.rotation.x = Math.PI / 2;
  pole.position.set(0, 1.05, 0.85);
  pole.rotation.z = 0;
  pole.rotation.x = Math.PI / 2 + 0.12; // slight downward slope toward the tongue
  group.add(pole);

  return {
    group,
    update(dt, speed) { oxen[0].update(dt, speed); oxen[1].update(dt, speed); },
    setPhase(d) { oxen[0].setPhase(d); oxen[1].setPhase(d + 0.25); },
    dispose() { oxen.forEach((o) => o.dispose()); group.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}

// ── Ox: capsule body, boxy head with horns, 4 legs with diagonal-pair gait ──
export function createOx({ tint = 0 } = {}) {
  const group = new THREE.Group();
  const bodyColor = new THREE.Color(C.oxBrown).offsetHSL(0, 0, tint * 0.04);
  const bodyMat = addRim(std(bodyColor, { roughness: 0.92 }), [0.5, 0.6, 0.8], 0.14);
  const darkMat = std(C.oxDark, { roughness: 0.92 });
  const creamMat = addRim(std(C.oxCream, { roughness: 0.92 }), [0.5, 0.6, 0.8], 0.12);

  const body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.92, 6, 12), bodyMat));
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.95;
  group.add(body);
  // Shoulder hump — the silhouette cue that says draft ox, not generic cow.
  const hump = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), bodyMat));
  hump.scale.set(1.0, 0.85, 0.92);
  hump.position.set(0.38, 1.22, 0);
  group.add(hump);
  // Cream belly patch
  const belly = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.78, 5, 10), creamMat));
  belly.rotation.z = Math.PI / 2;
  belly.position.y = 0.76;
  group.add(belly);

  // Neck bridging shoulder to head — heads floating off bodies read broken.
  const neck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.26), bodyMat));
  neck.position.set(0.68, 1.05, 0);
  neck.rotation.z = -0.35;
  group.add(neck);

  // Head: box + muzzle + horns, lowered and tilted down — pulling posture.
  const head = new THREE.Group();
  const skull = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.28), bodyMat));
  head.add(skull);
  const muzzle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.22), creamMat));
  muzzle.position.set(0.24, -0.07, 0);
  head.add(muzzle);
  const hornMat = std(0xd8cfb8, { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const horn = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 8), hornMat));
    horn.position.set(-0.04, 0.2, s * 0.19);
    horn.rotation.z = s * -1.15;
    horn.rotation.x = s * -0.35;
    head.add(horn);
  }
  head.position.set(0.92, 0.98, 0);
  head.rotation.z = -0.3;
  group.add(head);

  // Tail
  const tail = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), darkMat));
  tail.position.set(-0.85, 0.85, 0);
  tail.rotation.z = 0.35;
  group.add(tail);

  // Legs: upper+lower segments with a hoof; diagonal pairs (FL+RR vs FR+RL).
  const legs = [];
  for (const [x, z, pairPhase] of [
    [0.45, 0.22, 0], [-0.5, -0.22, 0],          // FL + RR — in phase
    [0.45, -0.22, Math.PI], [-0.5, 0.22, Math.PI], // FR + RL — opposite
  ]) {
    const leg = new THREE.Group();
    const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.42, 8), bodyMat));
    upper.position.y = -0.21;
    leg.add(upper);
    const lower = new THREE.Group();
    const shin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.38, 8), darkMat));
    shin.position.y = -0.19;
    lower.add(shin);
    const hoof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.14), std(0x241a10)));
    hoof.position.y = -0.4;
    lower.add(hoof);
    lower.position.y = -0.4;
    leg.add(lower);
    leg.position.set(x, 0.85, z);
    group.add(leg);
    legs.push({ leg, lower, pairPhase });
  }

  const STRIDE = 1.35;        // world-units per full gait cycle — plodding ox
  const MAX_SWING = 0.38;
  let gaitDist = 0;
  function pose(dist) {
    const cycle = (dist / STRIDE) * Math.PI * 2;
    for (const { leg, lower, pairPhase } of legs) {
      const swing = Math.sin(cycle + pairPhase) * MAX_SWING;
      leg.rotation.z = swing;
      // Knee bends only on the back-swing (ground clearance), like a real gait.
      lower.rotation.z = Math.max(0, -swing) * 0.9;
    }
    head.position.y = 0.98 + Math.sin(cycle * 2) * 0.025; // head bob, 2x leg rate
    body.position.y = 0.95 + Math.abs(Math.sin(cycle)) * 0.02;
  }

  return {
    group,
    update(dt, speed) { gaitDist += speed * dt; pose(gaitDist); },
    setPhase(d) { gaitDist = d; pose(d); },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}

// ── Pioneer: simple biped walker with hat variants from draw.mjs ──
export function createPioneer({ hat = 'felt', dress = false } = {}) {
  const group = new THREE.Group();
  const shirtMat = addRim(std(C.shirt), [0.5, 0.6, 0.8], 0.12);
  const vestMat = addRim(std(dress ? C.dressBlue : C.vest), [0.5, 0.6, 0.8], 0.12);
  const legMat = std(dress ? C.dressBlue : C.trousers);
  const skinMat = std(C.skin, { roughness: 0.7 });

  const torso = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), vestMat));
  torso.position.y = 1.15;
  group.add(torso);
  const chest = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.22), shirtMat));
  chest.position.y = 1.34;
  group.add(chest);

  const headG = new THREE.Group();
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skinMat));
  headG.add(head);
  if (hat === 'felt') {
    const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 14), std(C.hatFelt)));
    brim.position.y = 0.08;
    headG.add(brim);
    const crown = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12), std(C.hatFelt)));
    crown.position.y = 0.16;
    headG.add(crown);
  } else if (hat === 'straw') {
    const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), std(0xdebe7a)));
    brim.position.y = 0.07;
    headG.add(brim);
    const crown = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xdebe7a)));
    crown.position.y = 0.07;
    headG.add(crown);
  } else { // bonnet
    const hood = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), std(C.bonnet)));
    hood.position.y = 0.04;
    hood.rotation.x = -0.4;
    headG.add(hood);
  }
  headG.position.y = 1.56;
  group.add(headG);

  const limbs = [];
  for (const [x, isArm] of [[-0.11, false], [0.11, false], [-0.22, true], [0.22, true]]) {
    const limb = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(isArm ? 0.045 : 0.06, isArm ? 0.04 : 0.05, isArm ? 0.42 : 0.55, 8),
      isArm ? shirtMat : legMat,
    ));
    limb.geometry.translate(0, isArm ? -0.21 : -0.275, 0); // pivot at shoulder/hip
    limb.position.set(x, isArm ? 1.38 : 0.9, 0);
    group.add(limb);
    // legs swing opposite arms on the same side
    limbs.push({ limb, phase: (x < 0 ? 0 : Math.PI) + (isArm ? Math.PI : 0) });
  }

  const STRIDE = 1.5;
  let gaitDist = 0;
  function pose(dist) {
    const cycle = (dist / STRIDE) * Math.PI * 2;
    for (const { limb, phase } of limbs) limb.rotation.x = Math.sin(cycle + phase) * 0.5;
    group.position.y = Math.abs(Math.sin(cycle)) * 0.03;
    torso.rotation.y = Math.sin(cycle) * 0.05;
  }

  return {
    group,
    update(dt, speed) { gaitDist += speed * dt; pose(gaitDist); },
    setPhase(d) { gaitDist = d; pose(d); },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
