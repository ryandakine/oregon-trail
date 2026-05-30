#!/usr/bin/env node
// Phone-aspect launch screenshots for Play Store + Apple App Store.
//
// Specs (APP_STORE_PLAN.md):
//   Play Store: 1080×1920 phone portrait (or 1920×1080 landscape)
//   App Store 6.5" iPhone 15 Pro Max: 1290×2796 portrait
//
// Output: screenshots/launch/mobile/ — paired with platform suffix.
// Captures: title, tone (money shot), event, newspaper-arrival.
//
// Run: node scripts/launch-screenshots-mobile.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const URL = "https://trail.osi-cyber.com";
const OUT_DIR = "screenshots/launch/mobile";

const SPECS = [
  { name: "play", w: 1080, h: 1920 },
  { name: "ios65", w: 1290, h: 2796 },
];

await mkdir(OUT_DIR, { recursive: true });
console.log(`[mobile-shots] target=${URL} out=${OUT_DIR}`);

const browser = await chromium.launch({ headless: true });

async function shoot(spec, name, fn) {
  const ctx = await browser.newContext({
    viewport: { width: spec.w, height: spec.h },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  pageerror:", String(e).slice(0, 200)));
  try {
    const bust = `?shot=${Date.now()}`;
    await page.goto(URL + "/" + bust, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => localStorage.clear());
    await fn(page);
    const out = path.join(OUT_DIR, `${spec.name}-${name}`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`  ✓ ${out}`);
  } catch (err) {
    console.error(`  ✗ ${spec.name}/${name}: ${err.message}`);
  } finally {
    await ctx.close();
  }
}

for (const spec of SPECS) {
  // Title — landed on load.
  await shoot(spec, "01-title.png", async (page) => {
    await page.waitForTimeout(1500);
  });

  // Tone — money shot.
  await shoot(spec, "04-tone.png", async (page) => {
    await page.evaluate(() => window.engine.selectProfession("farmer"));
    await page.waitForTimeout(400);
    await page.evaluate(() =>
      window.engine.submitNames("Sarah", ["Eli", "Hannah", "James", "Mary"]),
    );
    await page.waitForTimeout(800);
    await page.waitForFunction(
      () => document.querySelector(".tone-btn[data-tone=high]"),
      { timeout: 5000 },
    );
    await page.waitForTimeout(500);
  });

  // Event with prose + choices.
  await shoot(spec, "07-event.png", async (page) => {
    await page.evaluate(() => {
      window.engine.signedState = {
        state: {
          party: {
            members: [
              { name: "Sarah", hp: 72, sanity: 55, alive: true },
              { name: "Eli", hp: 14, sanity: 30, alive: true },
              { name: "Hannah", hp: 65, sanity: 70, alive: true },
              { name: "James", hp: 40, sanity: 45, alive: true },
            ],
            sanity: 55,
            morale: 38,
          },
          supplies: { food: 86, ammo: 18, clothing: 2, medicine: 1, spare_parts: 1, oxen: 3, money: 1240 },
          position: { miles_traveled: 612, segment: "Plains", date: "1848-06-14" },
          simulation: { days_elapsed: 41, weather: "clear", pace: "steady", rations: "meager", tone_tier: "medium" },
        },
        signature: "marketing-shot",
      };
      window.k.go("event", {
        title: "The Argument",
        description:
          "Eli has not spoken since they laid Sarah's brother in the prairie four days back. " +
          "Tonight he says the wagon is too heavy. James, who lost his elder boy to typhoid in May, " +
          "tells him the trail strips courtesy like bark from a dead tree.",
        choices: [
          { text: "Side with Eli. Lighten the wagon." },
          { text: "Side with James. Keep the iron." },
          { text: "Call a vote. Let the party decide." },
          { text: "Say nothing. Let the night cool them both." },
        ],
      });
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById("html-overlay")?.click());
    await page.waitForTimeout(800);
  });

  // Newspaper — classroom-safe arrival (Play Store friendly).
  await shoot(spec, "14-newspaper-arrival.png", async (page) => {
    await page.evaluate(() => {
      window.k.go("newspaper", {
        newspaper_name: "Oregon Spectator",
        date: "1848-09-30",
        headline: "FARMING FAMILY ARRIVES IN GOOD ORDER",
        byline: "Filed from Oregon City",
        article_paragraphs: [
          "The wagon of Mr. and Mrs. Tobias Hale of Springfield, Illinois, arrived this " +
          "Friday at Oregon City with the whole of their household in good health.",
          "Mr. Hale, by trade a farmer, intends to take up a claim in the Tualatin Valley " +
          "before the autumn rains. The Hales credit their preservation to early departure, " +
          "a fair pace held throughout, and a willingness to rest the oxen at every fort.",
        ],
        survivors: ["Tobias Hale", "Ruth Hale", "Lemuel Hale", "Patience Hale", "Asa Hale"],
        deaths: [],
      });
    });
    await page.waitForTimeout(1200);
  });
}

await browser.close();
console.log("[mobile-shots] done");
