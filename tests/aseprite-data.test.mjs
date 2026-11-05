import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { encodeSpriteRuns2D, importAsepriteSheet } from '../build-tools/tools/lib/aseprite-data.mjs';
import { createSpriteClip2D } from '../build/core/sprite-clip.js';

const fixture = name => readFileSync(new URL(`./fixtures/aseprite/${name}`, import.meta.url));
const sheet = fixture('rgba-sheet.png');
const schema = () => JSON.parse(fixture('array.json'));
const manifest = JSON.parse(fixture('manifest.json'));
const unpack = runs => {
  const out = [];
  for (let i = 0; i < runs.length; i += 2) for (let n = 0; n < runs[i]; n++) {
    const color = runs[i + 1];
    out.push(color & 255, color >>> 8 & 255, color >>> 16 & 255, color >>> 24);
  }
  return out;
};

// Independent, bit-at-a-time CRC and PNG byte builder for mutation/filter cases.
function chunk(name, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(name), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
function synthetic({ width = 1, height = 1, depth = 8, color = 6, interlace = 0, raw = Buffer.from([0, 10, 20, 30, 128]), before = [], after = [], split = false } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = depth; header[9] = color; header[12] = interlace;
  const compressed = deflateSync(raw), half = Math.floor(compressed.length / 2);
  const blocks = split ? [chunk('IDAT', compressed.subarray(0, half)), chunk('IDAT', compressed.subarray(half))] : [chunk('IDAT', compressed)];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...before, ...blocks, ...after, chunk('IEND')]);
}

test('independent RGBA sheet restores trim offsets, variable milliseconds, tags, and unsigned exact alpha', () => {
  const original = schema(), { data, warnings } = importAsepriteSheet(sheet, original);
  assert.equal(data.version, 1);
  assert.deepEqual([data.width, data.height, data.pivot], [4, 3, [2, 3]]);
  assert.deepEqual(data.frames.map(f => f.durationMs), [75, 180]);
  assert.deepEqual(data.tags, [{ name: 'burst', from: 0, to: 1, direction: 'pingpong_reverse', repeat: 3 }]);
  const expected0 = new Array(4 * 3 * 4).fill(0), expected1 = [...expected0];
  expected0.splice((1 * 4 + 1) * 4, 8, 255, 0, 0, 128, 0, 255, 0, 255);
  expected0.splice((2 * 4 + 1) * 4, 8, 10, 20, 30, 255, 10, 20, 30, 255);
  expected1.splice(0, 8, 0, 0, 255, 64, 37, 19, 211, 0);
  expected1.splice(4 * 4, 8, 12, 34, 56, 200, 90, 80, 70, 255);
  assert.deepEqual(unpack(data.frames[0].runs), expected0);
  assert.deepEqual(unpack(data.frames[1].runs), expected1, 'retain even RGB beneath zero alpha');
  const clip = createSpriteClip2D(data);
  assert.equal(clip.frameAt(0.074), 0);
  assert.equal(clip.frameAt(0.075), 1);
  assert.equal(clip.frameAt(0.255), -1);
  assert.deepEqual([...new Uint8Array(clip.framePixels(1).buffer)], expected1);
  assert.ok(data.frames[0].runs.some((value, i) => i % 2 && value > 0x7fffffff));
  assert.deepEqual(data.source.meta.layers, original.meta.layers);
  assert.match(warnings.join(' '), /already rendered\/flattened/);
  assert.deepEqual(original, schema(), 'input JSON stays unchanged');
  assert.deepEqual(encodeSpriteRuns2D(new Uint8Array([1, 2, 3, 4, 1, 2, 3, 4])), [2, 0x04030201]);
});

test('hash import preserves insertion order and explicit, metadata, then default pivot precedence', () => {
  const json = schema();
  json.frames = { 'z-last-name': json.frames[1], 'a-first-name': json.frames[0] };
  const explicit = importAsepriteSheet(sheet, json, { pivot: [1.5, -2] });
  assert.deepEqual(explicit.data.pivot, [1.5, -2]);
  assert.deepEqual(explicit.data.frames.map(f => f.durationMs), [180, 75]);
  assert.equal(explicit.data.source.frameFormat, 'hash');
  assert.deepEqual(importAsepriteSheet(sheet, json).data.pivot, [2, 3]);
  delete json.meta.pokuFx;
  const fallback = importAsepriteSheet(sheet, json);
  assert.deepEqual(fallback.data.pivot, [0, 0]);
  assert.match(fallback.warnings.join(' '), /No pivot.*top-left/);
  assert.throws(() => importAsepriteSheet(sheet, json, { pivot: [NaN, 2] }), /finite pixel/);
  for (const direction of ['forward', 'reverse', 'pingpong', 'pingpong_reverse']) {
    json.meta.frameTags[0].direction = direction;
    json.meta.frameTags[0].repeat = 0;
    assert.equal(importAsepriteSheet(sheet, json).data.tags[0].direction, direction);
  }
});

test('Pillow fixtures independently cover RGB, grayscale, gray-alpha, indexed depths, and tRNS', () => {
  assert.match(manifest.encoder, /^Pillow /);
  for (const [name, reference] of Object.entries(manifest.images)) {
    const decoded = decodePNG(fixture(`${name}.png`));
    assert.equal(decoded.width, reference.width, name);
    assert.equal(decoded.height, reference.height, name);
    assert.deepEqual([...decoded.rgba], reference.rgba, name);
  }
});

test('all five row filters decode exactly, consecutive IDAT works, and profiles are warned without transforms', () => {
  const width = 3, height = 5, stride = width * 4;
  const pixels = Buffer.from(Array.from({ length: stride * height }, (_, i) => (i * 53 + Math.floor(i / 4) * 11) % 256));
  const raw = Buffer.alloc((stride + 1) * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return [a, b, c][distances.indexOf(Math.min(...distances))];
  };
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = y;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][y];
      raw[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - predictor) & 255;
    }
  }
  const png = synthetic({ width, height, raw, split: true, before: [chunk('sRGB', Buffer.from([0]))] });
  const decoded = decodePNG(png);
  assert.deepEqual([...decoded.rgba], [...pixels]);
  assert.match(decoded.warnings.join(' '), /sRGB.*not transformed/);
});

test('PNG rejects damaged bytes, unsupported formats, invalid filters, palettes, and bounded inflation', () => {
  const badCRC = Buffer.from(sheet); badCRC[45] ^= 1;
  for (const [png, pattern] of [
    [Buffer.alloc(20), /signature/],
    [badCRC, /CRC mismatch/],
    [sheet.subarray(0, -3), /chunk length|Truncated/],
    [sheet.subarray(0, -12), /missing IEND/],
    [Buffer.concat([sheet, Buffer.from([0])]), /after PNG IEND/],
    [synthetic({ depth: 16 }), /16-bit PNG/],
    [synthetic({ interlace: 1 }), /Interlaced PNG/],
    [synthetic({ color: 0, depth: 4 }), /Unsupported PNG color/],
    [synthetic({ before: [chunk('acTL', Buffer.alloc(8))] }), /APNG/],
    [synthetic({ before: [chunk('ABCD')] }), /critical PNG chunk/],
    [synthetic({ width: 65536 }), /dimensions exceed/],
    [synthetic({ width: 4097, height: 4096 }), /dimensions exceed/],
    [synthetic({ raw: Buffer.from([5, 10, 20, 30, 128]) }), /row filter 5/],
    [synthetic({ raw: Buffer.alloc(10_000) }), /inflated data exceeds/],
    [synthetic({ raw: Buffer.from([0, 10]) }), /length does not match/],
    [synthetic({ color: 3, depth: 1, raw: Buffer.from([0, 0]) }), /missing.*palette/],
    [synthetic({ color: 3, depth: 1, raw: Buffer.from([0, 128]), before: [chunk('PLTE', Buffer.from([1, 2, 3]))] }), /palette index 1/],
    [synthetic({ before: [chunk('tRNS', Buffer.from([0]))] }), /tRNS transparency/],
    [synthetic({ after: [chunk('tEXt'), chunk('IDAT', Buffer.alloc(0))] }), /must be consecutive/],
  ]) assert.throws(() => decodePNG(png), pattern);
  const oversized = Buffer.from(sheet); oversized.writeUInt32BE(0x7fffffff, 8);
  assert.throws(() => decodePNG(oversized), /chunk length exceeds/);
});

test('Aseprite rejects rotation, invalid crop/trim bounds, incompatible canvas sizes, and allocation bombs', () => {
  const check = (change, pattern) => { const json = schema(); change(json); assert.throws(() => importAsepriteSheet(sheet, json), pattern); };
  check(j => { j.frames[0].rotated = true; }, /rotated.*not supported/);
  check(j => { j.frames[0].frame.x = 3; }, /exceeds PNG bounds/);
  check(j => { j.frames[0].spriteSourceSize.x = 3; }, /exceeds sourceSize/);
  check(j => { j.frames[0].spriteSourceSize.w = 1; }, /must match/);
  check(j => { delete j.frames[0].sourceSize; }, /trimmed but.*missing/);
  check(j => { j.frames[1].sourceSize.w = 5; }, /same sourceSize/);
  check(j => { j.frames[0].sourceSize = { w: 4096, h: 4096 }; }, /cell limit/);
  check(j => { j.frames[0].sourceSize.w = 4097; }, /1\.\.4096/);
  check(j => { j.frames = Array.from({ length: 4097 }, () => j.frames[0]); }, /1\.\.4096 frames/);
  check(j => { j.frames = []; }, /1\.\.4096 frames/);
  check(j => { j.meta.size.w = 5; }, /does not match the PNG/);
  check(j => { j.frames[0].frame.x = -1; }, /must be an integer/);
  assert.throws(() => importAsepriteSheet(sheet, null), /must be an object/);
});

test('Aseprite rejects invalid duration timelines, malformed tags, and invalid RGBA runs input', () => {
  const check = (change, pattern) => { const json = schema(); change(json); assert.throws(() => importAsepriteSheet(sheet, json), pattern); };
  for (const duration of [0, -1, NaN, Infinity, Number.MIN_VALUE, '75']) check(j => { j.frames[0].duration = duration; }, /positive finite/);
  check(j => { j.frames[0].duration = Number.MAX_VALUE; j.frames[1].duration = 1; }, /represented safely/);
  check(j => { j.frames[0].duration = Number.MAX_VALUE; j.frames[1].duration = Number.MAX_VALUE; }, /represented safely/);
  check(j => { j.meta.frameTags[0].direction = 'random'; }, /direction is unsupported/);
  check(j => { j.meta.frameTags[0].to = 2; }, /integer in/);
  check(j => { j.meta.frameTags[0].from = 1; j.meta.frameTags[0].to = 0; }, /integer in/);
  check(j => { j.meta.frameTags.push({ ...j.meta.frameTags[0] }); }, /unique nonempty/);
  check(j => { j.meta.frameTags[0].repeat = '2.5'; }, /repeat must be an integer/);
  check(j => { j.meta.frameTags[0].repeat = -1; }, /repeat must be an integer/);
  check(j => { j.meta.frameTags[0].repeat = Number.MAX_SAFE_INTEGER + 1; }, /repeat must be an integer/);
  assert.throws(() => encodeSpriteRuns2D(new Uint8Array(3)), /complete pixels/);
});
