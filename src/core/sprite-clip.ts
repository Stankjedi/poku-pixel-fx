import type { Painter } from "./painter.js";

export interface SpriteClipFrame2D {
  /** Positive, finite milliseconds. */
  durationMs: number;
  /** Row-major run-length pairs: count, unsigned packed RGBA (R in the low byte). */
  runs: readonly number[];
}

export interface SpriteClipTag2D {
  name: string;
  from: number;
  to: number;
  direction?: "forward" | "reverse" | "pingpong" | "pingpong_reverse";
  /** Source metadata only; playback repetition is controlled by the explicit loop option. */
  repeat?: number;
}

/** Portable, decoded-image-independent animation data. No file or PNG access is needed at runtime. */
export interface SpriteClipData2D {
  version: 1;
  width: number;
  height: number;
  pivot: readonly [number, number];
  frames: readonly SpriteClipFrame2D[];
  tags?: readonly SpriteClipTag2D[];
  source?: Record<string, unknown>;
}

export interface SpriteClipOptions2D {
  tag?: string;
  /** False by default. Negative and non-finite times are invisible even when looping. */
  loop?: boolean;
}

export interface SpriteClip2D {
  readonly width: number;
  readonly height: number;
  readonly pivot: readonly [number, number];
  /** Seconds in one pass through the selected sequence, including a tag's return leg. */
  readonly duration: number;
  /** Original frame count, independent of the selected tag. */
  readonly frameCount: number;
  /** Global source-frame index, or -1 outside the visible playback interval. */
  frameAt(time: number): number;
  /** Independent decoded copy, including hidden RGB in fully transparent pixels. */
  framePixels(index: number): Uint32Array;
  /** Draws into color only, using the painter's existing transform, fade and alpha mode. */
  draw(painter: Pick<Painter, "rect">, time: number): void;
}

const MAX_DIMENSION = 4096;
const MAX_FRAMES = 4096;
const MAX_CELLS = 16_777_216;
const object = (value: unknown): boolean =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: number, min: number, max: number) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

/** Validate, snapshot and decode once. Seeking and drawing never mutate the source or painter state.
 * Tag repeat counts are retained in SpriteClipData2D for interchange, not automatically played. */
export function createSpriteClip2D(data: SpriteClipData2D, options: SpriteClipOptions2D = {}): SpriteClip2D {
  if (!object(data) || data.version !== 1)
    throw new RangeError("Sprite clip version must be 1");
  const { width, height } = data;
  if (!integer(width, 1, MAX_DIMENSION) || !integer(height, 1, MAX_DIMENSION))
    throw new RangeError("Sprite clip dimensions must be integers from 1 to 4096");
  if (!Array.isArray(data.pivot) || data.pivot.length !== 2
    || !Number.isFinite(data.pivot[0]) || !Number.isFinite(data.pivot[1]))
    throw new RangeError("Sprite clip pivot must contain two finite coordinates");
  if (!Array.isArray(data.frames) || !integer(data.frames.length, 1, MAX_FRAMES)
    || width * height * data.frames.length > MAX_CELLS)
    throw new RangeError("Sprite clip needs 1 to 4096 frames and at most 16,777,216 decoded cells in total");
  if (data.source !== undefined && !object(data.source))
    throw new RangeError("Sprite clip source metadata must be an object");
  if (!object(options) || (options.tag !== undefined && (typeof options.tag !== "string" || !options.tag.length))
    || (options.loop !== undefined && typeof options.loop !== "boolean"))
    throw new RangeError("Sprite clip options need a tag name and/or a boolean loop flag");

  const count = width * height, frameCount = data.frames.length;
  const pivot = Object.freeze([data.pivot[0], data.pivot[1]] as [number, number]);
  const tags = new Map<string, SpriteClipTag2D>();
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) throw new RangeError("Sprite clip tags must be an array");
    for (const tag of data.tags) {
      if (!object(tag) || typeof tag.name !== "string" || !tag.name.length || tags.has(tag.name)
        || !integer(tag.from, 0, frameCount - 1) || !integer(tag.to, tag.from, frameCount - 1)
        || (tag.direction !== undefined && !["forward", "reverse", "pingpong", "pingpong_reverse"].includes(tag.direction))
        || (tag.repeat !== undefined && !integer(tag.repeat, 0, Number.MAX_SAFE_INTEGER)))
        throw new RangeError("Sprite clip tags need unique names, valid frame ranges, directions and nonnegative integer repeats");
      tags.set(tag.name, tag);
    }
  }
  const tag = options.tag === undefined ? undefined : tags.get(options.tag);
  if (options.tag !== undefined && !tag) throw new RangeError(`Unknown sprite clip tag: ${options.tag}`);

  const pixels: Uint32Array[] = [], durations: number[] = [];
  for (const frame of data.frames) {
    if (!object(frame) || !Number.isFinite(frame.durationMs) || !(frame.durationMs / 1000 > 0)
      || !Array.isArray(frame.runs) || !frame.runs.length || frame.runs.length % 2 || frame.runs.length > count * 2)
      throw new RangeError("Sprite clip frames need a positive finite duration and count/color run pairs");
    const decoded = new Uint32Array(count);
    let offset = 0;
    for (let i = 0; i < frame.runs.length; i += 2) {
      const length = frame.runs[i], color = frame.runs[i + 1];
      if (!integer(length, 1, count - offset) || !integer(color, 0, 0xffffffff))
        throw new RangeError("Sprite clip runs need positive counts and unsigned packed 32-bit colors within the frame bounds");
      decoded.fill(color, offset, offset + length);
      offset += length;
    }
    if (offset !== count) throw new RangeError("Sprite clip runs must fill exactly width * height pixels");
    pixels.push(decoded);
    durations.push(frame.durationMs);
  }

  const from = tag?.from ?? 0, to = tag?.to ?? frameCount - 1, direction = tag?.direction ?? "forward";
  const reverse = direction === "reverse" || direction === "pingpong_reverse";
  const sequence: number[] = [];
  for (let i = from; i <= to; i++) sequence.push(reverse ? to - (i - from) : i);
  // Neither turning endpoint is repeated, including for one- and two-frame tags.
  if (direction === "pingpong" || direction === "pingpong_reverse")
    for (let i = sequence.length - 2; i > 0; i--) sequence.push(sequence[i]);

  let durationMs = 0;
  const ends = sequence.map(index => {
    const previous = durationMs / 1000;
    durationMs += durations[index];
    const end = durationMs / 1000;
    if (!Number.isFinite(durationMs) || !(end > previous))
      throw new RangeError("Sprite clip sequence duration must be finite with distinguishable frame boundaries");
    return end;
  });
  const duration = durationMs / 1000, loop = options.loop ?? false;
  const frameAt = (time: number): number => {
    if (!Number.isFinite(time) || time < 0 || (!loop && time >= duration)) return -1;
    if (loop) {
      // Work in authored milliseconds where possible, avoiding e.g. 0.5 % 0.4 falling just below 0.1.
      const milliseconds = time * 1000;
      time = Number.isFinite(milliseconds) ? (milliseconds % durationMs) / 1000 : time % duration;
      if (time >= duration) time = 0; // Unit conversion can round an exact wrap back up to duration.
    }
    let low = 0, high = ends.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (time < ends[middle]) high = middle;
      else low = middle + 1;
    }
    return sequence[low];
  };

  return Object.freeze({
    width, height, pivot, duration, frameCount, frameAt,
    framePixels(index: number): Uint32Array {
      if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
      return pixels[index].slice();
    },
    draw(painter: Pick<Painter, "rect">, time: number): void {
      const index = frameAt(time);
      if (index < 0) return;
      const frame = pixels[index];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const color = frame[y * width + x];
        if (color >>> 24) painter.rect(x - pivot[0], y - pivot[1], 1, 1, color);
      }
    },
  });
}
