/** Bounded non-emissive water pour. Analytic transport, not a fluid or refraction solver. */
import { PAL, fit } from '../core/color.js';
import { noise, rng, smooth, TAU } from '../core/math.js';
import { liquidMotion, liquidImpactTime } from '../core/liquid.js';
import type { LiquidLaunch } from '../core/liquid.js';
import type { Painter, Point } from '../core/painter.js';
import type { GenerationPlan2D } from './generation.js';

// Plan events, connected flow and detached parcels share this exact launch and landing.
export const WATER_POUR = Object.freeze({
  launch: Object.freeze({ x: -26, z: 0, h: 86, vx: 70, vz: 0, vh: -45 }),
  physics: Object.freeze({ gravity: 420, drag: 0, depthScale: .28 }),
});
export const WATER_POUR_FLIGHT = liquidImpactTime(WATER_POUR.launch, WATER_POUR.physics);
export const WATER_POUR_LANDING = Object.freeze(liquidMotion(WATER_POUR.launch, WATER_POUR_FLIGHT, WATER_POUR.physics));

/** Internal dispatch. The public generator validates the plan and composition options first. */
export function createWaterPourGeneration2D(plan: GenerationPlan2D) {
  const { release, sourceEmissionEnd, arrival, end } = plan.timing;
  const meta = { name: 'Water pour', desc: 'A falling water stream feeds a spreading shallow pool, then drains and settles.',
    tags: ['water', 'pour', 'generated-sequence'], size: [...plan.size], origin: [...plan.origin],
    duration: end, fps: 40, loop: false, bg: 'ground', options: { seed: plan.intent.seed, palette: [...PAL.water] } };
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
      const seed = options.seed, C = fit([...options.palette], 8), layers = { ...options.layers };
      const physics = WATER_POUR.physics, source = WATER_POUR.launch, landing = WATER_POUR_LANDING;
      const lastArrival = sourceEmissionEnd + WATER_POUR_FLIGHT;
      const flow = (birth: number) => smooth(release, release + .12, birth) * (1 - smooth(sourceEmissionEnd - .14, sourceEmissionEnd, birth));
      // Finite source parcels have correlated, unequal lateral momentum. At any time the
      // whole visible body samples those SAME parcels, not a fixed guide with moving dots.
      const launchAt = (birth: number) => {
        // First/last parcel anchors stay exactly on the public plan's event positions.
        // During supply, the stream wanders within the already wetted receiving area.
        const variation = smooth(release, release + .2, birth)
          * (1 - smooth(sourceEmissionEnd - .2, sourceEmissionEnd, birth));
        return { ...source, x: source.x + noise(birth * 5, seed + 431) * 1.2 * variation,
          vx: source.vx + (noise(birth * 4, seed + 719) * 22 + noise(birth * 13, seed + 99) * 7) * variation };
      };
      const parcel = (birth: number, age: number) => liquidMotion(launchAt(birth), age, physics);
      const width = (birth: number, age: number) => {
        const launch = launchAt(birth), sourceSpeed = Math.hypot(launch.vx, launch.vh);
        const speed = Math.hypot(launch.vx, -launch.vh + physics.gravity * age);
        return 6 * Math.sqrt(sourceSpeed / speed) * Math.sqrt(flow(birth))
          * (1 + .38 * noise(birth * 10, seed + 73) + .15 * noise(birth * 27, seed + 19));
      };
      const drops = Array.from({ length: 34 }, (_, id) => {
        const r = rng(seed, id, 4128), birth = release + .12 + r.range(0, sourceEmissionEnd - release - .2);
        const detachAge = r.range(.18, WATER_POUR_FLIGHT * .94), q = parcel(birth, detachAge);
        const side = r.chance(.5) ? -1 : 1, w = width(birth, detachAge);
        const launch: LiquidLaunch = { x: q.x + side * w * .85, z: 0, h: q.h,
          vx: q.vx + side * r.range(9, 29), vz: r.range(-11, 11), vh: q.vh + r.range(-12, 16) };
        return { birth: birth + detachAge, launch, impact: liquidImpactTime(launch, physics), size: r.range(.65, 1.55), kind: 'shed' };
      });
      for (let id = 0; id < 62; id++) {
        const r = rng(seed, id, 9427), birth = arrival + .045 + r.range(0, sourceEmissionEnd - release - .05);
        const impact = parcel(birth - WATER_POUR_FLIGHT, WATER_POUR_FLIGHT);
        const a = r.range(0, TAU), speed = r.range(20, 68), launch: LiquidLaunch = {
          x: impact.x + r.range(-3, 4), z: r.range(-3, 3), h: .2,
          vx: Math.cos(a) * speed + 13, vz: Math.sin(a) * speed, vh: r.range(33, 97) };
        drops.push({ birth, launch, impact: liquidImpactTime(launch, physics), size: r.range(.7, 1.65), kind: 'splash' });
      }
      const waves = Array.from({ length: 9 }, (_, id) => {
        const r = rng(seed, id, 5571);
        const birth = arrival + .025 + id * .125 + r.range(0, .06);
        return { birth, x: parcel(birth - WATER_POUR_FLIGHT, WATER_POUR_FLIGHT).x, z: r.range(-2, 2), phase: r.range(0, TAU) };
      });
      function active(t: number) {
        if (!Number.isFinite(t)) throw new RangeError('Generation draw time must be finite');
        return t > 0 && t < end;
      }
      function bead(p: Painter, q: ReturnType<typeof liquidMotion>, size: number, alpha: number) {
        // Small rounded transmitting body, shaded underside and one fixed-light reflection.
        p.shade(q.x - size - .5, q.y - size - .5, q.x + size + .5, q.y + size + .5, (x, y, out) => {
          const dx = (x - q.x) / size, dy = (y - q.y) / size, d = dx * dx + dy * dy;
          if (d > 1) return;
          const lit = -dx * .65 - dy * .7;
          out.c = lit > .3 ? C[6] : dy > .25 ? C[2] : C[4];
          out.a = alpha * (lit > .3 ? .95 : .4 + .25 * Math.sqrt(1 - d));
        });
      }
      // Conservative shader bounds include the widest projected root normal at maximum
      // lateral launch speed; canvas-bound tests alone cannot detect shader-box clipping.
      const maxVx = source.vx + 22 + 7;
      const maxHalfWidth = 6 * 1.53 * Math.hypot(maxVx, source.vh) / -source.vh + 1.2;
      function stream(p: Painter, t: number) {
        if (t <= release || t >= lastArrival) return;
        p.shade(source.x - maxHalfWidth - 1, -source.h, source.x + maxVx * WATER_POUR_FLIGHT + maxHalfWidth + 1, .5, (x, y, out) => {
          const age = (-45 + Math.sqrt(45 * 45 + 2 * physics.gravity * (y + source.h))) / physics.gravity;
          if (age < 0 || age > WATER_POUR_FLIGHT) return;
          const birth = t - age, w = width(birth, age);
          if (w < .12) return;
          const q = parcel(birth, age), vy = q.vy, speed = Math.hypot(q.vx, vy);
          const center = q.x;
          const v = (x - center) * vy / (speed * w), av = Math.abs(v);
          if (av > 1) return;
          // Advected unequal creases disturb the reflected patch, not the whole color ramp.
          const crease = noise(birth * 19 + v * .7, seed + 237);
          const reflection = Math.abs(v + .49 + crease * .14);
          const rim = v < -.83;
          out.c = reflection < .13 && crease > -.12 ? C[6] : rim ? C[4] : v > .58 ? C[2] : v > .1 ? C[3] : C[4];
          out.a = reflection < .13 && crease > -.12 ? .88 : rim ? .55 : .26 + .32 * Math.sqrt(1 - v * v);
          if (reflection < .075 && crease > .52) { out.c = C[7]; out.a = .96; }
        });
      }
      function surface(p: Painter, t: number) {
        const age = t - arrival;
        if (age <= 0) return;
        const fill = Math.min(age, sourceEmissionEnd - release), settle = Math.max(0, t - lastArrival);
        const rx = 3 + 42 * (1 - Math.exp(-fill * 2.2)) + 7 * smooth(0, 1, settle), ry = rx * .25;
        const alpha = smooth(0, .13, age) * (1 - smooth(lastArrival + .15, end, t));
        p.shade(landing.x - rx - 2, -ry - 2, landing.x + rx + 2, ry + 2, (x, y, out) => {
          const dx = (x - landing.x) / rx, dy = y / ry, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
          const rim = 1 + .035 * Math.sin(a * 3 + seed) + .018 * Math.cos(a * 7 - seed);
          if (d > rim) return;
          const edge = d > rim - .045;
          out.c = edge ? dy < -.25 ? C[5] : C[3] : dy < -.12 ? C[3] : C[2];
          out.a = alpha * (edge ? .6 : .18 + .11 * (1 - d));
        });
        // Short outward wave arcs rather than identical closed magic rings.
        for (const wave of waves) {
          const a = t - wave.birth;
          if (a <= 0 || a >= .8) continue;
          const r = 2 + 36 * a, fade = alpha * (1 - smooth(.2, .8, a)) * .7;
          for (const start of [.15 + wave.phase * .08, 3.2 + wave.phase * .06]) {
            const points: Point[] = [];
            for (let i = 0; i <= 20; i++) {
              const angle = start + i / 20 * 1.4;
              points.push([wave.x + Math.cos(angle) * r, wave.z * .28 + Math.sin(angle) * r * .25]);
            }
            p.path(points, start < 2 ? C[5] : C[4], fade);
          }
        }
      }
      function particles(p: Painter, t: number, back: boolean) {
        for (const drop of drops) {
          if ((drop.kind === 'shed' ? layers.trail : layers.sparks) === false) continue;
          const age = t - drop.birth;
          if (age < 0 || age >= drop.impact) continue;
          const q = liquidMotion(drop.launch, age, physics);
          if ((q.z < 0) !== back) continue;
          const a = smooth(0, .02, age) * (1 - smooth(end - .15, end, t));
          bead(p, q, drop.size, a);
        }
      }
      return {
        drawBack(p: Painter, t: number) {
          if (!active(t)) return;
          if (layers.response !== false) surface(p, t);
          particles(p, t, true);
        },
        draw(p: Painter, t: number) {
          if (!active(t)) return;
          if (layers.body !== false) stream(p, t);
          particles(p, t, false);
          // Water does not emit light. The light/residue flags intentionally have no extra artwork.
        },
      };
    },
  };
}
