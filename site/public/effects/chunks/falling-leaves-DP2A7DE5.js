import {
  clip,
  rows,
  trips
} from "./chunk-XN5EZQR2.js";
import "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WP6F6TUS.js";
import {
  TAU,
  fit,
  hex,
  mix,
  rand,
  wrap
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/weather/falling-leaves.ts
var meta = {
  name: "Falling leaves",
  desc: "Autumn leaves swing down through the air, tilting and flipping to show their pale backs, ride a gust, land flat in the litter and fade.",
  tags: ["weather", "leaves", "autumn", "fall", "wind", "nature", "ambient", "loop"],
  size: [320, 180],
  origin: [160, 170],
  duration: 10,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#4a1d0c", "#8a3a14", "#c8621e", "#f0982e", "#ffcf72", "#fff0c4"],
    reds: ["#40101a", "#7c1c22", "#b8302a", "#e85a3c", "#ff9a72", "#ffd8c4"],
    golds: ["#3e300c", "#7a5c14", "#b8901e", "#e8c23a", "#fff09a", "#fffbe0"],
    seed: 8
  }
};
var D = 10;
var FLOOR = 1;
var gust = (t) => 16 * Math.sin(TAU * t / D - 1.2) + 5 * Math.sin(TAU * 3 * t / D);
var Hc = (th) => {
  const k = Math.floor((th + Math.PI / 2) / Math.PI);
  return 2 * k + 1 + Math.sin(th - k * Math.PI);
};
var SHAPES = [
  (u, v) => Math.abs(u) >= 1 ? 9 : v * v / (0.36 * (1 - u * u) * (1.15 - 0.3 * u)),
  // a beech: a long oval, pointed tip
  (u, v) => {
    const r = Math.hypot(u, v * 1.1), a = Math.atan2(v, u);
    return r / (0.62 + 0.38 * Math.abs(Math.cos(2.5 * a)) ** 1.5);
  },
  (u, v) => Math.abs(u) >= 1 ? 9 : v * v / (0.16 * (1 - u * u))
  // a willow: long and thin
];
function drawBack(p, t, o) {
  const q = clip(p, meta), S = o.seed, R3 = ramps(o), C = R3[0];
  const top = hex("#0e0a12"), low = mix(hex("#140c14"), C[0], 0.3);
  rows(p, meta, -170, 9, (y, R) => {
    const k = (y + 170) / 180, c = mix(top, low, k * k);
    R.c.fill(c);
    R.a.fill(0.32 + 0.1 * k);
    R.b.fill(1);
  });
  litter(q, S, R3);
  leaves(q, t, S, R3, false);
}
function draw(p, t, o) {
  leaves(clip(p, meta), t, o.seed, ramps(o), true);
}
var ramps = (o) => [fit(o.palette, 6), fit(o.reds, 6), fit(o.golds, 6)];
function leaves(q, t, S, R3, front) {
  trips(t, D, 62, S * 19, 2, 3, (u, k, m, i) => {
    const j = wrap(k, m), R = (n) => rand(S * 19, i, j, n), near = R(1) < 0.35;
    if (near !== front) return;
    const dur = D / m, air = 0.72, tf = dur * air, a = Math.min(u * dur, tf), rest = u * dur - tf;
    const w = 1.7 + R(2) * 1.2, ph0 = R(3) * TAU, amp = (near ? 14 : 8) + R(4) * 10, x0 = -180 + R(5) * 340, y0 = -186;
    const path = (aa) => 0.45 * aa + 0.9 * (Hc(w * aa + ph0) - Hc(ph0)) / w, vy = (FLOOR - y0) / path(tf);
    const born = t - u * dur, xAt = (aa) => x0 + 7 * aa + Math.sin(w * aa + ph0) * amp + (gust(born + aa) - gust(born)) * (near ? 1 : 0.7);
    const size = (near ? 5.8 : 4.2) + R(6) * 1.6, shape = Math.floor(R(7) * 3), col = R3[Math.floor(R(8) * 3)];
    if (rest > 0) {
      const fade = 1 - rest / (dur - tf);
      leaf(q, xAt(tf), FLOOR - 1, size, (R(9) - 0.5) * 0.5, 0.42, shape, col, fade);
      return;
    }
    const x = xAt(a), y = y0 + vy * path(a), tilt = Math.cos(w * a + ph0) * 0.75 + (near ? 0 : 0.3);
    const flip = Math.cos(R(10) * TAU + a * (R(11) < 0.3 ? 5 : 1.2));
    leaf(q, x, y, size, tilt, flip, shape, col, 1);
    if (flip > 0.86) {
      const k2 = (flip - 0.86) / 0.14, hx = x - Math.cos(tilt) * size * 0.3, hy = y - Math.sin(tilt) * size * 0.3 - 1;
      q.px(hx, hy, col[5]);
      q.glow(hx, hy, 5 + size * 0.5, col[4], 0.22 * k2);
    }
  });
}
function leaf(q, x, y, size, ang, flip, shape, col, a) {
  const back = flip < -0.25, fs = 0.35 + 0.65 * Math.abs(flip), c = Math.cos(ang), s = Math.sin(ang);
  const L = size, Wd = size * 0.9, ext = L + 1.5, shapeFn = SHAPES[shape];
  const face = back ? [mix(col[1], hex("#9c8a78"), 0.2), mix(col[2], hex("#c8b49c"), 0.22), mix(col[3], hex("#e0d0b8"), 0.22)] : [col[2], col[3], col[4]];
  const rim = col[0], vein = back ? mix(col[2], hex("#e8dcc8"), 0.5) : col[1];
  q.shade(x - ext, y - ext, x + ext, y + ext, (px, py, out) => {
    const dx = px - x, dy = py - y, lu = (dx * c + dy * s) / L, lv = (-dx * s + dy * c) / (Wd * fs);
    const d = shapeFn(lu, lv);
    if (lu < -1.25 || lu > 1.1) return;
    if (lu < -0.92 && Math.abs(lv * Wd * fs) < 0.5) return void (out.c = rim, out.a = a);
    if (d > 1.32) return;
    out.a = a;
    if (d > 1) out.c = rim;
    else if (Math.abs(lv * Wd * fs) < 0.45 && lu > -0.9 && lu < 0.75) out.c = vein;
    else out.c = lv < -0.15 ? face[2] : lv < 0.35 ? face[1] : face[0];
  });
}
var LITTER = /* @__PURE__ */ new Map();
function litter(q, S, R3) {
  const key = S + R3.flat().join();
  let px = LITTER.get(key);
  if (!px) {
    const pixels = [];
    px = pixels;
    const rec = {
      shade(x0, y0, x1, y1, fn) {
        const o = { c: 0, a: 1 };
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
          for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
            o.c = 0;
            o.a = 1;
            const c = fn(x + 0.5, y + 0.5, o) || o.c;
            if (c) pixels.push(x + 0.5, y + 0.5, c, o.a);
          }
      }
    };
    for (let i = 0; i < 64; i++) {
      const x = -164 + rand(S, i, 91) * 328, y = FLOOR - 2 + Math.floor(rand(S, i, 92) * 4) * 2, col = R3[Math.floor(rand(S, i, 93) * 3)];
      leaf(rec, x, y, 3.6 + rand(S, i, 94) * 1.8, (rand(S, i, 95) - 0.5) * 0.7, 0.45 + rand(S, i, 96) * 0.25, Math.floor(rand(S, i, 97) * 3), col.map((c) => mix(c, col[0], 0.12)), 1);
    }
    LITTER.set(key, px);
  }
  for (let i = 0; i < px.length; i += 4) q.dot(px[i], px[i + 1], px[i + 2], px[i + 3]);
}
export {
  draw,
  drawBack,
  meta
};
