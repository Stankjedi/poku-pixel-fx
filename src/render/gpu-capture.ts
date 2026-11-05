import type { CinematicFrame, CinematicOptions } from './cinematic.js';
export interface CinematicCaptureSource { frame: CinematicFrame; options?: CinematicOptions; time: number; duration: number }
export interface CapturedCinematicFrame { rgba: Uint8ClampedArray; width: number; height: number; time: number; duration: number; index: number }
export interface AsyncCinematicCaptureRenderer { render(frame: CinematicFrame, options?: CinematicOptions): unknown; capture(): Promise<Uint8ClampedArray> }
/** Bounded render→map→encode streaming. A sink may write a WebCodecs frame, PNG or atlas page. */
export async function captureCinematicSequence(
  renderer: AsyncCinematicCaptureRenderer,
  source: AsyncIterable<CinematicCaptureSource> | Iterable<CinematicCaptureSource>,
  sink: (frame: CapturedCinematicFrame) => Promise<void>,
  options: { inFlight?: number; signal?: AbortSignal; onProgress?: (completed: number) => void } = {},
): Promise<number> {
  const capacity = options.inFlight ?? 2;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 3) throw new RangeError('Capture streaming supports 1..3 in-flight frames');
  const pending: Promise<CapturedCinematicFrame>[] = []; let index = 0, completed = 0;
  const check = () => { if (options.signal?.aborted) throw options.signal.reason ?? new Error('Capture cancelled'); };
  const flush = async () => { check(); const frame = await pending.shift()!; check(); await sink(frame); completed++; options.onProgress?.(completed); };
  try {
    for await (const input of source) {
      check(); if (!Number.isFinite(input.time) || !Number.isFinite(input.duration) || input.duration <= 0) throw new RangeError('Capture requires finite time and positive duration');
      while (pending.length >= capacity) await flush();
      renderer.render(input.frame, input.options); const { w: width, h: height } = input.frame, { time, duration } = input, frameIndex = index++;
      // Capture submits its texture copy before the next render overwrites that target.
      const work = renderer.capture().then(rgba => ({ rgba, width, height, time, duration, index: frameIndex }));
      void work.catch(() => {}); pending.push(work);
    }
    while (pending.length) await flush(); return completed;
  } finally { await Promise.allSettled(pending); }
}
