/** Local metal ablation for a coherent laser, separate from explosive/ground-impact geometry. */
import type { Color3D } from "./frame.js";
import type { Painter3D } from "./painter.js";
import { type Vec3, add3, mul3, norm3, cross3, Rng3D, smooth3, clamp3, TAU3 } from "./math.js";
import { type BeamFrame3D, type BeamTiming3D, DEFAULT_BEAM_TIMING_3D, beamEnvelope3D } from "./beam.js";

export const LASER_METAL_HEAT_3D: readonly Color3D[] = ["#28151d", "#652723", "#b94525", "#f58436", "#ffd078", "#fff3d0"];
const METAL: readonly Color3D[] = ["#101720", "#1d2833", "#2c3a47", "#425261", "#6e8291"];
export interface LaserContactState3D { age: number; flash: number; heat: number; bore: number; pressure: number; visible: number }
/** Heating follows delivered power at the target; cooling starts when the trailing edge arrives. */
export function laserContactState3D(time: number, timing: Readonly<BeamTiming3D> = DEFAULT_BEAM_TIMING_3D): LaserContactState3D {
  beamEnvelope3D(0, timing); // Share the strictly increasing finite timing contract.
  if (!Number.isFinite(time) || time < 0 || time >= timing.end) return { age: 0, flash: 0, heat: 0, bore: 0, pressure: 0, visible: 0 };
  const age = time - timing.arrive, visible = smooth3(0.025, 0.18, time) * (1 - smooth3(timing.end - 0.24, timing.end, time));
  if (age < 0) return { age, flash: 0, heat: 0, bore: 0, pressure: 0, visible };
  const flash = Math.exp(-age * 20) * (1 - smooth3(0.08, 0.18, age));
  const fed = 1 - smooth3(timing.clear, timing.clear + 0.09, time);
  const heat = smooth3(0, 0.055, age) * (1 - smooth3(timing.clear + 0.03, timing.end - 0.08, time));
  return { age, flash, heat, bore: smooth3(0.015, 0.85, age), pressure: (flash + 0.26 * smooth3(0.01, 0.09, age)) * fed, visible };
}
export interface LaserMetalContact3DOptions {
  seed?: number; scale?: number; intensity?: number; palette?: readonly Color3D[];
  /** Set false when the host scene already supplies the target surface. */
  targetVisible?: boolean; timing?: Readonly<BeamTiming3D>;
}
export function createLaserMetalContact3D(beam: BeamFrame3D, options: LaserMetalContact3DOptions = {}) {
  const bounded = (v: number | undefined, fallback: number, lo: number, hi: number) => clamp3(v !== undefined && Number.isFinite(v) ? v : fallback, lo, hi);
  const scale = bounded(options.scale, 1, 0.45, 1.35), intensity = bounded(options.intensity, 1, 0, 2);
  const timing = options.timing ?? DEFAULT_BEAM_TIMING_3D, palette = options.palette?.length ? options.palette : LASER_METAL_HEAT_3D;
  const heatTone = (u: number) => palette[Math.round(clamp3(u) * (palette.length - 1))];
  // The oblique metal face is a fixed world-space plane. It does not turn with the camera.
  const normal = norm3(add3(mul3(beam.axis, -0.32), add3(mul3(beam.u, 0.92), mul3(beam.v, -0.22))));
  const u = norm3(cross3(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1])), v = cross3(u, normal); // Positive surface Y rises in the world.
  const point = (x: number, y: number, depth = 0): Vec3 => add3(beam.end, add3(add3(mul3(u, x * scale), mul3(v, y * scale)), mul3(normal, depth * scale)));
  const rng = new Rng3D((options.seed ?? 2419) ^ 0x71ab42);
  const rim = Array.from({ length: 24 }, (_, i) => ({ a: i / 24 * TAU3, rough: rng.range(0.9, 1.12), outer: Math.min(1.14, 0.93 / Math.max(Math.abs(Math.cos(i / 24 * TAU3)), Math.abs(Math.sin(i / 24 * TAU3)))) }));
  const spray = Array.from({ length: 108 }, (_, i) => ({
    born: timing.arrive + (i < 26 ? rng.range(0, 0.035) : (i - 26) / 82 * (timing.clear - timing.arrive - 0.06)),
    life: rng.range(i < 26 ? 0.24 : 0.25, i < 26 ? 0.43 : 0.48), angle: rng.range(0, TAU3), speed: rng.range(i < 26 ? 3.0 : 1.6, i < 26 ? 4.8 : 3.5),
    outward: rng.range(0.9, i < 26 ? 2.8 : 2.3), radius: rng.range(0.018, 0.036), droplet: i % 9 === 0,
  }));
  const puffs = Array.from({ length: 22 }, (_, i) => ({ born: timing.arrive + 0.08 + i * 0.067, life: rng.range(0.43, 0.76), phase: rng.range(0, TAU3), drift: rng.range(0.3, 0.65) }));
  function particlePosition(q: typeof spray[number], age: number): Vec3 {
    const travel = (1 - Math.exp(-age * 2.7)) / 2.7;
    const pos = point(Math.cos(q.angle) * q.speed * travel, Math.sin(q.angle) * q.speed * travel, q.outward * travel);
    return [pos[0], Math.max(0.035, pos[1] - 3.8 * age * age), pos[2]];
  }
  function surface(p: Painter3D, time: number) {
    const s = laserContactState3D(time, timing);
    if (s.visible <= 0 || intensity <= 0) return;
    const hole = 0.025 + 0.25 * s.bore;
    const last = rim.length;
    if (options.targetVisible !== false) {
      for (let i = 0; i < last; i++) {
        const a = rim[i], b = rim[(i + 1) % last];
        const A = point(Math.cos(a.a) * a.outer, Math.sin(a.a) * a.outer * 1.12);
        const B = point(Math.cos(b.a) * b.outer, Math.sin(b.a) * b.outer * 1.12);
        const innerA = point(Math.cos(a.a) * hole, Math.sin(a.a) * hole, -0.08 * s.bore);
        const innerB = point(Math.cos(b.a) * hole, Math.sin(b.a) * hole, -0.08 * s.bore);
        const color = METAL[i < 8 ? 2 : i < 15 ? 1 : 2];
        p.triangle(innerA, A, B, color, s.visible);
        p.triangle(innerA, B, innerB, color, s.visible);
        // A continuous thickness/bevel makes the panel read as a material, not a holographic ring.
        const backA = point(Math.cos(a.a) * a.outer * 1.04, Math.sin(a.a) * a.outer * 1.12 * 1.04, -0.12);
        const backB = point(Math.cos(b.a) * b.outer * 1.04, Math.sin(b.a) * b.outer * 1.12 * 1.04, -0.12);
        p.triangle(A, backA, backB, METAL[i < 12 ? 0 : 3], s.visible);
        p.triangle(A, backB, B, METAL[i < 12 ? 0 : 3], s.visible);
        p.line(A, B, 0.014 * scale, METAL[i < 12 ? 3 : 2], s.visible * 0.7);
        p.triangle(point(0, 0, -0.19), innerA, innerB, METAL[0], s.visible);
      }
      for (const [x, y] of [[-0.55, 0.58], [0.55, 0.58], [-0.55, -0.58], [0.55, -0.58]]) {
        p.point(point(x, y, 0.009), 0.038 * scale, METAL[3], s.visible);
        p.point(point(x - 0.009, y + 0.009, 0.013), 0.015 * scale, METAL[4], s.visible * 0.6);
      }
    }
    if (s.age < 0) return;
    // The hot lip is a dished annulus with a real unfilled bore, not a solid orange impact ball.
    for (let i = 0; i < last; i++) {
      const a = rim[i], b = rim[(i + 1) % last], warm = 0.13 * s.heat;
      const radiusA = hole + (warm + 0.035) * a.rough, radiusB = hole + (warm + 0.035) * b.rough;
      const A = point(Math.cos(a.a) * radiusA, Math.sin(a.a) * radiusA, 0.022);
      const B = point(Math.cos(b.a) * radiusB, Math.sin(b.a) * radiusB, 0.022);
      const I = point(Math.cos(a.a) * hole, Math.sin(a.a) * hole, -0.075 * s.bore);
      const J = point(Math.cos(b.a) * hole, Math.sin(b.a) * hole, -0.075 * s.bore);
      const hot = 0.08 + s.heat * (0.75 + 0.09 * Math.sin(a.a + time * 4));
      const color = heatTone(hot);
      p.triangle(I, A, B, color, s.visible, 0.22 * s.heat * intensity);
      p.triangle(I, B, J, color, s.visible, 0.22 * s.heat * intensity);
      p.line(I, J, 0.022 * scale, heatTone(0.08 + s.heat * 0.92), s.visible, 0.18 * s.heat * intensity);
    }
    // Gravity makes two small molten runs. They develop slowly rather than exploding radially.
    for (let i = 0; i < 2; i++) {
      const drip = smooth3(0.24 + i * 0.17, 1.15 + i * 0.1, s.age);
      if (drip <= 0) continue;
      const x = (i ? 0.15 : -0.10), y = -hole * 0.8, end = y - (i ? 0.35 : 0.55) * drip;
      p.line(point(x, y, 0.027), point(x + 0.018, end, 0.027), (0.022 + i * 0.005) * scale, heatTone(0.2 + 0.45 * s.heat), s.visible, 0.1 * s.heat * intensity);
      p.point(point(x + 0.018, end, 0.031), 0.035 * scale, heatTone(0.3 + 0.42 * s.heat), s.visible, 0.08 * s.heat * intensity);
    }
    // Cool vapor belongs to the contact face and is drawn before the coherent core.
    for (const puff of puffs) {
      const age = time - puff.born, q = age / puff.life;
      if (q <= 0 || q >= 1) continue;
      const at = point(Math.sin(puff.phase + age * 3) * age * 0.2, age * puff.drift + 0.12, age * 0.65);
      p.point(at, (0.08 + q * 0.19) * scale, q < 0.25 ? heatTone(0.18) : METAL[2], Math.sin(q * Math.PI) * 0.14 * s.visible);
    }
  }
  function contact(p: Painter3D, time: number) {
    const s = laserContactState3D(time, timing);
    if (s.age < 0 || s.visible <= 0 || intensity <= 0) return;
    if (s.pressure > 0.002) {
      // A compact back-pressure fan, directed out of the metal and away from the beam axis.
      for (let i = 0; i < 6; i++) {
        const angle = i / 6 * TAU3 + 0.18, reach = 0.14 + 0.68 * s.flash;
        const foot = point(Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0.045);
        const tip = point(Math.cos(angle) * reach, Math.sin(angle) * reach, 0.10 + 0.36 * s.flash);
        const side = point(Math.cos(angle + 0.38) * reach * 0.43, Math.sin(angle + 0.38) * reach * 0.43, 0.12);
        p.triangle(foot, side, tip, heatTone(0.72), Math.min(1, s.pressure), 0.18 * intensity);
        p.line(foot, tip, 0.022 * scale, heatTone(1), Math.min(1, s.pressure * 0.9), 0.28 * intensity);
      }
      p.point(point(0, 0, 0.035), (0.12 + s.flash * 0.17) * scale, heatTone(1), Math.min(1, s.pressure * 2.6), 0.45 * intensity);
      p.glow(point(0, 0, 0.02), (0.65 + s.flash * 0.25) * scale, heatTone(0.72), Math.min(0.65, (0.14 + s.flash * 0.25) * intensity));
    } else if (s.heat > 0.001) p.glow(point(0, 0, 0.02), 0.65 * scale, heatTone(0.45), s.heat * 0.09 * intensity);
    for (const q of spray) {
      const age = time - q.born, progress = age / q.life;
      if (progress <= 0 || progress >= 1) continue;
      const alpha = smooth3(0, 0.012, age) * (1 - smooth3(0.3, 1, progress)) * s.visible;
      const tail = particlePosition(q, Math.max(0, age - (q.droplet ? 0.035 : 0.052))), at = particlePosition(q, age);
      p.line(tail, at, q.radius * scale, heatTone(progress < 0.22 ? 0.9 : 0.6), alpha, 0.08 * intensity);
      p.point(at, q.radius * scale * (q.droplet ? 1.7 : 1), heatTone(progress < 0.2 ? 1 : progress < 0.6 ? 0.7 : 0.35), alpha, 0.12 * intensity);
    }
  }
  return { surface, contact, point, normal, state: (time: number) => laserContactState3D(time, timing) };
}
