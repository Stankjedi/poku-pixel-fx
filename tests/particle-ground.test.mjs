import test from 'node:test';
import assert from 'node:assert/strict';
import { Particles, P, GRAVITY } from '../build/core/sim.js';
import { integrateMotion2D } from '../build/core/particles.js';

const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const dt = 1 / 120;

test('sparks collide with rising ground instead of permanently falling below it', () => {
  for (const direction of [-1, 1]) {
    const ground = x => -x * direction, ps = new Particles({ ground, seed: 1 });
    ps.spawn(P.SPARK, 0, -0.1, 120 * direction, 10, 2);
    const p = ps.list[0];
    ps.update(dt);
    assert.ok(Math.abs(p.x) < 0.1, 'clip at the intersection, not the full-step endpoint');
    close(p.y, ground(p.x) - 0.25);
    assert.equal(p.trailAge, 0);
    assert.ok(-direction * p.vx - p.vy > 0, 'reflection points away from the surface');
    for (let i = 0; i < 100; i++) {
      ps.update(dt);
      assert.ok(p.y <= ground(p.x), `spark penetrated ground at step ${i}`);
    }
  }
});

test('relative terrain crossing catches an upward-moving spark approaching a steeper slope', () => {
  const ground = x => -2 * x, ps = new Particles({ ground });
  ps.spawn(P.SPARK, 0, -0.1, 100, -20, 1);
  ps.update(dt);
  const p = ps.list[0];
  assert.equal(p.trailAge, 0, 'a terrain collision does not require positive screen-y velocity');
  close(p.y, ground(p.x) - 0.25);
  assert.ok(-2 * p.vx - p.vy > 0);
});

test('downhill ground does not bounce a spark against the old x floor', () => {
  const ground = x => 2 * x, ps = new Particles({ ground });
  ps.spawn(P.SPARK, 0, -0.1, 120, 30, 1);
  const expected = { x: 0, y: -0.1, vx: 120, vy: 30 };
  integrateMotion2D(expected, dt, 0, GRAVITY * 0.45, 2.2);
  assert.ok(expected.y > 0 && expected.y < ground(expected.x));
  ps.update(dt);
  for (const key of ['x', 'y', 'vx', 'vy']) close(ps.list[0][key], expected[key]);
  close(ps.list[0].trailAge, dt);
});

test('brand landing callback lies on both the analytic flight and terrain and fires once', () => {
  const ground = x => -x, hits = [], ps = new Particles({ ground, seed: 1, onLand: (x, y) => hits.push([x, y]) });
  ps.spawn(P.BRAND, 0, -0.1, 120, 10, 2);
  ps.update(dt);
  assert.equal(hits.length, 1);
  const [x, y] = hits[0], time = -Math.log1p(-x * 0.9 / 120) / 0.9;
  assert.ok(time > 0 && time < dt);
  close(y, ground(x));
  close(y, -0.1 + 10 * time + 0.5 * GRAVITY * 0.8 * time * time);
  assert.ok(!ps.list.some(p => p.k === P.BRAND));
  for (let i = 0; i < 20; i++) ps.update(dt);
  assert.equal(hits.length, 1);
});

test('low-speed grit settles at the sloped contact and remains above terrain', () => {
  const ground = x => -x, ps = new Particles({ ground, seed: 1 });
  ps.spawn(P.GRIT, 0, -0.1, 120, 10, 2);
  ps.update(dt);
  const p = ps.list[0];
  close(p.y, ground(p.x) - 0.25);
  assert.equal(p.vx, 0); assert.equal(p.vy, 0); assert.equal(p.life, 0.5);
  for (let i = 0; i < 30; i++) { ps.update(dt); assert.ok(p.y <= ground(p.x)); }
});

test('slope bounce trails restart at contact without rewinding through the terrain', () => {
  const ground = x => -x, ps = new Particles({ ground });
  ps.spawn(P.SPARK, 0, -0.1, 120, 10, 1);
  let trail;
  const painter = { path(points) { trail = points; }, dot(x, y) { trail = [[x, y]]; }, glow() {} };
  ps.update(dt); ps.draw(painter);
  assert.equal(trail.length, 1);
  const contact = trail[0].slice();
  ps.update(dt); ps.draw(painter);
  close(trail[0][0], contact[0]); close(trail[0][1], contact[1]);
  assert.ok(trail.every(([x, y]) => y <= ground(x)));
});

test('curved ground contact follows the trajectory rather than a line between step endpoints', () => {
  const ground = x => -0.3 * x - 0.04 * x * x, hits = [];
  const ps = new Particles({ ground, onLand: (x, y) => hits.push([x, y]) });
  ps.spawn(P.BRAND, 0, -0.1, 120, 10, 1);
  ps.update(dt);
  assert.equal(hits.length, 1);
  const [x, y] = hits[0], time = -Math.log1p(-x * 0.9 / 120) / 0.9;
  close(y, ground(x));
  close(y, -0.1 + 10 * time + 0.5 * GRAVITY * 0.8 * time * time);
});

test('flat-floor spark response keeps the original full-step bounce exactly', () => {
  for (const floor of [-4, 0, 17]) {
    const ps = new Particles({ ground: () => floor });
    ps.spawn(P.SPARK, 0, floor - 0.1, 120, 40, 2);
    const expected = { x: 0, y: floor - 0.1, vx: 120, vy: 40 };
    integrateMotion2D(expected, dt, 0, GRAVITY * 0.45, 2.2);
    expected.vy = -expected.vy * 0.45; expected.vx *= 0.7; expected.y = floor - 0.25;
    ps.update(dt);
    for (const key of ['x', 'y', 'vx', 'vy']) assert.equal(ps.list[0][key], expected[key]);
    assert.equal(ps.list[0].trailAge, 0);
  }
});

test('delayed particles do not contact the ground before birth and use only their live step', () => {
  const ground = x => -x, delayed = new Particles({ ground }), immediate = new Particles({ ground });
  delayed.spawn(P.SPARK, 0, -0.1, 120, 10, 1, '#fff', 1, dt * 0.75);
  immediate.spawn(P.SPARK, 0, -0.1, 120, 10, 1);
  delayed.update(dt * 0.5);
  assert.equal(delayed.list[0].x, 0); assert.equal(delayed.list[0].trailAge, 0);
  delayed.update(dt * 0.5); immediate.update(dt * 0.25);
  for (const key of ['x', 'y', 'vx', 'vy', 'life', 'trailAge']) close(delayed.list[0][key], immediate.list[0][key]);
});
