export default function register(k, engine) {
  k.scene("loading", (data) => {
    k.add([
      k.rect(640, 480),
      k.pos(0, 0),
      k.color(0, 0, 0),
    ]);

    const loadText = k.add([
      k.text("LOADING", { size: 28 }),
      k.pos(320, 240),
      k.anchor("center"),
      k.color(245, 230, 200),
    ]);

    let dots = 0;
    const dotTimer = k.loop(0.4, () => {
      dots = (dots + 1) % 4;
      loadText.text = "LOADING" + ".".repeat(dots);
    });

    // Title scene will be triggered by engine.init() -> stateChange bridge
    // This timeout is a fallback in case init was already called
    setTimeout(() => {
      if (k.getSceneName && k.getSceneName() === "loading") {
        // Engine init should have fired by now; if still loading, go to title
        k.go("title", { engine });
      }
    }, 2000);
  });
}
