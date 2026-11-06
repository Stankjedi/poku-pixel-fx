import {
  blobShadow,
  glint,
  pool
} from "./chunk-3LAYLG6T.js";
import {
  cycle
} from "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-IA67RXAQ.js";
import {
  TAU,
  WHITE,
  fit,
  hex
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/pickups/xp-orb.ts
var meta = {
  name: "XP orb",
  desc: "A small glowing orb races a figure-eight, a comet tail tapering behind it along its path, flecks shed from the tail winking out, its light following it over the floor.",
  tags: ["pickup", "xp", "orb", "experience", "energy", "loop"],
  size: [72, 56],
  origin: [36, 48],
  duration: 1.8,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: ["#0c1806", "#1e3a0a", "#36620e", "#5c9614", "#8cd024", "#c4f060", "#effcc0", "#ffffff"], seed: 2 }
};
var A = 16;
var B = 9;
var HOVER = 20;
var TAIL = 0.48;
var INK = hex("#0a1406");
var at = (t) => {
  const a = t / meta.duration * TAU;
  return [A * Math.sin(a), -HOVER + B * Math.sin(a) * Math.cos(a) - 1.2 * Math.cos(a * 2)];
};
function drawBack(p, t, o) {
  const C = fit(o.palette, 8), [x, y] = at(t);
  blobShadow(p, x, 3.5, 0.55);
  pool(p, x, 0.5, 14, 3, C[5], 0.3);
  cycle(t, meta.duration, 16, o.seed, (g) => g.range(0.35, 0.7), (age, life, r) => {
    const [fx, fy] = at(t - age), k = 1 - age / life, tw = Math.sin(age * r.range(20, 30) + r.range(0, TAU));
    const x2 = fx + r.range(-2, 2) + age * r.range(-6, 6), y2 = fy + r.range(-2, 2) + age * r.range(4, 10);
    if (tw * k > -0.2) p.px(x2, y2, tw > 0.6 && k > 0.5 ? WHITE : k > 0.5 ? C[6] : C[5]);
    p.glow(x2 + 0.5, y2 + 0.5, 3, C[5], 0.3 * k);
  });
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), [x, y] = at(t), beat = 0.5 + 0.5 * Math.sin(t / meta.duration * TAU * 3);
  const n = 60;
  for (let i = n; i >= 1; i--) {
    const u = i / n, [tx, ty] = at(t - u * TAIL), r = 3.1 * Math.pow(1 - u, 1.1);
    const c = u < 0.25 ? C[5] : u < 0.55 ? C[4] : C[3];
    if (r > 0.6) p.circle(tx, ty, r, c, u < 0.7 ? 1 : (1 - u) * 3.3);
    else p.dot(tx, ty, c, (1 - u) * 3);
    if (i % 6 === 0) p.glow(tx, ty, 7 * (1 - u) + 2, C[5], 0.24 * (1 - u));
  }
  for (let i = Math.floor(n * 0.6); i >= 1; i--) {
    const u = i / n, [tx, ty] = at(t - u * TAIL);
    p.dot(tx, ty, u < 0.2 ? WHITE : C[6], (0.6 - u) * 4);
  }
  const X = Math.round(x), Y = Math.round(y);
  p.circle(X, Y, 4.4, INK);
  p.circle(X, Y, 3.6, (d, a) => d > 0.72 ? Math.cos(a + 2.4) > 0.3 ? C[5] : C[3] : d > 0.4 ? Math.cos(a + 2.4) > -0.2 ? C[6] : C[5] : WHITE);
  p.px(X - 2, Y - 2, WHITE), p.px(X - 1, Y - 2, C[7]);
  p.glow(x, y, 16 + 3 * beat, C[5], 0.36 + 0.14 * beat);
  const g = t / meta.duration * 3 % 1;
  if (g < 0.12) glint(p, X - 2, Y - 2, 2.4 * Math.sin(g / 0.12 * Math.PI), WHITE, 0.4);
}
export {
  draw,
  drawBack,
  meta
};
