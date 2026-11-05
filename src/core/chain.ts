// Moves: effects composed in parent-local space, each with its own activation window.
import { createFx, type EffectModule, type EffectOptions, type EffectDrawContext } from "./fx.js";
import { clamp } from "./math.js";
import type { Frame, DrawLayer } from "../index.js";
export type CuePosition = number | ((time: number) => number);
export interface ChainCue extends Omit<EffectOptions, "x" | "y"> {
  fx: EffectModule; t?: number; until?: number; x?: CuePosition; y?: CuePosition;
  /** Smooth fade durations in seconds, measured inside the cue's active window. */
  fadeIn?: number; fadeOut?: number;
  /** Conservative effect-local bounds INCLUDING any body outside meta.size; omit when unknown. */
  cullBounds?: {x:number;y:number;width:number;height:number};
  /** Optical halo, in local pixels. Culling never skips simulation or event updates. */
  cullHalo?:number;
}
interface CueInstance {
  fx: EffectModule; t: number; until: number; x: CuePosition; y: CuePosition;
  fadeIn: number; fadeOut: number; opts: EffectOptions;
  inst: ReturnType<typeof createFx> | null; over: boolean;
  cullBounds?: ChainCue['cullBounds'];cullHalo:number;
}
export interface ChainPainter extends EffectDrawContext { frame: Frame }
export type PoseKey = [number, Record<string, any>, string?];
type Hit = { t: number; [key: string]: unknown };
// Cancel subtraction noise in decimal cue intervals before evaluating smoothstep.
// 1e-12 progress is far below packed coverage or Float32 HDR precision; exact
// half fades must retain their mathematical 128/255 coverage rounding.
const fade = (elapsed: number, duration: number) => {
  const u = Math.round(clamp(elapsed / duration) * 1e12) / 1e12;
  return u * u * (3 - 2 * u);
};

/**
 * Compose cues in the move's local space. Position callbacks use move time, in seconds.
 * Child light multiplies parent light; parent fades and transforms apply to every layer.
 * A parent's palette is a fallback; an explicit cue palette or particle style wins.
 * until is exclusive. fadeOut ends at until, or a one-shot's natural end if earlier.
 */
export function chain(cues: ChainCue[]) {
  return (o: Record<string, any>) => {
    const list: CueInstance[] = cues.map(({ fx, t = 0, until = Infinity, x = 0, y = 0, fadeIn = 0, fadeOut = 0,cullBounds,cullHalo=0, ...opts }, i) => {
      if (!Number.isFinite(t) || t < 0 || !(until >= t) || (!Number.isFinite(until) && until !== Infinity)
        || !Number.isFinite(fadeIn) || fadeIn < 0 || !Number.isFinite(fadeOut) || fadeOut < 0)
        throw new RangeError("Cue times and fades must be non-negative; until must follow t");
      if(!Number.isFinite(cullHalo)||cullHalo<0||cullBounds&&(!Object.values(cullBounds).every(Number.isFinite)||cullBounds.width<0||cullBounds.height<0))throw new RangeError('Invalid conservative cue bounds');
      const end = fx.meta?.loop ? until : Math.min(until, t + (fx.meta?.duration ?? 1));
      const options = { ...(o.palette === undefined ? {} : { palette: o.palette }), ...opts, seed: opts.seed ?? (o.seed ?? 1) + i };
      return { fx, t, until: end, x, y, fadeIn, fadeOut, opts: options,cullBounds,cullHalo,
        inst: t === 0 && end > 0 ? createFx(fx, options) : null, over: end <= t };
    });
    let t = 0, timeError = 0;
    const at = (v: CuePosition) => typeof v === "function" ? v(t) : v;
    const each = (p: ChainPainter, layer: DrawLayer) => {
      for (const c of list) {
        if (!c.inst || c.over) continue;
        c.inst.options.x = at(c.x);
        c.inst.options.y = at(c.y);
        if(c.cullBounds){
          const b=c.cullBounds,h=c.cullHalo,a=c.inst.options.angle??0,cs=Math.cos(a),sn=Math.sin(a),sign=c.inst.options.flip?-1:1;
          let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
          for(let k=0;k<4;k++){
            const x=(k&1?b.x+b.width+h:b.x-h)*sign,y=k&2?b.y+b.height+h:b.y-h;
            const lx=(c.inst.options.x??0)+x*cs-y*sn,ly=(c.inst.options.y??0)+x*sn+y*cs;
            const sx=p.tx+lx*p.fx*p.cs-ly*p.sn,sy=p.ty+lx*p.fx*p.sn+ly*p.cs;
            left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);
          }
          if(right<=p.frame.ox||bottom<=p.frame.oy||left>=p.frame.ox+p.frame.w||top>=p.frame.oy+p.frame.h)continue;
        }
        const enter = c.fadeIn > 0 ? fade(t - c.t, c.fadeIn) : 1;
        const leave = c.fadeOut > 0 ? fade(c.until - t, c.fadeOut) : 1;
        c.inst.draw(p.frame, layer, { tx: p.tx, ty: p.ty, fx: p.fx, cs: p.cs, sn: p.sn,
          fade: p.fade * enter * leave, lightK: p.lightK, particleStyle: p.particleStyle });
      }
    };
    const advanceTime = (time: number) => {
      const previous = t;
      t = time;
      // Scheduling follows the continuous parent clock; each child retains the
      // fractional simulation remainder. Drawing never creates or advances it.
      for (const c of list) {
        if (c.over || t < c.t) continue;
        if (!c.inst) c.inst = createFx(c.fx, c.opts);
        const start = Math.max(previous, c.t), end = Math.min(t, c.until);
        if (end > start) c.inst.update(end - start);
        if (t >= c.until || (c.inst.done() && !c.fx.meta?.loop)) c.over = true;
      }
    };
    return {
      advanceTime,
      // Retain the standalone chain API. createFx uses advanceTime instead of
      // quantizing this scheduler through EffectImplementation.update.
      update(dt: number) {
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
        const part = dt - timeError, next = t + part;
        timeError = (next - t) - part;
        advanceTime(next);
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

