import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';

// Exercise the real browser TypeScript module with Node's standards-compatible web streams.
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../gallery/png-import.ts', import.meta.url))],
  bundle: true, platform: 'browser', target: 'es2022', format: 'esm', write: false, logLevel: 'silent' });
const { decodePixelArtPNG } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const fixture = name => readFileSync(new URL(`./fixtures/aseprite/${name}`, import.meta.url));
const manifest = JSON.parse(fixture('manifest.json'));
const adam7Fixture = name => readFileSync(new URL(`./fixtures/pixel-png/${name}`, import.meta.url));
const adam7Manifest = JSON.parse(adam7Fixture('manifest.json'));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function rgba(decoded) {
  assert.equal(decoded.kind, 'decoded');
  return [...decoded.pixels].flatMap(c => [c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24]);
}

// Independent bit-at-a-time CRC and test-stream builder, not the production writer.
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
function synthetic({ width = 1, height = 1, depth = 8, color = 6, interlace = 0,
  compression = 0, filter = 0, raw = Buffer.from([0, 10, 20, 30, 128]), before = [], after = [], split = false, compressed } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = depth; header[9] = color; header[10] = compression; header[11] = filter; header[12] = interlace;
  const data = compressed ?? deflateSync(raw), half = Math.floor(data.length / 2);
  const blocks = split ? [chunk('IDAT'), chunk('IDAT', data.subarray(0, half)), chunk('IDAT', data.subarray(half)), chunk('IDAT')] : [chunk('IDAT', data)];
  return Buffer.concat([signature, chunk('IHDR', header), ...before, ...blocks, ...after, chunk('IEND')]);
}

test('native browser PNG import preserves every straight RGB byte even at alpha 0 and 1', async () => {
  const alpha = [0, 1, 2, 3, 8, 64, 127, 128, 254, 255];
  const source = Uint8Array.from(alpha.flatMap((a, i) => [37 + i * 7, 211 - i * 13, 19 + i * 17, a]));
  const encoded = encodePNG(alpha.length, 1, source), original = Buffer.from(encoded);
  const decoded = await decodePixelArtPNG(encoded);
  assert.equal(decoded.w, alpha.length); assert.equal(decoded.h, 1);
  assert.deepEqual(rgba(decoded), [...source]);
  assert.deepEqual(encoded, original, 'the decoder never modifies the input file');
  assert.deepEqual(decoded.warnings, []);
  assert.equal(decoded.pixels[0] >>> 24, 0);
  assert.notEqual(decoded.pixels[0] & 0xffffff, 0, 'hidden RGB remains available to the project model');
});

test('independent Pillow fixtures decode RGB, grayscale, gray-alpha, indexed depths and transparency exactly', async () => {
  assert.match(manifest.encoder, /^Pillow /);
  for (const [name, reference] of Object.entries(manifest.images)) {
    const bytes = fixture(`${name}.png`), padded = new Uint8Array(bytes.length + 23);
    padded.set(bytes, 11);
    const decoded = await decodePixelArtPNG(padded.subarray(11, 11 + bytes.length));
    assert.deepEqual([decoded.w, decoded.h], [reference.width, reference.height], name);
    assert.deepEqual(rgba(decoded), reference.rgba, name);
  }
});

test('all five filters use the correct byte stride for grayscale, RGB, gray-alpha and RGBA', async () => {
  const predictor = (filter, a, b, c) => {
    if (filter < 4) return [0, a, b, Math.floor((a + b) / 2)][filter];
    const p = a + b - c, distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return [a, b, c][distances.indexOf(Math.min(...distances))];
  };
  for (const [color, channels] of [[0, 1], [2, 3], [4, 2], [6, 4]]) {
    const width = 5, height = 5, stride = width * channels;
    const samples = Buffer.from(Array.from({ length: stride * height }, (_, i) => (i * 71 + Math.floor(i / channels) * 19) % 256));
    const raw = Buffer.alloc((stride + 1) * height), expected = [];
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = y;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? samples[y * stride + x - channels] : 0;
        const b = y ? samples[(y - 1) * stride + x] : 0;
        const c = y && x >= channels ? samples[(y - 1) * stride + x - channels] : 0;
        raw[y * (stride + 1) + 1 + x] = (samples[y * stride + x] - predictor(y, a, b, c)) & 255;
      }
      for (let x = 0; x < width; x++) {
        const i = y * stride + x * channels;
        if (color === 0 || color === 4) expected.push(samples[i], samples[i], samples[i], color === 4 ? samples[i + 1] : 255);
        else expected.push(samples[i], samples[i + 1], samples[i + 2], color === 6 ? samples[i + 3] : 255);
      }
    }
    const decoded = await decodePixelArtPNG(synthetic({ width, height, color, raw, split: true }));
    assert.deepEqual(rgba(decoded), expected, `color type ${color}`);
  }
});

test('packed grayscale preserves sample scaling and tRNS keys use their declared bit depth', async () => {
  for (const [depth, packed, samples] of [
    [1, [0b01010000], [0, 1, 0, 1, 0]],
    [2, [0b00011011, 0b01000000], [0, 1, 2, 3, 1]],
    [4, [0x01, 0x7f, 0x30], [0, 1, 7, 15, 3]],
  ]) {
    const decoded = await decodePixelArtPNG(synthetic({ width: 5, depth, color: 0, raw: Buffer.from([0, ...packed]),
      before: [chunk('tRNS', Buffer.from([0xf0, 1]))] }));
    const expected = samples.flatMap(sample => { const gray = Math.round(sample * 255 / ((1 << depth) - 1)); return [gray, gray, gray, sample === 1 ? 0 : 255]; });
    assert.deepEqual(rgba(decoded), expected, `grayscale ${depth}-bit`);
  }
  const rgb = await decodePixelArtPNG(synthetic({ width: 2, color: 2, raw: Buffer.from([0, 31, 63, 127, 31, 63, 126]),
    before: [chunk('tRNS', Buffer.from([0x12, 31, 0x34, 63, 0x56, 127]))] }));
  assert.deepEqual(rgba(rgb), [31, 63, 127, 0, 31, 63, 126, 255], 'unused high tRNS bits are ignored as specified, without discarding hidden RGB');
});

test('indexed palette transparency defaults to opaque and ignores packed row padding', async () => {
  const palette = Buffer.from([31, 63, 127, 245, 177, 29]);
  const decoded = await decodePixelArtPNG(synthetic({ width: 3, color: 3, depth: 2, raw: Buffer.from([0, 0b00010011]),
    before: [chunk('PLTE', palette), chunk('tRNS', Buffer.from([1]))] }));
  assert.deepEqual(rgba(decoded), [31, 63, 127, 1, 245, 177, 29, 255, 31, 63, 127, 1]);
  const opaque = await decodePixelArtPNG(synthetic({ color: 3, depth: 1, raw: Buffer.from([0, 0]),
    before: [chunk('PLTE', palette), chunk('tRNS')] }));
  assert.deepEqual(rgba(opaque), [31, 63, 127, 255]);
});

test('profile metadata is reported while encoded RGB is retained unchanged', async () => {
  const gamma = Buffer.alloc(4); gamma.writeUInt32BE(45455);
  const decoded = await decodePixelArtPNG(synthetic({ before: [chunk('gAMA', gamma), chunk('sRGB', Buffer.from([0]))] }));
  assert.deepEqual(rgba(decoded), [10, 20, 30, 128]);
  assert.match(decoded.warnings.join(' '), /gAMA, sRGB.*not transformed.*straight/);
});

test('valid 16-bit inputs explicitly request fallback after complete data validation', async () => {
  const sixteen = await decodePixelArtPNG(synthetic({ depth: 16, raw: Buffer.from([0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x01, 0x02]) }));
  assert.deepEqual(sixteen, { kind: 'unsupported', w: 1, h: 1, reason: '16-bit', warnings: [] });
  const interlacedSixteen = await decodePixelArtPNG(synthetic({ depth: 16, interlace: 1,
    raw: Buffer.from([0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x01, 0x02]) }));
  assert.deepEqual(interlacedSixteen, sixteen);
  await assert.rejects(() => decodePixelArtPNG(synthetic({ depth: 16 })), /length does not match/);
  await assert.rejects(() => decodePixelArtPNG(synthetic({ interlace: 1, raw: Buffer.from([5, 10, 20, 30, 128]) })), /row filter 5/);
});

test('Adam7 reconstructs native RGBA positions without losing hidden or low-alpha color', async () => {
  // A 2×2 Adam7 image has rows in passes 1, 6 and 7, not seven full-size rows.
  const expected = [37, 211, 19, 0, 44, 198, 36, 1, 51, 185, 53, 2, 58, 172, 70, 128];
  const raw = Buffer.from([0, ...expected.slice(0, 4), 0, ...expected.slice(4, 8), 0, ...expected.slice(8)]);
  const interlaced = await decodePixelArtPNG(synthetic({ width: 2, height: 2, interlace: 1, raw }));
  assert.deepEqual(rgba(interlaced), expected);
  assert.deepEqual(interlaced.warnings, []);
  await assert.rejects(() => decodePixelArtPNG(synthetic({ width: 2, height: 2, interlace: 1,
    raw: Buffer.from([0, 37, 211, 19, 0, 0, 44, 198, 36, 1, 5, 51, 185, 53, 2, 58, 172, 70, 128]) })), /row filter 5/);
});

test('independently encoded Adam7 samples match Pillow for all supported color types and packed depths', async () => {
  assert.match(adam7Manifest.encoder, /ImageMagick/);
  assert.match(adam7Manifest.referenceDecoder, /^Pillow /);
  for (const [name, reference] of Object.entries(adam7Manifest.images)) {
    const bytes = adam7Fixture(`${name}.png`), original = Buffer.from(bytes);
    assert.equal(reference.interlace, 1, `${name}: external fixture must actually use Adam7`);
    const decoded = await decodePixelArtPNG(bytes);
    assert.deepEqual([decoded.w, decoded.h], [reference.width, reference.height], name);
    assert.deepEqual(rgba(decoded), reference.rgba, name);
    assert.deepEqual(bytes, original, `${name}: keep encoded source untouched`);
  }
  for (const depth of [1, 2, 4, 8]) {
    const indexed = adam7Manifest.images[`indexed-${depth}`], gray = adam7Manifest.images[`gray-${depth}`];
    assert.deepEqual([indexed.colorType, indexed.bitDepth], [3, depth]);
    assert.deepEqual([gray.colorType, gray.bitDepth], [0, depth]);
    assert.ok(indexed.rgba.some((value, i) => i % 4 === 3 && value === 1), `indexed ${depth}-bit needs tRNS alpha 1`);
    assert.ok(gray.rgba.some((value, i) => i % 4 === 3 && value === 0), `gray ${depth}-bit needs a transparent key`);
  }
});

test('Adam7 packed passes discard padding and validate palette indices in later passes', async () => {
  // Fixed 2×2 pass bytes make row-padding behavior independent of the decoder's pass loop.
  for (const [depth, raw, samples] of [
    [1, [0, 0xff, 0, 0x7f, 0, 0x7f], [1, 0, 0, 1]],
    [2, [0, 0xff, 0, 0x7f, 0, 0x2f], [3, 1, 0, 2]],
    [4, [0, 0x7f, 0, 0x3f, 0, 0x1f], [7, 3, 1, 15]],
  ]) {
    const decoded = await decodePixelArtPNG(synthetic({ width: 2, height: 2, depth, color: 0, interlace: 1,
      raw: Buffer.from(raw), before: [chunk('tRNS', Buffer.from([0xff, 1]))] }));
    assert.deepEqual(rgba(decoded), samples.flatMap(sample => {
      const gray = Math.round(sample * 255 / ((1 << depth) - 1));
      return [gray, gray, gray, sample === 1 ? 0 : 255];
    }), `gray ${depth}-bit`);
  }
  await assert.rejects(() => decodePixelArtPNG(synthetic({ width: 2, height: 2, depth: 1, color: 3, interlace: 1,
    raw: Buffer.from([0, 0, 0, 0, 0, 0x40]), before: [chunk('PLTE', Buffer.from([37, 211, 19]))] })), /palette index 1/);
});

test('corrupt or truncated PNG structure never becomes an unsupported fallback signal', async () => {
  const good = synthetic(), crc = Buffer.from(good); crc[29] ^= 1;
  const oversized = Buffer.from(good); oversized.writeUInt32BE(0x7fffffff, 8);
  const missingHeader = Buffer.concat([signature, chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, 4]))), chunk('IEND')]);
  for (const [png, error] of [
    [Buffer.alloc(20), /signature/], [crc, /CRC mismatch/], [oversized, /chunk length exceeds/],
    [good.subarray(0, -3), /Truncated|chunk length/], [good.subarray(0, -12), /missing IEND/],
    [Buffer.concat([good, Buffer.from([0])]), /after PNG IEND/], [missingHeader, /IHDR must be the first/],
    [synthetic({ before: [chunk('IHDR', Buffer.alloc(13))] }), /exactly one/],
    [synthetic({ before: [chunk('ABCD')] }), /critical PNG chunk/],
    [synthetic({ before: [chunk('abca')] }), /chunk type/],
    [synthetic({ before: [chunk('acTL', Buffer.alloc(8))] }), /APNG/],
    [synthetic({ after: [chunk('tEXt'), chunk('IDAT')] }), /consecutive/],
    [synthetic({ compression: 1 }), /compression or filter/], [synthetic({ filter: 1 }), /compression or filter/],
    [synthetic({ interlace: 2 }), /interlace method/], [synthetic({ color: 3, depth: 16 }), /color type.*bit depth/],
    [synthetic({ color: 2, depth: 4 }), /color type.*bit depth/],
  ]) await assert.rejects(() => decodePixelArtPNG(png), error);
});

test('PNG import enforces native dimensions and validates palette references and transparency', async () => {
  for (const [png, error] of [
    [synthetic({ width: 513 }), /1\.\.512/], [synthetic({ height: 0 }), /1\.\.512/],
    [synthetic({ color: 3, depth: 1, raw: Buffer.from([0, 0]) }), /missing.*palette/],
    [synthetic({ color: 3, depth: 1, raw: Buffer.from([0, 128]), before: [chunk('PLTE', Buffer.from([1, 2, 3]))] }), /palette index 1/],
    [synthetic({ color: 3, depth: 1, raw: Buffer.from([0, 0]), before: [chunk('PLTE', Buffer.alloc(9))] }), /palette size/],
    [synthetic({ color: 0, raw: Buffer.from([0, 1]), before: [chunk('PLTE', Buffer.from([1, 2, 3]))] }), /palette size/],
    [synthetic({ before: [chunk('tRNS', Buffer.from([0]))] }), /tRNS transparency/],
    [synthetic({ color: 0, raw: Buffer.from([0, 1]), before: [chunk('tRNS', Buffer.from([0, 1])), chunk('tRNS', Buffer.from([0, 1]))] }), /Duplicate/],
  ]) await assert.rejects(() => decodePixelArtPNG(png), error);
  const huge = new Uint8Array(16 * 1024 * 1024 + 1); huge.set(signature);
  await assert.rejects(() => decodePixelArtPNG(huge), /16 MiB/);
});

test('sprite-sheet limits are explicit and cannot weaken the still-image defaults', async () => {
  const width = 16_384, pixels = Uint8Array.from({ length: width * 4 }, (_, i) => (i * 71 + 13) % 256);
  const encoded = encodePNG(width, 1, pixels), limits = { maxDimension: width, maxPixels: width };
  await assert.rejects(() => decodePixelArtPNG(encoded), /1\.\.512/);
  const decoded = await decodePixelArtPNG(encoded, limits);
  assert.deepEqual(rgba(decoded), [...pixels]);
  assert.deepEqual(limits, { maxDimension: width, maxPixels: width });
  await assert.rejects(() => decodePixelArtPNG(encoded, { maxDimension: width - 1, maxPixels: width }), /1\.\.16383/);
  await assert.rejects(() => decodePixelArtPNG(encoded, { maxDimension: width, maxPixels: width - 1 }), /native pixel limit/);
  await assert.rejects(() => decodePixelArtPNG(synthetic({ width: 1024, height: 1024 }), { maxDimension: 1024 }), /262144 native pixel limit/);
  await assert.rejects(() => decodePixelArtPNG(encoded), /1\.\.512/, 'one larger import must not change subsequent defaults');
});

test('pixel, encoded-byte and filtered-byte budgets reject before decompression', async () => {
  const badZlib = Buffer.from([0, 1, 2]);
  await assert.rejects(() => decodePixelArtPNG(synthetic({ width: 512, height: 512, compressed: badZlib }), { maxPixels: 100 }), /100 native pixel limit/);
  await assert.rejects(() => decodePixelArtPNG(synthetic({ width: 2, height: 2, interlace: 1, compressed: badZlib }), { maxInflatedBytes: 18 }), /18 inflated byte limit/);
  // Even valid 16-bit fallback candidates must satisfy the full sample budget first.
  await assert.rejects(() => decodePixelArtPNG(synthetic({ width: 512, height: 512, depth: 16, compressed: badZlib }), { maxInflatedBytes: 1024 }), /1024 inflated byte limit/);
  const png = synthetic();
  await assert.rejects(() => decodePixelArtPNG(png, { maxFileBytes: png.length - 1 }), /file limit/);
  assert.deepEqual(rgba(await decodePixelArtPNG(png, { maxFileBytes: png.length, maxInflatedBytes: 5 })), [10, 20, 30, 128]);
  await assert.rejects(() => decodePixelArtPNG(png, { maxInflatedBytes: 4 }), /4 inflated byte limit/);
});

test('decode limit options have finite hard ceilings and malformed values fail without allocation', async () => {
  const png = synthetic();
  for (const options of [null, [], { maxDimension: 0 }, { maxDimension: 16_385 }, { maxDimension: 1.5 },
    { maxPixels: 16_777_217 }, { maxPixels: Infinity }, { maxPixels: NaN }, { maxPixels: '100' },
    { maxFileBytes: 64 * 1024 * 1024 + 1 }, { maxFileBytes: -1 },
    { maxInflatedBytes: 128 * 1024 * 1024 + 1 }, { maxInflatedBytes: null }])
    await assert.rejects(() => decodePixelArtPNG(png, options), /PNG.*limit/);
});

test('inflation rejects oversized, short, truncated and invalid zlib data before producing pixels', async () => {
  const compressed = deflateSync(Buffer.from([0, 10, 20, 30, 128])), wrongChecksum = Buffer.from(compressed);
  wrongChecksum[wrongChecksum.length - 1] ^= 1;
  for (const [png, error] of [
    [synthetic({ raw: Buffer.alloc(10_000) }), /inflated data exceeds/],
    [synthetic({ raw: Buffer.from([0, 1]) }), /length does not match/],
    [synthetic({ raw: Buffer.from([5, 10, 20, 30, 128]) }), /row filter 5/],
    [synthetic({ compressed: compressed.subarray(0, -1) }), /compressed data/],
    [synthetic({ compressed: wrongChecksum }), /compressed data/],
    [synthetic({ compressed: Buffer.from([0, 1, 2, 3]) }), /compressed data/],
    [synthetic({ compressed: Buffer.concat([compressed, Buffer.from([1, 2, 3])]) }), /compressed data/],
  ]) await assert.rejects(() => decodePixelArtPNG(png), error);
});
