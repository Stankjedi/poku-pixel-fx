import {
  WATER,
  ring
} from "./chunk-YZFTWBKD.js";
import {
  cycle
} from "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  WHITE,
  ease,
  fit,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/water/ripples.ts
var meta = {
  name: "Ripples",
  desc: "A drop plinks on still dark water and rings spread out across it at a low angle: the swell of each ring catches the light, crests glint, and they fade into the calm.",
  tags: ["water", "ripples", "rings", "surface", "pond", "ambient", "loop"],
  size: [136, 52],
  origin: [68, 30],
  duration: 2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: WATER, seed: 2 }
};
var D = meta.duration;
var SY = 0.26;
var EVERY = 0.5;
var LIFE = 2;
var RMAX = 60;
var PATCH = 64;
var radius = (a) => 2 + (RMAX - 2) * ease.outCubic(a / LIFE);
var power = (a) => Math.pow(1 - a / LIFE, 1.5) * Math.min(1, a / 0.08);
function alive(t) {
  const out = [];
  for (let k = 0; k * EVERY < LIFE; k++) {
    const a = ((t - k * EVERY) % D + D) % D;
    if (a < LIFE) out.push([a, Math.round(((t - a) % D + D) % D / EVERY)]);
  }
  return out;
}
function surface(p, C, t) {
  const rs = alive(t).map(([a]) => [radius(a), power(a), 3 + a * 2.2]);
  for (let Y = Math.floor(-PATCH * SY); Y < PATCH * SY; Y++)
    for (let X = -PATCH; X < PATCH; X++) {
      const x = X + 0.5, y = Y + 0.5, z = y / SY, r = Math.hypot(x, z), e = r / PATCH;
      if (e > 1) continue;
      const edge = 1 - smooth(0.6, 1, e);
      p.blend(x, y, C[1], 0.55 * edge);
      let slope = 0;
      for (const [R, k, w] of rs) {
        const d = r - R;
        if (d > 2.2 * w || d < -2.2 * w) continue;
        slope += k * Math.exp(-((d / w) ** 2)) * -Math.sin(d * 1.15) * 1.15;
      }
      if (slope === 0) continue;
      const face = slope * (-(x * -0.55 + z * -0.84) / Math.max(1, r));
      if (face > 0.18) p.blend(x, y, face > 0.6 ? C[5] : C[4], Math.min(0.9, (face - 0.18) * 2.2) * edge);
      else if (face < -0.25) p.blend(x, y, C[0], Math.min(0.8, (-face - 0.25) * 2) * edge);
    }
}
function rings(p, C, t, half) {
  for (const [a, i] of alive(t)) {
    const R = radius(a), k = power(a);
    ring(p, 0, 0, R, SY, 0.85 * k, C, { n: 2, gap: 3 + a * 1.4, half, hot: a < 0.14, glint: half > 0 && a > 0.1 ? k : 0, seed: i + 1, wob: 0.4 + a * 1.1 });
  }
}
function drawBack(p, t, o) {
  const C = fit(o.palette, 8);
  surface(p, C, t);
  rings(p, C, t, -1);
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), S = o.seed;
  rings(p, C, t, 1);
  for (const [a] of alive(t)) {
    if (a < 0.08) {
      p.px(0, 0, WHITE);
      p.px(-1, 0, C[6]);
      p.px(1, 0, C[6]);
      p.glow(0, 0, 8, C[5], 0.5 * (1 - a / 0.08));
    }
    const b = a - 0.04, h = 90 * b - 0.5 * 700 * b * b;
    if (b > 0 && h > 0) {
      p.px(0, -h, WHITE);
      p.px(0, -h + 1, C[5]);
    }
  }
  cycle(t, D, 10, S + 5, (g) => g.range(0.25, 0.45), (age, life, r) => {
    const all = alive(t), [a] = all[Math.floor(r.next() * all.length)] ?? [0];
    const ang = r.range(0.3, Math.PI - 0.3), R = radius(a), k = Math.sin(Math.PI * age / life) * power(a);
    if (k < 0.15 || R < 6) return;
    const x = Math.cos(ang) * R, y = Math.sin(ang) * R * SY;
    p.px(x, y, WHITE);
    if (k > 0.5) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.px(x + dx, y + dy, C[6]);
    p.glow(x, y, 5, C[5], 0.4 * k);
  });
  p.glow(0, 0, 40, C[4], 0.14);
  p.glow(0, 0, 14, C[5], 0.12);
}
export {
  draw,
  drawBack,
  meta
};
