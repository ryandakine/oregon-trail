import {
  PALETTE,
  mixColor,
  seedFrom,
  seededRng,
  ellipseRect,
  drawGlow,
  drawCloud,
  drawRock,
  drawGrassTuft,
  drawBison,
  drawDeer,
  drawRabbit,
} from "../lib/draw.mjs";
import { createJuice, MOTION_OK } from "../lib/juice.mjs";
import { isDesktopPointer } from "../render-mode.mjs";

export default function register(k, engine) {
  k.scene("hunting", (data) => {
    const W = 640;
    const H = 480;
    const juice = createJuice(k);
    const miles = engine.milesTraveled ?? data?.miles ?? 0;

    function spawnShotBurst(x, y) {
      const burst = k.add([
        k.pos(x, y),
        k.particles({
          max: 16,
          speed: [50, 130],
          lifeTime: [0.25, 0.45],
          angle: [0, 0],
          angularVelocity: [0, 0],
          acceleration: [k.vec2(0, 150), k.vec2(0, 250)],
          damping: [0.1, 0.3],
          colors: [k.rgb(...PALETTE.goldBright), k.rgb(...PALETTE.dust), k.rgb(...PALETTE.cloud)],
          opacities: [0.95, 0],
          scales: [0.6, 0.15],
        }, {
          direction: -90,
          spread: 140,
          rate: 0,
        }),
        k.z(55),
      ]);
      burst.emit(k.randi(8, 14));
      k.wait(0.55, () => burst.destroy());
    }

    // ── Sky gradient & atmosphere ──
    const SKY_BANDS = 14;
    const skyH = 188;
    const bandH = skyH / SKY_BANDS;
    for (let i = 0; i < SKY_BANDS; i++) {
      const col = mixColor(PALETTE.sky, PALETTE.skyPale, i / (SKY_BANDS - 1));
      k.add([k.rect(W, bandH + 0.5), k.pos(0, i * bandH), k.color(...col), k.z(1)]);
    }
    // Horizon haze strip
    k.add([k.rect(W, 22), k.pos(0, skyH - 12), k.color(...PALETTE.hazePlatte), k.opacity(0.6), k.z(2)]);

    // Sun disc & glow
    const celestial = k.add([k.pos(530, 52), k.z(3)]);
    drawGlow(k, celestial, 0, 0, 32, PALETTE.sunGlow, { rings: 5, opacity: 0.35 });
    celestial.add([k.circle(13), k.color(...PALETTE.sunCore), k.anchor("center")]);

    // Distant drifting clouds
    drawCloud(k, 110, 48, 0.9, 0.85);
    drawCloud(k, 370, 38, 0.75, 0.8);

    // ── Distant rolling hills ──
    const hillSeed = seedFrom(W, 175);
    const hillRng = seededRng(hillSeed);
    // Backing ridge
    k.add([k.rect(W, 30), k.pos(0, 168), k.color(...PALETTE.farDivide), k.opacity(0.85), k.z(3)]);
    // Rounded rolling hills
    const roundedHill = (cx, cy, w, h, col, z = 4) => k.add([
      k.rect(w, h, { radius: [h, h, 0, 0] }),
      k.pos(cx - w / 2, cy - h),
      k.color(...col),
      k.z(z),
    ]);
    roundedHill(110, 192, 230, 26, PALETTE.farDivide, 3);
    roundedHill(340, 194, 270, 32, PALETTE.farDivide, 3);
    roundedHill(560, 192, 220, 24, PALETTE.farDivide, 3);
    roundedHill(210, 195, 250, 20, PALETTE.hillMid, 4);
    roundedHill(460, 195, 260, 22, PALETTE.hillMid, 4);

    // ── Meadow ground ──
    k.add([k.rect(W, H - 190), k.pos(0, 190), k.color(...PALETTE.grassMid), k.z(4)]);
    // Soft horizon seam
    k.add([k.rect(W, 6), k.pos(0, 188), k.color(...PALETTE.grassDeep), k.opacity(0.4), k.z(4)]);

    // Subtle meadow texture patches
    for (let i = 0; i < 10; i++) {
      const px = hillRng() * W;
      const py = 205 + hillRng() * 240;
      const pw = 45 + hillRng() * 70;
      const ph = 12 + hillRng() * 14;
      const pCol = hillRng() < 0.5 ? PALETTE.grassLight : PALETTE.grassDeep;
      k.add([
        ellipseRect(k, pw, ph),
        k.pos(px, py),
        k.color(...pCol),
        k.opacity(0.25),
        k.anchor("center"),
        k.z(5),
      ]);
    }

    // Midground prairie shrubs / cottonwoods
    const treeSeed = seedFrom(W, 195);
    const treeRng = seededRng(treeSeed);
    for (let i = 0; i < 9; i++) {
      const tx = 20 + i * 70 + (treeRng() - 0.5) * 25;
      const th = 24 + treeRng() * 18;
      const tw = 18 + treeRng() * 14;
      // Trunk
      k.add([
        k.rect(4, 14),
        k.pos(tx + tw / 2 - 2, 192),
        k.color(...PALETTE.wood),
        k.z(5),
      ]);
      // Canopy (shrub/tree)
      const foliageCol = i % 2 === 0 ? PALETTE.hillMid : PALETTE.coniferMid;
      k.add([
        ellipseRect(k, tw, th),
        k.pos(tx + tw / 2, 192 - th * 0.4),
        k.color(...foliageCol),
        k.outline(1.5, k.rgb(...PALETTE.outline)),
        k.anchor("center"),
        k.z(6),
      ]);
    }

    // Midground prairie rocks
    for (let i = 0; i < 5; i++) {
      const rx = 50 + i * 130 + (treeRng() - 0.5) * 40;
      const ry = 220 + treeRng() * 120;
      drawRock(k, rx, ry, 18 + treeRng() * 12, 10 + treeRng() * 6);
    }

    // Prairie grass tufts across the meadow
    for (let i = 0; i < 16; i++) {
      const gx = 30 + (treeRng() * (W - 60));
      const gy = 210 + treeRng() * 210;
      drawGrassTuft(k, gx, gy);
    }

    // ── Wildlife entities (2-4 grazing/roaming) ──
    // CRITICAL: DO NOT add k.area() to any animal entities (pinned by T-tap-hunting)
    const wildlife = [];
    const bison = drawBison(k, 150, 260, { scale: 0.85, animate: MOTION_OK, z: 15 });
    wildlife.push(bison);

    const deer = drawDeer(k, 385, 275, { scale: 0.95, buck: true, animate: MOTION_OK, z: 16 });
    wildlife.push(deer);

    const rabbit = drawRabbit(k, 500, 345, { scale: 1.1, animate: MOTION_OK, z: 20 });
    wildlife.push(rabbit);

    const deer2 = drawDeer(k, 275, 225, { scale: 0.6, buck: false, flipX: true, animate: MOTION_OK, z: 10 });
    wildlife.push(deer2);

    // ── Foreground framing tall grass blades ──
    const grassBlades = [];
    const bladeSeed = seedFrom(W, H);
    const bladeRng = seededRng(bladeSeed);

    // Left cluster framing
    for (let i = 0; i < 14; i++) {
      const gx = 8 + i * 9 + (bladeRng() - 0.5) * 6;
      const gh = 65 + bladeRng() * 65;
      const baseAng = -5 + i * 1.5 + (bladeRng() - 0.5) * 8;
      const col = i % 3 === 0 ? PALETTE.grassBorder : (i % 3 === 1 ? PALETTE.grassDeep : PALETTE.dryTip);
      const blade = k.add([
        k.rect(2.5, gh, { radius: 1 }),
        k.pos(gx, H),
        k.color(...col),
        k.anchor("bot"),
        k.rotate(baseAng),
        k.opacity(0.85),
        k.z(45),
      ]);
      grassBlades.push({ blade, baseAng, phase: bladeRng() * Math.PI * 2 });
    }

    // Right cluster framing
    for (let i = 0; i < 14; i++) {
      const gx = W - 130 + i * 9 + (bladeRng() - 0.5) * 6;
      const gh = 65 + bladeRng() * 65;
      const baseAng = -15 + i * 1.5 + (bladeRng() - 0.5) * 8;
      const col = i % 3 === 0 ? PALETTE.grassBorder : (i % 3 === 1 ? PALETTE.grassDeep : PALETTE.dryTip);
      const blade = k.add([
        k.rect(2.5, gh, { radius: 1 }),
        k.pos(gx, H),
        k.color(...col),
        k.anchor("bot"),
        k.rotate(baseAng),
        k.opacity(0.85),
        k.z(45),
      ]);
      grassBlades.push({ blade, baseAng, phase: bladeRng() * Math.PI * 2 });
    }

    // Center subtle stalks
    for (let i = 0; i < 8; i++) {
      const gx = 180 + i * 36 + (bladeRng() - 0.5) * 12;
      const gh = 25 + bladeRng() * 25;
      const baseAng = (bladeRng() - 0.5) * 16;
      const col = i % 2 === 0 ? PALETTE.grassDeep : PALETTE.dryTip;
      const blade = k.add([
        k.rect(2, gh, { radius: 1 }),
        k.pos(gx, H),
        k.color(...col),
        k.anchor("bot"),
        k.rotate(baseAng),
        k.opacity(0.7),
        k.z(45),
      ]);
      grassBlades.push({ blade, baseAng, phase: bladeRng() * Math.PI * 2 });
    }

    if (MOTION_OK) {
      k.onUpdate(() => {
        const t = k.time() * 2.2;
        for (const gb of grassBlades) {
          gb.blade.angle = gb.baseAng + Math.sin(t + gb.phase) * 2.5;
        }
      });
    }

    // ── Gun sight / crosshair reticle ──
    // Subtle sight that tracks mouse pointer on desktop or gently breathes at center
    const reticle = k.add([
      k.pos(W / 2, 260),
      k.z(48),
      k.opacity(0.7),
    ]);

    // Translucent sight lens
    reticle.add([
      k.circle(18),
      k.color(...PALETTE.canvasShadow),
      k.opacity(0.18),
      k.anchor("center"),
    ]);
    // Center bead dot
    reticle.add([
      k.circle(1.5),
      k.color(...PALETTE.outline),
      k.anchor("center"),
    ]);
    // 4 crosshair lines with center aperture gap
    reticle.add([
      k.rect(1.5, 9),
      k.pos(0, -15),
      k.color(...PALETTE.outline),
      k.anchor("center"),
    ]);
    reticle.add([
      k.rect(1.5, 9),
      k.pos(0, 15),
      k.color(...PALETTE.outline),
      k.anchor("center"),
    ]);
    reticle.add([
      k.rect(9, 1.5),
      k.pos(-15, 0),
      k.color(...PALETTE.outline),
      k.anchor("center"),
    ]);
    reticle.add([
      k.rect(9, 1.5),
      k.pos(15, 0),
      k.color(...PALETTE.outline),
      k.anchor("center"),
    ]);

    reticle.onUpdate(() => {
      if (isDesktopPointer()) {
        const mp = k.mousePos();
        if (mp && mp.x > 0 && mp.x < W && mp.y > 0 && mp.y < H) {
          const swayX = MOTION_OK ? Math.sin(k.time() * 2) * 2.5 : 0;
          const swayY = MOTION_OK ? Math.cos(k.time() * 2.4) * 2.5 : 0;
          reticle.pos.x += ((mp.x + swayX) - reticle.pos.x) * 0.2;
          reticle.pos.y += ((mp.y + swayY) - reticle.pos.y) * 0.2;
          return;
        }
      }
      // Touch screen or resting center-screen
      const restSwayX = MOTION_OK ? Math.sin(k.time() * 1.3) * 8 : 0;
      const restSwayY = MOTION_OK ? Math.cos(k.time() * 1.7) * 5 : 0;
      reticle.pos.x = W / 2 + restSwayX;
      reticle.pos.y = 260 + restSwayY;
    });

    // ── Title & HUD overlay ──
    k.add([
      k.text("HUNTING", { size: 32 }),
      k.pos(W / 2, 40),
      k.anchor("center"),
      k.color(...PALETTE.flowerGold),
      k.z(52),
    ]);

    // Ammo count
    const ammo = engine.supplies?.ammo || 0;
    const ammoText = k.add([
      k.text(`Ammunition: ${ammo} rounds`, { size: 16 }),
      k.pos(W / 2, 78),
      k.anchor("center"),
      k.color(...PALETTE.cloud),
      k.z(52),
    ]);

    // Results text (hidden initially)
    const resultsObj = k.add([
      k.text("", { size: 18, width: W - 80, align: "center" }),
      k.pos(W / 2, 260),
      k.anchor("center"),
      k.color(...PALETTE.flowerGold),
      k.z(52),
    ]);

    const instructObj = k.add([
      k.text("Choose how many rounds to spend:", { size: 14 }),
      k.pos(W / 2, 108),
      k.anchor("center"),
      k.color(...PALETTE.canvasMid),
      k.z(52),
    ]);

    // Buttons — parens not brackets: kaplay's styled-text parser treats
    // `[1]` as an unclosed style tag (`[name]...[/name]`) and throws.
    // Matches landmark.js.
    const options = [
      { label: "(1) Quick shot (5)", key: "1", ammo: 5 },
      { label: "(2) Careful shot (10)", key: "2", ammo: 10 },
      { label: "(3) Heavy volley (20)", key: "3", ammo: 20 },
      { label: "(0) Cancel", key: "0", ammo: 0 },
    ];

    const btnW = 134;
    const btnH = 34;
    const btnGap = 10;
    const totalW = options.length * btnW + (options.length - 1) * btnGap;
    const startX = (W - totalW) / 2;
    const btnY = 150;

    let hunting = false;
    let huntDone = false;
    const btnObjs = [];

    options.forEach((opt, i) => {
      const bx = startX + i * (btnW + btnGap);
      const disabled = opt.ammo > ammo && opt.ammo > 0;
      const btnColor = opt.ammo === 0 ? PALETTE.hpRed : disabled ? PALETTE.stone : PALETTE.hpGreen;

      // Shared by key + tap so hunting is reachable without a keyboard
      // (IMPROVEMENT_ROADMAP §1.1).
      const choose = () => {
        if (hunting || huntDone) return;

        if (opt.ammo === 0) {
          // Cancel
          engine.resumeAdvance();
          engine.transition("TRAVEL");
          return;
        }

        if (disabled) return;

        hunting = true;
        instructObj.text = "Hunting...";

        juice.minor({ intensity: 3 + k.rand(0, 1) });
        if (MOTION_OK) {
          spawnShotBurst(bx + btnW / 2, btnY);
          spawnShotBurst(reticle.pos.x, reticle.pos.y);
        }

        // Have wildlife scatter/flee upon gunshot
        for (const animal of wildlife) {
          if (animal.scatter) animal.scatter();
        }

        // Dim buttons during hunt submission
        for (const b of btnObjs) {
          b.bg.opacity = 0.3;
        }

        engine.submitHunt(opt.ammo);
      };

      const bg = k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(...btnColor),
        k.outline(1.5, k.rgb(...PALETTE.outline)),
        k.opacity(0.88),
        k.area(),
        k.z(52),
      ]);
      bg.onClick(choose);
      const txt = k.add([
        k.text(opt.label, { size: 12 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(...PALETTE.cloud),
        k.z(53),
      ]);
      btnObjs.push({ bg, txt });

      k.onKeyPress(opt.key, choose);
    });

    // Listen for hunt results
    const onResults = (results) => {
      hunting = false;
      huntDone = true;

      const foodGained = results?.food_gained || 0;
      const shotsUsed = results?.shots || 0;
      const narrative = results?.narrative || "";

      let resultText = narrative || `You used ${shotsUsed} rounds and got ${foodGained} lbs of food.`;
      resultsObj.text = resultText;
      instructObj.text = "Press ENTER, (C), or tap to continue";
      ammoText.text = `Ammunition: ${(engine.supplies?.ammo || 0)} rounds`;

      for (const b of btnObjs) {
        b.bg.opacity = 0;
        b.txt.opacity = 0;
      }
    };
    engine.on("huntResults", onResults);
    k.onSceneLeave(() => engine.off("huntResults", onResults));

    // Continue once a hunt resolved — key or tap (IMPROVEMENT_ROADMAP §1.1).
    const continueAfterHunt = () => {
      if (!huntDone) return;
      engine.resumeAdvance();
      engine.transition("TRAVEL");
    };
    k.onKeyPress("enter", continueAfterHunt);
    k.onKeyPress("c", continueAfterHunt);
    k.onKeyPress("space", continueAfterHunt);
    k.onClick(continueAfterHunt);

    // Error recovery
    const onError = ({ message }) => {
      hunting = false; // Re-enable options
      instructObj.text = message || 'Hunt failed. Try again.';
      for (const b of btnObjs) {
        b.bg.opacity = 0.88;
      }
    };
    engine.on('error', onError);
    k.onSceneLeave(() => engine.off('error', onError));
  });
}
