// Phase 2 Zen Travel Mode & Floating Frosted HUD Tests
// Covers:
// - T-zen-1: Frosted pill HUD rendering, tags, zero Kaplay errors, object count threshold
// - T-zen-2: Idle auto-fade to fadeFloor and instant restore on user activity
// - T-zen-3: High tone tier disabling Zen Fade (information anxiety / dread)
// - T-zen-4: prefers-reduced-motion disabling Zen Fade

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

describe("Phase 2: Zen Travel Mode & Floating Frosted HUD", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => {
    await h?.stop();
  });

  it("T-zen-1: travel scene renders frosted HUD pills and Hunt action with zero errors", async () => {
    await h.page.evaluate(() => {
      delete (window as unknown as { __ZEN_HUD_OPTS?: unknown }).__ZEN_HUD_OPTS;
    });
    await h.seedEngine({ profession: "farmer", tone: "low", memberNames: ["Beth", "Carl", "Dana", "Earl"] });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(100);

    const hudTags = await h.page.evaluate(() => {
      const k = (window as unknown as { k: { get(tag: string, o?: object): unknown[] } }).k;
      const topObjs = k.get("hud-top", { recursive: true });
      const bottomObjs = k.get("hud-bottom", { recursive: true });
      const actionObjs = k.get("hud-travel-actions", { recursive: true });
      const zen = (window as unknown as { __zenHud?: { isEnabled(): boolean; multiplier(): number } }).__zenHud;
      return {
        topCount: topObjs.length,
        bottomCount: bottomObjs.length,
        actionCount: actionObjs.length,
        zenEnabled: zen?.isEnabled?.() ?? false,
        zenMultiplier: zen?.multiplier?.() ?? 0,
      };
    });

    expect(hudTags.topCount).toBeGreaterThanOrEqual(8);
    expect(hudTags.bottomCount).toBeGreaterThanOrEqual(5);
    expect(hudTags.actionCount).toBeGreaterThanOrEqual(2);
    expect(hudTags.zenEnabled).toBe(true);
    expect(hudTags.zenMultiplier).toBe(1.0);
  });

  it("T-zen-2: Zen Fade auto-fades HUD after idleDelay and restores on user activity", async () => {
    await h.page.evaluate(() => {
      (window as unknown as { __ZEN_HUD_OPTS: Record<string, unknown> }).__ZEN_HUD_OPTS = {
        idleDelay: 0.25,
        fadeFloor: 0.15,
        fadeDuration: 0.2,
        restoreDuration: 0.1,
      };
    });

    await h.seedEngine({ profession: "farmer", tone: "medium" });
    await h.goScene("travel");

    // Wait for idle delay (0.25s) + fade duration (0.2s)
    await h.page.waitForTimeout(550);

    const fadedMultiplier = await h.page.evaluate(() => {
      const zen = (window as unknown as { __zenHud?: { multiplier(): number } }).__zenHud;
      return zen?.multiplier?.() ?? 1.0;
    });
    expect(fadedMultiplier).toBeLessThanOrEqual(0.25);
    expect(fadedMultiplier).toBeGreaterThanOrEqual(0.14);

    // Synthetic user activity: mouse move over canvas
    await h.page.mouse.move(320, 240);
    await h.page.waitForTimeout(150);

    const restoredMultiplier = await h.page.evaluate(() => {
      const zen = (window as unknown as { __zenHud?: { multiplier(): number } }).__zenHud;
      return zen?.multiplier?.() ?? 0;
    });
    expect(restoredMultiplier).toBeGreaterThanOrEqual(0.90);
  });

  it("T-zen-3: high tone tier keeps Zen Fade disabled (stats remain starkly visible)", async () => {
    await h.page.evaluate(() => {
      (window as unknown as { __ZEN_HUD_OPTS: Record<string, unknown> }).__ZEN_HUD_OPTS = {
        idleDelay: 0.15,
        fadeFloor: 0.15,
      };
    });

    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.goScene("travel");
    await h.page.waitForTimeout(300);

    const zenState = await h.page.evaluate(() => {
      const zen = (window as unknown as { __zenHud?: { isEnabled(): boolean; multiplier(): number } }).__zenHud;
      return {
        enabled: zen?.isEnabled?.(),
        multiplier: zen?.multiplier?.(),
      };
    });

    expect(zenState.enabled).toBe(false);
    expect(zenState.multiplier).toBe(1.0);
  });

  it("T-zen-4: prefers-reduced-motion disables Zen Fade", async () => {
    await h.page.emulateMedia({ reducedMotion: "reduce" });
    try {
      await h.page.evaluate(() => {
        (window as unknown as { __ZEN_HUD_OPTS: Record<string, unknown> }).__ZEN_HUD_OPTS = {
          idleDelay: 0.15,
        };
      });

      await h.seedEngine({ profession: "farmer", tone: "medium" });
      await h.goScene("travel");
      await h.page.waitForTimeout(300);

      const zenState = await h.page.evaluate(() => {
        const zen = (window as unknown as { __zenHud?: { isEnabled(): boolean; multiplier(): number } }).__zenHud;
        return {
          enabled: zen?.isEnabled?.(),
          multiplier: zen?.multiplier?.(),
        };
      });

      expect(zenState.enabled).toBe(false);
      expect(zenState.multiplier).toBe(1.0);
    } finally {
      await h.page.emulateMedia({ reducedMotion: "no-preference" });
    }
  });
});
