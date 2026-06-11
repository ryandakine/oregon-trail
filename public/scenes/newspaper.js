// Lazy-load the 198KB html2canvas UMD bundle on first share instead of
// eagerly on every page load (IMPROVEMENT_ROADMAP §2). It's UMD (sets
// window.html2canvas), not an ES module, so inject a <script> tag and resolve
// when the global appears. The promise is cached so repeat shares reuse it.
let _h2cPromise = null;
function ensureHtml2Canvas() {
  if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
  if (_h2cPromise) return _h2cPromise;
  _h2cPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/html2canvas.min.js';
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => { _h2cPromise = null; resolve(null); };
    document.head.appendChild(s);
  });
  return _h2cPromise;
}

export default function register(k, engine) {
  k.scene("newspaper", (newsData) => {
    // No canvas bg needed — newspaper uses its own overlay
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(10, 10, 15), k.opacity(0.95)]);

    const overlay = document.getElementById('newspaper-overlay');
    overlay.classList.add('active');

    const np = newsData || {};
    const headline = np.headline || 'TRAIL PARTY REACHES END OF JOURNEY';
    const byline = np.byline || 'From our correspondent';
    const paperName = np.newspaper_name || 'The Independence Gazette';
    // np.date is the LLM's freeform dateline and often isn't a parseable date
    // ("May 1848"). Only trust it if it parses; else use the canonical in-game
    // date so the dateline never renders as "undefined NaN, NaN".
    const validIso = np.date && !isNaN(new Date(np.date + 'T00:00:00').getTime());
    const dateStr = validIso ? np.date : engine.currentDate;
    const paragraphs = np.article_paragraphs || ['No further details are available.'];
    const survivors = np.survivors || [];
    const deaths = np.deaths || engine.deaths || [];

    const formattedDate = engine.formatDate(dateStr);

    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    // Build death sidebar
    const deathEntries = deaths.map((d) => {
      const name = esc(d.name || 'Unknown');
      const cause = esc(d.cause || 'unknown causes');
      return `<div style="margin-bottom:0.4rem;"><strong>${name}</strong><br><span style="font-size:0.85em;font-style:italic;">${cause}</span></div>`;
    }).join('');

    const deathSidebar = deaths.length > 0
      ? `<div style="border:2px solid #3a2510;padding:0.8rem;margin-top:1rem;background:rgba(60,40,20,0.2);">
          <h3 style="font-size:1rem;margin:0 0 0.5rem 0;text-align:center;border-bottom:1px solid #3a2510;padding-bottom:0.3rem;">
            IN MEMORIAM
          </h3>
          ${deathEntries}
        </div>`
      : '';

    const survivorList = survivors.length > 0
      ? `<p style="font-style:italic;margin-top:1rem;">Survivors: ${survivors.map(s => esc(s)).join(', ')}</p>`
      : '';

    // Phase 2 (Bet 2): when the server issued a share object with a score,
    // print a subtle period-styled tally line inside the capture region so
    // the shared PNG carries the challenge name + score. Absent for runs
    // without one (older runs, local fallback newspaper).
    const shareInfo = engine.shareInfo;
    const challengeName = shareInfo?.challenge_id
      ? ((window.CHALLENGE_INFO || {})[shareInfo.challenge_id]?.name
          || String(shareInfo.challenge_id).replace(/_/g, ' '))
      : null;
    const scoreLine = (shareInfo && typeof shareInfo.score === 'number')
      ? `<p style="text-align:center;font-style:italic;font-size:0.85rem;margin-top:1rem;opacity:0.75;">
          ${esc(challengeName
            ? `${challengeName} Challenge — ${shareInfo.score.toLocaleString()} points, by the Gazette's reckoning.`
            : `${shareInfo.score.toLocaleString()} points, by the Gazette's reckoning.`)}
        </p>`
      : '';

    overlay.innerHTML = `
      <div id="newspaper-content" style="
        max-width:600px;margin:2rem auto;padding:2rem 2.5rem;
        background:#f4e4c1;color:#2a1a0a;font-family:Georgia,serif;
        border:3px double #3a2510;position:relative;
        max-height:85vh;overflow-y:auto;
      ">
        <div style="text-align:center;border-bottom:3px double #3a2510;padding-bottom:0.8rem;margin-bottom:1rem;">
          <h1 style="font-size:1.6rem;margin:0;letter-spacing:0.15em;text-transform:uppercase;color:#2a1a0a;">
            ${esc(paperName)}
          </h1>
          <p style="font-size:0.85em;margin:0.3rem 0 0 0;opacity:0.7;">${esc(formattedDate)}</p>
        </div>

        <h2 style="font-size:1.4rem;text-align:center;margin:1rem 0 0.5rem 0;line-height:1.3;color:#2a1a0a;">
          ${esc(headline)}
        </h2>
        <p style="text-align:center;font-style:italic;font-size:0.9em;margin-bottom:1.2rem;opacity:0.7;">
          ${esc(byline)}
        </p>

        <div style="column-count:2;column-gap:1.5rem;column-rule:1px solid #3a2510;">
          ${paragraphs.map((p) => `<p style="text-indent:1.5em;margin:0 0 0.8rem 0;font-size:0.95rem;line-height:1.5;text-align:justify;">${esc(p)}</p>`).join('')}
          ${survivorList}
        </div>

        ${deathSidebar}

        ${scoreLine}

        <!-- Watermark + OSI credit INSIDE the capture region so the shared PNG
             carries a link back and the viral fact. (IMPROVEMENT_ROADMAP §1.2)
             Strings ported from the dead public/newspaper.js:76-78. -->
        <div style="margin-top:1.5rem;padding-top:0.8rem;border-top:1px solid #3a2510;text-align:center;font-size:0.78rem;color:#5a3a1a;line-height:1.5;">
          An AI wrote this run live &mdash; every playthrough is unique.<br>
          Built by <strong>On-Site Intelligence</strong> &middot; Denver, Colorado &middot; <strong>trail.osi-cyber.com</strong>
        </div>

        <div style="display:flex;gap:0.8rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap;">
          <button id="np-download" style="
            background:#3a2510;color:#f4e4c1;border:2px solid #2a1a0a;
            padding:0.6rem 1.2rem;font-family:Georgia,serif;font-size:0.9rem;
            cursor:pointer;border-radius:4px;
          ">Download Image</button>
          <button id="np-share" style="
            background:#3a2510;color:#f4e4c1;border:2px solid #2a1a0a;
            padding:0.6rem 1.2rem;font-family:Georgia,serif;font-size:0.9rem;
            cursor:pointer;border-radius:4px;
          ">Share</button>
          <button id="np-close" style="
            background:#5a3a1a;color:#f4e4c1;border:2px solid #2a1a0a;
            padding:0.6rem 1.2rem;font-family:Georgia,serif;font-size:0.9rem;
            cursor:pointer;border-radius:4px;
          ">Continue</button>
        </div>
      </div>
    `;

    // Branded download filename, e.g. oregon-trail-ezra-1764mi.png
    // (IMPROVEMENT_ROADMAP §1.2). Falls back to a generic name if no leader.
    const leaderSlug = (engine.party?.leader_name || engine.leaderName || 'pioneer')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pioneer';
    const downloadName = `oregon-trail-${leaderSlug}-${engine.milesTraveled || 0}mi.png`;

    // Download via html2canvas — lazy-loaded on first use (IMPROVEMENT_ROADMAP §2).
    document.getElementById('np-download').addEventListener('click', async () => {
      const el = document.getElementById('newspaper-content');
      // Hide the action buttons so they don't bake into the captured PNG.
      const actions = el.querySelector('#np-download')?.parentElement;
      const h2c = await ensureHtml2Canvas();
      if (typeof h2c === 'function') {
        try {
          if (actions) actions.style.visibility = 'hidden';
          const canvas = await h2c(el, { backgroundColor: '#f4e4c1', scale: 2 });
          if (actions) actions.style.visibility = '';
          const link = document.createElement('a');
          link.download = downloadName;
          link.href = canvas.toDataURL('image/png');
          link.click();
          engine.track('newspaper_downloaded', { miles: engine.milesTraveled || 0 });
        } catch (e) {
          if (actions) actions.style.visibility = '';
          console.error('html2canvas failed:', e);
        }
      }
    });

    // Share via Web Share API
    document.getElementById('np-share').addEventListener('click', async () => {
      const shareText = `${headline}\n\n${paragraphs[0] || ''}\n\nPlay the AI Oregon Trail: ${window.location.origin}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: paperName,
            text: shareText,
            url: window.location.origin,
          });
        } catch (_) { /* user cancelled */ }
      } else {
        // Fallback: copy to clipboard
        try {
          await navigator.clipboard.writeText(shareText);
          const btn = document.getElementById('np-share');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Share'; }, 2000);
        } catch (_) {}
      }
    });

    // Close → SHARE scene
    document.getElementById('np-close').addEventListener('click', () => {
      overlay.classList.remove('active');
      overlay.innerHTML = '';
      engine.transition('SHARE');
    });
  });
}
