/** Host time policy: hiding a tab pauses; slow visible frames retain the complete elapsed time. */
export class PlaybackClock {
  time = 0; playing = false; speed = 1;
  private last: number | undefined;
  constructor(public duration = 1, public loop = true) {}
  reset(now?: number): void { this.time = 0; this.last = now; }
  suspend(): void { this.last = undefined; }
  seek(time: number): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Time must be finite and positive');
    this.time = Math.min(this.duration, time); this.last = undefined;
  }
  step(frames: number, fps: number): number { this.seek(Math.max(0, this.time + frames / fps)); return this.time; }
  tick(now: number, visible = true): { time: number; elapsed: number; wrapped: boolean } {
    if (!Number.isFinite(now)) throw new RangeError('Clock timestamp must be finite');
    if (!visible) { this.suspend(); return { time: this.time, elapsed: 0, wrapped: false }; }
    const elapsed = this.playing && this.last !== undefined ? Math.max(0, (now - this.last) / 1000) * this.speed : 0;
    this.last = now;
    const next = this.time + elapsed, wrapped = this.loop && this.duration > 0 && next >= this.duration;
    this.time = wrapped ? next % this.duration : Math.min(next, this.duration);
    if (!this.loop && this.time >= this.duration) this.playing = false;
    return { time: this.time, elapsed, wrapped };
  }
}

export interface PixelViewport { scale: number; x: number; y: number; width: number; height: number; clipped: boolean }
/** Physical pixels, not CSS pixels. A too-small viewport clips at 1× instead of silently filtering. */
export function integerViewport(nativeWidth: number, nativeHeight: number, physicalWidth: number, physicalHeight: number): PixelViewport {
  if (![nativeWidth, nativeHeight, physicalWidth, physicalHeight].every(x => Number.isFinite(x) && x > 0)) throw new RangeError('Invalid viewport size');
  const scale = Math.max(1, Math.floor(Math.min(physicalWidth / nativeWidth, physicalHeight / nativeHeight)));
  const width = nativeWidth * scale, height = nativeHeight * scale;
  return { scale, width, height, x: Math.floor((physicalWidth - width) / 2), y: Math.floor((physicalHeight - height) / 2), clipped: width > physicalWidth || height > physicalHeight };
}
