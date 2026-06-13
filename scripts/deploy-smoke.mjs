#!/usr/bin/env node
// Pre-deploy smoke probe. Force-renders the scenes that most often break
// under schema drift (river, hunting, bitter_path) with the exact payload
// shapes that crashed prod on 2026-04-18. Asserts zero JS page errors per
// scene. Runs against any URL — defaults to prod, override with --url=...
//
// Exit 0 = safe to deploy. Exit 1 = DO NOT deploy.
//
// Usage:
//   node scripts/deploy-smoke.mjs                                 # prod
//   node scripts/deploy-smoke.mjs --url=https://preview-xxx.pages.dev
//   node scripts/deploy-smoke.mjs --url=http://localhost:8765
//
// Run time: ~10-15 seconds.

import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }
    return [a, true];
  }),
);
const URL = args.url || "https://trail.osi-cyber.com";
const HEADED = Boolean(args.headed);

console.log(`[deploy-smoke] target: ${URL}`);

const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  serviceWorkers: "block", // always pull fresh, bypass any stale SW cache
});
const page = await ctx.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// Kaplay swallows scene-render throws and renders its blue error overlay
// rather than triggering window.onerror. Capture those via console.error.
const kaplayErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (t.includes("Styled text") || t.includes("unclosed tags") || t.includes("TypeError") || t.includes("is not a function")) {
      kaplayErrors.push(t);
    }
  }
});

// Cache-bust the URL to dodge any CDN/browser staleness. gfx=high pins the 3D
// layer's tier explicitly so the §7 assertion below exercises the real
// bloom/shadow pipeline (and doesn't silently depend on the tier default).
const bust = `?smoke=${Date.now()}&gfx=high`;
await page.goto(URL + "/" + bust, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.evaluate(() => localStorage.clear());

const findings = [];

function assertClean(scene) {
  const p = pageErrors.slice();
  const k = kaplayErrors.slice();
  if (p.length || k.length) {
    findings.push({ scene, pageErrors: p, kaplayErrors: k });
    // Clear per-scene so each check only reports its own spill.
    pageErrors.length = 0;
    kaplayErrors.length = 0;
  }
}

// ── 1. Title boot ────────────────────────────────────────
// Just let the page settle; title renders on page load.
assertClean("title (boot)");

// ── 2. River — numeric ford_difficulty regression pin ──
// ford_difficulty is typed 1|2|3|4|5 per the schema. Pre-4af2434 the scene
// called .toUpperCase() on a number and blue-screened. Render with a real
// numeric value to catch any future regression of that class.
await page.evaluate(() => {
  window.k.go("river", {
    id: "rc_test", name: "Kansas River",
    width_ft: 230, depth_ft_summer: 2, depth_ft_spring: 4,
    ford_difficulty: 5,               // numeric — the actual schema shape
    ferry_available: true, ferry_cost_1848_dollars: 200,
    description: "Smoke test crossing.",
  });
});
await page.waitForTimeout(800);
assertClean("river (ford_difficulty=5 numeric)");

// ── 3. Hunting — styled-text bracket regression pin ────
// Pre-a129b31 the button labels were "[1] 5 rounds" etc., which kaplay's
// styled-text parser treats as an unclosed tag. Rendering the scene forces
// any regression of that pattern (across any scene) into the kaplayErrors
// capture above.
await page.evaluate(() => window.k.go("hunting", {}));
await page.waitForTimeout(500);
assertClean("hunting");

// ── 4. Bitter Path — graphic-tier content warning gate ──
// Content-warning modal must mount without crashing on a freshly-cleared
// localStorage + horror-tier assumptions.
await page.evaluate(() => {
  window.engine.currentBitterPath = {
    title: "The Long Night",
    description: "Smoke test.",
    choices: [
      { label: "Pray, and starve with dignity.", consequences: {} },
      { label: "Travel on. Hope for game.", consequences: {} },
      { label: "Do what the trail demands.", consequences: {} },
    ],
    personality_effects: {}, journal_entry: "smoke",
  };
  window.engine.currentBitterPathMeta = {
    dead_member_name: "Test", dead_member_cause: "exhaustion",
    days_since_death: 2, trigger_variant: "wasting",
  };
  window.k.go("bitter_path", window.engine.currentBitterPath);
});
await page.waitForTimeout(1000);
assertClean("bitter_path (CW modal)");

// ── 5. Landmark — fort-type with trade inventory ───────
// The densest landmark branch. Exercises lib/draw.mjs + HUD propagation.
await page.evaluate(() => {
  window.k.go("landmark", {
    id: "lm_test", name: "Fort Kearney", type: "fort",
    mile_marker: 320, operator_1848: "U.S. Army",
    description: "Smoke test landmark.", diary_quote: "—",
    trade_inventory: [{ item: "flour", price_1848_cents: 400, availability: "common" }],
    services: ["blacksmith"], event_hooks: [],
  });
});
await page.waitForTimeout(500);
assertClean("landmark (fort)");

// ── 6. No-keyboard tap reachability (IMPROVEMENT_ROADMAP §1.1) ──
// The five mid-run canvas scenes (river/hunting/death/arrival/wipe) used to
// register keyboard handlers only — so a phone visitor hit the first river
// crossing and could never advance (the worst bounce point). Every actionable
// button must now carry a kaplay area() so onClick fires for mouse + touch.
// Assert each scene mounts at least one clickable (area) GameObj. Seed a
// minimal signed state so scenes that read supplies render their buttons.
// k.get("area") is the component query — k.go defers the switch one frame, so
// go + wait + query are split across evaluate calls.
const tapScenes = [
  ["river", {
    id: "rc_tap", name: "Tap River", width_ft: 120, depth_ft_summer: 2,
    ford_difficulty: 3, ferry_available: true, ferry_cost_1848_dollars: 200,
    description: "Tap reachability check.",
  }],
  ["hunting", {}],
  ["arrival", {}],
  ["wipe", {}],
  ["death", { name: "Tap", cause: "exhaustion", date: "1848-05-12" }],
];
await page.evaluate(() => {
  window.engine.signedState = {
    state: { supplies: { money: 50000, ammo: 20 }, party: { members: [] }, deaths: [] },
    signature: "smoke",
  };
});
for (const [scene, data] of tapScenes) {
  await page.evaluate(([s, d]) => window.k.go(s, d), [scene, data]);
  await page.waitForTimeout(400);
  const clickable = await page.evaluate(() => {
    const areaObjs = window.k.get ? window.k.get("area") : [];
    return Array.isArray(areaObjs) ? areaObjs.length : 0;
  });
  assertClean(`tap-reachability (${scene})`);
  if (clickable < 1) {
    findings.push({
      scene: `tap-reachability (${scene})`,
      pageErrors: [`scene "${scene}" has 0 clickable (area) objects — unwinnable without a keyboard`],
      kaplayErrors: [],
    });
  }
}

// ── 7. 3D render layer mounts + draws (THREEJS_REBUILD_PLAN R10) ──
// main.js dynamic-imports the 3D layer at end of boot; a failed init lands in
// window.__ERRORS (not a pageerror), so without this section a fully broken 3D
// build would pass the promotion gate silently. Assert: layer ready, no init
// errors, and a forced frame draws real geometry. freezeAt(0) renders
// synchronously and returns {calls, triangles} measured across the full frame.
{
  const threeReady = await page
    .waitForFunction(() => window.__three?.ready === true, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const initErrors = await page.evaluate(
    () => (window.__ERRORS || []).filter((e) => String(e.msg).startsWith("3d-init")).map((e) => e.msg),
  );
  if (!threeReady || initErrors.length) {
    findings.push({
      scene: "3d-layer (boot)",
      pageErrors: threeReady ? initErrors : ["window.__three never became ready", ...initErrors],
      kaplayErrors: [],
    });
  } else {
    const stats = await page.evaluate(() => {
      window.__three.show();
      window.__three.preset("travel");
      const s = window.__three.freezeAt(0);
      window.__three.hide();
      return s;
    });
    assertClean("3d-layer (travel preset render)");
    if (!(stats.triangles > 100)) {
      findings.push({
        scene: "3d-layer (travel preset render)",
        pageErrors: [`3D frame drew only ${stats.triangles} triangles — world did not render`],
        kaplayErrors: [],
      });
    }
  }
}

// ── 8. state→3D adapter wires real play (THREEJS_REBUILD_PLAN status-correction P0/P1) ──
// Sections 1-7 drive __three.preset() directly, so they cannot catch the bug
// where the engine→3D bridge is unwired (canvas mounts but never switches scene
// in real play). Fire the REAL engine stateChange for each world state and
// assert the camera framing actually changed — the path a real player hits.
// camera.fov is a deterministic per-preset fingerprint.
{
  // TRAVEL is the most common world state, so cover it too. camera.fov is a
  // per-preset fingerprint (travel 38 / river 40 / fort 44 / death 36 /
  // hunting 46 / arrival 42 — all distinct).
  const FRAMING = { TRAVEL: 38, RIVER: 40, LANDMARK: 44, DEATH: 36, HUNTING: 46, ARRIVAL: 42 };
  const TRIGGER = {
    RIVER: { width_ft: 320, ford_difficulty: 5 },
    LANDMARK: { type: "natural", name: "Chimney Rock" },
  };
  // Readiness guard: if section 7 found the 3D layer never booted, window.__three
  // is undefined — dereferencing .camera here would crash the whole script with a
  // raw Playwright TypeError, masking section 7's structured boot finding. Probe
  // first and degrade to a clean finding instead.
  const ready = await page.evaluate(() => !!(window.__three && window.__three.ready && window.__three.camera));
  if (!ready) {
    findings.push({
      scene: "3d-layer (state→3D adapter wiring)",
      pageErrors: ["window.__three not ready — adapter wiring unverified (see the 3d-layer boot finding above for the root cause)"],
      kaplayErrors: [],
    });
  } else {
    const got = await page.evaluate(({ framing, trigger }) => {
      const out = {};
      for (const state of Object.keys(framing)) {
        window.engine.emit("stateChange", { from: "TRAVEL", to: state, data: trigger[state] });
        out[state] = {
          fov: Math.round(window.__three.camera.fov),
          visible: document.getElementById("three-canvas").style.display,
        };
      }
      // A river_crossing landmark must fall back to the travel world (fov 38),
      // NOT the fort preset (fov 44) — its landmark model is dry bank dressing
      // and the actual ford is the RIVER state. Regression pin for the dry-ferry bug.
      window.engine.emit("stateChange", { from: "TRAVEL", to: "LANDMARK", data: { type: "river_crossing", name: "Kansas River Crossing" } });
      out.LANDMARK_RIVER = { fov: Math.round(window.__three.camera.fov), visible: document.getElementById("three-canvas").style.display };
      // Non-world state must hide the canvas (2D UI shows over body background).
      window.engine.emit("stateChange", { from: "TRAVEL", to: "EVENT", data: {} });
      out.EVENT = { visible: document.getElementById("three-canvas").style.display };
      window.__three.hide();
      return out;
    }, { framing: FRAMING, trigger: TRIGGER });

    const wiringErrors = [];
    for (const [state, fov] of Object.entries(FRAMING)) {
      if (got[state].fov !== fov) wiringErrors.push(`${state}: camera.fov=${got[state].fov}, expected ${fov} (adapter did not switch preset)`);
      if (got[state].visible !== "block") wiringErrors.push(`${state}: canvas display=${got[state].visible}, expected block`);
    }
    if (got.LANDMARK_RIVER.fov !== 38) wiringErrors.push(`LANDMARK(river_crossing): camera.fov=${got.LANDMARK_RIVER.fov}, expected 38 (must fall back to travel, not mount the dry fort/ferry scene)`);
    if (got.LANDMARK_RIVER.visible !== "block") wiringErrors.push(`LANDMARK(river_crossing): canvas display=${got.LANDMARK_RIVER.visible}, expected block`);
    if (got.EVENT.visible !== "none") wiringErrors.push(`EVENT (non-world): canvas display=${got.EVENT.visible}, expected none`);
    if (wiringErrors.length) {
      findings.push({ scene: "3d-layer (state→3D adapter wiring)", pageErrors: wiringErrors, kaplayErrors: [] });
    }
  }
}

await browser.close();

// ── Report ──────────────────────────────────────────────
if (findings.length === 0) {
  console.log("[deploy-smoke] OK — all scenes rendered clean");
  process.exit(0);
}

console.error("[deploy-smoke] FAILED — scenes threw errors:");
for (const f of findings) {
  console.error(`  ✗ ${f.scene}`);
  for (const e of f.pageErrors) console.error(`      pageerror: ${e}`);
  for (const e of f.kaplayErrors) console.error(`      kaplay:    ${e.slice(0, 200)}`);
}
console.error("");
console.error("DO NOT DEPLOY. Fix the scene(s) above first.");
process.exit(1);
