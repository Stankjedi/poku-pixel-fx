import { checkedShader, GPU_BUFFER as B, type GpuBuffer, type GpuDevice, type GpuPipeline } from './gpu-types.js';
import { PARTICLES_WGSL } from './wgsl.js';
import type { IRPoint } from './draw-ir.js';
export interface CosmeticParticleSpawn {
  position: IRPoint; velocity: IRPoint; lifetime: number; radius: number; color: number;
  emission?: number; gravity?: IRPoint; drag?: number; spread?: number; seed?: number; blend?: 'additive' | 'cutout';
}
/** Cosmetic particles never feed gameplay or collision. GPU output is a resident DrawIR batch. */
export class GpuParticleSystem {
  readonly commands: GpuBuffer; readonly alphaPrimitives = 0;
  private particles: GpuBuffer; private uniform: GpuBuffer; private pipeline!: GpuPipeline;
  private expires: Float64Array; private nextId = 1; private accumulator = 0; private currentTick = 0; private disposed = false;
  private constructor(readonly device: GpuDevice, readonly capacity: number, readonly seed: number, readonly hz: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16384 || !Number.isInteger(hz) || hz < 1 || hz > 1000) throw new RangeError('Invalid cosmetic particle capacity or fixed tick rate');
    this.expires = new Float64Array(capacity);
    this.particles = device.createBuffer({ size: capacity * 80, usage: B.STORAGE | B.COPY_DST | B.COPY_SRC });
    this.commands = device.createBuffer({ size: capacity * 128, usage: B.STORAGE | B.COPY_SRC });
    this.uniform = device.createBuffer({ size: 16, usage: B.UNIFORM | B.COPY_DST });
  }
  static async create(device: GpuDevice, options: { capacity?: number; seed?: number; hz?: number } = {}): Promise<GpuParticleSystem> {
    const p = new GpuParticleSystem(device, options.capacity ?? 1024, (options.seed ?? 42) >>> 0, options.hz ?? 120);
    try { const module = await checkedShader(device, PARTICLES_WGSL, 'fixed-tick cosmetic particles'); p.pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } }); p.advance(0); return p; }
    catch (error) { p.dispose(); throw error; }
  }
  get count(): number { return this.capacity; }
  get tick(): number { return this.currentTick; }
  get active(): number { return this.expires.reduce((n, expiry) => n + (expiry > this.currentTick ? 1 : 0), 0); }
  spawn(spec: CosmeticParticleSpawn): { id: number; slot: number } {
    if (this.disposed) throw new Error('Particle system is disposed');
    if (![...spec.position, ...spec.velocity, ...(spec.gravity ?? [0, 0, 0]), spec.lifetime, spec.radius, spec.emission ?? 1, spec.drag ?? 0, spec.spread ?? 0].every(Number.isFinite) || spec.position.length !== 3 || spec.velocity.length !== 3 || spec.lifetime <= 0 || spec.radius < 0 || (spec.drag ?? 0) < 0 || (spec.emission ?? 1) < 0 || (spec.spread ?? 0) < 0 || !Number.isInteger(spec.color) || spec.color < 0 || spec.color > 0xffffffff) throw new RangeError('Invalid cosmetic particle');
    const slot = this.expires.findIndex(expiry => expiry <= this.currentTick); if (slot < 0) throw new RangeError('Cosmetic particle capacity reached');
    const lifetimeTicks = Math.ceil(spec.lifetime * this.hz);
    if (lifetimeTicks > 16_777_216) throw new RangeError('Cosmetic lifetime exceeds exact integer tick storage');
    if (this.nextId > 0xffffffff) throw new RangeError('Particle stable ID exhausted; clear the system explicitly');
    const id = this.nextId++, data = new ArrayBuffer(80), f = new Float32Array(data), u = new Uint32Array(data);
    f.set(spec.position, 0); f.set(spec.velocity, 4); f[7] = lifetimeTicks; f.set([spec.radius, spec.drag ?? 0, spec.emission ?? 1, 0], 8);
    u.set([id, (spec.seed ?? this.seed) >>> 0, spec.color, spec.blend === 'cutout' ? 7 : 3], 12); f.set(spec.gravity ?? [0, 0, 0], 16); f[19] = spec.spread ?? 0;
    this.device.queue.writeBuffer(this.particles, slot * 80, data); this.expires[slot] = this.currentTick + lifetimeTicks; return { id, slot };
  }
  advance(dt: number): void {
    if (this.disposed) throw new Error('Particle system is disposed');
    if (!Number.isFinite(dt) || dt < 0 || dt > 2) throw new RangeError('Cosmetic update dt must be 0..2 seconds; subdivide longer seeks');
    this.accumulator += dt * this.hz; const steps = Math.floor(this.accumulator + 1e-9); this.accumulator -= steps; this.currentTick += steps;
    const data = new ArrayBuffer(16), f = new Float32Array(data), u = new Uint32Array(data); f[0] = 1 / this.hz; u.set([steps, this.capacity, this.currentTick >>> 0], 1); this.device.queue.writeBuffer(this.uniform, 0, data);
    const group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [this.uniform, this.particles, this.commands].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const encoder = this.device.createCommandEncoder({ label: 'cosmetic particle fixed ticks' }), pass = encoder.beginComputePass(); pass.setPipeline(this.pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(Math.ceil(this.capacity / 64)); pass.end(); this.device.queue.submit([encoder.finish()]);
  }
  /** Explicit diagnostic readback; ordinary update and drawing never call it. */
  async snapshot(): Promise<Float32Array> {
    if (this.disposed) throw new Error('Particle system is disposed');
    const buffer = this.device.createBuffer({ size: this.capacity * 80, usage: B.COPY_DST | B.MAP_READ });
    try { const e = this.device.createCommandEncoder(); e.copyBufferToBuffer(this.particles, 0, buffer, 0, this.capacity * 80); this.device.queue.submit([e.finish()]); await buffer.mapAsync(B.MAP_READ); return new Float32Array(buffer.getMappedRange().slice(0)); }
    finally { buffer.unmap(); buffer.destroy(); }
  }
  clear(): void {
    if (this.disposed) throw new Error('Particle system is disposed');
    this.expires.fill(0); this.nextId = 1; this.accumulator = this.currentTick = 0; this.device.queue.writeBuffer(this.particles, 0, new Uint8Array(this.capacity * 80)); this.advance(0);
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.particles.destroy(); this.commands.destroy(); this.uniform.destroy(); }
}
