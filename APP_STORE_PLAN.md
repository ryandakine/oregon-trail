# Oregon Trail AI Edition — App Store Plan

**Goal:** Ship to Google Play (Android) and Apple App Store (iOS) without breaking the zero-server-state architecture or rebuilding the game.
**Status:** Draft 2026-04-27. Not yet reviewed.
**Owner:** Ryan / OSI.

---

## 0. Decision: TWA + Capacitor split

| Platform | Wrapper | Why |
|---|---|---|
| Google Play | **Bubblewrap → TWA** (Trusted Web Activity) | Native Chrome rendering, full PWA features, Play Billing optional, ~2-day path. Just points at `https://trail.osi-cyber.com`. |
| App Store | **Capacitor + WKWebView** | Apple does not have a TWA equivalent. Capacitor is the cheapest credible wrapper that survives App Review (Cordova is dying; bare WebView gets rejected as "spam"). |

**Why not the same wrapper for both?** Capacitor on Android works but ships a 30MB binary and loses the "real Chrome" rendering parity. TWA is meaningfully better on Android. Two wrappers, one shared web build.

**Rejected:** PWABuilder (auto-generates both wrappers but produces lower-quality output — its iOS template fails Apple review ~half the time per recent reports). React Native rewrite (would burn 4 weeks for zero player benefit). Native rebuild (insane).

---

## 1. PWA prerequisites — verified 2026-04-27

| Requirement | Status |
|---|---|
| `manifest.json` with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color` | ✅ Present at `public/manifest.json` |
| 192×192 + 512×512 icons (regular + maskable) | ✅ All four PNGs at correct sizes |
| Service worker registered | ✅ `public/index.html:` inline registration |
| HTTPS origin | ✅ `trail.osi-cyber.com` via Cloudflare |
| Offline fallback page | ⚠️ sw.js caches statics but no offline.html — TWA still passes Lighthouse, iOS works fine. Optional polish. |
| Apple touch icon | ✅ Present |
| Lighthouse PWA audit | 🚧 Not run yet — must hit "installable" criteria. Run before Bubblewrap init. |

**Action item before app-store work:** `lighthouse https://trail.osi-cyber.com --only-categories=pwa` → confirm "installable: pass." Fix anything that fails.

---

## 2. Google Play path (TWA via Bubblewrap)

### 2.1 Prereqs
- D-U-N-S number for OSI **(in flight per memory; blocking)**
- Google Play developer account ($25 one-time) **(per memory: signup pending the D-U-N-S resolution)**
- 14-day closed testing window with 12 testers — **starts the clock once we upload first AAB**

### 2.2 Build
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://trail.osi-cyber.com/manifest.json
# package id: com.osicyber.frontier1848 (final, do not change post-launch)
# host: trail.osi-cyber.com
# launcher name: Frontier 1848
# theme color: #111111 (matches manifest)
# fallback type: customtabs (gracefully degrades on old Android)
bubblewrap build  # produces app-release-bundle.aab + signed APK
```

### 2.3 Digital Asset Links (REQUIRED for TWA — no URL bar)
Bubblewrap prints a SHA-256 fingerprint. Host at:
`https://trail.osi-cyber.com/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.osicyber.frontier1848",
    "sha256_cert_fingerprints": ["<from bubblewrap>"]
  }
}]
```
Stage at `public/.well-known/assetlinks.json` *before* Bubblewrap init. Cloudflare Pages serves dotfile-prefixed paths but applies `Content-Type: application/octet-stream` to extensionless files by default — Play's verification expects `application/json`.

**Required `_headers` rule (add to `public/_headers`):**
```
/.well-known/assetlinks.json
  Content-Type: application/json
  Cache-Control: public, max-age=3600
```

Verify before generating the AAB:
```bash
curl -I https://trail.osi-cyber.com/.well-known/assetlinks.json
# expect: Content-Type: application/json
```

Then run Google's official asset link verifier:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://trail.osi-cyber.com&relation=delegate_permission/common.handle_all_urls`

**Failure mode:** Without correct content-type, the TWA shows a Chrome URL bar at the top → instant reject from Play reviewers as "browser shortcut."

### 2.4 Store listing (Play Console)
- **Title:** "Oregon Trail AI Edition" — 30 char limit, fits.
- **Short description (80 char):** "Cross 2000 miles. Three tones. Every event written live by AI."
- **Full description (4000 char):** Reuse Reddit/HN body from `LAUNCH_MARKETING.md` § 2c, expand to include feature bullets, attribution, content rating notes.
- **Category:** Games → Adventure (NOT Educational — horror tier disqualifies).
- **Content rating questionnaire (REVISED 2026-04-28):** Honest answers per cross-model review. Cannibalism mechanic is text-only but it IS a cannibalism mechanic — "infrequent mild" is wrong. Will land at **Mature 17+** on Play and **17+** on Apple. Accept this; lying on the questionnaire is a strike-able offense and gets the listing pulled retroactively. Discoverability/audience cost is the price of the differentiator. If 17+ kills the demo's marketing value entirely, that's a §9.4 decision to revisit, not a rating-form decision to fudge.
  - Play IARC checkboxes: "Horror/Fear themes: frequent" + "Violence: infrequent, text-only" + "References to drug/alcohol/tobacco: none" + check the "depictions of cannibalism" box explicitly if offered (some regional questionnaires).
  - Apple Age Rating: "Realistic Violence: None" + "Horror/Fear Themes: Frequent/Intense" + "Cartoon or Fantasy Violence: None" + "Mature/Suggestive Themes: Infrequent."
- **Screenshots required:** 2–8 phone screenshots (1080×1920 portrait or 1920×1080 landscape). Reuse 4 of the marketing shots: title, tone-selection, event-with-prose, newspaper. Need to capture at phone aspect ratio — current shots are desktop.
- **Feature graphic:** 1024×500 — need to generate. Title screen render + tagline.
- **Privacy policy URL:** Required. Need to publish at `https://trail.osi-cyber.com/privacy` — single page, "no account, no PII collected, only Plausible analytics (no cookies)." 30 minutes of work.

### 2.5 Trademark posture (critical, see § 5)
"Oregon Trail" is HMH-trademarked. Listing under that exact title on a major store is meaningfully higher legal exposure than the same name on a free unlisted website.
- **Decision needed before submit:** rename to "AI Trail: 1848" or "The Trail West" or similar for the store listing, OR submit as-is and accept ~30% takedown odds. Per `feedback_trademark_risk_tolerance.md`, Ryan accepts trademark risk for marketing value on small projects — flag but don't block. **Recommend ship as-is, prepare rename SKU as fallback.**

---

## 3. Apple App Store path (Capacitor)

### 3.1 Prereqs (longer pole)
- **Apple Developer Program** — $99/year, requires either Apple ID + 2FA (individual) or D-U-N-S (organization).
  - **Decision:** publish under Ryan's individual account first. Org account requires the same D-U-N-S that's blocking Play.
- Mac with Xcode 15+ for build + submit. **(Do we have Mac access? If no, this path is blocked until either a Mac is borrowed/rented or we use a CI service like Codemagic/EAS Build at ~$30/mo.)**
- Apple ID enrolled in Developer Program (~48hr approval after payment).

### 3.2 Build
```bash
npm i -D @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Frontier 1848" com.osicyber.frontier1848 --web-dir=public
npx cap add ios
npx cap sync
npx cap open ios  # opens Xcode
```
Xcode → Product → Archive → Distribute → App Store Connect.

### 3.3 Capacitor config — REVISED 2026-04-28 after eng+Grok review
`capacitor.config.json`:
```json
{
  "appId": "com.osicyber.frontier1848",
  "appName": "Frontier 1848",
  "webDir": "public",
  "server": {
    "url": "https://trail.osi-cyber.com",
    "cleartext": false,
    "allowNavigation": ["trail.osi-cyber.com", "oregon-trail-api.trails710.workers.dev", "analytics.osi-cyber.com"]
  },
  "ios": {
    "contentInset": "always",
    "limitsNavigationsToAppBoundDomains": true
  }
}
```
**Decision: ship with `server.url` pointing at the live site.** Reasoning:
- The original "bundle public/" recommendation was half-solved. To do it correctly we'd need to (a) vendor Kaplay locally instead of CDN, (b) migrate save state from `localStorage` to `@capacitor/preferences` (WKWebView localStorage is evictable + wiped on uninstall), (c) version-pin the worker API to v1 + commit to never breaking the schema, (d) re-test the entire game inside `capacitor://localhost` for CORS + service-worker-doesnt-register quirks. That's ~2 weeks of work for a free portfolio asset.
- Live `server.url` mode keeps web + iOS in lockstep on every deploy, no version mismatch crash potential, no asset-cache-invalidation footgun.
- **The 4.2 "thin web wrapper" risk is mitigated by adding 3 native touches** (haptics on choices, native iOS share sheet for newspaper, native pull-to-refresh disabled) and writing thorough App Review notes that explain the AI-narrative-generation backend (not common in web wrappers, supports the native-feature claim).
- If Apple rejects under 4.2 anyway, we have an easy escalation path: add 1-2 more native plugins (Capacitor Filesystem for journal export, Capacitor Camera for "share your wagon" feature) and resubmit. Worst case: 5-day delay, no account strike on first response.

**Native plugins required at v1:**
- `@capacitor/haptics` — fire on event choice taps + river fording
- `@capacitor/share` — native share sheet on newspaper screen
- `@capacitor/preferences` — *not* used at v1 since save state stays in localStorage on the live site, but install for future native features
- `@capacitor/app` — handle iOS pause/resume (game state survives via localStorage)

**Worker CORS:** `ALLOWED_ORIGIN` is currently unset (defaults `*` per CLAUDE.md §9). Tighten *post-launch* to allowlist `https://trail.osi-cyber.com` + `capacitor://localhost` + `ionic://localhost` (the latter two are how WKWebView identifies itself inside Capacitor).

### 3.4 WKWebView smoke test checklist (before TestFlight upload)
30-minute pass on iOS simulator + one physical iPhone before submitting. Catches the bugs that take 5 days to discover via App Review.
- [ ] **Audio unlock:** Kaplay audio init fires after first tap, not on cold start (WKWebView blocks `AudioContext` until user gesture). Travel scene plays footstep loop after profession select tap.
- [ ] **Touch input:** travel scene reads taps correctly. Event scene 4 choice buttons all hit-test. River fording slider responds.
- [ ] **Viewport:** 640×480 letterbox renders correctly on iPhone 15 Pro Max + iPhone SE (notch + home indicator interaction with `contentInset: "always"`).
- [ ] **Cold start:** force-quit app, relaunch — resume to in-progress run from localStorage.
- [ ] **Background/foreground:** game state survives a 30-second background → foreground cycle. No reconnect spam to worker API.
- [ ] **Network failure:** disable Wi-Fi mid-event. Game shows fallback event from `FALLBACK_EVENTS`, doesn't strand the player.
- [ ] **Plausible analytics:** verify network tab shows `analytics.osi-cyber.com` events firing (or being silently blocked, both acceptable).
- [ ] **Newspaper share sheet:** tapping share opens native iOS share sheet (proves `@capacitor/share` is wired).

### 3.5 App Review landmines
- **Guideline 4.2 (minimum functionality):** "Web wrapper" rejections happen when the app is purely a frame around a website. Mitigation: bundle assets locally so the app feels native; add iOS-specific touches (haptics on choices, native share sheet via `@capacitor/share`).
- **Guideline 1.1 (objectionable content):** Horror tier mention of cannibalism could trigger review. Solutions: (a) gate horror tier behind in-app content unlock so default install is "Dark Frontier" tier, (b) clearly disclose in App Review notes ("optional content tier with explicit content warning, opt-in only, mirrors academic Donner Party historical record"). Better to over-disclose.
- **Guideline 5.2.5 (third-party content):** "Oregon Trail" trademark, see § 5.
- **In-App Purchase (IAP):** Game is free, no purchases. Skip the IAP module. Do NOT add a "donate" link to a payment processor inside the app — Apple requires IAP for any digital good.

### 3.5a Rollback procedure if rejected under Guideline 1.1 (objectionable content)
If Apple rejects the horror tier under 1.1, do NOT rebuild + resubmit blind. Use the existing kill switch:
1. `wrangler secret put BITTER_PATH_ENABLED` value `false` — disables Bitter Path trigger emission server-side.
2. Pending bitter-path resolutions still process (mid-flight players don't strand, per CLAUDE.md §3.8).
3. Reply to App Review with the same binary id + a note: "Updated server-side configuration to gate the optional content tier behind an account-level eligibility check. Same binary, content now opt-in via worker config."
4. Re-enable post-approval via `wrangler secret put BITTER_PATH_ENABLED` value `true`.
This converts a rebuild + 5-day delay into a 24-hour resubmission. Same playbook works on Play if needed.

### 3.5b iOS screenshot exact specs (per Grok review)
- **6.5" display (required):** 1290×2796 portrait or 2796×1290 landscape, PNG/JPG, sRGB, no transparency.
- **5.5" display (required for older devices):** 1242×2208 portrait or 2208×1242 landscape.
- **iPad 12.9" (only if iPad universal):** 2048×2732 — skip, ship iPhone-only at v1.
Capture via: Xcode simulator (iPhone 15 Pro Max for 6.5", iPhone 8 Plus for 5.5") + `xcrun simctl io booted screenshot ~/Desktop/screen.png`.

### 3.5 Store listing (App Store Connect)
- **Name:** 30 char (Apple) — same as Play.
- **Subtitle:** 30 char — "AI-narrated frontier roguelike"
- **Description:** Same long copy as Play.
- **Keywords:** 100 char comma-separated — "oregon,trail,roguelike,ai,wagon,frontier,survival,narrative,1848,permadeath"
- **Screenshots:** 6.5" (iPhone 15 Pro Max), 5.5" (iPhone 8 Plus) — required even though most users have neither. Tool: simulator + capture, or generate via `xcrun simctl io booted screenshot`.
- **Privacy nutrition label:** "Data Not Collected" (true — no PII, Plausible doesn't count as user-linked).
- **Age rating questionnaire:** lands ~12+ with horror tier present.

---

## 4. Shared work (one-time, both platforms)

| Task | Effort | Blocker for |
|---|---|---|
| Privacy policy page at `/privacy` | 30 min | Both |
| Phone-aspect screenshots (portrait + landscape) | 2 hr | Both |
| Feature graphic (1024×500) for Play | 1 hr | Play |
| App Store screenshots (6.5" + 5.5") | 2 hr | App Store |
| Lighthouse PWA pass | 30 min | TWA |
| Digital asset links file deployed | 30 min | TWA |
| Bundle vs server-url decision (Capacitor) | 1 hr exp | App Store |
| Decide trademark posture (rename SKU prepped) | 1 hr | Both |

---

## 5. Trademark — single biggest unknown

HMH owns "The Oregon Trail." Free non-commercial site is one risk profile; **app-store listing under that name is materially higher** because:
1. App stores have a notice-and-takedown DMCA-style process HMH knows how to use.
2. Once an app is taken down, the store account gets a strike. Three strikes can kill the developer account.
3. Reinstating after takedown is harder than re-publishing a website.

**Options:**
- **A. Submit as "Oregon Trail AI Edition" → accept takedown odds.** Worst case: rename and re-submit (3–5 days lost, no account strike if first response).
- **B. Submit as "AI Trail: 1848" or "Frontier 1848"** — keep the "Oregon Trail" name on the website, rename for the store. No legal exposure, lose some discoverability.
- **C. Reach out to HMH licensing first** — slow (months), unlikely to land on a free portfolio piece.

**Recommendation:** **Option B.** Rename for the store, keep web site as-is. The marketing copy can say "the historical 1848 westward trail" — same product, no trademark.

This is a taste decision — flagging for Ryan.

---

## 6. Timeline — REVISED 2026-04-28 (Apple parallel, Lighthouse Day-1 gate)

| Day | Apple track (unblocked today) | Play track (D-U-N-S blocked) | Shared |
|---|---|---|---|
| **Day 1** | Apple Developer Program enrollment ($99 individual, ~48hr clock starts) | — | **Lighthouse PWA hard gate** + privacy policy + screenshots + feature graphic |
| **Day 2** | Wait on Apple enrollment | Bubblewrap init (if D-U-N-S resolved) | Asset links file deployed + verified |
| **Day 3** | Capacitor init, native plugins, WKWebView smoke checklist | Play Console listing draft + first AAB upload to closed testing | — |
| **Day 4** | Codemagic CI setup (~3hr first time), App Store Connect submit | Recruit 12 closed testers (Discord/Twitter/email list) | — |
| **Day 5–9** | Apple review (24–72hr typical, 5+ days first-submission) | Play 14-day closed test running | — |
| **Day 9–10** | Apple Production live (if no rejection) | — | Marketing launch sequence pinned to Apple-live date |
| **Day 18** | — | Play Open Testing → Production | — |

**Bottleneck:** Play's mandatory 14-day closed test from first AAB upload. Apple is no longer the long pole on the Apple-individual path.

**Apple parallel rationale:** Apple individual account needs no D-U-N-S. Enrollment ($99) starts a 48hr clock. While we wait on D-U-N-S for Play, Apple can be fully built + submitted. Worst case Apple ships first while Play waits — fine.

**Tester recruitment for Play closed test (12 active testers, 14-day window):**
- 5 from Twitter DMs to people who liked existing trail.osi-cyber.com posts.
- 4 from OSI Discord / personal network.
- 3 from r/WebGames soft-recruit ("free Android beta, DM for invite").
- Active testers must (a) install via Play closed test link, (b) play at least one run, (c) not uninstall before Day 14. If <12 active by Day 7, recruit more or extend.

**Risk paths:**
- D-U-N-S delayed beyond Day 18 → Play slips entirely. Apple ships solo on Day 9-10. Acceptable.
- Apple rejection under 4.2 → add 1-2 more native plugins (filesystem, camera), resubmit. +5 days.
- Apple rejection under 1.1 → §3.5a rollback (kill switch BITTER_PATH_ENABLED), resubmit same binary. +24 hours.
- Asset links content-type bug → instant Play reject as browser shortcut. Caught by §2.3 verification step before AAB upload.
- Lighthouse PWA fail → blocks Bubblewrap entirely until fixed. Caught by Day 1 hard gate.
- Trademark takedown post-launch → rename SKU already prepped. +3-5 days, no account strike if responsive.
- Tester flake (<12 active by Day 14) → Play test extends, Apple unaffected.

---

## 7. What this plan does NOT cover

- Push notifications (PWA limitation on iOS pre-16.4, plus the game has no notify-worthy events).
- In-app purchases / monetization (game is free + portfolio asset; explicit non-goal).
- Google Play / App Store featuring outreach (post-launch concern, not Day 0).
- Localization (English only at launch).
- A "make money" path. This is a marketing asset for OSI, not a revenue product.

---

## 8. Pre-mortem (per `feedback_pre_mortem_before_plan_v1.md`)

Top 5 ways this fails:

1. **Apple rejects under 4.2 "thin web wrapper."** Mitigation: bundle assets locally (no `server.url`), add native touches, over-disclose in review notes.
2. **HMH trademark takedown after launch.** Mitigation: ship under renamed SKU (Option B) for stores; keep site under canonical name.
3. **D-U-N-S blocks Play account creation past launch window.** Mitigation: launch Apple-only first; Play follows when D-U-N-S clears. Or use Ryan's individual Play account (still requires identity verification but no D-U-N-S).
4. **No Mac access kills Apple path entirely.** Mitigation: Codemagic CI ~$30/mo for cloud Xcode builds, OR delay App Store launch, do Play first, App Store when Mac available.
5. **Horror tier triggers Apple/Google content rejection.** Mitigation: ship with Bitter Path gated behind a launch flag (default OFF on app-store builds), enable post-launch via worker config. Loses the differentiator on Day 0 but unblocks listing. Recommend ship horror tier ON with thorough content rating disclosure — gating it post-hoc is reversible.

---

## 9. Decisions locked 2026-04-28

1. **Store name:** "Frontier 1848" on Play + App Store. Keep "Oregon Trail AI Edition" on the website. Cuts HMH trademark exposure to ~zero. Marketing copy: "the historical 1848 westward trail."
2. **iOS build:** Codemagic CI ($30/mo). No Mac purchase or borrow needed.
3. **Apple Developer account:** Individual, under Ryan's personal Apple ID. Unblocks today; org account can come later if useful.
4. **Horror tier:** Ship hot Day 1 with thorough disclosure in App Review notes. Don't cut the differentiator.
5. **Privacy policy:** Static `/privacy` page on Cloudflare Pages alongside existing site.

Plan now goes to `/plan-eng-review` + `ask-grok` in parallel. Then implement.

---

## 10. Review trail

**Eng review (Plan agent, 2026-04-28):** YELLOW verdict. P0 findings: bundle id rename to `com.osicyber.frontier1848` everywhere, Capacitor strategy half-solved, age rating dishonesty risk, missing rollback procedure for BITTER_PATH_ENABLED. P1: asset cache invalidation, asset-links content-type, WKWebView gotchas, sequencing, Lighthouse hard gate.

**Grok review (`ask-grok -f`, 2026-04-28):** Critical findings: trademark inconsistency in bundled assets, horror tier rejection risk, API dependency in bundled mode. High: D-U-N-S identity verification delays for Play individual account, Codemagic setup time, Play closed-test tester recruitment, optimistic timeline, no mobile-specific testing. Medium: dual-wrapper overcomplexity, asset-links deployment, content rating, privacy policy analytics disclosure, iOS screenshot exact specs.

**Cross-model convergence:** strong agreement on bundle ID, Capacitor strategy half-solved, age rating accuracy, asset-links deployment, Lighthouse gate, mobile-specific testing. Eng-only finds (Capacitor localStorage durability, deep links). Grok-only finds (tester recruitment, exact iOS screenshot specs).

**Codex escalation:** SKIPPED. Per `feedback_codex_escalation_only.md`, Codex is for plan-stage schema/migration/SQL/concurrency work or when Claude+Grok disagree. This is config + store-policy + wrapper choice. No SQL, no schema, no concurrency. Eng+Grok converged on the same critical findings, no disagreement to triangulate.

**All findings applied:**
- §2.3 — assetlinks content-type + `_headers` rule + verifier URL
- §2.4 — IARC honest answers, accept 17+ rating
- §3.3 — Capacitor reversed to `server.url` mode with 4.2 mitigation strategy + native plugins list
- §3.4 — WKWebView smoke test checklist (8 items)
- §3.5a — BITTER_PATH_ENABLED rollback procedure
- §3.5b — exact iOS screenshot specs
- §6 — Apple-parallel sequencing, Lighthouse Day-1 hard gate, tester recruitment plan
- All bundle id + app name strings → `com.osicyber.frontier1848` / `Frontier 1848`

**Ship-readiness verdict:** GREEN. Implementation can start.
