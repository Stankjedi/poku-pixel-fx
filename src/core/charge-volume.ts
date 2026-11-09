/** Local charged matter with bounded discharge. Stylized, not an electromagnetic solver. */
import { hex } from './color.js';
import { clamp, noise2, rng, smooth, TAU } from './math.js';
import type { Painter, Point } from './painter.js';
export interface ChargeVolumeOptions2D {
  seed?: number;
  /** Charged to spent, 1..32 existing colors. No implicit white or light. */
  palette: readonly (string | number)[];
}
export interface ChargeVolumeState2D {
  time: number;
  position: readonly [number, number];
  size: readonly [number, number];
  angle?: number;
  opacity?: number;
  /** A one-way spend clock. 0 is fueled, 1 is exhausted. */
  progress?: number;
  id?: number;
}
export function createChargeVolume2D(options: ChargeVolumeOptions2D) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid charge volume options');
  const { seed = 1 } = options;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Charge seed must be uint32');
  if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32
    || Array.from(options.palette).some(c => typeof c === 'number' ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff
      : typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c))) throw new RangeError('Invalid charge palette');
  const C = options.palette.map(hex);
  const make = (id: number) => {
    const r = rng(seed, id, 3191);
    return Array.from({ length: 3 }, (_, i) => ({ x: i === 0 ? .20 : r.range(-.30, -.08),
      y: i === 0 ? 0 : (i === 1 ? -1 : 1) * r.range(.20, .37),
      radius: i === 0 ? .40 : r.range(.29, .39), phase: r.range(0, 1), rate: r.range(3.2, 5.1),
      lean: r.range(-.12, .12), turn: r.range(-.3, .3) }));
  };
  const seeds: (ReturnType<typeof make> | undefined)[] = [];
  const point = (p: readonly number[]) => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite);
  function resolve(state: ChargeVolumeState2D) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new RangeError('Invalid charge volume state');
    const { time, position, size, angle = 0, opacity = 1, progress = 0, id = 0 } = state;
    if (!state || !Number.isFinite(time) || Math.abs(time) > 3600 || !point(position) || !point(size)
      || size.some(v => v <= 0 || v > 128) || ![angle, opacity, progress].every(Number.isFinite)
      || opacity < 0 || opacity > 1 || progress < 0 || progress > 1
      || !Number.isInteger(id) || id < 0 || id > 8191) throw new RangeError('Invalid charge volume state');
    const descriptors = seeds[id] ?? (seeds[id] = make(id));
    const spent = smooth(.12, .82, progress), collapse = 1 - .65 * spent;
    const lobes = descriptors.map((s, i) => {
      const phase = ((time * s.rate + s.phase) % 1 + 1) % 1;
      const discharge = smooth(.48, .62, phase) * (1 - smooth(.76, .93, phase));
      // Main charge retains coverage while auxiliary clusters briefly spend and recover.
      const compact = (i === 0 ? 1 - .18 * discharge : 1 - .42 * discharge) * collapse;
      return { x: s.x * collapse, y: (s.y + s.lean * Math.sin(time * 5 + s.phase * TAU)) * collapse,
        rx: s.radius * compact, ry: s.radius * (i === 0 ? .95 : .90) * compact,
        charge: (i === 0 ? .82 : .68) - discharge * .25, discharge: discharge * (1 - spent), turn: s.turn,
        side: i === 1 ? -1 : 1, phase: phase, seed: seed + id * 13 + i * 197 };
    });
    return { time, position: [...position] as Point, size: [...size] as Point, angle, opacity, progress,
      fade: 1 - smooth(.6, 1, progress), lobes };
  }
  return Object.freeze({ sample: resolve,
    draw(p: Pick<Painter, 'shade'>, state: ChargeVolumeState2D) {
      const s = resolve(state);
      if (s.opacity === 0 || s.fade === 0) return;
      const [rx, ry] = s.size, cs = Math.cos(s.angle), sn = Math.sin(s.angle);
      const ex = Math.abs(cs) * rx * 1.1 + Math.abs(sn) * ry * 1.1;
      const ey = Math.abs(sn) * rx * 1.1 + Math.abs(cs) * ry * 1.1;
      // Segment endpoints and denominators are invariant across this draw. Keep the original
      // arithmetic, but prepare them once rather than allocating nested arrays in every pixel.
      const strokes = s.lobes.map(l => {
        if (l.discharge <= .08) return undefined;
        const ax = l.x - .15, ay = l.y, bx = l.x - .35, by = l.y + l.side * (.13 + l.turn),
          cx = l.x - .56, cy = l.y + l.side * (.23 + l.turn);
        return [[ax, ay, bx, by], [bx, by, cx, cy]].map(([x0, y0, x1, y1]) => {
          const vx = x1 - x0, vy = y1 - y0;
          return { x0, y0, vx, vy, length2: vx * vx + vy * vy };
        });
      });
      p.shade(s.position[0] - ex, s.position[1] - ey, s.position[0] + ex, s.position[1] + ey, (px, py, out) => {
        const dx = px - s.position[0], dy = py - s.position[1], x = (dx * cs + dy * sn) / rx, y = (-dx * sn + dy * cs) / ry;
        if (Math.abs(x) > 1.05 || Math.abs(y) > 1.05) return;
        let charge = 0, coverage = 0;
        for (let i = 0; i < s.lobes.length; i++) {
          const l = s.lobes[i];
          // Filled compact matter with broad charge bands, not the old advected flame mask.
          const u = (x - l.x) / l.rx, v = (y - l.y) / l.ry;
          const d = Math.max(Math.abs(u) * .82 + Math.abs(v + l.turn * u) * .62, Math.abs(v) * 1.12);
          // noise2 is in [-1,1], so its boundary cannot reach 1.17 (including rounding margin).
          // Omit only noise samples proven unable to paint; do not quantize or cache pixels.
          if (d < 1.17) {
            const warp = noise2(u * 2.2 + l.phase * 1.3, v * 2.2, l.seed);
            const boundary = 1 + .16 * warp;
            if (d < boundary) {
              charge = Math.max(charge, l.charge + .13 * (1 - d) + .06 * warp - .12 * smooth(.55, 1, d));
              coverage = Math.max(coverage, .78 + .22 * (1 - d));
            }
          }
          const segments = strokes[i];
          if (!segments) continue;
          // One short kink is local to a spending cluster; no history, source-path or neighbor link.
          let distance = Infinity;
          for (const { x0, y0, vx, vy, length2 } of segments) {
            const u = clamp(((x - x0) * vx + (y - y0) * vy) / length2);
            distance = Math.min(distance, Math.hypot(x - x0 - vx * u, y - y0 - vy * u));
          }
          const width = (.035 + .045 * l.discharge) * (1 - .55 * clamp((l.x - x) / .6));
          if (distance < width) { charge = Math.max(charge, .75 + .15 * l.discharge); coverage = Math.max(coverage, l.discharge); }
        }
        if (coverage === 0) return;
        out.c = C[Math.min(C.length - 1, Math.floor((1 - clamp(charge)) * C.length))];
        out.a = s.opacity * s.fade * coverage;
      });
    },
  });
}
