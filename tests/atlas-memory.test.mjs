import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasPageBuffer } from '../build/render/atlas-page.js';

test('growing atlas preserves straight RGBA, HDR, radiance and neutral occlusion across stride changes', () => {
  const page = new AtlasPageBuffer(63, { emission: true, radiance: true, occlusion: true });
  page.ensure(5, 3);
  assert.deepEqual([page.width, page.height], [8, 4]);
  for (let i = 0; i < 32; i++) {
    page.color.set([i, 255 - i, 91, i === 0 ? 0 : 127], i * 4);
    page.emission.set([i + .25, 3.5, 0], i * 3);
    page.radiance.set([0, i * 2, .5], i * 3);
    page.occlusion[i] = i / 32;
  }
  const original = { color: page.color.slice(), emission: page.emission.slice(),
    radiance: page.radiance.slice(), occlusion: page.occlusion.slice() };
  page.ensure(17, 9);
  assert.deepEqual([page.width, page.height], [32, 16]);
  for (let y = 0; y < page.height; y++) for (let x = 0; x < page.width; x++) {
    const dest = y * page.width + x, source = y * 8 + x, copied = x < 8 && y < 4;
    for (const [name, channels] of [['color', 4], ['emission', 3], ['radiance', 3], ['occlusion', 1]]) {
      for (let c = 0; c < channels; c++) assert.equal(page[name][dest * channels + c],
        copied ? original[name][source * channels + c] : name === 'occlusion' ? 1 : 0, `${name} at ${x},${y}`);
    }
  }
  const buffers = [page.color, page.emission, page.radiance, page.occlusion];
  page.ensure(20, 10);
  assert.ok(buffers.every((buffer, i) => buffer === [page.color, page.emission, page.radiance, page.occlusion][i]), 'no copies while capacity fits');
  page.ensure(63, 63);
  assert.deepEqual([page.width, page.height], [63, 63], 'non-power-of-two page limits remain usable');
  assert.equal(page.occlusion[62 * 63 + 62], 1);
});

test('small atlas frames allocate used capacity instead of a full maximum-size page', () => {
  const twoD = new AtlasPageBuffer(2048, { emission: true });
  const threeD = new AtlasPageBuffer(4096, { emission: true, radiance: true, occlusion: true });
  assert.equal(twoD.byteLength, 0);
  twoD.ensure(34, 34); threeD.ensure(34, 34);
  assert.equal(twoD.byteLength, 64 * 64 * 16);
  assert.equal(threeD.byteLength, 64 * 64 * 32);
  assert.equal((2048 * 2048 * 16) / twoD.byteLength, 1024);
  const before = twoD.color;
  assert.throws(() => twoD.ensure(2049, 1), /limit/);
  assert.equal(twoD.color, before, 'invalid growth keeps the current page intact');
  assert.equal(twoD.byteLength, 64 * 64 * 16);
});
