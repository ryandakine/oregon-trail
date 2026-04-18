import { addTopHud, addBottomHud } from "../lib/hud.mjs";

// Hidden horror-tier scene (v3 primitive Kaplay). Fires when the server
// returns trigger === "bitter_path" — late-stage starvation + recent death,
// horror tone only, one-shot per run. Structure mirrors event.js but:
//   - Content-warning modal gates first entry, localStorage-ack thereafter
//   - No sanity-based agency-steal — this is a deliberate moment
//   - Skip button routes to /api/bitter_path_skip (refused enum)
//   - Post-choice 1.5s outcome beat before TRAVEL transition
//   - Crimson border accent, 0.75 backdrop (vs event.js 0.6), dead-member
//     subheading, screenshot-defense footer in CW modal
const CW_ACK_KEY = "ot_bitter_path_cw_acked";
const TYPE_SPEED_MS = 25;
const TYPE_MAX_WAIT_MS = 10000;
// Post-choice outcome hold is enforced by engine.resolveBitterPath's
// 1500ms setTimeout before transition('TRAVEL'). Scene only needs to render
// the OUTCOME_LINE on bitterPathResolved; engine keeps the scene mounted.
const OUTCOME_LINE = {
  dignified: "They rest, and continue.",
  hopeful: "They continue.",
  taken: "Something broke in them. They continue.",
  refused: "The party pressed on without deciding.",
};

export default function register(k, engine) {
  k.scene("bitter_path", (sceneData) => {
    const eventData = sceneData || engine.currentBitterPath;
    const meta = engine.currentBitterPathMeta || null;
    const overlay = document.getElementById("html-overlay");
    const content = overlay.querySelector(".overlay-content");
    const a11y = document.getElementById("a11y-status");
    const motionOk = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let typeTimer = null;
    let maxWaitTimer = null;
    // Tracks whether the CW modal is currently mounted. Prevents the
    // CW-modal keyboard handlers from firing click() on detached buttons
    // after the user has progressed into the scene body.
    let cwOpen = false;
    // CW keyboard handler refs — cancel explicitly when Continue transitions
    // from modal to scene body, not just on scene-leave.
    const cwKeyHandlers = [];
    // Scene-body keyboard handler refs (1/2/3) — cancelled on scene-leave.
    const choiceKeyHandlers = [];
    // Overlay click listener for typewriter skip — stored so cleanup() can
    // remove it even if the user clicked a choice before typewriter finished.
    let overlayClickHandler = null;

    // Dim canvas backdrop — 0.75 (vs event.js 0.6) so the scene reads heavier.
    // Avoid stacking past 0.85 — high-tier tone.mjs already applies vignette +
    // cool-shift + scanlines; more black crushes overlay readability.
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(0, 0, 0), k.opacity(0.75)]);

    // Decorative label — whisper, not shout. Lower than event.js "EVENT" label
    // so the HTML overlay body draws the eye first.
    k.add([
      k.text("THE LONG NIGHT", { size: 11 }),
      k.pos(320, 432),
      k.anchor("center"),
      k.color(200, 160, 100),
      k.opacity(0.25),
      k.z(49),
    ]);

    addTopHud(k, engine);
    addBottomHud(k, engine);

    if (!eventData) {
      engine.transition("TRAVEL");
      return;
    }

    // Defensive: if the run has already resolved, leave. Shouldn't happen
    // because the engine only sets currentBitterPath on a live trigger, but
    // covers the restored-from-localStorage edge case.
    const gs = engine.gameState || engine.signedState?.state;
    if (gs?.simulation?.bitter_path_taken && gs.simulation.bitter_path_taken !== "none") {
      engine.transition("TRAVEL");
      return;
    }

    const cwAcked = safeGetLocalStorage(CW_ACK_KEY) === "true";
    if (cwAcked) {
      renderScene();
    } else {
      renderContentWarning();
    }

    function renderContentWarning() {
      content.innerHTML = `
        <div class="bp-cw-modal" style="border: 1px solid #5a1a1a; padding: 20px; border-radius: 4px;">
          <h2 style="margin-top: 0;">Content Warning</h2>
          <p>This path depicts the Donner Party's 1846 choice to eat their dead. The writing is graphic. If that's not for you, skip.</p>
          <div id="bp-cw-buttons" style="display: flex; gap: 12px; margin-top: 20px; justify-content: flex-start;">
            <button id="bp-cw-skip" class="choice-btn" style="flex: 1;">Skip scene</button>
            <button id="bp-cw-continue" class="choice-btn" style="flex: 1;">Continue</button>
          </div>
          <p style="font-size: 11px; opacity: 0.6; margin-top: 16px; margin-bottom: 0;">An OSI production. Based on the Donner Party (1846).</p>
        </div>
      `;
      overlay.classList.add("active");

      const skipBtn = document.getElementById("bp-cw-skip");
      const contBtn = document.getElementById("bp-cw-continue");

      cwOpen = true;

      skipBtn?.addEventListener("click", () => {
        disableCwButtons();
        engine.skipBitterPath();
      });
      contBtn?.addEventListener("click", () => {
        safeSetLocalStorage(CW_ACK_KEY, "true");
        cwOpen = false;
        cancelCwKeyHandlers();
        renderScene();
      });

      // Keyboard: S skip, C/Enter continue. Gated on cwOpen so the handlers
      // can't fire click() on detached buttons after Continue transitions to
      // the scene body. Also explicitly cancelled on transition + scene-leave.
      cwKeyHandlers.push(k.onKeyPress("s", () => { if (cwOpen) skipBtn?.click(); }));
      cwKeyHandlers.push(k.onKeyPress("c", () => { if (cwOpen) contBtn?.click(); }));
      cwKeyHandlers.push(k.onKeyPress("enter", () => { if (cwOpen) contBtn?.click(); }));

      // Focus safer action first (Skip left, LTR scan)
      requestAnimationFrame(() => skipBtn?.focus?.());

      announce("Content warning. Press S to skip, C or Enter to continue.");
    }

    function cancelCwKeyHandlers() {
      for (const h of cwKeyHandlers) h?.cancel?.();
      cwKeyHandlers.length = 0;
    }

    function disableCwButtons() {
      document.getElementById("bp-cw-skip")?.setAttribute("disabled", "true");
      document.getElementById("bp-cw-continue")?.setAttribute("disabled", "true");
    }

    function renderScene() {
      const title = eventData.title || "The Long Night";
      const description = eventData.description || "";
      const choices = eventData.choices || [];
      const deadName = meta?.dead_member_name || null;
      // Coerce days_since_death to a finite integer before it reaches any
      // template literal. trigger_meta is persisted through localStorage and
      // can be tampered — an attacker-supplied string would otherwise
      // interpolate raw into innerHTML below.
      const rawDays = meta?.days_since_death;
      const daysAgo = typeof rawDays === "number" && Number.isFinite(rawDays)
        ? Math.max(0, Math.floor(rawDays))
        : null;

      let subheadingHtml = "";
      if (deadName) {
        const ago =
          daysAgo === null || daysAgo <= 1 ? "yesterday" :
          daysAgo === 2 ? "two nights past" :
          daysAgo === 3 ? "three nights past" :
          `${daysAgo} nights past`;
        subheadingHtml = `<p style="font-size: 13px; opacity: 0.7; margin-top: -8px;">Your party lost ${escapeHtml(deadName)} ${ago}.</p>`;
      }

      content.innerHTML = `
        <div class="bp-scene" style="border: 1px solid #5a1a1a; padding: 20px; border-radius: 4px;">
          <h2>${escapeHtml(title)}</h2>
          ${subheadingHtml}
          <p id="bp-typewriter" style="${motionOk ? "" : "opacity: 0; transition: opacity 400ms ease-in;"}"></p>
          <div id="bp-choices" style="margin-top: 20px;"></div>
        </div>
      `;
      overlay.classList.add("active");

      const typewriterEl = document.getElementById("bp-typewriter");
      announce("The Long Night. Choose one of three.");

      if (!motionOk) {
        // Reduced-motion: drop the typewriter, fade in full text.
        typewriterEl.textContent = description;
        requestAnimationFrame(() => { typewriterEl.style.opacity = "1"; });
        setTimeout(() => showChoices(choices), 400);
      } else {
        runTypewriter(typewriterEl, description, () => showChoices(choices));
      }
    }

    function runTypewriter(el, text, onDone) {
      let idx = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
        if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
        el.textContent = text;
        if (overlayClickHandler) {
          overlay.removeEventListener("click", overlayClickHandler);
          overlayClickHandler = null;
        }
        onDone();
      };
      const step = () => {
        if (done) return;
        if (idx < text.length) {
          el.textContent += text[idx++];
          typeTimer = setTimeout(step, TYPE_SPEED_MS);
        } else {
          finish();
        }
      };
      // Listener reference stored at module scope so cleanup() can remove it
      // if the user clicks a choice before the typewriter finishes (finish
      // would never run, leaking the listener onto the persistent overlay).
      overlayClickHandler = finish;
      overlay.addEventListener("click", overlayClickHandler);
      // Defensive cap: if description is long enough that 25ms/char runs past
      // 10s, auto-show the rest so the player isn't stuck on a slow reveal.
      maxWaitTimer = setTimeout(finish, TYPE_MAX_WAIT_MS);
      step();
    }

    function showChoices(choices) {
      const choicesEl = document.getElementById("bp-choices");
      if (!choicesEl || choicesEl.dataset.shown) return;
      choicesEl.dataset.shown = "1";

      const buttons = [];
      choices.forEach((choice, idx) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = `${idx + 1}. ${choice.label || choice.text || ""}`;
        btn.addEventListener("click", () => {
          disableChoices(buttons);
          engine.resolveBitterPath(idx);
        });
        choicesEl.appendChild(btn);
        buttons.push(btn);
      });

      requestAnimationFrame(() => buttons[0]?.focus?.());

      choiceKeyHandlers.push(k.onKeyPress("1", () => { if (choices.length >= 1) buttons[0]?.click(); }));
      choiceKeyHandlers.push(k.onKeyPress("2", () => { if (choices.length >= 2) buttons[1]?.click(); }));
      choiceKeyHandlers.push(k.onKeyPress("3", () => { if (choices.length >= 3) buttons[2]?.click(); }));
    }

    function disableChoices(buttons) {
      buttons.forEach((b) => b.setAttribute("disabled", "true"));
    }

    // Post-choice beat: one-liner shown for 1.5s after resolution. Engine
    // delays its transition('TRAVEL') by BEAT_HOLD_MS so the scene stays
    // mounted long enough to render this content. Without the engine delay,
    // scene-leave would wipe content.innerHTML within one frame.
    const onResolved = ({ outcome }) => {
      const line = OUTCOME_LINE[outcome] || "";
      if (line && content) {
        content.innerHTML = `
          <div class="bp-scene" style="border: 1px solid #5a1a1a; padding: 20px; border-radius: 4px;">
            <p style="text-align: center; font-size: 15px; margin: 0;">${escapeHtml(line)}</p>
          </div>
        `;
        announce(line);
      }
    };
    engine.on("bitterPathResolved", onResolved);

    const onError = ({ message }) => {
      // If the error arrives while the CW modal is still mounted (e.g. Skip
      // failed), re-enable its buttons and surface the error there. Otherwise
      // fall through to the scene-body branch.
      if (cwOpen) {
        const skipBtn = document.getElementById("bp-cw-skip");
        const contBtn = document.getElementById("bp-cw-continue");
        skipBtn?.removeAttribute("disabled");
        contBtn?.removeAttribute("disabled");
        const btnsEl = document.getElementById("bp-cw-buttons");
        if (btnsEl) {
          const existing = btnsEl.parentElement?.querySelector(".bp-cw-error");
          if (!existing) {
            const errP = document.createElement("p");
            errP.className = "bp-cw-error";
            errP.style.color = "#cc4444";
            errP.style.marginTop = "12px";
            errP.textContent = message === "already_resolved"
              ? "This moment has already passed."
              : message || "Something went wrong. Try again.";
            btnsEl.parentElement?.appendChild(errP);
          }
        }
        return;
      }
      const choicesEl = document.getElementById("bp-choices");
      if (choicesEl) {
        // Re-enable any disabled buttons
        choicesEl.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
        const errP = document.createElement("p");
        errP.style.color = "#cc4444";
        errP.style.marginTop = "12px";
        // already_resolved, wrong_trigger_kind, and event_hash_mismatch all
        // indicate server state that can't be recovered by retrying this
        // scene. The engine clears currentBitterPath on these; we route to
        // TRAVEL after a short read beat. Transient/network errors fall
        // through to the generic message and stay retryable.
        if (message === "already_resolved") {
          errP.textContent = "This moment has already passed.";
          setTimeout(() => engine.transition("TRAVEL"), 2000);
        } else if (message === "event_hash_mismatch" || message === "wrong_trigger_kind") {
          errP.textContent = "State out of sync. Returning to the trail.";
          setTimeout(() => engine.transition("TRAVEL"), 2000);
        } else {
          errP.textContent = message || "Something went wrong. Try again.";
        }
        choicesEl.appendChild(errP);
      }
    };
    engine.on("error", onError);

    function cleanup() {
      if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
      if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
      if (overlayClickHandler) {
        overlay.removeEventListener("click", overlayClickHandler);
        overlayClickHandler = null;
      }
      cancelCwKeyHandlers();
      for (const h of choiceKeyHandlers) h?.cancel?.();
      choiceKeyHandlers.length = 0;
      cwOpen = false;
      overlay.classList.remove("active");
      content.innerHTML = "";
    }

    k.onSceneLeave(() => {
      cleanup();
      engine.off("bitterPathResolved", onResolved);
      engine.off("error", onError);
    });

    function announce(msg) {
      if (a11y) a11y.textContent = msg;
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function safeGetLocalStorage(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function safeSetLocalStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
