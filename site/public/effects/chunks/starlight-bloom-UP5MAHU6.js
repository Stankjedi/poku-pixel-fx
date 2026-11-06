import {
  sparkle
} from "./chunk-SRKY5KGN.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-7OMNYR2P.js";
import {
  TAU,
  WHITE,
  clamp,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/starlight-bloom.ts
var meta = {
  sharedSource: true,
  name: "Starlight bloom",
  desc: "A turquoise star unfolds into crystal petals, then sheds luminous fragments.",
  tags: ["magic", "star", "burst", "bloom", "crystal", "\uBCC4\uBE5B", "\uB9C8\uBC95"],
  size: [96, 96],
  origin: [48, 48],
  duration: 1.2,
  loop: false,
  fps: 20,
  bg: "dark",
  options: { palette: ["#10265a", "#315cba", "#39c6ce", "#a2fff0", "#ffffff"], seed: 17 }
};
function draw(p, t, o) {
  if (t <= 0 || t >= meta.duration) return;
  const c = fit(o.palette, 5), u = t / meta.duration;
  const bloom = clamp((u - 0.06) / 0.24), fade = Math.pow(1 - u, 1.4);
  const flash = Math.max(0, 1 - Math.abs(u - 0.16) / 0.12);
  p.glow(0, 0, 25 + 12 * bloom, c[2], 0.34 * fade);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + 0.1 * u, ca = Math.cos(a), sa = Math.sin(a);
    const petal = clamp((u - 0.06 - i % 4 * 0.012) / 0.24);
    const length = (i % 2 ? 18 : 30) * petal * (1 - 0.25 * u), width = (i % 2 ? 2.5 : 4) * petal;
    const tipX = ca * length, tipY = sa * length, mx = ca * length * 0.48, my = sa * length * 0.48;
    p.poly([[0, 0], [mx - sa * width, my + ca * width], [tipX, tipY], [mx + sa * width, my - ca * width]], c[1], fade);
    p.poly([[0, 0], [mx - sa * width, my + ca * width], [tipX, tipY]], c[2], fade);
    p.line(0, 0, tipX, tipY, c[3], fade * 0.8);
  }
  p.disc(0, 0, 4 + 2 * bloom, c[2], fade);
  p.disc(0, 0, 2 + 3 * flash, c[4], fade);
  if (flash > 0) sparkle(p, 0, 0, 15 * flash, WHITE, c[3], flash);
  for (let i = 0; i < 18; i++) {
    const q = clamp((u - 0.16 - rand(i, o.seed, 1) * 0.16) / (0.65 + rand(i, o.seed, 2) * 0.18));
    if (q <= 0 || q >= 1) continue;
    const a = i * TAU / 18 + rand(i, o.seed, 3) * 0.14, d = 7 + (18 + rand(i, o.seed, 4) * 20) * (1 - (1 - q) ** 2);
    const x = Math.cos(a) * d, y = Math.sin(a) * d, k = Math.sin(Math.PI * q) * fade;
    p.line(x - Math.cos(a) * 4 * k, y - Math.sin(a) * 4 * k, x, y, c[2], k * 0.7);
    if (i % 3 === 0) sparkle(p, x, y, 2 + 2 * k, c[4], c[2], k);
    else p.dot(x, y, c[3], k);
  }
}
export {
  draw,
  meta
};
