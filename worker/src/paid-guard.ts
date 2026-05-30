// Per-IP load-shedding for paid (Anthropic-spending) routes.
//
// This is NOT the global spend ceiling — the real global cap is a budget set on
// the Anthropic account/workspace that owns the key (exact-at-the-dollar, free,
// zero-ops). When that budget is hit, Anthropic returns a credit error the paid
// handlers already catch and degrade to hand-written fallbacks. This module is
// the *worker-side* complement: it sheds abusive per-IP load so a single source
// can't drain the day's budget, and it never blocks gameplay — a blocked paid
// call serves the same fallback the handler already has, so the player keeps
// playing with canned content instead of AI.
//
// Two layers, both per-IP, both degrade to fallback (never 429 here — the
// existing coarse in-memory limiter in index.ts owns all-route flood 429s):
//   B. Native Cloudflare Rate Limiting binding (per-colo, shared across
//      isolates in a colo) — a *rate* cap (e.g. 15/min/IP).
//   C. In-memory daily volume sub-cap (per-isolate) — a coarse *volume* cap
//      (e.g. 60/IP/day) so a paced single source still can't dominate.
//
// Distributed abuse across many IPs/colos is bounded by the Anthropic budget,
// not by this module — by design (no Durable Object, no KV, no Workers Paid).

export interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface PaidGuardEnv {
  PAID_LIMITER?: RateLimitBinding;
  PAID_PER_IP_DAY_CAP?: string;
}

export const DEFAULT_DAY_CAP = 60;

export type GuardReason = "ok" | "rate_limited" | "day_capped";
export interface GuardResult {
  allowed: boolean;
  reason: GuardReason;
}

interface DayBucket {
  day: string;
  count: number;
}

// Per-isolate in-memory daily counters. Bounds a single source within an
// isolate; the Anthropic budget is what bounds aggregate spend globally.
const dayCounts = new Map<string, DayBucket>();
let guardCallCount = 0;

// Mirrors the cleanup on the sibling rateLimitMap in index.ts: without it the
// key cardinality grows unbounded over the isolate's lifetime (one entry per
// distinct IP/64 ever seen). Prune stale-day entries periodically and hard-cap
// the map size as a backstop.
function pruneDayCounts(today: string): void {
  guardCallCount++;
  if (guardCallCount % 200 === 0 || dayCounts.size > 10_000) {
    for (const [key, bucket] of dayCounts) {
      if (bucket.day !== today) dayCounts.delete(key);
    }
  }
}

/** Test seam — clear in-memory daily counters between tests. */
export function __resetDayCounts(): void {
  dayCounts.clear();
  guardCallCount = 0;
}

/** UTC calendar day, "YYYY-MM-DD". */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Expand an IPv6 address (handling one "::") and return its /64 prefix key. */
function ipv6Slash64(addr: string): string {
  const a = addr.replace(/^\[/, "").replace(/\]$/, "").split("%")[0];
  let hextets: string[];
  if (a.includes("::")) {
    const [head, tail] = a.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    const missing = 8 - headParts.length - tailParts.length;
    hextets = [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...tailParts];
  } else {
    hextets = a.split(":");
  }
  const first4 = hextets.slice(0, 4).map((h) => (h === "" ? "0" : h.toLowerCase()));
  while (first4.length < 4) first4.push("0");
  return first4.join(":") + "::/64";
}

/**
 * Stable rate-limit key for a request.
 * - IPv4 → the address.
 * - IPv6 → normalized /64 prefix (a /128 key would let one attacker rotate a
 *   residential/VPS /64 for free).
 * - Missing CF-Connecting-IP → a single shared "_noip" bucket. NEVER a unique
 *   per-request key — that would silently disable the limiter for header-less
 *   or spoofed requests.
 */
export function ipKey(request: Request): string {
  const raw = request.headers.get("CF-Connecting-IP");
  if (!raw) return "_noip";
  const ip = raw.trim();
  if (!ip) return "_noip";
  return ip.includes(":") ? ipv6Slash64(ip) : ip;
}

/**
 * Parse the configured per-IP daily cap with a NaN guard. Garbage or missing
 * falls back to DEFAULT_DAY_CAP — never Infinity. A bad env var must NOT
 * silently disable the cap; an invisibly-disabled limiter is the exact failure
 * this whole change exists to prevent.
 */
export function parseDayCap(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAY_CAP;
  return Math.floor(n);
}

/** Pure decision for the daily volume sub-cap. */
export function evalDayCap(
  stored: DayBucket | undefined,
  today: string,
  cap: number,
): { allowed: boolean; next: DayBucket } {
  if (!stored || stored.day !== today) {
    return { allowed: true, next: { day: today, count: 1 } };
  }
  if (stored.count >= cap) {
    return { allowed: false, next: stored };
  }
  return { allowed: true, next: { day: today, count: stored.count + 1 } };
}

/**
 * Guard a paid (Anthropic-spending) call: Layer B (native per-IP rate) then
 * Layer C (per-IP daily volume). Returns whether to proceed to Anthropic.
 *
 * Callers serve their existing fallback when `allowed` is false — they do NOT
 * return an HTTP error (a 429 mid-/advance would discard an already-committed
 * simulation step). `reason` is for structured logging only.
 *
 * `now` is injectable for deterministic tests.
 */
export async function guardPaidCall(
  env: PaidGuardEnv,
  request: Request,
  now: Date = new Date(),
): Promise<GuardResult> {
  const key = ipKey(request);

  // Layer B — native per-IP rate limit (per-colo). Absent in tests/dev → skip.
  if (env.PAID_LIMITER) {
    try {
      const { success } = await env.PAID_LIMITER.limit({ key });
      if (!success) return { allowed: false, reason: "rate_limited" };
    } catch {
      // Binding/infra error: don't block on it. Daily cap below + the Anthropic
      // account budget still bound spend.
    }
  }

  // Layer C — per-IP daily volume sub-cap (in-memory, per-isolate).
  const cap = parseDayCap(env.PAID_PER_IP_DAY_CAP);
  const today = utcDay(now);
  pruneDayCounts(today);
  const { allowed, next } = evalDayCap(dayCounts.get(key), today, cap);
  dayCounts.set(key, next);
  if (!allowed) return { allowed: false, reason: "day_capped" };

  return { allowed: true, reason: "ok" };
}
