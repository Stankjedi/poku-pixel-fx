import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationPlan2D as plan, createGeneratedEffect2D as candidate} from '../build/authoring/generation.js';
import {createHash} from 'node:crypto';
import {prepareGenerationPreview} from '../build-tools/tools/lib/generation-preview.mjs';
import {createFrame, enableHDRLight, Painter} from '../build/core/index.js';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {readFileSync} from 'node:fs';

const selection = {fireSparks: 'short-exposure', fireSparkFinish: 'scintillation'};
function render(effect, t, options = {}, pad = 0) {
  const frame = enableHDRLight(createFrame(effect.meta.size[0] + pad * 2, effect.meta.size[1] + pad * 2));
  const instance = effect.create({...effect.meta.options, ...options});
  const p = new Painter(frame).place(effect.meta.origin[0] + pad, effect.meta.origin[1] + pad);
  instance.drawBack(p, t); instance.draw(p, t); return frame;
}
test('omitted selection preserves pre-extension default native channel snapshots', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/generation-burst-spark-baseline.json', import.meta.url)));
  const hash = a => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
  for (const row of baseline.rows) {
    const effect = candidate(plan({material: row.material, action: row.action, seed: row.seed})), f = render(effect, row.time);
    for (const key of ['color', 'light', 'hdrLight']) assert.equal(hash(f[key]), row[key]);
  }
});
test('explicit burst keeps body, residue, timing and all non-spark channels unchanged when sparks hidden', () => {
  for (const seed of [0, 17, 61, 4294967295]) {
    const p = plan({material: 'fire', action: 'burst', seed}), a = candidate(p), b = candidate(p, selection);
    assert.deepEqual(a.meta, b.meta); assert.deepEqual(a.events, b.events);
    for (const t of [.1, .2199, .22, .3, .425, .625, .85, 1.1, 1.47]) {
      assert.deepEqual(render(a, t, {layers: {sparks: false}}), render(b, t, {layers: {sparks: false}}));
      if (t <= p.timing.release) assert.deepEqual(render(a, t), render(b, t));
    }
  }
});
test('explicit burst count zero, spark-only light zero, palette and layer controls stay meaningful', () => {
  const p = plan({material: 'fire', action: 'burst', seed: 17});
  const no = candidate(p, {...selection, fireSparkCount: 0}), some = candidate(p, selection);
  for (const t of [.3, .425, .625, .85]) {
    assert.deepEqual(render(no, t), render(some, t, {layers: {sparks: false}}));
    const dark = render(some, t, {layers: {light: false}});
    assert(!dark.light.some(Boolean)); assert(!dark.hdrLight.some(Boolean));
    const a = render(some, t), b = render(candidate(p, {...selection, fireSparkLight: 0}), t);
    assert.deepEqual(a.color, b.color);
    assert.deepEqual(render(some, t, {layers: {response: false}}), render(no, t, {layers: {response: false}}));
  }
  assert.notDeepEqual(render(some, .625).color, render(some, .625, {palette: ['#121a38', '#3258af', '#90caff', '#edfaff']}).color);
});
test('unsupported non-fire modes still reject the option', () => {
  for (const intent of [{material: 'energy', action: 'burst'},
    {material: 'water', action: 'pour'}, {material: 'ice', action: 'shatter'}, {material: 'lightning', action: 'strike'}])
    assert.throws(() => candidate(plan(intent), selection));
  const p = plan({material: 'fire', action: 'burst'});
  for (const fireSparkCount of [-1, .5, 721, NaN]) assert.throws(() => candidate(p, {...selection, fireSparkCount}));
  for (const fireSparkLight of [-1, 2.1, NaN]) assert.throws(() => candidate(p, {...selection, fireSparkLight}));
});
test('all declared endpoints are empty; reverse seeks and padded full channel bounds hold', () => {
  for (const seed of [0, 17, 61, 4294967295]) {
    const effect = candidate(plan({material: 'fire', action: 'burst', seed}), selection);
    for (const t of [0, effect.meta.duration, effect.meta.duration + 1]) {
      const f = render(effect, t); assert(!f.color.some(Boolean)); assert(!f.light.some(Boolean)); assert(!f.hdrLight.some(Boolean));
    }
    const instance = effect.create(effect.meta.options);
    const draw = time => {const f = enableHDRLight(createFrame(...effect.meta.size)), p = new Painter(f).place(...effect.meta.origin); instance.drawBack(p, time); instance.draw(p, time); return f;};
    const expected = draw(.625); for (const t of [1.1, .12, .8, .3]) draw(t); assert.deepEqual(draw(.625), expected);
    const pad = 48, [w, h] = effect.meta.size;
    for (const t of [.25, .425, .625, .85, 1.1]) {
      const f = render(effect, t, {}, pad);
      for (let y = 0; y < h + pad * 2; y++) for (let x = 0; x < w + pad * 2; x++) if (x < pad || y < pad || x >= pad + w || y >= pad + h) {
        const i = y * (w + pad * 2) + x; assert.equal(f.color[i], 0); assert.equal(f.light[i], 0);
        assert.equal(f.hdrLight[i * 3], 0); assert.equal(f.hdrLight[i * 3 + 1], 0); assert.equal(f.hdrLight[i * 3 + 2], 0);
      }
    }
  }
});
test('CLI preview builder selected project reopens with exactly serialized source controls', async () => {
  const p = JSON.parse(JSON.stringify(prepareGenerationPreview({material:'fire', action:'burst'}, [17], selection)[0].project));
  assert.deepEqual(p.sequence.cues[0].source.renderOptions, selection);
  const runtime = await createProjectRuntime(p);
  try { assert.equal(runtime.frameCount, 60); assert(Math.abs(runtime.duration - 1.47) < 1e-12); assert(runtime.render(.625, 25, false).frame.color.some(Boolean)); }
  finally { runtime.dispose(); }
});
