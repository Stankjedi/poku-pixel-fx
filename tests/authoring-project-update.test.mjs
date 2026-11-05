import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../build/authoring/project.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { checkpointFountain } from '../build/examples/checkpoint-simulation.js';

test('invalid finishing inputs cannot replace a working Studio runtime or destroy its checkpoints/cache', async () => {
  const project = createProject({ id: 'examples/checkpoint-fountain', seed: 17, bg: 'none' });
  const runtime = await createProjectRuntime(project, checkpointFountain);
  runtime.render(2, 60); const stable = runtime.project, stats = runtime.seekStats, bytes = runtime.cache.bytes;
  for (const patch of [
    { pixelStyle: { surfaceColors: 'indexed', palette: [0xff000000, 0xffffffff], quantization: 'ordered', colorDitherStrength: 2 } },
    { pixelStyle: { surfaceColors: 'indexed', palette: [0xff000000, 0xff000000] } },
    { pixelStyle: { dither: { anchor: 'object', pattern: 'invalid' } } },
    { exportSettings: { padding: 1, extrude: 2 } },
  ]) {
    assert.throws(() => runtime.tryUpdateProject({ ...project, ...patch }));
    assert.equal(runtime.project, stable); assert.deepEqual(runtime.seekStats, stats); assert.equal(runtime.cache.bytes, bytes);
  }
  assert(runtime.render(2, 60).cached); runtime.dispose();
});

test('export-only settings retain rendered cels and simulation state; new visuals invalidate only cels', async () => {
  const project = createProject({ id: 'examples/checkpoint-fountain', seed: 17, bg: 'none' });
  const runtime = await createProjectRuntime(project, checkpointFountain);
  runtime.render(2, 60); const stats = runtime.seekStats;
  assert.equal(runtime.tryUpdateProject({ ...project, exportSettings: { padding: 2, extrude: 1 } }), true);
  assert.deepEqual(runtime.seekStats, stats); assert(runtime.render(2, 60).cached);
  assert.equal(runtime.tryUpdateProject({ ...runtime.project, edits: [{ frame: 60, x: 0, y: 0, color: 0xff112233 }] }), true);
  assert.deepEqual(runtime.seekStats, stats); assert.equal(runtime.cache.bytes, 0); assert.equal(runtime.render(2, 60).frame.color[0], 0xff112233);
  runtime.dispose();
});

test('initial runtime rejects invalid output settings before simulating a frame', async () => {
  const project = createProject({ id: 'examples/checkpoint-fountain', exportSettings: { maxTextureSize: 128, padding: 64 } });
  await assert.rejects(createProjectRuntime(project, checkpointFountain), /Atlas/);
});
