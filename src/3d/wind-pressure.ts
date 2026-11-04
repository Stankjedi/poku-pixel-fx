/** Seekable, non-emissive air-force motion. Artistic impulse/drag models, not CFD. */
import { type Vec3, clamp3, len3, mul3 } from './math.js';

export interface GustImpulse3D { pressure: number; deflection: number; drift: number; velocity: number }
/** A quick pressure impulse, a damped spring response, and friction-limited sliding.
 * Negative ages have no response. Deflection is signed so rooted foliage can spring back;
 * a floor-supported prop can clamp its angle to zero at its resting support plane. */
export function gustImpulse3D(age: number, strength = 1): GustImpulse3D {
  if (!Number.isFinite(age) || !Number.isFinite(strength)) throw new RangeError('Gust age and strength must be finite');
  const power = clamp3(strength, 0, 2);
  if (age < 0 || power === 0) return { pressure: 0, deflection: 0, drift: 0, velocity: 0 };
  if (age > 200) return { pressure: 0, deflection: 0, drift: power, velocity: 0 };
  return {
    pressure: power * Math.exp(-age * 13),
    deflection: power * Math.sin(age * 10) * Math.exp(-age * 3.7),
    drift: power * -Math.expm1(-age * 5),
    velocity: power * 5 * Math.exp(-age * 5),
  };
}

/** A particle carried downstream, decelerating under linear drag. No frame-step state.
 * Direction is normalized; lift, gravity and flutter belong to the material using this path. */
export function advectGust3D(origin: Vec3, direction: Vec3, age: number, speed: number, drag = 2.6): Vec3 {
  if (origin.length !== 3 || direction.length !== 3 || ![...origin, ...direction, age, speed, drag].every(Number.isFinite) || speed < 0 || drag < 0)
    throw new RangeError('Gust path needs finite points, non-negative speed and drag');
  const length = len3(direction);
  if (!(length > 1e-12) || !Number.isFinite(length)) throw new RangeError('Gust direction must be nonzero');
  const elapsed = Math.max(0, age), distance = speed * (drag < 1e-8 ? elapsed : -Math.expm1(-drag * elapsed) / drag);
  if (!Number.isFinite(distance)) throw new RangeError('Gust path distance overflow');
  const d = mul3(direction, distance / length);
  const point: Vec3 = [origin[0] + d[0], origin[1] + d[1], origin[2] + d[2]];
  if (!point.every(Number.isFinite)) throw new RangeError('Gust path position overflow');
  return point;
}
