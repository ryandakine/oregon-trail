# Graphics Research: How the Art Is Made, and How to Make It Pop

**Date:** 2026-08-21. Research pass: 2 repo-recon agents + 7 web-research agents (low-poly art
direction, Three.js stylized rendering, Kaplay juice, palette/lighting theory, AI asset generation,
Oregon Trail peers, horror-tier atmosphere). All engine-capability claims below were verified
against the vendored `public/vendor/kaplay.mjs` and `public/vendor/three/`.

---

## 1. How the graphics are actually made today

### 2D layer (always on; the only layer on mobile)

Everything is Kaplay vector primitives composited in code — zero sprite files besides the optional
title hero image and the font.

- `public/lib/draw.mjs` (596 lines) builds every object (sky, wagon, oxen, pioneers, trees, weather,
  health icons) from `k.rect`/`k.circle`/`k.polygon`. Shading is faked: stacked flat shapes at
  different opacities. Outlines are either `k.outline()` or a "bigger dark shape behind, lit shape
  on top" double-draw. A seeded mulberry32 PRNG keeps scatter (grass, stones, flowers) stable
  across repaints.
- "Gradients" are 4 discrete 45px color bands lerped with `mixColor()` — visible seams. Glows
  (sun, moon, lantern) are 2–3 concentric translucent circles — read as rings up close.
- Animation is 100% hand-rolled `onUpdate()` math: sine bobs, 2-frame leg swaps, self-managed
  dust/rain/snow particle objects. **The engine's own `tween`, `particles`, `shake`, `flash`,
  `loadShader`/`usePostEffect`, `textTransform` are used nowhere in app code** (grep-verified;
  all present in the vendored kaplay.mjs).
- `tone.mjs` horror overlay = tint rect + 4 vignette rects + a sine-pulse rect + **120 individual
  1px scanline rects** at opacity 0.05 — barely perceptible.
- **The biggest structural finding:** every LLM Event and the Bitter Path scene dim the canvas to
  60–75% black and hand the entire screen to a plain DOM panel. Most of actual playtime, the
  procedural art isn't on screen at all.

### 3D layer (desktop, behind a transparent Kaplay canvas)

Disciplined zero-asset pipeline: primitive geometries + `MeshStandardMaterial` + runtime
`CanvasTexture` painting (seeded LCG, Sobel-filtered normal maps), one DirectionalLight + one
HemisphereLight driven by a 9-keyframe time-of-day palette in `sky.mjs`, linear `THREE.Fog`,
`ACESFilmicToneMapping`, and an EffectComposer (RenderPass → UnrealBloomPass → OutputPass, HIGH
tier only). Motion is a pure function of scroll distance (screenshot-deterministic `freezeAt`).

Known weak points (recon-confirmed):

| Weakness | Root cause |
|---|---|
| Daylight looks flat/plastic | Shadow camera is a ±24u ortho box while the visible terrain band is ~90u half-width — most terrain gets **zero cast shadow**, lit by hemisphere fill alone |
| Blob oxen / stick pioneers | Only hero-model class with **no texture at all** — flat single-hex `MeshStandardMaterial`, smooth PBR specular = plastic |
| Empty sky | Custom gradient dome shader is fine, but only **11 cloud sprites** over a 1000u volume; no secondary layer, no IBL capture of the dome |
| Bloom does nothing by day | Threshold 0.85 + zero daytime emissive surfaces = the composer runs for nothing during ~60% of play |
| Dust storms look like bokeh | 65/35 debris/smoke sprite mix + CustomBlending gives dust a luminous glow |
| Night camp looks great | Proof of concept: one strong warm PointLight + darkness + bloom = the shape-defining lighting the daytime sun+shadow combo never provides |

**Diagnosis in one line: this is a lighting/color-discipline gap, not a technology gap.** The
pipeline already has shaders, a composer, instancing, and a palette single-source — they're just
under-driven.

---

## 2. What the successful comparables do (and this game doesn't yet)

From A Short Hike, Alto's, Sable, Firewatch, Journey, Banner Saga, Gameloft's Oregon Trail (2021),
Darkest Dungeon, Limbo:

1. **Palette discipline beats geometry.** 8–24 locked colors, every hex declared into a 60/30/10
   budget (60% sky, 30% terrain, 10% ONE accent per scene). A Short Hike's whole look is a
   posterize-to-palette post pass over plain geometry.
2. **Fog color == sky horizon color, always.** Sable's team called fog "the biggest impact overall."
   Mismatched fog is what makes cheap 3D read as a gray wall.
3. **Toon shading, not PBR, on low-poly shapes.** Smooth PBR falloff on simple geometry reads
   "unfinished"; 3–4 hard bands read "deliberate style." (Banner Saga, Death's Door.)
4. **Rim/Fresnel light for silhouette separation** (Journey's dunes trick). `models.mjs` already
   has an `addRim()` helper — extend and tune rather than build.
5. **Never white light.** Warm key (#fff1d8 noon, #ff9d4d dusk) + ambient tinted to the fog color.
   This is exactly why the night camp already works.
6. **Concentrate drama at beats, not uniformly.** Banner Saga / 80 Days / Gameloft reserve budget
   for landmark hero shots and interludes; the travel loop stays calm.
7. **Characters don't need close-up fidelity.** Banner Saga's marchers are simple silhouettes; the
   identity work lives in illustrated UI portraits. Gameloft = pixel-art characters over 3D
   environment with tilt-shift — architecturally the same 2D-over-3D split this game already has.

---

## 3. Ranked plan — highest leverage first

Effort: S = hours, M = a day-ish, L = multi-day. All zero-new-assets unless marked.

### Phase A — Lighting & color (3D). The "why day looks cheap" fix.

| # | Change | Where | Impact / Effort |
|---|---|---|---|
| A1 | Widen the shadow frustum (or 2-cascade) so mid-distance terrain receives cast shadow | `bootstrap.mjs` ~104 | HIGH / S |
| A2 | Warm the sun + tint hemisphere/ambient to the fog color; kill neutral-white light | `sky.mjs` `applyTo()` | HIGH / S |
| A3 | `MeshToonMaterial` + shared 3–4 step `DataTexture` gradient ramp on wagon/oxen/pioneers/fauna/landmarks (keep the load-bearing terrain splat shader as-is, first pass) | `models.mjs`, `fauna.mjs`, `landmarks.mjs`, `camp.mjs` | HIGH / S–M |
| A4 | Painted `CanvasTexture` albedo (mottled fur / woven cloth) for oxen + pioneers — the only untextured hero class | `textures.mjs` + `models.mjs` | HIGH / M |
| A5 | Bake sky dome → PMREM → `scene.environment` per time-of-day bucket (ambient specular for every Standard material) | `bootstrap.mjs` | MED / M |
| A6 | More clouds + a low fast-drifting second layer; parallax silhouette planes (distant mountain line, hill line) at multipliers ~0.1/0.3/0.6 | `sky.mjs` | HIGH / M |
| A7 | Daytime emissive accents (wagon ironwork glint, lantern lit at dusk) so the bloom pass earns its cost by day | `models.mjs` | MED / S |
| A8 | Combined vignette+grain+lift-gamma-gain ShaderPass after OutputPass, uniforms keyed to tone tier (`ShaderPass.js` already vendored) | `bootstrap.mjs` | HIGH / M |
| A9 | Wind sway in the existing instanced-grass `onBeforeCompile` (one `uTime` uniform, zero new draw calls) | `grass.mjs` | MED / S |
| A10 | Inverted-hull outlines on hero meshes, fade with distance matched to fog far | `models.mjs` | MED / M |
| A11 | Fix dust-storm bokeh: shift sprite mix toward debris, shrink smoke | `vfx.mjs` `_emitDust` | MED / S |
| A12 | Intermediate fps-gate steps (drop bloom → halve shadow map → cut particles) before the hard 2D fallback | `fps-gate.mjs`, `bootstrap.mjs` | MED / M |

### Phase B — 2D layer + juice. The mobile experience and the game-feel gap.

| # | Change | Where | Impact / Effort |
|---|---|---|---|
| B1 | Ink outline + shadow-side hatching helper applied across primitives (Darkest Dungeon trick — linework density fakes detail) | `draw.mjs` | HIGH / S |
| B2 | Real gradients: bake sky/vignette/glow radial gradients to cached canvas textures once, reuse as sprites (kills banding + ring-glows) | `draw.mjs` | HIGH / M |
| B3 | Adopt the engine's juice: `shake()` on river/hunt/death, `flash()` on death & newspaper reveal, `tween()`+easings for HUD/panel pop-ins, `particles()` for dust/splash/embers/sparks. Define `juice.minor()/major()/horror()` presets so 17 scenes stay consistent | scenes + new `lib/juice.mjs` | HIGH / M |
| B4 | Rotate the wagon wheels (currently commented "static") + drift the 4 static clouds | `draw.mjs`, `travel.js` | MED / S |
| B5 | Stop killing the art during events: dim to ~40% with slow parallax drift behind the DOM panel instead of a flat black rect; style the panel from `palette.mjs` (parchment tint, ink-speckle via existing `seededRng`) | `event.js`, `bitter_path.js`, CSS | HIGH / M |
| B6 | Typewriter reveal for LLM event text (masks API latency, reads as narration); letter-wobble reserved for the epitaph | event overlay | MED / S |
| B7 | Newspaper/tombstone aging: seeded ink speckle, soft drop shadow, sepia vignette (`usePostEffect` on desktop, cached radial-gradient rect on mobile) — these are the two most-screenshotted screens | `draw.mjs`, scenes | HIGH / M |
| B8 | HUD: highlight strip on progress-bar fill, brief flash/tween on health-state change (currently snaps via destroy+redraw) | `hud.mjs` | MED / S |

### Phase C — Horror-tier visual identity (the marketing hook)

Today the High tier = a tint + 4 rects + invisible scanlines, and Bitter Path is a black screen
with a red CSS border. The research consensus: horror pop is re-parameterization of the same
systems, plus restraint.

| # | Change | Impact / Effort |
|---|---|---|
| C1 | Copy Kaplay's own MIT example shaders `crt.frag` + `vhs.frag` (barrel+scanlines; YIQ color-bleed) into `public/lib/shaders/`, wire via `usePostEffect` — VHS breathing slowly all High tier, CRT only at stingers | HIGH / S |
| C2 | Grading rule: compress value ceiling to ~55–60% L, desat base to 15–25% S, keep exactly ONE accent at 70–90% S (blood-rust or sickly amber). Red reserved for danger beats only; firelight stays warm as the safe anchor to subvert | HIGH / S |
| C3 | 3D High tier: FogExp2 density up, fog color near-black-blue, cool desaturated sun, camera spotlight — the Silent Hill trick; it's also a perf WIN (less visible geometry) | HIGH / M |
| C4 | 8×8 Bayer-dither 4-tone pass (bone-white / dried-blood / lantern-amber / near-black) for nightmare stingers only | MED / S |
| C5 | Film grain (luma-gated simplex) + 3-tap radial chromatic aberration driven by a "dread" uniform that spikes and decays | MED / S |
| C6 | Free wrongness: one ox non-uniformly scaled 1.15–1.3× on one axis, a wheel slightly desynced from speed, one hue 15–20° off — parameter tweaks on existing procedural draws | MED / S |
| C7 | Crow silhouettes (3–5 flat black triangles, flap-animated) on wagon/dead trees, High tier only; one lifts off as a "noticed" beat | MED / S |
| C8 | UI corruption: stat digits redrawn 2–3× with red/cyan offset for 2–4 frames at danger thresholds; brief wrong-digit flicker | MED / S |
| C9 | Sparse composition: High tier removes props — empty horizon, one silhouette, dense fog. Iron Lung finding: absence IS the horror. Cheapest scene is the scariest | MED / S |
| C10 | Sustained micro-shake (1–2 intensity) during Bitter Path (dread) vs decaying trauma² shake for impacts | MED / S |

### Phase D — Mood arc (miles → look). Currently impossible in 3D.

Verified gaps: `terrain.mjs` `BIOMES` has only `prairie` + `mountains` and `bootstrap.mjs`
hardcodes prairie; `sky.mjs` has zero tone-tier awareness (2D `drawSky()` already handles
`tone==='high'`). To express the 8-segment arc: extend BIOMES (snow/desert/forest/misty), wire
biome selection to `miles_traveled`, add a tone-override step in `sky.mjs` mirroring the 2D
pattern. Full 8-segment × 3-tier hex ramp proposal (zenith/horizon/ground/single-accent per
segment, value-compression math for High) is in the research appendix — flagship segment is the
Snake River sunset: crushed near-black ground `#241812` under a hot blood-rust horizon line
`#7a2818` for High tier. Effort L, but it's the difference between "a screenshot" and "a journey."

Process artifact first: a 24-cell color-script grid (8 segments × 3 tiers, 3 swatches each) as a
plain HTML page before touching shader code — the Firewatch method, catches drift for ~1 hour of
work.

### Phase E — Hero-asset upgrades (the only phase that costs money)

- **Meshy-6 Low Poly Mode / Tripo3D** ($20/mo Pro for commercial rights) can generate glTF
  oxen/pioneers; Draco keeps each under ~200–500KB but requires adding GLTFLoader+DRACOLoader
  (~300KB WASM) — new infrastructure, and the prior DEC-A ruling was "procedural for V1, .glb only
  if marketing screenshots underperform." Do phases A–C first; re-shoot; only then decide.
- **Blockade Labs skybox** ($20): mostly redundant — the custom gradient dome + more clouds + IBL
  is cheaper and stays deterministic. Skip unless a hero marketing shot needs it.
- **2D sprite route (AESTHETIC_SPEC.md §4):** if ever executed, use a LoRA-style trained model
  (Scenario ~$45/mo, PixelLab, Layer.ai) rather than the spec's raw per-asset prompting — style
  drift across 14 independent prompts is the exact failure mode that killed AI art here before.
  Spec's model names are stale (DALL-E 3 deprecates Oct 2026 → gpt-image-1.5/2; Midjourney is at
  v8.2). Midjourney Basic $10/mo suffices for commercial rights at OSI's revenue.

---

## 4. Conflicts surfaced (owner decisions)

1. **AESTHETIC_SPEC.md (cartoon-sprite plan) vs the shipped v3 primitive renderer.** Read closely
   they aren't contradictory — the spec was a deliberate, gated supersession attempt (its §13
   validation gate + §10 Indigenous-art cut respond directly to the earlier failure modes) — but
   no decision of record says which is canonical. **Recommendation: primitives+lighting remain
   canonical (Phases A–D); the sprite spec stays shelved unless post-A–C screenshots still
   underperform.** Needs your call.
2. **DEC-A (procedural vs .glb hero models)** was left "pending owner taste sign-off" in the
   osi-context decision log. Phase A3/A4 (toon shading + fur/cloth textures) is the cheap middle
   path — try before buying Meshy.
3. **Memory note `reference_oregon_trail_rendering.md` (640×360)** is stale — canvas is 640×480.
   Updated as part of this research pass.

## 5. Sources (primary)

GDC: A Short Hike postmortem; Art of Firewatch; Juice It or Lose It (+ the counter-talk); Eiserloh
trauma² camera math; Art of Screenshake (Nijman). Dev interviews: Sable/Shedworks readability,
Banner Saga (Jorgensen/Eyvind Earle method), Gameloft Brisbane pixel-over-3D pipeline
(pocketgamer.biz), WTWTLW (Kellan Jett), Flame in the Flood tension design. Engine docs: Kaplay
3001 (`shake`/`flash`/`particles`/`usePostEffect`/`textTransform` — verified in vendored file),
three.js r165 (`MeshToonMaterial` verified in vendored build; `ShaderPass` already vendored).
Horror: Iron Lung minimalism study (SAGE), Obra Dinn/World of Horror dither technique
(landonferguson.com 8×8 Bayer matrix), mattdesl glsl-film-grain. AI tooling: Scenario/PixelLab/
Layer.ai LoRA training, Meshy-6 Low Poly Mode, Blockade Labs, OpenAI/Midjourney licensing terms
(as of 2026-08).
