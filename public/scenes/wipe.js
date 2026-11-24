function humanize(str) {
  if (!str) return str;
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function register(k, engine) {
  k.scene("wipe", (data) => {
    const W = 640;
    const H = 480;

    // Vibrate pattern
    navigator.vibrate?.([300, 100, 300]);

    // Near-black background with red tint
    k.add([k.rect(W, H), k.pos(0, 0), k.color(20, 6, 6)]);

    // Subtle red vignette edges
    k.add([k.rect(W, 4), k.pos(0, 0), k.color(80, 10, 10)]);
    k.add([k.rect(W, 4), k.pos(0, H - 4), k.color(80, 10, 10)]);
    k.add([k.rect(4, H), k.pos(0, 0), k.color(80, 10, 10)]);
    k.add([k.rect(4, H), k.pos(W - 4, 0), k.color(80, 10, 10)]);

    // Main title
    k.add([
      k.text("YOUR PARTY HAS PERISHED", { size: 30 }),
      k.pos(W / 2, 60),
      k.anchor("center"),
      k.color(178, 34, 34),
    ]);

    // Subtitle
    k.add([
      k.text("None survived the journey.", { size: 16 }),
      k.pos(W / 2, 100),
      k.anchor("center"),
      k.color(140, 60, 60),
    ]);

    // Death toll list
    const deaths = engine.deaths || [];
    const members = engine.party?.members || [];
    const allDead = members.filter(m => !m.alive);
    const causeByName = new Map(deaths.map((d) => [d.name, d.cause]));

    const listY = 140;
    const listH = Math.min(allDead.length * 30 + 20, 200);

    k.add([
      k.rect(400, listH, { radius: 4 }),
      k.pos(W / 2 - 200, listY),
      k.color(30, 10, 10),
      k.opacity(0.8),
    ]);

    allDead.forEach((member, i) => {
      const my = listY + 14 + i * 28;
      const cause = humanize(causeByName.get(member.name) || "the trail");

      // Skull marker
      k.add([
        k.text("\u2020", { size: 16 }),
        k.pos(W / 2 - 180, my),
        k.color(178, 34, 34),
      ]);

      k.add([
        k.text(`${member.name} - ${cause}`, { size: 14 }),
        k.pos(W / 2 - 160, my),
        k.color(200, 150, 150),
      ]);
    });

    // Stats
    const miles = engine.milesTraveled || 0;
    const date = engine.formatDate(engine.currentDate);

    const statsY = listY + listH + 20;
    const dateY = statsY + 24;
    k.add([
      k.text(`Miles traveled: ${miles}`, { size: 14 }),
      k.pos(W / 2, statsY),
      k.anchor("center"),
      k.color(140, 100, 100),
    ]);
    k.add([
      k.text(`Date: ${date}`, { size: 14 }),
      k.pos(W / 2, dateY),
      k.anchor("center"),
      k.color(140, 100, 100),
    ]);

    // Read Newspaper button — key + tap (IMPROVEMENT_ROADMAP §1.1). Y is
    // clamped against the death-list-driven stats block above it so a full
    // party of deaths can't push "Date:" under the button (D-wipe-0).
    const npBtnY = Math.max(H - 120, dateY + 16);
    const readNewspaper = () => engine.generateNewspaper();
    const npBtn = k.add([
      k.rect(200, 34, { radius: 4 }),
      k.pos(W / 2 - 100, npBtnY),
      k.color(80, 20, 20),
      k.opacity(0.85),
      k.area(),
    ]);
    npBtn.onClick(readNewspaper);
    k.add([
      k.text("(N) Read Newspaper", { size: 14 }),
      k.pos(W / 2, npBtnY + 17),
      k.anchor("center"),
      k.color(200, 150, 150),
    ]);

    k.onKeyPress("n", readNewspaper);

    // Share (Daily Trail)
    let shareBtn = null;
    let shareBtnY = null;
    if (engine.dailyMode) {
      const shareDaily = () => {
        const text = engine.getDailyShareText();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
        }
        engine.emit("shareDaily", { text });
      };
      shareBtnY = Math.max(H - 76, npBtnY + 34 + 8);
      shareBtn = k.add([
        k.rect(180, 34, { radius: 4 }),
        k.pos(W / 2 - 90, shareBtnY),
        k.color(60, 20, 20),
        k.opacity(0.85),
        k.area(),
      ]);
      shareBtn.onClick(shareDaily);
      k.add([
        k.text("(S) Share Result", { size: 14 }),
        k.pos(W / 2, shareBtnY + 17),
        k.anchor("center"),
        k.color(200, 150, 150),
      ]);

      k.onKeyPress("s", shareDaily);
    }

    // Restart prompt
    const lastBtnBottom = (shareBtnY ?? npBtnY) + 34;
    const restartY = Math.max(H - 30, lastBtnBottom + 16);
    k.add([
      k.text("Press ENTER or tap below to start a new journey", { size: 14 }),
      k.pos(W / 2, restartY),
      k.anchor("center"),
      k.color(100, 60, 60),
    ]);

    const restart = () => engine.restart();
    k.onKeyPress("enter", restart);
    // Tap anywhere that isn't a button restarts. Buttons' own onClick fires
    // first and doesn't restart, so a tap on Newspaper/Share won't also reset.
    k.onClick(() => {
      if (npBtn.isHovering?.()) return;
      if (shareBtn?.isHovering?.()) return;
      restart();
    });
  });
}
