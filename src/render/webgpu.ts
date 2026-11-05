import { CinematicCompositor, type CinematicFrame, type CinematicOptions } from './cinematic.js';
import { ResidentGpuBuffers } from './gpu-resources.js';
import { checkedShader, navigatorGPU, GPU_BUFFER as B, GPU_TEXTURE as T, type GpuBuffer, type GpuCanvas, type GpuCanvasContext, type GpuDevice, type GpuPipeline, type GpuTexture } from './gpu-types.js';
import { CINEMATIC_PREPARE_WGSL, CINEMATIC_BLOOM_WGSL, CINEMATIC_RESOLVE_WGSL, PRESENT_WGSL } from './wgsl.js';

export interface CinematicRendererStatus {
  backend: 'cpu' | 'webgpu'; state: 'ready' | 'lost' | 'disposed'; reason: string | null;
  adapter?: { vendor?: string; architecture?: string; device?: string; description?: string; software: boolean | null };
  timestampQuery: boolean;
}
export interface GpuFrameBuffers { w: number; h: number; color: GpuBuffer; light: GpuBuffer; hdrLight?: GpuBuffer }
export interface CinematicTimings { prepare: number; upload: number; encode: number; present: number; gpu: number | null; readback: number | null }
export interface WebGPUCinematicOptions {
  /** Inject a real device for hosts already owning WebGPU. An injected device is never destroyed here. */
  device?: GpuDevice; maxBytes?: number; captureSlots?: number;
  onStatus?: (status: Readonly<CinematicRendererStatus>) => void;
}
interface Target { w: number; h: number; levels: number; base: GpuTexture; emission: GpuTexture; extracted: GpuTexture; bloom: { data: GpuTexture; scratch: GpuTexture }[]; output: GpuTexture; bytes: number }
interface ReadSlot { buffer?: GpuBuffer; bytes: number; busy: boolean }
interface ClockSlot { query: { destroy(): void }; resolve: GpuBuffer; read: GpuBuffer; busy: boolean }
const clamp = (v: number, lo = 0, hi = Infinity) => Math.max(lo, Math.min(hi, v));
const UNIFORM = (binding: number) => ({ binding, visibility: 4, buffer: { type: 'uniform' } });
const READ_BUFFER = (binding: number) => ({ binding, visibility: 4, buffer: { type: 'read-only-storage' } });
const READ_TEXTURE = (binding: number) => ({ binding, visibility: 4, texture: { sampleType: 'unfilterable-float' } });
const WRITE_TEXTURE = (binding: number, format = 'rgba32float') => ({ binding, visibility: 4, storageTexture: { access: 'write-only', format } });

export function validateCinematicInput(frame: Pick<CinematicFrame, 'w' | 'h'> & Partial<CinematicFrame>, options: CinematicOptions = {}): void {
  if (![frame.w, frame.h].every(v => Number.isSafeInteger(v) && v > 0) || !Number.isSafeInteger(frame.w * frame.h)) throw new RangeError('Cinematic frame dimensions must be positive integers');
  const n = frame.w * frame.h;
  for (const [name, data, count] of [['color', frame.color, n], ['light', frame.light, n], ['hdrLight', frame.hdrLight, n * 3], ['radiance', options.radiance, n * 3], ['legacyLight', options.legacyLight, n], ['occlusion', options.occlusion, n], ['background', typeof options.background === 'object' ? options.background : null, n]] as const)
    if (data && data.length < count) throw new RangeError(`${name} buffer is too small`);
  for (const [name, value] of Object.entries(options)) if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError(`Cinematic ${name} must be finite`);
  if (options.bloom) for (const value of Object.values(options.bloom)) if (!Number.isFinite(value)) throw new RangeError('Bloom parameters must be finite');
  if (options.toneMap && !['aces', 'reinhard', 'none'].includes(options.toneMap)) throw new RangeError('Unknown tone mapper');
  if (options.finalPalette && (!options.finalPalette.length || options.finalPalette.length > 256 || !options.finalPalette.every(c => Number.isInteger(c) && c >= -0x80000000 && c <= 0xffffffff))) throw new RangeError('Final palette needs 1..256 packed RGB colors');
}

/** Native-grid finishing on WebGPU. No CPU bloom and no readback during ordinary presentation. */
export class WebGPUCinematicRenderer {
  readonly device: GpuDevice;
  readonly cache: ResidentGpuBuffers;
  private context: GpuCanvasContext | null = null;
  private ownedDevice: boolean;
  private target?: Target;
  private pipelines!: { prepare: GpuPipeline; down: GpuPipeline; horizontal: GpuPipeline; vertical: GpuPipeline; resolve: GpuPipeline; present?: GpuPipeline };
  private dummy!: GpuTexture;
  private uniform!: GpuBuffer;
  private captureSlots: ReadSlot[];
  private clocks: ClockSlot[] = [];
  private revision = 0;
  private current: CinematicRendererStatus = { backend: 'webgpu', state: 'ready', reason: null, timestampQuery: false };
  private timing: CinematicTimings = { prepare: 0, upload: 0, encode: 0, present: 0, gpu: null, readback: null };
  private onDeviceError = (event: { error?: { message?: string } }) => {
    if (this.current.state !== 'ready') return;
    this.current = { ...this.current, state: 'lost', reason: `WebGPU validation/runtime error: ${event.error?.message ?? 'unknown error'}` };
    this.options.onStatus?.(this.status);
  };
  private constructor(device: GpuDevice, readonly canvas: GpuCanvas | undefined, private options: WebGPUCinematicOptions, owned: boolean) {
    this.device = device; this.ownedDevice = owned;
    this.cache = new ResidentGpuBuffers(device, options.maxBytes ?? 256 * 1024 * 1024);
    const slots = options.captureSlots ?? 3;
    if (!Number.isInteger(slots) || slots < 1 || slots > 8) throw new RangeError('Capture ring must contain 1..8 slots');
    this.captureSlots = Array.from({ length: slots }, () => ({ bytes: 0, busy: false }));
    device.addEventListener?.('uncapturederror', this.onDeviceError);
    void device.lost.then(info => {
      if (this.current.state === 'disposed') return;
      this.current = { ...this.current, state: 'lost', reason: `WebGPU device lost (${info.reason}): ${info.message}` };
      options.onStatus?.(this.status);
    });
  }
  static async create(canvas?: GpuCanvas, options: WebGPUCinematicOptions = {}): Promise<WebGPUCinematicRenderer> {
    const gpu = navigatorGPU();
    const adapter = options.device ? null : await gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!options.device && !adapter) throw new Error('WebGPU is unavailable or no adapter was granted');
    const device = options.device ?? await adapter!.requestDevice({ requiredFeatures: adapter!.features.has('timestamp-query') ? ['timestamp-query'] : [] });
    const renderer = new WebGPUCinematicRenderer(device, canvas, options, !options.device);
    renderer.current.timestampQuery = device.features.has('timestamp-query');
    if (adapter) renderer.current.adapter = { ...adapter.info, software: adapter.isFallbackAdapter ?? adapter.info?.isFallbackAdapter ?? null };
    try { await renderer.initialize(gpu?.getPreferredCanvasFormat() ?? 'bgra8unorm'); }
    catch (error) { renderer.dispose(); throw error; }
    options.onStatus?.(renderer.status); return renderer;
  }
  private async initialize(format: string): Promise<void> {
    const d = this.device;
    if ((d.limits.maxStorageBuffersPerShaderStage ?? 8) < 7 || (d.limits.maxSampledTexturesPerShaderStage ?? 16) < 8) throw new Error('Adapter limits cannot run the cinematic pipeline');
    const [prepare, bloom, resolve, present] = await Promise.all([
      checkedShader(d, CINEMATIC_PREPARE_WGSL, 'cinematic prepare'), checkedShader(d, CINEMATIC_BLOOM_WGSL, 'cinematic bloom'),
      checkedShader(d, CINEMATIC_RESOLVE_WGSL, 'cinematic resolve'), checkedShader(d, PRESENT_WGSL, 'native-pixel presentation'),
    ]);
    const layout = (entries: object[]) => d.createPipelineLayout({ bindGroupLayouts: [d.createBindGroupLayout({ entries })] });
    const prepareLayout = layout([UNIFORM(0), ...Array.from({ length: 7 }, (_, i) => READ_BUFFER(i + 1)), ...[8, 9, 10].map(i => WRITE_TEXTURE(i))]);
    const bloomLayout = layout([READ_TEXTURE(0), WRITE_TEXTURE(1)]);
    const resolveLayout = layout([UNIFORM(0), ...Array.from({ length: 8 }, (_, i) => READ_TEXTURE(i + 1)), WRITE_TEXTURE(9, 'rgba8unorm'), READ_BUFFER(10)]);
    const make = (module: object, entryPoint: string, pipelineLayout: object) => d.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } });
    const [p, down, horizontal, vertical, r] = await Promise.all([make(prepare, 'main', prepareLayout), make(bloom, 'down', bloomLayout), make(bloom, 'horizontal', bloomLayout), make(bloom, 'vertical', bloomLayout), make(resolve, 'main', resolveLayout)]);
    this.pipelines = { prepare: p, down, horizontal, vertical, resolve: r };
    if (this.canvas) {
      this.context = this.canvas.getContext('webgpu' as '2d') as unknown as GpuCanvasContext | null;
      if (!this.context) throw new Error('WebGPU canvas context unavailable');
      this.context.configure({ device: d, format, alphaMode: 'premultiplied' });
      this.pipelines.present = await d.createRenderPipelineAsync({ layout: 'auto', vertex: { module: present, entryPoint: 'vertex' }, fragment: { module: present, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
    }
    this.uniform = d.createBuffer({ size: 80, usage: B.UNIFORM | B.COPY_DST, label: 'cinematic parameters' });
    this.dummy = this.texture(1, 1, 'rgba32float');
    if (this.current.timestampQuery) for (let i = 0; i < 3; i++) this.clocks.push({
      query: d.createQuerySet({ type: 'timestamp', count: 2 }),
      resolve: d.createBuffer({ size: 16, usage: B.QUERY_RESOLVE | B.COPY_SRC }),
      read: d.createBuffer({ size: 16, usage: B.COPY_DST | B.MAP_READ }), busy: false,
    });
  }
  private texture(w: number, h: number, format: string): GpuTexture {
    return this.device.createTexture({ size: [w, h], format, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING | T.COPY_SRC });
  }
  private clearTarget(): void {
    if (!this.target) return;
    const t = this.target; [t.base, t.emission, t.extracted, t.output, ...t.bloom.flatMap(l => [l.data, l.scratch])].forEach(texture => texture.destroy());
    this.target = undefined;
  }
  private prepareTarget(w: number, h: number, levels: number): Target {
    if (this.target?.w === w && this.target.h === h && this.target.levels === levels) return this.target;
    if (Math.max(w, h) > this.device.limits.maxTextureDimension2D || w * h * 12 > this.device.limits.maxStorageBufferBindingSize) throw new RangeError('Frame exceeds adapter texture or storage limits');
    let lw = w, lh = h, bytes = w * h * 52;
    for (let i = 0; i < levels; i++) { lw = Math.max(1, Math.ceil(lw / 2)); lh = Math.max(1, Math.ceil(lh / 2)); bytes += lw * lh * 32; }
    if (bytes + w * h * 44 > (this.options.maxBytes ?? 256 * 1024 * 1024)) throw new RangeError('Cinematic frame exceeds GPU memory budget');
    this.clearTarget();
    const bloom: Target['bloom'] = []; lw = w; lh = h;
    for (let i = 0; i < levels; i++) { lw = Math.max(1, Math.ceil(lw / 2)); lh = Math.max(1, Math.ceil(lh / 2)); bloom.push({ data: this.texture(lw, lh, 'rgba32float'), scratch: this.texture(lw, lh, 'rgba32float') }); }
    this.target = { w, h, levels, base: this.texture(w, h, 'rgba32float'), emission: this.texture(w, h, 'rgba32float'), extracted: this.texture(w, h, 'rgba32float'), output: this.texture(w, h, 'rgba8unorm'), bloom, bytes };
    if (this.canvas) { this.canvas.width = w; this.canvas.height = h; }
    return this.target;
  }
  private assertReady(): void { if (this.current.state !== 'ready') throw new Error(this.current.reason ?? `Renderer is ${this.current.state}`); }
  render(frame: CinematicFrame, options: CinematicOptions = {}): GpuCanvas | undefined {
    this.assertReady(); validateCinematicInput(frame, options);
    this.cache.beginFrame(); const start = performance.now(), revision = ++this.revision;
    const color = this.cache.upload('frame color', frame.color, revision), light = this.cache.upload('frame packed light', frame.light, revision);
    const hdrLight = frame.hdrLight ? this.cache.upload('frame HDR light', frame.hdrLight, revision) : undefined;
    this.timing.upload = performance.now() - start;
    return this.renderBuffers({ w: frame.w, h: frame.h, color, light, hdrLight }, options, false);
  }
  /** Consume GPU-authored DrawIR/particle buffers directly; no GPU→CPU→GPU round trip. */
  renderBuffers(frame: GpuFrameBuffers, options: CinematicOptions = {}, beginFrame = true): GpuCanvas | undefined {
    this.assertReady(); validateCinematicInput({ w: frame.w, h: frame.h }, options);
    if (beginFrame) { this.cache.beginFrame(); this.timing.upload = 0; ++this.revision; }
    const prepareStart = performance.now(), bloom = options.bloom === false ? null : options.bloom ?? {};
    const levels = bloom ? clamp(Math.floor(bloom.levels ?? 4), 1, 6) : 0;
    const t = this.prepareTarget(frame.w, frame.h, levels), d = this.device;
    this.timing.prepare = performance.now() - prepareStart;
    const uploadStart = performance.now(), zero = new Uint32Array(1);
    const placeholder = this.cache.upload('zero', zero, 0);
    const background = options.background instanceof Uint32Array ? this.cache.upload('background', options.background, this.revision) : placeholder;
    const legacy = options.legacyLight ? this.cache.upload('extra packed light', options.legacyLight, this.revision) : placeholder;
    const radiance = options.radiance ? this.cache.upload('extra HDR radiance', options.radiance, this.revision) : placeholder;
    const occlusion = options.occlusion ? this.cache.upload('occlusion', options.occlusion, this.revision) : placeholder;
    const palette = options.finalPalette ? this.cache.upload('final palette', new Uint32Array(options.finalPalette), JSON.stringify(options.finalPalette)) : placeholder;
    const data = new ArrayBuffer(80), u = new Uint32Array(data), f = new Float32Array(data);
    u[0] = frame.w; u[1] = frame.h;
    u[2] = (frame.hdrLight ? 1 : 0) | (options.radiance ? 2 : 0) | (options.legacyLight ? 4 : 0) | (options.occlusion ? 8 : 0) | (options.background != null ? 16 : 0) | (options.background instanceof Uint32Array ? 32 : 0);
    u[3] = typeof options.background === 'number' ? options.background : 0; u[4] = options.toneMap === 'none' ? 0 : options.toneMap === 'reinhard' ? 1 : 2; u[5] = levels;
    u[6] = options.finalPalette?.length ?? 0;
    f.set([clamp(options.lightStrength ?? 1), clamp(bloom?.threshold ?? .16), clamp(bloom?.knee ?? .18), clamp(options.exposure ?? 1.15), clamp(bloom?.intensity ?? .9), clamp(options.saturation ?? 1.08), clamp(options.contrast ?? 1.04), clamp(options.vignette ?? .08, 0, 1), clamp(options.chromaticFringe ?? .45), clamp(options.highlightColor ?? 0, 0, 1)], 8);
    d.queue.writeBuffer(this.uniform, 0, data); this.timing.upload += performance.now() - uploadStart;
    const encodeStart = performance.now(), encoder = d.createCommandEncoder({ label: 'cinematic frame' });
    const clock = this.clocks.find(c => !c.busy);
    if (clock) clock.busy = true;
    const pass = encoder.beginComputePass(clock ? { timestampWrites: { querySet: clock.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
    const group = (p: GpuPipeline, entries: object[]) => d.createBindGroup({ layout: p.getBindGroupLayout(0), entries });
    const buf = (binding: number, buffer: GpuBuffer) => ({ binding, resource: { buffer } });
    const tex = (binding: number, texture: GpuTexture) => ({ binding, resource: texture.createView() });
    pass.setPipeline(this.pipelines.prepare);
    pass.setBindGroup(0, group(this.pipelines.prepare, [buf(0, this.uniform), ...[frame.color, frame.light, background, legacy, frame.hdrLight ?? placeholder, radiance, occlusion].map((b, i) => buf(i + 1, b)), tex(8, t.base), tex(9, t.emission), tex(10, t.extracted)]));
    pass.dispatchWorkgroups(Math.ceil(t.w / 8), Math.ceil(t.h / 8));
    let source = t.extracted;
    for (const level of t.bloom) {
      for (const [pipeline, input, output] of [[this.pipelines.down, source, level.data], [this.pipelines.horizontal, level.data, level.scratch], [this.pipelines.vertical, level.scratch, level.data]] as const) {
        pass.setPipeline(pipeline); pass.setBindGroup(0, group(pipeline, [tex(0, input), tex(1, output)]));
        pass.dispatchWorkgroups(Math.ceil(output.width / 8), Math.ceil(output.height / 8));
      }
      source = level.data;
    }
    pass.setPipeline(this.pipelines.resolve);
    pass.setBindGroup(0, group(this.pipelines.resolve, [buf(0, this.uniform), tex(1, t.base), tex(2, t.emission), ...Array.from({ length: 6 }, (_, i) => tex(i + 3, t.bloom[i]?.data ?? this.dummy)), tex(9, t.output), buf(10, palette)]));
    pass.dispatchWorkgroups(Math.ceil(t.w / 8), Math.ceil(t.h / 8)); pass.end();
    if (clock) { encoder.resolveQuerySet(clock.query, 0, 2, clock.resolve, 0); encoder.copyBufferToBuffer(clock.resolve, 0, clock.read, 0, 16); }
    this.timing.encode = performance.now() - encodeStart;
    const presentStart = performance.now();
    if (this.context && this.pipelines.present) {
      const present = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      present.setPipeline(this.pipelines.present); present.setBindGroup(0, group(this.pipelines.present, [tex(0, t.output)])); present.draw(3); present.end();
    }
    d.queue.submit([encoder.finish()]); this.timing.present = performance.now() - presentStart;
    if (clock) void clock.read.mapAsync(B.MAP_READ).then(() => {
      const times = new BigUint64Array(clock.read.getMappedRange());
      this.timing.gpu = Number(times[1] - times[0]) / 1e6;
    }).catch(() => { this.timing.gpu = null; }).finally(() => { try { clock.read.unmap(); } catch { /* device lost */ } clock.busy = false; });
    return this.canvas;
  }
  /** Async map on a bounded staging ring. Await each call or handle explicit backpressure. */
  async capture(): Promise<Uint8ClampedArray> {
    this.assertReady(); const t = this.target; if (!t) throw new Error('Render a frame before capture');
    const slot = this.captureSlots.find(s => !s.busy); if (!slot) throw new Error('Capture ring is full; await an outstanding capture before requesting another');
    const row = Math.ceil(t.w * 4 / 256) * 256, bytes = row * t.h;
    if (bytes > this.device.limits.maxBufferSize) throw new RangeError('Capture exceeds adapter buffer limit');
    if (!slot.buffer || slot.bytes !== bytes) { slot.buffer?.destroy(); slot.buffer = this.device.createBuffer({ size: bytes, usage: B.COPY_DST | B.MAP_READ, label: 'capture staging' }); slot.bytes = bytes; }
    slot.busy = true; const buffer = slot.buffer, start = performance.now();
    try {
      const encoder = this.device.createCommandEncoder(); encoder.copyTextureToBuffer({ texture: t.output }, { buffer, bytesPerRow: row, rowsPerImage: t.h }, { width: t.w, height: t.h, depthOrArrayLayers: 1 });
      this.device.queue.submit([encoder.finish()]); await buffer.mapAsync(B.MAP_READ);
      const mapped = new Uint8Array(buffer.getMappedRange()), rgba = new Uint8ClampedArray(t.w * t.h * 4);
      for (let y = 0; y < t.h; y++) rgba.set(mapped.subarray(y * row, y * row + t.w * 4), y * t.w * 4);
      this.timing.readback = performance.now() - start; return rgba;
    } finally { try { buffer.unmap(); } finally { slot.busy = false; } }
  }
  get status(): Readonly<CinematicRendererStatus> { return Object.freeze({ ...this.current }); }
  get timings(): Readonly<CinematicTimings> { return { ...this.timing }; }
  get resources() { return { ...this.cache.resources, textureBytes: this.target?.bytes ?? 0, stagingBytes: this.captureSlots.reduce((n, s) => n + s.bytes, 0), pendingCaptures: this.captureSlots.filter(s => s.busy).length }; }
  dispose(): void {
    if (this.current.state === 'disposed') return;
    this.current = { ...this.current, state: 'disposed' }; this.clearTarget(); this.cache.dispose(); this.uniform?.destroy(); this.dummy?.destroy();
    for (const s of this.captureSlots) s.buffer?.destroy();
    for (const c of this.clocks) { c.query.destroy(); c.resolve.destroy(); c.read.destroy(); }
    this.context?.unconfigure(); this.device.removeEventListener?.('uncapturederror', this.onDeviceError); if (this.ownedDevice) this.device.destroy(); this.options.onStatus?.(this.status);
  }
}

export interface CinematicFrameRendererOptions extends Omit<WebGPUCinematicOptions, 'device'> { backend?: 'cpu' | 'auto' | 'webgpu' }
/** Safe presentation wrapper. The host keeps a 2D context even when WebGPU is lost. */
export class CinematicFrameRenderer {
  readonly context: CanvasRenderingContext2D;
  private gpu: WebGPUCinematicRenderer | null = null;
  private cpu = new CinematicCompositor(); private image?: ImageData;
  private current: CinematicRendererStatus = { backend: 'cpu', state: 'ready', reason: null, timestampQuery: false };
  private cpuTiming: CinematicTimings = { prepare: 0, upload: 0, encode: 0, present: 0, gpu: null, readback: null };
  private constructor(readonly canvas: HTMLCanvasElement, private options: CinematicFrameRendererOptions) {
    const context = canvas.getContext('2d'); if (!context) throw new Error('Cinematic presentation needs a 2D canvas'); this.context = context;
  }
  static async create(canvas: HTMLCanvasElement, options: CinematicFrameRendererOptions = {}): Promise<CinematicFrameRenderer> {
    if (!['cpu', 'auto', 'webgpu'].includes(options.backend ?? 'cpu')) throw new RangeError('Unknown cinematic backend');
    const renderer = new CinematicFrameRenderer(canvas, options); await renderer.retry(); return renderer;
  }
  async retry(): Promise<void> {
    if (this.current.state === 'disposed') throw new Error('Renderer is disposed');
    this.gpu?.dispose(); this.gpu = null;
    this.current = { backend: 'cpu', state: 'ready', reason: null, timestampQuery: false };
    if (this.options.backend && this.options.backend !== 'cpu') try {
      this.gpu = await WebGPUCinematicRenderer.create(this.canvas.ownerDocument.createElement('canvas'), { ...this.options, onStatus: status => {
        if (status.state === 'lost') { this.current = { ...status, backend: 'cpu', state: 'ready' }; this.options.onStatus?.(this.status); }
      } });
      this.current = { ...this.gpu.status };
    } catch (error) { this.current.reason = error instanceof Error ? error.message : String(error); }
    this.options.onStatus?.(this.status);
  }
  render(frame: CinematicFrame, options: CinematicOptions = {}): void {
    if (this.current.state === 'disposed') throw new Error('Renderer is disposed'); validateCinematicInput(frame, options);
    if (this.canvas.width !== frame.w) this.canvas.width = frame.w;
    if (this.canvas.height !== frame.h) this.canvas.height = frame.h;
    if (this.gpu?.status.state === 'ready') try {
      const surface = this.gpu.render(frame, options)!; const start = performance.now(), ctx = this.context;
      ctx.save(); try { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy'; ctx.filter = 'none'; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.imageSmoothingEnabled = false; ctx.drawImage(surface, 0, 0); } finally { ctx.restore(); }
      this.cpuTiming.present = performance.now() - start; return;
    } catch (error) {
      this.gpu.dispose(); this.gpu = null; this.current = { backend: 'cpu', state: 'ready', reason: error instanceof Error ? error.message : String(error), timestampQuery: false }; this.options.onStatus?.(this.status);
    }
    if (!this.image || this.image.width !== frame.w || this.image.height !== frame.h) this.image = this.context.createImageData(frame.w, frame.h);
    let start = performance.now(); this.cpu.render(frame, this.image.data, options); this.cpuTiming.encode = performance.now() - start;
    start = performance.now(); this.context.putImageData(this.image, 0, 0); this.cpuTiming.present = performance.now() - start;
  }
  async capture(): Promise<Uint8ClampedArray> {
    if (this.current.state === 'disposed') throw new Error('Renderer is disposed');
    if (this.gpu?.status.state === 'ready') return this.gpu.capture();
    if (!this.image) throw new Error('Render a frame before capture'); return this.image.data.slice();
  }
  get status(): Readonly<CinematicRendererStatus> { return Object.freeze({ ...this.current }); }
  get timings(): Readonly<CinematicTimings> { return this.gpu?.status.state === 'ready' ? { ...this.gpu.timings, present: this.gpu.timings.present + this.cpuTiming.present } : { ...this.cpuTiming }; }
  get resources() { return this.gpu?.resources ?? { buffers: 0, bytes: 0, uploadedBytes: 0, writes: 0, avoidedUploadBytes: 0, textureBytes: 0, stagingBytes: 0, pendingCaptures: 0 }; }
  dispose(): void { if (this.current.state === 'disposed') return; this.current.state = 'disposed'; this.gpu?.dispose(); this.gpu = null; this.options.onStatus?.(this.status); }
}
