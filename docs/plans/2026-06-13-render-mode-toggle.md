# Plan: Player-facing 2D/3D render-mode toggle (v2)

> v2 — revised after eng + design + Grok plan review. See **Review trail** at the bottom. Key changes from v1: player-facing **binary** toggle (not 3-state); **service-worker cache bump** added (was a missed CRITICAL); test strategy fixed to match the Playwright-only harness; precedence pinned as ordered guards; explicit title y-coordinate; mobile-hide; private-mode guard.

## Goal
Let the player choose how the game renders — **2D (classic Kaplay)** or **3D (Three.js world backdrop)**. Decision: keep both renderers (DEC dual-renderer = b2), expose the choice as a persisted preference with a toggle on the title screen. The player sees a simple **3D: On / Off** — never the word "Auto."

## Current behavior (baseline)
- `main.js` always boots Kaplay 2D (interaction + all UI/text/scenes).
- 3D is **strictly additive**: a `#three-canvas` backdrop under the transparent 2D canvas during world scenes. Gate at `main.js:174`:
  ```js
  if (!params.has("test") && (gfxOverride || isDesktop)) { import("./three/bootstrap.mjs").then(m => m.initThree(engine)) }
  ```
  `isDesktop = (pointer:fine) && !(pointer:coarse)`. Phones get 2D-only. `?gfx=` forces it (headless harnesses); `?test=1` skips it.

## Approach

### 1. Persisted preference — `ot_render_mode`
localStorage key `ot_render_mode` ∈ `{ "auto", "2d", "3d" }`. **Unset = `"auto"` = today's exact behavior (desktop→3D, phone→2D).** Follows the `ot_*` convention (engine.js: `ot_daily_*`, `ot_meta`, `ot_saved_run`, `ot_journal`). Not in `gameState.settings` — that's per-run; this is a device pref.

`"auto"` is an **internal** value only. The player UI is binary: it shows the *effective* mode and flips to the opposite explicit value.

### 2. `public/render-mode.mjs` — pure gate + persistence, structured for the real test harness
```js
// PURE — zero top-level window/localStorage access, so it is import-safe in any context.
export function shouldInit3D({ hasTest, hasGfx, isDesktop, mode }) {
  if (hasTest) return false;          // (1) test harness NEVER wants 3D — unconditional, FIRST
  if (mode === "2d") return false;    // (2) explicit opt-out beats ?gfx and isDesktop
  if (mode === "3d") return true;     // (3) explicit opt-in (phone attempt relies on main.js .catch fallback)
  return hasGfx || isDesktop;         // (4) mode "auto"/unset → current desktop+gfx behavior
}
// Persistence — call-guarded (localStorage may be absent in Node/test/private mode).
export function getRenderMode() { try { const v = localStorage.getItem("ot_render_mode"); return (v==="2d"||v==="3d"||v==="auto") ? v : "auto"; } catch { return "auto"; } }
export function setRenderMode(mode) { try { localStorage.setItem("ot_render_mode", mode); return true; } catch { return false; } }   // returns success
export function effectiveMode(isDesktop) { const m = getRenderMode(); return m === "auto" ? (isDesktop ? "3d" : "2d") : m; }  // what the player actually gets
// Test access (the frontend harness is Playwright-only — see Test plan):
if (typeof window !== "undefined") window.__renderMode = { shouldInit3D, getRenderMode, setRenderMode, effectiveMode };
```
**Precedence table** (now pinned as ordered guards above):
| mode | ?test | ?gfx | isDesktop | → 3D? | guard |
|------|-------|------|-----------|-------|-------|
| any | yes | — | — | **no** | (1) |
| `2d` | no | yes/no | — | **no** | (2) — opt-out beats `?gfx` |
| `3d` | no | — | yes/no | **yes** | (3) |
| `auto` | no | yes | no | **yes** | (4) |
| `auto` | no | no | yes | **yes** | (4) |
| `auto` | no | no | no | **no** | (4) |

`main.js` gate becomes:
```js
import { getRenderMode, shouldInit3D } from "./render-mode.mjs";
const params = new URLSearchParams(location.search);
const isDesktop = !!window.matchMedia && window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(pointer: coarse)").matches;
if (shouldInit3D({ hasTest: params.has("test"), hasGfx: params.has("gfx"), isDesktop, mode: getRenderMode() })) {
  import("./three/bootstrap.mjs").then(m => m.initThree(engine)).catch(/* unchanged: pushes to __ERRORS, falls back to 2D */);
}
```
No behavior change for any existing path when `ot_render_mode` is unset (guard (4) == the old condition).

### 3. Service worker — cache bump (REQUIRED; was the missed CRITICAL)
`public/sw.js` is cache-first over a hardcoded `STATIC_ASSETS` list. Without this, returning players' `location.reload()` after toggling re-serves the *old* `main.js`/`title.js` and the toggle never appears.
- Bump `CACHE_NAME`: `oregon-trail-kaplay-v4-three` → `…-v5` (triggers the `activate` purge of the old cache).
- Add `/render-mode.mjs` to `STATIC_ASSETS`.

### 4. Toggle UI on the title screen (`scenes/title.js`)
`title.js` is loaded as an ESM module (it already does `import * as draw from "../lib/draw.mjs"`), so:
```js
import { getRenderMode, setRenderMode, effectiveMode } from "../render-mode.mjs";  // NOTE: ../ (title is in scenes/)
```
- **Desktop-only**: render the toggle line only when `matchMedia("(pointer:fine)") && !matchMedia("(pointer:coarse)")` (same test as the gate). On mobile it's hidden entirely — no phantom 3D option, no footgun.
- **Binary display**: compute `eff = effectiveMode(isDesktop)`; show `[ V ] 3D World: [On]` (eff==="3d") or `[ V ] 3D World: [Off]`, current value in the title-gold color (matching the `[ D ]` green-affordance idiom). Mnemonic `V` (view); verify `main.js` has no global `v` keypress.
- **Handler** `k.onKeyPress("v", …)` + clickable rect: set the **opposite** explicit mode (`eff==="3d" ? "2d" : "3d"`), then **only `location.reload()` if `setRenderMode` returned true** (private-mode → no-op rather than a dead reload). No "applies on reload" caption — instant reload from the title is cleaner than copy that flashes for 0ms (design call).
- **Placement**: `[ V ]` at **y=280** when no saved run (`[ R ]` Resume absent), **y=310** when a saved run exists (clears `[ R ]` at y=250). Sits in the 250–375 band, above the challenge box (y≈375). Reserve these exact coords; confirm no overlap in both states.

### 5. Out of scope (explicit)
DEC-A (procedural ox vs `.glb`) and real-hardware perf — separate owner decisions. In-run live render switching (reload-from-title is the MVP). A full settings/pause menu.

## Files touched
| File | Change |
|------|--------|
| `public/render-mode.mjs` | **new** — pure `shouldInit3D` + guarded persistence + `effectiveMode` + `window.__renderMode` test hook |
| `public/main.js` | replace inline gate with `shouldInit3D(...)`; import helper (`./render-mode.mjs`). Body/catch unchanged |
| `public/sw.js` | **bump `CACHE_NAME` v4→v5** + add `/render-mode.mjs` to `STATIC_ASSETS` |
| `public/scenes/title.js` | desktop-only `[ V ] 3D World: On/Off` line (y=280/310) + key/click handler + guarded reload; import `../render-mode.mjs` |
| `test/frontend/render-mode.test.ts` | **new** — `shouldInit3D` full matrix + persistence, run via `page.evaluate(window.__renderMode…)` in the browser harness |
| `test/frontend/setup-scenes.test.ts` | extend with T-title-4 (toggle renders + reflects `ot_render_mode`); the real title-smoke file |
| `public/index.html` | **confirmed untouched** (render-mode.mjs is imported, not script-tagged) |

## Test plan (every codepath — runs in the existing Playwright harness)
The frontend project is **Playwright-only against served `public/`** — there is no Node/jsdom unit path. So `shouldInit3D` is tested via `page.evaluate(() => window.__renderMode.shouldInit3D({...}))`, seeding `ot_render_mode` through the harness `seed.localStorage`.

**`shouldInit3D` (full matrix, incl. the two cells v1 missed):**
- T-rm-1: `?test=1`, mode `3d` → **false** (test wins over explicit 3d — the `?test` poisoning guard)
- T-rm-2: mode `2d`, desktop → false
- T-rm-3: mode `2d`, `?gfx=high` → **false** (opt-out beats gfx — the other missing cell)
- T-rm-4: mode `3d`, non-desktop → true
- T-rm-5: mode `auto`, desktop → true
- T-rm-6: mode `auto`, non-desktop → false
- T-rm-7: mode `auto`, `?gfx=high`, non-desktop → true
- T-rm-8: unset (no key) ≡ `auto` (regression guard: default = no behavior change)

**Persistence (via `page.evaluate`):**
- T-rm-9: `setRenderMode("2d")` then `getRenderMode()` → "2d"
- T-rm-10: garbage/absent `ot_render_mode` → `getRenderMode()` returns "auto" (no throw)
- T-rm-11: `effectiveMode(true)` with unset → "3d"; `effectiveMode(false)` with unset → "2d"

**Title scene:**
- T-title-4: with `ot_render_mode="2d"` (desktop UA) the `[ V ] 3D World: Off` line renders; the handler is registered. **Reload is NOT asserted** (Playwright can't smoke a `location.reload()` cleanly) — render + handler-registration only; reload is manual-verify.

**Regression:** existing T-title-1/2/3 + the full 360-test suite stay green (default-unset path unchanged).

## Risks / edges
- **SW**: addressed in §3 — the single biggest risk in v1.
- **`3d` on a phone**: honored, protected by the existing init-failure → 2D `.catch` fallback; `__ERRORS` still records a failed init.
- **Private mode**: `setRenderMode` returns false → toggle no-ops (no dead reload); `getRenderMode` → "auto".
- **`?test` + persisted `3d`**: guard (1) returns false first — suite cannot be poisoned.

## Review trail
**v1 → v2 after parallel plan review (eng-manager + designer + Grok), 2026-06-13.**

| Finding | Sev | Source | Resolution in v2 |
|---------|-----|--------|------------------|
| SW cache serves stale code; toggle invisible to returning players | CRIT | Eng (verified), Grok S5 | §3 — bump `CACHE_NAME` v4→v5 + add asset; `sw.js` in files |
| "Auto" label leaks tech; 3-state confuses (desktop→2D passes through Auto) | HIGH | Design | §1/§4 — player-facing **binary** 3D On/Off; "auto" internal only |
| Pure-helper unit test has no home (harness is Playwright-only) | HIGH | Eng (verified) | §2/Test — `window.__renderMode` + `page.evaluate`; module is import-safe |
| Persisted `3d` poisons `?test=1` suite without pinned precedence | HIGH | Eng, Grok S9 | §2 — ordered guards, `if(hasTest) return false` first; T-rm-1 |
| Undefined cells `2d`+`?gfx`, `3d`+`?test` | HIGH | Eng | §2 table + T-rm-1, T-rm-3 |
| `[ V ]` collides with `[ R ]` Resume at y=250 | MED/HIGH | Eng, Design, Grok S10 | §4 — y=280 (no resume) / y=310 (resume present) |
| Toggle visible on mobile → forced-3D degradation | MED | Design, Grok S6 | §4 — desktop-only render |
| Private-mode dead button (write fails → reload to same mode) | MED | Eng, Grok S3 | §4 — reload only if `setRenderMode` true |
| `title.js` import path (`../` not `./`), site unshown | MED | Eng, Grok S8 | §4 — explicit `../render-mode.mjs` |
| Reload copy flashes 0ms; weak labeling ("View"/"G") | MED | Design | §4 — drop copy, instant reload; `[ V ] 3D World: On/Off`, current in gold |
| Test file is `setup-scenes.test.ts`, not `…title…` | LOW | Eng | Files table corrected |
| Grok S1 ("API breakage"=not-yet-implemented), S7 ("overcomplexity") | — | Grok | Rejected — S1 is a non-finding; S7 countered by Eng (pure split is right; coupling was the real issue, now fixed) |

Outside-voice note: the plan's own "skip Grok" call was overridden by the operator; Grok corroborated the SW (S5) and precedence (S9) findings. The CRITICAL was found by the **repo-reading eng pass**, which a diff-only voice would have missed — consistent with the boundary-review lesson.
