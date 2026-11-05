import test from 'node:test';
import assert from 'node:assert/strict';
import { cycle } from '../build/core/particles.js';
import { rng } from '../build/core/math.js';

// The former implementation is retained as an oracle only for small, valid finite inputs.
function legacyCycle(t, period, count, seed, life, fn) {
  for (let i = 0; i < count; i++) {
    const g = rng(seed, i, 911), born = g.next() * period;
    const L = typeof life === 'function' ? life(g) : life;
    let age = (((t - born) % period) + period) % period;
    for (; age < L; age += period) fn(age, L, rng(seed, i), i);
  }
}
function record(emit, args) {
  const records = [];
  emit(...args, (age, life, random, id) => records.push([id, age, life, random.next(), random.next()]));
  return records;
}

test('cycle guards preserve exact emission ages, order and RNG for existing valid inputs', () => {
  for (const time of [-2.3, 0, 0.3, 1.7, 8.9]) for (const period of [0.3, 1.7])
    for (const count of [0, 1, 4, 7.4]) for (const life of [0, -1, 0.2, 3, random => random.range(0.1, 3)]) {
      const args = [time, period, count, 17, life];
      assert.deepEqual(record(cycle, args), record(legacyCycle, args));
    }
});

test('cycle still loops across a period and supports multiple simultaneous generations', () => {
  const a = record(cycle, [0, 2, 4, 7, 5]), b = record(cycle, [2, 2, 4, 7, 5]);
  assert.ok(a.length > 4);
  assert.equal(a.length, b.length);
  a.forEach((row, i) => row.forEach((value, j) => assert.ok(Math.abs(value - b[i][j]) < 1e-12)));
});

test('fractional counts and non-positive lifetime suppression retain their former behavior', () => {
  let lifeCalls = 0, emissions = 0;
  cycle(0, 1, 2.1, 1, () => { lifeCalls++; return 0; }, () => emissions++);
  assert.equal(lifeCalls, 3); assert.equal(emissions, 0);
  assert.deepEqual(record(cycle, [0, 1, 0, 1, 1]), []);
});

test('negative or non-finite periods and infinite lifetimes fail instead of spinning forever', () => {
  // If the guard regresses, this callback aborts the formerly endless inner loop safely.
  const abort = () => { throw new Error('Invalid cycle reached emission'); };
  for (const period of [-1, 0, Infinity, NaN])
    assert.throws(() => cycle(0, period, 1, 1, 1, abort), RangeError);
  for (const life of [Infinity, NaN, () => Infinity, () => NaN])
    assert.throws(() => cycle(0, 1, 1, 1, life, abort), RangeError);
});

test('cycle rejects excessive overlapping copies before the first particle draws', () => {
  let calls = 0;
  assert.throws(() => cycle(0, 1e-6, 1, 1, 1, () => {
    if (++calls > 2) throw new Error('Unbounded overlap');
  }), /Cycle exceeds 65536 live copies/);
  assert.equal(calls, 0);
  assert.throws(() => cycle(0, 1, 65537, 1, 1, () => { throw new Error('Count was not checked'); }), RangeError);
});

test('the live-copy budget applies across particles and permits the documented boundary', () => {
  let calls = 0;
  cycle(0, 1, 65536, 1, 1, () => calls++);
  assert.equal(calls, 65536);
  calls = 0;
  assert.throws(() => cycle(0, 1, 2, 1, 40000, () => calls++), /Cycle exceeds 65536 live copies/);
  assert.equal(calls, 40000, 'a later lifetime may exceed the remaining budget; no silent truncation');
});

test('non-finite controls and overflow are explicit errors without callback side effects', () => {
  const abort = () => { throw new Error('Invalid input reached emission'); };
  for (const args of [[NaN, 1, 1, 1, 1], [0, 1, Infinity, 1, 1], [0, 1, -1, 1, 1],
    [0, 1, 1, NaN, 1], [-Number.MAX_VALUE, Number.MAX_VALUE, 1, 1, 1]])
    assert.throws(() => cycle(...args, abort), RangeError);
});
