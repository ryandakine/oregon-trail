import { createInitialState, verifyIncomingState, applyEventAndSign, applyStoreAndSign, getChallengeById, getCurrentChallenge, WEEKLY_CHALLENGES } from "./state";
import { assembleEventPrompt } from "./prompt-assembly";
import { callAnthropic, parseEventResponse, FALLBACK_EVENTS } from "./anthropic";
import { advanceDays } from "./simulation";
import { signState, deepCanonicalize, bufferToHex } from "./hmac";
import type {
  StartRequest,
  StoreRequest,
  AdvanceRequest,
  ChoiceRequest,
  AdvanceResponse,
  EventResponse,
  GameState,
  SignedGameState,
  HistoricalContext,
  ToneTier,
  LandmarkRequest,
  HuntRequest,
  HuntResult,
} from "./types";
import { getLandmarkById } from "./context-loader";
import ctx from "./historical-context.json";

export interface Env {
  HMAC_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

// Rate limiter: in-memory Map, 200 calls/min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    if (rateLimitMap.size > 10_000) {
      for (const [key, val] of rateLimitMap) {
        if (now > val.resetAt) rateLimitMap.delete(key);
      }
    }
    return true;
  }
  entry.count++;
  return entry.count <= 200;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 20);
}

async function hashEvent(event: EventResponse): Promise<string> {
  const encoder = new TextEncoder();
  const canonical = deepCanonicalize(event);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return bufferToHex(digest);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Support multiple allowed origins
    const requestOrigin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim());
    const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin
      : allowedOrigins.includes("*") ? "*"
      : allowedOrigins[0];
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Rate limiting
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return jsonResponse({ error: "rate_limit_exceeded" }, 429, origin);
    }

    try {
      switch (url.pathname) {
        case "/api/start":
          return await handleStart(request, env, origin);
        case "/api/store":
          return await handleStore(request, env, origin);
        case "/api/advance":
          return await handleAdvance(request, env, origin);
        case "/api/choice":
          return await handleChoice(request, env, origin);
        case "/api/newspaper":
          return await handleNewspaper(request, env, origin);
        case "/api/epitaph":
          return await handleEpitaph(request, env, origin);
        case "/api/river":
          return await handleRiver(request, env, origin);
        case "/api/landmark":
          return await handleLandmark(request, env, origin);
        case "/api/hunt":
          return await handleHunt(request, env, origin);
        case "/api/challenge":
          if (request.method === "GET") {
            const current = getCurrentChallenge();
            return jsonResponse({ current, all: WEEKLY_CHALLENGES }, 200, origin);
          }
          return jsonResponse({ error: "method_not_allowed" }, 405, origin);
        default:
          return jsonResponse({ error: "not_found" }, 404, origin);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "internal_error";
      return jsonResponse({ error: message }, 500, origin);
    }
  },
};

async function handleStart(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as StartRequest;

  if (!body.leader_name || !Array.isArray(body.member_names) || body.member_names.length !== 4) {
    return jsonResponse({ error: "invalid_request: need leader_name + 4 member_names" }, 400, origin);
  }

  const validProfessions = ["farmer", "carpenter", "banker"];
  if (!validProfessions.includes(body.profession)) {
    return jsonResponse({ error: "invalid_profession" }, 400, origin);
  }

  const validTones: ToneTier[] = ["low", "medium", "high"];
  if (!validTones.includes(body.tone_tier)) {
    return jsonResponse({ error: "invalid_tone_tier" }, 400, origin);
  }

  const leaderName = sanitizeName(body.leader_name);
  const memberNames = body.member_names.map(sanitizeName) as [string, string, string, string];

  if (!leaderName || memberNames.some((n) => !n)) {
    return jsonResponse({ error: "invalid_names" }, 400, origin);
  }

  const signed_state = await createInitialState(
    leaderName,
    memberNames,
    body.profession,
    body.tone_tier,
    env.HMAC_SECRET,
    body.challenge_id,
  );

  // Static rumor pool (no LLM call — negative ROI for one line of flavor text)
  const rumors = [
    "They say the trail is long and the rivers run deep this spring.",
    "A party out of St. Louis lost three to cholera before Fort Kearney.",
    "Word is the Platte is running high this year. Watch your crossings.",
    "The Pawnee are trading horses fair at the big bend. Bring tobacco.",
    "Last wagon train through said the grass is good all the way to Laramie.",
    "A man in town sold his farm for a wagon. Said Oregon land is free for the taking.",
    "They buried two children on the road to the Blue River last week. Measles.",
    "Old-timers say start no later than May or the snow catches you at South Pass.",
  ];
  const rumor = rumors[Math.floor(Math.random() * rumors.length)];

  return jsonResponse({ signed_state, rumor }, 200, origin);
}

async function handleStore(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as StoreRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  if (!Array.isArray(body.purchases)) {
    return jsonResponse({ error: "invalid_purchases" }, 400, origin);
  }

  // Phase gate: store only available before departure
  if (verified.state.position.miles_traveled > 0) {
    return jsonResponse({ error: "store_closed: already departed" }, 400, origin);
  }

  // Challenge constraints: block restricted items
  const storeChallenge = verified.state.settings.challenge_id
    ? getChallengeById(verified.state.settings.challenge_id)
    : undefined;
  if (storeChallenge) {
    for (const purchase of body.purchases) {
      if (storeChallenge.no_ammo && purchase.item === "ammo") {
        return jsonResponse({ error: "challenge_restricted: ammo" }, 400, origin);
      }
      if (storeChallenge.no_medicine && purchase.item === "medicine") {
        return jsonResponse({ error: "challenge_restricted: medicine" }, 400, origin);
      }
      if (storeChallenge.no_spare_parts && purchase.item === "spare_parts") {
        return jsonResponse({ error: "challenge_restricted: spare_parts" }, 400, origin);
      }
    }
  }

  try {
    const signed_state = await applyStoreAndSign(
      verified.state,
      body.purchases,
      env.HMAC_SECRET,
    );
    return jsonResponse({ signed_state }, 200, origin);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "store_error";
    return jsonResponse({ error: message }, 400, origin);
  }
}

async function handleAdvance(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as AdvanceRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  if (verified.state.simulation.pending_event_hash !== null) {
    return jsonResponse({ error: "resolve_pending_event" }, 400, origin);
  }

  // Apply pace/rations changes from client before simulation
  const stateToAdvance = structuredClone(verified.state);
  const bodyAny = body as Record<string, unknown>;
  const advanceChallenge = stateToAdvance.settings.challenge_id
    ? getChallengeById(stateToAdvance.settings.challenge_id)
    : undefined;

  if (advanceChallenge?.force_pace) {
    stateToAdvance.settings.pace = advanceChallenge.force_pace;
  } else if (bodyAny.pace && ["steady", "strenuous", "grueling"].includes(bodyAny.pace as string)) {
    stateToAdvance.settings.pace = bodyAny.pace as GameState["settings"]["pace"];
  }
  if (advanceChallenge?.force_rations) {
    stateToAdvance.settings.rations = advanceChallenge.force_rations;
  } else if (bodyAny.rations && ["filling", "meager", "bare_bones"].includes(bodyAny.rations as string)) {
    stateToAdvance.settings.rations = bodyAny.rations as GameState["settings"]["rations"];
  }

  const historical = ctx as unknown as HistoricalContext;
  const result = advanceDays(stateToAdvance, historical);

  let eventData: EventResponse | null = null;

  if (result.trigger === "event") {
    try {
      const prompt = assembleEventPrompt(result.state, historical);
      const raw = await callAnthropic(
        prompt.system,
        prompt.user,
        env.ANTHROPIC_API_KEY,
      );
      eventData = parseEventResponse(raw);
    } catch {
      // Fall back to pre-written events
      const tier = result.state.settings.tone_tier;
      const fallbacks = FALLBACK_EVENTS[tier];
      eventData = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }

  // If we have an event, hash it and embed in state
  if (eventData) {
    const eventHash = await hashEvent(eventData);
    result.state.simulation.pending_event_hash = eventHash;
  }

  // Re-sign the state
  const signature = await signState(result.state, env.HMAC_SECRET);
  const signed_state: SignedGameState = {
    state: result.state,
    signature,
  };

  // Enrich landmark trigger_data with full landmark info
  if (result.trigger === "landmark") {
    const lm = (ctx as unknown as HistoricalContext).landmarks.find(
      l => l.id === (result.triggerData as any).landmark_id
    );
    if (lm) {
      result.triggerData = lm;
    }
  }

  const response: AdvanceResponse = {
    days_advanced: result.summaries.length,
    summaries: result.summaries,
    trigger: result.trigger,
    trigger_data: result.trigger === "event" ? eventData : result.triggerData,
    signed_state,
  };

  return jsonResponse(response, 200, origin);
}

async function handleChoice(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as ChoiceRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  // Verify event hash matches
  const submittedHash = await hashEvent(body.event);
  if (verified.state.simulation.pending_event_hash !== submittedHash) {
    return jsonResponse({ error: "event_hash_mismatch" }, 400, origin);
  }

  if (
    typeof body.choice_index !== "number" ||
    body.choice_index < 0 ||
    body.choice_index >= body.event.choices.length
  ) {
    return jsonResponse({ error: "invalid_choice_index" }, 400, origin);
  }

  // Clear pending event hash before applying
  const stateForApply = structuredClone(verified.state);
  stateForApply.simulation.pending_event_hash = null;
  stateForApply.simulation.days_since_last_event = 0;

  const signed_state = await applyEventAndSign(
    stateForApply,
    body.choice_index,
    body.event,
    env.HMAC_SECRET,
  );

  return jsonResponse({ signed_state }, 200, origin);
}

async function handleNewspaper(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as { signed_state: SignedGameState };

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  const state = verified.state;
  const journalText = state.journal.length > 0
    ? state.journal.map((e, i) => `${i + 1}. ${e}`).join("\n")
    : "No notable events recorded yet.";

  const deathsText = state.deaths.length > 0
    ? state.deaths.map((d) => `${d.name} — ${d.cause} on ${d.date}`).join("\n")
    : "No deaths to report.";

  const prompt = `Write a short newspaper article (3-4 paragraphs) in the style of an 1848 frontier newspaper about the ${state.party.leader_name} party's journey on the Oregon Trail.

Current date: ${state.position.date}
Miles traveled: ${state.position.miles_traveled}
Party members alive: ${state.party.members.filter((m) => m.alive).map((m) => m.name).join(", ")}

Recent journal entries:
${journalText}

Deaths on the trail:
${deathsText}

Write in period-appropriate style. Include a dramatic headline personalized to this party. Return JSON: {"headline": "...", "byline": "By our correspondent", "article_paragraphs": ["paragraph1", "paragraph2", "paragraph3"], "date": "..."}`;

  const survivors = state.party.members.filter((m) => m.alive).map((m) => m.name);
  const deadList = state.deaths.map((d) => ({ name: d.name, cause: d.cause, date: d.date }));

  try {
    const raw = await callAnthropic(
      "You are the editor of the Independence Gazette, 1848. Write frontier newspaper articles.",
      prompt,
      env.ANTHROPIC_API_KEY,
      { maxTokens: 600 },
    );
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
    const parsed = JSON.parse(stripped);
    // Normalize to expected shape
    const newspaper = {
      headline: parsed.headline || "News From The Trail",
      byline: parsed.byline || "By our correspondent",
      article_paragraphs: Array.isArray(parsed.article_paragraphs)
        ? parsed.article_paragraphs
        : (parsed.body || "").split("\n\n").filter(Boolean),
      date: parsed.date || parsed.dateline || state.position.date,
      survivors,
      deaths: deadList,
    };
    return jsonResponse(newspaper, 200, origin);
  } catch {
    return jsonResponse({
      headline: `${state.party.leader_name.toUpperCase()} PARTY: ${survivors.length} OF ${state.party.members.length} SURVIVE`,
      byline: "By our correspondent",
      article_paragraphs: [
        `The ${state.party.leader_name} party, having departed Independence in the spring of 1848, traveled ${state.position.miles_traveled} miles along the Oregon Trail.`,
        state.deaths.length > 0
          ? `The trail claimed ${state.deaths.length}: ${state.deaths.map((d) => `${d.name} (${d.cause})`).join(", ")}.`
          : "All members of the party survived the journey.",
      ],
      date: state.position.date,
      survivors,
      deaths: deadList,
    }, 200, origin);
  }
}

async function handleEpitaph(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as {
    signed_state: SignedGameState;
    name: string;
  };

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  const death = verified.state.deaths.find((d) => d.name === body.name);
  if (!death) {
    return jsonResponse({ error: "death_not_found" }, 400, origin);
  }

  try {
    const raw = await callAnthropic(
      "You write gravestone inscriptions for Oregon Trail emigrants, 1848. One line only. Period appropriate. Solemn.",
      `Write a one-line gravestone inscription for ${death.name}, who died of ${death.cause} on ${death.date} on the Oregon Trail. Return only the inscription text, no quotes or formatting.`,
      env.ANTHROPIC_API_KEY,
      { maxTokens: 60, timeout: 5000 },
    );
    return jsonResponse({ epitaph: raw.trim() }, 200, origin);
  } catch {
    return jsonResponse(
      { epitaph: `Here lies ${death.name}. Gone to rest, ${death.date}.` },
      200,
      origin,
    );
  }
}

async function handleRiver(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as {
    signed_state: SignedGameState;
    crossing_id: string;
    choice: "ford" | "caulk" | "ferry";
  };

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  const validChoices = ["ford", "caulk", "ferry"];
  if (!validChoices.includes(body.choice)) {
    return jsonResponse({ error: "invalid_choice" }, 400, origin);
  }

  // Find the crossing in the current segment
  const historical = ctx as unknown as HistoricalContext;
  const segment = historical.segments.find(
    (s) => s.id === verified.state.position.current_segment_id,
  );
  if (!segment) {
    return jsonResponse({ error: "segment_not_found" }, 400, origin);
  }

  const crossing = segment.river_crossings.find((rc) => rc.id === body.crossing_id);
  if (!crossing) {
    return jsonResponse({ error: "crossing_not_found" }, 400, origin);
  }

  // Already resolved?
  if (verified.state.simulation.resolved_crossings.includes(body.crossing_id)) {
    return jsonResponse({ error: "crossing_already_resolved" }, 400, origin);
  }

  const next = structuredClone(verified.state);
  let narrative = "";
  const month = parseInt(next.position.date.split("-")[1], 10);
  const isSpring = month >= 4 && month <= 6;
  const depth = isSpring ? crossing.depth_ft_spring : crossing.depth_ft_summer;

  if (body.choice === "ford") {
    const oxenMod = Math.min(1.0, next.supplies.oxen / 6);
    const successProb = ((6 - crossing.ford_difficulty) / 5) * oxenMod;
    const success = Math.random() < successProb;

    if (success) {
      narrative = `The party forded ${crossing.name} without incident. The water ran ${depth} feet deep.`;
    } else {
      // Fail: lose 10-30% food, random member takes damage
      const foodLoss = Math.round(next.supplies.food * (0.1 + Math.random() * 0.2));
      next.supplies.food = Math.max(0, next.supplies.food - foodLoss);
      const alive = next.party.members.filter((m) => m.alive);
      if (alive.length > 0) {
        const victim = alive[Math.floor(Math.random() * alive.length)];
        const damage = 20 + Math.floor(Math.random() * 20);
        victim.health = Math.max(0, victim.health - damage);
        if (victim.health === 0) {
          victim.alive = false;
          next.deaths.push({ name: victim.name, date: next.position.date, cause: "drowning", epitaph: null });
        }
        narrative = `Fording ${crossing.name} went badly. Lost ${foodLoss}lbs of food. ${victim.name} was swept downstream and injured.`;
      }
    }
    // 1 day delay
    const d = new Date(next.position.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    next.position.date = d.toISOString().split("T")[0];

  } else if (body.choice === "caulk") {
    const success = Math.random() < 0.7;

    if (success) {
      narrative = `The wagon floated across ${crossing.name} without much trouble.`;
    } else {
      const foodLoss = Math.round(next.supplies.food * (0.2 + Math.random() * 0.3));
      const ammoLoss = Math.round(next.supplies.ammo * (0.2 + Math.random() * 0.3));
      next.supplies.food = Math.max(0, next.supplies.food - foodLoss);
      next.supplies.ammo = Math.max(0, next.supplies.ammo - ammoLoss);
      const alive = next.party.members.filter((m) => m.alive);
      if (alive.length > 0) {
        const victim = alive[Math.floor(Math.random() * alive.length)];
        victim.health = Math.max(0, victim.health - 60);
        if (victim.health === 0) {
          victim.alive = false;
          next.deaths.push({ name: victim.name, date: next.position.date, cause: "drowning", epitaph: null });
        }
        narrative = `The wagon tipped crossing ${crossing.name}. Lost supplies. ${victim.name} nearly drowned.`;
      }
    }
    const d = new Date(next.position.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    next.position.date = d.toISOString().split("T")[0];

  } else if (body.choice === "ferry") {
    if (!crossing.ferry_available) {
      return jsonResponse({ error: "no_ferry_available" }, 400, origin);
    }
    const cost = (crossing.ferry_cost_1848_dollars || 0) * 100; // convert to cents
    if (next.supplies.money < cost) {
      return jsonResponse({ error: "insufficient_funds" }, 400, origin);
    }
    next.supplies.money -= cost;
    narrative = `Paid $${(cost / 100).toFixed(2)} for the ferry across ${crossing.name}. Safe crossing.`;
  }

  // Mark crossing resolved
  next.simulation.resolved_crossings.push(body.crossing_id);

  // Add journal entry
  next.journal.push(narrative);
  if (next.journal.length > 5) {
    next.journal = next.journal.slice(-5);
  }

  const signature = await signState(next, env.HMAC_SECRET);
  return jsonResponse({ signed_state: { state: next, signature }, narrative }, 200, origin);
}

function mapTradeItemToSupplyKey(itemName: string): keyof GameState["supplies"] | null {
  const lower = itemName.toLowerCase();
  if (/flour|bacon|coffee|sugar|food/.test(lower)) return "food";
  if (/ammunition|ammo/.test(lower)) return "ammo";
  if (/clothing|blanket/.test(lower)) return "clothing";
  if (/medicine|laudanum|quinine/.test(lower)) return "medicine";
  if (/oxen|ox|mule/.test(lower)) return "oxen";
  if (/wheel|axle|tongue/.test(lower)) return "spare_parts";
  return null;
}

async function handleLandmark(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as LandmarkRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  if (!body.landmark_id || !["rest", "trade"].includes(body.action)) {
    return jsonResponse({ error: "invalid_request" }, 400, origin);
  }

  // Verify player has visited this landmark
  if (!verified.state.simulation.visited_landmarks.includes(body.landmark_id)) {
    return jsonResponse({ error: "landmark_not_visited" }, 400, origin);
  }

  const next = structuredClone(verified.state);
  const historical = ctx as unknown as HistoricalContext;

  if (body.action === "rest") {
    const restUsed = next.simulation.landmark_rest_used ?? [];
    const restCount = restUsed.filter(id => id === body.landmark_id).length;
    if (restCount >= 3) {
      return jsonResponse({ error: "rest_limit_reached" }, 400, origin);
    }
    next.simulation.landmark_rest_used = [...restUsed, body.landmark_id];

    // Advance date +1 day
    const d = new Date(next.position.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    next.position.date = d.toISOString().split("T")[0];

    // Heal all living members +10 health (capped 100)
    for (const member of next.party.members) {
      if (!member.alive) continue;
      member.health = Math.min(100, member.health + 10);
    }

    // Deduct food for the day
    const alive = next.party.members.filter(m => m.alive).length;
    const foodPerDay = 3 * alive; // filling rations equivalent for rest
    next.supplies.food = Math.max(0, next.supplies.food - foodPerDay);

    const signature = await signState(next, env.HMAC_SECRET);
    return jsonResponse({
      signed_state: { state: next, signature },
      message: "The party rested for a day and recovered some strength.",
    }, 200, origin);
  }

  // TRADE action
  const landmark = getLandmarkById(historical, body.landmark_id);
  if (!landmark) {
    return jsonResponse({ error: "landmark_not_found" }, 400, origin);
  }

  if (!landmark.trade_inventory || landmark.trade_inventory.length === 0) {
    return jsonResponse({ error: "no_trade_available" }, 400, origin);
  }

  if (!Array.isArray(body.trade_items) || body.trade_items.length === 0) {
    return jsonResponse({ error: "no_items_specified" }, 400, origin);
  }

  const tradeChallenge = next.settings.challenge_id ? getChallengeById(next.settings.challenge_id) : undefined;
  if (tradeChallenge) {
    for (const tradeReq of body.trade_items) {
      const supplyKey = mapTradeItemToSupplyKey(tradeReq.item);
      if (tradeChallenge.no_ammo && supplyKey === "ammo") return jsonResponse({ error: "challenge_restricted: ammo" }, 400, origin);
      if (tradeChallenge.no_medicine && supplyKey === "medicine") return jsonResponse({ error: "challenge_restricted: medicine" }, 400, origin);
      if (tradeChallenge.no_spare_parts && supplyKey === "spare_parts") return jsonResponse({ error: "challenge_restricted: spare_parts" }, 400, origin);
    }
  }

  let totalCost = 0;
  const purchases: { supplyKey: keyof GameState["supplies"]; amount: number; name: string }[] = [];

  for (const tradeReq of body.trade_items) {
    if (!tradeReq.item || typeof tradeReq.quantity !== "number" || tradeReq.quantity <= 0) {
      return jsonResponse({ error: `invalid_trade_item: ${tradeReq.item}` }, 400, origin);
    }

    const inventoryItem = landmark.trade_inventory.find(
      ti => ti.item.toLowerCase() === tradeReq.item.toLowerCase()
    );
    if (!inventoryItem) {
      return jsonResponse({ error: `item_not_available: ${tradeReq.item}` }, 400, origin);
    }

    const supplyKey = mapTradeItemToSupplyKey(inventoryItem.item);
    if (!supplyKey) {
      return jsonResponse({ error: `unmappable_item: ${tradeReq.item}` }, 400, origin);
    }

    const cost = inventoryItem.price_1848_cents * tradeReq.quantity;
    totalCost += cost;

    // Calculate supply amount: food items = 1 lb per 5 cents, others = quantity
    let amount: number;
    if (supplyKey === "food") {
      amount = Math.max(1, Math.round((inventoryItem.price_1848_cents * tradeReq.quantity) / 5));
    } else {
      amount = tradeReq.quantity;
    }

    purchases.push({ supplyKey, amount, name: inventoryItem.item });
  }

  if (totalCost > next.supplies.money) {
    return jsonResponse({ error: "insufficient_funds" }, 400, origin);
  }

  // Apply purchases
  next.supplies.money -= totalCost;
  for (const p of purchases) {
    next.supplies[p.supplyKey] += p.amount;
  }

  const itemNames = purchases.map(p => p.name).join(", ");
  const signature = await signState(next, env.HMAC_SECRET);
  return jsonResponse({
    signed_state: { state: next, signature },
    message: `Traded for ${itemNames} at ${landmark.name}.`,
  }, 200, origin);
}

async function handleHunt(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as HuntRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  // Challenge constraint: no hunting
  const huntChallenge = verified.state.settings.challenge_id
    ? getChallengeById(verified.state.settings.challenge_id)
    : undefined;
  if (huntChallenge?.no_hunting) {
    return jsonResponse({ error: "hunting_not_allowed" }, 400, origin);
  }

  const ammoSpent = body.ammo_spent;
  if (typeof ammoSpent !== "number" || ammoSpent <= 0) {
    return jsonResponse({ error: "invalid_ammo_spent" }, 400, origin);
  }
  if (ammoSpent > verified.state.supplies.ammo) {
    return jsonResponse({ error: "insufficient_ammo" }, 400, origin);
  }
  if (ammoSpent > 20) {
    return jsonResponse({ error: "ammo_cap_exceeded: max 20 per hunt" }, 400, origin);
  }

  const next = structuredClone(verified.state);
  const hits = { rabbit: 0, deer: 0, buffalo: 0, miss: 0 };
  let foodGained = 0;

  for (let i = 0; i < ammoSpent; i++) {
    const roll = Math.random();
    if (roll < 0.4) {
      hits.miss++;
    } else if (roll < 0.7) {
      hits.rabbit++;
      foodGained += 5;
    } else if (roll < 0.9) {
      hits.deer++;
      foodGained += 15;
    } else {
      hits.buffalo++;
      foodGained += 40;
    }
  }

  // Cap food per hunt
  foodGained = Math.min(200, foodGained);

  // Apply: deduct ammo, add food, advance date +1 day
  next.supplies.ammo -= ammoSpent;
  next.supplies.food += foodGained;

  const d = new Date(next.position.date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  next.position.date = d.toISOString().split("T")[0];

  const results: HuntResult = {
    shots: ammoSpent,
    hits,
    food_gained: foodGained,
  };

  const signature = await signState(next, env.HMAC_SECRET);
  return jsonResponse({
    signed_state: { state: next, signature },
    results,
  }, 200, origin);
}
