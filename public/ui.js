/* ═══════════════════════════════════════════════════
   Oregon Trail AI — UI Layer
   DOM manipulation + rendering. Subscribes to engine.
   ═══════════════════════════════════════════════════ */

class GameUI {
  constructor(engine) {
    this.engine = engine;
    this.$topBar = document.getElementById('top-bar');
    this.$roster = document.getElementById('roster');
    this.$narrative = document.getElementById('narrative');
    this.$actionBar = document.getElementById('action-bar');
    this.$newspaper = document.getElementById('newspaper-overlay');

    this._typingAbort = null;
    this._choiceCooldown = false;
    this._agencyStealTimer = null;

    engine.on('stateChange', (e) => this.onStateChange(e));
    engine.on('daysAdvanced', (e) => this.onDaysAdvanced(e));
    engine.on('loading', (loading) => this.onLoading(loading));
    engine.on('error', (e) => this.onError(e));
    engine.on('settingsChanged', (e) => this.onSettingsChanged(e));

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('click', () => this._completeTyping());
  }

  // ── State Change Router ──────────────────────

  onStateChange({ from, to, data }) {
    this._clearAgencySteal();

    switch (to) {
      case 'TITLE':       this.renderTitle(); break;
      case 'PROFESSION':  this.renderProfession(); break;
      case 'NAMES':       this.renderNames(); break;
      case 'TONE':        this.renderTone(); break;
      case 'STORE':       this.renderStore(data); break;
      case 'TRAVEL':      this.renderTravel(); break;
      case 'EVENT':       this.renderEvent(data); break;
      case 'LANDMARK':    this.renderLandmark(data); break;
      case 'RIVER':       this.renderRiver(data); break;
      case 'DEATH':       this.renderDeath(data); break;
      case 'ARRIVAL':     this.renderArrival(); break;
      case 'WIPE':        this.renderWipe(); break;
      case 'NEWSPAPER':   this.renderNewspaper(data); break;
      case 'SHARE':       this.renderShare(); break;
    }
  }

  // ── Loading / Error ──────────────────────────

  onLoading(loading) {
    if (loading) {
      this._showLoading();
    }
    // Loading cleared by next state render
  }

  _showLoading() {
    const existing = this.$narrative.querySelector('.loading-msg');
    if (existing) return;

    const el = document.createElement('div');
    el.className = 'narrative-block loading-msg';
    el.innerHTML = '<span class="narrative-dim">The trail stretches ahead<span class="loading-dots"></span></span>';
    this.$narrative.appendChild(el);
    this._scrollNarrative();

    // Long-wait message
    this._loadingTimeout = setTimeout(() => {
      const dots = el.querySelector('.loading-dots');
      if (dots) {
        el.innerHTML = '<span class="narrative-dim">Dust clouds obscure the path<span class="loading-dots"></span></span>';
      }
    }, 3000);
  }

  _clearLoading() {
    clearTimeout(this._loadingTimeout);
    const el = this.$narrative.querySelector('.loading-msg');
    if (el) el.remove();
  }

  onError({ message, recoverable }) {
    this._clearLoading();
    const el = document.createElement('div');
    el.className = 'narrative-block';
    el.innerHTML = `<span class="narrative-dim">[Error: ${this._esc(message)}]</span>`;
    if (recoverable) {
      el.innerHTML += '<br><span class="narrative-dim">Press ENTER to retry.</span>';
      this._pendingRetry = true;
    }
    this.$narrative.appendChild(el);
    this._scrollNarrative();
  }

  onSettingsChanged({ pace, rations }) {
    this._updateActionBar();
  }

  // ── Days Advanced (travel ticks) ─────────────

  async onDaysAdvanced({ summaries, days }) {
    this._clearLoading();

    for (const summary of summaries) {
      const hasEvents = summary.events && summary.events.length > 0;
      const el = document.createElement('div');
      el.className = 'day-summary' + (hasEvents ? ' event-day' : '');

      let html = `<div class="day-date">${this._esc(this.engine.formatDate(summary.date))} - ${summary.miles} mi</div>`;
      for (const evt of (summary.events || [])) {
        html += `<div class="day-event">${this._esc(evt)}</div>`;
      }
      el.innerHTML = html;
      this.$narrative.appendChild(el);
      this._scrollNarrative();

      // Tick delay: 400ms for event days, 200ms for quiet
      await this._delay(hasEvents ? 400 : 200);
    }

    // Update top bar and roster
    this._updateTopBar();
    this._updateRoster();

    // Add occasional flavor text between advances
    if (summaries.length > 0 && Math.random() < 0.3) {
      this._addFlavorText();
    }
  }

  _addFlavorText() {
    const gs = this.engine.gameState;
    if (!gs) return;

    // Pick flavor based on terrain (fallback to prairie)
    const segment = gs.position?.current_segment_id;
    let terrain = 'prairie';
    // We don't have the segment data client-side, so use a heuristic based on miles
    const miles = gs.position?.miles_traveled || 0;
    if (miles > 1500) terrain = 'forest';
    else if (miles > 1200) terrain = 'mountains';
    else if (miles > 900) terrain = 'canyon';
    else if (miles > 600) terrain = 'high_plains';
    else if (miles > 300) terrain = 'bluffs';
    else if (miles > 100) terrain = 'river_valley';

    const pool = TRAIL_FLAVOR[terrain] || TRAIL_FLAVOR.prairie;
    const text = pool[Math.floor(Math.random() * pool.length)];

    const el = document.createElement('div');
    el.className = 'narrative-block';
    el.innerHTML = `<span class="narrative-italic">${this._esc(text)}</span>`;
    this.$narrative.appendChild(el);
    this._scrollNarrative();
  }

  // ── Keyboard Input ───────────────────────────

  onKeyDown(e) {
    // Complete typing on any key
    this._completeTyping();

    if (e.key === 'Enter') {
      if (this._pendingRetry) {
        this._pendingRetry = false;
        this.engine.advance();
        return;
      }
      if (this._pendingEnter) {
        this._pendingEnter();
        this._pendingEnter = null;
        return;
      }
    }

    // Number keys for choices
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9 && this._pendingChoices) {
      const idx = num - 1;
      if (idx < this._pendingChoices.length) {
        this._selectChoice(idx);
      }
    }
  }

  _selectChoice(idx) {
    if (this._choiceCooldown) return;
    this._choiceCooldown = true;
    setTimeout(() => { this._choiceCooldown = false; }, 300);

    if (this._choiceHandler) {
      this._choiceHandler(idx);
      this._choiceHandler = null;
      this._pendingChoices = null;
    }
  }

  // ── Typing Animation ────────────────────────

  async typeText(el, text, speed = 15) {
    return new Promise((resolve) => {
      let i = 0;
      let completed = false;
      el.classList.add('typing-cursor');

      const complete = () => {
        if (completed) return;
        completed = true;
        el.textContent = text;
        el.classList.remove('typing-cursor');
        this._typingAbort = null;
        resolve();
      };

      this._typingAbort = complete;

      const tick = () => {
        if (completed) return;
        if (i < text.length) {
          el.textContent = text.slice(0, i + 1);
          i++;
          setTimeout(tick, speed);
        } else {
          complete();
        }
      };
      tick();
    });
  }

  _completeTyping() {
    if (this._typingAbort) {
      this._typingAbort();
    }
  }

  // ── Screen Renderers ─────────────────────────

  // TITLE
  renderTitle() {
    this.$topBar.innerHTML = '';
    this.$roster.innerHTML = '';
    this.$actionBar.innerHTML = '';
    this.$narrative.innerHTML = '';

    const ascii = `
 _____ _            ___                           _____          _ _
|_   _| |__   ___  / _ \\ _ __ ___  __ _  ___  _ _|_   _| __ __ _(_) |
  | | | '_ \\ / _ \\| | | | '__/ _ \\/ _\` |/ _ \\| '_ \\| || '__/ _\` | | |
  | | | | | |  __/| |_| | | |  __/ (_| | (_) | | | | || | | (_| | | |
  |_| |_| |_|\\___| \\___/|_|  \\___|\\__, |\\___/|_| |_|_||_|  \\__,_|_|_|
                                   |___/
                        ── AI Edition ──`.trim();

    const html = `
      <div class="title-screen">
        <pre class="title-ascii">${this._esc(ascii)}</pre>
        <div class="title-subtitle">Every playthrough is unique. An AI dungeon master generates<br>every event, grounded in real 1848 history.</div>
        <div class="title-rumor" id="title-rumor"></div>
        <div class="title-prompt">[ Press ENTER to embark ]</div>
      </div>
      <div class="title-footer">Built by On-Site Intelligence &mdash; Denver, Colorado</div>
    `;
    this.$narrative.innerHTML = html;

    // Type the rumor if we have one from a previous session
    const rumorEl = document.getElementById('title-rumor');
    if (this.engine.rumor) {
      this.typeText(rumorEl, '"' + this.engine.rumor + '"', 15);
    }

    this._pendingEnter = () => {
      this.engine.transition('PROFESSION');
    };
  }

  // PROFESSION
  renderProfession() {
    this.$topBar.innerHTML = '';
    this.$roster.innerHTML = '';
    this.$actionBar.innerHTML = '';

    this.$narrative.innerHTML = `
      <div class="narrative-block">
        <div class="narrative-title">Choose your profession:</div>
        <div class="narrative-text narrative-dim">Your profession determines your starting funds.</div>
      </div>
      <div class="choices">
        <button class="choice" data-idx="0"><span class="choice-number">[1]</span> Farmer &mdash; $400</button>
        <button class="choice" data-idx="1"><span class="choice-number">[2]</span> Carpenter &mdash; $800</button>
        <button class="choice" data-idx="2"><span class="choice-number">[3]</span> Banker &mdash; $1,600</button>
      </div>
    `;

    const profs = ['farmer', 'carpenter', 'banker'];
    this._pendingChoices = profs;
    this._choiceHandler = (idx) => {
      this.engine.selectProfession(profs[idx]);
    };

    this.$narrative.querySelectorAll('.choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this._selectChoice(idx);
      });
    });
  }

  // NAMES
  renderNames() {
    this.$topBar.innerHTML = '';
    this.$roster.innerHTML = '';
    this.$actionBar.innerHTML = '';
    this.$narrative.innerHTML = '';

    const labels = [
      'What is the name of the wagon leader?',
      'Name companion 1:',
      'Name companion 2:',
      'Name companion 3:',
      'Name companion 4:',
    ];
    const names = [];
    let step = 0;

    const promptNext = () => {
      if (step >= labels.length) {
        this.engine.submitNames(names[0], names.slice(1));
        return;
      }

      const block = document.createElement('div');
      block.className = 'narrative-block';

      if (step > 0 && names[step - 1]) {
        // Show previous answer
        const prev = this.$narrative.querySelector('.active-input');
        if (prev) {
          const input = prev.querySelector('.terminal-input');
          if (input) {
            const span = document.createElement('span');
            span.className = 'terminal-input-done';
            span.textContent = input.value;
            input.replaceWith(span);
          }
          prev.classList.remove('active-input');
        }
      }

      block.className = 'terminal-input-line active-input';
      block.innerHTML = `
        <span class="terminal-prompt">${this._esc(labels[step])}</span>
        <input class="terminal-input" type="text" maxlength="20" autofocus>
      `;
      this.$narrative.appendChild(block);

      const input = block.querySelector('.terminal-input');
      input.focus();

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = input.value.trim();
          if (!val) return;
          // Sanitize: alpha + space only
          const clean = val.replace(/[^a-zA-Z\s]/g, '').slice(0, 20);
          if (!clean) return;
          names.push(clean);
          step++;
          promptNext();
        }
      });

      this._scrollNarrative();
    };

    const intro = document.createElement('div');
    intro.className = 'narrative-block';
    intro.innerHTML = `
      <div class="narrative-title">Name your party</div>
      <div class="narrative-text narrative-dim">Enter the names of your five travelers.</div>
    `;
    this.$narrative.appendChild(intro);

    promptNext();
  }

  // TONE
  renderTone() {
    this.$narrative.innerHTML = `
      <div class="narrative-block">
        <div class="narrative-title">Choose your trail's tone:</div>
        <div class="narrative-text narrative-dim">This determines the intensity of events you'll encounter.</div>
      </div>
      <div class="choices">
        <button class="choice" data-idx="0">
          <span class="choice-number">[1]</span> Classic &mdash; Fresh events, light humor, safe for all ages
        </button>
        <button class="choice" data-idx="1">
          <span class="choice-number">[2]</span> Edgy &mdash; Dark humor, moral gray areas, uncomfortable choices
        </button>
        <button class="choice" data-idx="2">
          <span class="choice-number">[3]</span> Unflinching &mdash; Psychological horror and moral decay
          <div class="narrative-dim" style="margin-top:0.3em;margin-left:3.5ch;font-size:0.85em">
            Contains psychological horror, graphic illness, death, and moral collapse.
          </div>
        </button>
      </div>
    `;

    const tiers = ['low', 'medium', 'high'];
    this._pendingChoices = tiers;
    this._choiceHandler = (idx) => {
      this.engine.selectTone(tiers[idx]);
    };

    this.$narrative.querySelectorAll('.choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this._selectChoice(idx);
      });
    });
  }

  // STORE
  renderStore(data) {
    this.$topBar.innerHTML = '';
    this.$roster.innerHTML = '';

    const money = this.engine.supplies?.money || STARTING_MONEY[this.engine.profession] || 40000;
    const quantities = {};
    const items = Object.keys(STORE_PRICES);
    items.forEach(item => { quantities[item] = 0; });

    const calcTotal = () => {
      let total = 0;
      items.forEach(item => {
        total += quantities[item] * STORE_PRICES[item].price_cents;
      });
      return total;
    };

    const render = () => {
      const spent = calcTotal();
      const remaining = money - spent;

      let rowsHtml = '';
      items.forEach(item => {
        const p = STORE_PRICES[item];
        const cost = quantities[item] * p.price_cents;
        rowsHtml += `
          <div class="store-row" data-item="${item}">
            <span class="store-item-name">${this._esc(item.replace('_', ' '))}</span>
            <span class="store-item-price">${p.unit_label} @ ${this.engine.formatMoney(p.price_cents)}</span>
            <div class="store-qty-controls">
              <button class="store-qty-btn" data-item="${item}" data-dir="-1">&minus;</button>
              <span class="store-qty" id="qty-${item}">${quantities[item]}</span>
              <button class="store-qty-btn" data-item="${item}" data-dir="1">+</button>
            </div>
            <span class="store-item-cost">${cost > 0 ? this.engine.formatMoney(cost) : ''}</span>
            <span class="store-tooltip">${this._esc(p.tooltip)}</span>
          </div>
        `;
      });

      this.$narrative.innerHTML = `
        <div class="narrative-block">
          <div class="narrative-title">Matt's General Store, Independence, Missouri</div>
          <div class="narrative-text narrative-dim">
            Starting funds: ${this.engine.formatMoney(money)}
            ${data?.rumor ? '<br><em>"' + this._esc(data.rumor) + '"</em>' : ''}
          </div>
        </div>
        <div class="store-grid">${rowsHtml}</div>
        <div class="store-total">
          <span>Remaining: ${this.engine.formatMoney(remaining)}</span>
          <span>Spent: ${this.engine.formatMoney(spent)}</span>
        </div>
        <div class="choices">
          <button class="choice" id="store-recommended"><span class="choice-number">[R]</span> Buy recommended supplies</button>
          <button class="choice" id="store-depart"><span class="choice-number">[D]</span> Depart for Oregon</button>
        </div>
      `;

      // Wire up +/- buttons
      this.$narrative.querySelectorAll('.store-qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = btn.dataset.item;
          const dir = parseInt(btn.dataset.dir);
          const newQty = quantities[item] + dir;
          if (newQty < 0) return;

          // Check if affordable
          const testQty = { ...quantities, [item]: newQty };
          let testTotal = 0;
          items.forEach(i => { testTotal += testQty[i] * STORE_PRICES[i].price_cents; });
          if (testTotal > money) return;

          quantities[item] = newQty;
          render();
        });
      });

      // Recommended button
      const recBtn = document.getElementById('store-recommended');
      if (recBtn) {
        recBtn.addEventListener('click', () => {
          const rec = RECOMMENDED_PURCHASES[this.engine.profession] || RECOMMENDED_PURCHASES.farmer;
          Object.assign(quantities, rec);
          // Validate can afford
          if (calcTotal() > money) {
            // Scale down
            while (calcTotal() > money) {
              for (const item of items) {
                if (quantities[item] > 0 && calcTotal() > money) {
                  quantities[item]--;
                }
              }
            }
          }
          render();
        });
      }

      // Depart button
      const departBtn = document.getElementById('store-depart');
      if (departBtn) {
        departBtn.addEventListener('click', () => {
          const purchases = [];
          items.forEach(item => {
            if (quantities[item] > 0) {
              purchases.push({ item, quantity: quantities[item] });
            }
          });
          this.engine.purchaseSupplies(purchases);
        });
      }
    };

    // Handle keyboard navigation
    this._storeKeyHandler = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        document.getElementById('store-recommended')?.click();
      } else if (e.key === 'd' || e.key === 'D') {
        document.getElementById('store-depart')?.click();
      }
    };
    document.addEventListener('keydown', this._storeKeyHandler);

    render();
  }

  // TRAVEL
  renderTravel() {
    // Clean up store key handler if present
    if (this._storeKeyHandler) {
      document.removeEventListener('keydown', this._storeKeyHandler);
      this._storeKeyHandler = null;
    }

    this._clearLoading();
    this._updateTopBar();
    this._updateRoster();
    this._updateActionBar();

    // Don't clear narrative — let day summaries accumulate
    // But limit scroll history
    const blocks = this.$narrative.querySelectorAll('.narrative-block, .day-summary');
    if (blocks.length > 50) {
      for (let i = 0; i < blocks.length - 30; i++) {
        blocks[i].remove();
      }
    }

    // Auto-advance
    setTimeout(() => this.engine.advance(), 100);
  }

  // EVENT
  async renderEvent(eventData) {
    this._clearLoading();
    this._updateTopBar();
    this._updateRoster();
    this.$actionBar.innerHTML = '';

    if (!eventData) return;

    // Add separator
    const sep = document.createElement('div');
    sep.className = 'narrative-separator';
    sep.textContent = '\u2500'.repeat(40);
    this.$narrative.appendChild(sep);

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'narrative-block';
    titleEl.innerHTML = `<div class="narrative-title">${this._esc(eventData.title)}</div>`;
    this.$narrative.appendChild(titleEl);

    // Description with typing
    const descEl = document.createElement('div');
    descEl.className = 'narrative-block narrative-text';
    this.$narrative.appendChild(descEl);
    this._scrollNarrative();

    await this.typeText(descEl, eventData.description, 15);

    // Choices appear ALL AT ONCE after description
    if (eventData.choices && eventData.choices.length > 0) {
      const choicesDiv = document.createElement('div');
      choicesDiv.className = 'choices';

      eventData.choices.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.dataset.idx = i;
        btn.innerHTML = `<span class="choice-number">[${i + 1}]</span> ${this._esc(c.label)}`;
        btn.addEventListener('click', () => this._selectChoice(i));
        choicesDiv.appendChild(btn);
      });

      this.$narrative.appendChild(choicesDiv);
      this._scrollNarrative();

      this._pendingChoices = eventData.choices;
      this._choiceHandler = (idx) => {
        // Disable all choice buttons
        choicesDiv.querySelectorAll('.choice').forEach(b => {
          b.classList.add('disabled');
          b.disabled = true;
        });
        this.engine.makeChoice(idx);
      };

      // Agency-steal at High tier
      this._checkAgencySteal(eventData, choicesDiv);
    }
  }

  _checkAgencySteal(eventData, choicesDiv) {
    const gs = this.engine.gameState;
    if (!gs || gs.settings.tone_tier !== 'high') return;

    // Find any living member with sanity < 30
    const brokenMember = gs.party.members.find(m => m.alive && m.sanity < 30);
    if (!brokenMember) return;

    // 3-second timer, then auto-select
    this._agencyStealTimer = setTimeout(() => {
      // Pick a random choice (weighted toward destructive ones)
      const idx = Math.floor(Math.random() * eventData.choices.length);

      // Show the steal message
      const stealMsg = document.createElement('div');
      stealMsg.className = 'narrative-block';
      stealMsg.innerHTML = `<div class="narrative-text"><em>Before you can decide, ${this._esc(brokenMember.name)} steps forward\u2014</em></div>`;
      this.$narrative.appendChild(stealMsg);
      this._scrollNarrative();

      // Highlight the stolen choice
      const btns = choicesDiv.querySelectorAll('.choice');
      btns.forEach((b, i) => {
        if (i === idx) {
          b.style.background = 'var(--critical)';
          b.style.color = 'var(--bg)';
        }
      });

      // Execute after a beat
      setTimeout(() => {
        this._selectChoice(idx);
      }, 800);
    }, 3000);
  }

  _clearAgencySteal() {
    if (this._agencyStealTimer) {
      clearTimeout(this._agencyStealTimer);
      this._agencyStealTimer = null;
    }
  }

  // LANDMARK
  renderLandmark(data) {
    this._clearLoading();
    this._updateTopBar();
    this._updateRoster();
    this.$actionBar.innerHTML = '';

    if (!data) {
      this.engine.resolveLandmark('continue');
      return;
    }

    const sep = document.createElement('div');
    sep.className = 'narrative-separator';
    sep.textContent = '\u2500'.repeat(40);
    this.$narrative.appendChild(sep);

    let html = `
      <div class="narrative-block">
        <div class="narrative-title">${this._esc(data.name || 'Landmark')}</div>
        <div class="narrative-text">${this._esc(data.description || '')}</div>
    `;

    if (data.diary_quote) {
      html += `<div class="narrative-italic">"${this._esc(data.diary_quote)}"</div>`;
      if (data.diary_source) {
        html += `<div class="narrative-dim" style="font-size:0.8em">&mdash; ${this._esc(data.diary_source)}</div>`;
      }
    }

    html += '</div>';

    const block = document.createElement('div');
    block.innerHTML = html;
    this.$narrative.appendChild(block);

    // Options
    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices';
    const options = [
      { label: 'Rest here', action: 'rest' },
      { label: 'Look for trade', action: 'trade' },
      { label: 'Continue on the trail', action: 'continue' },
    ];

    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.innerHTML = `<span class="choice-number">[${i + 1}]</span> ${this._esc(opt.label)}`;
      btn.addEventListener('click', () => this._selectChoice(i));
      choicesDiv.appendChild(btn);
    });

    this.$narrative.appendChild(choicesDiv);
    this._scrollNarrative();

    this._pendingChoices = options;
    this._choiceHandler = (idx) => {
      choicesDiv.querySelectorAll('.choice').forEach(b => {
        b.classList.add('disabled');
        b.disabled = true;
      });
      this.engine.resolveLandmark(options[idx].action);
    };
  }

  // RIVER
  renderRiver(data) {
    this._clearLoading();
    this._updateTopBar();
    this._updateRoster();
    this.$actionBar.innerHTML = '';

    if (!data) {
      this.engine.resolveRiver('ford');
      return;
    }

    const sep = document.createElement('div');
    sep.className = 'narrative-separator';
    sep.textContent = '\u2500'.repeat(40);
    this.$narrative.appendChild(sep);

    const difficulty = data.ford_difficulty || 3;
    const difficultyText = ['Easy', 'Manageable', 'Moderate', 'Dangerous', 'Extremely dangerous'][difficulty - 1] || 'Unknown';

    let html = `
      <div class="narrative-block">
        <div class="narrative-title">River Crossing: ${this._esc(data.name || 'Unknown River')}</div>
        <div class="narrative-text">
          Width: ${data.width_ft || '?'} ft &middot; Fording difficulty: ${this._esc(difficultyText)}
        </div>
      </div>
    `;

    const block = document.createElement('div');
    block.innerHTML = html;
    this.$narrative.appendChild(block);

    const options = [];
    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices';

    // Ford
    const fordBtn = document.createElement('button');
    fordBtn.className = 'choice';
    const fordWarn = difficulty >= 4 ? ' (DANGEROUS)' : '';
    fordBtn.innerHTML = `<span class="choice-number">[1]</span> Ford the river${fordWarn}`;
    fordBtn.addEventListener('click', () => {
      if (difficulty >= 4) {
        if (!confirm('The river is dangerous to ford. Are you sure?')) return;
      }
      this._selectChoice(0);
    });
    choicesDiv.appendChild(fordBtn);
    options.push('ford');

    // Caulk
    const caulkBtn = document.createElement('button');
    caulkBtn.className = 'choice';
    caulkBtn.innerHTML = '<span class="choice-number">[2]</span> Caulk the wagon and float';
    caulkBtn.addEventListener('click', () => this._selectChoice(1));
    choicesDiv.appendChild(caulkBtn);
    options.push('caulk');

    // Ferry
    if (data.ferry_available) {
      const ferryCost = data.ferry_cost_1848_dollars || 0;
      const ferryBtn = document.createElement('button');
      ferryBtn.className = 'choice';
      const canAfford = this.engine.supplies && this.engine.supplies.money >= ferryCost * 100;
      if (!canAfford) {
        ferryBtn.classList.add('disabled');
      }
      ferryBtn.innerHTML = `<span class="choice-number">[3]</span> Take the ferry ($${ferryCost})${!canAfford ? ' - Cannot afford' : ''}`;
      ferryBtn.addEventListener('click', () => {
        if (!canAfford) return;
        this._selectChoice(2);
      });
      choicesDiv.appendChild(ferryBtn);
      options.push('ferry');
    }

    this.$narrative.appendChild(choicesDiv);
    this._scrollNarrative();

    this._pendingChoices = options;
    this._choiceHandler = (idx) => {
      choicesDiv.querySelectorAll('.choice').forEach(b => {
        b.classList.add('disabled');
        b.disabled = true;
      });
      this.engine.resolveRiver(options[idx]);
    };
  }

  // DEATH
  async renderDeath(data) {
    this._clearLoading();
    this.$actionBar.innerHTML = '';
    this._updateRoster();

    if (!data) {
      this._pendingEnter = () => this.engine.transition('TRAVEL');
      return;
    }

    const sep = document.createElement('div');
    sep.className = 'narrative-separator';
    sep.textContent = '\u2500'.repeat(40);
    this.$narrative.appendChild(sep);

    const block = document.createElement('div');
    block.className = 'death-screen';

    block.innerHTML = `
      <div class="death-separator">\u2500\u2500\u2500 \u2020 \u2500\u2500\u2500</div>
      <div class="death-name">${this._esc(data.name || 'Unknown')}</div>
      <div class="narrative-dim">${this._esc(data.date || '')} &middot; ${this._esc(data.cause || '')}</div>
      <div class="death-epitaph" id="death-epitaph"></div>
      <div class="death-separator">\u2500\u2500\u2500 \u2020 \u2500\u2500\u2500</div>
    `;

    this.$narrative.appendChild(block);
    this._scrollNarrative();

    // Type epitaph slowly
    const epitaphEl = document.getElementById('death-epitaph');
    if (data.epitaph && epitaphEl) {
      await this.typeText(epitaphEl, data.epitaph, 25);
    }

    // Share button
    const shareDiv = document.createElement('div');
    shareDiv.className = 'share-buttons';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'share-btn';
    copyBtn.textContent = 'Copy epitaph';
    copyBtn.addEventListener('click', () => {
      const text = `${data.name}\n${data.date}\n\n${data.epitaph || ''}\n\n-- The Oregon Trail AI Edition`;
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy epitaph'; }, 2000);
      });
    });
    shareDiv.appendChild(copyBtn);
    this.$narrative.appendChild(shareDiv);

    // Continue prompt
    const continueDiv = document.createElement('div');
    continueDiv.className = 'narrative-block narrative-dim';
    continueDiv.textContent = 'Press ENTER to continue.';
    this.$narrative.appendChild(continueDiv);
    this._scrollNarrative();

    this._pendingEnter = () => {
      this.engine.transition('TRAVEL');
    };
  }

  // ARRIVAL
  renderArrival() {
    this._clearLoading();
    this.$actionBar.innerHTML = '';
    this._updateRoster();

    const gs = this.engine.gameState;
    const survivors = this.engine.aliveMembers;
    const total = gs?.party?.members?.length || 5;
    const leader = gs?.party?.leader_name || 'Unknown';

    // Calculate a simple score
    const survivorBonus = survivors.length * 500;
    const supplyBonus = gs ? Math.floor(
      (gs.supplies.food + gs.supplies.ammo + gs.supplies.clothing * 10 +
       gs.supplies.spare_parts * 5 + gs.supplies.medicine * 3 + gs.supplies.money / 100) / 10
    ) : 0;
    const profMulti = this.engine.profession === 'farmer' ? 3 : this.engine.profession === 'carpenter' ? 2 : 1;
    const score = (survivorBonus + supplyBonus) * profMulti;

    let html = `
      <div class="arrival-screen">
        <div class="narrative-separator">\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550</div>
        <div class="arrival-title">Oregon City, Willamette Valley</div>
        <div class="narrative-text">
          After ${this.engine.milesTraveled} miles, the ${this._esc(leader)} party
          has reached the end of the Oregon Trail.
        </div>
        <div class="arrival-survivors">
          <div class="narrative-dim">Survivors: ${survivors.length} of ${total}</div>
    `;

    survivors.forEach(m => {
      html += `<div>${this._esc(m.name)} &mdash; Health: ${m.health}%</div>`;
    });

    if (this.engine.deaths.length > 0) {
      html += '<div class="narrative-dim" style="margin-top:0.5em">Lost on the trail:</div>';
      this.engine.deaths.forEach(d => {
        html += `<div class="narrative-dim">${this._esc(d.name)} &mdash; ${this._esc(d.cause)} (${this._esc(d.date)})</div>`;
      });
    }

    html += `
        </div>
        <div class="arrival-score">Final Score: ${score.toLocaleString()}</div>
        <div class="narrative-separator">\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550</div>
      </div>
    `;

    const block = document.createElement('div');
    block.innerHTML = html;
    this.$narrative.appendChild(block);

    // Generate newspaper button
    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices';
    const newsBtn = document.createElement('button');
    newsBtn.className = 'choice';
    newsBtn.innerHTML = '<span class="choice-number">[1]</span> Read the newspaper account';
    newsBtn.addEventListener('click', () => {
      this.engine.generateNewspaper();
    });
    choicesDiv.appendChild(newsBtn);
    this.$narrative.appendChild(choicesDiv);
    this._scrollNarrative();

    this._pendingChoices = ['newspaper'];
    this._choiceHandler = () => {
      this.engine.generateNewspaper();
    };
  }

  // WIPE
  renderWipe() {
    this._clearLoading();
    this.$actionBar.innerHTML = '';
    this._updateRoster();

    const gs = this.engine.gameState;
    const leader = gs?.party?.leader_name || 'Unknown';

    let html = `
      <div class="death-screen">
        <div class="death-separator">\u2500\u2500\u2500 \u2020 \u2500\u2500\u2500</div>
        <div class="death-name">The ${this._esc(leader)} Party</div>
        <div class="narrative-dim">has perished on the Oregon Trail</div>
        <div class="narrative-text" style="margin-top:1em">
          ${this.engine.milesTraveled} miles from Independence, Missouri.
          The trail has claimed another wagon.
        </div>
        <div class="death-separator">\u2500\u2500\u2500 \u2020 \u2500\u2500\u2500</div>
      </div>
    `;

    const block = document.createElement('div');
    block.innerHTML = html;
    this.$narrative.appendChild(block);

    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices';
    const newsBtn = document.createElement('button');
    newsBtn.className = 'choice';
    newsBtn.innerHTML = '<span class="choice-number">[1]</span> Read the newspaper account';
    newsBtn.addEventListener('click', () => {
      this.engine.generateNewspaper();
    });
    choicesDiv.appendChild(newsBtn);
    this.$narrative.appendChild(choicesDiv);
    this._scrollNarrative();

    this._pendingChoices = ['newspaper'];
    this._choiceHandler = () => {
      this.engine.generateNewspaper();
    };
  }

  // NEWSPAPER
  renderNewspaper(data) {
    this._clearLoading();
    if (typeof renderNewspaper === 'function') {
      renderNewspaper(this.$newspaper, data, this.engine);
      this.$newspaper.classList.remove('hidden');
    }
  }

  // SHARE
  renderShare() {
    this.$newspaper.classList.add('hidden');
    this.$actionBar.innerHTML = '';

    const gs = this.engine.gameState;
    const survivors = this.engine.aliveMembers;
    const leader = gs?.party?.leader_name || 'Unknown';
    const arrived = survivors.length > 0;

    const shareText = arrived
      ? `My party of 5 made it to Oregon with ${survivors.length} survivors in The Oregon Trail AI Edition. Every playthrough is unique.`
      : `My entire party perished on the Oregon Trail AI Edition. The trail spares no one. Every playthrough is unique.`;

    const shareUrl = window.location.origin;

    let html = `
      <div class="narrative-block" style="text-align:center;padding:2ch 0">
        <div class="narrative-title">Share your journey</div>
        <div class="share-buttons">
          <button class="share-btn" id="share-twitter">Share on Twitter</button>
          <button class="share-btn" id="share-reddit">Share on Reddit</button>
          <button class="share-btn" id="share-copy">Copy link</button>
          <button class="share-btn" id="share-replay">Play again</button>
        </div>
      </div>
    `;

    const block = document.createElement('div');
    block.innerHTML = html;
    this.$narrative.appendChild(block);
    this._scrollNarrative();

    document.getElementById('share-twitter')?.addEventListener('click', () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank');
    });

    document.getElementById('share-reddit')?.addEventListener('click', () => {
      const url = `https://reddit.com/submit?title=${encodeURIComponent('The Oregon Trail — AI Edition')}&url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank');
    });

    document.getElementById('share-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = document.getElementById('share-copy');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy link'; }, 2000); }
      });
    });

    document.getElementById('share-replay')?.addEventListener('click', () => {
      this.engine.restart();
    });
  }

  // ── Top Bar ──────────────────────────────────

  _updateTopBar() {
    const gs = this.engine.gameState;
    if (!gs) {
      this.$topBar.innerHTML = '';
      return;
    }

    let html = `
      <span class="top-bar-item"><span class="top-bar-label">Date:</span> ${this._esc(this.engine.formatDate(gs.position.date))}</span>
      <span class="top-bar-item"><span class="top-bar-label">Miles:</span> ${gs.position.miles_traveled}</span>
      <span class="top-bar-item"><span class="top-bar-label">Food:</span> ${gs.supplies.food} lbs</span>
    `;

    // Mobile compact roster
    html += '<div class="roster-compact">';
    gs.party.members.forEach(m => {
      const cls = !m.alive ? 'dead' : '';
      let pipCls = 'health-pip';
      if (!m.alive) pipCls += ' dead';
      else if (m.health < 25) pipCls += ' critical';
      else if (m.health < 50) pipCls += ' low';
      html += `<span class="roster-compact-member ${cls}">${this._esc(m.name)}<span class="${pipCls}"></span></span>`;
    });
    html += '</div>';

    this.$topBar.innerHTML = html;
  }

  // ── Roster ───────────────────────────────────

  _updateRoster() {
    const gs = this.engine.gameState;
    if (!gs) {
      this.$roster.innerHTML = '';
      return;
    }

    let html = '<div class="roster-header">Party</div>';

    gs.party.members.forEach(m => {
      const nameClass = m.alive ? '' : ' dead';
      const healthPct = m.health;
      let fillClass = 'health-fill';
      if (healthPct < 25) fillClass += ' critical';
      else if (healthPct < 50) fillClass += ' low';

      html += `<div class="roster-member">`;
      html += `<span class="roster-name${nameClass}">${this._esc(m.name)}</span>`;

      if (m.alive) {
        html += `<div class="health-bar"><span class="${fillClass}" style="width:${healthPct}%"></span></div>`;
        // Show disease if present
        if (m.disease) {
          html += `<span class="roster-stats">${this._esc(m.disease.id)}</span>`;
        }
        // Show low sanity indicator at high tier
        if (gs.settings.tone_tier === 'high' && m.sanity < 50) {
          html += `<span class="roster-stats" style="color:var(--critical)">sanity: ${m.sanity}</span>`;
        }
      } else {
        // Find death record
        const death = gs.deaths.find(d => d.name === m.name);
        if (death) {
          html += `<span class="roster-death-date">${this._esc(death.date)} - ${this._esc(death.cause)}</span>`;
        }
      }

      html += '</div>';
    });

    // Supplies summary
    html += `
      <div class="roster-header" style="margin-top:1em">Supplies</div>
      <div class="roster-stats" style="display:block">
        <div>Food: ${gs.supplies.food} lbs</div>
        <div>Ammo: ${gs.supplies.ammo}</div>
        <div>Clothes: ${gs.supplies.clothing}</div>
        <div>Parts: ${gs.supplies.spare_parts}</div>
        <div>Medicine: ${gs.supplies.medicine}</div>
        <div>Money: ${this.engine.formatMoney(gs.supplies.money)}</div>
        <div>Oxen: ${gs.supplies.oxen}</div>
      </div>
    `;

    this.$roster.innerHTML = html;
  }

  // ── Action Bar ───────────────────────────────

  _updateActionBar() {
    const gs = this.engine.gameState;
    if (!gs || this.engine.state !== 'TRAVEL') {
      this.$actionBar.innerHTML = '';
      return;
    }

    const currentPace = this.engine.pendingPace || gs.settings.pace;
    const currentRations = this.engine.pendingRations || gs.settings.rations;

    const paces = ['steady', 'strenuous', 'grueling'];
    const rations = ['filling', 'meager', 'bare_bones'];

    let paceHtml = paces.map(p =>
      `<button class="action-btn${p === currentPace ? ' active' : ''}" data-pace="${p}">${p}</button>`
    ).join('');

    let rationHtml = rations.map(r =>
      `<button class="action-btn${r === currentRations ? ' active' : ''}" data-ration="${r}">${r.replace('_', ' ')}</button>`
    ).join('');

    this.$actionBar.innerHTML = `
      <div class="action-controls">
        <div class="action-group">
          <span class="action-label">Pace:</span>
          ${paceHtml}
        </div>
        <div class="action-group">
          <span class="action-label">Rations:</span>
          ${rationHtml}
        </div>
      </div>
    `;

    this.$actionBar.querySelectorAll('[data-pace]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.engine.changePace(btn.dataset.pace);
        this._updateActionBar();
      });
    });

    this.$actionBar.querySelectorAll('[data-ration]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.engine.changeRations(btn.dataset.ration);
        this._updateActionBar();
      });
    });
  }

  // ── Utility ──────────────────────────────────

  _scrollNarrative() {
    this.$narrative.scrollTop = this.$narrative.scrollHeight;
  }

  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
