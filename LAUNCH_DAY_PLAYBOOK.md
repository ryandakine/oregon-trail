# Launch Day Playbook — Oregon Trail AI Edition

**Generated:** 2026-04-29 (early AM ET)
**Optimal Show HN slot:** Wed 2026-04-29 9:00 AM ET (~7 hours from generation)
**Source plans:** `LAUNCH_MARKETING.md` (full strategy + Grok review trail)

This file is the hour-by-hour execution checklist. Copy is paste-ready.

---

## T-minus checklist (do before 9 AM ET)

### CRITICAL — screenshot gap (verified 2026-04-29 early AM ET)
`/tmp/ot-shots/` is empty. The screenshots LAUNCH_MARKETING.md references **do not currently exist**. They were generated for an earlier draft and never re-saved durably. This is the #1 launch-day blocker.

**Required new screenshots (~30 min to generate):**
- [ ] `01-title.png` — title screen with wagon + starfield + Daily Trail badge
- [ ] `04-tone.png` — three tone tiers side-by-side **(THE MONEY SHOT — single most important image)**
- [ ] `07-event-full.png` — an LLM event with prose visible + 4 choice buttons
- [ ] `12-newspaper-lone.png` — horror-tier "lone survivor" newspaper
- [ ] `13-newspaper-wipe.png` — full-wipe river-drowning newspaper
- [ ] `14-newspaper-arrival.png` — classroom-safe clean arrival newspaper
- [ ] `15-newspaper-horror-arrival.png` — horror-tier partial arrival newspaper

**How to generate them (manual, since they have to look polished):**
1. Open https://trail.osi-cyber.com on a desktop browser (Chrome at 1280×800, no devtools open).
2. **Title shot:** load the title screen. Cmd-Shift-4 (Mac) or Snipping Tool (Windows) → save as `01-title.png`.
3. **Tone shot:** start a new game, advance to the tone-selection screen. Capture as `04-tone.png`.
4. **Event shot:** play through to an LLM event (usually within 3-5 days of travel). Capture as `07-event-full.png`.
5. **Newspaper shots:** play 4 separate runs to completion — one classroom-safe arrival (Easy + low tier), one horror lone-survivor (Hard + high tier), one wipe (anything that ends in <50% survivors), one horror partial arrival. Each ends with a newspaper. Capture each.
6. Save all to `/tmp/ot-shots/` so the rest of this playbook's filenames work.
7. Make the 2×2 newspaper grid: `montage /tmp/ot-shots/12-newspaper-lone.png /tmp/ot-shots/13-newspaper-wipe.png /tmp/ot-shots/14-newspaper-arrival.png /tmp/ot-shots/15-newspaper-horror-arrival.png -tile 2x2 -geometry +8+8 -background black /tmp/ot-shots/16-newspaper-grid.png` (requires ImageMagick: `sudo apt install imagemagick`).

**Why I (Claude) didn't do this for you:** screenshot capture from a live canvas game requires real browser sessions and hand-curation for "the prose actually looks good in this one." Headless canvas captures end up muddy. This is 30 min of your time, not automation.

**Alternative:** if /tmp/ot-shots/ is still empty 30 min before launch, push HN by 24 hours. Don't post without images. The HN post is text-only, so HN can technically go without — but Twitter without images flops. Fire HN solo at 9 AM if needed and delay Twitter.

### Pre-flight (general)
- [ ] Verify https://trail.osi-cyber.com loads cleanly on desktop + mobile (one fresh-cache run)
- [ ] Verify https://trail.osi-cyber.com/privacy loads (newly deployed — needed if anyone asks)
- [ ] Be at the keyboard 9:00–10:30 AM ET. The first 90 minutes on HN decide everything.
- [ ] Pre-stage the Twitter thread as drafts in TweetDeck or your Twitter web compose, so 11:30 AM ET is a 5-minute click-through.
- [ ] DO NOT post anywhere before 9 AM ET. HN should always go first.

---

## Step 1 — 9:00 AM ET — Show HN

URL: https://news.ycombinator.com/submit
Use: the account with the longest karma history.

**Title:**
```
Show HN: Oregon Trail remake where every event is narrated live by Claude
```

**URL:**
```
https://trail.osi-cyber.com
```

**Comment to post immediately after submission (HN allows one self-comment per submission):**
```
Live: https://trail.osi-cyber.com

A full Oregon Trail run: pick a party, buy supplies at Independence, cross two thousand miles, die or arrive. The difference from the 1985 game is that every narrative event is generated live by Claude Haiku 4.5 from the party's current state. Same seed, three tones, three totally different runs.

Architecture for anyone curious:

- State is an HMAC-signed JSON blob the client holds. Every mutating request round-trips it; the worker verifies the signature, mutates a structuredClone, re-signs, and returns. No server-side session storage, which is why it runs free at any scale on a Cloudflare Worker.

- Event prompts are assembled from four blocks (location, party, recent events, conditionals) with a ~1500-token target. Model output is validated and clamped before it touches game state. Never trust the model for mechanics.

- Three tone tiers are real branching, not just prose flavor. Different system prompts per tier, and the horror tier has one win condition only reachable when the party is past saving. Content-warning gate lets players refuse without mechanical penalty. Env-var kill switch on the worker.

- Zero-dep vanilla JS + Kaplay from CDN, no build step. 175 tests. Deploy gate runs a headless smoke against a preview branch before promoting to master. Learned that one the hard way.

Free. No login. No account.

Happy to answer questions on prompt calibration, HMAC canonicalization, the Kaplay migration, or what I would do differently.
```

**The pre-drafted "AI slop" rebuttal** (post if anyone says this in first 30 min):
```
The model writes prose. The simulation is deterministic server-side. Every consequence is validated and clamped before it touches state. Two runs on the same seed produce different prose and the same outcomes. Happy to share the validator code if you're curious.
```

**Be in the thread for the next 90 minutes.** Reply to every technical question. Don't reply to trolls. Don't upvote-ring. Don't tell friends to upvote — HN flags it within minutes.

---

## Step 2 — 11:30 AM ET — Twitter/X thread

Post as a thread (each tweet a reply to the previous). Lead is mystery, not tech.

**Tweet 1** (attach `04-tone.png`):
```
Free browser game. Pick the tone before you leave Independence.

The horror tier hides an ending most runs will never see.

"They say the trail can still be crossed under this sky. Those who did never spoke of it."

trail.osi-cyber.com
```

**Tweet 2** (attach `07-event-full.png`):
```
Every event in every run is written live from the party's state. No pre-authored pool.

From a run this morning:

"The trail strips courtesy like bark from a dead tree."

The party had lost a member four days back. The narrator had not forgotten.
```

**Tweet 3** (attach `04-tone.png` again):
```
Three tones. Pick once. Cannot change mid-run.

1. Classroom Safe
2. Dark Frontier (default)
3. Psychological Horror

The tier changes the narrator, the events you see, and which endings you can reach.
```

**Tweet 4** (attach `01-title.png`):
```
The horror tier crosses lines the other two will not.

A content warning gate lets any player opt out without mechanical penalty. What sits behind it is the reason to play it.
```

**Tweet 5** (attach the 4-newspaper grid `16-newspaper-grid.png` if generated, otherwise `12-newspaper-lone.png`):
```
Daily Trail: shared seed. Everyone plays the same trail on the same day.

Weekly challenges: Iron Man (no medicine), Pacifist, others rotating.

Runs end in a newspaper. Most of them are obituaries.
```

**Tweet 6** (no attachment, plain text):
```
Built on Cloudflare Workers and Pages. HMAC-signed game state, no database, zero session storage. Claude Haiku narrates.

175 tests on the worker. Scales horizontally for free. No ads. No telemetry beyond Plausible.
```

**Tweet 7** (attach `01-title.png` or `12-newspaper-lone.png`):
```
trail.osi-cyber.com

Free. No login. No signup. Plays on mobile.

A party of five, a thousand miles, and a narrator that will remember Sarah.

[link to your HN thread if it's still on the front page]
```

After posting, quote-tweet the HN thread URL into Tweet 7 if HN has any traction. If HN flopped (<10 points by 11 AM ET), skip the quote and post Twitter standalone.

---

## Step 3 — Saturday 5/2 10:00 AM ET — r/WebGames

URL: https://reddit.com/r/WebGames/submit

**P3 requirement:** title MUST start with the game name.
**P5 confirmed:** posting your own free browser game IS allowed (counts as OC).
**Account requirement:** 7+ days old, 10+ comment karma. Verify your account meets this.

**Title:**
```
The Oregon Trail — AI Edition: free browser roguelike with a horror tier the game refuses to explain
```

**Body:**
```
Three-week build. Classic Oregon Trail loop: pick a party, buy supplies, die a thousand miles short of Oregon City. What's different is every event is written live from the party's state. Same seed, three tone tiers, three completely different runs.

Quick facts:
- Free, no login, no signup
- Permadeath, one run at a time
- Daily Trail (shared seed, Wordle-style)
- Weekly challenges: Iron Man, Pacifist, rotating
- Plays on mobile
- Runs end in a generated 1848 newspaper, shareable

The horror tier crosses lines the other two will not. Content warning gate, no mechanical penalty for skipping.

Built on Cloudflare Workers, HMAC-signed state, no database, runs free at any scale.

https://trail.osi-cyber.com
```

**Attach:** `04-tone.png` + the newspaper grid.

**First-hour rule:** reply personally to the first ten comments within 60 minutes. Reddit weights reply velocity heavily.

---

## Step 4 — Mon-Thu 8:00 PM ET (so earliest 5/4 8 PM) — r/roguelites

URL: https://reddit.com/r/roguelites/submit

**Title:**
```
The Oregon Trail — AI Edition: a permadeath narrative roguelike where Claude generates every event live (free, browser)
```

**Body:** same as r/WebGames, optionally substitute "narrative roguelike with permadeath" into the opening.

**Attach:** `04-tone.png` + newspaper grid.

---

## Step 5 — Wed-Thu 5/6 or 5/7 10:00 AM ET — r/ChatGPTGaming

URL: https://reddit.com/r/ChatGPTGaming/submit

This is the one channel where AI vocabulary is an asset. Lean into the tech.

**Title:**
```
Oregon Trail remake where Claude Haiku narrates every event live. Three tone tiers, permadeath, free browser.
```

**Body:**
```
Three-week build. Every narrative event in every run is generated at runtime by Claude Haiku from party state, terrain, segment of map, and recent journal entries. ~1500-token prompts. Three tone tiers with different system prompts:

- Low: textbook-dry, educational
- Medium: historically authentic, morally complicated
- High: psychological horror, period voice, McCarthy register

Real events from this week:
- "The trail strips courtesy like bark from a dead tree."
- "The wind moves through the grass and does not stop."

Tech: Cloudflare Worker runs the simulation and handles the model calls. HMAC-signed state. 175 unit tests. No database.

https://trail.osi-cyber.com

Happy to talk prompt calibration or the tone-tier system in comments.
```

**Attach:** `07-event-full.png` (audience appreciates the prose-gen sample directly, not the tone screen).

---

## Hard rules across all channels

- DO NOT name "Donner Party" or "cannibalism" in any title or body. The discoverability is the mechanic.
- DO NOT cross-post the HN link in Reddit titles within 24 hours (algorithmic cross-domain promo triggers shadowbans).
- DO NOT post horror-tier prose to Twitter without the tone-screen context image. Algorithm doesn't forgive.
- DO NOT use "I spent three weeks" or "I'd love feedback" — classic self-promo smells.
- DO use lowercase casual register. NO em-dashes. NO hype phrases.
- DO be in every thread for the first hour. First-hour engagement controls the algorithm.

---

## Kill switches

If HN is hostile in first 30 minutes (multiple "AI slop" replies, downvoted to <0):
- Pull Twitter from the queue. Post it tomorrow with an angle adjustment.
- Don't feed Reddit a hostile HN link.

If a journalist DMs asking for a deeper look:
- Send them the two reserve shots from `/tmp/ot-shots/`: `10-bitter-cw.png` (CW modal) + `11-bitter-body.png` (Long Night prose). Never post these publicly.

If HMH sends a takedown notice:
- Rename the website to "AI Trail: 1848" or similar. Push the rename, keep the game online. The store SKU rebrand to "Frontier 1848" is already planned per APP_STORE_PLAN.md.

---

## What I cannot do for you

I cannot post to your accounts. You have to be the one to:
1. Hit submit on HN at 9 AM ET.
2. Tweet the thread at 11:30 AM ET.
3. Submit to each subreddit at the listed times.
4. Reply to comments in real time.

I CAN: re-edit any copy in this file on request. Watch for changes between now and your post window.
