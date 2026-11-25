import { drawSky, drawMountains, drawHills, drawGround, PALETTE, segmentColor, drawGlow, getDayPhase } from "../lib/draw.mjs";
import { segmentForMiles } from "../lib/segments.mjs";
import { isAssetReady } from "../lib/assets.mjs";
import { createJuice } from "../lib/juice.mjs";

export default function register(k, engine) {
  k.scene("arrival", (data) => {
    window.audio?.sting("arrival");
    createJuice(k).zoomPunch();
    const W = 640;
    const H = 480;

    // Environment & lush arrival segment (Willamette Valley)
    const miles = engine.milesTraveled || 1764;
    const segment = segmentForMiles(miles);
    const tone = engine.tone ?? "medium";
    const dayPhase = engine.dayPhase || getDayPhase(engine.currentDate);

    // 1. Lush sky and continuous horizon band (prevents 80px horizon tear between sky y=180 and ground y=260)
    drawSky(k, tone, dayPhase, { segment });
    const horizonCol = segmentColor(segment, "horizon", PALETTE.hazeWillamette) || PALETTE.hazeWillamette;
    k.add([k.rect(W, 85), k.pos(0, 180), k.color(...horizonCol)]);

    // 2. Layered distant mountains & rolling green foothills
    drawMountains(k, { segment });
    drawHills(k, { segment });
    drawGround(k, { tone, segment });

    // 3. Drifting valley mist bands (mirrors travel.js lines 85–97)
    const mist = segmentColor(segment, "horizon", PALETTE.hazeWillamette);
    const mistBands = [[222, 10, 0.3], [245, 8, 0.22], [275, 7, 0.15]];
    for (const [by, bh, bop] of mistBands) {
      k.add([k.rect(W, bh), k.pos(0, by), k.color(...mist), k.opacity(bop)]);
    }

    // 4. Willamette orchard rows on right side (x = 310..630)
    for (let ox = 320; ox <= 600; ox += 40) {
      if (ox >= 420 && ox <= 470) continue; // homestead clearing
      // Orchard tree trunk
      k.add([k.rect(4, 14), k.pos(ox - 2, 238), k.color(...PALETTE.woodDark)]);
      // Orchard foliage canopy (lush apple greens)
      k.add([k.circle(11), k.pos(ox, 232), k.color(...PALETTE.orchardGreen), k.anchor("center")]);
      k.add([k.circle(8), k.pos(ox - 1, 230), k.color(...PALETTE.grassLight), k.opacity(0.5), k.anchor("center")]);
    }

    // 5. Homestead cabin silhouettes with rising chimney smoke (x = 300..640)
    if (isAssetReady("landmark_willamette")) {
      k.add([
        k.sprite("landmark_willamette"),
        k.pos(470, 180),
        k.scale(0.85),
        k.anchor("center"),
      ]);
    } else {
    const cabins = [
      { x: 330, w: 60, h: 46, roofH: 15, chimOnLeft: false },
      { x: 425, w: 80, h: 58, roofH: 18, chimOnLeft: true },
      { x: 535, w: 65, h: 48, roofH: 16, chimOnLeft: false },
    ];

    const cabinBaseY = 250;
    for (const b of cabins) {
      const by = cabinBaseY - b.h;
      // Hewn log cabin silhouette
      k.add([k.rect(b.w, b.h), k.pos(b.x, by), k.color(...PALETTE.woodDark)]);
      for (let y = by; y < cabinBaseY; y += 6) {
        k.add([k.rect(b.w - 2, 5), k.pos(b.x + 1, y), k.color(...PALETTE.wood)]);
        k.add([k.rect(3, 5), k.pos(b.x - 2, y), k.color(...PALETTE.woodDark)]);
        k.add([k.rect(3, 5), k.pos(b.x + b.w - 1, y), k.color(...PALETTE.woodDark)]);
      }

      // Pitched roof
      k.add([
        k.polygon([k.vec2(-b.w / 2 - 6, 0), k.vec2(0, -b.roofH), k.vec2(b.w / 2 + 6, 0)]),
        k.pos(b.x + b.w / 2, by),
        k.color(...PALETTE.woodDark),
        k.outline(1.5, k.rgb(...PALETTE.outline)),
      ]);

      // Stone chimney
      const chimW = 10;
      const chimH = b.roofH + 12;
      const chimX = b.chimOnLeft ? b.x + 6 : b.x + b.w - 6 - chimW;
      const chimY = by - chimH + 4;
      k.add([k.rect(chimW, chimH), k.pos(chimX, chimY), k.color(...PALETTE.stone), k.outline(1, k.rgb(...PALETTE.outline))]);

      // Rising woodsmoke plume curling into the sky
      const puffs = [
        { dx: 0, dy: -5, r: 4, op: 0.45 },
        { dx: 3, dy: -15, r: 6, op: 0.38 },
        { dx: 7, dy: -28, r: 9, op: 0.28 },
        { dx: 14, dy: -42, r: 13, op: 0.20 },
        { dx: 22, dy: -58, r: 17, op: 0.12 },
      ];
      const smkX = chimX + chimW / 2;
      for (const p of puffs) {
        k.add([
          k.circle(p.r),
          k.pos(smkX + p.dx, chimY + p.dy),
          k.color(...PALETTE.cloudShadow),
          k.opacity(p.op),
          k.anchor("center"),
        ]);
        k.add([
          k.circle(p.r * 0.85),
          k.pos(smkX + p.dx - 1, chimY + p.dy - 1),
          k.color(...PALETTE.cloud),
          k.opacity(p.op * 0.9),
          k.anchor("center"),
        ]);
      }

      // Warm glowing windows
      const winX = b.x + 10;
      const winY = by + 12;
      drawGlow(k, k, winX + 6, winY + 6, 16, PALETTE.gold, { rings: 4, opacity: 0.35 });
      k.add([k.rect(12, 12), k.pos(winX, winY), k.color(...PALETTE.goldBright)]);
      k.add([k.rect(12, 1), k.pos(winX, winY + 5.5), k.color(...PALETTE.outline)]);
      k.add([k.rect(1, 12), k.pos(winX + 5.5, winY), k.color(...PALETTE.outline)]);

      // Door
      const doorW = 14;
      const doorH = 24;
      const doorX = b.x + b.w - doorW - 10;
      k.add([k.rect(doorW, doorH), k.pos(doorX, cabinBaseY - doorH), k.color(...PALETTE.woodDark), k.outline(1, k.rgb(...PALETTE.outline))]);
    }

    // Split-rail fence along homesteads
    for (let fx = 310; fx < 600; fx += 18) {
      if (fx > 390 && fx < 420) continue; // path gap
      k.add([k.rect(2, 12), k.pos(fx, cabinBaseY - 12), k.color(...PALETTE.woodDark)]);
      k.add([k.rect(20, 2), k.pos(fx, cabinBaseY - 10), k.color(...PALETTE.wood)]);
      k.add([k.rect(20, 2), k.pos(fx, cabinBaseY - 4), k.color(...PALETTE.wood)]);
    }
    }

    // 6. Title Header
    k.add([
      k.rect(W, 50, { radius: 0 }),
      k.pos(0, 0),
      k.color(...PALETTE.silhouetteNear),
      k.opacity(0.85),
    ]);
    k.add([
      k.text("OREGON CITY", { size: 34 }),
      k.pos(W / 2, 25),
      k.anchor("center"),
      k.color(...PALETTE.goldBright),
    ]);

    k.add([
      k.text("You have reached the end of the trail!", { size: 16 }),
      k.pos(W / 2, 60),
      k.anchor("center"),
      k.color(...PALETTE.cloud),
    ]);

    // 7. Survivor list with health bars (x = 20..300, y = 86..300)
    const survivors = engine.aliveMembers || [];
    const dead = engine.deadMembers || [];
    const totalMembers = (engine.party?.members || []).length;

    const listStartY = 90;
    k.add([
      k.rect(280, 24 + survivors.length * 26 + 8, { radius: 4 }),
      k.pos(20, listStartY - 4),
      k.color(...PALETTE.silhouetteNear),
      k.opacity(0.8),
    ]);
    k.add([
      k.text("Survivors:", { size: 14 }),
      k.pos(30, listStartY),
      k.color(...PALETTE.goldBright),
    ]);

    survivors.forEach((member, i) => {
      const my = listStartY + 24 + i * 26;
      const health = member.health || 100;
      const hpColor = health > 60 ? PALETTE.hpGreen : health > 30 ? PALETTE.hpYellow : PALETTE.hpRed;

      k.add([
        k.text(member.name, { size: 13 }),
        k.pos(35, my),
        k.color(...PALETTE.cloud),
      ]);

      // Health bar bg
      k.add([
        k.rect(100, 10, { radius: 2 }),
        k.pos(170, my + 3),
        k.color(...PALETTE.black),
      ]);
      // Health bar fill
      k.add([
        k.rect(Math.max(2, health), 10, { radius: 2 }),
        k.pos(170, my + 3),
        k.color(...hpColor),
      ]);
    });

    // 8. Score calculation box
    const gs = engine.gameState;
    const milesTraveled = engine.milesTraveled || 0;
    const profBonus = { farmer: 3, carpenter: 2, banker: 1 };
    const prof = engine.profession || "banker";
    const multiplier = profBonus[prof] || 1;
    const survivorScore = survivors.length * 200;
    const mileScore = Math.floor(milesTraveled / 10);
    const totalScore = (survivorScore + mileScore) * multiplier;

    const scoreY = listStartY + 24 + survivors.length * 26 + 20;
    k.add([
      k.rect(280, 80, { radius: 4 }),
      k.pos(20, scoreY),
      k.color(...PALETTE.silhouetteNear),
      k.opacity(0.8),
    ]);
    k.add([
      k.text(`Survivors: ${survivors.length}/${totalMembers}`, { size: 13 }),
      k.pos(30, scoreY + 8),
      k.color(...PALETTE.parchment),
    ]);
    k.add([
      k.text(`Miles: ${milesTraveled}  |  Profession: ${prof} (x${multiplier})`, { size: 12 }),
      k.pos(30, scoreY + 28),
      k.color(...PALETTE.stoneLight),
    ]);
    k.add([
      k.text(`SCORE: ${totalScore}`, { size: 20 }),
      k.pos(30, scoreY + 52),
      k.color(...PALETTE.goldBright),
    ]);

    // 9. Action buttons
    const btnY = H - 50;
    // Read Newspaper — key + tap (IMPROVEMENT_ROADMAP §1.1).
    const readNewspaper = () => engine.generateNewspaper();
    const npBtn = k.add([
      k.rect(180, 32, { radius: 4 }),
      k.pos(W / 2 - 200, btnY),
      k.color(...PALETTE.hpGreen),
      k.opacity(0.85),
      k.area(),
    ]);
    npBtn.onClick(readNewspaper);
    k.add([
      k.text("(N) Read Newspaper", { size: 14 }),
      k.pos(W / 2 - 110, btnY + 16),
      k.anchor("center"),
      k.color(...PALETTE.cloud),
    ]);

    k.onKeyPress("n", readNewspaper);

    // Share (Daily Trail)
    if (engine.dailyMode) {
      const shareDaily = () => {
        const text = engine.getDailyShareText();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
        }
        engine.emit("shareDaily", { text });
      };
      const shareBtn = k.add([
        k.rect(160, 32, { radius: 4 }),
        k.pos(W / 2 + 20, btnY),
        k.color(...PALETTE.hillMid),
        k.opacity(0.85),
        k.area(),
      ]);
      shareBtn.onClick(shareDaily);
      k.add([
        k.text("(S) Share Result", { size: 14 }),
        k.pos(W / 2 + 100, btnY + 16),
        k.anchor("center"),
        k.color(...PALETTE.cloud),
      ]);

      k.onKeyPress("s", shareDaily);
    }

    // Tip jar text
    k.add([
      k.text("Enjoyed the journey? trail.osi-cyber.com", { size: 11 }),
      k.pos(W / 2, H - 10),
      k.anchor("center"),
      k.color(...PALETTE.stoneLight),
    ]);
  });
}
