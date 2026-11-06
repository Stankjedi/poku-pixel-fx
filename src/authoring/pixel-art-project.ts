import type { EditableSprite2D } from '../core/sprite-edit.js';
import { createPixelMaterial2D, type PixelMaterialOptions2D } from '../core/pixel-material.js';
import type { MaterialChannels2D } from '../core/material-surface.js';

/** A non-destructive native sprite and explicitly selected material operations. */
export interface PixelArtLayer2D {
  name: string;
  material: PixelMaterialOptions2D;
  selection?: number[];
  protectedMask?: number[];
  origin?: [number, number];
  height?: number[];
}
export interface PixelArtProject2D {
  schema: 'poku-pixel-art/v1';
  name: string;
  width: number;
  height: number;
  pixels: number[];
  /** Optional independent source silhouette. Missing masks are derived from source alpha. */
  mask?: number[];
  layers: PixelArtLayer2D[];
}

const MAX_CELLS = 1_048_576;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
function rasterSize(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_CELLS)
    throw new RangeError('Pixel art projects need positive native dimensions and at most 1,048,576 cells');
  return width * height;
}
function name(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 160; }
function mask(value: unknown, size: number, label: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== size)
    throw new RangeError(`${label} must have one binary value per native cell`);
  for (const v of value) if (v !== 0 && v !== 1)
    throw new RangeError(`${label} must have one binary value per native cell`);
  return value.slice();
}

/** Validate imported data before allocating render buffers. Never executes imported code. */
export function validatePixelArtProject2D(input: unknown): PixelArtProject2D {
  if (!input || typeof input !== 'object') throw new TypeError('Expected a pixel art project');
  const p = input as PixelArtProject2D;
  if (p.schema !== 'poku-pixel-art/v1' || !name(p.name)) throw new RangeError('Invalid pixel art project identity');
  const n = rasterSize(p.width, p.height);
  if (!Array.isArray(p.pixels) || p.pixels.length !== n)
    throw new RangeError('Pixel art pixels must be packed unsigned ABGR values matching the native size');
  for (const c of p.pixels) if (!Number.isInteger(c) || c < 0 || c > 0xffffffff)
    throw new RangeError('Pixel art pixels must be packed unsigned ABGR values matching the native size');
  const sourceMask = mask(p.mask, n, 'Source silhouette');
  if (!Array.isArray(p.layers) || p.layers.length > 32 || p.layers.length * n > 16_777_216)
    throw new RangeError('Pixel art material layer budget exceeded');
  const layers = Array.from(p.layers, layer => {
    if (!layer || !name(layer.name) || !layer.material || typeof layer.material !== 'object')
      throw new RangeError('Material layers need a name and material settings');
    const material = createPixelMaterial2D(layer.material).options;
    if (layer.origin !== undefined && (!Array.isArray(layer.origin) || layer.origin.length !== 2 || !Array.from(layer.origin).every(value => Number.isFinite(value) && Math.abs(value) <= 1e9)))
      throw new RangeError('Material layer origin needs two finite native coordinates within ±1e9');
    if (layer.height !== undefined && (!Array.isArray(layer.height) || layer.height.length !== n || !Array.from(layer.height).every(value => Number.isFinite(value) && Number.isFinite(Math.fround(value)))))
      throw new RangeError('Authored height must have one finite value per native cell');
    return {
      name: layer.name, material: structuredClone(material),
      ...(layer.selection !== undefined ? { selection: mask(layer.selection, n, 'Material selection') } : {}),
      ...(layer.protectedMask !== undefined ? { protectedMask: mask(layer.protectedMask, n, 'Protected selection') } : {}),
      ...(layer.origin !== undefined ? { origin: [...layer.origin] as [number, number] } : {}),
      ...(layer.height !== undefined ? { height: layer.height.slice() } : {}),
    };
  });
  return { schema: p.schema, name: p.name, width: p.width, height: p.height, pixels: p.pixels.slice(),
    ...(sourceMask ? { mask: sourceMask } : {}), layers };
}

/** Preserve every packed source pixel, including hidden RGB. Source mask bytes are
 * occupancy flags: nonzero values become 1 in the saved binary silhouette. */
export function createPixelArtProject2D(source: EditableSprite2D, projectName = 'Native material study'): PixelArtProject2D {
  const n = rasterSize(source.w, source.h);
  if (source.pixels.length !== n || source.mask.w !== source.w || source.mask.h !== source.h || source.mask.data.length !== n)
    throw new RangeError('Source sprite pixels and silhouette must match');
  return validatePixelArtProject2D({
    schema: 'poku-pixel-art/v1', name: projectName, width: source.w, height: source.h,
    pixels: Array.from(source.pixels, c => c >>> 0), mask: Array.from(source.mask.data, value => value ? 1 : 0), layers: [],
  });
}

export function pixelArtSource2D(project: PixelArtProject2D): EditableSprite2D {
  const p = validatePixelArtProject2D(project);
  return { w: p.width, h: p.height, pixels: Uint32Array.from(p.pixels),
    mask: { w: p.width, h: p.height, data: p.mask ? Uint8Array.from(p.mask) : Uint8Array.from(p.pixels, c => c >>> 24 ? 1 : 0) } };
}

/** Replays every operation from the saved source; no cumulative preview noise or frame RNG. */
export function renderPixelArtProject2D(project: PixelArtProject2D): EditableSprite2D & { channels?: MaterialChannels2D } {
  const p = validatePixelArtProject2D(project);
  let result: EditableSprite2D & { channels?: MaterialChannels2D } = { w: p.width, h: p.height, pixels: Uint32Array.from(p.pixels),
    mask: { w: p.width, h: p.height, data: p.mask ? Uint8Array.from(p.mask) : Uint8Array.from(p.pixels, c => c >>> 24 ? 1 : 0) } };
  for (const layer of p.layers) result = createPixelMaterial2D(layer.material).shade(result, layer);
  return result;
}

export function serializePixelArtProject2D(project: PixelArtProject2D): string {
  const json = JSON.stringify(validatePixelArtProject2D(project));
  checkJSONSize(json);
  return json;
}
function checkJSONSize(json: string): void {
  if (json.length > MAX_JSON_BYTES || new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES)
    throw new RangeError('Pixel art project exceeds 64 MiB');
}
export function parsePixelArtProject2D(json: string): PixelArtProject2D {
  if (typeof json !== 'string') throw new TypeError('Pixel art project JSON must be a string');
  checkJSONSize(json);
  return validatePixelArtProject2D(JSON.parse(json));
}
