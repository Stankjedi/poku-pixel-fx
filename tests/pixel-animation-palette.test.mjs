import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPixelAnimationPalette2D, extractPixelPalette2D, createPixelPaletteMapper2D } from '../build/core/pixel-palette.js';

const gray = value => (0xff000000 | value | value << 8 | value << 16) >>> 0;
function sprite(values, w = values.length) {
  return { w, h: values.length / w, pixels: Uint32Array.from(values),
    mask: { w, h: values.length / w, data: new Uint8Array(values.length).fill(1) } };
}

test('one shared palette contains fitting colors from every frame, preserving rare locked accents', () => {
  const a = sprite([0xff204060, 0xff204060]), b = sprite([0xffc0e0ff, 0xff204060, 0xff807050]);
  const frames = [{ sprite: a, duration: .1 }, { sprite: b, duration: .25 }], before = structuredClone(frames);
  const palette = extractPixelAnimationPalette2D(frames, { colors: 8, locked: ['#ff22a0'] });
  assert.equal(palette[0], 0xffa022ff);
  for (const c of [...a.pixels, ...b.pixels]) assert.ok(palette.includes(c));
  const mapper = createPixelPaletteMapper2D(palette);
  for (const frame of frames) assert.deepEqual(mapper.remap(frame.sprite), frame.sprite);
  assert.deepEqual(frames, before);
});

test('equal-frame, duration and pixel weighting have independently calculable neutral centroids', () => {
  const frames = [{ sprite: sprite(Array(4).fill(gray(0))), duration: 1 },
    { sprite: sprite([gray(255)]), duration: 3 }];
  // Neutral Oklab L is cbrt(linear RGB): L=.5, .75 and .2 respectively.
  assert.deepEqual(extractPixelAnimationPalette2D(frames, { colors: 1 }), [gray(99)]);
  assert.deepEqual(extractPixelAnimationPalette2D(frames, { colors: 1, weighting: 'duration' }), [gray(174)]);
  assert.deepEqual(extractPixelAnimationPalette2D(frames, { colors: 1, weighting: 'pixel' }), [gray(22)]);
  assert.deepEqual(extractPixelAnimationPalette2D([...frames].reverse(), { colors: 1, weighting: 'duration' }), [gray(174)]);
});

test('alpha, per-frame regions and empty cels contribute only visible selected coverage', () => {
  const source = sprite([gray(0), 0x55ffffff, 0xff0000ff, 0xff00ff00, 0xffff0000, 0x00123456]);
  source.mask.data[2] = 0;
  const frame = { sprite: source, selection: [1, 1, 1, 0, 1, 1], protectedMask: [0, 0, 0, 0, 1, 0] };
  const empty = { sprite: sprite([0x00123456]), duration: 999 };
  assert.deepEqual(extractPixelAnimationPalette2D([frame, empty], { colors: 1 }), [gray(34)]);
  assert.deepEqual(extractPixelAnimationPalette2D([empty], { locked: ['#123456'] }), [0xff563412]);
  assert.deepEqual(extractPixelAnimationPalette2D([]), []);
});

test('pixel-weighted streaming equals a joined raster through the bounded large-color histogram path', () => {
  const first = new Uint32Array(5120), second = new Uint32Array(5120);
  for (let i = 0; i < 10240; i++) {
    const x = i % 128, y = Math.floor(i / 128);
    const c = (((x + y) % 255 + 1) << 24 | (x ^ y) << 16 | y * 3 << 8 | x * 2) >>> 0;
    (i < 5120 ? first : second)[i % 5120] = c;
  }
  const all = new Uint32Array(10240); all.set(first); all.set(second, first.length);
  assert.ok(new Set([...all].map(c => c & 0xffffff)).size > 8192);
  const options = { colors: 12, locked: ['#123456'], iterations: 3 };
  const expected = extractPixelPalette2D(sprite(all), options);
  assert.deepEqual(extractPixelAnimationPalette2D([{ sprite: sprite(first) }, { sprite: sprite(second) }],
    { ...options, weighting: 'pixel' }), expected);
  assert.deepEqual(extractPixelAnimationPalette2D([{ sprite: sprite(second) }, { sprite: sprite(first) }],
    { ...options, weighting: 'pixel' }), expected);
});

test('one mapper keeps identical painted colors identical across different cels and execution order', () => {
  const a = sprite(Array.from({ length: 64 }, (_, i) => gray(i * 4))), b = sprite(Array.from({ length: 64 }, (_, i) => gray(i * 4)));
  b.pixels[0] = 0xffc020d0;
  const palette = extractPixelAnimationPalette2D([{ sprite: a }, { sprite: b }], { colors: 5, locked: ['#d020c0'] });
  const mapper = createPixelPaletteMapper2D(palette), mappedB = mapper.remap(b), mappedA = mapper.remap(a);
  for (let i = 1; i < 64; i++) assert.equal(mappedA.pixels[i], mappedB.pixels[i]);
  assert.deepEqual(mapper.remap(a), mappedA); assert.deepEqual(mapper.remap(b), mappedB);
});

test('duration normalization avoids overflow and respects only relative durations', () => {
  const a = sprite([gray(0)]), b = sprite([gray(255)]), options = { colors: 1, weighting: 'duration' };
  assert.deepEqual(extractPixelAnimationPalette2D([{ sprite: a, duration: 1e307 }, { sprite: b, duration: 3e307 }], options), [gray(174)]);
  assert.deepEqual(extractPixelAnimationPalette2D([{ sprite: a, duration: 1e-200 }, { sprite: b, duration: 3e-200 }], options), [gray(174)]);
});

test('malformed regions, durations and excessive aggregate work reject without changing cels', () => {
  const source = sprite([gray(0), gray(255)]), before = structuredClone(source);
  for (const frame of [{ sprite: source, duration: 0 }, { sprite: source, duration: Infinity },
    { sprite: source, selection: [1] }, { sprite: source, protectedMask: [NaN, 0] }])
    assert.throws(() => extractPixelAnimationPalette2D([frame]), RangeError);
  assert.throws(() => extractPixelAnimationPalette2D([{ sprite: source }], { weighting: 'random' }), RangeError);
  assert.throws(() => extractPixelAnimationPalette2D(Array(4097).fill({ sprite: source })), RangeError);
  const block = sprite(new Uint32Array(65536));
  assert.throws(() => extractPixelAnimationPalette2D(Array(2049).fill({ sprite: block })), /source cells/);
  assert.deepEqual(source, before);
});
