/** Anchor-preserving preparation of an authored body, independent of its material renderer. */
import { smooth } from './math.js';
import { createTimingCurve } from './timing-curve.js';
import type { Point } from './painter.js';

export interface IgnitionScaleKey2D {
  /** Normalized time in [0,1]; keys must start at 0 and finish at 1. */
  at: number;
  /** Positive longitudinal/transverse scales. The final scale must be [1,1]. */
  scale: readonly [number, number];
}
export interface IgnitionPoseOptions2D {
  start: number;
  duration: number;
  /** Mature body center and half-extents, in the caller's coordinate space. */
  position: readonly [number, number];
  size: readonly [number, number];
  angle?: number;
  /** Body-local normalized anchor, in [-1,1]. [-1,0] keeps a plume's root fixed. */
  anchor?: readonly [number, number];
  /** Shape-preserving scale keys; endpoint velocities are zero. Defaults to a small growing core. */
  keys?: readonly IgnitionScaleKey2D[];
  /** Mature opacity. Fade-in occupies the first quarter of preparation. Default 1. */
  opacity?: number;
}

/** Prepare the actual upcoming body instead of swapping an unrelated charge symbol for it.
 * Scale is applied around a fixed local anchor, so a growing root does not lift off its source.
 * Sampling is pure and seekable. Before start it returns undefined; at/after end it holds the
 * mature pose (not the effect's lifetime). No particles, light, motion or physics are implied. */
export function createIgnitionPose2D(options: IgnitionPoseOptions2D) {
  const { start, duration, angle = 0, opacity = 1 } = options;
  const end = start + duration, span = end - start;
  if (![start, duration, end, span, angle, opacity].every(Number.isFinite) || duration <= 0 || span <= 0
    || opacity < 0 || opacity > 1) throw new RangeError('Invalid ignition timing, angle or opacity');
  const point = (value: readonly [number, number], label: string): Point => {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite))
      throw new RangeError(`Ignition ${label} must be finite [x,y]`);
    return [value[0], value[1]];
  };
  const position = point(options.position, 'position'), size = point(options.size, 'size');
  const anchor = point(options.anchor === undefined ? [0, 0] : options.anchor, 'anchor');
  if (size.some(v => v <= 0) || anchor.some(v => Math.abs(v) > 1)) throw new RangeError('Invalid ignition size/anchor');
  const input = options.keys === undefined ? [{ at: 0, scale: [0.15, 0.35] }, { at: 1, scale: [1, 1] }] : options.keys;
  if (!Array.isArray(input) || input.length < 2 || input.length > 32) throw new RangeError('Ignition needs 2..32 scale keys');
  const keys = input.map((key, index) => {
    if (!key || !Number.isFinite(key.at) || key.at < 0 || key.at > 1 || (index > 0 && key.at <= input[index - 1].at))
      throw new RangeError('Ignition key times must increase within [0,1]');
    const scale = point(key.scale as Point, 'key scale');
    if (scale.some((v, i) => v <= 0 || !Number.isFinite(size[i] * v) || size[i] * v <= 0))
      throw new RangeError('Ignition scales must be positive and representable');
    return { at: key.at, scale };
  });
  if (keys[0].at !== 0 || keys.at(-1)!.at !== 1 || keys.at(-1)!.scale.some(v => v !== 1))
    throw new RangeError('Ignition keys must cover [0,1] and finish at scale [1,1]');
  const curves = [0, 1].map(axis => createTimingCurve(keys.map((key, i) => ({
    time: key.at, value: size[axis] * key.scale[axis], ...(i === 0 || i === keys.length - 1 ? { velocity: 0 } : {}),
  }))));
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const pose = (time: number, fraction: number) => {
    const current: Point = fraction >= 1 ? [...size] : [curves[0].sample(fraction).value, curves[1].sample(fraction).value];
    const dx = (size[0] - current[0]) * anchor[0], dy = (size[1] - current[1]) * anchor[1];
    const center: Point = [position[0] + cs * dx - sn * dy, position[1] + sn * dx + cs * dy];
    if (!center.every(Number.isFinite) || current.some(v => !Number.isFinite(v) || v <= 0))
      throw new RangeError('Ignition pose is not representable');
    return { time, fraction, position: center, size: current, angle, opacity: opacity * smooth(0, 0.25, fraction) };
  };
  // Catch invalid key transforms at construction, before a renderer begins drawing.
  for (const key of keys) pose(start, key.at);
  return Object.freeze({ start, end,
    sample(time: number) {
      if (!Number.isFinite(time)) throw new RangeError('Ignition sample time must be finite');
      if (time < start) return;
      return pose(time, time >= end ? 1 : (time - start) / span);
    },
  });
}
