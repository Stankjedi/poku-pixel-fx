import {
  sparkle
} from "./chunk-BIQMVPKA.js";
import "./chunk-I2D4GEWW.js";
import {
  TAU,
  WHITE,
  clamp,
  fit
} from "./chunk-FEXYTCCO.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/shadow/abyssal-fracture.ts
var meta = {
  addedAt: "2026-11-02T13:49:39Z",
  name: "Abyssal fracture",
  desc: "A serrated violet rift tears through space, draws in orbiting shards and snaps shut in a final flash.",
  tags: ["shadow", "abyss", "rift", "fracture", "void", "portal", "dark", "burst", "one-shot"],
  size: [224, 224],
  origin: [112, 112],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#080510", "#1f1039", "#4e226d", "#9d3dc0", "#e18df2", "#ffffff"], seed: 41 }
};
var ramp = (t, a, b) => clamp((t - a) / (b - a));
function draw(p, t, o) {
  if (t >= meta.duration) return;
  const c = fit(o.palette, 6), rise = ramp(t, 0.08, 0.7), fade = 1 - ramp(t, 2.12, 3), close = 1 - ramp(t, 1.95, 2.65), k = rise * fade;
  const pinch = 1 - 0.7 * ramp(t, 1.03, 1.55), twist = Math.sin(t * 3.2) * 0.22;
  const width = (2 + 37 * rise) * close * pinch * (0.89 + 0.11 * Math.sin(t * 7)), height = 72 * rise * close * (1 - 0.25 * ramp(t, 1.1, 1.7));
  p.glow(0, 0, 74, c[2], 0.32 * k);
  for (let i = 0; i < 7; i++) {
    const a = TAU * i / 7 + 0.12, inner = 37 * rise, outer = (54 + i % 3 * 9) * rise;
    const x = Math.cos(a) * inner, y = Math.sin(a) * inner * 0.8;
    const nx = Math.cos(a) * outer, ny = Math.sin(a) * outer * 0.8;
    p.line(x, y, (x + nx) * 0.5 + 3, (y + ny) * 0.5 - 2, c[2], k * 0.6);
    p.line((x + nx) * 0.5 + 3, (y + ny) * 0.5 - 2, nx, ny, c[3], k * 0.55);
  }
  for (let ring = 0; ring < 3; ring++) {
    const radius = (30 + ring * 20) * (0.5 + 0.5 * rise), rot = t * (ring % 2 ? -0.9 : 1.15), squash = 0.55 + ring * 0.11;
    for (let j = 0; j < 38; j++) {
      const a = TAU * j / 38 + rot, dash = (j + ring * 5) % 5;
      if (dash === 0) continue;
      const x = Math.cos(a) * radius + (ring - 1) * 8 * Math.sin(t * 1.7), y = Math.sin(a) * radius * squash;
      p.dot(x, y, dash === 1 ? c[4] : c[2], k * (0.45 + ring * 0.1));
      if (dash === 1) p.light(x, y, c[3], 0.25 * k);
    }
  }
  if (width > 0.1 && height > 0.1) {
    const left = [], right = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, yy = (u * 2 - 1) * height;
      const jag = 0.7 + 0.3 * Math.sin(i * 7.2 + o.seed);
      const w = width * Math.sin(Math.PI * u) * jag;
      const bend = Math.sin(u * 8 + t * 4) * width * 0.15 + twist * yy * 0.35;
      left.push([-w + bend, yy]);
      right.unshift([w * 0.78 + bend, yy]);
    }
    for (let j = 0; j < 16; j++) {
      const a = TAU * j / 16 + t * 0.8 + Math.sin(j * 13 + o.seed) * 0.1, ca = Math.cos(a), sa = Math.sin(a), phase = (j * 7 + o.seed) % 5;
      const inner = 26 + phase * 3, outer = (57 + phase * 6) * rise * close;
      const breadth = 0.1 + 0.05 * (j % 3);
      p.poly([[ca * inner, sa * inner * 0.82], [Math.cos(a - breadth) * outer, Math.sin(a - breadth) * outer * 0.82], [Math.cos(a + breadth) * outer * 0.74, Math.sin(a + breadth) * outer * 0.74 * 0.82]], c[j % 3 === 0 ? 3 : 2], k * 0.85);
      p.line(ca * inner, sa * inner * 0.82, ca * outer, sa * outer * 0.82, c[4], k * 0.6);
    }
    p.poly([...left, ...right], c[2], k);
    const innerLeft = left.map(([x, y]) => [x * 0.73, y * 0.93]), innerRight = right.map(([x, y]) => [x * 0.73, y * 0.93]);
    p.poly([...innerLeft, ...innerRight], c[0], k);
    for (let j = 0; j < 8; j++) {
      const yy = -height * 0.65 + j * height * 0.18, ph = t * 4 + j * 0.8;
      const span = width * 0.5 * (1 - Math.abs(yy) / height);
      p.line(-span, yy, span * 0.5, yy + Math.sin(ph) * 5, c[3], k * 0.7);
      p.dot(Math.sin(ph) * span, yy, c[4], k * 0.85);
    }
    p.glow(0, 0, 22, c[3], k * 0.35);
    sparkle(p, 0, 0, 4 + 4 * Math.sin(t * 4) ** 2, c[5], c[3], k * 0.8);
    for (let i = 0; i < left.length - 1; i++) {
      p.line(left[i][0], left[i][1], left[i + 1][0], left[i + 1][1], i % 3 === 0 ? c[4] : c[3], k);
      const j = right.length - 1 - i;
      p.line(right[j][0], right[j][1], right[j - 1][0], right[j - 1][1], i % 3 === 1 ? c[5] : c[3], k);
    }
    p.glowLine(0, -height * 0.7, 0, height * 0.7, 12, c[3], 0.22 * k);
  }
  for (let i = 0; i < 28; i++) {
    const q = (i * 0.173 + t * 0.43 + o.seed * 0.01) % 1, a = i * 2.399 + t * (i % 2 ? 1 : -1), r = 15 + (1 - q) * 80;
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.85, alpha = Math.sin(Math.PI * q) * k;
    p.line(x, y, x + Math.cos(a) * 8 * (1 - q), y + Math.sin(a) * 8 * (1 - q), c[i % 3 === 0 ? 4 : 3], alpha);
    p.dot(x, y, c[i % 4 === 0 ? 5 : 4], alpha);
    if (i % 7 === 0) sparkle(p, x, y, 1 + 2 * alpha, c[5], c[3], alpha * 0.55);
  }
  const explosion = Math.exp(-Math.abs(t - 1.57) * 10) * fade;
  if (explosion > 0.01) {
    sparkle(p, 0, 0, 40 * explosion, WHITE, c[4], explosion);
    p.glow(0, 0, 58, c[4], explosion * 0.8);
  }
  for (let j = 0; j < 35; j++) {
    const u = clamp((t - 1.38 - j % 5 * 0.018) / 1.15);
    if (u <= 0 || u >= 1) continue;
    const a = j * 2.399 + o.seed * 0.04, speed = 42 + j % 7 * 8, x = Math.cos(a) * speed * u, y = Math.sin(a) * speed * u * 0.85 + 15 * u * u;
    const alpha = Math.sin(Math.PI * u) * fade, z = (j % 5 === 0 ? 5 : 2) * (1 - u * 0.65);
    p.poly([[x, y - z * 2], [x + z, y], [x, y + z * 2], [x - z, y]], c[j % 4 === 0 ? 5 : 3], alpha);
    p.line(x, y, x - Math.cos(a) * 13 * alpha, y - Math.sin(a) * 12 * alpha, c[4], alpha * 0.65);
  }
  const strike = Math.exp(-Math.abs(t - 2.35) * 12) * fade;
  if (strike > 0.01) {
    sparkle(p, 0, 0, 28 * strike, WHITE, c[4], strike);
    p.glow(0, 0, 44, c[4], strike * 0.7);
  }
}
export {
  draw,
  meta
};
