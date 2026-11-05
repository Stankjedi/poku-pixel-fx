import {
  sparkle
} from "./chunk-KJLRN7JI.js";
import "./chunk-NY4VHNMV.js";
import {
  WHITE,
  clamp,
  fit,
  rand,
  smooth
} from "./chunk-WFSCDWU6.js";
import "./chunk-T3JNBT34.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/fire/volcanic-cataclysm.ts
var meta = {
  addedAt: "2026-11-02T13:49:39Z",
  name: "Volcanic cataclysm",
  desc: "The ground tears open in a red-hot fissure, a giant eruption rises, and molten shards shower out through an expanding shockwave.",
  tags: ["fire", "lava", "volcano", "eruption", "explosion", "fissure", "ground", "debris", "one-shot"],
  size: [300, 230],
  origin: [150, 204],
  duration: 3.6,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1b0b18", "#511827", "#a2271f", "#e84a20", "#ff8628", "#ffc84c", "#fff0a1", "#ffffff"], seed: 57 }
};
function draw(p, t, o) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8), S = o.seed * 19;
  const eruption = smooth(0.08, 0.36, t) * (1 - smooth(1.15, 2.8, t));
  const fade = 1 - smooth(2.35, 3.6, t);
  const flare = Math.max(0, 1 - Math.abs(t - 0.23) / 0.2);
  const crack = smooth(0, 0.25, t) * fade;
  const segs = [[-115, -2, -77, -8], [-77, -8, -43, -3], [-43, -3, 0, -5], [0, -5, 34, -1], [34, -1, 68, -7], [68, -7, 114, -2]];
  for (const [x, y, x2, y2] of segs) {
    p.line(x, y, x2, y2, C[1], crack);
    p.line(x, y - 1, x2, y2 - 1, C[3], crack);
    p.line(x * 0.9, y + 1, x2 * 0.9, y2 + 1, C[5], crack * 0.7);
  }
  p.glow(0, -9, 75, C[3], 0.7 * crack);
  p.glow(0, -24, 48, C[5], 0.5 * flare);
  if (t < 1.1) {
    const u = clamp(t / 1.1), radius = 18 + u * 119, alpha = (1 - u) * 0.85;
    for (let i = 0; i < 100; i++) {
      const a = i * Math.PI * 2 / 100;
      p.dot(Math.cos(a) * radius, -4 + Math.sin(a) * radius * 0.09, i % 5 === 0 ? C[7] : C[4], alpha);
    }
  }
  const force = smooth(0.08, 0.32, t) * (1 - smooth(1.7, 3.35, t));
  if (force > 0.01) {
    const height = 150 * Math.min(1, force * 1.8);
    for (let i = 0; i < 12; i++) {
      const age = t - (0.18 + i * 0.075);
      if (age <= 0 || age >= 1.5) continue;
      const q = age / 1.5, side = i % 2 ? 1 : -1;
      const x = side * (16 + rand(i, S + 110) * 24 + q * (12 + rand(i, S + 111) * 23));
      const y = -12 - q * (65 + rand(i, S + 112) * 55), r = (5 + q * 10) * (1 - 0.35 * q);
      const alpha = Math.sin(Math.PI * q) * fade * 0.45;
      p.disc(x, y, r, C[0], alpha);
      p.disc(x - 2, y - 3, r * 0.55, C[1], alpha * 0.55);
    }
    for (let j = 0; j < 13; j++) {
      const f = rand(j, S + 70), g = rand(j, S + 71);
      const x = (f - 0.5) * 92, y = -height * (0.48 + 0.42 * g) - 6;
      const rr = (9 + 13 * rand(j, S + 72)) * Math.min(1, force * 2);
      p.disc(x, y, rr, C[0], 0.72 * force);
      p.disc(x - rr * 0.2, y - rr * 0.18, rr * 0.68, C[1], 0.4 * force);
    }
    p.shade(-67, -height - 10, 67, -3, (x, y, out) => {
      const h = (-y - 3) / height;
      if (h < 0 || h > 1) return;
      const wobble = Math.sin(y * 0.115 + t * 5) * 3 + Math.sin(y * 0.25 - t * 7) * 1.6;
      const width = ((15 + 27 * Math.sin(h * Math.PI * 0.85)) * force + 3) * (1 - smooth(0.82, 1, h));
      if (width < 0.5) return;
      const nx = (x - wobble) / width;
      const edge = Math.abs(nx);
      const rough = rand(Math.floor(x / 3), Math.floor(y / 3), S + 75);
      if (edge > 1 + 0.17 * (rough - 0.5)) return;
      out.a = Math.min(1, force * 2);
      const band = Math.sin(y * 0.23 + t * 13 + nx * 7) + Math.sin(x * 0.18 - y * 0.1 - t * 5);
      const heat = (1 - edge) * 1.1 + (1 - h) * 0.35 + band * 0.11;
      if (edge > 0.82) out.c = C[1];
      else if (heat < 0.38) out.c = C[2];
      else if (heat < 0.65) out.c = C[3];
      else if (heat < 0.95) out.c = C[4];
      else if (heat < 1.25) out.c = C[5];
      else out.c = C[6];
      if (rough > 0.91 && edge < 0.72) out.c = C[Math.max(2, Math.min(6, Math.floor(heat * 4)))];
      if (heat > 1.05) {
        out.l = C[4];
        out.k = 0.12 * force;
      }
    });
    p.glow(0, -height * 0.38, 46, C[3], 0.18 * force);
  }
  for (let i = 0; i < 22; i++) {
    const q = rand(i, S + 90), side = i % 2 ? 1 : -1;
    const x = side * (14 + q * 64), rise = (3 + rand(i, S + 91) * 13) * force;
    const w = 4 + rand(i, S + 92) * 9;
    p.beam(x - w / 2, -2, x + w / 2, -2 - rise * 0.2, Math.max(2, rise * 0.45), C[1], fade);
    p.line(x - w / 2, -3 - rise * 0.2, x + w / 2, -3 - rise * 0.4, C[3], fade * force);
    if (i % 3 === 0) p.dot(x, -4 - rise * 0.3, C[5], fade * force);
  }
  for (let i = 0; i < 13; i++) {
    const age = t - 0.24 - i * 0.035, life = 1.25 + rand(i, S + 103) * 0.5;
    if (age <= 0 || age >= life) continue;
    const u = age / life, side = i % 2 ? 1 : -1;
    const x = side * (8 + rand(i, S + 104) * 42) * u, y = -15 - (42 + rand(i, S + 105) * 95) * u + 35 * u * u;
    const r = (3 + rand(i, S + 106) * 4) * (1 - 0.35 * u), a = Math.sin(Math.PI * u) * fade;
    p.poly([[x - r, y], [x - r * 0.45, y - r], [x + r * 0.65, y - r * 0.7], [x + r, y + r * 0.3], [x, y + r]], C[0], a);
    p.line(x - r * 0.4, y, x + r * 0.5, y - r * 0.35, C[3], a * (1 - u));
  }
  for (let i = 0; i < 34; i++) {
    const phase = rand(i, S), width = rand(i, S + 1), shift = rand(i, S + 2);
    const height = (38 + phase * 115) * eruption;
    const x = (i - 16.5) * 2.4;
    const y = -8 - height * (0.65 + 0.35 * Math.sin(t * 9 + phase * 8) ** 2);
    const drift = (shift - 0.5) * height * 0.31;
    const hot = phase > 0.73 ? C[6] : phase > 0.35 ? C[4] : C[3];
    const a = eruption * (0.45 + 0.55 * width);
    p.line(x, -6, x + drift, y, hot, a);
    p.line(x + 1, -6, x + drift + 1, y + 6, C[2], a * 0.75);
    if (height > 18) p.disc(x + drift, y, 1.4 + width * 2.6, hot, a);
  }
  for (let i = 0; i < 65; i++) {
    const start = 0.12 + rand(i, S + 3) * 0.62, life = 1.15 + rand(i, S + 4) * 0.72, age = (t - start) / life;
    if (age <= 0 || age >= 1) continue;
    const vx = (rand(i, S + 5) - 0.5) * 205, vy = -(90 + rand(i, S + 6) * 145);
    const x = vx * age, y = -8 + vy * age + 110 * age * age;
    if (y > 5) continue;
    const a = Math.sin(Math.PI * age) * fade, r = 1 + rand(i, S + 7) * 3.4;
    p.disc(x, y, r + 1, C[0], a * 0.9);
    p.disc(x, y, r, age < 0.65 ? C[3] : C[1], a);
    p.dot(x - 1, y - 1, age < 0.45 ? C[6] : C[4], a);
    if (i % 5 === 0) p.glow(x, y, 5 + r, C[4], a * 0.35);
  }
  if (flare > 0) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, r = 12 + 26 * (1 - flare);
    sparkle(p, Math.cos(a) * r, -22 + Math.sin(a) * r * 0.45, 1 + 3 * flare, WHITE, C[5], flare * 0.7);
  }
}
export {
  draw,
  meta
};
