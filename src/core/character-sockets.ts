import { characterSocket2D, socketTransform2D, type CharacterSocket2D } from './character-animation.js';
import { composePixelTransform2D, invertPixelTransform2D, pixelTransform2D, type PixelTransform2D } from './sprite-raster.js';

export interface CharacterSocketKey2D {
  at: number;
  /** Delta: baseline socket coordinates. Override: absolute actor-local coordinates. */
  position?: readonly [number, number];
  /** Radians. Delta rotates in the baseline socket's basis; override sets the absolute heading. */
  angle?: number;
  /** Explicit paired basis; a track must use either angle keys or basis keys. */
  basisX?: readonly [number, number];
  basisY?: readonly [number, number];
  visible?: boolean;
  /** Applies to this key's authored channels until their next keys. Default is hold. */
  interpolation?: 'hold' | 'linear';
}
export interface CharacterSocketTrack2D {
  mode: 'delta' | 'override';
  keys: readonly CharacterSocketKey2D[];
}
const point = (p: readonly number[]) => p.length === 2 && p.every(Number.isFinite);
const shortestArc = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Validate portable native socket corrections without changing the source skeleton. */
export function validateCharacterSocketTrack2D(track: CharacterSocketTrack2D, duration = Infinity): void {
  if (!track || !['delta', 'override'].includes(track.mode) || !Array.isArray(track.keys) || !track.keys.length || track.keys.length > 4096) throw new RangeError('Socket track needs a mode and 1..4096 keys');
  let angles = false, bases = false;
  track.keys.forEach((key, i) => {
    if (!key || !Number.isFinite(key.at) || key.at < 0 || key.at > duration || i > 0 && key.at <= track.keys[i - 1].at || key.interpolation !== undefined && !['hold', 'linear'].includes(key.interpolation)) throw new RangeError('Socket keys must be strictly ordered within clip duration');
    if (key.position !== undefined && !point(key.position) || key.angle !== undefined && !Number.isFinite(key.angle) || key.visible !== undefined && typeof key.visible !== 'boolean') throw new RangeError('Socket key values must be finite native coordinates and boolean visibility');
    if ((key.basisX === undefined) !== (key.basisY === undefined) || key.angle !== undefined && key.basisX !== undefined) throw new RangeError('Socket keys use an angle or a paired basis, never both');
    if (key.basisX) {
      if (!point(key.basisX) || !point(key.basisY!)) throw new RangeError('Socket bases need two finite vectors');
      invertPixelTransform2D([key.basisX[0], key.basisX[1], key.basisY![0], key.basisY![1], 0, 0]);
      bases = true;
    }
    if (key.angle !== undefined) angles = true;
    if (key.position === undefined && key.angle === undefined && key.basisX === undefined && key.visible === undefined) throw new RangeError('Socket key must change a channel');
  });
  if (angles && bases) throw new RangeError('Use consistent angle or basis orientation keys in one socket track');
}
interface BasisParts { angle: number; x: number; y: number; shear: number }
function splitBasis(x: readonly [number, number], y: readonly [number, number]): BasisParts {
  const length = Math.hypot(x[0], x[1]);
  return { angle: Math.atan2(x[1], x[0]), x: length, y: (x[0] * y[1] - x[1] * y[0]) / length, shear: (x[0] * y[0] + x[1] * y[1]) / length };
}
function joinBasis(parts: BasisParts): Pick<CharacterSocketKey2D, 'basisX' | 'basisY'> {
  const c = Math.cos(parts.angle), s = Math.sin(parts.angle);
  return { basisX: [c * parts.x, s * parts.x], basisY: [c * parts.shear - s * parts.y, s * parts.shear + c * parts.y] };
}
/** Positive lengths and discrete handedness avoid a singular basis halfway through a 180-degree turn. */
function interpolateBasis(a: CharacterSocketKey2D, b: CharacterSocketKey2D, u: number): Pick<CharacterSocketKey2D, 'basisX' | 'basisY'> {
  const p = splitBasis(a.basisX!, a.basisY!), q = splitBasis(b.basisX!, b.basisY!);
  return joinBasis({ angle: p.angle + shortestArc(p.angle, q.angle) * u, x: p.x + (q.x - p.x) * u, y: Math.sign(u < 1 ? p.y : q.y) * (Math.abs(p.y) + (Math.abs(q.y) - Math.abs(p.y)) * u), shear: p.shear + (q.shear - p.shear) * u });
}
function sampleValidated(track: CharacterSocketTrack2D, time: number): CharacterSocketKey2D | null {
  if (!Number.isFinite(time)) throw new RangeError('Socket track time must be finite');
  let last: CharacterSocketKey2D | undefined;
  for (const key of track.keys) { if (key.at > time) break; last = key; }
  if (!last) return null;
  const out: CharacterSocketKey2D = { at: time, interpolation: last.interpolation ?? 'hold' };
  for (const channel of ['position', 'angle', 'basisX', 'visible'] as const) {
    let a: CharacterSocketKey2D | undefined, b: CharacterSocketKey2D | undefined;
    for (const key of track.keys) if (key[channel] !== undefined) { if (key.at <= time) a = key; else { b = key; break; } }
    if (!a) continue;
    const u = b && a.interpolation === 'linear' ? (time - a.at) / (b.at - a.at) : 0;
    if (channel === 'position') out.position = [a.position![0] + ((b?.position?.[0] ?? a.position![0]) - a.position![0]) * u, a.position![1] + ((b?.position?.[1] ?? a.position![1]) - a.position![1]) * u];
    else if (channel === 'angle') out.angle = a.angle! + (b ? shortestArc(a.angle!, b.angle!) * u : 0);
    else if (channel === 'basisX') Object.assign(out, b && u ? interpolateBasis(a, b, u) : { basisX: [...a.basisX!], basisY: [...a.basisY!] });
    else out.visible = a.visible;
  }
  return out;
}
/** Pure UI/sample helper. Before the first authored key, no correction is active. */
export function sampleCharacterSocketTrack2D(track: CharacterSocketTrack2D, time: number): CharacterSocketKey2D | null {
  validateCharacterSocketTrack2D(track);
  return sampleValidated(track, time);
}
/** Compile a private snapshot once for per-frame sampling. No caller array is retained. */
export function compileCharacterSocketTrack2D(track: CharacterSocketTrack2D, duration = Infinity): { mode: CharacterSocketTrack2D['mode']; sample(time: number): CharacterSocketKey2D | null } {
  validateCharacterSocketTrack2D(track, duration);
  const snapshot = JSON.parse(JSON.stringify(track)) as CharacterSocketTrack2D;
  return { mode: snapshot.mode, sample: time => sampleValidated(snapshot, time) };
}
/** One named socket only. It does not solve limbs or deform a mesh. */
export function applyCharacterSocketKey2D(baseline: CharacterSocket2D | undefined, value: CharacterSocketKey2D | null, mode: CharacterSocketTrack2D['mode']): CharacterSocket2D | undefined {
  if (!baseline && (!value?.position || mode !== 'override')) return undefined;
  const base = baseline ?? characterSocket2D([0, 0]);
  if (!value) return { ...base, position: [...base.position], basisX: [...base.basisX], basisY: [...base.basisY] };
  let m: PixelTransform2D;
  if (mode === 'delta') {
    const delta = value.basisX && value.basisY ? [value.basisX[0], value.basisX[1], value.basisY[0], value.basisY[1], value.position?.[0] ?? 0, value.position?.[1] ?? 0] as PixelTransform2D : pixelTransform2D(value.position?.[0] ?? 0, value.position?.[1] ?? 0, value.angle ?? 0);
    m = composePixelTransform2D(socketTransform2D(base), delta);
  } else {
    const basis = value.basisX && value.basisY ? value : value.angle === undefined ? base : joinBasis({ ...splitBasis(base.basisX, base.basisY), angle: value.angle });
    m = [basis.basisX![0], basis.basisX![1], basis.basisY![0], basis.basisY![1], value.position?.[0] ?? base.position[0], value.position?.[1] ?? base.position[1]];
  }
  return { ...base, position: [m[4], m[5]], basisX: [m[0], m[1]], basisY: [m[2], m[3]], visible: value.visible ?? base.visible };
}
