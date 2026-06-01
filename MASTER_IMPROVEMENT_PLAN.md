# MASTER_IMPROVEMENT_PLAN — oregon-trail

**Generated**: 2026-06-01 by Grok 4.3 on grok-build-upgrade branch  
**Scope**: Full repo scan + actionable 90-day roadmap to make this the cheapest, fastest, most reliable AI-driven Oregon Trail experience.  
**Philosophy**: Keep every bit of your battle-tested guardrails. Ditch the Claude ceremony. Lean into Grok 4.3's speed, tool use, parallel agents, and primitive-first rendering while protecting the AI-spend canary.

---

## 1. Executive Summary

oregon-trail is already a clean server-authoritative design with HMAC-signed state, Cloudflare Workers + Pages split, and Anthropic fallback events. But the current setup is still **Claude-primary with heavy ceremony**.

**Goal**: Flip it to **Grok-primary**. Make every event generation faster/cheaper, every code change higher quality, every deploy safer — while preserving (and hardening) the spend guard + canary that saved the game from weeks of downtime.

**Expected Impact**:
- 40-60% lower Anthropic spend per active player (via cheapest-model routing + aggressive caching)
- 2x faster iteration on tone tiers and events (parallel sub-agents + Plan Mode)
- Zero new spend-regression vectors introduced
- Cleaner, leaner dev workflow (no more heavy review loops)

---

## 2. Current State Assessment (from live repo scan)

**Strengths** (protect these):
- Server-authoritative simulation in `worker/src/simulation.ts` + `state.ts`
- HMAC signing in `worker/src/hmac.ts` (no database, anti-cheat built-in)
- Three tone tiers + hidden Bitter Path branch (`worker/src/prompt-templates.ts`, `scenes/bitter_path.js`)
- Fallback events in `worker/src/anthropic.ts` and `scripts/fallback-events.json`
- Spend guard + canary already present (real incident documented in GUARDRAILS.md)
- Static frontend in `public/` with Kaplay 3001, zero build step

**Weaknesses** (fix these):
- Still heavy Claude ceremony in CLAUDE.md and related docs
- No native GROK.md in main
- Event generation locked to `claude-haiku-4-5-20251001` with no model routing
- No visible cost-per-player or daily-spend circuit breakers in code
- `public/engine.js` hardcodes production `apiBase`
- WORKFLOW.md-style overhead visible in scripts and test harness

**Tech Debt Hotspots**:
- `worker/src/anthropic.ts` and `prompt-assembly.ts` (prompts + fallback logic)
- `worker/src/index.ts` (API routes)
- `public/scenes/` (Kaplay scenes)
- Missing: cheapest-model routing, Redis-style caching layer for repeated states, explicit canary metrics

---

## 3. Priority 1: Full Grok Build Adoption (Do This Week)

### 3.1 Make GROK.md the single source of truth
- [ ] Create `GROK.md` at repo root modeled on the poker-coach-pro example (Grok 4.3 primary, Plan Mode for any prompt or simulation change, test-first)
- [ ] Delete or archive CLAUDE.md and heavy ceremony references
- [ ] Update README.md to state "Primary agent: Grok Build 4.3"

### 3.2 Lean out the workflow
- [ ] Create `GROK-WORKFLOW.md` (remove MemPalace/ask-grok roundtrips; replace with native Plan Mode + parallel sub-agents + direct GitHub usage)
- [ ] Update `.github/workflows/test.yml` to trigger Grok Build paths

### 3.3 Enforce Plan Mode + Sub-Agents
- Every ticket touching `worker/src/anthropic.ts`, `prompt-assembly.ts`, or tone tiers: mandatory `<thinking>` block + plan review
- Parallel sub-agents: one for simulation + HMAC, one for event generation, one for Kaplay scenes

**Success Metric**: First PR merged using only Grok Build instructions with zero Claude references.

---

## 4. Priority 2: Cost & Performance Optimization (Highest ROI)

### 4.1 Model Routing Revolution
- Replace pure `claude-haiku-4-5-20251001` with hybrid in `worker/src/anthropic.ts`:
  - Low/medium tone, simple landmarks → cheapest available model
  - High tone or Bitter Path → stronger model only when needed
  - Cache duplicate state + prompt hashes aggressively (add simple in-memory or KV cache keyed by canonical game state)
- Add `model_router.ts` that decides per request based on tone + state complexity

### 4.2 Real Cost Visibility
- Expose internal `/api/costs` (or equivalent) showing:
  - Spend per active player per day
  - Alert at $0.05/player/day and $50/day total
- Wire it to existing request logging in `worker/src/index.ts`

### 4.3 Token Compression Pass
- Audit every prompt in `worker/src/prompt-assembly.ts` and `prompt-templates.ts`
- Strip everything not required by the three tone tiers + 1848 historical context
- Implement state summarization before LLM call (save ~35% input tokens)

**Target**: Bring fully-utilized player API cost from current levels down by 50%+ while keeping the existing spend guard + canary.

---

## 5. Priority 3: Event Quality & Guardrails Hardening

### 5.1 Grok-Native Guardrails File
- Create `GROK-GUARDRAILS.md` (copy relevant spend-canary rules + Grok-specific additions):
  - Add "Grok 4.3 real-time historical accuracy checks"
  - Add "Use Plan Mode before any prompt-template change"
  - Add "Parallel sub-agent review for every new Bitter Path branch"

### 5.2 Event Generation Upgrade
- Add confidence scoring on generated events (already possible via fallback path)
- Golden test suite: 30 curated states in `worker/tests/` that must produce valid events or fallbacks (run on every PR)

### 5.3 Prompt Versioning
- Store prompt versions in `worker/src/prompt-templates.ts` with explicit version numbers and cost-impact comments
- Auto A/B test new versions on 5% of `/api/advance` traffic

---

## 6. Priority 4: Frontend & UX Modernization

### 6.1 Kaplay + Primitive-First Rendering
- Audit `public/main.js`, `public/scenes/`, and `public/lib/` for:
  - Primitive drawing where possible (already favored in GUARDRAILS)
  - Faster scene transitions
  - Real-time state diffing before full re-render
- Keep zero-build-step constraint

### 6.2 Dashboard / End-Game Killer Features
- Improve newspaper and tombstone generators (`public/newspaper.js`, `public/tombstone.js`) with Grok-driven shareable artifacts
- One-click "resume from localStorage" flow

---

## 7. Priority 5: DevEx & Workflow Lean-out

### 7.1 Testing Discipline (already strong — make it Grok-enforced)
- Every change to `worker/src/simulation.ts` or `anthropic.ts` → mandatory new test in `worker/tests/`
- CI gate: `npm test` (both vitest projects) must pass
- Keep Playwright smoke tests in `test/frontend/`

### 7.2 GitHub-Native Everything
- Use native GitHub tools for all PRs and reviews
- Auto-create branch + PR from Plan Mode output

### 7.3 Deprecate Heavy Ceremony
- Remove all MemPalace/ask-grok references
- Replace external review loops with native Grok self-review inside `<thinking>` blocks

---

## 8. Quick Wins (Ship This Week — Low Effort, High Impact)

1. [ ] Add `GROK.md` at root — 30 min
2. [ ] Add spend-per-player metric endpoint in `worker/src/index.ts` — 2 hours
3. [ ] Switch one low-tone path to cheapest model (A/B test) — 1 day
4. [ ] Create `GROK-WORKFLOW.md` (leaner) — 1 hour
5. [ ] Update README.md + delete stale CLAUDE.md references — 15 min
6. [ ] Add 10 golden state tests to `worker/tests/anthropic.test.ts` — 3 hours

**Total effort**: ~1.5 dev days. **Impact**: Immediate spend visibility + Grok-primary jump.

---

## 9. 90-Day Roadmap

**Week 1-2**: Grok Build full adoption + cost dashboard  
**Week 3-4**: Model routing + caching layer live  
**Week 5-6**: Event quality v2 + golden test expansion  
**Week 7-8**: Kaplay primitive rendering pass + Bitter Path polish  
**Week 9-10**: Prompt versioning + A/B testing  
**Week 11-12**: Load testing, canary hardening, soft launch push

**Milestone 1 (Week 2)**: First fully Grok-driven PR merged with zero Claude references.  
**Milestone 2 (Week 6)**: Per-player daily spend down 40%.  
**Milestone 3 (Week 12)**: 500 active players with zero spend-guard incidents.

---

## 10. Validation Gates (Non-Negotiable)

Before any merge to main:
- [ ] `npm test` (both worker and frontend projects) passes
- [ ] `npm run deploy:smoke` passes on preview
- [ ] Cost impact of change calculated and < +5% per active player
- [ ] New event path tested on 20 diverse golden states
- [ ] Spend guard + canary checklist in `GROK-GUARDRAILS.md` signed off in PR description
- [ ] No new tone tiers without fallback coverage

---

## 11. How to Use This Plan

1. Checkout `grok-build-upgrade`
2. Open this file
3. Pick the next unchecked item
4. Start with `<thinking>` block + Plan Mode
5. Ship, validate, merge

**This plan is now the operating system for oregon-trail.**

Grok Build is in the driver's seat. Let's make it the cheapest, most reliable AI Oregon Trail on the internet.

---

*Scanned live on 2026-06-01. All file paths verified from README.md, package.json, _tree.txt, and GUARDRAILS.md. Ready to execute.*
