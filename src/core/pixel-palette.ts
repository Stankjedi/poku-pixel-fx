import { hex } from './color.js';
import { ditherPattern2D } from './pixel-tools.js';
import type { EditableSprite2D } from './sprite-edit.js';

export type PixelPaletteDither2D = 'none' | 'bayer4' | 'bayer8';

export interface PixelPaletteRegion2D {
  /** Nonzero cells participate. Masks use the full native raster, not a cropped bounding box. */
  selection?: ArrayLike<number>;
  /** Protected cells neither contribute to extraction nor receive a remapped color. */
  protectedMask?: ArrayLike<number>;
}

export interface PixelPaletteExtractionOptions2D extends PixelPaletteRegion2D {
  /** Maximum palette size, including locked colors. 1..256; default: 16. */
  colors?: number;
  /** Exact opaque colors retained first, in the supplied order, even if absent from the source. */
  locked?: readonly (string | number)[];
  /** Deterministic weighted centroid refinement passes, 1..16; default: 4. */
  iterations?: number;
}

export interface PixelPaletteRemapOptions2D extends PixelPaletteRegion2D {
  /** Explicit color dithering. It never dithers alpha or changes source coverage. Default: none. */
  dither?: PixelPaletteDither2D;
  /** 0 chooses the nearest color; 1 uses the complete ordered mixture. Default: 1. */
  strength?: number;
  /** Object coordinate of cell (0,0); placement metadata is deliberately ignored. */
  origin?: readonly [number, number];
}

export interface ResolvedPixelPaletteMapperOptions2D {
  readonly palette: readonly number[];
  readonly dither: PixelPaletteDither2D;
  readonly strength: number;
}

export interface PixelPaletteRampOptions2D {
  shadow: string | number;
  highlight: string | number;
  midtone?: string | number;
  /** Number of discrete colors, 2..256; default: 12. Repeated colors are allowed. */
  colors?: number;
  /** Position of the authored midtone inside 0..1; default: .5. */
  midpoint?: number;
}

type Vector = [number, number, number];
interface Sample { color: number; lab: Vector; weight: number }
interface Mixture { a: number; b: number; amount: number }

const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
});
const MAX_EXACT_COLORS = 8192;
const HISTOGRAM_BINS = 32 ** 3;
const MAX_MAPPING_CACHE = 8192;

function opaqueColor(value: string | number): number {
  if (typeof value === 'string') {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
      throw new RangeError('Pixel palette colors must be #rgb or #rrggbb');
    return hex(value) >>> 0;
  }
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff || value >>> 24 !== 255)
    throw new RangeError('Packed pixel palette colors must be opaque ABGR integers');
  return value >>> 0;
}

function countInRange(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be an integer within ${minimum}..${maximum}`);
  return value;
}

function validateRegion(source: EditableSprite2D, region: PixelPaletteRegion2D): number {
  const { w, h } = source, count = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || count > 16_777_216
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || source.mask.w !== w || source.mask.h !== h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Pixel palette tools need matching native pixel and silhouette buffers');
  for (const [name, mask] of [['Selection', region.selection], ['Protected mask', region.protectedMask]] as const) {
    if (mask === undefined) continue;
    if (mask.length !== count) throw new RangeError(`${name} must match native raster dimensions`);
    for (let i = 0; i < count; i++) if (!Number.isFinite(mask[i]))
      throw new RangeError(`${name} must contain finite values`);
  }
  return count;
}

function linearRGB(color: number): Vector {
  return [LINEAR[color & 255], LINEAR[color >>> 8 & 255], LINEAR[color >>> 16 & 255]];
}

// D65 Oklab transforms from Björn Ottosson's public-domain reference formulas:
// https://bottosson.github.io/posts/oklab/ (2021 matrix revision).
function linearToLab(r: number, g: number, b: number): Vector {
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [
    .2104542553 * l + .7936177850 * m - .0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .8086757660 * s,
  ];
}

function colorToLab(color: number): Vector {
  return linearToLab(LINEAR[color & 255], LINEAR[color >>> 8 & 255], LINEAR[color >>> 16 & 255]);
}

function labToLinear(L: number, a: number, b: number): Vector {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (L - .0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.7076147010 * s,
  ];
}

const distanceSquared = (a: Vector, b: Vector): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function inGamut(rgb: Vector): boolean {
  return rgb.every(value => value >= -1e-7 && value <= 1 + 1e-7);
}

function encodeChannel(linear: number): number {
  const value = Math.max(0, Math.min(1, linear));
  return Math.round(255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055));
}

/** Reduce chroma along a fixed lightness/hue ray instead of clipping unrelated RGB channels. */
function labToColor(lab: Vector): number {
  const [L, a, b] = lab;
  let rgb = labToLinear(L, a, b);
  if (!inGamut(rgb)) {
    let low = 0, high = 1;
    for (let step = 0; step < 20; step++) {
      const middle = (low + high) / 2;
      if (inGamut(labToLinear(L, a * middle, b * middle))) low = middle;
      else high = middle;
    }
    rgb = labToLinear(L, a * low, b * low);
  }
  return (0xff000000 | encodeChannel(rgb[2]) << 16 | encodeChannel(rgb[1]) << 8 | encodeChannel(rgb[0])) >>> 0;
}

/** The exact histogram grows only to 8,192 colors. Larger images switch to 32,768 fixed
 * 5-bit RGB bins with alpha-weighted original color sums, not arbitrarily skipped pixels.
 * Integer sums keep this reduction independent of traversal order. */
function samplesFrom(source: EditableSprite2D, region: PixelPaletteRegion2D): Sample[] {
  let exact: Map<number, number> | undefined = new Map();
  let weight: Float64Array | undefined, red: Float64Array | undefined;
  let green: Float64Array | undefined, blue: Float64Array | undefined;
  const addBin = (color: number, alpha: number): void => {
    const r = color & 255, g = color >>> 8 & 255, b = color >>> 16 & 255;
    const bin = (r >>> 3) | (g >>> 3) << 5 | (b >>> 3) << 10;
    weight![bin] += alpha; red![bin] += r * alpha; green![bin] += g * alpha; blue![bin] += b * alpha;
  };
  for (let i = 0; i < source.pixels.length; i++) {
    const packed = source.pixels[i], alpha = packed >>> 24;
    if (!alpha || !source.mask.data[i] || region.selection && !region.selection[i] || region.protectedMask?.[i]) continue;
    const color = (packed | 0xff000000) >>> 0;
    if (exact) {
      const previous = exact.get(color);
      if (previous !== undefined) { exact.set(color, previous + alpha); continue; }
      if (exact.size < MAX_EXACT_COLORS) { exact.set(color, alpha); continue; }
      weight = new Float64Array(HISTOGRAM_BINS); red = new Float64Array(HISTOGRAM_BINS);
      green = new Float64Array(HISTOGRAM_BINS); blue = new Float64Array(HISTOGRAM_BINS);
      for (const [entry, coverage] of exact) addBin(entry, coverage);
      exact = undefined;
    }
    addBin(color, alpha);
  }
  if (exact) return [...exact].sort((a, b) => a[0] - b[0])
    .map(([color, weight]) => ({ color, weight, lab: colorToLab(color) }));
  const samples: Sample[] = [];
  for (let bin = 0; bin < HISTOGRAM_BINS; bin++) {
    const coverage = weight![bin];
    if (!coverage) continue;
    const color = (0xff000000 | Math.round(blue![bin] / coverage) << 16
      | Math.round(green![bin] / coverage) << 8 | Math.round(red![bin] / coverage)) >>> 0;
    samples.push({ color, weight: coverage, lab: colorToLab(color) });
  }
  return samples;
}

function sortByLightness(colors: number[]): number[] {
  return colors.map(color => ({ color, lab: colorToLab(color) }))
    .sort((a, b) => a.lab[0] - b.lab[0] || a.color - b.color).map(entry => entry.color);
}

/** Extract an explicit palette from visible native cells using alpha-weighted Oklab centroids.
 * Existing colors are exact when they fit the budget. Locked colors stay exact and keep their
 * supplied order; new entries are ordered by perceptual lightness. Transparent or masked pixels
 * never contribute hidden RGB. No randomness, spatial resampling, or source mutation is used.
 * Empty selections return only locks; quantized duplicate centroids may yield fewer than `colors`.
 */
export function extractPixelPalette2D(source: EditableSprite2D, options: PixelPaletteExtractionOptions2D = {}): number[] {
  validateRegion(source, options);
  const colors = countInRange(options.colors ?? 16, 1, 256, 'Pixel palette size');
  const iterations = countInRange(options.iterations ?? 4, 1, 16, 'Palette refinement passes');
  if (options.locked !== undefined && !Array.isArray(options.locked))
    throw new RangeError('Locked pixel palette colors must be an array');
  const locked = Array.from(new Set((options.locked ?? []).map(opaqueColor)));
  if (locked.length > colors) throw new RangeError('Locked colors exceed the requested palette size');
  if (locked.length === colors) return locked;
  const samples = samplesFrom(source, options), used = new Set(locked);
  if (!samples.length) return locked;
  const unpinned = samples.filter(sample => !used.has(sample.color));
  if (unpinned.length + locked.length <= colors)
    return [...locked, ...sortByLightness(unpinned.map(sample => sample.color))];

  const centers: Vector[] = locked.map(colorToLab);
  if (!centers.length) {
    let total = 0, L = 0, a = 0, b = 0;
    for (const sample of samples) {
      total += sample.weight; L += sample.lab[0] * sample.weight;
      a += sample.lab[1] * sample.weight; b += sample.lab[2] * sample.weight;
    }
    centers.push([L / total, a / total, b / total]);
  }
  const nearest = new Float64Array(samples.length).fill(Infinity);
  const includeCenter = (center: Vector): void => {
    for (let i = 0; i < samples.length; i++)
      nearest[i] = Math.min(nearest[i], distanceSquared(samples[i].lab, center));
  };
  for (const center of centers) includeCenter(center);
  while (centers.length < colors) {
    let best = -1, error = 0;
    for (let i = 0; i < samples.length; i++) {
      const candidate = nearest[i] * samples[i].weight;
      if (candidate > error) { error = candidate; best = i; }
    }
    if (best < 0 || error <= 1e-20) break;
    const center: Vector = [...samples[best].lab]; centers.push(center); includeCenter(center);
  }

  const totals = new Float64Array(centers.length * 4);
  for (let iteration = 0; iteration < iterations; iteration++) {
    totals.fill(0);
    for (const sample of samples) {
      let best = 0, error = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const candidate = distanceSquared(sample.lab, centers[i]);
        if (candidate < error) { error = candidate; best = i; }
      }
      const offset = best * 4;
      totals[offset] += sample.weight;
      for (let channel = 0; channel < 3; channel++) totals[offset + channel + 1] += sample.lab[channel] * sample.weight;
    }
    let movement = 0;
    for (let i = locked.length; i < centers.length; i++) {
      const offset = i * 4, total = totals[offset];
      if (!total) continue;
      const next: Vector = [totals[offset + 1] / total, totals[offset + 2] / total, totals[offset + 3] / total];
      movement = Math.max(movement, distanceSquared(centers[i], next)); centers[i] = next;
    }
    if (movement < 1e-14) break;
  }
  const additions: number[] = [];
  for (let i = locked.length; i < centers.length; i++) {
    const color = labToColor(centers[i]);
    if (!used.has(color)) { used.add(color); additions.push(color); }
  }
  return [...locked, ...sortByLightness(additions)];
}

/** Compile a palette once for repeated cel/layer mapping. Oklab chooses the nearest color.
 * Ordered dithering chooses a partner for that nearest color by evaluating the linear-light
 * mixture's perceptual error with a small contrast penalty, avoiding unnecessary distant-color
 * speckling. Exact palette entries are never dithered. The bounded cache has no temporal state.
 */
export function createPixelPaletteMapper2D(palette: readonly (string | number)[],
  input: Pick<PixelPaletteRemapOptions2D, 'dither' | 'strength'> = {}) {
  if (!Array.isArray(palette) || !palette.length || palette.length > 256)
    throw new RangeError('Pixel palette mapping needs 1..256 colors');
  const colors = Object.freeze(Array.from(palette, opaqueColor)), dither = input.dither ?? 'none', strength = input.strength ?? 1;
  if (!['none', 'bayer4', 'bayer8'].includes(dither)) throw new RangeError('Unknown pixel palette dither');
  if (!Number.isFinite(strength) || strength < 0 || strength > 1)
    throw new RangeError('Pixel palette dither strength must be within 0..1');
  const options: ResolvedPixelPaletteMapperOptions2D = Object.freeze({ palette: colors, dither, strength });
  const exact = new Map<number, number>();
  colors.forEach((color, index) => { if (!exact.has(color)) exact.set(color, index); });
  const labs = colors.map(colorToLab), linear = colors.map(linearRGB), cache = new Map<number, Mixture>();
  const pattern = dither === 'none' ? undefined : ditherPattern2D(dither === 'bayer8' ? 'dispersed8' : 'bayer4');

  const mixture = (color: number): Mixture => {
    const key = (color | 0xff000000) >>> 0, known = exact.get(key);
    if (known !== undefined) return { a: known, b: known, amount: 0 };
    const hit = cache.get(key); if (hit) return hit;
    const target = colorToLab(key);
    let nearest = 0, bestScore = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const error = distanceSquared(target, labs[i]);
      if (error < bestScore) { bestScore = error; nearest = i; }
    }
    let result: Mixture = { a: nearest, b: nearest, amount: 0 };
    if (pattern && strength > 0) {
      const q = linearRGB(key), base = linear[nearest];
      for (let partner = 0; partner < colors.length; partner++) {
        if (partner === nearest) continue;
        const other = linear[partner], dr = other[0] - base[0], dg = other[1] - base[1], db = other[2] - base[2];
        const length = .2126 * dr * dr + .7152 * dg * dg + .0722 * db * db;
        if (length < 1e-20) continue;
        const t = Math.max(0, Math.min(1, (.2126 * (q[0] - base[0]) * dr
          + .7152 * (q[1] - base[1]) * dg + .0722 * (q[2] - base[2]) * db) / length));
        if (t <= 0 || t >= 1) continue;
        const mixed = linearToLab(base[0] + dr * t, base[1] + dg * t, base[2] + db * t);
        const score = distanceSquared(target, mixed) + .04 * distanceSquared(labs[nearest], labs[partner]) * t * (1 - t);
        if (score < bestScore - 1e-16) { bestScore = score; result = { a: nearest, b: partner, amount: t * strength }; }
      }
    }
    if (cache.size < MAX_MAPPING_CACHE) cache.set(key, result);
    return result;
  };

  return {
    options, palette: colors,
    remap<T extends EditableSprite2D>(source: T,
      region: PixelPaletteRegion2D & Pick<PixelPaletteRemapOptions2D, 'origin'> = {}): T {
      const count = validateRegion(source, region), origin = region.origin ?? [0, 0];
      if (origin.length !== 2 || !origin.every(value => Number.isFinite(value)
        && Math.abs(value) <= Number.MAX_SAFE_INTEGER - Math.max(source.w, source.h)))
        throw new RangeError('Pixel palette origin must be a finite two-vector with exact native-cell increments');
      const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
      const size = pattern?.size ?? 1, levels = size * size;
      // Integer crop offsets retain the same pattern even with a fractional object origin.
      const ox = Math.floor(origin[0]), oy = Math.floor(origin[1]);
      for (let i = 0; i < count; i++) {
        const color = source.pixels[i], alpha = color >>> 24;
        if (!alpha || !source.mask.data[i] || region.selection && !region.selection[i] || region.protectedMask?.[i]) continue;
        const mix = mixture(color);
        let index = mix.a;
        if (pattern && mix.amount > 0) {
          const x = (i % source.w + ox) % size, y = (Math.floor(i / source.w) + oy) % size;
          const threshold = (pattern.values[((y + size) % size) * size + (x + size) % size] + .5) / levels;
          if (mix.amount > threshold) index = mix.b;
        }
        pixels[i] = ((colors[index] & 0xffffff) | alpha << 24) >>> 0;
      }
      return { ...source, pixels, mask };
    },
  };
}

/** One-shot equivalent of a compiled mapper, convenient for an explicit authoring adjustment. */
export function remapPixelPalette2D<T extends EditableSprite2D>(source: T, palette: readonly (string | number)[],
  options: PixelPaletteRemapOptions2D = {}): T {
  return createPixelPaletteMapper2D(palette, options).remap(source, options);
}

/** Discrete Oklch ramp through authored shadow/midtone/highlight colors. Lightness and chroma
 * interpolate separately; hue takes the shorter arc and neutral endpoints borrow the chromatic
 * endpoint's hue. Out-of-gamut intermediates reduce chroma at fixed lightness/hue. Endpoints and
 * a sampled midtone remain exact. It returns a palette, never a blurred raster gradient.
 */
export function createPixelPaletteRamp2D(options: PixelPaletteRampOptions2D): number[] {
  const count = countInRange(options.colors ?? 12, 2, 256, 'Pixel ramp size');
  const shadow = opaqueColor(options.shadow), highlight = opaqueColor(options.highlight);
  const middle = options.midtone === undefined ? undefined : opaqueColor(options.midtone);
  const midpoint = options.midpoint ?? .5;
  if (!Number.isFinite(midpoint) || midpoint <= 0 || midpoint >= 1)
    throw new RangeError('Pixel ramp midpoint must be strictly inside 0..1');
  const interpolate = (start: number, end: number) => {
    const a = colorToLab(start), b = colorToLab(end), ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]);
    let ha = Math.atan2(a[2], a[1]), hb = Math.atan2(b[2], b[1]);
    if (ca < 1e-6) ha = hb;
    if (cb < 1e-6) hb = ha;
    const arc = Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha));
    return (t: number): number => {
      if (t <= 0) return start;
      if (t >= 1) return end;
      const L = a[0] + (b[0] - a[0]) * t, C = ca + (cb - ca) * t, hue = ha + arc * t;
      return labToColor([L, C * Math.cos(hue), C * Math.sin(hue)]);
    };
  };
  const first = interpolate(shadow, middle ?? highlight), last = middle === undefined ? first : interpolate(middle, highlight);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    if (middle === undefined) return first(t);
    return t <= midpoint ? first(t / midpoint) : last((t - midpoint) / (1 - midpoint));
  });
}
