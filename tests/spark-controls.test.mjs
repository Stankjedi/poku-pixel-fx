// Contract/preservation tests only. No visual-quality or playback approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSparkField2D } from '../build/core/spark-field.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
import { createFrame, enableHDRLight, Painter } from '../build/core/index.js';

const source = { seed: 17, count: 80, palette: ['#491923', '#d44220', '#ff9f31', '#fff0ae'],
  start: .2, duration: .6, emissionFrame: (_t, _id, u) => ({ position: [(u - .5) * 10, 0], direction: [0, -1] }) };
function fieldFrame(field, t) {
  const frame = enableHDRLight(createFrame(320, 240)), painter = new Painter(frame).place(160, 170);
  field.draw(painter, t, 'back'); field.draw(painter, t); return frame;
}
function drawCalls(field, t) {
  const matter = [], glow = [], painter = Object.fromEntries(['path', 'dot', 'circle', 'glow'].map(name => [name, (...args) => {
    (name === 'glow' ? glow : matter).push([name, ...args.map(a => typeof a === 'function' ? [a(0), a(.5), a(1)] : a)]);
  }]));
  field.draw(painter, t, 'back'); field.draw(painter, t); return { matter, glow };
}
function generated(action, selection = {}, intent = {}) {
  return createGeneratedEffect2D(createGenerationPlan2D({ material: 'fire', action, seed: 17, ...intent }), selection);
}
function instance(mod, options = {}) {
  const effect = mod.create({ ...mod.meta.options, ...options });
  return t => {
    const frame = enableHDRLight(createFrame(...mod.meta.size)), painter = new Painter(frame).place(...mod.meta.origin);
    effect.drawBack(painter, t); effect.draw(painter, t); return frame;
  };
}
const choice = { fireSparks: 'short-exposure' };

test('core strength default and one preserve the full field shape and exact output', () => {
  const old = createSparkField2D(source), explicit = createSparkField2D({ ...source, lightStrength: 1 });
  assert.deepEqual(Object.keys(explicit), Object.keys(old)); assert.deepEqual(explicit.births, old.births);
  for (const t of [.25, .4, .65, 1, 1.4]) {
    assert.deepEqual(explicit.sample(t), old.sample(t));
    assert.deepEqual(fieldFrame(explicit, t), fieldFrame(old, t));
  }
});

test('core strength changes only glow amplitude, zero skips glow, false overrides strength', () => {
  const old = createSparkField2D(source);
  for (const lightStrength of [0, .25, 1, 2]) {
    const field = createSparkField2D({ ...source, lightStrength });
    assert.deepEqual(field.births, old.births);
    for (const t of [.4, .65, 1]) {
      assert.deepEqual(field.sample(t), old.sample(t));
      const expected = drawCalls(old, t), actual = drawCalls(field, t);
      assert.deepEqual(actual.matter, expected.matter);
      assert.deepEqual(fieldFrame(field, t).color, fieldFrame(old, t).color);
      assert(expected.glow.length > 0);
      assert.equal(actual.glow.length, lightStrength === 0 ? 0 : expected.glow.length);
      for (let i = 0; i < actual.glow.length; i++) {
        assert.deepEqual(actual.glow[i].slice(0, -1), expected.glow[i].slice(0, -1));
        assert.equal(actual.glow[i].at(-1), expected.glow[i].at(-1) * lightStrength);
      }
      if (lightStrength === 0) {
        assert(!fieldFrame(field, t).light.some(Boolean)); assert(!fieldFrame(field, t).hdrLight.some(Boolean));
      }
    }
  }
  const disabled = createSparkField2D({ ...source, lightStrength: 2, light: false });
  assert.deepEqual(disabled.sample(.65), old.sample(.65)); assert.deepEqual(drawCalls(disabled, .65).glow, []);
});

test('core snapshots strength and rejects malformed strength without changing its 2048 limit', () => {
  const options = { ...source, lightStrength: .5 }, field = createSparkField2D(options), before = fieldFrame(field, .65);
  options.lightStrength = 2; assert.deepEqual(fieldFrame(field, .65), before);
  for (const lightStrength of [null, true, false, '', '1', NaN, Infinity, -Infinity, -.001, 2.001])
    assert.throws(() => createSparkField2D({ ...source, lightStrength }), RangeError);
  const max = createSparkField2D({ ...source, count: 2048, lightStrength: 2 });
  assert.equal(max.count, 2048); assert.equal(max.births.length, 2048);
  assert(max.sample(.65).flatMap(p => [p.x, p.y, p.width, p.alpha, ...p.trace.flat()]).every(Number.isFinite));
  assert(drawCalls(max, .65).glow.length <= 16);
});

test('generation explicit legacy count and light one match old selection in every composition', () => {
  for (const action of ['plume', 'dash']) for (const composition of [undefined, 'body', 'volumes', 'material-volumes']) {
    const options = { composition, ...choice }, old = generated(action, options), explicit = generated(action,
      { ...options, fireSparkCount: action === 'plume' ? 360 : 240, fireSparkLight: 1 });
    assert.deepEqual(explicit.meta, old.meta); assert.deepEqual(explicit.events, old.events);
    const a = instance(old), b = instance(explicit);
    for (const t of [0, .6, 1.2, old.meta.duration]) assert.deepEqual(b(t), a(t));
  }
});

test('generation preserves matter under light controls, preserves hidden sparks and honors all-light off', () => {
  for (const action of ['plume', 'dash']) {
    const old = generated(action, { composition: 'material-volumes', ...choice });
    const strong = generated(action, { composition: 'material-volumes', ...choice, fireSparkCount: 720, fireSparkLight: 2 });
    const none = generated(action, { composition: 'material-volumes', ...choice, fireSparkCount: 0, fireSparkLight: 0 });
    const unselected = generated(action, { composition: 'material-volumes' });
    const a = instance(old), light0 = instance(generated(action, { composition: 'material-volumes', ...choice, fireSparkLight: 0 }));
    const light2 = instance(generated(action, { composition: 'material-volumes', ...choice, fireSparkLight: 2 }));
    const hidden = [old, strong, none, unselected].map(m => instance(m, { layers: { sparks: false } }));
    const noSparks = instance(none), noLights = instance(strong, { layers: { light: false } });
    for (const t of [.4, .65, 1.1, 1.8]) {
      assert.deepEqual(light0(t).color, a(t).color); assert.deepEqual(light2(t).color, a(t).color);
      assert.deepEqual(noSparks(t), hidden[0](t));
      for (const draw of hidden.slice(1)) assert.deepEqual(draw(t), hidden[0](t));
      assert(!noLights(t).light.some(Boolean)); assert(!noLights(t).hdrLight.some(Boolean));
    }
    assert.notDeepEqual(light2(.65).hdrLight, light0(.65).hdrLight);
    assert.notDeepEqual(a(.65).color, noSparks(.65).color);
  }
});

test('generation snapshots validated settings before caller mutation', () => {
  const options = { ...choice, fireSparkCount: 80, fireSparkLight: .5 }, mod = generated('dash', options);
  const expected = instance(mod)(.65);
  options.fireSparkCount = 720; options.fireSparkLight = 2; options.fireSparks = 'invalid';
  assert.deepEqual(instance(mod)(.65), expected);
});

test('generation count and light are independent and preserve the omitted companion default', () => {
  for (const action of ['plume', 'dash']) {
    assert.deepEqual(instance(generated(action, { ...choice, fireSparkCount: 80 }))(.65),
      instance(generated(action, { ...choice, fireSparkCount: 80, fireSparkLight: 1 }))(.65));
    assert.deepEqual(instance(generated(action, { ...choice, fireSparkLight: .5 }))(.65),
      instance(generated(action, { ...choice, fireSparkCount: action === 'plume' ? 360 : 240, fireSparkLight: .5 }))(.65));
  }
});

test('generation count 720 stays finite, seekable and empty at endpoints', () => {
  for (const action of ['plume', 'dash']) for (const seed of [0, 61, 0xffffffff]) {
    const mod = generated(action, { composition: 'material-volumes', ...choice, fireSparkCount: 720, fireSparkLight: 2 }, { seed });
    const draw = instance(mod), sample = draw(.8);
    for (const t of [1.4, .35, 2, .8]) {
      const f = draw(t); assert(f.hdrLight.every(Number.isFinite));
    }
    assert.deepEqual(draw(.8), sample);
    for (const t of [0, mod.meta.duration, mod.meta.duration + 1]) {
      const f = draw(t); assert(!f.color.some(Boolean)); assert(!f.light.some(Boolean)); assert(!f.hdrLight.some(Boolean));
    }
  }
});

test('generation accepts supported burst controls and rejects out-of-contract or inapplicable controls', () => {
  for (const [key, values] of Object.entries({ fireSparkCount: [null, '', '4', true, -1, 721, .5, NaN, Infinity],
    fireSparkLight: [null, '', '1', true, -.1, 2.01, NaN, Infinity] })) {
    for (const action of ['plume', 'burst']) {
      for (const value of values) assert.throws(() => generated(action, { ...choice, [key]: value }), RangeError);
      for (const value of [0, 1]) assert.throws(() => generated(action, { [key]: value }), RangeError);
    }
  }
  const burst = generated('burst', choice), zero = generated('burst', { ...choice, fireSparkCount: 0, fireSparkLight: 0 });
  assert.deepEqual(zero.meta, burst.meta); assert.deepEqual(zero.events, burst.events);
  assert.deepEqual(instance(zero)(.625), instance(burst, { layers: { sparks: false } })(.625));
  assert.notDeepEqual(instance(zero)(.625).color, instance(burst)(.625).color);
  for (const intent of [{ material: 'energy', action: 'dash' }, { material: 'ice', action: 'shatter' }, { material: 'water', action: 'pour' }, { material: 'lightning', action: 'strike' }])
    assert.throws(() => createGeneratedEffect2D(createGenerationPlan2D(intent), { ...choice, fireSparkCount: 0, fireSparkLight: 0 }), RangeError);
});
