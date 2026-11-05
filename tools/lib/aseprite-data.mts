import type { SpriteClipData2D } from "../../src/core/sprite-clip.js";
import { decodePNG } from "./png-read.mjs";

const MAX_DIMENSION = 4096, MAX_FRAMES = 4096, MAX_CELLS = 16_777_216;
type RecordValue = Record<string, unknown>;
function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as RecordValue;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer in ${min}..${max}.`);
  return value;
}
function pivotPair(value: unknown, label: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== "number" || !Number.isFinite(v))) throw new Error(`${label} must contain two finite pixel coordinates.`);
  return [value[0], value[1]];
}
function rect(value: unknown, label: string) {
  const obj = record(value, label);
  return {
    x: integer(obj.x, `${label}.x`, 0, 65_535), y: integer(obj.y, `${label}.y`, 0, 65_535),
    w: integer(obj.w, `${label}.w`, 1, MAX_DIMENSION), h: integer(obj.h, `${label}.h`, 1, MAX_DIMENSION),
  };
}

/** Row-major count/color pairs. Colors use unsigned R | G<<8 | B<<16 | A<<24. */
export function encodeSpriteRuns2D(rgba: Uint8Array | Uint8ClampedArray): number[] {
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length % 4 || rgba.length / 4 > MAX_CELLS) {
    throw new Error("Sprite RGBA data must contain complete pixels within the 16,777,216 cell limit.");
  }
  const runs: number[] = [];
  let last = -1, count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const color = (rgba[i] | rgba[i + 1] << 8 | rgba[i + 2] << 16 | rgba[i + 3] << 24) >>> 0;
    if (color === last) count++;
    else { if (count) runs.push(count, last); last = color; count = 1; }
  }
  if (count) runs.push(count, last);
  return runs;
}

/** Import Aseprite --data JSON plus the corresponding rendered PNG sprite sheet.
 * Layers are metadata, never composited again; frame order is array/Object.entries order.
 */
export function importAsepriteSheet(png: Uint8Array, json: unknown, options: { pivot?: readonly [number, number] } = {}): { data: SpriteClipData2D; warnings: string[] } {
  const root = record(json, "Aseprite JSON"), meta = root.meta === undefined ? {} : record(root.meta, "meta");
  const isArray = Array.isArray(root.frames);
  if (isArray && (!(root.frames as unknown[]).length || (root.frames as unknown[]).length > MAX_FRAMES)) throw new Error("Aseprite frames must contain 1..4096 frames.");
  const entries: [string, unknown][] = isArray ? Array.from(root.frames as unknown[], (value, i) => [String(i), value]) : Object.entries(record(root.frames, "frames"));
  if (!entries.length || entries.length > MAX_FRAMES) throw new Error("Aseprite frames must contain 1..4096 frames.");
  const sheet = decodePNG(png), warnings = [...(sheet.warnings ?? [])];
  if (meta.size !== undefined) {
    const size = record(meta.size, "meta.size");
    if (size.w !== sheet.width || size.h !== sheet.height) throw new Error("Aseprite meta.size does not match the PNG dimensions; check the PNG/JSON pair.");
  }
  let pivot: [number, number];
  if (options.pivot !== undefined) pivot = pivotPair(options.pivot, "pivot option");
  else {
    const pokuFx = meta.pokuFx === undefined ? undefined : record(meta.pokuFx, "meta.pokuFx");
    if (pokuFx?.pivot !== undefined) pivot = pivotPair(pokuFx.pivot, "meta.pokuFx.pivot");
    else {
      pivot = [0, 0];
      warnings.push("No pivot was supplied; using [0, 0] (top-left). Supply an explicit pixel pivot for actor/effect alignment.");
    }
  }
  if (meta.layers !== undefined) {
    if (!Array.isArray(meta.layers)) throw new Error("meta.layers must be an array.");
    if (meta.layers.length) warnings.push("Layer metadata was preserved only. The PNG is already rendered/flattened; layer opacity and blend modes were not applied again.");
  }
  let width = 0, height = 0, durationTotal = 0;
  // Validate every rectangle and the total allocation budget before creating frame canvases.
  const frames = entries.map(([key, value], index) => {
    const label = `frames[${index}]`, frame = record(value, label), area = rect(frame.frame, `${label}.frame`);
    if (frame.rotated === true) throw new Error(`${label} is rotated; rotated atlas frames are not supported. Export with rotation disabled.`);
    if (frame.rotated !== undefined && typeof frame.rotated !== "boolean") throw new Error(`${label}.rotated must be a boolean.`);
    if (frame.trimmed !== undefined && typeof frame.trimmed !== "boolean") throw new Error(`${label}.trimmed must be a boolean.`);
    if (area.x + area.w > sheet.width || area.y + area.h > sheet.height) throw new Error(`${label}.frame exceeds PNG bounds.`);
    if (frame.trimmed === true && (frame.sourceSize === undefined || frame.spriteSourceSize === undefined)) throw new Error(`${label} is trimmed but sourceSize or spriteSourceSize is missing.`);
    const sourceSize = frame.sourceSize === undefined ? { w: area.w, h: area.h } : record(frame.sourceSize, `${label}.sourceSize`);
    const w = integer(sourceSize.w, `${label}.sourceSize.w`, 1, MAX_DIMENSION), h = integer(sourceSize.h, `${label}.sourceSize.h`, 1, MAX_DIMENSION);
    const target = frame.spriteSourceSize === undefined ? { x: 0, y: 0, w: area.w, h: area.h } : rect(frame.spriteSourceSize, `${label}.spriteSourceSize`);
    if (target.w !== area.w || target.h !== area.h) throw new Error(`${label}.spriteSourceSize dimensions must match the nonrotated atlas frame.`);
    if (target.x + target.w > w || target.y + target.h > h) throw new Error(`${label}.spriteSourceSize exceeds sourceSize bounds.`);
    if (index && (w !== width || h !== height)) throw new Error("All Aseprite frames must have the same sourceSize canvas dimensions.");
    width = w; height = h;
    if (width * height * entries.length > MAX_CELLS) throw new Error("Aseprite decoded frame canvases exceed the 16,777,216 cell limit.");
    if (typeof frame.duration !== "number" || !Number.isFinite(frame.duration) || !(frame.duration / 1000 > 0)) throw new Error(`${label}.duration must be a positive finite number of milliseconds.`);
    const nextDuration = durationTotal + frame.duration;
    if (!Number.isFinite(nextDuration) || nextDuration / 1000 <= durationTotal / 1000) throw new Error(`${label}.duration cannot be represented safely in the clip timeline.`);
    durationTotal = nextDuration;
    return { area, target, durationMs: frame.duration, name: typeof frame.filename === "string" ? frame.filename : key };
  });
  let tags: SpriteClipData2D["tags"];
  if (meta.frameTags !== undefined) {
    if (!Array.isArray(meta.frameTags)) throw new Error("meta.frameTags must be an array.");
    const names = new Set<string>();
    tags = meta.frameTags.map((value, index) => {
      const label = `meta.frameTags[${index}]`, tag = record(value, label);
      if (typeof tag.name !== "string" || !tag.name.length || names.has(tag.name)) throw new Error(`${label}.name must be a unique nonempty string.`);
      names.add(tag.name);
      const from = integer(tag.from, `${label}.from`, 0, entries.length - 1), to = integer(tag.to, `${label}.to`, from, entries.length - 1);
      const direction = tag.direction;
      if (direction !== undefined && !["forward", "reverse", "pingpong", "pingpong_reverse"].includes(direction as string)) throw new Error(`${label}.direction is unsupported.`);
      // Aseprite writes repeat as a decimal string in some exporter versions.
      const rawRepeat = typeof tag.repeat === "string" && /^\d+$/.test(tag.repeat) ? Number(tag.repeat) : tag.repeat;
      const repeat = rawRepeat === undefined ? undefined : integer(rawRepeat, `${label}.repeat`, 0, Number.MAX_SAFE_INTEGER);
      return { name: tag.name, from, to, ...(direction !== undefined ? { direction: direction as "forward" | "reverse" | "pingpong" | "pingpong_reverse" } : {}), ...(repeat !== undefined ? { repeat } : {}) };
    });
  }
  const data: SpriteClipData2D = {
    version: 1, width, height, pivot,
    frames: frames.map(({ area, target, durationMs }) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < area.h; y++) {
        const start = ((area.y + y) * sheet.width + area.x) * 4;
        rgba.set(sheet.rgba.subarray(start, start + area.w * 4), ((target.y + y) * width + target.x) * 4);
      }
      return { durationMs, runs: encodeSpriteRuns2D(rgba) };
    }),
    ...(tags !== undefined ? { tags } : {}),
    source: { format: "aseprite-sheet", frameFormat: isArray ? "array" : "hash", frameNames: frames.map(f => f.name), meta },
  };
  return { data, warnings };
}
