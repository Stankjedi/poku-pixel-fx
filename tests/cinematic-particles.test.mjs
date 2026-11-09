import test from 'node:test';
import assert from 'node:assert/strict';
import { createCinematicParticles2D, sampleEmissionPath2D, createFrame, Painter, fly, flyV } from '../build/core/index.js';

const base = { count: 40, palette: ['#fff2b0', '#ff8b31', '#b62d21'], seed: 3,
  start: 0.2, duration: 0.8, life: [0.6, 0.9], speed: [20, 60], curl: { amplitude: 4, frequency: 1.2 } };
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function render(emitter, t, layer, flip = false) {
  const frame = createFrame(160, 120), p = new Painter(frame).place(80, 70, flip);
  emitter.draw(p, t, layer); return frame;
}

test('stratified births fill every time bin and independent surface samples cover the source', () => {
  const a = createCinematicParticles2D(base), b = createCinematicParticles2D(base);
  assert.deepEqual(a.particles, b.particles); assert.deepEqual(a.sample(0.8), b.sample(0.8));
  assert.notDeepEqual(a.particles, createCinematicParticles2D({ ...base, seed: 4 }).particles);
  a.particles.forEach((p, i) => {
    assert.equal(Math.floor((p.born - base.start) / base.duration * base.count), i);
    assert.ok(p.u >= 0 && p.u < 1);
  });
  const bins = new Set(a.particles.map(p => Math.floor(p.u * 8)));
  assert.equal(bins.size, 8);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.particles) && a.particles.every(Object.isFrozen));
  assert.equal(a.end, Math.max(...a.particles.map(p => p.born + p.life)));
});

test('source and inherited motion are snapshotted once with the same birth and surface coordinate', () => {
  let offset = 0; const calls = [], velocityCalls = [];
  const emitter = createCinematicParticles2D({ ...base, speed: 0,
    source: (t, id, u) => { calls.push([t, id, u]); return [t * 9 + offset, u * 20]; },
    inheritedVelocity: (t, id, u) => { velocityCalls.push([t, id, u]); return [9, -3 + offset]; } });
  assert.deepEqual(calls, velocityCalls); assert.equal(calls.length, base.count);
  for (const p of emitter.particles) { near(p.x, p.born * 9); near(p.y, p.u * 20); near(p.vx, 9); near(p.vy, -3); }
  const state = emitter.sample(0.8), frame = render(emitter, 0.8);
  offset = 1000; emitter.sample(1.2); emitter.sample(0.3);
  assert.deepEqual(emitter.sample(0.8), state); assert.deepEqual(render(emitter, 0.8), frame);
  assert.equal(calls.length, base.count);
});

test('distance-based surface sampling does not overweight clustered or duplicate control points', () => {
  const path = [[0, 0], [0, 0], [1, 0], [2, 0], [100, 0]];
  for (const u of [0, 0.01, 0.25, 0.5, 1]) assert.deepEqual(sampleEmissionPath2D(path, u), [100 * u, 0]);
  assert.deepEqual(sampleEmissionPath2D([[3, 4]], 0.7), [3, 4]);
  assert.deepEqual(sampleEmissionPath2D([[3, 4], [3, 4]], 1), [3, 4]);
  assert.deepEqual(sampleEmissionPath2D([[0, 0], [10, 0], [10, 10]], 0.75), [10, 5]);
  for (const [p, u] of [[[], 0], [[[0, NaN]], 0], [path, -0.01], [path, 1.01], [path, NaN]])
    assert.throws(() => sampleEmissionPath2D(p, u), RangeError);
});

test('no curl matches analytic drag/gravity and curl velocity matches the trajectory derivative', () => {
  for (const curl of [{ amplitude: 0, frequency: 1 }, { amplitude: 4, frequency: 0 }, base.curl]) {
    const emitter = createCinematicParticles2D({ ...base, count: 1, duration: 0, life: 2, gravity: 17, curl });
    const p = emitter.particles[0], t = 0.72, q = emitter.sample(t)[0], dt = 1e-5;
    const a = emitter.sample(t - dt)[0], b = emitter.sample(t + dt)[0];
    near((b.x - a.x) / (2 * dt), q.vx, 1e-6); near((b.y - a.y) / (2 * dt), q.vy, 1e-6);
    if (!curl.amplitude || !curl.frequency) {
      const xy = fly(p.x, p.y, p.vx, p.vy, q.age, 17, 0.8), v = flyV(p.vx, p.vy, q.age, 17, 0.8);
      near(q.x, xy[0]); near(q.y, xy[1]); near(q.vx, v[0]); near(q.vy, v[1]);
    }
    const atBirth = emitter.sample(p.born)[0];
    near(atBirth.x, p.x); near(atBirth.y, p.y); near(atBirth.vx, p.vx); near(atBirth.vy, p.vy);
    assert.equal(atBirth.alpha, 0);
  }
});

test('trails use actual curved motion, never pre-birth positions or per-sample light stacking', () => {
  const e = createCinematicParticles2D({ ...base, count: 1, duration: 0, life: 1, style: 'spark',
    size: 0.8, trailSeconds: 0.4, trailSamples: 12 });
  const paths = [], glows = [];
  e.draw({ path(points) { paths.push(points); }, poly() {}, circle() {}, dot() {}, glow(...args) { glows.push(args); } }, 0.35);
  assert.equal(paths.length, 1); assert.equal(glows.length, 1);
  const birth = e.particles[0], head = e.sample(0.35)[0], points = paths[0];
  assert.deepEqual(points[0], [birth.x, birth.y]);
  near(points.at(-1)[0], head.x); near(points.at(-1)[1], head.y);
  const mid = e.sample(birth.born + head.age * 5 / 11)[0];
  near(points[5][0], mid.x); near(points[5][1], mid.y);
});

test('ribbons have two tapered surface bands, not overlapping discs, and a bounded light budget', () => {
  const e = createCinematicParticles2D({ ...base, count: 1, duration: 0, life: 1, size: 5, endSize: 1 });
  const polygons = [], glows = []; let circles = 0;
  e.draw({ poly(points, color) { polygons.push({ points, color }); }, circle() { circles++; }, path() {}, dot() {},
    glow(...args) { glows.push(args); } }, 0.4);
  assert.equal(polygons.length, 2); assert.equal(circles, 0); assert.equal(glows.length, 1);
  assert.equal(polygons[0].points.length, 20);
  assert.deepEqual(polygons[0].points[0], polygons[0].points.at(-1));
  assert.notEqual(polygons[0].color, polygons[1].color);
  for (const polygon of polygons) assert.ok(polygon.points.flat().every(Number.isFinite));
});

test('two-sample ribbons retain their color silhouette without needing emission', () => {
  const e = createCinematicParticles2D({ ...base, count: 1, duration: 0, life: 1,
    size: 4, trailSamples: 2, emission: 0 });
  const frame = render(e, 0.4);
  assert.ok(frame.color.filter(Boolean).length > 4);
  assert.ok(frame.light.every(c => c === 0));
});

test('rendering is seekable, honors layers and transforms, and cannot mutate caller inputs', () => {
  const palette = [...base.palette], source = [2, 3], curl = { ...base.curl };
  const e = createCinematicParticles2D({ ...base, palette, source, curl, layer: 'back' });
  const frame = render(e, 0.8), states = e.sample(0.8);
  assert.ok(frame.color.some(Boolean)); assert.ok(frame.light.some(Boolean));
  assert.deepEqual(render(e, 0.8, 'back'), frame);
  assert.ok(render(e, 0.8, 'front').color.every(c => c === 0));
  assert.notDeepEqual(render(e, 0.8, 'back', true).color, frame.color);
  palette[0] = '#000'; source[0] = curl.amplitude = 10000; e.sample(0.8)[0].x = 10000;
  assert.deepEqual(e.sample(0.8), states); assert.deepEqual(render(e, 0.8), frame);
  const painter = new Painter(createFrame(160, 120)).place(80, 70, true, 0.3);
  const keys = ['tx', 'ty', 'fx', 'cs', 'sn', 'fade', 'lightK'], before = keys.map(k => painter[k]);
  e.draw(painter, 0.8); assert.deepEqual(keys.map(k => painter[k]), before);
});

test('empty emitters, soft births and exact deaths draw nothing in both buffers', () => {
  const empty = createCinematicParticles2D({ ...base, count: 0 });
  assert.equal(empty.end, base.start); assert.deepEqual(empty.sample(0.5), []);
  const e = createCinematicParticles2D({ ...base, count: 1, duration: 0, life: 1 });
  for (const t of [-10, 0.2, e.end, e.end + 1]) {
    const frame = render(e, t); assert.ok(frame.color.every(c => !c)); assert.ok(frame.light.every(c => !c));
  }
  assert.ok(e.sample(0.20001)[0].alpha < 1e-5);
  assert.ok(e.sample(e.end - 0.00001)[0].alpha < 1e-5);
});

test('validation bounds unsafe inputs including empty emitter constants', () => {
  for (const bad of [{ count: -1 }, { count: 8193 }, { count: 1.1 }, { palette: [] }, { palette: ['orange'] },
    { palette: [NaN] }, { palette: [2 ** 32] }, { duration: -1 }, { life: [1, 0.5] }, { life: 0 },
    { source: [NaN, 0] }, { count: 0, source: [Infinity, 0] }, { source: () => [0, NaN] },
    { inheritedVelocity: [0, Infinity] }, { seed: NaN }, { speed: -1 }, { size: -1 }, { drag: -1 },
    { spread: 7 }, { opacity: 2 }, { attack: 1 }, { attack: 0.4, fadeStart: 0.3 }, { trailSamples: 65 },
    { trailSamples: 2.2 }, { trailSeconds: -1 }, { emission: -1 }, { lightRadius: 0 }, { style: 'smoke' },
    { layer: 'middle' }, { curl: { amplitude: -1, frequency: 1 } }, { curl: { amplitude: 1, frequency: 121 } }])
    assert.throws(() => createCinematicParticles2D({ ...base, ...bad }), RangeError, JSON.stringify(bad));
  const e = createCinematicParticles2D(base);
  assert.throws(() => e.sample(NaN), RangeError);
  assert.throws(() => e.draw({}, Infinity), RangeError);
  assert.throws(() => e.draw({}, 0.8, 'middle'), RangeError);
});
