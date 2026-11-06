import type { EditableSprite2D } from './sprite-edit.js';
import { pixelSelectionBounds2D } from './pixel-selection.js';
import { rasterizePixelBrush2D, type PixelBrushOptions2D, type PixelBrushPoint2D } from './pixel-brush.js';

/** Portable authored brush data. Packed straight RGBA and independent mask bytes are exact;
 * transparent RGB is retained in the file, though transparent cells do not stamp over artwork. */
export interface PixelClusterBrush2D {
  schema: 'poku-pixel-cluster-brush/v1';
  name: string;
  width: number;
  height: number;
  pixels: number[];
  mask: number[];
  /** Integer local cell that follows the cursor, before flips/rotation. */
  anchor: [number, number];
}

export interface PixelClusterCaptureOptions2D {
  name?: string;
  /** Anchor in the cropped brush's local cells, not in the source canvas. */
  anchor?: readonly [number, number];
}

export interface PixelClusterRegionOptions2D {
  selection?: ArrayLike<number>;
  protectedMask?: ArrayLike<number>;
  /** Recolor existing occupied cells while retaining their exact alpha and mask bytes. */
  alphaLock?: boolean;
}

export interface PixelClusterStampOptions2D extends PixelClusterRegionOptions2D {
  /** Integer spacing along the unwrapped path, 1..256 native pixels. Default: 1.
   * Stamps occur at distance 0, spacing, 2*spacing...; an off-phase endpoint is not added. */
  spacing?: number;
  /** Clockwise rotation after the optional flips. No resampling. */
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  /** Wrap complete stamp footprints across the full destination canvas. */
  wrap?: boolean;
}

export interface PixelCloneBrushOptions2D extends PixelBrushOptions2D, PixelClusterRegionOptions2D {}
export interface PixelClusterStrokeResult2D<T extends EditableSprite2D = EditableSprite2D> {
  sprite: T;
  /** Cells whose final RGBA or independent mask differs from the source snapshot. */
  touched: Uint8Array;
}

const MAX_BRUSH_DIMENSION = 128;
const MAX_DIMENSION = 4096;
const MAX_COORDINATE = 1_048_576;
const MAX_POINTS = 65_536;
const MAX_STAMPS = 65_536;
const MAX_CELL_VISITS = 16_777_216;
const MAX_JSON_BYTES = 1024 * 1024;

function checkSource(source: EditableSprite2D): number {
  if (!source || typeof source !== 'object') throw new RangeError('A cluster brush needs a native source raster');
  const { w, h } = source, count = w * h;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || !source.mask || source.mask.w !== w || source.mask.h !== h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Cluster brush raster dimensions must match native RGBA and silhouette buffers');
  return count;
}

function name(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 160) throw new RangeError('A pixel brush needs a name of 1..160 characters');
  return value;
}

function anchor(value: unknown, w: number, h: number): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !Array.from(value).every(Number.isInteger)
    || value[0] < 0 || value[0] >= w || value[1] < 0 || value[1] >= h)
    throw new RangeError('Cluster brush anchor must be an integer cell inside the brush');
  return [value[0], value[1]];
}

function array(value: unknown, count: number, max: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== count
    || !Array.from(value).every(v => Number.isInteger(v) && v >= 0 && v <= max))
    throw new RangeError(`${label} must contain ${count} native unsigned values within 0..${max}`);
  return value.slice();
}

function mask(values: ArrayLike<number> | undefined, count: number, label: string): void {
  if (values === undefined) return;
  if (!values || values.length !== count) throw new RangeError(`${label} must match the full native canvas`);
  if (values instanceof Uint8Array) return;
  for (let i = 0; i < count; i++) if (!Number.isFinite(values[i])) throw new RangeError(`${label} must contain finite native values`);
}

function checkRegion(input: PixelClusterRegionOptions2D, count: number): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Pixel brush edit options must be an object');
  mask(input.selection, count, 'Brush selection'); mask(input.protectedMask, count, 'Brush protection');
  if (input.alphaLock !== undefined && typeof input.alphaLock !== 'boolean') throw new RangeError('Pixel brush alphaLock must be boolean');
}

/** Validate and copy JSON brush data without silently dropping hidden RGB or mask values. */
export function validatePixelClusterBrush2D(input: unknown): PixelClusterBrush2D {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Expected a pixel cluster brush');
  const brush = input as PixelClusterBrush2D, w = brush.width, h = brush.height;
  if (brush.schema !== 'poku-pixel-cluster-brush/v1' || !Number.isInteger(w) || !Number.isInteger(h)
    || w < 1 || h < 1 || w > MAX_BRUSH_DIMENSION || h > MAX_BRUSH_DIMENSION)
    throw new RangeError('Pixel cluster brushes require schema v1 and dimensions within 1..128');
  return { schema: 'poku-pixel-cluster-brush/v1', name: name(brush.name), width: w, height: h,
    pixels: array(brush.pixels, w * h, 0xffffffff, 'Brush RGBA'), mask: array(brush.mask, w * h, 255, 'Brush silhouette'),
    anchor: anchor(brush.anchor, w, h) };
}

/** Capture the selected bounding rectangle using the source's full row stride. Transparent
 * selected cells participate in the bounds. Unselected crop cells keep their raw RGB in the
 * brush but have a zero mask, so they never overwrite the destination. Without a selection,
 * the complete source canvas is captured. Even-sized default anchors favor the upper-left
 * center cell, matching the pencil's lower/right even-tip footprint. */
export function capturePixelClusterBrush2D(
  source: EditableSprite2D, selection?: ArrayLike<number>, options: PixelClusterCaptureOptions2D = {},
): PixelClusterBrush2D {
  checkSource(source);
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid pixel brush capture options');
  const bounds = selection === undefined ? { x: 0, y: 0, w: source.w, h: source.h } : pixelSelectionBounds2D(source.w, source.h, selection);
  if (!bounds) throw new RangeError('Select at least one native cell to capture a brush');
  if (bounds.w > MAX_BRUSH_DIMENSION || bounds.h > MAX_BRUSH_DIMENSION) throw new RangeError('Capture a brush region no larger than 128 by 128 native cells');
  const pixels = new Array<number>(bounds.w * bounds.h), silhouette = new Array<number>(pixels.length);
  for (let y = 0; y < bounds.h; y++) for (let x = 0; x < bounds.w; x++) {
    const i = (bounds.y + y) * source.w + bounds.x + x, j = y * bounds.w + x;
    pixels[j] = source.pixels[i]; silhouette[j] = selection === undefined || selection[i] ? source.mask.data[i] : 0;
  }
  return { schema: 'poku-pixel-cluster-brush/v1', name: name(options.name === undefined ? 'Custom pixel brush' : options.name), width: bounds.w, height: bounds.h,
    pixels, mask: silhouette, anchor: anchor(options.anchor === undefined ? [Math.floor((bounds.w - 1) / 2), Math.floor((bounds.h - 1) / 2)] : options.anchor, bounds.w, bounds.h) };
}

function checkJSON(json: string): void {
  if (typeof json !== 'string') throw new TypeError('Pixel cluster brush JSON must be a string');
  if (json.length > MAX_JSON_BYTES || new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES)
    throw new RangeError('Pixel cluster brush JSON exceeds 1 MiB');
}

export function serializePixelClusterBrush2D(brush: PixelClusterBrush2D): string {
  const json = JSON.stringify(validatePixelClusterBrush2D(brush)); checkJSON(json); return json;
}

export function parsePixelClusterBrush2D(json: string): PixelClusterBrush2D {
  checkJSON(json); return validatePixelClusterBrush2D(JSON.parse(json));
}

interface StrokePoint { x: number; y: number; pressure: number }
function strokePoints(points: readonly PixelBrushPoint2D[]): StrokePoint[] {
  if (!Array.isArray(points) || points.length > MAX_POINTS) throw new RangeError('Pixel cluster strokes support at most 65536 pointer samples');
  const native = Array.from(points, point => {
    if (!point || typeof point !== 'object' || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || Math.abs(point.x) > MAX_COORDINATE || Math.abs(point.y) > MAX_COORDINATE)
      throw new RangeError('Pixel brush coordinates must be finite and within +/-1048576');
    const pressure = point.pressure === undefined ? 1 : point.pressure;
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) throw new RangeError('Pixel brush pressure must be within 0..1');
    return { x: point.x, y: point.y, pressure };
  });
  // Collapse collinear event subdivisions before accumulating length. This makes a straight
  // segment's spacing depend on its endpoints, even after thousands of coalesced events.
  // Pressure is an on/off gate here: preserve every zero interval and isolated zero/positive
  // point, but positive-only intermediate values cannot change the captured pattern.
  const simplified: StrokePoint[] = [];
  for (const point of native) {
    const last = simplified[simplified.length - 1];
    if (last && last.x === point.x && last.y === point.y && last.pressure === point.pressure) continue;
    simplified.push(point);
    while (simplified.length >= 3) {
      const i = simplified.length - 3, a = simplified[i], b = simplified[i + 1], c = simplified[i + 2];
      const ax = b.x - a.x, ay = b.y - a.y, bx = c.x - b.x, by = c.y - b.y;
      if (!(ax || ay) || !(bx || by) || ax * bx + ay * by < 0) break;
      const scale = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y));
      const tolerance = Number.EPSILON * 64 * scale * (Math.hypot(ax, ay) + Math.hypot(bx, by));
      if (Math.abs(ax * by - ay * bx) > tolerance) break;
      const sameGate = b.pressure > 0 ? a.pressure > 0 || c.pressure > 0 : a.pressure === 0 && c.pressure === 0;
      if (!sameGate) break;
      simplified[i + 1] = c; simplified.pop();
    }
  }
  return simplified;
}

const modulo = (value: number, period: number) => ((value % period) + period) % period;
function nearInteger(value: number, operandScale = 0): number {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) <= Number.EPSILON * 16 * Math.max(1, Math.abs(value), operandScale) ? nearest : value;
}
const nativeCell = (value: number, operandScale = 0) => Math.floor(nearInteger(value, operandScale));

/** Clip the sample interval, not the authored segment or global spacing phase. */
function clipSegment(a: StrokePoint, b: StrokePoint, bounds: readonly [number, number, number, number]): [number, number] | undefined {
  let low = 0, high = 1;
  for (let axis = 0; axis < 2; axis++) {
    const start = axis ? a.y : a.x, delta = axis ? b.y - a.y : b.x - a.x;
    const minimum = bounds[axis], maximum = bounds[axis + 2];
    if (!delta) { if (start < minimum || start > maximum) return; continue; }
    const u = (minimum - start) / delta, v = (maximum - start) / delta;
    low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v));
    if (low > high) return;
  }
  return [low, high];
}

function centers(
  points: readonly StrokePoint[], spacing: number, w: number, h: number, wrap: boolean,
  bounds: readonly [number, number, number, number],
): [number, number][] {
  const stamps: [number, number][] = [];
  const append = (x: number, y: number, pressure: number, xScale = 0, yScale = 0) => {
    if (!(pressure > 0)) return;
    let xx = nativeCell(x, xScale), yy = nativeCell(y, yScale);
    if (wrap) { xx = modulo(xx, w); yy = modulo(yy, h); }
    const last = stamps[stamps.length - 1];
    if (!last || last[0] !== xx || last[1] !== yy) stamps.push([xx, yy]);
  };
  let distance = 0, previousIndex = -1, samples = 0, hasLength = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    hasLength = true;
    const range = wrap ? [0, 1] : clipSegment(a, b, bounds);
    if (range) {
      const first = Math.max(previousIndex + 1, Math.ceil(nearInteger((distance + range[0] * length) / spacing)));
      const last = Math.floor(nearInteger((distance + range[1] * length) / spacing));
      if (last >= first) {
        samples += last - first + 1;
        if (samples > MAX_STAMPS) throw new RangeError('Pixel cluster stroke exceeds its 65536 in-range sample budget');
        const ux = dx / length, uy = dy / length;
        // Remote endpoints can cancel to a small native coordinate. Bound rounding by
        // the operands used to reach that coordinate, not by the small result alone.
        // Keep the axes separate so a long horizontal stroke cannot snap an authored
        // fractional y coordinate onto the next row (and likewise for vertical x).
        const xScale = Math.abs(a.x) + Math.abs(ux) * (distance + length);
        const yScale = Math.abs(a.y) + Math.abs(uy) * (distance + length);
        for (let j = first; j <= last; j++) {
          const offset = Math.max(0, Math.min(length, j * spacing - distance)), t = offset / length;
          // Divide once to obtain the unit direction, then multiply by arc distance.
          // This keeps integer horizontal/vertical samples exact even a million cells
          // from the start, unlike delta * (offset / length). Preserve authored ends.
          if (offset === 0) append(a.x, a.y, a.pressure);
          else if (offset === length) append(b.x, b.y, b.pressure);
          else append(a.x + ux * offset, a.y + uy * offset, a.pressure + (b.pressure - a.pressure) * t, xScale, yScale);
        }
        previousIndex = last;
      }
    }
    distance += length;
  }
  if (!hasLength && points.length) {
    let pressure = 0;
    for (const point of points) pressure = Math.max(pressure, point.pressure);
    append(points[0].x, points[0].y, pressure);
  }
  return stamps;
}

function editor<T extends EditableSprite2D>(source: T, options: PixelClusterRegionOptions2D): PixelClusterStrokeResult2D<T> & { write(index: number, color: number, silhouette: number): void } {
  const pixels = source.pixels.slice(), data = source.mask.data.slice(), touched = new Uint8Array(pixels.length);
  return { sprite: { ...source, pixels, mask: { ...source.mask, data } }, touched, write(i, color, silhouette) {
    if (!silhouette || !(color >>> 24) || options.selection && !options.selection[i] || options.protectedMask?.[i]) return;
    if (options.alphaLock) {
      if (!source.mask.data[i] || !(source.pixels[i] >>> 24)) return;
      color = ((color & 0xffffff) | (source.pixels[i] & 0xff000000)) >>> 0;
      silhouette = source.mask.data[i];
    }
    pixels[i] = color; data[i] = silhouette;
    touched[i] = pixels[i] !== source.pixels[i] || data[i] !== source.mask.data[i] ? 1 : 0;
  } };
}

/** Stamp an authored pixel cluster at uniform arc-length intervals on a source snapshot.
 * Exact integer flips/quarter turns move both cells and the anchor. Transparent donor cells
 * leave the destination unchanged; visible cells replace straight RGBA without blending.
 * Pressure is an on/off gate (zero skips), never an alpha change or pattern resampling.
 *
 * Each preview must receive the same pre-stroke source and the complete current point list.
 * Event density does not reset stamp spacing. Overlaps follow path order, then the original
 * brush's row-major cell order; wrapped many-to-one footprints use that same explicit order.
 * Other source metadata/channels are retained by reference, as with paintPixelMask2D. This is
 * a color/silhouette brush, not a transformed material-map or character-rig operation.
 */
export function stampPixelClusterBrush2D<T extends EditableSprite2D>(
  source: T, points: readonly PixelBrushPoint2D[], brush: PixelClusterBrush2D, input: PixelClusterStampOptions2D = {},
): PixelClusterStrokeResult2D<T> {
  const count = checkSource(source); checkRegion(input, count);
  const pattern = validatePixelClusterBrush2D(brush), path = strokePoints(points);
  const spacing = input.spacing === undefined ? 1 : input.spacing, rotation = input.rotation === undefined ? 0 : input.rotation;
  if (!Number.isInteger(spacing) || spacing < 1 || spacing > 256) throw new RangeError('Cluster brush spacing must be an integer within 1..256');
  if (![0, 90, 180, 270].includes(rotation)) throw new RangeError('Cluster brush rotation must be 0, 90, 180 or 270 degrees');
  for (const key of ['flipX', 'flipY', 'wrap'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean')
    throw new RangeError(`Cluster brush ${key} must be boolean`);
  const transform = (x: number, y: number): [number, number] => {
    const u = input.flipX ? pattern.width - 1 - x : x, v = input.flipY ? pattern.height - 1 - y : y;
    return rotation === 90 ? [pattern.height - 1 - v, u] : rotation === 180 ? [pattern.width - 1 - u, pattern.height - 1 - v]
      : rotation === 270 ? [v, pattern.width - 1 - u] : [u, v];
  };
  const pivot = transform(...pattern.anchor), entries: { x: number; y: number; color: number; silhouette: number }[] = [];
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let y = 0; y < pattern.height; y++) for (let x = 0; x < pattern.width; x++) {
    const i = y * pattern.width + x, color = pattern.pixels[i], silhouette = pattern.mask[i];
    if (!silhouette || !(color >>> 24)) continue;
    const [xx, yy] = transform(x, y), dx = xx - pivot[0], dy = yy - pivot[1];
    entries.push({ x: dx, y: dy, color, silhouette });
    left = Math.min(left, dx); right = Math.max(right, dx); top = Math.min(top, dy); bottom = Math.max(bottom, dy);
  }
  const wrap = input.wrap ?? false;
  // One-cell conservative padding keeps clip arithmetic from excluding a native cell on a
  // floating-point boundary; individual destinations are still clipped exactly below.
  const stamps = entries.length ? centers(path, spacing, source.w, source.h, wrap, [-right - 1, -bottom - 1, source.w - left + 1, source.h - top + 1]) : [];
  if (entries.length * stamps.length > MAX_CELL_VISITS) throw new RangeError('Pixel cluster stroke exceeds its 16777216 stamp-cell budget');
  const out = editor(source, input);
  for (const [x, y] of stamps) for (const cell of entries) {
    let xx = x + cell.x, yy = y + cell.y;
    if (wrap) { xx = modulo(xx, source.w); yy = modulo(yy, source.h); }
    if (xx < 0 || yy < 0 || xx >= source.w || yy >= source.h) continue;
    out.write(yy * source.w + xx, cell.color, cell.silhouette);
  }
  return { sprite: out.sprite, touched: out.touched };
}

function coordinatePair(value: readonly [number, number], label: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !Array.from(value).every(v => Number.isInteger(v) && Math.abs(v) <= MAX_COORDINATE))
    throw new RangeError(`${label} must contain two native integers within +/-1048576`);
  return [value[0], value[1]];
}

/** Clone from a fixed pre-stroke source using a source-to-destination anchor offset. Every
 * destination reads the original source, even where previous writes overlap the donor area.
 * Wrap folds both the continuous brush footprint and donor coordinates into the canvas. A
 * transparent/hidden donor leaves the destination unchanged. Only RGBA/silhouette are cloned. */
export function clonePixelBrush2D<T extends EditableSprite2D>(
  source: T, points: readonly PixelBrushPoint2D[], sourceAnchor: readonly [number, number], destinationAnchor: readonly [number, number],
  options: PixelCloneBrushOptions2D = {},
): PixelClusterStrokeResult2D<T> {
  const count = checkSource(source); checkRegion(options, count);
  if (options.pixelPerfect !== undefined && typeof options.pixelPerfect !== 'boolean') throw new RangeError('Clone pixelPerfect must be boolean');
  const from = coordinatePair(sourceAnchor, 'Clone source anchor'), to = coordinatePair(destinationAnchor, 'Clone destination anchor');
  const coverage = rasterizePixelBrush2D(source.w, source.h, points, options), out = editor(source, options);
  const dx = from[0] - to[0], dy = from[1] - to[1];
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
    const i = y * source.w + x;
    if (!coverage[i]) continue;
    let xx = x + dx, yy = y + dy;
    if (options.wrap) { xx = modulo(xx, source.w); yy = modulo(yy, source.h); }
    if (xx < 0 || yy < 0 || xx >= source.w || yy >= source.h) continue;
    const donor = yy * source.w + xx;
    out.write(i, source.pixels[donor], source.mask.data[donor]);
  }
  return { sprite: out.sprite, touched: out.touched };
}
