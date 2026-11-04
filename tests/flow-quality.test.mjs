import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { flowMotion } from '../build/core/flow.js';
import { integrateMotion2D } from '../build/core/particles.js';
import { createFrame, painterFor, resolveOptions } from '../build/core/fx.js';
import * as plume from '../build/fx/fire/convection-plume.js';
import * as jet from '../build/fx/fire/flamethrower.js';
const close = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const initial = { x: 3, y: -8, vx: 22, vy: -47 };
const phases = [
  { duration: 0.45, ax: 16, ay: -105, drag: 1.6, dragY: 1.8 },
  { duration: Infinity, ax: 4, ay: -18, drag: 0.65, dragY: 1 },
];

test('flow carries position and velocity continuously from hot fuel to cooling smoke', () => {
  const before = flowMotion(initial, 0.45 - 1e-7, phases), at = flowMotion(initial, 0.45, phases);
  const after = flowMotion(initial, 0.45 + 1e-7, phases);
  for (const key of ['x', 'y', 'vx', 'vy']) { close(before[key], at[key], 1e-4); close(after[key], at[key], 1e-4); }
  close((after.x - before.x) / 2e-7, at.vx, 1e-4);
  close((after.y - before.y) / 2e-7, at.vy, 1e-4);
  const expected = { ...initial };
  integrateMotion2D(expected, .45, 16, -105, 1.6, 1.8);
  integrateMotion2D(expected, .8, 4, -18, .65, 1);
  const actual = flowMotion(initial, 1.25, phases);
  for (const key of Object.keys(initial)) close(actual[key], expected[key]);
});

test('flow sampling is pure, seekable, and stable near zero drag', () => {
  const state = Object.freeze({ ...initial });
  const spec = Object.freeze(phases.map(q => Object.freeze({ ...q })));
  const first = flowMotion(state, 1.1, spec);
  for (const t of [2, 0, .1, .45]) flowMotion(state, t, spec);
  assert.deepEqual(flowMotion(state, 1.1, spec), first);
  assert.deepEqual(state, initial);
  assert.deepEqual(flowMotion(initial, 0, phases), initial);
  const ballistic = flowMotion(initial, .7, [{ duration: Infinity, ay: -30 }]);
  const tiny = flowMotion(initial, .7, [{ duration: Infinity, ay: -30, drag: 1e-12 }]);
  for (const key of Object.keys(initial)) close(tiny[key], ballistic[key]);
});

test('flow phases compose, clamp finite timelines, and reject invalid inputs', () => {
  const one = flowMotion(initial, 1, [{ duration: Infinity, ay: -30, drag: 2 }]);
  const split = flowMotion(initial, 1, [{ duration: .2, ay: -30, drag: 2 }, { duration: .3, ay: -30, drag: 2 }, { duration: Infinity, ay: -30, drag: 2 }]);
  for (const key of Object.keys(initial)) close(one[key], split[key]);
  const bounded = [{ duration: .4, ay: -8 }];
  assert.deepEqual(flowMotion(initial, 1, bounded), flowMotion(initial, .4, bounded));
  assert.deepEqual(flowMotion(initial, 3, []), initial);
  for (const age of [-1, NaN, Infinity]) assert.throws(() => flowMotion(initial, age, phases), RangeError);
  for (const invalid of [[{ duration: 0 }], [{ duration: -1 }], [{ duration: NaN }],
    [{ duration: Infinity }, { duration: 1 }], [{ duration: 1, ax: NaN }]])
    assert.throws(() => flowMotion(initial, 0, invalid), RangeError);
  assert.throws(() => flowMotion({ ...initial, vx: NaN }, 0, phases), RangeError);
});

function shot(fx, t, opts = {}, padding = 0) {
  const [w,h] = fx.meta.size, frame = createFrame(w + padding * 2, h + padding * 2, -padding, -padding);
  const p = painterFor(frame); p.place(...fx.meta.origin, opts.flip ?? false, opts.angle ?? 0);
  fx.draw(p, t, resolveOptions(fx.meta, opts));
  return frame;
}
function hash(fx, opts = {}) {
  const h = createHash('sha256');
  for (const t of [0,.2,.55,.85,1.2,1.55]) {
    const f = shot(fx,t,opts); h.update(new Uint8Array(f.color.buffer)); h.update(new Uint8Array(f.light.buffer));
  }
  return h.digest('hex');
}
test('flamethrower classic transport preserves the pre-change color and light buffers', () => {
  assert.equal(hash(jet,{ flowStyle:'classic' }), '8cccc49ecead8416520ceafead5de5bdc27d094cc96c33b2705dacffc4531463');
  assert.notEqual(hash(jet), hash(jet,{ flowStyle:'classic' }));
});

test('plume loops exactly and remains deterministic under seeks, palettes, mirrors and rotation', () => {
  for (const opts of [{}, { seed: 7, palette: ['#112255','#44aaff','#ffffff'] }, { flip:true, angle:.3 }, { wind:-10, height:28 }]) {
    const first = shot(plume, 0, opts), end = shot(plume, plume.meta.duration, opts);
    assert.deepEqual(first.color, end.color); assert.deepEqual(first.light, end.light);
    const at = shot(plume, .82, opts); shot(plume, 1.5, opts);
    assert.deepEqual(shot(plume, .82, opts).color, at.color);
    assert.ok(at.color.some(c => c >>> 24), 'palette variation remains visible');
    assert.ok(at.color.some(c => (c >>> 24) > 0 && (c >>> 24) < 240), 'smoke preserves translucent coverage');
  }
  assert.notEqual(hash(plume), hash(plume,{ seed: 7 }));
});

test('updated fire effects stay inside color bounds across complete default and seed variants', () => {
  for (const fx of [plume, jet]) for (const seed of [fx.meta.options.seed,2,3,7]) {
    for (let i=0;i<fx.meta.duration*fx.meta.fps;i+=2) {
      const f=shot(fx,i/fx.meta.fps,{ seed },24), [w,h]=fx.meta.size;
      f.color.forEach((c,j) => {
        if (!(c >>> 24)) return;
        const x=j%f.w-24,y=Math.floor(j/f.w)-24;
        assert.ok(x>=0&&y>=0&&x<w&&y<h, `${fx.meta.name}, seed ${seed}, frame ${i}, pixel ${x},${y}`);
      });
    }
  }
});
