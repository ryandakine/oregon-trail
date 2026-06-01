# GROK.md — Grok Build Instructions for oregon-trail

**Project**: Oregon Trail AI Edition — browser-playable 1848 trail simulation (trail.osi-cyber.com).  
**Stack**: Cloudflare Workers (TypeScript) + Cloudflare Pages (static Kaplay 3001 frontend) + HMAC-signed state + Anthropic/Grok model routing + no database.  
**Mission**: The cheapest, fastest, most reliable AI-driven Oregon Trail experience. Three tone tiers (Low/Medium/High + hidden Bitter Path). Server-side simulation only. Zero spend-guard incidents.

## Core Principles (Sacred)

1. **Grok 4.3 is Primary** — Faster reasoning, native tool use, real-time historical accuracy. Use it for all new event generation and code changes.
2. **Plan Mode for Any Analysis/Prompt Change** — New tone tier, prompt template, simulation rule, or model-routing change: full `<thinking>` plan + user sign-off before editing.
3. **Test-First + Guardrails** — Every change starts with tests. Never ship event or simulation logic without golden-state verification.
4. **OREGON GUARDRAILS (from GUARDRAILS.md — keep and enforce)**:
   - Server-side simulation only (`simulation.ts:advanceDays()`)
   - HMAC-SHA256 signed state is the anti-cheat (never move logic to client)
   - Three tone tiers preserved; High/Bitter Path is the marketing hook
   - No database by design (client holds signed blob + localStorage journal)
   - AI-spend guard + canary: cost-per-player metrics, $0.05/player/day and $50/day alerts
   - Kaplay 640x480 primitive rendering only; zero build step for `public/`
5. **Full Validation Gate** — `npm test` (both vitest suites), deploy smoke, cost-impact check (< +5% per active player), 20 golden states for new event paths.

## Session Ritual

```markdown
<thinking>
Project: oregon-trail
Task: [user request]
Invariants: Server simulation, HMAC signing, tone tiers, spend guard + canary, Kaplay primitives, no DB.
Risks: Cost blowup, client-side logic leak, prompt drift, spend-guard regression.
Plan: ...
</thinking>

**Let's go.**
```

## Coding Standards

- **Cloudflare Workers** — All game logic in `worker/src/` (simulation.ts, state.ts, hmac.ts). New routes as `case` statements in `index.ts`.
- **Kaplay Frontend** — `public/scenes/` + `public/lib/` primitives only. No HTML UI except the three allowed overlays. No new dependencies.
- **Analysis / Events** — Structured output, tone-aware prompts, confidence scoring, historical-context.json lookup. Model routing: cheapest model for Low/Medium, stronger only for High/Bitter Path.
- **Cost Control** — Token tracking, aggressive caching on duplicate state hashes, state summarization before LLM calls. Expose `/api/costs` metrics.
- **Tests** — Golden hand/state tests for every event path; property-based for HMAC and simulation.

## Forbidden (from your guardrails)
- No client-side simulation
- No database or server-side sessions
- No softening of High tone tier or Bitter Path
- No new spend-regression vectors (always calculate cost impact)
- No unversioned prompts in prod
- Never push directly to main; PR to active branch

## Sub-Agent Strategy

- Simulation + HMAC sub-agent
- Event generation + model routing sub-agent (Grok-primary)
- Kaplay scenes + primitive rendering sub-agent
- Spend guard + cost dashboard sub-agent

**Grok Build is now the primary agent on Oregon Trail AI Edition. Let's make it the cheapest, most reliable AI Oregon Trail on the internet.**
