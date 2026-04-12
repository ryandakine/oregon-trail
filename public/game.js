/* ═══════════════════════════════════════════════════
   Oregon Trail AI — Game Engine
   Display layer only. Server handles all simulation.
   ═══════════════════════════════════════════════════ */

// ── Store Prices (mirrors worker/src/state.ts) ───

const STORE_PRICES = {
  food:        { price_cents: 30,   unit_amount: 10, unit_label: '10 lbs',    tooltip: '200 lbs per person for the full journey' },
  oxen:        { price_cents: 5000, unit_amount: 2,  unit_label: '1 yoke (2)', tooltip: '6 minimum (3 yoke) to pull a loaded wagon' },
  clothing:    { price_cents: 300,  unit_amount: 1,  unit_label: '1 set',     tooltip: 'Essential for mountain crossings' },
  ammo:        { price_cents: 200,  unit_amount: 20, unit_label: '20 rounds', tooltip: 'For hunting and defense' },
  spare_parts: { price_cents: 200,  unit_amount: 1,  unit_label: '1 part',    tooltip: 'Broken axles and tongues can strand you' },
  medicine:    { price_cents: 100,  unit_amount: 3,  unit_label: '3 doses',   tooltip: 'Reduces disease mortality by half' },
};

const STARTING_MONEY = {
  farmer: 400_00,
  carpenter: 800_00,
  banker: 1600_00,
};

const RECOMMENDED_PURCHASES = {
  farmer:    { food: 20, oxen: 2, clothing: 5, ammo: 5, spare_parts: 2, medicine: 2 },
  carpenter: { food: 30, oxen: 2, clothing: 5, ammo: 8, spare_parts: 3, medicine: 3 },
  banker:    { food: 40, oxen: 3, clothing: 5, ammo: 10, spare_parts: 4, medicine: 5 },
};

// ── Micro-flavor text pools ──────────────────────

const TRAIL_FLAVOR = {
  prairie: [
    'The grass sea stretches unbroken to the horizon.',
    'Prairie dogs watch from their mounds as the wagon passes.',
    'Wind bends the bluestem flat against the earth.',
    'A hawk circles lazily overhead.',
    'The wagon wheels leave twin furrows in the virgin sod.',
  ],
  river_valley: [
    'Cottonwoods line the banks, their leaves catching the light.',
    'The river murmurs beside the trail.',
    'Mosquitoes rise in clouds from the standing water.',
    'Willows trail their fingers in the current.',
  ],
  bluffs: [
    'The bluffs rise like broken teeth against the sky.',
    'Erosion has carved strange shapes in the sandstone.',
    'The trail narrows between walls of pale rock.',
  ],
  high_plains: [
    'Nothing moves on the high plains but dust.',
    'The air is thin and dry. Lips crack.',
    'Antelope watch from a ridge, then vanish.',
    'The sky is enormous here.',
  ],
  mountains: [
    'The grade steepens. The oxen labor.',
    'Pine forests close in around the trail.',
    'Snow lingers in the north-facing draws.',
    'Rock cairns mark where others have passed.',
  ],
  desert: [
    'Alkali dust coats everything white.',
    'The water barrel is running low.',
    'Sagebrush and silence.',
    'Bones of oxen bleach beside the trail.',
  ],
  forest: [
    'Douglas fir towers overhead, blocking the sun.',
    'The trail is soft with fallen needles.',
    'A creek runs clear over mossy stones.',
  ],
  canyon: [
    'The canyon walls echo every sound back.',
    'The trail switchbacks down the rocky grade.',
    'Loose scree clatters under the wheels.',
  ],
};

const WEATHER_FLAVOR = {
  clear: ['Clear skies and fair weather.', 'The sun beats down on the train.'],
  cloudy: ['Clouds pile up along the horizon.', 'Overcast skies keep the heat down.'],
  rain: ['Rain drums on the wagon canvas.', 'The trail turns to mud.', 'Everyone huddles under wet blankets.'],
  storm: ['Thunder rolls across the plains.', 'Lightning splits the sky.', 'The oxen are uneasy in the storm.'],
  snow: ['Snow falls silently on the trail.', 'The world goes white and quiet.'],
  dust: ['Dust fills the air thick enough to taste.', 'Handkerchiefs over mouths.'],
};

// ── GameEngine Class ─────────────────────────────

class GameEngine {
  constructor() {
    this.state = 'TITLE';
    this.signedState = null;
    this.currentEvent = null;
    this.rumor = null;
    this.listeners = {};
    this.apiBase = 'https://oregon-trail-api.trails710.workers.dev';
    this.fullJournal = [];
    this.profession = null;
    this.leaderName = null;
    this.memberNames = null;
    this.pendingPace = null;
    this.pendingRations = null;
    this._advancePaused = false;
  }

  // ── Event Emitter ────────────────────────────

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(fn => fn(data));
  }

  // ── State Machine ────────────────────────────

  async init() {
    // Restore journal from localStorage if present
    try {
      const saved = localStorage.getItem('ot_journal');
      if (saved) this.fullJournal = JSON.parse(saved);
    } catch (_) { /* ignore */ }
    this.transition('TITLE');
  }

  transition(to, data) {
    const from = this.state;
    this.state = to;
    this.emit('stateChange', { from, to, data });
  }

  // ── API Helpers ──────────────────────────────

  async api(endpoint, body) {
    const res = await fetch(this.apiBase + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' }));
      throw new Error(err.error || `api_error_${res.status}`);
    }
    return res.json();
  }

  // ── Game State Accessors ─────────────────────

  get gameState() {
    return this.signedState?.state || null;
  }

  get party() {
    return this.gameState?.party || null;
  }

  get supplies() {
    return this.gameState?.supplies || null;
  }

  get position() {
    return this.gameState?.position || null;
  }

  get settings() {
    return this.gameState?.settings || null;
  }

  get deaths() {
    return this.gameState?.deaths || [];
  }

  get aliveMembers() {
    return (this.party?.members || []).filter(m => m.alive);
  }

  get deadMembers() {
    return (this.party?.members || []).filter(m => !m.alive);
  }

  get currentDate() {
    return this.position?.date || '1848-04-15';
  }

  get milesTraveled() {
    return this.position?.miles_traveled || 0;
  }

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  formatMoney(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  // ── Actions ──────────────────────────────────

  selectProfession(p) {
    this.profession = p;
    this.transition('NAMES');
  }

  submitNames(leader, members) {
    this.leaderName = leader;
    this.memberNames = members;
    this.transition('TONE');
  }

  async selectTone(tier) {
    this.emit('loading', true);
    try {
      const res = await this.api('/api/start', {
        leader_name: this.leaderName,
        member_names: this.memberNames,
        profession: this.profession,
        tone_tier: tier,
      });
      this.signedState = res.signed_state;
      this.rumor = res.rumor || null;
      this.fullJournal = [];
      localStorage.removeItem('ot_journal');
      this.emit('loading', false);
      this.transition('STORE', { rumor: this.rumor });
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
  }

  async purchaseSupplies(purchases) {
    this.emit('loading', true);
    try {
      const res = await this.api('/api/store', {
        signed_state: this.signedState,
        purchases,
      });
      this.signedState = res.signed_state;
      this.emit('loading', false);
      this.transition('TRAVEL');
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
  }

  async advance() {
    if (this._advancePaused || this._advancing) return;
    this._advancing = true;
    this.emit('loading', true);
    try {
      const body = { signed_state: this.signedState };
      if (this.pendingPace) body.pace = this.pendingPace;
      if (this.pendingRations) body.rations = this.pendingRations;

      const res = await this.api('/api/advance', body);
      this.signedState = res.signed_state;
      this.pendingPace = null;
      this.pendingRations = null;

      // Save journal entries to local backup
      if (res.summaries) {
        for (const summary of res.summaries) {
          for (const evt of (summary.events || [])) {
            this.fullJournal.push(evt);
          }
        }
        localStorage.setItem('ot_journal', JSON.stringify(this.fullJournal));
      }

      this.emit('loading', false);
      this.emit('daysAdvanced', {
        summaries: res.summaries || [],
        days: res.days_advanced || 0,
      });

      // Handle trigger
      switch (res.trigger) {
        case 'event':
          this.currentEvent = res.trigger_data;
          this.transition('EVENT', res.trigger_data);
          break;
        case 'landmark':
          this.transition('LANDMARK', res.trigger_data);
          break;
        case 'river':
          this.currentRiver = res.trigger_data;
          this.transition('RIVER', res.trigger_data);
          break;
        case 'death':
          this.transition('DEATH', res.trigger_data);
          break;
        case 'arrival':
          this.transition('ARRIVAL');
          break;
        case 'wipe':
          this.transition('WIPE');
          break;
        default:
          // No trigger — auto-advance after display delay
          this._scheduleNextAdvance(res.summaries);
          break;
      }
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    } finally {
      this._advancing = false;
    }
  }

  _scheduleNextAdvance(summaries) {
    // Calculate display time based on content
    const hasEvents = summaries && summaries.some(s => s.events && s.events.length > 0);
    const delay = hasEvents ? 400 : 200;
    setTimeout(() => this.advance(), delay);
  }

  async makeChoice(choiceIndex) {
    this.emit('loading', true);
    try {
      const res = await this.api('/api/choice', {
        signed_state: this.signedState,
        event: this.currentEvent,
        choice_index: choiceIndex,
      });
      this.signedState = res.signed_state;
      this.currentEvent = null;
      this.emit('loading', false);
      this.transition('TRAVEL');
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
  }

  async resolveRiver(choice) {
    if (!this.currentRiver) {
      this.transition('TRAVEL');
      return;
    }
    this.emit('loading', true);
    try {
      const res = await this.api('/api/river', {
        signed_state: this.signedState,
        crossing_id: this.currentRiver.id,
        choice,
      });
      this.signedState = res.signed_state;
      this.currentRiver = null;
      this.emit('loading', false);
      this.emit('riverResolved', { narrative: res.narrative, choice });
      this.transition('TRAVEL');
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
  }

  async resolveLandmark(action) {
    // Landmark actions: rest, trade, continue
    // For MVP, just resume travel
    this.transition('TRAVEL');
  }

  async generateNewspaper() {
    this.emit('loading', true);
    try {
      const res = await this.api('/api/newspaper', {
        signed_state: this.signedState,
        full_journal: this.fullJournal,
      });
      this.emit('loading', false);
      this.transition('NEWSPAPER', res);
    } catch (e) {
      this.emit('loading', false);
      // Generate a local fallback newspaper
      this.transition('NEWSPAPER', this._fallbackNewspaper());
    }
  }

  _fallbackNewspaper() {
    const survivors = this.aliveMembers;
    const leader = this.party?.leader_name || 'Unknown';
    const total = this.party?.members?.length || 5;
    const arrived = this.state === 'ARRIVAL' || this.state === 'NEWSPAPER';

    return {
      newspaper_name: 'The Independence Gazette',
      date: this.currentDate,
      headline: arrived
        ? `${leader.toUpperCase()} PARTY REACHES OREGON CITY`
        : `${leader.toUpperCase()} PARTY LOST ON THE TRAIL`,
      byline: 'From our correspondent on the Oregon Trail',
      article_paragraphs: [
        arrived
          ? `The wagon party led by ${leader} has arrived in the Willamette Valley after a journey of ${this.milesTraveled} miles. ${survivors.length} of the original ${total} members survived the crossing.`
          : `Word has reached Independence that the wagon party led by ${leader} has been lost on the trail, some ${this.milesTraveled} miles from their departure. None are expected to reach Oregon City.`,
        'The trail continues to test the resolve of all who dare its passage.',
      ],
      survivors: survivors.map(m => m.name),
      deaths: this.deaths,
    };
  }

  changePace(pace) {
    this.pendingPace = pace;
    this.emit('settingsChanged', { pace });
  }

  changeRations(rations) {
    this.pendingRations = rations;
    this.emit('settingsChanged', { rations });
  }

  pauseAdvance() {
    this._advancePaused = true;
  }

  resumeAdvance() {
    this._advancePaused = false;
  }

  restart() {
    this.signedState = null;
    this.currentEvent = null;
    this.rumor = null;
    this.fullJournal = [];
    this.profession = null;
    this.leaderName = null;
    this.memberNames = null;
    this.pendingPace = null;
    this.pendingRations = null;
    this._advancePaused = false;
    localStorage.removeItem('ot_journal');
    this.transition('TITLE');
  }
}
