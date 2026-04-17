# Kaplay Fixes v3 — 15 Codex Findings

Branch: `kaplay-rebuild`. Split into 3 parallel agents by file ownership.

---

## CRITICAL FIXES

### C1: store.js — purchases format mismatch
**Bug:** Sends object `{food: 200, oxen: 6}`, worker expects `StoreItem[]` array `[{item:"food",quantity:20}]`
**Fix:** In store.js "Hit the Trail" handler, convert quantities to StoreItem array format:
```javascript
const purchases = [];
for (const [key, qty] of Object.entries(quantities)) {
  if (qty > 0) purchases.push({ item: key, quantity: qty });
}
engine.purchaseSupplies(purchases);
```

### C2: main.js — scene payload unwrapping
**Bug:** `k.go(scene, {from, to, data, engine})` wraps data. Only event.js unwraps `.data`.
**Fix:** Pass `data` directly: `k.go(sceneName, data || {})` — don't wrap in extra object.
Then update event.js to read `sceneData` directly instead of `sceneData.data`.

### C3: newspaper.js — .hidden vs .active + html2canvas missing
**Bug:** Scene toggles `.hidden` class but CSS uses `.active`. html2canvas never loaded.
**Fix:**
- Change newspaper.js to use `.active` class (classList.add/remove("active"))
- Add html2canvas script tag to index.html: `<script src="html2canvas.min.js"></script>`
- Also: escape dynamic headline/article text to prevent XSS from LLM output

### C4: title.js — hardcodes banker, skips profession
**Bug:** Enter/click calls `engine.selectProfession("banker")` directly, bypassing profession scene.
**Fix:** Change to `engine.transition("PROFESSION")`. The title screen should lead to profession selection, not skip it. Also: wire up challenge activation — if player picks challenge, call `engine.activateChallenge(challengeId)` before transitioning.

---

## HIGH FIXES

### H5: Rate limit too low for gameplay
**Bug:** 30 calls/min, but a run needs 100+ calls.
**Fix:** In worker/src/index.ts, raise to 120 calls/min per IP (2/sec is reasonable for a single player). Also add exemption for same-origin requests if possible.

### H6: Replay prevention (accept for single-player)
**Bug:** Old signed states can be resubmitted.
**Fix:** Accept for now. Single-player game, save-scumming is the expected behavior. Add server-side nonce/counter checking in V2 if competitive features added.

### H7: Pending triggers not blocking
**Bug:** Can /api/advance without resolving pending_event_hash.
**Fix:** In handleAdvance(), check `if (state.simulation.pending_event_hash !== null)` and reject with error "resolve_pending_event". This forces the client to call /api/choice before advancing.

### H8: River crossings skippable
**Bug:** If client advances past crossing mile marker, no blocking.
**Fix:** In simulation.ts advanceDays(), check for unresolved crossings in the CURRENT segment before allowing movement. If unresolved crossing exists at or before current miles, return trigger "river" again.

### H9: Landmarks infinitely replayable
**Bug:** `visited_landmarks` check allows unlimited rest/trade.
**Fix:** In handleLandmark(), add `rest_count` tracking. Add to SimulationState: `landmark_rest_used: string[]`. Limit rest to 3 times per landmark. Trade is fine to repeat (historically accurate — you could buy at forts).

### H10: Challenge enforcement gaps
**Bug:** Title never activates challenge. Fort trading bypasses store bans.
**Fix:**
- title.js: Fixed by C4 (proper flow to profession with challenge activation)
- handleLandmark trade: Check challenge constraints same as handleStore — reject banned items

### H11: River scene wrong field names
**Bug:** Reads `data.width`, `data.depth`, `data.difficulty` instead of `data.width_ft`, `data.ford_difficulty`, etc.
**Fix:** Update river.js field references to match RiverCrossing type from types.ts.

### H12: Landmark trade/talk buttons dead
**Bug:** Emit events nobody handles.
**Fix:** In landmark.js, instead of emitting events, directly show #html-overlay with trade/talk content. Use the same overlay pattern as store.js and names.js.

### H13: API error recovery
**Bug:** Store/event/river/hunting hide UI before API call, never restore on error.
**Fix:** In each scene, subscribe to `engine.on('error', ...)` and restore UI (show overlay/buttons again, hide loading text). Clean up on scene leave.

---

## MEDIUM FIXES

### M14: Saved-run resume loses trigger data
**Bug:** `_saveRun()` called before `currentEvent` assigned in advance().
**Fix:** In engine.js advance(), move `_saveRun()` to AFTER trigger assignment:
```javascript
case 'event':
  this.currentEvent = res.trigger_data;
  this._saveRun(); // moved here
  this.transition('EVENT', res.trigger_data);
```
Same for river and landmark.

### M15: Service worker caches wrong files
**Bug:** sw.js precaches game.js/ui.js/style.css (dead ASCII stack), not engine.js/main.js/scenes/*.
**Fix:** Update STATIC_ASSETS array in sw.js to list the Kaplay files.

---

## Agent Split

| Agent | Files | Fixes |
|-------|-------|-------|
| A: Frontend scenes | main.js, title.js, store.js, event.js, river.js, landmark.js, newspaper.js, scenes with error recovery | C1, C2, C3, C4, H11, H12, H13 |
| B: Backend | worker/src/index.ts, worker/src/simulation.ts, worker/src/types.ts | H5, H7, H8, H9, H10 |
| C: Engine + infra | engine.js, sw.js, index.html | M14, M15, C3 (html2canvas script tag) |

H6 (replay) = accepted, no code change.

---

## Verification

1. `npx vitest run` — 119+ tests pass
2. Full flow: title → profession → names → tone → store (verify purchases array format) → travel → event → choice → travel → landmark (rest limited) → river (correct field names) → continue to Oregon
3. Disconnect network mid-store → verify error recovery restores UI
4. Pending event: verify can't /api/advance without resolving
5. River: verify can't skip crossing
6. Challenge: verify store + trade enforce restrictions
7. Rate limit: verify 120/min allows full run
