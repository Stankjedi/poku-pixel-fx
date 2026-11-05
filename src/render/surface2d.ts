/** Opt-in 2D surface emission. Ordinary legacy light keeps its screen-glow contract. */
import { channelToLinear } from './linear.js';
export interface SurfaceLightFrame2D { w: number; h: number; color: Uint32Array; light: Uint32Array; hdrLight?: Float32Array }
class SurfaceLightState2D {
  readonly surface: Float32Array;
  readonly linearSurface: Float32Array;
  readonly optical: Uint32Array;
  linearOptical?: Float32Array;
  constructor(readonly frame: SurfaceLightFrame2D) {
    this.surface = new Float32Array(frame.w * frame.h * 3);
    this.linearSurface = new Float32Array(this.surface.length);
    this.optical = frame.light.slice();
    if (frame.hdrLight) this.linearOptical = frame.hdrLight.slice();
  }
  reset() { this.surface.fill(0); this.linearSurface.fill(0); this.optical.fill(0); this.linearOptical?.fill(0); }
  ensureHDR() {
    if (this.frame.hdrLight && !this.linearOptical) {
      this.linearOptical = new Float32Array(this.surface.length);
      for (let i = 0; i < this.optical.length; i++) for (let ch = 0; ch < 3; ch++) this.linearOptical[i * 3 + ch] = channelToLinear(this.optical[i], ch * 8);
      for (let i = 0; i < this.optical.length; i++) this.write(i);
    }
    if (!this.frame.hdrLight) this.linearOptical = undefined;
  }
  write(i: number) {
    const j = i * 3, optical = this.optical[i];
    const r = Math.min(255, (optical & 255) + this.surface[j]) | 0;
    const g = Math.min(255, ((optical >>> 8) & 255) + this.surface[j + 1]) | 0;
    const b = Math.min(255, ((optical >>> 16) & 255) + this.surface[j + 2]) | 0;
    this.frame.light[i] = r || g || b ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : 0;
    if (this.frame.hdrLight) for (let ch = 0; ch < 3; ch++) this.frame.hdrLight[j + ch] = (this.linearOptical?.[j + ch] ?? 0) + this.linearSurface[j + ch];
  }
}
const states = new WeakMap<SurfaceLightFrame2D, SurfaceLightState2D>();
const encoded = (linear: number) => 255 * (linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055);
export function enableSurfaceLight2D<T extends SurfaceLightFrame2D>(frame: T): T {
  if (!states.has(frame)) states.set(frame, new SurfaceLightState2D(frame));
  return frame;
}
/** Called by clearFrame; preserving the state reuses all scratch arrays. */
export function resetSurfaceLight2D(frame: SurfaceLightFrame2D): void { states.get(frame)?.reset(); }
/** Explicit barrier after custom direct buffer writes. Treat their resolved light as optical. */
export function adoptSurfaceLight2D(frame: SurfaceLightFrame2D): void {
  const state = states.get(frame); if (!state) return;
  state.reset(); state.ensureHDR(); state.optical.set(frame.light);
  if (frame.hdrLight) state.linearOptical?.set(frame.hdrLight);
}
export function attenuateSurfaceLight2D(frame: SurfaceLightFrame2D, i: number, opacity: number): void {
  const state = states.get(frame); if (!state || !(opacity > 0)) return;
  state.ensureHDR();
  const transmittance = 1 - Math.min(1, opacity), j = i * 3;
  for (let ch = 0; ch < 3; ch++) { state.surface[j + ch] *= transmittance; state.linearSurface[j + ch] *= transmittance; }
  state.write(i);
}
export function addSurfaceLight2D(frame: SurfaceLightFrame2D, i: number, color: number, strength: number): void {
  if (!(strength > 0)) return;
  enableSurfaceLight2D(frame); const state = states.get(frame)!; state.ensureHDR();
  const j = i * 3;
  for (let ch = 0; ch < 3; ch++) {
    state.surface[j + ch] += ((color >>> (ch * 8)) & 255) * strength;
    state.linearSurface[j + ch] += channelToLinear(color, ch * 8) * strength;
  }
  state.write(i);
}
/** Returns false for untouched legacy frames, so their original path remains byte-identical. */
export function addOpticalLight2D(frame: SurfaceLightFrame2D, i: number, color: number, strength: number): boolean {
  const state = states.get(frame); if (!state) return false;
  state.ensureHDR(); const d = state.optical[i], j = i * 3;
  const r = Math.min(255, (d & 255) + (color & 255) * strength) | 0;
  const g = Math.min(255, ((d >>> 8) & 255) + ((color >>> 8) & 255) * strength) | 0;
  const b = Math.min(255, ((d >>> 16) & 255) + ((color >>> 16) & 255) * strength) | 0;
  state.optical[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  if (state.linearOptical) for (let ch = 0; ch < 3; ch++) state.linearOptical[j + ch] += channelToLinear(color, ch * 8) * strength;
  state.write(i); return true;
}

/** Native linear emission imported from an asset. RGB is already coverage weighted by the caller. */
export function addLinearLight2D(frame: SurfaceLightFrame2D, i: number, r: number, g: number, b: number, kind: 'surface' | 'optical' = 'optical'): void {
  if (!Number.isInteger(i) || i < 0 || i >= frame.w * frame.h || ![r, g, b].every(n => Number.isFinite(n) && n >= 0)) throw new RangeError('Invalid linear emission sample');
  if (r + g + b === 0) return;
  if (!frame.hdrLight) {
    frame.hdrLight = new Float32Array(frame.w * frame.h * 3);
    for (let p = 0; p < frame.light.length; p++) for (let ch = 0; ch < 3; ch++) frame.hdrLight[p * 3 + ch] = channelToLinear(frame.light[p], ch * 8);
  }
  if (kind === 'surface') enableSurfaceLight2D(frame);
  const state = states.get(frame), linear = [r, g, b], legacy = linear.map(encoded), j = i * 3;
  if (state) {
    state.ensureHDR();
    if (kind === 'surface') for (let ch = 0; ch < 3; ch++) { state.surface[j + ch] += legacy[ch]; state.linearSurface[j + ch] += linear[ch]; }
    else {
      const d = state.optical[i];
      state.optical[i] = ((255 << 24) | ((Math.min(255, (d & 255) + legacy[0]) | 0)) |
        ((Math.min(255, ((d >>> 8) & 255) + legacy[1]) | 0) << 8) | ((Math.min(255, ((d >>> 16) & 255) + legacy[2]) | 0) << 16)) >>> 0;
      for (let ch = 0; ch < 3; ch++) state.linearOptical![j + ch] += linear[ch];
    }
    state.write(i);
  } else {
    const d = frame.light[i];
    frame.light[i] = ((255 << 24) | (Math.min(255, (d & 255) + legacy[0]) | 0) |
      ((Math.min(255, ((d >>> 8) & 255) + legacy[1]) | 0) << 8) | ((Math.min(255, ((d >>> 16) & 255) + legacy[2]) | 0) << 16)) >>> 0;
    for (let ch = 0; ch < 3; ch++) frame.hdrLight[j + ch] += linear[ch];
  }
}
