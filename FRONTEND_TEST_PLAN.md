# FRONTEND_TEST_PLAN.md

## Why this plan exists

On 2026-04-18 two P0 frontend crashes shipped. Both would have been caught by a scene smoke test that did nothing more than render the scene with mock data and assert zero JS errors.

1. `public/scenes/river.js` — `river.ford_difficulty` is typed `1 | 2 | 3 | 4 | 5` on the server but the scene called `rawDifficulty.toUpperCase()`. First real river crossing, blue screen. Fixed in `4af2434`.
2. `public/scenes/river.js` + `public/scenes/hunting.js` — button labels like `[1] Ford River` hit kaplay's styled-text parser, which treats `[x]...[/x]` as a style tag and throws on unclosed tags. Fixed in `a129b31`.

Both bugs live in scenes that never had a test. The worker has 175 green vitest tests. The frontend has zero. We need the cheapest thing that would have caught both bugs, and we need it small enough to land inside a week.

Non-goal: replace or duplicate the worker tests. Non-goal: visual regression. Non-goal: test kaplay itself.

---

## 1. Scope decision

Five options considered. Ranked by ROI against the two bug classes we actually shipped.

| Option | What it covers | Catches today's bugs? | Lines | Risk |
|---|---|---|---|---|
| A — Per-scene Playwright smoke | Render each scene with mock data, assert `window.__ERRORS.length === 0`, assert min GameObj count | Both | ~400 | Low — pattern already proven in `scripts/smoke-travel.sh` + `scripts/visual-qa.mjs` |
| B — Custom lint rule | Regex for `k.text("[N]...")` and `.toUpperCase()` on schema-typed number fields | Both, but only these two | ~80 | High — regex linters rot fast, false positives, needs ongoing curation |
| C — Playthrough E2E | Full happy-path run, full wipe run, resume-from-save, daily trail | Both (river triggers during a run, hunting during starvation) | ~300 but slow | Medium — 45-60s runtime per scenario, flaky under LLM timeouts |
| D — Vitest + jsdom + mock kaplay | Unit test engine + scene logic without browser | Neither — mocked kaplay would have accepted the bad styled text and the bad toUpperCase | ~600 | High — kaplay surface is huge, mocks drift, false negatives |
| E — Combination A + small C | Smoke every scene + one happy-path playthrough | Both, plus regressions in engine state transitions | ~550 | Low |

**Pick: Option E with A as the backbone.**

- A alone catches both shipped bugs with the least code. `scripts/visual-qa.mjs` already does 7 scenes this way — we scale that pattern to all 17, with per-scene mock data.
- Add a trimmed version of C as a single playthrough smoke: one "happy path to arrival" run with `--maxTicks=200`, asserting page errors === 0. This catches regressions in engine state transitions that per-scene smokes can't see because they force scenes out of context.
- Skip B. The forbidden patterns are rare and the existing fixes added comments — better to rely on smoke coverage.
- Skip D. jsdom + mock kaplay is a long tail. Engine logic that matters runs server-side.

Rough target: 17 per-scene smoke tests + 1 short happy-path playthrough + CI wrapper. ~550 lines total.

---

## 2. Scene mock-data catalog

For every scene, minimum state the engine must be seeded with, and shape of `sceneData` to pass via `k.go(name, data)`. Source of truth is `worker/src/types.ts`.

Two variants per scene: **happy** (typical server payload) and **edge** (missing optional fields, numeric-where-string-expected, empty arrays). The river crash would have been caught by the edge variant for `ford_difficulty: 5` (number).

| Scene | Needs signedState? | sceneData shape | Happy variant | Edge variant |
|---|---|---|---|---|
| `loading` | no | none | no data | — (timer only) |
| `title` | no, reads `engine._savedRunData` + `window.CHALLENGE_INFO` | none | no saved run | saved run present, daily completed |
| `profession` | no | none | — | — |
| `names` | reads `engine.submitNames` | none | — | — |
| `tone` | reads `engine.selectTone` | none | — | — |
| `store` | yes — reads `engine.profession`, `engine.supplies.money`, `engine.activeChallenge` | none | farmer, no challenge | banker + `pacifist` (disables ammo), `minimalist` (disables spare_parts) |
| `travel` | yes — `engine.supplies`, `engine.party`, `engine.currentDate`, `engine.tone` | none | medium tone, mid-journey | high tone (horror overlay), day-0, pre-start |
| `event` | yes — reads `engine.supplies`, HUD | `EventResponse` | 3-choice event | empty choices, missing description, long description (typewriter) |
| `bitter_path` | yes + `engine.currentBitterPathMeta` + localStorage `ot_bitter_path_cw_acked` | `EventResponse` + meta | CW acked, 3 choices | CW unacked (gates), meta with `days_since_death: "garbage"` (hostile) |
| `landmark` | yes | `Landmark` (subset — needs `name`, `type`, `description`, `trade_inventory`) | fort with trade_inventory | natural landmark, empty trade_inventory, `type` unknown |
| `river` | yes | `RiverCrossing` (subset — needs `name`, `width_ft`, `depth_ft_summer`, `ford_difficulty`, `ferry_cost_1848_dollars`, `description`) | `ford_difficulty: 3`, ferry affordable | `ford_difficulty: 5` (numeric, would crash pre-fix), ferry unaffordable, `ford_difficulty: null` |
| `hunting` | yes — reads `engine.supplies.ammo` | none; `engine.submitHunt` result events | 20 ammo | 0 ammo (all buttons grayed), exactly 5 ammo (option 1 enabled, 2/3 disabled) |
| `death` | yes | `{ name, cause, date }` | normal | missing fields |
| `arrival` | yes | none | party survived | 1/5 survived |
| `wipe` | yes — `engine.deaths`, `engine.party.members` | none | all dead with varied causes | zero deaths (shouldn't happen but defensive) |
| `newspaper` | yes | newspaper-shape | full newspaper | minimal fallback |
| `share` | yes — `engine.gameState.position.arrived` | none | arrived | perished |

**Awkward scenes (tight coupling):**
- `travel` uses `lib/draw.mjs`, `lib/hud.mjs`, `lib/tone.mjs`. It also spawns `k.onUpdate` loops. Need to assert object count only after first frame, not at spawn.
- `bitter_path` has the content-warning gate + localStorage branch + typewriter + engine `bitterPathResolved` beat. Two distinct scene trees to cover.
- `event` has a typewriter; assertions must wait past typewriter or skip it by clicking overlay.
- `title` reads `window.CHALLENGE_INFO` set by engine init. If engine hasn't run, CHALLENGE_INFO is undefined. Test harness must run engine.init before forcing title.

**Scenes that can render without a seeded signedState:**
`loading`, `profession`, `names`, `tone`, `title` (resume option hidden when `_savedRunData` is null).

**Scenes that need a seeded signedState:**
All scenes downstream of STORE. Seed via `engine.signedState = mockSignedState()` before `k.go(...)`. The state blob is HMAC-signed by the server — we do not have the secret in tests, so scene renders must not actually call the API. The per-scene smoke harness does not exercise any endpoint. The single playthrough smoke hits the real API.

---

## 3. Harness architecture

**Decision: vitest + Playwright chromium, tests in `test/frontend/`, pointed at a local HTTP server serving `public/`.**

### Why this

- Keeps the no-build-step-for-public invariant (§1 of CLAUDE.md) — `public/` is loaded over HTTP exactly as production serves it, via vanilla ES module imports. Tests live in a separate directory under `test/frontend/` where vitest + TypeScript are fine.
- Reuses the already-installed `playwright` dep and the already-present `vitest` dep.
- Mirrors the pattern Ryan already uses in `scripts/visual-qa.mjs` and `scripts/playthrough.mjs`, so reviewer load is low.
- Rejected vitest + jsdom + mock kaplay: kaplay is big, mocks drift, and a mocked kaplay would not have caught the styled-text parser bug since our mock would render `[1]` as plain text.
- Rejected extending `smoke-travel.sh` to all scenes: shell loops and the `browse` binary require a running daemon, gstack browse docs warn that mid-scene canvas state goes stale between `$B` calls, and assertions are easier to write in JS than bash.

### Layout

```
oregon-trail/
├── test/
│   ├── frontend/
│   │   ├── scene-smoke.test.ts         # 17 smokes, one `it(...)` each
│   │   ├── playthrough-smoke.test.ts   # one trimmed playthrough
│   │   ├── fixtures/
│   │   │   ├── river.ts                # mock RiverCrossing — happy + edge
│   │   │   ├── landmark.ts
│   │   │   ├── event.ts
│   │   │   ├── bitter_path.ts
│   │   │   ├── state.ts                # mock SignedGameState (unsigned, test-only)
│   │   │   └── engine.ts               # seedEngine(page, { signedState, supplies, ... })
│   │   ├── harness.ts                  # startServer, openPage, waitForScene, readStats
│   │   └── tsconfig.json               # { extends: ../../tsconfig.json, include: [.] }
│   └── README.md                       # how to run, how to add a scene
├── vitest.config.ts                    # configures two projects: worker + frontend
```

### Harness API (test/frontend/harness.ts)

```ts
// Sketch — final code lands in F1.
export async function startServer(): Promise<{ url: string; stop: () => Promise<void> }>;
export async function openPage(url: string): Promise<Page>;
export async function waitForReady(page: Page): Promise<void>;     // waits for window.k && window.engine
export async function seedEngine(page: Page, seed: EngineSeed): Promise<void>;
export async function goScene(page: Page, name: string, data?: unknown): Promise<void>;
export async function readStats(page: Page): Promise<{ total: number; pageErrors: string[]; hudTop: number; hudBottom: number }>;
export async function screenshot(page: Page, out: string): Promise<void>;
```

`startServer` uses Node `http.createServer` + `serve-handler` (npm, ~2KB, devDep only) on a random port. No dependency on `npx serve` being present on the path.

`seedEngine` runs `page.evaluate` to set `engine.signedState`, `engine.profession`, `engine.supplies`, `engine.party`, and `engine.currentEvent` directly. No API calls. Deterministic.

### Per-scene test pattern

```ts
it("river — happy path (ford_difficulty=3)", async () => {
  await seedEngine(page, { profession: "farmer", supplies: { money: 50000, ammo: 20 } });
  await goScene(page, "river", riverFixtures.happy);
  await page.waitForTimeout(500);
  const stats = await readStats(page);
  expect(stats.pageErrors).toEqual([]);
  expect(stats.total).toBeGreaterThanOrEqual(30);
});

it("river — numeric ford_difficulty (regression for 4af2434)", async () => {
  await seedEngine(page, { profession: "farmer", supplies: { money: 0 } });
  await goScene(page, "river", { ...riverFixtures.happy, ford_difficulty: 5 });
  await page.waitForTimeout(500);
  const stats = await readStats(page);
  expect(stats.pageErrors).toEqual([]);
});
```

### GameObj thresholds

Tight enough to catch "scene stopped rendering" regressions, loose enough to not flake on art tweaks. Thresholds cribbed from `scripts/visual-qa.mjs`:

| Scene | Threshold | Rationale |
|---|---|---|
| loading | 2 | rect + text |
| title | 50 | stars (60) + hills |
| profession / names / tone | 8 | canvas bg + a few accents; overlay DOM not counted |
| store | 4 | thin canvas, HTML overlay carries content |
| travel | 200 | parallax + hills + environment + wagon + HUD |
| event | 20 | dim + label + HUD + overlay dom not counted |
| bitter_path | 20 | dim + whisper label + HUD |
| landmark | 40 | backgrounds vary; fort is densest |
| river | 30 | sky + banks + water + 12 lines + 3 buttons |
| hunting | 60 | sky + meadow + grass 20 + trees 12 + buttons |
| death | 10 | tombstone pieces |
| arrival | 40 | mountains + valley + buildings |
| wipe | 10 | vignette + title + death list |
| newspaper | 4 | dim canvas, DOM content |
| share | 60 | stars (60) |

Thresholds should be generous lower bounds. If someone deletes half a scene, the count will fall below. If someone adds art, the count rises and nothing breaks.

---

## 4. CI integration

### Local

Add two vitest projects so one command runs both suites.

```
package.json
  "test": "vitest run"
  "test:worker": "vitest run --project worker"
  "test:frontend": "vitest run --project frontend"
```

`vitest.config.ts` declares two projects: `worker` (covers existing `worker/tests/`) and `frontend` (covers `test/frontend/`). Frontend project has `testTimeout: 30000` because Playwright startup is ~2s and per-test page loads add up.

Expected runtime: worker ~8s, frontend ~45s (17 scenes * 2s + playthrough 10s + overhead). Under a minute total. Acceptable.

### Deploy gate

Today there is no gate. `npx wrangler pages deploy` is run manually per CLAUDE.md §9. Add a pre-check script that runs tests first.

```
scripts/deploy-pages.sh
  #!/usr/bin/env bash
  set -euo pipefail
  npm test                                                    # worker + frontend
  npx wrangler pages deploy public \
    --project-name=oregon-trail --branch=master --commit-dirty=true
```

Update the deploy line in CLAUDE.md §9 to point at this script. Do not add any automatic push-on-merge — the project has no git-provider-backed CF Pages deploys, and Ryan explicitly deploys manually.

### GitHub Actions

No `.github/workflows/` directory exists today. Add one file, opt-in rather than blocking:

```
.github/workflows/test.yml
  name: test
  on:
    push:
      branches: [kaplay-rebuild, master]
    pull_request:
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20, cache: npm }
        - run: npm ci
        - run: npx playwright install --with-deps chromium
        - run: npm test
```

Runtime expectation: cold Playwright install pushes CI to ~3min on first run, ~90s cached. Acceptable. Non-blocking for deploy because deploy is manual.

---

## 5. Bug-classes-caught matrix

| Test ID | Scene | Variant | What it asserts | Bug class caught |
|---|---|---|---|---|
| T-river-1 | river | happy | 0 errors, >=30 objs | general render regression |
| T-river-2 | river | `ford_difficulty: 5` (number) | 0 errors | **numeric-where-string-expected** (the `toUpperCase` bug, commit 4af2434) |
| T-river-3 | river | ferry unaffordable | 0 errors, button grayed | price-gating regression |
| T-river-4 | river | empty `river` object | 0 errors | defensive defaults |
| T-hunt-1 | hunting | 20 ammo | 0 errors, all buttons enabled | **kaplay styled-text `[N]` bracket** (commit a129b31) |
| T-hunt-2 | hunting | 0 ammo | 0 errors, buttons grayed | |
| T-hunt-3 | hunting | after submitHunt | results text renders | event listener regression |
| T-landmark-1..4 | landmark | fort / natural / settlement / destination | 0 errors, background per type | drawBackground regression |
| T-event-1 | event | 3 choices | 0 errors after typewriter | |
| T-event-2 | event | choices: [] | 0 errors | defensive |
| T-event-3 | event | description 2000 chars | 0 errors after click-to-skip | typewriter edge |
| T-bp-1 | bitter_path | CW unacked | 0 errors, CW modal present | CW gate |
| T-bp-2 | bitter_path | CW acked | 0 errors, typewriter runs | scene body |
| T-bp-3 | bitter_path | `days_since_death: "not-a-number"` | 0 errors | hostile-input coercion (see escapeHtml/floor logic) |
| T-bp-4 | bitter_path | `bitter_path_taken: "taken"` already | 0 errors, transitions to TRAVEL | double-resolve guard |
| T-title-1 | title | no saved run | 0 errors | general |
| T-title-2 | title | saved run present | 0 errors, [R] visible | resume |
| T-title-3 | title | daily completed today | 0 errors | daily dedup |
| T-store-1 | store | farmer, no challenge | 0 errors | |
| T-store-2 | store | `pacifist` challenge | 0 errors, ammo disabled | challenge restrictions |
| T-travel-1..3 | travel | low / medium / high tone | 0 errors, >=200 objs | tone.mjs overlay regression |
| T-death-1 | death | normal | 0 errors | |
| T-arrival-1 | arrival | 5/5 survived | 0 errors | |
| T-wipe-1 | wipe | 5 deaths | 0 errors | |
| T-newspaper-1 | newspaper | full AI response | 0 errors, DOM rendered | overlay regression |
| T-share-1 | share | arrived | 0 errors | |
| T-share-2 | share | perished | 0 errors | |
| T-playthrough-1 | full run | happy path, medium tone, 200 ticks max | 0 page errors, miles >= 100, terminal state reached | engine state-transition regression |

**Would this catch both 2026-04-18 bugs?** Yes. T-river-2 renders with `ford_difficulty: 5`, which is the exact payload shape that crashed prod. T-hunt-1 renders hunting with the original `[1] 5 rounds` labels and would throw "unclosed style tag" at the kaplay parser.

---

## 6. Commit split

Five sub-commits, bisectable, each <300 lines of real code.

### F1 — Harness scaffold + fixtures (~180 lines)

- `test/frontend/harness.ts`: `startServer`, `openPage`, `waitForReady`, `seedEngine`, `goScene`, `readStats`
- `test/frontend/fixtures/state.ts`: `mockSignedState()` — returns a plausible SignedGameState with party, supplies, position, simulation. Signature is a placeholder "test" string; tests never hit the worker.
- `test/frontend/fixtures/river.ts`, `landmark.ts`, `event.ts`, `bitter_path.ts`: happy + edge variants each
- `test/frontend/tsconfig.json`
- `vitest.config.ts`: two-project setup (worker + frontend)
- `package.json`: add `"test:frontend"` and `"test:worker"`, update `"test"` to run both, add `serve-handler` as devDep
- `.gitignore`: add `test/frontend/.tmp/` for screenshots
- `test/frontend/README.md`: how to add a scene

### F2 — Setup-phase scenes (~120 lines)

Per-scene smoke tests for the 6 scenes before departure. None of these need a signed state.

- T-loading-1
- T-title-1, T-title-2, T-title-3
- T-profession-1
- T-names-1 (just render, no submission)
- T-tone-1
- T-store-1, T-store-2

### F3 — Travel + event scenes (~140 lines)

- T-travel-1, T-travel-2, T-travel-3 (tones)
- T-event-1, T-event-2, T-event-3
- T-bp-1, T-bp-2, T-bp-3, T-bp-4

### F4 — Landmark / river / hunting / terminal scenes (~180 lines)

This is the commit that would have caught the two shipped bugs. Includes the regressions by id.

- T-landmark-1..4
- T-river-1..4 (includes **T-river-2** — the toUpperCase regression)
- T-hunt-1..3 (includes **T-hunt-1** — the `[N]` bracket regression)
- T-death-1
- T-arrival-1
- T-wipe-1
- T-newspaper-1
- T-share-1, T-share-2

### F5 — Playthrough smoke + CI + deploy gate (~80 lines)

- `test/frontend/playthrough-smoke.test.ts` — a trimmed `scripts/playthrough.mjs`:
  - medium tone, farmer, `--maxTicks=200`
  - start game against local server pointed at `http://localhost:8787` or the real worker (opt-in)
  - asserts `pageErrors.length === 0`, `miles >= 100`
  - default: skipped unless `PLAYTHROUGH_E2E=1` (because it hits the real worker and Anthropic). Run it in CI on `pull_request` only, not on every push.
- `scripts/deploy-pages.sh` — wraps the existing deploy command, runs `npm test` first
- `.github/workflows/test.yml` — worker + frontend on push/PR, skip playthrough on push
- Update `CLAUDE.md` §9 deploy instructions to call the wrapper
- Update `CLAUDE.md` §11 session ritual to say "npm test" instead of "npx vitest run"

---

## 7. Effort + timeline

Rough estimates. Human = experienced eng writing Playwright. CC = Claude Code with Opus, given the plan.

| Commit | Lines | Human hours | CC hours | Notes |
|---|---|---|---|---|
| F1 | ~180 | 3 | 1 | Harness is the hard part. Get `seedEngine` right once and the rest is mechanical |
| F2 | ~120 | 2 | 0.5 | Pure pattern work after F1 lands |
| F3 | ~140 | 3 | 1 | Typewriter + overlay timing is fiddly; bitter_path CW gate needs localStorage manipulation |
| F4 | ~180 | 3 | 1 | Mostly pattern; two named regressions need explicit asserts against specific error messages |
| F5 | ~80 | 2 | 1 | CI debug loop; first `npx playwright install` in Actions tends to flake once |
| **Total** | **~700** | **~13h** | **~4.5h** | |

Human calendar estimate: 2 working days if someone picks it up focused, ~1 week at 2h/day around other work. CC estimate: one long focused session plus one debug session. Numbers assume running tests locally between commits.

---

## 8. Risks + open questions

### R1 — Playwright startup vs CI cost
Playwright's `chromium.launch()` is ~2s per invocation. At 17 scene smokes + 1 playthrough that's ~40s minimum. Acceptable locally. In GitHub Actions, first `npx playwright install --with-deps chromium` is ~90s cold. Mitigation: `actions/setup-node` + cache, and keep playthrough opt-in.

### R2 — Kaplay CDN dependency
Every test run fetches `https://unpkg.com/kaplay@3001/dist/kaplay.mjs` from the network. If unpkg flakes, tests flake. The existing jsDelivr fallback in `public/main.js:6-13` helps but both need to be unreachable for a test to fail.
- Option A: accept the dependency. Mirrors production exactly.
- Option B: download kaplay once in F1 into `test/frontend/.vendor/kaplay.mjs`, rewrite the import in a harness-controlled `index.html` copy. Loses production parity.
- Recommendation: accept. Flakes have been near-zero in the 3 weeks `playthrough.mjs` has been in use.

### R3 — Visual regression
Not in scope. Per-scene screenshots are written to `.gstack/qa-reports/frontend-smoke/` for inspection but nothing diffs them. If we want pixel diffs later, `pixelmatch` is ~200 lines on top of F4. Decision: no pixel diffs now. Kaplay re-renders vary subtly frame-to-frame (stars twinkle, water scrolls), and stabilizing the canvas for diffs costs more than it returns.

### R4 — HTML overlay vs canvas
Scenes like `event`, `bitter_path`, `names`, `store`, `newspaper`, `share` put most of their content in `#html-overlay` / `#newspaper-overlay`. Canvas GameObj count alone is a weak signal. Add a second assertion per overlay scene: `page.locator("#html-overlay.active").isVisible() === true` and `page.locator("#overlay-content").innerText().length > 0`. Keep the GameObj check low (5-20) for these scenes.

### R5 — Threshold calibration
We want thresholds that catch "someone deleted half the scene" but not "someone added two trees". Current draft thresholds cribbed from `scripts/visual-qa.mjs`. Plan: after F4 lands, run the suite ten times and set each threshold to `min(runs) - 20%` rounded down. Cheap and empirical.

### R6 — Flaky onUpdate loops
`travel` and `title` have `k.onUpdate()` ticks that spawn and despawn objects. GameObj count on frame 1 is different from frame 60. Harness waits 500-1500ms after `k.go()` before reading stats. Accept some flake; if it bites, wire a `requestAnimationFrame`-based settle helper.

### R7 — Hostile localStorage input for bitter_path
T-bp-3 is important — `bitter_path.js` explicitly coerces `days_since_death` because "trigger_meta is persisted through localStorage and can be tampered." We should include this as an explicit fixture so it can't regress.

### R8 — What about the `[ D ]` in title.js:168?
Grep turned up `k.text(`[ D ] Daily Trail #${dailyNum}`, ...)` — same family as the `[1]` bug but with spaces. Kaplay's parser only trips on `[identifier]...[/identifier]` shapes. `[ D ]` has a space-bracket so it should be safe, but it's borderline. T-title-3 (daily completed) renders this exact branch. If it flakes, fix is trivial (swap to parens). Don't expand scope here.

### R9 — Does `seedEngine` drift from reality?
Mocking `engine.signedState = { state, signature: "test" }` means scenes read mocked fields but never exercise the HMAC verify path. That's fine — verify is worker-side and covered by 175 worker tests. But if a scene starts depending on signature validity client-side (it shouldn't, but accidents happen), the smoke will silently pass while prod crashes. Mitigation: the F5 playthrough smoke hits a real signed state and would catch drift.

### R10 — Worker dependency for playthrough smoke
F5's playthrough hits the real worker at `oregon-trail-api.trails710.workers.dev`, which calls Anthropic. That means: Anthropic outages flake the test; test costs a handful of tokens per CI run. Mitigation: opt-in via `PLAYTHROUGH_E2E=1`, and on PR only. Budget impact negligible (~$0.001/run).

---

## 9. Explicit non-goals

- Not replacing worker vitest tests. 175 tests stay as-is.
- Not testing kaplay itself.
- Not pixel-diff visual regression.
- Not aiming for 100% scene-path coverage. Happy + one edge per scene. The goal is "would have caught shipped bugs," not full branch coverage.
- Not migrating `public/` to TypeScript or adding a build step. Hard no, per CLAUDE.md §1 and §10.
- Not adding an auto-deploy pipeline. Deploys stay manual per CLAUDE.md §9; we only gate the manual command with tests.

---

## 10. Definition of done

- `npm test` runs 175 worker tests + 17 scene smokes + 1 opt-in playthrough, exits 0
- F1-F5 merged to `kaplay-rebuild` as five bisectable commits
- `scripts/deploy-pages.sh` exists and is referenced in CLAUDE.md §9
- `.github/workflows/test.yml` green on `kaplay-rebuild`
- T-river-2 fails if commit `4af2434` is reverted (regression pin)
- T-hunt-1 fails if commit `a129b31` is reverted (regression pin)
