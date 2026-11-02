import type { Painter } from '../../core/painter.js';
import { fit, clamp, rand, sparkle, TAU, WHITE } from '../../core/index.js';

export const meta = {
  name: 'Abyssal maelstrom',
  desc: 'A luminous tidal vortex rises in spiralling bands, hurls crystalline spray outward, and collapses into rippling light.',
  tags: ['water', 'tidal', 'vortex', 'maelstrom', 'whirlpool', 'magic', 'burst', 'ocean', 'one-shot'],
  size: [240, 180], origin: [120, 156], duration: 3.2, loop: false, fps: 24, bg: 'ground',
  options: { palette: ['#07172e', '#073b65', '#086f9c', '#12a7c3', '#65e6e7', '#ccfff4', '#ffffff'], seed: 29 },
};
export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t < 0 || t >= meta.duration) return;
  const C = fit(o.palette, 7), rise = clamp(t / .32), fade = clamp((meta.duration - t) / .8), strength = rise * fade;
  const cy = -52, spin = t * 4.6;
  // Perspective rings reflect the rising current on the ground.
  for (let ring = 0; ring < 3; ring++) {
    const radius = 18 + ring * 17 + 8 * Math.sin(t * 2.1 + ring);
    for (let j = 0; j < 110; j++) {
      const a = j / 110 * TAU, x = Math.cos(a) * radius, y = Math.sin(a) * radius * .18;
      const glint = Math.sin(a * 5 - spin * 2 + ring) > .65;
      p.dot(x, y, glint ? C[5] : C[3], strength * (.35 + ring * .12));
    }
  }
  p.glow(0, -3, 58, C[2], .34 * strength);
  // Four interleaved helical ribbons: width and radius grow with height.
  for (let k = 0; k < 4; k++) {
    const phase = k * TAU / 4;
    for (let j = 0; j < 106; j++) {
      const u = j / 105, y = -8 - u * 105 * rise, radius = (8 + 37 * u) * rise;
      const a = phase + spin - u * 11, x = Math.cos(a) * radius, depth = Math.sin(a);
      const width = (1.5 + 4 * u) * strength;
      const col = depth > .5 ? C[5] : depth > -.2 ? C[4] : C[2];
      p.disc(x, y, width, col, strength * (depth > 0 ? .75 : .35));
      if (depth > .45 && j % 3 === 0) p.dot(x-1, y-1, WHITE, strength * .8);
    }
  }
  // Shards of cresting water erupt radially and fall away independently.
  for (let i = 0; i < 34; i++) {
    const delay = .20 + rand(i, o.seed, 3) * .7, age = t - delay;
    if (age <= 0) continue;
    const life = .9 + rand(i, o.seed, 4) * .8, u = age / life;
    if (u >= 1) continue;
    const a = TAU * rand(i, o.seed, 5), speed = 22 + rand(i, o.seed, 6) * 48;
    const x = Math.cos(a) * speed * u, y = cy + Math.sin(a) * speed * u - 20*u + 24*u*u;
    const k = Math.sin(Math.PI * u) * fade;
    p.line(x, y, x - Math.cos(a) * (2 + 7*k), y - Math.sin(a) * (2 + 7*k), C[4], k);
    if (i % 4 === 0) sparkle(p, x, y, 1 + 2*k, WHITE, C[4], .5*k);
    else p.dot(x, y, C[5], k);
  }
  if (t > .22 && t < .8) sparkle(p, 0, cy, 9 * Math.sin(Math.PI * (t-.22)/.58), WHITE, C[4], strength);
}
