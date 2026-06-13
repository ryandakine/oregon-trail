// 3D render-layer screenshot loop (THREEJS_REBUILD_PLAN process req #1 + §8).
//
// Boots the real game from a local serve of public/, forces the 3D layer into the
// four hero framings (travel / river crossing / fort / night camp), and writes a
// PNG per shot. Runs with ?gfx=high so the bloom/grade/shadow pipeline actually
// renders even though headless chromium is software-GL (which otherwise forces the
// flat low tier — the review's "harness blind to its own quality bar" finding).
//
// Usage: node scripts/screenshot-3d-loop.mjs            (writes screenshots/3d/*.png)
//        node scripts/screenshot-3d-loop.mjs --headed   (watch it run)
//
// M0 note: all four shots show the SAME placeholder world at different camera +
// lighting presets — the harness is proven; real per-scene content lands in M1–M5.
// The Kaplay canvas is hidden for these pipeline-proof shots; the Kaplay-transparent
// HUD compositing spike happens once travel.js is thinned in M1.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import handler from 'serve-handler';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADED = process.argv.includes('--headed');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'screenshots', '3d');
await mkdir(OUT, { recursive: true });

const server = createServer((req, res) => handler(req, res, { public: PUBLIC }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;
console.log(`serving public/ at ${BASE}`);

const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
// Gate only on FIRST-PARTY failures the 3D layer owns. Third-party noise
// (Plausible blocked, CDN-fallback aborts, favicon 404s) must not flip the
// exit code of a good render.
page.on('requestfailed', (r) => {
  const u = new URL(r.url());
  const firstParty = u.origin === BASE && (
    u.pathname.startsWith('/vendor/three/') || u.pathname.startsWith('/three/')
  );
  if (firstParty) errors.push('reqfailed: ' + u.pathname + ' ' + (r.failure()?.errorText || ''));
});

await page.goto(`${BASE}/?gfx=high`, { waitUntil: 'domcontentloaded' });

// Wait for the 3D layer to be live.
await page.waitForFunction(() => window.__three && window.__three.ready && !!window.engine, { timeout: 20000 });
await page.waitForTimeout(800);

// Hide the Kaplay canvas so we capture the pure 3D pipeline (compositing spike is M1).
await page.evaluate(() => {
  for (const c of document.querySelectorAll('canvas')) {
    if (c.id !== 'three-canvas') c.style.display = 'none';
  }
  window.__three.show();
});

const SHOTS = ['travel', 'river', 'fort', 'night', 'rain', 'snow', 'dust'];
const NAMES = {
  travel: '01-travel', river: '02-river-crossing', fort: '03-fort', night: '04-night-camp',
  rain: '05-travel-rain', snow: '06-travel-snow', dust: '07-dust-storm',
};
const WEATHER = { rain: 'rain', snow: 'snow', dust: 'dust' };

const shotStats = {};
const shotHashes = {};
for (const shot of SHOTS) {
  // freezeAt(0): pin every animation to a fixed phase + render synchronously,
  // so the same code always produces the same pixels (plan §3.1 determinism —
  // a free-running wheel angle would defeat pixel-diff regression).
  shotStats[shot] = await page.evaluate(({ s, weatherMap }) => {
    const t = window.__three;
    const weather = weatherMap[s];
    if (weather) {
      // Weather variants: travel framing + the real storm mood (sky overcast +
      // fog pull + particles, all coupled in setWeather/pose) + a deterministic
      // particle warmup (seeded pool + fixed steps — never wall-clock).
      t.preset('travel');
      t.vfx.reset(7);
      t.setWeather(weather, 1.0);
      t.vfx.simulate(150, 1 / 60);
      return t.freezeAt(0); // pose() applies the coupled overcast + fog
    }
    t.vfx.reset(7);
    t.setWeather('none', 0);
    t.preset(s);
    if (s === 'night') {
      // Warm the ember pool to a reproducible rising state (the live emitter is
      // rate-gated, so a single freeze frame would show no embers).
      t.emitCampEmbers(140, 1 / 60);
    }
    return t.freezeAt(0);
  }, { s: shot, weatherMap: WEATHER });
  await page.waitForTimeout(120); // composer output flush
  const out = path.join(OUT, `${NAMES[shot]}.png`);
  const buf = await page.screenshot({ path: out });
  shotHashes[shot] = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  console.log(`  ✓ ${path.relative(ROOT, out)}  tris=${shotStats[shot].triangles}  ${shotHashes[shot]}`);
}

// Report the 3D layer's own JS errors (the deploy-smoke promotion gate cares).
const layerErrors = await page.evaluate(() => (window.__ERRORS || []).map((e) => e.msg || JSON.stringify(e)));
const gfx = await page.evaluate(() => window.__three.gfx);

// Oracle: every shot drew real geometry, and the four framings are DISTINCT —
// four identical (or black) frames must fail even if no JS error fired.
const allDrew = SHOTS.every((s) => shotStats[s].triangles > 100);
const distinct = new Set(Object.values(shotHashes)).size === SHOTS.length;

console.log(`\ntier=${gfx}`);
console.log(`page errors: ${errors.length}`, errors.slice(0, 8));
console.log(`window.__ERRORS: ${layerErrors.length}`, layerErrors.slice(0, 8));
if (!allDrew) console.log('FAIL: a shot drew <100 triangles (empty world?)');
if (!distinct) console.log('FAIL: shots are not pixel-distinct (presets not applying?)');

await browser.close();
server.close();

const ok = errors.length === 0 && layerErrors.length === 0 && allDrew && distinct;
console.log(ok ? '\nM0 screenshot loop: PASS' : '\nM0 screenshot loop: ISSUES (see above)');
process.exit(ok ? 0 : 1);
