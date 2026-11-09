/** Opt-in incandescent grains with short shutter traces and size-dependent drag.
 * Seeded analytic 2D motion, not fluid simulation, motion blur or a GPU emitter. */
import { hex } from './color.js';
import { rand } from './math.js';
import { fly, flyV } from './particles.js';
import type { CinematicEmissionFrame2D } from './cinematic-particles.js';
import type { Painter, Point } from './painter.js';

type Range = readonly [number, number];
export interface SparkFieldOptions2D {
  /** Cold to hot. Snapshot, 1..32 opaque colors; no white inserted. */
  palette: readonly (string | number)[];
  /** Called exactly once per birth; snapshot its position, direction and inherited velocity. */
  emissionFrame: (birth: number, id: number, u: number) => CinematicEmissionFrame2D;
  count?: number; seed?: number; start?: number; duration?: number;
  life?: Range; speed?: Range; width?: Range; drag?: Range;
  /** Full angular spread in radians. */
  spread?: number;
  /** Local +y acceleration, px/s². */
  gravity?: number;
  /** Seconds of trajectory shown, clipped to birth and maxLength. */
  shutter?: number;
  /** Upper bound on the displayed trail's polyline length, local pixels. */
  maxLength?: number;
  /** 0..32 stable IDs, selected at birth; never reallocated on a death. */
  lightBudget?: number;
  light?: boolean;
  /** 0..2 spark glow multiplier, default 1. Does not affect matter or fixed light IDs. */
  lightStrength?: number;
  /** Explicit opt-in finish: independent finite glints over unchanged short-exposure matter. */
  finish?: 'scintillation';
}
export interface SparkFieldBirth2D {
  readonly id: number; readonly born: number; readonly life: number;
  readonly x: number; readonly y: number; readonly vx: number; readonly vy: number;
  readonly width: number; readonly drag: number; readonly gravity: number;
  readonly layer: 'back' | 'front'; readonly lit: boolean;
}
export interface SparkFieldSample2D {
  id: number; born: number; life: number; age: number; progress: number;
  x: number; y: number; vx: number; vy: number; width: number; alpha: number;
  color: number; tail: number; layer: 'back' | 'front'; lit: boolean;
  /** Independent three-point current exposure; at most maxLength long. */
  trace: Point[];
  /** Current independent pulse strength, from 0 to 1; absent without the finish. */
  glint?: number;
  /** Maximum local star radius in pixels, before pulse scaling. */
  glintRadius?: number;
  /** Whether this seeded spark can draw a short star-shaped glint. */
  glintStar?: boolean;
  /** Stable light-ID eligibility, not whether light is currently emitted. */
  glintLit?: boolean;
}
const bounded = (x: number, lo: number, hi: number) => Number.isFinite(x) && x >= lo && x <= hi;
const point = (p: readonly number[], limit: number) => Array.isArray(p) && p.length === 2
  && bounded(p[0], -limit, limit) && bounded(p[1], -limit, limit);
function range(x: Range, lo: number, hi: number): [number, number] {
  if (!Array.isArray(x) || x.length !== 2 || !bounded(x[0], lo, hi) || !bounded(x[1], x[0], hi))
    throw new RangeError('Invalid spark field range');
  return [x[0], x[1]];
}
const mix = (a: Range, u: number) => a[0] + (a[1] - a[0]) * u;
type SparkPainter = Pick<Painter, 'path' | 'dot' | 'circle' | 'glow'>;

/** At most 2048 births. One bounded current-time cache. Samples are fresh nested copies.
 * Matter colors and random choices are independent of light budget and requested layer.
 * Outgoing speed <=600, inherited components <=10000, life <=4 and drag <=20.
 * World travel is finite; consumers remain responsible for their effect's canvas bounds. */
export function createSparkField2D(options: SparkFieldOptions2D) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(k => !['palette','emissionFrame','count','seed','start','duration','life','speed','width','drag','spread','gravity','shutter','maxLength','lightBudget','light','lightStrength','finish'].includes(k)))
    throw new RangeError('Invalid spark field options');
  if (options.finish !== undefined && options.finish !== 'scintillation') throw new RangeError('Invalid spark finish');
  const scintillation = options.finish === 'scintillation';
  const { count = 240, seed = 1, start = 0, duration = 1, spread = 1.4, gravity = 24,
    shutter = .04, maxLength = 10, lightBudget = 16, light = true, lightStrength = 1, emissionFrame } = options;
  if (!Number.isInteger(count) || !bounded(count, 0, 2048) || !Number.isInteger(seed) || !bounded(seed, 0, 0xffffffff)
    || !bounded(start, 0, 3596) || !bounded(duration, 0, 60) || start + duration > 3596
    || !bounded(spread, 0, Math.PI * 2) || !bounded(gravity, -500, 500)
    || !bounded(shutter, 0, .15) || !bounded(maxLength, 0, 24)
    || !Number.isInteger(lightBudget) || !bounded(lightBudget, 0, 32) || typeof light !== 'boolean' || !bounded(lightStrength, 0, 2)
    || typeof emissionFrame !== 'function') throw new RangeError('Invalid spark field timing, motion, seed or budget');
  if (!Array.isArray(options.palette) || options.palette.length < 1 || options.palette.length > 32)
    throw new RangeError('Invalid spark field palette');
  const colors: number[] = [];
  for (const c of options.palette) {
    if (typeof c === 'number' ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff
      : typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)) throw new RangeError('Invalid spark field color');
    colors.push(hex(c) | 0xff000000);
  }
  const life = range(options.life ?? [.35, .95], .01, 4), speed = range(options.speed ?? [55, 155], 0, 600);
  const width = range(options.width ?? [.55, 1.8], .1, 5), drag = range(options.drag ?? [.7, 2.8], 0, 20);
  const nLights = Math.min(count, lightBudget), lightIds = new Set(Array.from({ length: nLights }, (_, i) =>
    Math.floor((i + .5) * count / nLights)));
  const births: SparkFieldBirth2D[] = [];
  let end = start;
  for (let id = 0; id < count; id++) {
    const r = (key: number) => rand(seed, id, key + 9731), u = (r(1) * .18 + id * .618033988749895) % 1;
    const born = start + duration * (id + .1 + .8 * r(2)) / count;
    const source = emissionFrame(born, id, u);
    if (!source || typeof source !== 'object' || Array.isArray(source) || !point(source.position, 100000)
      || !point(source.direction, 10000) || (source.inheritedVelocity !== undefined && !point(source.inheritedVelocity, 10000)))
      throw new RangeError('Invalid spark field emission frame');
    if (!(Math.hypot(...source.direction) > 0)) throw new RangeError('Spark field direction must be nonzero');
    const sizeU = r(3) ** 2, w = mix(width, sizeU), a = Math.atan2(source.direction[1], source.direction[0]) + (r(4) - .5) * spread;
    const v = mix(speed, r(5)), inherited = source.inheritedVelocity ?? [0, 0];
    const p = Object.freeze({ id, born, life: mix(life, r(6)), x: source.position[0], y: source.position[1],
      vx: Math.cos(a) * v + inherited[0], vy: Math.sin(a) * v + inherited[1], width: w,
      drag: mix(drag, (1 - sizeU) * (.65 + .35 * r(7))), gravity: gravity * (.6 + .4 * sizeU),
      layer: r(8) < .4 ? 'back' as const : 'front' as const, lit: lightIds.has(id) });
    births.push(p); end = Math.max(end, born + p.life);
  }
  Object.freeze(births);
  // Keep visual eligibility independent of light settings; glows reuse existing budgeted IDs.
  const glintEligible = new Set(scintillation ? Array.from(
    { length: Math.min(count, 24) },
    (_, i) => Math.floor((i + .5) * count / Math.min(count, 24)),
  ) : []);
  const budgetedIds = [...lightIds], nGlintLights = Math.min(nLights, 24);
  const glintLights = new Set(scintillation ? Array.from(
    { length: nGlintLights },
    (_, i) => budgetedIds[Math.floor((i + .5) * nLights / nGlintLights)],
  ) : []);
  const glintStyle = scintillation ? births.map(b => {
    // Separate random channels leave the established births and trajectories untouched.
    const r = (n: number) => rand(seed, b.id, n + 41783);
    return {
      eligible: r(1) > .48 || glintEligible.has(b.id),
      star: r(2) > .70,
      center: b.life * (.22 + .42 * r(3)),
      duration: Math.min(b.life * .40, .06 + .05 * r(4)),
      second: r(5) > .55,
      center2: b.life * (.72 + .12 * r(6)),
      duration2: Math.min(b.life * .24, .055 + .025 * r(7)),
      radius: 1.8 + 1.5 * r(8),
    };
  }) : undefined;
  const pulse = (age: number, center: number, duration: number) => {
    const q = (age - center) / duration + .5;
    return q > 0 && q < 1 ? Math.sin(Math.PI * q) ** 2 : 0;
  };
  let cacheTime = NaN, cache: SparkFieldSample2D[] = [];
  function prepare(time: number) {
    if (!bounded(time, -3600, 3600)) throw new RangeError('Invalid spark field time');
    if (time === cacheTime) return;
    cacheTime = time; cache = [];
    if (time < start || time >= end) return;
    for (const b of births) {
      if (b.born > time) break;
      if (time >= b.born + b.life) continue;
      const age = time - b.born, q = age / b.life, alpha = Math.min(1, age / .025) * Math.min(1, (1 - q) / .32);
      if (!(alpha > 0)) continue;
      const [x, y] = fly(b.x, b.y, b.vx, b.vy, age, b.gravity, b.drag);
      const [vx, vy] = flyV(b.vx, b.vy, age, b.gravity, b.drag);
      const dt = Math.min(age, shutter), trace: Point[] = [fly(b.x, b.y, b.vx, b.vy, age - dt, b.gravity, b.drag),
        fly(b.x, b.y, b.vx, b.vy, age - dt * .5, b.gravity, b.drag), [x, y]];
      const length = Math.hypot(trace[1][0] - trace[0][0], trace[1][1] - trace[0][1])
        + Math.hypot(x - trace[1][0], y - trace[1][1]);
      // Crop the rear polyline, never scale a path away from its real trajectory.
      if (length > maxLength) {
        const nearLength = Math.hypot(x - trace[1][0], y - trace[1][1]);
        if (nearLength >= maxLength) {
          const k = nearLength ? maxLength / nearLength : 0;
          trace[0] = [x + (trace[1][0] - x) * k, y + (trace[1][1] - y) * k];
          trace[1] = [(x + trace[0][0]) * .5, (y + trace[0][1]) * .5];
        } else {
          const k = (maxLength - nearLength) / (length - nearLength);
          trace[0] = [trace[1][0] + (trace[0][0] - trace[1][0]) * k, trace[1][1] + (trace[0][1] - trace[1][1]) * k];
        }
      }
      const heat = (1 - .55 * q ** 3) * (b.layer === 'back' ? .78 : 1), idx = Math.min(colors.length - 1, Math.floor(heat * colors.length));
      const style = glintStyle?.[b.id];
      const peak = style?.eligible ? Math.max(
        pulse(age, style.center, style.duration),
        style.second ? pulse(age, style.center2, style.duration2) * .8 : 0,
      ) : 0;
      cache.push({ id: b.id, born: b.born, life: b.life, age, progress: q, x, y, vx, vy,
        width: b.width * (b.layer === 'back' ? .7 : 1) * (1 - .18 * q), alpha: alpha * (b.layer === 'back' ? .65 : 1),
        color: colors[idx], tail: colors[Math.max(0, idx - 2)], layer: b.layer, lit: b.lit, trace,
        ...(style ? { glint: peak, glintRadius: style.radius, glintStar: style.star, glintLit: glintLights.has(b.id) } : {}) });
    }
  }
  return Object.freeze({ count, end, births,
    sample(time: number): SparkFieldSample2D[] { prepare(time); return cache.map(q => ({ ...q, trace: q.trace.map(p => [...p] as Point) })); },
    draw(p: SparkPainter, time: number, layer: 'back' | 'front' = 'front') {
      if (layer !== 'back' && layer !== 'front') throw new RangeError('Invalid spark field layer');
      prepare(time);
      for (const q of cache) if (q.layer === layer) {
        p.path(q.trace, (u: number) => u < .66 ? q.tail : q.color, (u: number) => q.alpha * (.28 + .72 * u), q.width, { preferHead: true });
        // A crisp hot head survives a subpixel-width trail. Large grains have one compact core.
        if (q.width > 1.05) p.circle(q.x, q.y, q.width * .5, q.color, q.alpha);
        else p.dot(q.x, q.y, q.color, q.alpha * Math.min(1, q.width));
        if (light && lightStrength > 0 && q.lit) p.glow(q.x, q.y, 3 + q.width * 2, q.color, .30 * q.alpha * (1 - q.progress) * lightStrength);
        if (q.glint && q.glint > .02) {
          const peak = q.glint, head = colors[colors.length - 1], a = q.alpha * peak;
          p.circle(q.x, q.y, Math.min(1.35, .55 + q.width * .35) * Math.sqrt(peak), head, a);
          if (q.glintStar && peak > .18) {
            const r = q.glintRadius! * Math.sqrt(peak);
            const ramp = (u: number) => u < .25 || u > .75 ? colors[Math.max(0, colors.length - 2)] : head;
            const fade = (u: number) => a * .88 * (1 - Math.abs(2 * u - 1));
            p.path([[q.x - r, q.y], [q.x + r, q.y]], ramp, fade, 1);
            p.path([[q.x, q.y - r * .75], [q.x, q.y + r * .75]], ramp, fade, 1);
          }
          // A second call on eligible IDs, not an increase in the light-ID budget.
          if (light && lightStrength > 0 && q.glintLit)
            p.glow(q.x, q.y, 4 + q.width * 1.2, head, .22 * a * lightStrength);
        }
      }
    },
  });
}
