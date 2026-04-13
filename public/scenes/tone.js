export default function register(k, engine) {
  k.scene("tone", (data) => {
    // Dark background with three diverging paths
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(15, 15, 25), k.opacity(0.95)]);

    // Three diverging colored lines from bottom-center
    const cx = 320;
    const by = 460;
    // Left path (green - safe)
    for (let i = 0; i < 20; i++) {
      k.add([
        k.rect(3, 3),
        k.pos(cx - i * 8, by - i * 15),
        k.color(80, 160, 80),
        k.opacity(0.5 - i * 0.02),
      ]);
    }
    // Center path (amber - dark)
    for (let i = 0; i < 20; i++) {
      k.add([
        k.rect(3, 3),
        k.pos(cx, by - i * 15),
        k.color(210, 160, 50),
        k.opacity(0.5 - i * 0.02),
      ]);
    }
    // Right path (red - horror)
    for (let i = 0; i < 20; i++) {
      k.add([
        k.rect(3, 3),
        k.pos(cx + i * 8, by - i * 15),
        k.color(180, 40, 40),
        k.opacity(0.5 - i * 0.02),
      ]);
    }

    const overlay = document.getElementById('html-overlay');
    const content = document.getElementById('overlay-content');
    overlay.classList.add('active');

    const tones = [
      {
        key: 'safe',
        label: 'Classroom Safe',
        color: '#6aad6a',
        desc: 'Family-friendly. Hardship without horror. Good for younger players.',
        warning: null,
      },
      {
        key: 'dark',
        label: 'Dark Frontier',
        color: '#d4a030',
        desc: 'Historically authentic brutality. Disease, starvation, and hard moral choices.',
        warning: null,
        recommended: true,
      },
      {
        key: 'horror',
        label: 'Psychological Horror',
        color: '#cc3333',
        desc: 'The trail breaks minds as well as bodies. Paranoia, hallucinations, and dread.',
        warning: 'Content warning: disturbing themes, psychological distress, graphic death.',
      },
    ];

    content.innerHTML = `
      <h1 class="overlay-title">Choose Your Tone</h1>
      <p class="overlay-text" style="margin-bottom:1.5rem;">
        This controls the AI narrator's tone for your entire journey.
      </p>
      <div class="overlay-choices">
        ${tones.map((t, i) => `
          <button class="overlay-choice tone-btn" data-tone="${t.key}" style="display:block;width:100%;text-align:left;padding:1rem 1.2rem;margin-bottom:0.75rem;border-left:4px solid ${t.color};">
            <strong>[${i + 1}]</strong> <span style="color:${t.color};">${t.label}</span>
            ${t.recommended ? '<span style="font-size:0.75em;background:#d4a030;color:#000;padding:2px 6px;border-radius:3px;margin-left:0.5rem;">RECOMMENDED</span>' : ''}
            <br><span style="font-size:0.85em;opacity:0.8;">${t.desc}</span>
            ${t.warning ? `<br><span style="font-size:0.8em;color:#cc3333;font-style:italic;">${t.warning}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <p class="overlay-text" style="margin-top:1rem;font-size:0.85em;opacity:0.6;">
        Press 1, 2, or 3 to choose.
      </p>
      <div id="tone-loading" style="display:none;text-align:center;margin-top:2rem;">
        <p class="overlay-text" style="color:#d4a030;font-size:1.1rem;">Preparing your wagon...</p>
        <p class="overlay-text" style="font-size:0.85em;opacity:0.6;">The AI is generating your unique trail.</p>
      </div>
    `;

    let chosen = false;

    function choose(tier) {
      if (chosen) return;
      chosen = true;

      // Hide choices, show loading
      content.querySelector('.overlay-choices').style.display = 'none';
      content.querySelectorAll('.overlay-text').forEach((el) => {
        if (!el.closest('#tone-loading')) el.style.display = 'none';
      });
      content.querySelector('h1').style.display = 'none';
      document.getElementById('tone-loading').style.display = 'block';

      document.removeEventListener('keydown', onKey);

      // selectTone is async — it will transition when done
      engine.selectTone(tier);
    }

    content.querySelectorAll('.tone-btn').forEach((btn) => {
      btn.addEventListener('click', () => choose(btn.dataset.tone));
    });

    function onKey(e) {
      if (e.key === '1') choose('safe');
      else if (e.key === '2') choose('dark');
      else if (e.key === '3') choose('horror');
    }
    document.addEventListener('keydown', onKey);

    // Clean up overlay when engine transitions away
    engine.on('stateChange', ({ from }) => {
      if (from === 'TONE') {
        overlay.classList.remove('active');
        document.removeEventListener('keydown', onKey);
      }
    });
  });
}
