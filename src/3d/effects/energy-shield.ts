/** An energy membrane absorbs distinct oblique hits through local surface-bound motion. */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D } from "../frame.js";
import type { Painter3D } from "../painter.js";
import { type Vec3, Rng3D, add3, mul3, norm3, sub3, smooth3, clamp3, TAU3 } from "../math.js";
import { createShieldSurface3D, shieldNormal3D, shieldPoint3D, shieldResponse3D, shieldRipple3D, drawShieldSurface3D, SHIELD_PALETTE_3D } from "../shield.js";

export interface EnergyShield3DOptions { seed: number; radius: number; intensity: number; palette: Color3D[] }
export const SHIELD_TIMING_3D = { deploy: 0.52, hits: [1.02, 1.68, 2.32], release: 3.18, end: 3.95 } as const;
export const meta: EffectMeta3D<EnergyShield3DOptions> = {
  id: "scifi/energy-shield-3d", name: "Energy Shield 3D",
  description: "A curved cyan energy membrane catches three oblique amber bolts. Each contact dents a local patch, sends a geodesic ripple around the curved shell, and briefly lights nearby hex cells before the intact shield settles and retracts.",
  duration: SHIELD_TIMING_3D.end, loop: false,
  options: { seed: 2761, radius: 2.8, intensity: 1, palette: [...SHIELD_PALETTE_3D] },
  stages: [{ at: 0, label: "DEPLOY" }, { at: 0.52, label: "GUARD" }, { at: 1.02, label: "ABSORB" }, { at: 1.68, label: "DEFLECT" }, { at: 2.32, label: "REINFORCE" }, { at: 2.9, label: "RECOVER" }, { at: 3.18, label: "RETRACT" }],
  cues: SHIELD_TIMING_3D.hits.flatMap((at, i) => [{ at, type: "hit" as const, value: i === 2 ? 0.8 : 0.5 }, { at, type: "flash" as const, value: 0.25 }, { at, type: "shake" as const, value: 0.16 }]),
};
export function create(options: EnergyShield3DOptions) {
  const radius = clamp3(Number.isFinite(options.radius) ? options.radius : 2.8, 1.2, 3.4), intensity = clamp3(Number.isFinite(options.intensity) ? options.intensity : 1, 0, 2);
  const palette = options.palette?.length ? options.palette : meta.options.palette, tone = (q: number) => palette[Math.round(clamp3(q) * (palette.length - 1))];
  const surface = createShieldSurface3D([0.6, radius + 0.4, 0.65], [0.14, 0, 1], radius * 1.22, radius);
  const activeSurface = { ...surface };
  const impacts = SHIELD_TIMING_3D.hits.map((at, i) => ({ at, normal: shieldNormal3D(surface, [-0.27, 0.38, -0.04][i] * radius, [0.24, -0.19, 0.03][i] * radius)!, strength: [0.9, 0.72, 1.2][i] }));
  const incoming = impacts.map((hit, i) => { const end = shieldPoint3D(surface, hit.normal), direction = norm3([-0.85 + i * 0.13, 0.12 + i * 0.04, 1]); return { end, direction, start: add3(end, mul3(direction, 4.4)) }; });
  const rng = new Rng3D(options.seed);
  const fragments = impacts.flatMap((hit, index) => Array.from({ length: index === 2 ? 17 : 12 }, () => ({
    index, life: rng.range(0.24, 0.5), speed: rng.range(1.7, 3.2), angle: rng.range(0, TAU3), forward: rng.range(0.7, 1.5), size: rng.range(0.015, 0.032), birth: hit.at + rng.range(0, 0.025),
  })));
  let time = 0;
  return {
    update(dt: number) { time += dt; },
    draw(p: Painter3D) {
      if (time <= 0 || time >= meta.duration - 1e-8) return;
      const visibility = smooth3(0.04, 0.42, time) * (1 - smooth3(SHIELD_TIMING_3D.release, 3.85, time));
      if (visibility <= 0) return;
      // The deployed surface remains the same shape. The scan front expands across it instead of scaling a flat disc.
      const growth = smooth3(0.04, 0.52, time), shrink = 1 - smooth3(3.32, 3.86, time), aperture = surface.aperture * Math.max(0.015, growth * shrink);
      activeSurface.aperture = aperture; activeSurface.capCos = Math.sqrt(1 - (aperture / surface.radius) ** 2);
      drawShieldSurface3D(p, surface, { time, impacts, visibility, aperture, palette, emission: intensity * 0.24, cellSize: radius * 0.145 });
      for (let index = 0; index < impacts.length; index++) {
        const hit = impacts[index], age = time - hit.at, bolt = incoming[index];
        if (age > -0.28 && age < 0) {
          const progress = (age + 0.28) / 0.28;
          const head = add3(bolt.start, mul3(sub3(bolt.end, bolt.start), progress));
          const tail = add3(head, mul3(bolt.direction, 0.7 + progress * 0.65));
          p.line(tail, head, 0.032, "#d65e37", 0.9, 0.12 * intensity);
          p.line(add3(head, mul3(bolt.direction, 0.5)), head, 0.047, "#ffd6a0", 1, 0.28 * intensity);
          p.glow(head, 0.36, "#ff9a55", 0.22 * intensity);
        }
        if (age < 0 || age > 1.2) continue;
        const contact = Math.exp(-age * 22), ringAge = age;
        if (contact > 0.01) {
          const at = shieldPoint3D(surface, hit.normal, -0.15 * Math.exp(-age * 13) + 0.035);
          p.point(at, 0.065 + contact * 0.07, tone(1), contact, 0.3 * intensity);
          p.glow(at, 0.54, tone(0.8), contact * 0.4 * intensity);
        }
        for (let echo = 0; echo < 2; echo++) {
          const age = ringAge - echo * 0.11;
          if (age <= 0) continue;
          const strength = Math.exp(-age * 2.15) * (echo ? 0.30 : 1) * visibility * hit.strength;
          const ring = shieldRipple3D(activeSurface, hit.normal, age * 4.8, 112);
          for (let k = 0; k < ring.length - 1; k++) {
            const a = ring[k], b = ring[k + 1]; if (!a || !b) continue;
            const da = impacts.reduce((d, h) => d + shieldResponse3D(surface, a, h, time).displacement, 0), db = impacts.reduce((d, h) => d + shieldResponse3D(surface, b, h, time).displacement, 0);
            p.line(shieldPoint3D(surface, a, da + 0.036), shieldPoint3D(surface, b, db + 0.036), echo ? 0.018 : 0.032, tone(echo ? 0.62 : 0.86), strength * 0.9, strength * intensity * 0.16);
          }
        }
      }
      // Warm projectile residue is expelled toward the incoming side, never through the intact barrier.
      for (const chip of fragments) {
        const age = time - chip.birth, q = age / chip.life; if (q <= 0 || q >= 1) continue;
        const hit = impacts[chip.index], at = shieldPoint3D(surface, hit.normal, 0.06);
        const velocity = add3(mul3(hit.normal, chip.forward), add3(mul3(surface.u, Math.cos(chip.angle) * chip.speed), mul3(surface.v, Math.sin(chip.angle) * chip.speed)));
        const pos = (t: number) => add3(add3(at, mul3(velocity, (1 - Math.exp(-t * 2.8)) / 2.8)), [0, -2 * t * t, 0]);
        p.line(pos(Math.max(0, age - 0.045)), pos(age), chip.size, q < 0.3 ? "#ffd6a0" : "#d47750", 1 - smooth3(0.35, 1, q), 0.06 * intensity);
      }
    },
  };
}
