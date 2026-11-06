import type { EditableSprite2D } from '../core/sprite-edit.js';
import type { SpriteClipData2D, SpriteClipFrame2D } from '../core/sprite-clip.js';
import { pixelArtLayerLimit2D, type PixelArtProject2D } from './pixel-art-project.js';
import { createBlankPixelArtDocument2D, renderPixelArtDocument2D, validatePixelArtDocument2D,
  type PixelArtDocument2D, type PixelArtDocumentRaster2D } from './pixel-art-document.js';

export type PixelArtAnimationDirection2D = 'forward' | 'reverse' | 'pingpong';

export interface PixelArtAnimationFrame2D {
  id: string;
  name: string;
  /** Authored milliseconds; fractional durations, such as 1000 / 60, are supported. */
  durationMs: number;
  /** Each cel retains its own editable layers, exact source RGBA and surface geometry. */
  document: PixelArtDocument2D;
}

/** v3 is a cel container, not a replacement for the standalone v1/v2 document formats. */
export interface PixelArtAnimation2D {
  schema: 'poku-pixel-art/v3';
  name: string;
  width: number;
  height: number;
  frames: PixelArtAnimationFrame2D[];
  activeFrameId: string;
  loop: boolean;
  direction: PixelArtAnimationDirection2D;
}

export interface PixelArtAnimationOptions2D {
  name?: string;
  durationMs?: number;
  loop?: boolean;
  direction?: PixelArtAnimationDirection2D;
}

/** Aggregate limits apply before copying imported cels or allocating export rasters. */
export const PIXEL_ART_ANIMATION_LIMITS_2D = Object.freeze({
  frames: 256,
  nativeCells: 8_388_608,
  storedValues: 16_777_216,
  renderCells: 67_108_864,
  jsonBytes: 64 * 1024 * 1024,
  sheetCells: 16_777_216,
  sheetDimension: 16384,
});

const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const validDuration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value / 1000 > 0;
const directions: readonly string[] = ['forward', 'reverse', 'pingpong'];
// This is a runtime check, not a Record<string, unknown> type guard: intersecting a
// typed options interface with that record would erase optional-property types.
const object = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value);

function checkedOptions(options: PixelArtAnimationOptions2D): Required<Omit<PixelArtAnimationOptions2D, 'name'>> {
  if (!object(options) || options.name !== undefined && !validName(options.name)) throw new RangeError('Animation needs a valid name');
  const durationMs = options.durationMs ?? 100, loop = options.loop ?? true, direction = options.direction ?? 'forward';
  if (!validDuration(durationMs) || typeof loop !== 'boolean' || !directions.includes(direction)) throw new RangeError('Animation needs positive finite durations, a boolean loop flag and a supported direction');
  return { durationMs, loop, direction };
}

/** The independent source cell budget also gives UIs a cheap upper frame-count bound. */
export function pixelArtAnimationFrameLimit2D(width: number, height: number): number {
  pixelArtLayerLimit2D(width, height);
  return Math.min(PIXEL_ART_ANIMATION_LIMITS_2D.frames, Math.floor(PIXEL_ART_ANIMATION_LIMITS_2D.nativeCells / (width * height)));
}

function arrayLength(value: unknown): number { return Array.isArray(value) ? value.length : 0; }

/** Counts the document's native arrays without walking or copying every pixel. Layer
 * options are included so new transform/relight layers share this storage budget. */
function documentFootprint(document: PixelArtDocument2D): { stored: number; render: number } {
  if (!object(document) || !Array.isArray(document.layers) || !Array.isArray(document.pixels)) throw new RangeError('Animation frames need editable pixel documents');
  let stored = 0;
  for (const value of Object.values(document)) if (Array.isArray(value) && value !== document.layers) stored += value.length;
  if (object(document.channels)) for (const value of Object.values(document.channels!)) stored += arrayLength(value);
  for (const layer of document.layers) {
    if (!object(layer)) throw new RangeError('Animation contains an invalid layer');
    for (const value of Object.values(layer)) {
      stored += arrayLength(value);
      if (object(value)) for (const option of Object.values(value as Record<string, unknown>)) stored += arrayLength(option);
    }
  }
  return { stored, render: document.width * document.height * (1 + document.layers.length) };
}

/** Cheap metadata/preflight check, shared by immutable editing operations. Full cell
 * validation remains at import/serialization and rendering boundaries. */
function checkAnimation(animation: PixelArtAnimation2D): void {
  if (!object(animation) || animation.schema !== 'poku-pixel-art/v3' || !validName(animation.name)) throw new RangeError('Invalid pixel art animation identity');
  const limit = pixelArtAnimationFrameLimit2D(animation.width, animation.height), n = animation.width * animation.height;
  if (!Array.isArray(animation.frames) || animation.frames.length < 1 || animation.frames.length > limit) throw new RangeError(`Pixel art animation frame budget exceeded (maximum ${limit} at this size)`);
  if (typeof animation.loop !== 'boolean' || !directions.includes(animation.direction)) throw new RangeError('Animation needs a boolean loop flag and a supported direction');
  const ids = new Set<string>();
  let stored = 0, render = 0;
  for (const frame of animation.frames) {
    if (!object(frame) || !validName(frame.id) || !validName(frame.name) || ids.has(frame.id) || !validDuration(frame.durationMs)) throw new RangeError('Frames need unique IDs, valid names and positive finite durations');
    ids.add(frame.id);
    const doc = frame.document;
    if (!object(doc) || doc.width !== animation.width || doc.height !== animation.height || !Array.isArray(doc.pixels) || doc.pixels.length !== n) throw new RangeError('Every animation cel must have the same native dimensions');
    if (!Array.isArray(doc.layers) || doc.layers.length > pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError('Animation cel layer budget exceeded');
    const footprint = documentFootprint(doc);
    stored += footprint.stored; render += footprint.render;
    if (stored > PIXEL_ART_ANIMATION_LIMITS_2D.storedValues || render > PIXEL_ART_ANIMATION_LIMITS_2D.renderCells) throw new RangeError('Pixel art animation aggregate storage or render budget exceeded');
  }
  if (!ids.has(animation.activeFrameId)) throw new RangeError('Active animation frame must exist');
  // Check boundaries in the actual playback order, including the return leg. A tiny
  // duration after a very large one must not silently disappear in floating-point sums.
  let duration = 0;
  const addDuration = (index: number) => {
    const next = duration + animation.frames[index].durationMs;
    if (!Number.isFinite(next) || next <= duration || next / 1000 <= duration / 1000) throw new RangeError('Animation durations must have finite distinguishable boundaries');
    duration = next;
  };
  for (let i = 0; i < animation.frames.length; i++) addDuration(animation.direction === 'reverse' ? animation.frames.length - 1 - i : i);
  if (animation.direction === 'pingpong') for (let i = animation.frames.length - 2; i > 0; i--) addDuration(i);
}

/** Snapshot imported data. Earlier static formats become one frame with unchanged artwork. */
export function validatePixelArtAnimation2D(input: unknown): PixelArtAnimation2D {
  if (!object(input)) throw new TypeError('Expected a pixel art animation');
  const schema = (input as { schema?: string }).schema;
  if (schema === 'poku-pixel-art/v1' || schema === 'poku-pixel-art/v2') return createPixelArtAnimation2D(validatePixelArtDocument2D(input));
  const p = input as unknown as PixelArtAnimation2D;
  checkAnimation(p);
  return { schema: 'poku-pixel-art/v3', name: p.name, width: p.width, height: p.height, activeFrameId: p.activeFrameId, loop: p.loop, direction: p.direction,
    frames: p.frames.map(frame => ({ id: frame.id, name: frame.name, durationMs: frame.durationMs, document: validatePixelArtDocument2D(frame.document) })) };
}

export function createPixelArtAnimation2D(document: PixelArtDocument2D | PixelArtProject2D, options: PixelArtAnimationOptions2D = {}): PixelArtAnimation2D {
  const settings = checkedOptions(options), cel = validatePixelArtDocument2D(document);
  const animation: PixelArtAnimation2D = { schema: 'poku-pixel-art/v3', name: options.name ?? cel.name, width: cel.width, height: cel.height,
    frames: [{ id: 'frame-1', name: 'Frame 1', durationMs: settings.durationMs, document: cel }], activeFrameId: 'frame-1', loop: settings.loop, direction: settings.direction };
  checkAnimation(animation); return animation;
}

function frameIndex(animation: PixelArtAnimation2D, frameId: string): number {
  const index = animation.frames.findIndex(frame => frame.id === frameId);
  if (index < 0) throw new RangeError(`Unknown animation frame: ${frameId}`);
  return index;
}

/** Read access follows the immutable editing convention; callers must not mutate this cel. */
export function getPixelArtAnimationFrame2D(animation: PixelArtAnimation2D, frameId = animation.activeFrameId): PixelArtAnimationFrame2D {
  return animation.frames[frameIndex(animation, frameId)];
}

export function nextPixelArtAnimationFrameId2D(animation: PixelArtAnimation2D): string {
  const ids = new Set(animation.frames.map(frame => frame.id));
  let i = 1; while (ids.has(`frame-${i}`)) i++;
  return `frame-${i}`;
}

/** Replaces one independently edited cel; unchanged frame documents are shared, not cloned. */
export function replacePixelArtAnimationFrame2D(animation: PixelArtAnimation2D, document: PixelArtDocument2D, frameId = animation.activeFrameId): PixelArtAnimation2D {
  const index = frameIndex(animation, frameId);
  if (document === animation.frames[index].document) return animation;
  // Check the candidate's total capacity before making a second copy of its native arrays.
  const frames = animation.frames.slice(); frames[index] = { ...frames[index], document };
  const next = { ...animation, frames }; checkAnimation(next);
  frames[index] = { ...frames[index], document: validatePixelArtDocument2D(document) };
  return next;
}

export interface PixelArtAnimationInsertOptions2D {
  /** Insertion index, 0..frame count. Omitted inserts immediately after the active cel. */
  index?: number;
  name?: string;
  durationMs?: number;
}

/** Omit document for a transparent cel. Insertion selects the new cel. */
export function addPixelArtAnimationFrame2D(animation: PixelArtAnimation2D, document?: PixelArtDocument2D, options: PixelArtAnimationInsertOptions2D = {}): PixelArtAnimation2D {
  if (!object(options)) throw new RangeError('Animation insertion options must be an object');
  const active = getPixelArtAnimationFrame2D(animation), index = options.index ?? frameIndex(animation, animation.activeFrameId) + 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > animation.frames.length) throw new RangeError('Animation insertion index is outside the frame list');
  if (animation.frames.length >= pixelArtAnimationFrameLimit2D(animation.width, animation.height)) throw new RangeError('Pixel art animation frame budget exceeded');
  const name = options.name ?? `Frame ${animation.frames.length + 1}`, durationMs = options.durationMs ?? active.durationMs;
  if (!validName(name) || !validDuration(durationMs)) throw new RangeError('Frame needs a valid name and positive finite duration');
  const id = nextPixelArtAnimationFrameId2D(animation), cel = document ?? {
    ...createBlankPixelArtDocument2D(animation.width, animation.height, name),
    ...(active.document.workingPalette ? { workingPalette: active.document.workingPalette.slice() } : {}),
  };
  const frames = animation.frames.slice(); frames.splice(index, 0, { id, name, durationMs, document: cel });
  const next = { ...animation, frames, activeFrameId: id }; checkAnimation(next);
  frames[index] = { ...frames[index], document: validatePixelArtDocument2D(cel) };
  return next;
}

/** Truncates only at Unicode code-point boundaries while satisfying the document name limit. */
function copiedName(name: string): string {
  const suffix = ' copy'; let prefix = '';
  for (const codepoint of name) { if (prefix.length + codepoint.length + suffix.length > 160) break; prefix += codepoint; }
  return prefix + suffix;
}

export function duplicatePixelArtAnimationFrame2D(animation: PixelArtAnimation2D, frameId = animation.activeFrameId): PixelArtAnimation2D {
  const index = frameIndex(animation, frameId), frame = animation.frames[index];
  return addPixelArtAnimationFrame2D(animation, frame.document, { index: index + 1, name: copiedName(frame.name), durationMs: frame.durationMs });
}

export function removePixelArtAnimationFrame2D(animation: PixelArtAnimation2D, frameId = animation.activeFrameId): PixelArtAnimation2D {
  const index = frameIndex(animation, frameId);
  if (animation.frames.length === 1) throw new RangeError('Keep at least one animation frame');
  const frames = animation.frames.slice(); frames.splice(index, 1);
  const next = { ...animation, frames, activeFrameId: animation.activeFrameId === frameId ? frames[Math.min(index, frames.length - 1)].id : animation.activeFrameId };
  checkAnimation(next); return next;
}

/** index is the final zero-based position, independent of the move direction. */
export function movePixelArtAnimationFrame2D(animation: PixelArtAnimation2D, frameId: string, index: number): PixelArtAnimation2D {
  const from = frameIndex(animation, frameId);
  if (!Number.isSafeInteger(index) || index < 0 || index >= animation.frames.length) throw new RangeError('Animation destination index is outside the frame list');
  if (from === index) return animation;
  const frames = animation.frames.slice(), [frame] = frames.splice(from, 1); frames.splice(index, 0, frame);
  const next = { ...animation, frames }; checkAnimation(next); return next;
}

export function updatePixelArtAnimationFrame2D(animation: PixelArtAnimation2D, frameId: string, changes: { name?: string; durationMs?: number }): PixelArtAnimation2D {
  if (!object(changes)) throw new RangeError('Animation frame changes must be an object');
  const index = frameIndex(animation, frameId), frame = animation.frames[index];
  const name = changes.name ?? frame.name, durationMs = changes.durationMs ?? frame.durationMs;
  if (!validName(name) || !validDuration(durationMs)) throw new RangeError('Frame needs a valid name and positive finite duration');
  if (name === frame.name && durationMs === frame.durationMs) return animation;
  const frames = animation.frames.slice(); frames[index] = { ...frame, name, durationMs };
  const next = { ...animation, frames }; checkAnimation(next); return next;
}

export interface PixelArtAnimationTimeline2D {
  readonly durationMs: number;
  /** Original source frame indices; ping-pong does not repeat either turning endpoint. */
  readonly sequence: readonly number[];
  readonly startsMs: readonly number[];
  readonly endsMs: readonly number[];
  /** Original frame index, or -1 for negative/non-finite time and a finished non-looping pass. */
  frameAt(timeMs: number): number;
  /** 0..1, where exactly 1 holds the last cel of the selected playback sequence. */
  frameAtPhase(phase: number): number;
}

/** Compile metadata once after an edit. Sampling allocates nothing and never renders cels. */
export function createPixelArtAnimationTimeline2D(animation: PixelArtAnimation2D): PixelArtAnimationTimeline2D {
  checkAnimation(animation);
  const count = animation.frames.length, sequence = Array.from({ length: count }, (_, i) => animation.direction === 'reverse' ? count - 1 - i : i);
  if (animation.direction === 'pingpong') for (let i = count - 2; i > 0; i--) sequence.push(i);
  const starts: number[] = [], ends: number[] = []; let durationMs = 0;
  for (const index of sequence) {
    starts.push(durationMs); const next = durationMs + animation.frames[index].durationMs;
    if (!Number.isFinite(next) || next <= durationMs) throw new RangeError('Animation playback boundaries must be finite and distinguishable');
    ends.push(next); durationMs = next;
  }
  const loop = animation.loop;
  const at = (time: number): number => {
    let low = 0, high = ends.length - 1;
    while (low < high) { const middle = (low + high) >>> 1; if (time < ends[middle]) high = middle; else low = middle + 1; }
    return sequence[low];
  };
  return Object.freeze({ durationMs, sequence: Object.freeze(sequence), startsMs: Object.freeze(starts), endsMs: Object.freeze(ends),
    frameAt(timeMs: number): number {
      if (!Number.isFinite(timeMs) || timeMs < 0 || !loop && timeMs >= durationMs) return -1;
      return at(loop ? timeMs % durationMs : timeMs);
    },
    frameAtPhase(phase: number): number { return !Number.isFinite(phase) || phase < 0 || phase > 1 ? -1 : phase === 1 ? sequence[sequence.length - 1] : at(phase * durationMs); },
  });
}

export interface PixelArtOnionSkinOptions2D {
  previous?: number;
  next?: number;
  opacity?: number;
  loop?: boolean;
  /** Packed engine colors; the tint's alpha is ignored. Source alpha still gates the ghost. */
  previousColor?: number;
  nextColor?: number;
}

function checkRaster(sprite: EditableSprite2D, width: number, height: number): void {
  if (!sprite || sprite.w !== width || sprite.h !== height || !(sprite.pixels instanceof Uint32Array) || sprite.pixels.length !== width * height
    || !sprite.mask || sprite.mask.w !== width || sprite.mask.h !== height || !(sprite.mask.data instanceof Uint8Array) || sprite.mask.data.length !== width * height) throw new RangeError('Onion skin cels must share matching native buffers');
}

/** Preview-only tinted ghosts. Composite this on a separate canvas behind the active cel;
 * it contains neither the active artwork nor geometry and is never a save/export input. */
export function createPixelArtOnionSkin2D(frames: readonly EditableSprite2D[], activeIndex: number, options: PixelArtOnionSkinOptions2D = {}): EditableSprite2D {
  if (!Array.isArray(frames) || !frames.length || frames.length > PIXEL_ART_ANIMATION_LIMITS_2D.frames || !Number.isSafeInteger(activeIndex) || activeIndex < 0 || activeIndex >= frames.length || !object(options)) throw new RangeError('Onion skin needs an active cel and a valid frame list');
  const previous = options.previous ?? 1, next = options.next ?? 1, opacity = options.opacity ?? .28, loop = options.loop ?? false;
  const previousColor = options.previousColor ?? 0xff8d79ed, nextColor = options.nextColor ?? 0xfff3ba6c;
  if (![previous, next].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 8) || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || typeof loop !== 'boolean'
    || ![previousColor, nextColor].every(v => Number.isInteger(v) && v >= -0x80000000 && v <= 0xffffffff)) throw new RangeError('Onion skin needs 0..8 neighbours, opacity within 0..1 and valid tint colors');
  const active = frames[activeIndex]; pixelArtLayerLimit2D(active?.w, active?.h);
  const w = active.w, h = active.h, n = w * h; checkRaster(active, w, h);
  const pixels = new Uint32Array(n), data = new Uint8Array(n), seen = new Set([activeIndex]);
  const neighbours: { index: number; distance: number; tint: number }[] = [];
  for (let distance = 1; distance <= Math.max(previous, next); distance++) for (const side of [-1, 1]) {
    if (distance > (side < 0 ? previous : next)) continue;
    const raw = activeIndex + side * distance, index = loop ? (raw % frames.length + frames.length) % frames.length : raw;
    if (index < 0 || index >= frames.length || seen.has(index)) continue;
    seen.add(index); checkRaster(frames[index], w, h);
    neighbours.push({ index, distance, tint: side < 0 ? previousColor : nextColor });
  }
  // Draw distant cels first. A wrapped neighbour appears only once, at its nearest distance.
  for (const { index, distance, tint } of neighbours.reverse()) {
    const frame = frames[index];
    for (let i = 0; i < n; i++) {
      const c = frame.pixels[i]; if (!frame.mask.data[i] || !(c >>> 24)) continue;
      const alpha = (c >>> 24) / 255 * opacity / distance; if (!alpha) continue;
      const old = pixels[i], oldAlpha = (old >>> 24) / 255, outAlpha = alpha + oldAlpha * (1 - alpha), a = Math.round(outAlpha * 255);
      if (!a) continue;
      const brightness = .35 + .65 * ((c & 255) * .2126 + (c >>> 8 & 255) * .7152 + (c >>> 16 & 255) * .0722) / 255;
      const weight = brightness * alpha, retained = oldAlpha * (1 - alpha);
      const r = Math.round(((tint & 255) * weight + (old & 255) * retained) / outAlpha);
      const g = Math.round(((tint >>> 8 & 255) * weight + (old >>> 8 & 255) * retained) / outAlpha);
      const b = Math.round(((tint >>> 16 & 255) * weight + (old >>> 16 & 255) * retained) / outAlpha);
      pixels[i] = (a << 24 | b << 16 | g << 8 | r) >>> 0; data[i] = 1;
    }
  }
  return { w, h, pixels, mask: { w, h, data } };
}

export interface PixelArtAnimationSheetOptions2D { columns?: number; padding?: number }
export interface PixelArtAnimationSheetManifest2D {
  schema: 'poku-pixel-art-atlas/v1';
  name: string;
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  padding: number;
  loop: boolean;
  direction: PixelArtAnimationDirection2D;
  durationMs: number;
  /** The playback order references frames below, including a ping-pong return leg. */
  sequence: number[];
  startsMs: number[];
  frames: { id: string; name: string; x: number; y: number; width: number; height: number; durationMs: number }[];
}
export interface PixelArtAnimationSheet2D { sprite: EditableSprite2D; rgba: Uint8Array; manifest: PixelArtAnimationSheetManifest2D }

/** Visual exports bake the independent silhouette into alpha while retaining hidden RGB. */
function visualColor(sprite: EditableSprite2D, index: number): number {
  return sprite.mask.data[index] ? sprite.pixels[index] : sprite.pixels[index] & 0x00ffffff;
}

/** Renders one cel at a time. No canvas readback, resampling, onion skins or editor overlays. */
export function exportPixelArtAnimationSheet2D(animation: PixelArtAnimation2D, options: PixelArtAnimationSheetOptions2D = {}): PixelArtAnimationSheet2D {
  checkAnimation(animation);
  if (!object(options)) throw new RangeError('Animation sheet options must be an object');
  const count = animation.frames.length, columns = options.columns ?? Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * animation.height / animation.width)))), padding = options.padding ?? 1;
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > count || !Number.isSafeInteger(padding) || padding < 0 || padding > 32) throw new RangeError('Sheet needs 1..frame-count columns and 0..32 native pixels of padding');
  const cellW = animation.width + padding * 2, cellH = animation.height + padding * 2, w = cellW * columns, h = cellH * Math.ceil(count / columns);
  if (w > PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension || h > PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension || w * h > PIXEL_ART_ANIMATION_LIMITS_2D.sheetCells) throw new RangeError('Animation sheet exceeds its native image budget; reduce columns/padding or export fewer cels');
  const timeline = createPixelArtAnimationTimeline2D(animation), pixels = new Uint32Array(w * h), data = new Uint8Array(w * h), rgba = new Uint8Array(w * h * 4);
  const manifest: PixelArtAnimationSheetManifest2D = { schema: 'poku-pixel-art-atlas/v1', name: animation.name, width: w, height: h, frameWidth: animation.width, frameHeight: animation.height,
    columns, padding, loop: animation.loop, direction: animation.direction, durationMs: timeline.durationMs, sequence: [...timeline.sequence], startsMs: [...timeline.startsMs], frames: [] };
  for (let frame = 0; frame < count; frame++) {
    const cel = animation.frames[frame], raster = renderPixelArtDocument2D(cel.document), x = frame % columns * cellW + padding, y = Math.floor(frame / columns) * cellH + padding;
    manifest.frames.push({ id: cel.id, name: cel.name, x, y, width: animation.width, height: animation.height, durationMs: cel.durationMs });
    for (let py = 0; py < raster.h; py++) for (let px = 0; px < raster.w; px++) {
      const source = py * raster.w + px, target = (y + py) * w + x + px, c = visualColor(raster, source);
      pixels[target] = c; data[target] = c >>> 24 ? 1 : 0;
      rgba[target * 4] = c & 255; rgba[target * 4 + 1] = c >>> 8 & 255; rgba[target * 4 + 2] = c >>> 16 & 255; rgba[target * 4 + 3] = c >>> 24;
    }
  }
  return { sprite: { w, h, pixels, mask: { w, h, data } }, rgba, manifest };
}

export interface PixelArtAnimationClipOptions2D { pivot?: readonly [number, number] }

/** Produces the existing runtime SpriteClipData2D format. Reverse/ping-pong order is baked
 * into the frame list, so createSpriteClip2D(data, {loop: animation.loop}) plays it directly.
 * Editable layers and independent mask/height/normal data remain in the v3 project. */
export function exportPixelArtAnimationClip2D(animation: PixelArtAnimation2D, options: PixelArtAnimationClipOptions2D = {}): SpriteClipData2D {
  checkAnimation(animation);
  if (!object(options)) throw new RangeError('Animation clip options must be an object');
  const pivot = options.pivot ?? [animation.width / 2, animation.height / 2];
  if (!Array.isArray(pivot) || pivot.length !== 2 || !Array.from(pivot).every(Number.isFinite)) throw new RangeError('Sprite clip pivot needs two finite native coordinates');
  if (animation.width > 4096 || animation.height > 4096) throw new RangeError('Runtime sprite clips support dimensions up to 4096');
  const timeline = createPixelArtAnimationTimeline2D(animation), frames: SpriteClipFrame2D[] = []; let stored = 0;
  for (const frame of animation.frames) {
    const sprite = renderPixelArtDocument2D(frame.document), runs: number[] = [];
    let color = visualColor(sprite, 0), count = 0;
    for (let i = 0; i < sprite.pixels.length; i++) {
      const c = visualColor(sprite, i);
      if (c === color) count++;
      else { runs.push(count, color); count = 1; color = c; }
    }
    runs.push(count, color); stored += runs.length;
    if (stored > PIXEL_ART_ANIMATION_LIMITS_2D.storedValues) throw new RangeError('Runtime animation encoded cell budget exceeded');
    frames.push({ durationMs: frame.durationMs, runs });
  }
  return { version: 1, width: animation.width, height: animation.height, pivot: [pivot[0], pivot[1]], frames: timeline.sequence.map(index => frames[index]),
    source: { authoringSchema: animation.schema, name: animation.name, loop: animation.loop, direction: animation.direction, frameIds: timeline.sequence.map(index => animation.frames[index].id) } };
}

function checkBytes(json: string): void {
  if (json.length > PIXEL_ART_ANIMATION_LIMITS_2D.jsonBytes || new TextEncoder().encode(json).byteLength > PIXEL_ART_ANIMATION_LIMITS_2D.jsonBytes) throw new RangeError('Pixel art animation exceeds 64 MiB');
}

export function serializePixelArtAnimation2D(animation: PixelArtAnimation2D): string {
  const json = JSON.stringify(validatePixelArtAnimation2D(animation)); checkBytes(json); return json;
}

/** Static v1/v2 files are accepted by this entry point without changing the static parsers. */
export function parsePixelArtAnimation2D(json: string): PixelArtAnimation2D {
  if (typeof json !== 'string') throw new TypeError('Pixel art animation JSON must be a string');
  checkBytes(json); return validatePixelArtAnimation2D(JSON.parse(json));
}

interface HistorySnapshot { json: string; activeFrameId: string; ids: readonly string[] }
function snapshot(animation: PixelArtAnimation2D): HistorySnapshot {
  const p = validatePixelArtAnimation2D(animation), activeFrameId = p.activeFrameId, ids = p.frames.map(frame => frame.id);
  // Navigation is stored separately from content, so selecting a cel never consumes undo
  // capacity, invalidates redo or serializes a large project again.
  p.activeFrameId = ids[0]; const json = JSON.stringify(p); checkBytes(json);
  return { json, activeFrameId, ids };
}

/** Whole-animation editing history. Frame switching is navigation, not an editing step. */
export class PixelArtAnimationHistory2D {
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];
  private current: HistorySnapshot;
  private bytes = 0;
  constructor(animation: PixelArtAnimation2D, readonly limit = 64, readonly byteLimit = 32 * 1024 * 1024) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(byteLimit) || byteLimit < 1) throw new RangeError('History limits must be positive integers');
    this.current = snapshot(animation);
  }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get value(): PixelArtAnimation2D {
    const value = parsePixelArtAnimation2D(this.current.json); value.activeFrameId = this.current.activeFrameId; return value;
  }
  /** Updates navigation only; callers already holding the immutable animation can also
   * replace its activeFrameId locally instead of retrieving a cloned value here. */
  selectFrame(frameId: string): void {
    if (!this.current.ids.includes(frameId)) throw new RangeError('Selected animation frame must exist');
    this.current = { ...this.current, activeFrameId: frameId };
  }
  commit(animation: PixelArtAnimation2D): boolean {
    const next = snapshot(animation);
    if (next.json === this.current.json) { this.current = next; return false; }
    this.past.push(this.current); this.current = next; this.future = []; this.trim(); return true;
  }
  undo(): PixelArtAnimation2D {
    const previous = this.past.pop();
    if (previous) { this.future.push(this.current); this.current = previous; this.trim(); }
    return this.value;
  }
  redo(): PixelArtAnimation2D {
    const next = this.future.pop();
    if (next) { this.past.push(this.current); this.current = next; this.trim(); }
    return this.value;
  }
  reset(animation: PixelArtAnimation2D): void { this.current = snapshot(animation); this.past = []; this.future = []; this.bytes = 0; }
  private trim(): void {
    this.bytes = [...this.past, ...this.future].reduce((sum, entry) => sum + entry.json.length * 2, 0);
    while ((this.past.length || this.future.length) && (this.past.length + this.future.length > this.limit || this.bytes > this.byteLimit)) {
      const removed = this.past.length ? this.past.shift()! : this.future.shift()!; this.bytes -= removed.json.length * 2;
    }
  }
}

/** Optional convenience for baking a bounded frame cache once after an edit. The caller
 * owns the returned buffers; playback should keep these outside saved documents. */
export function renderPixelArtAnimation2D(animation: PixelArtAnimation2D): PixelArtDocumentRaster2D[] {
  checkAnimation(animation); return animation.frames.map(frame => renderPixelArtDocument2D(frame.document));
}
