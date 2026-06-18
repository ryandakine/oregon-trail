// Render-mode gate + persistence. The frontend suite is Playwright-only (no
// Node import path for public/ modules), so the pure helpers in
// public/render-mode.mjs are exercised via the window.__renderMode hook that
// the module installs on load. shouldInit3D is pure (explicit args), so no
// pointer emulation is needed — the truth table is asserted directly.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

type GateArgs = { hasTest: boolean; hasGfx: boolean; isDesktop: boolean; mode: string };

declare global {
  interface Window {
    __renderMode: {
      shouldInit3D(args: GateArgs): boolean;
      getRenderMode(): string;
      setRenderMode(mode: string): boolean;
      effectiveMode(isDesktop: boolean): string;
      isDesktopPointer(): boolean;
      isTouchOnly(): boolean;
    };
  }
}

describe("render-mode gate + persistence", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
  }, 30000);

  afterAll(async () => { await h?.stop(); });

  const decide = (args: GateArgs): Promise<boolean> =>
    h.page.evaluate((a) => window.__renderMode.shouldInit3D(a), args);

  it("T-rm-1: ?test=1 wins over a persisted 3d (no suite poisoning)", async () => {
    expect(await decide({ hasTest: true, hasGfx: false, isDesktop: true, mode: "3d" })).toBe(false);
  });

  it("T-rm-2: explicit 2d on desktop → no 3D", async () => {
    expect(await decide({ hasTest: false, hasGfx: false, isDesktop: true, mode: "2d" })).toBe(false);
  });

  it("T-rm-3: explicit 2d beats ?gfx", async () => {
    expect(await decide({ hasTest: false, hasGfx: true, isDesktop: false, mode: "2d" })).toBe(false);
  });

  it("T-rm-4: explicit 3d forces on a non-desktop", async () => {
    expect(await decide({ hasTest: false, hasGfx: false, isDesktop: false, mode: "3d" })).toBe(true);
  });

  it("T-rm-5: auto + desktop → 3D", async () => {
    expect(await decide({ hasTest: false, hasGfx: false, isDesktop: true, mode: "auto" })).toBe(true);
  });

  it("T-rm-6: auto + non-desktop → no 3D", async () => {
    expect(await decide({ hasTest: false, hasGfx: false, isDesktop: false, mode: "auto" })).toBe(false);
  });

  it("T-rm-7: auto + ?gfx on a non-desktop → 3D", async () => {
    expect(await decide({ hasTest: false, hasGfx: true, isDesktop: false, mode: "auto" })).toBe(true);
  });

  it("T-rm-8: unset preference behaves identically to auto (regression: no behavior change)", async () => {
    const result = await h.page.evaluate(() => {
      localStorage.removeItem("ot_render_mode");
      const mode = window.__renderMode.getRenderMode();
      return { mode, decision: window.__renderMode.shouldInit3D({ hasTest: false, hasGfx: false, isDesktop: true, mode }) };
    });
    expect(result.mode).toBe("auto");
    expect(result.decision).toBe(true);
  });

  it("T-rm-9: setRenderMode/getRenderMode round-trip", async () => {
    const stored = await h.page.evaluate(() => {
      window.__renderMode.setRenderMode("2d");
      return window.__renderMode.getRenderMode();
    });
    expect(stored).toBe("2d");
  });

  it("T-rm-10: garbage stored value falls back to auto (no throw)", async () => {
    const mode = await h.page.evaluate(() => {
      localStorage.setItem("ot_render_mode", "garbage");
      return window.__renderMode.getRenderMode();
    });
    expect(mode).toBe("auto");
  });

  it("T-rm-11: effectiveMode resolves auto by device", async () => {
    const resolved = await h.page.evaluate(() => {
      localStorage.removeItem("ot_render_mode");
      return { desktop: window.__renderMode.effectiveMode(true), phone: window.__renderMode.effectiveMode(false) };
    });
    expect(resolved.desktop).toBe("3d");
    expect(resolved.phone).toBe("2d");
  });
});
