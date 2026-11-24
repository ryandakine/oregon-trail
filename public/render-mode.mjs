// Render-mode preference: lets the player choose how the game renders — 2D
// (classic Kaplay) or 3D (Three.js world backdrop). Persisted in localStorage
// under `ot_render_mode`. Default (unset) = "auto" = 2D. The 3D canvas paints
// over the Kaplay layer (a pre-existing compositing gap, not fixed here), so
// auto-selecting 3D on desktop soft-locked players at the first river with no
// HUD/buttons — confirmed by playtest 2026-08. Until that compositing rebuild
// lands, "auto" stays 2D-only and 3D is reachable only on purpose: the
// title-screen toggle (explicit `mode==="3d"`) or the `?gfx` escape hatch used
// by the screenshot/deploy-smoke harnesses. The player-facing UI is binary
// (3D On/Off); "auto" is an internal value the player never sees.

const KEY = "ot_render_mode";

// PURE — no top-level window/localStorage access, so this module is import-safe
// in any context. Decides whether the 3D layer should init. Precedence is
// ORDERED: the ?test guard wins FIRST so a persisted "3d" can never leak the 3D
// layer into the ?test=1 scene-smoke harness.
export function shouldInit3D({ hasTest, hasGfx, mode }) {
  if (hasTest) return false;        // test harness never wants 3D
  if (mode === "2d") return false;  // explicit opt-out beats ?gfx
  if (mode === "3d") return true;   // explicit opt-in (phone attempt relies on main.js .catch fallback)
  return !!hasGfx;                  // "auto"/unset → 2D-first; ?gfx is the only auto path into 3D
}

export function getRenderMode() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "2d" || v === "3d" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}

// Returns true on a successful write, false if persistence is unavailable
// (private mode / quota) so callers can avoid a dead reload.
export function setRenderMode(mode) {
  try {
    localStorage.setItem(KEY, mode);
    return true;
  } catch {
    return false;
  }
}

// What the player actually gets right now. "auto" always resolves to "2d" —
// mirrors shouldInit3D's auto branch above, so the title-screen toggle never
// claims 3D is on when the gate actually loaded 2D. isDesktop is kept as a
// parameter so call sites (title.js) don't need touching; it stops being
// dead once the compositing fix lets "auto" look at the device again.
export function effectiveMode(isDesktop) {
  const m = getRenderMode();
  return m === "auto" ? "2d" : m;
}

// The same "clearly a desktop" test the 3D gate uses: a fine (mouse) pointer
// with no coarse (touch) pointer.
export function isDesktopPointer() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: fine)").matches
    && !window.matchMedia("(pointer: coarse)").matches;
}

// Clearly a touch-only device (phone/tablet). The toggle hides here — 3D chokes
// such devices and the desktop gate never fires there anyway.
export function isTouchOnly() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches
    && !window.matchMedia("(pointer: fine)").matches;
}

// Test hook: the frontend suite is Playwright-only (no Node import path), so the
// pure helpers are exercised via page.evaluate(window.__renderMode.*).
if (typeof window !== "undefined") {
  window.__renderMode = {
    shouldInit3D, getRenderMode, setRenderMode, effectiveMode, isDesktopPointer, isTouchOnly,
  };
}
