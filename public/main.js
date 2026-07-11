// Error capture — must run before kaplay loads so early errors are caught.
import { shouldInit3D, getRenderMode, isDesktopPointer } from "./render-mode.mjs";

window.__ERRORS = [];
window.addEventListener("error", (e) => window.__ERRORS.push({ msg: e.message, src: e.filename, line: e.lineno }));
window.addEventListener("unhandledrejection", (e) => window.__ERRORS.push({ msg: "rejection: " + String(e.reason) }));

// Kaplay is self-hosted at /vendor/kaplay.mjs (IMPROVEMENT_ROADMAP §2) so the
// service worker can precache it and the PWA works offline — a cross-origin
// CDN module was never cacheable. jsDelivr stays as a runtime fallback if the
// self-hosted copy ever fails to load (e.g. a bad deploy).
let kaplay;
try {
  kaplay = (await import("/vendor/kaplay.mjs")).default;
} catch (err) {
  console.warn("self-hosted kaplay unreachable, falling back to jsDelivr:", err?.message);
  kaplay = (await import("https://cdn.jsdelivr.net/npm/kaplay@3001/dist/kaplay.mjs")).default;
}

const k = kaplay({
  width: 640,
  height: 480,
  crisp: true,
  stretch: true,
  letterbox: true,
  // Render the backing buffer at 2-3x logical so canvas text (sizes 11-20) has
  // enough pixels to stay sharp when the 640x480 frame is stretched to the
  // window. Floor 2 fixes low-DPR desktops (where text was smearing); cap 3 so
  // DPR-4+ phones don't allocate an oversized buffer for no visible gain.
  pixelDensity: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
  // Default canvas font: real vector TTF instead of kaplay's low-res bitmap
  // font, so glyphs rasterize crisply at the higher pixel density.
  font: "plex",
  // Transparent clear so the Kaplay canvas can composite over the 3D world
  // canvas (#three-canvas, z-index 0) during world scenes. Menu/UI scenes paint
  // their own background or fall back to the body color (#1a1a2e), so they look
  // unchanged. (THREEJS_REBUILD_PLAN D3 — Kaplay-over-Three compositing.)
  background: [0, 0, 0, 0],
});

// Load the default font before any scene renders text — must finish before
// k.go("loading") below. If the TTF ever fails to fetch (404, network), swallow
// it so the top-level await doesn't reject and halt the module: the game still
// boots and renders text with kaplay's built-in font (blurry, but not a black
// screen).
try {
  await k.loadFont("plex", "/fonts/ibm-plex-mono-700.ttf");
} catch (err) {
  console.warn("plex font failed to load; falling back to built-in font:", err?.message);
}

// Title hero still (WS4) — optional; title scene falls back to night poster if 404.
// Non-blocking: never hold boot / scene registration on this asset.
window.__titleHeroReady = false;
k.loadSprite("titleHero", "/assets/title-hero.png")
  .then(() => { window.__titleHeroReady = true; })
  .catch((err) => {
    console.warn("title-hero.png missing; using night fallback:", err?.message);
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

// ── "Written live by Claude" loading overlay (IMPROVEMENT_ROADMAP §1.5) ──
// engine.emit('loading', true|false) fires around every ~8s LLM call. Without
// a subscriber the wait reads as a hang on the exact feature being demoed.
// Frame it instead. Copy mirrors tone.js:89-92. The tone scene runs its own
// inline loading state, so suppress this global one while on TONE to avoid a
// double overlay.
const aiLoadingEl = document.createElement("div");
aiLoadingEl.id = "ai-loading";
aiLoadingEl.setAttribute("role", "status");
aiLoadingEl.setAttribute("aria-live", "polite");
aiLoadingEl.style.cssText = [
  "position:fixed", "inset:0", "z-index:250", "display:none",
  "flex-direction:column", "align-items:center", "justify-content:center",
  "gap:10px", "padding:32px", "text-align:center",
  "background:rgba(10,8,6,0.86)", "color:#f5e6c8",
  "font-family:Georgia,'Times New Roman',serif",
].join(";");
aiLoadingEl.innerHTML = `
  <p style="color:#d4a030;font-size:1.15rem;margin:0;">The trail unfolds…</p>
  <p style="font-size:0.9rem;opacity:0.75;margin:0;">Written live by Claude.</p>
`;
document.body.appendChild(aiLoadingEl);

engine.on("loading", (isLoading) => {
  if (engine.state === "TONE") { aiLoadingEl.style.display = "none"; return; }
  aiLoadingEl.style.display = isLoading ? "flex" : "none";
});
// Never let the overlay outlive a scene change (e.g. an error mid-call).
engine.on("stateChange", () => { aiLoadingEl.style.display = "none"; });
engine.on("error", () => { aiLoadingEl.style.display = "none"; });

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
    BITTER_PATH: "bitter_path",
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
  import("./scenes/bitter_path.js"),
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

// ── 3D render layer (THREEJS_REBUILD_PLAN). Strictly additive + read-only on
// engine state. Initialized LAST and NON-blocking (fire-and-forget): creating the
// WebGLRenderer + shadow maps + composer is heavy, so it must never gate the 2D
// game boot. If Three fails to load/init, the existing Kaplay 2D game is unaffected.
//
// DESKTOP-ONLY (DEC-B b2 / status-correction P0): the layer's only tier is the
// desktop 'high' profile (2048 shadows + composer + bloom). Phones autodetect it
// and choke (single-digit fps / WebGL context loss), so don't even download the
// ~1.3 MB three bundle on a touch device. Gate on a fine (mouse) pointer with no
// coarse (touch) pointer — the conservative "clearly a desktop" test. The 2D
// Kaplay game remains the path for phones (and for any desktop where 3D fails).
//
// Skipped under ?test=1 (the 2D scene-smoke harness, which never wants 3D). An
// explicit ?gfx= param force-inits regardless of pointer: the screenshot +
// deploy-smoke harnesses run headless (no real pointer) and need the layer, and
// it doubles as a manual escape hatch (?gfx=high / ?gfx=low). ──
{
  // The load decision is the pure shouldInit3D() (see render-mode.mjs): the
  // ?test guard wins first, then an explicit 2d/3d preference, then the
  // "auto" device+gfx default. An unset preference reproduces the old gate
  // exactly (?gfx || desktop), so existing behavior is unchanged.
  const params = new URLSearchParams(location.search);
  if (shouldInit3D({
    hasTest: params.has("test"),
    hasGfx: params.has("gfx"),
    isDesktop: isDesktopPointer(),
    mode: getRenderMode(),
  })) {
    import("./three/bootstrap.mjs")
      .then((m) => m.initThree(engine))
      .catch((err) => {
        // Push into __ERRORS (not just console.warn) so deploy-smoke and the test
        // harnesses can see a broken 3D layer — a swallowed warn would let a dead
        // 3D build pass the promotion gate silently.
        window.__ERRORS.push({ msg: "3d-init-failed: " + (err?.message || String(err)) });
        console.warn("3D render layer failed to init; continuing with 2D:", err?.message);
      });
  }
}
