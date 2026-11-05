import {
  shape,
  travel
} from "./chunk-MOWS46MY.js";
import "./chunk-MCTSDHND.js";
import "./chunk-YQJJU7UN.js";
import {
  fit,
  rand,
  smooth
} from "./chunk-FEXYTCCO.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/status/bleeding.ts
var meta = {
  name: "Bleeding",
  desc: "Bleeding out: beads swell at three wounds, run, let go and fall to spatter into a glossy pool that ripples; each heartbeat spurts a little and flashes the body red.",
  tags: ["status", "bleed", "blood", "dot", "debuff", "wound", "loop"],
  size: [60, 56],
  origin: [30, 46],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#350711", "#5e0c1b", "#931327", "#c71e33", "#f2384a", "#ff8a7a"], seed: 5 }
};
var CLUTCH = { turn: 0.7, crouch: 3, lean: 2, fx: 2, fy: -21, bx: 8, by: -14, ffx: 3, fbx: -3 };
var BEAT_ = { ...CLUTCH, crouch: 5, lean: 4, hy: 1 };
var act = {
  onBody: true,
  poses: [[0, BEAT_], [0.18, CLUTCH], [1.2, CLUTCH], [1.2, BEAT_, "snap"], [1.38, CLUTCH], [2.4, CLUTCH], [2.4, BEAT_, "snap"]]
};
var D = meta.duration;
var BEAT = D / 2;
var G = 900;
var WOUNDS = /* @__PURE__ */ new WeakMap();
function wounds(a) {
  let w = WOUNDS.get(a.mask);
  if (w) return w;
  const S = shape(a), H = S.h, W = S.w;
  const make = (mx, my, drops, phase) => {
    let run = 1;
    while (run < 3 && S.on(mx, my + run + 1)) run++;
    return { x: a.x + mx + 0.5, mx, y0: a.y + my, yb: a.y + my + run + 1, drops, phase, side: mx < W / 2 ? -1 : 1 };
  };
  const edge = (q, side) => {
    const my = Math.round(H * q), [l, r] = S.rows[my];
    return [side < 0 ? l + 1 : r - 1, my];
  };
  const front = S.body.filter(([x, y]) => y > H * 0.5 && y < H * 0.62 && x > W * 0.55 && x < W * 0.75 && S.on(x, y + 3))[0] ?? edge(0.55, 1);
  w = [make(...edge(0.57, -1), 3, 0), make(...front, 2, 0.35), make(...edge(0.6, 1), 2, 0.7)];
  WOUNDS.set(a.mask, w);
  return w;
}
function drop(p, C, x, y, v, s) {
  const tail = Math.min(5, v * 0.012);
  if (tail >= 1) p.line(x, y - tail, x, y - 1, s >= 2 ? C[3] : C[2]);
  if (s >= 2) {
    p.px(x, y, C[5]);
    p.px(x + 1, y, C[4]);
    p.px(x, y + 1, C[3]);
    p.px(x + 1, y + 1, C[2]);
  } else p.px(x, y, C[4]);
}
function splat(p, C, x, ground, age, big, seed) {
  const life = D * 0.85;
  if (age < 0 || age > life) return;
  const spread = smooth(0, 0.1, age), hw = (big ? 2.2 : 1.4) * (0.5 + 0.5 * spread), fade = 1 - smooth(life - 0.5, life, age);
  const dry = age < 0.35 ? 4 : age < 1 ? 3 : 2;
  for (let xx = Math.floor(x - hw); xx <= Math.ceil(x + hw); xx++) p.dot(xx, ground - 1, Math.abs(xx + 0.5 - x) > hw * 0.75 ? C[dry - 1] : C[dry], fade);
  if (age < 0.3) p.px(x - 0.5, ground - 1, C[5]);
  if (age < 0.4)
    for (let j = 0; j < (big ? 3 : 2); j++) {
      const vx = (j % 2 ? 1 : -1) * (18 + 24 * rand(seed, j, 1)), vy = -(40 + 40 * rand(seed, j, 2)), tt = age;
      const dx = vx * tt, dy = vy * tt + 0.5 * G * tt * tt;
      if (dy <= 0) p.px(x + dx, ground - 1 + dy, j ? C[3] : C[4]);
    }
}
function drawBack(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, W = wounds(a);
  const px = (W[0].x + W[2].x) / 2 - 1, rx = 6.5, beat = Math.exp(-((t % BEAT + BEAT) % BEAT / 0.25));
  for (let x = Math.floor(px - rx - 1); x <= px + rx + 1; x++) {
    const q = Math.abs(x + 0.5 - px) / rx;
    if (q > 1.1) continue;
    p.px(x, -1, q > 0.85 ? C[2] : C[1]);
    if (q < 0.8) p.px(x, 0, q < 0.5 ? C[1] : C[0]);
    if (q < 0.45) p.px(x, 1, C[0]);
  }
  p.px(px - 2, -1, C[4]);
  p.px(px - 1, -1, C[3]);
  p.px(px + 3, -1, C[3]);
  p.glow(px, -1, 8, C[3], 0.06 + 0.04 * beat);
}
function draw(p, t, o) {
  const C = fit(o.palette, 6), a = o.actor, W = wounds(a), S = shape(a);
  const ph = (t % BEAT + BEAT) % BEAT, hurt = Math.max(0, 1 - ph / 0.12);
  if (hurt > 0) for (const [mx, my] of S.body) p.blend(a.x + mx, a.y + my, C[4], 0.26 * hurt);
  for (const w2 of W) {
    p.px(w2.x, w2.y0 - 1, C[1]);
    p.px(w2.x - w2.side, w2.y0 - 1, C[0]);
    p.px(w2.x - w2.side, w2.y0, C[2]);
    for (let y = w2.y0; y < w2.yb; y++) p.px(w2.x, y, y === w2.y0 ? C[4] : y >= w2.yb - 1 ? C[3] : C[2]);
    const period = D / w2.drops;
    for (let k = 0; k < w2.drops; k++) {
      const born = w2.phase * period + k * period, age = ((t - born) % D + D) % D, swell = period * 0.62, big = (k + w2.mx) % 2 === 0;
      const fallH = Math.max(1, -1 - w2.yb), fall = Math.sqrt(2 * fallH / G), ground = 0;
      if (age < swell) {
        const u = age / swell, len = u < 0.35 ? 1 : u < 0.75 ? 2 : 3;
        for (let j = 0; j < len; j++) p.px(w2.x, w2.yb + j, j === len - 1 ? C[2] : C[3]);
        if (len === 3) p.px(w2.x - 1, w2.yb + 2, C[1]);
        p.px(w2.x, w2.yb + len - 2, u > 0.5 ? C[5] : C[4]);
      } else if (age < swell + fall) {
        const f = age - swell, y = w2.yb + 2 + 0.5 * G * f * f;
        drop(p, C, w2.x, y, G * f, big ? 2 : 1);
      } else splat(p, C, w2.x, ground, age - swell - fall, big, w2.mx * 31 + k);
    }
  }
  const w = W[0];
  if (ph < 0.5)
    for (let j = 0; j < 7; j++) {
      const vx = w.side * (18 + 42 * rand(j, 7)), vy = -(15 + 50 * rand(j, 8)), tt = ph - j * 0.012;
      if (tt <= 0) continue;
      const x = w.x + travel(vx, 0, 1.2, tt), y = w.y0 + travel(vy, G * 0.8, 0.6, tt);
      const x2 = w.x + travel(vx, 0, 1.2, tt - 0.02), y2 = w.y0 + travel(vy, G * 0.8, 0.6, tt - 0.02);
      if (y >= -1) continue;
      p.line(x2, y2, x, y, j % 3 ? C[3] : C[2]);
      p.px(x, y, j % 2 ? C[5] : C[4]);
    }
  p.glow(w.x, w.y0, 6, C[4], 0.25 * hurt);
}
export {
  act,
  draw,
  drawBack,
  meta
};
