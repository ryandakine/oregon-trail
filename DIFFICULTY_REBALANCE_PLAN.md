# Difficulty Rebalance Plan — Phase C v3

**Author:** Ryan + Claude
**Date:** 2026-04-28
**Branch target:** kaplay-rebuild
**Plan version:** v3
- v1 killed by Grok: assumed probe under-bought food (it did, but fixing the buy didn't change the ceiling)
- v2 killed by Grok: claimed filling rations = 1.5 lbs (actual = 2 lbs in code), making the food-runway math 25% off
- v3: corrected math, single targeted lever, narrower scope

**Risk class:** Backend / numeric tuning. Codex-eligible.

---

## 1. Premise (corrected math)

The trail is 2000 miles. At steady pace 12 mi/day = 167 days. Filling rations are **2 lbs** per person per day (per `simulation.ts:33`). With 5 alive members that's 10 lbs/day. Total food needed across the trail = **1670 lbs**.

| Profession | Buy Recommended | Food / total need | % of trail covered by starting food |
|---|---:|---:|---:|
| farmer | 200 lbs | 200 / 1670 | **12%** |
| carpenter | 300 lbs | 300 / 1670 | **18%** |
| banker | 400 lbs | 400 / 1670 | **24%** |

**The game design assumes 76-88% of food comes from hunting and landmark trade.** That's intentional. The question is whether either path can actually cover that gap.

**Hunting math:**
- 20 ammo cap per hunt
- Hit rate: 60% (40% miss)
- Yield distribution: rabbit 50% × 5 lbs, deer 33% × 15 lbs, buffalo 17% × 40 lbs
- Expected yield per ammo spent at full hit-rate weighting: ~9.5 lbs
- 20 ammo × 9.5 = 190 lbs avg per hunt
- **Capped at 200 lbs/hunt regardless**

To bridge banker's 1270-lb gap with hunts alone: ~7 hunts at cap = 14 in-game days lost to hunting (1 day each). Each hunt costs 20 ammo. Banker buys 200 ammo (10 × 20-round packs). **Banker can afford exactly 10 hunts max.** That works mathematically but leaves zero margin for combat events that consume ammo.

Farmer buys 100 ammo (5 packs) = 5 hunts max. That bridges 1000 lbs. Farmer needs 1470 lbs from hunting. **Farmer is structurally short ~5 hunts of food unless landmark trade fills the gap.**

**The ammo-per-hunt cap of 20 is the real bottleneck.** Even doubling yield per hit can't bridge the gap if hunts are capped at 200 lbs/hunt — you need MORE hunts, and ammo budget caps that.

## 2. Diagnosis

Three observations from the 30-run autoplay benchmark:

1. **Engaged policy max miles = 637 (32% of trail).** Banker, with rests + 1 successful hunt. Math: 480 mi food runway + 157 mi from hunt/rest extension.
2. **Hunt fires only 2 times across 10 engaged runs** (probe bug, not engine). With reliable hunt firing, engaged ceiling would push to ~800 mi but ammo budget caps total food contribution at ~1900 lbs across all 10 hunts. Still short.
3. **Landmark trade is a real but small lever.** Each trade costs money. Farmer has $400 starting. After Independence purchase, ~$0 left. Banker has $1600 with ~$300 left after Buy Recommended.

The clean lever is **lift the per-hunt ammo cap from 20 to 30 AND drop filling rations from 2 → 1.5 lbs.** Two small changes that compound.

## 3. Proposed change (one constant + one cap)

**File:** `worker/src/simulation.ts`

```ts
// Phase C v3 (2026-04-28): autoplay benchmark + math review confirmed Medium
// is unwinnable for engaged policy. Diagnosis: food runway covers 12-24% of
// trail (was 18-36% under wrong filling=1.5 assumption); engaged extends
// ~33% via hunt+rest but caps at 32% of trail. Lever: extend food runway
// directly via lower filling consumption.
const RATIONS_PER_PERSON: Record<Rations, number> = {
  filling: 1.5,     // was 2 (Phase B.2). Banker runway 480→640 mi. Farmer 200→267 mi.
  meager: 1.2,      // was 1.5. Stays proportional.
  bare_bones: 1,    // unchanged.
};
```

**File:** `worker/src/index.ts` (handleHunt — ammo cap)

```ts
// Phase C v3: lift per-hunt ammo cap 20 → 30. Math: at 9.5 lbs/ammo expected,
// 30 ammo = ~285 lbs/hunt vs 190 lbs prior. Output cap unchanged at 200 lbs
// (so a single hunt still can't trivialize food). The change costs more ammo
// per hunt, which players have to budget for. Rewards stockpiling ammo at
// landmarks; doesn't trivialize naive play.
if (ammoSpent > 30) {  // was 20
  return jsonResponse({ error: "ammo_cap_exceeded: max 30 per hunt" }, 400, origin);
}
```

**Why these two specifically:**

- **Filling 2 → 1.5 lbs:** Single-source attack on food runway. Doesn't touch hunt mechanics, doesn't touch disease, doesn't touch rest. Easiest to reason about and easiest to revert. The Phase B.2 comment in code already considered this lever — the team picked 2 over 1.5 because synthetic test data wasn't compelling enough. We now have compelling data.
- **Ammo cap 20 → 30:** Lifts the per-hunt ceiling (190 → 285 lbs avg) without changing yields. Players who have stockpiled ammo can hunt more aggressively. The 200-lb output cap stays, so the hunt feel doesn't change for trivialization risk.

**Explicitly NOT changing:**

- Disease probability (Phase B.2 already softened to 0.7×; v2's plan to drop to 0.5× was based on bad math)
- Landmark rest heal (+10/member is fine; v2's bump was based on bad math)
- Hunt yields (5/15/40 are fine; v2's bump was based on bad math)
- Starvation grace (4 days is fine; the post-grace cascade is real but the right lever is food runway, not damage softening)
- Bitter Path trigger (separate system; should not move when Medium difficulty changes)

## 4. Test plan

| Codepath | Touched? | Test |
|---|---|---|
| `RATIONS_PER_PERSON.filling` 2 → 1.5 | Y | `simulation.test.ts` reads constant via `RATIONS_PER_PERSON.filling`. Search for value-pinning fixtures. |
| `RATIONS_PER_PERSON.meager` 1.5 → 1.2 | Y | Same — search for fixture pins on meager rations. |
| `handleHunt` ammo cap 20 → 30 | Y | Search for "20" in test/handleHunt files. The error string changes too: "max 20 per hunt" → "max 30 per hunt". Update string comparison tests. |
| Bitter Path trigger | N | unchanged |
| HMAC chain | N | no schema change |
| 175 worker tests | Y | `npx vitest run` must pass; update value-pinned fixtures. |
| Autoplay engaged benchmark | Y (verification) | engaged 25-50% arrival, naive (always_first/cautious) <15%, horror <20% |

**Pre-merge gates:**
1. `npx vitest run` clean
2. Preview deploy + autoplay benchmark in target band
3. Manual playthrough on Medium — must still feel like survival

## 5. Pre-mortem (failure modes)

5 things, ranked by likelihood:

1. **Engaged arrival rate >50%.** Game too easy. Mitigation: revert to filling=1.7 only, leave ammo cap at 30. Re-test.
2. **Engaged arrival rate <25%.** Lever isn't strong enough. Mitigation: stack the v2 changes (disease 0.7→0.5, rest +10→+20). Re-test. If still <25%, the cascade source is something I haven't identified — probably weather pace_modifier slowing miles in late-trail snow regions.
3. **Naive bots also clear 25%+.** Difficulty signal collapses. Mitigation: revert filling 1.5 → 1.7 only.
4. **Worker tests break with vague failures.** Vitest doesn't tell you "this fixture pinned old constant" — you have to read the test. Mitigation: read every test that references `RATIONS_PER_PERSON` or `ammoSpent` before running, predict which will break.
5. **Banker becomes trivially solvable, farmer still wipes.** Banker has 4× the food + 2× the ammo. New math: banker 640 mi runway + 10 hunts × 285 lbs = ~3490 lbs equivalent. Way overshoots. Farmer 267 + 5 × 285 = ~1690 lbs equivalent — just enough. Could lead to "banker is easy mode" feel. Out of scope; flag for Phase D profession rebalance.

## 6. Mandatory review pipeline

Backend numeric tuning + state simulation. Full pipeline applies.

- [x] Phase 1 (plan): this doc, v3
- [ ] Phase 2.3 `/plan-eng-review`: REQUIRED
- [ ] Phase 2.5 `ask-grok -f DIFFICULTY_REBALANCE_PLAN.md`: REQUIRED. Grok killed v1 and v2 on premise errors. v3 is third try.
- [ ] Phase 2.6 `codex` review on plan: ESCALATION-ONLY normally, but **forced this round** because (a) two prior plan errors mean my pre-mortem isn't catching things, (b) Codex's repo-archaeology angle may catch test-fixture impacts I'm not predicting, (c) we want to confirm Codex auth actually works in this session.
- [ ] Phase 3 implement
- [ ] Phase 4 `/review` on diff
- [ ] Phase 5 `/ship`
- [ ] Phase 6 `/qa` post-deploy

## 7. Rollout

Single deploy. Constants in worker module. In-flight runs pick up new constants on next `/api/advance`. Rollback = revert + redeploy.

## 8. Success criteria

**Engaged-policy arrival rate moves from 0/10 to 25-50% on the same 10-run benchmark.**

Secondary:
- always_first / cautious arrival rate: 0-15%
- horror-tier arrival rate (across all policies): 0-20%
- Bitter Path trigger fires in at least 1 of 10 horror runs

## 9. Out of scope

- Per-profession economy rebalance (banker vs farmer scale)
- AI prose quality + tone differentiation eval
- Newspaper share format / OG image
- Probe hunt-trigger reliability bug (only fires twice in 10 engaged runs)

These compound after C v3 lands.
