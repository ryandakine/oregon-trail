import * as draw from "../lib/draw.mjs";
import { effectiveMode, setRenderMode, isDesktopPointer, isTouchOnly } from "../render-mode.mjs";

export default function register(k, engine) {
  k.scene("title", (data) => {
    // ── Night sky: dark base + stepped horizon glow ──
    k.add([
      k.rect(640, 480),
      k.pos(0, 0),
      k.color(15, 15, 40),
    ]);
    k.add([k.rect(640, 50), k.pos(0, 215), k.color(...draw.mixColor(draw.PALETTE.skyNight, draw.PALETTE.skyNightHorizon, 0.5)), k.opacity(0.5)]);
    k.add([k.rect(640, 35), k.pos(0, 265), k.color(...draw.PALETTE.skyNightHorizon), k.opacity(0.55)]);

    // ── Stars (seeded scatter; slow twinkle on a seeded subset) ──
    const rng = draw.seededRng(draw.seedFrom(640, 480));
    const twinklers = [];
    for (let i = 0; i < 70; i++) {
      const sx = rng() * 640;
      const sy = rng() * 225;
      const baseOpacity = 0.25 + rng() * 0.65;
      const star = k.add([
        k.circle(0.8 + rng() * 1.4),
        k.pos(sx, sy),
        k.color(255, 255, 255),
        k.opacity(baseOpacity),
        k.anchor("center"),
      ]);
      if (rng() < 0.4) {
        twinklers.push({ obj: star, baseOpacity, speed: 0.4 + rng() * 1.2, phase: rng() * Math.PI * 2 });
      }
    }

    // Twinkle animation — slow opacity pulse, subset only
    k.onUpdate(() => {
      const t = k.time();
      for (const s of twinklers) {
        s.obj.opacity = s.baseOpacity * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
      }
    });

    // ── Subtle moon ──
    k.add([k.circle(20), k.pos(522, 74), k.color(...draw.PALETTE.moon), k.opacity(0.1), k.anchor("center")]);
    k.add([k.circle(13), k.pos(522, 74), k.color(...draw.PALETTE.moon), k.opacity(0.85), k.anchor("center")]);
    k.add([k.circle(11), k.pos(527, 71), k.color(15, 15, 40), k.opacity(0.8), k.anchor("center")]);

    // ── Layered silhouette mountain ranges ──
    k.add([
      k.polygon([
        k.vec2(0, 300), k.vec2(0, 262), k.vec2(70, 226), k.vec2(150, 258),
        k.vec2(250, 218), k.vec2(340, 256), k.vec2(430, 230), k.vec2(540, 264),
        k.vec2(640, 238), k.vec2(640, 300),
      ]),
      k.pos(0, 0), k.color(...draw.PALETTE.silhouetteFar),
    ]);
    k.add([
      k.polygon([
        k.vec2(0, 300), k.vec2(0, 276), k.vec2(110, 248), k.vec2(210, 274),
        k.vec2(330, 244), k.vec2(450, 276), k.vec2(560, 252), k.vec2(640, 272),
        k.vec2(640, 300),
      ]),
      k.pos(0, 0), k.color(...draw.PALETTE.silhouetteNear),
    ]);

    // ── Prairie hill ridges (smooth polygons, night greens) ──
    k.add([
      k.polygon([
        k.vec2(0, 310), k.vec2(0, 282), k.vec2(120, 268), k.vec2(260, 284),
        k.vec2(400, 266), k.vec2(530, 286), k.vec2(640, 272), k.vec2(640, 310),
      ]),
      k.pos(0, 0), k.color(30, 60, 25),
    ]);
    k.add([
      k.polygon([
        k.vec2(0, 320), k.vec2(0, 296), k.vec2(150, 286), k.vec2(300, 300),
        k.vec2(460, 286), k.vec2(640, 298), k.vec2(640, 320),
      ]),
      k.pos(0, 0), k.color(45, 80, 35),
    ]);

    // ── Ground ──
    k.add([
      k.rect(640, 200),
      k.pos(0, 300),
      k.color(55, 95, 40),
    ]);

    // ── Dirt trail ──
    k.add([
      k.rect(640, 14),
      k.pos(0, 348),
      k.color(120, 85, 50),
    ]);
    k.add([k.rect(640, 3), k.pos(0, 348), k.color(85, 60, 35)]);

    // ── Wagon — the real prairie schooner, dusk-lit (lantern stays warm) ──
    k.add([
      draw.ellipseRect(k, 140, 10),
      k.pos(320, 358),
      k.color(...draw.PALETTE.dropShadow),
      k.opacity(0.4),
      k.anchor("center"),
    ]);
    draw.drawWagon(k, 320, 312, { dim: 0.5, tongueDown: true });

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

    // ── Meta-progression line (localStorage, no backend) ──
    // "Best: 847 mi · 12 runs · Horror not yet survived" — the repeat-visit
    // hook (IMPROVEMENT_ROADMAP §1.4). getMetaSummary never throws.
    // Sits below the Daily badge (y=200, 36 tall) so it never collides with
    // the title block.
    k.add([
      k.text(GameEngine.getMetaSummary(), { size: 10, width: 600, align: "center" }),
      k.pos(320, 230),
      k.anchor("center"),
      k.color(150, 140, 110),
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
        k.pos(320, 250),
        k.anchor("center"),
        k.color(150, 200, 150),
      ]);
    }

    // ── Render mode toggle (2D / 3D) — desktop only, key-only like [ D ]/[ R ] ──
    // Hidden on touch-only devices: 3D chokes phones and the desktop gate in
    // main.js never fires there. y dodges the conditional [ R ] line (y=250):
    // 310 when a saved run is shown, 280 otherwise. Current state in title-gold.
    if (!isTouchOnly()) {
      const eff = effectiveMode(isDesktopPointer());
      k.add([
        k.text(`[ V ] 3D World: ${eff === "3d" ? "On" : "Off"}`, { size: 13 }),
        k.pos(320, savedRun ? 310 : 280),
        k.anchor("center"),
        k.color(212, 160, 23),
      ]);
      // Flip to the opposite explicit mode, then reload to re-run the 3D gate.
      // Only reload if the write succeeded (private mode → no dead reload).
      k.onKeyPress("v", () => {
        const next = effectiveMode(isDesktopPointer()) === "3d" ? "2d" : "3d";
        if (setRenderMode(next)) location.reload();
      });
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
        engine.currentBitterPath = savedRun.currentBitterPath || null;
        engine.currentBitterPathMeta = savedRun.currentBitterPathMeta || null;
        engine.dailyMode = savedRun.dailyMode || false;
        engine.dailyTrailNumber = savedRun.dailyTrailNumber || 0;
        if (engine.dailyMode) engine.dailyRng = mulberry32(getDailySeed());
        // Resume to correct scene based on pending state. BITTER_PATH takes
        // priority over EVENT so a mid-flow horror scene resumes to itself,
        // not to the generic event screen.
        engine.transition(engine.getResumeScene());
      });
    }
  });
}
