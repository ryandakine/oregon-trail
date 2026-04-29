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
# package id: com.osicyber.oregontrail (final, do not change post-launch)
# host: trail.osi-cyber.com
# launcher name: Oregon Trail AI
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
    "package_name": "com.osicyber.oregontrail",
    "sha256_cert_fingerprints": ["<from bubblewrap>"]
  }
}]
```
Worker route or Pages static — confirm Cloudflare doesn't strip `.well-known`. Test with:
`curl https://trail.osi-cyber.com/.well-known/assetlinks.json`

**Failure mode:** Without this, the TWA shows a Chrome URL bar at the top → instant reject from Play reviewers as "browser shortcut."

### 2.4 Store listing (Play Console)
- **Title:** "Oregon Trail AI Edition" — 30 char limit, fits.
- **Short description (80 char):** "Cross 2000 miles. Three tones. Every event written live by AI."
- **Full description (4000 char):** Reuse Reddit/HN body from `LAUNCH_MARKETING.md` § 2c, expand to include feature bullets, attribution, content rating notes.
- **Category:** Games → Adventure (NOT Educational — horror tier disqualifies).
- **Content rating questionnaire:** Will land at **Teen** minimum. Horror tier mentions starvation/death; do NOT lie on the questionnaire ("infrequent/mild references to violence" is honest, "intense graphic violence" is not). Cannibalism reference is text-only and gated → "infrequent mild."
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
npx cap init "Oregon Trail AI" com.osicyber.oregontrail --web-dir=public
npx cap add ios
npx cap sync
npx cap open ios  # opens Xcode
```
Xcode → Product → Archive → Distribute → App Store Connect.

### 3.3 Capacitor config
`capacitor.config.json`:
```json
{
  "appId": "com.osicyber.oregontrail",
  "appName": "Oregon Trail AI",
  "webDir": "public",
  "server": {
    "url": "https://trail.osi-cyber.com",
    "cleartext": false
  },
  "ios": {
    "contentInset": "always",
    "limitsNavigationsToAppBoundDomains": true
  }
}
```
**Note:** `server.url` mode means the app loads the live site. Pro: instant updates without re-submission. Con: Apple sometimes flags "thin wrapper" rejections under Guideline 4.2. **Mitigation:** ship `public/` as the bundled web assets (no server.url), use background sync to fetch updates. Slower iteration but bulletproof against rejection.
**Recommend:** bundle `public/` (no `server.url`), API still hits the live worker. Best of both.

### 3.4 App Review landmines
- **Guideline 4.2 (minimum functionality):** "Web wrapper" rejections happen when the app is purely a frame around a website. Mitigation: bundle assets locally so the app feels native; add iOS-specific touches (haptics on choices, native share sheet via `@capacitor/share`).
- **Guideline 1.1 (objectionable content):** Horror tier mention of cannibalism could trigger review. Solutions: (a) gate horror tier behind in-app content unlock so default install is "Dark Frontier" tier, (b) clearly disclose in App Review notes ("optional content tier with explicit content warning, opt-in only, mirrors academic Donner Party historical record"). Better to over-disclose.
- **Guideline 5.2.5 (third-party content):** "Oregon Trail" trademark, see § 5.
- **In-App Purchase (IAP):** Game is free, no purchases. Skip the IAP module. Do NOT add a "donate" link to a payment processor inside the app — Apple requires IAP for any digital good.

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

## 6. Timeline

Assuming D-U-N-S resolves this week and we have/get Mac access:

| Day | Track |
|---|---|
| **Day 1** | Privacy policy, phone screenshots, feature graphic, Lighthouse pass, decide name |
| **Day 2** | Bubblewrap init, Digital Asset Links, Play Console listing draft, upload first AAB to closed testing |
| **Day 3** | Capacitor init, Xcode build, App Store Connect listing draft, submit for review |
| **Day 4–17** | Play 14-day closed testing window runs in background |
| **Day 5–9** | Apple review (typical 24–72hr now, can be longer for first submission) |
| **Day 18** | Play Open Testing → Production |
| **Day 9–10** | Apple Production live (if no rejection) |

**Bottleneck:** Play's mandatory 14-day closed test from first submission. Start that clock ASAP.

**Risk paths:**
- No Mac → App Store path slips to whenever a Mac is sourced.
- D-U-N-S delayed → Play account creation slips. Apple individual account is unblocked.
- Apple rejection → +5–10 days.
- Trademark takedown → +5 days, no account strike if responsive.

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
