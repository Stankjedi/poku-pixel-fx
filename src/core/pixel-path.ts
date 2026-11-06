import { cubicBezier, pathLengths } from './curves.js';
import { rasterizePixelBrush2D, type PixelBrushSymmetry2D } from './pixel-brush.js';
import { rasterizePixelContour2D, type PixelContourCommand2D } from './pixel-contour.js';
import type { Point } from './shapes.js';

/** Editable anchors with absolute incoming/outgoing cubic control points.
 * An absent handle lies on its anchor; a pair of anchors without handles forms a line. */
export interface PixelArtPathNode2D {
  point: readonly [number, number];
  in?: readonly [number, number];
  out?: readonly [number, number];
}

export interface PixelArtPathOptions2D {
  closed?: boolean;
  /** Fill the closed outline using native pixel centers and the even-odd rule. */
  fill?: boolean;
  /** Default stroke diameter in native cells, 0..256. Zero allows a fill without a stroke. */
  strokeWidth?: number;
  /** Open-path endpoint diameters, inherited from strokeWidth when omitted.
   * Width varies with geometric arc length, not with anchor count or the Bézier parameter. */
  startWidth?: number;
  endWidth?: number;
  /** Remove redundant elbows of a one-cell stroke only. Default: false. */
  pixelPerfect?: boolean;
  symmetry?: PixelBrushSymmetry2D;
}

export interface ResolvedPixelArtPathOptions2D {
  closed: boolean;
  fill: boolean;
  strokeWidth: number;
  startWidth: number;
  endWidth: number;
  pixelPerfect: boolean;
  symmetry: PixelBrushSymmetry2D;
}

export interface ValidatedPixelArtPath2D {
  nodes: PixelArtPathNode2D[];
  options: ResolvedPixelArtPathOptions2D;
}

const MAX_DIMENSION = 4096;
const MAX_NODES = 1024;
const MAX_COORDINATE = 1_048_576;
const MAX_FLATTENED_POINTS = 65_536;
const TOLERANCE = .125;

function pair(value: unknown, label: string): Point {
  if (!Array.isArray(value) || value.length !== 2
    || !Array.from(value).every(n => Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE))
    throw new RangeError(`${label} must contain two finite coordinates within +/-1048576`);
  return [value[0], value[1]];
}

function boolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new RangeError(`${label} must be boolean`);
  return value;
}

function width(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 256)
    throw new RangeError('Pixel path widths must be finite native diameters within 0..256');
  return value;
}

/** Validate/copy editable path data before storing it in a document. The caller's anchors,
 * handles and options are never normalized in place. Open outlines cannot be filled, and a
 * closed stroke uses one diameter at its join instead of silently introducing a taper seam. */
export function validatePixelArtPath2D(
  nodes: readonly PixelArtPathNode2D[], input: PixelArtPathOptions2D = {},
): ValidatedPixelArtPath2D {
  if (!Array.isArray(nodes) || nodes.length > MAX_NODES)
    throw new RangeError('Pixel paths support at most 1024 editable anchors');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid pixel path options');
  const copied = Array.from(nodes, node => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new RangeError('Invalid pixel path anchor');
    return { point: pair(node.point, 'Path anchor'),
      ...(node.in === undefined ? {} : { in: pair(node.in, 'Incoming path handle') }),
      ...(node.out === undefined ? {} : { out: pair(node.out, 'Outgoing path handle') }) };
  });
  const closed = boolean(input.closed, false, 'Path closed'), fill = boolean(input.fill, false, 'Path fill');
  const strokeWidth = width(input.strokeWidth, 1), startWidth = width(input.startWidth, strokeWidth), endWidth = width(input.endWidth, strokeWidth);
  const pixelPerfect = boolean(input.pixelPerfect, false, 'Pixel-perfect path'), symmetry = input.symmetry ?? 'none';
  if (!['none', 'x', 'y', 'xy'].includes(symmetry)) throw new RangeError('Unknown pixel path symmetry');
  if (fill && !closed) throw new RangeError('A filled pixel path must be closed');
  if (closed && startWidth !== endWidth) throw new RangeError('A closed pixel path needs equal start and end widths at its join');
  return { nodes: copied, options: { closed, fill, strokeWidth, startWidth, endWidth, pixelPerfect, symmetry } };
}

function same(a: readonly number[], b: readonly number[]): boolean { return a[0] === b[0] && a[1] === b[1]; }
function mutable(point: readonly [number, number]): Point { return [point[0], point[1]]; }

/** Keep curve flattening independent of the viewport, so clipping never changes a stroke's
 * staircase phase or taper. Each curve is subdivided against a native 1/8-cell error bound. */
function flattened(nodes: readonly PixelArtPathNode2D[], closed: boolean): Point[] {
  if (!nodes.length) return [];
  const points: Point[] = [mutable(nodes[0].point)];
  function append(point: Point) {
    if (same(points[points.length - 1], point)) return;
    if (points.length === MAX_FLATTENED_POINTS) throw new RangeError('Pixel path exceeds its 65536 flattened-point budget');
    points.push(point);
  }
  const segments = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < segments; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    if (!a.out && !b.in) { append(mutable(b.point)); continue; }
    const curve = cubicBezier(mutable(a.point), mutable(a.out ?? a.point), mutable(b.in ?? b.point), mutable(b.point), TOLERANCE);
    for (let j = 1; j < curve.length; j++) append(curve[j]);
  }
  return points;
}

function contour(nodes: readonly PixelArtPathNode2D[]): PixelContourCommand2D[] {
  if (!nodes.length) return [];
  const commands: PixelContourCommand2D[] = [{ kind: 'move', to: nodes[0].point }];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    if (a.out || b.in) commands.push({ kind: 'cubic', control1: a.out ?? a.point, control2: b.in ?? b.point, to: b.point });
    else if (i + 1 < nodes.length) commands.push({ kind: 'line', to: b.point });
  }
  commands.push({ kind: 'close' });
  return commands;
}

function reflect(mask: Uint8Array, w: number, h: number, symmetry: PixelBrushSymmetry2D): Uint8Array {
  if (symmetry === 'x' || symmetry === 'xy') for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) {
    const a = y * w + x, b = y * w + w - 1 - x;
    if (mask[a] || mask[b]) mask[a] = mask[b] = 1;
  }
  if (symmetry === 'y' || symmetry === 'xy') for (let y = 0; y < h / 2; y++) for (let x = 0; x < w; x++) {
    const a = y * w + x, b = (h - 1 - y) * w + x;
    if (mask[a] || mask[b]) mask[a] = mask[b] = 1;
  }
  return mask;
}

function reversedCanonical(points: readonly Point[]): boolean {
  // A direction-independent stroke trace avoids clockwise/counterclockwise elbow cleanup
  // differences and float summation differences in the arc-length taper. The endpoint widths
  // reverse with this internal traversal; the author's start/end meaning does not change.
  for (let i = 0, j = points.length - 1; i < j; i++, j--) {
    const a = points[i], b = points[j];
    if (a[0] !== b[0]) return a[0] > b[0];
    if (a[1] !== b[1]) return a[1] > b[1];
  }
  return false;
}

/**
 * Rasterize editable line/cubic paths to one binary native mask. Open round strokes support
 * arc-length tapering; closed outlines support a constant-width stroke, an even-odd fill,
 * or their union. Positive widths round to a diameter of at least one native cell. A zero
 * width endpoint contributes no stamp of its own, though adjacent coverage may reach it.
 *
 * Stroke coordinates snap down to their native cell, just like the pencil. Fill boundaries
 * retain their continuous coordinates and are tested at (x+.5,y+.5), just like native contour
 * fill. The resulting selection can be painted with an exact palette color; this operation
 * does not allocate RGB, blur edges, rescale a bitmap or introduce subpixel alpha.
 *
 * Curves are joined by connected brush segments, never by disconnected sample dots. Width is
 * measured along the continuous flattened path before clipping or cell snapping. Symmetry
 * reflects final coverage, including even-width anchoring, then unions it before painting.
 * All work is local to the returned mask; invalid geometry/budget failures leave callers intact.
 */
export function rasterizePixelPath2D(
  w: number, h: number, nodes: readonly PixelArtPathNode2D[], input: PixelArtPathOptions2D = {},
): Uint8Array {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION)
    throw new RangeError('Pixel path dimensions must be integers within 1..4096 native cells');
  const path = validatePixelArtPath2D(nodes, input), options = path.options;
  let data = options.fill ? rasterizePixelContour2D(w, h, contour(path.nodes), { tolerance: TOLERANCE }).data : undefined;
  const maximum = Math.max(options.startWidth, options.endWidth);
  if (maximum > 0 && path.nodes.length) {
    const points = flattened(path.nodes, options.closed), reverse = reversedCanonical(points);
    if (reverse) points.reverse();
    const start = reverse ? options.endWidth : options.startWidth, end = reverse ? options.startWidth : options.endWidth;
    const lengths = pathLengths(points), total = lengths[lengths.length - 1], size = Math.max(1, Math.ceil(maximum));
    const samples = points.map((point, i) => ({ x: point[0], y: point[1],
      pressure: (total ? start + (end - start) * (lengths[i] / total) : maximum) / size }));
    const stroke = rasterizePixelBrush2D(w, h, samples, { size, tip: 'round', pixelPerfect: options.pixelPerfect });
    if (!data) data = stroke;
    else for (let i = 0; i < data.length; i++) if (stroke[i]) data[i] = 1;
  }
  return reflect(data ?? new Uint8Array(w * h), w, h, options.symmetry);
}
