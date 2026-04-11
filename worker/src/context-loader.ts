import type {
  HistoricalContext,
  TrailSegment,
  Landmark,
  WeatherProfile,
  DiseaseProfile,
  IndigenousNation,
  RiverCrossing,
  Month,
  Region,
} from "./types";

export function getSegment(
  ctx: HistoricalContext,
  segmentId: string,
): TrailSegment | undefined {
  return ctx.segments.find((s) => s.id === segmentId);
}

export function getSegmentForMile(
  ctx: HistoricalContext,
  milesTraveled: number,
): TrailSegment {
  let cumulative = 0;
  for (const segment of ctx.segments) {
    cumulative += segment.distance_miles;
    if (milesTraveled < cumulative) return segment;
    // At exactly the end-mile boundary, party is still in this segment
    if (milesTraveled === cumulative) return segment;
  }
  // Past the trail end — return last segment
  return ctx.segments[ctx.segments.length - 1];
}

export function getLandmarksForSegment(
  ctx: HistoricalContext,
  segmentId: string,
): Landmark[] {
  return ctx.landmarks.filter((l) => l.segment_id === segmentId);
}

export function getNextLandmark(
  ctx: HistoricalContext,
  milesTraveled: number,
): Landmark | undefined {
  return ctx.landmarks
    .filter((l) => l.mile_marker > milesTraveled)
    .sort((a, b) => a.mile_marker - b.mile_marker)[0];
}

export function getWeather(
  ctx: HistoricalContext,
  month: Month,
  region: Region,
): WeatherProfile | undefined {
  return ctx.weather.find((w) => w.month === month && w.region === region);
}

export function getDisease(
  ctx: HistoricalContext,
  diseaseId: string,
): DiseaseProfile | undefined {
  return ctx.diseases.find((d) => d.id === diseaseId);
}

export function getNationsForSegment(
  ctx: HistoricalContext,
  segmentId: string,
): IndigenousNation[] {
  const segment = getSegment(ctx, segmentId);
  if (!segment) return [];
  return ctx.nations.filter((n) => segment.allowed_nations.includes(n.id));
}

export function getNextRiverCrossing(
  ctx: HistoricalContext,
  segmentId: string,
  resolvedCrossings: string[],
  milesTraveled: number,
): RiverCrossing | undefined {
  const segment = getSegment(ctx, segmentId);
  if (!segment) return undefined;
  return segment.river_crossings.find(
    (rc) => rc.mile_marker > milesTraveled && !resolvedCrossings.includes(rc.id),
  );
}

export function getTotalTrailDistance(ctx: HistoricalContext): number {
  return ctx.segments.reduce((sum, s) => sum + s.distance_miles, 0);
}
