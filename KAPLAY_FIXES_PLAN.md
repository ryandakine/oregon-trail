# Kaplay Fixes — 7 Codex Findings

All on `kaplay-rebuild` branch. No backend changes.

---

## Fix 1: CRITICAL — overlay-content has no ID

**File:** `public/index.html:110`
**Bug:** `<div class="overlay-content">` — scenes call `getElementById("overlay-content")` which returns null
**Fix:** Change to `<div class="overlay-content" id="overlay-content">`

## Fix 2: CRITICAL — #html-overlay.active has no display rule

**File:** `public/index.html` CSS block (~line 39)
**Bug:** `#html-overlay { display: none; }` exists but no `.active` rule to show it
**Fix:** Add:
```css
#html-overlay.active {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## Fix 3: HIGH — store.js budget ignores server state

**File:** `public/scenes/store.js:16`
**Bug:** `const budget = STARTING_MONEY[engine.profession]` — ignores challenge money multiplier and server-signed state
**Fix:** Read from signed state: `const budget = engine.supplies?.money ?? STARTING_MONEY[engine.profession] ?? 80000`
Also update calcTotal/canAfford to compare against `engine.supplies.money` not the static constant.

## Fix 4: HIGH — overlay visibility inconsistent

**Files:** `public/scenes/event.js:40`, `public/main.js:39`
**Bug:** event.js shows overlay with `style.display = "flex"`, main.js hides with `classList.remove("active")`. Two different mechanisms — bridge cleanup misses event.js's changes.
**Fix:** Standardize ALL scenes on classList only. In event.js, replace `overlay.style.display = "flex"` with `overlay.classList.add("active")`. In main.js bridge, add BOTH cleanup methods:
```javascript
overlay.classList.remove("active");
overlay.style.display = "";
```

## Fix 5: MEDIUM — names.js keydown listener leaks

**File:** `public/scenes/names.js:75`
**Bug:** `document.addEventListener("keydown", handler)` only removed on successful name submission, not on scene leave or error
**Fix:** Add `k.onSceneLeave(() => document.removeEventListener("keydown", handler))` immediately after adding the listener.

## Fix 6: MEDIUM — mobile autofocus unreliable

**File:** `public/scenes/names.js:51-66`
**Bug:** `autofocus` + scripted `focus()` doesn't reliably trigger mobile virtual keyboard
**Fix:** Add click handler on the overlay content div that focuses the input:
```javascript
content.addEventListener("click", () => {
  const input = content.querySelector("input");
  if (input) input.focus();
});
```

## Fix 7: LOW — travel HUD never refreshes

**File:** `public/scenes/travel.js:306` (daysAdvanced handler)
**Bug:** Progress bar width and party health dots are set once at scene creation. The daysAdvanced handler updates text labels but not these visual elements.
**Fix:** In the daysAdvanced handler, recalculate and update:
- Progress bar fill width: `progressFill.width = (miles / 1764) * barWidth`
- Party health dot colors: iterate members, update dot color based on health
- Food/oxen text labels

---

## Execution

All 7 fixes touch only `public/` files. No backend changes. Can be done in one pass since the files don't conflict:

| File | Fixes |
|------|-------|
| index.html | #1 (add id), #2 (add .active CSS) |
| scenes/event.js | #4 (classList instead of style.display) |
| scenes/store.js | #3 (read engine.supplies.money) |
| scenes/names.js | #5 (cleanup listener), #6 (tap-to-focus) |
| scenes/travel.js | #7 (refresh HUD in daysAdvanced) |
| main.js | #4 (double cleanup in bridge) |

## Verification

1. `npx vitest run` — 119 backend tests still pass
2. Serve locally: `npx http-server public/ -p 8803`
3. Click through: title → profession → names (type 5 names) → tone → store → travel
4. Verify overlay appears and disappears on every transition
5. Verify store budget matches server state
6. Play until an event fires — verify overlay shows, choices work
7. Test on mobile viewport — verify keyboard appears on name input tap
