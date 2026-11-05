import {
  drawLeaf
} from "./chunk-A6NWVIMH.js";
import {
  airflowTrail,
  drawAirflow
} from "./chunk-MCTSDHND.js";
import "./chunk-YQJJU7UN.js";
import {
  TAU,
  clamp,
  fit,
  rng,
  smooth
} from "./chunk-FEXYTCCO.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/weather/crosswind-gust.ts
var meta = {
  name: "Crosswind Gust",
  desc: "A swift lateral gust rolls its leading edge into loose curls. Pale air tracers and tumbling leaves share the same transport, then stretch and dissolve downstream.",
  tags: ["weather", "wind", "gust", "air", "curl", "leaves", "directional"],
  size: [256, 184],
  origin: [126, 144],
  duration: 2.4,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#25343a", "#435b62", "#6f8c8d", "#aac5bf", "#e3eee0"],
    leaves: ["#3e2915", "#817037", "#bca856", "#eee09d"],
    curl: 1,
    density: 1,
    seed: 31
  }
};
function gustTrajectory(u, lane, phase, curl = 1) {
  const k = clamp(u), offset = 6 * Math.sin(phase), side = lane < -35 ? -1 : 1, join = 0.56;
  if (k <= join) return {
    x: -94 + (154 + offset) * k / join,
    y: lane + Math.sin(k / join * Math.PI) ** 2 * (3 + 5 * Math.sin(phase)),
    depth: 1
  };
  const q = (k - join) / (1 - join), angle = TAU * 1.02 * (0.72 * q + 0.28 * q * q);
  const r0 = (19 + 3 * Math.cos(phase)) * curl * (side < 0 ? 1 : 0.56), r = r0 * (1 - 0.65 * q * q);
  return {
    x: 60 + offset + 20 * q + Math.sin(angle) * r,
    y: lane + side * (r0 - r * Math.cos(angle)),
    depth: 1
  };
}
function draw(p, t, o) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 5), L = fit(o.leaves, 4), curl = Math.max(0, Math.min(1.4, o.curl)), density = Math.max(0, Math.min(1.6, o.density));
  if (density <= 0) return;
  for (let i = 0; i < 10; i++) {
    const R = rng(o.seed, i, 41), delay = i * 0.047 + R.range(0, 0.08), life = R.range(1.15, 1.55), age = t - delay;
    if (age <= 0 || age >= life) continue;
    const lane = -62 + i * 4.9 + R.range(-1.8, 1.8), phase = R.range(-1.4, 1.4);
    const position = (a) => gustTrajectory(a / life, lane, phase, curl);
    const k = age / life, alpha = smooth(0, 0.12, k) * (1 - smooth(0.77, 1, k)) * density;
    const path = airflowTrail(position, age, R.range(0.57, 0.81), 64);
    drawAirflow(p, path, { color: C[1], head: C[3], width: i % 3 === 0 ? 1.7 : 1, alpha: alpha * (i % 3 === 0 ? 0.8 : 0.48) });
  }
  for (let i = 0; i < 11; i++) {
    const R = rng(o.seed, i, 97), delay = R.range(0.05, 0.63), life = R.range(1.25, 1.65), age = t - delay;
    if (age <= 0 || age >= life) continue;
    const lane = R.range(-66, -15), phase = R.range(-1.4, 1.4), k = age / life;
    const q = gustTrajectory(k, lane, phase, curl), before = gustTrajectory(Math.max(0, k - 8e-3), lane, phase, curl);
    const angle = Math.atan2(q.y - before.y, q.x - before.x) + 0.5 * Math.sin(age * 10 + i);
    const a = smooth(0, 0.1, k) * (1 - smooth(0.76, 1, k)) * Math.min(1, density);
    drawLeaf(p, q.x, q.y, R.range(4.5, 7), R.range(1.3, 2), angle, age * R.range(8, 13) + i, L, a);
  }
}
export {
  draw,
  gustTrajectory,
  meta
};
