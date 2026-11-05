import {
  drawWord,
  shake,
  spell
} from "./chunk-XUUPYBIM.js";
import {
  Lights,
  P,
  Particles,
  sparkle
} from "./chunk-MCTSDHND.js";
import "./chunk-YQJJU7UN.js";
import {
  Rng,
  TAU,
  WHITE,
  clamp,
  ease,
  fit,
  seg
} from "./chunk-FEXYTCCO.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/ui/quest-complete.ts
var meta = {
  name: "Quest complete",
  desc: "A stitched ribbon unrolls from the middle, QUEST COMPLETE types on letter by letter, a gold seal stamps down and ticks, stars pop; then it all rolls away.",
  tags: ["ui", "quest", "banner", "reward", "text", "one-shot"],
  size: [204, 92],
  origin: [102, 46],
  duration: 2.6,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#2a1405", "#5c3008", "#9a5a0e", "#d48e18", "#f5b92c", "#ffde5e", "#fff4bc", "#ffffff"],
    ribbon: ["#1e0608", "#45101a", "#7a1a26", "#ad2632", "#d8433f", "#f27a5e", "#ffb79a"],
    text: "QUEST COMPLETE",
    seed: 8
  }
};
var L = 66;
var BH = 8;
var OPEN = 0.32;
var TYPE = 0.2;
var STEP = 0.036;
var STAMP = 0.95;
var SX = 64;
var SY = 4;
var POPSEAL = 2;
var ROLL = 2.08;
function ribbon(p, Rb, G, l, tails, t) {
  if (l < 1) return;
  if (tails > 0.02)
    for (const s of [-1, 1]) {
      const drop = 6 * tails, x0 = s * (l - 8), x1 = s * (l + 16 * tails);
      p.shade(Math.min(x0, x1) - 1, -BH + drop - 1, Math.max(x0, x1) + 1, BH + drop + 1, (x, y) => {
        const u = (x - x0) / (x1 - x0), v = y - drop;
        if (u < 0 || u > 1 || Math.abs(v) > BH) return;
        if (u > 1 - 0.3 * (BH - Math.abs(v)) / BH) return;
        const e = Math.min(BH - Math.abs(v), (1 - u) * (x1 - x0) * s);
        if (e < 1 || u < 0.02) return Rb[0];
        return v < -BH + 2 ? Rb[3] : v < 0 ? Rb[2] : Rb[1];
      });
      p.tri(s * (l - 8), BH, s * (l - 1), BH, s * (l - 8), BH + drop, Rb[0]);
    }
  p.shade(-l - 1, -BH - 1, l + 1, BH + 1, (x, y) => {
    const ax = Math.abs(x), v = y;
    if (ax > l || Math.abs(v) > BH) return;
    const e = Math.min(l - ax, BH - Math.abs(v));
    if (e < 1) return Rb[0];
    if (v < -BH + 2) return Rb[5];
    if (v > BH - 2) return Rb[1];
    if ((Math.abs(v + BH - 2.5) < 0.5 || Math.abs(v - BH + 3.5) < 0.5) && Math.floor(x + 0.5) % 3 !== 0 && ax < l - 3) return G[3];
    return v < -1 ? Rb[4] : Rb[3];
  });
  if (tails < 0.02)
    for (const s of [-1, 1]) {
      const x = s * l;
      p.rect(Math.round(x) - 2, -BH - 2, 4, BH * 2 + 4, Rb[0]);
      p.rect(Math.round(x) - 1, -BH - 1, 1, BH * 2 + 2, Rb[4]);
      p.rect(Math.round(x), -BH - 1, 1, BH * 2 + 2, Rb[2]);
      p.px(Math.round(x) - 1, -BH - 1, Rb[6]);
    }
}
function seal(p, G, x, y, r, sx, sy, white, k) {
  const M = r * 1.25 + 2;
  p.shade(x - M * sx, y - M * sy, x + M * sx, y + M * sy, (px, py) => {
    const dx = (px - x) / sx, dy = (py - y) / sy, d = Math.hypot(dx, dy), an = Math.atan2(dy, dx), edge = r * (1 + 0.09 * Math.cos(an * 14));
    if (d > edge) return;
    if (white) return edge - d < 1 ? G[5] : WHITE;
    if (edge - d < 1) return G[0];
    const l = -(dx * 0.6 + dy * 0.8) / r;
    if (edge - d < 3) return l > 0.3 ? G[6] : l > -0.3 ? G[5] : G[3];
    if (Math.abs(d - r * 0.66) < 0.5) return l > 0 ? G[3] : G[2];
    return l > 0.45 ? G[7] : l > 0.1 ? G[6] : l > -0.35 ? G[5] : G[4];
  });
  if (white || k <= 0) return;
  const pts = [[-5, 0], [-1.5, 3.5], [5.5, -4.5]].map(([a, b]) => [x + a * sx, y + b * sy]);
  const len1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), len2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const done = k * (len1 + len2), segs = [[pts[0], pts[1], Math.min(1, done / len1)], [pts[1], pts[2], clamp((done - len1) / len2)]];
  for (const [w, c] of [[4.2, G[0]], [2.4, WHITE]])
    for (const [a, b, u] of segs) if (u > 0) p.beam(a[0], a[1], a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, w, c);
}
function create(o) {
  const G = fit(o.palette, 8), Rb = fit(o.ribbon, 7), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, sparks: [G[7], G[6], G[5], G[3]] }), lights = new Lights();
  const word = spell(o.text, "mini"), TS = 2, TW = word.w * TS, TX = -TW / 2 - 4, TY = -5;
  const glyphs = word.letters.filter((Lt) => Lt.g);
  const sats = Array.from({ length: 7 }, (_, i) => ({ x: (i / 6 - 0.5) * 140 + R.range(-6, 6), y: (i % 2 ? 1 : -1) * R.range(15, 22), t0: STAMP + 0.12 + i * 0.12 + R.range(0, 0.04), dur: R.range(0.3, 0.45), L: R.range(3, 6) }));
  let t = 0, stamped = false, popped = false;
  const end = meta.duration - 0.05;
  return {
    update(dt) {
      t += dt;
      if (!stamped && t >= STAMP) {
        stamped = true;
        lights.add(SX, SY, 40, G[5], 0.7, 0.35);
        lights.add(SX, SY, 18, WHITE, 0.7, 0.1);
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU + R.range(-0.2, 0.2), sp = R.range(40, 80) * (Math.cos(an) > 0 ? 0.6 : 1);
          ps.spawn(P.STAR, SX + Math.cos(an) * 11, SY + Math.sin(an) * 11, Math.cos(an) * sp, Math.sin(an) * sp * 0.7, R.range(0.25, 0.45), R.pick([G[7], G[6], G[5]]), i % 3 ? 0.6 : R.range(1.2, 1.8));
        }
      }
      if (t > STAMP && t < POPSEAL && R.chance(0.08)) ps.spawn(P.STAR, R.range(-L, L), R.range(-BH, BH), R.range(-5, 5), -R.range(8, 20), Math.min(R.range(0.4, 0.8), end - t), R.pick([G[6], G[5]]), 0.6);
      if (!popped && t >= POPSEAL + 0.05) {
        popped = true;
        lights.add(SX, SY, 30, G[6], 0.6, 0.2);
        for (let i = 0; i < 8; i++) {
          const an = R.range(0, TAU), sp = R.range(40, 90);
          ps.spawn(P.STAR, SX + Math.cos(an) * 6, SY + Math.sin(an) * 6, Math.cos(an) * sp, Math.sin(an) * sp, Math.min(R.range(0.25, 0.4), end - t), R.pick([G[7], G[6]]), i % 2 ? 0.6 : 1.5);
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      const [jx, jy] = shake(t, 2, STAMP, 0.18, o.seed);
      const l = L * (t < ROLL ? ease.outCubic(seg(t, 0, OPEN)) : 1 - ease.inCubic(seg(t, ROLL, ROLL + 0.26)));
      const tails = seg(t, OPEN - 0.02, OPEN + 0.12) * (t < ROLL ? 1 : 0);
      const sh = seg(t, 1.2, 1.5), shine = sh > 0 && sh < 1 ? -L - 10 + (2 * L + 20) * sh : null;
      ribbon(p, Rb, G, l, ease.outBack(tails, 2), t);
      if (shine !== null)
        for (let y = -BH + 1; y < BH; y++) {
          const x = shine + (y + BH) * 0.6;
          if (Math.abs(x) < l - 2) p.px(x, y, Rb[6]), p.px(x + 1, y, Rb[5]);
        }
      const items = [];
      glyphs.forEach((Lt, i) => {
        const u = t - (TYPE + i * STEP), x = TX + Lt.x * TS + jx;
        if (u < 0 || Math.abs(x + Lt.w) > l - 3) return;
        const s = u < 0.035 ? 2.6 : TS;
        items.push({ g: Lt.g, x: x - (s - TS) * Lt.w / 2, y: TY + jy - (s - TS) * 5 / 2, sx: s, sy: s, flash: u < 0.07 ? 1 : 0 });
      });
      drawWord(p, items, { fill: [G[4], G[5], G[6], G[7]], edge: WHITE, under: G[3], outline: Rb[0], shadow: Rb[1] });
      const dk = seg(t, STAMP - 0.12, STAMP), pk = t - POPSEAL;
      if (dk > 0 && pk < 0.08) {
        const fall = 1 - ease.inQuad(dk), sq = Math.exp(-(t - STAMP) * 30) * (t >= STAMP ? 1 : 0);
        let s = 1 + 0.8 * fall, sx = s * (1 + 0.2 * sq), sy = s * (1 - 0.2 * sq);
        if (pk > 0) sx = sy = 1 + 0.3 * (pk / 0.08);
        const white = t >= STAMP && t < STAMP + 0.05 || pk > 0;
        if (dk < 1) p.ellipse(SX, SY + 12, 10 * (1 - 0.3 * fall), 2, Rb[0], 0.5 * dk);
        seal(p, G, SX + jx, SY - 14 * fall + jy, 11, sx, sy, white, seg(t, STAMP + 0.08, STAMP + 0.24));
        p.glow(SX, SY, 22, G[5], 0.3 + (white ? 0.4 : 0));
      }
      const rk = (t - STAMP) / 0.3;
      const rr = 12 + 13 * ease.outCubic(rk);
      if (rk > 0 && rk < 1) p.ellipse(SX, SY, rr * 1.15, rr, rk < 0.3 ? WHITE : G[5], (d) => d > 1 - 1.4 / rr ? 1.2 - rk : 0);
      for (const s of sats) {
        const u = (t - s.t0) / s.dur;
        if (u > 0 && u < 1) sparkle(p, s.x, s.y, s.L * Math.pow(Math.sin(u * Math.PI), 0.7), G[6], G[5], 0.5);
      }
      ps.draw(p);
      p.glow(0, 0, 76, G[4], 0.2 * seg(t, 0.2, 0.5) * (1 - seg(t, ROLL, ROLL + 0.2)));
      lights.draw(p);
    }
  };
}
export {
  create,
  meta
};
