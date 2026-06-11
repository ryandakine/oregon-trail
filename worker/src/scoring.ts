import type { GameState, HistoricalContext } from "./types";
import { getTotalTrailDistance } from "./context-loader";
import { TRAIL_START_DATE } from "./state";
import ctx from "./historical-context.json";

// Deterministic run score, computed on demand from a verified GameState —
// never stored in state (a stored score is a replay/forgery surface; this is
// not). Pinned formula (PHASE2_BIG_BETS_PLAN.md Bet 2):
//   miles + survivors*200 + (arrival ? max(0, 2000 - days*10) : 0)
// Known/accepted: a slow full-survival crawl past day 200 can out-score a
// fast 3-survivor run — a legit tradeoff constrained by food economics.

const TOTAL_TRAIL_MILES = getTotalTrailDistance(ctx as unknown as HistoricalContext);

const MS_PER_DAY = 86_400_000;

/** Whole days elapsed since departure (TRAIL_START_DATE). Never negative. */
export function runDays(state: GameState): number {
  const start = new Date(TRAIL_START_DATE + "T00:00:00Z").getTime();
  const current = new Date(state.position.date + "T00:00:00Z").getTime();
  if (!Number.isFinite(current)) return 0;
  return Math.max(0, Math.round((current - start) / MS_PER_DAY));
}

export function survivorCount(state: GameState): number {
  return state.party.members.filter((m) => m.alive).length;
}

/** Arrival = someone alive AND the full trail distance covered. */
export function isArrival(state: GameState): boolean {
  return (
    survivorCount(state) > 0 &&
    state.position.miles_traveled >= TOTAL_TRAIL_MILES
  );
}

export function computeRunScore(state: GameState): number {
  const miles = Math.max(0, Math.round(state.position.miles_traveled));
  const survivors = survivorCount(state);
  const arrivalBonus = isArrival(state)
    ? Math.max(0, 2000 - runDays(state) * 10)
    : 0;
  return miles + survivors * 200 + arrivalBonus;
}
