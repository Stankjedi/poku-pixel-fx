import {
  mote
} from "./chunk-JTHUPMDT.js";
import {
  cycle,
  sparkle
} from "./chunk-X6RE4KHI.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-X2UOCPCM.js";
import {
  PAL,
  TAU,
  WHITE,
  fit
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/arcane-orb.ts
var D = 2.4;
var RAD = 17;
var Y0 = -52;
var meta = {
  name: "Arcane orb",
  desc: "A floating orb of smoky violet glass with a swirl turning round a white-hot heart, two tilted rings of light orbiting behind and in front.",
  tags: ["arcane", "orb", "sphere", "magic", "floating", "loop"],
  size: [136, 112],
  origin: [68, 104],
  duration: D,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: PAL.arcane, seed: 6 }
};
var RINGS = [
  { r: 31, sy: 0.24, rot: 0.36, beads: 3, turn: 2, c: 0 },
  { r: 27, sy: 0.3, rot: -0.55, beads: 2, turn: -3, c: 1 }
];
function setup(t) {
  const ph = t / D;
  return { ph, cx: 0, cy: Y0 + Math.sin(ph * TAU) * 2 };
}
function ring(p, C, s, R, near) {
  const { ph, cx, cy } = s, rot = R.rot + 0.12 * Math.sin(ph * TAU + R.c), cr = Math.cos(rot), sr = Math.sin(rot), n = Math.ceil(R.r * TAU * 1.5);
  const pos = (g) => {
    const lx = Math.cos(g) * R.r, ly = Math.sin(g) * R.r * R.sy;
    return [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr];
  };
  for (let j = 0; j < n; j++) {
    const g = j / n * TAU, z = Math.sin(g);
    if (z > 0 !== near) continue;
    const [x, y] = pos(g);
    p.dot(x, y, near ? C[5] : C[4], near ? 0.7 : 0.4);
  }
  for (let b = 0; b < R.beads; b++) {
    const g = ph * TAU * R.turn + b * TAU / R.beads;
    for (let k = 0; k < 7; k++) {
      const gg = g - Math.sign(R.turn) * k * 0.07, z = Math.sin(gg);
      if (z > 0 !== near) continue;
      const [x, y] = pos(gg);
      p.dot(x, y, k === 0 ? WHITE : k < 3 ? C[6] : C[5], k < 4 ? 1 : 1 - (k - 3) / 4);
      if (k === 0) p.glow(x, y, near ? 7 : 5, C[6], near ? 0.5 : 0.25);
    }
  }
}
function orb(p, C, s) {
  const { ph, cx, cy } = s;
  p.disc(cx, cy, RAD, (d) => d > 0.82 ? C[2] : C[1], (d) => 0.32 + 0.5 * d * d);
  for (const [s0, main] of [[0, 1], [Math.PI, 1], [Math.PI / 2, 0], [3 * Math.PI / 2, 0]])
    for (let u = 0.08; u <= 0.85; u += 0.012) {
      const a = ph * TAU * 2 + s0 + u * 3.4, r = u * RAD * 0.92, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, fade = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.25;
      if (!main) {
        p.dot(x, y, C[4], fade * 0.8);
        continue;
      }
      const b = a - 0.16, xb = cx + Math.cos(b) * r, yb = cy + Math.sin(b) * r;
      p.dot(xb, yb, u < 0.4 ? C[6] : C[5], fade);
      p.dot(x, y, u < 0.3 ? WHITE : u < 0.55 ? C[6] : C[5], fade);
    }
  const pulse = 0.85 + 0.15 * Math.sin(ph * TAU * 3);
  p.circle(cx, cy, 3.6 * pulse + 1, C[5]);
  p.circle(cx, cy, 2.8 * pulse, C[6]);
  p.circle(cx, cy, 1.7 * pulse, WHITE);
  p.ring(cx, cy, RAD + 0.4, 1, C[5]);
  p.ring(cx, cy, RAD + 1.3, 1, C[2], 0.8);
  for (let a = 3.5; a < 4.7; a += 0.03) p.dot(cx + Math.cos(a) * (RAD - 2.4), cy + Math.sin(a) * (RAD - 2.4), a > 3.85 && a < 4.35 ? WHITE : C[6]);
  p.circle(cx - RAD * 0.42, cy - RAD * 0.5, 1.3, WHITE);
  p.dot(cx + RAD * 0.52, cy + RAD * 0.55, C[6]);
  p.glow(cx, cy, 20, C[6], 0.26 * pulse);
  p.glowRing(cx, cy, RAD, 6, C[5], 0.25);
}
function motes(p, C, s, S, near) {
  const { ph, cx, cy } = s;
  for (let i = 0; i < 8; i++) {
    const a = (i * 2.4 + S) % TAU + ph * TAU * (i % 2 ? 1 : -1) * (1 + i % 3), rr = RAD + 5 + i * 0.37 % 1 * 12, tilt = (i * 0.71 % 1 - 0.5) * 1.4;
    const x0 = Math.cos(a) * rr, z = Math.sin(a);
    if (z > 0 !== near) continue;
    const x = cx + x0 * Math.cos(tilt), y = cy + x0 * Math.sin(tilt) + z * rr * 0.28, dir = i % 2 ? 1 : -1;
    p.dot(x, y, near ? WHITE : C[5]);
    p.dot(x - dir, y, near ? C[6] : C[4], near ? 1 : 0.6);
    if (near) p.dot(x - 2 * dir, y, C[4], 0.6), p.glow(x, y, 5, C[6], 0.35);
  }
  if (!near) return;
  cycle(ph * D, D, 10, S * 3 + 1, (g) => g.range(0.6, 1), (age, life, r) => {
    const a = r.range(0, TAU), q = age / life, d = RAD + 1 + q * r.range(8, 18);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d - q * 10;
    mote(p, x, y, Math.cos(a) * 25, Math.sin(a) * 25 - 12, r.chance(0.5) ? C[6] : C[5], 0.6, 1 - q, 0.3);
  });
}
function drawBack(p, t, o) {
  const C = fit(o.palette, 8), s = setup(t), lift = (s.cy - Y0) / 2;
  p.glow(0, -1, 36, C[4], 0.26 - 0.04 * lift);
  for (let x = -20; x <= 20; x++) {
    const u = Math.abs(x + 0.5) / 20;
    p.dot(x, 0, u < 0.3 ? C[6] : C[5], (1.1 - u) * (0.9 - 0.15 * lift));
  }
  p.glow(s.cx, s.cy, 60, C[4], 0.36);
  for (const R of RINGS) ring(p, C, s, R, false);
  motes(p, C, s, o.seed, false);
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), s = setup(t);
  orb(p, C, s);
  for (const R of RINGS) ring(p, C, s, R, true);
  motes(p, C, s, o.seed, true);
  sparkle(p, s.cx - RAD * 0.42, s.cy - RAD * 0.5, 1.5 + Math.max(0, Math.sin(s.ph * TAU * 2)) * 2, C[6], C[5], 0.3);
}
export {
  draw,
  drawBack,
  meta
};
