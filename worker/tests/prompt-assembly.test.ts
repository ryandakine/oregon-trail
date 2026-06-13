import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  truncateToTokenBudget,
  buildLocationBlock,
  buildPartyBlock,
  buildRecentEventsBlock,
  buildConditionalBlock,
  buildBitterPathSituationalHint,
  buildHistoricalGroundingBlock,
  buildAntiRepetitionBlock,
  assembleEventPrompt,
} from '../src/prompt-assembly';
import { SYSTEM_PROMPTS } from '../src/prompt-templates';
import type {
  GameState,
  HistoricalContext,
  TrailSegment,
  Landmark,
  WeatherProfile,
  DiseaseProfile,
  IndigenousNation,
  ToneTier,
} from '../src/types';

// ── Mock data factories ─────────────────────────────────────

function makeSegment(overrides: Partial<TrailSegment> = {}): TrailSegment {
  return {
    id: 'seg_01',
    order: 1,
    start_landmark_id: 'lm_independence',
    end_landmark_id: 'lm_alcove_spring',
    distance_miles: 40,
    terrain: 'prairie',
    region: 'missouri',
    elevation_start_ft: 800,
    elevation_end_ft: 900,
    hazards: [],
    river_crossings: [],
    allowed_nations: [],
    description: 'Rolling prairie west of Independence, tall grass waving.',
    diary_source: 'Test',
    ...overrides,
  };
}

function makeLandmark(overrides: Partial<Landmark> = {}): Landmark {
  return {
    id: 'lm_independence',
    name: 'Independence, Missouri',
    segment_id: 'seg_01',
    mile_marker: 0,
    type: 'settlement',
    operator_1848: null,
    description: 'Jumping-off point for the Oregon Trail.',
    diary_quote: 'We leave tomorrow.',
    diary_source: 'Test',
    trade_inventory: [],
    services: ['blacksmith', 'general_store'],
    event_hooks: [],
    ...overrides,
  };
}

function makeWeather(overrides: Partial<WeatherProfile> = {}): WeatherProfile {
  return {
    month: 4,
    region: 'missouri',
    temp_high_f: 68,
    temp_low_f: 45,
    precip_chance: 0.35,
    storm_chance: 0.1,
    conditions: ['partly_cloudy', 'rain_showers'],
    pace_modifier: 1.0,
    health_risk: null,
    description: 'Mild spring weather with occasional rain.',
    source: 'Test',
    ...overrides,
  };
}

function makeDisease(overrides: Partial<DiseaseProfile> = {}): DiseaseProfile {
  return {
    id: 'cholera',
    name: 'Cholera',
    name_1848: 'cholera morbus',
    onset_description: 'Violent cramping and purging begin without warning.',
    progression_days: 3,
    mortality_rate: 0.5,
    treatment_1848: 'Laudanum and calomel, rest, clean water if available.',
    treatment_effective: false,
    symptoms: ['cramping', 'vomiting', 'dehydration', 'blue skin'],
    regions_elevated: ['missouri', 'eastern_nebraska'],
    months_elevated: [5, 6],
    base_probability_per_day: 0.005,
    risk_factors: ['contaminated water', 'crowded camps'],
    diary_quote: 'Three more graves today.',
    source: 'Test',
    ...overrides,
  };
}

function makeNation(overrides: Partial<IndigenousNation> = {}): IndigenousNation {
  return {
    id: 'pawnee',
    name: 'Pawnee',
    alt_names: ['Chahiksichahiks'],
    regions: ['eastern_nebraska'],
    segments: ['seg_05'],
    relationship_1848: 'Traded with emigrants but tensions over game depletion.',
    trade_goods: ['dried buffalo meat', 'moccasins', 'horses'],
    services: ['river_guide', 'trade'],
    cultural_notes: 'Earth-lodge villages along the Platte. Seasonal buffalo hunts.',
    encounter_tone: 'cautious_trade',
    historical_context: 'Pawnee territory along the Platte River.',
    source: 'Test',
    prohibited_tropes: ['savage imagery', 'broken English dialogue'],
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    state_version: 2,
    party: {
      leader_name: 'Ezra',
      members: [
        { name: 'Ezra', health: 100, alive: true, sanity: 90, morale: 80, disease: null },
        { name: 'Martha', health: 95, alive: true, sanity: 85, morale: 75, disease: null },
        { name: 'Thomas', health: 90, alive: true, sanity: 80, morale: 70, disease: null },
        { name: 'Sarah', health: 85, alive: true, sanity: 75, morale: 65, disease: null },
      ],
    },
    supplies: {
      food: 500,
      ammo: 200,
      clothing: 4,
      spare_parts: 3,
      medicine: 2,
      money: 400,
      oxen: 6,
    },
    position: {
      current_segment_id: 'seg_01',
      miles_traveled: 15,
      date: '1848-04-20',
    },
    settings: {
      pace: 'steady',
      rations: 'filling',
      tone_tier: 'low',
      challenge_id: null,
    },
    journal: [
      'Left Independence this morning under clear skies.',
      'Martha found wild onions by the creek.',
      'Passed a broken wagon. No sign of its owners.',
    ],
    deaths: [],
    simulation: {
      starvation_days: 0,
      days_since_last_event: 0,
      resolved_crossings: [],
      visited_landmarks: [],
      pending_event_hash: null,
      pending_event_trigger: null,
      landmark_rest_used: [],
      bitter_path_taken: "none",
      recent_event_titles: [],
      pending_effects: [],
    },
    meta: {
      run_id: 'test-run-001',
      event_count: 3,
    },
    ...overrides,
  };
}

function makeContext(overrides: Partial<HistoricalContext> = {}): HistoricalContext {
  return {
    version: '1.0.0',
    last_updated: '2026-04-11',
    segments: [makeSegment()],
    landmarks: [makeLandmark()],
    weather: [makeWeather()],
    diseases: [makeDisease()],
    nations: [makeNation()],
    political: {
      year: 1848,
      key_events: [],
      traveler_motivations: ['land', 'gold rumors'],
      economic_conditions: 'Post-Mexican War expansion',
      source: 'Test',
    },
    material_culture: {
      wagon_contents: [],
      independence_prices: [],
      food_preservation: [],
      repair_methods: [],
      weight_constraints: '2000 lbs max',
      source: 'Test',
    },
    period_voice: {
      diary_excerpts: [],
      vocabulary: [],
      style_notes: [],
    },
    names: {
      male_first: ['Ezra', 'Thomas'],
      female_first: ['Martha', 'Sarah'],
      surnames: ['Whitfield'],
      regional_notes: '',
      source: 'Test',
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates tokens as ceil(chars/4)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

describe('truncateToTokenBudget', () => {
  it('returns full text when under budget', () => {
    const text = 'short';
    expect(truncateToTokenBudget(text, 100)).toBe(text);
  });

  it('truncates text exceeding budget', () => {
    const text = 'a'.repeat(500);
    const result = truncateToTokenBudget(text, 10);
    expect(result.length).toBe(40); // 10 * 4
  });

  it('handles empty string', () => {
    expect(truncateToTokenBudget('', 100)).toBe('');
  });
});

describe('buildLocationBlock', () => {
  it('includes segment description and terrain', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const block = buildLocationBlock(state, ctx);
    expect(block).toContain('Rolling prairie');
    expect(block).toContain('prairie');
    expect(block).toContain('missouri');
  });

  it('includes nearby landmark', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const block = buildLocationBlock(state, ctx);
    expect(block).toContain('Independence, Missouri');
  });

  it('includes weather description', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const block = buildLocationBlock(state, ctx);
    expect(block).toContain('Mild spring weather');
  });

  it('returns fallback for unknown segment', () => {
    const state = makeGameState({
      position: { current_segment_id: 'seg_nonexistent', miles_traveled: 0, date: '1848-04-15' },
    });
    const ctx = makeContext();
    const block = buildLocationBlock(state, ctx);
    expect(block).toContain('Unknown segment');
  });

  it('includes hazards when present', () => {
    const seg = makeSegment({ hazards: ['river_crossing', 'quicksand'] });
    const ctx = makeContext({ segments: [seg] });
    const state = makeGameState();
    const block = buildLocationBlock(state, ctx);
    expect(block).toContain('river_crossing');
    expect(block).toContain('quicksand');
  });
});

describe('buildPartyBlock', () => {
  it('lists all members in compressed format', () => {
    const state = makeGameState();
    const block = buildPartyBlock(state);
    expect(block).toContain('Ezra(hp:100,san:90,mor:80)');
    expect(block).toContain('Martha(hp:95,san:85,mor:75)');
    expect(block).toContain('Leader: Ezra');
  });

  it('marks dead members', () => {
    const state = makeGameState({
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 100, alive: true, sanity: 90, morale: 80, disease: null },
          { name: 'Martha', health: 0, alive: false, sanity: 0, morale: 0, disease: null },
        ],
      },
    });
    const block = buildPartyBlock(state);
    expect(block).toContain('Martha(dead)');
  });

  it('shows disease on sick members', () => {
    const state = makeGameState({
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 60, alive: true, sanity: 50, morale: 40, disease: { id: 'cholera', days_sick: 3, stage: 'active' as const, medicine_used_today: false } },
        ],
      },
    });
    const block = buildPartyBlock(state);
    expect(block).toContain('Ezra(hp:60,san:50,mor:40,sick:cholera)');
  });

  it('includes supply counts', () => {
    const state = makeGameState();
    const block = buildPartyBlock(state);
    expect(block).toContain('food:500lb');
    expect(block).toContain('ammo:200');
    expect(block).toContain('oxen:6');
  });
});

describe('buildRecentEventsBlock', () => {
  it('joins last 5 journal entries', () => {
    const state = makeGameState();
    const block = buildRecentEventsBlock(state);
    expect(block).toContain('Left Independence');
    expect(block).toContain('wild onions');
    expect(block).toContain('broken wagon');
  });

  it('handles empty journal', () => {
    const state = makeGameState({ journal: [] });
    const block = buildRecentEventsBlock(state);
    expect(block).toContain('start of the journey');
  });

  it('only takes last 5 when journal is longer', () => {
    const journal = Array.from({ length: 10 }, (_, i) => `Entry ${i + 1}`);
    const state = makeGameState({ journal });
    const block = buildRecentEventsBlock(state);
    expect(block).not.toContain('1. Entry 1\n');
    expect(block).not.toContain('Entry 5\n');
    expect(block).toContain('Entry 6');
    expect(block).toContain('Entry 10');
  });
});

describe('buildConditionalBlock', () => {
  it('returns empty string when no disease and no nations', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const block = buildConditionalBlock(state, ctx);
    expect(block).toBe('');
  });

  it('includes disease profile when member is sick', () => {
    const state = makeGameState({
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 60, alive: true, sanity: 50, morale: 40, disease: { id: 'cholera', days_sick: 3, stage: 'active' as const, medicine_used_today: false } },
          { name: 'Martha', health: 95, alive: true, sanity: 85, morale: 75, disease: null },
        ],
      },
    });
    const ctx = makeContext();
    const block = buildConditionalBlock(state, ctx);
    expect(block).toContain('DISEASE');
    expect(block).toContain('cholera morbus');
    expect(block).toContain('Ezra');
    expect(block).toContain('50%');
  });

  it('includes nation context when segment has allowed_nations', () => {
    const seg = makeSegment({ id: 'seg_05', allowed_nations: ['pawnee'] });
    const ctx = makeContext({ segments: [seg] });
    const state = makeGameState({
      position: { current_segment_id: 'seg_05', miles_traveled: 100, date: '1848-05-10' },
    });
    const block = buildConditionalBlock(state, ctx);
    expect(block).toContain('NATION');
    expect(block).toContain('Pawnee');
    expect(block).toContain('dried buffalo meat');
    expect(block).toContain('PROHIBITED TROPES');
  });

  it('includes both disease and nation when both apply', () => {
    const seg = makeSegment({ id: 'seg_05', allowed_nations: ['pawnee'] });
    const ctx = makeContext({ segments: [seg] });
    const state = makeGameState({
      position: { current_segment_id: 'seg_05', miles_traveled: 100, date: '1848-05-10' },
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 60, alive: true, sanity: 50, morale: 40, disease: { id: 'cholera', days_sick: 3, stage: 'active' as const, medicine_used_today: false } },
        ],
      },
    });
    const block = buildConditionalBlock(state, ctx);
    expect(block).toContain('DISEASE');
    expect(block).toContain('NATION');
  });

  it('skips dead members even if they have a disease', () => {
    const state = makeGameState({
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 0, alive: false, sanity: 0, morale: 0, disease: { id: 'cholera', days_sick: 3, stage: 'active' as const, medicine_used_today: false } },
        ],
      },
    });
    const ctx = makeContext();
    const block = buildConditionalBlock(state, ctx);
    expect(block).toBe('');
  });
});

describe('buildBitterPathSituationalHint', () => {
  function makeEligibleState(overrides: Partial<GameState> = {}): GameState {
    const state = makeGameState({
      settings: { challenge_id: null, pace: 'steady', rations: 'filling', tone_tier: 'high' },
    });
    state.supplies.food = 20;
    state.simulation.starvation_days = 2;
    return { ...state, ...overrides };
  }

  it('fires for horror tier with food<50 + active starvation', () => {
    const hint = buildBitterPathSituationalHint(makeEligibleState());
    expect(hint).toContain('Donner');
    expect(hint).toContain('period voice');
  });

  it('fires for horror tier with food<50 + recent death (no starvation)', () => {
    const state = makeEligibleState();
    state.simulation.starvation_days = 0;
    state.deaths = [{ name: 'Martha', date: '1848-06-01', cause: 'cholera', epitaph: null }];
    expect(buildBitterPathSituationalHint(state)).toContain('Donner');
  });

  it('does NOT fire for low/medium tone tiers', () => {
    for (const tier of ['low', 'medium'] as ToneTier[]) {
      const state = makeEligibleState({
        settings: { challenge_id: null, pace: 'steady', rations: 'filling', tone_tier: tier },
      });
      expect(buildBitterPathSituationalHint(state)).toBe('');
    }
  });

  it('does NOT fire when food >= 50 even on horror tier', () => {
    const state = makeEligibleState();
    state.supplies.food = 100;
    expect(buildBitterPathSituationalHint(state)).toBe('');
  });

  it('does NOT fire without recent death AND no starvation', () => {
    const state = makeEligibleState();
    state.simulation.starvation_days = 0;
    state.deaths = [];
    expect(buildBitterPathSituationalHint(state)).toBe('');
  });

  it('never instructs the player or names the act', () => {
    const hint = buildBitterPathSituationalHint(makeEligibleState());
    // Anti-spoiler invariants: don't tell the player what to do, don't name
    // the mechanic or the act.
    expect(hint.toLowerCase()).not.toContain('press');
    expect(hint.toLowerCase()).not.toContain('click');
    expect(hint.toLowerCase()).not.toContain('eat');
    expect(hint.toLowerCase()).not.toContain('cannibal');
    expect(hint.toLowerCase()).not.toContain('bitter path');
  });
});

describe('assembleEventPrompt', () => {
  it('selects correct system prompt for each tone tier', () => {
    const ctx = makeContext();
    for (const tier of ['low', 'medium', 'high'] as ToneTier[]) {
      const state = makeGameState({
        settings: { pace: 'steady', rations: 'filling', tone_tier: tier, challenge_id: null },
      });
      const result = assembleEventPrompt(state, ctx);
      expect(result.system).toBe(SYSTEM_PROMPTS[tier]);
    }
  });

  it('keeps estimated_input_tokens under 1700 for normal state', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const result = assembleEventPrompt(state, ctx);
    expect(result.estimated_input_tokens).toBeLessThan(1700);
  });

  it('includes JSON instruction in user message', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const result = assembleEventPrompt(state, ctx);
    expect(result.user).toContain('Generate one event. Return JSON');
    expect(result.user).toContain('personality_effects');
  });

  it('omits conditional block separator when block is empty', () => {
    const state = makeGameState();
    const ctx = makeContext();
    const result = assembleEventPrompt(state, ctx);
    // Should not have triple blank lines from empty conditional
    expect(result.user).not.toContain('\n\n\n\n');
  });

  it('includes conditional block when applicable', () => {
    const seg = makeSegment({ id: 'seg_05', allowed_nations: ['pawnee'] });
    const ctx = makeContext({ segments: [seg] });
    const state = makeGameState({
      position: { current_segment_id: 'seg_05', miles_traveled: 100, date: '1848-05-10' },
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 60, alive: true, sanity: 50, morale: 40, disease: { id: 'cholera', days_sick: 3, stage: 'active' as const, medicine_used_today: false } },
        ],
      },
    });
    const result = assembleEventPrompt(state, ctx);
    expect(result.user).toContain('DISEASE');
    expect(result.user).toContain('NATION');
  });

  it('handles all members dead', () => {
    const state = makeGameState({
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 0, alive: false, sanity: 0, morale: 0, disease: null },
          { name: 'Martha', health: 0, alive: false, sanity: 0, morale: 0, disease: null },
        ],
      },
    });
    const ctx = makeContext();
    const result = assembleEventPrompt(state, ctx);
    expect(result.user).toContain('Ezra(dead)');
    expect(result.user).toContain('Martha(dead)');
    expect(result.estimated_input_tokens).toBeGreaterThan(0);
  });

  it('handles empty journal', () => {
    const state = makeGameState({ journal: [] });
    const ctx = makeContext();
    const result = assembleEventPrompt(state, ctx);
    expect(result.user).toContain('start of the journey');
  });

  it('handles first segment', () => {
    const state = makeGameState({
      position: { current_segment_id: 'seg_01', miles_traveled: 0, date: '1848-04-15' },
    });
    const ctx = makeContext();
    const result = assembleEventPrompt(state, ctx);
    expect(result.user).toContain('Miles traveled: 0');
    expect(result.estimated_input_tokens).toBeLessThan(1700);
  });

  it('handles last segment gracefully', () => {
    const lastSeg = makeSegment({
      id: 'seg_final',
      order: 20,
      terrain: 'forest',
      region: 'willamette',
      description: 'The Willamette Valley opens before you.',
    });
    const ctx = makeContext({
      segments: [lastSeg],
      weather: [makeWeather({ region: 'willamette', month: 9 })],
    });
    const state = makeGameState({
      position: { current_segment_id: 'seg_final', miles_traveled: 2000, date: '1848-09-15' },
    });
    const result = assembleEventPrompt(state, ctx);
    expect(result.user).toContain('Willamette Valley');
    expect(result.estimated_input_tokens).toBeLessThan(1700);
  });

  it('stays under 1700 tokens even with disease + nation + full journal', () => {
    const seg = makeSegment({ id: 'seg_05', allowed_nations: ['pawnee'], hazards: ['alkali_water', 'no_game'] });
    const ctx = makeContext({
      segments: [seg],
      weather: [makeWeather({ region: 'missouri', health_risk: 'Alkali water causes livestock poisoning.' })],
    });
    const journal = Array.from({ length: 10 }, (_, i) => `Day ${i + 1}: The trail stretched on. We made camp by a muddy creek and ate cold beans.`);
    const state = makeGameState({
      position: { current_segment_id: 'seg_05', miles_traveled: 150, date: '1848-05-20' },
      settings: { pace: 'grueling', rations: 'bare_bones', tone_tier: 'high', challenge_id: null },
      party: {
        leader_name: 'Ezra',
        members: [
          { name: 'Ezra', health: 40, alive: true, sanity: 30, morale: 20, disease: { id: 'cholera', days_sick: 3, stage: 'active' as const, medicine_used_today: false } },
          { name: 'Martha', health: 50, alive: true, sanity: 40, morale: 30, disease: null },
          { name: 'Thomas', health: 0, alive: false, sanity: 0, morale: 0, disease: null },
          { name: 'Sarah', health: 70, alive: true, sanity: 60, morale: 50, disease: null },
        ],
      },
      journal,
    });
    const result = assembleEventPrompt(state, ctx);
    expect(result.estimated_input_tokens).toBeLessThan(1700);
  });
});

// Context with the previously-dormant corpus populated, so the grounding block
// has real material to surface (test fixtures default these to empty).
function makeGroundedContext(): HistoricalContext {
  return makeContext({
    landmarks: [makeLandmark({
      diary_quote: 'The town was full of Indians, Mexicans, and traders.',
      event_hooks: ['outfit_wagon', 'hire_guide', 'join_company'],
    })],
    period_voice: {
      diary_excerpts: [
        { text: 'We are now fairly launched upon the broad prairie.', author: 'Francis Parkman', date: '1846-05', source: 'Test' },
        { text: 'The dust was intolerable and the heat severe.', author: 'A. Delano', date: '1849-06', source: 'Test' },
      ],
      vocabulary: [
        { modern_term: 'doctor', period_term: 'physician', notes: '' },
        { modern_term: 'campsite', period_term: 'encampment', notes: '' },
        { modern_term: 'sick', period_term: 'taken poorly', notes: '' },
        { modern_term: 'tired', period_term: 'wearied', notes: '' },
        { modern_term: 'food', period_term: 'provisions', notes: '' },
      ],
      style_notes: ['Use compound sentences.'],
    },
  });
}

describe('buildHistoricalGroundingBlock', () => {
  it('surfaces landmark diary quote and event hooks', () => {
    const state = makeGameState();
    const block = buildHistoricalGroundingBlock(state, makeGroundedContext());
    expect(block).toContain('PERIOD DIARY');
    expect(block).toContain('full of Indians, Mexicans');
    expect(block).toContain('outfit_wagon');
  });

  it('surfaces a period diary excerpt and vocabulary diction', () => {
    // miles_traveled=0 → first excerpt (Parkman) in the rotation
    const state = makeGameState({ position: { current_segment_id: 'seg_01', miles_traveled: 0, date: '1848-04-15' } });
    const block = buildHistoricalGroundingBlock(state, makeGroundedContext());
    expect(block).toContain('EMIGRANT VOICE');
    expect(block).toContain('Francis Parkman');
    expect(block).toContain('Period diction');
    expect(block).toContain('doctor→physician');
  });

  it('caps vocabulary to 4 pairs to respect the token budget', () => {
    const state = makeGameState();
    const block = buildHistoricalGroundingBlock(state, makeGroundedContext());
    // 5 vocab entries provided; only the first 4 surfaced (5th is dropped)
    expect(block).not.toContain('food→provisions');
    const pairCount = (block.match(/→/g) ?? []).length;
    expect(pairCount).toBe(4);
  });

  it('rotates the diary excerpt by miles_traveled', () => {
    const ctx = makeGroundedContext();
    const even = buildHistoricalGroundingBlock(
      makeGameState({ position: { current_segment_id: 'seg_01', miles_traveled: 0, date: '1848-04-15' } }),
      ctx,
    );
    const odd = buildHistoricalGroundingBlock(
      makeGameState({ position: { current_segment_id: 'seg_01', miles_traveled: 1, date: '1848-04-15' } }),
      ctx,
    );
    expect(even).toContain('Francis Parkman');
    expect(odd).toContain('A. Delano');
  });

  it('returns empty string when corpus is empty', () => {
    const state = makeGameState();
    // No landmark in the current segment + empty period_voice → nothing to ground on
    const bareCtx = makeContext({
      landmarks: [makeLandmark({ segment_id: 'seg_99', diary_quote: '', event_hooks: [] })],
      period_voice: { diary_excerpts: [], vocabulary: [], style_notes: [] },
    });
    expect(buildHistoricalGroundingBlock(state, bareCtx)).toBe('');
  });

  it('stays within its ~250 token budget', () => {
    const state = makeGameState();
    const block = buildHistoricalGroundingBlock(state, makeGroundedContext());
    expect(estimateTokens(block)).toBeLessThanOrEqual(250);
  });
});

describe('buildAntiRepetitionBlock', () => {
  it('returns empty string when no recent titles', () => {
    const state = makeGameState();
    state.simulation.recent_event_titles = [];
    expect(buildAntiRepetitionBlock(state)).toBe('');
  });

  it('lists recent titles with a do-NOT-repeat instruction', () => {
    const state = makeGameState();
    state.simulation.recent_event_titles = ['Broken Wheel', 'Tainted Water', 'The Fever'];
    const block = buildAntiRepetitionBlock(state);
    expect(block).toContain('Do NOT repeat');
    expect(block).toContain('Broken Wheel');
    expect(block).toContain('Tainted Water');
    expect(block).toContain('The Fever');
  });

  it('is injected into the assembled prompt when titles exist', () => {
    const state = makeGameState();
    state.simulation.recent_event_titles = ['Broken Wheel'];
    const result = assembleEventPrompt(state, makeGroundedContext());
    expect(result.user).toContain('Do NOT repeat');
    expect(result.user).toContain('Broken Wheel');
  });

  it('full prompt with grounding + anti-repetition stays under 1700 tokens', () => {
    const state = makeGameState();
    state.simulation.recent_event_titles = ['Broken Wheel', 'Tainted Water', 'The Fever', 'Dead Oxen', 'The Trade'];
    const result = assembleEventPrompt(state, makeGroundedContext());
    expect(result.estimated_input_tokens).toBeLessThan(1700);
  });
});
