import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimingCurve } from '../build/core/index.js';

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('automatic tangents preserve uneven rises, plateaus, falls and exact keys', () => {
  const input = [
    { time: -1, value: -3 }, { time: -.9, value: 4 }, { time: .8, value: 5 },
    { time: 1.1, value: 5 }, { time: 2, value: -2 }, { time: 8, value: -3 },
  ];
  const curve = createTimingCurve(input);
  for (const key of curve.keys) assert.deepEqual(curve.sample(key.time), { value: key.value, velocity: key.velocity });
  assert.equal(curve.keys[2].velocity, 0);
  assert.equal(curve.keys[3].velocity, 0);
  for (let i = 0; i < input.length - 1; i++) {
    const a = input[i], b = input[i + 1], sign = Math.sign(b.value - a.value);
    let previous = a.value;
    for (let step = 1; step <= 100; step++) {
      const { value, velocity } = curve.sample(a.time + (b.time - a.time) * step / 100);
      assert.ok(value >= Math.min(a.value, b.value) - 1e-12 && value <= Math.max(a.value, b.value) + 1e-12);
      assert.ok(sign === 0 ? value === a.value : sign * (value - previous) >= -1e-12);
      assert.ok(sign === 0 ? velocity === 0 : sign * velocity >= -1e-12);
      previous = value;
    }
  }
  const uneven = createTimingCurve([{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 3, value: 2 }]);
  close(uneven.keys[0].velocity, 7 / 6);
  close(uneven.keys[1].velocity, 9 / 13);
  close(uneven.keys[2].velocity, 1 / 6);
});

test('authored velocities permit overshoot and match the analytic derivative through joins', () => {
  const curve = createTimingCurve([
    { time: 0, value: 0, velocity: 6 }, { time: 1, value: 1 }, { time: 2, value: 0, velocity: -2 },
  ]);
  assert.equal(curve.sample(0).velocity, 6);
  assert.equal(curve.sample(2).velocity, -2);
  assert.equal(curve.sample(.5).value, 1.25, 'authored anticipation/overshoot is not clamped away');
  for (const time of [.1, .3, .8, 1.2, 1.7, 1.9]) {
    const dt = 1e-6;
    close(curve.sample(time).velocity, (curve.sample(time + dt).value - curve.sample(time - dt).value) / (2 * dt), 1e-8);
  }
  close(curve.sample(1 - 1e-7).velocity, 0, 1e-5);
  close(curve.sample(1 + 1e-7).velocity, 0, 1e-5);
});

test('hold and continue are independent explicit endpoint policies, without resets', () => {
  const keys = [{ time: 2, value: 10, velocity: 4 }, { time: 5, value: 16, velocity: -2 }];
  const hold = createTimingCurve(keys);
  assert.deepEqual(hold.sample(1), { value: 10, velocity: 0 });
  assert.deepEqual(hold.sample(6), { value: 16, velocity: 0 });
  assert.deepEqual(hold.sample(2), { value: 10, velocity: 4 });
  assert.deepEqual(hold.sample(5), { value: 16, velocity: -2 });
  const before = createTimingCurve(keys, { before: 'continue' });
  assert.deepEqual(before.sample(1), { value: 6, velocity: 4 });
  assert.deepEqual(before.sample(6), { value: 16, velocity: 0 });
  const after = createTimingCurve(keys, { after: 'continue' });
  assert.deepEqual(after.sample(1), { value: 10, velocity: 0 });
  assert.deepEqual(after.sample(7), { value: 12, velocity: -2 });
  close(after.sample(5 + 1e-7).value, after.sample(5 - 1e-7).value, 1e-6);
});

test('curve inputs are snapshotted, resolved keys are immutable and seeks are stateless', () => {
  const keys = [{ time: 0, value: 0 }, { time: 2, value: 4 }, { time: 3, value: 5 }];
  const original = structuredClone(keys), options = { after: 'continue' };
  const curve = createTimingCurve(keys, options);
  assert.deepEqual(keys, original, 'compilation does not add velocities to the input');
  const times = [-1, 0, .3, 1.5, 2, 2.7, 3, 4], expected = times.map(time => curve.sample(time));
  keys[0].value = 999; keys[1].time = -10; keys.push({ time: 5, value: 999 }); options.after = 'hold';
  for (let i = times.length - 1; i >= 0; i--) assert.deepEqual(curve.sample(times[i]), expected[i]);
  assert.ok(Object.isFrozen(curve) && Object.isFrozen(curve.keys) && curve.keys.every(Object.isFrozen));
  assert.throws(() => { curve.keys[0].value = 123; }, TypeError);
  assert.throws(() => curve.keys.push({ time: 9, value: 9, velocity: 0 }), TypeError);
  const sample = curve.sample(.3); sample.value = 999;
  assert.deepEqual(curve.sample(.3), expected[2]);
});

test('malformed, sparse, unordered and unrepresentable inputs fail clearly', () => {
  const valid = [{ time: 0, value: 0 }, { time: 1, value: 1 }];
  const sparse = new Array(2); sparse[1] = valid[1];
  for (const input of [null, {}, [], [valid[0]], Array(1025).fill(valid[0]), sparse,
    [null, valid[1]], [[], valid[1]], [{ time: 0 }, valid[1]],
    [{ time: '0', value: 0 }, valid[1]], [{ time: 0, value: '0' }, valid[1]],
    [{ time: NaN, value: 0 }, valid[1]], [{ time: 0, value: Infinity }, valid[1]],
    [{ time: 0, value: 0, velocity: null }, valid[1]], [{ time: 0, value: 0, velocity: NaN }, valid[1]],
    [valid[0], valid[0]], [valid[1], valid[0]],
    [{ time: -Number.MAX_VALUE, value: 0 }, { time: Number.MAX_VALUE, value: 1 }],
    [{ time: 0, value: -Number.MAX_VALUE }, { time: 1, value: Number.MAX_VALUE }],
    [{ time: 0, value: 0 }, { time: Number.MIN_VALUE, value: 1 }],
  ]) assert.throws(() => createTimingCurve(input), RangeError);
  for (const options of [null, [], 2, { before: null }, { before: 'loop' }, { after: 'zero' }, { aftre: 'hold' }]) {
    assert.throws(() => createTimingCurve(valid, options), RangeError);
  }
  const curve = createTimingCurve(valid);
  for (const time of [null, undefined, '1', NaN, Infinity, -Infinity]) assert.throws(() => curve.sample(time), RangeError);
  assert.equal(createTimingCurve(Array.from({ length: 1024 }, (_, time) => ({ time, value: time }))).keys.length, 1024);
});

test('sampling rejects summed value or derivative overflow instead of returning non-finite motion', () => {
  const large = createTimingCurve([
    { time: 0, value: 1e308, velocity: 1e308 }, { time: 1, value: 1e308, velocity: 1e308 },
  ], { after: 'continue' });
  assert.throws(() => large.sample(2), RangeError, 'two finite extrapolation terms can overflow when added');
  const overshoot = createTimingCurve([
    { time: 0, value: 1e308, velocity: 1e308 }, { time: 10, value: 1e308, velocity: -1e308 },
  ]);
  assert.throws(() => overshoot.sample(5), RangeError);
  const fast = createTimingCurve([
    { time: 0, value: 0, velocity: -Number.MAX_VALUE }, { time: 1, value: 1e308, velocity: -Number.MAX_VALUE },
  ]);
  assert.throws(() => fast.sample(.5), RangeError);
  const flat = createTimingCurve([{ time: 0, value: Number.MAX_VALUE }, { time: 1, value: Number.MAX_VALUE }]);
  assert.deepEqual(flat.sample(.5), { value: Number.MAX_VALUE, velocity: 0 });
  assert.deepEqual(flat.sample(Number.MAX_VALUE), { value: Number.MAX_VALUE, velocity: 0 });
  const linear = createTimingCurve([{ time: 0, value: 0 }, { time: 1, value: Number.MAX_VALUE }]);
  for (const time of [.1, .5, .9]) assert.equal(linear.sample(time).velocity, Number.MAX_VALUE);
});
