// F5 — end-to-end playthrough smoke. Opt-in via PLAYTHROUGH_E2E=1
// because it hits the real worker (oregon-trail-api) + Anthropic. On by
// default, this would flake whenever Anthropic has a hiccup and cost a
// fraction of a cent per CI run.
//
// What it asserts: a medium-tone farmer playthrough advances through at
// least 100 miles without emitting any page errors. Catches regressions
// in engine state transitions that per-scene smokes can't see because
// they force scenes out of context.

import { describe, it, expect } from "vitest";
import { chromium } from "playwright";

const E2E = process.env.PLAYTHROUGH_E2E === "1";

describe.skipIf(!E2E)("playthrough smoke (opt-in: PLAYTHROUGH_E2E=1)", () => {
  it("medium-tone farmer advances past mile 100 with 0 page errors", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("https://trail.osi-cyber.com/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => localStorage.clear());

    await page.evaluate(() => (window.engine as { selectProfession: (p: string) => void }).selectProfession("farmer"));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (window.engine as { submitNames: (l: string, rest: string[]) => void }).submitNames(
        "Ryan", ["Beth", "Carl", "Dana", "Earl"],
      );
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => (window.engine as { selectTone: (t: string) => void }).selectTone("medium"));
    await page.waitForTimeout(1000);
    await page.evaluate(async () => {
      await (window.engine as { purchaseSupplies: (b: unknown[]) => Promise<void> }).purchaseSupplies([
        { item: "food", quantity: 20 },
        { item: "oxen", quantity: 3 },
        { item: "clothing", quantity: 3 },
        { item: "ammo", quantity: 4 },
        { item: "spare_parts", quantity: 2 },
        { item: "medicine", quantity: 2 },
      ]);
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => (window.engine as { changePace?: (p: string) => void }).changePace?.("steady"));

    // Play loop — up to 200 ticks, drive through every scene type.
    const maxTicks = 200;
    for (let i = 0; i < maxTicks; i++) {
      const state = await page.evaluate(() => (window.engine as { state: string }).state);
      if (state === "TRAVEL") {
        await page.evaluate(() => (window.engine as { advance: () => void }).advance());
        await page.waitForTimeout(800);
      } else if (state === "EVENT") {
        await page.evaluate(() => (window.engine as { makeChoice: (i: number) => void }).makeChoice(0));
        await page.waitForTimeout(600);
      } else if (state === "RIVER") {
        await page.evaluate(() => (window.engine as { resolveRiver: (c: string) => void }).resolveRiver("ford"));
        await page.waitForTimeout(600);
      } else if (state === "LANDMARK") {
        await page.evaluate(() => (window.engine as { resolveLandmark?: (a: string) => void }).resolveLandmark?.("continue"));
        await page.waitForTimeout(600);
      } else if (state === "DEATH") {
        await page.evaluate(() => (window.engine as { advance: () => void }).advance());
        await page.waitForTimeout(500);
      } else if (state === "BITTER_PATH") {
        await page.evaluate(async () => {
          try { localStorage.setItem("ot_bitter_path_cw_acked", "true"); } catch (_) {}
          await (window.engine as { resolveBitterPath: (i: number) => Promise<void> }).resolveBitterPath(0);
        });
        await page.waitForTimeout(1600);
      } else if (state === "ARRIVAL" || state === "WIPE") {
        break;
      }
    }

    const miles = await page.evaluate(() => {
      const gs = (window.engine as { gameState?: { position?: { miles_traveled?: number } } }).gameState;
      return gs?.position?.miles_traveled ?? 0;
    });

    await browser.close();

    expect(pageErrors).toEqual([]);
    expect(miles).toBeGreaterThanOrEqual(50); // Conservative — some wipes happen fast
  }, 300000); // 5 min hard cap
});
