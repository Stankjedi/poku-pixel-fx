/** Structural WebGPU subset. No global API shim: callers still need a real WebGPU implementation. */
export interface GpuBuffer { readonly size: number; mapAsync(mode: number, offset?: number, size?: number): Promise<void>; getMappedRange(offset?: number, size?: number): ArrayBuffer; unmap(): void; destroy(): void }
export interface GpuTexture { width: number; height: number; createView(options?: object): object; destroy(): void }
export interface GpuPipeline { getBindGroupLayout(index: number): object }
export interface GpuComputePass { setPipeline(p: GpuPipeline): void; setBindGroup(index: number, group: object): void; dispatchWorkgroups(x: number, y?: number, z?: number): void; end(): void }
export interface GpuRenderPass { setPipeline(p: GpuPipeline): void; setBindGroup(index: number, group: object): void; draw(vertices: number, instances?: number, firstVertex?: number, firstInstance?: number): void; end(): void }
export interface GpuCommandEncoder {
  beginComputePass(options?: object): GpuComputePass;
  beginRenderPass(options: object): GpuRenderPass;
  copyTextureToBuffer(source: object, destination: object, size: object): void;
  copyBufferToBuffer(source: GpuBuffer, sourceOffset: number, target: GpuBuffer, targetOffset: number, size: number): void;
  resolveQuerySet(query: object, first: number, count: number, buffer: GpuBuffer, offset: number): void;
  finish(): object;
}
export interface GpuDevice {
  readonly features: ReadonlySet<string>; readonly limits: Readonly<Record<string, number>>;
  readonly lost: Promise<{ reason: string; message: string }>;
  addEventListener?(type: string, listener: (event: { error?: { message?: string } }) => void): void;
  removeEventListener?(type: string, listener: (event: { error?: { message?: string } }) => void): void;
  readonly queue: { writeBuffer(buffer: GpuBuffer, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void;
    writeTexture(destination: object, data: ArrayBuffer | ArrayBufferView, layout: object, size: object): void;
    submit(commands: object[]): void; onSubmittedWorkDone(): Promise<void> };
  createBuffer(options: object): GpuBuffer; createTexture(options: object): GpuTexture;
  createShaderModule(options: { code: string; label?: string }): { getCompilationInfo?(): Promise<{ messages: { type: string; message: string; lineNum?: number }[] }> };
  createComputePipelineAsync(options: object): Promise<GpuPipeline>; createRenderPipelineAsync(options: object): Promise<GpuPipeline>;
  createBindGroup(options: object): object; createCommandEncoder(options?: object): GpuCommandEncoder;
  createBindGroupLayout(options: object): object; createPipelineLayout(options: object): object;
  createQuerySet(options: object): { destroy(): void };
  pushErrorScope(filter: string): void; popErrorScope(): Promise<{ message: string } | null>; destroy(): void;
}
export interface GpuAdapter {
  readonly features: ReadonlySet<string>; readonly limits: Readonly<Record<string, number>>;
  readonly info?: { vendor?: string; architecture?: string; device?: string; description?: string; isFallbackAdapter?: boolean };
  readonly isFallbackAdapter?: boolean;
  requestDevice(options?: object): Promise<GpuDevice>;
}
export interface GpuNavigator { requestAdapter(options?: object): Promise<GpuAdapter | null>; getPreferredCanvasFormat(): string }
export interface GpuCanvasContext { configure(options: object): void; unconfigure(): void; getCurrentTexture(): GpuTexture }
export type GpuCanvas = HTMLCanvasElement | OffscreenCanvas;
export const GPU_BUFFER = Object.freeze({ MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 });
export const GPU_TEXTURE = Object.freeze({ COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 });
export function navigatorGPU(): GpuNavigator | undefined { return (globalThis as { navigator?: { gpu?: GpuNavigator } }).navigator?.gpu; }
export async function checkedShader(device: GpuDevice, code: string, label: string) {
  const module = device.createShaderModule({ code, label });
  const messages = (await module.getCompilationInfo?.())?.messages.filter(m => m.type === 'error') ?? [];
  if (messages.length) throw new Error(`${label}: ${messages.map(m => `${m.lineNum ?? '?'} ${m.message}`).join('; ')}`);
  return module;
}
