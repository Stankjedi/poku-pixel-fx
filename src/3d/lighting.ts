/**
 * Optional world-space, depth-aware 3D lighting for existing VFX geometry.
 *
 * It reconstructs camera-space pixels from Painter3D's depth buffer, estimates
 * face orientation from local derivatives, and accumulates unclamped linear HDR
 * radiance. No effect module needs to be rewritten; original ABGR art is intact.
 * It is a screen-space approximation (not shadow mapping or ray tracing).
 */
import { color3D, type Color3D, type Frame3D } from "./frame.js";
import { SRGB_TO_LINEAR as LINEAR } from "../render/linear.js";
import type { Camera3D } from "./painter.js";
import type { Vec3 } from "./math.js";

export interface PointLight3D {
  position: Vec3;
  color: Color3D;
  /** World-space light radius. */
  radius: number;
  /** HDR luminous intensity. Values >1 are allowed. */
  intensity: number;
  /** Specular highlight strength (0 for a diffuse-only light). */
  specular?: number;
  /** Edge/fresnel fill amount (0..1 usually). */
  rim?: number;
}
export interface ScreenSpaceAO3D {
  /** Neighborhood radius in render-target pixels. */
  radius?: number;
  /** Maximum world-space distance at which nearby geometry can occlude (default 2). */
  range?: number;
  /** Minimum distance above the reconstructed surface, in world units. */
  bias?: number;
  intensity?: number;
}
export interface LightingOptions3D {
  /** Prevent normals from crossing significant depth discontinuities. */
  edgeThreshold?: number;
  ambientOcclusion?: false | ScreenSpaceAO3D;
}
export interface LightingResult3D {
  readonly radiance: Float32Array;
  readonly occlusion: Float32Array;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Reuses the same buffers across frames to minimize garbage collection. */
export class CinematicLighting3D {
  private positions = new Float32Array(0);
  private normals = new Float32Array(0);
  private radiance = new Float32Array(0);
  private occlusion = new Float32Array(0);
  private cacheW = 0;
  private cacheH = 0;

  private prepare(w: number, h: number) {
    if (w === this.cacheW && h === this.cacheH) return;
    this.cacheW = w; this.cacheH = h;
    this.positions = new Float32Array(w * h * 3);
    this.normals = new Float32Array(w * h * 3);
    this.radiance = new Float32Array(w * h * 3);
    this.occlusion = new Float32Array(w * h);
  }

  /**
   * Computes point-light diffuse/specular/rim contribution plus optional SSAO.
   * Call after all effects have drawn, before CinematicCompositor.render().
   * Output arrays are owned by this object and overwritten on the next call.
   */
  evaluate(frame: Frame3D, camera: Camera3D, lights: readonly PointLight3D[], options: LightingOptions3D = {}): LightingResult3D {
    const { w, h, depth, color } = frame, n = w * h;
    this.prepare(w, h);
    const pos = this.positions, normals = this.normals, rad = this.radiance, ao = this.occlusion;
    rad.fill(0); ao.fill(1);

    // Mirrors Painter3D.project() exactly, including its perspective adjustment.
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const ce = Math.cos(camera.elevation), se = Math.sin(camera.elevation);
    const scale = Math.min(w / 17, h / 11) * camera.zoom;
    const perspective = camera.projection === "perspective";
    const lens = camera.perspective ?? 0.025;
    const target = camera.target ?? [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, d = depth[i];
      if (!Number.isFinite(d)) continue;
      const s = scale * (perspective ? 1 / Math.max(0.3, 1 - d * lens) : 1);
      const u = (x + 0.5 - w * 0.5) / s, up = (h * 0.61 - y - 0.5) / s;
      const v = d * ce - up * se, j = i * 3;
      pos[j] = target[0] + u * cy + v * sy;
      pos[j + 1] = target[1] + up * ce + d * se;
      pos[j + 2] = target[2] - u * sy + v * cy;
    }

    const threshold = Math.max(0, options.edgeThreshold ?? 0.46);
    const cameraForwardX = sy * ce, cameraForwardY = se, cameraForwardZ = cy * ce;
    const descriptors = lights.filter(l => l.radius > 0 && l.intensity > 0).map(l => {
      const c = color3D(l.color);
      return {
        x: l.position[0], y: l.position[1], z: l.position[2], r2: l.radius * l.radius,
        r: LINEAR[c & 255], g: LINEAR[(c >>> 8) & 255], b: LINEAR[(c >>> 16) & 255],
        intensity: l.intensity, specular: l.specular ?? 0.28, rim: l.rim ?? 0.12,
      };
    });

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, z = depth[i];
      if (!Number.isFinite(z)) continue;
      const j = i * 3, px = pos[j], py = pos[j + 1], pz = pos[j + 2];

      // Pick the nearest-depth neighbor on each axis. A missing forward sample
      // must fall back to the opposite side, not a camera-facing normal: the latter
      // produces bright one-pixel seams on otherwise continuous tilted facets.
      const s = scale * (perspective ? 1 / Math.max(0.3, 1 - z * lens) : 1);
      let rx = cy / s, ry = 0, rz = -sy / s;
      let dx = sy * se / s, dy = -ce / s, dz = cy * se / s;
      const rightDelta = x + 1 < w ? Math.abs(z - depth[i + 1]) : Infinity;
      const leftDelta = x > 0 ? Math.abs(z - depth[i - 1]) : Infinity;
      const downDelta = y + 1 < h ? Math.abs(z - depth[i + w]) : Infinity;
      const upDelta = y > 0 ? Math.abs(z - depth[i - w]) : Infinity;
      const horizontal = rightDelta < threshold && rightDelta <= leftDelta ? i + 1 : leftDelta < threshold ? i - 1 : -1;
      const vertical = downDelta < threshold && downDelta <= upDelta ? i + w : upDelta < threshold ? i - w : -1;
      if (horizontal >= 0) {
        const q = horizontal * 3, direction = horizontal > i ? 1 : -1;
        rx = (pos[q] - px) * direction; ry = (pos[q + 1] - py) * direction; rz = (pos[q + 2] - pz) * direction;
      }
      if (vertical >= 0) {
        const q = vertical * 3, direction = vertical > i ? 1 : -1;
        dx = (pos[q] - px) * direction; dy = (pos[q + 1] - py) * direction; dz = (pos[q + 2] - pz) * direction;
      }
      let nx = dy * rz - dz * ry, ny = dz * rx - dx * rz, nz = dx * ry - dy * rx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // Perspective rays converge on the eye, so highlights and rim response need
      // a per-pixel view direction. The painter clamps its near projection to an
      // orthographic scale; mirror that behavior rather than inventing a new lens.
      let viewX = cameraForwardX, viewY = cameraForwardY, viewZ = cameraForwardZ;
      if (perspective && 1 - z * lens > 0.3) {
        viewX -= (px - target[0]) * lens;
        viewY -= (py - target[1]) * lens;
        viewZ -= (pz - target[2]) * lens;
        const length = Math.hypot(viewX, viewY, viewZ) || 1;
        viewX /= length; viewY /= length; viewZ /= length;
      }
      // Derivative winding must face the actual eye, including off-axis pixels.
      if (nx * viewX + ny * viewY + nz * viewZ < 0) {
        nx = -nx; ny = -ny; nz = -nz;
      }
      normals[j] = nx; normals[j + 1] = ny; normals[j + 2] = nz;
      const facing = clamp(nx * viewX + ny * viewY + nz * viewZ);
      const material = color[i];
      const ar = LINEAR[material & 255], ag = LINEAR[(material >>> 8) & 255], ab = LINEAR[(material >>> 16) & 255];
      for (const l of descriptors) {
        let vx = l.x - px, vy = l.y - py, vz = l.z - pz;
        const distance2 = vx * vx + vy * vy + vz * vz;
        if (distance2 >= l.r2) continue;
        const dist = Math.sqrt(distance2) || 1e-5;
        vx /= dist; vy /= dist; vz /= dist;
        const diffuse = Math.max(0, nx * vx + ny * vy + nz * vz);
        const hx = vx + viewX, hy = vy + viewY, hz = vz + viewZ;
        const hl = Math.hypot(hx, hy, hz) || 1;
        const spec = diffuse > 0 ? Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 24 * l.specular : 0;
        const rim = (1 - facing) ** 3 * l.rim;
        const t = 1 - distance2 / l.r2;
        const attenuation = t * t / (1 + distance2 * 0.06) * l.intensity;
        const surface = 0.12 + 0.88 * diffuse;
        rad[j] += l.r * attenuation * (ar * surface + spec + rim);
        rad[j + 1] += l.g * attenuation * (ag * surface + spec + rim);
        rad[j + 2] += l.b * attenuation * (ab * surface + spec + rim);
      }
    }

    if (options.ambientOcclusion !== false) {
      const settings = options.ambientOcclusion ?? {};
      const radius = Math.max(1, Math.min(8, Math.floor(settings.radius ?? 3)));
      const intensity = Math.max(0, settings.intensity ?? 0.4);
      const bias = Math.max(1e-5, settings.bias ?? 0.09);
      const range = Math.max(1e-5, settings.range ?? 2), range2 = range * range;
      // Only geometry above the local surface may occlude it. Comparing raw
      // camera depth falsely shadows every tilted plane and distant overlaps.
      // Never darken pixels lacking geometry, and fade smoothly at the range limit.
      const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!Number.isFinite(depth[i])) continue;
        const j = i * 3;
        let occluded = 0;
        for (const [dx,dy] of offsets) {
          const xx = x + dx * radius, yy = y + dy * radius;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const neighbor = yy * w + xx;
          if (!Number.isFinite(depth[neighbor])) continue;
          const q = neighbor * 3;
          const vx = pos[q] - pos[j], vy = pos[q + 1] - pos[j + 1], vz = pos[q + 2] - pos[j + 2];
          const distance2 = vx * vx + vy * vy + vz * vz;
          if (distance2 >= range2) continue;
          const height = vx * normals[j] + vy * normals[j + 1] + vz * normals[j + 2] - bias;
          if (height > 0) occluded += clamp(height / (radius * 0.4 + 0.2)) * (1 - distance2 / range2) ** 2;
        }
        ao[i] = Math.max(0.2, 1 - intensity * occluded / offsets.length);
      }
    }
    return { radiance: rad, occlusion: ao };
  }
}
