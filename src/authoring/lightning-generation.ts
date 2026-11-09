/** Persistent branched channels with separate leader, return current and residual light. */
import { PAL, fit } from '../core/color.js';
import { clamp, rng, smooth, noise } from '../core/math.js';
import type { Painter, Point } from '../core/painter.js';
import type { GenerationPlan2D } from './generation.js';

type Channel = { readonly points: readonly Point[]; readonly distances: readonly number[];
  readonly length: number; readonly parent: number; readonly attachment: number;
  readonly rootDistance: number; readonly connection: number; readonly strength: number; readonly depth: number };
/** Internal finite topology constructor. Reuses the multiscale, persistent-channel principle
 * of the independent 3D discharge renderer, with no imports from or changes to that engine. */
export function lightningChannels2D(seed: number, from: readonly [number, number], to: readonly [number, number]): readonly Channel[] {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff
    || [from, to].some(p => !Array.isArray(p) || p.length !== 2 || Array.from(p).some(v => !Number.isFinite(v))))
    throw new RangeError('Lightning channel seed and endpoints must be finite');
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 1 || Math.hypot(to[0] - from[0], to[1] - from[1]) > 512)
    throw new RangeError('Lightning channel span must be 1..512 pixels');
  const R = rng(seed, 9171), channels: Channel[] = [], span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  function jagged(start: Point, end: Point, detail: number): Point[] {
    let points = [start, end];
    for (let level = 0; level < detail; level++) {
      const next: Point[] = [points[0]];
      for (let n = 1; n < points.length; n++) {
        const a = points[n - 1], b = points[n], dx = b[0] - a[0], dy = b[1] - a[1];
        const u = R.range(.29, .71), offset = R.range(-.19, .19);
        next.push([a[0] + dx * u - dy * offset, a[1] + dy * u + dx * offset], b);
      }
      points = next;
    }
    return points;
  }
  function append(points: Point[], parent: number, attachment: number, strength: number, depth: number) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const length = distances[distances.length - 1];
    const rootDistance = parent < 0 ? 0 : channels[parent].rootDistance + channels[parent].distances[attachment];
    channels.push(Object.freeze({ points: Object.freeze(points.map(p => Object.freeze(p) as Point)),
      distances: Object.freeze(distances), length, parent, attachment, rootDistance, connection: parent < 0 ? 0 : parent === 0 ? rootDistance : channels[parent].connection, strength, depth }));
    return channels.length - 1;
  }
  append(jagged([...from], [...to], 6), -1, 0, 1, 0);
  const trunk = channels[0], count = 4 + Math.floor(R.range(0, 3));
  for (let i = 0; i < count; i++) {
    const index = Math.floor((.12 + .64 * (i + R.range(.1, .85)) / count) * (trunk.points.length - 1));
    const a = trunk.points[index], side = R.chance(.5) ? -1 : 1;
    const remain = Math.max(8, to[1] - a[1]), down = Math.min(remain * .72, span * R.range(.12, .32));
    const b: Point = [a[0] + side * span * R.range(.12, .32), a[1] + down];
    const child = append(jagged([...a], b, 4), 0, index, R.range(.45, .68), 1);
    if (i % 3 !== 1) {
      const parent = channels[child], j = Math.floor(R.range(4, 12)), q = parent.points[j];
      append(jagged([...q], [q[0] + side * R.range(7, 21), q[1] + R.range(5, 16)], 3), child, j, parent.strength * .5, 2);
    }
  }
  return Object.freeze(channels);
}
/** Clip by actual path distance, interpolating the final cell instead of popping a whole segment. */
function section(channel: Channel, from: number, to: number): Point[] {
  const out: Point[] = [];
  const low = Math.max(0, from), high = Math.min(channel.length, to);
  if (high <= low) return out;
  for (let i = 1; i < channel.points.length; i++) {
    const a = channel.distances[i - 1], b = channel.distances[i];
    if (b <= low || a >= high) continue;
    const p = channel.points[i - 1], q = channel.points[i], point = (d: number): Point => {
      const u = (d - a) / (b - a); return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    };
    if (!out.length) out.push(point(Math.max(a, low)));
    out.push(point(Math.min(b, high)));
  }
  return out;
}

/** Public callers use createGeneratedEffect2D so only canonical plans reach this renderer. */
export function createLightningStrikeGeneration2D(plan: GenerationPlan2D) {
  const { release, arrival, sourceEmissionEnd, end } = plan.timing;
  const repeat = plan.events.find(e => e.id === 'restrike')!.at;
  const meta = { name: 'Lightning strike', desc: 'A branching leader connects, flashes twice along one channel and leaves a brief fading trace.',
    tags: ['lightning', 'strike', 'generated-sequence'], size: [...plan.size], origin: [...plan.origin],
    duration: end, fps: 40, loop: false, bg: 'dark', options: { seed: plan.intent.seed, palette: [...PAL.electric] } };
  type Options = { seed: number; palette: (string | number)[]; layers?: Record<string, boolean> };
  return { meta, events: plan.events,
    create(options: Options) {
      if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)
        throw new RangeError('Generated effect seed must be uint32');
      if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32 || Array.from(options.palette).some(c => typeof c === 'number'
        ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff : typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
        throw new RangeError('Generated effect palette must contain packed colors or #rgb/#rrggbb');
      if (options.layers !== undefined && (!options.layers || typeof options.layers !== 'object' || Array.isArray(options.layers)
        || Object.entries(options.layers).some(([key, value]) => !['body', 'trail', 'sparks', 'response', 'residue', 'light'].includes(key)
          || typeof value !== 'boolean'))) throw new RangeError('Invalid generated layer flags');
      const seed = options.seed, layers = { ...options.layers }, C = fit([...options.palette], 8);
      const channels = lightningChannels2D(seed, plan.from, plan.to), length = channels[0].length;
      const current = (t: number, at: number, strength: number, duration: number) => {
        const age = t - at;
        return age < 0 || age >= duration ? 0 : strength * smooth(0, .003, age) * (1 - smooth(.025, duration, age));
      };
      const states = (t: number) => {
        if (!Number.isFinite(t)) throw new RangeError('Generation draw time must be finite');
        const first = current(t, arrival, 1, .085), second = current(t, repeat, .68, sourceEmissionEnd - repeat);
        const residual = t < arrival ? 0 : (.24 * Math.exp(-(t - arrival) / .15)
          + (t >= repeat ? .12 * Math.exp(-(t - repeat) / .11) : 0)) * (1 - smooth(.65, end, t));
        const branchResidual = t < arrival ? 0 : .24 * Math.exp(-(t - arrival) / .15) * (1 - smooth(.65, end, t));
        return { first, second, residual, branchResidual, active: t >= release && t < end };
      };
      return {
        drawBack(p: Painter, t: number) {
          const s = states(t); if (!s.active) return;
          if (t < arrival) {
            // This readable leader phase is deliberately slowed, not a real-time physics claim.
            const progress = clamp((t - release) / (arrival - release)), front = Math.floor(progress * 14) / 14 * length;
            for (const c of channels) {
              if ((c.depth === 0 ? layers.body : layers.trail) === false) continue;
              const pts = section(c, 0, front - c.rootDistance);
              if (pts.length > 1) p.path(pts, c.depth ? C[3] : C[4], .30 * c.strength, 1);
            }
            // The final short upward connection uses the actual receiving end of the same trunk.
            if (layers.body !== false && progress > .76) {
              const pts = section(channels[0], length * (1 - .09 * smooth(.76, 1, progress)), length);
              if (pts.length > 1) p.path(pts, C[4], .34, 1);
            }
          } else if (layers.residue !== false) {
            for (const c of channels) {
              // Only the leader-established extent can carry current or leave a residual.
              const front = (1 - smooth(arrival, arrival + .008, t)) * length;
              if (c.depth > 0 && c.connection < front) continue;
              const pts = section(c, c.depth === 0 ? front : 0, Math.min(c.length, length - c.rootDistance));
              if (pts.length < 2) continue;
              const alpha = (c.depth ? s.branchResidual : s.residual) * c.strength * (c.depth ? Math.exp(-(t - arrival) * 10) : 1);
              if (alpha < .002) continue;
              p.path(pts, c.depth ? C[2] : C[3], u => alpha * (.7 + .3 * noise(u * 13, seed + c.depth)), 1);
            }
          }
        },
        draw(p: Painter, t: number) {
          const s = states(t); if (!s.active || s.first + s.second <= 0) return;
          const power = Math.max(s.first, s.second);
          // Back-to-front hierarchy: later return strokes reuse only the established main channel.
          for (let i = channels.length - 1; i >= 0; i--) {
            const c = channels[i]; if ((c.depth === 0 ? layers.body : layers.trail) === false) continue;
            const k = c.depth === 0 ? power : s.first * c.strength * .8;
            if (k <= .005) continue;
            const returnFront = (1 - smooth(arrival, arrival + .008, t)) * length;
            if (c.depth > 0 && c.connection < returnFront) continue;
            const upward = c.depth === 0 ? returnFront : 0;
            const pts = section(c, upward, Math.min(c.length, length - c.rootDistance)); if (pts.length < 2) continue;
            const taper = (u: number) => c.depth === 0 ? 1 : 1 - .78 * u;
            p.path(pts, C[3], u => k * .5 * taper(u), c.depth === 0 ? 3.2 : 1.7);
            p.path(pts, c.depth === 0 ? C[6] : C[5], u => k * .85 * taper(u), c.depth === 0 ? 1.9 : 1);
            if (c.depth === 0) p.path(pts, C[7], k, 1);
            if (layers.light !== false) p.glowPath(pts, c.depth === 0 ? 11 : 4, C[4], k * (c.depth === 0 ? .24 : .045));
          }
          if (layers.response !== false) {
            p.ellipse(plan.to[0], plan.to[1], 3, .8, C[6], power * .7);
            if (layers.light !== false) p.glow(plan.to[0], plan.to[1], 17, C[4], power * .22);
          }
          // No invented debris, sparks, smoke, scorch, or moving afterimage for an unspecified target.
        },
      };
    },
  };
}
