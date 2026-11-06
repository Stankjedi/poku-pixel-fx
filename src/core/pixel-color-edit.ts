import { hex } from './color.js';
import { ditherPattern2D } from './pixel-tools.js';
import type { PixelPaletteDither2D } from './pixel-palette.js';
import type { EditableSprite2D } from './sprite-edit.js';

/** Full native-raster masks. Nonzero selection permits an edit; protection always wins. */
export interface PixelColorRegion2D {
  selection?: ArrayLike<number>;
  protectedMask?: ArrayLike<number>;
}

export interface PixelColorReplacement2D {
  /** An exact opaque #rgb/#rrggbb or packed engine ABGR color. Source alpha is ignored. */
  from: string | number;
  /** Only this RGB is written; every source alpha value remains unchanged. */
  to: string | number;
}

export interface ResolvedPixelColorReplacerOptions2D {
  readonly replacements: readonly Readonly<{ from: number; to: number }>[];
}

export interface PixelRampMappingOptions2D {
  /** value uses perceptual Oklab lightness; spatial modes use native pixel centers. */
  mode?: 'value' | 'linear' | 'radial';
  /** Integer native pixel-center coordinates: [0,0] is the first cell. Default [0,0]. */
  start?: readonly [number, number];
  /** Linear endpoint or point on the radial circle. Default [1,0]. May lie outside the canvas. */
  end?: readonly [number, number];
  /** Only value mode: clamp (Oklab L - low)/(high - low). Default [0,1]. */
  valueRange?: readonly [number, number];
  /** Apply t ** gamma after clamping. 1/64..64; above 1 delays higher ramp entries. Default 1. */
  gamma?: number;
  /** No interpolation colors or alpha dithering. Default none. */
  dither?: PixelPaletteDither2D;
  /** Integer object origin for Bayer phase only; does not move the gradient. Default [0,0]. */
  origin?: readonly [number, number];
}

export interface ResolvedPixelRampMappingOptions2D {
  /** Exact authored order, including repeated entries. It is never automatically sorted. */
  readonly palette: readonly number[];
  readonly mode: 'value' | 'linear' | 'radial';
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly valueRange: readonly [number, number];
  readonly gamma: number;
  readonly dither: PixelPaletteDither2D;
  readonly origin: readonly [number, number];
}

const MAX_CELLS = 16_777_216;
const MAX_COORDINATE = 1_048_576;
const MAX_VALUE_CACHE = 8192;
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
});

function opaqueColor(value: string | number): number {
  if (typeof value === 'string') {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
      throw new RangeError('Pixel color edits need opaque #rgb or #rrggbb colors');
    return hex(value) >>> 0;
  }
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff || value >>> 24 !== 255)
    throw new RangeError('Packed pixel edit colors must be opaque ABGR integers');
  return value >>> 0;
}

function paletteColors(palette: readonly (string | number)[], minimum: number): number[] {
  if (!Array.isArray(palette) || palette.length < minimum || palette.length > 256)
    throw new RangeError(`Pixel color palette needs ${minimum}..256 opaque colors`);
  return Array.from(palette, opaqueColor);
}

function validateRegion(source: EditableSprite2D, region: PixelColorRegion2D): number {
  if (!source || typeof source !== 'object') throw new RangeError('Pixel color edits need a native raster');
  const { w, h } = source, count = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || count > MAX_CELLS
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || !source.mask || source.mask.w !== w || source.mask.h !== h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Pixel color edits need matching pixel/silhouette buffers (at most 16,777,216 cells)');
  if (!region || typeof region !== 'object' || Array.isArray(region)) throw new RangeError('Invalid pixel color edit region');
  for (const [name, mask] of [['Selection', region.selection], ['Protection', region.protectedMask]] as const) {
    if (mask === undefined) continue;
    if (!mask || mask.length !== count) throw new RangeError(`${name} must match the full native raster`);
    if (!(mask instanceof Uint8Array)) for (let i = 0; i < count; i++)
      if (!Number.isFinite(mask[i])) throw new RangeError(`${name} must contain finite native values`);
  }
  return count;
}

function cloneRaster<T extends EditableSprite2D>(source: T): T {
  return { ...source, pixels: source.pixels.slice(), mask: { ...source.mask, data: source.mask.data.slice() } };
}

function coordinatePair(value: readonly [number, number], name: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2
    || !Array.from(value).every(v => Number.isInteger(v) && Math.abs(v) <= MAX_COORDINATE))
    throw new RangeError(`${name} needs two integer native coordinates within ±1,048,576`);
  return Object.freeze([value[0], value[1]] as [number, number]);
}

// Oklab L from the same D65 reference matrix used by pixel-palette.ts. Only lightness
// is needed; source hue/chroma never changes the ordering of a caller's target ramp.
// https://bottosson.github.io/posts/oklab/ (2021 matrix revision).
function perceptualValue(color: number): number {
  const r = LINEAR[color & 255], g = LINEAR[color >>> 8 & 255], b = LINEAR[color >>> 16 & 255];
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return .2104542553 * l + .7936177850 * m - .0040720468 * s;
}

/** Explicit adoption of an unordered palette as a value ramp. Returns an independent
 * opaque palette ordered by Oklab lightness; equal lightness retains input order.
 * Exact RGB values and repeated entries are preserved. Authored ramps are never
 * implicitly passed through this operation by the replacement or ramp mappers. */
export function sortPixelColorsByLightness2D(palette: readonly (string | number)[]): number[] {
  return paletteColors(palette, 0).map((color, index) => ({ color, index, value: perceptualValue(color) }))
    .sort((a, b) => a.value - b.value || a.index - b.index).map(entry => entry.color);
}

/** Compile simultaneous exact RGB substitution. Every cell looks up its ORIGINAL RGB
 * exactly once, so A→B and B→A swaps do not cascade or collapse. A source RGB may appear
 * only once. The 0..4,096 entries are snapshotted; empty mappings are a copied no-op.
 * Pixels absent from the table remain byte-identical. Alpha, independent silhouette,
 * selection, protected details, hidden RGB and all unrelated metadata are retained. */
export function createPixelColorReplacer2D(replacements: readonly PixelColorReplacement2D[]) {
  if (!Array.isArray(replacements) || replacements.length > 4096)
    throw new RangeError('Exact color replacement accepts 0..4,096 entries');
  const table = new Map<number, number>();
  const entries = Array.from(replacements, entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new RangeError('A color replacement needs from/to colors');
    const from = opaqueColor(entry.from), to = opaqueColor(entry.to), key = from & 0xffffff;
    if (table.has(key)) throw new RangeError('Each replacement source RGB must be unique');
    table.set(key, to & 0xffffff);
    return Object.freeze({ from, to });
  });
  const options: ResolvedPixelColorReplacerOptions2D = Object.freeze({ replacements: Object.freeze(entries) });
  return {
    options,
    replace<T extends EditableSprite2D>(source: T, region: PixelColorRegion2D = {}): T {
      const count = validateRegion(source, region), out = cloneRaster(source);
      for (let i = 0; i < count; i++) {
        const before = source.pixels[i];
        if (!(before >>> 24) || !source.mask.data[i] || region.selection && !region.selection[i] || region.protectedMask?.[i]) continue;
        const mapped = table.get(before & 0xffffff);
        if (mapped !== undefined) out.pixels[i] = ((before & 0xff000000) | mapped) >>> 0;
      }
      return out;
    },
  };
}

export function replacePixelColors2D<T extends EditableSprite2D>(source: T,
  replacements: readonly PixelColorReplacement2D[], region: PixelColorRegion2D = {}): T {
  return createPixelColorReplacer2D(replacements).replace(source, region);
}

/** Compile a discrete, explicitly ordered color ramp for perceptual value or geometry.
 * Linear: t = dot(cell-start,end-start)/|end-start|². Radial: t = |cell-start|/|end-start|.
 * Integer coordinates denote pixel centers, so endpoints are directly selectable cells.
 * After clamp and t**gamma, each color occupies a sample position i/(palette.length-1).
 * With no dither, choose the nearest sample (halfway ties toward the higher index).
 * Bayer chooses ONLY the two adjacent entries at a stable native coordinate threshold.
 * No blur, invented colors, frame noise, RGB depth inference or alpha resampling occurs.
 */
export function createPixelRampMapper2D(palette: readonly (string | number)[], input: PixelRampMappingOptions2D = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid pixel ramp mapping options');
  const colors = Object.freeze(paletteColors(palette, 1)), mode = input.mode ?? 'value';
  if (!['value', 'linear', 'radial'].includes(mode)) throw new RangeError('Unknown pixel ramp mapping mode');
  const start = coordinatePair(input.start ?? [0, 0], 'Ramp start'), end = coordinatePair(input.end ?? [1, 0], 'Ramp end');
  const origin = coordinatePair(input.origin ?? [0, 0], 'Dither origin'), range = input.valueRange ?? [0, 1];
  if (!Array.isArray(range) || range.length !== 2 || !Array.from(range).every(Number.isFinite)
    || range[0] < 0 || range[1] > 1 || range[0] >= range[1])
    throw new RangeError('Ramp value range needs 0 ≤ low < high ≤ 1');
  const valueRange = Object.freeze([range[0], range[1]] as [number, number]);
  const gamma = input.gamma ?? 1, dither = input.dither ?? 'none';
  if (!Number.isFinite(gamma) || gamma < 1 / 64 || gamma > 64) throw new RangeError('Pixel ramp gamma must be within 1/64..64');
  if (!['none', 'bayer4', 'bayer8'].includes(dither)) throw new RangeError('Unknown pixel ramp dither');
  const dx = end[0] - start[0], dy = end[1] - start[1], lengthSquared = dx * dx + dy * dy;
  if (mode !== 'value' && !lengthSquared) throw new RangeError('Spatial ramp start and end must be distinct');
  const radius = Math.sqrt(lengthSquared), interval = valueRange[1] - valueRange[0];
  const pattern = dither === 'none' ? undefined : ditherPattern2D(dither === 'bayer8' ? 'dispersed8' : 'bayer4');
  const size = pattern?.size ?? 1, levels = size * size, last = colors.length - 1;
  const cache = new Map<number, number>();
  const options: ResolvedPixelRampMappingOptions2D = Object.freeze({ palette: colors, mode, start, end, valueRange, gamma, dither, origin });
  function valueCoordinate(color: number): number {
    const rgb = color & 0xffffff, known = cache.get(rgb);
    if (known !== undefined) return known;
    const t = (perceptualValue(rgb) - valueRange[0]) / interval;
    if (cache.size < MAX_VALUE_CACHE) cache.set(rgb, t);
    return t;
  }
  return {
    options,
    palette: colors,
    map<T extends EditableSprite2D>(source: T, region: PixelColorRegion2D = {}): T {
      const count = validateRegion(source, region), out = cloneRaster(source);
      const ox = ((origin[0] % size) + size) % size, oy = ((origin[1] % size) + size) % size;
      for (let i = 0; i < count; i++) {
        const before = source.pixels[i];
        if (!(before >>> 24) || !source.mask.data[i] || region.selection && !region.selection[i] || region.protectedMask?.[i]) continue;
        const x = i % source.w, y = Math.floor(i / source.w);
        const coordinate = mode === 'value' ? valueCoordinate(before) : mode === 'linear'
          ? ((x - start[0]) * dx + (y - start[1]) * dy) / lengthSquared
          : Math.hypot(x - start[0], y - start[1]) / radius;
        const t = Math.max(0, Math.min(1, coordinate)), position = (gamma === 1 ? t : t ** gamma) * last;
        let index = Math.floor(position + .5);
        if (pattern) {
          const low = Math.floor(position), amount = position - low;
          const threshold = (pattern.values[((y + oy) % size) * size + ((x + ox) % size)] + .5) / levels;
          index = Math.min(last, low + Number(amount > threshold));
        }
        out.pixels[i] = ((before & 0xff000000) | (colors[index] & 0xffffff)) >>> 0;
      }
      return out;
    },
  };
}

export function mapPixelRamp2D<T extends EditableSprite2D>(source: T, palette: readonly (string | number)[],
  options: PixelRampMappingOptions2D = {}, region: PixelColorRegion2D = {}): T {
  return createPixelRampMapper2D(palette, options).map(source, region);
}
