import {
  smokeCurl,
  smokeVolume
} from "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-IA67RXAQ.js";
import {
  TAU,
  fit,
  rng,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/weather/rising-smoke.ts
var meta = {
  name: "Rising Smoke",
  desc: "A narrow soot column swells into rolling curls. Rising folds entrain pockets of air, widen and shear into thin translucent wisps. Smoke receives light but emits none.",
  tags: ["smoke", "soot", "plume", "curl", "wind", "ambient", "loop"],
  size: [144, 168],
  origin: [60, 154],
  duration: 4,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: ["#252731", "#3c3d49", "#565762", "#71717b", "#92919a", "#b8b4bb"], wind: 10, density: 1, turbulence: 1, seed: 23 }
};
function draw(p, time, o) {
  const D = meta.duration, t = (time % D + D) % D, phase = t / D * TAU;
  const wind = Math.max(-14, Math.min(22, o.wind)), density = Math.max(0, Math.min(2, o.density));
  const turbulence = Math.max(0, Math.min(1.5, o.turbulence)), C = fit(o.palette, 6), cells = [];
  const seed = rng(o.seed, 19).range(0, TAU);
  const axis = (u) => wind * u ** 1.4 + turbulence * (Math.sin(u * 10 - phase * 2 + seed) * 7 + Math.sin(u * 19 - phase * 3 + seed) * 2) * smooth(0, 0.6, u);
  for (let i = 0; i < 30; i++) {
    const u = i / 29, y = -4 - u * 128, r = 5 + u * 17;
    const pulse = 0.84 + 0.16 * Math.sin(u * 14 - phase * 3 + seed);
    const fade = (1 - smooth(0.7, 1, u)) * smooth(-0.03, 0.04, u);
    cells.push({ x: axis(u), y, rx: r * pulse, ry: 8.5 + u * 4, density: 0.8 * fade });
  }
  for (let i = 0; i < 4; i++) {
    const r = rng(o.seed, i, 92), age = (t / D + i / 4) % 1;
    const u = 0.11 + age * 0.86, side = i % 2 ? 1 : -1;
    const radius = (11 + age * 16) * r.range(0.76, 1.2);
    const alpha = smooth(0, 0.12, age) * (1 - smooth(0.68, 1, age));
    const x = axis(u) + side * (4 + age * 9), y = -4 - u * 128;
    smokeCurl(
      cells,
      x,
      y,
      radius,
      Math.PI * 0.5 + r.range(-0.3, 0.3),
      side * (4.4 + age * 0.7) * turbulence,
      7 + age * 4.4,
      alpha * 1.35
    );
  }
  smokeVolume(p, cells, C, { opacity: density * 1.4 });
}
export {
  draw,
  meta
};
