import { describe, it, expect, beforeEach } from "vitest";
import {
  usageCostUsd,
  recordUsage,
  getCostsReport,
  __resetCostTracker,
  PER_PLAYER_DAILY_ALERT_USD,
  TOTAL_DAILY_ALERT_USD,
} from "../src/cost-tracker";
import { ipKey } from "../src/paid-guard";

// Fixed instants for deterministic day-bucketing (UTC).
const DAY1 = new Date("2026-05-30T12:00:00Z");
const DAY1_LATE = new Date("2026-05-30T23:59:59Z");
const DAY2 = new Date("2026-05-31T00:00:01Z");

const req = (ip?: string) =>
  new Request("https://test.local/api/advance", {
    method: "POST",
    headers: ip ? { "CF-Connecting-IP": ip } : {},
  });

beforeEach(() => __resetCostTracker());

describe("usageCostUsd — Haiku 4.5 pricing math", () => {
  it("prices input at $1/Mtok and output at $5/Mtok", () => {
    // 1M input + 1M output = $1.00 + $5.00 = $6.00
    expect(usageCostUsd(1_000_000, 1_000_000)).toBe(6.0);
  });

  it("computes a typical small call exactly", () => {
    // 1000 input ($0.001) + 500 output ($0.0025) = $0.0035
    expect(usageCostUsd(1000, 500)).toBeCloseTo(0.0035, 10);
  });

  it("treats negative/garbage token counts as zero (no negative cost)", () => {
    expect(usageCostUsd(-100, -50)).toBe(0);
    expect(usageCostUsd(0, 0)).toBe(0);
  });
});

describe("recordUsage — accumulation", () => {
  it("accumulates per-player and total across multiple calls", () => {
    const a = ipKey(req("1.1.1.1"));
    const b = ipKey(req("2.2.2.2"));
    recordUsage(a, 1000, 500, DAY1); // $0.0035
    recordUsage(a, 1000, 500, DAY1); // +$0.0035 → $0.007 for a
    recordUsage(b, 2000, 0, DAY1);   // $0.002 for b

    const r = getCostsReport(DAY1);
    expect(r.player_count).toBe(2);
    expect(r.total_usd).toBeCloseTo(0.009, 9);
    const byPlayer = Object.fromEntries(r.per_player.map((p) => [p.player, p.usd]));
    expect(byPlayer[a]).toBeCloseTo(0.007, 9);
    expect(byPlayer[b]).toBeCloseTo(0.002, 9);
  });

  it("uses the same identity paid-guard keys on (IPv6 /64 collapses)", () => {
    // Two distinct /128s in the same /64 must be ONE player, exactly like
    // paid-guard's volume cap treats them.
    const k1 = ipKey(req("2001:db8:abcd:1234:1:2:3:4"));
    const k2 = ipKey(req("2001:db8:abcd:1234:ffff:ffff:ffff:ffff"));
    expect(k1).toBe(k2);
    recordUsage(k1, 1000, 500, DAY1);
    recordUsage(k2, 1000, 500, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.player_count).toBe(1);
    expect(r.per_player[0].player).toBe("2001:db8:abcd:1234::/64");
  });
});

describe("recordUsage — zero-cost no-op", () => {
  it("does not create a player bucket for a zero-token call", () => {
    recordUsage(ipKey(req("3.3.3.3")), 0, 0, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.player_count).toBe(0);
    expect(r.total_usd).toBe(0);
    expect(r.per_player).toEqual([]);
  });
});

describe("getCostsReport — thresholds and breach flags", () => {
  it("reports the two thresholds verbatim", () => {
    const r = getCostsReport(DAY1);
    expect(r.thresholds).toEqual({
      per_player_daily_usd: PER_PLAYER_DAILY_ALERT_USD,
      total_daily_usd: TOTAL_DAILY_ALERT_USD,
    });
  });

  it("flags a player over the per-player daily threshold", () => {
    const heavy = ipKey(req("4.4.4.4"));
    // Push just over $0.05: 20k output tokens = $0.10 > $0.05.
    recordUsage(heavy, 0, 20_000, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.alerts.players_over_limit).toHaveLength(1);
    expect(r.alerts.players_over_limit[0].player).toBe(heavy);
    expect(r.alerts.players_over_limit[0].usd).toBeGreaterThan(PER_PLAYER_DAILY_ALERT_USD);
    expect(r.alerts.total_breached).toBe(false);
  });

  it("does NOT flag a player exactly at the threshold (strict >)", () => {
    // Exactly $0.05 (10k output tokens) must not trip the alert.
    recordUsage(ipKey(req("5.5.5.5")), 0, 10_000, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.total_usd).toBeCloseTo(PER_PLAYER_DAILY_ALERT_USD, 9);
    expect(r.alerts.players_over_limit).toHaveLength(0);
  });

  it("flags the daily total once it breaches $50", () => {
    // Each call: 10M output tokens = $50. Two of them across two players = $100.
    recordUsage(ipKey(req("6.6.6.6")), 0, 10_000_000, DAY1);
    recordUsage(ipKey(req("7.7.7.7")), 0, 10_000_000, DAY1);
    const r = getCostsReport(DAY1);
    expect(r.total_usd).toBeCloseTo(100, 6);
    expect(r.alerts.total_breached).toBe(true);
  });

  it("sorts per_player descending by spend", () => {
    recordUsage(ipKey(req("8.8.8.8")), 0, 1000, DAY1);  // smaller
    recordUsage(ipKey(req("9.9.9.9")), 0, 5000, DAY1);  // larger
    const r = getCostsReport(DAY1);
    expect(r.per_player[0].player).toBe("9.9.9.9");
    expect(r.per_player[0].usd).toBeGreaterThan(r.per_player[1].usd);
  });
});

describe("getCostsReport — UTC day rollover", () => {
  it("keeps same-day records in one bucket", () => {
    const k = ipKey(req("1.2.3.4"));
    recordUsage(k, 1000, 500, DAY1);
    recordUsage(k, 1000, 500, DAY1_LATE); // still 2026-05-30
    const r = getCostsReport(DAY1_LATE);
    expect(r.date).toBe("2026-05-30");
    expect(r.player_count).toBe(1);
    expect(r.total_usd).toBeCloseTo(0.007, 9);
  });

  it("starts a fresh bucket on a new UTC day (no carryover)", () => {
    const k = ipKey(req("1.2.3.4"));
    recordUsage(k, 1000, 500, DAY1);
    // First read on the new day rolls the bucket over.
    const r = getCostsReport(DAY2);
    expect(r.date).toBe("2026-05-31");
    expect(r.total_usd).toBe(0);
    expect(r.player_count).toBe(0);
  });

  it("records against the new day after rollover", () => {
    recordUsage(ipKey(req("1.2.3.4")), 1000, 500, DAY1);
    recordUsage(ipKey(req("1.2.3.4")), 2000, 0, DAY2); // $0.002 on day 2
    const r = getCostsReport(DAY2);
    expect(r.date).toBe("2026-05-31");
    expect(r.total_usd).toBeCloseTo(0.002, 9);
    expect(r.player_count).toBe(1);
  });
});
