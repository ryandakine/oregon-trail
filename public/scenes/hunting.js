export default function register(k, engine) {
  k.scene("hunting", (data) => {
    const W = 640;
    const H = 480;

    // Sky
    k.add([k.rect(W, 200), k.pos(0, 0), k.color(100, 160, 220)]);

    // Sun
    k.add([k.circle(30), k.pos(540, 60), k.color(252, 227, 138)]);

    // Ground (meadow)
    k.add([k.rect(W, 280), k.pos(0, 200), k.color(46, 139, 87)]);

    // Grass tufts
    for (let i = 0; i < 20; i++) {
      const gx = Math.random() * W;
      const gy = 210 + Math.random() * 250;
      k.add([
        k.rect(3, 12 + Math.random() * 8),
        k.pos(gx, gy),
        k.color(34, 120, 44),
        k.opacity(0.6),
      ]);
    }

    // Distant tree line
    for (let i = 0; i < 12; i++) {
      const tx = 10 + i * 54;
      const th = 30 + Math.random() * 20;
      // Trunk
      k.add([k.rect(6, 20), k.pos(tx + 10, 195), k.color(100, 60, 20)]);
      // Canopy
      k.add([k.rect(26, th), k.pos(tx, 195 - th), k.color(34, 100, 34)]);
    }

    // Title
    k.add([
      k.text("HUNTING", { size: 32 }),
      k.pos(W / 2, 40),
      k.anchor("center"),
      k.color(252, 227, 138),
    ]);

    // Ammo count
    const ammo = engine.supplies?.ammo || 0;
    const ammoText = k.add([
      k.text(`Ammunition: ${ammo} rounds`, { size: 16 }),
      k.pos(W / 2, 80),
      k.anchor("center"),
      k.color(255, 255, 255),
    ]);

    // Results text (hidden initially)
    const resultsObj = k.add([
      k.text("", { size: 18, width: W - 80 }),
      k.pos(W / 2, 260),
      k.anchor("center"),
      k.color(252, 227, 138),
    ]);

    const instructObj = k.add([
      k.text("Choose how many rounds to spend:", { size: 14 }),
      k.pos(W / 2, 110),
      k.anchor("center"),
      k.color(222, 184, 135),
    ]);

    // Buttons — parens not brackets: kaplay's styled-text parser treats
    // `[1]` as an unclosed style tag (`[name]...[/name]`) and throws.
    // Matches landmark.js.
    const options = [
      { label: "(1) 5 rounds", key: "1", ammo: 5 },
      { label: "(2) 10 rounds", key: "2", ammo: 10 },
      { label: "(3) 20 rounds", key: "3", ammo: 20 },
      { label: "(0) Cancel", key: "0", ammo: 0 },
    ];

    const btnW = 130;
    const btnH = 34;
    const btnGap = 12;
    const totalW = options.length * btnW + (options.length - 1) * btnGap;
    const startX = (W - totalW) / 2;
    const btnY = 160;

    let hunting = false;
    let huntDone = false;
    const btnObjs = [];

    options.forEach((opt, i) => {
      const bx = startX + i * (btnW + btnGap);
      const disabled = opt.ammo > ammo && opt.ammo > 0;
      const btnColor = opt.ammo === 0 ? [178, 34, 34] : disabled ? [100, 100, 100] : [46, 139, 87];

      const bg = k.add([
        k.rect(btnW, btnH, { radius: 4 }),
        k.pos(bx, btnY),
        k.color(btnColor[0], btnColor[1], btnColor[2]),
        k.opacity(0.85),
      ]);
      const txt = k.add([
        k.text(opt.label, { size: 13 }),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.color(255, 255, 255),
      ]);
      btnObjs.push({ bg, txt });

      k.onKeyPress(opt.key, () => {
        if (hunting || huntDone) return;

        if (opt.ammo === 0) {
          // Cancel
          engine.resumeAdvance();
          engine.transition("TRAVEL");
          return;
        }

        if (disabled) return;

        hunting = true;
        instructObj.text = "Hunting...";

        // Hide buttons
        for (const b of btnObjs) {
          b.bg.opacity = 0.3;
        }

        engine.submitHunt(opt.ammo);
      });
    });

    // Listen for hunt results
    const onResults = (results) => {
      hunting = false;
      huntDone = true;

      const foodGained = results?.food_gained || 0;
      const ammoUsed = results?.ammo_used || 0;
      const narrative = results?.narrative || "";

      let resultText = narrative || `You used ${ammoUsed} rounds and got ${foodGained} lbs of food.`;
      resultsObj.text = resultText;
      instructObj.text = "Press ENTER to continue";
      ammoText.text = `Ammunition: ${(engine.supplies?.ammo || 0)} rounds`;
    };
    engine.on("huntResults", onResults);
    k.onSceneLeave(() => engine.off("huntResults", onResults));

    k.onKeyPress("enter", () => {
      if (!huntDone) return;
      engine.resumeAdvance();
      engine.transition("TRAVEL");
    });

    // Error recovery
    const onError = ({ message }) => {
      hunting = false; // Re-enable options
      instructObj.text = message || 'Hunt failed. Try again.';
      for (const b of btnObjs) {
        b.bg.opacity = 0.85;
      }
    };
    engine.on('error', onError);
    k.onSceneLeave(() => engine.off('error', onError));
  });
}
