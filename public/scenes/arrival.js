export default function register(k, engine) {
  k.scene("arrival", (data) => {
    const W = 640;
    const H = 480;

    // Sky gradient (dark to lighter blue)
    k.add([k.rect(W, 120), k.pos(0, 0), k.color(22, 33, 62)]);
    k.add([k.rect(W, 80), k.pos(0, 120), k.color(40, 60, 120)]);

    // Mountains (blue triangles as layered rects)
    const peaks = [
      { cx: 80, h: 120, w: 140 },
      { cx: 220, h: 160, w: 180 },
      { cx: 400, h: 140, w: 160 },
      { cx: 560, h: 130, w: 150 },
    ];

    for (const p of peaks) {
      const baseY = 200;
      const layers = 8;
      for (let i = 0; i < layers; i++) {
        const frac = i / layers;
        const lw = p.w * (1 - frac * 0.75);
        const ly = baseY - p.h * (1 - frac);
        const lh = p.h / layers + 2;
        const blue = 110 + Math.floor(frac * 50);
        k.add([
          k.rect(lw, lh),
          k.pos(p.cx - lw / 2, ly),
          k.color(50, 70, blue),
        ]);
      }
      // Snow cap
      const capW = p.w * 0.12;
      k.add([
        k.rect(capW, 6),
        k.pos(p.cx - capW / 2, baseY - p.h),
        k.color(255, 255, 255),
      ]);
    }

    // Green valley
    k.add([k.rect(W, 180), k.pos(0, 200), k.color(46, 139, 87)]);

    // Ground
    k.add([k.rect(W, 100), k.pos(0, 380), k.color(85, 107, 47)]);

    // Buildings (Oregon City)
    const buildings = [
      { x: 80, w: 60, h: 50 },
      { x: 170, w: 80, h: 65 },
      { x: 280, w: 70, h: 55 },
      { x: 380, w: 90, h: 70 },
      { x: 500, w: 60, h: 45 },
    ];

    for (const b of buildings) {
      const by = 340 - b.h;
      k.add([k.rect(b.w, b.h), k.pos(b.x, by), k.color(160, 82, 45)]);
      k.add([k.rect(b.w + 8, 10), k.pos(b.x - 4, by - 10), k.color(120, 55, 10)]);
      // Windows
      k.add([k.rect(8, 8), k.pos(b.x + 8, by + 12), k.color(252, 227, 138), k.opacity(0.7)]);
      k.add([k.rect(8, 8), k.pos(b.x + b.w - 16, by + 12), k.color(252, 227, 138), k.opacity(0.7)]);
      // Door
      k.add([k.rect(12, 20), k.pos(b.x + b.w / 2 - 6, by + b.h - 20), k.color(80, 30, 8)]);
    }

    // Title
    k.add([
      k.rect(W, 50, { radius: 0 }),
      k.pos(0, 0),
      k.color(26, 26, 46),
      k.opacity(0.8),
    ]);
    k.add([
      k.text("OREGON CITY", { size: 34 }),
      k.pos(W / 2, 25),
      k.anchor("center"),
      k.color(252, 227, 138),
    ]);

    k.add([
      k.text("You have reached the end of the trail!", { size: 16 }),
      k.pos(W / 2, 60),
      k.anchor("center"),
      k.color(255, 255, 255),
    ]);

    // Survivor list with health bars
    const survivors = engine.aliveMembers || [];
    const dead = engine.deadMembers || [];
    const totalMembers = (engine.party?.members || []).length;

    const listStartY = 90;
    k.add([
      k.rect(280, 24 + survivors.length * 26 + 8, { radius: 4 }),
      k.pos(20, listStartY - 4),
      k.color(26, 26, 46),
      k.opacity(0.7),
    ]);
    k.add([
      k.text("Survivors:", { size: 14 }),
      k.pos(30, listStartY),
      k.color(252, 227, 138),
    ]);

    survivors.forEach((member, i) => {
      const my = listStartY + 24 + i * 26;
      const health = member.health || 100;
      const hpColor = health > 60 ? [46, 139, 87] : health > 30 ? [222, 184, 135] : [178, 34, 34];

      k.add([
        k.text(member.name, { size: 13 }),
        k.pos(35, my),
        k.color(255, 255, 255),
      ]);

      // Health bar bg
      k.add([
        k.rect(100, 10, { radius: 2 }),
        k.pos(170, my + 3),
        k.color(40, 40, 40),
      ]);
      // Health bar fill
      k.add([
        k.rect(Math.max(2, health), 10, { radius: 2 }),
        k.pos(170, my + 3),
        k.color(hpColor[0], hpColor[1], hpColor[2]),
      ]);
    });

    // Score calculation
    const gs = engine.gameState;
    const miles = engine.milesTraveled || 0;
    const profBonus = { farmer: 3, carpenter: 2, banker: 1 };
    const prof = engine.profession || "banker";
    const multiplier = profBonus[prof] || 1;
    const survivorScore = survivors.length * 200;
    const mileScore = Math.floor(miles / 10);
    const totalScore = (survivorScore + mileScore) * multiplier;

    const scoreY = listStartY + 24 + survivors.length * 26 + 20;
    k.add([
      k.rect(280, 80, { radius: 4 }),
      k.pos(20, scoreY),
      k.color(26, 26, 46),
      k.opacity(0.7),
    ]);
    k.add([
      k.text(`Survivors: ${survivors.length}/${totalMembers}`, { size: 13 }),
      k.pos(30, scoreY + 8),
      k.color(222, 184, 135),
    ]);
    k.add([
      k.text(`Miles: ${miles}  |  Profession: ${prof} (x${multiplier})`, { size: 12 }),
      k.pos(30, scoreY + 28),
      k.color(200, 200, 200),
    ]);
    k.add([
      k.text(`SCORE: ${totalScore}`, { size: 20 }),
      k.pos(30, scoreY + 52),
      k.color(252, 227, 138),
    ]);

    // Action buttons
    const btnY = H - 50;
    // Read Newspaper
    k.add([
      k.rect(180, 32, { radius: 4 }),
      k.pos(W / 2 - 200, btnY),
      k.color(46, 139, 87),
      k.opacity(0.85),
    ]);
    k.add([
      k.text("[N] Read Newspaper", { size: 14 }),
      k.pos(W / 2 - 110, btnY + 16),
      k.anchor("center"),
      k.color(255, 255, 255),
    ]);

    k.onKeyPress("n", () => {
      engine.generateNewspaper();
    });

    // Share (Daily Trail)
    if (engine.dailyMode) {
      k.add([
        k.rect(160, 32, { radius: 4 }),
        k.pos(W / 2 + 20, btnY),
        k.color(85, 107, 47),
        k.opacity(0.85),
      ]);
      k.add([
        k.text("[S] Share Result", { size: 14 }),
        k.pos(W / 2 + 100, btnY + 16),
        k.anchor("center"),
        k.color(255, 255, 255),
      ]);

      k.onKeyPress("s", () => {
        const text = engine.getDailyShareText();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
        }
        engine.emit("shareDaily", { text });
      });
    }

    // Tip jar text
    k.add([
      k.text("Enjoyed the journey? trail.osi-cyber.com", { size: 11 }),
      k.pos(W / 2, H - 10),
      k.anchor("center"),
      k.color(100, 100, 100),
    ]);
  });
}
