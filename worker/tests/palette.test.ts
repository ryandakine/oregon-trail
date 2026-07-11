import { describe, it, expect } from "vitest";
import {
  PALETTE,
  toHex,
  cssHex,
  toSRGB01,
  toLinear01,
  rgbToHex,
  paletteKeys,
  srgbChannelToLinear,
} from "../../public/lib/palette.mjs";

describe("palette (shared 2D/3D color source)", () => {
  it("exports dry-prairie grassMid (not golf neon 0x81b214)", () => {
    expect(toHex("grassMid")).toBe(0x7a8f3a);
    expect(PALETTE.grassMid).toEqual([122, 143, 58]);
  });

  it("rgbToHex / toHex / cssHex agree", () => {
    const hex = toHex("dirtMid");
    expect(cssHex("dirtMid")).toBe(`#${hex.toString(16).padStart(6, "0")}`);
    expect(rgbToHex(PALETTE.dirtMid)).toBe(hex);
  });

  it("toSRGB01 is in [0,1] for every key", () => {
    for (const key of paletteKeys()) {
      const [r, g, b] = toSRGB01(key);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("toLinear01 is finite and darkens mid greys vs sRGB", () => {
    const [lr, lg, lb] = toLinear01("grassMid");
    for (const c of [lr, lg, lb]) {
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    // sRGB 0.5 → linear ~0.214 — channels of grass mid should be < sRGB01
    const [sr, sg, sb] = toSRGB01("grassMid");
    expect(lr).toBeLessThan(sr + 1e-9);
    expect(lg).toBeLessThan(sg + 1e-9);
    expect(lb).toBeLessThan(sb + 1e-9);
  });

  it("srgbChannelToLinear endpoints", () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(srgbChannelToLinear(1)).toBeCloseTo(1, 5);
  });

  it("throws on unknown key", () => {
    expect(() => toHex("notAColor")).toThrow(/unknown key/);
  });

  it("parchment / gold tokens match AESTHETIC_SPEC intent", () => {
    expect(toHex("parchmentDark")).toBe(0x2a1f0e);
    expect(toHex("gold")).toBe(0xd4a017);
    expect(toHex("parchment")).toBe(0xf5e6c8);
  });

  it("mild grass tint is lighter than grassMid (albedo-first)", () => {
    const mid = PALETTE.grassMid[1];
    const mild = PALETTE.grassTintMild[1];
    expect(mild).toBeGreaterThan(mid);
  });
});
