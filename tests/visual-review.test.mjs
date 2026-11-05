import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
import { makeReviewEvidence, reviewIdentity, reviewSamples, reviewView, reviewTemplate,
  validateReviewRecord, requireVisualReview, writeReviewEvidence, sha256, serializeSharedJSON } from '../build-tools/tools/lib/visual-review.mjs';

const fixture = () => {
  const meta = { size: [8, 8], origin: [0, 0], duration: 1, fps: 4, loop: false, bg: 'black', options: {} };
  return { id: 'test/review-fixture', file: 'fixture.ts', meta, mod: { meta, draw(p, t) {
    p.rect(1, 1, 2, 2, t === 0.5 ? 0xffffffff : 0xff804020);
    p.rect(4, 2, 1, 1, 0x800000ff);
  } } };
};
function decode(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), blocks = [];
  for (let i = 8; i < png.length;) {
    const n = png.readUInt32BE(i);
    if (png.toString('ascii', i + 4, i + 8) === 'IDAT') blocks.push(png.subarray(i + 8, i + 8 + n));
    i += n + 12;
  }
  const bytes = inflateSync(Buffer.concat(blocks)), data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    assert.equal(bytes[y * (w * 4 + 1)], 1);
    for (let x = 0; x < w * 4; x++) data[y * w * 4 + x] = (bytes[y * (w * 4 + 1) + 1 + x] + (x >= 4 ? data[y * w * 4 + x - 4] : 0)) & 255;
  }
  return { w, h, data };
}
const explicitRecord = manifest => ({ ...reviewTemplate(manifest), reviewer: 'Automated test fixture, not an artwork review',
  reviewedAt: '2026-11-05T00:00:00Z', evidenceViewed: true, decision: 'ready', intent: 'Exercise the record validator only.',
  observations: { nativeAndZoom: 'Fixture marker retained.', silhouetteAndValues: 'Fixture mask present.',
    timing: 'Fixture frame sequence.', backgrounds: 'Fixture surfaces.' }, knownLimitations: 'No artwork was approved by this test.' });

test('evidence includes exact native and nearest 3x pixels, flash neighbours and complete playback without changing input', async () => {
  const fx = fixture(), result = renderFrames(fx), original = result.frames.map(f => f.clear.slice());
  const sheet = spriteSheet(fx, result, 'review-fixture'), { files, samples } = makeReviewEvidence(fx, result, sheet);
  assert.ok(samples.some(s => s.frame === 2 && s.reasons.includes('brightest')));
  assert.ok(samples.some(s => s.frame === 1 && s.reasons.includes('before-brightest')));
  assert.ok(samples.some(s => s.frame === 3 && s.reasons.includes('after-brightest')));
  const native = decode(files['scene-native.png']), enlarged = decode(files['scene-3x.png']);
  const pixel = (image, x, y) => [...image.data.subarray((y * image.w + x) * 4, (y * image.w + x) * 4 + 4)];
  assert.deepEqual(pixel(native, 8 + 1, 46 + 1), [32, 64, 128, 255]);
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++)
    assert.deepEqual(pixel(enlarged, 8 + 3 + dx, 46 + 3 + dy), [32, 64, 128, 255]);
  assert.match(files['playback.html'], /"n":5,"fps":4/);
  assert.match(files['playback.html'], /imageSmoothingEnabled=false/);
  assert.match(files['playback.html'], /let running=false/);
  // Execute the actual emitted controls in an isolated DOM/RAF harness; no artwork is approved.
  const elements = Object.fromEntries(['screen', 'frame', 'view', 'scale', 'play', 'repeat', 'time'].map(id => [id, {}]));
  Object.assign(elements.frame, { value: 0 }); Object.assign(elements.view, { value: 'scene' });
  Object.assign(elements.scale, { value: '3' }); elements.repeat.checked = false;
  const draws = [], pending = new Map(); let next = 0;
  elements.screen.getContext = () => ({ fillRect() {}, drawImage(...args) { draws.push(args); } });
  runInNewContext(files['playback.html'].match(/<script>([\s\S]*)<\/script>/)[1], {
    document: { getElementById: id => elements[id] }, Image: class { decode() { return Promise.resolve(); } },
    performance: { now: () => 0 }, requestAnimationFrame: fn => { pending.set(++next, fn); return next; },
    cancelAnimationFrame: id => pending.delete(id),
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(draws.length, 1); assert.equal(pending.size, 0); // Initially paused.
  elements.play.onclick(); elements.play.onclick(); elements.play.onclick();
  assert.equal(pending.size, 1); // Rapid pause/resume must not create a second playback chain.
  const step = time => { const [id, fn] = [...pending][0]; pending.delete(id); fn(time); };
  step(250); assert.equal(elements.frame.value, 1);
  step(1250); assert.equal(elements.frame.value, 4); assert.equal(pending.size, 0); // Stop on last.
  elements.repeat.checked = true; elements.play.onclick(); step(1500);
  assert.equal(elements.frame.value, 1); assert.equal(pending.size, 1);
  elements.frame.value = 3; elements.frame.oninput(); assert.equal(pending.size, 0); // Scrub pauses.
  result.frames.forEach((f, i) => assert.deepEqual(f.clear, original[i]));
  // The share command changes only the displayed scene background, never its exported PNG/JSON.
  assert.deepEqual(spriteSheet(fx, renderFrames(fx, { bg: 'none' }), 'review-fixture'), sheet);
});

test('value/silhouette/background views are diagnostic rather than automatic quality judgements', () => {
  const rgba = new Uint8ClampedArray([200, 30, 10, 128, 0, 255, 0, 255, 0, 0, 0, 0]);
  const before = rgba.slice(), raw = new Uint32Array([0, 0xff00ff00, 0]);
  const value = reviewView(rgba, 3, 'values');
  for (let i = 0; i < value.length; i += 4) assert.ok(value[i] === value[i + 1] && value[i] === value[i + 2]);
  const silhouette = reviewView(rgba, 3, 'silhouette', raw);
  assert.deepEqual([...silhouette.subarray(0, 4)], [28, 28, 28, 255]); // Glow-only cell excluded.
  assert.deepEqual([...silhouette.subarray(4, 8)], [245, 245, 245, 255]);
  assert.notDeepEqual(reviewView(rgba, 3, 'dark'), reviewView(rgba, 3, 'light'));
  assert.deepEqual(rgba, before);
  const frames = Array.from({ length: 40 }, (_, i) => ({ t: i / 20, clear: new Uint8ClampedArray([0, 0, 0, 0]) }));
  const picks = reviewSamples({ frames, contacts: [{ at: 0.65 }] });
  assert.ok(picks.some(s => s.frame === 13 && s.reasons.includes('authored-contact')));
});

test('share gate rejects missing, incomplete, needs-work, altered and stale evidence; only explicit matching records proceed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'poku-review-test-'));
  try {
    const fx = fixture(), result = renderFrames(fx), sheet = spriteSheet(fx, result, 'review-fixture');
    const identity = reviewIdentity(fx, result, sheet, 'fixture source');
    assert.equal(identity.pngSha256, sha256(sheet.png));
    assert.equal(identity.jsonSha256, sha256(JSON.stringify(sheet.json, null, 1)));
    const deliveredJSON = join(dir, 'asset.json');
    writeFileSync(deliveredJSON, serializeSharedJSON(sheet.json));
    assert.equal(identity.jsonSha256, sha256(readFileSync(deliveredJSON)));
    assert.throws(() => requireVisualReview(dir, identity), /No visual evidence/);
    const manifest = writeReviewEvidence(dir, fx, result, sheet, identity);
    assert.throws(() => requireVisualReview(dir, identity), /Explicit visual review missing/);
    assert.throws(() => validateReviewRecord(reviewTemplate(manifest), manifest), /explicitly confirm/);
    const record = explicitRecord(manifest);
    assert.throws(() => validateReviewRecord({ ...record, observations: {} }, manifest), /observations/);
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ ...record, decision: 'needs-work' }));
    assert.throws(() => requireVisualReview(dir, identity), /needs-work/);
    writeFileSync(join(dir, 'review.json'), JSON.stringify(record));
    assert.deepEqual(requireVisualReview(dir, identity), record);
    assert.throws(() => requireVisualReview(dir, reviewIdentity(fx, result, sheet, 'changed source')), /changed/);
    const changed = { ...sheet, json: structuredClone(sheet.json) };
    changed.json.meta.pokuFx.pivot = [3, 7];
    assert.notEqual(reviewIdentity(fx, result, changed, 'fixture source').fingerprint, identity.fingerprint);
    const old = result.frames[0].color[0]; result.frames[0].color[0] ^= 255;
    assert.notEqual(reviewIdentity(fx, result, sheet, 'fixture source').fingerprint, identity.fingerprint);
    result.frames[0].color[0] = old;
    writeFileSync(join(dir, 'scene-native.png'), Buffer.from('not the reviewed image'));
    assert.throws(() => requireVisualReview(dir, identity), /Missing or changed visual evidence/);
    assert.ok(readFileSync(join(dir, 'review-template.json'), 'utf8').includes('"evidenceViewed": false'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
