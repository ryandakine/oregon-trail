/* =====================================================
   Oregon Trail AI -- Tombstone Renderer
   Terminal-styled tombstone for death sharing (1200x675)
   ===================================================== */

function renderTombstone(container, deathData, engine) {
  if (!container || !deathData) return;

  const name = (deathData.name || 'Unknown').toUpperCase();
  const cause = deathData.cause || 'Unknown cause';
  const epitaph = deathData.epitaph || '';
  const startDate = engine?.gameState?.party?.start_date || '1848-04-15';
  const deathDate = deathData.date || engine?.currentDate || '';
  const miles = deathData.mile || engine?.milesTraveled || 0;
  const territory = _guessTerritoryFromMiles(miles);
  const siteUrl = 'oregon-trail.pages.dev';

  // Format dates for display
  const fmtStart = _fmtTombstoneDate(startDate);
  const fmtDeath = _fmtTombstoneDate(deathDate);
  const dateRange = fmtStart && fmtDeath
    ? `${fmtStart} \u2014 ${fmtDeath}`
    : fmtDeath || '';

  // Wrap epitaph lines to ~38ch
  const wrappedEpitaph = _wrapLines(epitaph, 38);

  // Build the box-drawing tombstone text
  const W = 47;
  const hr = '\u2500'.repeat(W);
  const topBorder = '\u250C' + hr + '\u2510';
  const botBorder = '\u2514' + hr + '\u2518';
  const emptyLine = '\u2502' + ' '.repeat(W) + '\u2502';

  function centerLine(text) {
    const t = text.slice(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    const right = Math.max(0, W - t.length - pad);
    return '\u2502' + ' '.repeat(pad) + t + ' '.repeat(right) + '\u2502';
  }

  let lines = [];
  lines.push(topBorder);
  lines.push(centerLine('\u271D'));
  lines.push(emptyLine);
  lines.push(centerLine('HERE LIES'));
  lines.push(centerLine(name));
  lines.push(emptyLine);

  for (const eLine of wrappedEpitaph) {
    lines.push(centerLine('"' + eLine + '"'));
  }
  if (wrappedEpitaph.length === 0) {
    lines.push(centerLine('"' + _escTomb(cause) + '"'));
  }

  lines.push(emptyLine);
  if (dateRange) lines.push(centerLine(dateRange));
  lines.push(centerLine(`Mile ${miles}, ${territory}`));
  lines.push(emptyLine);
  lines.push(centerLine(siteUrl));
  lines.push(botBorder);

  const tombstoneText = lines.join('\n');

  container.innerHTML = `
    <div class="tombstone-wrapper">
      <div class="tombstone" id="tombstone-capture">
        <pre class="tombstone-text">${_escTomb(tombstoneText)}</pre>
      </div>
      <div class="tombstone-actions">
        <button class="share-btn" id="tombstone-download">Download Image</button>
        <button class="share-btn" id="tombstone-copy">Copy Text</button>
        <button class="share-btn" id="tombstone-close">Close</button>
      </div>
      <div class="tip-jar-subtle">
        <a href="https://buymeacoffee.com/osicyber" target="_blank" rel="noopener" class="tip-jar-link">Support the Trail</a>
      </div>
    </div>
  `;

  // Download via html2canvas
  document.getElementById('tombstone-download')?.addEventListener('click', async () => {
    const btn = document.getElementById('tombstone-download');
    const captureEl = document.getElementById('tombstone-capture');
    if (!captureEl || !window.html2canvas) return;

    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
      const canvas = await html2canvas(captureEl, {
        scale: 2,
        backgroundColor: '#111111',
        useCORS: true,
        logging: false,
      });

      // Try native share first (Android share sheet), fall back to download
      const shareText = `${deathData.name} died of ${deathData.cause || 'the trail'} on the Oregon Trail. "${deathData.epitaph || 'Gone too soon.'}" — trail.osi-cyber.com`;

      canvas.toBlob(async (blob) => {
        if (blob && navigator.canShare?.({ files: [new File([blob], 'tombstone.png', { type: 'image/png' })] })) {
          try {
            await navigator.share({
              title: 'Oregon Trail — AI Edition',
              text: shareText,
              files: [new File([blob], 'tombstone.png', { type: 'image/png' })],
            });
            btn.textContent = 'Shared!';
          } catch (e) {
            if (e.name !== 'AbortError') {
              // Share cancelled or failed, fall back to download
              const link = document.createElement('a');
              link.download = `tombstone-${(deathData.name || 'unknown').toLowerCase().replace(/\s+/g, '-')}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
              btn.textContent = 'Downloaded!';
            }
          }
        } else {
          const link = document.createElement('a');
          link.download = `tombstone-${(deathData.name || 'unknown').toLowerCase().replace(/\s+/g, '-')}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          btn.textContent = 'Downloaded!';
        }
        setTimeout(() => { btn.textContent = 'Download Image'; btn.disabled = false; }, 2000);
      }, 'image/png');
    } catch (e) {
      btn.textContent = 'Download failed';
      btn.disabled = false;
      console.error('tombstone html2canvas error:', e);
    }
  });

  // Copy text
  document.getElementById('tombstone-copy')?.addEventListener('click', () => {
    const btn = document.getElementById('tombstone-copy');
    navigator.clipboard.writeText(tombstoneText).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Text'; }, 2000);
    });
  });

  // Close
  document.getElementById('tombstone-close')?.addEventListener('click', () => {
    container.classList.add('hidden');
  });
}

// -- Helpers --

function _guessTerritoryFromMiles(miles) {
  if (miles < 300) return 'Missouri Territory';
  if (miles < 600) return 'Nebraska Territory';
  if (miles < 900) return 'Wyoming Territory';
  if (miles < 1200) return 'Idaho Territory';
  if (miles < 1500) return 'Oregon Territory';
  return 'Oregon Territory';
}

function _fmtTombstoneDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch (_) {
    return dateStr;
  }
}

function _wrapLines(text, maxLen) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && (current.length + 1 + word.length) > maxLen) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function _escTomb(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
