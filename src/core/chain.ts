// Moves: several effects played as one. A cue says which effect, when, where and for how long; a projectile is just an
// effect whose x is a function of time. It's an ordinary effect from the outside: it plays, recolors and exports.

import { createFx } from "./fx.js";
import type { Frame, DrawLayer } from "../index.js";
type Position = number | ((time: number) => number);
interface Cue { fx: any; t?: number; until?: number; x?: Position; y?: Position; flip?: boolean; [key: string]: unknown }
interface CueInstance { fx: any; t: number; until: number; x: Position; y: Position; flip: boolean; opts: Record<string, unknown>; inst: ReturnType<typeof createFx> | null; over: boolean }
export interface ChainPainter { frame: Frame; tx: number; ty: number; fx: number; cs: number; sn: number; fade: number; lightK: number }
export type PoseKey = [number, Record<string, any>, string?];
type Hit = { t: number; [key: string]: unknown };

/**
 * create(o) for a list of cues: { fx (an effect module), t (when it starts), until (cut it off here), x, y (numbers, or
 * functions of the move's time, local space), flip, ...any of that effect's options }.
 */
export function chain(cues: Cue[]) {
  return (o: Record<string, any>) => {
    const list: CueInstance[] = cues.map(({ fx, t, until, x, y, flip, ...opts }, i) => ({ fx, t: t ?? 0, until: until ?? Infinity, x: x ?? 0, y: y ?? 0, flip: !!flip, opts: { ...opts, seed: (o.seed ?? 1) + i }, inst: null, over: false }));
    let t = 0;
    const at = (v: Position) => (typeof v === "function" ? v(t) : v);
    const each = (p: ChainPainter, layer: DrawLayer) => {
      const { frame, tx, ty, fx: sign, cs, sn, fade, lightK } = p;
      for (const c of list) {
        if (!c.inst || c.over) continue;
        c.inst.options.x = tx + sign * at(c.x);
        c.inst.options.y = ty + at(c.y);
        c.inst.options.flip = sign < 0 !== c.flip;
        c.inst.draw(frame, layer);
      }
      // each one places the painter for itself: put it back for whoever draws next
      Object.assign(p, { tx, ty, fx: sign, cs, sn, fade, lightK });
    };
    return {
      update(dt: number) {
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
        const previous = t;
        t += dt;
        for (const c of list) {
          if (c.over || t < c.t) continue;
          if (!c.inst) c.inst = createFx(c.fx, c.opts);
          // Each sub-effect advances only within its activation window.
          // Crossing a cue boundary in a single update must not lose time.
          const start = Math.max(previous, c.t);
          const end = Math.min(t, c.until);
          if (end > start) c.inst.update(end - start);
          if (t >= c.until || (c.inst.done() && !c.fx.meta?.loop)) c.over = true;
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

