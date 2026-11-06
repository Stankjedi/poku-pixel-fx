import {
  sparkle
} from "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WP6F6TUS.js";
import {
  TAU,
  WHITE,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/dimensional-convergence.ts
var meta = {
  addedAt: "2026-11-02T13:49:39Z",
  name: "Dimensional convergence",
  desc: "A luminous floor sigil unfolds into rotating orbit rings, a prismatic core and rising arcane fragments before the rift collapses.",
  tags: ["arcane", "summon", "dimensional", "portal", "convergence", "magic", "ritual", "ground", "one-shot"],
  size: [192, 144],
  origin: [96, 126],
  duration: 3.2,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#110d34", "#292262", "#5741a8", "#865ce0", "#66cbea", "#b6fcff", "#ffffff"], seed: 101 }
};
var clamp01 = (n) => Math.max(0, Math.min(1, n));
var easeOut = (n) => 1 - Math.pow(1 - clamp01(n), 3);
var fadeOut = (t) => 1 - clamp01((t - 2.55) / 0.65);
function draw(p, t, o) {
  if (t >= meta.duration - 1e-6 || t <= 0) return;
  const C = fit(o.palette, 7), fade = fadeOut(t), rise = easeOut(t / 0.52), cy = -57, phase = t * 1.7;
  const aura = Math.min(1, fade * 1.15);
  for (let ring = 0; ring < 3; ring++) {
    const R = (22 + ring * 13) * rise, H = R * 0.26;
    for (let j = 0; j < 150; j++) {
      const a = j * TAU / 150, shift = phase * (ring % 2 ? -1 : 1);
      const hot = Math.sin(a * 6 + shift * 2) > 0.76;
      p.dot(Math.cos(a) * R, -4 + Math.sin(a) * H, hot ? C[5] : C[3 + ring % 2], fade * (ring === 1 ? 0.85 : 0.65));
    }
  }
  p.glow(0, -4, 53 * rise, C[3], 0.22 * fade);
  for (let i = 0; i < 4; i++) {
    const a = phase * 0.5 + i * TAU / 4, x = Math.cos(a) * 45 * rise, y = -4 + Math.sin(a) * 10 * rise;
    const z = 2.5 * rise;
    p.poly([[x, y - z], [x + z, y], [x, y + z], [x - z, y]], C[4], fade * 0.75);
    p.dot(x, y, C[6], fade);
    if (rise > 0.5) p.line(x * 0.85, y, x * 0.62, y - (2 + rise * 2), C[3], fade * 0.5);
  }
  const opening = easeOut((t - 0.13) / 0.42) * fade;
  const shiver = Math.sin(t * 13) * 1.4 + Math.sin(t * 7) * 2;
  const centerY = -57, width = (24 + 3 * Math.sin(t * 4)) * opening, height = 43 * opening;
  if (width > 1 && height > 1) {
    const wobble = (i) => Math.sin(t * 5 + i * 2.1) * width * 0.12;
    const shell = [[0, centerY - height], [width * 0.36 + wobble(0), centerY - height * 0.65], [width * 0.8 + wobble(1), centerY - height * 0.4], [width, centerY + shiver], [width * 0.72 + wobble(2), centerY + height * 0.48], [width * 0.34 + wobble(3), centerY + height * 0.76], [0, centerY + height], [-width * 0.36 + wobble(4), centerY + height * 0.68], [-width * 0.85 + wobble(5), centerY + height * 0.35], [-width, centerY - shiver], [-width * 0.8 + wobble(6), centerY - height * 0.4], [-width * 0.35 + wobble(7), centerY - height * 0.72]];
    p.poly(shell, C[1], aura);
    const sweep = Math.sin(t * 3.8) * width * 0.22;
    p.poly([[0, centerY - height * 0.92], [width * 0.72 + sweep, centerY - height * 0.19], [width * 0.25 + sweep, centerY + height * 0.2], [0, centerY + height * 0.86], [-width * 0.65 + sweep, centerY + height * 0.08], [-width * 0.28 + sweep, centerY - height * 0.32]], C[2], aura);
    p.poly([[0, centerY - height * 0.78], [width * 0.37 + sweep, centerY - height * 0.18], [width * 0.2 + sweep, centerY + height * 0.18], [0, centerY + height * 0.73], [-width * 0.38 + sweep, centerY + height * 0.08], [-width * 0.17 + sweep, centerY - height * 0.3]], C[3], aura);
    p.poly([[0, centerY - height * 0.53], [width * 0.18 + sweep * 0.4, centerY - height * 0.08], [0, centerY + height * 0.5], [-width * 0.17 + sweep * 0.4, centerY + height * 0.08]], C[4], aura);
    p.glow(0, centerY, 37 * opening, C[3], 0.5 * aura);
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1, y = centerY - height * 0.72 + i / 8 * height * 1.44;
      const tip = side * (width * (1.08 + 0.32 * rand(i, o.seed, 55)) + 3 * Math.sin(t * 8 + i));
      p.poly([[side * width * 0.55, y - 5], [tip, y - 7], [side * (width * 0.85), y + 2], [side * width * 0.35, y + 6]], C[i % 3 === 0 ? 4 : 2], fade * 0.9);
      p.line(side * width * 0.55, y - 5, tip, y - 7, C[4], fade * 0.8);
    }
  }
  const open = easeOut((t - 0.15) / 0.7);
  for (let ring = 0; ring < 3; ring++) {
    const rx = (18 + ring * 11) * open, ry = (24 + ring * 12) * open, shift = phase * (ring % 2 ? -1 : 1);
    if (rx < 1) continue;
    for (let j = 0; j < 180; j++) {
      const a = j * TAU / 180, pulse = Math.sin(a * 7 + shift * 2), hot = pulse > 0.86;
      const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      p.dot(x, y, hot ? C[6] : C[2 + ring], fade * (hot ? 1 : 0.6));
      if (hot && j % 9 === 0) p.light(x, y, C[4], 0.35 * fade);
    }
    for (let i = 0; i < 6; i++) {
      const a = shift + i * TAU / 6, x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      sparkle(p, x, y, 3 * fade, C[6], C[4], 0.35 * fade);
    }
  }
  const core = Math.sin(Math.PI * clamp01((t - 0.2) / 2.9));
  if (core > 0) {
    const r = (11 + 4 * Math.sin(t * 2.5)) * open, x = Math.cos(phase) * r * 0.34;
    p.poly([[x, cy - r * 1.5], [x + r, cy], [x, cy + r * 1.5], [x - r, cy]], C[2], aura);
    p.line(x, cy - r * 1.5, x + r, cy, C[5], aura);
    p.line(x + r, cy, x, cy + r * 1.5, C[4], aura);
    p.line(x, cy + r * 1.5, x - r, cy, C[3], aura);
    p.line(x - r, cy, x, cy - r * 1.5, C[6], aura);
    p.line(x, cy - r * 0.9, x, cy + r * 0.9, C[5], 0.8 * aura);
    p.glow(x, cy, 22, C[4], 0.35 * core * fade);
    sparkle(p, x, cy, (4 + 3 * core) * fade, WHITE, C[4], 0.45 * core * fade);
  }
  const beam = Math.max(0, 1 - Math.abs(t - 1.05) / 0.32) * fade;
  if (beam > 0) {
    p.glowLine(0, -5, 0, -108, 12, C[4], 0.35 * beam);
    p.line(0, -5, 0, -108, C[6], beam);
    p.line(-2, -10, -2, -102, C[4], beam * 0.7);
    p.line(2, -10, 2, -102, C[4], beam * 0.7);
  }
  for (const burstTime of [0.82, 1.93]) {
    const u = (t - burstTime) / 0.65;
    if (u <= 0 || u >= 1) continue;
    const r = 9 + 65 * easeOut(u), a = (1 - u) * fade;
    for (let j = 0; j < 100; j++) {
      const ang = j * TAU / 100, gap = rand(Math.floor(j / 4), o.seed, Math.round(burstTime * 100));
      if (gap < 0.23) continue;
      const rr = r + (gap - 0.5) * 7, x = Math.cos(ang) * rr, y = centerY + Math.sin(ang) * rr * 0.72;
      p.dot(x, y, C[5], a);
      p.dot(x + Math.cos(ang) * 2, y + Math.sin(ang) * 1.5, C[3], a * 0.8);
    }
    for (let j = 0; j < 18; j++) {
      const angle = rand(j, o.seed, 81) * TAU, d = r * (0.45 + 0.5 * rand(j, o.seed, 83)), x = Math.cos(angle) * d, y = centerY + Math.sin(angle) * d * 0.68;
      const length = (4 + 9 * rand(j, o.seed, 84)) * (1 - u), dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
      p.poly([[x - dy * 0.18, y + dx * 0.18], [x + dx, y + dy], [x + dy * 0.18, y - dx * 0.18]], C[j % 3 ? 4 : 5], a);
      p.glow(x, y, 5, C[4], 0.25 * a);
    }
    if (u < 0.14) {
      p.disc(0, centerY, 17 * (1 - u / 0.14), C[6], 0.72 * a);
      p.glow(0, centerY, 50, C[5], 0.7 * a);
    }
  }
  for (let i = 0; i < 28; i++) {
    const delay = 0.18 + rand(i, o.seed, 1) * 0.9, u = clamp01((t - delay) / 1.65);
    if (u <= 0 || u >= 1) continue;
    const angle = rand(i, o.seed, 2) * TAU + u * (i % 2 ? 2.4 : -2.1), radius = (12 + rand(i, o.seed, 3) * 35) * (0.3 + u * 0.7);
    const x = Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius * 0.58 - u * 20, k = Math.sin(Math.PI * u) * fade;
    if (i % 3 === 0) sparkle(p, x, y, 3 * k, C[6], C[4], 0.32 * k);
    else {
      p.dot(x, y, C[i % 2 ? 4 : 5], k);
      p.light(x, y, C[3], 0.3 * k);
    }
  }
}
export {
  draw,
  meta
};
