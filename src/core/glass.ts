import { Rng, clamp, lerp, TAU } from "./math.js";

export type GlassPoint = readonly [number, number];
export interface GlassBounds { left: number; top: number; right: number; bottom: number }
export interface GlassCell { readonly polygon: readonly GlassPoint[]; readonly center: GlassPoint; readonly area: number; readonly ring: number; readonly spoke: number }
export interface GlassFracture { readonly cells: readonly GlassCell[]; readonly cracks: readonly (readonly [GlassPoint, GlassPoint])[] }
export interface GlassFractureOptions { seed?: number; spokes?: number; rings?: number }

function areaCenter(p: GlassPoint[]): { area: number; center: [number, number] } {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], cross = a[0] * b[1] - b[0] * a[1];
    area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  }
  return { area: area / 2, center: [x / (3 * area), y / (3 * area)] };
}
function clip(p: GlassPoint[], axis: 0 | 1, boundary: number, sign: number): GlassPoint[] {
  const out: GlassPoint[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], da = (a[axis] - boundary) * sign, db = (b[axis] - boundary) * sign;
    if (da <= 1e-10) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const u = da / (da - db); out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]); }
  }
  return out.filter((a, i) => { const b = out[(i + 1) % out.length]; return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-8; });
}
const freezePoint = (p: GlassPoint): GlassPoint => Object.freeze([p[0], p[1]]) as GlassPoint;

/** Fitted spiderweb fracture of a rectangular sheet. Long radial splinters and cross cracks
 * preserve the whole sheet, unlike unrelated diamond particles or equant stone chunks.
 * Seeded topology; the outer radial ring extends beyond all four corners before clipping. */
export function fractureGlass(bounds: GlassBounds, impact: GlassPoint, options: GlassFractureOptions = {}): GlassFracture {
  const { left, top, right, bottom } = bounds, { seed = 1, spokes = 12, rings = 3 } = options;
  if (![left, top, right, bottom, seed, ...impact].every(v => Number.isFinite(v) && Math.abs(v) <= 1e5)
    || impact.length !== 2 || right - left < 1 || bottom - top < 1 || !Number.isInteger(spokes) || spokes < 6 || spokes > 32
    || !Number.isInteger(rings) || rings < 1 || rings > 5 || impact[0] <= left || impact[0] >= right || impact[1] <= top || impact[1] >= bottom)
    throw new RangeError("Glass needs finite bounds, an interior impact, 6..32 spokes and 1..5 rings");
  const rng = new Rng(seed), step = TAU / spokes, phase = rng.range(0, step);
  const angles = Array.from({ length: spokes }, (_, i) => phase + step * (i + rng.range(-.18, .18)));
  const radius = Math.max(...[[left, top], [right, top], [right, bottom], [left, bottom]].map(p => Math.hypot(p[0] - impact[0], p[1] - impact[1])));
  // Nested homothetic rings keep all cells convex while maintaining irregular radial lengths.
  const outer = angles.map(a => [impact[0] + Math.cos(a) * radius * 1.7, impact[1] + Math.sin(a) * radius * 1.7] as GlassPoint);
  const fractions = Array.from({ length: rings }, (_, i) => Math.pow((i + 1) / (rings + 1), 1.9) * .48);
  const levels: GlassPoint[][] = [Array.from({ length: spokes }, () => [impact[0], impact[1]] as GlassPoint),
    ...[...fractions, 1].map(f => outer.map(p => [lerp(impact[0], p[0], f), lerp(impact[1], p[1], f)] as GlassPoint))];
  const cells: GlassCell[] = [], cracks: (readonly [GlassPoint, GlassPoint])[] = [], seen = new Set<string>();
  for (let ring = 0; ring + 1 < levels.length; ring++) for (let i = 0; i < spokes; i++) {
    const next = (i + 1) % spokes;
    let polygon: GlassPoint[] = ring === 0 ? [impact, levels[1][i], levels[1][next]] : [levels[ring][i], levels[ring + 1][i], levels[ring + 1][next], levels[ring][next]];
    for (const [axis, edge, sign] of [[0, left, -1], [0, right, 1], [1, top, -1], [1, bottom, 1]] as const) polygon = clip(polygon, axis, edge, sign);
    if (polygon.length < 3) continue;
    const c = areaCenter(polygon); if (c.area <= 1e-7) continue;
    const frozen = Object.freeze(polygon.map(freezePoint));
    cells.push(Object.freeze({ polygon: frozen, center: freezePoint(c.center), area: c.area, ring, spoke: i }));
    for (let k = 0; k < polygon.length; k++) {
      const a = polygon[k], b = polygon[(k + 1) % polygon.length];
      if ([left, right].some(x => Math.abs(a[0] - x) < 1e-7 && Math.abs(b[0] - x) < 1e-7)
        || [top, bottom].some(y => Math.abs(a[1] - y) < 1e-7 && Math.abs(b[1] - y) < 1e-7)) continue;
      const keys = [a, b].map(p => p.map(v => v.toFixed(6)).join(",")).sort(), key = keys.join("|");
      if (!seen.has(key)) { seen.add(key); cracks.push(Object.freeze([freezePoint(a), freezePoint(b)])); }
    }
  }
  return Object.freeze({ cells: Object.freeze(cells), cracks: Object.freeze(cracks) });
}

export interface GlassLaunch { x: number; y: number; vx: number; vy: number; angle?: number; spin?: number; tumble?: number; tumbleSpeed?: number }
export interface GlassPathOptions { duration?: number; gravity?: number; drag?: number; bounce?: number; friction?: number; ground?: number }
export interface GlassPose { x: number; y: number; vx: number; vy: number; angle: number; tumble: number; flatten: number; resting: boolean }
export interface GlassCollision { readonly time: number; readonly x: number; readonly y: number; readonly speed: number }
export interface GlassPath { readonly duration: number; readonly impacts: readonly GlassCollision[]; sample(time: number): GlassPose }

/** Project an infinitesimally thin pane, retaining its edge-on silhouette instead of adding block sides. */
export function glassVertices(vertices: readonly GlassPoint[], pose: GlassPose): [number, number][] {
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle), turn = Math.cos(pose.tumble);
  return vertices.map(([x, y]) => [pose.x + x * turn * c - y * s, pose.y + (x * turn * s + y * c) * pose.flatten]);
}

/** Baked 240 Hz light sheet motion. Shape support (including tumble) controls plane contacts.
 * Contacts report the actual lowest vertex, not the center; settling flattens the sheet smoothly.
 * Seed-independent physics, seekable samples, no random draws or emissions at render time.
 * This is VFX plane collision, not mesh/body collision or a general rigid-body solver. */
export function glassShardPath(vertices: readonly GlassPoint[], launch: GlassLaunch, options: GlassPathOptions = {}): GlassPath {
  const { duration = 2.5, gravity = 420, drag = .6, bounce = .26, friction = .62, ground = 0 } = options;
  const { x, y, vx, vy, angle = 0, spin = 0, tumble = 0, tumbleSpeed = 0 } = launch;
  if (!vertices.length || vertices.length > 32 || vertices.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 1e4))
    || ![x, y, vx, vy, angle, spin, tumble, tumbleSpeed, duration, gravity, drag, bounce, friction, ground].every(v => Number.isFinite(v) && Math.abs(v) <= 1e5)
    || duration <= 0 || duration > 12 || gravity <= 0 || drag < 0 || bounce < 0 || bounce >= 1 || friction < 0 || friction > 1)
    throw new RangeError("Glass motion needs bounded finite values, duration 0..12, gravity > 0, drag >= 0, bounce [0,1), friction [0,1]");
  const shape = vertices.map(p => [...p] as GlassPoint), steps = Math.ceil(duration * 240), dt = duration / steps;
  const pose: GlassPose = { x, y, vx, vy, angle, tumble, flatten: 1, resting: false }, impacts: GlassCollision[] = [];
  let spinNow = spin, tumbleNow = tumbleSpeed, settlingAt = -1, settleAngle = angle, settleTumble = tumble;
  const support = (p: GlassPose) => glassVertices(shape, { ...p, x: 0, y: 0 }).reduce((a, b) => a[1] > b[1] ? a : b);
  pose.y = Math.min(pose.y, ground - support(pose)[1]);
  const frames: GlassPose[] = [{ ...pose }];
  for (let i = 1; i <= steps; i++) {
    if (settlingAt >= 0) {
      const u = clamp((i * dt - settlingAt) / .16), eased = u * u * (3 - 2 * u);
      pose.angle = lerp(settleAngle, Math.round(settleAngle / Math.PI) * Math.PI, eased);
      pose.tumble = lerp(settleTumble, Math.round(settleTumble / TAU) * TAU, eased); pose.flatten = lerp(1, .16, eased);
      pose.x += pose.vx * dt; pose.vx *= Math.exp(-dt * 22); pose.y = ground - support(pose)[1];
      if (u === 1) { pose.resting = true; pose.vx = 0; }
    } else {
      pose.x += pose.vx * dt; pose.y += pose.vy * dt + .5 * gravity * dt * dt; pose.vy += gravity * dt;
      pose.vx *= Math.exp(-drag * dt); pose.angle += spinNow * dt; pose.tumble += tumbleNow * dt;
      const lowest = support(pose), floor = ground - lowest[1];
      if (pose.y >= floor && pose.vy > 0) {
        pose.y = floor; impacts.push(Object.freeze({ time: i * dt, x: pose.x + lowest[0], y: ground, speed: pose.vy }));
        pose.vx *= 1 - friction; spinNow *= -.32; tumbleNow *= .4;
        if (pose.vy * bounce < 26 || impacts.length >= 3) { settlingAt = i * dt; settleAngle = pose.angle; settleTumble = pose.tumble; pose.vy = 0; }
        else pose.vy *= -bounce;
      } else if (pose.y > floor) pose.y = floor;
    }
    frames.push({ ...pose });
  }
  return Object.freeze({ duration, impacts: Object.freeze(impacts), sample(time: number): GlassPose {
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Glass sample time must be finite and non-negative");
    const f = Math.min(time / dt, steps), i = Math.floor(f), a = frames[i], b = frames[Math.min(i + 1, steps)], u = f - i;
    const p: GlassPose = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), vx: lerp(a.vx, b.vx, u), vy: lerp(a.vy, b.vy, u),
      angle: lerp(a.angle, b.angle, u), tumble: lerp(a.tumble, b.tumble, u), flatten: lerp(a.flatten, b.flatten, u), resting: a.resting };
    p.y = Math.min(p.y, ground - support(p)[1]); return p;
  } });
}
