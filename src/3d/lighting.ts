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
  radius?: number;
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
  private radiance = new Float32Array(0);
  private occlusion = new Float32Array(0);
  private cacheW = 0;
  private cacheH = 0;

  private prepare(w: number, h: number) {
    if (w === this.cacheW && h === this.cacheH) return;
    this.cacheW = w; this.cacheH = h;
    this.positions = new Float32Array(w * h * 3);
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
    const pos = this.positions, rad = this.radiance, ao = this.occlusion;
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

      // Estimate a normal from nearby depth samples. At silhouette boundaries
      // use camera-aligned tangents instead of bridging two unrelated surfaces.
      const s = scale * (perspective ? 1 / Math.max(0.3, 1 - z * lens) : 1);
      let rx = cy / s, ry = 0, rz = -sy / s;
      let dx = sy * se / s, dy = -ce / s, dz = cy * se / s;
      const right = x + 1 < w ? i + 1 : i - 1;
      const down = y + 1 < h ? i + w : i - w;
      if (x + 1 < w && Number.isFinite(depth[right]) && Math.abs(z - depth[right]) < threshold) {
        const q = right * 3; rx = pos[q] - px; ry = pos[q + 1] - py; rz = pos[q + 2] - pz;
      } else if (x > 0 && Number.isFinite(depth[right]) && Math.abs(z - depth[right]) < threshold) {
        const q = right * 3; rx = px - pos[q]; ry = py - pos[q + 1]; rz = pz - pos[q + 2];
      }
      if (y + 1 < h && Number.isFinite(depth[down]) && Math.abs(z - depth[down]) < threshold) {
        const q = down * 3; dx = pos[q] - px; dy = pos[q + 1] - py; dz = pos[q + 2] - pz;
      } else if (y > 0 && Number.isFinite(depth[down]) && Math.abs(z - depth[down]) < threshold) {
        const q = down * 3; dx = px - pos[q]; dy = py - pos[q + 1]; dz = pz - pos[q + 2];
      }
      let nx = dy * rz - dz * ry, ny = dz * rx - dx * rz, nz = dx * ry - dy * rx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // Reverse accidentally backfacing screen-space derivatives.
      if (nx * cameraForwardX + ny * cameraForwardY + nz * cameraForwardZ < 0) {
        nx = -nx; ny = -ny; nz = -nz;
      }
      const facing = clamp(nx * cameraForwardX + ny * cameraForwardY + nz * cameraForwardZ);
      const material = color[i];
      const ar = LINEAR[material & 255], ag = LINEAR[(material >>> 8) & 255], ab = LINEAR[(material >>> 16) & 255];
      for (const l of descriptors) {
        let vx = l.x - px, vy = l.y - py, vz = l.z - pz;
        const distance2 = vx * vx + vy * vy + vz * vz;
        if (distance2 >= l.r2) continue;
        const dist = Math.sqrt(distance2) || 1e-5;
        vx /= dist; vy /= dist; vz /= dist;
        const diffuse = Math.max(0, nx * vx + ny * vy + nz * vz);
        const hx = vx + cameraForwardX, hy = vy + cameraForwardY, hz = vz + cameraForwardZ;
        const hl = Math.hypot(hx, hy, hz) || 1;
        const spec = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 24 * l.specular;
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
      const bias = Math.max(0, settings.bias ?? 0.09);
      // Depth discontinuity occlusion. Never darken pixels lacking geometry.
      const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!Number.isFinite(depth[i])) continue;
        let occluded = 0;
        for (const [dx,dy] of offsets) {
          const xx = x + dx * radius, yy = y + dy * radius;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const delta = depth[yy * w + xx] - depth[i] - bias;
          if (delta > 0 && Number.isFinite(delta)) occluded += clamp(delta / (radius * 0.4 + 0.2));
        }
        ao[i] = Math.max(0.2, 1 - intensity * occluded / offsets.length);
      }
    }
    return { radiance: rad, occlusion: ao };
  }
}
