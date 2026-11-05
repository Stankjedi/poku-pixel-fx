import test from 'node:test';
import assert from 'node:assert/strict';
import { createDetailParticles2D } from '../build/core/detail-particles.js';
import { createFrame, Painter, fly, flyV, hex, rng, TAU } from '../build/core/index.js';

const options = { count: 20, seed: 17, palette: ['#fc9', '#c84', '#743'],
  duration: 0.2, life: [0.5, 1], speed: [15, 60], gravity: 80, drag: 1.2 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function render(emitter, time, layer, flip = false) {
  const frame = createFrame(96, 96), painter = new Painter(frame).place(48, 48, flip);
  emitter.draw(painter, time, layer);
  return frame;
}

test('seeded births are deterministic, immutable, and stable when only count changes', () => {
  const a = createDetailParticles2D(options), b = createDetailParticles2D(options);
  assert.deepEqual(a.particles, b.particles);
  assert.deepEqual(a.sample(0.3), b.sample(0.3));
  assert.notDeepEqual(a.particles, createDetailParticles2D({ ...options, seed: 18 }).particles);
  assert.deepEqual(createDetailParticles2D({ ...options, count: 4 }).particles, a.particles.slice(0, 4));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.particles) && a.particles.every(Object.isFrozen));
  assert.equal(a.end, Math.max(...a.particles.map(p => p.born + p.life)));
});

test('arbitrary time sampling and reverse seeks match analytic motion for zero and tiny drag', () => {
  for (const drag of [0, 1e-12, 1.2]) {
    const emitter = createDetailParticles2D({ ...options, count: 1, duration: 0, life: 2, drag });
    const p = emitter.particles[0], state = emitter.sample(0.75)[0];
    const position = fly(p.x, p.y, p.vx, p.vy, 0.75, options.gravity, drag);
    const velocity = flyV(p.vx, p.vy, 0.75, options.gravity, drag);
    close(state.x, position[0]); close(state.y, position[1]); close(state.vx, velocity[0]); close(state.vy, velocity[1]);
    for (let i = 0; i < 120; i++) emitter.sample(i / 120);
    emitter.sample(0.01); assert.deepEqual(emitter.sample(0.75)[0], state);
  }
});

test('moving source is evaluated once at birth and detached particles retain that position', () => {
  let offset = 0, calls = 0;
  const emitter = createDetailParticles2D({ ...options, start: 2,
    origin(time, id) { calls++; return [time * 8 + offset, id - 10]; } });
  assert.equal(calls, options.count);
  emitter.particles.forEach(p => { close(p.x, p.born * 8); assert.equal(p.y, p.id - 10); });
  const original = emitter.sample(2.3), frame = render(emitter, 2.3);
  offset = 1000;
  assert.deepEqual(emitter.sample(2.3), original); assert.deepEqual(render(emitter, 2.3), frame);
  assert.equal(calls, options.count);
});

test('inherited velocity adds to launch motion without changing legacy RNG or zero defaults', () => {
  const legacy = createDetailParticles2D(options);
  const expected = Array.from({ length: options.count }, (_, id) => {
    const r = rng(options.seed, id, 1729), born = r.next() * options.duration;
    const direction = -Math.PI / 2 + (r.next() - 0.5) * TAU, speed = r.range(...options.speed);
    return { id, born, life: r.range(...options.life), x: 0, y: 0,
      vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed, size: r.range(0.6, 1.2) };
  });
  assert.deepEqual(legacy.particles, expected);
  for (const inheritedVelocity of [[0, 0], () => [0, 0]]) {
    const zero = createDetailParticles2D({ ...options, inheritedVelocity });
    assert.deepEqual(zero.particles, legacy.particles);
    assert.deepEqual(render(zero, 0.3), render(legacy, 0.3));
    const stationary = { ...options, speed: 0, angle: Math.PI, spread: 0 };
    assert.deepEqual(createDetailParticles2D({ ...stationary, inheritedVelocity }).particles,
      createDetailParticles2D(stationary).particles, 'signed zero remains unchanged');
  }
  const inheritedVelocity = [25, -40];
  const moving = createDetailParticles2D({ ...options, inheritedVelocity });
  assert.deepEqual(moving.particles, expected.map(p => ({ ...p, vx: p.vx + 25, vy: p.vy - 40 })));
  assert.deepEqual(createDetailParticles2D({ ...options, inheritedVelocity, count: 4 }).particles,
    moving.particles.slice(0, 4));
  const frame = render(moving, 0.3);
  inheritedVelocity[0] = 1000; inheritedVelocity[1] = 1000;
  assert.deepEqual(render(moving, 0.3), frame, 'constant vectors are copied');
});

test('inherited velocity callbacks snapshot absolute births once and drive analytic samples and trails', () => {
  for (const drag of [0, 1e-12, 1.2]) {
    const common = { ...options, count: 4, start: 2, life: 2, drag, trailSeconds: 0.1 };
    const baseline = createDetailParticles2D(common), calls = [], shared = [0, 0];
    let offset = 0;
    const emitter = createDetailParticles2D({ ...common,
      origin: birth => [birth * 8, 0],
      inheritedVelocity(birth, id) {
        calls.push([birth, id]);
        shared[0] = 8 + birth * 2 + offset; shared[1] = id - 12;
        return shared;
      } });
    assert.deepEqual(calls, emitter.particles.map(p => [p.born, p.id]));
    for (const p of emitter.particles) {
      close(p.vx, baseline.particles[p.id].vx + 8 + p.born * 2);
      close(p.vy, baseline.particles[p.id].vy + p.id - 12);
    }
    const samples = emitter.sample(2.5), frame = render(emitter, 2.5);
    shared[0] = shared[1] = offset = 1000;
    emitter.sample(3); emitter.sample(2.01);
    assert.deepEqual(emitter.sample(2.5), samples); assert.deepEqual(render(emitter, 2.5), frame);
    const trails = [];
    emitter.draw({ path(points) { trails.push(points); }, dot() {}, glow() {}, circle() {} }, 2.5);
    assert.equal(trails.length, emitter.count);
    samples.forEach((q, id) => {
      const p = emitter.particles[id];
      const position = fly(p.x, p.y, p.vx, p.vy, q.age, common.gravity, drag);
      const velocity = flyV(p.vx, p.vy, q.age, common.gravity, drag);
      close(q.x, position[0]); close(q.y, position[1]); close(q.vx, velocity[0]); close(q.vy, velocity[1]);
      assert.deepEqual(trails[id][0], fly(p.x, p.y, p.vx, p.vy,
        Math.max(0, q.age - common.trailSeconds), common.gravity, drag));
      close(trails[id].at(-1)[0], q.x); close(trails[id].at(-1)[1], q.y);
    });
    assert.equal(calls.length, common.count, 'sampling and drawing never call the source again');
  }
});

test('inherited velocity rejects invalid vectors and overflowing sums before sampling', () => {
  for (const value of [[NaN, 0], [0, Infinity], [-Infinity, 0], [], [1], [1, 2, 3],
    new Array(2), [0, '1'], { 0: 1, 1: 2, length: 2 }, null]) {
    for (const count of [0, 1])
      assert.throws(() => createDetailParticles2D({ ...options, count, inheritedVelocity: value }), RangeError);
    assert.throws(() => createDetailParticles2D({ ...options, inheritedVelocity: () => value }), RangeError);
  }
  for (const [angle, inheritedVelocity] of [[0, [Number.MAX_VALUE, 0]],
    [Math.PI / 2, [0, Number.MAX_VALUE]], [Math.PI, [-Number.MAX_VALUE, 0]]]) {
    for (const vector of [inheritedVelocity, () => inheritedVelocity])
      assert.throws(() => createDetailParticles2D({ ...options, count: 1,
        speed: Number.MAX_VALUE, angle, spread: 0, inheritedVelocity: vector }), /initial velocity overflow/);
  }
  let calls = 0;
  const empty = createDetailParticles2D({ ...options, count: 0,
    inheritedVelocity() { calls++; return [0, 0]; } });
  assert.equal(calls, 0); assert.deepEqual(empty.sample(0), []);
});

test('life controls discrete palette and width; birth, death and empty emitters draw no residual light', () => {
  const emitter = createDetailParticles2D({ count: 1, palette: ['#d84', '#743'], start: 0.2,
    speed: 0, life: 1, size: 2, endSize: 0.25, style: 'point', emission: 0.2 });
  const young = emitter.sample(0.3)[0], old = emitter.sample(0.95)[0];
  assert.equal(young.color, hex('#d84')); assert.equal(old.color, hex('#743'));
  close(emitter.sample(0.7)[0].size, 1.25); assert.ok(young.alpha > old.alpha);
  assert.equal(emitter.sample(0.2)[0].alpha, 0);
  for (const time of [-1, 0.199, 0.2, emitter.end, 3]) {
    const frame = render(emitter, time);
    assert.ok(frame.color.every(c => c === 0) && frame.light.every(c => c === 0));
  }
  const empty = createDetailParticles2D({ ...options, count: 0, start: 2 });
  assert.equal(empty.end, 2); assert.deepEqual(empty.sample(2), []);
});

test('short trails follow real curved motion, include the head, and never extend before birth', () => {
  const emitter = createDetailParticles2D({ count: 1, palette: ['#fc9', '#743'],
    origin: [5, 6], life: 1, speed: 80, angle: 0, spread: 0, gravity: 300, drag: 0.4,
    trailSeconds: 0.1, trailSamples: 9 });
  let points;
  emitter.draw({ path(p) { points = p; }, dot() {}, glow() {}, circle() {} }, 0.04);
  assert.deepEqual(points[0], [5, 6]); assert.equal(points.length, 9);
  const head = emitter.sample(0.04)[0];
  close(points.at(-1)[0], head.x); close(points.at(-1)[1], head.y);
  assert.ok(Math.abs(points[4][1] - (points[0][1] + points.at(-1)[1]) / 2) > 0.01);
});

test('tiny points retain one native cell; stationary sparks retain large authored widths', () => {
  const common = { count: 1, palette: ['#d84'], origin: [0.1, 0.1], speed: 0, life: 1, endSize: 1 };
  const tiny = render(createDetailParticles2D({ ...common, size: 0.5 }), 0.1);
  assert.equal(tiny.color.filter(Boolean).length, 1); assert.equal(tiny.color.filter(Boolean)[0] >>> 24, 128);
  assert.ok(tiny.light.every(c => c === 0), 'default emission is disabled');
  const large = render(createDetailParticles2D({ ...common, size: 5 }), 0.1);
  assert.ok(large.color.filter(Boolean).length > 4);
});

test('draws respect layer and transform without mutating state, options, or painter controls', () => {
  const palette = ['#fc9', '#743'], origin = [1, 2];
  const emitter = createDetailParticles2D({ ...options, palette, origin, layer: 'back', emission: 0.1 });
  const state = JSON.stringify(emitter.particles), samples = emitter.sample(0.3), frame = render(emitter, 0.3);
  assert.ok(frame.color.some(Boolean) && frame.light.some(Boolean));
  assert.deepEqual(render(emitter, 0.3, 'back'), frame);
  assert.ok(render(emitter, 0.3, 'front').color.every(c => c === 0));
  assert.notDeepEqual(render(emitter, 0.3, 'back', true).color, frame.color);
  palette[0] = '#000'; origin[0] = 1000; emitter.sample(0.3)[0].x = 1000;
  assert.deepEqual(render(emitter, 0.3), frame); assert.deepEqual(emitter.sample(0.3), samples);
  assert.equal(JSON.stringify(emitter.particles), state);
  const painter = new Painter(createFrame(96, 96)).place(48, 48, true, 0.3);
  const controls = ['tx', 'ty', 'fx', 'cs', 'sn', 'fade', 'lightK'];
  const before = controls.map(k => painter[k]); emitter.draw(painter, 0.3);
  assert.deepEqual(controls.map(k => painter[k]), before);
});

test('invalid inputs are bounded and rejected before unsafe work', () => {
  for (const bad of [{ count: -1 }, { count: 4097 }, { count: 1.5 }, { palette: [] }, { palette: ['blue'] },
    { palette: [NaN] }, { palette: [0x100000000] }, { seed: NaN }, { origin: [0, Infinity] },
    { origin: () => [NaN, 0] }, { duration: -1 }, { life: 0 }, { life: [2, 1] }, { speed: -1 },
    { spread: 7 }, { drag: -1 }, { gravity: Infinity }, { size: NaN }, { endSize: -1 }, { opacity: 2 },
    { attack: 1 }, { fadeStart: 1 }, { attack: 0.7, fadeStart: 0.3 }, { trailSeconds: -1 },
    { trailSamples: 65 }, { trailSamples: 2.5 }, { emission: -1 }, { lightRadius: 0 },
    { style: 'smoke' }, { layer: 'middle' }])
    assert.throws(() => createDetailParticles2D({ ...options, ...bad }), RangeError, JSON.stringify(bad));
  const emitter = createDetailParticles2D(options);
  assert.throws(() => emitter.sample(NaN), RangeError);
  assert.throws(() => emitter.draw({}, Infinity), RangeError);
  assert.throws(() => emitter.draw({}, 0.3, 'middle'), RangeError);
});
