export default function register(k, engine) {
  k.scene("share", (data) => {
    // Dim starry background
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(8, 8, 18), k.opacity(1)]);
    // Scatter stars
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 640;
      const y = Math.random() * 380;
      const size = Math.random() > 0.85 ? 2 : 1;
      k.add([
        k.rect(size, size),
        k.pos(x, y),
        k.color(255, 255, 255),
        k.opacity(0.3 + Math.random() * 0.5),
      ]);
    }

    const overlay = document.getElementById('html-overlay');
    const content = document.getElementById('overlay-content');
    overlay.classList.add('active');

    // Gather stats
    const leader = engine.party?.leader_name || engine.leaderName || 'Unknown';
    const profession = engine.profession || 'unknown';
    const miles = engine.milesTraveled || 0;
    const totalMembers = engine.party?.members?.length || 5;
    const alive = engine.aliveMembers?.length || 0;
    const dead = engine.deadMembers?.length || 0;
    const arrived = engine.gameState?.position?.arrived || alive > 0;
    const dateStr = engine.currentDate;
    const formattedDate = engine.formatDate(dateStr);

    const outcome = arrived && alive > 0
      ? `<span style="color:#6aad6a;">Reached Oregon City</span>`
      : `<span style="color:#cc3333;">Perished on the Trail</span>`;

    const shareText = arrived && alive > 0
      ? `I led the ${leader} party ${miles} miles to Oregon City! ${alive}/${totalMembers} survived. Can you do better?`
      : `The ${leader} party perished after ${miles} miles on the Oregon Trail. ${dead} lost. Can you survive?`;

    const shareUrl = window.location.origin;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

    content.innerHTML = `
      <h1 class="overlay-title">Your Journey Has Ended</h1>

      <div style="background:rgba(30,20,10,0.5);border:1px solid #8b4513;padding:1.2rem;border-radius:6px;margin-bottom:1.5rem;">
        <div style="text-align:center;margin-bottom:1rem;">
          <span style="font-size:1.3rem;font-weight:bold;">${outcome}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;font-size:0.95rem;">
          <div>Wagon Leader:</div><div style="text-align:right;"><strong>${leader}</strong></div>
          <div>Profession:</div><div style="text-align:right;"><strong>${profession.charAt(0).toUpperCase() + profession.slice(1)}</strong></div>
          <div>Miles Traveled:</div><div style="text-align:right;"><strong>${miles.toLocaleString()}</strong></div>
          <div>Survivors:</div><div style="text-align:right;"><strong>${alive} of ${totalMembers}</strong></div>
          <div>Date:</div><div style="text-align:right;"><strong>${formattedDate}</strong></div>
        </div>
      </div>

      <div class="overlay-choices" style="display:flex;flex-direction:column;gap:0.6rem;">
        <a href="${twitterUrl}" target="_blank" rel="noopener" class="overlay-choice" style="display:block;text-align:center;padding:0.7rem 1rem;text-decoration:none;color:#deb887;">
          Share on Twitter
        </a>
        <button id="share-copy" class="overlay-choice" style="padding:0.7rem 1rem;">
          Copy Link
        </button>
        <button id="share-restart" class="overlay-choice" style="padding:0.7rem 1rem;background:rgba(80,120,60,0.3);border-color:#6aad6a;">
          Play Again
        </button>
      </div>

      <div style="margin-top:1.5rem;text-align:center;border-top:1px solid rgba(139,69,19,0.4);padding-top:1rem;">
        <p class="overlay-text" style="font-size:0.9rem;margin-bottom:0.5rem;">
          Enjoyed the trail? Support the dev.
        </p>
        <a href="https://buymeacoffee.com/osicyber" target="_blank" rel="noopener"
           style="color:#d4a030;text-decoration:underline;font-family:Georgia,serif;font-size:0.95rem;">
          Buy me a coffee
        </a>
      </div>

      <div style="margin-top:1.5rem;text-align:center;opacity:0.5;font-size:0.8rem;">
        <p>Built by <a href="https://osi-cyber.com" target="_blank" rel="noopener" style="color:#deb887;">OSI Cyber</a></p>
      </div>
    `;

    // Copy link
    document.getElementById('share-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        const btn = document.getElementById('share-copy');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
      } catch (_) {}
    });

    // Play again
    document.getElementById('share-restart').addEventListener('click', () => {
      overlay.classList.remove('active');
      engine.restart();
    });
  });
}
