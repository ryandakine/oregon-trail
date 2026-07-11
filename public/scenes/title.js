import * as draw from "../lib/draw.mjs";
import { effectiveMode, setRenderMode, isDesktopPointer, isTouchOnly } from "../render-mode.mjs";

// Parchment UI tokens (AESTHETIC_SPEC / design-review D-Chrome)
const P = draw.PALETTE;
const PANEL = P.parchmentDark; // #2a1f0e
const CREAM = P.parchment;     // #f5e6c8
const GOLD = P.gold;           // #d4a017
const CREAM_DIM = [180, 160, 120];
const META = [150, 140, 110];

function parchmentPanel(k, w, h, x, y, { fill = PANEL, outlineRgb = GOLD, radius = 4 } = {}) {
  return k.add([
    k.rect(w, h, { radius }),
    k.pos(x, y),
    k.anchor("center"),
    k.color(...fill),
    k.outline(1, k.rgb(...outlineRgb)),
    k.area(),
    k.z(10),
  ]);
}

/** Procedural warm-night poster (D-Fallback) — PALETTE only. */
function paintNightFallback(k) {
  k.add([k.rect(640, 480), k.pos(0, 0), k.color(...P.skyNight), k.z(0)]);
  k.add([
    k.rect(640, 50),
    k.pos(0, 215),
    k.color(...draw.mixColor(P.skyNight, P.skyNightHorizon, 0.5)),
    k.opacity(0.5),
    k.z(0),
  ]);
  k.add([k.rect(640, 35), k.pos(0, 265), k.color(...P.skyNightHorizon), k.opacity(0.55), k.z(0)]);

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
      k.z(0),
    ]);
    if (rng() < 0.4) {
      twinklers.push({ obj: star, baseOpacity, speed: 0.4 + rng() * 1.2, phase: rng() * Math.PI * 2 });
    }
  }
  k.onUpdate(() => {
    const t = k.time();
    for (const s of twinklers) {
      s.obj.opacity = s.baseOpacity * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
    }
  });

  k.add([k.circle(20), k.pos(522, 74), k.color(...P.moon), k.opacity(0.1), k.anchor("center"), k.z(0)]);
  k.add([k.circle(13), k.pos(522, 74), k.color(...P.moon), k.opacity(0.85), k.anchor("center"), k.z(0)]);
  k.add([k.circle(11), k.pos(527, 71), k.color(...P.skyNight), k.opacity(0.8), k.anchor("center"), k.z(0)]);

  k.add([
    k.polygon([
      k.vec2(0, 300), k.vec2(0, 262), k.vec2(70, 226), k.vec2(150, 258),
      k.vec2(250, 218), k.vec2(340, 256), k.vec2(430, 230), k.vec2(540, 264),
      k.vec2(640, 238), k.vec2(640, 300),
    ]),
    k.pos(0, 0), k.color(...P.silhouetteFar), k.z(0),
  ]);
  k.add([
    k.polygon([
      k.vec2(0, 300), k.vec2(0, 276), k.vec2(110, 248), k.vec2(210, 274),
      k.vec2(330, 244), k.vec2(450, 276), k.vec2(560, 252), k.vec2(640, 272),
      k.vec2(640, 300),
    ]),
    k.pos(0, 0), k.color(...P.silhouetteNear), k.z(0),
  ]);

  k.add([
    k.polygon([
      k.vec2(0, 310), k.vec2(0, 282), k.vec2(120, 268), k.vec2(260, 284),
      k.vec2(400, 266), k.vec2(530, 286), k.vec2(640, 272), k.vec2(640, 310),
    ]),
    k.pos(0, 0), k.color(...P.grassDeep), k.z(0),
  ]);
  k.add([
    k.polygon([
      k.vec2(0, 320), k.vec2(0, 296), k.vec2(150, 286), k.vec2(300, 300),
      k.vec2(460, 286), k.vec2(640, 298), k.vec2(640, 320),
    ]),
    k.pos(0, 0), k.color(...P.hillMid), k.z(0),
  ]);
  k.add([k.rect(640, 200), k.pos(0, 300), k.color(...P.grassBorder), k.z(0)]);
  k.add([k.rect(640, 14), k.pos(0, 348), k.color(...P.dirtMid), k.z(0)]);
  k.add([k.rect(640, 3), k.pos(0, 348), k.color(...P.dirtDark), k.z(0)]);

  k.add([
    draw.ellipseRect(k, 140, 10),
    k.pos(320, 358),
    k.color(...P.dropShadow),
    k.opacity(0.4),
    k.anchor("center"),
    k.z(0),
  ]);
  // Wagon sits in lower third (free of top chrome)
  draw.drawWagon(k, 320, 312, { dim: 0.5, tongueDown: true });
}

/** Full-bleed cover of titleHero into 640×480 (D-Crop: south bias → wagon lower third). */
function paintHeroCoverFixed(k) {
  const sw = 1280;
  const sh = 720;
  const cover = Math.max(640 / sw, 480 / sh);
  k.add([
    k.sprite("titleHero"),
    k.pos(320, 255),
    k.anchor("center"),
    k.scale(cover),
    k.z(0),
  ]);
}

function paintScrims(k) {
  k.add([k.rect(640, 150), k.pos(0, 0), k.color(...P.skyNight), k.opacity(0.72), k.z(5)]);
  k.add([k.rect(640, 40), k.pos(0, 150), k.color(...P.skyNight), k.opacity(0.4), k.z(5)]);
  k.add([k.rect(640, 130), k.pos(0, 350), k.color(...P.skyNight), k.opacity(0.78), k.z(5)]);
  k.add([k.rect(640, 30), k.pos(0, 320), k.color(...P.skyNight), k.opacity(0.4), k.z(5)]);
}

export default function register(k, engine) {
  k.scene("title", () => {
    const heroReady = !!window.__titleHeroReady;

    if (heroReady) {
      // Base fill under cover (letterbox safety)
      k.add([k.rect(640, 480), k.pos(0, 0), k.color(...P.skyNight), k.z(-1)]);
      paintHeroCoverFixed(k);
    } else {
      paintNightFallback(k);
    }
    paintScrims(k);

    // ── Poster stack UI (D-IA) ─────────────────────────────────────────
    k.add([
      k.text("THE OREGON TRAIL", { size: 42 }),
      k.pos(320, 100),
      k.anchor("center"),
      k.color(...GOLD),
      k.z(12),
    ]);
    k.add([
      k.text("- AI Edition -", { size: 18 }),
      k.pos(320, 138),
      k.anchor("center"),
      k.color(...CREAM_DIM),
      k.z(12),
    ]);

    const dailyNum = GameEngine.getDailyTrailNumber();
    const dailyDone = GameEngine.getDailyCompletion();
    let dailyBtn = null;
    if (dailyDone) {
      k.add([
        k.text(`Daily Trail #${dailyNum} — ${dailyDone.survived ? "Completed!" : "Failed"}`, {
          size: 12, width: 400, align: "center",
        }),
        k.pos(320, 178),
        k.anchor("center"),
        k.color(...CREAM_DIM),
        k.z(12),
      ]);
    } else {
      dailyBtn = parchmentPanel(k, 240, 44, 320, 180);
      k.add([
        k.text(`[ D ] Daily Trail #${dailyNum}`, { size: 14 }),
        k.pos(320, 180),
        k.anchor("center"),
        k.color(...CREAM),
        k.z(13),
      ]);
    }

    k.add([
      k.text(GameEngine.getMetaSummary(), { size: 10, width: 600, align: "center" }),
      k.pos(320, 214),
      k.anchor("center"),
      k.color(...META),
      k.z(12),
    ]);

    const savedRun = engine._savedRunData;
    let resumeBtn = null;
    let tertiaryY = 248;
    if (savedRun) {
      resumeBtn = parchmentPanel(k, 260, 40, 320, tertiaryY, { outlineRgb: CREAM_DIM });
      k.add([
        k.text("[ R ] Resume saved journey", { size: 13 }),
        k.pos(320, tertiaryY),
        k.anchor("center"),
        k.color(...CREAM),
        k.z(13),
      ]);
      tertiaryY += 44;
    }

    if (!isTouchOnly()) {
      const eff = effectiveMode(isDesktopPointer());
      const vBtn = parchmentPanel(k, 200, 36, 320, tertiaryY);
      k.add([
        k.text(`[ V ] 3D World: ${eff === "3d" ? "On" : "Off"}`, { size: 12 }),
        k.pos(320, tertiaryY),
        k.anchor("center"),
        k.color(...GOLD),
        k.z(13),
      ]);
      const flip3d = () => {
        const next = effectiveMode(isDesktopPointer()) === "3d" ? "2d" : "3d";
        if (setRenderMode(next)) location.reload();
      };
      vBtn.onClick(flip3d);
      k.onKeyPress("v", flip3d);
    }

    const challengeId = GameEngine.getCurrentChallengeId();
    const challenge = window.CHALLENGE_INFO?.[challengeId];
    if (challenge) {
      parchmentPanel(k, 300, 52, 320, 378);
      k.add([
        k.text("Weekly Challenge: " + challenge.name, { size: 12 }),
        k.pos(320, 368),
        k.anchor("center"),
        k.color(...GOLD),
        k.z(13),
      ]);
      k.add([
        k.text(challenge.desc, { size: 10, width: 280, align: "center" }),
        k.pos(320, 388),
        k.anchor("center"),
        k.color(...CREAM_DIM),
        k.z(13),
      ]);
    }

    // Primary ENTER CTA ≥44px
    const enterBtn = parchmentPanel(k, 280, 48, 320, 440);
    const prompt = k.add([
      k.text("Press ENTER to begin", { size: 16 }),
      k.pos(320, 440),
      k.anchor("center"),
      k.color(...CREAM),
      k.z(13),
    ]);
    k.onUpdate(() => {
      prompt.opacity = 0.55 + 0.45 * Math.abs(Math.sin(k.time() * 2));
    });

    k.add([
      k.text("OSI Cyber", { size: 10 }),
      k.pos(12, 468),
      k.color(...META),
      k.z(12),
    ]);

    function startFresh() {
      if (challenge) engine.activateChallenge(challengeId);
      engine.transition("PROFESSION");
    }
    function startDaily() {
      engine.startDailyTrail();
      engine.transition("PROFESSION");
    }
    function resumeRun() {
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
      engine.transition(engine.getResumeScene());
    }

    k.onKeyPress("enter", startFresh);
    enterBtn.onClick(startFresh);

    if (dailyBtn) {
      dailyBtn.onClick(startDaily);
      k.onKeyPress("d", startDaily);
    }
    if (resumeBtn && savedRun) {
      resumeBtn.onClick(resumeRun);
      k.onKeyPress("r", resumeRun);
    }

    // Soft mid-band tap → begin (mobile), under buttons z
    k.add([
      k.rect(640, 90),
      k.pos(0, 270),
      k.opacity(0),
      k.area(),
      k.z(6),
    ]).onClick(startFresh);
  });
}
