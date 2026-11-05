import {
  Layer,
  blobShadow,
  glint,
  heartSdf,
  pillow
} from "./chunk-HLH4EV7V.js";
import {
  cycle
} from "./chunk-MCTSDHND.js";
import "./chunk-YQJJU7UN.js";
import {
  TAU,
  WHITE,
  fit,
  hex
} from "./chunk-FEXYTCCO.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/pickups/heart-pickup.ts
var meta = {
  name: "Heart pickup",
  desc: "A plump glossy heart hovering over its shadow beats lub-dub: a big squash and stretch, a smaller echo, light and a thin ring pulsing out, tiny hearts drifting off.",
  tags: ["pickup", "heart", "health", "life", "loop"],
  size: [56, 60],
  origin: [28, 52],
  duration: 1.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1a0408", "#4a0a14", "#8a1222", "#d02436", "#ff4a56", "#ff8a8e", "#ffd0cc", "#ffffff"], seed: 4 }
};
var L = new Layer(40, 40);
var HOVER = 18;
var W = 7.2;
var INK = hex("#12060c");
var MINI = [".a.a.", "abbba", ".aba.", "..a.."];
var LUB = 0.04;
var DUB = 0.24;
var beat = (ph, at, s) => {
  const u = ph - at;
  if (u < 0 || u > 0.3) return 0;
  return s * Math.exp(-u * 16) * Math.cos(u * 34);
};
var pulse = (ph) => beat(ph, LUB, 1) + beat(ph, DUB, 0.55) + beat(ph + 1, LUB, 1);
function drawBack(p, t, o) {
  const C = fit(o.palette, 8), ph = t / meta.duration, y = -HOVER - 1.2 * Math.sin(ph * TAU);
  blobShadow(p, 0, 8 + 1.5 * pulse(ph), 0.8);
  cycle(t, meta.duration, 4, o.seed, 0.95, (age, life, r, i) => {
    const side = i % 2 ? 1 : -1, k = age / life;
    const x = side * (r.range(2, 5) + age * r.range(9, 15)) + Math.sin(age * 7 + r.range(0, TAU)) * 1.5, yy = y - 5 - age * r.range(14, 19);
    const a = Math.min(1, age / 0.12) * (1 - k * k);
    p.sprite(MINI, { a: k < 0.5 ? C[5] : C[4], b: k < 0.3 ? WHITE : C[6] }, Math.round(x - 2.5), Math.round(yy - 2), { a: a * 1.3 });
    p.glow(x, yy, 5, C[4], 0.3 * a);
  });
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), ph = t / meta.duration, y = -HOVER - 1.2 * Math.sin(ph * TAU), b = pulse(ph);
  const sx = 1 + 0.16 * b, sy = 1 - 0.13 * b, cy = Math.round(y);
  p.glow(0, cy, 22 + 6 * Math.max(0, b), C[4], 0.26 + 0.3 * Math.max(0, b));
  L.begin(-20, cy - 20);
  pillow(L, -12, cy - 11, 12, cy + 11, (x, yy) => heartSdf(x, yy, 0, cy, W * sx, W * sy), (lt, e) => {
    if (lt > 0.92 && e > 1.2) return WHITE;
    return lt > 0.8 ? C[6] : lt > 0.6 ? C[5] : lt > 0.38 ? C[4] : lt > 0.12 ? C[3] : C[2];
  }, { bevel: 3.6 });
  L.outline(INK).draw(p);
  const u = ((ph - LUB) % 1 + 1) % 1;
  if (u < 0.28) {
    const k = u / 0.28, r = 9 + 8 * (1 - (1 - k) ** 3);
    p.ring(0, cy, r, 1, k < 0.2 ? C[6] : C[5], 0.85 * (1 - k));
    p.glowRing(0, cy, r, 4, C[4], 0.25 * (1 - k));
  }
  const g = ((ph - LUB - 0.08) % 0.5 + 0.5) % 0.5;
  if (g < 0.12) glint(p, -3.5, cy - 4, 2.6 * Math.sin(g / 0.12 * Math.PI), WHITE, 0.45);
}
export {
  draw,
  drawBack,
  meta
};
