// F5 — player agency + virality features added per IMPROVEMENT_ROADMAP §1-2.
// These tests encode the *intent* behind each change, not just "renders clean":
//   §1.1 the five mid-run scenes are tap-reachable without a keyboard
//   §1.3 Hunt + pace/rations controls are wired to the existing engine methods
//   §1.4 localStorage meta-progression surfaces on the title screen
//   §1.5 the "written live by Claude" loading overlay subscribes to 'loading'
//   §2   emoji trail strip, random-names button, lazy html2canvas
// If any of these regress, a user-facing capability the roadmap shipped is gone.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";
import * as riverFx from "./fixtures/river";
import * as landmarkFx from "./fixtures/landmark";

describe("agency + virality features", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => { await h?.stop(); });

  // ── §1.1 Tap reachability — clickable (area) objects on every mid-run scene ──
  // The roadmap's P-critical fix: a phone visitor must be able to advance.
  // k.get("area") returns GameObjs carrying an area() component (tap targets).
  const countAreas = async () =>
    h.page.evaluate(() => {
      const objs = window.k.get ? window.k.get("area") : [];
      return Array.isArray(objs) ? objs.length : 0;
    });

  it("T-tap-river: river crossing exposes clickable buttons", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 50000 } });
    await h.goScene("river", riverFx.happy);
    expect(await countAreas()).toBeGreaterThanOrEqual(3); // ford + caulk + ferry
  });

  it("T-tap-hunting: hunting exposes clickable option buttons", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { ammo: 20 } });
    await h.goScene("hunting");
    expect(await countAreas()).toBeGreaterThanOrEqual(4); // 5/10/20/cancel
  });

  it("T-tap-death: death scene is tap-reachable (download + continue)", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("death", { name: "Beth", cause: "cholera", date: "1848-05-12" });
    expect(await countAreas()).toBeGreaterThanOrEqual(1);
  });

  it("T-tap-arrival: arrival exposes a clickable Read Newspaper button", async () => {
    await h.seedEngine({
      profession: "farmer",
      signedStateOverrides: {
        position: { current_segment_id: "seg_16", miles_traveled: 1764, date: "1848-09-30", arrived: true },
      },
    });
    await h.goScene("arrival");
    expect(await countAreas()).toBeGreaterThanOrEqual(1);
  });

  it("T-tap-wipe: wipe exposes a clickable Read Newspaper button", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("wipe");
    expect(await countAreas()).toBeGreaterThanOrEqual(1);
  });

  // ── §1.3 Hunt action on travel HUD wired to engine.startHunt() ──
  it("T-agency-hunt: travel Hunt button routes to the HUNTING scene", async () => {
    await h.seedEngine({ profession: "farmer", tone: "medium", supplies: { ammo: 20 } });
    await h.goScene("travel");
    // Travel auto-advances via the API (which 404s in-harness); but startHunt
    // is synchronous and state-gated to TRAVEL. Drive it directly to prove the
    // wiring exists and reaches the hunting scene.
    const reached = await h.page.evaluate(async () => {
      window.engine.state = "TRAVEL";
      window.engine.startHunt();
      // k.go is deferred a frame; let it settle.
      await new Promise((r) => setTimeout(r, 50));
      return window.engine.state;
    });
    expect(reached).toBe("HUNTING");
  });

  // ── §1.3 Landmark Hunt routes back to TRAVEL with a pending-hunt flag ──
  it("T-agency-landmark-hunt: landmark Hunt sets pending flag + returns to TRAVEL", async () => {
    await h.seedEngine({ profession: "farmer", supplies: { money: 20000 } });
    await h.goScene("landmark", landmarkFx.fort);
    // Read state synchronously in the same evaluate: requestHuntFromLandmark
    // sets the flag + transitions, but k.go to TRAVEL is deferred a frame, so
    // the travel scene (which consumes the flag on mount) hasn't run yet here.
    const result = await h.page.evaluate(() => {
      window.engine.requestHuntFromLandmark();
      return {
        state: window.engine.state,
        pending: window.engine._pendingHuntOnTravel === true,
        landmarkCleared: window.engine.currentLandmark === null,
      };
    });
    expect(result.state).toBe("TRAVEL");
    expect(result.pending).toBe(true);
    expect(result.landmarkCleared).toBe(true);

    // consumePendingHunt is one-shot — first read returns true, second false.
    const consumed = await h.page.evaluate(() => {
      window.engine._pendingHuntOnTravel = true;
      return [window.engine.consumePendingHunt(), window.engine.consumePendingHunt()];
    });
    expect(consumed).toEqual([true, false]);
  });

  // ── §1.3 changePace/changeRations stage an override for the next advance ──
  it("T-agency-pace-rations: change* methods set pendingPace/pendingRations", async () => {
    await h.seedEngine({ profession: "farmer" });
    const staged = await h.page.evaluate(() => {
      window.engine.changePace("grueling");
      window.engine.changeRations("bare_bones");
      return { pace: window.engine.pendingPace, rations: window.engine.pendingRations };
    });
    expect(staged).toEqual({ pace: "grueling", rations: "bare_bones" });
  });

  // ── §1.4 Meta-progression persists and summarises on the title screen ──
  it("T-meta-summary: getMetaSummary reflects recorded runs", async () => {
    const summary = await h.page.evaluate(() => {
      localStorage.removeItem("ot_meta");
      const before = window.GameEngine.getMetaSummary();
      // Simulate finishing a medium-tone run reaching mile 900 with 3 survivors.
      window.engine.signedState = {
        state: {
          position: { miles_traveled: 900 },
          party: { members: [{ alive: true }, { alive: true }, { alive: true }, { alive: false }, { alive: false }] },
          simulation: { tone_tier: "medium", bitter_path_taken: "none" },
        },
        signature: "t",
      };
      window.engine.profession = "farmer";
      window.engine.recordRunOutcome(true);
      const after = window.GameEngine.getMetaSummary();
      const meta = window.GameEngine.getMeta();
      return { before, after, meta };
    });
    expect(summary.before).toContain("No runs yet");
    expect(summary.after).toContain("900 mi");
    expect(summary.after).toContain("1 run");
    // Horror tier not cleared yet → the line nudges toward it.
    expect(summary.after).toContain("Horror not yet survived");
    expect(summary.meta.runs).toBe(1);
    expect(summary.meta.tonesCleared.medium).toBe(true);
  });

  it("T-meta-title: title screen renders the meta line without styled-text errors", async () => {
    await h.page.evaluate(() => {
      localStorage.removeItem("ot_meta");
      window.GameEngine.getMeta(); // ensure module loaded
    });
    await h.goScene("title");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
  });

  // ── §1.5 "Written live by Claude" loading overlay subscribes to 'loading' ──
  it("T-loading-overlay: emit('loading', true) shows the AI overlay, false hides it", async () => {
    const result = await h.page.evaluate(() => {
      // Not on the TONE scene (which runs its own inline loading state).
      window.engine.state = "TRAVEL";
      window.engine.emit("loading", true);
      const el = document.getElementById("ai-loading");
      const shownDisplay = el ? getComputedStyle(el).display : "missing";
      const shownText = el ? el.textContent : "";
      window.engine.emit("loading", false);
      const hiddenDisplay = el ? getComputedStyle(el).display : "missing";
      return { shownDisplay, shownText, hiddenDisplay };
    });
    expect(result.shownDisplay).not.toBe("none");
    expect(result.shownText).toContain("Claude");
    expect(result.hiddenDisplay).toBe("none");
  });

  it("T-loading-overlay-tone: overlay is suppressed on the TONE scene", async () => {
    const display = await h.page.evaluate(() => {
      window.engine.state = "TONE";
      window.engine.emit("loading", true);
      const el = document.getElementById("ai-loading");
      const d = el ? getComputedStyle(el).display : "missing";
      window.engine.emit("loading", false);
      return d;
    });
    expect(display).toBe("none");
  });

  // ── §1.5 engine.track is a never-throwing Plausible wrapper ──
  it("T-track-safe: engine.track never throws even with no plausible loaded", async () => {
    const threw = await h.page.evaluate(() => {
      try {
        delete window.plausible;
        window.engine.track("run_started", { tone: "high" });
        window.engine.track("share_clicked");
        return false;
      } catch (_) {
        return true;
      }
    });
    expect(threw).toBe(false);
  });

  it("T-track-fires: engine.track forwards to window.plausible when present", async () => {
    const calls = await h.page.evaluate(() => {
      const captured: Array<{ name: string; opts?: unknown }> = [];
      window.plausible = (name: string, opts?: unknown) => captured.push({ name, opts });
      window.engine.track("osi_link_clicked", { from: "share" });
      window.engine.track("run_completed");
      delete window.plausible;
      return captured;
    });
    expect(calls).toEqual([
      { name: "osi_link_clicked", opts: { props: { from: "share" } } },
      { name: "run_completed", opts: undefined },
    ]);
  });

  // ── §2 Wordle-style emoji trail strip ──
  it("T-emoji-strip: trail strip has one glyph per landmark + an outcome suffix", async () => {
    const strips = await h.page.evaluate(() => {
      // Wiped at mile 700: first three landmarks (319/554/640) passed, rest not.
      window.engine.signedState = {
        state: {
          position: { miles_traveled: 700 },
          party: { members: [{ alive: false }, { alive: false }] },
          simulation: {},
        },
        signature: "t",
      };
      const wiped = window.engine.getDailyTrailStrip();
      // Arrival at 1764, all alive.
      window.engine.signedState.state.position = { miles_traveled: 1764, arrived: true };
      window.engine.signedState.state.party.members = [{ alive: true }, { alive: true }];
      const arrived = window.engine.getDailyTrailStrip();
      return { wiped, arrived };
    });
    // 9 landmark glyphs + suffix. Count code points (emoji are multi-UTF16).
    expect([...strips.wiped].length).toBeGreaterThanOrEqual(9);
    expect(strips.wiped.endsWith("☠️")).toBe(true); // ☠️ wipe
    expect([...strips.arrived].length).toBeGreaterThanOrEqual(9);
  });

  it("T-emoji-share: getDailyShareText embeds the strip", async () => {
    const text = await h.page.evaluate(() => {
      window.engine.dailyMode = true;
      window.engine.dailyTrailNumber = 42;
      window.engine.signedState = {
        state: {
          position: { miles_traveled: 1764, date: "1848-09-30", arrived: true },
          party: { members: [{ alive: true }, { alive: true }, { alive: true }, { alive: true }, { alive: true }] },
          simulation: {},
        },
        signature: "t",
      };
      return window.engine.getDailyShareText();
    });
    expect(text).toContain("Daily Trail #42");
    expect(text).toContain("trail.osi-cyber.com");
    // The strip line sits between the headline and the stats line.
    expect(text.split("\n").length).toBeGreaterThanOrEqual(4);
  });

  // ── §2 Random-names button skips the five-input grind ──
  it("T-names-random: 'Surprise me' fills the party and advances to TONE", async () => {
    await h.seedEngine({ profession: "farmer" });
    await h.goScene("names");
    const result = await h.page.evaluate(async () => {
      const btn = document.getElementById("name-random") as HTMLButtonElement | null;
      const present = !!btn;
      btn?.click();
      await new Promise((r) => setTimeout(r, 50));
      return {
        present,
        leader: window.engine.leaderName,
        members: window.engine.memberNames,
        state: window.engine.state,
      };
    });
    expect(result.present).toBe(true);
    expect(typeof result.leader).toBe("string");
    expect((result.leader || "").length).toBeGreaterThan(0);
    expect(result.members).toHaveLength(4);
    expect(result.state).toBe("TONE");
  });

  // ── §2 html2canvas is no longer eagerly loaded on page boot ──
  it("T-lazy-h2c: html2canvas is not loaded at page boot", async () => {
    const loadedAtBoot = await h.page.evaluate(() => typeof window.html2canvas === "function");
    expect(loadedAtBoot).toBe(false);
  });

  // ── §1.2 Newspaper share artifact carries the OSI URL + watermark INSIDE
  // the captured region (#newspaper-content), so the shared PNG links back. ──
  it("T-newspaper-watermark: OSI URL + 'AI wrote this' sit inside #newspaper-content", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ezra" });
    await h.goScene("newspaper", {
      newspaper_name: "The Independence Gazette",
      headline: "EZRA PARTY REACHES OREGON CITY",
      byline: "From our correspondent",
      date: "1848-09-30",
      article_paragraphs: ["They made it."],
      survivors: ["Ezra"],
      deaths: [],
    });
    const html = await h.page.evaluate(() => {
      const el = document.getElementById("newspaper-content");
      return el ? el.innerHTML : "";
    });
    // The watermark MUST live inside the capture div, not in the action bar.
    expect(html).toContain("trail.osi-cyber.com");
    expect(html.toLowerCase()).toContain("an ai wrote this run live");
    expect(html).toContain("On-Site Intelligence");
  });

  it("T-newspaper-share: closing the newspaper transitions to SHARE", async () => {
    await h.seedEngine({ profession: "farmer", leaderName: "Ezra" });
    await h.goScene("newspaper", {
      headline: "TEST", byline: "b", article_paragraphs: ["p"], survivors: [], deaths: [],
    });
    const state = await h.page.evaluate(async () => {
      (document.getElementById("np-close") as HTMLButtonElement | null)?.click();
      await new Promise((r) => setTimeout(r, 50));
      return window.engine.state;
    });
    expect(state).toBe("SHARE");
  });
});
