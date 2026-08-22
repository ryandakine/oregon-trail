/* ═══════════════════════════════════════════════════
   Oregon Trail AI — Game Engine
   Display layer only. Server handles all simulation.
   ═══════════════════════════════════════════════════ */

// ── Store Prices (hardcoded fallback, server is source of truth) ───

let STORE_PRICES = {
  food:        { price_cents: 30,   unit_amount: 10, unit_label: '10 lbs',    tooltip: '200 lbs per person for the full journey' },
  oxen:        { price_cents: 5000, unit_amount: 2,  unit_label: '1 yoke (2)', tooltip: '6 minimum (3 yoke) to pull a loaded wagon' },
  clothing:    { price_cents: 300,  unit_amount: 1,  unit_label: '1 set',     tooltip: 'Essential for mountain crossings' },
  ammo:        { price_cents: 200,  unit_amount: 20, unit_label: '20 rounds', tooltip: 'For hunting and defense' },
  spare_parts: { price_cents: 200,  unit_amount: 1,  unit_label: '1 part',    tooltip: 'Broken axles and tongues can strand you' },
  medicine:    { price_cents: 100,  unit_amount: 3,  unit_label: '3 doses',   tooltip: 'Reduces disease mortality by half' },
};
let _pricesFetched = false;

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

// ── Meta-progression (localStorage, zero backend) ─────────
// Persists across runs so the title screen can show a "Best: … · N runs"
// line and what's still unbeaten. No backend, no signed state — pure local
// bragging-rights tracking. (IMPROVEMENT_ROADMAP §1.4)

const META_KEY = 'ot_meta';

function defaultMeta() {
  return {
    runs: 0,
    furthestMile: 0,
    bestSurvivors: 0,
    tonesCleared: {},        // { low: true, medium: true, high: true }
    professionsCleared: {},  // { farmer: true, ... }
    bitterPathDiscovered: false,
  };
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    const parsed = JSON.parse(raw);
    // Merge over defaults so a meta blob from an older shape never throws on
    // a missing field.
    return { ...defaultMeta(), ...parsed,
      tonesCleared: { ...(parsed.tonesCleared || {}) },
      professionsCleared: { ...(parsed.professionsCleared || {}) },
    };
  } catch (_) {
    return defaultMeta();
  }
}

function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (_) {}
}

// ── GameEngine Class ─────────────────────────────

class GameEngine {
  constructor() {
    this.state = 'TITLE';
    this.signedState = null;
    this.shareInfo = null;
    this.currentEvent = null;
    this.currentBitterPath = null;
    this.currentBitterPathMeta = null;
    this._resolvingBitterPath = false;
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

  // Wordle-style emoji trail strip \u2014 one glyph per major landmark across the
  // full 1764-mile route. The shareable pattern is the mechanic that made
  // Wordle viral: glanceable, spoiler-free, copy-pasteable. (ROADMAP \u00a72)
  //   \u2b1c landmark passed alive   \ud83e\udea6 a party member died at/near it
  //   \u2b1b never reached            \u2620\ufe0f total wipe (appended)   \ud83c\udfde\ufe0f arrival
  getDailyTrailStrip() {
    const LANDMARK_MILES = [319, 554, 640, 838, 914, 1150, 1400, 1630, 1764];
    const miles = this.milesTraveled || 0;
    const deaths = this.deaths || [];
    // Bucket each death to its nearest landmark by mile so a glyph shows where
    // the party started losing people. Death entries may lack a mile field; if
    // so they fall to the segment the party had reached.
    const deathMiles = deaths
      .map(d => (typeof d.mile === 'number' ? d.mile : null))
      .filter(m => m !== null);
    let prev = 0;
    const strip = LANDMARK_MILES.map((lm) => {
      let glyph;
      if (miles >= lm) {
        const lostHere = deathMiles.some(dm => dm > prev && dm <= lm);
        glyph = lostHere ? '\u{1FAA6}' : '\u2b1c'; // \ud83e\udea6 grave : \u2b1c white
      } else {
        glyph = '\u2b1b'; // \u2b1b never reached
      }
      prev = lm;
      return glyph;
    }).join('');
    const alive = this.aliveMembers?.length || 0;
    const arrived = this.gameState?.position?.arrived || (miles >= 1764 && alive > 0);
    const suffix = alive === 0 ? '\u2620\ufe0f' : arrived ? '\u{1F3DE}\ufe0f' : '';
    return strip + suffix;
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
    const strip = this.getDailyTrailStrip();

    if (alive === 0) {
      return `Daily Trail #${num} \u2014 Party wiped \u{1F480}\n${strip}\n${miles} miles | ${days} days\ntrail.osi-cyber.com`;
    }
    if (alive === total) {
      return `Daily Trail #${num} \u2014 All survived! \u{1F389}\n${strip}\n${miles} miles | ${days} days\ntrail.osi-cyber.com`;
    }
    return `Daily Trail #${num} \u2014 ${alive}/${total} survived \u{1FAA6}\n${strip}\n${miles} miles | ${days} days\ntrail.osi-cyber.com`;
  }

  static getDailyCompletion() {
    return getDailyCompletion();
  }

  static getDailyTrailNumber() {
    return getDailyTrailNumber();
  }

  // ── Meta-progression ──────────────────────────

  static getMeta() {
    return loadMeta();
  }

  // One-line title-screen summary, e.g.
  //   "Best: 847 mi · 12 runs · Horror not yet survived"
  // before any run: "No runs yet — the trail awaits".
  static getMetaSummary() {
    const m = loadMeta();
    if (!m.runs) return 'No runs yet — the trail awaits';
    const parts = [`Best: ${m.furthestMile} mi`, `${m.runs} run${m.runs === 1 ? '' : 's'}`];
    if (!m.tonesCleared.high) {
      parts.push('Horror not yet survived');
    } else if (m.bestSurvivors > 0) {
      parts.push(`Most survivors: ${m.bestSurvivors}`);
    }
    return parts.join(' · ');
  }

  // Update the persisted meta blob from the current run's end state. Called on
  // arrival (survived) and wipe (everyone dead). "Cleared" a tone/profession =
  // reached Oregon City with at least one survivor.
  recordRunOutcome(survived) {
    const meta = loadMeta();
    meta.runs += 1;
    meta.furthestMile = Math.max(meta.furthestMile, this.milesTraveled || 0);
    const survivors = this.aliveMembers?.length || 0;
    meta.bestSurvivors = Math.max(meta.bestSurvivors, survivors);
    if (this.gameState?.simulation?.bitter_path_taken &&
        this.gameState.simulation.bitter_path_taken !== 'none') {
      meta.bitterPathDiscovered = true;
    }
    if (survived && survivors > 0) {
      const tier = this.tone;
      if (tier) meta.tonesCleared[tier] = true;
      if (this.profession) meta.professionsCleared[this.profession] = true;
    }
    saveMeta(meta);
    return meta;
  }

  // ── Run Save/Restore (localStorage) ────────

  // Lazy-fetch prices from server before store scene (hardcoded fallback if fails)
  async _fetchPrices() {
    if (_pricesFetched) return;
    try {
      const res = await fetch(this.apiBase + '/api/prices');
      if (res.ok) {
        const data = await res.json();
        if (data.prices) { STORE_PRICES = data.prices; _pricesFetched = true; }
      }
    } catch (_) { /* use hardcoded fallback */ }
  }

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
        currentBitterPath: this.currentBitterPath,
        currentBitterPathMeta: this.currentBitterPathMeta,
        dailyMode: this.dailyMode,
        dailyTrailNumber: this.dailyTrailNumber,
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
    if (this.currentBitterPath) return 'BITTER_PATH';
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

  get tone() {
    // tone_tier lives on Settings (worker/src/types.ts), NOT simulation — reading
    // simulation.tone_tier silently returned 'medium' for every run (fixed 2026-08-21).
    return this.gameState?.settings?.tone_tier ?? 'medium';
  }

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return String(dateStr ?? ''); // never emit "undefined NaN, NaN"
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
      this.track('run_started', { tone: tier, profession: this.profession, daily: this.dailyMode });
      this.emit('loading', false);
      await this._fetchPrices();
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

      // Phase 2 share stub: terminal advances (arrival/wipe) carry a
      // server-issued share object {url, score, challenge_id} for the /r/<id>
      // result page. Pinned capture point #1 (PHASE2_BIG_BETS_PLAN).
      if (res.share) this.shareInfo = res.share;

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
        case 'bitter_path':
          // trigger_data is the full EventResponse (body the scene renders +
          // echoes back for hash binding). trigger_meta carries sim metadata
          // (dead_member_name, trigger_variant, days_since_death) for display.
          this.currentBitterPath = res.trigger_data;
          this.currentBitterPathMeta = res.trigger_meta || null;
          this._saveRun();
          this.transition('BITTER_PATH', res.trigger_data);
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
          this._trackBitterPathOutcome('arrival');
          this.recordRunOutcome(true);
          this.track('run_completed', { outcome: 'arrival', miles: this.milesTraveled, tone: this.tone });
          this._clearSavedRun();
          if (this.dailyMode) this.completeDailyTrail();
          this.transition('ARRIVAL');
          break;
        case 'wipe':
          this._trackBitterPathOutcome('wipe');
          this.recordRunOutcome(false);
          this.track('run_completed', { outcome: 'wipe', miles: this.milesTraveled, tone: this.tone });
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

  // Bitter Path resolution — mirrors makeChoice but routes to /api/bitter_path
  // and uses a spam-click guard since the scene disables buttons on click.
  // On 400 errors from unrecoverable server states (already_resolved,
  // wrong_trigger_kind, event_hash_mismatch) we clear currentBitterPath so
  // the scene doesn't resume into a permanent loop. On network-level errors
  // we leave currentBitterPath set so retry works via button re-enable.
  // On success: emit bitterPathResolved, hold 1500ms for the scene to show
  // its outcome beat, then transition to TRAVEL.
  async resolveBitterPath(choiceIndex) {
    if (this._resolvingBitterPath) return;
    if (choiceIndex < 0 || choiceIndex > 2) return;
    if (!this.currentBitterPath) return;
    this._resolvingBitterPath = true;
    this.emit('loading', true);
    try {
      const res = await this.api('/api/bitter_path', {
        signed_state: this.signedState,
        event: this.currentBitterPath,
        choice_index: choiceIndex,
      });
      this.signedState = res.signed_state;
      const outcome = res.outcome;
      this.currentBitterPath = null;
      this.currentBitterPathMeta = null;
      this._saveRun();
      this.emit('loading', false);
      this.emit('bitterPathResolved', { outcome, choiceIndex });
      setTimeout(() => this.transition('TRAVEL'), 1500);
    } catch (e) {
      this.emit('loading', false);
      if (this._isUnrecoverableBitterPathError(e.message)) {
        this.currentBitterPath = null;
        this.currentBitterPathMeta = null;
        this._saveRun();
      }
      this.emit('error', { message: e.message, recoverable: true });
    } finally {
      this._resolvingBitterPath = false;
    }
  }

  // Skip via content-warning gate. Fires BEFORE the scene body renders.
  // Server applies zero mechanical effects but flags the run as "refused"
  // for newspaper/telemetry differentiation. Same spam-click guard.
  async skipBitterPath() {
    if (this._resolvingBitterPath) return;
    if (!this.currentBitterPath) return;
    this._resolvingBitterPath = true;
    this.emit('loading', true);
    try {
      const res = await this.api('/api/bitter_path_skip', {
        signed_state: this.signedState,
        event: this.currentBitterPath,
      });
      this.signedState = res.signed_state;
      this.currentBitterPath = null;
      this.currentBitterPathMeta = null;
      this._saveRun();
      this.emit('loading', false);
      this.emit('bitterPathResolved', { outcome: 'refused', choiceIndex: -1 });
      setTimeout(() => this.transition('TRAVEL'), 1500);
    } catch (e) {
      this.emit('loading', false);
      if (this._isUnrecoverableBitterPathError(e.message)) {
        this.currentBitterPath = null;
        this.currentBitterPathMeta = null;
        this._saveRun();
      }
      this.emit('error', { message: e.message, recoverable: true });
    } finally {
      this._resolvingBitterPath = false;
    }
  }

  // Analytics contract: a thin, never-throwing wrapper over Plausible so
  // scenes can fire funnel events without each guarding for adblock / offline
  // / local dev. Silent if window.plausible isn't loaded. The ~7 funnel goals
  // (run_started, run_completed, share_clicked, osi_link_clicked, etc.) are
  // configured as Goals in the Plausible dashboard. (IMPROVEMENT_ROADMAP §1.5)
  track(name, props) {
    try {
      if (typeof window.plausible !== 'function') return;
      if (props && typeof props === 'object') {
        window.plausible(name, { props });
      } else {
        window.plausible(name);
      }
    } catch (_) { /* analytics must never break gameplay */ }
  }

  _isUnrecoverableBitterPathError(message) {
    if (!message || typeof message !== 'string') return false;
    return (
      message.includes('already_resolved') ||
      message.includes('wrong_trigger_kind') ||
      message.includes('event_hash_mismatch')
    );
  }

  // Fires on terminal trigger (arrival/wipe) when the run took any bitter-path
  // branch. Lets the Plausible funnel compare bitter_path_choice_* counts
  // against actual arrivals/wipes so we can measure which choices survive.
  // Silent if plausible isn't loaded (local dev, adblock, offline).
  _trackBitterPathOutcome(outcomeKind) {
    try {
      const taken = this.signedState?.state?.simulation?.bitter_path_taken;
      if (!taken || taken === 'none') return;
      if (typeof window.plausible !== 'function') return;
      const event = outcomeKind === 'arrival'
        ? 'bitter_path_outcome_arrival'
        : 'bitter_path_outcome_wipe';
      window.plausible(event, { props: { branch: taken } });
    } catch (_) {}
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
      // Phase 2 share stub — pinned capture point #2: /api/newspaper re-issues
      // the share object so resumed terminal states still get a /r link.
      if (res.share) this.shareInfo = res.share;
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

  // Landmark → Hunt: /api/hunt is gated to the TRAVEL phase server-side and
  // startHunt() guards on state==='TRAVEL', so a landmark can't hunt directly.
  // Return to TRAVEL and let the travel scene honor this flag on mount (before
  // its auto-advance), then hunt. Pure scene-routing, not simulation logic.
  requestHuntFromLandmark() {
    this._pendingHuntOnTravel = true;
    this.currentLandmark = null;
    this.transition('TRAVEL');
  }

  consumePendingHunt() {
    if (!this._pendingHuntOnTravel) return false;
    this._pendingHuntOnTravel = false;
    return true;
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

  // ── Make Camp (Phase 2 — Bet 3) ─────────────
  // One rest day, miles unchanged. The server runs the real per-day attrition
  // tick then applies rest healing; the response is {signed_state, summary:
  // {date, food_consumed, healed, notes}}. Returns the summary on success.
  // Errors (resolve_pending_event, wrong_phase, HMAC failures) RE-THROW to
  // the caller — the scene owns the toast; never swallow silently.
  async makeCamp() {
    this.emit('loading', true);
    try {
      const res = await this.api('/api/camp', {
        signed_state: this.signedState,
      });
      this.signedState = res.signed_state;
      this._saveRun();
      this.emit('loading', false);
      this.track('camp_made');
      return res.summary;
    } catch (e) {
      this.emit('loading', false);
      throw e;
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
    this.shareInfo = null;
    this.currentEvent = null;
    this.currentBitterPath = null;
    this.currentBitterPathMeta = null;
    this._resolvingBitterPath = false;
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
