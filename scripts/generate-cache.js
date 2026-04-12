#!/usr/bin/env node
// Fallback Event Cache Generator for Oregon Trail AI
// Runs AFTER calibrate.js. Generates 200 events per tier (600 total).
// Output: scripts/fallback-events.json

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY env var');
  process.exit(1);
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20250415';
const TIERS = ['low', 'medium', 'high'];
const EVENTS_PER_TIER = 200;

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

// ── Diverse Game States (more variety than calibrate.js) ──

const SAMPLE_STATES = [
  // Early trail
  { segment: 'seg_01', miles: 50, date: '1848-04-20', food: 200, health: 95, alive: 5, disease: null, terrain: 'prairie', region: 'great_plains' },
  { segment: 'seg_02', miles: 150, date: '1848-04-28', food: 185, health: 92, alive: 5, disease: null, terrain: 'prairie', region: 'great_plains' },
  { segment: 'seg_03', miles: 200, date: '1848-05-01', food: 180, health: 90, alive: 5, disease: null, terrain: 'prairie', region: 'great_plains' },
  { segment: 'seg_04', miles: 320, date: '1848-05-10', food: 150, health: 85, alive: 5, disease: null, terrain: 'prairie', region: 'great_plains' },
  // Mid trail
  { segment: 'seg_05', miles: 450, date: '1848-06-01', food: 120, health: 78, alive: 5, disease: null, terrain: 'river_valley', region: 'great_plains' },
  { segment: 'seg_06', miles: 500, date: '1848-06-15', food: 80, health: 70, alive: 4, disease: 'cholera', terrain: 'river_valley', region: 'great_plains' },
  { segment: 'seg_07', miles: 640, date: '1848-06-25', food: 100, health: 72, alive: 4, disease: null, terrain: 'bluffs', region: 'great_plains' },
  { segment: 'seg_08', miles: 800, date: '1848-07-10', food: 60, health: 65, alive: 4, disease: null, terrain: 'high_plains', region: 'great_plains' },
  // Late mid trail
  { segment: 'seg_09', miles: 914, date: '1848-07-20', food: 45, health: 58, alive: 4, disease: null, terrain: 'mountains', region: 'rocky_mountains' },
  { segment: 'seg_10', miles: 1000, date: '1848-08-01', food: 30, health: 50, alive: 3, disease: null, terrain: 'mountains', region: 'rocky_mountains' },
  { segment: 'seg_11', miles: 1150, date: '1848-08-15', food: 55, health: 55, alive: 3, disease: 'mountain_fever', terrain: 'mountains', region: 'rocky_mountains' },
  // Late trail
  { segment: 'seg_12', miles: 1300, date: '1848-09-01', food: 25, health: 40, alive: 3, disease: null, terrain: 'desert', region: 'snake_river' },
  { segment: 'seg_13', miles: 1400, date: '1848-09-10', food: 15, health: 35, alive: 2, disease: null, terrain: 'canyon', region: 'snake_river' },
  { segment: 'seg_14', miles: 1500, date: '1848-09-15', food: 10, health: 30, alive: 2, disease: 'dysentery', terrain: 'desert', region: 'snake_river' },
  { segment: 'seg_15', miles: 1630, date: '1848-10-01', food: 20, health: 45, alive: 3, disease: null, terrain: 'forest', region: 'oregon' },
  { segment: 'seg_16', miles: 1700, date: '1848-10-10', food: 35, health: 50, alive: 2, disease: null, terrain: 'forest', region: 'oregon' },
];

const PARTY_NAMES = ['James', 'Mary', 'Thomas', 'Sarah', 'William'];

const WEATHER_TABLE = {
  great_plains: {
    april: 'Cool mornings, mild afternoons. Spring rains sweep through without warning.',
    may: 'Clear skies, warm days and cool nights. Occasional thunderstorms on the horizon.',
    june: 'Hot and humid. Afternoon storms build quickly. Mosquitoes thick near water.',
    july: 'Blazing heat. Dust devils on the plains. Water sources drying up.',
  },
  rocky_mountains: {
    july: 'Warm valleys, cold passes. Snow lingers on the highest peaks. Lightning storms above treeline.',
    august: 'Cool mornings, warm afternoons. Snow visible on highest peaks. Afternoon thunderstorms.',
  },
  snake_river: {
    august: 'Dry heat. Alkali dust irritates eyes and lungs. Water scarce between rivers.',
    september: 'Dry and dusty. Days still warm but nights are cold. First frost possible.',
  },
  oregon: {
    october: 'Rain begins in earnest. Mud slows travel. Cold fog in the morning.',
  },
};

const RECENT_EVENTS_POOLS = [
  ['Crossed the Platte River without incident', 'Found wild berries near the trail'],
  ['Passed a grave marker: "Here lies J. Henderson, 1847"', 'Traded with a Pawnee hunting party — gained 20 lbs jerky'],
  ['Lost a day repairing a cracked axle', 'Mary fell ill with a fever', 'Camped at a cold spring in the foothills'],
  ['Buried William beside the trail', 'Water barrel sprung a leak — lost half supply', 'Dust storm forced camp for two days'],
  ['Saw Chimney Rock in the distance', 'Oxen drank from alkali pool — one is sluggish'],
  ['Forded a shallow creek, soaking the flour', 'Heard coyotes howling through the night'],
  ['Met a party heading back east — they warned of snow in the passes', 'Sarah found arrowheads near an old camp'],
  ['Thunder spooked the oxen — nearly lost a wagon', 'Thomas shot a deer — 40 lbs of fresh meat'],
  ['Camped near Independence Rock — carved names in the stone', 'Mosquitoes so thick we could barely breathe'],
  ['Found an abandoned wagon — salvaged spare parts', 'River too deep to ford — searched for a crossing'],
];

// ── Build Prompt ──

function buildPrompt(tier, eventIdx) {
  const stateIdx = eventIdx % SAMPLE_STATES.length;
  const state = SAMPLE_STATES[stateIdx];
  const recentEvents = RECENT_EVENTS_POOLS[eventIdx % RECENT_EVENTS_POOLS.length];

  const members = PARTY_NAMES.slice(0, 5).map((name, i) => {
    const alive = i < state.alive;
    if (!alive) return `${name}(dead)`;
    const hp = Math.max(10, state.health - i * 8 + Math.floor(Math.random() * 15));
    const san = tier === 'high' ? Math.max(15, 85 - state.miles / 18 + Math.floor(Math.random() * 20)) : Math.max(40, 90 - state.miles / 30);
    const mor = Math.max(15, 90 - state.miles / 22 + Math.floor(Math.random() * 12));
    const sick = (i === 1 && state.disease) ? `,sick:${state.disease}` : '';
    return `${name}(hp:${hp},san:${san},mor:${mor}${sick})`;
  });

  const monthNames = { '04': 'april', '05': 'may', '06': 'june', '07': 'july', '08': 'august', '09': 'september', '10': 'october' };
  const monthKey = monthNames[state.date.split('-')[1]] || 'may';
  const regionWeather = WEATHER_TABLE[state.region];
  const weather = regionWeather ? (regionWeather[monthKey] || Object.values(regionWeather)[0]) : 'Fair weather.';

  const ammo = Math.max(0, 200 - state.miles / 10 + Math.floor(Math.random() * 30));
  const clothes = Math.max(1, 5 - Math.floor(state.miles / 500));
  const parts = Math.max(0, 3 - Math.floor(state.miles / 600));
  const meds = Math.max(0, 5 - Math.floor(state.miles / 400));
  const money = Math.max(0, 80000 - state.miles * 40 + Math.floor(Math.random() * 5000));
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

function parseEventJSON(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ──

async function main() {
  console.log('=== Oregon Trail Fallback Cache Generator ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Events per tier: ${EVENTS_PER_TIER}`);
  console.log(`Total events: ${EVENTS_PER_TIER * TIERS.length}`);
  console.log(`Estimated runtime: ${Math.round(EVENTS_PER_TIER * TIERS.length * 2.5 / 60)} minutes\n`);

  const cache = { low: [], medium: [], high: [] };
  let totalTokens = { input: 0, output: 0 };
  let totalValid = 0;
  let totalFailed = 0;

  for (const tier of TIERS) {
    console.log(`\n── Tier: ${tier.toUpperCase()} (0/${EVENTS_PER_TIER}) ──`);
    let generated = 0;
    let attempts = 0;
    const maxAttempts = EVENTS_PER_TIER * 2; // allow retries for parse failures

    while (generated < EVENTS_PER_TIER && attempts < maxAttempts) {
      const { system, user } = buildPrompt(tier, attempts);
      attempts++;

      process.stdout.write(`  [${generated + 1}/${EVENTS_PER_TIER}] `);

      try {
        const result = await callAnthropic(system, user);

        if (result.usage) {
          totalTokens.input += result.usage.input_tokens || 0;
          totalTokens.output += result.usage.output_tokens || 0;
        }

        const parsed = parseEventJSON(result.raw);

        // Validate minimum schema
        if (!parsed.title || !parsed.description || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
          process.stdout.write('SKIP (incomplete schema)\n');
          totalFailed++;
          await sleep(2000);
          continue;
        }

        cache[tier].push(parsed);
        generated++;
        totalValid++;
        process.stdout.write(`OK "${parsed.title.slice(0, 40)}"\n`);
      } catch (err) {
        process.stdout.write(`FAIL: ${err.message.slice(0, 60)}\n`);
        totalFailed++;
      }

      // 2-second delay between calls
      await sleep(2000);
    }

    console.log(`  Tier ${tier}: ${generated} valid events from ${attempts} attempts`);
  }

  // ── Write Cache File ──

  const fs = await import('fs');
  const path = await import('path');
  const cachePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'fallback-events.json');
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));

  // ── Summary ──

  console.log('\n═══════════════════════════════════════');
  console.log('       CACHE GENERATION SUMMARY');
  console.log('═══════════════════════════════════════\n');
  console.log(`Events generated: ${totalValid} valid, ${totalFailed} failed`);
  console.log(`  low:    ${cache.low.length}`);
  console.log(`  medium: ${cache.medium.length}`);
  console.log(`  high:   ${cache.high.length}`);
  console.log(`\nTotal tokens: ${totalTokens.input} in / ${totalTokens.output} out`);
  console.log(`Estimated cost: $${((totalTokens.input * 0.80 + totalTokens.output * 4.00) / 1_000_000).toFixed(4)}`);
  console.log(`\nCache written to: ${cachePath}`);
  console.log(`File size: ${(fs.statSync(cachePath).size / 1024).toFixed(0)} KB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
