/** A continuous, pre-fractured ice mesh becomes real tumbling debris, not an unrelated burst. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, smooth3, TAU3 } from "../math.js";
import { type FragmentMesh3D, Fragments3D, drawFragment3D } from "../fragments.js";
import { Particles3D } from "../particles.js";
import { Painter3D } from "../painter.js";

export interface IceShatter3DOptions { seed: number; size: number; force: number; palette: Color3D[] }
export const ICE_SHATTER_HIT = 0.96;
export const meta: EffectMeta3D<IceShatter3DOptions> = {
  id: "ice/ice-shatter-3d", name: "Ice Shatter 3D",
  description: "A solid hexagonal ice pillar develops branching stress cracks, splits into matching faceted pieces and scatters heavy tumbling fragments that bounce, settle and melt.",
  duration: 4.6, loop: false,
  stages: [{ at: 0, label: "FREEZE" }, { at: 0.4, label: "STRESS" }, { at: ICE_SHATTER_HIT, label: "FRACTURE" }, { at: 1.48, label: "TUMBLE" }, { at: 2.5, label: "SETTLE" }, { at: 3.45, label: "MELT" }],
  cues: [{ at: ICE_SHATTER_HIT, type: "hit", value: 1 }, { at: ICE_SHATTER_HIT, type: "flash", value: 0.6 }, { at: ICE_SHATTER_HIT, type: "shake", value: 0.3 }, { at: ICE_SHATTER_HIT, type: "sound", value: 1 }],
  options: { seed: 8713, size: 1, force: 1, palette: ["#102742", "#164663", "#236586", "#3686aa", "#58acc6", "#81d5e6", "#b8edf1", "#e9fcf9"] },
};
const DEFAULT_PALETTE = meta.options.palette;
const prismFaces: FragmentMesh3D["faces"] = [[0, 2, 1], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5], [3, 4, 5]];
interface Piece { mesh: FragmentMesh3D; center: Vec3; sector: number; upper: boolean; spin: Vec3; speed: number; life: number }

export function create(options: IceShatter3DOptions) {
  const rng = new Rng3D(options.seed), size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.35, 1.8);
  const force = clamp3(Number.isFinite(options.force) ? options.force : 1, 0.2, 1.6);
  const input = options.palette.length ? options.palette : DEFAULT_PALETTE;
  const palette = Array.from({ length: 8 }, (_, i) => input[Math.round(i / 7 * (input.length - 1))]);
  const pieces: Piece[] = [], debris = new Fragments3D(0.025, 32), dust = new Particles3D(0.03, 160);
  const turn = 0.18, low = 0.08, mid = 1.55, high = 3.12, peak = 4.08;
  const ring = (i: number, r: number, y: number): Vec3 => { const a = turn + i * TAU3 / 6; return [Math.cos(a) * r * size, y * size, Math.sin(a) * r * size]; };
  const seams = Array.from({ length: 6 }, () => mid + rng.range(-0.24, 0.24));
  for (let sector = 0; sector < 6; sector++) for (const upper of [false, true]) {
    const i = sector, j = (i + 1) % 6;
    const vertices: Vec3[] = upper
      ? [[0, mid * size, 0], ring(i, 0.98, seams[i]), ring(j, 0.98, seams[j]), [0, high * size, 0], ring(i, 0.8, high), ring(j, 0.8, high), [0.08 * size, peak * size, -0.03 * size]]
      : [[0, low * size, 0], ring(i, 0.78, low), ring(j, 0.78, low), [0, mid * size, 0], ring(i, 0.98, seams[i]), ring(j, 0.98, seams[j])];
    const center: Vec3 = [0, 1, 2].map(axis => vertices.reduce((sum, v) => sum + v[axis], 0) / vertices.length) as unknown as Vec3;
    const local: Vec3[] = vertices.map(v => [v[0] - center[0], v[1] - center[1], v[2] - center[2]]);
    const faces = upper ? [...prismFaces.slice(0, 7), [3, 4, 6], [4, 5, 6], [5, 3, 6]] as FragmentMesh3D["faces"] : prismFaces;
    pieces.push({ mesh: { vertices: local, faces }, center, sector, upper, spin: [rng.range(-4, 4), rng.range(-4, 4), rng.range(-4, 4)], speed: rng.range(0.82, 1.16), life: rng.range(2.9, 3.5) });
  }
  const cracks = Array.from({ length: 6 }, (_, i) => {
    const a = turn + (i + 0.5) * TAU3 / 6;
    const length = rng.range(2.5, 4.7) * size;
    return { a, length, split: rng.range(0.42, 0.63) };
  });
  let t = 0, fractured = false;
  function fracture() {
    for (const piece of pieces) {
      const angle = turn + (piece.sector + 0.5) * TAU3 / 6;
      const speed = (piece.upper ? 3.7 : 2.65) * piece.speed * force;
      debris.spawn({ mesh: piece.mesh, position: piece.center, velocity: [Math.cos(angle) * speed, (piece.upper ? 3.1 : 3.9) * piece.speed, Math.sin(angle) * speed], angularVelocity: piece.spin,
        palette, life: piece.life, gravity: 10.8, drag: 0.72, bounce: 0.2, friction: 0.64, meltStart: 0.68 });
    }
    for (let i = 0; i < 92; i++) {
      const angle = rng.range(0, TAU3), speed = rng.range(1.6, 7.8) * force;
      dust.spawn({ position: [rng.range(-0.55, 0.55) * size, rng.range(0.4, 3.4) * size, rng.range(-0.55, 0.55) * size],
        velocity: [Math.cos(angle) * speed, rng.range(1, 5), Math.sin(angle) * speed], radius: rng.range(0.015, 0.045), life: rng.range(0.35, 0.85),
        color: palette[rng.int(4, 7)], style: i % 4 === 0 ? "spark" : "point", drag: 1.5, gravity: 4.8, bounce: 0.08, emission: 0.04 });
    }
  }
  return {
    update(dt: number) {
      t += dt;
      // Existing fragments advance first: the matching mesh does not teleport on the fracture frame.
      debris.update(dt); dust.update(dt);
      if (!fractured && t + 1e-9 >= ICE_SHATTER_HIT) { fractured = true; fracture(); }
    },
    draw(p: Painter3D) {
      if (t <= 0 || t >= meta.duration - 1e-8) return;
      const age = t - ICE_SHATTER_HIT;
      if (!fractured) {
        const growth = smooth3(0, 0.28, t);
        for (const piece of pieces) {
          const center: Vec3 = [piece.center[0], piece.center[1] * growth, piece.center[2]];
          const mesh = { vertices: piece.mesh.vertices.map(v => [v[0], v[1] * growth, v[2]] as Vec3), faces: piece.mesh.faces };
          drawFragment3D(p, mesh, center, [0, 0, 0], palette);
        }
        // Cracks follow the real split planes on the six exterior faces.
        const stress = smooth3(0.4, 0.9, t);
        for (let i = 0; i < 6; i++) {
          const j = (i + 1) % 6, a = ring(i, 0.986, seams[i]), b = ring(j, 0.986, seams[j]);
          const progress = clamp3((stress * 1.6 - i * 0.09));
          const end: Vec3 = [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress, a[2] + (b[2] - a[2]) * progress];
          if (progress > 0) p.line(a, end, 0.018, palette[7], 1, 0.09 * stress);
          if (stress > 0.35) {
            const start = ring(i, 0.986, seams[i]);
            const top = ring(i, 0.81 + 0.17 * (1 - stress), seams[i] + (high - seams[i]) * smooth3(0.35, 1, stress));
            p.line(start, top, 0.016, palette[6], 1, 0.05);
            // A jagged stress branch stays attached to the actual sloped exterior facet.
            const shell = (u: number, v: number): Vec3 => {
              const lowerA = ring(i, 0.986, seams[i]), lowerB = ring(j, 0.986, seams[j]);
              const upperA = ring(i, 0.806, high), upperB = ring(j, 0.806, high);
              return [0, 1, 2].map(axis => (lowerA[axis] * (1 - u) + lowerB[axis] * u) * (1 - v) + (upperA[axis] * (1 - u) + upperB[axis] * u) * v) as unknown as Vec3;
            };
            const extension = smooth3(0.45, 0.97, stress);
            let previous = shell(0.45, 0);
            for (let step = 1; step <= 4; step++) {
              const next = shell(0.45 + Math.sin(step * 2.7 + i) * 0.12, step * 0.17 * extension);
              p.line(previous, next, 0.012, palette[6], 1, 0.04 * stress);
              previous = next;
            }
          }
        }
      }
      if (fractured) {
        // Angular floor fissures, not a circular energy-ring motif.
        const spread = smooth3(0, 0.32, age), groundFade = 1 - smooth3(1.1, 2.3, age);
        if (groundFade > 0) for (const c of cracks) {
          const r = c.length * spread, bend = c.a + 0.13;
          const root: Vec3 = [Math.cos(c.a) * 0.35, 0.032, Math.sin(c.a) * 0.35];
          const joint: Vec3 = [Math.cos(c.a) * r * c.split, 0.032, Math.sin(c.a) * r * c.split];
          const end: Vec3 = [Math.cos(bend) * r, 0.032, Math.sin(bend) * r];
          p.line(root, joint, 0.021 * groundFade, palette[3], 1, 0.02 * groundFade);
          p.line(joint, end, 0.012 * groundFade, palette[4], 1, 0.015 * groundFade);
          if (spread > 0.7) p.line(joint, [joint[0] + Math.cos(c.a - 0.65) * r * 0.24, 0.032, joint[2] + Math.sin(c.a - 0.65) * r * 0.24], 0.012 * groundFade, palette[3]);
        }
        debris.draw(p);
        dust.draw(p);
        const flash = 1 - smooth3(0, 0.095, age);
        if (flash > 0) {
          p.glow([0, 1.8 * size, 0], 2.1 * size, palette[5], flash * 0.24);
          for (let i = 0; i < 6; i++) {
            const a = i * TAU3 / 6;
            p.line([0, 1.7 * size, 0], [Math.cos(a) * 1.15 * flash, (1.7 + Math.sin(a) * 0.8) * size, Math.sin(a) * 1.15 * flash], 0.034 * flash, palette[7], 1, 0.12 * flash);
          }
        }
      }
    },
  };
}
