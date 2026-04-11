# Pre-Build Plan: 3 Foundational Tasks Before Weekend 1

## Overview

Three tasks that produce files Weekend 1 consumes. Not the game itself.

**Total estimate:** 7-10 hours with CC+gstack. Parallelizable: Task 1 (research) is independent of Tasks 2+3.

## File Tree (deliverables only)

```
oregon-trail/
  worker/
    src/
      types.ts                     ← all shared TypeScript types (created first)
      historical-context.json      ← Task 1: the 1848 data
      prompt-assembly.ts           ← Task 2: prompt builder
      prompt-templates.ts          ← Task 2: system prompts by tier
      hmac.ts                      ← Task 3: sign/verify
      state.ts                     ← Task 3: state creation + update
    tests/
      context-schema.test.ts       ← Task 1 verification
      prompt-assembly.test.ts      ← Task 2 verification
      hmac.test.ts                 ← Task 3 verification
      state.test.ts                ← Task 3 verification
  wrangler.toml                    ← Workers config scaffold
  tsconfig.json
  package.json
```

## Execution Order

1. **Create `types.ts` first** — everything depends on these interfaces
2. **Task 1 + Tasks 2&3 in parallel** — Task 1 is research-heavy (Claude compiles, Ryan reviews). Tasks 2&3 are code and can run as parallel worktree agents once types exist.
3. **Scaffolding** (wrangler.toml, tsconfig, package.json) alongside any task

---

## TASK 1: Historical Context File (3-4 hours)

### What
A typed JSON file with 9 sections of real 1848 trail data. This is 30% of the project per the plan. If it's thin, every LLM event reads as AI slop.

### Schema (TypeScript types in `types.ts`)

**Trail Segments** (16 entries):
```typescript
interface TrailSegment {
  id: string;                    // "seg_01_independence_to_kaw"
  order: number;                 // 1-16
  start_landmark_id: string;
  end_landmark_id: string;
  distance_miles: number;
  terrain: TerrainType;          // "prairie"|"river_valley"|"bluffs"|"mountains"|etc
  region: Region;                // "missouri"|"eastern_nebraska"|"wyoming"|etc
  elevation_start_ft: number;
  elevation_end_ft: number;
  hazards: HazardTag[];          // "river_crossing"|"alkali_water"|"deep_snow"|etc
  river_crossings: RiverCrossing[];
  allowed_nations: string[];     // nation IDs
  description: string;           // 2-3 sentences, period voice
  diary_source: string;
}
```

**Landmarks** (10+ entries):
```typescript
interface Landmark {
  id: string;                    // "lm_chimney_rock"
  name: string;
  segment_id: string;
  mile_marker: number;
  type: "fort"|"natural"|"river_crossing"|"settlement"|"destination";
  operator_1848: string | null;
  description: string;
  diary_quote: string;
  diary_source: string;
  trade_inventory: TradeItem[];
  services: string[];
  event_hooks: string[];
}
```

**Weather** (by month × region):
```typescript
interface WeatherProfile {
  month: 4|5|6|7|8|9|10;
  region: Region;
  temp_high_f: number;
  temp_low_f: number;
  precip_chance: number;         // 0-1
  storm_chance: number;
  conditions: string[];
  pace_modifier: number;         // 0.5-1.0
  health_risk: string | null;
  description: string;
  source: string;
}
```

**Diseases** (7+ entries):
```typescript
interface DiseaseProfile {
  id: string;                    // "cholera"
  name: string;
  name_1848: string;             // "Asiatic cholera / the flux"
  onset_description: string;
  progression_days: number;
  mortality_rate: number;        // 0-1
  treatment_1848: string;
  treatment_effective: boolean;
  symptoms: string[];
  regions_elevated: Region[];
  months_elevated: Month[];
  base_probability_per_day: number;
  risk_factors: string[];
  diary_quote: string;
  source: string;
}
```

**Indigenous Nations** (5+ entries, with prohibited_tropes[]):
```typescript
interface IndigenousNation {
  id: string;
  name: string;
  alt_names: string[];
  regions: Region[];
  segments: string[];
  relationship_1848: string;
  trade_goods: string[];
  services: string[];
  cultural_notes: string;
  encounter_tone: string;        // LLM guidance
  historical_context: string;
  source: string;
  prohibited_tropes: string[];   // explicit anti-patterns
}
```

Plus: `PoliticalContext`, `MaterialCulture`, `PeriodVoice`, `PeriodNames`. Full types in implementation.

### Chunking Strategy

Context is imported as static JSON. Lookup functions pull only what's needed:

```typescript
getSegmentContext(ctx, segmentId)     → current segment
getLandmarkContext(ctx, segmentId)     → landmarks in segment
getWeatherContext(ctx, month, region)  → weather profile
getDiseaseContext(ctx, diseaseId)      → disease profile
getNationContext(ctx, segmentId)       → nations in territory
```

Example: party at Chimney Rock in July with cholera → loads Chimney Rock + July/western_nebraska weather + cholera profile + Lakota context. Only relevant chunks go into the prompt.

### Verification

- Parse JSON, validate every entry against TypeScript types
- Assert 16 segments ordered 1-16 with no gaps
- Assert all FK references (segment↔landmark, segment↔nation) resolve
- Assert mile markers monotonically increase
- Assert no segment has zero hazards

### How to Build

Claude Code compiles each section via research prompts. Ryan reviews for anachronisms and tightens period voice material. Quality bar: every section cites sources, no post-1848 concepts (no "bacteria" — miasma theory only).

---

## TASK 2: Prompt Assembly System (2-3 hours)

### What
A function that takes GameState and returns a structured prompt with hard token budgets per block.

### Token Budgets

| Block | Budget | Contents |
|-------|--------|----------|
| System prompt (per tier) | 400 tokens | Tone + voice + rules |
| Location + weather | 300 tokens | Segment desc + landmark + weather |
| Party state | 200 tokens | Compressed members + supplies |
| Recent events | 300 tokens | Last 5 journal entries |
| Conditional (disease/nation) | 200 tokens | Only if applicable |
| **Total input target** | **~1,400 tokens** | Leaves headroom under 1,700 |

### Token Counting

No tiktoken on Workers. Use character approximation: `estimateTokens(text) = Math.ceil(text.length / 4)`. Accurate within 10% for English prose. Sufficient for budget enforcement.

Truncation: `truncateToTokenBudget(text, budget)` cuts at `budget * 4` chars.

### System Prompts (3 tiers, in `prompt-templates.ts`)

- **Low:** "Clear, factual, educational. Light humor. Deaths matter-of-fact. Write like a well-written history textbook."
- **Medium:** "Dark humor, moral gray, uncomfortable choices. Write like Cormac McCarthy for a smart teenager — spare, specific, unflinching."
- **High:** "Psychological horror through specificity. No atmospheric cliches. Horror from what people do under pressure. Write like Blood Meridian."

All tiers share rules: 1848 only, no anachronisms, specific nation names, valid JSON only, consequences use exact stat keys.

### Assembly Function (`prompt-assembly.ts`)

```typescript
function assembleEventPrompt(state: GameState): AssembledPrompt {
  const system = truncate(SYSTEM_PROMPTS[state.settings.tone_tier], 400);
  const location = buildLocationBlock(state);   // segment + landmark + weather
  const party = buildPartyBlock(state);         // compressed notation
  const events = buildRecentEventsBlock(state); // last 5 journal entries
  const conditional = buildConditionalBlock(state); // disease + nations if applicable
  const user = [location, party, events, conditional].filter(Boolean).join('\n\n')
    + '\n\nGenerate one event. Return JSON: {title, description, choices, personality_effects, journal_entry}';
  return { system, user, estimated_input_tokens: estimateTokens(system) + estimateTokens(user) };
}
```

### Response Schema

```typescript
interface EventResponse {
  title: string;
  description: string;                // 2-4 sentences
  choices: EventChoice[];
  personality_effects: Record<string, { sanity?: number; morale?: number }>;
  journal_entry: string;              // 1 sentence for compression
}
interface EventChoice {
  label: string;
  consequences: { health?: number; food?: number; ammo?: number; /* etc */ };
}
```

### Verification

- Mock GameState at various positions, assert `estimated_input_tokens < 1700`
- Assert correct system prompt per tier
- Assert conditional block empty when no disease/no nations
- Assert conditional block populated when member has `disease: "cholera"`
- Assert truncation works on 5000-char input
- Edge cases: all members dead, empty journal

---

## TASK 3: HMAC-Signed State Protocol (2-3 hours)

### What
Server signs game state with HMAC-SHA256. Client carries the opaque blob. Server verifies before processing. No tampering possible.

### Game State Schema

```typescript
interface GameState {
  party: {
    leader_name: string;
    members: PartyMember[];       // 5 members (leader + 4)
  };
  supplies: Supplies;             // food, ammo, clothing, spare_parts, medicine, money, oxen
  position: Position;             // current_segment_id, miles_traveled, date (ISO)
  settings: Settings;             // pace, rations, tone_tier
  journal: string[];              // last 5 event summaries (1 sentence each)
  meta: { run_id: string; event_count: number; };
}
interface PartyMember {
  name: string;
  health: number;                 // 0-100
  alive: boolean;
  sanity: number;                 // 0-100 (minimal personality)
  morale: number;                 // 0-100 (minimal personality)
  disease: string | null;
}
interface SignedGameState {
  state: GameState;
  signature: string;              // hex HMAC-SHA256
}
```

### HMAC Implementation (`hmac.ts`)

- **Algorithm:** HMAC-SHA256 via `crypto.subtle` (native to CF Workers, no deps)
- **Secret:** `HMAC_SECRET` env var, set via `wrangler secret put` (Infisical injects at deploy)
- **Canonical serialization:** `deepCanonicalize()` recursively sorts all object keys before stringify. Prevents key-ordering differences from breaking signatures.
- **Signature format:** lowercase hex (64 chars)

```typescript
async function signState(state: object, secret: string): Promise<string>
async function verifyState(state: object, signature: string, secret: string): Promise<boolean>
function deepCanonicalize(obj: unknown): string  // recursive key sort + stringify
```

### Client-Server Flow

**1. `POST /api/start`** — Client sends name + members + tone. Server creates initial state, HMAC-signs it, returns `SignedGameState`.

**2. `POST /api/event`** — Client sends `SignedGameState`. Server verifies HMAC → assembles prompt → calls Haiku → returns event + re-signed state.

**3. `POST /api/choice`** — Client sends `SignedGameState` + event + choice_index. Server verifies HMAC → applies consequences → returns new `SignedGameState`.

### Signature Mismatch

- HTTP 400: `{"error": "invalid_signature"}`
- Client shows: `STATE CORRUPTION DETECTED. YOUR WAGON HAS BEEN LOST TO HISTORY. [Start New Game]`
- No retry, no recovery. Chain is broken.

### State Update Logic (`state.ts`)

- `createInitialState()` — defaults for all fields, signs
- `verifyIncomingState()` — HMAC check, returns valid/invalid
- `applyEventAndSign()` — applies choice consequences (supplies, health, personality), advances date, appends journal (cap at 5), increments event_count, re-signs

All supply values clamped to `Math.max(0, ...)`. Health 0 → `alive = false`. Personality effects target specific members by name.

### Verification

**hmac.test.ts:**
- Sign + verify round-trip
- Mutate one field → verify fails
- Same state + secret → same signature (deterministic)
- Different secrets → different signatures
- deepCanonicalize: different key orders → same output

**state.test.ts:**
- Initial state has correct defaults
- Negative food consequence doesn't go below 0
- Health=0 flips alive to false
- Personality effects target correct member
- Journal caps at 5 entries
- Event count increments
- Full round-trip: create → sign → verify → apply → sign → verify

---

## Scaffolding Files

**wrangler.toml:**
```toml
name = "oregon-trail-api"
main = "worker/src/index.ts"
compatibility_date = "2026-04-01"
[vars]
ENVIRONMENT = "development"
# HMAC_SECRET set via `wrangler secret put`
```

**package.json:** typescript, wrangler, vitest (for tests)

**tsconfig.json:** strict mode, target ES2022, module ESNext (CF Workers compatible)

---

## Verification: End-to-End

After all 3 tasks complete:

1. `npm test` — runs all test suites (schema validation, prompt assembly, HMAC, state)
2. Manual check: create a GameState at segment 5, call `assembleEventPrompt()`, inspect the output for correct context injection and token count
3. Manual check: sign a state, tamper with one field, verify rejection
4. Manual check: review 3-5 historical context entries for anachronisms and source quality
5. Run the local prompt testing script against real Haiku API with 1 assembled prompt — verify valid JSON response
