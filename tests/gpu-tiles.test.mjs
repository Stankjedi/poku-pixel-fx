import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDrawTiles, DRAW_TILE_CAPACITY } from '../build/render/draw-tiles.js';
import { ResidentGpuBuffers } from '../build/render/gpu-resources.js';
import { WebGPUCinematicRenderer, CinematicFrameRenderer } from '../build/render/webgpu.js';
import { WebGPUDrawRenderer } from '../build/render/draw-ir-gpu.js';
import { createGpuLabScene } from '../build/examples/gpu-lab.js';
import { compileDrawScene, serializeDrawScene, parseDrawScene } from '../build/render/draw-ir.js';

test('tile diagnostics weight partial edge tiles and preserve overflow as a complete scan', () => {
  const data = new Uint32Array(4 * (DRAW_TILE_CAPACITY + 1));
  [1, 2, 3, 0xffffffff].forEach((n, i) => { data[i * (DRAW_TILE_CAPACITY + 1)] = n; });
  const stats = summarizeDrawTiles(17, 19, 300, data);
  assert.equal(stats.candidatePixelVisits, 256 + 2 * 16 + 3 * 48 + 300 * 3);
  assert.equal(stats.directPixelVisits, 17 * 19 * 300);
  assert.equal(stats.overflowTiles, 1);
  assert.equal(stats.maxCandidates, 300);
  assert.equal(stats.binningBoundsUpperBound, 1200);
  assert.equal(summarizeDrawTiles(17, 19, 300).candidatePixelVisits, 17 * 19 * 300);
  data[0] = 257;
  assert.throws(() => summarizeDrawTiles(17, 19, 300, data), /candidate/);
});

function memoryDevice() {
  const writes = [], created = [];
  let failure = null;
  return {
    limits: { maxStorageBufferBindingSize: 1024, maxBufferSize: 1024 }, writes, created,
    fail(stage) { failure = stage; },
    queue: { writeBuffer(buffer, offset, data) { if (failure === 'write') throw new Error('write rejected'); writes.push({ buffer, offset, bytes: data.byteLength }); } },
    createBuffer({ size }) { if (failure === 'allocate') throw new Error('allocation rejected'); const buffer = { size, destroyed: false, destroy() { this.destroyed = true; } }; created.push(buffer); return buffer; },
  };
}

test('resident dirty-range preflight rejects a later invalid range before mutating any GPU bytes', () => {
  const device = memoryDevice(), cache = new ResidentGpuBuffers(device, 1024), data = new Uint32Array(8);
  cache.upload('sprite', data, 1); cache.beginFrame();
  assert.throws(() => cache.upload('sprite', data, 2, [{ offset: 0, size: 4 }, { offset: 9, size: 4 }]), /aligned/);
  assert.equal(device.writes.length, 1);
  assert.equal(cache.resources.uploadedBytes, 0);
  cache.upload('sprite', data, 2);
  assert.equal(device.writes.length, 2);
});

test('resident resize failure retains the old asset and a failed upload never caches the new revision', () => {
  const device = memoryDevice(), cache = new ResidentGpuBuffers(device, 1024), old = cache.upload('sprite', new Uint32Array(4), 1);
  device.fail('allocate'); assert.throws(() => cache.upload('sprite', new Uint32Array(8), 2), /allocation/);
  assert.equal(old.destroyed, false); assert.equal(cache.resources.bytes, 16);
  device.fail('write'); assert.throws(() => cache.upload('sprite', new Uint32Array(8), 2), /write/);
  assert.equal(device.created[1].destroyed, true); assert.equal(old.destroyed, false);
  device.fail(null); cache.upload('sprite', new Uint32Array(8), 2);
  assert.equal(old.destroyed, true); assert.equal(cache.resources.bytes, 32);
  cache.dispose(); assert.equal(cache.resources.bytes, 0);
  assert.throws(() => cache.upload('sprite', new Uint32Array(8), 2), /disposed/);
});

test('DrawIR accounts resident assets with its output and drops only the optional tile allocation at a tight budget', async () => {
  // Allocation/contract check only; the separate WGSL harness executes real GPU work.
  const device = memoryDevice();
  device.limits = { maxStorageBufferBindingSize: 1024 * 1024, maxBufferSize: 1024 * 1024 };
  device.createShaderModule = () => ({ getCompilationInfo: async () => ({ messages: [] }) });
  device.createComputePipelineAsync = async () => ({ getBindGroupLayout: () => ({}) });
  device.createBindGroup = () => ({});
  device.createCommandEncoder = () => ({ beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }), finish: () => ({}) });
  device.queue.submit = () => {};
  const renderer = await WebGPUDrawRenderer.create(device, 1024, { culling: 'tiled' });
  const scene = { schema: 'poku-draw/v1', width: 8, height: 8, commands: [{ op: 'rect', origin: [0, 0, 0], size: [2, 2], material: { color: 0xffffffff, blend: 'opaque' } }] };
  assert.throws(() => renderer.render(scene), /resident assets exceed/);
  assert.equal(renderer.assets.resources.bytes, 0);
  renderer.render({ ...scene, width: 2, height: 2 });
  assert.equal(renderer.resources.culling, 'direct');
  assert.match(renderer.resources.cullingReason, /budget/);
  assert.equal(renderer.resources.outputBytes, 80);
  renderer.dispose();
  assert.equal(renderer.resources.outputBytes + renderer.resources.bytes + renderer.resources.tileBytes + renderer.resources.commandMergeBytes, 0);
});

test('cinematic retry keeps only the latest device and dispose cancels a pending initialization', async () => {
  const create = WebGPUCinematicRenderer.create, pending = [], candidates = [];
  WebGPUCinematicRenderer.create = async (_canvas, options) => new Promise(resolve => {
    const candidate = { status: { backend: 'webgpu', state: 'ready', reason: null, timestampQuery: false }, disposed: false, dispose() { this.disposed = true; this.status.state = 'disposed'; options.onStatus?.(this.status); } };
    candidates.push(candidate); pending.push(() => resolve(candidate));
  });
  const options = { backend: 'cpu' }, canvas = { getContext: () => ({}), ownerDocument: { createElement: () => ({}) } };
  let renderer;
  try {
    renderer = await CinematicFrameRenderer.create(canvas, options); options.backend = 'webgpu';
    const first = renderer.retry(), second = renderer.retry();
    pending[1](); await second; pending[0](); await first;
    assert.equal(renderer.status.backend, 'webgpu'); assert.equal(candidates[0].disposed, true); assert.equal(candidates[1].disposed, false);
    const third = renderer.retry(); renderer.dispose(); pending[2](); await third;
    assert.equal(renderer.status.state, 'disposed'); assert.equal(candidates[1].disposed, true); assert.equal(candidates[2].disposed, true);
  } finally { renderer?.dispose(); WebGPUCinematicRenderer.create = create; }
});

test('GPU Lab scene preserves one six-second loop and portable atlas data across JSON save/open', () => {
  const first = createGpuLabScene(0), end = createGpuLabScene(6);
  assert.equal(serializeDrawScene(first), serializeDrawScene(end));
  const compiled = compileDrawScene(first), restored = compileDrawScene(parseDrawScene(serializeDrawScene(first)));
  assert.deepEqual(compiled.commands, restored.commands); assert.deepEqual(compiled.color, restored.color);
  assert.equal(compiled.count, 261); assert.equal(compiled.alphaPrimitives, 0);
  assert.throws(() => createGpuLabScene(0, { count: 4097 }), /parameters/);
});
