import { hex } from './color.js';
import type { MaterialChannels2D } from './material-surface.js';
import { createPixelPaletteMapper2D, type PixelPaletteRegion2D } from './pixel-palette.js';
import { bakePixelSurfaceLighting2D } from './pixel-surface-maps.js';
import type { EditableSprite2D } from './sprite-edit.js';

export interface PixelRelightLight2D {
  /** Surface-to-light vector: +x right, +y down, +z toward the viewer. */
  direction: readonly [number, number, number];
  /** Opaque #rgb/#rrggbb or packed engine ABGR. Default: white. */
  color?: string | number;
  /** Linear-light intensity, 0..8. Default: .85. */
  intensity?: number;
  /** Height-field self-shadow strength, 0..1. Default: 0. Needs authored heights. */
  castShadow?: number;
  /** Integer planar shadow distance in native cells, 1..128. Default: 32. */
  shadowDistance?: number;
}

export interface PixelRelightOptions2D {
  /** At most eight directional lights. Empty arrays allow ambient-only color adjustment. */
  lights?: readonly PixelRelightLight2D[];
  /** Linear ambient intensity, 0..4. Default: .2. */
  ambient?: number;
  /** Opaque ambient light color. Default: white. */
  ambientColor?: string | number;
  /** Discrete Lambert/specular bands, 2..64. Zero keeps continuous response. Default: 8. */
  diffuseBands?: number;
  /** Stylized specular strength, 0..2. Default: .12. Zero retains only diffuse color. */
  specular?: number;
  /** 0..1: rougher surfaces have wider, weaker highlights. Default: .6. */
  roughness?: number;
  /** Ambient visibility strength, 0..1. Default: 0. Needs authored heights. */
  ambientOcclusion?: number;
  /** Native-cell horizon radius, integer 1..32. Default: 8. */
  occlusionRadius?: number;
  /** Blend the lighting operation with the original albedo in linear light, 0..1. Default: 1. */
  strength?: number;
  /** Optional final palette. Mapping is perceptual and undithered; coverage stays exact. */
  palette?: readonly (string | number)[];
  /** The complete source height/mask raster repeats in both axes. Default: false. */
  wrap?: boolean;
}

export interface PixelRelightEdit2D extends PixelPaletteRegion2D {
  /** Authored native height overrides source.channels.height. It also recomputes normals
   * unless an explicit normal buffer is supplied. Source RGB never becomes geometry. */
  height?: ArrayLike<number>;
  /** Interleaved XYZ normals; finite nonunit vectors are normalized, zero vectors face +z. */
  normal?: ArrayLike<number>;
}

export interface ResolvedPixelRelightLight2D {
  readonly direction: readonly [number, number, number];
  readonly color: number;
  readonly intensity: number;
  readonly castShadow: number;
  readonly shadowDistance: number;
}

export interface ResolvedPixelRelightOptions2D {
  readonly lights: readonly ResolvedPixelRelightLight2D[];
  readonly ambient: number;
  readonly ambientColor: number;
  readonly diffuseBands: number;
  readonly specular: number;
  readonly roughness: number;
  readonly ambientOcclusion: number;
  readonly occlusionRadius: number;
  readonly strength: number;
  readonly palette?: readonly number[];
  readonly wrap: boolean;
}

const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const s = i / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
});

function encode(linear: number): number {
  const value = Math.max(0, Math.min(1, linear));
  return Math.round(255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055));
}

function color(value: string | number): number {
  if (typeof value === 'string') {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
      throw new RangeError('Relight colors must be #rgb or #rrggbb');
    return hex(value) >>> 0;
  }
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff || value >>> 24 !== 255)
    throw new RangeError('Packed relight colors must be opaque ABGR integers');
  return value >>> 0;
}

function bounded(value: number, low: number, high: number, label: string, integer = false): number {
  if (!Number.isFinite(value) || value < low || value > high || integer && !Number.isInteger(value))
    throw new RangeError(`${label} must be ${integer ? 'an integer' : 'finite'} within ${low}..${high}`);
  return value;
}

function finiteBuffer(values: ArrayLike<number> | undefined, length: number, label: string, float32 = false): void {
  if (values === undefined) return;
  if (values.length !== length) throw new RangeError(`${label} must match the native raster`);
  for (let i = 0; i < length; i++) if (!Number.isFinite(values[i]) || float32 && !Number.isFinite(Math.fround(values[i])))
    throw new RangeError(`${label} must contain finite${float32 ? ' float32' : ''} values`);
}

function resolveOptions(input: PixelRelightOptions2D): ResolvedPixelRelightOptions2D {
  const lights: readonly PixelRelightLight2D[] = input.lights ?? [{ direction: [-.6, -.7, 1] as const }];
  if (!Array.isArray(lights) || lights.length > 8) throw new RangeError('Pixel relighting supports at most eight lights');
  const bands = input.diffuseBands ?? 8;
  if (bands !== 0) bounded(bands, 2, 64, 'Relight bands', true);
  const wrap = input.wrap ?? false;
  if (typeof wrap !== 'boolean') throw new RangeError('Relight wrap must be boolean');
  // Reuse palette validation and snapshotting; all further remaps use this same compiled palette.
  const palette = input.palette === undefined ? undefined : createPixelPaletteMapper2D(input.palette).palette;
  return Object.freeze({
    lights: Object.freeze(lights.map(light => {
      const vector = light.direction;
      if (vector.length !== 3 || !vector.every(Number.isFinite)
        || !(Math.hypot(...vector) > 0) || !Number.isFinite(Math.hypot(...vector)))
        throw new RangeError('Relight directions must be finite nonzero three-vectors');
      return Object.freeze({
        direction: Object.freeze([...vector]) as readonly [number, number, number],
        color: color(light.color ?? '#ffffff'),
        intensity: bounded(light.intensity ?? .85, 0, 8, 'Relight intensity'),
        castShadow: bounded(light.castShadow ?? 0, 0, 1, 'Relight shadow strength'),
        shadowDistance: bounded(light.shadowDistance ?? 32, 1, 128, 'Relight shadow distance', true),
      });
    })),
    ambient: bounded(input.ambient ?? .2, 0, 4, 'Relight ambient'),
    ambientColor: color(input.ambientColor ?? '#ffffff'),
    diffuseBands: bands,
    specular: bounded(input.specular ?? .12, 0, 2, 'Relight specular'),
    roughness: bounded(input.roughness ?? .6, 0, 1, 'Relight roughness'),
    ambientOcclusion: bounded(input.ambientOcclusion ?? 0, 0, 1, 'Relight ambient occlusion'),
    occlusionRadius: bounded(input.occlusionRadius ?? 8, 1, 32, 'Relight occlusion radius', true),
    strength: bounded(input.strength ?? 1, 0, 1, 'Relight strength'),
    ...(palette ? { palette } : {}), wrap,
  });
}

/** Mask-aware derivatives preserve the slope of an authored plane at its visible edge.
 * Missing neighbors are not false zero-height pits. Intentional edge bevels belong in the height. */
function heightNormals(w: number, h: number, height: ArrayLike<number>, occupied: Uint8Array, wrap: boolean): Float32Array {
  const normal = new Float32Array(w * h * 3);
  const index = (x: number, y: number): number => {
    if (wrap) return ((y % h + h) % h) * w + (x % w + w) % w;
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, out = i * 3;
    normal[out + 2] = 1;
    if (!occupied[i]) continue;
    const left = index(x - 1, y), right = index(x + 1, y), up = index(x, y - 1), down = index(x, y + 1);
    const hasLeft = left >= 0 && occupied[left], hasRight = right >= 0 && occupied[right];
    const hasUp = up >= 0 && occupied[up], hasDown = down >= 0 && occupied[down];
    const nx = hasLeft && hasRight ? (height[left] - height[right]) * .5
      : hasLeft ? height[left] - height[i] : hasRight ? height[i] - height[right] : 0;
    const ny = hasUp && hasDown ? (height[up] - height[down]) * .5
      : hasUp ? height[up] - height[i] : hasDown ? height[i] - height[down] : 0;
    const length = Math.hypot(nx, ny, 1);
    normal[out] = nx / length; normal[out + 1] = ny / length; normal[out + 2] = 1 / length;
  }
  return normal;
}

/** Relight a hand-painted albedo without replacing it with a single material ramp. Authored
 * geometry controls light; flat +z normals are used only if no height/normal data exists.
 * This is a stylized CPU bake with optional bands and finite height-field shadows, not PBR/GI.
 * Colors combine in linear light. Source buffers, exact alpha, silhouette, HDR and all other
 * metadata remain untouched. Reapply to the original albedo, not to an already relit preview.
 */
export function createPixelRelighter2D(input: PixelRelightOptions2D = {}) {
  const options = resolveOptions(input);
  const palette = options.palette ? createPixelPaletteMapper2D(options.palette) : undefined;
  const ambient = [LINEAR[options.ambientColor & 255], LINEAR[options.ambientColor >>> 8 & 255], LINEAR[options.ambientColor >>> 16 & 255]];
  const lights = options.lights.map(light => {
    const length = Math.hypot(...light.direction), [x, y, z] = light.direction.map(v => v / length);
    const halfLength = Math.hypot(x, y, z + 1);
    return { ...light, x, y, z, hx: halfLength ? x / halfLength : 0,
      hy: halfLength ? y / halfLength : 0, hz: halfLength ? (z + 1) / halfLength : 0,
      rgb: [LINEAR[light.color & 255], LINEAR[light.color >>> 8 & 255], LINEAR[light.color >>> 16 & 255]] };
  });
  const exponent = 8 + 120 * (1 - options.roughness) ** 2;
  const reflection = options.specular * (1 - .65 * options.roughness);
  const quantize = (v: number): number => options.diffuseBands
    ? Math.round(v * (options.diffuseBands - 1)) / (options.diffuseBands - 1) : v;

  return {
    options,
    shade<T extends EditableSprite2D>(source: T, edit: PixelRelightEdit2D = {}): T {
      const { w, h } = source, n = w * h;
      if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || n > 16_777_216
        || !(source.pixels instanceof Uint32Array) || source.pixels.length !== n
        || source.mask.w !== w || source.mask.h !== h
        || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== n)
        throw new RangeError('Pixel relighting needs matching native pixel and silhouette buffers');
      finiteBuffer(edit.selection, n, 'Relight selection');
      finiteBuffer(edit.protectedMask, n, 'Relight protected mask');
      finiteBuffer(edit.height, n, 'Authored relight height', true);
      finiteBuffer(edit.normal, n * 3, 'Authored relight normal', true);
      const channels = (source as EditableSprite2D & { channels?: MaterialChannels2D }).channels;
      if (channels) {
        if (channels.w !== w || channels.h !== h || !(channels.height instanceof Float32Array)
          || !(channels.normal instanceof Float32Array)) throw new RangeError('Relight source channels must match the native raster');
        finiteBuffer(channels.height, n, 'Source relight height');
        finiteBuffer(channels.normal, n * 3, 'Source relight normal');
      }
      const height = edit.height ?? channels?.height;
      const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
      const occupied = new Uint8Array(n);
      let editable = 0;
      for (let i = 0; i < n; i++) {
        occupied[i] = source.mask.data[i] && source.pixels[i] >>> 24 ? 1 : 0;
        if (occupied[i] && (!edit.selection || edit.selection[i]) && !edit.protectedMask?.[i]) editable++;
      }
      if (!editable || !options.strength) return { ...source, pixels, mask };
      if (!height && (options.ambientOcclusion > 0 || lights.some(light => light.castShadow > 0 && light.intensity > 0)))
        throw new RangeError('Relight occlusion and shadows need authored height data; RGB is not geometry');
      const normal = edit.normal ?? (edit.height ? undefined : channels?.normal)
        ?? (height ? heightNormals(w, h, height, occupied, options.wrap) : undefined);
      let occlusion: Float32Array | undefined;
      const shadows: (Float32Array | undefined)[] = [];
      for (let l = 0; l < lights.length; l++) {
        const light = lights[l], ao = l === 0 ? options.ambientOcclusion : 0;
        if (!ao && (!light.castShadow || !light.intensity)) { shadows.push(undefined); continue; }
        const visibility = bakePixelSurfaceLighting2D(w, h, height!, {
          mask: occupied, light: light.direction, ambientOcclusion: ao, occlusionRadius: options.occlusionRadius,
          castShadow: light.intensity ? light.castShadow : 0, shadowDistance: light.shadowDistance, wrap: options.wrap,
        });
        if (ao) occlusion = visibility.occlusion;
        shadows.push(light.castShadow && light.intensity ? visibility.shadow : undefined);
      }
      if (!lights.length && options.ambientOcclusion) occlusion = bakePixelSurfaceLighting2D(w, h, height!, {
        mask: occupied, ambientOcclusion: options.ambientOcclusion, occlusionRadius: options.occlusionRadius,
        castShadow: 0, wrap: options.wrap,
      }).occlusion;
      for (let i = 0; i < n; i++) {
        if (!occupied[i] || edit.selection && !edit.selection[i] || edit.protectedMask?.[i]) continue;
        const j = i * 3, length = normal ? Math.hypot(normal[j], normal[j + 1], normal[j + 2]) : 0;
        const nx = length ? normal![j] / length : 0, ny = length ? normal![j + 1] / length : 0;
        const nz = length ? normal![j + 2] / length : 1, visibility = occlusion?.[i] ?? 1;
        let dr = ambient[0] * options.ambient * visibility, dg = ambient[1] * options.ambient * visibility;
        let db = ambient[2] * options.ambient * visibility, sr = 0, sg = 0, sb = 0;
        for (let l = 0; l < lights.length; l++) {
          const light = lights[l], facing = Math.max(0, nx * light.x + ny * light.y + nz * light.z);
          const intensity = light.intensity * (shadows[l]?.[i] ?? 1);
          const diffuse = quantize(Math.min(1, facing)) * intensity;
          const specular = facing > 0 && reflection > 0
            ? quantize(Math.min(1, Math.max(0, nx * light.hx + ny * light.hy + nz * light.hz)) ** exponent) * reflection * intensity : 0;
          dr += diffuse * light.rgb[0]; dg += diffuse * light.rgb[1]; db += diffuse * light.rgb[2];
          sr += specular * light.rgb[0]; sg += specular * light.rgb[1]; sb += specular * light.rgb[2];
        }
        const original = source.pixels[i], r = LINEAR[original & 255], g = LINEAR[original >>> 8 & 255];
        const b = LINEAR[original >>> 16 & 255], strength = options.strength;
        const red = encode(r + (r * dr + sr - r) * strength), green = encode(g + (g * dg + sg - g) * strength);
        const blue = encode(b + (b * db + sb - b) * strength);
        pixels[i] = ((original & 0xff000000) | red | green << 8 | blue << 16) >>> 0;
      }
      const result = { ...source, pixels, mask };
      return palette ? palette.remap(result, edit) : result;
    },
  };
}

/** Convenience wrapper for one explicit, reversible authoring adjustment. */
export function relightPixelArt2D<T extends EditableSprite2D>(source: T,
  options: PixelRelightOptions2D = {}, edit: PixelRelightEdit2D = {}): T {
  return createPixelRelighter2D(options).shade(source, edit);
}
