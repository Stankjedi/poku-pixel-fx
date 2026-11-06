import {
  createDetailParticles2D,
  samplePointLight2D
} from "./chunk-63MS6FM2.js";
import "./chunk-VBA4AN6M.js";
import {
  createTimingCurve
} from "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-LK75UMZK.js";
import {
  fit
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/projectiles/timing-comet.ts
var meta = {
  name: "Timing Comet",
  desc: "A small amber comet demonstrates separately authored travel, width, opacity and light curves. The final motion key can hold or continue at its authored velocity.",
  tags: ["projectiles", "timing", "authoring-study", "curves"],
  size: [320, 160],
  origin: [112, 104],
  duration: 2.5,
  loop: false,
  fps: 50,
  bg: "black",
  options: { seed: 727, coast: true, palette: ["#241b31", "#53283e", "#94444b", "#cc6655", "#ef9b64", "#f7ce87", "#fff0bc"] }
};
var travelKeys = [
  { time: 0, value: -87, velocity: 0 },
  { time: 0.25, value: -84 },
  { time: 0.62, value: -48 },
  { time: 1.05, value: 24 },
  { time: 1.25, value: 52, velocity: 135 }
];
function createCometTracks(coast = true) {
  return {
    travel: createTimingCurve(travelKeys, { after: coast ? "continue" : "hold" }),
    width: createTimingCurve([{ time: 0, value: 0 }, { time: 0.16, value: 1 }, { time: 1.72, value: 1 }, { time: 2.25, value: 0.35 }]),
    opacity: createTimingCurve([{ time: 0, value: 0 }, { time: 0.12, value: 1 }, { time: 1.85, value: 1 }, { time: 2.3, value: 0, velocity: 0 }]),
    light: createTimingCurve([{ time: 0, value: 0 }, { time: 0.27, value: 0.32 }, { time: 0.72, value: 0.25 }, { time: 1.3, value: 0.18 }, { time: 2.15, value: 0, velocity: 0 }])
  };
}
function cometPosition(x) {
  return [x, -18 - 0.25 * (x + 90) + 6e-4 * (x + 90) ** 2];
}
var slope = (x) => -0.25 + 12e-4 * (x + 90);
function create(o) {
  const C = fit(o.palette, 7), tracks = createCometTracks(o.coast);
  const position = (t) => cometPosition(tracks.travel.sample(t).value);
  const sparks = createDetailParticles2D({
    count: 20,
    seed: o.seed,
    palette: [C[5], C[4], C[2]],
    start: 0.55,
    duration: 1.2,
    life: [0.24, 0.43],
    origin: (birth, id) => {
      const P = position(birth);
      return [P[0] - 3, P[1] + (id % 3 - 1) * 3];
    },
    inheritedVelocity: (birth) => {
      const q = tracks.travel.sample(birth);
      return [q.velocity * 0.6, q.velocity * slope(q.value) * 0.6];
    },
    angle: Math.PI,
    spread: 0.6,
    speed: [10, 25],
    gravity: 14,
    drag: 1.8,
    size: [0.65, 1.1],
    endSize: 0.3,
    style: "spark",
    trailSeconds: 0.045,
    opacity: 0.8,
    emission: 0.018
  });
  return { draw(p, t) {
    if (t <= 0 || t >= meta.duration) return;
    const alpha = tracks.opacity.sample(t).value, w = tracks.width.sample(t).value, light = tracks.light.sample(t).value;
    const P = position(t), m = slope(P[0]), len = Math.hypot(1, m), T = [1 / len, m / len], N = [-T[1], T[0]];
    if (alpha > 0) {
      const a = [], b = [], highlight = [];
      for (let i = 0; i <= 22; i++) {
        const u = i / 22, Q = position(Math.max(0, t - 0.27 * (1 - u))), s = slope(Q[0]), normal = [-s / Math.hypot(1, s), 1 / Math.hypot(1, s)];
        const radius = (0.18 + u * 3.8) * w;
        a.push([Q[0] + normal[0] * radius, Q[1] + normal[1] * radius]);
        b.push([Q[0] - normal[0] * radius, Q[1] - normal[1] * radius]);
        highlight.push([Q[0] - normal[0] * radius * 0.4, Q[1] - normal[1] * radius * 0.4]);
      }
      p.poly([...a, ...b.reverse()], C[2], alpha * 0.9);
      p.path(highlight, C[4], alpha * 0.95, 2.1 * w);
      const point = (forward, side) => [P[0] + T[0] * forward + N[0] * side, P[1] + T[1] * forward + N[1] * side];
      const tip = point(10 * w, 0), top = point(-1, -5 * w), back = point(-8 * w, 0), bottom = point(-1, 5 * w);
      const illumination = samplePointLight2D({ position: [P[0] - 5, P[1] - 10, -18], radius: 42, intensity: light * 4 }, [P[0], P[1], 0], [-N[0] * 0.4, -N[1] * 0.4, -0.8]).diffuse;
      p.poly([tip, top, back, bottom], C[3], alpha);
      p.poly([tip, top, back], C[illumination > 0.5 ? 5 : 4], alpha);
      p.path([back, top, tip], C[6], alpha * 0.9, 0.9);
      p.path([point(-2, 0), tip], C[5], alpha, 1.3);
      p.glow(P[0], P[1], 19 * w, C[4], light * alpha);
    }
    sparks.draw(p, t);
  } };
}
export {
  cometPosition,
  create,
  createCometTracks,
  meta,
  travelKeys
};
