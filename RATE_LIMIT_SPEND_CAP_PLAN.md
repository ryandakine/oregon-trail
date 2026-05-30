# Plan: Rate Limit + Anthropic Spend Cap (pre-AI-relaunch) — **v2 (post-review)**

**Status:** REVISED after 4-reviewer gauntlet (Claude pre-mortem + Grok + 3-lens Workflow: eng/CF-concurrency/security). Two decisions below need Ryan before implement.
**Owner:** Ryan / Claude Code · **Date:** 2026-05-29 · **Branch:** worktree off `kaplay-rebuild`

**Why now:** Deployed `ANTHROPIC_API_KEY` is **out of credits** (verified: 9/10 keys on disk dead, 1 works; live game serves 100% canned fallbacks at ~150ms). Ryan's call: ship a **global spend cap BEFORE** flipping in the working key, because today's limiter is in-memory **per-isolate** (`index.ts:31-53`) — no real ceiling. With a live key + HN/Reddit traffic, an attacker or bug could run up an unbounded bill on Ryan's shared personal key.

> **Key reframe from review:** The current dead-key behavior IS graceful spend-capping by accident — the worker already degrades to playable fallbacks with zero downtime when Anthropic refuses a call. That means the cleanest *global, exact, free* spend ceiling is **a budget limit on the Anthropic side**, and the worker only needs **per-IP load-shedding** + **visibility**. This is the v2 recommended design (§3). The heavyweight Durable-Object design (now §3-ALT) is kept for the record but is likely overkill.

---

## 1. Goal & non-goals
**Goal:** Before relighting the AI, guarantee the worker cannot run up a surprise Anthropic bill (flood or distributed abuse), shed abusive per-IP load cheaply, and make spend-exhaustion **visible** (the actual bug today was that it was invisible). Respect CLAUDE.md invariants: no DB, no server-side session storage, near-zero ops, no frontend build step.

**Non-goals:** no gameplay/balance/narration changes; no accounts/auth; not chasing a mathematically *exact* cap (impossible anyway — see retry multiplier, §2).

---

## 2. Threat model (corrected)
Each paid request triggers **up to 3** Anthropic attempts (`anthropic.ts` `RETRY_TIMEOUTS=[8000,4000,2000]`, retries on 429/529). So **1 guard-pass ≠ 1 billed call; worst case ≈ 3× billed.** Any cap must carry a retry margin.

**Paid (Anthropic-spending) routes — confirmed by grep + read:**
| Route | Handler | Call site | Fallback today? |
|---|---|---|---|
| `/api/advance` (event) | `handleAdvance` | `callAnthropic` index.ts:299 | ✅ try/catch → `FALLBACK_EVENTS` (index.ts:305) |
| `/api/advance` (bitter_path) | `handleAdvance` | `generateLongNight` index.ts:319 | ⚠️ **NO try/catch in index.ts** — fallback lives inside `anthropic.ts` (`buildLongNightFallback`, exported). Guard must call it explicitly. |
| `/api/newspaper` | `handleNewspaper` | `callAnthropic` index.ts:611 | ✅ try/catch → inline fallback (index.ts:631) |
| `/api/epitaph` | `handleEpitaph` | `callAnthropic` index.ts:669 | ✅ try/catch → inline fallback (index.ts:676) |

All other routes are free (no LLM). `/api/bitter_path` *resolution* is deterministic (`bitterPathConsequences`), not paid — only generation in `/advance` is.

**Vectors:** (1) single-IP flood of `/advance`; (2) distributed flood (defeats any per-IP/per-colo cap — only an account/global ceiling stops it); (3) runaway client retry storm; (4) **denial-of-AI**: cheaply exhausting the daily ceiling forces 100% fallback all day — same invisible symptom as the current dead key. The raw `oregon-trail-api.trails710.workers.dev` host is directly reachable and bypasses the `trail.osi-cyber.com` origin/CORS path, so spend controls must hold on the raw worker URL, not rely on Origin.

---

## 3. Design — v2 (recommended): Anthropic budget + native per-IP limiter + visibility

**Layer A — Account-level spend ceiling (the real global cap). [Ryan, console]**
Set a **monthly (and if available, daily) spend limit** on the Anthropic workspace that owns the deployed key, in the Anthropic Console (Billing → Limits). This is global by construction, exact at the dollar, free, zero-code, zero-ops. When hit, Anthropic returns the same credit error the worker already handles → automatic graceful fallback (proven live today). This is the layer that actually bounds the bill under a distributed flood, which no worker-side per-IP control can.
- Also: put this game's key on its **own Anthropic workspace** (isolated budget, easy rotate/cap) rather than the shared cimco key — recommended but optional (Decision X).

**Layer B — Native per-IP rate limit on the 3 paid routes (cheap abuse shedding). [worker]**
Adopt Cloudflare's native Rate Limiting binding (GA; available without Workers Paid). Replaces the per-isolate map *on paid routes*.
- `wrangler.toml` (exact, verify at implement time — CF syntax churns):
  ```toml
  [[ratelimits]]
  name = "PAID_LIMITER"
  namespace_id = 1001            # required integer; arbitrary unique per-account
  simple = { limit = 15, period = 60 }   # period MUST be 10 or 60
  ```
- Usage: `const { success } = await env.PAID_LIMITER.limit({ key })`. **Key = `request.headers.get("CF-Connecting-IP") || "_noip"`** — all keyless requests share ONE bucket (NOT a per-request random; that would disable the limit). Normalize IPv6 to the **/64** prefix before keying (a /128 key lets one attacker rotate a residential/VPS /64 for free).
- Applied per paid route (in `guardPaidCall`), checked **before** any Anthropic call. `{success:false}` → `429 {error:"rate_limit_exceeded"}` via `jsonResponse(...,origin)` so the 429 carries CORS.
- Caveat (documented, accepted): native binding is **per-colo**, not global. It sheds single-source bursts; Layer A is what bounds aggregate spend.

**Layer C — Per-IP daily volume sub-cap (anti denial-of-AI). [worker, in-memory]**
Layer B is a *rate* cap (15/min); add a coarse *volume* cap so one IP can't monopolize the day's calls: in-memory `Map<ipKey, {day,count}>`, e.g. **60 paid calls/IP/day**, reset on UTC-day change. Per-isolate (fine — it only needs to stop a *single* persistent source; distributed abuse is Layer A's job). Cheap, no storage, no Workers-Paid.

**Layer D — Visibility (the actual bug fix). [worker]**
The silent `catch {}` at index.ts:305/631/676 + `anthropic.ts:514` made the dead key invisible for weeks. Change each to log **structured, secret-free** lines, distinguishing causes:
- `console.warn("llm_fallback", { route, status, msg: truncate(String(e),120) })` — never interpolate `env.*`; never log the raw upstream body (anthropic.ts:58 puts `response.text()` into the Error message → must log status + truncated msg only).
- Distinct `console.warn("spend_or_auth_block", {route})` when the cause is a 4xx credit/auth error vs a timeout, so ops can tell "card declined" from "Anthropic down". A Logpush/`wrangler tail` alert on `spend_or_auth_block` is the heads-up — no Telegram secrets needed.

**Net v2 footprint:** ~1 new helper (`guardPaidCall`) + `wrangler.toml` ratelimit block + Env typing + log-line edits. **No DO, no KV, no Workers-Paid upgrade, no migration, no new test toolchain, no new secrets.** Fully respects the project invariants.

---

## 3-ALT. Heavyweight design (Durable Object) — kept for record, NOT recommended
A single `SpendCounter` DO (`idFromName("global")`) holding a UTC-day counter, called by every paid route. Gives an *exact-ish* global cap in-worker. **Why we're not doing this:**
- **Requires Workers Paid plan** (DOs aren't on free) → violates "near-zero ops cost."
- Its headline advantage (exact cap) **is already a fiction** given the 3× retry multiplier.
- Single global DO = throughput chokepoint + cross-colo latency tax (+150–250ms) on *every* paid call, and is most likely to fall over under the exact flood it defends.
- If kept anyway, it MUST: use `[[migrations]] new_sqlite_classes=["SpendCounter"]` (NOT `new_classes` — legacy KV backend footgun); do check-increment in a **synchronous critical section** (`blockConcurrencyWhile` hydrate → mutate `this.state` sync → `ctx.waitUntil(storage.put)`), never `get→await→put`; fold day-rollover + threshold into that same sync block; **fail-CLOSED** to fallback on DO error. These are the foot-guns the review flagged; they're why this path is higher-risk than Layer A.

---

## 4. Files to change (v2)
| File | Change |
|---|---|
| `wrangler.toml` | Add `[[ratelimits]]` PAID_LIMITER block; `[vars] PAID_PER_IP_DAY_CAP="60"`. |
| `worker/src/index.ts` | Extend `Env` (`PAID_LIMITER: RateLimit`, `PAID_PER_IP_DAY_CAP?: string`). Add `ipKey(request)` (CF-Connecting-IP → /64 normalize → `_noip`) + `guardPaidCall(env, request)` → `{ allowed, status }` (runs Layer B then Layer C; pure-ish, DI-friendly). Call it at the **top of each paid branch independently**: `handleAdvance` `if(trigger==="event")`→guard→`FALLBACK_EVENTS` on block; `else if(trigger==="bitter_path")`→guard→`buildLongNightFallback(...)` on block; `handleNewspaper`/`handleEpitaph`→guard→existing inline fallback. **Never guard at handler top** (landmark/river/none advances must not be rate-limited). Fix the 4 catch sites to structured secret-free logs. No `fetch` signature change needed (no ctx/waitUntil in v2 — no Telegram, no DO). |
| `worker/src/anthropic.ts` | Import `buildLongNightFallback` already exported — confirm signature. Fix `catch` at :514 + ensure error message logged is status+truncated, not raw body. List as changed file (bitter_path fallback lives here). |
| `worker/tests/paid-guard.test.ts` (new) | Pure-function tests for `ipKey` + the daily-sub-cap evaluator + guard decision table. Plain vitest, **zero new deps**. |

---

## 5. ~~Body-size cap~~ — CUT from this PR
Removed per review: Content-Length is spoofable (chunked/omitted) and `request.json()` buffers before HMAC regardless; worst case is already platform-bounded (CF 100MB body / 30s CPU). Filed as a separate future hardening item; out of scope for the spend goal.

---

## 6. Test plan (every codepath) — v2
**`paid-guard.test.ts` (plain vitest, no new toolchain):**
- `ipKey`: IPv4 passthrough; IPv6 → /64 truncation; missing header → `"_noip"` (shared, not unique).
- Daily sub-cap evaluator (pure fn `evalDayCap(stored, now, cap) → {allowed, next}`): first call → allowed,count1; at `cap-1`→allowed, at `cap`→blocked (boundary); UTC-day rollover → reset to 1; garbage/NaN cap → **fail-closed-safe default + logged** (don't let a bad env var silently disable the cap).
- `guardPaidCall` decision table with injected fakes: Layer B `{success:false}` → `{allowed:false,status:429}` (Layer C not consulted); Layer B ok + under day-cap → allowed; Layer B ok + over day-cap → `{allowed:false}` (handler serves fallback, asserts `callAnthropic` **not** invoked via mock).
**Handler integration (extend existing suites):**
- `handleAdvance` event blocked → 200 with a valid `FALLBACK_EVENTS` shape, `pending_event_hash` still set, HMAC valid, choice still resolves (no regression to hash/trigger chain).
- `handleAdvance` bitter_path blocked → 200 with `buildLongNightFallback` output (valid EventResponse).
- `handleNewspaper`/`handleEpitaph` blocked → 200 inline fallback.
- Free routes (`/start`,`/store`,`/choice`,`/river`,`/landmark`,`/hunt`) NEVER call `guardPaidCall` (assert binding untouched).
**Regression:** full `vitest run` stays green (214 today). No HMAC/event-hash/trigger-kind changes.
**Live post-deploy probe (§7):** burst `/api/advance` from one IP on the **raw workers.dev URL** → 429 after limit; free routes unaffected; confirm `spend_or_auth_block` log fires when key is dead.

---

## 7. Rollout (ordering: cap BEFORE key — Ryan's call)
1. **[Ryan, now]** Set Anthropic workspace spend limit (Layer A) + decide cap $ (Decision E). This is the real ceiling and is independent of the worker deploy.
2. Implement Layers B–D on worktree; `vitest run` green.
3. Diff through `/review` (+ Grok if it diverged from plan).
4. `bun run deploy:worker` with the **dead key still in place** → zero player-visible change (still fallbacks), so deploying the limiter is safe to verify in isolation. Burst-test 429 on raw URL; free routes fine; tests green.
5. **Then** `wrangler secret put ANTHROPIC_API_KEY` (working key from `~/cimco-v3/.env`, or a fresh dedicated workspace key per Decision X) + `bun run deploy:worker`. Live probe: novel events at 1–3s latency (AI live); per-IP burst still 429s; Anthropic budget visible in console.
6. `/qa` smoke on trail.osi-cyber.com. Update CLAUDE.md §4 item #5 (limiter no longer "in-memory only" on paid routes) + dev log.

**Rollback:** primary neutralizer = raise `PAID_PER_IP_DAY_CAP` env var (no redeploy); or `wrangler rollback`; or lower the Anthropic budget to 0 to force-degrade to fallback instantly. No DO ⇒ no irreversible migration.

---

## 8. Decisions
**Resolved by review (applied in v2):**
- ~~A keep both limiters~~ → **drop in-memory limiter on paid routes**, native binding owns per-IP there; in-memory stays only for the daily volume sub-cap (Layer C) + free routes.
- ~~B DO vs KV~~ → **neither — use Anthropic-account budget (Layer A) for the global cap.** DO needs Workers Paid + its exactness is fictional; KV free-tier has a 1000-writes/day ceiling that itself becomes the cap by accident. Account budget is the right primitive.
- ~~C fail-open~~ → **fail-CLOSED to fallback** (unanimous across lenses; fallback UX == cap-hit UX, so zero availability cost).
- ~~D Telegram alarm~~ → **structured `console.warn` + Logpush/tail alert** (no new secrets, no `ctx`/`waitUntil` plumbing). Anthropic also emails billing alerts.
- Rename "alarm" → "spend alert" everywhere (no DO `alarm()` API in v2).

**Still need Ryan (genuinely his call):**
- **E — daily/monthly $ ceiling (BLOCKS):** what max $/day (or $/month) is acceptable for this free marketing game? At Haiku 4.5 (~$1/M in, $5/M out) one event ≈ 1.5k in + ~0.8k out ≈ **~$0.005/call**, ×3 retry worst case ≈ **~$0.015/call**. So e.g. $3/day ≈ ~600 worst-case paid calls/day; $10/day ≈ ~2000. Feeds both the Anthropic budget and `PAID_PER_IP_DAY_CAP`.
- **X — key isolation:** point the worker at a **new dedicated Anthropic workspace/key** (clean isolated budget) vs reuse the shared cimco key. Recommend dedicated.

---

## 9. Review trail
| Reviewer | Verdict | Key findings | Applied in v2 |
|---|---|---|---|
| Claude (self pre-mortem) | n/a | per-isolate map is no real cap; retry multiplier; raw-URL bypass | ✅ all |
| ask-grok | revise | DO singleton hot-spot; check()→get/await/put race; Content-Length spoofable; KV not quantified; migration footgun; reset/alert race | ✅ folded (DO dropped, §5 cut, KV quantified, fail-closed) |
| Workflow eng-lens | revise | test plan needs `@cloudflare/vitest-pool-workers`; guard-once incoherent; ctx threading | ✅ pure-fn tests, per-branch guard, no ctx in v2 |
| Workflow CF/concurrency-lens | revise | `new_sqlite_classes` mandatory; `namespace_id` required; single-DO latency; Workers-Paid gate | ✅ DO→ALT only; native binding TOML pinned |
| Workflow security-lens | revise | random-IP fallback disables limiter; denial-of-AI; /64 normalization; raw-URL bypass; don't log upstream body | ✅ `_noip` shared bucket, daily sub-cap, /64, secret-free logs |
| **Synthesis ruling** | **revise-first → v2** | DO overkill for free game; Anthropic budget is the honest global cap; fail-closed; cap-value blocks merge | ✅ this rewrite |

**Codex escalation:** Not needed for v2 — the schema/migration/concurrency surface that would justify Codex (per `feedback_codex_escalation_only`) was the DO design, which v2 drops. v2 has no SQL, no migration, no DO atomicity. If Ryan chooses 3-ALT (DO), Codex review becomes REQUIRED before implementing.
