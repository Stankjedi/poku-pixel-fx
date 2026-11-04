import { fly, flyV } from "./particles.js";

/** Liquid in world space: x across the pool, z into the scene, h above its surface. */
export interface LiquidLaunch { x?: number; z?: number; h?: number; vx?: number; vz?: number; vh?: number }
export interface LiquidPhysics { gravity?: number; drag?: number; depthScale?: number }
export interface LiquidSample {
  x: number; z: number; h: number; vx: number; vz: number; vh: number;
  /** Projected screen y and velocity. Positive screen y points down. */
  y: number; vy: number;
}

function parameters(launch: LiquidLaunch, physics: LiquidPhysics) {
  const x = launch.x ?? 0, z = launch.z ?? 0, h = launch.h ?? 0;
  const vx = launch.vx ?? 0, vz = launch.vz ?? 0, vh = launch.vh ?? 0;
  const gravity = physics.gravity ?? 820, drag = physics.drag ?? 0.35, depthScale = physics.depthScale ?? 0.22;
  if (![x, z, h, vx, vz, vh, gravity, drag, depthScale].every(Number.isFinite)
    || h < 0 || gravity <= 0 || drag < 0 || depthScale < 0)
    throw new RangeError("Liquid launch and physics must be finite; height, drag and depthScale non-negative, gravity positive");
  return { x, z, h, vx, vz, vh, gravity, drag, depthScale };
}

/** Exact ballistic flight with linear drag, suitable for seeking and curved droplet trails.
 * This does not clamp below the surface: use liquidImpactTime to stop at the real landing point.
 */
export function liquidMotion(launch: LiquidLaunch, age: number, physics: LiquidPhysics = {}): LiquidSample {
  if (!Number.isFinite(age) || age < 0) throw new RangeError("Liquid age must be finite and non-negative");
  const q = parameters(launch, physics);
  const [x, negativeH] = fly(q.x, -q.h, q.vx, -q.vh, age, q.gravity, q.drag);
  const [z] = fly(q.z, 0, q.vz, 0, age, 0, q.drag);
  const [vx, negativeVh] = flyV(q.vx, -q.vh, age, q.gravity, q.drag);
  const [vz] = flyV(q.vz, 0, age, 0, q.drag);
  return { x, z, h: -negativeH, vx, vz, vh: -negativeVh,
    y: z * q.depthScale + negativeH, vy: vz * q.depthScale + negativeVh };
}

/** First descending contact with h=0. A surface-launched rising drop returns its later landing,
 * not its birth. Returned time uses the same motion as liquidMotion, including linear drag.
 */
export function liquidImpactTime(launch: LiquidLaunch, physics: LiquidPhysics = {}): number {
  const q = parameters(launch, physics);
  if (q.h === 0 && q.vh <= 0) return 0;
  const root = Math.hypot(q.vh, Math.sqrt(2 * q.gravity * q.h));
  // The alternate root avoids catastrophic cancellation for fast downward launches.
  const ballistic = q.vh < 0 ? 2 * q.h / (root - q.vh) : (q.vh + root) / q.gravity;
  if (q.drag === 0) return ballistic;
  let low = 0, high = Math.max(0.001, ballistic);
  const height = (age: number) => -fly(0, -q.h, 0, -q.vh, age, q.gravity, q.drag)[1];
  while (height(high) > 0) {
    high *= 2;
    if (!Number.isFinite(high)) throw new RangeError("Liquid landing time exceeds the numeric range");
  }
  for (let i = 0; i < 52; i++) {
    const middle = (low + high) / 2;
    if (height(middle) > 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
