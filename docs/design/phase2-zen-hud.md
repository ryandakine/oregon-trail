# Phase 2: Zen Travel Mode & Floating Frosted HUD — plan (DRAFT, pending review)

Status: draft for Ryan approval. Phase 1 (audio) is complete and verified (434 tests green).
Scope: visual redesign of `public/lib/hud.mjs` into rounded frosted pill capsules + an
auto-fade "zen mode" during calm travel. No worker changes, no API changes, no GameState
changes.

## Goals

1. Top HUD: replace the two stacked 640-wide parchment strips with three floating
   frosted pills — date, stats (FOOD / MILES / OXEN), progress (bar + next landmark + %).
2. Bottom HUD: replace the hard-edged party panel with a rounded frosted party capsule.
3. Zen fade: during calm travel the HUD (and the Hunt button) fades to near-invisible;
   any activity or bad news restores it instantly.
4. Zero contract regressions: all 434 existing tests pass unchanged; exported
   signatures and returned-object shapes of hud.mjs are preserved exactly.

## Non-goals

- No real backdrop blur (Kaplay canvas can't sample behind itself cheaply). Frosted
  glass is faked: dark translucent pill + 1px top highlight edge.
- No fade in non-travel scenes (event/landmark/river/etc. keep HUD always up).
- No fade in high tone (horror tier keeps stats present — information anxiety is the
  point there, and `attachStatCorruption` needs legible targets).
- No behavioral changes to `spawnPulse`/corruption visuals or the pause overlay —
  but `updateHud`/`spawnPulse` DO gain a one-line `notifyZenActivity()` call (the
  alarm-into-invisible-HUD fix).
- No worker/TypeScript changes.

## Design

### Pill visual language

- `k.rect(w, h, { radius: 12..18 })` (radius already used across draw.mjs).
- Fill: `PALETTE.outline` at opacity 0.55 (dark translucent — readable over any sky).
- Glass edge: 1px highlight line across the pill's top inner edge, `PALETTE.parchment`
  at 0.25 opacity.
- Text unchanged: labels `PALETTE.parchmentDark`→ **change to `PALETTE.parchment`**
  (dark-on-dark pills need light text; values stay `PALETTE.goldBright`).
- z-order unchanged: pill bodies z 50–51, text z 52, pulses z 55, corruption z 56.

### Top HUD layout (640-wide canvas, y≈6–40)

- Pill A (date): x 8, w ~140.
- Pill B (FOOD / MILES / OXEN): centered, w ~280.
- Pill C (progress bar + next-landmark label + %): right, x ~460, w ~172. Bar
  geometry (`barX/barY/barW/barH` relative to pill) preserved internally; landmark
  ticks, fill, highlight, next-landmark label, and % all keep current behavior.
- All three pills tagged `hud-top`. No 640-wide object at y=0 anymore; the
  T-travel-4..6 zenith-band probe (`width===640, height<20, y===0, !is("hud-top")`)
  already reads the real sky band today (draw.mjs paints a 640x11.75 band at y=0
  under the current strip) and keeps passing — no test change needed.
- **Pill widths are scale-derived, not hardcoded.** At UI scale 1.4 the date string
  ("Aug 14, 1848") is ~144px wide, overflowing a ~140px pill sized for scale 1.0.
  Compute each pill's width from `getSizes()` and the known max content length
  (date 12 chars; stats row up to 3 labels + 3 values) with padding, or simply
  multiply base widths by `getUIScale()`. Validated via visual-qa at mobile
  viewport (the Playwright harness never sets a viewport, so tests run at 1.0 —
  mobile clipping is caught by `scripts/visual-qa.mjs`, not vitest).

### Bottom HUD

- Same capsule geometry math as today (dynamic width from member count, flush to
  y=440), but `radius: 18`, frosted fill + top edge highlight, tag `hud-bottom`.
- `drawHealthIcon` redraw flow, icon positions, and name labels unchanged.

### Zen fade (new export `attachZenFade(k, engine, hudState, opts?)`)

- Wired only in `scenes/travel.js`; detached on scene leave.
- Enabled iff: `MOTION_OK` (prefers-reduced-motion → HUD never fades) AND
  `engine.tone !== "high"`.
- Idle delay 7s (opts-overridable for tests), fade 1.0s to floor 0.15, restore 0.2s
  to full.
- Activity (resets idle timer, restores opacity): pointer move, click/tap, key press,
  `daysAdvanced` with any event strings, `showFloatingText`, pause toggle, food-pulse
  / health-change (anything that calls `updateHud` with a delta).
- Opacity mechanics: Kaplay parent opacity does NOT propagate to children (verified
  against vendored kaplay.mjs — draw pushes pos/scale/angle only, opacity is a plain
  own-property), so fade iterates objects and multiplies. Fade set = three tags:
  `hud-top`, `hud-bottom`, `hud-travel-actions`, PLUS every `hpicon-*` object
  (health icons are tagged `hpicon-N` by draw.mjs, not `hud-bottom` — without them,
  colored HP circles and dying-X marks would float at full opacity over a faded
  party capsule). Cache each object's base opacity on first sight
  (`obj._zenBaseOp ??= obj.opacity`), set `obj.opacity = base * m`.
- Transient self-fading objects: `spawnPulse` writes its own opacity every frame
  (fades itself out), so it visually wins over the multiplier — alarms stay visible.
  (Note: `spawnCorruption` sets opacity 0.75 once and never rewrites it; corruption
  would fade with the HUD — acceptable because the whole fade is disabled in high
  tone, the only tier corruption runs in.)
- New objects mid-fade (redrawn health icons, rebuilt HUD after resize) are captured
  next tick — a one-tick full-opacity flash on resize rebuild, acceptable.
- **Alarm activity lives inside hud.mjs, not travel.js.** `updateHud` is called on
  every `daysAdvanced` including event-less ones, and food/health pulses can fire
  there — so `updateHud`/`spawnPulse` themselves call a module-level
  `notifyZenActivity()` hook that `attachZenFade` registers. travel.js's
  "events present" wiring alone would let an alarm pulse fire into an invisible HUD.
- Controller exposed as `window.__zenHud` (same precedent as `window.engine`,
  `window.k`) with `notifyActivity()`, `forceVisible()`, `multiplier()` — used by the
  new tests and handy for visual QA. Nulled on scene leave (detach sets
  `window.__zenHud = null`) so later scenes/tests can't call a dead controller.

### travel.js changes

- Import + wire `attachZenFade`; call `notifyActivity()` from `showFloatingText`
  and `togglePause`. Stat-change/activity notification comes from inside hud.mjs
  (`updateHud`/`spawnPulse` → `notifyZenActivity()`), so pulses on event-less
  advances still restore the HUD.
- Hunt button: BOTH the rect and its "(H) Hunt" label get tagged
  `hud-travel-actions` (label is a separate object — tagging only the rect would
  leave it floating at full opacity). Restyle both to a matching pill (radius 13,
  frosted fill, gold label). Same pos/size/area/onClick — T-agency-hunt untouched.
- Opts injection for tests: travel.js passes
  `opts = window.__zenTestOpts` through to `attachZenFade` if set — the test suite
  sets `window.__zenTestOpts = { delaySec: 0.3 }` before `goScene("travel")`.
  Production never sets it.

## Contract preservation checklist (must all hold)

- Exports unchanged: `getUIScale`, `getSizes`, `addTopHud`, `addBottomHud`,
  `updateHud`, `attachResizeRebuild`, `attachStatCorruption`, `hpState`.
- `addTopHud` return keys unchanged: `dateText, foodText, milesText, oxenText,
  barFill, barFillHighlight, barW, progressText, nextLandmarkText, tag, _prevFood`.
- `addBottomHud` return keys unchanged: `icons[{member,cx,cy,label,state,tag}], tag`.
- Tags `hud-top` / `hud-bottom` unchanged (resize rebuild + tests depend on them).
- Pause hotspot (x<100, y<60) remains non-interactive HUD-only — pills have no
  `k.area()`.
- `attachStatCorruption` targets (`foodText`, dying member `label`) still exist with
  same pos/anchor semantics.
- event.js / landmark.js / bitter_path.js import hud.mjs — pill restyle applies there
  too (consistent), but no fade is wired outside travel.

## Tests (new suite `test/frontend/zen-hud.test.ts`, Playwright)

- T-zen-1: travel renders pills, zero page/kaplay errors, object count still ≥ 100
  (guards T-travel-1..3 thresholds).
- T-zen-2: set `window.__zenTestOpts = { delaySec: 0.3 }` before `goScene("travel")`,
  forced render (no gameState) → `__zenHud.multiplier()` approaches floor; synthetic
  mouse move → returns to 1.
- T-zen-3: high tone → after 2× delay, `multiplier()` still 1.
- T-zen-4: `page.emulateMedia({ reducedMotion: "reduce" })` BEFORE page reload, then
  navigate + seed + goScene (MOTION_OK is a module-load-time const — emulating media
  after load does nothing) → no fade.
- 434 + 4 = 438 tests green; `bun run typecheck` clean.

## Files

- `public/lib/hud.mjs` — pill restyle + `attachZenFade` (~+180 lines).
- `public/scenes/travel.js` — wiring + hunt-button pill (~+25 lines).
- `test/frontend/zen-hud.test.ts` — new suite.
- Docs: manifest lane 2 update, walkthrough append, rig tracker inbox entry.

## Verification

1. `bun run test` — 438 green.
2. `bun run typecheck` — 0 errors.
3. `node scripts/visual-qa.mjs` screenshots: travel at mile 0 / 1000 / 1550,
   idle 8s (faded) vs post-activity (restored), mobile viewport (UI scale 1.4).
4. HTTP smoke on `public/`.

## NOT VERIFIED (expected)

- Physical handset legibility of frosted pills (headless emulation only).
- Cloudflare Pages deploy (per repo rule, deploys go through `bun run deploy` gate
  separately).

## Open questions for Ryan

1. Fade floor 0.15 — barely-there ghost, or 0.25 for a dimmer-but-present HUD?
2. Idle delay 7s feel right, or shorter (4–5s)?
3. High tone: confirmed no-fade, or do you want the horror tier to fade too?
