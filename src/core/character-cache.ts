import { Painter, type PaintFrame } from './painter.js';
import { hex } from './color.js';

// Synchronous construction scratch only. Returned sprites always own their result arrays.
// Bounded by both entry count and pixel count; time is never a cache key.
const scratch = new Map<string, { frame: PaintFrame; painter: Painter }>();
const palettes = new Map<string, number[]>();
export function characterScratch(w: number, h: number, ox: number, oy: number) {
  const key = `${w}:${h}`;
  let entry = scratch.get(key);
  if (!entry) {
    const frame: PaintFrame = { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
    entry = { frame, painter: new Painter(frame) };
    if (w * h <= 131072) {
      if (scratch.size >= 4) scratch.delete(scratch.keys().next().value!);
      scratch.set(key, entry);
    }
  } else {
    scratch.delete(key); scratch.set(key, entry);
    entry.frame.ox = ox; entry.frame.oy = oy;
    entry.frame.color.fill(0); entry.frame.light.fill(0);
    entry.painter.reset();
  }
  return entry;
}
export function characterPalette(colors: readonly string[]): number[] {
  const key = colors.join(',');
  let parsed = palettes.get(key);
  if (!parsed) {
    parsed = colors.map(hex);
    if (palettes.size >= 32) palettes.delete(palettes.keys().next().value!);
    palettes.set(key, parsed);
  }
  return parsed;
}
