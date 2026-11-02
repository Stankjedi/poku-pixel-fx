import { type Frame3D, type Color3D, clearFrame3D, color3D } from "./frame.js";
import { type Vec3, clamp3, cross3, dot3, len3, norm3, sub3, TAU3 } from "./math.js";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
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

/** Dependency-free low-resolution rasterizer with z-buffer, Bayer alpha and separate additive light. */
export class Painter3D {
  readonly frame: Frame3D;
  camera: Camera3D;
  private scale = 1;
  private cy = 1;
  private sy = 0;
  private ce = 1;
  private se = 0;
  private origin: Vec3 = [0, 0, 0];

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
    const previous = this.frame.light[i];
    const r = Math.min(255, (previous & 255) + (col & 255) * amount) | 0;
    const g = Math.min(255, ((previous >>> 8) & 255) + ((col >>> 8) & 255) * amount) | 0;
    const b = Math.min(255, ((previous >>> 16) & 255) + ((col >>> 16) & 255) * amount) | 0;
    this.frame.light[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }
  private put(x: number, y: number, depth: number, color: number, alpha: number, emission: number) {
    if (x < 0 || x >= this.frame.w || y < 0 || y >= this.frame.h || alpha <= 0) return;
    if (alpha < 1 && alpha <= BAYER4[((y & 3) << 2) | (x & 3)]) return;
    const i = y * this.frame.w + x;
    if (depth < this.frame.depth[i]) return;
    this.frame.depth[i] = depth;
    this.frame.color[i] = color;
    if (emission > 0) this.addLight(i, color, emission);
  }
  /** A single voxel-like camera-facing particle. Radius is in world units, not screen pixels. */
  point(position: Vec3, radius: number, color: Color3D, alpha = 1, emission = 0) {
    const p = this.project(position), r = Math.max(0.58, radius * p.scale), c = color3D(color);
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(this.frame.w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(this.frame.h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = ((x - p.x) ** 2 + (y - p.y) ** 2) / (r * r);
      if (d > 1) continue;
      this.put(x, y, p.depth, c, alpha * (1 - clamp3((d - 0.65) * 1.7)), emission);
    }
  }
  /** Pixel-crisp swept capsule; analytic screen-space coverage with interpolated depth. */
  line(a: Vec3, b: Vec3, radius: number, color: Color3D, alpha = 1, emission = 0) {
    const p = this.project(a), q = this.project(b);
    const r = Math.max(0.62, radius * (p.scale + q.scale) * 0.5);
    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
    const c = color3D(color), w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(Math.min(p.x, q.x) - r)), x1 = Math.min(w - 1, Math.ceil(Math.max(p.x, q.x) + r));
    const y0 = Math.max(0, Math.floor(Math.min(p.y, q.y) - r)), y1 = Math.min(h - 1, Math.ceil(Math.max(p.y, q.y) + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = d2 > 0 ? clamp3(((x - p.x) * dx + (y - p.y) * dy) / d2) : 0;
      const d = ((x - p.x - t * dx) ** 2 + (y - p.y - t * dy) ** 2) / (r * r);
      if (d > 1) continue;
      this.put(x, y, p.depth + (q.depth - p.depth) * t, c, alpha * (1 - clamp3((d - 0.75) * 2)), emission);
    }
  }
  /** Filled, z-buffered pixel triangle; low-poly geometry remains solid under orbit. */
  triangle(a: Vec3, b: Vec3, c: Vec3, color: Color3D, alpha = 1, emission = 0) {
    const A = this.project(a), B = this.project(b), C = this.project(c), w = this.frame.w, h = this.frame.h;
    const det = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    if (Math.abs(det) < 1e-6) return;
    const x0 = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x))), x1 = Math.min(w - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
    const y0 = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y))), y1 = Math.min(h - 1, Math.ceil(Math.max(A.y, B.y, C.y)));
    const col = color3D(color);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = ((B.x - x) * (C.y - y) - (B.y - y) * (C.x - x)) / det;
      const v = ((C.x - x) * (A.y - y) - (C.y - y) * (A.x - x)) / det;
      const t = 1 - u - v;
      if (u < -1e-5 || v < -1e-5 || t < -1e-5) continue;
      this.put(x, y, u * A.depth + v * B.depth + t * C.depth, col, alpha, emission);
    }
  }
  /** Flat-lit facet, quantized to a discrete color ramp instead of smooth Gouraud shading. */
  facet(a: Vec3, b: Vec3, c: Vec3, ramp: readonly Color3D[], alpha = 1, emission = 0) {
    const n = norm3(cross3(sub3(b, a), sub3(c, a)));
    const brightness = Math.abs(dot3(n, norm3([0.6, 1, -0.45])));
    const idx = Math.floor(clamp3(0.22 + brightness * 0.7) * (ramp.length - 1));
    this.triangle(a, b, c, ramp[idx], alpha, emission);
  }
  ring(radius: number, width: number, color: Color3D, opacity = 1, emission = 0, height = 0.03, segments = 96) {
    if (radius <= 0) return;
    let a: Vec3 = [radius, height, 0];
    for (let i = 1; i <= segments; i++) {
      const ang = i * TAU3 / segments, b: Vec3 = [Math.cos(ang) * radius, height, Math.sin(ang) * radius];
      this.line(a, b, width, color, opacity, emission); a = b;
    }
  }
  /** Separate additive light-buffer disc, independent of the pixel color buffer. */
  glow(position: Vec3, radius: number, color: Color3D, strength = 1) {
    if (radius <= 0 || strength <= 0) return;
    const p = this.project(position), r = Math.max(1, radius * p.scale), c = color3D(color), w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = ((x - p.x) ** 2 + (y - p.y) ** 2) / (r * r);
      if (d >= 1) continue;
      this.addLight(y * w + x, c, (1 - d) ** 2 * strength);
    }
  }
  grid(extent = 8, step = 1) {
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
