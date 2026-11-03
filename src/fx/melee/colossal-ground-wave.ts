import type { Painter, ShaderOutput } from "../../core/painter.js";
import { clamp, fit, rand, smooth, WHITE } from "../../core/index.js";

/**
 * Colossal upright sword-energy wave that ploughs through the floor.
 * Authored in local coordinates. The leading cutting edge stays vertically
 * continuous; trailing blade and ground wake separate into readable layers.
 */
export const meta = {
  name: "Colossal ground-cutting sword wave",
  desc: "A towering vertical blade of azure sword energy rips forward at ground level, throwing stone, continuous hot cracks, dust, speed ribbons and lightning from the cutting edge.",
  tags: ["melee", "projectile", "sword", "slash", "energy", "ground", "cinematic", "one-shot"],
  size: [360, 160],
  origin: [160, 132],
  duration: 1.45,
  loop: false,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#071527", "#112a50", "#165483", "#168bb7", "#35d3e7", "#8cfcff", "#e4ffff", "#ffffff"],
    speed: 275,
    height: 94,
    seed: 27,
  },
};

type Options = { palette: (string | number)[]; speed: number; height: number; seed: number };
const fract = (v: number) => v - Math.floor(v);

export function draw(p: Painter, t: number, o: Options) {
  const C = fit(o.palette, 8);
  const advance = clamp((t - 0.06) / 1.02);
  const x = -145 + o.speed * Math.max(0, t - 0.06);
  const h = o.height * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, advance)));
  const opening = smooth(0, 0.13, t);
  const exit = 1 - smooth(1.17, 1.45, t);
  const power = opening * exit;
  if (power <= 0.002) return;

  // Ground gouge: remains at the location the cutting edge just passed.
  const start = -145, end = Math.min(x, 176);
  if (end > start) {
    p.shade(start - 2, -5, end + 2, 7, (px, py, out: ShaderOutput) => {
      const age = (x - px) / Math.max(1, o.speed);
      if (age < 0 || age > 0.95) return;
      const jitter = (rand(Math.floor(px / 3), Math.floor(py), o.seed) - 0.5) * 2.3;
      const width = 2.3 + 2.7 * Math.exp(-age * 3);
      if (Math.abs(py - jitter) > width) return;
      const heat = Math.exp(-age * 4.2);
      out.c = Math.abs(py - jitter) < 1.1 ? (heat > 0.52 ? C[6] : C[4]) : heat > 0.36 ? C[2] : C[0];
      out.a = power * (0.85 - age * 0.5);
    });
    for (let i = 0; i < 36; i++) {
      const sx = start + i * 9.1 + rand(i, 0, o.seed) * 3;
      if (sx >= x - 3) continue;
      const age = (x - sx) / o.speed;
      if (age > 0.8) continue;
      const len = 4 + rand(i, 2, o.seed) * 17;
      const dir = i % 2 ? 1 : -1;
      const bend = 2 + rand(i, 1, o.seed) * 7;
      const alpha = (1 - age / 0.8) * power;
      p.line(sx, 0, sx - len * 0.35, dir * bend, age < 0.17 ? C[5] : C[2], alpha * 0.75);
      p.line(sx - len * 0.35, dir * bend, sx - len, dir * (bend + 3), C[1], alpha * 0.7);
    }
  }

  // Raised chunks, sparks, and dust tied to each point along the gouged track.
  for (let i = 0; i < 115; i++) {
    const sx = -145 + i * 3.1 + rand(i, 1, o.seed) * 4;
    const age = (x - sx) / o.speed;
    if (age < 0 || age > 0.64) continue;
    const side = i % 2 ? -1 : 1;
    const v = 10 + rand(i, 2, o.seed) * 65;
    const rise = (24 + 68 * rand(i, 3, o.seed)) * age - 96 * age * age;
    const dx = side * v * age - age * 18;
    const y = -Math.max(0, rise) + (rand(i, 4, o.seed) - 0.5) * 5;
    const size = 1 + Math.floor(rand(i, 5, o.seed) * 3);
    const col = i % 5 === 0 ? C[5] : i % 3 === 0 ? C[3] : C[1];
    p.rect(sx + dx, y, size, size, col, (1 - age / 0.64) * power);
    if (i % 4 === 0) p.line(sx + dx, y, sx + dx - 6 - age * 15, y + 3, C[4], (1 - age / 0.64) * power * 0.6);
  }

  // Dense curved wing: all blade pixels are shaded together, never dotted or sparse.
  const back = 55;
  p.shade(x - back - 10, -h - 11, x + 10, 3, (px, py, out: ShaderOutput) => {
    const u = (x - px) / back; // 0 = cutting edge; 1 = trailing end
    if (u < -0.11 || u > 1.12) return;
    const z = clamp(-py / h);
    if (z < 0 || z > 1.1) return;
    // The very tip leans backward; the ground contact remains sharp.
    const bowed = 8.5 * Math.sin(z * Math.PI * 0.86) + 9 * z * z;
    const streak = (px - (x - bowed)) / back;
    const span = (1 - Math.pow(z, 1.45)) * (1 - 0.64 * smooth(0.7, 1, z));
    const wake = 1 - smooth(0.03, 1.0, streak);
    const upper = Math.pow(Math.sin(Math.PI * clamp(z)), 0.24);
    const turbulent = 2.2 * Math.sin(26 * z + t * 32) + 1.8 * Math.sin(53 * z - t * 19);
    if (streak < -0.04 || streak > Math.max(0.022, span * wake) + turbulent / back) return;
    // hot rim, high-energy core, sapphire body, dissolving feather edge
    const rim = Math.abs(px - (x - bowed));
    const tail = clamp(streak / Math.max(0.09, span));
    const filament = Math.sin(85 * z - tail * 13 + t * 38) * Math.sin(26 * z + t * 17);
    const index = rim < 2.6 ? 7 : rim < 5.2 ? 6 : tail < 0.24 ? 5 : tail < 0.55 ? 4 : filament > 0.48 ? 4 : tail < 0.78 ? 3 : 2;
    out.c = C[index];
    out.a = power * (1 - 0.24 * tail) * (0.82 + 0.18 * upper);
  });

  // Secondary filament curves trail behind the main dense blade.
  for (let j = 0; j < 7; j++) {
    const z0 = 0.14 + j * 0.116;
    const prev: [number, number][] = [];
    for (let k = 0; k <= 13; k++) {
      const s = k / 13;
      const z = z0 + 0.11 * Math.sin(s * Math.PI * 1.3 + j);
      prev.push([x - 10 - s * (42 + j * 5), -z * h + Math.sin(s * 7 + j * 3 + t * 22) * 3]);
    }
    p.polyline(prev, j % 3 === 0 ? C[5] : C[3], power * (0.75 - j * 0.05));
  }

  // Cutting rim: thin uninterrupted white-hot edge with vivid controlled glow.
  for (let i = 0; i <= 42; i++) {
    const z = i / 42, yy = -h * z;
    const xx = x - 8.5 * Math.sin(z * Math.PI * 0.86) - 9 * z * z;
    p.line(xx, yy, xx - 1.5, yy - h / 42, z < 0.9 ? WHITE : C[6], power);
    if (i % 5 === 0) p.glow(xx - 1, yy, 13, C[4], power * 0.18);
  }
  // Pressure bow-wave and contact flash.
  p.glow(x, -5, 40, C[4], power * 0.65);
  p.glow(x, -3, 13, WHITE, power * 0.75);
  p.line(x + 3, -2, x + 19, -8, C[6], power * 0.8);
  p.line(x + 2, 0, x + 23, 5, C[4], power * 0.7);

  // Fast, deliberately sparse silhouette accents (not a replacement for the filled blade).
  for (let i = 0; i < 28; i++) {
    const z = fract(rand(i, 3, o.seed) + t * (0.7 + rand(i, 6, o.seed) * 1.1));
    const sx = x - 24 - rand(i, 4, o.seed) * 55;
    const sy = -h * z;
    const length = 5 + 24 * rand(i, 7, o.seed);
    p.line(sx, sy, sx - length, sy + (rand(i, 8, o.seed) - 0.5) * 5, i % 4 === 0 ? C[5] : C[3], power * 0.65);
  }
}
