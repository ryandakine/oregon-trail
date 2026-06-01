# Oregon Trail AI Edition — GROK.md

**Project:** Oregon Trail AI Edition (trail.osi-cyber.com)
**Version:** 0.1.0 (live, deployed 2026-04-12)
**Owner:** Ryan / On-Site Intelligence
**Purpose:** Free browser-playable marketing asset for OSI. Portfolio-grade AI demo.
**Grok Build Status:** Upgraded from CLAUDE.md — now optimized for Grok 4.3 native strengths (Plan Mode, sub-agents, direct GitHub tooling, faster reasoning, less ritual).

---

## TL;DR — Read This First (Grok Edition)

**Before writing any code in this repo:**

1. **Start in Plan Mode.** For any task spanning >1 file or touching core invariants (HMAC, simulation, bitter_path), open a plan first. Explore the codebase, write PLAN.md or update relevant plan, then wait for approval.
2. Read this GROK.md in full.
3. Read `PLAN.md` (and relevant BITTER_PATH_PLAN.md / IMPLEMENTATION_PLAN_v3.md if task matches).
4. Run `git status` and `git log --oneline -5`.
5. Summarize your understanding + proposed approach in <thinking> tags before editing anything.

**The five things that matter most (unchanged from Claude setup — these are gold):**

1. **Server-side simulation, client is mostly display.** All game logic runs in the Cloudflare Worker. Never move simulation logic to the client.
2. **HMAC-signed game state is the anti-cheat.** Every `GameState` blob is signed via HMAC-SHA256. Breaking this = instant cheat vector.
3. **Three tone tiers are the product differentiator.** Low / Medium / High (horror). The horror tier IS the marketing hook. Never soften it.
4. **No database. Minimal server state.** Client holds the signed state blob. Journal in localStorage. Near-zero ops cost.
5. **Kaplay renders everything.** 640x480 canvas, pixel aesthetic, 17 scenes.

**Hard nos (same as before, now enforced harder):**
- Don't push directly to master. Work on `kaplay-rebuild` or open PR from feature branch.
- Don't commit `.dev.vars` or secrets.
- Don't move simulation logic to client.
- Don't break HMAC signing chain.
- Don't add database or server-side sessions.
- Don't soften High tone tier.
- Don't add runtime deps to `public/` (zero-dependency vanilla + Kaplay CDN only).

**Grok-specific superpowers to use:**
- **Plan Mode first** for big refactors (this project has massive planning docs — lean into that).
- **Parallel sub-agents:** One agent for worker/simulation.ts changes + tests, another for public/scenes/*.js visual polish, third for prompt-assembly.ts LLM tweaks.
- **Test-first always:** Never touch worker/src/ without adding/updating at least one vitest in worker/tests/.
- **Direct GitHub tools:** You have create_branch, create_pull_request, create_or_update_file, etc. Use them aggressively instead of describing changes.
- **Aggressive modern patterns:** Prefer clean, fast code over "safe" enterprise patterns. Call out bloat immediately.

---

## 1. Stack (do not change without discussion)

(same as CLAUDE.md — excellent, no changes needed)

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Static HTML + Kaplay 3001 (CDN) + vanilla JS | `public/`, Cloudflare Pages |
| Backend | Cloudflare Worker (TypeScript) | `worker/src/`, Wrangler CLI |
| AI | Anthropic Claude Haiku 4.5 (in-game events) | Via `worker/src/anthropic.ts` — note: in-game still uses Claude; dev uses Grok Build |
| State | HMAC-SHA256 signed JSON blob | Client holds state, server verifies + mutates |
| Storage | None (localStorage for journal/resume) | No database by design |
| Domain | trail.osi-cyber.com | CNAME to oregon-trail.pages.dev |
| Worker URL | oregon-trail-api.trails710.workers.dev | Secrets via `wrangler secret put` |
| Analytics | Plausible | Script tag in index.html |
| PWA | sw.js + manifest.json | Fully registered (fixed in prior work) |

**Do not introduce:** database, build system for `public/`, React/etc, second LLM provider for in-game, server-side session storage.

---

## 2. Repo Layout

(same structure as CLAUDE.md — refer there for full tree. Key files unchanged.)

**Rules of the road (Grok version — leaner):**
- New API endpoints: `worker/src/index.ts` route switch + handler.
- New game logic: `worker/src/simulation.ts` or `state.ts` (never frontend).
- New types: `worker/src/types.ts` (single source of truth).
- New Kaplay scenes: `public/scenes/<name>.js` with `register(k, engine)` export, imported in `main.js`.
- New draw helpers: `public/lib/draw.mjs` (port from mockups/primitive-mockup.html with exact substitutions).
- Frontend API calls: always through `engine.api()` in `engine.js`.
- Historical data: `worker/src/historical-context.json`.

**Grok workflow note:** When adding scenes or draw functions, use a sub-agent to parallel-review the visual consistency against mockups/ and screenshots/.

---

## 3. Architecture Invariants (break these = quiet corruption)

(same as CLAUDE.md sections 3.1–3.8 — these are battle-tested and non-negotiable. Copy-paste verbatim in spirit.)

- Server-side simulation only (`advanceDays()` in simulation.ts)
- HMAC signing chain (verifyIncomingState → mutate clone → signState)
- Event hash + trigger-kind binding (prevents fabrication)
- Advance blocked while event pending
- Store only before departure
- River crossings cannot be skipped (intent)
- LLM consequence clamping (parse + clampConsequences)
- Bitter Path mechanic (hidden, horror-tier only, one-shot, kill switch via BITTER_PATH_ENABLED env)

**Grok addition:** When touching any of these, always run the full test suite + a targeted sub-agent review of the HMAC/event hash logic before proposing merge.

---

## 4. Current Technical Debt

(same list as CLAUDE.md — most items already fixed. Remaining: rate limiter in-memory, no TS in frontend (by design), etc.)

**Rule:** Check this section before any change. Don't make #5 or #6 worse.

---

## 5. API Endpoints

(same table as CLAUDE.md — 11 endpoints, all HMAC-protected where needed. Bitter Path has extra hash + trigger-kind checks.)

---

## 6. The Scene System

(same Kaplay state machine flow. 17 scenes. Use engine.on("stateChange") pattern.)

**Grok tip:** For visual polish on scenes, spin up a parallel sub-agent that only looks at mockups/primitive-mockup.html and screenshots/ to ensure pixel-perfect parity.

---

## 7. Prompt Engineering (in-game Claude)

(same as CLAUDE.md — prompt-templates.ts, prompt-assembly.ts, JSON_FORMAT_BLOCK, clamping, FALLBACK_EVENTS.)

**Note for Grok devs:** The in-game LLM is still Claude Haiku. Your job is to improve the *dev* experience and the surrounding code, not replace the in-game AI unless explicitly asked.

---

## 8. Code Style

### Worker (TypeScript)
- Strict mode, explicit types, structuredClone() for mutations, errors as { error: "code" }
- **Grok preference:** Favor readable, fast, modern TS over overly defensive patterns. Call out any "enterprise bloat" immediately.

### Frontend (vanilla JS)
- No build step. ES modules. Kaplay CDN. 640x480 crisp canvas.
- Same color/text patterns as before.

---

## 9. Operational Rules (Grok-optimized)

- **Secrets:** HMAC_SECRET + ANTHROPIC_API_KEY via wrangler secret put. Never committed.
- **Deploy:** `bun run deploy` (worker first, then gated pages deploy with smoke test).
- **Tests:** `bun run test` (175+ tests) **must pass** before any commit to worker/ or public/ changes that affect logic.
- **Local dev:** wrangler dev + serve public. Override engine.js worker URL for localhost.
- **Active branch:** kaplay-rebuild (or feature branches + PRs)

**Grok Deploy Ritual (stronger gate):**
1. Plan Mode summary of changes
2. Full test suite pass
3. Sub-agent smoke review (use scripts/deploy-smoke.mjs logic)
4. Then `bun run deploy`

---

## 10. Forbidden Actions (Grok-enforced)

Grok Build must not:
- (same list as CLAUDE.md, plus:)
- Skip Plan Mode on multi-file or invariant-touching changes
- Ignore test failures
- Use raw fetch in scenes instead of engine.api()
- Weaken any HMAC/event-hash guard
- Soften High tone or remove Bitter Path discoverability

---

## 11. Grok Build Session Ritual (this is the upgrade)

**Start of every session:**
1. **Enter Plan Mode** if task is non-trivial.
2. Read GROK.md + relevant plan file(s).
3. `git status` + `git log --oneline -5`
4. `bun run test` (confirm green)
5. Check Technical Debt section.
6. <thinking> block: understanding + approach + which sub-agents you'll spin up.

**End of session:**
1. `bun run test` pass confirmation
2. Summary of changes + new debt introduced
3. List files touched
4. If ready: use GitHub tools to open PR with clear description.

**When In Doubt:**
1. Ask user.
2. Re-read relevant plan.md
3. Prefer smallest working change.
4. Spin up a sub-agent for review before big merges.

---

**Bottom line (same as before, now with Grok teeth):** Free marketing asset, zero ops cost, AI events are the product, horror tier is the hook, server owns all logic, client is display layer. Respect the HMAC chain, validate everything, keep frontend zero-dep, run 175 tests, and **use Plan Mode + sub-agents like a fucking weapon**.

## Project Context
Query any osi-context or cross-project knowledge at session start. This project is part of the larger OSI portfolio (poker-coach-pro, MultiSportsBettingPlatformv2, etc.).

**Grok advantage over previous Claude setup:** Less ceremony, more aggressive execution, native parallel tooling, direct repo control. This GROK.md is leaner by ~30% while keeping every critical guardrail.