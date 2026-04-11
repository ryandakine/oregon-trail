# Oregon Trail Remake — Planning Doc

**Codename:** TBD (working: "Trail", "OSI Trail", "The AI Trail")
**Owner:** Ryan / On-Site Intelligence
**Purpose:** Free browser-playable marketing asset for OSI. Drives traffic to OSI main site and Congress.osi-cyber.com. Portfolio-grade demonstration of AI product capability.
**Status:** Planning complete. Build not started.

---

## 0. The Thesis

**AI-native Oregon Trail. Every playthrough is genuinely unique because the entire event system, NPC dialogue, and narrative are generated live by an LLM grounded in real 1848 historical data — with a tone slider that runs from classroom-safe to psychological frontier horror.**

Every design decision serves this thesis. Cut anything that doesn't.

**Why it wins:**
- Gameloft's $30 commercial remake uses hand-written events. Finite. Memorizable. Sanitized.
- Every indie clone on itch.io uses a random event table. Finite. Repeatable.
- Ours never runs out of events, responds to what actually happened to *your* party, and at the top tier goes places no other Oregon Trail has.
- The tweet: *"I rebuilt Oregon Trail with Claude as the dungeon master. No two runs are the same."*

---

## 1. Landscape

### Official lineage (Gameloft owns this space)
- **1971 original** — Rawitsch, Heinemann, Dillenberger. BASIC. MECC. 8th grade history class.
- **1985 Apple II** — the iconic one. R. Philip Bouchard at MECC. Cultural touchstone.
- **Oregon Trail II (1995)** — year selection 1840–1860, deeper diseases, wagon weight. Classic peak.
- **3rd–5th Editions (1997–2001)** — diminishing returns.
- **Gameloft 2021 (Apple Arcade)** — 8-bit remake, playable Native American characters, consulted historians.
- **2022 Switch/PC/Steam** — Gameloft + HarperCollins. Current official.
- **Series total:** 65M+ copies, Video Game Hall of Fame.

### Indie / parody space
- **Organ Trail: Director's Cut** — zombie parody. Proves dark sells.
- **Super Amazing Wagon Adventure** — chaos. Proves unhinged sells.
- **Thule Trail** — bike rack company's free marketing-asset clone. **Direct precedent.**
- **The Climate Trail** — itch.io, climate-themed.
- **The Flame in the Flood** — post-apocalyptic river, same DNA.
- **The Banner Saga** — Viking tactical RPG with OT resource bones.

### AI attempts (our actual lane)
- **OpenAI community GPT-3.5 version (2023)** — hobby, never polished.
- **Flint K12 AI Oregon Trail** — SaaS, school-subscription only.
- **Oregon Trail GPT** — text adventure inside ChatGPT Plus. Subscription, no UI, no virality.

**The gap:** no free, public, browser-playable, polished, AI-native Oregon Trail exists. Every AI attempt is a hobby, a paywall, or trapped in someone else's chat. That's the opening.

---

## 2. The Wedge

First free, public, AI-native Oregon Trail with a tone range running from classroom-safe to psychological horror. Uses that range to pull attention back to OSI.

**Positioning:** *"Oregon Trail, but every run is a different story. And it goes as dark as you want it to."*

---

## 3. Core Design Pillars

1. **AI-native, not AI-decorated.** No static event tables anywhere.
2. **Historically grounded.** Real 1848 context in every prompt. Even the horror is period-appropriate.
3. **Free, browser, no login.** Click → play.
4. **Shareable by design.** Every run outputs a newspaper headline, custom epitaphs, a final diary. One-click share.
5. **Tonal range is the feature.** Three tiers. Players opt in. Warning on High.
6. **Respectful where it matters.** Follow Gameloft's lead on Indigenous representation at every tier. Darkness aims at the trail, not at people.
7. **Scope ruthlessly.** Two weekends. Marketing asset, not product.

---

## 4. Tone System (the differentiator)

Three tiers, each with its own system prompt, calibrated empirically during the build.

### Low — "Classic with AI spice"
Fresh events, witty writing, light humor. Safe. Factual deaths. Focus on decisions and resource management. This is the tier that can run inside Congress.osi-cyber.com classroom mode.

### Medium — "Edgy but not gross" (default)
Dark humor, moral gray, uncomfortable choices. Your daughter wants to run off with a shady gambler. Your son is starting to enjoy killing. A trader rips you off and you have to decide whether to hunt him down. Parties fracture over bad decisions.

### High — "Psychological horror and moral decay"
Think *Blood Meridian*, *The Road*, *The Witch*. The money tier.

**The design principle:** horror comes from *mechanics*, not atmosphere. LLMs are bad at atmospheric horror — every model reaches for the same "ominous whispers / cursed landmarks / visions" clichés because that's what's in the training data, and within 3 runs it feels like creepypasta. What LLMs are *good* at is writing specific, grounded human reactions to extreme situations. So we let the model do what it's good at (specific human darkness) and let the game systems do the rest (visible corruption of UI and stat blocks).

**Flagship mechanic: the Personality Virus.**

Every party member has a persistent personality state: sanity, loyalty, morale, traumas, fixations. It's visible to the player on a stat sheet. Events modify it. The LLM reads it when generating dialogue and choices.

The horror is that you can *watch the stats decay in real time*. A character whose sanity drops below a threshold starts making their own choices at events — the "You" choices the player would normally make get pre-empted by an NPC party member acting on their own broken logic. Your teenage son, sanity 12/100, *chooses* to collect fingers from the last grave without asking. You see the journal entry after the fact.

The cannibal survivor you can pick up on the plains is a Personality Virus vector: his trauma stats literally bleed into other party members' stats over time. Within a week his "fixation: hunger" is spreading across everyone's sheets. The game never says "he's corrupting them" — you just watch the numbers move and the dialogue change, and eventually realize what happened three events ago. That's the horror.

**Other mechanical horror beats:**

- **Narrator reliability as a stat.** When party sanity drops past a threshold, the LLM's event prose starts getting subtly wrong. Place names drift. The date in the journal doesn't match last entry. The player notices before the game ever acknowledges it.
- **Starvation as transformation, not a death counter.** Days without food modify personality vectors before they kill anyone. Hungry characters betray, steal, abandon wounded siblings. The LLM generates their reactions based on *who they were* and *how far gone they are*. The guilt stays in their stat block for the rest of the run and shows up in their dialogue.
- **Grief loops.** When a party member dies, survivors get a trauma stat keyed to the relationship. Mothers who lose children get a specific "denial" stat that influences every subsequent event — they might refuse to accept the burial, leave offerings at the grave, talk about the child in present tense. The LLM reads the stat and generates the behavior.
- **Unforgivable choices that persist.** If the player makes a monstrous call under pressure (abandon the wounded, eat the dead, trade a child for passage), it gets recorded as a permanent fixture in every subsequent event prompt. The LLM references it. Other party members reference it. The newspaper at the end references it.

The literary register the LLM writes in is *specific and grounded*, not spooky. No ominous whispers. No "something was watching." Just: "Martha has not spoken in four days. At supper she divided her ration into two portions and left one on the ground beside her." That's the tone. Cormac McCarthy, not R.L. Stine.

Warning on the tone selector: *"High: contains psychological horror, graphic illness, death, and moral collapse."* No age gate — the disclaimer is enough.

**Why this is defensible against LLM slop:** the mechanical horror doesn't depend on the LLM being "good at horror." The LLM just has to write grounded, specific human behavior in response to game state. The game state itself is the scary thing.

### What we do NOT build (at any tier)
- No sexual content.
- No torture-for-its-own-sake.
- No content involving or sexualizing minors.
- No kink mechanics.

These are strategic constraints. LLM providers will refuse or ban the key. Hacker News / Product Hunt / most subreddits auto-flag. It torches the OSI brand. Not up for debate during build.

### Calibration phase (before any game code)
Before writing a single line of game code, run a prompt calibration session:
1. Draft system prompts for each tier at the intended intensity.
2. Generate 50 sample events per tier against Haiku 4.5.
3. Find the actual refusal ceiling — where the model softens, where it refuses, where it produces exactly what we want.
4. Tune prompts until every tier consistently outputs at the ceiling.
5. Save ~200 calibrated sample events per tier as a fallback cache (used if live generation fails or to keep costs down on common events).

Roughly 1 day of work. Determines the real tonal range of the product. The ceiling is almost certainly higher than intuition suggests.

---

## 5. How AI Gets Used (every system)

### 5.1 Event generation (the core loop)
Every ~20–40 miles or at landmarks, the engine sends:

```
Party state: {
  leader, members, health, supplies, location, date,
  weather, recent_events, tone_tier, cross_run_memory_hooks
}

Generate one event. Return JSON: {
  title, description, choices: [{label, consequences}]
}
```

Tone tier determines system prompt. Everything else is the same schema.

### 5.2 NPC dialogue
Every trader, guide, fellow settler, and Indigenous character is an LLM persona: generated background, motivation, knowledge of recent trail events. Cached for the session.

### 5.3 Narrative memory (within-run)
Every run keeps a journal the LLM references. "You remember burying Sarah at Fort Laramie two weeks ago. The others still don't speak of it."

### 5.4 Cross-run memory (the cursed meta-layer)
Vector DB (or simpler: tagged KV store) of past runs. Past deaths, decisions, party names leak into new runs as ghosts, weather curses, landmarks renamed after people you buried. If you cannibalized before, strangers eye your party nervously and won't trade. This is what makes players *feel* the AI is watching them across sessions.

### 5.5 Personality vectors (the flagship mechanic)
Every party member has a lightweight personality state: sanity, loyalty, morale, traumas, fixations. Events update it. The LLM reads it when generating dialogue and choices. A character who's lost two siblings writes differently than one who hasn't. The cannibal-virus mechanic works by having the survivor's personality state *bleed into* the vectors of everyone else in the party over time.

### 5.6 Dynamic epitaphs and death scenes
When a party member dies, the LLM writes a period-appropriate gravestone inscription based on who they were and how they died. These are the primary shareable artifact.

### 5.7 End-of-run newspaper
At run end (success or wipe), the LLM generates a fake 1848 newspaper article summarizing the journey. Masthead, byline, subhead, two paragraphs. *The Independence Gazette, October 1848 — "Party of Five Reaches Willamette Valley After Harrowing Crossing."* This is the #1 thing people will tweet.

### 5.8 Adaptive difficulty
LLM reads party state and tunes event danger. Well-stocked party gets harder challenges, struggling party gets recovery opportunities. Not cheating — good dungeon mastering.

### 5.9 Stretch (V2, not MVP): live scene illustration
Generate an image per landmark or major death using a cheap image model (Flux Schnell, SDXL Turbo). Huge shareability boost, also cost and latency. V2.

### 5.10 Guardrails
- Hard constraint: year is 1848, nothing post-1848 exists.
- Hard constraint: no supernatural events at Low tier, ambiguous at Medium, present at High.
- Hard constraint: respectful representation of Indigenous peoples at all tiers — specific nations by name, no tropes, no broken English.
- Hard constraint: consequences must map to the game's state schema.
- JSON schema validation on every response. Retry on failure. Fallback to cached event on second failure.

---

## 6. Game Loop (MVP)

Kept close to the 1985 original so the AI layer is the star.

1. **Start screen.** Pick profession (farmer / carpenter / banker). Name leader + 4 party members. Pick tone (Low / Medium / High).
2. **General store.** Oxen, food, ammo, clothing, spare parts, medicine. Fixed starting money by profession.
3. **The trail.** 8–10 landmarks, Independence → Oregon City.
   - Set pace: steady / strenuous / grueling.
   - Set rations: filling / meager / bare bones.
   - LLM events fire every 2–5 in-game days.
   - Hunt when food runs low.
   - River crossings: ford / caulk and float / pay ferry.
   - Rest to heal.
4. **Landmarks.** Fort Kearney, Chimney Rock, Fort Laramie, Independence Rock, South Pass, Fort Hall, Fort Boise, The Dalles, Oregon City. Each an LLM-written scene with trade/rest/dialogue options.
5. **End state.** Arrive in Willamette Valley or wipe. Either way → newspaper + epitaphs + share screen.

**MVP scope hard limits:**
- Single player only
- No save/resume (runs are ~20 min)
- No accounts
- No multiplayer
- No classroom mode
- Monospace terminal aesthetic
- Desktop + mobile responsive
- One trail (Independence → Oregon City)

Everything else goes in V2 backlog.

---

## 7. Technical Architecture

Built entirely on your existing stack.

### Frontend
- Static HTML + vanilla JS (Alpine.js if reactivity gets painful)
- Monospace terminal aesthetic — plain CSS with a good monospace font and ASCII borders
- Single page, no router, no build step
- Cloudflare Pages (free)

### Backend
- Cloudflare Workers (your comfort zone)
- `POST /api/event` — takes game state, returns next event JSON
- `POST /api/newspaper` — takes full run history, returns end-of-run article
- `POST /api/epitaph` — takes dead party member data, returns inscription
- Optional: Durable Object for session state. Simpler approach: client holds everything.
- KV for leaderboard (optional) and cached common events

### LLM layer
- **Primary:** Claude Haiku 4.5 via API. Cheap, fast, smart enough. ~$1/M in, ~$5/M out.
- **Experiment/free mode:** Cloudflare Workers AI (Llama 3.1 8B, free tier) for cost-zero testing.
- **Local dev:** Gemma 4 E4B on the Fold for prompt engineering without hitting APIs.

### Cost model (critical)
Per-playthrough with Haiku:
- ~15 events × 800 in + 300 out = 12K in, 4.5K out
- ~5 NPC interactions × 500 in + 200 out = 2.5K in, 1K out
- Newspaper: 2K in, 800 out
- **Total: ~16.5K input, ~6.3K output**
- **Cost per run: ~$0.05**

At 1K plays = $50. 10K plays = $500. 100K plays = $5K.

**Mitigations (the right way — don't wall off players):**
- **Unlimited plays per IP.** Rate limiting kills virality right when it's working. Never show a wall.
- **Tiered model routing.** Expensive Haiku calls only for landmarks, deaths, cannibal-virus scenes, and end-of-run newspapers. Workers AI Llama (free tier) handles routine mid-trail events. Player doesn't see the difference.
- **Throttle the expensive tier, not the player.** When Haiku usage spikes past a daily budget, expensive calls fall back to the pre-calibrated cached event pool (~200 events per tier from the calibration phase). Player keeps playing, game keeps running, cost stays flat.
- **Cache common first-segment events.** The first 20 minutes of every run are structurally similar. Pre-generate 30 opening events per tier, rotate.
- **Cache newspapers by outcome archetype.** A wipe at South Pass from starvation can reuse a newspaper template with details swapped in. Cheaper than full generation.
- **Kill switch on the Haiku endpoint.** Daily budget cap — if exceeded, *everything* falls back to cache until the next day. Game stays playable, cost stops.
- **"Powered by OSI" is the whole point anyway.** If it blows up, the link back to OSI is already doing its job. No soft paywall needed.

### Data layer
- **Historical context file** — one big JSON/markdown with real 1848 data. Landmark descriptions, distances, monthly weather, disease patterns, Indigenous nations by region, political context, period names, trail foods, 1848 prices. Injected into system prompts. **Building this well is 20% of the project and should happen first.**

---

## 8. The 1848 Context File (30% of the project)

**This is not pre-work. This is the single most important deliverable in the project.** If the context file is thin, every LLM event feels like Wikipedia cosplay and the whole thing reads as generic AI slop. If it's rich and specific, every event feels earned.

Budget accordingly: this is 2–3 evenings of structured work, not "a weekend of reading."

### Structure
One master JSON/YAML document that gets chunked and injected into system prompts based on current game state. Sections:

**1. Geography + trail segments (16 segments)**
For each segment: start landmark, end landmark, distance in miles, terrain type, typical pace, river crossings, elevation change, 2–3 sentence atmospheric description grounded in real trail diary accounts.

**2. Landmarks (10+)**
Independence MO, Fort Kearney, Chimney Rock, Scotts Bluff, Fort Laramie, Independence Rock, South Pass, Fort Hall, Fort Boise, The Dalles, Oregon City. For each: real historical description, what a traveler in 1848 would actually see, who ran it, what was traded there, what could go wrong, what real diaries said about it.

**3. Weather by month and region**
April–October on the trail. Real 1848 weather where documented, typical weather otherwise. What conditions do to pace, health, morale. Specific dangers (late snow in South Pass, thunderstorms on the Platte, dust on the high desert).

**4. Disease profiles**
Cholera, dysentery, typhoid, measles, mountain fever, scurvy, snakebite, drowning, accidents. For each: how it presented, how fast it killed, what 1848 treatments existed (almost none effective), how survivors described it. The LLM uses this to write deaths that feel medically real, not generic "she got sick and died."

**5. Indigenous nations by region**
Shawnee/Kaw (Missouri), Pawnee (eastern Nebraska), Lakota/Cheyenne/Arapaho (western plains), Shoshone/Bannock (Rockies), Cayuse/Nez Perce/Umatilla (Oregon). For each: real historical relationship with 1848 travelers (trade, guides, conflict, disease transmission), specific cultural details that prevent the LLM from generating generic "Indian" events, what a respectful encounter looks like. This section is the guardrail that keeps the game from repeating the original's problems.

**6. Political and economic context**
Mexican-American War just ended (February 1848). Gold hadn't been discovered yet at Sutter's Mill until January 1848 — news hadn't reached the East. Mormon migration ongoing (the Mormon Trail parallels Oregon Trail to Fort Bridger). 1837 Panic still in recent memory. Who's going west and why: farmers, failed merchants, religious groups, opportunists. The LLM uses this to generate backstories that actually fit 1848.

**7. Material culture**
What a wagon actually carried. Real 1848 Independence prices. Food that kept (bacon, hardtack, dried beans, flour, coffee, sugar). Clothing, tools, medicine, what "spare parts" actually meant. How much everything weighed. What wagon breakdowns looked like and how they were repaired.

**8. Period voice reference**
Excerpts from real trail diaries (Francis Parkman's *The Oregon Trail*, Narcissa Whitman's letters, pioneer journals). Sentence structures, word choices, tone. This is the calibration material for the LLM's prose voice. Not copied into prompts verbatim — used to tune the style instructions.

**9. Period-appropriate names**
First and last name lists from 1840s census data. Regional variations (Scots-Irish in the Appalachians, German in Pennsylvania, English in New England). Prevents the LLM from generating modern-sounding names.

### Quality bar
Every section cites sources. No hallucinated dates. No anachronisms (no "bacteria" in 1848, people thought disease was miasma). Cross-check against Wikipedia, the National Oregon/California Trail Center, and at least one academic source per major topic.

### How it gets used
System prompt assembly pulls the relevant sections based on game state. At Chimney Rock in July with a cholera case? The prompt loads: Chimney Rock landmark section, July weather for western Nebraska, cholera disease profile, Lakota nation context, period voice reference. The LLM writes an event with all of that as grounding. **That's** the difference between this game and every GPT-3.5 Oregon Trail clone.

### Claude can help compile this
Most of this is research-and-summarize work, which is exactly what Claude Code is good at. One evening of structured prompting ("compile the cholera section of the 1848 context file, cite sources") gets most of the draft. You review, tighten, and add the period voice material yourself because that's taste work.

---

## 9. Historical Research Checklist (subset of §8)

Quick-reference list for the 1848 context file. See §8 for full structure and quality bar.

- [ ] 16 trail segments with distances and terrain
- [ ] 10+ landmarks with historical descriptions
- [ ] Monthly weather patterns by region
- [ ] Disease profiles (cholera, dysentery, typhoid, measles, mountain fever, accidents)
- [ ] Indigenous nations by region with real cultural context
- [ ] 1848 political and economic context
- [ ] Material culture: wagon contents, Independence prices, food that kept
- [ ] Period voice reference from real diaries (Parkman, Whitman, others)
- [ ] Period-appropriate name lists from 1840s census data

---

## 10. Aesthetic Direction

Pick one, commit, don't waste build time deciding.

- **A. Pure terminal ASCII** — amber or green on black, box-drawing characters, zero art budget. Ships fastest. **Recommended for MVP.**
- **B. 1985 Apple II pixel homage** — chunky 16-color pixel art per landmark. Requires an artist or AI-gen assets.
- **C. Illustrated newspaper** — everything styled as an 1848 newspaper. Public-domain engravings from Wikimedia. Extremely shareable. Moderate CSS work.

**Plan:** A for MVP, C for V1.1 after launch if it has legs.

---

## 11. Distribution / Marketing Plan

The whole point.

### Launch sequence
1. **Soft launch:** Indie Hackers + r/SideProject + personal Twitter. Feedback for a week.
2. **Main launch:** Show HN — *"Show HN: I rebuilt Oregon Trail with an LLM as the dungeon master."*
3. **Reddit waves:** r/webgames, r/InternetIsBeautiful, r/pcgaming, r/history, r/roguelikes, r/ChatGPT, r/LocalLLaMA.
4. **Twitter:** thread with 3–4 example newspapers from real runs. The shareables *are* the marketing.
5. **Product Hunt:** after we're confident traffic handling works. One shot.
6. **Directories:** Fazier, PeerPush, BetaList, Uneed, AlternativeTo, SaaSHub. Same list as the Congress plan.

### OSI integration (non-negotiable)
- Every page footer: "Built by On-Site Intelligence — Denver, Colorado"
- Newspaper masthead: "Powered by OSI"
- "Want AI for your business?" soft CTA after 3rd play
- Link to Congress.osi-cyber.com as "see what else we built"

### Teacher angle (stretch)
If Low-tier gets any traction with teachers, that's the signal to build classroom mode in V2. Do not build upfront. Validate first.

---

## 12. Scope + Timeline

Hard deadline discipline. You know the failure mode is scope creep.

### Pre-work (1–2 evenings)
- Historical context file
- Prompt calibration session (all three tiers)
- Save ~200 cached fallback events per tier

### Weekend 1 — MVP playable, ugly
- Core game loop in vanilla JS: state machine, travel, events, river crossings (8 hrs)
- LLM event endpoint on CF Workers (4 hrs)
- System prompts + JSON schema + validation (4 hrs)
- Terminal UI with monospace styling (4 hrs)
- End-state newspaper generation (2 hrs)
- **Goal by Sunday night:** full run start-to-finish, AI-generated events, newspaper drops at end.

### Weekend 2 — polish + ship
- NPC / landmark dialogue (4 hrs)
- Cross-run memory (vector or KV) + personality vectors (4 hrs)
- Share buttons: Twitter card, Reddit, copy link (2 hrs)
- Rate limiting + cost guardrails + kill switch (3 hrs)
- Playtest with 3–5 people, balance tuning (4 hrs)
- Deploy to production domain (2 hrs)
- Launch post, screenshots (3 hrs)
- **Goal by Sunday night:** shipped, tested, ready for Monday soft launch.

### Week 3 — launch
- Soft launch Monday (Indie Hackers + Twitter)
- Fix whatever breaks
- Show HN Thursday (best day for HN)
- Directory submissions throughout week

**Total commitment:** 2 weekends + 1 launch week.

### V2 backlog (do not touch until V1 ships + has traction)
- Scene illustration via image model
- Multiplayer wagon train mode
- Classroom mode + teacher dashboard
- Multiple trails (California, Mormon, Santa Fe)
- Alternate-perspective runs (Indigenous trader, Black homesteader, Chinese laborer heading to gold rush)
- Voiced newspaper endings
- Leaderboards + accounts
- Persistent meta-progression
- Newspaper-style V1.1 aesthetic

---

## 13. Risks + Open Questions

### Risks
- **Cost runaway on virality.** Mitigated: rate limiting, caching, Workers AI fallback, kill switch.
- **LLM drift / bad events.** Mitigated: strict JSON schema, strong system prompts, cached fallback events.
- **Cultural sensitivity.** Mitigated: specific nation names, no combat framing, calibration-phase audit of 50 events per tier for problematic patterns, About page explaining the approach.
- **Scope creep.** Your known failure mode. Hard 2-weekend deadline is the mitigation.
- **Parallel project drift.** Congress.osi-cyber.com SEO grind is in flight. This build eats weekend hours only — weekday evenings stay on Congress.

### Open questions
- [ ] Domain? `trail.osi-cyber.com`, `aitrail.com`, or something else?
- [ ] Leaderboards in MVP or V2?
- [ ] Haiku 4.5 vs Workers AI Llama as default model?
- [ ] Cache newspapers (cheaper) or always generate fresh (more unique)?
- [ ] Brand explicitly as OSI or as a sub-brand linking back?

---

## 14. Next Steps

1. Lock the name and domain
2. Build the historical context file
3. Run the prompt calibration session for all three tiers against Haiku
4. Lock cached fallback event set
5. Weekend 1 build
6. Weekend 2 build + ship
7. Launch week

---

**Bottom line:** strong concept, real gap in market, built on stack you already know, clear 2-weekend scope, clear path to OSI traffic. Risk is scope discipline, not the idea. Don't let this eat the Congress SEO work on weekday evenings.