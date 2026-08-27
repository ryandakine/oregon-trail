// Canonical color palette for Oregon Trail (2D Kaplay + 3D Three).
// Graphics polish WS1: single source — no comment-mirrored hexes in three/*.
//
// RGB triples are sRGB 0–255 (Kaplay k.color(...)).
// Use toHex / cssHex / toLinear01 for Three.js (apply convertSRGBToLinear on Color).
//
// The "Mood arc" blocks below are the miles→look ramp; which key fills which
// role in which segment lives in lib/segments.mjs, never here.

/** @type {Readonly<Record<string, readonly [number, number, number]>>} */
export const PALETTE = {
  // Sky
  sky:         [109, 128, 250],
  skyPale:     [168, 201, 255],
  skyDawn:     [255, 190, 130],
  skyDusk:     [200, 120, 100],
  skyTwilight: [58, 64, 112],
  skyNight:    [30, 30, 60],

  // Hills / mountains (far cooler / hazier)
  mountainFar: [130, 138, 158],
  mountainMid: [125, 132, 155],
  mountainDk:  [100, 112, 138],
  hillMid:     [90, 120, 58],
  hillNear:    [122, 143, 58],

  // Grass — dry wheat prairie (not golf neon)
  grassLight:  [160, 184, 106],
  grassMid:    [122, 143, 58],
  grassBorder: [74, 90, 42],
  grassDeep:   [92, 110, 50],
  dryTip:      [154, 139, 74],

  // Dirt
  dirtLight:   [196, 154, 108],
  dirtMid:     [145, 96, 55],
  dirtDark:    [109, 69, 32],

  // Wagon
  wood:        [90, 58, 31],
  woodLight:   [139, 90, 45],
  woodDark:    [55, 35, 18],
  canvas:      [245, 230, 200],
  canvasMid:   [232, 201, 154],
  canvasShadow:[200, 175, 130],

  // Oxen
  oxBrown:     [120, 85, 45],
  oxCream:     [220, 195, 155],
  oxDark:      [80, 55, 25],

  // Pioneers
  skin:        [235, 200, 160],
  shirt:       [240, 230, 210],
  vest:        [70, 50, 30],
  trousers:    [100, 70, 40],
  bonnet:      [240, 230, 200],
  dressBlue:   [80, 110, 170],
  hatFelt:     [65, 45, 30],

  // Shared
  outline:     [58, 42, 26],
  outlineLight:[95, 72, 48],
  cloud:       [250, 248, 240],
  cloudShadow: [215, 215, 225],
  black:       [30, 20, 10],

  // Sky detail
  sunCore:     [255, 238, 175],
  sunGlow:     [255, 215, 130],
  moon:        [226, 228, 216],
  moonShade:   [60, 64, 96],
  skyNightHorizon:    [42, 42, 74],
  skyTwilightHorizon: [58, 50, 80],
  sicklyHorizon:      [197, 208, 122],

  // Terrain detail
  mountainHaze: [152, 160, 188],
  mountainShade:[84, 96, 128],
  snow:         [238, 242, 248],
  flowerGold:   [236, 204, 92],
  flowerCream:  [246, 240, 222],
  scrubDead:    [126, 106, 70],
  rut:          [88, 56, 28],
  stone:        [150, 142, 132],
  stoneLight:   [186, 178, 168],
  dust:         [205, 180, 140],
  birdDark:     [72, 62, 50],
  straw:        [222, 190, 122],
  silhouetteFar:  [32, 38, 62],
  silhouetteNear: [22, 28, 48],

  // Mood arc — sky (zenith + horizon; horizon doubles as fog)
  skyPlatte:      [147, 168, 200],
  hazePlatte:     [212, 218, 210],
  skyBluff:       [95, 122, 214],
  skyFoothill:    [68, 93, 158],
  hazeFoothill:   [148, 162, 178],
  skyDivide:      [130, 146, 170],
  skySnake:       [108, 111, 150],
  skyBlueMtn:     [72, 84, 96],
  hazeBlueMtn:    [159, 169, 168],
  hazeWillamette: [207, 224, 230],

  // Mood arc — terrain
  bluffOchre:  [188, 124, 72],
  sageGray:    [124, 128, 104],
  alkaliBone:  [200, 204, 198],
  snakeSand:   [193, 150, 110],
  basaltDark:  [58, 52, 48],
  coniferDeep: [46, 64, 52],
  coniferMid:  [72, 94, 70],
  meadowMist:  [150, 174, 158],

  // Mood arc — far (atmospheric perspective: cooler + lower chroma)
  farBluff:      [156, 138, 142],
  farDivide:     [176, 188, 204],
  farSnake:      [150, 124, 124],
  farBlueMtn:    [106, 122, 128],
  farWillamette: [164, 184, 188],

  // Mood arc — accent (exactly one per segment, no two alike)
  riverSilt:    [118, 172, 150],
  pricklyRose:  [182, 80, 134],
  lupineViolet: [125, 111, 191],
  iceBlue:      [138, 184, 220],
  bloodRust:    [168, 58, 30],
  hearthAmber:  [240, 180, 106],
  orchardGreen: [140, 198, 96],

  // UI / parchment (AESTHETIC_SPEC)
  parchment:   [245, 230, 200],
  parchmentDark: [42, 31, 14],
  parchmentShadow: [200, 175, 130],
  gold:        [212, 160, 23],
  goldBright:  [255, 205, 60],
  dropShadow:  [30, 25, 15],

  // Health
  hpGreen:     [90, 138, 63],
  hpYellow:    [215, 165, 30],
  hpOrange:    [230, 140, 60],
  hpRed:       [178, 34, 34],
  hpDead:      [60, 60, 60],

  // Mild vertex tint for 3D grass (albedo drives color; keep near-neutral)
  grassTintMild: [210, 215, 175],
  backstopPrairie: [185, 188, 150],
  hemiGround: [70, 85, 48],
};

/**
 * @param {readonly [number, number, number]} rgb
 * @returns {number} 0xRRGGBB
 */
export function rgbToHex(rgb) {
  const r = rgb[0] & 255;
  const g = rgb[1] & 255;
  const b = rgb[2] & 255;
  return (r << 16) | (g << 8) | b;
}

/**
 * @param {keyof typeof PALETTE | string} key
 * @returns {number} 0xRRGGBB
 */
export function toHex(key) {
  const rgb = PALETTE[key];
  if (!rgb) throw new Error(`palette: unknown key ${key}`);
  return rgbToHex(rgb);
}

/**
 * @param {keyof typeof PALETTE | string} key
 * @returns {string} #rrggbb
 */
export function cssHex(key) {
  return `#${toHex(key).toString(16).padStart(6, "0")}`;
}

/**
 * sRGB 0–1 channels (before linear conversion).
 * @param {keyof typeof PALETTE | string} key
 * @returns {[number, number, number]}
 */
export function toSRGB01(key) {
  const rgb = PALETTE[key];
  if (!rgb) throw new Error(`palette: unknown key ${key}`);
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

/**
 * Approximate sRGB → linear per channel (for Three materials/lights).
 * @param {number} c 0–1 sRGB
 */
export function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * @param {keyof typeof PALETTE | string} key
 * @returns {[number, number, number]} linear RGB 0–1
 */
export function toLinear01(key) {
  const [r, g, b] = toSRGB01(key);
  return [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b)];
}

/** All keys — for tests / tooling. */
export function paletteKeys() {
  return Object.keys(PALETTE);
}
