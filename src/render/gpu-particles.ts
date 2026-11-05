import { checkedShader, GPU_BUFFER as B, type GpuBuffer, type GpuDevice, type GpuPipeline } from './gpu-types.js';
import { PARTICLES_WGSL } from './wgsl.js';
import type { IRPoint } from './draw-ir.js';

export interface CosmeticParticleSpawn {
  position: IRPoint; velocity: IRPoint; lifetime: number; radius: number; color: number;
  emission?: number; gravity?: IRPoint; drag?: number; spread?: number; seed?: number; blend?: 'additive' | 'cutout';
}
export interface CosmeticParticleHandle { id: number; slot: number }

/** Small stable heaps keep sparse pools from scanning every allocated slot. */
class SlotHeap {
  constructor(readonly values: number[], private readonly before: (a: number, b: number) => boolean) {}
  push(slot: number): void {
    const a = this.values; let i = a.length; a.push(slot);
    while (i > 0) { const parent = (i - 1) >>> 1; if (!this.before(slot, a[parent])) break; a[i] = a[parent]; i = parent; }
    a[i] = slot;
  }
  pop(): number {
    const a = this.values, result = a[0], last = a.pop()!;
    if (!a.length) return result;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let child = i * 2 + 1;
      if (child + 1 < a.length && this.before(a[child + 1], a[child])) child++;
      if (!this.before(a[child], last)) break;
      a[i] = a[child]; i = child;
    }
    a[i] = last; return result;
  }
}

const STATE_BYTES = 80, COMMAND_BYTES = 128;
const uint32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
function validateSpawn(spec: CosmeticParticleSpawn, hz: number): number {
  const gravity = spec.gravity ?? [0, 0, 0];
  if (spec.position.length !== 3 || spec.velocity.length !== 3 || gravity.length !== 3 ||
      ![...spec.position, ...spec.velocity, ...gravity, spec.lifetime, spec.radius, spec.emission ?? 1, spec.drag ?? 0, spec.spread ?? 0].every(n => Number.isFinite(n) && Number.isFinite(Math.fround(n))) ||
      spec.lifetime <= 0 || spec.radius < 0 || (spec.drag ?? 0) < 0 || (spec.emission ?? 1) < 0 || (spec.spread ?? 0) < 0 || !uint32(spec.color) ||
      spec.seed !== undefined && !uint32(spec.seed) || spec.blend !== undefined && spec.blend !== 'additive' && spec.blend !== 'cutout')
    throw new RangeError('Invalid cosmetic particle');
  const lifetime = Math.ceil(spec.lifetime * hz);
  if (lifetime > 16_777_216) throw new RangeError('Cosmetic lifetime exceeds exact integer tick storage');
  return lifetime;
}

/** Cosmetic particles never feed gameplay or collision. GPU output is a resident DrawIR batch. */
export class GpuParticleSystem {
  readonly commands: GpuBuffer; readonly alphaPrimitives = 0;
  private particles: GpuBuffer; private uniform: GpuBuffer; private pipeline!: GpuPipeline; private group!: object;
  private expires: Float64Array; private freeSlots: SlotHeap; private expirySlots: SlotHeap;
  private staging: ArrayBuffer; private stagedFloats: Float32Array; private stagedWords: Uint32Array; private dirty: Uint8Array;
  private pending = 0; private firstDirty: number; private lastDirty = -1; private commandsDirty = false;
  private range = 0; private peakRange = 0; private live = 0;
  private nextId = 1; private accumulator = 0; private currentTick = 0; private disposed = false;
  private params = new ArrayBuffer(16); private paramsFloat = new Float32Array(this.params); private paramsUint = new Uint32Array(this.params);
  private uploadedBytes = 0; private uploadCalls = 0; private dispatches = 0; private updatedSlots = 0; private lastUpdateSlots = 0;

  private constructor(readonly device: GpuDevice, readonly capacity: number, readonly seed: number, readonly hz: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16384 || !Number.isInteger(hz) || hz < 1 || hz > 1000 || !uint32(seed))
      throw new RangeError('Invalid cosmetic particle capacity, seed or fixed tick rate');
    if (capacity * COMMAND_BYTES > Math.min(device.limits.maxStorageBufferBindingSize ?? Infinity, device.limits.maxBufferSize ?? Infinity) ||
        Math.ceil(capacity / 64) > (device.limits.maxComputeWorkgroupsPerDimension ?? 65535))
      throw new RangeError('Cosmetic particle pool exceeds adapter buffer or dispatch limits');
    this.expires = new Float64Array(capacity);
    this.freeSlots = new SlotHeap(Array.from({ length: capacity }, (_, i) => i), (a, b) => a < b);
    this.expirySlots = new SlotHeap([], (a, b) => this.expires[a] < this.expires[b] || this.expires[a] === this.expires[b] && a < b);
    this.staging = new ArrayBuffer(capacity * STATE_BYTES); this.stagedFloats = new Float32Array(this.staging); this.stagedWords = new Uint32Array(this.staging);
    this.dirty = new Uint8Array(capacity); this.firstDirty = capacity;
    const created: GpuBuffer[] = [];
    const buffer = (size: number, usage: number) => { const b = device.createBuffer({ size, usage }); created.push(b); return b; };
    try {
      this.particles = buffer(capacity * STATE_BYTES, B.STORAGE | B.COPY_DST | B.COPY_SRC);
      this.commands = buffer(capacity * COMMAND_BYTES, B.STORAGE | B.COPY_SRC | B.COPY_DST);
      this.uniform = buffer(16, B.UNIFORM | B.COPY_DST);
    } catch (error) { created.forEach(b => b.destroy()); throw error; }
  }

  static async create(device: GpuDevice, options: { capacity?: number; seed?: number; hz?: number } = {}): Promise<GpuParticleSystem> {
    const p = new GpuParticleSystem(device, options.capacity ?? 1024, options.seed ?? 42, options.hz ?? 120);
    try {
      const module = await checkedShader(device, PARTICLES_WGSL, 'fixed-tick cosmetic particles');
      p.pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
      p.group = device.createBindGroup({ layout: p.pipeline.getBindGroupLayout(0), entries: [p.uniform, p.particles, p.commands].map((buffer, binding) => ({ binding, resource: { buffer } })) });
      return p;
    } catch (error) { p.dispose(); throw error; }
  }

  /** Only this prefix contains live commands. Holes retain their stable slot/order. */
  get count(): number { return this.range; }
  get tick(): number { return this.currentTick; }
  get active(): number { return this.live; }
  get resources() {
    return { capacity: this.capacity, active: this.live, drawSlots: this.range, pendingSpawns: this.pending,
      allocatedBytes: this.disposed ? 0 : this.capacity * (STATE_BYTES + COMMAND_BYTES) + 16, stagingBytes: this.staging.byteLength,
      spawnUploadBytes: this.uploadedBytes, spawnUploadCalls: this.uploadCalls, dispatches: this.dispatches,
      updatedSlots: this.updatedSlots, lastUpdateSlots: this.lastUpdateSlots, lastWorkgroups: Math.ceil(this.lastUpdateSlots / 64) };
  }

  spawn(spec: CosmeticParticleSpawn): CosmeticParticleHandle { return this.spawnBatch([spec])[0]; }

  /** Validate the whole burst before reserving IDs/slots. Uploads coalesce at advance/snapshot. */
  spawnBatch(specs: readonly CosmeticParticleSpawn[]): CosmeticParticleHandle[] {
    if (this.disposed) throw new Error('Particle system is disposed');
    if (specs.length > this.capacity - this.live) throw new RangeError('Cosmetic particle capacity reached');
    if (this.nextId + specs.length - 1 > 0xffffffff) throw new RangeError('Particle stable ID exhausted; clear the system explicitly');
    const lifetimes = specs.map(spec => validateSpawn(spec, this.hz)), handles: CosmeticParticleHandle[] = [];
    specs.forEach((spec, k) => {
      const slot = this.freeSlots.pop(), id = this.nextId++, i = slot * 20;
      this.stagedWords.fill(0, i, i + 20);
      this.stagedFloats.set(spec.position, i); this.stagedFloats.set(spec.velocity, i + 4); this.stagedFloats[i + 7] = lifetimes[k];
      this.stagedFloats.set([spec.radius, spec.drag ?? 0, spec.emission ?? 1, 0], i + 8);
      this.stagedWords.set([id, spec.seed ?? this.seed, spec.color, spec.blend === 'cutout' ? 7 : 3], i + 12);
      this.stagedFloats.set(spec.gravity ?? [0, 0, 0], i + 16); this.stagedFloats[i + 19] = spec.spread ?? 0;
      this.expires[slot] = this.currentTick + lifetimes[k]; this.expirySlots.push(slot);
      this.dirty[slot] = 1; this.pending++; this.firstDirty = Math.min(this.firstDirty, slot); this.lastDirty = Math.max(this.lastDirty, slot);
      this.range = Math.max(this.range, slot + 1); this.peakRange = Math.max(this.peakRange, this.range); this.live++;
      handles.push({ id, slot });
    });
    this.commandsDirty ||= specs.length > 0;
    return handles;
  }

  private flushSpawns(): void {
    if (!this.pending) return;
    for (let i = this.firstDirty; i <= this.lastDirty;) {
      if (!this.dirty[i]) { i++; continue; }
      const start = i; while (i <= this.lastDirty && this.dirty[i]) i++;
      const size = (i - start) * STATE_BYTES;
      // Only newly spawned slots are uploaded: never overwrite an intervening live
      // slot with its stale CPU staging data while that slot advances on the GPU.
      this.device.queue.writeBuffer(this.particles, start * STATE_BYTES, this.staging, start * STATE_BYTES, size);
      this.uploadedBytes += size; this.uploadCalls++;
    }
    this.dirty.fill(0, this.firstDirty, this.lastDirty + 1); this.pending = 0; this.firstDirty = this.capacity; this.lastDirty = -1;
  }

  advance(dt: number): void {
    if (this.disposed) throw new Error('Particle system is disposed');
    if (!Number.isFinite(dt) || dt < 0 || dt > 2) throw new RangeError('Cosmetic update dt must be 0..2 seconds; subdivide longer seeks');
    const accumulated = this.accumulator + dt * this.hz, steps = Math.floor(accumulated + 1e-9), tick = this.currentTick + steps;
    if (!Number.isSafeInteger(tick)) throw new RangeError('Cosmetic tick counter exhausted; clear the system explicitly');
    this.flushSpawns(); this.lastUpdateSlots = 0;
    if (this.range > 0 && (steps > 0 || this.commandsDirty)) {
      this.paramsFloat[0] = 1 / this.hz; this.paramsUint.set([steps, this.range, tick >>> 0], 1);
      this.device.queue.writeBuffer(this.uniform, 0, this.params);
      const encoder = this.device.createCommandEncoder({ label: 'cosmetic particle fixed ticks' }), pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.dispatchWorkgroups(Math.ceil(this.range / 64)); pass.end();
      this.device.queue.submit([encoder.finish()]);
      this.dispatches++; this.updatedSlots += this.range; this.lastUpdateSlots = this.range; this.commandsDirty = false;
    }
    this.accumulator = Math.max(0, accumulated - steps); this.currentTick = tick;
    // Expire after dispatch so the final update clears dead command/state slots,
    // preserving exact diagnostic snapshots across different dt partitions.
    while (this.expirySlots.values.length && this.expires[this.expirySlots.values[0]] <= tick) {
      const slot = this.expirySlots.pop(); this.expires[slot] = 0; this.live--; this.freeSlots.push(slot);
    }
    while (this.range > 0 && this.expires[this.range - 1] === 0) this.range--;
  }

  /** Explicit diagnostic readback; ordinary update and drawing never call it. */
  async snapshot(): Promise<Float32Array> {
    if (this.disposed) throw new Error('Particle system is disposed');
    this.flushSpawns();
    const buffer = this.device.createBuffer({ size: this.capacity * STATE_BYTES, usage: B.COPY_DST | B.MAP_READ });
    try { const e = this.device.createCommandEncoder(); e.copyBufferToBuffer(this.particles, 0, buffer, 0, this.capacity * STATE_BYTES); this.device.queue.submit([e.finish()]); await buffer.mapAsync(B.MAP_READ); return new Float32Array(buffer.getMappedRange().slice(0)); }
    finally { buffer.unmap(); buffer.destroy(); }
  }

  clear(): void {
    if (this.disposed) throw new Error('Particle system is disposed');
    if (this.peakRange) {
      const zero = new Uint8Array(this.peakRange * COMMAND_BYTES);
      this.device.queue.writeBuffer(this.particles, 0, zero.subarray(0, this.peakRange * STATE_BYTES));
      this.device.queue.writeBuffer(this.commands, 0, zero);
    }
    this.expires.fill(0); this.dirty.fill(0); this.expirySlots.values.length = 0;
    this.freeSlots.values.length = this.capacity; for (let i = 0; i < this.capacity; i++) this.freeSlots.values[i] = i;
    this.nextId = 1; this.accumulator = this.currentTick = this.range = this.peakRange = this.live = this.pending = this.lastUpdateSlots = 0;
    this.firstDirty = this.capacity; this.lastDirty = -1; this.commandsDirty = false;
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.particles.destroy(); this.commands.destroy(); this.uniform.destroy();
    this.live = this.range = this.pending = this.lastUpdateSlots = 0;
    this.expirySlots.values.length = this.freeSlots.values.length = 0;
    this.staging = new ArrayBuffer(0); this.stagedFloats = new Float32Array(0); this.stagedWords = new Uint32Array(0);
    this.expires = new Float64Array(0); this.dirty = new Uint8Array(0);
  }
}
