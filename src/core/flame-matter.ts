/** Opt-in stylized flame matter, not a fluid solver. No light, particles or trail history. */
import { hex } from './color.js';
import { clamp, hash, noise2 } from './math.js';
import type { Painter } from './painter.js';

export interface FlameMatterOptions2D {
  /** Integer in [0, 4294967295], defaults to 1. */
  seed?: number;
  /** Cold to hot, 1..32 #rgb/#rrggbb or packed RGBA integers. Alpha is forced opaque. */
  palette: readonly (string | number)[];
}
export interface FlameMatterSample2D {
  /** Integer in [0, 4294967295], defaults to 0. */
  id?: number;
  /** Center; each coordinate in [-1000000, 1000000]. */
  position: readonly [number, number];
  /** Half extents of local support; each in [0.125, 128]. No aspect ratio restriction. */
  size: readonly [number, number];
  /** Radians in [-1000000, 1000000]; zero points upward (-y). Defaults to 0. */
  angle?: number;
  /** Noise flow direction in effect-local radians [-1000000,1000000]; 0 is local-up.
   * Defaults to angle; Painter placement rotation/mirroring transforms this direction.
   * Direction describes noise-field translation, not flame/particle
   * velocity or geometry orientation. Field speeds are 2.9*min(size) effect-local units/sec
   * and 1.63 times that speed, independent of aspect ratio and burnout shrink. */
  flowAngle?: number;
  /** Absolute seekable seconds in [-3600, 3600]. */
  time: number;
  /** Geometric consumption in [0,1]. 1 is empty. Defaults to 0. */
  burnout?: number;
  /** [0,1], defaults to 1. No implicit fading; caller controls end-of-life opacity. */
  opacity?: number;
  /** 'tongue' is a rising plume; 'mass' is a broad connected body. Defaults to 'tongue'. */
  profile?: 'tongue' | 'mass';
}
const uint = (v: number) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const finite = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
function pair(v: readonly number[], lo: number, hi: number) {
  return Array.isArray(v) && v.length === 2 && finite(v[0], lo, hi) && finite(v[1], lo, hi);
}

/**
 * Stateless bounded shader: at most two noise2 calls per pixel, no raster/ID caches.
 * Palette and draw geometry are snapshotted; retained callbacks are independent.
 * Support is strictly inside the rotated, burnout-shrunken size rectangle. The shade
 * box is its conservative AABB (not max(size)), with a rounding guard during burnout;
 * at most 362.04 pixels per axis before raster rounding.
 * At burnout=0 and opacity>0 the exact center and normalized local [0,-0.45]
 * are always painted for both profiles. Upper source in effect-local coordinates (before Painter placement):
 * [cx + sin(angle)*0.45*ry, cy - cos(angle)*0.45*ry]. This guarantees the
 * shader point, not its nearest raster cell (especially for subpixel shapes).
 * Proof for upper source: |bend| <= .12*.85 + .10*.835 = .1855.
 * For u=-bend <= .167, central |e| <= .2344 and |f|=.33, giving
 * edge >= 1-.2344^2/.11-.33^2/.48-.215 > .058. For u>.167,
 * right |c| <= .176675 and |d| <= .30, giving
 * edge >= 1-.176675^2/.071-.30^2/.30-.215 > .045.
 * Noise is bounded in [-1,1], tipGuard=erosion=0, and field uses max:
 * these conservative bounds hold for every valid seed, id and time.
 * Returns stepped palette colors at uniform requested opacity; Painter chooses alpha mode.
 * Invalid options/samples throw RangeError, including sparse arrays and huge finite inputs.
 * Subpixel shapes may cover no pixel centers. Visual quality requires native-size review.
 */
export function createFlameMatter2D(options: FlameMatterOptions2D) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid flame matter options');
  const { seed = 1, palette } = options;
  if (!uint(seed) || !Array.isArray(palette) || palette.length < 1 || palette.length > 32)
    throw new RangeError('Invalid flame matter seed or palette');
  const colors: number[] = [];
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    if (typeof c === 'number' ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff
      : typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)) throw new RangeError('Invalid flame matter color');
    colors.push(hex(c) | 0xff000000);
  }
  return Object.freeze({
    draw(p: Pick<Painter, 'shade'>, sample: FlameMatterSample2D): void {
      if (!sample || typeof sample !== 'object' || Array.isArray(sample)) throw new RangeError('Invalid flame matter sample');
      const { id = 0, position, size, angle = 0, flowAngle = angle, time, burnout = 0, opacity = 1, profile = 'tongue' } = sample;
      if (!uint(id) || !pair(position, -1e6, 1e6) || !pair(size, .125, 128)
        || !finite(angle, -1e6, 1e6) || !finite(flowAngle, -1e6, 1e6) || !finite(time, -3600, 3600) || !finite(burnout, 0, 1)
        || !finite(opacity, 0, 1) || (profile !== 'tongue' && profile !== 'mass')) throw new RangeError('Invalid flame matter sample');
      if (opacity === 0 || burnout === 1) return;
      const [cx, cy] = position, [rx, ry] = size, cs = Math.cos(angle), sn = Math.sin(angle);
      const ex = Math.abs(cs) * rx + Math.abs(sn) * ry, ey = Math.abs(sn) * rx + Math.abs(cs) * ry;
      const key = hash(seed, id, 7291), phase = (key >>> 0) / 0x100000000 * Math.PI * 2;
      const mass = profile === 'mass', shrink = 1 - .58 * burnout, inv = 1 / shrink;
      const lean = .12 * Math.sin(time * 3.1 + phase), roll = Math.sin(time * 4.3 + phase * 2);
      const left = -.30 + .06 * roll, right = .32 + .05 * Math.sin(time * 3.7 + phase);
      const top = -.40 + .08 * Math.sin(time * 4.8 + phase), sideTop = -.25 + .10 * roll;
      const bodyRX = mass ? .74 : .57, bodyRY = mass ? .69 : .46, bodyY = mass ? .13 : .36;
      const bodyIX = 1 / (bodyRX * bodyRX), bodyIY = 1 / (bodyRY * bodyRY);
      const displacement = time * 2.9 * Math.min(rx, ry), drift = phase * 3, erosion = burnout * .62;
      const relative = flowAngle - angle;
      // Convert effect-local displacement before applying anisotropic noise frequencies.
      // Inverting local normalization/rotation recovers displacement*[sin(flow),-cos(flow)].
      const localX = Math.sin(relative) * displacement * inv / rx;
      const localY = -Math.cos(relative) * displacement * inv / ry;
      // The existing |x|,|y| < 1 test limits support to size*shrink. Tighten only
      // raster traversal, never the shader arithmetic. At the allowed coordinate
      // and size limits, 1e-7 comfortably covers double-precision roundoff in
      // normalization, rotation and center subtraction. Clamp to the old box so
      // zero/tiny burnout never expands traversal or changes its boundary rules.
      const boxX = Math.min(ex, ex * shrink + 1e-7), boxY = Math.min(ey, ey * shrink + 1e-7);
      p.shade(cx - boxX, cy - boxY, cx + boxX, cy + boxY, (px, py, out) => {
        const dx = px - cx, dy = py - cy;
        const x = (dx * cs + dy * sn) / rx * inv, y = (-dx * sn + dy * cs) / ry * inv;
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) >= 1 || Math.abs(y) >= 1) return;
        // Both fields advect along the requested effect-local flow, independently of geometry.
        // The coarse field bends coherent lobes;
        // the second creates broad hot folds, never frame-random surface speckles.
        const n = noise2((x - localX) * 2.5 + drift, (y - localY) * 2.1, key);
        const m = noise2((x - 1.63 * localX) * 5.2 - drift, (y - 1.63 * localY) * 3.8, key + 73);
        const bend = lean * (.4 - y) + .10 * n * (.7 - .3 * y);
        const u = x - bend, by = y - bodyY;
        let field = 1 - u * u * bodyIX - by * by * bodyIY;
        // Overlapping curved volumes, not path strokes or polygon facets. Unequal
        // upper lobes interrupt the outline without separating the fueled body.
        const a = u - left - .10 * y * y, b = y - top;
        const c = u - right + .13 * y * y, d = y - sideTop;
        const e = u + .035 + .16 * y * y, f = y + .12;
        field = Math.max(field, 1 - a * a / .055 - b * b / .25,
          1 - c * c / .071 - d * d / .30, 1 - e * e / .11 - f * f / .48);
        const tipGuard = Math.max(0, (Math.abs(y) - .8) * 5);
        const edge = field + .15 * n + .065 * m - erosion - .30 * tipGuard * tipGuard;
        if (edge <= 0) return;
        const heat = clamp(.31 + .34 * clamp(field) + .29 * n + .10 * m
          + .05 * y - .30 * burnout);
        out.c = colors[Math.min(colors.length - 1, Math.floor(heat * colors.length))];
        out.a = opacity;
      });
    },
  });
}
