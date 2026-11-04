// Restorative target interaction. This is not an impact: no recoil, hit-stop, debris or camera kick.
import { clamp, smooth, lerp } from './math.js';

export interface RestorationTarget2D {
  x: number; y: number;
  mask: { w: number; h: number; data: ArrayLike<number> };
  pixels?: ArrayLike<number>;
  chest?: readonly number[];
}
export interface RestorationTiming2D {
  /** The first upward movement, the restoration beat, the end of the rise, and its quiet release. */
  startsAt: number; pulseAt: number; liftedAt: number; endsAt: number;
}
export interface RestorationCell2D { readonly x: number; readonly y: number; readonly color: number; readonly edge: boolean }
export interface RestorationSample2D {
  readonly active: boolean;
  readonly sweepY: number;
  /** 0..1 rise, a soft single chest beat, and release coverage. All seekable. */
  readonly progress: number; readonly pulse: number; readonly coverage: number;
}
export interface RestorationField2D {
  readonly cells: readonly RestorationCell2D[];
  readonly timing: Readonly<RestorationTiming2D>;
  readonly top: number; readonly bottom: number; readonly centerX: number;
  readonly chest: readonly [number, number];
  /** Silhouette-relative horizontal span. Sparse rows fall back to the nearest occupied row. */
  spanAt(y: number): readonly [number, number];
  sample(time: number): RestorationSample2D;
  /** A narrow travelling response, not an opaque full-body white flash. */
  responseAt(y: number, time: number): number;
}

/** Validate and snapshot a non-damaging restoration schedule for runtime or sprite metadata. */
export function defineRestorationTiming2D(input: RestorationTiming2D): Readonly<RestorationTiming2D> {
  const { startsAt, pulseAt, liftedAt, endsAt } = input;
  if (![startsAt, pulseAt, liftedAt, endsAt].every(Number.isFinite) || startsAt < 0 || !(startsAt < pulseAt && pulseAt < liftedAt && liftedAt < endsAt))
    throw new RangeError('Restoration timing must be finite and ordered: start < pulse < lift < end');
  return Object.freeze({ startsAt, pulseAt, liftedAt, endsAt });
}

/** Snapshot a target's mask/pixels in local coordinates. Rebuild when its silhouette changes.
 * Moving the instance via fx.options.x/y keeps every part attached; body poses can use act.onBody.
 * One shared pulseAt synchronizes body recovery, the chest beat and host-side restoration events. */
export function restorationField2D(target: RestorationTarget2D, input: RestorationTiming2D): RestorationField2D {
  const { x, y, mask } = target;
  if (![x, y, mask.w, mask.h].every(Number.isFinite) || !Number.isInteger(mask.w) || !Number.isInteger(mask.h)
    || mask.w < 1 || mask.h < 1 || mask.w > 2048 || mask.h > 2048 || mask.data.length !== mask.w * mask.h
    || (target.pixels && target.pixels.length !== mask.data.length)) throw new RangeError('Restoration target needs finite placement and a complete 1..2048 pixel mask');
  const timing = defineRestorationTiming2D(input), { startsAt, pulseAt, liftedAt, endsAt } = timing;
  const cells: RestorationCell2D[] = [], rows = new Map<number, [number, number]>();
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < mask.w && j < mask.h && mask.data[j * mask.w + i] > 0;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let j = 0; j < mask.h; j++) for (let i = 0; i < mask.w; i++) if (inside(i, j)) {
    const px = x + i, py = y + j, edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
    cells.push(Object.freeze({ x: px, y: py, edge, color: target.pixels?.[j * mask.w + i] ?? 0 }));
    left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
    const row = rows.get(py); if (row) row[1] = px; else rows.set(py, [px, px]);
  }
  if (!cells.length) throw new RangeError('Restoration target must contain at least one occupied pixel');
  const centerX = (left + right) / 2;
  const chest: readonly [number, number] = Object.freeze([
    Number.isFinite(target.chest?.[0]) ? clamp(target.chest![0], left, right) : centerX,
    Number.isFinite(target.chest?.[1]) ? clamp(target.chest![1], top, bottom) : lerp(bottom, top, .65),
  ]);
  // Freeze the returned row spans too: callers must not be able to move another instance's attachment.
  for (const row of rows.values()) Object.freeze(row);
  const spanAt = (height: number): readonly [number, number] => {
    if (!Number.isFinite(height)) throw new RangeError('Restoration row must be finite');
    let best = rows.values().next().value!, distance = Infinity;
    for (const [rowY, span] of rows) { const d = Math.abs(rowY - height); if (d < distance) { distance = d; best = span; } }
    return best;
  };
  const sample = (time: number): RestorationSample2D => {
    if (!Number.isFinite(time)) throw new RangeError('Restoration time must be finite');
    const sweepY = time <= pulseAt
      ? lerp(bottom + 1, chest[1], smooth(startsAt, pulseAt, time))
      : lerp(chest[1], top - 5, smooth(pulseAt, liftedAt, time));
    return Object.freeze({ active: time > startsAt && time < endsAt, sweepY,
      progress: clamp((bottom + 1 - sweepY) / (bottom + 6 - top)),
      // Gradual attack followed by a longer soft release. No impact-shaped white frame.
      pulse: smooth(Math.max(startsAt, pulseAt - .13), pulseAt, time) * (1 - smooth(pulseAt, Math.min(liftedAt, pulseAt + .27), time)),
      coverage: smooth(startsAt, Math.min(pulseAt, startsAt + .14), time) * (1 - smooth(liftedAt, endsAt, time)),
    });
  };
  return Object.freeze({ cells: Object.freeze(cells), timing, top, bottom, centerX, chest, spanAt, sample,
    responseAt(height: number, time: number) {
      if (!Number.isFinite(height)) throw new RangeError('Restoration response row must be finite');
      const state = sample(time), distance = height - state.sweepY;
      return state.coverage * (Math.exp(-distance * distance / 18) * .72 + .12 * state.pulse * Math.exp(-((height - chest[1]) ** 2) / 32));
    },
  });
}

/** Half-open event interval: a catch-up update crosses the same healing beat exactly once.
 * This only returns timing evidence. Applying HP/cleanse is the host game's responsibility. */
export function restorationPulseCrossed(timing: RestorationTiming2D, previous: number, current: number): boolean {
  if (![timing.pulseAt, previous, current].every(Number.isFinite) || current < previous) throw new RangeError('Restoration event interval must be finite and forward');
  return previous < timing.pulseAt && current >= timing.pulseAt;
}
