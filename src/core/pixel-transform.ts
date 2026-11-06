import type { EditableSprite2D } from './sprite-edit.js';
import type { MaterialChannels2D } from './material-surface.js';
import { pixelSelectionBounds2D } from './pixel-selection.js';

/** Optional raster channels with the same native cell layout. Other metadata is not transformed. */
export interface PixelTransformRaster2D extends EditableSprite2D {
  channels?: MaterialChannels2D;
  emission?: Float32Array;
  semanticMasks?: Record<string, Uint8Array>;
}
export interface PixelSelectionTransformOptions2D {
  /** Integer native-cell offset after flips/rotation. Default: [0,0]. */
  offset?: readonly [number, number];
  flipX?: boolean;
  flipY?: boolean;
  /** Clockwise quarter turns, after flips. The selection's top-left stays the anchor. */
  quarterTurns?: 0 | 1 | 2 | 3;
  /** Keep the source and select only the transformed copy. Default: false (move). */
  copy?: boolean;
  /** Reject any clipping by default. `clip` deliberately discards outside cells; `wrap` tiles. */
  boundary?: 'reject' | 'clip' | 'wrap';
  /** Protected source cells stay in place. Any destination collision rejects the whole edit. */
  protectedMask?: ArrayLike<number>;
}
export type ResolvedPixelSelectionTransformOptions2D = Required<Omit<PixelSelectionTransformOptions2D, 'protectedMask'>>;
export interface PixelSelectionTransformResult2D<T extends PixelTransformRaster2D = PixelTransformRaster2D> {
  sprite: T;
  /** Destination cells only; selecting a copied object never grows the selection implicitly. */
  selection: Uint8Array;
  /** Source erasures and destination writes, suitable for editor previews/dirty regions. */
  touched: Uint8Array;
  /** Selected, unprotected source cells deliberately lost through boundary:'clip'. */
  clipped: number;
}

/** Validate reusable transform settings without allocating a raster or inspecting edit masks. */
export function validatePixelSelectionTransformOptions2D(
  input: Omit<PixelSelectionTransformOptions2D, 'protectedMask'> = {},
): ResolvedPixelSelectionTransformOptions2D {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Pixel selection transform needs options');
  const offset = input.offset === undefined ? [0, 0] : input.offset;
  const quarterTurns = input.quarterTurns === undefined ? 0 : input.quarterTurns, boundary = input.boundary === undefined ? 'reject' : input.boundary;
  if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(v => Number.isInteger(v) && Math.abs(v) <= 1_048_576))
    throw new RangeError('Pixel selection offset needs two integers within +/-1048576');
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3)
    throw new RangeError('Pixel selection quarterTurns must be 0, 1, 2 or 3');
  if (boundary !== 'reject' && boundary !== 'clip' && boundary !== 'wrap') throw new RangeError('Unknown pixel selection boundary mode');
  for (const key of ['flipX', 'flipY', 'copy'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean')
    throw new RangeError(`Pixel selection ${key} must be boolean`);
  return { offset: [offset[0], offset[1]], quarterTurns, boundary, flipX: input.flipX ?? false, flipY: input.flipY ?? false, copy: input.copy ?? false };
}

function checkRaster(source: PixelTransformRaster2D): number {
  const { w, h } = source, count = w * h;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || source.mask.w !== w || source.mask.h !== h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Pixel transforms require matching native color and silhouette buffers');
  const c = source.channels;
  if (c && (c.w !== w || c.h !== h || !(c.material instanceof Uint16Array) || c.material.length !== count
    || !(c.height instanceof Float32Array) || c.height.length !== count || !(c.normal instanceof Float32Array) || c.normal.length !== count * 3
    || !c.height.every(Number.isFinite) || !c.normal.every(Number.isFinite)))
    throw new RangeError('Pixel transform material channels must match native dimensions and contain finite values');
  if (source.emission && (!(source.emission instanceof Float32Array) || source.emission.length !== count * 3 || !source.emission.every(Number.isFinite)))
    throw new RangeError('Pixel transform emission must contain one finite RGB triplet per native cell');
  if (source.semanticMasks) for (const mask of Object.values(source.semanticMasks)) {
    if (!(mask instanceof Uint8Array) || mask.length !== count) throw new RangeError('Pixel transform semantic masks must match native dimensions');
  }
  return count;
}
function cloneRaster<T extends PixelTransformRaster2D>(source: T): T {
  return { ...source, pixels: source.pixels.slice(), mask: { ...source.mask, data: source.mask.data.slice() },
    ...(source.channels ? { channels: { ...source.channels, material: source.channels.material.slice(), height: source.channels.height.slice(), normal: source.channels.normal.slice() } } : {}),
    ...(source.emission ? { emission: source.emission.slice() } : {}),
    ...(source.semanticMasks ? { semanticMasks: Object.fromEntries(Object.entries(source.semanticMasks).map(([name, mask]) => [name, mask.slice()])) } : {}),
  };
}

/**
 * Exact native-cell move/copy/flip/90-degree rotation, with no filtering or alpha compositing.
 * Flips use the complete selection bounds; rotation follows them about the same top-left anchor,
 * then the integer offset is applied. Odd turns swap width/height; no half-cell pivot rounding is
 * needed. The canvas size stays fixed, and explicit wrap uses the canvas periods, not the bounds.
 *
 * Every destination samples the original source, so overlapping moves never smear. RGBA (even
 * hidden transparent RGB), independent mask values, height/material, HDR and semantic masks use
 * the same mapping. XY normals follow flips/rotation; Z and height remain unchanged. Cleared cells
 * zero their raster channels. Placement, sockets, rig metadata and procedural settings are not
 * transformed: this is a native raster edit, not a character-rig placement operation.
 *
 * Protected source cells are excluded without shifting the anchor. Protected destinations,
 * default out-of-bounds movement and many-to-one wrapped mappings reject before any source data
 * can change. `clip` intentionally clears moved source cells whose targets leave the canvas.
 */
export function transformPixelSelection2D<T extends PixelTransformRaster2D>(
  source: T, selection: ArrayLike<number>, input: PixelSelectionTransformOptions2D = {},
): PixelSelectionTransformResult2D<T> {
  const count = checkRaster(source), options = validatePixelSelectionTransformOptions2D(input);
  const bounds = pixelSelectionBounds2D(source.w, source.h, selection), protection = input.protectedMask;
  if (protection !== undefined) pixelSelectionBounds2D(source.w, source.h, protection);
  const outputSelection = new Uint8Array(count), touched = new Uint8Array(count), { w, h } = source;
  if (!bounds) return { sprite: cloneRaster(source), selection: outputSelection, touched, clipped: 0 };
  const [dx, dy] = options.offset, turns = options.quarterTurns;
  const target = (x: number, y: number): number => {
    let u = x - bounds.x, v = y - bounds.y;
    if (options.flipX) u = bounds.w - 1 - u;
    if (options.flipY) v = bounds.h - 1 - v;
    const xx = turns === 1 ? bounds.h - 1 - v : turns === 2 ? bounds.w - 1 - u : turns === 3 ? v : u;
    const yy = turns === 1 ? u : turns === 2 ? bounds.h - 1 - v : turns === 3 ? bounds.w - 1 - u : v;
    let tx = bounds.x + dx + xx, ty = bounds.y + dy + yy;
    if (options.boundary === 'wrap') { tx = ((tx % w) + w) % w; ty = ((ty % h) + h) % h; }
    return tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : ty * w + tx;
  };
  let clipped = 0;
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
    const i = y * w + x;
    if (!selection[i] || protection?.[i]) continue;
    const j = target(x, y);
    if (j < 0) {
      if (options.boundary === 'reject') throw new RangeError('Selected pixels would leave the canvas; choose clip or wrap explicitly');
      clipped++; continue;
    }
    if (protection?.[j]) throw new RangeError('Transformed pixels would overwrite a protected cell');
    if (outputSelection[j]) throw new RangeError('Wrapped transform would map multiple selected cells onto one destination');
    outputSelection[j] = 1;
  }
  const out = cloneRaster(source), channels = out.channels, emission = out.emission;
  const semantic = source.semanticMasks ? Object.entries(source.semanticMasks).map(([name, values]) => [values, out.semanticMasks![name]] as const) : [];
  if (!options.copy) for (let y = bounds.y; y < bounds.y + bounds.h; y++) for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
    const i = y * w + x;
    if (!selection[i] || protection?.[i]) continue;
    touched[i] = 1; out.pixels[i] = 0; out.mask.data[i] = 0;
    if (channels) { channels.material[i] = 0; channels.height[i] = 0; channels.normal.fill(0, i * 3, i * 3 + 3); }
    if (emission) emission.fill(0, i * 3, i * 3 + 3);
    for (const [, destination] of semantic) destination[i] = 0;
  }
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
    const i = y * w + x;
    if (!selection[i] || protection?.[i]) continue;
    const j = target(x, y);
    if (j < 0) continue;
    touched[j] = 1; out.pixels[j] = source.pixels[i]; out.mask.data[j] = source.mask.data[i];
    if (channels) {
      const original = source.channels!;
      channels.material[j] = original.material[i]; channels.height[j] = original.height[i];
      const nx = original.normal[i * 3] * (options.flipX ? -1 : 1), ny = original.normal[i * 3 + 1] * (options.flipY ? -1 : 1);
      channels.normal[j * 3] = turns === 1 ? -ny : turns === 2 ? -nx : turns === 3 ? ny : nx;
      channels.normal[j * 3 + 1] = turns === 1 ? nx : turns === 2 ? -ny : turns === 3 ? -nx : ny;
      channels.normal[j * 3 + 2] = original.normal[i * 3 + 2];
    }
    if (emission) {
      emission[j * 3] = source.emission![i * 3]; emission[j * 3 + 1] = source.emission![i * 3 + 1]; emission[j * 3 + 2] = source.emission![i * 3 + 2];
    }
    for (const [original, destination] of semantic) destination[j] = original[i];
  }
  return { sprite: out, selection: outputSelection, touched, clipped };
}
