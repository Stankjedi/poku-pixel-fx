import {
  spikes,
  star
} from "./chunk-B3ECQY7A.js";
import {
  Lights,
  P,
  Particles,
  READY
} from "./chunk-SRKY5KGN.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-7OMNYR2P.js";
import {
  Rng,
  WHITE,
  clamp,
  fit,
  rand,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/impacts/shield-block.ts
var meta = {
  name: "Shield block",
  desc: "A blow is caught on a half-dome of energy in front of the character: its diamond lattice flashes, a ripple runs over it, sparks glance off, then it blinks out cell by cell.",
  tags: ["impact", "block", "shield", "barrier", "energy", "ripple", "actor", "one-shot"],
  size: [148, 104],
  origin: [40, 88],
  duration: 1.1,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: {
    palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"],
    sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
    seed: 12
  }
};
var BRACE = { ...READY, crouch: 4, lean: 2, fx: 13, fy: -28, bx: 6, by: -21, ffx: 9, fbx: -9 };
var act = {
  poses: [
    [-0.36, READY],
    [-0.1, BRACE],
    [0, { ...BRACE, x: -3, crouch: 6, lean: -2, fx: 10, fy: -26 }, "snap"],
    [0.18, { ...BRACE, x: -4, crouch: 5, lean: 0 }],
    [0.65, { ...BRACE, x: -3 }],
    [1.1, { ...READY, x: 0 }]
  ],
  hits: [{ t: 5e-3, stop: 0.09, shake: 0.2, amp: 2 }],
  dust: [{ t: 0.01, x: -10, n: 6, dir: -1 }]
};
var CX = 3;
var RX = 28;
var RY = 44;
var GRID = 3.4;
var HIT = { lon: 1.18, lat: 0.5 };
var GONE = 0.5;
var onDome = (lon, lat) => [CX + RX * Math.cos(lat) * Math.sin(lon), -RY * Math.sin(lat)];
function create(o) {
  const C = fit(o.palette, 8), S = fit(o.sparks, 4), R = new Rng(o.seed), floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: S });
  const lights = new Lights();
  const [hx, hy] = onDome(HIT.lon, HIT.lat), sp = spikes(R, 8, 0.2, { len: [5, 8], w: [1.4, 1.9], fwd: 1.2, back: 0.3 });
  lights.add(hx, hy, 40, S[1], 0.7, 0.2);
  lights.add(hx, hy, 12, WHITE, 0.7, 0.06);
  const nA = Math.atan2(-Math.sin(HIT.lat) / RY, Math.cos(HIT.lat) * Math.sin(HIT.lon) / RX);
  for (let i = 0; i < 14; i++) {
    const a = nA + R.range(-1.2, 0.9), v = R.range(130, 300);
    ps.spawn(P.SPARK, hx + 1, hy, Math.cos(a) * v, Math.sin(a) * v - 30, R.range(0.15, 0.42), WHITE, 1, i > 10 ? R.range(0.01, 0.04) : 0);
  }
  let t = 0;
  const dome = (p, back) => {
    const fade = 1 - smooth(GONE + 0.35, GONE + 0.55, t);
    if (fade <= 0) return;
    for (let y = -RY - 1; y < 0; y++)
      for (let x = CX; x <= CX + RX + 1; x++) {
        const u = (x + 0.5 - CX) / RX, v = -(y + 0.5) / RY, q = u * u + v * v;
        if (q > 1 || u < 0 || v < 0) continue;
        const z = Math.sqrt(1 - q) * (back ? -1 : 1), lon = Math.atan2(u, z), lat = Math.asin(clamp(v));
        const a = (lon + lat) * GRID, b = (lon - lat) * GRID, fa = a - Math.floor(a), fb = b - Math.floor(b);
        const cell = rand(Math.floor(a), Math.floor(b), 31), line = Math.min(fa, 1 - fa, fb, 1 - fb) < 0.13;
        const gone = GONE + cell * 0.35;
        if (t > gone) continue;
        const d = Math.acos(clamp(Math.cos(lat) * Math.cos(HIT.lat) * Math.cos(lon - HIT.lon) + Math.sin(lat) * Math.sin(HIT.lat), -1, 1));
        let hit = 0;
        for (const [t0, k0] of [[0, 1], [0.12, 0.55]]) {
          const k = t - t0, front = k * 3.6;
          if (k < 0 || k > 0.55) continue;
          if (Math.abs(d - front) < 0.2) hit = Math.max(hit, k0 * (1 - k / 0.55));
          else if (d < front) hit = Math.max(hit, 0.3 * k0 * (1 - k / 0.55));
        }
        const rim = 1 - Math.abs(z), flash = t < 0.05, blink = t > gone - 0.06, sheen = Math.abs(((lat * 0.8 - lon * 0.3 - t * 1.6) % 1 + 1) % 1 - 0.5) < 0.05;
        if (back) {
          if (line) p.dot(x, y, C[3], 0.5 * fade);
          continue;
        }
        if (q > 0.9) p.dot(x, y, flash || hit > 0.5 ? WHITE : C[6], fade);
        else if (line) p.dot(x, y, flash || blink || hit > 0.5 ? WHITE : hit > 0.2 || sheen ? C[6] : rim > 0.7 ? C[5] : rim > 0.35 ? C[4] : C[3], fade);
        else p.blend(x, y, flash || hit > 0.35 ? C[6] : C[3], fade * Math.min(0.85, (flash ? 0.35 : 0.1 + 0.25 * rim * rim) + hit * 0.65));
        if ((x * 7 + y * 3 & 15) === 0) p.light(x, y, C[4], 0.15 + 0.5 * hit);
      }
  };
  return {
    update(dt) {
      t += dt;
      if (t > GONE && t < GONE + 0.38 && R.chance(0.5)) {
        const lon = R.range(0, Math.PI / 2), lat = R.range(0.05, 1.4), [x, y] = onDome(lon, lat);
        ps.spawn(P.STAR, x, y, R.range(-10, 10), -R.range(10, 40), R.range(0.2, 0.36), R.chance(0.5) ? C[6] : C[5], R.range(0.6, 1.4));
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      dome(p, true);
    },
    draw(p) {
      dome(p, false);
      const fade = 1 - smooth(GONE + 0.3, GONE + 0.55, t);
      if (fade > 0) for (let x = CX; x <= CX + RX; x++) p.dot(x, 0, t < 0.05 ? WHITE : C[5], fade * (0.6 + 0.4 * ((x - CX) / RX)));
      if (t < 0.03) star(p, hx, hy, sp, 1, 1, [S[3], S[0], S[1], WHITE], 1, 2);
      else if (t < 0.06) star(p, hx, hy, sp, 1.25, 0.55, [S[3], S[1], S[2], S[0]], 1, 2);
      ps.draw(p);
      p.glow(CX + RX * 0.5, -RY * 0.45, RY * 0.9, C[4], 0.2 * (1 - smooth(GONE, GONE + 0.55, t)) + 0.35 * Math.exp(-t / 0.08));
      lights.draw(p);
    }
  };
}
export {
  act,
  create,
  meta
};
