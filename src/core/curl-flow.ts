/** Shared 2D spatial curl force for stylized particle advection. Not a fluid solver. */
import { lerp, rand } from './math.js';
import type { Point } from './painter.js';
export interface CurlFlowOptions2D {
  seed?: number;
  /** Main vortex scale in local pixels. */
  scale?: number;
  /** Acceleration scale in pixels/second squared, not an instantaneous position offset. */
  strength?: number;
  /** Translation of the field in pixels/second. Particles sample a common world-time field. */
  drift?: readonly [number, number];
}
export type ParticleFlow2D = (x: number, y: number, time: number) => readonly [number, number];

/** Reuse only the four exact lattice values of the most recently sampled cell. Each octave
 * has its own bounded cache. Interpolation and arithmetic match noise2 exactly: no field grid,
 * quantization, derivative approximation change, or dependence on previous sample order. */
function cachedNoise2(seed: number) {
  let cellX = NaN, cellY = NaN, a = 0, b = 0, c = 0, d = 0;
  return (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    if (ix !== cellX || iy !== cellY) {
      a = rand(ix, iy, seed); b = rand(ix + 1, iy, seed);
      c = rand(ix, iy + 1, seed); d = rand(ix + 1, iy + 1, seed);
      cellX = ix; cellY = iy;
    }
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
  };
}

/** The perpendicular gradient of one continuous seeded stream function. Nearby particles
 * receive related forces regardless of particle ID, birth time, or emitter role. */
export function createCurlFlow2D(options: CurlFlowOptions2D = {}): ParticleFlow2D {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid curl flow options');
  const { seed = 1, scale = 28, strength = 35, drift = [0, -12] } = options;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(scale) || scale < 0.25 || scale > 4096
    || !Number.isFinite(strength) || strength < 0 || strength > 10000 || !Array.isArray(drift) || drift.length !== 2
    || !drift.every(Number.isFinite) || drift.some(v => Math.abs(v) > 10000)) throw new RangeError('Invalid curl flow options');
  const [vx, vy] = drift, e = 0.001;
  const broad = cachedNoise2(seed), fine = cachedNoise2(seed ^ 0x631a);
  const stream = (x: number, y: number) => broad(x, y) + 0.18 * fine(x * 2.1 + 17, y * 2.1 - 11);
  return (x, y, time): Point => {
    const a = (x - time * vx) / scale, b = (y - time * vy) / scale;
    if (![x, y, time, a, b].every(Number.isFinite)) throw new RangeError('Curl flow sample must be finite');
    return [(stream(a, b + e) - stream(a, b - e)) / (2 * e) * strength,
      -(stream(a + e, b) - stream(a - e, b)) / (2 * e) * strength];
  };
}
