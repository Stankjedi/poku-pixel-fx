import {
  Layer,
  blobShadow,
  coin3d,
  glint
} from "./chunk-BI7B5O4Z.js";
import "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  TAU,
  WHITE,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/pickups/coin-spin.ts
var meta = {
  name: "Coin spin",
  desc: "A thick gold coin turning on its edge: an embossed star face, a reeded rim showing as it goes edge-on, a flash sweeping the face, bobbing over its shadow.",
  tags: ["pickup", "coin", "gold", "money", "loop"],
  size: [56, 56],
  origin: [28, 48],
  duration: 1.6,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff"], seed: 3 }
};
var L = new Layer(32, 32);
var R = 7;
var TH = 3;
var HOVER = 17;
function drawBack(p, t, o) {
  const T = meta.duration, ph = t / T, th = ph * TAU, y = -HOVER - 2 * Math.sin(ph * TAU);
  blobShadow(p, 0, 2.5 + 4.5 * Math.abs(Math.cos(th)) + 1.5 * Math.abs(Math.sin(th)), 0.85 - (-y - HOVER + 2) * 0.06);
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), T = meta.duration, ph = t / T, th = ph * TAU, y = -HOVER - 2 * Math.sin(ph * TAU);
  const facing = Math.abs(Math.cos(th));
  p.glow(0, y, 20, C[4], 0.3 + 0.12 * facing);
  const flash = coin3d(L, p, 0, y, R, TH, th, C);
  p.glow(-1, y - 1, 12, C[6], 0.35 * flash);
  if (flash > 0.3) glint(p, -4, y - 4, 1 + 3.2 * flash, C[6], 0.5 * flash);
  for (let i = 0; i < 5; i++) {
    const life = 0.35, age = ((t - i / 5 * T - rand(i, o.seed, 3) * 0.08) % T + T) % T;
    if (age > life) continue;
    const a = rand(i, o.seed, 1) * TAU + i * 2.1, d = 10 + rand(i, o.seed, 2) * 5, k = Math.sin(age / life * Math.PI);
    glint(p, Math.cos(a) * d, y + Math.sin(a) * d * 0.85 - age * 8, Math.round(2 * k), i % 2 ? C[6] : WHITE, 0.35 * k);
  }
}
export {
  draw,
  drawBack,
  meta
};
