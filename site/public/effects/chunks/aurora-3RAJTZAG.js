import {
  box,
  clip,
  field,
  rows,
  sample
} from "./chunk-XN5EZQR2.js";
import {
  sparkle
} from "./chunk-ZHMERMWE.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  TAU,
  WHITE,
  clamp,
  fit,
  mix,
  rand,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/weather/aurora.ts
var meta = {
  name: "Aurora",
  desc: "Rippling curtains of green-to-violet light over a starfield: folding hems burn bright, rays shimmer up into violet, and the whole sky slowly breathes.",
  tags: ["weather", "aurora", "northern lights", "sky", "night", "ambient", "loop"],
  size: [320, 180],
  origin: [160, 180],
  duration: 12,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#081a1e", "#0d3a36", "#13664e", "#1fa06a", "#3fd88e", "#9af7bf", "#e6fff0"],
    upper: ["#120b2a", "#26164f", "#41208a", "#6a34c0", "#9c62e8", "#d2b4ff", "#f6eeff"],
    seed: 3
  }
};
var D = 12;
var W = 320;
var H = 180;
var BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
var I = new Float32Array(W * H);
var HV = new Float32Array(W * H);
var BL = new Float32Array(W * H);
var TMP = new Float32Array(W * H);
var PROF = Float32Array.from({ length: 201 }, (_, i) => {
  const v = i / 200;
  return v < 0.035 ? 2.6 : v < 0.22 ? 1.15 - v : (1 - v) ** 1.5 * 0.9;
});
function blur(src, dst, r) {
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    const o = y * W;
    for (let x = -r; x < W + r; x++) {
      if (x + r < W) acc += src[o + Math.min(W - 1, x + r)];
      if (x - r - 1 >= 0) acc -= src[o + x - r - 1];
      if (x >= 0 && x < W) TMP[o + x] = acc / n;
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y < H + r; y++) {
      if (y + r < H) acc += TMP[Math.min(H - 1, y + r) * W + x];
      if (y - r - 1 >= 0) acc -= TMP[(y - r - 1) * W + x];
      if (y >= 0 && y < H) dst[y * W + x] = acc / n;
    }
  }
}
var cyc = (t, c, ph = 0) => TAU * c * t / D + ph;
var CURTAINS = [
  { y: -132, slope: -0.08, amp: 8, lam: 210, fold: 14, flam: 150, height: 40, k: 0.6, s0: -210, s1: 210, rip: 1.6, c: [1, 1, 2], hue: 0.35 },
  { y: -88, slope: 0.22, amp: 13, lam: 250, fold: 19, flam: 165, height: 82, k: 1.5, s0: -195, s1: 180, rip: 2.4, c: [1, 2, 3], hue: 0 },
  { y: -38, slope: -0.05, amp: 5, lam: 150, fold: 10, flam: 110, height: 20, k: 0.45, s0: -210, s1: 210, rip: 1.4, c: [2, 1, 3], hue: 0 }
];
function draw(p, t, o) {
  const q = clip(p, meta), B = box(meta), S = o.seed, G = fit(o.palette, 7), U = fit(o.upper, 7);
  stars(q, t, S, G, U);
  I.fill(0);
  HV.fill(0);
  const F = field(S * 5 + 1, 256, 128, [8, 16, 32]), breath = 0.75 + 0.25 * Math.sin(cyc(t, 1, -1.2));
  const rays = [];
  CURTAINS.forEach((c, n) => curtain(q, c, n, t, F, breath, rays, G));
  blur(I, BL, 5);
  const GM = G.map((g, i) => mix(g, U[i], 0.5));
  rows(p, meta, B.y0, -12, (y, R) => {
    const base = (Math.floor(y) - B.y0) * W, by = (Math.floor(y) & 3) << 2;
    for (let xi = 0; xi < W; xi++) {
      const i = base + xi, raw = I[i], bl = BL[i];
      let k = bl > 0.015 ? Math.min(0.4, bl * 0.6) : 0;
      if (raw >= 0.03) {
        const e = raw * 1.5 / (1 + raw * 1.5), v = HV[i] / raw, th = e > 0.45 ? BAY[by | xi & 3] * 0.06 : 0;
        let lv = e > 0.86 + th ? 6 : e > 0.72 + th ? 5 : e > 0.56 + th ? 4 : e > 0.4 + th ? 3 : e > 0.24 ? 2 : 1;
        if (v > 0.35) lv = Math.min(lv, 5);
        const c = v < 0.3 ? G[lv] : v < 0.5 ? GM[lv] : U[lv];
        if (lv >= 3) {
          R.c[xi] = c;
          R.a[xi] = clamp((e - 0.3) * 2.2);
          R.b[xi] = lv < 5 ? 1 : 0;
        }
        R.l[xi] = lv >= 3 ? v < 0.4 ? G[4] : U[4] : c === G[lv] ? G[4] : c === U[lv] ? U[4] : GM[4];
        k += e * (lv >= 3 ? 0.28 : 0.72);
      } else R.l[xi] = G[4];
      R.k[xi] = k;
    }
  });
  for (const r of rays) {
    const n = Math.round(r.h);
    for (let j = 1; j < n; j++) {
      const u = j / n;
      q.blend(r.x, r.hem - j, u < 0.35 ? G[5] : u < 0.6 ? mix(G[5], U[5], 0.5) : U[5], r.k * (1 - u) ** 1.3);
    }
    q.px(r.x, r.hem, G[6]);
  }
}
function curtain(q, c, n, t, F, breath, rays, G) {
  const X0 = -160, Y0 = -180, fast = 256 * 2 * t / D, slow = 256 * t / D;
  let p1 = 0, p2 = 0, lastX = -999;
  for (let s = c.s0; s < c.s1; s += 0.5) {
    const x = s + c.fold * Math.sin(TAU * s / c.flam + cyc(t, c.c[0], n * 2)) + 5 * Math.sin(TAU * s / 64 + cyc(t, c.c[2], n));
    if (x < X0 - 2 || x >= X0 + W + 1) continue;
    const hem = c.y + c.slope * s + c.amp * Math.sin(TAU * s / c.lam + cyc(t, c.c[1], n * 1.7)) + c.rip * Math.sin(TAU * s / 23 - cyc(t, 7, n));
    const env = smooth(c.s0, c.s0 + 60, s) * (1 - smooth(c.s1 - 70, c.s1, s));
    const r1 = clamp((sample(F, s * 5 - fast + n * 40, 10 + n * 30) - 0.38) * 3.2), r2 = clamp((sample(F, s * 4.3 + fast * 0.7 + n * 90, 50 + n * 13) - 0.35) * 3);
    const patch = sample(F, s * 0.7 + slow + n * 17, 80 + n * 9);
    const k = c.k * env * breath * (0.2 + 0.8 * r1) * (0.3 + 1.4 * Math.max(0, patch - 0.3));
    if (k < 0.01) continue;
    const h = c.height * (0.45 + 0.75 * r2) * (0.75 + 0.5 * patch), xi = Math.floor(x - X0), fr = x - X0 - xi;
    if (p1 > 0.75 && p1 >= p2 && p1 >= r1 && Math.abs(x - lastX) > 2 && k > 0.25) rays.push({ x, hem: hem - 1, h: h * 0.9, k: Math.min(0.85, k * 0.9) }), lastX = x;
    p2 = p1;
    p1 = r1;
    if (xi < -1 || xi >= W) continue;
    const top = Math.max(0, Math.floor(hem - h - Y0)), bot = Math.min(H - 1, Math.floor(hem - Y0) + 3), inv = 1 / h, k0 = k * 0.5 * (1 - fr), k1 = k * 0.5 * fr;
    let v = (hem - Y0 - 0.5 - top) * inv;
    for (let yi = top; yi <= bot; yi++, v -= inv) {
      const pr = v >= 0 ? PROF[Math.min(200, v * 200 | 0)] : Math.max(0, 0.45 + v * h * 0.16), o = yi * W + xi, hv = v + c.hue < 0 ? 0 : v + c.hue > 1 ? 1 : v + c.hue;
      if (pr <= 0) continue;
      if (xi >= 0) I[o] += k0 * pr, HV[o] += k0 * pr * hv;
      if (xi + 1 < W) I[o + 1] += k1 * pr, HV[o + 1] += k1 * pr * hv;
    }
  }
}
function stars(q, t, S, G, U) {
  for (let i = 0; i < 150; i++) {
    const x = -160 + rand(S, i, 1) * 320, y = -180 + rand(S, i, 2) * 175, r = rand(S, i, 3), c = 1 + Math.floor(rand(S, i, 4) * 4);
    const tw = 0.5 + 0.5 * Math.sin(cyc(t, c, rand(S, i, 5) * TAU));
    const col = r < 0.6 ? mix(U[3], WHITE, 0.2) : r < 0.9 ? mix(U[5], WHITE, 0.5) : WHITE;
    if (r < 0.6) q.dot(x, y, col, 0.35 + 0.5 * tw);
    else if (r < 0.95) {
      q.px(x, y, col);
      q.glow(x + 0.5, y + 0.5, 3, U[5], 0.25 * tw);
    } else sparkle(q, x, y, 1 + Math.round(tw * 2), mix(U[5], WHITE, 0.6), U[4], 0.35 * tw);
  }
}
export {
  draw,
  meta
};
