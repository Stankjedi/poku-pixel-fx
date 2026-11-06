import test from 'node:test';
import assert from 'node:assert/strict';
import { sculptPixelHeight2D, applyPixelHeightDeltas2D, refreshPixelHeightNormals2D } from '../build/core/pixel-sculpt.js';

const raster = (w, h) => ({ w, h,
  pixels: Uint32Array.from({ length: w * h }, (_, i) => (0xff224466 + i) >>> 0),
  mask: { w, h, data: new Uint8Array(w * h).fill(1) },
});
const surface = (w, h, height = new Float32Array(w * h)) => ({ ...raster(w, h), channels: {
  w, h, material: Uint16Array.from({ length: w * h }, (_, i) => i % 5), height: Float32Array.from(height),
  normal: Float32Array.from({ length: w * h * 3 }, (_, i) => i % 3 === 2 ? 1 : 0),
} });
const selected = mask => [...mask.keys()].filter(i => mask[i]);
const near = (a, b, tolerance = 2e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const normal = (sprite, index) => [...sprite.channels.normal.slice(index * 3, index * 3 + 3)];
const assertNormal = (sprite, index, vector) => {
  const length = Math.hypot(...vector);
  normal(sprite, index).forEach((v, i) => near(v, vector[i] / length));
};

test('empty sparse edits initialize explicit form normals and existing no-op channels stay exact', () => {
  const source = raster(2, 2), before = structuredClone(source), heights = Float32Array.of(2, 4, 5, 7);
  const out = applyPixelHeightDeltas2D(source, [], [], { height: heights });
  assert.deepEqual(out.channels.height, heights);
  assert.deepEqual([...out.channels.material], [0, 0, 0, 0]);
  for (let i = 0; i < 4; i++) assertNormal(out, i, [-2, -3, 1]);
  assert.deepEqual(out.pixels, source.pixels); assert.deepEqual(out.mask, source.mask);
  assert.deepEqual(source, before); assert.notEqual(out.channels.height, heights);
  const existing = surface(2, 2, [1, 2, 3, 4]); existing.channels.normal.fill(.375);
  assert.equal(applyPixelHeightDeltas2D(existing, [], []), existing);
  assert.equal(applyPixelHeightDeltas2D(existing, [1], [8], { strength: 0 }), existing);
  assert.equal(applyPixelHeightDeltas2D(existing, [], [], { height: new Float32Array(4).fill(90) }), existing,
    'an existing surface takes precedence over an initialization map');
});

test('raise, lower and flatten operate in native height units with a bounded blend', () => {
  const source = surface(7, 7), points = [{ x: 3, y: 3 }];
  const raised = sculptPixelHeight2D(source, points, { mode: 'raise', size: 1, strength: 2 });
  assert.deepEqual(selected(raised.touched), [24]); assert.equal(raised.sprite.channels.height[24], 2);
  assert.equal(raised.deltas[24], 2);
  const lowered = sculptPixelHeight2D(raised.sprite, points, { mode: 'lower', size: 1, strength: 3 });
  assert.equal(lowered.sprite.channels.height[24], -1);
  const tall = surface(7, 7, new Float32Array(49).fill(10));
  assert.equal(sculptPixelHeight2D(tall, points, { mode: 'flatten', size: 1, strength: .25, targetHeight: 4 }).sprite.channels.height[24], 8.5);
  assert.equal(sculptPixelHeight2D(tall, points, { mode: 'flatten', size: 1, strength: 8, targetHeight: 4 }).sprite.channels.height[24], 4);
  assert.deepEqual(source.channels.height, new Float32Array(49));
});

test('radial hardness forms a deliberate smooth mound with finite unit normals', () => {
  const out = sculptPixelHeight2D(surface(7, 7), [{ x: 3, y: 3 }], { size: 5, strength: 4, hardness: 0 });
  assert.equal(out.sprite.channels.height[24], 4);
  near(out.sprite.channels.height[25], 2.592); near(out.sprite.channels.height[26], .416);
  assert.equal(out.sprite.channels.height[5 * 7 + 5], 0);
  for (let i = 0; i < 49; i++) near(Math.hypot(...normal(out.sprite, i)), 1);
  const hard = sculptPixelHeight2D(surface(7, 7), [{ x: 3, y: 3 }], { size: 3, strength: 4, hardness: 1 });
  assert.deepEqual(selected(hard.touched), [16, 17, 18, 23, 24, 25, 30, 31, 32]);
  for (const i of selected(hard.touched)) assert.equal(hard.sprite.channels.height[i], 4);
});

test('dense, duplicate and retraced samples do not accumulate height within one gesture', () => {
  const source = surface(24, 12), start = { x: 2, y: 5, pressure: .25 }, end = { x: 18, y: 5, pressure: 1 };
  const options = { size: 7, hardness: .3, strength: 3 };
  const sparse = sculptPixelHeight2D(source, [start, end], options);
  const dense = Array.from({ length: 17 }, (_, i) => ({ x: 2 + i, y: 5, pressure: .25 + .75 * i / 16 }));
  assert.deepEqual(sculptPixelHeight2D(source, dense, options).deltas, sparse.deltas);
  assert.deepEqual(sculptPixelHeight2D(source, dense.flatMap(p => [p, p, p]), options).deltas, sparse.deltas);
  const reversed = sculptPixelHeight2D(source, [end, start], options);
  const retraced = sculptPixelHeight2D(source, [start, end, start, end], options);
  for (let i = 0; i < sparse.deltas.length; i++) {
    near(reversed.deltas[i], sparse.deltas[i]); near(retraced.deltas[i], sparse.deltas[i]);
    assert.ok(retraced.deltas[i] <= 3);
  }
  const diagonal = sculptPixelHeight2D(source, [{ x: 1, y: 1 }, { x: 10, y: 10 }], { size: 1, hardness: 1 });
  for (let i = 1; i <= 10; i++) assert.equal(diagonal.sprite.channels.height[i * 24 + i], 1);
});

test('pressure controls swept radius and zero pressure emits no isolated stamp', () => {
  const source = surface(21, 21), point = { x: 10, y: 10 };
  const zero = sculptPixelHeight2D(source, [{ ...point, pressure: 0 }], { size: 9, hardness: 1 });
  assert.equal(zero.sprite, source); assert.deepEqual(selected(zero.touched), []);
  const light = sculptPixelHeight2D(source, [{ ...point, pressure: .25 }], { size: 9, hardness: 1 });
  const full = sculptPixelHeight2D(source, [{ ...point, pressure: 1 }], { size: 9, hardness: 1 });
  assert.ok(selected(light.touched).length < selected(full.touched).length);
  assert.equal(light.deltas[220], 1);
  const sweep = sculptPixelHeight2D(source, [{ x: 1, y: 10, pressure: 0 }, { x: 18, y: 10, pressure: 1 }], { size: 5, hardness: 1 });
  assert.equal(sweep.touched[10 * 21 + 1], 0); assert.equal(sweep.deltas[10 * 21 + 18], 1);
});

test('even-diameter symmetry reflects the full footprint and overlapping copies use maximum coverage', () => {
  const source = surface(12, 10), out = sculptPixelHeight2D(source, [{ x: 2, y: 3 }], { size: 4, symmetry: 'xy', strength: 2 });
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
    assert.equal(out.deltas[y * 12 + x], out.deltas[y * 12 + 11 - x]);
    assert.equal(out.deltas[y * 12 + x], out.deltas[(9 - y) * 12 + x]);
  }
  const centered = surface(5, 5), point = [{ x: 2, y: 2 }], options = { size: 5, strength: 3 };
  assert.deepEqual(sculptPixelHeight2D(centered, point, { ...options, symmetry: 'xy' }).deltas,
    sculptPixelHeight2D(centered, point, options).deltas);
});

test('selection and protection preserve source pixels, independent masks, HDR and hidden geometry', () => {
  const source = surface(7, 5, Float32Array.from({ length: 35 }, (_, i) => 1 + i / 8));
  source.channels.normal.fill(.375); source.mask.data[15] = 255;
  source.pixels[15] = 0x0144aaee; source.pixels[16] = 0x00123456; source.mask.data[18] = 0;
  source.emission = Float32Array.from({ length: 105 }, (_, i) => i / 7);
  source.semanticMasks = { embroidery: new Uint8Array(35).fill(17) }; source.x = 2.5;
  const before = structuredClone(source), selection = new Uint8Array(35), protectedMask = new Uint8Array(35);
  selection.fill(1, 14, 21); protectedMask[17] = 1;
  const out = sculptPixelHeight2D(source, [{ x: 3, y: 2 }], { size: 7, hardness: 1, strength: 2, selection, protectedMask });
  assert.deepEqual(selected(out.touched), [14, 15, 19, 20]);
  assert.deepEqual(out.sprite.pixels, source.pixels); assert.deepEqual(out.sprite.mask, source.mask);
  assert.deepEqual(out.sprite.channels.material, source.channels.material);
  assert.equal(out.sprite.emission, source.emission); assert.equal(out.sprite.semanticMasks, source.semanticMasks);
  assert.equal(out.sprite.x, 2.5); assert.deepEqual(normal(out.sprite, 17), normal(source, 17));
  for (let i = 0; i < 35; i++) if (!out.touched[i]) assert.equal(out.sprite.channels.height[i], source.channels.height[i]);
  assert.notDeepEqual(normal(out.sprite, 7), normal(source, 7), 'a neighboring unselected normal follows the changed surface');
  assert.deepEqual(source, before);
});

test('sparse edits update the central-difference neighborhood and keep protected normals exact', () => {
  const source = surface(7, 7), protection = new Uint8Array(49); protection[23] = 1;
  const out = applyPixelHeightDeltas2D(source, [24], [6], { protectedMask: protection });
  assertNormal(out, 24, [0, 0, 1]); assertNormal(out, 25, [3, 0, 1]);
  assertNormal(out, 17, [0, -3, 1]); assertNormal(out, 31, [0, 3, 1]);
  assert.deepEqual(normal(out, 23), normal(source, 23));
  for (let i = 0; i < 49; i++) if (![17, 24, 25, 31].includes(i)) assert.deepEqual(normal(out, i), normal(source, i));
  assert.equal(out.channels.height[24], 6); assert.equal(source.channels.height[24], 0);
});

test('one-sided normals preserve plane slopes at canvas edges and independent silhouette holes', () => {
  const source = raster(5, 4), heights = Float32Array.from({ length: 20 }, (_, i) => 10 + 2 * (i % 5) + 3 * Math.floor(i / 5));
  const plane = applyPixelHeightDeltas2D(source, [], [], { height: heights });
  for (let i = 0; i < 20; i++) assertNormal(plane, i, [-2, -3, 1]);
  source.mask.data[7] = 0; source.pixels[12] = 0x00123456;
  const cut = applyPixelHeightDeltas2D(source, [], [], { height: heights });
  for (const i of [0, 4, 15, 19, 6, 8, 11, 13]) assertNormal(cut, i, [-2, -3, 1]);
  assertNormal(cut, 2, [-2, 0, 1]); assertNormal(cut, 7, [0, 0, 1]); assertNormal(cut, 12, [0, 0, 1]);
  assert.deepEqual(applyPixelHeightDeltas2D(cut, [7, 12], [30, 40]).channels, cut.channels);
});

test('wrapped footprints join edges and corners without accumulating repeated destinations', () => {
  const source = surface(9, 7), options = { size: 5, hardness: .4, strength: 3, wrap: true };
  const out = sculptPixelHeight2D(source, [{ x: 0, y: 0 }], options);
  assert.ok(out.touched[8]); assert.ok(out.touched[6 * 9]); assert.ok(out.touched[62]);
  assert.deepEqual(sculptPixelHeight2D(source, [{ x: 9, y: 7 }], options).deltas, out.deltas);
  const clipped = sculptPixelHeight2D(source, [{ x: 0, y: 0 }], { ...options, wrap: false });
  assert.ok(selected(clipped.touched).length < selected(out.touched).length);
  const tiny = sculptPixelHeight2D(surface(2, 1), [{ x: 0, y: 0 }], { size: 32, strength: 3, wrap: true });
  assert.deepEqual([...tiny.deltas], [3, 3]);
});

test('wrapped normals and a single-cell axis use the correct periodic neighbor direction', () => {
  const row = applyPixelHeightDeltas2D(raster(4, 1), [], [], { height: [5, 0, 0, 0], wrap: true });
  assertNormal(row, 1, [2.5, 0, 1]); assertNormal(row, 3, [-2.5, 0, 1]);
  const column = applyPixelHeightDeltas2D(raster(1, 4), [], [], { height: [5, 0, 0, 0], wrap: true });
  assertNormal(column, 1, [0, 2.5, 1]); assertNormal(column, 3, [0, -2.5, 1]);
  const one = applyPixelHeightDeltas2D(raster(1, 1), [0], [2], { wrap: true });
  assertNormal(one, 0, [0, 0, 1]); assert.equal(one.channels.height[0], 2);
  const vertical = applyPixelHeightDeltas2D(raster(1, 4), [], [], { height: [0, 3, 6, 9] });
  for (let i = 0; i < 4; i++) assertNormal(vertical, i, [0, -3, 1]);
});

test('smooth uses one pre-stroke occupied height neighborhood and does not blur artwork', () => {
  const source = surface(5, 5); source.channels.height[12] = 8;
  const points = [{ x: 2, y: 2 }], options = { mode: 'smooth', size: 1, strength: 1 };
  const out = sculptPixelHeight2D(source, points, options);
  assert.equal(out.sprite.channels.height[12], 2); assert.equal(out.deltas[12], -6);
  assert.deepEqual(sculptPixelHeight2D(source, [...points, ...points, ...points], options).sprite, out.sprite);
  assert.deepEqual(out.sprite.pixels, source.pixels); assert.deepEqual(out.sprite.mask, source.mask);
  const isolated = surface(3, 3, new Float32Array(9).fill(100)); isolated.mask.data.fill(0);
  isolated.mask.data[4] = 1; isolated.channels.height[4] = 8;
  assert.equal(sculptPixelHeight2D(isolated, [{ x: 1, y: 1 }], { ...options, size: 3 }).sprite, isolated,
    'invisible neighbors do not create a false cavity or flatten an isolated feature');
});

test('new-surface protection retains the baseline normal even when neighboring heights change', () => {
  const source = raster(5, 3), heights = Float32Array.from({ length: 15 }, (_, i) => i % 5);
  const protection = new Uint8Array(15); protection[6] = 1;
  const out = sculptPixelHeight2D(source, [{ x: 2, y: 1 }], { size: 1, strength: 6, height: heights, protectedMask: protection });
  assert.equal(out.sprite.channels.height[7], 8); assert.equal(out.sprite.channels.height[6], 1);
  assertNormal(out.sprite, 6, [-1, 0, 1]); assertNormal(out.sprite, 8, [2, 0, 1]);
});

test('saved float32 deltas replay the exact displayed heights and normals', () => {
  const source = surface(6, 4, Float32Array.from({ length: 24 }, (_, i) => Math.sin(i) * 100));
  const protectedMask = new Uint8Array(24); protectedMask[9] = 1;
  const options = { mode: 'flatten', size: 5, targetHeight: Math.PI, strength: .713, wrap: true, protectedMask };
  const out = sculptPixelHeight2D(source, [{ x: 1, y: 1 }, { x: 5, y: 3 }], options);
  const indices = selected(out.touched), deltas = indices.map(i => out.deltas[i]);
  const replay = applyPixelHeightDeltas2D(source, indices, deltas, { wrap: true, protectedMask });
  assert.deepEqual(replay, out.sprite);
  const half = applyPixelHeightDeltas2D(source, indices, deltas, { strength: .5, wrap: true, protectedMask });
  for (let j = 0; j < indices.length; j++) assert.equal(half.channels.height[indices[j]], Math.fround(source.channels.height[indices[j]] + deltas[j] * .5));
});

test('erasing a raised cell refreshes its surviving neighbors without altering any other channel', () => {
  const original = applyPixelHeightDeltas2D(raster(3, 1), [], [], { height: [0, 6, 0] });
  assertNormal(original, 0, [-6, 0, 1]); assertNormal(original, 2, [6, 0, 1]);
  const erased = structuredClone(original);
  erased.pixels[1] = 0x00123456; erased.mask.data[1] = 0; erased.channels.height[1] = 0;
  const before = structuredClone(erased), out = refreshPixelHeightNormals2D(erased, [0, 1, 0]);
  assertNormal(out, 0, [0, 0, 1]); assertNormal(out, 2, [0, 0, 1]);
  assert.equal(out.pixels, erased.pixels); assert.equal(out.mask, erased.mask);
  assert.equal(out.channels.height, erased.channels.height); assert.equal(out.channels.material, erased.channels.material);
  assert.deepEqual(erased, before);
  const protectedOut = refreshPixelHeightNormals2D(erased, [0, 1, 0], { protectedMask: [1, 0, 0] });
  assert.deepEqual(normal(protectedOut, 0), normal(erased, 0)); assertNormal(protectedOut, 2, [0, 0, 1]);
});

test('inserting into a height gap reconnects adjacent normals while palette-only edits remain exact', () => {
  const source = raster(3, 1); source.mask.data[1] = 0;
  const separated = applyPixelHeightDeltas2D(source, [], [], { height: [0, 0, 4] });
  assertNormal(separated, 2, [0, 0, 1]);
  const painted = structuredClone(separated); painted.mask.data[1] = 1; painted.pixels[1] = 0xff77aacc;
  const out = refreshPixelHeightNormals2D(painted, [0, 1, 0]);
  assertNormal(out, 0, [0, 0, 1]); assertNormal(out, 1, [-2, 0, 1]); assertNormal(out, 2, [-4, 0, 1]);
  const recolored = structuredClone(out); recolored.pixels[2] = 0xff332211;
  assert.equal(refreshPixelHeightNormals2D(recolored, new Uint8Array(3)), recolored);
  assert.throws(() => refreshPixelHeightNormals2D(out, [1]), /match/);
  assert.throws(() => refreshPixelHeightNormals2D(out, [0, NaN, 0]), /finite/);
  assert.throws(() => refreshPixelHeightNormals2D(out, [0, 1, 0], { wrap: 'yes' }), /boolean/);
});

test('malformed sparse edits and float32 overflow fail atomically', () => {
  const source = surface(3, 2), before = structuredClone(source);
  for (const [indices, deltas] of [[[1, 1], [2, 3]], [[2, 1], [2, 3]], [[-1], [1]], [[6], [1]], [[.5], [1]], [[1], []], [[0, 1], [1, NaN]], [[0], [1e39]]])
    assert.throws(() => applyPixelHeightDeltas2D(source, indices, deltas), RangeError);
  for (const options of [{ strength: -1 }, { strength: Infinity }, { wrap: 1 }, { height: [1] }, { protectedMask: [0, 0, NaN, 0, 0, 0] }])
    assert.throws(() => applyPixelHeightDeltas2D(source, [], [], options), RangeError);
  assert.deepEqual(source, before);
  const huge = surface(2, 1, [3e38, 0]), snapshot = structuredClone(huge);
  assert.throws(() => applyPixelHeightDeltas2D(huge, [0], [3e38]), /finite float32/);
  assert.throws(() => sculptPixelHeight2D(huge, [{ x: 0, y: 0 }], { size: 1, strength: 3e38 }), /finite float32/);
  assert.deepEqual(huge, snapshot);
});

test('invalid brush input, dimensions and channel values cannot mutate source artwork', () => {
  const source = surface(3, 2), before = structuredClone(source), point = [{ x: 1, y: 1 }];
  for (const options of [{ mode: 'noise' }, { size: 0 }, { size: 2.5 }, { size: 257 }, { hardness: -1 }, { hardness: NaN }, { targetHeight: Infinity }, { symmetry: 'radial' }, { selection: [1] }])
    assert.throws(() => sculptPixelHeight2D(source, point, options), RangeError);
  for (const bad of [{ x: NaN, y: 0 }, { x: 2e6, y: 0 }, { x: 1, y: 1, pressure: -1 }, { x: 1, y: 1, pressure: NaN }])
    assert.throws(() => sculptPixelHeight2D(source, [bad]), RangeError);
  assert.throws(() => sculptPixelHeight2D({ ...source, pixels: new Uint32Array(1) }, point), RangeError);
  const bad = structuredClone(source); bad.channels.normal[3] = NaN;
  assert.throws(() => sculptPixelHeight2D(bad, point), /finite/);
  assert.deepEqual(source, before);
});
