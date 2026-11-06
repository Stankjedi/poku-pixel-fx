import type { EditableSprite2D } from './sprite-edit.js';

/** Native cell coordinates, independent of sprite placement. Fractions snap down to their cell. */
export interface PixelBrushPoint2D { x: number; y: number; pressure?: number }
export type PixelBrushTip2D = 'round' | 'square';
/** x mirrors columns about (w-1)/2; y mirrors rows about (h-1)/2. */
export type PixelBrushSymmetry2D = 'none' | 'x' | 'y' | 'xy';
export interface PixelBrushOptions2D {
  /** Integer diameter, 1..256 native cells. Pressure changes diameter, never pixel opacity. */
  size?: number;
  tip?: PixelBrushTip2D;
  /** Remove the redundant middle cell of consecutive one-cell right-angle turns. Size 1 only. */
  pixelPerfect?: boolean;
  symmetry?: PixelBrushSymmetry2D;
}
export type PixelShapeKind2D = 'line' | 'rectangle' | 'ellipse';
export interface PixelShapeOptions2D extends PixelBrushOptions2D {
  /** Rectangles and ellipses default to an inward outline of `size` cells. */
  filled?: boolean;
}
export interface PixelPaintOptions2D {
  /** Exact palette-preserving replacement by default. `over` explicitly blends straight-alpha RGB. */
  mode?: 'replace' | 'over';
  selection?: ArrayLike<number>;
  protectedMask?: ArrayLike<number>;
  /** Recolor occupied cells without changing their alpha or exposing hidden silhouette cells. */
  alphaLock?: boolean;
}
export interface PixelRegionSelectionOptions2D {
  /** Maximum difference in any sRGB channel, 0..255. Each candidate is compared with the seed. */
  tolerance?: number;
  /** False selects all matching cells, including disconnected islands. Default: true. */
  contiguous?: boolean;
  connectivity?: 4 | 8;
  /** Allows selecting empty background when the seed is transparent or masked out. */
  includeTransparent?: boolean;
  /** Include alpha in the tolerance comparison. Default: false. */
  matchAlpha?: boolean;
  /** A full-canvas constraint; excluded cells also stop a connected fill. */
  selection?: ArrayLike<number>;
}
export type PixelSelectionOperation2D = 'replace' | 'add' | 'subtract' | 'intersect' | 'xor';

const MAX_DIMENSION = 4096;
const MAX_CELLS = MAX_DIMENSION * MAX_DIMENSION;
const MAX_COORDINATE = 1_048_576;
const MAX_POINTS = 65_536;
const MAX_SAMPLES = 4_194_304;
const MAX_STAMP_SPANS = 8_388_608;

function rasterSize(w: number, h: number): number {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION)
    throw new RangeError('Pixel brush dimensions must be integers within 1..4096 native cells');
  return w * h;
}
function checkSprite(source: EditableSprite2D): number {
  const count = rasterSize(source.w, source.h);
  if (!(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || source.mask.w !== source.w || source.mask.h !== source.h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Pixel paint requires matching native pixel and silhouette buffers');
  return count;
}
function checkMask(mask: ArrayLike<number>, count: number, label: string): void {
  if (!mask || mask.length !== count) throw new RangeError(`${label} must match the native cell count`);
  if (mask instanceof Uint8Array) return;
  for (let i = 0; i < count; i++) if (!Number.isFinite(mask[i])) throw new RangeError(`${label} must contain finite values`);
}
function coordinate(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE)
    throw new RangeError('Pixel coordinates must be finite and within +/-1048576');
  return Math.floor(value);
}
function brushOptions(input: PixelBrushOptions2D): Required<PixelBrushOptions2D> {
  const size = input.size ?? 1, tip = input.tip ?? 'round', symmetry = input.symmetry ?? 'none';
  if (!Number.isInteger(size) || size < 1 || size > 256) throw new RangeError('Pixel brush size must be an integer within 1..256');
  if (tip !== 'round' && tip !== 'square') throw new RangeError('Unknown pixel brush tip');
  if (!['none', 'x', 'y', 'xy'].includes(symmetry)) throw new RangeError('Unknown pixel brush symmetry');
  return { size, tip, symmetry, pixelPerfect: input.pixelPerfect ?? false };
}
function reflectMask(mask: Uint8Array, w: number, h: number, symmetry: PixelBrushSymmetry2D): Uint8Array {
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

/**
 * Rasterize a complete pointer stroke into an independent binary mask. The major-axis line
 * equation is evaluated in its original coordinates, so clipped endpoints do not shift its
 * stair-step phase and reversing a plain segment paints the same cells. Every consecutive
 * sample is at most one cell apart; sparse pointer events do not produce stamp-shaped gaps.
 *
 * Pressure is linearly interpolated along each segment. Zero means no ink; positive pressure
 * selects max(1, round(size*pressure)) cells. Even tips have a half-cell lower/right anchor.
 * Symmetry reflects the entire footprint, including that anchor, and unions coverage before
 * paint is applied: overlapping mirrors never accumulate opacity.
 *
 * Pixel-perfect cleanup operates on this stroke only, never on source artwork. For interactive
 * previews, reapply the whole current mask to the saved pre-stroke raster. Applying every
 * interim preview cumulatively would leave behind corners that are later removed.
 */
export function rasterizePixelBrush2D(
  w: number, h: number, points: readonly PixelBrushPoint2D[], input: PixelBrushOptions2D = {},
): Uint8Array {
  const count = rasterSize(w, h), options = brushOptions(input);
  if (!Array.isArray(points) || points.length > MAX_POINTS) throw new RangeError('A pixel stroke supports at most 65536 pointer samples');
  const native = points.map(p => {
    if (!p || typeof p !== 'object') throw new RangeError('Invalid pixel brush point');
    const pressure = p.pressure ?? 1;
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) throw new RangeError('Pixel brush pressure must be within 0..1');
    return { x: coordinate(p.x), y: coordinate(p.y), pressure };
  });
  const mask = new Uint8Array(count);
  if (!native.length) return mask;
  let samples = 0, spans = 0;
  const tips = new Map<number, readonly [number, number, number][]>();
  const stamp = (x: number, y: number, pressure: number) => {
    if (!(pressure > 0)) return;
    const size = Math.max(1, Math.round(options.size * pressure));
    let rows = tips.get(size);
    if (!rows) {
      const values: [number, number, number][] = [], low = -Math.floor((size - 1) / 2);
      const center = size % 2 ? 0 : .5, radius = size / 2;
      for (let yy = low; yy < low + size; yy++) {
        const half = options.tip === 'round' ? Math.sqrt(Math.max(0, radius * radius - (yy - center) ** 2)) : Infinity;
        const left = Math.max(low, Math.ceil(center - half)), right = Math.min(low + size - 1, Math.floor(center + half));
        if (right >= left) values.push([yy, left, right]);
      }
      tips.set(size, rows = values);
    }
    for (const [dy, left, right] of rows) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const x0 = Math.max(0, x + left), x1 = Math.min(w, x + right + 1);
      if (x0 >= x1) continue;
      if (++spans > MAX_STAMP_SPANS) throw new RangeError('Pixel stroke exceeds its 8388608 clipped brush-span budget');
      mask.fill(1, yy * w + x0, yy * w + x1);
    }
  };
  const clean = options.pixelPerfect && options.size === 1;
  const trace: { x: number; y: number }[] = [];
  let runStart = 0;
  const sample = (x: number, y: number, pressure: number) => {
    if (++samples > MAX_SAMPLES) throw new RangeError('Pixel stroke exceeds its 4194304 interpolated-cell budget');
    if (!clean) { stamp(x, y, pressure); return; }
    if (!(pressure > 0)) { runStart = trace.length; return; }
    const b = trace[trace.length - 1], a = trace.length - runStart > 1 ? trace[trace.length - 2] : undefined;
    if (b && trace.length > runStart && b.x === x && b.y === y) return;
    if (a && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
      && Math.abs(b.x - x) + Math.abs(b.y - y) === 1
      && Math.abs(a.x - x) === 1 && Math.abs(a.y - y) === 1) trace.pop();
    trace.push({ x, y });
  };
  const segment = (a: typeof native[number], b: typeof native[number]) => {
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), xMajor = dx >= dy, steps = Math.max(dx, dy);
    if (!steps) { sample(a.x, a.y, Math.max(a.pressure, b.pressure)); return; }
    const increasing = xMajor ? b.x >= a.x : b.y >= a.y;
    const start = increasing ? a : b, end = increasing ? b : a;
    const major = xMajor ? start.x : start.y, minor = xMajor ? start.y : start.x;
    const minorDelta = (xMajor ? end.y : end.x) - minor, sign = Math.sign(minorDelta);
    const pad = Math.ceil(options.size / 2) + 1;
    // Clip iteration, not geometry. This retains ties/stair steps from the uncut segment.
    const first = Math.max(0, -pad - major), last = Math.min(steps, (xMajor ? w : h) - 1 + pad - major);
    if (first > last) { runStart = trace.length; return; }
    const begin = increasing ? first : last, finish = increasing ? last : first, direction = increasing ? 1 : -1;
    for (let k = begin; increasing ? k <= finish : k >= finish; k += direction) {
      const q = minor + sign * Math.floor((Math.abs(minorDelta) * k + steps / 2) / steps);
      const x = xMajor ? major + k : q, y = xMajor ? q : major + k;
      if (x < -pad || y < -pad || x >= w + pad || y >= h + pad) { runStart = trace.length; continue; }
      const t = increasing ? k / steps : 1 - k / steps;
      sample(x, y, a.pressure + (b.pressure - a.pressure) * t);
    }
  };
  if (native.length === 1) sample(native[0].x, native[0].y, native[0].pressure);
  else for (let i = 1; i < native.length; i++) segment(native[i - 1], native[i]);
  if (clean) for (const p of trace) stamp(p.x, p.y, 1);
  return reflectMask(mask, w, h, options.symmetry);
}

/** Native drag shapes use inclusive endpoint cells. Outlines stay inside the dragged bounds.
 * Ellipse outlines use a native four-neighbor inset, keeping very thin ellipses connected. */
export function rasterizePixelShape2D(
  w: number, h: number, kind: PixelShapeKind2D, from: readonly [number, number], to: readonly [number, number],
  input: PixelShapeOptions2D = {},
): Uint8Array {
  const count = rasterSize(w, h), options = brushOptions(input);
  if (!['line', 'rectangle', 'ellipse'].includes(kind)) throw new RangeError('Unknown native pixel shape');
  if (!from || !to || from.length !== 2 || to.length !== 2) throw new RangeError('Pixel shapes require two coordinate pairs');
  const ax = coordinate(from[0]), ay = coordinate(from[1]), bx = coordinate(to[0]), by = coordinate(to[1]);
  if (kind === 'line') return rasterizePixelBrush2D(w, h, [{ x: ax, y: ay }, { x: bx, y: by }], options);
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  const left = Math.max(0, x0), right = Math.min(w - 1, x1), top = Math.max(0, y0), bottom = Math.min(h - 1, y1);
  const mask = new Uint8Array(count), filled = input.filled ?? false;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (kind === 'rectangle') {
      if (filled || x - x0 < options.size || x1 - x < options.size || y - y0 < options.size || y1 - y < options.size)
        mask[y * w + x] = 1;
    } else {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy), nx = dx * dx / (rx * rx), ny = dy * dy / (ry * ry);
      if (nx + ny > 1) continue;
      // Shrinking the ellipse's two radii can leave its end caps disconnected on a thin raster.
      // A convex ellipse contains a native Manhattan kernel iff all four extreme points fit.
      // Evaluate against the original ellipse, including outside-canvas neighbors, so clipping
      // does not create an artificial outline along the canvas edge.
      if (filled || (dx + options.size) ** 2 / (rx * rx) + ny > 1 || nx + (dy + options.size) ** 2 / (ry * ry) > 1)
        mask[y * w + x] = 1;
    }
  }
  return reflectMask(mask, w, h, options.symmetry);
}

/**
 * Apply a mask once to an independent raster. A null color explicitly erases; occupied-mask and
 * alpha change together. A default replacement writes the exact supplied color without inventing
 * intermediate palette entries. Source-over blending is an explicit alternative. Alpha-locked
 * `over` uses source-atop RGB and retains exact destination coverage; locked erasure is a no-op.
 *
 * Hidden opaque RGB under an independent zero silhouette is not a blend destination. Unedited
 * pixels and masks stay byte-identical. Other metadata (including semantic, height and HDR data)
 * is retained by reference, as for editSpriteCluster2D; this raster edit does not regenerate it.
 */
export function paintPixelMask2D<T extends EditableSprite2D>(
  source: T, mask: ArrayLike<number>, color: number | null, options: PixelPaintOptions2D = {},
): T {
  const count = checkSprite(source), mode = options.mode ?? 'replace';
  checkMask(mask, count, 'Paint mask');
  if (options.selection) checkMask(options.selection, count, 'Paint selection');
  if (options.protectedMask) checkMask(options.protectedMask, count, 'Protected mask');
  if (mode !== 'replace' && mode !== 'over') throw new RangeError('Unknown pixel paint mode');
  if (color !== null && (!Number.isInteger(color) || color < -0x80000000 || color > 0xffffffff))
    throw new RangeError('Pixel paint color must be a packed 32-bit engine color or null');
  const ink = color === null ? 0 : color >>> 0, sa = ink >>> 24;
  const pixels = source.pixels.slice(), silhouette = source.mask.data.slice();
  for (let i = 0; i < count; i++) {
    if (!mask[i] || options.selection && !options.selection[i] || options.protectedMask?.[i]) continue;
    const before = source.pixels[i], da = source.mask.data[i] ? before >>> 24 : 0;
    if (options.alphaLock && (!da || !sa)) continue;
    if (color === null || mode === 'replace') {
      pixels[i] = sa ? options.alphaLock ? ((ink & 0xffffff) | (before & 0xff000000)) >>> 0 : ink : 0;
      silhouette[i] = options.alphaLock ? source.mask.data[i] : pixels[i] >>> 24 ? 1 : 0;
      continue;
    }
    if (!sa) continue;
    if (!da) { pixels[i] = ink; silhouette[i] = 1; continue; }
    const alpha = sa * 255 + da * (255 - sa);
    let mixed = (options.alphaLock ? da : Math.round(alpha / 255)) << 24;
    for (let channel = 0; channel < 24; channel += 8) {
      const src = ink >>> channel & 255, dst = before >>> channel & 255;
      const value = options.alphaLock ? (src * sa + dst * (255 - sa)) / 255
        : (src * sa * 255 + dst * da * (255 - sa)) / alpha;
      mixed |= Math.round(value) << channel;
    }
    pixels[i] = mixed >>> 0; silhouette[i] = options.alphaLock ? source.mask.data[i] : 1;
  }
  return { ...source, pixels, mask: { ...source.mask, data: silhouette } };
}

/** Connected bucket/wand selection or all matching colors. No recursion or tolerance chaining. */
export function selectPixelRegion2D(
  source: EditableSprite2D, point: Pick<PixelBrushPoint2D, 'x' | 'y'>, options: PixelRegionSelectionOptions2D = {},
): Uint8Array {
  const count = checkSprite(source), tolerance = options.tolerance ?? 0, connectivity = options.connectivity ?? 4;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new RangeError('Selection tolerance must be within 0..255');
  if (connectivity !== 4 && connectivity !== 8) throw new RangeError('Selection connectivity must be 4 or 8');
  if (options.selection) checkMask(options.selection, count, 'Region constraint');
  const x = coordinate(point.x), y = coordinate(point.y), mask = new Uint8Array(count), { w, h } = source;
  if (x < 0 || y < 0 || x >= w || y >= h) return mask;
  const seed = y * w + x, reference = source.pixels[seed];
  const referenceAlpha = source.mask.data[seed] ? reference >>> 24 : 0;
  if (!referenceAlpha && !options.includeTransparent || options.selection && !options.selection[seed]) return mask;
  const matches = (i: number): boolean => {
    if (options.selection && !options.selection[i]) return false;
    const color = source.pixels[i], alpha = source.mask.data[i] ? color >>> 24 : 0;
    if (!referenceAlpha) return alpha === 0;
    if (!alpha || options.matchAlpha && Math.abs(alpha - referenceAlpha) > tolerance) return false;
    return Math.abs((color & 255) - (reference & 255)) <= tolerance
      && Math.abs((color >>> 8 & 255) - (reference >>> 8 & 255)) <= tolerance
      && Math.abs((color >>> 16 & 255) - (reference >>> 16 & 255)) <= tolerance;
  };
  if (options.contiguous === false) {
    for (let i = 0; i < count; i++) if (matches(i)) mask[i] = 1;
    return mask;
  }
  const queue = new Uint32Array(count);
  let head = 0, tail = 1;
  queue[0] = seed; mask[seed] = 1;
  const enqueue = (i: number) => { if (!mask[i] && matches(i)) { mask[i] = 1; queue[tail++] = i; } };
  while (head < tail) {
    const i = queue[head++], xx = i % w, yy = Math.floor(i / w);
    if (xx) enqueue(i - 1);
    if (xx + 1 < w) enqueue(i + 1);
    if (yy) enqueue(i - w);
    if (yy + 1 < h) enqueue(i + w);
    if (connectivity === 8) {
      if (xx && yy) enqueue(i - w - 1);
      if (xx + 1 < w && yy) enqueue(i - w + 1);
      if (xx && yy + 1 < h) enqueue(i + w - 1);
      if (xx + 1 < w && yy + 1 < h) enqueue(i + w + 1);
    }
  }
  return mask;
}

/** Boolean mask composition; inputs are read-only and the result is normalized to zero/one. */
export function combinePixelSelections2D(
  a: ArrayLike<number>, b: ArrayLike<number>, operation: PixelSelectionOperation2D = 'add',
): Uint8Array {
  if (!a || !Number.isInteger(a.length) || a.length < 1 || a.length > MAX_CELLS)
    throw new RangeError('Pixel selections need 1..16777216 cells');
  checkMask(a, a.length, 'First selection'); checkMask(b, a.length, 'Second selection');
  if (!['replace', 'add', 'subtract', 'intersect', 'xor'].includes(operation)) throw new RangeError('Unknown pixel selection operation');
  const out = new Uint8Array(a.length);
  for (let i = 0; i < out.length; i++) {
    const left = !!a[i], right = !!b[i];
    out[i] = Number(operation === 'replace' ? right : operation === 'add' ? left || right
      : operation === 'subtract' ? left && !right : operation === 'intersect' ? left && right : left !== right);
  }
  return out;
}

// Lower envelope of equal-curvature parabolas: exact squared Euclidean distances in linear time.
function distanceLine(f: Float64Array, out: Float64Array, sites: Int32Array, boundaries: Float64Array, length: number): void {
  let k = 0;
  sites[0] = 0; boundaries[0] = -Infinity; boundaries[1] = Infinity;
  for (let q = 1; q < length; q++) {
    let p = sites[k], crossing = ((f[q] + q * q) - (f[p] + p * p)) / (2 * (q - p));
    while (crossing <= boundaries[k]) {
      p = sites[--k];
      crossing = ((f[q] + q * q) - (f[p] + p * p)) / (2 * (q - p));
    }
    sites[++k] = q; boundaries[k] = crossing; boundaries[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (boundaries[k + 1] < q) k++;
    out[q] = (q - sites[k]) ** 2 + f[sites[k]];
  }
}

/**
 * Grow (positive radius) or shrink (negative radius) a selection with an exact native Euclidean
 * disc. Canvas exterior is unselected for erosion. Radius zero returns a normalized copy.
 * This changes only the selection; it never smooths, fills or erases the artwork itself.
 * Time is O(w*h), independent of radius, and round corners do not acquire a diamond bias.
 */
export function resizePixelSelection2D(w: number, h: number, mask: ArrayLike<number>, radius: number): Uint8Array {
  const count = rasterSize(w, h);
  checkMask(mask, count, 'Selection');
  if (!Number.isInteger(radius) || Math.abs(radius) > MAX_DIMENSION) throw new RangeError('Selection radius must be an integer within -4096..4096');
  const out = Uint8Array.from(mask, v => v ? 1 : 0);
  if (!radius || !out.some(Boolean) || radius > 0 && out.every(Boolean)) return out;
  const erosion = radius < 0, far = (w + h + 2) ** 2;
  const size = Math.max(w, h) + 2, f = new Float64Array(size), d = new Float64Array(size);
  const sites = new Int32Array(size), boundaries = new Float64Array(size + 1), horizontal = new Uint32Array(count);
  for (let y = 0; y < h; y++) {
    f[0] = f[w + 1] = erosion ? 0 : far;
    for (let x = 0; x < w; x++) f[x + 1] = (!!mask[y * w + x] === !erosion) ? 0 : far;
    distanceLine(f, d, sites, boundaries, w + 2);
    for (let x = 0; x < w; x++) horizontal[y * w + x] = d[x + 1];
  }
  const squared = radius * radius;
  for (let x = 0; x < w; x++) {
    f[0] = f[h + 1] = erosion ? 0 : far;
    for (let y = 0; y < h; y++) f[y + 1] = horizontal[y * w + x];
    distanceLine(f, d, sites, boundaries, h + 2);
    for (let y = 0; y < h; y++) out[y * w + x] = Number(erosion ? !!mask[y * w + x] && d[y + 1] > squared : d[y + 1] <= squared);
  }
  return out;
}
