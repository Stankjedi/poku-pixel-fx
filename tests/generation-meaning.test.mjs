import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationPlan2D, resolveGenerationPlan2D, parseGenerationMeaning2D,
  createGeneratedEffect2D, generationSource2D } from '../build/authoring/generation.js';
import { createFrame, createFx, Painter } from '../build/core/index.js';
import { collectAssetEvents } from '../build/render/export.js';

const make = (intent, options = {}) => {
  const plan = createGenerationPlan2D(intent), mod = createGeneratedEffect2D(plan);
  const impl = mod.create({ ...mod.meta.options, ...options });
  return { plan, mod, at(t) {
    const frame = createFrame(...mod.meta.size), painter = new Painter(frame).place(...mod.meta.origin);
    impl.drawBack(painter, t); impl.draw(painter, t); return frame;
  } };
};
const empty = frame => frame.color.every(c => c === 0) && frame.light.every(c => c === 0);
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('supported Korean/English meanings normalize exactly and never keyword-match negation or prose', () => {
  assert.deepEqual(parseGenerationMeaning2D('화염', '돌진', '폭발'), { material: 'fire', action: 'dash', response: 'burst' });
  assert.deepEqual(parseGenerationMeaning2D(' ENERGY ', 'PLUME', '소멸'), { material: 'energy', action: 'plume', response: 'dissipate' });
  assert.deepEqual(parseGenerationMeaning2D('불꽃', '폭발'), { material: 'fire', action: 'burst' });
  for (const args of [['fire', '폭발 없이'], ['lava', 'dash'], ['fire', 'flight'], ['fire', 'dash', '폭발하지 않음'], ['__proto__', 'dash']])
    assert.throws(() => parseGenerationMeaning2D(...args), RangeError);
});

test('one shared arrival drives projectile termination, blast, event position and end time', () => {
  for (const travel of [0.25, 0.74, 3]) for (const distance of [24, 128, 160]) {
    const plan = createGenerationPlan2D({ material: 'fire', action: 'dash', response: 'burst', travel, distance });
    assert.equal(plan.timing.arrival, plan.timing.release + travel);
    assert.deepEqual(generationSource2D(plan, plan.timing.arrival), { position: [...plan.to], velocity: [0, 0] });
    const release = plan.events.find(e => e.id === 'release'), arrival = plan.events.find(e => e.id === 'arrival');
    const burst = plan.events.find(e => e.id === 'burst');
    assert.equal(arrival.at, burst.at); assert.deepEqual(arrival.payload, burst.payload);
    assert.deepEqual([release.payload.x, release.payload.y], plan.from);
    assert.deepEqual([burst.payload.x, burst.payload.y], plan.to);
    assert.equal(plan.timing.sourceEmissionEnd, burst.at);
    assert.equal(plan.timing.emissionEnd, burst.at + 0.08); assert.ok(plan.timing.end > burst.at + 1);
    assert.equal(plan.events.find(e => e.id === 'source-emission-end').at, burst.at);
    assert.equal(plan.events.find(e => e.id === 'emission-end').at, burst.at + 0.08);
  }
});

test('motion velocity matches the path derivative, is stable at endpoints, and source timing is finite', () => {
  const plan = createGenerationPlan2D({ material: 'fire', action: 'dash' });
  for (const t of [-1, 0, plan.timing.release]) assert.deepEqual(generationSource2D(plan, t), { position: [...plan.from], velocity: [0, 0] });
  for (const t of [plan.timing.arrival, 20]) assert.deepEqual(generationSource2D(plan, t), { position: [...plan.to], velocity: [0, 0] });
  for (const t of [0.4, 0.6, 0.9]) {
    const e = 1e-6, a = generationSource2D(plan, t - e), b = generationSource2D(plan, t + e), q = generationSource2D(plan, t);
    near((b.position[0] - a.position[0]) / (2 * e), q.velocity[0], 1e-5);
    near((b.position[1] - a.position[1]) / (2 * e), q.velocity[1], 1e-5);
  }
  assert.throws(() => generationSource2D(plan, NaN), RangeError);
});

test('a requested arrival burst appears at exactly the endpoint and never during travel', () => {
  const layers = { body: false, trail: false, sparks: false, residue: false, light: false, response: true };
  const { plan, mod, at } = make({ material: 'fire', action: 'dash', response: 'burst' }, { layers });
  assert.ok(empty(at(plan.timing.arrival - 1e-9)));
  const frame = at(plan.timing.arrival); assert.ok(!empty(frame));
  const expected = [mod.meta.origin[0] + plan.to[0], mod.meta.origin[1] + plan.to[1]];
  let sx = 0, sy = 0, n = 0;
  frame.color.forEach((c, i) => { if (c) { sx += i % frame.w; sy += Math.floor(i / frame.w); n++; } });
  assert.ok(Math.abs(sx / n - expected[0]) < 2); assert.ok(Math.abs(sy / n - expected[1]) < 2);
  assert.ok(frame.light.every(c => c === 0));
});

test('omitting response never invents an explosion; plume and burst do not move like a dash', () => {
  const dash = createGenerationPlan2D({ material: 'fire', action: 'dash' });
  assert.equal(dash.intent.response, 'dissipate'); assert.equal(dash.events.some(e => e.kind === 'burst'), false);
  for (const action of ['plume', 'burst']) {
    const plan = createGenerationPlan2D({ material: 'fire', action });
    for (const t of [0.1, 0.6, 1.2]) assert.deepEqual(generationSource2D(plan, t), { position: [...plan.from], velocity: [0, 0] });
    assert.equal(plan.events.some(e => e.kind === 'burst'), action === 'burst');
  }
  const fire = make({ material: 'fire', action: 'burst' }, { layers: { body: false, trail: false, sparks: false, response: false, light: false } });
  const energy = make({ material: 'energy', action: 'burst' }, { layers: { body: false, trail: false, sparks: false, response: false, light: false } });
  assert.ok(!empty(fire.at(0.7)), 'fire has delayed cooling residue');
  assert.ok(empty(energy.at(0.7)), 'energy must not borrow smoke');
});

test('plume charge crosses release without an empty frame or a light discontinuity', () => {
  for (const material of ['fire', 'energy']) {
    const scene = make({ material, action: 'plume' }), release = scene.plan.timing.release;
    const light = f => f.light.reduce((sum, c) => sum + (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255), 0);
    for (const t of [release - 0.001, release, release + 0.001, release + 0.025]) assert.ok(!empty(scene.at(t)));
    const before = light(scene.at(release - 0.001)), after = light(scene.at(release + 0.001));
    assert.ok(before > 0 && after > 0); assert.ok(Math.abs(after - before) / before < 0.1);
  }
});

test('a fueled fire plume keeps its source occupied while detached tongues are replaced', () => {
  for (const seed of [0, 17, 0xffffffff]) {
    const scene = make({ material: 'fire', action: 'plume', seed },
      { layers: { trail: false, sparks: false, response: false, residue: false, light: false } });
    const x0 = scene.plan.origin[0] + scene.plan.from[0], y0 = scene.plan.origin[1] + scene.plan.from[1];
    for (let t = scene.plan.timing.release; t <= scene.plan.timing.sourceEmissionEnd; t += 0.025) {
      const f = scene.at(t); let rootPixels = 0;
      for (let y = y0 - 6; y < y0; y++) for (let x = x0 - 8; x < x0 + 8; x++) if (f.color[y * f.w + x] >>> 24) rootPixels++;
      assert.ok(rootPixels > 12, `fire source became empty at ${t}, seed ${seed}`);
    }
    assert.ok(empty(scene.at(scene.plan.timing.end)), 'fuel support must not persist beyond the effect');
  }
});

test('all supported first generations are deterministic, layer-controllable, bounded and finish empty', { timeout: 60000 }, () => {
  for (const material of ['fire', 'energy']) for (const [action, response] of [['dash', 'burst'], ['dash', 'dissipate'], ['burst', 'dissipate'], ['plume', 'dissipate']]) {
    for (const seed of [0, 17, 0xffffffff]) {
      const scene = make({ material, action, response, seed }), saved = scene.at(0.7);
      scene.at(1.2); scene.at(0.1); assert.deepEqual(scene.at(0.7), saved);
      assert.deepEqual(make({ material, action, response, seed }).at(0.7), saved);
      assert.ok(!empty(saved));
      for (let i = 0; i <= Math.ceil(scene.plan.timing.end * 20); i++) {
        const frame = scene.at(i / 20);
        for (let x = 0; x < frame.w; x++) for (const y of [0, frame.h - 1]) {
          assert.equal(frame.color[y * frame.w + x], 0, `${material}/${action}: vertical crop at ${i / 20}`);
          assert.equal(frame.light[y * frame.w + x], 0);
        }
        for (let y = 0; y < frame.h; y++) for (const x of [0, frame.w - 1]) {
          assert.equal(frame.color[y * frame.w + x], 0, `${material}/${action}: horizontal crop at ${i / 20}`);
          assert.equal(frame.light[y * frame.w + x], 0);
        }
      }
      for (const t of [0, scene.plan.timing.end, scene.plan.timing.end + 10]) assert.ok(empty(scene.at(t)));
      const dark = make({ material, action, response, seed }, { layers: { light: false } }).at(0.7);
      assert.ok(dark.color.some(Boolean)); assert.ok(dark.light.every(c => !c));
      assert.ok(empty(make({ material, action, response, seed }, { layers: { body: false, trail: false,
        sparks: false, residue: false, response: false, light: false } }).at(0.7)));
    }
  }
});

test('runtime partitions and direct seeks agree and semantic events survive asset collection', () => {
  const { plan, mod, at } = make({ material: 'fire', action: 'dash', response: 'burst' });
  const opts = { x: mod.meta.origin[0], y: mod.meta.origin[1] }, a = createFx(mod, opts), b = createFx(mod, opts);
  a.update(1.05); for (const dt of [0.1, 0.2, 0.23, 0.31, 0.21]) b.update(dt);
  const fa = createFrame(...mod.meta.size), fb = createFrame(...mod.meta.size); a.draw(fa); b.draw(fb);
  assert.deepEqual(fa, fb); assert.deepEqual(fa, at(1.05));
  const events = collectAssetEvents(mod);
  assert.equal(events.find(e => e.id === 'burst').at, plan.timing.arrival);
});

test('plans are immutable, JSON round-trippable, reject tampered clocks and validate supported intent', () => {
  const intent = { material: 'fire', action: 'dash', response: 'burst' }, plan = createGenerationPlan2D(intent);
  intent.action = 'plume'; assert.equal(plan.intent.action, 'dash');
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.intent) && Object.isFrozen(plan.to) && Object.isFrozen(plan.events[0].payload));
  assert.deepEqual(resolveGenerationPlan2D(JSON.parse(JSON.stringify(plan))), plan);
  for (const key of ['timing', 'to', 'events']) {
    const broken = JSON.parse(JSON.stringify(plan));
    if (key === 'timing') broken.timing.arrival += 0.1;
    else if (key === 'to') broken.to[0]++;
    else broken.events[1].at += 0.1;
    assert.throws(() => createGeneratedEffect2D(broken), /disagrees/);
  }
  for (const input of [{ material: 'ice', action: 'dash' }, { material: 'fire', action: 'phoenix' },
    { material: 'fire', action: 'plume', response: 'burst' }, { material: 'fire', action: 'burst', travel: 1 },
    { material: 'fire', action: 'dash', distance: 0 }, { material: 'fire', action: 'dash', travel: Infinity },
    { material: 'fire', action: 'dash', distance: null }, { material: 'fire', action: 'dash', travel: null },
    { material: 'fire', action: 'dash', seed: -1 }, { material: 'fire', action: 'dash', prompt: 'anything' }])
    assert.throws(() => createGenerationPlan2D(input));
});

test('instance parameters are snapshotted and invalid diagnostic layer flags are not silently ignored', () => {
  const plan = createGenerationPlan2D({ material: 'fire', action: 'plume' }), mod = createGeneratedEffect2D(plan);
  const palette = [...mod.meta.options.palette], layers = { light: true }, options = { seed: 9, palette, layers };
  const impl = mod.create(options), frame = () => {
    const f = createFrame(...mod.meta.size), p = new Painter(f).place(...mod.meta.origin);
    impl.drawBack(p, 0.9); impl.draw(p, 0.9); return f;
  };
  const before = frame(); options.seed = 10; palette.fill('#000'); layers.light = false;
  assert.deepEqual(frame(), before);
  for (const layers of [null, [], { light: 'false' }, { typo: false }])
    assert.throws(() => mod.create({ ...mod.meta.options, layers }), /layer flags/);
});
