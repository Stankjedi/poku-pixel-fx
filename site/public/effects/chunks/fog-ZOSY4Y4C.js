import {
  bayer,
  field,
  rows,
  sample
} from "./chunk-QOIVVS3D.js";
import "./chunk-KJLRN7JI.js";
import "./chunk-NY4VHNMV.js";
import {
  TAU,
  WHITE,
  clamp,
  fit,
  mix,
  smooth
} from "./chunk-WFSCDWU6.js";
import "./chunk-T3JNBT34.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/weather/fog.ts
var meta = {
  name: "Fog",
  desc: "Slow banks of moonlit fog at three depths drift past each other, crests catching the light, while thin streaks of mist slide by in front.",
  tags: ["weather", "fog", "mist", "haze", "night", "ambient", "loop"],
  size: [320, 180],
  origin: [160, 170],
  duration: 12,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#14121e", "#24213a", "#363250", "#4f4a6c", "#6d688b", "#918cab", "#bdb8d4", "#ece8f6"],
    seed: 5
  }
};
var D = 12;
var W = 320;
var T = [0.3, 0.5, 0.7];
var BW = 0.06;
var BANKS = [
  { top: -84, base: -40, bot: -20, sx: 1.6, sy: 2.2, lap: 1, alpha: 0.24, tone: [2, 3, 4], crest: 5, warp: 16, crestFrom: 3 },
  { top: -62, base: -24, bot: -2, sx: 1.0667, sy: 2.5, lap: 1, alpha: 0.3, tone: [2, 3, 4], crest: 5, warp: 22, crestFrom: 2 },
  { top: -42, base: -8, bot: 10, sx: 0.8, sy: 2.8, lap: 1, alpha: 0.36, tone: [2, 3, 5], crest: 6, warp: 28, crestFrom: 1 }
];
var BR = new Float32Array(W);
var P1 = BANKS.map(() => new Float32Array(W));
var P2 = BANKS.map(() => new Float32Array(W));
var WARP = new Float32Array(W);
function drawBack(p, t, o) {
  const S = o.seed, C = fit(o.palette, 8);
  bank(p, t, S, C, 0);
  bank(p, t, S, C, 1);
}
function draw(p, t, o) {
  const S = o.seed, C = fit(o.palette, 8);
  bank(p, t, S, C, 2);
  streaks(p, t, S, C, 1);
}
function bank(p, t, S, C, n) {
  const B = BANKS[n], F = field(S * 7 + n, 256, 128), G = field(S * 7 + 11, 256, 128, [4, 8, 16]);
  const drift = 256 * B.lap * t / D, boil = 128 * t / D, prev1 = P1[n], prev2 = P2[n];
  const tones = B.tone.map((i) => C[i]), crest = mix(C[B.crest], WHITE, 0.12 + 0.08 * n);
  prev1.fill(0);
  prev2.fill(0);
  for (let i = 0; i < W; i++) BR[i] = 2 * Math.sin(TAU * t / D + (i - 160) * 6e-3 + n * 1.7);
  rows(p, meta, B.top - 2, B.bot, (y, R) => {
    const prof = smooth(B.top, B.base, y) * (1 - smooth(B.bot - (B.bot < 10 ? 14 : 4), B.bot + 1, y));
    for (let i = 0; i < W; i += 2) WARP[i] = WARP[i + 1] = sample(G, i * 0.35 + n * 70, y * 0.5 + boil) - 0.5;
    for (let i = 0; i < W; i++) {
      const x = i - 160 + 0.5, w = WARP[i];
      const nn = clamp((sample(F, x * B.sx + drift + w * B.warp, (y + BR[i]) * B.sy + w * 8) - 0.5) * 2.6 + 0.5) - 0.5;
      const f = prof <= 0.01 ? 0 : (prof * 0.72 + nn * 0.95) * (0.6 + 0.5 * prof);
      const above = prev2[i];
      prev2[i] = prev1[i];
      prev1[i] = f;
      if (f <= T[0]) continue;
      const th = bayer(i, y) * BW, band = f > T[2] + th ? 2 : f > T[1] + th ? 1 : 0, solid = f > T[2] ? 2 : f > T[1] ? 1 : 0;
      if (solid >= B.crestFrom && above < T[solid]) {
        R.c[i] = crest;
        R.a[i] = B.alpha * 0.95;
        R.l[i] = C[6];
        R.k[i] = 0.07;
      } else {
        R.c[i] = tones[band];
        R.a[i] = B.alpha * (0.55 + 0.25 * band);
        if (band === 2) R.l[i] = C[5], R.k[i] = 0.03 + 0.02 * n;
      }
      R.b[i] = 1;
    }
  });
}
function streaks(p, t, S, C, front) {
  const F = field(S * 7 + 20 + front, 256, 128), drift = 256 * t / D, sx = front ? 0.4 : 0.5, y0 = front ? -40 : -96, y1 = front ? 6 : -30;
  rows(p, meta, y0, y1, (y, R) => {
    const env = smooth(y0, y0 + 10, y) * (1 - smooth(y1 - 10, y1, y));
    for (let i = 0; i < W; i++) {
      const x = i - 160 + 0.5, s = (sample(F, x * sx + drift, y * 6.5 + 30) - 0.64) * 3 * env;
      if (s <= 0.05) continue;
      R.c[i] = s > 0.35 ? C[5] : C[4];
      R.a[i] = Math.min(0.4, s);
      R.b[i] = 1;
      R.l[i] = C[5];
      R.k[i] = s * 0.05;
    }
  });
}
export {
  draw,
  drawBack,
  meta
};
