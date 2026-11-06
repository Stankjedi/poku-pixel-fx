import { cubicBezier, quadraticBezier } from './curves.js';
import { rand } from './math.js';
import type { Point } from './shapes.js';

export type PixelContourPoint2D = readonly [number, number];
export type PixelContourCommand2D =
  | { kind: 'move'; to: PixelContourPoint2D }
  | { kind: 'line'; to: PixelContourPoint2D }
  | { kind: 'quadratic'; control: PixelContourPoint2D; to: PixelContourPoint2D }
  | { kind: 'cubic'; control1: PixelContourPoint2D; control2: PixelContourPoint2D; to: PixelContourPoint2D }
  | { kind: 'close' };

export interface PixelContourMask2D { w: number; h: number; data: Uint8Array }
export interface PixelContourOptions2D {
  /** Maximum curve flattening error in native cells, 1/256..1. Default: 1/8. */
  tolerance?: number;
}
export interface OrganicSilhouetteOptions2D {
  /** Fixed uint32 seed; the outline is independent of animation time and RNG state. */
  seed?: number;
  /** Minimum continuous padding, in native cells. Default: 1 (less for dimensions below 4). */
  inset?: number;
  /** 0 gives an exact ellipse; 1 allows up to 35% smooth radial variation. Default: 0.45. */
  irregularity?: number;
  /** Main radial frequency, 2..12. Small native canvases benefit from fewer lobes. Default: 3. */
  lobes?: number;
}

const MAX_DIMENSION = 4096;
const MAX_COMMANDS = 4096;
const MAX_SEGMENTS = 65_536;
const MAX_SCANLINE_CROSSINGS = 8_388_608;
const MAX_COORDINATE = 1_048_576;

function rasterSize(w: number, h: number): number {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION)
    throw new RangeError('Contour dimensions must be integers within 1..4096 native cells');
  return w * h;
}

function point(value: PixelContourPoint2D, label: string): Point {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(n => Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE))
    throw new RangeError(`${label} must contain two finite coordinates within +/-1048576`);
  return [value[0], value[1]];
}

interface ScanEdge {
  end: number;
  first: number;
  x: number;
  slope: number;
}

/**
 * Fill authored curves directly into a binary native-pixel mask. Each sample is at
 * (x + .5, y + .5); scanline spans include their left endpoint and exclude their
 * right endpoint, and edge crossings include their top endpoint but not their bottom.
 * Subpaths close at `close`, the next `move`, or the end of the command list. The
 * even-odd rule supports holes, overlaps and concave shapes regardless of winding.
 * A drawing command after `close` needs a new `move`.
 *
 * Curves reuse the engine's adaptive Bézier subdivision. No image scaling, blur,
 * opacity fringe or per-frame randomness is involved. More native cells permit
 * finer authored curves; this operation does not invent missing shape detail.
 *
 * Authoring budgets: 4096 commands, 65536 flattened segments and 8388608 clipped
 * scanline crossings. Coordinates can extend beyond the canvas; output is clipped.
 */
export function rasterizePixelContour2D(
  w: number, h: number, commands: readonly PixelContourCommand2D[], options: PixelContourOptions2D = {},
): PixelContourMask2D {
  const size = rasterSize(w, h), tolerance = options.tolerance ?? .125;
  if (!Number.isFinite(tolerance) || tolerance < 1 / 256 || tolerance > 1)
    throw new RangeError('Contour tolerance must be within 1/256..1 native cells');
  if (!Array.isArray(commands) || commands.length > MAX_COMMANDS)
    throw new RangeError('Contour needs an array of at most 4096 commands');

  const starts: ScanEdge[][] = Array.from({ length: h }, () => []);
  let segmentCount = 0, crossings = 0, current: Point | undefined, first: Point | undefined;
  const edge = (a: Point, b: Point) => {
    if (++segmentCount > MAX_SEGMENTS) throw new RangeError('Contour exceeds its 65536 flattened-segment budget');
    if (a[1] === b[1]) return;
    const low = a[1] < b[1] ? a : b, high = a[1] < b[1] ? b : a;
    const start = Math.max(0, Math.ceil(low[1] - .5)), end = Math.min(h, Math.ceil(high[1] - .5));
    if (start >= end) return;
    crossings += end - start;
    if (crossings > MAX_SCANLINE_CROSSINGS) throw new RangeError('Contour exceeds its scanline-crossing budget');
    const slope = (high[0] - low[0]) / (high[1] - low[1]);
    starts[start].push({ first: start, end, x: low[0] + (start + .5 - low[1]) * slope, slope });
  };
  const close = () => {
    if (current && first) edge(current, first);
    current = first = undefined;
  };
  const append = (points: readonly Point[]) => {
    for (let i = 1; i < points.length; i++) edge(points[i - 1], points[i]);
    current = points[points.length - 1];
  };

  for (const command of commands) {
    if (!command || typeof command !== 'object') throw new RangeError('Invalid contour command');
    if (command.kind === 'move') {
      const next = point(command.to, 'Move');
      close();
      current = first = next;
      continue;
    }
    if (command.kind === 'close') {
      if (!current) throw new RangeError('Contour close needs an open subpath');
      close();
      continue;
    }
    if (!current) throw new RangeError('A contour drawing command needs a preceding move');
    switch (command.kind) {
      case 'line': {
        const next = point(command.to, 'Line');
        edge(current, next);
        current = next;
        break;
      }
      case 'quadratic':
        append(quadraticBezier(current, point(command.control, 'Quadratic control'), point(command.to, 'Quadratic endpoint'), tolerance));
        break;
      case 'cubic':
        append(cubicBezier(current, point(command.control1, 'Cubic control 1'), point(command.control2, 'Cubic control 2'), point(command.to, 'Cubic endpoint'), tolerance));
        break;
      default:
        throw new RangeError('Unknown contour command');
    }
  }
  close();

  const data = new Uint8Array(size), active: ScanEdge[] = [], intersections: number[] = [];
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (const e of active) if (y < e.end) active[count++] = e;
    active.length = count;
    for (const e of starts[y]) active.push(e);
    intersections.length = 0;
    // Evaluate from each edge's first scanline, avoiding accumulated step error.
    for (const e of active) intersections.push(e.x + (y - e.first) * e.slope);
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i] - .5));
      const right = Math.min(w, Math.ceil(intersections[i + 1] - .5));
      if (right > left) data.fill(1, y * w + left, y * w + right);
    }
  }
  return { w, h, data };
}

/**
 * A rounded, asymmetrical silhouette with three smoothly blended radial frequencies.
 * The analytic field is sampled at native pixel centers, avoiding faceted polygons
 * and white-noise edge erosion. The ellipse's outer boundary is inclusive and the
 * shape never extends beyond its inset. This provides a starting silhouette for
 * rocks, foliage, smoke masses or similar authoring; intentional corners, chips,
 * limbs and internal holes should use an authored contour instead.
 */
export function createOrganicSilhouette2D(
  w: number, h: number, options: OrganicSilhouetteOptions2D = {},
): PixelContourMask2D {
  const size = rasterSize(w, h), seed = options.seed ?? 1;
  const inset = options.inset ?? Math.min(1, Math.min(w, h) / 4);
  const irregularity = options.irregularity ?? .45, lobes = options.lobes ?? 3;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Organic silhouette seed must be uint32');
  if (!Number.isFinite(inset) || inset < 0 || inset >= Math.min(w, h) / 2)
    throw new RangeError('Organic silhouette inset must leave positive interior radii');
  if (!Number.isFinite(irregularity) || irregularity < 0 || irregularity > 1)
    throw new RangeError('Organic silhouette irregularity must be within 0..1');
  if (!Number.isInteger(lobes) || lobes < 2 || lobes > 12)
    throw new RangeError('Organic silhouette lobes must be an integer within 2..12');

  const data = new Uint8Array(size), cx = w / 2, cy = h / 2, rx = cx - inset, ry = cy - inset;
  const amplitude = .35 * irregularity, innerSquared = (1 - amplitude) ** 2;
  const phases = [rand(seed, 0), rand(seed, 1), rand(seed, 2)].map(value => value * Math.PI * 2);
  for (let y = 0; y < h; y++) {
    const ny = (y + .5 - cy) / ry;
    for (let x = 0; x < w; x++) {
      const nx = (x + .5 - cx) / rx, distanceSquared = nx * nx + ny * ny;
      if (distanceSquared > 1) continue;
      if (distanceSquared <= innerSquared) { data[y * w + x] = 1; continue; }
      const angle = Math.atan2(ny, nx);
      const wave = .6 * Math.sin(lobes * angle + phases[0])
        + .27 * Math.sin((lobes + 1) * angle + phases[1])
        + .13 * Math.sin((2 * lobes - 1) * angle + phases[2]);
      const radius = 1 - amplitude * (.5 + .5 * wave);
      if (distanceSquared <= radius * radius) data[y * w + x] = 1;
    }
  }
  return { w, h, data };
}
