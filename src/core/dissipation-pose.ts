/** A continuous terminal pose for matter whose source has stopped.
 * Analytic staging only: no collision, physical cooling or implicit particle emission. */
import { smooth } from './math.js';
import type { Point } from './painter.js';

export interface DissipationPoseOptions2D {
  start: number;
  duration: number;
  position: readonly [number, number];
  size: readonly [number, number];
  angle?: number;
  /** Total authored displacement over the handoff. Default [0,0] invents no motion. */
  drift?: readonly [number, number];
  /** Final longitudinal/transverse scale. Positive; default [0.65,0.85]. */
  endScale?: readonly [number, number];
  /** Normalized point where opacity starts to fade. Default 0.1; in [0,1). */
  fadeStart?: number;
}
export interface DissipationPoseSample2D {
  time: number;
  fraction: number;
  position: Point;
  size: Point;
  angle: number;
  opacity: number;
}

/** Snapshot the complete ending pose, then keep its position, size and opacity continuous
 * at start. Drift/deformation have zero endpoint velocity. The original renderer may keep
 * evolving at sample.time; this does not replace matter with an unrelated ending symbol.
 * Pure direct-time sampling returns undefined outside [start,end), including exact death. */
export function createDissipationPose2D(options: DissipationPoseOptions2D) {
  const { start, duration, angle = 0, fadeStart = 0.1 } = options;
  if (![start, duration, angle, fadeStart].every(Number.isFinite) || duration <= 0
    || !Number.isFinite(start + duration) || !(start + duration > start) || fadeStart < 0 || fadeStart >= 1)
    throw new RangeError('Invalid dissipation timing, angle or fade');
  const point = (p: readonly [number, number], label: string): Point => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
      throw new RangeError(`Dissipation ${label} must be finite [x,y]`);
    return [p[0], p[1]];
  };
  const position = point(options.position, 'position'), size = point(options.size, 'size');
  const drift = point(options.drift === undefined ? [0, 0] : options.drift, 'drift');
  const endScale = point(options.endScale === undefined ? [0.65, 0.85] : options.endScale, 'endScale');
  if (size.some(x => x <= 0) || endScale.some(x => x <= 0)
    || !size.every((x, i) => Number.isFinite(x * endScale[i]) && x * endScale[i] > 0)
    || !position.every((x, i) => Number.isFinite(x + drift[i])))
    throw new RangeError('Dissipation sizes/scales must be positive and endpoints representable');
  const end = start + duration, span = end - start;
  if (!Number.isFinite(span)) throw new RangeError('Dissipation span is not representable');
  const interpolate = (a: number, b: number, u: number) => u <= 0.5 ? a + (b - a) * u : b + (a - b) * (1 - u);
  const endSize: Point = [size[0] * endScale[0], size[1] * endScale[1]];
  return Object.freeze({ start, end,
    sample(time: number): DissipationPoseSample2D | undefined {
      if (!Number.isFinite(time)) throw new RangeError('Dissipation sample time must be finite');
      if (time < start || time >= end) return;
      const progress = (time - start) / span, ease = smooth(0, 1, progress);
      return { time, fraction: progress, angle,
        position: [position[0] + drift[0] * ease, position[1] + drift[1] * ease],
        size: [interpolate(size[0], endSize[0], ease), interpolate(size[1], endSize[1], ease)],
        opacity: 1 - smooth(fadeStart, 1, progress) };
    },
  });
}
