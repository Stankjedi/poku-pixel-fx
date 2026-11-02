import type { Painter } from '../../core/painter.js';
import { fit, clamp, rand, sparkle, TAU, WHITE } from '../../core/index.js';

export const meta = {
  name: 'Abyssal maelstrom',
  desc: 'A deep blue surge erupts as a curling liquid column, breaks into foamy waves and droplets, then recedes into spreading ripples.',
  tags: ['water', 'tidal', 'vortex', 'maelstrom', 'whirlpool', 'magic', 'burst', 'ocean', 'splash', 'one-shot'],
  size: [240, 180], origin: [120, 156], duration: 3.2, loop: false, fps: 24, bg: 'ground',
  options: { palette: ['#062943', '#075172', '#087c9d', '#20b9cd', '#7ce8e7', '#d4fff5', '#ffffff'], seed: 29 },
};

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t < 0 || t >= meta.duration) return;
  const C = fit(o.palette, 7), fade = clamp((meta.duration - t) / .65), burst = clamp(1 - Math.abs(t - .34) / .24);
  const rise = clamp(t / .46), column = rise * clamp((2.05 - t) / .75) * fade;
  p.glow(0, -2, 64, C[2], .34 * fade * rise);

  // Wide, flat ripples propagate across the floor; broken foam follows each crest.
  for (let k = 0; k < 3; k++) {
    const age = t - k * .23; if (age <= 0) continue;
    const u = clamp(age / 2.2), rx = 11 + 96 * u, ry = 3 + 13 * u, alpha = (1 - u) * fade;
    for (let j = 0; j < 170; j++) {
      const a = j * TAU / 170, wave = Math.sin(a * 8 + u * 7 + k), x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      if (wave > -.65) { p.dot(x, y, wave > .55 ? C[5] : C[3], alpha * .85); p.dot(x, y + 1, C[2], alpha * .55); }
    }
  }

  // The fountain consists of overlapping round masses rather than pointed polygons.
  // Each blob travels on a slightly offset curve, forming a liquid column with a scalloped rim.
  if (column > 0) {
    const h = 105 * rise, lean = Math.sin(t * 2.2) * 10 * rise;
    for (let j = 0; j <= 48; j++) {
      const u = j / 48, y = -5 - u * h, x = lean * u + Math.sin(u * 8 - t * 3) * (3 + 8 * u);
      const r = (17 - 8 * u + 4 * Math.sin(u * 11 + t * 4)) * column;
      p.disc(x, y, Math.max(1, r + 3), C[1], column * .8);
      p.disc(x - 2, y - 1, Math.max(1, r), C[2], column * .88);
      p.disc(x - 5, y - 2, Math.max(1, r * .62), C[3], column * .7);
      if (j % 5 === 0) { p.disc(x - r * .55, y - 2, Math.max(1, r * .22), C[4], column * .8); }
    }
    // A rounded crown boils and rolls over the top as the column falls.
    const x = lean + Math.sin(8 - t * 3) * 11, y = -5 - h;
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 + t * 2, r = (5 + 2 * Math.sin(t * 5 + k)) * column;
      p.disc(x + Math.cos(a) * 10 * column, y + Math.sin(a) * 5 * column, r + 3, C[2], column);
      p.disc(x + Math.cos(a) * 10 * column - 2, y + Math.sin(a) * 5 * column - 2, r, C[4], column * .9);
    }
    p.glow(x, y, 25, C[3], .28 * column);
  }

  // Offset curling waves roll outward. Each line of overlapping rounded blobs bends over at its crest.
  for (let k = 0; k < 4; k++) {
    const delay = .22 + k * .13, age = t - delay; if (age <= 0) continue;
    const u = clamp(age / 1.55), live = Math.sin(Math.PI * u) * fade;
    if (live <= 0) continue;
    const dir = k % 2 ? 1 : -1, spread = 20 + k * 8, height = 35 + (k % 3) * 9;
    for (let j = 0; j <= 30; j++) {
      const v = j / 30, angle = v * Math.PI * .8, x = dir * (9 + spread * u + 32 * Math.sin(angle) * u), y = -height * Math.sin(angle) * live - 4;
      const r = (3 + 5 * Math.sin(Math.PI * v)) * live;
      p.disc(x, y, r + 2, C[1], .7 * live);
      p.disc(x, y - 1, r, C[3], .83 * live);
      p.disc(x - dir * 1.5, y - 2, Math.max(1, r * .45), C[4], .82 * live);
      if (j % 6 === 0) p.dot(x, y - r - 1, C[5], live);
    }
  }

  // Irregular droplets rise, spread and fall; clusters of foam skim the surface.
  for (let i = 0; i < 72; i++) {
    const delay = .12 + rand(i, o.seed, 1) * 1.55, age = t - delay, life = .65 + rand(i, o.seed, 2) * 1.05;
    if (age <= 0 || age >= life) continue;
    const u = age / life, a = rand(i, o.seed, 3) * TAU, speed = 32 + rand(i, o.seed, 4) * 85;
    const x = Math.cos(a) * speed * u, y = -8 - (40 + Math.abs(Math.sin(a)) * 85) * u + 83 * u * u;
    const k = Math.sin(Math.PI * u) * fade, r = (i % 7 === 0 ? 3.5 : 1.6) * k;
    p.disc(x, y, r + 1, C[2], k * .65); p.disc(x - .5, y - .5, r, C[4], k);
    if (i % 6 === 0) p.dot(x - 1, y - 1, WHITE, k);
    if (i % 11 === 0) sparkle(p, x, y, 2 + 2 * k, WHITE, C[4], .4 * k);
  }
  if (burst > 0) { p.glow(0, -12, 62, C[5], .38 * burst); sparkle(p, 0, -12, 13 * burst, WHITE, C[5], burst); }
}
