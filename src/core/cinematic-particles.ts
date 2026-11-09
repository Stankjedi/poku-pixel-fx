/** Seekable surface emission and coherent ribbons for a strong first generated frame.
 * Stylized analytic advection, not a fluid solver or a Niagara/GPU implementation. */
import { hex } from './color.js';
import { rng, TAU, noise2, clamp } from './math.js';
import { fly, flyV } from './particles.js';
import { drawTrail, motionTrail, particleEnvelope } from './quality.js';
import type { ParticleFlow2D } from './curl-flow.js';
import type { Painter, Point } from './painter.js';

export type CinematicRange2D = number | readonly [number, number];
export type CinematicSource2D = readonly [number, number]
  | ((birth: number, id: number, u: number) => readonly [number, number]);
export interface CinematicEmissionFrame2D {
  position: readonly [number, number];
  /** Nonzero outgoing direction. Magnitude does not change the authored speed. */
  direction: readonly [number, number];
  inheritedVelocity?: readonly [number, number];
}
export interface CinematicParticleOptions2D {
  count: number;
  /** Hot/young to cool/old. No white, desaturation, or extra colors are inserted. */
  palette: readonly (string | number)[];
  seed?: number;
  /** Snapshotted once at birth; u is a low-discrepancy surface coordinate in [0, 1). */
  source?: CinematicSource2D;
  inheritedVelocity?: CinematicSource2D;
  /** Position, outgoing axis and inherited motion sampled together once per birth.
   * Mutually exclusive with source, inheritedVelocity and angle. Spread is about this axis. */
  emissionFrame?: (birth: number, id: number, u: number) => CinematicEmissionFrame2D;
  start?: number;
  /** Stratified finite emission window. Zero creates one simultaneous burst. */
  duration?: number;
  life?: CinematicRange2D;
  speed?: CinematicRange2D;
  angle?: number;
  spread?: number;
  gravity?: number;
  drag?: number;
  size?: CinematicRange2D;
  endSize?: number;
  opacity?: number;
  attack?: number;
  fadeStart?: number;
  style?: 'spark' | 'ribbon' | 'ember';
  /** Opt-in longitudinally biased, coherently broken ribbon width. Default keeps prior smooth ribbons. */
  ribbonProfile?: 'smooth' | 'wispy';
  trailSeconds?: number;
  trailSamples?: number;
  /** One bounded head light per particle, never one glow per path sample. */
  emission?: number;
  lightRadius?: number;
  /** Smooth bounded rotational displacement; starts with zero offset and velocity.
   * amplitude is pixels, frequency is revolutions/second. This is artistic curl, not a fluid field. */
  curl?: { amplitude: number; frequency: number };
  /** Opt-in shared acceleration field. Baked at creation, never called during draw/seek.
   * Mutually exclusive with the independent sinusoidal curl option. */
  flow?: ParticleFlow2D;
  /** Maximum integration step, 1/240..1/30 seconds. Default 1/120. */
  flowStep?: number;
  layer?: 'back' | 'front';
}
export interface CinematicParticle2D {
  readonly id: number; readonly u: number; readonly born: number; readonly life: number;
  readonly x: number; readonly y: number; readonly vx: number; readonly vy: number;
  readonly size: number; readonly phase: number; readonly spin: number;
}
export interface CinematicParticleSample2D {
  id: number; born: number; age: number; life: number; progress: number;
  x: number; y: number; vx: number; vy: number; size: number; alpha: number; color: number;
}
export type CinematicParticlePainter2D = Pick<Painter, 'path' | 'dot' | 'circle' | 'poly' | 'glow'>;
export interface CinematicParticles2D {
  readonly count: number;
  readonly end: number;
  readonly particles: readonly CinematicParticle2D[];
  sample(time: number): CinematicParticleSample2D[];
  draw(painter: CinematicParticlePainter2D, time: number, layer?: 'back' | 'front'): void;
}

function range(value: CinematicRange2D, name: string, positive = false): readonly [number, number] {
  const v = typeof value === 'number' ? [value, value] : value;
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)
    || v[0] < 0 || (positive && v[0] === 0) || v[1] < v[0])
    throw new RangeError(`${name} must be finite, ordered and ${positive ? 'positive' : 'non-negative'}`);
  return [v[0], v[1]];
}
function point(value: readonly [number, number]): Point {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite))
    throw new RangeError('Particle source and velocity must be finite [x, y]');
  return [value[0], value[1]];
}
function sampleSource(source: CinematicSource2D, birth: number, id: number, u: number): Point {
  return point(typeof source === 'function' ? source(birth, id, u) : source);
}

/** Sample a polyline by distance, not by vertex index. Dense control points never attract
 * an accidental particle clump. Call inside source(birth,id,u) for an animated surface. */
export function sampleEmissionPath2D(path: readonly (readonly [number, number])[], u: number): Point {
  if (!Array.isArray(path) || path.length < 1 || path.length > 4096 || !Number.isFinite(u) || u < 0 || u > 1)
    throw new RangeError('Emission path needs 1..4096 points and u in [0, 1]');
  const points = path.map(point), distances = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (!Number.isFinite(total)) throw new RangeError('Emission path length overflow');
    distances.push(total);
  }
  if (total === 0) return [...points[0]];
  const target = u * total;
  for (let i = 1; i < points.length; i++) {
    const length = distances[i] - distances[i - 1];
    if (length > 0 && target <= distances[i]) {
      const t = (target - distances[i - 1]) / length;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
    }
  }
  return [...points[points.length - 1]];
}

/** A connected tapered silhouette, with rounded-over tips and bounded join width.
 * The surface is painted once per band: no overlapping discs or glow accumulation. */
function ribbon(points: readonly Point[], width: number, wispy = false, phase = 0, age = 0): Point[] {
  const left: Point[] = [], right: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const u = i / (points.length - 1);
    const taper = wispy ? Math.sin(Math.PI * u) ** 0.5 * (0.3 + 0.7 * u) : Math.sin(Math.PI * u) ** 0.65;
    const erosion = wispy ? clamp((noise2(u * 3.5 + phase, age * 2.2 + phase * .7, 2811) + .38) / .65) : 1;
    const w = taper * erosion * width * 0.5;
    const nx = length > 1e-12 ? -dy / length : 0, ny = length > 1e-12 ? dx / length : 1;
    left.push([points[i][0] + nx * w, points[i][1] + ny * w]);
    right.push([points[i][0] - nx * w, points[i][1] - ny * w]);
  }
  return [...left, ...right.reverse()];
}

/** Bake births, surface positions and source motion exactly once. Every sample and trail then
 * uses the same analytic trajectory at absolute time, including reverse seeks and skipped frames.
 * Changing count intentionally redistributes births; rendering never calls an author's source. */
export function createCinematicParticles2D(options: CinematicParticleOptions2D): CinematicParticles2D {
  const { count, palette, seed = 1, source = [0, 0], inheritedVelocity = [0, 0], start = 0, duration = 0,
    angle = -Math.PI / 2, spread = TAU, gravity = 0, drag = 0.8, endSize = 0.3,
    opacity = 1, attack = 0.035, fadeStart = 0.3, style = 'ribbon', trailSeconds = 0.12,
    trailSamples = 10, emission = 0.12, lightRadius = 3, layer = 'front' } = options;
  const amplitude = options.curl?.amplitude ?? 0, frequency = options.curl?.frequency ?? 1;
  const ribbonProfile = options.ribbonProfile, emissionFrame = options.emissionFrame, flow = options.flow, flowStep = options.flowStep ?? 1 / 120;
  if ((flow !== undefined && (typeof flow !== 'function' || options.curl !== undefined))
    || (options.flowStep !== undefined && flow === undefined) || !Number.isFinite(flowStep) || flowStep < 1 / 240 || flowStep > 1 / 30)
    throw new RangeError('Flow requires a callback and bounded step, without independent curl');
  if (emissionFrame !== undefined && (typeof emissionFrame !== 'function' || options.source !== undefined
    || options.inheritedVelocity !== undefined || options.angle !== undefined))
    throw new RangeError('Emission frame must be a callback and cannot also set source, inheritedVelocity or angle');
  if (!Number.isInteger(count) || count < 0 || count > 8192)
    throw new RangeError('Cinematic particle count must be an integer from 0 to 8192');
  if (![seed, start, duration, angle, spread, gravity, drag, endSize, opacity, attack, fadeStart,
    trailSeconds, emission, lightRadius, amplitude, frequency].every(Number.isFinite)
    || duration < 0 || !Number.isFinite(start + duration) || spread < 0 || spread > TAU || drag < 0
    || endSize < 0 || opacity < 0 || opacity > 1 || attack < 0 || attack >= 1
    || fadeStart < attack || fadeStart >= 1 || trailSeconds < 0 || emission < 0 || lightRadius <= 0
    || amplitude < 0 || frequency < 0 || frequency > 120)
    throw new RangeError('Invalid cinematic particle timing, motion, size, light or opacity');
  if (!Number.isInteger(trailSamples) || trailSamples < 2 || trailSamples > 64)
    throw new RangeError('Cinematic trail samples must be an integer from 2 to 64');
  if (options.ribbonProfile !== undefined && (!['smooth','wispy'].includes(options.ribbonProfile) || style !== 'ribbon'))
    throw new RangeError('Ribbon profile must be smooth or wispy and requires ribbon style');
  if (!['spark', 'ribbon', 'ember'].includes(style) || !['back', 'front'].includes(layer))
    throw new RangeError('Invalid cinematic particle style or layer');
  if (!Array.isArray(palette) || !palette.length || palette.length > 256 || palette.some(c => typeof c === 'number'
    ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff : !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
    throw new RangeError('Cinematic palette needs 1..256 packed colors or #rgb/#rrggbb colors');
  const colors = palette.map(hex), life = range(options.life ?? [0.4, 0.9], 'Life', true);
  const speed = range(options.speed ?? [18, 65], 'Speed'), size = range(options.size ?? [1.5, 3.5], 'Size');
  // Validate constants even for an empty emitter. Callbacks are not called without a birth.
  if (typeof source !== 'function') point(source);
  if (typeof inheritedVelocity !== 'function') point(inheritedVelocity);
  const surfaceOffset = rng(seed, 7457).next(), particles: CinematicParticle2D[] = [];
  let end = start;
  for (let id = 0; id < count; id++) {
    const random = rng(seed, id, 9109);
    const born = start + (id + 0.15 + random.next() * 0.7) / count * duration;
    // Golden-ratio sequence decorrelates surface position from emission time.
    const u = (surfaceOffset + id * 0.6180339887498949) % 1;
    let position: Point, inherited: Point, axis = angle;
    if (emissionFrame) {
      const frame = emissionFrame(born, id, u);
      if (!frame || typeof frame !== 'object') throw new RangeError('Invalid cinematic emission frame');
      position = point(frame.position);
      const direction = point(frame.direction), magnitude = Math.hypot(...direction);
      if (!(magnitude > 0) || !Number.isFinite(magnitude)) throw new RangeError('Emission direction must be finite and nonzero');
      axis = Math.atan2(direction[1], direction[0]);
      inherited = point(frame.inheritedVelocity === undefined ? [0, 0] : frame.inheritedVelocity);
    } else {
      position = sampleSource(source, born, id, u); inherited = sampleSource(inheritedVelocity, born, id, u);
    }
    const [x, y] = position;
    const a = axis + (random.next() - 0.5) * spread, s = random.range(...speed);
    const vx = Math.cos(a) * s + inherited[0], vy = Math.sin(a) * s + inherited[1];
    const lifetime = random.range(...life), width = random.range(...size);
    if (![born, born + lifetime, vx, vy, width * endSize].every(Number.isFinite))
      throw new RangeError('Cinematic particle time, velocity or size overflow');
    particles.push(Object.freeze({ id, u, born, life: lifetime, x, y, vx, vy, size: width,
      phase: random.next() * TAU, spin: random.next() < 0.5 ? -1 : 1 }));
    end = Math.max(end, born + lifetime);
  }
  Object.freeze(particles);

  // Integrate only once, in birth-relative fixed steps. Path storage is bounded before callbacks
  // run, and Hermite interpolation keeps sample velocity consistent with the rendered trajectory.
  const paths: { data: Float64Array; steps: number; dt: number }[] = [];
  if (flow) {
    // Explicit RK4 must resolve damping too: large legal drag cannot be allowed to
    // amplify a zero-force trajectory. The preparation budget includes these substeps.
    const stableStep = drag > 0 ? Math.min(flowStep, 0.25 / drag) : flowStep;
    const segments = particles.map(p => Math.ceil(p.life / stableStep));
    if (segments.some(n => !Number.isSafeInteger(n) || n < 1) || segments.reduce((a, b) => a + b, 0) > 500000)
      throw new RangeError('Particle flow exceeds the 500000-step preparation budget');
    for (const p of particles) {
      const steps = segments[p.id], dt = p.life / steps, data = new Float64Array((steps + 1) * 4);
      // Scalars avoid allocating copied vectors/derivatives at every RK4 stage. Preserve
      // the original operation order, callback order, step count and final Float64 values.
      let x = p.x, y = p.y, vx = p.vx, vy = p.vy, ax = 0, ay = 0;
      data[0] = x; data[1] = y; data[2] = vx; data[3] = vy;
      const derivative = (x: number, y: number, vx: number, vy: number, at: number) => {
        const force = flow(x, y, p.born + at);
        if (!Array.isArray(force) || force.length !== 2 || !force.every(Number.isFinite))
          throw new RangeError('Particle source and velocity must be finite [x, y]');
        ax = force[0] - drag * vx; ay = gravity + force[1] - drag * vy;
        if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(ax) || !Number.isFinite(ay))
          throw new RangeError('Particle flow acceleration overflow');
      };
      for (let n = 0; n < steps; n++) {
        const t = n * dt, k1x = vx, k1y = vy;
        derivative(x, y, vx, vy, t);
        const k1vx = ax, k1vy = ay, k2x = vx + k1vx * dt / 2, k2y = vy + k1vy * dt / 2;
        derivative(x + k1x * dt / 2, y + k1y * dt / 2, k2x, k2y, t + dt / 2);
        const k2vx = ax, k2vy = ay, k3x = vx + k2vx * dt / 2, k3y = vy + k2vy * dt / 2;
        derivative(x + k2x * dt / 2, y + k2y * dt / 2, k3x, k3y, t + dt / 2);
        const k3vx = ax, k3vy = ay, k4x = vx + k3vx * dt, k4y = vy + k3vy * dt;
        derivative(x + k3x * dt, y + k3y * dt, k4x, k4y, t + dt);
        x = x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
        y = y + dt / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
        vx = vx + dt / 6 * (k1vx + 2 * k2vx + 2 * k3vx + ax);
        vy = vy + dt / 6 * (k1vy + 2 * k2vy + 2 * k3vy + ay);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx) || !Number.isFinite(vy))
          throw new RangeError('Particle flow trajectory overflow');
        const offset = (n + 1) * 4;
        data[offset] = x; data[offset + 1] = y; data[offset + 2] = vx; data[offset + 3] = vy;
      }
      paths.push({ data, steps, dt });
    }
  }
  function trajectory(p: CinematicParticle2D, age: number): { position: Point; velocity: Point } {
    if (flow) {
      const { data, steps, dt } = paths[p.id], at = Math.max(0, Math.min(steps, age / dt)), n = Math.min(steps - 1, Math.floor(at)), u = at - n;
      const a = n * 4, b = a + 4, u2 = u * u, u3 = u2 * u, position: Point = [0, 0], velocity: Point = [0, 0];
      for (let k = 0; k < 2; k++) {
        position[k] = (2*u3-3*u2+1)*data[a+k] + (u3-2*u2+u)*dt*data[a+k+2]
          + (-2*u3+3*u2)*data[b+k] + (u3-u2)*dt*data[b+k+2];
        velocity[k] = (6*u2-6*u)/dt*data[a+k] + (3*u2-4*u+1)*data[a+k+2]
          + (-6*u2+6*u)/dt*data[b+k] + (3*u2-2*u)*data[b+k+2];
      }
      return { position, velocity };
    }
    const position = fly(p.x, p.y, p.vx, p.vy, age, gravity, drag);
    const velocity = flyV(p.vx, p.vy, age, gravity, drag);
    if (amplitude > 0 && frequency > 0) {
      const w = frequency * TAU * p.spin, phase = p.phase + age * w;
      const envelope = 1 - Math.exp(-age * 4), derivative = 4 * Math.exp(-age * 4);
      const sx = Math.sin(phase) - Math.sin(p.phase), sy = Math.cos(phase) - Math.cos(p.phase);
      position[0] += amplitude * envelope * sx; position[1] += amplitude * envelope * sy;
      velocity[0] += amplitude * (derivative * sx + envelope * w * Math.cos(phase));
      velocity[1] += amplitude * (derivative * sy - envelope * w * Math.sin(phase));
    }
    if (![...position, ...velocity].every(Number.isFinite)) throw new RangeError('Cinematic particle motion overflow');
    return { position, velocity };
  }
  function sample(time: number): CinematicParticleSample2D[] {
    if (!Number.isFinite(time)) throw new RangeError('Cinematic sample time must be finite');
    if (time < start || time >= end) return [];
    const result: CinematicParticleSample2D[] = [];
    for (const p of particles) {
      if (p.born > time) break; // Stratified births are ordered.
      const age = time - p.born;
      if (age >= p.life) continue;
      const progress = age / p.life, { position, velocity } = trajectory(p, age);
      result.push({ id: p.id, born: p.born, age, life: p.life, progress,
        x: position[0], y: position[1], vx: velocity[0], vy: velocity[1],
        size: p.size * (1 + (endSize - 1) * progress), alpha: opacity * particleEnvelope(age, p.life, attack, fadeStart),
        color: colors[Math.min(colors.length - 1, Math.floor(progress * colors.length))] });
    }
    return result;
  }
  return Object.freeze({ count, end, particles, sample,
    draw(p: CinematicParticlePainter2D, time: number, requestedLayer?: 'back' | 'front') {
      if (!Number.isFinite(time)) throw new RangeError('Cinematic draw time must be finite');
      if (requestedLayer !== undefined && !['back', 'front'].includes(requestedLayer))
        throw new RangeError('Invalid cinematic draw layer');
      if (requestedLayer !== undefined && requestedLayer !== layer) return;
      for (const q of sample(time)) {
        if (!(q.alpha > 0) || !(q.size > 0)) continue;
        const birth = particles[q.id], points = style === 'ember' ? [[q.x, q.y] as Point]
          : motionTrail(age => trajectory(birth, age).position, q.age, trailSeconds, trailSamples);
        const tail = colors[Math.min(colors.length - 1, Math.floor(q.progress * colors.length) + 1)];
        if (style === 'ribbon' && points.length >= 3 && q.size >= 1.25
          && Math.hypot(points[points.length - 1][0] - points[0][0], points[points.length - 1][1] - points[0][1]) > 0.1) {
          p.poly(ribbon(points, q.size, ribbonProfile === 'wispy', birth.phase, q.age), tail, q.alpha * 0.8);
          p.poly(ribbon(points, q.size * 0.42, ribbonProfile === 'wispy', birth.phase, q.age), q.color, q.alpha);
        } else if (points.length > 1) {
          drawTrail(p, points, { color: tail, head: q.color, width: q.size, alpha: q.alpha, light: 0 });
        } else if (q.size <= 1) p.dot(q.x, q.y, q.color, q.alpha * q.size);
        else p.circle(q.x, q.y, q.size * 0.5, q.color, q.alpha);
        if (emission > 0) p.glow(q.x, q.y, lightRadius, q.color, emission * q.alpha);
      }
    },
  });
}
