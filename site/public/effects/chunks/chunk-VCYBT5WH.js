import {
  bead
} from "./chunk-YZFTWBKD.js";
import {
  liquidMotion
} from "./chunk-63MS6FM2.js";
import {
  motionTrail
} from "./chunk-LCIPQSGQ.js";

// src/fx/water/_liquid.ts
function liquidBead(p, launch, age, size, C, alpha = 1, physics = {}, tailSeconds = 0.022) {
  if (alpha <= 0) return;
  const q = liquidMotion(launch, age, physics);
  const points = motionTrail((t) => {
    const s = liquidMotion(launch, t, physics);
    return [s.x, s.y];
  }, age, tailSeconds, 5);
  if (points.length > 1) p.path(points, (u) => u > 0.7 ? C[5] : C[3], (u) => alpha * (0.12 + 0.58 * u), 1);
  bead(p, q.x, q.y, 0, 0, size, C, alpha);
}

export {
  liquidBead
};
