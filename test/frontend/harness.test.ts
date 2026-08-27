// Harness smoke — proves startHarness / waitForReady / goScene / readStats
// wire up end-to-end before we scale to per-scene suites.
//
// These tests also pin the two P0 regressions from 2026-04-18:
//   - T-river-2 — river with ford_difficulty: 5 (numeric) must NOT throw
//     (pre-4af2434 this blue-screened via .toUpperCase on a number)
//   - T-hunt-1 — hunting scene renders with no unclosed-tag styled-text
//     errors (pre-a129b31 the "[1] 5 rounds" labels tripped kaplay)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";
import * as riverFx from "./fixtures/river";

describe("frontend harness — boot + primary regression pins", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
  }, 30000);

  afterAll(async () => {
    await h?.stop();
  });

  it("boots title without errors", async () => {
    const stats = await h.readStats();
    expect(stats.pageErrors).toEqual([]);
    expect(stats.kaplayErrors).toEqual([]);
    expect(stats.total).toBeGreaterThan(0);
  });

  // Legibility guard (regression 2026-06-02). Canvas text at sizes 11-20 turned
  // to fuzz because the 640x480 buffer was stretched to the window with too few
  // source pixels. The fix: render the backing buffer at >=2x logical resolution
  // (pixelDensity) and draw text with a real vector TTF instead of the low-res
  // bitmap font. These two invariants are exactly what keep type sharp — if either
  // is dropped, the whole game's text goes blurry again, and the old smoke gate
  // (errors + object count) would not notice. Assert them directly.
  it("T-legibility-1: backing buffer is >=2x logical and the vector font loaded", async () => {
    const r = await h.page.evaluate(() => {
      const k = window.k as unknown as {
        width: () => number;
        height: () => number;
        getFont: (n: string) => unknown;
      };
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      return {
        density: canvas.width / k.width(),
        densityH: canvas.height / k.height(),
        plexLoaded: !!k.getFont("plex"),
      };
    });
    expect(r.density).toBeGreaterThanOrEqual(2);
    expect(r.densityH).toBeGreaterThanOrEqual(2);
    expect(r.plexLoaded).toBe(true);
  });

  // Regression 2026-06-03: the LLM emits a freeform newspaper dateline
  // ("May 1848") that isn't a parseable date. engine.formatDate fed it to
  // `new Date(...)`, got Invalid Date, and rendered "undefined NaN, NaN" in the
  // dateline of every early-wipe obituary — the exact artifact players share.
  // Fix: scene only trusts np.date if it parses, else uses the canonical
  // in-game date; formatDate guards Invalid Date. Found while capturing launch
  // screenshots.
  it("T-newspaper-date-1: malformed LLM dateline never renders NaN/undefined", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("newspaper", {
      headline: "TRAGEDY BEFALLS THE TEST PARTY",
      newspaper_name: "The Independence Gazette",
      date: "May 1848", // freeform, unparseable — the bug trigger
      article_paragraphs: ["A grievous catalogue of misfortunes."],
      survivors: [],
      deaths: [],
    });
    const dateline = await h.page.evaluate(() => {
      const o = document.getElementById("newspaper-overlay");
      return o ? o.textContent || "" : "";
    });
    expect(dateline).not.toContain("NaN");
    expect(dateline).not.toContain("undefined");
  });

  it("T-river-2: renders river with numeric ford_difficulty=5 (regression 4af2434)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 50000, ammo: 20 } });
    await h.goScene("river", riverFx.edgeNumericMax);
    const stats = await h.readStats();
    expect(stats.pageErrors).toEqual([]);
    expect(stats.kaplayErrors).toEqual([]);
    expect(stats.total).toBeGreaterThanOrEqual(10);
  });

  it("T-river-3: crossing result beat replaces choices and Continue returns to travel", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 50000, ammo: 20 } });
    await h.goScene("river", riverFx.edgeNumericMax);
    await h.page.waitForTimeout(400);
    // Drive the real riverResolved path (review 2026-08-24: this surface had
    // zero coverage — mutation-tested regressions shipped green).
    await h.page.evaluate(() => {
      const e = window.engine as unknown as {
        _statsSnapshot(): Record<string, number>;
        _statsDelta(a: unknown, b: unknown): unknown;
        _holdResultBeat(fn: () => void): void;
        transition(s: string): void;
        emit(ev: string, payload: unknown): void;
      };
      const before = e._statsSnapshot();
      const after = { ...before, food: before.food - 34 };
      e._holdResultBeat(() => e.transition("TRAVEL"));
      e.emit("riverResolved", { narrative: "The wagon took on water.", choice: 0, deltas: e._statsDelta(before, after) });
    });
    await h.page.waitForTimeout(300);
    const stats = await h.readStats();
    expect(stats.pageErrors).toEqual([]);
    expect(stats.kaplayErrors).toEqual([]);
    // Choice buttons destroyed; the Continue affordance is the sole area obj.
    const areas = await h.page.evaluate(() =>
      (window as unknown as { k: { get(t: string, o?: object): unknown[] } }).k.get("area", { recursive: true }).length);
    expect(areas).toBe(1);
    await h.page.keyboard.press("Space");
    await h.page.waitForTimeout(400);
    const scene = await h.page.evaluate(() =>
      (window as unknown as { k: { getSceneName(): string } }).k.getSceneName());
    expect(scene).toBe("travel");
  });

  it("T-hunt-1: renders hunting scene without styled-text errors (regression a129b31)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { ammo: 20, money: 10000 } });
    await h.goScene("hunting");
    const stats = await h.readStats();
    expect(stats.pageErrors).toEqual([]);
    expect(stats.kaplayErrors).toEqual([]);
    expect(stats.total).toBeGreaterThanOrEqual(10);
  });
});
