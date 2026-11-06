import {
  clip,
  pass,
  trips
} from "./chunk-XN5EZQR2.js";
import "./chunk-SRKY5KGN.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-7OMNYR2P.js";
import {
  TAU,
  WHITE,
  fit,
  mix,
  rand,
  smooth,
  wrap
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/weather/snow.ts
var meta = {
  name: "Snow",
  desc: "Snow at three depths in a gusty breeze: far specks, drifting flakes, big near crystals that spin and glow; they settle on a sparkling drift and melt away.",
  tags: ["weather", "snow", "winter", "cold", "ambient", "loop"],
  size: [320, 180],
  origin: [160, 170],
  duration: 12,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#0c1020", "#161d36", "#24304f", "#3a4a72", "#5f74a3", "#93abd6", "#cfe0fa", "#ffffff"],
    seed: 6
  }
};
var D = 12;
var bank = (x) => -3 + 1.6 * Math.sin(x * 0.045 + 1.3) + 1.1 * Math.sin(x * 0.12 + 0.4) + 0.6 * Math.sin(x * 0.31 + 2);
var gust = (t) => 10 * Math.sin(TAU * t / D + 0.6) + 4 * Math.sin(TAU * 2 * t / D + 2.1);
var LAYERS = [
  { n: 230, m: [1, 2], air: 1, sway: [1, 3], wind: 3, gust: 0.4 },
  { n: 140, m: [2, 3], air: 0.8, sway: [3, 7], wind: 6, gust: 0.7 },
  { n: 24, m: [2, 3], air: 0.74, sway: [8, 15], wind: 9, gust: 1 }
];
function drawBack(p, t, o) {
  const q = clip(p, meta), S = o.seed, C = fit(o.palette, 8);
  const haze = mix(C[1], C[2], 0.4);
  pass(p, meta, -170, 9, (x, y, out) => {
    out.c = haze;
    out.a = 0.26 + 0.22 * smooth(-170, 0, y);
    out.b = 1;
  });
  layer(q, t, S, C, 0);
  drift(q, t, S, C);
  layer(q, t, S, C, 1);
}
function draw(p, t, o) {
  const q = clip(p, meta), S = o.seed, C = fit(o.palette, 8);
  layer(q, t, S, C, 2);
}
function layer(q, t, S, C, L) {
  const Ly = LAYERS[L], sd = S * 13 + L;
  trips(t, D, Ly.n, sd, Ly.m[0], Ly.m[1], (u, k, m, i) => {
    const j = wrap(k, m), dur = D / m, R = (n) => rand(sd, i, j, n);
    const tf = dur * Ly.air, age = Math.min(u * dur, tf), sw = Ly.sway[0] + R(3) * (Ly.sway[1] - Ly.sway[0]), f = 0.25 + R(4) * 0.35, ph = R(5) * TAU;
    const xAt = (a) => -175 + R(2) * 350 + Ly.wind * a + (gust(t - u * dur + a) - gust(t - u * dur)) * Ly.gust + sw * Math.sin(TAU * f * a + ph);
    const x = xAt(age), xl = xAt(tf), y0 = -176, y1 = L ? bank(xl) - 0.5 : -110 + R(1) * 106;
    const y = y0 + (y1 - y0) * (age / tf), rest = u * dur - tf;
    if (L === 0) {
      const a = Math.min(1, (1 - u) * 6);
      q.dot(x, y, R(6) < 0.5 ? C[4] : C[5], a);
      return;
    }
    const fade = rest > 0 ? 1 - rest / (dur - tf) : 1;
    if (L === 1) {
      const big = R(6) < 0.3;
      if (rest > 0) return void q.dot(xl, y1, C[7], fade * 0.9);
      q.px(x, y, big ? WHITE : C[7]);
      if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.px(x + dx, y + dy, C[5]);
      else q.px(x + 1, y, C[6]), q.px(x, y + 1, C[6]), q.px(x + 1, y + 1, C[5]);
      return;
    }
    const r = R(6) < 0.4 ? 3 : R(6) < 0.8 ? 4 : 5, spin = 1.5 + R(7) * 2.5;
    if (rest > 0) {
      q.dot(xl - 1, y1, C[6], fade);
      q.dot(xl, y1, WHITE, fade);
      q.dot(xl + 1, y1, C[6], fade);
      q.glow(xl, y1, 5, C[5], 0.25 * fade);
      return;
    }
    crystal(q, x, y, r, Math.floor(age * spin + R(8) * 2) % 2, C);
  });
}
var AXIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var DIAG = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
function crystal(q, x, y, r, turn, C) {
  const X = Math.round(x), Y = Math.round(y), long = turn ? DIAG : AXIS, short = turn ? AXIS : DIAG, R = turn ? r - 1 : r;
  for (const [dx, dy] of long) {
    for (let d = 1; d <= R; d++) q.px(X + dx * d, Y + dy * d, d === R ? WHITE : C[6]);
    const nubs = turn ? R >= 3 ? [R - 1] : [] : R >= 5 ? [R - 1, R - 2] : R >= 4 ? [R - 1] : [];
    for (const n of nubs) {
      const ox = turn ? dx : dy, oy = turn ? -dy : -dx;
      q.px(X + dx * n + (turn ? 0 : ox), Y + dy * n + (turn ? oy : oy), C[4]);
      q.px(X + dx * n + (turn ? -dx : -ox) + (turn ? dx : 0), Y + dy * n + (turn ? dy * 0 : -oy), C[4]);
    }
  }
  for (const [dx, dy] of short) for (let d = 1; d <= (turn ? 1 : Math.max(1, Math.floor(R / 2))); d++) q.px(X + dx * d, Y + dy * d, d === 1 ? C[6] : C[5]);
  q.px(X, Y, WHITE);
  q.glow(X + 0.5, Y + 0.5, r * 2.5 + 5, C[5], 0.13);
  q.light(X, Y, C[6], 0.4);
}
function drift(q, t, S, C) {
  pass(q, meta, -7, 9, (x, y, out) => {
    const top = bank(x), d = y - top;
    if (d < 0) return;
    out.c = d < 1 ? WHITE : d < 2 ? C[7] : d < 3.5 ? C[6] : d < 6 ? C[5] : C[4];
    if (d < 1) out.l = C[6], out.k = 0.12;
  });
  for (let i = 0; i < 18; i++) {
    const x = -156 + rand(S, i, 81) * 312, c = 1 + Math.floor(rand(S, i, 82) * 3), tw = Math.sin(TAU * c * t / D + rand(S, i, 83) * TAU);
    if (tw < 0.55) continue;
    const y = Math.ceil(bank(x)) + Math.floor(rand(S, i, 84) * 3), k = (tw - 0.55) / 0.45;
    q.px(x, y, WHITE);
    if (k > 0.5) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) q.px(x + dx, y + dy, C[6]);
    q.glow(x + 0.5, y + 0.5, 6, C[6], 0.35 * k);
  }
}
export {
  draw,
  drawBack,
  meta
};
