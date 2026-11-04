import { type Vec3, clamp3, smooth3, cross3, sub3, norm3, dot3 } from "./math.js";
import { type Color3D } from "./frame.js";
import { Painter3D } from "./painter.js";

export interface FragmentMesh3D {
  /** Local-space vertices and outward-wound triangles. Share geometry between fragments if useful. */
  vertices: readonly Vec3[];
  faces: readonly (readonly [number, number, number])[];
}
export interface FragmentSpec3D {
  mesh: FragmentMesh3D;
  position: Vec3;
  velocity: Vec3;
  rotation?: Vec3;
  angularVelocity?: Vec3;
  palette: readonly Color3D[];
  life: number;
  gravity?: number;
  drag?: number;
  bounce?: number;
  friction?: number;
  /** Fraction of lifetime at which solid fragments begin shrinking, instead of alpha-fading. */
  meltStart?: number;
}
export interface Fragment3D {
  mesh: FragmentMesh3D;
  position: [number, number, number];
  velocity: [number, number, number];
  rotation: [number, number, number];
  angularVelocity: [number, number, number];
  palette: readonly Color3D[];
  life: number; maxLife: number;
  gravity: number; drag: number; bounce: number; friction: number; meltStart: number;
  resting: boolean;
  settleTime: number;
  settleFrom: Vec3;
  settleTo: Vec3;
}

/** Local XYZ Euler rotation, then translation. Geometry stays genuinely 3D under any camera. */
export function transformFragment3D(point: Vec3, position: Vec3, rotation: Vec3, scale = 1): Vec3 {
  const [rx, ry, rz] = rotation, sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
  const x = point[0] * scale, y = point[1] * scale, z = point[2] * scale;
  const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
  return [position[0] + x2 * cz - y1 * sz, position[1] + x2 * sz + y1 * cz, position[2] + z2];
}

/** Draw closed faceted solids with palette steps, never camera-facing strokes. */
export function drawFragment3D(painter: Painter3D, mesh: FragmentMesh3D, position: Vec3, rotation: Vec3, palette: readonly Color3D[], scale = 1) {
  if (scale <= 0 || palette.length === 0) return;
  const vertices = mesh.vertices.map(v => transformFragment3D(v, position, rotation, scale));
  for (const [a, b, c] of mesh.faces) painter.facet(vertices[a], vertices[b], vertices[c], palette);
}


/** Choose a broad support face and the nearest equivalent Euler pose that puts it on the floor.
 * The short post-bounce easing is art-directed settling, not a rigid-body contact solver. */
export function restingRotation3D(mesh: FragmentMesh3D, current: Vec3): Vec3 {
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  let best: Vec3 = current, score = Infinity;
  const faces = mesh.faces.map(([a, b, c]) => {
    const cross = cross3(sub3(mesh.vertices[b], mesh.vertices[a]), sub3(mesh.vertices[c], mesh.vertices[a]));
    return { area: Math.hypot(...cross), normal: norm3(cross), anchor: mesh.vertices[a] };
  });
  const max = Math.max(0, ...faces.map(f => f.area));
  for (const { area, normal: n, anchor } of faces) {
    if (area < max * 0.25 || area === 0) continue;
    // Resolve inconsistent triangle winding, but only accept outward support planes.
    for (const sign of [-1, 1]) {
      const nx = n[0] * sign, ny = n[1] * sign, nz = n[2] * sign;
      if (mesh.vertices.some(v => dot3([nx, ny, nz], sub3(v, anchor)) > 1e-6)) continue;
      const rotation = [Math.atan2(-nz, ny), 0, Math.atan2(-nx, -Math.hypot(ny, nz))];
      const delta = rotation.map((v, i) => wrap(v - current[i]));
      const cost = Math.hypot(...delta) / (0.5 + area / max);
      if (cost < score) { score = cost; best = delta.map((v, i) => current[i] + v) as unknown as Vec3; }
    }
  }
  return best;
}

/** Fixed-step mesh debris with tumbling, actual vertex-floor contact, bounce and stable resting. */
export class Fragments3D {
  readonly list: Fragment3D[] = [];
  constructor(public ground = 0, public limit = 256) {}
  spawn(spec: FragmentSpec3D): Fragment3D | undefined {
    if (this.list.length >= this.limit || spec.life <= 0 || spec.palette.length === 0) return;
    const f: Fragment3D = {
      mesh: spec.mesh, position: [...spec.position], velocity: [...spec.velocity],
      rotation: [...(spec.rotation ?? [0, 0, 0])], angularVelocity: [...(spec.angularVelocity ?? [0, 0, 0])],
      palette: spec.palette, life: spec.life, maxLife: spec.life,
      gravity: spec.gravity ?? 9.8, drag: Math.max(0, spec.drag ?? 0.2),
      bounce: clamp3(spec.bounce ?? 0.24), friction: clamp3(spec.friction ?? 0.72),
      meltStart: clamp3(spec.meltStart ?? 0.7, 0, 0.999), resting: false,
      settleTime: 0, settleFrom: [0, 0, 0], settleTo: [0, 0, 0],
    };
    this.list.push(f);
    return f;
  }
  clear() { this.list.length = 0; }
  scale(fragment: Fragment3D) {
    return 1 - smooth3(fragment.meltStart, 1, 1 - fragment.life / fragment.maxLife);
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    if (dt === 0) return;
    let write = 0;
    for (const f of this.list) {
      f.life -= dt;
      if (f.life <= 0) continue;
      if (!f.resting) {
        const damping = Math.exp(-f.drag * dt);
        const travel = f.drag === 0 ? dt : -Math.expm1(-f.drag * dt) / f.drag;
        const z = f.drag * dt;
        const fall = Math.abs(z) < 1e-3 ? dt * dt * (0.5 - z / 6 + z * z / 24) : (dt - travel) / f.drag;
        for (let i = 0; i < 3; i++) {
          f.position[i] += f.velocity[i] * travel;
          f.velocity[i] *= damping;
          f.rotation[i] += f.angularVelocity[i] * dt;
        }
        f.position[1] -= f.gravity * fall;
        f.velocity[1] -= f.gravity * travel;
      }
      if (f.resting && f.settleTime < 0.24) {
        f.settleTime = Math.min(0.24, f.settleTime + dt);
        const u = smooth3(0, 0.24, f.settleTime);
        for (let i = 0; i < 3; i++) f.rotation[i] = f.settleFrom[i] + (f.settleTo[i] - f.settleFrom[i]) * u;
      }
      // Use the lowest transformed vertex, not the mesh center or an oversized bounding sphere.
      let bottom = Infinity;
      for (const v of f.mesh.vertices) bottom = Math.min(bottom, transformFragment3D(v, [0, 0, 0], f.rotation, this.scale(f))[1]);
      if (Number.isFinite(bottom) && (f.position[1] + bottom < this.ground || f.resting)) {
        f.position[1] = this.ground - bottom;
        if (!f.resting && f.velocity[1] < 0) {
          f.velocity[1] = -f.velocity[1] * f.bounce;
          f.velocity[0] *= 1 - f.friction; f.velocity[2] *= 1 - f.friction;
          for (let i = 0; i < 3; i++) f.angularVelocity[i] *= 1 - f.friction;
          if (f.velocity[1] < 0.48) {
            f.resting = true;
            f.settleFrom = [...f.rotation];
            f.settleTo = restingRotation3D(f.mesh, f.rotation);
            f.velocity.fill(0); f.angularVelocity.fill(0);
          }
        }
      }
      this.list[write++] = f;
    }
    this.list.length = write;
  }
  draw(painter: Painter3D) {
    for (const f of this.list) drawFragment3D(painter, f.mesh, f.position, f.rotation, f.palette, this.scale(f));
  }
}
