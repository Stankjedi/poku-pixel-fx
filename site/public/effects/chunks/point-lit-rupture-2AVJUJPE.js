import {
  createPointLightSampler2D,
  localPointLight2D,
  samplePointLight2D
} from "./chunk-JQXGDKYD.js";
import "./chunk-NPBZD3DI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  TAU,
  clamp,
  ease,
  fit,
  rand,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/point-lit-rupture.ts
var meta = {
  name: "Point-lit Rupture",
  desc: "A moving charge and short rupture illuminate nearby stone faces and the floor through position, normals and finite-range material lighting.",
  tags: ["arcane", "point-light", "material", "rupture", "scene", "one-shot"],
  size: [256, 224],
  origin: [128, 154],
  duration: 2.6,
  loop: false,
  fps: 50,
  bg: "black",
  options: { seed: 107, receiveLight: true, pointLight: null, palette: ["#080d1a", "#162535", "#293f51", "#426573", "#71979e", "#a4c5c1", "#d5e9db", "#f2fff3"] }
};
var q = (t, a, b) => clamp((t - a) / (b - a));
var fade = (t, a, b) => 1 - smooth(a, b, t);
var releaseTime = 1.18;
function sourceAt(t) {
  const u = ease.inOutCubic(q(t, 0.12, 0.88)), age = t - releaseTime;
  const x = -61 + 61 * u, y = -39 - 13 * Math.sin(u * Math.PI) - 8 * u;
  const intensity = age < 0 ? 1.2 + 0.65 * smooth(0.83, releaseTime, t) : 3.9 * Math.exp(-age * 8.5);
  return { position: [x, y, -38], radius: 122, intensity: intensity * smooth(0.03, 0.12, t) * fade(t, 1.65, 2.2) };
}
function create(o) {
  const C = fit(o.palette, 8), E = fit(["#102c42", "#236578", "#389eb1", "#7cddd8", "#c8fae7", "#fbfff3"], 6);
  const stones = [{ x: -62, y: 0, w: 17, h: 34 }, { x: 63, y: 7, w: 17, h: 40 }, { x: -36, y: 27, w: 13, h: 18 }, { x: 37, y: 34, w: 16, h: 24 }, { x: 3, y: 42, w: 13, h: 14 }];
  return { draw(p, t) {
    if (t <= 0 || t >= meta.duration) return;
    const opacity = smooth(0, 0.12, t) * fade(t, 2.15, 2.6), before = p.fade;
    p.fade *= opacity;
    const source = sourceAt(t), light = o.pointLight ? localPointLight2D(p, o.pointLight) : source;
    const received = (pos, N) => o.receiveLight ? samplePointLight2D(light, pos, N).diffuse : 0;
    const shade = (pos, N, base) => C[Math.min(6, Math.max(1, Math.floor(base + received(pos, N) * 3.4)))];
    const floorLight = o.receiveLight ? createPointLightSampler2D(light, [0, -0.48, -0.88]) : () => 0;
    p.shade(-101, -10, 101, 65, (x, y, out) => {
      if ((x / 101) ** 2 + ((y - 27) / 36) ** 2 > 1) return;
      const stagger = Math.floor((y + 10) / 12) % 2 * 12, tx = Math.floor((x + stagger) / 24), ty = Math.floor((y + 10) / 12);
      const edge = (x + stagger + 2400) % 24 < 1 || (y + 10) % 12 < 1;
      const base = edge ? 1 : 1.65 + rand(o.seed, tx, ty) * 0.42;
      out.c = C[Math.min(6, Math.max(1, Math.floor(base + floorLight(x, y, 14) * 3.4)))];
      out.a = edge ? 0.88 : 1;
    });
    const drawStone = (s, i) => {
      const { x, y, w, h } = s, top = y - h;
      const front = [[x - w, top + 5], [x + 2, top + 10], [x + 2, y + 4], [x - w + 2, y - 1]];
      const side = [[x + 2, top + 10], [x + w, top + 2], [x + w - 2, y - 4], [x + 2, y + 4]];
      const roof = [[x - w, top + 5], [x - 3, top - 2], [x + w, top + 2], [x + 2, top + 10]];
      p.poly(front, shade([x - w * 0.4, top + h * 0.55, -9], [-0.56, 0.03, -0.83], 2));
      p.poly(side, shade([x + w * 0.6, top + h * 0.52, -7], [0.76, 0.05, -0.65], 1.35));
      p.poly(roof, shade([x, top + 3, -10], [0, -0.8, -0.6], 2.25));
      p.path([[x - w + 3, top + 8], [x - 6, top + 12], [x - 8, top + 17]], C[1], 0.72, 0.8);
      p.path([[x + 4, top + 13], [x + w - 3, top + 9]], shade([x + w * 0.6, top + 10, -7], [0.76, 0, -0.65], 1), 0.8, 0.8);
      p.path([roof[0], roof[1], roof[2]], shade([x, top, -10], [0, -0.85, -0.52], 2.55), 0.8, 0.8);
    };
    stones.slice(0, 2).forEach(drawStone);
    const [cx, cy] = source.position, age = t - releaseTime;
    if (age < 0) {
      const compression = 1 - 0.55 * smooth(0.92, releaseTime, t), r = (4.5 + Math.sin(t * 9) * 0.35) * compression;
      p.glow(cx, cy, 18, E[2], 0.19);
      p.poly([[cx, cy - r * 1.6], [cx + r, cy], [cx, cy + r * 1.6], [cx - r, cy]], E[2]);
      p.poly([[cx, cy - r * 1.5], [cx + r * 0.45, cy], [cx, cy + r], [cx - r * 0.4, cy]], E[4]);
      p.path([[cx - r * 0.6, cy], [cx, cy - r * 1.2]], E[5], 0.9, 0.9);
      if (t < 0.92) {
        const tail = [];
        for (let j = 0; j < 10; j++) {
          const past = sourceAt(Math.max(0, t - j * 0.012));
          tail.unshift([past.position[0], past.position[1]]);
        }
        p.path(tail, E[2], (u) => u * 0.6, 1.5);
      }
    } else if (age < 0.5) {
      const lobes = [[-0.52, 54, 21, 0.34, 0.2], [-1.42, 36, 17, 0.3, 1.8], [-2.7, 31, 13, 0.27, 2.7], [0.5, 39, 17, 0.37, 3.8], [1.6, 28, 14, 0.35, 2.1]].map(([an, reach, r, life, phase], i) => {
        const a = Math.max(0, age - i * 6e-3), growth = ease.outQuart(q(a, 0, 0.15));
        const spread = growth * (0.58 + 0.42 * smooth(0.035, 0.14, a));
        return {
          an,
          life,
          phase,
          a,
          x: cx + Math.cos(an) * reach * spread,
          y: cy + Math.sin(an) * reach * spread,
          radius: r * (0.28 + 0.72 * growth) * fade(a, 0.08, life),
          cut: smooth(0.04, 0.22, a),
          heat: fade(a, 0.015, 0.2)
        };
      });
      const hole = 30 * ease.outCubic(q(age, 0.065, 0.22));
      p.shade(-83, -120, 90, 8, (x, y, out) => {
        if (Math.hypot(x - cx, (y - cy) * 1.1) < hole) return;
        let best = -1, heat = 0;
        for (const f of lobes) {
          if (f.radius < 0.3 || f.a >= f.life) continue;
          const dx = x - f.x, dy = y - f.y, c = Math.cos(f.an), s = Math.sin(f.an), u = dx * c + dy * s, v = -dx * s + dy * c;
          const theta = Math.atan2(v, u), wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
          const cut = Math.max(0, 1 - Math.abs(wrap(theta - 2.3 - Math.sin(f.phase) * 0.3)) / 0.28) * 0.22;
          const boundary = 1 + 0.16 * Math.sin(theta * 3 + f.phase) + 0.07 * Math.sin(theta * 5 - f.phase) - cut * smooth(0.02, 0.09, f.a);
          const d = Math.hypot(u, v) / (f.radius * boundary);
          if (d >= 1) continue;
          const cavity = Math.hypot(u + f.radius * 0.75, v + f.radius * 0.1) - f.radius * f.cut * 1.2;
          if (cavity < 0) continue;
          const edge = Math.min(1 - d, cavity / f.radius);
          if (edge > best) {
            best = edge;
            heat = f.heat;
          }
        }
        if (best < 0) return;
        const energy = heat * (0.24 + Math.min(0.65, best * 1.8));
        out.c = E[energy > 0.72 && age < 0.055 ? 5 : energy > 0.52 ? 4 : energy > 0.27 ? 3 : energy > 0.1 ? 2 : 1];
        out.a = fade(age, 0.27, 0.44);
      });
      if (age < 0.04) {
        const star = [];
        for (let i = 0; i < 14; i++) {
          const an = i * TAU / 14, r = i % 2 ? 8 : 22;
          star.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]);
        }
        p.poly(star, E[5], fade(age, 0.01, 0.04));
      }
      p.glow(cx, cy, 25, E[3], fade(age, 0.025, 0.15) * 0.3);
    }
    if (age > 0 && age < 0.7) for (let i = 0; i < 14; i++) {
      const an = rand(o.seed, i, 1) * TAU, travel = (25 + rand(o.seed, i, 2) * 48) * (1 - Math.exp(-age * 5));
      const x = cx + Math.cos(an) * travel, y = cy + Math.sin(an) * travel + age * age * 18, a = fade(age, 0.1, 0.32 + rand(o.seed, i, 3) * 0.3);
      if (a > 0.01) p.path([[x - Math.cos(an) * 3, y - Math.sin(an) * 3], [x, y]], E[i % 3 ? 2 : 4], a * 0.75, 0.85);
    }
    stones.slice(2).forEach(drawStone);
    p.fade = before;
  } };
}
export {
  create,
  meta,
  releaseTime,
  sourceAt
};
