import type { GameState, ToneTier } from "./types";
import { getHmacKey } from "./hmac";
import { runDays, survivorCount } from "./scoring";

// Self-contained share stub: the id IS the data (no DB/KV/DO — nothing
// stored). Format (PHASE2_BIG_BETS_PLAN.md Bet 1):
//   id = base64url(json) + "." + base64url(HMAC_SHA256(key, "og:v1:" + json))
// The "og:v1:" prefix domain-separates these MACs from state signing as
// defense-in-depth (state MACs hash deepCanonicalize(state) with no prefix,
// so the input domains are already disjoint).

export interface StubPayload {
  v: 1;
  o: "arrival" | "wipe";
  m: number; // miles traveled
  s: number; // survivors
  p: number; // party size
  d: number; // days on the trail
  t: ToneTier; // from state.settings.tone_tier (NOT engine.tone — known bug)
  n: string; // sanitized leader first name
  c: string | null; // challenge id
  sc: number | null; // run score
}

export interface ShareStubEnv {
  HMAC_SECRET: string;
}

const MAC_DOMAIN_PREFIX = "og:v1:";

// Hard cap applied BEFORE any decode work — an unbounded id is a DoS vector
// (review finding). Legitimate ids are ~230 chars.
export const MAX_STUB_ID_LENGTH = 600;

const TONE_TIERS: readonly ToneTier[] = ["low", "medium", "high"];

/**
 * Sanitize the leader name for embedding in the share payload: keep only
 * [A-Za-z .'-], collapse whitespace, cap at 16 chars, fall back to
 * "A pioneer" when nothing survives.
 */
export function sanitizeShareName(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z .'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16)
    .trim();
  return cleaned.length > 0 ? cleaned : "A pioneer";
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded); // throws on invalid input — callers catch
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function macForJson(json: string, secret: string): Promise<ArrayBuffer> {
  const key = await getHmacKey(secret);
  const data = new TextEncoder().encode(MAC_DOMAIN_PREFIX + json);
  return crypto.subtle.sign("HMAC", key, data);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStubPayload(value: unknown): value is StubPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.v === 1 &&
    (p.o === "arrival" || p.o === "wipe") &&
    isInt(p.m) &&
    isInt(p.s) &&
    isInt(p.p) &&
    isInt(p.d) &&
    TONE_TIERS.includes(p.t as ToneTier) &&
    typeof p.n === "string" &&
    (p.c === null || typeof p.c === "string") &&
    (p.sc === null || isInt(p.sc))
  );
}

/** Build the signed share-stub id for a terminal (arrival|wipe) state. */
export async function createShareStub(
  state: GameState,
  score: number,
  env: ShareStubEnv,
): Promise<string> {
  const survivors = survivorCount(state);
  const firstName = state.party.leader_name.trim().split(/\s+/)[0] ?? "";
  const payload: StubPayload = {
    v: 1,
    o: survivors === 0 ? "wipe" : "arrival",
    m: Math.max(0, Math.round(state.position.miles_traveled)),
    s: survivors,
    p: state.party.members.length,
    d: runDays(state),
    t: state.settings.tone_tier,
    n: sanitizeShareName(firstName),
    c: state.settings.challenge_id,
    sc: Math.round(score),
  };
  const json = JSON.stringify(payload);
  const mac = await macForJson(json, env.HMAC_SECRET);
  const encoder = new TextEncoder();
  return `${base64urlEncode(encoder.encode(json))}.${base64urlEncode(new Uint8Array(mac))}`;
}

/**
 * Verify a share-stub id. Length cap BEFORE any decode, all decode work in
 * try/catch, MAC verified before any payload field is trusted. Returns the
 * payload on success, null on any failure.
 */
export async function verifyShareStub(
  id: string,
  env: ShareStubEnv,
): Promise<StubPayload | null> {
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_STUB_ID_LENGTH) {
    return null;
  }
  try {
    const parts = id.split(".");
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      return null;
    }
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      base64urlDecode(parts[0]),
    );
    const submittedMac = base64urlDecode(parts[1]);

    const key = await getHmacKey(env.HMAC_SECRET);
    const data = new TextEncoder().encode(MAC_DOMAIN_PREFIX + json);
    const macValid = await crypto.subtle.verify("HMAC", key, submittedMac, data);
    if (!macValid) return null;

    // MAC verified — the payload is one we issued. Shape-check anyway as
    // defense-in-depth before handing fields to renderers.
    const parsed: unknown = JSON.parse(json);
    if (!isStubPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
