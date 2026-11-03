import { type Frame3D, type Color3D, clearFrame3D, color3D } from "./frame.js";
import { channelToLinear } from "../render/linear.js";
import { blendOver, type AlphaMode } from "../render/coverage.js";
import { type Vec3, clamp3, cross3, dot3, norm3, sub3, TAU3 } from "./math.js";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const LIGHT_DIRECTION = norm3([0.6, 1, -0.45]);
const MIN_PIXEL_RADIUS = Math.SQRT1_2;
const SUBPIXEL = 256;
export interface Camera3D {
  yaw: number;
  /** Radians above the ground; positive elevation looks down onto the scene. */
  elevation: number;
  zoom: number;
  target?: Vec3;
  projection?: "orthographic" | "perspective";
  perspective?: number;
}
export interface Projected3D { x: number; y: number; depth: number; scale: number }
export const DEFAULT_CAMERA_3D: Camera3D = { yaw: 0.68, elevation: Math.PI / 5.5, zoom: 1, projection: "orthographic" };

/** Pixel-center rasterizer with z-buffer, continuous opacity and separate additive light. */
export class Painter3D {
  readonly frame: Frame3D;
  camera: Camera3D;
  private scale = 1;
  private cy = 1;
  private sy = 0;
  private ce = 1;
  private se = 0;
  private origin: Vec3 = [0, 0, 0];
  private warpColor?: Uint32Array;
  private warpLight?: Uint32Array;
  private warpDepth?: Float32Array;
  private warpHDR?: Float32Array;
  private ringCoverage?: Float32Array;
  private ringDepth?: Float32Array;
  private readonly ringPixels: number[] = [];

  constructor(frame: Frame3D, camera: Camera3D = DEFAULT_CAMERA_3D) {
    this.frame = frame;
    this.camera = camera;
    this.setCamera(camera);
  }
  setCamera(camera: Camera3D) {
    this.camera = camera;
    this.cy = Math.cos(camera.yaw); this.sy = Math.sin(camera.yaw);
    this.ce = Math.cos(camera.elevation); this.se = Math.sin(camera.elevation);
    this.scale = Math.min(this.frame.w / 17, this.frame.h / 11) * camera.zoom;
    this.origin = camera.target ?? [0, 0, 0];
    return this;
  }
  begin(background: Color3D = "#0a1424") { clearFrame3D(this.frame, background); return this; }
  get alphaMode(): AlphaMode { return this.frame.alphaMode ?? "coverage"; }
  set alphaMode(mode: AlphaMode) { this.frame.alphaMode = mode; }
  project(point: Vec3): Projected3D {
    const x = point[0] - this.origin[0], y = point[1] - this.origin[1], z = point[2] - this.origin[2];
    const u = x * this.cy - z * this.sy, v = x * this.sy + z * this.cy;
    const up = y * this.ce - v * this.se;
    const depth = y * this.se + v * this.ce;
    const perspective = this.camera.projection === "perspective" ? 1 / Math.max(0.3, 1 - depth * (this.camera.perspective ?? 0.025)) : 1;
    const scale = this.scale * perspective;
    return { x: this.frame.w * 0.5 + u * scale, y: this.frame.h * 0.61 - up * scale, depth, scale };
  }
  private addLight(i: number, col: number, amount: number) {
    if (amount <= 0) return;
    const hdr = this.frame.hdrLight;
    if (hdr) {
      const j = i * 3;
      hdr[j] += channelToLinear(col, 0) * amount;
      hdr[j + 1] += channelToLinear(col, 8) * amount;
      hdr[j + 2] += channelToLinear(col, 16) * amount;
    }
    const previous = this.frame.light[i];
    const r = Math.min(255, (previous & 255) + (col & 255) * amount) | 0;
    const g = Math.min(255, ((previous >>> 8) & 255) + ((col >>> 8) & 255) * amount) | 0;
    const b = Math.min(255, ((previous >>> 16) & 255) + ((col >>> 16) & 255) * amount) | 0;
    this.frame.light[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }
  private put(x: number, y: number, depth: number, color: number, alpha: number, emission: number) {
    if (x < 0 || x >= this.frame.w || y < 0 || y >= this.frame.h || alpha <= 0) return;
    const dither = this.alphaMode === "dither";
    const opacity = clamp3(alpha) * (color >>> 24) / 255;
    if (opacity <= 0 || (dither && opacity < 1 && opacity <= BAYER4[((y & 3) << 2) | (x & 3)])) return;
    const i = y * this.frame.w + x;
    const z = Math.fround(depth);
    if (z < this.frame.depth[i]) return;
    // Retain the nearest-surface contract. Translucent meshes should be submitted back-to-front.
    this.frame.depth[i] = z;
    this.frame.color[i] = dither ? (color | 0xff000000) >>> 0 : blendOver(this.frame.color[i], color, alpha);
    if (emission > 0) this.addLight(i, color, emission * (dither ? 1 : opacity));
  }
  /** A single voxel-like camera-facing particle. Radius is in world units, not screen pixels. */
  point(position: Vec3, radius: number, color: Color3D, alpha = 1, emission = 0) {
    if (radius <= 0 || alpha <= 0) return;
    const p = this.project(position), projectedRadius = radius * p.scale, c = color3D(color);
    // A tiny particle owns one pixel instead of disappearing between four pixel centers.
    if (projectedRadius < MIN_PIXEL_RADIUS) {
      this.put(Math.floor(p.x), Math.floor(p.y), p.depth, c, alpha, emission);
      return;
    }
    const r = projectedRadius, dither = this.alphaMode === "dither";
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(this.frame.w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(this.frame.h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2) / (r * r);
      if (d > 1) continue;
      // Geometry owns whole pixel cells. Keep opacity separate from the former dither fringe.
      this.put(x, y, p.depth, c, alpha * (dither ? 1 - clamp3((d - 0.65) * 1.7) : 1), emission);
    }
  }
  /** Pixel-crisp swept capsule; analytic screen-space coverage with interpolated depth. */
  line(a: Vec3, b: Vec3, radius: number, color: Color3D, alpha = 1, emission = 0) {
    if (radius <= 0 || alpha <= 0) return;
    const p = this.project(a), q = this.project(b);
    const c = color3D(color);
    this.rasterLine(p, q, radius, (x, y, depth, coverage) => this.put(x, y, depth, c, alpha * coverage, emission));
  }
  private rasterLine(p: Projected3D, q: Projected3D, radius: number, write: (x: number, y: number, depth: number, coverage: number) => void) {
    const bound = Math.max(MIN_PIXEL_RADIUS, radius * Math.max(p.scale, q.scale));
    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
    const w = this.frame.w, h = this.frame.h, perspective = this.camera.projection === "perspective", dither = this.alphaMode === "dither";
    const x0 = Math.max(0, Math.ceil(Math.min(p.x, q.x) - bound - 0.5)), x1 = Math.min(w - 1, Math.floor(Math.max(p.x, q.x) + bound - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(p.y, q.y) - bound - 0.5)), y1 = Math.min(h - 1, Math.floor(Math.max(p.y, q.y) + bound - 0.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = d2 > 0 ? clamp3(((px - p.x) * dx + (py - p.y) * dy) / d2) : 0;
      const scale = p.scale + (q.scale - p.scale) * t, r = Math.max(MIN_PIXEL_RADIUS, radius * scale);
      const d = ((px - p.x - t * dx) ** 2 + (py - p.y - t * dy) ** 2) / (r * r);
      if (d > 1) continue;
      const u = perspective ? t * q.scale / scale : t;
      write(x, y, p.depth + (q.depth - p.depth) * u, dither ? 1 - clamp3((d - 0.75) * 2) : 1);
    }
  }
  /** Filled, z-buffered pixel triangle; low-poly geometry remains solid under orbit. */
  triangle(a: Vec3, b: Vec3, c: Vec3, color: Color3D, alpha = 1, emission = 0) {
    if (alpha <= 0) return;
    const A = this.project(a), w = this.frame.w, h = this.frame.h;
    let B = this.project(b), C = this.project(c);
    // Shared vertices snap to the same subpixel lattice; integer edge equations give each
    // shared edge exactly one owner. No cracks or double alpha/emission along a mesh diagonal.
    const ax = Math.round(A.x * SUBPIXEL), ay = Math.round(A.y * SUBPIXEL);
    let bx = Math.round(B.x * SUBPIXEL), by = Math.round(B.y * SUBPIXEL);
    let cx = Math.round(C.x * SUBPIXEL), cy = Math.round(C.y * SUBPIXEL);
    let det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (det === 0) return;
    if (det < 0) { [B, C] = [C, B]; [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; det = -det; }
    const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) / SUBPIXEL - 0.5));
    const x1 = Math.min(w - 1, Math.floor(Math.max(ax, bx, cx) / SUBPIXEL - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) / SUBPIXEL - 0.5));
    const y1 = Math.min(h - 1, Math.floor(Math.max(ay, by, cy) / SUBPIXEL - 0.5));
    const abTop = by < ay || (by === ay && bx > ax);
    const bcTop = cy < by || (cy === by && cx > bx);
    const caTop = ay < cy || (ay === cy && ax > cx);
    const col = color3D(color), perspective = this.camera.projection === "perspective";
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * SUBPIXEL, py = (y + 0.5) * SUBPIXEL;
      const ab = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const bc = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const ca = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      if (ab < 0 || (ab === 0 && !abTop) || bc < 0 || (bc === 0 && !bcTop) || ca < 0 || (ca === 0 && !caTop)) continue;
      let u = bc / det, v = ca / det, t = ab / det;
      if (perspective) {
        u *= A.scale; v *= B.scale; t *= C.scale;
        const inv = 1 / (u + v + t); u *= inv; v *= inv; t *= inv;
      }
      this.put(x, y, u * A.depth + v * B.depth + t * C.depth, col, alpha, emission);
    }
  }
  /** Flat-lit facet, quantized to a discrete color ramp instead of smooth Gouraud shading. */
  facet(a: Vec3, b: Vec3, c: Vec3, ramp: readonly Color3D[], alpha = 1, emission = 0) {
    const n = norm3(cross3(sub3(b, a), sub3(c, a)));
    const brightness = Math.abs(dot3(n, LIGHT_DIRECTION));
    const idx = Math.floor(clamp3(0.22 + brightness * 0.7) * (ramp.length - 1));
    this.triangle(a, b, c, ramp[idx], alpha, emission);
  }
  ring(radius: number, width: number, color: Color3D, opacity = 1, emission = 0, height = 0.03, segments?: number) {
    if (radius <= 0 || width <= 0 || opacity <= 0) return;
    const center = this.project([0, height, 0]);
    const nearDepth = center.depth + radius * Math.abs(this.ce);
    const projectedRadius = radius * this.scale * (this.camera.projection === "perspective" ? 1 / Math.max(0.3, 1 - nearDepth * (this.camera.perspective ?? 0.025)) : 1);
    // Bound chord deviation to a quarter pixel; explicit detail remains a lower bound.
    const adaptive = Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.25 / Math.max(0.25, projectedRadius))));
    const count = Math.max(12, adaptive, Math.floor(segments ?? 0));
    const n = this.frame.w * this.frame.h;
    this.ringCoverage ??= new Float32Array(n);
    this.ringDepth ??= new Float32Array(n);
    const coverage = this.ringCoverage, depth = this.ringDepth, pixels = this.ringPixels, w = this.frame.w;
    const collect = (x: number, y: number, z: number, a: number) => {
      const i = y * w + x;
      if (coverage[i] === 0) { pixels.push(i); depth[i] = z; }
      else depth[i] = Math.max(depth[i], z);
      coverage[i] = Math.max(coverage[i], a);
    };
    let a = this.project([radius, height, 0]);
    for (let i = 1; i <= count; i++) {
      const ang = i * TAU3 / count, b = this.project([Math.cos(ang) * radius, height, Math.sin(ang) * radius]);
      this.rasterLine(a, b, width, collect); a = b;
    }
    const c = color3D(color);
    // The whole ring is one stroke: overlapping capsule joins must not accumulate brightness.
    for (const i of pixels) {
      this.put(i % w, Math.floor(i / w), depth[i], c, opacity * coverage[i], emission);
      coverage[i] = 0;
    }
    pixels.length = 0;
  }
  /** Separate additive light-buffer disc, independent of the pixel color buffer. */
  glow(position: Vec3, radius: number, color: Color3D, strength = 1) {
    if (radius <= 0 || strength <= 0) return;
    const p = this.project(position), r = Math.max(1, radius * p.scale), c = color3D(color), w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2) / (r * r);
      if (d >= 1) continue;
      this.addLight(y * w + x, c, (1 - d) ** 2 * strength);
    }
  }
  /** Depth-tested opaque sphere; the front hemisphere occludes color and both light buffers. */
  sphere(center: Vec3, radius: number, fill: Color3D, edge: Color3D = fill) {
    if (radius <= 0) return;
    const p = this.project(center), r = radius * p.scale;
    if (r < 0.5) return;
    const inner = color3D(fill), rim = color3D(edge), w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - p.x) / r, dy = (y + 0.5 - p.y) / r, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const depth = p.depth + radius * Math.sqrt(Math.max(0, 1 - d2));
      const i = y * w + x;
      if (depth < this.frame.depth[i]) continue;
      this.frame.depth[i] = depth;
      this.frame.color[i] = d2 > 0.865 ? rim : inner;
      this.frame.light[i] = 0;
      const hdr = this.frame.hdrLight;
      if (hdr) { hdr[i * 3] = 0; hdr[i * 3 + 1] = 0; hdr[i * 3 + 2] = 0; }
    }
  }

  /** Pixel-sampled artistic lens approximation, applied BEFORE the opaque horizon.
   * Reuse snapshots while warping color, depth, legacy light and HDR radiance together. */
  lensWarp(center: Vec3, horizon: number, reach: number, strength = 1) {
    if (horizon <= 0 || reach <= horizon || strength <= 0) return;
    const p = this.project(center), maxR = reach * p.scale, inner = horizon * p.scale;
    const w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - maxR)), x1 = Math.min(w - 1, Math.ceil(p.x + maxR));
    const y0 = Math.max(0, Math.floor(p.y - maxR)), y1 = Math.min(h - 1, Math.ceil(p.y + maxR));
    if (x0 > x1 || y0 > y1) return;
    const n = w * h;
    if (!this.warpColor || this.warpColor.length !== n) {
      this.warpColor = new Uint32Array(n);
      this.warpLight = new Uint32Array(n);
      this.warpDepth = new Float32Array(n);
    }
    const c = this.warpColor, l = this.warpLight!, z = this.warpDepth!;
    c.set(this.frame.color); l.set(this.frame.light); z.set(this.frame.depth);
    const hdr = this.frame.hdrLight;
    if (hdr) {
      if (!this.warpHDR || this.warpHDR.length !== hdr.length) this.warpHDR = new Float32Array(hdr.length);
      this.warpHDR.set(hdr);
    }
    const hdrCopy = hdr ? this.warpHDR : undefined;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, r = Math.hypot(dx, dy);
      if (r <= inner * 0.9 || r >= maxR) continue;
      const q = (r - inner * 0.9) / (maxR - inner * 0.9);
      const bend = strength * (1 - q) ** 2 * inner * 0.19;
      const turn = strength * (1 - q) ** 2 * 0.15;
      const scale = (r + bend) / r, cs = Math.cos(turn), sn = Math.sin(turn);
      const sx = Math.floor(p.x + (dx * cs - dy * sn) * scale);
      const sy = Math.floor(p.y + (dx * sn + dy * cs) * scale);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const i = y * w + x, j = sy * w + sx;
      this.frame.color[i] = c[j];
      this.frame.light[i] = l[j];
      this.frame.depth[i] = z[j];
      if (hdr && hdrCopy) {
        const a = i * 3, b = j * 3;
        hdr[a] = hdrCopy[b]; hdr[a + 1] = hdrCopy[b + 1]; hdr[a + 2] = hdrCopy[b + 2];
      }
    }
  }

  grid(extent = 8, step = 1) {
    if (!Number.isFinite(extent) || extent < 0 || !Number.isFinite(step) || step <= 0)
      throw new RangeError("grid extent must be non-negative and step must be positive");
    for (let i = -extent; i <= extent; i += step) {
      const color = Math.abs(i) < 0.001 ? "#294866" : "#1d304c";
      this.line([i, -0.055, -extent], [i, -0.055, extent], 0.012, color, 0.35);
      this.line([-extent, -0.055, i], [extent, -0.055, i], 0.012, color, 0.35);
    }
  }
  /** A 5-facet solid crystal grown from the XZ plane (with optional directional lean). */
  crystal(origin: Vec3, height: number, width: number, angle: number, lean: number, ramp: readonly Color3D[]) {
    if (height <= 0.015 || width <= 0) return;
    const tip: Vec3 = [origin[0] + Math.cos(angle) * lean, origin[1] + height, origin[2] + Math.sin(angle) * lean];
    const base: Vec3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = angle + i * TAU3 / 5;
      base.push([origin[0] + Math.cos(a) * width, origin[1], origin[2] + Math.sin(a) * width]);
    }
    for (let i = 0; i < base.length; i++) this.facet(base[i], base[(i + 1) % 5], tip, ramp);
    const rim = ramp[Math.max(0, ramp.length - 2)];
    for (let i = 0; i < base.length; i++) {
      this.line(base[i], tip, 0.025, rim, 0.85, 0.1);
      this.line(base[i], base[(i + 1) % 5], 0.012, ramp[Math.max(0, ramp.length - 4)], 0.8);
    }
    this.line(origin, tip, 0.03, ramp[ramp.length - 1], 0.65, 0.12);
  }
}
