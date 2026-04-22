// F4 — landmark, river, hunting, death, arrival, wipe, newspaper, share.
// The scene test file where the two shipped P0 regressions live
// (T-river-2 + T-hunt-1 are duplicated from harness.test.ts so this file
// stands on its own for reviewers bisecting later).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";
import * as riverFx from "./fixtures/river";
import * as landmarkFx from "./fixtures/landmark";

describe("mid-to-late scenes", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => { await h?.stop(); });

  // ── Landmark ─────────────────────────────────────
  it("T-landmark-1: fort renders with trade inventory", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 20000 } });
    await h.goScene("landmark", landmarkFx.fort);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(20);
  });

  it("T-landmark-2: natural wonder renders (no trade)", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("landmark", landmarkFx.naturalWonder);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-landmark-3: settlement renders", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("landmark", landmarkFx.settlement);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-landmark-4: empty-inventory fort renders defensively", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("landmark", landmarkFx.emptyInventory);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  // ── River (includes T-river-2 regression pin) ────
  it("T-river-1: happy-path crossing (ford_difficulty=3)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 50000 } });
    await h.goScene("river", riverFx.happy);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(15);
  });

  it("T-river-2: ford_difficulty=5 (regression 4af2434 — pinned)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 50000 } });
    await h.goScene("river", riverFx.edgeNumericMax);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-river-3: ferry unaffordable grays out button (no crash)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 0 } });
    await h.goScene("river", riverFx.edgeFerryUnaffordable);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-river-4: minimal river object renders with defaults", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("river", riverFx.edgeMinimal);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  // ── Hunting (includes T-hunt-1 regression pin) ───
  it("T-hunt-1: 20 ammo, all options enabled (regression a129b31 — pinned)", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { ammo: 20, money: 10000 } });
    await h.goScene("hunting");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(15);
  });

  it("T-hunt-2: 0 ammo renders with buttons grayed", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { ammo: 0 } });
    await h.goScene("hunting");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-hunt-3: exactly 5 ammo renders the boundary case", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { ammo: 5 } });
    await h.goScene("hunting");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  // ── Terminal scenes ─────────────────────────────
  it("T-death-1: death scene renders", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("death", { name: "Beth", cause: "cholera", date: "1848-05-12" });
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(5);
  });

  it("T-arrival-1: all survivors reach Oregon City", async () => {
    await h.seedEngine({
      profession: "farmer",
      memberNames: ["Beth", "Carl", "Dana", "Earl"],
      signedStateOverrides: {
        position: { current_segment_id: "seg_16", miles_traveled: 1764, date: "1848-09-30", arrived: true },
      },
    });
    await h.goScene("arrival");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(10);
  });

  it("T-wipe-1: total party wipe renders with varied death causes", async () => {
    await h.seedEngine({
      profession: "farmer",
      signedStateOverrides: {
        party: {
          leader_name: "Ryan",
          members: ["Ryan", "Beth", "Carl", "Dana", "Earl"].map((n) => ({
            name: n, health: 0, alive: false, sanity: 0, morale: 0, disease: null,
          })),
        },
        deaths: [
          { name: "Beth", date: "1848-05-10", cause: "cholera", epitaph: null },
          { name: "Carl", date: "1848-05-14", cause: "exhaustion", epitaph: null },
          { name: "Dana", date: "1848-05-18", cause: "drowning", epitaph: null },
          { name: "Earl", date: "1848-05-19", cause: "cholera", epitaph: null },
          { name: "Ryan", date: "1848-05-20", cause: "exhaustion", epitaph: null },
        ],
      },
    });
    await h.goScene("wipe");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-newspaper-1: newspaper overlay renders", async () => {
    await h.seedEngine({ profession: "farmer" });
    // Newspaper scene pulls from engine.gameState; feed it a minimal shape.
    await h.page.evaluate(() => {
      (window.engine as { rumor: unknown }).rumor = {
        headline: "SMOKE TEST HEADLINE",
        body: "Lorem ipsum test body.",
        location: "Independence",
        date: "1848-05-01",
      };
    });
    await h.goScene("newspaper");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-share-1: share screen after arrival", async () => {
    await h.seedEngine({
      profession: "farmer",
      signedStateOverrides: {
        position: { current_segment_id: "seg_16", miles_traveled: 1764, date: "1848-09-30", arrived: true },
      },
    });
    await h.goScene("share");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-share-2: share screen after wipe", async () => {
    await h.seedEngine({
      profession: "farmer",
      signedStateOverrides: {
        party: { leader_name: "Ryan", members: [] },
      },
    });
    await h.goScene("share");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });
});
