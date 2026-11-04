/** Folded void matter: a torn aperture pulls splinters inward, then seals from its tips. */
import { type EffectMeta3D } from '../fx.js';
import { type Color3D } from '../frame.js';
import { type Vec3, Rng3D, clamp3, smooth3, lerp3, TAU3 } from '../math.js';
import { createSweep3D, drawSweep3D, type SweepSection3D } from '../sweep.js';
import { Painter3D } from '../painter.js';
export interface VoidRift3DOptions { seed: number; size: number; pull: number; palette: Color3D[] }
export const VOID_RIFT_TEAR = 0.62;
export const VOID_RIFT_SEAL = 3.55;
export const meta: EffectMeta3D<VoidRift3DOptions> = {
  id: 'shadow/void-rift-3d', name: 'Void Rift 3D', duration: 5.2, loop: false,
  description: 'A jagged vertical tear unfolds thick obsidian lips and hooked tendrils. Solid splinters accelerate into its dark throat before the opening stitches itself shut from both tips.',
  stages: [{ at: 0, label: 'INCISION' }, { at: VOID_RIFT_TEAR, label: 'UNFOLD' }, { at: 1.25, label: 'DEVOUR' }, { at: VOID_RIFT_SEAL, label: 'SUTURE' }, { at: 4.5, label: 'SCAR' }],
  cues: [{ at: VOID_RIFT_TEAR, type: 'sound', value: 0.8 }, { at: VOID_RIFT_TEAR, type: 'shake', value: 0.18 }, { at: VOID_RIFT_SEAL, type: 'hit', value: 1 }, { at: VOID_RIFT_SEAL, type: 'shake', value: 0.28 }],
  options: { seed: 4967, size: 1, pull: 1, palette: ['#05050d', '#100d1d', '#211530', '#38234b', '#573566', '#815194', '#b57dcc', '#e8c1f1'] },
};
const DEFAULT_PALETTE = meta.options.palette;
interface Mote { start: number; life: number; a: number; radius: number; z: number; target: number; bend: number; size: number; spin: number }

export function create(options: VoidRift3DOptions) {
  const rng = new Rng3D(options.seed), size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.4, 1.5);
  const pull = clamp3(Number.isFinite(options.pull) ? options.pull : 1, 0.4, 1.7);
  const input = options.palette.length ? options.palette : DEFAULT_PALETTE;
  const pal = Array.from({ length: 8 }, (_, i) => input[Math.round(i / 7 * (input.length - 1))]);
  const teeth = Array.from({ length: 34 }, () => rng.range(-0.22, 0.22));
  const motes: Mote[] = Array.from({ length: 42 }, (_, i) => ({ start: 0.65 + i / 42 * 2.6 + rng.range(0, 0.12), life: rng.range(0.7, 1.4) / pull,
    a: rng.range(0, TAU3), radius: rng.range(2.8, 4.6), z: rng.range(-2.1, 2.1), target: rng.range(-1.3, 1.25), bend: rng.range(-0.7, 0.7), size: rng.range(0.09, 0.22), spin: rng.range(-5, 5) }));
  const hooks = Array.from({ length: 6 }, (_, i) => ({ side: i % 2 ? 1 : -1, v: 0.21 + Math.floor(i / 2) * 0.29 + rng.range(-0.035, 0.035), phase: rng.range(0, TAU3), length: rng.range(1.2, 2) }));
  for (const mote of motes) mote.life = Math.min(mote.life, 4.15 - mote.start);
  let t = 0;
  const world = (v: Vec3): Vec3 => [v[0] * size, v[1] * size, v[2] * size];
  function openness(v: number) {
    const unfurl = smooth3(VOID_RIFT_TEAR + Math.abs(v - 0.5) * 0.32, 1.16 + Math.abs(v - 0.5) * 0.32, t);
    const seal = smooth3(VOID_RIFT_SEAL + (0.5 - Math.abs(v - 0.5)) * 1.5, 4.1 + (0.5 - Math.abs(v - 0.5)) * 1.5, t);
    return unfurl * (1 - seal);
  }
  function lip(side: number, v: number): Vec3 {
    const taper = Math.sin(v * Math.PI), o = openness(v), slot = Math.min(15, Math.floor(v * 16)), f = v * 16 - slot;
    const offset = side > 0 ? 17 : 0, n = lerp3(teeth[offset + slot], teeth[offset + slot + 1], f);
    const breathing = 1 + Math.sin(t * 2.4 + v * 5) * 0.035;
    const tear = [0, 0.16, 0.4, 0.64, 0.5, 0.78, 0.92, 0.72, 0.86, 1, 0.7, 0.79, 0.55, 0.28, 0.4, 0.1, 0];
    const profile = lerp3(tear[slot], tear[slot + 1], f);
    return world([0.28 * Math.sin(v * 7.6 + 0.5) + side * (0.02 + (1.48 * profile * breathing + n * taper) * o),
      0.22 + 5.3 * v,
      0.2 * Math.sin(v * 6.4 + t * 0.65) + side * 0.18 * Math.sin(v * 8 + t * 0.8) * taper * o]);
  }
  function motePosition(m: Mote, u: number): Vec3 {
    const inward = u ** 2.6, a = m.a + m.bend * u * u, r = m.radius * (1 - inward);
    return world([Math.cos(a) * r, 2.85 + Math.sin(a) * r * 0.66 + m.target * inward, m.z * (1 - inward) + Math.sin(u * Math.PI) * m.bend - 0.35 * inward]);
  }
  return {
    update(dt: number) { t += dt; },
    draw(p: Painter3D) {
      if (t <= 0 || t >= meta.duration - 1e-8) return;
      const birth = smooth3(0, 0.28, t), fade = 1 - smooth3(4.6, 5.12, t);
      if (fade <= 0) return;
      // The initial incision propagates outward from the center, not an unrelated flash.
      if (t < 1.02 || t > 4.35) {
        const spread = t < 1.02 ? smooth3(0.03, 0.6, t) : 1 - smooth3(4.4, 5.05, t);
        for (let i = 0; i < 24; i++) {
          const v = i / 24, next = (i + 1) / 24;
          if (Math.abs(v - 0.5) > spread * 0.5) continue;
          p.line(lip(0, v), lip(0, next), 0.022 * size * fade, pal[t < 0.67 ? 6 : 4], birth * fade, 0.08 * fade);
        }
      }
      // An opaque concave throat, with front and back faces, occludes the scene from either orbit.
      // It is dark matter, not an emissive decal or camera-facing billboard.
      for (let i = 0; i < 32; i++) {
        const a = i / 32, b = (i + 1) / 32;
        if (openness((a + b) * 0.5) < 0.008) continue;
        const l0 = lip(-1, a), l1 = lip(-1, b), r0 = lip(1, a), r1 = lip(1, b);
        const c0: Vec3 = [(l0[0] + r0[0]) / 2, l0[1], (l0[2] + r0[2]) / 2 - 0.38 * size * openness(a)];
        const c1: Vec3 = [(l1[0] + r1[0]) / 2, l1[1], (l1[2] + r1[2]) / 2 - 0.38 * size * openness(b)];
        p.triangle(l0, l1, c0, pal[0], fade); p.triangle(l1, c1, c0, pal[0], fade);
        p.triangle(c0, c1, r0, pal[0], fade); p.triangle(c1, r1, r0, pal[0], fade);
      }
      for (const side of [-1, 1]) {
        const sections: SweepSection3D[] = [];
        for (let i = 0; i <= 32; i++) {
          const v = i / 32, o = openness(v), taper = Math.sin(v * Math.PI);
          sections.push({ position: lip(side, v), width: (0.012 + 0.39 * taper * o) * size * fade,
            thickness: (0.008 + 0.3 * taper * o) * size * fade, twist: side * (0.3 + v * 2.8) });
        }
        drawSweep3D(p, createSweep3D(sections, 5), pal.slice(2, 7), fade);
        // Discontinuous inner seams leave the throat black and preserve the folded surface.
        for (let i = 2; i < 30; i++) {
          const a = i / 32, b = (i + 1) / 32, o = openness(a);
          if (o < 0.02 || i % 8 === 0) continue;
          const shift = (v: Vec3): Vec3 => [v[0] - side * 0.11 * size, v[1], v[2] + 0.25 * size * o];
          p.line(shift(lip(side, a)), shift(lip(side, b)), 0.015 * size * o * fade, pal[i % 5 === 0 ? 6 : 5], fade, 0.04 * fade);
        }
      }
      // Thick hooked roots grow from the moving lip, rather than orbiting independently.
      for (const h of hooks) {
        const root = lip(h.side, h.v), o = openness(h.v), growth = smooth3(0.8, 1.65, t) * o;
        if (growth < 0.015) continue;
        const sections: SweepSection3D[] = [];
        for (let j = 0; j <= 14; j++) {
          const u = j / 14, sway = Math.sin(t * 2.0 - u * 4 + h.phase) * 0.13;
          const x = h.side * h.length * (Math.sin(u * Math.PI * 0.98) + sway * u) * growth;
          const y = (Math.sin(u * Math.PI) * 0.28 + (h.v - 0.5) * u * 1.6) * growth;
          const z = Math.sin(u * Math.PI * 1.3 + h.phase) * u * 0.85 * growth;
          sections.push({ position: [root[0] + x * size, root[1] + y * size, root[2] + z * size],
            width: 0.27 * (1 - u) ** 0.85 * growth * size, thickness: 0.14 * (1 - u) * growth * size, twist: h.side * u * 3 + h.phase });
        }
        drawSweep3D(p, createSweep3D(sections, 4, [0, 1, 0]), pal.slice(2, 7), fade);
      }
      // Every splinter keeps its identity and accelerates along one continuous inward trajectory.
      for (const m of motes) {
        const u = (t - m.start) / m.life;
        if (u <= 0 || u >= 1) continue;
        const pos = motePosition(m, u), visible = smooth3(0, 0.16, u) * (1 - smooth3(0.93, 1, u)) * fade;
        const r = m.size * size * visible, a = m.spin * u + m.a;
        if (u > 0.45) p.line(motePosition(m, Math.max(0, u - 0.055)), pos, 0.012 * size * visible, pal[4], visible, 0.015);
        const axis: Vec3 = [Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2, Math.cos(a * 0.6) * r];
        const tip: Vec3 = [pos[0] + axis[0], pos[1] + axis[1], pos[2] + axis[2]], tail: Vec3 = [pos[0] - axis[0], pos[1] - axis[1], pos[2] - axis[2]];
        const left: Vec3 = [pos[0] - Math.sin(a) * r, pos[1] + Math.cos(a) * r, pos[2]], front: Vec3 = [pos[0], pos[1], pos[2] + r];
        p.facet(tip, left, front, pal.slice(3, 7), visible); p.facet(tail, front, left, pal.slice(2, 6), visible);
      }
    },
  };
}
