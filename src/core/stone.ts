import { Rng, lerp } from "./math.js";

export type StonePoint = readonly [number, number];
export interface StoneCell {
  /** Convex, counterclockwise vertices in the original stone's coordinates. */
  polygon: [number, number][];
  center: [number, number];
  area: number;
}
export interface FractureOptions { seed?: number; pieces?: number; minArea?: number }

function cell(polygon: [number, number][]): StoneCell {
  let twiceArea = 0, x = 0, y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  }
  return { polygon, area: twiceArea / 2, center: [x / (3 * twiceArea), y / (3 * twiceArea)] };
}
function clip(polygon: StonePoint[], nx: number, ny: number, d: number): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a[0] * nx + a[1] * ny - d, db = b[0] * nx + b[1] * ny - d;
    if (da <= 0) result.push([a[0], a[1]]);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db); result.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  return result;
}
/** Split a convex silhouette into fitted pieces, instead of spawning unrelated shard shapes.
 * Cuts preserve area and shared boundaries. minArea may stop splitting before pieces is reached.
 * Accepts either winding, without mutating caller input. Coordinates must be within +/-1e6.
 */
export function fractureStone(points: readonly StonePoint[], options: FractureOptions = {}): StoneCell[] {
  const { seed = 1, pieces = 14, minArea = 4 } = options;
  if (!Number.isFinite(seed) || !Number.isInteger(pieces) || pieces < 1 || pieces > 256 || !Number.isFinite(minArea) || minArea <= 0
    || points.length < 3 || points.length > 256 || points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 1e6)))
    throw new RangeError("Stone needs 3..256 finite convex vertices, 1..256 pieces and positive minArea");
  let polygon: [number, number][] = points.map(p => [p[0], p[1]]);
  if (cell(polygon).area < 0) polygon.reverse();
  const base = cell(polygon);
  if (!(base.area > 1e-8) || !base.center.every(Number.isFinite)) throw new RangeError("Stone polygon must have positive area");
  // Every vertex must lie on the inside of every directed edge. This also rejects self intersections.
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 1e-8 || polygon.some(p => dx * (p[1] - a[1]) - dy * (p[0] - a[0]) < -1e-7))
      throw new RangeError("Stone polygon must be convex with no repeated adjacent vertices");
  }
  const result = [base], rng = new Rng(seed), blocked = new Set<StoneCell>();
  while (result.length < pieces) {
    const target = result.filter(c => c.area >= minArea * 2 && !blocked.has(c)).sort((a, b) => b.area - a.area)[0];
    if (!target) break;
    let halves: StoneCell[] | undefined, best = -Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng.range(0, Math.PI), nx = Math.cos(angle), ny = Math.sin(angle);
      const projections = target.polygon.map(p => p[0] * nx + p[1] * ny);
      const d = lerp(Math.min(...projections), Math.max(...projections), rng.range(0.38, 0.62));
      const a = cell(clip(target.polygon, nx, ny, d)), b = cell(clip(target.polygon, -nx, -ny, -d));
      if (a.area >= minArea && b.area >= minArea) {
        // Favor equant blocks over needle-like shards. Local cut quality matters for material identity.
        const compactness = (c: StoneCell) => {
          let perimeter = 0;
          for (let i = 0; i < c.polygon.length; i++) {
            const p = c.polygon[i], q = c.polygon[(i + 1) % c.polygon.length];
            perimeter += Math.hypot(q[0] - p[0], q[1] - p[1]);
          }
          return c.area / (perimeter * perimeter);
        };
        const score = Math.min(compactness(a), compactness(b));
        if (score > best) { best = score; halves = [a, b]; }
      }
    }
    if (halves) result.splice(result.indexOf(target), 1, ...halves);
    else blocked.add(target);
  }
  return result;
}

export interface RubbleLaunch { x: number; y: number; vx: number; vy: number; angle?: number; spin?: number }
export interface RubbleOptions {
  duration?: number; gravity?: number; bounce?: number; friction?: number; ground?: number;
}
export interface RubbleSample { x: number; y: number; vx: number; vy: number; angle: number; spin: number; resting: boolean }
export interface RubbleImpact { time: number; x: number; y: number; speed: number }
export interface RubblePath { readonly duration: number; readonly impacts: readonly RubbleImpact[]; sample(time: number): RubbleSample }

/** Prebaked 240 Hz polygon-aware rigid debris. Rotation determines floor support, so a long stone
 * cannot sink into the floor like a point particle. Each impact emits one event. Sample any time/order;
 * caller frame rates do not change collisions, settled state, or dust-trigger timing.
 * This is a light VFX approximation, not a general rigid-body solver (no body/body collisions).
 */
export function rubblePath(vertices: readonly StonePoint[], launch: RubbleLaunch, options: RubbleOptions = {}): RubblePath {
  const { duration = 3, gravity = 720, bounce = 0.24, friction = 0.68, ground = 0 } = options;
  const { x, y, vx, vy, angle = 0, spin = 0 } = launch;
  if (!vertices.length || vertices.length > 256 || vertices.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 1e6))
    || ![x, y, vx, vy, angle, spin, duration, gravity, bounce, friction, ground].every(v => Number.isFinite(v) && Math.abs(v) <= 1e6)
    || duration <= 0 || duration > 30 || gravity <= 0 || bounce < 0 || bounce >= 1 || friction < 0 || friction > 1)
    throw new RangeError("Rubble values must be finite within +/-1e6, duration 0..30, gravity positive, bounce [0,1), friction [0,1]");
  const shape = vertices.map(p => [p[0], p[1]] as const);
  const support = (a: number) => { const c = Math.cos(a), s = Math.sin(a); return Math.max(...shape.map(p => p[0] * s + p[1] * c)); };
  const steps = Math.ceil(duration * 240), dt = duration / steps, impacts: RubbleImpact[] = [];
  const state: RubbleSample = { x, y: Math.min(y, ground - support(angle)), vx, vy, angle, spin, resting: false };
  const frames: RubbleSample[] = [{ ...state }];
  for (let i = 1; i <= steps; i++) {
    if (!state.resting) {
      state.x += state.vx * dt;
      state.y += state.vy * dt + gravity * dt * dt / 2;
      state.vy += gravity * dt;
      state.angle += state.spin * dt;
      const floor = ground - support(state.angle);
      if (state.y >= floor && state.vy > 0) {
        state.y = floor;
        impacts.push({ time: i * dt, x: state.x, y: ground, speed: state.vy });
        state.vx *= 1 - friction; state.spin *= -0.3;
        if (state.vy * bounce < 28) { state.resting = true; state.vx = state.vy = state.spin = 0; }
        else state.vy *= -bounce;
      } else if (state.y > floor) state.y = floor;
    }
    frames.push({ ...state });
  }
  return {
    duration, impacts,
    sample(time: number): RubbleSample {
      if (!Number.isFinite(time) || time < 0) throw new RangeError("Rubble time must be finite and non-negative");
      const f = Math.min(time / dt, steps), i = Math.floor(f), a = frames[i], b = frames[Math.min(i + 1, steps)], u = f - i;
      const angle = lerp(a.angle, b.angle, u);
      return { x: lerp(a.x, b.x, u), y: Math.min(lerp(a.y, b.y, u), ground - support(angle)),
        vx: lerp(a.vx, b.vx, u), vy: lerp(a.vy, b.vy, u), angle, spin: lerp(a.spin, b.spin, u), resting: a.resting };
    },
  };
}
