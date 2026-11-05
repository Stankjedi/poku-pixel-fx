import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDrawScene, renderDrawSceneCPU, parseDrawScene, serializeDrawScene } from '../build/render/draw-ir.js';
import { ResidentGpuBuffers } from '../build/render/gpu-resources.js';
import { createFrame, clearFrame } from '../build/core/fx.js';
import { Painter } from '../build/core/painter.js';
import { addLinearLight2D } from '../build/render/surface2d.js';
import { createFrame3D, clearFrame3D } from '../build/3d/frame.js';
import { Painter3D } from '../build/3d/painter.js';
import { surfacesFor3D, configureSurfaceBudget3D, surfaceDiagnostics3D } from '../build/3d/surface.js';
import { combineVolumeFields3D, VolumeGrid3D } from '../build/3d/volume.js';
import { createRenderProfile3D, parseRenderProfile3D, serializeRenderProfile3D } from '../build/render/profile3d.js';
import { captureCinematicSequence } from '../build/render/gpu-capture.js';
import { FrameProfiler } from '../build/render/metrics.js';
import { CinematicCompositor } from '../build/render/cinematic.js';
const scene = commands => ({ schema: 'poku-draw/v1', width: 2, height: 2, commands });
const rect = (depth, material) => ({ op: 'rect', origin: [0, 0, depth], size: [2, 2], material });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);

test('DrawIR transparent geometry sorts by per-pixel depth independent of submission order', () => {
  const layers = [rect(-1, { color: 0xff0000ff, blend: 'opaque', emission: [2, 0, 0] }), rect(1, { color: 0xff00ff00, opacity: .5 }), rect(2, { color: 0xffff0000, opacity: .5 })];
  const reference = renderDrawSceneCPU(scene(layers));
  for (const order of [[2, 0, 1], [1, 2, 0], [2, 1, 0]]) { const actual = renderDrawSceneCPU(scene(order.map(i => layers[i]))); assert.deepEqual(actual.color, reference.color); assert.deepEqual(actual.hdrLight, reference.hdrLight); }
  near(reference.hdrLight[0], .5);
});
test('DrawIR surface additive light is attenuated by foreground coverage while optical light is independent', () => {
  for (const emissionKind of ['surface', 'optical']) {
    const f = renderDrawSceneCPU(scene([rect(0, { color: 0xffffffff, blend: 'additive', emission: [4, 0, 0], emissionKind }), rect(1, { color: 0xff000000, opacity: .75 })])); near(f.hdrLight[0], emissionKind === 'surface' ? 1 : 4);
  }
});
test('DrawIR triangulated quad owns its shared edge once', () => {
  const f = renderDrawSceneCPU(scene([{ op: 'mesh', vertices: [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]], indices: [0, 1, 2, 0, 2, 3], material: { color: 0xffffffff, opacity: .5 } }]));
  assert.deepEqual(Array.from(f.color, c => c >>> 24), [128, 128, 128, 128]);
});
test('DrawIR inverse sprite transforms and atlas regions preserve exact source cells', () => {
  const s = scene([{ op: 'sprite', asset: 'atlas', origin: [2, 0, 0], axisX: [-1, 0], region: { x: 1, y: 0, w: 2, h: 2 }, material: { color: 0xffffffff } }]);
  s.assets = [{ id: 'atlas', revision: 'r1', width: 3, height: 2, color: [0, 0xff0000ff, 0xff00ff00, 0, 0xffff0000, 0xffffffff] }];
  assert.deepEqual([...renderDrawSceneCPU(s).color], [0xff00ff00, 0xff0000ff, 0xffffffff, 0xffff0000]);
  assert.deepEqual(parseDrawScene(serializeDrawScene(s)), s);
});
test('DrawIR alpha budget and malformed geometry fail before dispatch instead of dropping fragments', () => {
  assert.throws(() => compileDrawScene(scene(Array.from({ length: 65 }, () => rect(0, { color: 0xffffffff })))), /budget/);
  assert.doesNotThrow(() => compileDrawScene(scene(Array.from({ length: 80 }, () => rect(0, { color: 0xffffffff, blend: 'cutout' })))));
  assert.throws(() => compileDrawScene(scene([{ op: 'mesh', vertices: [[0, 0, 0]], indices: [0, 1, 2], material: { color: 0xffffffff } }])), /index/);
});
test('2D opt-in surface emission occludes independently from legacy optical light, including late HDR enable', () => {
  const f = createFrame(1, 1), p = new Painter(f);
  p.surface(0, 0, 0xff0000ff, 1, 0xff0000ff, 2); p.light(0, 0, 0xffff0000);
  addLinearLight2D(f, 0, 0, .25, 0);
  near(f.hdrLight[0], 2); near(f.hdrLight[1], .25); near(f.hdrLight[2], 1);
  p.px(0, 0, 0xff000000); near(f.hdrLight[0], 0); near(f.hdrLight[1], .25); near(f.hdrLight[2], 1);
  clearFrame(f); p.px(0, 0, 0xff000000); assert.ok(f.hdrLight.every(n => n === 0)); assert.equal(f.light[0], 0);
});
test('3D diagnostics report allocated arena, live depth, overlap and explicit budget failure', () => {
  const f = clearFrame3D(createFrame3D(1, 1), 0), s = surfacesFor3D(f); configureSurfaceBudget3D(f, { maxFragments: 2 });
  s.put(0, 1, 0xffffffff, .5, 1); s.put(0, 0, 0xffffffff, .5, 1);
  let d = surfaceDiagnostics3D(f); assert.equal(d.activeFragments, 2); assert.equal(d.maxLayersPerPixel, 2); assert.ok(d.arenaBytes > 0); assert.ok(d.recomposedFragments >= 2);
  assert.throws(() => s.put(0, 2, 0xffffffff, .5, 0), /budget/); d = surfaceDiagnostics3D(f); assert.equal(d.accepted, 2); assert.equal(d.rejected, 1); assert.equal(d.budgetExceeded, true);
  s.put(0, 3, 0xff000000, 1, 0); assert.equal(surfaceDiagnostics3D(f).activeFragments, 0); clearFrame3D(f, 0); assert.equal(surfaceDiagnostics3D(f).submitted, 0);
});
test('3D explicit cutout and additive policies restore normal exact rendering after callbacks', () => {
  const f = clearFrame3D(createFrame3D(17, 11), 0); f.hdrLight = new Float32Array(17 * 11 * 3); const p = new Painter3D(f, { yaw: 0, elevation: 0, zoom: 1 });
  p.withTransparency({ mode: 'cutout', cutoff: .7 }, q => q.point([0, .21, 0], .01, '#fff', .5)); assert.ok(f.color.every(v => v === 0));
  p.withTransparency({ mode: 'additive' }, q => q.point([0, .21, 0], .01, '#f00', 1, 2)); assert.ok(f.color.every(v => v === 0)); assert.ok(f.hdrLight.some(v => v === 2));
  p.point([0, .21, 1], .01, '#000'); assert.ok(f.hdrLight.every(v => v === 0));
});
test('overlapping volume field combines extinction and independent source RGB before integration', () => {
  const bounds = { min: [0, 0, 0], max: [1, 1, 1] };
  const { field } = combineVolumeFields3D([{ bounds, field: () => ({ density: 1, color: '#f00', emission: 2 }) }, { bounds, field: () => ({ density: 3, color: '#00f', emissionRGB: [0, 4, 0] }) }]);
  const s = field(.5, .5, .5); near(s.density, 4); assert.deepEqual(s.emissionRGB, [.5, 3, 0]); assert.equal(field(2, 0, 0), undefined);
  const grid = new VolumeGrid3D(bounds, .5); grid.refill(() => ({ density: 1, color: '#f00', emission: 10, emissionRGB: [0, 2, 0] })); assert.deepEqual(grid.sample(.5, .5, .5).emissionRGB, [0, 2, 0]);
});
test('render profiles round-trip all resolved settings and do not share mutable defaults', () => {
  const a = createRenderProfile3D('frost'), b = createRenderProfile3D('frost'); a.camera.target[1] = 99; a.lights[0].intensity = 0;
  assert.notEqual(b.camera.target[1], 99); assert.ok(b.lights[0].intensity > 0); assert.deepEqual(parseRenderProfile3D(serializeRenderProfile3D(b)), b);
});
test('resident buffers account only changed revisions and aligned dirty uploads', () => {
  const writes = [], destroyed = [];
  // Bookkeeping unit test only; the browser/native harness executes real GPU work separately.
  const device = { limits: { maxStorageBufferBindingSize: 1024 }, queue: { writeBuffer: (buffer, offset, data) => writes.push([offset, data.byteLength]) }, createBuffer: ({ size }) => ({ size, destroy() { destroyed.push(size); } }) };
  const cache = new ResidentGpuBuffers(device, 1024), data = new Uint32Array(8);
  cache.upload('atlas', data, 1); cache.beginFrame(); cache.upload('atlas', data, 1); assert.equal(cache.resources.uploadedBytes, 0); assert.equal(cache.resources.avoidedUploadBytes, 32);
  cache.upload('atlas', data, 2, [{ offset: 4, size: 8 }]); assert.deepEqual(writes, [[0, 32], [4, 8]]); assert.equal(cache.resources.uploadedBytes, 8);
  assert.throws(() => cache.upload('atlas', data, 3, [{ offset: 1, size: 8 }]), /aligned/); cache.dispose(); assert.deepEqual(destroyed, [32]);
});
test('capture sequence bounds live frame storage and waits for encoding backpressure in order', async () => {
  let current = 0, live = 0, high = 0; const order = [];
  const renderer = { render(frame) { current = frame.color[0]; }, async capture() { const index = current; live++; high = Math.max(high, live); await Promise.resolve(); return new Uint8ClampedArray([index, 0, 0, 255]); } };
  const frames = Array.from({ length: 9 }, (_, i) => ({ frame: { w: 1, h: 1, color: new Uint32Array([i]), light: new Uint32Array(1) }, time: i / 60, duration: 1 / 60 }));
  assert.equal(await captureCinematicSequence(renderer, frames, async f => { order.push(f.rgba[0]); live--; }, { inFlight: 3 }), 9);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8]); assert.equal(high, 3);
});
test('profiler keeps CPU submission and GPU timestamp populations distinct', () => {
  const p = new FrameProfiler(2); p.beginFrame(); p.record('encode', 4); p.record('gpu', 7); p.endFrame(); p.beginFrame(); p.record('encode', 6); p.endFrame(); const s = p.snapshot(); assert.equal(s.percentiles.gpu.count, 1); assert.equal(s.percentiles.encode.count, 2); assert.equal(s.latest.gpu, undefined);
});
test('cinematic final palette lock preserves alpha and restricts all visible final RGB', () => {
  const frame = renderDrawSceneCPU(scene([rect(0, { color: 0xff7834d2, opacity: .5, emission: [2, .1, .7] })]));
  const compositor = new CinematicCompositor(), palette = [0xff112233, 0xffbbccdd], plain = compositor.render(frame, new Uint8ClampedArray(16)), locked = compositor.render(frame, new Uint8ClampedArray(16), { finalPalette: palette });
  for (let i = 0; i < 16; i += 4) { assert.equal(locked[i + 3], plain[i + 3]); assert.ok(palette.some(c => (c & 255) === locked[i] && (c >>> 8 & 255) === locked[i + 1] && (c >>> 16 & 255) === locked[i + 2])); }
  assert.throws(() => compositor.render(frame, new Uint8ClampedArray(16), { finalPalette: [] }), /palette/);
});
