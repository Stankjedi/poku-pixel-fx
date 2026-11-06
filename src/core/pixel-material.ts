import { hex } from './color.js';
import { clamp, fract, noise2, smooth, TAU } from './math.js';
import { createMaterialRamp2D } from './material-ramp.js';
import type { MaterialChannels2D } from './material-surface.js';
import type { EditableSprite2D } from './sprite-edit.js';
import { bakePixelSurfaceLighting2D } from './pixel-surface-maps.js';

export type PixelMaterialKind2D = 'stone' | 'metal' | 'wood' | 'fabric' | 'crystal';

/** Authored cool-shadow / warm-highlight ramps. Compilers snapshot these or a caller's palette. */
export const PIXEL_MATERIAL_PALETTES_2D: Readonly<Record<PixelMaterialKind2D, readonly string[]>> = Object.freeze({
  stone: Object.freeze(['#121a25', '#1c2936', '#283b49', '#344e59', '#42616a', '#54777b', '#698c8b', '#82a09a', '#9db5a7', '#b9c8b3', '#d3d7c1', '#eee6cf']),
  metal: Object.freeze(['#121322', '#22263a', '#353c52', '#49566b', '#62768a', '#7f95a6', '#9badb7', '#b7c6c7', '#d0d8cf', '#e6e5d6', '#f7efda', '#fffbed']),
  wood: Object.freeze(['#20151e', '#33202a', '#4c2b30', '#683936', '#854b3d', '#a16147', '#b87a55', '#cb9568', '#d9af7e', '#e5c395', '#eed6b0', '#f8e9ce']),
  fabric: Object.freeze(['#21162f', '#352041', '#4c2a50', '#68365c', '#854568', '#a45978', '#bc7288', '#cf8c9d', '#dea7b0', '#eac1c3', '#f2d8d4', '#fceee2']),
  crystal: Object.freeze(['#131c36', '#202d53', '#29446d', '#2d6083', '#347f98', '#479eae', '#66b8be', '#8ccdd0', '#b1dedc', '#d0ebe5', '#e8f6ee', '#fcfff2']),
});

export interface PixelMaterialOptions2D {
  kind?: PixelMaterialKind2D;
  /** Integer 32-bit seed, sampled from object coordinates rather than frame order. */
  seed?: number;
  /** Opaque engine ABGR values or #rgb/#rrggbb colors, ordered from dark to light. */
  palette?: readonly (string | number)[];
  /** Optional ascending diffuse band boundaries; one fewer than palette entries. */
  thresholds?: readonly number[];
  /** Major feature spacing in native cells; does not change the source resolution. Default: 14. */
  scale?: number;
  /** Surface structure strength, 0..1. Zero removes the procedural grain, veins and crevices. */
  detail?: number;
  /** Procedural height in native pixel units. Does not scale an explicitly supplied height map. */
  relief?: number;
  /** Curved silhouette bevel width in native cells. Zero treats the material as an unbounded field. */
  bevel?: number;
  /** 0..1 stylized reflection roughness; higher values spread and weaken highlights. */
  roughness?: number;
  /** Surface-to-light direction: +x right, +y down, +z toward the viewer. Normalized internally. */
  light?: readonly [number, number, number];
  ambient?: number;
  materialId?: number;
  /** Directional grain rotation in radians; zero runs wood grain and brushing along y. */
  grainAngle?: number;
  /** Opt-in height-field ambient occlusion strength, 0..1. Default 0 preserves previous output. */
  ambientOcclusion?: number;
  /** Integer horizon-search radius in native cells, 1..32. Default: 8. */
  occlusionRadius?: number;
  /** Opt-in directional self-shadow strength, 0..1. Default: 0. */
  castShadow?: number;
  /** Integer planar shadow-ray distance in native cells, 1..128. Default: 32. */
  shadowDistance?: number;
  /** Optional repeat period in native cells. Use the exact canvas size and bevel:0 for a
   * seamless tile, including wrapped authored-height normals and visibility. */
  tileSize?: readonly [number, number];
}

export interface PixelMaterialShadeOptions2D {
  /** Nonzero entries permit repainting. Selection boundaries do not create artificial bevels. */
  selection?: ArrayLike<number>;
  /** Protect hand-authored faces, emblems or other accents, including their existing channels. */
  protectedMask?: ArrayLike<number>;
  /** Object-space location of cell (0,0). Placement metadata such as sprite.x/y is deliberately ignored. */
  origin?: readonly [number, number];
  /** Explicit underlying form, in native pixel height units. RGB is never interpreted as geometry. */
  height?: ArrayLike<number>;
}

export interface ResolvedPixelMaterialOptions2D {
  readonly kind: PixelMaterialKind2D;
  readonly seed: number;
  readonly palette: readonly number[];
  readonly thresholds?: readonly number[];
  readonly scale: number;
  readonly detail: number;
  readonly relief: number;
  readonly bevel: number;
  readonly roughness: number;
  readonly light: readonly [number, number, number];
  readonly ambient: number;
  readonly materialId: number;
  readonly grainAngle: number;
  readonly ambientOcclusion: number;
  readonly occlusionRadius: number;
  readonly castShadow: number;
  readonly shadowDistance: number;
  readonly tileSize?: readonly [number, number];
}

const KIND_RESPONSE = {
  stone: { roughness: .78, reflection: .055, wear: .10 },
  metal: { roughness: .28, reflection: .78, wear: .16 },
  wood: { roughness: .65, reflection: .13, wear: .07 },
  fabric: { roughness: .92, reflection: .035, wear: 0 },
  crystal: { roughness: .18, reflection: .52, wear: .06 },
} satisfies Record<PixelMaterialKind2D, { roughness: number; reflection: number; wear: number }>;

function inRange(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be finite and within ${minimum}..${maximum}`);
  return value;
}

function resolveOptions(input: PixelMaterialOptions2D): ResolvedPixelMaterialOptions2D {
  const kind = input.kind ?? 'stone';
  if (!Object.hasOwn(KIND_RESPONSE, kind)) throw new RangeError('Unknown pixel material kind');
  const seed = input.seed ?? 17, materialId = input.materialId ?? 1;
  if (!Number.isInteger(seed) || seed < -0x80000000 || seed > 0xffffffff)
    throw new RangeError('Pixel material seed must be a 32-bit integer');
  if (!Number.isInteger(materialId) || materialId < 1 || materialId > 65535)
    throw new RangeError('Pixel material ID must be within 1..65535');
  const palette = input.palette ?? PIXEL_MATERIAL_PALETTES_2D[kind];
  // Use the common authored-ramp contract, including color and threshold validation.
  createMaterialRamp2D(palette, { thresholds: input.thresholds });
  const light = input.light ?? [-.6, -.7, 1];
  if (light.length !== 3 || !light.every(Number.isFinite) || !(Math.hypot(...light) > 0) || !Number.isFinite(Math.hypot(...light)))
    throw new RangeError('Pixel material light must be a finite nonzero 3-vector');
  const grainAngle = input.grainAngle ?? 0;
  if (!Number.isFinite(grainAngle)) throw new RangeError('Grain angle must be finite');
  const occlusionRadius = input.occlusionRadius ?? 8, shadowDistance = input.shadowDistance ?? 32;
  if (!Number.isInteger(occlusionRadius) || !Number.isInteger(shadowDistance))
    throw new RangeError('Occlusion radius and shadow distance must be native-cell integers');
  if (input.tileSize !== undefined && (input.tileSize.length !== 2
    || !input.tileSize.every(v => Number.isInteger(v) && v >= 2 && v <= 4096)))
    throw new RangeError('Material tile size must contain two native-cell integers within 2..4096');
  return Object.freeze({
    kind, seed: seed >>> 0, materialId,
    palette: Object.freeze(Array.from(palette, color => hex(color) >>> 0)),
    ...(input.thresholds ? { thresholds: Object.freeze(Array.from(input.thresholds)) } : {}),
    scale: inRange(input.scale ?? 14, 2, 4096, 'Material feature scale'),
    detail: inRange(input.detail ?? .65, 0, 1, 'Material detail'),
    relief: inRange(input.relief ?? 3, 0, 4096, 'Material relief'),
    bevel: inRange(input.bevel ?? 5, 0, 4096, 'Material bevel'),
    roughness: inRange(input.roughness ?? KIND_RESPONSE[kind].roughness, 0, 1, 'Material roughness'),
    light: Object.freeze([...light]) as readonly [number, number, number],
    ambient: inRange(input.ambient ?? .2, 0, 1, 'Material ambient'),
    grainAngle,
    ambientOcclusion: inRange(input.ambientOcclusion ?? 0, 0, 1, 'Material ambient occlusion'),
    occlusionRadius: inRange(occlusionRadius, 1, 32, 'Material occlusion radius'),
    castShadow: inRange(input.castShadow ?? 0, 0, 1, 'Material cast shadow'),
    shadowDistance: inRange(shadowDistance, 1, 128, 'Material shadow distance'),
    ...(input.tileSize ? { tileSize: Object.freeze([...input.tileSize]) as readonly [number, number] } : {}),
  });
}

function checkSprite(source: EditableSprite2D): number {
  const { w, h } = source, count = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || count > 16_777_216
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || source.mask.w !== w || source.mask.h !== h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Pixel material sprite dimensions must match native pixel and mask buffers');
  return count;
}

function checkArray(values: ArrayLike<number> | undefined, count: number, name: string, height = false): void {
  if (values === undefined) return;
  if (values.length !== count) throw new RangeError(`${name} must match native sprite dimensions`);
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(values[i]) || height && !Number.isFinite(Math.fround(values[i])))
      throw new RangeError(`${name} must contain finite${height ? ' float32' : ''} values`);
  }
}

function copyChannels(source: EditableSprite2D, count: number): MaterialChannels2D {
  const existing = (source as EditableSprite2D & { channels?: MaterialChannels2D }).channels;
  if (existing) {
    if (existing.w !== source.w || existing.h !== source.h || !(existing.material instanceof Uint16Array)
      || !(existing.height instanceof Float32Array) || !(existing.normal instanceof Float32Array)
      || existing.material.length !== count || existing.height.length !== count || existing.normal.length !== count * 3
      || !existing.height.every(Number.isFinite) || !existing.normal.every(Number.isFinite))
      throw new RangeError('Existing material channels must match the sprite and contain finite values');
    return { w: source.w, h: source.h, material: existing.material.slice(), height: existing.height.slice(), normal: existing.normal.slice() };
  }
  const normal = new Float32Array(count * 3);
  for (let i = 2; i < normal.length; i += 3) normal[i] = 1;
  return { w: source.w, h: source.h, material: new Uint16Array(count), height: new Float32Array(count), normal };
}

/** Squared Euclidean 1D transform, using the lower envelope of equal-curvature parabolas. */
function distanceLine(f: Float64Array, result: Float64Array, sites: Int32Array, boundaries: Float64Array, length: number): void {
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
    const delta = q - sites[k];
    result[q] = delta * delta + f[sites[k]];
  }
}

/** Distance to transparent cell centers, including a virtual transparent border, minus half a cell.
 * The transform is Euclidean, rather than a four-neighbor diamond/chamfer approximation. */
function silhouetteDistance(occupied: Uint8Array, w: number, h: number): Float32Array {
  const size = Math.max(w, h) + 2, f = new Float64Array(size), line = new Float64Array(size);
  const sites = new Int32Array(size), boundaries = new Float64Array(size + 1);
  const horizontal = new Float64Array(w * h), distance = new Float32Array(w * h), far = (w + h + 2) ** 2;
  for (let y = 0; y < h; y++) {
    f[0] = f[w + 1] = 0;
    for (let x = 0; x < w; x++) f[x + 1] = occupied[y * w + x] ? far : 0;
    distanceLine(f, line, sites, boundaries, w + 2);
    for (let x = 0; x < w; x++) horizontal[y * w + x] = line[x + 1];
  }
  for (let x = 0; x < w; x++) {
    f[0] = f[h + 1] = 0;
    for (let y = 0; y < h; y++) f[y + 1] = horizontal[y * w + x];
    distanceLine(f, line, sites, boundaries, h + 2);
    for (let y = 0; y < h; y++) distance[y * w + x] = Math.max(0, Math.sqrt(line[y + 1]) - .5);
  }
  return distance;
}

interface SurfaceSample { height: number; tone: number; cavity: number; accent: number }

/** Smooth fields are quantized only at the final authored ramp. Domain warping breaks lattice alignment;
 * material-specific structures live at several related scales instead of independent random cells. */
function materialField(options: ResolvedPixelMaterialOptions2D) {
  const { kind, seed, scale, grainAngle } = options, cs = Math.cos(grainAngle), sn = Math.sin(grainAngle);
  return (x: number, y: number, out: SurfaceSample): void => {
    const u = (x * cs + y * sn) / scale, v = (-x * sn + y * cs) / scale;
    const warpX = noise2(u * .48 + 17, v * .48 - 11, seed + 31);
    const warpY = noise2(u * .48 - 7, v * .48 + 23, seed + 47);
    const a = u + warpX * .55, b = v + warpY * .55;
    const broad = noise2(a * .67 + 2, b * .67 - 3, seed + 11);
    out.cavity = 0; out.accent = 0;
    if (kind === 'stone') {
      const middle = noise2(a * 1.9 - 3, b * 1.9 + 8, seed + 101);
      const fine = noise2(a * 4.3 + 5, b * 4.3 - 2, seed + 211);
      const vein = Math.abs(noise2(a * .93 - 13, b * .93 + 4, seed + 307));
      const broken = smooth(-.32, .32, noise2(a * 1.3 + 7, b * 1.3 + 2, seed + 401));
      const fissure = (1 - smooth(.018, .085, vein)) * broken;
      const pits = smooth(.48, .82, fine), mineral = smooth(.38, .8, middle) * smooth(-.1, .5, fine);
      out.height = .52 * broad + .25 * middle + .065 * fine - .25 * fissure - .07 * pits;
      out.tone = .31 * broad + .18 * middle + .055 * fine - .12 * fissure;
      out.cavity = .8 * fissure + .25 * pits; out.accent = mineral;
    } else if (kind === 'wood') {
      const drift = noise2(u * .45 + 5, v * .16, seed + 101) * .85 + noise2(u * .9, v * .31, seed + 211) * .2;
      const phase = u * 1.35 + drift, growth = Math.sin(phase * TAU);
      const fiber = noise2(u * 5 + drift * 2, v * .5, seed + 307);
      const groove = (1 - smooth(.025, .19, Math.abs(Math.sin(phase * Math.PI))))
        * smooth(-.7, .1, noise2(u * .6, v * .45, seed + 401));
      out.height = .22 * broad + .14 * growth + .035 * fiber - .14 * groove;
      out.tone = .26 * broad + .16 * growth + .055 * fiber - .12 * groove;
      out.cavity = groove * .6; out.accent = smooth(.4, .9, growth) * smooth(.1, .6, fiber);
    } else if (kind === 'fabric') {
      const thread = Math.max(1.5, scale * .23);
      const tx = (x * cs + y * sn) / thread, ty = (-x * sn + y * cs) / thread;
      const warp = Math.sin(fract(tx) * Math.PI), weft = Math.sin(fract(ty) * Math.PI);
      const over = (Math.floor(tx) + Math.floor(ty)) & 1 ? warp : weft;
      const crossing = (1 - warp) * (1 - weft);
      const nap = noise2(a * 3.1, b * 3.1, seed + 101);
      out.height = .22 * broad + .075 * over - .04 * crossing;
      out.tone = .26 * broad + .09 * (over - .5) + .04 * nap;
      out.cavity = crossing * .3; out.accent = over * .18;
    } else if (kind === 'metal') {
      const brushed = noise2(u * 6 + warpX * .8, v * .22, seed + 101);
      const scratchField = Math.abs(noise2(u * 2.8 + warpY * .25, v * .13, seed + 211));
      const scratch = (1 - smooth(.012, .065, scratchField))
        * smooth(.1, .55, noise2(u * 1.2, v * .8, seed + 307));
      out.height = .18 * broad + .055 * brushed - .13 * scratch;
      out.tone = .22 * broad + .08 * brushed - .07 * scratch;
      out.cavity = scratch * .55; out.accent = smooth(.45, .85, brushed) * .35;
    } else {
      const middle = noise2(a * 1.6 - 3, b * 1.6 + 6, seed + 101);
      const flowing = Math.abs(Math.sin((u * .53 + v * .39 + warpX * .3 + warpY * .3) * Math.PI));
      const vein = (1 - smooth(.035, .16, flowing)) * smooth(-.3, .4, middle);
      const inclusion = smooth(.48, .8, noise2(a * 3.3, b * 3.3, seed + 211));
      out.height = .2 * broad + .12 * middle + .05 * vein;
      out.tone = .29 * broad + .15 * middle + .13 * vein - .12 * inclusion;
      out.cavity = inclusion * .3; out.accent = vein;
    }
  };
}

/** Periodize the continuous material field before rasterization. Quintic blend weights have
 * zero first/second derivatives at both ends, so joins retain the original field's slope.
 * This repeats structure and height together, instead of copying only the border colors. */
function periodicField(field: ReturnType<typeof materialField>, period: readonly [number, number]) {
  const samples = Array.from({ length: 4 }, (): SurfaceSample => ({ height: 0, tone: 0, cavity: 0, accent: 0 }));
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const [w, h] = period;
  return (x: number, y: number, out: SurfaceSample): void => {
    const u = ((x % w) + w) % w, v = ((y % h) + h) % h;
    const sx = fade(u / w), sy = fade(v / h);
    field(u, v, samples[0]); field(u - w, v, samples[1]);
    field(u, v - h, samples[2]); field(u - w, v - h, samples[3]);
    for (const channel of ['height', 'tone', 'cavity', 'accent'] as const) {
      const top = samples[0][channel] + (samples[1][channel] - samples[0][channel]) * sx;
      const bottom = samples[2][channel] + (samples[3][channel] - samples[2][channel]) * sx;
      out[channel] = top + (bottom - top) * sy;
    }
  };
}

/** Compile an opt-in native material authoring operation, not an RGB "beautify" filter.
 * Supply an authored form/selection when geometry matters. The source silhouette, coverage,
 * protected cells and unrelated metadata/HDR are preserved; only palette surface colors and
 * selected material channels are replaced. Object-space patterns have no time or RNG state.
 * Bake/cache the resulting sprite for animation rather than resynthesizing it every display frame. */
export function createPixelMaterial2D(input: PixelMaterialOptions2D = {}) {
  const options = resolveOptions(input), rawField = materialField(options);
  const field = options.tileSize ? periodicField(rawField, options.tileSize) : rawField;
  const ramp = createMaterialRamp2D(options.palette, { thresholds: options.thresholds });
  const lightLength = Math.hypot(...options.light), [lx, ly, lz] = options.light.map(v => v / lightLength);
  const halfLength = Math.hypot(lx, ly, lz + 1), hx = halfLength ? lx / halfLength : 0;
  const hy = halfLength ? ly / halfLength : 0, hz = halfLength ? (lz + 1) / halfLength : 0;
  const response = KIND_RESPONSE[options.kind], exponent = 10 + 100 * (1 - options.roughness) ** 2;
  const reflection = response.reflection * (1 - options.roughness * .65);
  const bevelHeight = Math.min(options.bevel, options.relief * 1.5);

  return {
    options,
    shade<T extends EditableSprite2D>(source: T, edit: PixelMaterialShadeOptions2D = {}): T & { channels: MaterialChannels2D } {
      const count = checkSprite(source), { w, h } = source;
      checkArray(edit.selection, count, 'Material selection');
      checkArray(edit.protectedMask, count, 'Protected material mask');
      checkArray(edit.height, count, 'Authored height map', true);
      const origin = edit.origin ?? [0, 0];
      if (origin.length !== 2 || !origin.every(v => Number.isFinite(v) && Math.abs(v) <= 1e9))
        throw new RangeError('Object origin must be two finite native coordinates within ±1e9');
      const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
      const channels = copyChannels(source, count), occupied = new Uint8Array(count), editable = new Uint8Array(count);
      let changed = 0;
      for (let i = 0; i < count; i++) {
        occupied[i] = source.mask.data[i] && source.pixels[i] >>> 24 ? 1 : 0;
        editable[i] = occupied[i] && (!edit.selection || edit.selection[i]) && !edit.protectedMask?.[i] ? 1 : 0;
        changed += editable[i];
      }
      if (!changed) return { ...source, pixels, mask, channels };

      const distance = options.bevel ? silhouetteDistance(occupied, w, h) : undefined;
      const wrap = !!options.tileSize && options.tileSize[0] === w && options.tileSize[1] === h && !distance;
      const heights = new Float32Array(count), sample: SurfaceSample = { height: 0, tone: 0, cavity: 0, accent: 0 };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, edge = distance ? clamp(distance[i] / options.bevel) : 1;
        if (distance && !occupied[i]) continue;
        field(x + origin[0] + .5, y + origin[1] + .5, sample);
        heights[i] = (edit.height?.[i] ?? 0) + sample.height * options.relief * options.detail * Math.sqrt(edge)
          + bevelHeight * Math.sin(edge * Math.PI * .5);
      }
      const outsideSample: SurfaceSample = { height: 0, tone: 0, cavity: 0, accent: 0 };
      const sampleHeight = (x: number, y: number): number => {
        if (x >= 0 && y >= 0 && x < w && y < h) return heights[y * w + x];
        if (wrap) return heights[((y % h + h) % h) * w + (x % w + w) % w];
        if (distance) return 0;
        field(x + origin[0] + .5, y + origin[1] + .5, outsideSample);
        const authored = edit.height?.[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)] ?? 0;
        // Match float32 quantization of interior samples, including crop boundaries.
        return Math.fround(authored + outsideSample.height * options.relief * options.detail);
      };
      const visibility = options.ambientOcclusion || options.castShadow
        ? bakePixelSurfaceLighting2D(w, h, heights, {
          mask: occupied, light: options.light, ambientOcclusion: options.ambientOcclusion,
          occlusionRadius: options.occlusionRadius, castShadow: options.castShadow, shadowDistance: options.shadowDistance,
          wrap,
        }) : undefined;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!editable[i]) continue;
        const dx = (sampleHeight(x - 1, y) - sampleHeight(x + 1, y)) * .5;
        const dy = (sampleHeight(x, y - 1) - sampleHeight(x, y + 1)) * .5;
        const length = Math.hypot(dx, dy, 1), nx = dx / length, ny = dy / length, nz = 1 / length;
        const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
        const specular = diffuse > 0 ? Math.max(0, nx * hx + ny * hy + nz * hz) ** exponent : 0;
        field(x + origin[0] + .5, y + origin[1] + .5, sample);
        const edgeWear = distance ? (1 - smooth(.5, Math.max(1.5, options.bevel * .65), distance[i]))
          * smooth(.42, .88, diffuse) * clamp(.6 + sample.tone) : 0;
        let tone = options.ambient + (1 - options.ambient) * diffuse * .72
          + options.detail * (sample.tone - .24 * sample.cavity
            + sample.accent * (.05 + response.reflection * .08) * smooth(.5, .9, diffuse)
            + response.wear * edgeWear)
          + reflection * specular;
        if (visibility) {
          const ambient = options.ambient * visibility.occlusion[i], direct = visibility.shadow[i];
          // AO attenuates ambient illumination; cast shadows attenuate direct diffuse/specular.
          // Material color/structure still reads under the surviving ambient illumination.
          const structure = options.detail * (sample.tone - .24 * sample.cavity
            + sample.accent * (.05 + response.reflection * .08) * smooth(.5, .9, diffuse)
            + response.wear * edgeWear);
          tone = ambient + (1 - options.ambient) * diffuse * .72 * direct
            + structure * (ambient + (1 - options.ambient) * direct) + reflection * specular * direct;
        }
        pixels[i] = ((ramp(tone) & 0xffffff) | (source.pixels[i] & 0xff000000)) >>> 0;
        channels.material[i] = options.materialId; channels.height[i] = heights[i];
        channels.normal[i * 3] = nx; channels.normal[i * 3 + 1] = ny; channels.normal[i * 3 + 2] = nz;
      }
      return { ...source, pixels, mask, channels };
    },
  };
}
