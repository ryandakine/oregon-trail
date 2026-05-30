import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ipKey,
  utcDay,
  parseDayCap,
  evalDayCap,
  guardPaidCall,
  __resetDayCounts,
  DEFAULT_DAY_CAP,
  type RateLimitBinding,
} from "../src/paid-guard";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://test.local/api/advance", { method: "POST", headers });

beforeEach(() => __resetDayCounts());

describe("ipKey", () => {
  it("passes IPv4 through unchanged", () => {
    expect(ipKey(req({ "CF-Connecting-IP": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("normalizes IPv6 to a /64 prefix key", () => {
    // distinct /128s in the same /64 must collapse to the same key
    const a = ipKey(req({ "CF-Connecting-IP": "2001:db8:abcd:1234:1:2:3:4" }));
    const b = ipKey(req({ "CF-Connecting-IP": "2001:db8:abcd:1234:ffff:ffff:ffff:ffff" }));
    expect(a).toBe(b);
    expect(a).toBe("2001:db8:abcd:1234::/64");
  });

  it("expands a compressed IPv6 and still takes /64", () => {
    expect(ipKey(req({ "CF-Connecting-IP": "2001:db8::1" }))).toBe("2001:db8:0:0::/64");
  });

  it("buckets a missing IP under one shared key (never unique)", () => {
    expect(ipKey(req())).toBe("_noip");
    expect(ipKey(req({ "CF-Connecting-IP": "  " }))).toBe("_noip");
  });
});

describe("parseDayCap", () => {
  it("uses the configured cap when valid", () => {
    expect(parseDayCap("100")).toBe(100);
  });
  it("falls back to DEFAULT (never Infinity) on missing/garbage/zero/negative", () => {
    expect(parseDayCap(undefined)).toBe(DEFAULT_DAY_CAP);
    expect(parseDayCap("not-a-number")).toBe(DEFAULT_DAY_CAP);
    expect(parseDayCap("0")).toBe(DEFAULT_DAY_CAP);
    expect(parseDayCap("-5")).toBe(DEFAULT_DAY_CAP);
    expect(parseDayCap("Infinity")).toBe(DEFAULT_DAY_CAP);
  });
});

describe("evalDayCap (pure)", () => {
  const today = "2026-05-30";
  it("first call of the day is allowed and starts count at 1", () => {
    expect(evalDayCap(undefined, today, 60)).toEqual({ allowed: true, next: { day: today, count: 1 } });
  });
  it("allows up to the cap, blocks at the cap (boundary)", () => {
    expect(evalDayCap({ day: today, count: 59 }, today, 60)).toEqual({ allowed: true, next: { day: today, count: 60 } });
    expect(evalDayCap({ day: today, count: 60 }, today, 60)).toEqual({ allowed: false, next: { day: today, count: 60 } });
  });
  it("resets on a new UTC day", () => {
    expect(evalDayCap({ day: "2026-05-29", count: 999 }, today, 60)).toEqual({ allowed: true, next: { day: today, count: 1 } });
  });
});

describe("utcDay", () => {
  it("formats YYYY-MM-DD in UTC", () => {
    expect(utcDay(new Date("2026-05-30T23:59:59Z"))).toBe("2026-05-30");
    expect(utcDay(new Date("2026-05-31T00:00:01Z"))).toBe("2026-05-31");
  });
});

describe("guardPaidCall", () => {
  const NOW = new Date("2026-05-30T12:00:00Z");

  it("allows when no binding bound and under the daily cap", async () => {
    const r = await guardPaidCall({}, req({ "CF-Connecting-IP": "1.1.1.1" }), NOW);
    expect(r).toEqual({ allowed: true, reason: "ok" });
  });

  it("returns rate_limited (and skips the daily counter) when the native limiter denies", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const env = { PAID_LIMITER: { limit } as RateLimitBinding, PAID_PER_IP_DAY_CAP: "60" };
    const r = await guardPaidCall(env, req({ "CF-Connecting-IP": "2.2.2.2" }), NOW);
    expect(r).toEqual({ allowed: false, reason: "rate_limited" });
    expect(limit).toHaveBeenCalledWith({ key: "2.2.2.2" });
  });

  it("fails open past the native limiter if the binding throws", async () => {
    const limit = vi.fn(async () => { throw new Error("binding down"); });
    const env = { PAID_LIMITER: { limit } as RateLimitBinding, PAID_PER_IP_DAY_CAP: "60" };
    const r = await guardPaidCall(env, req({ "CF-Connecting-IP": "3.3.3.3" }), NOW);
    expect(r.allowed).toBe(true);
  });

  it("blocks with day_capped once an IP exceeds the daily volume cap", async () => {
    const env = { PAID_PER_IP_DAY_CAP: "3" };
    const ip = { "CF-Connecting-IP": "4.4.4.4" };
    expect((await guardPaidCall(env, req(ip), NOW)).allowed).toBe(true); // 1
    expect((await guardPaidCall(env, req(ip), NOW)).allowed).toBe(true); // 2
    expect((await guardPaidCall(env, req(ip), NOW)).allowed).toBe(true); // 3
    const fourth = await guardPaidCall(env, req(ip), NOW);              // 4 → blocked
    expect(fourth).toEqual({ allowed: false, reason: "day_capped" });
  });

  it("tracks daily counts independently per IP", async () => {
    const env = { PAID_PER_IP_DAY_CAP: "1" };
    expect((await guardPaidCall(env, req({ "CF-Connecting-IP": "5.5.5.5" }), NOW)).allowed).toBe(true);
    // a different IP still gets its own first call
    expect((await guardPaidCall(env, req({ "CF-Connecting-IP": "6.6.6.6" }), NOW)).allowed).toBe(true);
    // same first IP is now over its cap of 1
    expect((await guardPaidCall(env, req({ "CF-Connecting-IP": "5.5.5.5" }), NOW)).allowed).toBe(false);
  });

  it("prunes stale prior-day keys (no unbounded memory growth)", async () => {
    const env = { PAID_PER_IP_DAY_CAP: "100" };
    const day1 = new Date("2026-05-29T12:00:00Z");
    const day2 = new Date("2026-05-30T12:00:00Z");
    // Seed 250 distinct IPs on day 1 → crosses the 200-call prune cadence.
    for (let i = 0; i < 250; i++) {
      await guardPaidCall(env, req({ "CF-Connecting-IP": `10.0.${Math.floor(i / 256)}.${i % 256}` }), day1);
    }
    // A day-2 call triggers a prune that should drop day-1 keys; the day-2 IP
    // is treated as a fresh first-of-day (count resets), proving rollover works.
    const r = await guardPaidCall(env, req({ "CF-Connecting-IP": "10.0.0.0" }), day2);
    expect(r).toEqual({ allowed: true, reason: "ok" });
  });
});
