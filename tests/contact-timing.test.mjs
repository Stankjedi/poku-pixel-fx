import test from 'node:test';
import assert from 'node:assert/strict';
import { createAct, actTiming, Target } from '../build/core/index.js';
import { defineImpactContact2D } from '../build/core/impact-contact.js';
import { createFx3D } from '../build/3d/index.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const actModule = (act = {}, meta = {}) => ({
  meta: { duration: 2, size: [80, 80], origin: [0, 0], ...meta }, act, draw() {},
});
const cueModule = (cues, loop = false, duration = 1) => ({
  meta: { id: 'test', name: 'test', description: '', duration, loop, options: {}, cues },
  create: () => ({ update() {}, draw() {} }),
});
const run = (mod, parts) => {
  const act = createAct(mod), events = [];
  act.onHit = hit => events.push({ t: act.t, fx: act.fx.t, hit });
  for (const dt of parts) act.update(dt);
  return { act, events };
};

// An independent wall-time oracle: each contact stops effect time for its freeze,
// simultaneous contacts share the longest freeze, and motion uses the remainder.
function expectedTime(hits, wall, from = 0) {
  let t = from;
  const sorted = [...hits].sort((a, b) => a.t - b.t);
  for (let i = 0; i < sorted.length;) {
    const at = sorted[i].t;
    if (wall < at - t - 1e-10) return { t: t + wall, frozen: false };
    wall -= at - t; t = at;
    let freeze = 0;
    do { freeze = Math.max(freeze, sorted[i++].stop ?? 0); } while (i < sorted.length && sorted[i].t === at);
    if (wall < freeze - 1e-10) return { t, frozen: true };
    wall = Math.max(0, wall - freeze);
  }
  return { t: t + wall, frozen: false };
}

test('3D zero-time cues fire once on the first fixed step and restart re-arms them', () => {
  const cue = { at: 0, type: 'hit', value: 2 };
  const fx = createFx3D(cueModule([cue]));
  assert.deepEqual(fx.drainCues(), []);
  fx.update(0); assert.deepEqual(fx.drainCues(), []);
  fx.update(1 / 240); assert.deepEqual(fx.drainCues(), []);
  fx.update(1 / 240); assert.deepEqual(fx.drainCues(), [cue]);
  fx.update(1); assert.deepEqual(fx.drainCues(), []);
  fx.restart(); fx.update(1 / 120); assert.deepEqual(fx.drainCues(), [cue]);
});

test('3D cue order is chronological, stable for ties, and near-boundary cues never duplicate', () => {
  const cues = [
    { at: 0.5, type: 'sound' }, { at: 1 / 120 + 5e-10, type: 'shake' },
    { at: 0, type: 'hit' }, { at: 0.5, type: 'flash' },
  ];
  const fx = createFx3D(cueModule(cues));
  fx.update(1 / 120); assert.deepEqual(fx.drainCues().map(c => c.type), ['hit', 'shake']);
  fx.update(1 / 120); assert.deepEqual(fx.drainCues(), []);
  fx.update(1); assert.deepEqual(fx.drainCues().map(c => c.type), ['sound', 'flash']);
  assert.equal(cues[0].type, 'sound', 'authored metadata is not sorted in place');
});

test('3D seek is silent, including zero and fractional-tick contacts, and does not replay past cues', () => {
  const fx = createFx3D(cueModule([
    { at: 0, type: 'hit' }, { at: 0.002, type: 'flash' }, { at: 0.006, type: 'sound' },
  ]));
  fx.seek(0); assert.deepEqual(fx.drainCues(), []);
  fx.update(1 / 120); assert.deepEqual(fx.drainCues().map(c => c.type), ['flash', 'sound']);
  fx.seek(0.004); assert.deepEqual(fx.drainCues(), []);
  fx.update(1 / 120); assert.deepEqual(fx.drainCues().map(c => c.type), ['sound']);
  fx.seek(1); fx.update(1); assert.deepEqual(fx.drainCues(), []);
});

test('3D zero-time and endpoint cues survive every loop in a multi-cycle update', () => {
  const cues = [{ at: 0, type: 'hit' }, { at: 0.1, type: 'sound' }];
  const large = createFx3D(cueModule(cues, true, 0.1));
  const small = createFx3D(cueModule(cues, true, 0.1));
  large.update(0.3); for (let i = 0; i < 36; i++) small.update(1 / 120);
  assert.deepEqual(large.drainCues().map(c => c.type), ['hit', 'sound', 'hit', 'sound', 'hit', 'sound']);
  assert.deepEqual(small.drainCues().map(c => c.type), ['hit', 'sound', 'hit', 'sound', 'hit', 'sound']);
  large.update(1 / 120); assert.deepEqual(large.drainCues().map(c => c.type), ['hit']);
});

test('act hit-stop consumes wall time at the exact contact, with no lost remainder', () => {
  const mod = actModule({ target: { x: 42 }, hits: [{ t: 0.5, stop: 0.1, straw: 2 }] });
  const large = run(mod, [0.6]), small = run(mod, Array(60).fill(0.01));
  for (const { act, events } of [large, small]) {
    close(act.t, 0.5); close(act.fx.t, 0.5); assert.equal(act.frozen, false);
    assert.equal(events.length, 1); close(events[0].t, 0.5); close(events[0].fx, 0.5);
    close(act.targets[0].straw[0].age, 0);
  }
  const resumed = run(mod, [0.55, 0.1]);
  close(resumed.act.t, 0.55); assert.equal(resumed.act.frozen, false);
  close(resumed.act.targets[0].straw[0].age, 0.05);
});

test('initial and simultaneous act contacts fire before motion and share the longest freeze', () => {
  const hits = [{ t: 0, stop: 0.05 }, { t: 0, stop: 0.1 }];
  const { act, events } = run(actModule({ target: {}, hits }), [0.06]);
  assert.equal(events.length, 2); events.forEach(e => close(e.t, 0));
  close(act.t, 0); close(act.fx.t, 0); assert.equal(act.frozen, true);
  close(act.targets[0].theta, 0); close(act.targets[0].flashT, 0.05);
  act.update(0.05); close(act.t, 0.01); assert.equal(act.frozen, false);
});

test('a contact exactly at the update endpoint has fresh flash, impulse and debris', () => {
  const { act, events } = run(actModule({ target: {}, hits: [{ t: 0.037, stop: 0.1, flash: 0.08, push: 2, straw: 1 }] }), [0.037]);
  assert.equal(events.length, 1); close(events[0].t, 0.037); assert.equal(act.frozen, true);
  const target = act.targets[0]; close(target.theta, 0); close(target.omega, 2);
  close(target.flashT, 0.08); close(target.straw[0].age, 0);
  act.update(0.1); close(act.t, 0.037); assert.equal(act.frozen, false);
});

test('hit-stop matches an independent oracle across many frame partitions and arbitrary contact times', () => {
  const hits = [{ t: -0.1, stop: 0.03 }, { t: 0.137, stop: 0.047 }, { t: 0.137, stop: 0.08 },
    { t: 0.341, stop: 0.13 }, { t: 0.503, stop: 0.01 }, { t: 0.788, stop: 0.06 }];
  const mod = actModule({ poses: [[-0.2, {}], [1.2, {}]], hits: [...hits].reverse() });
  for (const wall of [0.02, 0.1, 0.12, 0.13, 0.337, 0.4, 0.68, 0.79, 1.3]) {
    const expected = expectedTime(hits, wall, -0.2);
    for (const n of [1, 3, 17, 60, 144]) {
      const { act, events } = run(mod, Array(n).fill(wall / n));
      close(act.t, expected.t); close(act.fx.t, Math.max(0, expected.t));
      assert.equal(act.frozen, expected.frozen, `wall=${wall}, n=${n}`);
      for (const e of events) close(e.t, e.hit.t);
      assert.equal(new Set(events.map(e => e.hit)).size, events.length);
    }
  }
});

test('loop acts preserve endpoint, zero-time and wind-up contacts across large updates', () => {
  const hits = [{ t: -0.05 }, { t: 0, stop: 0.02 }, { t: 0.1, stop: 0.03 }, { t: 0.25 }];
  const mod = actModule({ poses: [[-0.1, {}], [0.25, {}]], hits }, { duration: 0.25, loop: true });
  const large = run(mod, [0.95]), small = run(mod, Array(95).fill(0.01));
  close(large.act.t, small.act.t); close(large.act.fx.t, small.act.fx.t);
  assert.equal(large.act.frozen, small.act.frozen);
  assert.deepEqual(large.events.map(e => e.hit.t), small.events.map(e => e.hit.t));
  assert.deepEqual(large.events.map(e => e.hit.t), [-0.05, 0, 0.1, 0.25, 0, 0.1, 0.25, 0, 0.1]);
  assert.ok(large.events.every((e, i, list) => i === 0 || e.t >= list[i - 1].t));
});

test('act update(0) is a no-op and invalid dt cannot corrupt clocks or dispatch a hit', () => {
  const act = createAct(actModule({ hits: [{ t: 0, stop: 0.1 }] })); let calls = 0;
  act.onHit = () => calls++;
  act.update(0); assert.equal(calls, 0); assert.equal(act.frozen, false);
  for (const dt of [-0.01, NaN, Infinity, -Infinity]) assert.throws(() => act.update(dt), RangeError);
  assert.equal(act.t, 0); assert.equal(act.fx.t, 0); assert.equal(calls, 0);
  assert.throws(() => createAct(actModule({}, { loop: true, duration: 0 })), RangeError);
});

test('actTiming preserves complete target response, contact metadata and target suppression', () => {
  const contact = defineImpactContact2D({ id: 'armor-hit', at: 0.2, position: [61, -35], normal: [-1, 0], material: 'metal' });
  const result = actTiming(actModule({ targets: [{ x: 61 }], hits: [
    { t: 0.2, at: 0, stop: 0.1, shake: 0.15, push: 2.4, straw: 12, flash: 0.08, shiver: 0.5, skin: 'shock', contact },
    { t: 0.3, target: false, push: 5, straw: 9, flash: 0.1, shiver: 0.4 },
    { t: 0.4, y: -19 },
  ] }));
  assert.deepEqual(result.hits[0], { t: 0.2, freeze: 0.1, shake: 0.15, amp: 2, target: true, at: 0, y: -35,
    push: 2.4, straw: 12, flash: 0.08, shiver: 0.5, skin: 'shock', contact });
  const suppressed = result.hits[1];
  assert.equal(suppressed.target, false);
  for (const key of ['push', 'straw', 'flash', 'shiver']) assert.equal(suppressed[key], 0);
  assert.equal(result.hits[2].y, -19); assert.equal(result.hits[2].flash, 0.05); assert.equal(result.hits[2].straw, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(result)).hits[0].contact, contact);
  assert.equal(actTiming({ ...actModule(), act: undefined }), null);
});

test('contact geometry places target debris locally, with legacy y taking precedence', () => {
  const contact = defineImpactContact2D({ id: 'test', at: 0, position: [14, -30], normal: [0, -1], material: 'straw' });
  const a = new Target(66, 3), b = new Target(66, 3), c = new Target(66, 3);
  a.hit({ contact, straw: 1 }); b.hit({ contact, straw: 1, y: -20 }); c.hit({ straw: 1 });
  close(a.straw[0].x - c.straw[0].x, 14 - 66);
  close(a.straw[0].y - c.straw[0].y, -30 + 26);
  close(b.straw[0].y - a.straw[0].y, 10);
});


test('invalid act event times fail instead of trapping event-boundary stepping', () => {
  for (const t of [NaN, Infinity, -Infinity]) {
    assert.throws(() => createAct(actModule({ hits: [{ t }] })), RangeError);
    assert.throws(() => createAct(actModule({ dust: [{ t, x: 0 }] })), RangeError);
  }
  for (const stop of [NaN, Infinity, -0.1]) assert.throws(() => createAct(actModule({ hits: [{ t: 0, stop }] })), RangeError);
  const tiny = createAct(actModule({}, { loop: true, duration: 1e-10 }));
  tiny.update(1e-10); close(tiny.t, 1e-10);
});

test('one-shot done waits for its final contact freeze to finish', () => {
  const act = createAct(actModule({ hits: [{ t: 0.5, stop: 0.1 }] }, { duration: 0.5 }));
  act.update(0.5); assert.equal(act.done(), false); assert.equal(act.frozen, true);
  act.update(0.1); assert.equal(act.done(), true); assert.equal(act.frozen, false);
});
