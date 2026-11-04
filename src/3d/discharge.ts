/** Seeded, persistent electrical channels. Geometry is sampled once, never wiggled per frame. */
import { type Vec3, Rng3D, add3, sub3, mul3, len3, norm3, cross3, clamp3 } from "./math.js";
import { type Color3D } from "./frame.js";
import { Painter3D } from "./painter.js";

export interface Discharge3DOptions {
  start: Vec3;
  end: Vec3;
  seed?: number;
  /** Multiscale lateral displacement relative to each segment's length. */
  roughness?: number;
  /** Midpoint subdivision depth, bounded to 2..7. */
  detail?: number;
  /** Primary offshoot count, bounded to 0..12. */
  branches?: number;
}
export interface DischargeChannel3D {
  readonly points: readonly Vec3[];
  /** Arc length, normalized to 0..1, for distance-based growth and taper. */
  readonly distances: readonly number[];
  readonly length: number;
  readonly parent: number;
  readonly attachment: number;
  readonly generation: number;
  /** Root distance in main-channel lengths, so forks cannot lead their attachment. */
  readonly rootDistance: number;
  readonly strength: number;
}
export interface DischargeDraw3DOptions {
  /** Leader distance in main-channel lengths. Forks grow from their junctions. */
  progress?: number;
  /** 0..1 return-stroke energy; zero still allows a dim pre-ionized leader. */
  stroke?: number;
  /** Separate surviving leader/afterglow energy. Set zero to erase it completely. */
  residual?: number;
  radius?: number;
  palette?: readonly Color3D[];
  emission?: number;
}
export const DISCHARGE_PALETTE_3D: readonly Color3D[] = ["#172744", "#354c83", "#586fc0", "#809eec", "#bddcff", "#f2fbff"];
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add3(a, mul3(sub3(b, a), t));

/** A full branch tree in XYZ, with stable junctions, unequal lengths and narrower child channels. */
export function createDischarge3D(options: Discharge3DOptions): readonly DischargeChannel3D[] {
  for (const point of [options.start, options.end]) if (point.length !== 3 || !point.every(Number.isFinite)) throw new RangeError("Discharge endpoints must be finite XYZ coordinates");
  const distance = len3(sub3(options.end, options.start));
  if (distance < 1e-8) return [];
  const rng = new Rng3D(finite(options.seed, 1));
  const roughness = clamp3(finite(options.roughness, 0.19), 0, 0.6);
  const detail = Math.round(clamp3(finite(options.detail, 5), 2, 7));
  const count = Math.round(clamp3(finite(options.branches, 6), 0, 12));
  const direction = norm3(sub3(options.end, options.start));
  const side = norm3(cross3(direction, Math.abs(direction[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0]));
  const other = cross3(direction, side);
  const channels: DischargeChannel3D[] = [];
  function jagged(a: Vec3, b: Vec3, depth: number): Vec3[] {
    let points = [a, b];
    for (let level = 0; level < depth; level++) {
      const next: Vec3[] = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const first = points[i - 1], last = points[i], axis = norm3(sub3(last, first));
        const u = norm3(cross3(axis, Math.abs(axis[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0]));
        const v = cross3(axis, u), amplitude = len3(sub3(last, first)) * roughness;
        const mid = add3(mix(first, last, rng.range(0.36, 0.64)), add3(mul3(u, rng.range(-amplitude, amplitude)), mul3(v, rng.range(-amplitude, amplitude))));
        next.push(mid, last);
      }
      points = next;
    }
    return points;
  }
  function append(points: Vec3[], parent: number, attachment: number, generation: number, strength: number) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + len3(sub3(points[i], points[i - 1])));
    const length = distances[distances.length - 1];
    const rootDistance = parent < 0 ? 0 : channels[parent].rootDistance + channels[parent].distances[attachment] * channels[parent].length / channels[0].length;
    channels.push({ points, distances: distances.map(d => d / length), length, parent, attachment, generation, rootDistance, strength });
    return channels.length - 1;
  }
  append(jagged(options.start, options.end, detail), -1, 0, 0, 1);
  for (let i = 0; i < count; i++) {
    const main = channels[0], index = Math.round((0.12 + 0.7 * (i + rng.range(0.1, 0.85)) / Math.max(1, count)) * (main.points.length - 1));
    const root = main.points[index], angle = i * 2.399963229728653 + rng.range(-0.45, 0.45);
    const remaining = len3(sub3(options.end, root));
    const branchLength = Math.min(distance * rng.range(0.18, 0.44), remaining * 0.88);
    const outward = add3(mul3(side, Math.cos(angle)), mul3(other, Math.sin(angle)));
    const end = add3(root, mul3(norm3(add3(mul3(direction, rng.range(0.3, 0.78)), outward)), branchLength));
    const child = append(jagged(root, end, Math.max(2, detail - 1)), 0, index, 1, rng.range(0.5, 0.74));
    // Uneven secondary forks: never a symmetric tree or equal-length starburst.
    if (i % 3 !== 1) {
      const parent = channels[child], junction = rng.int(1, parent.points.length - 2), start = parent.points[junction];
      const branchAxis = norm3(sub3(end, root));
      const twigDirection = norm3(add3(mul3(branchAxis, 0.6), add3(mul3(side, rng.range(-0.8, 0.8)), mul3(other, rng.range(-0.8, 0.8)))));
      append(jagged(start, add3(start, mul3(twigDirection, branchLength * rng.range(0.2, 0.5))), Math.max(2, detail - 2)), child, junction, 2, parent.strength * 0.56);
    }
  }
  return channels;
}

/** Return strokes rise sharply and decay, with deliberately uneven intervals. */
export function dischargePulse3D(time: number, strokes: readonly number[], decay = 0.085): number {
  if (!Number.isFinite(time) || !Number.isFinite(decay) || decay <= 0) return 0;
  let energy = 0;
  for (let i = 0; i < strokes.length; i++) {
    const age = time - strokes[i];
    if (age >= 0) energy += (i === 0 ? 1 : 0.72 + 0.12 * (i % 2)) * Math.exp(-Math.max(0, age - 0.025) / decay);
  }
  return clamp3(energy);
}

/** Crisp channels with width/current taper; color-only afterglow does not become a soft neon hose. */
export function drawDischarge3D(painter: Painter3D, channels: readonly DischargeChannel3D[], options: DischargeDraw3DOptions = {}) {
  if (!channels.length) return;
  const progress = Math.max(0, finite(options.progress, 1.5)), stroke = clamp3(finite(options.stroke, 1));
  const residual = clamp3(finite(options.residual, 0.12)), radius = Math.max(0, finite(options.radius, 0.045));
  const emission = Math.max(0, finite(options.emission, 0.16));
  const palette = options.palette?.length ? options.palette : DISCHARGE_PALETTE_3D;
  const color = (t: number) => palette[Math.round(clamp3(t) * (palette.length - 1))];
  if (radius <= 0 || (stroke <= 0 && residual <= 0) || progress <= 0) return;
  // Each channel keeps its geometry throughout the discharge. Only growth and current change.
  for (let c = channels.length - 1; c >= 0; c--) {
    const channel = channels[c], revealed = (progress - channel.rootDistance) * channels[0].length / channel.length;
    if (revealed <= 0) continue;
    const forkDecay = channel.generation === 0 ? 1 : stroke ** (0.35 * channel.generation);
    for (let i = 1; i < channel.points.length; i++) {
      const from = channel.distances[i - 1], to = channel.distances[i];
      if (from >= revealed) break;
      const u = (from + Math.min(to, revealed)) * 0.5, taper = channel.generation === 0 ? 0.82 + 0.18 * (1 - u) : 1 - 0.68 * u;
      const conductance = 0.86 + 0.14 * Math.sin(i * 1.91 + c * 2.73) ** 2;
      const energy = (stroke * forkDecay + residual * 0.35) * channel.strength * taper * conductance;
      if (energy < 0.025) continue;
      const start = channel.points[i - 1], end = revealed < to ? mix(start, channel.points[i], clamp3((revealed - from) / (to - from))) : channel.points[i];
      const width = radius * (0.52 + stroke * 0.75) * channel.strength * taper;
      // White is reserved for a brief high-current trunk; branch tips cool into violet/blue.
      const tone = channel.generation === 0 ? 0.18 + Math.sqrt(energy) * 0.82 : 0.12 + Math.sqrt(energy) * 0.7;
      painter.line(start, end, width, color(tone), 1, emission * energy);
    }
  }
}
