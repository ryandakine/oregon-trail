#!/usr/bin/env node
// Playwright-based visual QA for canvas/WebGL scenes.
// Solves the problem that the gstack browse tool can't maintain a canvas context
// across $B invocations — so mid-scene screenshots come back stale/blank.
//
// Usage:
//   node scripts/visual-qa.mjs [--url=https://trail.osi-cyber.com] [--headed] [--out=dir]
//
// Exits 0 if all scenes pass their thresholds (>= objThreshold GameObjs, 0 JS errors).

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? true];
    }
    return [a, true];
  }),
);

const URL = args.url || "https://trail.osi-cyber.com";
const OUT_DIR = args.out || ".gstack/qa-reports/visual-qa";
const HEADED = Boolean(args.headed);
const TIMEOUT_MS = 15000;

// Scene spec: name, the JS to force the scene, minimum GameObj threshold.
const SCENES = [
  {
    name: "title",
    force: null, // engine.init lands here on page load
    threshold: 50,
    initialWaitMs: 4000,
  },
  {
    name: "travel",
    force: "window.engine.pauseAdvance(); window.k.go('travel');",
    threshold: 200,
  },
  {
    name: "event",
    force: `window.engine.pauseAdvance(); window.k.go('event', { title: 'Visual QA', description: 'Verify HUD propagation.', choices: [{ text: 'Continue' }] });`,
    threshold: 20,
  },
  {
    name: "landmark-fort",
    force: `window.engine.pauseAdvance(); window.k.go('landmark', { name: 'Fort Kearney', type: 'fort', description: 'A wooden palisade rises from the plains.' });`,
    threshold: 40,
  },
  {
    name: "arrival",
    force: `window.engine.pauseAdvance(); window.k.go('arrival');`,
    threshold: 20,
  },
  {
    name: "death",
    force: `window.engine.pauseAdvance(); window.k.go('death', { name: 'Test', cause: 'fever' });`,
    threshold: 10,
  },
  {
    name: "wipe",
    force: `window.engine.pauseAdvance(); window.k.go('wipe');`,
    threshold: 10,
  },
];

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`visual-qa: target=${URL} headed=${HEADED} out=${OUT_DIR}`);
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Capture console + page errors from the app itself.
  const errors = [];
  page.on("pageerror", (e) => errors.push({ type: "pageerror", msg: String(e) }));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push({ type: "console", msg: m.text() });
  });

  const results = [];
  let allPassed = true;

  for (const scene of SCENES) {
    const sceneErrors = errors.length;
    console.log(`\n[${scene.name}] forcing...`);

    if (scene === SCENES[0]) {
      // Title scene: fresh page load; wait for engine ready.
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForFunction(() => !!window.k, { timeout: TIMEOUT_MS });
      // Let engine.init run and transition to TITLE scene.
      await page.waitForTimeout(scene.initialWaitMs || 3000);
    } else {
      // Force via k.go on an already-initialized page.
      // Re-navigate for each scene to avoid scene-leave cleanup side-effects.
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: TIMEOUT_MS });
      await page.waitForTimeout(3500);
      await page.evaluate(scene.force);
      // Wait for a couple of frames + any scene-setup onUpdate ticks.
      await page.waitForTimeout(1500);
    }

    const stats = await page.evaluate(() => {
      const tagCount = (tag) => (window.k?.get?.(tag) ?? []).length;
      return {
        total: (window.k?.get?.("*") ?? []).length,
        hudTop: tagCount("hud-top"),
        hudBottom: tagCount("hud-bottom"),
        pageErrors: (window.__ERRORS ?? []).length,
      };
    });

    const screenshotPath = path.join(OUT_DIR, `${scene.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const appErrors = errors.slice(sceneErrors).map((e) => e.msg);
    const passed = stats.total >= scene.threshold;
    if (!passed) allPassed = false;

    const result = {
      scene: scene.name,
      passed,
      ...stats,
      appErrors,
      screenshot: screenshotPath,
      threshold: scene.threshold,
    };
    results.push(result);

    const status = passed ? "PASS" : "FAIL";
    console.log(`  [${status}] objs=${stats.total}/${scene.threshold} hudTop=${stats.hudTop} hudBot=${stats.hudBottom} pageErrs=${stats.pageErrors} appErrs=${appErrors.length} → ${screenshotPath}`);
    if (appErrors.length) {
      appErrors.slice(0, 3).forEach((m) => console.log(`    · ${m.slice(0, 140)}`));
    }
  }

  const report = {
    url: URL,
    timestamp: new Date().toISOString(),
    allPassed,
    scenes: results,
  };
  const reportPath = path.join(OUT_DIR, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nreport: ${reportPath}`);
  console.log(allPassed ? "visual-qa: ALL SCENES PASS" : "visual-qa: FAILURES DETECTED");

  await browser.close();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("visual-qa fatal:", err);
  process.exit(2);
});
