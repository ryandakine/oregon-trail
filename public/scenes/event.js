export default function register(k, engine) {
  k.scene("event", (sceneData) => {
    const eventData = sceneData?.data || engine.currentEvent;
    const overlay = document.getElementById("html-overlay");
    const content = overlay.querySelector(".overlay-content");
    let autoTimer = null;

    // Dim canvas backdrop
    k.add([
      k.rect(640, 480),
      k.pos(0, 0),
      k.color(0, 0, 0),
      k.opacity(0.6),
    ]);

    k.add([
      k.text("EVENT", { size: 16 }),
      k.pos(320, 460),
      k.anchor("center"),
      k.color(150, 130, 100),
      k.opacity(0.5),
    ]);

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
    overlay.classList.add("active");

    // Typewriter effect
    const typewriterEl = document.getElementById("event-typewriter");
    let charIdx = 0;
    const typeSpeed = 25;

    function typeNext() {
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
        btn.addEventListener("click", () => {
          cleanup();
          engine.makeChoice(0);
        });
        choicesEl.appendChild(btn);
        return;
      }

      choices.forEach((choice, idx) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = `${idx + 1}. ${choice.text || choice.label || choice}`;
        btn.addEventListener("click", () => {
          cleanup();
          engine.makeChoice(idx);
        });
        choicesEl.appendChild(btn);
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
            clearInterval(autoTimer);
            autoTimer = null;
            // Auto-select worst choice (last one, typically)
            cleanup();
            engine.makeChoice(choices.length - 1);
          } else {
            countdownEl.textContent = `Something compels you... (${countdown}s)`;
          }
        }, 1000);
      }

      // Keyboard shortcuts
      k.onKeyPress("1", () => { if (choices.length >= 1) { cleanup(); engine.makeChoice(0); } });
      k.onKeyPress("2", () => { if (choices.length >= 2) { cleanup(); engine.makeChoice(1); } });
      k.onKeyPress("3", () => { if (choices.length >= 3) { cleanup(); engine.makeChoice(2); } });
      k.onKeyPress("4", () => { if (choices.length >= 4) { cleanup(); engine.makeChoice(3); } });
    }

    function cleanup() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
      overlay.classList.remove("active");
      content.innerHTML = "";
    }

    // Cleanup on scene leave
    k.onSceneLeave(() => {
      cleanup();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
