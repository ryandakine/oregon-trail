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
  { name: "Kearney",    short: "K", miles: 304 },
  { name: "Chimney",    short: "C", miles: 592 },
  { name: "Laramie",    short: "L", miles: 672 },
  { name: "South Pass", short: "S", miles: 932 },
  { name: "Fort Hall",  short: "F", miles: 1288 },
  { name: "Blue Mtns",  short: "B", miles: 1564 },
];
const TRAIL_MILES = 1764;

export function addTopHud(k, engine) {
  const S = getSizes();
  const tag = "hud-top";
  const y = 10;

  k.add([k.rect(640, 36), k.pos(0, 0), k.color(...PALETTE.parchmentDark), k.fixed(), k.z(50), tag]);
  k.add([k.rect(632, 28), k.pos(4, 4), k.color(...PALETTE.parchment), k.outline(2, k.rgb(...PALETTE.outline)), k.fixed(), k.z(51), tag]);

  const dateText  = mkText(k, engine.formatDate(engine.currentDate),        12,  y, S.body, PALETTE.parchmentDark, tag);
  mkText(k, "FOOD",  180, y, S.body, PALETTE.parchmentDark, tag);
  const foodText  = mkText(k, String(engine.supplies?.food ?? 0),           230, y, S.body, PALETTE.goldBright, tag);
  mkText(k, "MILES", 290, y, S.body, PALETTE.parchmentDark, tag);
  const milesText = mkText(k, String(engine.milesTraveled ?? 0),            350, y, S.body, PALETTE.goldBright, tag);
  mkText(k, "OXEN",  410, y, S.body, PALETTE.parchmentDark, tag);
  const oxenText  = mkText(k, String(engine.supplies?.oxen ?? 0),           460, y, S.body, PALETTE.goldBright, tag);

  const barX = 500, barY = 14, barW = 128, barH = 10;
  const curMiles = engine.milesTraveled ?? 0;
  k.add([k.rect(barW, barH), k.pos(barX, barY), k.color(...PALETTE.outline), k.fixed(), k.z(52), tag]);
  const barFill = k.add([k.rect(0, 8), k.pos(barX + 1, barY + 1), k.color(...PALETTE.goldBright), k.fixed(), k.z(53), tag]);

  for (const lm of LANDMARKS) {
    const tx = barX + (lm.miles / TRAIL_MILES) * barW;
    const passed = curMiles >= lm.miles;
    const tickCol = passed ? PALETTE.goldBright : PALETTE.parchmentDark;
    k.add([k.rect(2, barH), k.pos(tx, barY), k.color(...tickCol), k.fixed(), k.z(54), tag]);
    k.add([k.text(lm.short, { size: S.tick }), k.pos(tx, barY - 3), k.color(...PALETTE.parchmentDark), k.anchor("bot"), k.fixed(), k.z(52), tag]);
  }

  const pct = Math.round(curMiles / TRAIL_MILES * 100);
  const progressText = k.add([k.text(`${pct}%`, { size: S.label }), k.pos(barX + barW / 2, barY + barH + 2), k.color(...PALETTE.parchmentDark), k.anchor("center"), k.fixed(), k.z(52), tag]);

  return { dateText, foodText, milesText, oxenText, barFill, barW, progressText, tag };
}

export function addBottomHud(k, engine) {
  const S = getSizes();
  const scale = getUIScale();
  const tag = "hud-bottom";
  const members = engine.party?.members ?? [];
  const n = Math.max(1, members.length);
  const spacing = Math.round(54 * scale);
  const panelW = Math.max(220, n * spacing + 24);
  const panelX = (640 - panelW) / 2;
  const panelY = 440;

  k.add([k.rect(panelW, 36), k.pos(panelX, panelY), k.color(...PALETTE.outline), k.fixed(), k.z(50), tag]);
  k.add([k.rect(panelW - 6, 30), k.pos(panelX + 3, panelY + 3), k.color(...PALETTE.parchment), k.fixed(), k.z(51), tag]);

  const contentW = (n - 1) * spacing;
  const startX = panelX + (panelW - contentW) / 2;

  const icons = [];
  members.forEach((m, i) => {
    const cx = Math.round(startX + i * spacing);
    const cy = panelY + 14;
    const state = hpState(m);
    const iconTag = drawHealthIcon(k, cx, cy, state);
    const label = k.add([k.text(shortName(m.name), { size: S.label }), k.pos(cx, cy + 22), k.color(...PALETTE.parchmentDark), k.anchor("center"), k.fixed(), k.z(52), tag]);
    icons.push({ member: m, cx, cy, label, state, tag: iconTag });
  });
  return { icons, tag };
}

export function updateHud(k, engine, hudState) {
  const top = hudState.top, bottom = hudState.bottom;
  top.dateText.text  = engine.formatDate(engine.currentDate);
  top.foodText.text  = String(engine.supplies?.food ?? 0);
  top.milesText.text = String(engine.milesTraveled ?? 0);
  top.oxenText.text  = String(engine.supplies?.oxen ?? 0);
  const pct = Math.min(1, (engine.milesTraveled ?? 0) / TRAIL_MILES);
  top.barFill.width = (top.barW - 2) * pct;
  top.progressText.text = `${Math.round(pct * 100)}%`;

  bottom.icons.forEach((icon) => {
    k.destroyAll(icon.tag);
    const state = hpState(icon.member);
    icon.tag = drawHealthIcon(k, icon.cx, icon.cy, state);
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

function mkText(k, str, x, y, size, color, tag) {
  return k.add([k.text(str, { size }), k.pos(x, y), k.color(...color), k.fixed(), k.z(52), tag]);
}
function shortName(name) {
  return (name || "?").slice(0, 4).toUpperCase();
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
