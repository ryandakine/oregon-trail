import { describe, it, expect, beforeEach } from "vitest";
import {
  recordUsage,
  getCostsReport,
  usageCostUsd,
  __resetCostTracker,
  PER_PLAYER_DAILY_ALERT_USD,
  TOTAL_DAILY_ALERT_USD,
} from "../src/cost-tracker";

const DAY1 = Date.parse("2026-06-01T10:00:00Z");
const DAY2 = Date.parse("2026-06-02T10:00:00Z");

describe("usageCostUsd — Haiku 4.5 token pricing", () => {
  it("prices input at $1/MTok and output at $5/MTok", () => {
    // 1M input + 1M output = $1 + $5 = $6
    expect(usageCostUsd(1_000_000, 1_000_000)).toBeCloseTo(6, 6);
  });

  it("is zero for zero tokens and clamps negatives to zero", () => {
    expect(usageCostUsd(0, 0)).toBe(0);
    expect(usageCostUsd(-100, -100)).toBe(0);
  });
});

describe("recordUsage / getCostsReport — daily per-player canary", () => {
  beforeEach(() => __resetCostTracker());

  it("accumulates per-player spend and the daily total", () => {
    recordUsage("1.1.1.1", 1000, 200, DAY1); // $0.001 + $0.001 = $0.002
    recordUsage("1.1.1.1", 1000, 200, DAY1); // again -> $0.004 total for player
    recordUsage("2.2.2.2", 2000, 400, DAY1); // $0.002 + $0.002 = $0.004

    const r = getCostsReport(DAY1);
    expect(r.date).toBe("2026-06-01");
    expect(r.player_count).toBe(2);
    expect(r.total_usd).toBeCloseTo(0.008, 6);

    const p1 = r.per_player.find((p) => p.player === "1.1.1.1");
    const p2 = r.per_player.find((p) => p.player === "2.2.2.2");
    expect(p1?.usd).toBeCloseTo(0.004, 6);
    expect(p2?.usd).toBeCloseTo(0.004, 6);
  });

  it("exposes the two alert thresholds and flags players over the per-player limit", () => {
    // 50k input + 10k output = $0.05 + $0.05 = $0.10 > $0.05/player limit
    recordUsage("9.9.9.9", 50_000, 10_000, DAY1);

    const r = getCostsReport(DAY1);
    expect(r.thresholds.per_player_daily_usd).toBe(PER_PLAYER_DAILY_ALERT_USD);
    expect(r.thresholds.total_daily_usd).toBe(TOTAL_DAILY_ALERT_USD);
    expect(r.alerts.players_over_limit.map((p) => p.player)).toContain("9.9.9.9");
    expect(r.alerts.total_breached).toBe(false);
  });

  it("flags total_breached when the daily total exceeds $50", () => {
    // 6M input + 6M output = $6 + $30 = $36 per call; two calls = $72 > $50
    recordUsage("a", 6_000_000, 6_000_000, DAY1);
    recordUsage("b", 6_000_000, 6_000_000, DAY1);

    const r = getCostsReport(DAY1);
    expect(r.total_usd).toBeGreaterThan(TOTAL_DAILY_ALERT_USD);
    expect(r.alerts.total_breached).toBe(true);
  });

  it("rolls over to a fresh bucket on a new UTC day", () => {
    recordUsage("1.1.1.1", 1_000_000, 0, DAY1); // $1 on day 1
    expect(getCostsReport(DAY1).total_usd).toBeCloseTo(1, 6);

    // Querying day 2 resets the bucket; prior day's spend is not carried over.
    const r2 = getCostsReport(DAY2);
    expect(r2.date).toBe("2026-06-02");
    expect(r2.total_usd).toBe(0);
    expect(r2.player_count).toBe(0);
  });

  it("ignores zero-cost calls (no usage reported)", () => {
    recordUsage("1.1.1.1", 0, 0, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.player_count).toBe(0);
    expect(r.total_usd).toBe(0);
  });

  it("sorts per_player descending by spend", () => {
    recordUsage("small", 1000, 0, DAY1);
    recordUsage("big", 100_000, 0, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.per_player[0].player).toBe("big");
  });
});
