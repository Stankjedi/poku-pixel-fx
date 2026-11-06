import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPixelPalette2D, createPixelPaletteMapper2D, remapPixelPalette2D, createPixelPaletteRamp2D,
} from '../build/core/pixel-palette.js';
import { hex } from '../build/core/color.js';

const color = value => hex(value) >>> 0;
function sprite(w, h, values) {
  const pixels = typeof values === 'number' ? new Uint32Array(w * h).fill(values) : Uint32Array.from(values);
  return { w, h, pixels, mask: { w, h, data: new Uint8Array(w * h).fill(1) } };
}
const gray = value => (0xff000000 | value << 16 | value << 8 | value) >>> 0;

test('palette extraction preserves a fitting source palette and excludes hidden, unselected and protected RGB', () => {
  const a = color('#14375a'), b = color('#edbc84');
  const source = sprite(7, 1, [a, b, a, 0x00112233, color('#f0f'), color('#0f0'), color('#00f')]);
  source.mask.data[4] = 0;
  const selection = Uint8Array.from([1, 1, 1, 1, 1, 0, 1]), protectedMask = Uint8Array.from([0, 0, 0, 0, 0, 0, 1]);
  const before = structuredClone(source);
  assert.deepEqual(extractPixelPalette2D(source, { colors: 8, selection, protectedMask }), [a, b]);
  assert.deepEqual(source, before);
  assert.deepEqual(extractPixelPalette2D(source, { selection: new Uint8Array(7) }), []);
});

test('alpha coverage weights perceptual centroids instead of treating almost transparent colors as opaque', () => {
  // For neutral sRGB, Oklab L is the cube root of linear RGB. The equal-weight
  // black/white centroid has L=.5 -> linear=.125 -> rounded sRGB=99.
  assert.deepEqual(extractPixelPalette2D(sprite(2, 1, [gray(0), gray(255)]), { colors: 1 }), [gray(99)]);
  // White at alpha 85 contributes one third the coverage of opaque black:
  // L=.25 -> linear=.015625 -> rounded sRGB=34.
  assert.deepEqual(extractPixelPalette2D(sprite(2, 1, [gray(0), 0x55ffffff]), { colors: 1 }), [gray(34)]);
  assert.deepEqual(extractPixelPalette2D(sprite(2, 1, [gray(0), 0x00ffffff]), { colors: 1 }), [gray(0)]);
});

test('locked colors retain exact authored order and never move during palette refinement', () => {
  const source = sprite(64, 1, Array.from({ length: 64 }, (_, i) => gray(i * 4)));
  const locked = ['#fe25b4', '#05239a'], saved = [...locked];
  const first = extractPixelPalette2D(source, { colors: 7, locked, iterations: 8 });
  assert.deepEqual(first.slice(0, 2), locked.map(color));
  assert.ok(first.length <= 7 && new Set(first).size === first.length);
  assert.deepEqual(extractPixelPalette2D(source, { colors: 7, locked, iterations: 8 }), first);
  assert.deepEqual(locked, saved);
  assert.deepEqual(extractPixelPalette2D(source, { colors: 2, locked }), locked.map(color));
  assert.deepEqual(extractPixelPalette2D(sprite(1, 1, 0), { colors: 2, locked }), locked.map(color));
});

test('large-color extraction is deterministic under reversed traversal and keeps a bounded palette', () => {
  const w = 128, h = 80, values = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    values[y * w + x] = (((x + y) % 255 + 1) << 24 | (x ^ y) << 16 | y * 3 << 8 | x * 2) >>> 0;
  assert.ok(new Set([...values].map(c => c & 0xffffff)).size > 8192, 'fixture enters the bounded histogram path');
  const first = extractPixelPalette2D(sprite(w, h, values), { colors: 12, locked: ['#123456'], iterations: 3 });
  const reversed = extractPixelPalette2D(sprite(w, h, values.slice().reverse()), { colors: 12, locked: ['#123456'], iterations: 3 });
  assert.deepEqual(first, reversed);
  assert.equal(first[0], color('#123456'));
  assert.ok(first.length > 1 && first.length <= 12 && first.every(c => c >>> 24 === 255));
});

test('nearest mapping follows perceptual lightness rather than encoded RGB midpoints', () => {
  // Encoded sRGB 112 is below the byte midpoint, but its Oklab lightness is above .5.
  const output = remapPixelPalette2D(sprite(1, 1, gray(112)), ['#000', '#fff']);
  assert.equal(output.pixels[0], gray(255));
  assert.equal(remapPixelPalette2D(sprite(1, 1, gray(80)), ['#000', '#fff']).pixels[0], gray(0));
});

test('palette remapping preserves exact coverage, independent masks, protected accents, source and metadata', () => {
  const source = sprite(4, 2, [gray(112), color('#a72b68'), 0x80997632, 0x00332211,
    color('#9f8564'), color('#3c7b95'), color('#dd6247'), color('#5a8b7f')]);
  source.mask.data[1] = 0; source.mask.data[2] = 127;
  source.emission = new Float32Array(24).fill(1.75);
  source.channels = { height: new Float32Array(8).fill(3) };
  source.sockets = { grip: { x: 2, y: 1 } };
  const selection = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1]);
  const protectedMask = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0]);
  const before = structuredClone(source), palette = ['#0c1728', '#edce96'];
  const output = remapPixelPalette2D(source, palette, { selection, protectedMask, dither: 'bayer4' });
  for (let i = 0; i < source.pixels.length; i++) {
    assert.equal(output.pixels[i] >>> 24, source.pixels[i] >>> 24);
    if (!source.mask.data[i] || !(source.pixels[i] >>> 24) || !selection[i] || protectedMask[i])
      assert.equal(output.pixels[i], source.pixels[i]);
    else assert.ok(palette.map(color).some(c => (c & 0xffffff) === (output.pixels[i] & 0xffffff)));
  }
  assert.deepEqual(source, before); assert.deepEqual(output.mask, source.mask);
  assert.notEqual(output.pixels, source.pixels); assert.notEqual(output.mask.data, source.mask.data);
  assert.equal(output.emission, source.emission); assert.equal(output.channels, source.channels);
  assert.equal(output.sockets, source.sockets);
});

test('compiled palette options are immutable snapshots and retain repeated authored ramp positions', () => {
  const palette = ['#000', '#eee', '#eee'], options = { dither: 'bayer8', strength: .7 };
  const mapper = createPixelPaletteMapper2D(palette, options), source = sprite(8, 8, gray(115));
  const before = mapper.remap(source);
  palette[0] = '#f00'; options.strength = 0; options.dither = 'none';
  assert.deepEqual(mapper.remap(source), before);
  assert.deepEqual(mapper.palette, [color('#000'), color('#eee'), color('#eee')]);
  assert.ok(Object.isFrozen(mapper.options) && Object.isFrozen(mapper.options.palette));
  const saved = JSON.parse(JSON.stringify(mapper.options));
  assert.deepEqual(createPixelPaletteMapper2D(saved.palette, saved).remap(source), before);
});

test('ordered dither preserves a gray surface mean in linear light while retaining partial alpha', () => {
  const source = sprite(8, 8, (gray(128) & 0xffffff) | 128 << 24);
  const output = remapPixelPalette2D(source, ['#000', '#fff'], { dither: 'bayer8' });
  const whites = [...output.pixels].filter(c => (c & 0xffffff) === 0xffffff).length;
  const targetLinear = ((128 / 255 + .055) / 1.055) ** 2.4;
  assert.equal(whites, 14);
  assert.ok(Math.abs(whites / 64 - targetLinear) <= .5 / 64);
  assert.ok([...output.pixels].every(c => c >>> 24 === 128));
  const disabled = remapPixelPalette2D(source, ['#000', '#fff'], { dither: 'bayer8', strength: 0 });
  assert.deepEqual(disabled, remapPixelPalette2D(source, ['#000', '#fff']));
  assert.ok([...disabled.pixels].every(c => (c & 0xffffff) === 0xffffff));
});

test('dither is object anchored and crop stable, without diffusion across selection edges', () => {
  const w = 27, h = 19, values = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) values[y * w + x] = gray(85 + (x + y) % 80);
  const source = { ...sprite(w, h, values), x: 73.2, y: -19.8 };
  const mapper = createPixelPaletteMapper2D(['#10172c', '#77939e', '#f9e8b4'], { dither: 'bayer8' });
  const origin = [-2.25, 5.5], full = mapper.remap(source, { origin });
  assert.deepEqual(mapper.remap({ ...source, x: -300, y: 905 }, { origin }).pixels, full.pixels);
  const cropX = 7, cropY = 5, small = sprite(11, 9, 0);
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++)
    small.pixels[y * small.w + x] = source.pixels[(y + cropY) * w + x + cropX];
  const crop = mapper.remap(small, { origin: [origin[0] + cropX, origin[1] + cropY] });
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++)
    assert.equal(crop.pixels[y * small.w + x], full.pixels[(y + cropY) * w + x + cropX]);
  const selection = Uint8Array.from({ length: w * h }, (_, i) => i % 3 === 0 ? 1 : 0);
  const selected = mapper.remap(source, { origin, selection });
  for (let i = 0; i < values.length; i++) assert.equal(selected.pixels[i], selection[i] ? full.pixels[i] : source.pixels[i]);
});

test('authored palette colors remain exact under all ordered settings and alpha values', () => {
  const palette = ['#17416a', '#ffe6b0', '#a24566'];
  const source = sprite(9, 1, Array.from({ length: 9 }, (_, i) => (color(palette[i % 3]) & 0xffffff) | (i * 27 + 1) << 24));
  for (const dither of ['none', 'bayer4', 'bayer8'])
    assert.deepEqual(remapPixelPalette2D(source, palette, { dither, origin: [-11, 19] }), source);
});

test('perceptual ramps preserve authored anchors and use distinct, monotonic neutral lightness steps', () => {
  assert.deepEqual(createPixelPaletteRamp2D({ shadow: '#000', highlight: '#fff', colors: 5 }),
    [0, 34, 99, 174, 255].map(gray));
  const input = { shadow: '#162d56', midtone: '#9f6b56', highlight: '#ffefa8', colors: 9 };
  const ramp = createPixelPaletteRamp2D(input);
  assert.equal(ramp.length, 9); assert.equal(ramp[0], color(input.shadow));
  assert.equal(ramp[4], color(input.midtone)); assert.equal(ramp[8], color(input.highlight));
  assert.deepEqual(createPixelPaletteRamp2D(input), ramp);
  assert.equal(new Set(ramp).size, 9);
  const tiny = createPixelPaletteRamp2D({ shadow: '#123456', highlight: '#123456', colors: 12 });
  assert.deepEqual(tiny, Array(12).fill(color('#123456')), 'a uniform authored ramp is retained, not filled with invented colors');
});

test('invalid palette contracts fail without modifying a valid raster', () => {
  const source = sprite(2, 2, gray(100)), before = structuredClone(source);
  for (const options of [
    { colors: 0 }, { colors: 257 }, { colors: 1.5 }, { iterations: 0 }, { iterations: 17 },
    { colors: 1, locked: ['#000', '#fff'] }, { locked: ['blue'] }, { locked: [0x00ffffff] },
    { selection: [1] }, { protectedMask: [0, 0, NaN, 0] },
  ]) assert.throws(() => extractPixelPalette2D(source, options), RangeError);
  for (const palette of [[], ['rgb(0,0,0)'], ['#xx1234'], [0x80ffffff], [Infinity]])
    assert.throws(() => createPixelPaletteMapper2D(palette), RangeError);
  for (const options of [{ dither: 'random' }, { strength: -1 }, { strength: NaN }, { strength: 2 }])
    assert.throws(() => createPixelPaletteMapper2D(['#000'], options), RangeError);
  const mapper = createPixelPaletteMapper2D(['#000']);
  for (const options of [{ origin: [0] }, { origin: [0, Infinity] }, { origin: [Number.MAX_SAFE_INTEGER, 0] }, { selection: [NaN, 1, 1, 1] }])
    assert.throws(() => mapper.remap(source, options), RangeError);
  assert.throws(() => mapper.remap({ ...source, pixels: new Uint32Array(1) }), RangeError);
  for (const options of [
    { shadow: '#000', highlight: '#fff', colors: 1 }, { shadow: '#000', highlight: '#fff', midpoint: 1 },
    { shadow: 'black', highlight: '#fff' }, { shadow: '#000', midtone: 0x00ffffff, highlight: '#fff' },
  ]) assert.throws(() => createPixelPaletteRamp2D(options), RangeError);
  assert.deepEqual(source, before);
});
