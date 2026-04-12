import type {
  GameState,
  HistoricalContext,
  DaySummary,
  TriggerType,
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

const PACE_MILES: Record<Pace, number> = {
  steady: 12,
  strenuous: 16,
  grueling: 20,
};

const RATIONS_PER_PERSON: Record<Rations, number> = {
  filling: 3,
  meager: 2,
  bare_bones: 1,
};

interface AdvanceResult {
  state: GameState;
  summaries: DaySummary[];
  trigger: TriggerType;
  triggerData: unknown;
}

function parseMonth(dateStr: string): Month {
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

export function advanceDays(
  state: GameState,
  ctx: HistoricalContext,
): AdvanceResult {
  const next = structuredClone(state);
  const summaries: DaySummary[] = [];
  const totalDistance = getTotalTrailDistance(ctx);

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

    // 1. Advance miles (oxen required for movement)
    const baseMiles = PACE_MILES[next.settings.pace];
    const oxenModifier = next.supplies.oxen >= 6 ? 1.0
      : next.supplies.oxen >= 4 ? 0.7
      : next.supplies.oxen >= 2 ? 0.4
      : 0; // no oxen = no movement
    const milesGained = Math.round(baseMiles * paceModifier * oxenModifier);
    next.position.miles_traveled += milesGained;

    // 2. Consume food
    const foodPerDay = RATIONS_PER_PERSON[next.settings.rations] * alive;
    const actualConsumed = Math.min(next.supplies.food, foodPerDay);
    next.supplies.food -= actualConsumed;

    // 3. Starvation
    if (next.supplies.food === 0) {
      next.simulation.starvation_days++;
      if (next.simulation.starvation_days >= 3) {
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

    // 4. Pace effects
    if (next.settings.pace === "grueling") {
      for (const member of next.party.members) {
        if (!member.alive) continue;
        member.health = Math.max(0, member.health - 2);
        member.morale = Math.max(0, member.morale - 3);
      }
      dayEvents.push("Grueling pace wearing on the party");
    }

    // 5. Disease check — max 1 new disease per day
    let newDiseaseToday = false;
    for (const member of next.party.members) {
      if (!member.alive || member.disease !== null || newDiseaseToday) continue;
      for (const disease of ctx.diseases) {
        const regionElevated = disease.regions_elevated.includes(segment.region);
        const monthElevated = disease.months_elevated.includes(month);
        const riskMultiplier =
          1 + (regionElevated ? 1 : 0) + (monthElevated ? 0.5 : 0);
        if (Math.random() < disease.base_probability_per_day * riskMultiplier) {
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

    // 6. Disease progression
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

    // 7. Death check
    let deathTriggered = false;
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
        deathTriggered = true;
      }
    }

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
      return {
        state: next,
        summaries,
        trigger: "death",
        triggerData: {
          deaths: next.deaths.filter((d) => d.date === dayDate),
        },
      };
    }

    // 11. Landmark check
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

    // 12. River check
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
