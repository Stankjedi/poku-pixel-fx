import {
  GOLD
} from "./chunk-BHYJPRTY.js";
import {
  cycle,
  sparkle
} from "./chunk-KJLRN7JI.js";
import "./chunk-NY4VHNMV.js";
import {
  TAU,
  WHITE,
  fit
} from "./chunk-WFSCDWU6.js";
import "./chunk-T3JNBT34.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/holy/sunburst.ts
var meta = {
  name: "Sunburst",
  desc: "A white-hot core in a gold corona; long and short rays turn slowly round it, breathing, with glints running out along them that wink at the tips.",
  tags: ["holy", "sun", "radiant", "rays", "light", "glow", "loop"],
  size: [128, 128],
  origin: [64, 64],
  duration: 4,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: GOLD, rays: 8, seed: 3 }
};
var CORE = 4.5;
var RING = 7.5;
var R0 = 9;
var frac = (x) => x - Math.floor(x);
function ray(p, C, a, L, w0, k) {
  const ca = Math.cos(a), sa = Math.sin(a), x1 = ca * (R0 + L), y1 = sa * (R0 + L), pad = w0 + 1;
  p.shade(Math.min(0, x1) - pad, Math.min(0, y1) - pad, Math.max(0, x1) + pad, Math.max(0, y1) + pad, (x, y, out) => {
    const along = x * ca + y * sa - R0, u = along / L;
    if (u < 0 || u > 1) return;
    const across = Math.abs(-x * sa + y * ca), w = w0 / 2 * (1 - u * 0.85) + 0.25;
    if (across > w) return;
    const spine = across < 0.5, rim = across > w - 0.6 && w > 0.9;
    out.c = spine ? u < 0.4 ? WHITE : u < 0.75 ? C[6] : C[5] : rim && u > 0.15 ? C[3] : u < 0.3 ? C[6] : u < 0.62 ? C[5] : C[4];
    out.a = u < 0.72 ? k : k * (1 - (u - 0.72) / 0.28) * 1.2;
  });
  p.glowLine(ca * R0, sa * R0, ca * (R0 + L * 0.8), sa * (R0 + L * 0.8), 5, C[5], 0.16 * k);
}
function draw(p, t, o) {
  const C = fit(o.palette, 8), N = o.rays * 2, T = meta.duration, rot = t / T * (2 * TAU / N);
  p.glow(0, 0, 62, C[4], 0.3 + 0.06 * Math.sin(t / T * TAU * 2));
  for (let i = 0; i < N; i++) {
    const a = rot + (i + 0.5) * TAU / N, L = 14 + 6 * Math.sin(a * 3 + t / T * TAU);
    p.line(Math.cos(a) * (R0 + 1), Math.sin(a) * (R0 + 1), Math.cos(a) * (R0 + L), Math.sin(a) * (R0 + L), (u) => u < 0.3 ? C[6] : C[5], (u) => 0.7 - u * 0.8);
  }
  for (let i = 0; i < N; i++) {
    const a = rot + i * TAU / N, long = i % 2 === 0, breathe = 0.86 + 0.14 * Math.sin(a * 3 - t / T * TAU * 2);
    const L = (long ? 36 : 21) * breathe;
    ray(p, C, a, L, long ? 4 : 2.6, 1);
    if (long) {
      const g = frac(t / T * 2 + a * 3 / TAU), r = R0 + g * L;
      if (g < 0.9) {
        p.px(Math.cos(a) * r, Math.sin(a) * r, WHITE);
        p.glow(Math.cos(a) * r, Math.sin(a) * r, 5, C[6], 0.45 * (1 - g));
      } else sparkle(p, Math.cos(a) * (R0 + L), Math.sin(a) * (R0 + L), 1 + 3 * Math.sin((g - 0.9) / 0.1 * Math.PI), WHITE, C[6], 0.5);
    }
  }
  p.shade(-RING - 2, -RING - 2, RING + 2, RING + 2, (x, y, out) => {
    const d = Math.hypot(x, y);
    if (d > RING) return;
    const flick = 0.5 + 0.5 * Math.sin(Math.atan2(y, x) * 5 + t / T * TAU * 3);
    out.c = d < CORE ? WHITE : d < CORE + 1.5 ? flick > 0.6 ? WHITE : C[6] : flick > 0.5 ? C[5] : C[4];
  });
  p.glow(0, 0, 16, WHITE, 0.28);
  cycle(t, T, 10, o.seed, (g) => g.range(0.35, 0.7), (age, life, R) => {
    const a = R.range(0, TAU), d = R.range(16, 44), k = Math.sin(age / life * Math.PI);
    sparkle(p, Math.cos(a) * d, Math.sin(a) * d, 1 + 2.4 * k * R.range(0.5, 1), WHITE, C[5], 0.4 * k);
  });
}
export {
  draw,
  meta
};
