import type { EditableSprite2D } from '../core/sprite-edit.js';
import type { MaterialChannels2D } from '../core/material-surface.js';
import { createPixelMaterial2D } from '../core/pixel-material.js';
import { createPixelPaletteMapper2D } from '../core/pixel-palette.js';
import { transformPixelSelection2D, validatePixelSelectionTransformOptions2D, type PixelSelectionTransformOptions2D } from '../core/pixel-transform.js';
import { createPixelRelighter2D, type PixelRelightOptions2D } from '../core/pixel-relight.js';
import { paintPixelMask2D } from '../core/pixel-brush.js';
import { rasterizePixelPath2D, validatePixelArtPath2D, type PixelArtPathNode2D, type PixelArtPathOptions2D } from '../core/pixel-path.js';
import { applyPixelHeightDeltas2D, refreshPixelHeightNormals2D } from '../core/pixel-sculpt.js';
import { createPixelArtProject2D, validatePixelArtProject2D, pixelArtLayerLimit2D, type PixelArtLayer2D, type PixelArtProject2D } from './pixel-art-project.js';

export interface PixelArtLayerIdentity2D {
  id: string;
  name: string;
  visible?: boolean;
  /** Editing lock, independent of visibility. Locked layers still render. */
  locked?: boolean;
}
export interface PixelArtMaterialLayer2D extends PixelArtLayerIdentity2D, PixelArtLayer2D {
  kind: 'material';
  /** Opt-in live form geometry. Older layers keep their explicit height snapshot. */
  heightSource?: 'authored';
}
/** Sparse exact cell replacements. A zero-alpha cell deliberately erases lower artwork.
 * Consecutive strokes edit one layer instead of consuming a layer per pointer event. */
export interface PixelArtPaintLayer2D extends PixelArtLayerIdentity2D {
  kind: 'paint';
  indices: number[];
  pixels: number[];
  /** 1 keeps exact authored colors. Intermediate values use premultiplied-alpha compositing. */
  opacity?: number;
}
export interface PixelArtPaletteLayer2D extends PixelArtLayerIdentity2D {
  kind: 'palette';
  palette: (string | number)[];
  dither?: 'none' | 'bayer4' | 'bayer8';
  /** Ordered-dither amount. Zero still maps to the nearest palette color. */
  strength?: number;
  origin?: [number, number];
  selection?: number[];
  protectedMask?: number[];
}
/** Replay an exact grid transform without flattening the editable artwork below it. */
export interface PixelArtTransformLayer2D extends PixelArtLayerIdentity2D {
  kind: 'transform';
  selection: number[];
  protectedMask?: number[];
  transform: Omit<PixelSelectionTransformOptions2D, 'protectedMask'>;
}
/** Lighting is evaluated from the lower layers each time, so adjustments never accumulate. */
export interface PixelArtRelightLayer2D extends PixelArtLayerIdentity2D {
  kind: 'relight';
  lighting: PixelRelightOptions2D;
  selection?: number[];
  protectedMask?: number[];
}
/** Explicit native-height offsets; color and coverage are never inferred or modified. */
export interface PixelArtHeightLayer2D extends PixelArtLayerIdentity2D {
  kind: 'height';
  indices: number[];
  deltas: number[];
  strength?: number;
  wrap?: boolean;
  protectedMask?: number[];
}
/** Editable cubic construction, rasterized to binary native cells before painting. */
export interface PixelArtPathLayer2D extends PixelArtLayerIdentity2D {
  kind: 'path';
  nodes: PixelArtPathNode2D[];
  options: PixelArtPathOptions2D;
  color: number;
  selection?: number[];
  protectedMask?: number[];
  alphaLock?: boolean;
}
export type PixelArtDocumentLayer2D = PixelArtMaterialLayer2D | PixelArtPaintLayer2D | PixelArtPaletteLayer2D | PixelArtTransformLayer2D | PixelArtRelightLayer2D | PixelArtHeightLayer2D | PixelArtPathLayer2D;
export interface PixelArtDocument2D {
  schema: 'poku-pixel-art/v2';
  name: string;
  width: number;
  height: number;
  pixels: number[];
  mask?: number[];
  /** Optional baked source geometry, retained by flatten/save/reopen. */
  channels?: { material: number[]; height: number[]; normal: number[] };
  layers: PixelArtDocumentLayer2D[];
  selection?: number[];
  protectedMask?: number[];
  authoredHeight?: number[];
  activeLayerId?: string;
  /** Editor swatches, independent of rendered palette-adjustment layers. */
  workingPalette?: number[];
}
export type PixelArtDocumentRaster2D = EditableSprite2D & { channels?: MaterialChannels2D };

const MAX_BYTES = 64 * 1024 * 1024;
const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
function cells(width: number, height: number): number {
  pixelArtLayerLimit2D(width, height);
  return width * height;
}
function values(input: unknown, n: number, label: string, valid: (v: number) => boolean): number[] {
  if (!Array.isArray(input) || input.length !== n || !Array.from(input).every(valid)) throw new RangeError(`${label} must have ${n} valid native values`);
  return input.slice();
}
function binary(input: unknown, n: number, label: string): number[] | undefined {
  return input === undefined ? undefined : values(input, n, label, v => v === 0 || v === 1);
}
const packed = (v: number) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const float = (v: number) => Number.isFinite(v) && Number.isFinite(Math.fround(v));
/** Preserve ordered editor swatches, accepting packed engine colors and normalizing
 * signed JavaScript bitwise colors to the same unsigned bytes used in saved documents. */
export function validatePixelArtWorkingPalette2D(input: unknown): number[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length < 1 || input.length > 256
    || !Array.from(input).every(v => Number.isInteger(v) && v >= -0x80000000 && v <= 0xffffffff))
    throw new RangeError('Working palette needs 1..256 packed RGBA colors');
  return input.map(value => value >>> 0);
}
function origin(input: unknown): [number, number] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length !== 2 || !Array.from(input).every(v => Number.isFinite(v) && Math.abs(v) <= 1e9)) throw new RangeError('Origin needs two finite coordinates within ±1e9');
  return [...input] as [number, number];
}
function identity(layer: PixelArtDocumentLayer2D): PixelArtLayerIdentity2D {
  if (!validName(layer.id) || !validName(layer.name) || layer.visible !== undefined && typeof layer.visible !== 'boolean' || layer.locked !== undefined && typeof layer.locked !== 'boolean') throw new RangeError('Every layer needs an ID, name and boolean visibility/lock');
  return { id: layer.id, name: layer.name, ...(layer.visible !== undefined ? { visible: layer.visible } : {}), ...(layer.locked !== undefined ? { locked: layer.locked } : {}) };
}
function optionalMasks(layer: { selection?: unknown; protectedMask?: unknown }, n: number) {
  return { ...(layer.selection !== undefined ? { selection: binary(layer.selection, n, 'Selection') } : {}),
    ...(layer.protectedMask !== undefined ? { protectedMask: binary(layer.protectedMask, n, 'Protection') } : {}) };
}
function sparseIndices(input: unknown, n: number, label: string): number[] {
  if (!Array.isArray(input) || input.length > n) throw new RangeError(`${label} indices must fit the raster`);
  let previous = -1;
  for (const i of input) {
    if (!Number.isInteger(i) || i <= previous || i >= n) throw new RangeError(`${label} indices must be unique, sorted and inside the raster`);
    previous = i;
  }
  return input.slice();
}

/** Upgrade is explicit and leaves the existing v1 API and wire format unchanged. */
export function upgradePixelArtProject2D(project: PixelArtProject2D): PixelArtDocument2D {
  const p = validatePixelArtProject2D(project);
  return { ...p, schema: 'poku-pixel-art/v2', layers: p.layers.map((layer, i) => ({ ...layer, id: `material-${i + 1}`, kind: 'material' })) };
}

/** v2 imports are data only. v1 documents are validated by their original parser and upgraded. */
export function validatePixelArtDocument2D(input: unknown): PixelArtDocument2D {
  if (!input || typeof input !== 'object') throw new TypeError('Expected a pixel art document');
  if ((input as { schema?: string }).schema === 'poku-pixel-art/v1') return upgradePixelArtProject2D(input as PixelArtProject2D);
  const p = input as PixelArtDocument2D;
  if (p.schema !== 'poku-pixel-art/v2' || !validName(p.name)) throw new RangeError('Invalid pixel art document identity');
  const n = cells(p.width, p.height), pixels = values(p.pixels, n, 'Source pixels', packed), sourceMask = binary(p.mask, n, 'Source mask');
  if (!Array.isArray(p.layers) || p.layers.length > pixelArtLayerLimit2D(p.width, p.height)) throw new RangeError('Pixel art layer budget exceeded');
  const ids = new Set<string>();
  const layers: PixelArtDocumentLayer2D[] = Array.from(p.layers, layer => {
    if (!layer || typeof layer !== 'object') throw new RangeError('Invalid pixel art layer');
    const common = identity(layer);
    if (ids.has(common.id)) throw new RangeError('Layer IDs must be unique');
    ids.add(common.id);
    if (layer.kind === 'paint') {
      const indices = sparseIndices(layer.indices, n, 'Paint');
      if (layer.opacity !== undefined && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new RangeError('Layer opacity must be within 0..1');
      return { ...common, kind: 'paint', indices, pixels: values(layer.pixels, indices.length, 'Paint pixels', packed), ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}) };
    }
    if (layer.kind === 'height') {
      const indices = sparseIndices(layer.indices, n, 'Height');
      if (layer.strength !== undefined && (!Number.isFinite(layer.strength) || layer.strength < 0 || layer.strength > 4)) throw new RangeError('Height layer strength must be within 0..4');
      if (layer.wrap !== undefined && typeof layer.wrap !== 'boolean') throw new RangeError('Height wrap must be boolean');
      return { ...common, kind: 'height', indices, deltas: values(layer.deltas, indices.length, 'Height offsets', float),
        ...(layer.strength !== undefined ? { strength: layer.strength } : {}), ...(layer.wrap !== undefined ? { wrap: layer.wrap } : {}),
        ...(layer.protectedMask !== undefined ? { protectedMask: binary(layer.protectedMask, n, 'Height protection') } : {}) };
    }
    const masks = optionalMasks(layer, n);
    if (layer.kind === 'path') {
      const path = validatePixelArtPath2D(layer.nodes, layer.options);
      if (!Number.isInteger(layer.color) || layer.color < -0x80000000 || layer.color > 0xffffffff) throw new RangeError('Path color must be packed RGBA');
      if (layer.alphaLock !== undefined && typeof layer.alphaLock !== 'boolean') throw new RangeError('Path alpha lock must be boolean');
      return { ...common, kind: 'path', ...path, color: layer.color >>> 0, ...masks, ...(layer.alphaLock !== undefined ? { alphaLock: layer.alphaLock } : {}) };
    }
    if (layer.kind === 'transform') {
      const t = layer.transform;
      if (!t || typeof t !== 'object' || !Array.isArray(layer.selection)) throw new RangeError('Transform layers need a selection and grid transform');
      const transform = validatePixelSelectionTransformOptions2D(t);
      return { ...common, kind: 'transform', ...masks, selection: masks.selection!, transform };
    }
    if (layer.kind === 'relight') {
      if (!layer.lighting || typeof layer.lighting !== 'object') throw new RangeError('Relight layers need lighting options');
      return { ...common, kind: 'relight', lighting: structuredClone(createPixelRelighter2D(layer.lighting).options), ...masks };
    }
    const objectOrigin = origin(layer.origin);
    if (layer.kind === 'palette') {
      const options = createPixelPaletteMapper2D(layer.palette, { dither: layer.dither, strength: layer.strength }).options;
      return { ...common, kind: 'palette', palette: [...options.palette], dither: options.dither, strength: options.strength, ...masks, ...(objectOrigin ? { origin: objectOrigin } : {}) };
    }
    if (layer.kind !== 'material' || !layer.material || typeof layer.material !== 'object') throw new RangeError('Unknown pixel art layer kind');
    if (layer.heightSource !== undefined && layer.heightSource !== 'authored') throw new RangeError('Unknown material height source');
    return { ...common, kind: 'material', material: structuredClone(createPixelMaterial2D(layer.material).options), ...masks,
      ...(layer.heightSource ? { heightSource: layer.heightSource } : {}),
      ...(objectOrigin ? { origin: objectOrigin } : {}), ...(layer.height !== undefined ? { height: values(layer.height, n, 'Authored height', float) } : {}) };
  });
  let channels: PixelArtDocument2D['channels'];
  if (p.channels !== undefined) {
    if (!p.channels || typeof p.channels !== 'object') throw new RangeError('Invalid source material channels');
    channels = { material: values(p.channels.material, n, 'Material IDs', v => Number.isInteger(v) && v >= 0 && v <= 65535),
      height: values(p.channels.height, n, 'Source height', float), normal: values(p.channels.normal, n * 3, 'Source normals', float) };
  }
  if (p.activeLayerId !== undefined && !ids.has(p.activeLayerId)) throw new RangeError('Active layer must exist in the document');
  const workingPalette = validatePixelArtWorkingPalette2D(p.workingPalette);
  return { schema: 'poku-pixel-art/v2', name: p.name, width: p.width, height: p.height, pixels, ...(sourceMask ? { mask: sourceMask } : {}), layers,
    ...(workingPalette ? { workingPalette } : {}),
    ...(channels ? { channels } : {}), ...optionalMasks(p, n), ...(p.authoredHeight !== undefined ? { authoredHeight: values(p.authoredHeight, n, 'Document height', float) } : {}),
    ...(p.activeLayerId !== undefined ? { activeLayerId: p.activeLayerId } : {}) };
}

export function createPixelArtDocument2D(source: PixelArtDocumentRaster2D, name = 'Pixel artwork'): PixelArtDocument2D {
  const document = upgradePixelArtProject2D(createPixelArtProject2D(source, name));
  if(source.channels&&(source.channels.w!==source.w||source.channels.h!==source.h))throw new RangeError('Source geometry must match the native raster');
  if (source.channels) document.channels = { material: Array.from(source.channels.material), height: Array.from(source.channels.height), normal: Array.from(source.channels.normal) };
  return validatePixelArtDocument2D(document);
}
export function createBlankPixelArtDocument2D(width: number, height: number, name = 'Untitled pixel artwork'): PixelArtDocument2D {
  if(!validName(name))throw new RangeError('Invalid pixel art document name');
  return { schema: 'poku-pixel-art/v2', name, width, height, pixels: new Array(cells(width, height)).fill(0), layers: [] };
}
function sourceRaster(p: PixelArtDocument2D): PixelArtDocumentRaster2D {
  return { w: p.width, h: p.height, pixels: Uint32Array.from(p.pixels), mask: { w: p.width, h: p.height, data: p.mask ? Uint8Array.from(p.mask) : Uint8Array.from(p.pixels, c => c >>> 24 ? 1 : 0) },
    ...(p.channels ? { channels: { w: p.width, h: p.height, material: Uint16Array.from(p.channels.material), height: Float32Array.from(p.channels.height), normal: Float32Array.from(p.channels.normal) } } : {}) };
}
/** Premultiplied interpolation implements partial-opacity replacement, including partial erasure. */
function replacement(a: number, b: number, t: number): number {
  if (t === 1) return b;
  if (t === 0) return a;
  const aa = a >>> 24, ba = b >>> 24, alpha = aa * (1 - t) + ba * t, roundedAlpha = Math.round(alpha);
  if (!roundedAlpha) return 0;
  let c = (roundedAlpha << 24) >>> 0;
  for (const shift of [0, 8, 16]) c |= Math.round((((a >>> shift) & 255) * aa * (1 - t) + ((b >>> shift) & 255) * ba * t) / alpha) << shift;
  return c >>> 0;
}

/** Shared by visible rendering and the raw form-height replay. A paint operation keeps
 * existing geometry while the cell remains occupied; new/fully erased cells reset it. */
function paintRaster(out: PixelArtDocumentRaster2D, layer: PixelArtPaintLayer2D): PixelArtDocumentRaster2D {
  const t = layer.opacity ?? 1;
  if (!t) return out;
  const pixels = out.pixels.slice(), mask = { ...out.mask, data: out.mask.data.slice() };
  const channels = out.channels ? { ...out.channels, material: out.channels.material.slice(), height: out.channels.height.slice(), normal: out.channels.normal.slice() } : undefined;
  for (let j = 0; j < layer.indices.length; j++) {
    const i = layer.indices[j], before = mask.data[i] && pixels[i] >>> 24;
    pixels[i] = replacement(mask.data[i] ? pixels[i] : 0, layer.pixels[j], t);
    mask.data[i] = pixels[i] >>> 24 ? 1 : 0;
    if (channels && (!before || !mask.data[i])) { channels.material[i] = 0; channels.height[i] = 0; channels.normal.set([0, 0, 1], i * 3); }
  }
  return { ...out, pixels, mask, ...(channels ? { channels } : {}) };
}

function pathRaster(out: PixelArtDocumentRaster2D, layer: PixelArtPathLayer2D): PixelArtDocumentRaster2D {
  const coverage = rasterizePixelPath2D(out.w, out.h, layer.nodes, layer.options);
  const painted = paintPixelMask2D(out, coverage, layer.color, { mode: 'replace', selection: layer.selection,
    protectedMask: layer.protectedMask, alphaLock: layer.alphaLock });
  const indices: number[] = [], pixels: number[] = [];
  for (let i = 0; i < coverage.length; i++) {
    if (painted.pixels[i] !== out.pixels[i] || painted.mask.data[i] !== out.mask.data[i]) { indices.push(i); pixels.push(painted.pixels[i]); }
  }
  return indices.length ? paintRaster(out, { kind: 'paint', id: layer.id, name: layer.name, indices, pixels }) : out;
}

/** Subsequent silhouette edits reconnect only the affected sculpt normals. Protection
 * belongs to this operation: earlier height masks do not become permanent normal locks
 * or acquire stale coordinates after a transform. Sparse paint already records its exact
 * permitted writes; editable paths retain their own explicit protection snapshot. */
function refreshPaintedSurface(before: PixelArtDocumentRaster2D, after: PixelArtDocumentRaster2D,
  wrap: boolean, protectedMask?: ArrayLike<number>): PixelArtDocumentRaster2D {
  if (before === after || !after.channels) return after;
  let changed: Uint8Array | undefined;
  for (let i = 0; i < after.pixels.length; i++) {
    const wasOccupied = !!before.mask.data[i] && !!(before.pixels[i] >>> 24);
    const isOccupied = !!after.mask.data[i] && !!(after.pixels[i] >>> 24);
    if (wasOccupied !== isOccupied) { changed ??= new Uint8Array(after.pixels.length); changed[i] = 1; }
  }
  return changed ? refreshPixelHeightNormals2D({ ...after, channels: after.channels }, changed, { wrap, protectedMask }) : after;
}

/** Replay geometry alone. Material relief stays separate from hand-authored form, so
 * applying a later material never adds an earlier material's relief a second time. */
function formRaster(p: PixelArtDocument2D): PixelArtDocumentRaster2D {
  const out = sourceRaster(p), n = p.width * p.height, normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normal[i * 3 + 2] = 1;
  return { ...out, channels: { w: p.width, h: p.height, material: new Uint16Array(n),
    height: p.authoredHeight ? Float32Array.from(p.authoredHeight) : new Float32Array(n), normal } };
}
function replayFormLayer(out: PixelArtDocumentRaster2D, layer: PixelArtDocumentLayer2D): PixelArtDocumentRaster2D {
  if (layer.kind === 'transform') return transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite;
  if (layer.kind === 'paint') return paintRaster(out, layer);
  if (layer.kind === 'path') return pathRaster(out, layer);
  if (layer.kind === 'height') return applyPixelHeightDeltas2D(out, layer.indices, layer.deltas, layer);
  return out;
}

/** Resolve the editable form height in the currently visible geometry. authoredHeight
 * remains the immutable original shape: visible transforms and paint occupancy replay in
 * layer order, while material relief, palette and lighting do not alter this working map.
 * No material or lighting pass is rendered. Missing authored height stays undefined. */
export function renderPixelArtAuthoredHeight2D(document: PixelArtDocument2D): Float32Array | undefined {
  const p = validatePixelArtDocument2D(document);
  if (!p.authoredHeight && !p.layers.some(layer => layer.kind === 'height' && layer.visible !== false)) return undefined;
  let out = formRaster(p);
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    out = replayFormLayer(out, layer);
  }
  return out.channels!.height;
}

/** Replay only when the document changes; the UI caches this committed raster between previews. */
export function renderPixelArtDocument2D(document: PixelArtDocument2D): PixelArtDocumentRaster2D {
  const p = validatePixelArtDocument2D(document);
  let out = sourceRaster(p);
  // Only the new height layer needs this parallel form replay. Older documents keep
  // their exact rendering path, including their saved per-material height snapshots.
  let form = p.layers.some(layer => layer.visible !== false && (layer.kind === 'height' || layer.kind === 'material' && layer.heightSource === 'authored')) ? formRaster(p) : undefined;
  let sculptedSurface = false, surfaceWrap = false;
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === 'height') {
      out = applyPixelHeightDeltas2D(out, layer.indices, layer.deltas, { ...layer, height: form?.channels?.height });
      if (form) form = replayFormLayer(form, layer);
      sculptedSurface = true; surfaceWrap = layer.wrap ?? false;
      continue;
    }
    if (form) form = replayFormLayer(form, layer);
    if (layer.kind === 'material') {
      const material = createPixelMaterial2D(layer.material);
      out = material.shade(out, layer.heightSource === 'authored' ? { ...layer, height: form?.channels?.height } : layer);
      if (sculptedSurface) surfaceWrap = !!material.options.tileSize && material.options.tileSize[0] === p.width
        && material.options.tileSize[1] === p.height && !material.options.bevel;
      continue;
    }
    if (layer.kind === 'palette') { out = createPixelPaletteMapper2D(layer.palette, layer).remap(out, layer); continue; }
    if (layer.kind === 'transform') { out = transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite; continue; }
    if (layer.kind === 'relight') { out = createPixelRelighter2D(layer.lighting).shade(out, layer); continue; }
    if (layer.kind === 'path') {
      const before = out; out = pathRaster(out, layer);
      if (sculptedSurface) out = refreshPaintedSurface(before, out, surfaceWrap, layer.protectedMask);
      continue;
    }
    const before = out; out = paintRaster(out, layer);
    if (sculptedSurface) out = refreshPaintedSurface(before, out, surfaceWrap);
  }
  return out;
}

/** Replace touched sparse cells, leaving the input document and unrelated layer cells intact. */
export function writePixelArtPaintLayer2D(document: PixelArtDocument2D, source: EditableSprite2D, touched: ArrayLike<number>, layerId?: string): PixelArtDocument2D {
  const n = cells(document.width, document.height);
  if (source.w !== document.width || source.h !== document.height || !(source.pixels instanceof Uint32Array) || source.pixels.length !== n
    || source.mask.w!==source.w||source.mask.h!==source.h||!(source.mask.data instanceof Uint8Array)||source.mask.data.length!==n||touched.length !== n) throw new RangeError('Paint output and stroke mask must match the document');
  if(!(touched instanceof Uint8Array))for(let i=0;i<n;i++)if(!Number.isFinite(touched[i]))throw new RangeError('Stroke mask must contain finite native values');
  const index = layerId === undefined ? -1 : document.layers.findIndex(layer => layer.id === layerId);
  if (layerId !== undefined && index < 0) throw new RangeError('Paint layer does not exist');
  const existing = index < 0 ? undefined : document.layers[index];
  if (existing && (existing.kind !== 'paint' || existing.locked || existing.visible === false)) throw new RangeError('Choose an unlocked visible paint layer');
  const changes = new Map<number, number>();
  if (existing?.kind === 'paint') existing.indices.forEach((i, j) => changes.set(i, existing.pixels[j]));
  let changed = false;
  for (let i = 0; i < n; i++) if (touched[i]) { const c = source.mask.data[i] ? source.pixels[i] : 0; if (changes.get(i) !== c) changed = true; changes.set(i, c >>> 0); }
  if (!changed) return document;
  if (!existing && document.layers.length >= pixelArtLayerLimit2D(document.width, document.height)) throw new RangeError('Pixel art layer budget exceeded');
  const id = existing?.id ?? nextPixelArtLayerId2D(document, 'paint'), indices = [...changes.keys()].sort((a, b) => a - b);
  const layer: PixelArtPaintLayer2D = { ...(existing ?? { id, name: `Paint ${document.layers.length + 1}` }), kind: 'paint', indices, pixels: indices.map(i => changes.get(i)!) };
  const layers = document.layers.slice();
  if (index < 0) layers.push(layer); else layers[index] = layer;
  return { ...document, layers, activeLayerId: id };
}

/** Coalesce complete sculpt strokes into one editable additive-height layer. Deltas
 * come from a pre-stroke snapshot, so revisiting a cell never depends on event count. */
export function writePixelArtHeightLayer2D(document: PixelArtDocument2D, deltas: ArrayLike<number>, touched: ArrayLike<number>, layerId?: string,
  options: { wrap?: boolean; protectedMask?: ArrayLike<number> } = {}): PixelArtDocument2D {
  const n = cells(document.width, document.height);
  if (deltas.length !== n || touched.length !== n) throw new RangeError('Sculpt offsets and stroke mask must match the document');
  if (options.wrap !== undefined && typeof options.wrap !== 'boolean') throw new RangeError('Height wrap must be boolean');
  if (options.protectedMask && (options.protectedMask.length !== n || !Array.from(options.protectedMask).every(v => v === 0 || v === 1))) throw new RangeError('Height protection must match the document');
  const index = layerId === undefined ? -1 : document.layers.findIndex(layer => layer.id === layerId);
  if (layerId !== undefined && index < 0) throw new RangeError('Height layer does not exist');
  const existing = index < 0 ? undefined : document.layers[index];
  if (existing && (existing.kind !== 'height' || existing.locked || existing.visible === false)) throw new RangeError('Choose an unlocked visible height layer');
  const current = existing as PixelArtHeightLayer2D | undefined, strength = current?.strength ?? 1;
  if (current && index !== document.layers.length - 1) throw new RangeError('Choose the top height layer or create a new height layer for this stroke');
  if (!strength) throw new RangeError('Set the height layer strength above zero before sculpting');
  const changes = new Map<number, number>();
  current?.indices.forEach((i, j) => changes.set(i, current.deltas[j]));
  const strokeIndices: number[] = [], strokeDeltas: number[] = [];
  let changed = false, separate = false;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(touched[i]) || !float(deltas[i])) throw new RangeError('Sculpt changes must contain finite native values');
    const delta = Math.fround(deltas[i]);
    if (!touched[i] || !delta || options.protectedMask?.[i] || current?.protectedMask?.[i]) continue;
    strokeIndices.push(i); strokeDeltas.push(delta);
    const value = (changes.get(i) ?? 0) + delta / strength;
    if (!float(value)) separate = true;
    else if (value) changes.set(i, value); else changes.delete(i);
    changed = true;
  }
  if (!changed) return document;
  const wrap = options.wrap ?? current?.wrap ?? false;
  const protection = options.protectedMask && current?.protectedMask
    ? Uint8Array.from(options.protectedMask, (value, i) => Number(!!value || !!current.protectedMask![i]))
    : options.protectedMask ?? current?.protectedMask;
  const appendStroke = () => writePixelArtHeightLayer2D(document, deltas, touched, undefined,
    { wrap, ...(protection ? { protectedMask: protection } : {}) });
  if (separate) {
    if (current) return appendStroke();
    throw new RangeError('Accumulated height exceeds Float32 geometry range');
  }
  const indices = [...changes.keys()].sort((a, b) => a - b), accumulated = indices.map(i => changes.get(i)!);
  if (current) {
    const { activeLayerId: _active, ...base } = document;
    const lowerDocument = { ...base, layers: document.layers.slice(0, index) };
    const lower = renderPixelArtDocument2D(lowerDocument), form = renderPixelArtAuthoredHeight2D(lowerDocument);
    const before = applyPixelHeightDeltas2D(lower, current.indices, current.deltas, { ...current, height: form });
    const expected = applyPixelHeightDeltas2D(before, strokeIndices, strokeDeltas, { wrap, protectedMask: protection });
    let combined: ReturnType<typeof applyPixelHeightDeltas2D>;
    try { combined = applyPixelHeightDeltas2D(lower, indices, accumulated, { ...current, wrap, height: form }); }
    catch (error) { if (error instanceof RangeError) return appendStroke(); throw error; }
    let exact = true;
    for (let i = 0; i < n; i++) {
      if (combined.channels.height[i] !== expected.channels.height[i]) { exact = false; break; }
      const j = i * 3;
      if (combined.channels.normal[j] !== expected.channels.normal[j] || combined.channels.normal[j + 1] !== expected.channels.normal[j + 1]
        || combined.channels.normal[j + 2] !== expected.channels.normal[j + 2]) { exact = false; break; }
    }
    // The same offsets also replay over the relief-free authored form. Preserve that
    // result for later live-bound materials, even when the visible surface rounded away
    // a difference on top of a much larger procedural or baked height.
    if (exact) {
      const expectedForm = renderPixelArtAuthoredHeight2D(document)!;
      for (let j = 0; j < strokeIndices.length; j++) {
        const i = strokeIndices[j];
        if (before.mask.data[i] && before.pixels[i] >>> 24) {
          expectedForm[i] = Math.fround(expectedForm[i] + strokeDeltas[j]);
          if (!float(expectedForm[i])) throw new RangeError('Accumulated authored height exceeds Float32 geometry range');
        }
      }
      for (let i = 0; i < n; i++) {
        const combinedForm = lower.mask.data[i] && lower.pixels[i] >>> 24 && !current.protectedMask?.[i]
          ? Math.fround((form?.[i] ?? 0) + Math.fround(changes.get(i) ?? 0) * strength) : form?.[i] ?? 0;
        if (combinedForm !== expectedForm[i]) { exact = false; break; }
      }
    }
    // Two float32 offsets can represent a cancellation that a single offset cannot.
    // Normal provenance and authored form can differ after a net-zero edit, too. Keep
    // the second operation separate whenever coalescing would change the preview.
    if (!exact) return appendStroke();
  }
  if (!current && document.layers.length >= pixelArtLayerLimit2D(document.width, document.height)) throw new RangeError('Pixel art layer budget exceeded');
  const id = current?.id ?? nextPixelArtLayerId2D(document, 'height');
  const layer: PixelArtHeightLayer2D = { ...(current ?? { id, name: `Height ${document.layers.length + 1}` }), kind: 'height', indices,
    deltas: accumulated, wrap,
    ...(!current && options.protectedMask ? { protectedMask: Array.from(options.protectedMask) } : {}) };
  const layers = document.layers.slice();
  if (index < 0) layers.push(layer); else layers[index] = layer;
  return { ...document, layers, activeLayerId: id };
}
export function nextPixelArtLayerId2D(document: PixelArtDocument2D, prefix: string): string {
  let i = 1;
  while (document.layers.some(layer => layer.id === `${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
/** Bakes visible layers to an exact source, retaining geometry and current edit masks. Undo belongs to the editor. */
export function flattenPixelArtDocument2D(document: PixelArtDocument2D): PixelArtDocument2D {
  const p = validatePixelArtDocument2D(document), out = createPixelArtDocument2D(renderPixelArtDocument2D(p), p.name);
  const authoredHeight = renderPixelArtAuthoredHeight2D(p);
  return { ...out, ...optionalMasks(p, p.width * p.height), ...(authoredHeight ? { authoredHeight: Array.from(authoredHeight) } : {}),
    ...(p.workingPalette ? { workingPalette: p.workingPalette.slice() } : {}) };
}

function checkBytes(json: string): void {
  if (json.length > MAX_BYTES || new TextEncoder().encode(json).byteLength > MAX_BYTES) throw new RangeError('Pixel art document exceeds 64 MiB');
}
export function serializePixelArtDocument2D(document: PixelArtDocument2D): string {
  const json = JSON.stringify(validatePixelArtDocument2D(document)); checkBytes(json); return json;
}
export function parsePixelArtDocument2D(json: string): PixelArtDocument2D {
  if (typeof json !== 'string') throw new TypeError('Pixel art document JSON must be a string');
  checkBytes(json); return validatePixelArtDocument2D(JSON.parse(json));
}

/** Reference snapshots require immutable commits; serialization isolates history from callers.
 * A byte budget bounds large canvases as well as the number of small editing steps. */
export class PixelArtDocumentHistory2D {
  private past: string[] = [];
  private future: string[] = [];
  private current: string;
  private bytes = 0;
  constructor(document: PixelArtDocument2D, readonly limit = 64, readonly byteLimit = 32 * 1024 * 1024) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(byteLimit) || byteLimit < 1) throw new RangeError('History limits must be positive integers');
    this.current = serializePixelArtDocument2D(document);
  }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get value(): PixelArtDocument2D { return parsePixelArtDocument2D(this.current); }
  commit(document: PixelArtDocument2D): boolean {
    const next = serializePixelArtDocument2D(document);
    if (next === this.current) return false;
    this.past.push(this.current); this.bytes += this.current.length * 2; this.current = next; this.future = [];
    this.bytes = this.past.reduce((sum, value) => sum + value.length * 2, 0);
    while (this.past.length && (this.past.length > this.limit || this.bytes > this.byteLimit)) this.bytes -= this.past.shift()!.length * 2;
    return true;
  }
  undo(): PixelArtDocument2D { const previous = this.past.pop(); if (previous !== undefined) { this.bytes -= previous.length * 2; this.future.push(this.current); this.current = previous; this.trimFuture(); } return this.value; }
  redo(): PixelArtDocument2D { const next = this.future.pop(); if (next !== undefined) { this.past.push(this.current); this.bytes += this.current.length * 2; this.current = next;
    while(this.past.length&&(this.past.length>this.limit||this.bytes>this.byteLimit))this.bytes-=this.past.shift()!.length*2;
  } return this.value; }
  private trimFuture(): void {
    let size = this.bytes + this.future.reduce((sum, value) => sum + value.length * 2, 0);
    while (this.future.length && size > this.byteLimit) size -= this.future.shift()!.length * 2;
  }
}
