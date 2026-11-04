import type { Painter } from "../../core/painter.js";
import { liquidMotion, motionTrail, type LiquidLaunch, type LiquidPhysics } from "../../core/index.js";
import { bead } from "./_lib.js";

/** A wet, round head with a short curved history. Reflection is in color, not broad emissive bloom. */
export function liquidBead(p: Painter, launch: LiquidLaunch, age: number, size: number,
  C: number[], alpha = 1, physics: LiquidPhysics = {}, tailSeconds = 0.022) {
  if (alpha <= 0) return;
  const q = liquidMotion(launch, age, physics);
  const points = motionTrail(t => { const s = liquidMotion(launch, t, physics); return [s.x, s.y]; }, age, tailSeconds, 5);
  if (points.length > 1) p.path(points, u => u > 0.7 ? C[5] : C[3], u => alpha * (0.12 + 0.58 * u), 1);
  bead(p, q.x, q.y, 0, 0, size, C, alpha);
}
