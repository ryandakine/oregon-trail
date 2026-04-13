import kaplay from "https://unpkg.com/kaplay@3001/dist/kaplay.mjs";

const k = kaplay({
  width: 640,
  height: 480,
  crisp: true,
  stretch: true,
  letterbox: true,
  background: [26, 26, 46],
});

window.k = k;
const engine = window.engine;

// Register stateChange bridge BEFORE engine.init() — critical:
// init() fires transition('TITLE') synchronously, so bridge must exist first
engine.on("stateChange", ({ from, to, data }) => {
  const sceneMap = {
    TITLE: "title",
    PROFESSION: "profession",
    NAMES: "names",
    TONE: "tone",
    STORE: "store",
    TRAVEL: "travel",
    EVENT: "event",
    LANDMARK: "landmark",
    RIVER: "river",
    DEATH: "death",
    HUNTING: "hunting",
    ARRIVAL: "arrival",
    WIPE: "wipe",
    NEWSPAPER: "newspaper",
    SHARE: "share",
    LOADING: "loading",
  };
  const sceneName = sceneMap[to];
  if (sceneName) {
    // Hide HTML overlay on scene switch
    const overlay = document.getElementById("html-overlay");
    if (overlay) overlay.classList.remove("active");
    k.go(sceneName, data || {});
  }
});

// Load and register all scene modules
const sceneModules = await Promise.all([
  import("./scenes/loading.js"),
  import("./scenes/title.js"),
  import("./scenes/travel.js"),
  import("./scenes/event.js"),
  import("./scenes/profession.js"),
  import("./scenes/names.js"),
  import("./scenes/tone.js"),
  import("./scenes/store.js"),
  import("./scenes/river.js"),
  import("./scenes/landmark.js"),
  import("./scenes/death.js"),
  import("./scenes/hunting.js"),
  import("./scenes/arrival.js"),
  import("./scenes/wipe.js"),
  import("./scenes/newspaper.js"),
  import("./scenes/share.js"),
]);

for (const mod of sceneModules) {
  mod.default(k, engine);
}

// Start at loading scene, then init engine
k.go("loading", {});
setTimeout(() => engine.init(), 100);
