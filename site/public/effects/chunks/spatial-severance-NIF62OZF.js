import {
  sparkle
} from "./chunk-JQXGDKYD.js";
import {
  fly
} from "./chunk-NPBZD3DI.js";
import {
  motionTrail,
  pointedRibbon
} from "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  Rng,
  clamp,
  ease,
  fit,
  hex,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/shadow/spatial-severance.ts
var meta = {
  name: "Spatial Severance",
  desc: "A 54 ms razor punches a white-hot flash through a smooth cyan-violet incision, carries a bright crest along its rim, then seals to a needle.",
  tags: ["spatial", "slash", "rift", "ultimate", "one-shot"],
  size: [384, 216],
  origin: [192, 108],
  duration: 1.08,
  loop: false,
  fps: 50,
  bg: "black",
  options: { seed: 1207, palette: ["#050611", "#0e133b", "#283b80", "#714bff", "#30c8ef", "#a5f5ff", "#f1ffff"], variant: 0, revision: 8 }
};
var timing = { speed: 10 / 9, attackStart: 0.126, impact: 0.18, sweepMilliseconds: 54 };
var progress = (t, a, b) => clamp((t - a) / (b - a));
var out = (t, a, b) => ease.outQuart(progress(t, a, b));
var vanish = (t, a, b) => 1 - smooth(a, b, t);
var H = hex;
function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), white = C[6], cyan = C[5];
  const sparks = Array.from({ length: 14 }, (_, i) => ({
    x: -130 + i * 17 + R.range(-3, 3),
    sign: i % 2 ? -1 : 1,
    vx: R.range(260, 390),
    vy: (i % 2 ? -1 : 1) * R.range(150, 230) * (1 - 0.35 * i / 13),
    life: R.range(0.21, 0.36),
    d: R.range(0, 0.022),
    trail: R.range(0.055, 0.085),
    size: R.range(1.1, 1.6),
    col: i % 5 === 0 ? 3 : 4
  }));
  const chips = Array.from({ length: 6 }, (_, i) => ({
    x: -112 + i * 39 + R.range(-5, 5),
    sign: i % 2 ? -1 : 1,
    vx: R.range(55, 85),
    vy: (i % 2 ? -1 : 1) * R.range(85, 130),
    size: R.range(2.3, 3.6),
    life: R.range(0.28, 0.39),
    phase: R.range(-0.2, 0.2)
  }));
  const angle = [-0.4, -0.64, -0.18][o.variant] ?? -0.4;
  return { draw(p, t) {
    if (t <= 0 || t >= meta.duration) return;
    t *= timing.speed;
    const cs = p.cs, sn = p.sn;
    p.cs = Math.cos(angle) * cs - Math.sin(angle) * sn;
    p.sn = Math.sin(angle) * cs + Math.cos(angle) * sn;
    const cut = progress(t, 0.14, 0.2);
    const hot = t >= 0.199 ? Math.exp(-Math.max(0, t - 0.2) * 34) : 0;
    const open = out(t, 0.19, 0.25) * vanish(t, 0.39, 0.69);
    const fade = vanish(t, 0.48, 0.77);
    const L = 158 * (1 - 0.07 * smooth(0.5, 0.74, t));
    const w = 13 * open;
    if (t > 0.035 && t < 0.14) {
      const q = progress(t, 0.035, 0.14), a = Math.sin(q * Math.PI * 0.85);
      p.path([[-29 * (1 - q), 0], [25 * (1 - q), 0]], C[5], a * 0.8, 1);
      p.glow(0, 0, 8, C[4], a * 0.24);
      sparkle(p, 0, 0, 2 + 2 * q, white, cyan, a);
    }
    if (t >= 0.14 && t < 0.33) {
      const q = progress(t, 0.14, 0.22), a = vanish(t, 0.215, 0.33);
      for (let i = 0; i < 3; i++) {
        const y = (i === 1 ? -1 : 1) * (17 + i * 8), x = -150 + i * 17 + q * 25;
        p.cubic([x, y], [x + 25 * q, y - 1], [x + 55 * q, y - 1], [x + (72 + i * 12) * q, y], C[4], (u) => a * Math.sin(Math.PI * u) * 0.5, 1);
      }
    }
    if (open > 1e-3) {
      p.glowLine(-145, -1, 149, -1, 16, C[3], open * 0.22);
      p.glowLine(-144, -2, 149, -2, 7, C[4], open * 0.24);
    }
    for (const f of chips) {
      const age = t - 0.205, q = age / f.life;
      if (q <= 0 || q >= 1) continue;
      const [x, y] = fly(f.x, f.sign * 7, f.vx, f.vy, age, 0, 5.5);
      const a = smooth(0, 0.035, age) * vanish(q, 0.3, 1), z = f.size * (1 - q * 0.45);
      const tilt = f.phase + q * 0.45 * f.sign;
      const u = [Math.cos(tilt) * z * 1.8, Math.sin(tilt) * z * 1.8], v = [-Math.sin(tilt) * z * 0.35, Math.cos(tilt) * z * 0.35];
      const A = [x + u[0], y + u[1]], B = [x + v[0], y + v[1]], D = [x - u[0], y - u[1]], E = [x - v[0], y - v[1]];
      p.poly([A, B, D, E], C[f.sign < 0 ? 4 : 3], a * 0.65);
      p.path([D, E, A], C[f.sign < 0 ? 5 : 4], (u2) => a * (0.35 + 0.5 * u2), 0.9);
    }
    if (open > 1e-3) {
      const outer = pointedRibbon(-L, L, w * 1.55, w * 0.83, -w * 0.08);
      const inner = pointedRibbon(-L + 0.8, L - 0.8, w * 0.87, w * 0.39, -w * 0.04);
      p.poly(outer.shape, C[2], fade * 0.9);
      p.poly(inner.shape, H("#01020a"), fade);
      p.path(outer.top, C[4], (u) => fade * (0.68 + 0.32 * Math.sin(Math.PI * u)), 1.7);
      p.path(outer.bottom, C[3], (u) => fade * (0.4 + 0.5 * Math.sin(Math.PI * u)), 1.5);
      p.path(inner.top, C[5], (u) => fade * 0.94 * Math.sin(Math.PI * u) ** 0.25, 1);
      const crest = progress(t, 0.2, 0.36);
      p.path(outer.top, white, (u) => fade * Math.exp(-(((u - (0.48 + 0.4 * crest)) / 0.19) ** 2)) * vanish(t, 0.28, 0.44), 1.3);
      if (hot > 0.3) p.path([[-L * 0.95, 0], [L, 0]], white, hot, 1);
      const glint = vanish(t, 0.3, 0.53);
      if (glint > 0) sparkle(p, L, 0, 3.2, white, cyan, glint * 0.9);
    }
    if (t >= 0.14 && t < 0.2) {
      const head = -158 + 322 * (1 - (1 - cut) ** 2), tail = -164, width = 6 + 8 * cut;
      const outer = pointedRibbon(tail, head, width, width * 0.33, -2 * cut);
      const middle = pointedRibbon(tail, head, width * 0.64, width * 0.17, -cut);
      const core = pointedRibbon(tail, head, width * 0.27, width * 0.06, 0);
      p.poly(outer.shape, C[3]);
      p.poly(middle.shape, C[4]);
      p.poly(core.shape, white);
      p.path(outer.top, C[5], (u) => Math.sin(Math.PI * u) * 0.7, 1);
      p.glowLine(Math.max(tail, head - 110), 0, head, 0, 7, C[4], 0.45);
      sparkle(p, head, 0, 3.5 + cut * 2, white, cyan, 1);
    }
    if (hot > 0.04) {
      const z = 10.5 * hot;
      p.poly(pointedRibbon(-166, 168, z * 1.8, z * 0.9).shape, C[4], hot);
      p.poly(pointedRibbon(-164, 166, z * 1.2, z * 0.48).shape, white, hot);
      p.glowLine(-155, 0, 161, 0, 10, C[4], hot * 0.55);
      const bx = 104;
      p.poly([[bx - 1.5, -1], [bx - 4, -25 * hot], [bx + 2, -1], [bx + 19 * hot, 0], [bx + 1.5, 1], [bx + 3, 17 * hot], [bx - 2, 1], [bx - 20 * hot, 0]], white, hot);
      p.glow(156, 0, 12, C[4], hot * 0.3);
    }
    for (const s of sparks) {
      const age = t - 0.2 - s.d, q = age / s.life;
      if (q <= 0 || q >= 1) continue;
      const a = smooth(0, 0.012, age) * vanish(q, 0.18, 1);
      const trajectory = (dt) => fly(s.x, s.sign * 9, s.vx, s.vy, Math.max(0, dt), s.sign * 200, 5.5);
      const pts = motionTrail(trajectory, age, s.trail);
      p.path(pts, C[s.col], (u) => a * (0.15 + 0.85 * u * u), s.size);
      p.path(pts.slice(-3), q < 0.34 ? white : C[5], (u) => a * u, 1);
      const [x, y] = pts[pts.length - 1];
      if (q < 0.28) p.glow(x, y, 2.4, C[4], a * 0.1);
    }
    const seal = smooth(0.61, 0.69, t) * vanish(t, 0.71, 0.89);
    if (seal > 0) {
      const len = 139 * vanish(t, 0.7, 0.87);
      p.path([[-len, 0], [len, 0]], C[5], (u) => seal * 0.8 * Math.sin(Math.PI * u) ** 0.25, 1);
      p.glowLine(-len, 0, len, 0, 4, C[4], seal * 0.18);
    }
    const end = smooth(0.78, 0.82, t) * vanish(t, 0.83, 0.96);
    if (end > 0) sparkle(p, 0, 0, 2.5 * end, white, cyan, end * 0.5);
    p.cs = cs;
    p.sn = sn;
  } };
}
export {
  create,
  meta,
  timing
};
