import {
  DRAW_IR_WGSL,
  DRAW_TILES_WGSL,
  GPU_BUFFER,
  PARTICLES_WGSL,
  PlaybackClock,
  ResidentGpuBuffers,
  WebGPUCinematicRenderer,
  checkedShader,
  integerViewport
} from "./chunks/chunk-I4QYMUT2.js";
import {
  encodeRGBAPNG
} from "./chunks/chunk-OHTBDYQJ.js";
import {
  compileDrawScene,
  parseDrawScene,
  serializeDrawScene
} from "./chunks/chunk-WACKDVI2.js";
import "./chunks/chunk-JQMAFXP4.js";
import "./chunks/chunk-WSFCRVEQ.js";

// src/render/draw-tiles.ts
var DRAW_TILE_SIZE = 16;
var DRAW_TILE_CAPACITY = 256;
function summarizeDrawTiles(width, height, count, data, capacity = DRAW_TILE_CAPACITY) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(width * height) || !Number.isInteger(count) || count < 0 || count > 16384 || !Number.isInteger(capacity) || capacity < 1)
    throw new RangeError("Invalid DrawIR tile statistics dimensions");
  const directPixelVisits = width * height * count;
  if (!data) return { mode: "direct", tiles: 0, overflowTiles: 0, maxCandidates: count, candidatePixelVisits: directPixelVisits, directPixelVisits, binningBoundsUpperBound: 0 };
  const columns = Math.ceil(width / DRAW_TILE_SIZE), rows = Math.ceil(height / DRAW_TILE_SIZE), tiles = columns * rows;
  if (data.length < tiles * (capacity + 1)) throw new RangeError("Tile statistics buffer is too small");
  let candidatePixelVisits = 0, overflowTiles = 0, maxCandidates = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const header = data[(y * columns + x) * (capacity + 1)], overflow = header === 4294967295;
    if (!overflow && (header > capacity || header > count)) throw new RangeError("Invalid tile candidate count");
    const candidates = overflow ? count : header;
    if (overflow) overflowTiles++;
    maxCandidates = Math.max(maxCandidates, candidates);
    candidatePixelVisits += candidates * Math.min(DRAW_TILE_SIZE, width - x * DRAW_TILE_SIZE) * Math.min(DRAW_TILE_SIZE, height - y * DRAW_TILE_SIZE);
  }
  return { mode: "tiled", tiles, overflowTiles, maxCandidates, candidatePixelVisits, directPixelVisits, binningBoundsUpperBound: tiles * count };
}

// src/render/draw-ir-gpu.ts
var WebGPUDrawRenderer = class _WebGPUDrawRenderer {
  constructor(device, maxBytes, options2) {
    this.device = device;
    this.maxBytes = maxBytes;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 32) throw new RangeError("DrawIR GPU budget must be a positive byte count");
    if (!["auto", "none", "tiled"].includes(options2.culling ?? "auto")) throw new RangeError("Unknown DrawIR culling mode");
    this.culling = options2.culling ?? "auto";
    this.assets = new ResidentGpuBuffers(device, maxBytes);
    this.params = device.createBuffer({ size: 16, usage: GPU_BUFFER.UNIFORM | GPU_BUFFER.COPY_DST });
  }
  assets;
  pipeline;
  tilePipeline;
  params;
  previous;
  output;
  revision = 0;
  disposed = false;
  combined;
  tiles;
  tileCount = 0;
  commandCount = 0;
  alphaCount = 0;
  culling;
  cullingReason = null;
  diagnostics;
  drawGroup;
  tileGroup;
  static async create(device, maxBytes = 128 * 1024 * 1024, options2 = {}) {
    const renderer = new _WebGPUDrawRenderer(device, maxBytes, options2);
    try {
      const [draw2, tiles] = await Promise.all([
        checkedShader(device, DRAW_IR_WGSL, "DrawIR raster batch"),
        checkedShader(device, DRAW_TILES_WGSL, "DrawIR tile culling")
      ]);
      [renderer.pipeline, renderer.tilePipeline] = await Promise.all([
        device.createComputePipelineAsync({ layout: "auto", compute: { module: draw2, entryPoint: "main" } }),
        device.createComputePipelineAsync({ layout: "auto", compute: { module: tiles, entryPoint: "main" } })
      ]);
      return renderer;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }
  setCulling(mode) {
    if (this.disposed) throw new Error("DrawIR renderer is disposed");
    if (!["auto", "none", "tiled"].includes(mode)) throw new RangeError("Unknown DrawIR culling mode");
    this.culling = mode;
  }
  baseBytes(w, h) {
    return 16 + this.assets.resources.bytes + w * h * 20 + (this.combined?.size ?? 0) + (this.diagnostics?.size ?? 0);
  }
  validateSize(w, h) {
    const n = w * h, limits = this.device.limits;
    if (![w, h].every((v) => Number.isSafeInteger(v) && v > 0) || !Number.isSafeInteger(n) || n * 12 > limits.maxStorageBufferBindingSize || n * 12 > limits.maxBufferSize || Math.ceil(Math.max(w, h) / 4) > (limits.maxComputeWorkgroupsPerDimension ?? 65535))
      throw new RangeError("DrawIR frame exceeds adapter dimensions or storage limits");
  }
  allocate(w, h) {
    this.validateSize(w, h);
    if (this.baseBytes(w, h) > this.maxBytes) throw new RangeError("DrawIR frame and resident assets exceed GPU budget");
    if (this.output?.w === w && this.output.h === h) return this.output;
    const created = [];
    const buffer = (size) => {
      const b = this.device.createBuffer({ size, usage: GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_SRC | GPU_BUFFER.COPY_DST });
      created.push(b);
      return b;
    };
    try {
      const next = { w, h, color: buffer(w * h * 4), light: buffer(w * h * 4), hdrLight: buffer(w * h * 12) };
      this.output?.color.destroy();
      this.output?.light.destroy();
      this.output?.hdrLight?.destroy();
      return this.output = next;
    } catch (error) {
      created.forEach((b) => b.destroy());
      throw error;
    }
  }
  prepareTiles(w, h, count) {
    this.tileCount = 0;
    this.cullingReason = null;
    const worthwhile = count >= 32 && w * h >= 256;
    const requested = this.culling === "tiled" || this.culling === "auto" && worthwhile;
    if (requested && count > 0) {
      const total = Math.ceil(w / DRAW_TILE_SIZE) * Math.ceil(h / DRAW_TILE_SIZE);
      const bytes = total * (DRAW_TILE_CAPACITY + 1) * 4;
      if (bytes <= this.device.limits.maxStorageBufferBindingSize && bytes <= this.device.limits.maxBufferSize && this.baseBytes(w, h) + bytes <= this.maxBytes) {
        if (this.tiles?.size !== bytes) {
          const next = this.device.createBuffer({ size: bytes, usage: GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_SRC, label: "DrawIR tile candidates" });
          this.tiles?.destroy();
          this.tiles = next;
        }
        this.tileCount = total;
        return this.tiles;
      }
      this.cullingReason = "Tile bins exceed the available GPU budget; exact direct rasterization is active";
    }
    this.tiles?.destroy();
    this.tiles = void 0;
    return void 0;
  }
  render(scene2, cosmetic) {
    if (this.disposed) throw new Error("DrawIR renderer is disposed");
    const compiled = compileDrawScene(scene2, this.previous);
    this.validateSize(compiled.width, compiled.height);
    const cosmeticCount = cosmetic?.count ?? 0, count = compiled.count + cosmeticCount;
    if (cosmetic && (count > 16384 || cosmetic.alphaPrimitives !== 0 || !Number.isInteger(cosmeticCount) || cosmeticCount < 0 || cosmetic.commands.size < cosmeticCount * 128)) throw new RangeError("Invalid cosmetic DrawIR batch");
    const combinedBytes = cosmeticCount > 0 ? Math.max(128, count * 128) : 0;
    const assetBytes = compiled.commands.byteLength + compiled.color.byteLength + compiled.emission.byteLength + 12;
    const otherBytes = 16 + compiled.width * compiled.height * 20 + assetBytes + (this.diagnostics?.size ?? 0);
    if (otherBytes + combinedBytes > this.maxBytes) throw new RangeError("DrawIR scene and resident assets exceed GPU budget");
    const mergeLimit = Math.min(this.device.limits.maxStorageBufferBindingSize, this.device.limits.maxBufferSize, this.maxBytes - otherBytes);
    if (combinedBytes > mergeLimit) throw new RangeError("Combined DrawIR commands exceed storage binding limit or GPU budget");
    if (!cosmeticCount && this.combined && this.combined.size > mergeLimit) {
      this.combined.destroy();
      this.combined = void 0;
    }
    this.previous = compiled;
    this.assets.beginFrame();
    let commands = this.assets.upload("DrawIR commands", new Uint8Array(compiled.commands), ++this.revision, void 0, GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_SRC);
    const colors = this.assets.upload("DrawIR color assets", compiled.color, compiled.assetRevision);
    const emission = this.assets.upload("DrawIR emission assets", compiled.emission, compiled.assetRevision);
    if (cosmeticCount > 0) {
      if (!this.combined || this.combined.size < combinedBytes || this.combined.size > mergeLimit) {
        const size = Math.min(2 ** Math.ceil(Math.log2(combinedBytes)), mergeLimit);
        const next = this.device.createBuffer({ size: Math.floor(size / 128) * 128, usage: GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_DST });
        this.combined?.destroy();
        this.combined = next;
      }
      const encoder = this.device.createCommandEncoder();
      if (compiled.count) encoder.copyBufferToBuffer(commands, 0, this.combined, 0, compiled.count * 128);
      encoder.copyBufferToBuffer(cosmetic.commands, 0, this.combined, compiled.count * 128, cosmeticCount * 128);
      this.device.queue.submit([encoder.finish()]);
      commands = this.combined;
    }
    return this.renderCommandBuffer(compiled.width, compiled.height, commands, count, colors, emission, compiled.alphaPrimitives);
  }
  /** GPU command buffers remain resident. Producers must state the exact alpha budget. */
  renderCommandBuffer(w, h, commands, count, colors, emission, alphaPrimitives = 0) {
    if (this.disposed) throw new Error("DrawIR renderer is disposed");
    this.validateSize(w, h);
    if (!Number.isInteger(count) || count < 0 || count > 16384 || !Number.isInteger(alphaPrimitives) || alphaPrimitives < 0 || alphaPrimitives > 64 || alphaPrimitives > count || commands.size < Math.max(128, count * 128) || commands.size > this.device.limits.maxStorageBufferBindingSize) throw new RangeError("Invalid GPU DrawIR buffer contract");
    const zero = this.assets.upload("DrawIR zero asset", new Uint32Array(3), 0), frame = this.allocate(w, h), tiles = this.prepareTiles(w, h, count);
    this.commandCount = count;
    this.alphaCount = alphaPrimitives;
    this.device.queue.writeBuffer(this.params, 0, new Uint32Array([w, h, count, tiles ? DRAW_TILE_CAPACITY : 0]));
    const group = (pipeline, buffers, old) => old && buffers.every((buffer, i) => old.buffers[i] === buffer) ? old : {
      buffers,
      group: this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) })
    };
    this.drawGroup = group(this.pipeline, [this.params, commands, colors ?? zero, emission ?? zero, frame.color, frame.light, frame.hdrLight, tiles ?? zero], this.drawGroup);
    const encoder = this.device.createCommandEncoder({ label: "DrawIR spatially culled raster" }), pass = encoder.beginComputePass();
    if (tiles) {
      this.tileGroup = group(this.tilePipeline, [this.params, commands, tiles], this.tileGroup);
      pass.setPipeline(this.tilePipeline);
      pass.setBindGroup(0, this.tileGroup.group);
      pass.dispatchWorkgroups(Math.ceil(this.tileCount / 64));
    }
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.drawGroup.group);
    pass.dispatchWorkgroups(Math.ceil(w / 4), Math.ceil(h / 4));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return frame;
  }
  /** Explicit diagnostic readback. Rendering itself never reads tile data on the CPU. */
  async inspectCulling() {
    if (this.disposed) throw new Error("DrawIR renderer is disposed");
    if (!this.output) throw new Error("Render a scene before inspecting culling");
    const { w, h } = this.output, count = this.commandCount;
    if (!this.tiles) return summarizeDrawTiles(w, h, count);
    if (this.diagnostics) throw new Error("A culling inspection is already pending");
    if (this.baseBytes(w, h) + this.tiles.size * 2 > this.maxBytes) throw new RangeError("Culling inspection exceeds GPU budget");
    const read = this.diagnostics = this.device.createBuffer({ size: this.tiles.size, usage: GPU_BUFFER.COPY_DST | GPU_BUFFER.MAP_READ, label: "DrawIR diagnostic staging" });
    try {
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.tiles, 0, read, 0, this.tiles.size);
      this.device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPU_BUFFER.MAP_READ);
      return summarizeDrawTiles(w, h, count, new Uint32Array(read.getMappedRange()));
    } finally {
      try {
        read.unmap();
      } finally {
        read.destroy();
        if (this.diagnostics === read) this.diagnostics = void 0;
      }
    }
  }
  get resources() {
    const outputBytes = this.output ? this.output.w * this.output.h * 20 : 0;
    return {
      ...this.assets.resources,
      outputBytes,
      commandMergeBytes: this.combined?.size ?? 0,
      tileBytes: this.tiles?.size ?? 0,
      diagnosticBytes: this.diagnostics?.size ?? 0,
      primitives: this.commandCount,
      alphaPrimitives: this.alphaCount,
      culling: this.tileCount ? "tiled" : "direct",
      tiles: this.tileCount,
      cullingReason: this.cullingReason
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.assets.dispose();
    this.params.destroy();
    this.combined?.destroy();
    this.tiles?.destroy();
    this.diagnostics?.destroy();
    this.output?.color.destroy();
    this.output?.light.destroy();
    this.output?.hdrLight?.destroy();
    this.previous = void 0;
    this.combined = this.tiles = this.diagnostics = void 0;
    this.output = void 0;
    this.drawGroup = this.tileGroup = void 0;
    this.tileCount = this.commandCount = this.alphaCount = 0;
  }
};

// src/render/gpu-particles.ts
var SlotHeap = class {
  constructor(values, before) {
    this.values = values;
    this.before = before;
  }
  push(slot) {
    const a = this.values;
    let i = a.length;
    a.push(slot);
    while (i > 0) {
      const parent = i - 1 >>> 1;
      if (!this.before(slot, a[parent])) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = slot;
  }
  pop() {
    const a = this.values, result = a[0], last = a.pop();
    if (!a.length) return result;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let child = i * 2 + 1;
      if (child + 1 < a.length && this.before(a[child + 1], a[child])) child++;
      if (!this.before(a[child], last)) break;
      a[i] = a[child];
      i = child;
    }
    a[i] = last;
    return result;
  }
};
var STATE_BYTES = 80;
var COMMAND_BYTES = 128;
var uint32 = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
function validateSpawn(spec, hz) {
  const gravity = spec.gravity ?? [0, 0, 0];
  if (spec.position.length !== 3 || spec.velocity.length !== 3 || gravity.length !== 3 || ![...spec.position, ...spec.velocity, ...gravity, spec.lifetime, spec.radius, spec.emission ?? 1, spec.drag ?? 0, spec.spread ?? 0].every((n) => Number.isFinite(n) && Number.isFinite(Math.fround(n))) || spec.lifetime <= 0 || spec.radius < 0 || (spec.drag ?? 0) < 0 || (spec.emission ?? 1) < 0 || (spec.spread ?? 0) < 0 || !uint32(spec.color) || spec.seed !== void 0 && !uint32(spec.seed) || spec.blend !== void 0 && spec.blend !== "additive" && spec.blend !== "cutout")
    throw new RangeError("Invalid cosmetic particle");
  const lifetime = Math.ceil(spec.lifetime * hz);
  if (lifetime > 16777216) throw new RangeError("Cosmetic lifetime exceeds exact integer tick storage");
  return lifetime;
}
var GpuParticleSystem = class _GpuParticleSystem {
  constructor(device, capacity, seed, hz) {
    this.device = device;
    this.capacity = capacity;
    this.seed = seed;
    this.hz = hz;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16384 || !Number.isInteger(hz) || hz < 1 || hz > 1e3 || !uint32(seed))
      throw new RangeError("Invalid cosmetic particle capacity, seed or fixed tick rate");
    if (capacity * COMMAND_BYTES > Math.min(device.limits.maxStorageBufferBindingSize ?? Infinity, device.limits.maxBufferSize ?? Infinity) || Math.ceil(capacity / 64) > (device.limits.maxComputeWorkgroupsPerDimension ?? 65535))
      throw new RangeError("Cosmetic particle pool exceeds adapter buffer or dispatch limits");
    this.expires = new Float64Array(capacity);
    this.freeSlots = new SlotHeap(Array.from({ length: capacity }, (_, i) => i), (a, b) => a < b);
    this.expirySlots = new SlotHeap([], (a, b) => this.expires[a] < this.expires[b] || this.expires[a] === this.expires[b] && a < b);
    this.staging = new ArrayBuffer(capacity * STATE_BYTES);
    this.stagedFloats = new Float32Array(this.staging);
    this.stagedWords = new Uint32Array(this.staging);
    this.dirty = new Uint8Array(capacity);
    this.firstDirty = capacity;
    const created = [];
    const buffer = (size, usage) => {
      const b = device.createBuffer({ size, usage });
      created.push(b);
      return b;
    };
    try {
      this.particles = buffer(capacity * STATE_BYTES, GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_DST | GPU_BUFFER.COPY_SRC);
      this.commands = buffer(capacity * COMMAND_BYTES, GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_SRC | GPU_BUFFER.COPY_DST);
      this.uniform = buffer(16, GPU_BUFFER.UNIFORM | GPU_BUFFER.COPY_DST);
    } catch (error) {
      created.forEach((b) => b.destroy());
      throw error;
    }
  }
  commands;
  alphaPrimitives = 0;
  particles;
  uniform;
  pipeline;
  group;
  expires;
  freeSlots;
  expirySlots;
  staging;
  stagedFloats;
  stagedWords;
  dirty;
  pending = 0;
  firstDirty;
  lastDirty = -1;
  commandsDirty = false;
  range = 0;
  peakRange = 0;
  live = 0;
  nextId = 1;
  accumulator = 0;
  currentTick = 0;
  disposed = false;
  params = new ArrayBuffer(16);
  paramsFloat = new Float32Array(this.params);
  paramsUint = new Uint32Array(this.params);
  uploadedBytes = 0;
  uploadCalls = 0;
  dispatches = 0;
  updatedSlots = 0;
  lastUpdateSlots = 0;
  static async create(device, options2 = {}) {
    const p = new _GpuParticleSystem(device, options2.capacity ?? 1024, options2.seed ?? 42, options2.hz ?? 120);
    try {
      const module = await checkedShader(device, PARTICLES_WGSL, "fixed-tick cosmetic particles");
      p.pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
      p.group = device.createBindGroup({ layout: p.pipeline.getBindGroupLayout(0), entries: [p.uniform, p.particles, p.commands].map((buffer, binding) => ({ binding, resource: { buffer } })) });
      return p;
    } catch (error) {
      p.dispose();
      throw error;
    }
  }
  /** Only this prefix contains live commands. Holes retain their stable slot/order. */
  get count() {
    return this.range;
  }
  get tick() {
    return this.currentTick;
  }
  get active() {
    return this.live;
  }
  get resources() {
    return {
      capacity: this.capacity,
      active: this.live,
      drawSlots: this.range,
      pendingSpawns: this.pending,
      allocatedBytes: this.disposed ? 0 : this.capacity * (STATE_BYTES + COMMAND_BYTES) + 16,
      stagingBytes: this.staging.byteLength,
      spawnUploadBytes: this.uploadedBytes,
      spawnUploadCalls: this.uploadCalls,
      dispatches: this.dispatches,
      updatedSlots: this.updatedSlots,
      lastUpdateSlots: this.lastUpdateSlots,
      lastWorkgroups: Math.ceil(this.lastUpdateSlots / 64)
    };
  }
  spawn(spec) {
    return this.spawnBatch([spec])[0];
  }
  /** Validate the whole burst before reserving IDs/slots. Uploads coalesce at advance/snapshot. */
  spawnBatch(specs) {
    if (this.disposed) throw new Error("Particle system is disposed");
    if (specs.length > this.capacity - this.live) throw new RangeError("Cosmetic particle capacity reached");
    if (this.nextId + specs.length - 1 > 4294967295) throw new RangeError("Particle stable ID exhausted; clear the system explicitly");
    const lifetimes = specs.map((spec) => validateSpawn(spec, this.hz)), handles = [];
    specs.forEach((spec, k) => {
      const slot = this.freeSlots.pop(), id = this.nextId++, i = slot * 20;
      this.stagedWords.fill(0, i, i + 20);
      this.stagedFloats.set(spec.position, i);
      this.stagedFloats.set(spec.velocity, i + 4);
      this.stagedFloats[i + 7] = lifetimes[k];
      this.stagedFloats.set([spec.radius, spec.drag ?? 0, spec.emission ?? 1, 0], i + 8);
      this.stagedWords.set([id, spec.seed ?? this.seed, spec.color, spec.blend === "cutout" ? 7 : 3], i + 12);
      this.stagedFloats.set(spec.gravity ?? [0, 0, 0], i + 16);
      this.stagedFloats[i + 19] = spec.spread ?? 0;
      this.expires[slot] = this.currentTick + lifetimes[k];
      this.expirySlots.push(slot);
      this.dirty[slot] = 1;
      this.pending++;
      this.firstDirty = Math.min(this.firstDirty, slot);
      this.lastDirty = Math.max(this.lastDirty, slot);
      this.range = Math.max(this.range, slot + 1);
      this.peakRange = Math.max(this.peakRange, this.range);
      this.live++;
      handles.push({ id, slot });
    });
    this.commandsDirty ||= specs.length > 0;
    return handles;
  }
  flushSpawns() {
    if (!this.pending) return;
    for (let i = this.firstDirty; i <= this.lastDirty; ) {
      if (!this.dirty[i]) {
        i++;
        continue;
      }
      const start = i;
      while (i <= this.lastDirty && this.dirty[i]) i++;
      const size = (i - start) * STATE_BYTES;
      this.device.queue.writeBuffer(this.particles, start * STATE_BYTES, this.staging, start * STATE_BYTES, size);
      this.uploadedBytes += size;
      this.uploadCalls++;
    }
    this.dirty.fill(0, this.firstDirty, this.lastDirty + 1);
    this.pending = 0;
    this.firstDirty = this.capacity;
    this.lastDirty = -1;
  }
  advance(dt) {
    if (this.disposed) throw new Error("Particle system is disposed");
    if (!Number.isFinite(dt) || dt < 0 || dt > 2) throw new RangeError("Cosmetic update dt must be 0..2 seconds; subdivide longer seeks");
    const accumulated = this.accumulator + dt * this.hz, steps = Math.floor(accumulated + 1e-9), tick2 = this.currentTick + steps;
    if (!Number.isSafeInteger(tick2)) throw new RangeError("Cosmetic tick counter exhausted; clear the system explicitly");
    this.flushSpawns();
    this.lastUpdateSlots = 0;
    if (this.range > 0 && (steps > 0 || this.commandsDirty)) {
      this.paramsFloat[0] = 1 / this.hz;
      this.paramsUint.set([steps, this.range, tick2 >>> 0], 1);
      this.device.queue.writeBuffer(this.uniform, 0, this.params);
      const encoder = this.device.createCommandEncoder({ label: "cosmetic particle fixed ticks" }), pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.group);
      pass.dispatchWorkgroups(Math.ceil(this.range / 64));
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      this.dispatches++;
      this.updatedSlots += this.range;
      this.lastUpdateSlots = this.range;
      this.commandsDirty = false;
    }
    this.accumulator = Math.max(0, accumulated - steps);
    this.currentTick = tick2;
    while (this.expirySlots.values.length && this.expires[this.expirySlots.values[0]] <= tick2) {
      const slot = this.expirySlots.pop();
      this.expires[slot] = 0;
      this.live--;
      this.freeSlots.push(slot);
    }
    while (this.range > 0 && this.expires[this.range - 1] === 0) this.range--;
  }
  /** Explicit diagnostic readback; ordinary update and drawing never call it. */
  async snapshot() {
    if (this.disposed) throw new Error("Particle system is disposed");
    this.flushSpawns();
    const buffer = this.device.createBuffer({ size: this.capacity * STATE_BYTES, usage: GPU_BUFFER.COPY_DST | GPU_BUFFER.MAP_READ });
    try {
      const e = this.device.createCommandEncoder();
      e.copyBufferToBuffer(this.particles, 0, buffer, 0, this.capacity * STATE_BYTES);
      this.device.queue.submit([e.finish()]);
      await buffer.mapAsync(GPU_BUFFER.MAP_READ);
      return new Float32Array(buffer.getMappedRange().slice(0));
    } finally {
      buffer.unmap();
      buffer.destroy();
    }
  }
  clear() {
    if (this.disposed) throw new Error("Particle system is disposed");
    if (this.peakRange) {
      const zero = new Uint8Array(this.peakRange * COMMAND_BYTES);
      this.device.queue.writeBuffer(this.particles, 0, zero.subarray(0, this.peakRange * STATE_BYTES));
      this.device.queue.writeBuffer(this.commands, 0, zero);
    }
    this.expires.fill(0);
    this.dirty.fill(0);
    this.expirySlots.values.length = 0;
    this.freeSlots.values.length = this.capacity;
    for (let i = 0; i < this.capacity; i++) this.freeSlots.values[i] = i;
    this.nextId = 1;
    this.accumulator = this.currentTick = this.range = this.peakRange = this.live = this.pending = this.lastUpdateSlots = 0;
    this.firstDirty = this.capacity;
    this.lastDirty = -1;
    this.commandsDirty = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.destroy();
    this.commands.destroy();
    this.uniform.destroy();
    this.live = this.range = this.pending = this.lastUpdateSlots = 0;
    this.expirySlots.values.length = this.freeSlots.values.length = 0;
    this.staging = new ArrayBuffer(0);
    this.stagedFloats = new Float32Array(0);
    this.stagedWords = new Uint32Array(0);
    this.expires = new Float64Array(0);
    this.dirty = new Uint8Array(0);
  }
};

// src/examples/gpu-lab.ts
var TAU = Math.PI * 2;
var white = 4294967295;
var cyan = 4294957162;
var rose = 4289752063;
var crystal = {
  id: "lab-star",
  revision: 1,
  width: 5,
  height: 5,
  color: new Uint32Array([
    0,
    0,
    white,
    0,
    0,
    0,
    cyan,
    white,
    cyan,
    0,
    white,
    white,
    white,
    white,
    white,
    0,
    cyan,
    white,
    cyan,
    0,
    0,
    0,
    white,
    0,
    0
  ])
};
function createGpuLabScene(time = 0, options2 = {}) {
  const count = options2.count ?? 128, distribution = options2.distribution ?? "orbit";
  if (!Number.isFinite(time) || !Number.isInteger(count) || count < 0 || count > 4096 || !["orbit", "spread", "overlap"].includes(distribution)) throw new RangeError("Invalid GPU Lab parameters");
  const phase = (time % 6 + 6) % 6 / 6 * TAU, commands = [];
  const point = (angle, axis) => [128 + Math.cos(angle) * (axis ? 65 : 88), 96 + Math.sin(angle) * (axis ? 54 : 26), Math.sin(angle) * 14 + (axis ? 1 : 0)];
  for (let ring = 0; ring < 2; ring++) for (let segment = 0; segment < 64; segment++) {
    const a = segment / 64 * TAU + phase * (ring ? -1 : 1);
    commands.push({
      op: "segment",
      from: point(a, ring),
      to: point(a + TAU / 64, ring),
      width: segment % 8 === 0 ? 2 : 1,
      material: { color: ring ? rose : cyan, blend: "cutout", emission: ring ? [0.35, 0.04, 0.17] : [0.04, 0.22, 0.4] }
    });
  }
  const vertices = [[128, 65, 18], [146, 94, 22], [128, 126, 18], [110, 94, 22], [128, 94, 27]];
  const facets = [4288969014, 4285613614, 4284298569, 4292256622];
  for (let i = 0; i < 4; i++) commands.push({ op: "triangle", vertices: [vertices[i], vertices[(i + 1) % 4], vertices[4]], material: { color: facets[i], blend: "opaque", emission: [0.01, 0.02, 0.03] } });
  commands.push({ op: "segment", from: vertices[0], to: vertices[4], width: 1, material: { color: 4294961339, blend: "cutout", emission: [0.4, 0.6, 0.8] } });
  for (let i = 0; i < count; i++) {
    const a = phase + i * 2.399963229728653, r = 28 + i * 37 % 76;
    let x, y;
    if (distribution === "spread") {
      x = 8 + i * 73 % 240;
      y = 8 + i * 41 % 176;
    } else if (distribution === "overlap") {
      x = 128 + Math.cos(a) * 4;
      y = 96 + Math.sin(a) * 4;
    } else {
      x = 128 + Math.cos(a) * r;
      y = 96 + Math.sin(a) * r * 0.72;
    }
    const cool = i % 3 !== 0;
    if (i % 19 === 0) {
      const angle = phase + i, scale = 0.6 + i % 5 * 0.15;
      commands.push({ op: "sprite", asset: crystal.id, origin: [x - 2 * scale, y - 2 * scale, 30], axisX: [Math.cos(angle) * scale, Math.sin(angle) * scale], axisY: [-Math.sin(angle) * scale || 0, Math.cos(angle) * scale], material: { color: cool ? cyan : rose, blend: "cutout", emission: cool ? [0.03, 0.12, 0.2] : [0.14, 0.02, 0.07] } });
    } else commands.push({
      op: "disc",
      center: [x, y, 3 + Math.sin(a) * 28],
      radius: i % 7 === 0 ? 1.1 : 0.55,
      material: { color: cool ? cyan : rose, blend: "additive", emission: cool ? [0.04, 0.22, 0.4] : [0.4, 0.04, 0.2] }
    });
  }
  return { schema: "poku-draw/v1", width: 256, height: 192, assets: [crystal], commands };
}

// gallery/gpu-lab.ts
var element = (id) => document.getElementById(id);
var select = (id) => element(id);
var input = (id) => element(id);
var button = (id) => element(id);
var canvas = element("view");
var context = canvas.getContext("2d");
var viewport = element("viewport");
var native = document.createElement("canvas");
var nativeContext = native.getContext("2d");
var clock = new PlaybackClock(6, true);
var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
var gpu;
var draw;
var particles;
var gpuSurface;
var worker;
var generation = 0;
var cpuId = 0;
var gpuBusy = false;
var cpuBusy = false;
var dirty = true;
var busyAction = false;
var pendingCpu;
var imported;
var currentScene = createGpuLabScene();
var cpuImage;
var lastSubmit = 0;
var hasFrame = false;
var palette = [4279701515, 4281738269, 4284828468, 4289230920, 4292392293, 4288307934, 4292059123, 4294963408];
function status(message, error = false) {
  element("status").textContent = message;
  element("status").classList.toggle("error", error);
}
function options() {
  return { background: null, bloom: input("bloom").checked ? { levels: 4, threshold: 0.18, intensity: 0.5, knee: 0.15 } : false, exposure: 1, contrast: 1.02, saturation: 1.05, vignette: 0, chromaticFringe: 0, finalPalette: input("palette").checked ? palette : void 0 };
}
function scene() {
  return imported ?? createGpuLabScene(clock.time, { count: Number(select("count").value), distribution: select("distribution").value });
}
function syncControls() {
  button("play").textContent = clock.playing ? "\uC77C\uC2DC\uC815\uC9C0" : "\uC7AC\uC0DD";
  button("play").disabled = !gpu || !!imported || busyAction;
  for (const id of ["burst", "inspect", "compare"]) button(id).disabled = !gpu || busyAction;
  button("retry").disabled = busyAction;
  select("distribution").disabled = select("count").disabled = !!imported;
  input("timeline").disabled = !!imported;
  input("timeline").value = String(clock.time);
  element("time").textContent = `${clock.time.toFixed(2)} s`;
}
function present(surface, w, h) {
  const box = viewport.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width * dpr)), height = Math.max(1, Math.round(box.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const view = integerViewport(w, h, width, height);
  context.fillStyle = "#060b12";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  context.drawImage(surface, view.x, view.y, view.width, view.height);
  element("native-size").textContent = `${w} \xD7 ${h} \xB7 ${view.scale}\xD7 \uBB3C\uB9AC \uD53D\uC140${view.clipped ? " \xB7 \uC77C\uBD80 \uC798\uB9BC" : ""}`;
  hasFrame = true;
}
function metrics() {
  const resources = draw?.resources;
  element("submit-time").textContent = gpu ? `${lastSubmit.toFixed(2)} ms` : "CPU \uAE30\uC900";
  element("gpu-time").textContent = gpu?.timings.gpu != null ? `${gpu.timings.gpu.toFixed(2)} ms` : "\uBBF8\uC81C\uACF5";
  element("primitives").textContent = resources ? resources.primitives.toLocaleString() : currentScene.commands.length.toLocaleString();
  element("tile-count").textContent = resources ? resources.culling === "tiled" ? `${resources.tiles}\uAC1C \uD0C0\uC77C \xB7 ${(resources.tileBytes / 1024).toFixed(0)} KiB` : "\uC804\uCCB4 \uB3C4\uD615 \uC9C1\uC811 \uAC80\uC0AC" : "CPU reference \xB7 \uC815\uC9C0\uD654\uBA74";
  element("particle-count").textContent = particles ? `\uC785\uC790 ${particles.active} / ${particles.capacity} \xB7 \uC81C\uCD9C \uC2AC\uB86F ${particles.count}` : "GPU \uC785\uC790 \uBE44\uD65C\uC131";
}
function requestCpu() {
  currentScene = scene();
  pendingCpu = { id: ++cpuId, scene: currentScene, options: options() };
  if (!worker) {
    worker = new Worker(new URL("./gpu-lab-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const data = event.data;
      cpuBusy = false;
      if (!gpu && data.id === cpuId) {
        if (data.error) status(`CPU \uAE30\uC900 \uB80C\uB354 \uC2E4\uD328: ${data.error}`, true);
        else {
          cpuImage = new Uint8ClampedArray(data.rgba);
          native.width = data.width;
          native.height = data.height;
          nativeContext.putImageData(new ImageData(new Uint8ClampedArray(cpuImage), data.width, data.height), 0, 0);
          present(native, data.width, data.height);
          metrics();
          element("submit-time").textContent = `${data.milliseconds.toFixed(1)} ms`;
          element("submit-time").parentElement.querySelector("span").textContent = "CPU \uAE30\uC900 \uD504\uB808\uC784 \uC804\uCCB4";
        }
      }
      sendCpu();
    };
    worker.onerror = (event) => {
      cpuBusy = false;
      status(`CPU worker \uC624\uB958: ${event.message}`, true);
    };
  }
  sendCpu();
}
function sendCpu() {
  if (!worker || cpuBusy || !pendingCpu) return;
  cpuBusy = true;
  const next = pendingCpu;
  pendingCpu = void 0;
  worker.postMessage(next);
}
function releaseGpu() {
  particles?.dispose();
  draw?.dispose();
  gpu?.dispose();
  particles = void 0;
  draw = void 0;
  gpu = void 0;
  gpuSurface = void 0;
}
function fallback(reason) {
  ++generation;
  releaseGpu();
  gpuBusy = false;
  clock.playing = false;
  clock.suspend();
  element("backend-badge").textContent = "CPU \uAE30\uC900 \uC815\uC9C0\uD654\uBA74";
  status(`WebGPU \uB300\uCCB4 \uD45C\uC2DC \xB7 ${reason}`);
  syncControls();
  requestCpu();
}
async function connect() {
  const token = ++generation;
  releaseGpu();
  gpuBusy = false;
  busyAction = true;
  syncControls();
  status("GPU \uC5B4\uB311\uD130\uC640 \uB80C\uB354 \uD30C\uC774\uD504\uB77C\uC778\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.");
  let candidate, candidateDraw, candidateParticles;
  try {
    const surface = document.createElement("canvas");
    candidate = await WebGPUCinematicRenderer.create(surface, { maxBytes: 64 * 1024 * 1024, captureSlots: 2, onStatus: (state) => {
      if (token === generation && state.state === "lost") fallback(state.reason ?? "GPU device lost");
    } });
    candidateDraw = await WebGPUDrawRenderer.create(candidate.device, 64 * 1024 * 1024, { culling: select("culling").value });
    candidateParticles = await GpuParticleSystem.create(candidate.device, { capacity: 512, seed: 42, hz: 120 });
    if (token !== generation) {
      candidateParticles.dispose();
      candidateDraw.dispose();
      candidate.dispose();
      return;
    }
    gpu = candidate;
    draw = candidateDraw;
    particles = candidateParticles;
    gpuSurface = surface;
    ++cpuId;
    pendingCpu = void 0;
    clock.playing = !reducedMotion.matches && !imported;
    clock.suspend();
    const adapter = gpu.status.adapter, kind = adapter?.software === true ? "\uC18C\uD504\uD2B8\uC6E8\uC5B4 \uC5B4\uB311\uD130" : adapter?.software === false ? "GPU \uC5B4\uB311\uD130" : "\uC5B4\uB311\uD130 \uC885\uB958 \uBBF8\uD655\uC778";
    element("backend-badge").textContent = `WebGPU \xB7 ${kind}`;
    status(`${kind} \xB7 ${adapter?.description || adapter?.device || adapter?.vendor || "\uC7A5\uCE58 \uC815\uBCF4 \uBBF8\uC81C\uACF5"} \xB7 \uB3C4\uD615 \uB798\uC2A4\uD130\uC640 \uC7A5\uC2DD \uC785\uC790\uAC00 GPU\uC5D0\uC11C \uC2E4\uD589\uB429\uB2C8\uB2E4.`);
    element("submit-time").parentElement.querySelector("span").textContent = "CPU \uBA85\uB839 \uC791\uC131\xB7\uC81C\uCD9C";
    dirty = true;
  } catch (error) {
    candidateParticles?.dispose();
    candidateDraw?.dispose();
    candidate?.dispose();
    if (token === generation) fallback(error instanceof Error ? error.message : String(error));
  } finally {
    if (token === generation || !gpu) {
      busyAction = false;
      syncControls();
    }
  }
}
function renderGpu() {
  if (!gpu || !draw || !gpuSurface) return;
  const start = performance.now();
  currentScene = scene();
  draw.setCulling(select("culling").value);
  gpu.renderBuffers(draw.render(currentScene, particles?.active ? particles : void 0), options());
  lastSubmit = performance.now() - start;
  present(gpuSurface, currentScene.width, currentScene.height);
  metrics();
}
function invalidate() {
  dirty = true;
  element("inspector").textContent = "\uC7A5\uBA74\uC774 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uD504\uB808\uC784\uC744 \uAC80\uC0AC\uD558\uBA74 \uC0C8 \uD6C4\uBCF4 \uC218\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
  if (!gpu && !busyAction) requestCpu();
}
async function action(work) {
  if (busyAction) return;
  busyAction = true;
  clock.playing = false;
  clock.suspend();
  syncControls();
  try {
    await work();
  } catch (error) {
    status(error instanceof Error ? error.message : String(error), true);
  } finally {
    busyAction = false;
    syncControls();
  }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
button("play").onclick = () => {
  clock.playing = !clock.playing;
  clock.suspend();
  syncControls();
};
button("reset").onclick = () => {
  imported = void 0;
  particles?.clear();
  clock.reset();
  element("scene-title").textContent = "Orbital drawing study";
  syncControls();
  invalidate();
};
button("retry").onclick = () => {
  void connect();
};
for (const id of ["distribution", "count", "culling"]) select(id).onchange = invalidate;
for (const id of ["bloom", "palette"]) input(id).onchange = invalidate;
input("timeline").oninput = () => {
  clock.playing = false;
  clock.seek(Number(input("timeline").value));
  particles?.clear();
  syncControls();
  invalidate();
};
button("burst").onclick = () => {
  if (!particles || busyAction) return;
  const available = particles.capacity - particles.active, burst = [];
  for (let i = 0; i < Math.min(available, 128); i++) {
    const angle = i * 2.399963229728653, speed = 18 + i % 41;
    burst.push({ position: [currentScene.width / 2, currentScene.height / 2, 30], velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed - 10, 0], gravity: [0, 16, 0], lifetime: 2, radius: i % 5 ? 0.65 : 1.2, color: i % 2 ? 4294957162 : 4289752063, emission: 0.8, spread: 2, drag: 0.1 });
  }
  particles.spawnBatch(burst);
  particles.advance(0);
  clock.playing = true;
  clock.suspend();
  dirty = true;
  syncControls();
};
button("inspect").onclick = () => {
  void action(async () => {
    renderGpu();
    const stats = await draw.inspectCulling();
    const reduction = stats.directPixelVisits ? (1 - stats.candidatePixelVisits / stats.directPixelVisits) * 100 : 0;
    element("inspector").textContent = `\uD604\uC7AC ${stats.mode === "tiled" ? "\uD0C0\uC77C" : "\uC9C1\uC811"} \uACBD\uB85C
\uD53D\uC140 \uD6C4\uBCF4 \uAC80\uC0AC: ${stats.candidatePixelVisits.toLocaleString()} / \uC804\uCCB4 ${stats.directPixelVisits.toLocaleString()}
\uD6C4\uBCF4 \uAC10\uC18C: ${reduction.toFixed(2)}%
\uC804\uCCB4 \uAC80\uC0AC\uB85C \uC804\uD658\uB41C \uD0C0\uC77C: ${stats.overflowTiles} / ${stats.tiles}
\uD0C0\uC77C bounds \uAC80\uC0AC \uC0C1\uD55C: ${stats.binningBoundsUpperBound.toLocaleString()}
\uC774 \uC218\uCE58\uB294 \uC2E4\uC81C GPU bin\uC744 \uC77D\uC740 \uC5F0\uC0B0\uB7C9 \uC9C0\uD45C\uC774\uBA70 \uC18D\uB3C4 \uD5A5\uC0C1 \uBC30\uC218\uAC00 \uC544\uB2D9\uB2C8\uB2E4.`;
  });
};
button("compare").onclick = () => {
  void action(async () => {
    if (!gpu || !draw) return;
    currentScene = scene();
    const previous = select("culling").value;
    try {
      draw.setCulling("none");
      gpu.renderBuffers(draw.render(currentScene, particles?.active ? particles : void 0), options());
      const direct = await gpu.capture();
      draw.setCulling("tiled");
      gpu.renderBuffers(draw.render(currentScene, particles?.active ? particles : void 0), options());
      const tiled = await gpu.capture();
      let changed = 0, maximum = 0;
      for (let i = 0; i < direct.length; i++) {
        const delta = Math.abs(direct[i] - tiled[i]);
        if (delta) changed++;
        maximum = Math.max(maximum, delta);
      }
      element("inspector").textContent = `\uC9C1\uC811 / \uD0C0\uC77C \uBE44\uAD50 \xB7 \uAC19\uC740 \uC7A5\uBA74\uACFC \uC2DC\uC810
\uAC80\uC0AC\uD55C RGBA \uCC44\uB110: ${direct.length.toLocaleString()}
\uB2E4\uB978 \uCC44\uB110: ${changed.toLocaleString()} \xB7 \uCD5C\uB300 \uCC28\uC774: ${maximum}
${changed === 0 ? "\uD604\uC7AC \uC5B4\uB311\uD130\uC758 \uB450 \uACBD\uB85C \uCD9C\uB825\uC774 \uC815\uD655\uD788 \uC77C\uCE58\uD569\uB2C8\uB2E4." : "\uCD9C\uB825 \uCC28\uC774\uB97C \uBC1C\uACAC\uD588\uC2B5\uB2C8\uB2E4. \uC9C1\uC811 \uACBD\uB85C\uB97C \uC120\uD0DD\uD558\uACE0 \uC7A5\uBA74 JSON\uC744 \uBCF4\uAD00\uD558\uC138\uC694."}`;
    } finally {
      draw.setCulling(previous);
      renderGpu();
    }
  });
};
button("png").onclick = () => {
  void action(async () => {
    if (gpu) {
      renderGpu();
      const rgba = await gpu.capture();
      download(await encodeRGBAPNG(currentScene.width, currentScene.height, rgba), "poku-gpu-frame.png");
    } else {
      if (cpuBusy || pendingCpu || !cpuImage || !hasFrame) throw new Error("\uD604\uC7AC CPU \uAE30\uC900 \uD504\uB808\uC784\uC758 \uACC4\uC0B0\uC774 \uB05D\uB09C \uB4A4 \uC800\uC7A5\uD558\uC138\uC694.");
      download(await encodeRGBAPNG(native.width, native.height, cpuImage), "poku-cpu-reference.png");
    }
  });
};
button("save").onclick = () => {
  try {
    download(new Blob([serializeDrawScene(scene())], { type: "application/json" }), "poku-draw-scene.json");
    status("\uD604\uC7AC \uB3C4\uD615 \uBA85\uB839 JSON\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4. \uBCC4\uB3C4 GPU \uC7A5\uC2DD \uC785\uC790\uC758 \uC0C1\uD0DC\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  } catch (error) {
    status(String(error), true);
  }
};
button("open").onclick = () => input("file").click();
input("file").onchange = () => {
  const file = input("file").files?.[0];
  if (!file) return;
  void action(async () => {
    if (file.size > 4 * 1024 * 1024) throw new Error("GPU Lab JSON\uC740 \uCD5C\uB300 4 MiB\uAE4C\uC9C0 \uC5F4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    const loaded = parseDrawScene(await file.text());
    if (loaded.width > 1024 || loaded.height > 1024) throw new Error("GPU Lab \uBBF8\uB9AC\uBCF4\uAE30\uB294 \uCD5C\uB300 1024\xD71024 \uB124\uC774\uD2F0\uBE0C \uD53D\uC140\uC744 \uC9C0\uC6D0\uD569\uB2C8\uB2E4.");
    imported = loaded;
    particles?.clear();
    element("scene-title").textContent = file.name;
    dirty = true;
    input("file").value = "";
    if (!gpu) requestCpu();
    status(`${file.name} \xB7 DrawIR \uC7A5\uBA74\uC744 \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4. \uCD08\uAE30\uD654\uB85C \uAE30\uBCF8 \uC608\uC81C\uB85C \uB3CC\uC544\uAC08 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
  });
};
new ResizeObserver(() => {
  if (gpuSurface && hasFrame) present(gpuSurface, currentScene.width, currentScene.height);
  else if (cpuImage) present(native, native.width, native.height);
}).observe(viewport);
document.addEventListener("visibilitychange", () => clock.suspend());
reducedMotion.addEventListener("change", (event) => {
  if (event.matches) {
    clock.playing = false;
    clock.suspend();
    syncControls();
  }
});
function tick(now) {
  requestAnimationFrame(tick);
  if (!gpu || gpuBusy || busyAction || document.hidden) return;
  const update = clock.tick(now);
  if (!clock.playing && !dirty) return;
  try {
    let elapsed = update.elapsed;
    while (elapsed > 2) {
      particles?.advance(2);
      elapsed -= 2;
    }
    if (elapsed > 0) particles?.advance(elapsed);
    renderGpu();
    dirty = false;
    syncControls();
    gpuBusy = true;
    const device = gpu.device, token = generation;
    void device.queue.onSubmittedWorkDone().then(() => {
      if (token === generation) gpuBusy = false;
    }).catch((error) => {
      if (token === generation) fallback(String(error));
    });
  } catch (error) {
    fallback(error instanceof Error ? error.message : String(error));
  }
}
window.addEventListener("pagehide", () => {
  ++generation;
  releaseGpu();
  worker?.terminate();
});
requestAnimationFrame(tick);
void connect();
