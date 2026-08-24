// Oregon Trail — HIGH tone tier post-effect conductor (graphics-pop-research
// § 3 Phase C, items C1/C4/C5).
//
// Owns the single post-effect slot kaplay exposes. shaders/horror.frag folds
// VHS bleed, film grain, CRT barrel and chromatic aberration into one program
// (usePostEffect replaces rather than stacks — see that file's header); this
// module decides what each of its mix uniforms is worth, frame by frame.
//
// The tier's signature is ambient and slow: the tape breathes on a ~21s cycle
// and never resolves. Stingers are the only loud moment, and they decay inside
// a second. Restraint is the point — the horror reads through signal decay,
// not through spam.

import { MOTION_OK } from "./juice.mjs";

const SHADER = "horror";

// The logical frame, matching the kaplay init in main.js. NOT k.width() — the
// uniform callback runs inside kaplay's post pass, which has temporarily
// swapped gfx.width to the drawing-buffer size, so k.width() reads the
// stretched canvas there instead of 640.
const FRAME_W = 640;
const FRAME_H = 480;

let fx = null;

export function createHorrorFx(k) {
  if (fx) return fx;

  const res = k.vec2(FRAME_W, FRAME_H);

  let tier = "medium";
  let dread = 0;
  let spikeAmp = 0;
  let spikeStart = -1;
  let spikeDuration = 1;
  let installed = false;

  // Ask kaplay whether the program actually compiled instead of keeping a
  // second copy of the load state. getShader() hands back the asset record, so
  // a 404, a compile error and a still-pending fetch all read false — and
  // every entry point below bails, leaving the default post shader in place.
  function shaderReady() {
    const asset = k.getShader?.(SHADER);
    return !!(asset && asset.loaded && !asset.error && asset.data);
  }

  function wanted() {
    return tier === "high" && MOTION_OK;
  }

  // Quadratic falloff — the spike lands hard and lets go, so a stinger reads
  // as something that happened rather than a mode the screen entered.
  function envelope() {
    if (spikeStart < 0) return 0;
    const t = (k.time() - spikeStart) / spikeDuration;
    if (t >= 1) {
      spikeStart = -1;
      return 0;
    }
    const remaining = 1 - t;
    return remaining * remaining * spikeAmp;
  }

  // Re-evaluated every frame by kaplay (postShaderUniform is called, not read).
  function uniforms() {
    const env = envelope();
    const breath = 0.8 + 0.4 * Math.sin(k.time() * 0.3);
    return {
      u_intensity: breath * (1 + 2 * env),
      u_grain: 0.09 + 0.06 * dread + 0.14 * env,
      u_crt: env,
      u_dread: Math.min(1, dread * 0.6 + env),
      u_time: k.time(),
      u_res: res,
    };
  }

  // Deliberately not guarded on `installed`: re-seating the slot is two
  // assignments, and setTier runs on every scene that applies the overlay, so
  // an unconditional install is what lets the tier recover the slot if
  // anything else ever claims it. `installed` only records that clearing it
  // later is ours to do.
  function install() {
    if (!shaderReady()) return;
    k.usePostEffect(SHADER, uniforms);
    installed = true;
  }

  function clear() {
    if (!installed) return;
    k.usePostEffect(null);
    installed = false;
  }

  // Called from the tone overlay, so every scene that applies the tier picks
  // the effect up — and a low/medium run actively clears it rather than
  // inheriting whatever the slot last held.
  function setTier(next) {
    tier = next ?? "medium";
    if (wanted()) {
      install();
      return;
    }
    spikeStart = -1;
    dread = 0;
    clear();
  }

  // A nightmare beat: CRT snaps on and the dread spike rides with it, both
  // gone in 0.8-1.2s.
  function stinger(intensity = 1) {
    if (!installed) return;
    spikeAmp = Math.max(0, Math.min(1, intensity));
    spikeDuration = 0.8 + 0.4 * spikeAmp;
    spikeStart = k.time();
  }

  // Continuous 0..1, for scenes to feed from starvation / party health. Kept
  // separate from the stinger so a run can sit at a low simmer indefinitely
  // without anything flashing.
  function setDread(value) {
    dread = Math.max(0, Math.min(1, Number(value) || 0));
  }

  function dispose() {
    clear();
    tier = "medium";
    dread = 0;
    spikeStart = -1;
    fx = null;
  }

  fx = { setTier, stinger, setDread, dispose };
  return fx;
}
