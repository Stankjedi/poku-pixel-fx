import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSequenceSpec, createSequenceEffect, resolveSequence, sequenceCueSeed } from '../build/authoring/sequence.js';
import { createProject, parseProject, serializeProject } from '../build/authoring/project.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { createFrame, createFx, clearFrame } from '../build/core/fx.js';
import { defineImpactContact2D } from '../build/core/impact-contact.js';
import { renderProject } from '../build-tools/tools/lib/project-render.mjs';
import { resolveAssetEvents } from '../build/render/export.js';

const source = {
  meta: { size: [8, 8], origin: [4, 4], duration: .5, loop: true, options: { seed: 1 } },
  create(options) {
    let ticks = 0;
    return {
      update() { ticks++; },
      draw(p) { p.px(ticks % 3, -1, (0xff000000 | (Number(options.seed) & 0xffffff)) >>> 0); },
    };
  },
  contacts: () => [defineImpactContact2D({ id: 'hit', at: .25, position: [2, 0], normal: [1, 0], material: 'metal' })],
  socketsAt: () => ({ grip: { x: 6, y: 4, basisX: [1, 0], basisY: [0, 1], visible: true } }),
  events: [{ id: 'strike', at: .25, kind: 'contact', socket: 'grip', payload: { material: 'metal' } }],
};
const catalog = { kind: 'catalog', id: 'test/source' };
const loader = async () => source;
function raster(mod, time, options = {}) {
  const frame = createFrame(...mod.meta.size), fx = createFx(mod, { seed: 9, x: mod.meta.origin[0], y: mod.meta.origin[1], ...options });
  fx.update(time); fx.draw(frame);
  return frame;
}

test('portable sequences reject ambiguous ids and invalid windows without executing source code', () => {
  for (const value of [
    { cues: [{ id: 'one', source: catalog, at: -1 }] },
    { cues: [{ id: 'one', source: catalog, duration: 0 }] },
    { cues: [{ id: 'one', source: catalog }, { id: 'one', source: catalog }] },
    { cues: [{ id: 'one', source: { kind: 'catalog', id: '../escape' } }] },
    { cues: [{ id: 'one', source: { kind: 'sequence', sequence: {} } }] },
    { cues: [{ id: 'one', source: catalog, seed: 1.5 }] },
    { cues: [{ id: 'one', source: catalog, enabled: 'yes' }] },
    { size: [128, 128] }, { duration: Infinity },
  ]) assert.throws(() => createSequenceSpec(value));
  const sequence = createSequenceSpec({ cues: [{ id: 'main', source: catalog, options: { x: 2, seed: 0, light: .7 } }] });
  assert.equal(sequence.cues[0].x, 2); assert.equal(sequence.cues[0].seed, 0);
  assert.deepEqual(sequence.cues[0].options, { light: .7 });
  assert.deepEqual(resolveSequence(sequence), sequence);
  const project = createProject({ id: 'test/sequence', kind: 'sequence', sequence, exportSettings: { extrude: 2 } });
  assert.deepEqual(parseProject(serializeProject(project)), project);
});

test('cue reordering and a hidden sibling preserve each cue seed and rendered pixels', async () => {
  const a = { id: 'left', source: catalog, x: -10 }, b = { id: 'right', source: catalog, x: 10 };
  const canvas = { size: [40, 20], origin: [20, 10], duration: .5 };
  const first = await createSequenceEffect(createSequenceSpec({ ...canvas, cues: [a, b] }), loader);
  const reordered = await createSequenceEffect(createSequenceSpec({ ...canvas, cues: [b, a] }), loader);
  assert.deepEqual(raster(first, .2).color, raster(reordered, .2).color);
  assert.notEqual(sequenceCueSeed(9, 'left'), sequenceCueSeed(9, 'right'));
  const onlyA = await createSequenceEffect(createSequenceSpec({ ...canvas, cues: [a] }), loader);
  assert.deepEqual(raster(first, .2, { layers: { right: false } }).color, raster(onlyA, .2).color);
});

test('fractional cue starts retain the complete fixed-tick simulation regardless of host frame partitions', async () => {
  const spec = createSequenceSpec({ duration: 2, cues: [{ id: 'continuous', source: catalog, at: .137, duration: 1.6 }] });
  const mod = await createSequenceEffect(spec, loader), options = { seed: 11, x: mod.meta.origin[0], y: mod.meta.origin[1] };
  const direct = createFx(mod, options), partitioned = createFx(mod, options);
  direct.update(1.01);
  for (const dt of [.1, .04, .251, .4, .219]) partitioned.update(dt);
  const a = createFrame(...mod.meta.size), b = createFrame(...mod.meta.size);
  direct.draw(a); partitioned.draw(b);
  assert(a.color.some(Boolean)); assert.deepEqual(a.color, b.color);
  direct.draw(clearFrame(a)); assert.deepEqual(a.color, b.color, 'drawing cannot advance the cue simulation');
});

test('sequence loops reset their children and backward Studio seeks replay the same state', async () => {
  const spec = createSequenceSpec({ duration: 1.5, loop: true, cues: [{ id: 'continuous', source: catalog, at: .1, duration: 1.1 }] });
  const mod = await createSequenceEffect(spec, loader);
  assert.deepEqual(raster(mod, .42).color, raster(mod, 3.42).color);
  const project = createProject({ id: 'test/sequence', kind: 'sequence', sequence: spec, seed: 9, bg: 'none' });
  const runtime = await createProjectRuntime(project, mod);
  runtime.render(3.42, 103, false);
  const after = runtime.render(.42, 13, false).frame.color.slice();
  const fresh = await createProjectRuntime(project, mod);
  assert.deepEqual(after, fresh.render(.42, 13, false).frame.color);
  assert.equal(runtime.seekStats.mode, 'replay'); runtime.dispose(); fresh.dispose();
});

test('decimal loop boundaries share the first frame, socket and camera clock', async () => {
  const decimal = { ...source, meta: { ...source.meta, duration: .8 },
    socketsAt: time => ({ root: { x: 4 + time, y: 4 } }), cameraShake: time => [time, 0] };
  const spec = createSequenceSpec({ duration: .8, loop: true, cues: [{ id: 'decimal', source: catalog }] });
  const mod = await createSequenceEffect(spec, async () => decimal);
  assert(raster(mod, 0).color.some(Boolean));
  assert.deepEqual(raster(mod, 2.4).color, raster(mod, 0).color);
  assert.deepEqual(mod.socketsAt(2.4), mod.socketsAt(0));
  assert.deepEqual(mod.cameraShake(2.4, {}), [0, 0]);
  const parent = await createSequenceEffect(createSequenceSpec({ duration: 4, cues: [{ id: 'child', source: catalog, duration: 3.2 }] }), async () => decimal);
  assert.equal(parent.socketsAt(2.4)['child/root'].x, parent.socketsAt(0)['child/root'].x);
  assert.deepEqual(parent.cameraShake(2.4, {}), [0, 0]);
});

test('pure effect child geometry and camera phase restart at decimal boundaries without resetting fixed ticks', async () => {
  let ticks = 0;
  const decimal = { meta: { size: [4, 4], origin: [2, 2], duration: .8, loop: true },
    update() { ticks++; }, draw(p, time) { p.px(time === 0 ? 0 : 1, 0, 0xffffffff); }, cameraShake: time => [time === 0 ? 0 : 1, 0],
    socketsAt: time => ({ root: { x: time === 0 ? 2 : 3, y: 2 } }) };
  const direct = createFx(decimal); direct.update(2.4);
  assert.equal(direct.tick, 288); assert.equal(ticks, 288); assert.deepEqual(direct.shake, [0, 0]);
  assert.deepEqual(raster(decimal, 2.4).color, raster(decimal, 0).color);
  assert.notDeepEqual(raster(decimal, 2.4 - 1e-8).color, raster(decimal, 0).color, 'real pre-boundary time must not be snapped');
  const parent = await createSequenceEffect(createSequenceSpec({ duration: 4, cues: [{ id: 'child', source: catalog, duration: 3.2 }] }), async () => decimal);
  assert.deepEqual(raster(parent, 2.4).color, raster(parent, 0).color);
  assert.deepEqual(parent.socketsAt(2.4), parent.socketsAt(0));
});

test('fades control color coverage and visibility at cue window boundaries', async () => {
  const opaque = { meta: { size: [4, 4], origin: [2, 2], duration: 1 }, draw(p) { p.px(0, 0, 0xffffffff); } };
  const mod = await createSequenceEffect(createSequenceSpec({ duration: 1.5, cues: [{ id: 'fade', source: catalog, at: .25, fadeIn: .2, fadeOut: .2 }] }), async () => opaque);
  assert(raster(mod, .25).color.every(c => c === 0));
  assert.equal(Math.max(...raster(mod, .35).color.map(c => c >>> 24)), 128);
  assert.equal(Math.max(...raster(mod, .75).color.map(c => c >>> 24)), 255);
  assert.equal(Math.max(...raster(mod, 1.15).color.map(c => c >>> 24)), 128);
  assert(raster(mod, 1.25).color.every(c => c === 0));
});

test('auto canvas fitting includes rotated asymmetric origins and preserves fixed canvases', async () => {
  const asymmetric = { meta: { size: [8, 4], origin: [2, 3], duration: 1 }, draw(p) { p.rect(-2, -3, 8, 4, 0xffffffff); } };
  const mod = await createSequenceEffect(createSequenceSpec({ cues: [{ id: 'rotated', source: catalog, x: 10, y: 5, angle: Math.PI / 2 }] }), async () => asymmetric);
  assert.deepEqual(mod.meta.size, [4, 8]); assert.deepEqual(mod.meta.origin, [-9, -3]);
  assert(raster(mod, .2).color.every(c => c >>> 24));
  const fixed = await createSequenceEffect(createSequenceSpec({ size: [20, 20], origin: [10, 10], cues: [{ id: 'offscreen', source: catalog, x: 20_000 }] }), loader);
  assert.deepEqual(fixed.meta.size, [20, 20]); assert.deepEqual(fixed.meta.origin, [10, 10]);
  await assert.rejects(createSequenceEffect(createSequenceSpec({ cues: [{ id: 'a', source: catalog, x: -20_000 }, { id: 'b', source: catalog, x: 20_000 }] }), loader), /canvas exceeds/);
});

test('contacts, repeated events and sockets retain cue time, transforms, namespaces and visibility', async () => {
  const spec = createSequenceSpec({ duration: 1.4, size: [32, 32], origin: [10, 12], cues: [
    { id: 'spark', source: catalog, at: .125, duration: 1.2, x: 3, y: -2, flip: true, angle: Math.PI / 2 },
  ] });
  const mod = await createSequenceEffect(spec, loader);
  const contacts = mod.contacts({ seed: 9 });
  assert.deepEqual(contacts.map(c => c.at), [.375, .875]);
  assert(contacts.every(c => c.id === 'spark/hit'));
  assert(Math.abs(contacts[0].position[0] - 3) < 1e-9); assert.equal(contacts[0].position[1], -4);
  assert(Math.abs(contacts[0].normal[0]) < 1e-9); assert.equal(contacts[0].normal[1], -1);
  const events = mod.eventsFor({ seed: 9 });
  assert.deepEqual(events.map(e => e.sourceTime), [.375, .875]);
  assert.equal(events[0].socket, 'spark/grip'); assert.deepEqual(events[0].payload, { material: 'metal' });
  const socket = mod.socketsAt(.4)['spark/grip']; assert.equal(socket.x, 13); assert.equal(socket.y, 8);
  assert.equal(mod.socketsAt(1.325)['spark/grip'], undefined);
  assert.deepEqual(mod.contacts({ layers: { spark: false } }), []);
  assert.deepEqual(mod.eventsFor({ layers: { spark: false } }), []);
  const frames = Array.from({ length: 15 }, (_, i) => ({ time: i / 10, duration: 100 }));
  assert.deepEqual(resolveAssetEvents(events, frames).map(e => e.timeMs), [400, 900]);
  const project = createProject({ id: 'test/sequence', kind: 'sequence', sequence: spec, layers: { spark: false } });
  const runtime = await createProjectRuntime(project, mod);
  assert.deepEqual(runtime.events, []); assert.deepEqual(runtime.contacts, []); runtime.dispose();
});

test('a looping sequence does not duplicate the terminal event at its cycle boundary', async () => {
  const terminal = { ...source, meta: { ...source.meta, duration: 1, loop: false }, events: [{ id: 'start', at: 0 }, { id: 'end', at: 1 }] };
  const spec = createSequenceSpec({ duration: 1, loop: true, cues: [{ id: 'cue', source: catalog }] });
  const mod = await createSequenceEffect(spec, async () => terminal);
  assert.deepEqual(mod.events.map(e => e.id), ['cue/start']);
});

test('Studio and CLI render the same stored sequence and export the same metadata', async () => {
  const input = JSON.parse(readFileSync(new URL('../examples/projects/charged-impact.poku-project.json', import.meta.url), 'utf8'));
  const project = createProject({ ...input, fps: 10, seconds: .6, bg: 'none', margin: 2,
    renderProfile: { mode: 'cinematic', cinematic: { bloom: false, toneMap: 'none', exposure: 1 } } });
  const runtime = await createProjectRuntime(project), { sequence, fx } = await renderProject(project, { layers: true });
  assert.equal(runtime.frameCount, sequence.n); assert.equal(runtime.width, sequence.w); assert.equal(runtime.height, sequence.h);
  assert.deepEqual(runtime.contacts, sequence.contacts); assert.deepEqual(runtime.events, fx.mod.events);
  let i = 0;
  for (const frame of sequence.frames) {
    const sample = runtime.render(i / project.fps, i, false);
    assert.deepEqual(sample.rgba, frame.color, `frame ${i}`); assert.deepEqual(sample.sockets, frame.sockets);
    i++;
  }
  assert.equal(runtime.tryUpdateProject({ ...project, exportSettings: { padding: 2, extrude: 2 } }), true);
  runtime.dispose();
});
