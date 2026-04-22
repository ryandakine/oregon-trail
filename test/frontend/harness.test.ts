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

  it("T-river-2: renders river with numeric ford_difficulty=5 (regression 4af2434)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 50000, ammo: 20 } });
    await h.goScene("river", riverFx.edgeNumericMax);
    const stats = await h.readStats();
    expect(stats.pageErrors).toEqual([]);
    expect(stats.kaplayErrors).toEqual([]);
    expect(stats.total).toBeGreaterThanOrEqual(10);
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
