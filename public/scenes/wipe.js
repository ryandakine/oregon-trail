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
      const cause = member.cause_of_death || "the trail";

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
    k.add([
      k.text(`Miles traveled: ${miles}`, { size: 14 }),
      k.pos(W / 2, statsY),
      k.anchor("center"),
      k.color(140, 100, 100),
    ]);
    k.add([
      k.text(`Date: ${date}`, { size: 14 }),
      k.pos(W / 2, statsY + 24),
      k.anchor("center"),
      k.color(140, 100, 100),
    ]);

    // Read Newspaper button
    k.add([
      k.rect(200, 34, { radius: 4 }),
      k.pos(W / 2 - 100, H - 120),
      k.color(80, 20, 20),
      k.opacity(0.85),
    ]);
    k.add([
      k.text("(N) Read Newspaper", { size: 14 }),
      k.pos(W / 2, H - 103),
      k.anchor("center"),
      k.color(200, 150, 150),
    ]);

    k.onKeyPress("n", () => {
      engine.generateNewspaper();
    });

    // Share (Daily Trail)
    if (engine.dailyMode) {
      k.add([
        k.rect(180, 34, { radius: 4 }),
        k.pos(W / 2 - 90, H - 76),
        k.color(60, 20, 20),
        k.opacity(0.85),
      ]);
      k.add([
        k.text("(S) Share Result", { size: 14 }),
        k.pos(W / 2, H - 59),
        k.anchor("center"),
        k.color(200, 150, 150),
      ]);

      k.onKeyPress("s", () => {
        const text = engine.getDailyShareText();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
        }
        engine.emit("shareDaily", { text });
      });
    }

    // Restart prompt
    k.add([
      k.text("Press ENTER to start a new journey", { size: 14 }),
      k.pos(W / 2, H - 30),
      k.anchor("center"),
      k.color(100, 60, 60),
    ]);

    k.onKeyPress("enter", () => {
      engine.restart();
    });
  });
}
