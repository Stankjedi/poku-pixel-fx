/** Branching dielectric discharge: stepped leader, return strokes, attached streamers and extinction. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, smooth3, TAU3 } from "../math.js";
import { createDischarge3D, drawDischarge3D, dischargePulse3D, DISCHARGE_PALETTE_3D } from "../discharge.js";
import { Particles3D } from "../particles.js";
import { Painter3D } from "../painter.js";

export interface ForkedLightning3DOptions { seed: number; height: number; branching: number; intensity: number; palette: Color3D[] }
export const LIGHTNING_STROKES_3D = [0.64, 0.94, 1.39] as const;
export const meta: EffectMeta3D<ForkedLightning3DOptions> = {
  id: "lightning/forked-lightning-3d", name: "Forked Lightning 3D",
  description: "An irregular stepped leader finds the ground, then three uneven return strokes light the same branching 3D channel. Thin forks extinguish before the trunk; ground streamers and hot contact sparks fade separately.",
  duration: 2.6, loop: false,
  options: { seed: 7361, height: 6.2, branching: 7, intensity: 1, palette: [...DISCHARGE_PALETTE_3D] },
  stages: [{ at: 0, label: "LEADER" }, { at: 0.42, label: "CONNECT" }, { at: 0.64, label: "RETURN STROKE" }, { at: 0.94, label: "RESTRIKE" }, { at: 1.39, label: "FINAL STROKE" }, { at: 1.8, label: "EXTINGUISH" }],
  cues: LIGHTNING_STROKES_3D.flatMap((at, i) => [{ at, type: "flash" as const, value: i ? 0.45 : 0.8 }, { at, type: "hit" as const, value: i ? 0.5 : 1 }, { at, type: "sound" as const, value: i ? 0.55 : 1 }]),
};
export function create(options: ForkedLightning3DOptions) {
  const height = clamp3(Number.isFinite(options.height) ? options.height : 6.2, 2, 8);
  const intensity = clamp3(Number.isFinite(options.intensity) ? options.intensity : 1, 0, 2);
  const palette = options.palette.length ? options.palette : meta.options.palette;
  const tone = (u: number) => palette[Math.round(u * (palette.length - 1))];
  const origin: Vec3 = [-1.8, height, -0.6], contact: Vec3 = [0.8, 0.05, 0.3];
  const channels = createDischarge3D({ start: origin, end: contact, seed: options.seed, branches: options.branching, roughness: 0.23, detail: 5 });
  const rng = new Rng3D(options.seed ^ 0x6a09e667), sparks = new Particles3D(0.035, 100);
  const streamers = Array.from({ length: 4 }, (_, i) => {
    const angle = i * TAU3 / 4 + rng.range(-0.5, 0.5), reach = rng.range(0.65, 1.6);
    return createDischarge3D({ start: [contact[0] + Math.cos(angle) * reach, 0.045, contact[2] + Math.sin(angle) * reach], end: [contact[0] + rng.range(-0.35, 0.35), rng.range(0.7, 1.25), contact[2] + rng.range(-0.35, 0.35)], seed: rng.int(1, 0x7fffffff), detail: 3, branches: 1, roughness: 0.25 });
  });
  let t = 0, nextStroke = 0;
  return {
    update(dt: number) {
      t += dt; sparks.update(dt);
      while (nextStroke < LIGHTNING_STROKES_3D.length && t + 1e-9 >= LIGHTNING_STROKES_3D[nextStroke]) {
        for (let i = 0; i < (nextStroke ? 12 : 22); i++) {
          const a = rng.range(0, TAU3), speed = rng.range(0.7, 2.8);
          sparks.spawn({ position: contact, velocity: [Math.cos(a) * speed, rng.range(1.2, 3.4), Math.sin(a) * speed], life: rng.range(0.13, 0.48), radius: rng.range(0.015, 0.035), color: tone(i % 3 ? 0.8 : 1), style: "spark", gravity: 8, drag: 1.7, emission: 0.1 * intensity });
        }
        nextStroke++;
      }
    },
    draw(p: Painter3D) {
      if (t <= 0 || t >= meta.duration - 1e-8 || intensity <= 0) return;
      const pulse = dischargePulse3D(t, LIGHTNING_STROKES_3D, 0.075);
      const leader = clamp3((t - 0.06) / 0.56), stepped = Math.floor(leader * 18) / 18;
      // Continue forks after the leader reaches ground; return strokes never regenerate topology.
      const progress = t < 0.64 ? stepped : 1.5;
      const residual = (t < 0.64 ? 0.28 : 0.22 * pulse ** 0.4) * (1 - smooth3(1.52, 2.02, t));
      drawDischarge3D(p, channels, { progress, stroke: pulse * Math.min(1, intensity), residual, palette, radius: 0.047, emission: 0.18 * intensity });
      const connection = smooth3(0.35, 0.61, t) * (1 - smooth3(0.66, 0.84, t));
      for (let i = 0; i < streamers.length; i++) drawDischarge3D(p, streamers[i], { progress: connection * (1.2 - i * 0.1), stroke: pulse * 0.55, residual: connection * 0.48, radius: 0.025, palette, emission: 0.07 * intensity });
      // Tiny flashes at the contact, not a radial shockwave or an orb surrounding the bolt.
      if (pulse > 0.025) {
        p.point(contact, 0.035 + pulse * 0.07, tone(1), 1, pulse * 0.3 * intensity);
        p.glow(contact, 0.25 + 0.2 * pulse, tone(0.8), pulse * 0.1 * intensity);
      }
      sparks.draw(p);
    },
  };
}
