import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeSpec, createRecipeEffect, retimeRecipeSpec, recipeParameters, recipePosition, RECIPE_KINDS } from '../build/authoring/recipes.js';
import { createTimingCurve } from '../build/core/timing-curve.js';
import { createFrame, createFx } from '../build/core/fx.js';

function draw(mod, time) {
  const frame = createFrame(...mod.meta.size), fx = createFx(mod, { seed: 13, x: mod.meta.origin[0], y: mod.meta.origin[1] });
  fx.update(time); fx.draw(frame); return frame;
}
for (const kind of RECIPE_KINDS) test(`whole-clip retiming preserves ${kind} native frames and contact chronology`, () => {
  const spec = createRecipeSpec(kind), original = createRecipeEffect(spec), retimed = retimeRecipeSpec(spec, spec.duration * 2), slower = createRecipeEffect(retimed);
  assert.equal(spec.timeScale, 1, 'retiming cannot mutate the original');
  assert.equal(retimed.timeScale, 2); assert.equal(slower.meta.duration, original.meta.duration * 2);
  for (const t of [.1, .35, .7, 1.1]) {
    if (t >= spec.duration) continue;
    const a = draw(original, t), b = draw(slower, t * 2);
    assert.deepEqual(a.color, b.color, `${kind} color at ${t}`); assert.deepEqual(a.light, b.light, `${kind} light at ${t}`);
  }
  assert.deepEqual(slower.contacts({}).map(c => c.at), original.contacts({}).map(c => c.at * 2));
  if (kind === 'thrown-blade') assert.deepEqual(recipePosition(retimed, 1), recipePosition(spec, .5));
  assert.deepEqual(draw(slower, retimed.duration).color, draw(original, spec.duration).color);
});

test('authored timing velocities and motion-unit slider ranges scale with presentation time', () => {
  const spec = createRecipeSpec('thrown-blade');
  spec.tracks.body = [{ time: 0, value: 0, velocity: 2 }, { time: 1, value: 1, velocity: -.3 }, { time: 2.2, value: 0, velocity: -.7 }];
  const retimed = retimeRecipeSpec(spec, 4.4), a = createTimingCurve(spec.tracks.body), b = createTimingCurve(retimed.tracks.body);
  for (const t of [.05, .37, .8, 1.7, 2.1]) {
    assert(Math.abs(a.sample(t).value - b.sample(t * 2).value) < 1e-12);
    assert(Math.abs(a.sample(t).velocity / 2 - b.sample(t * 2).velocity) < 1e-12);
  }
  const controls = Object.fromEntries(recipeParameters(retimed).map(p => [p.key, p]));
  assert.equal(controls.travel.max, 8); assert.equal(controls.spin.max, 4); assert.equal(controls.trail.max, .8);
  assert.equal(retimed.parameters.travel, spec.parameters.travel * 2); assert.equal(retimed.parameters.spin, spec.parameters.spin / 2);
  assert.deepEqual(retimeRecipeSpec(retimed, spec.duration), spec);
});

test('recipe controls expose only parameters consumed by their choreography', () => {
  assert.deepEqual(recipeParameters('portal').map(p => p.key), ['density', 'glow', 'palette']);
  assert.deepEqual(recipeParameters('ribbon-slash').map(p => p.key), ['width', 'density', 'glow', 'material', 'palette']);
  assert.equal(recipeParameters('thrown-blade').length, 8);
  assert.throws(() => retimeRecipeSpec(createRecipeSpec('portal'), 0), /duration/);
  assert.throws(() => createRecipeSpec('portal', { timeScale: -1 }), /time scale/);
});
