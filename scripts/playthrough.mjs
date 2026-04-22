#!/usr/bin/env node
// End-to-end game simulation via Playwright.
// Drives the real engine state machine on trail.osi-cyber.com (or a local URL),
// always picks option 0 on events/choices, and reports outcome.
//
// Usage:
//   node scripts/playthrough.mjs                               # prod, medium tone
//   node scripts/playthrough.mjs --url=http://localhost:8765
//   node scripts/playthrough.mjs --tone=high --pace=grueling
//   node scripts/playthrough.mjs --headed                      # watch it play

import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }
    return [a, true];
  }),
);

const URL = args.url || "https://trail.osi-cyber.com";
const TONE = args.tone || "medium";
const PROFESSION = args.profession || "farmer";
const PACE = args.pace || "steady";
const MAX_TICKS = Number(args.maxTicks || 400);
const HEADED = Boolean(args.headed);
// --takeBitterPath=<0|1|2|skip>
// Controls what the harness does if the hidden Bitter Path scene fires.
// 0 = dignified (pray), 1 = hopeful (travel), 2 = taken (cannibalism),
// "skip" = route through the content-warning Skip button (sets bitter_path_taken=refused).
// Default is 0 (dignified) — matches the "safe" default picked by the harness
// for normal events. Bitter Path rarely fires outside horror-tier + starvation,
// so most runs ignore this flag entirely.
const BITTER_PATH_CHOICE = args.takeBitterPath !== undefined
  ? (args.takeBitterPath === true ? "0" : String(args.takeBitterPath))
  : "0";

const PARTY = ["Ryan", "Beth", "Carl", "Dana", "Earl"];
const START_BUY = {
  farmer:    [{ item: "food", quantity: 18 }, { item: "oxen", quantity: 3 }, { item: "clothing", quantity: 3 }, { item: "ammo", quantity: 4 }, { item: "spare_parts", quantity: 2 }, { item: "medicine", quantity: 2 }],
  carpenter: [{ item: "food", quantity: 28 }, { item: "oxen", quantity: 3 }, { item: "clothing", quantity: 4 }, { item: "ammo", quantity: 6 }, { item: "spare_parts", quantity: 3 }, { item: "medicine", quantity: 3 }],
  banker:    [{ item: "food", quantity: 38 }, { item: "oxen", quantity: 4 }, { item: "clothing", quantity: 5 }, { item: "ammo", quantity: 8 }, { item: "spare_parts", quantity: 4 }, { item: "medicine", quantity: 4 }],
};

console.log(`playthrough: url=${URL} tone=${TONE} profession=${PROFESSION} pace=${PACE}`);
const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
await page.waitForTimeout(3000);

// Setup phase — drive the engine directly
await page.evaluate((profession) => window.engine.selectProfession(profession), PROFESSION);
await page.waitForTimeout(400);
await page.evaluate((party) => window.engine.submitNames(party[0], party.slice(1)), PARTY);
await page.waitForTimeout(400);
await page.evaluate((tone) => window.engine.selectTone(tone), TONE);
await page.waitForTimeout(1200);

// Buy supplies
const buyResult = await page.evaluate(async (items) => {
  try { await window.engine.purchaseSupplies(items); return { ok: true }; }
  catch (e) { return { ok: false, err: String(e) }; }
}, START_BUY[PROFESSION]);
if (!buyResult.ok) { console.error("purchase failed:", buyResult.err); process.exit(1); }
await page.waitForTimeout(800);

// Set pace
await page.evaluate((p) => window.engine.changePace?.(p), PACE);

// Play loop
let tick = 0;
let lastDate = "";
let lastMiles = 0;
let eventsHandled = 0;
let riversHandled = 0;
let landmarksHandled = 0;
let deathsSeen = 0;
let bitterPathTriggered = 0;
const timeline = [];

while (tick < MAX_TICKS) {
  const snapshot = await page.evaluate(() => ({
    s: window.engine.state,
    miles: window.engine.milesTraveled,
    date: window.engine.currentDate,
    alive: window.engine.party?.members?.filter((m) => m.alive).length ?? 0,
    partySize: window.engine.party?.members?.length ?? 0,
    food: window.engine.supplies?.food ?? 0,
    oxen: window.engine.supplies?.oxen ?? 0,
    medicine: window.engine.supplies?.medicine ?? 0,
    money: window.engine.supplies?.money ?? 0,
    deaths: (window.engine.gameState?.deaths ?? []).map((d) => ({ name: d.name, cause: d.cause, date: d.date })),
    health: (window.engine.party?.members ?? []).map((m) => ({ name: m.name, health: m.health, alive: m.alive, disease: m.disease?.id ?? null })),
  }));

  // Log only when something changed or every 20 ticks
  if (snapshot.date !== lastDate || snapshot.miles !== lastMiles || tick % 20 === 0) {
    console.log(`t=${tick} ${snapshot.s.padEnd(10)} miles=${snapshot.miles} date=${snapshot.date} alive=${snapshot.alive}/${snapshot.partySize} food=${snapshot.food} oxen=${snapshot.oxen} med=${snapshot.medicine}`);
    lastDate = snapshot.date;
    lastMiles = snapshot.miles;
    timeline.push(snapshot);
  }

  if (snapshot.deaths.length > deathsSeen) {
    const newDeaths = snapshot.deaths.slice(deathsSeen);
    for (const d of newDeaths) console.log(`  DEATH: ${d.name} — ${d.cause} on ${d.date}`);
    deathsSeen = snapshot.deaths.length;
  }

  if (snapshot.s === "WIPE" || snapshot.s === "ARRIVAL" || snapshot.s === "NEWSPAPER" || snapshot.s === "SHARE") {
    console.log(`\nTERMINAL STATE: ${snapshot.s}`);
    break;
  }

  try {
    if (snapshot.s === "EVENT") {
      const chose = await page.evaluate(() => {
        const choices = window.engine.currentEvent?.choices ?? [];
        if (choices.length === 0) { window.engine.makeChoice(0); return { idx: 0, label: "(no choices)" }; }
        window.engine.makeChoice(0);
        return { idx: 0, label: choices[0]?.text || choices[0]?.label || "(option 0)" };
      });
      console.log(`  EVENT choice 0: "${chose.label}"`);
      eventsHandled++;
      await page.waitForTimeout(1200);
    } else if (snapshot.s === "RIVER") {
      await page.evaluate(() => window.engine.resolveRiver("ford"));
      console.log(`  RIVER: ford`);
      riversHandled++;
      await page.waitForTimeout(1200);
    } else if (snapshot.s === "LANDMARK") {
      await page.evaluate(() => window.engine.resolveLandmark("continue"));
      console.log(`  LANDMARK: continue`);
      landmarksHandled++;
      await page.waitForTimeout(1200);
    } else if (snapshot.s === "DEATH") {
      await page.evaluate(() => window.engine.advance?.());
      await page.waitForTimeout(800);
    } else if (snapshot.s === "BITTER_PATH") {
      // Hidden horror scene. Fires when the server detects starvation +
      // recent death on a horror-tier run. --takeBitterPath picks what
      // we do; default is dignified (choice 0).
      const action = await page.evaluate(async (choice) => {
        // Pre-ack the content-warning gate so the scene doesn't wait on us.
        try { localStorage.setItem("ot_bitter_path_cw_acked", "true"); } catch (_) {}
        if (choice === "skip") {
          await window.engine.skipBitterPath();
          return { kind: "skip" };
        }
        const idx = Number(choice);
        await window.engine.resolveBitterPath(Number.isInteger(idx) && idx >= 0 && idx <= 2 ? idx : 0);
        return { kind: "choice", idx };
      }, BITTER_PATH_CHOICE);
      console.log(`  BITTER_PATH ${action.kind === "skip" ? "skip" : `choice ${action.idx}`}`);
      bitterPathTriggered++;
      await page.waitForTimeout(2000);
    } else if (snapshot.s === "TRAVEL") {
      await page.evaluate(() => window.engine.advance());
      await page.waitForTimeout(1500);
    } else {
      // Unknown state; nudge with advance
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.error(`tick ${tick} error:`, String(e).slice(0, 200));
  }

  tick++;
}

// Final screenshot
await page.screenshot({ path: ".gstack/qa-reports/playthrough-final.png", fullPage: false });

// Summary
const final = await page.evaluate(() => ({
  s: window.engine.state,
  miles: window.engine.milesTraveled,
  date: window.engine.currentDate,
  alive: window.engine.party?.members?.filter((m) => m.alive).length ?? 0,
  partySize: window.engine.party?.members?.length ?? 0,
  deaths: (window.engine.gameState?.deaths ?? []).map((d) => ({ name: d.name, cause: d.cause, date: d.date })),
}));

console.log(`\n=== SUMMARY ===`);
console.log(`outcome: ${final.s}`);
console.log(`miles: ${final.miles} / 1764 (${Math.round(final.miles / 17.64)}%)`);
console.log(`survivors: ${final.alive}/${final.partySize}`);
console.log(`deaths:`);
for (const d of final.deaths) console.log(`  ${d.name} — ${d.cause} (${d.date})`);
console.log(`events handled: ${eventsHandled}`);
console.log(`rivers forded: ${riversHandled}`);
console.log(`landmarks visited: ${landmarksHandled}`);
console.log(`bitter path triggered: ${bitterPathTriggered} (action: ${BITTER_PATH_CHOICE})`);
console.log(`ticks: ${tick} / ${MAX_TICKS}`);
console.log(`page errors: ${pageErrors.length}`);
if (pageErrors.length) pageErrors.slice(0, 5).forEach((e) => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();

// Exit code: 0 if played at least 100 miles (survival signal), 1 if immediate wipe
process.exit(final.miles >= 100 ? 0 : 1);
