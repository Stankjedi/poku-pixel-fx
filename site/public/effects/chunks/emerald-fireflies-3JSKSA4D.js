import {
  sparkle
} from "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-IA67RXAQ.js";
import {
  TAU,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/nature/emerald-fireflies.ts
var meta = {
  sharedSource: true,
  name: "Emerald fireflies",
  desc: "Emerald fireflies spiral upward with warm flickering cores and fading trails.",
  tags: ["nature", "fireflies", "spiral", "emerald", "\uBC18\uB527\uBD88", "\uC790\uC5F0"],
  size: [96, 112],
  origin: [48, 100],
  duration: 2,
  loop: false,
  fps: 15,
  bg: "dark",
  options: { palette: ["#133e38", "#247452", "#68cf78", "#d8ffad"], seed: 21 }
};
function draw(p, t, o) {
  if (t <= 0 || t >= meta.duration) return;
  const c = fit(o.palette, 4);
  for (let i = 0; i < 13; i++) {
    const delay = i * 0.055, life = 1.35 + rand(i, o.seed, 1) * 0.35, u = (t - delay) / life;
    if (u <= 0 || u >= 1) continue;
    const k = Math.sin(Math.PI * u), phase = i * TAU / 13 + u * (TAU * 1.15 + rand(i, o.seed, 2));
    const radius = 6 + 19 * u, x = Math.cos(phase) * radius, y = -8 - 68 * u + Math.sin(phase * 2) * 3;
    const flicker = 0.68 + 0.32 * Math.sin(t * 13 + i * 2.7), head = (i % 4 === 0 ? 2.5 : 1.5) * k;
    for (let j = 3; j >= 1; j--) {
      const v = Math.max(0, u - j * 0.025), a = i * TAU / 13 + v * (TAU * 1.15 + rand(i, o.seed, 2));
      const tx = Math.cos(a) * (6 + 19 * v), ty = -8 - 68 * v + Math.sin(a * 2) * 3;
      p.dot(tx, ty, c[1], k * (0.5 - j * 0.1));
      if (j === 1 && i % 3 === 0) p.dot(tx, ty + 1, c[2], k * 0.4);
    }
    p.glow(x, y, 6 + 3 * k, c[2], 0.25 * k * flicker);
    p.disc(x, y, head + 1, c[1], 0.7 * k);
    p.disc(x, y, head, c[2], k);
    p.dot(x, y, c[3], k * flicker);
    if (i % 4 === 0 && k > 0.55) sparkle(p, x, y, 2 * k, c[3], c[2], 0.45 * k);
  }
}
export {
  draw,
  meta
};
