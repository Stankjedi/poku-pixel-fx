import type { Painter } from "./painter.js";
import { addLinearLight2D } from "../render/surface2d.js";

export interface SpriteClipSocket2D {
  /** Original source canvas coordinates; socketAt subtracts the clip pivot. */
  x: number; y: number; angle?: number; visible?: boolean;
  basisX?: readonly [number, number]; basisY?: readonly [number, number];
  mirrorPolicy?: "reflect" | "swap-hand" | "authored";
}

export interface SpriteClipFrame2D {
  /** Positive, finite milliseconds. */
  durationMs: number;
  /** Row-major run-length pairs: count, unsigned packed RGBA (R in the low byte). */
  runs: readonly number[];
  sockets?: Readonly<Record<string, SpriteClipSocket2D>>;
  /** Coverage-weighted linear RGB radiance, row-major width * height * 3; independent of color alpha. */
  emission?: readonly number[];
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
  /** Optical glow by default; surface emission is occluded by later foreground color. */
  emissionKind?: "surface" | "optical";
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
  /** Global source-frame index at normalized sequence time 0..1; 1 holds the last cel. */
  frameAtPhase(phase: number): number;
  /** Select another tag/playback policy without decoding or duplicating the native frames. */
  withOptions(options: SpriteClipOptions2D): SpriteClip2D;
  /** Independent decoded copy, including hidden RGB in fully transparent pixels. */
  framePixels(index: number): Uint32Array;
  /** Copies preserve interchange coordinates; runtime sockets subtract the pivot. */
  frameSockets(index: number): Record<string, SpriteClipSocket2D>;
  socketAt(name: string, time: number): SpriteClipSocket2D | null;
  frameEmission(index: number): Float32Array | null;
  /** Inverse-cell draw on Painter; legacy rect-only mocks remain supported for color-only clips. */
  draw(painter: Pick<Painter, "rect"> & Partial<Pick<Painter, "mask" | "each" | "frame" | "fade" | "lightK">>, time: number): void;
}

const copySocket = (socket: SpriteClipSocket2D): SpriteClipSocket2D => ({ ...socket,
  ...(socket.basisX ? { basisX: [socket.basisX[0], socket.basisX[1]] as const } : {}),
  ...(socket.basisY ? { basisY: [socket.basisY[0], socket.basisY[1]] as const } : {}),
});
const MAX_DIMENSION = 4096;
const MAX_FRAMES = 4096;
const MAX_CELLS = 16_777_216;
const object = (value: unknown): boolean =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: number, min: number, max: number) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const validateOptions = (options: SpriteClipOptions2D) => {
  if (!object(options) || (options.tag !== undefined && (typeof options.tag !== "string" || !options.tag.length))
    || (options.loop !== undefined && typeof options.loop !== "boolean")
    || (options.emissionKind !== undefined && !["surface", "optical"].includes(options.emissionKind)))
    throw new RangeError("Sprite clip options need a tag name and/or a boolean loop flag");
};

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
  validateOptions(options);

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
      tags.set(tag.name, { ...tag });
    }
  }
  if (options.tag !== undefined && !tags.has(options.tag)) throw new RangeError(`Unknown sprite clip tag: ${options.tag}`);

  const pixels: Uint32Array[] = [], durations: number[] = [], masks: Uint8Array[] = [];
  const sockets: Record<string, SpriteClipSocket2D>[] = [], emissions: (Float32Array | null)[] = [];
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
    const socketMap: Record<string, SpriteClipSocket2D> = Object.create(null);
    if (frame.sockets !== undefined) {
      if (!object(frame.sockets) || Object.keys(frame.sockets).length > 128)
        throw new RangeError("Sprite clip sockets must be a map of at most 128 named sockets");
      for (const [name, rawSocket] of Object.entries(frame.sockets)) {
        const socket = rawSocket as SpriteClipSocket2D;
        if (!name || ["__proto__", "prototype", "constructor"].includes(name) || !object(socket) || !Number.isFinite(socket.x) || !Number.isFinite(socket.y)
          || (socket.angle !== undefined && !Number.isFinite(socket.angle))
          || (socket.visible !== undefined && typeof socket.visible !== "boolean"))
          throw new RangeError("Sprite clip sockets need names and finite coordinates/angles");
        if ((socket.basisX === undefined) !== (socket.basisY === undefined)
          || [socket.basisX, socket.basisY].some(v => v !== undefined && (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)))
          || socket.basisX && socket.basisY && (!Number.isFinite(socket.basisX[0] * socket.basisY[1] - socket.basisX[1] * socket.basisY[0]) || Math.abs(socket.basisX[0] * socket.basisY[1] - socket.basisX[1] * socket.basisY[0]) < 1e-12)
          || socket.mirrorPolicy !== undefined && !["reflect", "swap-hand", "authored"].includes(socket.mirrorPolicy))
          throw new RangeError("Sprite socket basis needs two finite invertible vectors and a valid mirror policy");
        socketMap[name] = copySocket({ x: socket.x, y: socket.y,
          ...(socket.angle === undefined ? {} : { angle: socket.angle }),
          ...(socket.visible === undefined ? {} : { visible: socket.visible }),
          ...(socket.basisX === undefined ? {} : { basisX: socket.basisX, basisY: socket.basisY }),
          ...(socket.mirrorPolicy === undefined ? {} : { mirrorPolicy: socket.mirrorPolicy }) });
      }
    }
    let emission: Float32Array | null = null;
    if (frame.emission !== undefined) {
      if (!Array.isArray(frame.emission) || frame.emission.length !== count * 3
        || !frame.emission.every((value: number) => Number.isFinite(value) && value >= 0 && value <= 3.4028234663852886e38))
        throw new RangeError("Sprite clip emission must contain width * height * 3 nonnegative finite float32 radiances");
      emission = Float32Array.from(frame.emission);
    }
    pixels.push(decoded); masks.push(Uint8Array.from(decoded, color => color >>> 24 ? 1 : 0));
    sockets.push(socketMap); emissions.push(emission); durations.push(frame.durationMs);
  }

  // Playback views own only a small sequence/timing table. Pixel, mask, emission and
  // socket snapshots stay private and are shared across equipment tag bindings.
  function playback(viewOptions: SpriteClipOptions2D): SpriteClip2D {
  validateOptions(viewOptions);
  const selected = { ...viewOptions };
  const tag = selected.tag === undefined ? undefined : tags.get(selected.tag);
  if (selected.tag !== undefined && !tag) throw new RangeError(`Unknown sprite clip tag: ${selected.tag}`);
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
  const duration = durationMs / 1000, loop = selected.loop ?? false, emissionKind = selected.emissionKind ?? "optical";
  const frameInSequence = (time: number): number => {
    let low = 0, high = ends.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (time < ends[middle]) high = middle;
      else low = middle + 1;
    }
    return sequence[low];
  };
  const frameAt = (time: number): number => {
    if (!Number.isFinite(time) || time < 0 || (!loop && time >= duration)) return -1;
    if (loop) {
      // Work in authored milliseconds where possible, avoiding e.g. 0.5 % 0.4 falling just below 0.1.
      const milliseconds = time * 1000;
      time = Number.isFinite(milliseconds) ? (milliseconds % durationMs) / 1000 : time % duration;
      if (time >= duration) time = 0; // Unit conversion can round an exact wrap back up to duration.
    }
    return frameInSequence(time);
  };

  return Object.freeze({
    width, height, pivot, duration, frameCount, frameAt,
    frameAtPhase(phase: number): number {
      if (!Number.isFinite(phase) || phase < 0 || phase > 1) return -1;
      return phase === 1 ? sequence[sequence.length - 1] : frameInSequence(phase * duration);
    },
    withOptions(overrides: SpriteClipOptions2D): SpriteClip2D {
      validateOptions(overrides);
      return playback({ ...selected, ...overrides });
    },
    framePixels(index: number): Uint32Array {
      if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
      return pixels[index].slice();
    },
    frameSockets(index: number): Record<string, SpriteClipSocket2D> {
      if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
      return Object.fromEntries(Object.entries(sockets[index]).map(([name, socket]) => [name, copySocket(socket)]));
    },
    socketAt(name: string, time: number): SpriteClipSocket2D | null {
      const index = frameAt(time), socket = index < 0 ? undefined : sockets[index][name];
      return socket ? { ...copySocket(socket), x: socket.x - pivot[0], y: socket.y - pivot[1] } : null;
    },
    frameEmission(index: number): Float32Array | null {
      if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
      return emissions[index]?.slice() ?? null;
    },
    draw(painter: Pick<Painter, "rect"> & Partial<Pick<Painter, "mask" | "each" | "frame" | "fade" | "lightK">>, time: number): void {
      const index = frameAt(time);
      if (index < 0) return;
      const frame = pixels[index], emission = emissions[index];
      if (emission && (!painter.frame || !painter.each))
        throw new TypeError("Drawing an emissive sprite clip requires a Painter with frame and inverse-cell each()");
      if (painter.mask) painter.mask({ w: width, h: height, data: masks[index] }, -pivot[0], -pivot[1],
        (x, y) => frame[y * width + x]);
      else for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const color = frame[y * width + x];
        if (color >>> 24) painter.rect(x - pivot[0], y - pivot[1], 1, 1, color);
      }
      if (emission) {
        const destination = painter.frame!, gain = Math.max(0, (painter.fade ?? 1) * (painter.lightK ?? 1));
        if (!(gain > 0)) return;
        painter.each!(-pivot[0], -pivot[1], width - pivot[0], height - pivot[1], (x, y, sx, sy) => {
          const ix = Math.floor(x + pivot[0]), iy = Math.floor(y + pivot[1]);
          if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
          const j = (iy * width + ix) * 3, cell = (sy - destination.oy) * destination.w + sx - destination.ox;
          addLinearLight2D(destination, cell, emission[j] * gain, emission[j + 1] * gain,
            emission[j + 2] * gain, emissionKind);
        });
      }
    },
  });
  }
  return playback(options);
}
