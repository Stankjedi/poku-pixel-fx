// Deterministic powered-flight authoring: distance-timed paths, detached exhaust and oriented nozzle jets.
import { clamp, rand, Rng, smooth } from './math.js';
import type { Point } from './shapes.js';
import type { Painter } from './painter.js';

export interface FlightPose { x: number; y: number; angle: number; dx: number; dy: number; speed: number }
const positive = (n: number, name: string) => { if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${name} must be finite and positive`); };

/** Cubic flight with a cumulative-distance lookup. Timing controls distance, not a Bézier parameter,
 * so uneven control points no longer make the engine accelerate and stall accidentally. */
export class CubicFlightPath {
  readonly length: number;
  private readonly points: Point[];
  private readonly lengths: Float64Array;
  private readonly segments: number;
  constructor(points: readonly [Point, Point, Point, Point], segments = 256) {
    if (points.length !== 4 || points.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw new RangeError('Flight needs four finite 2D control points');
    if (!Number.isInteger(segments) || segments < 16 || segments > 4096) throw new RangeError('Flight segments must be an integer from 16 to 4096');
    this.points = points.map(p => [p[0], p[1]]); this.segments = segments;
    this.lengths = new Float64Array(segments + 1);
    let last = this.position(0);
    for (let i = 1; i <= segments; i++) {
      const next = this.position(i / segments);
      this.lengths[i] = this.lengths[i - 1] + Math.hypot(next[0] - last[0], next[1] - last[1]); last = next;
    }
    this.length = this.lengths[segments];
    if (!Number.isFinite(this.length)) throw new RangeError('Flight length overflow');
  }
  private position(u: number): Point {
    const v = 1 - u, [a, b, c, d] = this.points;
    return [a[0]*v*v*v + 3*b[0]*v*v*u + 3*c[0]*v*u*u + d[0]*u*u*u,
      a[1]*v*v*v + 3*b[1]*v*v*u + 3*c[1]*v*u*u + d[1]*u*u*u];
  }
  /** Sample normalized arc distance, with analytic tangent and an endpoint fallback for zero derivatives. */
  atDistance(fraction: number): FlightPose {
    if (!Number.isFinite(fraction)) throw new RangeError('Flight distance must be finite');
    if (this.length === 0) return { x: this.points[0][0], y: this.points[0][1], dx: 1, dy: 0, angle: 0, speed: 0 };
    const distance = clamp(fraction) * this.length;
    let lo = 0, hi = this.segments;
    while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (this.lengths[mid] < distance) lo = mid; else hi = mid; }
    const span = this.lengths[hi] - this.lengths[lo];
    const u = this.length ? (lo + (span ? (distance - this.lengths[lo]) / span : 0)) / this.segments : 0;
    const [x, y] = this.position(u), v = 1 - u, [a, b, c, d] = this.points;
    let dx = 3*v*v*(b[0]-a[0]) + 6*v*u*(c[0]-b[0]) + 3*u*u*(d[0]-c[0]);
    let dy = 3*v*v*(b[1]-a[1]) + 6*v*u*(c[1]-b[1]) + 3*u*u*(d[1]-c[1]);
    if (Math.hypot(dx, dy) < 1e-9) {
      const before = this.position(Math.max(0, u - 1e-4)), after = this.position(Math.min(1, u + 1e-4));
      dx = after[0] - before[0]; dy = after[1] - before[1];
    }
    const magnitude = Math.hypot(dx, dy); dx = magnitude > 1e-12 ? dx / magnitude : 1; dy = magnitude > 1e-12 ? dy / magnitude : 0;
    return { x, y, dx, dy, angle: Math.atan2(dy, dx), speed: 0 };
  }
  /** power >= 1 gives controllable acceleration. Endpoint speed is zero outside the flight interval. */
  atTime(time: number, duration: number, power = 1): FlightPose {
    positive(duration, 'Flight duration');
    if (!Number.isFinite(time) || !Number.isFinite(power) || power < 1) throw new RangeError('Flight time must be finite and power at least 1');
    const q = clamp(time / duration), pose = this.atDistance(q ** power);
    pose.speed = time < 0 || time > duration ? 0 : this.length / duration * power * q ** (power - 1);
    return pose;
  }
}

export interface ExhaustPuff { x: number; y: number; r: number; a: number; b: number; w: number }
export interface ExhaustOptions {
  duration: number; power?: number; spacing?: number; nozzle?: number; speed?: number;
  /** Fraction of the missile velocity inherited by exhaust in world space. */
  inherit?: number; drag?: number; buoyancy?: number; life?: number; radius?: number; seed?: number;
}
/** Exact constant-force/linear-drag displacement, stable for zero and tiny drag. */
export function dragDisplacement(velocity: number, acceleration: number, age: number, drag: number): number {
  if (![velocity, acceleration, age, drag].every(Number.isFinite) || age < 0 || drag < 0) throw new RangeError('Drag motion requires finite values and non-negative age/drag');
  const z = drag * age;
  // Series avoids catastrophic cancellation in (age - integral) / drag.
  const integral = z < 1e-4 ? age * (1 - z / 2 + z*z / 6 - z*z*z / 24) : -Math.expm1(-z) / drag;
  const forceIntegral = z < 1e-4 ? age*age * (0.5 - z / 6 + z*z / 24 - z*z*z / 120) : (age - integral) / drag;
  return velocity * integral + acceleration * forceIntegral;
}

/** Bake emission in spatial cells, then sample exhaust analytically at any time. A puff keeps its birth
 * heading and position when the missile turns. Birth times and RNG consumption never depend on FPS. */
export function createExhaustWake(path: CubicFlightPath, options: ExhaustOptions) {
  const { duration, power = 1.25, spacing = 2, nozzle = 7, speed = 30, inherit = 0.08,
    drag = 3.2, buoyancy = 7, life = 1.25, radius = 5, seed = 1 } = options;
  positive(duration, 'Exhaust duration'); positive(spacing, 'Exhaust spacing'); positive(life, 'Exhaust life'); positive(radius, 'Exhaust radius');
  if (![power, nozzle, speed, inherit, drag, buoyancy, seed].every(Number.isFinite) || power < 1 || drag < 0) throw new RangeError('Invalid exhaust parameters');
  const count = Math.ceil(path.length / spacing);
  if (count > 4096) throw new RangeError('Exhaust exceeds 4096 spatial cells; increase spacing');
  const random = new Rng(seed);
  const particles = Array.from({ length: count }, (_, i) => {
    const f = (i + 0.5) / count, born = duration * f ** (1 / power), s = path.atTime(born, duration, power);
    const side = random.range(-5, 5), e = speed * random.range(0.65, 1.2), forward = s.speed * inherit - e;
    return { born, x: s.x - s.dx * nozzle, y: s.y - s.dy * nozzle,
      vx: s.dx * forward - s.dy * side, vy: s.dy * forward + s.dx * side,
      life: life * random.range(0.95, 1.05), radius: radius * random.range(0.88, 1.12), phase: random.range(0, 6.28), brightness: random.range(0.72, 0.95) };
  });
  return {
    count,
    sample(time: number): ExhaustPuff[] {
      if (!Number.isFinite(time)) throw new RangeError('Exhaust time must be finite');
      const out: ExhaustPuff[] = [];
      for (const q of particles) {
        const age = time - q.born, u = age / q.life;
        if (age < 0 || u >= 1) continue;
        const fade = smooth(0, 0.035, age) * (1 - smooth(0.2, 1, u));
        out.push({ x: q.x + dragDisplacement(q.vx, 0, age, drag),
          y: q.y + dragDisplacement(q.vy, -buoyancy, age, drag) + Math.sin(age * 2 + q.phase) * Math.min(age, 1),
          r: 1.25 + (q.radius - 1.25) * (1 - Math.exp(-age * 3.8)), a: fade * 0.48,
          b: q.brightness - u * 0.35, w: Math.exp(-age * 8) });
      }
      return out;
    },
  };
}

export interface RocketJetOptions { x: number; y: number; angle?: number; length?: number; width?: number; wobble?: number; frame?: number; palette: readonly number[]; profile?: "oriented" | "legacy-horizontal" }
/** Hard stepped hot-gas cone and shock diamonds in nozzle-local coordinates. No painter transform is
 * mutated, so arbitrary rotations, mirroring and nested effects retain their parent's placement. */
export function drawRocketJet(p: Painter, options: RocketJetOptions) {
  const { x, y, angle = 0, length = 20, width = 1, wobble = 1, frame = 0, palette: F, profile = "oriented" } = options;
  if (![x, y, angle, length, width, wobble, frame].every(Number.isFinite) || length <= 0 || width <= 0 || wobble <= 0) throw new RangeError('Jet dimensions must be finite and positive');
  if (F.length < 9 || !F.every(Number.isFinite)) throw new RangeError('Jet palette needs nine finite colors');
  const legacy = profile === "legacy-horizontal";
  if (legacy && (angle !== 0 || width !== 1)) throw new RangeError('Legacy horizontal jets require angle 0 and width 1');
  const cs = Math.cos(angle), sn = Math.sin(angle), endX = x - cs * length, endY = y - sn * length, pad = 6 * width * wobble + 2;
  const diamonds = [0, 1, 2, 3].map(i => (3.6 + i * 4.3 + (rand(frame, i, 41) - 0.5) * 0.7) * (legacy ? 1 : length / 22));
  p.shade(legacy ? x-length-2 : Math.min(x, endX)-pad, legacy ? y-6 : Math.min(y,endY)-pad,
    legacy ? x : Math.max(x,endX)+pad, legacy ? y+6 : Math.max(y,endY)+pad, (px, py) => {
    const u = -(px-x)*cs - (py-y)*sn, side = -(px-x)*sn + (py-y)*cs, q = u / length;
    if (q < 0 || q > 1.05) return;
    const ady = Math.abs(side) / width, qq = Math.min(q, 1), w = (2.6 + 2.4 * qq ** 0.7) * (1 - qq*qq) * wobble;
    const noise = legacy ? Math.floor(px)*7+Math.floor(py)*131 : Math.floor(u)*7+Math.floor(side/width)*131;
    const edge = w - ady + (rand(noise, frame)-0.5)*(legacy ? .9 : .6)*Math.min(1,.25+q*2);
    if (edge < -0.5) return;
    if (edge < 0.5) return F[q < 0.45 ? 3 : 2];
    for (let i = 0; i < diamonds.length; i++) {
      if (diamonds[i] > length * 0.72) break;
      const d = Math.abs(u - diamonds[i]) / ((1.9-i*0.15)*(legacy ? 1 : length/22)) + ady/(1.7-i*0.25);
      if (d < 1) return F[d < 0.55 && i < 3 ? 8 : 7];
    }
    if (u < 1.6 && ady < 1.6) return F[8];
    const level = (1 - ady / Math.max(0.6, w)) * (1 - qq ** 1.5);
    return F[level > 0.62 ? (u < 3 ? 7 : 5) : level > 0.38 ? 5 : level > 0.16 ? 4 : 3];
  });
}

/** Align a cubic's endpoint so a known local contact-support point touches the target.
 * The endpoint tangent is derived from the previous control, not guessed from the target.
 * support=[forward,lateral] is a sprite/shape boundary point in heading-local coordinates.
 * Choose that support from the actual shape and receiving surface normal. */
export function flightEndpointAtContact(contact: Point, previousControl: Point, support: Point): Point {
  if ([contact, previousControl, support].some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))
    throw new RangeError('Flight contact needs finite 2D points');
  const dx=contact[0]-previousControl[0],dy=contact[1]-previousControl[1],distance=Math.hypot(dx,dy),[forward,lateral]=support;
  if (!Number.isFinite(distance) || distance <= Math.abs(lateral) || distance*Math.sqrt(1-(lateral/distance)**2) <= forward)
    throw new RangeError('Contact support must fit ahead of the previous flight control');
  const angle=Math.atan2(dy,dx)-Math.asin(lateral/distance),c=Math.cos(angle),s=Math.sin(angle);
  const point: Point = [contact[0]-forward*c+lateral*s,contact[1]-forward*s-lateral*c];
  if (!point.every(Number.isFinite)) throw new RangeError('Flight contact endpoint overflow');
  return point;
}
