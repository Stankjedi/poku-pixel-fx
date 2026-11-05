import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, clearFrame, createFx, createAct, painterFor, composite, chain, STAND } from '../build/core/index.js';
import * as explosion from '../build/fx/explosions/small-explosion.js';
import * as charmed from '../build/fx/status/charmed.js';
import * as sleep from '../build/fx/status/sleep.js';
import * as haste from '../build/fx/status/haste.js';
import * as burning from '../build/fx/status/burning.js';
import * as curse from '../build/fx/shadow/curse.js';

const red = 0xff0000ff, blue = 0xffff0000, white = 0xffffffff;
const partitions = [60, 120, 144, 165].map(fps => Array(fps).fill(1 / fps));
const uneven = [];
for (let elapsed = 0, i = 0; elapsed < 1 - 1e-12; i++) {
  const dt = Math.min([.003, .021, .009, .052, .004][i % 5], 1 - elapsed);
  uneven.push(dt); elapsed += dt;
}
partitions.push(uneven);
const hdrFrame = (w, h, x = 0, y = 0) => {
  const frame = createFrame(w, h, x, y);
  frame.hdrLight = new Float32Array(w * h * 3);
  return frame;
};
const sameBuffers = (a, b) => {
  assert.deepEqual(a.color, b.color, 'straight-alpha color');
  assert.deepEqual(a.light, b.light, 'packed light');
  assert.deepEqual(a.hdrLight, b.hdrLight, 'linear HDR light');
};

test('2D simulation consumes only full 120 Hz ticks and preserves all catch-up time', () => {
  const steps = [];
  const fx = createFx({ meta: { duration: 20 }, update: dt => steps.push(dt), draw() {} });
  fx.update(1 / 240);
  assert.equal(fx.tick, 0); assert.equal(steps.length, 0);
  fx.update(1 / 240);
  assert.equal(fx.tick, 1); assert.equal(fx.simulatedTime, 1 / 120);
  fx.update(5);
  assert.equal(fx.tick, 601); assert.equal(steps.length, 601);
  assert.ok(steps.every(dt => dt === 1 / 120));
  const before = fx.t;
  for (const dt of [-1, NaN, Infinity]) assert.throws(() => fx.update(dt), RangeError);
  assert.equal(fx.t, before);
});

test('the same seeded explosion and chained cue render identically at 60/120/144/165 Hz and variable dt', () => {
  for (const mod of [explosion, {
    meta: { duration: 2 },
    create: chain([{ fx: explosion, t: .137, x: 3, y: -4 }]),
  }]) {
    let reference;
    for (const parts of partitions) {
      const fx = createFx(mod, { seed: 17, x: 90, y: 100 });
      for (const dt of parts) fx.update(dt);
      assert.equal(fx.tick, 120);
      assert.equal(fx.simulatedTime, 1);
      assert.ok(Math.abs(fx.t - 1) < 1e-12);
      const frame = hdrFrame(180, 160); fx.draw(frame);
      if (reference) sameBuffers(frame, reference);
      else { reference = frame; assert.ok(frame.color.some(Boolean)); }
    }
  }
});

test('ACT springs, contact debris, and ghost poses do not depend on host-frame boundaries', () => {
  const mod = {
    meta: { duration: 2, size: [160, 128], origin: [45, 90], actor: 2 },
    act: {
      poses: [[0, { ...STAND, ghost: 1 }], [2, { ...STAND, x: 12, ghost: 1 }]],
      target: { x: 55 },
      hits: [{ t: .137, stop: .047, push: 1.7, straw: 3 }, { t: .341, stop: .08, straw: 2 }],
      dust: [{ t: .053, x: 1, n: 4 }, { t: .463, x: 4, n: 3 }],
    },
    draw() {},
  };
  let reference;
  for (const parts of partitions) {
    const act = createAct(mod, { seed: 17, x: 45, y: 90 }), events = [];
    act.onHit = hit => events.push([hit.t, act.t]);
    for (const dt of parts) act.update(dt);
    const target = act.targets[0];
    const state = { theta: target.theta, omega: target.omega, clock: target.clock, flashT: target.flashT, straw: target.straw };
    const frame = hdrFrame(180, 128); act.draw(frame);
    assert.deepEqual(events, [[.137, .137], [.341, .341]]);
    if (reference) { assert.deepEqual(state, reference.state); sameBuffers(frame, reference.frame); }
    else reference = { state, frame };
  }
});

test('a host endpoint just before an ACT contact cannot apply its impulse to precontact time', () => {
  const mod = {
    meta: { duration: 1, size: [80, 80], origin: [0, 0] },
    act: { target: {}, hits: [{ t: .037, stop: .1, push: 2, straw: 1 }] },
    draw() {},
  };
  const whole = createAct(mod), split = createAct(mod), events = [];
  split.onHit = hit => events.push([hit.t, split.t]);
  const beforeContact = .037 - 5e-10;
  split.update(beforeContact);
  assert.deepEqual(events, [], 'a contact must wait for its authored time');
  assert.equal(split.targets[0].omega, 0);
  split.update(.2 - beforeContact); whole.update(.2);
  assert.deepEqual(events, [[.037, .037]]);
  for (const key of ['theta', 'omega', 'clock', 'flashT', 'straw'])
    assert.deepEqual(split.targets[0][key], whole.targets[0][key], key);
  assert.equal(split.targets[0].straw[0].age, .063);
});

test('onBody copies back and front once with straight alpha and preserves HDR energy outside the body', () => {
  const mod = {
    meta: { duration: 1, loop: true, size: [80, 80], origin: [40, 60], actor: 2 },
    act: { onBody: true, follow: 0, poses: [[0, STAND], [1, STAND]] },
    drawBack(p) { p.dot(20, -20, red, .5); p.light(24, -20, red, 2); },
    draw(p) { p.dot(20, -20, blue, .5); p.light(24, -20, white, 4); },
  };
  const options = { x: 50, y: 70 }, fx = createFx(mod, options), act = createAct(mod, options);
  const bare = hdrFrame(120, 100), hidden = hdrFrame(120, 100), shown = hdrFrame(120, 100);
  fx.draw(bare); act.draw(hidden, { body: false, target: false }); act.draw(shown, { target: false });
  const rgba = composite(shown, new Uint8ClampedArray(120 * 100 * 4), null), pixel = 50 * 120 + 70;
  assert.deepEqual([...rgba.subarray(pixel * 4, pixel * 4 + 4)], [85, 0, 170, 192]);
  assert.equal(shown.color[pixel], bare.color[pixel]); assert.equal(shown.color[pixel], hidden.color[pixel]);
  const lightPixel = 50 * 120 + 74;
  for (const frame of [bare, hidden, shown])
    assert.deepEqual([...frame.hdrLight.subarray(lightPixel * 3, lightPixel * 3 + 3)], [6, 4, 4]);
});

test('onBody world placement is invariant under translating both frame origin and actor', () => {
  for (const mod of [charmed, sleep, haste, burning]) {
    const a = createAct(mod, { seed: 17, x: 80, y: 95 }), b = createAct(mod, { seed: 17, x: 100, y: 105 });
    a.update(.5); b.update(.5);
    const f = hdrFrame(160, 128), shifted = hdrFrame(160, 128, 20, 10);
    a.draw(f); b.draw(shifted);
    sameBuffers(f, shifted);
  }
});

test('reused onBody scratch follows a changed output crop and retains complete light halos', () => {
  for (const mod of [charmed, sleep, haste, burning]) {
    const act = createAct(mod, { seed: 17, x: 110, y: 115 }); act.update(.5);
    const reference = hdrFrame(360, 280, -40, -40); act.draw(reference);
    for (const origin of [[0, 0], [20, 10], [-17, 13]]) {
      const cropped = hdrFrame(160, 128, ...origin); act.draw(cropped);
      for (let y = 0; y < cropped.h; y++) for (let x = 0; x < cropped.w; x++) {
        const i = y * cropped.w + x, j = (y + cropped.oy - reference.oy) * reference.w + x + cropped.ox - reference.ox;
        assert.equal(cropped.color[i], reference.color[j], `${mod.meta.name}: color at ${x},${y}`);
        assert.equal(cropped.light[i], reference.light[j], `${mod.meta.name}: light at ${x},${y}`);
        for (let channel = 0; channel < 3; channel++)
          assert.equal(cropped.hdrLight[i * 3 + channel], reference.hdrLight[j * 3 + channel]);
      }
    }
  }
});

// Independent original Bresenham oracle: do not clip or restart the endpoints.
function oldLine(p, sx, sy, ex, ey, color, alpha) {
  const dx = Math.abs(ex - sx), dy = -Math.abs(ey - sy), stepX = sx < ex ? 1 : -1, stepY = sy < ey ? 1 : -1;
  const n = Math.max(dx, -dy) || 1;
  let error = dx + dy, i = 0;
  for (;;) {
    const u = i++ / n; p.put(sx, sy, color(u), alpha(u));
    if (sx === ex && sy === ey) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; sx += stepX; }
    if (twice <= dx) { error += dx; sy += stepY; }
  }
}

test('clipped thin lines preserve Bresenham ties, reversed octants and original gradient u', () => {
  const gradient = u => (0xff000000 | Math.round(u * 255) << 16 | Math.round((1 - u) * 255) << 8 | 255) >>> 0;
  const alpha = u => .3 + .6 * u;
  for (const [x, y] of [[130, 79], [79, 130], [-130, 79], [-79, 130], [130, -79], [79, -130], [-130, -79], [-79, -130], [100, 50], [50, 100], [0, 0]]) {
    for (const reverse of [false, true]) for (const flip of [false, true]) {
      const frame = createFrame(32, 32, -7, 11), reference = createFrame(32, 32, -7, 11);
      const p = painterFor(frame).place(9, 23, flip, .17), q = painterFor(reference).place(9, 23, flip, .17);
      const [a, b] = reverse ? [[x, y], [-x, -y]] : [[-x, -y], [x, y]];
      p.line(...a, ...b, gradient, alpha);
      oldLine(q, q.cellX(...a), q.cellY(...a), q.cellX(...b), q.cellY(...b), gradient, alpha);
      assert.deepEqual(frame.color, reference.color);
    }
  }
});

test('a 200,000-pixel offscreen line visits only the 32 visible cells, including the thin path fast path', () => {
  const frame = createFrame(32, 32), p = painterFor(frame), original = p.put.bind(p);
  let writes = 0;
  p.put = (...args) => { writes++; return original(...args); };
  for (const draw of [() => p.line(-100000, 16, 100000, 16, white), () => p.path([[-100000, 16], [100000, 16]], white)]) {
    writes = 0; clearFrame(frame); draw();
    assert.equal(writes, 32); assert.equal(frame.color.filter(Boolean).length, 32);
  }
});

test('Curse keeps its one-shot deadline and clears color, packed light and HDR after the residue dissolve', () => {
  assert.equal(curse.meta.duration, 3.4);
  for (const seed of [2, 7, 9]) {
    const fx = createFx(curse, { seed, x: curse.meta.origin[0], y: curse.meta.origin[1] });
    fx.update(curse.meta.duration);
    const frame = hdrFrame(...curse.meta.size); fx.draw(frame);
    assert.ok(frame.color.every(c => (c >>> 24) === 0));
    assert.ok(frame.light.every(c => (c & 0xffffff) === 0));
    assert.ok(frame.hdrLight.every(c => c === 0));
  }
});
