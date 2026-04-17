export default function register(k, engine) {
  k.scene("profession", (data) => {
    // Dim prairie background
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(20, 20, 30), k.opacity(0.9)]);
    // Prairie horizon lines
    for (let i = 0; i < 8; i++) {
      k.add([
        k.rect(640, 1),
        k.pos(0, 300 + i * 12),
        k.color(40, 60, 30),
        k.opacity(0.3 - i * 0.03),
      ]);
    }

    const overlay = document.getElementById('html-overlay');
    const content = document.getElementById('overlay-content');
    overlay.classList.add('active');

    const professions = [
      {
        key: 'farmer',
        label: 'Farmer',
        money: '$400',
        desc: 'Scores are tripled. A hard road, but glory awaits the resourceful.',
      },
      {
        key: 'carpenter',
        label: 'Carpenter',
        money: '$800',
        desc: 'Scores are doubled. A skilled hand and a modest purse.',
      },
      {
        key: 'banker',
        label: 'Banker',
        money: '$1,600',
        desc: 'Standard scoring. Wealth smooths the trail\'s rough edges.',
      },
    ];

    content.innerHTML = `
      <h1 class="overlay-title">Choose Your Profession</h1>
      <p class="overlay-text" style="margin-bottom:1.5rem;">
        Your profession determines your starting funds and final score multiplier.
      </p>
      <div class="overlay-choices">
        ${professions.map((p, i) => `
          <button class="overlay-choice profession-btn" data-prof="${p.key}" style="display:block;width:100%;text-align:left;padding:1rem 1.2rem;margin-bottom:0.75rem;">
            <span style="float:right;color:#d4a030;font-weight:bold;">${p.money}</span>
            <strong>[${i + 1}]</strong> ${p.label}
            <br><span style="font-size:0.85em;opacity:0.8;">${p.desc}</span>
          </button>
        `).join('')}
      </div>
      <p class="overlay-text" style="margin-top:1rem;font-size:0.85em;opacity:0.6;">
        Press 1, 2, or 3 to choose.
      </p>
    `;

    function choose(prof) {
      overlay.classList.remove('active');
      document.removeEventListener('keydown', onKey);
      engine.selectProfession(prof);
    }

    content.querySelectorAll('.profession-btn').forEach((btn) => {
      btn.addEventListener('click', () => choose(btn.dataset.prof));
    });

    function onKey(e) {
      if (e.key === '1') choose('farmer');
      else if (e.key === '2') choose('carpenter');
      else if (e.key === '3') choose('banker');
    }
    document.addEventListener('keydown', onKey);
    k.onSceneLeave(() => document.removeEventListener('keydown', onKey));
  });
}
