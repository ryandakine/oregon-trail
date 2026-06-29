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

    // Escape free-text fields before they enter innerHTML. Defense-in-depth:
    // leader_name/profession are server-sanitized at /api/start, but esc() keeps
    // this sink consistent with the other scenes if that allowlist ever loosens.
    const esc = (str) => {
      const d = document.createElement('div');
      d.textContent = str == null ? '' : String(str);
      return d.innerHTML;
    };

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

    // Phase 2 per-run share stub (PHASE2_BIG_BETS_PLAN Bets 1+2): when the
    // worker issued a signed /r/<id> result page for this run, the Twitter
    // intent + copy-link prefer it so unfurls carry the run's own OG card.
    // UTM-tagged origin fallbacks remain for runs without one (older runs,
    // fallback newspaper). The /r URL is used as-is — its CTA carries UTMs.
    const shareInfo = engine.shareInfo;
    const shareLink = shareInfo?.url || null;
    const challengeName = shareInfo?.challenge_id
      ? ((window.CHALLENGE_INFO || {})[shareInfo.challenge_id]?.name
          || String(shareInfo.challenge_id).replace(/_/g, ' '))
      : null;
    const scoreBit = (shareInfo && typeof shareInfo.score === 'number')
      ? (challengeName
          ? ` ${challengeName} challenge — ${shareInfo.score.toLocaleString()} pts.`
          : ` Final score: ${shareInfo.score.toLocaleString()} pts.`)
      : '';

    // Lead with the viral fact — an AI wrote this run live — so the share
    // says what's novel, not just the score. (IMPROVEMENT_ROADMAP §1.2)
    const baseShareText = arrived && alive > 0
      ? `I led the ${leader} party ${miles} miles to Oregon City! ${alive}/${totalMembers} survived. An AI wrote my whole run live — every playthrough is different. Can you do better?`
      : `The ${leader} party perished after ${miles} miles on the Oregon Trail. ${dead} lost. An AI wrote my whole run live — every playthrough is different. Can you survive?`;
    const shareText = baseShareText + scoreBit;

    // Plain origin for navigator/clipboard; UTM-tagged variants for the OSI
    // links so Plausible can attribute game → site traffic. (ROADMAP §1.2/§1.5)
    const shareUrl = window.location.origin;
    // UTM-tagged variants so Plausible can attribute game → site traffic.
    const utm = (base, medium) => `${base}/?utm_source=oregon-trail&utm_medium=${medium}`;
    const dailyUrl = `${shareUrl}/?utm_source=oregon-trail&utm_medium=share&play=daily`;
    const osiSiteUrl = utm('https://osi-cyber.com', 'share-footer');
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareLink || utm(shareUrl, 'twitter'))}`;

    // Streak: count consecutive prior days the daily trail was completed,
    // ending today. Purely local (ROADMAP §1.2). 0 → no streak line.
    const streak = (() => {
      try {
        let n = 0;
        const today = GameEngine.getDailyTrailNumber();
        // Today counts if a run just finished in daily mode.
        for (let day = today; day >= 1; day--) {
          const raw = localStorage.getItem('ot_daily_' + day);
          if (!raw) break;
          const r = JSON.parse(raw);
          if (!r?.completed) break;
          n++;
        }
        return n;
      } catch (_) { return 0; }
    })();

    content.innerHTML = `
      <h1 class="overlay-title">Your Journey Has Ended</h1>

      <div style="background:rgba(30,20,10,0.5);border:1px solid #8b4513;padding:1.2rem;border-radius:6px;margin-bottom:1.5rem;">
        <div style="text-align:center;margin-bottom:1rem;">
          <span style="font-size:1.3rem;font-weight:bold;">${outcome}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;font-size:0.95rem;">
          <div>Wagon Leader:</div><div style="text-align:right;"><strong>${esc(leader)}</strong></div>
          <div>Profession:</div><div style="text-align:right;"><strong>${esc(profession.charAt(0).toUpperCase() + profession.slice(1))}</strong></div>
          <div>Miles Traveled:</div><div style="text-align:right;"><strong>${miles.toLocaleString()}</strong></div>
          <div>Survivors:</div><div style="text-align:right;"><strong>${alive} of ${totalMembers}</strong></div>
          <div>Date:</div><div style="text-align:right;"><strong>${formattedDate}</strong></div>
        </div>
      </div>

      <div class="overlay-choices" style="display:flex;flex-direction:column;gap:0.6rem;">
        <a href="${twitterUrl}" target="_blank" rel="noopener" id="share-twitter" class="overlay-choice" style="display:block;text-align:center;padding:0.7rem 1rem;text-decoration:none;color:#deb887;">
          Share on Twitter
        </a>
        <button id="share-copy" class="overlay-choice" style="padding:0.7rem 1rem;">
          Copy Link
        </button>
        <a href="${dailyUrl}" id="share-daily" class="overlay-choice" style="display:block;text-align:center;padding:0.7rem 1rem;text-decoration:none;color:#a0d090;background:rgba(40,80,40,0.35);border-color:#4a8a4a;">
          Try today's Daily Trail →${streak > 0 ? ` <span style="opacity:0.85;">&middot; \u{1F525} ${streak}-day streak</span>` : ''}
        </a>
        <button id="share-restart" class="overlay-choice" style="padding:0.7rem 1rem;background:rgba(80,120,60,0.3);border-color:#6aad6a;">
          Play Again
        </button>
      </div>

      <div style="margin-top:1.5rem;text-align:center;border-top:1px solid rgba(139,69,19,0.4);padding-top:1rem;">
        <p class="overlay-text" style="font-size:0.9rem;margin-bottom:0.5rem;">
          Enjoyed the trail? Support the dev.
        </p>
        <a href="https://buymeacoffee.com/osicyber" target="_blank" rel="noopener" class="osi-link"
           style="color:#d4a030;text-decoration:underline;font-family:Georgia,serif;font-size:0.95rem;">
          Buy me a coffee
        </a>
      </div>

      <div style="margin-top:1.5rem;text-align:center;opacity:0.5;font-size:0.8rem;">
        <p>Built by <a href="${osiSiteUrl}" target="_blank" rel="noopener" class="osi-link" style="color:#deb887;">OSI Cyber</a></p>
      </div>
    `;

    // Copy link — prefers the per-run /r URL when present (Phase 2 Bet 1).
    document.getElementById('share-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareLink || shareUrl);
        const btn = document.getElementById('share-copy');
        btn.textContent = 'Copied!';
        engine.track('share_clicked', { method: 'copy', outcome: arrived && alive > 0 ? 'arrival' : 'wipe' });
        if (shareLink) engine.track('share_link_used', { method: 'copy' });
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
      } catch (_) {}
    });

    // Twitter share — funnel event (ROADMAP §1.5).
    document.getElementById('share-twitter')?.addEventListener('click', () => {
      engine.track('share_clicked', { method: 'twitter', outcome: arrived && alive > 0 ? 'arrival' : 'wipe' });
      if (shareLink) engine.track('share_link_used', { method: 'twitter' });
    });

    // OSI outbound links — attribution goal (ROADMAP §1.5).
    content.querySelectorAll('.osi-link').forEach((a) => {
      a.addEventListener('click', () => engine.track('osi_link_clicked', { from: 'share' }));
    });

    // "Try today's Daily Trail" — start a fresh daily run in-session rather
    // than reloading via the UTM href. (ROADMAP §1.2)
    document.getElementById('share-daily')?.addEventListener('click', (e) => {
      e.preventDefault();
      engine.track('daily_trail_clicked', { from: 'share' });
      overlay.classList.remove('active');
      engine.restart();
      engine.startDailyTrail();
      engine.transition('PROFESSION');
    });

    // Play again
    document.getElementById('share-restart').addEventListener('click', () => {
      overlay.classList.remove('active');
      engine.restart();
    });
  });
}
