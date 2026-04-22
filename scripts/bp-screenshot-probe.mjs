// One-shot probe: play horror/farmer/grueling until BITTER_PATH fires,
// screenshot the CW modal + scene body organically, resolve, screenshot outcome.
// Runs against prod. Ephemeral, not committed.
import { chromium } from "playwright";

const URL = "https://trail.osi-cyber.com";
const PARTY = ["Ryan", "Beth", "Carl", "Dana", "Earl"];
const BUY = [
  { item: "food", quantity: 18 },
  { item: "oxen", quantity: 3 },
  { item: "clothing", quantity: 3 },
  { item: "ammo", quantity: 4 },
  { item: "spare_parts", quantity: 2 },
  { item: "medicine", quantity: 2 },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  // Disable service worker caching so the probe always gets fresh river.js
  serviceWorkers: "block",
});
await context.clearCookies();
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message, e.stack));
page.on("console", (msg) => {
  const t = msg.text();
  if (t.includes("unclosed") || t.includes("Styled") || t.includes("Error")) {
    console.error("console:", msg.type(), t);
  }
});
// Hook into kaplay's debug.error / debug.onError to catch silent throws
await page.addInitScript(() => {
  window.__KAPLAY_ERRORS = [];
  const origErr = console.error;
  console.error = (...args) => { window.__KAPLAY_ERRORS.push(args.map(String).join(" ")); origErr.apply(console, args); };
});

// Cache-bust URL so a stale CDN/edge doesn't serve old scripts.
const cacheBust = "?qa=" + Date.now();
await page.goto(URL + "/" + cacheBust, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
await page.waitForTimeout(2500);

// Do NOT pre-ack the CW gate — we want to see it render organically.
await page.evaluate(() => {
  localStorage.clear();
});

await page.evaluate((p) => window.engine.selectProfession(p), "farmer");
await page.waitForTimeout(300);
await page.evaluate((party) => window.engine.submitNames(party[0], party.slice(1)), PARTY);
await page.waitForTimeout(300);
await page.evaluate((t) => window.engine.selectTone(t), "high");
await page.waitForTimeout(1000);
await page.evaluate(async (items) => { await window.engine.purchaseSupplies(items); }, BUY);
await page.waitForTimeout(600);
await page.evaluate(() => window.engine.changePace?.("grueling"));

const SHOTS = ".gstack/qa-reports/screenshots";
let captured = 0;
for (let tick = 0; tick < 400; tick++) {
  const s = await page.evaluate(() => window.engine?.state);
  if (s === "BITTER_PATH") {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/bp-organic-cw.png` });
    console.log(`[tick ${tick}] BITTER_PATH — CW modal screenshotted`);
    // Click Continue (not Skip) to reveal scene body
    await page.evaluate(() => document.getElementById("bp-cw-continue")?.click());
    await page.waitForTimeout(6500); // let typewriter finish
    await page.screenshot({ path: `${SHOTS}/bp-organic-body.png` });
    console.log("[tick ${tick}] scene body with choices screenshotted");
    // Take the taken path (choice 2) — most spectacular outcome
    await page.evaluate(() => window.engine.resolveBitterPath(2));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/bp-organic-outcome.png` });
    console.log("[tick ${tick}] outcome beat screenshotted");
    await page.waitForTimeout(1500);
    captured = 1;
    break;
  } else if (s === "EVENT") {
    await page.evaluate(() => window.engine.makeChoice(0));
    await page.waitForTimeout(800);
  } else if (s === "RIVER") {
    await page.evaluate(() => window.engine.resolveRiver?.("ford"));
    await page.waitForTimeout(800);
  } else if (s === "LANDMARK") {
    await page.evaluate(() => window.engine.resolveLandmark?.("continue"));
    await page.waitForTimeout(800);
  } else if (s === "DEATH") {
    await page.evaluate(() => window.engine.advance?.());
    await page.waitForTimeout(500);
  } else if (s === "TRAVEL") {
    await page.evaluate(() => window.engine.advance());
    await page.waitForTimeout(1000);
  } else if (s === "ARRIVAL" || s === "WIPE") {
    console.log(`terminal: ${s} (no bitter_path)`);
    break;
  }
}

if (!captured) console.log("no bitter_path this run");
const kerr = await page.evaluate(() => window.__KAPLAY_ERRORS || []);
if (kerr.length) {
  console.log("--- KAPLAY ERRORS ---");
  for (const e of kerr.slice(0, 5)) console.log(e);
}
await browser.close();
process.exit(captured ? 0 : 1);
