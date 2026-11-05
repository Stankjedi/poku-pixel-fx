// Particles without a simulation: each one's position is a closed-form function of its age, so an effect
// can be drawn at any time t, scrubbed, looped and rendered to a sprite sheet frame by frame.

import { rng, clamp, type Rng } from "./math.js";

/**
 * Where a particle is after t seconds, launched from (x, y) at (vx, vy) px/s, under gravity g (px/s²,
 * positive is down) and linear drag (1/s). Returns [x, y].
 */
export function fly(x: number, y: number, vx: number, vy: number, t: number, g = 0, drag = 0): [number, number] {
  if (drag <= 0) return [x + vx * t, y + vy * t + 0.5 * g * t * t];
  const f = -Math.expm1(-drag * t) / drag;
  return [x + vx * f, y + vy * f + g * accelerationTime(t, drag, f)];
}
/** Its velocity at t, for streaks that point along the motion. Returns [vx, vy]. */
export function flyV(vx: number, vy: number, t: number, g = 0, drag = 0): [number, number] {
  if (drag <= 0) return [vx, vy + g * t];
  const e = Math.exp(-drag * t), f = -Math.expm1(-drag * t) / drag;
  return [vx * e, vy * e + g * f];
}

// Integral of the velocity response. The series avoids subtracting two nearly equal times
// when drag approaches zero; the result tends continuously to t² / 2.
function accelerationTime(t: number, drag: number, f: number) {
  const z = drag * t;
  return Math.abs(z) < 1e-3
    ? t * t * (0.5 + z * (-1 / 6 + z * (1 / 24 + z * (-1 / 120 + z / 720))))
    : (t - f) / drag;
}

/** Exact motion for constant acceleration and linear drag during one step, without allocations.
 * Negative drag is supported for intentionally accelerating streaks. Collision response is separate.
 */
export function integrateMotion2D(p: { x: number; y: number; vx: number; vy: number }, dt: number,
  ax = 0, ay = 0, drag = 0, dragY = drag) {
  const ex = Math.exp(-drag * dt), fx = drag === 0 ? dt : -Math.expm1(-drag * dt) / drag;
  const gx = accelerationTime(dt, drag, fx);
  const ey = dragY === drag ? ex : Math.exp(-dragY * dt);
  const fy = dragY === drag ? fx : dragY === 0 ? dt : -Math.expm1(-dragY * dt) / dragY;
  const gy = dragY === drag ? gx : accelerationTime(dt, dragY, fy);
  p.x += p.vx * fx + ax * gx;
  p.y += p.vy * fy + ay * gy;
  p.vx = p.vx * ex + ax * fx;
  p.vy = p.vy * ey + ay * fy;
}

/**
 * n one-shot particles: fn(r, i) with a repeatable rng per particle (the same numbers every frame).
 */
export function burst(n: number, seed: number, fn: (r: Rng, i: number) => void) {
  for (let i = 0; i < n; i++) fn(rng(seed, i), i);
}

/**
 * Particles that repeat every `period` seconds, for loops with no seam. Particle i is born at its own
 * phase in the period and lives `life` seconds (a number, or a function of an rng). For every live copy,
 * fn(age, life, r, i) is called; r is a fresh rng for particle i, the same each period.
 * Period must be finite and positive; time, seed, count and lifetimes must be finite. Non-positive
 * lifetimes emit nothing. At most 65536 source particles and 65536 live copies per call, otherwise throws.
 * Fractional counts retain the existing round-up behavior. Valid emission order and RNG are unchanged.
 */
export function cycle(t: number, period: number, count: number, seed: number, life: number | ((r: Rng) => number), fn: (age: number, life: number, r: Rng, i: number) => void) {
  const limit = 65536;
  if (!Number.isFinite(period) || period <= 0) throw new RangeError('Cycle period must be finite and positive');
  if (!Number.isFinite(t) || !Number.isFinite(seed)) throw new RangeError('Cycle time and seed must be finite');
  if (!Number.isFinite(count) || count < 0 || count > limit) throw new RangeError(`Cycle count must be finite and between 0 and ${limit}`);
  if (typeof life !== 'function' && !Number.isFinite(life)) throw new RangeError('Cycle lifetime must be finite');
  let remaining = limit;
  for (let i = 0; i < count; i++) {
    const g = rng(seed, i, 911);
    const born = g.next() * period;
    const L = typeof life === "function" ? life(g) : life;
    if (!Number.isFinite(L)) throw new RangeError('Cycle lifetime must be finite');
    let age = (((t - born) % period) + period) % period;
    if (!Number.isFinite(age)) throw new RangeError('Cycle time overflow');
    // A valid but tiny period can otherwise request billions of overlapping live copies.
    if (Math.max(0, Math.ceil((L - age) / period)) > remaining)
      throw new RangeError(`Cycle exceeds ${limit} live copies; reduce count/life or increase period`);
    for (; age < L; age += period) {
      // Also guard accumulated rounding at the boundary without altering the original age arithmetic.
      if (remaining-- === 0) throw new RangeError(`Cycle exceeds ${limit} live copies`);
      fn(age, L, rng(seed, i), i);
    }
  }
}

/**
 * Particles born at a steady rate between t0 and t1 (an emitter that stops): fn(age, life, r, i) for every
 * particle alive at t. rate is particles per second.
 */
export function stream(t: number, t0: number, t1: number, rate: number, seed: number, life: number | ((r: Rng) => number), fn: (age: number, life: number, r: Rng, i: number) => void) {
  const n = Math.floor((Math.min(t, t1) - t0) * rate);
  for (let i = 0; i <= n; i++) {
    const born = t0 + i / rate, g = rng(seed, i, 911), L = typeof life === "function" ? life(g) : life;
    const age = t - born;
    if (age >= 0 && age < L) fn(age, L, rng(seed, i), i);
  }
}

/** A simple simulated particle list, for effects that export create() and keep state. */
export interface ParticleInput { x: number; y: number; vx: number; vy: number; life: number; age?: number; g?: number; drag?: number; ground?: number; bounce?: number; [key: string]: unknown }
export type ActiveParticle = ParticleInput & { age: number; g: number; drag: number };
export class Particles {
  list: ActiveParticle[];
  constructor() {
    this.list = [];
  }
  /** p: { x, y, vx, vy, life, g?, drag?, ground?, bounce? } plus anything you want to draw with. */
  add<T extends ParticleInput>(p: T): T & ActiveParticle {
    p.age = 0;
    p.g ??= 0;
    p.drag ??= 0;
    this.list.push(p as T & ActiveParticle);
    return p as T & ActiveParticle;
  }
  update(dt: number) {
    let write = 0;
    for (const p of this.list) {
      if ((p.age += dt) >= p.life) continue;
      integrateMotion2D(p, dt, 0, p.g, Math.max(0, p.drag));
      if (p.ground !== undefined && p.y > p.ground) {
        p.y = p.ground;
        p.vy = -Math.abs(p.vy) * (p.bounce ?? 0.3);
        p.vx *= 0.7;
      }
      this.list[write++] = p;
    }
    this.list.length = write;
  }
  /** Life left, 1 at birth to 0 at death. */
  static k(p: Pick<ActiveParticle, "age" | "life">) {
    return clamp(1 - p.age / p.life);
  }
}
