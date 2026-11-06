import type { EditableSprite2D } from './sprite-edit.js';
import type { MaterialChannels2D } from './material-surface.js';
import type { PixelBrushPoint2D, PixelBrushSymmetry2D } from './pixel-brush.js';

export type PixelHeightSculptMode2D = 'raise' | 'lower' | 'flatten' | 'smooth';

export interface PixelHeightDeltaOptions2D {
  /** Nonnegative multiplier for saved native-height deltas. Default: 1. */
  strength?: number;
  /** Repeat height samples at both canvas boundaries. Also supports one-cell axes. */
  wrap?: boolean;
  /** Preserve both height and authored normals at nonzero cells. */
  protectedMask?: ArrayLike<number>;
  /** Initial form height when the source has no channels. Existing channels take precedence. */
  height?: ArrayLike<number>;
}

export interface PixelHeightSculptOptions2D extends PixelHeightDeltaOptions2D {
  mode?: PixelHeightSculptMode2D;
  /** Integer full-pressure diameter, 1..256 native cells. Default: 16. */
  size?: number;
  /** Flat inner radius as a fraction of the brush radius, 0..1. Default: .5. */
  hardness?: number;
  /** Native target height for flatten. Default: 0. */
  targetHeight?: number;
  symmetry?: PixelBrushSymmetry2D;
  /** Restricts height writes. Neighboring unprotected normals may still need updating. */
  selection?: ArrayLike<number>;
}

export interface PixelHeightSculptResult2D<T extends EditableSprite2D = EditableSprite2D> {
  sprite: T & { channels: MaterialChannels2D };
  /** Actual height edits only; normal-only neighbor updates are not included. */
  touched: Uint8Array;
  /** Full-canvas float32 additive deltas. Unchanged cells contain zero. */
  deltas: Float32Array;
}

export interface PixelHeightNormalRefreshOptions2D {
  wrap?: boolean;
  protectedMask?: ArrayLike<number>;
}

type SurfaceSprite = EditableSprite2D & { channels?: MaterialChannels2D };
type NativePoint = { x: number; y: number; pressure: number };
const MAX_DIMENSION = 4096, MAX_POINTS = 65_536, MAX_COORDINATE = 1_048_576;
const MAX_COVERAGE_CELLS = 33_554_432;

function finite32(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
    throw new RangeError(`${label} must be a finite float32 value`);
  return value;
}
function checkBuffer(values: ArrayLike<number> | undefined, count: number, label: string, float = false): void {
  if (values === undefined) return;
  if (!values || values.length !== count) throw new RangeError(`${label} must match the native raster`);
  if (!float && values instanceof Uint8Array) return;
  for (let i = 0; i < count; i++) {
    if (float) finite32(values[i], label);
    else if (!Number.isFinite(values[i])) throw new RangeError(`${label} must contain finite values`);
  }
}
function checkSource(source: SurfaceSprite): number {
  if (!source || typeof source !== 'object') throw new RangeError('Height editing needs a native sprite');
  const { w, h } = source, count = w * h, c = source.channels;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || !source.mask || source.mask.w !== w || source.mask.h !== h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Height editing needs matching native color and silhouette buffers');
  if (c !== undefined) {
    if (!c || c.w !== w || c.h !== h || !(c.material instanceof Uint16Array) || c.material.length !== count
      || !(c.height instanceof Float32Array) || c.height.length !== count
      || !(c.normal instanceof Float32Array) || c.normal.length !== count * 3)
      throw new RangeError('Height editing needs matching material, height and normal buffers');
    if (!c.height.every(Number.isFinite) || !c.normal.every(Number.isFinite))
      throw new RangeError('Source height and normals must be finite');
  }
  return count;
}
function deltaOptions(input: PixelHeightDeltaOptions2D, count: number) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Height editing needs options');
  const strength = finite32(input.strength ?? 1, 'Height strength'), wrap = input.wrap ?? false;
  if (strength < 0) throw new RangeError('Height strength must be nonnegative');
  if (typeof wrap !== 'boolean') throw new RangeError('Height wrap must be boolean');
  checkBuffer(input.protectedMask, count, 'Height protection');
  checkBuffer(input.height, count, 'Initial height', true);
  return { strength, wrap, protectedMask: input.protectedMask, height: input.height };
}
function occupied(source: EditableSprite2D, i: number): boolean {
  return !!source.mask.data[i] && !!(source.pixels[i] >>> 24);
}
function modulo(value: number, period: number): number { return (value % period + period) % period; }

/** One-sided derivatives preserve a plane's slope at the canvas and silhouette boundaries. */
function writeNormal(source: EditableSprite2D, values: Float32Array, out: Float32Array, i: number, wrap: boolean): void {
  const { w, h } = source, x = i % w, y = Math.floor(i / w), center = values[i];
  const neighbor = (xx: number, yy: number): number => {
    if (wrap) { xx = modulo(xx, w); yy = modulo(yy, h); }
    else if (xx < 0 || yy < 0 || xx >= w || yy >= h) return -1;
    const j = yy * w + xx;
    return occupied(source, j) ? j : -1;
  };
  const slope = (before: number, after: number) => before >= 0 && after >= 0 ? (values[before] - values[after]) * .5
    : before >= 0 ? values[before] - center : after >= 0 ? center - values[after] : 0;
  const nx = slope(neighbor(x - 1, y), neighbor(x + 1, y));
  const ny = slope(neighbor(x, y - 1), neighbor(x, y + 1)), length = Math.hypot(nx, ny, 1);
  out[i * 3] = nx / length; out[i * 3 + 1] = ny / length; out[i * 3 + 2] = 1 / length;
}

function normalNeighborhood(w: number, h: number, changed: ArrayLike<number>, wrap: boolean): Uint8Array | undefined {
  let dirty: Uint8Array | undefined;
  const mark = (x: number, y: number) => {
    if (wrap) { x = modulo(x, w); y = modulo(y, h); }
    if (x >= 0 && y >= 0 && x < w && y < h) dirty![y * w + x] = 1;
  };
  for (let i = 0; i < w * h; i++) if (changed[i]) {
    dirty ??= new Uint8Array(w * h);
    const x = i % w, y = Math.floor(i / w);
    mark(x, y); mark(x - 1, y); mark(x + 1, y); mark(x, y - 1); mark(x, y + 1);
  }
  return dirty;
}

/**
 * Refresh explicit height normals after paint changes the silhouette. `changed` is a
 * full-canvas mask of occupancy/geometry changes, not a color-difference mask. Only those
 * cells and their four neighbors may change, and protected authored normals stay exact.
 * Height, material IDs, color, silhouette and other metadata retain their source values
 * and buffers. Empty/color-only changes are an exact identity operation.
 */
export function refreshPixelHeightNormals2D<T extends EditableSprite2D>(
  source: T & { channels: MaterialChannels2D }, changed: ArrayLike<number>, input: PixelHeightNormalRefreshOptions2D = {},
): T & { channels: MaterialChannels2D } {
  const count = checkSource(source);
  if (!source.channels) throw new RangeError('Normal refresh requires existing height channels');
  if (!changed) throw new RangeError('Normal refresh needs a native change mask');
  checkBuffer(changed, count, 'Normal refresh changes');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Normal refresh needs options');
  const wrap = input.wrap ?? false;
  if (typeof wrap !== 'boolean') throw new RangeError('Normal refresh wrap must be boolean');
  checkBuffer(input.protectedMask, count, 'Normal refresh protection');
  const dirty = normalNeighborhood(source.w, source.h, changed, wrap);
  if (!dirty) return source;
  const normal = source.channels.normal.slice();
  let updated = false;
  for (let i = 0; i < count; i++) if (dirty[i] && !input.protectedMask?.[i] && occupied(source, i)) {
    writeNormal(source, source.channels.height, normal, i, wrap);
    const j = i * 3;
    if (normal[j] !== source.channels.normal[j] || normal[j + 1] !== source.channels.normal[j + 1]
      || normal[j + 2] !== source.channels.normal[j + 2]) updated = true;
  }
  return updated ? { ...source, channels: { ...source.channels, normal } } : source;
}

function finishSurface<T extends EditableSprite2D>(
  source: T, baseline: Float32Array, changed: Float32Array | undefined, touched: Uint8Array | undefined,
  wrap: boolean, protection?: ArrayLike<number>,
): T & { channels: MaterialChannels2D } {
  const original = (source as SurfaceSprite).channels;
  if (original && !changed) return source as T & { channels: MaterialChannels2D };
  const count = source.w * source.h, heights = changed ?? baseline;
  const channels: MaterialChannels2D = {
    ...original, w: source.w, h: source.h,
    material: original ? original.material.slice() : new Uint16Array(count),
    height: heights, normal: original ? original.normal.slice() : new Float32Array(count * 3),
  };
  if (!original) {
    for (let i = 0; i < count; i++) {
      channels.normal[i * 3 + 2] = 1;
      if (occupied(source, i)) writeNormal(source, protection?.[i] ? baseline : heights, channels.normal, i, wrap);
    }
  } else if (touched) {
    // Central differences depend on the edited cell and its four immediate neighbors.
    // Include the edited cell itself because one-sided differences use its height.
    const dirty = normalNeighborhood(source.w, source.h, touched, wrap);
    for (let i = 0; i < count; i++) if (dirty?.[i] && !protection?.[i] && occupied(source, i))
      writeNormal(source, heights, channels.normal, i, wrap);
  }
  // Color, independent silhouette, HDR, semantic masks and placement are not edited.
  return { ...source, channels };
}

/**
 * Replay sorted sparse additive height edits. An empty edit initializes usable flat/form
 * channels on an unshaded PNG; existing channels with no actual change remain byte-identical.
 * Deltas are normalized to float32 before scaling, then the final height is rounded once.
 * New/updated normals use +x right, +y down, +z toward the viewer. Protected normals retain
 * their original authored values, even beside an edit; other one-cell neighbors are refreshed.
 * All validation and arithmetic use private buffers, so a failure never changes the input.
 */
export function applyPixelHeightDeltas2D<T extends EditableSprite2D>(
  source: T, indices: ArrayLike<number>, deltas: ArrayLike<number>, input: PixelHeightDeltaOptions2D = {},
): T & { channels: MaterialChannels2D } {
  const count = checkSource(source), options = deltaOptions(input, count);
  if (!indices || !Number.isInteger(indices.length) || indices.length < 0 || indices.length > count
    || !deltas || deltas.length !== indices.length) throw new RangeError('Height deltas need matching sparse indices and values');
  let previous = -1;
  for (let j = 0; j < indices.length; j++) {
    const i = indices[j];
    if (!Number.isInteger(i) || i <= previous || i >= count) throw new RangeError('Height indices must be sorted, unique and inside the raster');
    previous = i; finite32(deltas[j], 'Height delta');
  }
  const existing = (source as SurfaceSprite).channels;
  const baseline = existing?.height ?? (options.height ? Float32Array.from(options.height) : new Float32Array(count));
  let changed: Float32Array | undefined, touched: Uint8Array | undefined;
  for (let j = 0; j < indices.length; j++) {
    const i = indices[j];
    if (!options.strength || options.protectedMask?.[i] || !occupied(source, i)) continue;
    const next = Math.fround(baseline[i] + Math.fround(deltas[j]) * options.strength);
    finite32(next, 'Resulting height');
    if (next === baseline[i]) continue;
    changed ??= baseline.slice(); touched ??= new Uint8Array(count);
    changed[i] = next; touched[i] = 1;
  }
  return finishSurface(source, baseline, changed, touched, options.wrap, options.protectedMask);
}

function nativePoints(points: readonly PixelBrushPoint2D[]): NativePoint[] {
  if (!Array.isArray(points) || points.length > MAX_POINTS) throw new RangeError('A height stroke supports at most 65536 pointer samples');
  const out: NativePoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== 'object' || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || Math.abs(point.x) > MAX_COORDINATE || Math.abs(point.y) > MAX_COORDINATE)
      throw new RangeError('Height brush coordinates must be finite and within +/-1048576');
    const pressure = point.pressure ?? 1;
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) throw new RangeError('Height brush pressure must be within 0..1');
    const next = { x: Math.floor(point.x), y: Math.floor(point.y), pressure }, last = out.at(-1);
    if (last && last.x === next.x && last.y === next.y && last.pressure === next.pressure) continue;
    // Remove only redundant straight points with the same linearly interpolated pressure.
    // This also makes dense/coalesced native pointer samples share the same arithmetic.
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const ux = b.x - a.x, uy = b.y - a.y, vx = next.x - b.x, vy = next.y - b.y;
      const dx = next.x - a.x, dy = next.y - a.y;
      if (ux * vy !== uy * vx || ux * vx + uy * vy < 0 || !(dx || dy)) break;
      const t = Math.abs(dx) >= Math.abs(dy) ? (b.x - a.x) / dx : (b.y - a.y) / dy;
      if (Math.abs(a.pressure + (next.pressure - a.pressure) * t - b.pressure) > 1e-12) break;
      out.pop();
    }
    out.push(next);
  }
  return out;
}

/** Exact minimum distance/radius along a linearly widening/narrowing brush sweep.
 * The stationary point of |P-A-t(B-A)|² / (r0+t*dr)² is a linear equation in t. */
function sweepDistance(x: number, y: number, ax: number, ay: number, dx: number, dy: number, r0: number, dr: number): number {
  const ex = ax - x, ey = ay - y;
  const score = (t: number) => {
    const radius = r0 + dr * t;
    return radius > 0 ? Math.hypot(ex + dx * t, ey + dy * t) / radius : Infinity;
  };
  let best = Math.min(score(0), score(1));
  const a = dx * dx + dy * dy, b = 2 * (ex * dx + ey * dy), c = ex * ex + ey * ey;
  const denominator = 2 * a * r0 - b * dr;
  if (denominator) {
    const t = (2 * c * dr - b * r0) / denominator;
    if (t > 0 && t < 1) best = Math.min(best, score(t));
  }
  return best;
}

function sweptCoverage(w: number, h: number, points: NativePoint[], size: number, hardness: number, wrap: boolean, symmetry: PixelBrushSymmetry2D): Float32Array {
  const coverage = new Float32Array(w * h), center = size % 2 ? 0 : .5, radius = size * .5;
  let candidates = 0;
  const segment = (a: NativePoint, b: NativePoint) => {
    const maximum = radius * Math.max(a.pressure, b.pressure);
    if (!(maximum > 0)) return;
    const ax = a.x + center, ay = a.y + center, dx = b.x - a.x, dy = b.y - a.y;
    const r0 = radius * a.pressure, dr = radius * (b.pressure - a.pressure);
    let firstY = Math.ceil(Math.min(ay, ay + dy) - maximum), lastY = Math.floor(Math.max(ay, ay + dy) + maximum);
    if (!wrap) { firstY = Math.max(0, firstY); lastY = Math.min(h - 1, lastY); }
    for (let y = firstY; y <= lastY; y++) {
      let firstT = 0, lastT = 1;
      if (dy) {
        const t0 = (y - maximum - ay) / dy, t1 = (y + maximum - ay) / dy;
        firstT = Math.max(0, Math.min(t0, t1)); lastT = Math.min(1, Math.max(t0, t1));
        if (firstT > lastT) continue;
      }
      const x0 = ax + dx * firstT, x1 = ax + dx * lastT;
      let firstX = Math.ceil(Math.min(x0, x1) - maximum), lastX = Math.floor(Math.max(x0, x1) + maximum);
      if (!wrap) { firstX = Math.max(0, firstX); lastX = Math.min(w - 1, lastX); }
      if (firstX > lastX) continue;
      candidates += lastX - firstX + 1;
      if (candidates > MAX_COVERAGE_CELLS) throw new RangeError('Height stroke exceeds its 33554432 native coverage-cell budget');
      const yy = wrap ? modulo(y, h) : y;
      for (let x = firstX; x <= lastX; x++) {
        const distance = sweepDistance(x, y, ax, ay, dx, dy, r0, dr);
        if (!(distance <= 1)) continue;
        const t = hardness === 1 || distance <= hardness ? 0 : (distance - hardness) / (1 - hardness);
        const value = 1 - t * t * (3 - 2 * t), i = yy * w + (wrap ? modulo(x, w) : x);
        if (value > coverage[i]) coverage[i] = value;
      }
    }
  };
  if (points.length === 1) segment(points[0], points[0]);
  else for (let i = 1; i < points.length; i++) segment(points[i - 1], points[i]);
  if (symmetry === 'x' || symmetry === 'xy') for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) {
    const a = y * w + x, b = y * w + w - 1 - x;
    coverage[a] = coverage[b] = Math.max(coverage[a], coverage[b]);
  }
  if (symmetry === 'y' || symmetry === 'xy') for (let y = 0; y < h / 2; y++) for (let x = 0; x < w; x++) {
    const a = y * w + x, b = (h - y - 1) * w + x;
    coverage[a] = coverage[b] = Math.max(coverage[a], coverage[b]);
  }
  return coverage;
}

function localHeight(source: EditableSprite2D, values: Float32Array, i: number, wrap: boolean): number {
  const { w, h } = source, x = i % w, y = Math.floor(i / w);
  let sum = 0, weight = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let xx = x + dx, yy = y + dy;
    if (wrap) { xx = modulo(xx, w); yy = modulo(yy, h); }
    else if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const j = yy * w + xx;
    if (!occupied(source, j)) continue;
    const part = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
    sum += values[j] * part; weight += part;
  }
  return weight ? sum / weight : values[i];
}

/**
 * Sculpt explicit geometry without changing a single color, alpha, mask or HDR value.
 * A stroke uses the maximum continuous swept brush coverage, never a sum of stamps.
 * Repeated points, overlapping mirrors and revisiting a cell cannot deepen one gesture.
 * Pressure linearly changes the radius along each segment; zero-pressure points emit no
 * isolated stamp. Native positions snap down, with a half-cell even-diameter center.
 *
 * Raise/lower use strength in native height units. Flatten and smooth use min(1,strength)
 * as their blend, with a smooth radial falloff beyond hardness. Smooth edits only the
 * authored height toward its occupied 3x3 weighted neighborhood from the pre-stroke map;
 * surface colors and protected detail are never blurred. Return deltas replay exactly
 * through applyPixelHeightDeltas2D at strength 1, including float32 rounding.
 */
export function sculptPixelHeight2D<T extends EditableSprite2D>(
  source: T, points: readonly PixelBrushPoint2D[], input: PixelHeightSculptOptions2D = {},
): PixelHeightSculptResult2D<T> {
  const count = checkSource(source), options = deltaOptions(input, count);
  const mode = input.mode ?? 'raise', size = input.size ?? 16, hardness = input.hardness ?? .5;
  const targetHeight = finite32(input.targetHeight ?? 0, 'Flatten target height'), symmetry = input.symmetry ?? 'none';
  if (!['raise', 'lower', 'flatten', 'smooth'].includes(mode)) throw new RangeError('Unknown height sculpt mode');
  if (!Number.isInteger(size) || size < 1 || size > 256) throw new RangeError('Height brush size must be an integer within 1..256');
  if (!Number.isFinite(hardness) || hardness < 0 || hardness > 1) throw new RangeError('Height hardness must be within 0..1');
  if (!['none', 'x', 'y', 'xy'].includes(symmetry)) throw new RangeError('Unknown height brush symmetry');
  checkBuffer(input.selection, count, 'Height selection');
  const native = nativePoints(points), coverage = sweptCoverage(source.w, source.h, native, size, hardness, options.wrap, symmetry);
  const original = (source as SurfaceSprite).channels;
  const baseline = original?.height ?? (options.height ? Float32Array.from(options.height) : new Float32Array(count));
  const touched = new Uint8Array(count), deltas = new Float32Array(count);
  let changed: Float32Array | undefined;
  for (let i = 0; i < count; i++) {
    if (!options.strength || !coverage[i] || !occupied(source, i) || options.protectedMask?.[i] || input.selection && !input.selection[i]) continue;
    const base = baseline[i], weight = coverage[i];
    const wanted = mode === 'raise' ? base + options.strength * weight : mode === 'lower' ? base - options.strength * weight
      : base + ((mode === 'flatten' ? targetHeight : localHeight(source, baseline, i, options.wrap)) - base) * Math.min(1, options.strength) * weight;
    finite32(wanted, 'Sculpted height');
    const delta = Math.fround(Math.fround(wanted) - base);
    finite32(delta, 'Sculpted height delta');
    // Use the persisted delta for the displayed result, so save/reopen cannot diverge.
    const next = Math.fround(base + delta);
    finite32(next, 'Resulting height');
    if (next === base) continue;
    changed ??= baseline.slice(); changed[i] = next; touched[i] = 1; deltas[i] = delta;
  }
  return { sprite: finishSurface(source, baseline, changed, touched, options.wrap, options.protectedMask), touched, deltas };
}
