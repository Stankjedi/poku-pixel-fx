/** Curved energy membranes and surface-distance impulses. World units, seconds, radians. */
import type { Color3D } from "./frame.js";
import type { Painter3D, Projected3D } from "./painter.js";
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
  /** Active deployment aperture, bounded by surface.aperture; topology is reused as it changes. */
  aperture?: number;
}

const RINGS = 16, SIDES = 96, VERTICES = 1 + RINGS * SIDES;
const FACE_LIGHT = norm3([-0.5, 0.8, 0.5]), LIP_LIGHT = norm3([-0.4, 0.6, 0.7]);
const meshCoordinates: readonly (readonly [number, number])[] = [[0, 0], ...Array.from({ length: RINGS * SIDES }, (_, i) => {
  const angle = (i % SIDES) / SIDES * TAU3, r = (Math.floor(i / SIDES) + 1) / RINGS;
  return [Math.cos(angle) * r, Math.sin(angle) * r] as const;
})];
const meshIndices = (() => {
  const indices: number[] = [];
  for (let ring = 0; ring < RINGS; ring++) for (let i = 0; i < SIDES; i++) {
    const k = (i + 1) % SIDES, a = ring ? 1 + (ring - 1) * SIDES + i : 0;
    const b = 1 + ring * SIDES + i, c = 1 + ring * SIDES + k;
    indices.push(a, b, c);
    if (ring) indices.push(a, c, 1 + (ring - 1) * SIDES + k);
  }
  return new Uint16Array(indices);
})();
const FACES = meshIndices.length / 3;
interface ShieldEdge { a: number; b: number; cells: number[] }
type MutableVec3 = [number, number, number];
interface ShieldArena {
  cellSize: number; aperture: number;
  normals: MutableVec3[]; radiusSquared: number[]; edges: ShieldEdge[]; edgeVertices: number[];
  points: MutableVec3[]; projected: Projected3D[]; lipPoints: MutableVec3[]; lipProjected: Projected3D[];
  responses: Float64Array; distances: Float64Array; impactSnapshot: number[];
  faceDepth: Float64Array; order: number[];
}
const arenas = new WeakMap<ShieldSurface3D, ShieldArena>();
const emptyProjection = (): Projected3D => ({ x: 0, y: 0, depth: 0, scale: 0 });

function createArena(surface: ShieldSurface3D, cellSize: number): ShieldArena {
  const normals = Array.from({ length: VERTICES + FACES }, (): MutableVec3 => [0, 0, 0]);
  const radiusSquared = Array(normals.length).fill(0) as number[], nodes = new Map<string, number>(), edgeMap = new Map<string, ShieldEdge>(), edgeVertices = new Set<number>();
  const fixedNode = (x: number, y: number) => {
    const n = shieldNormal3D(surface, x, y); if (!n) return -1;
    const key = n.map(v => Math.round(v * 1e7)).join(",");
    const known = nodes.get(key); if (known !== undefined) return known;
    const index = normals.length; normals.push([n[0], n[1], n[2]]); radiusSquared.push(x * x + y * y); nodes.set(key, index); return index;
  };
  const extent = Math.ceil(surface.aperture / cellSize) + 1;
  for (let row = -extent; row <= extent; row++) for (let col = -extent; col <= extent; col++) {
    const x = Math.sqrt(3) * cellSize * (col + (row & 1) * 0.5), y = 1.5 * cellSize * row, center = fixedNode(x, y);
    if (center < 0) continue;
    for (let k = 0; k < 6; k++) {
      const aa = (k / 6 + 1 / 12) * TAU3, bb = ((k + 1) / 6 + 1 / 12) * TAU3;
      const a = fixedNode(x + Math.cos(aa) * cellSize, y + Math.sin(aa) * cellSize), b = fixedNode(x + Math.cos(bb) * cellSize, y + Math.sin(bb) * cellSize);
      if (a < 0 || b < 0) continue;
      const key = a < b ? `${a}/${b}` : `${b}/${a}`, prior = edgeMap.get(key);
      if (prior) prior.cells.push(center); else edgeMap.set(key, { a, b, cells: [center] });
      edgeVertices.add(a); edgeVertices.add(b);
    }
  }
  return { cellSize, aperture: -1, normals, radiusSquared, edges: [...edgeMap.values()], edgeVertices: [...edgeVertices],
    points: normals.map((): MutableVec3 => [0, 0, 0]), projected: normals.map(emptyProjection),
    lipPoints: Array.from({ length: SIDES }, (): MutableVec3 => [0, 0, 0]), lipProjected: Array.from({ length: SIDES }, emptyProjection),
    responses: new Float64Array(normals.length * 3), distances: new Float64Array(0), impactSnapshot: [],
    faceDepth: new Float64Array(FACES), order: Array.from({ length: FACES }, (_, i) => i) };
}

function prepareArena(arena: ShieldArena, surface: ShieldSurface3D, aperture: number, impacts: readonly ShieldImpact3D[], time: number) {
  let changed = arena.aperture !== aperture;
  if (changed) {
    arena.aperture = aperture;
    for (let i = 0; i < VERTICES; i++) {
      const [u, v] = meshCoordinates[i], x = u * aperture, y = v * aperture;
      const z = Math.sqrt(Math.max(0, surface.radius ** 2 - x * x - y * y)), n = arena.normals[i];
      for (let ch = 0; ch < 3; ch++) n[ch] = surface.u[ch] * x + surface.v[ch] * y + surface.normal[ch] * z;
      const length = Math.hypot(n[0], n[1], n[2]); for (let ch = 0; ch < 3; ch++) n[ch] /= length;
    }
    for (let face = 0; face < FACES; face++) {
      const a = arena.normals[meshIndices[face * 3]], b = arena.normals[meshIndices[face * 3 + 1]], c = arena.normals[meshIndices[face * 3 + 2]], n = arena.normals[VERTICES + face];
      for (let ch = 0; ch < 3; ch++) n[ch] = a[ch] + b[ch] + c[ch];
      const length = Math.hypot(n[0], n[1], n[2]); for (let ch = 0; ch < 3; ch++) n[ch] /= length;
    }
  }
  const count = impacts.length;
  if (arena.impactSnapshot.length !== count * 5) { arena.impactSnapshot.length = count * 5; changed = true; }
  for (let i = 0; i < count; i++) {
    const hit = impacts[i], values = [hit.at, hit.strength ?? 1, ...hit.normal];
    for (let k = 0; k < 5; k++) if (!Object.is(arena.impactSnapshot[i * 5 + k], values[k])) { arena.impactSnapshot[i * 5 + k] = values[k]; changed = true; }
  }
  const length = arena.normals.length * count;
  if (arena.distances.length !== length) arena.distances = new Float64Array(length);
  if (changed && count) {
    const hitNormals = impacts.map(hit => norm3(hit.normal));
    for (let n = 0; n < arena.normals.length; n++) for (let i = 0; i < count; i++)
      arena.distances[n * count + i] = Math.acos(clamp3(dot3(arena.normals[n], hitNormals[i]), -1, 1)) * surface.radius;
  }
  arena.responses.fill(0);
  for (let i = 0; i < count; i++) {
    const hit = impacts[i], age = time - hit.at; if (age < 0 || !Number.isFinite(age)) continue;
    const strength = clamp3(Number.isFinite(hit.strength ?? 1) ? hit.strength ?? 1 : 1, 0, 3), front = age * 4.8, width = 0.13 + age * 0.05;
    const crestDecay = Math.exp(-age * 1.75) * smooth3(0, 0.035, age) * strength;
    const contactDecay = Math.exp(-age * 13) * strength, tailDecay = Math.exp(-age * 2.2) * strength;
    for (let n = 0; n < arena.normals.length; n++) {
      const d = arena.distances[n * count + i], delta = d - front;
      const crest = (Math.abs(delta) <= width * 3 ? Math.exp(-((delta / width) ** 2)) : 0) * crestDecay;
      const contact = Math.exp(-((d / 0.55) ** 2)) * contactDecay, o = n * 3;
      arena.responses[o] += crest; arena.responses[o + 1] += contact;
      arena.responses[o + 2] += -0.20 * contact + 0.10 * crest - 0.035 * Math.exp(-(((delta + 0.22) / 0.22) ** 2)) * tailDecay;
    }
  }
}

/** Draw a continuous membrane using cached topology, response arrays and shared projections. */
export function drawShieldSurface3D(p: Painter3D, surface: ShieldSurface3D, options: DrawShieldSurfaceOptions3D) {
  const visibility = clamp3(options.visibility), aperture = clamp3(options.aperture ?? surface.aperture, 0, surface.aperture);
  if (!visibility || !aperture) return;
  const size = clamp3(options.cellSize ?? 0.39, 0.22, 0.8);
  let arena = arenas.get(surface);
  if (!arena || arena.cellSize !== size) { arena = createArena(surface, size); arenas.set(surface, arena); }
  prepareArena(arena, surface, aperture, options.impacts ?? [], options.time);
  const palette = options.palette?.length ? options.palette : SHIELD_PALETTE_3D, tone = (q: number) => palette[Math.round(clamp3(q) * (palette.length - 1))];
  const emission = clamp3(Number.isFinite(options.emission ?? 0.2) ? options.emission ?? 0.2 : 0.2, 0, 4);
  const { normals, responses, points, projected, faceDepth, order } = arena;
  const position = (node: number, offset: number, out: MutableVec3) => {
    const n = normals[node], radius = surface.radius + responses[node * 3 + 2] + offset;
    out[0] = surface.center[0] + n[0] * radius; out[1] = surface.center[1] + n[1] * radius; out[2] = surface.center[2] + n[2] * radius;
  };
  for (let i = 0; i < VERTICES; i++) { position(i, 0, points[i]); projected[i] = p.project(points[i], projected[i]); }
  for (let i = 0; i < FACES; i++) faceDepth[i] = (projected[meshIndices[i * 3]].depth + projected[meshIndices[i * 3 + 1]].depth + projected[meshIndices[i * 3 + 2]].depth) / 3;
  order.sort((a, b) => faceDepth[a] - faceDepth[b] || a - b);
  const capCos = Math.sqrt(1 - (aperture / surface.radius) ** 2);
  for (const face of order) {
    const node = VERTICES + face, n = normals[node], crest = responses[node * 3], contact = responses[node * 3 + 1];
    const edge = smooth3(0.82, capCos, dot3(n, surface.normal)), lit = clamp3(dot3(n, FACE_LIGHT));
    const color = tone(0.12 + lit * 0.12 + edge * 0.04 + Math.min(0.34, crest * 0.12 + contact * 0.30));
    const a = meshIndices[face * 3], b = meshIndices[face * 3 + 1], c = meshIndices[face * 3 + 2], alpha = (0.48 + edge * 0.14 + crest * 0.18) * visibility;
    if (p.triangleProjected) p.triangleProjected(projected[a], projected[b], projected[c], color, alpha, contact * emission * 0.06);
    else p.triangle(points[a], points[b], points[c], color, alpha, contact * emission * 0.06);
  }
  const r2 = aperture * aperture + 1e-8;
  for (const i of arena.edgeVertices) if (arena.radiusSquared[i] <= r2) { position(i, 0.018, points[i]); projected[i] = p.project(points[i], projected[i]); }
  for (const edge of arena.edges) {
    if (arena.radiusSquared[edge.a] > r2 || arena.radiusSquared[edge.b] > r2) continue;
    let active = -1;
    for (const cell of edge.cells) if (arena.radiusSquared[cell] <= r2) active = Math.max(active, Math.min(1, responses[cell * 3] * 2 + responses[cell * 3 + 1] * 1.4));
    if (active < 0) continue;
    const color = tone(0.28 + active * 0.45), alpha = (0.13 + active * 0.58) * visibility, light = active * emission * 0.28;
    if (p.lineProjected) p.lineProjected(projected[edge.a], projected[edge.b], 0.014, color, alpha, light);
    else p.line(points[edge.a], points[edge.b], 0.014, color, alpha, light);
  }
  const rim = 1 + (RINGS - 1) * SIDES;
  for (let i = 0; i < SIDES; i++) { position(rim + i, 0.02, arena.lipPoints[i]); arena.lipProjected[i] = p.project(arena.lipPoints[i], arena.lipProjected[i]); }
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES, n = normals[rim + i], color = tone(0.52 + Math.max(0, dot3(n, LIP_LIGHT)) * 0.1 + Math.min(0.3, responses[(rim + i) * 3]));
    if (p.lineProjected) p.lineProjected(arena.lipProjected[i], arena.lipProjected[j], 0.028, color, visibility * 0.86, emission * visibility * 0.3);
    else p.line(arena.lipPoints[i], arena.lipPoints[j], 0.028, color, visibility * 0.86, emission * visibility * 0.3);
  }
}
