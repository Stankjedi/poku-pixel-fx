import {
  liquidBead
} from "./chunk-WS2JUYCY.js";
import {
  WATER,
  bead
} from "./chunk-YZFTWBKD.js";
import {
  cycle,
  liquidMotion
} from "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  TAU,
  WHITE,
  fit,
  smooth,
  tileNoise
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/water/water-jet.ts
var meta = {
  name: "Water jet",
  desc: "A pressurised liquid stream bends under gravity, pinches into round beads and sheds a sparse fan of falling spray. Narrow reflected highlights reveal the wet surface.",
  tags: ["water", "jet", "stream", "hose", "spray", "directional", "loop"],
  size: [188, 80],
  origin: [14, 32],
  duration: 1,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: WATER, length: 118, seed: 3, flowStyle: "liquid" }
};
var D = meta.duration;
var G = 520;
var SPEED = 260;
var drop = (x, L) => (x / L) ** 2 * 9;
var thick = (x, L) => 2.6 + 5.4 * Math.pow(x / L, 1.1);
function drawClassic(p, t, o) {
  const C = fit(o.palette, 8), ph = t / D, L = o.length, S = o.seed, T = ph * TAU;
  for (let X = 0; X <= L + 3; X++) {
    const x = X + 0.5, u = x / L;
    if (u > 1) break;
    const yc = drop(x, L), rough = smooth(0.25, 1, u), sd = ((x - ph * SPEED * 2) % 130 + 130) % 130 - 65;
    const w0 = thick(x, L) + Math.exp(-(sd * sd) / 90) * 1.4 * (1 - u * 0.5);
    const up = w0 + tileNoise(x * 0.18 - ph * 30, 9, 30, 0, S + 1) * 2.2 * rough, dn = w0 + tileNoise(x * 0.18 - ph * 30, 3, 30, 0, S + 1) * 2.2 * rough;
    for (let Y = Math.floor(yc - up); Y <= Math.ceil(yc + dn); Y++) {
      const y = Y + 0.5, q = (y - yc) / Math.max(0.8, y < yc ? up : dn), aq = Math.abs(q);
      if (aq > 1) continue;
      if (u > 0.55 && tileNoise(x * 0.12 - ph * 25, (y - yc) * 0.25, 25, 0, S + 2) < -0.9 + 1.6 * smooth(0.55, 1, u)) continue;
      const streak = tileNoise(x * 0.06 - ph * 40, Math.floor(y - yc + 20) * 1.7, 40, 0, S);
      let lvl = aq < 0.2 ? 0 : aq < 0.48 ? 1 : aq < 0.78 ? 2 : 3;
      if (streak > 0.35) lvl = Math.max(0, lvl - 1);
      if (q > 0.4) lvl = Math.min(3, lvl + 1);
      p.px(X, Y, [WHITE, C[6], C[5], C[4]][lvl]);
      if (lvl === 0) p.light(x, y, C[5], 0.12);
    }
  }
  const fl = 0.85 + 0.15 * Math.sin(T * 6);
  p.circle(0, 0, 4.4 * fl, C[5]);
  p.circle(0, 0, 3.4 * fl, C[6]);
  p.circle(0, 0, 2.2 * fl, WHITE);
  for (let a = 0; a < TAU; a += 0.35) p.dot(Math.cos(a + T * 2) * 5.2 * fl, Math.sin(a + T * 2) * 5.2 * fl, C[5], 0.6);
  p.glow(0, 0, 24, C[5], 0.6 * fl);
  p.glow(0, 0, 8, WHITE, 0.4 * fl);
  for (let k = 0; k < 6; k++) {
    const x = L * 0.82 + (k * 13 + ph * SPEED) % 78, y = drop(Math.min(x, L), L) + (x > L ? ((x - L) / 60) ** 2 * 10 : 0) + Math.sin(k * 2.1) * 1.5;
    if (x < L + 34) bead(p, x, y, SPEED, 40, k % 3 === 0 ? 3 : 2, C);
  }
  cycle(t, D, 70, S + 3, (g) => g.range(0.2, 0.42), (age, life, r) => {
    const f = Math.sqrt(r.next()), x0 = L * (0.3 + 0.7 * f), y0 = drop(x0, L) + r.range(-1, 1) * thick(x0, L);
    const vx = r.range(150, 270) * (0.55 + 0.45 * f), vy = r.range(-1, 1) * 110 * f + r.range(-10, 20);
    const x = x0 + vx * age, y = y0 + vy * age + 0.5 * G * age * age, k = age / life;
    if (x > L + 50 || y > 40 || y < -28 || k > 0.75 && r.next() < (k - 0.75) * 4) return;
    if (r.next() < 0.45) p.px(x, y, k < 0.5 ? WHITE : C[6]);
    else bead(p, x, y, vx, vy + G * age, r.next() < 0.2 ? 2 : 1, C);
  });
  cycle(t, D, 12, S + 4, (g) => g.range(0.7, 1), (age, life, r) => {
    const k = age / life, x = L * r.range(0.7, 1) + age * r.range(20, 45), y = drop(Math.min(x, L), L) + r.range(-5, 5) + age * r.range(4, 14);
    const rad = r.range(3, 5) + k * r.range(5, 9), a = r.range(0.1, 0.18) * Math.min(1, k / 0.15) * Math.pow(1 - k, 1.5);
    p.disc(x, y, rad, C[6], (d) => a * (1 - d * d));
  });
  for (let x = 0; x < L; x += 10) p.glow(x, drop(x, L), 14 + x * 0.1, C[4], 0.26 * (1 - x / L * 0.5));
  p.glow(L * 0.9, drop(L * 0.9, L), 26, C[5], 0.22);
}
function draw(p, t, o) {
  if (o.flowStyle === "classic") return drawClassic(p, t, o);
  const C = fit(o.palette, 8), time = Math.round((t % D + D) % D * 1e9) / 1e9 % D, L = o.length;
  const speed = 220, gravity = 132, step = speed / 6;
  const center = (x) => gravity * (x / speed) ** 2 / 2;
  for (let X = 0; X < L; X++) {
    const x = X + 0.5, u = x / L, y = center(x);
    const velocity = Math.hypot(speed, gravity * x / speed);
    const radius = 3.9 * Math.sqrt(speed / velocity);
    const wave = Math.cos(TAU * (x / step - time * 6) + o.seed * 0.31);
    const breakup = smooth(0.42, 0.98, u);
    const width = radius * (1 + breakup * (wave * 1.12 - 0.2));
    if (width < 0.38) continue;
    for (let Y = Math.floor(y - width); Y <= Math.ceil(y + width); Y++) {
      const v = (Y + 0.5 - y) / width;
      if (Math.abs(v) > 1) continue;
      const upperRim = v < -0.66, reflected = v > -0.45 && v < -0.12;
      const c = upperRim ? C[6] : reflected ? C[5] : v > 0.62 ? C[2] : v > 0.22 ? C[3] : C[4];
      p.blend(X, Y, c, upperRim || reflected ? 1 : 0.82);
      if (upperRim && wave > 0.87 && u > 0.12) p.px(X, Y, C[7]);
    }
  }
  const birthX = L * 0.83, birthY = center(birthX), period = D / 6;
  for (let i = 0; i < 3; i++) {
    const phase = birthX / speed + o.seed * 0.31 / (TAU * 6);
    const age = ((time - phase + i * period) % (period * 3) + period * 3) % (period * 3);
    const launch = { x: birthX, z: birthY, h: 0, vx: speed, vh: -gravity * birthX / speed };
    const q = liquidMotion(launch, age, { gravity, drag: 0.35, depthScale: 1 });
    const alpha = smooth(0, 0.04, age) * (1 - smooth(L + 24, L + 47, q.x));
    if (alpha <= 0) continue;
    liquidBead(p, launch, age, i % 2 ? 2 : 3, C, alpha, { gravity, drag: 0.35, depthScale: 1 }, 0.014);
  }
  cycle(time, D, 24, o.seed + 3, (r) => r.range(0.24, 0.42), (age, life, r) => {
    const x0 = L * r.range(0.48, 0.96), y0 = center(x0) + r.range(-2.5, 2.5);
    const launch = { x: x0, z: y0, h: 0, vx: r.range(110, 205), vh: -gravity * x0 / speed + r.range(-42, 42) };
    const q = liquidMotion(launch, age, { gravity: 210, drag: 1.2, depthScale: 1 });
    const alpha = smooth(0, 0.025, age) * (1 - smooth(0.65, 1, age / life)) * (1 - smooth(L + 31, L + 49, q.x)) * (1 - smooth(35, 44, q.y));
    if (alpha <= 0) return;
    liquidBead(p, launch, age, r.next() < 0.18 ? 2 : 1, C, alpha, { gravity: 210, drag: 1.2, depthScale: 1 });
  });
  p.ellipse(0, 0, 1.6, 3.6, C[4]);
  p.line(-1, -2, -1, 1, C[6]);
  p.glow(0, -1, 7, C[4], 0.09);
}
export {
  draw,
  meta
};
