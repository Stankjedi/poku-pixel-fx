import {
  burn,
  drift,
  ember,
  floorLight,
  hotFirst,
  looped,
  noiseFor,
  spark
} from "./chunk-M4VOOEKR.js";
import "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  WHITE,
  fit,
  mix,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/fire/brazier.ts
var meta = {
  name: "Brazier",
  desc: "An iron bowl on a tripod heaped with glowing coals and a big roaring fire, sparks and embers streaming up off it, light on the iron and the floor.",
  tags: ["fire", "brazier", "prop", "light", "sparks", "ambient", "loop"],
  size: [112, 148],
  origin: [56, 136],
  duration: 3,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    iron: ["#0b0910", "#1c1924", "#302c3a", "#4c4658", "#78708a"],
    seed: 8
  }
};
var D = meta.duration;
var NL = noiseFor(D);
var RIM = -25;
var RX = 15;
var RY = 3;
var TONGUES = [
  [-7, -1.5, 0.5, 2, 1],
  [7.2, -1.5, 0.55, 2, 1],
  [-3, -2.5, 0.84, 2.2, 1],
  [3.3, -2.5, 0.86, 2.2, 1],
  [-11.5, 0.5, 0.2, 1.5, 0],
  [11.5, 0.5, 0.22, 1.5, 0],
  [-8.3, 0, 0.34, 2, 0],
  [8.5, 0, 0.38, 2, 0],
  [-4.7, -0.5, 0.6, 2.8, 0],
  [4.9, -0.5, 0.64, 2.8, 0],
  [0, -1, 1, 3.6, 0]
];
function stand(p, I, H, fl) {
  const leg = (x0, y0, x1, y1) => {
    p.line(x0, y0, x1, y1, I[0]);
    p.line(x0 + 1, y0, x1 + 1, y1, I[2]);
    p.line(x0 + 2, y0, x1 + 2, y1, I[0]);
  };
  p.ellipse(0, -9, 9, 1.8, (d) => d > 0.6 ? I[2] : 0);
  leg(-6, -17, -12, -1);
  leg(4, -17, 10, -1);
  p.rect(-14, -1, 5, 1, I[2]), p.rect(-15, 0, 6, 1, I[0]), p.px(-15, -1, I[3]);
  p.rect(9, -1, 5, 1, I[2]), p.rect(9, 0, 6, 1, I[0]), p.px(13, -1, I[3]);
  p.rect(-1, -16, 3, 15, I[0]);
  p.rect(0, -16, 1, 15, mix(I[3], H[4], 0.15 * fl));
  p.rect(-2, -1, 5, 1, I[2]), p.rect(-2, 0, 5, 1, I[0]);
  p.ellipse(0, -9, 9, 1.8, (d, a) => Math.sin(a) > 0 && d > 0.55 ? d > 0.85 ? I[0] : I[3] : 0);
}
function bowl(p, I, H, fl) {
  p.shade(-RX - 1, RIM - 1, RX + 1, RIM + 9, (x, y) => {
    const v = (y - RIM) / 9, hw = RX * Math.sqrt(Math.max(0, 1 - v * v * 0.9)) - (v > 0.5 ? (v - 0.5) * 6 : 0);
    if (Math.abs(x) > hw + 0.5 || y < RIM) return;
    if (Math.abs(x) > hw - 0.5 || v > 0.92) return I[0];
    if (y < RIM + 1) return mix(I[3], H[4], 0.5 * fl);
    if (y < RIM + 2) return I[2];
    if (y < RIM + 3) return Math.round(x) % 4 === 0 ? mix(I[4], H[4], 0.25 * fl) : I[0];
    return x < -RX * 0.45 ? I[2] : x < RX * 0.25 ? I[1] : I[0];
  });
}
function coals(p, I, H, t, S) {
  p.shade(-RX, RIM - 6, RX, RIM + 1, (x, y, out) => {
    const top = RIM - 1 - 4 * Math.max(0, 1 - (x / (RX - 1)) ** 2);
    if (y < top || y > RIM + 0.5 || Math.abs(x) > RX - 0.5) return;
    const lump = rand(Math.floor((x + Math.floor(y) * 1.5) / 3), Math.floor(y / 2), S + 20), edge = y < top + 1;
    if (rand(Math.floor(x), Math.floor(y), S + 21) < 0.16 || edge && lump < 0.3) return I[0];
    const g = (0.5 + 0.5 * Math.sin(t / D * Math.PI * 4 + lump * 40)) * (edge ? 0.7 : 1);
    out.k = 0.3 * g;
    return g > 0.72 ? H[2] : g > 0.5 ? H[3] : g > 0.3 ? H[4] : g > 0.15 ? H[5] : H[6];
  });
}
function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), I = fit(o.iron, 5), S = o.seed;
  const fl = 0.74 + 0.16 * NL(t, 7.3, S + 1) + 0.1 * NL(t, 19, S + 2), GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.25);
  const SPARKS = [H[1], H[2], H[4], H[5]], EMB = [H[1], H[2], H[4], H[6]];
  floorLight(p, 0, 0.5, 40, 7, GLOW, 0.32 * fl);
  stand(p, I, H, fl);
  p.ellipse(0, RIM, RX, RY, (d, a) => Math.sin(a) < 0 && d > 0.7 ? d > 0.88 ? I[0] : mix(I[3], H[4], 0.3 * fl) : 0);
  burn(p, t, TONGUES, {
    H,
    D,
    NL,
    S,
    x: 0,
    y: RIM,
    height: 32,
    lean: 0.1,
    spread: 7,
    puffs: 8,
    licks: 4,
    smoke: 14,
    smokeSize: 3,
    smokeLife: [1.6, 2.4],
    embers: 10,
    glowR: 58,
    glow: 1.4,
    wind: 3,
    mid: () => {
      coals(p, I, H, t, S);
      bowl(p, I, H, fl);
    }
  });
  looped(t, D, 60, S + 600, (r) => {
    const side = r.range(-1, 1);
    return { x: side * 8, y: RIM - r.range(4, 18), vx: side * r.range(10, 40), vy: -r.range(70, 150), life: r.range(0.7, 1.7), a: r.range(0, 6.3), w: r.range(1.8, 3.2), m: r.range(3, 8), big: r.chance(0.12) };
  }, (q, age) => {
    const [x, y, vx, vy] = drift(q.x, q.y, q.vx, q.vy, age, 0, -22, 1.9, 1.9), k = 1 - age / q.life;
    const wob = q.m * (Math.sin(age * q.w + q.a) - Math.sin(q.a)) * Math.min(1, age * 1.5), wv = q.m * q.w * Math.cos(age * q.w + q.a) * Math.min(1, age * 1.5);
    if (Math.hypot(vx + wv, vy) > 40) spark(p, x + wob, y, vx + wv, vy, k, SPARKS);
    else ember(p, x + wob, y, k, q.big ? 2 : 1, EMB, age * 40 + q.a);
  });
}
export {
  draw,
  meta
};
