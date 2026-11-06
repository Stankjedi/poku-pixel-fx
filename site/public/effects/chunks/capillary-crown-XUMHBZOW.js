import {
  liquidBead
} from "./chunk-WS2JUYCY.js";
import {
  WATER,
  bead,
  ring
} from "./chunk-YZFTWBKD.js";
import {
  liquidImpactTime,
  liquidMotion
} from "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  TAU,
  fit,
  rand,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/water/capillary-crown.ts
var meta = {
  addedAt: "2026-11-04T00:35:00Z",
  name: "Capillary crown",
  desc: "A clear drop opens a hollow crown. Its rim pinches into round beads, collapses into a rebound jet, and settles through small landing rings and fading capillary waves.",
  tags: ["water", "drop", "crown", "splash", "surface-tension", "capillary", "one-shot"],
  size: [184, 128],
  origin: [92, 105],
  duration: 2.2,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: WATER, seed: 17 }
};
var HIT = 1 / 3;
var TEAR = 0.11;
var SY = 0.24;
var G = 700;
var incoming = { h: 45 * HIT + 0.5 * G * HIT * HIT, vh: -45 };
var physics = { gravity: G, drag: 0.45, depthScale: SY };
var height = (age) => 24 * smooth(0, 0.065, age) * (1 - smooth(0.14, 0.46, age));
var radius = (age) => 10 + 27 * (1 - Math.exp(-age * 9));
function rim(a, age, seed) {
  const scallop = Math.cos(a * 10 + seed * 0.31), fingers = 1 - smooth(TEAR, 0.19, age);
  const slosh = Math.sin(a * 3 + age * 8 + seed * 0.23) * smooth(0.1, 0.25, age);
  const r = radius(age) + 1.2 * scallop * fingers + slosh * 0.8;
  return {
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    h: height(age) * (1 + 0.1 * scallop * fingers + 0.035 * slosh)
  };
}
function crown(p, age, C, seed, back) {
  const h = height(age);
  if (age < 0 || h < 0.45) return;
  const foot = 9 + 10 * smooth(0, 0.46, age), start = back ? Math.PI : 0;
  const points = [], divisions = 70;
  for (let i = 0; i <= divisions; i++) {
    const a = start + i / divisions * Math.PI, q = rim(a, age, seed);
    points.push([q.x, q.z * SY - q.h]);
  }
  for (let i = 0; i < divisions; i++) {
    const a = start + (i + 0.5) / divisions * Math.PI, lit = (-Math.cos(a) + 0.4) / 1.4;
    const edge = (index, u) => {
      const angle = start + index / divisions * Math.PI, q = rim(angle, age, seed);
      const r = foot + (Math.hypot(q.x, q.z) - foot) * u * u;
      return [Math.cos(angle) * r, Math.sin(angle) * r * SY - q.h * u];
    };
    for (let j = 0; j < 8; j++) {
      const u0 = j / 8, u1 = (j + 1) / 8;
      p.poly(
        [edge(i, u0), edge(i, u1), edge(i + 1, u1), edge(i + 1, u0)],
        C[back ? lit > 0.5 ? 3 : 2 : lit > 0.5 ? 5 : 3],
        back ? 0.64 : 0.31
      );
    }
  }
  p.path(points, (u) => back ? C[4] : u > 0.6 ? C[7] : u > 0.15 ? C[6] : C[4], 1);
  if (age > 0.065 && age < TEAR) for (let i = 0; i < 10; i++) {
    const angle = (TAU * i - seed * 0.31) / 10, q = rim(angle, age, seed);
    if (q.z < 0 !== back) continue;
    bead(p, q.x, q.z * SY - q.h, 0, 0, i % 3 === 0 ? 3 : 2, C);
  }
  for (const f of back ? [0.16, 0.81] : [0.12, 0.78]) {
    const a = start + f * Math.PI, q = rim(a, age, seed), v = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, r = foot + (Math.hypot(q.x, q.z) - foot) * u * u;
      v.push([Math.cos(a) * r, Math.sin(a) * r * SY - q.h * u]);
    }
    p.path(v, C[back ? 4 : 5], back ? 0.5 : 0.8);
  }
}
function drops(seed) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (TAU * i - seed * 0.31) / 10, q = rim(a, TEAR, seed);
    const speed = 38 + rand(i, seed, 1) * 31;
    const launch = {
      ...q,
      vx: Math.cos(a) * speed,
      vz: Math.sin(a) * speed,
      vh: 55 + rand(i, seed, 2) * 75
    };
    return { launch, impact: liquidImpactTime(launch, physics), size: i % 3 === 0 ? 3 : 2, i };
  });
}
function droplets(p, t, C, seed, back) {
  const age = t - HIT - TEAR;
  if (age < 0) return;
  for (const d of drops(seed)) {
    if ((d.launch.z ?? 0) < 0 !== back) continue;
    if (age < d.impact) {
      liquidBead(p, d.launch, age, d.size, C, 1, physics, 0.018);
      continue;
    }
    const landed = liquidMotion(d.launch, d.impact, physics), since = age - d.impact;
    const strength = 1 - smooth(0, 0.36, since);
    if (strength <= 0) continue;
    ring(
      p,
      landed.x,
      landed.z * SY,
      1 + since * 22,
      SY,
      strength * 0.8,
      C,
      { n: 1, seed: seed + d.i, hot: since < 0.035, wob: 0.18 }
    );
    if (since < 0.075) {
      p.line(landed.x, landed.z * SY, landed.x, landed.z * SY - 2 * (1 - since / 0.075), C[6], strength);
    }
  }
}
function surface(p, age, C, seed, half) {
  if (age <= 0) return;
  for (let i = 0; i < 3; i++) {
    const u = age - i * 0.085;
    if (u < 0) continue;
    const r = 8 + 53 * (1 - Math.exp(-u * 2.1)) - i * 2.8;
    const strength = (1 - smooth(0.18, 1.65 - i * 0.1, u)) * (0.78 - i * 0.2);
    ring(p, 0, 0, r, SY, strength, C, { n: 1, half, seed: seed + i, hot: u < 0.045, wob: 0.35 });
  }
}
function drawBack(p, t, o) {
  if (t < HIT || t >= meta.duration) return;
  const C = fit(o.palette, 8), age = t - HIT;
  surface(p, age, C, o.seed, -1);
  if (age < 0.42) {
    const aperture = 4 + 6 * smooth(0, 0.2, age), fade = 1 - smooth(0.18, 0.42, age);
    p.ellipse(0, 0, aperture, aperture * SY, C[1], 0.65 * fade);
  }
  droplets(p, t, C, o.seed, true);
  crown(p, age, C, o.seed, true);
}
function draw(p, t, o) {
  if (t < 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8), age = t - HIT;
  if (t < HIT) {
    liquidBead(p, incoming, t, 3, C, 1, { gravity: G, drag: 0, depthScale: SY }, 0.024);
    return;
  }
  surface(p, age, C, o.seed, 1);
  const rebound = age - 0.34, jet = 28 * smooth(0, 0.1, rebound) * (1 - smooth(0.12, 0.34, rebound));
  if (jet > 0.3) {
    p.poly([[-4, 0], [-1.2, -jet], [1.3, -jet], [4, 0]], C[4], 0.85);
    p.line(-1.1, -jet, -2, -1, C[6]);
    if (rebound < 0.1) bead(p, 0, -jet, 0, 0, 3, C);
  }
  const upAge = rebound - 0.1, upLaunch = { h: 28, vh: 76, vx: 3 }, upPhysics = { ...physics, gravity: 600 };
  const upImpact = liquidImpactTime(upLaunch, upPhysics);
  if (upAge >= 0 && upAge < upImpact) liquidBead(p, upLaunch, upAge, 3, C, 1, upPhysics, 0.02);
  else if (upAge >= upImpact) {
    const since = upAge - upImpact, q = liquidMotion(upLaunch, upImpact, upPhysics);
    ring(p, q.x, 0, 2 + since * 27, SY, (1 - smooth(0, 0.6, since)) * 0.85, C, { n: 2, gap: 2.8, seed: o.seed });
  }
  crown(p, age, C, o.seed, false);
  droplets(p, t, C, o.seed, false);
  if (age < 0.065) {
    const flash = 1 - age / 0.065;
    p.ellipse(0, -1, 7 + age * 60, 1.5, C[6], flash);
    p.glow(-2, -2, 13, C[5], 0.15 * flash);
  }
}
export {
  draw,
  drawBack,
  meta
};
