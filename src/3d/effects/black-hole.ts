/**
 * Black Hole 3D — a genuine procedural 3D VFX, not a billboard/sprite.
 * A depth-occluding event horizon, warped accretion disk, camera-relative
 * photon sphere, 3D gas streamers, and seeded inspiralling rock fragments.
 *
 * Style: the POKU Pixel FX workflow of procedural math + choreographed beats,
 * seeded variation, hard palette steps, ordered dither and separate emission.
 * The lensing pass is an artistic, pixel-sampled approximation, not a GR solver.
 */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D } from "../frame.js";
import type { Vec3 } from "../math.js";
import { clamp3, outBack3, smooth3, TAU3, Rng3D } from "../math.js";
import { Painter3D } from "../painter.js";

export interface BlackHole3DOptions {
  seed: number;
  /** Event-horizon radius in world units. */
  radius: number;
  /** Diameter of the outer spiral / accretion area, relative to radius. */
  reach: number;
  /** Overall emission / debris amount. */
  intensity: number;
  /** Ordered dark-to-bright colors, from void violet to cyan-hot plasma. */
  palette: Color3D[];
}

export const meta: EffectMeta3D<BlackHole3DOptions> = {
  id: "shadow/black-hole-3d",
  name: "Black Hole 3D",
  description: "A singularity forms in 3D, bends nearby light, draws plasma into a luminous accretion disk, captures spinning debris, then collapses.",
  duration: 7.0,
  loop: false,
  options: {
    seed: 4318,
    radius: 1.24,
    reach: 6.9,
    intensity: 1,
    palette: [
      "#080513", "#1a0b31", "#2f155b", "#51218c", "#7d31be", "#aa48dc",
      "#df6efa", "#ff9cf6", "#ffdafa", "#83e9ff", "#ffffff",
    ],
  },
  stages: [
    { at: 0, label: "CONDENSE" },
    { at: 0.65, label: "SINGULARITY" },
    { at: 1.3, label: "ACCRETION" },
    { at: 4.3, label: "INSPIRAL" },
    { at: 5.6, label: "COLLAPSE" },
    { at: 6.45, label: "EVAPORATE" },
  ],
  cues: [
    { at: 0.68, type: "flash", value: 0.65 },
    { at: 0.77, type: "shake", value: 0.15 },
    { at: 1.0, type: "sound", value: 1 },
    { at: 5.65, type: "shake", value: 0.22 },
    { at: 6.07, type: "flash", value: 0.5 },
  ],
};

const CY = 2.1;
const TAU = TAU3;
const clamp = clamp3;
const curve = (a: number, b: number, x: number) => smooth3(a, b, x);
const sat = (x: number) => clamp(x, 0, 1);

type Debris = {
  a: number; r: number; speed: number; fall: number; size: number; y: number;
  wobble: number; phase: number; captured: boolean;
};
type Dust = {
  r: number; angle: number; height: number; speed: number; inward: number;
  size: number; life: number; max: number; color: number; seed: number;
};

const arcColor = (pal: readonly Color3D[], v: number) => pal[Math.min(pal.length - 1, Math.max(0, Math.floor(v * (pal.length - 1))))];

/** The accretion plane is tilted in real world XYZ, not baked into camera coordinates. */
function diskPos(r: number, a: number, t: number, lift = 0): Vec3 {
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const tilt = 0.29 * x - 0.17 * z;
  const flutter = Math.sin(a * 5.0 - t * 3 + r * 4) * 0.055 * Math.min(1, r / 2);
  return [x, CY + tilt + flutter + lift, z];
}

/** Low-poly tumbling meteoroid with three discrete lit facets and jagged silhouettes. */
function rock(p: Painter3D, pos: Vec3, size: number, angle: number, palette: readonly Color3D[], emphasis: number) {
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const tips: Vec3[] = [];
  const count = 6;
  for (let j = 0; j < count; j++) {
    const a = j * TAU / count + angle, r = size * (j % 2 ? 0.75 : 1.12);
    tips.push([pos[0] + Math.cos(a) * r, pos[1] + (j % 3 - 1) * size * 0.5, pos[2] + Math.sin(a) * r]);
  }
  const top: Vec3 = [pos[0] + cs * size * 0.17, pos[1] + size * 1.1, pos[2] + sn * size * 0.1];
  const bottom: Vec3 = [pos[0] - sn * size * 0.2, pos[1] - size * 0.8, pos[2] - cs * size * 0.1];
  const ramp = [palette[1], palette[2], palette[3], palette[4], palette[6]];
  for (let j = 0; j < count; j++) {
    p.facet(tips[j], tips[(j + 1) % count], top, ramp);
    p.facet(tips[(j + 1) % count], tips[j], bottom, ramp);
  }
  if (emphasis > 0.35) {
    p.line(tips[0], top, 0.018, palette[7], emphasis * 0.7, 0.07);
    p.line(tips[1], tips[2], 0.017, palette[5], emphasis * 0.4, 0.01);
  }
}

/** Color-quantized toroidal gas layers, with uneven azimuthal brightness. */
function disk(p: Painter3D, t: number, R: number, radiance: number, palette: readonly Color3D[]) {
  if (radiance < 0.004) return;
  const resolution = 94;
  // Fill the disk with layered solid facets rather than semitransparent 2D sprites.
  for (let layer = 0; layer < 7; layer++) {
    const inner = R * (1.11 + layer * 0.168);
    const outer = inner + R * (layer < 2 ? 0.205 : 0.27);
    const shift = layer * 0.64 + t * (1.65 + layer * 0.13);
    const lift = (layer - 3) * 0.009;
    for (let j = 0; j < resolution; j++) {
      const a0 = j * TAU / resolution + shift * 0.018;
      const a1 = (j + 1) * TAU / resolution + shift * 0.018;
      const wave = Math.sin(a0 * 7 - t * 4.7 + layer * 2.1) + 0.5 * Math.sin(a0 * 17 + t * 7 + layer);
      const heat = sat(0.45 + 0.28 * wave + 0.09 * Math.sin(t * 4 + layer));
      const index = layer < 2 ? 6 : layer < 4 ? 4 : 2;
      const col = arcColor(palette, (index + heat * (layer < 3 ? 3.5 : 3.0)) / (palette.length - 1));
      const alpha = radiance * (layer < 4 ? 1.05 : 0.77) * (0.88 + heat * 0.12);
      const emission = radiance * (layer < 3 ? 0.12 : 0.045) * heat;
      const A = diskPos(inner, a0, t, lift), B = diskPos(outer, a0, t, lift);
      const C = diskPos(inner, a1, t, lift), D = diskPos(outer, a1, t, lift);
      p.triangle(A, B, C, col, alpha, emission);
      p.triangle(C, B, D, col, alpha, emission);
    }
  }
  // Moving slender plasma strands: a persistent visual direction without uniform rings.
  for (let ribbon = 0; ribbon < 5; ribbon++) {
    const radius = R * (1.18 + ribbon * 0.34);
    const angleShift = t * (1.15 + 0.25 * ribbon) + ribbon * 1.37;
    const segments = 87;
    const opacity = radiance * (ribbon < 3 ? 0.9 : 0.56);
    const color = palette[[8, 7, 9, 6, 5][ribbon]];
    const hot = palette[[10, 8, 10, 7, 6][ribbon]];
    for (let k = 0; k < segments; k++) {
      const a0 = TAU * k / segments + angleShift;
      const a1 = TAU * (k + 1) / segments + angleShift;
      const pulse = Math.sin(4 * a0 - t * 3.7 + ribbon * 1.9);
      // Break the strand in a controlled beat: bright tapered, glowing streaks.
      if (pulse < -0.54) continue;
      const thickness = R * (0.035 + 0.018 * Math.max(0, pulse));
      const inner = diskPos(radius - thickness, a0, t, 0.064);
      const outer = diskPos(radius + thickness, a0, t, 0.064);
      const inner2 = diskPos(radius - thickness, a1, t, 0.064);
      const outer2 = diskPos(radius + thickness, a1, t, 0.064);
      const c = pulse > 0.72 ? hot : color;
      p.triangle(inner, outer, inner2, c, opacity, radiance * 0.14);
      p.triangle(inner2, outer, outer2, c, opacity, radiance * 0.14);
    }
  }
}

/** Broad wisps are 3D strips, rotating with the vortex, not flat texture quads. */
function cosmicArms(p: Painter3D, t: number, reach: number, alpha: number, pal: readonly Color3D[]) {
  if (alpha < 0.004) return;
  for (let arm = 0; arm < 6; arm++) {
    const aStart = arm * TAU / 6 + t * (0.36 + arm * 0.017);
    const r0 = reach * (0.82 + arm * 0.031);
    const steps = 33;
    const strand = (q: number, edge: number): Vec3 => {
      const theta = aStart + q * (2.85 + 0.21 * arm);
      const r = r0 * (1 - 0.72 * q) + edge * Math.sin(Math.PI * q);
      const lift = Math.sin(theta * 2 + t + arm * 0.7) * 0.53 + (arm % 2 ? 0.34 : -0.26);
      return [Math.cos(theta) * r, CY + lift + (arm % 3 - 1) * q * 0.8, Math.sin(theta) * r];
    };
    for (let i = 0; i < steps; i++) {
      const q0 = i / steps, q1 = (i + 1) / steps;
      const v = Math.sin(Math.PI * q0);
      const width = (0.2 + 1.04 * Math.max(0, v)) * (0.82 + 0.18 * Math.sin(q0 * 24 + arm * 7));
      const a = strand(q0, -width), b = strand(q0, width);
      const c = strand(q1, -width), d = strand(q1, width);
      const shade = 2 + ((arm * 7 + Math.floor(i / 4)) % 4);
      const opacity = alpha * (0.78 + v * 0.16) * (1 - 0.20 * q0);
      p.triangle(a, b, c, pal[shade], opacity, 0.01 * alpha);
      p.triangle(c, b, d, pal[shade], opacity, 0.01 * alpha);
      if (i % 3 === 0 && v > 0.35) {
        p.line(strand(q0, width * 0.7), strand(q1, width * 0.7), 0.025, pal[arm % 3 ? 5 : 9], alpha * 0.43 * v, 0.055 * alpha);
      }
    }
  }
}

/** View-facing photon ring is intentionally a camera-space optical illusion; the
 * disk, gas and debris remain in real world XYZ and respond to orbit. */
function photonRings(p: Painter3D, radius: number, t: number, strength: number, pal: readonly Color3D[]) {
  if (strength < 0.002) return;
  const { yaw, elevation } = p.camera;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
  const right: Vec3 = [cy, 0, -sy], up: Vec3 = [-sy * se, ce, -cy * se];
  const point = (a: number, r: number): Vec3 => [
    right[0] * Math.cos(a) * r + up[0] * Math.sin(a) * r,
    CY + right[1] * Math.cos(a) * r + up[1] * Math.sin(a) * r,
    right[2] * Math.cos(a) * r + up[2] * Math.sin(a) * r,
  ];
  // Thin white/pink arcs separated by cold chromatic glints; black core stays black.
  for (let k = 0; k < 3; k++) {
    const r = radius * (1.044 + k * 0.051), segments = 124;
    for (let i = 0; i < segments; i++) {
      const a = i * TAU / segments, b = (i + 1) * TAU / segments;
      const flicker = Math.sin(a * (8 + k) + t * (2.5 + k * 1.5) + k * 3);
      if (k > 0 && flicker < -0.55) continue;
      const col = k === 0 ? pal[flicker > 0.45 ? 8 : 6] : k === 1 ? pal[flicker > 0.6 ? 9 : 5] : pal[3];
      p.line(point(a, r), point(b, r), k === 0 ? 0.057 : 0.028, col, strength * (k === 0 ? 0.96 : 0.44), strength * (k === 0 ? 0.18 : 0.045));
    }
  }
}

export function create(options: BlackHole3DOptions) {
  const rng = new Rng3D(options.seed);
  const palette = options.palette;
  const R = Math.max(0.4, options.radius);
  const reach = Math.max(R * 2.7, options.reach);
  const intensity = clamp(options.intensity, 0.1, 2.5);
  const debris: Debris[] = [];
  const dust: Dust[] = [];
  for (let i = 0; i < Math.round(70 * intensity); i++) {
    debris.push({
      a: rng.range(0, TAU), r: rng.range(R * 2.8, reach * 1.18), speed: rng.range(0.55, 1.38),
      fall: rng.range(0.13, 0.33), size: rng.range(0.045, 0.23) * (i % 17 === 0 ? 2.35 : 1),
      y: rng.range(-0.9, 0.9), wobble: rng.range(0.05, 0.45), phase: rng.range(0, TAU),
      captured: false,
    });
  }
  const stars = Array.from({ length: 100 }, () => ({
    a: rng.range(0, TAU), d: rng.range(reach * 0.9, reach * 1.4),
    y: rng.range(-3.3, 4.3), size: rng.range(0.018, 0.054), phase: rng.range(0, TAU),
  }));
  let t = 0, particleAccumulator = 0;
  const growth = () => curve(0.12, 1.14, t);
  const dispersal = () => 1 - curve(5.78, 7.0, t);
  const born = () => growth() * dispersal();
  const posOf = (r: Debris): Vec3 => {
    const rd = r.r * Math.exp(-r.fall * Math.max(0, t - 0.85));
    const speedup = (r.r / Math.max(R * 1.15, rd)) ** 0.72;
    const a = r.a + t * r.speed * speedup;
    const y = CY + r.y * Math.max(0.15, rd / r.r) + r.wobble * Math.sin(a * 2 + r.phase);
    return [Math.cos(a) * rd, y, Math.sin(a) * rd];
  };
  function emit() {
    const r = rng.range(R * 2.4, reach * 1.17);
    const life = rng.range(0.65, 1.85);
    dust.push({
      r, angle: rng.range(0, TAU), height: rng.range(-0.35, 0.45),
      speed: rng.range(0.8, 2.2), inward: rng.range(0.3, 0.8),
      size: rng.range(0.018, 0.064), life, max: life,
      color: rng.int(3, 10), seed: rng.range(0, TAU),
    });
  }
  return {
    update(dt: number) {
      t += dt;
      // Time-continuous spawn rate at a deterministic fixed simulation step.
      if (t > 0.4 && t < 5.6) {
        particleAccumulator += dt * (54 * intensity);
        while (particleAccumulator >= 1) {
          particleAccumulator -= 1;
          if (dust.length < 260) emit();
        }
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const m = dust[i];
        m.life -= dt;
        if (m.life <= 0 || m.r <= R * 0.86) { dust.splice(i, 1); continue; }
        const orbit = m.speed * Math.sqrt(Math.max(0.6, reach / m.r));
        m.angle += orbit * dt;
        m.r *= Math.exp(-m.inward * dt);
        m.height *= Math.exp(-0.65 * dt);
      }
      for (const r of debris) if (!r.captured && t > 0.8) {
        const point = posOf(r);
        const d = Math.hypot(point[0], point[1] - CY, point[2]);
        if (d < R * 1.02) r.captured = true;
      }
    },
    draw(p: Painter3D) {
      if (t >= 7) return;
      const k = born(), collapse = curve(5.45, 6.8, t);
      const radius = R * (0.08 + 0.92 * outBack3(t / 1.0)) * (1 - 0.84 * collapse);
      const drawRadius = Math.max(0.001, radius);
      const energy = k * (0.88 + 0.12 * Math.sin(t * 4.8));
      const extended = reach * (0.4 + 0.6 * growth()) * (1 - 0.68 * collapse);
      // Sparse fixed background stars provide a reference that visibly bends.
      for (const star of stars) {
        const a = star.a + Math.sin(t * 0.3 + star.phase) * 0.025;
        const sp: Vec3 = [Math.cos(a) * star.d, CY + star.y, Math.sin(a) * star.d];
        p.point(sp, star.size, palette[star.phase > 3 ? 9 : 7], 0.32 * k, 0.035 * k);
      }
      cosmicArms(p, t, extended, k * intensity, palette);
      disk(p, t, drawRadius, energy, palette);
      // Animated stochastic orbital material, depth-tested in 3D.
      for (const m of dust) {
        const life = m.life / m.max;
        const a = m.angle + m.seed * 0.04;
        const wobble = 0.21 * Math.sin(a * 3 + m.seed);
        const h = CY + m.height + (0.29 * Math.cos(a) - 0.17 * Math.sin(a)) * m.r + wobble;
        const pos: Vec3 = [Math.cos(a) * m.r, h, Math.sin(a) * m.r];
        const aa = Math.min(1, life * 3, (1 - life) * 6) * energy;
        const col = palette[m.color];
        if (m.color > 7) {
          const b = a - Math.min(0.3, m.speed * 0.055);
          const tail: Vec3 = [Math.cos(b) * (m.r + m.size), h, Math.sin(b) * (m.r + m.size)];
          p.line(pos, tail, m.size * 0.65, col, aa, aa * 0.11);
        } else p.point(pos, m.size, col, aa, aa * 0.13);
      }
      // Actual rocks, not pre-painted debris cards; each one has multiple 3D facets.
      for (const r of debris) {
        if (r.captured || t < 0.6) continue;
        const pos = posOf(r), distance = Math.hypot(pos[0], pos[2]);
        if (distance < drawRadius * 1.02) continue;
        const edgeFade = 1 - curve(6.1, 7, t);
        const scale = Math.min(1, (distance - drawRadius) / (R * 0.6));
        const alpha = edgeFade * scale;
        if (alpha < 0.02) continue;
        // Solid shapes scale into the event horizon when captured.
        rock(p, pos, r.size * Math.min(1.3, 0.85 + distance / reach * 0.4) * scale,
          r.a + t * r.speed * 1.2, palette, alpha);
      }
      // Sample the already-rendered light/color through a screen-space lens field.
      if (k > 0.02) p.lensWarp([0, CY, 0], drawRadius * 0.9, drawRadius * 2.65, k * 0.76);
      // True depth-occluding black event horizon, with selective indigo silhouette.
      if (radius > 0.01) p.sphere([0, CY, 0], radius, palette[0], palette[1]);
      // Photons circle the shadow in a camera-facing optical ring.
      photonRings(p, radius, t, energy, palette);
      // A few localized light sources. Glow never fills the dark event horizon.
      if (energy > 0.01) {
        const flash = Math.exp(-(((t - 0.77) / 0.095) ** 2)) * energy;
        for (let i = 0; i < 4; i++) {
          const a = t * 1.7 + i * TAU / 4;
          const rr = drawRadius * (1.45 + i * 0.17);
          const pos = diskPos(rr, a, t, 0.12);
          p.glow(pos, drawRadius * (0.48 + flash), palette[i % 2 ? 6 : 9], (0.05 + flash * 0.18) * energy);
        }
      }
      // Contraction ends with a deliberately restrained white/magenta burst.
      const transient = Math.exp(-(((t - 6.05) / 0.105) ** 2)) * k;
      if (transient > 0.04) {
        p.ring(drawRadius * 2.2, 0.07, palette[9], transient, transient * 0.14, CY + 0.12, 74);
      }
    },
  };
}
