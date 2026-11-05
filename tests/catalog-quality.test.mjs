import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEffect, renderFrames } from '../build-tools/tools/lib/fxlib.mjs';
import { createFrame, createFx } from '../build/core/index.js';
import { renderLegacyPresentationFrames, legacyPresentationModule } from './helpers/legacy-presentation.mjs';
// Checkpoint 0e9a010, with the export-only fix. Reviewed bounds/lifetime corrections retain
// an original-crop or pre-correction prefix below, rather than silently replacing that evidence.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/catalog-classic.json', import.meta.url), 'utf8'));
const hashFrames = frames => {
  const hash = createHash('sha256');
  for (const frame of frames) { hash.update(frame.clear); hash.update(frame.light); }
  return hash.digest('hex');
};
for (const [id, expected] of Object.entries(fixtures)) {
  test(`classic mode matches the reviewed ${id} across all frames`, async () => {
    const effect = await loadEffect(id);
    // Energy-core is a pure shader whose quantized phases distinguish the old
    // accumulated .39999999999999997 timestamp from the canonical .4 boundary.
    const render = (id === 'scifi/energy-core' ? renderLegacyPresentationFrames : renderFrames)(effect,
      { diagnostics: true, options: { particleStyle: 'classic' } });
    assert.equal(render.n, expected.frames);
    assert.equal(hashFrames(render.frames), expected.hash);
  });
  if (expected.original) test(`${id} preserves animation outside its documented boundary repair`, async () => {
    const effect = await loadEffect(id), original = expected.original;
    if (original.size) {
      effect.meta = { ...effect.meta, size: original.size, origin: original.origin };
      effect.mod = { ...effect.mod, meta: effect.meta };
    }
    const render = renderFrames(effect, { diagnostics: true, options: { particleStyle: 'classic' } });
    assert.equal(hashFrames(render.frames.slice(0, original.frames)), original.hash, original.reason);
  });
}

test('canonical pure-effect phase boundaries are identical across host frame rates', async () => {
  const { mod, meta } = await loadEffect('scifi/energy-core');
  for (const end of [.2, .4, 1, 1.2, 1.4]) {
    let reference;
    for (const fps of [30, 60, 120, 144, 165]) {
      const fx = createFx(mod, { x: meta.origin[0], y: meta.origin[1], particleStyle: 'classic' });
      let elapsed = 0;
      while (elapsed < end - 1e-12) {
        const dt = Math.min(1 / fps, end - elapsed);
        fx.update(dt); elapsed += dt;
      }
      assert.equal(fx.t, end);
      const frame = createFrame(...meta.size); fx.draw(frame);
      if (reference) { assert.deepEqual(frame.color, reference.color); assert.deepEqual(frame.light, reference.light); }
      else reference = frame;
    }
  }
});

test('legacy artwork sampling changes only presentation, preserving real fixed simulation ticks', () => {
  let legacy = 0, updates = 0, seen;
  const module = { meta: { duration: 1 }, create: () => ({
    update(dt) { assert.equal(dt, 1 / 120); updates++; },
    draw(_p, time) { seen = time; },
  }) };
  const fx = createFx(legacyPresentationModule(module, () => legacy));
  for (let i = 0; i < 12; i++) { legacy += 1 / 30; fx.update(1 / 30); }
  fx.draw(createFrame(1, 1));
  assert.equal(fx.t, .4); assert.equal(fx.tick, 48); assert.equal(updates, 48);
  assert.equal(seen, .39999999999999997);
});
