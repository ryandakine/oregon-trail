// Type surface for the untyped shared palette module (public/lib/palette.mjs).
// The frontend is deliberately no-build vanilla JS, so this declaration exists
// solely for worker/tests/palette.test.ts to typecheck its imports. Keep in
// sync with the runtime exports it names.
declare module "*/palette.mjs" {
  export const PALETTE: Record<string, [number, number, number]>;
  export function rgbToHex(rgb: [number, number, number]): number;
  export function toHex(key: string): number;
  export function cssHex(key: string): string;
  export function toSRGB01(key: string): [number, number, number];
  export function srgbChannelToLinear(c: number): number;
  export function toLinear01(key: string): [number, number, number];
  export function paletteKeys(): string[];
}
