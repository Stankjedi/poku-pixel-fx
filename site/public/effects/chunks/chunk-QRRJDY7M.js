import {
  CinematicCompositor
} from "./chunk-T3JNBT34.js";

// src/authoring/clock.ts
var PlaybackClock = class {
  constructor(duration = 1, loop = true) {
    this.duration = duration;
    this.loop = loop;
  }
  time = 0;
  playing = false;
  speed = 1;
  last;
  reset(now) {
    this.time = 0;
    this.last = now;
  }
  suspend() {
    this.last = void 0;
  }
  seek(time) {
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Time must be finite and positive");
    this.time = Math.min(this.duration, time);
    this.last = void 0;
  }
  step(frames, fps) {
    this.seek(Math.max(0, this.time + frames / fps));
    return this.time;
  }
  tick(now, visible = true) {
    if (!Number.isFinite(now)) throw new RangeError("Clock timestamp must be finite");
    if (!visible) {
      this.suspend();
      return { time: this.time, elapsed: 0, wrapped: false };
    }
    const elapsed = this.playing && this.last !== void 0 ? Math.max(0, (now - this.last) / 1e3) * this.speed : 0;
    this.last = now;
    const next = this.time + elapsed, wrapped = this.loop && this.duration > 0 && next >= this.duration;
    this.time = wrapped ? next % this.duration : Math.min(next, this.duration);
    if (!this.loop && this.time >= this.duration) this.playing = false;
    return { time: this.time, elapsed, wrapped };
  }
};
function integerViewport(nativeWidth, nativeHeight, physicalWidth, physicalHeight) {
  if (![nativeWidth, nativeHeight, physicalWidth, physicalHeight].every((x) => Number.isFinite(x) && x > 0)) throw new RangeError("Invalid viewport size");
  const scale = Math.max(1, Math.floor(Math.min(physicalWidth / nativeWidth, physicalHeight / nativeHeight)));
  const width = nativeWidth * scale, height = nativeHeight * scale;
  return { scale, width, height, x: Math.floor((physicalWidth - width) / 2), y: Math.floor((physicalHeight - height) / 2), clipped: width > physicalWidth || height > physicalHeight };
}

// src/render/gpu-types.ts
var GPU_BUFFER = Object.freeze({ MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 });
var GPU_TEXTURE = Object.freeze({ COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 });
function navigatorGPU() {
  return globalThis.navigator?.gpu;
}
async function checkedShader(device, code, label) {
  const module = device.createShaderModule({ code, label });
  const messages = (await module.getCompilationInfo?.())?.messages.filter((m) => m.type === "error") ?? [];
  if (messages.length) throw new Error(`${label}: ${messages.map((m) => `${m.lineNum ?? "?"} ${m.message}`).join("; ")}`);
  return module;
}

// src/render/gpu-resources.ts
var ResidentGpuBuffers = class {
  constructor(device, maxBytes = 128 * 1024 * 1024) {
    this.device = device;
    this.maxBytes = maxBytes;
  }
  entries = /* @__PURE__ */ new Map();
  uploaded = 0;
  writes = 0;
  saved = 0;
  beginFrame() {
    this.uploaded = this.writes = this.saved = 0;
  }
  upload(key, data, revision, dirty, usage = GPU_BUFFER.STORAGE) {
    const bytes = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
    if (bytes > (this.device.limits.maxStorageBufferBindingSize ?? Infinity) && usage & GPU_BUFFER.STORAGE) throw new RangeError("GPU asset exceeds storage binding limit");
    let item = this.entries.get(key);
    const fresh = !item || item.bytes !== bytes || item.usage !== usage;
    if (fresh) {
      if (this.resources.bytes - (item?.bytes ?? 0) + bytes > this.maxBytes) throw new RangeError("Resident GPU asset budget exceeded");
      item?.buffer.destroy();
      item = { buffer: this.device.createBuffer({ size: bytes, usage: usage | GPU_BUFFER.COPY_DST, label: key }), bytes, revision, usage };
      this.entries.set(key, item);
    } else if (item.revision === revision) {
      this.saved += data.byteLength;
      return item.buffer;
    }
    const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (!fresh && dirty?.length) {
      for (const range of dirty) {
        if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.size) || range.offset < 0 || range.size < 0 || range.offset + range.size > source.length || range.offset % 4 || range.size % 4)
          throw new RangeError("Dirty uploads need aligned in-bounds byte ranges");
        this.device.queue.writeBuffer(item.buffer, range.offset, source.subarray(range.offset, range.offset + range.size));
        this.uploaded += range.size;
        this.writes++;
      }
    } else {
      if (source.byteLength % 4) {
        const padded = new Uint8Array(bytes);
        padded.set(source);
        this.device.queue.writeBuffer(item.buffer, 0, padded);
      } else if (source.byteLength) this.device.queue.writeBuffer(item.buffer, 0, source);
      this.uploaded += bytes;
      this.writes++;
    }
    item.revision = revision;
    return item.buffer;
  }
  release(key) {
    this.entries.get(key)?.buffer.destroy();
    this.entries.delete(key);
  }
  retain(keys) {
    for (const key of this.entries.keys()) if (!keys.has(key)) this.release(key);
  }
  get resources() {
    return { buffers: this.entries.size, bytes: [...this.entries.values()].reduce((sum, item) => sum + item.bytes, 0), uploadedBytes: this.uploaded, writes: this.writes, avoidedUploadBytes: this.saved };
  }
  dispose() {
    for (const key of this.entries.keys()) this.release(key);
  }
};

// src/render/wgsl.ts
var CINEMATIC_BLOOM_WGSL = "@group(0) @binding(0) var source: texture_2d<f32>;\n@group(0) @binding(1) var destination: texture_storage_2d<rgba32float, write>;\nfn read(p: vec2i) -> vec4f { return textureLoad(source, clamp(p, vec2i(0), vec2i(textureDimensions(source)) - vec2i(1)), 0); }\n@compute @workgroup_size(8, 8)\nfn down(@builtin(global_invocation_id) id: vec3u) {\n  if (any(id.xy >= textureDimensions(destination))) { return; }\n  let p = vec2i(id.xy * 2u);\n  textureStore(destination, id.xy, (read(p) + read(p + vec2i(1, 0)) + read(p + vec2i(0, 1)) + read(p + vec2i(1, 1))) * .25);\n}\n@compute @workgroup_size(8, 8)\nfn horizontal(@builtin(global_invocation_id) id: vec3u) {\n  if (any(id.xy >= textureDimensions(destination))) { return; }\n  let p = vec2i(id.xy);\n  textureStore(destination, id.xy, (read(p + vec2i(-2, 0)) + 4.0 * read(p + vec2i(-1, 0)) + 6.0 * read(p) + 4.0 * read(p + vec2i(1, 0)) + read(p + vec2i(2, 0))) / 16.0);\n}\n@compute @workgroup_size(8, 8)\nfn vertical(@builtin(global_invocation_id) id: vec3u) {\n  if (any(id.xy >= textureDimensions(destination))) { return; }\n  let p = vec2i(id.xy);\n  textureStore(destination, id.xy, (read(p + vec2i(0, -2)) + 4.0 * read(p + vec2i(0, -1)) + 6.0 * read(p) + 4.0 * read(p + vec2i(0, 1)) + read(p + vec2i(0, 2))) / 16.0);\n}\n";
var CINEMATIC_PREPARE_WGSL = "struct Params {\n  size: vec2u, flags: u32, flat: u32,\n  tone: u32, levels: u32, reserved: vec2u,\n  light: f32, threshold: f32, knee: f32, exposure: f32,\n  intensity: f32, saturation: f32, contrast: f32, vignette: f32,\n  fringe: f32, highlight: f32, padding: vec2f,\n}\n@group(0) @binding(0) var<uniform> params: Params;\n@group(0) @binding(1) var<storage, read> colors: array<u32>;\n@group(0) @binding(2) var<storage, read> lights: array<u32>;\n@group(0) @binding(3) var<storage, read> backgrounds: array<u32>;\n@group(0) @binding(4) var<storage, read> legacy: array<u32>;\n@group(0) @binding(5) var<storage, read> hdr: array<f32>;\n@group(0) @binding(6) var<storage, read> radiance: array<f32>;\n@group(0) @binding(7) var<storage, read> occlusion: array<f32>;\n@group(0) @binding(8) var base: texture_storage_2d<rgba32float, write>;\n@group(0) @binding(9) var emission: texture_storage_2d<rgba32float, write>;\n@group(0) @binding(10) var extracted: texture_storage_2d<rgba32float, write>;\nfn unpack(c: u32) -> vec4f { return vec4f(f32(c & 255u), f32((c >> 8u) & 255u), f32((c >> 16u) & 255u), f32(c >> 24u)) / 255.0; }\nfn linear(rgb: vec3f) -> vec3f { return select(pow((rgb + vec3f(.055)) / 1.055, vec3f(2.4)), rgb / 12.92, rgb <= vec3f(.04045)); }\n@compute @workgroup_size(8, 8)\nfn main(@builtin(global_invocation_id) id: vec3u) {\n  if (any(id.xy >= params.size)) { return; }\n  let i = id.y * params.size.x + id.x; let j = i * 3u;\n  let c = unpack(colors[i]); var a = c.a; var rgb = linear(c.rgb) * a;\n  if ((params.flags & 16u) != 0u) {\n    var bg = params.flat;\n    if ((params.flags & 32u) != 0u) { bg = backgrounds[i]; }\n    rgb += linear(unpack(bg).rgb) * (1.0 - a); a = 1.0;\n  }\n  if ((params.flags & 8u) != 0u) { rgb *= clamp(occlusion[i], 0.0, 1.0); }\n  var energy = linear(unpack(lights[i]).rgb);\n  if ((params.flags & 1u) != 0u) { energy = vec3f(hdr[j], hdr[j + 1u], hdr[j + 2u]); }\n  if ((params.flags & 4u) != 0u) { energy += linear(unpack(legacy[i]).rgb); }\n  energy *= params.light;\n  if ((params.flags & 2u) != 0u) { energy += vec3f(radiance[j], radiance[j + 1u], radiance[j + 2u]); }\n  let brightness = max(energy.r, max(energy.g, energy.b));\n  let knee = max(.000001, params.knee);\n  let above = max(0.0, brightness - params.threshold);\n  let q = clamp(brightness - params.threshold + knee, 0.0, 2.0 * knee);\n  var scale = 0.0;\n  if (brightness > 0.0) { scale = min(1.0, max(above, q * q / (4.0 * knee)) / brightness); }\n  textureStore(base, id.xy, vec4f(rgb, a));\n  textureStore(emission, id.xy, vec4f(energy, 1.0));\n  textureStore(extracted, id.xy, vec4f(energy * scale, 1.0));\n}\n";
var CINEMATIC_RESOLVE_WGSL = "struct Params {\n  size: vec2u, flags: u32, flat: u32,\n  tone: u32, levels: u32, reserved: vec2u,\n  light: f32, threshold: f32, knee: f32, exposure: f32,\n  intensity: f32, saturation: f32, contrast: f32, vignette: f32,\n  fringe: f32, highlight: f32, padding: vec2f,\n}\n@group(0) @binding(0) var<uniform> params: Params;\n@group(0) @binding(1) var base: texture_2d<f32>;\n@group(0) @binding(2) var emission: texture_2d<f32>;\n@group(0) @binding(3) var bloom0: texture_2d<f32>;\n@group(0) @binding(4) var bloom1: texture_2d<f32>;\n@group(0) @binding(5) var bloom2: texture_2d<f32>;\n@group(0) @binding(6) var bloom3: texture_2d<f32>;\n@group(0) @binding(7) var bloom4: texture_2d<f32>;\n@group(0) @binding(8) var bloom5: texture_2d<f32>;\n@group(0) @binding(9) var output: texture_storage_2d<rgba8unorm, write>;\n@group(0) @binding(10) var<storage, read> palette: array<u32>;\nfn levelSize(level: u32) -> vec2u {\n  switch level {\n    case 0u: { return textureDimensions(bloom0); } case 1u: { return textureDimensions(bloom1); }\n    case 2u: { return textureDimensions(bloom2); } case 3u: { return textureDimensions(bloom3); }\n    case 4u: { return textureDimensions(bloom4); } default: { return textureDimensions(bloom5); }\n  }\n}\nfn readLevel(level: u32, p: vec2i) -> vec3f {\n  switch level {\n    case 0u: { return textureLoad(bloom0, p, 0).rgb; } case 1u: { return textureLoad(bloom1, p, 0).rgb; }\n    case 2u: { return textureLoad(bloom2, p, 0).rgb; } case 3u: { return textureLoad(bloom3, p, 0).rgb; }\n    case 4u: { return textureLoad(bloom4, p, 0).rgb; } default: { return textureLoad(bloom5, p, 0).rgb; }\n  }\n}\nfn sampleLevel(level: u32, position: vec2f) -> vec3f {\n  let bound = vec2i(levelSize(level)) - vec2i(1);\n  let p = clamp(position, vec2f(0.0), vec2f(bound));\n  let a = vec2i(floor(p)); let b = min(a + vec2i(1), bound); let t = fract(p);\n  return mix(mix(readLevel(level, a), readLevel(level, vec2i(b.x, a.y)), t.x), mix(readLevel(level, vec2i(a.x, b.y)), readLevel(level, b), t.x), t.y);\n}\nfn tone(v: vec3f) -> vec3f {\n  let x = max(v, vec3f(0.0));\n  if (params.tone == 0u) { return x; }\n  if (params.tone == 1u) { return x / (vec3f(1.0) + x); }\n  return clamp((x * (2.51 * x + vec3f(.03))) / (x * (2.43 * x + vec3f(.59)) + vec3f(.14)), vec3f(0.0), vec3f(1.0));\n}\nfn srgb(v: vec3f) -> vec3f {\n  let x = clamp(v, vec3f(0.0), vec3f(1.0));\n  return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - vec3f(.055), 12.92 * x, x <= vec3f(.0031308));\n}\n@compute @workgroup_size(8, 8)\nfn main(@builtin(global_invocation_id) id: vec3u) {\n  if (any(id.xy >= params.size)) { return; }\n  let p = vec2i(id.xy); let c = textureLoad(base, p, 0);\n  var rgb = c.rgb + textureLoad(emission, p, 0).rgb;\n  let center = (vec2f(params.size) - vec2f(1.0)) * .5;\n  let normal = (vec2f(id.xy) - center) / max(vec2f(1.0), center);\n  let edge = min(1.0, dot(normal, normal) * .5);\n  if (params.levels > 0u) {\n    let normalizer = (1.0 - pow(.58, f32(params.levels))) / .42;\n    var weight = 1.0 / normalizer; var stride = 2.0; var glow = vec3f(0.0);\n    for (var level = 0u; level < params.levels; level++) {\n      let point = (vec2f(id.xy) + vec2f(.5)) / stride - vec2f(.5);\n      let fringe = normal * params.fringe / stride;\n      glow += vec3f(sampleLevel(level, point + fringe).r, sampleLevel(level, point).g, sampleLevel(level, point - fringe).b) * weight;\n      weight *= .58; stride *= 2.0;\n    }\n    rgb += glow * params.intensity;\n  }\n  var alpha = c.a;\n  if ((params.flags & 16u) == 0u) { alpha = max(alpha, clamp(max(rgb.r, max(rgb.g, rgb.b)) * .85, 0.0, 1.0)); }\n  var invA = 0.0; if (alpha > 0.0) { invA = 1.0 / alpha; }\n  rgb *= params.exposure * invA;\n  if (params.highlight > 0.0 && params.tone != 0u) {\n    let peak = max(rgb.r, max(rgb.g, rgb.b));\n    let onset = clamp((peak - 1.0) / 3.0, 0.0, 1.0);\n    let preserve = params.highlight * onset * onset * (3.0 - 2.0 * onset);\n    if (preserve > 0.0) { rgb = mix(tone(rgb), rgb * (tone(vec3f(peak)).r / peak), preserve); }\n    else { rgb = tone(rgb); }\n  } else { rgb = tone(rgb); }\n  let luminance = dot(rgb, vec3f(.2126, .7152, .0722));\n  rgb = (vec3f(luminance) + (rgb - vec3f(luminance)) * params.saturation - vec3f(.18)) * params.contrast + vec3f(.18);\n  var encoded = vec3u(floor(srgb(rgb * (1.0 - params.vignette * edge * edge)) * 255.0 + vec3f(.5)));\n  let alphaByte = floor(alpha * 255.0 + .5);\n  if (params.reserved.x > 0u && alphaByte > 0.0) {\n    var nearest = encoded; var distance = 0xffffffffu;\n    for (var i = 0u; i < params.reserved.x; i++) {\n      let c = palette[i]; let candidate = vec3u(c & 255u, (c >> 8u) & 255u, (c >> 16u) & 255u);\n      let delta = vec3i(encoded) - vec3i(candidate); let square = delta * delta; let d = u32(square.x + square.y + square.z);\n      if (d < distance) { distance = d; nearest = candidate; }\n    }\n    encoded = nearest;\n  }\n  textureStore(output, id.xy, vec4f(vec3f(encoded) / 255.0, alphaByte / 255.0));\n}\n";
var PRESENT_WGSL = "@group(0) @binding(0) var source: texture_2d<f32>;\n@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {\n  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));\n  return vec4f(p * 2.0 - vec2f(1.0), 0.0, 1.0);\n}\n@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {\n  let color = textureLoad(source, vec2i(p.xy), 0);\n  // The capture texture is straight alpha; browser presentation requests premultiplied alpha.\n  return vec4f(color.rgb * color.a, color.a);\n}\n";

// src/render/webgpu.ts
var clamp = (v, lo = 0, hi = Infinity) => Math.max(lo, Math.min(hi, v));
var UNIFORM = (binding) => ({ binding, visibility: 4, buffer: { type: "uniform" } });
var READ_BUFFER = (binding) => ({ binding, visibility: 4, buffer: { type: "read-only-storage" } });
var READ_TEXTURE = (binding) => ({ binding, visibility: 4, texture: { sampleType: "unfilterable-float" } });
var WRITE_TEXTURE = (binding, format = "rgba32float") => ({ binding, visibility: 4, storageTexture: { access: "write-only", format } });
function validateCinematicInput(frame, options = {}) {
  if (![frame.w, frame.h].every((v) => Number.isSafeInteger(v) && v > 0) || !Number.isSafeInteger(frame.w * frame.h)) throw new RangeError("Cinematic frame dimensions must be positive integers");
  const n = frame.w * frame.h;
  for (const [name, data, count] of [["color", frame.color, n], ["light", frame.light, n], ["hdrLight", frame.hdrLight, n * 3], ["radiance", options.radiance, n * 3], ["legacyLight", options.legacyLight, n], ["occlusion", options.occlusion, n], ["background", typeof options.background === "object" ? options.background : null, n]])
    if (data && data.length < count) throw new RangeError(`${name} buffer is too small`);
  for (const [name, value] of Object.entries(options)) if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError(`Cinematic ${name} must be finite`);
  if (options.bloom) {
    for (const value of Object.values(options.bloom)) if (!Number.isFinite(value)) throw new RangeError("Bloom parameters must be finite");
  }
  if (options.toneMap && !["aces", "reinhard", "none"].includes(options.toneMap)) throw new RangeError("Unknown tone mapper");
  if (options.finalPalette && (!options.finalPalette.length || options.finalPalette.length > 256 || !options.finalPalette.every((c) => Number.isInteger(c) && c >= -2147483648 && c <= 4294967295))) throw new RangeError("Final palette needs 1..256 packed RGB colors");
}
var WebGPUCinematicRenderer = class _WebGPUCinematicRenderer {
  constructor(device, canvas, options, owned) {
    this.canvas = canvas;
    this.options = options;
    this.device = device;
    this.ownedDevice = owned;
    this.cache = new ResidentGpuBuffers(device, options.maxBytes ?? 256 * 1024 * 1024);
    const slots = options.captureSlots ?? 3;
    if (!Number.isInteger(slots) || slots < 1 || slots > 8) throw new RangeError("Capture ring must contain 1..8 slots");
    this.captureSlots = Array.from({ length: slots }, () => ({ bytes: 0, busy: false }));
    device.addEventListener?.("uncapturederror", this.onDeviceError);
    void device.lost.then((info) => {
      if (this.current.state === "disposed") return;
      this.current = { ...this.current, state: "lost", reason: `WebGPU device lost (${info.reason}): ${info.message}` };
      options.onStatus?.(this.status);
    });
  }
  device;
  cache;
  context = null;
  ownedDevice;
  target;
  pipelines;
  dummy;
  uniform;
  captureSlots;
  clocks = [];
  revision = 0;
  current = { backend: "webgpu", state: "ready", reason: null, timestampQuery: false };
  timing = { prepare: 0, upload: 0, encode: 0, present: 0, gpu: null, readback: null };
  onDeviceError = (event) => {
    if (this.current.state !== "ready") return;
    this.current = { ...this.current, state: "lost", reason: `WebGPU validation/runtime error: ${event.error?.message ?? "unknown error"}` };
    this.options.onStatus?.(this.status);
  };
  static async create(canvas, options = {}) {
    const gpu = navigatorGPU();
    const adapter = options.device ? null : await gpu?.requestAdapter({ powerPreference: "high-performance" });
    if (!options.device && !adapter) throw new Error("WebGPU is unavailable or no adapter was granted");
    const device = options.device ?? await adapter.requestDevice({ requiredFeatures: adapter.features.has("timestamp-query") ? ["timestamp-query"] : [] });
    const renderer = new _WebGPUCinematicRenderer(device, canvas, options, !options.device);
    renderer.current.timestampQuery = device.features.has("timestamp-query");
    if (adapter) renderer.current.adapter = { ...adapter.info, software: adapter.isFallbackAdapter ?? adapter.info?.isFallbackAdapter ?? null };
    try {
      await renderer.initialize(gpu?.getPreferredCanvasFormat() ?? "bgra8unorm");
    } catch (error) {
      renderer.dispose();
      throw error;
    }
    options.onStatus?.(renderer.status);
    return renderer;
  }
  async initialize(format) {
    const d = this.device;
    if ((d.limits.maxStorageBuffersPerShaderStage ?? 8) < 7 || (d.limits.maxSampledTexturesPerShaderStage ?? 16) < 8) throw new Error("Adapter limits cannot run the cinematic pipeline");
    const [prepare, bloom, resolve, present] = await Promise.all([
      checkedShader(d, CINEMATIC_PREPARE_WGSL, "cinematic prepare"),
      checkedShader(d, CINEMATIC_BLOOM_WGSL, "cinematic bloom"),
      checkedShader(d, CINEMATIC_RESOLVE_WGSL, "cinematic resolve"),
      checkedShader(d, PRESENT_WGSL, "native-pixel presentation")
    ]);
    const layout = (entries) => d.createPipelineLayout({ bindGroupLayouts: [d.createBindGroupLayout({ entries })] });
    const prepareLayout = layout([UNIFORM(0), ...Array.from({ length: 7 }, (_, i) => READ_BUFFER(i + 1)), ...[8, 9, 10].map((i) => WRITE_TEXTURE(i))]);
    const bloomLayout = layout([READ_TEXTURE(0), WRITE_TEXTURE(1)]);
    const resolveLayout = layout([UNIFORM(0), ...Array.from({ length: 8 }, (_, i) => READ_TEXTURE(i + 1)), WRITE_TEXTURE(9, "rgba8unorm"), READ_BUFFER(10)]);
    const make = (module, entryPoint, pipelineLayout) => d.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } });
    const [p, down, horizontal, vertical, r] = await Promise.all([make(prepare, "main", prepareLayout), make(bloom, "down", bloomLayout), make(bloom, "horizontal", bloomLayout), make(bloom, "vertical", bloomLayout), make(resolve, "main", resolveLayout)]);
    this.pipelines = { prepare: p, down, horizontal, vertical, resolve: r };
    if (this.canvas) {
      this.context = this.canvas.getContext("webgpu");
      if (!this.context) throw new Error("WebGPU canvas context unavailable");
      this.context.configure({ device: d, format, alphaMode: "premultiplied" });
      this.pipelines.present = await d.createRenderPipelineAsync({ layout: "auto", vertex: { module: present, entryPoint: "vertex" }, fragment: { module: present, entryPoint: "fragment", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
    }
    this.uniform = d.createBuffer({ size: 80, usage: GPU_BUFFER.UNIFORM | GPU_BUFFER.COPY_DST, label: "cinematic parameters" });
    this.dummy = this.texture(1, 1, "rgba32float");
    if (this.current.timestampQuery) for (let i = 0; i < 3; i++) this.clocks.push({
      query: d.createQuerySet({ type: "timestamp", count: 2 }),
      resolve: d.createBuffer({ size: 16, usage: GPU_BUFFER.QUERY_RESOLVE | GPU_BUFFER.COPY_SRC }),
      read: d.createBuffer({ size: 16, usage: GPU_BUFFER.COPY_DST | GPU_BUFFER.MAP_READ }),
      busy: false
    });
  }
  texture(w, h, format) {
    return this.device.createTexture({ size: [w, h], format, usage: GPU_TEXTURE.STORAGE_BINDING | GPU_TEXTURE.TEXTURE_BINDING | GPU_TEXTURE.COPY_SRC });
  }
  clearTarget() {
    if (!this.target) return;
    const t = this.target;
    [t.base, t.emission, t.extracted, t.output, ...t.bloom.flatMap((l) => [l.data, l.scratch])].forEach((texture) => texture.destroy());
    this.target = void 0;
  }
  prepareTarget(w, h, levels) {
    if (this.target?.w === w && this.target.h === h && this.target.levels === levels) return this.target;
    if (Math.max(w, h) > this.device.limits.maxTextureDimension2D || w * h * 12 > this.device.limits.maxStorageBufferBindingSize) throw new RangeError("Frame exceeds adapter texture or storage limits");
    let lw = w, lh = h, bytes = w * h * 52;
    for (let i = 0; i < levels; i++) {
      lw = Math.max(1, Math.ceil(lw / 2));
      lh = Math.max(1, Math.ceil(lh / 2));
      bytes += lw * lh * 32;
    }
    if (bytes + w * h * 44 > (this.options.maxBytes ?? 256 * 1024 * 1024)) throw new RangeError("Cinematic frame exceeds GPU memory budget");
    this.clearTarget();
    const bloom = [];
    lw = w;
    lh = h;
    for (let i = 0; i < levels; i++) {
      lw = Math.max(1, Math.ceil(lw / 2));
      lh = Math.max(1, Math.ceil(lh / 2));
      bloom.push({ data: this.texture(lw, lh, "rgba32float"), scratch: this.texture(lw, lh, "rgba32float") });
    }
    this.target = { w, h, levels, base: this.texture(w, h, "rgba32float"), emission: this.texture(w, h, "rgba32float"), extracted: this.texture(w, h, "rgba32float"), output: this.texture(w, h, "rgba8unorm"), bloom, bytes };
    if (this.canvas) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return this.target;
  }
  assertReady() {
    if (this.current.state !== "ready") throw new Error(this.current.reason ?? `Renderer is ${this.current.state}`);
  }
  render(frame, options = {}) {
    this.assertReady();
    validateCinematicInput(frame, options);
    this.cache.beginFrame();
    const start = performance.now(), revision = ++this.revision;
    const color = this.cache.upload("frame color", frame.color, revision), light = this.cache.upload("frame packed light", frame.light, revision);
    const hdrLight = frame.hdrLight ? this.cache.upload("frame HDR light", frame.hdrLight, revision) : void 0;
    this.timing.upload = performance.now() - start;
    return this.renderBuffers({ w: frame.w, h: frame.h, color, light, hdrLight }, options, false);
  }
  /** Consume GPU-authored DrawIR/particle buffers directly; no GPU→CPU→GPU round trip. */
  renderBuffers(frame, options = {}, beginFrame = true) {
    this.assertReady();
    validateCinematicInput({ w: frame.w, h: frame.h }, options);
    if (beginFrame) {
      this.cache.beginFrame();
      this.timing.upload = 0;
      ++this.revision;
    }
    const prepareStart = performance.now(), bloom = options.bloom === false ? null : options.bloom ?? {};
    const levels = bloom ? clamp(Math.floor(bloom.levels ?? 4), 1, 6) : 0;
    const t = this.prepareTarget(frame.w, frame.h, levels), d = this.device;
    this.timing.prepare = performance.now() - prepareStart;
    const uploadStart = performance.now(), zero = new Uint32Array(1);
    const placeholder = this.cache.upload("zero", zero, 0);
    const background = options.background instanceof Uint32Array ? this.cache.upload("background", options.background, this.revision) : placeholder;
    const legacy = options.legacyLight ? this.cache.upload("extra packed light", options.legacyLight, this.revision) : placeholder;
    const radiance = options.radiance ? this.cache.upload("extra HDR radiance", options.radiance, this.revision) : placeholder;
    const occlusion = options.occlusion ? this.cache.upload("occlusion", options.occlusion, this.revision) : placeholder;
    const palette = options.finalPalette ? this.cache.upload("final palette", new Uint32Array(options.finalPalette), JSON.stringify(options.finalPalette)) : placeholder;
    const data = new ArrayBuffer(80), u = new Uint32Array(data), f = new Float32Array(data);
    u[0] = frame.w;
    u[1] = frame.h;
    u[2] = (frame.hdrLight ? 1 : 0) | (options.radiance ? 2 : 0) | (options.legacyLight ? 4 : 0) | (options.occlusion ? 8 : 0) | (options.background != null ? 16 : 0) | (options.background instanceof Uint32Array ? 32 : 0);
    u[3] = typeof options.background === "number" ? options.background : 0;
    u[4] = options.toneMap === "none" ? 0 : options.toneMap === "reinhard" ? 1 : 2;
    u[5] = levels;
    u[6] = options.finalPalette?.length ?? 0;
    f.set([clamp(options.lightStrength ?? 1), clamp(bloom?.threshold ?? 0.16), clamp(bloom?.knee ?? 0.18), clamp(options.exposure ?? 1.15), clamp(bloom?.intensity ?? 0.9), clamp(options.saturation ?? 1.08), clamp(options.contrast ?? 1.04), clamp(options.vignette ?? 0.08, 0, 1), clamp(options.chromaticFringe ?? 0.45), clamp(options.highlightColor ?? 0, 0, 1)], 8);
    d.queue.writeBuffer(this.uniform, 0, data);
    this.timing.upload += performance.now() - uploadStart;
    const encodeStart = performance.now(), encoder = d.createCommandEncoder({ label: "cinematic frame" });
    const clock = this.clocks.find((c) => !c.busy);
    if (clock) clock.busy = true;
    const pass = encoder.beginComputePass(clock ? { timestampWrites: { querySet: clock.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
    const group = (p, entries) => d.createBindGroup({ layout: p.getBindGroupLayout(0), entries });
    const buf = (binding, buffer) => ({ binding, resource: { buffer } });
    const tex = (binding, texture) => ({ binding, resource: texture.createView() });
    pass.setPipeline(this.pipelines.prepare);
    pass.setBindGroup(0, group(this.pipelines.prepare, [buf(0, this.uniform), ...[frame.color, frame.light, background, legacy, frame.hdrLight ?? placeholder, radiance, occlusion].map((b, i) => buf(i + 1, b)), tex(8, t.base), tex(9, t.emission), tex(10, t.extracted)]));
    pass.dispatchWorkgroups(Math.ceil(t.w / 8), Math.ceil(t.h / 8));
    let source = t.extracted;
    for (const level of t.bloom) {
      for (const [pipeline, input, output] of [[this.pipelines.down, source, level.data], [this.pipelines.horizontal, level.data, level.scratch], [this.pipelines.vertical, level.scratch, level.data]]) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group(pipeline, [tex(0, input), tex(1, output)]));
        pass.dispatchWorkgroups(Math.ceil(output.width / 8), Math.ceil(output.height / 8));
      }
      source = level.data;
    }
    pass.setPipeline(this.pipelines.resolve);
    pass.setBindGroup(0, group(this.pipelines.resolve, [buf(0, this.uniform), tex(1, t.base), tex(2, t.emission), ...Array.from({ length: 6 }, (_, i) => tex(i + 3, t.bloom[i]?.data ?? this.dummy)), tex(9, t.output), buf(10, palette)]));
    pass.dispatchWorkgroups(Math.ceil(t.w / 8), Math.ceil(t.h / 8));
    pass.end();
    if (clock) {
      encoder.resolveQuerySet(clock.query, 0, 2, clock.resolve, 0);
      encoder.copyBufferToBuffer(clock.resolve, 0, clock.read, 0, 16);
    }
    this.timing.encode = performance.now() - encodeStart;
    const presentStart = performance.now();
    if (this.context && this.pipelines.present) {
      const present = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      present.setPipeline(this.pipelines.present);
      present.setBindGroup(0, group(this.pipelines.present, [tex(0, t.output)]));
      present.draw(3);
      present.end();
    }
    d.queue.submit([encoder.finish()]);
    this.timing.present = performance.now() - presentStart;
    if (clock) void clock.read.mapAsync(GPU_BUFFER.MAP_READ).then(() => {
      const times = new BigUint64Array(clock.read.getMappedRange());
      this.timing.gpu = Number(times[1] - times[0]) / 1e6;
    }).catch(() => {
      this.timing.gpu = null;
    }).finally(() => {
      try {
        clock.read.unmap();
      } catch {
      }
      clock.busy = false;
    });
    return this.canvas;
  }
  /** Async map on a bounded staging ring. Await each call or handle explicit backpressure. */
  async capture() {
    this.assertReady();
    const t = this.target;
    if (!t) throw new Error("Render a frame before capture");
    const slot = this.captureSlots.find((s) => !s.busy);
    if (!slot) throw new Error("Capture ring is full; await an outstanding capture before requesting another");
    const row = Math.ceil(t.w * 4 / 256) * 256, bytes = row * t.h;
    if (bytes > this.device.limits.maxBufferSize) throw new RangeError("Capture exceeds adapter buffer limit");
    if (!slot.buffer || slot.bytes !== bytes) {
      slot.buffer?.destroy();
      slot.buffer = this.device.createBuffer({ size: bytes, usage: GPU_BUFFER.COPY_DST | GPU_BUFFER.MAP_READ, label: "capture staging" });
      slot.bytes = bytes;
    }
    slot.busy = true;
    const buffer = slot.buffer, start = performance.now();
    try {
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: t.output }, { buffer, bytesPerRow: row, rowsPerImage: t.h }, { width: t.w, height: t.h, depthOrArrayLayers: 1 });
      this.device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPU_BUFFER.MAP_READ);
      const mapped = new Uint8Array(buffer.getMappedRange()), rgba = new Uint8ClampedArray(t.w * t.h * 4);
      for (let y = 0; y < t.h; y++) rgba.set(mapped.subarray(y * row, y * row + t.w * 4), y * t.w * 4);
      this.timing.readback = performance.now() - start;
      return rgba;
    } finally {
      try {
        buffer.unmap();
      } finally {
        slot.busy = false;
      }
    }
  }
  get status() {
    return Object.freeze({ ...this.current });
  }
  get timings() {
    return { ...this.timing };
  }
  get resources() {
    return { ...this.cache.resources, textureBytes: this.target?.bytes ?? 0, stagingBytes: this.captureSlots.reduce((n, s) => n + s.bytes, 0), pendingCaptures: this.captureSlots.filter((s) => s.busy).length };
  }
  dispose() {
    if (this.current.state === "disposed") return;
    this.current = { ...this.current, state: "disposed" };
    this.clearTarget();
    this.cache.dispose();
    this.uniform?.destroy();
    this.dummy?.destroy();
    for (const s of this.captureSlots) s.buffer?.destroy();
    for (const c of this.clocks) {
      c.query.destroy();
      c.resolve.destroy();
      c.read.destroy();
    }
    this.context?.unconfigure();
    this.device.removeEventListener?.("uncapturederror", this.onDeviceError);
    if (this.ownedDevice) this.device.destroy();
    this.options.onStatus?.(this.status);
  }
};
var CinematicFrameRenderer = class _CinematicFrameRenderer {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cinematic presentation needs a 2D canvas");
    this.context = context;
  }
  context;
  gpu = null;
  cpu = new CinematicCompositor();
  image;
  current = { backend: "cpu", state: "ready", reason: null, timestampQuery: false };
  cpuTiming = { prepare: 0, upload: 0, encode: 0, present: 0, gpu: null, readback: null };
  static async create(canvas, options = {}) {
    if (!["cpu", "auto", "webgpu"].includes(options.backend ?? "cpu")) throw new RangeError("Unknown cinematic backend");
    const renderer = new _CinematicFrameRenderer(canvas, options);
    await renderer.retry();
    return renderer;
  }
  async retry() {
    if (this.current.state === "disposed") throw new Error("Renderer is disposed");
    this.gpu?.dispose();
    this.gpu = null;
    this.current = { backend: "cpu", state: "ready", reason: null, timestampQuery: false };
    if (this.options.backend && this.options.backend !== "cpu") try {
      this.gpu = await WebGPUCinematicRenderer.create(this.canvas.ownerDocument.createElement("canvas"), { ...this.options, onStatus: (status) => {
        if (status.state === "lost") {
          this.current = { ...status, backend: "cpu", state: "ready" };
          this.options.onStatus?.(this.status);
        }
      } });
      this.current = { ...this.gpu.status };
    } catch (error) {
      this.current.reason = error instanceof Error ? error.message : String(error);
    }
    this.options.onStatus?.(this.status);
  }
  render(frame, options = {}) {
    if (this.current.state === "disposed") throw new Error("Renderer is disposed");
    validateCinematicInput(frame, options);
    if (this.canvas.width !== frame.w) this.canvas.width = frame.w;
    if (this.canvas.height !== frame.h) this.canvas.height = frame.h;
    if (this.gpu?.status.state === "ready") try {
      const surface = this.gpu.render(frame, options);
      const start2 = performance.now(), ctx = this.context;
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "copy";
        ctx.filter = "none";
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(surface, 0, 0);
      } finally {
        ctx.restore();
      }
      this.cpuTiming.present = performance.now() - start2;
      return;
    } catch (error) {
      this.gpu.dispose();
      this.gpu = null;
      this.current = { backend: "cpu", state: "ready", reason: error instanceof Error ? error.message : String(error), timestampQuery: false };
      this.options.onStatus?.(this.status);
    }
    if (!this.image || this.image.width !== frame.w || this.image.height !== frame.h) this.image = this.context.createImageData(frame.w, frame.h);
    let start = performance.now();
    this.cpu.render(frame, this.image.data, options);
    this.cpuTiming.encode = performance.now() - start;
    start = performance.now();
    this.context.putImageData(this.image, 0, 0);
    this.cpuTiming.present = performance.now() - start;
  }
  async capture() {
    if (this.current.state === "disposed") throw new Error("Renderer is disposed");
    if (this.gpu?.status.state === "ready") return this.gpu.capture();
    if (!this.image) throw new Error("Render a frame before capture");
    return this.image.data.slice();
  }
  get status() {
    return Object.freeze({ ...this.current });
  }
  get timings() {
    return this.gpu?.status.state === "ready" ? { ...this.gpu.timings, present: this.gpu.timings.present + this.cpuTiming.present } : { ...this.cpuTiming };
  }
  get resources() {
    return this.gpu?.resources ?? { buffers: 0, bytes: 0, uploadedBytes: 0, writes: 0, avoidedUploadBytes: 0, textureBytes: 0, stagingBytes: 0, pendingCaptures: 0 };
  }
  dispose() {
    if (this.current.state === "disposed") return;
    this.current.state = "disposed";
    this.gpu?.dispose();
    this.gpu = null;
    this.options.onStatus?.(this.status);
  }
};

export {
  PlaybackClock,
  integerViewport,
  CinematicFrameRenderer
};
