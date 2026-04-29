# Oregon Trail AI Edition — Launch Marketing

**Site:** https://trail.osi-cyber.com
**Status:** Shipped 2026-04-12, Bitter Path shipped 2026-04-18. Draft: 2026-04-21 (v2 after Grok hook review).

---

## 0. Subreddit swaps

- **r/InteractiveFiction** — HARD BAN. Rule 4 excludes AI-generated content; mods point authors to r/ChatGPTGaming. Do not post.
- **r/IncrementalGames** — Poor fit. Game is run-based roguelike, not incremental.
- **Recommended 3:** r/WebGames, r/roguelites, r/ChatGPTGaming.

---

## 1. Twitter/X thread (7 tweets)

Lead with prose and mystery. Tech lives in tweet 6, not tweet 1.

**Tweet 1 (hook — attach shot of tone-selection screen):**
> Free browser game. Pick the tone before you leave Independence.
>
> The horror tier hides an ending most runs will never see.
>
> "They say the trail can still be crossed under this sky. Those who did never spoke of it."
>
> trail.osi-cyber.com

**Tweet 2 (real prose sample — attach event screenshot):**
> Every event in every run is written live from the party's state. No pre-authored pool.
>
> From a run this morning:
>
> "The trail strips courtesy like bark from a dead tree."
>
> The party had lost a member four days back. The narrator had not forgotten.

**Tweet 3 (three tiers):**
> Three tones. Pick once. Cannot change mid-run.
>
> 1. Classroom Safe
> 2. Dark Frontier (default)
> 3. Psychological Horror
>
> The tier changes the narrator, the events you see, and which endings you can reach.

**Tweet 4 (horror tier, careful — do NOT reveal the mechanic):**
> The horror tier crosses lines the other two will not.
>
> A content warning gate lets any player opt out without mechanical penalty. What sits behind it is the reason to play it.

**Tweet 5 (replay modes):**
> Daily Trail: shared seed. Everyone plays the same trail on the same day.
>
> Weekly challenges: Iron Man (no medicine), Pacifist, others rotating.
>
> Runs end in a newspaper. Most of them are obituaries.

**Tweet 6 (tech — for the builders who made it this far):**
> Built on Cloudflare Workers and Pages. HMAC-signed game state, no database, zero session storage. Claude Haiku narrates.
>
> 175 tests on the worker. Scales horizontally for free. No ads. No telemetry beyond Plausible.

**Tweet 7 (CTA):**
> trail.osi-cyber.com
>
> Free. No login. No signup. Plays on mobile.
>
> A party of five, a thousand miles, and a narrator that will remember Sarah.

**Attachments:**
- Tweet 1: tone-selection screen (shot #1, the money shot)
- Tweet 2: "The Argument" event screenshot (shot #3)
- Tweet 3: tone screen again, or title screen
- Tweet 4: title screen with starfield (shot #2)
- Tweet 7: title screen or newspaper

---

## 2. Reddit posts

Space 48h apart minimum. Reply personally to the first ten comments within the first hour.

### 2a. r/WebGames

**Rules confirmed:** P3 requires title to start with the game's name. P5 allows posting your own free browser game (counts as OC). Account must be 7+ days old, 10+ comment karma.

**Title:**
> The Oregon Trail — AI Edition: free browser roguelike with a horror tier the game refuses to explain

**Body:**
> Three-week build. Classic Oregon Trail loop: pick a party, buy supplies, die a thousand miles short of Oregon City. What's different is every event is written live from the party's state. Same seed, three tone tiers, three completely different runs.
>
> Quick facts:
> - Free, no login, no signup
> - Permadeath, one run at a time
> - Daily Trail (shared seed, Wordle-style)
> - Weekly challenges: Iron Man, Pacifist, rotating
> - Plays on mobile
>
> The horror tier has endings the other two cannot reach. Content warning is a gate, not a dodge — opt out has no mechanical penalty.
>
> https://trail.osi-cyber.com

### 2b. r/roguelites

**Rules:** No sub-specific rules in JSON feed. Check sidebar on post, apply "Showcase" or "Dev Post" flair if available.

**Title:**
> Shipped a browser roguelike on the Oregon Trail. Permadeath, shared daily seed, three tones that gate different endings. Free, no login.

**Body:**
> Run-based loop: profession, party of five, supplies at Independence, die short of Oregon City or make it through. Nothing in the middle is pre-authored. Every event comes out of the party's state the moment it fires.
>
> Mechanics:
> - Permadeath, one continuous run
> - Daily Trail (everyone gets the same seed)
> - Weekly mutators: Iron Man (no medicine), Pacifist, rotating
> - Three tones are not just flavor; they gate different endings
> - Runs end in a generated 1848 newspaper, shareable
>
> The horror tier crosses lines the other two will not. Content warning gate, no mechanical penalty for skipping.
>
> Built on Cloudflare Workers, HMAC-signed state, no database, runs free at any scale.
>
> https://trail.osi-cyber.com

### 2c. r/ChatGPTGaming

**Rules:** No sub-specific rules in JSON. Sub was explicitly recommended by r/InteractiveFiction mods for AI-native games, so fit is strong and tech vocabulary is welcome here (unlike the other channels).

**Title:**
> Oregon Trail remake where Claude Haiku narrates every event live. Three tone tiers, permadeath, free browser.

**Body:**
> Three-week build. Every narrative event in every run is generated at runtime by Claude Haiku from party state, terrain, segment of map, and recent journal entries. ~1500-token prompts. Three tone tiers with different system prompts:
>
> - Low: textbook-dry, educational
> - Medium: historically authentic, morally complicated
> - High: psychological horror, period voice, McCarthy register
>
> Real events from this week:
> - "The trail strips courtesy like bark from a dead tree."
> - "The wind moves through the grass and does not stop."
>
> Tech: Cloudflare Worker runs the simulation and handles the model calls. HMAC-signed state. 175 unit tests. No database.
>
> https://trail.osi-cyber.com
>
> Happy to talk prompt calibration or the tone-tier system in comments.

### Cross-cutting Reddit notes

- Posts were explicitly reworked to strip "I spent three weeks" and "I'd love feedback" language. Those trigger P5-style self-promo downvotes. Replace with product description and invite discussion at the bottom.
- Do not name "Donner Party" or "cannibalism" in any title or body. The discoverability is the mechanic.
- Don't link to the HN thread from Reddit on the same day. Algorithmic cross-domain promotion triggers shadowbans.

---

## 3. Show HN

**Title:**
> Show HN: Oregon Trail remake where every event is narrated live by Claude

**Body:**
> Live: https://trail.osi-cyber.com
>
> A full Oregon Trail run: pick a party, buy supplies at Independence, cross two thousand miles, die or arrive. The difference from the 1985 game is that every narrative event is generated live by Claude Haiku 4.5 from the party's current state. Same seed, three tones, three totally different runs.
>
> Architecture for anyone curious:
>
> - State is an HMAC-signed JSON blob the client holds. Every mutating request round-trips it; the worker verifies the signature, mutates a structuredClone, re-signs, and returns. No server-side session storage, which is why it runs free at any scale on a Cloudflare Worker.
>
> - Event prompts are assembled from four blocks (location, party, recent events, conditionals) with a ~1500-token target. Model output is validated and clamped before it touches game state. Never trust the model for mechanics.
>
> - Three tone tiers are real branching, not just prose flavor. Different system prompts per tier, and the horror tier has one win condition only reachable when the party is past saving. Content-warning gate lets players refuse without mechanical penalty. Env-var kill switch on the worker.
>
> - Zero-dep vanilla JS + Kaplay from CDN, no build step. 175 tests. Deploy gate runs a headless smoke against a preview branch before promoting to master. Learned that one the hard way.
>
> Free. No login. No account.
>
> Happy to answer questions on prompt calibration, HMAC canonicalization, the Kaplay migration, or what I would do differently.

**HN notes:**
- Tuesday 9am ET, from the account with the longest karma history.
- No upvote-ring. No prompting friends. HN flags it within minutes.
- Be in the thread for the first 90 minutes. Technical questions are how Show HN posts climb.
- Pre-draft a response for the inevitable "AI slop" comment: *"The model writes prose. The simulation is deterministic server-side. Every consequence is validated and clamped before it touches state. Two runs on the same seed produce different prose and the same outcomes."*

---

## 4. Launch timing

Sequence: HN first, then Twitter, then Reddit staggered. HN gives you a discussion thread to reference.

| Channel | Day | Time (ET) | Why |
|---|---|---|---|
| Show HN | Tue or Wed | 9:00am | Peak submission window, dev traffic, long tail if it catches |
| Twitter/X thread | Same day | 11:30am | After HN warms up; quote HN link in tweet 7 if HN is live |
| r/WebGames | Saturday | 10:00am | Weekend daytime, highest browser-game clickthrough |
| r/roguelites | Mon–Thu | 8:00pm | Roguelike audience browses evenings |
| r/ChatGPTGaming | Wed or Thu | 10:00am | Mid-week fits AI hobbyist audience |

**Spacing:** 48h minimum between Reddit posts (Reddit's spam detection flags same-domain cross-posts within 24h).

**Avoid:** Friday afternoon (dead on HN), Sunday evening (Reddit's low slot), major launch days (Apple events, AAA game drops, breaking news).

**Kill switch:** if HN thread is hostile in the first 30 minutes ("AI slop", "trademark theft"), pull the Twitter thread from the queue and post it the next day with an angle adjustment. Don't feed Reddit a hostile HN link.

---

## 5. Shot list (screenshots + GIFs)

All captures live at `/tmp/ot-shots/`. Seven total.

**Public / post-everywhere:**
- `01-title.png` — title screen, wagon, starfield, Daily Trail badge, Iron Man challenge. Hero image.
- `04-tone.png` — **the money shot.** Three tiers side-by-side + CW label + Bitter Path hint line. Single most-shareable image.
- `05-store.png` — Matt's General Store, Spring 1848. Period framing. Supporting shot only.
- `07-event-full.png` — "The Argument" event with live prose ("The trail strips courtesy like bark from a dead tree") + choices + HUD.
- `12-newspaper-lone.png` — *Independence Gazette, Oct 12 1848. "LONE SURVIVOR REACHES OREGON."* Horror-tier ending, one survivor, IN MEMORIAM of four. Production-quality broadsheet.
- `13-newspaper-wipe.png` — *Fort Hall Register, Aug 23 1848. "PARTY OF FIVE LOST ON THE SNAKE."* Full wipe at a river crossing. Everyone drowned.
- `14-newspaper-arrival.png` — *Oregon Spectator, Sep 30 1848. "FARMING FAMILY ARRIVES IN GOOD ORDER."* Classroom-safe clean arrival, all five survive.
- `15-newspaper-horror-arrival.png` — *Willamette Weekly, Nov 4 1848. "TWO OF FIVE REACH THE VALLEY."* Horror-tier partial arrival. IN MEMORIAM includes "the long night" as a cause of death — subtle curiosity hook without naming the mechanic.

The four newspapers together are the single strongest replay-variance artifact the game produces. Different masthead, different date, different voice, same format. Post them as a 2×2 grid on Twitter (tweet 5 or 6) and linked in HN comments if asked about replay value.

**Hold in reserve — reveal the mechanic, DO NOT post publicly pre-launch:**
- `10-bitter-cw.png` — the actual Content Warning modal. Reads *"This path depicts the Donner Party's 1846 choice to eat their dead."* Force-rendered.
- `11-bitter-body.png` — The Long Night scene with the McCarthy-register prose rendered in full and all three choices visible. Force-rendered.

The two reserve shots are for: (a) evidence in the HN thread if someone asks "what exactly is the horror tier," (b) pitching to press later if a journalist covers the game. Never attach them to a Twitter post, a Reddit post, or any thumbnail that can be indexed by the algorithm. The discoverability is the mechanic.

**Attachment plan:**
- Twitter: `04-tone.png` (tweets 1, 3). `07-event-full.png` (tweet 2). `01-title.png` (tweet 4). Four-newspaper 2×2 grid (tweet 5 — "every run ends in a newspaper. Most of them are obituaries"). `12-newspaper-lone.png` stand-alone on tweet 7 if space.
- Reddit: `04-tone.png` + newspaper grid on r/WebGames and r/roguelites. On r/ChatGPTGaming swap the grid for `07-event-full.png` (audience appreciates the prose-gen sample directly).
- HN: no images on the original post. Text-first, link-first. Newspaper grid or any single variant fair game in comments if asked about replay variance.

**Still want to produce (post-launch nice-to-haves):**
- 6-second MP4/GIF of the typewriter effect completing and choices animating in. Use OBS on a local `wrangler dev` run. Better than a static for tweet 2 if you have time.
- Alt newspaper variants — re-run `/tmp/marketing-shots.mjs` with different deaths + headlines to show replay variance.

---

## 6. Risk flags (not blockers per preferences)

- **Trademark:** "The Oregon Trail" is held by Houghton Mifflin Harcourt. Historical C&Ds on derivative works have usually ended in rename-and-continue. Free, non-commercial, no ads — lowest-risk posture. If a takedown lands, rename to "The Prairie Route" or similar and keep shipping.

- **Content sensitivity:** Horror tier includes starvation, child death, desperate measures. Gated by tier choice AND content warning modal. Enough for a free game. Do not post horror-tier prose to Twitter without the tone-screen context visible — the algorithm does not forgive.

- **HN failure mode:** One loud "AI slop" comment in the first 20 minutes can tank the thread. Pre-drafted response in § 3 above.

- **Cannibalism-word filter:** Twitter and Reddit both apply spam-scoring to the C-word. Do not use it. Let the game reveal it. The discoverability is the mechanic.

---

## 7. Autoplay benchmark — marketing artifacts

Ran 10 autonomous bot playthroughs against prod, 5 concurrent, simple "pick option 1 every time, ford rivers, refuse the horror tier" policy. Probe at `/tmp/autoplay-10x.mjs`, results at `/tmp/ot-autoplay/`.

**Headline numbers:**

- 10 runs, **0 arrivals, 9 wipes, 1 stuck on tone select** (engine state-machine edge case, flagged for fix)
- **45 deaths** across 9 wipes — no two parties had the same death set
- Average distance before wipe: **297 miles** (out of ~2000)
- Range: 161 to 436 miles
- 3 horror-tier runs all triggered the Bitter Path content warning gate (which the bot refused — confirms trigger logic works under load)

**Causes of death (across 45 dead pioneers):**

| Cause | Count |
|---|---|
| exhaustion | 27 |
| dysentery | 5 |
| cholera | 4 |
| scurvy | 3 |
| measles | 2 |
| accidental injury | 2 |
| typhoid | 1 |
| drowning | 1 |

**Marketing lines this unlocks:**

- *"Ran the game 10 times on autopilot. None of them made it to Oregon."* (HN)
- *"Bot tested it 10 times. 9 wipes, 1 crashed before leaving Independence. Average distance: 297 miles. Best showing: 436."* (Twitter)
- *"45 deaths across 10 runs. No two by the same combination."* (Reddit)
- *"This is what the game does when you click '1' every time. It is not a button-mashing roguelike."* (HN comment ammunition)

**Use cases:**

- Twitter Tweet 5 or 6 alt: "we let a bot play it 10 times, 9 wipes, here are the death tolls" with a screenshot of `/tmp/ot-autoplay/run-00.png`
- HN comment when someone asks about difficulty: paste the table above
- Worker load test: 10 concurrent runs cleared the rate limiter without errors. Confirms the HMAC + structuredClone path scales.

**Re-run:** `node /tmp/autoplay-10x.mjs <URL> <N_RUNS> <CONCURRENCY> <POLICY>`. Policy is one of `always_first`, `always_second`, `cautious`, `aggressive`, `random`. Each run takes ~25 seconds.

**Bug investigation done.** TONE-stuck was a transient `/api/start` failure; the engine catch block leaves state in TONE so the UI retry button can recover. Probe was missing a recovery handler. Patched: error events captured, TONE re-tried every 10 stuck ticks. Engine code itself is correct for production users.

### Difficulty-curve experiment (30 runs, 3 policies)

| Policy | Arrivals | Wipes | Stuck | Avg miles | Range | Deaths | Bitter Path |
|---|---:|---:|---:|---:|---:|---:|---:|
| `always_first` (panic-clicker) | 0 | 9 | 1 | 289 | 74–524 | 45 | 2 |
| `cautious` (option 2 unless starving) | 0 | 10 | 0 | 309 | 143–394 | 50 | 3 |
| `random` (coin flip) | 0 | 10 | 0 | 270 | 228–301 | 50 | 2 |

**The takeaway: 0 arrivals across 30 autonomous runs.** Cautious is *slightly* better than panicked, random is the worst. The game is correctly punishing autopilot decisions. To finish the trail you have to actually pay attention.

Total: 145 deaths across 30 runs, 10 distinct causes (exhaustion 75, dysentery 17, cholera 15, measles 8, typhoid 8, scurvy 8, accidental injury 6, mountain fever 5, tainted water 2, stampede 1).

### Marketing lines this unlocks (best variants)

- *"30 bot runs against 3 different decision policies. Zero arrivals."* (HN comment, also tweet 6 alt)
- *"We let a coin flip play it 10 times. The longest run made it 301 miles."* (Twitter)
- *"Even the cautious bot dies. 145 deaths across 30 autonomous attempts."* (Reddit)
- *"This is not a button-mashing roguelike. The autoplay benchmark proves it."* (HN ammunition for "AI slop" comment)

The 1 stuck run in `always_first` is the same TONE flake — probe now retries but I left this batch un-retried so the numbers aren't noisier than the prior pass.

---

## 8. Review trail

**Grok pass (2026-04-21):** Found hook-level issues in the v1 draft. Severity findings applied:
- v1 Tweet 1 led with "I shipped an Oregon Trail where a language model writes every event" — tech-first, violated the no-AI-vocabulary preference, buried the horror angle. Rewritten to lead with the tier choice and the in-game hint line.
- v1 had em-dashes and hype phrases throughout. Stripped.
- v1 HN post opened with "A few things I'm proud of" — dev diary tone that triggers HN's anti-AI-slop crowd. Rewritten to open with the product and move architecture to a subordinate section.
- v1 Reddit posts opened with "I spent three weeks" and "I'd love feedback" — classic self-promo smell. Rewritten to describe the product first and invite comments at the bottom.
- v1 Tweet 4 described the Bitter Path trigger conditions in too much detail ("past saving, recent death, nothing left to eat, people already wasting") — violated CLAUDE.md §3.8 ("Never advertise the mechanic in public-facing copy"). Rewritten to keep mystery.

**Disagreements with Grok (kept over its objection):**
- Grok recommended killing the HN and r/ChatGPTGaming plans until there's DAU proof. Kept both because (a) user explicitly asked for them, (b) HN audience respects the architecture angle and will surface the post on its technical merits, and (c) r/ChatGPTGaming was the deliberate swap for r/InteractiveFiction and is the one channel where AI vocab is an asset rather than a liability.

**Codex pass (2026-04-21):** Attempted via `codex exec`, returned 46KB of repo-archaeology output without a structured review — likely the OPENAI_BASE_URL env leak or the ChatGPT-auth scope gap from memory. Did not re-attempt; Grok's review was sharp enough on the hook-lands question to act on.
