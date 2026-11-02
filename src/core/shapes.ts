// Point lists for shapes effects keep reaching for: lightning paths, stars, polygons, trails.

import { TAU } from "./math.js";

export type Point = [number, number];
export interface RandomSource { next(): number }
export interface BoltOptions { jag?: number; depth?: number }
export interface ForkOptions { count?: number; len?: number; jag?: number; spread?: number }

/**
 * A jagged lightning path from (x0, y0) to (x1, y1) by midpoint displacement. jag is how far a midpoint
 * may move sideways, as a share of the segment's length. Returns [[x, y], ...].
 */
export function bolt(r: RandomSource, x0: number, y0: number, x1: number, y1: number, { jag = 0.22, depth = 5 }: BoltOptions = {}): Point[] {
  let pts: Point[] = [[x0, y0], [x1, y1]];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      const off = (r.next() * 2 - 1) * jag * L;
      next.push([(ax + bx) / 2 + (-dy / (L || 1)) * off, (ay + by) / 2 + (dx / (L || 1)) * off], pts[i]);
    }
    pts = next;
  }
  return pts;
}

/** Forks off a bolt path: count branches, each up to len px long. Returns a list of paths. */
export function forks(r: RandomSource, path: Point[], { count = 3, len = 20, jag = 0.3, spread = 0.9 }: ForkOptions = {}): Point[][] {
  const out = [];
  for (let k = 0; k < count; k++) {
    const i = 1 + Math.floor(r.next() * (path.length - 2)), [x, y] = path[i], [px, py] = path[i - 1];
    const a = Math.atan2(y - py, x - px) + (r.next() < 0.5 ? -1 : 1) * spread * (0.4 + 0.6 * r.next());
    const l = len * (0.4 + 0.6 * r.next());
    out.push(bolt(r, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, { jag, depth: 3 }));
  }
  return out;
}

/** A star: n points between radii r1 (tips) and r0 (inner corners). */
export function star(cx: number, cy: number, r0: number, r1: number, n = 5, rot = -Math.PI / 2): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? r0 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** A regular polygon with n sides. */
export function ngon(cx: number, cy: number, r: number, n = 6, rot = 0): Point[] {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + (i * TAU) / n) * r, cy + Math.sin(rot + (i * TAU) / n) * r]);
}

/** Positions of pos(t - i * dt) for i = 0..n-1: a moving thing's trail, newest first. */
export function trail<T>(pos: (t: number) => T, t: number, n: number, dt: number): T[] {
  const out = [];
  for (let i = 0; i < n; i++) out.push(pos(Math.max(0, t - i * dt)));
  return out;
}
