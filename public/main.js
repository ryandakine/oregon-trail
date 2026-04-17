// Error capture — must run before kaplay loads so early errors are caught.
window.__ERRORS = [];
window.addEventListener("error", (e) => window.__ERRORS.push({ msg: e.message, src: e.filename, line: e.lineno }));
window.addEventListener("unhandledrejection", (e) => window.__ERRORS.push({ msg: "rejection: " + String(e.reason) }));

// Kaplay CDN with jsDelivr fallback so the game loads if unpkg is down.
let kaplay;
try {
  kaplay = (await import("https://unpkg.com/kaplay@3001/dist/kaplay.mjs")).default;
} catch (err) {
  console.warn("unpkg unreachable, falling back to jsDelivr:", err?.message);
  kaplay = (await import("https://cdn.jsdelivr.net/npm/kaplay@3001/dist/kaplay.mjs")).default;
}

const k = kaplay({
  width: 640,
  height: 480,
  crisp: true,
  stretch: true,
  letterbox: true,
  background: [26, 26, 46],
});

window.k = k;

// A11y: describe the canvas for assistive tech since its content is dynamic.
const canvas = document.querySelector("canvas");
if (canvas) {
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Oregon Trail — AI edition. Press P to pause. Keyboard navigation supported in event dialogs.");
  canvas.setAttribute("tabindex", "0");
}

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
