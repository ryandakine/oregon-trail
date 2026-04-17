# Oregon Trail Kaplay — Blockers Plan

**Scope:** The 5 critical eng-phase blockers from the autoplan review of `GRAPHICS_PROMPTS.md`. Ship a working sprite pipeline with ONE asset (wagon) before generating any more art.

**Branch:** `kaplay-rebuild` (current)
**Base commit:** `27bcb89`
**Effort (CC+gstack):** ~90-120 min end-to-end (revised after eng review)

---

## ⚠️ Eng Review Results (Claude subagent, 2026-04-16)

**Plan does not ship as-is.** 4 CRITICAL bugs found. Revisions applied below, marked `[Rev1]`.

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| **C1** | Critical | Palette validator ignores PNG scanline filters — every PNG fails 100% | **FIX**: vendor tiny pure-JS PNG decoder OR add `pngjs` devDep |
| **C2** | Critical | `k.loadProgress()` polling is antipattern | **FIX**: use `k.onLoad()` for handoff, poll only for visual bar |
| **C3** | Critical | `k.getSprite()` returns asset object not boolean | **FIX**: track loaded state in Set, flip in loadSprite .then() |
| **C4** | Critical | `loadSprite.catch()` is fire-and-forget race | **FIX**: `Promise.allSettled` secondary done flag |
| **H1** | High | Validator path-traversal risk if manifest has `../` | **FIX**: `resolve().startsWith(ASSETS_DIR)` guard |
| **H2** | High | Plan is one commit, should be 5 (bisect) | **FIX**: explicit "one commit per blocker" |
| **H3** | High | SW ART_ASSETS drift — manual version bump will fail | **FIX**: validator asserts ART_ASSETS ≡ ASSETS |
| **H4** | High | `_placeholder` loaded outside Tier 1 tracking | **FIX**: add to manifest Tier 1 |
| **H5** | High | No tests for validator scripts | **FIX**: add `node --test` fixtures with planted bugs |
| **M1** | Medium | 5% palette tolerance too loose | **FIX**: absolute count (max 2 off-palette) |
| **M4** | Medium | `engine._initialized` idempotency leak | **FIX**: move guard inside `engine.init()` |
| **M5** | Medium | Pixel Lab 64x48 preset may not exist | **FIX**: Aseprite/GIMP fallback |
| **M6** | Medium | **Canvas 640×480 vs 640×360 undecided** | **🚨 PRE-B1 DECISION REQUIRED** |
| **L3** | Low | Wagon should be Tier 2 (not blocking title) | **FIX**: `tier: 2` |

Remaining (non-critical): M2 (unpkg outage mitigation), M3 (nav-during-load test), L1 (AI prompt downscale), L2 (validator runtime — fine).

### Codex eng voice: COMPLETE — 2 additional CRITICAL findings not caught by Claude subagent

| ID | Severity | Finding | Verified against |
|----|----------|---------|------------------|
| **CX1** | **Critical** 🚨 | **Asset path contract wrong** — plan writes to repo-root `assets/` but `public/` is what's served. Root-level `assets/` is "source art, not served directly" per `CLAUDE.md:78`. Wagon at `/assets/sprites/wagon.png` → 404. Must use `public/assets/sprites/wagon.png` (which already contains `_placeholder.png`). | `CLAUDE.md:78,108`, `public/assets/_placeholder.png` exists |
| **CX2** | **Critical** 🚨 | **Blank first-paint still broken** — plan does `await Promise.all([sceneModule imports])` BEFORE `k.go("loading")`. On 4G, users stare at blank page while 16 scene JS files download before loading screen appears. | `BLOCKERS_PLAN.md:145,155`, `public/main.js:46-70` |
| **CX3** | High | **`node --check public/assets.js` will fail** — no `"type": "module"` in `package.json`. Node treats `.js` as CJS, plan's `export` syntax errors. Either rename to `.mjs` OR add type=module. | `package.json:1`, Node docs |
| **CX4** | High | **SW still stale-first for code changes** — only bumping cache on asset version change, code updates (main.js, scenes) still served from stale cache indefinitely. | `public/sw.js:60-69` |
| **CX5** | Medium | **Test tolerance mismatch** — code computes `% of unique colors`, tests reason `% of pixels`. Plan's "1 pink pixel → fail" test would pass the implementation at ~3% unique-color drift. | `BLOCKERS_PLAN.md:458-462` vs test at 478-479 |
| **CX6** | Medium | **SW cache poisoning risk** — cache-first + background revalidate can persist malformed assets. No integrity check. | `public/sw.js:60-69` |
| **Verified** | — | Claude's C1 PNG filter bug confirmed independently by Codex (#7) | Both voices |

### Combined Severity (7 critical, 9 high, 8 medium)

**🚨 BLOCKER-BEFORE-BLOCKERS (must resolve before any commits):**

1. **CX1** — Asset path: change all `/assets/...` references in plan to `public/assets/...` for disk, but keep `/assets/...` URL paths (served at root of `public/`). Validator reads `public/assets/`.
2. **M6** — Canvas resolution: 640×480 (CLAUDE.md + current `public/main.js:4-5`) vs 640×360 (memory `reference_oregon_trail_rendering.md`). Per "don't flip memory mid-session" memory, evidence strongly favors 640×480 (live code + CLAUDE.md). Decision: **adopt 640×480, update memory note to archive the 640×360 note as superseded**.
3. **CX3** — ESM contract: simplest fix is rename `public/assets.js` → `public/assets.mjs` (browsers accept either extension; `<script type="module">` doesn't care). Or add `"type": "module"` to `package.json` — but that changes how `scripts/*.js` are interpreted (possible regression in `scripts/calibrate.js`). **Decision: use `.mjs` extension.**

Once those 3 are resolved, the plan becomes implementable with the fixes noted.

### Plan Status: **NOT SHIP-READY as written. Full rewrite required.**

Recommended next step: regenerate BLOCKERS_PLAN.md v2 incorporating all 24 findings, OR simplify scope (drop palette validator v1, ship B0 + B1 + B5 only as a POC, defer validators and SW changes to a follow-up).



---

## TL;DR

Build the asset pipeline and validate it with `wagon.png`. Nothing else ships until this lands and we see the sprite render correctly on mobile + desktop.

**Each blocker = one commit (per user memory `feedback_smaller_commits.md`).** 5 commits total for easy bisect + granular revert.

| # | Blocker | File(s) | Effort [Rev1] |
|---|---------|---------|--------|
| **B0** | 🚨 **Resolve canvas 640×480 vs 640×360** | CLAUDE.md, memory note | 5 min, user input |
| B1 | Canonical asset manifest | `public/assets.js` (NEW) | 10 min |
| B2 | Preload-gated loader (`onLoad` + progress bar) | `public/main.js`, `public/scenes/loading.js`, `public/engine.js` (idempotency) | 20 min |
| B4a | Validator: dimensions + alpha + path-traversal guard | `scripts/validate-assets.mjs` (NEW) + tests | 15 min |
| B4b | Validator: palette conformance (real PNG decoder) | `scripts/validate-palette.mjs` (NEW) + tests + devDep `pngjs` | 25 min |
| B3 | SW hash cache + ART_ASSETS ≡ ASSETS assertion | `public/sw.js`, extend `validate-assets.mjs` | 15 min |
| B5 | POC: integrate `wagon.png` + fallback (Tier 2) | `assets/sprites/wagon.png` (NEW), `public/scenes/travel.js` | 15 min |

Total: ~105-120 min. Strict sequential. Each blocker commits + tests before the next starts.

---

## Sequencing (strict order)

```
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌──────┐
│   B1   │──▶│   B2   │──▶│  B4a/b │──▶│   B3   │──▶│  B5  │
│Manifest│   │ Loader │   │Validate│   │  SW    │   │ POC  │
└────────┘   └────────┘   └────────┘   └────────┘   └──────┘
   10m         15m          20m          10m          10m
```

Why this order:
- B1 manifest is the contract every other blocker depends on.
- B2 loader needs manifest to know what to load.
- B4 validators need manifest to know expected dimensions.
- B3 SW precache list is derived from manifest.
- B5 POC exercises the whole chain.

---

## B1 — Canonical Asset Manifest

### Problem
`public/main.js:45-70` has zero `loadSprite` calls. `GRAPHICS_PROMPTS.md` says "filenames must match `public/main.js` expectations" but `main.js` expectations = vacuum. No single source of truth for `runtime_id` → `path` → dimensions → animation config → slice9 insets.

### Fix
Create `public/assets.js` as an ES module that exports an `ASSETS` object. Every sprite gets one entry. Every other blocker reads from this file.

### File: `public/assets.js` (NEW)

```javascript
// public/assets.js — Canonical asset manifest.
// Single source of truth for name → path → dimensions → Kaplay config.
// Every asset added to assets/ MUST have an entry here.

export const ASSET_VERSION = 1;  // bump when paths or keys change; drives SW cache key.

export const ASSETS = {
  // ── Tier 1: blocking preload (required for title + first scene) ──
  wagon: {
    path: "sprites/wagon.png",
    size: [64, 48],
    tier: 1,
  },

  // ── Tier 2: background-load after title renders ──
  // (added as art ships; currently empty)

  // ── Tier 3: lazy-load on-demand per scene ──
  // (added as art ships; currently empty)
};

// Helper: group assets by load tier
export function assetsByTier(tier) {
  return Object.entries(ASSETS)
    .filter(([, meta]) => meta.tier === tier)
    .map(([key, meta]) => ({ key, ...meta }));
}

// Helper: manifest of all paths (for SW precache + validators)
export function allAssetPaths() {
  return Object.values(ASSETS).map((m) => `/assets/${m.path}`);
}
```

### Config schema (when we expand beyond `wagon`)

Each entry supports (all optional except `path` + `size`):
- `path`: relative to `assets/` root — e.g., `sprites/wagon.png`
- `size`: `[width, height]` in pixels — validator checks PNG matches
- `sliceX`, `sliceY`: for animation strips, number of frames per row/col
- `anims`: `{ walk: { from: 0, to: 3, loop: true, speed: 8 } }`
- `slice9`: 9-slice insets `{ left, right, top, bottom }` in pixels
- `tier`: `1` (blocking), `2` (background), `3` (lazy)
- `anchor`: `"center"` | `"top"` | `"bot"` etc., default `"center"`

### Test
- Import fails → syntax error caught by Node immediately (`node --check public/assets.js`)
- `allAssetPaths()` returns `["/assets/sprites/wagon.png"]` initially
- `assetsByTier(1)` returns `[{key: "wagon", path: "sprites/wagon.png", size: [64,48], tier: 1}]`

### Why / how to apply
Why: Every AI-generated asset will have a filename. If the doc and code disagree, 60 PNGs sit in the repo unused. One file solves this.
How to apply: Any PR that adds a PNG to `assets/` must also add an entry here. Validator in B4 enforces this (PNG without manifest entry = fail).

---

## B2 — Preload-Gated Loader + Progress UI

### Problem
`public/main.js:70-71` runs `k.go("loading", {})` then `setTimeout(() => engine.init(), 100)`. `loading.js:24-29` has a 2000ms hardcoded fallback. Neither is tied to actual asset load progress. When a 1MB parallax BG starts loading on 4G, the title scene renders before the sprite is ready → blank canvas flash.

### Fix

#### Change 1: `public/main.js`

Replace lines 46-71 with:

```javascript
import { ASSETS, assetsByTier } from "./assets.js";

// ── Load tier 1 (blocking) assets BEFORE engine init ──
k.loadRoot("/assets/");
for (const { key, path, sliceX, sliceY, anims, slice9 } of assetsByTier(1)) {
  const opts = {};
  if (sliceX) opts.sliceX = sliceX;
  if (sliceY) opts.sliceY = sliceY;
  if (anims) opts.anims = anims;
  if (slice9) opts.slice9 = slice9;
  k.loadSprite(key, path, opts).catch((err) => {
    console.warn(`[assets] failed to load ${key} (${path}):`, err.message);
    // Fall back to _placeholder
  });
}
// Universal placeholder — magenta border so QA catches missing assets
k.loadSprite("_placeholder", "_placeholder.png").catch(() => {});

// ── Load scene modules in parallel with asset load ──
const sceneModules = await Promise.all([
  import("./scenes/loading.js"),
  // ... existing scene imports
]);

for (const mod of sceneModules) {
  mod.default(k, engine);
}

// ── Start at loading scene; it waits for assets + fires engine.init() ──
k.go("loading", {});
```

Remove the `setTimeout(() => engine.init(), 100)` — the loading scene now owns the handoff.

#### Change 2: `public/scenes/loading.js`

Replace entire file with:

```javascript
export default function register(k, engine) {
  k.scene("loading", () => {
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(0, 0, 0)]);

    const loadText = k.add([
      k.text("LOADING", { size: 28 }),
      k.pos(320, 220),
      k.anchor("center"),
      k.color(245, 230, 200),
    ]);

    // Progress bar (rendered with primitives — no sprite dependency)
    const barW = 320;
    const barX = 320 - barW / 2;
    const barY = 260;
    k.add([k.rect(barW, 12), k.pos(barX, barY), k.color(60, 60, 60), k.outline(1, k.rgb(120, 120, 120))]);
    const fill = k.add([k.rect(0, 12), k.pos(barX, barY), k.color(212, 160, 23)]);

    // Animated dots
    let dots = 0;
    k.loop(0.4, () => {
      dots = (dots + 1) % 4;
      loadText.text = "LOADING" + ".".repeat(dots);
    });

    // Poll Kaplay's load progress. Kaplay exposes k.loadProgress() (0..1).
    const progressTimer = k.onUpdate(() => {
      const p = typeof k.loadProgress === "function" ? k.loadProgress() : 1;
      fill.width = barW * p;
      if (p >= 1 && !engine._initialized) {
        engine._initialized = true;
        progressTimer.cancel();
        // Give one frame for final paint, then hand off
        k.wait(0.1, () => engine.init());
      }
    });

    // Safety timeout: if Kaplay never reports progress (older version), fall through at 3s
    k.wait(3.0, () => {
      if (!engine._initialized) {
        console.warn("[loading] progress timeout, forcing init");
        engine._initialized = true;
        progressTimer.cancel();
        engine.init();
      }
    });
  });
}
```

### Test
1. Open browser DevTools → Network → Throttle to "Slow 3G"
2. Hard refresh
3. Expected: LOADING screen with filling bar for ~1-5s, then title appears
4. Check console — no `loadProgress is not a function` errors
5. On fast connection: still briefly shows LOADING (not blank flash)

### Why / how to apply
Why: Blank canvas flash on mobile = lost players at 3 seconds. The safety timeout (3s) is the only thing protecting us if Kaplay's API changes.
How to apply: Any new asset added to Tier 1 WILL slow initial load — keep Tier 1 under 200KB total. B4 validator can enforce this.

---

## B4a — Asset Validator (dimensions + alpha + manifest coverage)

### Problem
When an artist/AI agent drops `wagon.png` into `assets/sprites/`, no check that:
- Filename matches manifest entry
- Actual PNG dimensions match `size` in manifest
- PNG has alpha channel
- PNG is actually valid

Silent shipping of broken assets = scene crash at runtime.

### Fix

Create `scripts/validate-assets.mjs`. Uses Node's built-in `zlib` + `crypto` + `fs` — no npm deps. Parses PNG header manually (first 24 bytes give us dimensions + color type).

### File: `scripts/validate-assets.mjs` (NEW)

```javascript
#!/usr/bin/env node
// scripts/validate-assets.mjs — Validates assets/ PNGs match the manifest.
// Runs in CI and locally before commit. Zero npm deps.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const ASSETS_DIR = join(ROOT, "assets");
const MANIFEST = await import(join(ROOT, "public", "assets.js"));

const errors = [];

// 1. Walk assets/ and collect all PNG paths (relative to assets/)
function walk(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (entry.endsWith(".png")) out.push(rel);
  }
  return out;
}

const pngFiles = walk(ASSETS_DIR).filter((p) => !p.startsWith("_"));

// 2. Every PNG must have a manifest entry
const manifestPaths = Object.values(MANIFEST.ASSETS).map((m) => m.path);
for (const png of pngFiles) {
  if (!manifestPaths.includes(png)) {
    errors.push(`UNLISTED: ${png} is not in public/assets.js ASSETS`);
  }
}

// 3. Every manifest entry must point to an existing PNG with correct dimensions + alpha
for (const [key, meta] of Object.entries(MANIFEST.ASSETS)) {
  const full = join(ASSETS_DIR, meta.path);
  let buf;
  try {
    buf = readFileSync(full);
  } catch {
    errors.push(`MISSING: ${key} → ${meta.path} (file does not exist)`);
    continue;
  }

  // PNG signature check: first 8 bytes = 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    errors.push(`INVALID_PNG: ${key} → ${meta.path} (bad signature)`);
    continue;
  }

  // IHDR chunk starts at byte 8. Bytes 16-19 = width, 20-23 = height (big-endian uint32).
  // Byte 25 = color type (2 = RGB, 6 = RGBA, 3 = indexed, 4 = grayscale+alpha)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  const [expectedW, expectedH] = meta.size;

  if (width !== expectedW || height !== expectedH) {
    errors.push(
      `DIM_MISMATCH: ${key} → ${meta.path} is ${width}x${height}, expected ${expectedW}x${expectedH}`,
    );
  }

  const hasAlpha = colorType === 4 || colorType === 6 || colorType === 3;
  if (!hasAlpha) {
    errors.push(
      `NO_ALPHA: ${key} → ${meta.path} color type ${colorType} (need alpha: 3/4/6)`,
    );
  }
}

// 4. Report
if (errors.length === 0) {
  console.log(`✓ ${Object.keys(MANIFEST.ASSETS).length} assets validated.`);
  process.exit(0);
} else {
  console.error(`✗ ${errors.length} asset errors:\n${errors.map((e) => "  " + e).join("\n")}`);
  process.exit(1);
}
```

### Test
1. `node scripts/validate-assets.mjs` before `wagon.png` exists → exits 1, prints `MISSING: wagon → sprites/wagon.png`
2. After dropping a valid `wagon.png` → exits 0, prints `✓ 1 assets validated.`
3. Manually drop a 32x32 PNG named `wagon.png` → exits 1, prints `DIM_MISMATCH: wagon ... is 32x32, expected 64x48`

### Why / how to apply
Why: Silent failure is worse than loud failure. Better to fail build than ship a broken game.
How to apply: Add to pre-commit hook (optional) and CI (see B3 / deploy notes).

---

## B4b — Palette Validator

### Problem
`assets/palette.hex` defines the 32-color palette. Nothing enforces it. An AI-generated asset with off-palette colors (oversaturated pink, random blue) ships and looks inconsistent.

### Fix

`scripts/validate-palette.mjs` reads every PNG, extracts unique colors from the pixel buffer, and asserts every color is in `palette.hex` (with a 5% tolerance for AA edge bleed).

Uses the same header parsing as B4a. For the pixel scan, we need zlib inflate — Node built-in.

### File: `scripts/validate-palette.mjs` (NEW)

```javascript
#!/usr/bin/env node
// scripts/validate-palette.mjs — Enforces the 32-color palette across all art.
// Zero npm deps. Uses Node zlib.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const ASSETS_DIR = join(ROOT, "assets");
const PALETTE_FILE = join(ASSETS_DIR, "palette.hex");

// Parse palette.hex → Set of "rrggbb" lowercase hex strings
const PALETTE = new Set(
  readFileSync(PALETTE_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => /^[0-9a-f]{6}$/.test(l)),
);

const TOLERANCE_PCT = 5; // allow up to 5% of unique colors to be off-palette (AA bleed)
const errors = [];

function walk(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (entry.endsWith(".png") && !entry.startsWith("_")) out.push(rel);
  }
  return out;
}

// Minimal PNG pixel extractor. Returns Set of "rrggbb".
// Supports color types 2 (RGB), 3 (indexed), 6 (RGBA). Ignores alpha=0 pixels.
function extractColors(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];

  // Concatenate all IDAT chunks
  let idatData = Buffer.alloc(0);
  let palette = null;
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === "IDAT") idatData = Buffer.concat([idatData, data]);
    if (type === "PLTE") palette = data;
    if (type === "IEND") break;
    offset += 12 + len;
  }

  const inflated = inflateSync(idatData);
  const colors = new Set();

  // PNG uses per-scanline filtering. For validation we'll do a coarse sample —
  // every Nth pixel across every row, unfiltered bytes only. Good enough to
  // catch off-palette introductions.
  const bytesPerPixel = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  const stride = 1 + width * bytesPerPixel; // 1 byte filter + pixels per row
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 4) {
      // sample every 4th pixel
      const px = 1 + y * stride + x * bytesPerPixel;
      let r, g, b, a = 255;
      if (colorType === 2) {
        r = inflated[px]; g = inflated[px + 1]; b = inflated[px + 2];
      } else if (colorType === 6) {
        r = inflated[px]; g = inflated[px + 1]; b = inflated[px + 2]; a = inflated[px + 3];
      } else if (colorType === 3 && palette) {
        const idx = inflated[px] * 3;
        r = palette[idx]; g = palette[idx + 1]; b = palette[idx + 2];
      } else continue;
      if (a === 0) continue; // skip fully-transparent pixels
      const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
      colors.add(hex);
    }
  }
  return colors;
}

for (const rel of walk(ASSETS_DIR)) {
  let buf;
  try {
    buf = readFileSync(join(ASSETS_DIR, rel));
  } catch {
    continue;
  }
  if (buf[0] !== 0x89 || buf[1] !== 0x50) continue;

  let colors;
  try {
    colors = extractColors(buf);
  } catch (err) {
    errors.push(`PARSE_FAIL: ${rel}: ${err.message}`);
    continue;
  }

  const offPalette = [...colors].filter((c) => !PALETTE.has(c));
  const pct = (offPalette.length / colors.size) * 100;
  if (pct > TOLERANCE_PCT) {
    errors.push(
      `PALETTE_DRIFT: ${rel} has ${offPalette.length}/${colors.size} (${pct.toFixed(1)}%) off-palette colors. First 5: ${offPalette.slice(0, 5).join(", ")}`,
    );
  }
}

if (errors.length === 0) {
  console.log(`✓ palette validated (≤${TOLERANCE_PCT}% drift tolerance)`);
  process.exit(0);
} else {
  console.error(`✗ ${errors.length} palette errors:\n${errors.map((e) => "  " + e).join("\n")}`);
  process.exit(1);
}
```

### Test
1. Paint a 64x48 PNG with only palette colors → exits 0
2. Paint same with one bright pink pixel → exits 1, prints `PALETTE_DRIFT: sprites/wagon.png has 1/X (Y%) off-palette colors`
3. Paint same with 5% of pixels off-palette (anti-aliasing simulation) → exits 0 within tolerance

### Why / how to apply
Why: The single biggest cohesion mechanism for 60 assets from multiple AI tools is a hard palette check.
How to apply: Run before every commit that adds art. Nonzero exit = don't ship.

---

## B3 — Service Worker Hash-Based Cache

### Problem
`public/sw.js:1` has `CACHE_NAME = 'oregon-trail-kaplay-v1'` — never changes. If art ships in a PR, users on the old SW keep getting stale art forever. `STATIC_ASSETS` has no art paths. Runtime-cached art (line 60-69) is cache-first with no revalidation.

### Fix

Two changes:
1. Make `CACHE_NAME` include `ASSET_VERSION` from the manifest — bumps automatically when `assets.js` changes.
2. Add asset paths to the precache list (read at build time... but we have no build step, so hardcode from manifest).

Since we can't `import` in a service worker the same way (SW is a separate worker context), we'll keep the STATIC_ASSETS list hardcoded but add a `ART_ASSETS` array and a version constant. The version constant is the handshake.

### File: `public/sw.js` (EDIT)

Replace lines 1-29 with:

```javascript
// Bumped on every manifest change. Keep in sync with ASSET_VERSION in public/assets.js.
const MANIFEST_VERSION = 1;
const CACHE_NAME = `oregon-trail-kaplay-v2-m${MANIFEST_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/engine.js',
  '/main.js',
  '/assets.js',
  '/html2canvas.min.js',
  '/manifest.json',
  '/fonts/ibm-plex-mono-400.ttf',
  '/fonts/ibm-plex-mono-700.ttf',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/scenes/loading.js',
  '/scenes/title.js',
  '/scenes/profession.js',
  '/scenes/names.js',
  '/scenes/tone.js',
  '/scenes/store.js',
  '/scenes/travel.js',
  '/scenes/event.js',
  '/scenes/landmark.js',
  '/scenes/river.js',
  '/scenes/death.js',
  '/scenes/hunting.js',
  '/scenes/arrival.js',
  '/scenes/wipe.js',
  '/scenes/newspaper.js',
  '/scenes/share.js',
];

// Art assets — paths must match public/assets.js ASSETS entries.
// Precached for offline PWA. Added to when new assets land.
const ART_ASSETS = [
  '/assets/_placeholder.png',
  '/assets/palette.hex',
  '/assets/sprites/wagon.png',  // B5 ships this
];
```

Then update the install handler (line 31-37) to also handle art asset failures gracefully — art files may not exist during the gap between SW deploy and art deploy:

```javascript
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(STATIC_ASSETS);  // static assets are required
      // Art assets are optional — fail softly so missing assets don't break install
      await Promise.allSettled(ART_ASSETS.map((a) => cache.add(a)));
    }).then(() => self.skipWaiting())
  );
});
```

Rest of sw.js stays the same — the activate handler already deletes caches with names that don't match `CACHE_NAME`, which now changes every manifest version.

### Manual Update Protocol (add to CLAUDE.md section 9)

Every PR that adds or renames art MUST:
1. Bump `ASSET_VERSION` in `public/assets.js`
2. Bump `MANIFEST_VERSION` in `public/sw.js` (keep them equal)
3. Add new asset paths to `ART_ASSETS` array in `sw.js`

Scripts from B4 can verify this invariant. Could extend `validate-assets.mjs` to assert `MANIFEST_VERSION === ASSET_VERSION`.

### Test
1. Ship B1-B5, browse site, DevTools → Application → Cache Storage → confirm `oregon-trail-kaplay-v2-m1` holds static + art
2. Bump `ASSET_VERSION` to 2, ship → old cache deleted, new one populates
3. Offline test: disconnect network, reload → game still loads (cache hit)

### Why / how to apply
Why: Stale-art-forever is the #1 PWA failure mode. Hash-based keys are the only reliable fix without a build system.
How to apply: Manual version bump is the trade-off for zero build step. Validator can catch misses.

---

## B5 — POC: `wagon.png` Integration

### Problem
Prove the pipeline works end-to-end with ONE asset before committing to 60. Validate: the AI tool we pick can produce palette-locked correctly-dimensioned PNG, the manifest loads it, the loader gates title on it, it renders in-scene, fallback kicks in if missing.

### Fix

Generate `wagon.png` (64x48, palette-locked, transparent background), drop into `assets/sprites/`, update `travel.js` to render it.

### Generation

Use **Pixel Lab Pro** (per DX phase recommendation — cheapest start, purpose-built).

**Exact prompt (copy-paste):**

```
Covered prairie schooner wagon, side view, 64x48 pixels, SNES pixel art, limited 32-color palette, transparent background. White canvas top with rope rigging, weathered wooden body, two large spoked wooden wheels, tongue pointing left (ox yoke attachment). Mud splatter on the lower body. Warm beige canvas, brown wood tones. 1px dark outline on shadow side only. Dithered shading.

Constraints:
- exactly 64x48 pixels
- transparent background (PNG alpha)
- limited palette, quantize to 32 colors
- pixel-perfect (no anti-aliasing except dithering)
- side view, wagon facing right

Negative: no text, no watermark, no border, no 3D render, no photorealism, no oversaturated neon.
```

Export settings:
- Size: 64x48
- Format: PNG
- Palette: import `/home/ryan/code/oregon-trail/assets/palette.hex` (32 hex codes, one per line)
- Save as: `/home/ryan/code/oregon-trail/assets/sprites/wagon.png`

### Validation
```bash
cd /home/ryan/code/oregon-trail
node scripts/validate-assets.mjs    # should print ✓ 1 assets validated
node scripts/validate-palette.mjs   # should print ✓ palette validated
```

Both must exit 0 before moving to integration.

### Integration: `public/scenes/travel.js` (EDIT)

Current file at lines 87-135 hand-draws the wagon with primitives (rects). Extract that into a fallback helper, then prefer the sprite when loaded.

After line 85 (end of terrain rendering), replace the wagon section with:

```javascript
// ── Wagon (sprite if loaded, primitive fallback) ──
const wagonX = 200;
const wagonY = 320;

if (k.getSprite && k.getSprite("wagon")) {
  // Sprite path — loaded via assets.js manifest
  k.add([
    k.sprite("wagon"),
    k.pos(wagonX, wagonY),
    k.anchor("center"),
    k.z(10),
  ]);
} else {
  // Fallback: hand-drawn primitive (original implementation)
  drawWagonPrimitive(k, wagonX, wagonY);
}
```

And at the bottom of the file, add the helper (moving the existing rect code in):

```javascript
function drawWagonPrimitive(k, cx, cy) {
  // Moved from inline rendering. Keeps the game playable when wagon.png absent.
  // (Preserve existing k.rect / k.color calls from lines ~87-135 verbatim — just wrapped)
  // ...existing primitive wagon code...
}
```

### Test
1. **With wagon.png present**: open site, navigate to travel scene → see pixel wagon sprite, not rectangles
2. **Rename wagon.png to wagon.bak**: refresh site → console warn "failed to load wagon", travel scene still renders with rectangles (fallback)
3. **Mobile test**: open on phone → wagon renders crisp (pixelated), no blurring, not stretched to viewport
4. **4G throttle test**: DevTools → Slow 3G → hard refresh → LOADING screen shows progress bar filling, then title, then travel → wagon visible

### Why / how to apply
Why: One end-to-end working asset proves the pipeline. Then we can scale.
How to apply: This POC also validates the 640x480 vs 640x360 canvas question (Claude DX flag) — wagon at 64x48 in a 640x480 canvas renders at 1/10 height, which is the correct visual scale. If it looks wrong, we know the canvas memory note is the issue, not the asset spec.

---

## Acceptance Gate (all 5 blockers done)

Done = all of these are true:

1. `public/assets.js` exists, exports `ASSETS` + `assetsByTier` + `allAssetPaths`.
2. `public/main.js` loads tier-1 assets via manifest before scene modules import.
3. `public/scenes/loading.js` shows progress bar tied to `k.loadProgress()`, hands off via `engine.init()` only when progress = 1.
4. `scripts/validate-assets.mjs` exists, exits 0 on `wagon.png` present, exits 1 on missing/wrong-size/no-alpha.
5. `scripts/validate-palette.mjs` exists, exits 0 on palette-conformant art, exits 1 on drift > 5%.
6. `public/sw.js` has `MANIFEST_VERSION` tied to `ASSET_VERSION`, bumps `CACHE_NAME` on change, precaches art in `ART_ASSETS` list with `allSettled` fallback.
7. `assets/sprites/wagon.png` exists, 64x48 PNG, palette-conformant, validators exit 0.
8. `public/scenes/travel.js` renders sprite when loaded, falls back to primitives when missing.
9. Manual test: Slow 3G → LOADING → title → travel shows wagon sprite. Pass.
10. Manual test: Rename `wagon.png` → LOADING completes (load failure caught) → travel shows rectangle fallback. Pass.
11. `npx vitest run` → 119 tests pass (worker untouched, smoke check).

---

## Files Changed

| File | Status | Lines |
|---|---|---|
| `public/assets.js` | NEW | ~30 |
| `public/main.js` | EDIT | ~20 changed |
| `public/scenes/loading.js` | REWRITE | ~40 |
| `public/scenes/travel.js` | EDIT | ~30 changed (extract fallback, add sprite path) |
| `public/sw.js` | EDIT | ~15 changed |
| `scripts/validate-assets.mjs` | NEW | ~90 |
| `scripts/validate-palette.mjs` | NEW | ~115 |
| `assets/sprites/wagon.png` | NEW | binary (64x48) |

**Zero npm deps added. Zero new build steps. Complies with CLAUDE.md "no build system for public/" hard-no.**

---

## NOT in scope (deferred)

These items from the autoplan review are deferred to subsequent phases:

- 9-slice documentation for future UI assets (no UI assets yet)
- Animation strip configs in manifest (no strip assets yet — `wagon` is static)
- Spritesheet atlas (defer until 10+ small sprites)
- Mobile touch targets / WCAG contrast audit (no interactive sprites yet — only travel)
- Tone-tier visual differentiation matrix (defer to design phase)
- Mood arc table (defer to design phase)
- Runtime AI horror generation via fal.ai (separate major feature)
- Cultural review for Indigenous art (defer with those assets entirely)
- Marketing UTM funnel instrumentation (separate scope)
- Canvas 640×480 vs 640×360 memory reconciliation (will verify during B5 POC test — if wagon renders at wrong scale, memory was right; otherwise CLAUDE.md wins and we update memory)

---

## Rollback Plan

If B5 POC fails (wagon renders wrong, load hang, SW breaks):
1. `git tag pre-blockers-rollback` (safety anchor)
2. `git revert HEAD~1..HEAD` (undo the blockers commit)
3. Service worker auto-reverts on next page load (cache key changes back)
4. Users see prior primitives-only version — no regression

`assets/_placeholder.png` + primitive fallback means the site never breaks even if art loads fail.

---

## Test Plan Summary

| Test | Type | Pass criterion |
|---|---|---|
| Manifest import | Unit | `node --check public/assets.js` exits 0 |
| Dimensions validator | Integration | Exits 1 on 32x32, exits 0 on 64x48 |
| Palette validator | Integration | Exits 1 on bright pink pixel, exits 0 on palette-locked |
| Load progress | Manual (DevTools Slow 3G) | Progress bar fills 0→100%, then title |
| Fallback | Manual (rename wagon.png) | Travel scene still renders, console warn |
| SW cache bump | Manual | ASSET_VERSION change → DevTools shows new cache name |
| Mobile crisp rendering | Manual (phone browser) | Wagon sprite pixelated, not blurred |
| Worker tests | Integration | `npx vitest run` → 119 passing |
