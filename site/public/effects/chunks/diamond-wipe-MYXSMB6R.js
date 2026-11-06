import {
  H,
  W,
  clipTo,
  glint,
  rect,
  screenMeta
} from "./chunk-FQ4NAV5V.js";
import "./chunk-M7SU2P7C.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-IA67RXAQ.js";
import {
  PAL,
  WHITE,
  clamp,
  ease,
  fit,
  hex,
  rand,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/transitions/diamond-wipe.ts
var meta = screenMeta({
  name: "Diamond wipe",
  desc: "A wave of faceted diamonds swells across the screen, rims bright and ridges lit, cooling to black as they lock; then they rise as gems again and shrink away with glints.",
  tags: ["diamond", "lattice", "geometric", "wipe"],
  duration: 2,
  options: { palette: PAL.arcane, seed: 1 }
});
var S = 32;
var HD = S / 2 + 1;
var GROW = 0.24;
var IN0 = 0.04;
var IN1 = 0.66;
var OUT0 = 1.05;
var OUT1 = 1.56;
var cache = /* @__PURE__ */ new Map();
function lattice(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const out = [];
  for (let j = -1; j <= Math.ceil(H / (S / 2)) + 1; j++)
    for (let i = -1; i <= Math.ceil(W / S) + 1; i++) {
      const cx = i * S + (j & 1 ? S / 2 : 0), cy = j * S / 2;
      if (cx + HD < 0 || cy + HD < 0 || cx - HD > W || cy - HD > H) continue;
      const u = clamp((cx + 0.45 * cy) / (W + 0.45 * H)), jr = rand(i, j, seed);
      out.push({ cx, cy, tin: IN0 + (IN1 - IN0) * clamp(u + (jr - 0.5) * 0.08), tout: OUT0 + (OUT1 - OUT0) * clamp(u + (rand(i, j, seed + 1) - 0.5) * 0.08), glint: jr < 0.3, spin: rand(i, j, seed + 2) * 3 });
    }
  cache.set(seed, out);
  return out;
}
function draw(p0, t, o) {
  const C = fit(o.palette, 8), ink = hex(o.color), p = clipTo(p0), L = lattice(o.seed), glints = [];
  const FACE = [[C[2], C[1], C[0]], [C[1], C[0], C[0]], [C[1], C[0], C[0]], [C[0], C[0], ink]];
  for (const d of L) {
    const ki = (t - d.tin) / GROW, ko = (t - d.tout) / GROW;
    if (d.glint && ko > 0.7 && ko < 1.5) glints.push([d, (ko - 0.7) / 0.8, 0]);
    if (ki <= 0 || ko >= 1) continue;
    const hd = HD * (ko > 0 ? 1 - ease.inBack(ko, 2) : ease.outBack(Math.min(1, ki), 2.2));
    const heat = ko > 0 ? smooth(0, 0.35, ko) : 1 - smooth(0.45, 1.25, ki);
    if (hd < 0.5) continue;
    const settled = heat <= 0;
    const y0 = Math.max(0, Math.floor(d.cy - hd)), y1 = Math.min(H - 1, Math.ceil(d.cy + hd));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - d.cy, w = hd - Math.abs(dy);
      if (w <= 0) continue;
      const x0 = Math.max(0, Math.ceil(d.cx - w - 0.5)), x1 = Math.min(W - 1, Math.floor(d.cx + w - 0.5));
      if (x1 < x0) continue;
      if (settled) {
        rect(p0, x0, y, x1 - x0 + 1, 1, ink);
        continue;
      }
      const st = heat > 0.66 ? 0 : heat > 0.33 ? 1 : 2;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - d.cx, e = hd - Math.abs(dx) - Math.abs(dy);
        const q = (dy < 0 ? 0 : 2) + (dx < 0 ? 0 : 1), vr = dx > -1 && dx <= 0, hr = dy > -1 && dy <= 0;
        let c;
        if (e < 1) {
          const r = [heat > 0.5 ? WHITE : C[6], heat > 0.5 ? C[6] : C[5], heat > 0.5 ? C[5] : C[4], heat > 0.5 ? C[4] : C[3]][q];
          c = heat > 0.15 ? r : ink;
          if (heat > 0.15) p0.light(x, y, C[5], 0.4 * heat * (q === 0 ? 1 : 0.6));
        } else if (e < 2 && q === 0 && heat > 0.4) c = C[5];
        else if ((vr || hr) && heat > 0.3) {
          const tip = vr && dy < -hd + 4, sheen = Math.abs(((x + y - t * 260) % 90 + 90) % 90 - 45) < 3;
          c = tip || sheen && heat > 0.5 ? WHITE : vr && dy < 0 ? heat > 0.6 ? C[6] : C[5] : heat > 0.6 ? C[3] : C[2];
        } else c = heat > 0.15 ? FACE[q][st] : ink;
        p0.px(x, y, c);
      }
    }
    if (!settled) p.glow(d.cx, d.cy, hd + 6, C[4], 0.22 * heat);
    if (ki > 0.6 && ki < 1.8 && d.glint) glints.push([d, (ki - 0.6) / 1.2, hd]);
  }
  for (const [d, u, hd] of glints) {
    if (u <= 0 || u >= 1) continue;
    const y = hd ? d.cy - hd : d.cy;
    glint(p, d.cx, y, 9 * Math.pow(Math.sin(Math.PI * u), 0.7), d.spin + u * 1.5, C[6], C[5]);
  }
}
export {
  draw,
  meta
};
