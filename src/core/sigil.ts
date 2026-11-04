// Precise geometry for authored magic seals. Nothing here chooses a palette, emits light, or adds noise.
import type { Point } from './painter.js';
import { pathLengths } from './curves.js';

export interface SigilPlane {
  /** Screen position of the plane origin. */
  x?: number; y?: number;
  /** Rotation in the unsquashed plane, radians. */
  rotation?: number;
  /** Depth projected to screen y. Zero is an edge-on plane. */
  perspective?: number;
  /** Height above the plane; it never changes front/back classification. */
  height?: number;
}
/** Authored (x, depth, optional height) before projection. */
export type SigilPoint = readonly [number, number, number?];
export interface SigilRun {
  points: Point[];
  back: boolean;
  /** Screen arc-length fractions of the complete stroke, not restarted at a depth crossing. */
  from: number; to: number;
}

/** Project authored strokes before splitting them at physical depth = 0. Crossings get an exact shared
 * endpoint, so a back/front split cannot bridge a character with a false chord. Input paths are open;
 * repeat the first point to close a shape. An optional per-point height supports rising strokes. Runs retain order and may be painted in either layer.
 */
export function projectSigilPath(points: readonly SigilPoint[], plane: SigilPlane = {}): SigilRun[] {
  const { x = 0, y = 0, rotation = 0, perspective = .3, height = 0 } = plane;
  if (![x, y, rotation, perspective, height].every(Number.isFinite) || perspective < 0 || perspective > 1)
    throw new RangeError('A sigil plane needs finite dimensions and perspective within 0..1');
  if (points.length > 1024) throw new RangeError('A sigil stroke supports at most 1024 vertices');
  const cs = Math.cos(rotation), sn = Math.sin(rotation);
  const vertices = points.map(([u, v, lift = 0]) => {
    if (![u, v, lift].every(Number.isFinite)) throw new RangeError('Sigil coordinates must be finite');
    const depth = u * sn + v * cs;
    const q = { x: x + u * cs - v * sn, y: y + depth * perspective - height - lift, depth };
    if (![q.x, q.y, q.depth].every(Number.isFinite)) throw new RangeError('Projected sigil coordinates must remain finite');
    return q;
  });
  if (vertices.length < 2) return [];
  const lengths = pathLengths(vertices.map(q => [q.x, q.y])), total = lengths[lengths.length - 1];
  if (!Number.isFinite(total)) throw new RangeError('Projected sigil length must remain finite');
  if (!(total > 0)) return [];
  const runs: SigilRun[] = [];
  const append = (a: typeof vertices[number], b: typeof a, from: number, to: number, back: boolean) => {
    if (to <= from) return;
    let run = runs.at(-1);
    if (!run || run.back !== back) { run = { points: [[a.x, a.y]], back, from, to }; runs.push(run); }
    run.points.push([b.x, b.y]); run.to = to;
  };
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1], b = vertices[i], from = lengths[i - 1] / total, to = lengths[i] / total;
    if ((a.depth < 0) !== (b.depth < 0) && a.depth !== b.depth) {
      const u = -a.depth / (b.depth - a.depth), q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, depth: 0 };
      const cut = from + (to - from) * u;
      append(a, q, from, cut, a.depth < 0); append(q, b, cut, to, b.depth < 0);
    } else append(a, b, from, to, a.depth + b.depth < 0);
  }
  return runs;
}

/** An open arc in the unsquashed plane. The chord error is bounded in screen space for every supported
 * perspective. Exact full turns close on the first point instead of leaving floating-point cracks.
 * At most 1024 vertices; reject unrepresentable tolerances rather than silently violating them.
 */
export function sigilArc(radius: number, start = 0, end = Math.PI * 2, tolerance = .18): Point[] {
  if (![radius, start, end, tolerance].every(Number.isFinite) || radius < 0 || !(tolerance > 0))
    throw new RangeError('Sigil arcs need a finite non-negative radius and positive tolerance');
  const span = end - start;
  if (Math.abs(span) > Math.PI * 2 + 1e-10) throw new RangeError('A sigil arc supports at most one complete turn');
  if (radius === 0 || span === 0) return [[Math.cos(start) * radius, Math.sin(start) * radius]];
  const step = 2 * Math.acos(Math.max(-1, 1 - tolerance / radius));
  const n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2)), Math.ceil(Math.abs(span) / step));
  if (n > 1023 || !Number.isFinite(n)) throw new RangeError('Sigil arc tolerance needs more than 1024 vertices');
  const points = Array.from({ length: n + 1 }, (_, i): Point => {
    const a = start + span * i / n; return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  if (Math.abs(Math.abs(span) - Math.PI * 2) < 1e-12) points[n] = [...points[0]];
  return points;
}
