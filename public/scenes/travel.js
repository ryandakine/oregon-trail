import * as draw from "../lib/draw.mjs";
import { addTopHud, addBottomHud, updateHud, attachResizeRebuild } from "../lib/hud.mjs";
import { applyToneOverlay } from "../lib/tone.mjs";

const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function register(k, engine) {
  k.scene("travel", () => {
    let paused = false;
    const listeners = [];
    const loops = [];
    let detachResize = null;
    function engineOn(event, fn) { engine.on(event, fn); listeners.push({ event, fn }); }

    k.onSceneLeave(() => {
      for (const { event, fn } of listeners) engine.off(event, fn);
      for (const l of loops) l?.cancel?.();
      detachResize?.();
    });

    // ── Scene setup ──
    const tone = engine.tone ?? "medium";
    const dayPhase = getDayPhase(engine.currentDate);

    const sky = draw.drawSky(k, tone, dayPhase);
    const hills = draw.drawHills(k);
    draw.drawMountains(k);
    draw.drawGround(k);
    draw.drawTrail(k);

    // Environment
    draw.drawTree(k, 560, 330);
    draw.drawRock(k, 70, 360);
    draw.drawRock(k, 110, 455, 24, 14);
    draw.drawGrassTuft(k, 60, 390);
    draw.drawGrassTuft(k, 90, 430);
    draw.drawGrassTuft(k, 540, 380);
    draw.drawGrassTuft(k, 580, 440);

    // HIGH-tier atmospheric horror
    if (tone === "high") {
      draw.drawCrow(k, 200, 120);
      draw.drawCrow(k, 420, 95);
      draw.drawCrow(k, 330, 75);
      draw.drawDeadTree(k, 90, 340);
      draw.drawDeadTree(k, 610, 345);
    }

    // ── Hero convoy ──
    const WAGON_X = 300, WAGON_Y = 360;
    draw.drawWagon(k, WAGON_X, WAGON_Y);

    // Drop shadow
    k.add([
      draw.ellipseRect(k, 130, 12),
      k.pos(WAGON_X, WAGON_Y + 48),
      k.color(...draw.PALETTE.dropShadow),
      k.opacity(0.35),
      k.anchor("center"),
    ]);

    draw.drawOx(k, WAGON_X - 140, WAGON_Y + 15);
    draw.drawOx(k, WAGON_X - 195, WAGON_Y + 15);
    k.add([k.rect(56, 3), k.pos(WAGON_X - 210, WAGON_Y - 2), k.color(...draw.PALETTE.outline)]);

    const pioneers = [
      draw.drawPioneer(k, WAGON_X + 55, WAGON_Y + 20, { hat: "felt",   body: draw.PALETTE.vest,      legs: draw.PALETTE.trousers }),
      draw.drawPioneer(k, WAGON_X - 75, WAGON_Y + 22, { hat: "bonnet", body: draw.PALETTE.dressBlue, legs: draw.PALETTE.dressBlue }),
    ];

    // ── HUDs ──
    const hudState = { top: addTopHud(k, engine), bottom: addBottomHud(k, engine) };
    detachResize = attachResizeRebuild(k, engine, hudState);

    // ── Tone overlay ──
    applyToneOverlay(k, tone);

    // ── Animation loop ──
    let walkPhase = 0;
    k.onUpdate(() => {
      if (paused || !MOTION_OK) return;

      for (const c of sky.clouds) { c.pos.x -= 0.15; if (c.pos.x < -100) c.pos.x = 700; }
      for (const h of hills.far)  { h.pos.x -= 0.2;  if (h.pos.x < -80)  h.pos.x = 720; }
      for (const h of hills.near) { h.pos.x -= 0.4;  if (h.pos.x < -60)  h.pos.x = 700; }

      walkPhase += 0.15;
      for (const p of pioneers) p.pos.y = p.baseY + Math.sin(walkPhase + p.phase) * 1.5;
    });

    // ── Weather FX ──
    const miles = engine.milesTraveled ?? 0;
    const weather = miles > 1200 ? (Math.random() > 0.5 ? "snow" : "clear")
                  : miles > 600  ? (Math.random() > 0.5 ? "dust" : "clear")
                  :                 (Math.random() > 0.7 ? "rain" : "clear");

    if (weather === "rain" && MOTION_OK) {
      loops.push(k.loop(0.05, () => {
        if (paused) return;
        const drop = k.add([k.rect(1, 8), k.pos(Math.random() * 640, -10), k.color(96, 120, 180), k.opacity(0.6), k.z(40)]);
        drop.onUpdate(() => { drop.pos.y += 6; drop.pos.x -= 0.5; if (drop.pos.y > 480) drop.destroy(); });
      }));
    } else if (weather === "snow" && MOTION_OK) {
      loops.push(k.loop(0.1, () => {
        if (paused) return;
        const flake = k.add([k.circle(2), k.pos(Math.random() * 640, -10), k.color(248, 248, 255), k.opacity(0.7), k.z(40)]);
        flake.onUpdate(() => { flake.pos.y += 1.5; flake.pos.x += Math.sin(k.time() * 3 + flake.pos.y * 0.1) * 0.5; if (flake.pos.y > 480) flake.destroy(); });
      }));
    } else if (weather === "dust" && MOTION_OK) {
      loops.push(k.loop(0.08, () => {
        if (paused) return;
        const p = k.add([k.circle(2), k.pos(660, 250 + Math.random() * 200), k.color(...draw.PALETTE.dirtLight), k.opacity(0.4), k.z(40)]);
        p.onUpdate(() => { p.pos.x -= 3; p.pos.y += Math.sin(k.time() * 2) * 0.3; p.opacity -= 0.003; if (p.pos.x < -20 || p.opacity <= 0) p.destroy(); });
      }));
    }

    // ── Floating text ──
    function showFloatingText(msg) {
      const ft = k.add([k.text(msg, { size: 12, width: 400 }), k.pos(320, 430), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.opacity(1), k.z(60)]);
      ft.onUpdate(() => { ft.pos.y -= 0.3; ft.opacity -= 0.008; if (ft.opacity <= 0) ft.destroy(); });
    }

    // ── Engine handlers ──
    engineOn("daysAdvanced", ({ summaries }) => {
      updateHud(k, engine, hudState);
      for (const s of summaries) {
        for (const evt of (s.events ?? [])) {
          if (evt.text || evt.description) showFloatingText(evt.text || evt.description);
        }
      }
    });
    engineOn("error", ({ message }) => showFloatingText("Error: " + message));

    // ── Pause ──
    let pauseOverlay = null;
    function togglePause() {
      paused = !paused;
      if (paused) {
        engine.pauseAdvance();
        pauseOverlay = k.add([k.rect(640, 480), k.pos(0, 0), k.color(0, 0, 0), k.opacity(0.7), k.z(100)]);
        k.add([k.text("PAUSED", { size: 36 }), k.pos(320, 180), k.anchor("center"), k.color(...draw.PALETTE.gold), k.z(101), "pauseTag"]);
        const party = engine.party;
        const sup2 = engine.supplies;
        const statsLines = [
          `Date: ${engine.formatDate(engine.currentDate)}`,
          `Miles: ${engine.milesTraveled} / 1764`,
          `Food: ${sup2?.food ?? 0} lbs`,
          `Oxen: ${sup2?.oxen ?? 0}`,
          `Money: ${engine.formatMoney(sup2?.money ?? 0)}`,
          "",
          "Party:",
          ...(party?.members ?? []).map(m => `  ${m.name}: ${m.alive ? m.health + "/100" : "DEAD"}`),
          "",
          "Press P to resume",
        ];
        k.add([k.text(statsLines.join("\n"), { size: 13, width: 400 }), k.pos(320, 240), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.z(101), "pauseTag"]);
      } else {
        engine.resumeAdvance();
        k.destroyAll("pauseTag");
        pauseOverlay?.destroy();
        pauseOverlay = null;
        engine.advance();
      }
    }
    k.onKeyPress("p", togglePause);
    k.onClick(() => { if (k.mousePos().x < 100 && k.mousePos().y < 60) togglePause(); });

    engine.resumeAdvance();
    engine.advance();
  });
}

function getDayPhase(dateStr) {
  if (!dateStr) return "day";
  const d = new Date(dateStr + "T00:00:00");
  return ["dawn", "day", "day", "dusk"][d.getDate() % 4];
}
