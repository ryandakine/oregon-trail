import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock anthropic so we can assert the paid call is SKIPPED when the guard blocks.
vi.mock("../src/anthropic", () => ({
  callAnthropic: vi.fn(async () => { throw new Error("anthropic should not be called when guard blocks"); }),
  parseEventResponse: vi.fn(),
  FALLBACK_EVENTS: { low: [], medium: [], high: [] },
  generateLongNight: vi.fn(),
  buildLongNightFallback: vi.fn(),
  bitterPathConsequences: vi.fn(),
}));

import worker from "../src/index";
import { callAnthropic } from "../src/anthropic";
import { createInitialState } from "../src/state";
import { signState } from "../src/hmac";
import { __resetDayCounts } from "../src/paid-guard";

const SECRET = "test-secret-key-for-testing-only-not-real";
const MEMBERS: [string, string, string, string] = ["Beth", "Carl", "Dana", "Earl"];

// Env whose native limiter always denies → forces guardPaidCall to block,
// so the handler must serve its fallback WITHOUT touching Anthropic.
const denyingEnv = () => ({
  HMAC_SECRET: SECRET,
  ANTHROPIC_API_KEY: "test-key",
  ALLOWED_ORIGIN: "*",
  PAID_LIMITER: { limit: async () => ({ success: false }) },
});

const post = (path: string, body: unknown) =>
  new Request(`https://test.local${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  __resetDayCounts();
  vi.clearAllMocks();
});

describe("paid-route guard — handler fallback when blocked", () => {
  it("newspaper: blocked guard → 200 fallback, Anthropic NOT called", async () => {
    const { state } = await createInitialState("Smith", MEMBERS, "farmer", "medium", SECRET);
    // Make the newspaper available: wipe the party.
    for (const m of state.party.members) m.alive = false;
    const signature = await signState(state, SECRET);

    const res = await worker.fetch(post("/api/newspaper", { signed_state: { state, signature } }) as any, denyingEnv() as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(typeof body.headline).toBe("string");
    expect(body.headline.length).toBeGreaterThan(0);
    expect(Array.isArray(body.article_paragraphs)).toBe(true);
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it("epitaph: blocked guard → 200 fallback inscription, Anthropic NOT called", async () => {
    const { state } = await createInitialState("Smith", MEMBERS, "farmer", "medium", SECRET);
    state.deaths.push({ name: "Carl", cause: "cholera", date: "1848-06-01", epitaph: null });
    const signature = await signState(state, SECRET);

    const res = await worker.fetch(post("/api/epitaph", { signed_state: { state, signature }, name: "Carl" }) as any, denyingEnv() as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.epitaph).toContain("Carl");
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it("free route (challenge) is unaffected by a denying paid limiter", async () => {
    const res = await worker.fetch(
      new Request("https://test.local/api/challenge", { method: "GET", headers: { "CF-Connecting-IP": "9.9.9.9" } }) as any,
      denyingEnv() as any,
    );
    expect(res.status).toBe(200);
  });
});
