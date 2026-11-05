import {
  Rng,
  catmullRom,
  clamp,
  cubicBezier,
  defineImpactContact2D,
  fit,
  hex,
  impactContactAge2D,
  loopTime,
  mix,
  pathLengths,
  quadraticBezier,
  rand,
  toHex,
  transformImpactContact2D
} from "./chunk-FEXYTCCO.js";
import {
  blendOver,
  blitSprite2D,
  compilePixelStyle2D,
  composePixelTransform2D,
  createPixelStyleProfile2D,
  encodeSpritePixels2D,
  invertPixelTransform2D,
  pixelTransform2D,
  transformPixelPoint2D,
  transformSprite2D
} from "./chunk-3L2ANF6Q.js";
import {
  channelToLinear
} from "./chunk-JQMAFXP4.js";

// src/core/actor.ts
var HERO = [
  "....kkkkk...",
  "..kkhhhhhk..",
  ".khhhhhhhhk.",
  ".khhhhhhhhhk",
  ".khhssssshhk",
  ".khsessesshk",
  ".khsessesshk",
  "..ksssssssk.",
  "...kkSSSkk..",
  "..kttttttk..",
  ".kttTttTttk.",
  ".ksttTTttsk.",
  ".kstttttttk.",
  "..kbbbbbbk..",
  "..kppkkppk..",
  "..kppk.kppk.",
  "..kppk.kppk.",
  "..koook.kook",
  "..kkkkk.kkkk"
];
var HERO_PAL = {
  k: "#17121f",
  h: "#7a4128",
  s: "#f3c49d",
  S: "#c98b6c",
  e: "#17121f",
  t: "#5f6f94",
  T: "#46536f",
  b: "#8a5a32",
  p: "#38334a",
  o: "#6a4030",
  // the 2x character's extra detail
  H: "#a35d34",
  w: "#ffffff",
  m: "#a3564a",
  g: "#e8c060",
  L: "#7f90b6",
  O: "#8f5a3f",
  P: "#4b4560",
  // the scarf
  c: "#f53cd1",
  C: "#ff8fe6",
  D: "#a31f8a"
};
var DUMMY_PAL = {
  k: "#0e0c14",
  A: "#e4e6ec",
  B: "#b6b9c3",
  C: "#868995",
  D: "#5c5e6a",
  E: "#6e707c",
  F: "#4b4d58",
  G: "#34353f",
  J: "#2a2b33",
  m: "#f53cd1"
};
var HERO2 = [
  "...........kkk..........",
  "..........kAABk.........",
  ".........kAAABJk........",
  ".........kABBJJk........",
  ".........kBBBJCDk.......",
  ".........kBCJDDDk.......",
  ".........kkJJJDk........",
  ".......kkkkABBJCkk......",
  "......kAABCJBCCCkDk.....",
  "......kABBCJCCCmDkDk....",
  "......kBBCDDJCDDDkDk....",
  "......kABCDJDDDDDkk.....",
  ".....kAABDkDDDDJkk......",
  ".....kABCDkDDJJGkk......",
  ".....kABCkJJJGGGkk......",
  "....kJJCDkFFFGGGk.......",
  "....kAJJDkJJJGGGk.......",
  "....kJCJJkABBJGGk.......",
  ".....kJCCkBBCDJJJk......",
  ".....kCCCJBBCDJJDk......",
  ".....kCCCDJCCDkJDDk.....",
  "......kCDDJBCDkDDDk.....",
  ".......kDJJJCDkDDDkk....",
  ".......kJBCJCDkDDDkk....",
  ".......kBDJBCDkCDDkk....",
  "........kJJBCDkCDDk.....",
  "........kBBBCDkCCDDk....",
  "........kBBBCDkCCDDk....",
  ".........kBBCDkJDDDk....",
  "........kBJJJJkCJJJk....",
  "........kBBCCDkCCDDk....",
  "........kBBCDDkCDDk.....",
  "........kBBCDkCCDDk.....",
  "........kBCCDkCCDDk.....",
  "........kBCDDkCDDDk.....",
  ".......kJBCJkkkDJkkkk...",
  ".......kAJJAAAAkCCCCCk..",
  "........kkkkkkkkkkkkk..."
];
function maskOf(rows, k = 1) {
  const h = rows.length * k, w = rows[0].length * k, data = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === ".") return;
    for (let j = 0; j < k * k; j++) data[(y * k + (j / k | 0)) * w + x * k + j % k] = 1;
  }));
  return { w, h, data };
}
var MASKS = { 1: maskOf(HERO, 1), 2: maskOf(HERO2, 1) };
var SPRITES = { 1: HERO, 2: HERO2 };
function pixelsOf(rows, pal) {
  const w = rows[0].length, data = new Uint32Array(w * rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => data[y * w + x] = ch === "." ? 0 : hex(pal[ch])));
  return data;
}
var PIXELS = { 1: pixelsOf(HERO, HERO_PAL), 2: pixelsOf(HERO2, DUMMY_PAL) };
function stockActor(k = 1) {
  k = k === 2 ? 2 : 1;
  const m = MASKS[k], x = -Math.floor(m.w / 2), y = -m.h;
  return { mask: m, pixels: PIXELS[k], x, y, w: m.w, h: m.h, k, head: [0, y], chest: [0, k === 2 ? -26 : y + 11], ...k === 2 ? { eyes: [[13, 3], [15, 3]] } : {} };
}
function validateActorPixels(actor) {
  const count = actor.w * actor.h;
  if (![actor.w, actor.h, count].every(Number.isSafeInteger) || actor.w < 1 || actor.h < 1 || count > 16777216 || !Number.isFinite(actor.x) || !Number.isFinite(actor.y) || !(actor.pixels instanceof Uint32Array) || actor.pixels.length !== count || !actor.mask || actor.mask.w !== actor.w || actor.mask.h !== actor.h || !(actor.mask.data instanceof Uint8Array) || actor.mask.data.length !== count)
    throw new RangeError("Pixel actor needs finite x/y and matching native pixel/mask buffers");
}
function drawActor(p, actor = stockActor(), a = 1) {
  if ("renderSource" in actor && actor.renderSource === "pixels") {
    validateActorPixels(actor);
    if (!Number.isFinite(a)) throw new RangeError("Pixel actor alpha must be finite");
    if (a <= 0) return;
    if (typeof p.mask !== "function") throw new TypeError("Drawing pixel actors requires a painter with mask()");
    p.mask(actor.mask, actor.x, actor.y, (x, y) => actor.pixels[y * actor.w + x], a);
    return;
  }
  const k = "k" in actor && actor.k === 2 ? 2 : 1;
  if (a > 0) p.sprite(SPRITES[k], k === 2 ? DUMMY_PAL : HERO_PAL, actor.x, actor.y, { a });
}
var actorAlphaOf = (mod, t, o) => typeof mod.actorAlpha === "function" ? mod.actorAlpha(t, o) : 1;

// src/core/font.ts
var MINI = {
  A: ".#.|#.#|###|#.#|#.#",
  B: "##.|#.#|##.|#.#|##.",
  C: ".##|#..|#..|#..|.##",
  D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###",
  F: "###|#..|##.|#..|#..",
  G: ".##|#..|#.#|#.#|.##",
  H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###",
  J: "..#|..#|..#|#.#|.#.",
  K: "#.#|#.#|##.|#.#|#.#",
  L: "#..|#..|#..|#..|###",
  M: "#.#|###|###|#.#|#.#",
  N: "##.|#.#|#.#|#.#|#.#",
  O: ".#.|#.#|#.#|#.#|.#.",
  P: "##.|#.#|##.|#..|#..",
  Q: ".#.|#.#|#.#|##.|.##",
  R: "##.|#.#|##.|#.#|#.#",
  S: ".##|#..|.#.|..#|##.",
  T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###",
  V: "#.#|#.#|#.#|#.#|.#.",
  W: "#.#|#.#|###|###|#.#",
  X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.",
  Z: "###|..#|.#.|#..|###",
  0: "###|#.#|#.#|#.#|###",
  1: ".#.|##.|.#.|.#.|###",
  2: "##.|..#|.#.|#..|###",
  3: "##.|..#|.#.|..#|##.",
  4: "#.#|#.#|###|..#|..#",
  5: "###|#..|##.|..#|##.",
  6: ".##|#..|###|#.#|###",
  7: "###|..#|.#.|.#.|.#.",
  8: "###|#.#|###|#.#|###",
  9: "###|#.#|###|..#|##.",
  "+": "...|.#.|###|.#.|...",
  "-": "...|...|###|...|...",
  "!": "#|#|#|.|#",
  "?": "##.|..#|.#.|...|.#.",
  ".": ".|.|.|.|#",
  ",": "..|..|..|.#|#.",
  ":": ".|#|.|#|.",
  "/": "..#|..#|.#.|#..|#..",
  "%": "#.#|..#|.#.|#..|#.#",
  x: "...|#.#|.#.|#.#|...",
  "*": "#.#|.#.|#.#|...|...",
  "'": "#|#|.|.|.",
  "(": ".#|#.|#.|#.|.#",
  ")": "#.|.#|.#|.#|#.",
  "<": "..#|.#.|#..|.#.|..#",
  ">": "#..|.#.|..#|.#.|#..",
  "=": "...|###|...|###|...",
  _: "...|...|...|...|###",
  "#": "#.#|###|#.#|###|#.#"
};
var BIG = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#...#|.###.",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
  E: "#####|#....|#....|####.|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: "###|.#.|.#.|.#.|.#.|.#.|###",
  J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
  N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
  X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
  1: ".#.|##.|.#.|.#.|.#.|.#.|###",
  2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
  3: "#####|...#.|..#..|...#.|....#|#...#|.###.",
  4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
  5: "#####|#....|####.|....#|....#|#...#|.###.",
  6: "..##.|.#...|#....|####.|#...#|#...#|.###.",
  7: "#####|....#|...#.|..#..|.#...|.#...|.#...",
  8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  9: ".###.|#...#|#...#|.####|....#|...#.|.##..",
  "!": "#|#|#|#|#|.|#",
  "?": ".###.|#...#|....#|...#.|..#..|.....|..#..",
  "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
  "-": "....|....|....|####|....|....|....",
  ".": ".|.|.|.|.|.|#",
  ",": "..|..|..|..|..|.#|#.",
  ":": ".|.|#|.|.|#|.",
  "/": "....#|....#|...#.|..#..|.#...|#....|#....",
  "%": "##...|##..#|...#.|..#..|.#...|#..##|...##",
  x: ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#",
  "*": ".....|..#..|#.#.#|.###.|#.#.#|..#..|.....",
  "'": "#|#|.|.|.|.|.",
  "<": "...#|..#.|.#..|#...|.#..|..#.|...#",
  ">": "#...|.#..|..#.|...#|..#.|.#..|#...",
  "=": "....|....|####|....|####|....|....",
  "(": "..#|.#.|#..|#..|#..|.#.|..#",
  ")": "#..|.#.|..#|..#|..#|.#.|#..",
  "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#."
};
function build(table, h) {
  const out = {};
  for (const [ch, src] of Object.entries(table)) {
    const rows = src.split("|");
    out[ch] = { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === "#")) };
    if (rows.length !== h) throw new Error(`glyph ${ch} has ${rows.length} rows, expected ${h}`);
  }
  return out;
}
var FONTS = {
  mini: { h: 5, space: 2, gap: 1, glyphs: build(MINI, 5) },
  big: { h: 7, space: 3, gap: 1, glyphs: build(BIG, 7) }
};
function textWidth(str, font = "mini") {
  const F = FONTS[font];
  let w = 0;
  for (const ch of String(str)) {
    const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
    w += (g ? g.w : F.space) + F.gap;
  }
  return Math.max(0, w - F.gap);
}
function rasterText(str, font, plot2) {
  const F = FONTS[font];
  let x = 0;
  for (const ch of String(str)) {
    const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
    if (!g) {
      x += F.space + F.gap;
      continue;
    }
    for (let r = 0; r < F.h; r++) for (let c = 0; c < g.w; c++) if (g.rows[r][c]) plot2(x + c, r);
    x += g.w + F.gap;
  }
}

// src/render/surface2d.ts
var SurfaceLightState2D = class {
  constructor(frame4) {
    this.frame = frame4;
    this.surface = new Float32Array(frame4.w * frame4.h * 3);
    this.linearSurface = new Float32Array(this.surface.length);
    this.optical = frame4.light.slice();
    if (frame4.hdrLight) this.linearOptical = frame4.hdrLight.slice();
  }
  surface;
  linearSurface;
  optical;
  linearOptical;
  reset() {
    this.surface.fill(0);
    this.linearSurface.fill(0);
    this.optical.fill(0);
    this.linearOptical?.fill(0);
  }
  ensureHDR() {
    if (this.frame.hdrLight && !this.linearOptical) {
      this.linearOptical = new Float32Array(this.surface.length);
      for (let i = 0; i < this.optical.length; i++) for (let ch = 0; ch < 3; ch++) this.linearOptical[i * 3 + ch] = channelToLinear(this.optical[i], ch * 8);
      for (let i = 0; i < this.optical.length; i++) this.write(i);
    }
    if (!this.frame.hdrLight) this.linearOptical = void 0;
  }
  write(i) {
    const j = i * 3, optical = this.optical[i];
    const r = Math.min(255, (optical & 255) + this.surface[j]) | 0;
    const g = Math.min(255, (optical >>> 8 & 255) + this.surface[j + 1]) | 0;
    const b = Math.min(255, (optical >>> 16 & 255) + this.surface[j + 2]) | 0;
    this.frame.light[i] = r || g || b ? (255 << 24 | b << 16 | g << 8 | r) >>> 0 : 0;
    if (this.frame.hdrLight) for (let ch = 0; ch < 3; ch++) this.frame.hdrLight[j + ch] = (this.linearOptical?.[j + ch] ?? 0) + this.linearSurface[j + ch];
  }
};
var states = /* @__PURE__ */ new WeakMap();
var encoded = (linear) => 255 * (linear <= 31308e-7 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055);
function enableSurfaceLight2D(frame4) {
  if (!states.has(frame4)) states.set(frame4, new SurfaceLightState2D(frame4));
  return frame4;
}
function resetSurfaceLight2D(frame4) {
  states.get(frame4)?.reset();
}
function attenuateSurfaceLight2D(frame4, i, opacity) {
  const state = states.get(frame4);
  if (!state || !(opacity > 0)) return;
  state.ensureHDR();
  const transmittance = 1 - Math.min(1, opacity), j = i * 3;
  for (let ch = 0; ch < 3; ch++) {
    state.surface[j + ch] *= transmittance;
    state.linearSurface[j + ch] *= transmittance;
  }
  state.write(i);
}
function addSurfaceLight2D(frame4, i, color, strength) {
  if (!(strength > 0)) return;
  enableSurfaceLight2D(frame4);
  const state = states.get(frame4);
  state.ensureHDR();
  const j = i * 3;
  for (let ch = 0; ch < 3; ch++) {
    state.surface[j + ch] += (color >>> ch * 8 & 255) * strength;
    state.linearSurface[j + ch] += channelToLinear(color, ch * 8) * strength;
  }
  state.write(i);
}
function addOpticalLight2D(frame4, i, color, strength) {
  const state = states.get(frame4);
  if (!state) return false;
  state.ensureHDR();
  const d = state.optical[i], j = i * 3;
  const r = Math.min(255, (d & 255) + (color & 255) * strength) | 0;
  const g = Math.min(255, (d >>> 8 & 255) + (color >>> 8 & 255) * strength) | 0;
  const b = Math.min(255, (d >>> 16 & 255) + (color >>> 16 & 255) * strength) | 0;
  state.optical[i] = (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  if (state.linearOptical) for (let ch = 0; ch < 3; ch++) state.linearOptical[j + ch] += channelToLinear(color, ch * 8) * strength;
  state.write(i);
  return true;
}
function addLinearLight2D(frame4, i, r, g, b, kind = "optical") {
  if (!Number.isInteger(i) || i < 0 || i >= frame4.w * frame4.h || ![r, g, b].every((n) => Number.isFinite(n) && n >= 0)) throw new RangeError("Invalid linear emission sample");
  if (r + g + b === 0) return;
  if (!frame4.hdrLight) {
    frame4.hdrLight = new Float32Array(frame4.w * frame4.h * 3);
    for (let p = 0; p < frame4.light.length; p++) for (let ch = 0; ch < 3; ch++) frame4.hdrLight[p * 3 + ch] = channelToLinear(frame4.light[p], ch * 8);
  }
  if (kind === "surface") enableSurfaceLight2D(frame4);
  const state = states.get(frame4), linear = [r, g, b], legacy = linear.map(encoded), j = i * 3;
  if (state) {
    state.ensureHDR();
    if (kind === "surface") for (let ch = 0; ch < 3; ch++) {
      state.surface[j + ch] += legacy[ch];
      state.linearSurface[j + ch] += linear[ch];
    }
    else {
      const d = state.optical[i];
      state.optical[i] = (255 << 24 | (Math.min(255, (d & 255) + legacy[0]) | 0) | (Math.min(255, (d >>> 8 & 255) + legacy[1]) | 0) << 8 | (Math.min(255, (d >>> 16 & 255) + legacy[2]) | 0) << 16) >>> 0;
      for (let ch = 0; ch < 3; ch++) state.linearOptical[j + ch] += linear[ch];
    }
    state.write(i);
  } else {
    const d = frame4.light[i];
    frame4.light[i] = (255 << 24 | (Math.min(255, (d & 255) + legacy[0]) | 0) | (Math.min(255, (d >>> 8 & 255) + legacy[1]) | 0) << 8 | (Math.min(255, (d >>> 16 & 255) + legacy[2]) | 0) << 16) >>> 0;
    for (let ch = 0; ch < 3; ch++) frame4.hdrLight[j + ch] += linear[ch];
  }
}

// src/core/painter.ts
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
var OUT = { c: 0, a: 1, l: 0, k: 0 };
var sprites = /* @__PURE__ */ new WeakMap();
var call = (v, ...args) => typeof v === "function" ? v(...args) : v;
var Painter = class {
  strokeStamp;
  strokeDistance;
  strokeU;
  strokePixels;
  strokeId = 0;
  constructor(frame4) {
    this.frame = frame4;
    this.reset();
  }
  /** Continuous coverage by default; ordered dither remains available as an authored texture. */
  get alphaMode() {
    return this.frame.alphaMode ?? "coverage";
  }
  set alphaMode(mode) {
    this.frame.alphaMode = mode;
  }
  /** Re-read the frame and clear placement, fade and light strength. */
  reset() {
    const f = this.frame;
    this.w = f.w;
    this.h = f.h;
    this.ox = f.ox | 0;
    this.oy = f.oy | 0;
    this.C = f.color;
    this.L = f.light;
    this.tx = 0;
    this.ty = 0;
    this.fx = 1;
    this.cs = 1;
    this.sn = 0;
    this.particleStyle = "refined";
    this.fade = 1;
    this.lightK = 1;
    this.layer = "front";
    return this;
  }
  /** Put the effect's origin at world (x, y), mirrored if flip, rotated by angle (radians). */
  place(x, y, flip = false, angle = 0) {
    this.tx = x;
    this.ty = y;
    this.fx = flip ? -1 : 1;
    this.cs = Math.cos(angle);
    this.sn = Math.sin(angle);
    return this;
  }
  // ---- transforms: local (effect) space <-> screen (frame) space
  toX(x, y) {
    return this.tx + x * this.fx * this.cs - y * this.sn;
  }
  toY(x, y) {
    return this.ty + x * this.fx * this.sn + y * this.cs;
  }
  fromX(sx, sy) {
    const dx = sx - this.tx, dy = sy - this.ty;
    return (dx * this.cs + dy * this.sn) * this.fx;
  }
  fromY(sx, sy) {
    const dx = sx - this.tx, dy = sy - this.ty;
    return -dx * this.sn + dy * this.cs;
  }
  // the screen pixel of the local pixel cell holding (x, y): mirrors and rotations land on whole cells
  cellX(x, y) {
    return Math.floor(this.toX(Math.floor(x) + 0.5, Math.floor(y) + 0.5));
  }
  cellY(x, y) {
    return Math.floor(this.toY(Math.floor(x) + 0.5, Math.floor(y) + 0.5));
  }
  // ---- raw writes, screen space, whole pixels. Color 0 means "nothing": it never erases what's there.
  put(sx, sy, c, a = 1) {
    if (!c || !(a > 0)) return;
    a *= this.fade;
    if (!(a > 0)) return;
    const x = sx - this.ox, y = sy - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.frame.alphaMode === "dither") {
      if (a < 1 && a <= BAYER[(sy & 3) << 2 | sx & 3]) return;
      this.C[i] = c;
    } else this.C[i] = a >= 1 && c >>> 24 === 255 ? c : blendOver(this.C[i], c, a);
    attenuateSurfaceLight2D(this.frame, i, (this.frame.alphaMode === "dither" ? 1 : Math.min(1, a)) * (c >>> 24) / 255);
  }
  add(sx, sy, c, k = 1) {
    k *= this.fade * this.lightK;
    if (k <= 4e-3) return;
    const x = sx - this.ox, y = sy - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, d = this.L[i];
    if (addOpticalLight2D(this.frame, i, c, k)) return;
    const hdr = this.frame.hdrLight;
    if (hdr) {
      const j = i * 3;
      hdr[j] += channelToLinear(c, 0) * k;
      hdr[j + 1] += channelToLinear(c, 8) * k;
      hdr[j + 2] += channelToLinear(c, 16) * k;
    }
    const r = Math.min(255, (d & 255) + (c & 255) * k) | 0;
    const g = Math.min(255, (d >>> 8 & 255) + (c >>> 8 & 255) * k) | 0;
    const b = Math.min(255, (d >>> 16 & 255) + (c >>> 16 & 255) * k) | 0;
    this.L[i] = 255 << 24 | b << 16 | g << 8 | r;
  }
  /**
   * Blend a color over what's there at alpha a (0..1), keeping the result's own alpha: soft smoke, vapour and
   * mist. This always blends, including when the frame explicitly requests artistic dithering.
   */
  blendPx(sx, sy, c, a) {
    a *= this.fade;
    if (!c || a <= 4e-3) return;
    const x = sx - this.ox, y = sy - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.C[i] = blendOver(this.C[i], c, a);
    attenuateSurfaceLight2D(this.frame, i, Math.min(1, a) * (c >>> 24) / 255);
  }
  /** Draw a surface pixel whose emission is attenuated by later foreground color. Legacy light() stays optical. */
  surfacePixel(sx, sy, color, opacity = 1, emissionColor = color, emission = 1) {
    const x = sx - this.ox, y = sy - this.oy;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.w || y >= this.h || !color) return;
    enableSurfaceLight2D(this.frame);
    const coverage = clamp(opacity * this.fade) * (color >>> 24) / 255;
    if (this.frame.alphaMode === "dither" && opacity * this.fade < 1 && opacity * this.fade <= BAYER[(sy & 3) << 2 | sx & 3]) return;
    this.put(sx, sy, color, opacity);
    addSurfaceLight2D(
      this.frame,
      y * this.w + x,
      emissionColor,
      (this.frame.alphaMode === "dither" ? (color >>> 24) / 255 : coverage) * Math.max(0, emission) * this.lightK
    );
  }
  /** Local-coordinate companion to surfacePixel(). */
  surface(x, y, color, opacity = 1, emissionColor = color, emission = 1) {
    this.surfacePixel(this.cellX(x, y), this.cellY(x, y), color, opacity, emissionColor, emission);
  }
  /** Translucent pixel at a local point. */
  blend(x, y, c, a) {
    this.blendPx(this.cellX(x, y), this.cellY(x, y), c, a);
  }
  /** A translucent disc: puffs of smoke, vapour, dust. c and a may be functions of (d: 0 center..1 rim, angle). */
  disc(cx, cy, r, c, a) {
    if (!(r > 0)) return;
    if (r < Math.SQRT1_2) return this.blend(cx, cy, call(c, 0, 0), call(a, 0, 0));
    this.each(cx - r, cy - r, cx + r, cy + r, (x, y, sx, sy) => {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) return;
      const d = Math.sqrt(d2) / r, ang = Math.atan2(dy, dx);
      this.blendPx(sx, sy, call(c, d, ang), call(a, d, ang));
    });
  }
  /** Read back the color under a local point (0 if empty). */
  get(x, y) {
    const sx = this.cellX(x, y) - this.ox, sy = this.cellY(x, y) - this.oy;
    return sx < 0 || sy < 0 || sx >= this.w || sy >= this.h ? 0 : this.C[sy * this.w + sx];
  }
  // ---- pixels
  /** One opaque pixel. */
  px(x, y, c) {
    this.put(this.cellX(x, y), this.cellY(x, y), c, 1);
  }
  /** One pixel at alpha a (0..1), preserving coverage as it fades. */
  dot(x, y, c, a = 1) {
    if (a > 0) this.put(this.cellX(x, y), this.cellY(x, y), c, a);
  }
  /** Explicit ordered-dither pixel for dissolves, stipple and other authored textures. */
  dither(x, y, c, a = 1) {
    const sx = this.cellX(x, y), sy = this.cellY(x, y);
    if (a * this.fade <= BAYER[(sy & 3) << 2 | sx & 3]) return;
    const px = sx - this.ox, py = sy - this.oy;
    if (c && px >= 0 && py >= 0 && px < this.w && py < this.h) {
      const i = py * this.w + px;
      this.C[i] = c;
      attenuateSurfaceLight2D(this.frame, i, (c >>> 24) / 255);
    }
  }
  /** Add light to one pixel. */
  light(x, y, c, k = 1) {
    this.add(this.cellX(x, y), this.cellY(x, y), c, k);
  }
  /**
   * Visit every screen pixel whose center falls in the local box [x0, x1] x [y0, y1], with that center in
   * local space: fn(lx, ly, sx, sy). The basis of every filled shape, so shapes mirror and rotate exactly.
   */
  each(x0, y0, x1, y1, fn) {
    let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
    for (let k = 0; k < 4; k++) {
      const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, sx = this.toX(x, y), sy = this.toY(x, y);
      if (sx < ax) ax = sx;
      if (sx > bx) bx = sx;
      if (sy < ay) ay = sy;
      if (sy > by) by = sy;
    }
    const rotated = this.sn !== 0 || this.cs !== 1;
    const lower = rotated ? Math.floor : Math.ceil, upper = rotated ? Math.ceil : Math.floor;
    const sx0 = Math.max(lower(ax - 0.5), this.ox), sx1 = Math.min(upper(bx - 0.5), this.ox + this.w - 1);
    const sy0 = Math.max(lower(ay - 0.5), this.oy), sy1 = Math.min(upper(by - 0.5), this.oy + this.h - 1);
    for (let sy = sy0; sy <= sy1; sy++)
      for (let sx = sx0; sx <= sx1; sx++) {
        const cx = sx + 0.5, cy = sy + 0.5, lx = this.fromX(cx, cy), ly = this.fromY(cx, cy);
        if (rotated && (lx < x0 || ly < y0 || lx > x1 || ly > y1)) continue;
        fn(lx, ly, sx, sy);
      }
  }
  /**
   * A pixel shader over a local box. fn(x, y, out) returns a color, or sets out.c (color), out.a (alpha),
   * out.l (light color, defaults to out.c) and out.k (light amount). Return nothing to leave the pixel alone.
   */
  shade(x0, y0, x1, y1, fn) {
    const o = OUT;
    this.each(x0, y0, x1, y1, (lx, ly, sx, sy) => {
      o.c = 0;
      o.a = 1;
      o.l = 0;
      o.k = 0;
      const c = fn(lx, ly, o) || o.c;
      if (c) this.put(sx, sy, c, o.a);
      if (o.k > 0) this.add(sx, sy, o.l || c, o.k);
    });
  }
  // ---- shapes. Colors (c) and alphas (a) can be numbers or functions of the shape's own coordinates.
  /** 1 px line. c and a may be functions of u (0 at the start, 1 at the end). */
  line(x0, y0, x1, y1, c, a = 1) {
    this.lineCells(this.cellX(x0, y0), this.cellY(x0, y0), this.cellX(x1, y1), this.cellY(x1, y1), c, a);
  }
  lineCells(sx, sy, ex, ey, c, a, opacity = 1) {
    const fc = typeof c === "function", fa = typeof a === "function";
    this.visibleLineCells(sx, sy, ex, ey, (x, y, u) => this.put(x, y, fc ? c(u, 0) : c, (fa ? a(u, 0) : a) * opacity));
  }
  /** Skip invisible major-axis steps without moving endpoints or restarting the raster error. */
  visibleLineCells(sx, sy, ex, ey, visit) {
    const dx = Math.abs(ex - sx), dy = Math.abs(ey - sy), stepX = sx < ex ? 1 : -1, stepY = sy < ey ? 1 : -1;
    const xMajor = dx >= dy, major = xMajor ? dx : dy, n = major || 1;
    const start = xMajor ? sx : sy, direction = xMajor ? stepX : stepY;
    const lo = xMajor ? this.ox : this.oy, hi = lo + (xMajor ? this.w : this.h) - 1;
    const first = Math.max(0, direction > 0 ? lo - start : start - hi);
    const last = Math.min(major, direction > 0 ? hi - start : start - lo);
    if (first > last) return;
    const minorSteps = major ? Math.floor((first * (xMajor ? dy : dx) + major / 2) / major) : 0;
    const nx = xMajor ? first : minorSteps, ny = xMajor ? minorSteps : first;
    sx += nx * stepX;
    sy += ny * stepY;
    let error = dx - dy - nx * dy + ny * dx;
    for (let i = first; i <= last; i++) {
      if (sx >= this.ox && sy >= this.oy && sx < this.ox + this.w && sy < this.oy + this.h) visit(sx, sy, i / n);
      const twice = error * 2;
      if (twice >= -dy) {
        error -= dy;
        sx += stepX;
      }
      if (twice <= dx) {
        error += dx;
        sy += stepY;
      }
    }
  }
  /** Lines through a list of points [[x, y], ...]. */
  polyline(pts, c, a = 1) {
    this.stroke(pts, c, a, 1, false);
  }
  /** A connected round-ended path, composited once per cell. Callbacks use global arc-length u and across-width v. */
  path(pts, c, a = 1, width = 1, options = {}) {
    this.stroke(pts, c, a, width, true, false, options.preferHead ?? false);
  }
  /** Adaptive curves with a quarter-pixel geometric error; snapping happens only during rasterization. */
  quadratic(p0, p1, p2, c, a = 1, width = 1) {
    this.path(quadraticBezier(p0, p1, p2), c, a, width);
  }
  cubic(p0, p1, p2, p3, c, a = 1, width = 1) {
    this.path(cubicBezier(p0, p1, p2, p3), c, a, width);
  }
  spline(pts, c, a = 1, width = 1, options = {}) {
    this.path(catmullRom(pts, options), c, a, width);
  }
  stroke(pts, c, a, width, globalU, light = false, preferHead = false) {
    if (!pts.length || !(width > 0)) return;
    if (pts.length === 1 && light) pts = [pts[0], pts[0]];
    if (pts.length === 1) {
      this.circle(pts[0][0], pts[0][1], width / 2, c, a);
      return;
    }
    const thin = !light && width < Math.SQRT2;
    if (pts.length === 2 && thin && !preferHead) {
      const [a0, a1] = pts;
      this.lineCells(
        globalU ? Math.floor(this.toX(...a0)) : this.cellX(...a0),
        globalU ? Math.floor(this.toY(...a0)) : this.cellY(...a0),
        globalU ? Math.floor(this.toX(...a1)) : this.cellX(...a1),
        globalU ? Math.floor(this.toY(...a1)) : this.cellY(...a1),
        c,
        a,
        Math.min(1, width)
      );
      return;
    }
    const size = this.w * this.h;
    if (!this.strokeStamp || this.strokeStamp.length !== size) {
      this.strokeStamp = new Uint32Array(size);
      this.strokeDistance = new Float32Array(size);
      this.strokeU = new Float32Array(size);
      this.strokePixels = new Uint32Array(size);
    }
    this.strokeId = this.strokeId + 1 >>> 0;
    if (!this.strokeId) {
      this.strokeStamp.fill(0);
      this.strokeId = 1;
    }
    const stamp = this.strokeStamp, distance = this.strokeDistance, us = this.strokeU, pixels = this.strokePixels;
    const id = this.strokeId, lengths = globalU ? pathLengths(pts) : null;
    const totalLength = lengths?.[pts.length - 1] || 0, total = totalLength || 1;
    const r = width / 2;
    const strength = light && typeof a === "number" ? a * this.fade * this.lightK : null;
    if (strength !== null && strength <= 4e-3) return;
    const reach = strength !== null && Number.isFinite(strength) ? r * (1 - Math.sqrt(4e-3 / strength) + 1e-6) : r;
    const r2 = reach * reach;
    let count = 0;
    const visit = (sx, sy, d2, u) => {
      const x = sx - this.ox, y = sy - this.oy;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x;
      if (stamp[i] !== id) {
        stamp[i] = id;
        pixels[count++] = i;
        distance[i] = d2;
        us[i] = u;
      } else if (d2 < distance[i] || preferHead && d2 === distance[i] && u > us[i]) {
        distance[i] = d2;
        us[i] = u;
      }
    };
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
      const start = lengths ? lengths[j - 1] / total : 0, span = lengths ? (lengths[j] - lengths[j - 1]) / total : 1;
      if (thin) {
        const sx = globalU ? Math.floor(this.toX(ax, ay)) : this.cellX(ax, ay), sy = globalU ? Math.floor(this.toY(ax, ay)) : this.cellY(ax, ay);
        const ex = globalU ? Math.floor(this.toX(bx, by)) : this.cellX(bx, by), ey = globalU ? Math.floor(this.toY(bx, by)) : this.cellY(bx, by);
        this.visibleLineCells(sx, sy, ex, ey, (x, y, u) => visit(x, y, 0, preferHead && sx === ex && sy === ey ? start + span : start + span * u));
      } else {
        const x0 = this.toX(ax, ay), y0 = this.toY(ax, ay), x1 = this.toX(bx, by), y1 = this.toY(bx, by);
        const dx = x1 - x0, dy = y1 - y0, length2 = dx * dx + dy * dy;
        const left = Math.max(this.ox, Math.floor(Math.min(x0, x1) - reach)), right = Math.min(this.ox + this.w - 1, Math.ceil(Math.max(x0, x1) + reach));
        const top = Math.max(this.oy, Math.floor(Math.min(y0, y1) - reach)), bottom = Math.min(this.oy + this.h - 1, Math.ceil(Math.max(y0, y1) + reach));
        for (let sy = top; sy <= bottom; sy++) for (let sx = left; sx <= right; sx++) {
          const u = length2 ? clamp(((sx + 0.5 - x0) * dx + (sy + 0.5 - y0) * dy) / length2) : 0;
          const ex = sx + 0.5 - x0 - u * dx, ey = sy + 0.5 - y0 - u * dy, d2 = ex * ex + ey * ey;
          if (d2 <= r2) visit(sx, sy, d2, start + span * u);
        }
      }
    }
    for (let j = 0; j < count; j++) {
      const i = pixels[j], u = preferHead && totalLength === 0 ? 1 : us[i], v = thin ? 0 : Math.sqrt(distance[i]) / r;
      const sx = this.ox + i % this.w, sy = this.oy + Math.floor(i / this.w);
      if (light) this.add(sx, sy, call(c, u, v), call(a, u, v) * (1 - v) ** 2);
      else this.put(sx, sy, call(c, u, v), call(a, u, v) * Math.min(1, width));
    }
  }
  /** Thick segment with round ends. c and a may be functions of (u along, v across: 0 center, 1 edge). */
  beam(x0, y0, x1, y1, width, c, a = 1) {
    if (!(width > 0)) return;
    if (width < Math.SQRT2) {
      this.path([[x0, y0], [x1, y1]], c, a, width);
      return;
    }
    const r = width / 2, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
    this.shade(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (x, y, o) => {
      const u = clamp(((x - x0) * dx + (y - y0) * dy) / L2), px = x0 + dx * u - x, py = y0 + dy * u - y;
      const d2 = px * px + py * py;
      if (d2 > r * r) return;
      const v = Math.sqrt(d2) / r;
      o.c = call(c, u, v);
      o.a = call(a, u, v);
    });
  }
  /** Filled disc. c and a may be functions of (d: 0 center to 1 rim, angle). */
  circle(cx, cy, r, c, a = 1) {
    if (!(r > 0)) return;
    if (r < Math.SQRT1_2) return this.dot(cx, cy, call(c, 0, 0), call(a, 0, 0));
    this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) return;
      const d = Math.sqrt(d2) / r, ang = Math.atan2(dy, dx);
      o.c = call(c, d, ang);
      o.a = call(a, d, ang);
    });
  }
  /** Ellipse. c and a may be functions of (d: 0 center to 1 rim, angle). */
  ellipse(cx, cy, rx, ry, c, a = 1) {
    if (rx <= 0 || ry <= 0) return;
    this.shade(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, o) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 > 1) return;
      const d = Math.sqrt(d2), ang = Math.atan2(dy, dx);
      o.c = call(c, d, ang);
      o.a = call(a, d, ang);
    });
  }
  /** Ring from radius r - w to r. c and a may be functions of (v: 0 inner to 1 outer, angle). */
  ring(cx, cy, r, w, c, a = 1) {
    if (!(r > 0) || !(w > 0)) return;
    const r0 = Math.max(0, r - w);
    this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r || d2 < r0 * r0) return;
      const v = w > 0 ? (Math.sqrt(d2) - r0) / (r - r0 || 1) : 1, ang = Math.atan2(dy, dx);
      o.c = call(c, v, ang);
      o.a = call(a, v, ang);
    });
  }
  /**
   * Band of a ring from angle a0 to a1 (radians, a1 > a0), radius r - w to r: the slash and smear shape.
   * c and a may be functions of (u: 0 at a0 to 1 at a1, v: 0 inner to 1 outer). w can be a function of u
   * for a crescent that tapers at both ends.
   */
  arc(cx, cy, r, w, a0, a1, c, a = 1) {
    const span = a1 - a0, wf = typeof w === "function";
    if (!(r > 0) || !(span > 0)) return;
    this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) return;
      let ang = Math.atan2(dy, dx) - a0;
      ang -= Math.floor(ang / (Math.PI * 2)) * Math.PI * 2;
      if (ang > span) return;
      const u = ang / span, ww = wf ? w(u) : w;
      if (ww <= 0 || d < r - ww) return;
      const v = (d - (r - ww)) / ww;
      o.c = call(c, u, v);
      o.a = call(a, u, v);
    });
  }
  /** Filled rectangle. */
  rect(x, y, w, h, c, a = 1) {
    if (!(w > 0) || !(h > 0)) return;
    if (this.sn === 0 && this.cs === 1) {
      const ax = this.toX(x, y), bx = this.toX(x + w, y), ay = this.toY(x, y);
      const left = Math.min(ax, bx) - 0.5, right = Math.max(ax, bx) - 0.5;
      const X0 = Math.max(this.ox, this.fx === 1 ? Math.ceil(left) : Math.floor(left) + 1);
      const X1 = Math.min(this.ox + this.w, this.fx === 1 ? Math.ceil(right) : Math.floor(right) + 1);
      const Y0 = Math.max(this.oy, Math.ceil(ay - 0.5)), Y1 = Math.min(this.oy + this.h, Math.ceil(ay + h - 0.5));
      for (let yy = Y0; yy < Y1; yy++) for (let xx = X0; xx < X1; xx++) this.put(xx, yy, c, a);
      return;
    }
    this.shade(x, y, x + w, y + h, (lx, ly, o) => {
      if (lx < x || ly < y || lx >= x + w || ly >= y + h) return;
      o.c = c;
      o.a = a;
    });
  }
  /** Filled polygon from points [[x, y], ...] (even-odd rule). */
  poly(pts, c, a = 1) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const n = pts.length;
    this.shade(x0, y0, x1, y1, (x, y, o) => {
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return;
      o.c = call(c, x, y);
      o.a = call(a, x, y);
    });
  }
  tri(x0, y0, x1, y1, x2, y2, c, a = 1) {
    this.poly([[x0, y0], [x1, y1], [x2, y2]], c, a);
  }
  // ---- light
  /** Radial glow into the light buffer: k at the center, falling to 0 at radius r. */
  glow(x, y, r, c, k = 0.5) {
    if (r < 1 || k <= 4e-3) return;
    const cx = this.toX(x, y), cy = this.toY(x, y);
    const x0 = Math.max(this.ox, Math.floor(cx - r)), x1 = Math.min(this.ox + this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(this.oy, Math.floor(cy - r)), y1 = Math.min(this.oy + this.h - 1, Math.ceil(cy + r));
    for (let sy = y0; sy <= y1; sy++) {
      const dy = (sy + 0.5 - cy) / r;
      for (let sx = x0; sx <= x1; sx++) {
        const dx = (sx + 0.5 - cx) / r, d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const f = 1 - Math.sqrt(d);
        this.add(sx, sy, c, f * f * k);
      }
    }
  }
  /** Glow around a segment (a soft beam of light). */
  glowLine(x0, y0, x1, y1, r, c, k = 0.5) {
    if (r < 1 || k <= 4e-3) return;
    const ax = this.toX(x0, y0), ay = this.toY(x0, y0), bx = this.toX(x1, y1), by = this.toY(x1, y1);
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const X0 = Math.max(this.ox, Math.floor(Math.min(ax, bx) - r)), X1 = Math.min(this.ox + this.w - 1, Math.ceil(Math.max(ax, bx) + r));
    const Y0 = Math.max(this.oy, Math.floor(Math.min(ay, by) - r)), Y1 = Math.min(this.oy + this.h - 1, Math.ceil(Math.max(ay, by) + r));
    for (let sy = Y0; sy <= Y1; sy++)
      for (let sx = X0; sx <= X1; sx++) {
        const px = sx + 0.5, py = sy + 0.5, u = clamp(((px - ax) * dx + (py - ay) * dy) / L2);
        const ex = ax + dx * u - px, ey = ay + dy * u - py, d = Math.sqrt(ex * ex + ey * ey) / r;
        if (d >= 1) continue;
        const f = 1 - d;
        this.add(sx, sy, c, f * f * k);
      }
  }
  /**
   * Glow along a connected path. A cell receives light once, from its nearest segment, so adding
   * samples or retracing a curve cannot overexpose joins. c/k may use global arc-length u and radius v.
   * Use separate calls only for genuinely separate light sources; this never blurs the color buffer.
   */
  glowPath(pts, radius, c, k = 0.5) {
    if (!(radius >= 1)) return;
    this.stroke(pts, c, k, radius * 2, true, true);
  }
  /** Glow hugging a circle of radius R (a shockwave's light), falling off over width r. */
  glowRing(x, y, R, r, c, k = 0.5) {
    if (r < 1 || k <= 4e-3) return;
    const cx = this.toX(x, y), cy = this.toY(x, y), E = R + r;
    const x0 = Math.max(this.ox, Math.floor(cx - E)), x1 = Math.min(this.ox + this.w - 1, Math.ceil(cx + E));
    const y0 = Math.max(this.oy, Math.floor(cy - E)), y1 = Math.min(this.oy + this.h - 1, Math.ceil(cy + E));
    for (let sy = y0; sy <= y1; sy++)
      for (let sx = x0; sx <= x1; sx++) {
        const d = Math.abs(Math.hypot(sx + 0.5 - cx, sy + 0.5 - cy) - R) / r;
        if (d >= 1) continue;
        const f = 1 - d;
        this.add(sx, sy, c, f * f * k);
      }
  }
  // ---- sprites, text, masks
  /**
   * A little sprite from strings: rows like ["..##..", ".#oo#."], pal maps characters to colors
   * ({ "#": "#222034", o: 0xff... }); "." and " " are empty. Top-left at (x, y).
   * opts: { scale, a, flip (mirror left-right), flipY (upside down), tint (draw every pixel in one color) }.
   */
  sprite(rows, pal, x, y, opts = {}) {
    let s = sprites.get(rows);
    if (!s) sprites.set(rows, s = rows.map((r) => [...r]));
    const k = opts.scale ?? 1, a = opts.a ?? 1, W = Math.max(0, ...s.map((row) => row.length)), cache = {};
    if (!(k > 0) || !W) return;
    if (this.sn !== 0 || this.cs !== 1 || k % 1 !== 0) {
      this.shade(x, y, x + W * k, y + s.length * k, (lx, ly, out) => {
        const col = Math.floor((lx - x) / k), row = Math.floor((ly - y) / k);
        if (col < 0 || row < 0 || col >= W || row >= s.length) return;
        const ch = s[opts.flipY ? s.length - 1 - row : row][opts.flip ? W - 1 - col : col];
        if (!ch || ch === "." || ch === " ") return;
        let color = opts.tint ?? cache[ch];
        if (color === void 0) color = cache[ch] = pal[ch] === void 0 ? 0 : hex(pal[ch]);
        out.c = color;
        out.a = a;
      });
      return;
    }
    for (let r = 0; r < s.length; r++)
      for (let q = 0; q < s[r].length; q++) {
        const ch = s[r][q];
        if (ch === "." || ch === " ") continue;
        let c = opts.tint;
        if (c === void 0) {
          c = cache[ch];
          if (c === void 0) c = cache[ch] = pal[ch] === void 0 ? 0 : hex(pal[ch]);
        }
        if (!c) continue;
        const col = opts.flip ? W - 1 - q : q, row = opts.flipY ? s.length - 1 - r : r;
        this.rect(x + col * k, y + row * k, k, k, c, a);
      }
  }
  /**
   * Pixel text. opts: { font: "mini" (3x5) | "big" (5x7), scale, align: "left" | "center" | "right",
   * outline: color, shadow: color, a }. (x, y) is the top of the text, at the left, center or right.
   */
  text(str, x, y, c, opts = {}) {
    const font = opts.font ?? "mini", k = opts.scale ?? 1, a = opts.a ?? 1, w = textWidth(str, font) * k;
    const left = Math.round(opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x), top = Math.round(y);
    const ol = opts.outline, sh = opts.shadow;
    if (ol !== void 0) rasterText(str, font, (gx, gy) => this.rect(left + gx * k - 1, top + gy * k - 1, k + 2, k + 2, ol, a));
    if (sh !== void 0) rasterText(str, font, (gx, gy) => this.rect(left + gx * k + 1, top + gy * k + 1, k, k, sh, a));
    rasterText(str, font, (gx, gy) => this.rect(left + gx * k, top + gy * k, k, k, call(c, gx, gy), a));
  }
  /** Size of text in pixels: [w, h]. */
  measure(str, opts = {}) {
    const k = opts.scale ?? 1;
    return [textWidth(str, opts.font ?? "mini") * k, FONTS[opts.font ?? "mini"].h * k];
  }
  /** Fill a mask ({ w, h, data }) with its top-left at (x, y). c may be a function of (mx, my). */
  mask(m, x, y, c, a = 1) {
    if (this.sn !== 0 || this.cs !== 1) {
      this.shade(x, y, x + m.w, y + m.h, (lx, ly, out) => {
        const mx = Math.floor(lx - x), my = Math.floor(ly - y);
        if (mx < 0 || my < 0 || mx >= m.w || my >= m.h || !m.data[my * m.w + mx]) return;
        out.c = call(c, mx, my);
        out.a = call(a, mx, my);
      });
      return;
    }
    for (let my = 0; my < m.h; my++)
      for (let mx = 0; mx < m.w; mx++) if (m.data[my * m.w + mx]) this.rect(x + mx, y + my, 1, 1, call(c, mx, my), call(a, mx, my));
  }
  /** The 1 px outline just outside a mask. */
  outline(m, x, y, c, a = 1) {
    const at = (mx, my) => mx >= 0 && my >= 0 && mx < m.w && my < m.h && m.data[my * m.w + mx];
    if (this.sn !== 0 || this.cs !== 1) {
      this.shade(x - 1, y - 1, x + m.w + 1, y + m.h + 1, (lx, ly, out) => {
        const mx = Math.floor(lx - x), my = Math.floor(ly - y);
        if (!at(mx, my) && (at(mx - 1, my) || at(mx + 1, my) || at(mx, my - 1) || at(mx, my + 1))) {
          out.c = call(c, mx, my);
          out.a = call(a, mx, my);
        }
      });
      return;
    }
    for (let my = -1; my <= m.h; my++)
      for (let mx = -1; mx <= m.w; mx++)
        if (!at(mx, my) && (at(mx - 1, my) || at(mx + 1, my) || at(mx, my - 1) || at(mx, my + 1)))
          this.rect(x + mx, y + my, 1, 1, call(c, mx, my), call(a, mx, my));
  }
};

// src/core/fx.ts
var drawState = (p) => ({
  tx: p.tx,
  ty: p.ty,
  fx: p.fx,
  cs: p.cs,
  sn: p.sn,
  fade: p.fade,
  lightK: p.lightK,
  particleStyle: p.particleStyle,
  layer: p.layer
});
function createFrame(w, h, ox = 0, oy = 0) {
  return { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
}
function clearFrame(f) {
  f.color.fill(0);
  f.light.fill(0);
  f.hdrLight?.fill(0);
  for (const mask of Object.values(f.semanticMasks ?? {})) mask.fill(0);
  resetSurfaceLight2D(f);
  return f;
}
var painters = /* @__PURE__ */ new WeakMap();
function painterFor(frame4) {
  let p = painters.get(frame4);
  if (!p) painters.set(frame4, p = new Painter(frame4));
  return p.reset();
}
var FADE = 0.3;
var FX_TICK_RATE = 120;
var FX_TICK_SECONDS = 1 / FX_TICK_RATE;
var isRamp = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "number" || /^#[0-9a-f]{3,8}$/i.test(c));
function resolveOptions(meta, o = {}) {
  const opts = { ...meta.options ?? {}, ...o };
  for (const [k, def] of Object.entries(meta.options ?? {}))
    if (isRamp(def) && isRamp(o[k]) && o[k].length !== def.length) opts[k] = fit(o[k], def.length).map(toHex);
  if (meta.actor && !opts.actor) opts.actor = stockActor(meta.actor === 2 ? 2 : 1);
  return opts;
}
function createFx(mod, o = {}) {
  const meta = mod.meta ?? {};
  const opts = resolveOptions(meta, o);
  const impl = mod.create ? mod.create(opts) : mod;
  const contacts = Object.freeze((mod.contacts?.(opts) ?? []).map(defineImpactContact2D));
  const D = meta.duration ?? 1;
  let t = 0, timeError = 0, tick = 0, stopAt = Infinity;
  const pure = !impl.update && !impl.advanceTime;
  const supportsCheckpoint = pure || !!(impl.captureState && impl.restoreState);
  return {
    meta,
    contacts,
    options: opts,
    supportsCheckpoint,
    capture() {
      if (!supportsCheckpoint) throw new Error("This effect must declare captureState/restoreState before it can be checkpointed");
      return { schema: "poku.fx-checkpoint/v1", time: t, timeError, tick, stopAt: Number.isFinite(stopAt) ? stopAt : null, state: pure ? null : structuredClone(impl.captureState()) };
    },
    restore(snapshot) {
      if (!supportsCheckpoint) throw new Error("This effect does not support checkpoints");
      if (snapshot.schema !== "poku.fx-checkpoint/v1" || ![snapshot.time, snapshot.timeError].every(Number.isFinite) || snapshot.time < 0 || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick !== Math.floor(snapshot.time * FX_TICK_RATE + 1e-9) || snapshot.stopAt !== null && (!Number.isFinite(snapshot.stopAt) || snapshot.stopAt < 0)) throw new RangeError("Invalid effect checkpoint clock");
      if (!pure) impl.restoreState(structuredClone(snapshot.state));
      t = snapshot.time;
      timeError = snapshot.timeError;
      tick = snapshot.tick;
      stopAt = snapshot.stopAt ?? Infinity;
    },
    get t() {
      return t;
    },
    get tick() {
      return tick;
    },
    get simulatedTime() {
      return tick / FX_TICK_RATE;
    },
    get shake() {
      const strength = opts.cameraMotion ?? 1;
      if (!Number.isFinite(strength) || strength < 0) throw new RangeError("cameraMotion must be finite and non-negative");
      if (!mod.cameraShake || strength === 0 || !meta.loop && t >= D || t - stopAt >= FADE) return [0, 0];
      const offset = mod.cameraShake(meta.loop ? loopTime(t, D) : t, opts);
      if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) throw new RangeError("cameraShake must return two finite pixel offsets");
      const fade2 = stopAt === Infinity ? 1 : clamp(1 - (t - stopAt) / FADE);
      return [Math.round(offset[0] * strength * fade2), Math.round(offset[1] * strength * fade2)];
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
      if (dt === 0) return;
      const part = dt - timeError, next = t + part;
      timeError = next - t - part;
      const boundary = Math.round(next * FX_TICK_RATE) / FX_TICK_RATE;
      t = Math.abs(next - boundary) <= 1e-12 ? boundary : next;
      timeError += t - next;
      const target = Math.floor(t * FX_TICK_RATE + 1e-9);
      if (impl.advanceTime) {
        impl.advanceTime(t, opts);
        tick = target;
        return;
      }
      if (!impl.update) {
        tick = target;
        return;
      }
      while (tick < target) {
        impl.update(FX_TICK_SECONDS, opts);
        tick++;
      }
    },
    draw(frame4, layer2, parent) {
      const inherited = parent ? {
        tx: parent.tx,
        ty: parent.ty,
        fx: parent.fx,
        cs: parent.cs,
        sn: parent.sn,
        fade: parent.fade,
        lightK: parent.lightK,
        particleStyle: parent.particleStyle
      } : void 0;
      const previous = inherited ? painters.get(frame4) : void 0;
      const saved = previous ? drawState(previous) : void 0;
      const p = painterFor(frame4);
      const x = opts.x ?? 0, y = opts.y ?? 0, angle = opts.angle ?? 0;
      if (inherited) {
        const { tx, ty, fx: sign, cs, sn } = inherited;
        p.place(
          tx + sign * x * cs - y * sn,
          ty + sign * x * sn + y * cs,
          sign < 0 !== !!opts.flip,
          Math.atan2(sn, cs) + sign * angle
        );
      } else p.place(x, y, !!opts.flip, angle);
      p.fade = (inherited?.fade ?? 1) * (stopAt === Infinity ? 1 : clamp(1 - (t - stopAt) / FADE));
      p.lightK = (inherited?.lightK ?? 1) * (opts.light ?? 1);
      p.particleStyle = opts.particleStyle ?? inherited?.particleStyle ?? "refined";
      const tt = meta.loop ? loopTime(t, D) : Math.min(t, D);
      try {
        if (layer2 !== "front" && impl.drawBack) {
          p.layer = "back";
          impl.drawBack(p, tt, opts);
        }
        if (layer2 !== "back") {
          p.layer = "front";
          impl.draw(p, tt, opts);
        }
      } finally {
        if (saved) Object.assign(p, saved);
      }
    },
    /** Let it end: loops fade out, one-shots cut short. */
    stop() {
      if (stopAt === Infinity) stopAt = t;
    },
    done() {
      return t - stopAt >= FADE || !meta.loop && t >= D;
    }
  };
}
function composite(f, out, bg = null, lightK = 1) {
  const n = f.w * f.h, C = f.color, L = f.light, flat = typeof bg === "number";
  for (let i = 0; i < n; i++) {
    const c = C[i], l = L[i] & 16777215;
    let r, g, b, a;
    const ca = c >>> 24;
    if (ca === 255) {
      r = c & 255;
      g = c >>> 8 & 255;
      b = c >>> 16 & 255;
      a = 255;
    } else if (bg === null) {
      r = c & 255;
      g = c >>> 8 & 255;
      b = c >>> 16 & 255;
      a = ca;
    } else {
      const k = flat ? bg : bg[i], f2 = ca / 255;
      r = (c & 255) * f2 + (k & 255) * (1 - f2);
      g = (c >>> 8 & 255) * f2 + (k >>> 8 & 255) * (1 - f2);
      b = (c >>> 16 & 255) * f2 + (k >>> 16 & 255) * (1 - f2);
      a = 255;
    }
    if (l) {
      const lr = (l & 255) * lightK, lg = (l >>> 8 & 255) * lightK, lb = (l >>> 16 & 255) * lightK;
      if (a < 255) {
        const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
        const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
        if (na > 0) {
          r = Math.min(255, pr / na);
          g = Math.min(255, pg / na);
          b = Math.min(255, pb / na);
          a = na * 255;
        }
      } else {
        r = Math.min(255, r + lr);
        g = Math.min(255, g + lg);
        b = Math.min(255, b + lb);
      }
    }
    const j = i * 4;
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = a;
  }
  return out;
}
function sceneCameraOffset(offset, reducedMotion = false, transparent = false) {
  if (reducedMotion || transparent) return [0, 0];
  if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) throw new RangeError("Scene offset needs two finite pixel coordinates");
  return [Math.round(offset[0]), Math.round(offset[1])];
}

// src/core/scene.ts
var SKY = hex("#15131d");
var SKY_TOP = hex("#0d0b14");
var SKY_LOW = hex("#221d33");
var FLOOR_EDGE = hex("#4a4263");
var FLOOR = hex("#2b2639");
var FLOOR_DARK = hex("#211d2d");
var MORTAR = hex("#1a1724");
var BAYER2 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
var BACKDROPS = ["dark", "ground", "sky", "light", "black"];
function backdrop(kind, w, h, groundY = h) {
  const out = new Uint32Array(w * h);
  if (kind === "light") return out.fill(hex("#ebe8f0"));
  if (kind === "black") return out.fill(hex("#000000"));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = SKY;
      if (kind === "sky") {
        const t = y / Math.max(1, h - 1), step = t * 5 + BAYER2[(y & 3) << 2 | x & 3] / 16 | 0;
        c = mix(SKY_TOP, SKY_LOW, Math.min(1, step / 4));
        const r = rand(x, y, 77);
        if (r > 0.994) c = mix(c, hex("#cfc8ff"), 0.35 + (r - 0.994) * 90);
      }
      if (kind === "ground" && y >= groundY) {
        const gy = y - groundY;
        if (gy === 0) c = FLOOR_EDGE;
        else {
          const row = Math.floor((gy - 1) / 5), off = row % 2 ? 6 : 0;
          const mortar = (gy - 1) % 5 === 4 || (x + off) % 12 === 0;
          c = mortar ? MORTAR : gy < 3 ? FLOOR : FLOOR_DARK;
        }
      }
      out[y * w + x] = c;
    }
  return out;
}

// src/core/character-cache.ts
var scratch = /* @__PURE__ */ new Map();
var palettes = /* @__PURE__ */ new Map();
function characterScratch(w, h, ox, oy) {
  const key = `${w}:${h}`;
  let entry = scratch.get(key);
  if (!entry) {
    const frame4 = { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
    entry = { frame: frame4, painter: new Painter(frame4) };
    if (w * h <= 131072) {
      if (scratch.size >= 4) scratch.delete(scratch.keys().next().value);
      scratch.set(key, entry);
    }
  } else {
    scratch.delete(key);
    scratch.set(key, entry);
    entry.frame.ox = ox;
    entry.frame.oy = oy;
    entry.frame.color.fill(0);
    entry.frame.light.fill(0);
    entry.painter.reset();
  }
  return entry;
}
function characterPalette(colors2) {
  const key = colors2.join(",");
  let parsed = palettes.get(key);
  if (!parsed) {
    parsed = colors2.map(hex);
    if (palettes.size >= 32) palettes.delete(palettes.keys().next().value);
    palettes.set(key, parsed);
  }
  return parsed;
}

// src/core/human-appearance.ts
function humanHeadOffset(r, style, dx, dy) {
  const shape = style.faceShape ?? "oval";
  if (shape === "round") {
    dx *= 1.18;
    dy *= 0.92;
  } else if (shape === "long") {
    dx *= 0.9;
    dy *= 1.14;
  } else if (shape === "square") {
    dx *= 1.12;
    if (dy > 3 && dy < 9 && Math.abs(dx) > 1) dx += Math.sign(dx) * 1.15;
    if (dy > 6 && dy < 9) dy = 6 + (dy - 6) * 0.6;
  }
  return [r.head[0] + dx * r.scale, r.head[1] + dy * r.scale];
}
function paintHumanHair2D(p, style, r, colors2, stage) {
  const kind = style.hair;
  if (kind !== "shaved" && kind !== "ponytail" && kind !== "parted") return false;
  const { skin, hair } = colors2, back = r.view === "back", front = r.view === "front", s = r.scale;
  const pt = (x, y) => humanHeadOffset(r, style, x, y);
  const P = (a, c) => p.poly(a.map(([x, y]) => pt(x, y).map(Math.round)), c);
  const E = (x, y, rx, ry, c) => {
    const a = pt(x, y);
    p.ellipse(Math.round(a[0]), Math.round(a[1]), Math.max(0.65, rx * s), Math.max(0.65, ry * s), c);
  };
  if (stage === "behind") {
    if (kind === "ponytail") {
      if (front) P([[4, -4], [8, -3], [10, 4], [9, 14], [6, 20], [3, 18], [5, 8]], hair[0]);
      else if (back) P([[-3, -1], [3, -1], [5, 7], [3, 17], [-1, 21], [-4, 17], [-3, 7]], hair[0]);
      else P([[-6, -5], [-10, -3], [-12, 4], [-12, 12], [-8, 18], [-6, 14], [-8, 5], [-4, -1]], hair[0]);
    }
    return true;
  }
  if (kind === "shaved") {
    if (back) {
      P([[-4, -7], [3, -7], [6, -3], [6, 2], [3, 6], [0, 7], [-4, 5], [-6, 1], [-6, -3]], skin[2]);
      P([[3, -6], [6, -3], [6, 2], [3, 6], [0, 7], [2, 2]], skin[1]);
      if (r.height >= 48) P([[-4, -5], [-2, -7], [2, -7], [4, -5], [3, -4], [-3, -4]], skin[0]);
    } else if (r.height >= 48) {
      P(front ? [[-6, -3], [-6, -5], [-4, -7], [3, -7.5], [5, -5], [5, -3], [3, -5], [-3, -5]] : [[-6, -1], [-6, -4], [-4, -7], [1, -7.5], [4, -5], [3, -4], [0, -6], [-3, -4], [-4, 0]], skin[0]);
    }
    return true;
  }
  if (back) {
    P([[-5, -7], [-1, -9], [4, -8], [6, -5], [6, 2], [4, 5], [1, 7], [-2, 6], [-5, 4], [-6, 0], [-6, -4]], hair[0]);
    P([[-4, -5], [-1, -7], [2, -7], [3, -3], [0, 0], [-3, 2], [-4, -1]], hair[1]);
    if (kind === "parted") P([[0, -8], [3, -7], [5, -4], [4, 1], [2, 3], [2, -3]], hair[2]);
    else {
      E(0, 0, 3.5, 3, hair[1]);
      P([[-2, 3], [2, 3], [2, 13], [-1, 18], [-2, 13]], hair[1]);
    }
    return true;
  }
  if (kind === "parted") {
    P(front ? [[-7, 3], [-8, -3], [-5, -8], [-1, -9], [0, -7], [2, -9], [6, -7], [7, -3], [6, 3], [4, 1], [4, -4], [1, -6], [-1, -4], [-4, -3], [-5, 3]] : [[-6, 4], [-8, -2], [-6, -7], [-2, -9], [0, -7], [2, -9], [5, -6], [5, -3], [2, -4], [0, -6], [-2, -3], [-3, 3]], hair[0]);
    P(front ? [[-6, -4], [-4, -7], [-1, -8], [-1, -6], [-4, -4]] : [[-6, -4], [-4, -7], [-2, -8], [-1, -6], [-4, -3]], hair[1]);
    P(front ? [[1, -7], [3, -8], [5, -6], [5, -4], [3, -5]] : [[1, -7], [2, -8], [4, -6], [3, -5]], hair[2]);
  } else {
    P(front ? [[-6, 1], [-7, -4], [-5, -8], [1, -9], [5, -7], [7, -3], [5, 1], [4, -4], [1, -6], [-2, -5], [-4, -2], [-5, 2]] : [[-6, 3], [-7, -3], [-6, -7], [-2, -9], [3, -8], [5, -5], [4, -3], [1, -4], [-2, -4], [-3, 1]], hair[0]);
    P(front ? [[-5, -5], [-2, -7], [2, -7], [4, -5], [0, -6], [-3, -4]] : [[-5, -5], [-3, -7], [1, -7], [3, -5], [0, -5], [-3, -3]], hair[1]);
  }
  return true;
}
function paintHumanFacialHair2D(p, style, r, colors2) {
  if (!style.facialHair || style.facialHair === "none" || r.view === "back") return;
  const { skin, hair } = colors2, front = r.view === "front", side = r.view === "side";
  const P = (a, c) => p.poly(a.map(([x, y]) => humanHeadOffset(r, style, x, y).map(Math.round)), c);
  P(front ? [[-5, 2], [-3, 3], [-2, 5], [2, 5], [4, 2], [5, 2], [4, 7], [1, 10], [-2, 9], [-4, 6]] : side ? [[-2, 2], [0, 3], [2, 5], [5, 3], [6, 4], [4, 8], [1, 9], [-2, 6]] : [[-5, 2], [-2, 4], [0, 5], [3, 4], [4, 3], [4, 7], [1, 10], [-2, 8], [-4, 6]], hair[1]);
  if (r.height >= 48) P(front ? [[-3, 6], [0, 7], [3, 5], [2, 8], [0, 9], [-2, 8]] : [[-1, 6], [2, 6], [3, 5], [2, 8], [0, 8]], hair[2]);
  if (r.height >= 64) P(front ? [[-1, 4], [1, 4], [1, 5], [-1, 5]] : side ? [[4, 3], [5, 3], [5, 4], [4, 4]] : [[1, 4], [3, 4], [3, 5], [1, 5]], skin[0]);
}
function paintHumanGarment2D(p, style, r, colors2) {
  const outfit = style.outfit;
  if (outfit !== "sweater" && outfit !== "overalls") return;
  const { cloth, pants } = colors2, s = r.scale, broad = r.view === "front" || r.view === "back", back = r.view === "back", side = r.view === "side";
  const off = (a, x, y) => [Math.round(a[0] + x * s), Math.round(a[1] + y * s)];
  const P = (a, c) => p.poly(a, c), N = r.neck, C = r.chest, V = r.pelvis;
  if (outfit === "sweater") {
    if (r.height >= 48) {
      P([off(V, -8 * r.width, -2), off(V, 8 * r.width, -2), off(V, 8 * r.width, 2), off(V, -8 * r.width, 2)], cloth[0]);
      P([off(N, -4, 0), off(N, 0, 3), off(N, 4, 0), off(N, 3, 3), off(N, 0, 5), off(N, -3, 3)], cloth[0]);
    }
    return;
  }
  const l = broad ? -5 : side ? 2 : -1, rr = broad ? 5 : side ? 6 : 6;
  P([off(C, l, back ? 5 : 1), off(C, rr, back ? 5 : 1), off(V, side ? 5 : 8 * r.width, 2), off(V, side ? -5 : -8 * r.width, 2)], pants[1]);
  if (broad) {
    P([off(r.leftShoulder, 1, 0), off(r.leftShoulder, 3, 0), off(C, -3, 5), off(C, -5, 5)], pants[2]);
    P([off(r.rightShoulder, -3, 0), off(r.rightShoulder, -1, 0), off(C, 5, 5), off(C, 3, 5)], pants[0]);
  } else {
    P([off(N, 0, 1), off(N, 2, 1), off(C, rr, 5), off(C, rr - 2, 5)], pants[2]);
  }
  if (r.height >= 64 && !back) P([off(C, l + 1, 7), off(C, rr - 1, 7), off(C, rr - 1, 10), off(C, l + 2, 11)], pants[2]);
}
function paintHumanAppearanceEyes2D(p, style, r, colors2) {
  if (r.view === "back" || (!style.faceShape || style.faceShape === "oval") && style.facialHair !== "beard" && !["shaved", "ponytail", "parted"].includes(style.hair ?? "")) return;
  const gaze = Math.max(-1, Math.min(1, r.pose.gaze ?? 0)), c = r.pose.blink ? colors2.skin[0] : hex("#3b3038");
  const dot2 = (x, y) => {
    const q = humanHeadOffset(r, style, x, y);
    p.px(Math.round(q[0]), Math.round(q[1]), c);
  };
  if (r.view === "front") {
    dot2(-2.8 + gaze, 0.2);
    dot2(2.6 + gaze, 0.2);
  } else if (r.view === "side") dot2(3.2 + 0.5 * gaze, -0.5);
  else {
    dot2(-0.5 + 0.6 * gaze, 0.2);
    if (r.height >= 48) dot2(3.6 + 0.3 * gaze, 0.2);
  }
}

// src/core/human-view.ts
function paintHumanView2D(p, style, r, colors2) {
  const { skin, hair, cloth, pants, shoe } = colors2, s = r.scale, wf = r.width, side = r.view === "side", back = r.view === "back";
  const gaze = Math.max(-1, Math.min(1, r.pose.gaze ?? 0));
  const outfit = style.outfit ?? "shirt", hairStyle = style.hair ?? "swept";
  const P = (v, c) => p.poly(v.map((q) => [Math.round(q[0]), Math.round(q[1])]), c);
  const L = (v, c) => p.polyline(v.map((q) => [Math.round(q[0]), Math.round(q[1])]), c);
  const D = (v, c) => p.px(Math.round(v[0]), Math.round(v[1]), c);
  const off = (v, dx, dy) => v === r.head ? humanHeadOffset(r, style, dx, dy) : [v[0] + dx * s, v[1] + dy * s];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const E = (v, rx, ry, c) => p.ellipse(Math.round(v[0]), Math.round(v[1]), Math.max(0.65, rx * s), Math.max(0.65, ry * s), c);
  function limb(a, b, wa, wb, c) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d * s, ny = (b[0] - a[0]) / d * s;
    P([[a[0] + nx * wa, a[1] + ny * wa], [b[0] + nx * wb, b[1] + ny * wb], [b[0] - nx * wb, b[1] - ny * wb], [a[0] - nx * wa, a[1] - ny * wa]], c);
    E(a, wa, wa, c);
    E(b, wb, wb, c);
  }
  function leg(near) {
    const a = near ? r.leftHip : r.rightHip, b = near ? r.leftKnee : r.rightKnee, c = near ? r.leftAnkle : r.rightAnkle, tone = near ? 1 : 0;
    limb(a, b, 4.3 * wf, 3.25 * wf, pants[tone]);
    limb(b, c, 3.25 * wf, 2.35 * wf, pants[tone]);
    if (near && r.height >= 48) {
      limb(off(lerp3(a, b, 0.15), -1, 0), off(lerp3(a, b, 0.83), -0.8, 0), 1.1, 0.75, pants[2]);
      limb(off(lerp3(b, c, 0.18), -0.7, 0), off(lerp3(b, c, 0.88), -0.6, 0), 0.8, 0.6, pants[2]);
    }
    if (back) {
      P([off(c, -2.6, -1.8), off(c, 2.6, -1.8), off(c, 3.6, 1.5), off(c, 3.6, 4), off(c, -3.6, 4), off(c, -3.6, 1.5)], shoe[near ? 1 : 0]);
      if (near && r.height >= 48) L([off(c, -2, 1), off(c, 2, 1)], shoe[2]);
      L([off(c, -3, 3), off(c, 3, 3)], shoe[0]);
    } else {
      P([off(c, -2.4, -1.7), off(c, 2.4, -1.7), off(c, 3.3, 1), off(c, 7, 2), off(c, 7, 4), off(c, -3, 4), off(c, -3, 1)], shoe[near ? 1 : 0]);
      if (near && r.height >= 48) L([off(c, -1, 0), off(c, 3, 1)], shoe[2]);
      L([off(c, -2, 3), off(c, 6, 3)], shoe[0]);
    }
  }
  function arm(near) {
    const a = near ? r.leftShoulder : r.rightShoulder, b = near ? r.leftElbow : r.rightElbow, c = near ? r.leftHand : r.rightHand, tone = near ? 2 : 1;
    limb(a, b, 3.45 * wf, 2.65 * wf, skin[tone]);
    limb(b, c, 2.65 * wf, 1.8 * wf, skin[tone]);
    if (near && r.height >= 56) limb(off(lerp3(b, c, 0.2), -0.5, 0), off(lerp3(b, c, 0.8), -0.5, 0), 0.75, 0.6, skin[3]);
    const cut = outfit === "sleeveless" ? 0.12 : outfit === "sweater" ? 1 : outfit === "jacket" ? 0.94 : 0.48, end = lerp3(a, b, cut);
    limb(a, end, (outfit === "sweater" ? 4.7 : 4) * wf, (outfit === "sweater" ? 3.7 : 3.15) * wf, cloth[near ? 1 : 0]);
    if (outfit === "jacket" || outfit === "sweater") limb(b, lerp3(b, c, 0.82), 3.1 * wf, 2.25 * wf, cloth[near ? 1 : 0]);
    if (near && r.height >= 56) limb(off(lerp3(a, end, 0.1), -0.8, 0), off(lerp3(a, end, 0.8), -0.8, 0), 1.1, 0.75, cloth[2]);
    const d = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1, ux = (c[0] - b[0]) / d, uy = (c[1] - b[1]) / d;
    const fist = r.pose.fists === true, reach = fist ? 2.4 : 3.6;
    limb(c, [c[0] + ux * reach * s, c[1] + uy * reach * s], fist ? 2.2 : 1.8, fist ? 2 : 1.5, skin[tone]);
    if (near && r.height >= 64) E([c[0] - uy * 1.8 * s + ux * s, c[1] + ux * 1.8 * s + uy * s], 1, 1.3, skin[tone]);
  }
  const H = r.head, N = r.neck, C = r.chest, V = r.pelvis, half = (back ? 10 : side ? 6.8 : 9.2) * wf;
  paintHumanHair2D(p, style, r, colors2, "behind");
  if (!back && hairStyle === "bob") P([off(H, -6, -5), off(H, 2, -6), off(H, 4, 13), off(H, -1, 16), off(H, -7, 13), off(H, -8, 1)], hair[0]);
  if (!back && hairStyle === "bun") E(off(H, -5.5, -7), 4.1, 3.8, hair[0]);
  arm(false);
  if (back) arm(true);
  leg(false);
  P([off(V, -half, -4), off(V, half, -4), off(V, half, 4), off(V, 1, 8), off(V, -half, 4)], pants[1]);
  leg(true);
  P([off(N, -2.5, 0), off(C, -half, -5), off(C, -half - 1, 4), off(V, -half + 1, -6), off(V, -half, 2), off(V, half, 2), off(V, half - 1, -6), off(C, half, 1), off(C, half - 1, -6), off(N, 2.5, 0)], cloth[1]);
  P([off(N, -2, 1), off(C, -half, -4), off(C, -half - 1, 4), off(V, -half + 1, -5), off(V, -half, 1), off(V, -half + 3, 1), off(C, -half + 4, -1)], cloth[0]);
  P([off(N, 1, 1), off(C, half - 2, -4), off(C, half - 1, 1), off(C, half - 3, 7), off(V, 2, -3), off(C, 0, 1)], cloth[2]);
  if (!back && outfit === "jacket" && r.height >= 48) {
    P([off(N, 1, 1), off(N, 3, 1), off(V, half - 1, 0), off(V, half - 4, 0), off(C, 3, 3)], hex("#c8b99a"));
    L([off(N, 3, 2), off(C, half - 1, -1), off(C, 3, 5)], cloth[0]);
  }
  if (outfit === "tunic") {
    P([off(V, -half, -3), off(V, half, -3), off(V, half + 2, 12), off(V, 2, 13), off(V, 0, 8), off(V, -half - 2, 12)], cloth[1]);
    P([off(V, -half, -2), off(V, -half + 3, -2), off(V, -half + 1, 11), off(V, -half - 2, 11)], cloth[0]);
  }
  if (r.height >= 72) L([off(V, -half + 2, 0), off(V, 1, 1), off(V, half - 1, 0)], cloth[0]);
  paintHumanGarment2D(p, style, r, colors2);
  if (r.pose.armsFront) arm(false);
  if (!back || r.pose.armsFront) arm(true);
  if (back) P([off(N, -2.8, -5), off(N, 2.8, -5), off(N, 3, 0), off(N, 1.8, 1.3), off(N, -1.8, 1.3), off(N, -3, 0)], skin[1]);
  else P([off(N, -2.5, -5), off(N, 2.5, -5), off(N, 3, 1), off(N, 0, 3), off(N, -3, 1)], skin[1]);
  P([off(N, -1, -3), off(N, 1.6, -3), off(N, 2, 1), off(N, 0, 2)], skin[2]);
  if (back) {
    E(off(H, -6, 0.5), 1.1, 1.7, skin[2]);
    E(off(H, 6, 0.5), 1.1, 1.7, skin[1]);
    if (paintHumanHair2D(p, style, r, colors2, "head")) {
    } else if (hairStyle === "bob") {
      P([off(H, -5, -8), off(H, 2, -9), off(H, 6, -6), off(H, 7, 2), off(H, 8, 14), off(H, 3, 17), off(H, -3, 16), off(H, -8, 13), off(H, -7, -3)], hair[0]);
      P([off(H, -4, -6), off(H, 0, -7), off(H, 1, 2), off(H, 2, 14), off(H, -3, 13), off(H, -5, 5)], hair[1]);
      if (r.height >= 48) L([off(H, -3, -5), off(H, -2, 2), off(H, -2, 10)], hair[2]);
    } else if (hairStyle === "curls") {
      P([off(H, -6, 4), off(H, -8, 0), off(H, -8, -5), off(H, -6, -8), off(H, -2, -10), off(H, 1, -9), off(H, 5, -9), off(H, 7, -6), off(H, 8, -2), off(H, 6, 4), off(H, 3, 7), off(H, 0, 6), off(H, -3, 7)], hair[0]);
      for (const [xx, yy] of [[-5, -5], [-2, -7], [2, -6], [-4, 0], [0, -2], [3, 2]]) E(off(H, xx, yy), 1.6, 1.4, hair[1]);
    } else {
      P([off(H, -5, -7), off(H, -1, -9), off(H, 4, -8), off(H, 6, -5), off(H, 6, 2), off(H, 4, 5), off(H, 2, 7), off(H, 0, 6), off(H, -2, 7), off(H, -5, 4), off(H, -6, 0), off(H, -6, -4)], hair[0]);
      P([off(H, -4, -5), off(H, -1, -7), off(H, 3, -6), off(H, 3, -3), off(H, 0, 0), off(H, -3, 2), off(H, -4, -1)], hair[1]);
      if (r.height >= 48) L([off(H, -3, -5), off(H, 0, -6), off(H, 2, -5)], hair[2]);
      if (hairStyle === "bun") {
        E(off(H, 0, -6.5), 4.4, 4, hair[1]);
        E(off(H, -1.2, -7.3), 2.2, 1.7, hair[2]);
      }
    }
  } else if (side) {
    P([off(H, -4, -7), off(H, 2, -7), off(H, 5, -4.5), off(H, 5, -1.5), off(H, 8, 0), off(H, 6, 1.5), off(H, 6, 4), off(H, 3.5, 6.5), off(H, 0, 7), off(H, -3, 5.5), off(H, -6, 1), off(H, -6, -4)], skin[2]);
    P([off(H, -5, -3), off(H, -1, -3), off(H, -1, 3), off(H, 2, 6), off(H, 0, 7), off(H, -3, 5.5), off(H, -6, 1)], skin[1]);
    if (r.height >= 48) P([off(H, 1, -3), off(H, 4, -3), off(H, 4, -1), off(H, 2, 1), off(H, 1, 3)], skin[3]);
    E(off(H, -1.5, 0.5), 1.5, 2, skin[2]);
    D(off(H, 3.2 + 0.5 * gaze, -0.5), r.pose.blink ? skin[0] : hex("#3b3038"));
    if (r.height >= 64) {
      D(off(H, -1.5, 0.5), skin[0]);
      L([off(H, 4.5, 3.5), off(H, 6, 3.5)], skin[0]);
    }
  } else {
    P([off(H, -4.5, -7), off(H, 2.5, -7.5), off(H, 5, -4), off(H, 5, -1), off(H, 7, 1), off(H, 5, 2), off(H, 4.5, 5), off(H, 1.5, 7.5), off(H, -1.5, 7), off(H, -5, 4), off(H, -6, 0), off(H, -6, -4)], skin[2]);
    P([off(H, -5, -4), off(H, -2, -4), off(H, -2, 2), off(H, 0, 5.5), off(H, 1.5, 7.5), off(H, -1.5, 7), off(H, -5, 4), off(H, -6, 0)], skin[1]);
    if (r.height >= 48) P([off(H, 0, -3), off(H, 3, -4), off(H, 4, -1), off(H, 2, 2), off(H, 0, 1)], skin[3]);
    E(off(H, -5.5, 0.5), 1.2, 1.9, skin[2]);
    D(off(H, -0.5 + 0.6 * gaze, 0.2), r.pose.blink ? skin[0] : hex("#3b3038"));
    if (r.height >= 48) D(off(H, 3.6 + 0.3 * gaze, 0.2), r.pose.blink ? skin[0] : hex("#3b3038"));
    if (r.height >= 64) {
      D(off(H, 4, 2), skin[1]);
      L([off(H, 1, 5), off(H, 3, 5)], skin[0]);
    }
  }
  if (back) return;
  paintHumanFacialHair2D(p, style, r, colors2);
  if (paintHumanHair2D(p, style, r, colors2, "head")) {
  } else if (hairStyle === "crop") {
    P([off(H, -6, 1), off(H, -7, -4), off(H, -5, -7), off(H, 0, -9), off(H, 4, -7), off(H, 5, -4), off(H, 2, -4), off(H, 0, -5), off(H, -3, -2), off(H, -3, 1)], hair[0]);
    P([off(H, -5, -5), off(H, -2, -7), off(H, 1, -7), off(H, 2, -5), off(H, -1, -4)], hair[1]);
  } else if (hairStyle === "curls") {
    P([off(H, -6, 2), off(H, -8, -2), off(H, -8, -6), off(H, -5, -8), off(H, -3, -10), off(H, 0, -9), off(H, 3, -9), off(H, 5, -6), off(H, 4, -3), off(H, 1, -3), off(H, -1, -4), off(H, -3, -1), off(H, -3, 2)], hair[0]);
    for (const [x, y] of [[-5, -6], [-2, -8], [1, -7], [3, -5]]) E(off(H, x, y), 1.4, 1, hair[1]);
  } else if (hairStyle === "bob") {
    P([off(H, -7, 8), off(H, -8, -3), off(H, -5, -8), off(H, 1, -9), off(H, 5, -6), off(H, 5, -3), off(H, 2, -4), off(H, -1, -3), off(H, -3, 0), off(H, -3, 7), off(H, -5, 9)], hair[1]);
    P([off(H, -6, -4), off(H, -4, -7), off(H, 0, -8), off(H, 3, -6), off(H, -1, -5), off(H, -4, -1)], hair[2]);
  } else {
    P([off(H, -6, 3), off(H, -7, -3), off(H, -6, -7), off(H, -2, -9), off(H, 3, -9), off(H, 6, -6), off(H, 4, -3), off(H, 1, -4), off(H, -2, -2), off(H, -3, 2)], hair[0]);
    P([off(H, -5, -5), off(H, -2, -7), off(H, 2, -8), off(H, 4, -6), off(H, 0, -5), off(H, -3, -3)], hair[1]);
    if (r.height >= 72) L([off(H, -3, -6), off(H, 0, -7), off(H, 2, -7)], hair[2]);
  }
}

// src/core/human.ts
var SKIN = {
  light: ["#b78070", "#d9a18b", "#edbea0", "#f4caaa"],
  warm: ["#985d49", "#bc805d", "#d7a174", "#e5b685"],
  brown: ["#70463e", "#96634e", "#b78464", "#c79975"],
  deep: ["#47353b", "#684a41", "#885f4e", "#a07860"]
};
var HAIR = {
  dark: ["#282630", "#3b343e", "#52434b"],
  chestnut: ["#533b37", "#7b4e3b", "#a36c48"],
  gold: ["#916638", "#bd914e", "#e1bf72"],
  silver: ["#727782", "#a3aab2", "#d6d8cf"]
};
var finite = (x, name) => {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be finite`);
  return x;
};
var coordinate = (x, name) => {
  finite(x, name);
  if (Math.abs(x) > 4096) throw new RangeError(`${name} must be within -4096..4096`);
  return x;
};
var colorValid = (c) => typeof c === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
function validate(style, pose) {
  for (const [key, allowed] of Object.entries({ view: ["front", "three-quarter", "side", "back"], facing: ["right", "left"], build: ["slender", "regular", "broad"], skin: Object.keys(SKIN), hair: ["crop", "bob", "curls", "swept", "bun", "shaved", "ponytail", "parted"], faceShape: ["oval", "round", "square", "long"], facialHair: ["none", "beard"], hairColor: Object.keys(HAIR), outfit: ["shirt", "tunic", "jacket", "sleeveless", "sweater", "overalls"] })) {
    const value = style[key];
    if (value !== void 0 && !allowed.includes(value)) throw new RangeError(`Unknown human ${key}: ${value}`);
  }
  if (style.skinRamp !== void 0 && (!Array.isArray(style.skinRamp) || style.skinRamp.length !== 4 || !style.skinRamp.every(colorValid))) throw new TypeError("skinRamp needs four hex colors");
  for (const key of ["cloth", "trousers", "hairRamp", "shoeRamp"]) {
    const v = style[key];
    if (v !== void 0 && (!Array.isArray(v) || v.length !== 3 || !Array.from(v).every(colorValid))) throw new TypeError(`${key} must contain three #rgb or #rrggbb colors`);
  }
  if (style.outline !== void 0 && style.outline !== null && !colorValid(style.outline)) throw new TypeError("outline must be null or a #rgb or #rrggbb color");
  if (pose.fists !== void 0 && typeof pose.fists !== "boolean") throw new TypeError("fists must be boolean");
  for (const key of ["leftElbow", "rightElbow", "leftKnee", "rightKnee"]) {
    const v = pose[key];
    if (v !== void 0 && v !== -1 && v !== 1) throw new RangeError(`${key} must be -1 or 1`);
  }
}
function point(p, name) {
  if (!Array.isArray(p) || p.length !== 2) throw new TypeError(`${name} must be [x,y]`);
  return [coordinate(p[0], name), coordinate(p[1], name)];
}
var lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function ik(root, target, a, b, side) {
  const dx = target[0] - root[0], dy = target[1] - root[1], d = Math.hypot(dx, dy);
  const reach = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, d));
  const ux = d < 1e-8 ? 0 : dx / d, uy = d < 1e-8 ? 1 : dy / d, c = (a * a - b * b + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(0, a * a - c * c));
  return {
    joint: [root[0] + ux * c - uy * h * side, root[1] + uy * c + ux * h * side],
    end: [root[0] + ux * reach, root[1] + uy * reach],
    clamped: Math.abs(reach - d) > 1e-3
  };
}
function humanRig2D(style = {}, pose = {}) {
  validate(style, pose);
  if (style.facing === "left") return mirrorHumanRig(humanRig2D({ ...style, facing: "right" }, pose));
  const height = finite(style.height ?? 96, "height");
  if (height < 32 || height > 192) throw new RangeError("human height must be 32..192 pixels");
  const view = style.view ?? "front";
  const broadView = view === "front" || view === "back";
  const shoulderSpread = broadView ? 11.4 : view === "three-quarter" ? 7.6 : 1.8;
  const hipSpread = broadView ? 5.6 : view === "three-quarter" ? 4 : 1.6;
  const footSpread = broadView ? 8.5 : view === "three-quarter" ? 5.5 : 3;
  const handSpread = broadView ? 17.5 : view === "three-quarter" ? 11 : 3.5;
  const s = height / 96, width = style.build === "broad" ? 1.15 : style.build === "slender" ? 0.86 : 1;
  const x = coordinate(pose.x ?? 0, "x"), lean = coordinate(pose.lean ?? 0, "lean");
  if (Math.abs(lean) > 32) throw new RangeError("lean must be within -32..32 canonical pixels");
  let y = coordinate(pose.y ?? 0, "y");
  for (const [hipX, foot] of [[x + lean * 0.25 - hipSpread * width, pose.leftFoot ?? [x - footSpread * width, -4]], [x + lean * 0.25 + hipSpread * width, pose.rightFoot ?? [x + footSpread * width, -4]]]) {
    point(foot, "foot");
    const dx = hipX - foot[0], reach = 40.7 - 1e-3;
    if (Math.abs(dx) < reach) y = Math.max(y, foot[1] - Math.sqrt(reach * reach - dx * dx) + 44.5);
  }
  finite(pose.gaze ?? 0, "gaze");
  const at = (xx, yy) => [(x + xx) * s, (y + yy) * s];
  const chest = at(lean, -68), pelvis = at(lean * 0.25, -44.5), neck = at(lean, -78.4), head = at(lean * 0.85 + (view === "side" ? 1.4 : view === "three-quarter" ? 1 : 0), -88.5);
  const ls = at(lean - shoulderSpread * width, -74), rs = at(lean + shoulderSpread * width, -74), lh = at(lean * 0.25 - hipSpread * width, -44.5), rh = at(lean * 0.25 + hipSpread * width, -44.5);
  const target = (v) => {
    const p = point(v, "target");
    return [p[0] * s, p[1] * s];
  };
  const armA = 18.2 * s, armB = 16.6 * s, legA = 20.2 * s, legB = 20.5 * s;
  const la = ik(ls, target(pose.leftHand ?? [x - handSpread * width, y - 40]), armA, armB, pose.leftElbow ?? 1);
  const ra = ik(rs, target(pose.rightHand ?? [x + handSpread * width, y - 40]), armA, armB, pose.rightElbow ?? -1);
  const ll = ik(lh, target(pose.leftFoot ?? [x - footSpread * width, -4]), legA, legB, pose.leftKnee ?? (broadView ? 1 : -1));
  const rl = ik(rh, target(pose.rightFoot ?? [x + footSpread * width, -4]), legA, legB, pose.rightKnee ?? -1);
  return {
    height,
    scale: s,
    width,
    view,
    facing: "right",
    pose,
    head,
    neck,
    chest,
    pelvis,
    leftShoulder: ls,
    rightShoulder: rs,
    leftElbow: la.joint,
    rightElbow: ra.joint,
    leftHand: la.end,
    rightHand: ra.end,
    leftHip: lh,
    rightHip: rh,
    leftKnee: ll.joint,
    rightKnee: rl.joint,
    leftAnkle: ll.end,
    rightAnkle: rl.end,
    lengths: { upperArm: armA, forearm: armB, thigh: legA, shin: legB },
    clamped: [["leftHand", la], ["rightHand", ra], ["leftFoot", ll], ["rightFoot", rl]].filter(([, v]) => v.clamped).map(([k]) => k)
  };
}
function mirrorHumanRig(r) {
  const out = { ...r, facing: "left" };
  for (const key of ["head", "neck", "chest", "pelvis", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftHand", "rightHand", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"]) out[key] = [-r[key][0], r[key][1]];
  return out;
}
function mirrorHumanSprite(sp) {
  const pixels = new Uint32Array(sp.pixels.length), data = new Uint8Array(sp.mask.data.length);
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
    const from = y * sp.w + x, to = y * sp.w + (sp.w - 1 - x);
    pixels[to] = sp.pixels[from];
    data[to] = sp.mask.data[from];
  }
  return { ...sp, x: -sp.x - sp.w, pixels, mask: { w: sp.w, h: sp.h, data }, rig: mirrorHumanRig(sp.rig) };
}
function humanMotion2D(motion, t, reducedMotion = false) {
  finite(t, "time");
  if (!["idle", "walk", "wave", "guard", "crouch"].includes(motion)) throw new RangeError(`Unknown human motion: ${motion}`);
  const phase = (t % 2 + 2) % 2 / 2, a = phase * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
  const blink = phase > 0.79 && phase < 0.835;
  if (reducedMotion) return { blink: false };
  switch (motion) {
    case "walk":
      return {
        y: -0.8 * (1 - Math.cos(a * 2)),
        lean: 1.5,
        leftFoot: [-8 + 8 * s, -4 - 6 * Math.max(0, c)],
        rightFoot: [8 - 8 * s, -4 - 6 * Math.max(0, -c)],
        leftHand: [-17 - 5 * s, -45 - c],
        rightHand: [17 + 5 * s, -45 + c],
        blink
      };
    case "wave":
      return { lean: -1, y: -0.4 * (1 - c), leftHand: [-18, -41], rightHand: [25 + 3 * s, -91 + 1.5 * c], rightElbow: 1, gaze: 0.25, blink };
    case "guard":
      return { lean: 2, y: 2 + 0.5 * s, leftFoot: [-15, -4], rightFoot: [17, -4], leftHand: [-8, -68 + 0.7 * c], rightHand: [11, -67 + 0.7 * s], armsFront: true, blink };
    case "crouch":
      return { lean: 4, y: 10 + 0.6 * s, leftFoot: [-20, -4], rightFoot: [21, -4], leftHand: [-18, -33], rightHand: [20, -33], armsFront: true, blink };
    default:
      return { lean: 0.6 * s, y: -0.5 * (1 - c), leftHand: [-18, -41 - 0.5 * (1 - c)], rightHand: [18, -41 - 0.5 * (1 - c)], blink };
  }
}
function humanViewMotion2D(view, motion, t, reducedMotion = false) {
  if (!["front", "three-quarter", "side", "back"].includes(view)) throw new RangeError(`Unknown human view: ${view}`);
  if (view === "front") return humanMotion2D(motion, t, reducedMotion);
  if (view === "back") {
    const base = humanMotion2D(motion, t, reducedMotion);
    if (reducedMotion) return base;
    if (motion !== "walk") return { ...base, armsFront: false, gaze: 0 };
    const a2 = (t % 2 + 2) % 2 / 2 * Math.PI * 2, sw2 = Math.sin(a2), co2 = Math.cos(a2);
    return { ...base, leftFoot: [-6 + 1.5 * sw2, -4 - 3 * Math.max(0, co2)], rightFoot: [6 - 1.5 * sw2, -4 - 3 * Math.max(0, -co2)], leftHand: [-16 + 0.7 * sw2, -40.8 + 0.4 * co2], rightHand: [16 - 0.7 * sw2, -40.8 - 0.4 * co2], armsFront: false };
  }
  humanMotion2D(motion, t);
  const u = (t % 2 + 2) % 2 / 2, a = u * Math.PI * 2, sw = Math.sin(a), co = Math.cos(a), side = view === "side";
  const rest = { leftHand: side ? [2, -41] : [-10, -41], rightHand: side ? [5, -42] : [11, -42], leftFoot: side ? [-2.5, -4] : [-5, -4], rightFoot: side ? [3.5, -4] : [6, -4], leftKnee: -1, rightKnee: -1 };
  if (reducedMotion) return { ...rest, blink: false };
  const blink = u > 0.79 && u < 0.835;
  if (motion === "walk") {
    const foot = (phase, offset) => {
      const v = phase % 1, span = side ? 10 : 8;
      return [offset + (v < 0.5 ? span - 4 * span * v : -span + 4 * span * (v - 0.5)), -4 - (v < 0.5 ? 0 : 6 * Math.sin((v - 0.5) * Math.PI * 2))];
    };
    const left = foot(u, side ? 0 : -3), right = foot((u + 0.5) % 1, side ? 0 : 3);
    const lean = side ? 2 : 1.2, rootY = 1 + 0.6 * Math.cos(a * 2);
    const hand = (near, footX) => {
      const spread = side ? 1.8 : 7.6, offset = side ? 0 : near ? -3 : 3, theta = -(side ? 0.33 : 0.22) * (footX - offset) / (side ? 10 : 8), bend = side ? 0.18 : 0.14;
      return [lean + (near ? -spread : spread) + 0.975 * (18.2 * Math.sin(theta) + 16.6 * Math.sin(theta + bend)), rootY - 74 + 0.975 * (18.2 * Math.cos(theta) + 16.6 * Math.cos(theta + bend))];
    };
    return { lean, y: rootY, leftFoot: left, rightFoot: right, leftHand: hand(true, left[0]), rightHand: hand(false, right[0]), leftElbow: 1, rightElbow: 1, leftKnee: -1, rightKnee: -1, blink };
  }
  if (motion === "wave") return { ...rest, lean: -0.4, leftHand: side ? [18 + 2 * sw, -88 + co] : [-10, -41], rightHand: side ? [5, -42] : [23 + 2 * sw, -90 + co], leftElbow: 1, rightElbow: 1, blink };
  if (motion === "guard") return { ...rest, lean: 2, y: 2 + 0.4 * sw, leftHand: side ? [14, -66] : [3, -66], rightHand: side ? [10, -69] : [13, -68], leftFoot: side ? [-9, -4] : [-10, -4], rightFoot: side ? [11, -4] : [13, -4], leftElbow: 1, rightElbow: 1, armsFront: true, blink };
  if (motion === "crouch") return { ...rest, lean: 6, y: 11 + 0.4 * sw, leftHand: side ? [17, -34] : [-8, -33], rightHand: side ? [20, -36] : [15, -35], leftFoot: side ? [-6, -4] : [-12, -4], rightFoot: side ? [14, -4] : [16, -4], leftElbow: 1, rightElbow: 1, armsFront: true, blink };
  return { ...rest, lean: 0.3 * sw, y: 0.3 * (1 - co), blink };
}
function renderHuman2D(style = {}, pose = {}) {
  if (style.facing === "left") return mirrorHumanSprite(renderHuman2D({ ...style, facing: "right" }, pose));
  const r = humanRig2D(style, pose), s = r.scale, wf = r.width;
  const joints = [r.head, r.neck, r.chest, r.pelvis, r.leftShoulder, r.rightShoulder, r.leftElbow, r.rightElbow, r.leftHand, r.rightHand, r.leftHip, r.rightHip, r.leftKnee, r.rightKnee, r.leftAnkle, r.rightAnkle];
  const pad = Math.ceil((style.hair === "ponytail" ? 23 : style.faceShape && style.faceShape !== "oval" ? 17 : 14) * s) + 3, x = Math.floor(Math.min(...joints.map((p2) => p2[0]))) - pad, y = Math.floor(Math.min(...joints.map((p2) => p2[1]))) - pad;
  const w = Math.ceil(Math.max(...joints.map((p2) => p2[0]))) - x + pad + 1, h = Math.ceil(Math.max(...joints.map((p2) => p2[1]))) - y + pad + 1;
  if (w * h > 1e6) throw new RangeError("Human pose exceeds the 1 million pixel sprite budget");
  const { frame: frame4, painter: p } = characterScratch(w, h, x, y), skin = characterPalette(style.skinRamp ?? SKIN[style.skin ?? "warm"]), hair = characterPalette(style.hairRamp ?? HAIR[style.hairColor ?? "dark"]);
  const cloth = characterPalette(style.cloth ?? ["#34556d", "#507e91", "#7aa6aa"]), pants = characterPalette(style.trousers ?? ["#3c414f", "#545966", "#727981"]);
  const shoe = characterPalette(style.shoeRamp ?? ["#3b3034", "#57413a", "#78604a"]), outfit = style.outfit ?? "shirt", hairStyle = style.hair ?? "swept";
  if (r.view !== "front") {
    paintHumanView2D(p, style, r, { skin, hair, cloth, pants, shoe });
  } else {
    let segment2 = function(a, b, wa, wb, color) {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d * s, ny = (b[0] - a[0]) / d * s;
      P([[a[0] + nx * wa, a[1] + ny * wa], [b[0] + nx * wb, b[1] + ny * wb], [b[0] - nx * wb, b[1] - ny * wb], [a[0] - nx * wa, a[1] - ny * wa]], color);
      ell(a, wa, wa, color);
      ell(b, wb, wb, color);
    }, leg2 = function(side) {
      const l = side === "left", hip = l ? r.leftHip : r.rightHip, knee = l ? r.leftKnee : r.rightKnee, ankle = l ? r.leftAnkle : r.rightAnkle;
      segment2(hip, knee, 4.7 * wf, 3.6 * wf, pants[l ? 1 : 0]);
      segment2(knee, ankle, 3.6 * wf, 2.5 * wf, pants[l ? 1 : 0]);
      if (r.height >= 48) {
        segment2(off(hip, -1.2, 1), off(lerp(hip, knee, 0.85), -1, 0), 1.2 * wf, 1 * wf, pants[l ? 2 : 1]);
        segment2(off(knee, -0.8, 2), off(ankle, -0.6, -1), 1, 0.7, pants[l ? 2 : 1]);
      }
      const dir = l ? -1 : 1;
      P([off(ankle, -2.8, -1), off(ankle, 2.8, -1), off(ankle, dir * 6, 2.7), off(ankle, dir * 6, 4), off(ankle, -dir * 3, 4), off(ankle, -dir * 3, 1)], shoe[1]);
      line([off(ankle, -dir * 2, 3), off(ankle, dir * 5, 3)], shoe[0]);
      if (r.height >= 64) line([off(ankle, -dir, 0), off(ankle, dir * 3, 1)], shoe[2]);
    }, arm2 = function(side) {
      const l = side === "left", a = l ? r.leftShoulder : r.rightShoulder, b = l ? r.leftElbow : r.rightElbow, c = l ? r.leftHand : r.rightHand;
      const tone = l ? 2 : 1;
      segment2(a, b, 3.4 * wf, 2.65 * wf, skin[tone]);
      segment2(b, c, 2.65 * wf, 1.8 * wf, skin[tone]);
      if (r.height >= 48) {
        segment2(off(lerp(b, c, 0.15), -0.6, -0.2), off(lerp(b, c, 0.83), -0.6, 0), 0.8, 0.6, skin[Math.min(3, tone + 1)]);
      }
      const sleeve = outfit === "sleeveless" ? 0.16 : outfit === "sweater" ? 1 : outfit === "jacket" ? 0.93 : 0.52;
      const end = lerp(a, b, sleeve);
      segment2(a, end, (outfit === "sweater" ? 4.8 : 4.2) * wf, (outfit === "sweater" ? 3.8 : 3.2) * wf, cloth[l ? 1 : 0]);
      if (outfit === "jacket" || outfit === "sweater") {
        segment2(b, lerp(b, c, 0.82), 3.1 * wf, 2.3 * wf, cloth[l ? 1 : 0]);
      }
      if (r.height >= 64) segment2(off(a, -1, -0.4), off(end, -1, 0), 1.2, 1, cloth[l ? 2 : 1]);
      const d = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1, ux = (c[0] - b[0]) / d, uy = (c[1] - b[1]) / d;
      const fist = pose.fists === true, reach = fist ? 2.6 : 3.9;
      const endHand = [c[0] + ux * reach * s, c[1] + uy * reach * s];
      segment2(c, endHand, fist ? 2.3 : 1.9, fist ? 2.1 : 1.6, skin[tone]);
      if (r.height >= 56) {
        const thumb = [c[0] - uy * 2.4 * s + ux * s, c[1] + ux * 2.4 * s + uy * s];
        ell(thumb, 1.1, 1.4, skin[tone]);
      }
    };
    var segment = segment2, leg = leg2, arm = arm2;
    const P = (v, color) => p.poly(v.map((q) => [Math.round(q[0]), Math.round(q[1])]), color);
    const line = (v, color) => p.polyline(v.map((q) => [Math.round(q[0]), Math.round(q[1])]), color);
    const dot2 = (v, color) => p.px(Math.round(v[0]), Math.round(v[1]), color);
    const ell = (v, rx, ry, color) => p.ellipse(Math.round(v[0]), Math.round(v[1]), Math.max(0.6, rx * s), Math.max(0.6, ry * s), color);
    const off = (v, dx, dy) => v === r.head ? humanHeadOffset(r, style, dx, dy) : [v[0] + dx * s, v[1] + dy * s];
    const colors2 = { skin, hair, cloth, pants, shoe };
    paintHumanHair2D(p, style, r, colors2, "behind");
    if (hairStyle === "bob") P([off(r.head, -7, -4), off(r.head, 7, -4), off(r.head, 9, 15), off(r.head, 5, 17), off(r.head, -8, 15)], hair[0]);
    if (hairStyle === "bun") ell(off(r.head, 5, -8), 4.8, 4.2, hair[0]);
    P([off(r.pelvis, -9 * wf, -4), off(r.pelvis, 9 * wf, -4), off(r.pelvis, 9 * wf, 5), off(r.pelvis, 0, 9), off(r.pelvis, -9 * wf, 5)], pants[1]);
    leg2("right");
    leg2("left");
    arm2("right");
    arm2("left");
    const L = r.leftShoulder, R = r.rightShoulder, V = r.pelvis;
    P([off(L, -1, -1), off(r.neck, -3.5, 1), off(r.neck, 3.5, 1), off(R, 1, -1), off(R, 0, 9), off(V, 8.8 * wf, -5), off(V, 10 * wf, 2), off(V, -10 * wf, 2), off(V, -8.8 * wf, -5), off(L, 0, 9)], cloth[1]);
    P([off(r.neck, 3, 2), off(R, 1, 0), off(R, 0, 9), off(V, 8.8 * wf, -5), off(V, 10 * wf, 1), off(V, 4 * wf, 1), off(r.chest, 5, 0)], cloth[0]);
    P([off(r.neck, -3, 2), off(L, 1, 0), off(L, 2, 8), off(r.chest, -5, 8), off(V, -4, -2), off(r.chest, -1, 0)], cloth[2]);
    if (outfit === "tunic") {
      P([off(V, -9, -3), off(V, 9, -3), off(V, 12, 12), off(V, 3, 13), off(V, 0, 8), off(V, -3, 13), off(V, -12, 12)], cloth[1]);
      P([off(V, 5, -2), off(V, 9, -2), off(V, 12, 11), off(V, 6, 11)], cloth[0]);
    }
    if (outfit === "jacket" && r.height >= 48) {
      P([off(r.neck, -2.5, 1), off(r.neck, 2.5, 1), off(V, 2, 0), off(V, -2, 0)], hex("#c8b99a"));
      P([off(r.neck, -3, 1), off(r.neck, -7, 5), off(r.chest, -3, 8), off(r.chest, -1, -1)], cloth[0]);
      P([off(r.neck, 3, 1), off(r.neck, 6, 5), off(r.chest, 3, 7), off(r.chest, 1, -1)], cloth[2]);
    }
    if (r.height >= 72) {
      line([off(V, -7, 0), off(V, 1, 1), off(V, 7, 0)], cloth[0]);
      line([off(r.chest, -8, 7), off(r.chest, -6, 10)], cloth[1]);
    }
    paintHumanGarment2D(p, style, r, colors2);
    if (pose.armsFront) {
      arm2("right");
      arm2("left");
    }
    P([off(r.neck, -3, -5), off(r.neck, 3, -5), off(r.neck, 3.5, 1), off(r.neck, 0, 3.5), off(r.neck, -3.5, 1)], skin[1]);
    P([off(r.neck, -2, -3), off(r.neck, 1.5, -3), off(r.neck, 1.5, 1), off(r.neck, -0.5, 2)], skin[2]);
    const H = r.head;
    P([off(H, -4.5, -7), off(H, 3.5, -7.5), off(H, 6, -4.5), off(H, 6, 2.5), off(H, 3.5, 6.5), off(H, 0, 8), off(H, -3.5, 6), off(H, -6, 2), off(H, -6, -4)], skin[2]);
    P([off(H, 3.5, -5), off(H, 6, -3), off(H, 6, 3), off(H, 3.5, 6.5), off(H, 0, 8), off(H, 0.3, 5.5), off(H, 3.5, 3)], skin[1]);
    ell(off(H, -6, 0), 1.3, 2.1, skin[2]);
    ell(off(H, 6, 0), 1.1, 1.8, skin[1]);
    if (r.height >= 56) P([off(H, -3, -3), off(H, 1, -4), off(H, 2, -1), off(H, -0.5, 2), off(H, -3, 1)], skin[3]);
    const gaze = Math.max(-1, Math.min(1, pose.gaze ?? 0));
    const eyeY = Math.round(off(H, 0, 0.2)[1]), leftX = Math.round(off(H, -2.8 + gaze, 0.2)[0]), rightX = Math.round(off(H, 2.6 + gaze, 0.2)[0]);
    const eye = hex("#3b3038");
    if (pose.blink) {
      p.px(leftX, eyeY, skin[0]);
      p.px(rightX, eyeY, skin[0]);
    } else {
      p.px(leftX, eyeY, eye);
      p.px(rightX, eyeY, eye);
      if (r.height >= 110) {
        p.px(leftX - 1, eyeY, skin[3]);
        p.px(rightX - 1, eyeY, skin[3]);
      }
    }
    if (r.height >= 64) {
      dot2(off(H, gaze + 1, 2.5), skin[1]);
      line([off(H, -1, 5), off(H, 1.5, 5)], skin[0]);
    }
    if (r.height >= 88) {
      line([off(H, -4, -1.5), off(H, -2, -2)], skin[0]);
      line([off(H, 2, -2), off(H, 4, -1.5)], skin[0]);
    }
    paintHumanFacialHair2D(p, style, r, colors2);
    if (paintHumanHair2D(p, style, r, colors2, "head")) {
    } else if (hairStyle === "crop") {
      P([off(H, -6, -1), off(H, -7, -5), off(H, -4, -8), off(H, 3, -8.5), off(H, 6, -5), off(H, 6, -1), off(H, 4, -3), off(H, 2, -5), off(H, -3, -4), off(H, -5, -1)], hair[0]);
      P([off(H, -5, -5), off(H, -3, -7), off(H, 2, -7), off(H, 3, -5)], hair[1]);
    } else if (hairStyle === "curls") {
      P([off(H, -7, -1), off(H, -8, -5), off(H, -6, -7), off(H, -6, -9), off(H, -2, -10), off(H, 1, -9), off(H, 4, -10), off(H, 7, -7), off(H, 8, -4), off(H, 6, 0), off(H, 4, -3), off(H, 1, -3), off(H, -2, -4), off(H, -4, -2)], hair[0]);
      for (const [dx, dy] of [[-5, -6], [-2, -8], [2, -7], [5, -6]]) ell(off(H, dx, dy), 1.6, 1.2, hair[1]);
    } else if (hairStyle === "bob") {
      P([off(H, -7, 7), off(H, -8, -4), off(H, -5, -8), off(H, 2, -9), off(H, 6, -6), off(H, 7, 6), off(H, 5, 8), off(H, 4, -3), off(H, 0, -5), off(H, -3, -2), off(H, -5, -1), off(H, -5, 7)], hair[1]);
      P([off(H, -6, -4), off(H, -4, -7), off(H, 1, -8), off(H, 3, -6), off(H, -1, -5), off(H, -4, -2)], hair[2]);
    } else {
      P([off(H, -6, 2), off(H, -7, -4), off(H, -6, -7), off(H, -2, -9), off(H, 3, -9), off(H, 6, -7), off(H, 7, -3), off(H, 5, 1), off(H, 4, -4), off(H, 1, -5), off(H, -1, -3), off(H, -4, -2), off(H, -5, 2)], hair[0]);
      P([off(H, -5, -5), off(H, -2, -7), off(H, 3, -8), off(H, 5, -6), off(H, 1, -6), off(H, -2, -4)], hair[1]);
      if (r.height >= 72) line([off(H, -3, -6), off(H, 1, -7), off(H, 3, -7)], hair[2]);
    }
  }
  paintHumanAppearanceEyes2D(p, style, r, { skin, hair, cloth, pants });
  const pixels = frame4.color.slice(), ink = style.outline === null ? 0 : hex(style.outline ?? "#252633");
  if (ink) for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx;
    if (frame4.color[i]) continue;
    if (frame4.color[i - 1] || frame4.color[i + 1] || frame4.color[i - w] || frame4.color[i + w]) pixels[i] = ink;
  }
  const mask = { w, h, data: Uint8Array.from(pixels, (c) => c ? 1 : 0) };
  return { w, h, x, y, pixels, mask, rig: r };
}
function humanPalettes2D(style = {}) {
  validate(style, {});
  return { skin: [...style.skinRamp ?? SKIN[style.skin ?? "warm"]], hair: [...style.hairRamp ?? HAIR[style.hairColor ?? "dark"]], cloth: [...style.cloth ?? ["#34556d", "#507e91", "#7aa6aa"]], trousers: [...style.trousers ?? ["#3c414f", "#545966", "#727981"]], shoe: [...style.shoeRamp ?? ["#3b3034", "#57413a", "#78604a"]] };
}

// src/core/human-portrait.ts
var SKIN2 = { light: ["#a96d65", "#ce9282", "#e9b5a0", "#f2cbb3"], warm: ["#945b49", "#bd805c", "#d9a578", "#ebbf91"], brown: ["#68433f", "#98634f", "#bc8968", "#d4a682"], deep: ["#42333e", "#6b4a43", "#936650", "#b38365"] };
var HAIR2 = { ink: ["#272838", "#3d4157", "#62657c", "#8b8da0"], copper: ["#593d40", "#8c5345", "#bd7b52", "#dba36a"], plum: ["#3f304d", "#654966", "#95698c", "#bd91aa"], silver: ["#535c70", "#7c8a9c", "#afb9c4", "#d7d9d5"] };
var CLOTH = { ocean: ["#304b60", "#4b7386", "#79a0ad", "#a4c3c7"], rose: ["#684650", "#956672", "#bb8d92", "#dfb4ac"], moss: ["#354e49", "#5c7863", "#8aa084", "#b6c3a5"], violet: ["#4d465f", "#756b8c", "#a095b2", "#c3bad0"] };
var EYES = { teal: ["#334e58", "#477f84", "#7bafa7"], amber: ["#644c39", "#9e793f", "#cfa75e"], violet: ["#493f66", "#7c679f", "#af94c8"], brown: ["#534038", "#845c46", "#b48a5e"] };
var choices = { facing: ["right", "left"], face: ["oval", "angular", "long"], skin: Object.keys(SKIN2), hair: ["long", "bob", "ponytail", "braid"], hairColor: Object.keys(HAIR2), eyes: Object.keys(EYES), clothing: ["blouse", "coat", "knit"], cloth: Object.keys(CLOTH) };
function validate2(style, pose) {
  const resolution = style.resolution ?? 128;
  if (![64, 96, 128, 192].includes(resolution)) throw new RangeError("Portrait resolution must be 64, 96, 128 or 192");
  for (const [key, allowed] of Object.entries(choices)) {
    const value = style[key];
    if (value !== void 0 && !allowed.includes(value)) throw new RangeError(`Unknown portrait ${key}: ${value}`);
  }
  if (style.canvas !== void 0 && (!Array.isArray(style.canvas) || style.canvas.length !== 2 || !Array.from(style.canvas).every((n) => Number.isInteger(n) && n >= resolution && n <= 512))) throw new RangeError("Portrait canvas must be two integers from resolution through 512");
  if (style.outline !== void 0 && style.outline !== null && !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(style.outline)) throw new TypeError("Portrait outline must be null or a hex color");
  for (const [key, colors2] of Object.entries(style.palettes ?? {})) if (!["skin", "hair", "cloth", "eyes"].includes(key) || !Array.isArray(colors2) || colors2.length !== (key === "eyes" ? 3 : 4) || !colors2.every((c) => typeof c === "string" && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(c))) throw new RangeError("Invalid shared portrait palette");
  if (!["neutral", "smile", "determined", "surprised"].includes(pose.expression ?? "neutral")) throw new RangeError("Unknown portrait expression");
  for (const key of ["time", "gaze"]) if (pose[key] !== void 0 && !Number.isFinite(pose[key])) throw new RangeError(`${key} must be finite`);
  for (const key of ["blink", "reducedMotion"]) if (pose[key] !== void 0 && typeof pose[key] !== "boolean") throw new TypeError(`${key} must be boolean`);
  return resolution;
}
function frame(w, h) {
  return { w, h, ox: 0, oy: 0, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
}
function renderPortraitUncached(style = {}, pose = {}) {
  const resolution = validate2(style, pose);
  if (style.facing === "left") {
    const a = renderPortraitUncached({ ...style, facing: "right" }, pose), flip = (src) => {
      const out = src.slice();
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) out[y * a.w + a.w - 1 - x] = src[y * a.w + x];
      return out;
    };
    return { ...a, pixels: flip(a.pixels), mask: { ...a.mask, data: flip(a.mask.data) }, faceMask: flip(a.faceMask), eyeRegionMask: flip(a.eyeRegionMask), eyeMask: flip(a.eyeMask), frontHairMask: flip(a.frontHairMask), headAnchor: [a.w - 1 - a.headAnchor[0], a.headAnchor[1]], eyeAnchors: a.eyeAnchors.map((q) => [a.w - 1 - q[0], q[1]]) };
  }
  const [w, h] = style.canvas ?? [resolution, resolution], s = resolution / 128, t = ((pose.time ?? 0) % 2 + 2) % 2, compact = resolution === 64, rich = resolution === 192;
  const ox = Math.floor((w - resolution) / 2), oy = Math.floor((h - resolution) / 2), cx = ox + Math.round(resolution * 0.5), cy = oy + Math.round(resolution * 0.375);
  const skin = characterPalette(style.palettes?.skin ?? SKIN2[style.skin ?? "warm"]), hair = characterPalette(style.palettes?.hair ?? HAIR2[style.hairColor ?? "ink"]), cloth = characterPalette(style.palettes?.cloth ?? CLOTH[style.cloth ?? "ocean"]), iris = characterPalette(style.palettes?.eyes ?? EYES[style.eyes ?? "teal"]);
  const base = frame(w, h), face = frame(w, h), front = frame(w, h), eye = frame(w, h), safe = frame(w, h), p = new Painter(base), fp = new Painter(face), hp = new Painter(front), ep = new Painter(eye), rp = new Painter(safe);
  const pt = (x, y) => [cx + Math.round(x * s), cy + Math.round(y * s)];
  const poly = (p2, a, c) => p2.poly(a.map(([x, y]) => pt(x, y)), c);
  const line = (p2, a, c) => p2.polyline(a.map(([x, y]) => pt(x, y)), c);
  const dot2 = (p2, x, y, c) => {
    const q = pt(x, y);
    p2.px(q[0], q[1], c);
  };
  const ell = (p2, x, y, rx, ry, c) => {
    const q = pt(x, y);
    p2.ellipse(q[0], q[1], Math.max(0.6, rx * s), Math.max(0.6, ry * s), c);
  };
  const hairStyle = style.hair ?? "long", clothing = style.clothing ?? "blouse", shape = style.face ?? "oval", jaw = shape === "angular" ? 14 : 11, chin = shape === "long" ? 27 : 24;
  if (hairStyle === "long" || hairStyle === "braid") poly(p, [[-20, -16], [-8, -28], [12, -26], [22, -12], [25, 17], [24, 50], [18, 57], [14, 39], [-14, 42], [-23, 55], [-25, 48], [-25, 13]], hair[0]);
  if (hairStyle === "bob") poly(p, [[-22, -22], [-9, -31], [13, -29], [24, -17], [27, 19], [22, 32], [15, 34], [-16, 33], [-27, 24], [-27, 3]], hair[0]);
  if (hairStyle === "ponytail") {
    poly(p, [[-21, -22], [-29, -18], [-36, 1], [-34, 24], [-24, 40], [-18, 34], [-24, 12], [-18, -4]], hair[0]);
    poly(p, [[-29, -10], [-33, 4], [-30, 24], [-25, 32], [-25, 14], [-23, -5]], hair[1]);
  }
  const shoulder = clothing === "coat" ? 43 : 40;
  poly(p, [[-8, 25], [-11, 32], [-24, 36], [-35, 43], [-42, 54], [-46, 73], [46, 73], [42, 54], [35, 43], [24, 36], [11, 32], [8, 25]], cloth[1]);
  poly(p, [[20, 37], [31, 41], [40, 51], [46, 73], [31, 73], [28, 57], [24, 46]], cloth[0]);
  poly(p, [[-26, 38], [-35, 44], [-40, 53], [-43, 65], [-38, 68], [-32, 57], [-29, 48]], cloth[2]);
  poly(p, [[-8, chin - 4], [8, chin - 4], [8, 32], [2, 39], [-2, 39], [-9, 32]], skin[1]);
  poly(p, [[-6, chin - 1], [2, chin], [3, 31], [-1, 35], [-6, 31]], skin[2]);
  if (clothing === "coat") {
    poly(p, [[-7, 32], [0, 38], [7, 32], [10, 73], [-10, 73]], hex("#cfbdab"));
    poly(p, [[-9, 29], [-18, 35], [-11, 48], [-5, 42], [-9, 73], [-1, 67]], cloth[0]);
    poly(p, [[9, 29], [18, 35], [11, 48], [5, 42], [9, 73], [2, 67]], cloth[2]);
    if (!compact) {
      line(p, [[-27, 48], [-24, 57]], cloth[0]);
      line(p, [[27, 48], [29, 57]], cloth[1]);
    }
  } else if (clothing === "knit") {
    poly(p, [[-10, 27], [0, 31], [10, 27], [12, 35], [4, 41], [-6, 39], [-12, 34]], cloth[1]);
    poly(p, [[-10, 29], [-7, 34], [3, 36], [10, 32], [9, 36], [1, 40], [-9, 36]], cloth[0]);
    if (!compact) line(p, [[-8, 29], [-4, 31], [3, 32], [8, 29]], cloth[2]);
    poly(p, [[-26, 50], [-22, 55], [-20, 65], [-23, 60]], cloth[0]);
  } else {
    poly(p, [[-9, 29], [-15, 34], [-8, 43], [0, 38]], cloth[2]);
    poly(p, [[9, 29], [15, 34], [8, 43], [0, 38]], cloth[0]);
    if (!compact) {
      line(p, [[0, 40], [0, 68]], cloth[2]);
      dot2(p, 1, 48, cloth[0]);
      dot2(p, 1, 58, cloth[0]);
    }
    poly(p, [[-27, 49], [-23, 55], [-22, 63], [-25, 58]], cloth[0]);
  }
  if (rich) {
    line(p, [[-34, 59], [-30, 65]], cloth[0]);
    line(p, [[32, 60], [30, 66]], cloth[1]);
  }
  poly(fp, [[-13, -25], [7, -27], [18, -20], [21, -7], [20, 8], [jaw, 17], [5, chin - 1], [0, chin], [-7, chin - 2], [-jaw, 17], [-20, 8], [-21, -7], [-19, -19]], skin[2]);
  ell(fp, -21, 6, 3, 5, skin[2]);
  ell(fp, 21, 6, 2.5, 4.5, skin[1]);
  const faceMask = Uint8Array.from(face.color, (c) => c ? 1 : 0);
  poly(fp, [[14, -21], [19, -16], [21, -6], [20, 8], [jaw, 17], [0, chin], [8, 17], [15, 8], [16, -3]], skin[1]);
  if (!compact) poly(fp, [[-10, -17], [-3, -20], [3, -14], [2, -6], [-5, -5], [-11, -8]], skin[3]);
  for (let i = 0; i < face.color.length; i++) if (face.color[i]) base.color[i] = face.color[i];
  const expression = pose.expression ?? "neutral", blink = pose.blink ?? (!pose.reducedMotion && t > 1.55 && t < 1.68), gaze = Math.max(-1, Math.min(1, pose.gaze ?? 0));
  const eyeAnchors = [pt(-10, 1), pt(10, 1)];
  for (const x of [-10, 10]) {
    const lo = pt(x - 6, -10), hi = pt(x + 6, 7);
    rp.rect(lo[0], lo[1], hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, 4294967295);
  }
  const eyeRegionMask = Uint8Array.from(safe.color, (c, i) => c && faceMask[i] ? 1 : 0);
  if (hairStyle === "long") {
    poly(hp, [[-23, 16], [-28, -7], [-25, -24], [-15, -32], [-7, -35], [7, -35], [16, -31], [24, -23], [27, -8], [23, 17], [19, 10], [19, -10], [10, -19], [2, -26], [-1, -19], [-10, -11], [-18, -5], [-18, 14]], hair[1]);
    poly(hp, [[-25, -9], [-22, -24], [-13, -31], [-2, -33], [-5, -24], [-13, -17], [-21, -10]], hair[2]);
    poly(hp, [[1, -33], [13, -31], [22, -22], [24, -10], [18, -15], [11, -23], [3, -28]], hair[0]);
    if (!compact) poly(hp, [[-17, -24], [-12, -28], [-7, -29], [-10, -25], [-16, -21]], hair[3]);
  } else if (hairStyle === "bob") {
    poly(hp, [[-24, 15], [-28, -8], [-24, -25], [-13, -34], [7, -35], [21, -29], [28, -15], [27, 16], [20, 21], [18, -10], [11, -8], [8, -15], [3, -9], [-3, -11], [-7, -8], [-14, -11], [-19, -8], [-18, 18]], hair[1]);
    poly(hp, [[-25, -10], [-22, -24], [-12, -31], [6, -32], [16, -27], [20, -19], [11, -20], [3, -24], [-8, -23], [-19, -15]], hair[2]);
    poly(hp, [[16, -28], [23, -21], [26, -10], [22, 10], [18, -11], [11, -8], [9, -14], [17, -14]], hair[0]);
    if (!compact) poly(hp, [[-18, -25], [-10, -29], [5, -30], [12, -27], [2, -27], [-9, -26], [-19, -20]], hair[3]);
  } else if (hairStyle === "braid") {
    poly(hp, [[-23, 15], [-28, -8], [-24, -24], [-13, -32], [-4, -35], [8, -35], [19, -29], [27, -18], [26, 8], [20, 18], [18, -8], [14, -19], [5, -18], [-3, -10], [-11, -8], [-18, -4], [-18, 18]], hair[1]);
    poly(hp, [[-25, -10], [-20, -25], [-10, -31], [4, -32], [8, -28], [2, -22], [-7, -16], [-17, -10]], hair[2]);
    poly(hp, [[10, -31], [19, -27], [25, -17], [25, -5], [19, -13], [15, -23]], hair[0]);
    if (!compact) poly(hp, [[-19, -22], [-9, -28], [4, -29], [0, -25], [-11, -20]], hair[3]);
  } else {
    poly(hp, [[-23, 10], [-27, -10], [-22, -26], [-10, -34], [8, -34], [22, -24], [26, -10], [23, 12], [18, 17], [18, -6], [15, -17], [8, -22], [-2, -20], [-9, -13], [-17, -9], [-18, 9]], hair[1]);
    poly(hp, [[-23, -10], [-20, -24], [-10, -31], [6, -31], [11, -27], [1, -27], [-9, -20], [-18, -11]], hair[2]);
    poly(hp, [[12, -29], [21, -22], [24, -9], [21, 7], [18, -7], [15, -18]], hair[0]);
    if (!compact) poly(hp, [[-18, -23], [-9, -28], [4, -29], [-4, -25], [-13, -18]], hair[3]);
  }
  if (hairStyle === "bob") {
    poly(hp, [[-23, -6], [-19, -2], [-18, 21], [-12, 29], [-20, 30], [-25, 23]], hair[1]);
    poly(hp, [[21, -5], [25, 1], [24, 23], [18, 30], [13, 28], [19, 19]], hair[0]);
    if (!compact) poly(hp, [[-22, 3], [-20, 10], [-20, 21], [-17, 26], [-21, 23]], hair[2]);
  } else if (hairStyle === "long") {
    poly(hp, [[-23, -6], [-19, -2], [-18, 23], [-19, 46], [-23, 51], [-25, 27]], hair[1]);
    poly(hp, [[21, -3], [25, 4], [25, 28], [21, 51], [17, 46], [20, 22]], hair[0]);
    if (!compact) poly(hp, [[-22, 8], [-20, 18], [-21, 43], [-23, 47], [-23, 25]], hair[2]);
  } else if (hairStyle === "braid") {
    poly(hp, [[19, 9], [24, 15], [25, 24], [22, 32], [24, 40], [20, 49], [19, 56], [13, 54], [16, 46], [15, 38], [18, 30], [17, 23]], hair[1]);
    poly(hp, [[20, 15], [22, 21], [20, 27], [22, 34], [20, 40], [19, 46], [17, 42], [19, 34], [17, 28], [20, 22]], hair[2]);
    if (!compact) line(hp, [[19, 16], [21, 21], [19, 25]], hair[3]);
  } else {
    poly(hp, [[-22, -7], [-18, -3], [-18, 10], [-20, 14], [-22, 11]], hair[0]);
    poly(hp, [[20, -5], [23, 0], [21, 15], [18, 19], [18, 6]], hair[1]);
  }
  const frontHairMask = new Uint8Array(w * h);
  for (let i = 0; i < front.color.length; i++) if (front.color[i] && !eyeRegionMask[i]) {
    base.color[i] = front.color[i];
    frontHairMask[i] = 1;
  }
  const lid = hex("#403447"), white = hex("#eee5d5"), mouth = skin[0];
  for (let side = 0; side < 2; side++) {
    const x = side ? 10 : -10, sign = side ? 1 : -1;
    if (blink) {
      line(ep, [[x - 4, 1], [x - 1, 2], [x + 2, 2], [x + 5, 0]], lid);
    } else {
      const center = pt(x, 0), half = compact ? 2 : Math.round(5 * s), eyeHeight = compact ? expression === "surprised" ? 5 : expression === "smile" ? 3 : 4 : Math.round((expression === "surprised" ? 8 : expression === "smile" ? 5 : 7) * s);
      const top = center[1] - Math.floor(eyeHeight / 2), whiteLayer = frame(w, h), margin = compact ? 1 : Math.max(1, Math.round(1.6 * s));
      for (let row = 0; row < eyeHeight; row++) {
        const inset = row === 0 || row === eyeHeight - 1 ? margin : row === 1 || row === eyeHeight - 2 ? Math.max(0, margin - 1) : 0;
        for (let col = -half + inset; col <= half - inset; col++) whiteLayer.color[(top + row) * w + center[0] + col] = white;
      }
      const ix = center[0] + Math.round(gaze * (compact ? 0 : rich ? 2 : 1)), iy = top + Math.floor(eyeHeight * 0.55), rx = compact ? 0 : Math.max(1, Math.round(2 * s)), ry = Math.ceil(eyeHeight * 0.5);
      for (let yy = top; yy < top + eyeHeight; yy++) for (let xx = ix - rx; xx <= ix + rx; xx++) {
        const i = yy * w + xx;
        if (!whiteLayer.color[i] || ((xx - ix) / (rx + 0.65)) ** 2 + ((yy - iy) / (ry + 0.5)) ** 2 > 1.15) continue;
        whiteLayer.color[i] = yy < iy ? iris[0] : iris[1];
        if (xx === ix && yy <= iy) whiteLayer.color[i] = lid;
      }
      if (rich) {
        const i = (iy - 1) * w + ix - 1;
        if (whiteLayer.color[i] && whiteLayer.color[i] !== white) whiteLayer.color[i] = hex("#fff4de");
      }
      for (let col = -half; col <= half; col++) {
        const curve = Math.round((Math.abs(col) / half) ** 2 * (compact ? 1 : 2 * s)), tilt = expression === "determined" ? Math.sign(col) === -sign ? 1 : 0 : 0;
        const yy = top + curve + tilt;
        for (let above = top; above < yy; above++) whiteLayer.color[above * w + center[0] + col] = 0;
        whiteLayer.color[yy * w + center[0] + col] = lid;
      }
      for (let i = 0; i < eye.color.length; i++) if (whiteLayer.color[i]) eye.color[i] = whiteLayer.color[i];
    }
    const brow = expression === "surprised" ? -10 : expression === "determined" ? -4 : -7;
    if (expression === "determined") line(fp, [[x - sign * 4, brow + 1], [x + sign * 3, brow - 2]], hair[0]);
    else line(fp, [[x - 4, brow + 1], [x, brow], [x + 4, brow + 1]], hair[0]);
  }
  const eyeMask = new Uint8Array(w * h);
  for (let i = 0; i < eye.color.length; i++) if (eye.color[i] && faceMask[i] && !frontHairMask[i]) {
    base.color[i] = eye.color[i];
    eyeMask[i] = 1;
  }
  for (let i = 0; i < face.color.length; i++) if (face.color[i] && face.color[i] === hair[0] && !frontHairMask[i]) base.color[i] = face.color[i];
  if (!compact) {
    poly(p, [[2, 6], [3, 9], [2, 11], [-1, 11]], skin[1]);
    dot2(p, -1, 10, skin[3]);
  } else dot2(p, 1, 9, skin[1]);
  if (expression === "surprised") {
    ell(p, 0, 17, 2.2, 2.8, mouth);
    if (!compact) line(p, [[-1, 19], [1, 19]], skin[3]);
  } else if (expression === "smile") {
    line(p, [[-4, 15], [-2, 17], [1, 18], [4, 15]], mouth);
    if (!compact) line(p, [[-2, 16], [1, 17], [3, 15]], hex("#e5c7b4"));
  } else if (expression === "determined") line(p, [[-3, 17], [2, 17]], skin[0]);
  else {
    line(p, [[-2, 17], [1, 17], [3, 16]], mouth);
    if (rich) line(p, [[-1, 19], [2, 18]], skin[3]);
  }
  const pixels = base.color.slice(), ink = style.outline === null ? 0 : hex(style.outline ?? "#292738");
  if (ink) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!base.color[i] && (base.color[i - 1] || base.color[i + 1] || base.color[i - w] || base.color[i + w])) pixels[i] = ink;
  }
  return { w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (c) => c ? 1 : 0) }, faceMask, eyeRegionMask, eyeMask, frontHairMask, headAnchor: [cx, cy], eyeAnchors, resolution, detailTier: compact ? "compact" : rich ? "rich" : "standard", blink };
}
var portraitCache = /* @__PURE__ */ new Map();
function renderHumanPortrait2D(style = {}, pose = {}) {
  validate2(style, pose);
  const t = ((pose.time ?? 0) % 2 + 2) % 2;
  const sample = { expression: pose.expression ?? "neutral", gaze: Math.max(-1, Math.min(1, pose.gaze ?? 0)), blink: pose.blink ?? (!pose.reducedMotion && t > 1.55 && t < 1.68) };
  const key = JSON.stringify([Object.keys(style).sort().map((k) => [k, style[k]]), sample]);
  let a = portraitCache.get(key);
  if (!a) {
    a = renderPortraitUncached(style, sample);
    if (portraitCache.size >= 12) portraitCache.delete(portraitCache.keys().next().value);
    portraitCache.set(key, a);
  } else {
    portraitCache.delete(key);
    portraitCache.set(key, a);
  }
  return { ...a, pixels: a.pixels.slice(), mask: { ...a.mask, data: a.mask.data.slice() }, faceMask: a.faceMask.slice(), eyeRegionMask: a.eyeRegionMask.slice(), eyeMask: a.eyeMask.slice(), frontHairMask: a.frontHairMask.slice(), headAnchor: [...a.headAnchor], eyeAnchors: [[...a.eyeAnchors[0]], [...a.eyeAnchors[1]]] };
}

// src/core/character-identity.ts
function createCharacterIdentity2D(id, name, body = {}, portrait = {}) {
  if (!id || !name) throw new RangeError("Character identity needs an ID and name");
  humanPalettes2D(body);
  const hair = body.hair === "bob" ? "bob" : body.hair === "ponytail" || body.hair === "bun" ? "ponytail" : "long";
  return JSON.parse(JSON.stringify({ id, name, body, portrait: { face: body.faceShape === "square" ? "angular" : body.faceShape === "long" ? "long" : "oval", hair, clothing: body.outfit === "jacket" ? "coat" : body.outfit === "sweater" ? "knit" : "blouse", ...portrait } }));
}
function renderCharacterPortrait2D(identity, options = {}) {
  const p = humanPalettes2D(identity.body), style = {
    ...identity.portrait,
    resolution: options.resolution ?? 128,
    facing: identity.body.facing,
    skin: identity.body.skin,
    outline: identity.body.outline,
    palettes: { skin: p.skin, hair: [...p.hair, p.hair[2]], cloth: [...p.cloth, p.cloth[2]], ...identity.eyePalette ? { eyes: identity.eyePalette } : {} }
  };
  return renderHumanPortrait2D(style, options.pose);
}

// src/core/human-action.ts
var HUMAN_ACTION_TIMING = Object.freeze({
  run: Object.freeze({ duration: 0.8, stanceFraction: 0.32 }),
  jump: Object.freeze({ duration: 1.2, anticipationEnd: 0.18, takeoff: 0.24, apex: 0.54, landing: 0.84, recoveryStart: 1.04 })
});
var finite2 = (n, label) => {
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be finite`);
  return n;
};
var clamp2 = (x) => Math.max(0, Math.min(1, x));
var smooth = (x) => {
  x = clamp2(x);
  return x * x * (3 - 2 * x);
};
var mix2 = (a, b, t) => a + (b - a) * t;
function humanLimbTarget2D(origin, angle, bend, first, second) {
  if (!Array.isArray(origin) || origin.length !== 2 || !Array.from(origin).every(Number.isFinite)) throw new TypeError("origin must contain two finite coordinates");
  finite2(angle, "angle");
  finite2(bend, "bend");
  finite2(first, "first length");
  finite2(second, "second length");
  angle %= Math.PI * 2;
  bend %= Math.PI * 2;
  if (first <= 0 || second <= 0 || first > 512 || second > 512) throw new RangeError("limb lengths must be within 0..512");
  return { target: [origin[0] + first * Math.sin(angle) + second * Math.sin(angle + bend), origin[1] + first * Math.cos(angle) + second * Math.cos(angle + bend)], pole: Math.sin(bend) >= 0 ? 1 : -1 };
}
function arms(r, left, right) {
  const l = humanLimbTarget2D(r.leftShoulder, ...left, r.lengths.upperArm, r.lengths.forearm), q = humanLimbTarget2D(r.rightShoulder, ...right, r.lengths.upperArm, r.lengths.forearm);
  return { leftHand: l.target, rightHand: q.target, leftElbow: l.pole, rightElbow: q.pole };
}
function armAngles(r, side) {
  const a = r[`${side}Shoulder`], b = r[`${side}Elbow`], c = r[`${side}Hand`], upper = Math.atan2(b[0] - a[0], b[1] - a[1]), fore = Math.atan2(c[0] - b[0], c[1] - b[1]);
  let bend = fore - upper;
  while (bend > Math.PI) bend -= Math.PI * 2;
  while (bend < -Math.PI) bend += Math.PI * 2;
  return [upper, bend];
}
function humanAction2D(action, time, style = {}, reducedMotion = false) {
  finite2(time, "time");
  if (action !== "run" && action !== "jump") throw new RangeError(`Unknown human action: ${action}`);
  humanRig2D(style);
  const view = style.view ?? "front", side = view === "side", quarter = view === "three-quarter", broad = !side && !quarter;
  const canonical = { ...style, height: 96, facing: "right" }, duration = HUMAN_ACTION_TIMING[action].duration;
  const raw = action === "run" ? (time % duration + duration) % duration : Math.max(0, Math.min(duration, time));
  const t = action === "run" ? Math.round(raw * 1e12) / 1e12 >= duration ? 0 : Math.round(raw * 1e12) / 1e12 : raw;
  const stance = side ? 4 : quarter ? 7 : 12;
  const rest = { leftFoot: [-stance, -4], rightFoot: [stance, -4], blink: false };
  if (reducedMotion || action === "jump" && (t === 0 || t === duration)) {
    const r = humanRig2D(canonical, rest);
    return { pose: rest, phase: "rest", contacts: { left: true, right: true }, airborne: false, time: t, duration, loop: action === "run", done: action === "jump" && time >= duration, rootY: r.pelvis[1] + 44.5 };
  }
  let pose, phase, leftContact, rightContact;
  if (action === "run") {
    const u = t / duration, a = u * Math.PI * 2, co = Math.cos(a), sw = Math.sin(a), duty = HUMAN_ACTION_TIMING.run.stanceFraction;
    const foot = (v, near) => {
      v %= 1;
      const contact = v < duty, front = side ? 17 : quarter ? 10 : 2.5, back = side ? -13 : quarter ? -8 : -2, offset = broad ? near ? -6 : 6 : quarter ? near ? -3 : 3 : 0;
      const q = contact ? v / duty : (v - duty) / (1 - duty), x = contact ? mix2(front, back, q) : mix2(back, front, smooth(q)), lift = contact ? 0 : (side ? 12 : quarter ? 7 : 4) * Math.sin(Math.PI * q);
      return { point: [offset + x, -4 - lift], contact };
    };
    const l = foot(u, true), r = foot((u + 0.5) % 1, false), half = u % 0.5, flight = half >= duty, flightU = (half - duty) / (0.5 - duty);
    const y = flight ? -(broad ? 2.5 : 5) * Math.sin(Math.PI * flightU) : 1.6 * Math.sin(Math.PI * half / duty);
    const lean = side ? 8 : quarter ? 4 : 0.8 * sw;
    pose = { y, lean, leftFoot: l.point, rightFoot: r.point, leftKnee: -1, rightKnee: broad ? 1 : -1, armsFront: view !== "back" && !side, blink: false };
    const body = humanRig2D(canonical, pose);
    const left = side ? [-0.8 * co, 1.5] : [-0.45, 1.5 + 0.5 * co], right = side ? [0.8 * co, 1.5] : [0.45, -1.5 + 0.5 * co];
    pose = { ...pose, ...arms(body, left, right) };
    leftContact = l.contact;
    rightContact = r.contact;
    phase = leftContact || rightContact ? "stance" : "flight";
  } else {
    const timing = HUMAN_ACTION_TIMING.jump;
    let y = 0, lift = 0, raise = 0;
    if (t < timing.anticipationEnd) {
      const q = smooth(t / timing.anticipationEnd);
      y = 6 * q;
      raise = -0.12 * q;
      phase = "anticipation";
    } else if (t < timing.takeoff) {
      const q = smooth((t - timing.anticipationEnd) / (timing.takeoff - timing.anticipationEnd));
      y = 6 * (1 - q);
      raise = mix2(-0.12, 1, q);
      phase = "takeoff";
    } else if (t < timing.landing) {
      const q = (t - timing.takeoff) / (timing.landing - timing.takeoff);
      y = -20 * 4 * q * (1 - q);
      lift = (side ? 8 : quarter ? 5 : 3) * Math.sin(Math.PI * q);
      raise = 1;
      phase = "flight";
    } else if (t < timing.recoveryStart) {
      const q = (t - timing.landing) / (timing.recoveryStart - timing.landing);
      y = 7 * Math.sin(Math.PI * q);
      raise = 1 - smooth(q) * 0.8;
      phase = "landing";
    } else {
      const q = smooth((t - timing.recoveryStart) / (duration - timing.recoveryStart));
      raise = 0.2 * (1 - q);
      phase = "recovery";
    }
    if (t < 0.06) raise = -0.12 * smooth(t / 0.06);
    else if (t < 0.42) raise = mix2(-0.12, 1, smooth((t - 0.06) / 0.36));
    const air = phase === "flight", footY = air ? y - 4 - lift : -4, heel = air && side ? -lift * 0.5 : 0, lean = side ? 3 * Math.max(0, raise) : quarter ? 1.5 * Math.max(0, raise) : 0;
    pose = { y, lean, leftFoot: [-stance + heel, footY], rightFoot: [stance + heel, footY], leftKnee: side || quarter ? -1 : 1, rightKnee: -1, armsFront: view !== "back", blink: false };
    const body = humanRig2D(canonical, pose), start = humanRig2D(canonical, rest), la = armAngles(start, "left"), ra = armAngles(start, "right");
    const lUp = side ? [2.4, 0.55] : [-2.25, -0.6], rUp = side ? [2.25, 0.6] : [2.25, 0.6];
    pose = { ...pose, ...arms(body, [mix2(la[0], lUp[0], raise), mix2(la[1], lUp[1], raise)], [mix2(ra[0], rUp[0], raise), mix2(ra[1], rUp[1], raise)]) };
    leftContact = rightContact = !air;
  }
  const solved = humanRig2D(canonical, pose);
  return { pose, phase, contacts: { left: leftContact, right: rightContact }, airborne: !leftContact && !rightContact, time: t, duration, loop: action === "run", done: false, rootY: solved.pelvis[1] + 44.5 };
}

// src/core/human-combat.ts
var HUMAN_COMBAT_TIMING = Object.freeze({
  punch: Object.freeze({ duration: 0.9, windup: 0.2, contact: 0.34, holdEnd: 0.4, recoveryEnd: 0.9 }),
  block: Object.freeze({ duration: 1.1, windup: 0.24, contact: 0.36, holdEnd: 0.64, recoveryEnd: 1.1 }),
  hit: Object.freeze({ duration: 0.9, windup: 0.1, contact: 0.1, holdEnd: 0.29, recoveryEnd: 0.9 })
});
var clamp3 = (x) => Math.max(0, Math.min(1, x));
var smooth2 = (x) => {
  x = clamp3(x);
  return x * x * (3 - 2 * x);
};
var mix3 = (a, b, u) => a + (b - a) * u;
function humanHandTip2D(r, side) {
  if (side !== "left" && side !== "right") throw new RangeError("Hand side must be left or right");
  const a = r[`${side}Elbow`], b = r[`${side}Hand`], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l = (r.pose.fists ? r.view === "front" ? 2.6 : 2.4 : r.view === "front" ? 3.9 : 3.6) * r.scale;
  return [b[0] + (b[0] - a[0]) * l / d, b[1] + (b[1] - a[1]) * l / d];
}
function blend(a, b, u) {
  return { x: mix3(a.x, b.x, u), lean: mix3(a.lean, b.lean, u), y: mix3(a.y, b.y, u), left: [mix3(a.left[0], b.left[0], u), mix3(a.left[1], b.left[1], u)], right: [mix3(a.right[0], b.right[0], u), mix3(a.right[1], b.right[1], u)] };
}
function choreography(action, t, style) {
  const view = style.view ?? "front", side = view === "side", quarter = view === "three-quarter", back = view === "back", broad = !side && !quarter;
  const active = broad ? "right" : "left", stance = side ? 12 : quarter ? 13 : 14;
  const ready = { x: -1, lean: side ? 1 : quarter ? 0.5 : 0, y: broad ? 2 : 4, left: side ? [0.3, 2.6] : quarter ? [0.8, 2.1] : [-0.1, 3], right: side ? [0.55, 2.4] : quarter ? [0.1, -3] : [0.35, 2.6] };
  const timing = HUMAN_COMBAT_TIMING[action];
  let key = ready, phase = "ready";
  if (action === "punch") {
    const prep = { ...ready, x: -3, lean: -1.5, y: broad ? 4 : 6, [active]: broad ? [0.05, 2.75] : [-0.15, 2.7] };
    const strike = { ...ready, x: 4, lean: side ? 5 : quarter ? 4 : 3, y: broad ? 3 : 4, [active]: [1.45, 0.16] };
    const feet = { leftFoot: [-stance, -4], rightFoot: [stance, -4] };
    const targetY = humanRig2D(style, { ...feet, x: ready.x, lean: ready.lean, y: ready.y }).chest[1];
    const shoulderY = humanRig2D(style, { ...feet, x: strike.x, lean: strike.lean, y: strike.y })[`${active}Shoulder`][1];
    const bend = strike[active][1], a = 18.2, b = 16.6 + (view === "front" ? 2.6 : 2.4), cx = a + b * Math.cos(bend), cy = b * Math.sin(bend);
    strike[active] = [Math.acos(Math.max(-1, Math.min(1, (targetY - shoulderY) / Math.hypot(cx, cy)))) - Math.atan2(cy, cx), bend];
    if (t > 0 && t < timing.windup) {
      key = blend(ready, prep, smooth2(t / timing.windup));
      phase = "windup";
    } else if (t < timing.contact && t > 0) {
      const u = (t - timing.windup) / (timing.contact - timing.windup);
      key = blend(prep, strike, smooth2(u));
      key.x = mix3(prep.x, strike.x, smooth2(Math.min(1, u * 1.35)));
      phase = "strike";
    } else if (t >= timing.contact && t < timing.holdEnd) {
      key = strike;
      phase = "strike";
    } else if (t < timing.duration && t >= timing.holdEnd) {
      const u = (t - timing.holdEnd) / (timing.duration - timing.holdEnd);
      key = blend(strike, ready, smooth2(Math.min(1, u * 1.6)));
      key.x = mix3(strike.x, ready.x, smooth2(u));
      key.lean = mix3(strike.lean, ready.lean, smooth2(u));
      key.y = mix3(strike.y, ready.y, smooth2(u)) + 0.6 * Math.sin(Math.PI * u);
      phase = "recovery";
    }
  } else if (action === "block") {
    const brace = {
      x: -1.5,
      lean: side ? -0.5 : 0,
      y: broad ? 4 : 7,
      left: side ? [1.05, 2.1] : quarter ? [1.1, 1.9] : back ? [-1.4, 3.8] : [1, 1.9],
      right: side ? [0.85, 2.25] : quarter ? [0.1, -3] : back ? [1.4, Math.PI * 2 - 3.8] : [-1, -1.9]
    };
    if (t > 0 && t < timing.windup) {
      key = blend(ready, brace, smooth2(t / timing.windup));
      phase = "windup";
    } else if (t >= timing.windup && t < timing.holdEnd) {
      key = { ...brace };
      if (t >= timing.contact) {
        const q = (t - timing.contact) / (timing.holdEnd - timing.contact), give = Math.sin(Math.PI * q);
        key.x -= 2 * give;
        key.y += 1.6 * give;
        key.lean -= 1.3 * give;
      }
      phase = "brace";
    } else if (t >= timing.holdEnd && t < timing.duration) {
      key = blend(brace, ready, smooth2((t - timing.holdEnd) / (timing.duration - timing.holdEnd)));
      phase = "recovery";
    }
  } else {
    const recoil = { x: -5, lean: side ? -7 : quarter ? -6 : -5, y: broad ? 4 : 7, left: side ? [-0.4, 1.6] : [-0.3, 1.8], right: side ? [1.2, 1.5] : [0.3, -1.8] };
    if (t >= timing.contact && t < 0.22) {
      key = blend(ready, recoil, smooth2((t - timing.contact) / 0.12));
      phase = "recoil";
    } else if (t >= 0.22 && t < timing.holdEnd) {
      key = recoil;
      phase = "recoil";
    } else if (t >= timing.holdEnd && t < timing.duration) {
      key = blend(recoil, ready, smooth2((t - timing.holdEnd) / (timing.duration - timing.holdEnd)));
      phase = "recovery";
    }
  }
  const base = { x: key.x, lean: key.lean, y: key.y, leftFoot: [-stance, -4], rightFoot: [stance, -4], leftKnee: broad ? 1 : -1, rightKnee: -1, armsFront: !back, fists: true, blink: action === "hit" && t >= timing.contact && t < 0.29 };
  const body = humanRig2D(style, base), l = humanLimbTarget2D(body.leftShoulder, ...key.left, body.lengths.upperArm, body.lengths.forearm), r = humanLimbTarget2D(body.rightShoulder, ...key.right, body.lengths.upperArm, body.lengths.forearm);
  return { phase, pose: { ...base, leftHand: l.target, rightHand: r.target, leftElbow: l.pole, rightElbow: r.pole } };
}
function humanCombat2D(action, time, style = {}, reducedMotion = false) {
  if (!["punch", "block", "hit"].includes(action)) throw new RangeError(`Unknown human combat action: ${action}`);
  if (!Number.isFinite(time)) throw new RangeError("time must be finite");
  humanRig2D(style);
  const view = style.view ?? "front", duration = HUMAN_COMBAT_TIMING[action].duration, t = Math.max(0, Math.min(duration, time)), canonical = { ...style, height: 96, facing: "right" };
  const sample = choreography(action, reducedMotion ? 0 : t, canonical), rig = humanRig2D(style, sample.pose), active = action === "block" && view === "front" ? "left" : view === "front" || view === "back" ? "right" : "left";
  const anchorName = action === "hit" ? "chest" : `${active}HandTip`;
  const anchor = action === "hit" ? rig.chest : humanHandTip2D(rig, active);
  const at = HUMAN_COMBAT_TIMING[action].contact, atPose = choreography(action, at, canonical).pose, atRig = humanRig2D(style, atPose);
  const position = action === "hit" ? atRig.chest : humanHandTip2D(atRig, active);
  const contact = reducedMotion ? null : defineImpactContact2D({ id: `human-${action}`, at, position, normal: [(action === "punch" ? -1 : 1) * (style.facing === "left" ? -1 : 1), 0], material: "character", strength: action === "punch" ? 1 : action === "block" ? 0.6 : 0.8, radius: 2.4 * rig.scale });
  const age = contact ? impactContactAge2D(contact, time) : null;
  return { ...sample, time: t, duration, done: time >= duration, loop: false, contacts: { left: true, right: true }, anchor, anchorName, contact, contactAge: age, contactActive: age !== null && age >= 0 && age < 0.06 };
}

// src/core/human-weapon.ts
var HUMAN_WEAPON_TIMING = Object.freeze({
  sword: Object.freeze({ duration: 1.2, windup: 0.28, cue: 0.44, follow: 0.56, recover: 0.66 }),
  bow: Object.freeze({ duration: 1.4, draw: 0.4, cue: 0.7, settle: 0.9 })
});
var smooth3 = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
var mix4 = (a, b, u) => a + (b - a) * u;
var blend2 = (a, b, u) => [mix4(a[0], b[0], u), mix4(a[1], b[1], u)];
var add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
var unit = (a, b) => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return d < 1e-9 ? [1, 0] : [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
function humanGrip2D(r, hand) {
  if (hand !== "left" && hand !== "right") throw new RangeError("Grip hand must be left or right");
  return add(r[`${hand}Hand`], unit(r[`${hand}Elbow`], r[`${hand}Hand`]), 1.2 * r.scale);
}
function plan(kind, t, style) {
  const view = style.view ?? "front", broad = view === "front" || view === "back", side = view === "side", back = view === "back", hand = broad ? "right" : "left", stance = broad ? 14 : 12;
  const ground = { leftFoot: [-stance, -4], rightFoot: [stance, -4], leftKnee: broad ? 1 : -1, rightKnee: -1, fists: true, armsFront: !back, blink: false };
  let lean = broad ? 0 : 1, y = broad ? 2 : 4, phase = "ready", angle = -0.15, pull = 0;
  if (kind === "sword") {
    const ready = { x: -1, lean: broad ? 0 : 1, y: broad ? 4 : 5, arm: broad ? [0.9, 1.45] : [0.65, 1.65], other: broad ? [-0.1, 3] : [0.5, 2.4], angle: 0.24 };
    const wind = { x: -4, lean: -2, y: broad ? 6 : 7, arm: [2.85, 0.92], other: broad ? [-0.3, 2.85] : [0.2, 2.65], angle: -1.05 };
    const drive = { x: 0, lean: 2, y: broad ? 3 : 4, arm: [2.65, 0.8], other: broad ? [-0.4, 2.8] : [-0.1, 2.8], angle: -0.92 };
    const strike = { x: 4, lean: broad ? 3 : 5, y: broad ? 4 : 5, arm: [1.35, 0.3], other: broad ? [-0.4, 2.65] : [-0.2, 2.65], angle: 1.48 };
    const follow = { x: 5, lean: broad ? 4 : 6, y: broad ? 5 : 6, arm: [0.92, 0.55], other: broad ? [-0.25, 2.8] : [-0.1, 2.75], angle: 2.06 };
    const gather = { x: 1, lean: 1, y: broad ? 5 : 6, arm: [0.25, 2.05], other: ready.other, angle: 0.78 };
    const settle = { ...ready, x: -1.5, y: ready.y + 0.4, angle: 0.18 };
    const lerpKey = (a2, b, u) => ({ x: mix4(a2.x, b.x, u), lean: mix4(a2.lean, b.lean, u), y: mix4(a2.y, b.y, u), arm: blend2(a2.arm, b.arm, u), other: blend2(a2.other, b.other, u), angle: mix4(a2.angle, b.angle, u) });
    let key = ready;
    if (t > 0 && t < 0.28) {
      key = lerpKey(ready, wind, smooth3(t / 0.28));
      phase = "windup";
    } else if (t >= 0.28 && t < 0.34) {
      key = lerpKey(wind, drive, smooth3((t - 0.28) / 0.06));
      phase = "swing";
    } else if (t >= 0.34 && t < 0.44) {
      key = lerpKey(drive, strike, smooth3((t - 0.34) / 0.1));
      phase = "swing";
    } else if (t >= 0.44 && t < 0.47) {
      key = strike;
      phase = "swing";
    } else if (t >= 0.47 && t < 0.56) {
      key = lerpKey(strike, follow, smooth3((t - 0.47) / 0.09));
      phase = "follow-through";
    } else if (t >= 0.56 && t < 0.66) {
      key = follow;
      phase = "follow-through";
    } else if (t >= 0.66 && t < 0.94) {
      key = lerpKey(follow, gather, smooth3((t - 0.66) / 0.28));
      phase = "recovery";
    } else if (t >= 0.94 && t < 1.12) {
      key = lerpKey(gather, settle, smooth3((t - 0.94) / 0.18));
      phase = "recovery";
    } else if (t >= 1.12 && t < 1.2) {
      key = lerpKey(settle, ready, smooth3((t - 1.12) / 0.08));
      phase = "recovery";
    }
    lean = key.lean;
    y = key.y;
    angle = key.angle;
    const base = { ...ground, x: key.x, lean, y }, r = humanRig2D(style, base), other = broad ? "left" : "right";
    const otherAngles = key.other;
    const a = humanLimbTarget2D(r[`${hand}Shoulder`], key.arm[0], key.arm[1], r.lengths.upperArm, r.lengths.forearm), o = humanLimbTarget2D(r[`${other}Shoulder`], otherAngles[0], otherAngles[1], r.lengths.upperArm, r.lengths.forearm);
    return { pose: { ...base, [`${hand}Hand`]: a.target, [`${hand}Elbow`]: a.pole, [`${other}Hand`]: o.target, [`${other}Elbow`]: o.pole }, phase, angle, pull };
  }
  const leadRest = broad ? [28, -55] : side ? [18, -55] : [15, -55], leadFull = broad ? [42, -74] : side ? [30, -74] : [24, -74];
  const drawRest = broad ? [16, -55] : side ? [10, -55] : [6, -55], drawFull = broad ? [2, -75] : side ? [3, -74] : [0, -74];
  let lead = leadRest, draw = drawRest;
  if (t > 0 && t < 0.4) {
    pull = smooth3(t / 0.4);
    phase = "draw";
    lead = blend2(leadRest, leadFull, pull);
    draw = blend2(drawRest, drawFull, pull);
  } else if (t >= 0.4 && t < 0.7) {
    pull = 1;
    phase = "hold";
    lead = leadFull;
    draw = drawFull;
  } else if (t >= 0.7 && t < 0.9) {
    pull = 1;
    phase = "release";
    lead = leadFull;
    draw = add(drawFull, [-3, -1], smooth3((t - 0.7) / 0.2));
  } else if (t >= 0.9 && t < 1.4) {
    const u = smooth3((t - 0.9) / 0.5);
    pull = 1 - u;
    phase = "recovery";
    lead = blend2(leadFull, leadRest, u);
    draw = blend2(add(drawFull, [-3, -1]), drawRest, u);
  } else if (t >= 1.4) phase = "unloaded";
  if (side) draw = [draw[0] - 4 * Math.sin(Math.PI * pull), draw[1]];
  lean = mix4(broad ? 0 : 1, 3, pull);
  const pose = { ...ground, lean, y, gaze: 0.3, [`${hand}Hand`]: lead, [`${hand}Elbow`]: 1, [`${broad ? "left" : "right"}Hand`]: draw, [`${broad ? "left" : "right"}Elbow`]: broad ? 1 : -1 };
  return { pose, phase, angle, pull };
}
function geometry(kind, t, style, p) {
  const r = humanRig2D(style, p.pose), s = r.scale, hand = r.view === "front" || r.view === "back" ? "right" : "left", g = humanGrip2D(r, hand), sign = r.facing === "left" ? -1 : 1;
  if (kind === "sword") {
    const d2 = [Math.sin(p.angle) * sign, -Math.cos(p.angle)];
    return { kind, hand, grip: g, direction: d2, tip: add(g, d2, 37 * s), loaded: false };
  }
  const draw = humanGrip2D(r, hand === "left" ? "right" : "left"), d = unit(draw, g), v = [-d[1] * sign, d[0] * sign], age = t - 0.7;
  const tension = t < 0.7 ? p.pull : Math.exp(-18 * Math.max(0, age)), tipOffset = 7 + 2 * tension;
  const upperTip = add(add(g, v, -24 * s), d, -tipOffset * s), lowerTip = add(add(g, v, 24 * s), d, -tipOffset * s);
  const nock = t < 0.7 ? draw : add(g, d, -(tipOffset + (Math.hypot(g[0] - draw[0], g[1] - draw[1]) / s - tipOffset) * Math.exp(-22 * age) * Math.cos(48 * age)) * s);
  return { kind, hand, grip: g, direction: d, tip: add(g, d, 17 * s), upperTip, lowerTip, nock, drawGrip: draw, arrowTip: add(g, d, 17 * s), loaded: t < 0.7 };
}
function humanWeapon2D(kind, time, style = {}, reducedMotion = false) {
  if (kind !== "sword" && kind !== "bow") throw new RangeError(`Unknown human weapon: ${kind}`);
  if (!Number.isFinite(time)) throw new RangeError("time must be finite");
  humanRig2D(style);
  const duration = HUMAN_WEAPON_TIMING[kind].duration, t = Math.max(0, Math.min(duration, time)), canonical = { ...style, height: 96, facing: "right" };
  const p = plan(kind, reducedMotion ? 0 : t, canonical), g = geometry(kind, reducedMotion ? 0 : t, style, p), at = HUMAN_WEAPON_TIMING[kind].cue;
  const cp = plan(kind, at, canonical), cg = geometry(kind, kind === "bow" ? at - 1e-10 : at, style, cp);
  const cue = reducedMotion ? null : Object.freeze({ kind: kind === "sword" ? "slash" : "release", at, position: Object.freeze([...cg.tip]), direction: Object.freeze([...cg.direction]) });
  let projectile = null;
  if (kind === "bow" && !reducedMotion && t >= at && t < duration) {
    const delta = 160 * (t - at) * (style.height ?? 96) / 96;
    projectile = { tail: add(cg.drawGrip, cg.direction, delta), tip: add(cg.arrowTip, cg.direction, delta) };
  }
  return { pose: p.pose, phase: p.phase, time: t, duration, done: time >= duration, loop: false, geometry: g, cue, cueActive: !!cue && time >= at && time < at + 0.06, projectile };
}
function frame2(x, y, w, h) {
  return { w, h, ox: x, oy: y, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
}
function layer(f) {
  return { x: f.ox, y: f.oy, w: f.w, h: f.h, pixels: f.color, mask: { w: f.w, h: f.h, data: Uint8Array.from(f.color, (c) => c ? 1 : 0) } };
}
function mirror(a) {
  const pixels = new Uint32Array(a.pixels.length), data = new Uint8Array(a.pixels.length);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = y * a.w + x, j = y * a.w + a.w - 1 - x;
    pixels[j] = a.pixels[i];
    data[j] = a.mask.data[i];
  }
  return { ...a, x: -a.x - a.w, pixels, mask: { w: a.w, h: a.h, data } };
}
function blit(p, a) {
  blitSprite2D(p, a);
}
function arrow(p, tail, tip, s) {
  const d = unit(tail, tip), v = [-d[1], d[0]], a = add(tip, d, -5 * s);
  p.line(Math.round(tail[0]), Math.round(tail[1]), Math.round(a[0]), Math.round(a[1]), hex("#b99b68"));
  p.poly([tip, add(a, v, 2 * s), add(a, v, -2 * s)].map((q) => q.map(Math.round)), hex("#aab9bd"));
  const f = add(tail, d, 4 * s);
  p.line(Math.round(tail[0]), Math.round(tail[1]), Math.round(add(f, v, 2 * s)[0]), Math.round(add(f, v, 2 * s)[1]), hex("#ba7668"));
}
function renderHumanWeapon2D(kind, time, style = {}, reducedMotion = false) {
  if (style.facing === "left") {
    const a = renderHumanWeapon2D(kind, time, { ...style, facing: "right" }, reducedMotion), sample = humanWeapon2D(kind, time, style, reducedMotion);
    return { actor: { ...mirror(a.actor), rig: humanRig2D(style, sample.pose) }, projectile: a.projectile ? mirror(a.projectile) : null, held: mirror(a.held), sample };
  }
  return renderWeaponSample(humanWeapon2D(kind, time, style, reducedMotion), style);
}
function renderHumanWeaponPose2D(kind, pose, style = {}, angle = 0, nocked = false) {
  if (kind !== "sword" && kind !== "bow") throw new RangeError("Weapon must be sword or bow");
  if (!Number.isFinite(angle)) throw new RangeError("Weapon angle must be finite");
  const r = humanRig2D(style, pose), hand = r.view === "front" || r.view === "back" ? "right" : "left", grip = humanGrip2D(r, hand), s = r.scale;
  const direction = [Math.cos(angle) * (r.facing === "left" ? -1 : 1), -Math.sin(angle)], v = [-direction[1], direction[0]];
  const g = { kind, hand, grip, direction, tip: add(grip, direction, 37 * s), loaded: kind === "bow" && nocked };
  if (kind === "bow") {
    g.drawGrip = humanGrip2D(r, hand === "left" ? "right" : "left");
    g.upperTip = add(add(grip, v, -24 * s), direction, -7 * s);
    g.lowerTip = add(add(grip, v, 24 * s), direction, -7 * s);
    g.nock = nocked ? g.drawGrip : add(grip, direction, -7 * s);
    g.arrowTip = add(grip, direction, 17 * s);
  }
  return renderWeaponSample({ pose, phase: "ready", time: 0, duration: 0, done: false, loop: false, geometry: g, cue: null, cueActive: false, projectile: null }, style);
}
function renderWeaponSample(sample, style) {
  const kind = sample.geometry.kind, body = renderHuman2D({ ...style, outline: null }, sample.pose), g = sample.geometry, s = body.rig.scale;
  const pts = [g.grip, g.tip, ...g.upperTip ? [g.upperTip, g.lowerTip, g.nock, g.drawGrip] : []], pad = Math.ceil(7 * s) + 3;
  const x = Math.min(body.x, Math.floor(Math.min(...pts.map((p) => p[0]))) - pad), y = Math.min(body.y, Math.floor(Math.min(...pts.map((p) => p[1]))) - pad), w = Math.max(body.x + body.w, Math.ceil(Math.max(...pts.map((p) => p[0]))) + pad) - x, h = Math.max(body.y + body.h, Math.ceil(Math.max(...pts.map((p) => p[1]))) + pad) - y;
  const mat = frame2(x, y, w, h), wire = frame2(x, y, w, h), bp = frame2(x, y, w, h), weapon = new Painter(mat), strings = new Painter(wire);
  blit(new Painter(bp), body);
  const P = (v2, c) => weapon.poly(v2.map((q) => q.map(Math.round)), hex(c));
  const line = (p, a, b, c) => p.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), hex(c));
  const d = g.direction, v = [-d[1], d[0]];
  if (kind === "sword") {
    const pommel = add(g.grip, d, -4.2 * s), guard = add(g.grip, d, 3.8 * s), base = add(g.grip, d, 5.1 * s);
    P([add(pommel, v, -1.35 * s), add(pommel, v, 1.35 * s), add(guard, v, 1.15 * s), add(guard, v, -1.15 * s)], "#664a3d");
    line(weapon, pommel, guard, "#664a3d");
    P([add(add(pommel, d, -1.2 * s), v, -1.4 * s), add(add(pommel, d, -1.2 * s), v, 1.4 * s), add(add(pommel, d, 0.6 * s), v, 1.5 * s), add(add(pommel, d, 0.6 * s), v, -1.5 * s)], "#ad915d");
    P([add(guard, v, -4.1 * s), add(guard, v, 4.1 * s), add(add(guard, d, 1.4 * s), v, 3.7 * s), add(add(guard, d, 1.4 * s), v, -3.7 * s)], "#a58b59");
    line(weapon, add(guard, v, -4.1 * s), add(guard, v, 4.1 * s), "#bfa374");
    const length = Math.hypot(g.tip[0] - base[0], g.tip[1] - base[1]), taper = 6 * s;
    const loX = Math.floor(Math.min(base[0], g.tip[0]) - 3 * s - 1), hiX = Math.ceil(Math.max(base[0], g.tip[0]) + 3 * s + 1);
    const loY = Math.floor(Math.min(base[1], g.tip[1]) - 3 * s - 1), hiY = Math.ceil(Math.max(base[1], g.tip[1]) + 3 * s + 1);
    for (let py = loY; py <= hiY; py++) for (let px = loX; px <= hiX; px++) {
      const dx = px + 0.5 - base[0], dy = py + 0.5 - base[1], along2 = dx * d[0] + dy * d[1], across = dx * v[0] + dy * v[1];
      if (along2 < -0.4 || along2 > length + 0.25) continue;
      const bodyWidth = mix4(2.3, 1.35, Math.min(1, Math.max(0, along2) / (length - taper))) * s;
      const width = Math.max(0.72, along2 > length - taper ? 1.35 * s * (length - along2) / taper : bodyWidth);
      if (Math.abs(across) > width) continue;
      weapon.px(px, py, hex(across > width - 0.72 ? "#dae2dd" : across > -0.3 * width ? "#a4b8bd" : "#536974"));
    }
    line(weapon, guard, base, "#738993");
  } else {
    const b = g.grip, up = g.upperTip, down = g.lowerTip, midUp = add(add(b, v, -12 * s), d, -1 * s), midDown = add(add(b, v, 12 * s), d, -1 * s);
    for (const points of [[up, midUp, b], [b, midDown, down]]) for (let i = 0; i < 2; i++) {
      const a = points[i], c = points[i + 1], n = unit(a, c), q = [-n[1] * 1.7 * s, n[0] * 1.7 * s];
      P([add(a, q), add(c, q), add(c, q, -1), add(a, q, -1)], "#9b7047");
      line(weapon, a, c, "#c69b5f");
    }
    line(strings, up, g.nock, "#9f9279");
    line(strings, g.nock, down, "#9f9279");
    if (g.loaded) arrow(strings, g.drawGrip, g.arrowTip, s);
  }
  const back = body.rig.view === "back", color = new Uint32Array(w * h), palm = (px, py) => {
    const grips = kind === "bow" ? [g.grip, g.drawGrip] : [g.grip];
    return grips.some((a) => Math.hypot(px - a[0], py - a[1]) <= 3.2 * s + 0.4);
  };
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx, bodyColor = bp.color[i], held2 = mat.color[i];
    color[i] = back ? bodyColor || held2 : held2 || bodyColor;
    if (bodyColor && palm(x + xx, y + yy)) color[i] = bodyColor;
  }
  const pixels = color.slice(), ink = style.outline === null ? 0 : hex(style.outline ?? "#252633");
  if (ink) for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx;
    const neighbors = style.outline !== void 0 || kind !== "sword" ? color : bp.color;
    if (!color[i] && (neighbors[i - 1] || neighbors[i + 1] || neighbors[i - w] || neighbors[i + w])) pixels[i] = ink;
  }
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx;
    if (wire.color[i] && !mat.color[i] && !(bp.color[i] && (back || palm(x + xx, y + yy)))) pixels[i] = wire.color[i];
  }
  const heldPixels = new Uint32Array(w * h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx;
    if (bp.color[i] && (back || palm(x + xx, y + yy))) continue;
    heldPixels[i] = mat.color[i] || wire.color[i];
  }
  const held = { x, y, w, h, pixels: heldPixels, mask: { w, h, data: Uint8Array.from(heldPixels, (c) => c >>> 24 ? 1 : 0) } };
  const actor = { ...body, x, y, w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (c) => c ? 1 : 0) } };
  let projectile = null;
  if (sample.projectile) {
    const a = sample.projectile, pp = Math.ceil(4 * s) + 3, px = Math.floor(Math.min(a.tail[0], a.tip[0])) - pp, py = Math.floor(Math.min(a.tail[1], a.tip[1])) - pp, pw = Math.ceil(Math.max(a.tail[0], a.tip[0])) - px + pp + 1, ph = Math.ceil(Math.max(a.tail[1], a.tip[1])) - py + pp + 1, f = frame2(px, py, pw, ph);
    arrow(new Painter(f), a.tail, a.tip, s);
    projectile = layer(f);
  }
  return { actor, projectile, sample, held };
}

// src/core/character-animation.ts
var HUMAN_ANIMATIONS_2D = Object.freeze(["idle", "walk", "wave", "guard", "crouch", "run", "jump", "punch", "block", "hit", "sword", "bow"]);
function characterSocket2D(position, angle = 0, layer2 = 0, flip = false) {
  const m = pixelTransform2D(position[0], position[1], angle, flip);
  return { position: [m[4], m[5]], basisX: [m[0], m[1]], basisY: [m[2], m[3]], visible: true, layer: layer2, mirrorPolicy: "reflect" };
}
function socketTransform2D(socket) {
  return [socket.basisX[0], socket.basisX[1], socket.basisY[0], socket.basisY[1], socket.position[0], socket.position[1]];
}
function transformCharacterSocket2D(socket, transform) {
  const m = composePixelTransform2D(transform, socketTransform2D(socket));
  return { ...socket, position: [m[4], m[5]], basisX: [m[0], m[1]], basisY: [m[2], m[3]] };
}
function humanSockets2D(sprite, weapon) {
  const r = sprite.rig, near = r.view === "front" || r.view === "back" ? "right" : "left", far = near === "right" ? "left" : "right", f = r.facing === "left";
  const oriented = (position, angle, layer2 = 1) => characterSocket2D(position, angle + (f ? Math.PI : 0), layer2, f);
  const hand = (side) => {
    const a = r[`${side}Elbow`], b = r[`${side}Hand`];
    return oriented(humanGrip2D(r, side), Math.atan2(b[1] - a[1], b[0] - a[0]));
  };
  const out = { root: characterSocket2D([0, 0], 0, 0, f), head: characterSocket2D(r.head, 0, 0, f), chest: characterSocket2D(r.chest, 0, 0, f), mouth: characterSocket2D([r.head[0] + (f ? -4 : 4) * r.scale, r.head[1] + 4 * r.scale], 0, 0, f), hand: hand(near), otherHand: hand(far), "hand.grip": hand(near), "hand.left": hand("left"), "hand.right": hand("right"), foot: characterSocket2D(r.leftAnkle, 0, 0, f), otherFoot: characterSocket2D(r.rightAnkle, 0, 0, f), "foot.left": characterSocket2D(r.leftAnkle, 0, 0, f), "foot.right": characterSocket2D(r.rightAnkle, 0, 0, f) };
  if (weapon) {
    const angle = Math.atan2(weapon.direction[1], weapon.direction[0]);
    out["weapon.base"] = oriented(weapon.grip, angle);
    out["weapon.tip"] = oriented(weapon.tip, angle);
    out["weapon.edge"] = oriented([(weapon.grip[0] + weapon.tip[0]) / 2, (weapon.grip[1] + weapon.tip[1]) / 2], angle);
    out["hand.grip"] = oriented(weapon.grip, angle);
    if (weapon.upperTip) out["bow.upperTip"] = oriented(weapon.upperTip, angle);
    if (weapon.lowerTip) out["bow.lowerTip"] = oriented(weapon.lowerTip, angle);
    if (weapon.nock) out["bow.nock"] = oriented(weapon.nock, angle);
    if (weapon.arrowTip) out.muzzle = oriented(weapon.arrowTip, angle);
  }
  return out;
}
function humanAnimationInfo2D(action) {
  if (!HUMAN_ANIMATIONS_2D.includes(action)) throw new RangeError("Unknown human animation: " + action);
  if (action === "run") return { duration: HUMAN_ACTION_TIMING.run.duration, loop: true, events: [{ id: "left-step", kind: "footstep", at: 0, socket: "foot.left" }, { id: "right-step", kind: "footstep", at: 0.4, socket: "foot.right" }] };
  if (action === "jump") return { duration: HUMAN_ACTION_TIMING.jump.duration, loop: false, events: [{ id: "takeoff", kind: "takeoff", at: HUMAN_ACTION_TIMING.jump.takeoff }, { id: "landing", kind: "landing", at: HUMAN_ACTION_TIMING.jump.landing }] };
  if (action === "punch" || action === "block" || action === "hit") return { duration: HUMAN_COMBAT_TIMING[action].duration, loop: false, events: [{ id: action + "-contact", kind: "contact", at: HUMAN_COMBAT_TIMING[action].contact, socket: action === "hit" ? "chest" : "hand.grip" }] };
  if (action === "sword" || action === "bow") return { duration: HUMAN_WEAPON_TIMING[action].duration, loop: false, events: [{ id: action + "-cue", kind: action === "sword" ? "slash" : "release", at: HUMAN_WEAPON_TIMING[action].cue, socket: action === "sword" ? "weapon.tip" : "muzzle" }] };
  return { duration: 2, loop: true, events: action === "walk" ? [{ id: "left-step", kind: "footstep", at: 0, socket: "foot.left" }, { id: "right-step", kind: "footstep", at: 1, socket: "foot.right" }] : [] };
}
function humanTravelSpeed2D(action, style = {}) {
  const view = style.view ?? "front", scale = (style.height ?? 96) / 96, sign = style.facing === "left" ? -1 : 1;
  const speed = action === "run" ? (view === "side" ? 30 : view === "three-quarter" ? 18 : 4.5) / (0.8 * 0.32) : action === "walk" ? view === "side" ? 20 : view === "three-quarter" ? 16 : 0 : 0;
  return speed * scale * sign;
}
function sampleHumanAnimation2D(action, time, style = {}, options = {}) {
  if (!Number.isFinite(time)) throw new RangeError("Animation time must be finite");
  const info = humanAnimationInfo2D(action), reduced = options.reducedMotion ?? false;
  let pose, phase = action, contacts = { left: true, right: true }, weapon;
  if (action === "run" || action === "jump") {
    const a = humanAction2D(action, time, style, reduced);
    pose = a.pose;
    phase = a.phase;
    contacts = a.contacts;
  } else if (action === "punch" || action === "block" || action === "hit") {
    const a = humanCombat2D(action, time, style, reduced);
    pose = a.pose;
    phase = a.phase;
    contacts = a.contacts;
  } else if (action === "sword" || action === "bow") {
    const a = humanWeapon2D(action, time, style, reduced);
    pose = a.pose;
    phase = a.phase;
    weapon = a.geometry;
  } else {
    pose = humanViewMotion2D(style.view ?? "front", action, time, reduced);
    if (action === "walk" && !reduced) {
      const u = (time % 2 + 2) % 2 / 2;
      contacts = { left: u < 0.5, right: u >= 0.5 };
    }
  }
  const rendered = weapon && options.weaponPixels !== false ? renderHumanWeapon2D(action, time, style, reduced) : void 0, sprite = rendered?.actor ?? renderHuman2D(style, pose);
  return { sprite, pose, projectile: rendered?.projectile, ...info, phase, contacts, weapon, sockets: humanSockets2D(sprite, weapon), rootMotion: [options.rootMotion && !reduced ? humanTravelSpeed2D(action, style) * Math.max(0, time) : 0, 0] };
}
function characterClipTime2D(time, duration, loop) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) throw new RangeError("Clip time and duration must be finite");
  if (!loop) return { time: Math.max(0, Math.min(time, duration)), cycle: 0 };
  const q = time / duration, nearest = Math.round(q), snapped = Math.abs(q - nearest) <= 8 * Number.EPSILON * Math.max(1, Math.abs(q)), cycle = snapped ? nearest : Math.floor(q);
  const local = snapped ? 0 : time - cycle * duration;
  return { time: Math.max(0, Math.min(duration, local)), cycle };
}
var poseScalars = ["x", "y", "lean", "gaze"];
var posePoints = ["leftHand", "rightHand", "leftFoot", "rightFoot"];
var poseDiscrete = ["leftElbow", "rightElbow", "leftKnee", "rightKnee", "blink", "fists", "armsFront"];
function keyAt(keys, time) {
  let low = 0, high = keys.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (keys[mid].at <= time) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}
function poseWeight(a, b, time) {
  if (!b || a.interpolation === "hold") return 0;
  const u = (time - a.at) / (b.at - a.at);
  return a.interpolation === "linear" ? u : u * u * (3 - 2 * u);
}
function compileHumanPoseClip2D(input) {
  if (!input || !Number.isFinite(input.duration) || input.duration <= 0 || !Array.isArray(input.keys) || !input.keys.length || input.keys[0]?.at !== 0 || input.loop !== void 0 && typeof input.loop !== "boolean") throw new RangeError("Pose clip needs a positive duration and first key at zero");
  input.keys.forEach((k, i) => {
    if (!k || !Number.isFinite(k.at) || k.at < 0 || k.at > input.duration || i > 0 && k.at <= input.keys[i - 1].at || k.interpolation !== void 0 && !["hold", "linear", "smooth"].includes(k.interpolation) || !k.pose || typeof k.pose !== "object" || Array.isArray(k.pose)) throw new RangeError("Pose keys must be strictly ordered with a valid interpolation");
    for (const name of poseScalars) if (k.pose[name] !== void 0 && !Number.isFinite(k.pose[name])) throw new RangeError("Pose channels must be finite");
    for (const name of posePoints) {
      const p = k.pose[name];
      if (p !== void 0 && (!Array.isArray(p) || p.length !== 2 || !Array.from(p).every(Number.isFinite))) throw new RangeError("Pose targets need two finite coordinates");
    }
    for (const name of ["blink", "fists", "armsFront"]) if (k.pose[name] !== void 0 && typeof k.pose[name] !== "boolean") throw new RangeError("Pose switches must be boolean");
    humanRig2D({}, k.pose);
  });
  const inputRoot = input.root ?? [{ at: 0, position: [0, 0] }];
  if (!Array.isArray(inputRoot) || !inputRoot.length || inputRoot[0]?.at !== 0) throw new RangeError("Root motion track must start at zero");
  inputRoot.forEach((k, i) => {
    if (!k || !Number.isFinite(k.at) || k.at < 0 || k.at > input.duration || !Array.isArray(k.position) || k.position.length !== 2 || !Array.from(k.position).every(Number.isFinite) || i > 0 && k.at <= inputRoot[i - 1].at) throw new RangeError("Invalid root motion track");
  });
  if (input.contacts !== void 0 && !Array.isArray(input.contacts)) throw new RangeError("Authored contact keys must be an array");
  input.contacts?.forEach((k, i) => {
    if (!k || !Number.isFinite(k.at) || k.at < 0 || k.at > input.duration || typeof k.left !== "boolean" || typeof k.right !== "boolean" || i > 0 && k.at <= input.contacts[i - 1].at) throw new RangeError("Invalid authored contact keys");
  });
  createCharacterEventCursor2D(input.duration, input.events ?? [], input.loop ?? false);
  const clip = JSON.parse(JSON.stringify(input));
  const root = clip.root ?? [{ at: 0, position: [0, 0] }];
  const tracks = new Map([...poseScalars, ...posePoints, ...poseDiscrete].map((name) => [name, clip.keys.filter((k) => k.pose[name] !== void 0)]));
  return { get clip() {
    return JSON.parse(JSON.stringify(clip));
  }, sample(time) {
    if (!Number.isFinite(time)) throw new RangeError("Pose time must be finite");
    const wrapped = characterClipTime2D(time, clip.duration, clip.loop ?? false), t = wrapped.time;
    const pose = {};
    for (const name of poseScalars) {
      const keys = tracks.get(name), i = keyAt(keys, t);
      if (i < 0) continue;
      const a = keys[i], b = keys[i + 1], u = poseWeight(a, b, t);
      pose[name] = a.pose[name] + ((b?.pose[name] ?? a.pose[name]) - a.pose[name]) * u;
    }
    for (const name of posePoints) {
      const keys = tracks.get(name), i = keyAt(keys, t);
      if (i < 0) continue;
      const a = keys[i], b = keys[i + 1], u = poseWeight(a, b, t), p = a.pose[name], q = b?.pose[name] ?? p;
      pose[name] = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    }
    for (const name of poseDiscrete) {
      const keys = tracks.get(name), i = keyAt(keys, t);
      if (i >= 0) Object.assign(pose, { [name]: keys[i].pose[name] });
    }
    const ri = keyAt(root, t), r = root[Math.max(0, ri)], s = root[ri + 1] ?? r, v = s.at > r.at ? (t - r.at) / (s.at - r.at) : 0, first = root[0].position, last = root[root.length - 1].position;
    const contacts = clip.contacts ?? [], contact = contacts[keyAt(contacts, t)];
    return { pose, rootMotion: [r.position[0] + (s.position[0] - r.position[0]) * v + wrapped.cycle * (last[0] - first[0]), r.position[1] + (s.position[1] - r.position[1]) * v + wrapped.cycle * (last[1] - first[1])], contacts: { left: contact?.left ?? false, right: contact?.right ?? false } };
  } };
}
function createCharacterEventCursor2D(duration, events, loop = false) {
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError("Event duration must be positive");
  const track = JSON.parse(JSON.stringify(events)), ids = /* @__PURE__ */ new Set();
  for (const event of track) {
    if (!event.id || ids.has(event.id) || !Number.isFinite(event.at) || event.at < 0 || event.at > duration) throw new RangeError("Events need unique IDs and times inside the clip");
    if (loop && event.at === duration) throw new RangeError("Loop endpoint events belong at time zero");
    ids.add(event.id);
  }
  track.sort((a, b) => a.at - b.at);
  let previous = -Number.EPSILON;
  return { seek(time) {
    if (!Number.isFinite(time)) throw new RangeError("Seek time must be finite");
    previous = time;
  }, restart() {
    previous = -Number.EPSILON;
  }, advance(time) {
    if (!Number.isFinite(time)) throw new RangeError("Playback time must be finite");
    if (time < previous) {
      previous = time;
      return [];
    }
    const from = previous;
    if (time < 0) {
      previous = time;
      return [];
    }
    if (!track.length) {
      previous = time;
      return [];
    }
    const tolerance = 8 * Number.EPSILON * Math.max(Math.abs(time), from >= 0 ? Math.abs(from) : 0, duration);
    const first = loop ? Math.max(0, characterClipTime2D(Math.max(0, from), duration, true).cycle) : 0, last = loop ? characterClipTime2D(time, duration, true).cycle : 0;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw new RangeError("Loop cycle exceeds safe integer playback; use a local clock");
    if ((last - first + 1) * track.length > 1e5) throw new RangeError("Playback jump contains too many events; use seek explicitly");
    previous = time;
    const out = [];
    for (let cycle = first; cycle <= last; cycle++) for (const event of track) {
      const at = cycle * duration + event.at;
      if (at > (from < 0 ? from : from + tolerance) && at <= time + tolerance) out.push({ ...event, time: at, cycle, source: "timeline" });
    }
    return out;
  } };
}
function bakeSecondaryMotion2D(input) {
  const fps = input.fps ?? 60, stiffness = input.stiffness ?? 55, damping = input.damping ?? 12, limit = input.maxAngle ?? 0.7;
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 120 || !Number.isInteger(fps) || fps < 1 || fps > 240 || !input.targets.length || ![stiffness, damping, limit].every((n2) => Number.isFinite(n2) && n2 >= 0) || stiffness > 1e3 || damping > 120 || limit > Math.PI) throw new RangeError("Invalid secondary motion bake");
  const targets = Array.from(input.targets);
  targets.forEach((q, i) => {
    if (!Number.isFinite(q.at) || !Number.isFinite(q.angle) || i && q.at <= targets[i - 1].at) throw new RangeError("Secondary targets must be ordered");
  });
  const target = (t) => {
    let a = targets[0], b = a;
    for (const q of targets) {
      if (q.at <= t) a = q;
      else {
        b = q;
        break;
      }
      b = a;
    }
    const u = b.at > a.at ? Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at))) : 0;
    return Math.max(-limit, Math.min(limit, a.angle + (b.angle - a.angle) * u));
  };
  const dt = 1 / 240, n = Math.ceil(input.duration * 240), result = [];
  let angle = target(0), velocity = 0, next = 0;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(input.duration, i * dt);
    while (next / fps <= t + 1e-10 && next / fps <= input.duration) {
      result.push({ at: next / fps, angle });
      next++;
    }
    const acceleration = (target(t) - angle) * stiffness - velocity * damping;
    velocity += acceleration * dt;
    angle += velocity * dt;
    if (angle > limit || angle < -limit) {
      angle = Math.max(-limit, Math.min(limit, angle));
      velocity = 0;
    }
  }
  if (result[result.length - 1].at < input.duration) result.push({ at: input.duration, angle });
  return result;
}
function sampleSecondaryMotion2D(keys, time) {
  if (!keys.length) return 0;
  let a = keys[0], b = a;
  for (const key of keys) {
    if (key.at <= time) a = key;
    else {
      b = key;
      break;
    }
    b = a;
  }
  const u = b.at > a.at ? Math.max(0, Math.min(1, (time - a.at) / (b.at - a.at))) : 0;
  return a.angle + (b.angle - a.angle) * u;
}

// src/core/character-sockets.ts
var point2 = (p) => p.length === 2 && p.every(Number.isFinite);
var shortestArc = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function validateCharacterSocketTrack2D(track, duration = Infinity) {
  if (!track || !["delta", "override"].includes(track.mode) || !Array.isArray(track.keys) || !track.keys.length || track.keys.length > 4096) throw new RangeError("Socket track needs a mode and 1..4096 keys");
  let angles = false, bases = false;
  track.keys.forEach((key, i) => {
    if (!key || !Number.isFinite(key.at) || key.at < 0 || key.at > duration || i > 0 && key.at <= track.keys[i - 1].at || key.interpolation !== void 0 && !["hold", "linear"].includes(key.interpolation)) throw new RangeError("Socket keys must be strictly ordered within clip duration");
    if (key.position !== void 0 && !point2(key.position) || key.angle !== void 0 && !Number.isFinite(key.angle) || key.visible !== void 0 && typeof key.visible !== "boolean") throw new RangeError("Socket key values must be finite native coordinates and boolean visibility");
    if (key.basisX === void 0 !== (key.basisY === void 0) || key.angle !== void 0 && key.basisX !== void 0) throw new RangeError("Socket keys use an angle or a paired basis, never both");
    if (key.basisX) {
      if (!point2(key.basisX) || !point2(key.basisY)) throw new RangeError("Socket bases need two finite vectors");
      invertPixelTransform2D([key.basisX[0], key.basisX[1], key.basisY[0], key.basisY[1], 0, 0]);
      bases = true;
    }
    if (key.angle !== void 0) angles = true;
    if (key.position === void 0 && key.angle === void 0 && key.basisX === void 0 && key.visible === void 0) throw new RangeError("Socket key must change a channel");
  });
  if (angles && bases) throw new RangeError("Use consistent angle or basis orientation keys in one socket track");
}
function splitBasis(x, y) {
  const length = Math.hypot(x[0], x[1]);
  return { angle: Math.atan2(x[1], x[0]), x: length, y: (x[0] * y[1] - x[1] * y[0]) / length, shear: (x[0] * y[0] + x[1] * y[1]) / length };
}
function joinBasis(parts) {
  const c = Math.cos(parts.angle), s = Math.sin(parts.angle);
  return { basisX: [c * parts.x, s * parts.x], basisY: [c * parts.shear - s * parts.y, s * parts.shear + c * parts.y] };
}
function interpolateBasis(a, b, u) {
  const p = splitBasis(a.basisX, a.basisY), q = splitBasis(b.basisX, b.basisY);
  return joinBasis({ angle: p.angle + shortestArc(p.angle, q.angle) * u, x: p.x + (q.x - p.x) * u, y: Math.sign(u < 1 ? p.y : q.y) * (Math.abs(p.y) + (Math.abs(q.y) - Math.abs(p.y)) * u), shear: p.shear + (q.shear - p.shear) * u });
}
function sampleValidated(track, time) {
  if (!Number.isFinite(time)) throw new RangeError("Socket track time must be finite");
  let last;
  for (const key of track.keys) {
    if (key.at > time) break;
    last = key;
  }
  if (!last) return null;
  const out = { at: time, interpolation: last.interpolation ?? "hold" };
  for (const channel of ["position", "angle", "basisX", "visible"]) {
    let a, b;
    for (const key of track.keys) if (key[channel] !== void 0) {
      if (key.at <= time) a = key;
      else {
        b = key;
        break;
      }
    }
    if (!a) continue;
    const u = b && a.interpolation === "linear" ? (time - a.at) / (b.at - a.at) : 0;
    if (channel === "position") out.position = [a.position[0] + ((b?.position?.[0] ?? a.position[0]) - a.position[0]) * u, a.position[1] + ((b?.position?.[1] ?? a.position[1]) - a.position[1]) * u];
    else if (channel === "angle") out.angle = a.angle + (b ? shortestArc(a.angle, b.angle) * u : 0);
    else if (channel === "basisX") Object.assign(out, b && u ? interpolateBasis(a, b, u) : { basisX: [...a.basisX], basisY: [...a.basisY] });
    else out.visible = a.visible;
  }
  return out;
}
function sampleCharacterSocketTrack2D(track, time) {
  validateCharacterSocketTrack2D(track);
  return sampleValidated(track, time);
}
function compileCharacterSocketTrack2D(track, duration = Infinity) {
  validateCharacterSocketTrack2D(track, duration);
  const snapshot = JSON.parse(JSON.stringify(track));
  return { mode: snapshot.mode, sample: (time) => sampleValidated(snapshot, time) };
}
function applyCharacterSocketKey2D(baseline, value, mode) {
  if (!baseline && (!value?.position || mode !== "override")) return void 0;
  const base = baseline ?? characterSocket2D([0, 0]);
  if (!value) return { ...base, position: [...base.position], basisX: [...base.basisX], basisY: [...base.basisY] };
  let m;
  if (mode === "delta") {
    const delta = value.basisX && value.basisY ? [value.basisX[0], value.basisX[1], value.basisY[0], value.basisY[1], value.position?.[0] ?? 0, value.position?.[1] ?? 0] : pixelTransform2D(value.position?.[0] ?? 0, value.position?.[1] ?? 0, value.angle ?? 0);
    m = composePixelTransform2D(socketTransform2D(base), delta);
  } else {
    const basis = value.basisX && value.basisY ? value : value.angle === void 0 ? base : joinBasis({ ...splitBasis(base.basisX, base.basisY), angle: value.angle });
    m = [basis.basisX[0], basis.basisX[1], basis.basisY[0], basis.basisY[1], value.position?.[0] ?? base.position[0], value.position?.[1] ?? base.position[1]];
  }
  return { ...base, position: [m[4], m[5]], basisX: [m[0], m[1]], basisY: [m[2], m[3]], visible: value.visible ?? base.visible };
}

// src/core/creature.ts
var TAU = Math.PI * 2;
var speciesList = ["fox", "cat", "owl", "dragon"];
var colors = {
  fox: { body: ["#965235", "#c77943", "#e7aa60"], accent: ["#ac9982", "#d6c7a2", "#f1e1bb"] },
  cat: { body: ["#526779", "#788d9d", "#acbdc6"], accent: ["#9a8d84", "#c3b8a4", "#e4d9bb"] },
  owl: { body: ["#71604e", "#a18460", "#c9ac7e"], accent: ["#a49678", "#d1c7a3", "#eee3bd"] },
  dragon: { body: ["#34685e", "#508e76", "#80b28b"], accent: ["#7c5062", "#aa7180", "#d2999b"] }
};
var finite3 = (n, label) => {
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be finite`);
  return n;
};
var validColor = (c) => typeof c === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c);
function validate3(style, motion, t, options) {
  const species = style.species ?? "fox", size = style.size ?? 96;
  if (!speciesList.includes(species)) throw new RangeError(`Unknown creature species: ${species}`);
  finite3(size, "size");
  if (size < 32 || size > 192) throw new RangeError("creature size must be 32..192");
  finite3(t, "time");
  if (Math.abs(t) > 1e9) throw new RangeError("time must be within \xB11e9 seconds");
  if (style.facing !== void 0 && !["right", "left"].includes(style.facing)) throw new RangeError("facing must be right or left");
  for (const key of ["body", "accent"]) {
    const v = style[key];
    if (v !== void 0 && (!Array.isArray(v) || v.length < 3 || v.length > 6 || !Array.from(v).every(validColor))) throw new TypeError(`${key} needs three to six #rgb or #rrggbb colors`);
  }
  if (style.outline !== void 0 && style.outline !== null && !validColor(style.outline)) throw new TypeError("outline must be a color or null");
  if (options.reducedMotion !== void 0 && typeof options.reducedMotion !== "boolean") throw new TypeError("reducedMotion must be boolean");
  const allowed = species === "fox" || species === "cat" ? ["idle", "walk", "trot"] : ["idle", "fly"];
  if (!allowed.includes(motion)) throw new RangeError(`${species} supports ${allowed.join(", ")}, not ${motion}`);
  return { species, size };
}
var polar = (p, length, angle) => [p[0] + length * Math.cos(angle), p[1] + length * Math.sin(angle)];
function twoBone(a, b, upper, lower, bend) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
  if (d >= upper + lower || d <= Math.abs(upper - lower)) throw new RangeError("Creature preset contains an unreachable leg");
  const c = (upper * upper - lower * lower + d * d) / (2 * d), h = Math.sqrt(Math.max(0, upper * upper - c * c));
  return [a[0] + dx / d * c - dy / d * h * bend, a[1] + dy / d * c + dx / d * h * bend];
}
var phaseAt = (t, period) => {
  const p = (t % period + period) % period / period;
  return p < 1e-12 || 1 - p < 1e-12 ? 0 : p;
};
function creatureRig2D(style = {}, motion = "idle", seconds = 0, options = {}) {
  const { species, size } = validate3(style, motion, seconds, options), scale = size / 96;
  const quadruped = species === "fox" || species === "cat", moving = !options.reducedMotion;
  const period = motion === "trot" ? 1 : motion === "walk" ? 2 : motion === "fly" ? 1.5 : 3;
  const phase = moving ? phaseAt(seconds, period) : 0, a = phase * TAU;
  const active = moving && motion !== "idle";
  const bob = active ? motion === "fly" ? 1.8 * Math.sin(a - 0.5) : motion === "trot" ? -1.2 * (1 - Math.cos(a * 2)) : -0.35 * (1 - Math.cos(a * 4)) : moving ? 0.4 * Math.sin(a) : 0;
  const root = [0, (quadruped ? -27 : -37) + bob];
  const head = quadruped ? [species === "fox" ? 29 : 25, root[1] - (species === "fox" ? 9 : 8)] : [species === "owl" ? 18 : 27, root[1] - (species === "owl" ? 4 : 5)];
  const legs = [], wings = [];
  const duty = motion === "trot" ? 0.54 : 0.76, span = motion === "trot" ? 18 : 13;
  const travelSpeed = active && quadruped ? span / (duty * period) : 0;
  if (quadruped) {
    const names = ["farHind", "farFront", "nearHind", "nearFront"];
    const walkOffsets = { nearHind: 0, nearFront: 0.75, farHind: 0.5, farFront: 0.25 };
    const trotOffsets = { nearHind: 0, nearFront: 0.5, farHind: 0.5, farFront: 0 };
    for (const name of names) {
      const front = name.endsWith("Front"), far = name.startsWith("far");
      const p = active ? phaseAt(phase + (motion === "trot" ? trotOffsets : walkOffsets)[name], 1) : 0;
      const contact = !active || p < duty;
      const stride = active ? contact ? span / 2 - span * p / duty : -span / 2 + span * (0.5 - 0.5 * Math.cos(Math.PI * (p - duty) / (1 - duty))) : 0;
      const lift = active && !contact ? (motion === "trot" ? 7 : 5) * Math.sin(Math.PI * (p - duty) / (1 - duty)) : 0;
      const x = (front ? 16 : -17) + (far ? 1.8 : 0), toe = [x + stride, -1 - lift];
      const ankle = [toe[0] - (front ? 1 : 3), toe[1] - 3];
      const rr = [x, root[1] + (front ? 0 : 1)];
      const upper = front ? 14 : 15, lower = front ? 14 : 14;
      legs.push({ name, root: rr, joint: twoBone(rr, ankle, upper, lower, front ? 1 : -1), ankle, toe, lengths: [upper, lower, Math.hypot(toe[0] - ankle[0], toe[1] - ankle[1])], contact, phase: p });
    }
  } else {
    for (const far of [true, false]) {
      const flap = motion === "fly" && moving ? Math.sin(a) : -0.5;
      const sh = [species === "owl" ? -4 : -2, root[1] - 4 + (far ? -2 : 0)];
      const theta = Math.PI - (0.18 + flap * 1.05) + (far ? 0.16 : 0), upper = species === "owl" ? 19 : 25, lower = species === "owl" ? 19 : 27;
      const el = polar(sh, upper, theta), wr = polar(el, lower, theta + 0.14 + 0.38 * Math.max(0, -flap));
      const tips = [];
      for (let i = 0; i < 6; i++) {
        const angle = theta + 0.2 + i * (species === "owl" ? 0.24 : 0.31), length = (species === "owl" ? 24 : 34) * (1 - i * 0.065);
        tips.push(polar(wr, length, angle));
      }
      wings.push({ shoulder: sh, elbow: el, wrist: wr, tips, lengths: [upper, lower], far });
    }
  }
  const tail = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    if (species === "fox") tail.push([-22 - u * 36, root[1] + 3 + Math.sin(u * Math.PI) * 5 - u * 9 + (moving ? Math.sin(a - u * 1.8) * u * 2.4 : 0)]);
    else if (species === "cat") tail.push([-22 - 30 * Math.sin(u * 1.45), root[1] + 2 - 26 * u * u + (moving ? Math.sin(a - u * 2) * u * 2 : 0)]);
    else if (species === "dragon") tail.push([-20 - u * 49, root[1] + 3 + Math.sin(u * Math.PI) * 10 + (moving ? Math.sin(a - u * 2.5) * u * 6 : 0)]);
    else tail.push([-14 - u * 18, root[1] + 5 + u * 6]);
  }
  const facing = style.facing ?? "right", mult = facing === "left" ? -1 : 1;
  const pt = (p) => [p[0] * scale * mult, p[1] * scale];
  return {
    species,
    motion,
    facing,
    scale,
    phase,
    period,
    root: pt(root),
    head: pt(head),
    travelSpeed: travelSpeed * scale * mult,
    legs: legs.map((l) => ({ ...l, root: pt(l.root), joint: pt(l.joint), ankle: pt(l.ankle), toe: pt(l.toe), lengths: l.lengths.map((n) => n * scale) })),
    wings: wings.map((w) => ({ ...w, shoulder: pt(w.shoulder), elbow: pt(w.elbow), wrist: pt(w.wrist), tips: w.tips.map(pt), lengths: w.lengths.map((n) => n * scale) })),
    tail: tail.map(pt)
  };
}
function reflected(sp, rig) {
  const pixels = new Uint32Array(sp.pixels.length), data = new Uint8Array(sp.pixels.length);
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
    const to = y * sp.w + sp.w - x - 1, from = y * sp.w + x;
    pixels[to] = sp.pixels[from];
    data[to] = sp.mask.data[from];
  }
  return { ...sp, x: -sp.x - sp.w, pixels, mask: { w: sp.w, h: sp.h, data }, rig };
}
function renderCreature2D(style = {}, motion = "idle", seconds = 0, options = {}) {
  const r = creatureRig2D(style, motion, seconds, options);
  if (style.facing === "left") return reflected(renderCreature2D({ ...style, facing: "right" }, motion, seconds, options), r);
  const s = r.scale, species = r.species, quadruped = species === "fox" || species === "cat";
  const x = Math.floor(-110 * s) - 3, y = Math.floor(-125 * s) - 3, w = Math.ceil(165 * s) + 7, h = Math.ceil(170 * s) + 7;
  const frame4 = { w, h, ox: x, oy: y, color: new Uint32Array(w * h), light: new Uint32Array(w * h) }, p = new Painter(frame4);
  const bodyRamp = (style.body ?? colors[species].body).map(hex), accentRamp = (style.accent ?? colors[species].accent).map(hex);
  const select = (ramp) => [ramp[0], ramp[Math.floor((ramp.length - 1) / 2)], ramp[ramp.length - 1]];
  const rawBody = select(bodyRamp), rawAccent = select(accentRamp);
  const body = [mix(rawBody[1], rawBody[0], 0.42), rawBody[1], mix(rawBody[1], rawBody[2], 0.34)];
  const acc = [mix(rawAccent[1], rawAccent[0], 0.5), rawAccent[1], mix(rawAccent[1], rawAccent[2], 0.45)];
  const occluded = mix(body[1], rawBody[0], 0.52), furShadow = mix(body[1], rawBody[0], 0.28);
  const feather = species === "owl" ? mix(body[1], acc[1], 0.38) : acc[1];
  const dark = hex(species === "fox" ? "#634633" : species === "cat" ? "#3d5266" : species === "owl" ? "#594b41" : "#294e4f"), eye = hex("#272d39");
  const P = (points, c) => {
    const cells = points.map((q) => [Math.round(q[0]), Math.round(q[1])]);
    p.poly(cells, c);
    p.polyline([...cells, cells[0]], c);
  };
  const off = (q, dx, dy) => [q[0] + dx * s, q[1] + dy * s];
  const ell = (q, rx, ry, c) => p.ellipse(Math.round(q[0]), Math.round(q[1]), Math.max(0.65, rx * s), Math.max(0.65, ry * s), c);
  const band = (a, b, ra, rb, c) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), nx = d ? -dy / d : 0, ny = d ? dx / d : 1;
    const ar = Math.max(0.8, ra * s), br = Math.max(0.8, rb * s);
    P([[a[0] + nx * ar, a[1] + ny * ar], [b[0] + nx * br, b[1] + ny * br], [b[0] - nx * br, b[1] - ny * br], [a[0] - nx * ar, a[1] - ny * ar]], c);
    ell(a, ra, ra, c);
    ell(b, rb, rb, c);
    p.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), c);
  };
  for (let i = 1; i < r.tail.length; i++) {
    const u = i / (r.tail.length - 1), radius = species === "fox" ? 1 + 4.8 * Math.sin(Math.PI * u * 0.94) : species === "cat" ? 2 * (1 - u * 0.7) : species === "dragon" ? 3.5 * (1 - u) + 0.6 : 4 - u;
    band(r.tail[i - 1], r.tail[i], radius, radius * 0.95, species === "fox" && u > 0.71 ? acc[1] : body[1]);
  }
  const leg = (l) => {
    const far = l.name.startsWith("far"), front = l.name.endsWith("Front"), c = far ? occluded : body[1];
    band(l.root, l.joint, front ? 3.1 : 4.7, front ? 2.3 : 3.1, c);
    band(l.joint, l.ankle, front ? 2.3 : 3.1, 1.3, c);
    band(l.ankle, l.toe, 1.4, 1.7, c);
    ell(off(l.toe, 1, -0.1), 2.8, 1.1, species === "fox" ? mix(c, dark, 0.48) : c);
  };
  const wing = (v) => {
    const c = v.far ? occluded : body[1], wingAcc = v.far ? mix(feather, acc[0], 0.4) : feather;
    if (species === "owl") {
      const base = off(v.shoulder, 2, 10);
      P([v.shoulder, v.elbow, v.wrist, ...v.tips, base], c);
      for (let i = 0; i < v.tips.length; i++) {
        const tip = v.tips[i], start = [v.wrist[0] + (base[0] - v.wrist[0]) * i / 8, v.wrist[1] + (base[1] - v.wrist[1]) * i / 8];
        band(start, tip, 3.5, 1, wingAcc);
      }
      P([v.shoulder, v.elbow, v.wrist, off(v.tips[0], 8, 4), base], c);
      band(v.shoulder, v.elbow, 4, 3, c);
      band(v.elbow, v.wrist, 3, 1.5, c);
      if (!v.far && s >= 0.66 && bodyRamp.length > 3) {
        const mid = [(v.shoulder[0] + v.elbow[0]) * 0.5, (v.shoulder[1] + v.elbow[1]) * 0.5];
        ell(mid, 3, 2, mix(c, bodyRamp[bodyRamp.length - 2], 0.2));
      }
    } else {
      const base = off(r.root, -14, 10), edge = [];
      for (let i = 0; i < v.tips.length; i++) {
        const q = v.tips[i];
        edge.push(q);
        const next = v.tips[i + 1] ?? base;
        edge.push([(q[0] + next[0]) * 0.5 + (v.wrist[0] - (q[0] + next[0]) * 0.5) * 0.28, (q[1] + next[1]) * 0.5 + (v.wrist[1] - (q[1] + next[1]) * 0.5) * 0.28]);
      }
      P([v.shoulder, v.elbow, v.wrist, ...edge, base], wingAcc);
      for (let i = 0; i < v.tips.length; i++) band(v.wrist, v.tips[i], 0.75, 0.45, mix(wingAcc, acc[0], 0.3));
      band(v.shoulder, v.elbow, 3, 2, c);
      band(v.elbow, v.wrist, 2, 1.2, c);
      ell(v.wrist, 1.8, 1.8, c);
      if (!v.far && s >= 0.66 && accentRamp.length > 3) for (let i = 1; i < v.tips.length; i += 2) {
        const tip = v.tips[i];
        band(v.wrist, [(v.wrist[0] + tip[0]) * 0.5, (v.wrist[1] + tip[1]) * 0.5], 1, 0.6, mix(wingAcc, accentRamp[accentRamp.length - 2], 0.18));
      }
    }
  };
  r.wings.filter((v) => v.far).forEach(wing);
  r.legs.filter((l) => l.name.startsWith("far")).forEach(leg);
  if (quadruped) {
    ell(r.root, species === "cat" ? 24 : 23, species === "cat" ? 8 : 9, body[1]);
    ell(off(r.root, -14, 1), 10, 9, body[1]);
    ell(off(r.root, 14, -1), 9, 11, body[1]);
    P([off(r.root, -14, 4), off(r.root, 13, 3), off(r.root, 12, 7), off(r.root, 1, 8), off(r.root, -9, 6)], furShadow);
    ell(off(r.root, -3, -3), 17, 4.8, body[2]);
    if (s >= 0.66 && bodyRamp.length > 3) {
      ell(off(r.root, -9, -2), 9, 3, mix(body[1], bodyRamp[bodyRamp.length - 2], 0.23));
    }
    band(off(r.root, 16, -1), off(r.head, -4, 2), 7, 7, body[1]);
    if (species === "fox") P([off(r.head, -7, 0), off(r.head, 5, 6), off(r.root, 16, 13), off(r.root, 11, 5)], acc[1]);
    r.legs.filter((l) => l.name.startsWith("near")).forEach(leg);
    const H = r.head;
    ell(H, species === "fox" ? 9 : 9, species === "fox" ? 7 : 8, body[1]);
    if (species === "fox") {
      P([off(H, 3, -3), off(H, 17, 2), off(H, 14, 5), off(H, 2, 6), off(H, -2, 3)], body[2]);
      P([off(H, 3, 3), off(H, 14, 4), off(H, 9, 7), off(H, -3, 7)], acc[2]);
      P([off(H, -7, -4), off(H, -7, -18), off(H, 1, -7)], body[0]);
      P([off(H, -1, -5), off(H, 3, -18), off(H, 8, -4)], body[1]);
      P([off(H, 1, -8), off(H, 3, -14), off(H, 5, -7)], acc[0]);
      ell(off(H, 15, 2), 2, 1.4, dark);
    } else {
      P([off(H, -8, -4), off(H, -7, -16), off(H, 0, -8)], body[0]);
      P([off(H, 0, -7), off(H, 6, -15), off(H, 8, -2)], body[1]);
      P([off(H, 2, -8), off(H, 5, -12), off(H, 6, -5)], acc[0]);
      ell(off(H, 7, 3), 4, 3, acc[1]);
      ell(off(H, 10, 2), 1.5, 1, acc[0]);
      if (s >= 0.7) {
        P([off(r.root, -13, -7), off(r.root, -9, -8), off(r.root, -11, -1)], furShadow);
        P([off(r.root, -3, -8), off(r.root, 1, -8), off(r.root, -1, -2)], furShadow);
      }
    }
    ell(off(H, species === "fox" ? 6 : 5, -2), 1.2, 1.2, eye);
    if (s >= 1) ell(off(H, species === "fox" ? 6 : 5, -2.5), 0.5, 0.5, acc[2]);
  } else {
    ell(r.root, species === "owl" ? 20 : 24, species === "owl" ? 10 : 9, body[1]);
    P([off(r.root, -17, 3), off(r.root, 15, 2), off(r.root, 8, 9), off(r.root, -6, 10)], species === "owl" ? acc[1] : body[0]);
    band(off(r.root, 13, -1), off(r.head, -4, 1), 7, 6, body[1]);
    for (const dx of [-12, 7]) {
      band(off(r.root, dx, 5), off(r.root, dx - 4, 12), 3, 1.5, body[0]);
      P([off(r.root, dx - 5, 11), off(r.root, dx + 2, 12), off(r.root, dx + 5, 16), off(r.root, dx, 14), off(r.root, dx - 4, 14)], acc[0]);
    }
    if (species === "owl") {
      ell(r.head, 11, 11, body[1]);
      ell(off(r.head, 4, 0), 7, 8, acc[1]);
      ell(off(r.head, 7, -1), 3.4, 3.8, acc[2]);
      ell(off(r.head, 8, -1), 1.8, 2, eye);
      P([off(r.head, 9, 3), off(r.head, 16, 4), off(r.head, 13, 8)], hex("#a9894e"));
      P([off(r.head, -8, -6), off(r.head, -8, -13), off(r.head, -3, -10)], body[0]);
    } else {
      ell(r.head, 10, 6.5, body[1]);
      P([off(r.head, 3, -3), off(r.head, 18, 0), off(r.head, 18, 4), off(r.head, 5, 6)], body[2]);
      P([off(r.head, -6, -5), off(r.head, -15, -13), off(r.head, -4, -9), off(r.head, 0, -5)], acc[1]);
      P([off(r.head, 0, -6), off(r.head, -5, -14), off(r.head, 4, -7)], acc[2]);
      ell(off(r.head, 6, -2), 2, 1.5, acc[2]);
      ell(off(r.head, 7, -2), 0.7, 1.2, eye);
      ell(off(r.head, 16, 1), 1, 0.7, body[0]);
      for (let i = 0; i < 5; i++) {
        const q = r.tail[2 + i * 2];
        P([off(q, 2, -1), off(q, -1, -6 + i * 0.5), off(q, -4, 0)], body[2]);
      }
    }
    r.wings.filter((v) => !v.far).forEach(wing);
  }
  const pixels = frame4.color.slice(), ink = style.outline ? hex(style.outline) : 0;
  if (ink) for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx;
    if (!frame4.color[i] && (frame4.color[i - 1] || frame4.color[i + 1] || frame4.color[i - w] || frame4.color[i + w])) pixels[i] = ink;
  }
  return { x, y, w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (c) => c ? 1 : 0) }, rig: r };
}

// src/core/sprite-clip.ts
var copySocket = (socket) => ({
  ...socket,
  ...socket.basisX ? { basisX: [socket.basisX[0], socket.basisX[1]] } : {},
  ...socket.basisY ? { basisY: [socket.basisY[0], socket.basisY[1]] } : {}
});
var MAX_DIMENSION = 4096;
var MAX_FRAMES = 4096;
var MAX_CELLS = 16777216;
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
var validateOptions = (options) => {
  if (!object(options) || options.tag !== void 0 && (typeof options.tag !== "string" || !options.tag.length) || options.loop !== void 0 && typeof options.loop !== "boolean" || options.emissionKind !== void 0 && !["surface", "optical"].includes(options.emissionKind))
    throw new RangeError("Sprite clip options need a tag name and/or a boolean loop flag");
};
function createSpriteClip2D(data, options = {}) {
  if (!object(data) || data.version !== 1)
    throw new RangeError("Sprite clip version must be 1");
  const { width, height } = data;
  if (!integer(width, 1, MAX_DIMENSION) || !integer(height, 1, MAX_DIMENSION))
    throw new RangeError("Sprite clip dimensions must be integers from 1 to 4096");
  if (!Array.isArray(data.pivot) || data.pivot.length !== 2 || !Number.isFinite(data.pivot[0]) || !Number.isFinite(data.pivot[1]))
    throw new RangeError("Sprite clip pivot must contain two finite coordinates");
  if (!Array.isArray(data.frames) || !integer(data.frames.length, 1, MAX_FRAMES) || width * height * data.frames.length > MAX_CELLS)
    throw new RangeError("Sprite clip needs 1 to 4096 frames and at most 16,777,216 decoded cells in total");
  if (data.source !== void 0 && !object(data.source))
    throw new RangeError("Sprite clip source metadata must be an object");
  validateOptions(options);
  const count = width * height, frameCount = data.frames.length;
  const pivot = Object.freeze([data.pivot[0], data.pivot[1]]);
  const tags = /* @__PURE__ */ new Map();
  if (data.tags !== void 0) {
    if (!Array.isArray(data.tags)) throw new RangeError("Sprite clip tags must be an array");
    for (const tag of data.tags) {
      if (!object(tag) || typeof tag.name !== "string" || !tag.name.length || tags.has(tag.name) || !integer(tag.from, 0, frameCount - 1) || !integer(tag.to, tag.from, frameCount - 1) || tag.direction !== void 0 && !["forward", "reverse", "pingpong", "pingpong_reverse"].includes(tag.direction) || tag.repeat !== void 0 && !integer(tag.repeat, 0, Number.MAX_SAFE_INTEGER))
        throw new RangeError("Sprite clip tags need unique names, valid frame ranges, directions and nonnegative integer repeats");
      tags.set(tag.name, { ...tag });
    }
  }
  if (options.tag !== void 0 && !tags.has(options.tag)) throw new RangeError(`Unknown sprite clip tag: ${options.tag}`);
  const pixels = [], durations = [], masks = [];
  const sockets = [], emissions = [];
  for (const frame4 of data.frames) {
    if (!object(frame4) || !Number.isFinite(frame4.durationMs) || !(frame4.durationMs / 1e3 > 0) || !Array.isArray(frame4.runs) || !frame4.runs.length || frame4.runs.length % 2 || frame4.runs.length > count * 2)
      throw new RangeError("Sprite clip frames need a positive finite duration and count/color run pairs");
    const decoded = new Uint32Array(count);
    let offset = 0;
    for (let i = 0; i < frame4.runs.length; i += 2) {
      const length = frame4.runs[i], color = frame4.runs[i + 1];
      if (!integer(length, 1, count - offset) || !integer(color, 0, 4294967295))
        throw new RangeError("Sprite clip runs need positive counts and unsigned packed 32-bit colors within the frame bounds");
      decoded.fill(color, offset, offset + length);
      offset += length;
    }
    if (offset !== count) throw new RangeError("Sprite clip runs must fill exactly width * height pixels");
    const socketMap = /* @__PURE__ */ Object.create(null);
    if (frame4.sockets !== void 0) {
      if (!object(frame4.sockets) || Object.keys(frame4.sockets).length > 128)
        throw new RangeError("Sprite clip sockets must be a map of at most 128 named sockets");
      for (const [name, rawSocket] of Object.entries(frame4.sockets)) {
        const socket = rawSocket;
        if (!name || ["__proto__", "prototype", "constructor"].includes(name) || !object(socket) || !Number.isFinite(socket.x) || !Number.isFinite(socket.y) || socket.angle !== void 0 && !Number.isFinite(socket.angle) || socket.visible !== void 0 && typeof socket.visible !== "boolean")
          throw new RangeError("Sprite clip sockets need names and finite coordinates/angles");
        if (socket.basisX === void 0 !== (socket.basisY === void 0) || [socket.basisX, socket.basisY].some((v) => v !== void 0 && (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite))) || socket.basisX && socket.basisY && (!Number.isFinite(socket.basisX[0] * socket.basisY[1] - socket.basisX[1] * socket.basisY[0]) || Math.abs(socket.basisX[0] * socket.basisY[1] - socket.basisX[1] * socket.basisY[0]) < 1e-12) || socket.mirrorPolicy !== void 0 && !["reflect", "swap-hand", "authored"].includes(socket.mirrorPolicy))
          throw new RangeError("Sprite socket basis needs two finite invertible vectors and a valid mirror policy");
        socketMap[name] = copySocket({
          x: socket.x,
          y: socket.y,
          ...socket.angle === void 0 ? {} : { angle: socket.angle },
          ...socket.visible === void 0 ? {} : { visible: socket.visible },
          ...socket.basisX === void 0 ? {} : { basisX: socket.basisX, basisY: socket.basisY },
          ...socket.mirrorPolicy === void 0 ? {} : { mirrorPolicy: socket.mirrorPolicy }
        });
      }
    }
    let emission = null;
    if (frame4.emission !== void 0) {
      if (!Array.isArray(frame4.emission) || frame4.emission.length !== count * 3 || !frame4.emission.every((value) => Number.isFinite(value) && value >= 0 && value <= 34028234663852886e22))
        throw new RangeError("Sprite clip emission must contain width * height * 3 nonnegative finite float32 radiances");
      emission = Float32Array.from(frame4.emission);
    }
    pixels.push(decoded);
    masks.push(Uint8Array.from(decoded, (color) => color >>> 24 ? 1 : 0));
    sockets.push(socketMap);
    emissions.push(emission);
    durations.push(frame4.durationMs);
  }
  function playback(viewOptions) {
    validateOptions(viewOptions);
    const selected = { ...viewOptions };
    const tag = selected.tag === void 0 ? void 0 : tags.get(selected.tag);
    if (selected.tag !== void 0 && !tag) throw new RangeError(`Unknown sprite clip tag: ${selected.tag}`);
    const from = tag?.from ?? 0, to = tag?.to ?? frameCount - 1, direction = tag?.direction ?? "forward";
    const reverse = direction === "reverse" || direction === "pingpong_reverse";
    const sequence = [];
    for (let i = from; i <= to; i++) sequence.push(reverse ? to - (i - from) : i);
    if (direction === "pingpong" || direction === "pingpong_reverse")
      for (let i = sequence.length - 2; i > 0; i--) sequence.push(sequence[i]);
    let durationMs = 0;
    const ends = sequence.map((index) => {
      const previous = durationMs / 1e3;
      durationMs += durations[index];
      const end = durationMs / 1e3;
      if (!Number.isFinite(durationMs) || !(end > previous))
        throw new RangeError("Sprite clip sequence duration must be finite with distinguishable frame boundaries");
      return end;
    });
    const duration = durationMs / 1e3, loop = selected.loop ?? false, emissionKind = selected.emissionKind ?? "optical";
    const frameInSequence = (time) => {
      let low = 0, high = ends.length - 1;
      while (low < high) {
        const middle = low + high >>> 1;
        if (time < ends[middle]) high = middle;
        else low = middle + 1;
      }
      return sequence[low];
    };
    const frameAt = (time) => {
      if (!Number.isFinite(time) || time < 0 || !loop && time >= duration) return -1;
      if (loop) {
        const milliseconds = time * 1e3;
        time = Number.isFinite(milliseconds) ? milliseconds % durationMs / 1e3 : time % duration;
        if (time >= duration) time = 0;
      }
      return frameInSequence(time);
    };
    return Object.freeze({
      width,
      height,
      pivot,
      duration,
      frameCount,
      frameAt,
      frameAtPhase(phase) {
        if (!Number.isFinite(phase) || phase < 0 || phase > 1) return -1;
        return phase === 1 ? sequence[sequence.length - 1] : frameInSequence(phase * duration);
      },
      withOptions(overrides) {
        validateOptions(overrides);
        return playback({ ...selected, ...overrides });
      },
      framePixels(index) {
        if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
        return pixels[index].slice();
      },
      frameSockets(index) {
        if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
        return Object.fromEntries(Object.entries(sockets[index]).map(([name, socket]) => [name, copySocket(socket)]));
      },
      socketAt(name, time) {
        const index = frameAt(time), socket = index < 0 ? void 0 : sockets[index][name];
        return socket ? { ...copySocket(socket), x: socket.x - pivot[0], y: socket.y - pivot[1] } : null;
      },
      frameEmission(index) {
        if (!integer(index, 0, frameCount - 1)) throw new RangeError("Sprite clip frame index is out of bounds");
        return emissions[index]?.slice() ?? null;
      },
      draw(painter, time) {
        const index = frameAt(time);
        if (index < 0) return;
        const frame4 = pixels[index], emission = emissions[index];
        if (emission && (!painter.frame || !painter.each))
          throw new TypeError("Drawing an emissive sprite clip requires a Painter with frame and inverse-cell each()");
        if (painter.mask) painter.mask(
          { w: width, h: height, data: masks[index] },
          -pivot[0],
          -pivot[1],
          (x, y) => frame4[y * width + x]
        );
        else for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const color = frame4[y * width + x];
          if (color >>> 24) painter.rect(x - pivot[0], y - pivot[1], 1, 1, color);
        }
        if (emission) {
          const destination = painter.frame, gain = Math.max(0, (painter.fade ?? 1) * (painter.lightK ?? 1));
          if (!(gain > 0)) return;
          painter.each(-pivot[0], -pivot[1], width - pivot[0], height - pivot[1], (x, y, sx, sy) => {
            const ix = Math.floor(x + pivot[0]), iy = Math.floor(y + pivot[1]);
            if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
            const j = (iy * width + ix) * 3, cell = (sy - destination.oy) * destination.w + sx - destination.ox;
            addLinearLight2D(
              destination,
              cell,
              emission[j] * gain,
              emission[j + 1] * gain,
              emission[j + 2] * gain,
              emissionKind
            );
          });
        }
      }
    });
  }
  return playback(options);
}

// src/core/creature-asset.ts
function createCreatureRigAsset2D(input) {
  const asset = JSON.parse(JSON.stringify(input));
  if (asset.schema !== "poku.creature-rig/v1" || !asset.id || !Number.isFinite(asset.nativeHeight) || asset.nativeHeight < 16 || asset.nativeHeight > 384 || !Number.isFinite(asset.duration) || asset.duration <= 0 || !asset.bones.length || asset.bones.length > 128 || asset.parts.length > 256) throw new RangeError("Invalid creature rig asset");
  const ids = /* @__PURE__ */ new Set();
  for (const bone of asset.bones) {
    if (!bone.id || ids.has(bone.id) || bone.parent && !ids.has(bone.parent) || !bone.offset.every(Number.isFinite) || !Number.isFinite(bone.length) || bone.length < 0 || bone.length > 512 || !Number.isFinite(bone.angle)) throw new RangeError("Creature bones need unique IDs in parent-first order");
    if (bone.range && (!bone.range.every(Number.isFinite) || bone.range[0] > bone.range[1])) throw new RangeError("Invalid bone angle range");
    if (bone.motion && (!Object.values(bone.motion).every(Number.isFinite) || bone.motion.cycles < 0 || Math.abs(bone.motion.amplitude) > Math.PI)) throw new RangeError("Bone motion must be finite");
    ids.add(bone.id);
  }
  const partIds = /* @__PURE__ */ new Set();
  for (const part of asset.parts) {
    if (!part.id || partIds.has(part.id)) throw new RangeError("Creature part IDs must be unique");
    partIds.add(part.id);
    if (!ids.has(part.bone) || !/^#[a-f0-9]{6}$/i.test(part.color) || !["segment", "ellipse", "polygon"].includes(part.kind) || !Number.isFinite(part.layer) || !part.semantic) throw new RangeError("Invalid creature part");
    if (part.offset && (part.offset.length !== 2 || !part.offset.every(Number.isFinite)) || part.size && (part.size.length !== 2 || !part.size.every((n) => Number.isFinite(n) && n > 0)) || [part.radius, part.tipRadius].some((n) => n !== void 0 && (!Number.isFinite(n) || n < 0)) || part.highlight !== void 0 && !/^#[a-f0-9]{6}$/i.test(part.highlight)) throw new RangeError("Invalid creature part geometry");
    if (part.kind === "polygon" && (!part.points || part.points.length < 3 || part.points.length > 128 || !part.points.every((p) => p.length === 2 && p.every(Number.isFinite)))) throw new RangeError("Creature polygons need finite authored points");
  }
  for (const socket of Object.values(asset.sockets ?? {})) if (!ids.has(socket.bone) || socket.at !== void 0 && !Number.isFinite(socket.at) || socket.angle !== void 0 && !Number.isFinite(socket.angle) || socket.offset !== void 0 && (socket.offset.length !== 2 || !socket.offset.every(Number.isFinite))) throw new RangeError("Invalid creature socket");
  return asset;
}
function compileCreatureRig2D(input) {
  const asset = createCreatureRigAsset2D(input), scale = asset.nativeHeight / 96, parts = [...asset.parts].sort((a, b) => a.layer - b.layer), reach = asset.bones.reduce((n, b) => n + b.length + Math.hypot(...b.offset), 0) * scale + 32;
  return { asset, bounds: { x0: -reach, y0: -reach, x1: reach, y1: reach }, sample(time, facing = "right") {
    if (!Number.isFinite(time)) throw new RangeError("Creature time must be finite");
    const phase = (time % asset.duration + asset.duration) % asset.duration / asset.duration, bones = /* @__PURE__ */ Object.create(null);
    for (const bone of asset.bones) {
      const parent = bone.parent ? bones[bone.parent] : void 0, pa = parent?.angle ?? 0, pc = Math.cos(pa), ps = Math.sin(pa), origin = parent?.end ?? [0, 0];
      let local = bone.angle + (bone.motion ? bone.motion.amplitude * Math.sin(2 * Math.PI * (phase * bone.motion.cycles + bone.motion.phase)) : 0);
      if (bone.range) local = Math.max(bone.range[0], Math.min(bone.range[1], local));
      const angle = pa + local, start = [origin[0] + (pc * bone.offset[0] - ps * bone.offset[1]) * scale, origin[1] + (ps * bone.offset[0] + pc * bone.offset[1]) * scale], end = [start[0] + Math.cos(angle) * bone.length * scale, start[1] + Math.sin(angle) * bone.length * scale];
      bones[bone.id] = { start, end, angle };
    }
    const all = Object.values(bones).flatMap((b) => [b.start, b.end]), pad = Math.ceil(Math.max(8, ...parts.map((p2) => Math.max(p2.radius ?? 0, p2.tipRadius ?? 0, ...p2.size ?? [0, 0], ...(p2.points ?? []).map((q) => Math.hypot(...q))))) * scale) + 3;
    const x = Math.floor(Math.min(...all.map((q) => q[0]))) - pad, y = Math.floor(Math.min(...all.map((q) => q[1]))) - pad, w = Math.ceil(Math.max(...all.map((q) => q[0]))) - x + pad + 1, h = Math.ceil(Math.max(...all.map((q) => q[1]))) - y + pad + 1;
    if (w * h > 1048576) throw new RangeError("Creature rig raster exceeds its construction budget");
    const frame4 = { w, h, ox: x, oy: y, color: new Uint32Array(w * h), light: new Uint32Array(w * h) }, p = new Painter(frame4), semanticMasks = {};
    const tags = { w, h, ox: x, oy: y, color: new Uint32Array(w * h), light: new Uint32Array(w * h) }, tagPainter = new Painter(tags), roleColors = /* @__PURE__ */ new Map(), roleIds = /* @__PURE__ */ new Map();
    for (const part of parts) {
      const bone = bones[part.bone], c = Math.cos(bone.angle), s = Math.sin(bone.angle), offset = part.offset ?? [0, 0], pt = (a, b) => [bone.start[0] + (c * (a + offset[0]) - s * (b + offset[1])) * scale, bone.start[1] + (s * (a + offset[0]) + c * (b + offset[1])) * scale], color = hex(part.color);
      const length = asset.bones.find((b) => b.id === part.bone).length;
      const paint = (target, fill, highlight) => {
        if (part.kind === "segment") {
          const r = part.radius ?? 3, t = part.tipRadius ?? r;
          target.poly([pt(0, -r), pt(length, -t), pt(length, t), pt(0, r)], fill);
          const a = pt(0, 0), b = pt(length, 0);
          target.ellipse(a[0], a[1], r * scale, r * scale, fill);
          target.ellipse(b[0], b[1], t * scale, t * scale, fill);
          if (highlight !== void 0) target.line(...pt(1, -r * 0.35), ...pt(Math.max(1, length - 2), -t * 0.35), highlight);
        } else if (part.kind === "ellipse") {
          const size = part.size ?? [4, 4];
          target.poly(Array.from({ length: 32 }, (_, i) => pt(Math.cos(i * Math.PI / 16) * size[0], Math.sin(i * Math.PI / 16) * size[1])), fill);
        } else target.poly(part.points.map((q) => pt(q[0], q[1])), fill);
      };
      let tag = roleIds.get(part.semantic);
      if (tag === void 0) {
        tag = (4278190080 | roleIds.size + 1) >>> 0;
        roleIds.set(part.semantic, tag);
        roleColors.set(tag, part.semantic);
      }
      paint(p, color, part.highlight ? hex(part.highlight) : void 0);
      paint(tagPainter, tag, part.highlight ? tag : void 0);
    }
    let sprite = { x, y, w, h, pixels: frame4.color, mask: { w, h, data: Uint8Array.from(frame4.color, (c) => c >>> 24 ? 1 : 0) } };
    const sockets = Object.assign(/* @__PURE__ */ Object.create(null), { root: characterSocket2D([0, 0]) });
    for (const [name, definition] of Object.entries(asset.sockets ?? {})) {
      const bone = bones[definition.bone], at = definition.at ?? 1, o = definition.offset ?? [0, 0], c = Math.cos(bone.angle), s = Math.sin(bone.angle);
      sockets[name] = characterSocket2D([bone.start[0] + (bone.end[0] - bone.start[0]) * at + (c * o[0] - s * o[1]) * scale, bone.start[1] + (bone.end[1] - bone.start[1]) * at + (s * o[0] + c * o[1]) * scale], bone.angle + (definition.angle ?? 0));
    }
    let semanticPixels = tags.color;
    if (facing === "left") {
      const transformedTags = transformSprite2D({ ...sprite, pixels: tags.color }, pixelTransform2D(0, 0, 0, true));
      semanticPixels = transformedTags.pixels;
      sprite = transformSprite2D(sprite, pixelTransform2D(0, 0, 0, true));
      for (const socket of Object.values(sockets)) {
        socket.position[0] *= -1;
        socket.basisX[0] *= -1;
        socket.basisY[0] *= -1;
      }
      for (const bone of Object.values(bones)) {
        bone.start[0] *= -1;
        bone.end[0] *= -1;
        bone.angle = Math.PI - bone.angle;
      }
    }
    for (let i = 0; i < sprite.pixels.length; i++) {
      const color = sprite.pixels[i];
      if (!(color >>> 24)) continue;
      const semantic = roleColors.get(semanticPixels[i] >>> 0) ?? "body";
      (semanticMasks[semantic] ??= new Uint8Array(sprite.pixels.length))[i] = 1;
    }
    return { sprite, sockets, bones, semanticMasks };
  } };
}

// src/core/character-asset.ts
var finitePoint = (p) => p.length === 2 && p.every(Number.isFinite);
var own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
var copy = (value) => JSON.parse(JSON.stringify(value));
var maskMap = () => /* @__PURE__ */ Object.create(null);
var emptyEmission = (sprite) => new Float32Array(sprite.w * sprite.h * 3);
function validName(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !["__proto__", "prototype", "constructor"].includes(value);
}
function validatePatch(patch) {
  if (!Number.isSafeInteger(patch.x) || !Number.isSafeInteger(patch.y) || !Array.isArray(patch.rows) || patch.rows.length > 4096 || !patch.rows.every((r) => typeof r === "string" && [...r].length <= 4096) || !patch.palette || typeof patch.palette !== "object") throw new RangeError("Invalid persisted cel patch");
  for (const [symbol, color] of Object.entries(patch.palette)) if ([...symbol].length !== 1 || color !== null && (!Number.isInteger(color) || color < -2147483648 || color > 4294967295)) throw new RangeError("Cel patch palette needs code points and packed colors/null");
}
function spriteOptions(source, clip) {
  return { ...source.kind === "sprite" ? source.options : void 0, ...clip.options };
}
function clipMetadata(source, clip) {
  let duration, loop, events = [];
  if (clip.kind === "human") {
    ({ duration, loop, events } = humanAnimationInfo2D(clip.action));
  } else if (clip.kind === "key-pose") {
    duration = clip.poses.duration;
    loop = clip.poses.loop ?? false;
    events = clip.poses.events ?? [];
  } else if (clip.kind === "sprite") {
    const data = clip.data ?? (source.kind === "sprite" ? source.clip : void 0);
    if (!data) throw new RangeError("Sprite clip data is required");
    const options = spriteOptions(source, clip), c = createSpriteClip2D(data, options);
    duration = c.duration;
    loop = options.loop ?? false;
  } else if (clip.kind === "creature-rig") {
    duration = clip.duration ?? (source.kind === "creature-rig" ? source.rig.duration : 2);
    loop = true;
  } else {
    duration = clip.duration ?? 2;
    loop = true;
  }
  events = clip.events ?? events;
  createCharacterEventCursor2D(duration, events, loop);
  return { duration, loop, events };
}
function createCharacterAsset2D(input) {
  const asset = copy(input);
  if (asset.schema !== "poku.character/v1" || !validName(asset.id) || !validName(asset.name) || !Number.isInteger(asset.nativeHeight) || asset.nativeHeight < 16 || asset.nativeHeight > 384 || !asset.source || !asset.clips || Array.isArray(asset.clips) || Object.keys(asset.clips).length < 1 || Object.keys(asset.clips).length > 128 || !own(asset.clips, asset.defaultClip)) throw new RangeError("Invalid character asset identity, native height or clip map");
  const source = asset.source;
  const rasterDefinitions = [];
  for (const clip of Object.values(asset.clips)) if (clip.kind === "sprite") {
    const data = clip.data ?? (source.kind === "sprite" ? source.clip : void 0);
    if (data) rasterDefinitions.push(data);
  }
  for (const layer3 of [...asset.layers ?? [], ...Object.values(asset.equipment ?? {}).flatMap((item) => item.layers ?? [])]) if (layer3.clip) rasterDefinitions.push(layer3.clip);
  let decodedCells = 0;
  for (const data of new Set(rasterDefinitions)) {
    decodedCells += data.width * data.height * (data.frames?.length ?? 0);
    if (!Number.isSafeInteger(decodedCells) || decodedCells > 16777216) throw new RangeError("Character clips exceed the total decoded-cell budget");
  }
  if (source.kind === "human") humanRig2D({ ...source.style, height: asset.nativeHeight });
  else if (source.kind === "creature") renderCreature2D({ ...source.style, size: asset.nativeHeight }, "idle", 0);
  else if (source.kind === "creature-rig") {
    source.rig = createCreatureRigAsset2D(source.rig);
    if (source.rig.nativeHeight !== asset.nativeHeight) throw new RangeError("Creature rig native height must match its character asset");
  } else if (source.kind === "sprite") createSpriteClip2D(source.clip, source.options);
  else throw new RangeError("Unknown character source");
  const slots = /* @__PURE__ */ new Map();
  for (const slot of asset.slots ?? []) {
    if (!validName(slot.id) || slots.has(slot.id) || !validName(slot.socket) || !Number.isFinite(slot.order)) throw new RangeError("Equipment slots need unique IDs, sockets and finite layer order");
    slots.set(slot.id, slot);
  }
  if (slots.size > 64 || Object.keys(asset.equipment ?? {}).length > 128 || (asset.layers?.length ?? 0) > 256) throw new RangeError("Character layer budget exceeded");
  const layerIds = /* @__PURE__ */ new Set(), rasterLayerIds = /* @__PURE__ */ new Set();
  const layer2 = (l) => {
    if (!validName(l.id) || layerIds.has(l.id) || !validName(l.semantic) || l.order !== void 0 && !Number.isFinite(l.order) || l.angle !== void 0 && !Number.isFinite(l.angle) || l.offset !== void 0 && !finitePoint(l.offset)) throw new RangeError("Character layers need unique IDs, semantics and finite transforms");
    if (l.generator && (source.kind !== "human" || !["human-sword", "human-bow"].includes(l.generator) || l.offset !== void 0 || l.angle !== void 0 || l.secondary !== void 0 || l.socket !== void 0 && l.socket !== "hand.grip")) throw new RangeError("Articulated human equipment uses the human grip, without a second local transform");
    layerIds.add(l.id);
    if (!l.generator) rasterLayerIds.add(l.id);
    const nativeClip = createSpriteClip2D(l.clip, l.options);
    if (l.animations) {
      if (l.generator || typeof l.animations !== "object" || Array.isArray(l.animations) || Object.keys(l.animations).length > 128) throw new RangeError("Raster layer animations need a named clip map; articulated equipment already follows its pose");
      for (const [name, binding] of Object.entries(l.animations)) {
        if (!own(asset.clips, name) || !binding || typeof binding !== "object" || Array.isArray(binding) || binding.sync !== void 0 && !["time", "phase", "source-frame"].includes(binding.sync)) throw new RangeError("Layer animation must reference a character clip and a valid synchronization mode");
        if (binding.tag !== void 0) nativeClip.withOptions({ tag: binding.tag });
        if (binding.sync === "source-frame") {
          const bodyClip = asset.clips[name], data = bodyClip.kind === "sprite" ? bodyClip.data ?? (source.kind === "sprite" ? source.clip : void 0) : void 0;
          if (binding.tag !== void 0 || !data || data.frames.length !== nativeClip.frameCount) throw new RangeError("Source-frame layer synchronization requires a sprite body with matching source frame count and no binding tag");
        }
      }
    }
    for (const name of l.visibleIn ?? []) if (!own(asset.clips, name)) throw new RangeError("Layer references an unknown clip");
    if (l.secondary) {
      if (!Number.isFinite(l.secondary.duration) || l.secondary.duration <= 0 || !l.secondary.keys.length) throw new RangeError("Invalid baked secondary track");
      l.secondary.keys.forEach((k, i) => {
        if (!Number.isFinite(k.at) || k.at < 0 || k.at > l.secondary.duration || !Number.isFinite(k.angle) || i > 0 && k.at <= l.secondary.keys[i - 1].at) throw new RangeError("Invalid secondary motion keys");
      });
    }
  };
  for (const l of asset.layers ?? []) layer2(l);
  for (const [id, item] of Object.entries(asset.equipment ?? {})) {
    if (id !== item.id || !validName(id) || !item.slots.length || !item.slots.every((s) => slots.has(s)) || item.layers.length > 32) throw new RangeError("Invalid equipment entry");
    for (const l of item.layers) layer2(l);
  }
  const loadout = (load) => {
    for (const [slot, id] of Object.entries(load ?? {})) {
      if (!slots.has(slot) || id !== null && (!own(asset.equipment ?? {}, id) || !asset.equipment[id].slots.includes(slot))) throw new RangeError("Equipment does not fit its selected slot");
    }
  };
  loadout(asset.loadout);
  for (const [name, clip] of Object.entries(asset.clips)) {
    if (!validName(name) || !clip || !["human", "key-pose", "creature", "creature-rig", "sprite"].includes(clip.kind)) throw new RangeError("Invalid character clip");
    if ((clip.kind === "human" || clip.kind === "key-pose") && source.kind !== "human" || clip.kind === "creature" && source.kind !== "creature" || clip.kind === "creature-rig" && source.kind !== "creature-rig") throw new RangeError("Clip and source anatomy must agree");
    if (clip.fps !== void 0 && (!Number.isInteger(clip.fps) || clip.fps < 1 || clip.fps > 240)) throw new RangeError("Authored cel cadence must be 1..240 fps");
    if (clip.kind === "key-pose") compileHumanPoseClip2D(clip.poses);
    if (clip.kind === "creature" && source.kind === "creature") renderCreature2D({ ...source.style, size: asset.nativeHeight }, clip.motion, 0);
    const info = clipMetadata(source, clip);
    loadout(clip.loadout);
    if (clip.socketTracks) {
      if (typeof clip.socketTracks !== "object" || Array.isArray(clip.socketTracks) || Object.keys(clip.socketTracks).length > 128) throw new RangeError("Socket tracks need a named map with at most 128 sockets");
      let keys = 0;
      for (const [name2, track] of Object.entries(clip.socketTracks)) {
        if (!validName(name2)) throw new RangeError("Invalid socket track name");
        validateCharacterSocketTrack2D(track, info.duration);
        keys += track.keys.length;
      }
      if (keys > 16384) throw new RangeError("Socket track key budget exceeded");
    }
    if (clip.rootTrack) {
      const keys = clip.rootTrack;
      if (keys.length < 2 || keys[0].at !== 0 || keys[keys.length - 1].at !== info.duration) throw new RangeError("Root track must span zero through clip duration");
      keys.forEach((k, i) => {
        if (!Number.isFinite(k.at) || k.at < 0 || k.at > info.duration || !finitePoint(k.position) || i > 0 && k.at <= keys[i - 1].at) throw new RangeError("Invalid root track");
      });
    }
    if (clip.faceTrack) {
      if (source.kind !== "human") throw new RangeError("Face tracks require a human source");
      clip.faceTrack.forEach((k, i) => {
        if (!Number.isFinite(k.at) || k.at < 0 || k.at > info.duration || i > 0 && k.at <= clip.faceTrack[i - 1].at || k.blink !== void 0 && typeof k.blink !== "boolean" || k.gaze !== void 0 && (!Number.isFinite(k.gaze) || Math.abs(k.gaze) > 1)) throw new RangeError("Invalid facial keys");
      });
    }
  }
  const editIds = /* @__PURE__ */ new Set();
  for (const edit of [...asset.celEdits ?? [], ...asset.maskEdits ?? []]) {
    if (!validName(edit.id) || editIds.has(edit.id) || edit.clip !== void 0 && !own(asset.clips, edit.clip) || edit.frame !== void 0 && (!Number.isInteger(edit.frame) || edit.frame < 0) || edit.target !== void 0 && edit.target !== "body" && !layerIds.has(edit.target) || edit.space !== void 0 && !["local", "socket", "layer"].includes(edit.space) || edit.space === "socket" && !validName(edit.socket) || edit.frameSource !== void 0 && !["character", "layer"].includes(edit.frameSource)) throw new RangeError("Invalid persisted edit reference");
    editIds.add(edit.id);
    if (edit.frameSource === "layer" && !rasterLayerIds.has(edit.target ?? "body")) throw new RangeError("Layer-cel edits require an imported raster layer target");
    if ("patch" in edit) {
      validatePatch(edit.patch);
      if (edit.semantic !== void 0 && !validName(edit.semantic)) throw new RangeError("Invalid cel semantic name");
    } else {
      if (edit.allowEmpty !== void 0 && typeof edit.allowEmpty !== "boolean" || !validName(edit.name) || !Number.isSafeInteger(edit.x) || !Number.isSafeInteger(edit.y) || !Array.isArray(edit.rows) || !edit.rows.every((r) => typeof r === "string")) throw new RangeError("Invalid semantic mask edit");
    }
  }
  if (editIds.size > 4096) throw new RangeError("Character edit budget exceeded");
  if (asset.pixelStyle) asset.pixelStyle = createPixelStyleProfile2D(asset.pixelStyle);
  if (asset.identity) {
    if (source.kind !== "human") throw new RangeError("Shared human portrait identity needs a human source");
    asset.identity = { ...asset.identity, body: copy({ ...source.style, height: asset.nativeHeight }) };
  }
  return asset;
}
function parseCharacterAsset2D(json) {
  if (typeof json !== "string" || json.length > 64 * 1024 * 1024) throw new RangeError("Character JSON exceeds 64 MiB");
  return createCharacterAsset2D(JSON.parse(json));
}
function setCharacterSocketKey2D(asset, clipName, socketName, key, mode = "delta") {
  if (!own(asset.clips, clipName) || !validName(socketName)) throw new RangeError("Unknown clip or invalid socket name");
  const clip = asset.clips[clipName], old = clip.socketTracks?.[socketName], keys = [...(old?.keys ?? []).filter((k) => k.at !== key.at), key].sort((a, b) => a.at - b.at);
  return createCharacterAsset2D({ ...asset, clips: { ...asset.clips, [clipName]: { ...clip, socketTracks: { ...clip.socketTracks, [socketName]: { mode, keys } } } } });
}
function humanMasks(style, pose, sprite) {
  const roles = ["skin", "hair", "cloth", "trousers", "shoes"], sentinel = (n) => "#" + n.toString(16).padStart(6, "0");
  const values = roles.map((_, i) => [0, 1, 2, 3].map((j) => sentinel(1048832 + i * 65536 + j * 32)));
  const tagged = renderHuman2D({ ...style, skinRamp: values[0], hairRamp: values[1].slice(0, 3), cloth: values[2].slice(0, 3), trousers: values[3].slice(0, 3), shoeRamp: values[4].slice(0, 3) }, pose);
  const map = /* @__PURE__ */ new Map();
  values.forEach((colors2, i) => colors2.forEach((c) => map.set(hex(c) >>> 0, roles[i])));
  const masks = maskMap();
  for (const name of [...roles, "body", "head", "hands", "outline", "features", "solidSubject"]) masks[name] = new Uint8Array(sprite.w * sprite.h);
  const r = sprite.rig;
  for (let i = 0; i < sprite.pixels.length; i++) if (sprite.mask.data[i]) {
    masks.body[i] = masks.solidSubject[i] = 1;
    const role = map.get(tagged.pixels[i] >>> 0);
    if (role) masks[role][i] = 1;
    else masks.features[i] = 1;
    const x = sprite.x + i % sprite.w + 0.5, y = sprite.y + Math.floor(i / sprite.w) + 0.5;
    if (Math.hypot((x - r.head[0]) / 9, (y - r.head[1]) / 12) <= r.scale) masks.head[i] = 1;
    if (role === "skin" && [r.leftHand, r.rightHand].some((p) => Math.hypot(x - p[0], y - p[1]) <= 6 * r.scale)) masks.hands[i] = 1;
    if (style.outline !== null && sprite.pixels[i] === hex(style.outline ?? "#252633") >>> 0) masks.outline[i] = 1;
  }
  return masks;
}
function clipLayer(clip, time, id, semantic, order, kind, index = clip.frameAt(time)) {
  const pixels = index < 0 ? new Uint32Array(clip.width * clip.height) : clip.framePixels(index), mask = Uint8Array.from(pixels, (c) => c >>> 24 ? 1 : 0);
  const sprite = { x: -clip.pivot[0], y: -clip.pivot[1], w: clip.width, h: clip.height, pixels, mask: { w: clip.width, h: clip.height, data: mask } };
  return { id, sprite, masks: { [semantic]: mask.slice() }, emission: index < 0 ? null : clip.frameEmission(index), emissionKind: kind, order, semantic, sourceFrame: index };
}
function transformedLayer(layer2, m) {
  if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && Number.isInteger(m[4]) && Number.isInteger(m[5]) && Number.isInteger(layer2.sprite.x) && Number.isInteger(layer2.sprite.y)) return { ...layer2, sprite: { ...layer2.sprite, x: layer2.sprite.x + m[4], y: layer2.sprite.y + m[5] } };
  const sprite = transformSprite2D(layer2.sprite, m), inverse = invertPixelTransform2D(m), masks = maskMap(), emission = layer2.emission ? emptyEmission(sprite) : null;
  for (const name of Object.keys(layer2.masks)) masks[name] = new Uint8Array(sprite.w * sprite.h);
  for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
    const q = transformPixelPoint2D(inverse, [sprite.x + x + 0.5, sprite.y + y + 0.5]), sx = Math.floor(q[0] - layer2.sprite.x), sy = Math.floor(q[1] - layer2.sprite.y);
    if (sx < 0 || sy < 0 || sx >= layer2.sprite.w || sy >= layer2.sprite.h) continue;
    const i = y * sprite.w + x, j = sy * layer2.sprite.w + sx;
    for (const [name, data] of Object.entries(layer2.masks)) masks[name][i] = data[j];
    if (emission && layer2.emission) emission.set(layer2.emission.subarray(j * 3, j * 3 + 3), i * 3);
  }
  return { ...layer2, sprite, masks, emission };
}
function editLayer(layer2, asset, clip, frame4, sockets, stage, rasterToActor = pixelTransform2D()) {
  const matches = (e) => (e.target ?? "body") === layer2.id && (e.clip === void 0 || e.clip === clip) && (e.frame === void 0 || e.frame === (e.frameSource === "layer" ? layer2.sourceFrame : frame4)) && e.space === "layer" === (stage === "source");
  const visit = (patch, space, socketName, fn) => {
    const socket = space === "socket" ? sockets[socketName] : void 0;
    if (space === "socket" && !socket) throw new RangeError("Unknown edit socket: " + socketName);
    const inverse = socket ? composePixelTransform2D(invertPixelTransform2D(socketTransform2D(socket)), rasterToActor) : rasterToActor, rows = patch.rows.map((r) => [...r]);
    for (let y = 0; y < layer2.sprite.h; y++) for (let x = 0; x < layer2.sprite.w; x++) {
      const p = transformPixelPoint2D(inverse, [layer2.sprite.x + x + 0.5, layer2.sprite.y + y + 0.5]), row = Math.floor(p[1] - patch.y), col = Math.floor(p[0] - patch.x);
      if (row < 0 || row >= rows.length || col < 0 || col >= rows[row].length) continue;
      fn(y * layer2.sprite.w + x, rows[row][col]);
    }
  };
  for (const e of asset.celEdits ?? []) if (matches(e)) visit(e.patch, e.space, e.socket, (i, symbol) => {
    if (!own(e.patch.palette, symbol)) return;
    const value = e.patch.palette[symbol], color = value === null ? 0 : value >>> 0;
    layer2.sprite.pixels[i] = color;
    layer2.sprite.mask.data[i] = color >>> 24 ? 1 : 0;
    if (!(color >>> 24)) {
      for (const mask of Object.values(layer2.masks)) mask[i] = 0;
      if (layer2.emission) layer2.emission.fill(0, i * 3, i * 3 + 3);
    } else {
      (layer2.masks[e.semantic ?? layer2.semantic] ??= new Uint8Array(layer2.sprite.w * layer2.sprite.h))[i] = 1;
      if (layer2.id === "body") {
        (layer2.masks.body ??= new Uint8Array(layer2.sprite.w * layer2.sprite.h))[i] = 1;
      }
    }
  });
  for (const e of asset.maskEdits ?? []) if (matches(e)) {
    const data = layer2.masks[e.name] ??= new Uint8Array(layer2.sprite.w * layer2.sprite.h);
    visit(e, e.space, e.socket, (i, symbol) => {
      if (symbol === "+") data[i] = e.allowEmpty || e.name === "negativeSpace" ? 1 : layer2.sprite.mask.data[i] ? 1 : 0;
      else if (symbol === "-") data[i] = 0;
    });
  }
}
function drawLayer(p, layer2, alpha = 1) {
  blitSprite2D(p, layer2.sprite, alpha);
  if (!layer2.emission) return;
  const s = layer2.sprite, emission = layer2.emission, gain = Math.max(0, alpha * p.fade * p.lightK);
  if (!(gain > 0)) return;
  p.each(s.x, s.y, s.x + s.w, s.y + s.h, (x, y, sx, sy) => {
    const ix = Math.floor(x - s.x), iy = Math.floor(y - s.y);
    if (ix < 0 || iy < 0 || ix >= s.w || iy >= s.h) return;
    const j = (iy * s.w + ix) * 3, i = (sy - p.frame.oy) * p.frame.w + sx - p.frame.ox;
    addLinearLight2D(p.frame, i, emission[j] * gain, emission[j + 1] * gain, emission[j + 2] * gain, layer2.emissionKind);
  });
}
function assembled(layers, bounds, emptyMasks) {
  const x = Math.floor(bounds.x0), y = Math.floor(bounds.y0), w = Math.max(1, Math.ceil(bounds.x1) - x), h = Math.max(1, Math.ceil(bounds.y1) - y);
  if (w * h > 4194304) throw new RangeError("Character assembly exceeds four million native cells");
  const frame4 = { w, h, ox: x, oy: y, color: new Uint32Array(w * h), light: new Uint32Array(w * h) }, p = new Painter(frame4), masks = maskMap();
  for (const layer2 of layers) {
    drawLayer(p, layer2);
    const s = layer2.sprite, empty = Object.entries(layer2.masks).filter(([name]) => emptyMasks.has(name)).map(([, data]) => data);
    for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
      const src = yy * s.w + xx;
      if (!s.mask.data[src] && !empty.some((data) => data[src])) continue;
      const dx = Math.floor(s.x + xx - x), dy = Math.floor(s.y + yy - y);
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const dest = dy * w + dx;
      if (s.mask.data[src]) for (const m of Object.values(masks)) m[dest] = 0;
      for (const [name, data] of Object.entries(layer2.masks)) if (data[src]) (masks[name] ??= new Uint8Array(w * h))[dest] = 1;
    }
  }
  const sprite = { x, y, w, h, pixels: frame4.color, mask: { w, h, data: Uint8Array.from(frame4.color, (c) => c >>> 24 ? 1 : 0) } };
  return { id: "assembly", sprite, masks, emission: frame4.hdrLight ?? null, emissionKind: "surface", semantic: "body", order: 0 };
}
function createCharacterPlayer2D(input) {
  const asset = createCharacterAsset2D(input), source = asset.source, clips = Object.freeze(Object.keys(asset.clips));
  const metadata = new Map(clips.map((name) => [name, clipMetadata(source, asset.clips[name])]));
  const socketTracksByClip = new Map(clips.map((name) => [name, new Map(Object.entries(asset.clips[name].socketTracks ?? {}).map(([socket, track]) => [socket, compileCharacterSocketTrack2D(track, metadata.get(name).duration)]))]));
  const spriteClips = /* @__PURE__ */ new Map(), poseClips = /* @__PURE__ */ new Map(), decodedSprites = /* @__PURE__ */ new Map();
  const decode = (data) => {
    let clip = decodedSprites.get(data);
    if (!clip) {
      clip = createSpriteClip2D(data);
      decodedSprites.set(data, clip);
    }
    return clip;
  };
  for (const name of clips) {
    const clip = asset.clips[name];
    if (clip.kind === "sprite") spriteClips.set(name, decode(clip.data ?? source.clip).withOptions(spriteOptions(source, clip)));
    if (clip.kind === "key-pose") poseClips.set(name, compileHumanPoseClip2D(clip.poses));
  }
  const rig = source.kind === "creature-rig" ? compileCreatureRig2D(source.rig) : void 0;
  const allLayerDefs = [...asset.layers ?? [], ...Object.values(asset.equipment ?? {}).flatMap((item) => item.layers)];
  const layerClips = new Map(allLayerDefs.map((l) => [l.id, decode(l.clip).withOptions({ loop: true, ...l.options })]));
  const layerAnimations = new Map(allLayerDefs.map((l) => [l.id, new Map(Object.entries(l.animations ?? {}).map(([name, binding]) => {
    const base = layerClips.get(l.id);
    return [name, { clip: binding.tag === void 0 ? base : base.withOptions({ tag: binding.tag }), sync: binding.sync ?? "time" }];
  }))]));
  const layerSocketNames = new Map(allLayerDefs.map((l) => [l.id, new Set(l.generator ? ["weapon.base", "weapon.tip", "weapon.edge", ...l.generator === "human-bow" ? ["bow.upperTip", "bow.lowerTip", "bow.nock", "muzzle"] : []] : l.clip.frames.flatMap((frame4) => Object.keys(frame4.sockets ?? {})))]));
  const editSocketNames = /* @__PURE__ */ new Map();
  for (const edit of [...asset.celEdits ?? [], ...asset.maskEdits ?? []]) if (edit.space === "socket") {
    const target = edit.target ?? "body", names = editSocketNames.get(target) ?? /* @__PURE__ */ new Set();
    names.add(edit.socket);
    editSocketNames.set(target, names);
  }
  const style = asset.pixelStyle ? compilePixelStyle2D(asset.pixelStyle) : void 0, emptyMasks = /* @__PURE__ */ new Set(["negativeSpace", ...(asset.maskEdits ?? []).filter((e) => e.allowEmpty).map((e) => e.name)]);
  let reach = asset.nativeHeight * 1.7;
  for (const l of allLayerDefs) reach = Math.max(reach, asset.nativeHeight + Math.max(Math.hypot(...l.clip.pivot), Math.hypot(l.clip.width - l.clip.pivot[0], l.clip.height - l.clip.pivot[1])) + Math.hypot(...l.offset ?? [0, 0]));
  if (source.kind === "sprite") reach = Math.max(reach, Math.hypot(source.clip.width, source.clip.height) + Math.hypot(...source.clip.pivot));
  if (rig) reach = Math.max(reach, Math.abs(rig.bounds.x0), Math.abs(rig.bounds.y0), Math.abs(rig.bounds.x1), Math.abs(rig.bounds.y1));
  for (const compiled of poseClips.values()) for (const key of compiled.clip.keys) for (const value of Object.values(key.pose)) if (Array.isArray(value) && finitePoint(value)) reach = Math.max(reach, Math.hypot(...value) * asset.nativeHeight / 96 + asset.nativeHeight);
  if (clips.some((name) => asset.clips[name].kind === "human" && asset.clips[name].action === "bow")) reach = Math.max(reach, asset.nativeHeight * 3);
  const nativeReach = reach;
  for (const clip of Object.values(asset.clips)) for (const track of Object.values(clip.socketTracks ?? {})) for (const key of track.keys) {
    const scale = key.basisX && key.basisY ? Math.hypot(...key.basisX) + Math.hypot(...key.basisY) : 1;
    reach = Math.max(reach, nativeReach * Math.max(1, scale) + Math.hypot(...key.position ?? [0, 0]));
  }
  const bounds = { x0: -Math.ceil(reach), y0: -Math.ceil(reach), x1: Math.ceil(reach), y1: Math.ceil(reach) }, boundsCache = /* @__PURE__ */ new Map();
  const releaseCorrections = /* @__PURE__ */ new Map();
  const player = {
    asset,
    clips,
    bounds,
    /** Envelope for this export cadence plus the non-loop endpoint, with two native cells of guard padding. */
    boundsForClip(clipName = asset.defaultClip, fps = 30) {
      if (!Number.isInteger(fps) || fps < 1 || fps > 240) throw new RangeError("Bounds cadence must be 1..240 fps");
      const info = metadata.get(clipName);
      if (!info) throw new RangeError("Unknown character clip: " + clipName);
      const key = clipName + "@" + fps, cached = boundsCache.get(key);
      if (cached) return { ...cached };
      const n = Math.ceil(info.duration * fps);
      if (n > 28800) throw new RangeError("Clip bounds frame budget exceeded");
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const include = (time) => {
        const b = player.sample(time, clipName).bounds;
        box.x0 = Math.min(box.x0, b.x0);
        box.y0 = Math.min(box.y0, b.y0);
        box.x1 = Math.max(box.x1, b.x1);
        box.y1 = Math.max(box.y1, b.y1);
      };
      for (let i = 0; i < Math.max(1, n + (info.loop ? 0 : 1)); i++) include(i / fps);
      if (!info.loop && n / fps !== info.duration) include(info.duration);
      const result = { x0: Math.floor(box.x0) - 2, y0: Math.floor(box.y0) - 2, x1: Math.ceil(box.x1) + 2, y1: Math.ceil(box.y1) + 2 };
      boundsCache.set(key, result);
      return { ...result };
    },
    clipInfo(clipName = asset.defaultClip) {
      const info = metadata.get(clipName);
      if (!info) throw new RangeError("Unknown character clip: " + clipName);
      return copy(info);
    },
    createEventCursor(clipName = asset.defaultClip) {
      const info = metadata.get(clipName);
      if (!info) throw new RangeError("Unknown character clip: " + clipName);
      return createCharacterEventCursor2D(info.duration, info.events, info.loop);
    },
    sample(time, clipName = asset.defaultClip, options = {}) {
      if (!Number.isFinite(time) || Math.abs(time) > 1e9 || !Number.isFinite(options.x ?? 0) || !Number.isFinite(options.y ?? 0)) throw new RangeError("Character sample needs finite time and placement");
      if (!own(asset.clips, clipName)) throw new RangeError("Unknown character clip: " + clipName);
      const clip = asset.clips[clipName], info = metadata.get(clipName), rawTime = clip.kind === "sprite" ? time : Math.max(0, time), wrappedTime = characterClipTime2D(rawTime, info.duration, info.loop);
      const cel = wrappedTime.time * (clip.fps ?? 1), phaseTime = clip.fps && wrappedTime.time !== info.duration ? Math.floor(cel + 8 * Number.EPSILON * Math.max(1, Math.abs(cel))) / clip.fps : wrappedTime.time;
      const t = rawTime < 0 ? rawTime : info.loop ? wrappedTime.cycle * info.duration + phaseTime : phaseTime;
      const independentTime = clip.fps ? Math.floor(rawTime * clip.fps) / clip.fps : rawTime;
      const socketTracks = options.ignoreSocketTracks ? void 0 : socketTracksByClip.get(clipName);
      const correctSocket = (name, baseline, at = phaseTime) => {
        const track = socketTracks?.get(name);
        return track ? applyCharacterSocketKey2D(baseline, track.sample(at), track.mode) : baseline;
      };
      let sockets = /* @__PURE__ */ Object.create(null), rootMotion = [0, 0], contacts = { left: false, right: false };
      let frameIndex = Math.floor(phaseTime * (clip.fps ?? 60) + 8 * Number.EPSILON * Math.max(1, phaseTime * (clip.fps ?? 60))), body, humanPose, currentHumanStyle;
      const projectiles = [];
      const layerFrames = Object.fromEntries(allLayerDefs.filter((l) => !l.generator).map((l) => [l.id, -1]));
      if (clip.kind === "human" || clip.kind === "key-pose") {
        const humanStyle = { ...source.style, height: asset.nativeHeight };
        let sprite, pose;
        if (clip.kind === "human") {
          const sampled = sampleHumanAnimation2D(clip.action, t, humanStyle, { weaponPixels: false, rootMotion: clip.rootMotion ?? false });
          ({ sprite, pose, sockets, rootMotion, contacts } = sampled);
        } else {
          const key = poseClips.get(clipName).sample(t);
          pose = key.pose;
          rootMotion = key.rootMotion;
          contacts = key.contacts;
          sprite = renderHuman2D(humanStyle, pose);
          sockets = humanSockets2D(sprite);
        }
        const face = {};
        for (let i = (clip.faceTrack?.length ?? 0) - 1; i >= 0; i--) {
          const key = clip.faceTrack[i];
          if (key.at > phaseTime) continue;
          if (face.blink === void 0 && key.blink !== void 0) face.blink = key.blink;
          if (face.gaze === void 0 && key.gaze !== void 0) face.gaze = key.gaze;
          if (face.blink !== void 0 && face.gaze !== void 0) break;
        }
        if (face.blink !== void 0 || face.gaze !== void 0) {
          pose = { ...pose, ...face };
          sprite = renderHuman2D(humanStyle, pose);
        }
        humanPose = pose;
        currentHumanStyle = humanStyle;
        body = { id: "body", sprite, masks: humanMasks(humanStyle, pose, sprite), emission: null, emissionKind: "surface", order: 0, semantic: "body" };
      } else if (clip.kind === "creature") {
        const creatureStyle = { ...source.style, size: asset.nativeHeight }, sprite = renderCreature2D(creatureStyle, clip.motion, t), r = sprite.rig, near = r.legs.find((l) => l.name === "nearFront"), far = r.legs.find((l) => l.name === "farFront"), flip = r.facing === "left";
        sockets = { root: characterSocket2D([0, 0], 0, 0, flip), head: characterSocket2D(r.head, 0, 0, flip), chest: characterSocket2D(r.root, 0, 0, flip), mouth: characterSocket2D([r.head[0] + (flip ? -7 : 7) * r.scale, r.head[1] + 3 * r.scale], 0, 0, flip), hand: characterSocket2D(near?.toe ?? r.head), otherHand: characterSocket2D(far?.toe ?? r.head), foot: characterSocket2D(near?.toe ?? [0, 0]), otherFoot: characterSocket2D(far?.toe ?? [0, 0]) };
        sockets["hand.grip"] = sockets.hand;
        rootMotion = [clip.rootMotion ? r.travelSpeed * t * (flip ? -1 : 1) : 0, 0];
        contacts = { left: near?.contact ?? false, right: far?.contact ?? false };
        body = { id: "body", sprite, masks: { body: sprite.mask.data.slice(), solidSubject: sprite.mask.data.slice() }, emission: null, emissionKind: "surface", order: 0, semantic: "body" };
      } else if (clip.kind === "creature-rig") {
        const sampled = rig.sample(t);
        sockets = sampled.sockets;
        body = { id: "body", sprite: sampled.sprite, masks: { ...sampled.semanticMasks, body: sampled.sprite.mask.data.slice(), solidSubject: sampled.sprite.mask.data.slice() }, emission: null, emissionKind: "surface", order: 0, semantic: "body" };
      } else {
        const c = spriteClips.get(clipName), spriteTime = rawTime < 0 ? rawTime : phaseTime;
        frameIndex = c.frameAt(spriteTime);
        body = clipLayer(c, spriteTime, "body", "body", 0, clip.options?.emissionKind ?? (source.kind === "sprite" ? source.options?.emissionKind : void 0) ?? "optical");
        sockets.root = characterSocket2D([0, 0]);
        if (frameIndex >= 0) for (const [name, socket] of Object.entries(c.frameSockets(frameIndex))) {
          sockets[name] = characterSocket2D([socket.x - c.pivot[0], socket.y - c.pivot[1]], socket.angle ?? 0);
          sockets[name].visible = socket.visible ?? true;
          if (socket.basisX && socket.basisY) {
            sockets[name].basisX = [...socket.basisX];
            sockets[name].basisY = [...socket.basisY];
          }
          sockets[name].mirrorPolicy = socket.mirrorPolicy ?? "authored";
        }
        body.masks.solidSubject = body.sprite.mask.data.slice();
      }
      if (clip.rootTrack) {
        const keys = clip.rootTrack;
        let a = keys[0], b = a;
        for (const key of keys) {
          if (key.at <= phaseTime) a = key;
          else {
            b = key;
            break;
          }
          b = a;
        }
        const u = b.at > a.at ? (phaseTime - a.at) / (b.at - a.at) : 0, cycles = wrappedTime.cycle, first = keys[0].position, last = keys[keys.length - 1].position;
        rootMotion = [a.position[0] + (b.position[0] - a.position[0]) * u + cycles * (last[0] - first[0]), a.position[1] + (b.position[1] - a.position[1]) * u + cycles * (last[1] - first[1])];
      }
      sockets.root ??= characterSocket2D([0, 0]);
      sockets.head ??= characterSocket2D([0, body.sprite.y]);
      sockets.chest ??= characterSocket2D([0, body.sprite.y + body.sprite.h * 0.45]);
      for (const name of ["hand", "otherHand", "foot", "otherFoot"]) sockets[name] ??= characterSocket2D(name.includes("oot") ? [0, 0] : sockets.chest.position);
      sockets["hand.grip"] ??= sockets.hand;
      for (const name of socketTracks?.keys() ?? []) {
        const corrected = correctSocket(name, sockets[name]);
        if (corrected) sockets[name] = corrected;
      }
      const sourceVisible = clip.kind !== "sprite" || frameIndex >= 0;
      if (!sourceVisible) for (const socket of Object.values(sockets)) socket.visible = false;
      const captureEditSockets = (layer2) => {
        const names = editSocketNames.get(layer2.id);
        if (names) layer2.editSockets = Object.fromEntries([...names].filter((name) => sockets[name]).map((name) => [name, sockets[name]]));
      };
      captureEditSockets(body);
      const selected = (asset.layers ?? []).map((definition) => ({ definition }));
      const loadout = { ...asset.loadout, ...clip.loadout };
      for (const slot of asset.slots ?? []) {
        const item = loadout[slot.id];
        if (item) for (const definition of asset.equipment[item].layers) selected.push({ definition, slot });
      }
      const layers = [body];
      for (const { definition: l, slot } of selected) {
        if (!sourceVisible) continue;
        const hidePublishedSockets = (visibleNames) => {
          for (const name of layerSocketNames.get(l.id) ?? []) if (!visibleNames?.has(name)) sockets[name] = { ...sockets[name] ?? characterSocket2D([0, 0]), visible: false };
        };
        if (l.visibleIn && !l.visibleIn.includes(clipName)) {
          hidePublishedSockets();
          continue;
        }
        const attachmentName = l.generator ? "hand.grip" : l.socket ?? slot?.socket ?? "root", socket = sockets[attachmentName];
        if (!socket) throw new RangeError("Unknown equipment socket: " + attachmentName);
        if (!socket.visible) {
          hidePublishedSockets();
          continue;
        }
        const localTime = l.secondary?.loop ? phaseTime % l.secondary.duration : phaseTime, secondary = l.secondary ? sampleSecondaryMotion2D(l.secondary.keys, localTime) : 0;
        const transform = composePixelTransform2D(socketTransform2D(socket), pixelTransform2D(l.offset?.[0] ?? 0, l.offset?.[1] ?? 0, (l.angle ?? 0) + secondary));
        const binding = layerAnimations.get(l.id)?.get(clipName), nativeClip = binding?.clip ?? layerClips.get(l.id);
        let layer2;
        if (l.generator && humanPose && currentHumanStyle) {
          const kind = l.generator === "human-sword" ? "sword" : "bow", weapon = clip.kind === "human" && clip.action === kind ? renderHumanWeapon2D(kind, t, currentHumanStyle) : renderHumanWeaponPose2D(kind, humanPose, currentHumanStyle);
          layer2 = { id: l.id, sprite: weapon.held, masks: { [l.semantic]: weapon.held.mask.data.slice() }, emission: null, emissionKind: "surface", order: l.order ?? slot?.order ?? 1, semantic: l.semantic };
          const weaponSockets = humanSockets2D(weapon.actor, weapon.sample.geometry), nativeGrip = weaponSockets["hand.grip"], desiredGrip = correctSocket("hand.grip", nativeGrip);
          const correctionFor = (base, at) => {
            const key = socketTracks?.get("hand.grip")?.sample(at);
            if (!key) return pixelTransform2D();
            const corrected = applyCharacterSocketKey2D(base, key, socketTracks.get("hand.grip").mode), m = composePixelTransform2D(socketTransform2D(corrected), invertPixelTransform2D(socketTransform2D(base))), identity = pixelTransform2D();
            return m.every((v, i) => Math.abs(v - identity[i]) < 1e-10) ? identity : m;
          };
          const correction = correctionFor(nativeGrip, phaseTime);
          layer2.localToActor = correction;
          for (const [name, point3] of Object.entries(weaponSockets)) if (name.startsWith("weapon.") || name.startsWith("bow.") || name === "muzzle") sockets[name] = correctSocket(name, transformCharacterSocket2D(point3, correction));
          sockets["hand.grip"] = desiredGrip;
          if (weapon.projectile) {
            if (!socketTracks?.has("hand.grip")) projectiles.push({ sprite: weapon.projectile });
            else {
              let releaseCorrection = releaseCorrections.get(clipName);
              if (!releaseCorrection) {
                const release = HUMAN_WEAPON_TIMING.bow.cue, atRelease = renderHumanWeapon2D("bow", release, currentHumanStyle), releaseGrip = humanSockets2D(atRelease.actor, atRelease.sample.geometry)["hand.grip"];
                releaseCorrection = correctionFor(releaseGrip, release);
                releaseCorrections.set(clipName, releaseCorrection);
              }
              projectiles.push({ sprite: weapon.projectile, transform: releaseCorrection });
            }
          }
        } else {
          const sourceFrame = binding?.sync === "source-frame" ? frameIndex : binding?.sync === "phase" ? nativeClip.frameAtPhase(phaseTime / info.duration) : nativeClip.frameAt(independentTime);
          layerFrames[l.id] = sourceFrame;
          layer2 = clipLayer(nativeClip, independentTime, l.id, l.semantic, l.order ?? slot?.order ?? 1, l.options?.emissionKind ?? "surface", sourceFrame);
          layer2.localToActor = transform;
          const frameSockets = sourceFrame >= 0 ? nativeClip.frameSockets(sourceFrame) : {};
          hidePublishedSockets(new Set(Object.keys(frameSockets)));
          for (const [name, point3] of Object.entries(frameSockets)) {
            const local = characterSocket2D([point3.x - nativeClip.pivot[0], point3.y - nativeClip.pivot[1]], point3.angle ?? 0);
            local.visible = point3.visible ?? true;
            if (point3.basisX && point3.basisY) {
              local.basisX = [...point3.basisX];
              local.basisY = [...point3.basisY];
            }
            local.mirrorPolicy = point3.mirrorPolicy ?? "authored";
            sockets[name] = correctSocket(name, transformCharacterSocket2D(local, transform));
          }
        }
        captureEditSockets(layer2);
        layer2.occludedBy = l.occludedBy;
        layers.push(layer2);
      }
      const dx = (options.x ?? 0) + (options.applyRootMotion ? rootMotion[0] : 0), dy = (options.y ?? 0) + (options.applyRootMotion ? rootMotion[1] : 0), placement = pixelTransform2D(dx, dy);
      const rasterToActor = invertPixelTransform2D(placement), actorToWorld = options.pixelContext?.objectToWorld ?? placement;
      const placed = layers.map((layer2) => {
        const editSockets = layer2.editSockets ?? sockets;
        if (sourceVisible) editLayer(layer2, asset, clipName, frameIndex, editSockets, "source");
        const result = transformedLayer(layer2, composePixelTransform2D(placement, layer2.localToActor ?? pixelTransform2D()));
        if (sourceVisible) editLayer(result, asset, clipName, frameIndex, editSockets, "placed", rasterToActor);
        return result;
      });
      const placedBody = placed[0];
      for (const layer2 of placed) {
        const base = placedBody.sprite;
        if (layer2.occludedBy?.length) for (let yy = 0; yy < layer2.sprite.h; yy++) for (let xx = 0; xx < layer2.sprite.w; xx++) {
          const px = Math.floor(layer2.sprite.x + xx + 0.5 - base.x), py = Math.floor(layer2.sprite.y + yy + 0.5 - base.y);
          if (px < 0 || py < 0 || px >= base.w || py >= base.h) continue;
          const bi = py * base.w + px;
          if (!layer2.occludedBy.some((name) => placedBody.masks[name]?.[bi])) continue;
          const i = yy * layer2.sprite.w + xx;
          layer2.sprite.pixels[i] = 0;
          layer2.sprite.mask.data[i] = 0;
          for (const mask of Object.values(layer2.masks)) mask[i] = 0;
          layer2.emission?.fill(0, i * 3, i * 3 + 3);
        }
      }
      if (style) for (let index = 0; index < placed.length; index++) {
        const layer2 = placed[index], sourceLayer = layers[index];
        const localToActor = sourceLayer.localToActor ?? pixelTransform2D(), localToRaster = composePixelTransform2D(placement, localToActor);
        layer2.sprite = style.apply(layer2.sprite, t, {
          ...options.pixelContext,
          rasterToObject: options.pixelContext?.rasterToObject ?? invertPixelTransform2D(localToRaster),
          objectToWorld: composePixelTransform2D(actorToWorld, localToActor),
          // Use the direct mapping at world/screen threshold boundaries, not an inverse cancellation.
          rasterToWorld: options.pixelContext?.rasterToWorld ?? composePixelTransform2D(actorToWorld, rasterToActor)
        });
        if (style.profile.emission === "none") layer2.emission = null;
        for (const [name, mask] of Object.entries(layer2.masks)) if (!emptyMasks.has(name)) {
          for (let i = 0; i < mask.length; i++) if (!layer2.sprite.mask.data[i]) mask[i] = 0;
        }
      }
      placed.sort((a, b) => a.order - b.order);
      for (const [name, socket] of Object.entries(sockets)) sockets[name] = transformCharacterSocket2D(socket, placement);
      const placedProjectiles = projectiles.map(({ sprite, transform }) => transformSprite2D(sprite, transform ? composePixelTransform2D(placement, transform) : placement));
      const sampleBounds = { x0: Math.min(...placed.map((l) => l.sprite.x)), y0: Math.min(...placed.map((l) => l.sprite.y)), x1: Math.max(...placed.map((l) => l.sprite.x + l.sprite.w)), y1: Math.max(...placed.map((l) => l.sprite.y + l.sprite.h)) }, flat = assembled(placed, sampleBounds, emptyMasks);
      const drawingBounds = { ...sampleBounds };
      for (const s of placedProjectiles) {
        drawingBounds.x0 = Math.min(drawingBounds.x0, s.x);
        drawingBounds.y0 = Math.min(drawingBounds.y0, s.y);
        drawingBounds.x1 = Math.max(drawingBounds.x1, s.x + s.w);
        drawingBounds.y1 = Math.max(drawingBounds.y1, s.y + s.h);
      }
      const anchors = { root: sockets.root.position, head: sockets.head.position, chest: sockets.chest.position, hand: sockets.hand.position, otherHand: sockets.otherHand.position, foot: sockets.foot.position, otherFoot: sockets.otherFoot.position };
      const actor = { ...flat.sprite, renderSource: "pixels", k: asset.nativeHeight / 19, head: [anchors.head[0], flat.sprite.y], chest: [...anchors.chest], anchors };
      return {
        actor,
        bounds: drawingBounds,
        pivot: [-flat.sprite.x, -flat.sprite.y],
        anchors,
        sockets,
        semanticMasks: flat.masks,
        rootMotion,
        frameIndex,
        phaseTime,
        cycle: wrappedTime.cycle,
        layerFrames,
        clip: clipName,
        ...info,
        contacts,
        emission: flat.emission ?? emptyEmission(flat.sprite),
        projectiles: placedProjectiles,
        drawBack(p, alpha = 1) {
          for (const layer2 of placed) if (layer2.order < 0) drawLayer(p, layer2, alpha);
        },
        drawFront(p, alpha = 1) {
          for (const layer2 of placed) if (layer2.order >= 0) drawLayer(p, layer2, alpha);
          for (const projectile of placedProjectiles) blitSprite2D(p, projectile, alpha);
        }
      };
    },
    draw(painter, time, clipName = asset.defaultClip, options = {}) {
      const sampled = player.sample(time, clipName, options);
      sampled.drawBack(painter);
      sampled.drawFront(painter);
      return sampled;
    }
  };
  return player;
}
function nativeLayerClip(width, height, pivot, paint) {
  const frame4 = { w: width, h: height, ox: 0, oy: 0, color: new Uint32Array(width * height), light: new Uint32Array(width * height) }, p = new Painter(frame4);
  paint(p);
  return { version: 1, width, height, pivot, frames: [{ durationMs: 1e3, runs: encodeSpritePixels2D(frame4.color) }] };
}
function createStudioCharacter2D(options = {}) {
  const height = options.height ?? options.style?.height ?? 96, s = height / 96;
  const humanStyle = { view: "three-quarter", build: "regular", skin: "warm", hair: "bob", hairColor: "chestnut", faceShape: "oval", outfit: "jacket", cloth: ["#293e54", "#41677b", "#77a49a"], trousers: ["#35354b", "#515268", "#797785"], outline: "#242635", ...options.style, height, ...options.view ? { view: options.view } : {}, ...options.facing ? { facing: options.facing } : {} };
  const swordW = Math.max(12, Math.ceil(43 * s)), swordH = Math.max(7, Math.ceil(13 * s)), swordPivot = [Math.ceil(6 * s), Math.floor(swordH / 2)];
  const sword = nativeLayerClip(swordW, swordH, swordPivot, (p) => {
    const x = swordPivot[0], y = swordPivot[1];
    p.poly([[x + 4 * s, y - 2 * s], [x + 30 * s, y - 2 * s], [x + 35 * s, y], [x + 30 * s, y + 2 * s], [x + 4 * s, y + 2 * s]], hex("#9faebc"));
    p.line(x + 5 * s, y - 1 * s, x + 31 * s, y - 1 * s, hex("#e2e8da"));
    p.rect(x - 5 * s, y - 1 * s, 9 * s, 3 * s, hex("#76513e"));
    p.rect(x + 3 * s, y - 5 * s, 2 * s, 10 * s, hex("#c3a46a"));
  });
  const bowW = Math.max(9, Math.ceil(20 * s)), bowH = Math.max(16, Math.ceil(43 * s)), bowPivot = [Math.ceil(16 * s), Math.floor(bowH / 2)];
  const bow = nativeLayerClip(bowW, bowH, bowPivot, (p) => {
    const x = bowPivot[0] - 12 * s, y = bowPivot[1];
    p.polyline([[x, y - 19 * s], [x + 8 * s, y - 14 * s], [x + 12 * s, y], [x + 8 * s, y + 14 * s], [x, y + 19 * s]], hex("#b88a57"));
    p.line(x, y - 19 * s, x, y + 19 * s, hex("#c5c5ae"));
    p.rect(x + 10 * s, y - 3 * s, 3 * s, 6 * s, hex("#614b42"));
  });
  const capeW = Math.max(10, Math.ceil(33 * s)), capeH = Math.max(10, Math.ceil(46 * s)), capePivot = [Math.floor(capeW / 2), Math.ceil(3 * s)];
  const cape = nativeLayerClip(capeW, capeH, capePivot, (p) => {
    const [cx, cy] = capePivot;
    p.poly([[cx - 5 * s, cy], [cx + 6 * s, cy], [cx + 14 * s, cy + 35 * s], [cx + 8 * s, cy + 40 * s], [cx - 12 * s, cy + 38 * s]], hex("#563b56"));
    p.poly([[cx - 4 * s, cy + 2 * s], [cx + 1 * s, cy + 3 * s], [cx + 6 * s, cy + 35 * s], [cx - 6 * s, cy + 34 * s]], hex("#805477"));
    p.line(cx - 6 * s, cy + 36 * s, cx + 8 * s, cy + 38 * s, hex("#b28a90"));
  });
  const strandW = Math.max(4, Math.ceil(10 * s)), strandH = Math.max(8, Math.ceil(24 * s)), strandPivot = [Math.floor(strandW / 2), Math.ceil(2 * s)];
  const strand = nativeLayerClip(strandW, strandH, strandPivot, (p) => {
    const [x, y] = strandPivot;
    p.poly([[x - 2 * s, y], [x + 2 * s, y], [x + 3 * s, y + 12 * s], [x - 1 * s, y + 20 * s], [x - 3 * s, y + 15 * s]], hex("#7b4e3b"));
    p.line(x, y + 3 * s, x + 1 * s, y + 12 * s, hex("#a36c48"));
    p.rect(x - 2 * s, y + 6 * s, 4 * s, 2 * s, hex("#c3a46a"));
  });
  const capeKeys = bakeSecondaryMotion2D({ duration: 2, targets: [{ at: 0, angle: -0.08 }, { at: 0.35, angle: 0.22 }, { at: 0.8, angle: -0.22 }, { at: 1.3, angle: 0.16 }, { at: 1.8, angle: -0.08 }, { at: 2, angle: -0.08 }], maxAngle: 0.3 });
  const first = capeKeys[0].angle, last = capeKeys[capeKeys.length - 1].angle;
  for (const key of capeKeys) key.angle += (first - last) * (key.at / 2);
  const clips = {};
  for (const action of HUMAN_ANIMATIONS_2D) clips[action] = { kind: "human", action, ...action === "run" || action === "walk" ? { rootMotion: true } : {}, loadout: { mainHand: action === "sword" ? "wayfarer-sword" : action === "bow" ? "wayfarer-bow" : null } };
  clips["key-strike"] = { kind: "key-pose", fps: 12, poses: { duration: 1.2, loop: false, keys: [
    { at: 0, interpolation: "hold", pose: { lean: -5, leftHand: [-9, -39], rightHand: [12, -45], leftFoot: [-10, -4], rightFoot: [10, -4], fists: true, armsFront: true } },
    { at: 0.3, interpolation: "linear", pose: { lean: -10, leftHand: [-17, -46], rightHand: [10, -48], leftFoot: [-14, -4], rightFoot: [9, -4], fists: true, armsFront: true } },
    { at: 0.5, interpolation: "hold", pose: { lean: 8, leftHand: [38, -48], rightHand: [6, -42], leftFoot: [-16, -4], rightFoot: [18, -4], fists: true, armsFront: true } },
    { at: 0.65, interpolation: "smooth", pose: { lean: 3, leftHand: [27, -43], rightHand: [8, -45], leftFoot: [-14, -4], rightFoot: [16, -4], fists: true, armsFront: true } },
    { at: 1.2, interpolation: "hold", pose: { lean: -5, leftHand: [-9, -39], rightHand: [12, -45], leftFoot: [-10, -4], rightFoot: [10, -4], fists: true, armsFront: true } }
  ], contacts: [{ at: 0, left: true, right: true }], events: [{ id: "strike-impact", at: 0.5, kind: "contact", socket: "hand.grip" }] }, loadout: { mainHand: null } };
  clips.idle = { ...clips.idle, faceTrack: [{ at: 0, blink: false, gaze: 0 }, { at: 1.48, blink: true }, { at: 1.64, blink: false }] };
  const id = options.id ?? "wayfarer", name = options.name ?? "Wayfarer";
  return createCharacterAsset2D({
    schema: "poku.character/v1",
    id,
    name,
    nativeHeight: height,
    source: { kind: "human", style: humanStyle },
    identity: createCharacterIdentity2D(id, name, humanStyle),
    defaultClip: "idle",
    clips,
    slots: [{ id: "mainHand", socket: "hand.grip", order: 10 }, { id: "back", socket: "chest", order: -20 }],
    equipment: { "wayfarer-sword": { id: "wayfarer-sword", slots: ["mainHand"], layers: [{ id: "sword", clip: sword, generator: "human-sword", semantic: "metal", occludedBy: ["hands"] }] }, "wayfarer-bow": { id: "wayfarer-bow", slots: ["mainHand"], layers: [{ id: "bow", clip: bow, generator: "human-bow", semantic: "wood", occludedBy: ["hands"] }] }, "wayfarer-cape": { id: "wayfarer-cape", slots: ["back"], layers: [{ id: "cape", clip: cape, semantic: "cloth", offset: [-3 * s, -6 * s], secondary: { duration: 2, loop: true, keys: capeKeys } }] } },
    loadout: { mainHand: null, back: "wayfarer-cape" },
    layers: [{ id: "hair-lock", socket: "head", order: -10, clip: strand, offset: [-7 * s, 0], angle: 0.1, semantic: "hair", secondary: { duration: 2, loop: true, keys: capeKeys.map((k) => ({ at: k.at, angle: -k.angle * 0.6 })) } }],
    celEdits: [],
    maskEdits: []
  });
}

// src/render/export.ts
function frameDurationMs(index, fps) {
  return Math.round((index + 1) * 1e3 / fps) - Math.round(index * 1e3 / fps);
}
function resolveActDuration(mod, input = {}) {
  const fps = input.fps ?? 60, duration = mod.meta.duration ?? 1, loop = !!mod.meta.loop;
  const poses = mod.act?.poses, from = Math.min(0, Number(poses?.[0]?.[0] ?? 0));
  const end = loop ? duration * 2 : Math.max(duration, Number(poses?.[poses.length - 1]?.[0] ?? 0));
  const hold = loop ? 0 : input.hold ?? 0.3;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1e3 || ![duration, from, end, hold].every(Number.isFinite) || duration < 0 || loop && duration === 0 || hold < 0) throw new RangeError("Invalid acted export timeline");
  const stops = /* @__PURE__ */ new Map();
  for (const hit of mod.act?.hits ?? []) {
    if (!Number.isFinite(hit.t) || !Number.isFinite(hit.stop ?? 0) || (hit.stop ?? 0) < 0) throw new RangeError("Invalid ACT contact time/freeze");
    for (let cycle = 0; cycle < (loop ? 2 : 1); cycle++) {
      if (loop && (hit.t > duration || cycle > 0 && hit.t < 0)) continue;
      const at = Math.max(from, hit.t + cycle * duration);
      if (loop ? at >= end : at > end) continue;
      stops.set(at, Math.max(stops.get(at) ?? 0, hit.stop ?? 0));
    }
  }
  const freezeSeconds = [...stops.values()].reduce((a, b) => a + b, 0);
  const naturalSeconds = end - from + freezeSeconds, seconds = input.seconds ?? naturalSeconds;
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Scene duration must be finite and non-negative");
  const maxSteps = input.seconds === void 0 ? Math.ceil(seconds * fps) + 2 : Math.round(seconds * fps);
  if (!Number.isSafeInteger(maxSteps) || maxSteps > 1e6) throw new RangeError("Scene export exceeds one million frames; choose an explicit duration or lower fps");
  return { fps, from, end, hold, seconds, naturalSeconds, freezeSeconds, maxSteps, loop };
}
function resolveActExport(mod, counter, input = {}, onSample) {
  const plan2 = resolveActDuration(mod, input);
  const complete = () => plan2.loop ? counter.t >= plan2.end - 1e-9 : counter.done();
  let steps = 0;
  onSample?.(counter.t, 0);
  for (; steps < plan2.maxSteps && !complete(); steps++) {
    counter.update(1 / plan2.fps);
    onSample?.(counter.t, steps + 1);
  }
  const truncated = !complete();
  if (truncated && input.seconds === void 0) throw new Error("Act did not reach its declared ending; export an explicit seconds crop or correct its timeline");
  const held = truncated ? 0 : Math.ceil(plan2.fps * plan2.hold), n = 1 + steps + held;
  return {
    ...plan2,
    n,
    steps,
    held,
    truncated,
    lastTime: counter.t,
    duration: (n - 1) / plan2.fps,
    playbackDuration: n / plan2.fps,
    termination: truncated ? "explicit-duration-crop" : plan2.loop ? "two-cycles" : "completed"
  };
}
function exportLayout2D(size, origin, transform = {}) {
  const [w, h] = size, [ox, oy] = origin, margin = transform.margin ?? 0;
  if (![w, h].every((v) => Number.isSafeInteger(v) && v > 0) || ![ox, oy].every(Number.isFinite) || !Number.isSafeInteger(margin) || margin < 0)
    throw new RangeError("Export dimensions, origin or margin are invalid");
  const angle = transform.angle ?? 0;
  if (!Number.isFinite(angle) || transform.x !== void 0 && !Number.isFinite(transform.x) || transform.y !== void 0 && !Number.isFinite(transform.y)) throw new RangeError("Export transform must be finite");
  if (transform.x !== void 0 || transform.y !== void 0) {
    const x = transform.x ?? ox, y = transform.y ?? oy;
    return { w: w + 2 * margin, h: h + 2 * margin, x, y, ox: -margin, oy: -margin, pivot: [x + margin, y + margin] };
  }
  const snap = (v) => Math.abs(v) < 1e-12 ? 0 : Math.abs(v - 1) < 1e-12 ? 1 : Math.abs(v + 1) < 1e-12 ? -1 : v;
  const cs = snap(Math.cos(angle)), sn = snap(Math.sin(angle)), sign = transform.flip ? -1 : 1;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < 4; i++) {
    const lx = (i & 1 ? w : 0) - ox, ly = (i & 2 ? h : 0) - oy;
    const x = lx * sign * cs - ly * sn, y = lx * sign * sn + ly * cs;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  left = Math.floor(left + 1e-9);
  right = Math.ceil(right - 1e-9);
  top = Math.floor(top + 1e-9);
  bottom = Math.ceil(bottom - 1e-9);
  return {
    w: right - left + 2 * margin,
    h: bottom - top + 2 * margin,
    x: -left,
    y: -top,
    ox: -margin,
    oy: -margin,
    pivot: [margin - left, margin - top]
  };
}
function resolveEffectExport(meta, input = {}) {
  const fps = input.fps ?? meta.fps ?? 30, sourceDuration = meta.duration ?? 1, duration = input.seconds ?? sourceDuration, margin = input.margin ?? 0;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1e3) throw new RangeError("Export fps must be in (0, 1000]");
  if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Export duration must be finite and non-negative");
  const options = { ...meta.options ?? {}, ...input.options ?? {} };
  if (input.seed !== void 0) options.seed = input.seed;
  const layout = exportLayout2D(meta.size, meta.origin, {
    flip: !!options.flip,
    angle: options.angle,
    margin,
    x: options.x,
    y: options.y
  });
  const screen = meta.size[0] >= 320 && Math.abs(meta.size[0] / meta.size[1] - 16 / 9) < 0.05;
  const fade2 = input.edgeFade === false ? 0 : input.edgeFade ?? (margin === 0 && !screen ? 8 : 0);
  if (!Number.isFinite(fade2) || fade2 < 0) throw new RangeError("edgeFade must be a non-negative number or false");
  const n = Math.max(1, Math.round(duration * fps) + (meta.loop ? 0 : 1));
  if (!Number.isSafeInteger(n)) throw new RangeError("Export frame count is too large");
  const settings = {
    output: "effect-sheet",
    fps,
    seed: options.seed,
    loop: !!meta.loop,
    terminalFrame: meta.loop ? "excluded" : "included",
    background: "transparent",
    actor: false,
    cameraMotion: false,
    edgeFade: fade2,
    margin,
    sourceDuration,
    exportDuration: duration,
    truncated: !meta.loop && duration < sourceDuration,
    // Keep selection data, not live adapter methods, in reproducible export metadata.
    options: Object.fromEntries(Object.entries(options).filter(([key, value]) => key !== "actorAdapter" && typeof value !== "function"))
  };
  return { layout, fps, n, options: { ...options, x: layout.x, y: layout.y }, settings };
}
function edgeFade(frame4, width = 8) {
  if (!(width > 0)) return;
  const { w, h, light, hdrLight } = frame4;
  for (let y = 0; y < h; y++) {
    const ey = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= width) {
        x = Math.max(x, Math.floor(w - 1 - width));
        continue;
      }
      const i = y * w + x, value = light[i], u = Math.min(1, (e + 0.5) / width), k = u * u * (3 - 2 * u);
      if (value & 16777215) light[i] = value & 4278190080 | Math.round((value & 255) * k) | Math.round((value >>> 8 & 255) * k) << 8 | Math.round((value >>> 16 & 255) * k) << 16;
      if (hdrLight) {
        const j = i * 3;
        hdrLight[j] *= k;
        hdrLight[j + 1] *= k;
        hdrLight[j + 2] *= k;
      }
    }
  }
}
function separateFrameLayers(frame4, lighting) {
  const pixels = frame4.w * frame4.h, color = new Uint8ClampedArray(pixels * 4), emission = new Float32Array(pixels * 3);
  if (lighting && (lighting.radiance.length !== pixels * 3 || lighting.occlusion.length !== pixels))
    throw new RangeError("Invalid lighting snapshot buffers");
  for (let i = 0; i < pixels; i++) {
    const c = frame4.color[i], p = i * 4, j = i * 3;
    color[p] = c & 255;
    color[p + 1] = c >>> 8 & 255;
    color[p + 2] = c >>> 16 & 255;
    color[p + 3] = c >>> 24;
    if (frame4.hdrLight) {
      emission[j] = frame4.hdrLight[j];
      emission[j + 1] = frame4.hdrLight[j + 1];
      emission[j + 2] = frame4.hdrLight[j + 2];
    } else {
      const l = frame4.light[i];
      emission[j] = channelToLinear(l, 0);
      emission[j + 1] = channelToLinear(l, 8);
      emission[j + 2] = channelToLinear(l, 16);
    }
  }
  return { color, emission, ...lighting ? { radiance: lighting.radiance.slice(), occlusion: lighting.occlusion.slice() } : {} };
}
function atlasMetadata(input) {
  const { w, h, n, fps, columns, animationName } = input;
  const frames = Array.from({ length: n }, (_, i) => ({
    filename: `${animationName} ${i}`,
    frame: { x: i % columns * w, y: Math.floor(i / columns) * h, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
    duration: frameDurationMs(i, fps)
  }));
  const pokuFx = {
    id: input.id,
    name: input.name,
    fps,
    loop: input.loop,
    frames: n,
    frameSize: [w, h],
    pivot: [...input.pivot],
    columns,
    durationMs: Math.round(n * 1e3 / fps),
    timeSamples: Array.from({ length: n }, (_, i) => i / fps),
    ...input.contacts?.length ? { contacts: input.contacts } : {},
    ...input.restoration ? { restoration: input.restoration } : {},
    ...input.act ? { act: input.act } : {},
    ...input.settings ? { settings: input.settings } : {}
  };
  return { frames, meta: {
    app: "Poku Pixel FX",
    version: "1",
    image: input.image,
    format: "RGBA8888",
    size: { w: columns * w, h: Math.ceil(n / columns) * h },
    scale: "1",
    frameTags: [{ name: animationName, from: 0, to: n - 1, direction: "forward" }],
    pokuFx
  } };
}
function transformExportSockets(sockets, origin, pivot, options = {}) {
  if (!sockets) return void 0;
  const angle = options.angle ?? 0, sign = options.flip ? -1 : 1, cs = Math.cos(angle), sn = Math.sin(angle);
  const vector = (x, y) => [sign * x * cs - y * sn, sign * x * sn + y * cs];
  return Object.fromEntries(Object.entries(sockets).map(([name, s]) => {
    const [x, y] = vector(s.x - origin[0], s.y - origin[1]);
    return [name, {
      ...s,
      x: pivot[0] + x,
      y: pivot[1] + y,
      ...s.angle === void 0 ? {} : { angle: (options.flip ? Math.PI - s.angle : s.angle) + angle },
      ...s.basisX ? { basisX: vector(...s.basisX) } : {},
      ...s.basisY ? { basisY: vector(...s.basisY) } : {}
    }];
  }));
}
function transformExportContacts(contacts, options = {}) {
  return contacts.map((contact) => transformImpactContact2D(contact, { flip: !!options.flip, angle: options.angle ?? 0 }));
}
function collectAssetEvents(mod) {
  return [...mod.meta?.cues ?? [], ...mod.events ?? [], ...(mod.act?.hits ?? []).map((hit) => ({ ...hit, type: "contact" }))];
}
function resolveAtlasExportSettings(input = {}) {
  const out = { maxTextureSize: 2048, padding: 1, extrude: 0, trim: false, deduplicate: false, ...input };
  if (!Number.isSafeInteger(out.maxTextureSize) || out.maxTextureSize < 1 || out.maxTextureSize > 4096 || !Number.isSafeInteger(out.padding) || out.padding < 0 || out.padding * 2 >= out.maxTextureSize || !Number.isSafeInteger(out.extrude) || out.extrude < 0 || out.extrude > out.padding) throw new RangeError("Atlas size/padding/extrusion are invalid; extrusion must fit inside padding");
  if (typeof out.trim !== "boolean" || typeof out.deduplicate !== "boolean") throw new TypeError("Atlas trim/deduplicate must be boolean");
  return out;
}
function extrudeAtlasRegion(buffer, pageWidth, channels, rect, amount) {
  if (!Number.isInteger(pageWidth) || pageWidth < 1 || !Number.isInteger(channels) || channels < 1 || !Number.isInteger(amount) || amount < 0 || buffer.length % (pageWidth * channels) !== 0 || ![rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) || rect.w < 1 || rect.h < 1 || rect.x - amount < 0 || rect.y - amount < 0 || rect.x + rect.w + amount > pageWidth || rect.y + rect.h + amount > buffer.length / pageWidth / channels) throw new RangeError("Atlas extrusion exceeds its reserved page region");
  if (!amount) return;
  const right = rect.x + rect.w - 1, bottom = rect.y + rect.h - 1;
  for (let y = rect.y - amount; y <= bottom + amount; y++) for (let x = rect.x - amount; x <= right + amount; x++) {
    if (x >= rect.x && x <= right && y >= rect.y && y <= bottom) continue;
    const source = (Math.min(bottom, Math.max(rect.y, y)) * pageWidth + Math.min(right, Math.max(rect.x, x))) * channels, dest = (y * pageWidth + x) * channels;
    for (let c = 0; c < channels; c++) buffer[dest + c] = buffer[source + c];
  }
}
function resolveAssetEvents(events, frames, loopDuration) {
  if (!frames.length) return [];
  const result = [], starts = [];
  let elapsed = 0;
  for (const frame4 of frames) {
    starts.push(elapsed);
    elapsed += frame4.duration;
  }
  const last = frames[frames.length - 1].time;
  for (const event of events) {
    const at = Number(event.sourceTime ?? event.t ?? event.at ?? event.time);
    if (!Number.isFinite(at)) throw new RangeError("Asset event needs a finite authored time");
    const cycles = loopDuration && loopDuration > 0 && at >= 0 ? Math.max(1, Math.floor((last - at + 1e-9) / loopDuration) + 1) : 1;
    for (let cycle = 0; cycle < cycles; cycle++) {
      const sourceTime = at + cycle * (loopDuration ?? 0);
      if (sourceTime < frames[0].time - 1e-9 || sourceTime > last + 1e-9) continue;
      const index = frames.findIndex((frame4) => frame4.time >= sourceTime - 1e-9);
      if (index < 0) continue;
      result.push({ name: String(event.id ?? event.name ?? event.kind ?? event.type ?? "event"), timeMs: starts[index], sourceTime, payload: { ...event } });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}
function createAtlasPacker(maxTextureSize = 2048, padding = 1) {
  if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1 || maxTextureSize > 16384 || !Number.isSafeInteger(padding) || padding < 0 || padding * 2 >= maxTextureSize)
    throw new RangeError("Atlas texture size/padding are invalid");
  const pages = [];
  let page = -1, x = 0, y = 0, rowHeight = 0;
  return {
    pages,
    place(w, h) {
      if (![w, h].every((v) => Number.isSafeInteger(v) && v > 0) || w + 2 * padding > maxTextureSize || h + 2 * padding > maxTextureSize)
        throw new RangeError("A frame exceeds the atlas page limit; reduce the native frame size or choose a larger page");
      if (page < 0) {
        page = 0;
        pages.push({ w: 0, h: 0 });
      }
      if (x + w + 2 * padding > maxTextureSize) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      if (y + h + 2 * padding > maxTextureSize) {
        page++;
        pages.push({ w: 0, h: 0 });
        x = 0;
        y = 0;
        rowHeight = 0;
      }
      const rect = { x: x + padding, y: y + padding, w, h };
      x += w + 2 * padding;
      rowHeight = Math.max(rowHeight, h + 2 * padding);
      pages[page].w = Math.max(pages[page].w, x);
      pages[page].h = Math.max(pages[page].h, y + rowHeight);
      return { page, rect };
    }
  };
}
function frameContentBounds(w, h, rgba, emission, radiance, occlusion) {
  if (![w, h].every((v) => Number.isSafeInteger(v) && v > 0) || rgba.length !== w * h * 4 || emission && emission.length !== w * h * 3 || radiance && radiance.length !== w * h * 3 || occlusion && occlusion.length !== w * h) throw new RangeError("Invalid frame buffers");
  let left = w, right = -1, top = h, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = i * 4, e = i * 3;
    if (rgba[c] || rgba[c + 1] || rgba[c + 2] || rgba[c + 3] || emission && (emission[e] || emission[e + 1] || emission[e + 2]) || radiance && (radiance[e] || radiance[e + 1] || radiance[e + 2]) || occlusion && occlusion[i] !== 1) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? { x: 0, y: 0, w: 1, h: 1 } : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

// src/core/rig.ts
var PAL = Object.fromEntries(Object.entries(DUMMY_PAL).map(([k, v]) => [k, hex(v) >>> 0]));
var INK = PAL.k;
var SEAM = PAL.J;
var MARK = PAL.m;
var SHELL = [PAL.A, PAL.B, PAL.C, PAL.D];
var CORE = [PAL.E, PAL.F, PAL.G, PAL.G];
var DEG = Math.PI / 180;
var W0 = 24;
var H0 = 38;
var add2 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var len = (a) => Math.hypot(a[0], a[1], a[2]);
var unit2 = (a) => mul(a, 1 / (len(a) || 1e-6));
var rotY = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
var rotZ = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
var mm = (A, B) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
};
var mv = (M2, v) => [M2[0] * v[0] + M2[1] * v[1] + M2[2] * v[2], M2[3] * v[0] + M2[4] * v[1] + M2[5] * v[2], M2[6] * v[0] + M2[7] * v[1] + M2[8] * v[2]];
var tv = (M2, v) => [M2[0] * v[0] + M2[3] * v[1] + M2[6] * v[2], M2[1] * v[0] + M2[4] * v[1] + M2[7] * v[2], M2[2] * v[0] + M2[5] * v[1] + M2[8] * v[2]];
var clamp01 = (v) => Math.max(0, Math.min(1, v));
var M = {
  pelvis: 19.7,
  spine1: 2.8,
  spine2: 4.6,
  shoulderUp: 2.5,
  shoulderOut: 5.9,
  neckUp: 4,
  headUp: 3.1,
  hipDown: 1.1,
  hipOut: 2.8,
  thigh: 8.6,
  shin: 8.3,
  upper: 7.6,
  fore: 7.4,
  turn: 36 * DEG
};
var STAND = { lean: 0, crouch: 0, yaw: 0, fx: -3, fy: -15, bx: 5, by: -15, ffx: -2, ffy: -4, fbx: 3, fby: -4 };
function ik2(a, target, L1, L2, pole) {
  let to = sub(target, a), d = len(to);
  const reach = L1 + L2 - 0.02;
  if (d > reach) {
    to = mul(to, reach / d);
    d = reach;
  }
  const u = unit2(to), along2 = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along2 * along2));
  let v = sub(pole, mul(u, dot(pole, u)));
  v = len(v) < 1e-4 ? unit2(cross(u, [0, 0, 1])) : unit2(v);
  return { joint: add2(a, add2(mul(u, along2), mul(v, h))), end: add2(a, to), u, v };
}
function frame3(t, R) {
  return { t, R };
}
function boneFrame(a, b, pole) {
  const x = unit2(sub(b, a));
  let y = sub(pole, mul(x, dot(pole, x)));
  y = len(y) < 1e-4 ? unit2(cross(x, [0, 0, 1])) : unit2(y);
  const z = cross(x, y);
  return frame3(a, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}
var weaponOf = (name) => WEAPONS[name];
function solve(pose) {
  const q = { ...STAND, ...pose }, lean = q.lean, W = q.weapon && weaponOf(q.weapon), OW = q.offWeapon && weaponOf(q.offWeapon);
  const sa = q.sa ?? 0, wl = q.wl ?? 1, axisZ = Math.sqrt(Math.max(0, 1 - wl * wl)) * (q.wz ?? 1);
  const axis = [Math.cos(sa) * wl, -Math.sin(sa) * wl, axisZ], side = [-Math.sin(sa), -Math.cos(sa), 0];
  const two = !!(q.two && W), nearZ = q.fz ?? (two ? 3 : 4.5);
  const fwd = (q.fx - STAND.fx) / 24, farFwd = two ? 0 : (q.bx - STAND.bx) / 22;
  let turn = M.turn + (fwd >= 0 ? -44 * DEG * Math.min(1, fwd) : 28 * DEG * Math.min(1, -fwd * 1.8));
  turn += (farFwd > 0 ? 34 * DEG * Math.min(1, farFwd) : 0) + (q.twist ?? 0) * 4 * DEG;
  if (q.turn !== void 0) turn = q.turn;
  const hipTurn = M.turn + (turn - M.turn) * 0.45, tilt = Math.atan2(lean, 13);
  const Rp = mm(rotZ(-tilt * 0.25), rotY(-hipTurn)), Rc = mm(rotZ(-tilt), rotY(-turn));
  const ankleN = [q.ffx, -q.ffy - 1.8, q.fzz ?? 2.4], ankleF = [q.fbx, -q.fby - 1.8, q.bzz ?? -2.4];
  let pelvis = [lean * 0.2, M.pelvis - q.crouch, 0];
  const hipAt = (s) => add2(pelvis, mv(Rp, [0, -M.hipDown, s * M.hipOut]));
  const maxLeg = (M.thigh + M.shin) * 0.995;
  for (const [s, a] of [[1, ankleN], [-1, ankleF]]) {
    const h = hipAt(s), dx = h[0] - a[0], dz = h[2] - a[2], flat = dx * dx + dz * dz;
    if (flat < maxLeg * maxLeg) {
      const top = a[1] + Math.sqrt(maxLeg * maxLeg - flat);
      if (h[1] > top) pelvis = [pelvis[0], pelvis[1] - (h[1] - top), pelvis[2]];
    }
  }
  const waist = add2(pelvis, [Math.sin(tilt * 0.45) * M.spine1, Math.cos(tilt * 0.45) * M.spine1, 0]);
  const chest = add2(waist, [Math.sin(tilt) * M.spine2, Math.cos(tilt) * M.spine2, 0]);
  const neck = add2(chest, mv(Rc, [0, M.neckUp, 0]));
  const headTurn = M.turn * 0.9 + (turn - M.turn) * 0.35, nod = tilt * 0.35 + (q.hy ?? 0) * 7 * DEG, roll = (q.hx ?? 0) * 7 * DEG;
  const Rh = mm(rotZ(-nod - roll), rotY(-headTurn));
  const head = add2(neck, mv(Rh, [0.15, M.headUp, 0]));
  const pick = (s, target) => {
    const base = add2(chest, mv(Rc, [0, M.shoulderUp, s * M.shoulderOut])), to = sub(target, base), d = len(to);
    return add2(base, mul(unit2(to), Math.min(1.8, Math.max(0, d - 11) * 0.35)));
  };
  const nearT = [q.fx, -q.fy, nearZ];
  const farT = two ? [q.fx + axis[0] * W.two, -q.fy + axis[1] * W.two, nearZ + axis[2] * W.two] : [q.bx, -q.by, q.bz ?? (q.armsFront ? 5.5 : -4.5)];
  const sN = pick(1, nearT), sF = pick(-1, farT);
  const pole = (s, T, shoulder, hold) => {
    const up = clamp01((T[1] - shoulder[1] + 2) / 10);
    const base = [-0.55 + up * 1.1, -1 + up * 0.9, s * (0.45 + up * 0.5)];
    if (!hold) return base;
    const u = unit2(sub(T, shoulder));
    let best = base, score = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, x = unit2(cross(u, [0.3, 1, 0.2])), y = cross(u, x), v = add2(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
      const A = ik2(shoulder, T, M.upper, M.fore, v), f = unit2(sub(A.end, A.joint));
      const cost = Math.abs(dot(f, hold)) * 0.7 + (1 - dot(unit2(base), v)) * 0.55;
      if (cost < score) {
        score = cost;
        best = v;
      }
    }
    return best;
  };
  const holdN = W ? W.across ? side : axis : null, holdF = two ? W.across ? side : axis : OW ? [Math.cos(q.sb ?? Math.PI), -Math.sin(q.sb ?? Math.PI), 0] : null;
  const armN = ik2(sN, nearT, M.upper, M.fore, pole(1, nearT, sN, holdN)), armF = ik2(sF, farT, M.upper, M.fore, pole(-1, farT, sF, holdF));
  const kneePole = (s) => mv(Rp, [1, 0, s * 0.35]);
  const hipN = hipAt(1), hipF = hipAt(-1);
  const legN = ik2(hipN, ankleN, M.thigh, M.shin, kneePole(1)), legF = ik2(hipF, ankleF, M.thigh, M.shin, kneePole(-1));
  const footDir = (s) => {
    const t = hipTurn * 0.6 + s * 8 * DEG;
    return [Math.cos(t), 0, Math.sin(t)];
  };
  const B = {
    pelvis: frame3(pelvis, Rp),
    waist: frame3(waist, mm(rotZ(-tilt * 0.6), rotY(-(turn + hipTurn) / 2))),
    chest: frame3(chest, Rc),
    head: frame3(head, Rh),
    neck: frame3(neck, Rh),
    upperN: boneFrame(sN, armN.joint, armN.v),
    foreN: boneFrame(armN.joint, armN.end, armN.v),
    upperF: boneFrame(sF, armF.joint, armF.v),
    foreF: boneFrame(armF.joint, armF.end, armF.v),
    thighN: boneFrame(hipN, legN.joint, legN.v),
    shinN: boneFrame(legN.joint, legN.end, legN.v),
    thighF: boneFrame(hipF, legF.joint, legF.v),
    shinF: boneFrame(legF.joint, legF.end, legF.v)
  };
  B.footN = frame3(legN.end, mm(rotY(-Math.atan2(footDir(1)[2], footDir(1)[0])), rotZ(q.toeF ? -55 * DEG : 0)));
  B.footF = frame3(legF.end, mm(rotY(-Math.atan2(footDir(-1)[2], footDir(-1)[0])), rotZ(q.toeB ? -55 * DEG : 0)));
  return { B, W, OW, q, axis, side, armN, armF, legN, legF, sN, sF, hipN, hipF, turn };
}
var BW = 300;
var BH = 240;
var OX = 150;
var OY = 180;
var Zb = new Float32Array(BW * BH);
var Tone = new Float32Array(BW * BH);
var Part = new Int8Array(BW * BH);
var Mat = new Int8Array(BW * BH);
var Fr = new Int8Array(BW * BH);
var LX = new Float32Array(BW * BH);
var LY = new Float32Array(BW * BH);
var Col = new Uint32Array(BW * BH);
var touched = [];
var LIGHT = unit2([-0.55, 0.72, 0.5]);
var clipBody = false;
var clipWeapon = false;
var curFrameIndex = 0;
var curDim = 0;
var onlyPart = 0;
var FRAME_IDS = ["pelvis", "waist", "chest", "head", "neck", "upperN", "foreN", "upperF", "foreF", "thighN", "shinN", "thighF", "shinF", "footN", "footF"];
function plot(i, z, tone, part, mat, wx, wy, color) {
  if (onlyPart && part !== onlyPart) return;
  if (Part[i] === 0) touched.push(i);
  else if (z <= Zb[i]) return;
  Zb[i] = z;
  Tone[i] = tone;
  Part[i] = part;
  Mat[i] = mat;
  Fr[i] = curFrameIndex;
  LX[i] = wx;
  LY[i] = wy;
  Col[i] = color;
}
function sphere(c, r, part, mat) {
  const x0 = Math.floor(c[0] - r), x1 = Math.ceil(c[0] + r), y0 = Math.floor(c[1] - r), y1 = Math.ceil(c[1] + r);
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      const dx = wx - c[0], dy = wy - c[1], d2 = dx * dx + dy * dy;
      if (d2 > r * r || clipBody && wy < 1.5) continue;
      const dz = Math.sqrt(r * r - d2), n = [dx / r, dy / r, dz / r], i = (OY - wy) * BW + (OX + wx);
      plot(i, c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
    }
}
function sweep(a, b, ra, rb, part, mat, bulge = 0) {
  const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.4));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    sphere(add2(a, mul(sub(b, a), u)), ra + (rb - ra) * u + bulge * Math.sin(u * Math.PI), part, mat);
  }
}
function ellipsoid(c, R, r, part, mat) {
  const big = Math.max(r[0], r[1], r[2]), x0 = Math.floor(c[0] - big), x1 = Math.ceil(c[0] + big), y0 = Math.floor(c[1] - big), y1 = Math.ceil(c[1] + big);
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], D = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])];
  const A = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = R[i * 3] * D[0] * R[j * 3] + R[i * 3 + 1] * D[1] * R[j * 3 + 1] + R[i * 3 + 2] * D[2] * R[j * 3 + 2];
  void Rt;
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      if (clipBody && wy < 1.5) continue;
      const dx = wx - c[0], dy = wy - c[1];
      const qa = A[8], qb = 2 * (A[2] * dx + A[5] * dy), qc = A[0] * dx * dx + 2 * A[1] * dx * dy + A[4] * dy * dy - 1, disc = qb * qb - 4 * qa * qc;
      if (disc < 0) continue;
      const dz = (-qb + Math.sqrt(disc)) / (2 * qa);
      const n = unit2([A[0] * dx + A[1] * dy + A[2] * dz, A[3] * dx + A[4] * dy + A[5] * dz, A[6] * dx + A[7] * dy + A[8] * dz]);
      plot((OY - wy) * BW + (OX + wx), c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
    }
}
var PART = { pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6, upperN: 7, elbowN: 8, foreN: 9, handN: 10, upperF: 11, elbowF: 12, foreF: 13, handF: 14, thighN: 15, kneeN: 16, shinN: 17, footN: 18, thighF: 19, kneeF: 20, shinF: 21, footF: 22, weapon: 23, offWeapon: 24 };
var useFrame = (name) => {
  curFrameIndex = FRAME_IDS.indexOf(name);
};
function drawBody(S) {
  const { B, armN, armF, legN, legF, sN, sF, hipN, hipF, turn } = S, F_ = (name) => B[name];
  useFrame("pelvis");
  ellipsoid(add2(F_("pelvis").t, mv(F_("pelvis").R, [0, -0.2, 0])), F_("pelvis").R, [2.9, 2.6, 4.2], PART.pelvis, 0);
  useFrame("waist");
  sweep(F_("pelvis").t, F_("chest").t, 3, 3.3, PART.waist, 1);
  useFrame("chest");
  ellipsoid(add2(F_("chest").t, mv(F_("chest").R, [0.2, 0.9, 0])), F_("chest").R, [3.4, 4.2, 5.5], PART.chest, 0);
  useFrame("neck");
  sweep(F_("neck").t, add2(F_("neck").t, mv(F_("head").R, [0, 1.6, 0])), 1.25, 1.15, PART.neck, 1);
  useFrame("head");
  ellipsoid(F_("head").t, F_("head").R, [3, 3.3, 2.8], PART.head, 0);
  ellipsoid(add2(F_("head").t, mv(F_("head").R, [0.85, -0.45, 0])), F_("head").R, [2.4, 2.7, 2.35], PART.face, 0);
  const arm = (far, A, sh, up, el, fo, ha, nameU, nameF) => {
    curDim = far ? 1 : 0;
    useFrame(nameU);
    sphere(sh, 2.5, up, 0);
    sweep(sh, A.joint, 2.1, 1.6, up, 0);
    sphere(A.joint, 1.45, el, 1);
    useFrame(nameF);
    sweep(A.joint, A.end, 1.6, 1.2, fo, 0, 0.15);
    sphere(A.end, 1.9, ha, 0);
    curDim = 0;
  };
  arm(false, armN, sN, PART.upperN, PART.elbowN, PART.foreN, PART.handN, "upperN", "foreN");
  arm(true, armF, sF, PART.upperF, PART.elbowF, PART.foreF, PART.handF, "upperF", "foreF");
  const leg = (far, L, hip, th, kn, sh, fo, nameT, nameS, nameFt) => {
    useFrame(nameT);
    sweep(hip, L.joint, 3.2, 2.2, th, 0);
    sphere(L.joint, 1.9, kn, 1);
    useFrame(nameS);
    sweep(L.joint, L.end, 2.15, 1.4, sh, 0, 0.4);
    useFrame(nameFt);
    const R = F_(nameFt).R, a = F_(nameFt).t;
    sweep(add2(a, mv(R, [-1.5, -0.6, 0])), add2(a, mv(R, [4.6, -1.1, 0])), 1.7, 1.25, fo, 0);
  };
  leg(false, legN, hipN, PART.thighN, PART.kneeN, PART.shinN, PART.footN, "thighN", "shinN", "footN");
  leg(true, legF, hipF, PART.thighF, PART.kneeF, PART.shinF, PART.footF, "thighF", "shinF", "footF");
  void turn;
}
function along(H, axis, side, part) {
  const n = cross(axis, side);
  const T = (i, k, c, lift = 0) => {
    const x = H[0] + axis[0] * i + side[0] * k + n[0] * lift, y = H[1] + axis[1] * i + side[1] * k + n[1] * lift, z = H[2] + axis[2] * i + side[2] * k + n[2] * lift;
    const wx = Math.round(x), wy = Math.round(y);
    if (clipWeapon && wy < 0) return;
    const idx = (OY - wy) * BW + (OX + wx);
    if (idx < 0 || idx >= BW * BH) return;
    curFrameIndex = -1;
    plot(idx, z + 0.05, 2, part, 2, wx, wy, c);
  };
  T.at = (i, k) => [H[0] + axis[0] * i + side[0] * k, H[1] + axis[1] * i + side[1] * k, H[2] + axis[2] * i + side[2] * k];
  return T;
}
var STEEL = Object.fromEntries(Object.entries({ hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033", olive: "#58663f", oliveA: "#7d8c58", oliveD: "#3a4529" }).map(([k, v]) => [k, hex(v) >>> 0]));
function blade(T, from, length, w) {
  for (let i = from; i <= from + length + 0.01; i += 0.4) {
    const r = i - from, wd = r > length - 5 ? Math.max(0, (length - r) / 5 * w) : w;
    for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
  }
}
var haft = (T, from, to, a, d, r = 0.8) => {
  for (let i = from; i <= to; i += 0.4) for (let k = -r; k <= r + 0.01; k += 0.4) T(i, k, k > 0.1 ? d : a);
};
var WEAPONS = {
  // the fist is at i = 0; `two` is where the other hand goes; `across`: the handle lies across the weapon's length
  sword: { two: -4.4, draw(T, q) {
    const end = q.two ? -6.5 : -2.6;
    haft(T, end, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.4; k <= 1.4; k += 0.4) T(end - 0.4, k, STEEL.gold);
    for (let k = -4.6; k <= 4.6; k += 0.4) T(2.6, k, Math.abs(k) > 3.8 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD);
    blade(T, 3.2, 25, 2.2);
  } },
  greatsword: { two: -4.8, draw(T) {
    haft(T, -7.2, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.8; k <= 1.8; k += 0.4) T(-7.6, k, STEEL.gold);
    for (let k = -6.6; k <= 6.6; k += 0.4) T(2.6, k, Math.abs(k) > 5.6 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD);
    blade(T, 3.2, 31, 3);
    for (let i = 4; i <= 28; i += 0.4) T(i, 0, STEEL.b);
  } },
  dagger: { draw(T) {
    haft(T, -2.4, 1.8, STEEL.grip, STEEL.gripD);
    for (let k = -2.6; k <= 2.6; k += 0.4) T(2.2, k, STEEL.goldD);
    blade(T, 2.6, 10, 1.3);
  } },
  spear: { two: -12, draw(T) {
    haft(T, -18, 36, STEEL.wood, STEEL.woodD, 0.5);
    blade(T, 36, 11, 2);
    for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, STEEL.goldD);
  } },
  hammer: { two: -7, draw(T) {
    for (const lift of [-0.8, 0, 0.8]) for (let i = -10; i <= 18; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? STEEL.woodD : STEEL.wood, lift);
    for (let i = 18; i <= 28; i += 0.4) for (let k = -9; k <= 9; k += 0.4) {
      const face = Math.abs(k) > 7.4 ? k < 0 ? STEEL.a : STEEL.d : i < 20 ? STEEL.hi : i > 26.4 ? STEEL.d : Math.abs(k) < 2 ? STEEL.gold : STEEL.b;
      T(i, k, face, 4.5);
      T(i, k, face, -4.5);
      if (i < 18.4 || i > 27.6 || Math.abs(k) > 8.6) for (let l = -4; l <= 4; l += 0.4) T(i, k, k < 0 ? STEEL.a : i > 27.6 ? STEEL.d : STEEL.b, l);
    }
  } },
  scythe: { two: -11, draw(T) {
    haft(T, -16, 31, STEEL.dark, STEEL.darkD, 0.5);
    for (let j = 0; j <= 28; j += 0.4) {
      const u = j / 28, w = 3.2 * (1 - u) + 0.3, b = 31.5 - u * u * 12;
      for (let k = -w; k <= w; k += 0.4) T(b + k, j + 0.8, k > w * 0.3 ? STEEL.hi : k < -w * 0.4 ? STEEL.d : STEEL.b);
    }
  } },
  claw: { draw(T) {
    for (const q0 of [-2.4, 0, 2.4])
      for (let i = 2; i <= 9.5; i += 0.4) {
        const u = (i - 2) / 7.5, k = q0 + u * u * 1.8;
        T(i, k, u > 0.55 ? STEEL.hi : STEEL.a);
        if (u < 0.6) T(i, k + 0.8, STEEL.d);
      }
  } },
  bow: { across: true, draw(T, q, off) {
    for (let u = -1; u <= 1.001; u += 0.025) {
      const k = u * 17, i = 6 * (1 - u * u) - 1;
      T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
      T(i + 0.8, k, STEEL.woodD);
    }
    const tipA = T.at(-1, -17), tipB = T.at(-1, 17), mid = q.pull ? off : T.at(-1, 0);
    const line = (A, B, c) => {
      const n = Math.max(2, Math.ceil(len(sub(B, A)) / 0.4)), Z = STEEL.a;
      for (let k = 0; k <= n; k++) {
        const P = add2(A, mul(sub(B, A), k / n)), wx = Math.round(P[0]), wy = Math.round(P[1]), idx = (OY - wy) * BW + (OX + wx);
        curFrameIndex = -1;
        plot(idx, P[2] + 0.05, 2, PART.weapon, 2, wx, wy, c ?? Z);
      }
    };
    line(tipA, mid);
    line(tipB, mid);
    if (q.nocked) {
      const nock = mid, tip = T.at(13, 0);
      line(nock, tip, STEEL.wood);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  } },
  pistol: { across: true, draw(T) {
    for (let i = -1; i <= 9.5; i += 0.4) for (let k = -4.2; k <= -2.4; k += 0.4) T(i, k, k < -3.6 ? STEEL.a : k > -2.9 ? STEEL.d : STEEL.b);
    for (let i = -1.2; i <= 1.2; i += 0.4) for (let k = -2.4; k <= 2.4; k += 0.4) T(i, k, STEEL.gripD);
    T(9, -4.6, STEEL.hi);
  } },
  launcher: { two: -9, draw(T) {
    for (let i = -14; i <= 22; i += 0.4) for (let k = -6; k <= -1; k += 0.4) T(i, k, k < -4.8 ? STEEL.oliveA : k > -2.2 ? STEEL.oliveD : Math.abs(i - 3) < 1.4 ? STEEL.gold : STEEL.olive);
    for (let k = -6.8; k <= -0.2; k += 0.4) T(22.4, k, STEEL.b), T(-14.4, k, STEEL.d);
  } },
  handle: { draw(T) {
    haft(T, -2.6, 6, STEEL.grip, STEEL.gripD);
    for (let k = -1.6; k <= 1.6; k += 0.4) T(-3, k, STEEL.gold), T(6.4, k, STEEL.gold);
  } }
};
function finish(S, restFrames) {
  const dim = (part) => part >= PART.upperF && part <= PART.handF ? 1 : part >= PART.thighF && part <= PART.footF ? 1 : 0;
  const toneOf = (v, part) => {
    let t = v > 0.8 ? 0 : v > 0.42 ? 1 : v > 0.08 ? 2 : 3;
    t = Math.min(3, t + dim(part));
    return t;
  };
  const tones = /* @__PURE__ */ new Map();
  for (const i of touched) tones.set(i, toneOf(Tone[i], Part[i]));
  for (const i of touched) {
    if (Mat[i] === 2) continue;
    const t = tones.get(i), votes = [0, 0, 0, 0];
    let same = false;
    for (const d of [-1, 1, -BW, BW]) {
      const j = i + d;
      if (Part[j] !== Part[i] || !tones.has(j)) continue;
      const u = tones.get(j);
      votes[u]++;
      if (u === t) same = true;
    }
    if (!same && votes.some((v) => v > 0)) tones.set(i, votes.indexOf(Math.max(...votes)));
  }
  for (const i of touched) {
    if (Mat[i] === 2) continue;
    Col[i] = (Mat[i] === 1 ? CORE : SHELL)[tones.get(i)];
  }
  const marks = /* @__PURE__ */ new Map();
  for (const i of touched) {
    for (const d of [1, BW]) {
      const j = i + d;
      if (Part[j] === 0 || Part[j] === Part[i]) continue;
      const far = Zb[i] < Zb[j] ? i : j, dz = Math.abs(Zb[i] - Zb[j]), steel = Mat[i] === 2 || Mat[j] === 2;
      if (Mat[far] === 2 && dz < 1) continue;
      const ink = steel || dz > 2.2;
      if (ink) marks.set(far, INK);
      else if (!marks.has(far)) marks.set(far, SEAM);
    }
  }
  for (const [i, c] of marks) Col[i] = c;
  const { B } = S, chestAt = add2(B.chest.t, mv(B.chest.R, [3, 1.6, -1.8]));
  if (mv(B.chest.R, [1, 0, 0])[2] > 0.15) {
    const i = (OY - Math.round(chestAt[1])) * BW + (OX + Math.round(chestAt[0]));
    if (Part[i] === PART.chest) Col[i] = MARK;
  }
  const list = touched.slice(), ring = /* @__PURE__ */ new Map();
  for (const i of list) for (const d of [-1, 1, -BW, BW]) {
    const j = i + d;
    if (Part[j] === 0 && !ring.has(j)) ring.set(j, i);
  }
  const n = list.length + ring.size, out = { n, xs: new Int16Array(n), ys: new Int16Array(n), color: new Uint32Array(n), src: new Int16Array(n), ink: new Uint8Array(n), x0: 0, y0: 0, x1: 0, y1: 0 };
  const srcFor = (i) => {
    const f = Fr[i];
    if (f < 0 || !restFrames) return -1;
    const name = FRAME_IDS[f], A = B[name], R0 = restFrames[name], wx = i % BW - OX, wy = OY - (i / BW | 0), P = [wx, wy, Zb[i]];
    const lp = tv(A.R, sub(P, A.t)), rp = add2(R0.t, mv(R0.R, lp)), c = Math.round(rp[0]) + 12, r = 38 - Math.round(rp[1]);
    return c < 0 || r < 0 || c >= W0 || r >= H0 ? -1 : r * W0 + c;
  };
  let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const push = (i, c, s, isInk) => {
    const x = i % BW - OX, y = (i / BW | 0) - OY;
    out.xs[k] = x;
    out.ys[k] = y;
    out.color[k] = c;
    out.src[k] = s;
    out.ink[k] = isInk ? 1 : 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    k++;
  };
  for (const i of list) push(i, Col[i], srcFor(i), Col[i] === INK);
  for (const [j, i] of ring) push(j, INK, srcFor(i), true);
  let zs = 0;
  for (const i of list) zs += Zb[i];
  Object.assign(out, { x0, y0, x1, y1, z: list.length ? zs / list.length : 0 });
  for (const i of list) Part[i] = 0;
  touched.length = 0;
  return out;
}
var turnAll = (S, a) => {
  const R = rotY(-a), P = (v) => mv(R, v);
  for (const f of Object.values(S.B)) {
    f.t = P(f.t);
    f.R = mm(R, f.R);
  }
  for (const A of [S.armN, S.armF, S.legN, S.legF]) {
    A.joint = P(A.joint);
    A.end = P(A.end);
  }
  S.sN = P(S.sN);
  S.sF = P(S.sF);
  S.hipN = P(S.hipN);
  S.hipF = P(S.hipF);
  S.axis = P(S.axis);
  S.side = P(S.side);
};
var REST_FRAMES = null;
function render(pose) {
  const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  const air = (q.y ?? 0) < -0.5;
  clipBody = !air;
  clipWeapon = !air;
  drawBody(S);
  clipBody = false;
  if (S.W) S.W.draw(along(S.armN.end, S.axis, S.side, PART.weapon), q, S.armF.end);
  if (S.OW) {
    const sb = q.sb ?? Math.PI;
    let ax = [Math.cos(sb), -Math.sin(sb), 0], sd = [-Math.sin(sb), -Math.cos(sb), 0];
    if (whole) {
      const R = rotY(-whole);
      ax = mv(R, ax);
      sd = mv(R, sd);
    }
    S.OW.draw(along(S.armF.end, ax, sd, PART.offWeapon), q, S.armF.end);
  }
  clipWeapon = false;
  return finish(S, REST_FRAMES);
}
REST_FRAMES = solve({}).B;
var CACHE = /* @__PURE__ */ new Map();
var keyOf = (p) => {
  let s = (p.y ?? 0) < -0.5 ? "air," : "";
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (v === void 0 || k === "x" || k === "y" || k === "ghost") continue;
    s += k + (typeof v === "number" ? k === "sa" || k === "sb" || k === "wl" || k === "yaw" || k === "turn" ? Math.round(v * 20) : Math.round(v) : v) + ",";
  }
  return s;
};
function posed(pose) {
  const key = keyOf(pose);
  let r = CACHE.get(key);
  if (!r) {
    if (CACHE.size > 6e3) CACHE.clear();
    CACHE.set(key, r = render(pose));
  }
  return r;
}

// src/core/actor-adapter.ts
function fromAct(q, broad = false) {
  const k = 96 / 38;
  return {
    lean: Math.max(-32, Math.min(32, (q.lean ?? 0) * k)),
    y: (q.crouch ?? 0) * k,
    leftHand: broad ? [(q.bx ?? 5) * k, (q.by ?? -15) * k] : [(q.fx ?? -3) * k, (q.fy ?? -15) * k],
    rightHand: broad ? [(q.fx ?? -3) * k, (q.fy ?? -15) * k] : [(q.bx ?? 5) * k, (q.by ?? -15) * k],
    leftFoot: [(q.ffx ?? -2) * k, ((q.ffy ?? -4) + 4) * k - 4],
    rightFoot: [(q.fbx ?? 3) * k, ((q.fby ?? -4) + 4) * k - 4],
    leftElbow: 1,
    rightElbow: 1,
    leftKnee: -1,
    rightKnee: -1,
    armsFront: !!q.armsFront,
    fists: !!q.weapon
  };
}
var move = (p, x, y) => [p[0] + x, p[1] + y];
function createActorAdapter2D(input) {
  const selection = JSON.parse(JSON.stringify(input));
  if (!["human", "creature", "asset"].includes(selection.kind)) throw new RangeError("Actor kind must be human, creature or asset");
  if (selection.kind === "asset") {
    if (!selection.asset) throw new RangeError("Asset actors require a CharacterAsset");
    if (selection.height !== void 0 && selection.height !== selection.asset.nativeHeight) throw new RangeError("An asset actor uses its authored native height");
    const player = createCharacterPlayer2D(selection.asset);
    return { selection, bounds: player.bounds, sample(time, q) {
      return player.sample(time, selection.clip, { x: q?.x ?? 0, y: q?.y ?? 0, applyRootMotion: selection.rootMotion });
    } };
  }
  const height = selection.height ?? 96;
  if (!Number.isFinite(height) || height < 32 || height > 192) throw new RangeError("Native actor height must be 32..192");
  const extent = height * (selection.kind === "creature" ? 2 : 1.05);
  let previousKey = "", previous;
  return {
    selection,
    bounds: { x0: -extent, y0: -height * 1.55, x1: extent, y1: height * 0.35 },
    sample(time, q) {
      if (!Number.isFinite(time)) throw new RangeError("Actor sample time must be finite");
      const key = JSON.stringify([time, q]);
      if (previous && key === previousKey) return previous;
      let rx = Math.round(q?.x ?? 0), ry = Math.round(q?.y ?? 0);
      let sprite, anchors, sockets, events, rootMotion = [0, 0], projectile;
      if (selection.kind === "human") {
        const style = { view: "three-quarter", ...selection.style, height };
        const motion = selection.motion ?? "act";
        const requested = selection.weapon ?? "auto";
        const animation = motion === "act" ? void 0 : sampleHumanAnimation2D(motion, time, style, { weaponPixels: requested !== "none", rootMotion: selection.rootMotion });
        const pose = animation?.pose ?? (q ? fromAct(q, style.view === "front" || style.view === "back") : humanViewMotion2D(style.view ?? "three-quarter", "idle", time));
        const actionWeapon = motion === "sword" || motion === "bow" ? motion : void 0, weapon = requested === "auto" ? actionWeapon ?? q?.weapon : requested;
        const weaponFrame = (weapon === "sword" || weapon === "bow") && weapon !== actionWeapon ? renderHumanWeaponPose2D(weapon, pose, style, q?.sa ?? 0, !!q?.nocked) : void 0;
        const body = weaponFrame?.actor ?? (animation && (!(weapon === "sword" || weapon === "bow") || weapon === actionWeapon) ? animation.sprite : renderHuman2D(style, pose));
        rootMotion = animation?.rootMotion ?? [0, 0];
        if (selection.rootMotion) {
          rx += rootMotion[0];
          ry += rootMotion[1];
        }
        if (animation?.projectile && weapon === actionWeapon) projectile = { ...animation.projectile, x: animation.projectile.x + rx, y: animation.projectile.y + ry };
        events = animation?.events;
        sockets = humanSockets2D(body, weaponFrame?.sample.geometry ?? animation?.weapon);
        for (const [name, socket] of Object.entries(sockets)) sockets[name] = transformCharacterSocket2D(socket, pixelTransform2D(rx, ry));
        const r = body.rig, front = r.view === "front" || r.view === "back";
        sprite = { ...body, x: body.x + rx, y: body.y + ry, renderSource: "pixels" };
        anchors = {
          root: [rx, ry],
          head: move(r.head, rx, ry),
          chest: move(r.chest, rx, ry),
          hand: move(front ? r.rightHand : r.leftHand, rx, ry),
          otherHand: move(front ? r.leftHand : r.rightHand, rx, ry),
          foot: move(r.leftAnkle, rx, ry),
          otherFoot: move(r.rightAnkle, rx, ry)
        };
      } else {
        const style = { ...selection.style, species: selection.species ?? "cat", size: height };
        const motion = selection.motion ?? "idle", mode = motion === "act" ? "idle" : motion;
        const body = renderCreature2D(style, mode, time), r = body.rig;
        sprite = { ...body, x: body.x + rx, y: body.y + ry, renderSource: "pixels" };
        const near = r.legs.find((l) => l.name === "nearFront"), far = r.legs.find((l) => l.name === "farFront");
        anchors = { root: [rx, ry], head: move(r.head, rx, ry), chest: move(r.root, rx, ry), hand: move(near?.toe ?? r.head, rx, ry), otherHand: move(far?.toe ?? r.head, rx, ry), foot: move(near?.toe ?? [0, 0], rx, ry), otherFoot: move(far?.toe ?? [0, 0], rx, ry) };
      }
      const actor = { ...sprite, k: height / 19, head: [anchors.head[0], sprite.y], chest: [...anchors.chest], anchors };
      const sample = {
        actor,
        anchors,
        sockets,
        events,
        rootMotion,
        pivot: [0, 0],
        bounds: { x0: actor.x, y0: actor.y, x1: actor.x + actor.w, y1: actor.y + actor.h },
        drawBack() {
        },
        drawFront(p, alpha = 1) {
          drawActor(p, actor, alpha);
          if (projectile) blitSprite2D(p, projectile, alpha);
        }
      };
      previousKey = key;
      previous = sample;
      return sample;
    }
  };
}
function actorEffectOffset2D(sample, q, onBody, selection) {
  let attachment = selection.attachment ?? "auto";
  if (attachment === "auto") attachment = onBody ? "root" : q.weapon ? "hand" : "root";
  if (attachment === "root") return [0, 0];
  const reference = attachment === "hand" ? [(q.x ?? 0) + (q.fx ?? -3), (q.y ?? 0) + (q.fy ?? -15)] : attachment === "head" ? [q.x ?? 0, -38 + (q.y ?? 0)] : [q.x ?? 0, -26 + (q.y ?? 0)];
  const p = sample.anchors[attachment];
  return [Math.round(p[0] - reference[0]), Math.round(p[1] - reference[1])];
}

// src/core/act.ts
var lerp2 = (a, b, u) => a + (b - a) * u;
function lerpPose(a, b, u) {
  const out = { ...STAND, ...a };
  const B = { ...STAND, ...b };
  for (const k of Object.keys(B)) {
    const v = B[k];
    if (typeof v === "number" && typeof out[k] === "number") out[k] = lerp2(out[k], v, u);
    else if (out[k] === void 0 && typeof v === "number") out[k] = v;
  }
  for (const k of ["hx", "hy", "lean", "crouch"]) if (B[k] === void 0 && typeof out[k] === "number") out[k] = lerp2(out[k], 0, u);
  if (B.wl === void 0 && typeof out.wl === "number") out.wl = lerp2(out.wl, 1, u);
  return out;
}
var eases = { out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u, line: (u) => u };
function poseAt(track, t) {
  if (t <= track[0][0]) return track[0][1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, a] = track[i], [t1, b, how] = track[i + 1];
    if (t >= t1) continue;
    if (how === "snap") return a;
    const e = eases[how ?? ""] ?? ((u2) => u2 * u2 * (3 - 2 * u2));
    const stepped = t0 + Math.floor((t - t0) * 12 + 1e-6) / 12;
    const out = lerpPose(a, b, e((stepped - t0) / (t1 - t0)));
    const u = e((t - t0) / (t1 - t0));
    out.x = lerp2(a.x ?? 0, b.x ?? 0, u);
    out.y = lerp2(a.y ?? 0, b.y ?? 0, u);
    return out;
  }
  return track[track.length - 1][1];
}
function isHeld(track, t) {
  if (t >= track[track.length - 1][0] || t < track[0][0]) return true;
  for (let i = 0; i < track.length - 1; i++) {
    if (t >= track[i + 1][0]) continue;
    const a = { ...STAND, ...track[i][1] }, b = { ...STAND, ...track[i + 1][1] };
    return track[i + 1][0] - track[i][0] > 0.4 && ["fx", "fy", "bx", "by", "crouch", "lean", "x", "y"].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1.5);
  }
  return true;
}
var TW = 38;
var TH = 52;
var TP = Object.fromEntries(Object.entries({ ink: "#0b0a1a", wood: "#724c2e", woodL: "#a0703a", woodD: "#4e331f", straw: "#d2aa55", strawL: "#f0d98a", burlapD: "#86643a", burlap: "#b38b57", burlapL: "#c9a26c", red: "#9a2f3c", redL: "#c4434f", white: "#ffffff" }).map(([k, v]) => [k, hex(v)]));
var DUST = ["#efe7dc", "#c9bfb8", "#8f8693", "#5a5468"].map(hex);
var DUMMY = new Uint32Array(TW * TH);
(function buildDummy() {
  const px = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < TW && y < TH) DUMMY[y * TW + x] = c;
  };
  const R = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c);
  };
  R(15, 38, 8, 14, TP.ink);
  R(16, 34, 6, 18, TP.wood);
  R(16, 34, 2, 18, TP.woodL);
  R(20, 34, 2, 18, TP.woodD);
  R(1, 18, 36, 1, TP.ink);
  R(1, 23, 36, 1, TP.ink);
  R(1, 19, 36, 4, TP.wood);
  R(1, 19, 36, 1, TP.woodL);
  R(1, 22, 36, 1, TP.woodD);
  for (const [bx, s] of [[0, -1], [33, 1]]) {
    R(bx, 17, 5, 8, TP.straw);
    for (const [dx, dy, c] of [[2, 16, TP.straw], [3, 15, TP.strawL], [1, 17, TP.strawL], [2, 25, TP.straw], [1, 26, TP.strawL], [3, 25, TP.burlapD], [2, 19, TP.strawL], [3, 21, TP.strawL], [1, 22, TP.burlapD], [2, 23, TP.strawL]]) px(bx + dx, dy, c);
    px(s < 0 ? bx - 1 : bx + 5, 19, TP.straw);
    px(s < 0 ? bx - 1 : bx + 5, 22, TP.strawL);
  }
  const sack = (x, y, w, h) => {
    R(x + 1, y, w - 2, 1, TP.ink);
    R(x + 1, y + h - 1, w - 2, 1, TP.ink);
    R(x, y + 1, 1, h - 2, TP.ink);
    R(x + w - 1, y + 1, 1, h - 2, TP.ink);
    R(x + 1, y + 1, w - 2, h - 2, TP.burlap);
    R(x + w - 4, y + 1, 3, h - 2, TP.burlapD);
    R(x + 1, y + h - 3, w - 2, 2, TP.burlapD);
    R(x + 1, y + 1, 1, h - 4, TP.burlapL);
    R(x + 1, y + 1, w - 6, 1, TP.burlapL);
    for (let j = y + 2; j < y + h - 2; j += 3) for (let i = x + 3 + j % 2; i < x + w - 4; i += 4) px(i, j, TP.burlapD);
  };
  sack(9, 17, 20, 24);
  for (let y = 19; y < 36; y++) for (let x = 11; x < 27; x++) {
    const d = Math.hypot(x - 18.5, y - 27);
    if (d > 4 && d < 5.4 || d < 1.9) px(x, y, x + y < 45 ? TP.redL : TP.red);
  }
  for (let x = 10; x < 28; x++) {
    px(x, 36, x & 1 ? TP.woodL : TP.straw);
    px(x, 37, x & 1 ? TP.woodD : TP.wood);
  }
  for (const [x, y, c] of [[11, 41, TP.straw], [12, 42, TP.strawL], [14, 41, TP.strawL], [15, 42, TP.straw], [23, 41, TP.straw], [24, 42, TP.strawL], [26, 41, TP.straw], [13, 43, TP.straw], [25, 43, TP.straw]]) px(x, y, c);
  sack(10, 1, 18, 16);
  for (const ex of [14, 23]) for (let d = -2; d <= 2; d++) {
    px(ex + d, 7 + d, TP.ink);
    px(ex - d, 7 + d, TP.ink);
  }
  for (let x = 14; x < 24; x++) px(x, 12, x & 1 ? TP.ink : TP.burlapD);
  for (const x of [15, 18, 21]) {
    px(x, 11, TP.ink);
    px(x, 13, TP.ink);
  }
  for (let x = 12; x < 26; x++) {
    px(x, 16, x & 1 ? TP.woodL : TP.straw);
    px(x, 17, x & 1 ? TP.wood : TP.woodD);
  }
  for (const [x, y, c] of [[13, 0, TP.straw], [15, 0, TP.strawL], [18, 0, TP.straw], [21, 0, TP.strawL], [24, 0, TP.straw], [9, 4, TP.straw], [28, 6, TP.straw], [8, 7, TP.strawL], [29, 3, TP.strawL]]) px(x, y, c);
})();
var SKINS = { flash: [TP.white, 1], char: [hex("#1a0c0e"), 0.72], ice: [hex("#a8e8ff"), 0.72], shadow: [hex("#3a1a70"), 0.5], holy: [hex("#fff4c0"), 0.5], red: [hex("#ff2040"), 0.45], shock: [hex("#8fd6ff"), 0.6], poison: [hex("#58c43a"), 0.5] };
var STRAW = [TP.strawL, TP.straw, TP.straw, TP.burlapD, TP.burlapD];
var Target = class {
  constructor(x, seed = 5) {
    Object.assign(this, { x, theta: 0, omega: 0, flashT: 0, skin: null, skinFade: 0, shiver: 0, clock: 0, R: new Rng(seed), straw: [] });
  }
  hit({ push = 1.2, straw = 8, flash = 0.05, skin, shiver = 0, y, contact } = {}) {
    this.omega += push;
    this.flashT = Math.max(this.flashT, flash);
    if (skin !== void 0) this.skin = skin;
    if (shiver) this.shiver = shiver;
    const R = this.R, hitX = contact?.position[0] ?? this.x, hitY = y ?? contact?.position[1] ?? -26;
    for (let k = 0; k < straw; k++) {
      const back = R.next() < 0.3;
      this.straw.push({ x: hitX + R.range(-3, 3), y: hitY + R.range(-3, 3), vx: back ? R.range(-60, -5) : R.range(10, 130), vy: R.range(-120, -5), age: 0, life: R.range(1.2, 2.2), big: R.next() < 0.5 });
    }
  }
  step(dt) {
    this.clock += dt;
    this.omega += (-60 * this.theta - 3.4 * this.omega) * dt;
    this.theta = clamp(this.theta + this.omega * dt, -0.4, 0.42);
    if (this.flashT > 0) this.flashT -= dt;
    if (this.shiver > 0) this.shiver -= dt;
    for (const s of this.straw) {
      s.age += dt;
      s.vy += 210 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y >= 0) {
        s.y = 0;
        s.vx *= 0.2;
        s.vy = 0;
      }
    }
    this.straw = this.straw.filter((s) => s.age < s.life);
  }
  draw(C, W, H, X, Y, flip) {
    const tan = Math.tan(this.theta), sv = this.shiver > 0 ? Math.floor(this.clock * 30) & 1 ? 1 : -1 : 0, name = this.flashT > 0 ? "flash" : this.skin, sk = name ? SKINS[name] : null;
    const base = X + (flip ? -this.x - 1 : this.x);
    for (let r = 0; r < TH; r++) {
      const o = Math.round((TH - 1 - r) * tan * 0.8) + sv;
      for (let x = 0; x < TW; x++) {
        const c = DUMMY[r * TW + x];
        if (!c) continue;
        const px = base + (flip ? -(x - 19 + o) - 1 : x - 19 + o), py = Y - TH + r;
        if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = sk ? mix(c, sk[0], sk[1]) : c;
      }
    }
  }
  drawStraw(C, W, H, X, Y, flip) {
    for (const s of this.straw) {
      const c = STRAW[Math.min(4, Math.floor(s.age / s.life * 5))], lx = Math.round(s.x), ly = Math.round(s.y) - 1;
      for (let i = 0; i < (s.big ? 2 : 1); i++) {
        const px = X + (flip ? -(lx + i) - 1 : lx + i), py = Y + ly;
        if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = c;
      }
    }
  }
};
var GHOST_LIFE = 0.16;
var REST_MASK = new Uint8Array(24 * 38);
var REST_PX = new Uint32Array(24 * 38);
HERO2.forEach((row, r) => [...row].forEach((ch, c) => {
  if (ch !== ".") {
    REST_MASK[r * 24 + c] = 1;
    REST_PX[r * 24 + c] = hex(DUMMY_PAL[ch]);
  }
}));
var NEAREST = new Int16Array(24 * 38).fill(-1);
for (let r = 0; r < 38; r++)
  for (let c = 0; c < 24; c++) {
    let best = -1, bd = 1e9;
    for (let y = Math.max(0, r - 7); y < Math.min(38, r + 8); y++)
      for (let x = Math.max(0, c - 7); x < Math.min(24, c + 8); x++) {
        const d = (x - c) * (x - c) + (y - r) * (y - r);
        if (REST_MASK[y * 24 + x] && d < bd) {
          bd = d;
          best = y * 24 + x;
        }
      }
    NEAREST[r * 24 + c] = best;
  }
var lum = (c) => (0.3 * (c & 255) + 0.59 * (c >>> 8 & 255) + 0.11 * (c >>> 16 & 255)) / 255;
function carry(v, rest, own2) {
  const lv = lum(v);
  if (lv > 0.9 || v >>> 24 < 255) return v;
  const k = Math.max(0.45, Math.min(1.5, lum(own2) / Math.max(0.08, lum(rest))));
  const ch = (n) => Math.min(255, Math.round((v >>> n & 255) * k));
  return 255 << 24 | ch(16) << 16 | ch(8) << 8 | ch(0);
}
function actSpan(mod) {
  const a = mod.act, D = mod.meta?.duration ?? 1, k = a?.poses;
  return { from: Math.min(0, k?.[0]?.[0] ?? 0), to: mod.meta?.loop ? Infinity : Math.max(D, k?.[k.length - 1]?.[0] ?? 0) };
}
function createAct(mod, o = {}) {
  const a = mod.act ?? {}, meta = mod.meta ?? {}, D = meta.duration ?? 1, flip = !!o.flip, seed = o.seed ?? meta.options?.seed ?? 1;
  const track = a.poses ?? [[0, { ...STAND }]], span = actSpan(mod);
  const adapter = o.actorAdapter ?? (o.actorSelection ? createActorAdapter2D(o.actorSelection) : void 0);
  const actorSampling = a.actorSampling ?? (mod.create && a.onBody ? "snapshot" : "live");
  const startActor = adapter?.sample(0, poseAt(track, 0));
  const fx = createFx(mod, startActor ? { ...o, actor: startActor.actor } : o);
  const X = o.x ?? 0, Y = o.y ?? 0;
  const targets = (a.targets ?? (a.target ? [a.target] : [])).map((g, i) => new Target(g.x ?? 66, seed + 4 + i));
  const hits = (a.hits ?? []).map((h) => ({ ...h })).sort((p, q) => p.t - q.t), dust = (a.dust ?? []).slice().sort((p, q) => p.t - q.t);
  if (meta.loop && (!Number.isFinite(D) || D <= 0)) throw new RangeError("Loop duration must be finite and positive");
  if (!Number.isFinite(span.from) || hits.some((h) => !Number.isFinite(h.t) || !Number.isFinite(h.stop ?? 0) || (h.stop ?? 0) < 0) || dust.some((d) => !Number.isFinite(d.t))) throw new RangeError("Act event times and freezes must be finite; freezes must be non-negative");
  const R = new Rng(seed + 9), specks = [];
  const ramp = o.palette ?? meta.options?.palette, ghosts = [], gc = hex(a.ghost ?? ramp?.[Math.floor(ramp.length * 0.7)] ?? "#8fb4ff");
  let t = span.from, stop = 0, stopped = false, shakeT = 0, shake0 = 0, amp = 0, nh = 0, nd = 0, loopN = 0, gAcc = 0;
  let integratedAt = t, nextTick = Math.floor(t * FX_TICK_RATE + 1e-9) + 1;
  let last = null;
  const poseNow = () => {
    let tt = t;
    if (meta.loop && t >= D) tt = t % D;
    let q = poseAt(track, tt);
    if (!meta.loop && isHeld(track, tt)) {
      const up = Math.floor(tt * 3) & 1;
      q = { ...STAND, ...q, crouch: (q.crouch ?? 0) + up, fy: (q.fy ?? STAND.fy) + up, by: (q.by ?? STAND.by) + up };
    }
    last = q;
    return q;
  };
  let scratch2 = null;
  const maxShiftX = Math.ceil(Math.max(...track.map(([, q]) => Math.abs((q.lean ?? 0) * (a.follow ?? 1)) + Math.abs(q.x ?? 0)))) + 2;
  const maxShiftY = Math.ceil(Math.max(...track.map(([, q]) => Math.abs((q.crouch ?? 0) * (a.follow ?? 1)) + Math.abs(q.y ?? 0)))) + 3;
  const scratchFor = (f, q, r) => {
    const [w, h] = meta.size, [ox, oy] = meta.origin;
    const halo = typeof a.scratchPadding === "number" ? a.scratchPadding : Math.ceil(Math.max(w, h) / 2);
    const angle = fx.options.angle ?? 0, cs = Math.cos(angle), sn = Math.sin(angle), sign = flip ? -1 : 1;
    let left = X - 12, top = Y - 38, right = X + 12, bottom = Y;
    for (let corner = 0; corner < 4; corner++) {
      const x = corner & 1 ? w - ox + halo : -ox - halo, y = corner & 2 ? h - oy + halo : -oy - halo;
      const px = X + sign * x * cs - y * sn, py = Y + sign * x * sn + y * cs;
      left = Math.min(left, px);
      right = Math.max(right, px);
      top = Math.min(top, py);
      bottom = Math.max(bottom, py);
    }
    const follow = a.follow ?? 1, rx = Math.round(q.x ?? 0), ry = Math.round(q.y ?? 0);
    const shiftX = maxShiftX, shiftY = maxShiftY;
    left = Math.max(Math.floor(left), (f.ox | 0) - shiftX);
    right = Math.min(Math.ceil(right), (f.ox | 0) + f.w + shiftX);
    top = Math.max(Math.floor(top), (f.oy | 0) - shiftY);
    bottom = Math.min(Math.ceil(bottom), (f.oy | 0) + f.h + shiftY);
    const px0 = X + sign * rx + (flip ? -r.x1 : r.x0), px1 = X + sign * rx + (flip ? -r.x0 : r.x1);
    if (px0 < f.ox + f.w && px1 >= f.ox && Y + ry + r.y0 < f.oy + f.h && Y + ry + r.y1 >= f.oy) {
      left = Math.min(left, X - 12);
      right = Math.max(right, X + 12);
      top = Math.min(top, Y - 38);
      bottom = Math.max(bottom, Y);
    }
    left = Math.floor(left);
    top = Math.floor(top);
    right = Math.ceil(right);
    bottom = Math.ceil(bottom);
    const sw = Math.max(1, right - left), sh = Math.max(1, bottom - top);
    if (!scratch2 || scratch2.a.w !== sw || scratch2.a.h !== sh)
      scratch2 = { a: createFrame(sw, sh, left, top), b: createFrame(sw, sh, left, top) };
    for (const frame4 of [scratch2.a, scratch2.b]) {
      frame4.ox = left;
      frame4.oy = top;
      frame4.alphaMode = f.alphaMode;
      if (f.hdrLight && !frame4.hdrLight) frame4.hdrLight = new Float32Array(sw * sh * 3);
      else if (!f.hdrLight) frame4.hdrLight = void 0;
    }
    return scratch2;
  };
  const out = {
    fx,
    meta,
    act: a,
    targets,
    get t() {
      return t;
    },
    /** How far the whole picture is thrown right now, in px. */
    get shake() {
      if (mod.cameraShake) return t < 0 ? [0, 0] : [...fx.shake];
      const strength = fx.options.cameraMotion ?? 1;
      if (!Number.isFinite(strength) || strength < 0) throw new RangeError("cameraMotion must be finite and non-negative");
      if (shakeT <= 0 || strength === 0) return [0, 0];
      const k = amp * (shakeT / shake0) * strength, f = Math.floor(shakeT * 60);
      return [Math.round(Math.sin(f * 2.4) * k), Math.round(Math.cos(f * 3.7) * k * 0.7)];
    },
    get frozen() {
      return stop > 0;
    },
    /** The pose he's in right now. */
    get pose() {
      return last;
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
      if (dt === 0) return;
      let remaining = dt;
      for (; ; ) {
        const offset = meta.loop ? loopN * D : 0;
        for (; nh < hits.length && hits[nh].t + offset <= t; nh++) {
          const h = hits[nh];
          if (h.stop) stop = Math.max(stop, h.stop);
          if (h.shake) {
            shakeT = shake0 = h.shake;
            amp = h.amp ?? 2;
          }
          if (h.target !== false) targets.forEach((g, i) => (h.at === void 0 || h.at === i) && g.hit(h));
          out.onHit?.(h);
        }
        for (; nd < dust.length && dust[nd].t + offset <= t; nd++) {
          const d = dust[nd], n = d.n ?? 6;
          for (let i = 0; i < n; i++) {
            const dir = d.dir ?? (R.next() < 0.5 ? -1 : 1);
            specks.push({ x: d.x + R.range(-3, 3), y: -1 - R.range(0, 2), vx: dir * R.range(22, 90), vy: R.range(-34, -6), age: 0, life: R.range(0.16, 0.4), big: R.next() < 0.45, c: d.c ? hex(d.c) : 0 });
          }
        }
        const boundary = meta.loop ? (loopN + 1) * D : Infinity;
        if (meta.loop && t >= boundary) {
          t = boundary;
          loopN++;
          poseNow();
          nh = hits.findIndex((h) => h.t >= 0);
          if (nh < 0) nh = hits.length;
          nd = dust.findIndex((d) => d.t >= 0);
          if (nd < 0) nd = dust.length;
          continue;
        }
        if (remaining <= 0) break;
        if (stop > 0) {
          const frozen = Math.min(remaining, stop);
          remaining -= frozen;
          stop -= frozen;
          shakeT = Math.max(0, shakeT - frozen);
          continue;
        }
        const tickTime = nextTick / FX_TICK_RATE;
        const next = Math.min(
          hits[nh] ? hits[nh].t + offset : Infinity,
          dust[nd] ? dust[nd].t + offset : Infinity,
          boundary,
          tickTime
        );
        const step = Math.min(remaining, next - t);
        const t0 = t;
        t = step === next - t ? next : t + step;
        if (next - t <= 1e-12) t = next;
        remaining = Math.max(0, remaining - step);
        shakeT = Math.max(0, shakeT - step);
        if (t > 0) fx.update(Math.max(0, t) - Math.max(0, t0));
        if (t < next - 1e-12) continue;
        const physicsStep = t - integratedAt;
        integratedAt = t;
        if (t >= tickTime - 1e-12) nextTick++;
        for (const k of specks) {
          k.age += physicsStep;
          k.vx *= 1 - 5 * physicsStep;
          k.vy += 110 * physicsStep;
          k.x += k.vx * physicsStep;
          k.y = Math.min(-1, k.y + k.vy * physicsStep);
        }
        for (let i = specks.length - 1; i >= 0; i--) if (specks[i].age >= specks[i].life) specks.splice(i, 1);
        const q = poseNow();
        for (const g of targets) g.step(physicsStep);
        gAcc += physicsStep;
        if (q.ghost && gAcc >= 1 / 30) {
          gAcc = 0;
          ghosts.push({ q, age: 0 });
          if (ghosts.length > 7) ghosts.shift();
        }
        for (const g of ghosts) g.age += physicsStep;
        while (ghosts.length && ghosts[0].age > GHOST_LIFE) ghosts.shift();
      }
      poseNow();
    },
    /** Paint it. { body: false } leaves the character out, { target: false } the target. */
    draw(frame4, { body = true, target: showTarget = true } = {}) {
      const W = frame4.w, H = frame4.h, q = last ?? poseNow(), active = t >= 0;
      const tgt = showTarget ? targets : [];
      const drawTargets = () => tgt.forEach((g) => g.draw(frame4.color, W, H, FX, FY, flip));
      const drawStraw = () => tgt.forEach((g) => g.drawStraw(frame4.color, W, H, FX, FY, flip));
      const drawDust = () => {
        for (const k of specks) {
          const c = k.c || DUST[Math.min(3, Math.floor(k.age / k.life * 4))], lx = Math.round(k.x), py = FY + Math.round(k.y);
          for (let i = 0; i < (k.big ? 2 : 1); i++) {
            const px = flip ? FX - lx - i - 1 : FX + lx + i;
            if (px >= 0 && py >= 0 && px < W && py < H) frame4.color[py * W + px] = c;
          }
        }
      };
      const FX = X - (frame4.ox | 0), FY = Y - (frame4.oy | 0);
      const native = actorSampling === "snapshot" && active ? startActor : adapter?.sample(t, q);
      if (native && adapter) {
        fx.options.actor = actorSampling === "snapshot" ? startActor.actor : native.actor;
        const [dx, dy] = actorEffectOffset2D(native, q, !!a.onBody, adapter.selection);
        fx.options.x = X + (flip ? -dx : dx);
        fx.options.y = Y + dy;
      }
      if (!body) {
        if (active) fx.draw(frame4, "back");
        drawTargets();
        if (active) fx.draw(frame4, "front");
        drawStraw();
        return;
      }
      if (native && adapter) {
        if (active) fx.draw(frame4, "back");
        drawTargets();
        native.drawBack(painterFor(frame4).place(X, Y, flip));
        const p = painterFor(frame4).place(X, Y, flip);
        for (const ghost of ghosts) {
          const actor = adapter.sample(t - ghost.age, ghost.q).actor, k = 0.5 * (1 - ghost.age / GHOST_LIFE);
          for (let y = 0; y < actor.h; y++) for (let x = 0; x < actor.w; x++) if (actor.mask.data[y * actor.w + x]) p.light(actor.x + x, actor.y + y, gc, k);
        }
        const tt2 = meta.loop ? t < 0 ? 0 : t % D : clamp(t, 0, D), alpha2 = active ? actorAlphaOf(mod, tt2, fx.options) : 1;
        native.drawFront(painterFor(frame4).place(X, Y, flip), alpha2);
        if (ghosts.length) {
          const actor = native.actor;
          for (let y = 0; y < actor.h; y++) for (let x = 0; x < actor.w; x++) if (actor.mask.data[y * actor.w + x]) {
            const px = FX + (flip ? -actor.x - x - 1 : actor.x + x), py = FY + actor.y + y;
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const j = py * W + px, keep = 1 - Math.min(1, Math.max(0, alpha2)) * (actor.pixels[y * actor.w + x] >>> 24) / 255, light = frame4.light[j];
            frame4.light[j] = keep > 0 ? light & 4278190080 | ((light & 255) * keep | 0) | ((light >>> 8 & 255) * keep | 0) << 8 | ((light >>> 16 & 255) * keep | 0) << 16 : 0;
            if (frame4.hdrLight) for (let channel = 0; channel < 3; channel++) frame4.hdrLight[j * 3 + channel] *= keep;
          }
        }
        if (active) fx.draw(frame4, "front");
        drawStraw();
        drawDust();
        return;
      }
      const rx = Math.round(q.x ?? 0), ry = Math.round(q.y ?? 0), BX = FX + (flip ? -rx : rx), BY = FY + ry;
      const r = posed(q), mirror2 = flip;
      const paint = (i, color) => {
        const px = mirror2 ? BX - r.xs[i] - 1 : BX + r.xs[i], py = BY + r.ys[i];
        if (px < 0 || py < 0 || px >= W || py >= H) return;
        const j = py * W + px;
        frame4.color[j] = blendOver(frame4.color[j], color, 1);
        if (ghosts.length) {
          const keep = 1 - (color >>> 24) / 255, light = frame4.light[j];
          frame4.light[j] = keep > 0 ? (255 << 24 | ((light >>> 16 & 255) * keep | 0) << 16 | ((light >>> 8 & 255) * keep | 0) << 8 | ((light & 255) * keep | 0)) >>> 0 : 0;
          if (frame4.hdrLight) for (let channel = 0; channel < 3; channel++) frame4.hdrLight[j * 3 + channel] *= keep;
        }
      };
      const drawGhosts = () => {
        for (const g of ghosts) {
          const gr = posed(g.q), gx = FX + (flip ? -Math.round(g.q.x ?? 0) : Math.round(g.q.x ?? 0)), gy = FY + Math.round(g.q.y ?? 0), k = 0.5 * (1 - g.age / GHOST_LIFE);
          const gm = flip, r0 = (gc & 255) * k, g0 = (gc >>> 8 & 255) * k, b0 = (gc >>> 16 & 255) * k;
          for (let i = 0; i < gr.n; i++) {
            const px = gm ? gx - gr.xs[i] - 1 : gx + gr.xs[i], py = gy + gr.ys[i];
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const j = py * W + px, d = frame4.light[j];
            frame4.light[j] = 255 << 24 | Math.min(255, (d >>> 16 & 255) + b0) << 16 | Math.min(255, (d >>> 8 & 255) + g0) << 8 | Math.min(255, (d & 255) + r0);
            if (frame4.hdrLight) {
              frame4.hdrLight[j * 3] += channelToLinear(gc, 0) * k;
              frame4.hdrLight[j * 3 + 1] += channelToLinear(gc, 8) * k;
              frame4.hdrLight[j * 3 + 2] += channelToLinear(gc, 16) * k;
            }
          }
        }
      };
      const shadow = () => {
        const sy = FY, cx = FX + (flip ? -rx : rx), hw = 10 + (Math.abs(q.ffx - q.fbx) >> 1) - Math.min(8, Math.abs(ry) >> 1);
        if (sy < 0 || sy >= H) return;
        for (let dy = 0; dy < 2; dy++)
          for (let x = -hw + dy * 2; x <= hw - dy * 2; x++) {
            const px = cx + x, i = (sy + dy) * W + px;
            if (px < 0 || px >= W || sy + dy >= H) continue;
            frame4.color[i] = frame4.color[i] & 16777215 | Math.max(frame4.color[i] >>> 24, 110) << 24;
          }
      };
      if (!a.onBody) {
        if (active) fx.draw(frame4, "back");
        drawTargets();
        shadow();
        drawGhosts();
        for (let i = 0; i < r.n; i++) paint(i, r.color[i]);
        if (active) fx.draw(frame4, "front");
        drawStraw();
        drawDust();
        return;
      }
      const { a: A, b: B } = scratchFor(frame4, q, r);
      clearFrame(A);
      clearFrame(B);
      if (active) fx.draw(A, "back");
      const tt = meta.loop ? t < 0 ? 0 : t % D : clamp(t, 0, D), alpha = active ? actorAlphaOf(mod, tt, fx.options) : 1;
      drawActor(painterFor(B).place(X, Y, flip), fx.options.actor ?? stockActor(2), alpha);
      if (active) fx.draw(B, "front");
      const follow = a.follow ?? 1, lean = (q.lean ?? 0) * follow, cr = (q.crouch ?? 0) * follow;
      const C = frame4.color, Ls = frame4.light, hdr = frame4.hdrLight, sw = A.w, sh = A.h;
      const workX = A.ox, workY = A.oy, frameX = frame4.ox | 0, frameY = frame4.oy | 0;
      const rest = (worldX, worldY) => {
        const col = (flip ? X - worldX - 1 : worldX - X) + 12, row = worldY - Y + 38;
        return col >= 0 && row >= 0 && col < 24 && row < 38 && REST_MASK[row * 24 + col] === 1;
      };
      const copyLight = (source, sourceIndex, destination) => {
        const s = source.light[sourceIndex];
        if (s & 16777215) {
          const d = Ls[destination];
          Ls[destination] = 255 << 24 | Math.min(255, (d >>> 16 & 255) + (s >>> 16 & 255)) << 16 | Math.min(255, (d >>> 8 & 255) + (s >>> 8 & 255)) << 8 | Math.min(255, (d & 255) + (s & 255));
        }
        if (hdr && source.hdrLight) {
          const to = destination * 3, from = sourceIndex * 3;
          hdr[to] += source.hdrLight[from];
          hdr[to + 1] += source.hdrLight[from + 1];
          hdr[to + 2] += source.hdrLight[from + 2];
        }
      };
      const visit = (front) => {
        for (let sy = 0; sy < sh; sy++) {
          const worldY = workY + sy, ly = worldY - Y;
          const k = clamp((-11 - ly) / 7, 0, 1), f = clamp((-1 - ly) / 6, 0, 1);
          const dx = Math.round(lean * k + rx * f) * (flip ? -1 : 1), dy = Math.round(cr * k + ry * f);
          const py = worldY + dy - frameY;
          if (py < 0 || py >= H) continue;
          const sx0 = Math.max(0, frameX - workX - dx), sx1 = Math.min(sw, frameX + W - workX - dx);
          for (let sx = sx0; sx < sx1; sx++) {
            const j = sy * sw + sx, worldX = workX + sx, i = py * W + worldX + dx - frameX;
            if (!front) {
              const c = A.color[j];
              if (c) C[i] = blendOver(C[i], c, 1);
            } else {
              const c = B.color[j];
              if (c && !rest(worldX, worldY)) C[i] = blendOver(C[i], c, 1);
              copyLight(A, j, i);
              copyLight(B, j, i);
            }
          }
        }
      };
      visit(false);
      drawTargets();
      shadow();
      drawGhosts();
      const restIndex = (s) => {
        const col = s % 24, row = s / 24 | 0;
        const sx = (flip ? X - (col - 12) - 1 : X + col - 12) - workX, sy = Y + row - 38 - workY;
        return sx >= 0 && sy >= 0 && sx < sw && sy < sh ? sy * sw + sx : -1;
      };
      for (let i = 0; i < r.n; i++) {
        const s = r.src[i] >= 0 ? NEAREST[r.src[i]] : -1;
        if (s < 0) {
          if (alpha > 0.5) paint(i, r.color[i]);
          continue;
        }
        const j = restIndex(s), v = j >= 0 ? B.color[j] : 0;
        if (!v) continue;
        paint(i, v === REST_PX[s] ? r.color[i] : carry(v, REST_PX[s], r.color[i]));
      }
      visit(true);
      drawStraw();
      drawDust();
    },
    /** Let a loop end: it fades out and done() goes true. */
    stop() {
      fx.stop();
      stopped = true;
    },
    /** One-shots end when the last pose is over. */
    done() {
      return stopped ? fx.done() : t >= span.to && stop <= 0;
    }
  };
  poseNow();
  return out;
}
function actTiming(mod) {
  const a = mod.act;
  if (!a) return null;
  const { from, to } = actSpan(mod), D = mod.meta?.duration ?? 1;
  return {
    windup: -from,
    recovery: mod.meta?.loop ? 0 : Math.max(0, to - D),
    onBody: !!a.onBody,
    actorSampling: a.actorSampling ?? (mod.create && a.onBody ? "snapshot" : "live"),
    targets: (a.targets ?? (a.target ? [a.target] : [])).map((g) => g.x ?? 66),
    hits: (a.hits ?? []).map((h) => ({
      t: h.t,
      freeze: h.stop ?? 0,
      shake: h.shake ?? 0,
      amp: h.amp ?? (h.shake ? 2 : 0),
      target: h.target !== false,
      at: h.at,
      y: h.y ?? h.contact?.position[1] ?? -26,
      ...h.contact ? { contact: h.contact } : {},
      push: h.target === false ? 0 : h.push ?? 1.2,
      straw: h.target === false ? 0 : h.straw ?? 8,
      flash: h.target === false ? 0 : h.flash ?? 0.05,
      shiver: h.target === false ? 0 : h.shiver ?? 0,
      skin: h.skin
    })),
    poses: (a.poses ?? []).map(([t, pose, how]) => ({ t, how: how ?? "smooth", pose }))
  };
}
function actBounds(mod, options = {}) {
  const a = mod.act, [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
  let x0 = -ox, y0 = -oy, x1 = w - ox, y1 = h - oy;
  const adapter = options.actorAdapter ?? (options.actorSelection ? createActorAdapter2D(options.actorSelection) : void 0);
  const layout = exportLayout2D([w, h], [ox, oy], { angle: options.flip ? -(options.angle ?? 0) : options.angle });
  const effect = { x0: -layout.x, y0: -layout.y, x1: layout.w - layout.x, y1: layout.h - layout.y };
  x0 = Math.min(x0, effect.x0);
  y0 = Math.min(y0, effect.y0);
  x1 = Math.max(x1, effect.x1);
  y1 = Math.max(y1, effect.y1);
  const see = (p, time = 0) => {
    if (adapter) {
      const sample = adapter.sample(time, p), b = sample.bounds, [dx, dy] = actorEffectOffset2D(sample, p, !!a?.onBody, adapter.selection);
      x0 = Math.min(x0, b.x0 - 2, effect.x0 + dx);
      y0 = Math.min(y0, b.y0 - 2, effect.y0 + dy);
      x1 = Math.max(x1, b.x1 + 2, effect.x1 + dx);
      y1 = Math.max(y1, b.y1 + 2, effect.y1 + dy);
      if (a?.onBody) {
        const extraX = Math.max(0, (b.x1 - b.x0 - 24) / 2), extraY = Math.max(0, b.y1 - b.y0 - 38);
        x0 = Math.min(x0, effect.x0 - extraX);
        x1 = Math.max(x1, effect.x1 + extraX);
        y0 = Math.min(y0, effect.y0 - extraY);
      }
      return;
    }
    const r = posed(p), X = Math.round(p.x ?? 0), Y = Math.round(p.y ?? 0), left = r.x0, right = r.x1;
    x0 = Math.min(x0, left + X - 1);
    x1 = Math.max(x1, right + X + 1);
    y0 = Math.min(y0, r.y0 + Y - 1);
    y1 = Math.max(y1, r.y1 + Y + 1);
  };
  const k = a?.poses;
  if (k) {
    for (let t = k[0][0]; t <= k[k.length - 1][0]; t += 1 / 12) see(poseAt(k, t), t);
    for (const key of k) see(key[1], key[0]);
  } else {
    see(STAND);
    if (adapter) {
      const b = adapter.bounds;
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
    }
  }
  for (const g of a?.targets ?? (a?.target ? [a.target] : [])) {
    const tx = g.x ?? 66;
    x0 = Math.min(x0, tx - 30);
    x1 = Math.max(x1, tx + 36);
    y0 = Math.min(y0, -56);
  }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}

// src/core/chain.ts
var fade = (elapsed, duration) => {
  const u = Math.round(clamp(elapsed / duration) * 1e12) / 1e12;
  return u * u * (3 - 2 * u);
};
function chain(cues) {
  return (o) => {
    const list = cues.map(({ fx, t: t2 = 0, until = Infinity, x = 0, y = 0, fadeIn = 0, fadeOut = 0, cullBounds, cullHalo = 0, ...opts }, i) => {
      if (!Number.isFinite(t2) || t2 < 0 || !(until >= t2) || !Number.isFinite(until) && until !== Infinity || !Number.isFinite(fadeIn) || fadeIn < 0 || !Number.isFinite(fadeOut) || fadeOut < 0)
        throw new RangeError("Cue times and fades must be non-negative; until must follow t");
      if (!Number.isFinite(cullHalo) || cullHalo < 0 || cullBounds && (!Object.values(cullBounds).every(Number.isFinite) || cullBounds.width < 0 || cullBounds.height < 0)) throw new RangeError("Invalid conservative cue bounds");
      const end = fx.meta?.loop ? until : Math.min(until, t2 + (fx.meta?.duration ?? 1));
      const options = { ...o.palette === void 0 ? {} : { palette: o.palette }, ...opts, seed: opts.seed ?? (o.seed ?? 1) + i };
      return {
        fx,
        t: t2,
        until: end,
        x,
        y,
        fadeIn,
        fadeOut,
        opts: options,
        cullBounds,
        cullHalo,
        inst: t2 === 0 && end > 0 ? createFx(fx, options) : null,
        over: end <= t2
      };
    });
    let t = 0, timeError = 0;
    const at = (v) => typeof v === "function" ? v(t) : v;
    const each = (p, layer2) => {
      for (const c of list) {
        if (!c.inst || c.over) continue;
        c.inst.options.x = at(c.x);
        c.inst.options.y = at(c.y);
        if (c.cullBounds) {
          const b = c.cullBounds, h = c.cullHalo, a = c.inst.options.angle ?? 0, cs = Math.cos(a), sn = Math.sin(a), sign = c.inst.options.flip ? -1 : 1;
          let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
          for (let k = 0; k < 4; k++) {
            const x = (k & 1 ? b.x + b.width + h : b.x - h) * sign, y = k & 2 ? b.y + b.height + h : b.y - h;
            const lx = (c.inst.options.x ?? 0) + x * cs - y * sn, ly = (c.inst.options.y ?? 0) + x * sn + y * cs;
            const sx = p.tx + lx * p.fx * p.cs - ly * p.sn, sy = p.ty + lx * p.fx * p.sn + ly * p.cs;
            left = Math.min(left, sx);
            right = Math.max(right, sx);
            top = Math.min(top, sy);
            bottom = Math.max(bottom, sy);
          }
          if (right <= p.frame.ox || bottom <= p.frame.oy || left >= p.frame.ox + p.frame.w || top >= p.frame.oy + p.frame.h) continue;
        }
        const enter = c.fadeIn > 0 ? fade(t - c.t, c.fadeIn) : 1;
        const leave = c.fadeOut > 0 ? fade(c.until - t, c.fadeOut) : 1;
        c.inst.draw(p.frame, layer2, {
          tx: p.tx,
          ty: p.ty,
          fx: p.fx,
          cs: p.cs,
          sn: p.sn,
          fade: p.fade * enter * leave,
          lightK: p.lightK,
          particleStyle: p.particleStyle
        });
      }
    };
    const advanceTime = (time) => {
      const previous = t;
      t = time;
      for (const c of list) {
        if (c.over || t < c.t) continue;
        if (!c.inst) c.inst = createFx(c.fx, c.opts);
        const start = Math.max(previous, c.t), end = Math.min(t, c.until);
        if (end > start) c.inst.update(end - start);
        if (t >= c.until || c.inst.done() && !c.fx.meta?.loop) c.over = true;
      }
    };
    return {
      advanceTime,
      // Retain the standalone chain API. createFx uses advanceTime instead of
      // quantizing this scheduler through EffectImplementation.update.
      update(dt) {
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
        const part = dt - timeError, next = t + part;
        timeError = next - t - part;
        advanceTime(next);
      },
      drawBack: (p) => each(p, "back"),
      draw: (p) => each(p, "front")
    };
  };
}
var shiftKeys = (keys, dt, { dx = 0, ...over } = {}) => keys.map(([t, pose, how]) => [t + dt, { ...pose, ...over, x: (pose.x ?? 0) + dx }, how]);
var shiftHits = (hits, dt) => hits.map((h) => ({ ...h, t: h.t + dt }));

export {
  FONTS,
  Painter,
  stockActor,
  drawActor,
  actorAlphaOf,
  createFrame,
  clearFrame,
  painterFor,
  resolveOptions,
  createFx,
  composite,
  sceneCameraOffset,
  BACKDROPS,
  backdrop,
  characterClipTime2D,
  createCharacterIdentity2D,
  renderCharacterPortrait2D,
  sampleCharacterSocketTrack2D,
  createCharacterAsset2D,
  parseCharacterAsset2D,
  setCharacterSocketKey2D,
  createCharacterPlayer2D,
  createStudioCharacter2D,
  frameDurationMs,
  resolveActExport,
  exportLayout2D,
  resolveEffectExport,
  edgeFade,
  separateFrameLayers,
  atlasMetadata,
  transformExportSockets,
  transformExportContacts,
  collectAssetEvents,
  resolveAtlasExportSettings,
  extrudeAtlasRegion,
  resolveAssetEvents,
  createAtlasPacker,
  frameContentBounds,
  createAct,
  actTiming,
  actBounds,
  chain,
  shiftKeys,
  shiftHits
};
