// F3 — travel + event + bitter_path scenes.
// These all need a seeded signedState since they run post-departure.
// Bitter Path CW gate + typewriter + outcome beats are covered here
// rather than in F4 because they share the #html-overlay render pattern
// with event.js.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";
import { segmentForMiles, segmentPaletteKeys } from "../../public/lib/segments.mjs";
import { PALETTE } from "../../public/lib/palette.mjs";
import * as eventFx from "./fixtures/event";
import * as bpFx from "./fixtures/bitter_path";

describe("travel + event + bitter_path scenes", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => { await h?.stop(); });

  it("T-travel-1: travel renders in low tone", async () => {
    await h.seedEngine({ profession: "farmer", tone: "low", memberNames: ["Beth", "Carl", "Dana", "Earl"] });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // Travel is the densest scene: parallax, hills, environment, wagon, HUD,
    // party silhouettes. Threshold from visual-qa.mjs — generous lower bound.
    expect(s.total).toBeGreaterThanOrEqual(100);
  });

  it("T-travel-2: travel renders in medium tone", async () => {
    await h.seedEngine({ profession: "farmer", tone: "medium" });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(100);
  });

  it("T-travel-3: travel renders in high tone (tone.mjs horror overlay)", async () => {
    await h.seedEngine({ profession: "farmer", tone: "medium" });
    await h.goScene("travel");
    const medium = await h.readStats();

    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(100);
    // Regression pin (2026-08-21): engine.tone read simulation.tone_tier, which
    // doesn't exist — settings.tone_tier is the real field — so this test rendered
    // the medium look for months while claiming to cover the horror overlay.
    const tone = await h.page.evaluate(() => (window.engine as { tone: string }).tone);
    expect(tone).toBe("high");
    // The tone.mjs high-tier layer (vignette + pulse + scanlines) must actually
    // add objects over the medium render, whatever its internal object count.
    expect(s.total).toBeGreaterThan(medium.total);
  });

  // Mood-arc bands (lib/segments.mjs). Travel is the only scene that paints the
  // arc. NOTE (review 2026-08-24): bad palette keys and missing biome rows do
  // NOT throw — segmentColor() and the DRESSING lookup both fall back silently —
  // so no-throw alone proves nothing about the arc. These tests therefore also
  // read back the drawn zenith band color and pin it to the segment's palette
  // entry, and a separate case invokes segmentPaletteKeys() (which DOES throw
  // on an unknown key). The segment id is pinned so a boundary edit can't
  // silently move a band out from under these seeds.
  const bandCases: Array<{ id: string; miles: number; segment: string; label: string }> = [
    { id: "T-travel-4", miles: 1000, segment: "arc_divide", label: "snow band (South Pass divide)" },
    { id: "T-travel-5", miles: 1300, segment: "arc_snake", label: "desert band (Snake River plain)" },
    { id: "T-travel-6", miles: 1550, segment: "arc_blue_mtns", label: "forest band (Blue Mountains)" },
  ];

  for (const band of bandCases) {
    it(`${band.id}: travel renders in the ${band.label}`, async () => {
      await h.seedEngine({
        profession: "farmer",
        tone: "medium",
        signedStateOverrides: {
          position: { current_segment_id: "seg_01", miles_traveled: band.miles, date: "1848-08-14" },
        },
      });
      await h.goScene("travel");
      const s = await h.readStats();
      expect(s.pageErrors).toEqual([]);
      expect(s.kaplayErrors).toEqual([]);
      expect(s.total).toBeGreaterThanOrEqual(100);

      const miles = await h.page.evaluate(() => (window.engine as { milesTraveled: number }).milesTraveled);
      expect(miles).toBe(band.miles);
      expect(segmentForMiles(miles).id).toBe(band.segment);

      // Read back the actual drawn sky: the topmost 640-wide gradient band
      // (y=0, thin, unfixed — the 640x44 HUD strip is k.fixed + z50) must be
      // the segment's zenith color. All three seeds sit outside blend windows,
      // so the drawn color is the pure palette entry, no lerp tolerance needed.
      const zenith = await h.page.evaluate(() => {
        const k = (window as unknown as { k: { get(tag: string, o?: object): unknown[] } }).k;
        const objs = k.get("*", { recursive: true }) as Array<{
          width?: number; height?: number; pos?: { y: number }; z?: number;
          color?: { r: number; g: number; b: number }; is(tag: string): boolean;
        }>;
        const band0 = objs.find((o) =>
          o.width === 640 && o.height !== undefined && o.height < 20 &&
          o.pos?.y === 0 && o.color && !o.is("hud-top"));
        return band0 ? [Math.round(band0.color!.r), Math.round(band0.color!.g), Math.round(band0.color!.b)] : null;
      });
      expect(zenith).toEqual(PALETTE[segmentForMiles(band.miles).palette.zenith]);
    });
  }

  it("T-arc-keys: every segment palette key resolves (throws on unknown)", () => {
    expect(() => segmentPaletteKeys()).not.toThrow();
    expect(segmentPaletteKeys().length).toBeGreaterThan(30);
  });

  it("T-event-4: choice result beat renders outcome + deltas and Continue returns to travel", async () => {
    await h.seedEngine({ profession: "farmer", tone: "medium" });
    await h.page.evaluate((ev) => { (window.engine as { currentEvent: unknown }).currentEvent = ev; }, eventFx.threeChoice);
    await h.goScene("event", eventFx.threeChoice);
    await h.page.waitForTimeout(500);

    // Drive the real result-beat path: real _statsDelta from two snapshots
    // differing by a known amount, real _holdResultBeat arming the transition —
    // the exact surface mutation-testing showed ships green when broken.
    await h.page.evaluate(() => {
      const e = window.engine as unknown as {
        _statsSnapshot(): Record<string, unknown>;
        _statsDelta(a: unknown, b: unknown): unknown;
        _holdResultBeat(fn: () => void): void;
        transition(s: string): void;
        emit(ev: string, payload: unknown): void;
      };
      const before = e._statsSnapshot() as Record<string, number>;
      const after = { ...before, food: (before.food as number) - 12 };
      e._holdResultBeat(() => e.transition("TRAVEL"));
      e.emit("choiceResolved", {
        choiceIndex: 0,
        choiceLabel: "Scavenge what you can",
        outcome: "You found little worth taking.",
        deltas: e._statsDelta(before, after),
      });
    });
    await h.page.waitForTimeout(300);
    let s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.overlayText).toContain("You chose: Scavenge what you can");
    expect(s.overlayText).toContain("You found little worth taking.");
    expect(s.overlayText).toContain("Food −12 lbs");
    expect(s.overlayText).toContain("Continue");

    await h.page.click("#event-continue button");
    await h.page.waitForTimeout(400);
    const scene = await h.page.evaluate(() => (window as unknown as { k: { getSceneName(): string } }).k.getSceneName());
    expect(scene).toBe("travel");
    s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
  });

  it("T-event-1: event with 3 choices renders", async () => {
    await h.seedEngine({ profession: "farmer", tone: "medium" });
    await h.page.evaluate((ev) => { (window.engine as { currentEvent: unknown }).currentEvent = ev; }, eventFx.threeChoice);
    await h.goScene("event", eventFx.threeChoice);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);
    expect(s.overlayText).toContain("Dead Oxen");
  });

  it("T-event-2: event with empty choices renders defensively", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.page.evaluate((ev) => { (window.engine as { currentEvent: unknown }).currentEvent = ev; }, eventFx.noChoices);
    await h.goScene("event", eventFx.noChoices);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-event-3: event with long description handles typewriter", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.page.evaluate((ev) => { (window.engine as { currentEvent: unknown }).currentEvent = ev; }, eventFx.longDescription);
    await h.goScene("event", eventFx.longDescription);
    // Wait long enough that if the typewriter was going to throw a styled-
    // text error (e.g. malformed [...] character in the long desc) it has.
    await h.page.waitForTimeout(2000);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  it("T-bp-1: bitter_path with CW unacked shows the warning modal", async () => {
    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.page.evaluate(
      ([ev, meta]) => {
        const e = window.engine as { currentBitterPath: unknown; currentBitterPathMeta: unknown };
        e.currentBitterPath = ev;
        e.currentBitterPathMeta = meta;
        localStorage.removeItem("ot_bitter_path_cw_acked");
      },
      [eventFx.bitterPathScene, bpFx.wastingVariant] as [unknown, unknown],
    );
    await h.goScene("bitter_path", eventFx.bitterPathScene);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);
    expect(s.overlayText).toContain("Content Warning");
    expect(s.overlayText).toContain("Donner Party");
  });

  it("T-bp-2: bitter_path with CW acked skips modal, shows scene body", async () => {
    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.page.evaluate(
      ([ev, meta]) => {
        const e = window.engine as { currentBitterPath: unknown; currentBitterPathMeta: unknown };
        e.currentBitterPath = ev;
        e.currentBitterPathMeta = meta;
        localStorage.setItem("ot_bitter_path_cw_acked", "true");
      },
      [eventFx.bitterPathScene, bpFx.wastingVariant] as [unknown, unknown],
    );
    await h.goScene("bitter_path", eventFx.bitterPathScene);
    // Let typewriter finish before the text assertion.
    await h.page.waitForTimeout(6500);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);
    expect(s.overlayText).toContain("The Long Night");
    // Dead-member subheading from trigger_meta.
    expect(s.overlayText).toContain("Sarah");
  });

  it("T-bp-3: bitter_path coerces hostile days_since_death (XSS-via-localStorage pin)", async () => {
    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.page.evaluate(
      ([ev, meta]) => {
        const e = window.engine as { currentBitterPath: unknown; currentBitterPathMeta: unknown };
        e.currentBitterPath = ev;
        e.currentBitterPathMeta = meta;
        localStorage.setItem("ot_bitter_path_cw_acked", "true");
      },
      [eventFx.bitterPathScene, bpFx.hostileDays] as [unknown, unknown],
    );
    await h.goScene("bitter_path", eventFx.bitterPathScene);
    await h.page.waitForTimeout(1000);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // The scene must NOT have rendered the hostile string as HTML. It should
    // be coerced to "yesterday" (because typeof !== "number") and the script
    // tag never touches innerHTML.
    expect(s.overlayText).not.toContain("<script>");
    expect(s.overlayText).not.toContain("alert(1)");
  });

  it("T-bp-4: bitter_path bails to TRAVEL if already resolved", async () => {
    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.page.evaluate(
      ([ev, meta]) => {
        const e = window.engine as {
          currentBitterPath: unknown;
          currentBitterPathMeta: unknown;
          signedState: { state: { simulation: { bitter_path_taken: string } } };
        };
        e.currentBitterPath = ev;
        e.currentBitterPathMeta = meta;
        e.signedState.state.simulation.bitter_path_taken = "taken";
        localStorage.setItem("ot_bitter_path_cw_acked", "true");
      },
      [eventFx.bitterPathScene, bpFx.wastingVariant] as [unknown, unknown],
    );
    await h.goScene("bitter_path", eventFx.bitterPathScene);
    await h.page.waitForTimeout(800);
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });
});
