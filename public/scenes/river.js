import { PALETTE } from "../lib/draw.mjs";
import { createJuice, MOTION_OK } from "../lib/juice.mjs";

export default function register(k, engine) {
  k.scene("river", (data) => {
    const W = 640;
    const H = 480;
    const juice = createJuice(k);
    const river = data || {};
    const name = river.name || "Unknown River";
    const width = river.width_ft || river.width || "medium";
    const depth = river.depth_ft_summer || river.depth_ft_spring || river.depth || "medium";
    // ford_difficulty is a 1-5 number per the server schema. Map to the
    // string label the color lookup + label render expect. Without this the
    // scene throws "toUpperCase is not a function" and kaplay's blue error
    // overlay strands the player on any real river crossing.
    const rawDifficulty = river.ford_difficulty ?? river.difficulty ?? "moderate";
    const DIFFICULTY_LABELS = { 1: "easy", 2: "easy", 3: "moderate", 4: "hard", 5: "dangerous" };
    const difficulty = typeof rawDifficulty === "number"
      ? (DIFFICULTY_LABELS[rawDifficulty] || "moderate")
      : String(rawDifficulty);
    // river.ferry_cost_1848_dollars is DOLLARS (worker/src/types.ts RiverCrossing);
    // formatMoney() expects CENTS like every other money value in the engine.
    // Convert here — mirrors the `* 100` in handleRiver's ferry branch, which is
    // why the actual charge was always right while the button read "$0.01".
    const ferryCost = river.ferry_cost_1848_dollars != null
      ? river.ferry_cost_1848_dollars * 100
      : (river.ferry_cost || 500);

    // Sky
    k.add([k.rect(W, 180), k.pos(0, 0), k.color(22, 33, 62)]);

    // Riverbanks (brown)
    k.add([k.rect(W, 40), k.pos(0, 160), k.color(139, 69, 19)]);
    k.add([k.rect(W, 60), k.pos(0, 380), k.color(139, 69, 19)]);

    // Animated water area
    const waterY = 200;
    const waterH = 180;
    k.add([k.rect(W, waterH), k.pos(0, waterY), k.color(30, 80, 160)]);

    // No wagon sprite is drawn in this scene — the crossing is implied.
    // Use the water's center as the splash origin.
    const wagonX = W / 2;
    const wagonY = waterY + waterH / 2;
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

    // Scrolling water lines
    const lines = [];
    for (let i = 0; i < 12; i++) {
      const line = k.add([
        k.rect(80 + Math.random() * 100, 2),
        k.pos(Math.random() * W, waterY + 10 + i * 14),
        k.color(60, 130, 220),
        k.opacity(0.4 + Math.random() * 0.3),
      ]);
      lines.push({ obj: line, speed: 40 + Math.random() * 60 });
    }

    k.onUpdate(() => {
      for (const l of lines) {
        l.obj.pos.x += l.speed * k.dt();
        if (l.obj.pos.x > W) {
          l.obj.pos.x = -120;
        }
      }
    });

    // River name
    k.add([
      k.text(name, { size: 28 }),
      k.pos(W / 2, 30),
      k.anchor("center"),
      k.color(252, 227, 138),
    ]);

    // Info text
    const widthLabels = { narrow: "Narrow", medium: "Medium", wide: "Wide", very_wide: "Very Wide" };
    const depthLabels = { shallow: "Shallow", medium: "Medium", deep: "Deep", very_deep: "Very Deep" };
    const infoStr = `Width: ${widthLabels[width] || width}  |  Depth: ${depthLabels[depth] || depth}`;
    k.add([
      k.text(infoStr, { size: 16 }),
      k.pos(W / 2, 65),
      k.anchor("center"),
      k.color(255, 255, 255),
    ]);

    // Difficulty indicator
    const diffColors = {
      easy: [46, 139, 87],
      moderate: [222, 184, 135],
      hard: [178, 34, 34],
      dangerous: [178, 34, 34],
    };
    const diffColor = diffColors[difficulty] || diffColors.moderate;
    k.add([
      k.text(`Difficulty: ${difficulty.toUpperCase()}`, { size: 14 }),
      k.pos(W / 2, 90),
      k.anchor("center"),
      k.color(diffColor[0], diffColor[1], diffColor[2]),
    ]);

    // Choice buttons
    const btnY = 430;
    const btnH = 36;
    const btnW = 180;
    const btnGap = 10;
    const totalW = btnW * 3 + btnGap * 2;
    const startX = (W - totalW) / 2;

    // Ford color by difficulty
    const fordColors = {
      easy: [46, 139, 87],
      moderate: [222, 184, 135],
      hard: [178, 34, 34],
      dangerous: [178, 34, 34],
    };
    const fordC = fordColors[difficulty] || fordColors.moderate;

    // Button labels use (N) parens, not [N]. Kaplay's styled-text parser
    // treats `[1]` as an unclosed style tag and throws. Matches landmark.js.
    const buttons = [
      { label: "(1) Ford River", color: fordC, key: "1", choice: "ford" },
      { label: "(2) Caulk & Float", color: [222, 184, 135], key: "2", choice: "caulk" },
      { label: `(3) Ferry ${engine.formatMoney(ferryCost)}`, color: [46, 139, 87], key: "3", choice: "ferry" },
    ];

    // Gray out ferry if not enough money
    const money = engine.supplies?.money || 0;
    if (money < ferryCost) {
      buttons[2].color = [100, 100, 100];
    }

    let selected = false;

    buttons.forEach((btn, i) => {
      const bx = startX + i * (btnW + btnGap);

      // Choose the crossing method. Shared by the key handler and the tap
      // handler so the game is reachable on a phone (no keyboard) — see
      // IMPROVEMENT_ROADMAP §1.1.
      const choose = () => {
        if (selected) return;
        if (btn.choice === "ferry" && money < ferryCost) return;
        selected = true;
        // juice fires on commit, not on the result — the splash reads as
        // "you're crossing now". The outcome gets its own beat below, once
        // the server answers.
        juice.minor();
        if (MOTION_OK) spawnSplash(wagonX, wagonY);
        engine.resolveRiver(btn.choice);
      };

      // k.area() makes the button rect clickable; k.onClick() on that obj
      // fires for both mouse and touch (kaplay maps touchstart → click).
      const bg = k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(btn.color[0], btn.color[1], btn.color[2]),
        k.opacity(0.85),
        k.area(),
        "riverChoice",
      ]);
      bg.onClick(choose);

      k.add([
        k.text(btn.label, { size: 14 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(255, 255, 255),
        "riverChoice",
      ]);

      k.onKeyPress(btn.key, choose);
    });

    // Crossing description panel
    const panelY = 110;
    k.add([
      k.rect(W - 40, 44, { radius: 4 }),
      k.pos(20, panelY),
      k.color(26, 26, 46),
      k.opacity(0.8),
      "riverPrompt",
    ]);

    const desc = river.description || "The river blocks your path. Choose how to cross.";
    k.add([
      k.text(desc, { size: 13, width: W - 80, align: "center" }),
      k.pos(W / 2, panelY + 22),
      k.anchor("center"),
      k.color(222, 184, 135),
      "riverPrompt",
    ]);

    // Error message display
    const errorObj = k.add([
      k.text("", { size: 14, width: W - 80 }),
      k.pos(W / 2, panelY + 60),
      k.anchor("center"),
      k.color(204, 68, 68),
    ]);

    // ── Result beat ──
    // resolveRiver() used to transition to TRAVEL the instant the server
    // answered, so a swamped wagon or a drowned member never painted a frame —
    // the crossing just cut to the trail. Nothing listened to riverResolved.
    // Now the scene stays mounted and shows what the crossing cost.
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

      const panelTop = panelY;
      k.add([k.rect(W - 60, 200, { radius: 6 }), k.pos(30, panelTop), k.color(26, 26, 46), k.opacity(0.92), k.z(50)]);
      k.add([
        k.text(METHOD_LINE[choice] || "The crossing is behind you.", { size: 16, width: W - 110, align: "center" }),
        k.pos(W / 2, panelTop + 26), k.anchor("center"), k.color(252, 227, 138), k.z(51),
      ]);
      k.add([
        k.text(narrative || "The party reached the far bank.", { size: 13, width: W - 110, align: "center" }),
        k.pos(W / 2, panelTop + 90), k.anchor("center"), k.color(222, 184, 135), k.z(51),
      ]);
      const deltaLine = engine.formatDeltas?.(deltas) || "";
      k.add([
        k.text(deltaLine || "No losses.", { size: 13, width: W - 110, align: "center" }),
        k.pos(W / 2, panelTop + 162), k.anchor("center"),
        k.color(...(deltaLine ? [212, 160, 23] : [46, 139, 87])), k.z(51),
      ]);

      const contW = 200, contH = 36, contX = (W - contW) / 2;
      const cont = k.add([
        k.rect(contW, contH, { radius: 4 }), k.pos(contX, btnY),
        k.color(46, 139, 87), k.opacity(0.9), k.area(), k.z(51),
      ]);
      k.add([
        k.text("Continue", { size: 14 }), k.pos(W / 2, btnY + contH / 2),
        k.anchor("center"), k.color(255, 255, 255), k.z(52),
      ]);
      const goOn = () => engine.continueFromResult();
      cont.onClick(goOn);
      k.onKeyPress("space", goOn);
      k.onKeyPress("enter", goOn);
    };
    engine.on('riverResolved', onResolved);

    // Error recovery — only before the crossing resolves; once the result beat
    // is up the choice buttons are gone and re-arming them would let a keypress
    // re-post a crossing that already happened.
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
