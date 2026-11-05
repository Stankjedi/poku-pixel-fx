import { hex } from "./color.js";

export interface MaterialRamp2DOptions {
  /** Ascending diffuse thresholds, one fewer than palette colors. Default: equal-width bands.
   * Author wider body bands or narrower bright bands to distinguish materials. */
  thresholds?: readonly number[];
  /** Optional authored specular color. Its threshold is independent of the diffuse bands. */
  highlight?: { color: string | number; threshold: number };
}
function opaque(color: string | number): number {
  if (typeof color === "string") {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) throw new RangeError("Material colors must be #rgb or #rrggbb");
    return hex(color) >>> 0;
  }
  if (!Number.isInteger(color) || color < -2147483648 || color > 0xffffffff || color >>> 24 !== 255)
    throw new RangeError("Packed material colors must be opaque ABGR integers");
  return color >>> 0;
}

/** Compile a fixed-palette material response, not a lighting simulation or image filter.
 * Input diffuse/specular responses are finite numbers, normally 0..1. Out-of-range diffuse
 * selects an endpoint. Specular highlights require positive diffuse to avoid unlit highlights.
 * Returns only authored colors, with no blending, dither, noise, or writes to light/alpha buffers.
 * Inputs are snapshotted, so one compiled ramp can be reused across every animation frame.
 */
export function createMaterialRamp2D(palette: readonly (string | number)[], options: MaterialRamp2DOptions = {}): (diffuse: number, specular?: number) => number {
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 256)
    throw new RangeError("Material palette needs 1 to 256 colors");
  const colors = Array.from(palette, opaque);
  const thresholds = options.thresholds === undefined
    ? Array.from({ length: colors.length - 1 }, (_, i) => (i + 1) / colors.length)
    : Array.from(options.thresholds);
  if (thresholds.length !== colors.length - 1 || thresholds.some((t, i) =>
    !Number.isFinite(t) || t <= 0 || t >= 1 || (i > 0 && t <= thresholds[i - 1])))
    throw new RangeError("Material thresholds must ascend strictly inside 0..1, with one fewer than palette colors");
  const highlight = options.highlight ? { color: opaque(options.highlight.color), threshold: options.highlight.threshold } : undefined;
  if (highlight && (!Number.isFinite(highlight.threshold) || highlight.threshold <= 0 || highlight.threshold > 1))
    throw new RangeError("Highlight threshold must be above zero and at most one");
  return (diffuse, specular = 0) => {
    if (!Number.isFinite(diffuse) || !Number.isFinite(specular)) throw new RangeError("Material light responses must be finite");
    if (highlight && diffuse > 0 && specular >= highlight.threshold) return highlight.color;
    let index = 0;
    while (index < thresholds.length && diffuse >= thresholds[index]) index++;
    return colors[index];
  };
}
