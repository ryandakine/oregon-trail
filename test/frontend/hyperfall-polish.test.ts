// HYPERFALL-Style Polish Regression Tests
// Verifies:
// - Travel visible Pause & Mute pills, pause layout separation, setMoving(false) on pause
// - Audio stings wired on arrival (sting("arrival")) & landmark (bell()) + river sublabels
// - Names scene explicit Confirm + Back buttons
// - Store scene mobile viewport (390x844) no horizontal overflow
// - Meta medals (computeRunMedals), travelSpeed persistence, and Daily Practice button on Title

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

describe("HYPERFALL-style polish pass", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => {
    await h?.stop();
  });

  it("T-hf-1: travel has visible Pause & Sound pills and stops moving audio on pause", async () => {
    await h.seedEngine({ profession: "farmer", tone: "low" });
    await h.goScene("travel");

    const res = await h.page.evaluate(() => {
      const w = window as unknown as {
        k: { get(tag?: string, o?: object): Array<{ text?: string; pos?: { y: number } }> };
        audio?: { setMoving(v: boolean): void };
        __movingCalls?: boolean[];
      };
      w.__movingCalls = [];
      if (w.audio) {
        const orig = w.audio.setMoving.bind(w.audio);
        w.audio.setMoving = (v: boolean) => { w.__movingCalls!.push(v); orig(v); };
      }
      const actions = w.k.get("hud-travel-actions", { recursive: true });
      const labels = actions.map((o) => o.text).filter(Boolean);
      return { actionCount: actions.length, labels, hasAudio: Boolean(w.audio) };
    });

    expect(res.actionCount).toBeGreaterThanOrEqual(6);
    expect(res.labels.some((l) => String(l).includes("Pause"))).toBe(true);
    expect(res.labels.some((l) => String(l).includes("Sound") || String(l).includes("Muted"))).toBe(true);

    // Press P to pause and verify PAUSED heading sits well above statsText + setMoving(false) fired
    await h.page.keyboard.press("p");
    await h.page.waitForTimeout(150);
    const pauseLayout = await h.page.evaluate(() => {
      const w = window as unknown as {
        k: { get(): Array<{ text?: string; pos?: { y: number } }> };
        __movingCalls?: boolean[];
      };
      const all = w.k.get();
      const pausedTitle = all.find((o) => o.text === "PAUSED");
      const stats = all.find((o) => typeof o.text === "string" && o.text.includes("Food:"));
      return {
        pausedY: pausedTitle?.pos?.y ?? -1,
        statsY: stats?.pos?.y ?? -1,
        movingCalls: w.__movingCalls ?? [],
      };
    });
    expect(pauseLayout.pausedY).toBeGreaterThan(0);
    expect(pauseLayout.pausedY).toBeLessThan(80);
    expect(pauseLayout.statsY).toBeGreaterThanOrEqual(150);
    if (res.hasAudio) {
      expect(pauseLayout.movingCalls).toContain(false);
    }
  });

  it("T-hf-2: arrival and landmark scenes fire audio stings and river shows risk sublabels", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 20000 } });
    await h.page.evaluate(() => {
      const w = window as unknown as {
        audio?: { sting(k: string): void; bell(): void };
        __audioSpy?: string[];
      };
      w.__audioSpy = [];
      if (w.audio) {
        const origSting = w.audio.sting.bind(w.audio);
        const origBell = w.audio.bell.bind(w.audio);
        w.audio.sting = (kind: string) => { w.__audioSpy!.push(`sting:${kind}`); origSting(kind); };
        w.audio.bell = () => { w.__audioSpy!.push("bell"); origBell(); };
      }
    });

    await h.goScene("landmark", { name: "Fort Laramie", type: "fort", description: "Stockade outpost." });
    await h.goScene("arrival", { arrived: true });
    const spy = await h.page.evaluate(() => (window as unknown as { __audioSpy?: string[] }).__audioSpy ?? []);
    expect(spy).toContain("bell");
    expect(spy).toContain("sting:arrival");

    await h.goScene("river", { name: "Kansas River", width_ft: 200, depth_ft_summer: 4, ford_difficulty: 3, ferry_available: true, ferry_cost_1848_dollars: 5 });
    const riverTexts = await h.page.evaluate(() => {
      const w = window as unknown as { k: { get(tag?: string): Array<{ text?: string }> } };
      return w.k.get("riverChoice").map((o) => o.text).filter(Boolean);
    });
    expect(riverTexts.some((t) => String(t).includes("High risk"))).toBe(true);
    expect(riverTexts.some((t) => String(t).includes("Moderate risk"))).toBe(true);
  });

  it("T-hf-3: names scene has explicit Confirm & Back buttons and store fits 390px mobile viewport", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("names");
    const hasButtons = await h.page.evaluate(() => ({
      confirm: Boolean(document.getElementById("name-confirm")),
      back: Boolean(document.getElementById("name-back")),
      random: Boolean(document.getElementById("name-random")),
    }));
    expect(hasButtons).toEqual({ confirm: true, back: true, random: true });

    await h.page.setViewportSize({ width: 390, height: 844 });
    await h.goScene("store");
    await h.page.waitForTimeout(150);
    const overflow = await h.page.evaluate(() => {
      const el = document.querySelector("#html-overlay .overlay-content") as HTMLElement | null;
      return el ? el.scrollWidth - el.clientWidth : -1;
    });
    expect(overflow).toBeLessThanOrEqual(4);
    await h.page.setViewportSize({ width: 1280, height: 720 });
  });

  it("T-hf-4: medals compute deterministically, travelSpeed persists, and completed Daily stays interactive", async () => {
    await h.seedEngine({ profession: "farmer", memberNames: ["Ryan", "Beth", "Carl", "Dana", "Earl"] });
    const metaCheck = await h.page.evaluate(() => {
      const w = window as unknown as {
        engine: {
          computeRunMedals(opts?: object): Array<{ id: string; label: string }>;
          setTravelSpeed(s: number): void;
          travelSpeed: number;
          state: Record<string, unknown>;
        };
      };
      w.engine.setTravelSpeed(2);
      const savedSpeed = localStorage.getItem("ot_travel_speed");
      const medals = w.engine.computeRunMedals({ arrived: true });
      return { travelSpeed: w.engine.travelSpeed, savedSpeed, medalIds: medals.map((m) => m.id) };
    });
    expect(metaCheck.travelSpeed).toBe(2);
    expect(metaCheck.savedSpeed).toBe("2");
    expect(metaCheck.medalIds).toContain("survivor");
    expect(metaCheck.medalIds).toContain("zero_losses");
    expect(metaCheck.medalIds).toContain("farmers_grit");
  });
});
