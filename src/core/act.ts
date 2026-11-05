// An act: an effect performed. The character winds up, lets go and recovers, a target takes the hit, and everything
// freezes for a moment on contact. Effects describe it as data (`export const act`), so a game with its own character
// can read the same timing. The freeze, the shake, the springy target and poses held on 12 fps steps are how Hollow Crown
// plays its skills (https://github.com/rehan-remade/hollow-crown), MIT License, Copyright (c) 2026 rehan-remade.

import { Rng, clamp } from "./math.js";
import { hex, mix } from "./color.js";
import { createFrame, clearFrame, createFx, painterFor, FX_TICK_RATE } from "./fx.js";
import { stockActor, drawActor, actorAlphaOf, HERO2, DUMMY_PAL } from "./actor.js";
import { posed, STAND, type Pose } from "./rig.js";
import type { EffectModule, EffectOptions, EffectInputOptions } from "./fx.js";
import type { PaintFrame } from "./painter.js";
import type { ImpactContact2D } from "./impact-contact.js";
import { blendOver } from "../render/coverage.js";
import { channelToLinear } from "../render/linear.js";
import { createActorAdapter2D, actorEffectOffset2D, type ActorAdapter2D, type ActorSelection2D } from "./actor-adapter.js";
import { exportLayout2D } from "../render/export.js";

type PoseKey = [number, Pose, ("out" | "in" | "line" | "snap")?];
/** A contact in effect-local seconds. at selects a target index; y is local pixels (+Y down). */
export interface ActHit { t: number; stop?: number; shake?: number; amp?: number; target?: boolean; at?: number; push?: number; straw?: number; flash?: number; skin?: string | null; shiver?: number; y?: number; contact?: ImpactContact2D }
/** Engine-independent target response. freeze is the serialized name of ActHit.stop. */
export interface ActTimingHit {
  t: number; freeze: number; shake: number; amp: number; target: boolean; at?: number;
  push: number; straw: number; flash: number; skin?: string | null; shiver: number; y: number; contact?: ImpactContact2D;
}
interface ActDust { t: number; x: number; n?: number; dir?: number; c?: string | number }
interface ActSpec { poses?: PoseKey[]; targets?: {x?:number}[]; target?: {x?:number}; hits?: ActHit[]; dust?: ActDust[]; ghost?: string | number; onBody?: boolean; follow?: number;
  /** Extra native pixels for light outside meta.size; defaults to half the larger native dimension. */
  scratchPadding?: number;
  /** Native actors: stateful silhouette transformations default to an effect-start snapshot. */
  actorSampling?: "live" | "snapshot";
}
type ActInput = Omit<ActSpec, "poses"> & { poses?: readonly (readonly (number | Pose | string)[])[] };
type ActModule<O extends EffectOptions = EffectOptions> = EffectModule<O> & { act?: ActInput; actorAlpha?: (t: number, options: any) => number; meta: NonNullable<EffectModule["meta"]> & { size: number[]; origin: number[]; options?: { seed?: number; palette?: (string | number)[] } } };
type ActOptions = EffectOptions & { seed?: number; palette?: (string | number)[]; actor?: ReturnType<typeof stockActor>;
  actorSelection?: ActorSelection2D; actorAdapter?: ActorAdapter2D };
interface Straw { x: number; y: number; vx: number; vy: number; age: number; life: number; big: boolean }
interface Speck extends Straw { c: number }
interface ActInstance { fx: ReturnType<typeof createFx>; meta: ActModule["meta"]; act: ActSpec; targets: Target[]; readonly t: number; readonly shake: number[]; readonly frozen: boolean; readonly pose: Pose | null; onHit?: (hit: ActHit) => void; update(dt: number): void; draw(frame: PaintFrame, options?: {body?:boolean;target?:boolean}): void; stop(): void; done(): boolean }


export { STAND, posed };

// ---- poses over time
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** Between two poses: numbers move, everything else changes at the later key. */
export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  const out: Record<string, any> = { ...STAND, ...a };
  const B: Record<string, any> = { ...STAND, ...b };
  for (const k of Object.keys(B)) {
    const v = B[k];
    if (typeof v === "number" && typeof out[k] === "number") out[k] = lerp(out[k], v, u);
    else if (out[k] === undefined && typeof v === "number") out[k] = v;
  }
  // what the later pose doesn't mention eases back to its default
  for (const k of ["hx", "hy", "lean", "crouch"]) if (B[k] === undefined && typeof out[k] === "number") out[k] = lerp(out[k], 0, u);
  if (B.wl === undefined && typeof out.wl === "number") out.wl = lerp(out.wl, 1, u);
  return out;
}
const eases: Record<string, (u: number) => number> = { out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u, line: (u) => u };
/**
 * The pose at time t on a track of keys [t, pose, how]: `how` says how the pose arrives: smoothly by default, "out"
 * fast then settling, "in" slowly then fast, "snap" holding the last pose and jumping on the key. Limbs move in whole
 * 12 fps steps counted from each key, so they read as held drawings; the feet's position over the floor (x, y) stays smooth.
 */
export function poseAt(track: PoseKey[], t: number): Pose {
  if (t <= track[0][0]) return track[0][1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, a] = track[i], [t1, b, how] = track[i + 1];
    if (t >= t1) continue;
    if (how === "snap") return a;
    const e = eases[how ?? ""] ?? ((u) => u * u * (3 - 2 * u));
    const stepped = t0 + Math.floor((t - t0) * 12 + 1e-6) / 12;
    const out = lerpPose(a, b, e((stepped - t0) / (t1 - t0)));
    const u = e((t - t0) / (t1 - t0));
    out.x = lerp(a.x ?? 0, b.x ?? 0, u);
    out.y = lerp(a.y ?? 0, b.y ?? 0, u);
    return out;
  }
  return track[track.length - 1][1];
}

/** Is the body between keys that hardly differ, or past the last? */
function isHeld(track: PoseKey[], t: number) {
  if (t >= track[track.length - 1][0] || t < track[0][0]) return true;
  for (let i = 0; i < track.length - 1; i++) {
    if (t >= track[i + 1][0]) continue;
    const a: Pose = { ...STAND, ...track[i][1] }, b: Pose = { ...STAND, ...track[i + 1][1] };
    return track[i + 1][0] - track[i][0] > 0.4 && ["fx", "fy", "bx", "by", "crouch", "lean", "x", "y"].every((k) => Math.abs(((a[k] as number | undefined) ?? 0) - ((b[k] as number | undefined) ?? 0)) < 1.5);
  }
  return true;
}

// ---- the target
const TW = 38, TH = 52;
const TP = Object.fromEntries(Object.entries({ ink: "#0b0a1a", wood: "#724c2e", woodL: "#a0703a", woodD: "#4e331f", straw: "#d2aa55", strawL: "#f0d98a", burlapD: "#86643a", burlap: "#b38b57", burlapL: "#c9a26c", red: "#9a2f3c", redL: "#c4434f", white: "#ffffff" }).map(([k, v]) => [k, hex(v)]));
const DUST = ["#efe7dc", "#c9bfb8", "#8f8693", "#5a5468"].map(hex);
const DUMMY = new Uint32Array(TW * TH);
(function buildDummy() {
  const px = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < TW && y < TH) DUMMY[y * TW + x] = c; };
  const R = (x: number, y: number, w: number, h: number, c: number) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  // the post and the crossbar
  R(15, 38, 8, 14, TP.ink); R(16, 34, 6, 18, TP.wood); R(16, 34, 2, 18, TP.woodL); R(20, 34, 2, 18, TP.woodD);
  R(1, 18, 36, 1, TP.ink); R(1, 23, 36, 1, TP.ink); R(1, 19, 36, 4, TP.wood); R(1, 19, 36, 1, TP.woodL); R(1, 22, 36, 1, TP.woodD);
  // straw bursting out of the ends of the arms
  for (const [bx, s] of [[0, -1], [33, 1]]) {
    R(bx, 17, 5, 8, TP.straw);
    for (const [dx, dy, c] of [[2, 16, TP.straw], [3, 15, TP.strawL], [1, 17, TP.strawL], [2, 25, TP.straw], [1, 26, TP.strawL], [3, 25, TP.burlapD], [2, 19, TP.strawL], [3, 21, TP.strawL], [1, 22, TP.burlapD], [2, 23, TP.strawL]]) px(bx + dx, dy, c);
    px(s < 0 ? bx - 1 : bx + 5, 19, TP.straw); px(s < 0 ? bx - 1 : bx + 5, 22, TP.strawL);
  }
  const sack = (x: number, y: number, w: number, h: number) => {
    R(x + 1, y, w - 2, 1, TP.ink); R(x + 1, y + h - 1, w - 2, 1, TP.ink);
    R(x, y + 1, 1, h - 2, TP.ink); R(x + w - 1, y + 1, 1, h - 2, TP.ink);
    R(x + 1, y + 1, w - 2, h - 2, TP.burlap);
    R(x + w - 4, y + 1, 3, h - 2, TP.burlapD);
    R(x + 1, y + h - 3, w - 2, 2, TP.burlapD);
    R(x + 1, y + 1, 1, h - 4, TP.burlapL); R(x + 1, y + 1, w - 6, 1, TP.burlapL);
    // the weave
    for (let j = y + 2; j < y + h - 2; j += 3) for (let i = x + 3 + (j % 2); i < x + w - 4; i += 4) px(i, j, TP.burlapD);
  };
  sack(9, 17, 20, 24);
  // the rings on its chest
  for (let y = 19; y < 36; y++) for (let x = 11; x < 27; x++) { const d = Math.hypot(x - 18.5, y - 27); if ((d > 4 && d < 5.4) || d < 1.9) px(x, y, x + y < 45 ? TP.redL : TP.red); }
  // the rope belt, and straw coming out under it
  for (let x = 10; x < 28; x++) { px(x, 36, x & 1 ? TP.woodL : TP.straw); px(x, 37, x & 1 ? TP.woodD : TP.wood); }
  for (const [x, y, c] of [[11, 41, TP.straw], [12, 42, TP.strawL], [14, 41, TP.strawL], [15, 42, TP.straw], [23, 41, TP.straw], [24, 42, TP.strawL], [26, 41, TP.straw], [13, 43, TP.straw], [25, 43, TP.straw]]) px(x, y, c);
  sack(10, 1, 18, 16);
  // X for eyes and a stitched mouth
  for (const ex of [14, 23]) for (let d = -2; d <= 2; d++) { px(ex + d, 7 + d, TP.ink); px(ex - d, 7 + d, TP.ink); }
  for (let x = 14; x < 24; x++) px(x, 12, x & 1 ? TP.ink : TP.burlapD);
  for (const x of [15, 18, 21]) { px(x, 11, TP.ink); px(x, 13, TP.ink); }
  // the rope at its neck, and straw for hair
  for (let x = 12; x < 26; x++) { px(x, 16, x & 1 ? TP.woodL : TP.straw); px(x, 17, x & 1 ? TP.wood : TP.woodD); }
  for (const [x, y, c] of [[13, 0, TP.straw], [15, 0, TP.strawL], [18, 0, TP.straw], [21, 0, TP.strawL], [24, 0, TP.straw], [9, 4, TP.straw], [28, 6, TP.straw], [8, 7, TP.strawL], [29, 3, TP.strawL]]) px(x, y, c);
})();
/** What a hit can leave on the target: [color, how much of it]. */
export const SKINS: Record<string, [number, number]> = { flash: [TP.white, 1], char: [hex("#1a0c0e"), 0.72], ice: [hex("#a8e8ff"), 0.72], shadow: [hex("#3a1a70"), 0.5], holy: [hex("#fff4c0"), 0.5], red: [hex("#ff2040"), 0.45], shock: [hex("#8fd6ff"), 0.6], poison: [hex("#58c43a"), 0.5] };
const STRAW = [TP.strawL, TP.straw, TP.straw, TP.burlapD, TP.burlapD];

/** A straw target on a spring: it sways, flashes, takes a skin, shivers and sheds straw. (x, y): the floor under it, local space. */
export class Target {
  declare x: number; declare theta: number; declare omega: number; declare flashT: number; declare skin: string | null; declare skinFade: number; declare shiver: number; declare clock: number; declare R: Rng; declare straw: Straw[];
  constructor(x: number, seed = 5) {
    Object.assign(this, { x, theta: 0, omega: 0, flashT: 0, skin: null, skinFade: 0, shiver: 0, clock: 0, R: new Rng(seed), straw: [] });
  }
  hit({ push = 1.2, straw = 8, flash = 0.05, skin, shiver = 0, y, contact }: Partial<ActHit> = {}) {
    this.omega += push;
    this.flashT = Math.max(this.flashT, flash);
    if (skin !== undefined) this.skin = skin;
    if (shiver) this.shiver = shiver;
    const R = this.R, hitX = contact?.position[0] ?? this.x, hitY = y ?? contact?.position[1] ?? -26;
    for (let k = 0; k < straw; k++) {
      const back = R.next() < 0.3;
      this.straw.push({ x: hitX + R.range(-3, 3), y: hitY + R.range(-3, 3), vx: back ? R.range(-60, -5) : R.range(10, 130), vy: R.range(-120, -5), age: 0, life: R.range(1.2, 2.2), big: R.next() < 0.5 });
    }
  }
  step(dt: number) {
    this.clock += dt;
    this.omega += (-60 * this.theta - 3.4 * this.omega) * dt;
    this.theta = clamp(this.theta + this.omega * dt, -0.4, 0.42);
    if (this.flashT > 0) this.flashT -= dt;
    if (this.shiver > 0) this.shiver -= dt;
    for (const s of this.straw) {
      s.age += dt;
      s.vy += 210 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y >= 0) { s.y = 0; s.vx *= 0.2; s.vy = 0; }
    }
    this.straw = this.straw.filter((s) => s.age < s.life);
  }
  draw(C: Uint32Array, W: number, H: number, X: number, Y: number, flip: boolean) {
    const tan = Math.tan(this.theta), sv = this.shiver > 0 ? (Math.floor(this.clock * 30) & 1 ? 1 : -1) : 0, name = this.flashT > 0 ? "flash" : this.skin, sk = name ? SKINS[name] : null;
    const base = X + (flip ? -this.x - 1 : this.x);
    for (let r = 0; r < TH; r++) {
      const o = Math.round((TH - 1 - r) * tan * 0.8) + sv;
      for (let x = 0; x < TW; x++) {
        const c = DUMMY[r * TW + x];
        if (!c) continue;
        const px = base + (flip ? -(x - 19 + o) - 1 : x - 19 + o), py = Y - TH + r;
        if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = sk ? mix(c, sk[0], sk[1]) : c;
      }
    }
  }
  drawStraw(C: Uint32Array, W: number, H: number, X: number, Y: number, flip: boolean) {
    for (const s of this.straw) {
      const c = STRAW[Math.min(4, Math.floor((s.age / s.life) * 5))], lx = Math.round(s.x), ly = Math.round(s.y) - 1;
      for (let i = 0; i < (s.big ? 2 : 1); i++) {
        const px = X + (flip ? -(lx + i) - 1 : lx + i), py = Y + ly;
        if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = c;
      }
    }
  }
}

// ---- the act itself
const GHOST_LIFE = 0.16;
const REST_MASK = new Uint8Array(24 * 38), REST_PX = new Uint32Array(24 * 38);
HERO2.forEach((row, r) => [...row].forEach((ch, c) => {
  if (ch !== ".") {
    REST_MASK[r * 24 + c] = 1;
    REST_PX[r * 24 + c] = hex((DUMMY_PAL as Record<string, string>)[ch]);
  }
}));

// every cell of the standing sprite, mapped to the nearest cell that's on the body
const NEAREST = new Int16Array(24 * 38).fill(-1);
for (let r = 0; r < 38; r++)
  for (let c = 0; c < 24; c++) {
    let best = -1, bd = 1e9;
    for (let y = Math.max(0, r - 7); y < Math.min(38, r + 8); y++)
      for (let x = Math.max(0, c - 7); x < Math.min(24, c + 8); x++) {
        const d = (x - c) * (x - c) + (y - r) * (y - r);
        if (REST_MASK[y * 24 + x] && d < bd) { bd = d; best = y * 24 + x; }
      }
    NEAREST[r * 24 + c] = best;
  }
const lum = (c: number) => (0.3 * (c & 255) + 0.59 * ((c >>> 8) & 255) + 0.11 * ((c >>> 16) & 255)) / 255;
// an effect's color over the standing body, moved onto a pixel of the pose: its color, at this pixel's own light and shade
function carry(v: number, rest: number, own: number) {
  const lv = lum(v);
  if (lv > 0.9 || v >>> 24 < 255) return v;
  const k = Math.max(0.45, Math.min(1.5, lum(own) / Math.max(0.08, lum(rest))));
  const ch = (n: number) => Math.min(255, Math.round(((v >>> n) & 255) * k));
  return (255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** When an act's poses begin and end, in effect time (a loop ends when it's told to). */
export function actSpan<O extends EffectOptions>(mod: ActModule<O>) {
  const a = mod.act as ActSpec | undefined, D = mod.meta?.duration ?? 1, k = a?.poses;
  return { from: Math.min(0, k?.[0]?.[0] ?? 0), to: mod.meta?.loop ? Infinity : Math.max(D, k?.[k.length - 1]?.[0] ?? 0) };
}

/**
 * An effect performed: { fx, t, update(dt), draw(frame, { body, target }), shake, done() }. t runs from the first pose
 * (before the effect's own t = 0) to the last. update() holds everything still during a freeze; draw() paints the effect, the
 * character and the target together. o: the effect's options, with x, y placing the feet. Without an act, it just plays.
 */
export function createAct<O extends EffectOptions>(mod: ActModule<O>, o: EffectInputOptions<O> & ActOptions = {}) {
  const a = (mod.act ?? {}) as ActSpec, meta = mod.meta ?? {}, D = meta.duration ?? 1, flip = !!o.flip, seed = o.seed ?? meta.options?.seed ?? 1;
  const track:PoseKey[] = a.poses ?? [[0, { ...STAND }]], span = actSpan(mod);
  const adapter = o.actorAdapter ?? (o.actorSelection ? createActorAdapter2D(o.actorSelection) : undefined);
  const actorSampling = a.actorSampling ?? (mod.create && a.onBody ? "snapshot" : "live");
  // Stateful body transformations precompute a silhouette. Bind that immutable
  // start sample to both the simulation and its visible body; never let a browser
  // draw cadence mutate a shape that the simulation has already captured.
  const startActor = adapter?.sample(0, poseAt(track,0));
  const fx = createFx(mod, startActor ? { ...o, actor: startActor.actor } : o);
  const X = o.x ?? 0, Y = o.y ?? 0;
  const targets = (a.targets ?? (a.target ? [a.target] : [])).map((g, i) => new Target(g.x ?? 66, seed + 4 + i));
  const hits = (a.hits ?? []).map((h) => ({ ...h })).sort((p, q) => p.t - q.t), dust = (a.dust ?? []).slice().sort((p, q) => p.t - q.t);
  if (meta.loop && (!Number.isFinite(D) || D <= 0)) throw new RangeError("Loop duration must be finite and positive");
  if (!Number.isFinite(span.from) || hits.some(h => !Number.isFinite(h.t) || !Number.isFinite(h.stop ?? 0) || (h.stop ?? 0) < 0)
    || dust.some(d => !Number.isFinite(d.t))) throw new RangeError("Act event times and freezes must be finite; freezes must be non-negative");
  const R = new Rng(seed + 9), specks: Speck[] = [];
  // after-images take the effect's own color unless the act names one
  const ramp = o.palette ?? meta.options?.palette, ghosts: {q: Pose; age: number}[] = [], gc = hex(a.ghost ?? ramp?.[Math.floor(ramp.length * 0.7)] ?? "#8fb4ff");
  let t = span.from, stop = 0, stopped = false, shakeT = 0, shake0 = 0, amp = 0, nh = 0, nd = 0, loopN = 0, gAcc = 0;
  let integratedAt = t, nextTick = Math.floor(t * FX_TICK_RATE + 1e-9) + 1;
  let last: Pose | null = null;
  const poseNow = () => {
    let tt = t;
    if (meta.loop && t >= D) tt = t % D;
    let q = poseAt(track, tt);
    // nothing is asked of him: he breathes
    if (!meta.loop && isHeld(track, tt)) {
      const up = Math.floor(tt * 3) & 1;
      q = { ...STAND, ...q, crouch: (q.crouch ?? 0) + up, fy: (q.fy ?? STAND.fy) + up, by: (q.by ?? STAND.by) + up };
    }
    last = q;
    return q;
  };
  let scratch: {a: PaintFrame; b: PaintFrame} | null = null;
  const maxShiftX = Math.ceil(Math.max(...track.map(([,q])=>Math.abs((q.lean??0)*(a.follow??1))+Math.abs(q.x??0))))+2;
  const maxShiftY = Math.ceil(Math.max(...track.map(([,q])=>Math.abs((q.crouch??0)*(a.follow??1))+Math.abs(q.y??0))))+3;
  const scratchFor = (f: PaintFrame, q: Pose, r: ReturnType<typeof posed>) => {
    // Work in world coordinates around this effect, rather than allocating two
    // viewport-sized frames for every status. The native halo retains authored
    // glow beyond the color canvas; callers can declare a larger scratchPadding.
    const [w, h] = meta.size, [ox, oy] = meta.origin;
    const halo = typeof a.scratchPadding === "number" ? a.scratchPadding : Math.ceil(Math.max(w, h) / 2);
    const angle = fx.options.angle ?? 0, cs = Math.cos(angle), sn = Math.sin(angle), sign = flip ? -1 : 1;
    let left = X - 12, top = Y - 38, right = X + 12, bottom = Y;
    for (let corner = 0; corner < 4; corner++) {
      const x = corner & 1 ? w - ox + halo : -ox - halo, y = corner & 2 ? h - oy + halo : -oy - halo;
      const px = X + sign * x * cs - y * sn, py = Y + sign * x * sn + y * cs;
      left = Math.min(left, px); right = Math.max(right, px);
      top = Math.min(top, py); bottom = Math.max(bottom, py);
    }
    const follow = a.follow ?? 1, rx = Math.round(q.x ?? 0), ry = Math.round(q.y ?? 0);
    const shiftX = maxShiftX, shiftY = maxShiftY;
    left = Math.max(Math.floor(left), (f.ox | 0) - shiftX);
    right = Math.min(Math.ceil(right), (f.ox | 0) + f.w + shiftX);
    top = Math.max(Math.floor(top), (f.oy | 0) - shiftY);
    bottom = Math.min(Math.ceil(bottom), (f.oy | 0) + f.h + shiftY);
    // A visible posed limb may sample the rest sprite outside the output crop.
    const px0 = X + sign * rx + (flip ? -r.x1 : r.x0), px1 = X + sign * rx + (flip ? -r.x0 : r.x1);
    if (px0 < f.ox + f.w && px1 >= f.ox && Y + ry + r.y0 < f.oy + f.h && Y + ry + r.y1 >= f.oy) {
      left = Math.min(left, X - 12); right = Math.max(right, X + 12);
      top = Math.min(top, Y - 38); bottom = Math.max(bottom, Y);
    }
    left = Math.floor(left); top = Math.floor(top); right = Math.ceil(right); bottom = Math.ceil(bottom);
    const sw = Math.max(1, right - left), sh = Math.max(1, bottom - top);
    if (!scratch || scratch.a.w !== sw || scratch.a.h !== sh)
      scratch = { a: createFrame(sw, sh, left, top), b: createFrame(sw, sh, left, top) };
    for (const frame of [scratch.a, scratch.b]) {
      frame.ox = left; frame.oy = top; frame.alphaMode = f.alphaMode;
      if (f.hdrLight && !frame.hdrLight) frame.hdrLight = new Float32Array(sw * sh * 3);
      else if (!f.hdrLight) frame.hdrLight = undefined;
    }
    return scratch;
  };
  const out: ActInstance = {
    fx, meta, act: a, targets,
    get t() { return t; },
    /** How far the whole picture is thrown right now, in px. */
    get shake() {
      // An authored scene hook replaces hit shake rather than double-counting a contact.
      if (mod.cameraShake) return t < 0 ? [0, 0] : [...fx.shake];
      const strength = fx.options.cameraMotion ?? 1;
      if (!Number.isFinite(strength) || strength < 0) throw new RangeError("cameraMotion must be finite and non-negative");
      if (shakeT <= 0 || strength === 0) return [0, 0];
      const k = amp * (shakeT / shake0) * strength, f = Math.floor(shakeT * 60);
      return [Math.round(Math.sin(f * 2.4) * k), Math.round(Math.cos(f * 3.7) * k * 0.7)];
    },
    get frozen() { return stop > 0; },
    /** The pose he's in right now. */
    get pose() { return last; },
    update(dt: number) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
      if (dt === 0) return;
      let remaining = dt;
      // Process the endpoint before returning, even when all wall time was used
      // reaching it. Hits at the same instant share one freeze (the maximum).
      for (;;) {
        const offset = meta.loop ? loopN * D : 0;
        // The boundary step below normalizes roundoff before dispatch. Looking
        // ahead here would apply an impulse before its preceding physics segment
        // when a host frame happens to stop just short of the contact.
        for (; nh < hits.length && hits[nh].t + offset <= t; nh++) {
          const h = hits[nh];
          if (h.stop) stop = Math.max(stop, h.stop);
          if (h.shake) {
            shakeT = shake0 = h.shake;
            amp = h.amp ?? 2;
          }
          if (h.target !== false) targets.forEach((g, i) => (h.at === undefined || h.at === i) && g.hit(h));
          out.onHit?.(h);
        }
        for (; nd < dust.length && dust[nd].t + offset <= t; nd++) {
          const d = dust[nd], n = d.n ?? 6;
          for (let i = 0; i < n; i++) {
            const dir = d.dir ?? (R.next() < 0.5 ? -1 : 1);
            specks.push({ x: d.x + R.range(-3, 3), y: -1 - R.range(0, 2), vx: dir * R.range(22, 90), vy: R.range(-34, -6), age: 0, life: R.range(0.16, 0.4), big: R.next() < 0.45, c: d.c ? hex(d.c) : 0 });
          }
        }
        const boundary = meta.loop ? (loopN + 1) * D : Infinity;
        if (meta.loop && t >= boundary) {
          // Finish the old cycle before dispatching the new cycle's t=0 events.
          // Negative wind-up events belong only to the first playback.
          t = boundary;
          loopN++;
          poseNow();
          nh = hits.findIndex(h => h.t >= 0); if (nh < 0) nh = hits.length;
          nd = dust.findIndex(d => d.t >= 0); if (nd < 0) nd = dust.length;
          continue;
        }
        if (remaining <= 0) break;
        if (stop > 0) {
          const frozen = Math.min(remaining, stop);
          remaining -= frozen;
          stop -= frozen;
          shakeT = Math.max(0, shakeT - frozen); // Shake uses wall time during hit-stop.
          continue;
        }
        const tickTime = nextTick / FX_TICK_RATE;
        const next = Math.min(hits[nh] ? hits[nh].t + offset : Infinity,
          dust[nd] ? dust[nd].t + offset : Infinity, boundary, tickTime);
        // The public clock and contacts retain exact authored times. Physics only
        // integrates at timeline ticks or contacts, never at a host-frame endpoint.
        // Contact-sized partial steps are therefore identical at every host FPS.
        const step = Math.min(remaining, next - t);
        const t0 = t;
        t = step === next - t ? next : t + step;
        if (next - t <= 1e-12) t = next;
        remaining = Math.max(0, remaining - step);
        shakeT = Math.max(0, shakeT - step);
        if (t > 0) fx.update(Math.max(0, t) - Math.max(0, t0));
        if (t < next - 1e-12) continue;
        const physicsStep = t - integratedAt;
        integratedAt = t;
        if (t >= tickTime - 1e-12) nextTick++;
        for (const k of specks) {
          k.age += physicsStep;
          k.vx *= 1 - 5 * physicsStep;
          k.vy += 110 * physicsStep;
          k.x += k.vx * physicsStep;
          k.y = Math.min(-1, k.y + k.vy * physicsStep);
        }
        for (let i = specks.length - 1; i >= 0; i--) if (specks[i].age >= specks[i].life) specks.splice(i, 1);
        const q = poseNow();
        for (const g of targets) g.step(physicsStep);
        // after-images while a key asks for them
        gAcc += physicsStep;
        if (q.ghost && gAcc >= 1 / 30) {
          gAcc = 0;
          ghosts.push({ q, age: 0 });
          if (ghosts.length > 7) ghosts.shift();
        }
        for (const g of ghosts) g.age += physicsStep;
        while (ghosts.length && ghosts[0].age > GHOST_LIFE) ghosts.shift();
      }
      poseNow();
    },
    /** Paint it. { body: false } leaves the character out, { target: false } the target. */
    draw(frame: PaintFrame, { body = true, target: showTarget = true } = {}) {
      const W = frame.w, H = frame.h, q = last ?? poseNow(), active = t >= 0;
      const tgt = showTarget ? targets : [];
      const drawTargets = () => tgt.forEach((g) => g.draw(frame.color, W, H, FX, FY, flip));
      const drawStraw = () => tgt.forEach((g) => g.drawStraw(frame.color, W, H, FX, FY, flip));
      const drawDust = () => {
        for (const k of specks) {
          const c = k.c || DUST[Math.min(3, Math.floor((k.age / k.life) * 4))], lx = Math.round(k.x), py = FY + Math.round(k.y);
          for (let i = 0; i < (k.big ? 2 : 1); i++) {
            const px = flip ? FX - lx - i - 1 : FX + lx + i;
            if (px >= 0 && py >= 0 && px < W && py < H) frame.color[py * W + px] = c;
          }
        }
      };
      const FX = X - (frame.ox | 0), FY = Y - (frame.oy | 0);
      const native = actorSampling === "snapshot" && active ? startActor : adapter?.sample(t, q);
      if (native && adapter) {
        fx.options.actor = actorSampling === "snapshot" ? startActor!.actor : native.actor;
        const [dx,dy] = actorEffectOffset2D(native,q,!!a.onBody,adapter.selection);
        fx.options.x = X + (flip ? -dx : dx); fx.options.y = Y + dy;
      }
      if (!body) {
        if (active) fx.draw(frame, "back");
        drawTargets();
        if (active) fx.draw(frame, "front");
        drawStraw();
        return;
      }
      if(native && adapter){
        // A native adapter already samples the posed mask and anchors. It does not
        // pass through the stock 24x38 rest-sprite remap a second time.
        if(active)fx.draw(frame,"back");
        drawTargets();
        native.drawBack(painterFor(frame).place(X,Y,flip));
        const p=painterFor(frame).place(X,Y,flip);
        for(const ghost of ghosts){
          const actor=adapter.sample(t-ghost.age,ghost.q).actor,k=.5*(1-ghost.age/GHOST_LIFE);
          for(let y=0;y<actor.h;y++)for(let x=0;x<actor.w;x++)if(actor.mask.data[y*actor.w+x])p.light(actor.x+x,actor.y+y,gc,k);
        }
        const tt=meta.loop?(t<0?0:t%D):clamp(t,0,D),alpha=active?actorAlphaOf(mod,tt,fx.options):1;
        native.drawFront(painterFor(frame).place(X,Y,flip),alpha);
        if(ghosts.length){
          const actor=native.actor;
          for(let y=0;y<actor.h;y++)for(let x=0;x<actor.w;x++)if(actor.mask.data[y*actor.w+x]){
            const px=FX+(flip?-actor.x-x-1:actor.x+x),py=FY+actor.y+y;
            if(px<0||py<0||px>=W||py>=H)continue;
            const j=py*W+px,keep=1-Math.min(1,Math.max(0,alpha))*(actor.pixels[y*actor.w+x]>>>24)/255,light=frame.light[j];
            frame.light[j]=keep>0?((light&0xff000000)|(((light&255)*keep)|0)|(((((light>>>8)&255)*keep)|0)<<8)|(((((light>>>16)&255)*keep)|0)<<16)):0;
            if(frame.hdrLight)for(let channel=0;channel<3;channel++)frame.hdrLight[j*3+channel]*=keep;
          }
        }
        if(active)fx.draw(frame,"front");
        drawStraw();drawDust();return;
      }
      const rx = Math.round(q.x ?? 0), ry = Math.round(q.y ?? 0), BX = FX + (flip ? -rx : rx), BY = FY + ry;
      const r = posed(q), mirror = flip;
      const paint = (i: number, color: number) => {
        const px = mirror ? BX - r.xs[i] - 1 : BX + r.xs[i], py = BY + r.ys[i];
        if (px < 0 || py < 0 || px >= W || py >= H) return;
        const j = py * W + px;
        frame.color[j] = blendOver(frame.color[j], color, 1);
        // he stays crisp in front of his own after-images
        if (ghosts.length) {
          const keep = 1 - (color >>> 24) / 255, light = frame.light[j];
          frame.light[j] = keep > 0 ? ((255 << 24) | (((((light >>> 16) & 255) * keep) | 0) << 16)
            | (((((light >>> 8) & 255) * keep) | 0) << 8) | (((light & 255) * keep) | 0)) >>> 0 : 0;
          if (frame.hdrLight) for (let channel = 0; channel < 3; channel++) frame.hdrLight[j * 3 + channel] *= keep;
        }
      };
      const drawGhosts = () => {
        for (const g of ghosts) {
          // after-images are light, not paint: they brighten what's behind them and leave nothing muddy
          const gr = posed(g.q), gx = FX + (flip ? -Math.round(g.q.x ?? 0) : Math.round(g.q.x ?? 0)), gy = FY + Math.round(g.q.y ?? 0), k = 0.5 * (1 - g.age / GHOST_LIFE);
          const gm = flip, r0 = (gc & 255) * k, g0 = ((gc >>> 8) & 255) * k, b0 = ((gc >>> 16) & 255) * k;
          for (let i = 0; i < gr.n; i++) {
            const px = gm ? gx - gr.xs[i] - 1 : gx + gr.xs[i], py = gy + gr.ys[i];
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const j = py * W + px, d = frame.light[j];
            frame.light[j] = (255 << 24) | (Math.min(255, ((d >>> 16) & 255) + b0) << 16) | (Math.min(255, ((d >>> 8) & 255) + g0) << 8) | Math.min(255, (d & 255) + r0);
            if (frame.hdrLight) {
              frame.hdrLight[j * 3] += channelToLinear(gc, 0) * k;
              frame.hdrLight[j * 3 + 1] += channelToLinear(gc, 8) * k;
              frame.hdrLight[j * 3 + 2] += channelToLinear(gc, 16) * k;
            }
          }
        }
      };
      const shadow = () => {
        const sy = FY, cx = FX + (flip ? -rx : rx), hw = 10 + (Math.abs(q.ffx! - q.fbx!) >> 1) - Math.min(8, Math.abs(ry) >> 1);
        if (sy < 0 || sy >= H) return;
        for (let dy = 0; dy < 2; dy++)
          for (let x = -hw + dy * 2; x <= hw - dy * 2; x++) {
            const px = cx + x, i = (sy + dy) * W + px;
            if (px < 0 || px >= W || sy + dy >= H) continue;
            frame.color[i] = (frame.color[i] & 0xffffff) | (Math.max(frame.color[i] >>> 24, 110) << 24);
          }
      };
      if (!a.onBody) {
        // the effect doesn't care about the body: back, body, front
        if (active) fx.draw(frame, "back");
        drawTargets();
        shadow();
        drawGhosts();
        for (let i = 0; i < r.n; i++) paint(i, r.color[i]);
        if (active) fx.draw(frame, "front");
        drawStraw();
        drawDust();
        return;
      }
      // Keep back and body/front as separate source-over layers. In particular,
      // the back layer must not be embedded in B and then painted a second time.
      const { a: A, b: B } = scratchFor(frame, q, r);
      clearFrame(A);
      clearFrame(B);
      if (active) fx.draw(A, "back");
      const tt = meta.loop ? (t < 0 ? 0 : t % D) : clamp(t, 0, D), alpha = active ? actorAlphaOf(mod, tt, fx.options) : 1;
      drawActor(painterFor(B).place(X, Y, flip), (fx.options.actor as ReturnType<typeof stockActor> | undefined) ?? stockActor(2), alpha);
      if (active) fx.draw(B, "front");
      const follow = a.follow ?? 1, lean = (q.lean ?? 0) * follow, cr = (q.crouch ?? 0) * follow;
      const C = frame.color, Ls = frame.light, hdr = frame.hdrLight, sw = A.w, sh = A.h;
      const workX = A.ox, workY = A.oy, frameX = frame.ox | 0, frameY = frame.oy | 0;
      const rest = (worldX: number, worldY: number) => {
        const col = (flip ? X - worldX - 1 : worldX - X) + 12, row = worldY - Y + 38;
        return col >= 0 && row >= 0 && col < 24 && row < 38 && REST_MASK[row * 24 + col] === 1;
      };
      const copyLight = (source: PaintFrame, sourceIndex: number, destination: number) => {
        const s = source.light[sourceIndex];
        if (s & 0xffffff) {
          const d = Ls[destination];
          Ls[destination] = (255 << 24) | (Math.min(255, ((d >>> 16) & 255) + ((s >>> 16) & 255)) << 16)
            | (Math.min(255, ((d >>> 8) & 255) + ((s >>> 8) & 255)) << 8) | Math.min(255, (d & 255) + (s & 255));
        }
        if (hdr && source.hdrLight) {
          const to = destination * 3, from = sourceIndex * 3;
          hdr[to] += source.hdrLight[from];
          hdr[to + 1] += source.hdrLight[from + 1];
          hdr[to + 2] += source.hdrLight[from + 2];
        }
      };
      // shiftOf is constant across a row, so compute it once rather than allocate
      // a pair for every color/light pixel. Only this effect's source region is visited.
      const visit = (front: boolean) => {
        for (let sy = 0; sy < sh; sy++) {
          const worldY = workY + sy, ly = worldY - Y;
          const k = clamp((-11 - ly) / 7, 0, 1), f = clamp((-1 - ly) / 6, 0, 1);
          const dx = Math.round(lean * k + rx * f) * (flip ? -1 : 1), dy = Math.round(cr * k + ry * f);
          const py = worldY + dy - frameY;
          if (py < 0 || py >= H) continue;
          const sx0 = Math.max(0, frameX - workX - dx), sx1 = Math.min(sw, frameX + W - workX - dx);
          for (let sx = sx0; sx < sx1; sx++) {
            const j = sy * sw + sx, worldX = workX + sx, i = py * W + worldX + dx - frameX;
            if (!front) {
              const c = A.color[j];
              if (c) C[i] = blendOver(C[i], c, 1);
            } else {
              const c = B.color[j];
              if (c && !rest(worldX, worldY)) C[i] = blendOver(C[i], c, 1);
              // In 2D these are authored additive glows, not opaque surface emission.
              // Both packed mirror and linear energy use the same pose displacement.
              copyLight(A, j, i);
              copyLight(B, j, i);
            }
          }
        }
      };
      visit(false);
      drawTargets();
      shadow();
      drawGhosts();
      const restIndex = (s: number) => {
        const col = s % 24, row = (s / 24) | 0;
        const sx = (flip ? X - (col - 12) - 1 : X + col - 12) - workX, sy = Y + row - 38 - workY;
        return sx >= 0 && sy >= 0 && sx < sw && sy < sh ? sy * sw + sx : -1;
      };
      for (let i = 0; i < r.n; i++) {
        const s = r.src[i] >= 0 ? NEAREST[r.src[i]] : -1;
        if (s < 0) {
          if (alpha > 0.5) paint(i, r.color[i]);
          continue;
        }
        const j = restIndex(s), v = j >= 0 ? B.color[j] : 0;
        if (!v) continue;
        paint(i, v === REST_PX[s] ? r.color[i] : carry(v, REST_PX[s], r.color[i]));
      }
      visit(true);
      drawStraw();
      drawDust();
    },
    /** Let a loop end: it fades out and done() goes true. */
    stop() {
      fx.stop();
      stopped = true;
    },
    /** One-shots end when the last pose is over. */
    done() {
      return stopped ? fx.done() : t >= span.to && stop <= 0;
    },
  };
  poseNow();
  return out;
}

/**
 * An act as plain data, for a game with its own character: how long the wind-up and recovery are, when to freeze and shake,
 * what a target should do, and the poses themselves. Times are in the effect's own seconds: start the effect at 0.
 */
export function actTiming<O extends EffectOptions>(mod: ActModule<O>) {
  const a = mod.act as ActSpec | undefined;
  if (!a) return null;
  const { from, to } = actSpan(mod), D = mod.meta?.duration ?? 1;
  return {
    windup: -from,
    recovery: mod.meta?.loop ? 0 : Math.max(0, to - D),
    onBody: !!a.onBody,
    actorSampling: a.actorSampling ?? (mod.create && a.onBody ? "snapshot" : "live"),
    targets: (a.targets ?? (a.target ? [a.target] : [])).map((g) => g.x ?? 66),
    hits: (a.hits ?? []).map((h): ActTimingHit => ({
      t: h.t, freeze: h.stop ?? 0, shake: h.shake ?? 0, amp: h.amp ?? (h.shake ? 2 : 0),
      target: h.target !== false, at: h.at, y: h.y ?? h.contact?.position[1] ?? -26,
      ...(h.contact ? { contact: h.contact } : {}),
      push: h.target === false ? 0 : h.push ?? 1.2,
      straw: h.target === false ? 0 : h.straw ?? 8,
      flash: h.target === false ? 0 : h.flash ?? 0.05,
      shiver: h.target === false ? 0 : h.shiver ?? 0, skin: h.skin,
    })),
    poses: (a.poses ?? []).map(([t, pose, how]) => ({ t, how: how ?? "smooth", pose })),
  };
}

/** The box an act needs in local space, so nothing gets cut off: { x0, y0, x1, y1 }, sampled over its poses. */
export function actBounds<O extends EffectOptions>(mod: ActModule<O>, options: EffectOptions = {}) {
  const a = mod.act as ActSpec | undefined, [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
  let x0 = -ox, y0 = -oy, x1 = w - ox, y1 = h - oy;
  const adapter = (options.actorAdapter as ActorAdapter2D | undefined) ?? (options.actorSelection ? createActorAdapter2D(options.actorSelection as ActorSelection2D) : undefined);
  const layout = exportLayout2D([w,h],[ox,oy],{angle:options.flip?-(options.angle??0):options.angle});
  const effect = {x0:-layout.x,y0:-layout.y,x1:layout.w-layout.x,y1:layout.h-layout.y};
  x0=Math.min(x0,effect.x0);y0=Math.min(y0,effect.y0);x1=Math.max(x1,effect.x1);y1=Math.max(y1,effect.y1);
  const see = (p: Pose, time=0) => {
    if(adapter){
      const sample=adapter.sample(time,p),b=sample.bounds,[dx,dy]=actorEffectOffset2D(sample,p,!!a?.onBody,adapter.selection);
      x0=Math.min(x0,b.x0-2,effect.x0+dx);y0=Math.min(y0,b.y0-2,effect.y0+dy);
      x1=Math.max(x1,b.x1+2,effect.x1+dx);y1=Math.max(y1,b.y1+2,effect.y1+dy);
      if(a?.onBody){
        const extraX=Math.max(0,(b.x1-b.x0-24)/2),extraY=Math.max(0,b.y1-b.y0-38);
        x0=Math.min(x0,effect.x0-extraX);x1=Math.max(x1,effect.x1+extraX);y0=Math.min(y0,effect.y0-extraY);
      }
      return;
    }
    const r = posed(p), X = Math.round(p.x ?? 0), Y = Math.round(p.y ?? 0), left = r.x0, right = r.x1;
    x0 = Math.min(x0, left + X - 1); x1 = Math.max(x1, right + X + 1); y0 = Math.min(y0, r.y0 + Y - 1); y1 = Math.max(y1, r.y1 + Y + 1);
  };
  const k = a?.poses;
  if (k) {
    for (let t = k[0][0]; t <= k[k.length - 1][0]; t += 1 / 12) see(poseAt(k, t),t);
    for (const key of k) see(key[1],key[0]);
  } else {
    see(STAND);
    if(adapter){
      // No authored pose keys means the selected native motion is still free to
      // move. Its declared envelope covers the complete cycle, including weapons.
      const b=adapter.bounds;x0=Math.min(x0,b.x0);y0=Math.min(y0,b.y0);x1=Math.max(x1,b.x1);y1=Math.max(y1,b.y1);
    }
  }
  for (const g of a?.targets ?? (a?.target ? [a.target] : [])) {
    const tx = g.x ?? 66;
    x0 = Math.min(x0, tx - 30); x1 = Math.max(x1, tx + 36); y0 = Math.min(y0, -56);
  }
  return { x0:Math.floor(x0), y0:Math.floor(y0), x1:Math.ceil(x1), y1:Math.ceil(y1) };
}
