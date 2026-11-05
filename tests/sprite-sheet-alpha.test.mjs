import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { canvas, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
import { createFrame, createFx, composite } from '../build/core/index.js';
import * as smoke from '../build/fx/weather/rising-smoke.js';

// Decode the actual PNG bytes emitted by this repository's Sub-filter encoder.
function decode(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), blocks = [];
  for (let offset = 8; offset < png.length;) {
    const n = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') blocks.push(png.subarray(offset + 8, offset + 8 + n));
    offset += n + 12;
  }
  const raw = inflateSync(Buffer.concat(blocks)), rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (w * 4 + 1)], 1);
    for (let x = 0; x < w * 4; x++) rgba[y * w * 4 + x] = (raw[y * (w * 4 + 1) + 1 + x]
      + (x < 4 ? 0 : rgba[y * w * 4 + x - 4])) & 255;
  }
  return { w, h, rgba };
}

test('transparent canvas stores straight RGBA and overlapping coverage uses source-over alpha', () => {
  const c = canvas(1, 1, [0, 0, 0, 0]), red = new Uint8ClampedArray([255, 0, 0, 128]);
  c.paste(red, 1, 1, 0, 0);
  assert.deepEqual([...c.data], [255, 0, 0, 128], 'regression: old export incorrectly stored [128,0,0,128]');
  c.paste(new Uint8ClampedArray([0, 0, 255, 128]), 1, 1, 0, 0);
  assert.deepEqual([...c.data], [85, 0, 170, 192]);
  const before = c.data.slice();
  c.paste(new Uint8ClampedArray([200, 99, 31, 0]), 1, 1, 0, 0);
  assert.deepEqual(c.data, before, 'zero-alpha source leaves the destination untouched');
  assert.deepEqual([...red], [255, 0, 0, 128], 'source buffer remains unchanged');
});

test('opaque contact-sheet composition stays byte-identical for every alpha byte and clipping', () => {
  const c = canvas(256, 1, [37, 49, 93, 255]), source = new Uint8ClampedArray(258 * 4);
  for (let i = 0; i < 258; i++) source.set([i * 19 % 256, i * 71 % 256, i * 43 % 256, Math.max(0, Math.min(255, i - 1))], i * 4);
  const expected = c.data.slice();
  for (let x = 0; x < 256; x++) {
    const s = (x + 1) * 4, d = x * 4, a = source[s + 3] / 255;
    for (let channel = 0; channel < 3; channel++) expected[d + channel] = source[s + channel] * a + expected[d + channel] * (1 - a);
  }
  c.paste(source, 258, 1, -1, 0);
  assert.deepEqual(c.data, expected);
});

test('actual sprite-sheet PNG preserves translucent smoke pixels, placement and metadata', () => {
  const [w, h] = smoke.meta.size, [x, y] = smoke.meta.origin;
  const frame = createFrame(w, h), fx = createFx(smoke, { x, y }); fx.update(1.2); fx.draw(frame);
  const clear = composite(frame, new Uint8ClampedArray(w * h * 4));
  const copy = clear.slice(), raw = frame.color.slice();
  const transparent = new Uint8ClampedArray(clear.length);
  const effect = { id: 'weather/rising-smoke', meta: smoke.meta, mod: smoke, file: 'fixture' };
  const sheet = spriteSheet(effect, { w, h, fps: 30, n: 2, frames: [
    { t: 1.2, color: clear, clear }, { t: 1.2 + 1 / 30, color: transparent, clear: transparent },
  ] }, 'smoke');
  const decoded = decode(sheet.png), rect = sheet.json.frames[0].frame;
  let translucent = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = (yy * w + xx) * 4, j = ((rect.y + yy) * decoded.w + rect.x + xx) * 4;
    assert.deepEqual(decoded.rgba.slice(j, j + 4), clear.slice(i, i + 4));
    if (clear[i + 3] > 0 && clear[i + 3] < 255) translucent++;
  }
  assert.ok(translucent > 1000, 'real smoke provides substantial partial-alpha coverage');
  assert.deepEqual(clear, copy); assert.deepEqual(frame.color, raw);
  assert.deepEqual(sheet.json.meta.pokuFx.frameSize, [w, h]);
  assert.deepEqual(sheet.json.meta.pokuFx.pivot, smoke.meta.origin);
  assert.equal(sheet.json.meta.pokuFx.fps, 30); assert.equal(sheet.json.meta.pokuFx.frames, 2);
});
