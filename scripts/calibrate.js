#!/usr/bin/env node
// Prompt Calibration Script for Oregon Trail AI
// Calls Anthropic Haiku directly, collects events per tier, evaluates quality

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY env var');
  process.exit(1);
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20250415';
const TIERS = ['low', 'medium', 'high'];
const EVENTS_PER_TIER = 50;

// ── System Prompts (copied from worker/src/prompt-templates.ts) ──

const SYSTEM_PROMPTS = {
  low: `You are the narrator of an Oregon Trail journey, spring 1848. Your voice is clear, factual, and educational — a well-written history textbook that respects the reader's intelligence. Light humor where it fits naturally.

Deaths are matter-of-fact. People died on this trail; state it plainly. No melodrama, no softening. No supernatural elements whatsoever.

RULES:
- Year is 1848. No anachronisms. No words, tools, medicine, or ideas that didn't exist yet.
- Name specific nations (Pawnee, Shoshone, Lakota) — never "Indians" or "natives" generically.
- Consequences must use exact stat keys: health, food, ammo, clothing, spare_parts, medicine, money, oxen, morale, miles, days.
- personality_effects keys must match party member names exactly.
- Return ONLY valid JSON. No markdown, no commentary outside the JSON object.
- Choices should have meaningful trade-offs. No obviously correct answer.
- Food measured in pounds, ammo in rounds, money in cents (100 cents = $1, so $5 = 500).`,

  medium: `You are the narrator of an Oregon Trail journey, spring 1848. Your voice is spare, specific, and unflinching — Cormac McCarthy for a smart teenager. Dark humor lives in the gap between what people expect and what the trail delivers.

Moral gray is the default. Good intentions cause harm. Selfish choices sometimes save lives. Uncomfortable decisions are the point — never let the player feel righteous.

Supernatural elements exist only as ambiguity: was it fever-dream or something else? Never confirm. Never deny.

RULES:
- Year is 1848. No anachronisms. Period-accurate language, tools, medicine, beliefs.
- Name specific nations (Pawnee, Shoshone, Lakota) — never "Indians" or "natives" generically.
- Consequences must use exact stat keys: health, food, ammo, clothing, spare_parts, medicine, money, oxen, morale, miles, days.
- personality_effects keys must match party member names exactly.
- Return ONLY valid JSON. No markdown, no commentary outside the JSON object.
- Choices should have meaningful trade-offs. Every option costs something.
- Food measured in pounds, ammo in rounds, money in cents (100 cents = $1, so $5 = 500).`,

  high: `You are the narrator of an Oregon Trail journey, spring 1848. Your voice channels Blood Meridian — psychological horror through specificity. Horror comes from what ordinary people do when the trail strips them down.

NO atmospheric cliches. No "ominous whispers," no "something watching from the dark," no "uneasy feeling." Horror is a father rationing water while his daughter watches. Horror is choosing who walks and who rides when the oxen are dying.

Characters unravel visibly. Track who's fraying and how. Sanity and morale decay drive behavior — a party member at low sanity acts erratically in your descriptions. Low morale means silence, refusal, turning back.

RULES:
- Year is 1848. No anachronisms. Period-accurate language, tools, medicine, beliefs.
- Name specific nations (Pawnee, Shoshone, Lakota) — never "Indians" or "natives" generically.
- Consequences must use exact stat keys: health, food, ammo, clothing, spare_parts, medicine, money, oxen, morale, miles, days.
- personality_effects keys must match party member names exactly.
- Return ONLY valid JSON. No markdown, no commentary outside the JSON object.
- Choices must wound. Every option costs something the player cares about.
- Food measured in pounds, ammo in rounds, money in cents (100 cents = $1, so $5 = 500).`,
};

// ── Sample Game States ──

const SAMPLE_STATES = [
  { segment: 'seg_03', miles: 200, date: '1848-05-01', food: 180, health: 90, alive: 5, disease: null, terrain: 'prairie', region: 'great_plains' },
  { segment: 'seg_06', miles: 500, date: '1848-06-15', food: 80, health: 70, alive: 4, disease: 'cholera', terrain: 'river_valley', region: 'great_plains' },
  { segment: 'seg_10', miles: 1000, date: '1848-08-01', food: 30, health: 50, alive: 3, disease: null, terrain: 'mountains', region: 'rocky_mountains' },
  { segment: 'seg_14', miles: 1500, date: '1848-09-15', food: 10, health: 30, alive: 2, disease: 'dysentery', terrain: 'desert', region: 'snake_river' },
];

const PARTY_NAMES = ['James', 'Mary', 'Thomas', 'Sarah', 'William'];

const WEATHER_BY_REGION = {
  great_plains: { may: 'Clear skies, warm days and cool nights. Occasional thunderstorms on the horizon.', june: 'Hot and humid. Afternoon storms build quickly. Mosquitoes thick near water.' },
  rocky_mountains: { august: 'Cool mornings, warm afternoons. Snow visible on highest peaks. Afternoon thunderstorms.' },
  snake_river: { september: 'Dry and dusty. Days still warm but nights are cold. First frost possible.' },
};

const RECENT_EVENTS_POOL = [
  ['Crossed the Platte River without incident', 'Found wild berries near the trail'],
  ['Passed a grave marker: "Here lies J. Henderson, 1847"', 'Traded with a Pawnee hunting party — gained 20 lbs jerky'],
  ['Lost a day repairing a cracked axle', 'Mary fell ill with a fever', 'Camped at a cold spring in the foothills'],
  ['Buried William beside the trail', 'Water barrel sprung a leak — lost half supply', 'Dust storm forced camp for two days'],
];

// ── Build Prompt ──

function buildPrompt(tier, stateIdx) {
  const state = SAMPLE_STATES[stateIdx % SAMPLE_STATES.length];
  const recentEvents = RECENT_EVENTS_POOL[stateIdx % RECENT_EVENTS_POOL.length];

  // Build party members based on alive count
  const members = PARTY_NAMES.slice(0, 5).map((name, i) => {
    const alive = i < state.alive;
    if (!alive) return `${name}(dead)`;
    const hp = Math.max(10, state.health - i * 10 + Math.floor(Math.random() * 20));
    const san = tier === 'high' ? Math.max(15, 80 - state.miles / 20 + Math.floor(Math.random() * 20)) : 80;
    const mor = Math.max(20, 90 - state.miles / 25 + Math.floor(Math.random() * 15));
    const sick = (i === 1 && state.disease) ? `,sick:${state.disease}` : '';
    return `${name}(hp:${hp},san:${san},mor:${mor}${sick})`;
  });

  // Derive weather
  const monthNames = { '05': 'may', '06': 'june', '08': 'august', '09': 'september' };
  const monthKey = monthNames[state.date.split('-')[1]] || 'may';
  const regionWeather = WEATHER_BY_REGION[state.region];
  const weather = regionWeather ? (regionWeather[monthKey] || Object.values(regionWeather)[0]) : 'Fair weather.';

  const ammo = Math.max(0, 200 - state.miles / 10);
  const clothes = Math.max(1, 5 - Math.floor(state.miles / 500));
  const parts = Math.max(0, 3 - Math.floor(state.miles / 600));
  const meds = Math.max(0, 5 - Math.floor(state.miles / 400));
  const money = Math.max(0, 80000 - state.miles * 40);
  const oxen = Math.max(2, 6 - Math.floor(state.miles / 500));

  const userPrompt = `LOCATION: Segment ${state.segment} — ${state.terrain} terrain, ${state.region} region
Terrain: ${state.terrain}, Region: ${state.region}
Miles traveled: ${state.miles}, Date: ${state.date}

WEATHER: ${weather}

PARTY: Leader: James. Members: ${members.join(', ')}
Supplies: food:${state.food}lb ammo:${Math.round(ammo)} clothes:${clothes} parts:${parts} meds:${meds} $${(money / 100).toFixed(2)} oxen:${oxen}
Pace: steady, Rations: ${state.food > 50 ? 'filling' : 'meager'}

RECENT EVENTS:
${recentEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Generate one event. Return JSON: {"title","description","choices":[{"label","consequences"}],"personality_effects","journal_entry"}`;

  return { system: SYSTEM_PROMPTS[tier], user: userPrompt };
}

// ── Anthropic API Call ──

async function callAnthropic(system, user, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });

      if (res.status === 429) {
        const backoff = Math.min(60000, 2000 * Math.pow(2, attempt));
        console.log(`  Rate limited. Backing off ${(backoff / 1000).toFixed(0)}s...`);
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      return { raw: text, usage: data.usage };
    } catch (err) {
      if (attempt === retries - 1) throw err;
      const backoff = 2000 * Math.pow(2, attempt);
      console.log(`  Error: ${err.message}. Retrying in ${(backoff / 1000).toFixed(0)}s...`);
      await sleep(backoff);
    }
  }
}

// ── Parse JSON (strip markdown fences) ──

function parseEventJSON(raw) {
  let cleaned = raw.trim();
  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

// ── Evaluation ──

const REFUSAL_PATTERNS = [
  /\bI cannot\b/i, /\bas an AI\b/i, /\bI'm not able\b/i, /\bI apologize\b/i,
  /\bI can't generate\b/i, /\bI'm unable\b/i, /\bI must decline\b/i,
];

const STAT_KEYS = ['health', 'food', 'ammo', 'clothing', 'spare_parts', 'medicine', 'money', 'oxen', 'morale', 'miles', 'days'];

const TONE_KEYWORDS = {
  low: ['educational', 'historical', 'fact', 'learn', 'common', 'typical', 'usual', 'settlers', 'wagon', 'trail'],
  medium: ['blood', 'bone', 'silence', 'dust', 'nothing', 'cost', 'price', 'choice', 'gray', 'dark'],
  high: ['horror', 'unravel', 'madness', 'decay', 'scream', 'watch', 'stare', 'hollow', 'crack', 'break'],
};

function evaluateTier(events, tier) {
  const total = events.length;
  let jsonValid = 0;
  let refusals = 0;
  let descLengths = [];
  let choiceCounts = [];
  let consequenceKeys = {};
  let toneHits = {};
  let errors = [];

  STAT_KEYS.forEach(k => { consequenceKeys[k] = 0; });
  Object.keys(TONE_KEYWORDS).forEach(t => { toneHits[t] = 0; });

  for (const ev of events) {
    // Check refusal
    if (REFUSAL_PATTERNS.some(p => p.test(ev.raw))) {
      refusals++;
      continue;
    }

    // JSON parse
    try {
      const parsed = parseEventJSON(ev.raw);
      ev.parsed = parsed;
      jsonValid++;

      // Description length
      if (parsed.description) {
        descLengths.push(parsed.description.length);
      }

      // Choice count
      if (Array.isArray(parsed.choices)) {
        choiceCounts.push(parsed.choices.length);

        // Consequence keys
        for (const choice of parsed.choices) {
          if (choice.consequences && typeof choice.consequences === 'object') {
            for (const key of Object.keys(choice.consequences)) {
              if (consequenceKeys[key] !== undefined) {
                consequenceKeys[key]++;
              }
            }
          }
        }
      }

      // Tone keyword analysis
      const fullText = JSON.stringify(parsed).toLowerCase();
      for (const [t, keywords] of Object.entries(TONE_KEYWORDS)) {
        for (const kw of keywords) {
          if (fullText.includes(kw)) {
            toneHits[t] = (toneHits[t] || 0) + 1;
          }
        }
      }
    } catch (err) {
      errors.push({ idx: events.indexOf(ev), error: err.message, snippet: ev.raw.slice(0, 100) });
    }
  }

  return {
    tier,
    total,
    json_valid: jsonValid,
    json_valid_pct: total > 0 ? Math.round((jsonValid / total) * 100) : 0,
    refusals,
    refusal_pct: total > 0 ? Math.round((refusals / total) * 100) : 0,
    avg_description_length: descLengths.length > 0 ? Math.round(descLengths.reduce((a, b) => a + b, 0) / descLengths.length) : 0,
    avg_choices: choiceCounts.length > 0 ? (choiceCounts.reduce((a, b) => a + b, 0) / choiceCounts.length).toFixed(1) : 0,
    consequence_key_usage: consequenceKeys,
    tone_keyword_hits: toneHits,
    parse_errors: errors,
  };
}

// ── Main ──

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Oregon Trail Prompt Calibration ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Events per tier: ${EVENTS_PER_TIER}`);
  console.log(`Total events: ${EVENTS_PER_TIER * TIERS.length}`);
  console.log(`Estimated runtime: ${Math.round(EVENTS_PER_TIER * TIERS.length * 2.5 / 60)} minutes\n`);

  const results = {};
  const allEvents = {};
  let totalTokens = { input: 0, output: 0 };

  for (const tier of TIERS) {
    console.log(`\n── Tier: ${tier.toUpperCase()} ──`);
    allEvents[tier] = [];

    for (let i = 0; i < EVENTS_PER_TIER; i++) {
      const stateIdx = i % SAMPLE_STATES.length;
      const { system, user } = buildPrompt(tier, stateIdx);

      process.stdout.write(`  [${i + 1}/${EVENTS_PER_TIER}] Generating...`);

      try {
        const result = await callAnthropic(system, user);
        allEvents[tier].push({ raw: result.raw, stateIdx, usage: result.usage });

        if (result.usage) {
          totalTokens.input += result.usage.input_tokens || 0;
          totalTokens.output += result.usage.output_tokens || 0;
        }

        process.stdout.write(` OK (${result.raw.length} chars)\n`);
      } catch (err) {
        process.stdout.write(` FAILED: ${err.message}\n`);
        allEvents[tier].push({ raw: '', stateIdx, error: err.message });
      }

      // 2-second delay between calls
      if (i < EVENTS_PER_TIER - 1) {
        await sleep(2000);
      }
    }

    results[tier] = evaluateTier(allEvents[tier], tier);
  }

  // ── Write Report ──

  const report = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    events_per_tier: EVENTS_PER_TIER,
    total_tokens: totalTokens,
    estimated_cost_usd: ((totalTokens.input * 0.80 + totalTokens.output * 4.00) / 1_000_000).toFixed(4),
    tiers: results,
    sample_events: {},
  };

  // Include 3 sample parsed events per tier
  for (const tier of TIERS) {
    report.sample_events[tier] = allEvents[tier]
      .filter(e => e.parsed)
      .slice(0, 3)
      .map(e => e.parsed);
  }

  const fs = await import('fs');
  const path = await import('path');
  const reportPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'calibration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // ── Print Summary ──

  console.log('\n\n═══════════════════════════════════════');
  console.log('         CALIBRATION SUMMARY');
  console.log('═══════════════════════════════════════\n');

  console.log(`Total tokens: ${totalTokens.input} in / ${totalTokens.output} out`);
  console.log(`Estimated cost: $${report.estimated_cost_usd}\n`);

  for (const tier of TIERS) {
    const r = results[tier];
    console.log(`── ${tier.toUpperCase()} ──`);
    console.log(`  JSON valid:     ${r.json_valid}/${r.total} (${r.json_valid_pct}%)`);
    console.log(`  Refusals:       ${r.refusals} (${r.refusal_pct}%)`);
    console.log(`  Avg desc len:   ${r.avg_description_length} chars`);
    console.log(`  Avg choices:    ${r.avg_choices}`);
    console.log(`  Parse errors:   ${r.parse_errors.length}`);
    console.log(`  Top consequences: ${Object.entries(r.consequence_key_usage).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')}`);
    console.log(`  Tone keywords:  own=${r.tone_keyword_hits[tier]}, low=${r.tone_keyword_hits.low}, med=${r.tone_keyword_hits.medium}, high=${r.tone_keyword_hits.high}`);
    console.log('');
  }

  console.log(`Report written to: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
