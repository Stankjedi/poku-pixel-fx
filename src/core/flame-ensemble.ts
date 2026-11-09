/** Opt-in finite layered fire: authored emission, analytic motion, crisp matter and sparse light.
 * Not a fluid simulation or a Niagara/GPU implementation. */
import { hex } from './color.js';
import { rand } from './math.js';
import { createFlameMatter2D } from './flame-matter.js';
import type { CinematicEmissionFrame2D } from './cinematic-particles.js';
import type { Painter } from './painter.js';

export interface FlameEnsembleOptions2D {
  /** Cold to hot; snapshotted, 1..32 colors. No inserted whites. */
  palette: readonly (string | number)[];
  /** Effect-local coordinates and velocity; Painter placement transforms them later.
   * Must be pure/deterministic in its arguments for layer-isolation reproducibility. */
  emissionFrame: (birth: number, id: number, u: number) => CinematicEmissionFrame2D;
  seed?: number;
  /** Seconds; finite nonnegative window ending at or before 3598. */
  start?: number;
  /** Zero creates a simultaneous burst. Intensity still uses each birth's normalized stratum. */
  duration?: number;
  /** Independent geometry multiplier .25..3. Material half-extents remain <=52.8. */
  sizeScale?: number;
  /** Outgoing speed multiplier .25..6. Inherited velocity is not scaled. */
  speedScale?: number;
  /** Explicit source-motion coupling 0..1, default1. Does not affect outgoing speed. */
  inheritedVelocityScale?: number;
  /** .25..4; ceil each base budget, at most 416 births. */
  density?: number;
  /** Opt-in authored sideways flutter, not a physical force solver. Amplitude 0..32
   * effect-local pixels, frequency 0..6 Hz. Displacement is seeded-side A/2*(1-cos(2πft))
   * perpendicular to outgoing direction. Zero birth displacement/velocity; displacement
   * <=A and speed <=A*π*f. Independent of sizeScale/speedScale. */
  flutter?: { amplitude: number; frequency: number };
  layers?: { coarse?: boolean; fine?: boolean; sparks?: boolean; light?: boolean };
  /** 2..16 [normalized emission time, intensity] keys; endpoints 0 and 1,
   * strictly increasing times, intensity 0..1. Birth strength controls size and opacity, not instantaneous whole-effect energy.
   * Evaluated at each birth's seeded normalized emission stratum, even when duration is zero
   * or too small to distinguish birth times. Burst strengths can therefore vary; shrinking
   * duration to zero preserves those strengths rather than sampling only the first key.
   * Default: build, display, gather dip, final surge, shutoff. */
  intensity?: readonly (readonly [number, number])[];
}
export interface FlameEnsembleSample2D {
  id: number; kind: 'coarse' | 'fine' | 'sparks'; born: number; life: number;
  x: number; y: number; vx: number; vy: number; progress: number;
  width: number; height: number; angle: number; alpha: number; color: number;
}
type Birth = Omit<FlameEnsembleSample2D, 'progress' | 'alpha' | 'color'> & { strength: number; light: boolean; side: number };
type FirePainter = Pick<Painter, 'shade' | 'path' | 'glow'>;
const valid = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
const pair = (a: readonly number[], bound: number) => Array.isArray(a) && a.length === 2
  && valid(a[0], -bound, bound) && valid(a[1], -bound, bound);
const defaults = [[0, .12], [.27, .8], [.42, 1], [.64, .9], [.76, .4], [.91, 1], [1, .05]] as const;

/** Base budget 32 broad masses + 48 fast tongues + 24 sparks (104 births).
 * Density scales budgets up to 416 births. Outgoing speed <=1020px/s, inherited components
 * <=10000px/s; maximum travel <=19900px plus <=32px flutter from source within ±100000.
 * Source is called exactly once per enabled matter/spark birth during construction;
 * light alone can use coarse births without drawing their material. No callback on seek.
 * Disabled layers never change other layers' random choices. Life <=1.35 seconds;
 * default end <=3.9. All arrays/options/callback results are copied. The only cache holds
 * one time's <=416 samples, never exposed; sample() returns fresh scalar records.
 * Light uses at most six stable coarse IDs selected at birth, never reallocating on death.
 */
export function createFlameEnsemble2D(options: FlameEnsembleOptions2D) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid fire ensemble options');
  const { seed = 1, start = .3, duration = 2.25, sizeScale = 1, speedScale = 1, inheritedVelocityScale = 1, density = 1, emissionFrame } = options;
  if (!Number.isInteger(seed) || !valid(seed, 0, 0xffffffff) || !valid(start, 0, 3598)
    || !valid(duration, 0, 60) || start + duration > 3598 || !valid(sizeScale, .25, 3) || !valid(speedScale, .25, 6) || !valid(inheritedVelocityScale, 0, 1) || !valid(density, .25, 4)
    || 'scale' in options || typeof emissionFrame !== 'function') throw new RangeError('Invalid fire ensemble timing, seed, scale or source');
  const flutter = options.flutter;
  if (flutter !== undefined && (!flutter || typeof flutter !== 'object' || Array.isArray(flutter)
    || !valid(flutter.amplitude, 0, 32) || !valid(flutter.frequency, 0, 6))) throw new RangeError('Invalid fire flutter');
  const flutterAmplitude = flutter?.amplitude ?? 0, flutterOmega = (flutter?.frequency ?? 0) * Math.PI * 2;
  // Matter validates dense palettes including packed RGBA; reuse one immutable material.
  const matter = createFlameMatter2D({ seed, palette: options.palette });
  const colors = options.palette.map(c => hex(c) | 0xff000000);
  const inputLayers = options.layers === undefined ? {} : options.layers;
  if (!inputLayers || typeof inputLayers !== 'object' || Array.isArray(inputLayers)
    || Object.entries(inputLayers).some(([k, v]) => !['coarse', 'fine', 'sparks', 'light'].includes(k) || typeof v !== 'boolean'))
    throw new RangeError('Invalid fire ensemble layers');
  const layers = { coarse: true, fine: true, sparks: true, light: true, ...inputLayers };
  const inputKeys = options.intensity === undefined ? defaults : options.intensity;
  if (!Array.isArray(inputKeys) || inputKeys.length < 2 || inputKeys.length > 16) throw new RangeError('Invalid fire intensity');
  const keys: [number, number][] = [];
  for (let i = 0; i < inputKeys.length; i++) {
    const k = inputKeys[i];
    if (!pair(k, 1) || k[0] < 0 || k[1] < 0 || (i > 0 && k[0] <= keys[i - 1][0])) throw new RangeError('Invalid fire intensity key');
    keys.push([k[0], k[1]]);
  }
  if (keys[0][0] !== 0 || keys[keys.length - 1][0] !== 1) throw new RangeError('Fire intensity needs 0 and 1 endpoints');
  const intensity = (u: number) => {
    for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i], f = (u - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * f;
    }
    return keys[keys.length - 1][1];
  };
  const births: Birth[] = [];
  let end = start;
  const kinds = ['coarse', 'fine', 'sparks'] as const;
  const budgets = [32, 48, 24].map(n => Math.ceil(n * density));
  for (let role = 0; role < 3; role++) {
    const kind = kinds[role];
    if (!layers[kind] && !(kind === 'coarse' && layers.light)) continue;
    const lightIds = new Set(Array.from({ length: Math.min(6, budgets[role]) }, (_, k) =>
      Math.floor(k * (budgets[role] - 1) / Math.max(1, Math.min(6, budgets[role]) - 1))));
    for (let i = 0; i < budgets[role]; i++) {
      const id = role * 1024 + i, r = (key: number) => rand(seed, id, key);
      const birthU = (i + r(1)) / budgets[role], born = start + duration * birthU;
      const u = (i * .618033988749895 + r(2) * .19) % 1;
      const source = emissionFrame(born, id, u);
      if (!source || typeof source !== 'object' || Array.isArray(source)
        || !pair(source.position, 100000) || !pair(source.direction, 10000)
        || (source.inheritedVelocity !== undefined && !pair(source.inheritedVelocity, 10000))) throw new RangeError('Invalid fire emission frame');
      const [x, y] = source.position, [dx, dy] = source.direction, norm = Math.hypot(dx, dy);
      if (!(norm > 0)) throw new RangeError('Fire source direction must be nonzero');
      const angle = Math.atan2(dx, -dy) + (r(3) - .5) * (role === 2 ? .8 : .5);
      const speed = ([65, 100, 100][role] + r(4) * [40, 60, 70][role]) * speedScale;
      const velocity = source.inheritedVelocity ?? [0, 0];
      const vx = Math.sin(angle) * speed + velocity[0] * inheritedVelocityScale, vy = -Math.cos(angle) * speed + velocity[1] * inheritedVelocityScale;
      const strength = intensity(birthU), size = (.55 + .45 * strength) * sizeScale;
      const width = ([5, 2.2, .5][role] + r(5) * [6, 3.8, .7][role]) * size;
      const height = width * ([1.05, 1.4, 1][role] + r(6) * [.55, .8, .3][role]);
      const life = [.7, .25, .35][role] + r(7) * [.65, .35, .6][role];
      births.push({ id, kind, born, life, x, y, vx, vy, width, height, angle, strength, light: role === 0 && lightIds.has(i), side: r(8) < .5 ? -1 : 1 });
      end = Math.max(end, born + life);
    }
  }
  const litIds = new Set(births.filter(b => b.light).map(b => b.id));
  let cachedTime = NaN, cached: FlameEnsembleSample2D[] = [];
  function prepare(time: number): void {
    if (!valid(time, -3600, 3600)) throw new RangeError('Invalid fire ensemble time');
    if (time === cachedTime) return;
    if (time >= end) { cached = []; cachedTime = time; return; }
    const result: FlameEnsembleSample2D[] = [];
    for (const b of births) {
      const age = time - b.born;
      // Compare the absolute death time too: subtraction may round age just below life.
      if (age < 0 || time >= b.born + b.life || age >= b.life || b.strength === 0) continue;
      const q = age / b.life;
      // Outgoing and inherited motion decelerate together; no added force/trajectory.
      const drag = b.kind === 'sparks' ? .65 : 1.7, travel = -Math.expm1(-drag * age) / drag;
      const decay = Math.exp(-drag * age);
      const alpha = Math.min(1, q / .12) * Math.min(1, (1 - q) / .4) * b.strength;
      if (alpha === 0) continue;
      const shrink = 1 - .35 * q;
      const flutterOffset = b.side * flutterAmplitude * .5 * (1 - Math.cos(flutterOmega * age));
      const flutterSpeed = b.side * flutterAmplitude * .5 * flutterOmega * Math.sin(flutterOmega * age);
      const sideX = Math.cos(b.angle), sideY = Math.sin(b.angle);
      result.push({ id: b.id, kind: b.kind, born: b.born, life: b.life,
        x: b.x + b.vx * travel + sideX * flutterOffset, y: b.y + b.vy * travel + sideY * flutterOffset,
        vx: b.vx * decay + sideX * flutterSpeed, vy: b.vy * decay + sideY * flutterSpeed,
        progress: q, width: b.width * shrink, height: b.height * shrink,
        angle: b.angle, alpha, color: colors[Math.min(colors.length - 1, Math.floor((1 - q) * colors.length))] });
    }
    cached = result; cachedTime = time;
  }
  function drawMatter(p: FirePainter, s: FlameEnsembleSample2D, time: number) {
    matter.draw(p, { id: s.id, position: [s.x, s.y], size: [s.width, s.height],
      angle: s.angle, flowAngle: s.angle, time, burnout: Math.max(0, (s.progress - .45) / .55),
      opacity: s.alpha, profile: s.kind === 'coarse' ? 'mass' : 'tongue' });
  }
  return Object.freeze({
    count: births.length, end, prepare,
    sample(time: number): FlameEnsembleSample2D[] { prepare(time); return cached.map(s => ({ ...s })); },
    drawBack(p: FirePainter, time: number): void {
      prepare(time);
      for (const s of cached) if (s.kind === 'coarse') {
        if (layers.light && litIds.has(s.id)) {
          p.glow(s.x, s.y, Math.min(24, s.width * 1.8), colors[Math.floor((colors.length - 1) * .65)], s.alpha * .16);
        }
        if (layers.coarse) drawMatter(p, s, time);
      }
    },
    draw(p: FirePainter, time: number): void {
      prepare(time);
      for (const s of cached) {
        if (s.kind === 'fine' && layers.fine) drawMatter(p, s, time);
        else if (s.kind === 'sparks' && layers.sparks) {
          const speed = Math.hypot(s.vx, s.vy), length = Math.min(4 * sizeScale, speed * .035);
          p.path([[s.x - s.vx / (speed || 1) * length, s.y - s.vy / (speed || 1) * length], [s.x, s.y]], s.color, s.alpha, Math.max(.5, s.width));
        }
      }
    },
  });
}
