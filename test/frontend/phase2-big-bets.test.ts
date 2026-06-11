// Phase 2 Big Bets — frontend lane (docs/PHASE2_BIG_BETS_PLAN.md).
// These tests encode the frozen contracts the worker lane is building against,
// with fetch mocked to the pinned response shapes (the worker code may not
// exist yet when these run):
//   Bet 1/2: terminal /api/advance and /api/newspaper responses carry
//            share: {url, score, challenge_id}; engine captures it at the two
//            pinned capture points; share.js prefers the /r/<id> URL and the
//            share text names challenge + score; the newspaper scene prints a
//            challenge/score line inside the captured region.
//   Bet 3:   engine.makeCamp() POSTs /api/camp, applies signed_state, returns
//            the summary, and RE-THROWS error codes (wrong_phase,
//            resolve_pending_event) to the caller; the travel pause overlay
//            has a Make Camp button that is disabled while an event pends.
// If any of these regress, a Phase 2 capability (viral share loop or the
// camp survival lever) is silently gone.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startHarness, type Harness } from "./harness";

// Pinned response contract: share object on terminal responses.
const SHARE_ADVANCE = {
  url: "https://trail.osi-cyber.com/r/abc.def",
  score: 1840,
  challenge_id: "speed_run",
};
const SHARE_NEWSPAPER = {
  url: "https://trail.osi-cyber.com/r/xyz.mac",
  score: 2150,
  challenge_id: "half_rations",
};

// Minimal-but-valid terminal state for mocked signed_state payloads — enough
// for every accessor advance()'s arrival path touches.
const TERMINAL_STATE = {
  party: { leader_name: "Ezra", members: [{ name: "Ezra", health: 80, alive: true, sanity: 90, morale: 80, disease: null }] },
  supplies: { food: 10, ammo: 0, clothing: 1, spare_parts: 0, medicine: 0, money: 0, oxen: 2 },
  position: { current_segment_id: "seg_16", miles_traveled: 1764, date: "1848-09-30" },
  settings: { pace: "steady", rations: "filling", tone_tier: "medium", challenge_id: "speed_run" },
  journal: [],
  deaths: [],
  simulation: {
    starvation_days: 0, days_since_last_event: 0,
    resolved_crossings: [], visited_landmarks: [],
    pending_event_hash: null, pending_event_trigger: null,
    landmark_rest_used: [], bitter_path_taken: "none",
  },
  meta: { run_id: "test-run", event_count: 0 },
};

type MockRoute = { status: number; body: unknown };

// Install a page-side fetch mock keyed by URL suffix. Anything unmatched
// falls through to the real fetch (static assets keep working).
async function mockApi(h: Harness, routes: Record<string, MockRoute>) {
  await h.page.evaluate((routesJson: string) => {
    const w = window as unknown as Record<string, unknown> & Window;
    if (!w.__origFetch) w.__origFetch = window.fetch.bind(window);
    const parsed = JSON.parse(routesJson) as Record<string, { status: number; body: unknown }>;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      for (const [suffix, r] of Object.entries(parsed)) {
        if (url.endsWith(suffix)) {
          return Promise.resolve(new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { "Content-Type": "application/json" },
          }));
        }
      }
      return (w.__origFetch as typeof window.fetch)(input, init);
    };
  }, JSON.stringify(routes));
}

async function restoreFetch(h: Harness) {
  await h.page.evaluate(() => {
    const w = window as unknown as Record<string, unknown> & Window;
    if (w.__origFetch) window.fetch = w.__origFetch as typeof window.fetch;
  });
}

// Open the travel pause overlay by dispatching a bubbling "p" keydown on the
// canvas (reaches kaplay whether it listens on the canvas or the document),
// then wait for the camp button to exist.
async function openPause(h: Harness) {
  await h.page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    canvas?.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
    setTimeout(() => {
      canvas?.dispatchEvent(new KeyboardEvent("keyup", { key: "p", code: "KeyP", bubbles: true }));
    }, 50);
  });
  await h.page.waitForFunction(() => {
    const k = window.k as unknown as { get?: (tag: string) => unknown[] };
    return !!k?.get && k.get("campBtn").length === 1;
  }, undefined, { timeout: 5000 });
}

describe("phase 2 big bets — share stub capture + Make Camp", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => { await h?.stop(); });

  afterEach(async () => { await restoreFetch(h); });

  // ── Bet 1 capture point #1: advance() ──
  it("T-share-capture-advance: terminal /api/advance share object lands in engine.shareInfo", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ezra" });
    await mockApi(h, {
      "/api/advance": {
        status: 200,
        body: {
          signed_state: { state: TERMINAL_STATE, signature: "sig-advance" },
          days_advanced: 1,
          summaries: [],
          trigger: "arrival",
          share: SHARE_ADVANCE,
        },
      },
    });
    const result = await h.page.evaluate(async () => {
      window.engine.shareInfo = null;
      window.engine._advancePaused = false;
      window.engine._advancing = false;
      await window.engine.advance();
      return { shareInfo: window.engine.shareInfo, state: window.engine.state };
    });
    expect(result.shareInfo).toEqual(SHARE_ADVANCE);
    expect(result.state).toBe("ARRIVAL");
  });

  // ── Bet 1 capture point #2: generateNewspaper() — covers resumed terminal
  // states. Also proves the newspaper scene prints the challenge + score line
  // inside the captured region (Bet 2). ──
  it("T-share-capture-newspaper: /api/newspaper share captured + challenge/score line in capture region", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ezra" });
    await mockApi(h, {
      "/api/newspaper": {
        status: 200,
        body: {
          newspaper_name: "The Oregon Spectator",
          date: "1848-09-30",
          headline: "EZRA PARTY REACHES OREGON CITY",
          byline: "From our correspondent",
          article_paragraphs: ["They made it."],
          survivors: ["Ezra"],
          deaths: [],
          share: SHARE_NEWSPAPER,
        },
      },
    });
    const result = await h.page.evaluate(async () => {
      window.engine.shareInfo = null;
      await window.engine.generateNewspaper();
      // transition('NEWSPAPER') → k.go is deferred a frame; let the scene mount.
      await new Promise((r) => setTimeout(r, 400));
      const el = document.getElementById("newspaper-content");
      return { shareInfo: window.engine.shareInfo, html: el ? el.innerHTML : "" };
    });
    expect(result.shareInfo).toEqual(SHARE_NEWSPAPER);
    // Challenge name (pretty form from CHALLENGE_INFO) + score, inside
    // #newspaper-content so the downloaded PNG carries it.
    expect(result.html).toContain("Half Rations");
    expect(result.html).toMatch(/2[,. ]?150/);
  });

  // ── Bet 1: share scene prefers the /r URL for Twitter intent + copy-link,
  // and the share text names challenge + score (Bet 2). ──
  it("T-share-url-preferred: share scene uses /r URL + names challenge and score", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ezra" });
    await h.page.evaluate((share) => {
      window.engine.shareInfo = share;
    }, SHARE_ADVANCE);
    await h.goScene("share");
    const out = await h.page.evaluate(async () => {
      const tw = document.getElementById("share-twitter") as HTMLAnchorElement | null;
      const copied: string[] = [];
      const tracked: Array<{ name: string; opts?: unknown }> = [];
      window.plausible = (name: string, opts?: unknown) => tracked.push({ name, opts });
      navigator.clipboard.writeText = (t: string) => { copied.push(t); return Promise.resolve(); };
      (document.getElementById("share-copy") as HTMLButtonElement | null)?.click();
      await new Promise((r) => setTimeout(r, 100));
      delete window.plausible;
      return { href: tw?.href || "", copied, tracked: tracked.map((t) => t.name) };
    });
    expect(out.href).toContain(encodeURIComponent("https://trail.osi-cyber.com/r/abc.def"));
    const decoded = decodeURIComponent(out.href);
    expect(decoded).toContain("Speed Run");
    expect(decoded).toMatch(/1[,. ]?840/);
    expect(out.copied[0]).toBe("https://trail.osi-cyber.com/r/abc.def");
    expect(out.tracked).toContain("share_link_used");
  });

  it("T-share-url-fallback: without shareInfo the UTM'd origin links remain", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ezra" });
    await h.page.evaluate(() => { window.engine.shareInfo = null; });
    await h.goScene("share");
    const href = await h.page.evaluate(() => {
      const tw = document.getElementById("share-twitter") as HTMLAnchorElement | null;
      return tw?.href || "";
    });
    expect(href).toContain("utm_medium%3Dtwitter");
    expect(href).not.toContain(encodeURIComponent("/r/"));
  });

  // ── Bet 3: engine.makeCamp applies signed_state, returns the pinned
  // summary shape, and tracks camp_made. ──
  it("T-camp-success: makeCamp applies signed_state, returns summary, tracks camp_made", async () => {
    await h.seedEngine({ profession: "farmer" });
    await mockApi(h, {
      "/api/camp": {
        status: 200,
        body: {
          signed_state: { state: TERMINAL_STATE, signature: "sig-camp" },
          summary: {
            date: "1848-05-02",
            food_consumed: 9,
            healed: [{ name: "Beth", hp_delta: 10 }],
            notes: ["A quiet night on the prairie."],
          },
        },
      },
    });
    const out = await h.page.evaluate(async () => {
      const tracked: string[] = [];
      window.plausible = (name: string) => tracked.push(name);
      const summary = await window.engine.makeCamp();
      delete window.plausible;
      return { summary, signature: window.engine.signedState?.signature, tracked };
    });
    expect(out.summary).toEqual({
      date: "1848-05-02",
      food_consumed: 9,
      healed: [{ name: "Beth", hp_delta: 10 }],
      notes: ["A quiet night on the prairie."],
    });
    expect(out.signature).toBe("sig-camp");
    expect(out.tracked).toContain("camp_made");
  });

  // ── Bet 3: error codes surface to the caller — no silent swallow. ──
  it("T-camp-wrong-phase: makeCamp rejects with wrong_phase from the contract error code", async () => {
    await h.seedEngine({ profession: "farmer" });
    await mockApi(h, {
      "/api/camp": { status: 400, body: { error: "wrong_phase" } },
    });
    const msg = await h.page.evaluate(async () => {
      try {
        await window.engine.makeCamp();
        return "no_error";
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(msg).toBe("wrong_phase");
  });

  // ── Bet 3: pause overlay camp button exists and calls engine.makeCamp. ──
  it("T-camp-button: pause overlay Make Camp button calls engine.makeCamp", async () => {
    // Keep travel's auto-advance off the network: any advance gets a 400.
    await mockApi(h, {
      "/api/advance": { status: 400, body: { error: "test_paused" } },
    });
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("travel");
    await openPause(h);
    const out = await h.page.evaluate(async () => {
      const k = window.k as unknown as { get: (tag: string) => Array<Record<string, unknown>> };
      const btn = k.get("campBtn")[0] as { campDisabled: boolean; doCamp: () => Promise<void> };
      let called = 0;
      const orig = window.engine.makeCamp;
      window.engine.makeCamp = async () => {
        called++;
        return { date: "1848-05-02", food_consumed: 9, healed: [], notes: ["The party rests."] };
      };
      await btn.doCamp();
      window.engine.makeCamp = orig;
      return { disabled: btn.campDisabled, called };
    });
    expect(out.disabled).toBe(false);
    expect(out.called).toBe(1);
  });

  // ── Bet 3: button is disabled while an event is pending — clicking it
  // never reaches the engine. ──
  it("T-camp-disabled-pending: Make Camp is disabled while an event pends", async () => {
    await mockApi(h, {
      "/api/advance": { status: 400, body: { error: "resolve_pending_event" } },
    });
    await h.seedEngine({
      profession: "farmer",
      signedStateOverrides: {
        simulation: {
          starvation_days: 0, days_since_last_event: 0,
          resolved_crossings: [], visited_landmarks: [],
          pending_event_hash: "abc123", pending_event_trigger: "event",
          landmark_rest_used: [], bitter_path_taken: "none",
        },
      },
    });
    await h.goScene("travel");
    await openPause(h);
    const out = await h.page.evaluate(async () => {
      const k = window.k as unknown as { get: (tag: string) => Array<Record<string, unknown>> };
      const btn = k.get("campBtn")[0] as { campDisabled: boolean; doCamp: () => Promise<void> };
      let called = 0;
      const orig = window.engine.makeCamp;
      window.engine.makeCamp = async () => { called++; return {}; };
      await btn.doCamp();
      window.engine.makeCamp = orig;
      return { disabled: btn.campDisabled, called };
    });
    expect(out.disabled).toBe(true);
    expect(out.called).toBe(0);
  });
});
