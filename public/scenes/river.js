import * as draw from "../lib/draw.mjs";
import { PALETTE, mixColor, segmentColor } from "../lib/draw.mjs";
import { segmentForMiles, segmentBlend } from "../lib/segments.mjs";
import { createJuice, MOTION_OK } from "../lib/juice.mjs";
import { isAssetReady } from "../lib/assets.mjs";

export default function register(k, engine) {
  k.scene("river", (data) => {
    const W = 640;
    const H = 480;
    const juice = createJuice(k);
    const river = data || {};
    const name = river.name || "Unknown River";
    const width = river.width_ft || river.width || "medium";
    const depth = river.depth_ft_summer || river.depth_ft_spring || river.depth || "medium";

    // Defensively normalize ford_difficulty (numeric 1-5, string like "moderate", or null)
    const rawDifficulty = river.ford_difficulty ?? river.difficulty ?? 3;
    const diffNum = typeof rawDifficulty === "number"
      ? rawDifficulty
      : ({ easy: 1, moderate: 3, hard: 4, dangerous: 5 }[rawDifficulty] ?? 3);
    const diffNorm = Math.min(1, Math.max(0, (diffNum - 1) / 4));
    const DIFFICULTY_LABELS = { 1: "easy", 2: "easy", 3: "moderate", 4: "hard", 5: "dangerous" };
    const difficulty = typeof rawDifficulty === "number"
      ? (DIFFICULTY_LABELS[rawDifficulty] || "moderate")
      : String(rawDifficulty);

    // ferry_cost_1848_dollars is DOLLARS (worker/src/types.ts RiverCrossing);
    // formatMoney() expects CENTS like every other money value in the engine.
    const ferryCost = river.ferry_cost_1848_dollars != null
      ? river.ferry_cost_1848_dollars * 100
      : (river.ferry_cost || 500);

    // Active mood arc segment
    const miles = engine.milesTraveled ?? 0;
    const segment = segmentBlend(miles);

    // ── Sky gradient & distant horizon ──
    const segZenith = segmentColor(segment, "zenith") || PALETTE.skyTwilight;
    const segHorizon = segmentColor(segment, "horizon") || PALETTE.skyNightHorizon;
    const SKY_BANDS = 6;
    const skyH = 155;
    for (let i = 0; i < SKY_BANDS; i++) {
      const col = mixColor(segZenith, segHorizon, i / (SKY_BANDS - 1));
      k.add([
        k.rect(W, skyH / SKY_BANDS + 1),
        k.pos(0, (i * skyH) / SKY_BANDS),
        k.color(...col),
      ]);
    }
    k.add([k.rect(W, 20), k.pos(0, 140), k.color(...segHorizon), k.opacity(0.5)]);

    // Distant hills
    const farColor = segmentColor(segment, "far") || PALETTE.mountainFar;
    const roundedHill = (cx, cy, w, h, col) => k.add([
      k.rect(w, h, { radius: [h, h, 0, 0] }),
      k.pos(cx - w / 2, cy - h),
      k.color(...col),
    ]);
    roundedHill(140, 158, 260, 24, mixColor(farColor, PALETTE.outline, 0.2));
    roundedHill(380, 158, 300, 28, farColor);
    roundedHill(590, 158, 240, 20, mixColor(farColor, PALETTE.outline, 0.2));

    // ── Far riverbank (rich earth/rut with shoreline grass tufts) ──
    const farGround = segmentColor(segment, "ground") || PALETTE.grassMid;
    k.add([k.rect(W, 20), k.pos(0, 155), k.color(...farGround)]);
    k.add([k.rect(W, 15), k.pos(0, 175), k.color(...PALETTE.dirtMid)]);
    k.add([k.rect(W, 10), k.pos(0, 190), k.color(...PALETTE.rut)]);
    k.add([k.rect(W, 3), k.pos(0, 197), k.color(...PALETTE.dirtDark), k.opacity(0.8)]);

    const farTuftX = [30, 95, 175, 270, 370, 465, 540, 615];
    for (const tx of farTuftX) {
      draw.drawGrassTuft(k, tx, 175);
    }

    // ── Water channel & water tint ──
    // Scale water color from clear mountain teal (PALETTE.sky) at ford_difficulty 1 to muddy brown (PALETTE.rut) at ford_difficulty 5
    const waterY = 200;
    const waterH = 180;
    const waterColor = mixColor(PALETTE.sky, PALETTE.rut, diffNorm);
    const waterDeep = mixColor(waterColor, PALETTE.outline, 0.35);
    const waterSurface = mixColor(waterColor, PALETTE.skyPale, 0.25);

    k.add([k.rect(W, waterH), k.pos(0, waterY), k.color(...waterDeep)]);
    k.add([k.rect(W, waterH * 0.65), k.pos(0, waterY), k.color(...waterColor), k.opacity(0.85)]);

    if (river.ferry_available !== false && isAssetReady("river_ferry")) {
      k.add([
        k.sprite("river_ferry"),
        k.pos(530, 235),
        k.anchor("center"),
        k.scale(0.8),
      ]);
    }

    // ── Submerged Wagon & Oxen Convoy ──
    const wagonX = 350;
    const wagonY = 282;

    // Yoke beam between oxen
    k.add([k.rect(88, 5, { radius: 2 }), k.pos(wagonX - 240, wagonY - 4), k.color(...PALETTE.outline)]);
    k.add([k.rect(84, 2), k.pos(wagonX - 238, wagonY - 3), k.color(...PALETTE.woodLight)]);
    k.add([k.rect(18, 3), k.pos(wagonX - 155, wagonY - 1), k.color(...PALETTE.outline), k.rotate(28)]);

    // Oxen team pulling west
    draw.drawOx(k, wagonX - 210, wagonY + 13, { animate: MOTION_OK, phase: 1.6 });
    draw.drawOx(k, wagonX - 130, wagonY + 13, { animate: MOTION_OK, phase: 0 });

    // Wagon
    draw.drawWagon(k, wagonX, wagonY, { rolling: MOTION_OK });

    // ── Water surface overlay (partially submerges wheels and hooves) ──
    const waterlineY = 308;
    k.add([
      k.rect(W, (waterY + waterH) - waterlineY),
      k.pos(0, waterlineY),
      k.color(...waterColor),
      k.opacity(0.5),
    ]);
    k.add([
      k.rect(W, (waterY + waterH) - (waterlineY + 18)),
      k.pos(0, waterlineY + 18),
      k.color(...waterDeep),
      k.opacity(0.32),
    ]);

    // ── Dynamic foam ripples and wakes around wheels and oxen legs ──
    const wakeHubs = [
      { x: wagonX - 215, y: waterlineY, w: 16 }, // Ox 2 front hooves
      { x: wagonX - 195, y: waterlineY, w: 14 }, // Ox 2 rear hooves
      { x: wagonX - 135, y: waterlineY, w: 16 }, // Ox 1 front hooves
      { x: wagonX - 115, y: waterlineY, w: 14 }, // Ox 1 rear hooves
      { x: wagonX - 42,  y: waterlineY, w: 22 }, // Left wagon wheel
      { x: wagonX + 42,  y: waterlineY, w: 22 }, // Right wagon wheel
    ];

    const foamObjects = [];
    wakeHubs.forEach((hub, idx) => {
      // Upstream bow wedge / foam collar
      const bow = k.add([
        k.rect(hub.w, 3, { radius: 1 }),
        k.pos(hub.x - hub.w / 2, hub.y - 1),
        k.color(...PALETTE.cloud),
        k.opacity(0.8),
      ]);
      foamObjects.push({
        update(time) {
          bow.opacity = 0.65 + 0.25 * Math.sin(time * 5 + idx);
        },
      });

      // Trailing wake ripples drifting downstream
      for (let r = 0; r < 2; r++) {
        const ripple = k.add([
          k.rect(hub.w * 0.8, 2, { radius: 1 }),
          k.pos(hub.x + 4 + r * 10, hub.y + (r === 0 ? -1 : 1)),
          k.color(...PALETTE.skyPale),
          k.opacity(0.6),
        ]);
        foamObjects.push({
          update(time) {
            const cycle = ((time * 1.5 + r * 0.5 + idx * 0.3) % 1);
            ripple.pos.x = hub.x + 4 + cycle * 24;
            ripple.opacity = Math.max(0, 0.7 * (1 - cycle));
          },
        });
      }
    });

    // ── Multi-layered scrolling current lines (updating rects, no particles) ──
    const lines = [];
    // Deep layer
    for (let i = 0; i < 8; i++) {
      const w = 50 + Math.random() * 40;
      const line = k.add([
        k.rect(w, 2),
        k.pos(Math.random() * W, waterY + 8 + i * 20),
        k.color(...mixColor(waterColor, PALETTE.outline, 0.25)),
        k.opacity(0.35 + Math.random() * 0.2),
      ]);
      lines.push({ obj: line, speed: 30 + Math.random() * 20, w });
    }
    // Mid layer
    for (let i = 0; i < 10; i++) {
      const w = 80 + Math.random() * 50;
      const line = k.add([
        k.rect(w, 2),
        k.pos(Math.random() * W, waterY + 6 + i * 16),
        k.color(...waterSurface),
        k.opacity(0.45 + Math.random() * 0.2),
      ]);
      lines.push({ obj: line, speed: 55 + Math.random() * 30, w });
    }
    // Surface froth streaks
    for (let i = 0; i < 8; i++) {
      const w = 100 + Math.random() * 60;
      const line = k.add([
        k.rect(w, 2),
        k.pos(Math.random() * W, waterY + 12 + i * 20),
        k.color(...PALETTE.skyPale),
        k.opacity(0.5 + Math.random() * 0.25),
      ]);
      lines.push({ obj: line, speed: 90 + Math.random() * 40, w });
    }

    k.onUpdate(() => {
      if (MOTION_OK) {
        const dt = k.dt();
        const time = k.time();
        for (const l of lines) {
          l.obj.pos.x += l.speed * dt;
          if (l.obj.pos.x > W) {
            l.obj.pos.x = -l.w;
          }
        }
        for (const f of foamObjects) {
          f.update(time);
        }
      }
    });

    // ── Near riverbank (rich earth/rut with shoreline grass tufts) ──
    const nearGround = segmentColor(segment, "groundAlt") || PALETTE.grassLight;
    k.add([k.rect(W, 4), k.pos(0, 376), k.color(...PALETTE.dirtDark), k.opacity(0.85)]);
    k.add([k.rect(W, 14), k.pos(0, 380), k.color(...PALETTE.rut)]);
    k.add([k.rect(W, 16), k.pos(0, 394), k.color(...PALETTE.dirtMid)]);
    k.add([k.rect(W, 70), k.pos(0, 410), k.color(...nearGround)]);

    const nearTuftX = [45, 115, 195, 290, 385, 475, 555, 620];
    for (const tx of nearTuftX) {
      draw.drawGrassTuft(k, tx, 388);
    }
    const lowTuftX = [80, 230, 420, 580];
    for (const tx of lowTuftX) {
      draw.drawGrassTuft(k, tx, 416);
    }

    // Splash burst on commitment
    function spawnSplash(x, y) {
      const burst = k.add([
        k.pos(x, y),
        k.particles({
          max: 16,
          speed: [70, 150],
          lifeTime: [0.35, 0.65],
          angle: [0, 0],
          angularVelocity: [0, 0],
          acceleration: [k.vec2(0, 260), k.vec2(0, 380)],
          damping: [0.05, 0.2],
          colors: [k.rgb(...PALETTE.sky), k.rgb(...PALETTE.skyPale)],
          opacities: [0.9, 0],
          scales: [0.7, 0.2],
        }, {
          direction: -90,
          spread: 70,
          rate: 0,
        }),
      ]);
      burst.emit(k.randi(10, 14));
      k.wait(0.8, () => burst.destroy());
    }

    // ── Header & Info Texts ──
    // River name
    k.add([
      k.text(name, { size: 28 }),
      k.pos(W / 2, 30),
      k.anchor("center"),
      k.color(...PALETTE.goldBright),
    ]);

    // Info text
    const widthLabels = { narrow: "Narrow", medium: "Medium", wide: "Wide", very_wide: "Very Wide" };
    const depthLabels = { shallow: "Shallow", medium: "Medium", deep: "Deep", very_deep: "Very Deep" };
    const infoStr = `Width: ${widthLabels[width] || width}  |  Depth: ${depthLabels[depth] || depth}`;
    k.add([
      k.text(infoStr, { size: 16 }),
      k.pos(W / 2, 65),
      k.anchor("center"),
      k.color(...PALETTE.parchment),
    ]);

    // Difficulty indicator
    const diffColors = {
      easy: PALETTE.hpGreen,
      moderate: PALETTE.hpYellow,
      hard: PALETTE.hpOrange,
      dangerous: PALETTE.hpRed,
    };
    const diffColor = diffColors[difficulty] || diffColors.moderate;
    k.add([
      k.text(`Difficulty: ${difficulty.toUpperCase()}`, { size: 14 }),
      k.pos(W / 2, 90),
      k.anchor("center"),
      k.color(...diffColor),
    ]);

    // Choice buttons
    const btnY = 418;
    const btnH = 36;
    const btnW = 180;
    const btnGap = 10;
    const totalW = btnW * 3 + btnGap * 2;
    const startX = (W - totalW) / 2;

    const fordColors = {
      easy: PALETTE.hpGreen,
      moderate: PALETTE.hpYellow,
      hard: PALETTE.hpOrange,
      dangerous: PALETTE.hpRed,
    };
    const fordC = fordColors[difficulty] || fordColors.moderate;

    // Gray out ferry if not enough money or not available
    const money = engine.supplies?.money || 0;
    const ferryUnavailable = river.ferry_available === false;
    const ferryUnaffordable = money < ferryCost;
    const ferrySub = ferryUnavailable
      ? "No ferry"
      : ferryUnaffordable
        ? `Need ${engine.formatMoney(ferryCost)}`
        : "Safe · Paid";

    // Button labels use (N) parens, not [N]. Kaplay's styled-text parser
    // treats `[1]` as an unclosed style tag and throws.
    const buttons = [
      { label: "(1) Ford River", sub: "Free · High risk", color: fordC, key: "1", choice: "ford" },
      { label: "(2) Caulk & Float", sub: "Free · Moderate risk", color: PALETTE.canvasMid, key: "2", choice: "caulk" },
      { label: `(3) Ferry ${engine.formatMoney(ferryCost)}`, sub: ferrySub, color: PALETTE.hpGreen, key: "3", choice: "ferry" },
    ];

    if (ferryUnaffordable || ferryUnavailable) {
      buttons[2].color = PALETTE.hpDead;
    }

    let selected = false;

    buttons.forEach((btn, i) => {
      const bx = startX + i * (btnW + btnGap);

      // Choose crossing method: shared by key and tap
      const choose = () => {
        if (selected) return;
        if (btn.choice === "ferry" && (ferryUnaffordable || ferryUnavailable)) return;
        selected = true;
        juice.minor();
        if (MOTION_OK) spawnSplash(wagonX, wagonY);
        engine.resolveRiver(btn.choice);
      };

      const bg = k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(...btn.color),
        k.opacity(0.85),
        k.area(),
        "riverChoice",
      ]);
      bg.onClick(choose);

      k.add([
        k.text(btn.label, { size: 14 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(...PALETTE.cloud),
        "riverChoice",
      ]);

      k.add([
        k.text(btn.sub, { size: 11 }),
        k.pos(bx + btnW / 2, btnY + btnH + 10),
        k.anchor("center"),
        k.color(...PALETTE.parchment),
        "riverChoice",
      ]);

      k.onKeyPress(btn.key, choose);
      if (btn.choice === "ferry") {
        k.onKeyPress("4", choose);
      }
    });

    // Crossing description panel
    const panelY = 110;
    k.add([
      k.rect(W - 40, 44, { radius: 4 }),
      k.pos(20, panelY),
      k.color(...PALETTE.silhouetteFar),
      k.opacity(0.85),
      "riverPrompt",
    ]);

    const desc = river.description || "The river blocks your path. Choose how to cross.";
    k.add([
      k.text(desc, { size: 13, width: W - 80, align: "center" }),
      k.pos(W / 2, panelY + 22),
      k.anchor("center"),
      k.color(...PALETTE.parchment),
      "riverPrompt",
    ]);

    // Error message display
    const errorObj = k.add([
      k.text("", { size: 14, width: W - 80 }),
      k.pos(W / 2, panelY + 60),
      k.anchor("center"),
      k.color(...PALETTE.hpRed),
    ]);

    // ── Result beat ──
    const METHOD_LINE = {
      ford: "You forded the river.",
      caulk: "You caulked the wagon and floated across.",
      ferry: "You paid the ferryman.",
    };

    let resolved = false;

    const onResolved = ({ narrative, choice, deltas }) => {
      resolved = true;
      k.destroyAll("riverChoice");
      k.destroyAll("riverPrompt");
      errorObj.text = "";

      const hadLoss = Boolean(
        deltas?.died?.length ||
        Object.entries(deltas || {}).some(
          ([key, val]) => key !== "money" && key !== "died" && typeof val === "number" && val < 0,
        ),
      );
      window.audio?.sting(hadLoss ? "danger" : "good");

      const panelTop = panelY;
      k.add([k.rect(W - 60, 200, { radius: 6 }), k.pos(30, panelTop), k.color(...PALETTE.silhouetteFar), k.opacity(0.92), k.z(50)]);
      k.add([
        k.text(METHOD_LINE[choice] || "The crossing is behind you.", { size: 16, width: W - 110, align: "center" }),
        k.pos(W / 2, panelTop + 26), k.anchor("center"), k.color(...PALETTE.goldBright), k.z(51),
      ]);
      k.add([
        k.text(narrative || "The party reached the far bank.", { size: 13, width: W - 110, align: "center" }),
        k.pos(W / 2, panelTop + 90), k.anchor("center"), k.color(...PALETTE.parchment), k.z(51),
      ]);
      const deltaLine = engine.formatDeltas?.(deltas) || "";
      k.add([
        k.text(deltaLine || "No losses.", { size: 13, width: W - 110, align: "center" }),
        k.pos(W / 2, panelTop + 162), k.anchor("center"),
        k.color(...(deltaLine ? PALETTE.gold : PALETTE.hpGreen)), k.z(51),
      ]);

      const contW = 200, contH = 36, contX = (W - contW) / 2;
      const cont = k.add([
        k.rect(contW, contH, { radius: 4 }), k.pos(contX, btnY),
        k.color(...PALETTE.hpGreen), k.opacity(0.9), k.area(), k.z(51),
      ]);
      k.add([
        k.text("(C) Continue", { size: 14 }), k.pos(W / 2, btnY + contH / 2),
        k.anchor("center"), k.color(...PALETTE.cloud), k.z(52),
      ]);
      const goOn = () => engine.continueFromResult();
      cont.onClick(goOn);
      k.onKeyPress("space", goOn);
      k.onKeyPress("enter", goOn);
      k.onKeyPress("c", goOn);
    };
    engine.on('riverResolved', onResolved);

    // Error recovery
    const onError = ({ message }) => {
      if (resolved) return;
      selected = false; // Re-enable buttons
      errorObj.text = message || 'Crossing failed. Try again.';
    };
    engine.on('error', onError);
    k.onSceneLeave(() => {
      engine.off('error', onError);
      engine.off('riverResolved', onResolved);
    });
  });
}
