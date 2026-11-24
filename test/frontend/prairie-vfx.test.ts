// Phase 3: Dynamic Ambient Prairie VFX Tests
// Covers:
// - T-vfx-1: Travel scene renders ambient VFX entities, zero Kaplay errors, zero hitbox collisions
// - T-vfx-2: Dawn/Dusk renders god-rays while Day/Night omits them
// - T-vfx-3: High tone tier suppresses god-rays and spawns dark ash flakes
// - T-vfx-4: prefers-reduced-motion disables ambient particle spawning

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type Harness } from "./harness";

describe("Phase 3: Dynamic Ambient Prairie VFX", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await h.waitForReady();
    await h.page.evaluate(() => localStorage.clear());
  }, 30000);

  afterAll(async () => {
    await h?.stop();
  });

  it("T-vfx-1: travel scene renders ambient prairie particles with zero errors and no hitboxes", async () => {
    await h.page.evaluate(() => {
      delete (window as unknown as { __VFX_OPTS?: unknown }).__VFX_OPTS;
    });

    // 1848-05-01 -> Day 1 % 4 = 1 -> "day"
    await h.seedEngine({
      profession: "farmer",
      tone: "low",
      signedStateOverrides: {
        position: { current_segment_id: "seg_01", miles_traveled: 100, date: "1848-05-01" },
      },
    });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);

    const vfxState = await h.page.evaluate(() => {
      const k = (window as unknown as { k: { get(tag?: string, o?: object): unknown[] } }).k;
      const vfxAll = k.get("vfx-ambient", { recursive: true }) as Array<{
        area?: unknown;
        z?: number;
        color?: { r: number; g: number; b: number };
        is(tag: string): boolean;
      }>;
      const particles = vfxAll.filter((o) => o.is("vfx-particle"));
      const godRays = vfxAll.filter((o) => o.is("vfx-god-ray"));
      const hasAnyArea = vfxAll.some((o) => o.area !== undefined);

      return {
        totalVfx: vfxAll.length,
        particleCount: particles.length,
        godRayCount: godRays.length,
        hasAnyArea,
        particlesLayeredAt42: particles.every((p) => p.z === 42),
      };
    });

    expect(vfxState.totalVfx).toBeGreaterThanOrEqual(7);
    expect(vfxState.particleCount).toBeGreaterThanOrEqual(7);
    expect(vfxState.godRayCount).toBe(0); // Day phase omits god-rays
    expect(vfxState.hasAnyArea).toBe(false); // Zero hitbox collision
    expect(vfxState.particlesLayeredAt42).toBe(true); // Layered above terrain, below HUD
  });

  it("T-vfx-2: Dawn renders god-rays streaming down, while Day omits them", async () => {
    // 1848-05-04 -> Day 4 % 4 = 0 -> "dawn"
    await h.seedEngine({
      profession: "farmer",
      tone: "medium",
      signedStateOverrides: {
        position: { current_segment_id: "seg_01", miles_traveled: 100, date: "1848-05-04" },
      },
    });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);

    const dawnRays = await h.page.evaluate(() => {
      const k = (window as unknown as { k: { get(tag?: string, o?: object): unknown[] } }).k;
      const godRays = k.get("vfx-god-ray", { recursive: true }) as Array<{
        opacity?: number;
        z?: number;
      }>;
      return {
        count: godRays.length,
        opacities: godRays.map((r) => r.opacity ?? 0),
        zIndices: godRays.map((r) => r.z ?? 0),
      };
    });

    expect(dawnRays.count).toBe(3);
    expect(dawnRays.opacities.every((op) => op > 0.02 && op < 0.10)).toBe(true);
    // God-rays must NOT have z: 15; they sit at default z: 0 in insertion order
    expect(dawnRays.zIndices.every((z) => z === 0)).toBe(true);
  });

  it("T-vfx-3: High tone suppresses god-rays and spawns dark ash flakes", async () => {
    // 1848-05-04 is normally dawn, but in horror tier god-rays must be suppressed
    await h.seedEngine({
      profession: "farmer",
      tone: "high",
      signedStateOverrides: {
        position: { current_segment_id: "seg_01", miles_traveled: 100, date: "1848-05-04" },
      },
    });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);

    const horrorVfx = await h.page.evaluate(() => {
      const k = (window as unknown as { k: { get(tag?: string, o?: object): unknown[] } }).k;
      const godRays = k.get("vfx-god-ray", { recursive: true });
      const particles = k.get("vfx-particle", { recursive: true }) as Array<{
        color?: { r: number; g: number; b: number };
      }>;
      return {
        godRayCount: godRays.length,
        particleCount: particles.length,
        isDarkAsh: particles.every((p) => p.color && p.color.r === 58 && p.color.g === 42 && p.color.b === 26),
      };
    });

    expect(horrorVfx.godRayCount).toBe(0); // Suppressed in high tone
    expect(horrorVfx.particleCount).toBeGreaterThanOrEqual(7);
    expect(horrorVfx.isDarkAsh).toBe(true); // Palette.outline dark soot
  });

  it("T-vfx-4: prefers-reduced-motion disables ambient particle spawning", async () => {
    await h.page.evaluate(() => {
      (window as unknown as { __VFX_OPTS: Record<string, unknown> }).__VFX_OPTS = {
        motionOk: false,
      };
    });

    await h.seedEngine({
      profession: "farmer",
      tone: "medium",
      signedStateOverrides: {
        position: { current_segment_id: "seg_01", miles_traveled: 100, date: "1848-05-01" },
      },
    });
    await h.goScene("travel");
    const s = await h.readStats();
    expect(s.pageErrors).toEqual([]);
    expect(s.kaplayErrors).toEqual([]);

    const particleCount = await h.page.evaluate(() => {
      const k = (window as unknown as { k: { get(tag?: string, o?: object): unknown[] } }).k;
      return k.get("vfx-particle", { recursive: true }).length;
    });

    expect(particleCount).toBe(0);
  });
});
