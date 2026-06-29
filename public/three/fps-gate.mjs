// Pure decision helper for the 3D fps auto-downgrade. Kept dependency-free
// (no three, no DOM) so the hysteresis logic is unit-testable in plain node.
//
// Why hysteresis: a single slow sample window — a GC pause, a one-off layout
// reflow from a 2D-side LLM call, a background tab returning — must NOT
// permanently demote a capable GPU to 2D. Require `badWindowsToDowngrade`
// CONSECUTIVE sub-target windows before signalling a downgrade; any window at
// or above target resets the streak.
export function makeFpsGate({ targetFps, badWindowsToDowngrade = 3 } = {}) {
  let badStreak = 0;
  return {
    // Feed the average fps of one completed sample window. Returns true only
    // once the gate has seen `badWindowsToDowngrade` consecutive sub-target
    // windows, i.e. sustained low fps rather than a single transient stall.
    recordWindow(avgFps) {
      if (avgFps < targetFps) {
        badStreak += 1;
        return badStreak >= badWindowsToDowngrade;
      }
      badStreak = 0;
      return false;
    },
    // Exposed for tests / inspection.
    get badStreak() {
      return badStreak;
    },
  };
}
