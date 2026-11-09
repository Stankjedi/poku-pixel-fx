import {
  sparkle
} from "./chunk-JQXGDKYD.js";
import "./chunk-NPBZD3DI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  TAU,
  WHITE,
  clamp,
  fit
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/holy/seraphic-verdict.ts
var meta = {
  addedAt: "2026-11-02T13:49:39Z",
  name: "Seraphic verdict",
  desc: "A golden seal unfolds into a cascading pillar of light; radiant wings and concentric halos burst outward before falling into motes.",
  tags: ["holy", "seraph", "divine", "verdict", "beam", "wings", "light", "burst", "one-shot"],
  size: [240, 220],
  origin: [120, 200],
  duration: 2.8,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#30193e", "#8b4d47", "#cf8b46", "#f8c665", "#fff1ae", "#ffffff"], seed: 23 }
};
var peak = (t, a, b) => clamp((t - a) / (b - a));
function draw(p, t, o) {
  if (t >= meta.duration) return;
  const c = fit(o.palette, 6), appear = peak(t, 0.04, 0.32), fade = 1 - peak(t, 1.85, 2.8);
  const blast = peak(t, 0.22, 0.36), pulse = Math.exp(-Math.max(0, t - 0.28) * 3), y = -86;
  const beam = appear * fade * (1 - 0.78 * peak(t, 0.88, 1.5)) * (1 + 0.25 * Math.sin(t * 13));
  if (beam > 0) {
    p.glow(0, y, 82, c[3], 0.23 * beam);
    p.rect(-14, -185, 28, 180, c[1], 0.25 * beam);
    p.rect(-9, -185, 18, 180, c[2], 0.4 * beam);
    p.rect(-4, -185, 8, 180, c[4], 0.58 * beam);
    p.rect(-1, -185, 2, 180, WHITE, 0.72 * beam);
    for (let i = 0; i < 12; i++) {
      const phase = (t * 0.6 + i * 0.137) % 1, yy = -185 + phase * 180;
      const xx = Math.sin(i * 31 + o.seed) * 12;
      p.line(xx, yy, xx, yy - 12 - 14 * phase, c[4], 0.6 * beam * (1 - phase));
    }
  }
  for (let ring = 0; ring < 3; ring++) {
    const r = (18 + ring * 21) * (0.35 + 0.65 * blast), yr = 3.2 + ring * 2.2, ry = -4 - ring * 3;
    const alpha = fade * (0.8 - ring * 0.12) * appear;
    for (let j = 0; j < 144; j++) {
      const a = TAU * j / 144, x = Math.cos(a) * r, z = Math.sin(a) * yr;
      p.dot(x, ry + z, j % 9 < 2 ? c[5] : c[3], alpha);
      if (j % 18 === 0) p.glow(x, ry + z, 6, c[3], 0.25 * alpha);
    }
  }
  const wing = appear * fade * (1 - peak(t, 0.94, 1.63)), stretch = (0.3 + 0.7 * blast) * (1 + 0.12 * Math.sin(t * 4));
  if (wing > 0.01) for (let i = 0; i < 72; i++) {
    if (i % 12 < 3) continue;
    const a = i * TAU / 72, r = 20 + 11 * blast;
    p.dot(Math.cos(a) * r, y + Math.sin(a) * r * 0.42, c[i % 9 === 0 ? 5 : 3], wing * 0.75);
  }
  const flex = Math.sin(t * 3.4) * 5 * fade;
  for (const side of [-1, 1]) {
    const sideStretch = stretch * (side < 0 ? 0.91 + 0.09 * Math.sin(t * 3.3) : 1.04 + 0.07 * Math.cos(t * 4.2));
    const S = (x) => side * x * sideStretch;
    p.poly([[S(6), y + 9], [S(30), y - 18 + flex], [S(77), y - 32 + flex], [S(97), y - 17 + flex], [S(63), y + 5], [S(24), y + 22]], c[1], wing * 0.9);
    p.poly([[S(8), y + 8], [S(32), y - 14 + flex], [S(82), y - 27 + flex], [S(68), y - 8], [S(26), y + 14]], c[2], wing);
    p.poly([[S(12), y + 5], [S(39), y - 13 + flex], [S(77), y - 20 + flex], [S(53), y - 4], [S(27), y + 9]], c[3], wing);
    for (let j = 0; j < 6; j++) {
      const sx = 24 + j * 9, tip = 60 + j * 7, sy = y - 6 + j * 3 + flex * 0.45;
      p.poly([[S(sx), sy], [S(tip), sy - 13 + j], [S(tip - 8), sy + 2], [S(sx + 5), sy + 8]], j % 2 ? c[4] : c[3], wing * 0.92);
      p.line(S(sx), sy + 3, S(tip - 5), sy - 8 + j, c[5], wing * 0.7);
    }
  }
  for (let j = 0; j < 20; j++) {
    const q = clamp((t - 0.18 - j * 0.013) / 1.05), a = j * 2.399 + o.seed * 0.03, rr = 8 + q * 88, x = Math.cos(a) * rr, yy = y + Math.sin(a) * rr * 0.65;
    const strength = Math.sin(Math.PI * q) * fade;
    if (strength <= 0) continue;
    const z = 2 + 3 * strength;
    p.poly([[x, yy - z * 1.8], [x + z, yy], [x, yy + z * 1.8], [x - z, yy]], c[j % 3 === 0 ? 5 : 3], strength);
    p.line(x, yy, x - Math.cos(a) * 12 * strength, yy - Math.sin(a) * 10 * strength, c[3], strength * 0.5);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const skew = side < 0 ? 0.84 + 0.12 * Math.sin(t * 4) : 1 + 0.08 * Math.cos(t * 3);
    const x = side * (14 + i * 7) * stretch * skew, yy = y + 4 + i * 3 + (side < 0 ? -4 : 3) * Math.sin(t * 3);
    const tipx = side * (44 + i * 8) * stretch * skew, tipy = y - 18 + i * 6 + (side < 0 ? -5 : 7) * Math.sin(t * 3.4);
    p.line(side * 3, y + 14, x, yy, c[2], wing * 0.75);
    p.line(x, yy, tipx, tipy, c[i % 2 ? 3 : 4], wing);
    p.line(x, yy + 2, tipx * 0.88, tipy + 6, c[2], wing * 0.6);
    if (i % 2 === 0) sparkle(p, tipx, tipy, 1 + 2 * wing, c[5], c[3], wing * 0.65);
  }
  const detonation = Math.exp(-Math.abs(t - 1.34) * 9) * fade;
  if (detonation > 0.01) {
    sparkle(p, 0, y, 34 * detonation, WHITE, c[4], detonation);
    p.glow(0, y, 62, c[4], detonation * 0.65);
  }
  for (let j = 0; j < 38; j++) {
    const u = clamp((t - 1.03 - j * 8e-3) / 1.42);
    if (u <= 0 || u >= 1) continue;
    const a = j * 2.399 + o.seed * 0.03, speed = 30 + j % 6 * 12, x = Math.cos(a) * speed * u + (j % 2 ? 8 : -4) * u * u;
    const yy = y + Math.sin(a) * speed * u * 0.68 + 38 * u * u, k = Math.sin(Math.PI * u) * fade;
    const z = (j % 4 === 0 ? 5 : 2) * (1 - 0.6 * u);
    p.poly([[x, yy - z * 2], [x + z, yy], [x, yy + z], [x - z, yy]], c[j % 4 === 0 ? 5 : 3], k);
    p.line(x, yy, x - Math.cos(a) * 16 * k, yy - Math.sin(a) * 10 * k, c[4], k * 0.6);
  }
  for (let i = 0; i < 8; i++) {
    const u = clamp((t - 0.8 - i * 0.08) / 1.7);
    if (u <= 0 || u >= 1) continue;
    const side = i % 2 ? 1 : -1, x = side * (19 + i * 7) + Math.sin(u * 5 + i) * 7;
    const yy = y - 4 + u * (58 + i * 3), len = (5 + i % 3) * Math.sin(Math.PI * u);
    const alpha = Math.sin(Math.PI * u) * fade;
    p.poly([[x, yy - len], [x + side * 2, yy - 1], [x, yy + len], [x - side * 2, yy + 1]], c[3], alpha);
    p.line(x, yy - len, x, yy + len, c[5], alpha * 0.75);
  }
  if (pulse > 0.01) {
    sparkle(p, 0, y, 10 + 24 * pulse, WHITE, c[4], fade);
    p.glow(0, y, 52, c[4], 0.6 * pulse * fade);
  }
  for (let i = 0; i < 32; i++) {
    const phase = (t * 0.32 + i * 0.381 + o.seed * 0.071) % 1;
    const x = Math.sin(i * 71 + o.seed) * 78, yy = -12 - phase * 170;
    const alpha = Math.sin(Math.PI * phase) * fade * appear;
    p.dot(x, yy, i % 3 === 0 ? c[5] : c[3], alpha);
    if (i % 6 === 0) sparkle(p, x, yy, 1 + 2 * alpha, c[5], c[3], alpha * 0.7);
  }
}
export {
  draw,
  meta
};
