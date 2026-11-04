import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEffect, renderFrames } from '../build-tools/tools/lib/fxlib.mjs';
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
    const effect = await loadEffect(id), render = renderFrames(effect, { options: { particleStyle: 'classic' } });
    assert.equal(render.n, expected.frames);
    assert.equal(hashFrames(render.frames), expected.hash);
  });
  if (expected.original) test(`${id} preserves animation outside its documented boundary repair`, async () => {
    const effect = await loadEffect(id), original = expected.original;
    if (original.size) {
      effect.meta = { ...effect.meta, size: original.size, origin: original.origin };
      effect.mod = { ...effect.mod, meta: effect.meta };
    }
    const render = renderFrames(effect, { options: { particleStyle: 'classic' } });
    assert.equal(hashFrames(render.frames.slice(0, original.frames)), original.hash, original.reason);
  });
}
