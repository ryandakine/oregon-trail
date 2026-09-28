// Oregon Trail — shared HUD (v3)
// See IMPLEMENTATION_PLAN_v3.md § 3.1.

import { PALETTE, drawHealthIcon } from "./draw.mjs";

export function getUIScale() {
  return window.innerWidth < 500 ? 1.4 : 1.0;
}
export function getSizes() {
  const s = getUIScale();
  return {
    body:    Math.round(14 * s),
    label:   Math.round(10 * s),
    heading: Math.round(18 * s),
    tick:    Math.max(8, Math.round(8 * s)),
  };
}

const LANDMARKS = [
  { name: "Kearney",    miles: 304 },
  { name: "Chimney",    miles: 592 },
  { name: "Laramie",    miles: 672 },
  { name: "South Pass", miles: 932 },
  { name: "Fort Hall",  miles: 1288 },
  { name: "Blue Mtns",  miles: 1564 },
];
const TRAIL_MILES = 1764;

const BAR_HIGHLIGHT = [255, 235, 150];
const FLASH_WHITE = [255, 255, 255];
const HP_RANK = { dead: 0, dying: 1, ill: 2, poor: 3, well: 4 };
const _prevHealthByIndex = new Map();

let _zenNotifier = null;

export function notifyZenActivity() {
  if (typeof _zenNotifier === "function") {
    _zenNotifier();
  } else if (typeof window !== "undefined" && window.__zenHud?.notifyActivity) {
    window.__zenHud.notifyActivity();
  }
}

export function addTopHud(k, engine) {
  const S = getSizes();
  const scale = getUIScale();
  const tag = "hud-top";
  const pillY = 6;
  const pillH = 34;

  // Frosted helper
  const addPill = (x, w) => {
    k.add([k.rect(w, pillH, { radius: 14 }), k.pos(x, pillY), k.color(...PALETTE.outline), k.opacity(0.60), k.fixed(), k.z(50), tag]);
    k.add([k.rect(w - 16, 1), k.pos(x + 8, pillY + 2), k.color(...PALETTE.parchment), k.opacity(0.25), k.fixed(), k.z(51), tag]);
  };

  const dateStr = engine.formatDate(engine.currentDate);
  const measuredDate = k.formatText ? k.formatText({ text: dateStr, size: S.body }) : { width: 140 };
  const pillAW = scale > 1.2 ? Math.max(148, Math.min(184, Math.round(measuredDate.width + 20))) : 148;
  const pillAX = 8;
  const pillCW = scale > 1.2 ? 168 : 180;
  const pillCX = 640 - 8 - pillCW;
  const pillBX = pillAX + pillAW + 8;
  const pillBW = pillCX - 8 - pillBX;

  // Pill A: Date
  addPill(pillAX, pillAW);
  const dateText = mkText(k, dateStr, pillAX + 10, 14, S.body, PALETTE.parchment, tag);

  // Pill B: Vitals
  addPill(pillBX, pillBW);
  const colW = pillBW / 3;
  const s0 = scale > 1.2 ? pillBX + 6 : 176;
  const fX = scale > 1.2 ? s0 + 36 : 216;
  const s1 = scale > 1.2 ? pillBX + Math.round(colW) + 4 : 262;
  const mX = scale > 1.2 ? s1 + 42 : 308;
  const s2 = scale > 1.2 ? pillBX + Math.round(colW * 2) + 2 : 364;
  const oX = scale > 1.2 ? s2 + 36 : 404;

  mkText(k, "FOOD",  s0, 16, S.label, PALETTE.parchment, tag);
  const initialFood = engine.supplies?.food ?? 0;
  const foodText  = mkText(k, String(initialFood), fX, 14, S.body, PALETTE.goldBright, tag);
  mkText(k, "MILES", s1, 16, S.label, PALETTE.parchment, tag);
  const milesText = mkText(k, String(engine.milesTraveled ?? 0), mX, 14, S.body, PALETTE.goldBright, tag);
  mkText(k, "OXEN",  s2, 16, S.label, PALETTE.parchment, tag);
  const oxenText  = mkText(k, String(engine.supplies?.oxen ?? 0), oX, 14, S.body, PALETTE.goldBright, tag);

  // Pill C: Trail Progress
  addPill(pillCX, pillCW);
  const barX = pillCX + 14, barY = 25, barW = pillCW - 28, barH = 8;
  const curMiles = engine.milesTraveled ?? 0;
  const fillFrac = Math.min(1, curMiles / TRAIL_MILES);

  const labelY = barY - 3;
  const nextLandmarkText = k.add([k.text(nextLandmarkLabel(curMiles), { size: S.tick }), k.pos(barX, labelY), k.color(...PALETTE.parchment), k.anchor("botleft"), k.fixed(), k.z(52), tag]);
  const pct = Math.round(curMiles / TRAIL_MILES * 100);
  const progressText = k.add([k.text(`${pct}%`, { size: S.label }), k.pos(barX + barW, labelY), k.color(...PALETTE.parchment), k.anchor("botright"), k.fixed(), k.z(52), tag]);

  k.add([k.rect(barW, barH), k.pos(barX, barY), k.color(...PALETTE.black), k.opacity(0.6), k.fixed(), k.z(52), tag]);
  const barFill = k.add([k.rect((barW - 2) * fillFrac, barH - 2), k.pos(barX + 1, barY + 1), k.color(...PALETTE.goldBright), k.fixed(), k.z(53), tag]);
  const barFillHighlight = k.add([k.rect((barW - 2) * fillFrac, 2), k.pos(barX + 1, barY + 1), k.color(...BAR_HIGHLIGHT), k.opacity(0.6), k.fixed(), k.z(53), tag]);

  for (const lm of LANDMARKS) {
    const tx = barX + (lm.miles / TRAIL_MILES) * barW;
    const passed = curMiles >= lm.miles;
    const tickCol = passed ? PALETTE.goldBright : PALETTE.parchment;
    k.add([k.rect(2, barH), k.pos(tx, barY), k.color(...tickCol), k.opacity(passed ? 0.9 : 0.4), k.fixed(), k.z(54), tag]);
  }

  return { dateText, foodText, milesText, oxenText, barFill, barFillHighlight, barW, progressText, nextLandmarkText, tag, _prevFood: initialFood };
}

export function addBottomHud(k, engine) {
  const S = getSizes();
  const scale = getUIScale();
  const tag = "hud-bottom";
  const members = engine.party?.members ?? [];
  const n = Math.max(1, members.length);
  const spacing = Math.round(64 * scale);
  const panelW = Math.max(220, n * spacing + 24);
  const panelX = (640 - panelW) / 2;
  const panelH = 40;
  const panelY = 480 - panelH;

  // Frosted capsule body
  k.add([k.rect(panelW, panelH, { radius: 18 }), k.pos(panelX, panelY), k.color(...PALETTE.outline), k.opacity(0.65), k.fixed(), k.z(50), tag]);
  k.add([k.rect(panelW - 24, 1), k.pos(panelX + 12, panelY + 2), k.color(...PALETTE.parchment), k.opacity(0.25), k.fixed(), k.z(51), tag]);

  const contentW = (n - 1) * spacing;
  const startX = panelX + (panelW - contentW) / 2;

  const icons = [];
  members.forEach((m, i) => {
    const cx = Math.round(startX + i * spacing);
    const cy = panelY + 13;
    const state = hpState(m);
    const iconTag = drawHealthIcon(k, cx, cy, state, tag);
    const label = k.add([k.text(shortName(m.name), { size: S.label }), k.pos(cx, panelY + panelH - 3), k.color(...PALETTE.parchment), k.anchor("bot"), k.fixed(), k.z(52), tag]);
    icons.push({ member: m, cx, cy, label, state, tag: iconTag });
    _prevHealthByIndex.set(i, state);
  });
  return { icons, tag };
}

export function updateHud(k, engine, hudState) {
  notifyZenActivity();
  const top = hudState.top, bottom = hudState.bottom;
  top.dateText.text  = engine.formatDate(engine.currentDate);
  const food = engine.supplies?.food ?? 0;
  top.foodText.text  = String(food);
  // Rations burn every simulated day, so any-decrease would pulse on every
  // advance and signal nothing. Alarm only on event-scale losses or on
  // crossing into the danger zone.
  if (typeof top._prevFood === "number" &&
      ((top._prevFood - food >= 30) || (food <= 25 && top._prevFood > 25))) {
    spawnPulse(k, top.foodText.pos.x + 24, top.foodText.pos.y + 7, 54, 18, PALETTE.hpRed, top.tag);
  }
  top._prevFood = food;
  top.milesText.text = String(engine.milesTraveled ?? 0);
  top.oxenText.text  = String(engine.supplies?.oxen ?? 0);
  const pct = Math.min(1, (engine.milesTraveled ?? 0) / TRAIL_MILES);
  top.barFill.width = (top.barW - 2) * pct;
  top.barFillHighlight.width = top.barFill.width;
  top.progressText.text = `${Math.round(pct * 100)}%`;
  top.nextLandmarkText.text = nextLandmarkLabel(engine.milesTraveled ?? 0);

  bottom.icons.forEach((icon, i) => {
    k.destroyAll(icon.tag);
    const state = hpState(icon.member);
    icon.tag = drawHealthIcon(k, icon.cx, icon.cy, state, bottom.tag);
    const prev = _prevHealthByIndex.get(i);
    if (prev !== undefined && prev !== state) {
      const worsened = (HP_RANK[state] ?? 0) < (HP_RANK[prev] ?? 0);
      spawnPulse(k, icon.cx, icon.cy, 30, 30, worsened ? PALETTE.hpRed : FLASH_WHITE, bottom.tag);
    }
    _prevHealthByIndex.set(i, state);
    icon.state = state;
  });
}

export function attachResizeRebuild(k, engine, hudState) {
  let lastScale = getUIScale();
  const handler = () => {
    const s = getUIScale();
    if (s === lastScale) return;
    lastScale = s;
    k.destroyAll(hudState.top.tag);
    k.destroyAll(hudState.bottom.tag);
    hudState.bottom.icons?.forEach((ic) => k.destroyAll(ic.tag));
    hudState.top = addTopHud(k, engine);
    hudState.bottom = addBottomHud(k, engine);
  };
  window.addEventListener("resize", handler);
  window.addEventListener("orientationchange", handler);
  return () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("orientationchange", handler);
  };
}

// HIGH-tier stat corruption (docs/design/graphics-pop-research.md § C8). The
// real value never changes — this overlays a short-lived glitch text object
// on top of it, like spawnPulse. Learns tone from engine.tone each tick
// rather than a snapshot, since this scheduler outlives any one advance.
export function attachStatCorruption(k, engine, hudState) {
  if (!MOTION_OK) return () => {};
  const mountedAt = k.time();
  let active = false;
  let timer = null;

  const schedule = () => { timer = k.wait(6 + k.rand(0, 6), tick); };

  function tick() {
    if (engine.tone === "high" && !active && k.time() - mountedAt >= 2) {
      const S = getSizes();
      const targets = [];
      const food = engine.supplies?.food ?? 0;
      if (food <= 25 && hudState.top?.foodText) {
        targets.push({ text: hudState.top.foodText, size: S.body, tag: hudState.top.tag, numeric: true });
      }
      const dying = (engine.party?.members ?? []).find((m) => hpState(m) === "dying");
      const dyingIcon = dying && hudState.bottom?.icons?.find((ic) => ic.member === dying);
      if (dyingIcon?.label) {
        targets.push({ text: dyingIcon.label, size: S.label, tag: hudState.bottom.tag, anchor: "bot" });
      }
      if (targets.length) {
        active = true;
        spawnCorruption(k, targets[Math.floor(k.rand(0, targets.length))], () => { active = false; });
      }
    }
    schedule();
  }

  schedule();
  return () => { timer?.cancel?.(); };
}

// Zen Travel Mode auto-fade (Phase 2): fades floating HUD and actions during calm travel.
export function attachZenFade(k, engine, hudState, opts = {}) {
  const mergedOpts = { ...(typeof window !== "undefined" ? window.__ZEN_HUD_OPTS : null), ...opts };
  const motionOk = mergedOpts.motionOk ?? (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const isHighTone = (engine.tone === "high");

  if (!motionOk || isHighTone) {
    const stub = {
      isEnabled: () => false,
      multiplier: () => 1.0,
      setIdleDelay: () => {},
      notifyActivity: () => {},
      forceVisible: () => {},
      detach: () => {},
    };
    if (typeof window !== "undefined") window.__zenHud = stub;
    return () => {
      if (typeof window !== "undefined" && window.__zenHud === stub) window.__zenHud = null;
    };
  }

  let idleDelay = typeof mergedOpts.idleDelay === "number" ? mergedOpts.idleDelay : 7.0;
  const fadeFloor = typeof mergedOpts.fadeFloor === "number" ? mergedOpts.fadeFloor : 0.15;
  const fadeDuration = typeof mergedOpts.fadeDuration === "number" ? mergedOpts.fadeDuration : 1.0;
  const restoreDuration = typeof mergedOpts.restoreDuration === "number" ? mergedOpts.restoreDuration : 0.2;

  let lastActivityTime = k.time();
  let currentMultiplier = 1.0;
  let isDetached = false;

  const applyMultiplier = (mult) => {
    const tags = ["hud-top", "hud-bottom", "hud-travel-actions"];
    for (const tag of tags) {
      const objs = k.get(tag, { recursive: true });
      for (const obj of objs) {
        if (obj._zenBaseOp === undefined) {
          obj._zenBaseOp = obj.opacity ?? 1;
        }
        obj.opacity = obj._zenBaseOp * mult;
      }
    }
  };

  const notifyActivity = () => {
    lastActivityTime = k.time();
  };

  const forceVisible = () => {
    lastActivityTime = k.time();
    currentMultiplier = 1.0;
    applyMultiplier(1.0);
  };

  const onUserActivity = () => {
    notifyActivity();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pointermove", onUserActivity, { passive: true });
    window.addEventListener("pointerdown", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity, { passive: true });
  }

  const updateEv = k.onUpdate(() => {
    if (isDetached) return;
    const dt = k.dt();
    const idleTime = k.time() - lastActivityTime;
    let targetMultiplier = 1.0;
    if (idleTime > idleDelay) {
      targetMultiplier = fadeFloor;
    }

    if (currentMultiplier > targetMultiplier) {
      const step = (1.0 - fadeFloor) / Math.max(0.01, fadeDuration) * dt;
      currentMultiplier = Math.max(targetMultiplier, currentMultiplier - step);
      applyMultiplier(currentMultiplier);
    } else if (currentMultiplier < targetMultiplier) {
      const step = (1.0 - fadeFloor) / Math.max(0.01, restoreDuration) * dt;
      currentMultiplier = Math.min(targetMultiplier, currentMultiplier + step);
      applyMultiplier(currentMultiplier);
    }
  });

  const detach = () => {
    if (isDetached) return;
    isDetached = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", onUserActivity);
      window.removeEventListener("pointerdown", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
    }
    if (typeof updateEv?.cancel === "function") {
      updateEv.cancel();
    } else if (typeof updateEv === "function") {
      updateEv();
    }

    const tags = ["hud-top", "hud-bottom", "hud-travel-actions"];
    for (const tag of tags) {
      const objs = k.get(tag, { recursive: true });
      for (const obj of objs) {
        if (obj._zenBaseOp !== undefined) {
          obj.opacity = obj._zenBaseOp;
          delete obj._zenBaseOp;
        }
      }
    }
    if (typeof window !== "undefined" && window.__zenHud === controller) {
      window.__zenHud = null;
    }
    _zenNotifier = null;
  };

  const controller = {
    isEnabled: () => true,
    multiplier: () => currentMultiplier,
    setIdleDelay: (s) => { idleDelay = s; },
    notifyActivity,
    forceVisible,
    detach,
  };
  _zenNotifier = () => forceVisible();
  if (typeof window !== "undefined") {
    window.__zenHud = controller;
  }

  return detach;
}

function spawnCorruption(k, target, onDone) {
  const frames = k.rand(0, 1) < 0.5 ? 2 : 3;
  const content = target.numeric && k.rand(0, 1) < 0.5 ? glitchDigit(k, target.text.text) : target.text.text;
  const { x, y } = target.text.pos;
  const mk = (dx, color) => {
    const comps = [k.text(content, { size: target.size }), k.pos(x + dx, y), k.color(...color), k.opacity(0.75), k.fixed(), k.z(56), target.tag];
    if (target.anchor) comps.push(k.anchor(target.anchor));
    return k.add(comps);
  };
  const red = mk(-1, [255, 70, 70]);
  const cyan = mk(1, [70, 220, 220]);
  let n = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try { red.destroy(); } catch (_) {}
    try { cyan.destroy(); } catch (_) {}
    onDone();
  };
  red.onUpdate(() => {
    n++;
    if (n >= frames) finish();
  });
  red.onDestroy(finish);
  cyan.onDestroy(finish);
}

function glitchDigit(k, str) {
  const idx = [...str].map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return str;
  const i = idx[Math.floor(k.rand(0, idx.length))];
  const orig = str[i];
  let repl;
  do { repl = String(Math.floor(k.rand(0, 10))); } while (repl === orig);
  return str.slice(0, i) + repl + str.slice(i + 1);
}

function nextLandmarkLabel(curMiles) {
  const next = LANDMARKS.find((lm) => lm.miles > curMiles);
  return next ? `${next.name} ${next.miles - curMiles}mi` : "";
}

function mkText(k, str, x, y, size, color, tag) {
  return k.add([k.text(str, { size }), k.pos(x, y), k.color(...color), k.fixed(), k.z(52), tag]);
}
const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function spawnPulse(k, cx, cy, w, h, color, tag) {
  notifyZenActivity();
  if (!MOTION_OK) return null;
  const start = k.time();
  const dur = 0.4;
  const p = k.add([k.rect(w, h), k.pos(cx, cy), k.anchor("center"), k.color(...color), k.opacity(0.5), k.fixed(), k.z(55), tag]);
  p.onUpdate(() => {
    const t = (k.time() - start) / dur;
    if (t >= 1) { p.destroy(); return; }
    p.opacity = 0.5 * (1 - t);
  });
  return p;
}
function shortName(name) {
  return (name || "?").slice(0, 6).toUpperCase();
}

export function hpState(member) {
  if (!member || !member.alive) return "dead";
  const h = member.health;
  if (typeof h !== "number") return "poor";
  if (h > 70) return "well";
  if (h > 40) return "poor";
  if (h > 20) return "ill";
  return "dying";
}
