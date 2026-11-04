import { type Camera3D, Painter3D } from "./painter.js";

export interface Cue3D { at: number; type: "hit" | "flash" | "shake" | "sound"; value?: number }
export interface Stage3D { at: number; label: string }
export interface EffectMeta3D<O> {
  id: string;
  name: string;
  description: string;
  duration: number;
  loop: boolean;
  options: O;
  stages?: readonly Stage3D[];
  cues?: readonly Cue3D[];
}
export interface Effect3D {
  update(dt: number): void;
  draw(painter: Painter3D): void;
  /** Derive a frame camera from the unchanged user camera before drawing any geometry. */
  camera?(base: Camera3D): Camera3D;
}
export interface EffectModule3D<O extends object> {
  meta: EffectMeta3D<O>;
  create(options: O): Effect3D;
}
export interface FxInstance3D<O extends object> {
  readonly t: number;
  readonly meta: EffectMeta3D<O>;
  readonly options: O;
  update(dt: number): void;
  draw(painter: Painter3D): void;
  camera(base: Camera3D): Camera3D;
  restart(options?: Partial<O>): void;
  seek(seconds: number): void;
  /** Cues crossed by fixed steps, including t=0 on the first step of each playback. Seek is silent. */
  drainCues(): Cue3D[];
  stage(): string;
  done(): boolean;
}

/** Fixed-step (120 Hz) effect player. Seek always reconstructs from the seed for repeatable exports. */
export function createFx3D<O extends object>(mod: EffectModule3D<O>, options: Partial<O> = {}): FxInstance3D<O> {
  const opts: O = { ...mod.meta.options, ...options };
  const hz = 120, tick = 1 / hz;
  let impl = mod.create(opts), steps = 0, accumulator = 0, nextCue = 0;
  // A cursor, rather than overlapping float intervals, makes every cue single-fire.
  // Sorting a copy keeps author metadata intact and preserves simultaneous cue order.
  const cues = [...(mod.meta.cues ?? [])].filter(cue => cue.at >= 0).sort((a, b) => a.at - b.at);
  const pending: Cue3D[] = [];
  const durationSteps = Math.max(1, Math.ceil(mod.meta.duration * hz));
  const advance = () => {
    if (mod.meta.loop && steps >= durationSteps) {
      impl = mod.create(opts); steps = 0; nextCue = 0;
    }
    if (!mod.meta.loop && steps >= durationSteps) return;
    impl.update(tick);
    steps++;
    const to = steps / hz;
    while (nextCue < cues.length && cues[nextCue].at <= to + 1e-9) pending.push(cues[nextCue++]);
  };
  const reset = () => { impl = mod.create(opts); steps = 0; accumulator = 0; nextCue = 0; pending.length = 0; };
  return {
    meta: mod.meta,
    options: opts,
    get t() { return Math.min(steps * tick + accumulator, mod.meta.duration); },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be a finite, non-negative number");
      if (!mod.meta.loop && steps >= durationSteps) return;
      accumulator += dt;
      // Preserve infinite looping effects. Bound only completed one-shots.
      let n = Math.floor((accumulator + 1e-10) / tick);
      accumulator -= n * tick;
      if (!mod.meta.loop && n >= durationSteps - steps) {
        n = durationSteps - steps;
        accumulator = 0;
      }
      while (n-- > 0) advance();
    },
    draw(painter) { impl.draw(painter); },
    camera(base) { return impl.camera?.(base) ?? base; },
    restart(next) { if (next) Object.assign(opts, next); reset(); },
    seek(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid seek position");
      reset();
      const ticks = Math.floor(Math.min(seconds, mod.meta.duration) * hz + 1e-10);
      for (let i = 0; i < ticks; i++) advance();
      accumulator = Math.max(0, Math.min(seconds, mod.meta.duration) - ticks / hz);
      // A seek consumes cues through the requested position, even seek(0) or a
      // fractional tick, so resuming cannot dispatch impacts behind the playhead.
      while (nextCue < cues.length && cues[nextCue].at <= Math.min(seconds, mod.meta.duration) + 1e-9) nextCue++;
      pending.length = 0; // Scrubbing does not dispatch game-impact cues.
    },
    drainCues() { return pending.splice(0, pending.length); },
    stage() {
      let label = "";
      for (const s of mod.meta.stages ?? []) if (s.at <= steps / hz) label = s.label;
      return label;
    },
    done() { return !mod.meta.loop && steps >= durationSteps; },
  };
}
