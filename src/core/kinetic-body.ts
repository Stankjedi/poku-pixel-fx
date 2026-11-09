/** Coherent primary matter for new effects. Analytic 2D form, not fluid simulation.
 * Detail particles decorate this body; they do not have to invent its silhouette. */
import { hex } from './color.js';
import { clamp, noise2, rng, smooth, TAU } from './math.js';
import type { Painter, Point } from './painter.js';

export interface KineticBodyOptions2D {
  seed?: number;
  material: 'fire' | 'energy';
  profile: 'stream' | 'burst' | 'plume';
  /** Optional 0.01..3600s period for internal flow. Caller pose/progress must also repeat. */
  period?: number;
  /** Hot to cool. All output colors come from this ramp, including packed alpha. */
  palette: readonly (string | number)[];
}
export interface KineticBodyState2D {
  time: number;
  position: readonly [number, number];
  /** Local longitudinal/transverse half-extents, in native pixels. */
  size: readonly [number, number];
  /** Forward axis in radians. A stream's head is on the positive axis. */
  angle?: number;
  /** Burst expansion/consumption phase, independent of its spatial scale. */
  progress?: number;
  opacity?: number;
  /** Opt-in coherent fuel depletion for fire. 0 preserves the original body; 1 is exhausted.
   * It removes connected material regions, not random pixels or uniform opacity. */
  burnout?: number;
}
export interface KineticBodySurface2D {
  position: Point;
  normal: Point;
  tangent: Point;
}
interface Lobe { x: number; y: number; rx: number; ry: number; angle?: number }
interface PreparedLobe extends Lobe { cs: number; sn: number }
interface ShapeSeed { angle: number; radius: number; phase: number; speed: number }

/** A seeded implicit union gives one connected mass with unequal travelling lobes.
 * No per-frame RNG, fixed triangle stamps, blur, palette interpolation or implicit glow. */
export function createKineticBody2D(options: KineticBodyOptions2D) {
  const { seed = 1, material, profile, period } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Kinetic body seed must be uint32');
  if (!['fire', 'energy'].includes(material) || !['stream', 'burst', 'plume'].includes(profile)) throw new RangeError('Unknown kinetic body material/profile');
  if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32
    || options.palette.some(c => typeof c === 'number' ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff
      : !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c))) throw new RangeError('Kinetic body requires packed colors or #rgb/#rrggbb');
  if (period !== undefined && (!Number.isFinite(period) || period < 0.01 || period > 3600))
    throw new RangeError('Kinetic body period must be 0.01..3600 seconds');
  const colors = options.palette.map(hex), fire = material === 'fire';
  const seeds: readonly ShapeSeed[] = Object.freeze(Array.from({ length: 7 }, (_, id) => {
    const r = rng(seed, id, 7501);
    return Object.freeze({ angle: (id + r.range(-0.42, 0.42)) / 7 * TAU,
      radius: r.range(0.66, 1.2), phase: r.range(0, TAU), speed: r.range(0.8, 1.3) });
  }));
  const point = (p: readonly number[]) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  function resolve(state: KineticBodyState2D) {
    const { time, position, size, angle = 0, progress = 0, opacity = 1, burnout = 0 } = state;
    if (!Number.isFinite(time * 16) || !point(position) || !point(size) || size.some(x => x <= 0 || x > 512)
      || ![angle, progress, opacity, burnout].every(Number.isFinite) || progress < 0 || progress > 1 || opacity < 0 || opacity > 1
      || burnout < 0 || burnout > 1 || (burnout > 0 && !fire))
      throw new RangeError('Invalid kinetic body state');
    // Integer temporal harmonics and a closed texture orbit give a real cyclic flow,
    // rather than resetting nonperiodic deformation at the loop boundary.
    const loopPhase = period === undefined ? undefined
      : (Math.round((((time % period) + period) % period) / period * 1e9) / 1e9) % 1;
    const wave = (omega: number, speed = 1) => loopPhase === undefined ? time * omega * speed
      : loopPhase * TAU * Math.max(1, Math.round(period! * omega * speed / TAU));
    const q = progress, lobes: Lobe[] = [];
    if (profile === 'burst') {
      // A continuous root expands into overlapping unequal lobes, not separate radial spokes.
      lobes.push({ x: 0, y: 0, rx: 0.68 - q * 0.09, ry: 0.64 - q * 0.08 });
      for (const s of seeds) {
        const travel = 0.25 + q * (fire ? 0.28 : 0.21), angle = s.angle + (fire ? Math.sin(q * 3 + s.phase) * 0.13 : 0);
        const swelling = (0.33 + Math.sin(Math.PI * Math.min(1, q * s.speed + 0.12)) * 0.09) * s.radius;
        lobes.push({ x: Math.cos(angle) * travel, y: Math.sin(angle) * travel,
          rx: swelling * (fire ? 1.15 : 1), ry: swelling * (fire ? 0.90 + 0.10 * Math.sin(s.phase + q * 4) : 0.91), angle });
      }
    } else if (profile === 'plume') {
      // A rooted plume widens at its source and narrows into unequal rising crests.
      // It is not a projectile rotated upward: the base is clipped at local x = -1.
      lobes.push({ x: -0.62, y: 0, rx: 0.55, ry: 0.78 },
        { x: -0.1, y: Math.sin(wave(5) + seeds[0].phase) * 0.07, rx: 0.63, ry: 0.52 },
        { x: 0.40, y: Math.sin(wave(7) + seeds[1].phase) * 0.13, rx: 0.44, ry: 0.29 });
      for (let i = 0; i < 2; i++) {
        const s = seeds[i + 2];
        lobes.push({ x: 0.65 + 0.10 * Math.sin(wave(6, s.speed) + s.phase),
          y: (i === 0 ? -0.18 : 0.18) + 0.07 * Math.sin(wave(5) + s.phase),
          rx: i === 0 ? 0.32 : 0.23, ry: i === 0 ? 0.15 : 0.12 });
      }
    } else {
      // Dense rounded leading mass plus a connected taper that transports lobes toward the tail.
      lobes.push({ x: 0.30, y: 0, rx: 0.56, ry: 0.62 }, { x: -0.25, y: 0, rx: 0.55, ry: 0.40 });
      for (let i = 0; i < 5; i++) {
        const s = seeds[i], cycle = (loopPhase === undefined ? time * 0.9 * s.speed
          : loopPhase * Math.max(1, Math.round(period! * 0.9 * s.speed))) + i / 5 + s.phase / TAU * 0.15;
        const age = ((cycle % 1) + 1) % 1, x = 0.45 - age * 1.4;
        const envelope = smooth(0, 0.18, age) * (1 - smooth(0.75, 1, age));
        const swell = (0.26 + 0.10 * Math.sin(wave(8, s.speed) + s.phase)) * envelope;
        lobes.push({ x, y: (fire ? 0.28 : 0.13) * Math.sin(wave(7, s.speed) + s.phase) * (0.7 - x),
          rx: 0.25 * envelope, ry: swell * (fire ? 1 : 0.78) });
      }
    }
    return { time, position: [...position] as Point, size: [...size] as Point, angle, progress, opacity, burnout, loopPhase,
      lobes: lobes.map(lobe => Object.freeze(lobe)) };
  }
  function field(x: number, y: number, lobes: readonly PreparedLobe[]) {
    let distance = Infinity, nx = 0, ny = 0;
    for (const lobe of lobes) {
      const { cs, sn } = lobe, x0 = x - lobe.x, y0 = y - lobe.y;
      const dx = (x0 * cs + y0 * sn) / lobe.rx, dy = (-x0 * sn + y0 * cs) / lobe.ry;
      const d = fire ? Math.hypot(dx, dy) : (Math.abs(dx) ** 2.8 + Math.abs(dy) ** 2.8) ** (1 / 2.8);
      if (d < distance) { distance = d; nx = dx; ny = dy; }
    }
    return { distance, nx, ny };
  }
  const geometryOf = (s: ReturnType<typeof resolve>) => s.lobes.filter(lobe => lobe.rx >= 1e-7 && lobe.ry >= 1e-7)
    .map(lobe => ({ ...lobe, cs: Math.cos(lobe.angle ?? 0), sn: Math.sin(lobe.angle ?? 0) }));
  function texture(s: ReturnType<typeof resolve>, x: number, y: number) {
    const cyclic = s.loopPhase !== undefined && profile !== 'burst';
    const phase = profile === 'burst' ? s.progress * 1.6 : cyclic ? s.loopPhase! * TAU : s.time;
    const broad = cyclic ? noise2(x * 3 + Math.cos(phase) * 1.4, y * 3 - Math.sin(phase) * 1.4, seed + 29)
      : noise2(x * 3 + phase * (profile === 'stream' ? 2.8 : -0.6), y * 3 - phase * 0.35, seed + 29);
    const fine = cyclic ? noise2(x * 8 + Math.cos(phase * 2) * 1.1, y * 8 - Math.sin(phase * 2) * 1.1, seed + 971)
      : noise2(x * 8 + phase * 3.1, y * 8, seed + 971);
    return { phase, broad, fine, boundary: 1 + (fire ? 0.075 * broad + 0.025 * fine : 0.012 * broad) };
  }
  // Fuel is coherent in material coordinates and fixed for the life of the body.
  // A monotone burnout clock cannot regenerate already consumed material.
  // The lower side exhausts earlier, leaving uneven upper remnants rather than a ring.
  function fuel(x: number, y: number) {
    const cells = (noise2(x * 3.2, y * 3.2, seed + 451) + 1) * 0.5;
    return 0.25 + 0.48 * cells + 0.22 * clamp(0.5 - y * 0.5);
  }
  return Object.freeze({
    /** Normalized lobe supports aid diagnostics; returned data never mutates the instance. */
    sample: resolve,
    /** Trace the changing exterior at angular u in [0,1], then resolve its actual field normal.
     * This is a bounded geometric query, not uniform arc-length sampling or a fluid surface.
     * Use at particle birth, not inside every particle's draw/trail callback. Opacity is ignored.
     * With burnout, an empty ray throws RangeError rather than returning a false origin surface. */
    sampleSurface(state: KineticBodyState2D, u: number): KineticBodySurface2D {
      if (!Number.isFinite(u) || u < 0 || u > 1) throw new RangeError('Kinetic surface u must be in [0,1]');
      const s = resolve(state), geometry = geometryOf(s), theta = (u === 1 ? 0 : u) * TAU;
      const dx = Math.cos(theta), dy = Math.sin(theta), limit = 1.22 * Math.SQRT2;
      const distance = (x: number, y: number) => {
        let d = field(x, y, geometry).distance - texture(s, x, y).boundary;
        if (s.burnout > 0) d = Math.max(d, s.burnout - fuel(x, y));
        return profile === 'plume' ? Math.max(d, -1 - x) : d;
      };
      // Conservative interval bounds, searched outside first, keep thin outer lobes from
      // falling between fixed radial samples. Terminate at a bounded normalized precision.
      const ray = geometry.map(lobe => {
        const ax = (dx * lobe.cs + dy * lobe.sn) / lobe.rx;
        const ay = (-dx * lobe.sn + dy * lobe.cs) / lobe.ry;
        const bx = (-lobe.x * lobe.cs - lobe.y * lobe.sn) / lobe.rx;
        const by = (lobe.x * lobe.sn - lobe.y * lobe.cs) / lobe.ry;
        return { ax, ay, bx, by, closest: -(ax * bx + ay * by) / (ax * ax + ay * ay),
          rate: fire ? Math.hypot(ax, ay) : (Math.abs(ax) ** 2.8 + Math.abs(ay) ** 2.8) ** (1 / 2.8) };
      });
      // Value-noise derivatives are bounded by 3 per coordinate; frequencies/weights
      // are exactly those of texture(). The Lp-to-L2 bound is conservative for energy.
      const noiseRate = (fire ? 1.275 : 0.108) * (Math.abs(dx) + Math.abs(dy));
      const energyNormBound = 2 ** (1 / 2.8 - 0.5);
      function outermost(lo: number, hi: number, atHi: number): number | undefined {
        if (atHi <= 0) return hi;
        if (profile === 'plume' && Math.max(dx * lo, dx * hi) < -1) return;
        const mid = (lo + hi) / 2, half = (hi - lo) / 2, boundary = texture(s, dx * mid, dy * mid).boundary;
        const upperBoundary = Math.min(fire ? 1.1 : 1.012, boundary + noiseRate * half);
        // Conservative value-noise derivative bound, plus the vertical fuel bias.
        // Prune fully consumed intervals before the exterior search subdivides them.
        if (s.burnout > 0 && s.burnout - fuel(dx * mid, dy * mid)
          > (2.304 * (Math.abs(dx) + Math.abs(dy)) + 0.11 * Math.abs(dy)) * half) return;
        let minimum = Infinity, atMid = Infinity;
        for (const lobe of ray) {
          const r = Math.max(lo, Math.min(hi, lobe.closest));
          const exactL2Minimum = Math.hypot(lobe.ax * r + lobe.bx, lobe.ay * r + lobe.by);
          const mx = lobe.ax * mid + lobe.bx, my = lobe.ay * mid + lobe.by;
          const d = fire ? Math.hypot(mx, my) : (Math.abs(mx) ** 2.8 + Math.abs(my) ** 2.8) ** (1 / 2.8);
          atMid = Math.min(atMid, d);
          minimum = Math.min(minimum, fire ? exactL2Minimum : Math.max(exactL2Minimum * energyNormBound, d - lobe.rate * half));
        }
        if (minimum > upperBoundary) return;
        atMid -= boundary;
        if (s.burnout > 0) atMid = Math.max(atMid, s.burnout - fuel(dx * mid, dy * mid));
        if (profile === 'plume') atMid = Math.max(atMid, -1 - dx * mid);
        if (hi - lo <= 1e-7) {
          if (atMid <= 0) return mid;
          return distance(dx * lo, dy * lo) <= 0 ? lo : undefined;
        }
        return outermost(mid, hi, atHi) ?? outermost(lo, mid, atMid);
      }
      const radius = outermost(0, limit, distance(dx * limit, dy * limit));
      if (radius === undefined) throw new RangeError('No kinetic material remains on the requested surface ray');
      const x = dx * radius, y = dy * radius, e = 0.00001;
      // Normalize the inverse-transpose without dividing by arbitrarily small legal sizes.
      const minimumSize = Math.min(...s.size), scaleX = minimumSize / s.size[0], scaleY = minimumSize / s.size[1];
      let nx = (distance(x + e, y) - distance(x - e, y)) * scaleX;
      let ny = (distance(x, y + e) - distance(x, y - e)) * scaleY;
      let length = Math.hypot(nx, ny);
      if (length < 1e-12) { nx = dx * scaleX; ny = dy * scaleY; length = Math.hypot(nx, ny); }
      if (!(length > 0)) throw new RangeError('Kinetic surface normal is numerically degenerate');
      nx /= length; ny /= length;
      const cs = Math.cos(s.angle), sn = Math.sin(s.angle), normal: Point = [nx * cs - ny * sn, nx * sn + ny * cs];
      return { position: [s.position[0] + x * s.size[0] * cs - y * s.size[1] * sn,
        s.position[1] + x * s.size[0] * sn + y * s.size[1] * cs], normal, tangent: [-normal[1], normal[0]] };
    },
    draw(p: Pick<Painter, 'shade'>, state: KineticBodyState2D) {
      const s = resolve(state);
      if (s.opacity === 0 || s.burnout === 1) return;
      const geometry = geometryOf(s);
      const cs = Math.cos(s.angle), sn = Math.sin(s.angle), [rx, ry] = s.size;
      // Every lobe is contained by this support, including the connected trailing tip.
      const extentX = Math.abs(cs) * rx * 1.22 + Math.abs(sn) * ry * 1.22;
      const extentY = Math.abs(sn) * rx * 1.22 + Math.abs(cs) * ry * 1.22;
      p.shade(s.position[0] - extentX, s.position[1] - extentY, s.position[0] + extentX, s.position[1] + extentY, (px, py, out) => {
        const dx = px - s.position[0], dy = py - s.position[1], x = (dx * cs + dy * sn) / rx, y = (-dx * sn + dy * cs) / ry;
        if (profile === 'plume' && x < -1) return;
        const f = field(x, y, geometry);
        if (f.distance > (fire ? 1.1 : 1.012)) return;
        // Texture is advected in material coordinates. It never changes from a frame counter.
        const { phase, broad, fine, boundary } = texture(s, x, y);
        if (f.distance > boundary) return;
        const remaining = s.burnout > 0 ? fuel(x, y) - s.burnout : 1;
        if (remaining <= 0) return;
        const inside = clamp(1 - f.distance / boundary), raised = clamp(0.55 - f.ny * 0.22 - f.nx * 0.12);
        const cooling = profile === 'burst' ? smooth(0.12, 1, s.progress) * 0.35 : clamp(0.2 - x) * 0.12;
        const crest = profile === 'stream' ? Math.exp(-((x - 0.4) ** 2 / 0.23 + y * y / 0.4))
          : profile === 'plume' ? Math.exp(-((x + 0.45) ** 2 / 0.5 + y * y / 0.5))
          : Math.exp(-((x + 0.12) ** 2 + (y + 0.18) ** 2) / 0.25);
        // A narrow hot combustion front remains on the surviving material itself.
        // It does not create light, interpolate the palette or brighten every particle.
        const front = s.burnout > 0 ? (1 - smooth(0, 0.14, remaining)) * smooth(0.18, 0.4, s.burnout) * 0.32 : 0;
        const heat = fire ? clamp(0.25 + 0.20 * inside + 0.16 * raised + 0.26 * broad + 0.11 * fine + 0.23 * crest + front - cooling)
          : clamp(0.18 + 0.46 * inside + 0.22 * raised + 0.06 * Math.cos((x + y) * 15 - phase * 8) - cooling * 0.5);
        const band = heat > 0.82 ? 0 : heat > 0.66 ? 1 : heat > 0.48 ? 2 : heat > 0.30 ? 3 : 4;
        out.c = colors[Math.min(colors.length - 1, band)];
        out.a = s.opacity;
      });
    },
  });
}
