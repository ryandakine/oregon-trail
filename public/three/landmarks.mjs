// Procedural landmark scenes — fort, natural, settlement, destination,
// river_crossing.
//
// Motion model: the caravan is STATIONARY at world origin, the world scrolls
// past. The integrator places this group at the correct scroll offset; this
// module only builds LOCAL geometry around (0,0,0), with the trail running
// along the Z axis and the wagon approaching from +Z.
//
// Determinism: all jitter is driven by a seeded LCG derived from the `name`
// string. No Math.random() calls anywhere.

import * as THREE from 'three';

// ── PALETTE (matches public/lib/draw.mjs + models.mjs) ──────────────────────
const C = {
  wood:       0x5a3a1f,
  woodLight:  0x8b5a2d,
  woodDark:   0x372312,
  canvas:     0xf5e6c8,
  stone:      0x968e84,
  stoneLight: 0xbab2a8,
  stoneDark:  0x6b6460,
  dirtMid:    0x8b6033,
  ironDark:   0x2b2620,
  plankWall:  0x7a5530,
  roofShake:  0x4a3825,
  bark:       0x5c3d1e,
  flagRed:    0xc0392b,
  flagBlue:   0x2760a0,
  rope:       0xc8b870,
  clayLight:  0xc4a882,
};

// ── Minimal local helpers (not imported from models.mjs per constraints) ─────

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Seeded deterministic RNG ─────────────────────────────────────────────────
// LCG: next = (a * seed + c) % m, returns [0,1).

function nameHash(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h >>> 0;
}

function makeLcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// jitter(rng, center, half) — uniform in [center-half, center+half]
function jitter(rng, center, half) {
  return center + (rng() - 0.5) * 2 * half;
}

// ── Shared sub-builders ──────────────────────────────────────────────────────

/**
 * A vertical log cylinder (palisade post).
 * mat should be the bark/wood material.
 */
function makeLog(mat, radius, height, x, z) {
  const mesh = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, height, 7),
    mat,
  ));
  mesh.position.set(x, height / 2, z);
  return mesh;
}

/**
 * A fence/palisade wall of tightly packed vertical log posts running from
 * (x0,z0) to (x1,z1). Post radius ~0.14, height h.
 */
function makePalisadeWall(group, mat, x0, z0, x1, z1, h = 4.2) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  const spacing = 0.32; // tight pack
  const count = Math.max(2, Math.floor(len / spacing));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = x0 + dx * t;
    const z = z0 + dz * t;
    const log = makeLog(mat, 0.14, h, x, z);
    group.add(log);
  }
}

/**
 * Gate: two stout pillars + a lintel beam. Centered at (cx, 0, cz), opening
 * along Z. Pillar half-gap = halfGap.
 */
function makeGate(group, mat, cx, cz, halfGap = 1.6, pillarH = 5.0) {
  const pillarR = 0.3;
  for (const side of [-1, 1]) {
    const px = cx + side * halfGap;
    const pillar = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(pillarR, pillarR * 1.1, pillarH, 8),
      mat,
    ));
    pillar.position.set(px, pillarH / 2, cz);
    group.add(pillar);
    // pointed top cap
    const cap = shadowed(new THREE.Mesh(
      new THREE.ConeGeometry(pillarR, pillarR * 2.5, 8),
      mat,
    ));
    cap.position.set(px, pillarH + pillarR * 1.25, cz);
    group.add(cap);
  }
  // lintel
  const lintelW = halfGap * 2 + 0.5;
  const lintel = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(lintelW, 0.28, 0.32),
    mat,
  ));
  lintel.position.set(cx, pillarH + 0.14, cz);
  group.add(lintel);
}

/**
 * Simple pitched-roof building shell: box body + prism roof.
 * cx/cz = center on the ground plane, w/d/h = dimensions, roofH = ridge height.
 */
function makeBuilding(group, wallMat, roofMat, cx, cz, w, d, h, roofH = 1.4) {
  // walls
  const body = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    wallMat,
  ));
  body.position.set(cx, h / 2, cz);
  group.add(body);
  // roof: a prism is a CylinderGeometry with 4 sides, radiusTop=0
  const roofW = w + 0.3;
  const roof = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0, roofW * 0.62, roofH, 4, 1),
    roofMat,
  ));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(cx, h + roofH / 2, cz);
  group.add(roof);
}

/**
 * A barrel: short cylinder, good for clutter.
 */
function makeBarrel(group, mat, x, y, z) {
  const barrel = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.55, 10),
    mat,
  ));
  barrel.position.set(x, y + 0.275, z);
  group.add(barrel);
}

/**
 * A wooden crate.
 */
function makeCrate(group, mat, x, y, z, s = 0.45) {
  const crate = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    mat,
  ));
  crate.position.set(x, y + s / 2, z);
  group.add(crate);
}

/**
 * Flagpole: thin cylinder + a tiny flag quad (flat, DoubleSide).
 */
function makeFlagpole(group, woodMat, flagMat, cx, cz, h = 7.5) {
  const pole = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, h, 6),
    woodMat,
  ));
  pole.position.set(cx, h / 2, cz);
  group.add(pole);
  // flag: a flat quad pinned to the top of the pole
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.65),
    new THREE.MeshStandardMaterial({ color: flagMat, roughness: 0.9, side: THREE.DoubleSide }),
  );
  flag.position.set(cx + 0.55, h - 0.1, cz);
  group.add(flag);
}

/**
 * A rock slab: scaled squashed sphere, for mounds / formations.
 * color, scale, position from caller.
 */
function makeRockSlab(group, mat, cx, cy, cz, sx, sy, sz, rotY = 0) {
  const rock = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    mat,
  ));
  rock.scale.set(sx, sy, sz);
  rock.rotation.y = rotY;
  rock.position.set(cx, cy, cz);
  group.add(rock);
}

/**
 * Fence line: simple horizontal boards between posts, running X direction.
 * From x0 to x1 at a given z, with nRails rail boards.
 */
function makeFenceLine(group, mat, x0, x1, z, postH = 1.6, nRails = 2) {
  const len = x1 - x0;
  const nPosts = Math.max(2, Math.round(Math.abs(len) / 2.4) + 1);
  const postMat = mat;
  for (let i = 0; i < nPosts; i++) {
    const t = i / (nPosts - 1);
    const px = x0 + len * t;
    const post = shadowed(new THREE.Mesh(
      new THREE.BoxGeometry(0.1, postH, 0.1),
      postMat,
    ));
    post.position.set(px, postH / 2, z);
    group.add(post);
  }
  // horizontal rails
  for (let r = 0; r < nRails; r++) {
    const ry = postH * (0.35 + r * 0.35);
    const rail = shadowed(new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(len), 0.07, 0.07),
      mat,
    ));
    rail.position.set((x0 + x1) / 2, ry, z);
    group.add(rail);
  }
}

/**
 * A signpost: vertical post + a horizontal plank board.
 */
function makeSignpost(group, woodMat, cx, cz, rot = 0) {
  const post = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 2.0, 0.12),
    woodMat,
  ));
  post.position.set(cx, 1.0, cz);
  group.add(post);
  const sign = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.45, 0.08),
    woodMat,
  ));
  sign.position.set(cx, 1.95, cz);
  sign.rotation.y = rot;
  group.add(sign);
}

/**
 * Simple well: cylinder base + crossbeam + bucket stub.
 */
function makeWell(group, stoneMat, woodMat, cx, cz) {
  const base = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.6, 0.8, 10),
    stoneMat,
  ));
  base.position.set(cx, 0.4, cz);
  group.add(base);
  // two vertical posts
  for (const s of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.0, 0.1),
      woodMat,
    ));
    post.position.set(cx + s * 0.5, 1.1, cz);
    group.add(post);
  }
  // crossbar
  const bar = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
    woodMat,
  ));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(cx, 1.55, cz);
  group.add(bar);
}

// ── Variant builders ─────────────────────────────────────────────────────────

/**
 * "fort" — timber stockade with palisade walls, gate, buildings, flagpole,
 * and barrel/crate clutter near the gate.
 */
function buildFort(group, rng, textures) {
  const barkTex = textures.barkMaps?.();
  const plankTex = textures.plankMaps?.();

  const barkMat = barkTex
    ? new THREE.MeshStandardMaterial({ map: barkTex.map, normalMap: barkTex.normalMap ?? null, roughness: 0.9 })
    : std(C.bark);
  const plankMat = plankTex
    ? new THREE.MeshStandardMaterial({ map: plankTex.map, normalMap: plankTex.normalMap ?? null, roughness: 0.85 })
    : std(C.plankWall);
  const roofMat = std(C.roofShake, { roughness: 0.95 });
  const stoneMat = std(C.stone, { roughness: 0.9 });

  // Stockade footprint: ~22u wide, ~18u deep. Gate faces +Z (toward wagon).
  // Left and right walls run along Z, back wall runs along X.
  const hw = 11; // half-width in X
  const depth = 18; // depth in Z, gate end at z=0

  // Side walls (two, at x = -hw and x = +hw, running from z=0 to z=-depth)
  makePalisadeWall(group, barkMat, -hw, 0, -hw, -depth, 4.2);
  makePalisadeWall(group, barkMat,  hw, 0,  hw, -depth, 4.2);
  // Back wall (x: -hw to +hw at z = -depth)
  makePalisadeWall(group, barkMat, -hw, -depth, hw, -depth, 4.2);
  // Front wall sections flanking the gate (gap ~3.5 each side)
  makePalisadeWall(group, barkMat, -hw, 0, -3.2, 0, 4.2);
  makePalisadeWall(group, barkMat,  hw, 0,  3.2, 0, 4.2);

  // Gate centered at z=0
  makeGate(group, barkMat, 0, 0, 1.8, 5.0);

  // Two interior buildings
  const b1cx = jitter(rng, -4.5, 1.0);
  const b1cz = jitter(rng, -9.0, 1.5);
  makeBuilding(group, plankMat, roofMat, b1cx, b1cz, 6.5, 4.5, 3.2, 1.6);

  const b2cx = jitter(rng, 4.5, 0.8);
  const b2cz = jitter(rng, -10.5, 1.5);
  makeBuilding(group, stoneMat, roofMat, b2cx, b2cz, 4.5, 3.5, 2.8, 1.4);

  // Flagpole inside, toward back
  const flagColor = rng() > 0.5 ? C.flagRed : C.flagBlue;
  makeFlagpole(group, plankMat, flagColor, jitter(rng, 0, 1.5), jitter(rng, -13, 1.5), 7.5);

  // Clutter near the gate
  const woodMat2 = std(C.woodLight, { roughness: 0.88 });
  makeBarrel(group, woodMat2, -2.8, 0, 1.2);
  makeBarrel(group, woodMat2, -3.5, 0, 0.8);
  makeCrate(group, woodMat2, 2.5, 0, 1.0);
  makeCrate(group, woodMat2, 3.1, 0, 0.5);
  makeCrate(group, woodMat2, 3.6, 0, 1.2, 0.38);
}

/**
 * "natural" — rock formation. Varies by name hash:
 *   - spire-heavy names (Chimney Rock): broad base + narrow tall spire
 *   - bluff-heavy names (Scotts Bluff, Independence Rock): wide mesa / dome
 *   - default: mid spire + mound base
 *
 * Silhouette is built from overlapping squashed spheres (mound) + cone/stacked
 * cylinders (spire).
 */
function buildNatural(group, rng, name, textures) {
  const rockTex = textures.rockMaps?.();
  const rockMat = rockTex
    ? new THREE.MeshStandardMaterial({ map: rockTex.map, normalMap: rockTex.normalMap ?? null, roughness: 0.9 })
    : std(C.stone, { roughness: 0.9 });
  const dirtMat = std(C.dirtMid, { roughness: 0.95 });

  const lowerName = name.toLowerCase();
  const isChimney  = lowerName.includes('chimney');
  const isMesa     = lowerName.includes('bluff') || lowerName.includes('pass') || lowerName.includes('south');
  const isRock     = lowerName.includes('rock') && !isChimney;

  // ── base mound: 4-7 overlapping squashed slabs ──
  const nBase = 4 + Math.floor(rng() * 3);
  const baseR = isMesa ? 9.0 : isChimney ? 6.0 : 7.0;
  for (let i = 0; i < nBase; i++) {
    const angle = (i / nBase) * Math.PI * 2 + rng() * 0.5;
    const r = baseR * (0.55 + rng() * 0.4);
    const cx = Math.cos(angle) * r * 0.45;
    const cz = Math.sin(angle) * r * 0.45;
    const sx = baseR * (0.5 + rng() * 0.4);
    const sy = isMesa ? 1.8 + rng() * 0.8 : 1.2 + rng() * 0.7;
    const sz = baseR * (0.4 + rng() * 0.4);
    const mat = i % 2 === 0 ? rockMat : dirtMat;
    makeRockSlab(group, mat, cx, sy, cz, sx, sy, sz, rng() * Math.PI);
  }

  if (isMesa) {
    // Wide flat-topped cap
    const capMesh = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(baseR * 0.7, baseR * 0.85, 1.6, 8),
      rockMat,
    ));
    capMesh.position.set(0, 3.8, 0);
    group.add(capMesh);
    // Optional small secondary formation to the side
    const sx2 = baseR * 0.45;
    const capB = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(sx2 * 0.6, sx2 * 0.8, 1.2, 7),
      rockMat,
    ));
    capB.position.set(jitter(rng, -5, 2), 2.6, jitter(rng, 3, 2));
    group.add(capB);
    return;
  }

  if (isRock) {
    // Low dome — Independence Rock: wide, rounded, low
    const dome = shadowed(new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 7),
      rockMat,
    ));
    dome.scale.set(baseR * 0.75, 3.8, baseR * 0.7);
    dome.position.set(0, 3.0, 0);
    group.add(dome);
    return;
  }

  // ── Chimney / default: narrow spire above the mound ──
  const spireH = isChimney ? 14 + rng() * 3 : 8 + rng() * 4;
  const spireBaseR = isChimney ? 0.9 : 1.4 + rng() * 0.6;
  const spireTopR  = isChimney ? 0.55 : 0.3 + rng() * 0.4;

  // Lower drum
  const drum = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(spireBaseR * 1.3, spireBaseR * 1.6, spireH * 0.35, 9),
    rockMat,
  ));
  drum.position.set(0, spireH * 0.175 + 1.5, 0);
  group.add(drum);
  // Upper shaft
  const shaft = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(spireTopR, spireBaseR * 1.1, spireH * 0.7, 8),
    rockMat,
  ));
  shaft.position.set(0, spireH * 0.35 + spireH * 0.35 + 1.5, 0);
  group.add(shaft);
  // Cap
  const cap = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(spireTopR * 0.7, spireTopR * 1.1, 0.8, 7),
    std(C.stoneDark, { roughness: 0.95 }),
  ));
  cap.position.set(0, spireH + 1.8, 0);
  group.add(cap);
}

/**
 * "settlement" — 2-3 log cabins with pitched roofs, fence line, well or
 * signpost. Modest, honest frontier scale.
 */
function buildSettlement(group, rng, textures) {
  const plankTex = textures.plankMaps?.();
  const wallMat = plankTex
    ? new THREE.MeshStandardMaterial({ map: plankTex.map, normalMap: plankTex.normalMap ?? null, roughness: 0.88 })
    : std(C.plankWall);
  const roofMat = std(C.roofShake, { roughness: 0.95 });
  const woodMat = std(C.woodLight, { roughness: 0.88 });
  const stoneMat = std(C.stone, { roughness: 0.9 });

  const nBuildings = rng() > 0.4 ? 3 : 2;
  const layouts = [
    { cx: -5.5, cz: -5.0, w: 5.5, d: 3.5, h: 2.8, rh: 1.2 },
    { cx:  4.5, cz: -6.5, w: 4.5, d: 3.0, h: 2.6, rh: 1.1 },
    { cx: -2.0, cz: -11.0, w: 4.0, d: 3.0, h: 2.4, rh: 1.0 },
  ];
  for (let i = 0; i < nBuildings; i++) {
    const l = layouts[i];
    makeBuilding(group, wallMat, roofMat,
      jitter(rng, l.cx, 0.5), jitter(rng, l.cz, 0.5),
      l.w, l.d, l.h, l.rh);
  }

  // Fence lines flanking the trail approach
  makeFenceLine(group, woodMat, -8, -1.8, 1.0);
  makeFenceLine(group, woodMat,  1.8,  8, 1.0);

  // Well or signpost at near center
  if (rng() > 0.45) {
    makeWell(group, stoneMat, woodMat, jitter(rng, 0, 1.5), jitter(rng, -3, 1.0));
  } else {
    makeSignpost(group, woodMat, jitter(rng, 1.5, 0.8), jitter(rng, -2.5, 0.8));
  }

  // Barrel or two
  makeBarrel(group, woodMat, jitter(rng, -1.5, 0.5), 0, jitter(rng, 1.5, 0.5));
}

/**
 * "destination" — Oregon City: grander than a settlement, welcoming vista.
 * 3-4 buildings, fences on both sides, a prominent signpost.
 */
function buildDestination(group, rng, textures) {
  const plankTex = textures.plankMaps?.();
  const stoneTex = textures.stoneMaps?.() ?? textures.plasterMaps?.();
  const wallMat = plankTex
    ? new THREE.MeshStandardMaterial({ map: plankTex.map, normalMap: plankTex.normalMap ?? null, roughness: 0.86 })
    : std(C.plankWall);
  const stoneWallMat = stoneTex
    ? new THREE.MeshStandardMaterial({ map: stoneTex.map, normalMap: stoneTex.normalMap ?? null, roughness: 0.88 })
    : std(C.stoneLight, { roughness: 0.88 });
  const roofMat = std(C.roofShake, { roughness: 0.9 });
  const woodMat = std(C.woodLight, { roughness: 0.88 });
  const stoneMat = std(C.stone, { roughness: 0.9 });

  // 4 buildings: one larger central, two flanking, one set back
  makeBuilding(group, stoneWallMat, roofMat,  0.0, -8.0, 8.5, 5.5, 4.2, 2.0);
  makeBuilding(group, wallMat,      roofMat, -7.5, -5.5, 5.5, 3.8, 3.4, 1.5);
  makeBuilding(group, wallMat,      roofMat,  7.5, -6.5, 5.0, 3.5, 3.2, 1.4);
  makeBuilding(group, stoneWallMat, roofMat,  2.0,-14.5, 6.0, 4.5, 3.8, 1.8);

  // Extended fences
  makeFenceLine(group, woodMat, -12, -2.2, 1.2, 1.7);
  makeFenceLine(group, woodMat,   2.2, 12, 1.2, 1.7);
  makeFenceLine(group, woodMat, -11, -2.2, 3.5, 1.5);
  makeFenceLine(group, woodMat,   2.2, 11, 3.5, 1.5);

  // Prominent signpost dead center of the trail
  makeSignpost(group, woodMat, 0, 2.8, 0);
  // A second post slightly off-axis adds some life
  makeSignpost(group, woodMat, 1.8, 2.0, 0.18);

  // Well + barrel clutter
  makeWell(group, stoneMat, woodMat, -3.5, -2.5);
  makeBarrel(group, woodMat,  2.8, 0, 2.0);
  makeBarrel(group, woodMat,  3.5, 0, 1.4);
  makeCrate(group, woodMat,  -2.5, 0, 1.8);

  // Small flagpole on the main building
  makeFlagpole(group, woodMat, C.flagRed, 0, -8.0, 6.5);
}

/**
 * "river_crossing" — minimal bank dressing: a couple of rope-posts on the near
 * bank and a stub ferry frame. Water owned by water.mjs.
 */
function buildRiverCrossing(group, rng, textures) {
  const woodMat = std(C.woodLight, { roughness: 0.88 });
  const ropeMat = std(C.rope, { roughness: 0.9 });

  // Two mooring posts at the bank edge (z ≈ 0 = near bank)
  for (const sx of [-2.0, 2.0]) {
    const post = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 1.8, 7),
      woodMat,
    ));
    post.position.set(sx + jitter(rng, 0, 0.15), 0.9, 0.6 + jitter(rng, 0, 0.2));
    group.add(post);
    // Rope coil at the base (torus, horizontal)
    const coil = shadowed(new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.045, 5, 12),
      ropeMat,
    ));
    coil.rotation.x = Math.PI / 2;
    coil.position.set(sx + jitter(rng, 0, 0.15), 0.05, 0.6 + jitter(rng, 0, 0.2));
    group.add(coil);
  }

  // Rope strung between the posts (thin cylinder)
  const ropeBeam = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 4.5, 5),
    ropeMat,
  ));
  ropeBeam.rotation.z = Math.PI / 2;
  ropeBeam.position.set(0, 1.55, 0.6);
  group.add(ropeBeam);

  // Ferry stub: a couple of planks forming a flat raft edge on the near bank
  const raftMat = std(C.wood, { roughness: 0.92 });
  const raft = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 0.18, 1.6),
    raftMat,
  ));
  raft.position.set(0, 0.05, -1.0);
  group.add(raft);
  // Cross-plank
  const cp = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.22, 1.65),
    std(C.woodDark, { roughness: 0.92 }),
  ));
  for (const sx of [-1.8, 0, 1.8]) {
    const c = cp.clone();
    c.castShadow = true; c.receiveShadow = true;
    c.position.set(sx, 0.11, -1.0);
    group.add(c);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * createLandmark({ type, name, textures })
 *
 * Returns { group, dispose() }.
 *
 * group   — THREE.Group centered at local (0,0,0), trail along Z axis,
 *           wagon approaches from +Z. Place and scroll via the integrator.
 * dispose — frees all geometries and materials owned by this group.
 */
export function createLandmark({ type = 'fort', name = '', textures = {} } = {}) {
  const group = new THREE.Group();
  const rng = makeLcg(nameHash(name || type));

  switch (type) {
    case 'fort':
      buildFort(group, rng, textures);
      break;
    case 'natural':
      buildNatural(group, rng, name, textures);
      break;
    case 'settlement':
      buildSettlement(group, rng, textures);
      break;
    case 'destination':
      buildDestination(group, rng, textures);
      break;
    case 'river_crossing':
      buildRiverCrossing(group, rng, textures);
      break;
    default:
      buildFort(group, rng, textures);
      break;
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m?.dispose?.());
        } else {
          obj.material?.dispose?.();
        }
      }
    });
  }

  return { group, dispose };
}
