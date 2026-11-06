import {
  shades,
  squeezed
} from "./chunk-7K35P37I.js";
import {
  Lights,
  P,
  Particles,
  READY,
  band,
  flare,
  sparkle
} from "./chunk-ZHMERMWE.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  PAL,
  Rng,
  TAU,
  WHITE,
  clamp,
  ease,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/blink-out.ts
var OUT = 0.32;
var SQUEEZE = 0.12;
var COLLAPSE = 0.08;
var POP = OUT + SQUEEZE + COLLAPSE;
var meta = {
  name: "Blink out",
  desc: "The caster crackles with gathering light, flashes white, squeezes into a line of light that collapses and pops away in sparks.",
  tags: ["arcane", "blink", "teleport", "vanish", "movement", "magic", "one-shot"],
  size: [136, 96],
  origin: [68, 80],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: PAL.arcane, seed: 11 }
};
var IN = { turn: 1, crouch: 4, fx: -2, fy: -25, bx: 2, by: -25, armsFront: true, ffx: 0, fbx: 2 };
var act = {
  onBody: true,
  poses: [
    [-0.36, READY],
    [-0.1, IN],
    [0.2, { ...IN, crouch: 5 }],
    [0.32, { ...IN, crouch: 0 }, "snap"],
    [1.6, { ...IN, crouch: 0 }]
  ]
};
var actorAlpha = (t) => t < OUT ? 1 : 0;
function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), A = o.actor, sh = shades(A);
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const mx = A.x + A.w / 2, my = A.y + A.h * 0.55, COLS = [WHITE, C[6], C[6], C[5], C[4]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < A.w && y < A.h && A.mask.data[y * A.w + x];
  let t = 0, out = false, popped = false;
  return {
    update(dt) {
      t += dt;
      if (t < OUT - 0.04 && R.chance(0.7)) {
        const a = R.range(0, TAU), D = R.range(22, 44), T = R.range(0.12, 0.18), v = D * 3 / (Math.exp(3 * T) - 1);
        const x = mx + Math.cos(a) * D, y = Math.min(-2, my + Math.sin(a) * D), l = Math.hypot(x - mx, y - my) || 1;
        ps.spawn(P.STREAK, x, y, (mx - x) / l * v, (my - y) / l * v, T, R.chance(0.5) ? C[6] : C[5]);
      }
      if (!out && t >= OUT) {
        out = true;
        lights.add(mx, my - 6, 54, C[5], 0.9, 0.3);
        lights.add(mx, my, 26, WHITE, 0.8, 0.1);
      }
      if (!popped && t >= POP) {
        popped = true;
        lights.add(mx, my - 6, 58, C[5], 0.9, 0.35);
        lights.add(mx, my, 24, WHITE, 0.9, 0.08);
        for (let i = 0; i < 110; i++) {
          const y = A.y + R.range(2, A.h - 2), s = R.sign();
          ps.spawn(P.EMBER, mx + R.range(-1, 1), y, s * R.range(25, 105), R.range(-70, 10), R.range(0.5, 0.95), R.pick(COLS), R.chance(0.3) ? 2 : 1);
        }
        for (let i = 0; i < 18; i++) {
          const a = R.range(0, TAU), sp = R.range(80, 240);
          ps.spawn(P.SPARK, mx, my, Math.cos(a) * sp, Math.sin(a) * sp - 40, R.range(0.2, 0.5));
        }
        for (let i = 0; i < 14; i++) {
          const a = R.range(0, TAU), sp = R.range(20, 110);
          ps.spawn(i % 2 ? P.STAR : P.MOTE, mx, my, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 - 20, R.range(0.4, 0.9), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.8));
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      if (t > POP && t < POP + 0.6) {
        const k2 = 0.5 * (1 - (t - POP) / 0.6);
        for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) if (sh[y * A.w + x]) p.blend(A.x + x, A.y + y, sh[y * A.w + x] === 1 ? C[3] : C[4], k2);
      }
      const k = (t - POP) / 0.5;
      if (k >= 0 && k < 1) band(p, 0, 0, 4 + 30 * ease.outCubic(k), 0.2, Math.max(1, 3 * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) < 0, k < 0.25);
      if (t < POP + 0.3) p.glow(0, -1, 26, C[5], 0.3 * (t < OUT ? t / OUT : 1 - clamp((t - POP) / 0.3)));
    },
    draw(p) {
      const f = Math.floor(t * 30);
      if (t < OUT) {
        const k2 = t / OUT;
        for (let y = 0; y < A.h; y++)
          for (let x = 0; x < A.w; x++) {
            if (inside(x, y)) {
              p.light(A.x + x, A.y + y, C[6], k2 * k2 * (sh[y * A.w + x] === 1 ? 0.3 : 0.75));
            } else if ((inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) && rand(x, y, f) < 0.25 + 0.65 * k2)
              p.px(A.x + x, A.y + y, k2 > 0.6 && rand(x, y, 7) < 0.5 ? WHITE : C[6]);
          }
        p.glow(mx, my, 30, C[5], 0.5 * k2);
      } else if (t < OUT + 0.05) {
        squeezed(p, A, sh, 1, WHITE, C[6]);
        p.glow(mx, my, 40, C[5], 0.8);
      } else if (t < OUT + SQUEEZE) {
        const q = ease.inCubic((t - OUT - 0.05) / (SQUEEZE - 0.05));
        squeezed(p, A, sh, 1 - q, WHITE, C[6]);
        p.glow(mx, my, 34, C[5], 0.8);
      } else if (t < POP) {
        const q = (t - OUT - SQUEEZE) / COLLAPSE, hh = (A.h / 2 + 2) * (1 - ease.inQuad(q));
        for (let y = -hh - 3; y <= hh + 3; y++) p.dot(mx, my + y, Math.abs(y) < hh ? WHITE : C[6], Math.abs(y) < hh ? 1 : 0.7);
        if (hh > 4) for (let y = -hh * 0.7; y <= hh * 0.7; y++) p.dot(mx - 1, my + y, C[5], 0.6), p.dot(mx + 1, my + y, C[5], 0.6);
        p.glow(mx, my, 30, C[5], 0.9);
        p.glow(mx, my, 8, WHITE, 0.5);
      }
      if (t >= POP && t < POP + 0.22) {
        const q = (t - POP) / 0.22;
        flare(p, mx, my, 22 * Math.pow(1 - q, 1.5) + 2, 1 - q, C);
        if (q < 0.3) p.circle(mx, my, 4 * (1 - q / 0.3) + 1, WHITE);
      }
      const k = (t - POP) / 0.5;
      if (k >= 0 && k < 1) band(p, 0, 0, 4 + 30 * ease.outCubic(k), 0.2, Math.max(1, 3 * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) >= 0, k < 0.25);
      if (t > POP && t < POP + 0.3) sparkle(p, mx, my - 1, 3, C[6], C[5], 0.3 * (1 - (t - POP) / 0.3));
      ps.draw(p);
      lights.draw(p);
    }
  };
}
export {
  act,
  actorAlpha,
  create,
  meta
};
