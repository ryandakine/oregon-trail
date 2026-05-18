#!/usr/bin/env node
// Generate launch-blocker screenshots per LAUNCH_DAY_PLAYBOOK.md.
//
// Target: https://trail.osi-cyber.com (or --url=...)
// Output: screenshots/launch/
//
// Shots produced (per LAUNCH_DAY_PLAYBOOK § "Required new screenshots"):
//   01-title.png                  — title screen with wagon + starfield + Daily badge
//   04-tone.png                   — three tone tiers side-by-side (MONEY SHOT)
//   07-event-full.png             — LLM event with prose + 4 choice buttons
//   12-newspaper-lone.png         — horror "LONE SURVIVOR REACHES OREGON"
//   13-newspaper-wipe.png         — full-wipe river-drowning newspaper
//   14-newspaper-arrival.png      — classroom-safe clean arrival newspaper
//   15-newspaper-horror-arrival.png — horror partial-arrival newspaper
//   16-newspaper-grid.png         — 2x2 montage of the four newspapers (post-step)
//
// Approach: cache-busted goto, wait for engine ready, force-render each scene
// via window.k.go(name, payload). All scene payloads are realistic, not test fixtures.
// Newspaper headlines, byline, body, deaths, survivors are hand-written here to
// match the spec's masthead/date/voice for each tier.
//
// Run: node scripts/launch-screenshots.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }
    return [a, true];
  }),
);
const URL = args.url || "https://trail.osi-cyber.com";
const OUT_DIR = args.out || "screenshots/launch";
const HEADED = Boolean(args.headed);

// Marketing canvas size — 1280×720 matches the LAUNCH_DAY_PLAYBOOK desktop spec
// (Chrome at 1280×800 minus URL bar). Game letterboxes inside, padding fills.
const VIEW = { width: 1280, height: 720 };

await mkdir(OUT_DIR, { recursive: true });
console.log(`[launch-shots] target=${URL} out=${OUT_DIR}`);

const browser = await chromium.launch({ headless: !HEADED });

// One page per shot — clean state, no cross-contamination between forced renders.
async function newPage(viewportOverride) {
  const ctx = await browser.newContext({
    viewport: viewportOverride || VIEW,
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  pageerror:", String(e).slice(0, 200)));
  return { page, ctx };
}

async function loadFresh(page) {
  const bust = `?shot=${Date.now()}`;
  await page.goto(URL + "/" + bust, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => localStorage.clear());
}

async function shoot(name, fn, opts = {}) {
  const { page, ctx } = await newPage(opts.viewport);
  try {
    await loadFresh(page);
    await fn(page);
    const out = path.join(OUT_DIR, name);
    if (opts.selector) {
      // Element screenshot — captures the full element bounds even if it
      // overflows the viewport. Used for newspapers so the IN MEMORIAM
      // block isn't clipped.
      const el = await page.$(opts.selector);
      if (!el) throw new Error(`selector not found: ${opts.selector}`);
      await el.screenshot({ path: out });
    } else {
      await page.screenshot({ path: out, fullPage: false });
    }
    console.log(`  ✓ ${out}`);
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
  } finally {
    await ctx.close();
  }
}

// ── 01-title.png ─────────────────────────────────────────
// Title scene renders on page load. Already shows wagon + starfield + Daily badge.
await shoot("01-title.png", async (page) => {
  // Page lands on title scene; let stars + ENTER prompt animation settle.
  await page.waitForTimeout(1500);
});

// ── 04-tone.png ──────────────────────────────────────────
// MONEY SHOT: three tone tiers side-by-side.
// Need to walk through profession + names + tone scenes, then capture the tone selection.
await shoot("04-tone.png", async (page) => {
  await page.evaluate(() => window.engine.selectProfession("farmer"));
  await page.waitForTimeout(400);
  await page.evaluate(() =>
    window.engine.submitNames("Sarah", ["Eli", "Hannah", "James", "Mary"]),
  );
  await page.waitForTimeout(800);
  // Wait for tone scene HTML overlay to render (CW pitch is the differentiator).
  await page.waitForFunction(
    () => document.querySelector(".tone-btn[data-tone=high]"),
    { timeout: 5000 },
  );
  await page.waitForTimeout(500);
});

// ── 07-event-full.png ────────────────────────────────────
// Realistic LLM event with prose + 4 choices, exactly the kind that ships in play.
// Force-render directly via k.go("event", payload) — no flaky LLM dependency.
await shoot("07-event-full.png", async (page) => {
  // Inject via signedState because gameState/supplies/milesTraveled/currentDate
  // are all read-only getters on engine.js that route through
  // signedState.state.{supplies,position,party}. Assigning engine.gameState
  // silently no-ops.
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
        "Tonight he says the wagon is too heavy. Says we ought to throw out the second axle, " +
        "the spare yoke, the iron crowbar. James, who lost his elder boy to typhoid in May, " +
        "tells him the trail strips courtesy like bark from a dead tree, and that what you " +
        "carry into the mountains is the only argument that matters once the snow comes.",
      choices: [
        { text: "Side with Eli. Lighten the wagon." },
        { text: "Side with James. Keep the iron." },
        { text: "Call a vote. Let the party decide." },
        { text: "Say nothing. Let the night cool them both." },
      ],
    });
  });
  // Skip typewriter so all four choices render for the shot.
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const overlay = document.getElementById("html-overlay");
    overlay?.click();
  });
  await page.waitForTimeout(800);
});

// ── Newspaper shots ───────────────────────────────────────
// Capture #newspaper-content directly so the IN MEMORIAM sidebar isn't
// clipped by the overlay's 85vh scroll container. Taller viewport gives the
// element room to lay out before we grab it.
const NP_VIEW = { width: 1280, height: 1600 };
const NP_SELECTOR = "#newspaper-content";

// Helper: lift the overlay's 85vh scroll cap so the element screenshot
// captures the full newspaper (masthead → article → IN MEMORIAM → buttons)
// in a single frame.
async function unclipNewspaper(page) {
  await page.evaluate(() => {
    const el = document.getElementById("newspaper-content");
    if (el) {
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
    }
  });
  await page.waitForTimeout(200);
}

// ── 12-newspaper-lone.png ────────────────────────────────
// Horror-tier lone-survivor newspaper. One survivor, four IN MEMORIAM.
await shoot("12-newspaper-lone.png", async (page) => {
  await page.evaluate(() => {
    window.k.go("newspaper", {
      newspaper_name: "The Independence Gazette",
      date: "1848-10-12",
      headline: "LONE SURVIVOR REACHES OREGON",
      byline: "From our correspondent at the Willamette Mission",
      article_paragraphs: [
        "Word reaches us this week of the wagon led by Sarah Reed of Independence, Missouri, " +
        "which set out in early April with five souls and arrived this Tuesday at the mission " +
        "with but one. Mrs. Reed walked the last forty miles barefoot, leading the surviving " +
        "ox by a tether of braided shirt-sleeve.",
        "She would not speak of the pass. The Reverend Mr. Whitman, who admitted her, reports " +
        "she asked only for water and for the location of a chapel. She has refused all visitors. " +
        "The wagon carried no provisions and no goods of note.",
        "Of the four who perished, one was lost to fever before Fort Laramie, two to exhaustion " +
        "in the Blue Mountains, and the cause of the fourth Mrs. Reed declined to record. The " +
        "journal she surrendered to the mission has been sealed at her request.",
      ],
      survivors: ["Sarah Reed"],
      deaths: [
        { name: "James Reed", cause: "typhoid fever, near Fort Laramie" },
        { name: "Eli Reed", cause: "exhaustion in the Blue Mountains" },
        { name: "Hannah Reed", cause: "exhaustion in the Blue Mountains" },
        { name: "Mary Reed", cause: "the long night" },
      ],
    });
  });
  await page.waitForTimeout(1200);
  await unclipNewspaper(page);
}, { viewport: NP_VIEW, selector: NP_SELECTOR });

// ── 13-newspaper-wipe.png ────────────────────────────────
// Full wipe at the Snake River. Five drowned.
await shoot("13-newspaper-wipe.png", async (page) => {
  await page.evaluate(() => {
    window.k.go("newspaper", {
      newspaper_name: "Fort Hall Register",
      date: "1848-08-23",
      headline: "PARTY OF FIVE LOST ON THE SNAKE",
      byline: "Dispatched from the ferry station at Three Island Crossing",
      article_paragraphs: [
        "A wagon under the command of Mr. Eli Walker of Independence, Missouri, was carried " +
        "down the Snake on the morning of the 19th, taking with it the whole of his party. " +
        "Witnesses at the south bank report the ox-team lost footing midway through the ford " +
        "and the wagon turned in the current within sight of the far shore.",
        "Mr. Walker had been advised by the ferryman to wait three days for the water to fall " +
        "but, the company being short of food and the season late, he chose to attempt the " +
        "crossing. The current at this point carries any object lost to it nine miles down to " +
        "the rapids at American Falls, where recovery is held to be impossible.",
        "The names of the dead are recorded below. The Register will hold any letters or " +
        "effects forwarded by surviving kin until the spring post.",
      ],
      survivors: [],
      deaths: [
        { name: "Eli Walker", cause: "drowning at Snake River ford" },
        { name: "Margaret Walker", cause: "drowning at Snake River ford" },
        { name: "Thomas Walker", cause: "drowning at Snake River ford" },
        { name: "Anna Walker", cause: "drowning at Snake River ford" },
        { name: "Samuel Boggs", cause: "drowning at Snake River ford" },
      ],
    });
  });
  await page.waitForTimeout(1200);
  await unclipNewspaper(page);
}, { viewport: NP_VIEW, selector: NP_SELECTOR });

// ── 14-newspaper-arrival.png ─────────────────────────────
// Classroom-safe clean arrival. All five survive.
await shoot("14-newspaper-arrival.png", async (page) => {
  await page.evaluate(() => {
    window.k.go("newspaper", {
      newspaper_name: "Oregon Spectator",
      date: "1848-09-30",
      headline: "FARMING FAMILY ARRIVES IN GOOD ORDER",
      byline: "Filed from Oregon City",
      article_paragraphs: [
        "The wagon of Mr. and Mrs. Tobias Hale of Springfield, Illinois, arrived this Friday " +
        "at Oregon City with the whole of their household in good health, having departed " +
        "Independence in the first week of April. The Hales report the journey arduous but " +
        "free of incident beyond the ordinary.",
        "Mr. Hale, by trade a farmer, intends to take up a claim in the Tualatin Valley before " +
        "the autumn rains. Mrs. Hale reports that the children — Lemuel (12), Patience (9), " +
        "and the youngest, Asa (6) — bore the crossing with such cheer that she would commend " +
        "the route to any family of modest means and steady disposition.",
        "The Hales credit their preservation to early departure, a fair pace held throughout, " +
        "and a willingness to rest the oxen at every fort and clean water. They carried two " +
        "spare wagon-tongues and a generous store of flour, and arrived with provisions to spare.",
      ],
      survivors: ["Tobias Hale", "Ruth Hale", "Lemuel Hale", "Patience Hale", "Asa Hale"],
      deaths: [],
    });
  });
  await page.waitForTimeout(1200);
  await unclipNewspaper(page);
}, { viewport: NP_VIEW, selector: NP_SELECTOR });

// ── 15-newspaper-horror-arrival.png ──────────────────────
// Horror-tier partial arrival. Two of five. IN MEMORIAM includes "the long night."
await shoot("15-newspaper-horror-arrival.png", async (page) => {
  await page.evaluate(() => {
    window.k.go("newspaper", {
      newspaper_name: "Willamette Weekly",
      date: "1848-11-04",
      headline: "TWO OF FIVE REACH THE VALLEY",
      byline: "From our office at Champoeg",
      article_paragraphs: [
        "The wagon of the Carver party, having left Independence in the second week of April, " +
        "reached the Willamette this past Sunday with two of its five members. Mr. Josiah " +
        "Carver and his daughter Elizabeth were received at the settlement of Champoeg by the " +
        "physician Dr. McLoughlin, who reports them gaunt but not in immediate peril.",
        "The party suffered grievously in the high passes after a late-season snow caught them " +
        "above the Snake. Mr. Carver, asked for an accounting of the dead, would say only that " +
        "the trail above eight thousand feet asks more of a company than a company always has " +
        "to give, and that those who arrive at the valley arrive owing something to those who do not.",
        "Miss Carver, eleven years of age, was placed in the care of the mission school. She " +
        "carries with her the family Bible and a wooden cup whittled by her late brother. " +
        "She does not speak.",
      ],
      survivors: ["Josiah Carver", "Elizabeth Carver"],
      deaths: [
        { name: "Caleb Carver", cause: "fall on the Barlow Road" },
        { name: "Rebecca Carver", cause: "exhaustion in the Blue Mountains" },
        { name: "Daniel Carver", cause: "the long night" },
      ],
    });
  });
  await page.waitForTimeout(1200);
  await unclipNewspaper(page);
}, { viewport: NP_VIEW, selector: NP_SELECTOR });

await browser.close();
console.log("[launch-shots] done");
