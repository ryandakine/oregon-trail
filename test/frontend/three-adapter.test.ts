// Three.js state→3D adapter + weather bridge CI coverage (Builder D).
//
// The state→3D adapter (bootstrap.mjs §3.4) and weather bridge have zero CI
// coverage — deploy-smoke.mjs is the only prior gate, and it requires a live
// deployed URL. These Playwright tests run against the local static server so
// the CI suite catches adapter regressions before deploy.
//
// HOW 3D INIT IS ACTIVATED: ?test=1 wins first in shouldInit3D() and blocks
// Three.js, so the normal startHarness() URL (?test=1) can't be used. We reuse
// the server + page from startHarness(), then re-navigate with ?gfx=high (which
// forces 3D init regardless of pointer type) BEFORE waitForReady(), so the error
// listeners are already wired from startHarness().
//
// FOV FINGERPRINTS (read from PRESETS in bootstrap.mjs — do NOT guess):
//   travel  → 38   river → 40   fort (LANDMARK)    → 44
//   hunting → 46   death → 36   arrival             → 42
//
// WEATHER: weatherForMiles() is a deterministic hash of 150-mile bands.
//   miles=1300 → snow    miles=750 → dust    DEATH/ARRIVAL → always 'none'

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

declare global {
  interface Window {
    __three: {
      ready: boolean;
      camera: { fov: number };
      weather: { kind: string; intensity: number };
    };
  }
}

describe("three-adapter: state→3D adapter + weather bridge", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    // Re-navigate with ?gfx=high to activate Three.js (startHarness uses ?test=1
    // which blocks 3D per shouldInit3D). Error listeners are already wired by
    // startHarness, so this second goto retains all captures.
    await h.page.goto(`${h.url}/?gfx=high`, { waitUntil: "domcontentloaded" });
    // Wait for Kaplay + engine boot (same condition as waitForReady).
    await h.page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
    // Wait for __three to be set and marked ready. initThree runs fire-and-forget
    // after engine boot, so it finishes shortly after; poll with a tight timeout.
    await h.page.waitForFunction(
      () => !!window.__three && window.__three.ready === true,
      { timeout: 20000 },
    );
    // Seed engine with a default party so stateChange handlers have a valid
    // signedState to read milesTraveled from. Miles seeded to 100 (short trail
    // → roll < 30 chance of rain, but exact value doesn't matter here because
    // these first tests override miles explicitly per-test).
    await h.seedEngine({ profession: "farmer" });
  }, 60000);

  afterAll(async () => { await h?.stop(); });

  // ── Helper: fire stateChange and wait one tick for synchronous listeners ──
  async function emitStateChange(to: string, data: unknown = {}) {
    await h.page.evaluate(
      ([t, d]) => { window.engine.emit("stateChange", { from: "TRAVEL", to: t, data: d }); },
      [to, data] as [string, unknown],
    );
    // Synchronous listeners (the adapter) run inside evaluate(); a tiny tick lets
    // any microtasks settle before we read back camera state.
    await h.page.waitForTimeout(50);
  }

  // ── TRAVEL ───────────────────────────────────────────────────────────────────

  it("T-3d-1: TRAVEL → camera.fov === 38 (travel preset)", async () => {
    await emitStateChange("TRAVEL", {});
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(38);
  });

  // ── RIVER ────────────────────────────────────────────────────────────────────

  it("T-3d-2: RIVER → camera.fov === 40 (river preset)", async () => {
    await emitStateChange("RIVER", { width_ft: 230, ford_difficulty: 3 });
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(40);
  });

  // ── LANDMARK (fort) ──────────────────────────────────────────────────────────

  it("T-3d-3: LANDMARK fort → camera.fov === 44 (fort preset)", async () => {
    await emitStateChange("LANDMARK", { type: "fort", name: "Fort Laramie" });
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(44);
  });

  // ── LANDMARK (river_crossing falls back to travel) ───────────────────────────

  it("T-3d-4: LANDMARK river_crossing → camera.fov === 38 (travel fallback)", async () => {
    await emitStateChange("LANDMARK", { type: "river_crossing", name: "Kansas River Crossing" });
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(38);
  });

  // ── HUNTING ──────────────────────────────────────────────────────────────────

  it("T-3d-5: HUNTING → camera.fov === 46 (hunting preset)", async () => {
    await emitStateChange("HUNTING", {});
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(46);
  });

  // ── DEATH ────────────────────────────────────────────────────────────────────

  it("T-3d-6: DEATH → camera.fov === 36 (death preset)", async () => {
    await emitStateChange("DEATH", { name: "Beth", cause: "cholera" });
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(36);
  });

  // ── ARRIVAL ──────────────────────────────────────────────────────────────────

  it("T-3d-7: ARRIVAL → camera.fov === 42 (arrival preset)", async () => {
    await emitStateChange("ARRIVAL", {});
    const fov = await h.page.evaluate(() => window.__three.camera.fov);
    expect(fov).toBe(42);
  });

  // ── Non-world state hides the 3D canvas ──────────────────────────────────────

  it("T-3d-8: EVENT (non-world state) → three-canvas display:none", async () => {
    // First confirm the canvas is visible (ARRIVAL from prior test shows it).
    await emitStateChange("ARRIVAL", {});
    const visibleBefore = await h.page.evaluate(() => {
      const c = document.getElementById("three-canvas") as HTMLElement | null;
      return c ? c.style.display : "missing";
    });
    expect(visibleBefore).not.toBe("none");

    // Now fire a non-world state — the adapter calls api.hide() → display:none.
    await emitStateChange("EVENT", {});
    const display = await h.page.evaluate(() => {
      const c = document.getElementById("three-canvas") as HTMLElement | null;
      return c ? c.style.display : "missing";
    });
    expect(display).toBe("none");
  });

  // ── WEATHER BRIDGE ───────────────────────────────────────────────────────────
  //
  // weatherForMiles() is a deterministic band hash (no randomness):
  // band = floor(miles/150), roll = ((band*2654435761)>>>0) % 100.
  //   miles=1300 → band 8, roll 4  → snow  (4 < 55)
  //   miles=750  → band 5, roll 17 → dust  (17 < 45)
  // DEATH/ARRIVAL → always 'none' (forced clear by the adapter, §3.4)

  it("T-3d-9: TRAVEL at miles>1200 → weather.kind === 'snow'", async () => {
    // Set engine.milesTraveled via signedState (milesTraveled is a getter reading
    // signedState.state.position.miles_traveled; direct property assignment won't work).
    await h.page.evaluate(() => {
      const e = window.engine as { signedState: unknown; milesTraveled: number };
      const existing = (e.signedState as { state: Record<string, unknown> })?.state || {};
      e.signedState = {
        state: {
          ...existing,
          position: { current_segment_id: "seg_12", miles_traveled: 1300, date: "1848-08-15" },
        },
        signature: "test-signature",
      };
    });
    await emitStateChange("TRAVEL", {});
    const kind = await h.page.evaluate(() => window.__three.weather.kind);
    expect(kind).toBe("snow");
  });

  it("T-3d-10: TRAVEL at miles=750 → weather.kind === 'dust'", async () => {
    await h.page.evaluate(() => {
      const e = window.engine as { signedState: unknown; milesTraveled: number };
      const existing = (e.signedState as { state: Record<string, unknown> })?.state || {};
      e.signedState = {
        state: {
          ...existing,
          position: { current_segment_id: "seg_07", miles_traveled: 750, date: "1848-07-01" },
        },
        signature: "test-signature",
      };
    });
    await emitStateChange("TRAVEL", {});
    const kind = await h.page.evaluate(() => window.__three.weather.kind);
    expect(kind).toBe("dust");
  });

  it("T-3d-11: ARRIVAL always clears weather to 'none' regardless of miles", async () => {
    // Miles still at 750 (dust territory) from prior test — ARRIVAL must override.
    await emitStateChange("ARRIVAL", {});
    const kind = await h.page.evaluate(() => window.__three.weather.kind);
    expect(kind).toBe("none");
  });

  it("T-3d-12: DEATH always clears weather to 'none'", async () => {
    await h.page.evaluate(() => {
      const e = window.engine as { signedState: unknown };
      const existing = (e.signedState as { state: Record<string, unknown> })?.state || {};
      e.signedState = {
        state: {
          ...existing,
          position: { current_segment_id: "seg_12", miles_traveled: 1300, date: "1848-08-15" },
        },
        signature: "test-signature",
      };
    });
    await emitStateChange("DEATH", { name: "Carl", cause: "exhaustion" });
    const kind = await h.page.evaluate(() => window.__three.weather.kind);
    expect(kind).toBe("none");
  });
});
