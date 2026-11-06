import { rasterizePixelBrush2D, type PixelBrushPoint2D } from './pixel-brush.js';
import { rasterizePixelContour2D, type PixelContourCommand2D } from './pixel-contour.js';

export interface PixelSelectionBounds2D {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Number of selected cells, including selected transparent background. */
  count: number;
}
export interface PixelLassoOptions2D {
  /** Include the one-cell pointer outline. Default: true, including short/degenerate lassos. */
  includeBoundary?: boolean;
}

function size(w: number, h: number): number {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096)
    throw new RangeError('Pixel selection dimensions must be integers within 1..4096');
  return w * h;
}
function maskValues(mask: ArrayLike<number>, count: number): void {
  if (!mask || mask.length !== count) throw new RangeError('Pixel selection must match the native cell count');
  if (mask instanceof Uint8Array) return;
  for (let i = 0; i < count; i++) if (!Number.isFinite(mask[i]))
    throw new RangeError('Pixel selection values must be finite');
}

/** Native cell bounds, independent of sprite placement, colors and silhouette occupancy. */
export function pixelSelectionBounds2D(w: number, h: number, selection: ArrayLike<number>): PixelSelectionBounds2D | null {
  const cells = size(w, h);
  maskValues(selection, cells);
  let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!selection[y * w + x]) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y); count++;
  }
  return count ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, count } : null;
}

/** Invert against the full canvas, or only inside an explicit constraint such as a silhouette. */
export function invertPixelSelection2D(
  w: number, h: number, selection: ArrayLike<number>, within?: ArrayLike<number>,
): Uint8Array {
  const count = size(w, h);
  maskValues(selection, count);
  if (within !== undefined) maskValues(within, count);
  return Uint8Array.from(selection, (value, i) => !value && (within === undefined || !!within[i]) ? 1 : 0);
}

/**
 * Close a freehand/polygon pointer path and fill it at native cell centers. Fractions snap down
 * to their cell, as for the pixel brush. The even-odd rule supports concavity, self-intersections
 * and repeated loops. Optional boundary inclusion follows the exact one-cell brush raster, so
 * narrow selections do not lose their tips and a click selects one cell.
 *
 * This reuses the contour scan converter and its clipping/budgets. At most 4096 distinct vertices
 * are accepted after consecutive duplicate and collinear pointer samples have been simplified.
 * The input path is never modified. There is no antialiasing or color/alpha dependence.
 */
export function rasterizePixelLasso2D(
  w: number, h: number, points: readonly Pick<PixelBrushPoint2D, 'x' | 'y'>[], options: PixelLassoOptions2D = {},
): Uint8Array {
  const count = size(w, h);
  if (!Array.isArray(points) || points.length > 65_536) throw new RangeError('A pixel lasso supports at most 65536 pointer samples');
  if (options.includeBoundary !== undefined && typeof options.includeBoundary !== 'boolean')
    throw new RangeError('Lasso boundary inclusion must be boolean');
  const native: { x: number; y: number }[] = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1_048_576 || Math.abs(p.y) > 1_048_576)
      throw new RangeError('Pixel lasso coordinates must be finite and within +/-1048576');
    const next = { x: Math.floor(p.x), y: Math.floor(p.y) }, previous = native[native.length - 1];
    if (previous && previous.x === next.x && previous.y === next.y) continue;
    const before = native[native.length - 2];
    if (before && (previous.x - before.x) * (next.y - previous.y) === (previous.y - before.y) * (next.x - previous.x)
      && (previous.x - before.x) * (next.x - previous.x) + (previous.y - before.y) * (next.y - previous.y) > 0) native.pop();
    native.push(next);
  }
  if (native.length > 1 && native[0].x === native[native.length - 1].x && native[0].y === native[native.length - 1].y) native.pop();
  if (native.length > 4096) throw new RangeError('Pixel lasso exceeds its 4096 distinct-vertex budget');
  if (!native.length) return new Uint8Array(count);
  const commands: PixelContourCommand2D[] = native.map((p, i) => ({
    kind: i === 0 ? 'move' : 'line', to: [p.x + .5, p.y + .5],
  }));
  const out = native.length >= 3 ? rasterizePixelContour2D(w, h, commands).data : new Uint8Array(count);
  if (options.includeBoundary !== false) {
    const outline = rasterizePixelBrush2D(w, h, [...native, native[0]]);
    for (let i = 0; i < count; i++) if (outline[i]) out[i] = 1;
  }
  return out;
}
