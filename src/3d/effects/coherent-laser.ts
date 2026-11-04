/** Original optical-lance choreography: converging charge, coherent hold and local ablation cooling. */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D } from "../frame.js";
import { Rng3D, clamp3, smooth3, TAU3 } from "../math.js";
import type { Painter3D } from "../painter.js";
import { createLaserMetalContact3D, LASER_METAL_HEAT_3D } from "../laser-impact.js";
import { createBeamFrame3D, beamPoint3D, beamEnvelope3D, drawCoherentBeam3D, DEFAULT_BEAM_TIMING_3D, LASER_PALETTE_3D } from "../beam.js";

export interface CoherentLaser3DOptions { seed: number; length: number; width: number; intensity: number; palette: Color3D[]; impactPalette?: Color3D[]; targetVisible?: boolean; impactScale?: number }
export const LASER_TIMING_3D = DEFAULT_BEAM_TIMING_3D;
export const meta: EffectMeta3D<CoherentLaser3DOptions> = {
  id: "scifi/coherent-laser-3d", name: "Coherent Laser 3D",
  description: "A rose-white optical lance focuses through three shrinking collars, snaps toward its target, then holds a perfectly straight white core. The first contact kicks a compact metal-pressure flare; a growing molten lip, dark bore, continuous hot-metal spray and gravity-fed slag make the sustained hit visible. The target cools after the trailing edge arrives.",
  duration: LASER_TIMING_3D.end, loop: false,
  options: { seed: 2419, length: 9.0, width: 0.065, intensity: 1, palette: [...LASER_PALETTE_3D], impactPalette: [...LASER_METAL_HEAT_3D], targetVisible: true, impactScale: 1 },
  stages: [{ at: 0, label: "FOCUS" }, { at: 0.56, label: "IGNITE" }, { at: 0.625, label: "COHERENT HOLD" }, { at: 1.9, label: "SHUTOFF" }, { at: 2.03, label: "COOL" }],
  cues: [{ at: 0.56, type: "sound", value: 0.8 }, { at: 0.625, type: "hit", value: 0.85 }, { at: 0.625, type: "flash", value: 0.55 }, { at: 0.625, type: "shake", value: 0.3 }],
};
export function create(options: CoherentLaser3DOptions) {
  const bounded = (value: number, fallback: number, lo: number, hi: number) => clamp3(Number.isFinite(value) ? value : fallback, lo, hi);
  const length = bounded(options.length, 9.0, 2, 10), width = bounded(options.width, 0.065, 0.025, 0.16);
  const intensity = bounded(options.intensity, 1, 0, 2), palette = options.palette.length ? options.palette : meta.options.palette;
  const tone = (fraction: number) => palette[Math.round(fraction * (palette.length - 1))];
  const beam = createBeamFrame3D([-length / 2, 1.8, 0], [length / 2, 1.8, 0])!;
  const rng = new Rng3D(options.seed);
  const impact = createLaserMetalContact3D(beam, { seed: options.seed, scale: options.impactScale, intensity, palette: options.impactPalette, targetVisible: options.targetVisible, timing: LASER_TIMING_3D });
  const gather = Array.from({ length: 17 }, (_, i) => ({ angle: i * TAU3 / 17 + rng.range(-0.1, 0.1), radius: rng.range(0.6, 1.0), offset: rng.range(0.02, 0.21), life: rng.range(0.24, 0.34), axial: rng.range(-0.035, 0.07) }));
  let t = 0;
  function collar(p: Painter3D, fraction: number, radius: number, alpha: number, color: Color3D, rotation = 0, keep = 1) {
    // A real perpendicular cross-section, not a camera-facing halo or horizontal shockwave.
    const segments = 36;
    for (let i = 0; i < segments; i++) {
      const a = rotation + i / segments * TAU3, b = rotation + (i + 1) / segments * TAU3;
      if (keep < 1 && i / segments > keep) continue;
      p.line(beamPoint3D(beam, fraction, Math.cos(a) * radius, Math.sin(a) * radius), beamPoint3D(beam, fraction, Math.cos(b) * radius, Math.sin(b) * radius), 0.018, color, alpha, 0);
    }
  }
  return {
    update(dt: number) { t += dt; },
    draw(p: Painter3D) {
      if (t <= 0 || t >= meta.duration - 1e-8 || intensity <= 0) return;
      impact.surface(p, t);
      const e = beamEnvelope3D(t), ignition = Math.exp(-Math.max(0, t - LASER_TIMING_3D.arrive) * 34) * (t >= LASER_TIMING_3D.arrive ? 1 : 0);
      const charging = Math.max(e.charge, e.power * 0.5), shut = 1 - smooth3(1.86, 2.06, t);
      if (charging > 0.001) {
        for (let i = 0; i < 3; i++) {
          const radius = (0.55 - i * 0.12) * (1 - e.charge * 0.54) + e.power * 0.055;
          collar(p, -0.017 + i * 0.042, radius, (0.25 + i * 0.2) * charging * shut, tone(i === 2 ? 0.85 : 0.66), t * (i % 2 ? -1 : 1) * 0.7, t < 0.3 ? smooth3(0.04, 0.3, t) : 1);
        }
        p.point(beam.start, 0.04 + e.charge * 0.08, tone(1), Math.min(1, charging * 1.7), 0.2 * intensity);
        p.glow(beam.start, 0.54 + charging * 0.2, tone(0.66), charging * 0.18 * intensity);
      }
      for (const mote of gather) {
        const q = (t - mote.offset) / mote.life;
        if (q <= 0 || q >= 1) continue;
        const radius = mote.radius * (1 - q) ** 1.7, a = mote.angle + q * 0.3, alpha = Math.sin(q * Math.PI);
        const at = beamPoint3D(beam, mote.axial * (1 - q), Math.cos(a) * radius, Math.sin(a) * radius);
        const tail = beamPoint3D(beam, mote.axial * (1 - q + 0.1), Math.cos(a) * (radius + 0.12), Math.sin(a) * (radius + 0.12));
        p.line(tail, at, 0.013, tone(0.66), alpha * 0.65, 0.02 * intensity);
        p.point(at, 0.018, tone(0.85), alpha, 0.04 * intensity);
      }
      if (e.power > 0) {
        const power = e.power * (0.96 + Math.sin(t * 21) * 0.025 + ignition * 0.08);
        drawCoherentBeam3D(p, beam, { head: e.head, tail: e.tail, radius: width * (1 + ignition * 0.75), power, palette, emission: 0.36 * intensity });
        // Axial highlights run forward but never displace, segment or branch the base core.
        for (let i = 0; i < 3; i++) {
          const u = ((t - LASER_TIMING_3D.fire) * 2.3 + i / 3) % 1;
          if (u <= e.tail || u >= e.head) continue;
          p.line(beamPoint3D(beam, Math.max(e.tail, u - 0.045)), beamPoint3D(beam, u), width * 1.14, tone(1), 0.9, 0.32 * intensity);
        }
        if (e.head < 1) p.point(beamPoint3D(beam, e.head), width * 1.8, tone(1), 1, 0.3 * intensity);
      }
      impact.contact(p, t);
    },
  };
}
