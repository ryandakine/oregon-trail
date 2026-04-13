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

// ── Weekly Challenge Info (mirrors server) ───────
const CHALLENGE_INFO = {
  half_rations: { name: 'Half Rations', desc: 'Start with 50% less money. Budget wisely.' },
  speed_run: { name: 'Speed Run', desc: 'Grueling pace only. No slowing down.' },
  pacifist: { name: 'Pacifist Run', desc: 'No ammunition. No hunting. Live off the land.' },
  bare_bones: { name: 'Bare Bones', desc: 'Bare bones rations only. Every pound counts.' },
  nightmare: { name: 'Nightmare Trail', desc: 'Psychological horror tier forced. The trail shows no mercy.' },
  penny_pinch: { name: 'Penny Pincher', desc: 'Start with only 25% of normal funds.' },
  starvation_march: { name: 'Starvation March', desc: 'Grueling pace, meager rations. Pure survival.' },
  iron_man: { name: 'Iron Man', desc: 'No medicine allowed. Pray you stay healthy.' },
  rich_fool: { name: 'Rich Fool', desc: 'Banker funds, but horror tier forced.' },
  minimalist: { name: 'Minimalist', desc: '60% money, no spare parts.' },
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

// ── Daily Trail (Wordle-style daily seed) ────────

const DAILY_EPOCH = new Date('2026-04-13T00:00:00Z');

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getDailyTrailNumber() {
  return Math.floor((Date.now() - DAILY_EPOCH.getTime()) / 86400000) + 1;
}

function getDailySeed() {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function getDailyCompletion() {
  const num = getDailyTrailNumber();
  try {
    const raw = localStorage.getItem('ot_daily_' + num);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function saveDailyCompletion(result) {
  const num = getDailyTrailNumber();
  try {
    localStorage.setItem('ot_daily_' + num, JSON.stringify(result));
  } catch (_) {}
}

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
    this.activeChallenge = null;
    this.dailyMode = false;
    this.dailyTrailNumber = 0;
    this.dailyRng = null;
  }

  // ── Challenge ───────────────────────────────

  activateChallenge(challengeId) {
    this.activeChallenge = challengeId;
  }

  static getCurrentChallengeId() {
    const idx = Math.floor(Date.now() / 604800000) % Object.keys(CHALLENGE_INFO).length;
    return Object.keys(CHALLENGE_INFO)[idx];
  }

  // ── Daily Trail ───────────────────────────

  startDailyTrail() {
    this.dailyMode = true;
    this.dailyTrailNumber = getDailyTrailNumber();
    this.dailyRng = mulberry32(getDailySeed());
  }

  completeDailyTrail() {
    if (!this.dailyMode) return;
    const gs = this.gameState;
    const alive = gs?.party?.members?.filter(m => m.alive)?.length || 0;
    const total = gs?.party?.members?.length || 5;
    const miles = this.milesTraveled || 0;
    const survived = alive > 0;
    const result = { completed: true, survived, alive, total, miles, date: new Date().toISOString() };
    saveDailyCompletion(result);
    return result;
  }

  getDailyShareText() {
    const num = this.dailyTrailNumber || getDailyTrailNumber();
    const gs = this.gameState;
    const alive = gs?.party?.members?.filter(m => m.alive)?.length || 0;
    const total = gs?.party?.members?.length || 5;
    const miles = this.milesTraveled || 0;
    const startDate = new Date('1848-04-15');
    const curDate = gs?.position?.date ? new Date(gs.position.date) : startDate;
    const days = Math.max(0, Math.round((curDate - startDate) / 86400000));

    if (alive === 0) {
      return `Daily Trail #${num} \u2014 Party wiped \u{1F480}\n${miles} miles | ${days} days\ntrail.osi-cyber.com`;
    }
    if (alive === total) {
      return `Daily Trail #${num} \u2014 All survived! \u{1F389}\n${miles} miles | ${days} days\ntrail.osi-cyber.com`;
    }
    return `Daily Trail #${num} \u2014 ${alive}/${total} survived \u{1FAA6}\n${miles} miles | ${days} days\ntrail.osi-cyber.com`;
  }

  static getDailyCompletion() {
    return getDailyCompletion();
  }

  static getDailyTrailNumber() {
    return getDailyTrailNumber();
  }

  // ── Run Save/Restore (localStorage) ────────

  _saveRun() {
    if (!this.signedState) return;
    try {
      localStorage.setItem('ot_saved_run', JSON.stringify({
        signedState: this.signedState,
        profession: this.profession,
        leaderName: this.leaderName,
        memberNames: this.memberNames,
        fullJournal: this.fullJournal,
        activeChallenge: this.activeChallenge,
        currentEvent: this.currentEvent,
        currentRiver: this.currentRiver,
        currentLandmark: this.currentLandmark,
      }));
    } catch (_) {}
  }

  _clearSavedRun() {
    localStorage.removeItem('ot_saved_run');
  }

  _loadSavedRun() {
    try {
      const raw = localStorage.getItem('ot_saved_run');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  getResumeScene() {
    if (this.currentEvent) return 'EVENT';
    if (this.currentRiver) return 'RIVER';
    if (this.currentLandmark) return 'LANDMARK';
    return 'TRAVEL';
  }

  // ── Event Emitter ────────────────────────────

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(fn => fn(data));
  }

  off(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }

  offAll(event) {
    delete this.listeners[event];
  }

  // ── State Machine ────────────────────────────

  async init() {
    // Restore journal from localStorage if present
    try {
      const saved = localStorage.getItem('ot_journal');
      if (saved) this.fullJournal = JSON.parse(saved);
    } catch (_) { /* ignore */ }

    this._savedRunData = this._loadSavedRun();
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
      const body = {
        leader_name: this.leaderName,
        member_names: this.memberNames,
        profession: this.profession,
        tone_tier: tier,
      };
      if (this.activeChallenge) body.challenge_id = this.activeChallenge;

      const res = await this.api('/api/start', body);
      this.signedState = res.signed_state;
      this.rumor = res.rumor || null;
      this.fullJournal = [];
      localStorage.removeItem('ot_journal');
      this._saveRun();
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
      this._saveRun();
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

      // Handle trigger — _saveRun() after trigger data assigned
      switch (res.trigger) {
        case 'event':
          this.currentEvent = res.trigger_data;
          this._saveRun();
          this.transition('EVENT', res.trigger_data);
          break;
        case 'landmark':
          this.currentLandmark = res.trigger_data;
          this._saveRun();
          this.transition('LANDMARK', res.trigger_data);
          break;
        case 'river':
          this.currentRiver = res.trigger_data;
          this._saveRun();
          this.transition('RIVER', res.trigger_data);
          break;
        case 'death':
          this._saveRun();
          this.transition('DEATH', res.trigger_data);
          break;
        case 'arrival':
          this._clearSavedRun();
          if (this.dailyMode) this.completeDailyTrail();
          this.transition('ARRIVAL');
          break;
        case 'wipe':
          this._clearSavedRun();
          if (this.dailyMode) this.completeDailyTrail();
          this.transition('WIPE');
          break;
        default:
          this._saveRun();
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
      this._saveRun();
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
      this._saveRun();
      this.emit('loading', false);
      this.emit('riverResolved', { narrative: res.narrative, choice });
      this.transition('TRAVEL');
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
  }

  async resolveLandmark(action, tradeItems) {
    if (action === 'continue') {
      this.currentLandmark = null;
      this.transition('TRAVEL');
      return;
    }

    this.emit('loading', true);
    try {
      const body = {
        signed_state: this.signedState,
        landmark_id: this.currentLandmark?.id || this.currentLandmark?.name,
        action,
      };
      if (action === 'trade' && tradeItems) {
        body.trade_items = tradeItems;
      }

      const res = await this.api('/api/landmark', body);
      this.signedState = res.signed_state;
      this._saveRun();
      this.emit('loading', false);
      // Re-render landmark with updated state and message
      this.emit('landmarkActionResult', { action, message: res.message });
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
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

  // ── Hunting ─────────────────────────────────

  startHunt() {
    if (this.state !== 'TRAVEL') return;
    this.pauseAdvance();
    this.transition('HUNTING');
  }

  async submitHunt(ammoSpent) {
    this.emit('loading', true);
    try {
      const res = await this.api('/api/hunt', {
        signed_state: this.signedState,
        ammo_spent: ammoSpent,
      });
      this.signedState = res.signed_state;
      this._saveRun();
      this.emit('loading', false);
      this.emit('huntResults', res.results);
    } catch (e) {
      this.emit('loading', false);
      this.emit('error', { message: e.message, recoverable: true });
    }
  }

  // ── Epitaph Generation ─────────────────────

  async generateEpitaph(name) {
    try {
      const res = await this.api('/api/epitaph', {
        signed_state: this.signedState,
        name,
      });
      return res.epitaph || null;
    } catch (_) {
      return null;
    }
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
    this.activeChallenge = null;
    localStorage.removeItem('ot_journal');
    this._clearSavedRun();
    this.transition('TITLE');
  }
}

window.GameEngine = GameEngine;
window.engine = new GameEngine();
window.CHALLENGE_INFO = CHALLENGE_INFO;
window.GameEngine = GameEngine;
