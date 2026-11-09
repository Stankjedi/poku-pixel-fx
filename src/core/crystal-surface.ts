/** Opt-in crystalline matter for newly authored effects. No glow, blur or scene refraction. */
import { fit } from './color.js';
import { clamp, noise2, rng, smooth } from './math.js';
import type { Painter, Point } from './painter.js';

export interface CrystalSurfaceOptions2D {
  /** Original convex silhouette. Material coordinates persist after fracture. */
  polygon: readonly (readonly [number, number])[];
  palette: readonly (string | number)[];
  seed?: number;
  /** Surface-to-light direction, x right / y down / z toward viewer. */
  light?: readonly [number, number, number];
}
export interface CrystalSurfaceState2D {
  /** A convex part inside the original solid, relative to materialOrigin. Omit for the whole solid. */
  polygon?: readonly (readonly [number, number])[];
  materialOrigin?: readonly [number, number];
  position?: readonly [number, number];
  angle?: number;
  opacity?: number;
  /** Newly exposed cut edges, 0 before separation. Does not change the original exterior. */
  cutEdges?: number;
}
const point = (p: readonly number[]): Point => {
  if (!Array.isArray(p) || p.length !== 2 || !Array.from(p).every(Number.isFinite) || p.some(v => Math.abs(v) > 1e6))
    throw new RangeError('Crystal coordinates must be finite bounded points');
  return [p[0], p[1]];
};
function polygon(input: readonly (readonly [number, number])[]) {
  if (!Array.isArray(input) || input.length < 3 || input.length > 64) throw new RangeError('Crystal polygon needs 3..64 vertices');
  const p = Array.from(input, point);
  const area = p.reduce((a, v, i) => a + v[0] * p[(i + 1) % p.length][1] - v[1] * p[(i + 1) % p.length][0], 0);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-8) throw new RangeError('Crystal polygon has no area');
  if (area < 0) p.reverse();
  const edges = p.map((a, i) => {
    const b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1e-8) throw new RangeError('Crystal polygon has a repeated vertex');
    return { x: a[0], y: a[1], dx, dy, nx: dy / length, ny: -dx / length, length,
      inclusive: dy < 0 || (dy === 0 && dx > 0) };
  });
  if (edges.some(e => p.some(v => e.dx * (v[1] - e.y) - e.dy * (v[0] - e.x) < -1e-7)))
    throw new RangeError('Crystal polygon must be convex');
  return { points: p, edges };
}
/** Paints a clipped part of one translucent volume. Internal fissures use original material
 * coordinates, while surface reflection follows the rotating geometry and fixed external light.
 * Depth-dependent transmission lets the real background show through. This is an authored
 * depth cue, not optical refraction; no surrounding pixels are fetched or displaced. */
export function createCrystalSurface2D(options: CrystalSurfaceOptions2D) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(k => !['polygon', 'palette', 'seed', 'light'].includes(k))) throw new TypeError('Invalid crystal surface options');
  const whole = polygon(options.polygon), { seed = 1, light = [-0.6, -0.7, 0.7] } = options;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Crystal seed must be uint32');
  if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32
    || Array.from(options.palette).some(c => typeof c === 'number' ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff
      : typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c))) throw new RangeError('Invalid crystal palette');
  if (!Array.isArray(light) || light.length !== 3 || !light.every(Number.isFinite) || !Number.isFinite(Math.hypot(...light)) || Math.hypot(...light) < 1e-8)
    throw new RangeError('Crystal light must be a nonzero finite vector');
  const n = Math.hypot(...light), L = light.map(v => v / n), C = fit([...options.palette], 7), r = rng(seed, 6211);
  const xs = whole.points.map(v => v[0]), ys = whole.points.map(v => v[1]);
  const center: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const depthScale = Math.max(1, Math.min(width, height) * .28), ridge = r.range(-.12, .12) * width;
  // Finite buried fissures: unequal directions and lengths, no repeating bands.
  const fissures = Array.from({ length: 3 }, (_, i) => {
    const x = center[0] + r.range(-.24, .24) * width, y = center[1] + (i / 2 - .5) * height * .7;
    const angle = r.range(-1.1, .8), length = r.range(.18, .42) * width;
    return { x, y, dx: Math.cos(angle) * length, dy: Math.sin(angle) * length, length };
  });
  const hn = Math.hypot(L[0], L[1], L[2] + 1), H = hn > 1e-8 ? [L[0] / hn, L[1] / hn, (L[2] + 1) / hn] : [0, 0, 1];
  const geometry = new WeakMap<object, ReturnType<typeof polygon>>();
  return Object.freeze({
    draw(p: Pick<Painter, 'shade'>, state: CrystalSurfaceState2D = {}) {
      if (!state || typeof state !== 'object' || Array.isArray(state)
        || Object.keys(state).some(k => !['polygon', 'materialOrigin', 'position', 'angle', 'opacity', 'cutEdges'].includes(k))) throw new TypeError('Invalid crystal surface state');
      const { angle = 0, opacity = 1, cutEdges = 0 } = state;
      if (![angle, opacity, cutEdges].every(Number.isFinite) || opacity < 0 || opacity > 1 || cutEdges < 0 || cutEdges > 1)
        throw new RangeError('Invalid crystal surface state');
      const origin = point(state.materialOrigin ?? [0, 0]), position = point(state.position ?? [0, 0]);
      // Caller-owned mutable geometry must never become a stale cache entry.
      const key = state.polygon, cached = key && Object.isFrozen(key) ? geometry.get(key) : undefined;
      const part = cached ?? (key ? polygon(key) : whole);
      if (key && Object.isFrozen(key) && key.every(Object.isFrozen)) geometry.set(key, part);
      if (part.points.some(([x, y]) => whole.edges.some(e =>
        e.dx * (y + origin[1] - e.y) - e.dy * (x + origin[0] - e.x) < -1e-7 * e.length)))
        throw new RangeError('Crystal part lies outside the original material volume');
      if (opacity === 0) return;
      const cs = Math.cos(angle), sn = Math.sin(angle);
      const transformed = part.points.map(([x, y]) => [position[0] + x * cs - y * sn, position[1] + x * sn + y * cs]);
      const xs = transformed.map(v => v[0]), ys = transformed.map(v => v[1]);
      p.shade(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (px, py, out) => {
        const dx = px - position[0], dy = py - position[1], x = dx * cs + dy * sn, y = -dx * sn + dy * cs;
        let partDistance = Infinity, partEdge = part.edges[0];
        for (const e of part.edges) {
          const cross = e.dx * (y - e.y) - e.dy * (x - e.x);
          if (cross < -1e-8 || (Math.abs(cross) <= 1e-8 && !e.inclusive)) return;
          const distance = cross / e.length;
          if (distance < partDistance) { partDistance = distance; partEdge = e; }
        }
        const mx = x + origin[0], my = y + origin[1];
        let depth = Infinity, exterior = whole.edges[0];
        for (const e of whole.edges) {
          const distance = -(mx - e.x) * e.nx - (my - e.y) * e.ny;
          if (distance < depth) { depth = distance; exterior = e; }
        }
        const thickness = smooth(0, depthScale, Math.max(0, depth));
        const grain = noise2(mx * .11, my * .11, seed + 918);
        // A coherent front ridge and bevel suggest volume before any cracks are visible.
        const side = mx - center[0] + (my - center[1]) * .16 > ridge ? 1 : -1;
        const outerBevel = 1 - smooth(.3, Math.max(1.5, depthScale * .3), depth);
        const cutBevel = (1 - smooth(.2, 1.6, partDistance)) * cutEdges;
        const edge = cutBevel > outerBevel ? partEdge : exterior, bevel = Math.max(outerBevel, cutBevel);
        let nx = side * .33 * (1 - bevel) + edge.nx * .88 * bevel;
        let ny = -.20 * (1 - bevel) + edge.ny * .88 * bevel, nz = .94 - bevel * .5;
        const nn = Math.hypot(nx, ny, nz), rx = (nx * cs - ny * sn) / nn, ry = (nx * sn + ny * cs) / nn;
        nz /= nn;
        const diffuse = Math.max(0, rx * L[0] + ry * L[1] + nz * L[2]);
        const reflection = Math.max(0, rx * H[0] + ry * H[1] + nz * H[2]);
        // Clear thinner regions transmit the real backdrop. Thick material has a cool body;
        // directional reflections and sparse cloudy inclusions remain distinct from transmission.
        let tone = diffuse > .78 ? 4 : diffuse > .48 ? 3 : 2;
        let alpha = .22 + thickness * .30 + diffuse * .15;
        const cloud = noise2(mx * .09 + 7, my * .075, seed + 471);
        if (cloud > .53 && thickness > .3) { tone = Math.min(5, tone + 1); alpha += .12; }
        let internal = 0;
        for (const f of fissures) {
          const dx = mx - f.x, dy = my - f.y, u = (dx * f.dx + dy * f.dy) / (f.length * f.length);
          if (u <= 0 || u >= 1) continue;
          const distance = Math.abs(dx * f.dy - dy * f.dx) / f.length;
          const taper = Math.sin(Math.PI * u), warp = grain * .55;
          if (Math.abs(distance - warp) < .55 * taper) internal = Math.max(internal, taper);
        }
        if (internal > .2 && depth > 1) { tone = 5; alpha = Math.max(alpha, .55 + internal * .16); }
        // Only a narrow fixed-light lobe can reach white; rotating chips change reflection.
        if (reflection > .975 && bevel > .25) { tone = 6; alpha = Math.max(alpha, .58 + .32 * smooth(.975, .998, reflection)); }
        else if (reflection > .91 && bevel > .2) { tone = 5; alpha = Math.max(alpha, .72); }
        else if (bevel > .55 && diffuse < .25) { tone = 2; alpha = Math.max(alpha, .48); }
        out.c = C[tone]; out.a = clamp(alpha) * opacity;
      });
    },
  });
}
