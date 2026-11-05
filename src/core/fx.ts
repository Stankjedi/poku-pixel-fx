// Frames and live effect instances.

import { defineImpactContact2D, type ImpactContact2D } from "./impact-contact.js";
import { Painter, type PaintFrame } from "./painter.js";
import { resetSurfaceLight2D } from "../render/surface2d.js";

export type DrawLayer = "back" | "front";
export interface EffectOptions {
  x?: number; y?: number; flip?: boolean; angle?: number; light?: number; actor?: unknown;
  /** Refined simulated sparks by default; classic preserves the original catalog particle drawing. */
  particleStyle?: "refined" | "classic";
  /** Optional host camera response multiplier. Zero disables camera motion without changing art. */
  cameraMotion?: number;
  [key: string]: unknown;
}
export interface EffectMeta {
  duration?: number; loop?: boolean; actor?: number | boolean; options?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface EffectImplementation<O extends EffectOptions = EffectOptions> {
  update?: (dt: number, options: O) => void;
  /** Absolute presentation clock for composition schedulers. Takes precedence over update;
   * children must use createFx so their simulation still consumes only complete fixed ticks. */
  advanceTime?: (time: number, options: O) => void;
  draw: (painter: Painter, time: number, options: O) => void;
  drawBack?: (painter: Painter, time: number, options: O) => void;
  /** Optional complete deterministic state, including RNG and pending spawns. Both methods are required together. */
  captureState?: () => unknown;
  restoreState?: (state: unknown) => void;
}
export interface EffectCheckpoint {
  schema:'poku.fx-checkpoint/v1';time:number;timeError:number;tick:number;stopAt:number|null;state:unknown;
}
export interface EffectModule<O extends EffectOptions = any> {
  meta?: EffectMeta;
  /** Pure native-pixel whole-scene offset. Drawing and sprite sheets remain unshifted. */
  cameraShake?: (time: number, options: O) => readonly [number, number];
  /** Contact facts resolved from effect options, in parent-local pixels. No response is automatic. */
  contacts?: (options: O) => readonly ImpactContact2D[];
  create?: (options: O) => EffectImplementation<O>;
  draw?: EffectImplementation<O>["draw"];
  drawBack?: EffectImplementation<O>["drawBack"];
  update?: EffectImplementation<O>["update"];
  advanceTime?: EffectImplementation<O>["advanceTime"];
}
export interface EffectInstance {
  /** Continuous presentation time. Simulation only advances on complete 120 Hz ticks. */
  readonly t: number; readonly tick: number; readonly simulatedTime: number;
  readonly shake: readonly [number, number]; readonly contacts: readonly ImpactContact2D[]; meta: EffectMeta; options: EffectOptions;
  update(dt: number): void; draw(frame: PaintFrame, layer?: DrawLayer, parent?: EffectDrawContext): void; stop(): void; done(): boolean;
  readonly supportsCheckpoint:boolean;
  capture():EffectCheckpoint;
  restore(snapshot:EffectCheckpoint):void;
}
/** Parent-local placement and style for a nested effect. A Painter satisfies this interface. */
export interface EffectDrawContext {
  tx: number; ty: number; fx: number; cs: number; sn: number;
  fade: number; lightK: number; particleStyle?: "refined" | "classic";
}
const drawState = (p: Painter) => ({ tx: p.tx, ty: p.ty, fx: p.fx, cs: p.cs, sn: p.sn,
  fade: p.fade, lightK: p.lightK, particleStyle: p.particleStyle, layer: p.layer });
import { clamp } from "./math.js";
import { stockActor } from "./actor.js";
import { fit, toHex } from "./color.js";

/**
 * A frame: w x h pixels whose top-left sits at (ox, oy) in world space. `color` holds opaque pixels,
 * `light` additive glow; composite() puts them together. Same shape as Sprite Fusion's VFX frames.
 */
export function createFrame(w: number, h: number, ox = 0, oy = 0): PaintFrame {
  return { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
}
export function clearFrame(f: PaintFrame) {
  f.color.fill(0);
  f.light.fill(0);
  f.hdrLight?.fill(0);
  for(const mask of Object.values((f as PaintFrame & {semanticMasks?:Record<string,Uint8Array>}).semanticMasks??{}))mask.fill(0);
  resetSurfaceLight2D(f);
  return f;
}

const painters = new WeakMap<PaintFrame, Painter>();
/** The painter for a frame (one per frame, reused). */
export function painterFor(frame: PaintFrame) {
  let p = painters.get(frame);
  if (!p) painters.set(frame, (p = new Painter(frame)));
  return p.reset();
}

const FADE = 0.3;
/** One shared simulation clock for live hosts, chains, and offline exports. No catch-up time is dropped. */
export const FX_TICK_RATE = 120;
export const FX_TICK_SECONDS = 1 / FX_TICK_RATE;

const isRamp = (v: unknown): v is (number | string)[] => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "number" || /^#[0-9a-f]{3,8}$/i.test(c as string));

/**
 * An effect's options: its defaults with the caller's on top. Any color ramp (palette, or another ramp option
 * like dust or smoke) of a different length than its default is resampled to the default's length, so effects
 * can index steps by number whatever a caller passes.
 */
export function resolveOptions(meta: EffectMeta, o: EffectOptions = {}): EffectOptions {
  const opts = { ...(meta.options ?? {}), ...o };
  for (const [k, def] of Object.entries(meta.options ?? {}))
    if (isRamp(def) && isRamp(o[k]) && o[k].length !== def.length) opts[k] = fit(o[k], def.length).map(toHex);
  if (meta.actor && !opts.actor) opts.actor = stockActor(meta.actor === 2 ? 2 : 1);
  return opts;
}

/**
 * A live instance of an effect module: { update(dt), draw(frame, layer), stop(), done() }.
 * o: { x, y, flip, angle, seed, palette, light (glow strength), actor, ...the effect's own options }.
 * draw(frame, "back") draws what goes behind a character, "front" what goes in front, nothing both.
 */
/** Callers may override palette ramps with hex strings or packed colors. Defaults are merged at runtime. */
export type EffectInputOptions<O extends EffectOptions> = EffectOptions & {
  [K in keyof O]?: O[K] extends readonly string[] ? Array<string | number> : O[K]
};
export function createFx<O extends EffectOptions>(mod: EffectModule<O>, o: EffectInputOptions<O> = {} as EffectInputOptions<O>): EffectInstance {
  const meta = mod.meta ?? {};
  const opts = resolveOptions(meta, o) as O;
  const impl = (mod.create ? mod.create(opts) : mod) as EffectImplementation<O>;
  const contacts = Object.freeze((mod.contacts?.(opts) ?? []).map(defineImpactContact2D));
  const D = meta.duration ?? 1;
  let t = 0, timeError = 0, tick = 0, stopAt = Infinity;
  const pure=!impl.update&&!impl.advanceTime;
  const supportsCheckpoint=pure||!!(impl.captureState&&impl.restoreState);
  return {
    meta,
    contacts,
    options: opts,
    supportsCheckpoint,
    capture(){
      if(!supportsCheckpoint)throw new Error('This effect must declare captureState/restoreState before it can be checkpointed');
      return{schema:'poku.fx-checkpoint/v1',time:t,timeError,tick,stopAt:Number.isFinite(stopAt)?stopAt:null,state:pure?null:structuredClone(impl.captureState!())};
    },
    restore(snapshot){
      if(!supportsCheckpoint)throw new Error('This effect does not support checkpoints');
      if(snapshot.schema!=='poku.fx-checkpoint/v1'||![snapshot.time,snapshot.timeError].every(Number.isFinite)||snapshot.time<0||!Number.isSafeInteger(snapshot.tick)||snapshot.tick<0||snapshot.tick!==Math.floor(snapshot.time*FX_TICK_RATE+1e-9)||(snapshot.stopAt!==null&&(!Number.isFinite(snapshot.stopAt)||snapshot.stopAt<0)))throw new RangeError('Invalid effect checkpoint clock');
      if(!pure)impl.restoreState!(structuredClone(snapshot.state));
      t=snapshot.time;timeError=snapshot.timeError;tick=snapshot.tick;stopAt=snapshot.stopAt??Infinity;
    },
    get t() {
      return t;
    },
    get tick() { return tick; },
    get simulatedTime() { return tick / FX_TICK_RATE; },
    get shake(): readonly [number, number] {
      const strength = opts.cameraMotion ?? 1;
      if (!Number.isFinite(strength) || strength < 0) throw new RangeError("cameraMotion must be finite and non-negative");
      if (!mod.cameraShake || strength === 0 || (!meta.loop && t >= D) || t - stopAt >= FADE) return [0, 0];
      const offset = mod.cameraShake(meta.loop ? t % D : t, opts);
      if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) throw new RangeError("cameraShake must return two finite pixel offsets");
      const fade = stopAt === Infinity ? 1 : clamp(1 - (t - stopAt) / FADE);
      return [Math.round(offset[0] * strength * fade), Math.round(offset[1] * strength * fade)];
    },
    update(dt: number) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
      if (dt === 0) return;
      // Compensated addition keeps the presentation clock independent of host frame partitions.
      // Fractional ticks stay pending: RNG, spawning and collisions never see a host-sized step.
      const part = dt - timeError, next = t + part;
      timeError = (next - t) - part;
      const boundary = Math.round(next * FX_TICK_RATE) / FX_TICK_RATE;
      t = Math.abs(next - boundary) <= 1e-12 ? boundary : next;
      // Snap only numerical noise around an exact tick; retain it in the
      // compensation so repeated presentation snaps cannot discard elapsed time.
      timeError += t - next;
      const target = Math.floor(t * FX_TICK_RATE + 1e-9);
      // A timeline has no physics of its own. It must see fractional presentation
      // time too, so an authored cue can begin between two simulation ticks.
      // Its child instances keep their own fixed-step accumulators.
      if (impl.advanceTime) { impl.advanceTime(t, opts); tick = target; return; }
      if (!impl.update) { tick = target; return; }
      while (tick < target) {
        impl.update(FX_TICK_SECONDS, opts);
        tick++;
      }
    },
    draw(frame: PaintFrame, layer?: DrawLayer, parent?: EffectDrawContext) {
      // The parent can be the same cached Painter. Capture it before painterFor resets it.
      const inherited = parent ? { tx: parent.tx, ty: parent.ty, fx: parent.fx, cs: parent.cs, sn: parent.sn,
        fade: parent.fade, lightK: parent.lightK, particleStyle: parent.particleStyle } : undefined;
      const previous = inherited ? painters.get(frame) : undefined;
      const saved = previous ? drawState(previous) : undefined;
      const p = painterFor(frame);
      const x = opts.x ?? 0, y = opts.y ?? 0, angle = opts.angle ?? 0;
      if (inherited) {
        const { tx, ty, fx: sign, cs, sn } = inherited;
        p.place(tx + sign * x * cs - y * sn, ty + sign * x * sn + y * cs,
          (sign < 0) !== !!opts.flip, Math.atan2(sn, cs) + sign * angle);
      } else p.place(x, y, !!opts.flip, angle);
      p.fade = (inherited?.fade ?? 1) * (stopAt === Infinity ? 1 : clamp(1 - (t - stopAt) / FADE));
      p.lightK = (inherited?.lightK ?? 1) * (opts.light ?? 1);
      p.particleStyle = opts.particleStyle ?? inherited?.particleStyle ?? "refined";
      const tt = meta.loop ? t % D : Math.min(t, D);
      try {
        if (layer !== "front" && impl.drawBack) {
          p.layer = "back";
          impl.drawBack(p, tt, opts);
        }
        if (layer !== "back") {
          p.layer = "front";
          impl.draw(p, tt, opts);
        }
      } finally {
        // Nested draws must not change the next sibling or the parent's continuation.
        if (saved) Object.assign(p, saved);
      }
    },
    /** Let it end: loops fade out, one-shots cut short. */
    stop() {
      if (stopAt === Infinity) stopAt = t;
    },
    done() {
      return t - stopAt >= FADE || (!meta.loop && t >= D);
    },
  };
}

/**
 * Color over a background, plus light, into RGBA bytes (a Uint8ClampedArray or Buffer, w * h * 4).
 * bg: null for transparent, a color number, or a Uint32Array of the frame's size. Over transparency, light
 * becomes color with alpha (its brightest channel), which reads as additive over dark backgrounds.
 */
export function composite<T extends Uint8Array | Uint8ClampedArray>(f: PaintFrame, out: T, bg: number | Uint32Array | null = null, lightK = 1): T {
  const n = f.w * f.h, C = f.color, L = f.light, flat = typeof bg === "number";
  for (let i = 0; i < n; i++) {
    const c = C[i], l = L[i] & 0xffffff;
    let r, g, b, a;
    const ca = c >>> 24;
    if (ca === 255) {
      r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; a = 255;
    } else if (bg === null) {
      r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; a = ca;
    } else {
      const k = flat ? bg : bg[i], f = ca / 255;
      r = (c & 255) * f + (k & 255) * (1 - f); g = ((c >>> 8) & 255) * f + ((k >>> 8) & 255) * (1 - f);
      b = ((c >>> 16) & 255) * f + ((k >>> 16) & 255) * (1 - f); a = 255;
    }
    if (l) {
      const lr = (l & 255) * lightK, lg = ((l >>> 8) & 255) * lightK, lb = ((l >>> 16) & 255) * lightK;
      if (a < 255) {
        const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
        const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
        if (na > 0) { r = Math.min(255, pr / na); g = Math.min(255, pg / na); b = Math.min(255, pb / na); a = na * 255; }
      } else {
        r = Math.min(255, r + lr); g = Math.min(255, g + lg); b = Math.min(255, b + lb);
      }
    }
    const j = i * 4;
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = a;
  }
  return out;
}

/** Shared preview/host guard. Camera offsets affect the full composited scene only. */
export function sceneCameraOffset(offset: readonly [number, number], reducedMotion = false, transparent = false): readonly [number, number] {
  if (reducedMotion || transparent) return [0, 0];
  if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) throw new RangeError("Scene offset needs two finite pixel coordinates");
  return [Math.round(offset[0]), Math.round(offset[1])];
}
