export default function register(k, engine) {
  k.scene("landmark", (data) => {
    const W = 640;
    const H = 480;
    const landmark = data || {};
    const name = landmark.name || "Unknown Landmark";
    const type = landmark.type || "natural";
    const desc = landmark.description || "You have reached a landmark on the trail.";
    const id = landmark.id || landmark.name || "unknown";

    // Draw background based on type
    drawBackground(k, type, W, H);

    // Landmark name at top
    k.add([
      k.rect(W, 44, { radius: 0 }),
      k.pos(0, 0),
      k.color(26, 26, 46),
      k.opacity(0.7),
    ]);
    k.add([
      k.text(name, { size: 26 }),
      k.pos(W / 2, 22),
      k.anchor("center"),
      k.color(252, 227, 138),
    ]);

    // Description panel at bottom
    const panelH = 90;
    const panelY = H - panelH - 60;
    k.add([
      k.rect(W - 40, panelH, { radius: 6 }),
      k.pos(20, panelY),
      k.color(26, 26, 46),
      k.opacity(0.75),
    ]);
    k.add([
      k.text(desc, { size: 14, width: W - 80 }),
      k.pos(W / 2, panelY + panelH / 2),
      k.anchor("center"),
      k.color(222, 184, 135),
    ]);

    // Action message area (shows results of rest/trade/talk)
    const msgObj = k.add([
      k.text("", { size: 13, width: W - 80 }),
      k.pos(W / 2, panelY - 20),
      k.anchor("center"),
      k.color(255, 255, 255),
    ]);

    // Listen for landmark action results
    const onResult = (result) => {
      msgObj.text = result.message || "Done.";
    };
    engine.on("landmarkActionResult", onResult);
    k.onSceneLeave(() => engine.off("landmarkActionResult", onResult));

    // Buttons
    const isFortOrSettlement = type === "fort" || type === "settlement";
    const hasSupplies = engine.supplies && Object.keys(engine.supplies).length > 0;

    const actions = [];
    if (isFortOrSettlement) {
      actions.push({ label: "[1] Rest", key: "1", action: "rest" });
    }
    if (hasSupplies) {
      actions.push({ label: "[2] Trade", key: "2", action: "trade" });
    }
    if (isFortOrSettlement) {
      actions.push({ label: "[3] Talk", key: "3", action: "talk" });
    }
    actions.push({ label: "[4] Continue", key: "4", action: "continue" });

    const btnW = 130;
    const btnH = 32;
    const btnGap = 10;
    const totalBtnW = actions.length * btnW + (actions.length - 1) * btnGap;
    const startX = (W - totalBtnW) / 2;
    const btnY = H - 48;

    let acted = false;

    actions.forEach((btn, i) => {
      const bx = startX + i * (btnW + btnGap);
      const btnColor = btn.action === "continue" ? [85, 107, 47] : [46, 139, 87];

      k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(btnColor[0], btnColor[1], btnColor[2]),
        k.opacity(0.85),
      ]);
      k.add([
        k.text(btn.label, { size: 13 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(255, 255, 255),
      ]);

      k.onKeyPress(btn.key, () => {
        if (btn.action === "continue") {
          engine.resolveLandmark("continue");
          return;
        }
        if (btn.action === "rest") {
          engine.resolveLandmark("rest");
          return;
        }
        if (btn.action === "trade") {
          // Show HTML overlay for trading
          engine.emit("showTradeOverlay", { landmarkId: id });
          return;
        }
        if (btn.action === "talk") {
          engine.emit("showTalkOverlay", { landmarkId: id });
          return;
        }
      });
    });
  });
}

function drawBackground(k, type, W, H) {
  switch (type) {
    case "fort":
      drawFort(k, W, H);
      break;
    case "natural":
      drawNatural(k, W, H);
      break;
    case "settlement":
      drawSettlement(k, W, H);
      break;
    case "destination":
      drawDestination(k, W, H);
      break;
    default:
      drawNatural(k, W, H);
  }
}

function drawFort(k, W, H) {
  // Sky
  k.add([k.rect(W, 200), k.pos(0, 0), k.color(22, 33, 62)]);
  // Ground
  k.add([k.rect(W, 280), k.pos(0, 200), k.color(85, 107, 47)]);

  // Palisade wall
  const wallY = 120;
  const wallH = 140;
  k.add([k.rect(360, wallH), k.pos(140, wallY), k.color(139, 69, 19)]);

  // Palisade posts (vertical lines)
  for (let i = 0; i < 18; i++) {
    k.add([
      k.rect(4, wallH + 16),
      k.pos(148 + i * 20, wallY - 8),
      k.color(120, 55, 10),
    ]);
  }

  // Gate
  k.add([k.rect(40, 70), k.pos(300, wallY + wallH - 70), k.color(80, 40, 10)]);
  k.add([k.rect(36, 66), k.pos(302, wallY + wallH - 68), k.color(60, 30, 8)]);

  // Watch towers
  for (const tx of [148, 488]) {
    k.add([k.rect(20, 30), k.pos(tx - 2, wallY - 30), k.color(120, 55, 10)]);
    k.add([k.rect(28, 6), k.pos(tx - 6, wallY - 34), k.color(100, 45, 8)]);
  }
}

function drawNatural(k, W, H) {
  // Sky
  k.add([k.rect(W, 240), k.pos(0, 0), k.color(22, 33, 62)]);
  // Ground
  k.add([k.rect(W, 240), k.pos(0, 240), k.color(85, 107, 47)]);

  // Rock spire
  const cx = W / 2;
  const spireW = 60;
  const spireH = 180;
  const baseY = 260;

  // Main spire (tall rect tapering effect with stacked rects)
  for (let i = 0; i < 8; i++) {
    const w = spireW - i * 5;
    const h = 24;
    const y = baseY - i * 22;
    k.add([
      k.rect(w, h),
      k.pos(cx - w / 2, y),
      k.color(160 - i * 8, 82 - i * 4, 45 - i * 2),
    ]);
  }

  // Smaller rock formations
  for (const ox of [-120, 140]) {
    for (let i = 0; i < 4; i++) {
      const w = 30 - i * 4;
      k.add([
        k.rect(w, 18),
        k.pos(cx + ox - w / 2, 280 - i * 16),
        k.color(140 - i * 10, 72 - i * 5, 40),
      ]);
    }
  }
}

function drawSettlement(k, W, H) {
  // Sky
  k.add([k.rect(W, 200), k.pos(0, 0), k.color(22, 33, 62)]);
  // Ground
  k.add([k.rect(W, 280), k.pos(0, 200), k.color(85, 107, 47)]);

  // Buildings
  const buildings = [
    { x: 100, w: 80, h: 70, roofH: 20 },
    { x: 220, w: 100, h: 90, roofH: 25 },
    { x: 360, w: 70, h: 60, roofH: 18 },
    { x: 460, w: 90, h: 75, roofH: 22 },
  ];

  for (const b of buildings) {
    const by = 260 - b.h;
    // Wall
    k.add([k.rect(b.w, b.h), k.pos(b.x, by), k.color(160, 82, 45)]);
    // Roof
    k.add([k.rect(b.w + 10, b.roofH), k.pos(b.x - 5, by - b.roofH), k.color(120, 55, 10)]);
    // Door
    k.add([k.rect(14, 24), k.pos(b.x + b.w / 2 - 7, by + b.h - 24), k.color(80, 30, 8)]);
    // Window
    k.add([k.rect(12, 12), k.pos(b.x + 12, by + 15), k.color(252, 227, 138), k.opacity(0.6)]);
  }
}

function drawDestination(k, W, H) {
  // Sky
  k.add([k.rect(W, 180), k.pos(0, 0), k.color(22, 33, 62)]);
  // Valley (green)
  k.add([k.rect(W, 300), k.pos(0, 180), k.color(46, 139, 87)]);

  // Mountains (blue triangles as layered rects)
  const peaks = [
    { cx: 120, h: 140, w: 160 },
    { cx: 320, h: 180, w: 200 },
    { cx: 520, h: 150, w: 170 },
  ];

  for (const p of peaks) {
    const baseY = 200;
    const layers = 10;
    for (let i = 0; i < layers; i++) {
      const frac = i / layers;
      const lw = p.w * (1 - frac * 0.8);
      const ly = baseY - p.h * (1 - frac);
      const lh = p.h / layers + 2;
      const blue = 100 + Math.floor(frac * 60);
      k.add([
        k.rect(lw, lh),
        k.pos(p.cx - lw / 2, ly),
        k.color(40, 60, blue),
      ]);
    }
    // Snow cap
    const capW = p.w * 0.15;
    k.add([
      k.rect(capW, 8),
      k.pos(p.cx - capW / 2, baseY - p.h),
      k.color(255, 255, 255),
    ]);
  }
}
