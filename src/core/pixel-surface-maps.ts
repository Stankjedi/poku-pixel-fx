import type { MaterialChannels2D } from './material-surface.js';
import type { EditableSprite2D } from './sprite-edit.js';

/** Geometry-only visibility bake. Heights are authored native-cell units, never RGB luminance. */
export interface PixelSurfaceLightingOptions2D {
  /** Nonzero cells are solid height-field surfaces. Zero cells and the canvas exterior never occlude. */
  mask?: ArrayLike<number>;
  /** Surface-to-light direction: +x right, +y down, +z toward the viewer. */
  light?: readonly [number, number, number];
  /** Ambient visibility strength, 0..1. Defaults to 1 for a standalone map bake. */
  ambientOcclusion?: number;
  /** Integer native-cell radius of the 16-direction horizon search, 1..32. Default: 8. */
  occlusionRadius?: number;
  /** Directional shadow strength, 0..1. Defaults to 1 for a standalone map bake. */
  castShadow?: number;
  /** Maximum planar ray distance in native cells, 1..128. Default: 32. */
  shadowDistance?: number;
  /** Small native-height offset that avoids self-occlusion on nearly equal heights. Default: .02. */
  bias?: number;
}

export interface PixelSurfaceLighting2D {
  w: number;
  h: number;
  /** Ambient visibility: 1 is open, 0 is occluded. Hidden cells are 1. */
  occlusion: Float32Array;
  /** Directional visibility: 1 is lit, 0 is blocked. Hidden cells are 1. */
  shadow: Float32Array;
}

export interface PixelSurfaceMapOptions2D {
  /** Stored channel normals use y-down coordinates. OpenGL flips green to tangent y-up;
   * DirectX retains y-down. Both encode +x toward the right and +z toward the viewer. */
  normalConvention?: 'opengl' | 'directx';
  /** Black and white native heights. Supply one fixed range for every frame of an animation.
   * Omitted: minimum/maximum occupied height. A constant-height map is black. */
  heightRange?: readonly [number, number];
  lighting?: Omit<PixelSurfaceLightingOptions2D, 'mask'>;
}

export interface PixelSurfaceMaps2D {
  normal: EditableSprite2D;
  height: EditableSprite2D;
  occlusion: EditableSprite2D;
  shadow: EditableSprite2D;
  heightRange: readonly [number, number];
  normalConvention: 'opengl' | 'directx';
  /** Full float visibility for engines that should not round-trip through an 8-bit PNG. */
  lighting: PixelSurfaceLighting2D;
}

const MAX_CELLS = 16_777_216;
// Predictable CPU authoring budget, independent of machine speed. Reduce the radius/distance
// or bake smaller assets when explicitly requesting a larger workload.
const MAX_RAY_VISITS = 134_217_728;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function dimensions(w: number, h: number): number {
  const n = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || n > MAX_CELLS)
    throw new RangeError('Surface maps require positive native dimensions and at most 16,777,216 cells');
  return n;
}

function bounded(value: number, min: number, max: number, name: string, integer = false): number {
  if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value))
    throw new RangeError(`${name} must be ${integer ? 'an integer' : 'finite'} within ${min}..${max}`);
  return value;
}

interface HorizonCell { x: number; y: number; d2: number }
const horizonCache = new Map<number, readonly (readonly HorizonCell[])[]>();

function horizonRays(radius: number): readonly (readonly HorizonCell[])[] {
  const cached = horizonCache.get(radius);
  if (cached) return cached;
  const rays: HorizonCell[][] = [], round = (v: number) => Math.sign(v) * Math.round(Math.abs(v));
  for (let direction = 0; direction < 16; direction++) {
    const a = direction * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a), ray: HorizonCell[] = [];
    let lastX = 0, lastY = 0;
    for (let step = 1; step <= radius; step++) {
      const x = round(dx * step), y = round(dy * step), d2 = x * x + y * y;
      if (x === lastX && y === lastY || d2 > radius * radius) continue;
      ray.push({ x, y, d2 }); lastX = x; lastY = y;
    }
    rays.push(ray);
  }
  horizonCache.set(radius, rays);
  return rays;
}

interface ShadowCell { x: number; y: number; enter: number; exit: number }

/** A slope limiter reproduces planes but cannot overshoot a local extremum or a sharp step. */
function limitedSlope(backward: number, forward: number): number {
  return backward * forward > 0 ? Math.sign(backward) * Math.min(Math.abs(backward), Math.abs(forward)) : 0;
}

/** Grid traversal includes the face of every column hit by the ray, not just its center.
 * A one-cell-wide wall therefore casts a shadow even for shallow/diagonal light. */
function shadowRay(dx: number, dy: number, distance: number): ShadowCell[] {
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaY = dy ? Math.abs(1 / dy) : Infinity;
  let nextX = deltaX * .5, nextY = deltaY * .5, x = 0, y = 0;
  const cells: ShadowCell[] = [];
  while (Math.min(nextX, nextY) < distance) {
    const enter = Math.min(nextX, nextY);
    // Exact corner hits visit the diagonal column once, without phantom side blockers.
    const crossX = nextX <= nextY + 1e-12, crossY = nextY <= nextX + 1e-12;
    if (crossX) { x += stepX; nextX += deltaX; }
    if (crossY) { y += stepY; nextY += deltaY; }
    cells.push({ x, y, enter, exit: Math.min(distance, nextX, nextY) });
  }
  return cells;
}

/** Bounded, deterministic native-height visibility. The AO horizon is measured relative to
 * the local tangent, so a uniformly tilted plane does not become a fake cavity. This is a
 * 16-direction height-field approximation, not global illumination or mesh ray tracing. */
export function bakePixelSurfaceLighting2D(w: number, h: number, height: ArrayLike<number>,
  options: PixelSurfaceLightingOptions2D = {}): PixelSurfaceLighting2D {
  const n = dimensions(w, h), mask = options.mask;
  if (height.length !== n || mask && mask.length !== n)
    throw new RangeError('Surface height and mask buffers must match native dimensions');
  let occupied = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(height[i]) || !Number.isFinite(Math.fround(height[i])))
      throw new RangeError('Surface heights must contain finite float32 values');
    if (mask && !Number.isFinite(mask[i])) throw new RangeError('Surface mask values must be finite');
    if (!mask || mask[i]) occupied++;
  }
  const ao = bounded(options.ambientOcclusion ?? 1, 0, 1, 'Ambient occlusion');
  const radius = bounded(options.occlusionRadius ?? 8, 1, 32, 'Occlusion radius', true);
  const strength = bounded(options.castShadow ?? 1, 0, 1, 'Cast shadow');
  const distance = bounded(options.shadowDistance ?? 32, 1, 128, 'Shadow distance', true);
  const bias = bounded(options.bias ?? .02, 0, 16, 'Surface visibility bias');
  const light = options.light ?? [-.6, -.7, 1];
  if (light.length !== 3 || !light.every(Number.isFinite) || !(Math.hypot(...light) > 0) || !Number.isFinite(Math.hypot(...light)))
    throw new RangeError('Surface light must be a finite nonzero 3-vector');
  const planar = Math.hypot(light[0], light[1]), slope = planar ? light[2] / planar : light[2] > 0 ? Infinity : -Infinity;
  const rays = ao ? horizonRays(radius) : [];
  const shadowCells = strength && planar && Number.isFinite(slope) ? shadowRay(light[0] / planar, light[1] / planar, distance) : [];
  const visits = occupied * (rays.reduce((sum, ray) => sum + ray.length, 0) + shadowCells.length);
  if (visits > MAX_RAY_VISITS)
    throw new RangeError('Surface visibility exceeds 134,217,728 ray visits; reduce the occlusion radius or shadow distance');
  const occlusion = new Float32Array(n).fill(1), shadow = new Float32Array(n).fill(1);
  const needGradient = ao > 0 || shadowCells.length > 0;
  // Differences of two finite float32 heights can exceed float32 range.
  const gradientX = needGradient ? new Float64Array(n) : undefined, gradientY = needGradient ? new Float64Array(n) : undefined;
  if (gradientX && gradientY) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask && !mask[i]) continue;
    const center = height[i];
    const left = x > 0 && (!mask || mask[i - 1]), right = x + 1 < w && (!mask || mask[i + 1]);
    const up = y > 0 && (!mask || mask[i - w]), down = y + 1 < h && (!mask || mask[i + w]);
    gradientX[i] = left && right ? limitedSlope(center - height[i - 1], height[i + 1] - center)
      : right ? height[i + 1] - center : left ? center - height[i - 1] : 0;
    gradientY[i] = up && down ? limitedSlope(center - height[i - w], height[i + w] - center)
      : down ? height[i + w] - center : up ? center - height[i - w] : 0;
  }
  const rayX = planar ? light[0] / planar : 0, rayY = planar ? light[1] / planar : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask && !mask[i]) continue;
    const center = height[i];
    if (ao) {
      const gx = gradientX![i], gy = gradientY![i];
      let blocked = 0;
      for (const ray of rays) {
        let horizon = 0;
        for (const offset of ray) {
          const sx = x + offset.x, sy = y + offset.y;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) break;
          const j = sy * w + sx;
          if (mask && !mask[j]) continue;
          const elevation = height[j] - center - bias, tangent = gx * offset.x + gy * offset.y;
          const rise = elevation - tangent;
          if (rise <= 0) continue;
          // sin²(horizon angle - tangent angle), avoiding per-sample inverse trig.
          // Differences >= 90 degrees fully close this direction's local hemisphere.
          if (offset.d2 + elevation * tangent <= 0) { horizon = 1; break; }
          const amount = rise * rise * offset.d2
            / ((offset.d2 + elevation * elevation) * (offset.d2 + tangent * tangent));
          horizon = Math.max(horizon, amount);
        }
        blocked += horizon;
      }
      occlusion[i] = 1 - ao * clamp01(blocked / rays.length);
    }
    if (strength) {
      let blocked = slope === -Infinity;
      if (!blocked) for (const cell of shadowCells) {
        const sx = x + cell.x, sy = y + cell.y;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) break;
        const j = sy * w + sx;
        if (mask && !mask[j]) continue;
        // Reconstruct the local surface within a traversed cell. A smooth slope must not
        // cast staircase shadows merely because its heights were sampled on a pixel grid.
        // Limited slopes are zero across a cliff, preserving the wall's actual near face.
        const gx = gradientX![j], gy = gradientY![j];
        const base = height[j] - center - gx * cell.x - gy * cell.y;
        const relativeSlope = gx * rayX + gy * rayY - slope;
        if (base + relativeSlope * (relativeSlope > 0 ? cell.exit : cell.enter) > bias) { blocked = true; break; }
      }
      if (blocked) shadow[i] = 1 - strength;
    }
  }
  return { w, h, occlusion, shadow };
}

/** Encode authored channels as native, unblurred normal/height/visibility sprites. PNG writing
 * belongs to the caller. Pixels outside the source silhouette are transparent; occupied cells
 * retain the exact source coverage, including partial alpha. Source buffers are never modified. */
export function exportPixelSurfaceMaps2D(source: EditableSprite2D & { channels?: MaterialChannels2D },
  options: PixelSurfaceMapOptions2D = {}): PixelSurfaceMaps2D {
  const { w, h, channels } = source, n = dimensions(w, h);
  if (!(source.pixels instanceof Uint32Array) || source.pixels.length !== n || source.mask.w !== w || source.mask.h !== h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== n)
    throw new RangeError('Surface map source must have matching native pixel and mask buffers');
  if (!channels || channels.w !== w || channels.h !== h || !(channels.height instanceof Float32Array)
    || channels.height.length !== n || !(channels.normal instanceof Float32Array) || channels.normal.length !== n * 3
    || !channels.height.every(Number.isFinite) || !channels.normal.every(Number.isFinite))
    throw new RangeError('Surface maps need matching authored height and normal channels; RGB is not geometry');
  const convention = options.normalConvention ?? 'opengl';
  if (convention !== 'opengl' && convention !== 'directx') throw new RangeError('Normal convention must be opengl or directx');
  const mask = new Uint8Array(n);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) if (source.mask.data[i] && source.pixels[i] >>> 24) {
    mask[i] = 1; low = Math.min(low, channels.height[i]); high = Math.max(high, channels.height[i]);
  }
  if (options.heightRange) {
    if (options.heightRange.length !== 2 || !options.heightRange.every(Number.isFinite)
      || options.heightRange[1] < options.heightRange[0] || !Number.isFinite(options.heightRange[1] - options.heightRange[0]))
      throw new RangeError('Height map range must be two finite heights in ascending order');
    [low, high] = options.heightRange;
  } else if (low === Infinity) low = high = 0;
  const lighting = bakePixelSurfaceLighting2D(w, h, channels.height, { ...options.lighting, mask });
  const normal = new Uint32Array(n), height = new Uint32Array(n), occlusion = new Uint32Array(n), shadow = new Uint32Array(n);
  const gray = (value: number, alpha: number): number => {
    const byte = Math.round(clamp01(value) * 255);
    return (alpha | byte | byte << 8 | byte << 16) >>> 0;
  };
  for (let i = 0; i < n; i++) if (mask[i]) {
    const j = i * 3, alpha = source.pixels[i] & 0xff000000;
    const nx = channels.normal[j], ny = channels.normal[j + 1], nz = channels.normal[j + 2], length = Math.hypot(nx, ny, nz);
    const r = Math.round(clamp01((length ? nx / length : 0) * .5 + .5) * 255);
    const g = Math.round(clamp01((length ? ny / length : 0) * (convention === 'opengl' ? -.5 : .5) + .5) * 255);
    const b = Math.round(clamp01((length ? nz / length : 1) * .5 + .5) * 255);
    normal[i] = (alpha | r | g << 8 | b << 16) >>> 0;
    height[i] = gray(high > low ? (channels.height[i] - low) / (high - low) : 0, alpha);
    occlusion[i] = gray(lighting.occlusion[i], alpha);
    shadow[i] = gray(lighting.shadow[i], alpha);
  }
  const raster = (pixels: Uint32Array): EditableSprite2D => ({ w, h, pixels, mask: { ...source.mask, data: source.mask.data.slice() } });
  return { normal: raster(normal), height: raster(height), occlusion: raster(occlusion), shadow: raster(shadow),
    heightRange: [low, high], normalConvention: convention, lighting };
}
