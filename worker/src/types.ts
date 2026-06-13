// ═══════════════════════════════════════════════════
// Shared types for Oregon Trail AI
// ═══════════════════════════════════════════════════

// ── Enums & Unions ──────────────────────────────

export type TerrainType =
  | "prairie" | "river_valley" | "bluffs" | "high_plains"
  | "mountains" | "desert" | "forest" | "canyon";

export type HazardTag =
  | "river_crossing" | "steep_grade" | "quicksand" | "rockslide"
  | "flash_flood" | "alkali_water" | "no_water" | "no_game"
  | "hostile_encounter" | "deep_snow" | "dust_storm";

export type Region =
  | "missouri" | "eastern_nebraska" | "western_nebraska"
  | "wyoming" | "south_pass" | "snake_river" | "blue_mountains"
  | "columbia_plateau" | "willamette";

export type Month = 4 | 5 | 6 | 7 | 8 | 9 | 10; // April-October

export type ToneTier = "low" | "medium" | "high";
export type Pace = "steady" | "strenuous" | "grueling";
export type Rations = "filling" | "meager" | "bare_bones";
export type Profession = "farmer" | "carpenter" | "banker";

// ── Historical Context Types ────────────────────

export interface RiverCrossing {
  id: string;
  name: string;
  mile_marker: number;
  width_ft: number;
  depth_ft_summer: number;
  depth_ft_spring: number;
  ford_difficulty: 1 | 2 | 3 | 4 | 5;
  ferry_available: boolean;
  ferry_cost_1848_dollars: number | null;
}

export interface TrailSegment {
  id: string;
  order: number;
  start_landmark_id: string;
  end_landmark_id: string;
  distance_miles: number;
  terrain: TerrainType;
  region: Region;
  elevation_start_ft: number;
  elevation_end_ft: number;
  hazards: HazardTag[];
  river_crossings: RiverCrossing[];
  allowed_nations: string[];
  description: string;
  diary_source: string;
}

export interface TradeItem {
  item: string;
  price_1848_cents: number;
  availability: "common" | "scarce" | "rare";
}

export interface Landmark {
  id: string;
  name: string;
  segment_id: string;
  mile_marker: number;
  type: "fort" | "natural" | "river_crossing" | "settlement" | "destination";
  operator_1848: string | null;
  description: string;
  diary_quote: string;
  diary_source: string;
  trade_inventory: TradeItem[];
  services: string[];
  event_hooks: string[];
  // Optional per-tone flavor text. When set for the current tone_tier, the
  // prompt-assembly location block appends this after the description so the
  // LLM has period-voice ambient material to draw on. Bitter Path uses high-
  // tier flavor to seed Donner Party references in Fort Bridger and Chimney
  // Rock without ever naming the mechanic.
  tone_flavor?: Partial<Record<ToneTier, string>>;
}

export interface WeatherProfile {
  month: Month;
  region: Region;
  temp_high_f: number;
  temp_low_f: number;
  precip_chance: number;
  storm_chance: number;
  conditions: string[];
  pace_modifier: number;
  health_risk: string | null;
  description: string;
  source: string;
}

export interface DiseaseProfile {
  id: string;
  name: string;
  name_1848: string;
  onset_description: string;
  progression_days: number;
  mortality_rate: number;
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

export interface IndigenousNation {
  id: string;
  name: string;
  alt_names: string[];
  regions: Region[];
  segments: string[];
  relationship_1848: string;
  trade_goods: string[];
  services: string[];
  cultural_notes: string;
  encounter_tone: string;
  historical_context: string;
  source: string;
  prohibited_tropes: string[];
}

export interface HistoricalEvent {
  event: string;
  date: string;
  relevance: string;
}

export interface PoliticalContext {
  year: 1848;
  key_events: HistoricalEvent[];
  traveler_motivations: string[];
  economic_conditions: string;
  source: string;
}

export interface WagonItem {
  item: string;
  category: "food" | "clothing" | "tools" | "medicine" | "ammunition" | "spare_parts";
  weight_lbs: number;
  notes: string;
}

export interface PriceEntry {
  item: string;
  price_1848_cents: number;
  unit: string;
}

export interface MaterialCulture {
  wagon_contents: WagonItem[];
  independence_prices: PriceEntry[];
  food_preservation: string[];
  repair_methods: string[];
  weight_constraints: string;
  source: string;
}

export interface DiaryExcerpt {
  text: string;
  author: string;
  date: string;
  source: string;
}

export interface VocabularyEntry {
  modern_term: string;
  period_term: string;
  notes: string;
}

export interface PeriodVoice {
  diary_excerpts: DiaryExcerpt[];
  vocabulary: VocabularyEntry[];
  style_notes: string[];
}

export interface PeriodNames {
  male_first: string[];
  female_first: string[];
  surnames: string[];
  regional_notes: string;
  source: string;
}

export interface HistoricalContext {
  version: string;
  last_updated: string;
  segments: TrailSegment[];
  landmarks: Landmark[];
  weather: WeatherProfile[];
  diseases: DiseaseProfile[];
  nations: IndigenousNation[];
  political: PoliticalContext;
  material_culture: MaterialCulture;
  period_voice: PeriodVoice;
  names: PeriodNames;
}

// ── Game State Types ────────────────────────────

export interface DiseaseStatus {
  id: string;
  days_sick: number;
  stage: "active" | "recovering";
  medicine_used_today: boolean;
}

export interface DeathRecord {
  name: string;
  date: string;
  cause: string;
  epitaph: string | null;
}

export interface PartyMember {
  name: string;
  health: number;
  alive: boolean;
  sanity: number;
  morale: number;
  disease: DiseaseStatus | null;
}

export interface Supplies {
  food: number;
  ammo: number;
  clothing: number;
  spare_parts: number;
  medicine: number;
  money: number;
  oxen: number;
}

export interface Position {
  current_segment_id: string;
  miles_traveled: number;
  date: string;
}

export interface Settings {
  pace: Pace;
  rations: Rations;
  tone_tier: ToneTier;
  challenge_id: string | null;
}

export interface ChallengeConstraints {
  id: string;
  money_multiplier: number;
  force_pace: Pace | null;
  force_rations: Rations | null;
  force_tone: ToneTier | null;
  no_ammo: boolean;
  no_medicine: boolean;
  no_spare_parts: boolean;
  no_hunting: boolean;
}

// "refused" = player opted out via the content-warning gate before seeing the
// scene body. Mechanically a no-op (no food, morale, sanity, or days delta)
// so we are not rewarding players for skipping. The flag lets the newspaper
// and telemetry distinguish opt-out from dignified choice.
export type BitterPathOutcome = "none" | "dignified" | "hopeful" | "taken" | "refused";

// A consequence delta scheduled to land on a future simulated day — the
// delayed-consequence primitive (a wound that festers, food found spoiled days
// later, a morale ripple). Enqueued server-side only; drained inside
// advanceDays. The consequences carry the SAME delta shape as events and are
// clamped by CONSEQUENCE_BOUNDS at drain time (not at enqueue). See
// docs/spec/gamestate-v2.md §3.2.
export interface PendingEffect {
  id: string;                 // uuid; de-dup + journal/debug
  days_remaining: number;     // decremented per simulated day; fires at <= 0
  consequences: EventChoice["consequences"]; // same delta shape as events
  member_name?: string;       // optional target for health/morale; else all living
  source: string;             // e.g. "Snakebite", "disease:cholera" — provenance
  journal_entry?: string;     // optional line emitted when it fires
}

export interface SimulationState {
  starvation_days: number;
  days_since_last_event: number;
  resolved_crossings: string[];
  visited_landmarks: string[];
  pending_event_hash: string | null;
  // Discriminator for pending_event_hash. Without this, a client can take a
  // regular event's pending hash and send it to /api/bitter_path to claim
  // bitter-path consequences (e.g. +60 food) for free. Each handler verifies
  // this matches its expected trigger.
  pending_event_trigger: "event" | "bitter_path" | null;
  landmark_rest_used: string[];
  bitter_path_taken: BitterPathOutcome;
  // Titles of the last ~5 resolved events this run. Surfaced to the LLM as a
  // "do NOT repeat these titles" anti-repetition signal so the same event does
  // not fire back-to-back. Capped at 5 entries (oldest dropped).
  recent_event_titles: string[];
  // v2+; default []. Delayed consequences scheduled to fire on a future
  // simulated day. Server-enqueued only, capped at MAX_PENDING_EFFECTS.
  pending_effects: PendingEffect[];
}

export interface GameState {
  // Schema version for the migration framework. v2+; legacy signed states have
  // no marker and are treated as v1. See docs/spec/gamestate-v2.md §2.
  state_version: number;
  party: {
    leader_name: string;
    members: PartyMember[];
  };
  supplies: Supplies;
  position: Position;
  settings: Settings;
  journal: string[];
  deaths: DeathRecord[];
  simulation: SimulationState;
  meta: {
    run_id: string;
    event_count: number;
  };
}

export interface SignedGameState {
  state: GameState;
  signature: string;
}

// ── LLM Response Types ──────────────────────────

export interface EventChoice {
  label: string;
  consequences: {
    health?: number;
    food?: number;
    ammo?: number;
    clothing?: number;
    spare_parts?: number;
    medicine?: number;
    money?: number;
    oxen?: number;
    morale?: number;
    miles?: number;
    days?: number;
  };
}

export interface EventResponse {
  title: string;
  description: string;
  choices: EventChoice[];
  personality_effects: Record<string, { sanity?: number; morale?: number }>;
  journal_entry: string;
}

// ── API Wire Types ──────────────────────────────

export interface StartRequest {
  leader_name: string;
  member_names: string[];
  profession: Profession;
  tone_tier: ToneTier;
  challenge_id?: string | null;
}

export interface EventRequest {
  signed_state: SignedGameState;
}

export interface ChoiceRequest {
  signed_state: SignedGameState;
  event: EventResponse;
  choice_index: number;
}

export interface StoreItem {
  item: keyof Omit<Supplies, "money">;
  quantity: number;
}

export interface StoreRequest {
  signed_state: SignedGameState;
  purchases: StoreItem[];
}

export interface AdvanceRequest {
  signed_state: SignedGameState;
}

export type TriggerType = "event" | "landmark" | "river" | "death" | "arrival" | "wipe" | "bitter_path" | null;

export interface DaySummary {
  date: string;
  miles: number;
  food_consumed: number;
  events: string[];
}

// Share payload attached to terminal responses (advance arrival/wipe,
// newspaper). Response-only — never part of GameState (a stored score is a
// replay/forgery surface; computed-on-demand is not).
export interface ShareInfo {
  url: string;
  score: number;
  challenge_id: string | null;
}

export interface AdvanceResponse {
  days_advanced: number;
  summaries: DaySummary[];
  trigger: TriggerType;
  trigger_data: unknown;
  // Secondary payload used by the bitter_path trigger to carry the simulation
  // metadata (dead_member_name, trigger_variant, days_since_death) alongside
  // the EventResponse body that the client must echo back to /api/bitter_path
  // for hash binding. Other triggers leave this undefined.
  trigger_meta?: unknown;
  // "llm" if the event came from the live model, "fallback" if a hand-written
  // event was served (rate-blocked, or Anthropic errored/dead key). Undefined
  // for non-event triggers. Used for fallback-rate observability.
  event_source?: "llm" | "fallback";
  // Present ONLY when this advance produced the run's terminal transition
  // (trigger "arrival" | "wipe") — server-detected on the state it just
  // simulated, never client-claimed.
  share?: ShareInfo;
  signed_state: SignedGameState;
}

export interface EventApiResponse {
  event: EventResponse;
  signed_state: SignedGameState;
}

export interface LandmarkRequest {
  signed_state: SignedGameState;
  landmark_id: string;
  action: "rest" | "trade";
  trade_items?: { item: string; quantity: number }[];
}

export interface HuntRequest {
  signed_state: SignedGameState;
  ammo_spent: number;
}

export interface CampRequest {
  signed_state: SignedGameState;
}

// Shape pinned for the frontend lane (PHASE2_BIG_BETS_PLAN.md Bet 3).
export interface CampSummary {
  date: string; // the day spent camping (pre-advance), mirroring DaySummary
  food_consumed: number;
  healed: { name: string; hp_delta: number }[];
  notes: string[];
}

export interface CampResponse {
  signed_state: SignedGameState;
  summary: CampSummary;
}

export interface HuntResult {
  shots: number;
  hits: { rabbit: number; deer: number; buffalo: number; miss: number };
  food_gained: number;
}

// ── Prompt Assembly Types ───────────────────────

export interface AssembledPrompt {
  system: string;
  user: string;
  estimated_input_tokens: number;
}
