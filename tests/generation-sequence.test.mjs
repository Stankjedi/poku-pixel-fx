import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSequenceSpec, createSequenceEffect, resolveSequence, sequenceCueSeed } from '../build/authoring/sequence.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
import { createProject, parseProject, serializeProject } from '../build/authoring/project.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { createFrame, createFx } from '../build/core/fx.js';
import { enableHDRLight } from '../build/render/hdr.js';
import { renderProject } from '../build-tools/tools/lib/project-render.mjs';

const gen = (material, action, renderOptions) => ({ kind: 'generation', intent: { material, action }, ...(renderOptions ? { renderOptions } : {}) });
const only = source => ({ cues: [{ id: 'main', source }] });
const examples = ['generated-energy-fracture', 'generated-storm-fire'];
const readExample = name => parseProject(readFileSync(new URL(`../examples/projects/${name}.poku-project.json`, import.meta.url), 'utf8'));
function raster(mod, time, options = {}) {
  const frame = enableHDRLight(createFrame(...mod.meta.size));
  const fx = createFx(mod, { seed: 17, x: mod.meta.origin[0], y: mod.meta.origin[1], ...options });
  fx.update(time); fx.draw(frame, 'back'); fx.draw(frame, 'front');
  return frame;
}
const hash = data => createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
function equalBuffers(actual, expected) {
  for (const key of ['color', 'light', 'hdrLight']) assert.deepEqual(actual[key], expected[key], key);
}

test('generation sources are canonical JSON, detached from caller edits and own no seed', () => {
  const input = only(gen('energy', 'dash', { composition: 'material-volumes' }));
  const resolved = createSequenceSpec(input);
  assert.deepEqual(resolved.cues[0].source, { kind: 'generation', intent: { material: 'energy', action: 'dash', response: 'dissipate', distance: 128, travel: .74 }, renderOptions: { composition: 'material-volumes' } });
  input.cues[0].source.intent.material = 'fire'; input.cues[0].source.renderOptions.composition = 'body';
  assert.equal(resolved.cues[0].source.intent.material, 'energy');
  assert.equal(resolved.cues[0].source.renderOptions.composition, 'material-volumes');
  assert.deepEqual(resolveSequence(JSON.parse(JSON.stringify(resolved))), resolved);
  const project = createProject({ id: 'test/generation-sequence', kind: 'sequence', sequence: resolved, actor: false });
  assert.deepEqual(parseProject(serializeProject(project)), project);
});

test('generation source rejects unknown fields, competing seeds, unsupported material/action and artwork combinations', () => {
  for (const source of [
    { ...gen('fire', 'plume'), src: 'https://example.invalid/code.js' },
    { ...gen('fire', 'plume'), plan: {} },
    { ...gen('fire', 'plume'), intent: { material: 'fire', action: 'plume', seed: 1 } },
    { ...gen('fire', 'plume'), intent: { material: 'fire', action: 'plume', count: 100 } },
    gen('water', 'dash'), gen('ice', 'burst'), gen('lightning', 'plume'), gen('energy', 'pour'),
    { kind: 'generation', intent: null },
    gen('fire', 'plume', { composition: 'unknown' }), gen('fire', 'burst', { composition: 'material-volumes' }),
    gen('ice', 'shatter', { composition: 'volumes' }), gen('water', 'pour', { iceSurface: 'crystal' }),
    gen('energy', 'dash', { count: 999 }), gen('energy', 'dash', []),
    { ...gen('energy', 'dash'), intent: { material: 'energy', action: 'dash', travel: Infinity } },
    { ...gen('energy', 'dash'), intent: { material: 'energy', action: 'dash', distance: 200 } },
  ]) assert.throws(() => createSequenceSpec(only(source)), undefined, JSON.stringify(source));
  assert.throws(() => createSequenceSpec(only({ ...gen('fire', 'plume'), renderOptions: null })));
});

test('every material uses the existing generator exactly, including transformed color and both light buffers', async () => {
  for (const [material, action, renderOptions] of [
    ['fire', 'plume'], ['energy', 'dash'], ['ice', 'shatter'], ['water', 'pour'], ['lightning', 'strike'],
    ['fire', 'plume', { composition: 'material-volumes' }], ['energy', 'dash', { composition: 'material-volumes' }],
    ['ice', 'shatter', { iceSurface: 'crystal' }],
  ]) {
    const source = gen(material, action, renderOptions), original = createGeneratedEffect2D(createGenerationPlan2D(source.intent), renderOptions);
    const placement = { x: 8, y: -3, flip: true, angle: .13 };
    const mod = await createSequenceEffect(createSequenceSpec({ size: [...original.meta.size], origin: [...original.meta.origin], cues: [{ id: 'main', source, ...placement }] }), () => { throw new Error('Generated source must not load catalog'); });
    for (const time of [material === 'lightning' ? .24 : .42, material === 'water' ? 1.4 : .8]) {
      const actual = raster(mod, time);
      const expected = raster(original, time, { seed: sequenceCueSeed(17, 'main'), ...placement, x: original.meta.origin[0] + placement.x, y: original.meta.origin[1] + placement.y });
      equalBuffers(actual, expected);
    }
  }
});

test('omitted artwork retains legacy body semantics; material-volumes is explicit and visibly different', async () => {
  for (const material of ['fire', 'energy']) {
    const legacy = await createSequenceEffect(createSequenceSpec(only(gen(material, 'plume'))));
    const body = await createSequenceEffect(createSequenceSpec(only(gen(material, 'plume', { composition: 'body' }))));
    const volumes = await createSequenceEffect(createSequenceSpec(only(gen(material, 'plume', { composition: 'material-volumes' }))));
    equalBuffers(raster(legacy, .9), raster(body, .9));
    assert.notEqual(hash(raster(legacy, .9).color), hash(raster(volumes, .9).color));
  }
});

test('explicit cue seed, including zero, wins; parent seed affects only unspecified cue seeds', async () => {
  const source = gen('lightning', 'strike');
  for (const seed of [0, 83, 0xffffffff]) {
    const mod = await createSequenceEffect(createSequenceSpec({ cues: [{ id: 'strike', source, seed, options: { seed: 999 } }] }));
    equalBuffers(raster(mod, .24, { seed: 1 }), raster(mod, .24, { seed: 20 }));
    const original = createGeneratedEffect2D(createGenerationPlan2D(source.intent));
    equalBuffers(raster(mod, .24), raster(original, .24, { seed }));
  }
  const derived = await createSequenceEffect(createSequenceSpec({ cues: [{ id: 'strike', source }] }));
  assert.notEqual(hash(raster(derived, .24, { seed: 1 }).color), hash(raster(derived, .24, { seed: 20 }).color));
});

test('generation events keep source-local payloads and existing sequence time/id/visibility contracts', async () => {
  const spec = createSequenceSpec({ cues: [{ id: 'strike', source: gen('lightning', 'strike'), at: .1, x: 37, y: -12, angle: Math.PI / 2, flip: true }] });
  const mod = await createSequenceEffect(spec);
  const event = mod.events.find(e => e.id === 'strike/arrival');
  assert.equal(event.cue, 'strike'); assert.equal(event.cueSourceTime, .23); assert.equal(event.sourceTime, .33); assert.equal(event.at, .33);
  assert.deepEqual(event.payload, { x: 0, y: 0, material: 'lightning' }, 'payload is not silently transformed into scene coordinates');
  assert.deepEqual(mod.eventsFor({ layers: { strike: false } }), []);
  assert.deepEqual(mod.contacts({}), [], 'generation source events are not invented collision contacts');
});

test('cue order and hidden siblings preserve generated seed identity and pixel output', async () => {
  const canvas = { size: [320, 240], origin: [160, 200] }, a = { id: 'left', source: gen('lightning', 'strike'), x: -80 }, b = { id: 'right', source: gen('lightning', 'strike'), x: 80 };
  const both = await createSequenceEffect(createSequenceSpec({ ...canvas, cues: [a, b] }));
  const reversed = await createSequenceEffect(createSequenceSpec({ ...canvas, cues: [b, a] }));
  const solo = await createSequenceEffect(createSequenceSpec({ ...canvas, cues: [a] }));
  for (const seed of [0, 17, 91]) {
    equalBuffers(raster(both, .24, { seed }), raster(reversed, .24, { seed }));
    equalBuffers(raster(both, .24, { seed, layers: { right: false } }), raster(solo, .24, { seed }));
  }
});

test('generated cues reuse existing color/emission fade and source layer options without a separate gain system', async () => {
  const source = gen('fire', 'plume', { composition: 'material-volumes' });
  const cue = { id: 'plume', source, at: .137, fadeIn: .8, fadeOut: .3, options: { layers: { sparks: false } } };
  const generated = await createSequenceEffect(createSequenceSpec({ cues: [cue] }));
  const original = createGeneratedEffect2D(createGenerationPlan2D(source.intent), source.renderOptions);
  const manual = await createSequenceEffect(createSequenceSpec({ cues: [{ ...cue, source: { kind: 'catalog', id: 'test/manual' } }] }), async () => original);
  for (const time of [.137, .537, 1.01, generated.meta.duration - .15, generated.meta.duration]) equalBuffers(raster(generated, time), raster(manual, time));
  const unfiltered = await createSequenceEffect(createSequenceSpec({ cues: [{ ...cue, fadeIn: 0, options: {} }] }));
  assert.notEqual(hash(raster(generated, .537).color), hash(raster(unfiltered, .537).color));
  const lit = raster(generated, .537); assert(lit.hdrLight.some(v => v > 0));
  const noLight = await createSequenceEffect(createSequenceSpec({ cues: [{ ...cue, options: { layers: { light: false } } }] }));
  const dark = raster(noLight, .537); assert(dark.color.some(Boolean)); assert(dark.light.every(v => v === 0)); assert(dark.hdrLight.every(v => v === 0));
});

test('multi-material examples preserve direct-time results through reverse seeks and finish empty', async () => {
  for (const name of examples) {
    const project = readExample(name), runtime = await createProjectRuntime({ ...project, bg: 'none' });
    assert.equal(runtime.seekStats.mode, 'replay');
    for (const time of [1.35, .7, 1.1, .24, runtime.duration, .9]) {
      const actual = runtime.render(time, undefined, false);
      const fresh = await createProjectRuntime({ ...project, bg: 'none' });
      const expected = fresh.render(time, undefined, false);
      equalBuffers(actual.frame, expected.frame); assert.deepEqual(actual.rgba, expected.rgba); fresh.dispose();
    }
    const last = runtime.render(runtime.duration, undefined, false);
    assert(last.frame.color.every(v => v === 0)); assert(last.frame.light.every(v => v === 0)); assert(last.frame.hdrLight.every(v => v === 0)); assert(last.rgba.every(v => v === 0));
    assert(runtime.events.some(event => event.cue === project.sequence.cues[0].id));
    runtime.dispose();
  }
});

test('authored multi-material project CLI helper and authoring runtime agree at native frames', async () => {
  for (const name of examples) {
    const project = { ...readExample(name), fps: 12 }, prepared = await renderProject(project, { diagnostics: true });
    const runtime = await createProjectRuntime(project);
    let count = 0;
    for (const frame of prepared.sequence.frames) {
      if ([0, 3, 7, 12, prepared.sequence.n - 1].includes(count)) {
        const sample = runtime.render(frame.t, count, false);
        assert.deepEqual(frame.raw, sample.frame.color); assert.deepEqual(frame.light, sample.frame.light); assert.deepEqual(frame.color, sample.rgba);
      }
      count++;
    }
    assert.equal(count, prepared.sequence.n); runtime.dispose();
  }
});

test('native multi-material buffers retain snapshots made by unchanged baseline generator/catalog wrappers', async () => {
  const snapshots = JSON.parse(readFileSync(new URL('./fixtures/generation-sequence-snapshots.json', import.meta.url), 'utf8'));
  assert.equal(snapshots.base, '07347ed156a513ff0d822158ad92cdec8c54dfe2');
  for (const name of examples) {
    const runtime = await createProjectRuntime(readExample(name));
    for (const expected of snapshots.cases.filter(sample => sample.name === name)) {
      const sample = runtime.render(expected.time, undefined, false);
      for (const key of ['color', 'light', 'hdrLight']) assert.equal(hash(sample.frame[key]), expected[key], `${name} ${expected.time} ${key}`);
      assert.equal(hash(sample.rgba), expected.rgba, `${name} ${expected.time} rgba`);
    }
    runtime.dispose();
  }
});

test('a stored timing/layout/internal-layer edit changes only the explicitly selected controls', async () => {
  const project = readExample('generated-energy-fracture');
  const runtime = await createProjectRuntime(project);
  const edited = structuredClone(project);
  edited.sequence.size = [runtime.width, runtime.height]; edited.sequence.origin = [...runtime.origin];
  edited.sequence.cues[1].at += .3; edited.sequence.cues[1].x += 36;
  edited.sequence.cues[0].options = { layers: { trail: false, sparks: false } };
  const changed = await createProjectRuntime(parseProject(serializeProject(edited)));
  assert.equal(runtime.events.find(e => e.id === 'crystal/shatter').sourceTime, 1.02);
  assert(Math.abs(changed.events.find(e => e.id === 'crystal/shatter').sourceTime - 1.32) < 1e-12);
  assert.deepEqual(changed.events.find(e => e.id === 'crystal/shatter').payload, runtime.events.find(e => e.id === 'crystal/shatter').payload);
  assert.notEqual(hash(runtime.render(1.12).frame.color), hash(changed.render(1.12).frame.color));
  // Hiding the entire crystal does not remove or reseed the remaining pulse cue.
  const hidden = await createProjectRuntime({ ...project, layers: { crystal: false } });
  const solo = structuredClone(project); solo.sequence.cues = [solo.sequence.cues[0]];
  solo.sequence.size = [runtime.width, runtime.height]; solo.sequence.origin = [...runtime.origin];
  const pulse = await createProjectRuntime(solo);
  equalBuffers(hidden.render(.9).frame, pulse.render(.9).frame);
  assert(hidden.events.every(e => e.cue !== 'crystal'));
  runtime.dispose(); changed.dispose(); hidden.dispose(); pulse.dispose();
});
