import { seededRng } from "../lib/draw.mjs";

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

export default function register(k, engine) {
  k.scene("death", (data) => {
    const W = 640;
    const H = 480;
    const death = data || {};
    const name = death.name || "Unknown";
    const cause = death.cause || "unknown causes";
    const date = death.date || engine.currentDate;

    // Vibrate on death
    navigator.vibrate?.([200]);

    // Very dark background
    k.add([k.rect(W, H), k.pos(0, 0), k.color(12, 10, 16)]);

    // Dim ground
    k.add([k.rect(W, 120), k.pos(0, 360), k.color(30, 25, 20)]);

    // Top/bottom vignette — stacked bands, decreasing size, no hard edge
    const vign = [[26, 0.16], [16, 0.10], [8, 0.06]];
    for (const [vh, op] of vign) {
      k.add([k.rect(W, vh), k.pos(0, 0), k.color(0, 0, 0), k.opacity(op)]);
      k.add([k.rect(W, vh), k.pos(0, H - vh), k.color(0, 0, 0), k.opacity(op)]);
    }

    // Tombstone
    const stoneW = 120;
    const stoneH = 160;
    const stoneX = W / 2 - stoneW / 2;
    const stoneY = 140;

    // Drop shadow behind the stone (physicality)
    k.add([
      k.rect(stoneW + 20, stoneH + 20, { radius: 8 }),
      k.pos(stoneX - 10 + 3, stoneY - 4 + 4),
      k.color(0, 0, 0),
      k.opacity(0.3),
    ]);

    // Base
    k.add([
      k.rect(stoneW + 20, 16),
      k.pos(stoneX - 10, stoneY + stoneH),
      k.color(80, 80, 80),
    ]);

    // Stone body
    k.add([
      k.rect(stoneW, stoneH, { radius: 8 }),
      k.pos(stoneX, stoneY),
      k.color(120, 120, 120),
    ]);

    // Rounded top accent
    k.add([
      k.rect(stoneW - 8, 20, { radius: 10 }),
      k.pos(stoneX + 4, stoneY - 4),
      k.color(130, 130, 130),
    ]);

    // Aged stone: seeded ink specks + edge blotches (run-stable, keyed on
    // name/cause/date so re-entering this scene never flickers).
    const stoneRng = seededRng(hashSeed(`${name}|${cause}|${date}`));
    const speckCount = 20 + Math.floor(stoneRng() * 21);
    for (let i = 0; i < speckCount; i++) {
      const sx = stoneX + stoneRng() * stoneW;
      const sy = stoneY - 4 + stoneRng() * (stoneH + 24);
      k.add([
        k.circle(0.6 + stoneRng() * 0.5),
        k.pos(sx, sy),
        k.color(30, 26, 22),
        k.opacity(0.1 + stoneRng() * 0.12),
        k.anchor("center"),
      ]);
    }
    const blotchCount = 2 + Math.floor(stoneRng() * 2);
    for (let i = 0; i < blotchCount; i++) {
      const bx = stoneX + stoneRng() * stoneW;
      const by = stoneY + stoneRng() * stoneH;
      k.add([
        k.circle(6 + stoneRng() * 6),
        k.pos(bx, by),
        k.color(60, 58, 56),
        k.opacity(0.08),
        k.anchor("center"),
      ]);
    }

    // Cross on tombstone
    const crossCx = W / 2;
    const crossTop = stoneY + 20;
    // Vertical
    k.add([
      k.rect(6, 40),
      k.pos(crossCx - 3, crossTop),
      k.color(80, 80, 80),
    ]);
    // Horizontal
    k.add([
      k.rect(24, 6),
      k.pos(crossCx - 12, crossTop + 10),
      k.color(80, 80, 80),
    ]);

    // Name on stone
    k.add([
      k.text(name, { size: 16 }),
      k.pos(W / 2, stoneY + 80),
      k.anchor("center"),
      k.color(40, 40, 40),
    ]);

    // Date on stone
    k.add([
      k.text(engine.formatDate(date), { size: 12 }),
      k.pos(W / 2, stoneY + 105),
      k.anchor("center"),
      k.color(50, 50, 50),
    ]);

    // Cause of death
    k.add([
      k.text(`Died of ${cause}`, { size: 14 }),
      k.pos(W / 2, stoneY + 130),
      k.anchor("center"),
      k.color(50, 50, 50),
    ]);

    // Header text
    k.add([
      k.text("REST IN PEACE", { size: 24 }),
      k.pos(W / 2, 50),
      k.anchor("center"),
      k.color(178, 34, 34),
    ]);

    // Epitaph area — typewriter effect
    const epitaphObj = k.add([
      k.text("", { size: 14, width: W - 120 }),
      k.pos(W / 2, 360),
      k.anchor("center"),
      k.color(222, 184, 135),
    ]);

    let epitaphFull = "";
    let epitaphIndex = 0;
    let epitaphLoading = true;

    // Fetch epitaph from engine
    engine.generateEpitaph(name).then((text) => {
      epitaphFull = text || `Here lies ${name}, taken too soon on the Oregon Trail.`;
      epitaphLoading = false;
    });

    k.onUpdate(() => {
      if (epitaphLoading) return;
      if (epitaphIndex < epitaphFull.length) {
        epitaphIndex += Math.max(1, Math.floor(k.dt() * 40));
        if (epitaphIndex > epitaphFull.length) epitaphIndex = epitaphFull.length;
        epitaphObj.text = epitaphFull.substring(0, epitaphIndex);
      }
    });

    // "Download Tombstone" prompt — tappable area so it works on a phone
    // (IMPROVEMENT_ROADMAP §1.1).
    const download = () => {
      engine.emit("downloadTombstone", { name, date, cause, epitaph: epitaphFull });
    };
    const dlText = k.add([
      k.text("(D) Download Tombstone", { size: 12 }),
      k.pos(W / 2, 420),
      k.anchor("center"),
      k.color(100, 100, 100),
      k.area(),
    ]);
    dlText.onClick(download);
    k.onKeyPress("d", download);

    // Continue prompt
    k.add([
      k.text("Press ENTER or tap to continue", { size: 13 }),
      k.pos(W / 2, 450),
      k.anchor("center"),
      k.color(150, 150, 150),
    ]);

    const proceed = () => {
      const alive = engine.aliveMembers;
      if (alive.length === 0) {
        engine.transition("WIPE");
      } else {
        engine.transition("TRAVEL");
      }
    };
    k.onKeyPress("enter", proceed);
    // Tap anywhere (outside the download label) advances. The download label's
    // own onClick fires first when tapped, and download() doesn't transition,
    // so the two don't conflict in practice.
    k.onClick(() => {
      if (dlText.isHovering?.()) return;
      proceed();
    });
  });
}
