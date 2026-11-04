/** Curved energy membranes and surface-distance impulses. World units, seconds, radians. */
import type { Color3D } from "./frame.js";
import type { Painter3D } from "./painter.js";
import { type Vec3, add3, sub3, mul3, dot3, cross3, norm3, len3, clamp3, smooth3, TAU3 } from "./math.js";

export interface ShieldSurface3D {
  readonly apex: Vec3;
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly radius: number;
  readonly aperture: number;
  readonly capCos: number;
}
export interface ShieldImpact3D { readonly at: number; readonly normal: Vec3; readonly strength?: number }
export interface ShieldResponse3D { distance: number; age: number; crest: number; contact: number; displacement: number }
export const SHIELD_PALETTE_3D = ["#081a35", "#103553", "#145b78", "#188ba2", "#3bcbd3", "#9cebe4", "#edffec"] as const;
const finite3 = (v: Vec3) => v.every(Number.isFinite);

/** A spherical cap facing normal, with a stable tangent basis; aperture is its projected disk radius. */
export function createShieldSurface3D(apex: Vec3, normal: Vec3, radius = 4, aperture = 2.8): ShieldSurface3D {
  if (!finite3(apex) || !finite3(normal) || len3(normal) < 1e-8 || !Number.isFinite(radius) || !Number.isFinite(aperture) || radius <= 0 || aperture <= 0 || aperture >= radius) throw new RangeError("Shield cap needs finite vectors and 0 < aperture < radius");
  const n = norm3(normal), u = norm3(cross3(Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], n)), v = cross3(n, u);
  return { apex: [...apex], center: sub3(apex, mul3(n, radius)), normal: n, u, v, radius, aperture, capCos: Math.sqrt(1 - (aperture / radius) ** 2) };
}
/** Surface normal from tangent-plane coordinates; returns null outside the circular membrane. */
export function shieldNormal3D(surface: ShieldSurface3D, u: number, v: number): Vec3 | null {
  const d2 = u * u + v * v;
  if (!Number.isFinite(d2) || d2 > surface.aperture ** 2 + 1e-8) return null;
  return norm3(add3(add3(mul3(surface.u, u), mul3(surface.v, v)), mul3(surface.normal, Math.sqrt(Math.max(0, surface.radius ** 2 - d2)))));
}
export function shieldPoint3D(surface: ShieldSurface3D, normal: Vec3, displacement = 0): Vec3 {
  return add3(surface.center, mul3(normal, surface.radius + displacement));
}
export function shieldDistance3D(surface: ShieldSurface3D, a: Vec3, b: Vec3): number {
  return Math.acos(clamp3(dot3(norm3(a), norm3(b)), -1, 1)) * surface.radius;
}
/** A causal damped traveling crest and compact local dent. No response exists before a hit. */
export function shieldResponse3D(surface: ShieldSurface3D, normal: Vec3, hit: ShieldImpact3D, time: number, speed = 4.8): ShieldResponse3D {
  const distance = shieldDistance3D(surface, normal, hit.normal), age = time - hit.at;
  if (age < 0 || !Number.isFinite(age) || !Number.isFinite(speed) || speed <= 0) return { distance, age, crest: 0, contact: 0, displacement: 0 };
  const strength = clamp3(Number.isFinite(hit.strength ?? 1) ? hit.strength ?? 1 : 1, 0, 3), front = age * speed;
  const width = 0.13 + age * 0.05, delta = distance - front;
  // Keep the front causal. Its tiny leading skirt is bounded to one visible raster-width.
  const crest = (Math.abs(delta) <= width * 3 ? Math.exp(-((delta / width) ** 2)) : 0) * Math.exp(-age * 1.75) * smooth3(0, 0.035, age) * strength;
  const contact = Math.exp(-((distance / 0.55) ** 2) - age * 13) * strength;
  const displacement = -0.20 * contact + 0.10 * crest - 0.035 * Math.exp(-(((delta + 0.22) / 0.22) ** 2) - age * 2.2) * strength;
  return { distance, age, crest, contact, displacement };
}
/** A ring on the curved surface, clipped to the same cap. Unlike a planar circle, it wraps in XYZ. */
export function shieldRipple3D(surface: ShieldSurface3D, hitNormal: Vec3, distance: number, segments = 96): (Vec3 | null)[] {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isInteger(segments) || segments < 8 || segments > 1024) throw new RangeError("Ripple needs non-negative distance and 8..1024 integer segments");
  if (!finite3(hitNormal) || len3(hitNormal) < 1e-8) throw new RangeError("Ripple normal must be finite and nonzero");
  if (distance > Math.PI * surface.radius) return Array(segments + 1).fill(null);
  const n = norm3(hitNormal), u = norm3(cross3(Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], n)), v = cross3(n, u), angle = distance / surface.radius;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = i / segments * TAU3;
    const q = add3(mul3(n, Math.cos(angle)), mul3(add3(mul3(u, Math.cos(a)), mul3(v, Math.sin(a))), Math.sin(angle)));
    return dot3(q, surface.normal) >= surface.capCos - 1e-8 ? q : null;
  });
}

export interface DrawShieldSurfaceOptions3D {
  visibility: number;
  time: number;
  impacts?: readonly ShieldImpact3D[];
  palette?: readonly Color3D[];
  emission?: number;
  cellSize?: number;
}
/** Draw a continuous dark membrane, attached hex cells and its finite curved boundary. */
export function drawShieldSurface3D(p: Painter3D, surface: ShieldSurface3D, options: DrawShieldSurfaceOptions3D) {
  const visibility = clamp3(options.visibility), impacts = options.impacts ?? [], palette = options.palette?.length ? options.palette : SHIELD_PALETTE_3D;
  if (!visibility) return;
  const tone = (q: number) => palette[Math.round(clamp3(q) * (palette.length - 1))], emission = clamp3(Number.isFinite(options.emission ?? 0.2) ? options.emission ?? 0.2 : 0.2, 0, 4);
  const responses = new Map<Vec3, { crest: number; contact: number; displacement: number }>();
  const response = (n: Vec3) => {
    const known = responses.get(n); if (known) return known;
    const value = impacts.reduce((r, hit) => { const q = shieldResponse3D(surface, n, hit, options.time); r.crest += q.crest; r.contact += q.contact; r.displacement += q.displacement; return r; }, { crest: 0, contact: 0, displacement: 0 });
    responses.set(n, value); return value;
  };
  const point = (n: Vec3, offset = 0) => shieldPoint3D(surface, n, response(n).displacement + offset);
  // Sort translucent triangles back-to-front for both sides of an orbit. Surface is not a billboard.
  const mesh: { a: Vec3; b: Vec3; c: Vec3; normal: Vec3; depth: number }[] = [];
  const rings = 16, sides = 96;
  const normals = Array.from({ length: rings + 1 }, (_, ring) => Array.from({ length: sides }, (_, i) => shieldNormal3D(surface, Math.cos(i / sides * TAU3) * surface.aperture * ring / rings, Math.sin(i / sides * TAU3) * surface.aperture * ring / rings)!));
  const addTriangle = (a: Vec3, b: Vec3, c: Vec3) => { const A = point(a), B = point(b), C = point(c), normal = norm3(add3(add3(a, b), c)); mesh.push({ a: A, b: B, c: C, normal, depth: (p.project(A).depth + p.project(B).depth + p.project(C).depth) / 3 }); };
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) { const k = (i + 1) % sides; addTriangle(normals[j][i], normals[j + 1][i], normals[j + 1][k]); if (j) addTriangle(normals[j][i], normals[j + 1][k], normals[j][k]); }
  mesh.sort((a, b) => a.depth - b.depth);
  for (const face of mesh) {
    const local = response(face.normal), facing = dot3(face.normal, surface.normal), edge = smooth3(0.82, surface.capCos, facing);
    const lit = clamp3(dot3(face.normal, norm3([-0.5, 0.8, 0.5])));
    const q = 0.12 + lit * 0.12 + edge * 0.04 + Math.min(0.34, local.crest * 0.12 + local.contact * 0.30);
    p.triangle(face.a, face.b, face.c, tone(q), (0.48 + edge * 0.14 + local.crest * 0.18) * visibility, local.contact * emission * 0.06);
  }
  // Hex topology is attached to the cap, never randomly regenerated during a hit.
  const size = clamp3(options.cellSize ?? 0.39, 0.22, 0.8), extent = Math.ceil(surface.aperture / size) + 1;
  const edges = new Map<string, { a: Vec3; b: Vec3; active: number }>();
  for (let row = -extent; row <= extent; row++) for (let col = -extent; col <= extent; col++) {
    const x = Math.sqrt(3) * size * (col + (row & 1) * 0.5), y = 1.5 * size * row;
    const center = shieldNormal3D(surface, x, y); if (!center) continue;
    const local = response(center), active = Math.min(1, local.crest * 2.0 + local.contact * 1.4);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6 + 1 / 12) * TAU3, b = ((k + 1) / 6 + 1 / 12) * TAU3;
      const na = shieldNormal3D(surface, x + Math.cos(a) * size, y + Math.sin(a) * size), nb = shieldNormal3D(surface, x + Math.cos(b) * size, y + Math.sin(b) * size);
      if (!na || !nb) continue;
      const key = [na, nb].map(n => n.map(v => Math.round(v * 1e7)).join(",")).sort().join("/");
      const previous = edges.get(key);
      if (previous) previous.active = Math.max(previous.active, active);
      else edges.set(key, { a: na, b: nb, active });
    }
  }
  // Shared cell edges are drawn once so neighboring hexagons cannot double a stroke’s light.
  for (const { a, b, active } of edges.values()) p.line(point(a, 0.018), point(b, 0.018), 0.014, tone(0.28 + active * 0.45), (0.13 + active * 0.58) * visibility, active * emission * 0.28);
  // A clean cyan lip establishes the energy membrane even with no hit or glow.
  for (let i = 0; i < sides; i++) {
    const a = normals[rings][i], b = normals[rings][(i + 1) % sides], local = response(a);
    p.line(point(a, 0.02), point(b, 0.02), 0.028, tone(0.52 + Math.max(0, dot3(a, norm3([-0.4, 0.6, 0.7]))) * 0.1 + Math.min(0.3, local.crest)), visibility * 0.86, emission * visibility * 0.3);
  }
}
