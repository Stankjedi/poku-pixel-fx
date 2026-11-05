import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuParticleSystem } from '../build/render/gpu-particles.js';
import { WebGPUDrawRenderer } from '../build/render/draw-ir-gpu.js';

// Records host/API effects, without implementing or pretending to execute WGSL.
// Shader/output parity is exercised separately by tests/browser/gpu.mjs.
function recordingDevice() {
  const buffers = [], writes = [], dispatches = [], copies = [], groups = [];
  let failAt = -1;
  const device = {
    limits: { maxStorageBufferBindingSize: 32 * 1024 * 1024, maxBufferSize: 32 * 1024 * 1024 },
    buffers, writes, dispatches, copies, groups,
    failAllocationAt(index) { failAt = index; },
    queue: {
      writeBuffer(buffer, offset, source, dataOffset = 0, size) {
        const view = ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source);
        const data = view.slice(dataOffset, dataOffset + (size ?? view.byteLength - dataOffset));
        assert.ok(!buffer.destroyed); buffer.bytes.set(data, offset); writes.push({ buffer, offset, data });
      },
      submit(commands) { for (const command of commands) for (const op of command.ops) op(); },
    },
    createBuffer({ size, usage }) {
      if (buffers.length === failAt) throw new Error('Allocation failed');
      const buffer = { size, usage, bytes: new Uint8Array(size), destroyed: false,
        destroy() { this.destroyed = true; }, mapAsync: async () => {}, unmap() {}, getMappedRange() { return this.bytes.buffer; } };
      buffers.push(buffer); return buffer;
    },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createComputePipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup(value) { const group = { ...value }; groups.push(group); return group; },
    createCommandEncoder() {
      const ops = [];
      return {
        copyBufferToBuffer(source, offset, target, targetOffset, size) {
          copies.push({ source, offset, target, targetOffset, size });
          ops.push(() => { assert.ok(!source.destroyed && !target.destroyed); target.bytes.set(source.bytes.slice(offset, offset + size), targetOffset); });
        },
        beginComputePass() { return { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups(...groups) { dispatches.push(groups); }, end() {} }; },
        finish: () => ({ ops }),
      };
    },
  };
  return device;
}
const spec = (extra = {}) => ({ position: [10, 8, 2], velocity: [3, -2, 0], gravity: [0, 4, 0], radius: 1, lifetime: 2, color: 0xffaabbcc, ...extra });

test('GPU bursts coalesce uploads, bound dispatch/draw to occupied slots, and skip idle updates', async () => {
  const device = recordingDevice(), particles = await GpuParticleSystem.create(device, { capacity: 4096 });
  try {
    assert.equal(device.dispatches.length, 0);
    assert.equal(particles.count, 0);
    const handles = particles.spawnBatch(Array.from({ length: 128 }, () => spec()));
    assert.deepEqual(handles.map(h => h.slot), Array.from({ length: 128 }, (_, i) => i));
    assert.equal(particles.active, 128); assert.equal(particles.count, 128);
    assert.equal(device.writes.length, 0, 'spawns remain staged until an update or explicit snapshot');
    particles.advance(0);
    assert.equal(particles.resources.spawnUploadCalls, 1);
    assert.equal(particles.resources.spawnUploadBytes, 128 * 80);
    assert.deepEqual(device.dispatches, [[2]]);
    assert.equal(device.groups.length, 1);
    particles.advance(0); particles.advance(1 / 480);
    assert.equal(device.dispatches.length, 1, 'no completed tick and no new spawn needs no dispatch');
    particles.advance(2);
    assert.equal(particles.tick, 240); assert.equal(particles.active, 0); assert.equal(particles.count, 0);
    assert.equal(particles.resources.lastUpdateSlots, 128, 'one final dispatch clears expired slots');
    particles.advance(2);
    assert.equal(device.dispatches.length, 2);
    assert.equal(device.groups.length, 1, 'the immutable particle bind group is reused');
    assert.equal(particles.resources.lastUpdateSlots, 0);
  } finally { particles.dispose(); }
});

test('recycled holes use the lowest free slots and never upload stale staging over surviving GPU state', async () => {
  const device = recordingDevice(), particles = await GpuParticleSystem.create(device, { capacity: 8, hz: 4 });
  try {
    particles.spawnBatch([spec({ lifetime: .25 }), spec(), spec({ lifetime: .25 }), spec()]); particles.advance(.25);
    assert.equal(particles.active, 2); assert.equal(particles.count, 4);
    // Independent sentinel stands in for state owned and modified by GPU compute.
    const state = device.buffers[0]; state.bytes.fill(0x5a, 80, 160); state.bytes.fill(0xa5, 240, 320);
    const before = state.bytes.slice();
    assert.deepEqual(particles.spawnBatch([spec(), spec()]), [{ id: 5, slot: 0 }, { id: 6, slot: 2 }]);
    const writes = device.writes.length; particles.advance(0);
    assert.deepEqual(device.writes.slice(writes).filter(w => w.buffer === state).map(w => [w.offset, w.data.length]), [[0, 80], [160, 80]]);
    assert.deepEqual(state.bytes.slice(80, 160), before.slice(80, 160));
    assert.deepEqual(state.bytes.slice(240, 320), before.slice(240, 320));
    particles.advance(1.75);
    assert.equal(particles.active, 2); assert.equal(particles.count, 3, 'only the trailing free slot is removed; stable slot two remains');
    particles.advance(.25); assert.equal(particles.count, 0); assert.equal(particles.active, 0);
    assert.deepEqual(particles.spawn(spec()), { id: 7, slot: 0 });
    const snapshot = await particles.snapshot();
    assert.equal(snapshot[0], 10, 'snapshot flushes a staged spawn without requiring a simulation tick');
    assert.equal(new Uint32Array(snapshot.buffer)[12], 7);
  } finally { particles.dispose(); }
});

test('invalid bursts reserve no slots or IDs, and clear cancels staged work and restores seeded replay', async () => {
  const device = recordingDevice(), particles = await GpuParticleSystem.create(device, { capacity: 3 });
  try {
    for (const bad of [spec({ gravity: [1, 2] }), spec({ velocity: [1e99, 0, 0] }), spec({ blend: 'alpha' }), spec({ seed: NaN })]) {
      assert.throws(() => particles.spawnBatch([spec(), bad]), /Invalid/);
      assert.equal(particles.active, 0); assert.equal(particles.count, 0); assert.equal(particles.resources.pendingSpawns, 0);
    }
    assert.throws(() => particles.spawnBatch(Array.from({ length: 4 }, () => spec())), /capacity/);
    assert.equal(device.writes.length, 0);
    assert.deepEqual(particles.spawn(spec()), { id: 1, slot: 0 });
    particles.clear(); particles.advance(0);
    assert.equal(particles.active, 0); assert.equal(particles.count, 0); assert.equal(device.dispatches.length, 0);
    assert.ok((await particles.snapshot()).every(v => v === 0));
    assert.deepEqual(particles.spawn(spec()), { id: 1, slot: 0 });
    particles.advance(0); const first = await particles.snapshot(); particles.clear(); particles.spawn(spec()); particles.advance(0);
    assert.deepEqual(await particles.snapshot(), first);
  } finally { particles.dispose(); }
});

test('particle allocation limits and partial allocation failures do not leak GPU buffers', async () => {
  const small = recordingDevice(); small.limits.maxStorageBufferBindingSize = 127;
  await assert.rejects(GpuParticleSystem.create(small, { capacity: 1 }), /adapter/); assert.equal(small.buffers.length, 0);
  const failing = recordingDevice(); failing.failAllocationAt(1);
  await assert.rejects(GpuParticleSystem.create(failing), /Allocation failed/);
  assert.ok(failing.buffers.every(b => b.destroyed));
});

const scene = (size = 16) => ({ schema: 'poku-draw/v1', width: size, height: size,
  commands: [{ op: 'rect', origin: [1, 1, 0], size: [4, 4], material: { color: 0xffffffff, blend: 'opaque' } }] });

test('DrawIR reuses merge capacity and bindings as particles expire, then releases capacity when a larger frame needs it', async () => {
  const device = recordingDevice(), draw = await WebGPUDrawRenderer.create(device, 65536, { culling: 'none' });
  const commands = device.createBuffer({ size: 128 * 128 });
  try {
    draw.render(scene(), { commands, count: 128, alphaPrimitives: 0 });
    const first = device.buffers.length, groups = device.groups.length, merge = device.copies.at(-1).target;
    assert.equal(draw.resources.commandMergeBytes, 32768);
    draw.render(scene(), { commands, count: 20, alphaPrimitives: 0 });
    assert.equal(device.buffers.length, first); assert.equal(device.groups.length, groups);
    assert.equal(device.copies.at(-1).target, merge); assert.equal(device.copies.at(-1).size, 20 * 128);
    assert.equal(draw.resources.primitives, 21);
    draw.render(scene()); assert.equal(draw.resources.commandMergeBytes, 32768, 'idle bursts retain reusable capacity when it fits');
    draw.render(scene(56)); assert.equal(draw.resources.commandMergeBytes, 0); assert.equal(merge.destroyed, true);
    assert.equal(draw.resources.outputBytes, 56 * 56 * 20);
  } finally { draw.dispose(); commands.destroy(); }
});

test('DrawIR output resize preserves the last frame if a replacement allocation fails', async () => {
  const device = recordingDevice(), draw = await WebGPUDrawRenderer.create(device, 65536, { culling: 'none' });
  try {
    const previous = draw.render(scene());
    device.failAllocationAt(device.buffers.length + 1);
    assert.throws(() => draw.render(scene(24)), /Allocation failed/);
    assert.equal(previous.color.destroyed, false); assert.equal(previous.light.destroyed, false); assert.equal(previous.hdrLight.destroyed, false);
    assert.equal(draw.resources.outputBytes, 16 * 16 * 20);
    assert.equal(device.buffers.at(-1).destroyed, true, 'partial replacement is cleaned up');
    device.failAllocationAt(-1); assert.equal(draw.render(scene()), previous);
  } finally { draw.dispose(); }
});
