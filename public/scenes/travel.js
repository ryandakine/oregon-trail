import * as draw from "../lib/draw.mjs";
import { addTopHud, addBottomHud, updateHud, attachResizeRebuild, attachStatCorruption } from "../lib/hud.mjs";
import { applyToneOverlay } from "../lib/tone.mjs";
import { createJuice } from "../lib/juice.mjs";

const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function register(k, engine) {
  k.scene("travel", () => {
    let paused = false;
    const listeners = [];
    const loops = [];
    let detachResize = null;
    let detachCorruption = null;
    const juice = createJuice(k);
    function engineOn(event, fn) { engine.on(event, fn); listeners.push({ event, fn }); }

    k.onSceneLeave(() => {
      for (const { event, fn } of listeners) engine.off(event, fn);
      for (const l of loops) l?.cancel?.();
      detachResize?.();
      detachCorruption?.();
      // A dwell queued by this scene must not outlive it — every route back to
      // travel re-queues on mount.
      engine.cancelQueuedAdvance();
    });

    // ── Scene setup ──
    const tone = engine.tone ?? "medium";
    const dayPhase = getDayPhase(engine.currentDate);

    const sky = draw.drawSky(k, tone, dayPhase);
    const hills = draw.drawHills(k);
    draw.drawMountains(k);
    draw.drawGround(k, { tone });
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

    // Ambient birds — light birds normally, slow crows on the horror tier.
    const birds = [];
    if (MOTION_OK) {
      const crow = tone === "high";
      for (const [bx, by, ph] of [[110, 92, 0], [148, 104, 2.1], [420, 72, 4.4]]) {
        const b = draw.drawBird(k, bx, by, { crow, scale: crow ? 1.2 : 1 });
        b.birdPhase = ph;
        b.birdSpeed = crow ? 0.22 : 0.38;
        birds.push(b);
      }
    }

    // HIGH-tier temporal wrongness: roughly once per 40-70s, one distant
    // bird holds motionless mid-air for 1.5-2s then resumes — rare enough
    // to be felt, not staged.
    if (tone === "high" && MOTION_OK && birds.length) {
      let freezeTimer = null;
      const scheduleFreeze = () => {
        freezeTimer = k.wait(40 + k.rand(0, 30), () => {
          const b = birds[Math.floor(k.rand(0, birds.length))];
          b.frozenUntil = k.time() + 1.5 + k.rand(0, 0.5);
          scheduleFreeze();
        });
      };
      scheduleFreeze();
      loops.push({ cancel: () => freezeTimer?.cancel?.() });
    }

    // ── Hero convoy ──
    const WAGON_X = 300, WAGON_Y = 360;
    const wagon = draw.drawWagon(k, WAGON_X, WAGON_Y, { rolling: MOTION_OK });

    // HIGH-tier temporal wrongness: the right wheel's spokes are 6-fold
    // symmetric, so rotation *rate* is invisible from the spokes alone — a
    // small rim rivet reveals true phase and lets one wheel run ~0.92x the
    // other be felt over time without a still frame ever looking wrong.
    let wheelRivet = null;
    if (tone === "high" && MOTION_OK) {
      const rivetPivot = k.add([k.pos(WAGON_X + 42, WAGON_Y + 26), k.rotate(-90)]);
      rivetPivot.add([k.circle(1.6), k.pos(0, -17), k.color(...draw.PALETTE.outline), k.opacity(0.8), k.anchor("center")]);
      wheelRivet = { pivot: rivetPivot, phase: -90 };
    }

    // Drop shadow
    k.add([
      draw.ellipseRect(k, 130, 12),
      k.pos(WAGON_X, WAGON_Y + 48),
      k.color(...draw.PALETTE.dropShadow),
      k.opacity(0.35),
      k.anchor("center"),
    ]);

    // Yoke beam + hitch rod first — the oxen paint over it, so it reads as
    // sitting on the necks behind the heads, horns poking above.
    k.add([k.rect(88, 5, { radius: 2 }), k.pos(WAGON_X - 248, WAGON_Y - 4), k.color(...draw.PALETTE.outline)]);
    k.add([k.rect(84, 2), k.pos(WAGON_X - 246, WAGON_Y - 3), k.color(...draw.PALETTE.woodLight)]);
    k.add([k.rect(18, 3), k.pos(WAGON_X - 163, WAGON_Y - 1), k.color(...draw.PALETTE.outline), k.anchor("left"), k.rotate(28)]);

    const oxen = [
      draw.drawOx(k, WAGON_X - 218, WAGON_Y + 13, { animate: MOTION_OK, phase: 1.6 }),
      draw.drawOx(k, WAGON_X - 138, WAGON_Y + 13, { animate: MOTION_OK, phase: 0 }),
    ];
    // HIGH-tier temporal wrongness: one ox stretched ~1.18x on its long
    // (horizontal) axis only — draw.mjs exposes no scale opt on drawOx, so
    // this scales the returned group directly. y-scale stays 1, so the leg
    // swap (which only moves leg.pos.y) is untouched — no shear.
    if (tone === "high") oxen[1].use(k.scale(1.18, 1));

    const pioneers = [
      draw.drawPioneer(k, WAGON_X + 90, WAGON_Y + 24, { hat: "felt",   body: draw.PALETTE.vest,      legs: draw.PALETTE.trousers, animate: MOTION_OK, phase: 0.6 }),
      draw.drawPioneer(k, WAGON_X - 85, WAGON_Y + 26, { hat: "bonnet", body: draw.PALETTE.dressBlue, legs: draw.PALETTE.dressBlue, animate: MOTION_OK, phase: 2.8 }),
    ];

    // ── HUDs ──
    const hudState = { top: addTopHud(k, engine), bottom: addBottomHud(k, engine) };
    detachResize = attachResizeRebuild(k, engine, hudState);
    detachCorruption = attachStatCorruption(k, engine, hudState);

    // ── Tone overlay ──
    applyToneOverlay(k, tone);

    // ── Animation loop ──
    // Pioneers + oxen self-animate (opts.animate); pause toggles their
    // .walking flags below. This loop drives parallax + bird drift only.
    k.onUpdate(() => {
      if (paused || !MOTION_OK) return;

      for (const c of sky.clouds) { c.pos.x -= 0.15; if (c.pos.x < -100) c.pos.x = 700; }
      for (const h of hills.far)  { h.pos.x -= 0.2;  if (h.pos.x < -80)  h.pos.x = 720; }
      for (const h of hills.near) { h.pos.x -= 0.4;  if (h.pos.x < -60)  h.pos.x = 700; }

      for (const b of birds) {
        if (b.frozenUntil && k.time() < b.frozenUntil) continue;
        b.pos.x -= b.birdSpeed;
        b.pos.y += Math.sin(k.time() * 0.7 + b.birdPhase) * 0.08;
        if (b.pos.x < -20) { b.pos.x = 680; }
        b.flap(k.time() * 7 + b.birdPhase);
      }

      if (wheelRivet) {
        wheelRivet.phase = (wheelRivet.phase + 0.92 * k.dt() * 360) % 360;
        wheelRivet.pivot.angle = wheelRivet.phase;
      }
    });

    // Ambient wind sway on the 4 sky clouds, independent of pause state so
    // the sky never reads frozen even mid-pause. Additive delta on top of
    // the forward-parallax scroll above so it doesn't fight that loop's
    // wrap-around reset. Amplitude/period/phase seeded from each cloud's
    // spawn position (no Math.random) — drift phase itself runs off
    // k.time(), which is fine here since this scene isn't screenshot-pinned.
    if (MOTION_OK) {
      const cloudSway = sky.clouds.map((c) => {
        const rng = draw.seededRng(draw.seedFrom(c.pos.x, c.pos.y));
        return { amp: 15 + rng() * 10, period: 40 + rng() * 20, phase: rng() * Math.PI * 2, prev: 0 };
      });
      k.onUpdate(() => {
        sky.clouds.forEach((c, i) => {
          const s = cloudSway[i];
          const offset = Math.sin((k.time() / s.period + s.phase) * Math.PI * 2) * s.amp;
          c.pos.x += offset - s.prev;
          s.prev = offset;
        });
      });
    }

    // Dust puffs kicked up behind the wheels while traveling.
    if (MOTION_OK) {
      loops.push(k.loop(0.4, () => {
        if (paused) return;
        draw.spawnDustPuff(k, WAGON_X - 50 + Math.random() * 100, WAGON_Y + 44 + Math.random() * 5);
      }));
    }

    // ── Weather FX ──
    const miles = engine.milesTraveled ?? 0;
    const weather = miles > 1200 ? (Math.random() > 0.5 ? "snow" : "clear")
                  : miles > 600  ? (Math.random() > 0.5 ? "dust" : "clear")
                  :                 (Math.random() > 0.7 ? "rain" : "clear");

    if (weather === "rain" && MOTION_OK) {
      loops.push(k.loop(0.05, () => {
        if (paused) return;
        const startY = -10;
        const speed = 5 + k.rand(0, 3);
        const drop = k.add([k.rect(1, 8), k.pos(Math.random() * 640, startY), k.color(96, 120, 180), k.opacity(0.6), k.z(40)]);
        drop.onUpdate(() => {
          drop.pos.y += speed; drop.pos.x -= 0.5;
          const t = k.clamp((drop.pos.y - startY) / (480 - startY), 0, 1);
          drop.opacity = 0.6 * (1 - k.easings.easeInQuad(t));
          if (drop.pos.y > 480) drop.destroy();
        });
      }));
    } else if (weather === "snow" && MOTION_OK) {
      loops.push(k.loop(0.1, () => {
        if (paused) return;
        const startY = -10;
        const speed = 1 + k.rand(0, 1);
        const flake = k.add([k.circle(2), k.pos(Math.random() * 640, startY), k.color(248, 248, 255), k.opacity(0.7), k.z(40)]);
        flake.onUpdate(() => {
          flake.pos.y += speed; flake.pos.x += Math.sin(k.time() * 3 + flake.pos.y * 0.1) * 0.5;
          const t = k.clamp((flake.pos.y - startY) / (480 - startY), 0, 1);
          flake.opacity = 0.7 * (1 - k.easings.easeInQuad(t));
          if (flake.pos.y > 480) flake.destroy();
        });
      }));
    } else if (weather === "dust" && MOTION_OK) {
      loops.push(k.loop(0.08, () => {
        if (paused) return;
        const startX = 660;
        const speed = 2 + k.rand(0, 2);
        const p = k.add([k.circle(2), k.pos(startX, 250 + Math.random() * 200), k.color(...draw.PALETTE.dirtLight), k.opacity(0.4), k.z(40)]);
        p.onUpdate(() => {
          p.pos.x -= speed; p.pos.y += Math.sin(k.time() * 2) * 0.3;
          const t = k.clamp((startX - p.pos.x) / (startX + 20), 0, 1);
          p.opacity = 0.4 * (1 - k.easings.easeInQuad(t));
          if (p.pos.x < -20 || p.opacity <= 0) p.destroy();
        });
      }));
    }

    // ── Floating text ──
    // Deaths and illnesses arrive in batches, and at the old 0.008/frame fade
    // they overwrote each other at a single position and were gone in ~2s.
    // Hold each one legible, then stack: newest at the bottom, older pushed up.
    const FLOAT_HOLD = 2.6;
    const FLOAT_FADE = 1.0;
    const FLOAT_BASE_Y = 418;
    const FLOAT_LINE_H = 17;
    const FLOAT_MAX = 5;
    const floats = [];

    function layoutFloats() {
      floats.forEach((f, i) => { f.slotY = FLOAT_BASE_Y - (floats.length - 1 - i) * FLOAT_LINE_H; });
    }

    function dropFloat(ft) {
      const i = floats.indexOf(ft);
      if (i >= 0) floats.splice(i, 1);
      ft.destroy();
      layoutFloats();
    }

    function showFloatingText(msg) {
      const ft = k.add([k.text(msg, { size: 12, width: 400 }), k.pos(320, FLOAT_BASE_Y), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.opacity(1), k.z(60)]);
      ft.age = 0;
      ft.slotY = FLOAT_BASE_Y;
      ft.onUpdate(() => {
        if (paused) return;
        ft.age += k.dt();
        const fading = Math.max(0, ft.age - FLOAT_HOLD);
        ft.opacity = 1 - Math.min(1, fading / FLOAT_FADE);
        ft.pos.y = ft.slotY - (MOTION_OK ? fading * 12 : 0);
        if (ft.opacity <= 0) dropFloat(ft);
      });
      floats.push(ft);
      if (floats.length > FLOAT_MAX) dropFloat(floats[0]);
      layoutFloats();
    }

    // ── Engine handlers ──
    engineOn("daysAdvanced", ({ summaries }) => {
      updateHud(k, engine, hudState);
      // One juice call per advance, escalated to the worst outcome in the
      // batch — firing per event stacks flashes/shake queues (4 illnesses in
      // one 5-day advance = 4 overlapping horror() flashes).
      let worst = 0; // 0 none, 1 minor, 2 death
      for (const s of summaries) {
        for (const evt of (s.events ?? [])) {
          // Day events are plain strings (attrition + fired delayed effects);
          // older code only handled {text|description} objects, so strings
          // rendered nothing. Coerce both shapes.
          const msg = typeof evt === "string" ? evt : (evt && (evt.text || evt.description));
          if (!msg) continue;
          showFloatingText(msg);
          // Juice only on the deterministic worker-authored strings
          // (simulation.ts applyDailyAttrition) — LLM delayed-effect
          // journal_entry text (e.g. oxen loss) is free-form and not
          // reliably pattern-matchable, so it's left un-juiced rather than
          // guessed at.
          const isDeath = / has died$/.test(msg);
          const isBadOutcome = isDeath || /fell ill with|starvation taking its toll/i.test(msg);
          if (isDeath) worst = 2;
          else if (isBadOutcome) worst = Math.max(worst, 1);
        }
      }
      if (worst === 2) (tone === "high" ? juice.horror() : juice.major());
      else if (worst === 1) (tone === "high" ? juice.horror() : juice.minor());
    });
    engineOn("error", ({ message }) => {
      // Forced renders (visual QA, smoke tests) have no game state; never
      // paint an error string onto the canvas in that case.
      if (!engine.gameState) return;
      showFloatingText("Error: " + message);
    });

    // ── Hunt action (IMPROVEMENT_ROADMAP §1.3) ──
    // startHunt() previously had zero callers — the HUNTING scene was
    // unreachable, so players couldn't recover food. Surface an [H]/tap entry
    // in the travel HUD. Placed bottom-left, clear of the pause hotspot
    // (x<100,y<60) and the bottom party panel (y=440).
    const huntBtnW = 92, huntBtnH = 26, huntBtnX = 8, huntBtnY = 404;
    const huntBtn = k.add([
      k.rect(huntBtnW, huntBtnH, { radius: 4 }),
      k.pos(huntBtnX, huntBtnY),
      k.color(46, 139, 87),
      k.opacity(0.85),
      k.area(),
      k.fixed(),
      k.z(60),
    ]);
    k.add([
      k.text("(H) Hunt", { size: 13 }),
      k.pos(huntBtnX + huntBtnW / 2, huntBtnY + huntBtnH / 2),
      k.anchor("center"),
      k.color(255, 255, 255),
      k.fixed(),
      k.z(61),
    ]);
    const goHunt = () => { engine.track('hunt_started'); engine.startHunt(); };
    huntBtn.onClick(goHunt);
    k.onKeyPress("h", goHunt);

    // ── Pause ──
    let pauseOverlay = null;
    function togglePause() {
      paused = !paused;
      for (const p of pioneers) p.walking = !paused;
      for (const o of oxen) o.walking = !paused;
      wagon.wheels.setSpeed(!paused && MOTION_OK ? 1 : 0);
      if (paused) {
        engine.pauseAdvance();
        pauseOverlay = k.add([k.rect(640, 480), k.pos(0, 0), k.color(0, 0, 0), k.opacity(0.7), k.z(100)]);
        k.add([k.text("PAUSED", { size: 36 }), k.pos(320, 180), k.anchor("center"), k.color(...draw.PALETTE.gold), k.z(101), "pauseTag"]);
        const buildStatsLines = () => {
          const party = engine.party;
          const sup2 = engine.supplies;
          return [
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
        };
        const statsText = k.add([k.text(buildStatsLines().join("\n"), { size: 13, width: 400 }), k.pos(320, 200), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.z(101), "pauseTag"]);

        // ── Pace + rations controls (IMPROVEMENT_ROADMAP §1.3) ──
        // changePace()/changeRations() previously had zero callers, so the
        // difficulty levers were dead. Cycle buttons live in the pause overlay;
        // the chosen value is sent on the next /api/advance via pendingPace/
        // pendingRations. Server accepts the override (index.ts force_pace/
        // force_rations). Pretty labels for bare_bones.
        const PACES = ["steady", "strenuous", "grueling"];
        const RATIONS = ["filling", "meager", "bare_bones"];
        const pretty = (s) => String(s).replace(/_/g, " ");
        const settings = engine.settings;
        let curPace = engine.pendingPace || settings?.pace || "steady";
        let curRations = engine.pendingRations || settings?.rations || "filling";

        const makeCycle = (label, getCur, onCycle, y) => {
          const rowY = y;
          k.add([k.text(label, { size: 13 }), k.pos(170, rowY), k.anchor("left"), k.color(...draw.PALETTE.parchment), k.z(101), "pauseTag"]);
          const valText = k.add([k.text(pretty(getCur()), { size: 14 }), k.pos(330, rowY), k.anchor("left"), k.color(...draw.PALETTE.gold), k.z(102), "pauseTag"]);
          const btn = k.add([
            k.rect(28, 24, { radius: 4 }), k.pos(290, rowY - 12), k.color(46, 139, 87), k.opacity(0.9), k.area(), k.z(102), "pauseTag",
          ]);
          k.add([k.text(">", { size: 16 }), k.pos(304, rowY), k.anchor("center"), k.color(255, 255, 255), k.z(103), "pauseTag"]);
          btn.onClick(() => { onCycle(); valText.text = pretty(getCur()); });
          return btn;
        };

        makeCycle("Pace:", () => curPace, () => {
          curPace = PACES[(PACES.indexOf(curPace) + 1) % PACES.length];
          engine.changePace(curPace);
        }, 320);
        makeCycle("Rations:", () => curRations, () => {
          curRations = RATIONS[(RATIONS.indexOf(curRations) + 1) % RATIONS.length];
          engine.changeRations(curRations);
        }, 352);

        // ── Make Camp (PHASE2_BIG_BETS_PLAN Bet 3) ──
        // One rest day via POST /api/camp: real per-day attrition + rest
        // healing, miles unchanged. Disabled while an event is pending
        // (server would reject resolve_pending_event anyway — don't offer
        // a dead button). Errors surface via the pause-overlay notice, not
        // silence; success shows a brief day summary.
        const eventPending = !!engine.gameState?.simulation?.pending_event_hash;
        const campW = 200, campH = 26, campY = 372;
        const campBtn = k.add([
          k.rect(campW, campH, { radius: 4 }),
          k.pos(320 - campW / 2, campY),
          k.color(...(eventPending ? [90, 90, 90] : [46, 139, 87])),
          k.opacity(eventPending ? 0.5 : 0.9),
          k.area(),
          k.z(102),
          "pauseTag", "campBtn",
        ]);
        k.add([
          k.text("Make Camp (1 day)", { size: 13 }),
          k.pos(320, campY + campH / 2),
          k.anchor("center"),
          k.color(255, 255, 255),
          k.opacity(eventPending ? 0.6 : 1),
          k.z(103), "pauseTag",
        ]);

        const showCampMsg = (msg) => {
          k.destroyAll("campMsg");
          k.add([k.text(msg, { size: 11, width: 480 }), k.pos(320, 452), k.anchor("center"), k.color(...draw.PALETTE.gold), k.z(103), "pauseTag", "campMsg"]);
        };

        const campSummaryText = (s) => {
          if (!s) return "The party makes camp for the night.";
          const bits = [];
          if (typeof s.food_consumed === "number") bits.push(`${s.food_consumed} lbs of food eaten`);
          const healed = Array.isArray(s.healed) ? s.healed.length : 0;
          if (healed > 0) bits.push(`${healed} ${healed === 1 ? "member" : "members"} rested easier`);
          const head = `Camped for a day${bits.length ? " — " + bits.join(", ") : ""}.`;
          const note = Array.isArray(s.notes) && s.notes.length ? " " + s.notes[0] : "";
          return head + note;
        };

        let campBusy = false;
        const attemptCamp = async () => {
          if (campBtn.campDisabled || campBusy) return;
          campBusy = true;
          try {
            const summary = await engine.makeCamp();
            updateHud(k, engine, hudState);
            statsText.text = buildStatsLines().join("\n");
            showCampMsg(campSummaryText(summary));
          } catch (e) {
            const code = e?.message || "unknown";
            const friendly = code.includes("resolve_pending_event")
              ? "Resolve the pending event before making camp."
              : code.includes("wrong_phase")
                ? "You can only make camp while on the trail."
                : "Camp failed: " + code;
            showCampMsg(friendly);
          } finally {
            campBusy = false;
          }
        };
        campBtn.campDisabled = eventPending;
        campBtn.doCamp = attemptCamp;
        campBtn.onClick(() => { attemptCamp(); });

        k.add([k.text("(changes apply as you travel on)", { size: 10 }), k.pos(320, 410), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.opacity(0.7), k.z(101), "pauseTag"]);
        k.add([k.text("Press P or tap top-left to resume", { size: 12 }), k.pos(320, 430), k.anchor("center"), k.color(...draw.PALETTE.parchment), k.z(101), "pauseTag"]);
      } else {
        engine.resumeAdvance();
        k.destroyAll("pauseTag");
        pauseOverlay?.destroy();
        pauseOverlay = null;
        engine.queueAdvance();
      }
    }
    k.onKeyPress("p", togglePause);
    k.onClick(() => { if (k.mousePos().x < 100 && k.mousePos().y < 60) togglePause(); });

    // If a landmark requested a hunt, route straight to HUNTING instead of
    // auto-advancing (IMPROVEMENT_ROADMAP §1.3). startHunt() pauses advance +
    // transitions, so we never kick off a travel advance this frame.
    if (engine.consumePendingHunt?.()) {
      engine.startHunt();
      return;
    }

    // No signed state means a forced render (QA/smoke) — auto-advancing would
    // hit the API with a null state and paint an error. Render statically.
    // Otherwise queue rather than fire: this scene is the only place the art
    // lives, so it gets a paced beat of rolling before the next advance.
    if (engine.gameState) {
      engine.resumeAdvance();
      engine.queueAdvance();
    }
  });
}

function getDayPhase(dateStr) {
  if (!dateStr) return "day";
  const d = new Date(dateStr + "T00:00:00");
  return ["dawn", "day", "day", "dusk"][d.getDate() % 4];
}
