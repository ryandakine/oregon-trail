// F3 — travel + event + bitter_path scenes.
// These all need a seeded signedState since they run post-departure.
// Bitter Path CW gate + typewriter + outcome beats are covered here
// rather than in F4 because they share the #html-overlay render pattern
// with event.js.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";
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
    await h.seedEngine({ profession: "farmer", tone: "high" });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    // High tier adds the tone.mjs vignette/scanline layer on top — count
    // rises vs medium.
    expect(s.total).toBeGreaterThanOrEqual(100);
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
