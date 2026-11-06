import {
  compilePixelStyle2D,
  createPixelStyleProfile2D
} from "./chunk-MIW2CWC4.js";
import {
  channelToLinear
} from "./chunk-JQMAFXP4.js";
import {
  composePixelTransform2D,
  ditherSprite2DInto,
  invertPixelTransform2D,
  pixelTransform2D
} from "./chunk-G6VBW32E.js";

// src/authoring/edits.ts
var maskName = (name) => /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(name) && !["constructor", "prototype", "__proto__"].includes(name);
var defaultEmptyMasks = /* @__PURE__ */ new Set(["negativeSpace"]);
function eraseCell(frame, i, emptyMasks, physicalMasks) {
  if (physicalMasks) {
    for (const mask of physicalMasks) mask[i] = 0;
  } else for (const [name, mask] of Object.entries(frame.semanticMasks ?? {})) if (!emptyMasks.has(name)) mask[i] = 0;
}
function applyProjectEdits(frame, edits, time, fps, frameIndex = Math.max(0, Math.floor(time * fps + 1e-6)), emptyMasks = defaultEmptyMasks) {
  for (const raw of edits) {
    const e = raw;
    if (!e || e.frame !== "all" && e.frame !== frameIndex) continue;
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.y < 0 || e.x >= frame.w || e.y >= frame.h) continue;
    const i = e.y * frame.w + e.x;
    if (e.mask) {
      if (!maskName(e.mask) || e.allowEmpty !== void 0 && typeof e.allowEmpty !== "boolean") throw new RangeError("Invalid semantic mask edit");
      frame.semanticMasks ??= /* @__PURE__ */ Object.create(null);
      const mask = frame.semanticMasks[e.mask] ??= new Uint8Array(frame.w * frame.h);
      mask[i] = e.color === null ? 0 : 1;
    } else if (e.channel === "emission") {
      if (!frame.hdrLight) {
        frame.hdrLight = new Float32Array(frame.w * frame.h * 3);
        if (frame.light) for (let p = 0; p < frame.light.length; p++) for (let ch = 0; ch < 3; ch++) frame.hdrLight[p * 3 + ch] = channelToLinear(frame.light[p], ch * 8);
      }
      const rgb = e.emission ?? [0, 0, 0];
      if (rgb.length !== 3 || !rgb.every((n) => Number.isFinite(n) && n >= 0 && n <= 65504)) throw new RangeError("Invalid emission edit");
      frame.hdrLight.set(rgb, i * 3);
      if (frame.light) frame.light[i] = 0;
    } else {
      if (e.color !== null && (!Number.isInteger(e.color) || e.color < 0 || e.color > 4294967295)) throw new RangeError("Invalid pixel color");
      frame.color[i] = e.color === null ? 0 : e.color >>> 0;
      if (!(frame.color[i] >>> 24)) eraseCell(frame, i, emptyMasks);
    }
  }
}
var styles = /* @__PURE__ */ new WeakMap();
function prepareProjectStyle(project) {
  if (!project.pixelStyle) return;
  let style = styles.get(project.pixelStyle);
  if (!style) {
    style = compilePixelStyle2D(createPixelStyleProfile2D(project.pixelStyle));
    styles.set(project.pixelStyle, style);
  }
  return style;
}
var scratches = /* @__PURE__ */ new WeakMap();
function frameScratch(frame) {
  let scratch = scratches.get(frame);
  if (!scratch || scratch.mask.length !== frame.color.length) {
    scratch = { before: new Uint8Array(frame.color.length), mask: new Uint8Array(frame.color.length), empty: /* @__PURE__ */ new Set(), physicalMasks: [] };
    scratches.set(frame, scratch);
  }
  return scratch;
}
function patternContext(frame, context) {
  const ox = frame.ox ?? 0, oy = frame.oy ?? 0, camera = context.cameraOffset ?? [0, 0];
  if (![ox, oy, ...camera].every(Number.isFinite) || camera.length !== 2) throw new RangeError("Frame origin and camera offset must be finite native coordinates");
  const objectToWorld = context.objectToWorld ?? pixelTransform2D();
  const worldToFrame = pixelTransform2D(-ox, -oy);
  return {
    rasterToObject: invertPixelTransform2D(composePixelTransform2D(worldToFrame, objectToWorld)),
    rasterToWorld: pixelTransform2D(ox, oy),
    rasterToScreen: pixelTransform2D(camera[0], camera[1]),
    objectToWorld,
    worldToScreen: pixelTransform2D(camera[0] - ox, camera[1] - oy)
  };
}
function postprocessProjectFrame(frame, project, time, frameIndex, context = {}) {
  if (!project.pixelStyle && !project.edits.length) return;
  const scratch = frameScratch(frame), emptyMasks = scratch.empty;
  emptyMasks.clear();
  emptyMasks.add("negativeSpace");
  for (const name of context.allowEmptyMasks ?? []) {
    if (!maskName(name)) throw new RangeError("Invalid empty semantic mask name");
    emptyMasks.add(name);
  }
  for (const raw of project.edits) {
    const e = raw;
    if (e?.mask && e.allowEmpty) emptyMasks.add(e.mask);
  }
  applyProjectEdits(frame, project.edits, time, project.fps, frameIndex, emptyMasks);
  if (!project.pixelStyle) return;
  const style = prepareProjectStyle(project);
  const profile = style.profile;
  const patterned = profile.alpha === "authored-dither" || profile.quantization === "ordered" && (profile.surfaceColors === "indexed" || profile.finalColorPolicy === "palette-locked");
  if (context.space === "screen-only" && patterned && profile.dither.anchor !== "screen") throw new RangeError("Projected 3D frames support screen-space alpha dithering and color dithering; object/world patterns need per-surface coordinates");
  if (context.space !== void 0 && context.space !== "world-2d" && context.space !== "screen-only") throw new RangeError("Invalid project pixel coordinate space");
  const simple = profile.surfaceColors === "authored-rgba" && profile.finalColorPolicy !== "palette-locked" && profile.outline === "none" && !profile.pixelTracks?.length;
  if (!simple || profile.alpha !== "coverage") {
    for (let i = 0; i < scratch.mask.length; i++) scratch.before[i] = scratch.mask[i] = frame.color[i] >>> 24 ? 1 : 0;
    const raster = { w: frame.w, h: frame.h, x: 0, y: 0, pixels: frame.color, mask: { w: frame.w, h: frame.h, data: scratch.mask } };
    if (simple && profile.alpha === "authored-dither") ditherSprite2DInto(raster, raster, profile.dither, patternContext(frame, context));
    else if (simple && profile.alpha === "solid") for (let i = 0; i < frame.color.length; i++) frame.color[i] = frame.color[i] >>> 24 ? (frame.color[i] | 4278190080) >>> 0 : 0;
    else frame.color.set(style.apply(raster, time, patternContext(frame, context)).pixels);
    scratch.physicalMasks.length = 0;
    for (const [name, mask] of Object.entries(frame.semanticMasks ?? {})) if (!emptyMasks.has(name)) scratch.physicalMasks.push(mask);
    for (let i = 0; i < scratch.before.length; i++) if (scratch.before[i] && !(frame.color[i] >>> 24)) eraseCell(frame, i, emptyMasks, scratch.physicalMasks);
  }
  if (profile.emission === "none") {
    frame.light?.fill(0);
    frame.hdrLight?.fill(0);
  }
  if (profile.emission === "palette-stepped" && frame.hdrLight)
    for (let i = 0; i < frame.hdrLight.length; i++) frame.hdrLight[i] = Math.round(Math.min(1, frame.hdrLight[i]) * 5) / 5;
}
function finishProjectRGBA(rgba, project) {
  const style = project.pixelStyle;
  if (style?.finalColorPolicy !== "palette-locked") return;
  const colors = style.palette;
  if (!Array.isArray(colors) || !colors.length) throw new RangeError("Final palette is missing");
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    let best = colors[0], distance = Infinity;
    for (const c of colors) {
      const d = (rgba[i] - (c & 255)) ** 2 + (rgba[i + 1] - (c >>> 8 & 255)) ** 2 + (rgba[i + 2] - (c >>> 16 & 255)) ** 2;
      if (d < distance) {
        distance = d;
        best = c;
      }
    }
    rgba[i] = best & 255;
    rgba[i + 1] = best >>> 8 & 255;
    rgba[i + 2] = best >>> 16 & 255;
  }
}

export {
  prepareProjectStyle,
  postprocessProjectFrame,
  finishProjectRGBA
};
