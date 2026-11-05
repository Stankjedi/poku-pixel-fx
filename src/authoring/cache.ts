/** Explicit invalidation and a byte budget; cache keys never include mutable runtime instances. */
export class BudgetCache<T> {
  private entries = new Map<string, { value: T; bytes: number; tags: Set<string> }>();
  bytes = 0; hits = 0; misses = 0;
  constructor(readonly maxBytes = 32 * 1024 * 1024) { if (!(maxBytes > 0)) throw new RangeError('Cache budget must be positive'); }
  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) { this.misses++; return; }
    this.hits++; this.entries.delete(key); this.entries.set(key, e); return e.value;
  }
  set(key: string, value: T, bytes: number, tags: readonly string[] = []): void {
    if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError('Invalid cache size');
    this.delete(key); if (bytes > this.maxBytes) return;
    while (this.bytes + bytes > this.maxBytes && this.entries.size) this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, bytes, tags: new Set(tags) }); this.bytes += bytes;
  }
  delete(key: string): void { const e = this.entries.get(key); if (e) this.bytes -= e.bytes; this.entries.delete(key); }
  invalidate(tag: string): void { for (const [key, e] of this.entries) if (e.tags.has(tag)) this.delete(key); }
  clear(): void { this.entries.clear(); this.bytes = 0; }
  get size(): number { return this.entries.size; }
}

export interface CheckpointSimulation<S> { step(dt: number): void; capture(): S; restore(state: S): void; }
/** Complete state (including RNG) is supplied by the simulation. No attempt to clone closures. */
export class CheckpointTimeline<S> {
  private checkpoints = new Map<number, S>(); private tick = 0; private initial: S;
  constructor(private simulation: CheckpointSimulation<S>, readonly tickRate = 120, readonly interval = 120, readonly maximum = 32) {
    if (![tickRate, interval, maximum].every(x => Number.isInteger(x) && x > 0)) throw new RangeError('Invalid checkpoint policy');
    this.initial = simulation.capture(); this.checkpoints.set(0, this.initial);
  }
  seek(time: number): { tick: number; replayedTicks: number; checkpoints: number } {
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid seek time');
    const target = Math.floor(time * this.tickRate + 1e-9);
    let closest = this.tick <= target ? this.tick : 0;
    for (const tick of this.checkpoints.keys()) if (tick <= target && tick > closest) closest = tick;
    if (closest !== this.tick) { this.simulation.restore(this.checkpoints.get(closest) ?? this.initial); this.tick = closest; }
    const from = this.tick;
    while (this.tick < target) {
      this.simulation.step(1 / this.tickRate); this.tick++;
      if (this.tick % this.interval === 0) {
        this.checkpoints.set(this.tick, this.simulation.capture());
        while (this.checkpoints.size > this.maximum) {
          const oldest = [...this.checkpoints.keys()].find(x => x !== 0);
          if (oldest === undefined) break; this.checkpoints.delete(oldest);
        }
      }
    }
    return { tick: this.tick, replayedTicks: this.tick - from, checkpoints: this.checkpoints.size };
  }
  invalidate(): void { this.simulation.restore(this.initial); this.tick = 0; this.checkpoints.clear(); this.checkpoints.set(0, this.initial); }
}

export interface Bounds2D { x: number; y: number; width: number; height: number; }
export function overlaps(a: Bounds2D, b: Bounds2D, halo = 0): boolean {
  return a.x - halo < b.x + b.width && a.x + a.width + halo > b.x && a.y - halo < b.y + b.height && a.y + a.height + halo > b.y;
}
export function activeAt(time: number, start: number, end: number, tail = 0): boolean { return time >= start && time < end + tail; }

/** Conservative retained-data accounting, including typed-array storage and repeated references. */
export function retainedBytes(value:unknown):number{
  const seen=new Set<object>();
  function count(v:unknown):number{
    if(v===null||v===undefined)return 0;if(typeof v==='number')return 8;if(typeof v==='boolean')return 4;if(typeof v==='string')return v.length*2;
    if(typeof v!=='object'||seen.has(v))return 0;seen.add(v);
    if(ArrayBuffer.isView(v))return v.byteLength;if(v instanceof ArrayBuffer)return v.byteLength;
    if(v instanceof Map)return 64+[...v].reduce((n,[k,v])=>n+count(k)+count(v),0);
    if(v instanceof Set)return 64+[...v].reduce<number>((n,v)=>n+count(v),0);
    return 64+Object.entries(v).reduce((n,[k,v])=>n+k.length*2+count(v),0);
  }
  return count(value);
}
