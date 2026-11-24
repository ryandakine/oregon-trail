// Oregon Trail 3D — M1 terrain module
//
// Scrolling-band terrain: a ring of CHUNK_COUNT chunks along Z that recycles
// behind the camera.  The wagon sits at the world origin; the terrain scrolls
// past it along +Z (toward the camera) as scrollZ increases.
//
// Design notes:
// - Deterministic: all randomness uses seeded LCG / coordinate-hash.
//   Math.random() is NEVER called at module or render time.
// - Dispose-friendly: every GPU resource reference is returned from
//   createTerrain() or reachable through the returned group.
// - Palette harmonised with public/lib/draw.mjs PALETTE block.
// - Ports the analytic splat-terrain technique from
//   world-of-claudecraft/src/render/terrain.ts, adapted for the scrolling-band
//   motion model (§3.1 of THREEJS_REBUILD_PLAN.md).

import * as THREE from 'three';
import { toHex } from '../lib/palette.mjs';

// ---------------------------------------------------------------------------
// Seeded PRNG (LCG, identical to the mulberry32 variant used in draw.mjs)
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coordinate-hash seed — same formula as draw.mjs seedFrom(). */
function seedFrom(x, z) {
  return ((Math.round(x) * 31 + Math.round(z) * 131) | 0) >>> 0;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Terrain height — analytic noise field, deterministic from world coords.
// ---------------------------------------------------------------------------
// Technique: layered sine/cosine product noise (cheap analytic, no lookup
// tables, differentiable for analytic normals).
// The seed modulates phase so different trail seeds produce distinct terrain.

// River channel carve — module state consulted by terrainHeight so geometry,
// analytic normals, splat painting, and heightAt() all see the same banks.
// Set via the instance's setRiver(); null = no river.
//
// The channel mixes terrain toward a FIXED bed elevation (not a subtracted
// depth): a level water sheet needs a level bed under its whole length, and
// terrain height varies along X — a subtract-carve left half the sheet above
// ground, which the foam shader read as one giant shoreline.
let _riverCarve = null; // { absZ, halfWidth, bedY }

// 0..1 channel profile across the trail axis (1 = channel center).
// Plateau-bottomed: the profile saturates to 1 across the middle ~55% so the
// bed is genuinely FLAT and the deep-water strip is wide — a pure hermite
// peak left only a thin line at full depth, and from gameplay camera angles
// the visible water surface was all shallow foam shelf.
function riverCarveAt(absZ) {
  if (!_riverCarve) return 0;
  const dz = Math.abs(absZ - _riverCarve.absZ);
  if (dz >= _riverCarve.halfWidth) return 0;
  const t = Math.min(1, (1 - dz / _riverCarve.halfWidth) / 0.45);
  return t * t * (3 - 2 * t);
}

// Flatten pad — levels terrain toward a fixed Y inside a radius, so large
// structures (forts, settlements) sit on level ground instead of clipping
// through rolling hills. Same instance-state + immediate-rewrite pattern as
// the river carve. null = no pad.
let _flatPad = null; // { absZ, x, radius, y }

function flatPadWeight(x, absZ) {
  if (!_flatPad) return 0;
  const dx = x - _flatPad.x;
  const dz = absZ - _flatPad.absZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= _flatPad.radius) return 0;
  // Inner 70% fully flat (weight 1); outer 30% hermite-feathers back to natural.
  const edge = _flatPad.radius * 0.7;
  if (d <= edge) return 1;
  const t = 1 - (d - edge) / (_flatPad.radius - edge);
  return t * t * (3 - 2 * t);
}

function terrainHeight(x, absZ, biome) {
  const amp = biome ? biome.hillAmp : 1.0;
  // Three octaves of smooth noise
  const h0 = Math.sin(x * 0.08 + absZ * 0.05) * Math.cos(absZ * 0.07 - x * 0.04) * 2.8;
  const h1 = Math.sin(x * 0.19 + absZ * 0.14 + 1.3) * Math.cos(absZ * 0.18 + 0.7) * 1.1;
  const h2 = Math.sin(x * 0.41 - absZ * 0.29 + 2.1) * 0.42;
  let h = (h0 + h1 + h2) * amp;
  // Rock/mountain biome adds high-frequency crags
  if (biome && biome.rockiness > 0.5) {
    const crag = Math.sin(x * 0.9 + absZ * 0.7 + 3.7) * Math.cos(x * 0.6 - absZ * 0.5) * 0.6;
    h += crag * biome.rockiness;
  }
  if (_riverCarve) {
    const s = riverCarveAt(absZ);
    if (s > 0) h = h + (_riverCarve.bedY - h) * s; // cut to a level bed
  }
  if (_flatPad) {
    const w = flatPadWeight(x, absZ);
    if (w > 0) h = h + (_flatPad.y - h) * w;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Trail spline — gently swaying near x=0, deterministic low-freq sine of absZ.
// Amplitude 2.5 world-units, wavelength ~80u.
// ---------------------------------------------------------------------------

function trailXAt(absZ) {
  // Two low-frequency sine components for organic sway. Kept gentle (max
  // ±2.3u, wavelength ~140u): the travel camera looks along the trail, and a
  // hard-swaying ribbon fills the whole foreground with dirt from that angle.
  return Math.sin(absZ * 0.045) * 1.6 + Math.sin(absZ * 0.021 + 1.1) * 0.7;
}

/** Horizontal distance from world point (x, absZ) to the trail centre. */
function roadDistance(x, absZ) {
  return Math.abs(x - trailXAt(absZ));
}

// ---------------------------------------------------------------------------
// Palette — from public/lib/palette.mjs (single source with 2D).
// Albedo drives prairie color; grassTint is mild variation only (WS1 lock).
// ---------------------------------------------------------------------------

const C_GRASS      = new THREE.Color(toHex('grassMid'));
const C_GRASS_DARK = new THREE.Color(toHex('grassDeep'));
const C_GRASS_YLW  = new THREE.Color(toHex('dryTip'));
const C_DIRT       = new THREE.Color(toHex('dirtMid'));
const C_DIRT_DARK  = new THREE.Color(toHex('dirtDark'));
const C_ROCK       = new THREE.Color(toHex('stone'));
const C_ROCK_LIGHT = new THREE.Color(toHex('stoneLight'));
const C_SAND_BED   = new THREE.Color(toHex('dirtLight'));

// Biome grass tint colour objects (created once, lerped into per-vertex)
const C_TMP  = new THREE.Color();

// Palette key → THREE.Color, memoised. ColorManagement is on and the working
// space is Linear-sRGB, so `new THREE.Color(hex)` already lands linear — the
// same space the vertex-colour attribute and the shader uniforms both want.
const _paletteColors = new Map();
function pcolor(key) {
  let c = _paletteColors.get(key);
  if (!c) {
    c = new THREE.Color(toHex(key));
    _paletteColors.set(key, c);
  }
  return c;
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Biome definitions
// ---------------------------------------------------------------------------
//
// A biome entry is SHAPE + STRENGTHS only — no palette roles. Which key fills
// `ground`/`groundAlt` for a stretch of trail is owned by lib/segments.mjs and
// arrives through setBiomeBlend(), so the role assignment lives in exactly one
// file and can't drift between the 2D and 3D readings of the same segment.
//
//   hillAmp     height multiplier. Deliberately a NARROW band (0.80–1.40): the
//               caravan rides terrain.heightAt() while the camera presets are
//               fixed world-space points, so a genuinely mountainous amplitude
//               would lift the wagon out of frame. Rock country reads as rock
//               through rockiness + splat + colour, not through altitude.
//   rockiness   >0.5 turns on the high-frequency crag octave and drops the
//               slope threshold where rock albedo takes over.
//   baseSplat   the starting [grass, dirt, rock, sand] weight vector. The trail,
//               riverbed and slope rules still lerp on top of it exactly as
//               before — this only moves where they start from, which is how the
//               existing splat pipeline is meant to be biased.
//   tintMix     how hard the segment's `ground` colour recolours the blended
//               splat albedo (0 = the texture's own colour, untouched).
//   tintValue   value gain applied inside that recolour — a bone-white divide
//               has to get brighter than the grass texture, a conifer slope
//               darker, and chromaticity alone can't do that.
//   altAmt      how far the per-vertex tint leans toward the segment's
//               `groundAlt` in the low-frequency patches (the second terrain
//               tone; the 30% budget is ground + groundAlt together).
//
// prairie is the identity entry on purpose: tintMix 0 / altAmt 0 / baseSplat
// [1,0,0,0] reproduce the pre-arc renderer byte for byte, so mile 0 is the
// regression baseline the rest of the arc is measured against.

export const BIOMES = {
  prairie: {
    key: 'prairie',
    // Mild tint — albedo map carries dry wheat green (not neon multiply)
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 1.0,
    rockiness: 0.0,
    baseSplat: [1, 0, 0, 0],
    tintMix: 0,
    tintValue: 1,
    altAmt: 0,
  },
  mountains: {
    key: 'mountains',
    grassTint: new THREE.Color(toHex('hillMid')),
    hillAmp: 2.4,
    rockiness: 0.85,
    baseSplat: [1, 0, 0, 0],
    tintMix: 0,
    tintValue: 1,
    altAmt: 0,
  },
  river_valley: {
    key: 'river_valley',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 0.80,
    rockiness: 0.10,
    baseSplat: [0.72, 0.08, 0.00, 0.20],
    tintMix: 0.42,
    tintValue: 1.06,
    altAmt: 0.22,
  },
  bluffs: {
    key: 'bluffs',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 1.20,
    rockiness: 0.62,
    baseSplat: [0.22, 0.46, 0.18, 0.14],
    tintMix: 0.62,
    tintValue: 1.12,
    altAmt: 0.30,
  },
  foothills: {
    key: 'foothills',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 1.30,
    rockiness: 0.58,
    baseSplat: [0.48, 0.10, 0.34, 0.08],
    tintMix: 0.54,
    tintValue: 0.96,
    altAmt: 0.28,
  },
  snow: {
    key: 'snow',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 1.15,
    rockiness: 0.66,
    baseSplat: [0.24, 0.04, 0.40, 0.32],
    tintMix: 0.74,
    tintValue: 1.34,
    altAmt: 0.34,
  },
  desert: {
    key: 'desert',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 0.95,
    rockiness: 0.52,
    baseSplat: [0.10, 0.22, 0.18, 0.50],
    tintMix: 0.62,
    tintValue: 1.14,
    altAmt: 0.36,
  },
  forest: {
    key: 'forest',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 1.40,
    rockiness: 0.40,
    baseSplat: [0.74, 0.14, 0.12, 0.00],
    tintMix: 0.70,
    tintValue: 0.70,
    altAmt: 0.32,
  },
  arrival: {
    key: 'arrival',
    grassTint: new THREE.Color(toHex('grassTintMild')),
    hillAmp: 0.90,
    rockiness: 0.06,
    baseSplat: [0.86, 0.06, 0.00, 0.08],
    tintMix: 0.50,
    tintValue: 1.04,
    altAmt: 0.24,
  },
};

// ---------------------------------------------------------------------------
// lerpSplat — blend the splat weight vec4 toward a single layer.
// Exact port from terrain.ts.
// ---------------------------------------------------------------------------

function lerpSplat(w, layer, t) {
  if (t <= 0) return;
  w[0] -= w[0] * t;
  w[1] -= w[1] * t;
  w[2] -= w[2] * t;
  w[3] -= w[3] * t;
  w[layer] += t;
}

// ---------------------------------------------------------------------------
// Per-vertex sample: height, analytic normal, vertex colour, splat weights
// ---------------------------------------------------------------------------

const SLOPE_EPS = 1.5;

function sampleVertex(x, absZ, biome) {
  const h  = terrainHeight(x, absZ, biome);
  const hx = terrainHeight(x + SLOPE_EPS, absZ, biome) - terrainHeight(x - SLOPE_EPS, absZ, biome);
  const hz = terrainHeight(x, absZ + SLOPE_EPS, biome) - terrainHeight(x, absZ - SLOPE_EPS, biome);
  const slope = Math.sqrt(hx * hx + hz * hz) / (2 * SLOPE_EPS);

  const invLen = 1 / Math.hypot(hx / (2 * SLOPE_EPS), 1, hz / (2 * SLOPE_EPS));
  const nx = -(hx / (2 * SLOPE_EPS)) * invLen;
  const ny = invLen;
  const nz = -(hz / (2 * SLOPE_EPS)) * invLen;

  // Splat weights: [grass, dirt, rock, sand] — the biome's own starting mix.
  const bs = biome && biome.baseSplat;
  const w = bs ? [bs[0], bs[1], bs[2], bs[3]] : [1, 0, 0, 0];

  // Base grass — patchy variation via trig noise (no Math.random)
  const v  = (Math.sin(x * 0.21) * Math.cos(absZ * 0.17) + 1) / 2;
  const v2 = (Math.sin(x * 0.043 + 5) * Math.cos(absZ * 0.05 + 2) + 1) / 2;
  C_TMP.copy(biome ? biome.grassTint : C_GRASS);
  C_TMP.lerp(C_GRASS_DARK, v * 0.45);
  C_TMP.lerp(C_GRASS_YLW, v2 * 0.28);
  // Second terrain tone. Rides the low-frequency v2 patches so groundAlt reads
  // as broad country (a basalt field, a bank of dirt), never as speckle.
  if (biome && biome.altAmt > 0 && biome.groundAltColor) {
    C_TMP.lerp(biome.groundAltColor, v2 * biome.altAmt);
  }

  // Trail — dirt within road distance profile. The reference's rd<2/3.4 is a
  // village ROAD; this is a wagon TRACK (the wagon itself is 1.8u wide), so
  // full dirt to 1.4u and feather to 2.6u — grass must read on both sides even
  // when the camera looks straight down the trail axis.
  const rd = roadDistance(x, absZ);
  if (rd < 1.4) {
    C_TMP.lerp(C_DIRT, 0.85);
    lerpSplat(w, 1, 0.85);
  } else if (rd < 2.6) {
    const t = 0.85 * (1 - (rd - 1.4) / 1.2);
    C_TMP.lerp(C_DIRT, t);
    lerpSplat(w, 1, t);
  }

  // Riverbed + banks: sand splat where the channel carves, sandy color toward
  // the waterline so the shore reads as a ford, not green grass underwater.
  if (_riverCarve) {
    const carve = riverCarveAt(absZ); // 0..1 channel profile
    if (carve > 0.12) {
      const t = clamp01((carve - 0.12) / 0.5);
      C_TMP.lerp(C_SAND_BED, t * 0.8);
      lerpSplat(w, 3, t * 0.85);
    }
  }

  // Rock on steep slopes
  const rockStart = biome && biome.rockiness > 0.5 ? 0.45 : 0.55;
  if (slope > rockStart) {
    const t = Math.min(1, (slope - rockStart) * 2.2);
    C_TMP.lerp(C_ROCK, t);
    lerpSplat(w, 2, t);
  }

  // Extra rock on high terrain (mountain peaks)
  if (h > 4.5) {
    const t = clamp01((h - 4.5) / 4.0) * (biome ? biome.rockiness : 0.3);
    C_TMP.lerp(C_ROCK_LIGHT, t);
    lerpSplat(w, 2, t * 0.8);
  }

  return {
    height: h,
    normal: [nx, ny, nz],
    color: [C_TMP.r, C_TMP.g, C_TMP.b],
    splat: w,
  };
}

// ---------------------------------------------------------------------------
// Chunk geometry builder (with skirt rings to hide LOD cracks)
// ---------------------------------------------------------------------------
//
// PERF NOTE: On recycle, rewriteChunkGeometry() overwrites the same
// Float32Array buffers in-place — no per-recycle allocation.
//
// The chunk's world-space X runs [-BAND_HALF_W, BAND_HALF_W].
// Vertex Z is CHUNK-LOCAL (0 .. CHUNK_SIZE); the caller places the chunk with
// mesh.position.z = absZ0 - scrollZ, which is the one and only place absZ0 is
// applied. Height/splat sampling still uses the ABSOLUTE wz = absZ0 + local, so
// the field is continuous across recycles. Baking absZ0 into the vertices too
// double-counts it and tears the band into CHUNK_SIZE-wide strips separated by
// CHUNK_SIZE-wide voids — grass and props (placed at absZ - scrollZ) then hang
// over nothing. Local Z also keeps vertex magnitudes bounded as scrollZ grows.
//
// Layout: (nz+1) rows × (nx+1) columns of interior verts, wrapped by a 1-vert
// skirt ring (indices -1 and n+1 in each axis) that hangs SKIRT_DROP below the
// border vertices to hide cracks between chunks.

const CHUNK_SIZE    = 60;    // world-units per chunk along Z
const BAND_HALF_W   = 90;    // ±90u: at ±30 the band edge showed inside the frame at gameplay camera angles
const SKIRT_DROP    = 0.35;

// Two LOD tiers: near chunks (|chunkCenterZ - scrollZ| < LOD_NEAR_Z) are dense
const LOD_NEAR_SPACING  = 1.5;   // <= 1.5u as required by brief
const LOD_FAR_SPACING   = 3.0;
const LOD_NEAR_Z        = 90;    // |display centre| under this = dense tier

// Steps the mood arc's per-vertex half is quantised to across one transition
// window (see setBiomeBlend). 8 → at most 8 full-band rewrites over 40 miles.
const BLEND_STEPS = 8;

function buildChunkGeometry(absZ0, spacing, biome) {
  const nx = Math.max(4, Math.round((BAND_HALF_W * 2) / spacing));
  const nz = Math.max(4, Math.round(CHUNK_SIZE / spacing));
  const stepX = (BAND_HALF_W * 2) / nx;
  const stepZ = CHUNK_SIZE / nz;
  const gw = nx + 3;  // grid width including skirt column on each side
  const gh = nz + 3;
  const count = gw * gh;

  const positions = new Float32Array(count * 3);
  const normals   = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const splats    = new Float32Array(count * 4);

  // Cache samples by clamped interior grid index (skirt shares border sample)
  const sampleCache = new Map();
  for (let gj = 0; gj < gh; gj++) {
    for (let gi = 0; gi < gw; gi++) {
      const i  = gi - 1;
      const j  = gj - 1;
      const ci = i < 0 ? 0 : i > nx ? nx : i;
      const cj = j < 0 ? 0 : j > nz ? nz : j;
      const isSkirt = (i !== ci || j !== cj);
      const wx = -BAND_HALF_W + ci * stepX;
      const wz = absZ0 + cj * stepZ;
      const cacheKey = cj * (nx + 1) + ci;
      let s = sampleCache.get(cacheKey);
      if (!s) {
        s = sampleVertex(wx, wz, biome);
        sampleCache.set(cacheKey, s);
      }
      const vi = gj * gw + gi;
      positions[vi * 3]     = wx;
      positions[vi * 3 + 1] = s.height - (isSkirt ? SKIRT_DROP : 0);
      positions[vi * 3 + 2] = cj * stepZ;  // chunk-local; mesh.position carries absZ0 - scrollZ
      normals[vi * 3]     = s.normal[0];
      normals[vi * 3 + 1] = s.normal[1];
      normals[vi * 3 + 2] = s.normal[2];
      colors[vi * 3]     = s.color[0];
      colors[vi * 3 + 1] = s.color[1];
      colors[vi * 3 + 2] = s.color[2];
      splats[vi * 4]     = s.splat[0];
      splats[vi * 4 + 1] = s.splat[1];
      splats[vi * 4 + 2] = s.splat[2];
      splats[vi * 4 + 3] = s.splat[3];
    }
  }

  const quadsX  = gw - 1;
  const quadsZ  = gh - 1;
  const indices = new Uint32Array(quadsX * quadsZ * 6);
  let k = 0;
  for (let gj = 0; gj < quadsZ; gj++) {
    for (let gi = 0; gi < quadsX; gi++) {
      const a = gj * gw + gi;
      const b = a + 1;
      const c = a + gw;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  geo.setAttribute('aSplat',   new THREE.BufferAttribute(splats,    4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Rewrite an existing geometry's attribute arrays in-place for a new absZ0.
 * Reuses the same Float32Array buffers — no GPU allocation on recycle.
 * Returns false if the grid dimensions changed (requires a full rebuild).
 */
function rewriteChunkGeometry(geo, absZ0, spacing, biome) {
  const pos = geo.attributes.position;
  const nx  = Math.max(4, Math.round((BAND_HALF_W * 2) / spacing));
  const nz  = Math.max(4, Math.round(CHUNK_SIZE / spacing));
  const gw  = nx + 3;
  const gh  = nz + 3;
  if (pos.count !== gw * gh) return false;  // dimensions changed; rebuild

  const stepX = (BAND_HALF_W * 2) / nx;
  const stepZ = CHUNK_SIZE / nz;
  const posArr  = pos.array;
  const normArr = geo.attributes.normal.array;
  const colArr  = geo.attributes.color.array;
  const splatArr = geo.attributes.aSplat.array;

  const sampleCache = new Map();
  for (let gj = 0; gj < gh; gj++) {
    for (let gi = 0; gi < gw; gi++) {
      const i  = gi - 1;
      const j  = gj - 1;
      const ci = i < 0 ? 0 : i > nx ? nx : i;
      const cj = j < 0 ? 0 : j > nz ? nz : j;
      const isSkirt = (i !== ci || j !== cj);
      const wx = -BAND_HALF_W + ci * stepX;
      const wz = absZ0 + cj * stepZ;
      const cacheKey = cj * (nx + 1) + ci;
      let s = sampleCache.get(cacheKey);
      if (!s) {
        s = sampleVertex(wx, wz, biome);
        sampleCache.set(cacheKey, s);
      }
      const vi = gj * gw + gi;
      posArr[vi * 3]     = wx;
      posArr[vi * 3 + 1] = s.height - (isSkirt ? SKIRT_DROP : 0);
      posArr[vi * 3 + 2] = cj * stepZ;
      normArr[vi * 3]     = s.normal[0];
      normArr[vi * 3 + 1] = s.normal[1];
      normArr[vi * 3 + 2] = s.normal[2];
      colArr[vi * 3]     = s.color[0];
      colArr[vi * 3 + 1] = s.color[1];
      colArr[vi * 3 + 2] = s.color[2];
      splatArr[vi * 4]     = s.splat[0];
      splatArr[vi * 4 + 1] = s.splat[1];
      splatArr[vi * 4 + 2] = s.splat[2];
      splatArr[vi * 4 + 3] = s.splat[3];
    }
  }
  pos.needsUpdate   = true;
  geo.attributes.normal.needsUpdate = true;
  geo.attributes.color.needsUpdate  = true;
  geo.attributes.aSplat.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return true;
}

// ---------------------------------------------------------------------------
// Splat material with onBeforeCompile injection (MeshStandardMaterial)
// ---------------------------------------------------------------------------
// The shader receives aSplat (vec4: grass/dirt/rock/sand weights) and samples
// textures supplied via `textures` module namespace.  UV is world-space XZ so
// the terrain never shows seams on recycle.

const ROUGH_GRASS = 0.80;
const ROUGH_DIRT  = 0.92;
const ROUGH_ROCK  = 0.75;
const ROUGH_SAND  = 0.85;

function buildSplatMaterial(textures) {
  // Receive texture maps from the integrator's textures.mjs namespace.
  // Gracefully fall back to null if a getter doesn't exist yet (M0 scaffold).
  const grassMaps  = textures && typeof textures.grassMaps  === 'function' ? textures.grassMaps()  : null;
  const dirtMaps   = textures && typeof textures.dirtMaps   === 'function' ? textures.dirtMaps()   : null;
  const rockMaps   = textures && typeof textures.rockMaps   === 'function' ? textures.rockMaps()   : null;
  const sandMaps   = textures && typeof textures.sandMaps   === 'function' ? textures.sandMaps()   : null;
  const macroTex   = textures && typeof textures.macroNoiseTexture === 'function' ? textures.macroNoiseTexture() : null;

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0,
  });

  // Mood-arc recolour. This is the CONTINUOUS half of a segment transition:
  // uniforms are material-global, so a chunk recycling mid-fade cannot disagree
  // with the eight chunks beside it — there is no retint-on-recycle and no pop,
  // which is why the dominant colour move lives here rather than in the vertex
  // buffer. uBiomeTint is pre-normalised on the JS side (chromaticity × value
  // gain ÷ its own luminance) so the shader only has to scale it by the splat
  // albedo's luminance: texture detail survives, hue and level come from the
  // segment. uBiomeMix 0 is an exact identity — mix(alb, x, 0.0) === alb.
  // Created out here (not inside onBeforeCompile) so setBiomeBlend holds a
  // stable reference; a shader recompile re-binds these same objects.
  const biomeUniforms = {
    uBiomeTint: { value: new THREE.Color(1, 1, 1) },
    uBiomeMix:  { value: 0 },
  };
  mat.userData.biomeUniforms = biomeUniforms;

  // GLSL is generated CONDITIONALLY at compile time based on which textures
  // exist. WebGL GLSL ES cannot construct or compare sampler values (the
  // `uGrass != sampler2D(0)` guard pattern is a compile ERROR, not a fallback),
  // so the branch between texture-sample and flat-color must happen here in JS.
  const hasNormals = !!(grassMaps?.normalMap && dirtMaps?.normalMap && rockMaps?.normalMap);
  const grassAlbExpr = grassMaps
    ? 'mix(texture2D(uGrass, tuv).rgb, texture2D(uGrass, tuv * 0.31).rgb, 0.42)'
    : 'vec3(0.478, 0.561, 0.227)'; // grassMid dry prairie (#7a8f3a)
  const dirtAlbExpr = dirtMaps
    ? 'texture2D(uDirt, tuv * 0.8).rgb'
    : 'vec3(0.545, 0.376, 0.200)'; // dirtMid normalised
  const rockAlbExpr = rockMaps
    ? 'texture2D(uRock, tuv * 0.6).rgb'
    : 'vec3(0.588, 0.557, 0.518)'; // stone normalised
  const sandAlbExpr = sandMaps
    ? 'texture2D(uSand, tuv).rgb'
    : 'vec3(0.769, 0.604, 0.424)'; // dirtLight normalised
  const macroExpr = macroTex
    ? 'mix(0.92, 1.08, texture2D(uMacro, vWPos.xz * 0.012).r)'
    : '1.0';
  const samplerDecls = [
    grassMaps && 'uniform sampler2D uGrass;',
    dirtMaps && 'uniform sampler2D uDirt;',
    rockMaps && 'uniform sampler2D uRock;',
    sandMaps && 'uniform sampler2D uSand;',
    macroTex && 'uniform sampler2D uMacro;',
    hasNormals && 'uniform sampler2D uGrassN; uniform sampler2D uDirtN; uniform sampler2D uRockN;',
  ].filter(Boolean).join('\n        ');

  mat.onBeforeCompile = (sh) => {
    if (grassMaps) sh.uniforms.uGrass = { value: grassMaps.map };
    if (dirtMaps) sh.uniforms.uDirt = { value: dirtMaps.map };
    if (rockMaps) sh.uniforms.uRock = { value: rockMaps.map };
    if (sandMaps) sh.uniforms.uSand = { value: sandMaps.map };
    if (macroTex) sh.uniforms.uMacro = { value: macroTex };
    sh.uniforms.uBiomeTint = biomeUniforms.uBiomeTint;
    sh.uniforms.uBiomeMix  = biomeUniforms.uBiomeMix;
    if (hasNormals) {
      sh.uniforms.uGrassN = { value: grassMaps.normalMap };
      sh.uniforms.uDirtN = { value: dirtMaps.normalMap };
      sh.uniforms.uRockN = { value: rockMaps.normalMap };
    }

    // ── Vertex: pass splat weights + world position to fragment ──
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSplat;
        varying   vec4 vSplat;
        varying   vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = aSplat;
        vWPos  = (modelMatrix * vec4(position, 1.0)).xyz;`);

    // ── Fragment: splat-blend albedo, vertex-colour tint, macro break ──
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vSplat;
        varying vec3 vWPos;
        uniform vec3  uBiomeTint;
        uniform float uBiomeMix;
        ${samplerDecls}`)
      .replace('#include <map_fragment>', `
        // World-space tile UV (scale ≈ 0.22u⁻¹ matches the reference)
        vec2 tuv = vWPos.xz * 0.22;

        vec3 grassAlb = ${grassAlbExpr};
        vec3 dirtAlb  = ${dirtAlbExpr};
        vec3 rockAlb  = ${rockAlbExpr};
        vec3 sandAlb  = ${sandAlbExpr};

        vec3 alb = grassAlb * vSplat.x
                 + dirtAlb  * vSplat.y
                 + rockAlb  * vSplat.z
                 + sandAlb  * vSplat.w;

        // Mood arc: keep the albedo's luminance detail, take the segment's hue
        // and level. Four fixed textures can't make Wyoming stop looking like
        // Kansas on their own; this is what does it.
        float albL = dot(alb, vec3(0.2126, 0.7152, 0.0722));
        alb = mix(alb, uBiomeTint * albL, uBiomeMix);

        // Macro brightness modulation — breaks distant tiling (ref §texture)
        float macro = ${macroExpr};

        // Vertex colour (authored as the full ground tint) modulates gently
        // — re-centre around 1.0 so it reads as a multiplier, not a wash.
        vec3 vtint = clamp(vColor.rgb * 2.0, 0.0, 2.0);
        diffuseColor.rgb *= alb * mix(vec3(1.0), vtint, 0.38) * macro;`)
      .replace('#include <color_fragment>', `
        // Already folded into the splat albedo above — skip the stock multiply.`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * dot(
            vSplat,
            vec4(${ROUGH_GRASS.toFixed(2)},
                 ${ROUGH_DIRT.toFixed(2)},
                 ${ROUGH_ROCK.toFixed(2)},
                 ${ROUGH_SAND.toFixed(2)}));`);

    // ── Detail normals from per-layer normal maps ──
    // No `tbn` here: three only defines it when the material has a real
    // normalMap (USE_NORMALMAP_TANGENTSPACE) — referencing it without one is a
    // compile error. Terrain is y-up, so treat normal-map xy as a world-space
    // xz perturbation and rotate it into view space (the space `normal` lives
    // in) with viewMatrix, which three declares in every fragment shader.
    if (hasNormals) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 gN = texture2D(uGrassN, tuv).xyz * 2.0 - 1.0;
          vec3 dN = texture2D(uDirtN,  tuv * 0.8).xyz * 2.0 - 1.0;
          vec3 rN = texture2D(uRockN,  tuv * 0.6).xyz * 2.0 - 1.0;
          vec2 detN = gN.xy * vSplat.x * 0.65
                    + dN.xy * vSplat.y * 0.80
                    + rN.xy * vSplat.z * 0.90;
          vec3 vPerturb = (viewMatrix * vec4(detN.x, 0.0, detN.y, 0.0)).xyz;
          normal = normalize(normal + vPerturb);`);
    }
  };
  return mat;
}

// ---------------------------------------------------------------------------
// Chunk ring — the scrolling band
// ---------------------------------------------------------------------------
//
// CHUNK_COUNT chunks are placed at evenly-spaced absolute Z positions ahead of
// and behind the wagon.  On each update(), chunks that have passed behind the
// camera are moved ahead and their geometry rewritten to sample at the new
// absolute Z.
//
// Chunk absZ0 values advance by CHUNK_SIZE; the wagon anchor is always at the
// chunk ring's nominal centre.

// The wagon travels toward -Z (grass AHEAD, landmark worldZ, river absZ and six
// of the seven camera presets all read -Z as forward), so the band is weighted
// forward: REAR_SPAN behind, the remainder ahead. Both spans have to outrun the
// widest preset fog far (300u, arrival) or the band's own edge shows as a step
// into open sky — and anything scattered on absZ beyond the edge (grass reaches
// 150u ahead) hangs over nothing.
const CHUNK_COUNT = 9;    // 9 × 60u = 540u band
const REAR_SPAN   = 240;  // kept behind the wagon (+Z); the travel cam looks back down the trail

/** Initial absZ positions — already the seating update() would wrap to at scrollZ=0. */
function initialChunkZ(index) {
  return REAR_SPAN - CHUNK_SIZE - index * CHUNK_SIZE;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * createTerrain({ textures, biome })
 *
 * @param {object} opts
 * @param {object|null} opts.textures   — textures.mjs namespace (passed in by
 *                                        integrator; not imported here).
 * @param {object|null} opts.biome      — biome descriptor (use BIOMES.prairie
 *                                        or BIOMES.mountains, or a custom one).
 *
 * @returns {{
 *   group:      THREE.Group,
 *   update:     (dt: number, scrollZ: number) => void,
 *   setBiome:   (b: object) => void,
 *   setBiomeBlend: (a: object, b: object, t: number) => boolean,
 *   heightAt:   (x: number, absZ: number) => number,
 *   trailXAt:   (absZ: number) => number,
 *   dispose:    () => void,
 * }}
 */
export function createTerrain({ textures = null, biome = null } = {}) {
  let currentBiome = biome || BIOMES.prairie;

  // ── Material ──
  const mat = buildSplatMaterial(textures);
  const biomeUniforms = mat.userData.biomeUniforms;

  // ── Mood-arc blend state (see setBiomeBlend) ──
  // blendKey is the signature of the QUANTISED half; null forces the next
  // setBiomeBlend to rebuild. The scratch colours are rewritten in place and
  // handed to currentBiome by reference — safe because the only reader is the
  // rewriteAll() that runs synchronously on the same step.
  let blendKey = null;
  const _blendTint      = new THREE.Color();
  const _blendGrassTint = new THREE.Color();
  const _blendGroundAlt = new THREE.Color();
  const _blendSplat     = [1, 0, 0, 0];

  // ── Chunk ring ──
  const group = new THREE.Group();
  group.name  = 'terrain';

  /**
   * Per-chunk record:
   *   mesh    — THREE.Mesh
   *   absZ0   — absolute world-Z of the chunk's near edge
   *   spacing — current LOD vertex spacing
   */
  const chunks = [];

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const absZ0   = initialChunkZ(i);
    // Same LOD rule update() applies, so the far half of the ring isn't built
    // dense and then immediately thrown away on the first update pass.
    const spacing = Math.abs(absZ0 + CHUNK_SIZE / 2) > LOD_NEAR_Z
      ? LOD_FAR_SPACING : LOD_NEAR_SPACING;
    const geo     = buildChunkGeometry(absZ0, spacing, currentBiome);
    const mesh    = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow    = false;
    // Mesh lives at world origin on X/Y; Z offset applied per-frame in update()
    group.add(mesh);
    chunks.push({ mesh, absZ0, spacing });
  }

  // ── Biome lerp state ──
  // setBiome rebuilds recycled chunks immediately (new absZ samples new biome).
  // We do NOT lerp vertex colours over time — that would break determinism for
  // screenshot regression.  Instead, recycled chunks naturally carry the new
  // biome palette; the transition happens as chunks roll through.
  // (Documented deviation from brief: brief offers a lerp-over-~1s option as
  // an alternative; we choose the deterministic-recycle approach instead.)

  // ── Update ──

  /**
   * Call once per frame.
   * @param {number} dt      — frame delta-time (seconds, currently unused but
   *                           reserved for future per-frame VFX sub-systems).
   * @param {number} scrollZ — total world-units the terrain has scrolled (+Z).
   */
  function update(dt, scrollZ) {
    // The wagon is always at world origin; a chunk's display Z is
    // (absZ0 - scrollZ), i.e. how far it is behind/ahead in world space.
    //
    // Recycle policy: wrap each chunk into the one-band-wide window ending at
    // (scrollZ + REAR_SPAN - CHUNK_SIZE), by whole-band steps. Whole-band steps
    // (not one CHUNK_SIZE per call) because freezeAt(d)
    // jumps scrollZ arbitrarily and a nudge-per-frame ring would be stranded
    // mid-jump — and because the resulting seating is a pure function of
    // scrollZ, so the same d re-seats identically no matter the play history.
    // Chunk absZ0 values stay distinct mod BAND_TOTAL, so the ring never
    // collapses two chunks onto the same span.
    const BAND_TOTAL = CHUNK_COUNT * CHUNK_SIZE;
    const windowMax  = scrollZ + REAR_SPAN - CHUNK_SIZE;

    for (const chunk of chunks) {
      const steps = Math.floor((windowMax - chunk.absZ0) / BAND_TOTAL);
      if (steps !== 0) chunk.absZ0 += steps * BAND_TOTAL;

      // LOD is re-evaluated every frame, not only on recycle: a chunk enters the
      // band at the far edge, so a recycle-time-only choice pinned every chunk to
      // the coarse tier forever once the ring had turned over once.
      const mid = chunk.absZ0 + CHUNK_SIZE / 2 - scrollZ;
      const spacing = Math.abs(mid) > LOD_NEAR_Z ? LOD_FAR_SPACING : LOD_NEAR_SPACING;
      if (steps !== 0 || spacing !== chunk.spacing) {
        // Try in-place rewrite first; full rebuild if grid dimensions changed
        const ok = spacing === chunk.spacing
          && rewriteChunkGeometry(chunk.mesh.geometry, chunk.absZ0, spacing, currentBiome);
        if (!ok) {
          chunk.mesh.geometry.dispose();
          chunk.mesh.geometry = buildChunkGeometry(chunk.absZ0, spacing, currentBiome);
          chunk.spacing = spacing;
        }
      }

      // Update mesh world position: X and Y stay at origin; Z shifts by -scrollZ
      chunk.mesh.position.set(0, 0, chunk.absZ0 - scrollZ);
    }
  }

  // ── setBiome ──
  // Deferred to next recycle cycle for determinism.
  function setBiome(b) {
    currentBiome = b || BIOMES.prairie;
    // A hand-set biome takes the module out of the mood arc: clear the blend
    // signature so the next setBiomeBlend() is guaranteed to rebuild, and drop
    // the recolour back to identity so a legacy caller gets the raw textures.
    blendKey = null;
    biomeUniforms.uBiomeMix.value = 0;
    // Force an immediate rewrite of all visible chunks so the palette change
    // takes effect without waiting for a recycle.
    for (const chunk of chunks) {
      const ok = rewriteChunkGeometry(chunk.mesh.geometry, chunk.absZ0, chunk.spacing, currentBiome);
      if (!ok) {
        chunk.mesh.geometry.dispose();
        chunk.mesh.geometry = buildChunkGeometry(chunk.absZ0, chunk.spacing, currentBiome);
      }
    }
  }

  // ── setBiomeBlend ──
  // The mood arc's terrain half. `a` and `b` are segments from lib/segments.mjs
  // (anything carrying { biome, palette: { ground, groundAlt } } works); `t` is
  // that module's cross-fade weight, already hermite-eased.
  //
  // The blend is split across two clocks on purpose:
  //
  //   CONTINUOUS — the dominant ground colour, in two material uniforms. Every
  //     chunk samples the same uniform every frame, so the recycle ring can
  //     turn over mid-transition without a single chunk carrying a stale look.
  //     This is the answer to "chunk recycling must pick up the current blend":
  //     the part that would pop isn't in the geometry at all.
  //
  //   QUANTISED — height amplitude, crag strength, the splat start vector and
  //     the groundAlt lean, all of which live in the vertex buffers and need a
  //     rewrite of the whole band to change. Lerping those per frame would mean
  //     nine chunk rewrites every frame; snapping them once at the midpoint
  //     would visibly morph the ground under the wagon. Quantising t to
  //     BLEND_STEPS spreads it over a handful of small rewrites across the
  //     40-mile window instead, and the continuous recolour riding on top hides
  //     the steps. Quantised t is a pure function of miles, so freezeAt() and
  //     the screenshot harness stay deterministic.
  //
  // Returns true when the quantised half actually rewrote — the caller uses it
  // to re-seed anything scattered on terrain.heightAt() (grass tufts), which
  // would otherwise float or sink after an amplitude step.
  function setBiomeBlend(a, b, t) {
    if (!a || !a.palette) return false;
    const segB = b && b.palette ? b : a;
    const shapeA = BIOMES[a.biome] || BIOMES.prairie;
    const shapeB = BIOMES[segB.biome] || BIOMES.prairie;
    const f = t < 0 ? 0 : t > 1 ? 1 : t;

    // Continuous half.
    _blendTint.copy(pcolor(a.palette.ground)).lerp(pcolor(segB.palette.ground), f);
    const value = lerpNum(shapeA.tintValue, shapeB.tintValue, f);
    const lum = Math.max(
      0.2126 * _blendTint.r + 0.7152 * _blendTint.g + 0.0722 * _blendTint.b,
      1e-4,
    );
    biomeUniforms.uBiomeTint.value.copy(_blendTint).multiplyScalar(value / lum);
    biomeUniforms.uBiomeMix.value = lerpNum(shapeA.tintMix, shapeB.tintMix, f);

    // Quantised half.
    const q = Math.round(f * BLEND_STEPS) / BLEND_STEPS;
    const key = `${shapeA.key}>${shapeB.key}@${q}|${a.palette.groundAlt}>${segB.palette.groundAlt}`;
    if (key === blendKey) return false;
    blendKey = key;

    _blendGrassTint.copy(shapeA.grassTint).lerp(shapeB.grassTint, q);
    _blendGroundAlt.copy(pcolor(a.palette.groundAlt)).lerp(pcolor(segB.palette.groundAlt), q);
    for (let i = 0; i < 4; i++) {
      _blendSplat[i] = lerpNum(shapeA.baseSplat[i], shapeB.baseSplat[i], q);
    }
    currentBiome = {
      key,
      grassTint: _blendGrassTint,
      groundAltColor: _blendGroundAlt,
      altAmt: lerpNum(shapeA.altAmt, shapeB.altAmt, q),
      hillAmp: lerpNum(shapeA.hillAmp, shapeB.hillAmp, q),
      rockiness: lerpNum(shapeA.rockiness, shapeB.rockiness, q),
      baseSplat: _blendSplat,
    };
    rewriteAll();
    return true;
  }

  // ── setRiver ──
  // Carve (or clear, with null) a river channel crossing the trail at absZ.
  // Same immediate-rewrite pattern as setBiome — deterministic, no lerp.
  function rewriteAll() {
    for (const chunk of chunks) {
      const ok = rewriteChunkGeometry(chunk.mesh.geometry, chunk.absZ0, chunk.spacing, currentBiome);
      if (!ok) {
        chunk.mesh.geometry.dispose();
        chunk.mesh.geometry = buildChunkGeometry(chunk.absZ0, chunk.spacing, currentBiome);
      }
    }
  }

  function setRiver(r) {
    _riverCarve = r ? { absZ: r.absZ, halfWidth: r.halfWidth, bedY: r.bedY } : null;
    rewriteAll();
  }

  // Level the terrain inside a radius (for forts/settlements). null clears it.
  function setFlatPad(p) {
    _flatPad = p ? { absZ: p.absZ, x: p.x || 0, radius: p.radius, y: p.y } : null;
    rewriteAll();
  }

  // ── Public helpers ──

  /** Height of the terrain surface at absolute world coords (x, absZ). */
  function heightAt(x, absZ) {
    return terrainHeight(x, absZ, currentBiome);
  }

  /** River-carve depth at absZ (0 = no channel). Scatter systems use this to
   *  keep grass/props out of the water. */
  function carveDepthAt(absZ) {
    return riverCarveAt(absZ);
  }

  /** Flatten-pad weight at (x, absZ), 0..1 (0 = no pad). Scatter systems use
   *  this to keep grass off the leveled ground under a fort/settlement. */
  function padWeightAt(x, absZ) {
    return flatPadWeight(x, absZ);
  }

  // ── Dispose ──

  function dispose() {
    for (const chunk of chunks) {
      chunk.mesh.geometry.dispose();
    }
    mat.dispose();
    group.clear();
  }

  // ── Force an initial position pass at scrollZ=0 ──
  update(0, 0);

  return {
    group,
    update,
    setBiome,
    setBiomeBlend,
    setRiver,
    setFlatPad,
    heightAt,
    carveDepthAt,
    padWeightAt,
    trailXAt,  // re-export for integrator (wagon/oxen placement)
    dispose,
  };
}
