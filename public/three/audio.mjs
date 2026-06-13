// Procedural WebAudio layer — no audio files, pure WebAudio synthesis.
//
// Ported from world-of-claudecraft/src/game/audio.ts and music.ts, then
// extended for the Oregon Trail scene vocabulary: travel, river, fort, camp,
// hunting, arrival. All synthesis is local; no imports beyond this file.
//
// Architecture:
//   AudioContext (lazy, created on first start() call)
//   └─ master GainNode (0.30)
//      ├─ reverb send → ConvolverNode → master
//      ├─ scene bed GainNodes (crossfaded on setScene)
//      ├─ weather bed GainNode (driven by setWeather)
//      └─ creak/oxen moving bed GainNode (driven by setMoving)
//
// Scheduling: ambient beds use a setInterval lookahead scheduler (110ms tick,
// 0.6s horizon), identical in shape to the WoC MusicDirector. One-shot stings
// and helpers schedule directly against ctx.currentTime.
//
// Autoplay policy: AudioContext is created only on the first start() call,
// which the integrator must call from a user-gesture handler. Everything else
// (setScene, setWeather, sting, ...) is a no-op if start() has not been called.
//
// Dispose-safety: dispose() clears the scheduler interval, closes the context,
// and nulls all references. All internal helpers guard on ctx !== null.

// ── tiny local helpers (matches models.mjs style; no imports) ──────────────

// midi-to-frequency
function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── Synthesis primitives (ported from WoC GameAudio + MusicDirector) ────────

// Pre-baked 1-second mono white-noise buffer, stored as a module-level closure
// so we only create it once per AudioContext.
function makeNoiseBuf(ctx) {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Build an ADSR GainNode. Attack ramps to peak; hold until (dur-release); then
// exponential tail to 0.0001. Use exp-ramp for release to avoid click.
function adsr(ctx, when, dur, peak, attack, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  const holdEnd = Math.max(when + attack, when + dur - release);
  g.gain.setValueAtTime(peak, holdEnd);
  g.gain.exponentialRampToValueAtTime(0.0001, holdEnd + release);
  return g;
}

// noise(ctx, noiseBuf, master, duration, filterFreq, gain, decay, filterType)
//
// Plays a slice of the pre-baked noise buffer through a BiquadFilter into an
// exponential-decay envelope, then routes to the supplied destination node.
// Ported verbatim from WoC GameAudio.noise(); filterType defaults to 'lowpass'.
function noise(ctx, noiseBuf, dest, duration, filterFreq, gainVal, decay = 0.9, filterType = 'lowpass') {
  if (!ctx || !noiseBuf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration * decay);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t, Math.random() * 0.5, duration);
}

// tone(ctx, master, freq, duration, gain, type, delay, slideTo)
//
// Oscillator → ADSR → dest. Optional pitch glide from freq → slideTo over the
// note's duration. Ported from WoC GameAudio.tone().
function tone(ctx, dest, freq, duration, gainVal, type = 'sine', delay = 0, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + duration);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gainVal, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// Build a decaying-noise stereo ConvolverNode impulse response.
// Ported from WoC MusicDirector.init() reverb setup.
function makeReverb(ctx, seconds = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

// ── Scene ambient pads ───────────────────────────────────────────────────────
//
// Each scene gets 2-3 detuned sawtooth/sine voices through the reverb. These
// are scheduled by the lookahead scheduler, not played as looping BufferSources,
// so the scheduler can crossfade between scenes cleanly.
//
// Pad event: { freq, dur, gain, type, detune, useReverb }
// The scheduler picks events from a tiny per-scene table and re-schedules them
// overlapping at an interval, producing a seamless wash.

const PAD_DEFS = {
  // warm major wash: G major, detuned saws + sines
  travel: [
    { freq: mtof(55), dur: 6.0, gain: 0.04, type: 'sawtooth', detune: -5 },
    { freq: mtof(62), dur: 6.0, gain: 0.03, type: 'sawtooth', detune: 7 },
    { freq: mtof(67), dur: 6.0, gain: 0.025, type: 'sine', detune: 0 },
  ],
  // river: gentle F major color wash, slower
  river: [
    { freq: mtof(53), dur: 7.0, gain: 0.035, type: 'sine', detune: -3 },
    { freq: mtof(60), dur: 7.0, gain: 0.03, type: 'sawtooth', detune: 6 },
    { freq: mtof(65), dur: 7.0, gain: 0.025, type: 'sine', detune: 0 },
  ],
  // fort: warm C major, a little brighter
  fort: [
    { freq: mtof(48), dur: 6.5, gain: 0.04, type: 'sawtooth', detune: -4 },
    { freq: mtof(55), dur: 6.5, gain: 0.03, type: 'sawtooth', detune: 8 },
    { freq: mtof(60), dur: 6.5, gain: 0.025, type: 'sine', detune: 0 },
  ],
  // camp/night: sparse A minor, low and contemplative
  camp: [
    { freq: mtof(45), dur: 8.0, gain: 0.03, type: 'sine', detune: 0 },
    { freq: mtof(52), dur: 8.0, gain: 0.025, type: 'sawtooth', detune: -7 },
    { freq: mtof(57), dur: 8.0, gain: 0.018, type: 'sine', detune: 3 },
  ],
  // hunting: tense, sparse — D minor with no third
  hunting: [
    { freq: mtof(50), dur: 7.5, gain: 0.025, type: 'sawtooth', detune: 0 },
    { freq: mtof(57), dur: 7.5, gain: 0.018, type: 'sawtooth', detune: -6 },
  ],
  // arrival: bright G major fanfare pad
  arrival: [
    { freq: mtof(55), dur: 5.5, gain: 0.05, type: 'sawtooth', detune: -4 },
    { freq: mtof(62), dur: 5.5, gain: 0.04, type: 'sawtooth', detune: 8 },
    { freq: mtof(67), dur: 5.5, gain: 0.03, type: 'sine', detune: 0 },
    { freq: mtof(71), dur: 5.5, gain: 0.02, type: 'sine', detune: -2 },
  ],
};

// ── Main factory ─────────────────────────────────────────────────────────────

export function createTrailAudio() {
  // ── internal state ──────────────────────────────────────────────────────
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let reverb = null;
  let reverbSend = null;

  // Scene bed: one gain per scene name; current scene fades to 1, rest to 0.
  const sceneBeds = {};   // name → { gain, nextAt }
  let activeScene = 'travel';

  // Weather bed gain
  let weatherGain = null;
  let activeWeather = 'none';
  let activeWeatherIntensity = 0;

  // Moving bed gain (wagon creak + oxen)
  let movingGain = null;
  let isMoving = false;

  // Scheduler interval handle
  let schedulerTimer = null;
  const LOOKAHEAD = 0.6;    // seconds ahead to schedule
  const TICK_MS = 110;      // scheduler poll interval

  // Each bed tracks when its next pad chunk starts (AudioContext time).
  // The scheduler fires pad voices slightly before nextAt.
  const PAD_SPACING = 4.5;  // seconds between successive pad overlaps

  // ── helpers ─────────────────────────────────────────────────────────────

  // Safe exp ramp: never ramp to exactly 0 — use 0.0001 to avoid silent click.
  function expRampTo(param, target, endTime) {
    param.exponentialRampToValueAtTime(Math.max(target, 0.0001), endTime);
  }

  function gainRampTo(gainNode, target, duration = 0.8) {
    if (!ctx) return;
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    if (target <= 0) {
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } else {
      gainNode.gain.linearRampToValueAtTime(target, now + duration);
    }
  }

  // ── AudioContext init ────────────────────────────────────────────────────

  function start() {
    if (ctx) {
      // idempotent: if suspended, resume
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      ctx = new AudioContext();
    } catch {
      return; // WebAudio unavailable — degrade silently
    }

    try {
      master = ctx.createGain();
      master.gain.value = 0.30;
      master.connect(ctx.destination);

      noiseBuf = makeNoiseBuf(ctx);

      // Reverb
      reverb = makeReverb(ctx, 2.6);
      reverb.connect(master);
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.45;
      reverbSend.connect(reverb);

      // Scene bed gains
      const SCENE_NAMES = ['travel', 'river', 'fort', 'camp', 'hunting', 'arrival'];
      for (const name of SCENE_NAMES) {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(master);
        g.connect(reverbSend);
        sceneBeds[name] = { gain: g, nextAt: ctx.currentTime + 0.5 };
      }
      // Fade up the initial travel scene bed immediately
      sceneBeds['travel'].gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      sceneBeds['travel'].gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 1.2);

      // Weather gain
      weatherGain = ctx.createGain();
      weatherGain.gain.value = 0;
      weatherGain.connect(master);

      // Moving (creak/oxen) gain
      movingGain = ctx.createGain();
      movingGain.gain.value = 0;
      movingGain.connect(master);

      // Start the lookahead scheduler
      schedulerTimer = setInterval(_tick, TICK_MS);

    } catch {
      // partial init — silence is better than crash
      ctx = null;
    }
  }

  // ── Tab visibility ───────────────────────────────────────────────────────

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }

  // ── Scene switching ──────────────────────────────────────────────────────

  // Crossfade from current scene bed to the new one over ~1.4s.
  function setScene(name) {
    if (!ctx) return;
    if (!sceneBeds[name]) return;
    if (name === activeScene) return;

    const now = ctx.currentTime;
    const FADE = 1.4;

    // Fade out old
    const old = sceneBeds[activeScene];
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE);
    }

    // Fade in new
    const neo = sceneBeds[name];
    neo.gain.gain.cancelScheduledValues(now);
    neo.gain.gain.setValueAtTime(0.0001, now);
    neo.gain.gain.linearRampToValueAtTime(1.0, now + FADE);
    // Reset scheduling so the new scene's pad fires promptly
    neo.nextAt = now + 0.3;

    activeScene = name;
  }

  // ── Weather bed ──────────────────────────────────────────────────────────

  // Weather beds are driven by periodic noise() calls in the scheduler.
  // The weatherGain master fades in/out; individual noise() calls are
  // spawned continuously while weather is active.

  function setWeather(kind, intensity = 1.0) {
    if (!ctx) return;
    activeWeather = kind;
    activeWeatherIntensity = Math.max(0, Math.min(1, intensity));

    const now = ctx.currentTime;
    const target = kind === 'none' ? 0 : activeWeatherIntensity;
    weatherGain.gain.cancelScheduledValues(now);
    weatherGain.gain.setValueAtTime(weatherGain.gain.value, now);
    if (target <= 0) {
      weatherGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    } else {
      weatherGain.gain.linearRampToValueAtTime(target, now + 1.2);
    }
  }

  // ── Moving bed ──────────────────────────────────────────────────────────

  function setMoving(moving) {
    if (!ctx) return;
    isMoving = !!moving;
    gainRampTo(movingGain, isMoving ? 1.0 : 0, 1.0);
  }

  // ── Scheduler tick ───────────────────────────────────────────────────────

  // Tracks when the next weather noise burst is due.
  let _weatherNextAt = 0;
  // Tracks when the next creak burst is due.
  let _creakNextAt = 0;
  // Tracks when the next ox groan is due.
  let _oxNextAt = 0;

  function _tick() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;

    // ── Scene pad voices ────────────────────────────────────────────────
    for (const [name, bed] of Object.entries(sceneBeds)) {
      const isActive = (name === activeScene);
      const gainVal = bed.gain.gain.value;
      const audible = isActive || gainVal > 0.005;
      if (!audible) continue;

      const defs = PAD_DEFS[name];
      if (!defs) continue;

      // Schedule the next pad chunk if it falls within the horizon
      while (bed.nextAt < horizon) {
        const t = bed.nextAt;
        for (const def of defs) {
          const g = adsr(ctx, t, def.dur, def.gain, def.dur * 0.25, def.dur * 0.4);
          g.connect(bed.gain);
          // Route through reverb send
          const rv = ctx.createGain();
          rv.gain.value = 0.5;
          g.connect(rv);
          rv.connect(reverbSend);

          const osc = ctx.createOscillator();
          osc.type = def.type;
          osc.frequency.value = def.freq;
          osc.detune.value = def.detune;
          osc.connect(g);
          osc.start(Math.max(t, now));
          osc.stop(t + def.dur + 0.5);
        }
        bed.nextAt += PAD_SPACING;
      }
    }

    // ── Weather noise ───────────────────────────────────────────────────
    if (activeWeather !== 'none' && weatherGain.gain.value > 0.002) {
      if (_weatherNextAt < horizon) {
        _scheduleWeather(Math.max(_weatherNextAt, now));
        _weatherNextAt = now + _weatherBurstInterval();
      }
    }

    // ── Moving bed (creak + oxen) ───────────────────────────────────────
    if (isMoving && movingGain.gain.value > 0.002) {
      // Wagon creak: LP noise bursts every 0.8-2s
      if (_creakNextAt < horizon) {
        const t = Math.max(_creakNextAt, now);
        _scheduleCreak(t);
        _creakNextAt = t + 0.8 + Math.random() * 1.2;
      }
      // Ox groan: sawtooth glide every 4-9s
      if (_oxNextAt < horizon) {
        const t = Math.max(_oxNextAt, now);
        _scheduleOxLow(t);
        _oxNextAt = t + 4 + Math.random() * 5;
      }
    }
  }

  function _weatherBurstInterval() {
    switch (activeWeather) {
      case 'rain':  return 0.05 + Math.random() * 0.08;
      case 'dust':  return 0.25 + Math.random() * 0.4;
      case 'snow':  return 0.5 + Math.random() * 1.0;
      default:      return 1.0;
    }
  }

  function _scheduleWeather(t) {
    if (!ctx) return;
    const i = activeWeatherIntensity;

    switch (activeWeather) {
      case 'rain': {
        // Continuous HP hiss bed (high-pass noise, ~3500Hz)
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.playbackRate.value = 0.9 + Math.random() * 0.2;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3200 + Math.random() * 600;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.08 * i, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        src.connect(hp);
        hp.connect(g);
        g.connect(weatherGain);
        src.start(t, Math.random() * 0.5, 0.14);
        // Occasional single drop click: very short LP burst
        if (Math.random() < 0.4) {
          const ds = ctx.createBufferSource();
          ds.buffer = noiseBuf;
          const dlp = ctx.createBiquadFilter();
          dlp.type = 'bandpass';
          dlp.frequency.value = 1800 + Math.random() * 1200;
          const dg = ctx.createGain();
          dg.gain.setValueAtTime(0.04 * i, t);
          dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
          ds.connect(dlp);
          dlp.connect(dg);
          dg.connect(weatherGain);
          ds.start(t, Math.random() * 0.7, 0.035);
        }
        break;
      }
      case 'snow': {
        // Near-silence: faint LP wind (very soft)
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.playbackRate.value = 0.5 + Math.random() * 0.2;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 300 + Math.random() * 200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.02 * i, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        src.connect(lp);
        lp.connect(g);
        g.connect(weatherGain);
        src.start(t, Math.random() * 0.5, 0.85);
        break;
      }
      case 'dust': {
        // LP noise, slow filter LFO for a howling quality
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.playbackRate.value = 0.6 + Math.random() * 0.3;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        const baseFreq = 500 + Math.random() * 200;
        lp.frequency.setValueAtTime(baseFreq, t);
        lp.frequency.linearRampToValueAtTime(baseFreq + 300, t + 0.4);
        lp.frequency.linearRampToValueAtTime(baseFreq, t + 0.8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06 * i, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        src.connect(lp);
        lp.connect(g);
        g.connect(weatherGain);
        src.start(t, Math.random() * 0.3, 0.9);
        break;
      }
      default: break;
    }
  }

  // ── Wagon creak & oxen ───────────────────────────────────────────────────

  function _scheduleCreak(t) {
    if (!ctx) return;
    // LP noise burst ~200Hz (low wooden creak)
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.5 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150 + Math.random() * 100;
    const g = ctx.createGain();
    const amp = 0.04 + Math.random() * 0.03;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(lp);
    lp.connect(g);
    g.connect(movingGain);
    src.start(t, Math.random() * 0.4, 0.4);

    // Occasional sawtooth groan ~55Hz, slow glide — the tongue/axle stress
    if (Math.random() < 0.35) {
      const groanT = t + Math.random() * 0.4;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(52 + Math.random() * 8, groanT);
      osc.frequency.exponentialRampToValueAtTime(48 + Math.random() * 6, groanT + 0.8);
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.0001, groanT);
      gg.gain.linearRampToValueAtTime(0.028, groanT + 0.12);
      gg.gain.exponentialRampToValueAtTime(0.0001, groanT + 0.8);
      osc.connect(gg);
      gg.connect(movingGain);
      osc.start(groanT);
      osc.stop(groanT + 0.9);
    }
  }

  // Ox low moan: sawtooth glide ~120Hz → 100Hz
  function _scheduleOxLow(t) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115 + Math.random() * 15, t);
    osc.frequency.exponentialRampToValueAtTime(95 + Math.random() * 12, t + 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(lp);
    lp.connect(g);
    g.connect(movingGain);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  // ── One-shot stings ───────────────────────────────────────────────────────

  function sting(name) {
    if (!ctx || !master) return;
    try {
      switch (name) {
        case 'event':   _stingEvent(); break;
        case 'danger':  _stingDanger(); break;
        case 'good':    _stingGood(); break;
        case 'death':   _stingDeath(); break;
        case 'arrival': _stingArrival(); break;
        case 'gunshot': _stingGunshot(); break;
        default: break;
      }
    } catch { /* silence */ }
  }

  // Neutral event chime: two triangle tones, rising minor second
  function _stingEvent() {
    tone(ctx, master, 523, 0.5, 0.12, 'triangle');
    tone(ctx, master, 587, 0.5, 0.10, 'triangle', 0.12);
  }

  // Danger: low dissonant pair — tritone, sawtooth
  function _stingDanger() {
    tone(ctx, master, 110, 0.7, 0.16, 'sawtooth');
    tone(ctx, master, 156, 0.6, 0.10, 'sawtooth', 0.05);
    noise(ctx, noiseBuf, master, 0.4, 300, 0.10, 0.85);
  }

  // Good: rising major triad on triangle
  function _stingGood() {
    const root = 523;
    tone(ctx, master, root,       0.4, 0.14, 'triangle');
    tone(ctx, master, root * 1.25, 0.4, 0.12, 'triangle', 0.10);
    tone(ctx, master, root * 1.5,  0.5, 0.10, 'triangle', 0.20);
  }

  // Death: slow descending sawtooth, long reverb tail
  function _stingDeath() {
    tone(ctx, master, 220, 1.6, 0.20, 'sawtooth', 0, 55);
    noise(ctx, noiseBuf, master, 1.4, 300, 0.16, 0.96);
    // Dirge bell
    _ringBell(ctx, master, 293, ctx.currentTime + 0.5, 0.14);
    _ringBell(ctx, master, 220, ctx.currentTime + 1.0, 0.10);
  }

  // Arrival: bright fanfare — ascending G major arpeggio on triangle
  function _stingArrival() {
    const notes = [392, 494, 587, 784, 988];
    notes.forEach((f, i) => tone(ctx, master, f, 0.6, 0.16, 'triangle', i * 0.10));
    noise(ctx, noiseBuf, master, 0.8, 5000, 0.06, 0.94, 'highpass');
  }

  // Gunshot: short broadband noise burst + sub click
  function _stingGunshot() {
    noise(ctx, noiseBuf, master, 0.25, 1800, 0.35, 0.7);
    noise(ctx, noiseBuf, master, 0.08, 180, 0.28, 0.6);
    tone(ctx, master, 120, 0.06, 0.18, 'sine');
  }

  // ── One-shot helpers ─────────────────────────────────────────────────────

  function bell() {
    if (!ctx || !master) return;
    try { _ringBell(ctx, master, 880, ctx.currentTime, 0.14); } catch { /* */ }
  }

  function oxLow() {
    if (!ctx || !movingGain) return;
    try { _scheduleOxLow(ctx.currentTime); } catch { /* */ }
  }

  // Bell: three inharmonic partials (ported from WoC MusicDirector.bell)
  function _ringBell(actx, dest, freq, when, vel) {
    for (const [ratio, amp, dec] of [[1, 0.22, 3.4], [2.0, 0.08, 2.2], [2.76, 0.06, 1.4]]) {
      const g = actx.createGain();
      g.gain.setValueAtTime(vel * amp, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
      g.connect(dest);
      const o = actx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio * 0.5;
      o.connect(g);
      o.start(when);
      o.stop(when + dec + 0.1);
    }
  }

  // ── Dispose ──────────────────────────────────────────────────────────────

  function dispose() {
    if (schedulerTimer !== null) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
    master = null;
    noiseBuf = null;
    reverb = null;
    reverbSend = null;
    weatherGain = null;
    movingGain = null;
    Object.keys(sceneBeds).forEach((k) => delete sceneBeds[k]);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    start,
    resume,
    suspend,
    setScene,
    setWeather,
    setMoving,
    sting,
    bell,
    oxLow,
    dispose,
  };
}
