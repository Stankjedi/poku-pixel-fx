/** Frost Nova 3D: the 2D authoring recipe carried into a real XYZ world. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, outBack3, outCubic3, smooth3, TAU3 } from "../math.js";
import { Particles3D } from "../particles.js";
import { Painter3D } from "../painter.js";

export interface FrostNova3DOptions {
  seed: number;
  reach: number;
  intensity: number;
  palette: Color3D[];
}

export const meta: EffectMeta3D<FrostNova3DOptions> = {
  id: "ice/frost-nova-3d",
  name: "Frost Nova 3D",
  description: "A six-armed snowflake condenses, releases a circular shockwave, erupts into rings of physical ice and melts into drifting frost.",
  duration: 4.4,
  loop: false,
  stages: [
    { at: 0, label: "CHARGE" }, { at: 0.46, label: "RELEASE" },
    { at: 1.25, label: "CRYSTALLIZE" }, { at: 2.5, label: "MELT" }, { at: 3.7, label: "FADE" },
  ],
  cues: [{ at: 0.46, type: "flash", value: 1 }, { at: 0.49, type: "shake", value: 0.24 }, { at: 0.52, type: "hit", value: 1 }],
  options: {
    seed: 7439, reach: 5.9, intensity: 1,
    palette: ["#10203d", "#19365d", "#275688", "#367bb0", "#51a0cc", "#71c9e8", "#b0edfb", "#e0f9ff", "#ffffff"],
  },
};

interface Site {
  x: number; z: number; r: number; angle: number; h: number; width: number;
  tilt: number; start: number; phase: number; erupted: boolean; back: boolean;
}
const RELEASE = 0.46, SPREAD = 0.79, HOLD = 2.5;

export function create(options: FrostNova3DOptions) {
  const rng = new Rng3D(options.seed), reach = Math.max(0.5, options.reach), intensity = Math.max(0.1, options.intensity);
  const palette = options.palette;
  const crystalPalette = palette.slice(2), burstPalette = palette.slice(5);
  const sites: Site[] = [], particles = new Particles3D(0, 2000);
  for (let ring = 0; ring < 3; ring++) {
    const count = [12, 20, 28][ring];
    for (let i = 0; i < count; i++) {
      const angle = (i + rng.range(-0.17, 0.17)) * TAU3 / count;
      const radius = (reach / 5.9) * ([1.7, 3.2, 4.8][ring] + rng.range(-0.4, 0.4));
      const height = [2.5, 1.6, 0.95][ring] * rng.range(0.65, 1.35) * intensity;
      const q = clamp3(radius / reach);
      sites.push({
        x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, r: radius, angle, h: height,
        width: height * rng.range(0.18, 0.28), tilt: height * rng.range(-0.25, 0.25),
        start: RELEASE + SPREAD * (1 - Math.cbrt(Math.max(0, 1 - q))) + rng.range(-0.03, 0.08),
        phase: rng.range(0, TAU3), erupted: false, back: ring === 2,
      });
    }
  }
  let t = 0, released = false;
  const wave = () => reach * outCubic3((t - RELEASE) / SPREAD);
  const burst = () => {
    for (let i = 0; i < Math.round(210 * intensity); i++) {
      const angle = rng.range(0, TAU3), speed = rng.range(1.5, 8.5), vy = rng.range(1.2, 6);
      particles.spawn({
        position: [rng.range(-0.2, 0.2), rng.range(0.8, 2.4), rng.range(-0.2, 0.2)],
        velocity: [Math.cos(angle) * speed, vy, Math.sin(angle) * speed],
        life: rng.range(0.6, 1.8), radius: rng.range(0.025, 0.095), gravity: rng.range(5, 10),
        bounce: 0.22, drag: 0.55, color: palette[rng.int(5, 8)], emission: 0.15,
        style: rng.chance(0.55) ? "spark" : "shard",
      });
    }
  };
  return {
    update(dt: number) {
      t += dt;
      if (!released && t >= RELEASE) { released = true; burst(); }
      for (const site of sites) if (!site.erupted && t >= site.start) {
        site.erupted = true;
        for (let i = 0; i < 2 + Math.round(site.h * 2); i++) {
          const angle = site.angle + rng.range(-1.5, 1.5), speed = rng.range(1.4, 4.2);
          particles.spawn({
            position: [site.x, 0.04, site.z],
            velocity: [Math.cos(angle) * speed, rng.range(1, 5.5), Math.sin(angle) * speed],
            life: rng.range(0.6, 1.2), radius: rng.range(0.03, 0.085), gravity: 7.5,
            bounce: 0.28, drag: 0.28, color: rng.pick(burstPalette), emission: 0.1,
            style: rng.chance(0.6) ? "shard" : "point",
          });
        }
      }
      if (t > RELEASE + 0.2 && t < HOLD && rng.chance(0.24)) {
        const site = rng.pick(sites);
        if (site.erupted) particles.spawn({
          position: [site.x + rng.range(-0.1, 0.1), rng.range(0.2, site.h), site.z + rng.range(-0.1, 0.1)],
          velocity: [rng.range(-0.3, 0.3), rng.range(0.05, 0.5), rng.range(-0.3, 0.3)],
          life: rng.range(0.35, 0.8), radius: rng.range(0.025, 0.065), color: palette[8], emission: 0.2,
        });
      }
      if (t > HOLD && t < 3.25 && rng.chance(0.4)) {
        const s = rng.pick(sites);
        particles.spawn({
          position: [s.x, rng.range(0.1, Math.max(0.2, s.h * (1 - smooth3(HOLD, 3.7, t)))), s.z],
          velocity: [rng.range(-0.7, 0.7), -rng.range(0.1, 0.9), rng.range(-0.7, 0.7)],
          life: rng.range(0.5, 0.85), radius: rng.range(0.025, 0.065), gravity: 1.2,
          color: palette[5], bounce: 0.15,
        });
      }
      particles.update(dt);
    },
    draw(p: Painter3D) {
      const fade = 1 - smooth3(3.2, 4.4, t), fr = t < RELEASE ? 0 : wave();
      if (t >= RELEASE) {
        const ground = 1 - smooth3(2.7, 4.05, t);
        // Frost crust and shockwave share the same world-space propagation.
        for (let j = 0; j < 4; j++) p.ring(fr * (0.62 + j * 0.125), 0.025, palette[3 + (j % 3)], ground * 0.55, 0.025, 0.022 + j * 0.003, 80);
        if (t < 1.7) {
          const shockFade = 1 - smooth3(0.9, 1.7, t);
          p.ring(fr, 0.075, palette[7], shockFade, 0.22 * shockFade, 0.08, 112);
        }
        for (let i = 0; i < 180; i++) {
          const a = i * 2.3999632297, radius = fr * Math.sqrt(i / 180) * 0.92;
          const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
          if (radius > fr || ground <= 0) continue;
          p.point([x, 0.005, z], 0.018, palette[i % 8 > 4 ? 6 : 4], ground * 0.22, 0);
        }
      }
      for (const site of sites) {
        const growth = clamp3(outBack3((t - site.start) / 0.13), 0, 1.14);
        const melt = 1 - smooth3(HOLD, 3.72, t);
        if (growth <= 0 || melt <= 0) continue;
        const h = site.h * growth * melt, width = site.width * (0.85 + growth * 0.15) * (1 - 0.45 * (1 - melt));
        p.crystal([site.x, 0.02, site.z], h, width, site.angle + site.phase * 0.2, site.tilt * growth * melt, crystalPalette);
        if (site.h > 1.5 && melt > 0.3) {
          const side: Vec3 = [site.x + Math.sin(site.angle) * 0.28, h * 0.6, site.z + Math.cos(site.angle) * 0.28];
          p.line([site.x, h * 0.3, site.z], side, 0.045, palette[6], melt * 0.8, 0.07);
        }
        const shimmer = Math.sin(t * 6 + site.phase * 3);
        if (shimmer > 0.92) {
          const top: Vec3 = [site.x + Math.cos(site.angle) * site.tilt * melt, h, site.z + Math.sin(site.angle) * site.tilt * melt];
          p.point(top, 0.085, palette[8], 0.9 * fade, 0.25);
          p.glow(top, 0.26, palette[6], 0.08 * fade);
        }
      }
      if (t < RELEASE) {
        const k = clamp3(t / RELEASE), r = (0.38 + 0.8 * k * k) * (1 + Math.sin(t * 25) * 0.06);
        for (let arm = 0; arm < 6; arm++) {
          const angle = t * 5 + arm * TAU3 / 6;
          const a: Vec3 = [0, 1.95, 0];
          const b: Vec3 = [Math.cos(angle) * r, 1.95, Math.sin(angle) * r];
          p.line(a, b, 0.038, palette[7], 0.85, 0.16);
          for (const sign of [-1, 1]) {
            const start: Vec3 = [Math.cos(angle) * r * 0.65, 1.95, Math.sin(angle) * r * 0.65];
            const end: Vec3 = [start[0] + Math.cos(angle + sign * 0.75) * r * 0.28, 1.95, start[2] + Math.sin(angle + sign * 0.75) * r * 0.28];
            p.line(start, end, 0.025, palette[6], 0.75);
          }
        }
        p.point([0, 1.95, 0], 0.18, palette[8], 1, 0.4);
        p.glow([0, 1.95, 0], 1.6, palette[5], 0.22 + 0.16 * k);
      } else if (t < 0.92) {
        const releaseFade = 1 - smooth3(RELEASE, 0.92, t);
        p.point([0, 1.95, 0], 0.2 + releaseFade * 0.75, palette[8], releaseFade, 0.4);
        p.glow([0, 1.95, 0], 2.8, palette[6], 0.42 * releaseFade);
      }
      particles.draw(p);
      if (t > RELEASE && t < 3.5) {
        const k = (1 - smooth3(2.7, 3.5, t)) * (0.85 + 0.15 * Math.sin(t * 3));
        for (let i = 0; i < 6; i++) {
          const a = i * TAU3 / 6;
          p.glow([Math.cos(a) * fr * 0.72, 0.15, Math.sin(a) * fr * 0.72], 0.85, palette[4], 0.07 * k);
        }
      }
    },
  };
}
