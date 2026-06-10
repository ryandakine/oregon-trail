# Oregon Trail AI Edition — Improvement Roadmap

_Generated 2026-06-10 by a 6-dimension research workflow (gameplay, AI/prompts, frontend-UX, perf/cost, marketing/virality, tech-health) → synthesis. 42 raw findings, deduped + prioritized. Load-bearing claims were adversarially re-verified against source before assertion._

> **Verification:** `public/newspaper.js` (with the OSI watermark + URL) is dead — `main.js:102` imports only `./scenes/newspaper.js`, which has no watermark/URL in its capture region. `CACHE_NAME` is a static string. `startHunt()` has no caller. All five mid-run canvas scenes have zero touch handlers.

Goal lens: a **free, cheap-to-run viral AI demo that drives OSI awareness**. Every move is judged on "does it get more people into the AI loop, make them share it, and route them to OSI" — not on being a deep game.

---

## 1. Top 5 highest-leverage moves (ranked)

**1. Add touch/click handlers to the 5 mid-run canvas scenes — the game is unwinnable on a phone.**
River/hunting/death/arrival/wipe register keyboard only (`river.js:137`, `death.js:129`, `arrival.js:181` — 0 `onClick`/`area()` in all five). Onboarding uses real HTML buttons, so a mobile visitor invests 2-3 min, hits the first river crossing (always fires mid-trail, blocks advance), taps the visible button, nothing happens — permanent dead-end at the worst bounce point. Project explicitly targets Android (`index.html:98`). Fix: mirror each key handler into `k.area()`+`k.onClick()`; add a no-keyboard tap assertion to `deploy-smoke.mjs`. **Impact: high · Effort: low.**

**2. Brand the downloaded newspaper image + fix the share-link payload — the #1 viral artifact carries no link back.**
The shared PNG is captured from `#newspaper-content` in `scenes/newspaper.js` — **no URL, no OSI credit**. The watermark strings exist in the dead `public/newspaper.js:40,76-78`. Port them inside the capture div, delete the dead file, brand the download filename. Default share copy ("Can you do better?", `share.js:37-39`) omits the viral fact — *an AI wrote this run live* — and no OSI link carries a UTM, so Plausible can't attribute game→site traffic. **Impact: high · Effort: low.**

**3. Wire up player agency: Hunt entry + live pace/rations — the survival sim is un-interactable AND the difficulty data is invalid.**
`startHunt()` (`engine.js:753`) has **zero callers** — the HUNTING scene is unreachable, so players can't recover food, yet ~56% of deaths are starvation and the 100% synthetic wipe rate is excused in `DIFFICULTY_STATUS.md:99` as "real players will hunt." They cannot. Same for `changePace()`/`changeRations()` (`engine.js:790-797`; server already accepts overrides at `index.ts:342-349`). Add [H]/tap Hunt (travel HUD + landmark) + pace/rations cycle buttons, then re-run `measure-calibration.mjs` — current 100% wipe is measuring a UI bug. **Impact: high · Effort: low-medium.**

**4. localStorage meta-progression — biggest repeat-visit lever, no backend.**
Nothing persists across runs but a resume blob (`engine.js:225-266`). Track runs played, furthest mile, best survivor count, tones/professions cleared, Bitter Path discovered; show "Best: 847 mi · 12 runs · Horror not yet survived" on the title screen. Fits the zero-backend constraint. **Impact: high · Effort: medium.**

**5. Frame the AI during every wait + ship funnel analytics.**
`emit('loading')` fires around every 8s LLM call (`engine.js:450,471`) with **no subscriber** — the wait reads as a hang on the exact feature being demoed. Only Plausible events are `bitter_path_*` — no game-start, run-complete, share, or OSI-click goals. Wire loading to a "written live by Claude" overlay (copy already in `tone.js:89-92`); add `engine.track()` firing ~7 events with `run_completed` + `osi_link_clicked` as Goals. **Impact: high · Effort: low.**

---

## 2. Quick wins (low effort, medium+ impact)

- **Lazy-load html2canvas** (198KB, largest first-load asset, `index.html:153`) — `import()` on first share, or at least `defer`.
- **Preconnect + modulepreload Kaplay** (`main.js:9`) and **self-host `kaplay.mjs`** so `sw.js` can cache it — PWA breaks offline today (cross-origin module never cached, `sw.js:64`).
- **Immutable Cache-Control in `_headers`** for fonts/icons/lib; short max-age for unhashed app JS.
- **Cache-Control on `/api/prices` (300s) + `/api/challenge` (3600s)** — static, hit every play (`index.ts:139-149`).
- **Fast-fail the retry ladder on `/api/advance`** — 8s→4s→2s + delays ≈ 17s worst case stalls the interactive path while instant fallbacks sit unused (`anthropic.ts:11-14`). 1 retry / lower base; serve fallbacks fast.
- **Expand FALLBACK_EVENTS 5 → 12/tier and cycle (no-repeat)** instead of `Math.random` (`anthropic.ts:145-310`, `index.ts:365-368`). `generate-cache.js` infra exists. Insurance for AI-dark days.
- **Feed the dormant historical corpus into the prompt** — `diary_quote`/`event_hooks`/`period_voice` are 100% populated in `historical-context.json` but **none reach the LLM** (`prompt-assembly.ts:29-75`). ~250 tokens of grounding = cheapest vividness/variety win.
- **Anti-repetition signal** — track last ~5 event titles in state, add "do NOT repeat these" to the prompt.
- **Wordle-style emoji "trail strip"** in `getDailyShareText()` (`engine.js:198-215`) — one glyph/landmark (⬜ passed / 🪦 death / ☠️ wipe). The mechanic that made Wordle viral.
- **"Try today's Daily Trail →" + streak counter** on share/arrival (`share.js:67-69` offers only Play Again).
- **Random/default names button** on `names.js` — 5 forced text inputs before gameplay is mobile friction.

---

## 3. Big bets (high impact, higher effort)

- **Dynamic per-run Open Graph image.** Every share link unfurls the same static `og-image.png` (`index.html:13,19`). A Worker route (`GET /og?d=<signed-stub>`) rendering a 1200×630 result card + a `/r/<id>` result page turns "screenshot in a camera roll" into "clickable link previewing the player's own story." HMAC infra exists; Satori/resvg in-Worker = no `public/` dep. Contextual OG lifts CTR 40-60%. Do after §1 share-loop basics.
- **Weekly-challenge scoring baked into the share artifact.** 10 challenges rotate (`state.ts:31-52`) but have no score and the share text doesn't name the active challenge. Deterministic score (miles + survivors×200 + days) in share text + OG → "can you beat my Speed Run?" without a backend.
- **One connective in-run system the player can steer** — actionable morale/sanity via "rest a day / hold a service" micro-action (reuse landmark rest plumbing). Turns isolated dice rolls into an arc. Lower priority than agency basics (§1.3).

---

## 4. Tech-health must-dos (genuine risks only)

- **SW cache invalidation (P0 — silently nullifies every frontend fix).** `CACHE_NAME` is the static string `oregon-trail-kaplay-v3-primitive` + cache-first = returning players run the *first* JS they ever cached, forever, even after deploy. Fix: `sed` a git short-sha into `CACHE_NAME` in `deploy-pages.sh` (one-line, no build step), or network-first for app-shell JS (keep fonts/icons cache-first). **Ship this before anything else in §1 reaches returning visitors.**
- **River handler positional gate.** `handleRiver` (`index.ts:810-932`) checks segment membership but not `miles_traveled >= crossing.mile_marker` — crossing IDs are public, so a player can POST a future `crossing_id` and skip the forced stop. Add the positional reject. Zero river handler tests exist.
- **Add `tsc --noEmit` to CI.** CI runs only `vitest` (`test.yml`); esbuild/wrangler don't type-check. Docs' top HMAC risk is silent GameState field-drift; a typecheck step (TS already a devDep) is the cheapest guard. Five `as any` casts already paper over historical-context drift.
- **Handler-level tests for the anti-cheat pair.** Only `handleBitterPath` is directly tested; `handleChoice` (the event-hash + trigger-kind pair signals.md calls "exploitable"), `handleStore`, `handleHunt`, `handleLandmark` have none. Port the LLM-free pattern; prioritize `handleChoice`.
- **Global pre-budget spend alert.** Per-IP cap is per-isolate; the only true $ ceiling is the Anthropic account budget, and the 6h canary detects death *after* the fact (the "AI dark incident" class). Add a coarse global counter that pages `@osi_dispatch_bot` at ~70% of daily budget; **confirm the Anthropic console budget is actually set** to a finite amount. Tighten canary cron to ~1h.

---

## 5. Explicitly OUT / not worth it

- **"Just add `cache_control`" prompt caching as a one-liner** — Haiku 4.5's cacheable-prefix minimum is 4,096 tokens; the ~2,500-token prompt makes the flag a silent no-op. Only worth it *with* prefix restructuring (§2), and measure `cache_read_input_tokens` to prove it fires.
- **Softening the Horror tier's survival math** — giving each tone a mechanical identity is fine (a High-tier sanity-drain that *bites* is on-brand), but **do not weaken Horror** — it's the differentiating hook.
- **Any DB / KV / Durable Object** — meta-progression, streaks, personal-bests all fit in localStorage or signed client state. Hard constraint holds.
- **Frontend build step or new `public/` runtime deps** — every fix above is plain ES modules, `k.area()`/`k.onClick()`, `sed` in the deploy script, or self-hosting a static `.mjs`.
- **Hardening the all-route coarse rate limiter into a global cap** — per-isolate by design; real ceiling is the Anthropic budget. Accept as best-effort flood-damping (and demote the "200/min/IP" claim in CLAUDE.md to honest wording) or use a config-only CF Rate Limiting binding.
- **Server-side newspaper/epitaph caching** — epitaph is 60 tokens; newspaper re-spend is better solved by persisting the article in localStorage so a re-share doesn't re-hit the LLM.

---

## Sequencing

1. **SW cache-bump (§4 P0) first** — without it, returning visitors never receive any §1 fix.
2. **Launch-readiness pass (all low-effort §1):** touch handlers + newspaper watermark + UTM/analytics + loading frame. The difference between "playable, shareable, attributable" and not.
3. Hunt/pace agency + meta-progression.
4. Dynamic OG image = the post-launch growth bet.
