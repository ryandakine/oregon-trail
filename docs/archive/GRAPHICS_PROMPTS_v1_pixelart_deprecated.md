<!-- /autoplan restore point: /home/ryan/.gstack/projects/oregon-trail/kaplay-rebuild-autoplan-restore-20260416-165400.md -->

# ⚠️ AUTOPLAN REVIEW IN PROGRESS — CEO phase findings below

<details>
<summary>CEO Phase findings (both voices agree → multiple user challenges)</summary>

## Mode: SELECTIVE EXPANSION
## What already exists
- **Engine**: Kaplay 3001, 640x480, 16 scenes registered in `public/main.js`
- **Rendering**: 100% primitives (rects, circles, text) — `public/scenes/travel.js` and all others hand-draw via `k.rect()` / `k.color()`. No `loadSprite`, no `loadFont` calls anywhere.
- **Asset dirs**: `assets/sprites/`, `assets/landmarks/`, `assets/ui/`, `assets/fx/` — all empty. Only `assets/palette.hex` (32 colors) and `assets/_placeholder.png`.
- **Scripts**: `scripts/generate-cache.js`, `scripts/calibrate.js` — LLM prompt calibration, NOT image generation.

## NOT in scope
- Runtime AI image generation (deferred — see Codex finding #4 + Claude finding #4)
- DESIGN.md design system doc (deferred)
- Removing/rewriting the 15 hand-drawn scenes (deferred — art integration happens later)
- Art commissioning decision (deferred to user gate)

## CEO Consensus Table

| # | Dimension | Claude subagent | Codex | Consensus |
|---|-----------|-----------------|-------|-----------|
| 1 | Is this the right problem to solve now? | NO — game works, graphics not the bottleneck | NO — art factory instead of proving the hook | **DISAGREE with plan** ✋ |
| 2 | Is asset scope right? (60+) | NO — Pareto 10 hero assets | NO — unserious for marketing demo | **DISAGREE with plan** ✋ |
| 3 | Pipeline readiness? | (implied gap) | NO — `public/main.js` has no sprite loader | **DISAGREE with plan** ✋ |
| 4 | AI art production feasible? | NO — style drift, cleanup cost | NO — fantasy assumption, cleanup disguised | **DISAGREE with plan** ✋ |
| 5 | SNES/Stardew aesthetic right? | NO — commodity, anti-AI-native | NO — invites wrong comparison | **DISAGREE with plan** ✋ |
| 6 | Cultural risk addressed? | (silent) | NO — Indigenous AI art is brand risk | **Codex-flagged critical** 🚨 |
| 7 | Marketing causal chain? | NO — no instrumentation, chain weak | NO — no share-rate thinking | **DISAGREE with plan** ✋ |

CONFIRMED = 0/7. DISAGREE = 7/7. This is a massive user-challenge cluster.

## User Challenges Raised (surface at gate)

### Challenge A: Scope — 60+ assets → 10 hero assets
**You said:** Generate 60+ sprite/background/UI/FX prompts organized by folder.
**Both models recommend:** Ship ~10 hero assets only (wagon, 1 pioneer, 1 parallax bg, tombstone, newspaper, 6 icons). Keep primitives everywhere else.
**Why:** Style drift risk high across 60 AI assets. Marketing ROI is in the share artifacts (newspaper/tombstone), not parallax backgrounds nobody screenshots.
**What we might be missing:** You may have a specific screenshot-for-marketing plan that needs rich scenes. You may want full coverage for reseller/derivative use. You may be scope-setting for a follow-on artist hire.
**If we're wrong, cost is:** 10 hero assets + primitives may feel unfinished vs. the 60-asset fully-arted version for a specific marketing shot you had in mind.

### Challenge B: Aesthetic — SNES/Stardew → AI-native signature
**You said:** Pixel art, SNES/Genesis era, Oregon Trail II + Stardew + Chrono Trigger reference.
**Both models recommend:** Pick an AI-ownable aesthetic (runtime-generated horror tableaus, glitch art for High tier, hand-drawn journal pages, or brutalist primitives-as-statement). SNES pixel art is commodity positioning.
**Why:** The game's differentiator IS AI. Visual system should SHOW that, not imitate beloved 1995 commercial games you can't match.
**What we might be missing:** Ryan's horror-tier memory says "horror tier IS the marketing hook — don't cut." SNES pixel art may be fine if the horror tier gets the AI-native treatment separately. Also pixel art is dramatically faster to generate than full-scene illustrations.
**If we're wrong, cost is:** Players see another pretty indie game, not an AI novelty. Shareability lower.

### Challenge C: Integration vacuum — generate art first vs. build pipeline first
**You said:** (implicit) generate assets, then integrate into scenes.
**Codex recommends:** Build the Kaplay sprite loader, atlas structure, anchor points, z-order rules in `public/main.js` FIRST, THEN generate 1-2 test assets to validate, THEN scale. Otherwise: cleanup debt.
**Why:** `public/main.js:45-70` has no `loadSprite` calls. `public/scenes/travel.js:18-80` hand-draws everything. Dropping 60 PNGs into `assets/` does nothing until the code loads them. Current "TODO: ASSET" comments from the old KAPLAY_REBUILD_PLAN.md never got wired up.
**What we might be missing:** You may intend to write the loader after generating a few samples, which is fine if done as 1 asset → loader → scale.
**If we're wrong, cost is:** Small — sequencing, not scope.

### Challenge D: Cultural risk — Indigenous AI art
**You said:** Include AI-prompted Native American NPC, Indigenous camp scene, Indigenous Nations references.
**Codex recommends (🚨 security/brand risk, not preference):** Either remove AI-generated Indigenous character depictions from v1, OR require human-authored and reviewed assets for those scenes. "Respectful, no caricature" in the prompt is NOT risk management.
**Why:** One bad AI output = reputational damage to OSI. Prompt engineering can't reliably prevent caricature. Human artist + consultant is the only safe path.
**What we might be missing:** You may plan to hand-review every Indigenous output before shipping. You may commission a sensitivity consultant.
**If we're wrong, cost is:** A viral screenshot of a stereotyped Indigenous sprite becomes the thing OSI is known for.

### Challenge E: Marketing funnel instrumentation gap
**Both models recommend:** BEFORE any asset work, add UTM-tagged CTA at game end ("Built by OSI — we pentest things → osi-cyber.com"), track click-through via Plausible (already wired per memory). THEN decide if graphics move the number.
**Why:** No conversion data exists today. You can't optimize what you don't measure. Pretty art with no funnel = decorative expense.
**What we might be missing:** You may have this planned separately or consider it post-art work.
**If we're wrong, cost is:** 1 day of instrumentation that should happen regardless.

## Failure Modes Registry (CEO level)

| # | Failure | Trigger | Visible? | Action |
|---|---------|---------|----------|--------|
| CEO-F1 | AI-generated Indigenous art ships as-is, one sprite is stereotyped | Direct prompt-to-production workflow | YES (public screenshot) | 🚨 Must gate: human review for Indigenous assets |
| CEO-F2 | 60 AI assets ship, half look inconsistent, game looks worse than primitives | Style drift at scale | YES (players see ugly game) | Cap at 10 hero, expand only after A/B |
| CEO-F3 | Ship 60 assets, nobody plays, zero traffic | No marketing funnel | INVISIBLE (no data) | Instrument funnel BEFORE art work |
| CEO-F4 | Sprite loader never built, 60 PNGs sit in repo unused | Plan silent on integration | VISIBLE only to maintainers | Gate art gen on pipeline readiness |
| CEO-F5 | "Midjourney limit locked colors" in prompt doc ≠ actual Midjourney capability | Post-process palette lock won't fix shape/lighting drift | Silent (ship inconsistent assets) | Budget cap + kill criterion |

## Dream state delta
**This plan leaves us:** With 60 art prompts and no sprite loader. Art assets are hypothetical.
**12-month ideal:** Oregon Trail AI Edition ships a visual system where the AI tier drives unique visuals per playthrough — horror-tier deaths generate shareable AI tableaus via fal.ai ($0.003/image), cached in R2, signed and served by the Worker. Screenshot-optimized artifacts (tombstone, newspaper) are polished to museum-grade. Primitives persist for non-hero scenes. **Gap:** 80% of the work. Plan doesn't bridge any of it.

---
</details>

<details>
<summary>Design Phase findings (both voices agree on 7/8 dimensions)</summary>

## Design Consensus Table

| # | Dimension | Claude subagent | Codex | Consensus |
|---|-----------|-----------------|-------|-----------|
| 1 | Information hierarchy specified? | NO — mood words, no focal/secondary/tertiary | NO — leaves hierarchy to image model | **CONFIRMED gap** 🚨 |
| 2 | Missing UI states covered? | NO — only button + pressed | NO — no hover/disabled/focus/loading/error/empty | **CONFIRMED gap** 🚨 |
| 3 | Responsive/mobile strategy? | NO — 44px touch targets missing | NO — portrait layout absent, icons too small | **CONFIRMED gap** |
| 4 | Accessibility (WCAG)? | NO — red/green-only health, no contrast table | NO — no screen reader, no keyboard focus | **CONFIRMED gap** |
| 5 | Micro-interactions? | NO — transitions/timing absent | NO — static skins not interaction design | **CONFIRMED gap** |
| 6 | Style drift controls? | NO — palette-lock won't fix proportions/lighting | NO — camera/horizon/light direction unenforced | **CONFIRMED gap** 🚨 |
| 7 | Typography readability? | NO — no min sizes, mobile collapse risk | NO — Press Start 2P bad for body copy | **CONFIRMED gap** |
| 8 | Tone-tier visual differentiation? | NO — one palette for Low/Medium/High | NO — horror is effect pack, not visual mode | **CONFIRMED gap** 🚨 |

CONFIRMED gaps = 8/8.

## Claude design additions (missing haunting details)
- **Mood arc table** (miles → background / palette shift) — currently none, every screenshot looks interchangeable
- **Time-of-day variants** (dawn/dusk/night color multiply layer per game-day)
- **Party mortality on wagon** (visible deaths: fewer walkers, extra bedrolls on roof, more mud)
- **Named grave cemetery scroll** (after N deaths, show accumulating markers — viral artifact)
- **Tier-specific title screen** (High-tier lands on a visually wrong title — crow, second moon, glitch)
- **Negative space as dread** (not blood splatter — "something slightly off" in High variants of every bg)

## Codex design additions
- **Missing game-state art**: sold-out store, unknown river depth, no animals in hunting, disabled party member slot, out-of-funds dim state
- **Selected vs unselected** tone choice treatment missing
- **Empty inventory slot** art
- **Error banner** for API failures

## Tone-tier recommended matrix (from Claude subagent)

| Asset | Low | Medium | High |
|---|---|---|---|
| Palette | full 32 | desat 10% | desat 30% + red-shift shadows |
| Sky | cumulus warm | mixed neutral | sodium-yellow haze + sickly-green stormline |
| Wagon canvas | cream | weathered cream | stained/torn variant required |
| UI parchment | clean | light stain | heavy stain + ink bleed |
| Vignette | none | subtle | heavy + pulse on event trigger |
| Campfire | orange/yellow | orange | sickly green flicker |
| Crow density | 0 | 1 distant | 3+ closer |
| Corpse sprite | respectful | same | + disturbed earth, bone variant |

Plus High-only overlays: `horror_vignette.png` (pulsing), `horror_scanline_strip.png` (CRT ambient 0.05 → 0.3 on agency-steal).

</details>

<details>
<summary>Engineering Phase findings (blockers confirmed by both voices)</summary>

## Eng Consensus Table

| # | Dimension | Claude subagent | Codex | Consensus |
|---|-----------|-----------------|-------|-----------|
| 1 | Runtime pipeline exists? | NO — main.js has no loadSprite | NO — loading.js cosmetic, not wired | **CONFIRMED blocker** 🚨 |
| 2 | Canonical name→path manifest? | NO — need `public/assets.js` | NO — doc contradicts itself | **CONFIRMED blocker** 🚨 |
| 3 | Animation strip config complete? | NO — sliceX/anims missing | NO — needs explicit frame metadata | **CONFIRMED gap** |
| 4 | 9-slice inset values? | NO — 48x48 source but no inset numbers | NO — Kaplay needs `{left,right,top,bottom}` pixel insets | **CONFIRMED gap** |
| 5 | Payload + first-paint story? | NO — est ~3MB, 16s on 4G without tiered preload | NO — 60 files = 60 fetches, startup latency risk | **CONFIRMED risk** 🚨 |
| 6 | Spritesheet / atlas strategy? | NO — recommend 3 atlases (UI/chars/FX) | NO — selective atlas recommended, Aseprite alternative | **CONFIRMED gap** |
| 7 | PWA/SW cache invalidation? | NO — STATIC_ASSETS has no art, CACHE_NAME stale | NO — unpkg cross-origin Kaplay not cached either | **CONFIRMED blocker** 🚨 |
| 8 | Palette enforcement + frontend tests? | NO — `scripts/validate-palette.js` needed | NO — vitest only covers worker, palette.hex unenforced | **CONFIRMED blocker** 🚨 |
| 9 | Fallback behavior? | NO — scene crashes on missing asset | (implied) | **CONFIRMED gap** |
| 10 | Incremental rollout / POC? | NO — big-bang risk high | NO — POC recommended (1 sprite + 1 bg + loader + smoke test) | **CONFIRMED gap** |

CONFIRMED = 10/10 gaps. **5 blockers must be addressed before any asset generation begins.**

## Eng Required Artifacts (not yet in plan)

1. **`public/assets.js` manifest**: `{id, path, size, sliceX, sliceY, anims, slice9, cacheGroup}` per asset
2. **Refactored `public/scenes/loading.js`**: listens to `k.loadProgress()`, gates `engine.init()` on 100%
3. **`scripts/validate-assets.js`**: CI check — PNG exists, dimensions match manifest, alpha present
4. **`scripts/validate-palette.js`**: CI check — every color ∈ `assets/palette.hex` (5% AA tolerance)
5. **`public/tests/smoke.html` or Playwright test**: loads page, asserts no `onLoadError`
6. **Updated `public/sw.js`**: hash-based `CACHE_NAME`, art paths in precache, version bump per deploy
7. **Fallback helper**: `drawWagonPrimitive(k)` factored out of `travel.js:87-135` — still runs when `k.getSprite("wagon")` missing

## Test Diagram (Section 3 mandatory output)

| UX flow / Data flow | Coverage | Gap |
|---|---|---|
| Sprite load success path | Not tested | 🚨 Need smoke test |
| Sprite load 404 | Not tested | 🚨 Need fallback assertion |
| Palette drift (off-palette color ships) | Not tested | 🚨 Need `validate-palette.js` |
| Canvas dimensions change (640x480 → 640x360) | Not tested | Need manifest size validation |
| SW cache serves stale art | Not tested | Manual only |
| Mobile 4G first-paint < 5s | Not measured | Add Lighthouse check |
| Seamless parallax tile alignment | Not tested | Add pixel-diff on edges |

**Eng verdict:** Ship a POC first — canonical manifest + 1 eager sprite + 1 lazy parallax + real loading/error UI + frontend smoke test. Generating 60 assets before this pipeline exists is producing inputs for a pipeline that does not exist.

</details>

<details>
<summary>DX Phase findings (all 10 agree)</summary>

## DX Consensus Table

| # | Dimension | Claude DX subagent | Codex DX | Consensus |
|---|-----------|-------------------|----------|-----------|
| 1 | Time-to-first-asset < 5 min? | NO — 45-90 min, multiple trip hazards | NO — hostile onboarding, autoplan block first | **CONFIRMED gap** |
| 2 | Prompt portability across tools? | NO — single format breaks MJ/SDXL/DALL-E differently | NO — overstated, need per-tool templates | **CONFIRMED gap** |
| 3 | Acceptance criteria? | NO — no palette/dim/style gate | NO — no Definition of Done | **CONFIRMED gap** 🚨 |
| 4 | Naming contract self-consistent? | NO — references `main.js` that doesn't define names | NO — doc contradicts itself AND KAPLAY_REBUILD_PLAN | **CONFIRMED bug** 🚨 |
| 5 | Error recovery loop? | NO — palette-lock doesn't fix shape/light/composition | NO — no regen playbook | **CONFIRMED gap** |
| 6 | Escape hatches (RGBA / primitives / placeholder)? | NO — doc is all "lock it / must match" | NO — `_placeholder.png` noted but no fallback pattern | **CONFIRMED gap** |
| 7 | Docs findability? | OK-ish — scannable but no FAQ | NO — two audiences blurred | **CONFIRMED gap** |
| 8 | Integration example? | NO — no code sample | NO — no loader / scene wiring example | **CONFIRMED gap** 🚨 |
| 9 | Tooling cost/choice realistic? | NO — 5 tools, no cost estimate, no "start here" | NO — only MJ flag hint, nothing concrete | **CONFIRMED gap** |
| 10 | Upgrade path (palette/canvas change)? | NO — no versioned manifest | NO — tiers aspirational not operational | **CONFIRMED gap** |

CONFIRMED = 10/10 gaps.

## 🚨 CRITICAL CROSS-CUTTING FINDING (Claude DX)

**GRAPHICS_PROMPTS.md says 640x480. Reference memory `reference_oregon_trail_rendering.md` says 640x360. CLAUDE.md §1 and §8 say 640x480. Current `public/main.js:3-10` is 640x480.** Memory note is stale — but nobody has reconciled. Before any asset generation: update or retire the memory note. Otherwise 60 PNGs may be regenerated at the wrong size.

## Developer Journey Map (9-stage table)

| Stage | Current state | Target |
|---|---|---|
| 1. Discover | GRAPHICS_PROMPTS.md exists but mixes artist + engineer content | Split Quickstart vs Reference |
| 2. Install tools | 5 tools listed, no cost, no start-here | "Start with Pixel Lab Pro ($20/mo) + Aseprite ($20)" |
| 3. First prompt | Copy from §1.1 — but which tool's format? | Per-tool template |
| 4. Generate | 1-5 tries per asset, inconsistent output | Regen playbook + credit cap |
| 5. Post-process | "Lock palette" — how? | Exact ImageMagick/Aseprite commands |
| 6. Name the file | Ambiguous — main.js has no expectations | Copy from `assets/manifest.json` |
| 7. Integrate into scene | No example, engineer guesses | Hello-world loader snippet |
| 8. Validate | No QA gate | Run `scripts/validate-asset.js` |
| 9. Ship | No checklist | "POC → preview URL → canary → main" |

**DX Scorecard:**

| Dimension | Score (0-10) | Target |
|---|---|---|
| Getting started (TTHW) | 2 | 8 |
| API/CLI ergonomics | N/A | N/A |
| Error handling | 2 | 8 |
| Documentation | 5 | 9 |
| Upgrade path | 1 | 7 |
| **Overall** | **2.5** | **8** |

**DX highest-value fix** (both voices): Rewrite the top of the doc as a one-page quickstart for exactly `sprites/wagon.png` — prompt + export settings + filename + validation checklist + Kaplay loader snippet to make it appear in-game.

</details>

---

## 🎯 CROSS-PHASE THEMES

These concerns appeared in 2+ phases' dual voices independently — high-confidence signals:

1. **Pipeline-before-art** (Eng + CEO + DX): `public/main.js` has zero `loadSprite` calls. Generating 60 assets before the loader exists = producing inputs for a non-existent pipeline.
2. **Scope 60 → 10 hero** (CEO + Eng + DX): All phases recommend POC-first. Ship wagon + 1 parallax + loader + smoke test, validate, THEN expand.
3. **Style drift unmanaged** (CEO + Design + Eng + DX): Palette-lock doesn't fix proportions, lighting, dither patterns. Need Style Bible reference sheet BEFORE generating anything.
4. **Missing runtime contracts** (Eng + DX + Design): manifest, animation config, 9-slice insets, acceptance criteria — all absent.
5. **Marketing funnel not instrumented** (CEO + Design): No UTM CTA, no conversion tracking. Pretty art without a funnel = decorative expense.
6. **Tone-tier visual differentiation** (CEO + Design): Horror is the product differentiator per CLAUDE.md. Currently 1 palette for 3 tiers = tier selection changes text, not visuals.

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|----------------|-----------|-----------|
| 1 | 0 | Mode = SELECTIVE EXPANSION | Mechanical | P6 | Plan has fixed scope; surface expansions individually |
| 2 | 0 | UI scope = YES, DX scope = YES | Mechanical | P6 | Grep hit thresholds |
| 3 | 1 | Run both Codex + Claude CEO voices | Mechanical | P6 | Always dual |
| 4 | 1 | "Generate 60+ assets" direction | USER CHALLENGE | P1/P2 | Both models reject — surface at gate |
| 5 | 1 | SNES/Stardew/Chrono Trigger aesthetic | USER CHALLENGE | P6 | Both models flag as commodity |
| 6 | 1 | Indigenous AI art inclusion | USER CHALLENGE 🚨 security | P6 | Codex flags as brand risk |
| 7 | 1 | Marketing funnel instrumentation | TASTE | P5 | Claude recommends gate; user may have this elsewhere |
| 8 | 2 | Add per-scene compositional brief | TASTE | P1 | Both voices recommend; user may accept ambiguity |
| 9 | 2 | Add missing UI states section | Mechanical | P1 | Both agree: hover/disabled/focus/loading needed |
| 10 | 2 | Tone-tier visual matrix | USER CHALLENGE | P1/P6 | Both recommend reshape of "horror = one FX" |
| 11 | 2 | Mood arc table (miles → bg/palette) | TASTE | P1 | Claude-only; adds scope |
| 12 | 3 | Require POC before scaling | Mechanical | P5 | Both voices: sequence blocker |
| 13 | 3 | Add `public/assets.js` manifest | Mechanical | P5 | Both voices: required |
| 14 | 3 | Tiered preload (Tier 1/2/3) | Mechanical | P1 | Mobile 4G blocker |
| 15 | 3 | Hash-based CACHE_NAME in sw.js | Mechanical | P5 | Both voices: required |
| 16 | 3 | Add `scripts/validate-palette.js` | TASTE | P2 | CI infra; user may accept without |
| 17 | 3 | Add frontend smoke tests | TASTE | P2 | Boil-the-lake says yes; user may defer |
| 18 | 3.5 | Rewrite top of doc as quickstart | Mechanical | P5 | Both voices: required for onboarding |
| 19 | 3.5 | Split artist vs engineer sections | Mechanical | P5 | Both voices: audience conflation |
| 20 | 3.5 | Reconcile 640x480 vs 640x360 memory | Mechanical | P5 | Silent footgun |
| 21 | 3.5 | Per-tool prompt templates | TASTE | P1 | Scope add; user may standardize on one tool |

---

## Pre-Gate Verification Checklist

- [x] CEO premise challenge done
- [x] CEO dual voices ran (Codex + Claude subagent)
- [x] CEO consensus table produced
- [x] Design 8 dimensions evaluated
- [x] Design dual voices ran
- [x] Eng scope challenge + actual code read (public/main.js, travel.js, title.js, sw.js)
- [x] Eng dual voices ran
- [x] Eng consensus table + architecture gap map + test diagram produced
- [x] DX 10 dimensions evaluated
- [x] DX dual voices ran
- [x] DX consensus table + developer journey map + scorecard produced
- [x] Cross-phase themes written (6 identified)
- [x] Decision Audit Trail: 21 decisions logged
- [x] NOT in scope + What already exists written

All gates passed. Ready for Final Approval Gate.

# Oregon Trail AI Edition — Graphics Prompts

Every sprite, background, UI element, and FX the Kaplay rebuild needs. Copy-paste prompts below into Midjourney / DALL-E / SDXL / Pixel Lab / Aseprite AI — or hand to a pixel artist.

---

## Global Style Guide (prefix this to every prompt)

```
Pixel art, SNES / Sega Genesis era (1992-1996), 16-bit aesthetic. Think Oregon Trail II (1995) re-imagined with Stardew Valley's polish and Chrono Trigger's warmth. Hand-pixeled, NOT upscaled photographs. Crisp 1px outlines where appropriate, chunky 2px for foreground emphasis. Dithered shading only — no anti-aliasing, no blur, no gradients. Limited 32-color palette (see palette.hex). 1848 American frontier setting — realistic, slightly somber, painterly. Transparent background (PNG alpha) unless a scene background is specified.
```

### Palette (32 colors — lock it)
```
#000000 #1a1a2e #16213e #0f3460 #533483 #7b2d8e #e94560 #f38181
#fce38a #eaffd0 #95e1d3 #81b214 #3c6e71 #284b63 #353535 #5c5c5c
#8b8b8b #b8b8b8 #e0e0e0 #ffffff #8b4513 #a0522d #cd853f #deb887
#f5deb3 #4682b4 #5f9ea0 #2e8b57 #556b2f #8fbc8f #b22222 #ff6347
```

### Canvas
- Internal resolution: **640x480**, integer-scaled
- Full-screen backgrounds: 640x480
- Parallax layers (scrolling): 1280x480 (tiles horizontally, seamless)
- Character sprites: 16x32 or 32x32 (humans), 32x32 or 64x48 (vehicles/animals)
- UI icons: 16x16 or 24x24
- Tombstone/newspaper: 640x480 full screen

### Negatives (append to every prompt)
```
No text, no watermark, no borders, no UI elements, no modern clothing, no photorealism, no 3D render, no vector art, no cell-shading, no anime eyes, no smooth gradients, no JPEG artifacts, no oversaturated neon.
```

### Export Notes for Artist/AI
- Save as **PNG with alpha**.
- Animated sprites: save as a horizontal strip (frames left-to-right), label `<name>_strip.png`.
- Parallax backgrounds: seamless horizontal tile — left edge matches right edge exactly.
- Filenames must match `public/main.js` expectations (lowercase, snake_case).

---

# 1. Character Sprites (`assets/sprites/`)

## 1.1 Wagon
**File:** `sprites/wagon.png` — 64x48, static

```
Covered prairie schooner wagon, side view, 64x48 pixels. White canvas top with rope rigging, weathered wooden body, two large spoked wooden wheels, tongue pointing left (ox yoke attachment). Mud splatter on the lower body. Small cargo visible poking from the canvas opening at the rear. Warm beige canvas, brown wood tones from palette.
```

## 1.2 Wagon Wheels Animation
**File:** `sprites/wagon_wheels_strip.png` — 4 frames × 16x16 each = 64x16 strip

```
Single wooden spoked wagon wheel, 16x16, 4-frame rotation. Frames show the wheel turning one quarter-revolution each. Weathered wood, iron rim, mud on bottom of each frame.
```

## 1.3 Oxen Pair Walking
**File:** `sprites/oxen_walk_strip.png` — 4 frames × 32x32 = 128x32 strip

```
Pair of oxen pulling a yoke, 3/4 side view, 32x32 per frame, 4-frame walk cycle. Brown and cream hides, stocky build, heads lowered. Wooden yoke across their shoulders with chains trailing back toward wagon. Hooves alternating on dirt.
```

## 1.4 Pioneer — Male Walking
**File:** `sprites/party_male_walk_strip.png` — 4 frames × 16x32 = 64x32 strip

```
Male pioneer, 1848 frontier clothing, 16x32 pixels, 4-frame walk cycle side view. Wide-brim felt hat, dark vest over white shirt, brown trousers, boots. Small pack on back. Sunburned face, determined expression.
```

## 1.5 Pioneer — Female Walking
**File:** `sprites/party_female_walk_strip.png` — 4 frames × 16x32 = 64x32 strip

```
Female pioneer, 1848 prairie attire, 16x32 pixels, 4-frame walk cycle side view. Bonnet tied under chin, long calico dress with apron, sturdy boots. Carries a small bundle. Weathered, resolute look.
```

## 1.6 Pioneer — Child Walking
**File:** `sprites/party_child_walk_strip.png` — 4 frames × 16x24 = 64x24 strip

```
Frontier child, 1848, 16x24 pixels, 4-frame walk cycle. Small cap or bonnet, simple homespun clothes, smaller stride than adult. Barefoot or rough shoes.
```

## 1.7 Pioneer — Sick/Weak Idle
**File:** `sprites/party_sick_strip.png` — 2 frames × 16x32 = 32x32 strip

```
Pioneer standing, visibly ill, 16x32, 2-frame subtle breathing idle. Hunched posture, pale complexion, sweat on brow, blanket draped over shoulders. Genderless enough to reuse.
```

## 1.8 Pioneer — Dead/Corpse
**File:** `sprites/party_dead.png` — 32x16, static

```
Pioneer lying on the ground, side view, 32x16 pixels. Still clothed, boots visible, head turned. Subtle pallor. Respectful tone — not gory, but unmistakably deceased.
```

## 1.9 Shopkeeper NPC
**File:** `sprites/npc_shopkeep.png` — 16x32, static

```
General store shopkeeper, 1848, 16x32 pixels. White apron over suspenders and rolled-up shirt sleeves, trim mustache, balding. Standing behind counter, slight smile.
```

## 1.10 Soldier NPC (fort)
**File:** `sprites/npc_soldier.png` — 16x32, static

```
US Army soldier circa 1848, 16x32 pixels. Blue wool coat with yellow trim, slouch hat, dark trousers, musket resting at shoulder. Weary but disciplined posture.
```

## 1.11 Native American NPC — Neutral Trader
**File:** `sprites/npc_native_trader.png` — 16x32, static

```
Plains-tribe trader, 1848, 16x32 pixels. Respectful, accurate period dress — buckskin shirt and leggings, single feather, beaded sash. Holding trade goods (not weapons). Dignified, neutral expression. No stereotyped caricature.
```

## 1.12 Wild Animal — Buffalo
**File:** `sprites/animal_buffalo_strip.png` — 3 frames × 48x32 = 144x32 strip

```
American bison, side view, 48x32 pixels per frame, 3-frame subtle breathing/graze cycle. Massive shoulder hump, shaggy dark-brown fur, curved horns, head lowered grazing. Dust at hooves.
```

## 1.13 Wild Animal — Deer
**File:** `sprites/animal_deer_strip.png` — 2 frames × 24x24 = 48x24 strip

```
White-tailed deer, side view, 24x24 pixels per frame, 2-frame alert/look-up cycle. Tawny coat, white belly, alert ears, slim legs. Facing left.
```

## 1.14 Wild Animal — Rabbit
**File:** `sprites/animal_rabbit_strip.png` — 2 frames × 12x12 = 24x12 strip

```
Cottontail rabbit, side view, 12x12 pixels, 2-frame hop cycle. Brown-gray fur, white tail, long ears, crouched.
```

## 1.15 Wild Animal — Squirrel
**File:** `sprites/animal_squirrel.png` — 12x12, static

```
Gray squirrel on a fallen log, 12x12 pixels. Bushy tail, alert, upright posture.
```

## 1.16 Campfire Animation
**File:** `sprites/campfire_strip.png` — 4 frames × 24x24 = 96x24 strip

```
Small campfire with logs, 24x24 pixels per frame, 4-frame flicker cycle. Orange-yellow flames, glowing embers, faint smoke wisp at top. Stones ringing the pit.
```

---

# 2. Parallax Background Layers (`assets/landmarks/` — scrolling)

Each is **1280x480, seamless horizontal tile**. Left and right edges must match exactly. Designed for 3-layer parallax (sky fixed, mid-ground slow, foreground fast).

## 2.1 Prairie (default)
**File:** `landmarks/bg_prairie.png`

```
Rolling Great Plains prairie at midday, 1280x480 seamless scrolling background. Knee-high green grass with patches of wildflowers (yellow, purple), a single distant wagon-rut dirt trail cutting across the frame, scattered low wooden fence posts, one lonely cottonwood tree far right. Blue sky with scattered cumulus clouds. Warm, hopeful early-trail mood.
```

## 2.2 Mountain Range
**File:** `landmarks/bg_mountains.png`

```
Rocky Mountain range approach, 1280x480 seamless scrolling. Jagged snow-capped peaks at midground, evergreen forested foothills below, exposed granite cliffs, a narrow trail cutting through a pass. Crisp cold light, slight haze. Late afternoon sun on peaks. Ominous scale — humans small against mountains.
```

## 2.3 Desert / Great Basin
**File:** `landmarks/bg_desert.png`

```
Great Basin sagebrush desert, 1280x480 seamless scrolling. Flat cracked earth, sparse sagebrush, rock formations in distance, heat shimmer above horizon. Pale yellow sky, unforgiving sun. Bleached bones half-buried in sand near trail. Oppressive, parched mood.
```

## 2.4 Pine Forest
**File:** `landmarks/bg_forest.png`

```
Dense Pacific Northwest pine forest, 1280x480 seamless scrolling. Tall Douglas firs, mossy undergrowth, shafts of sunlight through canopy, narrow dirt path winding through. Damp, cool atmosphere. Rich green / deep brown palette. A single crow silhouette on a branch.
```

## 2.5 River Valley
**File:** `landmarks/bg_river.png`

```
Wide Platte River valley, 1280x480 seamless scrolling. Slow brown river curving along midground, cottonwoods lining the banks, grassy floodplain, gentle bluffs in far distance. Peaceful mid-morning light. Reed beds at water's edge.
```

## 2.6 Sandstone Bluffs
**File:** `landmarks/bg_bluffs.png`

```
Western Nebraska / Wyoming sandstone bluffs, 1280x480 seamless. Tall eroded rock columns and mesa outcrops in tan and rust colors, sparse scrub, trail cutting between formations. Dramatic golden-hour light, long shadows.
```

## 2.7 Canyon / Badlands
**File:** `landmarks/bg_canyon.png`

```
Red-rock canyon badlands, 1280x480 seamless. Layered sandstone cliffs in rust, orange, and cream, dry riverbed below, sparse juniper trees clinging to rock. Harsh noon shadows. Feeling of isolation and time.
```

## 2.8 High Plains Winter
**File:** `landmarks/bg_plains.png`

```
High plains under a thin snow dusting, 1280x480 seamless. Dry yellow grass poking through snow, distant low hills, leaden gray sky, skeletal bare trees. Sharp wind suggested by snow streaks. Cold, bleak, survival mood.
```

## 2.9 Storm Variant (tone: High)
**File:** `landmarks/bg_storm.png`

```
Prairie under approaching thunderstorm, 1280x480 seamless. Grass flattened by wind, churning black-purple clouds, distant lightning fork on horizon. Sickly green sky at base of storm. Unnatural, ominous — faint suggestion of something wrong.
```

---

# 3. Landmark Scenes (full-screen, static, `assets/landmarks/`)

Each is **640x480, static composition** (not scrolling). Players see these when arriving at a landmark.

## 3.1 Fort Laramie (frontier fort)
**File:** `landmarks/fort.png`

```
Fort Laramie, 1848, 640x480 pixel art scene. Adobe and timber walls, US flag on tall pole, log blockhouse corner towers, open main gate with wooden doors, dusty courtyard visible through gate with a few soldiers and traders. Smoke rising from one chimney. Late afternoon golden light. Welcoming but isolated.
```

## 3.2 Chimney Rock
**File:** `landmarks/chimney_rock.png`

```
Chimney Rock (Nebraska), 1848, 640x480 pixel art. Tall spire of sandstone rising ~300ft from eroded conical base, pale tan color against wide prairie sky, scattered wagon trail far below. Awe-inspiring landmark — iconic Oregon Trail waypoint. Early morning light.
```

## 3.3 Independence Rock
**File:** `landmarks/independence_rock.png`

```
Independence Rock (Wyoming), 640x480. Massive granite dome rising from flat plain, pioneers' carved names visible on the stone surface, Sweetwater River in foreground. Midday sun. Historical significance palpable.
```

## 3.4 River Crossing (active)
**File:** `landmarks/river_crossing.png`

```
Wide shallow river crossing, 640x480. Gentle current (suggested by pixel ripples), muddy fording banks, rope ferry on the far shore with a wooden raft, pine trees and bluffs behind. Wagon tracks disappearing into water. Tense, decision-point mood.
```

## 3.5 Indigenous Camp (trade / talk)
**File:** `landmarks/native_camp.png`

```
Plains tribe encampment, 1848, 640x480. Cluster of tipis with painted designs (historically accurate — no Hollywood clichés), smoke from a central fire, horses grazing, figures in respectful distance. Rolling grassland behind. Peaceful, dignified depiction.
```

## 3.6 Oregon City (arrival)
**File:** `landmarks/oregon_city.png`

```
Oregon City, Willamette Valley, 1848, 640x480. Small frontier town beside the Willamette River, wooden buildings including a mill and church, abundant Douglas firs framing the valley, Mount Hood snow-capped in far distance. Morning mist rising from river. Hopeful, lush, arrival mood — the reward.
```

## 3.7 Abandoned Wagon (event scene)
**File:** `landmarks/abandoned_wagon.png`

```
Lone abandoned pioneer wagon, 640x480. Tilted at an angle with one wheel broken, canvas torn, belongings scattered — trunk, broken chair, a doll lying in the dirt. Fading dusk light. Circling crows overhead. Melancholy, foreboding.
```

## 3.8 Graveyard (repeated deaths)
**File:** `landmarks/graveyard.png`

```
Small trailside graveyard, 640x480. A dozen wooden grave markers and one simple stone, some fresh, some weathered, leaning at angles. Wind-blown prairie grass. Overcast gray sky. Somber, quiet.
```

---

# 4. Scene Backgrounds (static, `assets/landmarks/`)

## 4.1 Independence, Missouri (start town)
**File:** `landmarks/independence_mo.png`

```
Independence, Missouri main street, 1848, 640x480. Wooden storefronts including a general store with barrels and sacks out front, a livery stable, a blacksmith's forge glowing, muddy rutted street, people loading wagons for departure. Morning light, optimistic.
```

## 4.2 General Store Interior
**File:** `landmarks/store_interior.png`

```
1848 general store interior, 640x480. Wooden shelves stocked with canned goods, flour sacks, bolts of cloth, coffee tins, candles. Long wooden counter with a scale and ledger. Barrels of pickles and nails. Oil lamp overhead. Shopkeeper standing behind counter (leave a 16x32 gap to layer sprite separately). Warm brown interior with window light.
```

## 4.3 Wagon Interior (for names scene)
**File:** `landmarks/wagon_interior.png`

```
Inside covered wagon, 640x480. View from behind the driver's bench looking forward through the canvas opening toward the trail ahead. Hanging lantern, stacked trunks and crates, rolled quilts, tin cookware. Cozy, cramped, sepia-tinted.
```

## 4.4 Fork in the Road (tone select)
**File:** `landmarks/fork_road.png`

```
Prairie trail forking into three paths, 640x480. LEFT path: bright sunlit meadow with yellow wildflowers. CENTER path: overcast, mixed terrain, realistic. RIGHT path: dim, thorny, shadowed, with twisted dead tree silhouette at the turn. All three paths visible on same canvas, clear visual spectrum from hopeful → grim.
```

## 4.5 Hunting Ground (overhead/3-quarter)
**File:** `landmarks/hunt_ground.png`

```
Clearing at the edge of a pine forest, 3/4 top-down view, 640x480. Tall grass with deer tracks, fallen log, berry bushes. Leave open negative space for animal sprites to be placed. Mid-morning, soft shadows.
```

## 4.6 Dusk Prairie (death scene)
**File:** `landmarks/dusk_prairie.png`

```
Empty prairie at dusk, 640x480. Dying orange-purple sky, silhouetted distant hills, single black cottonwood tree at right. Center foreground has a freshly disturbed mound of earth with a simple wooden cross. Wind-swept long grass. Reverent, quiet grief.
```

## 4.7 Barren Wasteland (wipe scene)
**File:** `landmarks/wasteland.png`

```
Desolate prairie after total party loss, 640x480. Overturned wagon in middle distance with shredded canvas, scattered belongings, circling vultures, distant mountains, cold gray-blue dawn. Snow patches. Empty, absolute.
```

---

# 5. UI Elements (`assets/ui/`)

## 5.1 Button Frame (9-slice)
**File:** `ui/button_frame.png` — 48x48 source (scales via 9-slice)

```
Wooden frame in the style of a 1848 sign-board, 48x48, 9-slice-ready. Raised border, slightly weathered darker wood, inner recessed panel (transparent center for 9-slice). 2-3 visible wood-grain lines.
```

## 5.2 Button Frame — Pressed
**File:** `ui/button_frame_pressed.png` — 48x48

```
Same wooden sign-board frame, 48x48, but visibly pressed/darkened — 1px darker overall, inner panel recessed deeper. For hover/active states.
```

## 5.3 Panel (9-slice parchment)
**File:** `ui/panel.png` — 64x64 source (9-slice)

```
Aged parchment paper panel, 64x64, 9-slice-ready. Creamy beige with deckled edges, faint stain at corners, subtle grain texture (dithered). Transparent center. 1848 journal look.
```

## 5.4 Speech Bubble
**File:** `ui/speech_bubble.png` — 80x40 source (9-slice with tail)

```
Parchment speech bubble, 80x40, 9-slice-ready with a pointing tail at the bottom-left. Slight curve to edges, 1px dark-brown outline, cream interior.
```

## 5.5 Health Bar Frame
**File:** `ui/health_bar_frame.png` — 64x8

```
Empty health bar frame, 64x8 pixels. Dark wood border, hollow interior. Meant to layer a colored fill bar on top.
```

## 5.6 Health Bar Fill
**File:** `ui/health_bar_fill.png` — 60x4

```
Solid color fill strip for health bar, 60x4 pixels. Gradient-dithered from deep green (full) on left to yellow (half) to red (low) on right — designed to be masked/cropped at runtime based on value.
```

## 5.7 Icon Set (each 16x16, transparent bg)

Generate these as separate files:

| File | Prompt |
|---|---|
| `ui/icon_food.png` | Small sack of flour with "F" stamp, 16x16. Cream sack with brown tie. |
| `ui/icon_ammo.png` | Stack of lead musket balls, 16x16. Gray spheres with slight shadow. |
| `ui/icon_oxen.png` | Ox head front view, 16x16. Brown, white-patched face, small curved horns. |
| `ui/icon_medicine.png` | Small glass medicine bottle, 16x16. Amber glass, cork stopper, simple label. |
| `ui/icon_wheel.png` | Wooden spoked wheel, 16x16, front view. |
| `ui/icon_axle.png` | Wooden axle with iron fittings, 16x16, horizontal. |
| `ui/icon_clothes.png` | Folded shirt, 16x16. Plaid or plain homespun. |
| `ui/icon_money.png` | Small pile of silver coins, 16x16. 3 stacked, subtle shine. |
| `ui/icon_rest.png` | Bedroll with small pillow, 16x16. |
| `ui/icon_trade.png` | Two hands exchanging a coin, 16x16. |
| `ui/icon_talk.png` | Small speech bubble with ellipsis, 16x16. |
| `ui/icon_continue.png` | Right-pointing arrow in a circle, 16x16. Wood color. |
| `ui/icon_hunt.png` | Crossed rifle and knife, 16x16. |
| `ui/icon_pace_steady.png` | Single footprint, 16x16. |
| `ui/icon_pace_strenuous.png` | Double footprints leaning forward, 16x16. |
| `ui/icon_pace_grueling.png` | Running footprints with motion lines, 16x16. |
| `ui/icon_rations_full.png` | Full plate, 16x16. |
| `ui/icon_rations_meager.png` | Half plate, 16x16. |
| `ui/icon_rations_bare.png` | Nearly empty plate, 16x16. |

## 5.8 Tombstone Background
**File:** `ui/tombstone.png` — 400x480

```
Weathered 1848 grave marker, center of frame on a dusk prairie, 400x480 pixels. Simple rough-hewn granite slab with rounded top, faint chisel marks, standing upright in tall wind-swept grass. Space in the stone's face is intentionally blank — game overlays name/date/epitaph text at runtime. Faint lichen at base. Cold blue-purple twilight sky behind.
```

## 5.9 Newspaper Background
**File:** `ui/newspaper.png` — 640x480

```
1848-style frontier newspaper masthead, 640x480 pixels. Sepia aged paper, decorative serif "THE OREGON HERALD" banner at top with small engraved vignettes (wagon, eagle, mountains), ruled column guides below, faint stained corners, ink smudges. Leave main body area blank — game overlays dynamic headline and article text at runtime.
```

## 5.10 Progress Trail Bar
**File:** `ui/trail_bar.png` — 400x24

```
Horizontal trail progress bar, 400x24 pixels. Parchment strip with thin dotted line showing the Oregon Trail route from Independence (left, small wagon icon) through key waypoints (6 small dots labeled implicitly) to Oregon City (right, small pine tree icon). Leave route blank — game will draw a filled progress overlay on top.
```

---

# 6. Weather & FX Particles (`assets/fx/`)

## 6.1 Rain Particle
**File:** `fx/rain_strip.png` — 2 frames × 4x12 = 8x12 strip

```
Single rain droplet streak, 4x12 pixels per frame, 2-frame animation (falling positions). Light blue with slight white highlight. Transparent bg.
```

## 6.2 Snow Particle
**File:** `fx/snow_strip.png` — 3 frames × 8x8 = 24x8 strip

```
Single snowflake, 8x8 pixels per frame, 3-frame gentle drift/rotation. Pure white with 1px gray shadow.
```

## 6.3 Dust Cloud
**File:** `fx/dust_strip.png` — 4 frames × 16x16 = 64x16 strip

```
Dust puff cloud rising and dissipating, 16x16 per frame, 4-frame animation (expanding + fading). Tan/beige, semi-transparent.
```

## 6.4 Mud Splatter
**File:** `fx/mud_strip.png` — 3 frames × 16x16 = 48x16 strip

```
Mud splatter, 16x16 per frame, 3-frame impact animation (small → full splash → settling). Dark brown with lighter brown highlights.
```

## 6.5 Smoke Wisp
**File:** `fx/smoke_strip.png` — 4 frames × 24x32 = 96x32 strip

```
Rising smoke column, 24x32 per frame, 4-frame drift animation. Gray with soft transparency edges, lazy curl upward.
```

## 6.6 Blood Splatter (High tone only)
**File:** `fx/blood_strip.png` — 3 frames × 16x16 = 48x16 strip

```
Blood spatter, 16x16 per frame, 3-frame (impact → spread → settled). Deep red-burgundy with darker edges. Sparse, not gratuitous — used once per horror event.
```

## 6.7 Lightning Flash
**File:** `fx/lightning_strip.png` — 3 frames × 48x240 = 144x240 strip

```
Forked lightning bolt, 48x240 pixels per frame, 3-frame flash (bright → dimming → gone). Stark white with pale purple-blue edges, jagged natural fork pattern.
```

## 6.8 Horror Glitch (High tone)
**File:** `fx/horror_glitch_strip.png` — 4 frames × 640x480 = horizontal strip

```
Full-screen glitch overlay, 640x480 per frame, 4-frame VHS-corruption effect. Scanlines, horizontal tear artifacts, color channel split (red/cyan offset), crackle pattern. Mostly transparent — meant to overlay the scene during agency-steal events at High tier.
```

---

# 7. Fonts (`assets/fonts/`)

## 7.1 Primary Pixel Font
**File:** `fonts/pixel.ttf`

**Not generated — download one of these royalty-free pixel fonts:**
- **m5x7** by Daniel Linssen (readable, warm, 7px height)
- **Press Start 2P** (bolder, 8px, NES-style)
- **Pixelade** (slightly decorative, 8px)

Or a custom bitmap font: 6x8 uppercase-focused, 1848 Western signage feel (subtle serifs on caps).

## 7.2 Newspaper Headline Font
**File:** `fonts/headline.ttf`

**Download:** **IM Fell English** (free, period-accurate 1850s serif). Use for newspaper scene headlines only.

---

# 8. Optional / Stretch

## 8.1 Animated Title Logo
**File:** `sprites/title_logo_strip.png` — 4 frames × 480x120 = 1920x120 strip

```
"THE OREGON TRAIL — AI EDITION" as a hand-painted 1848 wooden sign, 480x120 pixels, 4-frame subtle animation (gentle sway as if hanging from a post, plus a faint shimmer over the "AI EDITION" subtitle suggesting the AI element). Weathered brown wood, carved-then-painted cream letters, small iron nails at corners.
```

## 8.2 Seasonal Background Variants
Take each of the 8 parallax backgrounds (section 2) and produce a **winter snow** variant and an **autumn foliage** variant. Same composition, palette-shifted, plus snow/leaves overlay.

**Filenames:** `bg_<name>_winter.png`, `bg_<name>_autumn.png`.

## 8.3 Portrait Set for Party Roster
5 character portraits, 32x32 each, bust-shot. Mix of ages/genders. For the arrival scene roster.

**Files:** `sprites/portrait_1.png` through `sprites/portrait_5.png`

```
1848 frontier character bust portrait, 32x32 pixels, facing 3/4 forward. Vary: bearded man with wide-brim hat, young woman with bonnet, grandfather with white beard, young boy with cap, woman with dark hair in bun. Painterly 16-bit style, dignified.
```

---

# Generation Order (recommended priority)

If time/budget is limited, generate in this order:

1. **Blocker tier** (game is ugly without these): wagon, oxen, 1 pioneer sprite each (M/F), prairie bg, button_frame, panel, 8 core icons (food, ammo, oxen, medicine, money, rest, trade, continue), pixel.ttf font.
2. **Scene tier** (makes each scene feel real): Fort Laramie, Chimney Rock, river_crossing, Oregon City, store_interior, wagon_interior, fork_road, dusk_prairie, newspaper, tombstone.
3. **Atmosphere tier** (makes it feel alive): remaining 7 parallax backgrounds, campfire, all weather FX, NPC sprites, animal sprites.
4. **Polish tier**: portraits, seasonal variants, title logo animation, horror glitch.

---

# Tooling Suggestions

- **Midjourney v6** with `--stylize 0 --ar <w>:<h>` — fast first drafts, often needs cleanup in Aseprite.
- **Pixel Lab** (pixellab.ai) — purpose-built for game pixel art, respects palette.
- **Retro Diffusion** (retrodiffusion.ai) — SDXL LoRA tuned for pixel art.
- **Aseprite** — manual cleanup, palette lock, animation frame assembly.
- For parallax seamless tiles: feed the AI output into **ImageMagick** `-virtual-pixel Tile` or manually align in Aseprite.

For each AI tool, **lock the 32-color palette** (import `palette.hex`) as a post-process — this is what makes disparate AI outputs look cohesive.
