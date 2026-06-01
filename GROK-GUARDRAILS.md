# GROK-GUARDRAILS.md

**Oregon Trail AI Edition** — Grok-native guardrails.  
**Risk tier:** 🟢 LOW (game) but **AI-SPEND critical**.  
**Binding:** lean ceremony only; safety and spend guards stay.

## 1. Protected Invariants (verbatim from CLAUDE.md)
- Server-side simulation only. All game logic runs in the Cloudflare Worker. Never move simulation logic to the client.
- HMAC-signed game state is the anti-cheat. Every `GameState` blob is signed via HMAC-SHA256 (`worker/src/hmac.ts`). Breaking this pattern means players can cheat.
- Three tone tiers are the product differentiator. Low (classroom-safe), Medium (morally gray, default), High (psychological horror). The horror tier IS the marketing hook. Never remove or water it down.
- No database. Minimal server state (only an in-memory rate limiter). Client holds the signed state blob.
- Event hash + trigger-kind binding: `/api/choice`, `/api/bitter_path`, and `/api/bitter_path_skip` must re-verify `pending_event_hash` and `pending_event_trigger` or reject.
- Advance blocked while event pending.

**Hard nos (verbatim):**
- Don't push to main/master. PR to `kaplay-rebuild`.
- Don't commit `.dev.vars` or hardcoded secrets.
- Don't move simulation logic to the client.
- Don't add a database.
- Don't break the HMAC signing chain.
- Don't add dependencies to `public/`.
- Don't soften the High tone tier.

## 2. AI-Spend Guard + Canary (non-negotiable)
Real incident: game went dark for weeks on out-of-credit key.  
- Keep cost caps / canary in `worker/src/index.ts` and monitoring.  
- Expose `/api/costs` (per-player daily spend, $0.05/player/day and $50/day total alerts).  
- Model routing + aggressive caching required before any prompt expansion.  
- Token compression and cheapest-model routing mandatory on Low/Medium tone.

## 3. Binding Review Rule
On protected paths (HMAC, simulation.ts, state.ts, anthropic.ts, prompt-*.ts, tone tiers, billing/spend canary, migrations):  
**Grok self-review (skeptic prompt) + `ask-claude` bridge are MANDATORY before merge.**  
Lean-out applies to ceremony and non-protected paths only.

## 4. Forbidden Patterns / Footguns
- Client-side simulation or state mutation.
- Removing or bypassing HMAC verification / event-hash checks.
- Adding a database or server-side sessions.
- Hardcoded secrets or `.dev.vars` in repo.
- Softening High tone or removing Bitter Path.
- New LLM calls without cost-impact calculation and spend-canary update.
- PRs to main/master instead of `kaplay-rebuild`.
- Dependencies in `public/`.
- Results-oriented or non-historical event generation without fallback coverage.

## 5. Before Any Change Touching AI or State
- [ ] Cost impact calculated and < +5% per active player.
- [ ] New event path tested on 20+ golden states.
- [ ] Spend guard + canary checklist signed off in PR.
- [ ] `npm test` + deploy smoke passes.
- [ ] Prompt version bumped if templates change.

**Output must stay under 3 KB. No ceremony. No invented rules.**
