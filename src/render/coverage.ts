/** Alpha changes a pixel's coverage, never its grid position or its neighbours. */
export type AlphaMode = "coverage" | "dither";

/** Straight-alpha source-over for the engine's packed ABGR colors. */
export function blendOver(destination: number, source: number, opacity: number): number {
  const alpha = Math.min(1, Math.max(0, opacity)) * (source >>> 24) / 255;
  if (!(alpha > 0)) return destination;
  if (alpha >= 1) return source >>> 0;
  const behind = (destination >>> 24) / 255 * (1 - alpha);
  const outAlpha = alpha + behind;
  const r = Math.round(((source & 255) * alpha + (destination & 255) * behind) / outAlpha);
  const g = Math.round((((source >>> 8) & 255) * alpha + ((destination >>> 8) & 255) * behind) / outAlpha);
  const b = Math.round((((source >>> 16) & 255) * alpha + ((destination >>> 16) & 255) * behind) / outAlpha);
  return ((Math.round(outAlpha * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
