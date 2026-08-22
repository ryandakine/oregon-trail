// Oregon Trail 3D render layer — procedural texture system (M1).
//
// Zero external assets. Every surface is painted on an HTMLCanvasElement and
// converted to a THREE.CanvasTexture. The approach is ported from the
// world-of-claudecraft reference (makeCanvas / drawWrapped / heightToNormal)
// Hues from public/lib/palette.mjs (dry prairie grass, not golf neon).
//
// ALL randomness is deterministic (LCG seeded from a module-level constant).
// The seed is RESET before every builder so calls are order-independent and
// each builder always produces identical output, which is required for
// screenshot pixel-diff regression tests (bootstrap.mjs §3.1).
//
// Lazy + idempotent: builders cache their result on first call, return the
// cached instance on all subsequent calls.  Nothing is allocated at import
// time.

import * as THREE from 'three';
import { cssHex } from '../lib/palette.mjs';

// ---------------------------------------------------------------------------
// Seeded LCG — identical to the world-of-claudecraft reference.
// NEVER call Math.random() at module or render time.
// ---------------------------------------------------------------------------

let _seed = 12345;

/** Advance the LCG and return a value in [0, 1). */
function rnd() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

/** Reset the seed to the module constant before each builder run.
 *  This guarantees identical output on every call, regardless of the order
 *  builders are invoked.  Each builder calls seedReset() at its top. */
function seedReset(salt = 0) {
  _seed = (12345 + salt) & 0x7fffffff;
}

// ---------------------------------------------------------------------------
// Core factories (exported for external use)
// ---------------------------------------------------------------------------

/**
 * Create a THREE.CanvasTexture from a paint callback.
 * RepeatWrapping + SRGBColorSpace by default.
 * @param {number} size - Canvas side length in pixels.
 * @param {(ctx: CanvasRenderingContext2D, size: number) => void} draw
 * @returns {THREE.CanvasTexture}
 */
export function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Create a plain HTMLCanvasElement (no THREE wrapper).
 * Used for height maps fed into heightToNormal.
 * @param {number} size
 * @param {(ctx: CanvasRenderingContext2D, size: number) => void} draw
 * @returns {HTMLCanvasElement}
 */
export function makeRawCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  return c;
}

/**
 * Draw fn at all 9 tiling offsets so blobs that cross a tile edge wrap
 * seamlessly.  The standard way to produce tiling textures without an
 * explicit modulo inside every drawing call.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {(ox: number, oy: number) => void} fn
 */
export function drawWrapped(ctx, size, fn) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) fn(ox, oy);
  }
}

/**
 * Sobel-filter a grayscale height canvas into a tangent-space normal map.
 * Wrap-samples at the borders so the result tiles correctly.
 * Returns a THREE.CanvasTexture with NoColorSpace (not gamma-expanded).
 * @param {HTMLCanvasElement} heightCanvas
 * @param {number} strength - Sobel scale factor (grass 1.6, dirt 2.0, rock 2.6 …)
 * @returns {THREE.CanvasTexture}
 */
export function heightToNormal(heightCanvas, strength = 2.0) {
  const s = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const outCtx = out.getContext('2d');
  const img = outCtx.createImageData(s, s);
  const h = (x, y) => src[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i]     = (dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  outCtx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Toon shading ramp
// ---------------------------------------------------------------------------

let _toonRampCache = null;

/**
 * The single 4-step gradient ramp every MeshToonMaterial in the 3D layer
 * shares, so wagon / oxen / pioneers / fauna / landmarks all band on the same
 * value steps.  three reads only the red channel (getGradientIrradiance), so
 * this is a value LUT, not a color one — hue stays with each material.
 * NearestFilter gives hard bands; NoColorSpace keeps the steps where authored.
 * @returns {THREE.DataTexture}
 */
export function toonRamp() {
  if (_toonRampCache) return _toonRampCache;
  const STEPS = [0.22, 0.48, 0.74, 1.0];
  const data = new Uint8Array(STEPS.length * 4);
  for (let i = 0; i < STEPS.length; i++) {
    const v = Math.round(STEPS[i] * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, STEPS.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _toonRampCache = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Lazy-cached surface map builders
// Each returns { map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture }.
// ---------------------------------------------------------------------------

// Cache buckets — populated on first call, reused on subsequent calls.
let _grassCache = null;
let _dirtCache = null;
let _rockCache = null;
let _sandCache = null;
let _plankCache = null;
let _canvasClothCache = null;
let _barkCache = null;

// Grass — dry wheat albedo (palette.grassMid / dryTip). Vertex tint is mild;
// this map carries the prairie look (WS1 albedo-first lock).
export function grassMaps() {
  if (_grassCache) return _grassCache;
  seedReset(1);
  const S = 256;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    // Base: dry prairie mid (#7a8f3a family)
    ctx.fillStyle = cssHex('grassMid');
    ctx.fillRect(0, 0, s, s);
    // Blob patches: ochre / deeper tufts
    for (let i = 0; i < 900; i++) {
      const x = rnd() * s, y = rnd() * s, r = 4 + rnd() * 9;
      const warm = rnd() > 0.45;
      const gr = Math.round(warm ? 120 + rnd() * 60 : 90 + rnd() * 50);
      const rr = Math.round(gr * (warm ? 0.92 : 0.72));
      const bb = Math.round(gr * (warm ? 0.35 : 0.22));
      drawWrapped(ctx, s, (ox, oy) => {
        ctx.fillStyle = `rgba(${rr},${gr},${bb},0.28)`;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Grass blades — fine strokes, wheat gold-green
    for (let i = 0; i < 3200; i++) {
      const x = rnd() * s, y = rnd() * s;
      const gr = Math.round(90 + rnd() * 90);
      ctx.strokeStyle = `rgba(${Math.round(gr * 0.85)},${gr},${Math.round(gr * 0.28)},0.48)`;
      ctx.lineWidth = 1 + rnd() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6);
      ctx.stroke();
    }
  });
  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#787878';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const x = rnd() * s, y = rnd() * s, r = 4 + rnd() * 10;
      const v = 80 + rnd() * 110;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
        g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });

  _grassCache = { map: mapTex, normalMap: heightToNormal(height, 1.6) };
  return _grassCache;
}

// Dirt — trail surface keyed to PALETTE.dirtMid [139,96,51].
// Includes wagon-wheel rut crack detail (brief calls this out explicitly).
// Normal strength 2.0.
export function dirtMaps() {
  if (_dirtCache) return _dirtCache;
  seedReset(2);
  const S = 256;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    // Base: warm dirt brown
    ctx.fillStyle = '#7a5628';
    ctx.fillRect(0, 0, s, s);
    // Pebble / clod stipple
    for (let i = 0; i < 800; i++) {
      const x = rnd() * s, y = rnd() * s, r = 1.5 + rnd() * 4;
      const v = Math.round(100 + rnd() * 80);
      drawWrapped(ctx, s, (ox, oy) => {
        ctx.fillStyle = `rgba(${v},${Math.round(v * 0.68)},${Math.round(v * 0.36)},0.50)`;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.8, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Dry surface cracks
    for (let i = 0; i < 40; i++) {
      let x = rnd() * s, y = rnd() * s;
      ctx.strokeStyle = 'rgba(55,32,14,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * 26;
        y += (rnd() - 0.5) * 26;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Wagon-wheel rut grooves — two parallel ruts running lengthwise (Y-axis).
    // PALETTE.rut [88,56,28] — darker than base dirt.
    for (const rx of [S * 0.33, S * 0.67]) {
      const rutW = 4 + rnd() * 3;
      ctx.strokeStyle = `rgba(88,56,28,0.70)`;
      ctx.lineWidth = rutW;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      for (let seg = 0; seg <= 8; seg++) {
        const px = rx + (rnd() - 0.5) * 5;
        const py = (seg / 8) * S;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      // compressed earth ridge flanking each rut (brighter)
      ctx.strokeStyle = `rgba(196,154,108,0.35)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx - rutW, 0);
      ctx.lineTo(rx - rutW, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx + rutW, 0);
      ctx.lineTo(rx + rutW, S);
      ctx.stroke();
    }
  });

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 600; i++) {
      const x = rnd() * s, y = rnd() * s, r = 1.5 + rnd() * 4.5;
      const v = 110 + rnd() * 120;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${v},${v},${v},0.85)`);
        g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Rut depressions in the height map (dark = sunken)
    for (const rx of [S * 0.33, S * 0.67]) {
      ctx.fillStyle = 'rgba(28,28,28,0.80)';
      ctx.fillRect(rx - 4, 0, 8, S);
    }
  });

  _dirtCache = { map: mapTex, normalMap: heightToNormal(height, 2.0) };
  return _dirtCache;
}

// Rock — fractured plates keyed to PALETTE.stone [150,142,132].
// Normal strength 2.6 (hard angular surfaces).
export function rockMaps() {
  if (_rockCache) return _rockCache;
  seedReset(3);
  const S = 256;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#7e7870';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * s, y = rnd() * s, r = 10 + rnd() * 24;
      const v = Math.round(105 + rnd() * 55);
      drawWrapped(ctx, s, (ox, oy) => {
        ctx.fillStyle = `rgba(${v},${v},${Math.round(v * 0.95)},0.55)`;
        ctx.beginPath();
        const n = 5 + Math.floor(rnd() * 3);
        for (let k = 0; k <= n; k++) {
          const a = (k / n) * Math.PI * 2;
          const rr = r * (0.7 + rnd() * 0.5);
          const px = x + ox + Math.cos(a) * rr;
          const py = y + oy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(42,40,38,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
    // Warm dust tint in crevices (PALETTE.dust [205,180,140])
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(180,158,122,${0.06 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  });

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#505050';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * s, y = rnd() * s, r = 10 + rnd() * 24;
      const v = 120 + rnd() * 110;
      drawWrapped(ctx, s, (ox, oy) => {
        ctx.fillStyle = `rgba(${v},${v},${v},0.80)`;
        ctx.beginPath();
        const n = 5 + Math.floor(rnd() * 3);
        for (let k = 0; k <= n; k++) {
          const a = (k / n) * Math.PI * 2;
          const rr = r * (0.7 + rnd() * 0.5);
          const px = x + ox + Math.cos(a) * rr;
          const py = y + oy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.fill();
      });
    }
  });

  _rockCache = { map: mapTex, normalMap: heightToNormal(height, 2.6) };
  return _rockCache;
}

// Sand — wind-ripple pattern keyed to PALETTE.dust [205,180,140].
// Normal strength 1.4 (shallow ripple undulation).
export function sandMaps() {
  if (_sandCache) return _sandCache;
  seedReset(4);
  const S = 256;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    // Warm sandy base — brighter/warmer than reference
    ctx.fillStyle = '#b39060';
    ctx.fillRect(0, 0, s, s);
    // Wind ripples: sinusoidal horizontal bands
    for (let y = 0; y < s; y++) {
      const ph = Math.sin(y * 0.22) * 0.5 + Math.sin(y * 0.07 + 2) * 0.5;
      const v = Math.round(180 + ph * 22);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.78)},${Math.round(v * 0.48)},0.35)`;
      ctx.fillRect(0, y, s, 1);
    }
    // Fine grain stipple
    for (let i = 0; i < 500; i++) {
      const v = Math.round(150 + rnd() * 70);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.79)},${Math.round(v * 0.50)},0.40)`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
  });

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;

  const height = makeRawCanvas(S, (ctx, s) => {
    for (let y = 0; y < s; y++) {
      const ph = Math.sin(y * 0.22) * 0.5 + Math.sin(y * 0.07 + 2) * 0.5;
      const v = Math.round(128 + ph * 56);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, s, 1);
    }
  });

  _sandCache = { map: mapTex, normalMap: heightToNormal(height, 1.4) };
  return _sandCache;
}

// Plank boards — keyed to PALETTE.wood [90,58,31] / woodLight [139,90,45].
// 4 rows, long grain streaks, butt joints, nail heads, board-seam shadows.
// Normal strength 2.0.
export function plankMaps() {
  if (_plankCache) return _plankCache;
  seedReset(5);
  const S = 128;
  const ROWS = 4;

  const drawPlanks = (ctx, s) => {
    ctx.fillStyle = '#4e3218';
    ctx.fillRect(0, 0, s, s);
    const rh = s / ROWS;
    for (let r = 0; r < ROWS; r++) {
      const y = r * rh;
      const v = Math.round(118 + rnd() * 38);
      ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.65)},${Math.floor(v * 0.34)})`;
      ctx.fillRect(0, y, s, rh - 2);
      // Long grain streaks
      for (let i = 0; i < 24; i++) {
        const gy = y + 2 + rnd() * (rh - 6);
        const gv = rnd() > 0.5 ? 62 + rnd() * 30 : 150 + rnd() * 42;
        ctx.strokeStyle = `rgba(${gv},${Math.floor(gv * 0.65)},${Math.floor(gv * 0.40)},0.35)`;
        ctx.lineWidth = 1;
        const x0 = rnd() * s - 20;
        ctx.beginPath();
        ctx.moveTo(x0, gy);
        ctx.quadraticCurveTo(x0 + 24, gy + (rnd() - 0.5) * 4, x0 + 40 + rnd() * 50, gy);
        ctx.stroke();
      }
      // Butt joint + nail heads (deterministic position per row)
      const jx = (((r * 53 + 17) % 97) / 97) * s;
      ctx.fillStyle = 'rgba(25,14,6,0.60)';
      ctx.fillRect(jx, y, 2, rh - 2);
      ctx.fillStyle = 'rgba(30,20,12,0.85)';
      ctx.fillRect(jx + 6, y + 4, 2.5, 2.5);
      ctx.fillRect(jx + 6, y + rh - 9, 2.5, 2.5);
      // Board seam shadow
      ctx.fillStyle = 'rgba(18,8,2,0.62)';
      ctx.fillRect(0, y + rh - 2, s, 2);
    }
  };

  const mapTex = makeCanvas(S, drawPlanks);

  const height = makeRawCanvas(S, (ctx, s) => {
    const rh = s / ROWS;
    for (let r = 0; r < ROWS; r++) {
      const y = r * rh;
      const g = ctx.createLinearGradient(0, y, 0, y + rh);
      const v = 110 + rnd() * 50;
      g.addColorStop(0, `rgb(${Math.round(v + 20)},${Math.round(v + 20)},${Math.round(v + 20)})`);
      g.addColorStop(0.9, `rgb(${Math.round(v - 14)},${Math.round(v - 14)},${Math.round(v - 14)})`);
      g.addColorStop(1, '#2c2c2c');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, s, rh);
      // Grain highlight streaks
      for (let i = 0; i < 16; i++) {
        const gv = 70 + rnd() * 120;
        ctx.fillStyle = `rgba(${gv},${gv},${gv},0.30)`;
        ctx.fillRect(rnd() * s, y + 2 + rnd() * (rh - 5), 18 + rnd() * 40, 1.5);
      }
    }
  });

  _plankCache = { map: mapTex, normalMap: heightToNormal(height, 2.0) };
  return _plankCache;
}

// Wagon bonnet (canvas cloth) — keyed to PALETTE.canvas [245,230,200] /
// canvasMid [232,201,154].
// Warp/weft weave + 2 stitched seam lines + slub noise + weather stains.
// Normal strength 1.3 (soft textile undulation).
export function canvasClothMaps() {
  if (_canvasClothCache) return _canvasClothCache;
  seedReset(6);
  const S = 128;

  const drawCloth = (ctx, s) => {
    // Warm cream base matching PALETTE.canvas
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(0, 0, s, s);
    // Warp threads (horizontal)
    for (let yy = 0; yy < s; yy += 3) {
      const v = Math.round(210 + rnd() * 28);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.87)},${Math.round(v * 0.62)},0.28)`;
      ctx.fillRect(0, yy, s, 1.5);
    }
    // Weft threads (vertical) — slightly darker / warmer
    for (let xx = 0; xx < s; xx += 3) {
      const v = Math.round(188 + rnd() * 28);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.85)},${Math.round(v * 0.58)},0.20)`;
      ctx.fillRect(xx, 0, 1.5, s);
    }
    // Slub noise (per-pixel irregularities that break smooth streak artefacts)
    for (let i = 0; i < 900; i++) {
      const v = Math.round(160 + rnd() * 70);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.87)},${Math.round(v * 0.60)},0.22)`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    // Weather stains / age patches
    for (let i = 0; i < 26; i++) {
      const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 16;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(130,104,66,0.14)');
        g.addColorStop(1, 'rgba(130,104,66,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Two stitched seam lines (visible structural seams on the bonnet)
    ctx.strokeStyle = 'rgba(100,80,48,0.55)';
    ctx.lineWidth = 1.5;
    for (const seam of [34, 92]) {
      ctx.beginPath();
      ctx.moveTo(0, seam);
      ctx.lineTo(s, seam);
      ctx.stroke();
      // Stitch dashes
      ctx.strokeStyle = 'rgba(80,60,32,0.40)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, seam + 2);
      ctx.lineTo(s, seam + 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const mapTex = makeCanvas(S, drawCloth);

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    // Warp threads raise the surface slightly
    for (let yy = 0; yy < s; yy += 3) {
      const v = 105 + rnd() * 60;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, yy, s, 1.5);
    }
    // Seam depressions (thread bunches, slightly sunken between stitches)
    for (const seam of [34, 92]) {
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, seam - 1, s, 2);
    }
  });

  _canvasClothCache = { map: mapTex, normalMap: heightToNormal(height, 1.3) };
  return _canvasClothCache;
}

// Hide / homespun — the hero-model surfaces that carried no map at all, which
// is what made oxen and pioneers read as plastic. Painted NEAR-NEUTRAL: the
// mesh material's palette color still drives hue, the map only supplies
// mottling, hair strokes and weave. Small (128) and lazily cached like the rest.

function hideMaps(salt, cfg) {
  seedReset(salt);
  const S = 128;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = cfg.base;
    ctx.fillRect(0, 0, s, s);
    // Coat patches — the light/dark blotching that breaks a flat hex up
    for (let i = 0; i < cfg.patches; i++) {
      const x = rnd() * s, y = rnd() * s, r = cfg.patchR * (0.5 + rnd());
      const [pr, pg, pb] = rnd() > cfg.darkBias ? cfg.light : cfg.dark;
      const rot = rnd() * Math.PI;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${pr},${pg},${pb},${cfg.patchAlpha})`);
        g.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.68, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Hair strokes — length and weight are what separates short fur from shag
    for (let i = 0; i < cfg.hairs; i++) {
      const x = rnd() * s, y = rnd() * s;
      const v = Math.round(cfg.hairV + rnd() * cfg.hairSpread);
      const len = cfg.hairLen * (0.7 + rnd() * 0.6);
      ctx.strokeStyle = `rgba(${v},${Math.round(v * 0.96)},${Math.round(v * 0.89)},${cfg.hairAlpha})`;
      ctx.lineWidth = cfg.hairW;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.45, y + (rnd() - 0.5) * 3, x + len, y + (rnd() - 0.5) * 2);
      ctx.stroke();
    }
  });

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.repeat.set(cfg.repeat, cfg.repeat);

  // No normal map: every consumer is a MeshToonMaterial, and normal
  // perturbation at a toon band boundary shreds the hard edge into sawtooth
  // (seen on the bonnet during the A3 conversion). Albedo carries the detail.
  return { map: mapTex };
}

// Ox hide — short mottled fur, broad cream patches over the brown base.
let _oxHideCache = null;
export function oxHideMaps() {
  if (_oxHideCache) return _oxHideCache;
  _oxHideCache = hideMaps(14, {
    base: '#cfc6b6',
    light: [246, 239, 216], dark: [148, 124, 94],
    patches: 26, patchR: 20, patchAlpha: 0.62, darkBias: 0.45,
    hairs: 900, hairV: 148, hairSpread: 92, hairAlpha: 0.20, hairW: 1.1, hairLen: 5,
    repeat: 3.5,
  });
  return _oxHideCache;
}

// Deer hide — finer, tighter tan coat; less blotching than the oxen.
let _deerHideCache = null;
export function deerHideMaps() {
  if (_deerHideCache) return _deerHideCache;
  _deerHideCache = hideMaps(15, {
    base: '#d2c9b8',
    light: [246, 240, 222], dark: [166, 140, 108],
    patches: 16, patchR: 15, patchAlpha: 0.34, darkBias: 0.5,
    hairs: 1100, hairV: 158, hairSpread: 80, hairAlpha: 0.13, hairW: 0.9, hairLen: 4,
    repeat: 2.5,
  });
  return _deerHideCache;
}

// Bison hide — long dark shag: heavier strokes, deeper blotches, harder normal.
let _bisonHideCache = null;
export function bisonHideMaps() {
  if (_bisonHideCache) return _bisonHideCache;
  _bisonHideCache = hideMaps(16, {
    base: '#bfb4a4',
    light: [216, 206, 188], dark: [112, 94, 74],
    patches: 30, patchR: 24, patchAlpha: 0.60, darkBias: 0.38,
    hairs: 1600, hairV: 132, hairSpread: 100, hairAlpha: 0.22, hairW: 1.6, hairLen: 9,
    repeat: 2,
  });
  return _bisonHideCache;
}

// Homespun — coarse hand-loomed cloth for pioneer bodies. Wider, more irregular
// threads than the wagon bonnet's mill canvas, plus trail dust wear.
let _homespunCache = null;
export function homespunMaps() {
  if (_homespunCache) return _homespunCache;
  seedReset(17);
  const S = 128;

  const mapTex = makeCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#d4ccbe';
    ctx.fillRect(0, 0, s, s);
    // Warp (vertical)
    for (let xx = 0; xx < s; xx += 4) {
      const v = Math.round(196 + rnd() * 44);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.97)},${Math.round(v * 0.90)},0.34)`;
      ctx.fillRect(xx, 0, 2 + rnd(), s);
    }
    // Weft (horizontal) — darker, so the crossings read as a weave not stripes
    for (let yy = 0; yy < s; yy += 4) {
      const v = Math.round(166 + rnd() * 40);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.96)},${Math.round(v * 0.88)},0.30)`;
      ctx.fillRect(0, yy, s, 2 + rnd());
    }
    // Slub knots — hand-spun thread is never even
    for (let i = 0; i < 420; i++) {
      const v = Math.round(150 + rnd() * 90);
      ctx.fillStyle = `rgba(${v},${v},${Math.round(v * 0.92)},0.24)`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    // Trail wear
    for (let i = 0; i < 14; i++) {
      const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 14;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(146,122,84,0.18)');
        g.addColorStop(1, 'rgba(146,122,84,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
  mapTex.repeat.set(3, 3);

  // No normal map — same toon-band sawtooth rule as hideMaps above.
  _homespunCache = { map: mapTex };
  return _homespunCache;
}

// Bark — vertical ridge field keyed to PALETTE.wood [90,58,31].
// Normal strength 2.6 (hard fibrous ridges).
export function barkMaps() {
  if (_barkCache) return _barkCache;
  seedReset(7);
  const S = 128;

  const mapTex = makeCanvas(S, (ctx, s) => {
    // Dark reddish-brown base — slightly warmer than reference
    ctx.fillStyle = '#523218';
    ctx.fillRect(0, 0, s, s);
    // Vertical ridge alternating light/dark strips
    for (let x = 0; x < s; x += 4 + Math.floor(rnd() * 6)) {
      const w = 2 + rnd() * 3;
      ctx.fillStyle = rnd() > 0.5
        ? 'rgba(36,20,8,0.50)'
        : 'rgba(112,78,42,0.45)';
      ctx.fillRect(x, 0, w, s);
    }
    // Horizontal crack marks
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(26,14,6,0.52)';
      ctx.fillRect(rnd() * s, rnd() * s, 2, 6 + rnd() * 14);
    }
    // Warm lichen/resin flecks (adds life to a dark surface)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(148,112,60,${0.08 + rnd() * 0.10})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  });

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    // Ridge heights
    for (let x = 0; x < s; x += 3 + Math.floor(rnd() * 5)) {
      const w = 2 + rnd() * 4;
      const v = rnd() > 0.5 ? 60 + rnd() * 40 : 150 + rnd() * 70;
      ctx.fillStyle = `rgb(${Math.round(v)},${Math.round(v)},${Math.round(v)})`;
      ctx.fillRect(x, 0, w, s);
    }
    // Horizontal crack depressions
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = 'rgba(20,20,20,0.70)';
      ctx.fillRect(rnd() * s, rnd() * s, 2, 8 + rnd() * 18);
    }
  });

  _barkCache = { map: mapTex, normalMap: heightToNormal(height, 2.6) };
  return _barkCache;
}

// Stone — irregular fieldstone/ashlar blocks with mortar lines, weathered grey.
// Keyed to PALETTE.stone [150,142,132]. Normal strength 2.4.
let _stoneCache = null;
export function stoneMaps() {
  if (_stoneCache) return _stoneCache;
  seedReset(12);
  const S = 256;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    // Base: weathered mid-grey, slightly warm
    ctx.fillStyle = '#817a72';
    ctx.fillRect(0, 0, s, s);
    // Fieldstone blocks: irregular polygons in varying grey tones
    for (let i = 0; i < 60; i++) {
      const x = rnd() * s, y = rnd() * s;
      const w = 18 + rnd() * 32, h = 12 + rnd() * 22;
      const v = Math.round(118 + rnd() * 52);
      drawWrapped(ctx, s, (ox, oy) => {
        ctx.fillStyle = `rgba(${v},${Math.round(v * 0.96)},${Math.round(v * 0.90)},0.72)`;
        ctx.beginPath();
        const n = 5 + Math.floor(rnd() * 3);
        for (let k = 0; k <= n; k++) {
          const a = (k / n) * Math.PI * 2;
          const rx = w * 0.5 * (0.72 + rnd() * 0.34);
          const ry = h * 0.5 * (0.72 + rnd() * 0.34);
          const px = x + ox + Math.cos(a) * rx;
          const py = y + oy + Math.sin(a) * ry;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.fill();
        // Stone edge highlight
        ctx.strokeStyle = `rgba(${Math.min(v + 22, 255)},${Math.min(Math.round(v * 0.96) + 18, 255)},${Math.min(Math.round(v * 0.90) + 14, 255)},0.30)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
    // Mortar lines — narrow grey-brown grooves between stones
    for (let i = 0; i < 30; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.strokeStyle = 'rgba(62,56,50,0.68)';
      ctx.lineWidth = 1.5 + rnd() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40);
      ctx.stroke();
    }
    // Weathering: lichen/dust flecks
    for (let i = 0; i < 180; i++) {
      const v = Math.round(160 + rnd() * 60);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.93)},${Math.round(v * 0.80)},${0.08 + rnd() * 0.10})`;
      ctx.fillRect(rnd() * s, rnd() * s, 2.5, 2.5);
    }
  });

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#505050';
    ctx.fillRect(0, 0, s, s);
    // Each stone block raised above mortar
    for (let i = 0; i < 60; i++) {
      const x = rnd() * s, y = rnd() * s;
      const w = 18 + rnd() * 32, h = 12 + rnd() * 22;
      const v = 130 + rnd() * 80;
      drawWrapped(ctx, s, (ox, oy) => {
        ctx.fillStyle = `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0.85)`;
        ctx.beginPath();
        const n = 5 + Math.floor(rnd() * 3);
        for (let k = 0; k <= n; k++) {
          const a = (k / n) * Math.PI * 2;
          const rx = w * 0.5 * (0.72 + rnd() * 0.34);
          const ry = h * 0.5 * (0.72 + rnd() * 0.34);
          const px = x + ox + Math.cos(a) * rx;
          const py = y + oy + Math.sin(a) * ry;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.fill();
      });
    }
    // Mortar depressions (dark = sunken)
    for (let i = 0; i < 30; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.strokeStyle = 'rgba(18,18,18,0.75)';
      ctx.lineWidth = 1.5 + rnd() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40);
      ctx.stroke();
    }
  });

  _stoneCache = { map: mapTex, normalMap: heightToNormal(height, 2.4) };
  return _stoneCache;
}

// Plaster — smooth off-white/tan lime plaster, subtle trowel noise + hairline cracks.
// Keyed to PALETTE.canvas [245,230,200] shifted cooler. Normal strength 1.2.
let _plasterCache = null;
export function plasterMaps() {
  if (_plasterCache) return _plasterCache;
  seedReset(13);
  const S = 256;

  const albedo = makeRawCanvas(S, (ctx, s) => {
    // Base: warm off-white lime plaster
    ctx.fillStyle = '#d8cfba';
    ctx.fillRect(0, 0, s, s);
    // Trowel noise: large soft blobs of slightly lighter/darker tone
    for (let i = 0; i < 280; i++) {
      const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 22;
      const v = Math.round(195 + rnd() * 48);
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${v},${Math.round(v * 0.94)},${Math.round(v * 0.82)},0.22)`);
        g.addColorStop(1, `rgba(${v},${Math.round(v * 0.94)},${Math.round(v * 0.82)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Fine aggregate stipple
    for (let i = 0; i < 600; i++) {
      const v = Math.round(185 + rnd() * 55);
      ctx.fillStyle = `rgba(${v},${Math.round(v * 0.93)},${Math.round(v * 0.80)},0.18)`;
      ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    // Hairline cracks — fine dark sinuous lines
    for (let i = 0; i < 18; i++) {
      let x = rnd() * s, y = rnd() * s;
      ctx.strokeStyle = 'rgba(80,68,50,0.38)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 22;
        y += (rnd() - 0.5) * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Age staining: scattered warm-tan wash patches
    for (let i = 0; i < 20; i++) {
      const x = rnd() * s, y = rnd() * s, r = 8 + rnd() * 24;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(148,118,74,0.12)');
        g.addColorStop(1, 'rgba(148,118,74,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.colorSpace = THREE.SRGBColorSpace;

  const height = makeRawCanvas(S, (ctx, s) => {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, s, s);
    // Trowel undulation (soft blobs)
    for (let i = 0; i < 200; i++) {
      const x = rnd() * s, y = rnd() * s, r = 8 + rnd() * 24;
      const v = 100 + rnd() * 100;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0.40)`);
        g.addColorStop(1, `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Hairline crack depressions
    for (let i = 0; i < 18; i++) {
      let x = rnd() * s, y = rnd() * s;
      ctx.strokeStyle = 'rgba(22,22,22,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 22;
        y += (rnd() - 0.5) * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });

  _plasterCache = { map: mapTex, normalMap: heightToNormal(height, 1.2) };
  return _plasterCache;
}

// ---------------------------------------------------------------------------
// Sprite / decal textures
// ---------------------------------------------------------------------------

let _grassTuftCache = null;

/**
 * Alpha billboard sprite for individual grass tufts.
 * 64×64, curved quadraticCurveTo blades (not straight lines).
 * Hues shifted toward PALETTE.grassMid / grassDeep.
 * @param {number} [blades=18]
 * @returns {THREE.CanvasTexture}
 */
export function grassTuftTexture(blades = 18) {
  if (_grassTuftCache) return _grassTuftCache;
  seedReset(8);

  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  for (let i = 0; i < blades; i++) {
    const x = 8 + rnd() * 48;
    const sway = (rnd() - 0.5) * 14;
    const h = 26 + rnd() * 30;
    // Prairie green: root dark, tip lighter/more gold. Strokes are OPAQUE and
    // wide: canvas2D stores premultiplied alpha, so thin/translucent strokes
    // leave mostly low-alpha edge texels whose RGB samples near-black in WebGL
    // — the tufts rendered as black spikes until this was fixed.
    // Dry prairie: more yellow/ochre tips, darker olive roots (not neon)
    const gr = Math.round(110 + rnd() * 55);
    const grad = ctx.createLinearGradient(x, 64, x + sway, 64 - h);
    grad.addColorStop(0, `rgb(${Math.round(gr * 0.62)},${Math.round(gr * 0.68)},${Math.round(gr * 0.22)})`);
    grad.addColorStop(1, `rgb(${Math.round(gr * 0.92)},${gr},${Math.round(gr * 0.38)})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.6 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 64);
    // quadraticCurveTo for natural curve — no straight blades
    ctx.quadraticCurveTo(x + sway * 0.4, 64 - h * 0.6, x + sway, 64 - h);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _grassTuftCache = tex;
  return tex;
}

let _cloudCache = null;

/**
 * Soft radial-gradient cloud sprite, 256×256 RGBA.
 * Keyed to PALETTE.cloud [250,248,240] / cloudShadow [215,215,225].
 * @param {number} [puffs=14]
 * @param {number} [spread=0.5]
 * @returns {THREE.CanvasTexture}
 */
export function cloudTexture(puffs = 14, spread = 0.5) {
  if (_cloudCache) return _cloudCache;
  seedReset(9);

  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  // Soft shadow underside first
  for (let i = 0; i < Math.ceil(puffs * 0.4); i++) {
    const x = S * (0.5 - spread / 2) + rnd() * S * spread;
    const y = S * 0.52 + rnd() * S * 0.18;
    const r = S * 0.08 + rnd() * S * 0.10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(215,215,225,0.30)');
    g.addColorStop(1, 'rgba(215,215,225,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bright puffs
  for (let i = 0; i < puffs; i++) {
    const x = S * (0.5 - spread / 2) + rnd() * S * spread;
    const y = S * 0.35 + rnd() * S * 0.28;
    const r = S * 0.10 + rnd() * S * 0.14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(250,248,240,0.55)');
    g.addColorStop(1, 'rgba(250,248,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _cloudCache = tex;
  return tex;
}

let _radialGlowCache = null;

/**
 * Soft radial white disc, 128×128.
 * Additive-blended light-pool decal (lantern / campfire glow on the ground).
 * @returns {THREE.CanvasTexture}
 */
export function radialGlowTexture() {
  if (_radialGlowCache) return _radialGlowCache;

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.34)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _radialGlowCache = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Water normal maps — dual-scroll for animated river/lake surface
// ---------------------------------------------------------------------------

let _waterNormalCache = null;

/**
 * Two differently-scaled blobby tangent-space normal maps for the water
 * shader.  Scrolled against each other at different speeds to produce
 * continuous non-repeating ripple.  NoColorSpace (not gamma-expanded).
 * @returns {[THREE.CanvasTexture, THREE.CanvasTexture]}
 */
export function waterNormalMaps() {
  if (_waterNormalCache) return _waterNormalCache;
  seedReset(10);

  const blobField = (count, rMin, rMax) =>
    makeRawCanvas(256, (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < count; i++) {
        const x = rnd() * s, y = rnd() * s;
        const r = rMin + rnd() * (rMax - rMin);
        const v = 70 + rnd() * 140;
        drawWrapped(ctx, s, (ox, oy) => {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0.55)`);
          g.addColorStop(1, `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });

  // Coarse blobs for primary slow-scroll, fine blobs for fast-scroll shimmer
  _waterNormalCache = [
    heightToNormal(blobField(220, 10, 34), 3.0),
    heightToNormal(blobField(420, 5, 16), 3.4),
  ];
  return _waterNormalCache;
}

// ---------------------------------------------------------------------------
// Macro noise — large-blob tiling-break texture (NoColorSpace)
// ---------------------------------------------------------------------------

let _macroNoiseCache = null;

/**
 * 256×256 large-blob noise used in terrain shaders to break up repeating
 * texture tiling at long view distances.  Sampled at ~80u period in the
 * splat shader.  NoColorSpace.
 * @returns {THREE.CanvasTexture}
 */
export function macroNoiseTexture() {
  if (_macroNoiseCache) return _macroNoiseCache;
  seedReset(11);

  const height = makeRawCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) {
      const x = rnd() * s, y = rnd() * s, r = 18 + rnd() * 46;
      const v = 40 + rnd() * 175;
      drawWrapped(ctx, s, (ox, oy) => {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0.30)`);
        g.addColorStop(1, `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });

  const tex = new THREE.CanvasTexture(height);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  _macroNoiseCache = tex;
  return tex;
}
