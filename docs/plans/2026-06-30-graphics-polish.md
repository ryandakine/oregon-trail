# Plan: Graphics polish — make Oregon Trail look cooler

**Status:** Eng + design reviewed. **WS1–WS2 + harness dust + WS4 title in working tree** (uncommitted).  
**Branch:** `kaplay-rebuild`  
**Scope:** Visual polish only — **slim core** after `/plan-eng-review`.  
**Constraint stack:** dual 2D Kaplay + 3D Three backdrop; no frontend build step; deterministic seeds (no `Math.random` in three/*); screenshot harness; mobile 2D-default; no new npm deps.

---

## Goal

Close the gap between **current shipping look** (neon grass, proto ox/pioneers, title that doesn’t match the world) and **“stylized period diorama that screenshots well”**.

**Success:** open title → travel at golden hour → night camp screenshot reads intentional, not “Three.js tutorial.”

---

## Eng-review locks (authoritative)

| ID | Decision |
|---|---|
| **Scope** | **WS1 + WS2 + WS4** core only. WS3 = **retune existing** `wagonDust` (no shimmer / cloud planes). WS5 = **capture-only** (no water/camp/landmarks rewrites). |
| **Palette** | Shared module both paths import (`public/lib/palette.mjs` or export from `draw.mjs`). Include RGB + hex + helper for THREE linear color. Stop comment-mirrored hexes in three/*. |
| **Grass color** | **Texture albedo drives** prairie yellow/ochre. Vertex `grassTint` = mild variation only (shader already multiplies albedo × mild tint). Do not stuff neon into both. |
| **Title asset** | Static `title-hero.png`: max **250KB**, capture **1280×720 @ 1× DPR** (or equivalent compress). SW **`OPTIONAL_ASSETS`** (not `cache.addAll` static). **Procedural fallback** if load fails. Fallback night greens use **PALETTE**, not raw RGB. |
| **Silhouette twins** | 3D `models.mjs` + 2D `draw.mjs` both update. Gate: before/after **2D and 3D** travel screenshots in PR (no shared proportion module). |
| **Harness** | Extend `screenshot-3d-loop.mjs`: dust warmup before freeze capture; optional **2D twin** path for palette/silhouette gates. |
| **Tests** | Palette **unit tests** + Playwright **title fallback** (abort/404 hero → no throw + fallback renders). |
| **Grade** | **OUT.** Composer is `RenderPass → UnrealBloom → OutputPass` only — no existing grade knobs. Horror stays 2D tone overlay this pass. |
| **G-DEC-A** | Procedural silhouettes (no `.glb`). |
| **G-DEC-B** | Capture still for title (not live 3D on title). |

**Unresolved (user declined AskUserQuestion):** Issue 5 formal vote — plan still **recommends** fallback uses PALETTE only (same as title lock row).

---

## Design-review locks (authoritative — `/plan-design-review`)

Initial design score **5/10** → target **9/10** after locks below.  
Designer mockup tool **unavailable** this session (OpenAI org verification). Visual north stars: [mockups/v2-sunset.png](file:///home/ryan/code/oregon-trail/mockups/v2-sunset.png), [mockups/v2-hero-wagon.png](file:///home/ryan/code/oregon-trail/mockups/v2-hero-wagon.png), current [screenshots/launch/01-title.png](file:///home/ryan/code/oregon-trail/screenshots/launch/01-title.png) as anti-pattern (neon Daily).

| ID | Decision |
|---|---|
| **D-IA** | **Poster stack** hierarchy: (1) brand gold title (2) wagon as visual anchor — hero lower third free of chrome (3) primary ENTER parchment (4) Daily + Challenge as secondary plaques. Dark scrim top ~30% + bottom ~25% over hero for type. |
| **D-Fallback** | Hero fail → **warm night camp poster** (PALETTE moon/silhouettes/wagon), same UI stack. Not blank, not neon hills. |
| **D-Mood** | Title hero still = **golden-hour travel** (hope / trail ahead). |
| **D-Chrome** | Parchment system from `AESTHETIC_SPEC`: panel `#2a1f0e`, text `#f5e6c8`, accent `#d4a017`, outline `#3a2a1a`. **No green terminal** Daily. ENTER = primary solid plaque; Daily = secondary outline plaque. |
| **D-A11y** | Title CTAs: ≥44px logical hit areas (ENTER, Daily, Resume); body contrast ≥4.5:1; `onClick`/`area` on CTA rects for phone; keep canvas aria-label. |
| **D-Crop** | 16:9 still on 4:3 canvas = **cover crop**, wagon biased to **lower third**, sky for title scrim. No inner letterbox bars. |
| **D-Type** | Keep Plex for this pass (eng OUT Peaberry). Title ~42 display gold; body/meta smaller cream on dark scrim. |

### Title layout sketch (640×480)

```
+------------------------------------------+
| ~~~~ dark scrim ~~~~  THE OREGON TRAIL   |  y~100–160 brand
|                   - AI Edition -         |
|         [ D ] Daily   (secondary)        |  y~190–220
|              meta line                   |
|                                          |
|     (hero wagon — lower third, no UI)    |
|                                          |
| ~~~~ bottom scrim ~~~~                   |
|  [ENTER begin]     [Weekly challenge]    |  primary + plaque
|  [R resume?]  [V 3D?]                    |  tertiary
+------------------------------------------+
```

### Interaction states (title)

| Feature | Loading | Empty/fail | Error | Success |
|---|---|---|---|---|
| Hero still | brief solid sky/scrim until sprite ready | warm night poster (D-Fallback) | same as fail | full-bleed cover crop |
| Daily | — | N/A | — | outlined parchment CTA or completed line |
| ENTER | blink prompt | — | — | begins run |
| 3D toggle | desktop only | hidden on touch-only | private mode no reload | reload applies |

### Journey arc (5 sec / 5 min)

| Time | User feels | Plan supports |
|---|---|---|
| 5s | "This is a real game / trail" | Golden still + brand + clear ENTER |
| 5m | "I can survive / it's written live" | Unchanged gameplay; polish only first paint + travel look |
| Return visit | "My best run matters" | Meta line stays; parchment not neon |

### Design NOT in scope

| Item | Why |
|---|---|
| Full DESIGN.md rewrite | Cite AESTHETIC_SPEC; optional later `/design-consultation` |
| Peaberry font swap | Eng OUT |
| Full mid-run HUD redesign | Slim polish; only ensure contrast on new prairie |
| Motion-heavy title particles | Subtraction default; still + scrim enough |
| gstack designer mockups | Blocked on OpenAI org verify this session |

### What already exists (design)

- `AESTHETIC_SPEC.md` palette + three-layer language  
- `mockups/v2-*.png` painterly north stars  
- `title.js` layout structure (reuse positions; re-skin + scrim + hero)  
- Plex font already loaded in `main.js`

---

## What already exists (reuse, don’t rebuild)

| Sub-problem | Existing | Plan action |
|---|---|---|
| Wagon dust | `vfx.wagonDust` + bootstrap every 0.55u while moving | **Retune** rate/color/size from palette; do **not** re-implement emitters |
| Composer / ACES / bloom | `bootstrap.mjs` EffectComposer | Leave alone; no new post stack |
| Palette RGB | `draw.mjs` `PALETTE` | Lift to shared module; three imports it |
| Contact shadows / rim | `models.mjs` | Keep; silhouette pass builds on them |
| Title procedural night | `title.js` | Fallback path after hero; polish colors to PALETTE |
| Screenshot loop | `scripts/screenshot-3d-loop.mjs` | Extend for dust warmup + 2D twin |
| FPS downgrade | `fps-gate.mjs` + bootstrap | Dust retune must not trip gate; first knob if FPS drops |
| Title scene tests | `setup-scenes.test.ts` T-title-* | Add fallback case |
| SW cache | `CACHE_NAME` + OPTIONAL_ASSETS | Bump name on deploy; hero in OPTIONAL |

---

## Workstreams (slim)

### WS0 — Done via eng review
Locks above. No further product decisions required for implement start.

### WS1 — Shared palette + prairie retune (~0.5d)

1. Add `public/lib/palette.mjs` (or export `PALETTE` + `toHex` / `toThreeLinear` from draw after split).
2. Point `draw.mjs` at it; replace three hardcoded greens/ox/fog/backstop/tuft where listed.
3. **Albedo-first grass:** repaint `textures.mjs` grass maps toward dry wheat; keep vertex tint mild.
4. Also touch (outside original list — outside voice): grass tuft paint, bootstrap backstop `0xb9c4a0`, terrain GLSL grass fallback vec3, hemi ground if still neon, `vfx` dust ochre → `PALETTE.dust`.

**Files:** `public/lib/palette.mjs` (new), `public/lib/draw.mjs`, `public/three/terrain.mjs`, `textures.mjs`, `grass.mjs`, `sky.mjs` (fog only if needed), `bootstrap.mjs`, `vfx.mjs` (dust color), unit test file.

**Acceptance:** Side-by-side old `01-travel.png` vs new — not “Minecraft spring.” 2D travel matches direction.

### WS2 — Hero silhouettes 3D + 2D (~1d)

**Oxen:** longer muzzle, eye pit, ear nubs, thicker horns, dewlap, draft proportions, cream blaze variants.  
**Pioneers:** shoulder mass, skirt volume, taller hat / bonnet flare, walk bob.  
**2D:** same silhouette language in `drawOx` / `drawPioneer`.

**Files:** `public/three/models.mjs`, `public/lib/draw.mjs` (draw helpers).

**Acceptance:** 96×64 ox crop reads ox; 32×48 hat vs bonnet; dual-mode screenshots in PR.

### WS3 — Dust retune only (~1–2h)

Tune existing `wagonDust` (count, alpha, color from palette, maybe 0.55u gate). Respect reduced-motion if easy (optional: skip dust when `prefers-reduced-motion`).

**Harness:** before capture, simulate N frames of movement / call dust emit so freeze shots show dust.

### WS4 — Title cohesion (~0.5–0.75d) — eng + design locks

1. Capture **golden-hour travel** via harness @ 1× → compress ≤250KB → `public/assets/title-hero.png`.
2. `title.js`: hero **cover crop**, wagon **lower third**; **top/bottom scrims**; **poster stack** (D-IA).
3. Fail path: **warm night camp poster** (D-Fallback), same chrome stack.
4. Parchment tokens (D-Chrome); Daily secondary outline; ENTER primary.
5. Tap/click areas ≥44px for ENTER/Daily/Resume (D-A11y).
6. SW: `/assets/title-hero.png` in **OPTIONAL_ASSETS**; bump `CACHE_NAME`.

### WS5 — Capture-only marketing set (~2h)

Re-run screenshot loop for travel / river / camp / (optional horror). No scene lighting rewrites. Owner picks keepers.

### Harness (blocking for gates)

`scripts/screenshot-3d-loop.mjs`:
- Dust warmup path for travel shots
- 2D twin export path for WS1/WS2 PR evidence (e.g. `?test` + `ot_render_mode=2d` or hide three canvas, show Kaplay)

---

## Explicit OUT / NOT in scope

| Item | Why |
|---|---|
| Heat shimmer / cloud shadow crawl | Cut in slim scope |
| New GradeShader / horror 3D grade | Composer has no grade pass; OUT this plan |
| Water/camp/landmark rewrites | Capture-only WS5 |
| CC0 `.glb` heroes | Procedural first |
| Peaberry font swap | Separate product call |
| Photoreal / SSAO / n8ao | Prior rebuild forbade |
| Gameplay / AI / server | Different roadmap |
| Softening Horror math | Roadmap said no |
| Merge 2D+3D into one renderer | DEC dual-renderer holds |
| Pixel golden-file CI | Flaky software-GL |

---

## Sequencing

```
WS1 palette module + prairie     0.5d
WS2 silhouettes 2D+3D            1.0d   (after or overlap late WS1)
Harness dust+2D twin             0.25d  (before screenshot gates)
WS3 dust retune                  0.1d
WS4 title hero + SW + fallback   0.5d   (after WS1/2 preferred)
WS5 capture set                  0.25d
Tests (palette unit + title)     0.25d  (with WS1/WS4)
────────────────────────────────────
Total                            ~2–2.5 focused days
```

**Ship gates**
1. After WS1+2: dual-mode screenshots + silhouette thumbs.
2. After WS4: title A/B vs `screenshots/launch/01-title.png`; ≤250KB asset.
3. `npm test` green; deploy cache bump.

---

## File touch map (slim)

| File | WS |
|---|---|
| `public/lib/palette.mjs` | 1 new |
| `public/lib/draw.mjs` | 1, 2, 4 fallback colors |
| `public/three/terrain.mjs` | 1 |
| `public/three/textures.mjs` | 1 |
| `public/three/grass.mjs` | 1 |
| `public/three/bootstrap.mjs` | 1 backstop/fog |
| `public/three/vfx.mjs` | 1 dust color, 3 |
| `public/three/models.mjs` | 2 |
| `public/three/sky.mjs` | 1 only if fog keyframes need it |
| `public/scenes/title.js` | 4 |
| `public/assets/title-hero.png` | 4 new |
| `public/sw.js` | 4 OPTIONAL + CACHE_NAME |
| `scripts/screenshot-3d-loop.mjs` | harness |
| `test/frontend/setup-scenes.test.ts` | title fallback |
| `test/…` or `worker/tests` palette unit | 1 |

---

## Test plan

```
CODE PATHS
[+] palette.mjs
  ├── exports RGB/hex consistency     [★★★] unit test — new
  └── toThreeLinear finite            [★★★] unit test — new
[+] title.js
  ├── hero load success               [★★] smoke objects + no __ERRORS
  └── hero 404 / abort → fallback     [★★★] Playwright route abort — new
[+] models/draw silhouette            [★] screenshot harness + dual PNGs in PR
[+] dust after retune                 [★] harness dust-warmup travel PNG
[+] render-mode toggle                [★★] existing tests

USER FLOWS
[+] First open title                  [★★★] fallback + hero paths
[+] Desktop 3D travel                 [★] screenshot-3d-loop
[+] Phone/2D travel                   [★] 2D twin harness / manual

COVERAGE target: automated gaps closed for palette + title fallback;
  visual gates for silhouette/dust via harness PNGs in PR.
```

**REGRESSION:** Changing palette must not break `T-title-*` object-count assumptions — update tests if layout shifts.

---

## Failure modes

| Path | Failure | Test? | User sees |
|---|---|---|---|
| title-hero 404 | load fails | Playwright abort | Fallback night (must not blank) |
| title-hero oversized | slow SW install | size check in PR / script | Slow first load |
| SW STATIC mis-list | install fails offline | **Don’t use STATIC** for hero | Broken PWA |
| palette desync 2D/3D | different greens | dual screenshots | “two games” |
| dust invisible in harness | false “no dust” review | harness warmup | N/A (dev) |
| more ox meshes | FPS dip | fps-gate | Auto-downgrade to 2D |
| 3D init fail | existing catch | existing | 2D only |

**Critical gap if skipped:** title load without fallback → blank/broken title (mitigated by 2A lock).

---

## Risk register

| Risk | Mitigation |
|---|---|
| Double-desat grass | Albedo-first rule |
| Silhouette balloon | Time-box WS2; thumbs at 50% |
| Title bake stale after palette change | Recapture before ship; note in PR |
| Texture module caches in tests | Unit-test pure palette helpers only |
| Plan agents re-expand WS3/5 | This locks section is authoritative |

---

## Parallelization

| Step | Modules | Depends on |
|---|---|---|
| Palette module + three rewires | `public/lib/`, `public/three/` | — |
| Silhouette models | `public/three/models.mjs` | palette colors optional |
| Silhouette 2D draw | `public/lib/draw.mjs` | palette |
| Harness | `scripts/` | — |
| Title + SW | `public/scenes/`, `public/sw.js`, assets | better after palette+silhouettes for capture |
| Tests | `test/frontend/`, unit | palette + title API |

```
Lane A: palette module → three grass/terrain/textures → dust color
Lane B: harness dust+2D twin (parallel with A)
Lane C: models silhouettes (after palette hex stable)
Lane D: draw silhouettes (parallel C after palette)
Then: title capture + title.js + SW
Then: tests + WS5 captures
```

Conflict: `draw.mjs` in A and D — sequential on that file or one PR.

---

## Implementation notes

1. Prefer one PR for WS1+palette tests; second PR WS2; third WS4+title test+SW.
2. Before/after PNGs in every visual PR.
3. Match `models.mjs` dispose/phase/rim contracts.
4. Never put `title-hero.png` in `STATIC_ASSETS` `addAll` until file exists in repo.
5. Cache-bump on deploy so PWAs see polish.

---

## One-line summary

**Shared palette + albedo-driven prairie → ox/pioneer silhouettes (2D+3D) → retune existing dust → title still (≤250KB, SW optional, fallback) → harness that can prove it.**

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | eng inbox pending paste-back |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues, slim scope, harness work |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | 5/10 → ~9/10; poster stack, parchment, crop, a11y |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE (eng):** Claude subagent; harness dust/2D twin, albedo-first, SW OPTIONAL. Codex inbox optional paste-back.
- **DESIGN:** Mockup generator blocked (OpenAI org verify). Locks from interactive passes + aesthetic mockups as north star.
- **UNRESOLVED:** Eng issue 5 formal vote declined (covered by design D-Fallback). Designer variants not generated.
- **VERDICT:** ENG + DESIGN CLEARED (PLAN) — ready to implement slim graphics polish.
