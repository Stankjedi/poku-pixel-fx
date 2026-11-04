/** Coherent directional beams: a stable axis, orthonormal cross-section and bounded pulse timing. */
import type { Color3D } from "./frame.js";
import { add3, clamp3, cross3, len3, mul3, norm3, smooth3, sub3, type Vec3 } from "./math.js";
import type { Painter3D } from "./painter.js";

export const LASER_PALETTE_3D: readonly Color3D[] = ["#260d25", "#571333", "#a9234e", "#ed3b64", "#ff7790", "#ffc2bd", "#fff7e8"];
export interface BeamFrame3D { start: Vec3; end: Vec3; axis: Vec3; u: Vec3; v: Vec3; length: number }
export interface BeamTiming3D { charge: number; fire: number; arrive: number; release: number; clear: number; end: number }
export interface BeamEnvelope3D { charge: number; head: number; tail: number; power: number; impact: number; cooling: number }
export const DEFAULT_BEAM_TIMING_3D: Readonly<BeamTiming3D> = { charge: 0.04, fire: 0.56, arrive: 0.625, release: 1.9, clear: 2.03, end: 3.1 };

/** Reject invalid axes rather than leaking NaNs into projection. A coincident pair has no beam. */
export function createBeamFrame3D(start: Vec3, end: Vec3): BeamFrame3D | null {
  if (![...start, ...end].every(Number.isFinite)) throw new RangeError("Beam endpoints must be finite");
  const delta = sub3(end, start), length = len3(delta);
  if (length < 1e-8) return null;
  const axis = mul3(delta, 1 / length);
  const u = norm3(cross3(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]));
  return { start: [...start], end: [...end], axis, u, v: cross3(axis, u), length };
}

/** Axial fraction plus two world-space cross-section offsets; no camera-facing assumptions. */
export function beamPoint3D(frame: BeamFrame3D, fraction: number, u = 0, v = 0): Vec3 {
  return add3(add3(mul3(frame.start, 1 - fraction), mul3(frame.end, fraction)), add3(mul3(frame.u, u), mul3(frame.v, v)));
}

/** Charge, finite-speed opening, stable hold, traveling shutoff and independent contact cooling. */
export function beamEnvelope3D(time: number, timing: Readonly<BeamTiming3D> = DEFAULT_BEAM_TIMING_3D): BeamEnvelope3D {
  const values = [timing.charge, timing.fire, timing.arrive, timing.release, timing.clear, timing.end];
  if (!values.every((v, i) => Number.isFinite(v) && v >= 0 && (i === 0 || v > values[i - 1]))) throw new RangeError("Beam timings must be finite and strictly increasing");
  const empty = { charge: 0, head: 0, tail: 0, power: 0, impact: 0, cooling: 0 };
  if (!Number.isFinite(time) || time <= timing.charge || time >= timing.end) return empty;
  const head = clamp3((time - timing.fire) / (timing.arrive - timing.fire));
  const tail = clamp3((time - timing.release) / (timing.clear - timing.release));
  const connected = smooth3(timing.arrive - 0.012, timing.arrive + 0.02, time);
  return {
    charge: smooth3(timing.charge, timing.fire, time) * (1 - smooth3(timing.fire, timing.arrive + 0.12, time)),
    head, tail,
    power: head > tail ? smooth3(timing.fire, timing.fire + 0.025, time) * (1 - smooth3(timing.release, timing.clear, time) * 0.2) : 0,
    impact: connected * (1 - smooth3(timing.release, timing.clear + 0.14, time)),
    cooling: smooth3(timing.release - 0.15, timing.clear, time) * (1 - smooth3(timing.clear, timing.end, time)),
  };
}

export interface CoherentBeam3DOptions { head?: number; tail?: number; radius?: number; power?: number; palette?: readonly Color3D[]; emission?: number }
/** Three uninterrupted concentric capsules. The bright core never inherits noisy particle offsets. */
export function drawCoherentBeam3D(p: Painter3D, frame: BeamFrame3D, options: CoherentBeam3DOptions = {}) {
  const finite = (value: number | undefined, fallback: number) => value !== undefined && Number.isFinite(value) ? value : fallback;
  const head = clamp3(finite(options.head, 1)), tail = clamp3(finite(options.tail, 0));
  const radius = clamp3(finite(options.radius, 0.075), 0, 0.6), power = clamp3(finite(options.power, 1), 0, 2);
  const emission = clamp3(finite(options.emission, 0.32), 0, 4);
  if (head <= tail || radius <= 0 || power <= 0) return;
  const palette = options.palette?.length ? options.palette : LASER_PALETTE_3D;
  const tone = (fraction: number) => palette[Math.round(fraction * (palette.length - 1))];
  const a = beamPoint3D(frame, tail), b = beamPoint3D(frame, head), alpha = Math.min(1, power);
  p.line(a, b, radius * 3.1, tone(0.46), alpha * 0.18, emission * power * 0.28);
  p.line(a, b, radius * 1.8, tone(0.66), alpha * 0.88, emission * power * 0.6);
  p.line(a, b, radius, tone(1), alpha, emission * power);
}
