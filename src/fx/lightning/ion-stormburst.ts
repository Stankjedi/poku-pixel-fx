import type { Painter } from '../../core/painter.js';
import { fit, rand, sparkle, clamp, TAU, WHITE } from '../../core/index.js';

/** A concentrated storm descends into a widening ion ring before scattering into sparks. */
export const meta = {
  name: 'Ion stormburst',
  desc: 'A violet storm condenses into a falling ion core; branching lightning erupts, then a spinning electrical shock ring shatters into drifting sparks.',
  tags: ['lightning', 'electric', 'storm', 'ion', 'thunder', 'burst', 'shockwave', 'magic', 'one-shot'],
  size: [208, 176], origin: [104, 150], duration: 2.4, loop: false, fps: 30, bg: 'ground',
  options: { palette: ['#100e3a', '#342f9e', '#7055e4', '#58a9ff', '#8deaff', '#e7ffff', '#ffffff'], seed: 43 },
};

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t < 0 || t >= meta.duration) return;
  const c = fit(o.palette, 7), phase = clamp((t - 0.30) / 0.55), end = clamp((2.4 - t) / 0.62);
  // Electricity charges in two counter-rotating orbits before the strike.
  const charge = t < 0.44 ? Math.sin(Math.PI * clamp(t / 0.44)) : 0;
  const cy = -98 + 74 * Math.pow(clamp((t - 0.27) / 0.21), 2);
  if (t < 0.50) {
    p.glow(0, cy, 29, c[3], 0.5 * charge);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + t * 7, rad = 21 - 15 * clamp(t / 0.44);
      const x = Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.48;
      sparkle(p, x, y, 2 + 3 * charge, c[6], c[3], charge);
    }
    p.disc(0, cy, 3 + 5 * charge, c[4], charge);
    p.disc(0, cy, 1 + 2 * charge, WHITE, charge);
  }
  // A tall column flashes in separated pulses with thin secondary forks.
  if (t >= 0.39 && t < 1.25) {
    const u = t - 0.39, flash = Math.max(0, (1 - u / 0.86)) * (0.5 + 0.5 * Math.max(0, Math.sin(u * 37)));
    const tick = Math.floor(t * 12);
    for (let bolt = -2; bolt <= 2; bolt++) {
      const spread = bolt * 15, segments = 10;
      let px = spread * 0.6, py = -147;
      for (let j = 1; j <= segments; j++) {
        const y = -147 + j * 12.4;
        const x = spread * (1 - j / segments) + (rand(o.seed, tick, bolt, j) - 0.5) * (bolt === 0 ? 14 : 11) * Math.sin(Math.PI * j / segments);
        p.glowLine(px, py, x, y, bolt === 0 ? 7 : 4, c[3], flash * 0.24);
        p.line(px, py, x, y, c[3], flash);
        if (bolt === 0 || rand(o.seed, j, bolt) > 0.38) p.line(px + 1, py, x + 1, y, c[5], flash * 0.85);
        if (bolt === 0) p.line(px, py, x, y, WHITE, flash);
        px = x; py = y;
      }
    }
    p.glow(0, -23, 55, c[4], flash * 0.8);
  }
  if (t >= 0.40) {
    const u = clamp((t - 0.40) / 1.7), shock = (1 - u) * end, r = 6 + 74 * (1 - Math.pow(1 - phase, 3));
    p.glow(0, -8, 55 + 14 * phase, c[2], 0.45 * shock);
    // Perspective ellipse ring consists of segmented moving shards, not a smooth vector contour.
    for (let i = 0; i < 76; i++) {
      const a = i * TAU / 76, flicker = rand(o.seed, i, Math.floor(t * 8));
      if (flicker < u * 0.44) continue;
      const x = Math.cos(a) * r, y = -8 + Math.sin(a) * r * 0.19;
      p.dot(x, y, flicker > 0.75 ? WHITE : c[4], shock);
      if (Math.sin(a) > 0) p.dot(x, y + 1, c[2], shock * 0.7);
    }
    if (u < 0.5) sparkle(p, 0, -22, 18 * (1 - u * 1.6), WHITE, c[3], shock);
    // Escaping sparks carry a second rising motion after the shock.
    for (let i = 0; i < 32; i++) {
      const start = 0.42 + rand(o.seed, i, 2) * 0.35, age = t - start;
      if (age <= 0 || age > 1.3) continue;
      const a = rand(o.seed, i, 3) * TAU, speed = 26 + rand(o.seed, i, 4) * 58;
      const x = Math.cos(a) * speed * age, y = -20 + Math.sin(a) * speed * age * 0.47 - age * 23 + age * age * 14;
      const k = clamp(1 - age / 1.3) * end;
      if (i % 3 === 0) sparkle(p, x, y, 1 + 2 * k, c[6], c[3], k);
      else { p.dot(x, y, c[4], k); p.light(x, y, c[3], k * 0.5); }
    }
  }
}
