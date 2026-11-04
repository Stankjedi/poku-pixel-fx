/** Fire is a buoyant, cooling volume: rooted hot tongues, lifting tips and expanding soot. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D, color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, smooth3, TAU3 } from "../math.js";
import { Painter3D } from "../painter.js";
import { drawVolume3D, VolumeGrid3D, volumeNoise3D, type VolumeSample3D } from "../volume.js";

export interface ThermalPlume3DOptions { seed: number; size: number; wind: number; smoke: number; palette: Color3D[] }
export const meta: EffectMeta3D<ThermalPlume3DOptions> = {
  id: "fire/thermal-plume-3d", name: "Thermal Plume 3D",
  description: "A hot fuel bed feeds folded flame tongues. Buoyancy stretches and lifts the tips while cooling soot rolls upward, expands, drifts with the wind and dissolves.",
  duration: 6.4, loop: false,
  stages: [{ at: 0, label: "IGNITE" }, { at: 0.4, label: "BURN" }, { at: 3.2, label: "COOL" }, { at: 4.5, label: "DISSIPATE" }],
  cues: [{ at: 0.12, type: "sound", value: 0.5 }],
  options: { seed: 4217, size: 1, wind: 0.34, smoke: 0.82, palette: ["#642426", "#a83524", "#db4c22", "#f97725", "#ffae3c", "#ffd96b", "#fff1ae"] },
};
interface Tongue { angle: number; height: number; width: number; phase: number; frequency: number }
interface Smoke { born: number; life: number; phase: number; spread: number }
interface TongueSlice { u: number; radius: number; centerX: number; centerZ: number }
export function create(options: ThermalPlume3DOptions) {
  const rng = new Rng3D(options.seed), size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.4, 1.5);
  const wind = clamp3(Number.isFinite(options.wind) ? options.wind : 0.34, -0.8, 0.8);
  const smokeAmount = clamp3(Number.isFinite(options.smoke) ? options.smoke : 0.82, 0, 1.5);
  const source = options.palette.length ? options.palette : meta.options.palette;
  const fire = Array.from({ length: 7 }, (_, i) => color3D(source[Math.round(i / 6 * (source.length - 1))]));
  const soot = ["#272b37", "#363946", "#454654", "#575461", "#68616a"].map(color3D);
  const palette = [...fire, ...soot];
  const tongues: Tongue[] = Array.from({ length: 6 }, (_, i) => ({ angle: i * TAU3 / 6 + rng.range(-0.2, 0.2), height: rng.range(2.6, 4.2), width: rng.range(0.4, 0.62), phase: rng.range(0, TAU3), frequency: rng.range(3.4, 5.2) }));
  const smoke: Smoke[] = Array.from({ length: 18 }, (_, i) => ({ born: 0.35 + i * 0.2, life: rng.range(2.2, 2.6), phase: i * 1.65 + rng.range(-0.35, 0.35), spread: rng.range(0.82, 1.18) }));
  const embers = Array.from({ length: 24 }, () => ({ born: rng.range(0.2, 3.6), life: rng.range(0.8, 1.7), angle: rng.range(0, TAU3), r: rng.range(0.08, 0.72), speed: rng.range(1.8, 2.9), phase: rng.range(0, TAU3) }));
  const bounds = { min: [-4.3 * size, 0, -2.1 * size] as Vec3, max: [4.3 * size, 6.5 * size, 2.1 * size] as Vec3 };
  const grid = new VolumeGrid3D(bounds, 0.16 * size);
  let t = 0, cachedTime = -1;
  return {
    update(dt: number) { t += dt; },
    draw(p: Painter3D) {
      if (t <= 0 || t >= meta.duration - 1e-8) return;
      const ignition = smooth3(0, 0.42, t), fuel = ignition * (1 - smooth3(3.0, 4.25, t));
      const residue = ignition * (1 - smooth3(4.15, 5.8, t));
      // A low, uneven coal bed anchors the combustion. No generic energy ring.
      if (residue > 0) for (let i = 0; i < 12; i++) {
        const a = i * TAU3 / 12, r = 0.62 + 0.13 * Math.sin(i * 4.7);
        const at: Vec3 = [Math.cos(a) * r * size, 0.055 * size, Math.sin(a) * r * size];
        p.point(at, (0.2 + 0.04 * Math.sin(i * 2.7)) * size * residue, fire[0], 1, 0.015 * fuel);
        p.line(at, [at[0] * 0.76, 0.075 * size, at[2] * 0.76], 0.035 * size * residue, fire[2], 1, 0.03 * fuel);
      }
      // Each cache row has one height: reuse its centerlines across all X/Z cells.
      // This keeps exactly the same field and sample spacing without repeating
      // trigonometry and taper powers for every cell in the volume.
      const active = tongues.map(q => ({ ...q, h: q.height * (0.8 + 0.18 * Math.sin(t * q.frequency + q.phase)) * (0.3 + 0.7 * fuel) }));
      const puffs = smoke.map(q => {
        const age = t - q.born, u = age / q.life;
        if (u <= 0 || u >= 1) return undefined;
        const emission = smooth3(0, 0.3, q.born) * (1 - smooth3(3.0, 3.9, q.born));
        const rise = 2.0 + age * 1.45 - 0.13 * age * age;
        return { x: wind * (0.3 + age * 1.25) + Math.sin(q.phase + age * 1.6) * (0.16 + age * 0.3), y: rise, z: Math.cos(q.phase + age * 1.6) * (0.16 + age * 0.3),
          r: (0.34 + age * 0.44) * q.spread, density: emission * smooth3(0, 0.2, u) * (1 - smooth3(0.5, 1, u)) * smokeAmount, phase: q.phase };
      }).filter(q => q !== undefined);
      const slices = new Map<number, TongueSlice[]>();
      const field = (xx: number, yy: number, zz: number): VolumeSample3D | undefined => {
        const x = xx / size, y = yy / size, z = zz / size;
        if (y < 0.06) return;
        let heat = 0, density = 0;
        if (fuel > 0.002 && y < 4.7 && Math.abs(x) < 2.2 && Math.abs(z) < 1.8) {
          const n = volumeNoise3D(x * 2.1, y * 1.4 - t * 2.25, z * 2.1, options.seed);
          // Noise is advected upward in material space; no frame-random sparkle.
          const ripple = (n - 0.5) * 0.27;
          const root = Math.max(0, 1 - (x * x + z * z) / 0.85 - y / 1.35);
          heat = root * 1.12;
          let slice = slices.get(y);
          if (!slice) {
            slice = [];
            for (const q of active) {
              const u = y / q.h;
              if (u >= 1) continue;
              const bend = Math.sin(y * 1.8 - t * q.frequency + q.phase);
              const radius = q.width * Math.pow(1 - u, 0.72) * (0.9 + 0.16 * Math.sin(y * 3.4 - t * 5 + q.phase));
              const centerX = Math.cos(q.angle) * (0.48 - u * 0.15) + wind * y * 0.35 + bend * u * 0.34;
              const centerZ = Math.sin(q.angle) * (0.48 - u * 0.15) + Math.cos(y * 1.65 - t * q.frequency * 0.83 + q.phase) * u * 0.28;
              slice.push({ u, radius: Math.max(0.035, radius), centerX, centerZ });
            }
            slices.set(y, slice);
          }
          for (const q of slice) {
            const radial = Math.hypot(x - q.centerX, z - q.centerZ) / q.radius;
            const body = 1 - radial + ripple * (0.4 + q.u);
            if (body > 0) heat = Math.max(heat, body * (0.86 - q.u * 0.45));
          }
          if (heat > 0.035) {
            const temperature = clamp3((0.15 + Math.sqrt(heat) * 0.93 - y * 0.045) * (0.65 + 0.35 * fuel));
            density = smooth3(0.035, 0.22, heat) * 4.5 * fuel / size;
            return { density, color: fire[Math.min(6, Math.floor(temperature * 7))], emission: 0.025 + temperature * 0.055 };
          }
        }
        if (puffs.length && y > 1.4) {
          let strongest = 0, roll = 0;
          for (const q of puffs) {
            const dx = (x - q.x) / q.r, dy = (y - q.y) / (q.r * 0.84), dz = (z - q.z) / q.r;
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < 1.6) {
              const n = volumeNoise3D(x * 2.0 + q.phase, y * 1.9 - t * 0.8, z * 2.0, options.seed + 81);
              const body = Math.max(0, 1 - distance + (n - 0.5) * 1.05) * q.density;
              density += body * 0.75 / size;
              if (body > strongest) { strongest = body; roll = -dx * 0.15 + dy * 0.18 + n * 0.48; }
            }
          }
          if (density > 0.006) return { density, color: soot[Math.floor(clamp3(0.25 + roll) * 4.99)] };
        }
      };
      if (cachedTime !== t) { grid.refill(field); cachedTime = t; }
      // Shrink the marching domain to the live media. The reusable cache retains
      // stable world-space cells while the ray work follows the actual plume.
      let left = -1.4, right = 1.8, top = fuel > 0.002 ? 4.5 : 0.2, back = -1.4, front = 1.4;
      for (const q of puffs) {
        left = Math.min(left, q.x - q.r * 1.3); right = Math.max(right, q.x + q.r * 1.3);
        top = Math.max(top, q.y + q.r * 1.1); back = Math.min(back, q.z - q.r * 1.3); front = Math.max(front, q.z + q.r * 1.3);
      }
      if (fuel > 0.002 || puffs.length) drawVolume3D(p, { min: [left * size, 0, Math.max(-2.1, back) * size], max: [right * size, Math.min(6.5, top) * size, Math.min(2.1, front) * size] }, grid.sample,
        { step: 0.085 * size, maxSteps: 128, palette, alphaCutoff: 0.14 });
      for (const e of embers) {
        const age = t - e.born, u = age / e.life;
        if (u <= 0 || u >= 1) continue;
        const r = e.r + age * 0.1;
        const pos: Vec3 = [(Math.cos(e.angle) * r + wind * age + Math.sin(age * 3 + e.phase) * age * 0.1) * size, (0.4 + age * e.speed) * size, Math.sin(e.angle) * r * size];
        const fade = smooth3(0, 0.1, u) * (1 - smooth3(0.35, 1, u));
        p.line([pos[0] - wind * 0.035 * size, pos[1] - 0.075 * size, pos[2]], pos, 0.018 * size * fade, fire[u < 0.4 ? 5 : 2], 1, fade * 0.1);
      }
    },
  };
}
