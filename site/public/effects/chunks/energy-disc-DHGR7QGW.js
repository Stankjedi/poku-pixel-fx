import {
  beat,
  spark,
  wake
} from "./chunk-XI5ZVMM5.js";
import "./chunk-ZHMERMWE.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  TAU,
  WHITE,
  fit,
  rng
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/projectiles/energy-disc.ts
var meta = {
  name: "Energy disc",
  desc: "A sawblade of crackling energy spinning flat out as it flies: hooked teeth bright on their leading edges, a white hub, spiral arms churning, sparks flung off the teeth.",
  tags: ["projectile", "disc", "saw", "energy", "sci-fi", "directional", "loop"],
  size: [120, 52],
  origin: [92, 26],
  duration: 0.5,
  loop: true,
  fps: 30,
  bg: "sky",
  options: { palette: ["#0a0f2e", "#172a78", "#2550d0", "#3f8cff", "#7cc8ff", "#c8f0ff", "#ffffff"], size: 9, teeth: 8, speed: 220, seed: 5 }
};
function draw(p, t, o) {
  const C = fit(o.palette, 7), R = o.size, N = o.teeth, V = o.speed, S = o.seed, D = meta.duration, left = -meta.origin[0] + 2;
  const rot = TAU * 3 * t / D, seg = TAU / N, frac = (x) => x - Math.floor(x);
  beat(t, D, 8, S + 4, (r) => r.range(0.12, 0.22), (age, life, r) => {
    const k = age / life, side = r.chance(0.5) ? -1 : 1, x0 = -2 - age * r.range(180, 260), len = r.range(8, 16) * (0.5 + k), y = side * (R + r.range(0.5, 3));
    if (x0 - len < left) return;
    p.line(x0, y, x0 - len, y, k < 0.35 ? C[5] : k < 0.7 ? C[4] : C[3], (u) => u < 0.65 ? 1 : (1 - u) / 0.35);
  });
  p.glowLine(-2, 0, -26, 0, 8, C[3], 0.35);
  const SP = [WHITE, C[5], C[4], C[3]];
  beat(t, D, 20, S, (r) => r.range(0.12, 0.3), (age, life, r) => {
    const a = rot - r.range(0, TAU) * 0 + r.range(0, TAU), tip = R + 3.5, x0 = Math.cos(a) * tip, y0 = Math.sin(a) * tip, v = r.range(120, 230);
    const [x, y, vx, vy] = wake(x0, y0, -Math.sin(a) * v, Math.cos(a) * v, age, V * 0.6, 2.4, 60);
    if (x > left + 8 && Math.abs(y) < 23) spark(p, x, y, vx, vy, 1 - age / life, SP, 0.45, 0.014, 7);
  });
  p.shade(-R - 5, -R - 5, R + 5, R + 5, (x, y) => {
    const r = Math.hypot(x, y), th = Math.atan2(y, x);
    if (r > R + 4.6) return;
    if (r <= R) {
      if (r < 1.8) return WHITE;
      if (r < 2.9) return C[1];
      if (r > R - 1.1) return C[5];
      const arm = Math.sin(3 * (th - rot * 0.5) - r * 0.85);
      return arm > 0.65 ? C[5] : arm > 0.2 ? C[4] : arm > -0.3 ? C[3] : C[2];
    }
    const ph = frac((th - rot) / seg), h = 4.2 * Math.pow(ph, 1.4);
    if (r - R < h) return ph > 0.86 ? WHITE : ph > 0.6 ? C[6] : ph > 0.35 ? C[5] : C[4];
    if (r - R < 1.6) return C[2];
  });
  const fr = Math.floor(t * 30 + 1e-6);
  for (let j = 0; j < 3; j++) {
    const g = rng(fr, j, S), a0 = g.range(0, TAU), pts = [];
    for (let i = 0; i <= 4; i++) {
      const rr = 2.5 + (R - 3) * i / 4, a = a0 + i * 0.25 + (i ? g.range(-0.35, 0.35) : 0);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    p.polyline(pts, j ? C[6] : WHITE);
  }
  p.ring(0, 0, R + 0.5, 1, C[6]);
  p.glow(0, 0, 30, C[3], 0.4);
  p.glow(0, 0, 6, C[5], 0.35);
  p.glow(Math.cos(rot) * R, Math.sin(rot) * R, 5, C[6], 0.4);
}
export {
  draw,
  meta
};
