// The painter draws into a frame's two buffers: `color` (crisp pixel cells with continuous coverage)
// and `light` (additive glow, composited on top). Effects draw in local coordinates around their
// origin; the painter places, mirrors and rotates them, so an effect never needs to know where it is.

import { clamp } from "./math.js";
import { channelToLinear } from "../render/linear.js";
import { blendOver, type AlphaMode } from "../render/coverage.js";
import { cubicBezier, quadraticBezier, catmullRom, pathLengths, type CurveOptions } from "./curves.js";
import { hex } from "./color.js";
import { rasterText, textWidth, FONTS } from "./font.js";

// 4x4 ordered (Bayer) thresholds: a pixel at alpha a is drawn when a is above its cell's threshold.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const OUT = { c: 0, a: 1, l: 0, k: 0 };
export interface PaintFrame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array; hdrLight?: Float32Array; alphaMode?: AlphaMode }
export type PaintValue = number | ((...args: number[]) => number | null | undefined);
export type Point = [number, number];
export interface PathOptions { /** When samples share a cell, keep the later head instead of the tail. */ preferHead?: boolean }
export interface ShaderOutput { c: number; a: number; l: number; k: number }
export interface SpriteOptions { scale?: number; a?: number; flip?: boolean; flipY?: boolean; tint?: number }
export interface TextOptions { font?: keyof typeof FONTS; scale?: number; align?: "left" | "center" | "right"; outline?: number; shadow?: number; a?: number }
export interface Mask { w: number; h: number; data: ArrayLike<number> }
const sprites = new WeakMap<readonly string[], string[][]>();
// Nullish color/alpha results are treated as an empty pixel by the drawing operations.
const call = (v: PaintValue, ...args: number[]): number => (typeof v === "function" ? v(...args) : v) as number;

export class Painter {
  declare frame: PaintFrame;
  declare w: number; declare h: number; declare ox: number; declare oy: number;
  declare C: Uint32Array; declare L: Uint32Array;
  declare tx: number; declare ty: number; declare fx: number; declare cs: number; declare sn: number;
  declare particleStyle: "refined" | "classic";
  declare fade: number; declare lightK: number; declare layer: "front" | "back";
  private strokeStamp?: Uint32Array;
  private strokeDistance?: Float32Array;
  private strokeU?: Float32Array;
  private strokePixels?: Uint32Array;
  private strokeId = 0;
  constructor(frame: PaintFrame) {
    this.frame = frame;
    this.reset();
  }

  /** Continuous coverage by default; ordered dither remains available as an authored texture. */
  get alphaMode(): AlphaMode { return this.frame.alphaMode ?? "coverage"; }
  set alphaMode(mode: AlphaMode) { this.frame.alphaMode = mode; }

  /** Re-read the frame and clear placement, fade and light strength. */
  reset() {
    const f = this.frame;
    this.w = f.w; this.h = f.h; this.ox = f.ox | 0; this.oy = f.oy | 0; this.C = f.color; this.L = f.light;
    this.tx = 0; this.ty = 0; this.fx = 1; this.cs = 1; this.sn = 0;
    this.particleStyle = "refined";
    this.fade = 1; this.lightK = 1; this.layer = "front";
    return this;
  }

  /** Put the effect's origin at (x, y) in frame space, mirrored if flip, rotated by angle (radians). */
  place(x: number, y: number, flip = false, angle = 0) {
    this.tx = x; this.ty = y; this.fx = flip ? -1 : 1; this.cs = Math.cos(angle); this.sn = Math.sin(angle);
    return this;
  }

  // ---- transforms: local (effect) space <-> screen (frame) space
  toX(x: number, y: number) { return this.tx + x * this.fx * this.cs - y * this.sn; }
  toY(x: number, y: number) { return this.ty + x * this.fx * this.sn + y * this.cs; }
  fromX(sx: number, sy: number) { const dx = sx - this.tx, dy = sy - this.ty; return (dx * this.cs + dy * this.sn) * this.fx; }
  fromY(sx: number, sy: number) { const dx = sx - this.tx, dy = sy - this.ty; return -dx * this.sn + dy * this.cs; }
  // the screen pixel of the local pixel cell holding (x, y): mirrors and rotations land on whole cells
  cellX(x: number, y: number) { return Math.floor(this.toX(Math.floor(x) + 0.5, Math.floor(y) + 0.5)); }
  cellY(x: number, y: number) { return Math.floor(this.toY(Math.floor(x) + 0.5, Math.floor(y) + 0.5)); }

  // ---- raw writes, screen space, whole pixels. Color 0 means "nothing": it never erases what's there.
  put(sx: number, sy: number, c: number, a = 1) {
    if (!c || !(a > 0)) return;
    a *= this.fade;
    if (!(a > 0)) return;
    const x = sx - this.ox, y = sy - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.frame.alphaMode === "dither") {
      if (a < 1 && a <= BAYER[((sy & 3) << 2) | (sx & 3)]) return;
      this.C[i] = c;
    } else this.C[i] = a >= 1 && (c >>> 24) === 255 ? c : blendOver(this.C[i], c, a);
  }
  add(sx: number, sy: number, c: number, k = 1) {
    k *= this.fade * this.lightK;
    if (k <= 0.004) return;
    const x = sx - this.ox, y = sy - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, d = this.L[i];
    // Optional physically meaningful accumulation without 8-bit channel saturation.
    const hdr = this.frame.hdrLight;
    if (hdr) {
      const j = i * 3;
      hdr[j] += channelToLinear(c, 0) * k;
      hdr[j + 1] += channelToLinear(c, 8) * k;
      hdr[j + 2] += channelToLinear(c, 16) * k;
    }
    const r = Math.min(255, (d & 255) + (c & 255) * k) | 0;
    const g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k) | 0;
    const b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k) | 0;
    this.L[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  /**
   * Blend a color over what's there at alpha a (0..1), keeping the result's own alpha: soft smoke, vapour and
   * mist. This always blends, including when the frame explicitly requests artistic dithering.
   */
  blendPx(sx: number, sy: number, c: number, a: number) {
    a *= this.fade;
    if (!c || a <= 0.004) return;
    const x = sx - this.ox, y = sy - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.C[i] = blendOver(this.C[i], c, a);
  }
  /** Translucent pixel at a local point. */
  blend(x: number, y: number, c: number, a: number) { this.blendPx(this.cellX(x, y), this.cellY(x, y), c, a); }
  /** A translucent disc: puffs of smoke, vapour, dust. c and a may be functions of (d: 0 center..1 rim, angle). */
  disc(cx: number, cy: number, r: number, c: PaintValue, a: PaintValue) {
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
  get(x: number, y: number) {
    const sx = this.cellX(x, y) - this.ox, sy = this.cellY(x, y) - this.oy;
    return sx < 0 || sy < 0 || sx >= this.w || sy >= this.h ? 0 : this.C[sy * this.w + sx];
  }

  // ---- pixels
  /** One opaque pixel. */
  px(x: number, y: number, c: number) { this.put(this.cellX(x, y), this.cellY(x, y), c, 1); }
  /** One pixel at alpha a (0..1), preserving coverage as it fades. */
  dot(x: number, y: number, c: number, a = 1) { if (a > 0) this.put(this.cellX(x, y), this.cellY(x, y), c, a); }
  /** Explicit ordered-dither pixel for dissolves, stipple and other authored textures. */
  dither(x: number, y: number, c: number, a = 1) {
    const sx = this.cellX(x, y), sy = this.cellY(x, y);
    if (a * this.fade <= BAYER[((sy & 3) << 2) | (sx & 3)]) return;
    const px = sx - this.ox, py = sy - this.oy;
    if (c && px >= 0 && py >= 0 && px < this.w && py < this.h) this.C[py * this.w + px] = c;
  }
  /** Add light to one pixel. */
  light(x: number, y: number, c: number, k = 1) { this.add(this.cellX(x, y), this.cellY(x, y), c, k); }

  /**
   * Visit every screen pixel whose center falls in the local box [x0, x1] x [y0, y1], with that center in
   * local space: fn(lx, ly, sx, sy). The basis of every filled shape, so shapes mirror and rotate exactly.
   */
  each(x0: number, y0: number, x1: number, y1: number, fn: (lx: number, ly: number, sx: number, sy: number) => void) {
    let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
    for (let k = 0; k < 4; k++) {
      const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, sx = this.toX(x, y), sy = this.toY(x, y);
      if (sx < ax) ax = sx; if (sx > bx) bx = sx; if (sy < ay) ay = sy; if (sy > by) by = sy;
    }
    const sx0 = Math.max(Math.ceil(ax - 0.5), this.ox), sx1 = Math.min(Math.floor(bx - 0.5), this.ox + this.w - 1);
    const sy0 = Math.max(Math.ceil(ay - 0.5), this.oy), sy1 = Math.min(Math.floor(by - 0.5), this.oy + this.h - 1);
    const rotated = this.sn !== 0 || this.cs !== 1;
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
  shade(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, out: ShaderOutput) => number | void) {
    const o = OUT;
    this.each(x0, y0, x1, y1, (lx, ly, sx, sy) => {
      o.c = 0; o.a = 1; o.l = 0; o.k = 0;
      const c = fn(lx, ly, o) || o.c;
      if (c) this.put(sx, sy, c, o.a);
      if (o.k > 0) this.add(sx, sy, (o.l || c) as number, o.k);
    });
  }

  // ---- shapes. Colors (c) and alphas (a) can be numbers or functions of the shape's own coordinates.
  /** 1 px line. c and a may be functions of u (0 at the start, 1 at the end). */
  line(x0: number, y0: number, x1: number, y1: number, c: PaintValue, a: PaintValue = 1) {
    this.lineCells(this.cellX(x0, y0), this.cellY(x0, y0), this.cellX(x1, y1), this.cellY(x1, y1), c, a);
  }
  private lineCells(sx: number, sy: number, ex: number, ey: number, c: PaintValue, a: PaintValue, opacity = 1) {
    const dx = Math.abs(ex - sx), dy = -Math.abs(ey - sy), stepx = sx < ex ? 1 : -1, stepy = sy < ey ? 1 : -1;
    const n = Math.max(dx, -dy) || 1, fc = typeof c === "function", fa = typeof a === "function";
    let err = dx + dy, i = 0;
    for (;;) {
      const u = i++ / n;
      this.put(sx, sy, (fc ? c(u, 0) : c) as number, ((fa ? a(u, 0) : a) as number) * opacity);
      if (sx === ex && sy === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; sx += stepx; }
      if (e2 <= dx) { err += dx; sy += stepy; }
    }
  }
  /** Lines through a list of points [[x, y], ...]. */
  polyline(pts: Point[], c: PaintValue, a: PaintValue = 1) {
    this.stroke(pts, c, a, 1, false);
  }
  /** A connected round-ended path, composited once per cell. Callbacks use global arc-length u and across-width v. */
  path(pts: readonly Point[], c: PaintValue, a: PaintValue = 1, width = 1, options: PathOptions = {}) {
    this.stroke(pts, c, a, width, true, false, options.preferHead ?? false);
  }
  /** Adaptive curves with a quarter-pixel geometric error; snapping happens only during rasterization. */
  quadratic(p0: Point, p1: Point, p2: Point, c: PaintValue, a: PaintValue = 1, width = 1) {
    this.path(quadraticBezier(p0, p1, p2), c, a, width);
  }
  cubic(p0: Point, p1: Point, p2: Point, p3: Point, c: PaintValue, a: PaintValue = 1, width = 1) {
    this.path(cubicBezier(p0, p1, p2, p3), c, a, width);
  }
  spline(pts: readonly Point[], c: PaintValue, a: PaintValue = 1, width = 1, options: CurveOptions = {}) {
    this.path(catmullRom(pts, options), c, a, width);
  }
  private stroke(pts: readonly Point[], c: PaintValue, a: PaintValue, width: number, globalU: boolean, light = false, preferHead = false) {
    if (!pts.length || !(width > 0)) return;
    if (pts.length === 1 && light) pts = [pts[0], pts[0]];
    if (pts.length === 1) { this.circle(pts[0][0], pts[0][1], width / 2, c, a); return; }
    const thin = !light && width < Math.SQRT2;
    if (pts.length === 2 && thin && !preferHead) {
      const [a0, a1] = pts;
      this.lineCells(globalU ? Math.floor(this.toX(...a0)) : this.cellX(...a0), globalU ? Math.floor(this.toY(...a0)) : this.cellY(...a0),
        globalU ? Math.floor(this.toX(...a1)) : this.cellX(...a1), globalU ? Math.floor(this.toY(...a1)) : this.cellY(...a1), c, a, Math.min(1, width));
      return;
    }
    const size = this.w * this.h;
    if (!this.strokeStamp || this.strokeStamp.length !== size) {
      this.strokeStamp = new Uint32Array(size);
      this.strokeDistance = new Float32Array(size);
      this.strokeU = new Float32Array(size);
      this.strokePixels = new Uint32Array(size);
    }
    this.strokeId = (this.strokeId + 1) >>> 0;
    if (!this.strokeId) { this.strokeStamp.fill(0); this.strokeId = 1; }
    const stamp = this.strokeStamp, distance = this.strokeDistance!, us = this.strokeU!, pixels = this.strokePixels!;
    const id = this.strokeId, lengths = globalU ? pathLengths(pts) : null;
    const totalLength = lengths?.[pts.length - 1] || 0, total = totalLength || 1;
    const r = width / 2;
    // Constant lights cannot survive add()'s cutoff beyond this radius. Keep a tiny margin
    // for the Float32 distance buffer; final falloff still uses r, so pixels stay identical.
    const strength = light && typeof a === "number" ? a * this.fade * this.lightK : null;
    if (strength !== null && strength <= 0.004) return;
    const reach = strength !== null && Number.isFinite(strength) ? r * (1 - Math.sqrt(0.004 / strength) + 1e-6) : r;
    const r2 = reach * reach;
    let count = 0;
    const visit = (sx: number, sy: number, d2: number, u: number) => {
      const x = sx - this.ox, y = sy - this.oy;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x;
      if (stamp[i] !== id) { stamp[i] = id; pixels[count++] = i; distance[i] = d2; us[i] = u; }
      else if (d2 < distance[i] || (preferHead && d2 === distance[i] && u > us[i])) { distance[i] = d2; us[i] = u; }
    };
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
      const start = lengths ? lengths[j - 1] / total : 0, span = lengths ? (lengths[j] - lengths[j - 1]) / total : 1;
      if (thin) {
        let sx = globalU ? Math.floor(this.toX(ax, ay)) : this.cellX(ax, ay), sy = globalU ? Math.floor(this.toY(ax, ay)) : this.cellY(ax, ay);
        const ex = globalU ? Math.floor(this.toX(bx, by)) : this.cellX(bx, by), ey = globalU ? Math.floor(this.toY(bx, by)) : this.cellY(bx, by);
        const dx = Math.abs(ex - sx), dy = -Math.abs(ey - sy), stepX = sx < ex ? 1 : -1, stepY = sy < ey ? 1 : -1;
        const n = Math.max(dx, -dy) || 1;
        let error = dx + dy, step = 0;
        for (;;) {
          visit(sx, sy, 0, preferHead && dx === 0 && dy === 0 ? start + span : start + span * step / n);
          step++;
          if (sx === ex && sy === ey) break;
          const e2 = error * 2;
          if (e2 >= dy) { error += dy; sx += stepX; }
          if (e2 <= dx) { error += dx; sy += stepY; }
        }
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
  beam(x0: number, y0: number, x1: number, y1: number, width: number, c: PaintValue, a: PaintValue = 1) {
    if (!(width > 0)) return;
    if (width < Math.SQRT2) { this.path([[x0, y0], [x1, y1]], c, a, width); return; }
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
  circle(cx: number, cy: number, r: number, c: PaintValue, a: PaintValue = 1) {
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
  ellipse(cx: number, cy: number, rx: number, ry: number, c: PaintValue, a: PaintValue = 1) {
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
  ring(cx: number, cy: number, r: number, w: number, c: PaintValue, a: PaintValue = 1) {
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
  arc(cx: number, cy: number, r: number, w: PaintValue, a0: number, a1: number, c: PaintValue, a: PaintValue = 1) {
    const span = a1 - a0, wf = typeof w === "function";
    if (!(r > 0) || !(span > 0)) return;
    this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) return;
      let ang = Math.atan2(dy, dx) - a0;
      ang -= Math.floor(ang / (Math.PI * 2)) * Math.PI * 2;
      if (ang > span) return;
      const u = ang / span, ww = (wf ? w(u) : w) as number;
      if (ww <= 0 || d < r - ww) return;
      const v = (d - (r - ww)) / ww;
      o.c = call(c, u, v);
      o.a = call(a, u, v);
    });
  }
  /** Filled rectangle. */
  rect(x: number, y: number, w: number, h: number, c: number, a = 1) {
    if (!(w > 0) || !(h > 0)) return;
    if (this.sn === 0 && this.cs === 1) {
      // Transform the rectangle once, then choose destination pixel centers. Rounding local
      // coordinates first and transforming them again creates seams at fractional placements.
      const ax = this.toX(x, y), bx = this.toX(x + w, y), ay = this.toY(x, y);
      // Mirroring reverses which boundary is inclusive: [left,right) becomes (left,right].
      const left = Math.min(ax, bx) - 0.5, right = Math.max(ax, bx) - 0.5;
      const X0 = Math.max(this.ox, this.fx === 1 ? Math.ceil(left) : Math.floor(left) + 1);
      const X1 = Math.min(this.ox + this.w, this.fx === 1 ? Math.ceil(right) : Math.floor(right) + 1);
      const Y0 = Math.max(this.oy, Math.ceil(ay - 0.5)), Y1 = Math.min(this.oy + this.h, Math.ceil(ay + h - 0.5));
      for (let yy = Y0; yy < Y1; yy++) for (let xx = X0; xx < X1; xx++) this.put(xx, yy, c, a);
      return;
    }
    this.shade(x, y, x + w, y + h, (lx, ly, o) => {
      if (lx < x || ly < y || lx >= x + w || ly >= y + h) return;
      o.c = c; o.a = a;
    });
  }
  /** Filled polygon from points [[x, y], ...] (even-odd rule). */
  poly(pts: Point[], c: PaintValue, a: PaintValue = 1) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const n = pts.length;
    this.shade(x0, y0, x1, y1, (x, y, o) => {
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return;
      o.c = call(c, x, y);
      o.a = call(a, x, y);
    });
  }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: PaintValue, a: PaintValue = 1) { this.poly([[x0, y0], [x1, y1], [x2, y2]], c, a); }

  // ---- light
  /** Radial glow into the light buffer: k at the center, falling to 0 at radius r. */
  glow(x: number, y: number, r: number, c: number, k = 0.5) {
    if (r < 1 || k <= 0.004) return;
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
  glowLine(x0: number, y0: number, x1: number, y1: number, r: number, c: number, k = 0.5) {
    if (r < 1 || k <= 0.004) return;
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
  glowPath(pts: readonly Point[], radius: number, c: PaintValue, k: PaintValue = 0.5) {
    if (!(radius >= 1)) return;
    this.stroke(pts, c, k, radius * 2, true, true);
  }
  /** Glow hugging a circle of radius R (a shockwave's light), falling off over width r. */
  glowRing(x: number, y: number, R: number, r: number, c: number, k = 0.5) {
    if (r < 1 || k <= 0.004) return;
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
  sprite(rows: readonly string[], pal: Record<string, string | number>, x: number, y: number, opts: SpriteOptions = {}) {
    let s = sprites.get(rows);
    if (!s) sprites.set(rows, (s = rows.map((r) => [...r])));
    const k = opts.scale ?? 1, a = opts.a ?? 1, W = Math.max(0, ...s.map(row => row.length)), cache: Record<string, number> = {};
    if (!(k > 0) || !W) return;
    if (this.sn !== 0 || this.cs !== 1 || k % 1 !== 0) {
      // Inverse mapping fills destination cells. Forward-splatting rotated source pixels
      // leaves pinholes even in a completely solid sprite.
      this.shade(x, y, x + W * k, y + s.length * k, (lx, ly, out) => {
        const col = Math.floor((lx - x) / k), row = Math.floor((ly - y) / k);
        if (col < 0 || row < 0 || col >= W || row >= s!.length) return;
        const ch = s![opts.flipY ? s!.length - 1 - row : row][opts.flip ? W - 1 - col : col];
        if (!ch || ch === "." || ch === " ") return;
        let color = opts.tint ?? cache[ch];
        if (color === undefined) color = cache[ch] = pal[ch] === undefined ? 0 : hex(pal[ch]);
        out.c = color; out.a = a;
      });
      return;
    }
    for (let r = 0; r < s.length; r++)
      for (let q = 0; q < s[r].length; q++) {
        const ch = s[r][q];
        if (ch === "." || ch === " ") continue;
        let c = opts.tint;
        if (c === undefined) {
          c = cache[ch];
          if (c === undefined) c = cache[ch] = pal[ch] === undefined ? 0 : hex(pal[ch]);
        }
        if (!c) continue;
        const col = opts.flip ? W - 1 - q : q, row = opts.flipY ? s.length - 1 - r : r;
        // Sample the transformed source cell, not a locally rounded point. Otherwise
        // fractional anchors change phase when switching to the rotated branch.
        this.rect(x + col * k, y + row * k, k, k, c, a);
      }
  }
  /**
   * Pixel text. opts: { font: "mini" (3x5) | "big" (5x7), scale, align: "left" | "center" | "right",
   * outline: color, shadow: color, a }. (x, y) is the top of the text, at the left, center or right.
   */
  text(str: string, x: number, y: number, c: PaintValue, opts: TextOptions = {}) {
    const font = opts.font ?? "mini", k = opts.scale ?? 1, a = opts.a ?? 1, w = textWidth(str, font) * k;
    const left = Math.round(opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x), top = Math.round(y);
    const ol = opts.outline, sh = opts.shadow;
    if (ol !== undefined) rasterText(str, font, (gx, gy) => this.rect(left + gx * k - 1, top + gy * k - 1, k + 2, k + 2, ol, a));
    if (sh !== undefined) rasterText(str, font, (gx, gy) => this.rect(left + gx * k + 1, top + gy * k + 1, k, k, sh, a));
    rasterText(str, font, (gx, gy) => this.rect(left + gx * k, top + gy * k, k, k, call(c, gx, gy), a));
  }
  /** Size of text in pixels: [w, h]. */
  measure(str: string, opts: TextOptions = {}) {
    const k = opts.scale ?? 1;
    return [textWidth(str, opts.font ?? "mini") * k, FONTS[opts.font ?? "mini"].h * k];
  }
  /** Fill a mask ({ w, h, data }) with its top-left at (x, y). c may be a function of (mx, my). */
  mask(m: Mask, x: number, y: number, c: PaintValue, a: PaintValue = 1) {
    if (this.sn !== 0 || this.cs !== 1) {
      this.shade(x, y, x + m.w, y + m.h, (lx, ly, out) => {
        const mx = Math.floor(lx - x), my = Math.floor(ly - y);
        if (mx < 0 || my < 0 || mx >= m.w || my >= m.h || !m.data[my * m.w + mx]) return;
        out.c = call(c, mx, my); out.a = call(a, mx, my);
      });
      return;
    }
    for (let my = 0; my < m.h; my++)
      for (let mx = 0; mx < m.w; mx++) if (m.data[my * m.w + mx]) this.rect(x + mx, y + my, 1, 1, call(c, mx, my), call(a, mx, my));
  }
  /** The 1 px outline just outside a mask. */
  outline(m: Mask, x: number, y: number, c: PaintValue, a: PaintValue = 1) {
    const at = (mx: number, my: number) => mx >= 0 && my >= 0 && mx < m.w && my < m.h && m.data[my * m.w + mx];
    if (this.sn !== 0 || this.cs !== 1) {
      this.shade(x - 1, y - 1, x + m.w + 1, y + m.h + 1, (lx, ly, out) => {
        const mx = Math.floor(lx - x), my = Math.floor(ly - y);
        if (!at(mx, my) && (at(mx - 1, my) || at(mx + 1, my) || at(mx, my - 1) || at(mx, my + 1))) {
          out.c = call(c, mx, my); out.a = call(a, mx, my);
        }
      });
      return;
    }
    for (let my = -1; my <= m.h; my++)
      for (let mx = -1; mx <= m.w; mx++)
        if (!at(mx, my) && (at(mx - 1, my) || at(mx + 1, my) || at(mx, my - 1) || at(mx, my + 1)))
          this.rect(x + mx, y + my, 1, 1, call(c, mx, my), call(a, mx, my));
  }
}
