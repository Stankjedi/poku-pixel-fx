export type RenderPhase = 'update' | 'draw' | 'prepare' | 'upload' | 'encode' | 'gpu' | 'present' | 'readback' | 'encodeFile';
/** Host and renderer can use one frame record without conflating GPU timestamps with CPU submission. */
export class FrameProfiler {
  private phases: Partial<Record<RenderPhase, number>> = {};
  private history: Partial<Record<RenderPhase, number>>[] = [];
  private frame = 0;
  constructor(readonly samples = 120) { if (!Number.isInteger(samples) || samples < 1) throw new RangeError('Profiler samples must be positive'); }
  beginFrame(): void { this.phases = {}; this.frame++; }
  record(phase: RenderPhase, ms: number): void { if (Number.isFinite(ms) && ms >= 0) this.phases[phase] = (this.phases[phase] ?? 0) + ms; }
  measure<T>(phase: RenderPhase, fn: () => T): T { const t = performance.now(); try { return fn(); } finally { this.record(phase, performance.now() - t); } }
  endFrame(): void { this.history.push({ ...this.phases }); if (this.history.length > this.samples) this.history.shift(); }
  snapshot() {
    const percentiles: Partial<Record<RenderPhase, { p50: number; p95: number; count: number }>> = {};
    for (const phase of new Set(this.history.flatMap(h => Object.keys(h) as RenderPhase[]))) {
      const values = this.history.flatMap(h => h[phase] === undefined ? [] : [h[phase]!]).sort((a, b) => a - b);
      percentiles[phase] = { p50: values[Math.floor((values.length - 1) * .5)], p95: values[Math.floor((values.length - 1) * .95)], count: values.length };
    }
    return { frame: this.frame, latest: { ...this.phases }, percentiles };
  }
}
