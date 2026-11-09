import test from 'node:test';
import assert from 'node:assert/strict';
import { createCinematicParticles2D, createKineticBody2D, createFrame, Painter } from '../build/core/index.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
const palette = ['#fff1ac', '#ffb238', '#f76a19', '#b93316', '#57151b'];
const near = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const base = { count: 30, palette, seed: 41, duration: .8, life: [.4, .9], speed: [30, 70], spread: .7 };

function renderParticles(e, t) {
  const f = createFrame(160, 120); e.draw(new Painter(f).place(80, 60), t); return f;
}
function renderScene(material, action, seed, layers) {
  const plan = createGenerationPlan2D({ material, action, seed });
  const mod = createGeneratedEffect2D(plan), impl = mod.create({ ...mod.meta.options, layers });
  return t => { const f = createFrame(...plan.size), p = new Painter(f).place(...plan.origin);
    impl.drawBack(p, t); impl.draw(p, t); return f; };
}

test('emission frames snapshot correlated position, direction and motion once at each birth', () => {
  const calls = [], position = [12, -8], direction = [0, -4], velocity = [9, 2];
  const e = createCinematicParticles2D({ ...base, emissionFrame: (t, id, u) => {
    calls.push([t, id, u]); return { position, direction, inheritedVelocity: velocity };
  } });
  assert.deepEqual(calls, e.particles.map(p => [p.born, p.id, p.u]));
  const previous = renderParticles(e, .6), particles = JSON.stringify(e.particles);
  position.fill(999); direction.fill(0); velocity.fill(999);
  renderParticles(e, .9); renderParticles(e, .2);
  assert.deepEqual(renderParticles(e, .6), previous); assert.equal(JSON.stringify(e.particles), particles);
  assert.equal(calls.length, base.count, 'draws and seeks must not invoke surface callbacks');
});

test('a constant emission frame matches legacy options without consuming more random values', () => {
  const legacy = createCinematicParticles2D({ ...base, source: [12, -8], inheritedVelocity: [9, 2], angle: -Math.PI / 2 });
  const frame = createCinematicParticles2D({ ...base, emissionFrame: () => ({ position: [12, -8], direction: [0, -10], inheritedVelocity: [9, 2] }) });
  assert.deepEqual(frame.particles, legacy.particles);
  for (const t of [0, .3, .7, 1.2, frame.end]) assert.deepEqual(renderParticles(frame, t), renderParticles(legacy, t));
  const unit = createCinematicParticles2D({ ...base, emissionFrame: () => ({ position: [12, -8], direction: [0, -1], inheritedVelocity: [9, 2] }) });
  assert.deepEqual(unit.particles, frame.particles, 'direction magnitude cannot change authored speed');
});

test('bad or ambiguous emission frames reject instead of silently losing position or direction', () => {
  const emissionFrame = () => ({ position: [0, 0], direction: [1, 0] });
  for (const patch of [{ source: [0, 0] }, { inheritedVelocity: [0, 0] }, { angle: 0 }, { emissionFrame: null }])
    assert.throws(() => createCinematicParticles2D({ ...base, emissionFrame, ...patch }), RangeError);
  for (const frame of [null, {}, { position: [NaN, 0], direction: [1, 0] }, { position: [0, 0], direction: [0, 0] },
    { position: [0, 0], direction: [Infinity, 0] }, { position: [0, 0], direction: [1, 0], inheritedVelocity: null }])
    assert.throws(() => createCinematicParticles2D({ ...base, emissionFrame: () => frame }), RangeError);
  let calls = 0; createCinematicParticles2D({ ...base, count: 0, emissionFrame: () => { calls++; throw Error(); } });
  assert.equal(calls, 0);
});

test('sampled kinetic exteriors agree with the actual material shader, not internal lobe seams', () => {
  let samples = 0;
  for (const material of ['fire', 'energy']) for (const profile of ['stream', 'burst', 'plume']) for (const seed of [0, 17, 0xffffffff]) {
    const body = createKineticBody2D({ material, profile, seed, palette });
    for (const time of [.15, .9, 1.7]) {
      const state = { time, position: [12, -18], size: [37, 13], progress: time / 2, angle: .43 };
      let shader; body.draw({ shade: (_a, _b, _c, _d, f) => { shader = f; } }, state);
      const painted = point => { const out = { c: 0, a: 0 }; shader(...point, out); return out.a > 0; };
      for (let i = 0; i < 32; i++) {
        const q = body.sampleSurface(state, i / 32), n = q.normal;
        assert.ok([...q.position, ...n, ...q.tangent].every(Number.isFinite));
        near(Math.hypot(...n), 1); near(Math.hypot(...q.tangent), 1); near(n[0] * q.tangent[0] + n[1] * q.tangent[1], 0);
        // At a close lobe seam a long normal step may enter the neighboring lobe.
        // Verify the local boundary with successively smaller pixel-space steps.
        assert.ok([.01, .001, .0001].some(e => painted(q.position.map((v, j) => v - n[j] * e))
          && !painted(q.position.map((v, j) => v + n[j] * e))), `${material}/${profile}/${seed}/${time}/${i}: local exterior`);
        samples++;
      }
    }
  }
  assert.equal(samples, 1728);
});

test('surface normals transform by inverse scale then rotation, while state/results stay independent', () => {
  const body = createKineticBody2D({ seed: 17, material: 'fire', profile: 'burst', palette });
  const state = { time: .4, position: [0, 0], size: [1, 1], progress: .3 };
  for (let i = 0; i < 32; i++) {
    const a = body.sampleSurface(state, i / 32), angle = .9, cs = Math.cos(angle), sn = Math.sin(angle);
    const nx = a.normal[0] / 40, ny = a.normal[1] / 10, length = Math.hypot(nx, ny);
    const b = body.sampleSurface({ ...state, position: [8, 12], size: [40, 10], angle }, i / 32);
    near(b.position[0], 8 + a.position[0] * 40 * cs - a.position[1] * 10 * sn);
    near(b.position[1], 12 + a.position[0] * 40 * sn + a.position[1] * 10 * cs);
    near(b.normal[0], (nx * cs - ny * sn) / length); near(b.normal[1], (nx * sn + ny * cs) / length);
  }
  const saved = body.sampleSurface(state, 0); assert.deepEqual(body.sampleSurface(state, 1), saved);
  const q = body.sampleSurface(state, 0); q.position.fill(999); q.normal.fill(0);
  body.sampleSurface({ ...state, time: 10 }, .8); assert.deepEqual(body.sampleSurface(state, 0), saved);
  for (const u of [-1, 1.01, NaN, null]) assert.throws(() => body.sampleSurface(state, u), RangeError);
  assert.throws(() => body.sampleSurface({ ...state, size: [0, 1] }, 0), RangeError);
  for (const size of [[1e-8, 30], [Number.MIN_VALUE, 20], [20, Number.MIN_VALUE]])
    assert.ok(body.sampleSurface({ ...state, size }, .2).normal.every(Number.isFinite));
});

test('new bursts expose outgoing matter beyond their primary body without extra light', () => {
  for (const material of ['fire', 'energy']) for (const seed of [5, 17, 41]) {
    const full = renderScene(material, 'burst', seed, { light: false, residue: false });
    const primary = renderScene(material, 'burst', seed, { light: false, residue: false, sparks: false, trail: false });
    for (const t of [.4, .55]) {
      const f = full(t), p = primary(t); let outside = 0;
      for (let i = 0; i < f.color.length; i++) if ((f.color[i] >>> 24) && !(p.color[i] >>> 24)) outside++;
      assert.ok(outside > 80, `${material}/${seed}/${t}: particles hidden inside body (${outside})`);
      assert.ok(f.light.every(c => c === 0));
    }
  }
});

test('outermost tracing does not skip thin lobes between coarse radial samples', () => {
  for (const [material, profile, seed, time, progress, u] of [
    ['fire', 'stream', 41, .9, .4, .546875],
    ['fire', 'stream', 5, 1.7, .7, .53125],
    ['energy', 'plume', 5, 0, 0, .0859375],
  ]) {
    const body = createKineticBody2D({ material, profile, seed, palette });
    const state = { time, progress, size: [1, 1], position: [0, 0] }, q = body.sampleSurface(state, u);
    let shader; body.draw({ shade: (_a, _b, _c, _d, f) => { shader = f; } }, state);
    const dx = Math.cos(u * Math.PI * 2), dy = Math.sin(u * Math.PI * 2);
    for (let r = Math.hypot(...q.position) + .001; r < 1.73; r += .001) {
      const out = { c: 0, a: 0 }; shader(dx * r, dy * r, out);
      assert.equal(out.a, 0, `${material}/${profile}/${seed}: missed exterior at ${r}`);
    }
  }
});
