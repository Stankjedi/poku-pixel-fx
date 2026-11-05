import { compileDrawScene, type CompiledDrawScene, type DrawScene } from './draw-ir.js';
import { ResidentGpuBuffers } from './gpu-resources.js';
import { checkedShader, GPU_BUFFER as B, type GpuBuffer, type GpuDevice, type GpuPipeline } from './gpu-types.js';
import type { GpuFrameBuffers } from './webgpu.js';
import { DRAW_IR_WGSL, DRAW_TILES_WGSL } from './wgsl.js';
import { DRAW_TILE_CAPACITY, DRAW_TILE_SIZE, summarizeDrawTiles, type DrawCullingMode, type DrawTileStats } from './draw-tiles.js';

export interface WebGPUDrawOptions {
  /** Auto uses GPU tile bins for >=32 primitives and >=256 native pixels. */
  culling?: DrawCullingMode;
}

/** Exact per-pixel alpha sorting with GPU-built spatial bins, including GPU particles. */
export class WebGPUDrawRenderer {
  readonly assets: ResidentGpuBuffers;
  private pipeline!: GpuPipeline;
  private tilePipeline!: GpuPipeline;
  private params: GpuBuffer;
  private previous?: CompiledDrawScene;
  private output?: GpuFrameBuffers;
  private revision = 0;
  private disposed = false;
  private combined?: GpuBuffer;
  private tiles?: GpuBuffer;
  private tileCount = 0;
  private commandCount = 0;
  private alphaCount = 0;
  private culling: DrawCullingMode;
  private cullingReason: string | null = null;
  private diagnostics?: GpuBuffer;

  private constructor(readonly device: GpuDevice, readonly maxBytes: number, options: WebGPUDrawOptions) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 32) throw new RangeError('DrawIR GPU budget must be a positive byte count');
    if (!['auto', 'none', 'tiled'].includes(options.culling ?? 'auto')) throw new RangeError('Unknown DrawIR culling mode');
    this.culling = options.culling ?? 'auto';
    this.assets = new ResidentGpuBuffers(device, maxBytes);
    this.params = device.createBuffer({ size: 16, usage: B.UNIFORM | B.COPY_DST });
  }

  static async create(device: GpuDevice, maxBytes = 128 * 1024 * 1024, options: WebGPUDrawOptions = {}): Promise<WebGPUDrawRenderer> {
    const renderer = new WebGPUDrawRenderer(device, maxBytes, options);
    try {
      const [draw, tiles] = await Promise.all([
        checkedShader(device, DRAW_IR_WGSL, 'DrawIR raster batch'),
        checkedShader(device, DRAW_TILES_WGSL, 'DrawIR tile culling'),
      ]);
      [renderer.pipeline, renderer.tilePipeline] = await Promise.all([
        device.createComputePipelineAsync({ layout: 'auto', compute: { module: draw, entryPoint: 'main' } }),
        device.createComputePipelineAsync({ layout: 'auto', compute: { module: tiles, entryPoint: 'main' } }),
      ]);
      return renderer;
    } catch (error) { renderer.dispose(); throw error; }
  }

  setCulling(mode: DrawCullingMode): void {
    if (this.disposed) throw new Error('DrawIR renderer is disposed');
    if (!['auto', 'none', 'tiled'].includes(mode)) throw new RangeError('Unknown DrawIR culling mode');
    this.culling = mode;
  }

  private baseBytes(w: number, h: number): number {
    return 16 + this.assets.resources.bytes + w * h * 20 + (this.combined?.size ?? 0) + (this.diagnostics?.size ?? 0);
  }

  private validateSize(w: number, h: number): void {
    const n = w * h, limits = this.device.limits;
    if (![w, h].every(v => Number.isSafeInteger(v) && v > 0) || !Number.isSafeInteger(n) || n * 12 > limits.maxStorageBufferBindingSize || n * 12 > limits.maxBufferSize || Math.ceil(Math.max(w, h) / 4) > (limits.maxComputeWorkgroupsPerDimension ?? 65535))
      throw new RangeError('DrawIR frame exceeds adapter dimensions or storage limits');
  }

  private allocate(w: number, h: number): GpuFrameBuffers {
    this.validateSize(w, h);
    if (this.baseBytes(w, h) > this.maxBytes) throw new RangeError('DrawIR frame and resident assets exceed GPU budget');
    if (this.output?.w === w && this.output.h === h) return this.output;
    this.output?.color.destroy(); this.output?.light.destroy(); this.output?.hdrLight?.destroy();
    this.output = undefined;
    const created: GpuBuffer[] = [];
    const buffer = (size: number) => { const b = this.device.createBuffer({ size, usage: B.STORAGE | B.COPY_SRC | B.COPY_DST }); created.push(b); return b; };
    try { return this.output = { w, h, color: buffer(w * h * 4), light: buffer(w * h * 4), hdrLight: buffer(w * h * 12) }; }
    catch (error) { created.forEach(b => b.destroy()); throw error; }
  }

  private prepareTiles(w: number, h: number, count: number): GpuBuffer | undefined {
    this.tileCount = 0; this.cullingReason = null;
    const worthwhile = count >= 32 && w * h >= 256;
    const requested = this.culling === 'tiled' || this.culling === 'auto' && worthwhile;
    if (requested && count > 0) {
      const total = Math.ceil(w / DRAW_TILE_SIZE) * Math.ceil(h / DRAW_TILE_SIZE);
      const bytes = total * (DRAW_TILE_CAPACITY + 1) * 4;
      if (bytes <= this.device.limits.maxStorageBufferBindingSize && bytes <= this.device.limits.maxBufferSize && this.baseBytes(w, h) + bytes <= this.maxBytes) {
        if (this.tiles?.size !== bytes) { this.tiles?.destroy(); this.tiles = this.device.createBuffer({ size: bytes, usage: B.STORAGE | B.COPY_SRC, label: 'DrawIR tile candidates' }); }
        this.tileCount = total; return this.tiles;
      }
      this.cullingReason = 'Tile bins exceed the available GPU budget; exact direct rasterization is active';
    }
    this.tiles?.destroy(); this.tiles = undefined;
    return undefined;
  }

  render(scene: DrawScene, cosmetic?: { commands: GpuBuffer; count: number; alphaPrimitives: 0 }): GpuFrameBuffers {
    if (this.disposed) throw new Error('DrawIR renderer is disposed');
    const compiled = compileDrawScene(scene, this.previous);
    this.validateSize(compiled.width, compiled.height);
    const cosmeticCount = cosmetic?.count ?? 0, count = compiled.count + cosmeticCount;
    if (cosmetic && (count > 16384 || cosmetic.alphaPrimitives !== 0 || !Number.isInteger(cosmeticCount) || cosmeticCount < 0 || cosmetic.commands.size < cosmeticCount * 128)) throw new RangeError('Invalid cosmetic DrawIR batch');
    const combinedBytes = cosmeticCount > 0 ? Math.max(128, count * 128) : 0;
    const assetBytes = compiled.commands.byteLength + compiled.color.byteLength + compiled.emission.byteLength + 12;
    if (16 + compiled.width * compiled.height * 20 + assetBytes + combinedBytes + (this.diagnostics?.size ?? 0) > this.maxBytes) throw new RangeError('DrawIR scene and resident assets exceed GPU budget');
    this.previous = compiled; this.assets.beginFrame();
    let commands = this.assets.upload('DrawIR commands', new Uint8Array(compiled.commands), ++this.revision, undefined, B.STORAGE | B.COPY_SRC);
    const colors = this.assets.upload('DrawIR color assets', compiled.color, compiled.assetRevision);
    const emission = this.assets.upload('DrawIR emission assets', compiled.emission, compiled.assetRevision);
    if (cosmeticCount > 0) {
      if (combinedBytes > this.device.limits.maxStorageBufferBindingSize) throw new RangeError('Combined DrawIR commands exceed storage binding limit');
      if (this.combined?.size !== combinedBytes) { this.combined?.destroy(); this.combined = this.device.createBuffer({ size: combinedBytes, usage: B.STORAGE | B.COPY_DST }); }
      const encoder = this.device.createCommandEncoder();
      if (compiled.count) encoder.copyBufferToBuffer(commands, 0, this.combined!, 0, compiled.count * 128);
      encoder.copyBufferToBuffer(cosmetic!.commands, 0, this.combined!, compiled.count * 128, cosmeticCount * 128);
      this.device.queue.submit([encoder.finish()]); commands = this.combined!;
    } else { this.combined?.destroy(); this.combined = undefined; }
    return this.renderCommandBuffer(compiled.width, compiled.height, commands, count, colors, emission, compiled.alphaPrimitives);
  }

  /** GPU command buffers remain resident. Producers must state the exact alpha budget. */
  renderCommandBuffer(w: number, h: number, commands: GpuBuffer, count: number, colors?: GpuBuffer, emission?: GpuBuffer, alphaPrimitives = 0): GpuFrameBuffers {
    if (this.disposed) throw new Error('DrawIR renderer is disposed');
    this.validateSize(w, h);
    if (!Number.isInteger(count) || count < 0 || count > 16384 || !Number.isInteger(alphaPrimitives) || alphaPrimitives < 0 || alphaPrimitives > 64 || alphaPrimitives > count || commands.size < Math.max(128, count * 128) || commands.size > this.device.limits.maxStorageBufferBindingSize) throw new RangeError('Invalid GPU DrawIR buffer contract');
    const zero = this.assets.upload('DrawIR zero asset', new Uint32Array(3), 0), frame = this.allocate(w, h), tiles = this.prepareTiles(w, h, count);
    this.commandCount = count; this.alphaCount = alphaPrimitives;
    this.device.queue.writeBuffer(this.params, 0, new Uint32Array([w, h, count, tiles ? DRAW_TILE_CAPACITY : 0]));
    const group = (pipeline: GpuPipeline, buffers: GpuBuffer[]) => this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const drawGroup = group(this.pipeline, [this.params, commands, colors ?? zero, emission ?? zero, frame.color, frame.light, frame.hdrLight!, tiles ?? zero]);
    const encoder = this.device.createCommandEncoder({ label: 'DrawIR spatially culled raster' }), pass = encoder.beginComputePass();
    if (tiles) {
      pass.setPipeline(this.tilePipeline); pass.setBindGroup(0, group(this.tilePipeline, [this.params, commands, tiles]));
      pass.dispatchWorkgroups(Math.ceil(this.tileCount / 64));
    }
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, drawGroup); pass.dispatchWorkgroups(Math.ceil(w / 4), Math.ceil(h / 4)); pass.end();
    this.device.queue.submit([encoder.finish()]); return frame;
  }

  /** Explicit diagnostic readback. Rendering itself never reads tile data on the CPU. */
  async inspectCulling(): Promise<DrawTileStats> {
    if (this.disposed) throw new Error('DrawIR renderer is disposed');
    if (!this.output) throw new Error('Render a scene before inspecting culling');
    const { w, h } = this.output, count = this.commandCount;
    if (!this.tiles) return summarizeDrawTiles(w, h, count);
    if (this.diagnostics) throw new Error('A culling inspection is already pending');
    if (this.baseBytes(w, h) + this.tiles.size * 2 > this.maxBytes) throw new RangeError('Culling inspection exceeds GPU budget');
    const read = this.diagnostics = this.device.createBuffer({ size: this.tiles.size, usage: B.COPY_DST | B.MAP_READ, label: 'DrawIR diagnostic staging' });
    try {
      const encoder = this.device.createCommandEncoder(); encoder.copyBufferToBuffer(this.tiles, 0, read, 0, this.tiles.size);
      this.device.queue.submit([encoder.finish()]); await read.mapAsync(B.MAP_READ);
      return summarizeDrawTiles(w, h, count, new Uint32Array(read.getMappedRange()));
    } finally { try { read.unmap(); } finally { read.destroy(); if (this.diagnostics === read) this.diagnostics = undefined; } }
  }

  get resources() {
    const outputBytes = this.output ? this.output.w * this.output.h * 20 : 0;
    return { ...this.assets.resources, outputBytes, commandMergeBytes: this.combined?.size ?? 0, tileBytes: this.tiles?.size ?? 0, diagnosticBytes: this.diagnostics?.size ?? 0,
      primitives: this.commandCount, alphaPrimitives: this.alphaCount, culling: this.tileCount ? 'tiled' as const : 'direct' as const, tiles: this.tileCount, cullingReason: this.cullingReason };
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.assets.dispose(); this.params.destroy(); this.combined?.destroy(); this.tiles?.destroy(); this.diagnostics?.destroy();
    this.output?.color.destroy(); this.output?.light.destroy(); this.output?.hdrLight?.destroy(); this.previous = undefined;
    this.combined = this.tiles = this.diagnostics = undefined; this.output = undefined;
    this.tileCount = this.commandCount = this.alphaCount = 0;
  }
}
