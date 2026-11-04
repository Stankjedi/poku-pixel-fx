import type { Camera3D } from "./painter.js";
import { clamp3 } from "./math.js";

/** Pure impact impulse, in seconds since contact. Apply once to the unchanged orbit
 * camera each frame, before grid, effect, and lighting. No simulation/draw RNG is used.
 * Strength is bounded to [0, 2]; the default gives a roughly four-pixel initial jolt
 * at 260×180 and zoom 1. Reduced-motion callers can use strength 0 or skip this hook.
 */
export function impactCamera3D(base: Camera3D, age: number, strength = 1, seed = 0): Camera3D {
  if (!Number.isFinite(age) || age < 0 || age >= 0.7 - 1e-9 || !Number.isFinite(strength) || strength <= 0) return base;
  const amplitude = clamp3(strength, 0, 2) * Math.exp(-5 * age) * (1 - age / 0.7) ** 2;
  // A stable seed hash chooses handedness and slight frequency variation, without
  // consuming particle RNG or making repeated draws alter later frames.
  const hash = Math.imul((seed | 0) ^ 0x45d9f3b, 0x45d9f3b) >>> 0;
  const direction = hash & 1 ? 1 : -1;
  const frequency = 42 + (hash % 7);
  const kick = Math.cos(age * frequency) * amplitude;
  const side = direction * 0.12 * Math.cos(age * frequency * 1.17) * amplitude;
  const up = 0.26 * kick;
  const cy = Math.cos(base.yaw), sy = Math.sin(base.yaw);
  const ce = Math.cos(base.elevation), se = Math.sin(base.elevation);
  const target = base.target ?? [0, 0, 0];
  return {
    ...base,
    yaw: base.yaw + direction * 0.007 * kick,
    elevation: clamp3(base.elevation + 0.009 * kick, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001),
    zoom: clamp3(base.zoom, 0.001, 100),
    // Screen-right/up basis avoids translation along the view axis, retaining
    // comparable motion in perspective and orthographic projections.
    target: [target[0] + cy * side - sy * se * up, target[1] + ce * up, target[2] - sy * side - cy * se * up],
  };
}
