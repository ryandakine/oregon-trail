# Oregon Trail — 3D Procedural Rendering Layer (Three.js) Plan

**Status:** v2 — revised after eng / design / feasibility / Grok review gauntlet. Pending owner sign-off on 3 decisions (DEC-A/B/C below).
**Author:** Claude Code (planning session 2026-06-12)
**Quality bar / reference:** `../world-of-claudecraft` (procedural Three.js, studied in full)
**Scope:** A new 3D presentation layer that *reads* game state and renders it. **Zero game-logic changes.** No `worker/**` diffs. HMAC chain, server-side simulation, and the full vitest suite stay green.

---

## 0. TL;DR (read this, it's honest about the trade-offs)

Rebuild the *presentation* of the six "world" scenes (travel, river, landmark, hunting, death, arrival) in 3D using the reference's procedural techniques, and keep the existing event/decision UI + HUD as overlays. Work **one scene at a time, screenshot after every change, look at the images, iterate** until the screenshots prove it.

Three honesty corrections the review forced into v2 — internalize these before building:

1. **The reference's good looks are NOT free / NOT pure-procedural.** Its hero screenshots come from its *high* tier: ~19 MB of Poly Haven HDRIs (sky **and** PBR image-based lighting), ambientCG PBR terrain textures, **N8AO** ambient occlusion, **ACES** tonemapping, and `.glb` characters/props. Its *low* tier (the only truly zero-asset path — canvas-gradient sky dome, canvas textures, Lambert, no AO, no post) looks markedly flatter. v1 of this plan accidentally specified the low tier while promising the high-tier look. **v2's answer:** we don't ship 19 MB of HDRIs, but we DO adopt the cheap pillars that actually carry the look — **ACES tonemap + ambient occlusion (baked contact-shadow decals, real SSAO desktop-only) + procedural IBL (PMREM from the canvas sky dome, ~15 lines, no asset) + a normal map on every surface.** Without those, procedural primitives read as a hobbyist Three.js demo. With them, they read as a stylized period piece. This pipeline is **non-deferrable M1 work**, not a "maybe."

2. **Oregon Trail has no continuous position.** The server advances `miles_traveled` in discrete 1–5 day jumps; `Position` is `{current_segment_id, miles_traveled, date}` only. So there is nothing for a "follow camera" to follow. We use the model the existing `travel.js` already proves: **wagon + oxen + party are stationary at a fixed anchor and walk in place; the WORLD scrolls past; the camera is a fixed offset behind the wagon.** "Advance in flight" just toggles the walk animation on/off (mirroring `travel.js` `MOTION_OK`). See §3.1.

3. **"Zero asset files" is true for the reference's *world*, not its *models*.** Terrain + canvas textures are procedural; water/sky load assets; **characters and props are CC0 `.glb`** (KayKit/Quaternius/Kenney). So the wagon/oxen/pioneers/forts are a real fork — see **DEC-A**.

---

## 1. Goal & Success Criteria

**Goal:** The game *looks* like a polished stylized 3D period piece — the trail worn into rolling plains, a covered wagon with turning wheels and an oxen team, party trudging alongside, day into dusk into a campfire night, weather, river fords, fort rests — while playing *identically* to today.

**Done means (verified by screenshots rendered at the REAL tier, not assertions):**
1. `scripts/screenshot-3d-loop.mjs` captures **travel, river crossing, fort, night camp** as PNGs on demand (no play-through), rendered with `?gfx=high` so shadows/bloom/AO/grade are actually present (the harness is software-GL and otherwise captures the flat low tier — see §8).
2. Each milestone's screenshots are inspected and iterated against the **Aesthetic Acceptance Checklist** (§5a), not vibes.
3. Full vitest suite green (**run it — currently 349 tests, do not hardcode the count**); no `worker/**` diff.
4. Event/decision UI + HUD usable as cohesive overlays (not a black modal punched into a sunny scene — §5a).
5. `bun run deploy:smoke` green, extended to assert the 3D world scenes mount with 0 JS errors under `?gfx=high`.
6. Passes a **real mid-range Android perf kill-gate** (§ DEC-B / M0) or the mobile strategy is explicitly demoted.

**Non-goals:** changing pace/rations/health/event mechanics; client-side logic; a database; HMAC changes; rewriting menu-scene *flow*.

---

## 2. Decisions needing owner sign-off

> Memory note: presented as prose recommendations to react to, not a modal.

### DEC-A — Characters & props: pure-procedural vs CC0 `.glb` hero models
The review (design P0 + feasibility P1) showed: (a) the reference ships **zero** procedural characters — its animation polish comes from authored `.glb` clips; (b) the `timeScale`/mixer/clip animation infra **does not port** to primitive rigs — procedural gets only `wheel.rotation.x += speed*dt/r` + a hand-rolled sin gait, and authoring a *convincing* quadruped ox gait is the real M1 tar-pit; (c) a primitive ox built from boxes reads as a brown blob at 1200px marketing-screenshot scale where a `.glb` has muscle/horn/face.
- **Recommendation: split it.** Procedural for terrain / water / sky / landmarks / pioneers (forgiving at distance, matches `draw.mjs` vocabulary, and the zero-asset bar where it's cheap). **CC0 `.glb` for the two hero foreground objects the eye lands on first: the covered wagon and the oxen** (Quaternius CC0 animals + a covered-wagon model), gaining the rigged-clip animation infra exactly where it pays off. This adds ~a few hundred KB of `.glb` to `public/` (SW-cached like Kaplay) and a CC0 attribution line — a self-imposed "zero asset" nicety traded for the actual product goal (screenshot quality).
- **Alternative (pure-procedural, no assets):** keep the zero-asset bar; accept flatter hero models + budget real time to hand-author gaits. Viable, slower to "polished," more code.
- **Need from owner:** pick split (recommended) or pure-procedural. This gates M1.

### DEC-B — Mobile strategy & the dual-renderer question
The reference has **no phone tier** (its "low" is the software-GL path; a real mid-phone autodetects "high": 4096 shadows + composer + MSAA + PBR → single-digit fps / context loss). The current 2D Kaplay game is buttery on phones, and phones are where most marketing traffic lands. Keeping Kaplay 2D "as a fallback" actually means **maintaining two full world renderers forever** (~5k new 3D LOC on top of ~2k retained 2D, every future change landing in both).
- **Recommendation:** treat a **real mid-range Android perf spike as a kill-gate BEFORE M1** (terrain + 1 shadow light + textured wagon, no post; target ≥30fps via a real device / GPU runner, not software-GL). Then commit to ONE of: **(b1)** 3D fully replaces 2D on all devices once a from-scratch *mobile* tier (no composer, shadows off/512, pixelRatio 1, instanced geo, ≤1 dynamic light) passes the gate — and the 2D world renderer is **deleted** (single renderer); or **(b2)** 3D is **desktop-only**, 2D stays the permanent phone/marketing path (accept the divergence cost knowingly). Don't leave "both forever, unowned" as the default.
- **Need from owner:** confirm the kill-gate, and a lean toward b1 (replace) vs b2 (desktop-only 3D).

### DEC-C — Quality pipeline is mandatory, not optional
v1 deferred post-processing. The review showed that's the difference between "period piece" and "untextured demo."
- **Recommendation (low-controversy, confirm):** ACES tonemap + grade pass + ambient occlusion + procedural IBL + per-surface normal maps are **M1 requirements**. Implemented no-build (hand-rolled composer; AO via baked contact-shadow decals on mobile, real SSAO desktop-only). No 19 MB HDRI bundle.

---

## 3. Architecture

### 3.1 Motion model (the P0 fix — internalize before M1)
- Wagon group sits at a **fixed world anchor**; oxen + party at fixed offsets; all self-animate **in place** (walk cycle / wheel spin / leg bob). The **world scrolls past** (translate the terrain/trail/scatter group along −Z, or scroll terrain UV), exactly as `travel.js` parallaxes the 2D layers today.
- **No free-running wagon position.** Optional polish: on each server advance, tween a *small* forward surge + speed-up of the walk/scroll for ~1.5–3 s (keyframe = the new `miles_traveled`), then settle — never a continuous client-invented position that can SNAP when the next advance disagrees.
- **Camera is a fixed offset behind the wagon** (no auto-settle-behind-facing — there is no facing). Per-scene camera presets in §5a.
- **Day/night** is a slow *cosmetic* loop, **deterministic for screenshots** (anchored to `position.date` for season tint; the harness pins a fixed sun elevation per shot — golden-hour for travel, midday for river sparkle, below-horizon for camp). Never wall-clock free-run (breaks visual diffs).

### 3.2 Canvas / DOM stack (z order, back to front)
```
#three-canvas        z-index 0   (fixed, full viewport)   ← NEW: 3D world
Kaplay canvas        (default)   transparent bg           ← HUD + menu scenes (or DOM-HUD fallback)
#html-overlay        z-index 100 event/decision panel (re-skinned cohesive — §5a)
#newspaper/#tombstone z-index 200                          (unchanged)
#ai-loading          z-index 250                           (unchanged)
#rotate-hint         z-index 300                           (unchanged)
```

### 3.3 Module layout (`public/three/`, plain ESM, no build) + explicit importmap
```html
<!-- in index.html, BEFORE any module script that needs it -->
<script type="importmap">
{ "imports": {
  "three": "/vendor/three/three.module.js",
  "three/addons/": "/vendor/three/jsm/"
}}</script>
```
Vendor the **full transitive closure** of the `examples/jsm` subtrees we use (postprocessing/ + shaders/ + utils/ (+ loaders/ only if DEC-A=split for GLTFLoader/MeshoptDecoder)) with **directory structure intact**, version-locked to the exact `three` build. (Grok claimed importmaps can't resolve addons — verified false: addons `import 'three'` (importmap resolves) and relative siblings (resolve against file URL); you just must vendor the whole subtree.) **Drop `n8ao` + the pmndrs `postprocessing` package** (not importmap-clean; n8ao peer-deps postprocessing) — hand-roll `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass(ACES)` + a grade `ShaderPass` from `three/addons` only.
```
public/vendor/three/three.module.js  + jsm/{postprocessing,shaders,utils,loaders}/...   SW-cached
public/three/
  bootstrap.mjs   mount canvas, importmap glue, TIER detect (real mobile tier, not isSoftwareGL),
                  ?gfx= override, RAF loop, WebGL context-loss/resize/orientation/visibility hooks, dispose
  gfx.mjs         tier knobs (shadow size, pixelRatio cap, post on/off, AO mode, point-light budget), sharedUniforms.uTime, SUN_DIR
  pipeline.mjs    WebGLRenderer (ACES, exposure ~1.1, PCFSoft shadows), hemi+dir lighting, fog presets, PMREM IBL from sky dome
  post.mjs        hand-rolled composer: RenderPass + UnrealBloom + OutputPass + GradeShader (lift/gain/sat/vignette/grain). NO n8ao, NO pmndrs.
  textures.mjs    makeCanvas + drawWrapped + heightToNormal; albedo+normal+rough for grass/dirt/trail/canvas/plank/stone/bark; water normal map (canvas)
  terrain.mjs     analytic heightfield + chunking + splat + roadDistance/lerpSplat trail painting   (ports cleanly)
  water.mjs       NEW procedural build (reference loads .jpg normals): PlaneGeometry + aShoreDepth + canvas-normal dual-scroll + foam + fresnel
  sky.mjs         NEW procedural build (reference loads .hdr): canvas-gradient day/night dome + sun/moon sprite + deterministic sun elevation
  vfx.mjs         Points pool: rain/snow/dust/campfire-ember/wagon-dust   (ports cleanly)
  rig.mjs         IF DEC-A=split: AnimationMixer + timeScale walk-match + poseWrap bob + bone wheel-spin (ports). ELSE: wheel-spin + hand-rolled sin gait only.
  models/         wagon.mjs ox.mjs pioneer.mjs landmarks.mjs  (procedural; wagon+ox are .glb loaders if DEC-A=split)
  audio.mjs       TrailAudio: noise()/tone()/adsr() + creak/oxen/river/weather/sting   (ports cleanly; coordinate single AudioContext, gate on first gesture)
  scenes3d.mjs    world-scene router: travel/river/landmark/camp/hunting/death/arrival; mount/dispose contract with Kaplay k.go
  trail-data.mjs  GENERATED, SCOPED to ONLY segment biome/palette + per-region/month weather (NOT landmark type — that's server-enriched)
scripts/
  extract-trail-data.mjs   historical-context.json → trail-data.mjs   (+ vitest staleness guard: regenerate → byte-equality)
  screenshot-3d-loop.mjs   Playwright + ?gfx=high; harness.ts signedStateOverrides seeding + k.go(scene,data); deterministic sun per shot; capture 4 PNGs
```

### 3.4 Data flow (read-only)
Renderer reads `engine.gameState` (HMAC-verified mirror): `position.{miles_traveled,current_segment_id,date}`, `party.members[].{alive,health}`, `supplies.oxen`, `simulation.starvation_days`, and **`engine.tone`** (the canonical getter → `simulation.tone_tier`; NOT `settings.tone_tier`). Trigger payloads drive river (`width_ft/ford_difficulty`) and landmark (**read `type` off the live `currentLandmark` the server already enriches** — verified `index.ts:655-661`). `trail-data.mjs` supplies only segment biome/palette + derived weather. **Never writes state; never calls `/api/*`.**

### 3.5 Scene lifecycle / Kaplay contract (review-mandated)
The 3D layer mounts/disposes through `k.go`. So `travel.js`/`river.js`/`landmark.js`/`hunting.js`/`death.js`/`arrival.js` **will get small mount/dispose hooks** — "frontend-only, no worker changes" holds, but "scene files untouched" is true only for the HUD/overlay, not the scene lifecycle. `deploy-smoke.mjs` must be extended to mount the 3D path under `?gfx=high` and assert 0 errors (it currently smokes the Kaplay path that real users would no longer see).

---

## 4. Technique map (corrected for what actually ports)

| Need | Source | Status |
|---|---|---|
| Trail worn into ground | `terrain.ts` | **Ports** — `roadDistance<2 → lerpSplat(w,1,t)` vs trail spline |
| Rolling plains / passes | `terrain.ts` | **Ports** — analytic height, chunking, slope→rock/snow splat |
| Canvas textures + normal maps | `textures.ts` | **Ports** — `makeCanvas`+`drawWrapped`+`heightToNormal`; **normal map every surface** |
| ACES + grade + bloom | `renderer.ts`/`post.ts` | **Ports (hand-rolled composer, no pmndrs)** — ACES exp ~1.1; LIFT(.012,.010,.018) GAIN(1.05,1.02,.98) sat 1.12 vignette grain |
| Ambient occlusion | `post.ts` n8ao | **Re-built** — baked contact-shadow decals (mobile) / optional real SSAO (desktop) |
| IBL ambient | `renderer.ts` PMREM+HDRI | **Re-built** — PMREM from the canvas sky dome (no HDRI) |
| Lighting | `renderer.ts` §2 | **Ports** — hemi sky 0xcfe8ff/ground 0x46603a + warm dir key 0xffedd0 + shadow frustum follows wagon |
| Day/night, dusk, sun | `sky.ts` low tier | **Re-built procedural** — canvas dome, deterministic sun elevation, fog presets |
| Animated river water | `water.ts` | **Re-built** (ref loads .jpg) — plane + aShoreDepth + canvas-normal dual-scroll + foam + fresnel |
| Weather particles | `vfx.ts` §7 | **Ports** — Points ring-buffer; rain/snow/dust recipes |
| Campfire | `renderer.ts`§4 + lathe | **Ports** — lathe flame + 2-freq sin PointLight flicker + embers + **bloom does the glow** |
| Rigged wagon/oxen (DEC-A=split) | characters infra | **Ports** — mixer + timeScale walk-match (only with `.glb`) |
| Procedural wagon/oxen (DEC-A=pure) | — | **Hand-rolled** — wheel spin + sin gait; no mixer payoff |
| Procedural audio | `audio.ts`/`music.ts` | **Ports** — noise/tone/adsr + instruments + scheduler |
| GFX tiering | `gfx.ts` | **Re-built mobile tier** — ref has none; from-scratch phone profile + real mobile-detect |

(Concrete color/shader/spawn values captured in this session's study output, inlined per module as built.)

---

## 5. Milestones (scene-by-scene, screenshot-driven, real-tier)

Each: build → `screenshot-3d-loop.mjs --gfx=high` → **look at PNGs** → iterate against §5a → **show owner** → next. Full vitest suite green throughout.

- **M0 — Spikes + scaffolding + harness (do the spikes FIRST).**
  1. **Mobile perf kill-gate (DEC-B):** terrain + 1 shadow light + textured wagon, no post, on a real mid Android / GPU runner; trace frame time; ≥30fps or the mobile strategy demotes.
  2. **Kaplay transparency spike (DEC-... D3):** transparent Kaplay over Three at real phone DPI/viewport; verify HUD tick alignment + tap hitboxes; DOM-HUD fallback if flaky (and port the smoke "every control is tap-reachable" assertion to DOM).
  3. **No-build vendoring:** vendor three + jsm closure, importmap, prove a **bloom-composed frame renders with 0 network 404s**.
  4. **Harness:** `screenshot-3d-loop.mjs` with `?gfx=high`, `harness.ts` `signedStateOverrides` seeding, deterministic sun; capture 4 placeholder shots.
  5. **SW cache:** add the vendored three tree to an `OPTIONAL_ASSETS`-style tolerant precache group (bump `CACHE_NAME`), or document first-load-online-required.
  - Gate: spikes pass/decided, 4 PNGs at high tier, vitest green, existing scenes unbroken.
- **M1 — Travel world + the mandatory quality pipeline (DEC-C).** Terrain + trail-painting + **normal-mapped** canvas textures + procedural day sky + **ACES/grade/bloom/AO/IBL** + hemi+warm-key lighting + real-time shadows + wagon (rolling wheels) + oxen + pioneers + **fixed chase cam, off-center rule-of-thirds, low angle, ~35° lens** + world-scroll motion. Iterate to §5a. **Show owner.**
- **M2 — Atmosphere.** Weather particles (derived weather) + deterministic day/night + per-biome fog + tone grade (low/med/high; high=cool+vignette+desat) + wagon dust. **Show owner.**
- **M3 — River crossing.** Procedural animated water scaled by `width_ft`/`ford_difficulty`; **locked wide establishing cam**, wagon entering frame-left; banks/ford stones/ferry; ford/caulk/ferry overlay retained. **Show owner.**
- **M4 — Night camp + campfire.** Parked wagon, party around lathe fire + flickering PointLight + embers + ground-glow + bloom; near-black fog; moon rim; **tight high-angle cam on the fire circle**. **Show owner.**
- **M5 — Landmarks (forts, Chimney Rock).** Prop kit keyed to live `currentLandmark.type`; **low hero angle up at the gate**; rest/trade overlay retained. **Show owner.**
- **M6 — Procedural WebAudio.** TrailAudio creak/oxen/river/weather/sting/bell; single AudioContext, gated on first gesture, no double-play with any Kaplay audio. **Acceptance:** each cue audibly fires on its trigger in a scripted play-through; **show owner with sound.**
- **M7 — Remaining scenes + overlay cohesion + perf.** Hunting (3D meadow), death (atmospheric tombstone), arrival (Oregon City valley); **overlay cohesion pass** (§5a #8); mobile tier LOD/instancing/shadow-gating; screenshot regression; `deploy:smoke` 3D parity. **Acceptance:** all four hero shots pass §5a; cold-load budget met; kill-gate green.

### 5a. Aesthetic Acceptance Checklist (M1 gate = "passes all", not "looks good")
1. ACES tonemap ON (no raw sRGB-linear blowouts).
2. Ambient occlusion present (contact shadows under wheels/hooves/in wagon-bed corners).
3. Warm directional key + cool hemisphere fill (never a single flat light).
4. **Every hero surface** has a canvas albedo **+ normal map** + roughness (no flat-colored faces) on `MeshStandardMaterial`.
5. Fresnel rim light on hero silhouettes (wagon/oxen/pioneers) so they pop off terrain.
6. Subject off-center (rule of thirds), per-scene camera preset (not one follow-cam).
7. Atmospheric depth via fog (far plane is haze, not a hard horizon seam).
8. **Overlay cohesion:** the event panel is NOT today's dark modal punched into the scene — when up, `backdrop-filter: blur(3px) brightness(0.7)` the live 3D canvas, skin the panel as real parchment (PALETTE.parchment + canvas paper-grain + deckled edge + inset shadow), warm-harmonized border, radial vignette behind it. HUD gets the same treatment.

---

## 6. Risks & Mitigations (verified specifics)

- **R1 — DEC-A fork** (procedural vs `.glb` hero). Resolve before M1. Procedural forfeits the animation infra; `.glb` adds assets. *Owner call.*
- **R2 — Quality-bar mismatch.** Mitigated by DEC-C (ACES+AO+IBL+normal-maps as M1 law) + §5a checklist as the iteration target.
- **R3 — Mobile perf, no reference phone tier.** M0 kill-gate on real device; from-scratch mobile tier; mobile-detect not via `isSoftwareGL`. *Highest stall probability.*
- **R4 — Dual-renderer permanence.** DEC-B forces a single owned decision (replace vs desktop-only). No "both forever."
- **R5 — Screenshot oracle blind to its own quality bar** (software-GL → low tier). Port `?gfx=high` escape hatch; run perf on GPU/real device; software-GL frame times are meaningless.
- **R6 — No-build addon graph.** Vendor full jsm closure, both importmap keys, version-locked; M0 proves a composed frame with 0 404s; drop n8ao/pmndrs.
- **R7 — Bundle / cold-load** (~700–900 KB JS vs zero-dep PWA; SW helps 2nd visit only). `modulepreload` three during title/menus; track first-visit cold-load (Fast 3G + 4× CPU) as a hard gate metric; reinforces b2 if it fails.
- **R8 — Motion snap** (discrete advance vs continuous 3D). §3.1 invariant: position is a tween between server mile keyframes / world-scroll, never free-running.
- **R9 — trail-data drift.** Scope to display-only fields; vitest staleness guard (regenerate → byte-equal) + every segment/landmark id resolves.
- **R10 — deploy-smoke goes stale.** Extend it to mount each 3D scene under `?gfx=high`, 0 errors; document the `k.go`↔Three mount/dispose contract.

---

## 7. Invariants Preserved
- No `worker/**` changes. Server-sim, HMAC chain, event-hash/trigger-kind binding, consequence clamping untouched.
- **Full vitest suite green (run it — currently 349 tests; do not hardcode).** 3D work is frontend-only modules + scripts (+ small mount/dispose hooks in world scene files).
- No database, no server session storage, no second LLM provider, no client-side game logic. `trail-data.mjs` is pure display lookup.
- No build step for `public/` (vendored ESM + importmap, like Kaplay).
- High tone tier preserved and enhanced (cool grade + vignette).
- Secrets / `.dev.vars` untouched.

## 8. Verification Plan
- **Screenshots at the real tier** (`--gfx=high`): the primary done-oracle. Looked-at every milestone vs §5a.
- **Tests:** full vitest suite green before any commit; extend the Playwright frontend project to mount the 3D path (under `?gfx=high`) so high-tier regressions are caught.
- **Drift guard:** vitest test regenerates `trail-data.mjs` and asserts byte-equality.
- **Perf:** frame-time probe on a GPU-enabled/real-device context vs the R3 budget; first-visit cold-load (Fast 3G/4×CPU) vs the R7 budget.
- **deploy-smoke:** 3D mount, 0 errors, `?gfx=high`; DOM-HUD tap-reachability if D3 fallback taken.
- **Commits:** split by milestone/concern; each green-screenshot iteration is a commit.

## 9. Review Trail (gauntlet v1→v2)

| # | Reviewer | Sev | Finding | Resolution in v2 |
|---|---|---|---|---|
| 1 | eng / feas | P0 | No continuous position; follow-cam incoherent | §3.1 motion model: stationary wagon + world-scroll + fixed cam; tween-on-keyframe; no free-run |
| 2 | design / feas | P0 | Plan ported the reference LOW tier while promising HIGH-tier look | DEC-C: ACES+AO+IBL+normal-maps mandatory M1; §5a checklist; honest TL;DR |
| 3 | design | P0 | "campfire proves primitives" is false (it's a .glb + bloom) | Struck; DEC-A reframed (geometry ~30% of look); `.glb` for hero wagon+oxen |
| 4 | eng / feas | P1 | n8ao + pmndrs postprocessing not importmap-clean, load-bearing | §3.3: dropped; hand-rolled composer (bloom+grade+ACES) from jsm only |
| 5 | eng | P1 | importmap must vendor full jsm transitive closure, both keys | §3.3 explicit importmap + closure vendoring + M0 0-404 gate |
| 6 | eng | P1 | water/sky are NOT zero-asset in the reference (.jpg/.hdr) | §4 relabeled "re-built procedural"; canvas water-normal + canvas sky dome, no HDR |
| 7 | eng | P1 | trail-data landmark-type derivation redundant (server-enriched) | §3.4: read type off live `currentLandmark`; trail-data scoped to biome+weather |
| 8 | eng / feas | P1 | "can't drift" asserted not built | R9: vitest staleness guard (regenerate → byte-equal) |
| 9 | feas | P1 | Stale test count (236 → actually 349) | §1/§7: "run the suite, don't hardcode" |
| 10 | feas | P1 | Screenshot harness = software-GL = blind to shadows/bloom/AO | §8/M0: port `?gfx=high`; perf on GPU/real device |
| 11 | feas | P1 | Reference has no phone tier; mid-phone autodetects desktop high | DEC-B + M0 kill-gate + from-scratch mobile tier |
| 12 | feas | P1 | Animation infra doesn't port to procedural rigs | §4 corrected; DEC-A (split → get the infra with .glb) |
| 13 | eng / feas | P2 | deploy-smoke couples to k.go; scene files WILL be edited | §3.5 mount/dispose contract; R10; honest "scene lifecycle edits" |
| 14 | design | P2 | "parchment" is actually a dark modal → black box in frame | §5a #8 overlay cohesion (blur live canvas + real parchment skin + vignette) |
| 15 | eng | P2 | tone read from settings vs simulation.tone_tier | §3.4: use `engine.tone` getter |
| 16 | design | P2 | one follow-cam wrong for 3 of 4 scenes | §5a per-scene camera presets |
| 17 | design | P2/3 | normal-maps under-committed; day/night non-deterministic | §5a #4 mandate; §3.1 deterministic sun |
| 18 | eng | P2 | SW precache doesn't cover vendored three | M0 step 5 (tolerant precache group) |
| 19 | eng | P3 | harness seeds via signedStateOverrides, not engine.signedState | §3.3/M0 wording corrected |
| 20 | feas/eng | P2 | Kaplay transparent compositing DPI/tap risks | M0 spike at real phone DPI; DOM-HUD fallback + ported tap-reachability |

**Outstanding before build:** DEC-A, DEC-B, DEC-C owner sign-off.

---

## Status correction (post-build gauntlet, 2026-06-13)

The 3D modules M0–M7 are built and screenshot-beautiful, but a code-reading review found the pillar is **NOT shippable as a V1 feature yet** — it is currently **debt**, not a feature:

- **P0 — not state-wired in real play.** The only runtime bridge is `engine.on('stateChange', show/hide)`. Every state-consuming method (`preset/setMoving/setWeather/enterRiver/enterLandmark/enterDeath/...`) is called ONLY by the screenshot harness + deploy-smoke. In real play the canvas mounts but is stuck on the constant-scroll `travel` preset, blind to miles, river, landmark, death, weather, tone. RIVER shows no water; LANDMARK shows no fort; DEATH shows no grave. **Fix:** a `state→3D` adapter in `main.js`/`three-bridge.mjs` (~a few hundred lines; the API already accepts the opts). Until it exists, don't promote to prod — a 3D prairie that never changes reads as *broken*, worse than absent.
- **P0 — "desktop-only" (DEC-B b2) is paper, not code.** `tierFromQuery()` returns `'high'` for all devices; `main.js` inits 3D for every non-`?test=1` request with no desktop gate. A phone downloads 1.3 MB three + inits 2048 shadows + composer + bloom. **Fix:** gate the `main.js` import behind a desktop check (pointer:fine / no coarse pointer) before shipping.
- **P0 — perf never measured on real hardware.** The kill-gate ran only in the software-GL harness (frame times "meaningless" per R5). "Desktop == capable GPU" is false (integrated-GPU laptops). Run a real frame-time probe at 1080p, hard ≥30fps gate.
- **P1 — dual-renderer, unowned.** The 2D Kaplay world scenes (~2,157 LOC) were never thinned; desktop double-renders 2D + 3D, and every future world change must land in both idioms by a solo dev. Decide: 2D canonical + 3D cosmetic, or delete 2D-world-on-desktop once 3D is wired.
- **P1 — deploy-smoke can't catch the wiring gap** (it drives the API directly, never `stateChange`). Extend it to seed a river/landmark/death state, fire the real `stateChange`, assert the 3D switched.
- **P1 — DEC-A silently resolved to pure-procedural** (the "flatter hero" path the plan warned about; no `.glb`, no GLTFLoader vendored). Get an explicit call with eyes on a real procedural-ox screenshot at marketing scale.
