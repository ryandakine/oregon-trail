# Project signals

## Framework & runtime

- **Worker:** Cloudflare Worker, TypeScript 5.8, Wrangler 4.x, compatibility_date 2026-04-01
- **Frontend:** Vanilla JS (no build), Kaplay 3001 from CDN (unpkg primary, jsDelivr fallback), IBM Plex Mono TTF
- **AI:** Anthropic `claude-haiku-4-5-20251001`, 8s timeout, retry on 429/529
- **Hosting:** Cloudflare Pages (`oregon-trail`) + Cloudflare Worker (`oregon-trail-api`)
- **Domain:** trail.osi-cyber.com (CNAME → oregon-trail.pages.dev); worker at oregon-trail-api.trails710.workers.dev
- **Runtime deps (frontend):** zero — Kaplay CDN only, no npm installs in [`public/`](../../public)
- **DevDeps:** wrangler, vitest 3.x, playwright 1.59, typescript 5.8, serve-handler

## Build / test / lint

| Purpose | Command | Source |
|---------|---------|--------|
| Run all tests | `npx vitest run` | [`vitest.config.ts`](../../vitest.config.ts) — two projects: worker + frontend |
| Worker tests only | `npx vitest run --project worker` | [`worker/tests/`](../../worker/tests) (9 suites) |
| Frontend tests only | `npx vitest run --project frontend` | [`test/frontend/`](../../test/frontend) (Playwright scene smokes) |
| Local worker dev | `npx wrangler dev` | serves worker on localhost:8787 |
| Deploy (worker + pages) | `bun run deploy` | runs `deploy:worker` then `deploy:pages` |
| Deploy worker only | `bun run deploy:worker` | `wrangler deploy` |
| Deploy pages (gated) | `bun run deploy:pages` | [`scripts/deploy-pages.sh`](../../scripts/deploy-pages.sh) — tests → preview → smoke → promote |
| Smoke probe only | `bun run deploy:smoke` | [`scripts/deploy-smoke.mjs`](../../scripts/deploy-smoke.mjs) (~15s Playwright probe) |
| Watch mode | `bun run test:watch` | `vitest` |

**CI gate:** [`.github/workflows/test.yml`](../../.github/workflows/test.yml) — runs `npx vitest run`. 236 test cases total (worker unit + frontend Playwright). Must be green before committing worker changes.

**Deploy gate:** [`scripts/deploy-pages.sh`](../../scripts/deploy-pages.sh) runs vitest → wrangler pages preview push → `deploy-smoke.mjs` (renders river/hunting/bitter_path CW modal) → promote to `--branch=master` only on clean smoke. Gate added 2026-04-18 after P0 scene-render bugs shipped without it.

**Note on local frontend dev:** `engine.js` hardcodes the production worker URL. Must manually override to `http://localhost:8787` for local dev. Frontend needs a separate static server: `npx serve public`.

## Language breakdown

| Language | LOC | Files | % |
|----------|-----|-------|---|
| JSON | 34,927 | 14 | 58% |
| Markdown | 8,787 | 20 | 14% |
| JavaScript | 7,182 | 35 | 11% |
| TypeScript | 7,063 | 30 | 11% |
| HTML | 1,496 | 10 | 2% |
| Shell | 349 | 4 | 0% |
| TOML | 31 | 1 | 0% |
| YAML | 30 | 1 | 0% |

## DevOps & CI

- **Deploy:** manual — no git-provider auto-deploy; `bun run deploy` from repo root
- **Pages project:** `oregon-trail`, production branch `master`; active dev branch `kaplay-rebuild` (PRs target here, not master)
- **Worker secrets:** `HMAC_SECRET`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` via `wrangler secret put`
- **Canary:** worker cron `0 */6 * * *` probes LLM liveness, pages `@osi_dispatch_bot` on failure
- **Analytics:** self-hosted Plausible at analytics.osi-cyber.com

## Domains

| Domain | Repo paths | One-liner | Detail |
|--------|------------|-----------|--------|
| worker | [`worker/src/`](../../worker/src), [`worker/tests/`](../../worker/tests) | CF Worker: simulation engine, HMAC anti-cheat, AI event gen, rate limiting | [`.claude/project/signals/worker.md`](.claude/project/signals/worker.md) |
| frontend | [`public/`](../../public), [`test/frontend/`](../../test/frontend) | Zero-build Kaplay canvas: 17 scenes, state machine, primitive renderer | [`.claude/project/signals/frontend.md`](.claude/project/signals/frontend.md) |

## Cross-cutting

**Test layout:** [`worker/tests/`](../../worker/tests) has 9 vitest suites (unit, fast). [`test/frontend/`](../../test/frontend) has 5 Playwright scene-smoke suites that serve real [`public/`](../../public) via `harness.ts`; fixtures under [`test/frontend/fixtures/`](../../test/frontend/fixtures) seed engine state. [`vitest.config.ts`](../../vitest.config.ts) configures both as named projects. Frontend tests run in `singleFork` pool (one chromium shared via ref-counting).

**HMAC invariant:** [`worker/src/types.ts`](../../worker/src/types.ts) is the single source of truth for `GameState`. `deepCanonicalize` in `hmac.ts` sorts all object keys before hashing — field order is irrelevant but adding/removing fields without updating both worker and frontend breaks verification silently.

**Anti-cheat pair:** every state-mutating endpoint verifies both `pending_event_hash` (SHA-256 of returned event) and `pending_event_trigger` (kind binding). New consumer endpoints must enforce both checks or they are exploitable.

**Partitioning basis:** two halves split by runtime — TypeScript worker (server, compiled, typed) vs vanilla JS frontend (static, no build, untyped). They couple at the API boundary (JSON shape) and at `STORE_PRICES` (fallback copy in `engine.js`). The horror-tier Bitter Path mechanic is split: gate logic in `simulation.ts`, kill switch `BITTER_PATH_ENABLED` in worker env, scene rendering in [`public/scenes/bitter_path.js`](../../public/scenes/bitter_path.js).

**Deterministic substrate:** [`.claude/project/deterministic-signals.md`](deterministic-signals.md)

**Scripts:** [`scripts/`](../../scripts) contains calibration runners (`calibrate.js`, `measure-calibration.mjs`), screenshot capture (`launch-screenshots.mjs`, `launch-screenshots-mobile.mjs`), and the weekly health check (`weekly-check.sh`). These are dev/ops tooling, not production artifacts.

**Docs archive:** [`docs/archive/`](../../docs/archive) contains deprecated pixel-art plans (BLOCKERS_PLAN_v1, GRAPHICS_PROMPTS_v1) — superseded by the v3 primitive renderer.
