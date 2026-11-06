import {
  cycle
} from "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WP6F6TUS.js";
import {
  TAU,
  WHITE,
  clamp,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/ice/blizzard-vortex.ts
var meta = {
  name: "Blizzard vortex",
  desc: "A swirling snow tornado: wind bands spin up a leaning funnel, flakes and ice crystals orbit in front and behind, snow boils at its foot and cold light fills its throat.",
  tags: ["ice", "snow", "blizzard", "tornado", "vortex", "wind", "loop"],
  size: [128, 116],
  origin: [64, 102],
  duration: 2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"], height: 80, seed: 17 }
};
var TILT = 0.24;
var radius = (h, H) => 4 + 28 * Math.pow(clamp(h / H), 1.35);
var axis = (h, H, ph) => (5 * Math.sin(TAU * ph + h * 0.05) + 1.5 * Math.sin(TAU * ph * 2 - h * 0.11)) * (h / H) - 2 * (h / H);
function streaks(p, C, t, o, front) {
  const D = meta.duration, H = o.height, ph = t / D;
  cycle(t, D, 58, o.seed + 9, (g) => g.range(0.5, 0.9), (age, life, r) => {
    const h0 = r.range(2, H), w = r.range(8, 12) * (1.45 - h0 / H), th = r.range(0, TAU) + age * w, k = age / life;
    const fade = Math.min(1, age / 0.08) * (k > 0.7 ? (1 - k) / 0.3 : 1), L = r.range(0.7, 1.5), m = Math.ceil(L / 0.07);
    for (let j = 0; j <= m; j++) {
      const a = th - j * 0.07, s = Math.sin(a);
      if (s >= 0 !== front) continue;
      const h = Math.min(H + 4, h0 + age * 16 - j * 0.25), R = radius(Math.min(h, H), H) * (1 + Math.min(0.3, Math.max(0, h - H * 0.84) * 0.03)), u = j / m;
      const x = axis(Math.min(h, H), H, ph) + Math.cos(a) * R, y = -h + s * R * TILT;
      const c = front ? u < 0.15 ? WHITE : u < 0.5 ? C[6] : C[5] : u < 0.3 ? C[5] : u < 0.6 ? C[4] : C[3];
      p.dot(x, y, c, fade * (u < 0.6 ? 1 : 1.5 - u * 1.2) * (front ? 1 : 0.85));
    }
  });
}
function body(p, C, ph, H) {
  p.each(-44, -H - 6, 44, 2, (x, y, sx, sy) => {
    const h = -y;
    if (h < 0 || h > H + 4) return;
    const R = radius(h, H), dx = x - axis(h, H, ph), u = dx / R;
    if (u * u >= 1) return;
    const k = h / H, rim = Math.pow(Math.abs(u), 3), swirl = Math.sin(Math.asin(u) * 3 - TAU * ph * 2 + h * 0.2) * 0.5 + 0.5;
    const a = (0.07 + 0.24 * rim + 0.12 * swirl) * clamp((1 - Math.abs(u)) / 0.18) * (k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1) * (h < 4 ? h / 4 : 1);
    if (a < 0.03) return;
    p.blendPx(sx, sy, rim > 0.5 ? C[6] : swirl > 0.6 ? C[5] : C[4], a);
    if (rim > 0.3 || swirl > 0.75) p.add(sx, sy, C[5], 0.16 * Math.max(rim, swirl - 0.5) * (1 - k * 0.5));
  });
}
function orbiters(p, C, t, o, front) {
  const D = meta.duration, H = o.height, ph = t / D;
  cycle(t, D, 76, o.seed, (g) => g.range(0.9, 1.6), (age, life, r, i) => {
    const h0 = r.range(0, H * 0.6), h = h0 + age * r.range(14, 30), k = age / life;
    if (h > H + 8) return;
    const w = r.range(7, 11) * (1.5 - h / H), th = r.range(0, TAU) + age * w, out = 1 + r.range(0.05, 0.3) + Math.min(0.35, Math.max(0, h - H * 0.82) * 0.04);
    const R = radius(Math.min(h, H), H) * out, s = Math.sin(th);
    if (s >= 0 !== front) return;
    const x = axis(Math.min(h, H), H, ph) + Math.cos(th) * R, y = -h + s * R * TILT, big = i % 5 === 0;
    const fade = Math.min(1, age / 0.1) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    if (fade <= 0) return;
    const th2 = th - 0.25, x2 = axis(Math.min(h, H), H, ph) + Math.cos(th2) * R, y2 = -h + 2 + Math.sin(th2) * R * TILT;
    if (front) {
      p.line(x2, y2, x, y, (u) => u > 0.6 ? C[6] : C[4], (u) => u * fade);
      p.dot(x, y, big ? WHITE : r.chance(0.5) ? WHITE : C[6], fade);
      if (big) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.dot(x + dx, y + dy, C[6], fade);
        p.glow(x, y, 5, C[5], 0.35 * fade);
      }
    } else {
      p.line(x2, y2, x, y, C[3], (u) => u * fade * 0.8);
      p.dot(x, y, big ? C[5] : C[4], fade);
    }
  });
}
function foot(p, C, t, o, front) {
  const D = meta.duration, ph = t / D;
  cycle(t, D, 12, o.seed + 5, (g) => g.range(0.8, 1.2), (age, life, r) => {
    const th = r.range(0, TAU) + age * r.range(4, 6), R = 9 + age * r.range(8, 16), s = Math.sin(th), k = age / life;
    if (s >= 0 !== front) return;
    const x = axis(0, 1, ph) + Math.cos(th) * R, y = -2 - age * r.range(4, 10) + s * R * 0.2, rad = 2 + 4 * k, a = 0.5 * (1 - k) ** 1.2 * Math.min(1, age / 0.1);
    p.disc(x, y, rad, front ? C[6] : C[5], (d) => a * (1 - d * d));
    p.disc(x - rad * 0.25, y - rad * 0.3, rad * 0.5, WHITE, (d) => a * 0.5 * (1 - d * d) * (1 - k));
  });
}
function drawBack(p, t, o) {
  const C = fit(o.palette, 8), H = o.height, ph = t / meta.duration;
  for (let x = -30; x <= 30; x++) {
    const d = Math.abs(x) / 30, hgt = Math.round((1 - d * d) * (1.5 + rand(x, 3) * 1.5));
    for (let j = 0; j < hgt; j++) p.px(x, -j, j === hgt - 1 ? WHITE : C[5]);
    p.dot(x, 0, C[6], 1 - d * 0.5);
    p.dot(x, 1, C[4], 0.8 - d * 0.6);
  }
  p.glow(0, -2, 40, C[4], 0.22);
  foot(p, C, t, o, false);
  streaks(p, C, t, o, false);
  orbiters(p, C, t, o, false);
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), H = o.height, ph = t / meta.duration;
  body(p, C, ph, H);
  p.glow(axis(H * 0.45, H, ph), -H * 0.45, 40, C[4], 0.3);
  p.glow(axis(H * 0.15, H, ph), -H * 0.15, 18, C[5], 0.4 + 0.1 * Math.sin(TAU * ph * 4));
  p.glow(axis(H * 0.05, H, ph), -3, 10, WHITE, 0.3);
  streaks(p, C, t, o, true);
  orbiters(p, C, t, o, true);
  foot(p, C, t, o, true);
  cycle(t, meta.duration, 10, o.seed + 3, (g) => g.range(0.9, 1.3), (age, life, r) => {
    const th = r.range(0, TAU), R = radius(H, H) * (0.6 + age * 0.9), k = age / life, rad = 3 + 6 * k;
    const Rc = Math.min(R, 36), x = axis(H, H, ph) + Math.cos(th) * Rc, y = -H - 2 - age * 4 + Math.sin(th) * Rc * TILT, a = 0.24 * (1 - k) * Math.min(1, age / 0.15);
    p.disc(x, y, rad * 0.8, C[6], (d) => a * (1 - d * d));
    p.glow(x, y, rad * 1.5, C[4], 0.08 * (1 - k));
  });
}
export {
  draw,
  drawBack,
  meta
};
