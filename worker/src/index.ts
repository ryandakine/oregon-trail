import { createInitialState, verifyIncomingState, applyEventAndSign, applyStoreAndSign } from "./state";
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
} from "./types";
import ctx from "./historical-context.json";

export interface Env {
  HMAC_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

// Rate limiter: in-memory Map, 30 calls/min per IP
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
  return entry.count <= 30;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const origin = env.ALLOWED_ORIGIN || "*";
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
  );

  // Generate a trail rumor
  let rumor = "They say the trail is long and the rivers run deep this spring.";
  try {
    rumor = await callAnthropic(
      "You are a frontier storyteller in 1848 Independence, Missouri.",
      `Give a one-sentence trail rumor that ${leaderName}'s party might hear before departing for Oregon. Be specific and period-accurate. Return only the sentence, no quotes.`,
      env.ANTHROPIC_API_KEY,
      { maxTokens: 100, timeout: 5000 },
    );
  } catch {
    // Use the default rumor
  }

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

  // Apply pace/rations changes from client before simulation
  const stateToAdvance = structuredClone(verified.state);
  const bodyAny = body as Record<string, unknown>;
  if (bodyAny.pace && ["steady", "strenuous", "grueling"].includes(bodyAny.pace as string)) {
    stateToAdvance.settings.pace = bodyAny.pace as GameState["settings"]["pace"];
  }
  if (bodyAny.rations && ["filling", "meager", "bare_bones"].includes(bodyAny.rations as string)) {
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

Write in period-appropriate style. Include a headline. Return JSON: {"headline": "...", "body": "...", "dateline": "..."}`;

  try {
    const raw = await callAnthropic(
      "You are the editor of the Independence Gazette, 1848. Write frontier newspaper articles.",
      prompt,
      env.ANTHROPIC_API_KEY,
      { maxTokens: 600 },
    );
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
    const newspaper = JSON.parse(stripped);
    return jsonResponse({ newspaper }, 200, origin);
  } catch {
    return jsonResponse({
      newspaper: {
        headline: "News From The Trail",
        body: `The ${state.party.leader_name} party continues westward, having traveled ${state.position.miles_traveled} miles.`,
        dateline: state.position.date,
      },
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
