// Seekable airflow geometry. Wind is described by transported tracers, not emissive solid tubes.
import { clamp, smooth, TAU } from "./math.js";
import { pathLengths } from "./curves.js";
import type { Painter, Point } from "./painter.js";

export interface AirPoint { x: number; y: number; depth: number }
export interface AirTrailRun {
  points: Point[];
  /** Arc-length fraction in the complete trail, retained across front/back crossings. */
  from: number;
  to: number;
  back: boolean;
}
export interface HelicalAirflow {
  height: number;
  radius: number | ((u: number) => number);
  axis?: (u: number) => number;
  turns?: number;
  phase?: number;
  /** Projected depth on screen. Default 0.28; physical depth is retained separately. */
  perspective?: number;
  /** Smooth differential rotation, -0.9..0.9. No changes to the total number of turns. */
  shear?: number;
}

/** A rising, expanding helix sampled at normalized transit age. Radius/axis are authored profiles.
 * This is a kinematic streamline, not a Navier–Stokes solver. Reuse it for air AND entrained debris.
 */
export function helicalAirflow(u: number, o: HelicalAirflow): AirPoint {
  const { height, turns = 2, phase = 0, perspective = 0.28, shear = 0.3 } = o;
  if (![u, height, turns, phase, perspective, shear].every(Number.isFinite) || !(height > 0) || Math.abs(shear) > 0.9)
    throw new RangeError("Helical airflow requires finite dimensions, positive height, and shear within -0.9..0.9");
  const k = clamp(u), radius = typeof o.radius === "function" ? o.radius(k) : o.radius, axis = o.axis?.(k) ?? 0;
  if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(axis)) throw new RangeError("Airflow radius must be finite and non-negative; axis must be finite");
  const angle = phase + TAU * turns * (k + shear * Math.sin(Math.PI * k) / Math.PI), depth = Math.sin(angle) * radius;
  return { x: axis + Math.cos(angle) * radius, y: -height * k + perspective * depth, depth };
}

/** Sample the actual transported path, clipping at birth. Split at the depth plane with shared exact
 * endpoints; deleting far samples would draw a false chord across the character. Work is bounded.
 */
export function airflowTrail(position: (age: number) => AirPoint, age: number, seconds = 0.18, samples = 32, since = 0): AirTrailRun[] {
  if (![age, seconds, samples, since].every(Number.isFinite) || seconds < 0 || samples < 2 || samples > 256 || !Number.isInteger(samples))
    throw new RangeError("Airflow trail needs finite times, non-negative length, and 2..256 integer samples");
  if (age <= since || seconds === 0) return [];
  const start = Math.max(since, age - seconds), points: AirPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const q = position(start + (age - start) * i / (samples - 1));
    if (![q.x, q.y, q.depth].every(Number.isFinite)) throw new RangeError("Airflow positions must be finite");
    points.push({ ...q });
  }
  const lengths = pathLengths(points.map(q => [q.x, q.y])), total = lengths[lengths.length - 1];
  if (!(total > 0)) return [];
  const runs: AirTrailRun[] = [];
  const append = (a: AirPoint, b: AirPoint, from: number, to: number, back: boolean) => {
    if (to <= from) return;
    let run = runs[runs.length - 1];
    if (!run || run.back !== back) { run = { points: [[a.x, a.y]], from, to, back }; runs.push(run); }
    run.points.push([b.x, b.y]); run.to = to;
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], from = lengths[i - 1] / total, to = lengths[i] / total;
    if ((a.depth < 0) !== (b.depth < 0) && a.depth !== b.depth) {
      const k = -a.depth / (b.depth - a.depth), q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, depth: 0 };
      const cut = from + (to - from) * k;
      append(a, q, from, cut, a.depth < 0); append(q, b, cut, to, b.depth < 0);
    } else append(a, b, from, to, (a.depth + b.depth) < 0);
  }
  return runs;
}

export interface AirTrailStyle { back?: boolean; alpha?: number; width?: number; color: number; head?: number }
/** Connected pale tracers with a globally tapered tail and tip. No glow: ordinary air is not a light.
 * Painter.path resolves coverage once per run rather than accumulating opacity at every sample.
 */
export function drawAirflow(p: Pick<Painter, "path">, runs: readonly AirTrailRun[], style: AirTrailStyle) {
  const { alpha = 1, width = 1, color, head = color, back } = style;
  if (![alpha, width].every(Number.isFinite) || alpha < 0 || width < 0) throw new RangeError("Airflow opacity and width must be finite and non-negative");
  if (!(alpha > 0) || !(width > 0)) return;
  for (const run of runs) {
    if (back !== undefined && run.back !== back) continue;
    const global = (u: number) => run.from + (run.to - run.from) * u;
    p.path(run.points, u => global(u) > 0.58 ? head : color,
      u => alpha * smooth(0, 0.34, global(u)) * (1 - smooth(0.90, 1, global(u))), width);
  }
}
