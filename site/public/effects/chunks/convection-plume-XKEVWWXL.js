import {
  firePuff,
  hotFirst,
  looped,
  noiseFor,
  smokePuff
} from "./chunk-G4O563RP.js";
import {
  flowMotion
} from "./chunk-KJLRN7JI.js";
import "./chunk-NY4VHNMV.js";
import {
  TAU,
  drawTrail,
  fit,
  hex,
  mix,
  motionTrail,
  particleEnvelope,
  rng,
  smooth
} from "./chunk-WFSCDWU6.js";
import "./chunk-T3JNBT34.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/fire/convection-plume.ts
var meta = {
  name: "Convection Plume",
  desc: "Wind feeds a forked flame above a coal bed. Hot tongues rise, cool into widening soot, and carry sparse embers along the same continuous flow.",
  tags: ["fire", "convection", "smoke", "wind", "embers", "loop"],
  size: [112, 152],
  origin: [38, 128],
  duration: 3,
  loop: true,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#3b1420", "#7b2024", "#b83520", "#ed5d1b", "#ff9829", "#ffc84f", "#ffe68a", "#fff4bf", "#fffbe8"],
    smoke: ["#272330", "#4c414b", "#827278"],
    wind: 16,
    height: 54,
    seed: 17
  }
};
var D = meta.duration;
var NL = noiseFor(D);
function tongue(p, t, x, h, width, lean, phase, C) {
  const layers = [[1, 1, 1], [0.8, 0.91, 3], [0.54, 0.72, 5], [0.24, 0.41, 7]];
  for (const [scale, length, ci] of layers) {
    const L = h * length, rows = [];
    let lo = Infinity, hi = -Infinity;
    for (let row = 0; row < Math.ceil(L); row++) {
      const u = Math.min(1, (row + 0.5) / L);
      const bend = lean * (u * length) ** 1.5 + Math.sin(u * 7 - t / D * TAU * 3 + phase) * 7.2 * u * length;
      const fold = 1 + Math.sin(u * 11 - t / D * TAU * 6 + phase) * 0.18 * u;
      const w = width * scale * (1 - u) ** 0.72 * (0.68 + Math.sin(u * Math.PI) * 0.53) * fold;
      rows.push([x + bend - w, x + bend + w]);
      lo = Math.min(lo, x + bend - w);
      hi = Math.max(hi, x + bend + w);
    }
    p.shade(lo, -L, hi, 0, (px, py) => {
      const span = rows[Math.floor(-py)];
      return span && px >= span[0] && px < span[1] ? C[ci] : void 0;
    });
  }
}
function draw(p, time, o) {
  const t = (time % D + D) % D, C = fit(o.palette, 9), H = hotFirst(C), S = fit(o.smoke, 3);
  const height = Math.max(28, Math.min(62, o.height)), wind = Math.max(-10, Math.min(24, o.wind));
  const breath = 0.88 + 0.1 * Math.sin(t / D * TAU * 2) + 0.04 * NL(t, 4, o.seed);
  const hot = [];
  looped(t, D, 40, o.seed + 31, (r) => ({
    x: r.range(-6, 7),
    y: -r.range(16, 29) * height / 54,
    vx: r.range(4, 12) + wind * 0.45,
    vy: -r.range(28, 39),
    hotLife: r.range(0.42, 0.68),
    life: r.range(1.75, 2.35),
    size: r.range(2.7, 4.2),
    f: r.next()
  }), (q, age) => {
    const state = flowMotion(q, age, [
      { duration: q.hotLife, ax: wind * 0.6, ay: -105, drag: 1.6, dragY: 1.8 },
      { duration: Infinity, ax: wind * 0.26, ay: -18, drag: 0.65, dragY: 1 }
    ]);
    const smokeAge = age - q.hotLife * 0.78;
    if (smokeAge > 0) {
      const u = smokeAge / (q.life - q.hotLife * 0.78);
      const sway = Math.sin(age * 3.1 + q.f * TAU) * 2.4 * smooth(0, 0.6, smokeAge);
      smokePuff(p, state.x + sway, state.y, 1 - u, q.size * 1.5, mix(S[1], C[1], 0.12), true, 0.7);
    }
    if (age < q.hotLife) hot.push({
      x: state.x,
      y: state.y,
      k: 1 - age / q.hotLife,
      size: q.size,
      f: q.f,
      opacity: particleEnvelope(age, q.hotLife, 0.1, 0.7)
    });
  });
  tongue(p, t + 0.22, -5, height * (0.6 + 0.11 * Math.sin(t / D * TAU * 3 + 2)) * breath, 7.4, wind * 0.65 - 6, 1.8, C.map((c) => mix(c, C[0], 0.16)));
  tongue(p, t, 5, height * (0.73 + 0.13 * Math.sin(t / D * TAU * 2 + 3)) * breath, 7.6, wind * 0.78 + 11, 3.7, C);
  tongue(p, t, 0, height * breath, 11.8, wind * 0.75, 0, C);
  for (const q of hot) {
    const fade = p.fade;
    p.fade *= q.opacity;
    firePuff(p, q.x, q.y, q.k, q.size, 0.5 + q.f * 0.4, H, 0.045);
    p.fade = fade;
  }
  p.ellipse(0, 1.5, 13, 3.2, C[0]);
  for (let i = 0; i < 7; i++) {
    const r = rng(o.seed, i, 81), x = -11 + i * 3.5, y = r.range(-1.2, 1.3);
    p.ellipse(x, y, r.range(1.5, 2.6), r.range(1, 1.6), mix(C[0], hex("#13131c"), 0.35));
    p.line(x - 0.5, y, x + 1, y - 0.5, C[2 + (Math.sin(t / D * TAU * 2 + i) > 0.2 ? 1 : 0)]);
  }
  looped(t, D, 12, o.seed + 509, (r) => ({
    x: r.range(-6, 6),
    y: -r.range(8, 24),
    vx: r.range(-7, 12) + wind * 0.5,
    vy: -r.range(42, 65),
    life: r.range(1, 1.8)
  }), (q, age) => {
    const at = (a) => {
      const v = flowMotion(q, a, [{ duration: Infinity, ax: wind * 0.3, ay: -24, drag: 0.85, dragY: 1.2 }]);
      return [v.x, v.y];
    };
    const alpha = particleEnvelope(age, q.life, 0.04, 0.24);
    drawTrail(p, motionTrail(at, age, 0.055, 4), { color: C[3], head: C[6], width: 0.7, alpha, light: 0.12, lightRadius: 3 });
  });
  p.glow(wind * 0.18, -height * 0.28, 31, C[3], 0.15 * breath);
  p.glow(1, -7, 14, C[4], 0.2 * breath);
  p.glow(0, 1, 19, C[3], 0.08 * breath);
}
export {
  draw,
  meta
};
