# Kaplay Fixes v2 — 11 Bugs (from Eng + Codex reviews)

Branch: `kaplay-rebuild`

---

## Fix 1: index.html — add ID to overlay-content div
**Line ~110:** `<div class="overlay-content">` → `<div class="overlay-content" id="overlay-content">`

## Fix 2: index.html — add .active CSS rule for #html-overlay
Add to inline CSS:
```css
#html-overlay.active {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## Fix 3: tone.js — fix enum mapping (CRITICAL, game-breaking)
**Lines ~43/50/58:** Sends "safe"/"dark"/"horror" but server expects "low"/"medium"/"high"
Change data-tone values:
- `data-tone="safe"` → `data-tone="low"`
- `data-tone="dark"` → `data-tone="medium"`
- `data-tone="horror"` → `data-tone="high"`

## Fix 4: store.js — read budget from server state
**Line ~16:** `const budget = STARTING_MONEY[engine.profession]`
→ `const budget = engine.supplies?.money ?? STARTING_MONEY[engine.profession] ?? 80000`
Also update calcTotal affordability checks to use engine.supplies.money.

## Fix 5: event.js — standardize on classList, not style.display
**Line ~40:** `overlay.style.display = "flex"` → `overlay.classList.add("active")`
**Line ~136:** `overlay.style.display = "none"` → `overlay.classList.remove("active")`
Remove the double-cleanup from main.js (just classList.remove is sufficient now).

## Fix 6: index.html — add newspaper + tombstone overlay CSS
index.html doesn't load style.css. Newspaper scene toggles `.hidden` class but no CSS for it.
Add to inline CSS:
```css
#newspaper-overlay { position: fixed; inset: 0; z-index: 200; display: none; background: rgba(0,0,0,0.9); overflow-y: auto; padding: 2rem; }
#newspaper-overlay.active { display: flex; align-items: center; justify-content: center; }
#tombstone-overlay { position: fixed; inset: 0; z-index: 200; display: none; background: rgba(0,0,0,0.9); overflow-y: auto; padding: 2rem; }
#tombstone-overlay.active { display: flex; align-items: center; justify-content: center; }
```
Also update newspaper.js to use `.active` class instead of `.hidden` toggle (or add `.hidden { display: none }` rule).

## Fix 7: names.js — cleanup keydown listener on scene leave
After `document.addEventListener('keydown', onGlobalKey)` (~line 97), add:
```javascript
k.onSceneLeave(() => document.removeEventListener('keydown', onGlobalKey));
```

## Fix 8: profession.js + tone.js — same keydown leak fix
**profession.js ~line 74:** Add `k.onSceneLeave(() => document.removeEventListener('keydown', onKey));`
**tone.js ~line 119:** Add `k.onSceneLeave(() => { document.removeEventListener('keydown', onKey); engine.off('stateChange', ...); });`
Also: tone.js line 122 adds engine stateChange listener that never unregisters — clean it up.

## Fix 9: tone.js — error recovery
After `engine.selectTone(tier)` call, listen for engine error:
```javascript
engine.on('error', function onError({ message }) {
  engine.off('error', onError);
  // Restore UI: show choices again, hide loading text
  loadingEl.textContent = `Error: ${message}. Press any key to retry.`;
  document.addEventListener('keydown', () => {
    // Re-render the tone scene
    k.go('tone', data);
  }, { once: true });
});
```

## Fix 10: travel.js — store refs to HUD elements, refresh in daysAdvanced
**Lines ~178-199:** Assign return values to variables:
```javascript
let progressFill = k.add([k.rect(fillWidth, 6), k.pos(...), k.color(...)]);
const healthDots = members.map(m => k.add([k.circle(4), k.pos(...), k.color(...)]));
```
In daysAdvanced handler (~line 306), destroy and recreate:
```javascript
progressFill.destroy();
progressFill = k.add([k.rect(newFillWidth, 6), ...]);
healthDots.forEach((dot, i) => {
  dot.destroy();
  // recreate with updated color
});
```
Also update dateText, milesText, foodText, oxenText .text properties (these already have refs).

## Fix 11: names.js — tap-to-focus for mobile
After setting overlay content, add:
```javascript
content.addEventListener('click', () => {
  const input = content.querySelector('input');
  if (input) input.focus();
});
```

---

## File Summary

| File | Fixes |
|------|-------|
| public/index.html | #1, #2, #6 |
| public/scenes/tone.js | #3, #8, #9 |
| public/scenes/store.js | #4 |
| public/scenes/event.js | #5 |
| public/scenes/names.js | #7, #11 |
| public/scenes/profession.js | #8 |
| public/scenes/travel.js | #10 |
| public/main.js | #5 (remove double cleanup) |

## Verification

1. `npx vitest run` — 119 backend tests still pass
2. Serve: `npx http-server public/ -p 8803`
3. Full flow: title → profession → names → tone (verify "low"/"medium"/"high" sent) → store (verify budget matches server state) → travel → event
4. Test tone API error: disconnect network during tone selection, verify error recovery
5. Navigate away from names mid-entry, verify no leaked keydown listeners
6. Check newspaper overlay shows/hides correctly
7. Verify travel HUD updates after each advance
