/** Small secondary particles with baked births and seekable, frame-rate-independent motion. */
import { hex } from './color.js';
import { rng, TAU } from './math.js';
import { fly, flyV } from './particles.js';
import { drawTrail, motionTrail, particleEnvelope, type TrailPainter } from './quality.js';
import type { Painter, Point } from './painter.js';

export type DetailRange2D = number | readonly [number, number];
export type DetailLayer2D = 'back' | 'front';
export interface DetailParticleOptions2D {
  count: number;
  /** Discrete colors from young/hot to old/cool. No white or extra colors are inserted. */
  palette: readonly (string | number)[];
  seed?: number;
  /** Local position or a pure callback evaluated once at each particle's absolute birth time. */
  origin?: readonly [number, number] | ((birth: number, id: number) => readonly [number, number]);
  /** Local velocity in pixels/s, added to speed/angle and snapshotted once at absolute birth time. */
  inheritedVelocity?: readonly [number, number] | ((birth: number, id: number) => readonly [number, number]);
  start?: number;
  /** Finite emission window in seconds; zero creates a simultaneous burst. */
  duration?: number;
  life?: DetailRange2D;
  speed?: DetailRange2D;
  /** Radians in local coordinates, with positive y down. Spread is centered on angle. */
  angle?: number;
  spread?: number;
  gravity?: number;
  drag?: number;
  /** Logical pixel width; below one pixel this reduces coverage rather than dropping frames. */
  size?: DetailRange2D;
  /** Width multiplier reached at the end of life. */
  endSize?: number;
  opacity?: number;
  /** Normalized life fractions; opacity is zero at exact birth and death. */
  attack?: number;
  fadeStart?: number;
  style?: 'point' | 'spark';
  trailSeconds?: number;
  trailSamples?: number;
  /** Head-only light-buffer emission, disabled by default. */
  emission?: number;
  lightRadius?: number;
  layer?: DetailLayer2D;
}
export interface DetailParticle2D {
  readonly id: number; readonly born: number; readonly life: number;
  readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly size: number;
}
export interface DetailParticleSample2D {
  id: number; born: number; age: number; life: number; progress: number;
  x: number; y: number; vx: number; vy: number; size: number; alpha: number; color: number;
}
export interface DetailParticles2D {
  readonly count: number;
  /** Absolute time when all particles have expired, or start for an empty emitter. */
  readonly end: number;
  readonly particles: readonly DetailParticle2D[];
  sample(time: number): DetailParticleSample2D[];
  draw(painter: TrailPainter & Pick<Painter, 'circle'>, time: number, layer?: DetailLayer2D): void;
}

function checkedRange(value: DetailRange2D, name: string, positive = false): readonly [number, number] {
  const pair = typeof value === 'number' ? [value, value] : value;
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)
    || pair[0] < 0 || (positive && pair[0] === 0) || pair[1] < pair[0])
    throw new RangeError(`${name} must be finite, ${positive ? 'positive' : 'non-negative'}, and ordered`);
  return [pair[0], pair[1]];
}
function checkedPoint(value: readonly [number, number], name = 'origin'): Point {
  if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]))
    throw new RangeError(`Detail emitter ${name} must be a finite [x, y]`);
  return [value[0], value[1]];
}

/** Bake stable per-index variation, then sample analytic gravity and drag at any requested time.
 * Creation owns RNG; drawing never advances time, consumes RNG, or calls the emitter again.
 * Existing particles stay identical when only count changes. No collision or looping is implied.
 */
export function createDetailParticles2D(options: DetailParticleOptions2D): DetailParticles2D {
  const { count, palette, seed = 1, origin = [0, 0], inheritedVelocity = [0, 0], start = 0, duration = 0,
    angle = -Math.PI / 2, spread = TAU, gravity = 0, drag = 0, endSize = 0.35,
    opacity = 1, attack = 0.025, fadeStart = 0.35, style = 'spark', trailSeconds = 0.045,
    trailSamples = 7, emission = 0, lightRadius = 2.5, layer = 'front' } = options;
  if (!Number.isInteger(count) || count < 0 || count > 4096)
    throw new RangeError('Detail particle count must be an integer from 0 to 4096');
  if (![seed, start, duration, angle, spread, gravity, drag, endSize, opacity, attack,
    fadeStart, trailSeconds, emission, lightRadius].every(Number.isFinite)
    || duration < 0 || spread < 0 || spread > TAU || drag < 0 || endSize < 0
    || opacity < 0 || opacity > 1 || attack < 0 || attack >= 1 || fadeStart < attack || fadeStart >= 1
    || trailSeconds < 0 || emission < 0 || lightRadius <= 0)
    throw new RangeError('Invalid detail particle timing, motion, size or opacity');
  if (!Number.isInteger(trailSamples) || trailSamples < 2 || trailSamples > 64)
    throw new RangeError('Detail trail samples must be an integer from 2 to 64');
  if ((style !== 'point' && style !== 'spark') || (layer !== 'back' && layer !== 'front'))
    throw new RangeError('Invalid detail particle style or layer');
  if (!Array.isArray(palette) || palette.length === 0 || palette.some(c => typeof c === 'number'
    ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff : !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
    throw new RangeError('Detail palette needs packed 32-bit colors or #rgb/#rrggbb colors');
  const colors = palette.map(hex), life = checkedRange(options.life ?? [0.3, 0.7], 'Life', true);
  const speed = checkedRange(options.speed ?? [20, 60], 'Speed'), size = checkedRange(options.size ?? [0.6, 1.2], 'Size');
  const source = typeof origin === 'function' ? origin : undefined;
  const fixedOrigin = typeof origin === 'function' ? undefined : checkedPoint(origin);
  const velocitySource = typeof inheritedVelocity === 'function' ? inheritedVelocity : undefined;
  const fixedVelocity = typeof inheritedVelocity === 'function' ? undefined : checkedPoint(inheritedVelocity, 'inheritedVelocity');
  const particles: DetailParticle2D[] = [];
  let end = start;
  for (let id = 0; id < count; id++) {
    const r = rng(seed, id, 1729), born = start + r.next() * duration;
    const direction = angle + (r.next() - 0.5) * spread, velocity = r.range(...speed);
    const lifetime = r.range(...life), width = r.range(...size);
    if (![born, born + lifetime, width * endSize].every(Number.isFinite))
      throw new RangeError('Detail particle time or size overflow');
    const [x, y] = source ? checkedPoint(source(born, id)) : fixedOrigin!;
    const [inheritedX, inheritedY] = velocitySource
      ? checkedPoint(velocitySource(born, id), 'inheritedVelocity') : fixedVelocity!;
    const launchX = Math.cos(direction) * velocity, launchY = Math.sin(direction) * velocity;
    // Keep the default's exact values, including signed zero, without consuming any extra RNG.
    const vx = inheritedX === 0 ? launchX : launchX + inheritedX;
    const vy = inheritedY === 0 ? launchY : launchY + inheritedY;
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) throw new RangeError('Detail particle initial velocity overflow');
    particles.push(Object.freeze({ id, born, life: lifetime, x, y,
      vx, vy, size: width }));
    end = Math.max(end, born + lifetime);
  }
  Object.freeze(particles);

  function sample(time: number): DetailParticleSample2D[] {
    if (!Number.isFinite(time)) throw new RangeError('Detail sample time must be finite');
    const result: DetailParticleSample2D[] = [];
    if (time < start || time >= end) return result;
    for (const p of particles) {
      const age = time - p.born;
      if (age < 0 || age >= p.life) continue;
      const progress = age / p.life, [x, y] = fly(p.x, p.y, p.vx, p.vy, age, gravity, drag);
      const [vx, vy] = flyV(p.vx, p.vy, age, gravity, drag);
      if (![x, y, vx, vy].every(Number.isFinite)) throw new RangeError('Detail particle motion overflow');
      result.push({ id: p.id, born: p.born, age, life: p.life, progress, x, y, vx, vy,
        size: p.size * (1 + (endSize - 1) * progress),
        alpha: opacity * particleEnvelope(age, p.life, attack, fadeStart),
        color: colors[Math.min(colors.length - 1, Math.floor(progress * colors.length))] });
    }
    return result;
  }
  return Object.freeze({ count, end, particles, sample,
    draw(p: TrailPainter & Pick<Painter, 'circle'>, time: number, requestedLayer?: DetailLayer2D) {
      if (!Number.isFinite(time)) throw new RangeError('Detail draw time must be finite');
      if (requestedLayer !== undefined && requestedLayer !== 'back' && requestedLayer !== 'front')
        throw new RangeError('Invalid detail draw layer');
      if (requestedLayer !== undefined && requestedLayer !== layer) return;
      for (const q of sample(time)) {
        if (!(q.alpha > 0) || !(q.size > 0)) continue;
        const birth = particles[q.id];
        const points = style === 'spark' ? motionTrail(age => fly(birth.x, birth.y,
          birth.vx, birth.vy, age, gravity, drag), q.age, trailSeconds, trailSamples) : [[q.x, q.y] as Point];
        if (points.length > 1) {
          const tail = colors[Math.min(colors.length - 1, Math.floor(q.progress * colors.length) + 1)];
          drawTrail(p, points, { color: tail, head: q.color, width: q.size, alpha: q.alpha,
            light: emission, lightRadius });
        } else {
          if (q.size <= 1) p.dot(q.x, q.y, q.color, q.alpha * q.size);
          else p.circle(q.x, q.y, q.size / 2, q.color, q.alpha);
          if (emission > 0) p.glow(q.x, q.y, lightRadius, q.color, emission * q.alpha);
        }
      }
    },
  });
}
