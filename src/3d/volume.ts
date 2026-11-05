/** World-space volume integration. No camera-facing sprites and no random draw-time state. */
import { type Vec3, clamp3 } from "./math.js";
import { type Color3D, color3D } from "./frame.js";
import { type Painter3D } from "./painter.js";
import { channelToLinear } from "../render/linear.js";

export interface VolumeBounds3D { min: Vec3; max: Vec3 }
export interface VolumeSample3D {
  /** Extinction per world unit, not opacity per sample. */
  density: number;
  color: Color3D;
  emission?: number;
}
export type VolumeField3D = (x: number, y: number, z: number) => VolumeSample3D | undefined;
export interface VolumeOptions3D {
  /** Maximum world-space sample separation. Smaller values cost more. */
  step?: number;
  /** Bound work per ray, even for large volumes. */
  maxSteps?: number;
  /** Optional discrete material palette after integration; no screen-space noise. */
  palette?: readonly Color3D[];
  opacity?: number;
  /** Reject faint boundary coverage for a cleaner low-resolution silhouette. */
  alphaCutoff?: number;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

/**
 * Draw after opaque geometry. Rays are reconstructed from Painter3D's real camera,
 * clipped against world-space bounds and existing scene depth, and integrated near
 * to far. Volumes do not write opaque depth. Combine overlapping media in one field
 * or submit separate volumes back-to-front; this is not order-independent rendering.
 */
export function drawVolume3D(p: Painter3D, bounds: VolumeBounds3D, field: VolumeField3D, options: VolumeOptions3D = {}) {
  const step = options.step ?? 0.14, maxSteps = options.maxSteps ?? 96, opacity = options.opacity ?? 1;
  if (!(Number.isFinite(step) && step > 0)) throw new RangeError("Volume step must be finite and positive");
  if (!(Number.isSafeInteger(maxSteps) && maxSteps > 0)) throw new RangeError("Volume maxSteps must be a positive integer");
  if (!Number.isFinite(opacity)) throw new RangeError("Volume opacity must be finite");
  for (let i = 0; i < 3; i++) if (!Number.isFinite(bounds.min[i]) || !Number.isFinite(bounds.max[i]) || bounds.max[i] <= bounds.min[i]) throw new RangeError("Volume bounds must have finite positive extents");
  if (options.alphaCutoff !== undefined && (!Number.isFinite(options.alphaCutoff) || options.alphaCutoff < 0 || options.alphaCutoff > 1)) throw new RangeError("Volume alphaCutoff must be between zero and one");
  if (opacity <= 0) return;
  const f = p.frame, camera = p.camera, origin = camera.target ?? [0, 0, 0];
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), ce = Math.cos(camera.elevation), se = Math.sin(camera.elevation);
  const right: Vec3 = [cy, 0, -sy], up: Vec3 = [-sy * se, ce, -cy * se], front: Vec3 = [sy * ce, se, cy * ce];
  const scale = Math.min(f.w / 17, f.h / 11) * camera.zoom;
  const perspective = camera.projection === "perspective" ? camera.perspective ?? 0.025 : 0;
  let x0 = f.w, x1 = -1, y0 = f.h, y1 = -1;
  for (let i = 0; i < 8; i++) {
    const v = p.project([i & 1 ? bounds.max[0] : bounds.min[0], i & 2 ? bounds.max[1] : bounds.min[1], i & 4 ? bounds.max[2] : bounds.min[2]]);
    x0 = Math.min(x0, Math.floor(v.x)); x1 = Math.max(x1, Math.ceil(v.x)); y0 = Math.min(y0, Math.floor(v.y)); y1 = Math.max(y1, Math.ceil(v.y));
  }
  x0 = Math.max(0, x0); x1 = Math.min(f.w - 1, x1); y0 = Math.max(0, y0); y1 = Math.min(f.h - 1, y1);
  const palette = options.palette?.map(color3D), volumeOpacity = clamp3(opacity);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = (x + 0.5 - f.w * 0.5) / scale, v = (f.h * 0.61 - y - 0.5) / scale;
    const offset: Vec3 = [right[0] * u + up[0] * v, right[1] * u + up[1] * v, right[2] * u + up[2] * v];
    const ray: Vec3 = [front[0] - offset[0] * perspective, front[1] - offset[1] * perspective, front[2] - offset[2] * perspective];
    const base: Vec3 = [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
    let near = Infinity, far = -Infinity, hit = true;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(ray[axis]) < 1e-12) { if (base[axis] < bounds.min[axis] || base[axis] > bounds.max[axis]) hit = false; }
      else {
        const a = (bounds.min[axis] - base[axis]) / ray[axis], b = (bounds.max[axis] - base[axis]) / ray[axis];
        near = Math.min(near, Math.max(a, b)); far = Math.max(far, Math.min(a, b));
      }
    }
    const pixel = y * f.w + x;
    far = Math.max(far, p.opaqueDepthAt(x, y));
    // Painter3D clamps perspective at 0.3. Volumes stop before that near plane,
    // rather than sampling behind the camera with a different projection.
    if (perspective > 0) near = Math.min(near, 0.7 / perspective);
    else if (perspective < 0) far = Math.max(far, 0.7 / perspective);
    if (!hit || near <= far) continue;
    const distanceScale = Math.hypot(...ray), span = (near - far) * distanceScale;
    const count = Math.min(maxSteps, Math.max(1, Math.ceil(span / step)));
    const depthStep = (near - far) / count, ds = span / count;
    let transmittance = 1, r = 0, g = 0, b = 0, lr = 0, lg = 0, lb = 0, hr = 0, hg = 0, hb = 0;
    for (let n = 0; n < count && transmittance > 0.008; n++) {
      const depth = near - (n + 0.5) * depthStep;
      const sample = field(base[0] + ray[0] * depth, base[1] + ray[1] * depth, base[2] + ray[2] * depth);
      if (!sample || !(sample.density > 0) || !Number.isFinite(sample.density)) continue;
      const c = color3D(sample.color), a = 1 - Math.exp(-sample.density * ds * volumeOpacity * (c >>> 24) / 255), weight = transmittance * a;
      r += (c & 255) * weight; g += ((c >>> 8) & 255) * weight; b += ((c >>> 16) & 255) * weight;
      const light = Number.isFinite(sample.emission) ? Math.max(0, sample.emission ?? 0) * weight : 0;
      lr += (c & 255) * light; lg += ((c >>> 8) & 255) * light; lb += ((c >>> 16) & 255) * light;
      if (f.hdrLight && light > 0) { hr += channelToLinear(c, 0) * light; hg += channelToLinear(c, 8) * light; hb += channelToLinear(c, 16) * light; }
      transmittance *= 1 - a;
    }
    const alpha = 1 - transmittance;
    if (alpha < (options.alphaCutoff ?? 0.012)) continue;
    r /= alpha; g /= alpha; b /= alpha;
    let color = (0xff000000 | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
    if (palette?.length) {
      let best = Infinity;
      for (const c of palette) {
        const d = ((c & 255) - r) ** 2 + (((c >>> 8) & 255) - g) ** 2 + (((c >>> 16) & 255) - b) ** 2;
        if (d < best) { best = d; color = (c | 0xff000000) >>> 0; }
      }
    }
    const dither = p.alphaMode === "dither";
    if (dither && alpha <= BAYER4[((y & 3) << 2) | (x & 3)]) continue;
    // A preintegrated ray is an ordered material layer, not an opaque depth write.
    // Its own radiance and extinction pass through the same surface resolver.
    // Intersecting volumes still belong in one field, as described above.
    p.volumePixel(x, y, near, color, dither ? 1 : alpha, lr, lg, lb, hr, hg, hb);
  }
}

/** Smooth, seeded 3D value noise for material coordinates. Stable at negative coordinates. */
export function volumeNoise3D(x: number, y: number, z: number, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ease = (n: number) => n * n * (3 - 2 * n);
  const u = ease(x - ix), v = ease(y - iy), w = ease(z - iz);
  const hash = (a: number, b: number, c: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w);
}

/** Reusable trilinear density cache for expensive procedural fields. Refill on simulation changes. */
export class VolumeGrid3D {
  readonly bounds: VolumeBounds3D;
  readonly dimensions: readonly [number, number, number];
  private readonly data: Float32Array;
  private readonly occupied: Uint8Array;
  private readonly materials: Uint32Array;
  private readonly uniformMaterials: Uint32Array;
  private hasEmission = false;
  private readonly inverse: Vec3;
  private readonly output: VolumeSample3D = { density: 0, color: 0, emission: 0 };
  constructor(bounds: VolumeBounds3D, cellSize = 0.16) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("Volume cellSize must be finite and positive");
    for (let i = 0; i < 3; i++) if (!Number.isFinite(bounds.min[i]) || !Number.isFinite(bounds.max[i]) || bounds.max[i] <= bounds.min[i]) throw new RangeError("Volume bounds must have finite positive extents");
    this.bounds = { min: [...bounds.min], max: [...bounds.max] };
    this.dimensions = bounds.min.map((v, i) => Math.ceil((bounds.max[i] - v) / cellSize) + 1) as unknown as readonly [number, number, number];
    const count = this.dimensions[0] * this.dimensions[1] * this.dimensions[2];
    if (count > 2_000_000) throw new RangeError("Volume grid exceeds two million samples");
    this.data = new Float32Array(count * 5);
    this.occupied = new Uint8Array(count);
    this.materials = new Uint32Array(count);
    this.uniformMaterials = new Uint32Array(count);
    this.inverse = this.dimensions.map((v, i) => (v - 1) / (bounds.max[i] - bounds.min[i])) as unknown as Vec3;
  }
  refill(field: VolumeField3D) {
    const [nx, ny, nz] = this.dimensions, min = this.bounds.min;
    this.data.fill(0);
    this.materials.fill(0);
    this.hasEmission = false;
    let i = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, i += 5) {
      const sample = field(min[0] + x / this.inverse[0], min[1] + y / this.inverse[1], min[2] + z / this.inverse[2]);
      if (!sample || !(sample.density > 0) || !Number.isFinite(sample.density)) continue;
      const c = color3D(sample.color), d = sample.density * (c >>> 24) / 255;
      this.data[i] = d;
      // Density-weighted material avoids dark fringes at the boundary of empty cells.
      this.data[i + 1] = (c & 255) * d; this.data[i + 2] = ((c >>> 8) & 255) * d; this.data[i + 3] = ((c >>> 16) & 255) * d;
      // Preserve the general path for Float32 overflow, rather than hiding it
      // behind the uniform-material fast path. 1 is not an opaque material.
      if (!this.hasEmission) this.materials[i / 5] = Number.isFinite(this.data[i + 1] + this.data[i + 2] + this.data[i + 3]) ? (c | 0xff000000) >>> 0 : 1;
      this.data[i + 4] = Number.isFinite(sample.emission) ? Math.max(0, sample.emission ?? 0) * d : 0;
      if (this.data[i + 4] > 0) this.hasEmission = true;
    }
    // Mark interpolation cells, not individual vertices: a ray may be inside an
    // empty cell next to a nonempty one. Reject only when all eight corners are
    // empty, preserving thin boundaries and the exact trilinear field.
    const row = nx * 5, plane = nx * ny * 5, data = this.data;
    for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
      const cell = (z * ny + y) * nx + x, i = cell * 5;
      this.occupied[cell] = +(data[i] > 0 || data[i + 5] > 0 || data[i + row] > 0 || data[i + row + 5] > 0 ||
        data[i + plane] > 0 || data[i + plane + 5] > 0 || data[i + plane + row] > 0 || data[i + plane + row + 5] > 0);
      if (!this.hasEmission) {
        // A cell with one material needs density interpolation but not three
        // redundant material sums. Empty corners carry no material weight.
        const m = this.materials, c0 = m[cell], c1 = m[cell + 1], c2 = m[cell + nx], c3 = m[cell + nx + 1];
        const c4 = m[cell + nx * ny], c5 = m[cell + nx * ny + 1], c6 = m[cell + nx * ny + nx], c7 = m[cell + nx * ny + nx + 1];
        const c = c0 || c1 || c2 || c3 || c4 || c5 || c6 || c7;
        this.uniformMaterials[cell] = c > 0xffffff && (!c0 || c0 === c) && (!c1 || c1 === c) && (!c2 || c2 === c) && (!c3 || c3 === c) &&
          (!c4 || c4 === c) && (!c5 || c5 === c) && (!c6 || c6 === c) && (!c7 || c7 === c) ? c : 0;
      }
    }
  }
  /** The result is borrowed and valid only until the next call. */
  sample = (x: number, y: number, z: number): VolumeSample3D | undefined => {
    const min = this.bounds.min, max = this.bounds.max;
    if (x < min[0] || y < min[1] || z < min[2] || x > max[0] || y > max[1] || z > max[2]) return;
    const [nx, ny, nz] = this.dimensions;
    x = (x - min[0]) * this.inverse[0]; y = (y - min[1]) * this.inverse[1]; z = (z - min[2]) * this.inverse[2];
    const ix = Math.min(nx - 2, Math.floor(x)), iy = Math.min(ny - 2, Math.floor(y)), iz = Math.min(nz - 2, Math.floor(z));
    const cell = (iz * ny + iy) * nx + ix;
    if (!this.occupied[cell]) return;
    const u = x - ix, v = y - iy, w = z - iz;
    // Hoist the eight corner weights/addresses once. Keep the original corner
    // accumulation order so material colors and optical thickness stay exact.
    const uv00 = (1 - u) * (1 - v), uv10 = u * (1 - v), uv01 = (1 - u) * v, uv11 = u * v;
    const w0 = uv00 * (1 - w), w1 = uv10 * (1 - w), w2 = uv01 * (1 - w), w3 = uv11 * (1 - w);
    const w4 = uv00 * w, w5 = uv10 * w, w6 = uv01 * w, w7 = uv11 * w;
    const i0 = cell * 5, i1 = i0 + 5, i2 = i0 + nx * 5, i3 = i2 + 5;
    const i4 = i0 + nx * ny * 5, i5 = i4 + 5, i6 = i4 + nx * 5, i7 = i6 + 5;
    const data = this.data;
    const density = data[i0] * w0 + data[i1] * w1 + data[i2] * w2 + data[i3] * w3 +
      data[i4] * w4 + data[i5] * w5 + data[i6] * w6 + data[i7] * w7;
    if (density < 1e-6) return;
    this.output.density = density;
    const material = this.hasEmission ? 0 : this.uniformMaterials[cell];
    if (material && Number.isFinite(density)) this.output.color = material;
    else {
      const r = data[i0 + 1] * w0 + data[i1 + 1] * w1 + data[i2 + 1] * w2 + data[i3 + 1] * w3 +
        data[i4 + 1] * w4 + data[i5 + 1] * w5 + data[i6 + 1] * w6 + data[i7 + 1] * w7;
      const g = data[i0 + 2] * w0 + data[i1 + 2] * w1 + data[i2 + 2] * w2 + data[i3 + 2] * w3 +
        data[i4 + 2] * w4 + data[i5 + 2] * w5 + data[i6 + 2] * w6 + data[i7 + 2] * w7;
      const b = data[i0 + 3] * w0 + data[i1 + 3] * w1 + data[i2 + 3] * w2 + data[i3 + 3] * w3 +
        data[i4 + 3] * w4 + data[i5 + 3] * w5 + data[i6 + 3] * w6 + data[i7 + 3] * w7;
      this.output.color = (0xff000000 | (Math.round(b / density) << 16) | (Math.round(g / density) << 8) | Math.round(r / density)) >>> 0;
    }
    const emission = this.hasEmission || !Number.isFinite(density) ? data[i0 + 4] * w0 + data[i1 + 4] * w1 + data[i2 + 4] * w2 + data[i3 + 4] * w3 +
      data[i4 + 4] * w4 + data[i5 + 4] * w5 + data[i6 + 4] * w6 + data[i7 + 4] * w7 : 0;
    this.output.emission = emission / density;
    return this.output;
  };
}
