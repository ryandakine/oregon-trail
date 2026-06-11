# Phase 2 — Big Bets: dynamic OG share, challenge scoring, Make Camp

Status: v2 — reviewed (fable-5 eng review + ask-grok), findings merged. Ready for dispatch.
Date: 2026-06-10
Source: docs/IMPROVEMENT_ROADMAP.md §3.

## Hard constraints (inherited, non-negotiable)

No DB/KV/DO (the share id must BE the data — nothing stored). No frontend build step or new `public/` runtime deps (worker deps allowed; wrangler bundles). Simulation stays server-side. HMAC + event-hash/trigger-kind chain untouched. Do not soften the High tier.

## Design decisions locked by review

1. **No `final_score` state field.** `computeRunScore(state)` is deterministic from the verified state — compute on demand at stub-issuance and include the score in the *response* (`share: {url, score, challenge_id}`), never in GameState. (Kills replay-forged-score risk, fixture churn, and the type amendment.)
2. **Share origin:** new worker var `SHARE_BASE_URL` (wrangler.toml `[vars]`, value `https://trail.osi-cyber.com`) + wrangler.toml `routes` for `trail.osi-cyber.com/r/*` and `trail.osi-cyber.com/og/*` (zone `osi-cyber.com`) — Worker routes intercept before Pages on the same host. Fallback if routes can't bind at deploy: unset `SHARE_BASE_URL` → code falls back to `new URL(request.url).origin` (workers.dev — functional, unbranded).
3. **OG image Tier A only in this pass:** `GET /og/<id>.png` = verify MAC → `302` to `${SHARE_BASE_URL}/og-image.png`. Dynamic unfurl value comes from `/r`'s per-run `og:title`/`og:description`. Tier B (satori/resvg PNG) is a follow-up behind a measured bundle-size gate; contracts don't change.
4. **Routing pattern (pinned):** dynamic GETs are matched by prefix BEFORE the exact-match switch in `index.ts`: `if (request.method === "GET" && url.pathname.startsWith("/r/")) return handleResultPage(...)`; same for `/og/`. Do NOT call `guardPaidCall` on these routes (no LLM spend); the coarse limiter still applies (it runs before routing).

---

## Bet 1 — Per-run share page (`/r/<id>`) + OG stub

### Stub contract — `worker/src/share-stub.ts` (new)
- Payload JSON, compact keys: `{v:1, o:"arrival"|"wipe", m:<int>, s:<int>, p:<int>, d:<int>, t:"low"|"medium"|"high", n:"<leader first name>", c:"<challenge_id>"|null, sc:<int>|null}`. (`t` read from `state.settings.tone_tier` — NOT `engine.tone`, which has a known bug.)
- `n` sanitized at creation: keep `[A-Za-z .'-]`, collapse whitespace, max 16 chars, fallback `"A pioneer"`.
- `id = base64url(json) + "." + base64url(HMAC_SHA256(key=HMAC_SECRET, msg="og:v1:" + json))`. Domain-separated from state signing (defense-in-depth; state MACs hash `deepCanonicalize(state)` with no prefix, so domains are disjoint).
- `createShareStub(state, score, env): Promise<string>`; `verifyShareStub(id, env): Promise<StubPayload | null>` — **hard cap `id.length <= 600` BEFORE any decode; try/catch around base64/JSON.parse; verify MAC before trusting any field** (review: DoS vector).
- Expected id ≈ 230 chars (140B json → ~188 b64 + 43 MAC + dot).

### Issuance (worker)
- `/api/advance`: when the run transitions to terminal (`arrival`|`wipe`) — server-detected on the state IT just simulated, never client-claimed — response gains `share: {url: "<base>/r/<id>", score: <int>, challenge_id: <string|null>}`.
- `/api/newspaper`: handler already verifies state and does NOT return signed_state — compute the stub from the verified state in place (no re-sign; stub creation never mutates state) and add the same `share` object to its response. Covers resumed terminal states.
- `<base>` = `env.SHARE_BASE_URL || new URL(request.url).origin`.

### `GET /r/<id>` (worker)
- Verify (length-cap → decode → MAC). Invalid → 404 text. Valid → small HTML page:
  - Dynamic `<title>` + `og:title` ("Reached Oregon City — 3/5 survived · 1,840 pts" / wipe variant), `og:description` (tone label + days + challenge name + "Every event written live by AI"), `og:image` → `<base>/og/<id>.png`, `twitter:card=summary_large_image`.
  - Visible plain-HTML result card + one CTA → `https://trail.osi-cyber.com/?utm_source=oregon-trail&utm_medium=result_page`.
  - **HTML-entity-escape EVERY interpolated value** (incl. challenge name and stringified numerics), not just `n` (review).
  - `Cache-Control: public, max-age=31536000, immutable`.

### `GET /og/<id>.png` (worker) — Tier A
- Verify same as `/r`; valid → 302 to static og-image; invalid → 404. Same cache header on the 302.

### Frontend
- `engine.js`: add `this.shareInfo = null` (constructor); capture `res.share` in **both** `advance()` and `generateNewspaper()` (pinned capture points — review). Expose to scenes.
- `share.js`: when `engine.shareInfo?.url` exists, Twitter/X intent + copy-link use it (UTMs already on CTA targets); PNG download unchanged. Track `share_link_used`.

## Bet 2 — Challenge scoring

- `worker/src/scoring.ts` (new): `computeRunScore(state): number` = `miles + survivors*200 + (arrival ? max(0, 2000 - days*10) : 0)`. Deterministic; unit-test exact values + monotonicity. Known/accepted: a slow full-survival crawl past day 200 can out-score a fast 3-survivor run — that's a legit strategy tradeoff constrained by food economics, not an exploit; per-challenge multipliers are a possible follow-up (review).
- Score travels in the `share` response object and the stub (`sc`); challenge comparison is per-`challenge_id` (in the stub).
- `share.js` + `scenes/newspaper.js` (the SCENE — root `public/newspaper.js` was deleted in phase 1): share text names active challenge + score when present.

## Bet 3 — Make Camp

- **Extract first (review):** the landmark rest values are inline literals in `handleLandmark` (`index.ts` ~1016-1044, `+10 health`, `3*alive` food/day) — extract to exported constants in `worker/src/state.ts` (e.g. `REST_HEAL_PER_DAY`, `REST_FOOD_PER_MEMBER_PER_DAY`) and use them in BOTH handleLandmark and camp (no drift).
- `POST /api/camp` (HMAC): rejects invalid HMAC (403), `pending_event_hash` set (`resolve_pending_event`), phase ≠ travel (`wrong_phase`).
- Effect: 1 day, miles unchanged. **Must run the same per-day attrition path `advanceDays` uses** (food consumption at ration rate, starvation/disease/morale ticks) — reuse/extract the existing per-day tick from `simulation.ts`, do NOT reimplement (review: divergence = free-healing exploit). Then apply rest healing via the extracted constants. High tier: sanity restore halved.
- Response: `{signed_state, summary: {date, food_consumed, healed: [{name, hp_delta}], notes: string[]}}` — shape pinned for the frontend lane; error codes above are the contract.
- Frontend: "Make Camp (1 day)" in the travel pause overlay → new `engine.makeCamp()` via the standard `engine.api()` pattern; button disabled while event pending; surface `wrong_phase`/`resolve_pending_event` as toasts, not silent. Track `camp_made`.

---

## Lane partition (parallel, disjoint)

- **WORKER:** `worker/src/{share-stub,scoring}.ts` (new), `worker/src/index.ts`, `worker/src/state.ts` (extract rest constants), `worker/src/simulation.ts` (expose per-day tick if needed), `worker/tests/**`, `wrangler.toml` (`[vars] SHARE_BASE_URL`, routes).
- **FRONTEND:** `public/engine.js`, `public/scenes/{share,travel,newspaper}.js`, `test/frontend/**`.
- No shared files. The contracts in this doc are frozen — a lane that needs a contract change STOPS and reports instead of improvising.

## Test section

| Codepath | Test |
|---|---|
| stub round-trip / tamper / length-cap DoS / sanitize / id-length bound | share-stub.test.ts |
| /r valid → escaped HTML + immutable cache; invalid/oversize → 404 | worker route tests |
| /og valid → 302; invalid → 404 | worker route tests |
| advance terminal → `share` present (url+score+challenge); non-terminal → absent | handlers tests |
| newspaper response gains `share` (no signed_state regression) | handlers tests |
| computeRunScore exact + monotonic | scoring.test.ts |
| camp gates (HMAC/pending/phase) + attrition parity with advanceDays + rest heal + high-tier sanity penalty + landmark rest unchanged after extraction | handlers/simulation tests |
| engine captures share in advance+newspaper; share.js uses /r URL; camp button disabled-when-pending | frontend Playwright |
| Full gate | `npx tsc --noEmit` + `npx vitest run` green |

## Review trail

### Cross-model analysis (2026-06-10)
| Finding | fable-5 | Grok | Resolution |
|---|---|---|---|
| workers.dev share origin breaks branded loop | 🔴 | ✓ (medium) | SHARE_BASE_URL var + worker routes on trail.osi-cyber.com (decision 2) |
| `final_score` in state → replay/forgery + fixture churn | 🟡/🔴 | ✓ (high) | Dropped from state; computed on demand (decision 1) |
| Unbounded id decode = DoS | — | ✓ (critical) | 600-char cap before decode + try/catch (applied) |
| Escape all fields at render, not just `n` | — | ✓ | Applied |
| Tier-B WASM bundle unmeasured/unenforced | 🟡 | ✓ (high) | Tier B deferred; Tier A 302 ships (decision 3) |
| Routing pattern unpinned → lane divergence | 🟡 | ✓ (process) | Prefix-match pattern pinned (decision 4) |
| handleNewspaper has no signed_state to attach | 🟡 | — | Stub computed in place, response-only (applied) |
| Landmark rest "plumbing" is inline literals | 🟡 | ✓ (critical, as tick-divergence) | Extract constants + reuse real per-day tick (applied) |
| engine.js capture points unspecified | 🟡 | ✓ | Pinned: advance() + generateNewspaper() (applied) |
| guardPaidCall on /r,/og ambiguity | 🟡 | — | Explicit exemption (decision 4) |
| Score gameable via camp crawl | 🟡 | ✓ (medium) | Accepted tradeoff, documented; follow-up multipliers |
| MAC prefix "insufficient" for cross-protocol | — | ✗ (critical) | REJECTED — distinct-domain HMAC is sound; state MAC input domain is disjoint (fable-5 concurs; prefix kept as defense-in-depth) |
| Camp needs event-hash/trigger chain | — | ✗ (high) | REJECTED — camp emits no events; it rejects when one is pending |
| ts/rid for id uniqueness/enumeration | — | ✗ (medium) | REJECTED — ids carry a MAC; identical-run collisions are harmless cache hits |
| ETag/304 on immutable | — | ✗ (medium) | REJECTED — max-age+immutable is sufficient on CF |
| "Big bets before SW cache-bump" sequencing | — | ✗ | REJECTED — cache-bump shipped in phase 1 (2fdb442) |
