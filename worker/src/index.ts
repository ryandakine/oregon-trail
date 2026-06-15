import { createInitialState, verifyIncomingState, applyEventAndSign, applyStoreAndSign, getChallengeById, getCurrentChallenge, WEEKLY_CHALLENGES, STORE_PRICES, REST_HEAL_PER_DAY, REST_FOOD_PER_MEMBER_PER_DAY, CAMP_SANITY_RESTORE_PER_DAY, enqueuePendingEffect } from "./state";
import { assembleEventPrompt } from "./prompt-assembly";
import { callAnthropic, parseEventResponse, FALLBACK_EVENTS, generateLongNight, buildLongNightFallback, bitterPathConsequences } from "./anthropic";
import { guardPaidCall, type RateLimitBinding } from "./paid-guard";
import { advanceDays, applyDailyAttrition, drainPendingEffects, parseMonth } from "./simulation";
import { signState, deepCanonicalize, bufferToHex } from "./hmac";
import { computeRunScore } from "./scoring";
import { createShareStub, verifyShareStub } from "./share-stub";
import type {
  StartRequest,
  StoreRequest,
  AdvanceRequest,
  ChoiceRequest,
  AdvanceResponse,
  CampRequest,
  CampResponse,
  CampSummary,
  EventResponse,
  GameState,
  PendingEffect,
  PendingEffectSpec,
  SignedGameState,
  ShareInfo,
  HistoricalContext,
  ToneTier,
  LandmarkRequest,
  HuntRequest,
  HuntResult,
} from "./types";
import { getLandmarkById, getSegmentForMile, getTotalTrailDistance } from "./context-loader";
import ctx from "./historical-context.json";

export interface Env {
  HMAC_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  // Branded origin for share links (/r/<id>) and the OG image redirect.
  // Set in wrangler.toml [vars] to https://trail.osi-cyber.com (Worker routes
  // on that host intercept /r/* and /og/* before Pages). Unset → code falls
  // back to the request origin (workers.dev — functional, unbranded).
  SHARE_BASE_URL?: string;
  BITTER_PATH_ENABLED?: string; // "true" | "false"; default "true". Kill switch for the horror-tier hidden path.
  // Per-IP load-shedding for paid (Anthropic) routes. See paid-guard.ts.
  // The real global spend ceiling is a budget on the Anthropic account, not here.
  PAID_LIMITER?: RateLimitBinding;   // native CF Rate Limiting binding (per-colo)
  PAID_PER_IP_DAY_CAP?: string;      // per-IP daily paid-call volume cap (default 60)
  // AI-liveness canary alerting (see scheduled() + runCanary). Optional: if
  // unset the canary logs instead of paging. Set via `wrangler secret put`.
  TELEGRAM_BOT_TOKEN?: string;       // @osi_dispatch_bot
  TELEGRAM_CHAT_ID?: string;
}

// Rate limiter: in-memory Map, 200 calls/min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let rateLimitRequestCount = 0;

// Per-isolate round-robin cursor over FALLBACK_EVENTS, keyed by tone tier.
// Cycling (vs Math.random) guarantees no immediate repeat within an isolate:
// a player who hits two fallbacks in a row sees two distinct events. Per-
// isolate only — best-effort, like the rate limiter — but with 12 events/tier
// the collision window is wide enough that this is a real variety improvement.
const fallbackCursor = new Map<ToneTier, number>();

export function nextFallbackEvent(tier: ToneTier): EventResponse {
  const pool = FALLBACK_EVENTS[tier];
  const cursor = fallbackCursor.get(tier) ?? 0;
  fallbackCursor.set(tier, (cursor + 1) % pool.length);
  return pool[cursor % pool.length];
}

// Test-only: reset the per-isolate fallback cursors so cycling assertions
// start from a known position. Mirrors paid-guard's __resetDayCounts.
export function __resetFallbackCursor(): void {
  fallbackCursor.clear();
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  rateLimitRequestCount++;

  // Periodic cleanup every 100 requests (regardless of IP)
  if (rateLimitRequestCount % 100 === 0 || rateLimitMap.size > 10_000) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }

  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
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

function jsonResponse(
  data: unknown,
  status: number,
  origin: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 20);
}

export async function hashEvent(event: EventResponse): Promise<string> {
  const encoder = new TextEncoder();
  const canonical = deepCanonicalize(event);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return bufferToHex(digest);
}

// ── Per-run share page + OG stub (Phase 2 Bet 1) ──

const SHARE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const TONE_LABELS: Record<ToneTier, string> = {
  low: "Classroom Safe",
  medium: "Dark Frontier",
  high: "Psychological Horror",
};

function shareBase(env: Env, request: Request): string {
  return env.SHARE_BASE_URL || new URL(request.url).origin;
}

// EVERY value interpolated into the result page goes through this — including
// stringified numerics and the challenge id, which is client-supplied at
// /api/start and NOT validated against the challenge list (review finding).
function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shareNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Build the terminal-response share object: score + stub computed on demand
// from a verified state (never stored). Used by /api/advance (terminal
// transition) and /api/newspaper (resumed terminal states).
async function buildShareInfo(
  state: GameState,
  env: Env,
  request: Request,
): Promise<ShareInfo> {
  const score = computeRunScore(state);
  const id = await createShareStub(state, score, env);
  return {
    url: `${shareBase(env, request)}/r/${id}`,
    score,
    challenge_id: state.settings.challenge_id,
  };
}

// GET /r/<id> — per-run result page. The id IS the data: verify (length cap →
// decode → MAC) and render; nothing is stored or looked up.
export async function handleResultPage(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const id = url.pathname.slice("/r/".length);
  const stub = await verifyShareStub(id, env);
  if (!stub) return shareNotFound();

  const formattedScore = stub.sc !== null ? stub.sc.toLocaleString("en-US") : null;
  const headline = stub.o === "arrival"
    ? `Reached Oregon City — ${stub.s}/${stub.p} survived`
    : `Lost on the trail — ${stub.s}/${stub.p} survived`;
  const title = formattedScore !== null ? `${headline} · ${formattedScore} pts` : headline;
  const challengeName = stub.c !== null ? stub.c.replace(/_/g, " ") : null;
  const descriptionParts = [
    `${TONE_LABELS[stub.t]} tone`,
    `${stub.d} days on the trail`,
  ];
  if (challengeName !== null) descriptionParts.push(`${challengeName} challenge`);
  descriptionParts.push("Every event written live by AI");
  const description = descriptionParts.join(" · "); // raw here; escapeHtml() is applied at every insertion site below
  const ogImageUrl = `${shareBase(env, request)}/og/${id}.png`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImageUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<style>
body{margin:0;font-family:'Courier New',monospace;background:#1a1410;color:#d8cdb4;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:420px;padding:32px;border:2px solid #6b5d3f;background:#241d14}
h1{font-size:20px;color:#d4a017;margin:0 0 16px}
ul{list-style:none;padding:0;margin:0 0 20px;line-height:1.9}
a{display:inline-block;padding:10px 16px;background:#d4a017;color:#1a1410;text-decoration:none;font-weight:bold}
p{margin-top:16px;font-size:12px;color:#8a7d63}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(headline)}</h1>
<ul>
<li>Leader: ${escapeHtml(stub.n)}</li>
<li>Survivors: ${escapeHtml(stub.s)}/${escapeHtml(stub.p)}</li>
<li>Miles traveled: ${escapeHtml(stub.m)}</li>
<li>Days on the trail: ${escapeHtml(stub.d)}</li>
${formattedScore !== null ? `<li>Score: ${escapeHtml(formattedScore)} pts</li>` : ""}
<li>Tone: ${escapeHtml(TONE_LABELS[stub.t])}</li>
${challengeName !== null ? `<li>Challenge: ${escapeHtml(challengeName)}</li>` : ""}
</ul>
<a href="https://trail.osi-cyber.com/?utm_source=oregon-trail&amp;utm_medium=result_page">Blaze your own trail &#8594;</a>
<p>Every event in this run was written live by AI.</p>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": SHARE_CACHE_CONTROL,
    },
  });
}

// GET /og/<id>.png — Tier A: verified ids 302 to the static OG card. Tier B
// (per-run rendered PNG) is a follow-up behind a measured bundle-size gate;
// this URL contract does not change.
export async function handleOgImage(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  let id = url.pathname.slice("/og/".length);
  if (id.endsWith(".png")) id = id.slice(0, -".png".length);
  const stub = await verifyShareStub(id, env);
  if (!stub) return shareNotFound();
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${shareBase(env, request)}/og-image.png`,
      "Cache-Control": SHARE_CACHE_CONTROL,
    },
  });
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
      // Per-run share surfaces — dynamic GETs prefix-matched BEFORE the
      // exact-match switch (pinned routing pattern, PHASE2_BIG_BETS_PLAN.md
      // decision 4). NO guardPaidCall here: these routes spend no LLM tokens;
      // the coarse limiter above already applied.
      if (request.method === "GET" && url.pathname.startsWith("/r/")) {
        return await handleResultPage(request, env, url);
      }
      if (request.method === "GET" && url.pathname.startsWith("/og/")) {
        return await handleOgImage(request, env, url);
      }

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
        case "/api/camp":
          return await handleCamp(request, env, origin);
        case "/api/bitter_path":
          return await handleBitterPath(request, env, origin);
        case "/api/bitter_path_skip":
          return await handleBitterPathSkip(request, env, origin);
        case "/api/prices":
          if (request.method === "GET") {
            // Static store-price table — safe to cache at the edge/browser for
            // 5 min. Hit on every play; no per-request variation.
            return jsonResponse({ prices: STORE_PRICES }, 200, origin, {
              "Cache-Control": "public, max-age=300",
            });
          }
          return jsonResponse({ error: "method_not_allowed" }, 405, origin);
        case "/api/challenge":
          if (request.method === "GET") {
            const current = getCurrentChallenge();
            // Weekly challenge rotates on a 7-day boundary, so a 1h cache is
            // safe and shaves a request off every play.
            return jsonResponse({ current, all: WEEKLY_CHALLENGES }, 200, origin, {
              "Cache-Control": "public, max-age=3600",
            });
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

  // AI-liveness canary (Cron Trigger — see wrangler.toml [triggers]).
  // The "dead/out-of-credit key silently serves canned fallbacks at HTTP 200"
  // failure ran for weeks undetected because nothing checked the LLM path.
  // This probes the exact failure: one trivial Anthropic call; if it throws
  // (dead key, no credit, 4xx, sustained overload), page via Telegram. Cost is
  // a few tokens × 4/day. Healthy → silent.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCanary(env));
  },
};

async function runCanary(env: Env): Promise<void> {
  let detail = "";
  try {
    const raw = await callAnthropic(
      "Reply with the single word: OK.",
      "ping",
      env.ANTHROPIC_API_KEY,
      { maxTokens: 8, timeout: 8000 },
    );
    if (typeof raw === "string" && raw.trim().length > 0) {
      console.log("canary_ok", JSON.stringify({ ts: new Date().toISOString() }));
      return; // healthy → silent
    }
    detail = "empty response from model";
  } catch (e) {
    detail = String(e).slice(0, 160);
  }
  console.error("canary_failed", JSON.stringify({ detail }));
  await sendTelegram(
    env,
    `🛑 Oregon Trail AI canary FAILED — trail.osi-cyber.com is serving canned fallback events (players see no AI). callAnthropic error: ${detail}`,
  );
}

async function sendTelegram(env: Env, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    // No channel configured — at least leave a loud log line for tail/Logpush.
    console.error("canary_alert_unsent", JSON.stringify({ text }));
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch (e) {
    console.error("canary_alert_failed", JSON.stringify({ msg: String(e).slice(0, 120) }));
  }
}

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

export async function handleStore(
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
  const bodyAny = body as unknown as Record<string, unknown>;
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
  const bitterPathEnabled = env.BITTER_PATH_ENABLED !== "false"; // default on
  const result = advanceDays(stateToAdvance, historical, { bitterPathEnabled });

  let eventData: EventResponse | null = null;
  // Tracks whether the event the player sees came from the live LLM or a
  // hand-written fallback. Surfaced in the response (event_source) and logged,
  // so fallback-rate is observable — the dead-key outage hid for weeks because
  // fallbacks are served as HTTP 200 and nothing recorded which was which.
  let eventSource: "llm" | "fallback" | null = null;

  if (result.trigger === "event") {
    const tier = result.state.settings.tone_tier;
    const pickFallback = () => nextFallbackEvent(tier);
    // Per-IP paid-call guard. On block, serve the existing fallback (free) and
    // skip Anthropic entirely — never 429 here, which would discard the
    // already-advanced simulation step above.
    const guard = await guardPaidCall(env, request);
    if (!guard.allowed) {
      console.warn("spend_rate_block", JSON.stringify({ route: "advance", reason: guard.reason }));
      eventData = pickFallback();
      eventSource = "fallback";
    } else {
      try {
        const prompt = assembleEventPrompt(result.state, historical);
        const raw = await callAnthropic(
          prompt.system,
          prompt.user,
          env.ANTHROPIC_API_KEY,
        );
        eventData = parseEventResponse(raw);
        eventSource = "llm";
      } catch (e) {
        // Anthropic threw (timeout, or a 4xx like dead key / no credit). Log
        // the cause — secret-free, status + truncated message only — so an
        // exhausted/invalid key is never again silently invisible.
        console.warn("llm_fallback", JSON.stringify({ route: "advance", msg: String(e).slice(0, 120) }));
        eventData = pickFallback();
        eventSource = "fallback";
      }
    }
  } else if (result.trigger === "bitter_path") {
    const td = result.triggerData as {
      dead_member_name: string;
      dead_member_cause: string;
      days_since_death: number;
    };
    const firstAlive = result.state.party.members.find((m) => m.alive);
    const survivorName = firstAlive ? firstAlive.name : "someone";
    // Same per-IP guard. On block, build the hand-written Long Night fallback
    // directly (generateLongNight would otherwise spend on Anthropic).
    const guard = await guardPaidCall(env, request);
    if (!guard.allowed) {
      console.warn("spend_rate_block", JSON.stringify({ route: "advance", reason: guard.reason, kind: "bitter_path" }));
      eventData = buildLongNightFallback(
        td.dead_member_name,
        td.dead_member_cause,
        td.days_since_death,
        survivorName,
      );
      eventSource = "fallback";
    } else {
      // generateLongNight may itself fall back internally on an API error; from
      // here we only know an LLM call was attempted. The scheduled canary is
      // the authoritative dead-key detector — this flag is best-effort.
      eventData = await generateLongNight(
        td.dead_member_name,
        td.dead_member_cause,
        td.days_since_death,
        survivorName,
        env.ANTHROPIC_API_KEY,
      );
      eventSource = "llm";
    }
  }

  // Observability: emit which source served the event so fallback-rate is
  // visible in `wrangler tail` / Logpush without exposing any secret.
  if (eventSource) {
    console.log("event_source", JSON.stringify({ trigger: result.trigger, source: eventSource }));
  }

  // If we have an event, hash it and embed in state along with the trigger
  // kind. The trigger kind is critical: without it, a client could take a
  // regular event's pending hash and post it to /api/bitter_path to claim
  // bitter-path consequences for free. Each consumer handler verifies the
  // trigger matches before applying effects.
  if (eventData) {
    const eventHash = await hashEvent(eventData);
    result.state.simulation.pending_event_hash = eventHash;
    result.state.simulation.pending_event_trigger =
      result.trigger === "bitter_path" ? "bitter_path" : "event";
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

  // For the bitter_path trigger, the client needs BOTH the EventResponse body
  // (so it can echo it back to /api/bitter_path for the event-hash check) AND
  // the simulation metadata (dead_member_name, trigger_variant,
  // days_since_death) for display tuning. Ship them in separate fields.
  let triggerData: unknown;
  let triggerMeta: unknown;
  if (result.trigger === "event") {
    triggerData = eventData;
  } else if (result.trigger === "bitter_path") {
    triggerData = eventData;
    triggerMeta = result.triggerData;
  } else {
    triggerData = result.triggerData;
  }

  // Terminal transition — server-detected on the state THIS call simulated,
  // never client-claimed. Attach the per-run share payload (response-only).
  let share: ShareInfo | undefined;
  if (result.trigger === "arrival" || result.trigger === "wipe") {
    share = await buildShareInfo(result.state, env, request);
  }

  const response: AdvanceResponse = {
    days_advanced: result.summaries.length,
    summaries: result.summaries,
    trigger: result.trigger,
    trigger_data: triggerData,
    trigger_meta: triggerMeta,
    event_source: eventSource ?? undefined,
    share,
    signed_state,
  };

  return jsonResponse(response, 200, origin);
}

// Resolve a fuse's target to a concrete member_name. "actor" → first LIVING
// member named in personality_effects, else the leader, else any living member
// (a fuse always lands on a real living member, never a dead/nonexistent one).
// "all"/unset → undefined (drain applies to all living). personality_effects is
// empty on every fallback and many LLM events, so actor commonly collapses to
// the leader — acceptable for V1 (consequences-pillar.md §5).
function resolveFuseTarget(state: GameState, event: EventResponse, fuse: PendingEffectSpec): string | undefined {
  if (fuse.target !== "actor") return undefined;
  const living = state.party.members.filter((m) => m.alive);
  for (const name of Object.keys(event.personality_effects)) {
    if (living.some((m) => m.name === name)) return name;
  }
  const leader = living.find((m) => m.name === state.party.leader_name);
  return leader ? leader.name : living[0]?.name;
}

// Enqueue the CHOSEN choice's delayed effects onto the state, server-side. The
// fuses were minted+sanitized in parseEventResponse and are hash-bound, so no
// re-validation here. Non-chosen choices' fuses are discarded. Mutates state.
export function enqueueChoiceDelayedEffects(state: GameState, event: EventResponse, choiceIndex: number): void {
  const fuses = event.choices[choiceIndex]?.delayed_effects;
  if (!fuses || fuses.length === 0) return;
  for (const fuse of fuses) {
    const memberName = resolveFuseTarget(state, event, fuse);
    const effect: PendingEffect = {
      id: crypto.randomUUID(),
      days_remaining: fuse.days_remaining,
      consequences: fuse.consequences,
      source: event.title || "event",
      ...(memberName !== undefined ? { member_name: memberName } : {}),
      ...(fuse.journal_entry !== undefined ? { journal_entry: fuse.journal_entry } : {}),
    };
    enqueuePendingEffect(state.simulation, effect);
  }
}

export async function handleChoice(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as ChoiceRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  // Verify event hash matches AND trigger kind is "event". Without the
  // trigger check, a client could take a bitter_path pending hash and route
  // it through /api/choice — different consequence application, same exploit
  // shape as the reverse direction.
  const submittedHash = await hashEvent(body.event);
  if (verified.state.simulation.pending_event_hash !== submittedHash) {
    return jsonResponse({ error: "event_hash_mismatch" }, 400, origin);
  }
  if (verified.state.simulation.pending_event_trigger !== "event") {
    return jsonResponse({ error: "wrong_trigger_kind" }, 400, origin);
  }

  if (
    typeof body.choice_index !== "number" ||
    body.choice_index < 0 ||
    body.choice_index >= body.event.choices.length
  ) {
    return jsonResponse({ error: "invalid_choice_index" }, 400, origin);
  }

  // Clear pending event hash + trigger before applying
  const stateForApply = structuredClone(verified.state);
  stateForApply.simulation.pending_event_hash = null;
  stateForApply.simulation.pending_event_trigger = null;
  stateForApply.simulation.days_since_last_event = 0;

  // Record the resolved event's title for anti-repetition. Keep the last 5;
  // assembleEventPrompt surfaces these as a "do NOT repeat" line on the next
  // generation. Defensive against pre-field-migration states (?? []).
  const recentTitles = stateForApply.simulation.recent_event_titles ?? [];
  if (typeof body.event.title === "string" && body.event.title.length > 0) {
    recentTitles.push(body.event.title);
  }
  stateForApply.simulation.recent_event_titles = recentTitles.slice(-5);

  // Enqueue any delayed effects the chosen choice scheduled (server-side; fuses
  // are hash-bound + sanitized at mint). applyEventAndSign clones stateForApply,
  // so enqueuing here rides into the signed state. Drained later by advanceDays /
  // handleCamp. See docs/design/consequences-pillar.md §2.2.
  enqueueChoiceDelayedEffects(stateForApply, body.event, body.choice_index);

  const signed_state = await applyEventAndSign(
    stateForApply,
    body.choice_index,
    body.event,
    env.HMAC_SECRET,
  );

  return jsonResponse({ signed_state }, 200, origin);
}

export async function handleBitterPath(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as ChoiceRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  // Event-hash binding AND trigger-kind check. Both are required: the hash
  // stops clients from fabricating event bodies; the trigger check stops a
  // client from routing a regular event's pending hash through this endpoint
  // to claim bitter-path consequences (+60 food, starvation reset) for free.
  const submittedHash = await hashEvent(body.event);
  if (verified.state.simulation.pending_event_hash !== submittedHash) {
    return jsonResponse({ error: "event_hash_mismatch" }, 400, origin);
  }
  if (verified.state.simulation.pending_event_trigger !== "bitter_path") {
    return jsonResponse({ error: "wrong_trigger_kind" }, 400, origin);
  }

  // Integer check blocks fractional indices (e.g. 1.5) falling through to
  // the "taken" consequence branch.
  if (
    !Number.isInteger(body.choice_index) ||
    body.choice_index < 0 ||
    body.choice_index > 2
  ) {
    return jsonResponse({ error: "invalid_choice_index" }, 400, origin);
  }

  // Refuse if the path has already been resolved this run — shouldn't happen
  // because the trigger doesn't re-fire, but defend against replay.
  if (verified.state.simulation.bitter_path_taken !== "none") {
    return jsonResponse({ error: "already_resolved" }, 400, origin);
  }

  const next = structuredClone(verified.state);
  const effects = bitterPathConsequences(body.choice_index as 0 | 1 | 2);

  next.simulation.bitter_path_taken = effects.bitter_path_taken;
  next.simulation.pending_event_hash = null;
  next.simulation.pending_event_trigger = null;
  next.simulation.days_since_last_event = 0;

  if (effects.food_delta !== 0) {
    next.supplies.food = Math.max(0, next.supplies.food + effects.food_delta);
  }
  if (effects.starvation_days_reset) {
    next.simulation.starvation_days = 0;
  }
  for (const m of next.party.members) {
    if (!m.alive) continue;
    if (effects.morale_delta_per_member !== 0) {
      m.morale = Math.max(0, Math.min(100, m.morale + effects.morale_delta_per_member));
    }
    if (effects.sanity_delta_per_member !== 0) {
      m.sanity = Math.max(0, Math.min(100, m.sanity + effects.sanity_delta_per_member));
    }
  }
  if (effects.days_delta > 0) {
    const d = new Date(next.position.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + effects.days_delta);
    next.position.date = d.toISOString().split("T")[0];
  }

  next.journal.push(body.event.journal_entry);
  if (next.journal.length > 5) next.journal = next.journal.slice(-5);
  next.meta.event_count += 1;

  const signature = await signState(next, env.HMAC_SECRET);
  const signed_state: SignedGameState = { state: next, signature };
  return jsonResponse({ signed_state, outcome: effects.bitter_path_taken }, 200, origin);
}

// Skip endpoint: fires when the player opts out of the Long Night scene via
// the content-warning gate before seeing the scene body. Requires the same
// event-hash echo as /api/bitter_path so a client cannot skip without first
// having received a legitimate bitter_path trigger. Mechanically a no-op —
// no food, morale, sanity, or days delta — so we are not rewarding skip.
// The enum value "refused" lets newspaper copy + telemetry distinguish
// opt-out from the dignified choice.
export async function handleBitterPathSkip(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as {
    signed_state: SignedGameState;
    event: EventResponse;
  };

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  // Hash + trigger-kind check. Without the trigger check, a client could
  // use a regular event's pending hash to hit this endpoint and erase the
  // event at zero cost (no consequences applied, pending hash cleared).
  const submittedHash = await hashEvent(body.event);
  if (verified.state.simulation.pending_event_hash !== submittedHash) {
    return jsonResponse({ error: "event_hash_mismatch" }, 400, origin);
  }
  if (verified.state.simulation.pending_event_trigger !== "bitter_path") {
    return jsonResponse({ error: "wrong_trigger_kind" }, 400, origin);
  }

  if (verified.state.simulation.bitter_path_taken !== "none") {
    return jsonResponse({ error: "already_resolved" }, 400, origin);
  }

  const next = structuredClone(verified.state);
  next.simulation.bitter_path_taken = "refused";
  next.simulation.pending_event_hash = null;
  next.simulation.pending_event_trigger = null;
  next.simulation.days_since_last_event = 0;

  // Skip-specific journal beat — does not reveal scene content to players who
  // opted out. Same 5-entry cap as other journal writes.
  next.journal.push("We turned away from what the trail asked of us.");
  if (next.journal.length > 5) next.journal = next.journal.slice(-5);
  next.meta.event_count += 1;

  const signature = await signState(next, env.HMAC_SECRET);
  const signed_state: SignedGameState = { state: next, signature };
  return jsonResponse({ signed_state, outcome: "refused" }, 200, origin);
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

  // Phase gate: newspaper only valid at arrival or wipe (miles >= 1700 or all dead)
  const allDead = state.party.members.every((m) => !m.alive);
  const arrived = state.position.miles_traveled >= 1700;
  if (!allDead && !arrived) {
    return jsonResponse({ error: "newspaper_not_available" }, 400, origin);
  }

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

  // Share stub computed in place from the already-verified state — response-
  // only, no re-sign (stub creation never mutates state). Covers resumed
  // terminal states whose /api/advance share response was lost.
  const share = await buildShareInfo(state, env, request);

  const guard = await guardPaidCall(env, request);
  if (guard.allowed) {
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
        share,
      };
      return jsonResponse(newspaper, 200, origin);
    } catch (e) {
      console.warn("llm_fallback", JSON.stringify({ route: "newspaper", msg: String(e).slice(0, 120) }));
    }
  } else {
    console.warn("spend_rate_block", JSON.stringify({ route: "newspaper", reason: guard.reason }));
  }
  // Fallback: guard-blocked or Anthropic failed.
  {
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
      share,
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

  const guard = await guardPaidCall(env, request);
  if (guard.allowed) {
    try {
      const raw = await callAnthropic(
        "You write gravestone inscriptions for Oregon Trail emigrants, 1848. One line only. Period appropriate. Solemn.",
        `Write a one-line gravestone inscription for ${death.name}, who died of ${death.cause} on ${death.date} on the Oregon Trail. Return only the inscription text, no quotes or formatting.`,
        env.ANTHROPIC_API_KEY,
        { maxTokens: 60, timeout: 5000 },
      );
      return jsonResponse({ epitaph: raw.trim() }, 200, origin);
    } catch (e) {
      console.warn("llm_fallback", JSON.stringify({ route: "epitaph", msg: String(e).slice(0, 120) }));
    }
  } else {
    console.warn("spend_rate_block", JSON.stringify({ route: "epitaph", reason: guard.reason }));
  }
  return jsonResponse(
    { epitaph: `Here lies ${death.name}. Gone to rest, ${death.date}.` },
    200,
    origin,
  );
}

export async function handleRiver(
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

  // Positional gate: crossing IDs are public, so without this a client could
  // POST a future crossing_id and skip the forced stop. The party must have
  // actually reached the crossing's mile marker. (Tech debt item 3.6 / §4.)
  if (verified.state.position.miles_traveled < crossing.mile_marker) {
    return jsonResponse({ error: "river_not_reached" }, 400, origin);
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

export async function handleLandmark(
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

    // Heal all living members (capped 100) — same constant /api/camp uses
    for (const member of next.party.members) {
      if (!member.alive) continue;
      member.health = Math.min(100, member.health + REST_HEAL_PER_DAY);
    }

    // Deduct food for the day
    const alive = next.party.members.filter(m => m.alive).length;
    const foodPerDay = REST_FOOD_PER_MEMBER_PER_DAY * alive; // filling rations equivalent for rest
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

// POST /api/camp — Make Camp (Phase 2 Bet 3): one day of rest in place.
// Miles unchanged; the SAME per-day attrition path advanceDays runs (food at
// ration rate, starvation/disease/morale ticks, deaths) applies first, then
// rest healing via the shared landmark-rest constants. Camp must never be
// cheaper per day than traveling — divergence is a free-healing exploit.
export async function handleCamp(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as CampRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  if (verified.state.simulation.pending_event_hash !== null) {
    return jsonResponse({ error: "resolve_pending_event" }, 400, origin);
  }

  // Phase gate: camping is a travel action — after departure, before the run
  // terminates (arrival or wipe).
  const historical = ctx as unknown as HistoricalContext;
  const anyAlive = verified.state.party.members.some((m) => m.alive);
  const arrived =
    verified.state.position.miles_traveled >= getTotalTrailDistance(historical);
  if (verified.state.position.miles_traveled <= 0 || !anyAlive || arrived) {
    return jsonResponse({ error: "wrong_phase" }, 400, origin);
  }

  const next = structuredClone(verified.state);
  const notes: string[] = [];

  // Same segment/month derivation advanceDays uses pre-movement (camp does
  // not move, so pre = post).
  const segment = getSegmentForMile(historical, next.position.miles_traveled);
  const month = parseMonth(next.position.date);
  const campDate = next.position.date;
  const foodConsumed = applyDailyAttrition(next, historical, segment, month, notes);

  // A camped day is a real day — drain delayed effects too (after attrition,
  // before healing, mirroring advanceDays order) so a player can't camp to stall
  // a festering fuse. The heal loop below already skips members killed here.
  drainPendingEffects(next, notes);

  // Rest healing AFTER attrition — members who died during the tick do not
  // heal. High tier: sanity restore halved (no cheap recovery on horror).
  const sanityRestore =
    next.settings.tone_tier === "high"
      ? CAMP_SANITY_RESTORE_PER_DAY / 2
      : CAMP_SANITY_RESTORE_PER_DAY;
  const healed: CampSummary["healed"] = [];
  for (const member of next.party.members) {
    if (!member.alive) continue;
    const healthBefore = member.health;
    member.health = Math.min(100, member.health + REST_HEAL_PER_DAY);
    member.sanity = Math.min(100, member.sanity + sanityRestore);
    healed.push({ name: member.name, hp_delta: member.health - healthBefore });
  }

  // One day passes; miles unchanged.
  const d = new Date(next.position.date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  next.position.date = d.toISOString().split("T")[0];

  const signature = await signState(next, env.HMAC_SECRET);
  const response: CampResponse = {
    signed_state: { state: next, signature },
    summary: { date: campDate, food_consumed: foodConsumed, healed, notes },
  };
  return jsonResponse(response, 200, origin);
}

export async function handleHunt(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as HuntRequest;

  const verified = await verifyIncomingState(body.signed_state, env.HMAC_SECRET);
  if (!verified.valid) {
    return jsonResponse({ error: verified.error }, 403, origin);
  }

  // Phase gate: hunting only allowed during travel (miles > 0, not at arrival)
  if (verified.state.position.miles_traveled === 0) {
    return jsonResponse({ error: "hunt_not_available" }, 400, origin);
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
  if (ammoSpent > 30) {
    return jsonResponse({ error: "ammo_cap_exceeded: max 30 per hunt" }, 400, origin);
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
  foodGained = Math.min(300, foodGained);

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
