// ── AI Spend Canary (dollar VISIBILITY / early-warning) ────────────────
//
// Real incident: the game went dark for weeks on an out-of-credit API key.
// paid-guard.ts already SHEDS abusive per-IP load (a *volume* cap), and the
// real global ceiling is the Anthropic account budget (out-of-band). What was
// still missing was *dollar* visibility: how much is actually being spent
// today, and is any single player or the day's total trending toward trouble
// BEFORE the account budget trips. This module is that missing layer — a
// read-only canary, not an enforcer.
//
// It tracks per-player daily Anthropic spend (and the daily total) entirely in
// memory — same pattern as paid-guard's in-memory daily counters. No database
// (a protected invariant); state resets when the Worker isolate is recycled,
// which is acceptable for a same-day spend signal.
//
// "Player" has no server-side identity here (no DB, no sessions). We deliberately
// reuse paid-guard's stable per-request key (`ipKey`, IPv6 /64-normalized) so a
// player is the SAME identity the load-shedder already keys on — no parallel
// identity scheme. The day bucket likewise reuses paid-guard's `utcDay()` so the
// two systems agree on calendar-day rollover.

import { utcDay } from "./paid-guard";

// Pricing for the only model in use (claude-haiku-4-5-20251001), in USD per
// million tokens. Source: Anthropic Haiku 4.5 list pricing. If model routing
// lands later, extend this to a per-model map.
const INPUT_USD_PER_MTOK = 1.0;
const OUTPUT_USD_PER_MTOK = 5.0;

// Early-warning thresholds. These are SIGNALS, not caps — breaching one flags
// the report; it never blocks a call (paid-guard + the account budget enforce).
export const PER_PLAYER_DAILY_ALERT_USD = 0.05;
export const TOTAL_DAILY_ALERT_USD = 50.0;

interface DayBucket {
  date: string; // UTC YYYY-MM-DD (from paid-guard's utcDay)
  total_usd: number;
  per_player: Map<string, number>; // player key (paid-guard ipKey) -> usd today
}

// One bucket for the current UTC day. Replaced wholesale when the day rolls
// over, so memory does not grow unbounded across days.
let bucket: DayBucket | null = null;

function currentBucket(now: Date): DayBucket {
  const date = utcDay(now);
  if (!bucket || bucket.date !== date) {
    bucket = { date, total_usd: 0, per_player: new Map() };
  }
  return bucket;
}

export function usageCostUsd(inputTokens: number, outputTokens: number): number {
  const input = Math.max(0, inputTokens) * (INPUT_USD_PER_MTOK / 1_000_000);
  const output = Math.max(0, outputTokens) * (OUTPUT_USD_PER_MTOK / 1_000_000);
  return input + output;
}

// Record a single Anthropic call's token usage against a player key. Called
// from the callAnthropic chokepoint so every LLM path is counted exactly once.
// `playerKey` is paid-guard's ipKey(request); `now` is injectable for tests.
export function recordUsage(
  playerKey: string,
  inputTokens: number,
  outputTokens: number,
  now: Date = new Date(),
): void {
  const cost = usageCostUsd(inputTokens, outputTokens);
  if (cost <= 0) return; // zero-cost call (cached/empty usage) is a no-op
  const b = currentBucket(now);
  b.total_usd += cost;
  b.per_player.set(playerKey, (b.per_player.get(playerKey) ?? 0) + cost);
}

export interface CostsReport {
  date: string;
  total_usd: number;
  player_count: number;
  thresholds: {
    per_player_daily_usd: number;
    total_daily_usd: number;
  };
  alerts: {
    total_breached: boolean;
    players_over_limit: { player: string; usd: number }[];
  };
  per_player: { player: string; usd: number }[];
}

function round(n: number): number {
  // Micro-dollar precision is enough for a canary; avoids float noise in output.
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function getCostsReport(now: Date = new Date()): CostsReport {
  const b = currentBucket(now);
  const per_player = [...b.per_player.entries()]
    .map(([player, usd]) => ({ player, usd: round(usd) }))
    .sort((a, z) => z.usd - a.usd);
  const players_over_limit = per_player.filter(
    (p) => p.usd > PER_PLAYER_DAILY_ALERT_USD,
  );
  return {
    date: b.date,
    total_usd: round(b.total_usd),
    player_count: per_player.length,
    thresholds: {
      per_player_daily_usd: PER_PLAYER_DAILY_ALERT_USD,
      total_daily_usd: TOTAL_DAILY_ALERT_USD,
    },
    alerts: {
      total_breached: b.total_usd > TOTAL_DAILY_ALERT_USD,
      players_over_limit,
    },
    per_player,
  };
}

// Test-only reset so unit tests start from a clean bucket.
export function __resetCostTracker(): void {
  bucket = null;
}
