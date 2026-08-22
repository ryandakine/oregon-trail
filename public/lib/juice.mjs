// Oregon Trail — game-feel presets wrapping Kaplay's built-in shake/flash/
// tween/particles primitives (verified in vendored kaplay.mjs). See
// docs/design/graphics-pop-research.md § B3.

import { PALETTE } from "./draw.mjs";

export const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function createJuice(k) {
  // Small shake for a minor bad beat — health/oxen wear, a missed shot.
  function minor(opts = {}) {
    if (!MOTION_OK) return;
    k.shake(opts.intensity ?? k.rand(3, 5));
  }

  // Bigger shake + a hard color flash — death/disaster beats. Full-screen
  // flashes are exactly what prefers-reduced-motion exists for
  // (photosensitivity), so reduced motion suppresses the whole preset.
  function major(opts = {}) {
    if (!MOTION_OK) return;
    k.flash(k.rgb(...(opts.color ?? PALETTE.hpRed)), opts.flashDuration ?? 0.3);
    k.shake(opts.intensity ?? k.rand(8, 12));
  }

  // Slow creeping sickly-tint flash + sustained micro-shake — Bitter Path /
  // high-tone dread beats.
  function horror(opts = {}) {
    if (!MOTION_OK) return;
    k.flash(k.rgb(...(opts.color ?? PALETTE.sicklyHorizon)), opts.flashDuration ?? 0.6);
    const duration = opts.duration ?? 2;
    const ticks = opts.ticks ?? 8;
    for (let i = 0; i < ticks; i++) {
      k.wait((i / ticks) * duration, () => k.shake(k.rand(1, 2)));
    }
  }

  // Camera scale punch, 1.0 -> 1.06 -> 1.0, ~0.25s total. Reserve for
  // landmark arrival / big reveals — not a resolution-moment beat.
  function zoomPunch() {
    if (!MOTION_OK) return;
    const from = k.getCamScale().x || 1;
    const peak = from * 1.06;
    k.tween(from, peak, 0.12, (v) => k.setCamScale(v, v), k.easings.easeOutQuad)
      .onEnd(() => {
        k.tween(peak, from, 0.13, (v) => k.setCamScale(v, v), k.easings.easeInOutQuad);
      });
  }

  return { minor, major, horror, zoomPunch };
}
