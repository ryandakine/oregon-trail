import type {
  GameState,
  HistoricalContext,
  DaySummary,
  TriggerType,
  TrailSegment,
  Supplies,
  PendingEffect,
  Pace,
  Rations,
  Month,
  DiseaseStatus,
} from "./types";
import {
  getSegmentForMile,
  getNextLandmark,
  getNextRiverCrossing,
  getWeather,
  getTotalTrailDistance,
} from "./context-loader";
import { clampConsequences } from "./state";

const PACE_MILES: Record<Pace, number> = {
  steady: 12,
  strenuous: 16,
  grueling: 20,
};

// Phase B.2 (2026-04-17): post-B calibration showed Phase B moved cause
// distribution (less disease) but not wipe rate (still 10/10 farmer-medium).
// Starvation was already 49% of deaths pre-B; became 56% post-B as disease
// softened. Food runway at 15 lbs/day (5 people × 3 lbs filling) vs ~180 lbs
// starting food = 12 days. Dropping filling to 2 extends runway to 18 days.
// Tests use historical 3-lb baseline via a fixture toggle; production drops to 2.
const RATIONS_PER_PERSON: Record<Rations, number> = {
  filling: 1.5,     // was 2 (Phase C v3)
  meager: 1.2,      // was 1.5 (Phase C v3)
  bare_bones: 1,
};

// Phase B Medium tune (2026-04-17): Phase A calibration showed farmer-medium
// wipe rate 100% (LB 79.6%) at mile 227 from disease + starvation chains.
// These two constants soften the global economy without adding new state or
// player-facing surface. Revisit with real user telemetry, not synthetic.
const DISEASE_PROBABILITY_MULTIPLIER = 0.7;
const STARVATION_GRACE_DAYS = 4;

interface AdvanceResult {
  state: GameState;
  summaries: DaySummary[];
  trigger: TriggerType;
  triggerData: unknown;
}

export function parseMonth(dateStr: string): Month {
  const m = parseInt(dateStr.split("-")[1], 10);
  if (m >= 4 && m <= 10) return m as Month;
  return 4;
}

function advanceDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

function aliveCount(state: GameState): number {
  return state.party.members.filter((m) => m.alive).length;
}

export interface AdvanceOptions {
  bitterPathEnabled?: boolean; // server kill switch; defaults true
}

// One day of survival economy, shared verbatim by advanceDays and /api/camp:
// food consumption at ration rate, starvation, pace wear, disease onset,
// disease progression, and the death check. Mutates `next` in place, appends
// human-readable notes to `dayEvents`, and returns the food actually consumed.
// Movement and date advancement are deliberately NOT here — callers own those.
// `segment`/`month` are passed in (not derived) because advanceDays evaluates
// them BEFORE the day's movement; deriving them here would silently shift the
// disease region for fast-moving parties. Extracted in Phase 2 so Make Camp
// cannot drift from the travel attrition path (divergence = free healing).
export function applyDailyAttrition(
  next: GameState,
  ctx: HistoricalContext,
  segment: TrailSegment,
  month: Month,
  dayEvents: string[],
): number {
  const alive = aliveCount(next);

  // 1. Consume food
  const foodPerDay = RATIONS_PER_PERSON[next.settings.rations] * alive;
  const actualConsumed = Math.min(next.supplies.food, foodPerDay);
  next.supplies.food -= actualConsumed;

  // 2. Starvation
  if (next.supplies.food === 0) {
    next.simulation.starvation_days++;
    if (next.simulation.starvation_days >= STARVATION_GRACE_DAYS) {
      for (const member of next.party.members) {
        if (!member.alive) continue;
        member.health = Math.max(0, member.health - 10);
        member.morale = Math.max(0, member.morale - 10);
      }
      dayEvents.push("Starvation taking its toll");
    }
  } else {
    next.simulation.starvation_days = 0;
  }

  // 3. Pace effects
  if (next.settings.pace === "grueling") {
    for (const member of next.party.members) {
      if (!member.alive) continue;
      member.health = Math.max(0, member.health - 2);
      member.morale = Math.max(0, member.morale - 3);
    }
    dayEvents.push("Grueling pace wearing on the party");
  }

  // 4. Disease check — max 1 new disease per day
  let newDiseaseToday = false;
  for (const member of next.party.members) {
    if (!member.alive || member.disease !== null || newDiseaseToday) continue;
    for (const disease of ctx.diseases) {
      const regionElevated = disease.regions_elevated.includes(segment.region);
      const monthElevated = disease.months_elevated.includes(month);
      const riskMultiplier =
        1 + (regionElevated ? 1 : 0) + (monthElevated ? 0.5 : 0);
      if (Math.random() < disease.base_probability_per_day * riskMultiplier * DISEASE_PROBABILITY_MULTIPLIER) {
        member.disease = {
          id: disease.id,
          days_sick: 0,
          stage: "active",
          medicine_used_today: false,
        } satisfies DiseaseStatus;
        dayEvents.push(`${member.name} fell ill with ${disease.name}`);
        newDiseaseToday = true;
        break;
      }
    }
  }

  // 5. Disease progression
  for (const member of next.party.members) {
    if (!member.alive || !member.disease) continue;
    member.disease.days_sick++;
    member.disease.medicine_used_today = false;

    const profile = ctx.diseases.find((d) => d.id === member.disease!.id);
    if (!profile) continue;

    let dailyLoss = Math.ceil(
      (100 * profile.mortality_rate) / profile.progression_days,
    );

    // Medicine halves the loss, consumes 1 dose
    if (next.supplies.medicine > 0) {
      dailyLoss = Math.ceil(dailyLoss / 2);
      next.supplies.medicine--;
      member.disease.medicine_used_today = true;
    }

    member.health = Math.max(0, member.health - dailyLoss);

    // After progression_days: 50% cure, 50% continue
    if (member.disease.days_sick >= profile.progression_days) {
      if (Math.random() < 0.5) {
        member.disease = null;
        dayEvents.push(`${member.name} recovered from illness`);
      }
    }
  }

  // 6. Death check
  for (const member of next.party.members) {
    if (!member.alive) continue;
    if (member.health <= 0) {
      member.health = 0;
      member.alive = false;
      const cause = member.disease ? member.disease.id : "exhaustion";
      next.deaths.push({
        name: member.name,
        date: next.position.date,
        cause,
        epitaph: null,
      });
      member.disease = null;
      dayEvents.push(`${member.name} has died`);
    }
  }

  return actualConsumed;
}

// Drains the delayed-consequence queue for ONE simulated day. Decrements every
// queued effect; those reaching <= 0 fire now. Fired deltas run through the SAME
// clampConsequences / CONSEQUENCE_BOUNDS the immediate event path uses (spec §4
// — single clamp source of truth), then apply to supplies and party members: to
// `member_name` if set, otherwise all living members (matching event semantics).
// A delta dropping a member to 0 health records a death exactly as
// applyEventAndSign does, dated with the current (pre-advance) day so the
// caller's death short-circuit catches it the same day. `journal_entry`, when
// present, is appended to the day's events.
//
// miles/days deltas are deliberately NOT applied here: advanceDays owns movement
// and the calendar, and mutating them mid-loop would desync date bookkeeping.
// No V1 path enqueues spatial/temporal effects; the consequences pillar adds
// loop-safe handling if it ever needs them. Mutates `next` in place.
//
// Exported because handleCamp drains too: a camped day runs full attrition, so
// it must tick delayed effects (else a player could camp to stall a festering
// fuse — spec §3.2 camp-scoping note / consequences-pillar.md §2.3).
export function drainPendingEffects(next: GameState, dayEvents: string[]): void {
  const queue = next.simulation.pending_effects;
  if (queue.length === 0) return;

  const surviving: PendingEffect[] = [];
  for (const effect of queue) {
    effect.days_remaining -= 1;
    if (effect.days_remaining > 0) {
      surviving.push(effect);
      continue;
    }

    const c = effect.consequences;
    clampConsequences(c);

    const supplyKeys: (keyof Supplies)[] = [
      "food", "ammo", "clothing", "spare_parts", "medicine", "money", "oxen",
    ];
    for (const key of supplyKeys) {
      const delta = c[key];
      if (delta !== undefined) {
        next.supplies[key] = Math.max(0, next.supplies[key] + delta);
      }
    }

    for (const member of next.party.members) {
      if (!member.alive) continue;
      if (effect.member_name !== undefined && member.name !== effect.member_name) continue;
      if (c.health !== undefined) {
        member.health = Math.max(0, Math.min(100, member.health + c.health));
        if (member.health === 0) {
          member.alive = false;
          next.deaths.push({
            name: member.name,
            date: next.position.date,
            cause: effect.source || "unknown",
            epitaph: null,
          });
        }
      }
      if (c.morale !== undefined) {
        member.morale = Math.max(0, Math.min(100, member.morale + c.morale));
      }
    }

    if (effect.journal_entry) dayEvents.push(effect.journal_entry);
  }

  next.simulation.pending_effects = surviving;
}

export function advanceDays(
  state: GameState,
  ctx: HistoricalContext,
  opts: AdvanceOptions = {},
): AdvanceResult {
  const next = structuredClone(state);
  const summaries: DaySummary[] = [];
  const totalDistance = getTotalTrailDistance(ctx);
  const bitterPathEnabled = opts.bitterPathEnabled !== false; // default true

  for (let day = 0; day < 5; day++) {
    const alive = aliveCount(next);
    if (alive === 0) {
      return { state: next, summaries, trigger: "wipe", triggerData: null };
    }

    const dayEvents: string[] = [];
    const segment = getSegmentForMile(ctx, next.position.miles_traveled);
    const month = parseMonth(next.position.date);
    const weatherProfile = getWeather(ctx, month, segment.region);
    const paceModifier = weatherProfile?.pace_modifier ?? 1;

    // Pre-movement guard: block if unresolved crossing exists at or before current miles
    const overdueRiver = getNextRiverCrossing(
      ctx,
      next.position.current_segment_id,
      next.simulation.resolved_crossings,
      0, // check from start of segment
    );
    if (overdueRiver && next.position.miles_traveled >= overdueRiver.mile_marker) {
      return {
        state: next,
        summaries,
        trigger: "river",
        triggerData: overdueRiver,
      };
    }

    // 1. Advance miles (oxen required for movement)
    const baseMiles = PACE_MILES[next.settings.pace];
    const oxenModifier = next.supplies.oxen >= 6 ? 1.0
      : next.supplies.oxen >= 4 ? 0.7
      : next.supplies.oxen >= 2 ? 0.4
      : 0; // no oxen = no movement
    const milesGained = Math.round(baseMiles * paceModifier * oxenModifier);
    next.position.miles_traveled += milesGained;

    // 2-7. Daily attrition: food, starvation, pace wear, disease, deaths.
    // Shared with /api/camp via applyDailyAttrition — keep all survival
    // economy in that one function.
    const deathsBefore = next.deaths.length;
    const actualConsumed = applyDailyAttrition(next, ctx, segment, month, dayEvents);
    // Fire delayed effects scheduled for today BEFORE the death/event-trigger
    // checks so a lethal delayed effect ends the run this same day (spec §3.2).
    drainPendingEffects(next, dayEvents);
    const deathTriggered = next.deaths.length > deathsBefore;

    // 8. Segment advancement
    const newSegment = getSegmentForMile(ctx, next.position.miles_traveled);
    next.position.current_segment_id = newSegment.id;

    // Advance date
    const dayDate = next.position.date;
    next.position.date = advanceDate(next.position.date);
    next.simulation.days_since_last_event++;

    const summary: DaySummary = {
      date: dayDate,
      miles: milesGained,
      food_consumed: actualConsumed,
      events: dayEvents,
    };
    summaries.push(summary);

    // 9. Arrival check
    if (next.position.miles_traveled >= totalDistance) {
      return { state: next, summaries, trigger: "arrival", triggerData: null };
    }

    // 10. Wipe check
    if (aliveCount(next) === 0) {
      return { state: next, summaries, trigger: "wipe", triggerData: null };
    }

    // Short-circuit on death trigger
    if (deathTriggered) {
      const todaysDeaths = next.deaths.filter((d) => d.date === dayDate);
      return {
        state: next,
        summaries,
        trigger: "death",
        triggerData: {
          ...todaysDeaths[0],
          all_deaths: todaysDeaths,
        },
      };
    }

    // 11. Landmark check (before rivers — player should "arrive" before "cross")
    const nextLm = getNextLandmark(ctx, next.position.miles_traveled - milesGained);
    if (
      nextLm &&
      next.position.miles_traveled >= nextLm.mile_marker &&
      !next.simulation.visited_landmarks.includes(nextLm.id)
    ) {
      next.simulation.visited_landmarks.push(nextLm.id);
      return {
        state: next,
        summaries,
        trigger: "landmark",
        triggerData: { landmark_id: nextLm.id, name: nextLm.name },
      };
    }

    // 12. River check (after landmarks)
    const river = getNextRiverCrossing(
      ctx,
      next.position.current_segment_id,
      next.simulation.resolved_crossings,
      next.position.miles_traveled - milesGained,
    );
    if (river && next.position.miles_traveled >= river.mile_marker) {
      return {
        state: next,
        summaries,
        trigger: "river",
        triggerData: river,
      };
    }

    // 12.5 Bitter Path check — horror tier, late-stage, not yet resolved.
    // Fires ONLY when party is demonstrably dying: either 5+ starvation days
    // or food=0 + 2+ starving + avg alive health < 40. Requires a recent
    // death (within 3 game-days) to ground the event narratively.
    if (
      bitterPathEnabled &&
      next.settings.tone_tier === "high" &&
      next.simulation.bitter_path_taken === "none" &&
      next.deaths.length >= 1
    ) {
      const aliveMembers = next.party.members.filter((m) => m.alive);
      const avgAliveHealth =
        aliveMembers.length > 0
          ? aliveMembers.reduce((s, m) => s + m.health, 0) / aliveMembers.length
          : 0;
      const wasting = next.simulation.starvation_days >= 5;
      const failing =
        next.supplies.food === 0 &&
        next.simulation.starvation_days >= 2 &&
        avgAliveHealth < 40;
      if (wasting || failing) {
        // Find the most recent death within the last 3 game-days.
        const currentDateMs = new Date(next.position.date + "T00:00:00Z").getTime();
        const recent = next.deaths
          .map((d) => ({
            ...d,
            daysAgo: Math.round(
              (currentDateMs - new Date(d.date + "T00:00:00Z").getTime()) / 86400000,
            ),
          }))
          .filter((d) => d.daysAgo >= 0 && d.daysAgo <= 3)
          .sort((a, b) => a.daysAgo - b.daysAgo);

        if (recent.length > 0) {
          const dead = recent[0];
          return {
            state: next,
            summaries,
            trigger: "bitter_path",
            triggerData: {
              dead_member_name: dead.name,
              dead_member_cause: dead.cause,
              days_since_death: dead.daysAgo,
              trigger_variant: wasting ? "wasting" : "failing",
            },
          };
        }
      }
    }

    // 13. Event check
    if (
      next.simulation.days_since_last_event >= 2 &&
      (next.simulation.days_since_last_event >= 5 || Math.random() < 0.3)
    ) {
      return { state: next, summaries, trigger: "event", triggerData: null };
    }
  }

  // 5 days passed with no trigger
  return { state: next, summaries, trigger: null, triggerData: null };
}
