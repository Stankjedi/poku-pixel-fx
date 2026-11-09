import {
  rock,
  rockShape,
  stone
} from "./chunk-B3ECQY7A.js";
import {
  B,
  Bits,
  Lights
} from "./chunk-JQXGDKYD.js";
import "./chunk-NPBZD3DI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  Rng,
  TAU,
  WHITE,
  clamp,
  ease,
  fit,
  hex,
  mix
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/impacts/blunt-hit.ts
var meta = {
  name: "Blunt hit",
  desc: "A heavy, soft thud: a white-hot lumpy blob cools to cream in a warm pool of light, inked wedges jab out and snap back, a squashed ring of dust puffs swells and drifts, clods drop.",
  tags: ["impact", "hit", "blunt", "punch", "club", "thump", "dust", "comic", "one-shot"],
  size: [128, 88],
  origin: [64, 72],
  duration: 0.9,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1d1620", "#4a3a3c", "#7d6a66", "#b09c90", "#dccab4", "#f6ead2", "#ffffff"], warm: "#ffc98a", dust: "#b7a8a6", clod: "#6e5a5a", height: 22, seed: 9 }
};
var lump = (r, a, ph) => r * (1 + 0.15 * Math.sin(5 * a + ph) + 0.08 * Math.sin(9 * a + ph * 2.3));
function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), X = 0, Y = -o.height, PH = R.range(0, TAU), floor = () => 0;
  const WARM = hex(o.warm), DUST = hex(o.dust), st = stone(o.clod);
  const lights = new Lights(), bits = new Bits({ ground: floor });
  lights.add(X, Y, 48, WARM, 0.6, 0.4);
  lights.add(X, Y, 16, WHITE, 0.6, 0.07);
  lights.add(X, -2, 36, WARM, 0.25, 0.4);
  const wedges = Array.from({ length: 9 }, (_, i) => ({ a: i / 9 * TAU + R.range(-0.2, 0.2), len: R.range(6, 15), w: R.range(3.2, 5), r0: R.range(13, 16), t0: R.range(0.015, 0.04), out: R.range(0.04, 0.06), back: R.range(0.09, 0.14) }));
  const puffs = Array.from({ length: 30 }, (_, i) => {
    const a = i / 30 * TAU + R.range(-0.12, 0.12), side = Math.abs(Math.cos(a)), v = R.range(40, 140) * (0.6 + 0.5 * side);
    return { x: X + Math.cos(a) * 9, y: Y + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, r: R.range(2.4, 6.2) * (0.75 + 0.35 * side), life: R.range(0.35, 0.85), max: 0, t0: R.range(0.03, 0.1), lift: R.range(4, 16) };
  });
  for (let i = 0; i < 5; i++)
    puffs.push({ x: X + R.range(-6, 6), y: Y - R.range(3, 6), vx: R.range(-30, 30), vy: -R.range(20, 45), r: R.range(3.5, 5.5), life: R.range(0.6, 0.85), max: 0, t0: R.range(0.05, 0.1), lift: R.range(14, 24) });
  for (const q of puffs) q.max = q.life;
  for (let i = 0; i < 5; i++) {
    const s = R.sign(), a = -Math.PI / 2 + s * R.range(0.5, 1.3), v = R.range(70, 140);
    bits.add({ kind: B.CHUNK, x: X + s * R.range(4, 8), y: Y + R.range(-3, 3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1, drag: 0.6, bounce: 0.28, life: R.range(0.65, 0.85), a: R.range(0, TAU), va: s * R.range(8, 16), s: R.chance(0.4) ? 2 : 1, pts: rockShape(R), pvy: 0 });
  }
  const kicks = [];
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (const q of puffs) {
        if (t < q.t0) continue;
        q.life -= dt;
        q.vx -= q.vx * 4.5 * dt;
        q.vy -= q.vy * 4.5 * dt + (q.lift ?? 6) * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      for (const b of bits.list) b.pvy = b.vy;
      bits.update(dt);
      for (const b of bits.list)
        if (b.pvy > 60 && b.vy <= 0) {
          for (let i = 0; i < 2; i++) kicks.push({ x: b.x, y: -1, vx: R.sign() * R.range(8, 22), vy: -R.range(3, 10), r: R.range(1.2, 2), life: 0.4, max: 0.4, t0: 0 });
          b.pvy = 0;
        }
      for (const q of kicks) {
        q.life -= dt;
        q.vx -= q.vx * 4 * dt;
        q.vy -= q.vy * 4 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      lights.update(dt);
    },
    draw(p) {
      for (const q of [...puffs, ...kicks]) {
        const k = q.life / q.max;
        if (t < q.t0 || k <= 0) continue;
        const r = q.r * (0.7 + (1 - k) * 0.85), a = Math.pow(k, 1.25) * Math.min(1, (t - q.t0) / 0.03), c = mix(DUST, WARM, clamp(1 - (t - 0.03) / 0.25) * 0.55);
        p.disc(q.x, q.y, r, c, (d) => 0.58 * a * (1 - d * d * 0.75));
        p.disc(q.x - r * 0.22, q.y - r * 0.32, r * 0.58, mix(c, WHITE, 0.55), (d) => 0.48 * a * (1 - d * d));
      }
      for (const b of bits.list) rock(p, b, st);
      if (t < 0.058) {
        const f = t < 0.025 ? 0 : 1, R0 = f ? 13.5 : 11.5;
        p.shade(X - R0 * 1.4, Y - R0 * 1.4, X + R0 * 1.4, Y + R0 * 1.4, (x, y) => {
          const dx = x - X, dy = (y - Y) * (f ? 1.25 : 1.1), d = Math.hypot(dx, dy), ro = lump(R0, Math.atan2(dy, dx), PH + f * 0.6);
          if (d > ro) return;
          const q = d / ro;
          return f === 0 ? q < 0.55 ? WHITE : q < 0.86 ? C[5] : C[4] : q < 0.3 ? WHITE : q < 0.72 ? C[5] : q < 0.9 ? C[4] : C[3];
        });
      }
      for (const w of wedges) {
        const u = t - w.t0;
        if (u < 0 || u > w.out + w.back) continue;
        const s = u < w.out ? ease.outCubic(u / w.out) : 1 - ease.inQuad((u - w.out) / w.back), L = w.len * s;
        if (L < 1.5) continue;
        const ca = Math.cos(w.a), sa = Math.sin(w.a), r0 = w.r0 + 2 * s, hw = w.w * (0.6 + 0.4 * s) / 2;
        const tip = [X + ca * r0, Y + sa * r0], end = [X + ca * (r0 + L), Y + sa * (r0 + L)], n = [-sa * hw, ca * hw];
        const wedge = (g) => [[tip[0] - ca * g, tip[1] - sa * g], [end[0] + n[0] * (1 + g * 0.45) + ca * g, end[1] + n[1] * (1 + g * 0.45) + sa * g], [end[0] - n[0] * (1 + g * 0.45) + ca * g, end[1] - n[1] * (1 + g * 0.45) + sa * g]];
        p.poly(wedge(1), C[1]);
        p.poly(wedge(0), u < w.out + 0.02 ? WHITE : C[5]);
      }
      const pop = Math.exp(-t / 0.06);
      if (pop > 0.02) p.glow(X, Y, 28, WARM, 0.5 * pop);
      lights.draw(p);
    }
  };
}
export {
  create,
  meta
};
