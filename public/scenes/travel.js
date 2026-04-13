export default function register(k, engine) {
  k.scene("travel", (data) => {
    let paused = false;
    const listeners = [];

    // Helper to track engine listeners for cleanup
    function engineOn(event, fn) {
      engine.on(event, fn);
      listeners.push({ event, fn });
    }

    k.onSceneLeave(() => {
      for (const { event, fn } of listeners) {
        engine.off(event, fn);
      }
    });

    // ── Parallax layers ──

    // Sky
    k.add([
      k.rect(640, 200),
      k.pos(0, 0),
      k.color(100, 150, 220),
    ]);

    // Clouds
    const clouds = [];
    for (let i = 0; i < 5; i++) {
      const cx = Math.random() * 800;
      const cy = 30 + Math.random() * 80;
      const cw = 40 + Math.random() * 60;
      const cloud = k.add([
        k.rect(cw, 15),
        k.pos(cx, cy),
        k.color(230, 230, 240),
        k.opacity(0.7),
      ]);
      clouds.push(cloud);
    }

    // Far terrain (hills)
    const farHills = [];
    for (let x = -80; x < 800; x += 70) {
      const h = 25 + Math.sin(x * 0.025) * 15;
      const hill = k.add([
        k.rect(72, h),
        k.pos(x, 200 - h),
        k.color(60, 100, 50),
      ]);
      farHills.push(hill);
    }

    // Near terrain
    const nearHills = [];
    for (let x = -60; x < 760; x += 50) {
      const h = 18 + Math.sin(x * 0.04 + 2) * 10;
      const hill = k.add([
        k.rect(52, h),
        k.pos(x, 230 - h),
        k.color(75, 120, 55),
      ]);
      nearHills.push(hill);
    }

    // Ground
    k.add([
      k.rect(640, 260),
      k.pos(0, 230),
      k.color(85, 135, 60),
    ]);

    // Trail (dirt road)
    k.add([
      k.rect(640, 20),
      k.pos(0, 340),
      k.color(140, 100, 55),
    ]);
    k.add([
      k.rect(640, 4),
      k.pos(0, 348),
      k.color(120, 80, 45),
    ]);

    // ── Wagon (fixed position) ──
    // Body
    k.add([
      k.rect(60, 25),
      k.pos(200, 320),
      k.color(110, 70, 35),
    ]);
    // Cover
    k.add([
      k.rect(50, 18),
      k.pos(205, 304),
      k.color(220, 210, 190),
    ]);
    // Cover supports
    k.add([
      k.rect(3, 20),
      k.pos(203, 302),
      k.color(110, 70, 35),
    ]);
    k.add([
      k.rect(3, 20),
      k.pos(255, 302),
      k.color(110, 70, 35),
    ]);

    // Wheels (rotating)
    const wheel1 = k.add([
      k.circle(9),
      k.pos(215, 347),
      k.color(80, 50, 25),
      k.anchor("center"),
    ]);
    const wheel2 = k.add([
      k.circle(9),
      k.pos(248, 347),
      k.color(80, 50, 25),
      k.anchor("center"),
    ]);
    // Wheel hubs
    k.add([
      k.circle(3),
      k.pos(215, 347),
      k.color(60, 35, 15),
      k.anchor("center"),
    ]);
    k.add([
      k.circle(3),
      k.pos(248, 347),
      k.color(60, 35, 15),
      k.anchor("center"),
    ]);

    // ── HUD ──
    const gs = engine.gameState;
    const pos = engine.position;
    const sup = engine.supplies;

    const dateText = k.add([
      k.text(engine.formatDate(engine.currentDate), { size: 14 }),
      k.pos(10, 10),
      k.color(255, 255, 255),
      k.z(50),
    ]);

    const milesText = k.add([
      k.text(`Miles: ${engine.milesTraveled} / 1764`, { size: 14 }),
      k.pos(10, 30),
      k.color(255, 255, 255),
      k.z(50),
    ]);

    const foodText = k.add([
      k.text(`Food: ${sup?.food || 0} lbs`, { size: 14 }),
      k.pos(10, 50),
      k.color(255, 255, 255),
      k.z(50),
    ]);

    const oxenText = k.add([
      k.text(`Oxen: ${sup?.oxen || 0}`, { size: 14 }),
      k.pos(10, 70),
      k.color(255, 255, 255),
      k.z(50),
    ]);

    // Trail progress bar
    const barX = 420;
    const barY = 12;
    const barWidth = 200;
    const progressPct = Math.min(1, (engine.milesTraveled || 0) / 1764);
    k.add([
      k.rect(barWidth, 8),
      k.pos(barX, barY),
      k.color(40, 40, 40),
      k.z(50),
    ]);
    let progressFill = k.add([
      k.rect(Math.max(2, barWidth * progressPct), 8),
      k.pos(barX, barY),
      k.color(80, 200, 80),
      k.z(50),
    ]);

    // Party health dots
    const healthDots = [];
    const members = engine.party?.members || [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const dotColor = !m.alive ? [100, 100, 100] :
        m.health > 70 ? [80, 200, 80] :
        m.health > 40 ? [200, 200, 80] :
        m.health > 20 ? [200, 120, 50] : [200, 50, 50];
      healthDots.push(k.add([
        k.circle(5),
        k.pos(430 + i * 18, 35),
        k.color(...dotColor),
        k.anchor("center"),
        k.z(50),
      ]));
    }

    // ── Scrolling animation ──
    let scrollOffset = 0;

    k.onUpdate(() => {
      if (paused) return;
      scrollOffset += 0.5;

      // Scroll clouds slowly
      for (const c of clouds) {
        c.pos.x -= 0.15;
        if (c.pos.x < -100) c.pos.x = 700;
      }
      // Scroll far hills
      for (const h of farHills) {
        h.pos.x -= 0.2;
        if (h.pos.x < -80) h.pos.x = 720;
      }
      // Scroll near hills
      for (const h of nearHills) {
        h.pos.x -= 0.4;
        if (h.pos.x < -60) h.pos.x = 700;
      }
    });

    // ── Weather FX ──
    const miles = engine.milesTraveled || 0;
    let weatherType = "clear";
    if (miles > 1200) {
      weatherType = Math.random() > 0.5 ? "snow" : "clear";
    } else if (miles > 600) {
      weatherType = Math.random() > 0.5 ? "dust" : "clear";
    } else {
      weatherType = Math.random() > 0.7 ? "rain" : "clear";
    }

    if (weatherType === "rain") {
      k.loop(0.05, () => {
        if (paused) return;
        const drop = k.add([
          k.rect(1, 8),
          k.pos(Math.random() * 640, -10),
          k.color(100, 140, 220),
          k.opacity(0.6),
          k.z(40),
        ]);
        drop.onUpdate(() => {
          drop.pos.y += 6;
          drop.pos.x -= 0.5;
          if (drop.pos.y > 480) drop.destroy();
        });
      });
    } else if (weatherType === "snow") {
      k.loop(0.1, () => {
        if (paused) return;
        const flake = k.add([
          k.circle(2),
          k.pos(Math.random() * 640, -10),
          k.color(240, 240, 255),
          k.opacity(0.7),
          k.z(40),
        ]);
        flake.onUpdate(() => {
          flake.pos.y += 1.5;
          flake.pos.x += Math.sin(k.time() * 3 + flake.pos.y * 0.1) * 0.5;
          if (flake.pos.y > 480) flake.destroy();
        });
      });
    } else if (weatherType === "dust") {
      k.loop(0.08, () => {
        if (paused) return;
        const particle = k.add([
          k.circle(2),
          k.pos(660, 250 + Math.random() * 200),
          k.color(180, 150, 100),
          k.opacity(0.4),
          k.z(40),
        ]);
        particle.onUpdate(() => {
          particle.pos.x -= 3;
          particle.pos.y += Math.sin(k.time() * 2) * 0.3;
          particle.opacity -= 0.003;
          if (particle.pos.x < -20 || particle.opacity <= 0) particle.destroy();
        });
      });
    }

    // ── Floating day summaries ──
    function showFloatingText(msg) {
      const ft = k.add([
        k.text(msg, { size: 12, width: 400 }),
        k.pos(320, 440),
        k.anchor("center"),
        k.color(245, 230, 200),
        k.opacity(1),
        k.z(60),
      ]);
      ft.onUpdate(() => {
        ft.pos.y -= 0.3;
        ft.opacity -= 0.008;
        if (ft.opacity <= 0) ft.destroy();
      });
    }

    // ── Engine event handlers ──
    engineOn("daysAdvanced", ({ summaries, days }) => {
      // Update HUD text
      dateText.text = engine.formatDate(engine.currentDate);
      milesText.text = `Miles: ${engine.milesTraveled} / 1764`;
      const s = engine.supplies;
      if (s) {
        foodText.text = `Food: ${s.food || 0} lbs`;
        oxenText.text = `Oxen: ${s.oxen || 0}`;
      }

      // Update progress bar
      if (progressFill) {
        const newWidth = Math.max(1, Math.round((engine.milesTraveled || 0) / 1764 * barWidth));
        progressFill.destroy();
        progressFill = k.add([
          k.rect(newWidth, 8),
          k.pos(barX, barY),
          k.color(80, 200, 80),
          k.z(50),
        ]);
      }

      // Update health dots
      const currentMembers = engine.party?.members || [];
      currentMembers.forEach((m, i) => {
        if (healthDots[i]) {
          const dotPos = { x: healthDots[i].pos.x, y: healthDots[i].pos.y };
          healthDots[i].destroy();
          const dotColor = !m.alive ? [100, 100, 100] :
            m.health === "good" ? [80, 200, 80] :
            m.health === "fair" ? [200, 200, 80] :
            m.health === "poor" ? [200, 120, 50] : [200, 50, 50];
          healthDots[i] = k.add([
            k.circle(5),
            k.pos(dotPos.x, dotPos.y),
            k.color(...dotColor),
            k.anchor("center"),
            k.z(50),
          ]);
        }
      });

      // Show event summaries as floating text
      for (const summary of summaries) {
        for (const evt of (summary.events || [])) {
          if (evt.text || evt.description) {
            showFloatingText(evt.text || evt.description);
          }
        }
      }
    });

    engineOn("loading", (isLoading) => {
      // Could show a loading indicator; for POC just log
    });

    engineOn("error", ({ message }) => {
      showFloatingText("Error: " + message);
    });

    // ── Kick off travel loop ──
    engine.resumeAdvance();
    engine.advance();

    // ── Pause overlay ──
    let pauseOverlay = null;

    function togglePause() {
      paused = !paused;
      if (paused) {
        engine.pauseAdvance();
        pauseOverlay = k.add([
          k.rect(640, 480),
          k.pos(0, 0),
          k.color(0, 0, 0),
          k.opacity(0.7),
          k.z(100),
        ]);
        k.add([
          k.text("PAUSED", { size: 36 }),
          k.pos(320, 180),
          k.anchor("center"),
          k.color(212, 160, 23),
          k.z(101),
          { pauseTag: true },
        ]);
        // Show stats
        const party = engine.party;
        const sup2 = engine.supplies;
        const statsLines = [
          `Date: ${engine.formatDate(engine.currentDate)}`,
          `Miles: ${engine.milesTraveled} / 1764`,
          `Food: ${sup2?.food || 0} lbs`,
          `Oxen: ${sup2?.oxen || 0}`,
          `Money: ${engine.formatMoney(sup2?.money || 0)}`,
          "",
          "Party:",
          ...(party?.members || []).map(m =>
            `  ${m.name}: ${m.alive ? m.health + '/100' : "DEAD"}`
          ),
          "",
          "Press P to resume",
        ];
        k.add([
          k.text(statsLines.join("\n"), { size: 13, width: 400 }),
          k.pos(320, 240),
          k.anchor("center"),
          k.color(200, 190, 170),
          k.z(101),
          { pauseTag: true },
        ]);
      } else {
        engine.resumeAdvance();
        // Remove pause UI elements
        k.get("*").forEach(obj => {
          if (obj.pauseTag) obj.destroy();
        });
        if (pauseOverlay) {
          pauseOverlay.destroy();
          pauseOverlay = null;
        }
        // Resume advancing
        engine.advance();
      }
    }

    k.onKeyPress("p", togglePause);
  });
}
