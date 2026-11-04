// Moves: effects composed in parent-local space, each with its own activation window.
import { createFx, type EffectModule, type EffectOptions, type EffectDrawContext } from "./fx.js";
import { smooth } from "./math.js";
import type { Frame, DrawLayer } from "../index.js";
export type CuePosition = number | ((time: number) => number);
export interface ChainCue extends Omit<EffectOptions, "x" | "y"> {
  fx: EffectModule; t?: number; until?: number; x?: CuePosition; y?: CuePosition;
  /** Smooth fade durations in seconds, measured inside the cue's active window. */
  fadeIn?: number; fadeOut?: number;
}
interface CueInstance {
  fx: EffectModule; t: number; until: number; x: CuePosition; y: CuePosition;
  fadeIn: number; fadeOut: number; opts: EffectOptions;
  inst: ReturnType<typeof createFx> | null; over: boolean;
}
export interface ChainPainter extends EffectDrawContext { frame: Frame }
export type PoseKey = [number, Record<string, any>, string?];
type Hit = { t: number; [key: string]: unknown };
// Fixed-step subdivision accumulates tiny roundoff. Treat a nanosecond as the boundary,
// without consuming an animation frame or forwarding time outside the active window.
const reached = (time: number, boundary: number) => time >= boundary - 1e-9;

/**
 * Compose cues in the move's local space. Position callbacks use move time, in seconds.
 * Child light multiplies parent light; parent fades and transforms apply to every layer.
 * A parent's palette is a fallback; an explicit cue palette or particle style wins.
 * until is exclusive. fadeOut ends at until, or a one-shot's natural end if earlier.
 */
export function chain(cues: ChainCue[]) {
  return (o: Record<string, any>) => {
    const list: CueInstance[] = cues.map(({ fx, t = 0, until = Infinity, x = 0, y = 0, fadeIn = 0, fadeOut = 0, ...opts }, i) => {
      if (!Number.isFinite(t) || t < 0 || !(until >= t) || (!Number.isFinite(until) && until !== Infinity)
        || !Number.isFinite(fadeIn) || fadeIn < 0 || !Number.isFinite(fadeOut) || fadeOut < 0)
        throw new RangeError("Cue times and fades must be non-negative; until must follow t");
      const end = fx.meta?.loop ? until : Math.min(until, t + (fx.meta?.duration ?? 1));
      const options = { ...(o.palette === undefined ? {} : { palette: o.palette }), ...opts, seed: opts.seed ?? (o.seed ?? 1) + i };
      return { fx, t, until: end, x, y, fadeIn, fadeOut, opts: options,
        inst: t === 0 && end > 0 ? createFx(fx, options) : null, over: end <= t };
    });
    let t = 0;
    const at = (v: CuePosition) => typeof v === "function" ? v(t) : v;
    const each = (p: ChainPainter, layer: DrawLayer) => {
      for (const c of list) {
        if (!c.inst || c.over) continue;
        c.inst.options.x = at(c.x);
        c.inst.options.y = at(c.y);
        const enter = c.fadeIn > 0 ? smooth(0, c.fadeIn, t - c.t) : 1;
        const leave = c.fadeOut > 0 ? smooth(0, c.fadeOut, c.until - t) : 1;
        c.inst.draw(p.frame, layer, { tx: p.tx, ty: p.ty, fx: p.fx, cs: p.cs, sn: p.sn,
          fade: p.fade * enter * leave, lightK: p.lightK, particleStyle: p.particleStyle });
      }
    };
    return {
      update(dt: number) {
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
        const previous = t;
        t += dt;
        for (const c of list) {
          if (c.over || !reached(t, c.t)) continue;
          if (!c.inst) c.inst = createFx(c.fx, c.opts);
          const start = Math.max(previous, c.t), end = Math.min(t, c.until);
          if (end > start) c.inst.update(end - start);
          if (reached(t, c.until) || (c.inst.done() && !c.fx.meta?.loop)) c.over = true;
        }
      },
      drawBack: (p: ChainPainter) => each(p, "back"),
      draw: (p: ChainPainter) => each(p, "front"),
    };
  };
}

/** Reuse an act's keys in a longer move: later by dt, moved along by dx, with anything else laid over each pose. */
export const shiftKeys = (keys: PoseKey[], dt: number, { dx = 0, ...over }: { dx?: number; [key: string]: unknown } = {}) => keys.map(([t, pose, how]) => [t + dt, { ...pose, ...over, x: (pose.x ?? 0) + dx }, how]);
/** The same for hits. */
export const shiftHits = <T extends Hit>(hits: T[], dt: number) => hits.map((h) => ({ ...h, t: h.t + dt }));

