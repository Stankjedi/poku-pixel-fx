import { compilePixelStyle2D, createPixelStyleProfile2D } from '../core/pixel-style.js';
import { ditherSprite2DInto, type PixelPatternContext2D } from '../core/pixel-tools.js';
import { composePixelTransform2D, invertPixelTransform2D, pixelTransform2D, type PixelTransform2D } from '../core/sprite-raster.js';
import { channelToLinear } from '../render/linear.js';
import { type ResolvedProject } from './project.js';
export interface ProjectPixelEdit {
  frame: number | 'all'; x: number; y: number; color: number | null;
  channel?: 'color' | 'emission'; emission?: [number, number, number]; mask?: string;
  /** Preserve a semantic region on transparent cells, e.g. an intentional hole. */
  allowEmpty?: boolean;
}
export interface EditableProjectFrame {
  w: number; h: number; ox?: number; oy?: number; color: Uint32Array; light?: Uint32Array; hdrLight?: Float32Array;
  semanticMasks?: Record<string, Uint8Array>;
}
export interface ProjectPixelContext2D {
  /** The actual instance's native object-to-world transform, including its flip/rotation. */
  objectToWorld?: PixelTransform2D;
  /** Final native presentation translation, after reduced-motion/transparent-output policy. */
  cameraOffset?: readonly [number, number];
  allowEmptyMasks?: readonly string[];
  /** A projected 3D composite cannot recover intrinsic object/world surface coordinates. */
  space?: 'world-2d' | 'screen-only';
}
const maskName = (name: string) => /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(name) && !['constructor', 'prototype', '__proto__'].includes(name);
const defaultEmptyMasks = new Set(['negativeSpace']);
function eraseCell(frame: EditableProjectFrame, i: number, emptyMasks: ReadonlySet<string>, physicalMasks?: readonly Uint8Array[]): void {
  if (physicalMasks) { for (const mask of physicalMasks) mask[i] = 0; }
  else for (const [name, mask] of Object.entries(frame.semanticMasks ?? {})) if (!emptyMasks.has(name)) mask[i] = 0;
}
export function applyProjectEdits(frame: EditableProjectFrame, edits: readonly unknown[], time: number, fps: number, frameIndex = Math.max(0, Math.floor(time * fps + 1e-6)), emptyMasks: ReadonlySet<string> = defaultEmptyMasks): void {
  for (const raw of edits) {
    const e = raw as ProjectPixelEdit;
    if (!e || (e.frame !== 'all' && e.frame !== frameIndex)) continue;
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.y < 0 || e.x >= frame.w || e.y >= frame.h) continue;
    const i = e.y * frame.w + e.x;
    if (e.mask) {
      if (!maskName(e.mask) || e.allowEmpty !== undefined && typeof e.allowEmpty !== 'boolean') throw new RangeError('Invalid semantic mask edit');
      frame.semanticMasks ??= Object.create(null) as Record<string, Uint8Array>;
      const mask = frame.semanticMasks[e.mask] ??= new Uint8Array(frame.w * frame.h);
      // An explicit region brush may mark an expected solid cell or intentional hole before paint exists.
      mask[i] = e.color === null ? 0 : 1;
    } else if (e.channel === 'emission') {
      if (!frame.hdrLight) {
        frame.hdrLight = new Float32Array(frame.w * frame.h * 3);
        if (frame.light) for (let p = 0; p < frame.light.length; p++) for (let ch = 0; ch < 3; ch++) frame.hdrLight[p * 3 + ch] = channelToLinear(frame.light[p], ch * 8);
      }
      const rgb = e.emission ?? [0, 0, 0];
      if (rgb.length !== 3 || !rgb.every(n => Number.isFinite(n) && n >= 0 && n <= 65504)) throw new RangeError('Invalid emission edit');
      frame.hdrLight.set(rgb, i * 3); if (frame.light) frame.light[i] = 0;
    } else {
      if (e.color !== null && (!Number.isInteger(e.color) || e.color < 0 || e.color > 0xffffffff)) throw new RangeError('Invalid pixel color');
      frame.color[i] = e.color === null ? 0 : e.color >>> 0;
      if (!(frame.color[i] >>> 24)) eraseCell(frame, i, emptyMasks);
    }
  }
}
const styles = new WeakMap<object, ReturnType<typeof compilePixelStyle2D>>();
/** Compile and validate once before an editor commits new finishing settings. */
export function prepareProjectStyle(project: ResolvedProject): ReturnType<typeof compilePixelStyle2D> | undefined {
  if (!project.pixelStyle) return;
  let style = styles.get(project.pixelStyle);
  if (!style) { style = compilePixelStyle2D(createPixelStyleProfile2D(project.pixelStyle)); styles.set(project.pixelStyle, style); }
  return style;
}
interface FrameScratch { before: Uint8Array; mask: Uint8Array; empty: Set<string>; physicalMasks: Uint8Array[] }
const scratches = new WeakMap<object, FrameScratch>();
function frameScratch(frame: EditableProjectFrame): FrameScratch {
  let scratch = scratches.get(frame);
  if (!scratch || scratch.mask.length !== frame.color.length) {
    scratch = { before: new Uint8Array(frame.color.length), mask: new Uint8Array(frame.color.length), empty: new Set(), physicalMasks: [] };
    scratches.set(frame, scratch);
  }
  return scratch;
}
/** Map native frame cells back through the actual instance before choosing the dither space. */
function patternContext(frame: EditableProjectFrame, context: ProjectPixelContext2D): PixelPatternContext2D {
  const ox = frame.ox ?? 0, oy = frame.oy ?? 0, camera = context.cameraOffset ?? [0, 0];
  if (![ox, oy, ...camera].every(Number.isFinite) || camera.length !== 2) throw new RangeError('Frame origin and camera offset must be finite native coordinates');
  const objectToWorld = context.objectToWorld ?? pixelTransform2D();
  const worldToFrame = pixelTransform2D(-ox, -oy);
  return {
    rasterToObject: invertPixelTransform2D(composePixelTransform2D(worldToFrame, objectToWorld)),
    rasterToWorld: pixelTransform2D(ox, oy),
    rasterToScreen: pixelTransform2D(camera[0], camera[1]),
    objectToWorld,
    worldToScreen: pixelTransform2D(camera[0] - ox, camera[1] - oy),
  };
}
/** Mutates only the supplied render frame. Public pixel-style.apply/source APIs remain immutable. */
export function postprocessProjectFrame(frame: EditableProjectFrame, project: ResolvedProject, time: number, frameIndex?: number, context: ProjectPixelContext2D = {}): void {
  if (!project.pixelStyle && !project.edits.length) return;
  const scratch = frameScratch(frame), emptyMasks = scratch.empty;
  emptyMasks.clear(); emptyMasks.add('negativeSpace');
  for (const name of context.allowEmptyMasks ?? []) { if (!maskName(name)) throw new RangeError('Invalid empty semantic mask name'); emptyMasks.add(name); }
  for (const raw of project.edits) { const e = raw as unknown as ProjectPixelEdit; if (e?.mask && e.allowEmpty) emptyMasks.add(e.mask); }
  applyProjectEdits(frame, project.edits, time, project.fps, frameIndex, emptyMasks);
  if (!project.pixelStyle) return;
  const style = prepareProjectStyle(project)!;
  const profile = style.profile;
  const patterned=profile.alpha==='authored-dither'||profile.quantization==='ordered'&&(profile.surfaceColors==='indexed'||profile.finalColorPolicy==='palette-locked');
  if (context.space === 'screen-only' && patterned && profile.dither.anchor !== 'screen') throw new RangeError('Projected 3D frames support screen-space alpha dithering and color dithering; object/world patterns need per-surface coordinates');
  if (context.space !== undefined && context.space !== 'world-2d' && context.space !== 'screen-only') throw new RangeError('Invalid project pixel coordinate space');
  const simple = profile.surfaceColors === 'authored-rgba' && profile.finalColorPolicy !== 'palette-locked' && profile.outline === 'none' && !profile.pixelTracks?.length;
  // Common native coverage path has no full-frame color/mask copies. The scratch arrays are reused per render frame.
  if (!simple || profile.alpha !== 'coverage') {
    for (let i = 0; i < scratch.mask.length; i++) scratch.before[i] = scratch.mask[i] = frame.color[i] >>> 24 ? 1 : 0;
    const raster = { w: frame.w, h: frame.h, x: 0, y: 0, pixels: frame.color, mask: { w: frame.w, h: frame.h, data: scratch.mask } };
    if (simple && profile.alpha === 'authored-dither') ditherSprite2DInto(raster, raster, profile.dither, patternContext(frame, context));
    else if (simple && profile.alpha === 'solid') for (let i = 0; i < frame.color.length; i++) frame.color[i] = frame.color[i] >>> 24 ? (frame.color[i] | 0xff000000) >>> 0 : 0;
    else frame.color.set(style.apply(raster, time, patternContext(frame, context)).pixels);
    // Drop stale physical selections on cells removed by styling. Resolved optical radiance is
    // independent: only an explicit emission edit/policy may change it after layer provenance is lost.
    scratch.physicalMasks.length = 0;
    for (const [name, mask] of Object.entries(frame.semanticMasks ?? {})) if (!emptyMasks.has(name)) scratch.physicalMasks.push(mask);
    for (let i = 0; i < scratch.before.length; i++) if (scratch.before[i] && !(frame.color[i] >>> 24)) eraseCell(frame, i, emptyMasks, scratch.physicalMasks);
  }
  if (profile.emission === 'none') { frame.light?.fill(0); frame.hdrLight?.fill(0); }
  if (profile.emission === 'palette-stepped' && frame.hdrLight)
    for (let i = 0; i < frame.hdrLight.length; i++) frame.hdrLight[i] = Math.round(Math.min(1, frame.hdrLight[i]) * 5) / 5;
}
/** Final quantization is explicit, after compositing. Surface palette locking alone is insufficient. */
export function finishProjectRGBA(rgba: Uint8Array | Uint8ClampedArray, project: ResolvedProject): void {
  const style = project.pixelStyle;
  if (style?.finalColorPolicy !== 'palette-locked') return;
  const colors = style.palette as number[];
  if (!Array.isArray(colors) || !colors.length) throw new RangeError('Final palette is missing');
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    let best = colors[0], distance = Infinity;
    for (const c of colors) {
      const d = (rgba[i] - (c & 255)) ** 2 + (rgba[i + 1] - (c >>> 8 & 255)) ** 2 + (rgba[i + 2] - (c >>> 16 & 255)) ** 2;
      if (d < distance) { distance = d; best = c; }
    }
    rgba[i] = best & 255; rgba[i + 1] = best >>> 8 & 255; rgba[i + 2] = best >>> 16 & 255;
  }
}
