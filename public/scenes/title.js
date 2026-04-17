export default function register(k, engine) {
  k.scene("title", (data) => {
    // ── Dark blue sky background ──
    k.add([
      k.rect(640, 480),
      k.pos(0, 0),
      k.color(15, 15, 40),
    ]);

    // ── Stars ──
    const stars = [];
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * 640;
      const sy = Math.random() * 200;
      const baseOpacity = 0.3 + Math.random() * 0.7;
      const speed = 0.5 + Math.random() * 2;
      const star = k.add([
        k.circle(1 + Math.random() * 1.5),
        k.pos(sx, sy),
        k.color(255, 255, 255),
        k.opacity(baseOpacity),
        k.anchor("center"),
      ]);
      stars.push({ obj: star, baseOpacity, speed, phase: Math.random() * Math.PI * 2 });
    }

    // Twinkle animation
    k.onUpdate(() => {
      const t = k.time();
      for (const s of stars) {
        s.obj.opacity = s.baseOpacity * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      }
    });

    // ── Prairie hills (layered) ──
    // Far hills
    for (let x = 0; x < 640; x += 80) {
      const h = 30 + Math.sin(x * 0.02) * 15;
      k.add([
        k.rect(82, h),
        k.pos(x, 280 - h),
        k.color(30, 60, 25),
      ]);
    }
    // Near hills
    for (let x = 0; x < 640; x += 60) {
      const h = 20 + Math.sin(x * 0.03 + 1) * 12;
      k.add([
        k.rect(62, h),
        k.pos(x, 300 - h),
        k.color(45, 80, 35),
      ]);
    }

    // ── Ground ──
    k.add([
      k.rect(640, 200),
      k.pos(0, 300),
      k.color(55, 95, 40),
    ]);

    // ── Dirt trail ──
    k.add([
      k.rect(640, 12),
      k.pos(0, 350),
      k.color(120, 85, 50),
    ]);

    // ── Wagon silhouette ──
    // Wagon body
    k.add([
      k.rect(70, 30),
      k.pos(280, 320),
      k.color(90, 60, 30),
    ]);
    // Wagon top (canvas cover)
    k.add([
      k.rect(60, 20),
      k.pos(285, 302),
      k.color(200, 190, 170),
    ]);
    // Wagon top arch sides
    k.add([
      k.rect(4, 22),
      k.pos(283, 300),
      k.color(90, 60, 30),
    ]);
    k.add([
      k.rect(4, 22),
      k.pos(345, 300),
      k.color(90, 60, 30),
    ]);
    // Wheels
    k.add([
      k.circle(10),
      k.pos(295, 352),
      k.color(70, 45, 20),
      k.anchor("center"),
    ]);
    k.add([
      k.circle(10),
      k.pos(335, 352),
      k.color(70, 45, 20),
      k.anchor("center"),
    ]);

    // ── Title text ──
    k.add([
      k.text("THE OREGON TRAIL", { size: 42 }),
      k.pos(320, 120),
      k.anchor("center"),
      k.color(212, 160, 23),
    ]);

    k.add([
      k.text("- AI Edition -", { size: 20 }),
      k.pos(320, 160),
      k.anchor("center"),
      k.color(180, 140, 60),
    ]);

    // ── Challenge of the week ──
    // Use CHALLENGE_INFO from engine.js (single source of truth)
    const challengeId = GameEngine.getCurrentChallengeId();
    const challenge = window.CHALLENGE_INFO?.[challengeId];
    if (challenge) {
      // Challenge box
      k.add([
        k.rect(280, 50),
        k.pos(320, 400),
        k.anchor("center"),
        k.color(40, 30, 15),
        k.outline(1, k.Color.fromHex("#8b6914")),
      ]);
      k.add([
        k.text("Weekly Challenge: " + challenge.name, { size: 12 }),
        k.pos(320, 390),
        k.anchor("center"),
        k.color(212, 160, 23),
      ]);
      k.add([
        k.text(challenge.desc, { size: 10 }),
        k.pos(320, 408),
        k.anchor("center"),
        k.color(180, 160, 120),
      ]);
    }

    // ── Daily Trail ──
    const dailyNum = GameEngine.getDailyTrailNumber();
    const dailyDone = GameEngine.getDailyCompletion();
    if (dailyDone) {
      k.add([
        k.text(`Daily Trail #${dailyNum} — ${dailyDone.survived ? 'Completed!' : 'Failed'}`, { size: 11 }),
        k.pos(320, 200),
        k.anchor("center"),
        k.color(120, 160, 120),
      ]);
    } else {
      k.add([
        k.rect(220, 36),
        k.pos(320, 200),
        k.anchor("center"),
        k.color(25, 50, 25),
        k.outline(1, k.Color.fromHex("#4a8a4a")),
      ]);
      k.add([
        k.text(`[ D ] Daily Trail #${dailyNum}`, { size: 13 }),
        k.pos(320, 200),
        k.anchor("center"),
        k.color(100, 220, 100),
      ]);
    }

    // ── Resume option ──
    const savedRun = engine._savedRunData;
    if (savedRun) {
      k.add([
        k.text("[ R ] Resume saved journey", { size: 14 }),
        k.pos(320, 240),
        k.anchor("center"),
        k.color(150, 200, 150),
      ]);
    }

    // ── Press ENTER prompt (blinking) ──
    const prompt = k.add([
      k.text("Press ENTER to begin", { size: 16 }),
      k.pos(320, 440),
      k.anchor("center"),
      k.color(200, 190, 170),
    ]);

    k.onUpdate(() => {
      prompt.opacity = 0.4 + 0.6 * Math.abs(Math.sin(k.time() * 2));
    });

    // ── OSI Credit ──
    k.add([
      k.text("OSI Cyber", { size: 10 }),
      k.pos(10, 470),
      k.color(100, 100, 120),
    ]);

    // ── Input handling ──
    k.onKeyPress("enter", () => {
      if (challenge) {
        engine.activateChallenge(challengeId);
      }
      engine.transition("PROFESSION");
    });

    k.onClick(() => {
      if (challenge) {
        engine.activateChallenge(challengeId);
      }
      engine.transition("PROFESSION");
    });

    // Daily trail handler
    if (!dailyDone) {
      k.onKeyPress("d", () => {
        engine.startDailyTrail();
        engine.transition("PROFESSION");
      });
    }

    if (savedRun) {
      k.onKeyPress("r", () => {
        // Restore saved run
        engine.signedState = savedRun.signedState;
        engine.profession = savedRun.profession;
        engine.leaderName = savedRun.leaderName;
        engine.memberNames = savedRun.memberNames;
        engine.fullJournal = savedRun.fullJournal || [];
        engine.activeChallenge = savedRun.activeChallenge;
        engine.currentEvent = savedRun.currentEvent;
        engine.currentRiver = savedRun.currentRiver;
        engine.currentLandmark = savedRun.currentLandmark;
        engine.dailyMode = savedRun.dailyMode || false;
        engine.dailyTrailNumber = savedRun.dailyTrailNumber || 0;
        if (engine.dailyMode) engine.dailyRng = mulberry32(getDailySeed());
        // Resume to correct scene based on pending state
        const resumeScene = engine.currentEvent ? "EVENT" :
          engine.currentRiver ? "RIVER" :
          engine.currentLandmark ? "LANDMARK" : "TRAVEL";
        engine.transition(resumeScene);
      });
    }
  });
}
