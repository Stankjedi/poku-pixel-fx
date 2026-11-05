import type { Painter } from '../../core/painter.js';
import { fit, rand, sparkle, clamp, TAU, WHITE } from '../../core/index.js';

/** A concentrated storm descends into a widening ion ring before scattering into sparks. */
export const meta = {
  addedAt: '2026-11-02T13:49:39Z',
  name: 'Ion stormburst',
  desc: 'A violet storm condenses into a falling ion core; branching lightning erupts, then a spinning electrical shock ring shatters into drifting sparks.',
  tags: ['lightning', 'electric', 'storm', 'ion', 'thunder', 'burst', 'shockwave', 'magic', 'one-shot'],
  size: [234, 184], origin: [116, 154], duration: 2.4, loop: false, fps: 30, bg: 'ground',
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
        const x = spread * (1 - j / segments) + (rand(o.seed, tick, bolt, j) - 0.5) * (bolt === 0 ? 29 : 17) * Math.sin(Math.PI * j / segments);
        p.glowLine(px, py, x, y, bolt === 0 ? 7 : 4, c[3], flash * 0.24);
        const width = bolt === 0 ? 10 : 4.5;
        p.beam(px, py, x, y, width + 4, c[1], flash * 0.9);
        p.beam(px, py, x, y, width, c[3], flash);
        p.beam(px, py, x, y, Math.max(1.5, width * 0.43), c[5], flash);
        if (bolt === 0) p.line(px, py, x, y, WHITE, flash);
        if (j % 3 === 0 && bolt !== 0) {
          const side = Math.sign(bolt), fx = x + side * (12 + j * 1.8), fy = y + 10;
          p.beam(x, y, fx, fy, 2.8, c[3], flash);
          p.line(x, y, fx, fy, c[6], flash);
        }
        px = x; py = y;
      }
    }
    p.glow(0, -23, 78, c[4], flash * 0.85);
    // Divergent impact lightning lashes through the air with uneven branches.
    for (let branch = 0; branch < 10; branch++) {
      const angle = TAU * branch / 10 - 0.11, reach = (38 + rand(o.seed, branch, 201) * 43) * Math.min(1, (u + 0.04) * 9);
      let bx = 0, by = -23;
      for (let seg = 1; seg <= 5; seg++) {
        const f = seg / 5, displacement = (rand(o.seed, branch, seg, tick) - 0.5) * 13 * Math.sin(Math.PI*f);
        const nx = Math.cos(angle) * reach * f - Math.sin(angle) * displacement;
        const ny = -23 + Math.sin(angle) * reach * f * 0.64 + Math.cos(angle) * displacement;
        const thickness = Math.max(1.3, 5.0 * (1 - f * 0.75));
        p.beam(bx, by, nx, ny, thickness + 2.8, c[1], flash);
        p.beam(bx, by, nx, ny, thickness, c[4], flash);
        p.line(bx, by, nx, ny, c[6], flash);
        bx = nx; by = ny;
      }
    }
    // Explosive cross silhouette expands from the contact, then contracts rapidly.
    const impact = Math.sin(Math.PI * clamp((t - 0.39) / 0.55));
    if (impact > 0) {
      const r = 18 + 20 * impact, h = 8 + 7 * impact;
      p.tri(-r, -22, 0, -22-h, r, -22, c[2], impact);
      p.tri(-r, -22, 0, -22+h, r, -22, c[2], impact);
      p.disc(0, -22, 12 + 9 * impact, c[3], impact);
      p.disc(0, -22, 7 + 7 * impact, c[5], impact);
      p.disc(0, -22, 3 + 4 * impact, WHITE, impact);
      p.beam(-r*1.6, -22, r*1.6, -22, 2.8, c[5], impact);
      p.beam(0, -22-r*1.25, 0, -22+r*.8, 2.4, c[5], impact);
    }
  }
  if (t >= 0.40) {
    const u = clamp((t - 0.40) / 1.7), shock = (1 - u) * end, r = 6 + 74 * (1 - Math.pow(1 - phase, 3));
    p.glow(0, -8, 55 + 14 * phase, c[2], 0.45 * shock);
    // Short arcs race along the shock front instead of a uniformly lit ring.
    for (let i=0;i<6;i++) {
      const angle=i*TAU/6+t*3, span=.24, alpha=shock*(.45+.3*Math.sin(t*14+i));
      let px=Math.cos(angle)*r, py=-8+Math.sin(angle)*r*.19;
      for(let j=1;j<=4;j++) {
        const a=angle+span*j/4, x=Math.cos(a)*(r+(j%2?2:-1)), y=-8+Math.sin(a)*r*.19;
        p.line(px,py,x,y,c[j%2?5:3],alpha); px=x; py=y;
      }
    }
    // Perspective ellipse ring consists of segmented moving shards, not a smooth vector contour.
    for (let i = 0; i < 76; i++) {
      const a = i * TAU / 76, flicker = rand(o.seed, i, Math.floor(t * 8));
      if (flicker < u * 0.44) continue;
      const x = Math.cos(a) * r, y = -8 + Math.sin(a) * r * 0.19;
      p.dot(x, y, flicker > 0.75 ? WHITE : c[4], shock);
      if (Math.sin(a) > 0) p.dot(x, y + 1, c[2], shock * 0.7);
    }
    if (u < 0.5) sparkle(p, 0, -22, 25 * (1 - u * 1.6), WHITE, c[3], shock);
    // A pair of short-lived, asymmetric ground arcs bridges the impact and ring.
    if(u<.4) for(const side of [-1,1]) {
      const length=(30+(side>0?12:0))*phase, alpha=shock*(1-u/.4);
      p.polyline([[0,-9],[side*length*.3,-14],[side*length*.48,-7],[side*length*.72,-12],[side*length,-5]],c[4],alpha);
    }
    // Broken glowing cracks and heavy shards give the strike a grounded impact.
    for (let side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const reach = (12 + k * 17) * Math.min(1, phase * 2), y = -3 - (k % 2) * 3;
        const reach2 = (28 + k * 17) * Math.min(1, phase * 2);
        p.beam(side * reach, y, side * reach2, y + (k % 2 ? 3 : -2), 2, c[2], shock * 0.9);
        p.line(side * reach, y, side * reach2, y + (k % 2 ? 3 : -2), c[4], shock);
      }
      for (let i = 0; i < 8; i++) {
        const age = t - 0.42 - i * 0.025;
        if (age <= 0 || age > 1.3) continue;
        const drift = 18 + rand(o.seed, side, i, 91) * 65;
        const x = side * (8 + age * drift), y = -4 - age * (35 + 35 * rand(o.seed, side, i)) + 31 * age * age;
        const alpha = clamp(1 - age / 1.3) * end, size = 2 + (i % 3);
        p.tri(x-size, y+size, x, y-size*1.7, x+size*1.2, y+size, c[1], alpha);
        p.line(x-size*.4, y+size*.3, x, y-size, c[3], alpha);
        p.glow(x, y, 6, c[2], alpha * 0.2);
      }
    }
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
