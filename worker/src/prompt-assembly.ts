import type {
  GameState,
  HistoricalContext,
  AssembledPrompt,
  TrailSegment,
  Landmark,
  WeatherProfile,
  DiseaseProfile,
  IndigenousNation,
  Month,
  PartyMember,
} from './types';
import { SYSTEM_PROMPTS } from './prompt-templates';

// ── Token estimation (char/4 approximation for CF Workers) ──

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokenBudget(text: string, budget: number): string {
  const charLimit = budget * 4;
  if (text.length <= charLimit) return text;
  return text.slice(0, charLimit);
}

// ── Block builders ──────────────────────────────────────────

export function buildLocationBlock(state: GameState, ctx: HistoricalContext): string {
  const segment = ctx.segments.find(s => s.id === state.position.current_segment_id);
  if (!segment) return 'Location: Unknown segment on the Oregon Trail.';

  const nearbyLandmark = ctx.landmarks.find(
    l => l.segment_id === segment.id
  );

  const month = parseMonth(state.position.date);
  const weather = ctx.weather.find(
    w => w.month === month && w.region === segment.region
  );

  const parts: string[] = [];
  parts.push(`LOCATION: ${segment.description}`);
  parts.push(`Terrain: ${segment.terrain}, Region: ${segment.region}`);
  parts.push(`Elevation: ${segment.elevation_start_ft}-${segment.elevation_end_ft} ft`);
  parts.push(`Miles traveled: ${state.position.miles_traveled}, Date: ${state.position.date}`);

  if (segment.hazards.length > 0) {
    parts.push(`Hazards: ${segment.hazards.join(', ')}`);
  }

  if (nearbyLandmark) {
    parts.push(`Nearby: ${nearbyLandmark.name} — ${nearbyLandmark.description}`);
  }

  if (weather) {
    parts.push(`WEATHER: ${weather.description}`);
    parts.push(`Temp: ${weather.temp_low_f}-${weather.temp_high_f}F, Precip: ${Math.round(weather.precip_chance * 100)}%, Storm: ${Math.round(weather.storm_chance * 100)}%`);
    if (weather.health_risk) {
      parts.push(`Health risk: ${weather.health_risk}`);
    }
  }

  return truncateToTokenBudget(parts.join('\n'), 300);
}

export function buildPartyBlock(state: GameState): string {
  const lines: string[] = [];
  lines.push(`Leader: ${state.party.leader_name}`);

  const memberLines = state.party.members.map(m => formatMember(m));
  lines.push(`Party: ${memberLines.join(', ')}`);

  const s = state.supplies;
  lines.push(`Supplies: food:${s.food}lb ammo:${s.ammo} clothes:${s.clothing} parts:${s.spare_parts} meds:${s.medicine} $${(s.money / 100).toFixed(2)} oxen:${s.oxen}`);
  lines.push(`Pace: ${state.settings.pace}, Rations: ${state.settings.rations}`);

  return truncateToTokenBudget(lines.join('\n'), 200);
}

export function buildRecentEventsBlock(state: GameState): string {
  if (state.journal.length === 0) return 'No journal entries yet — this is the start of the journey.';

  const recent = state.journal.slice(-5);
  const text = recent.map((entry, i) => `${i + 1}. ${entry}`).join('\n');
  return truncateToTokenBudget(`RECENT EVENTS:\n${text}`, 300);
}

export function buildConditionalBlock(state: GameState, ctx: HistoricalContext): string {
  const parts: string[] = [];

  // Disease profiles for sick members
  const sickMembers = state.party.members.filter(m => m.alive && m.disease !== null);
  if (sickMembers.length > 0) {
    for (const member of sickMembers) {
      const profile = ctx.diseases.find(d => d.id === member.disease!.id);
      if (profile) {
        parts.push(`DISEASE — ${member.name} has ${profile.name_1848}: ${profile.onset_description} Mortality: ${Math.round(profile.mortality_rate * 100)}%. Treatment: ${profile.treatment_1848}. Symptoms: ${profile.symptoms.join(', ')}.`);
      }
    }
  }

  // Nation context if segment has allowed_nations
  const segment = ctx.segments.find(s => s.id === state.position.current_segment_id);
  if (segment && segment.allowed_nations.length > 0) {
    for (const nationId of segment.allowed_nations) {
      const nation = ctx.nations.find(n => n.id === nationId);
      if (nation) {
        parts.push(`NATION — ${nation.name} (${nation.alt_names.join(', ')}): ${nation.relationship_1848} Trade goods: ${nation.trade_goods.join(', ')}. Tone: ${nation.encounter_tone}. ${nation.cultural_notes}`);
        if (nation.prohibited_tropes.length > 0) {
          parts.push(`PROHIBITED TROPES: ${nation.prohibited_tropes.join('; ')}`);
        }
      }
    }
  }

  if (parts.length === 0) return '';

  return truncateToTokenBudget(parts.join('\n'), 200);
}

// ── Main assembler ──────────────────────────────────────────

export function assembleEventPrompt(state: GameState, ctx: HistoricalContext): AssembledPrompt {
  const system = SYSTEM_PROMPTS[state.settings.tone_tier];

  const locationBlock = buildLocationBlock(state, ctx);
  const partyBlock = buildPartyBlock(state);
  const recentBlock = buildRecentEventsBlock(state);
  const conditionalBlock = buildConditionalBlock(state, ctx);

  const userParts: string[] = [
    locationBlock,
    '',
    partyBlock,
    '',
    recentBlock,
  ];

  if (conditionalBlock) {
    userParts.push('', conditionalBlock);
  }

  userParts.push(
    '',
    'Generate one event. Return JSON: {"title","description","choices":[{"label","consequences"}],"personality_effects","journal_entry"}'
  );

  const user = userParts.join('\n');

  return {
    system,
    user,
    estimated_input_tokens: estimateTokens(system) + estimateTokens(user),
  };
}

// ── Helpers ─────────────────────────────────────────────────

function formatMember(m: PartyMember): string {
  if (!m.alive) return `${m.name}(dead)`;
  const disease = m.disease ? `,sick:${m.disease.id}` : '';
  return `${m.name}(hp:${m.health},san:${m.sanity},mor:${m.morale}${disease})`;
}

function parseMonth(dateStr: string): Month {
  const parts = dateStr.split('-');
  const m = parseInt(parts[1], 10);
  if (m >= 4 && m <= 10) return m as Month;
  return 4; // default to April if out of range
}
