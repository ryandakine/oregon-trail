export default function register(k, engine) {
  k.scene("names", (data) => {
    // Dim interior background (brown tint)
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(30, 22, 15), k.opacity(0.9)]);
    // Warm interior accents
    k.add([k.rect(640, 2), k.pos(0, 80), k.color(139, 69, 19), k.opacity(0.3)]);
    k.add([k.rect(640, 2), k.pos(0, 400), k.color(139, 69, 19), k.opacity(0.3)]);

    const overlay = document.getElementById('html-overlay');
    const content = document.getElementById('overlay-content');
    overlay.classList.add('active');

    const names = [];
    let step = 0;

    const inputStyle = `
      background: rgba(20,15,10,0.8);
      border: 2px solid #8b4513;
      color: #deb887;
      font-family: Georgia, serif;
      font-size: 1.1rem;
      padding: 0.6rem 0.8rem;
      width: 100%;
      max-width: 300px;
      outline: none;
      border-radius: 4px;
    `.replace(/\n/g, '');

    const labels = [
      'What is your name, wagon leader?',
      'Name your first companion:',
      'Name your second companion:',
      'Name your third companion:',
      'Name your fourth companion:',
    ];

    function sanitize(val) {
      return val.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 20);
    }

    function renderStep() {
      const progress = step > 0
        ? `<p class="overlay-text" style="font-size:0.85em;opacity:0.6;margin-bottom:0.5rem;">Party so far: ${names.join(', ')}</p>`
        : '';

      content.innerHTML = `
        <h1 class="overlay-title">Name Your Party</h1>
        ${progress}
        <p class="overlay-text" style="margin-bottom:1.2rem;">${labels[step]}</p>
        <div style="text-align:center;">
          <input
            type="text"
            id="name-input"
            maxlength="20"
            placeholder="${step === 0 ? 'e.g. Ezra' : 'e.g. Martha'}"
            style="${inputStyle}"
            autofocus
          />
        </div>
        <p class="overlay-text" style="margin-top:1rem;font-size:0.85em;opacity:0.6;">
          Press Enter to confirm. (${step + 1} of 5)
        </p>
      `;

      const input = document.getElementById('name-input');
      input.focus();

      function submit() {
        const cleaned = sanitize(input.value);
        if (!cleaned) return;
        names.push(cleaned);
        step++;
        if (step >= 5) {
          overlay.classList.remove('active');
          document.removeEventListener('keydown', onGlobalKey);
          engine.submitNames(names[0], [names[1], names[2], names[3], names[4]]);
        } else {
          renderStep();
        }
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
    }

    function onGlobalKey(e) {
      // Keep focus on input if it exists
      const input = document.getElementById('name-input');
      if (input && document.activeElement !== input) {
        input.focus();
      }
    }
    document.addEventListener('keydown', onGlobalKey);
    k.onSceneLeave(() => document.removeEventListener('keydown', onGlobalKey));

    content.addEventListener('click', () => {
      const input = content.querySelector('input');
      if (input) input.focus();
    });

    renderStep();
  });
}
