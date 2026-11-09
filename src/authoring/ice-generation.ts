/** Material-specific ice generation. Analytic authored fracture, not a stress or refraction solver. */
import { PAL, fit } from '../core/color.js';
import { rng, smooth } from '../core/math.js';
import { fly } from '../core/particles.js';
import { createCrystalSurface2D } from '../core/crystal-surface.js';
import { createFracture2D } from '../core/fracture2d.js';
import type { Painter, Point } from '../core/painter.js';
import type { GenerationPlan2D } from './generation.js';

/** Internal dispatch target. Public callers use createGeneratedEffect2D to validate the plan. */
export function createIceShatterGeneration2D(plan: GenerationPlan2D, crystalSurface = false) {
  const { release, end } = plan.timing;
  const meta = { name: 'Ice shatter', desc: 'One faceted ice crystal cracks into its own unequal tumbling pieces.',
    tags: ['ice', 'shatter', 'generated-sequence'], size: [...plan.size], origin: [...plan.origin],
    duration: end, fps: 40, loop: false, bg: 'dark', options: { seed: plan.intent.seed, palette: [...PAL.ice] } };
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
      const seed = options.seed, layers = { ...options.layers }, C = fit([...options.palette], 7);
      // The vertices and release point exist before breakup. Pieces are clipped partitions of this
      // silhouette, not a shower of newly spawned identical triangles or recolored flame sprites.
      const polygon: Point[] = [[-2, -38], [17, -20], [22, 7], [8, 29], [-12, 24], [-23, 1], [-17, -23]];
      const shape = polygon.map(([x, y]): Point => [x + plan.from[0], y + plan.from[1]]);
      const fracture = createFracture2D({ polygon: shape,
        palette: options.palette, count: 19, seed, release, life: [0.82, 1.12], speed: [28, 58],
        impulse: [2, -54], gravity: 100, drag: 0.45 });
      const crystal = crystalSurface ? createCrystalSurface2D({ polygon: shape, palette: options.palette, seed }) : undefined;
      // Small grit starts on the fractured matter, has a short lifetime and shares downward gravity.
      const grit = Array.from({ length: 24 }, (_, id) => {
        const r = rng(seed, id, 7719), cell = fracture.pieces[id % fracture.pieces.length];
        const v = cell.vertices[id % cell.vertices.length];
        return { position: [cell.center[0] + v[0], cell.center[1] + v[1]] as Point,
          velocity: [cell.velocity[0] + r.range(-22, 22), cell.velocity[1] + r.range(-15, 15)] as Point,
          life: r.range(0.24, 0.48), size: r.range(0.5, 1.1) };
      });
      const active = (t: number) => {
        if (!Number.isFinite(t)) throw new RangeError('Generation draw time must be finite');
        return t > 0 && t < end;
      };
      return {
        drawBack(_p: Painter, t: number) { active(t); },
        draw(p: Painter, t: number) {
          if (!active(t)) return;
          const age = t - release;
          if ((age < 0 ? layers.body : layers.response) !== false) {
            const opacity = smooth(0, 0.10, t), split = smooth(0.16, release, t);
            // Read the whole solid first. Its broad front/side planes yield to the actual cell
            // boundaries before release, so a viewer sees damage accumulating rather than confetti.
            if (crystal) {
              const samples = age >= 0 || split > 0 ? fracture.sample(t) : [];
              if (age < 0) crystal.draw(p, { opacity });
              else for (const q of samples) {
                const piece = fracture.pieces[q.id];
                crystal.draw(p, { polygon: piece.vertices, materialOrigin: piece.center, position: q.position,
                  angle: q.angle, opacity: opacity * q.opacity, cutEdges: smooth(0, 0.12, age) });
              }
              const cracks = split * (1 - smooth(0, 0.16, age));
              if (cracks > 0) for (const q of samples) for (let i = 0; i < q.points.length; i++) {
                const a = q.points[i], b = q.points[(i + 1) % q.points.length];
                p.line(a[0], a[1], b[0], b[1], C[1], opacity * q.opacity * cracks * 0.20);
              }
            } else {
            if (age < 0) {
              const ridge: Point = [plan.from[0] - 2, plan.from[1] + 6];
              p.poly(shape, C[2], opacity);
              p.poly([shape[0], shape[1], shape[2], ridge], C[4], opacity);
              p.poly([shape[0], ridge, shape[4], shape[5], shape[6]], C[5], opacity);
              p.poly([ridge, shape[2], shape[3], shape[4]], C[3], opacity);
              p.line(shape[0][0], shape[0][1], ridge[0], ridge[1], C[6], opacity * 0.85);
            }
            fracture.draw(p, t, { opacity: opacity * split,
              cracks: split * (1 - smooth(0, 0.16, age)) });
            }
          }
          if (layers.sparks !== false && age >= 0) for (const q of grit) {
            if (age >= q.life) continue;
            const [x, y] = fly(...q.position, ...q.velocity, age, 100, 0.8), a = 1 - smooth(0.30, 1, age / q.life);
            p.poly([[x, y - q.size], [x + q.size, y], [x, y + q.size], [x - q.size, y]], C[5], a * 0.65);
          }
          // Ice reflects the fixed authored light through facet colors. It does not emit light,
          // flame ribbons, smoke or an unrelated shock ring. Unused legacy layer flags are inert.
        },
      };
    },
  };
}
