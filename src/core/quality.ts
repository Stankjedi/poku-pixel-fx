// Shared art-direction primitives: clean silhouettes, intentional trails and localized light.
// These reduce common artifacts, but do not replace render/inspect/refine or guarantee artistic quality.
import { cubicBezier } from "./curves.js";
import { clamp, smooth } from "./math.js";
import type { Point, PaintValue, PathOptions } from "./painter.js";

export interface RibbonShape { top: Point[]; bottom: Point[]; shape: Point[] }
/** Two adaptive Bézier edges meeting at exact needle tips. Coordinates remain unsnapped until paint.
 * upper/lower are control-point heights, not the final silhouette's maximum half-height.
 */
export function pointedRibbon(left: number, right: number, upper: number, lower: number,
  bend = 0, tolerance = 0.12): RibbonShape {
  if (![left, right, upper, lower, bend].every(Number.isFinite)) throw new RangeError("Ribbon dimensions must be finite");
  const span = right - left;
  const top = cubicBezier([left, 0], [left + span * 0.27, -upper + bend], [left + span * 0.71, -upper + bend], [right, 0], tolerance);
  const bottom = cubicBezier([left, 0], [left + span * 0.30, lower + bend], [left + span * 0.75, lower + bend], [right, 0], tolerance);
  return { top, bottom, shape: [...top, ...bottom.slice().reverse()] };
}

/** Tail-to-head samples of the actual trajectory, clipped at birth or the most recent collision.
 * Pure and seekable: drawing never advances a simulation or consumes RNG state.
 */
export function motionTrail(position: (age: number) => Point, age: number, seconds = 0.06,
  samples = 7, since = 0): Point[] {
  if (![age, seconds, samples, since].every(Number.isFinite) || seconds < 0 || samples < 2 || samples > 256 || !Number.isInteger(samples))
    throw new RangeError("Trail times must be finite; seconds non-negative; samples an integer from 2 to 256");
  if (age < since) return [];
  const start = Math.max(since, age - seconds), points: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const point = position(start + (age - start) * i / (samples - 1));
    if (!point.every(Number.isFinite)) throw new RangeError("Trail positions must be finite");
    const last = points[points.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push([point[0], point[1]]);
  }
  return points;
}

export interface TrailPainter {
  path(points: readonly Point[], color: PaintValue, alpha?: PaintValue, width?: number, options?: PathOptions): void;
  dot(x: number, y: number, color: number, alpha?: number): void;
  glow(x: number, y: number, radius: number, color: number, strength?: number): void;
}
export interface TrailStyle {
  color: number;
  /** Bright head ramp step. White is optional, never forced. */
  head?: number;
  width?: number;
  alpha?: number;
  /** Strength of the small head light. Default 0.12; 0 turns it off. */
  light?: number;
  lightRadius?: number;
}
/** A single connected, coverage-tapered trail with a stepped bright head and restrained head light.
 * Alpha tapers the subpixel tail rather than adding noise, dither, or repeated overlapping dots.
 */
export function drawTrail(p: TrailPainter, points: readonly Point[], style: TrailStyle) {
  const { color, head = color, width = 1, alpha = 1, light = 0.12, lightRadius = 2.5 } = style;
  if (!points.length || !(alpha > 0) || !(width > 0)) return;
  const end = points[points.length - 1];
  if (points.length === 1) p.dot(end[0], end[1], head, alpha * Math.min(1, width));
  else p.path(points, u => u > 0.60 ? head : color, u => alpha * (0.20 + 0.80 * u ** 1.5), width, { preferHead: true });
  if (light > 0) p.glow(end[0], end[1], lightRadius, color, alpha * light);
}

/** Evenly spaced emission with bounded seeded jitter; keeps intentional negative space.
 * One RNG draw per particle, including count=1. Does not consume shared state during rendering.
 */
export function stratified(count: number, random: { next(): number }, jitter = 0.65): number[] {
  if (!Number.isInteger(count) || count < 0 || count > 65536) throw new RangeError("Particle count must be an integer from 0 to 65536");
  if (!Number.isFinite(jitter)) throw new RangeError("Particle jitter must be finite");
  const spread = clamp(jitter);
  return Array.from({ length: count }, (_, i) => (i + 0.5 + (random.next() - 0.5) * spread) / count);
}

/** Smooth birth/death envelope in normalized life coordinates, with no terminal pop. */
export function particleEnvelope(age: number, life: number, attack = 0.04, fadeStart = 0.25) {
  if (!(life > 0) || age <= 0 || age >= life) return 0;
  const u = age / life;
  return smooth(0, Math.max(1e-6, attack), u) * (1 - smooth(clamp(fadeStart), 1, u));
}
