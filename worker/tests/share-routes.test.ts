import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { type Env } from "../src/index";
import { createShareStub, verifyShareStub } from "../src/share-stub";
import { computeRunScore } from "../src/scoring";
import { createInitialState } from "../src/state";
import { signState } from "../src/hmac";
import { __resetDayCounts } from "../src/paid-guard";
import type { AdvanceResponse, GameState, ShareInfo, SignedGameState } from "../src/types";

// /r + /og route contract (verify → escaped HTML / 302; invalid → 404) and
// share issuance (/api/advance terminal transitions, /api/newspaper).
// No Anthropic call is ever made here: terminal advances skip the LLM, and
// the newspaper test uses a denying PAID_LIMITER to force the free fallback.

const SECRET = "share-routes-test-secret";
const MEMBERS: [string, string, string, string] = ["Bob", "Cara", "Dan", "Ellen"];
const BRANDED = "https://trail.osi-cyber.com";

const baseEnv: Env = {
  HMAC_SECRET: SECRET,
  ANTHROPIC_API_KEY: "unused",
  ALLOWED_ORIGIN: "*",
};

const brandedEnv: Env = { ...baseEnv, SHARE_BASE_URL: BRANDED };

function get(path: string): Request {
  return new Request(`https://test.local${path}`, { method: "GET" });
}

function post(path: string, body: unknown): Request {
  return new Request(`https://test.local${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "8.8.4.4" },
    body: JSON.stringify(body),
  });
}

async function sign(state: GameState): Promise<SignedGameState> {
  return { state, signature: await signState(state, SECRET) };
}

// Terminal arrival fixture: 3 of 5 alive at full trail distance, day 150.
async function arrivalState(): Promise<GameState> {
  const { state } = await createInitialState("Alice", MEMBERS, "farmer", "high", SECRET, "speed_run");
  state.position.current_segment_id = "seg_16";
  state.position.miles_traveled = 1764;
  state.position.date = "1848-09-12";
  state.party.members[3].alive = false;
  state.party.members[3].health = 0;
  state.party.members[4].alive = false;
  state.party.members[4].health = 0;
  return state;
}

beforeEach(() => {
  __resetDayCounts();
  // Pin randomness so advance fixtures stay deterministic (no surprise
  // disease onset / event rolls).
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /r/<id> — result page", () => {
  it("renders a valid stub: 200 HTML, dynamic OG tags, immutable cache", async () => {
    const state = await arrivalState();
    const score = computeRunScore(state);
    const id = await createShareStub(state, score, brandedEnv);

    const res = await worker.fetch(get(`/r/${id}`), brandedEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    const html = await res.text();
    expect(html).toContain("Reached Oregon City — 3/5 survived");
    expect(html).toContain(`· ${score.toLocaleString("en-US")} pts`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    // og:image points at the per-run /og/<id>.png on the branded base
    expect(html).toContain(`${BRANDED}/og/${id}.png`);
    // description carries tone label, days, challenge, AI hook
    expect(html).toContain("Psychological Horror tone");
    expect(html).toContain("150 days on the trail");
    expect(html).toContain("speed run challenge");
    expect(html).toContain("Every event written live by AI");
    // CTA with the pinned UTM
    expect(html).toContain("https://trail.osi-cyber.com/?utm_source=oregon-trail&amp;utm_medium=result_page");
  });

  it("renders a wipe variant for an all-dead stub", async () => {
    const state = await arrivalState();
    for (const m of state.party.members) m.alive = false;
    state.position.miles_traveled = 412;
    const id = await createShareStub(state, computeRunScore(state), brandedEnv);
    const html = await (await worker.fetch(get(`/r/${id}`), brandedEnv)).text();
    expect(html).toContain("Lost on the trail — 0/5 survived");
  });

  it("HTML-escapes every interpolated field (hostile challenge_id cannot inject)", async () => {
    const state = await arrivalState();
    // challenge_id is client-supplied at /api/start and NOT validated against
    // the challenge list — the render layer must escape it.
    state.settings.challenge_id = '<script>alert(1)</script>';
    const id = await createShareStub(state, 1, brandedEnv);
    const res = await worker.fetch(get(`/r/${id}`), brandedEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("404s an invalid id, a tampered id, and an oversize id", async () => {
    const valid = await createShareStub(await arrivalState(), 1, brandedEnv);
    const tampered = valid.slice(0, -2) + "zz";
    for (const id of ["garbage", tampered, "a".repeat(700)]) {
      const res = await worker.fetch(get(`/r/${id}`), brandedEnv);
      expect(res.status, `id=${id.slice(0, 24)}…`).toBe(404);
    }
  });

  it("serves /r even when the paid limiter denies (no guardPaidCall on share routes)", async () => {
    const denyEnv: Env = {
      ...brandedEnv,
      PAID_LIMITER: { limit: async () => ({ success: false }) },
    };
    const id = await createShareStub(await arrivalState(), 1, denyEnv);
    const res = await worker.fetch(get(`/r/${id}`), denyEnv);
    expect(res.status).toBe(200);
  });

  it("falls back to the request origin when SHARE_BASE_URL is unset", async () => {
    const id = await createShareStub(await arrivalState(), 1, baseEnv);
    const html = await (await worker.fetch(get(`/r/${id}`), baseEnv)).text();
    expect(html).toContain(`https://test.local/og/${id}.png`);
  });
});

describe("GET /og/<id>.png — Tier A redirect", () => {
  it("302s a valid id to the static og-image with the immutable cache header", async () => {
    const id = await createShareStub(await arrivalState(), 1, brandedEnv);
    const res = await worker.fetch(get(`/og/${id}.png`), brandedEnv);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${BRANDED}/og-image.png`);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("404s an invalid id", async () => {
    const res = await worker.fetch(get("/og/not-a-real-stub.png"), brandedEnv);
    expect(res.status).toBe(404);
  });

  it("falls back to the request origin when SHARE_BASE_URL is unset", async () => {
    const id = await createShareStub(await arrivalState(), 1, baseEnv);
    const res = await worker.fetch(get(`/og/${id}.png`), baseEnv);
    expect(res.headers.get("Location")).toBe("https://test.local/og-image.png");
  });
});

describe("share issuance — /api/advance terminal transitions", () => {
  it("attaches share on a server-detected arrival", async () => {
    const state = await arrivalState();
    // One day short of Oregon City; resolve seg_16's crossing so the
    // pre-movement river guard doesn't fire.
    state.position.miles_traveled = 1763;
    state.supplies.oxen = 6;
    state.supplies.food = 100;
    state.simulation.resolved_crossings = ["rc_columbia_river_raft_or_barlow_road"];

    const res = await worker.fetch(post("/api/advance", { signed_state: await sign(state) }), brandedEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdvanceResponse;
    expect(body.trigger).toBe("arrival");
    const share = body.share as ShareInfo;
    expect(share).toBeDefined();
    expect(share.url.startsWith(`${BRANDED}/r/`)).toBe(true);
    expect(share.challenge_id).toBe("speed_run");
    // score matches the deterministic recompute over the state the server
    // just simulated
    expect(share.score).toBe(computeRunScore(body.signed_state.state));
    // and the stub in the url round-trips with matching fields
    const stub = await verifyShareStub(share.url.slice(`${BRANDED}/r/`.length), brandedEnv);
    expect(stub?.o).toBe("arrival");
    expect(stub?.sc).toBe(share.score);
    expect(stub?.c).toBe("speed_run");
  });

  it("attaches share on a wipe", async () => {
    const { state } = await createInitialState("Smith", MEMBERS, "farmer", "medium", SECRET);
    state.position.miles_traveled = 100;
    for (const m of state.party.members) {
      m.alive = false;
      m.health = 0;
    }
    const res = await worker.fetch(post("/api/advance", { signed_state: await sign(state) }), brandedEnv);
    const body = (await res.json()) as AdvanceResponse;
    expect(body.trigger).toBe("wipe");
    expect(body.share).toBeDefined();
    const stub = await verifyShareStub((body.share as ShareInfo).url.slice(`${BRANDED}/r/`.length), brandedEnv);
    expect(stub?.o).toBe("wipe");
    expect(stub?.s).toBe(0);
  });

  it("does NOT attach share on a non-terminal trigger", async () => {
    const { state } = await createInitialState("Smith", MEMBERS, "banker", "medium", SECRET);
    // Unresolved seg_01 crossing behind the party → deterministic river
    // trigger before any movement or LLM call.
    state.position.miles_traveled = 30;
    state.supplies.oxen = 6;
    const res = await worker.fetch(post("/api/advance", { signed_state: await sign(state) }), brandedEnv);
    const body = (await res.json()) as AdvanceResponse;
    expect(body.trigger).toBe("river");
    expect(body.share).toBeUndefined();
  });
});

describe("share issuance — /api/newspaper", () => {
  it("adds share to the newspaper response (fallback path, no signed_state regression)", async () => {
    const { state } = await createInitialState("Smith", MEMBERS, "farmer", "medium", SECRET);
    state.position.miles_traveled = 240;
    for (const m of state.party.members) {
      m.alive = false;
      m.health = 0;
    }
    // Denying limiter → guard blocks → hand-written fallback, Anthropic untouched.
    const denyEnv: Env = {
      ...brandedEnv,
      PAID_LIMITER: { limit: async () => ({ success: false }) },
    };
    const res = await worker.fetch(post("/api/newspaper", { signed_state: await sign(state) }), denyEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { headline: string; share?: ShareInfo; signed_state?: unknown };
    expect(typeof body.headline).toBe("string");
    // response-only: newspaper still does not return signed_state
    expect(body.signed_state).toBeUndefined();
    const share = body.share as ShareInfo;
    expect(share).toBeDefined();
    expect(share.score).toBe(computeRunScore(state));
    const stub = await verifyShareStub(share.url.slice(`${BRANDED}/r/`.length), brandedEnv);
    expect(stub?.o).toBe("wipe");
    expect(stub?.m).toBe(240);
  });

  it("still 400s a non-terminal state (gate regression)", async () => {
    const { state } = await createInitialState("Smith", MEMBERS, "farmer", "medium", SECRET);
    state.position.miles_traveled = 500;
    const res = await worker.fetch(post("/api/newspaper", { signed_state: await sign(state) }), brandedEnv);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("newspaper_not_available");
  });
});
