import { hex } from '../core/color.js';
import type { EditableSprite2D } from '../core/sprite-edit.js';
import { createOrganicSilhouette2D, rasterizePixelContour2D, type PixelContourCommand2D } from '../core/pixel-contour.js';

export type PixelArtStudyShape2D = 'stone-path' | 'boulder' | 'blade' | 'cloth' | 'crystal';
export interface PixelArtStudy2D { sprite: EditableSprite2D; height: Float32Array }

/** Authoring studies, deliberately separate from the existing effect catalog. */
export function createPixelArtStudy2D(shape: PixelArtStudyShape2D = 'stone-path', seed = 41, organic = true): PixelArtStudy2D {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Pixel art study seed must be uint32');
  if (typeof organic !== 'boolean') throw new TypeError('Pixel art study organic mode must be boolean');
  if (!['stone-path', 'boulder', 'blade', 'cloth', 'crystal'].includes(shape)) throw new RangeError('Unknown pixel art study shape');
  const w = 192, h = 112, pixels = new Uint32Array(w * h), data = new Uint8Array(w * h), height = new Float32Array(w * h);
  const add = (mask: {w: number; h: number; data: Uint8Array}, ox: number, oy: number, tint: string, elevation: (x: number, y: number) => number) => {
    const color = hex(tint);
    for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
      if (!mask.data[y * mask.w + x] || ox + x < 0 || ox + x >= w || oy + y < 0 || oy + y >= h) continue;
      const i = (oy + y) * w + ox + x;
      pixels[i] = color; data[i] = 1; height[i] = elevation(x, y);
    }
  };
  const rock = (x: number, y: number, rw: number, rh: number, id: number) => {
    const commands: PixelContourCommand2D[] = [];
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      commands.push({kind: i ? 'line' : 'move', to: [rw / 2 + (rw / 2 - 2) * Math.cos(a), rh / 2 + (rh / 2 - 2) * Math.sin(a)]});
    }
    commands.push({kind: 'close'});
    const mask = organic ? createOrganicSilhouette2D(rw, rh, {seed: (seed + id * 157) >>> 0, inset: 2, irregularity: .48, lobes: 5})
      : rasterizePixelContour2D(rw, rh, commands);
    add(mask, x, y, ['#435563', '#4a5b67', '#3e505e', '#4b5966'][id % 4], (px, py) => {
      const u = (px + .5 - rw / 2) / (rw / 2), v = (py + .5 - rh / 2) / (rh / 2);
      return Math.sqrt(Math.max(0, 1 - u * u * .85 - v * v * .92)) * Math.min(17, rh * .36);
    });
  };
  if (shape === 'stone-path') {
    rock(1, 16, 57, 39, 0); rock(54, 12, 67, 43, 1); rock(117, 17, 72, 39, 2);
    rock(-6, 51, 49, 41, 3); rock(39, 49, 73, 47, 4); rock(110, 52, 79, 46, 5);
  } else if (shape === 'boulder') rock(24, 13, 143, 86, 2);
  else {
    const paths: Record<'blade' | 'cloth' | 'crystal', PixelContourCommand2D[]> = {
      blade: [
        {kind:'move',to:[24,80]}, {kind:'line',to:[137,27]},
        {kind:'quadratic',control:[158,17],to:[177,15]},
        {kind:'quadratic',control:[164,35],to:[142,48]},
        {kind:'line',to:[40,94]}, {kind:'quadratic',control:[29,93],to:[24,80]}, {kind:'close'},
      ],
      cloth: [
        {kind:'move',to:[25,20]}, {kind:'cubic',control1:[77,6],control2:[112,33],to:[167,18]},
        {kind:'line',to:[161,87]}, {kind:'cubic',control1:[112,103],control2:[73,80],to:[30,96]},
        {kind:'quadratic',control:[35,56],to:[25,20]}, {kind:'close'},
      ],
      crystal: [
        {kind:'move',to:[96,8]}, {kind:'line',to:[145,41]}, {kind:'line',to:[137,82]},
        {kind:'line',to:[93,105]}, {kind:'line',to:[49,79]}, {kind:'line',to:[46,42]}, {kind:'close'},
      ],
    };
    const mask = rasterizePixelContour2D(w, h, paths[shape]);
    add(mask, 0, 0, '#4a5b67', (x, y) => shape === 'cloth'
      ? 4 + 6 * Math.sin(x / 23 + Math.sin(y / 29) * .7) + .02 * (h - y)
      : shape === 'blade' ? Math.max(0, 7 - Math.abs(y - (95 - x * .43)) * .7)
      : Math.max(0, 24 - Math.abs(x - 96) * .48 - Math.abs(y - 57) * .15));
  }
  return {sprite:{w,h,pixels,mask:{w,h,data}},height};
}
