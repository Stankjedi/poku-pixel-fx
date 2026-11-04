import type { Painter } from './painter.js';

/** A compact elliptical density contribution, not an individually painted particle.
 * Negative density carves entrained air from a larger volume. Radii are in logical pixels.
 */
export interface SmokeCell { x: number; y: number; rx: number; ry: number; density: number }
export interface SmokeStyle {
  /** Optical thickness multiplier. This is opacity, never additive light. */
  opacity?: number;
  /** Direction toward the incident light in local space. */
  lightX?: number;
  lightY?: number;
}

/** Merge the density first, then shade/composite once per screen cell. This avoids the circular
 * overlap seams and accidental opacity stacks of separately painted puffs. Colors stay quantized;
 * coverage is genuinely translucent even in a dither-mode frame. This is authored 2D volume art,
 * not a physical fluid solver. Caller controls advection, expansion and dissipation.
 */
export function smokeVolume(p: Painter, cells: readonly SmokeCell[], palette: readonly number[], style: SmokeStyle = {}) {
  const opacity = style.opacity ?? 1, lx = style.lightX ?? -0.6, ly = style.lightY ?? -0.8;
  if (![opacity, lx, ly].every(Number.isFinite) || opacity < 0) throw new RangeError('Smoke style must be finite, with non-negative opacity');
  if (!palette.length || !cells.length || opacity === 0) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (![c.x,c.y,c.rx,c.ry,c.density].every(Number.isFinite) || c.rx <= 0 || c.ry <= 0)
      throw new RangeError('Smoke cells need finite values and positive radii');
    x0 = Math.min(x0, Math.floor(c.x - c.rx) - 1); x1 = Math.max(x1, Math.ceil(c.x + c.rx) + 1);
    y0 = Math.min(y0, Math.floor(c.y - c.ry) - 1); y1 = Math.max(y1, Math.ceil(c.y + c.ry) + 1);
  }
  const w = x1 - x0, h = y1 - y0;
  if (w * h > 4_194_304) throw new RangeError('Smoke field exceeds 4 million logical cells');
  const field = new Float32Array(w * h);
  for (const c of cells) {
    if (c.density === 0) continue;
    const ax = Math.max(0, Math.floor(c.x - c.rx) - x0), bx = Math.min(w - 1, Math.ceil(c.x + c.rx) - x0);
    const ay = Math.max(0, Math.floor(c.y - c.ry) - y0), by = Math.min(h - 1, Math.ceil(c.y + c.ry) - y0);
    const ix = 1 / c.rx, iy = 1 / c.ry;
    for (let y = ay; y <= by; y++) {
      const dy = (y + y0 + 0.5 - c.y) * iy, yy = dy * dy;
      if (yy >= 1) continue;
      for (let x = ax; x <= bx; x++) {
        const dx = (x + x0 + 0.5 - c.x) * ix, q = 1 - dx * dx - yy;
        if (q > 0) field[y * w + x] += c.density * q * q;
      }
    }
  }
  const lightLength = Math.hypot(lx, ly) || 1;
  p.each(x0, y0, x1, y1, (x, y, sx, sy) => {
    const xx = Math.floor(x) - x0, yy = Math.floor(y) - y0, j = yy * w + xx, d = field[j];
    if (!(d > 0.008) || xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) return;
    // Outward density gradient is a cheap coherent normal; it follows merged rolls, not discs.
    const nx = field[j - 1] - field[j + 1], ny = field[j - w] - field[j + w];
    const diffuse = (nx * lx + ny * ly) / ((Math.hypot(nx, ny) + 0.14) * lightLength);
    const brightness = Math.max(0, Math.min(0.999, 0.51 + diffuse * 0.37 - Math.min(0.17, d * 0.045)));
    const color = palette[Math.floor(brightness * palette.length)];
    p.blendPx(sx, sy, color, 1 - Math.exp(-d * opacity));
  });
}

/** An open rolling fold. Adjacent contributions overlap into one tapered spiral; the outer
 * end can join a parent column. It is not a ring outline and never adds light.
 */
export function smokeCurl(cells: SmokeCell[], x: number, y: number, radius: number, angle: number,
  turn: number, thickness: number, density: number, steps = 14) {
  if (![x,y,radius,angle,turn,thickness,density,steps].every(Number.isFinite) || radius <= 0 || thickness <= 0 || steps < 2 || steps > 128)
    throw new RangeError('Smoke curl needs finite dimensions and 2..128 steps');
  const n = Math.floor(steps);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = angle + turn * u, r = radius * (1 - 0.76 * u);
    const width = thickness * (1 - 0.48 * u);
    cells.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      rx: width, ry: width * 0.91, density: density * (1 - 0.5 * u) / n * 6 });
  }
}
