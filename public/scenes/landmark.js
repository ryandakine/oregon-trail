import { addTopHud, addBottomHud } from "../lib/hud.mjs";
import { createJuice } from "../lib/juice.mjs";
import { drawSky, drawGround, drawMountains, drawHills, PALETTE, drawGlow, segmentColor } from "../lib/draw.mjs";
import { segmentForMiles } from "../lib/segments.mjs";

export default function register(k, engine) {
  k.scene("landmark", (data) => {
    // Arrival at a named landmark is a "big moment" beat — the one place the
    // camera zoom-punch is reserved for (research § B3 restraint rules).
    createJuice(k).zoomPunch();
    const W = 640;
    const H = 480;
    const landmark = data || {};
    const name = landmark.name || "Unknown Landmark";
    const type = landmark.type || "natural";
    const desc = landmark.description || "You have reached a landmark on the trail.";
    const id = landmark.id || landmark.name || "unknown";
    const btnY = H - 88;   // cleared bottom HUD panel at y=440

    // Environment & background
    const tone = engine.tone ?? "medium";
    const dayPhase = engine.dayPhase || getDayPhase(engine.currentDate);
    const miles = engine.milesTraveled ?? 0;
    const segment = segmentForMiles(miles);
    const env = { segment, tone, dayPhase, landmark };

    // Draw background based on type
    drawBackground(k, type, W, H, env);

    // Landmark name — pushed down to make room for top HUD (36px band)
    k.add([
      k.rect(W, 38, { radius: 0 }),
      k.pos(0, 36),
      k.color(...PALETTE.silhouetteNear),
      k.opacity(0.85),
    ]);
    k.add([
      k.text(name, { size: 26 }),
      k.pos(W / 2, 36 + 19),
      k.anchor("center"),
      k.color(...PALETTE.goldBright),
    ]);
    const nameBandBottom = 36 + 38;

    addTopHud(k, engine);
    addBottomHud(k, engine);

    // Description panel — sized to the actual text so a long AI-generated
    // description can't run under the action buttons (M-landmark-2donly).
    // Anchored to the button row's top and grown upward as needed.
    const descBottomLimit = btnY - 8;
    const descTopLimit = nameBandBottom + 30;
    const maxAllowedH = Math.max(70, descBottomLimit - descTopLimit);

    // Guard against long AI descriptions spilling past the panel into the action buttons:
    // Step down to size 12, then truncate with ellipsis if it still exceeds maxAllowedH.
    let textSize = 14;
    let displayText = desc;
    let measured = k.formatText({ text: displayText, size: textSize, width: W - 80 });
    if (measured.height + 24 > maxAllowedH) {
      textSize = 12;
      measured = k.formatText({ text: displayText, size: textSize, width: W - 80 });
    }
    if (measured.height + 24 > maxAllowedH) {
      const words = desc.split(" ");
      while (words.length > 4 && measured.height + 24 > maxAllowedH) {
        words.pop();
        displayText = words.join(" ") + "…";
        measured = k.formatText({ text: displayText, size: textSize, width: W - 80 });
      }
    }

    const panelH = Math.min(Math.max(90, measured.height + 24), maxAllowedH);
    const panelY = descBottomLimit - panelH;
    k.add([
      k.rect(W - 40, panelH, { radius: 6 }),
      k.pos(20, panelY),
      k.color(...PALETTE.silhouetteNear),
      k.opacity(0.85),
    ]);
    k.add([
      k.text(displayText, { size: textSize, width: W - 80 }),
      k.pos(W / 2, panelY + panelH / 2),
      k.anchor("center"),
      k.color(...PALETTE.parchment),
    ]);

    // Action message area (shows results of rest/trade/talk)
    const msgObj = k.add([
      k.text("", { size: 13, width: W - 80 }),
      k.pos(W / 2, panelY - 20),
      k.anchor("center"),
      k.color(...PALETTE.cloud),
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
      actions.push({ label: "(1) Rest", key: "1", action: "rest" });
    }
    if (hasSupplies) {
      actions.push({ label: "(2) Trade", key: "2", action: "trade" });
    }
    if (isFortOrSettlement) {
      actions.push({ label: "(3) Talk", key: "3", action: "talk" });
    }
    // Hunt entry (IMPROVEMENT_ROADMAP §1.3). Returns to TRAVEL then opens the
    // HUNTING scene via engine.requestHuntFromLandmark().
    actions.push({ label: "(H) Hunt", key: "h", action: "hunt" });
    actions.push({ label: "(4) Continue", key: "4", action: "continue" });

    const btnGap = 8;
    // Shrink button width so 5 actions (Rest/Trade/Talk/Hunt/Continue) fit the
    // 640px frame; 130px each would overflow once Hunt was added (§1.3).
    const btnW = Math.min(130, Math.floor((W - 24 - (actions.length - 1) * btnGap) / actions.length));
    const btnH = 32;
    const totalBtnW = actions.length * btnW + (actions.length - 1) * btnGap;
    const startX = (W - totalBtnW) / 2;

    let acted = false;
    const btnObjs = [];

    actions.forEach((btn, i) => {
      const bx = startX + i * (btnW + btnGap);
      const btnColor = btn.action === "continue" ? PALETTE.hillMid : PALETTE.hpGreen;

      // Shared by key + tap so the landmark is reachable without a keyboard
      // (IMPROVEMENT_ROADMAP §1.1/§1.3).
      const choose = () => {
        if (btn.action === "continue") {
          engine.resolveLandmark("continue");
          return;
        }
        if (btn.action === "rest") {
          engine.resolveLandmark("rest");
          return;
        }
        if (btn.action === "trade") {
          showTradeOverlay(landmark, engine);
          return;
        }
        if (btn.action === "talk") {
          showTalkOverlay(landmark, engine);
          return;
        }
        if (btn.action === "hunt") {
          engine.track?.('hunt_started', { from: 'landmark' });
          engine.requestHuntFromLandmark();
          return;
        }
      };

      const bg = k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(...btnColor),
        k.opacity(0.85),
        k.area(),
      ]);
      bg.onClick(choose);
      const txt = k.add([
        k.text(btn.label, { size: 13 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(...PALETTE.cloud),
      ]);
      btnObjs.push({ bg, txt });

      k.onKeyPress(btn.key, choose);
    });

    // Error recovery
    const onError = ({ message }) => {
      // Re-enable buttons
      for (const b of btnObjs) {
        b.bg.opacity = 0.85;
      }
      msgObj.text = message || 'Something went wrong. Try again.';
    };
    engine.on('error', onError);
    k.onSceneLeave(() => engine.off('error', onError));
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

const NPC_DIALOGUE = [
  "Watch out for cholera at the river crossings. Boil your water.",
  "I heard the Platte River is running high this season.",
  "My neighbor lost three oxen to a rattlesnake. Keep your eyes open.",
  "If you're headed to Oregon City, stock up on spare parts here.",
  "The trail gets rough past Chimney Rock. Rest your party while you can.",
  "A good hunter can feed a whole party. Don't skimp on ammunition.",
  "I traded with some friendly Shoshone last week. Good people.",
  "The Blue Mountains are no joke. Make sure your wagon's in good shape.",
  "My advice? Keep a steady pace. Rushing gets people killed.",
  "Weather's been unpredictable this year. Pack extra clothing.",
];

function showTradeOverlay(landmark, engine) {
  const overlay = document.getElementById('html-overlay');
  const content = overlay.querySelector('.overlay-content') || overlay;
  const items = landmark.trade_inventory || [];

  let html = `<h2>${escHtml(landmark.name || 'Trading Post')}</h2>`;
  if (items.length === 0) {
    html += `<p>No goods available for trade at this time.</p>`;
  } else {
    html += `<div style="margin:1rem 0;">`;
    items.forEach((item, i) => {
      const name = escHtml(item.name || item.item || 'Unknown');
      const cost = item.cost || item.price || 0;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;margin-bottom:0.4rem;background:rgba(30,20,10,0.5);border:1px solid #5a3510;border-radius:4px;">
        <span>${name}</span>
        <button class="trade-buy-btn overlay-choice" data-idx="${i}" style="padding:0.4rem 0.8rem;">Buy ($${(cost / 100).toFixed(2)})</button>
      </div>`;
    });
    html += `</div>`;
  }
  html += `<button id="trade-close" class="overlay-choice" style="margin-top:1rem;padding:0.6rem 1.2rem;">Close</button>`;
  content.innerHTML = html;
  overlay.classList.add('active');

  content.querySelectorAll('.trade-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const item = items[idx];
      if (item && engine.purchaseSupplies) {
        engine.purchaseSupplies([{ item: item.item || item.name, quantity: 1 }]);
        btn.textContent = 'Bought!';
        btn.disabled = true;
      }
    });
  });

  document.getElementById('trade-close').addEventListener('click', () => {
    overlay.classList.remove('active');
  });
}

function showTalkOverlay(landmark, engine) {
  const overlay = document.getElementById('html-overlay');
  const content = overlay.querySelector('.overlay-content') || overlay;
  const dialogue = NPC_DIALOGUE[Math.floor(Math.random() * NPC_DIALOGUE.length)];

  let html = `<h2>${escHtml(landmark.name || 'Conversation')}</h2>`;
  html += `<p style="font-style:italic;margin:1rem 0;">"${escHtml(dialogue)}"</p>`;
  html += `<p style="font-size:0.85em;opacity:0.7;">— A fellow traveler</p>`;
  html += `<button id="talk-close" class="overlay-choice" style="margin-top:1rem;padding:0.6rem 1.2rem;">Continue</button>`;
  content.innerHTML = html;
  overlay.classList.add('active');

  document.getElementById('talk-close').addEventListener('click', () => {
    overlay.classList.remove('active');
  });
}

function getDayPhase(dateStr) {
  if (!dateStr) return "day";
  const d = new Date(dateStr + "T00:00:00");
  return ["dawn", "day", "day", "dusk"][d.getDate() % 4];
}

function drawBackground(k, type, W, H, env) {
  switch (type) {
    case "fort":
      drawFort(k, W, H, env);
      break;
    case "natural":
      drawNatural(k, W, H, env);
      break;
    case "settlement":
      drawSettlement(k, W, H, env);
      break;
    case "destination":
      drawDestination(k, W, H, env);
      break;
    default:
      drawNatural(k, W, H, env);
  }
}

function drawFort(k, W, H, env) {
  const { segment, tone, dayPhase } = env;

  // Segment-aware sky, distant mountains, foothills, and terrain
  drawSky(k, tone, dayPhase, { segment });
  // Continuous horizon band to prevent 80px horizon tear between sky (0..180) and ground (260..480)
  const horizonCol = segmentColor(segment, "horizon", PALETTE.skyPale) || PALETTE.skyPale;
  k.add([k.rect(W, 85), k.pos(0, 180), k.color(...horizonCol)]);

  drawMountains(k, { segment });
  drawHills(k, { segment });
  drawGround(k, { tone, segment });

  // Center visual mass in y = 80..250 (visible above UI panels)
  const baseY = 250;

  // Palisade walls (left and right of central gatehouse)
  const drawPalisadeSection = (startX, endX) => {
    const count = Math.floor((endX - startX) / 10);
    k.add([
      k.rect(endX - startX, 52),
      k.pos(startX, baseY - 52),
      k.color(...PALETTE.woodDark),
      k.opacity(0.8),
    ]);

    // Vertical pointed timber logs with wood textures
    for (let i = 0; i < count; i++) {
      const lx = startX + i * 10;
      const logH = 56 + (i % 3) * 4;
      const logY = baseY - logH;
      const col = i % 2 === 0 ? PALETTE.wood : PALETTE.woodDark;
      k.add([k.rect(8, logH), k.pos(lx, logY), k.color(...col)]);
      k.add([
        k.polygon([k.vec2(0, 0), k.vec2(4, -5), k.vec2(8, 0)]),
        k.pos(lx, logY),
        k.color(...col),
      ]);
      k.add([
        k.rect(1.5, logH - 4),
        k.pos(lx + 6, logY + 2),
        k.color(...PALETTE.outline),
        k.opacity(0.35),
      ]);
    }

    // Heavy horizontal reinforcement stringers (crossbeams)
    for (const sy of [baseY - 40, baseY - 16]) {
      k.add([
        k.rect(endX - startX + 4, 5),
        k.pos(startX - 2, sy),
        k.color(...PALETTE.woodDark),
      ]);
      for (let i = 0; i < count; i += 2) {
        k.add([
          k.circle(1.5),
          k.pos(startX + i * 10 + 4, sy + 2.5),
          k.color(...PALETTE.outline),
        ]);
      }
    }
  };

  // Left and right palisade sections
  drawPalisadeSection(95, 255);
  drawPalisadeSection(385, 545);

  // Watchtowers (flanking blockhouses)
  const drawWatchtower = (tx, withFlag = false) => {
    const tw = 46;
    const th = 96;
    const ty = baseY - th;

    // Tower base blockhouse (horizontal logs)
    k.add([k.rect(tw, th - 18), k.pos(tx, ty + 18), k.color(...PALETTE.woodDark)]);
    for (let y = ty + 18; y < baseY; y += 7) {
      k.add([k.rect(tw, 6), k.pos(tx, y), k.color(...PALETTE.wood)]);
      k.add([k.rect(tw, 1), k.pos(tx, y + 6), k.color(...PALETTE.woodDark)]);
    }

    // Overhanging watch platform / guard deck
    k.add([k.rect(tw + 14, 22), k.pos(tx - 7, ty), k.color(...PALETTE.woodDark)]);
    k.add([k.rect(tw + 10, 18), k.pos(tx - 5, ty + 2), k.color(...PALETTE.wood)]);

    // Musket / lookout embrasures
    k.add([k.rect(5, 8), k.pos(tx + 6, ty + 5), k.color(...PALETTE.outline)]);
    k.add([k.rect(5, 8), k.pos(tx + tw - 11, ty + 5), k.color(...PALETTE.outline)]);

    // Pitched timber roof
    k.add([
      k.polygon([
        k.vec2(-tw / 2 - 10, 0),
        k.vec2(0, -16),
        k.vec2(tw / 2 + 10, 0),
      ]),
      k.pos(tx + tw / 2, ty),
      k.color(...PALETTE.woodDark),
      k.outline(1.5, k.rgb(...PALETTE.outline)),
    ]);

    if (withFlag) {
      k.add([k.rect(2, 24), k.pos(tx + tw / 2 - 1, ty - 38), k.color(...PALETTE.woodDark)]);
      k.add([
        k.polygon([k.vec2(0, 0), k.vec2(14, 4), k.vec2(0, 8)]),
        k.pos(tx + tw / 2 + 1, ty - 38),
        k.color(...PALETTE.cloudShadow),
      ]);
    }
  };

  drawWatchtower(55, true);
  drawWatchtower(540, false);

  // Central Timber Gatehouse
  const gw = 130;
  const gh = 104;
  const gx = 255;
  const gy = baseY - gh;

  // Gatehouse main body (stacked logs)
  k.add([k.rect(gw, gh), k.pos(gx, gy), k.color(...PALETTE.woodDark)]);
  for (let y = gy; y < baseY; y += 7) {
    k.add([k.rect(gw - 4, 6), k.pos(gx + 2, y), k.color(...PALETTE.wood)]);
    k.add([k.rect(4, 6), k.pos(gx - 3, y), k.color(...PALETTE.woodDark)]);
    k.add([k.rect(4, 6), k.pos(gx + gw - 1, y), k.color(...PALETTE.woodDark)]);
  }

  // Upper battlement parapet & roof
  k.add([k.rect(gw + 12, 12), k.pos(gx - 6, gy - 6), k.color(...PALETTE.woodDark)]);
  for (let i = 0; i < 13; i++) {
    k.add([
      k.polygon([k.vec2(0, 0), k.vec2(4, -6), k.vec2(8, 0)]),
      k.pos(gx - 2 + i * 10, gy - 6),
      k.color(...PALETTE.wood),
    ]);
  }

  // Heavy Arched Gateway
  const gateW = 56;
  const gateH = 60;
  const gateX = gx + (gw - gateW) / 2;
  const gateY = baseY - gateH;

  k.add([k.rect(gateW, gateH), k.pos(gateX, gateY), k.color(...PALETTE.black)]);

  // Heavy timber double doors
  const doorW = gateW / 2 - 2;
  k.add([k.rect(doorW, gateH - 2), k.pos(gateX + 1, gateY + 2), k.color(...PALETTE.woodDark)]);
  k.add([k.rect(doorW, gateH - 2), k.pos(gateX + doorW + 3, gateY + 2), k.color(...PALETTE.woodDark)]);
  k.add([k.rect(doorW - 4, 3), k.pos(gateX + 3, gateY + 14), k.color(...PALETTE.wood)]);
  k.add([k.rect(doorW - 4, 3), k.pos(gateX + 3, gateY + gateH - 16), k.color(...PALETTE.wood)]);
  k.add([k.rect(doorW - 4, 3), k.pos(gateX + doorW + 5, gateY + 14), k.color(...PALETTE.wood)]);
  k.add([k.rect(doorW - 4, 3), k.pos(gateX + doorW + 5, gateY + gateH - 16), k.color(...PALETTE.wood)]);

  k.add([k.rect(gateW + 14, 7), k.pos(gateX - 7, gateY - 5), k.color(...PALETTE.woodDark)]);

  // Lantern over gate with warm glow
  drawGlow(k, k, gx + gw / 2, gateY - 12, 14, PALETTE.gold, { rings: 4, opacity: 0.4 });
  k.add([k.rect(6, 7, { radius: 1 }), k.pos(gx + gw / 2 - 3, gateY - 15), k.color(...PALETTE.goldBright)]);

  // Parked pioneer wagon silhouette in the foreground courtyard
  const wx = 445;
  const wy = baseY + 2;
  k.add([
    k.rect(80, 5, { radius: 2 }),
    k.pos(wx - 40, wy + 14),
    k.color(...PALETTE.outline),
    k.opacity(0.3),
  ]);
  k.add([
    k.rect(34, 3),
    k.pos(wx - 38, wy + 10),
    k.color(...PALETTE.woodDark),
    k.rotate(14),
  ]);
  k.add([
    k.rect(60, 15, { radius: 2 }),
    k.pos(wx - 30, wy - 3),
    k.color(...PALETTE.woodDark),
  ]);
  k.add([
    k.rect(56, 2),
    k.pos(wx - 28, wy - 1),
    k.color(...PALETTE.wood),
  ]);
  k.add([
    k.rect(62, 24, { radius: [12, 12, 2, 2] }),
    k.pos(wx - 31, wy - 25),
    k.color(...PALETTE.canvasShadow),
    k.outline(1.5, k.rgb(...PALETTE.outline)),
  ]);
  for (let i = 0; i < 4; i++) {
    k.add([
      k.rect(1.5, 22),
      k.pos(wx - 23 + i * 15, wy - 24),
      k.color(...PALETTE.outline),
      k.opacity(0.35),
    ]);
  }
  const drawWheel = (cx, cy, r) => {
    k.add([k.circle(r), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center")]);
    k.add([k.circle(r - 2), k.pos(cx, cy), k.color(...PALETTE.woodDark), k.anchor("center")]);
    for (let a = 0; a < 4; a++) {
      k.add([
        k.rect(2, (r - 2) * 2),
        k.pos(cx, cy),
        k.color(...PALETTE.outline),
        k.rotate(a * 45),
        k.anchor("center"),
      ]);
    }
    k.add([k.circle(3), k.pos(cx, cy), k.color(...PALETTE.outline), k.anchor("center")]);
  };
  drawWheel(wx + 16, wy + 7, 13);
  drawWheel(wx - 16, wy + 8, 10);
}

function drawNatural(k, W, H, env) {
  const { segment, tone, dayPhase, landmark } = env;

  // Segment-aware sky, distant mountains, foothills, and terrain
  drawSky(k, tone, dayPhase, { segment });
  const horizonCol = segmentColor(segment, "horizon", PALETTE.skyPale) || PALETTE.skyPale;
  k.add([k.rect(W, 85), k.pos(0, 180), k.color(...horizonCol)]);

  drawMountains(k, { segment });
  drawHills(k, { segment });
  drawGround(k, { tone, segment });

  const name = (landmark?.name || "").toLowerCase();
  const isIndependence = name.includes("independence");
  // Center visual mass in y = 80..250
  const baseY = 250;

  if (isIndependence) {
    // Independence Rock: massive rounded granite monolith
    const cx = W / 2;
    const domeW = 340;
    const domeH = 105;
    const domeY = baseY - domeH;

    k.add([
      k.rect(domeW, domeH, { radius: [domeW / 2, domeW / 2, 0, 0] }),
      k.pos(cx - domeW / 2, domeY),
      k.color(...PALETTE.stone),
      k.outline(2, k.rgb(...PALETTE.outline)),
    ]);

    const strataColors = [PALETTE.stoneLight, PALETTE.bluffOchre, PALETTE.stone, PALETTE.dirtLight];
    for (let i = 1; i <= 6; i++) {
      const sw = domeW - i * 40;
      const sh = domeH - i * 15;
      const col = strataColors[i % strataColors.length];
      k.add([
        k.rect(sw, sh, { radius: [sw / 2, sw / 2, 0, 0] }),
        k.pos(cx - sw / 2, baseY - sh),
        k.color(...col),
        k.opacity(0.35),
      ]);
    }

    k.add([
      k.rect(domeW / 2, domeH, { radius: [0, domeW / 2, 0, 0] }),
      k.pos(cx, domeY),
      k.color(...PALETTE.outline),
      k.opacity(0.25),
    ]);

    for (let i = 0; i < 14; i++) {
      const hx = cx + 20 + (i % 6) * 22;
      const hy = domeY + 20 + Math.floor(i / 6) * 26;
      k.add([
        k.rect(18, 1.5),
        k.pos(hx, hy),
        k.color(...PALETTE.outline),
        k.rotate(-35),
        k.opacity(0.35),
      ]);
    }
  } else {
    // Chimney Rock / Stylized Rock Spire Formation
    const cx = W / 2;

    // 1. Flanking sedimentary bluffs / buttes
    const lbw = 105;
    const lbh = 50;
    const lbx = 80;
    const lby = baseY - lbh;
    k.add([
      k.rect(lbw, lbh, { radius: [6, 6, 0, 0] }),
      k.pos(lbx, lby),
      k.color(...PALETTE.bluffOchre),
      k.outline(2, k.rgb(...PALETTE.outline)),
    ]);
    for (let i = 0; i < 5; i++) {
      const col = i % 2 === 0 ? PALETTE.dirtLight : PALETTE.straw;
      k.add([
        k.rect(lbw - 4, 7),
        k.pos(lbx + 2, lby + 6 + i * 8),
        k.color(...col),
        k.opacity(0.6),
      ]);
    }
    k.add([
      k.rect(lbw * 0.45, lbh),
      k.pos(lbx + lbw * 0.55, lby),
      k.color(...PALETTE.outline),
      k.opacity(0.25),
    ]);

    const rbw = 115;
    const rbh = 38;
    const rbx = 475;
    const rby = baseY - rbh;
    k.add([
      k.rect(rbw, rbh, { radius: [8, 8, 0, 0] }),
      k.pos(rbx, rby),
      k.color(...PALETTE.bluffOchre),
      k.outline(2, k.rgb(...PALETTE.outline)),
    ]);
    for (let i = 0; i < 4; i++) {
      k.add([
        k.rect(rbw - 4, 6),
        k.pos(rbx + 2, rby + 5 + i * 7),
        k.color(...(i % 2 === 0 ? PALETTE.straw : PALETTE.dirtMid)),
        k.opacity(0.5),
      ]);
    }

    // 2. Conical Talus Base
    const coneBaseW = 230;
    const coneTopW = 56;
    const coneH = 75;
    const coneTopY = baseY - coneH;

    const strataLayers = 10;
    const strataPalette = [
      PALETTE.bluffOchre,
      PALETTE.dirtLight,
      PALETTE.straw,
      PALETTE.dirtMid,
      PALETTE.stone,
      PALETTE.stoneLight,
      PALETTE.bluffOchre,
      PALETTE.dirtDark,
      PALETTE.straw,
      PALETTE.dirtLight,
    ];

    for (let i = 0; i < strataLayers; i++) {
      const frac = i / strataLayers;
      const layerW = coneBaseW - frac * (coneBaseW - coneTopW);
      const layerH = coneH / strataLayers + 1.5;
      const layerY = baseY - (i + 1) * (coneH / strataLayers);
      const col = strataPalette[i % strataPalette.length];

      k.add([
        k.rect(layerW, layerH),
        k.pos(cx - layerW / 2, layerY),
        k.color(...col),
        k.outline(1, k.rgb(...PALETTE.outline)),
      ]);

      k.add([
        k.rect(layerW / 2, layerH),
        k.pos(cx, layerY),
        k.color(...PALETTE.outline),
        k.opacity(0.28),
      ]);
    }

    // 3. Tall Slender Spire (rising from coneTopY=175 up to y=88)
    const spireH = 87;
    const spireTopY = coneTopY - spireH;
    const spireBaseW = 32;
    const spireTopW = 18;
    const spireStrata = 9;

    for (let i = 0; i < spireStrata; i++) {
      const frac = i / spireStrata;
      const sw = spireBaseW - frac * (spireBaseW - spireTopW);
      const sh = spireH / spireStrata + 1.5;
      const sy = coneTopY - (i + 1) * (spireH / spireStrata);
      const col = strataPalette[(i + 3) % strataPalette.length];

      k.add([
        k.rect(sw, sh),
        k.pos(cx - sw / 2, sy),
        k.color(...col),
        k.outline(1.5, k.rgb(...PALETTE.outline)),
      ]);

      k.add([
        k.rect(sw / 2, sh),
        k.pos(cx, sy),
        k.color(...PALETTE.outline),
        k.opacity(0.32),
      ]);
    }

    k.add([
      k.rect(spireTopW + 4, 5, { radius: 1 }),
      k.pos(cx - (spireTopW + 4) / 2, spireTopY - 3),
      k.color(...PALETTE.stone),
      k.outline(1.5, k.rgb(...PALETTE.outline)),
    ]);

    // 4. Shadow-side hatching (diagonal ink strokes)
    for (let i = 0; i < 7; i++) {
      const hy = spireTopY + 8 + i * 11;
      k.add([
        k.rect(11, 1.5),
        k.pos(cx + 5, hy),
        k.color(...PALETTE.outline),
        k.rotate(-35),
        k.opacity(0.4),
      ]);
    }
    for (let i = 0; i < 12; i++) {
      const hx = cx + 12 + (i % 4) * 20;
      const hy = coneTopY + 6 + Math.floor(i / 4) * 20;
      k.add([
        k.rect(16, 1.5),
        k.pos(hx, hy),
        k.color(...PALETTE.outline),
        k.rotate(-35),
        k.opacity(0.35),
      ]);
    }
  }
}

function drawSettlement(k, W, H, env) {
  const { segment, tone, dayPhase } = env;

  // Segment-aware sky, distant mountains, foothills, and terrain
  drawSky(k, tone, dayPhase, { segment });
  const horizonCol = segmentColor(segment, "horizon", PALETTE.skyPale) || PALETTE.skyPale;
  k.add([k.rect(W, 85), k.pos(0, 180), k.color(...horizonCol)]);

  drawMountains(k, { segment });
  drawHills(k, { segment });
  drawGround(k, { tone, segment });

  // Center visual mass in y = 80..250
  const baseY = 250;

  // Helper: draw curling woodsmoke plume from a chimney
  const drawSmokePlume = (startX, startY) => {
    const puffs = [
      { dx: 0, dy: -6, r: 4, op: 0.45 },
      { dx: 3, dy: -17, r: 7, op: 0.38 },
      { dx: 7, dy: -32, r: 10, op: 0.30 },
      { dx: 14, dy: -48, r: 14, op: 0.22 },
      { dx: 24, dy: -66, r: 18, op: 0.14 },
    ];
    for (const p of puffs) {
      k.add([
        k.circle(p.r),
        k.pos(startX + p.dx, startY + p.dy),
        k.color(...PALETTE.cloudShadow),
        k.opacity(p.op),
        k.anchor("center"),
      ]);
      k.add([
        k.circle(p.r * 0.85),
        k.pos(startX + p.dx - 1, startY + p.dy - 1),
        k.color(...PALETTE.cloud),
        k.opacity(p.op * 0.9),
        k.anchor("center"),
      ]);
    }
  };

  // Helper: draw a frontier log cabin
  const drawCabin = (opts) => {
    const { x, w, h, roofH, chimneyOnLeft, windowCount = 1, isTradingPost = false } = opts;
    const y = baseY - h;

    k.add([k.rect(w, h), k.pos(x, y), k.color(...PALETTE.woodDark)]);
    const logHeight = 6;
    const logs = Math.floor(h / logHeight);
    for (let i = 0; i < logs; i++) {
      const ly = y + i * logHeight;
      const col = i % 2 === 0 ? PALETTE.wood : PALETTE.woodDark;
      k.add([k.rect(w - 2, logHeight - 1), k.pos(x + 1, ly), k.color(...col)]);
      k.add([k.rect(4, logHeight - 1), k.pos(x - 3, ly), k.color(...PALETTE.woodDark)]);
      k.add([k.rect(4, logHeight - 1), k.pos(x + w - 1, ly), k.color(...PALETTE.woodDark)]);
    }

    k.add([
      k.polygon([
        k.vec2(-w / 2 - 7, 0),
        k.vec2(0, -roofH),
        k.vec2(w / 2 + 7, 0),
      ]),
      k.pos(x + w / 2, y),
      k.color(...PALETTE.woodDark),
      k.outline(1.5, k.rgb(...PALETTE.outline)),
    ]);

    const chimW = 11;
    const chimH = roofH + 16;
    const chimX = chimneyOnLeft ? x + 7 : x + w - 7 - chimW;
    const chimY = y - chimH + 5;
    k.add([k.rect(chimW, chimH), k.pos(chimX, chimY), k.color(...PALETTE.stone), k.outline(1, k.rgb(...PALETTE.outline))]);
    for (let cy = chimY + 2; cy < chimY + chimH; cy += 5) {
      k.add([k.rect(chimW - 2, 3.5), k.pos(chimX + 1, cy), k.color(...(cy % 10 === 0 ? PALETTE.stoneLight : PALETTE.stone))]);
    }
    drawSmokePlume(chimX + chimW / 2, chimY);

    if (windowCount >= 1) {
      const winX = x + 12;
      const winY = y + 14;
      drawGlow(k, k, winX + 6, winY + 6, 16, PALETTE.gold, { rings: 4, opacity: 0.35 });
      k.add([k.rect(13, 13), k.pos(winX, winY), k.color(...PALETTE.goldBright)]);
      k.add([k.rect(13, 1), k.pos(winX, winY + 6), k.color(...PALETTE.outline)]);
      k.add([k.rect(1, 13), k.pos(winX + 6, winY), k.color(...PALETTE.outline)]);
    }
    if (windowCount >= 2) {
      const winX2 = x + w - 26;
      const winY2 = y + 14;
      drawGlow(k, k, winX2 + 6, winY2 + 6, 16, PALETTE.gold, { rings: 4, opacity: 0.35 });
      k.add([k.rect(13, 13), k.pos(winX2, winY2), k.color(...PALETTE.goldBright)]);
      k.add([k.rect(13, 1), k.pos(winX2, winY2 + 6), k.color(...PALETTE.outline)]);
      k.add([k.rect(1, 13), k.pos(winX2 + 6, winY2), k.color(...PALETTE.outline)]);
    }

    const doorW = 15;
    const doorH = Math.min(32, h - 14);
    const doorX = isTradingPost ? x + w / 2 - doorW / 2 : x + (chimneyOnLeft ? w - doorW - 10 : 10);
    const doorY = baseY - doorH;
    k.add([k.rect(doorW, doorH), k.pos(doorX, doorY), k.color(...PALETTE.woodDark), k.outline(1, k.rgb(...PALETTE.outline))]);
    k.add([k.circle(1.5), k.pos(doorX + doorW - 4, doorY + doorH / 2), k.color(...PALETTE.gold)]);

    if (isTradingPost) {
      k.add([k.rect(w + 10, 5), k.pos(x - 5, y + 24), k.color(...PALETTE.woodDark)]);
      k.add([k.rect(3, baseY - (y + 24)), k.pos(x, y + 24), k.color(...PALETTE.woodDark)]);
      k.add([k.rect(3, baseY - (y + 24)), k.pos(x + w - 3, y + 24), k.color(...PALETTE.woodDark)]);
    }
  };

  // Cabins arranged across the settlement
  drawCabin({ x: 60, w: 75, h: 50, roofH: 16, chimneyOnLeft: true, windowCount: 1 });
  drawCabin({ x: 180, w: 130, h: 76, roofH: 24, chimneyOnLeft: false, windowCount: 2, isTradingPost: true });
  drawCabin({ x: 360, w: 95, h: 62, roofH: 20, chimneyOnLeft: true, windowCount: 1 });
  drawCabin({ x: 495, w: 80, h: 52, roofH: 16, chimneyOnLeft: false, windowCount: 1 });

  // Frontier split-rail fences between cabins
  const drawFence = (fx, fy, len) => {
    for (let i = 0; i < len; i += 16) {
      k.add([k.rect(2, 12), k.pos(fx + i, fy - 12), k.color(...PALETTE.woodDark)]);
      k.add([k.rect(18, 2), k.pos(fx + i, fy - 10), k.color(...PALETTE.wood)]);
      k.add([k.rect(18, 2), k.pos(fx + i, fy - 4), k.color(...PALETTE.wood)]);
    }
  };
  drawFence(138, baseY, 40);
  drawFence(312, baseY, 45);
  drawFence(458, baseY, 35);
}

function drawDestination(k, W, H, env) {
  const { segment, tone, dayPhase } = env;

  // Segment-aware sky, distant mountains, foothills, and terrain
  drawSky(k, tone, dayPhase, { segment });
  const horizonCol = segmentColor(segment, "horizon", PALETTE.skyPale) || PALETTE.skyPale;
  k.add([k.rect(W, 85), k.pos(0, 180), k.color(...horizonCol)]);

  drawMountains(k, { segment });

  // Center visual mass in y = 80..250: Grand centerpiece snow-capped peak (Mount Hood vista)
  const cx = W / 2;
  const peakH = 125;
  const peakW = 270;
  const peakBaseY = 228;
  k.add([
    k.polygon([
      k.vec2(-peakW / 2, 0),
      k.vec2(-peakW / 8, -peakH * 0.7),
      k.vec2(0, -peakH),
      k.vec2(peakW / 6, -peakH * 0.75),
      k.vec2(peakW / 2, 0),
    ]),
    k.pos(cx, peakBaseY),
    k.color(...PALETTE.farWillamette),
    k.outline(2, k.rgb(...PALETTE.outline)),
  ]);
  k.add([
    k.polygon([
      k.vec2(0, -peakH),
      k.vec2(peakW / 6, -peakH * 0.75),
      k.vec2(peakW / 2, 0),
      k.vec2(peakW / 8, 0),
    ]),
    k.pos(cx, peakBaseY),
    k.color(...PALETTE.mountainShade),
    k.opacity(0.4),
  ]);
  k.add([
    k.polygon([
      k.vec2(-peakW / 9, -peakH * 0.72),
      k.vec2(0, -peakH),
      k.vec2(peakW / 10, -peakH * 0.78),
      k.vec2(peakW / 16, -peakH * 0.65),
      k.vec2(-peakW / 18, -peakH * 0.68),
    ]),
    k.pos(cx, peakBaseY),
    k.color(...PALETTE.snow),
    k.opacity(0.95),
  ]);

  // Layered rolling green foothills & emerald ground
  drawHills(k, { segment });
  drawGround(k, { tone, segment });

  // Winding Willamette River winding through the valley
  const riverPoints = [
    k.vec2(310, 240),
    k.vec2(285, 260),
    k.vec2(260, 290),
    k.vec2(295, 335),
    k.vec2(360, 390),
    k.vec2(410, 390),
    k.vec2(335, 335),
    k.vec2(295, 290),
    k.vec2(315, 260),
    k.vec2(330, 240),
  ];
  k.add([
    k.polygon(riverPoints),
    k.color(...PALETTE.skyPale),
    k.opacity(0.85),
  ]);
  k.add([
    k.polygon([
      k.vec2(312, 244),
      k.vec2(290, 263),
      k.vec2(270, 293),
      k.vec2(305, 338),
      k.vec2(370, 390),
      k.vec2(385, 390),
      k.vec2(325, 338),
      k.vec2(285, 293),
      k.vec2(305, 263),
      k.vec2(324, 244),
    ]),
    k.color(...PALETTE.iceBlue),
    k.opacity(0.7),
  ]);

  // Valley mist bands
  const mist = PALETTE.hazeWillamette;
  for (const [my, mh, mop] of [[245, 8, 0.3], [270, 6, 0.22], [305, 5, 0.16]]) {
    k.add([k.rect(W, mh), k.pos(0, my), k.color(...mist), k.opacity(mop)]);
  }
}
