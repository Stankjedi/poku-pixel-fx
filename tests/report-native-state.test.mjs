import test from 'node:test';
import assert from 'node:assert/strict';
import { createAct, createFrame, clearFrame, drawActor, painterFor, STAND } from '../build/core/index.js';
import * as petrified from '../build/fx/status/petrified.js';

const selections = [
  { kind: 'human', height: 64, weapon: 'none' },
  { kind: 'creature', species: 'cat', height: 48, motion: 'walk' },
];
const frame = () => {
  const f = createFrame(240, 192, -20, -16);
  f.hdrLight = new Float32Array(f.w * f.h * 3);
  return f;
};
const sameBuffers = (actual, expected) => {
  assert.deepEqual(actual.color, expected.color, 'native straight-alpha body and effect');
  assert.deepEqual(actual.light, expected.light, 'native packed emission');
  assert.deepEqual(actual.hdrLight, expected.hdrLight, 'native linear HDR emission');
};

test('stateful onBody ACT keeps its effect-start native snapshot through prewindup and moving poses', () => {
  for (const actorSelection of selections) {
    let captured, updates = 0;
    const mod = {
      meta: { duration: 2, size: [160, 128], origin: [80, 112], actor: 2 },
      act: { onBody: true, poses: [
        [-.2, { ...STAND, x: -18, lean: -3, fy: -30 }],
        [0, STAND], [.6, { ...STAND, x: 24, lean: 6, fy: -27 }],
        [2, { ...STAND, x: 24, lean: 6, fy: -27 }],
      ] },
      create(options) {
        captured = options.actor;
        return { update(dt, current) {
          assert.equal(dt, 1 / 120);
          assert.strictEqual(current.actor, captured, 'simulation must retain the precomputed shape');
          updates++;
        }, draw() {} };
      },
    };
    const act = createAct(mod, { x: 90, y: 120, actorSelection });
    const pixels = captured.pixels.slice(), mask = captured.mask.data.slice();
    const expected = frame(); drawActor(painterFor(expected).place(90, 120), captured);
    const windup = frame(); act.draw(windup);
    assert.notDeepEqual(windup.color, expected.color, 'the prewindup pose should actually differ');
    assert.strictEqual(act.fx.options.actor, captured);
    act.update(.1); act.draw(clearFrame(windup));
    assert.ok(act.t < 0); assert.equal(updates, 0);
    assert.strictEqual(act.fx.options.actor, captured, 'drawing a windup must not replace the future simulation actor');
    act.update(.85);
    assert.ok(act.pose.x > 20, 'the authored pose moves after effect activation');
    const active = frame(); act.draw(active);
    assert.ok(updates > 0);
    sameBuffers(active, expected);
    assert.strictEqual(act.fx.options.actor, captured);
    assert.deepEqual(captured.pixels, pixels, 'later adapter samples must not reuse the snapshot output buffer');
    assert.deepEqual(captured.mask.data, mask);
  }
});

test('Petrified native precomputed silhouettes and shatter RNG are independent of drawing cadence and host FPS', () => {
  const wallTime = 2.8;
  for (const actorSelection of selections) {
    let reference;
    for (const fps of [0, 60, 144, 165]) {
      const act = createAct(petrified, { seed: 17, x: 90, y: 135, actorSelection });
      const actor = act.fx.options.actor, pixels = actor.pixels.slice(), mask = actor.mask.data.slice();
      const output = frame();
      if (fps) {
        // Exercise the draw path before the effect begins, then every host frame.
        act.draw(clearFrame(output));
        const whole = Math.floor(wallTime * fps);
        for (let i = 0; i < whole; i++) {
          act.update(1 / fps); act.draw(clearFrame(output));
          assert.strictEqual(act.fx.options.actor, actor);
        }
        const remainder = wallTime - whole / fps;
        if (remainder > 0) act.update(remainder);
      } else act.update(wallTime);
      act.draw(clearFrame(output));
      assert.strictEqual(act.fx.options.actor, actor);
      assert.deepEqual(actor.pixels, pixels);
      assert.deepEqual(actor.mask.data, mask);
      assert.ok(act.fx.t > 2.2, 'the comparison includes the seeded shatter simulation');
      assert.ok(output.color.some(Boolean));
      if (reference) {
        assert.equal(act.fx.tick, reference.tick);
        assert.ok(Math.abs(act.t - reference.time) < 1e-12);
        sameBuffers(output, reference.output);
      } else reference = { tick: act.fx.tick, time: act.t, output };
    }
  }
});

test('pure native onBody effects continue to receive the live body pose', () => {
  for (const actorSelection of selections) {
    let observed;
    const mod = {
      meta: { duration: 2, size: [160, 128], origin: [80, 112], actor: 2 },
      act: { onBody: true, poses: [[0, STAND], [.5, { ...STAND, x: 25, fy: -28 }], [2, { ...STAND, x: 25, fy: -28 }]] },
      draw(_p, _time, options) { observed = options.actor; },
    };
    const act = createAct(mod, { x: 90, y: 120, actorSelection }), initial = act.fx.options.actor;
    act.update(.75); act.draw(frame());
    assert.notStrictEqual(observed, initial, 'pure statuses keep following native animation');
    assert.equal(observed.anchors.root[0], 25);
  }
});
