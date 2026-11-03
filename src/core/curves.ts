// Pixel-space curve geometry. Rasterize the returned paths as connected segments, never isolated dots.
import type { Point } from "./shapes.js";

export interface CurveOptions {
  /** Maximum control-hull distance from a flattened segment, in logical pixels. Default: 0.25. */
  tolerance?: number;
  /** Connect the last point back to the first with a continuous tangent. */
  closed?: boolean;
}

const middle = (a: Point, b: Point): Point => [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
const copy = (p: Point): Point => [p[0], p[1]];
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

function segmentDistanceSquared(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const u = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  const ex = p[0] - a[0] - u * dx, ey = p[1] - a[1] - u * dy;
  return ex * ex + ey * ey;
}

function flatten(out: Point[], a: Point, b: Point, c: Point, d: Point, error2: number, depth: number) {
  // Distance to the finite segment also detects collinear reversals and closed/cusped curves.
  // A distance-to-infinite-line test would incorrectly collapse those into a single segment.
  if (depth === 16 || (segmentDistanceSquared(b, a, d) <= error2 && segmentDistanceSquared(c, a, d) <= error2)) {
    if (!same(out[out.length - 1], d)) out.push(copy(d));
    return;
  }
  const ab = middle(a, b), bc = middle(b, c), cd = middle(c, d);
  const abc = middle(ab, bc), bcd = middle(bc, cd), center = middle(abc, bcd);
  flatten(out, a, ab, abc, center, error2, depth + 1);
  flatten(out, center, bcd, cd, d, error2, depth + 1);
}

function errorSquared(tolerance: number) {
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError("Curve tolerance must be a finite positive number");
  return tolerance * tolerance;
}

/**
 * Adaptively flatten a cubic Bézier in logical-pixel space. Endpoints are exact, and straight portions
 * need only one segment. A 16-level subdivision ceiling bounds work for extreme coordinates.
 */
export function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, tolerance = 0.25): Point[] {
  const out = [copy(p0)];
  flatten(out, p0, p1, p2, p3, errorSquared(tolerance), 0);
  return out;
}

/** Adaptively flatten a quadratic Bézier, with the same pixel-space tolerance as cubicBezier. */
export function quadraticBezier(p0: Point, p1: Point, p2: Point, tolerance = 0.25): Point[] {
  return cubicBezier(p0,
    [p0[0] + (p1[0] - p0[0]) * 2 / 3, p0[1] + (p1[1] - p0[1]) * 2 / 3],
    [p2[0] + (p1[0] - p2[0]) * 2 / 3, p2[1] + (p1[1] - p2[1]) * 2 / 3], p2, tolerance);
}

/**
 * A centripetal Catmull–Rom path through the supplied points. Nonuniform knot spacing prevents the
 * loops and cusps produced by uniform splines around very unevenly spaced trail samples. Consecutive
 * duplicate points are ignored; open endpoints use reflected neighbors for stable end tangents.
 */
export function catmullRom(points: readonly Point[], { tolerance = 0.25, closed = false }: CurveOptions = {}): Point[] {
  const error2 = errorSquared(tolerance), pts: Point[] = [];
  for (const point of points) if (!pts.length || !same(pts[pts.length - 1], point)) pts.push(point);
  if (closed && pts.length > 1 && same(pts[0], pts[pts.length - 1])) pts.pop();
  if (pts.length < 2) return pts.map(copy);
  if (pts.length === 2) return closed ? [copy(pts[0]), copy(pts[1]), copy(pts[0])] : pts.map(copy);
  const out = [copy(pts[0])], n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const b = pts[i], c = pts[(i + 1) % n];
    const a: Point = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : [2 * b[0] - c[0], 2 * b[1] - c[1]];
    const d: Point = i + 2 < n ? pts[i + 2] : closed ? pts[(i + 2) % n] : [2 * c[0] - b[0], 2 * c[1] - b[1]];
    const dt0 = Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const dt1 = Math.sqrt(Math.hypot(c[0] - b[0], c[1] - b[1]));
    const dt2 = Math.sqrt(Math.hypot(d[0] - c[0], d[1] - c[1]));
    const c1: Point = [0, 0], c2: Point = [0, 0];
    for (let axis = 0; axis < 2; axis++) {
      const m1 = dt1 * ((b[axis] - a[axis]) / dt0 - (c[axis] - a[axis]) / (dt0 + dt1) + (c[axis] - b[axis]) / dt1);
      const m2 = dt1 * ((c[axis] - b[axis]) / dt1 - (d[axis] - b[axis]) / (dt1 + dt2) + (d[axis] - c[axis]) / dt2);
      c1[axis] = b[axis] + m1 / 3;
      c2[axis] = c[axis] - m2 / 3;
    }
    flatten(out, b, c1, c2, c, error2, 0);
  }
  return out;
}

/** Cumulative lengths in logical pixels. Divide a distance by the last entry for a global path u. */
export function pathLengths(points: readonly Point[]): Float64Array {
  const lengths = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) lengths[i] = lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return lengths;
}

/**
 * Samples at regular arc-length intervals, retaining the original corners and both endpoints so the
 * resampled path cannot cut across a sharp turn. Adjacent samples are at most spacing pixels apart.
 * Use this for particle placement or continuous trails after flattening; it never consumes RNG state.
 */
export function resamplePath(points: readonly Point[], spacing = 1): Point[] {
  if (!(spacing > 0) || !Number.isFinite(spacing)) throw new RangeError("Path spacing must be a finite positive number");
  if (!points.length) return [];
  const out = [copy(points[0])];
  let distance = 0, nextSample = spacing;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!length) continue;
    const end = distance + length;
    for (; nextSample < end; nextSample += spacing) {
      const u = (nextSample - distance) / length;
      if (u > 0) out.push([a[0] + dx * u, a[1] + dy * u]);
    }
    if (!same(out[out.length - 1], b)) out.push(copy(b));
    distance = end;
    if (nextSample <= distance) nextSample += spacing;
  }
  return out;
}
