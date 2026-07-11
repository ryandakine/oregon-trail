// F2 — setup-phase scenes: loading, title, profession, names, tone, store.
// These run before the party departs Independence. Most render without a
// seeded signedState since the engine hasn't started a run yet.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

declare global {
  interface Window {
    k: { get(tag?: string): Array<{ text?: string }> };
  }
}

describe("setup-phase scenes", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    // Fresh localStorage each suite — keeps "Resume saved journey" branch off
    // by default and daily-ack state deterministic.
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => { await h?.stop(); });

  it("T-loading-1: loading scene renders", async () => {
    await h.goScene("loading");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(2);
  });

  it("T-title-1: title renders with no saved run", async () => {
    await h.goScene("title");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // Hero still path is sparse (sprite + UI); night fallback is denser.
    // Either way brand + CTAs must mount.
    expect(s.total).toBeGreaterThanOrEqual(15);
  });

  it("T-title-2: title with saved run shows resume option without errors", async () => {
    await h.page.evaluate(() => {
      const fakeRun = {
        signedState: { state: { position: { date: "1848-05-12", miles_traveled: 200 } }, signature: "t" },
        profession: "farmer",
        leaderName: "Ryan",
        memberNames: ["Beth", "Carl", "Dana", "Earl"],
        fullJournal: [],
        activeChallenge: null,
        currentEvent: null,
        currentRiver: null,
        currentLandmark: null,
        currentBitterPath: null,
        currentBitterPathMeta: null,
        dailyMode: false,
        dailyTrailNumber: 0,
      };
      localStorage.setItem("ot_saved_run", JSON.stringify(fakeRun));
      // title.js reads engine._savedRunData, which is populated on engine.init.
      // Fastest way to trigger the resume branch is to re-run init + go title.
      window.engine._savedRunData = fakeRun;
    });
    await h.goScene("title");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-title-3: title with daily completed renders the [ D ] branch", async () => {
    // Simulate today's daily already completed. title.js renders a different
    // badge — this is the branch most likely to land styled-text hazards.
    await h.page.evaluate(() => {
      const today = Math.floor((Date.now() - new Date("2026-04-13T00:00:00Z").getTime()) / 86400000) + 1;
      localStorage.setItem(
        "ot_daily_" + today,
        JSON.stringify({ completed: true, survived: true, alive: 3, total: 5, miles: 1764, date: new Date().toISOString() }),
      );
    });
    await h.goScene("title");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-title-4: render-mode toggle renders and reflects ot_render_mode", async () => {
    // Desktop (headless chromium is not touch-only) → the [ V ] toggle shows.
    // Seed "2d" so the line reads "3D World: Off".
    await h.page.evaluate(() => localStorage.setItem("ot_render_mode", "2d"));
    await h.goScene("title");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    const toggleText = await h.page.evaluate(() => {
      const line = window.k.get().find((o) => typeof o.text === "string" && o.text.includes("3D World"));
      return line?.text ?? null;
    });
    expect(toggleText).toContain("3D World");
    expect(toggleText).toContain("Off");
  });

  it("T-title-5: title night fallback paints without neon Daily (WS4)", async () => {
    // Force fallback path without full reload (reload drops scene modules).
    await h.page.evaluate(() => { window.__titleHeroReady = false; });
    await h.goScene("title");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // Night fallback is denser (stars + hills + wagon).
    expect(s.total).toBeGreaterThanOrEqual(40);
    const brand = await h.page.evaluate(() => {
      const line = window.k.get().find((o) => typeof o.text === "string" && o.text.includes("OREGON TRAIL"));
      return line?.text ?? null;
    });
    expect(brand).toContain("OREGON TRAIL");
    // No neon Daily green text (old terminal chrome)
    const neonDaily = await h.page.evaluate(() => {
      return window.k.get().some((o) =>
        typeof o.text === "string" && o.text.includes("Daily Trail") && o.color
        && o.color.g > 200 && o.color.r < 120);
    });
    expect(neonDaily).toBe(false);
  });

  it("T-profession-1: profession picker renders", async () => {
    await h.goScene("profession");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // Profession uses HTML overlay for most content; canvas is sparse.
    expect(s.overlayActive || s.total >= 2).toBe(true);
  });

  it("T-names-1: names scene renders text input overlay", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("names");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // Overlay must be mounted (it hosts the text input).
    expect(s.overlayActive).toBe(true);
  });

  it("T-tone-1: tone picker renders with horror pitch (C4.a copy)", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ryan", memberNames: ["Beth", "Carl", "Dana", "Earl"] });
    await h.goScene("tone");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);
    // tone.js renders the C4.a pitch hint ("They say the trail can still be
    // crossed under this sky...") as part of the Psychological Horror card.
    expect(s.overlayText).toContain("Horror");
  });

  it("T-store-1: store renders for farmer with no challenge", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ryan", memberNames: ["Beth", "Carl", "Dana", "Earl"] });
    await h.goScene("store");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // Store lives in the HTML overlay — the canvas is near-empty.
    expect(s.overlayActive).toBe(true);
  });

  it("T-store-2: store renders with pacifist challenge (ammo disabled)", async () => {
    await h.seedEngine({ profession: "banker", leaderName: "Ryan", memberNames: ["Beth", "Carl", "Dana", "Earl"] });
    await h.page.evaluate(() => {
      (window.engine as { activeChallenge: string | null }).activeChallenge = "pacifist";
    });
    await h.goScene("store");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);
  });
});
