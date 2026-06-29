import { describe, it, expect } from "vitest";
// Pure helper — no three/DOM import, so it unit-tests directly in node (no
// Playwright/browser needed). Guards the hysteresis that keeps a single
// transient stall from permanently demoting a capable GPU to 2D.
import { makeFpsGate } from "../../public/three/fps-gate.mjs";

describe("fps-gate: downgrade hysteresis", () => {
  it("T-fps-1: a single bad window does NOT downgrade", () => {
    const g = makeFpsGate({ targetFps: 24, badWindowsToDowngrade: 3 });
    expect(g.recordWindow(10)).toBe(false);
    expect(g.badStreak).toBe(1);
  });

  it("T-fps-2: two consecutive bad windows still do NOT downgrade (threshold 3)", () => {
    const g = makeFpsGate({ targetFps: 24, badWindowsToDowngrade: 3 });
    expect(g.recordWindow(12)).toBe(false);
    expect(g.recordWindow(15)).toBe(false);
    expect(g.badStreak).toBe(2);
  });

  it("T-fps-3: three CONSECUTIVE bad windows downgrade on the third", () => {
    const g = makeFpsGate({ targetFps: 24, badWindowsToDowngrade: 3 });
    expect(g.recordWindow(11)).toBe(false);
    expect(g.recordWindow(11)).toBe(false);
    expect(g.recordWindow(11)).toBe(true);
  });

  it("T-fps-4: a good window in the middle resets the streak (no downgrade)", () => {
    const g = makeFpsGate({ targetFps: 24, badWindowsToDowngrade: 3 });
    g.recordWindow(11); // bad 1
    g.recordWindow(11); // bad 2
    expect(g.recordWindow(60)).toBe(false); // good -> reset
    expect(g.badStreak).toBe(0);
    expect(g.recordWindow(11)).toBe(false); // bad 1 again
    expect(g.recordWindow(11)).toBe(false); // bad 2
    expect(g.recordWindow(11)).toBe(true); // bad 3 -> downgrade
  });

  it("T-fps-5: avg exactly at target is treated as healthy (strict < threshold)", () => {
    const g = makeFpsGate({ targetFps: 24, badWindowsToDowngrade: 3 });
    expect(g.recordWindow(24)).toBe(false);
    expect(g.recordWindow(24)).toBe(false);
    expect(g.recordWindow(24)).toBe(false);
    expect(g.badStreak).toBe(0);
  });

  it("T-fps-6: defaults to 3 consecutive bad windows when unspecified", () => {
    const g = makeFpsGate({ targetFps: 24 });
    expect(g.recordWindow(5)).toBe(false);
    expect(g.recordWindow(5)).toBe(false);
    expect(g.recordWindow(5)).toBe(true);
  });
});
