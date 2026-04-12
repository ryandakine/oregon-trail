/* ═══════════════════════════════════════════════════
   Oregon Trail AI — Newspaper Renderer
   Sepia broadsheet overlay + PNG download + sharing
   ═══════════════════════════════════════════════════ */

function renderNewspaper(container, data, engine) {
  if (!data || !container) return;

  const newspaperName = data.newspaper_name || 'The Independence Gazette';
  const date = data.date || engine?.currentDate || '1848-10-01';
  const headline = data.headline || 'PARTY REACHES END OF TRAIL';
  const byline = data.byline || 'From our correspondent on the Oregon Trail';
  const paragraphs = data.article_paragraphs || [];
  const survivors = data.survivors || engine?.aliveMembers?.map(m => m.name) || [];
  const deaths = data.deaths || engine?.deaths || [];
  const totalMembers = engine?.gameState?.party?.members?.length || 5;
  const leader = engine?.gameState?.party?.leader_name || 'Unknown';
  const miles = engine?.milesTraveled || 0;

  // Build personal headline if not provided
  const personalHeadline = headline || buildPersonalHeadline(leader, survivors.length, totalMembers);

  // Trail map ASCII
  const trailMap = buildTrailMap(miles);

  // Death toll sidebar
  const deathSidebar = buildDeathSidebar(deaths);

  // Format date for display
  const displayDate = formatNewspaperDate(date);

  container.innerHTML = `
    <div class="newspaper" id="newspaper-capture">
      <button class="newspaper-close" title="Close">&times;</button>

      <div class="newspaper-masthead">
        <div class="newspaper-name">${esc(newspaperName)}</div>
        <div class="newspaper-dateline">
          <span>${esc(displayDate)}</span>
          <span class="newspaper-powered">Powered by OSI</span>
          <span>Vol. XII, No. ${Math.floor(Math.random() * 300) + 1}</span>
        </div>
      </div>

      <div class="newspaper-headline">${esc(personalHeadline)}</div>
      <div class="newspaper-byline">${esc(byline)}</div>

      <div class="newspaper-body">
        <div class="newspaper-columns">
          ${paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
          ${paragraphs.length === 0 ? '<p>No further details are available at this time.</p>' : ''}
        </div>

        <div class="newspaper-sidebar">
          ${deaths.length > 0 ? `
            <div class="newspaper-sidebar-title">Death Toll</div>
            ${deathSidebar}
          ` : `
            <div class="newspaper-sidebar-title">All Survived</div>
            <div class="newspaper-death-entry">
              <div class="newspaper-death-detail">
                Every member of the ${esc(leader)} party
                arrived safely in the Willamette Valley.
              </div>
            </div>
          `}

          <div class="newspaper-trail-map">
            <div class="newspaper-sidebar-title">The Oregon Trail</div>
            <pre>${trailMap}</pre>
          </div>
        </div>
      </div>

      <div class="newspaper-footer">
        Built by <strong>On-Site Intelligence</strong> &mdash; Denver, Colorado
        &nbsp;&bull;&nbsp; Every playthrough is unique
      </div>

      <div class="newspaper-actions">
        <button class="newspaper-action-btn" id="newspaper-download">Download as Image</button>
        <button class="newspaper-action-btn" id="newspaper-twitter">Share on Twitter</button>
        <button class="newspaper-action-btn" id="newspaper-continue">Continue</button>
      </div>
    </div>
  `;

  // Wire up close button
  container.querySelector('.newspaper-close')?.addEventListener('click', () => {
    container.classList.add('hidden');
    engine?.transition('SHARE');
  });

  // Download as PNG via html2canvas
  document.getElementById('newspaper-download')?.addEventListener('click', async () => {
    const btn = document.getElementById('newspaper-download');
    const captureEl = document.getElementById('newspaper-capture');
    if (!captureEl || !window.html2canvas) return;

    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
      // Hide action buttons during capture
      const actions = captureEl.querySelector('.newspaper-actions');
      const closeBtn = captureEl.querySelector('.newspaper-close');
      if (actions) actions.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'none';

      const canvas = await html2canvas(captureEl, {
        scale: 2,
        width: 1200,
        height: 675,
        backgroundColor: '#f4e4c1',
        useCORS: true,
        logging: false,
      });

      // Restore buttons
      if (actions) actions.style.display = '';
      if (closeBtn) closeBtn.style.display = '';

      // Try native share first, fall back to download
      const shareText = `${data.headline || 'News from the Oregon Trail'} — trail.osi-cyber.com`;

      canvas.toBlob(async (blob) => {
        if (blob && navigator.canShare?.({ files: [new File([blob], 'newspaper.png', { type: 'image/png' })] })) {
          try {
            await navigator.share({
              title: 'Oregon Trail — AI Edition',
              text: shareText,
              files: [new File([blob], 'newspaper.png', { type: 'image/png' })],
            });
            btn.textContent = 'Shared!';
          } catch (e) {
            if (e.name !== 'AbortError') {
              const link = document.createElement('a');
              link.download = `oregon-trail-${leader.toLowerCase().replace(/\s+/g, '-')}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
              btn.textContent = 'Downloaded!';
            }
          }
        } else {
          const link = document.createElement('a');
          link.download = `oregon-trail-${leader.toLowerCase().replace(/\s+/g, '-')}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          btn.textContent = 'Downloaded!';
        }
        setTimeout(() => { btn.textContent = 'Download as Image'; btn.disabled = false; }, 2000);
      }, 'image/png');
    } catch (e) {
      btn.textContent = 'Download failed';
      btn.disabled = false;
      console.error('html2canvas error:', e);
    }
  });

  // Twitter share
  document.getElementById('newspaper-twitter')?.addEventListener('click', () => {
    const text = `${personalHeadline}\n\nThe Oregon Trail — AI Edition. Every playthrough is unique.`;
    const url = window.location.origin;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank'
    );
  });

  // Continue
  document.getElementById('newspaper-continue')?.addEventListener('click', () => {
    container.classList.add('hidden');
    engine?.transition('SHARE');
  });
}

// ── Helper Functions ───────────────────────────

function buildPersonalHeadline(leader, survivorCount, totalMembers) {
  if (survivorCount === 0) {
    return `${leader.toUpperCase()} PARTY PERISHES ON THE TRAIL`;
  }
  if (survivorCount === totalMembers) {
    return `${leader.toUpperCase()} PARTY ARRIVES SAFELY IN OREGON`;
  }
  return `${leader.toUpperCase()} ARRIVES WITH ${survivorCount} OF ${totalMembers}`;
}

function buildDeathSidebar(deaths) {
  if (!deaths || deaths.length === 0) return '';

  return deaths.map(d => `
    <div class="newspaper-death-entry">
      <div class="newspaper-death-name">${esc(d.name)}</div>
      <div class="newspaper-death-detail">
        ${esc(d.cause || 'Unknown cause')}
        ${d.date ? `<br>Mile ${esc(String(d.mile || '?'))} &mdash; ${esc(d.date)}` : ''}
      </div>
    </div>
  `).join('');
}

function buildTrailMap(currentMiles) {
  // ASCII trail map with key landmarks
  const landmarks = [
    { name: 'Independence', mile: 0 },
    { name: 'Ft. Kearney', mile: 319 },
    { name: 'Chimney Rock', mile: 554 },
    { name: 'Ft. Laramie', mile: 640 },
    { name: 'Ind. Rock', mile: 838 },
    { name: 'South Pass', mile: 914 },
    { name: 'Ft. Hall', mile: 1150 },
    { name: 'Ft. Boise', mile: 1400 },
    { name: 'The Dalles', mile: 1630 },
    { name: 'Oregon City', mile: 1764 },
  ];

  let map = '';
  const totalWidth = 32;

  // Draw the trail line
  map += '  Independence          Oregon City\n';
  map += '  o';

  for (let i = 0; i < totalWidth; i++) {
    const mile = (i / totalWidth) * 1764;
    if (currentMiles > 0 && Math.abs(mile - currentMiles) < 30) {
      map += 'X';
    } else {
      // Check if a landmark is near
      const nearLandmark = landmarks.find(l => Math.abs(l.mile - mile) < 40 && l.mile > 0 && l.mile < 1764);
      map += nearLandmark ? '+' : '-';
    }
  }

  map += 'o\n';

  // Legend
  map += '  |' + ' '.repeat(totalWidth) + '|\n';
  map += `  0 mi${' '.repeat(totalWidth - 10)}1,764 mi\n`;

  if (currentMiles > 0 && currentMiles < 1764) {
    const pos = Math.round((currentMiles / 1764) * totalWidth);
    map += '  ' + ' '.repeat(pos) + 'X = Last known position\n';
    map += `  ${' '.repeat(pos)}(Mile ${currentMiles})`;
  }

  return map;
}

function formatNewspaperDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch (_) {
    return dateStr;
  }
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
