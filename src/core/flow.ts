// Continuous, seekable transport through changing media: flame -> smoke, jet -> mist,
// fast projectile -> drifting residue. No state or random numbers are consumed by sampling.
import { integrateMotion2D } from "./particles.js";

export interface FlowState { x: number; y: number; vx: number; vy: number }
export interface FlowPhase {
  /** Seconds in this phase. Only the final phase may be infinite. */
  duration: number;
  ax?: number;
  ay?: number;
  drag?: number;
  dragY?: number;
}

/** Analytic piecewise acceleration + linear drag, carrying position AND velocity across boundaries.
 * Finite phases hold their final position/velocity after completion. To keep drifting, use a final
 * phase with duration: Infinity. This is an authored transport model, not a fluid simulation.
 */
export function flowMotion(initial: Readonly<FlowState>, age: number, phases: readonly FlowPhase[]): FlowState {
  if (!Number.isFinite(age) || age < 0 || ![initial.x, initial.y, initial.vx, initial.vy].every(Number.isFinite))
    throw new RangeError("Flow state and non-negative age must be finite");
  for (let i = 0; i < phases.length; i++) {
    const q = phases[i], drag = q.drag ?? 0;
    if (!(q.duration > 0) || (!Number.isFinite(q.duration) && !(q.duration === Infinity && i === phases.length - 1)) ||
      ![q.ax ?? 0, q.ay ?? 0, drag, q.dragY ?? drag].every(Number.isFinite))
      throw new RangeError("Flow phases need positive durations and finite forces; only the last duration may be infinite");
  }
  const state = { x: initial.x, y: initial.y, vx: initial.vx, vy: initial.vy };
  let remaining = age;
  for (const q of phases) {
    if (!(remaining > 0)) break;
    const dt = Math.min(remaining, q.duration), drag = q.drag ?? 0;
    integrateMotion2D(state, dt, q.ax ?? 0, q.ay ?? 0, drag, q.dragY ?? drag);
    remaining -= dt;
  }
  return state;
}
