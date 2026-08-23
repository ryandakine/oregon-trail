// Render-mode gate + persistence. The frontend suite is Playwright-only (no
// Node import path for public/ modules), so the pure helpers in
// public/render-mode.mjs are exercised via the window.__renderMode hook that
// the module installs on load. shouldInit3D is pure (explicit args), so no
// pointer emulation is needed — the truth table is asserted directly.
//
// Contract as of 2026-08: "auto" (the unset/default preference) resolves to
// 2D, full stop — no isDesktop heuristic. The 3D canvas paints over the
// Kaplay layer (pre-existing compositing gap), so auto-selecting 3D on
// desktop soft-locked players at the first river with no HUD/buttons
// (confirmed by playtest). 3D stays reachable only via an explicit choice:
// the title-screen toggle (mode==="3d") or the ?gfx escape hatch the
// screenshot/deploy-smoke harnesses use.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

type GateArgs = { hasTest: boolean; hasGfx: boolean; mode: string };

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
    expect(await decide({ hasTest: true, hasGfx: false, mode: "3d" })).toBe(false);
  });

  it("T-rm-2: ?test=1 wins over ?gfx too — the test guard is absolute", async () => {
    expect(await decide({ hasTest: true, hasGfx: true, mode: "auto" })).toBe(false);
  });

  it("T-rm-3: explicit 2d beats ?gfx", async () => {
    expect(await decide({ hasTest: false, hasGfx: true, mode: "2d" })).toBe(false);
  });

  it("T-rm-4: explicit 3d is reachable with no ?gfx present (the title-screen toggle path)", async () => {
    expect(await decide({ hasTest: false, hasGfx: false, mode: "3d" })).toBe(true);
  });

  it("T-rm-5: auto with no ?gfx never inits 3D — the soft-lock fix", async () => {
    expect(await decide({ hasTest: false, hasGfx: false, mode: "auto" })).toBe(false);
  });

  it("T-rm-6: auto + ?gfx → 3D (the screenshot/deploy-smoke escape hatch still works)", async () => {
    expect(await decide({ hasTest: false, hasGfx: true, mode: "auto" })).toBe(true);
  });

  it("T-rm-7: unset preference flows through the same auto path as an explicit \"auto\" (2D-first)", async () => {
    const result = await h.page.evaluate(() => {
      localStorage.removeItem("ot_render_mode");
      const mode = window.__renderMode.getRenderMode();
      return { mode, decision: window.__renderMode.shouldInit3D({ hasTest: false, hasGfx: false, mode }) };
    });
    expect(result.mode).toBe("auto");
    expect(result.decision).toBe(false);
  });

  it("T-rm-8: setRenderMode/getRenderMode round-trip", async () => {
    const stored = await h.page.evaluate(() => {
      window.__renderMode.setRenderMode("2d");
      return window.__renderMode.getRenderMode();
    });
    expect(stored).toBe("2d");
  });

  it("T-rm-9: garbage stored value falls back to auto (no throw)", async () => {
    const mode = await h.page.evaluate(() => {
      localStorage.setItem("ot_render_mode", "garbage");
      return window.__renderMode.getRenderMode();
    });
    expect(mode).toBe("auto");
  });

  it("T-rm-10: effectiveMode resolves \"auto\" to 2D on every device — no isDesktop split anymore", async () => {
    const resolved = await h.page.evaluate(() => {
      localStorage.removeItem("ot_render_mode");
      return { desktop: window.__renderMode.effectiveMode(true), phone: window.__renderMode.effectiveMode(false) };
    });
    expect(resolved.desktop).toBe("2d");
    expect(resolved.phone).toBe("2d");
  });

  it("T-rm-11: effectiveMode still passes an explicit mode straight through regardless of device", async () => {
    const resolved = await h.page.evaluate(() => {
      window.__renderMode.setRenderMode("3d");
      return { desktop: window.__renderMode.effectiveMode(true), phone: window.__renderMode.effectiveMode(false) };
    });
    expect(resolved.desktop).toBe("3d");
    expect(resolved.phone).toBe("3d");
  });

  it("T-rm-12: shouldInit3D and effectiveMode agree on desktop-auto — the toggle can never claim 3D is on while the gate loaded 2D (pending the Three/Kaplay compositing fix)", async () => {
    const result = await h.page.evaluate(() => {
      localStorage.removeItem("ot_render_mode");
      const mode = window.__renderMode.getRenderMode();
      return {
        gateInits3D: window.__renderMode.shouldInit3D({ hasTest: false, hasGfx: false, mode }),
        toggleShows: window.__renderMode.effectiveMode(true),
      };
    });
    expect(result.gateInits3D).toBe(false);
    expect(result.toggleShows).toBe("2d");
  });
});
