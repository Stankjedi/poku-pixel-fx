/** World units, seconds, radians; +Y is up. Pure, deterministic 3D helpers. */
export type Vec3 = readonly [number, number, number];
export const TAU3 = Math.PI * 2;
export const clamp3 = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const lerp3 = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth3 = (a: number, b: number, t: number) => {
  const u = clamp3((t - a) / (b - a || 1));
  return u * u * (3 - 2 * u);
};
export const outCubic3 = (t: number) => 1 - Math.pow(1 - clamp3(t), 3);
export const outBack3 = (t: number) => {
  const u = clamp3(t) - 1, c = 1.70158;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: Vec3, f: number): Vec3 => [a[0] * f, a[1] * f, a[2] * f];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a: Vec3) => Math.hypot(...a);
export const norm3 = (a: Vec3): Vec3 => mul3(a, 1 / (len3(a) || 1));

/** Mulberry32: same seed => same sequences, independent of Math.random(). */
export class Rng3D {
  private state: number;
  constructor(seed = 1) { this.state = seed | 0; }
  next(): number {
    let t = this.state = (this.state + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number) { return lerp3(min, max, this.next()); }
  int(min: number, max: number) { return Math.floor(this.range(min, max + 1)); }
  chance(p: number) { return this.next() < p; }
  sign() { return this.chance(0.5) ? -1 : 1; }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
}
