// Oregon Trail — tone-tier overlay (v3)
// See IMPLEMENTATION_PLAN_v3.md § 4.1.

import { PALETTE } from "./draw.mjs";

const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function applyToneOverlay(k, tone) {
  if (tone === "low") {
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(255, 240, 200), k.opacity(0.08), k.z(45), k.fixed()]);
  } else if (tone === "medium") {
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(200, 195, 180), k.opacity(0.06), k.z(45), k.fixed()]);
  } else if (tone === "high") {
    // Cool-shift base
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(30, 15, 40), k.opacity(0.28), k.z(45), k.fixed()]);

    // Vignette
    for (const [x, y, w, h] of [[0,0,640,60],[0,420,640,60],[0,0,60,480],[580,0,60,480]]) {
      k.add([k.rect(w, h), k.pos(x, y), k.color(10, 5, 15), k.opacity(0.5), k.z(46), k.fixed()]);
    }

    // Slow pulse (only if reduced-motion is NOT set)
    if (MOTION_OK) {
      const pulse = k.add([k.rect(640, 480), k.pos(0, 0), k.color(10, 5, 20), k.opacity(0), k.z(47), k.fixed()]);
      pulse.onUpdate(() => {
        pulse.opacity = 0.08 + Math.sin(k.time() * 1.8) * 0.05;
      });
    }

    // Static scanlines
    for (let y = 0; y < 480; y += 4) {
      k.add([k.rect(640, 1), k.pos(0, y), k.color(0, 0, 0), k.opacity(0.05), k.z(48), k.fixed()]);
    }
  }
}
