/** Frame-local fragment storage. Color and emission share the same coverage/depth rule. */
import type { Frame3D } from "./frame.js";
import { blendOver } from "../render/coverage.js";
import { channelToLinear } from "../render/linear.js";

const pack = (r: number, g: number, b: number) => {
  const value = (Math.min(255, Math.max(0, r)) | 0) |
    ((Math.min(255, Math.max(0, g)) | 0) << 8) | ((Math.min(255, Math.max(0, b)) | 0) << 16);
  return value ? (value | 0xff000000) >>> 0 : 0;
};

export interface SurfaceDiagnostics3D {
  submitted: number; accepted: number; rejected: number; opaque: number; transparent: number;
  maxLayersPerPixel: number; resolves: number; recomposedFragments: number;
  arenaCapacity: number; arenaBytes: number; activeFragments: number;
  budget: number | null; budgetExceeded: boolean;
}
export interface SurfaceBudget3D { /** Exact rendering throws instead of silently dropping fragments. */ maxFragments?: number }

/**
 * Exact per-pixel far-to-near source-over. The common ordered append is O(1);
 * only a fragment inserted behind existing translucency recomposes that pixel.
 * Pools are reused at begin(), and opaque-only frames never allocate a fragment arena.
 * Equal-depth samples retain submission order. `depth` remains nearest visible depth
 * for lighting; the opaque depth tested here is separate from transparent coverage.
 */
export class SurfaceFragments3D {
  private heads?: Uint32Array;
  private tails?: Uint32Array;
  private baseColor?: Uint32Array;
  private baseLight?: Uint32Array;
  private baseDepth?: Float32Array;
  private baseHDR?: Float32Array;
  private count = 0;
  private capacity = 0;
  private next = new Uint32Array(0);
  private z = new Float32Array(0);
  private colors = new Uint32Array(0);
  private alphas = new Float64Array(0);
  private depthWrites = new Uint8Array(0);
  private energy = new Float64Array(0); // legacy RGB, then linear RGB; already premultiplied
  private screenLight?: Uint32Array;
  private screenHDR?: Float32Array;
  private surfaceLight?: Uint32Array;
  private surfaceHDR?: Float32Array;
  private layers?: Uint32Array;
  private maxFragments = Infinity;
  private metrics = { submitted: 0, accepted: 0, rejected: 0, opaque: 0, transparent: 0,
    maxLayersPerPixel: 0, resolves: 0, recomposedFragments: 0, budgetExceeded: false };

  constructor(readonly frame: Frame3D) {}

  reset() {
    this.heads?.fill(0); this.tails?.fill(0); this.count = 0;
    this.screenLight?.fill(0); this.surfaceLight?.fill(0);
    this.screenHDR?.fill(0); this.surfaceHDR?.fill(0);
    // Enabling/disabling HDR is allowed between frames, without stale optional arrays.
    if (!this.frame.hdrLight) { this.baseHDR = this.screenHDR = this.surfaceHDR = undefined; }
    this.layers?.fill(0);
    this.metrics = { submitted: 0, accepted: 0, rejected: 0, opaque: 0, transparent: 0,
      maxLayersPerPixel: 0, resolves: 0, recomposedFragments: 0, budgetExceeded: false };
  }

  configure(budget: SurfaceBudget3D = {}) {
    const n = budget.maxFragments ?? Infinity;
    if (n !== Infinity && (!Number.isSafeInteger(n) || n < 1)) throw new RangeError('maxFragments must be a positive integer');
    this.maxFragments = n;
  }
  diagnostics(): Readonly<SurfaceDiagnostics3D> {
    const arrays = [this.next, this.z, this.colors, this.alphas, this.depthWrites, this.energy,
      this.heads, this.tails, this.layers, this.baseColor, this.baseLight, this.baseDepth, this.baseHDR,
      this.screenLight, this.screenHDR, this.surfaceLight, this.surfaceHDR];
    return Object.freeze({ ...this.metrics, arenaCapacity: this.capacity,
      arenaBytes: arrays.reduce((n, a) => n + (a?.byteLength ?? 0), 0), activeFragments: this.layers?.reduce((sum, count) => sum + count, 0) ?? 0,
      budget: this.maxFragments === Infinity ? null : this.maxFragments });
  }

  private prepare() {
    if (!this.heads) {
      const n = this.frame.w * this.frame.h;
      this.heads = new Uint32Array(n); this.tails = new Uint32Array(n);
      this.baseColor = new Uint32Array(n); this.baseLight = new Uint32Array(n);
      this.baseDepth = new Float32Array(n);
      this.layers = new Uint32Array(n);
    }
    if (this.frame.hdrLight && !this.baseHDR) this.baseHDR = new Float32Array(this.frame.w * this.frame.h * 3);
    if (this.count + 1 < this.capacity) return;
    const capacity = Math.max(1024, this.capacity * 2);
    const grow = <T extends Uint32Array | Float32Array | Float64Array | Uint8Array>(old: T, replacement: T): T => { replacement.set(old); return replacement; };
    this.next = grow(this.next, new Uint32Array(capacity));
    this.z = grow(this.z, new Float32Array(capacity)); this.colors = grow(this.colors, new Uint32Array(capacity));
    this.alphas = grow(this.alphas, new Float64Array(capacity)); this.depthWrites = grow(this.depthWrites, new Uint8Array(capacity));
    this.energy = grow(this.energy, new Float64Array(capacity * 6));
    this.capacity = capacity;
  }

  opaqueDepth(i: number) { return this.heads?.[i] ? this.baseDepth![i] : this.frame.depth[i]; }
  opaqueColor(i: number) { return this.heads?.[i] ? this.baseColor![i] : this.frame.color[i]; }

  private light() { return this.surfaceLight ?? this.frame.light; }
  private hdr() { return this.surfaceHDR ?? this.frame.hdrLight; }

  private writeLight(i: number, r: number, g: number, b: number, hr: number, hg: number, hb: number) {
    const light = pack(r, g, b), hdr = this.hdr(), j = i * 3;
    this.light()[i] = light;
    if (hdr) { hdr[j] = hr; hdr[j + 1] = hg; hdr[j + 2] = hb; }
    const overlay = this.screenLight?.[i] ?? 0;
    this.frame.light[i] = this.screenLight ? pack((light & 255) + (overlay & 255), ((light >>> 8) & 255) + ((overlay >>> 8) & 255), ((light >>> 16) & 255) + ((overlay >>> 16) & 255)) : light;
    if (this.frame.hdrLight && this.screenHDR && this.surfaceHDR) {
      this.frame.hdrLight[j] = this.surfaceHDR[j] + this.screenHDR[j];
      this.frame.hdrLight[j + 1] = this.surfaceHDR[j + 1] + this.screenHDR[j + 1];
      this.frame.hdrLight[j + 2] = this.surfaceHDR[j + 2] + this.screenHDR[j + 2];
    }
  }

  private over(i: number, color: number, alpha: number, lr: number, lg: number, lb: number, hr: number, hg: number, hb: number) {
    const opacity = alpha * (color >>> 24) / 255, transmit = 1 - opacity, previous = this.light()[i], hdr = this.hdr(), j = i * 3;
    this.frame.color[i] = blendOver(this.frame.color[i], color, alpha);
    this.writeLight(i, (previous & 255) * transmit + lr, ((previous >>> 8) & 255) * transmit + lg, ((previous >>> 16) & 255) * transmit + lb,
      (hdr?.[j] ?? 0) * transmit + hr, (hdr?.[j + 1] ?? 0) * transmit + hg, (hdr?.[j + 2] ?? 0) * transmit + hb);
  }

  private resolve(i: number) {
    this.metrics.resolves++;
    this.frame.color[i] = this.baseColor![i];
    const light = this.baseLight![i], j = i * 3, hdr = this.baseHDR;
    this.writeLight(i, light & 255, (light >>> 8) & 255, (light >>> 16) & 255, hdr?.[j] ?? 0, hdr?.[j + 1] ?? 0, hdr?.[j + 2] ?? 0);
    let depth = this.baseDepth![i];
    for (let k = this.heads![i]; k; k = this.next[k]) {
      this.metrics.recomposedFragments++;
      const e = k * 6;
      this.over(i, this.colors[k], this.alphas[k], this.energy[e], this.energy[e + 1], this.energy[e + 2], this.energy[e + 3], this.energy[e + 4], this.energy[e + 5]);
      if (this.depthWrites[k]) depth = Math.max(depth, this.z[k]);
    }
    this.frame.depth[i] = depth;
  }

  /** Surface emission uses the same coverage as its color, with unbounded linear energy. */
  put(i: number, depth: number, color: number, alpha: number, emission: number, emissionColor = color) {
    if (!(emission > 0)) return this.layer(i, depth, color, alpha, 0, 0, 0, 0, 0, 0);
    const opacity = alpha * (color >>> 24) / 255, amount = Math.max(0, emission) * opacity;
    return this.layer(i, depth, color, alpha, (emissionColor & 255) * amount, ((emissionColor >>> 8) & 255) * amount, ((emissionColor >>> 16) & 255) * amount,
      channelToLinear(emissionColor, 0) * amount, channelToLinear(emissionColor, 8) * amount, channelToLinear(emissionColor, 16) * amount);
  }

  /** Preintegrated coverage/emission for custom raster materials (e.g. volume rays). */
  layer(i: number, depth: number, color: number, alpha: number, lr: number, lg: number, lb: number, hr: number, hg: number, hb: number, depthWrite = true) {
    const z = Math.fround(depth), opacity = alpha * (color >>> 24) / 255;
    this.metrics.submitted++;
    const emissiveOnly = !depthWrite && Math.max(lr, lg, lb, hr, hg, hb) > 0;
    if ((opacity <= 0 && !emissiveOnly) || z < this.opaqueDepth(i)) { this.metrics.rejected++; return false; }
    let head = this.heads?.[i] ?? 0;
    if (opacity >= 1 && depthWrite) {
      this.metrics.accepted++;
      this.metrics.opaque++;
      // A newly submitted opaque surface replaces its same-depth predecessors too.
      while (head && this.z[head] <= z) { head = this.next[head]; if (this.layers) this.layers[i]--; }
      if (head) {
        this.heads![i] = head; this.baseColor![i] = (color | 0xff000000) >>> 0;
        this.baseLight![i] = pack(lr, lg, lb); this.baseDepth![i] = z;
        if (this.baseHDR) { const j = i * 3; this.baseHDR[j] = hr; this.baseHDR[j + 1] = hg; this.baseHDR[j + 2] = hb; }
        this.resolve(i);
      } else {
        if (this.heads) this.heads[i] = this.tails![i] = 0;
        if (this.layers) this.layers[i] = 0;
        this.frame.color[i] = (color | 0xff000000) >>> 0; this.frame.depth[i] = z;
        this.writeLight(i, lr, lg, lb, hr, hg, hb);
      }
      return true;
    }
    if (this.count >= this.maxFragments) {
      this.metrics.rejected++;
      this.metrics.budgetExceeded = true;
      throw new RangeError(`Exact transparency fragment budget exceeded (${this.maxFragments}); reduce overlap or bake this effect`);
    }
    this.prepare();
    this.metrics.accepted++;
    this.metrics.transparent++;
    this.layers![i]++;
    this.metrics.maxLayersPerPixel = Math.max(this.metrics.maxLayersPerPixel, this.layers![i]);
    if (!head) {
      this.baseColor![i] = this.frame.color[i]; this.baseLight![i] = this.light()[i]; this.baseDepth![i] = this.frame.depth[i];
      if (this.baseHDR) { const hdr = this.hdr(), j = i * 3; this.baseHDR[j] = hdr?.[j] ?? 0; this.baseHDR[j + 1] = hdr?.[j + 1] ?? 0; this.baseHDR[j + 2] = hdr?.[j + 2] ?? 0; }
    }
    const k = ++this.count, e = k * 6, tail = this.tails![i];
    this.z[k] = z; this.colors[k] = color; this.alphas[k] = alpha; this.next[k] = 0; this.depthWrites[k] = +depthWrite;
    this.energy[e] = lr; this.energy[e + 1] = lg; this.energy[e + 2] = lb;
    this.energy[e + 3] = hr; this.energy[e + 4] = hg; this.energy[e + 5] = hb;
    if (!head || z >= this.z[tail]) {
      if (tail) this.next[tail] = k; else this.heads![i] = k;
      this.tails![i] = k;
      this.over(i, color, alpha, lr, lg, lb, hr, hg, hb);
      if (depthWrite) this.frame.depth[i] = Math.max(this.frame.depth[i], z);
    } else {
      let previous = 0, cursor = head;
      while (cursor && this.z[cursor] <= z) { previous = cursor; cursor = this.next[cursor]; }
      this.next[k] = cursor;
      if (previous) this.next[previous] = k; else this.heads![i] = k;
      this.resolve(i);
    }
    return true;
  }

  /** Deliberately screen-space optical glow; never participates in surface occlusion. */
  glow(i: number, color: number, amount: number) {
    if (amount <= 0) return;
    this.glowRGB(i, (color & 255) * amount, ((color >>> 8) & 255) * amount, ((color >>> 16) & 255) * amount,
      channelToLinear(color, 0) * amount, channelToLinear(color, 8) * amount, channelToLinear(color, 16) * amount);
  }

  glowRGB(i: number, lr: number, lg: number, lb: number, hr: number, hg: number, hb: number) {
    const n = this.frame.w * this.frame.h, j = i * 3;
    if (!this.screenLight) { this.screenLight = new Uint32Array(n); this.surfaceLight = this.frame.light.slice(); }
    if (this.frame.hdrLight && !this.screenHDR) { this.screenHDR = new Float32Array(n * 3); this.surfaceHDR = this.frame.hdrLight.slice(); }
    const old = this.screenLight[i];
    this.screenLight[i] = pack((old & 255) + lr, ((old >>> 8) & 255) + lg, ((old >>> 16) & 255) + lb);
    if (this.screenHDR) { this.screenHDR[j] += hr; this.screenHDR[j + 1] += hg; this.screenHDR[j + 2] += hb; }
    const surface = this.light()[i], hdr = this.hdr();
    this.writeLight(i, surface & 255, (surface >>> 8) & 255, (surface >>> 16) & 255, hdr?.[j] ?? 0, hdr?.[j + 1] ?? 0, hdr?.[j + 2] ?? 0);
  }

  /** Clear only an explicitly owned optical-mask pixel, not unrelated foreground emission. */
  clearEmission(i: number, screen = false) {
    if (screen) {
      if (this.screenLight) this.screenLight[i] = 0;
      if (this.screenHDR) this.screenHDR.fill(0, i * 3, i * 3 + 3);
    }
    if (this.heads?.[i]) {
      this.baseLight![i] = 0; this.baseHDR?.fill(0, i * 3, i * 3 + 3);
      for (let k = this.heads[i]; k; k = this.next[k]) this.energy.fill(0, k * 6, k * 6 + 6);
    }
    this.writeLight(i, 0, 0, 0, 0, 0, 0);
  }

  /** Refraction/postprocessing starts a new resolved pass; existing visible depth is its input. */
  adoptResolved() {
    this.heads?.fill(0); this.tails?.fill(0); this.count = 0;
    this.layers?.fill(0);
    if (this.surfaceLight) this.surfaceLight.set(this.frame.light);
    if (this.surfaceHDR && this.frame.hdrLight) this.surfaceHDR.set(this.frame.hdrLight);
    this.screenLight?.fill(0); this.screenHDR?.fill(0);
  }
}

const states = new WeakMap<Frame3D, SurfaceFragments3D>();
export function surfacesFor3D(frame: Frame3D) {
  let state = states.get(frame);
  if (!state) { state = new SurfaceFragments3D(frame); states.set(frame, state); }
  return state;
}
export function resetSurfaces3D(frame: Frame3D) { states.get(frame)?.reset(); }
export function surfaceDiagnostics3D(frame: Frame3D): Readonly<SurfaceDiagnostics3D> { return surfacesFor3D(frame).diagnostics(); }
export function configureSurfaceBudget3D(frame: Frame3D, budget: SurfaceBudget3D): void { surfacesFor3D(frame).configure(budget); }
