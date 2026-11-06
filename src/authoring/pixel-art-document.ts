import type { EditableSprite2D } from '../core/sprite-edit.js';
import type { MaterialChannels2D } from '../core/material-surface.js';
import { createPixelMaterial2D } from '../core/pixel-material.js';
import { createPixelPaletteMapper2D } from '../core/pixel-palette.js';
import { transformPixelSelection2D, validatePixelSelectionTransformOptions2D, type PixelSelectionTransformOptions2D } from '../core/pixel-transform.js';
import { createPixelRelighter2D, type PixelRelightOptions2D } from '../core/pixel-relight.js';
import { createPixelArtProject2D, validatePixelArtProject2D, pixelArtLayerLimit2D, type PixelArtLayer2D, type PixelArtProject2D } from './pixel-art-project.js';

export interface PixelArtLayerIdentity2D {
  id: string;
  name: string;
  visible?: boolean;
  /** Editing lock, independent of visibility. Locked layers still render. */
  locked?: boolean;
}
export interface PixelArtMaterialLayer2D extends PixelArtLayerIdentity2D, PixelArtLayer2D { kind: 'material' }
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
export type PixelArtDocumentLayer2D = PixelArtMaterialLayer2D | PixelArtPaintLayer2D | PixelArtPaletteLayer2D | PixelArtTransformLayer2D | PixelArtRelightLayer2D;
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
  /** Ordered authoring swatches; independent of any palette applied to the artwork. */
  workingPalette?: number[];
  activeLayerId?: string;
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
      if (!Array.isArray(layer.indices) || layer.indices.length > n) throw new RangeError('Paint indices must fit the raster');
      let previous = -1;
      for (const i of layer.indices) { if (!Number.isInteger(i) || i <= previous || i >= n) throw new RangeError('Paint indices must be unique, sorted and inside the raster'); previous = i; }
      if (layer.opacity !== undefined && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new RangeError('Layer opacity must be within 0..1');
      return { ...common, kind: 'paint', indices: layer.indices.slice(), pixels: values(layer.pixels, layer.indices.length, 'Paint pixels', packed), ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}) };
    }
    const masks = optionalMasks(layer, n);
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
    return { ...common, kind: 'material', material: structuredClone(createPixelMaterial2D(layer.material).options), ...masks,
      ...(objectOrigin ? { origin: objectOrigin } : {}), ...(layer.height !== undefined ? { height: values(layer.height, n, 'Authored height', float) } : {}) };
  });
  let channels: PixelArtDocument2D['channels'];
  if (p.channels !== undefined) {
    if (!p.channels || typeof p.channels !== 'object') throw new RangeError('Invalid source material channels');
    channels = { material: values(p.channels.material, n, 'Material IDs', v => Number.isInteger(v) && v >= 0 && v <= 65535),
      height: values(p.channels.height, n, 'Source height', float), normal: values(p.channels.normal, n * 3, 'Source normals', float) };
  }
  if (p.activeLayerId !== undefined && !ids.has(p.activeLayerId)) throw new RangeError('Active layer must exist in the document');
  if (p.workingPalette !== undefined && (!Array.isArray(p.workingPalette) || p.workingPalette.length < 1 || p.workingPalette.length > 256
    || !Array.from(p.workingPalette).every(value => packed(value) && value >>> 24 === 255))) throw new RangeError('Working palette needs 1..256 opaque packed colors');
  return { schema: 'poku-pixel-art/v2', name: p.name, width: p.width, height: p.height, pixels, ...(sourceMask ? { mask: sourceMask } : {}), layers,
    ...(channels ? { channels } : {}), ...optionalMasks(p, n), ...(p.authoredHeight !== undefined ? { authoredHeight: values(p.authoredHeight, n, 'Document height', float) } : {}),
    ...(p.workingPalette ? { workingPalette: p.workingPalette.slice() } : {}),
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

/** Resolve the editable form height in the currently visible geometry. authoredHeight
 * remains the immutable original shape: visible transforms and paint occupancy replay in
 * layer order, while material relief, palette and lighting do not alter this working map.
 * No material or lighting pass is rendered. Missing authored height stays undefined. */
export function renderPixelArtAuthoredHeight2D(document: PixelArtDocument2D): Float32Array | undefined {
  const p = validatePixelArtDocument2D(document);
  if (!p.authoredHeight) return undefined;
  let out = sourceRaster(p);
  const n = p.width * p.height;
  out.channels = { w: p.width, h: p.height, material: out.channels?.material ?? new Uint16Array(n),
    height: Float32Array.from(p.authoredHeight), normal: out.channels?.normal ?? new Float32Array(n * 3) };
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === 'transform') out = transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite;
    else if (layer.kind === 'paint') out = paintRaster(out, layer);
  }
  return out.channels!.height;
}

/** Replay only when the document changes; the UI caches this committed raster between previews. */
export function renderPixelArtDocument2D(document: PixelArtDocument2D): PixelArtDocumentRaster2D {
  const p = validatePixelArtDocument2D(document);
  let out = sourceRaster(p);
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === 'material') { out = createPixelMaterial2D(layer.material).shade(out, layer); continue; }
    if (layer.kind === 'palette') { out = createPixelPaletteMapper2D(layer.palette, layer).remap(out, layer); continue; }
    if (layer.kind === 'transform') { out = transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite; continue; }
    if (layer.kind === 'relight') { out = createPixelRelighter2D(layer.lighting).shade(out, layer); continue; }
    out = paintRaster(out, layer);
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
