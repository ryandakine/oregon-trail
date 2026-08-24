// Mood arc: miles → look. The 8 visual segments the 1,764-mile trail is read as.
//
// Boundaries are NOT invented. The worker owns the trail in worker/src/
// historical-context.json (16 segments, GameState carries position.
// current_segment_id) and every mileStart/mileEnd below lands on a real datum
// from that file — a segment boundary, or a landmark mile_marker where one
// server segment has to carry two looks. serverSegmentIds records which server
// rows each visual segment covers. Miles are authoritative; the id list is for
// cross-checking, because seg_04 straddles the Chimney Rock split.
//
//   arc_prairie        0– 313  seg_01+02+03
//   arc_platte       313– 460  seg_04 head   (ends at lm_chimney_rock, mile 460)
//   arc_bluffs       460– 594  seg_04 tail + seg_05
//   arc_sweetwater   594– 874  seg_06+07     (ends at lm_south_pass, mile 874)
//   arc_divide       874–1074  seg_08+09
//   arc_snake       1074–1424  seg_10+11+12+13
//   arc_blue_mtns   1424–1674  seg_14+15
//   arc_willamette  1674–1764  seg_16
//
// Palette roles hold PALETTE key names from lib/palette.mjs, never hexes —
// resolve with toHex / cssHex / toSRGB01 at the call site.
//
//   zenith     sky top; with horizon this is the 60% of the frame
//   horizon    sky bottom; renderers should use it as the fog colour too
//   ground     dominant terrain mid — the 30%
//   groundAlt  second terrain tone: lighter scatter in open country, darker
//              mass in rock and forest country
//   far        distant band under atmospheric perspective — always cooler and
//              lower-chroma than that segment's ground
//   accent     the 10%, one per segment and no two alike, chosen to survive
//              the high-tier crush (2D drawSky, 3D sky.setTone)
//
// The shared darks (outline, silhouetteFar/Near, black) stay global on purpose.
// Eight segments vary the light and the mid; the dark anchor is what keeps this
// one game instead of eight.

import { PALETTE } from './palette.mjs';

/** Total trail distance — matches getTotalTrailDistance() over the server segments. */
export const TOTAL_TRAIL_MILES = 1764;

/**
 * Width of the cross-fade centred on each boundary: a segment starts bleeding
 * in 20 miles early and is fully itself 20 miles late. Must stay <= the
 * shortest segment (90, arc_willamette) or two windows would overlap.
 */
export const TRANSITION_MILES = 40;

/**
 * @typedef {'prairie'|'river_valley'|'bluffs'|'foothills'|'snow'|'desert'|'forest'|'arrival'} Biome
 * @typedef {{ zenith: string, horizon: string, ground: string, groundAlt: string, far: string, accent: string }} SegmentPalette
 * @typedef {{ kind: 'none'|'rain'|'snow'|'dust', intensity: number }} WeatherBias
 * @typedef {{ id: string, index: number, name: string, mileStart: number, mileEnd: number,
 *             biome: Biome, serverSegmentIds: string[], palette: SegmentPalette,
 *             weatherBias: WeatherBias, dressing: string[] }} Segment
 */

/** @type {ReadonlyArray<Segment>} */
export const SEGMENTS = [
  {
    id: 'arc_prairie',
    index: 0,
    name: 'Tallgrass Prairie',
    mileStart: 0,
    mileEnd: 313,
    biome: 'prairie',
    serverSegmentIds: ['seg_01', 'seg_02', 'seg_03'],
    palette: {
      zenith: 'sky',
      horizon: 'skyPale',
      ground: 'grassMid',
      groundAlt: 'grassLight',
      far: 'backstopPrairie',
      accent: 'flowerGold',
    },
    weatherBias: { kind: 'rain', intensity: 0.35 },
    dressing: ['tallgrass', 'wildflowers', 'cottonwood', 'creek'],
  },
  {
    id: 'arc_platte',
    index: 1,
    name: 'Platte River Valley',
    mileStart: 313,
    mileEnd: 460,
    biome: 'river_valley',
    serverSegmentIds: ['seg_04'],
    palette: {
      zenith: 'skyPlatte',
      horizon: 'hazePlatte',
      ground: 'dryTip',
      groundAlt: 'straw',
      far: 'mountainHaze',
      accent: 'riverSilt',
    },
    weatherBias: { kind: 'rain', intensity: 0.3 },
    dressing: ['cottonwood', 'braided_river', 'sandbar', 'buffalo_wallow'],
  },
  {
    id: 'arc_bluffs',
    index: 2,
    name: 'Chimney Bluffs',
    mileStart: 460,
    mileEnd: 594,
    biome: 'bluffs',
    serverSegmentIds: ['seg_04', 'seg_05'],
    palette: {
      zenith: 'skyBluff',
      horizon: 'dust',
      ground: 'bluffOchre',
      groundAlt: 'dirtLight',
      far: 'farBluff',
      accent: 'pricklyRose',
    },
    weatherBias: { kind: 'dust', intensity: 0.45 },
    dressing: ['sandstone_spire', 'yucca', 'prickly_pear', 'wagon_ruts'],
  },
  {
    id: 'arc_sweetwater',
    index: 3,
    name: 'Sweetwater Foothills',
    mileStart: 594,
    mileEnd: 874,
    biome: 'foothills',
    serverSegmentIds: ['seg_06', 'seg_07'],
    palette: {
      zenith: 'skyFoothill',
      horizon: 'hazeFoothill',
      ground: 'sageGray',
      groundAlt: 'stone',
      far: 'mountainFar',
      accent: 'lupineViolet',
    },
    weatherBias: { kind: 'rain', intensity: 0.35 },
    dressing: ['sagebrush', 'granite_dome', 'alkali_flat', 'wagon_ruts'],
  },
  {
    id: 'arc_divide',
    index: 4,
    name: 'South Pass Divide',
    mileStart: 874,
    mileEnd: 1074,
    biome: 'snow',
    serverSegmentIds: ['seg_08', 'seg_09'],
    palette: {
      zenith: 'skyDivide',
      horizon: 'cloudShadow',
      ground: 'alkaliBone',
      groundAlt: 'mountainMid',
      far: 'farDivide',
      accent: 'iceBlue',
    },
    weatherBias: { kind: 'snow', intensity: 0.4 },
    dressing: ['snow_patch', 'wind_scoured_rock', 'stunted_pine', 'divide_marker'],
  },
  {
    id: 'arc_snake',
    index: 5,
    name: 'Snake River Plain',
    mileStart: 1074,
    mileEnd: 1424,
    biome: 'desert',
    serverSegmentIds: ['seg_10', 'seg_11', 'seg_12', 'seg_13'],
    palette: {
      zenith: 'skySnake',
      horizon: 'skyDusk',
      ground: 'snakeSand',
      groundAlt: 'basaltDark',
      far: 'farSnake',
      accent: 'bloodRust',
    },
    weatherBias: { kind: 'dust', intensity: 0.55 },
    dressing: ['basalt_rim', 'sagebrush', 'canyon_wall', 'alkali_crust'],
  },
  {
    id: 'arc_blue_mtns',
    index: 6,
    name: 'Blue Mountains',
    mileStart: 1424,
    mileEnd: 1674,
    biome: 'forest',
    serverSegmentIds: ['seg_14', 'seg_15'],
    palette: {
      zenith: 'skyBlueMtn',
      horizon: 'hazeBlueMtn',
      ground: 'coniferDeep',
      groundAlt: 'coniferMid',
      far: 'farBlueMtn',
      accent: 'hearthAmber',
    },
    weatherBias: { kind: 'rain', intensity: 0.6 },
    dressing: ['fir_spire', 'deadfall', 'mossy_boulder', 'switchback'],
  },
  {
    id: 'arc_willamette',
    index: 7,
    name: 'Willamette Arrival',
    mileStart: 1674,
    mileEnd: 1764,
    biome: 'arrival',
    serverSegmentIds: ['seg_16'],
    palette: {
      zenith: 'skyPale',
      horizon: 'hazeWillamette',
      ground: 'meadowMist',
      groundAlt: 'hillMid',
      far: 'farWillamette',
      accent: 'orchardGreen',
    },
    weatherBias: { kind: 'none', intensity: 0 },
    dressing: ['orchard_row', 'split_rail', 'oak_grove', 'river_mist'],
  },
];

const LAST = SEGMENTS.length - 1;

function clampMiles(miles) {
  const m = Number(miles);
  if (!Number.isFinite(m)) return 0;
  return m < 0 ? 0 : m > TOTAL_TRAIL_MILES ? TOTAL_TRAIL_MILES : m;
}

function indexForMiles(miles) {
  for (let i = 0; i < SEGMENTS.length; i++) {
    // At exactly the end mile the party is still in this segment — same rule as
    // getSegmentForMile() in worker/src/context-loader.ts.
    if (miles <= SEGMENTS[i].mileEnd) return i;
  }
  return LAST;
}

/** Hermite ease so the cross-fade has no kink at either end of the window. */
function smoothstep(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * @param {number} miles
 * @returns {Segment}
 */
export function segmentForMiles(miles) {
  return SEGMENTS[indexForMiles(clampMiles(miles))];
}

/**
 * Neighbouring segments and how far between them this mile sits. Outside a
 * transition window a === b and t === 0, so a consumer can lerp every role
 * unconditionally and get an exact segment colour back.
 *
 * @param {number} miles
 * @returns {{ a: Segment, b: Segment, t: number }}
 */
export function segmentBlend(miles) {
  const m = clampMiles(miles);
  const i = indexForMiles(m);
  const seg = SEGMENTS[i];
  const half = TRANSITION_MILES / 2;

  if (i > 0 && m < seg.mileStart + half) {
    const raw = (m - (seg.mileStart - half)) / TRANSITION_MILES;
    return { a: SEGMENTS[i - 1], b: seg, t: smoothstep(raw) };
  }
  if (i < LAST && m > seg.mileEnd - half) {
    const raw = (m - (seg.mileEnd - half)) / TRANSITION_MILES;
    return { a: seg, b: SEGMENTS[i + 1], t: smoothstep(raw) };
  }
  return { a: seg, b: seg, t: 0 };
}

/**
 * Every PALETTE key the arc references, deduped — for tests and tooling.
 * @returns {string[]}
 */
export function segmentPaletteKeys() {
  const seen = new Set();
  for (const seg of SEGMENTS) {
    for (const key of Object.values(seg.palette)) {
      if (!(key in PALETTE)) throw new Error(`segments: unknown palette key ${key}`);
      seen.add(key);
    }
  }
  return [...seen];
}
