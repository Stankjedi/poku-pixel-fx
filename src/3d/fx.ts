import { Painter3D } from "./painter.js";

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
  restart(options?: Partial<O>): void;
  seek(seconds: number): void;
  drainCues(): Cue3D[];
  stage(): string;
  done(): boolean;
}

/** Fixed-step (120 Hz) effect player. Seek always reconstructs from the seed for repeatable exports. */
export function createFx3D<O extends object>(mod: EffectModule3D<O>, options: Partial<O> = {}): FxInstance3D<O> {
  const opts: O = { ...mod.meta.options, ...options };
  const hz = 120, tick = 1 / hz;
  let impl = mod.create(opts), steps = 0, accumulator = 0;
  const pending: Cue3D[] = [];
  const durationSteps = Math.max(1, Math.ceil(mod.meta.duration * hz));
  const advance = () => {
    if (mod.meta.loop && steps >= durationSteps) {
      impl = mod.create(opts); steps = 0;
    }
    if (!mod.meta.loop && steps >= durationSteps) return;
    const from = steps / hz;
    impl.update(tick);
    steps++;
    const to = steps / hz;
    for (const cue of mod.meta.cues ?? []) if (cue.at > from && cue.at <= to + 1e-9) pending.push(cue);
  };
  const reset = () => { impl = mod.create(opts); steps = 0; accumulator = 0; pending.length = 0; };
  return {
    meta: mod.meta,
    options: opts,
    get t() { return Math.min(steps * tick + accumulator, mod.meta.duration); },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be a finite, non-negative number");
      accumulator += dt;
      // Prevent numerical residue from causing different step counts at 60 vs 120 fps.
      let n = Math.floor((accumulator + 1e-10) / tick);
      accumulator -= n * tick;
      while (n-- > 0) advance();
    },
    draw(painter) { impl.draw(painter); },
    restart(next) { if (next) Object.assign(opts, next); reset(); },
    seek(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid seek position");
      reset();
      const ticks = Math.floor(Math.min(seconds, mod.meta.duration) * hz + 1e-10);
      for (let i = 0; i < ticks; i++) advance();
      accumulator = Math.max(0, Math.min(seconds, mod.meta.duration) - ticks / hz);
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
