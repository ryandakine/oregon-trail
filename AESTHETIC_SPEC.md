# Oregon Trail AI — Aesthetic Spec (v2)

**Status:** Working spec. All 12 gaps from v1 self-review closed. Ready for POC implementation.
**Reference game:** [Golf Course: Ocean Wave Edition](https://github.com/ErikGXDev/golf-course) (MIT, cloned at `/tmp/golf-course/`)
**Supersedes:** v1 (kept inline below as § 15 for diff comparison) and `docs/archive/GRAPHICS_PROMPTS_v1_pixelart_deprecated.md`

---

## § 0. TL;DR — the whole spec in 90 seconds

- **Visual language** = three layers: hand-drawn cartoon (characters/props) + flat grid tiles (environments) + bitmap pixel font (UI text).
- **Reference game** — Golf Course: Ocean Wave Edition. Open source. We literally have their code.
- **Palette** — loose warm-earth + prairie-green + cream parchment + sky-blue. Not 32-color locked.
- **Canvas** — 640×480 @ `pixelDensity: window.devicePixelRatio` (crisp on mobile/retina).
- **Font** — commit to **Peaberry Base** (itch.io, CC0) for body + **Peaberry Mono** for headings. One font family, two weights.
- **POC scope** — 1 asset, `wagon.png`. Then 13 more in a defined Pareto cut.
- **Indigenous characters** — NOT in v1. Period. Defer until/unless we hire a consultant.
- **Horror tier** — distinct palette shift + vignette + crow-count + weather, not just one blood FX.
- **Mockup** — to be generated and pasted into § 14 before any wagon.png commissioning.

---

## § 1. The Three Visual Layers (recap, refined)

### Layer 1 — Hand-drawn cartoon (characters & props)

Lifted from golf-course's `tree1.png`, `bush1.png`, `palmtrees.png`. Rules:

- **Outline:** 1-2px chunky dark outline on the shadow side only (never full silhouette). Color = warm desaturated dark, `#3a2a1a`–`#4a3a3a`. **Never pure black.**
- **Fill:** Three tonal values — base + highlight + deep shadow. Not flat.
- **Texture:** Hand-placed highlights (leaves, hairs, fabric folds) — 5-12 hand-placed marks, not noise.
- **Silhouette test:** Asset must be readable as a 32×32 thumbnail. If the silhouette doesn't read, regenerate.
- **Authoring resolution:** 2× display. 48px wagon ships as 96×72 PNG.
- **Comparison refs:** Don't Starve (sketchier, darker) → golf-course (cleaner, friendlier) → Cozy Grove (warmer, softer). We aim squarely at **golf-course's register** — friendlier than Don't Starve, less saccharine than Cozy Grove.

### Layer 2 — Flat grid tiles (environments)

Copied from golf-course level maps. Rules:

- **Two-tone checkerboard fill** + 1-tile dark border rim
- **Tile size:** 32×32 (one authoring scheme, not mixed)
- **Detail pixels:** 2-5 scattered small details per tile variant (leaf, hoofprint, rock)
- **Borders:** The dark 1-tile rim around traversable regions is what makes the map read — don't skip.

### Layer 3 — Bitmap pixel font (UI)

**Committing to [Peaberry Font](https://emhuo.itch.io/peaberry-pixel-font) by emhuo** (CC0, free, ships with Base + Mono variants; battle-tested in jam games).

- **Peaberry Base** — body UI (14-16 pt display)
- **Peaberry Mono** — monospace, for stat readouts (Date: / Food: / Miles:)
- **Loaded via:** `k.loadBitmapFont("peaberry", "/assets/fonts/peaberry-base.png", cellW, cellH)` — same pattern as golf-course's `happy` font at 28×36.
- **NO `Press Start 2P`** (too blocky, reads as NES, wrong register).
- **Newspaper headline variant:** still use Peaberry, scaled 2×. The newspaper feel comes from the page background, not the typography.

---

## § 2. Canvas, Scale, Kaplay Config

```js
// public/kaplay.mjs (new, extracted like golf-course does)
import kaplay from "https://unpkg.com/kaplay@3001/dist/kaplay.mjs";

export const k = kaplay({
  width: 640,
  height: 480,
  background: "#6d80fa",            // sky blue at boot; overridden per scene
  font: "peaberry",                  // default font name
  pixelDensity: window.devicePixelRatio,
  crisp: true,
  stretch: true,
  letterbox: true,
  global: false,                     // match golf-course
  debug: false,
});
```

`public/main.js` becomes a thin bootstrap:

```js
import { k } from "./kaplay.mjs";
import "./assets.mjs";                     // registers all loads
// import all scene modules ...
k.setLayers(["background", "map", "game", "ui"], "game");

k.onLoad(() => {
  engine.init();                           // single handoff, no race
});
```

**Canvas size decision:** **640×480** (live code + CLAUDE.md § 1 + § 8). Memory note `reference_oregon_trail_rendering.md` (640×360) is stale — archived at the bottom of this doc and will be marked superseded in `~/.claude/projects/-home-ryan/memory/MEMORY.md`.

---

## § 3. Palette

No 32-color lock. Style rules create cohesion; the palette is a *suggestion*.

### Core palette (Low + Medium tone tiers)

| Role | Hex | Notes |
|---|---|---|
| Sky base | `#6d80fa` | Golf-course reuse — guaranteed cohesion |
| Sky light | `#a8c9ff` | Overcast / morning |
| Prairie grass light | `#a8d056` | Main tile fill |
| Prairie grass mid | `#81b214` | Checker alt |
| Prairie grass dark | `#5a8a3f` | Border tile |
| Dirt trail light | `#c49a6c` | Trail tile fill |
| Dirt trail dark | `#8b4513` | Trail shadow |
| Wood (wagon, fence) | `#5a3a1f` → `#c49a6c` | 3-tone ramp |
| Canvas (wagon top) | `#f5e6c8` → `#e8c99a` | Cream |
| Parchment UI panel | `#2a1f0e` bg / `#f5e6c8` text | 4.5:1 contrast = WCAG AA body |
| Gold accent | `#d4a017` | Headings, emphasis |
| Danger / death | `#b22222` | Used sparingly |
| Water | `#4682b4` → `#a8d8ff` | River, rivers+rain |
| Outline (universal) | `#3a2a1a` | Warm dark, never pure black |

### Horror-tier (High tone) palette shift

Applied via a global `k.uniform` shader pass (already enabled in golf-course for `shadow` and `antialiasing`):

| Transform | Value |
|---|---|
| Saturation | ×0.65 |
| Warm hue shift | -8° (cools the whole image) |
| Shadow tint | Multiply shadows by `rgb(140, 100, 100)` (red shift) |
| Sky base | `#6d80fa` → `#3a4070` (twilight) |
| Sky accent | Add sickly green-yellow `#c5d07a` at horizon |

Plus the specific asset overrides in § 5.

---

## § 4. Concrete Prompts (all 14 Pareto-cut assets)

Use **DALL-E 3 via ChatGPT Plus** OR **Midjourney v6**. These prompts were drafted against the golf-course trees + bushes + ball as style anchors, with a 1848-authenticated period layer.

Shared prefix (paste first, always):

> *"A simple hand-drawn cartoon game asset for an indie browser game. Art style similar to Golf Course: Ocean Wave Edition by Erik G — chunky 1-2px dark outline (color `#3a2a1a`) on the shadow side only, three-tone painterly fill with soft highlights, rounded silhouette, warm earth palette, transparent background (PNG alpha). NOT pixel art. NOT vector art. NOT 3D render. NOT photorealistic. NOT anime. Subject isolated, no ground shadow, no text, no watermark. [ASSET-SPECIFIC PROMPT BELOW]."*

Shared negatives (same every time):

> *"no anti-aliasing on outline, no neon colors, no 3D render, no photorealism, no SNES pixel art, no anime faces, no text, no watermark, no border frame, no ground plane."*

### 4.1 `sprites/wagon.png` — 96×72 PNG (2× auth; renders 48×36)
> *"Covered prairie schooner wagon, 1848, side view, facing right. White cream canvas top arched over wooden bows (5 visible arches), weathered warm-brown wooden body with iron-banded spoked wheels (2 large wheels visible from the side). Tongue pointing left for ox yoke attachment. Small mud splatter on lower body. Slight sag in the canvas between bows. No driver. Slightly plump cartoon proportions, wheels ~60% of body height."*

### 4.2 `sprites/oxen.png` — 128×72 PNG (renders 64×36)
> *"Pair of oxen side by side, side view, facing right. Brown with cream patches. Heads lowered as if pulling a yoke. Horns curved short. Wooden yoke across shoulders with chains trailing right toward wagon attachment. Stout bodies, short legs, tufted tails. Painterly cartoon style with chunky outline on shadow side."*

### 4.3 `sprites/pioneer_m.png` — 48×96 PNG (renders 24×48)
> *"Male pioneer, 1848 American frontier, side view, facing right. Wide-brim felt slouch hat, dark vest over white linen shirt (sleeves rolled), brown trousers tucked into boots. Small canvas pack on back. Sun-weathered face, light stubble, determined posture, arms slightly swinging mid-stride. Cartoon illustration style."*

### 4.4 `sprites/pioneer_f.png` — 48×96 PNG (renders 24×48)
> *"Female pioneer, 1848 American frontier, side view, facing right. Cream bonnet tied under chin, long blue-and-cream calico prairie dress, sturdy brown boots, small cloth bundle carried at side. Weathered, resolute expression. Cartoon illustration style matching male pioneer sibling."*

### 4.5 `sprites/tree.png` — 96×128 PNG (renders 48×64)
> *"Lone cottonwood tree on open prairie, full view. Broad rounded green canopy with a few yellow-green highlight leaves scattered. Warm brown trunk with subtle bark texture (6-8 hand-placed marks), slight forked upper branches visible. Cartoon style exactly matching Golf Course: Ocean Wave Edition's tree1 asset — chunky outline, painterly fill, rounded friendly silhouette."*

### 4.6 `sprites/rock.png` — 48×40 PNG
> *"Gray-brown boulder, rounded cartoon silhouette, slight moss patch on shadow side. Three-tone fill (dark base, mid, highlight cap). Chunky outline. No ground plane."*

### 4.7 `sprites/grass_tuft.png` — 32×24 PNG
> *"Small clump of prairie grass, 5-7 green blades fanning upward with tiny yellow wildflowers among them. Chunky cartoon outline, painterly fill."*

### 4.8 `tiles/prairie.png` — 64×64 PNG (2×2 tile atlas: light, mid, border, flower variant)
> *"Seamless game tile, top-down view, 4 variants in a 2×2 grid. Top-left: light green grass checker fill with 2-3 tiny detail pixels (darker green flecks). Top-right: mid green grass checker with 2-3 detail pixels. Bottom-left: dark prairie-grass border tile, warm dark brown with hint of green. Bottom-right: grass tile with small yellow wildflower cluster. All tiles flat-fill cartoon style, not pixel art, seamless at edges."*

### 4.9 `tiles/dirt_trail.png` — 64×64 PNG (2×2 atlas)
> *"Seamless game tile atlas, 2×2 grid. Top-left: light dirt trail tile with faint wagon-wheel rut lines. Top-right: mid dirt tile with small pebbles. Bottom-left: dark dirt border tile. Bottom-right: muddy dirt tile with hoofprint marks. Flat cartoon fill, seamless edges, warm brown palette."*

### 4.10 `tiles/water.png` — 64×64 PNG (2×2 atlas + animated ripple)
> *"Seamless water tile atlas. Top-left: deep blue water. Top-right: shallow blue-turquoise water. Bottom-left: shoreline transition (water to sand). Bottom-right: water with subtle ripple highlight. Flat cartoon fill, seamless edges."*

### 4.11 `sprites/tombstone_frame.png` — 400×480 PNG
> *"Weathered 1848 stone grave marker, full vertical framing, placed center on a dusk prairie. Simple rough-hewn granite slab with rounded top. Subtle chisel marks, faint lichen at base. Leave the central stone face intentionally BLANK and rectangular (about 260×340 pixel area, centered) — this is where the game overlays dynamic name/date/epitaph text at runtime. Cold blue-purple twilight sky behind, low horizon. Hand-drawn cartoon illustration style, chunky outline, painterly fill, warm dark outline color."*

### 4.12 `sprites/newspaper_frame.png` — 640×480 PNG
> *"1848 frontier newspaper 'THE OREGON HERALD' masthead + blank column layout. Sepia aged paper with soft deckled edges, faint brown stain at corners, subtle horizontal fold-line across middle. Decorative serif title 'THE OREGON HERALD' at top (about 100px tall), flanked by small cartoon vignettes (wagon on left, eagle on right). Two ruled columns below, intentionally blank for runtime text overlay. Ink smudges in margins. Sepia color palette only (cream paper + warm browns). Cartoon illustration style."*

### 4.13 `sprites/title_logo.png` — 480×120 PNG
> *"Hand-painted weathered wooden signboard reading 'THE OREGON TRAIL — AI EDITION'. Carved-then-painted cream letters on warm-brown wood planks, chipped paint on edges, small iron nails at corners. Slight perspective tilt as if hanging on a post. Warm, nostalgic. Isolated on transparent background. Cartoon illustration style."*

### 4.14 `ui/button_frame.png` — 128×48 PNG (9-slice source)
> *"1848-style wooden signboard button, horizontal rectangle with slightly rounded corners. Warm-brown wood planks with visible grain, carved border rim, cream recessed center for text. 9-slice-ready: center area (64×24 pixels from 32,12) is flat cream, borders are wood. Isolated, transparent background. Cartoon illustration style. Slice9 insets: `{left: 12, right: 12, top: 12, bottom: 12}`."*

---

## § 5. Tone-Tier Visual System (Low / Medium / High)

Horror is the product differentiator per CLAUDE.md. Can't be one FX. Full matrix:

| Element | Low (classroom) | Medium (default) | High (horror) |
|---|---|---|---|
| **Palette** | Full saturation | Desat 10% | Desat 35%, warm-shift shadows red, sickly-green accent |
| **Sky base** | `#6d80fa` (cumulus warm) | `#5a70e0` neutral | `#3a4070` (twilight) + green horizon `#c5d07a` |
| **Wagon canvas** | Clean cream | Weathered cream | Stained/torn variant (`wagon_high.png` = sibling asset) |
| **Pioneers** | Clean clothes | Slight dust | Dust + mud + torn variants |
| **Tree count on BG** | Plentiful | Normal | Sparse + occasional dead tree silhouette |
| **Crow count on screen** | 0 | 0-1 distant | 2-5 closer, 1 may be on the wagon canvas |
| **Corpse sprite** | Respectful cartoon | Same | Corpse + disturbed earth + visible ribs variant |
| **UI parchment** | Clean cream | Light stain | Heavy ink bleed, torn edge |
| **UI button** | Standard | Standard | Subtle pulsing red glow on dangerous choices |
| **Vignette overlay** | None | Subtle `rgba(0,0,0,0.2)` | Heavy `rgba(30,10,10,0.4)` + **pulse** on event trigger |
| **Weather FX frequency** | 30% chance | 50% chance | 80% chance + always a storm at night |
| **HUD text color** | `#f5e6c8` cream | Same | Red-shifted `#e8c8b0` |
| **Music** | Bright folk | Mixed folk | Minor-key, distant drone |
| **Campfire color** | Orange-yellow | Orange | Occasional sickly-green flicker frames |

### Additional High-only FX sprites

- `fx/horror_vignette.png` — full-screen radial darken, alpha channel only, pulses 0.2 → 0.4 opacity on event trigger (3-frame strip)
- `fx/horror_scanline_strip.png` — full-screen CRT overlay, ambient 0.05 opacity, ramps to 0.3 during agency-steal moments (4-frame strip)
- `fx/blood_splash.png` — used once per horror death, not gratuitous, deep red-burgundy splatter

### Tone Gate

**No matrix dimension is auto-decided.** Each High-tier asset (dead tree, corpse variant, stained UI) is opt-in via `state.simulation.tone === 'HIGH'` in the scene code — never loaded unless the player explicitly chose High at the tone-selection screen.

---

## § 6. Mood Arc (Miles → Tile/Palette/Sky)

Players advance through ~1,764 miles. Art should tell them visually where they are. Maps to Oregon Trail historical segments.

| Miles | Historic segment | Primary tile | Sky | Palette shift | Weather bias |
|---|---|---|---|---|---|
| 0-200 | Kansas/Nebraska prairie | `prairie_light` | `#6d80fa` full | Full saturation | Clear |
| 200-400 | Platte River valley | `prairie_mid` + river variant | Morning blue | - | Occasional rain |
| 400-700 | Western Nebraska (bluffs) | `prairie_mid` + rocks | Afternoon gold | Warm-shift +5° | Wind/dust |
| 700-1000 | Wyoming Rockies foothills | `dirt_trail_dark` + rocks | Overcast `#a8b5d0` | Desat 10% | Cold + rain |
| 1000-1200 | Continental Divide / South Pass | Snow tile | Gray-white sky | Desat 20% | Snow bias |
| 1200-1400 | Snake River / Boise | `dirt_trail` + bluff tile | Sunset red `#e8a060` | Warm + desat 10% | Hot dust |
| 1400-1650 | Blue Mountains | Forest tile + dark dirt | Overcast | Desat 25% | Rain + mud |
| 1650-1764 | Willamette Valley (arrival) | `prairie_mid` + forest | Morning mist `#cce0ff` | Re-saturate (rebirth) | Clear |

This is implemented via `public/scenes/travel.js` reading `state.position.miles_traveled` and selecting the tile + sky bg.

---

## § 7. UI States (all missing states defined)

Every interactive UI element needs these states. Patterns copied verbatim from golf-course's `src/objects/menu/ui.ts`:

| State | Visual treatment | Sound | Cursor |
|---|---|---|---|
| **Default** | `k.outline(4, "#3a2a1a")` | — | `cursor` |
| **Hover** | `k.outline.width = 5` + subtle scale `1.02` | `quiet_click_eq` detune -800, vol 0.5 | `pointer` |
| **Pressed** | `k.outline.width = 3` + translate `y+2` (sinks) | — | `pointer` |
| **Focus (keyboard)** | Yellow 2px inner outline `#d4a017` | — | — |
| **Disabled** | Alpha 0.4 + grayscale filter | — | `cursor` (no change) |
| **Loading** | Spinner overlay (3-frame animated parchment strip) | — | `wait` |
| **Error** | Red pulse outline `#b22222` animated 1hz | `strum1` | `cursor` |
| **Success** | Green pulse outline `#5a8a3f` animated 0.5hz (briefly) | `strum3` | `cursor` |
| **Selected** | Outlined + filled gold `#d4a017` on background | — | `cursor` |

### HUD-specific empty/ambiguous states

| Context | Empty state treatment |
|---|---|
| Food = 0 | Empty plate icon + `No food!` red text |
| Ammo = 0 | Crossed-out powder horn icon |
| Oxen < 2 | Yoke icon with ? overlay |
| Party member dead | Slot dimmed alpha 0.4 + small cross overlay |
| API error (event failed to generate) | "The trail is quiet today…" fallback text in parchment panel |
| No saved run | Title screen hides `Resume` button entirely (not grayed) |

### Accessibility hooks for UI states

- All interactive elements must have a `data-label` attribute or Kaplay `name()` component with semantic label for screen-reader future-proofing
- Focus ring is MANDATORY — keyboard players must see what's focused
- Icon + text + color = 3 redundant signals for every critical UI element

---

## § 8. Accessibility (WCAG + Colorblind)

**WCAG 2.2 AA target.** Covers ~95% of practical accessibility needs for a free marketing asset.

### Contrast audits (must all pass 4.5:1 for text, 3:1 for large text)

| Pair | Context | Ratio | Pass? |
|---|---|---|---|
| `#f5e6c8` on `#2a1f0e` | Body text on UI panel | 12.1:1 | ✅ |
| `#d4a017` on `#2a1f0e` | Gold heading on panel | 7.2:1 | ✅ |
| `#f5e6c8` on `#8b4513` | Text on wood | 4.8:1 | ✅ |
| `#f5e6c8` on `#a8d056` | Text on grass tile | 2.9:1 | ❌ Add shadow |
| `#2a1f0e` on `#f5e6c8` | Dark text on parchment | 12.1:1 | ✅ |

Rule: any runtime text over art **MUST** have either a shadow (`k.outline(2, "#2a1f0e")`) or a parchment panel underneath. No raw text on green or blue backgrounds.

### Health bar — shape + color + text redundancy

Current `travel.js:193-196` uses red/yellow/green dots only. **This fails CVD accessibility (~8% of men can't distinguish).**

New spec (3 signals):

| HP band | Color | Icon shape | Text |
|---|---|---|---|
| >70 | Green `#5a8a3f` | Full circle ● | "Well" |
| 40-70 | Yellow `#d4a017` | Half circle ◐ | "Poor" |
| 20-40 | Orange `#e8a060` | Quarter ◔ | "Ill" |
| 1-20 | Red `#b22222` | Empty ○ | "Dying" |
| 0 | Dark red `#5a1a1a` | X | "Dead" |

Implemented as a new `ui_icon_health.png` sprite atlas with 5 frames, loaded via `loadSpriteAtlas`.

### Settings menu — new

Add a settings panel (matches golf-course's pattern at `src/objects/menu/settingsMenu.ts`):

- **Colorblind mode** (off / deuteranopia / protanopia / tritanopia) — shifts the palette
- **High contrast mode** — boosts all text/icon contrast to 7:1+
- **Reduced motion** — disables weather FX, horror vignette pulse, camera tweens
- **Text size** (100% / 125% / 150%) — scales bitmap font render

---

## § 9. Mobile & Responsive

### Viewport strategy

- Canvas stays `640×480` (internal resolution). Kaplay's `stretch: true, letterbox: true` handles scaling on any viewport.
- No portrait lock — let the user rotate. In portrait, letterbox top/bottom shows the game 640×480 centered with black bars.
- Optional: a "Tap screen to rotate" nudge on first load if viewport is portrait < 400px wide.

### Touch targets

- **Minimum 44×44 CSS px per WCAG 2.2 §2.5.8** (Target Size Minimum).
- UI buttons authored at 128×48 source → rendered at 2× devicePixelRatio on mobile → reads as ~96×36 CSS px. **Fails minimum on narrow mobile.**
- **Fix:** All clickable UI elements get a wrapping `k.area()` at least 44×44 CSS. Visual button can be smaller; hitbox is bigger. Golf-course uses this pattern (e.g., `menu_button` at 100×38 visual but hit area on the parent holder).

### HUD reflow

- Bottom HUD (Date / Food / Miles / Oxen) wraps to 2 lines on viewport width < 480 CSS px.
- Party roster collapses to horizontal portrait strip on narrow viewports.

### Text scaling

- All bitmap font rendering uses `size` multiplier from settings. No hardcoded font sizes in scenes.

---

## § 10. Cultural & Historical Accuracy

### Indigenous characters — NOT IN V1

**Decision:** All AI-generated Indigenous character art is **explicitly out of scope for v1.** The Codex CEO review flagged this as a critical brand risk, and the cultural-consultant research confirms: "respectful, no caricature" prompt language is not a substitute for Indigenous-led review.

What this means for the plan:
- **No `npc_native_trader.png`** in v1 — pulled from the Pareto 14
- **No `landmarks/native_camp.png`** in v1
- **Encounters with Indigenous nations still happen narratively** (text events), but rendered as parchment panels, not character art
- **Scenes referencing Indigenous characters use symbolic imagery only** (a silhouette on the horizon, a distant campfire, trade goods on a blanket — no faces)

### Path to re-adding (future scope, post-v1)

If and when we re-include Indigenous character art:

1. Hire a cultural consultant (targets: [Indiginerd](https://indiginerd.com.au/) — Cienan Muir worked on *Broken Roads*, or [Achimostawinan Games](https://achimostawinan.com/) — Meagan Byrne)
2. Budget ~$500-1500 for initial consult + character brief review
3. Consultant reviews historical-context.json entries about Indigenous nations for accuracy (11 nations listed — Lakota, Cheyenne, Arapaho, Pawnee, Shoshone, etc.)
4. Art is human-authored (not AI) for Indigenous characters
5. Consultant reviews every piece before ship

This is a feature, not a bug. The absence of character art in v1 becomes part of the pitch: "Oregon Trail AI Edition consciously avoids depicting Indigenous peoples without community input."

### 1848 historical accuracy — wagon

Confirmed via research: the iconic Oregon Trail wagon is the **prairie schooner**, NOT the heavier Conestoga. Design baked into § 4.1 prompt:

- White canvas top (the "schooner" sail, hence the name)
- Wooden body with wooden bows supporting the canvas
- Iron-banded spoked wheels
- Ox-team yoke attachment on tongue (NOT horse-drawn)
- No suspension — pioneers walked beside the wagon, didn't ride
- Average pace 2 mph, 15-20 miles/day (for `state.simulation` reality-check only, not visual)

---

## § 11. Asset Budget (with real measurements from golf-course)

Actual measured sizes from `/tmp/golf-course/public/sprites/`:

| Golf-course asset | Size | Analog for us |
|---|---|---|
| tree1.png (108×142 cartoon tree) | 3.6 KB | Our `tree.png` |
| bush1.png (64×64) | 1.1 KB | Our `rock.png`, `grass_tuft.png` |
| palmtrees.png (192×128) | 3.6 KB | Our `oxen.png` |
| hole.png (32×32) | 483 bytes | Our tile atlas entries |
| golfball.png (37×37) | 594 bytes | Our icon set |
| golfcourse_title.png (480×120) | 7.3 KB | Our `title_logo.png` |
| happy_28x36.png bitmap font | 14.8 KB | Our `peaberry-base.png` |

Pareto 14 projected (conservative 1.5× buffer):

| Asset | Est. size |
|---|---|
| wagon.png (96×72) | 5 KB |
| oxen.png (128×72) | 5 KB |
| pioneer_m.png (48×96) | 3 KB |
| pioneer_f.png (48×96) | 3 KB |
| tree.png (96×128) | 5 KB |
| rock.png (48×40) | 1 KB |
| grass_tuft.png (32×24) | 0.8 KB |
| tiles/prairie.png (64×64 atlas) | 2 KB |
| tiles/dirt_trail.png (64×64 atlas) | 2 KB |
| tiles/water.png (64×64 atlas) | 2 KB |
| tombstone_frame.png (400×480) | 30 KB |
| newspaper_frame.png (640×480) | 45 KB |
| title_logo.png (480×120) | 15 KB |
| button_frame.png (128×48) | 2 KB |
| peaberry fonts (2 PNGs) | 30 KB |

**Total v1: ~151 KB.** Under budget. Doubles to 300 KB with High-tier variants. Well within 4G first-paint bounds.

---

## § 12. Compositional Briefs (per scene)

The "what does the player see 1st/2nd/3rd" rules. Applied at scene-composition time, not during art generation.

### Title scene

1. **Focal (0-200ms):** Title logo centered, slight slow float animation
2. **Secondary (200ms-1s):** "PRESS ANY KEY TO START" bitmap text below
3. **Tertiary:** Weekly challenge panel bottom-right (if active)
4. **Atmosphere:** Starfield + rolling prairie silhouette bg (primitive, no sprite)

### Travel scene

1. **Focal:** Wagon + party, centered, animating along trail
2. **Secondary:** HUD strip (top edge) — date/miles/food/oxen with icons
3. **Tertiary:** Parallax bg (prairie tiles, sky)
4. **Atmosphere:** Weather FX, trail indicator bar at bottom

### Store scene

1. **Focal:** Shopkeeper + counter (center)
2. **Secondary:** Item grid (3 columns, 4 rows) with buy/sell controls
3. **Tertiary:** Running total + recommended purchases button
4. **Atmosphere:** Store interior bg (parchment + shelves)

### Event scene (LLM-generated event)

1. **Focal:** Event title bitmap heading (top)
2. **Secondary:** Description text (parchment panel, center)
3. **Tertiary:** Choice buttons (bottom)
4. **Atmosphere:** Scene-specific bg dimmed 40%, vignette for High tier

### Landmark scene

1. **Focal:** Landmark name + simple icon
2. **Secondary:** Description + action buttons (Rest/Trade/Continue)
3. **Tertiary:** NPC dialogue (if present) in speech bubble panel
4. **Atmosphere:** Trail-section bg + distant landmark silhouette

### River crossing

1. **Focal:** River depth/danger indicators (icon + text)
2. **Secondary:** 3 crossing options with risk indicators
3. **Tertiary:** River bg (water tile + banks)

### Death scene

1. **Focal:** Tombstone frame, centered
2. **Secondary:** Epitaph text typing out
3. **Tertiary:** "Continue / Share" buttons
4. **Atmosphere:** Dusk prairie bg (primitive or optional sprite)

### Newspaper scene

1. **Focal:** "THE OREGON HERALD" masthead + headline (AI-generated)
2. **Secondary:** Article body (2 columns)
3. **Tertiary:** Deaths roster + share button
4. **Atmosphere:** Sepia paper + fold-line

### Arrival scene

1. **Focal:** Survivor roster (portraits + names + fates)
2. **Secondary:** Final score + stats
3. **Tertiary:** "Read newspaper / Play again" buttons
4. **Atmosphere:** Willamette Valley bg (forest tiles + distant mist)

---

## § 13. AI Generation Validation (pre-commit test)

To close gap #8 from self-review: **before committing to 14 assets, validate that the prompt produces consistent output.**

Procedure:

1. **Day 1** — Generate `wagon.png` via DALL-E 3 (3 attempts), Midjourney v6 (3 attempts), Pixel Lab (if subscribed, 3 attempts). 9 wagons total.
2. **Compare side-by-side.** Does the style hold? Can an observer guess the game they're from?
3. **If consistent style across tools:** proceed to full Pareto 14.
4. **If style drift:** pick the best tool (likely DALL-E 3 based on research), commit to it, regenerate the other 13 using only that tool.
5. **If style fails entirely:** fallback to hiring a human illustrator for the 14 hero assets (est. $300-800 via Fiverr/ArtStation).

This is the "check before you invest" gate the v1 plan missed.

---

## § 14. Mockup (TBD — must generate before commissioning assets)

**Placeholder.** Before any wagon.png commissioning, generate one mockup of the travel scene using:

- Golf-course cloned code as the starting point
- One AI-generated wagon.png (throwaway)
- Primitive prairie tile rendering + sky gradient
- Real Peaberry bitmap font
- Real HUD with stubbed stats

Paste a screenshot of the mockup here. If it doesn't read as Oregon Trail → iterate the prompts in § 4 before spending more.

**Cost if this mockup fails:** ~1 hour + 1 DALL-E credit (~$0.04). Cheapest possible de-risking.

---

## § 15. v1 Gap Closure Summary

| Gap | v1 state | v2 state |
|---|---|---|
| 1. Per-scene compositional briefs | Missing | § 12 (all 9 scenes) |
| 2. Tone-tier visual matrix | One-liner | § 5 full 13-row matrix + High-only FX |
| 3. Mood arc (miles → visuals) | Missing | § 6 full segment table |
| 4. Missing UI states | 2 states only | § 7 full 9-state table + HUD empty states |
| 5. WCAG contrast audit | Missing | § 8 + settings menu + contrast table |
| 6. Concrete prompts | `[SUBJECT]` placeholder | § 4 all 14 copy-paste prompts |
| 7. Asset sizes | Estimates | § 11 measured from golf-course |
| 8. AI generation validated | Unvalidated | § 13 explicit validation gate + fallback |
| 9. Font choice | 3 options | § 1 committed to Peaberry (CC0) |
| 10. Oregon Trail mockup | None | § 14 required before commissioning |
| 11. Cultural risk | Unaddressed | § 10 Indigenous characters cut from v1 |
| 12. Mobile strategy | "Scales gracefully" | § 9 WCAG 2.2 touch targets + HUD reflow |

---

## § 16. Next Steps

1. **Now:** Generate the mockup (§ 14) using cloned golf-course code + one throwaway DALL-E wagon + Peaberry font. Paste screenshot here. Decide go/no-go.
2. **If go:** Generate `wagon.png` properly (§ 4.1) with 3-attempt validation (§ 13). Commit to `public/assets/sprites/wagon.png`.
3. **Then:** Ship the slim BLOCKERS_PLAN_v2 (manifest + loader + wagon integration), 3 commits.
4. **Then:** Expand to the remaining 13 Pareto-cut assets over 2-3 PRs.
5. **Memory update:** archive `reference_oregon_trail_rendering.md` (640×360 note, stale). Confirm 640×480 is canonical.
