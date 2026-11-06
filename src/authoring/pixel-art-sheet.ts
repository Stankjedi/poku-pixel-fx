import type { PixelArtDocument2D, PixelArtDocumentRaster2D } from './pixel-art-document.js';
import { PIXEL_ART_ANIMATION_LIMITS_2D, pixelArtAnimationFrameLimit2D,
  type PixelArtAnimation2D, type PixelArtAnimationDirection2D } from './pixel-art-animation.js';

export interface PixelArtSheetSliceOptions2D {
  frameWidth: number;
  frameHeight: number;
  /** Symmetric outer padding: one value for both axes, or [horizontal, vertical]. */
  margin?: number | readonly [number, number];
  /** Empty space between adjacent cells: one value, or [horizontal, vertical]. */
  gap?: number | readonly [number, number];
  order?: 'row-major' | 'column-major';
  /** Zero-based source slot in the selected traversal order. */
  start?: number;
  /** Number of source slots to inspect, before optional empty-cell removal. */
  count?: number;
  /** Explicitly omit visually empty cells. False preserves transparent hold frames,
   * hidden RGB and any geometry they carry. */
  skipEmpty?: boolean;
  name?: string;
  durationMs?: number;
  loop?: boolean;
  direction?: PixelArtAnimationDirection2D;
}

interface FrameRectangle {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
}
interface ImportPlan {
  name: string;
  width: number;
  height: number;
  loop: boolean;
  direction: PixelArtAnimationDirection2D;
  frames: FrameRectangle[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const integer = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const validDuration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value / 1000 > 0;
const direction = (value: unknown): value is PixelArtAnimationDirection2D => value === 'forward' || value === 'reverse' || value === 'pingpong';

/** Only shape checks run before plan preflight. Per-channel scans follow the aggregate
 * capacity check, and no native output arrays exist until every check has passed. */
function checkSource(source: PixelArtDocumentRaster2D): void {
  if (!source || !integer(source.w, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension)
    || !integer(source.h, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension)
    || source.w * source.h > PIXEL_ART_ANIMATION_LIMITS_2D.sheetCells
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== source.w * source.h
    || !source.mask || source.mask.w !== source.w || source.mask.h !== source.h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== source.w * source.h)
    throw new RangeError('Sprite sheet needs matching native color and silhouette buffers within its image budget');
  const channels = source.channels, n = source.w * source.h;
  if (channels && (channels.w !== source.w || channels.h !== source.h
    || !(channels.material instanceof Uint16Array) || channels.material.length !== n
    || !(channels.height instanceof Float32Array) || channels.height.length !== n
    || !(channels.normal instanceof Float32Array) || channels.normal.length !== n * 3))
    throw new RangeError('Sprite sheet geometry must match its full native dimensions');
}

function checkCapacity(source: PixelArtDocumentRaster2D, width: number, height: number, count: number): void {
  const limit = pixelArtAnimationFrameLimit2D(width, height);
  if (!integer(count, 1, limit)) throw new RangeError(`Imported animation frame budget exceeded (maximum ${limit} at this size)`);
  // Every cel stores exact pixels and an independent binary silhouette. Optional
  // geometry adds material, height and three normal components per native cell.
  const cells = width * height * count, stored = cells * (source.channels ? 7 : 2);
  if (stored > PIXEL_ART_ANIMATION_LIMITS_2D.storedValues || cells > PIXEL_ART_ANIMATION_LIMITS_2D.renderCells)
    throw new RangeError('Imported animation aggregate storage or render budget exceeded');
}

function checkGeometry(source: PixelArtDocumentRaster2D): void {
  if (source.channels && (!source.channels.height.every(Number.isFinite) || !source.channels.normal.every(Number.isFinite)))
    throw new RangeError('Sprite sheet height and normals must contain finite native values');
}

/** Timing is checked before copying cels, including the ping-pong return leg and
 * distinguishability in the runtime's seconds as well as authoring milliseconds. */
function timelineFor(frames: readonly FrameRectangle[], playback: PixelArtAnimationDirection2D) {
  const sequence = Array.from({ length: frames.length }, (_, i) => playback === 'reverse' ? frames.length - 1 - i : i);
  if (playback === 'pingpong') for (let i = frames.length - 2; i > 0; i--) sequence.push(i);
  const startsMs: number[] = [];
  let durationMs = 0;
  for (const index of sequence) {
    const next = durationMs + frames[index].durationMs;
    if (!Number.isFinite(next) || next <= durationMs || next / 1000 <= durationMs / 1000)
      throw new RangeError('Imported animation durations must have finite distinguishable boundaries');
    startsMs.push(durationMs); durationMs = next;
  }
  return { sequence, startsMs, durationMs };
}

/** Native cell limits alone cannot guarantee a saveable project: packed RGBA can
 * consume ten JSON characters per value and authored floats can need more. Count
 * the exact serialized representation from the source without building cel arrays
 * or a large temporary JSON string. Names are counted as escaped UTF-8 JSON. */
function checkSerializedSize(source: PixelArtDocumentRaster2D, plan: ImportPlan): void {
  const encoder = new TextEncoder(), cells = plan.width * plan.height;
  const encoded = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength;
  let bytes = encoded({ schema: 'poku-pixel-art/v3', name: plan.name, width: plan.width, height: plan.height,
    frames: [], activeFrameId: plan.frames[0].id, loop: plan.loop, direction: plan.direction }) + plan.frames.length - 1;
  // A bounded cache covers ordinary palettes and repeated surface values without
  // retaining an entry for every distinct color/float in a large imported image.
  const lengths = new Map<number, number>();
  const numericLength = (value: number) => {
    const old = lengths.get(value); if (old !== undefined) return old;
    const length = String(value).length; if (lengths.size < 4096) lengths.set(value, length); return length;
  };
  const check = () => { if (bytes > PIXEL_ART_ANIMATION_LIMITS_2D.jsonBytes) throw new RangeError('Imported animation exceeds the 64 MiB saved project budget'); };
  for (const frame of plan.frames) {
    bytes += encoded({ id: frame.id, name: frame.name, durationMs: frame.durationMs,
      document: { schema: 'poku-pixel-art/v2', name: frame.name, width: plan.width, height: plan.height, pixels: [], mask: [], layers: [],
        ...(source.channels ? { channels: { material: [], height: [], normal: [] } } : {}) } });
    // Array brackets are already in the metadata skeleton. Count commas and the
    // one-character binary mask before scanning numeric samples.
    bytes += 2 * (cells - 1) + cells;
    if (source.channels) bytes += 2 * (cells - 1) + (cells * 3 - 1);
    check();
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        const i = (frame.y + y) * source.w + frame.x + x;
        bytes += numericLength(source.pixels[i]);
        if (source.channels) {
          const c = source.channels;
          bytes += numericLength(c.material[i]) + numericLength(c.height[i]);
          bytes += numericLength(c.normal[i * 3]) + numericLength(c.normal[i * 3 + 1]) + numericLength(c.normal[i * 3 + 2]);
        }
      }
      check();
    }
  }
}

function materialize(source: PixelArtDocumentRaster2D, plan: ImportPlan): PixelArtAnimation2D {
  const cells = plan.width * plan.height;
  const frames = plan.frames.map(frame => {
    const pixels = new Array<number>(cells), mask = new Array<number>(cells);
    const channels = source.channels ? { material: new Array<number>(cells), height: new Array<number>(cells), normal: new Array<number>(cells * 3) } : undefined;
    for (let y = 0; y < plan.height; y++) for (let x = 0; x < plan.width; x++) {
      const from = (frame.y + y) * source.w + frame.x + x, to = y * plan.width + x;
      pixels[to] = source.pixels[from]; mask[to] = source.mask.data[from] ? 1 : 0;
      if (channels) {
        const original = source.channels!;
        channels.material[to] = original.material[from]; channels.height[to] = original.height[from];
        channels.normal[to * 3] = original.normal[from * 3];
        channels.normal[to * 3 + 1] = original.normal[from * 3 + 1];
        channels.normal[to * 3 + 2] = original.normal[from * 3 + 2];
      }
    }
    const document: PixelArtDocument2D = { schema: 'poku-pixel-art/v2', name: frame.name, width: plan.width, height: plan.height, pixels, mask, layers: [],
      ...(channels ? { channels } : {}) };
    return { id: frame.id, name: frame.name, durationMs: frame.durationMs, document };
  });
  return { schema: 'poku-pixel-art/v3', name: plan.name, width: plan.width, height: plan.height,
    frames, activeFrameId: frames[0].id, loop: plan.loop, direction: plan.direction };
}

/** Reopen a native POKU sheet with the atlas manifest emitted by
 * exportPixelArtAnimationSheet2D. Rectangles are authoritative; overlapping entries
 * produce independent editable cels. Redundant timing must agree with the declared
 * direction and frame durations, rather than silently changing the animation.
 *
 * Pixels are copied directly, including hidden RGB and partial alpha. An independent
 * silhouette and optional material/height/normal maps use the same source coordinates.
 * PNG-only sheets do not recover original edit layers or unexported surface maps.
 * `image` or other extra metadata is never fetched or executed.
 */
export function importPixelArtAnimationSheet2D(source: PixelArtDocumentRaster2D, manifest: unknown): PixelArtAnimation2D {
  checkSource(source);
  if (!object(manifest) || manifest.schema !== 'poku-pixel-art-atlas/v1' || !validName(manifest.name)
    || manifest.width !== source.w || manifest.height !== source.h || typeof manifest.loop !== 'boolean' || !direction(manifest.direction))
    throw new RangeError('Sprite sheet manifest needs its supported identity, matching image dimensions and playback settings');
  const width = manifest.frameWidth, height = manifest.frameHeight;
  if (!integer(width, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension) || !integer(height, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension)
    || !Array.isArray(manifest.frames)) throw new RangeError('Sprite sheet manifest needs native frame dimensions and a frame list');
  checkCapacity(source, width, height, manifest.frames.length);
  if (!integer(manifest.columns, 1, manifest.frames.length) || !integer(manifest.padding, 0, 32))
    throw new RangeError('Sprite sheet manifest needs valid column and padding metadata');
  const ids = new Set<string>();
  const frames: FrameRectangle[] = Array.from(manifest.frames, raw => {
    if (!object(raw) || !validName(raw.id) || ids.has(raw.id) || !validName(raw.name) || !validDuration(raw.durationMs)
      || raw.width !== width || raw.height !== height || !integer(raw.x, 0, source.w - width) || !integer(raw.y, 0, source.h - height))
      throw new RangeError('Sprite sheet frames need unique IDs, valid names/timing and equal-size rectangles inside the image');
    ids.add(raw.id);
    return { id: raw.id, name: raw.name, durationMs: raw.durationMs, x: raw.x, y: raw.y, width, height };
  });
  const timing = timelineFor(frames, manifest.direction);
  const matches = (value: unknown, expected: number[]) => Array.isArray(value) && value.length === expected.length
    && Array.from(value).every((item, i) => item === expected[i]);
  if (!matches(manifest.sequence, timing.sequence) || !matches(manifest.startsMs, timing.startsMs) || manifest.durationMs !== timing.durationMs)
    throw new RangeError('Sprite sheet manifest timing must match its frame durations and playback direction');
  checkGeometry(source);
  const plan = { name: manifest.name, width, height, frames, loop: manifest.loop, direction: manifest.direction };
  checkSerializedSize(source, plan);
  return materialize(source, plan);
}

function pair(value: number | readonly [number, number] | undefined, label: string): readonly [number, number] {
  const resolved = value === undefined ? [0, 0] : typeof value === 'number' ? [value, value] : value;
  if (!Array.isArray(resolved) || resolved.length !== 2 || !Array.from(resolved).every(v => integer(v, 0, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension)))
    throw new RangeError(`Sprite sheet ${label} needs nonnegative native integers on both axes`);
  return [resolved[0], resolved[1]];
}

function occupied(source: PixelArtDocumentRaster2D, frame: FrameRectangle): boolean {
  for (let y = frame.y; y < frame.y + frame.height; y++) for (let x = frame.x; x < frame.x + frame.width; x++) {
    const index = y * source.w + x;
    if (source.mask.data[index] && source.pixels[index] >>> 24) return true;
  }
  return false;
}

/** Slice complete grid cells without resampling. Trailing incomplete strips are not
 * frames. `start`/`count` select source slots before `skipEmpty`; IDs and names retain
 * those original slot numbers, so skipping a gap cannot renumber subsequent cels.
 *
 * Empty cells are kept by default because they can encode an intentional hold, hidden
 * RGB, or geometry. `skipEmpty:true` deliberately discards cells with no visible alpha.
 * Every retained cel owns independent arrays; input artwork is never changed.
 */
export function slicePixelArtAnimationSheet2D(source: PixelArtDocumentRaster2D, options: PixelArtSheetSliceOptions2D): PixelArtAnimation2D {
  checkSource(source);
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Sprite sheet slicing needs explicit grid options');
  const width = options.frameWidth, height = options.frameHeight;
  const limit = pixelArtAnimationFrameLimit2D(width, height);
  const [mx, my] = pair(options.margin, 'margin'), [gx, gy] = pair(options.gap, 'gap');
  const order = options.order ?? 'row-major', start = options.start ?? 0, skipEmpty = options.skipEmpty ?? false;
  const name = options.name ?? 'Imported sprite sheet', durationMs = options.durationMs ?? 100, loop = options.loop ?? true, playback = options.direction ?? 'forward';
  if ((order !== 'row-major' && order !== 'column-major') || typeof skipEmpty !== 'boolean' || !validName(name)
    || !validDuration(durationMs) || typeof loop !== 'boolean' || !direction(playback))
    throw new RangeError('Sprite sheet slicing needs valid order, name, duration and playback options');
  const columns = Math.max(0, Math.floor((source.w - mx * 2 + gx) / (width + gx)));
  const rows = Math.max(0, Math.floor((source.h - my * 2 + gy) / (height + gy))), available = columns * rows;
  const count = options.count ?? available - start;
  if (!integer(start, 0, available - 1) || !integer(count, 1, available - start))
    throw new RangeError('Sprite sheet start/count must select complete cells inside the grid');
  if (!skipEmpty) checkCapacity(source, width, height, count);
  const frames: FrameRectangle[] = [];
  for (let slot = start; slot < start + count; slot++) {
    const column = order === 'row-major' ? slot % columns : Math.floor(slot / rows);
    const row = order === 'row-major' ? Math.floor(slot / columns) : slot % rows;
    const frame: FrameRectangle = { id: `frame-${slot + 1}`, name: `Frame ${slot + 1}`, x: mx + column * (width + gx), y: my + row * (height + gy), width, height, durationMs };
    if (skipEmpty && !occupied(source, frame)) continue;
    frames.push(frame);
    if (frames.length > limit) throw new RangeError(`Imported animation frame budget exceeded (maximum ${limit} at this size)`);
  }
  if (!frames.length) throw new RangeError('Sprite sheet slicing found no visible frames; keep empty cells to import transparent holds');
  checkCapacity(source, width, height, frames.length);
  timelineFor(frames, playback); checkGeometry(source);
  const plan = { name, width, height, loop, direction: playback, frames };
  checkSerializedSize(source, plan);
  return materialize(source, plan);
}
