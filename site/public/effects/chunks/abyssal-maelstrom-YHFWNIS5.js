import {
  sparkle
} from "./chunk-SRKY5KGN.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-7OMNYR2P.js";
import {
  TAU,
  WHITE,
  clamp,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/water/abyssal-maelstrom.ts
var meta = {
  addedAt: "2026-11-02T13:49:39Z",
  name: "Abyssal maelstrom",
  desc: "A deep blue surge erupts as a curling liquid column, breaks into foamy waves and droplets, then recedes into spreading ripples.",
  tags: ["water", "tidal", "vortex", "maelstrom", "whirlpool", "magic", "burst", "ocean", "splash", "one-shot"],
  size: [240, 180],
  origin: [120, 156],
  duration: 3.2,
  loop: false,
  fps: 24,
  bg: "ground",
  options: { palette: ["#062943", "#075172", "#087c9d", "#20b9cd", "#7ce8e7", "#d4fff5", "#ffffff"], seed: 29 }
};
function draw(p, t, o) {
  if (t < 0 || t >= meta.duration) return;
  const C = fit(o.palette, 7), fade = clamp((meta.duration - t) / 0.65), burst = clamp(1 - Math.abs(t - 0.34) / 0.24);
  const rise = clamp(t / 0.46), column = rise * clamp((2.05 - t) / 0.75) * fade;
  p.glow(0, -2, 64, C[2], 0.34 * fade * rise);
  for (let k = 0; k < 3; k++) {
    const age = t - k * 0.23;
    if (age <= 0) continue;
    const u = clamp(age / 2.2), rx = 11 + 96 * u, ry = 3 + 13 * u, alpha = (1 - u) * fade;
    for (let j = 0; j < 170; j++) {
      const a = j * TAU / 170, wave = Math.sin(a * 8 + u * 7 + k), x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      if (wave > -0.65) {
        p.dot(x, y, wave > 0.55 ? C[5] : C[3], alpha * 0.85);
        p.dot(x, y + 1, C[2], alpha * 0.55);
      }
    }
  }
  if (column > 0) {
    const h = 105 * rise, lean = Math.sin(t * 2.2) * 10 * rise;
    for (let band = 0; band < 4; band++) {
      const u = 0.18 + band * 0.19, cy = -5 - u * h, rx = (20 + u * 31) * column, ry = (4 + u * 4) * column;
      const cx = lean * u, phase = t * 2 + band * 0.85;
      for (let j = 0; j < 40; j++) {
        const a = j * TAU / 40 + phase, b = (j + 1) * TAU / 40 + phase;
        if (Math.sin(a) > 0 || j % 9 < 2) continue;
        p.line(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cx + Math.cos(b) * rx, cy + Math.sin(b) * ry, C[2], column * 0.65);
      }
    }
    for (let j = 0; j <= 48; j++) {
      const u = j / 48, y2 = -5 - u * h, x2 = lean * u + Math.sin(u * 10 - t * 4) * (5 + 7 * u) * rise;
      const r = (17 - 8 * u + 4 * Math.sin(u * 11 + t * 4)) * column;
      p.disc(x2, y2, Math.max(1, r + 3), C[1], column * 0.8);
      p.disc(x2 - 2, y2 - 1, Math.max(1, r), C[2], column * 0.88);
      p.disc(x2 - 5, y2 - 2, Math.max(1, r * 0.62), C[3], column * 0.7);
      if (j % 5 === 0) {
        p.disc(x2 - r * 0.55, y2 - 2, Math.max(1, r * 0.22), C[4], column * 0.8);
      }
    }
    for (let arm = 0; arm < 3; arm++) {
      for (let j = 0; j < 32; j++) {
        const u = j / 31, phase = u * 10 - t * 4 + arm * TAU / 3;
        const x2 = lean * u + Math.sin(phase) * (5 + 7 * u) * rise;
        const y2 = -5 - u * h + Math.cos(phase) * (3 + 4 * u);
        if (Math.cos(phase) > 0.35) p.dot(x2 - 3, y2 - 2, C[5], column * 0.65);
      }
    }
    for (let band = 0; band < 3; band++) {
      const u = 0.23 + band * 0.22, y2 = -5 - u * h, cx = lean * u + Math.sin(u * 10 - t * 4) * (5 + 7 * u) * rise;
      const rx = (18 + u * 8) * column, ry = (3 + u * 2) * column;
      for (let j = 0; j < 60; j++) {
        const a = j * TAU / 60 + t * 2 + band * 0.8;
        if (Math.sin(a) < -0.25 || j % 8 === 0) continue;
        const x2 = cx + Math.cos(a) * rx, yy = y2 + Math.sin(a) * ry;
        p.dot(x2, yy, j % 5 === 0 ? C[5] : C[3], column * 0.75);
      }
    }
    const x = lean + Math.sin(10 - t * 4) * 12 * rise, y = -5 - h;
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 + t * 2, r = (5 + 2 * Math.sin(t * 5 + k)) * column;
      p.disc(x + Math.cos(a) * 10 * column, y + Math.sin(a) * 5 * column, r + 3, C[2], column);
      p.disc(x + Math.cos(a) * 10 * column - 2, y + Math.sin(a) * 5 * column - 2, r, C[4], column * 0.9);
    }
    p.glow(x, y, 25, C[3], 0.28 * column);
  }
  for (let k = 0; k < 4; k++) {
    const delay = 0.22 + k * 0.13, age = t - delay;
    if (age <= 0) continue;
    const u = clamp(age / 1.55), live = Math.sin(Math.PI * u) * fade;
    if (live <= 0) continue;
    const dir = k % 2 ? 1 : -1, spread = 20 + k * 8, height = 35 + k % 3 * 9;
    for (let j = 0; j <= 30; j++) {
      const v = j / 30, angle = v * Math.PI * 0.8, x = dir * (9 + spread * u + 32 * Math.sin(angle) * u), y = -height * Math.sin(angle) * live - 4;
      const r = (3 + 5 * Math.sin(Math.PI * v)) * live;
      p.disc(x, y, r + 2, C[1], 0.7 * live);
      p.disc(x, y - 1, r, C[3], 0.83 * live);
      p.disc(x - dir * 1.5, y - 2, Math.max(1, r * 0.45), C[4], 0.82 * live);
      if (j % 6 === 0) p.dot(x, y - r - 1, C[5], live);
    }
  }
  for (let i = 0; i < 72; i++) {
    const delay = 0.12 + rand(i, o.seed, 1) * 1.55, age = t - delay, life = 0.65 + rand(i, o.seed, 2) * 1.05;
    if (age <= 0 || age >= life) continue;
    const u = age / life, a = rand(i, o.seed, 3) * TAU, speed = 32 + rand(i, o.seed, 4) * 85;
    const x = Math.cos(a) * speed * u, y = -8 - (40 + Math.abs(Math.sin(a)) * 85) * u + 83 * u * u;
    if (y > 2) continue;
    const k = Math.sin(Math.PI * u) * fade, r = (i % 7 === 0 ? 3.5 : 1.6) * k;
    p.disc(x, y, r + 1, C[2], k * 0.65);
    p.disc(x - 0.5, y - 0.5, r, C[4], k);
    if (i % 6 === 0) p.dot(x - 1, y - 1, WHITE, k);
    if (i % 11 === 0) sparkle(p, x, y, 2 + 2 * k, WHITE, C[4], 0.4 * k);
  }
  if (burst > 0) {
    p.glow(0, -12, 62, C[5], 0.38 * burst);
    sparkle(p, 0, -12, 13 * burst, WHITE, C[5], burst);
  }
}
export {
  draw,
  meta
};
