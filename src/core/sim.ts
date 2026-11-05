// Simulated particles, debris and lights, for effects that want real physics: sparks that streak and bounce
// off the floor, shards that tumble and settle, vapour and smoke that swell and thin, lights that flare and die.
// Adapted from Sprite Fusion's open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx),
// MIT License, Copyright (c) 2026 Hugo Duprez. Units here are art pixels and seconds; draw through a Painter,
// so effects stay in local space and mirror or rotate like any other.

import { Rng, clamp, TAU } from "./math.js";
import { integrateMotion2D } from "./particles.js";
import { drawTrail, motionTrail, type TrailPainter } from "./quality.js";
import type { Painter } from "./painter.js";
import { hex, scale, mix, rgb, WHITE } from "./color.js";

type Color = string | number;
type Layer = "back" | "front";
interface SimPainter {
  path?: TrailPainter["path"];
  particleStyle?: "refined" | "classic";
  line(x0: number, y0: number, x1: number, y1: number, color: number, alpha?: number): void;
  dot(x: number, y: number, color: number, alpha?: number): void;
  px(x: number, y: number, color: number): void;
  glow(x: number, y: number, radius: number, color: number, strength?: number): void;
  disc(x: number, y: number, radius: number, color: number, alpha: number): void;
  circle(x: number, y: number, radius: number, color: number, alpha?: number): void;
}
interface ParticleOptions {
  rng?: Rng; seed?: number; ground?: (x: number) => number;
  sparks?: Color[]; haze?: Color; onLand?: (x: number, y: number) => void;
  /** Refined connected trails by default; classic preserves the original sparkle drawing. */
  renderStyle?: "refined" | "classic";
}
interface Particle {
  k: number; x: number; y: number; vx: number; vy: number; life: number; max: number;
  col: number; size: number; seed: number; delay: number; flag: number; trailAge?: number;
}
interface Blaze { x: number; y: number; life: number; max: number; acc: number; power: number }
export interface BitInput {
  x: number; y: number; kind?: number; vx?: number; vy?: number; a?: number; va?: number;
  s?: number; c?: Color; ramp?: Color[]; g?: number; drag?: number; bounce?: number;
  rest?: boolean; life?: number;
}
interface Bit extends Required<Omit<BitInput, "ramp">> { ramp?: Color[]; max: number }
interface Light { x: number; y: number; r: number; color: number; k: number; life: number; max: number }


export const GRAVITY = 950; // px/s²
const CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HOT = ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"].map(hex);
/** Fire from white-hot to smouldering, and smoke from fresh to thin: the ramps FIRE puffs and SMOKE walk down. */
export const FIRE_RAMP = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4a1712"].map(hex);
export const SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
const rampAt = (r: number[], t: number) => r[Math.min(r.length - 1, Math.max(0, Math.floor(t * r.length)))];

/** Particle kinds. */
export const P = { SPARK: 0, MOTE: 1, STREAK: 2, FLAKE: 3, VAPOUR: 4, DUST: 5, STAR: 6, EMBER: 7, SMOKE: 8, FIRE: 9, BRAND: 10, GRIT: 11 };
/** Particle flags: SMOKES (a FIRE puff leaves smoke when it dies), BIG (bigger, slower smoke), BACK (draw behind). */
export const PF = { SMOKES: 1, BIG: 2, BACK: 4 };
const SOFT = new Set([P.VAPOUR, P.DUST, P.SMOKE]);

interface GroundContact { x: number; y: number; vx: number; vy: number; nx: number; ny: number }
/** undefined retains the exact flat-floor response; null means no sloped-floor contact.
 * Ground is a pure, continuous local height field. Follow the analytic trajectory to its crossing,
 * then estimate the outward surface normal. No random draws occur during contact detection.
 */
function slopeContact(ground: (x: number) => number, p: Particle, x0: number, y0: number,
  vx0: number, vy0: number, g0: number, dt: number, gravity: number, drag: number, dragY = drag): GroundContact | null | undefined {
  const g1 = ground(p.x);
  if (g1 === g0) return undefined;
  if (!Number.isFinite(g0) || !Number.isFinite(g1) || p.y < g1) return null;
  const at = (time: number) => {
    const q = { x: x0, y: y0, vx: vx0, vy: vy0 };
    integrateMotion2D(q, time, 0, gravity, drag, dragY);
    return q;
  };
  let lo = 0, hi = dt;
  // Already-submerged inputs recover at their current x; ordinary crossings start above the floor.
  if (y0 <= g0) for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2, q = at(mid), height = ground(q.x);
    if (!Number.isFinite(height)) return null;
    if (q.y >= height) hi = mid;
    else lo = mid;
  }
  const q = at(hi), y = ground(q.x);
  if (!Number.isFinite(y)) return null;
  const delta = 0.001, left = ground(q.x - delta), right = ground(q.x + delta);
  const slope = Number.isFinite(left) && Number.isFinite(right)
    ? (right - left) / (2 * delta) : (g1 - g0) / (p.x - x0);
  const length = Math.hypot(slope, 1);
  if (!Number.isFinite(length)) return null;
  return { ...q, y, nx: slope / length, ny: -1 / length };
}
function reflectGround(p: Particle, hit: GroundContact, bounce: number, friction: number, jitter = 0) {
  const normal = Math.max(0, -(hit.vx * hit.nx + hit.vy * hit.ny)) * bounce;
  const tangent = (-hit.vx * hit.ny + hit.vy * hit.nx) * friction + jitter;
  p.x = hit.x; p.y = hit.y - 0.25;
  p.vx = normal * hit.nx - tangent * hit.ny;
  p.vy = normal * hit.ny + tangent * hit.nx;
  p.trailAge = 0;
}

/**
 * A particle system. opts: { seed, ground: (x) => floor y (local px; sparks bounce on it), sparks: [head..tail]
 * colors for SPARK, haze: color vapour glows with }.
 * spawn(kind, x, y, vx, vy, life, color, size); update(dt); draw(p, layer): "back" draws the soft kinds
 * (vapour, dust, smoke), "front" the rest, nothing for both.
 */
export class Particles {
  R: Rng; list: Particle[]; t: number; ground: (x: number) => number;
  sparks: number[]; haze: number | null; onLand: ((x: number, y: number) => void) | null;
  renderStyle: "refined" | "classic";
  constructor(opts: ParticleOptions = {}) {
    this.R = opts.rng ?? new Rng(opts.seed ?? 1);
    this.renderStyle = opts.renderStyle ?? "refined";
    this.list = [];
    this.t = 0;
    this.ground = opts.ground ?? (() => Infinity);
    this.sparks = (opts.sparks ?? HOT).map(hex);
    this.haze = opts.haze === undefined ? null : hex(opts.haze);
    this.onLand = opts.onLand ?? null; // (x, y) when a BRAND hits the floor
  }
  /** delay: seconds before it appears; flag: PF bits. col 0 lets FIRE and SMOKE use their own ramps. */
  spawn(k: number, x: number, y: number, vx: number, vy: number, life: number, col: Color = WHITE, size = 1, delay = 0, flag = 0) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col: col ? hex(col) : 0, size, seed: this.R.next() * 100, delay, flag, trailAge: 0 });
  }
  get count() {
    return this.list.length;
  }
  update(elapsed: number) {
    if (elapsed === 0) return;
    this.t += elapsed;
    const R = this.R, t = this.t;
    // Keep reverse update/RNG order. New smoke and flame children are appended and begin next step.
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      let dt = elapsed;
      if (p.delay > 0) {
        if (p.delay >= dt) { p.delay -= dt; continue; }
        dt -= p.delay;
        p.delay = 0;
      }
      if ((p.life -= dt) <= 0) {
        if (p.k === P.FIRE && p.flag & PF.SMOKES) {
          const big = p.flag & PF.BIG;
          this.spawn(P.SMOKE, p.x, p.y, p.vx * 0.6, p.vy * 0.6 - 6, big ? R.range(1.3, 2.3) : R.range(0.8, 1.4), 0, p.size * (big ? 0.85 : 0.7), 0, big ? PF.BIG : 0);
        }
        continue;
      }
      p.trailAge = (p.trailAge ?? Math.max(0, p.max - p.life - dt)) + dt;
      switch (p.k) {
        case P.FIRE:
          integrateMotion2D(p, dt, Math.sin(t * 17 + p.seed) * 30, -95, 5, 3.2);
          break;
        case P.GRIT: {
          const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, g = this.ground(x0);
          integrateMotion2D(p, dt, 0, GRAVITY, 0.8, 0);
          const hit = slopeContact(this.ground, p, x0, y0, vx0, vy0, g, dt, GRAVITY, 0.8, 0);
          if (hit) {
            const speed = -(hit.vx * hit.nx + hit.vy * hit.ny);
            if (speed > 130 && R.chance(0.4)) reflectGround(p, hit, 0.25, 0.5, R.range(-10, 10));
            else { p.x = hit.x; p.y = hit.y - 0.25; p.vx = p.vy = 0; p.life = Math.min(p.life, 0.5); }
          } else if (hit === undefined && p.vy > 0 && y0 <= g && p.y >= g) {
            p.y = g - 0.25;
            if (p.vy > 130 && R.chance(0.4)) (p.vy = -p.vy * 0.25), (p.vx = p.vx * 0.5 + R.range(-10, 10));
            else (p.vx = p.vy = 0), (p.life = Math.min(p.life, 0.5));
          }
          break;
        }
        case P.BRAND: {
          const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, g = this.ground(x0);
          integrateMotion2D(p, dt, 0, GRAVITY * 0.8, 0.9, 0);
          if (R.chance(0.9 * Math.min(1, dt * 60))) this.spawn(P.FIRE, x0, y0, p.vx * 0.1 + R.range(-7, 7), p.vy * 0.1 - 10, R.range(0.16, 0.32), 0, R.range(0.9, 1.7) * (0.5 + (p.life / p.max) * 0.6), 0, R.chance(0.4) ? PF.SMOKES : 0);
          const hit = slopeContact(this.ground, p, x0, y0, vx0, vy0, g, dt, GRAVITY * 0.8, 0.9, 0);
          if (hit) {
            p.x = hit.x; p.y = hit.y;
            this.onLand?.(hit.x, hit.y);
            p.life = 0;
          } else if (hit === undefined && p.vy > 0 && y0 <= g && p.y >= g) {
            this.onLand?.(p.x, g);
            p.life = 0;
          }
          break;
        }
        case P.SPARK: {
          const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, g = this.ground(x0);
          integrateMotion2D(p, dt, 0, GRAVITY * 0.45, 2.2);
          const hit = slopeContact(this.ground, p, x0, y0, vx0, vy0, g, dt, GRAVITY * 0.45, 2.2);
          if (hit) reflectGround(p, hit, 0.45, 0.7);
          else if (hit === undefined && p.vy > 0 && y0 <= g && p.y >= g) {
            p.vy = -p.vy * 0.45; p.vx *= 0.7; p.y = g - 0.25; p.trailAge = 0;
          }
          break;
        }
        case P.STREAK:
          integrateMotion2D(p, dt, 0, 0, -3);
          break;
        case P.FLAKE:
          integrateMotion2D(p, dt, 0, 35, 2.2);
          p.x += Math.sin(t * 2.5 + p.seed) * 7 * dt;
          break;
        case P.EMBER:
          integrateMotion2D(p, dt, Math.cos(t * 2.3 + p.seed) * 45, -30 + Math.sin(t * 3 + p.seed) * 20, 1.6);
          break;
        case P.SMOKE: {
          const big = p.flag & PF.BIG;
          integrateMotion2D(p, dt, Math.sin(t * 1.3 + p.seed) * 8, big ? -23 : -16, 1.6, 1.2);
          break;
        }
        case P.MOTE:
          integrateMotion2D(p, dt, 0, 0, 0.6);
          break;
        default:
          integrateMotion2D(p, dt, 0, -5, SOFT.has(p.k) ? 4 : 1.6);
      }
    }
    // One stable pass, including newly appended children, avoids quadratic splice shifts.
    let write = 0;
    for (const p of this.list) if (p.life > 0) this.list[write++] = p;
    this.list.length = write;
  }
  draw(p: SimPainter, layer?: Layer) {
    for (const q of this.list) {
      if (q.delay > 0) continue;
      if (layer && (SOFT.has(q.k) || q.flag & PF.BACK ? "back" : "front") !== layer) continue;
      const k = q.life / q.max, x = q.x, y = q.y, sp = Math.hypot(q.vx, q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
      // Reconstruct the exact recent path from current velocity. No RNG or simulation mutation
      // during drawing; a bounce resets trailAge so a tail cannot rewind through the floor.
      if (this.renderStyle === "refined" && p.particleStyle !== "classic" && p.path && q.trailAge !== undefined && (q.k === P.SPARK || q.k === P.MOTE || q.k === P.STREAK)) {
        const spark = q.k === P.SPARK, mote = q.k === P.MOTE;
        const drag = spark ? 2.2 : mote ? 0.6 : -3, gravity = spark ? GRAVITY * 0.45 : 0;
        const trailAge = q.trailAge;
        const length = spark ? Math.min(9, 1 + sp * 0.022) : mote ? Math.min(16, 0.5 + sp * 0.026) * q.size : clamp(sp / 30, 1, 7);
        const seconds = Math.min(trailAge, length / sp);
        const points = motionTrail(time => {
          const previous = { x, y, vx: q.vx, vy: q.vy };
          integrateMotion2D(previous, time - trailAge, 0, gravity, drag);
          return [previous.x, previous.y];
        }, trailAge, seconds, 5);
        const S = this.sparks, head = spark ? (k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2]) : mote ? q.col : WHITE;
        drawTrail(p as TrailPainter, points, {
          color: spark ? (k > 0.5 ? head : S[S.length - 1]) : mote ? scale(q.col, 0.65) : q.col,
          head, alpha: Math.min(1, k / 0.22), width: 1,
          light: (spark ? 0.28 : 0.22) * k, lightRadius: mote ? 2.5 + q.size : spark ? 3 : 4,
        });
        continue;
      }
      switch (q.k) {
        case P.SPARK: {
          const S = this.sparks, head = k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2], len = Math.min(9, 1 + sp * 0.022);
          p.line(x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? head : S[S.length - 1]);
          p.line(x - ux * len * 0.45, y - uy * len * 0.45, x, y, head);
          p.glow(x, y, 3, head, 0.45 * k);
          break;
        }
        case P.MOTE: {
          const len = Math.min(16, 0.5 + sp * 0.026) * q.size, a = k < 0.35 ? k / 0.35 : 1;
          p.line(x - ux * len, y - uy * len, x - ux * len * 0.35, y - uy * len * 0.35, scale(q.col, 0.55), a);
          p.line(x - ux * len * 0.4, y - uy * len * 0.4, x, y, q.col, a);
          p.glow(x, y, 2.5 + q.size, q.col, 0.4 * k);
          break;
        }
        case P.STREAK: {
          const L = clamp(sp / 30, 1, 7);
          for (let d = L; d >= 0; d -= 0.5) p.dot(x - ux * d, y - uy * d, d < 1 ? WHITE : d < L * 0.5 ? q.col : scale(q.col, 0.6), d < L * 0.5 ? 1 : 1.2 - d / L);
          p.glow(x, y, 4, q.col, 0.4);
          break;
        }
        case P.FLAKE: {
          const a = Math.min(1, k * 3);
          p.dot(x, y, q.col, a);
          if (q.size > 1.3) for (const [dx, dy] of CROSS) p.dot(x + dx, y + dy, scale(q.col, 0.8), a * 0.8);
          break;
        }
        case P.VAPOUR: {
          const r = q.size * (0.6 + (1 - k) * 0.9);
          p.disc(x, y, r, q.col, Math.pow(k, 1.3) * 0.45);
          if (this.haze) p.glow(x, y, r * 1.8, this.haze, 0.16 * k);
          break;
        }
        case P.DUST: p.disc(x, y, q.size * (0.6 + (1 - k) * 0.9), q.col, Math.pow(k, 1.3) * 0.7); break;
        case P.SMOKE: {
          // three soft discs: a body, a denser core sitting low, a lit cap while it's young
          const age = 1 - k, big = q.flag & PF.BIG;
          const r = q.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * (big ? 0.5 : 0.4));
          const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * (big ? 0.7 : 0.58);
          const c = q.col ? mix(q.col, rampAt(SMOKE_RAMP, age), age) : rampAt(SMOKE_RAMP, age * 1.05);
          p.disc(x, y, r, c, a * 0.45);
          p.disc(x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
          if (age < 0.5) p.disc(x - r * 0.22, y - r * 0.3, r * 0.5, mix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
          break;
        }
        case P.FIRE: {
          // a ball of flame that cools down the ramp as it rises: a darker rim, a lit core, a tongue on top
          const age = 1 - k, heat = Math.min(0.999, Math.pow(age, 0.62) + (q.seed % 1) * 0.1), F = FIRE_RAMP, n = F.length;
          const idx = Math.min(n - 2, Math.floor(heat * (n - 1)));
          const r = q.size * (0.55 + 0.45 * Math.min(1, age * 7)) * (1 - age * 0.55), c = F[idx];
          if (idx >= n - 2) p.disc(x, y, r, c, Math.min(1, k * 3) * 0.85);
          else {
            p.circle(x, y, r, F[Math.min(n - 1, idx + 2)]);
            p.circle(x - r * 0.16, y - r * 0.22, r * 0.78, c);
            if (r > 1.6) p.circle(x, y - r * 0.9, r * 0.42, c);
            if (idx <= 3 && r > 1.8) p.circle(x - r * 0.28, y - r * 0.34, r * 0.36, F[Math.max(0, idx - 1)]);
            if (idx < 6) p.glow(x, y, r * 2.4 + 2, c, 0.18 * k);
          }
          break;
        }
        case P.BRAND:
          p.circle(x, y, 1.6, HOT[3]);
          p.px(x, y, Math.sin(this.t * 40 + q.seed) > 0 ? HOT[0] : HOT[1]);
          p.px(x + 1, y, HOT[1]);
          p.glow(x, y, 7, HOT[2], 0.45);
          break;
        case P.GRIT:
          if (k > 0.25 || k * 4 > 0.5) {
            p.px(x, y, q.col);
            if (q.size >= 2) p.px(x + 1, y, q.col), p.px(x, y + 1, scale(q.col, 0.8)), p.px(x + 1, y + 1, scale(q.col, 0.7));
          }
          break;
        case P.EMBER: {
          const c = k > 0.6 ? this.sparks[0] : k > 0.3 ? this.sparks[1] : this.sparks[2];
          if (k < 0.25 && Math.sin(this.t * 40 + q.seed) < 0) break;
          p.px(x, y, c);
          if (q.size > 1.5) p.px(x, y + 1, this.sparks[this.sparks.length - 1]);
          p.glow(x, y, 3 + q.size, c, 0.35 * k);
          break;
        }
        default: {
          // STAR: a twinkling cross, arms set by size
          const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + (q.seed % 5)) + q.seed);
          if (q.size < 1) {
            if (tw * k > 0.25) p.px(x, y, tw > 0.8 ? WHITE : q.col);
            p.glow(x, y, 3, q.col, 0.4 * k * tw);
            break;
          }
          sparkle(p, x, y, q.size * tw * Math.min(1, k * 3), q.col, scale(q.col, 0.75), 0.5 * k * tw);
        }
      }
    }
  }
}

/**
 * Little fires burning where something landed: add(x, y, life, power) feeds FIRE puffs (and the odd ember)
 * into a particle system, fading over its life. update(dt); drawBack(p) adds a hot pixel and a glow at its foot.
 */
export class Blazes {
  ps: Particles; list: Blaze[];
  constructor(ps: Particles) {
    this.ps = ps;
    this.list = [];
  }
  add(x: number, y: number, life: number, power: number) {
    this.list.push({ x, y, life, max: life, acc: this.ps.R.next(), power });
  }
  get count() {
    return this.list.length;
  }
  update(dt: number) {
    const ps = this.ps, R = ps.R;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if ((b.life -= dt) <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      const k = b.life / b.max, intensity = b.power * (k > 0.7 ? 1 : 0.35 + (k / 0.7) * 0.65);
      for (b.acc += dt * (6 + 16 * intensity); b.acc > 1; b.acc--) {
        const s = R.range(1.2, 2.8) * intensity;
        ps.spawn(P.FIRE, b.x + R.range(-1.5, 1.5), b.y - s * 0.6, R.range(-6, 6), R.range(-30, -12), R.range(0.28, 0.6), 0, s, 0, PF.BACK | (R.chance(0.3) ? PF.SMOKES : 0));
        if (R.chance(0.06)) ps.spawn(P.EMBER, b.x, b.y - 1.5, R.range(-15, 15), R.range(-45, -15), R.range(0.6, 1.4), HOT[2], 1, 0, PF.BACK);
      }
    }
  }
  drawBack(p: SimPainter) {
    for (const b of this.list) {
      const k = b.life / b.max;
      p.px(b.x, b.y, k > 0.4 ? (Math.sin(b.life * 31 + b.x) > 0 ? HOT[1] : HOT[2]) : HOT[3]);
      p.glow(b.x, b.y, 6 + 5 * k * b.power, HOT[2], 0.3 * k * b.power);
    }
  }
}

/** Debris kinds. */
export const B = { SHARD: 0, CHUNK: 1, DRIP: 2 };

/**
 * Rigid debris that tumbles, bounces and settles. add({ kind, x, y, vx, vy, a, va, s (size), c (color), ramp
 * (chunk shading, dark to bright), g (gravity scale), drag, bounce, life }); update(dt); draw(p).
 */
export class Bits<Extra extends object = object> {
  list: (Bit & Extra)[]; ground: (x: number) => number;
  constructor(opts: { ground?: (x: number) => number } = {}) {
    this.list = [];
    this.ground = opts.ground ?? (() => Infinity);
  }
  add<Input extends BitInput & Extra>(b: Input) {
    const life = b.life ?? 1;
    this.list.push({ kind: B.SHARD, vx: 0, vy: 0, a: 0, va: 0, s: 1, c: WHITE, g: 1, drag: 0, bounce: 0, rest: false, ...b, life, max: life } as unknown as Bit & Extra);
  }
  get count() {
    return this.list.length;
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if ((b.life -= dt) <= 0 || b.rest) continue;
      integrateMotion2D(b, dt, 0, GRAVITY * b.g, b.drag);
      b.a += b.va * dt;
      const floor = this.ground(b.x), sp = b.vy;
      if (b.g <= 0 || b.y < floor || sp <= 0) continue;
      b.y = floor - 0.01;
      if (b.kind === B.DRIP) b.life = 0;
      else if (b.bounce > 0 && sp > 70) (b.vy = -sp * b.bounce), (b.vx *= 0.7), (b.va *= 0.6);
      else (b.rest = true), (b.vx = b.vy = 0);
    }
    let write = 0;
    for (const b of this.list) if (b.life > 0) this.list[write++] = b;
    this.list.length = write;
  }
  draw(p: SimPainter) {
    for (const b of this.list) {
      const a = Math.min(1, b.life / 0.4), ca = Math.cos(b.a), sa = Math.sin(b.a);
      if (b.kind === B.SHARD) {
        for (let d = -b.s / 2; d <= b.s / 2; d += 0.5) p.dot(b.x + ca * d, b.y + sa * d, d > b.s / 2 - 0.6 ? WHITE : hex(b.c), a);
      } else if (b.kind === B.DRIP) {
        p.dot(b.x, b.y, hex(b.c), a);
        p.dot(b.x, b.y - 1, hex(b.c), a * 0.5);
      } else {
        // a shaded chunk: lit top-left, dark bottom-right, a dark rim
        const R = (b.ramp ?? ["#1c2030", "#3a4a66", "#6e86a8", "#a8c0dc", "#e8f2ff"]).map(hex), n = R.length;
        const x = Math.round(b.x), y = Math.round(b.y), r = Math.ceil(b.s) + 1;
        for (let py = -r; py <= r; py++)
          for (let px = -r; px <= r; px++) {
            const u = (px + 0.5) * ca + (py + 0.5) * sa, v = -(px + 0.5) * sa + (py + 0.5) * ca;
            const d = Math.abs(u) / b.s + Math.abs(v) / (b.s * 0.62);
            if (d > 1.3) continue;
            p.dot(x + px, y + py, d > 1 ? R[0] : v < 0 ? (u < 0 ? R[n - 1] : R[n - 2]) : u < 0 ? R[n - 3] : R[Math.max(1, n - 4)], a);
          }
      }
    }
  }
}

/** Lights that flare and die: add(x, y, r, color, k, life); update(dt); draw(p). */
export class Lights {
  list: Light[];
  constructor() {
    this.list = [];
  }
  add(x: number, y: number, r: number, color: Color, k: number, life: number) {
    this.list.push({ x, y, r, color: hex(color), k, life, max: life });
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) if ((this.list[i].life -= dt) <= 0) this.list.splice(i, 1);
  }
  draw(p: SimPainter) {
    for (const l of this.list) {
      const k = l.life / l.max;
      p.glow(l.x, l.y, l.r * (0.55 + 0.45 * k), l.color, l.k * k * k);
    }
  }
}

/** A star glint: arms of length arm in color c with tips in tip, a white heart, light. */
export function sparkle(p: SimPainter, x: number, y: number, arm: number, c: number, tip = c, k = 0.6) {
  const n = Math.round(arm);
  if (n < 1) return;
  const X = Math.floor(x), Y = Math.floor(y);
  for (let d = 1; d <= n; d++) {
    const cc = d > n * 0.6 ? tip : c;
    for (const [dx, dy] of CROSS) p.px(X + dx * d, Y + dy * d, cc);
  }
  if (n >= 3) for (const [dx, dy] of DIAG) p.px(X + dx, Y + dy, c);
  if (n >= 6) for (const [dx, dy] of DIAG) p.px(X + dx * 2, Y + dy * 2, tip);
  p.px(X, Y, WHITE);
  p.glow(x, y, 4 + n * 2, c, k);
}

/** An 8-ray flare: long rays on the axes, shorter between, fading out along their length. ramp dark to bright. */
export function flare(p: SimPainter, x: number, y: number, L: number, k: number, ramp: Color[]) {
  if (L < 1) return;
  const R = ramp.map(hex), n = R.length;
  for (let i = 0; i < 8; i++) {
    const an = (i * Math.PI) / 4, len = i % 4 === 0 ? L : i % 2 === 0 ? L * 0.6 : L * 0.3, ca = Math.cos(an), sa = Math.sin(an);
    for (let d = 0; d <= len; d += 0.5) {
      const u = d / len;
      p.dot(x + ca * d, y + sa * d, u < 0.35 ? WHITE : u < 0.7 ? R[n - 2] : R[n - 3], u < 0.6 ? 1 : k * 1.5 * (1 - u) + 0.2);
    }
  }
}

/**
 * A ring on a tilted plane (sy squashes it: 0.16 lies on the floor, 1 stands up), thickness th inward, alpha k,
 * colored by depth through the band with ramp (dark to bright). keep(angle) picks which part to draw, so the
 * far half can go behind things and the near half in front: (g) => Math.sin(g) < 0 is the far half.
 */
export function band(p: Pick<Painter, "shade">, cx: number, cy: number, r: number, sy: number, th: number, k: number, ramp: Color[], keep: (angle: number) => boolean = () => true, hot = false) {
  if (r <= 0 || k <= 0 || th <= 0) return;
  const R = ramp.map(hex), n = R.length, inner = Math.max(0, r - th), middle = (r + inner) * 0.5;
  // A plane seen exactly edge-on still owns a one-pixel row. Other shapes keep their authored squash.
  const squash = sy === 0 ? 0.5 / r : sy, height = r * Math.abs(squash);
  p.shade(cx - r - 1, cy - height - 1, cx + r + 1, cy + height + 1, (x, y, out) => {
    const dx = x - cx, dy = (y - cy) / squash, radius = Math.hypot(dx, dy);
    // Convert radial distance to screen-normal distance. A subpixel-width band must still own
    // contiguous pixel cells, including steep/rotated arcs; it is not a cloud of repeated dots.
    const gradient = radius > 0 ? Math.hypot(dx, dy / squash) / radius : 1;
    const halfWidth = Math.max((r - inner) * 0.5, Math.SQRT1_2 * gradient);
    if (Math.abs(radius - middle) > halfWidth) return;
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += TAU;
    if (!keep(angle)) return;
    const u = clamp((r - radius) / th);
    out.c = u < 0.15 ? (hot ? WHITE : R[n - 1]) : u < 0.4 ? R[n - 2] : u < 0.7 ? R[n - 3] : R[n - 4];
    out.a = k * (u < 0.4 ? 1.2 : 1.15 - u);
  });
}

/**
 * A faceted crystal spike standing on (x, base), height h, base width w, leaning lean px at the tip, shaded in
 * ramp (dark to bright, 6+ steps): a lit ridge, a bright left face, a darker right face, a dark rim.
 * opts: { a (alpha), white (flash it white), glint (0..1 height of a sweeping highlight, or -1) }.
 */
export function crystal(p: SimPainter, x: number, base: number, h: number, w: number, lean: number, ramp: Color[], opts: { a?: number; white?: boolean; glint?: number } = {}) {
  if (h < 1.5) return;
  const R = ramp.map(hex), n = R.length, C = (i: number) => R[Math.max(0, n - 1 - i)];
  const a = opts.a ?? 1, top = base - h, ridge0 = x - w * 0.14, glint = opts.glint ?? -1;
  const inside = (px: number, py: number) => {
    const u = (base - (py + 0.5)) / h;
    return u >= 0 && u <= 1 && Math.abs(px + 0.5 - (x + lean * u)) <= (w / 2) * (1 - u) + 0.35;
  };
  for (let py = Math.floor(top) - 1; py < Math.ceil(base); py++)
    for (let px = Math.floor(x - w / 2 - Math.abs(lean) - 2); px <= Math.ceil(x + w / 2 + Math.abs(lean) + 2); px++) {
      if (!inside(px, py)) {
        if (inside(px - 1, py) || inside(px + 1, py) || inside(px, py + 1) || (inside(px, py - 1) && py < base - 1)) p.dot(px, py, R[0], a);
        continue;
      }
      if (opts.white) {
        p.dot(px, py, WHITE, a);
        continue;
      }
      const u = (base - (py + 0.5)) / h, rx = ridge0 + (x + lean - ridge0) * u, c = x + lean * u, hw = (w / 2) * (1 - u) + 0.35, fx = px + 0.5;
      let col = u > 0.9 ? WHITE : Math.abs(fx - rx) < 0.55 ? C(1)
        : fx < rx ? (fx - (c - hw) < 1 ? C(1) : (fx - (c - hw)) / Math.max(1, rx - (c - hw)) > 0.55 ? C(2) : C(3))
        : c + hw - fx < 1.2 ? C(Math.min(n - 2, 6)) : (fx - rx) / Math.max(1, c + hw - rx) > 0.5 ? C(5) : C(4);
      if (glint >= 0 && fx <= rx + 0.6) {
        const g = Math.abs(u - glint);
        if (g < 0.05) col = WHITE;
        else if (g < 0.1) col = C(1);
      }
      p.dot(px, py, col, a);
    }
}
