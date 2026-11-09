import test from 'node:test';
import assert from 'node:assert/strict';
import { createKineticBody2D, createFrame, Painter } from '../build/core/index.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';

const palette = ['#fff1ac', '#ffb238', '#f76a19', '#b93316', '#57151b'];
const state = { time: 0.9, position: [0, 0], size: [28, 24], progress: 0.4 };
function render(body, patch = {}) {
  const f = createFrame(160, 160), p = new Painter(f).place(80, 80);
  body.draw(p, { ...state, ...patch }); return f;
}

test('kinetic primary forms are deterministic, seeded, bounded and light-independent', () => {
  for (const material of ['fire', 'energy']) for (const profile of ['stream', 'burst', 'plume']) {
    const body = createKineticBody2D({ seed: 17, material, profile, palette }), before = render(body);
    assert.ok(before.color.filter(c => c >>> 24).length > 200);
    render(body, { time: 5, progress: 0.9 }); render(body, { time: 0.1, progress: 0.1 });
    assert.deepEqual(render(body), before);
    assert.ok(before.light.every(c => c === 0), 'primary matter cannot silently increase bloom');
    assert.notDeepEqual(render(createKineticBody2D({ seed: 18, material, profile, palette })).color, before.color);
    for (const angle of [0, 0.3, Math.PI / 2]) {
      const f = render(body, { angle });
      for (let i = 0; i < 160; i++) for (const index of [i, i * 160, 159 * 160 + i, i * 160 + 159]) assert.equal(f.color[index], 0);
    }
    assert.ok(render(body, { opacity: 0 }).color.every(c => c === 0));
  }
});

test('material changes actual primary form even with the same palette and no detail/light', () => {
  for (const action of ['dash', 'burst', 'plume']) {
    const frames = ['fire', 'energy'].map(material => {
      const mod = createGeneratedEffect2D(createGenerationPlan2D({ material, action, seed: 17 }));
      const impl = mod.create({ seed: 17, palette, layers: { trail: false, sparks: false, light: false, residue: false } });
      const f = createFrame(...mod.meta.size), p = new Painter(f).place(...mod.meta.origin);
      impl.drawBack(p, action === 'burst' ? 0.4 : 0.9); impl.draw(p, action === 'burst' ? 0.4 : 0.9); return f;
    });
    assert.notDeepEqual(frames[0].color, frames[1].color, `${action}: material must not be a palette-only alias`);
  }
});

test('primary supports evolve and plume roots remain wider than their crown', () => {
  for (const profile of ['stream', 'burst', 'plume']) {
    const body = createKineticBody2D({ seed: 8, material: 'fire', profile, palette });
    assert.notDeepEqual(body.sample(state).lobes, body.sample({ ...state, time: 1.2, progress: 0.8 }).lobes);
  }
  const body = createKineticBody2D({ seed: 17, material: 'energy', profile: 'plume', palette });
  const f = render(body, { size: [28, 24] });
  const widthAt = x => Array.from({ length: f.h }, (_, y) => f.color[y * f.w + x] >>> 24).filter(Boolean).length;
  assert.ok(widthAt(80 - 18) > widthAt(80 + 16) * 1.5, 'a rooted plume cannot become a rotated round projectile');
  for (let y = 0; y < f.h; y++) assert.equal(f.color[y * f.w + 50], 0, 'root ends at its fixed source plane');
});

test('burst carries connected central mass through expansion rather than only radial spokes', () => {
  for (const seed of [0, 7, 17, 0xffffffff]) for (const material of ['fire', 'energy']) {
    const body = createKineticBody2D({ seed, material, profile: 'burst', palette });
    for (const progress of [0.15, 0.4, 0.7]) {
      const f = render(body, { progress }), center = f.color[80 * f.w + 80];
      assert.ok(center >>> 24);
      let occupied = 0;
      for (let y = 68; y < 92; y++) for (let x = 68; x < 92; x++) if (f.color[y * f.w + x] >>> 24) occupied++;
      assert.ok(occupied > 24 * 24 * 0.9);
    }
  }
});

test('palettes and sample outputs cannot mutate a body; packed alpha and fades are preserved', () => {
  const colors = [...palette], body = createKineticBody2D({ material: 'fire', profile: 'burst', palette: colors });
  const before = render(body); colors.fill('#000'); const sample = body.sample(state); sample.position[0] = 500;
  sample.lobes.pop(); assert.deepEqual(render(body), before);
  const transparent = createKineticBody2D({ material: 'fire', profile: 'stream', palette: [0x00112233] });
  assert.ok(render(transparent).color.every(c => (c >>> 24) === 0));
  const faded = render(body, { opacity: 0.25 }); assert.ok(faded.color.every(c => (c >>> 24) <= 64));
});

test('malformed and overflowing primary-form controls reject explicitly', () => {
  const base = { material: 'fire', profile: 'stream', palette };
  for (const patch of [{ seed: -1 }, { material: 'smoke' }, { profile: 'unknown' }, { palette: [] }, { palette: ['not-a-color'] }])
    assert.throws(() => createKineticBody2D({ ...base, ...patch }), RangeError);
  const body = createKineticBody2D(base);
  for (const patch of [{ time: NaN }, { time: 1e308 }, { size: [0, 20] }, { size: [513, 20] }, { size: [20, Infinity] },
    { position: [NaN, 0] }, { angle: null }, { opacity: -1 }, { progress: 2 }]) assert.throws(() => render(body, patch), RangeError);
});
