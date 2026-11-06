import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capturePixelClusterBrush2D, validatePixelClusterBrush2D, serializePixelClusterBrush2D, parsePixelClusterBrush2D,
  stampPixelClusterBrush2D, clonePixelBrush2D,
} from '../build/core/pixel-cluster-brush.js';

const sprite = (w, h, pixels = new Uint32Array(w * h)) => ({
  w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, color => color >>> 24 ? 1 : 0) },
});
const brush = (w, h, pixels, anchor = [0, 0], mask = pixels.map(color => color >>> 24 ? 1 : 0)) => ({
  schema: 'poku-pixel-cluster-brush/v1', name: 'Authored cluster', width: w, height: h, pixels, mask, anchor,
});
const ink = brush(1, 1, [0xffa1b2c3]);
const area = values => values.reduce((sum, value) => sum + Number(!!value), 0);

test('cluster capture uses the full source stride and preserves low alpha, hidden RGB and independent mask bytes', () => {
  const source = sprite(9, 7), selection = new Uint8Array(63);
  const indices = [21, 22, 23, 30, 31, 32], colors = [0x01123456, 0x00aabbcc, 0x80ccaabb, 0xff123456, 0x00776655, 0x40123456];
  indices.forEach((i, j) => { source.pixels[i] = colors[j]; source.mask.data[i] = [255, 0, 7, 1, 255, 1][j]; });
  [21, 22, 23, 30, 32].forEach(i => { selection[i] = 1; });
  const snapshot = structuredClone(source), selected = selection.slice();
  const captured = capturePixelClusterBrush2D(source, selection, { name: '자수 🌿', anchor: [1, 1] });
  assert.equal(captured.width, 3); assert.equal(captured.height, 2);
  assert.deepEqual(captured.pixels, colors); assert.deepEqual(captured.mask, [255, 0, 7, 1, 0, 1]);
  assert.deepEqual(captured.anchor, [1, 1]);
  const reopened = parsePixelClusterBrush2D(serializePixelClusterBrush2D(captured));
  assert.deepEqual(reopened, captured);
  reopened.pixels[0] = 0; reopened.mask[1] = 1; reopened.anchor[0] = 0;
  assert.equal(captured.pixels[0], 0x01123456); assert.equal(captured.mask[1], 0); assert.equal(captured.anchor[0], 1);
  assert.deepEqual(source, snapshot); assert.deepEqual(selection, selected);
});

test('full-canvas capture includes intentional transparent margins and has a stable even-sized anchor', () => {
  const source = sprite(4, 2, Uint32Array.of(0x00112233, 0, 0x01040506, 0, 0, 0, 0, 0));
  const captured = capturePixelClusterBrush2D(source);
  assert.equal(captured.width, 4); assert.equal(captured.height, 2); assert.deepEqual(captured.anchor, [1, 0]);
  assert.equal(captured.pixels[0], 0x00112233); assert.equal(captured.pixels[2], 0x01040506);
  assert.throws(() => capturePixelClusterBrush2D(source, new Uint8Array(8)), /Select/);
  assert.throws(() => capturePixelClusterBrush2D(source, undefined, { anchor: null }), /anchor/);
  assert.throws(() => capturePixelClusterBrush2D(source, undefined, { name: null }), /name/);
  assert.throws(() => capturePixelClusterBrush2D(sprite(129, 1)), /128/);
  const selection = new Uint8Array(129); selection[127] = selection[128] = 1;
  assert.equal(capturePixelClusterBrush2D(sprite(129, 1), selection).width, 2);
});

test('stamping replaces exact straight RGBA and skips transparent or independently hidden brush cells', () => {
  const source = sprite(10, 8, new Uint32Array(80).fill(0xff102030));
  source.emission = new Float32Array(240).fill(.125); source.origin = [31, -12];
  const pattern = brush(3, 2, [0x01123456, 0x00aabbcc, 0x80ccaabb, 0xff123456, 0xff778899, 0x40123456], [1, 1], [255, 1, 7, 1, 0, 1]);
  const original = structuredClone(source), patternBefore = structuredClone(pattern);
  const { sprite: out, touched } = stampPixelClusterBrush2D(source, [{ x: 4, y: 3 }], pattern);
  assert.equal(out.pixels[2 * 10 + 3], 0x01123456); assert.equal(out.mask.data[2 * 10 + 3], 255);
  assert.equal(out.pixels[2 * 10 + 5], 0x80ccaabb); assert.equal(out.mask.data[2 * 10 + 5], 7);
  assert.equal(out.pixels[3 * 10 + 3], 0xff123456); assert.equal(out.pixels[3 * 10 + 5], 0x40123456);
  assert.equal(out.pixels[2 * 10 + 4], source.pixels[2 * 10 + 4]);
  assert.equal(out.pixels[3 * 10 + 4], source.pixels[3 * 10 + 4]);
  assert.equal(area(touched), 4); assert.equal(out.emission, source.emission); assert.equal(out.origin, source.origin);
  assert.notEqual(out.pixels, source.pixels); assert.notEqual(out.mask.data, source.mask.data);
  assert.deepEqual(source, original); assert.deepEqual(pattern, patternBefore);
});

test('integer quarter turns and flips move the authored anchor with the asymmetric cluster', () => {
  const colors = [0xff000001, 0xff000002, 0xff000003, 0xff000004, 0xff000005, 0xff000006];
  const pattern = brush(3, 2, colors, [1, 0], [1, 2, 3, 4, 5, 6]);
  const rotated = stampPixelClusterBrush2D(sprite(9, 9), [{ x: 4, y: 4 }], pattern, { rotation: 90 }).sprite;
  const expected = [[3, 3, 3], [4, 3, 0], [3, 4, 4], [4, 4, 1], [3, 5, 5], [4, 5, 2]];
  for (const [x, y, source] of expected) {
    assert.equal(rotated.pixels[y * 9 + x], colors[source]); assert.equal(rotated.mask.data[y * 9 + x], source + 1);
  }
  assert.equal(area(rotated.mask.data), 6);
  const flipped = stampPixelClusterBrush2D(sprite(9, 9), [{ x: 4, y: 4 }], pattern, { flipX: true }).sprite;
  assert.deepEqual([...flipped.pixels.slice(4 * 9 + 3, 4 * 9 + 6)], [colors[2], colors[1], colors[0]]);
  assert.deepEqual([...flipped.pixels.slice(5 * 9 + 3, 5 * 9 + 6)], [colors[5], colors[4], colors[3]]);
  assert.equal(flipped.pixels[4 * 9 + 4], colors[1], 'the selected anchor cell stays under the cursor');
});

test('fixed arc-length spacing is independent of collinear pointer-event density', () => {
  const source = sprite(48, 32), pattern = brush(2, 2, [0xff010203, 0x80123456, 0, 0xffabcdef]);
  const options = { spacing: 3, rotation: 90 };
  const sparse = [{ x: 2.5, y: 3.5 }, { x: 38.5, y: 21.5 }];
  const dense = [sparse[0], { x: 11.5, y: 8 }, { x: 20.5, y: 12.5 }, { x: 29.5, y: 17 }, sparse[1]];
  assert.deepEqual(stampPixelClusterBrush2D(source, sparse, pattern, options), stampPixelClusterBrush2D(source, dense, pattern, options));
  const axis = stampPixelClusterBrush2D(source, [{ x: 1, y: 2 }, { x: 19, y: 2 }], ink, { spacing: 4 });
  const coalesced = stampPixelClusterBrush2D(source, [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 11, y: 2 }, { x: 19, y: 2 }], ink, { spacing: 4 });
  assert.deepEqual(axis, coalesced);
  for (let x = 0; x < 48; x++) assert.equal(axis.touched[2 * 48 + x], Number([1, 5, 9, 13, 17].includes(x)));
  assert.equal(axis.touched[2 * 48 + 19], 0, 'the final pointer event does not add an off-phase extra stamp');
  const fineSource = sprite(256, 128), start = { x: .1, y: .2 }, end = { x: 240.1, y: 120.2 };
  const fine = Array.from({ length: 4097 }, (_, i) => ({ x: start.x + (end.x - start.x) * i / 4096, y: start.y + (end.y - start.y) * i / 4096 }));
  assert.deepEqual(stampPixelClusterBrush2D(fineSource, fine, ink, { spacing: 3 }),
    stampPixelClusterBrush2D(fineSource, [start, end], ink, { spacing: 3 }), 'dense fractional collinear samples keep endpoint-defined spacing');
});

test('clipping preserves the global spacing phase and skips remote off-canvas sample ranges', () => {
  const points = [{ x: -12, y: 3 }, { x: 23, y: 3 }];
  const small = stampPixelClusterBrush2D(sprite(16, 8), points, ink, { spacing: 5 });
  const large = stampPixelClusterBrush2D(sprite(64, 8), points.map(p => ({ x: p.x + 20, y: p.y })), ink, { spacing: 5 });
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++)
    assert.equal(small.sprite.pixels[y * 16 + x], large.sprite.pixels[y * 64 + x + 20]);
  for (let x = 0; x < 16; x++) assert.equal(small.touched[3 * 16 + x], Number([3, 8, 13].includes(x)));
  const long = stampPixelClusterBrush2D(sprite(8, 8), [{ x: -1_000_000, y: 4 }, { x: 1_000_000, y: 4 }], ink);
  assert.equal(area(long.touched), 8);
});

test('remote axial strokes cover every intended native cell in both directions without shifting a fractional row or column', () => {
  for (const vertical of [false, true]) for (const reverse of [false, true]) for (const fixed of [4, 4 - 1e-10]) {
    const source = sprite(8, 8), expected = new Uint8Array(64), row = Math.floor(fixed);
    const points = vertical ? [{ x: fixed, y: -1_000_000 }, { x: fixed, y: 1_000_000 }]
      : [{ x: -1_000_000, y: fixed }, { x: 1_000_000, y: fixed }];
    if (reverse) points.reverse();
    for (let cell = 0; cell < 8; cell++) expected[vertical ? cell * 8 + row : row * 8 + cell] = 1;
    const out = stampPixelClusterBrush2D(source, points, ink);
    assert.deepEqual(out.touched, expected, `vertical=${vertical}, reverse=${reverse}, fixed=${fixed}`);
    assert.deepEqual(out.sprite.pixels, Uint32Array.from(expected, selected => selected ? ink.pixels[0] : 0));
  }
});

test('remote oblique spacing retains exact grid crossings and intentional fractional offsets', () => {
  for (const [dx, dy, spacing] of [[3, 4, 5], [5, 12, 13]]) for (const fraction of [0, -1e-5, 1e-5]) for (const reverse of [false, true]) {
    const center = 1 + fraction, source = sprite(32, 32), expected = new Uint8Array(1024);
    const points = [{ x: center - dx * 60_000, y: center - dy * 60_000 }, { x: center + dx * 60_000, y: center + dy * 60_000 }];
    if (reverse) points.reverse();
    // Both remote starts are an exact whole number of 3:4:5 or 5:12:13 steps
    // from this local center; the intended on-canvas lattice is independent of clipping.
    for (let step = -16; step <= 16; step++) {
      const x = Math.floor(center + step * dx), y = Math.floor(center + step * dy);
      if (x >= 0 && x < 32 && y >= 0 && y < 32) expected[y * 32 + x] = 1;
    }
    const out = stampPixelClusterBrush2D(source, points, ink, { spacing });
    assert.deepEqual(out.touched, expected, `direction=${dx}:${dy}, fraction=${fraction}, reverse=${reverse}`);
    assert.deepEqual(out.sprite.pixels, Uint32Array.from(expected, selected => selected ? ink.pixels[0] : 0));
  }
});

test('overlapping stamps use deterministic path order without alpha accumulation', () => {
  const a = 0x01123456, b = 0x80778899, pattern = brush(2, 1, [a, b], [0, 0], [1, 255]);
  const source = sprite(7, 1, new Uint32Array(7).fill(0xffabcdef));
  const out = stampPixelClusterBrush2D(source, [{ x: 1, y: 0 }, { x: 3, y: 0 }], pattern);
  assert.deepEqual([...out.sprite.pixels], [source.pixels[0], a, a, a, b, source.pixels[5], source.pixels[6]]);
  assert.deepEqual([...out.sprite.mask.data], [1, 1, 1, 1, 255, 1, 1]);
  assert.equal(area(out.touched), 4);
});

test('selection, protection and alpha lock retain exact destination coverage', () => {
  const source = sprite(6, 1, Uint32Array.of(0x11101010, 0x22202020, 0x33303030, 0x00404040, 0xff505050, 0x66606060));
  source.mask.data.set([1, 255, 1, 1, 0, 7]);
  const selection = Uint8Array.of(1, 1, 0, 1, 1, 1), protection = Uint8Array.of(0, 1, 0, 0, 0, 0), pattern = brush(1, 1, [0x807799bb], [0, 0], [5]);
  const out = stampPixelClusterBrush2D(source, [{ x: 0, y: 0 }, { x: 5, y: 0 }], pattern, { selection, protectedMask: protection, alphaLock: true });
  assert.deepEqual([...out.sprite.pixels], [0x117799bb, source.pixels[1], source.pixels[2], source.pixels[3], source.pixels[4], 0x667799bb]);
  assert.deepEqual(out.sprite.mask.data, source.mask.data);
  assert.deepEqual([...out.touched], [1, 0, 0, 0, 0, 1]);
});

test('wrapped stamps carry whole clusters across both edges without a line through the canvas center', () => {
  const [a, b, c, d] = [0xff110000, 0x80120000, 0x01130000, 0xff140000], pattern = brush(2, 2, [a, b, c, d]);
  const out = stampPixelClusterBrush2D(sprite(8, 5), [{ x: 7, y: 4 }, { x: 9, y: 4 }], pattern, { wrap: true });
  for (const [x, y, color] of [[7, 4, a], [0, 4, a], [1, 4, a], [2, 4, b], [7, 0, c], [0, 0, c], [1, 0, c], [2, 0, d]])
    assert.equal(out.sprite.pixels[y * 8 + x], color);
  assert.equal(area(out.touched), 8);
  for (let y = 0; y < 5; y++) for (let x = 3; x <= 6; x++) assert.equal(out.touched[y * 8 + x], 0);
  const tiny = stampPixelClusterBrush2D(sprite(1, 1), [{ x: 0, y: 0 }], pattern, { wrap: true });
  assert.equal(tiny.sprite.pixels[0], d, 'many-to-one wrapping uses the documented original row-major donor order');
});

test('cloning always reads the pre-stroke source even when writes overlap the donor region', () => {
  const colors = Uint32Array.from({ length: 9 }, (_, i) => 0xff000001 + i), source = sprite(9, 1, colors);
  source.mask.data[4] = 255; source.emission = new Float32Array(27).fill(.5);
  const snapshot = structuredClone(source), out = clonePixelBrush2D(source, [{ x: 1, y: 0 }, { x: 8, y: 0 }], [0, 0], [1, 0]);
  assert.equal(out.sprite.pixels[0], colors[0]);
  for (let x = 1; x < 9; x++) assert.equal(out.sprite.pixels[x], colors[x - 1]);
  assert.equal(out.sprite.mask.data[5], 255); assert.equal(out.sprite.emission, source.emission);
  assert.deepEqual(source, snapshot); assert.equal(area(out.touched), 8);
});

test('wrapped cloning preserves donor offsets on unwrapped edge crossings', () => {
  const source = sprite(8, 3, Uint32Array.from({ length: 24 }, (_, i) => 0xff001000 + i));
  const out = clonePixelBrush2D(source, [{ x: 7, y: 1 }, { x: 9, y: 1 }], [2, 1], [7, 1], { wrap: true });
  assert.equal(out.sprite.pixels[15], source.pixels[10]);
  assert.equal(out.sprite.pixels[8], source.pixels[11]);
  assert.equal(out.sprite.pixels[9], source.pixels[12]);
  assert.equal(area(out.touched), 3);
  for (let x = 2; x < 7; x++) assert.equal(out.sprite.pixels[8 + x], source.pixels[8 + x]);
});

test('cloning respects donor transparency and destination protection, selection and alpha lock', () => {
  const source = sprite(8, 1, Uint32Array.of(0x01123456, 0xffabcdef, 0x00778899, 0xff778899, 0x48111111, 0xff222222, 0xff333333, 0xff444444));
  source.mask.data.set([255, 0, 1, 7, 5, 1, 1, 1]);
  const out = clonePixelBrush2D(source, [{ x: 4, y: 0 }, { x: 7, y: 0 }], [0, 0], [4, 0], {
    alphaLock: true, selection: Uint8Array.of(0, 0, 0, 0, 1, 1, 1, 1), protectedMask: Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 1),
  });
  assert.equal(out.sprite.pixels[4], 0x48123456); assert.equal(out.sprite.mask.data[4], 5);
  for (const i of [0, 1, 2, 3, 5, 6, 7]) assert.equal(out.sprite.pixels[i], source.pixels[i]);
  assert.equal(area(out.touched), 1);
});

test('pressure gates authored clusters without changing their saved alpha or pixel scale', () => {
  const pattern = brush(2, 1, [0x01775533, 0x80443322]), source = sprite(8, 3);
  assert.equal(area(stampPixelClusterBrush2D(source, [{ x: 2, y: 1, pressure: 0 }], pattern).touched), 0);
  const low = stampPixelClusterBrush2D(source, [{ x: 2, y: 1, pressure: .1 }], pattern);
  const full = stampPixelClusterBrush2D(source, [{ x: 2, y: 1, pressure: 1 }], pattern);
  assert.deepEqual(low, full); assert.equal(low.sprite.pixels[10], 0x01775533); assert.equal(low.sprite.pixels[11], 0x80443322);
  const paused = stampPixelClusterBrush2D(source, [
    { x: 0, y: 1, pressure: 1 }, { x: 2, y: 1, pressure: 0 }, { x: 4, y: 1, pressure: 0 }, { x: 6, y: 1, pressure: 1 },
  ], ink);
  for (const x of [2, 3, 4]) assert.equal(paused.touched[8 + x], 0, 'collinear simplification retains zero-pressure intervals');
});

test('malformed brush data, edit options and bounded workloads reject without changing the source', () => {
  const source = sprite(8, 8, new Uint32Array(64).fill(0xff123456)), snapshot = structuredClone(source), point = [{ x: 2, y: 2 }];
  for (const invalid of [null, {}, { ...ink, schema: 'other' }, { ...ink, width: 129 }, { ...ink, pixels: [-1] }, { ...ink, pixels: [NaN] },
    { ...ink, mask: [256] }, { ...ink, mask: [] }, { ...ink, anchor: [1, 0] }, { ...ink, anchor: [.5, 0] }, { ...ink, name: '' }])
    assert.throws(() => validatePixelClusterBrush2D(invalid), RangeError);
  for (const options of [{ spacing: 0 }, { spacing: .5 }, { spacing: 257 }, { spacing: NaN }, { spacing: null }, { rotation: 45 }, { wrap: 'yes' }, { flipX: 1 },
    { selection: [1] }, { protectedMask: new Array(64).fill(NaN) }, { alphaLock: 'yes' }])
    assert.throws(() => stampPixelClusterBrush2D(source, point, ink, options), RangeError);
  for (const points of [[{ x: Infinity, y: 0 }], [{ x: 1, y: NaN }], [{ x: 2, y: 2, pressure: 2 }], [{ x: 2, y: 2, pressure: null }], Array.from({ length: 65_537 }, () => ({ x: 0, y: 0 }))])
    assert.throws(() => stampPixelClusterBrush2D(source, points, ink), RangeError);
  assert.throws(() => clonePixelBrush2D(source, point, [.5, 0], [0, 0]), /integers/);
  assert.throws(() => clonePixelBrush2D(source, point, [0, 0], [1, 1], { pixelPerfect: 'yes' }), /boolean/);
  assert.throws(() => parsePixelClusterBrush2D('x'.repeat(1024 * 1024 + 1)), /1 MiB/);
  assert.throws(() => stampPixelClusterBrush2D(source, [{ x: 0, y: 0 }, { x: 70_000, y: 0 }], ink, { wrap: true }), /sample budget/);
  const large = capturePixelClusterBrush2D(sprite(128, 128, new Uint32Array(128 * 128).fill(0xffffffff)));
  assert.throws(() => stampPixelClusterBrush2D(sprite(256, 1), [{ x: 0, y: 0 }, { x: 1100, y: 0 }], large, { wrap: true }), /stamp-cell budget/);
  assert.deepEqual(source, snapshot);
});
