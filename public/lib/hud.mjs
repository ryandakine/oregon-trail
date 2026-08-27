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

export function addTopHud(k, engine) {
  const S = getSizes();
  const tag = "hud-top";
  const y = 10;

  // Strip is 44 tall (was 36) so the landmark/% row above the bar has real
  // clearance at both UI scales — the old 36px box clipped that row's glyphs
  // against the panel's top edge once text left the bar itself (playtest
  // finding: labels reading as a clipped, overlapping smear).
  k.add([k.rect(640, 44), k.pos(0, 0), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(50), tag]);
  k.add([k.rect(632, 36), k.pos(4, 4), k.color(...PALETTE.parchment), k.outline(2, k.rgb(...PALETTE.outline)), k.fixed(), k.z(51), tag]);

  const dateText  = mkText(k, engine.formatDate(engine.currentDate),        12,  y, S.body, PALETTE.parchmentDark, tag);
  mkText(k, "FOOD",  180, y, S.body, PALETTE.parchmentDark, tag);
  const initialFood = engine.supplies?.food ?? 0;
  const foodText  = mkText(k, String(initialFood),                          230, y, S.body, PALETTE.goldBright, tag);
  mkText(k, "MILES", 290, y, S.body, PALETTE.parchmentDark, tag);
  const milesText = mkText(k, String(engine.milesTraveled ?? 0),            350, y, S.body, PALETTE.goldBright, tag);
  mkText(k, "OXEN",  410, y, S.body, PALETTE.parchmentDark, tag);
  const oxenText  = mkText(k, String(engine.supplies?.oxen ?? 0),           460, y, S.body, PALETTE.goldBright, tag);

  const barX = 500, barY = 27, barW = 128, barH = 10;
  const curMiles = engine.milesTraveled ?? 0;
  // Every scene re-entry rebuilds the HUD from scratch (travel is left and
  // returned to constantly — after every event/landmark/river), so the fill
  // must start at the real progress, not 0, or the bar flashes empty each
  // time until the next updateHud() call catches up.
  const fillFrac = Math.min(1, curMiles / TRAIL_MILES);
  k.add([k.rect(barW, barH), k.pos(barX, barY), k.color(...PALETTE.outline), k.fixed(), k.z(52), tag]);
  const barFill = k.add([k.rect((barW - 2) * fillFrac, 8), k.pos(barX + 1, barY + 1), k.color(...PALETTE.goldBright), k.fixed(), k.z(53), tag]);
  const barFillHighlight = k.add([k.rect((barW - 2) * fillFrac, 2), k.pos(barX + 1, barY + 1), k.color(...BAR_HIGHLIGHT), k.opacity(0.6), k.fixed(), k.z(53), tag]);

  for (const lm of LANDMARKS) {
    const tx = barX + (lm.miles / TRAIL_MILES) * barW;
    const passed = curMiles >= lm.miles;
    const tickCol = passed ? PALETTE.goldBright : PALETTE.parchmentDark;
    k.add([k.rect(2, barH), k.pos(tx, barY), k.color(...tickCol), k.fixed(), k.z(54), tag]);
  }

  // Six clipped single-letter tick labels read as an illegible smear
  // (playtest finding). Show only the single next upcoming landmark, and
  // give the % readout its own corner of the same row instead of stacking
  // a third line the strip has no room for.
  const labelY = barY - 2;
  const nextLandmarkText = k.add([k.text(nextLandmarkLabel(curMiles), { size: S.tick }), k.pos(barX, labelY), k.color(...PALETTE.parchmentDark), k.anchor("botleft"), k.fixed(), k.z(52), tag]);

  const pct = Math.round(curMiles / TRAIL_MILES * 100);
  const progressText = k.add([k.text(`${pct}%`, { size: S.label }), k.pos(barX + barW, labelY), k.color(...PALETTE.parchmentDark), k.anchor("botright"), k.fixed(), k.z(52), tag]);

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
  // Flush to the canvas bottom edge (480), matching the top HUD's flush-to-0
  // convention — the extra height gives the name label room to clear 480
  // without truncating, at both UI scales.
  const panelH = 40;
  const panelY = 480 - panelH;

  k.add([k.rect(panelW, panelH), k.pos(panelX, panelY), k.color(...PALETTE.outline), k.fixed(), k.z(50), tag]);
  k.add([k.rect(panelW - 6, panelH - 6), k.pos(panelX + 3, panelY + 3), k.color(...PALETTE.parchment), k.fixed(), k.z(51), tag]);

  const contentW = (n - 1) * spacing;
  const startX = panelX + (panelW - contentW) / 2;

  const icons = [];
  members.forEach((m, i) => {
    const cx = Math.round(startX + i * spacing);
    const cy = panelY + 13;
    const state = hpState(m);
    const iconTag = drawHealthIcon(k, cx, cy, state);
    const label = k.add([k.text(shortName(m.name), { size: S.label }), k.pos(cx, panelY + panelH - 3), k.color(...PALETTE.parchmentDark), k.anchor("bot"), k.fixed(), k.z(52), tag]);
    icons.push({ member: m, cx, cy, label, state, tag: iconTag });
    _prevHealthByIndex.set(i, state);
  });
  return { icons, tag };
}

export function updateHud(k, engine, hudState) {
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
    icon.tag = drawHealthIcon(k, icon.cx, icon.cy, state);
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
  red.onUpdate(() => {
    n++;
    if (n >= frames) { red.destroy(); cyan.destroy(); onDone(); }
  });
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
