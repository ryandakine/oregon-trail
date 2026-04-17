export default function register(k, engine) {
  k.scene("river", (data) => {
    const W = 640;
    const H = 480;
    const river = data || {};
    const name = river.name || "Unknown River";
    const width = river.width_ft || river.width || "medium";
    const depth = river.depth_ft_summer || river.depth_ft_spring || river.depth || "medium";
    const difficulty = river.ford_difficulty || river.difficulty || "moderate";
    const ferryCost = river.ferry_cost_1848_dollars || river.ferry_cost || 500;

    // Sky
    k.add([k.rect(W, 180), k.pos(0, 0), k.color(22, 33, 62)]);

    // Riverbanks (brown)
    k.add([k.rect(W, 40), k.pos(0, 160), k.color(139, 69, 19)]);
    k.add([k.rect(W, 60), k.pos(0, 380), k.color(139, 69, 19)]);

    // Animated water area
    const waterY = 200;
    const waterH = 180;
    k.add([k.rect(W, waterH), k.pos(0, waterY), k.color(30, 80, 160)]);

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

    const buttons = [
      { label: "[1] Ford River", color: fordC, key: "1", choice: "ford" },
      { label: "[2] Caulk & Float", color: [222, 184, 135], key: "2", choice: "caulk" },
      { label: `[3] Ferry ${engine.formatMoney(ferryCost)}`, color: [46, 139, 87], key: "3", choice: "ferry" },
    ];

    // Gray out ferry if not enough money
    const money = engine.supplies?.money || 0;
    if (money < ferryCost) {
      buttons[2].color = [100, 100, 100];
    }

    let selected = false;

    buttons.forEach((btn, i) => {
      const bx = startX + i * (btnW + btnGap);

      k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(btn.color[0], btn.color[1], btn.color[2]),
        k.opacity(0.85),
      ]);

      k.add([
        k.text(btn.label, { size: 14 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(255, 255, 255),
      ]);

      k.onKeyPress(btn.key, () => {
        if (selected) return;
        if (btn.choice === "ferry" && money < ferryCost) return;
        selected = true;
        engine.resolveRiver(btn.choice);
      });
    });

    // Crossing description panel
    const panelY = 110;
    k.add([
      k.rect(W - 40, 44, { radius: 4 }),
      k.pos(20, panelY),
      k.color(26, 26, 46),
      k.opacity(0.8),
    ]);

    const desc = river.description || "The river blocks your path. Choose how to cross.";
    k.add([
      k.text(desc, { size: 13, width: W - 80 }),
      k.pos(W / 2, panelY + 22),
      k.anchor("center"),
      k.color(222, 184, 135),
    ]);

    // Error message display
    const errorObj = k.add([
      k.text("", { size: 14, width: W - 80 }),
      k.pos(W / 2, panelY + 60),
      k.anchor("center"),
      k.color(204, 68, 68),
    ]);

    // Error recovery
    const onError = ({ message }) => {
      selected = false; // Re-enable buttons
      errorObj.text = message || 'Crossing failed. Try again.';
    };
    engine.on('error', onError);
    k.onSceneLeave(() => engine.off('error', onError));
  });
}
