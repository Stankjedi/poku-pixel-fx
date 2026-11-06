import {
  drift,
  flameTongue,
  floorLight,
  hotFirst,
  looped,
  noiseFor,
  smokePuff
} from "./chunk-D26EGSXF.js";
import "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WP6F6TUS.js";
import {
  WHITE,
  clamp,
  fit,
  mix,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/fire/candle.ts
var meta = {
  name: "Candle",
  desc: "A wax candle in a brass dish: a calm flame with a blue root that sways and stretches, a halo of light, motes drifting in it, a bead of wax running down a drip.",
  tags: ["fire", "candle", "prop", "light", "calm", "ambient", "loop"],
  size: [56, 76],
  origin: [28, 64],
  duration: 4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    root: ["#1b2a8a", "#3a62e0", "#7fb4ff"],
    wax: ["#2e201e", "#5e4436", "#8e6e58", "#b8957a", "#d8b896", "#f0dcc0"],
    brass: ["#2a1a10", "#6a4a1e", "#b4862e", "#e8c060", "#fff0b0"],
    seed: 2
  }
};
var D = meta.duration;
var NL = noiseFor(D);
var TOP = -16;
var WICK = TOP - 3;
var CALM = [[1, 1, 5], [0.8, 0.88, 3], [0.6, 0.72, 2], [0.38, 0.52, 1], [0.18, 0.3, 0]];
var DRIP = { x: 4, y0: TOP + 2, y1: -7 };
function dish(p, B, H, fl) {
  p.ellipse(0, 1, 10, 2.6, (d, a) => d > 0.82 ? B[0] : Math.sin(a) < -0.2 ? d > 0.6 ? mix(B[3], H[3], 0.3 * fl) : B[2] : d > 0.55 ? B[1] : B[2]);
  p.rect(-8, 2, 17, 1, B[1]);
  p.rect(-7, 3, 15, 1, B[0]);
}
function candle(p, X, H, fl) {
  const L = TOP, cols = [X[1], X[4], X[5], X[4], X[4], X[3], X[3], X[2], X[0]];
  for (let i = 0; i < 9; i++) {
    const x = i - 4;
    p.rect(x, L + 1, 1, -L - 2, cols[i]);
    if (i === 2) p.rect(x, -8, 1, 7, X[4]);
  }
  p.rect(-3, -1, 7, 1, X[2]);
  p.px(-4, -1, X[0]);
  p.px(4, -1, X[0]);
  p.rect(-3, L, 7, 1, mix(X[5], H[2], 0.25 * fl));
  p.px(-4, L, X[1]);
  p.px(4, L, X[1]);
  p.rect(-2, L + 1, 5, 1, mix(X[5], H[1], 0.5 * fl));
  p.rect(-1, L + 1, 3, 1, mix(X[4], H[2], 0.45 * fl));
  const y1 = DRIP.y1;
  p.rect(3, L + 1, 1, y1 - L - 1, X[4]);
  p.rect(4, L + 2, 1, y1 - L - 2, X[3]);
  p.px(5, L + 3, X[0]);
  p.rect(5, L + 4, 1, y1 - L - 4, X[0]);
  p.rect(3, y1, 2, 2, X[4]);
  p.px(5, y1, X[3]);
  p.px(5, y1 + 1, X[2]);
  p.px(6, y1, X[0]);
  p.px(6, y1 + 1, X[0]);
  p.rect(3, y1 + 2, 3, 1, X[0]);
  p.px(3, L + 2, X[5]);
  p.rect(-4, L + 1, 1, 4, X[4]);
  p.px(-5, L + 3, X[1]);
  p.px(-5, L + 4, X[1]);
  p.px(-4, L + 5, X[3]);
}
function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), RT = fit(o.root, 3), X = fit(o.wax, 6), B = fit(o.brass, 5), S = o.seed;
  const N = (rate, seed = 0, off = 0) => NL(t, rate * 0.35, seed, off);
  const fl = 0.86 + 0.08 * NL(t, 2, S + 1) + 0.06 * NL(t, 7, S + 2), stretch = Math.max(0, NL(t, 0.75, S + 3) - 0.3) * 0.6;
  const h = 12 * (1 + stretch) * (0.94 + 0.06 * fl), sway = NL(t, 0.5, S + 4) * 1.6 + NL(t, 1.5, S + 5) * 0.5;
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.3), cy = WICK - h * 0.4;
  floorLight(p, 0, 1, 26, 5, GLOW, 0.3 * fl);
  p.glow(sway * 0.3, cy, 38 * fl, GLOW, 0.42 * fl);
  p.glowRing(sway * 0.3, cy, 10, 4, H[2], 0.12 * fl);
  dish(p, B, H, fl);
  candle(p, X, H, fl);
  const run = t % D / D, swell = smooth(0, 0.3, run), slide = smooth(0.3, 0.85, run), set = smooth(0.85, 1, run);
  if (set < 1 && swell > 0.15) {
    const by = Math.round(DRIP.y0 + (DRIP.y1 - DRIP.y0) * slide);
    p.px(DRIP.x, by, mix(X[5], H[1], 0.4 * fl));
    if (swell > 0.6 && set < 0.5) p.px(DRIP.x + 1, by, X[4]), p.px(DRIP.x + 1, by + 1, X[2]);
  }
  p.line(0, TOP, 0, WICK + 1, X[0]);
  p.px(0, WICK + 1, H[4]);
  flameTongue(p, 0, WICK + 1, h, 2.6, sway, N, S * 31, H, CALM, 0.25, 0.6);
  for (let dx = -2; dx <= 2; dx++) {
    const a = 1 - Math.abs(dx) * 0.2;
    p.dot(dx, WICK + 1, Math.abs(dx) === 2 ? RT[0] : RT[1], a);
    if (Math.abs(dx) <= 1) p.dot(dx, WICK + 2, RT[0], 0.7);
  }
  p.px(0, WICK, RT[2]);
  looped(t, D, 6, S + 300, (r) => ({ vx: r.range(-1.5, 1.5), vy: -r.range(8, 12), life: r.range(1.4, 2.2), s: r.range(0.8, 1.2) }), (q, age) => {
    const [x, y] = drift(sway, WICK - h, q.vx, q.vy, age, 1, -6, 1, 0.8);
    smokePuff(p, x + NL(t - age, 0.6, S + 60) * (1 + age * 2), y, 1 - age / q.life, q.s, 0, false, 0.6);
  });
  looped(t, D, 10, S + 400, (r) => ({ x: r.range(-20, 20), y: r.range(-44, -8), vx: r.range(-3, 3), vy: r.range(-4, 2), life: r.range(2.5, 4), ph: r.range(0, 6.3) }), (q, age) => {
    const x = q.x + q.vx * age + Math.sin(age * 1.3 + q.ph) * 2, y = q.y + q.vy * age, d = Math.hypot(x, y - cy);
    const k = Math.min(1, age * 2, (q.life - age) * 2) * clamp(1.2 - d / 26);
    if (k > 0.15) p.dot(x, y, k > 0.6 ? H[1] : H[3], k), p.glow(x, y, 3, H[2], 0.2 * k);
  });
  p.glow(sway * 0.5, WICK - h * 0.3, 10, H[1], 0.35 * fl);
}
export {
  draw,
  meta
};
