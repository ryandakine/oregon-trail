import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// runCanary depends on callAnthropic's documented throw contract (any non-2xx
// or network failure throws) rather than the retry-ladder internals, which
// are anthropic.test.ts's surface. Mocking the module boundary keeps this
// suite focused on scheduled()/runCanary/sendTelegram — the region this file
// is for — without re-deriving callAnthropic's own retry semantics.
vi.mock("../src/anthropic", () => ({
  callAnthropic: vi.fn(),
  parseEventResponse: vi.fn(),
  FALLBACK_EVENTS: { low: [], medium: [], high: [] },
  generateLongNight: vi.fn(),
  buildLongNightFallback: vi.fn(),
  bitterPathConsequences: vi.fn(),
}));

import { runCanary, __resetCanaryAlertState } from "../src/index";
import { callAnthropic } from "../src/anthropic";
import type { Env } from "../src/index";

const env: Env = {
  HMAC_SECRET: "test-secret",
  ANTHROPIC_API_KEY: "test-key",
  ALLOWED_ORIGIN: "*",
  TELEGRAM_BOT_TOKEN: "test-bot-token",
  TELEGRAM_CHAT_ID: "999",
};

const mockedCallAnthropic = vi.mocked(callAnthropic);

// Real shape callAnthropic throws for a non-retryable status (see
// anthropic.ts: only 429/529 retry; every other non-ok status throws
// immediately from attempt 0) — reproduces the actual out-of-credit
// production symptom: HTTP 400 invalid_request_error, NOT the 401 a dead key
// produces, and not one of the retried statuses either.
const LOW_CREDIT_ERROR = new Error(
  'Anthropic API 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
);

function telegramCalls() {
  return vi.mocked(fetch).mock.calls;
}

function lastTelegramBody(): { chat_id: string; text: string } {
  const calls = telegramCalls();
  const [, init] = calls[calls.length - 1];
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  __resetCanaryAlertState();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runCanary — a low-credit 400 trips the same failure path as a dead key", () => {
  it("catches the thrown error and pages Telegram", async () => {
    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env);

    expect(telegramCalls()).toHaveLength(1);
    const [url] = telegramCalls()[0];
    expect(String(url)).toBe("https://api.telegram.org/bottest-bot-token/sendMessage");
    const body = lastTelegramBody();
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("FAILED");
    expect(body.text).toContain("credit balance is too low");
  });

  it("a healthy reply never touches Telegram", async () => {
    mockedCallAnthropic.mockResolvedValueOnce("OK");
    await runCanary(env);
    expect(telegramCalls()).toHaveLength(0);
  });
});

describe("runCanary — re-alert cadence while down", () => {
  it("does not re-page on every consecutive failing run within the window", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env);
    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env);
    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env);

    // Cron is hourly; three back-to-back failing runs with no time elapsed
    // must not produce three pages.
    expect(telegramCalls()).toHaveLength(1);
  });

  it("re-pages once the cadence window elapses while still down", async () => {
    const t0 = Date.now();
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(t0);

    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env); // page #1

    dateSpy.mockReturnValue(t0 + 6 * 60 * 60 * 1000); // 6h later, still down
    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env); // page #2 — cadence elapsed

    expect(telegramCalls()).toHaveLength(2);
  });
});

describe("runCanary — recovery", () => {
  it("sends one distinct all-clear on recovery, then stays silent while healthy", async () => {
    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env); // page #1 (down)

    mockedCallAnthropic.mockResolvedValueOnce("OK");
    await runCanary(env); // recovers → all-clear

    expect(telegramCalls()).toHaveLength(2);
    expect(lastTelegramBody().text).toContain("recovered");

    mockedCallAnthropic.mockResolvedValueOnce("OK");
    await runCanary(env); // still healthy → no third page
    expect(telegramCalls()).toHaveLength(2);
  });

  it("a fresh failure right after recovery pages immediately (cadence resets, isn't throttled by the old outage)", async () => {
    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env); // page #1

    mockedCallAnthropic.mockResolvedValueOnce("OK");
    await runCanary(env); // all-clear, page #2

    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env); // new outage

    expect(telegramCalls()).toHaveLength(3);
  });
});

describe("sendTelegram — delivery failures are no longer swallowed silently", () => {
  it("logs canary_alert_rejected when Telegram responds non-ok (bad token/chat_id)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":false,"description":"Unauthorized"}', { status: 401 })),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(env);

    expect(errorSpy).toHaveBeenCalledWith("canary_alert_rejected", expect.stringContaining('"status":401'));
  });

  it("does not throw when the Telegram fetch itself throws (network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await expect(runCanary(env)).resolves.toBeUndefined();
  });

  it("logs instead of paging when the secrets are unset", async () => {
    const unconfigured: Env = { ...env, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockedCallAnthropic.mockRejectedValueOnce(LOW_CREDIT_ERROR);
    await runCanary(unconfigured);

    expect(telegramCalls()).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith("canary_alert_unsent", expect.any(String));
  });
});
