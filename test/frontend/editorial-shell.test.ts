// Phase 4: Modern Editorial Shell & Gallery Backdrop Tests
// Covers:
// - T-shell-1: Body radial vignette and canvas diorama elevation / border-radius
// - T-shell-2: IBM Plex Mono @font-face loading and typography applied to headers & buttons
// - T-shell-3: Modal card frosted glassmorphism across setup scenes & disabled button protection
// - T-shell-4: prefers-reduced-motion disabling modal animations and button hover transforms

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

describe("Phase 4: Modern Editorial Shell & Gallery Backdrop", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => {
    await h?.stop();
  });

  it("T-shell-1: body radial vignette and canvas diorama elevation are active", async () => {
    const styles = await h.page.evaluate(() => {
      const body = document.body;
      const bodyStyle = window.getComputedStyle(body);
      const canvas = document.querySelector("canvas:not(#three-canvas)") as HTMLElement | null;
      const canvasStyle = canvas ? window.getComputedStyle(canvas) : null;
      return {
        bodyBg: bodyStyle.backgroundImage,
        canvasShadow: canvasStyle?.boxShadow ?? "",
        canvasRadius: canvasStyle?.borderRadius ?? "",
      };
    });

    expect(styles.bodyBg).toContain("radial-gradient");
    expect(styles.canvasShadow).not.toBe("none");
    expect(styles.canvasShadow).toContain("rgba(0, 0, 0, 0.7)");
    expect(styles.canvasRadius).toBe("4px");
  });

  it("T-shell-2: IBM Plex Mono @font-face loads and applies to headers and buttons", async () => {
    await h.goScene("profession");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);

    const fontInfo = await h.page.evaluate(async () => {
      await document.fonts.ready;
      const isPlexLoaded = document.fonts.check('16px "IBM Plex Mono"');
      const title = document.querySelector("#html-overlay .overlay-title") as HTMLElement | null;
      const btn = document.querySelector("#html-overlay .profession-btn") as HTMLElement | null;
      return {
        isPlexLoaded,
        titleFont: title ? window.getComputedStyle(title).fontFamily : "",
        btnFont: btn ? window.getComputedStyle(btn).fontFamily : "",
      };
    });

    expect(fontInfo.isPlexLoaded).toBe(true);
    expect(fontInfo.titleFont).toContain("IBM Plex Mono");
    expect(fontInfo.btnFont).toContain("IBM Plex Mono");
  });

  it("T-shell-3: modal card frosted glassmorphism applies and disabled buttons are protected", async () => {
    await h.seedEngine({ profession: "banker", leaderName: "Ryan", memberNames: ["Beth", "Carl", "Dana", "Earl"] });
    await h.page.evaluate(() => {
      (window.engine as { activeChallenge: string | null }).activeChallenge = "pacifist";
    });
    await h.goScene("store");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);
    expect(s.overlayActive).toBe(true);

    const modalStyles = await h.page.evaluate(() => {
      const content = document.querySelector("#html-overlay .overlay-content") as HTMLElement | null;
      const cStyle = content ? window.getComputedStyle(content) : null;
      const disabledBtn = document.querySelector("#html-overlay button:disabled, #html-overlay .choice-btn:disabled") as HTMLElement | null;
      const dStyle = disabledBtn ? window.getComputedStyle(disabledBtn) : null;
      return {
        contentRadius: cStyle?.borderRadius ?? "",
        contentBackdrop: (cStyle as unknown as { backdropFilter?: string; webkitBackdropFilter?: string })?.backdropFilter
          || (cStyle as unknown as { backdropFilter?: string; webkitBackdropFilter?: string })?.webkitBackdropFilter
          || "",
        hasDisabled: !!disabledBtn,
        disabledCursor: dStyle?.cursor ?? "",
      };
    });

    expect(modalStyles.contentRadius).toBe("12px");
    // In headless chromium, backdropFilter is present on style declarations
    expect(modalStyles.contentBackdrop).toContain("blur(16px)");
    expect(modalStyles.hasDisabled).toBe(true);
    expect(modalStyles.disabledCursor).toBe("not-allowed");
  });

  it("T-shell-4: prefers-reduced-motion disables modal animations and button transitions", async () => {
    await h.page.emulateMedia({ reducedMotion: "reduce" });
    await h.goScene("profession");

    const motionStyles = await h.page.evaluate(() => {
      const content = document.querySelector("#html-overlay .overlay-content") as HTMLElement | null;
      const btn = document.querySelector("#html-overlay button") as HTMLElement | null;
      const cStyle = content ? window.getComputedStyle(content) : null;
      const bStyle = btn ? window.getComputedStyle(btn) : null;
      return {
        animationName: cStyle?.animationName ?? "",
        btnTransition: bStyle?.transition ?? "",
        btnTransform: bStyle?.transform ?? "",
      };
    });

    expect(motionStyles.animationName).toBe("none");
    expect(motionStyles.btnTransform).toBe("none");

    // Restore media for subsequent suites
    await h.page.emulateMedia({ reducedMotion: "no-preference" });
  });
});
