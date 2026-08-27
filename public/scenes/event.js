import * as draw from "../lib/draw.mjs";
import { addTopHud, addBottomHud } from "../lib/hud.mjs";

const MOTION_OK = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const SKY_PHASES = {
  dawn:  { top: draw.PALETTE.skyDawn,  horizon: draw.PALETTE.skyPale },
  day:   { top: draw.PALETTE.sky,      horizon: draw.PALETTE.skyPale },
  dusk:  { top: draw.PALETTE.skyDusk,  horizon: draw.PALETTE.skyDawn },
  night: { top: draw.PALETTE.skyNight, horizon: draw.PALETTE.skyNightHorizon },
};

// Living dimmed backdrop behind the panel, instead of a flat black rect —
// sky + ground + a wagon silhouette, one slow-drifting cloud so the frame
// never reads frozen. Cheap on purpose (graphics-pop-research B5): no
// weather, no parallax layers.
function drawEventBackdrop(k, tone, dayPhase) {
  const sky = tone === "high"
    ? { top: draw.PALETTE.skyTwilight, horizon: draw.PALETTE.skyTwilightHorizon }
    : (SKY_PHASES[dayPhase] ?? SKY_PHASES.day);

  k.add([k.rect(640, 260), k.pos(0, 0),   k.color(...sky.top)]);
  k.add([k.rect(640, 60),  k.pos(0, 200), k.color(...sky.horizon), k.opacity(0.8)]);
  k.add([k.rect(640, 220), k.pos(0, 260), k.color(...draw.PALETTE.grassMid)]);
  k.add([k.rect(640, 6),   k.pos(0, 256), k.color(...draw.PALETTE.hillMid), k.opacity(0.5)]);

  const sc = draw.PALETTE.silhouetteNear;
  const wx = 320, wy = 340;
  k.add([k.rect(112, 34, { radius: 3 }), k.pos(wx - 56, wy - 8), k.color(...sc)]);
  k.add([draw.ellipseRect(k, 108, 46), k.pos(wx, wy - 34), k.color(...sc), k.anchor("center")]);
  k.add([k.circle(19), k.pos(wx - 38, wy + 22), k.color(...sc), k.anchor("center")]);
  k.add([k.circle(19), k.pos(wx + 38, wy + 22), k.color(...sc), k.anchor("center")]);

  if (MOTION_OK) {
    const baseX = 470;
    const cloud = draw.drawCloud(k, baseX, 68, 0.9, tone === "high" ? 0.35 : 0.55);
    cloud.onUpdate(() => { cloud.pos.x = baseX + Math.sin(k.time() * 0.06) * 36; });
  }

  k.add([k.rect(640, 480), k.pos(0, 0), k.color(0, 0, 0), k.opacity(0.4)]);
}

function getDayPhase(dateStr) {
  if (!dateStr) return "day";
  const d = new Date(dateStr + "T00:00:00");
  return ["dawn", "day", "day", "dusk"][d.getDate() % 4];
}

export default function register(k, engine) {
  k.scene("event", (sceneData) => {
    const eventData = sceneData || engine.currentEvent;
    const overlay = document.getElementById("html-overlay");
    const content = overlay.querySelector(".overlay-content");
    let autoTimer = null;
    let resolving = false;
    const choiceButtons = [];

    drawEventBackdrop(k, engine.tone ?? "medium", getDayPhase(engine.currentDate));

    // Decorative label — sits between HUD and HTML overlay; a whisper not a shout
    k.add([
      k.text("EVENT", { size: 12 }),
      k.pos(320, 420),
      k.anchor("center"),
      k.color(150, 130, 100),
      k.opacity(0.35),
      k.z(49),
    ]);

    addTopHud(k, engine);
    addBottomHud(k, engine);

    // ── Show HTML overlay ──
    if (!eventData) {
      // No event data, go back to travel
      engine.transition("TRAVEL");
      return;
    }

    const title = eventData.title || eventData.name || "Trail Event";
    const description = eventData.description || eventData.text || "";
    const choices = eventData.choices || [];

    // Build overlay content
    let html = `<h2>${escapeHtml(title)}</h2>`;
    html += `<p id="event-typewriter"></p>`;
    html += `<div id="event-choices" style="margin-top: 20px;"></div>`;
    content.innerHTML = html;
    overlay.classList.add("active", "tableau");

    // Typewriter effect. Reduced motion: full text immediately, matching
    // bitter_path.js's convention (character-by-character reveal is motion).
    const typewriterEl = document.getElementById("event-typewriter");
    let charIdx = 0;
    const typeSpeed = 25;

    function typeNext() {
      if (!MOTION_OK) {
        charIdx = description.length;
        typewriterEl.textContent = description;
        showChoices();
        return;
      }
      if (charIdx < description.length) {
        typewriterEl.textContent += description[charIdx];
        charIdx++;
        setTimeout(typeNext, typeSpeed);
      } else {
        showChoices();
      }
    }

    // Click to skip typewriter
    function skipTypewriter() {
      charIdx = description.length;
      typewriterEl.textContent = description;
      showChoices();
      overlay.removeEventListener("click", skipTypewriter);
    }
    overlay.addEventListener("click", skipTypewriter);

    typeNext();

    // Picking a choice no longer wipes the panel — it disables the buttons and
    // waits for the engine's choiceResolved, which repaints this same panel as
    // the result beat. The old cleanup()-then-transition path meant the outcome
    // was never visible anywhere.
    function choose(idx) {
      if (resolving) return;
      resolving = true;
      clearAutoTimer();
      setChoicesDisabled(true);
      engine.makeChoice(idx);
    }

    function setChoicesDisabled(disabled) {
      for (const b of choiceButtons) {
        if (disabled) b.setAttribute("disabled", "true");
        else b.removeAttribute("disabled");
      }
    }

    function clearAutoTimer() {
      if (!autoTimer) return;
      clearInterval(autoTimer);
      autoTimer = null;
    }

    function showChoices() {
      overlay.removeEventListener("click", skipTypewriter);
      const choicesEl = document.getElementById("event-choices");
      if (!choicesEl || choicesEl.dataset.shown) return;
      choicesEl.dataset.shown = "1";

      if (choices.length === 0) {
        // No choices — just a continue button
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = "Continue...";
        btn.addEventListener("click", () => choose(0));
        choicesEl.appendChild(btn);
        choiceButtons.push(btn);
        return;
      }

      choices.forEach((choice, idx) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = `${idx + 1}. ${choice.text || choice.label || choice}`;
        btn.addEventListener("click", () => choose(idx));
        choicesEl.appendChild(btn);
        choiceButtons.push(btn);
      });

      // Agency-steal: auto-select after 3s if sanity < 30 (High horror tier)
      const gs = engine.gameState;
      const sanity = gs?.party?.sanity ?? gs?.sanity ?? 100;
      if (sanity < 30 && choices.length > 0) {
        const countdownEl = document.createElement("p");
        countdownEl.style.color = "#cc4444";
        countdownEl.style.marginTop = "12px";
        countdownEl.style.fontSize = "13px";
        countdownEl.textContent = "Something compels you... (3s)";
        choicesEl.appendChild(countdownEl);

        let countdown = 3;
        autoTimer = setInterval(() => {
          countdown--;
          if (countdown <= 0) {
            clearAutoTimer();
            // Auto-select worst choice (last one, typically)
            choose(choices.length - 1);
          } else {
            countdownEl.textContent = `Something compels you... (${countdown}s)`;
          }
        }, 1000);
      }

      // Keyboard shortcuts
      k.onKeyPress("1", () => { if (choices.length >= 1) choose(0); });
      k.onKeyPress("2", () => { if (choices.length >= 2) choose(1); });
      k.onKeyPress("3", () => { if (choices.length >= 3) choose(2); });
      k.onKeyPress("4", () => { if (choices.length >= 4) choose(3); });
    }

    // ── Result beat ──
    // The outcome of a choice used to be invisible: the engine transitioned to
    // travel the instant /api/choice resolved, and travel floated the text for
    // ~300ms before its own scene was torn down. Now the panel stays and
    // repaints with what happened, what it cost, and a Continue button.
    function showResultBeat({ choiceLabel, outcome, deltas }) {
      clearAutoTimer();
      choiceButtons.length = 0;
      const deltaLine = engine.formatDeltas?.(deltas) || "";
      content.innerHTML =
        `<h2>${escapeHtml(title)}</h2>` +
        (choiceLabel
          ? `<p style="color:#b89b5e;font-style:italic;">You chose: ${escapeHtml(choiceLabel)}</p>`
          : "") +
        `<p>${escapeHtml(outcome || "The party moves on.")}</p>` +
        `<p style="color:#d4a017;font-size:14px;letter-spacing:0.3px;">${escapeHtml(deltaLine || "Nothing in the wagon changed.")}</p>` +
        `<div id="event-continue" style="margin-top:20px;"></div>`;
      overlay.classList.add("active", "tableau");

      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = "Continue";
      btn.addEventListener("click", () => engine.continueFromResult());
      document.getElementById("event-continue").appendChild(btn);
      requestAnimationFrame(() => btn.focus?.());

      const a11y = document.getElementById("a11y-status");
      if (a11y) a11y.textContent = `${outcome || ""} ${deltaLine}`.trim();

      // continueFromResult() is idempotent, so a keypress landing alongside the
      // focused button's own Enter handler can't double-transition.
      k.onKeyPress("space", () => engine.continueFromResult());
      k.onKeyPress("enter", () => engine.continueFromResult());
    }

    const onResolved = (payload) => showResultBeat(payload || {});
    engine.on("choiceResolved", onResolved);

    function cleanup() {
      clearAutoTimer();
      overlay.classList.remove("active", "tableau");
      content.innerHTML = "";
    }

    // Error recovery
    const onError = ({ message }) => {
      // Re-show overlay with choices and error message
      overlay.classList.add('active', 'tableau');
      resolving = false;
      setChoicesDisabled(false);
      const choicesEl = document.getElementById('event-choices');
      if (choicesEl) {
        const errP = document.createElement('p');
        errP.style.color = '#cc4444';
        errP.style.marginTop = '12px';
        errP.textContent = message || 'Something went wrong. Try again.';
        choicesEl.appendChild(errP);
      }
    };
    engine.on('error', onError);

    // Cleanup on scene leave
    k.onSceneLeave(() => {
      cleanup();
      engine.off('error', onError);
      engine.off('choiceResolved', onResolved);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
