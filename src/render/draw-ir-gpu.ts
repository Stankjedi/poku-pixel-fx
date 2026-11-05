import { compileDrawScene, type CompiledDrawScene, type DrawScene } from './draw-ir.js';
import { ResidentGpuBuffers } from './gpu-resources.js';
import { checkedShader, GPU_BUFFER as B, type GpuBuffer, type GpuDevice, type GpuPipeline } from './gpu-types.js';
import type { GpuFrameBuffers } from './webgpu.js';
import { DRAW_IR_WGSL } from './wgsl.js';

/** Batches a whole DrawIR submission into one compute dispatch with exact per-pixel alpha sorting. */
export class WebGPUDrawRenderer {
  readonly assets: ResidentGpuBuffers;
  private pipeline!: GpuPipeline; private params: GpuBuffer; private previous?: CompiledDrawScene;
  private output?: GpuFrameBuffers; private revision = 0; private disposed = false;
  private combined?: GpuBuffer;
  private constructor(readonly device: GpuDevice, readonly maxBytes: number) {
    this.assets = new ResidentGpuBuffers(device, maxBytes);
    this.params = device.createBuffer({ size: 16, usage: B.UNIFORM | B.COPY_DST });
  }
  static async create(device: GpuDevice, maxBytes = 128 * 1024 * 1024): Promise<WebGPUDrawRenderer> {
    const r = new WebGPUDrawRenderer(device, maxBytes);
    try { const module = await checkedShader(device, DRAW_IR_WGSL, 'DrawIR raster batch'); r.pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } }); return r; }
    catch (error) { r.dispose(); throw error; }
  }
  private allocate(w: number, h: number): GpuFrameBuffers {
    if (this.output?.w === w && this.output.h === h) return this.output;
    const n = w * h; if (n * 20 > this.maxBytes || n * 12 > this.device.limits.maxStorageBufferBindingSize) throw new RangeError('DrawIR frame exceeds GPU budget');
    this.output?.color.destroy(); this.output?.light.destroy(); this.output?.hdrLight?.destroy();
    const buffer = (size: number) => this.device.createBuffer({ size, usage: B.STORAGE | B.COPY_SRC | B.COPY_DST });
    return this.output = { w, h, color: buffer(n * 4), light: buffer(n * 4), hdrLight: buffer(n * 12) };
  }
  render(scene: DrawScene, cosmetic?: { commands: GpuBuffer; count: number; alphaPrimitives: 0 }): GpuFrameBuffers {
    if (this.disposed) throw new Error('DrawIR renderer is disposed');
    const c = compileDrawScene(scene, this.previous); this.previous = c; this.assets.beginFrame();
    let commands = this.assets.upload('DrawIR commands', new Uint8Array(c.commands), ++this.revision, undefined, B.STORAGE | B.COPY_SRC);
    const colors = this.assets.upload('DrawIR color assets', c.color, c.assetRevision), emission = this.assets.upload('DrawIR emission assets', c.emission, c.assetRevision);
    let count = c.count;
    if (cosmetic) {
      count += cosmetic.count; const bytes = Math.max(128, count * 128);
      if (count > 16384 || cosmetic.alphaPrimitives !== 0 || !Number.isInteger(cosmetic.count) || cosmetic.count < 0 || cosmetic.commands.size < cosmetic.count * 128) throw new RangeError('Invalid cosmetic DrawIR batch');
      if (!this.combined || this.combined.size !== bytes) { this.combined?.destroy(); this.combined = this.device.createBuffer({ size: bytes, usage: B.STORAGE | B.COPY_DST }); }
      const e = this.device.createCommandEncoder();
      if (c.count) e.copyBufferToBuffer(commands, 0, this.combined, 0, c.count * 128);
      if (cosmetic.count) e.copyBufferToBuffer(cosmetic.commands, 0, this.combined, c.count * 128, cosmetic.count * 128);
      this.device.queue.submit([e.finish()]); commands = this.combined;
    }
    return this.renderCommandBuffer(c.width, c.height, commands, count, colors, emission, c.alphaPrimitives);
  }
  /** For GPU-generated cosmetic command buffers. Alpha budget must be stated by the producer. */
  renderCommandBuffer(w: number, h: number, commands: GpuBuffer, count: number, colors?: GpuBuffer, emission?: GpuBuffer, alphaPrimitives = 0): GpuFrameBuffers {
    if (this.disposed) throw new Error('DrawIR renderer is disposed');
    if (![w, h].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isInteger(count) || count < 0 || count > 16384 || !Number.isInteger(alphaPrimitives) || alphaPrimitives < 0 || alphaPrimitives > 64 || commands.size < Math.max(128, count * 128)) throw new RangeError('Invalid GPU DrawIR buffer contract');
    const frame = this.allocate(w, h), zero = this.assets.upload('DrawIR zero asset', new Uint32Array(3), 0);
    this.device.queue.writeBuffer(this.params, 0, new Uint32Array([w, h, count, 0]));
    const group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [this.params, commands, colors ?? zero, emission ?? zero, frame.color, frame.light, frame.hdrLight!].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const encoder = this.device.createCommandEncoder({ label: 'DrawIR batched raster' }), pass = encoder.beginComputePass(); pass.setPipeline(this.pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(Math.ceil(w / 4), Math.ceil(h / 4)); pass.end(); this.device.queue.submit([encoder.finish()]); return frame;
  }
  get resources() { return { ...this.assets.resources, outputBytes: this.output ? this.output.w * this.output.h * 20 : 0, primitives: this.previous?.count ?? 0, alphaPrimitives: this.previous?.alphaPrimitives ?? 0 }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.assets.dispose(); this.params.destroy(); this.combined?.destroy(); this.output?.color.destroy(); this.output?.light.destroy(); this.output?.hdrLight?.destroy(); this.previous = undefined; }
}
