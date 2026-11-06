import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizePixelLasso2D, pixelSelectionBounds2D, invertPixelSelection2D } from '../build/core/pixel-selection.js';
import { transformPixelSelection2D, validatePixelSelectionTransformOptions2D } from '../build/core/pixel-transform.js';
import { shadePixelMask2D } from '../build/core/pixel-brush.js';

const raster = (w, h, pixels = Uint32Array.from({ length: w * h }, (_, i) => 0xff000001 + i)) => ({
  w, h, pixels, mask: { w, h, data: new Uint8Array(w * h).fill(1) },
});
const maskAt = (w, h, indices) => { const out = new Uint8Array(w * h); for (const i of indices) out[i] = 1; return out; };
const selected = mask => [...mask.keys()].filter(i => mask[i]);
const rows = (mask, w) => Array.from({ length: mask.length / w }, (_, y) => [...mask.slice(y * w, (y + 1) * w)].join(''));

test('selection bounds count chosen transparent cells, and inversion can respect a silhouette', () => {
  const selection = Uint8Array.of(0, 0, 0, 0, 255, 0, 0, 1, 0, 0, 0, 0), before = selection.slice();
  assert.deepEqual(pixelSelectionBounds2D(4, 3, selection), { x: 0, y: 1, w: 4, h: 1, count: 2 });
  assert.equal(pixelSelectionBounds2D(4, 3, new Uint8Array(12)), null);
  assert.deepEqual(invertPixelSelection2D(4, 3, invertPixelSelection2D(4, 3, selection)), Uint8Array.from(selection, v => Number(!!v)));
  const silhouette = maskAt(4, 3, [4, 5, 6, 7]);
  assert.deepEqual(selected(invertPixelSelection2D(4, 3, selection, silhouette)), [5, 6]);
  assert.deepEqual(selection, before);
});

test('lasso includes dragged endpoint cells and keeps a hand-authored concave shape in both directions', () => {
  const points = [[1, 1], [5, 1], [5, 2], [3, 2], [3, 5], [1, 5]].map(([x, y]) => ({ x, y }));
  const snapshot = structuredClone(points), mask = rasterizePixelLasso2D(7, 7, points);
  assert.deepEqual(rows(mask, 7), ['0000000', '0111110', '0111110', '0111000', '0111000', '0111000', '0000000']);
  assert.deepEqual(mask, rasterizePixelLasso2D(7, 7, points.toReversed()));
  assert.deepEqual(points, snapshot);
  assert.deepEqual(selected(rasterizePixelLasso2D(5, 5, [{ x: 2.8, y: 3.9 }])), [17]);
  assert.deepEqual(selected(rasterizePixelLasso2D(5, 5, [{ x: 1, y: 2 }, { x: 3, y: 2 }])), [11, 12, 13]);
  assert.deepEqual(selected(rasterizePixelLasso2D(5, 5, [{ x: 1, y: 2 }, { x: 3, y: 2 }], { includeBoundary: false })), []);
});

test('lasso even-odd fill retains internal holes and clipped strokes retain their native phase', () => {
  const loops = [[1, 1], [5, 1], [5, 5], [1, 5], [1, 1], [2, 2], [4, 2], [4, 4], [2, 4], [2, 2]].map(([x, y]) => ({ x, y }));
  const mask = rasterizePixelLasso2D(7, 7, loops);
  assert.equal(mask[3 * 7 + 3], 0, 'the center of the inner contour is empty');
  assert.equal(mask[2 * 7 + 2], 1, 'the one-cell lasso boundary remains selectable');
  assert.equal(mask[5 * 7 + 5], 1);
  const path = [{ x: -7, y: -2 }, { x: 16, y: 8 }, { x: 2, y: 13 }];
  const small = rasterizePixelLasso2D(11, 9, path), big = rasterizePixelLasso2D(40, 40, path.map(p => ({ x: p.x + 10, y: p.y + 10 })));
  for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) assert.equal(small[y * 11 + x], big[(y + 10) * 40 + x + 10]);
  const dense = Array.from({ length: 10000 }, (_, i) => ({ x: i / 1000, y: 3 }));
  assert.deepEqual(rasterizePixelLasso2D(12, 8, dense), rasterizePixelLasso2D(12, 8, [dense[0], dense.at(-1)]));
});

test('overlapping move snapshots RGBA and independent mask bytes, including hidden RGB', () => {
  const source = raster(6, 2); source.pixels[1] = 0x01fedcba; source.mask.data[1] = 255;
  source.pixels[2] = 0xff123456; source.mask.data[2] = 0;
  source.pixels[3] = 0x000a0b0c; source.mask.data[3] = 7;
  const snapshot = structuredClone(source), selection = maskAt(6, 2, [1, 2, 3]);
  const { sprite, selection: moved, touched } = transformPixelSelection2D(source, selection, { offset: [1, 0] });
  assert.equal(sprite.pixels[1], 0); assert.equal(sprite.mask.data[1], 0);
  for (let i = 1; i <= 3; i++) { assert.equal(sprite.pixels[i + 1], snapshot.pixels[i]); assert.equal(sprite.mask.data[i + 1], snapshot.mask.data[i]); }
  for (const i of [0, 5, 6, 7, 8, 9, 10, 11]) { assert.equal(sprite.pixels[i], snapshot.pixels[i]); assert.equal(sprite.mask.data[i], snapshot.mask.data[i]); }
  assert.deepEqual(selected(moved), [2, 3, 4]); assert.deepEqual(selected(touched), [1, 2, 3, 4]);
  assert.deepEqual(source, snapshot); assert.deepEqual(selected(selection), [1, 2, 3]);
});

test('copy keeps its source and selects only its destination, including successive copies', () => {
  const source = raster(9, 2), selection = maskAt(9, 2, [1, 10]);
  const first = transformPixelSelection2D(source, selection, { offset: [2, 0], copy: true });
  assert.deepEqual(selected(first.selection), [3, 12]);
  assert.equal(first.sprite.pixels[1], source.pixels[1]); assert.equal(first.sprite.pixels[10], source.pixels[10]);
  const second = transformPixelSelection2D(first.sprite, first.selection, { offset: [2, 0], copy: true });
  assert.deepEqual(selected(second.selection), [5, 14]);
  for (const i of [1, 3, 5]) assert.equal(second.sprite.pixels[i], source.pixels[1]);
});

test('non-square clockwise quarter turns swap extents without half-cell rounding', () => {
  const source = raster(7, 7, new Uint32Array(49)), indices = [15, 16, 22, 23, 29, 30];
  indices.forEach((i, k) => source.pixels[i] = 0xff000001 + k);
  const out = transformPixelSelection2D(source, maskAt(7, 7, indices), { quarterTurns: 1 });
  assert.deepEqual(pixelSelectionBounds2D(7, 7, out.selection), { x: 1, y: 2, w: 3, h: 2, count: 6 });
  assert.deepEqual([...out.sprite.pixels.slice(15, 18)], [0xff000005, 0xff000003, 0xff000001]);
  assert.deepEqual([...out.sprite.pixels.slice(22, 25)], [0xff000006, 0xff000004, 0xff000002]);
  assert.equal(out.sprite.pixels[29], 0); assert.equal(out.sprite.pixels[30], 0);
  const flipped = transformPixelSelection2D(source, maskAt(7, 7, indices), { flipX: true });
  const sequential = transformPixelSelection2D(flipped.sprite, flipped.selection, { quarterTurns: 1 });
  const combined = transformPixelSelection2D(source, maskAt(7, 7, indices), { flipX: true, quarterTurns: 1 });
  assert.deepEqual(combined.sprite, sequential.sprite); assert.deepEqual(combined.selection, sequential.selection);
});

test('material IDs, height, rotated normals, HDR and semantic masks follow the exact color mapping', () => {
  const source = raster(3, 3), n = 9;
  source.mask.data[2] = 0; source.mask.data[6] = 255;
  source.channels = { w: 3, h: 3, material: Uint16Array.from({ length: n }, (_, i) => i + 1),
    height: Float32Array.from({ length: n }, (_, i) => i + .25), normal: Float32Array.from({ length: n * 3 }, (_, i) => [.25, .5, .75][i % 3]) };
  source.emission = Float32Array.from({ length: n * 3 }, (_, i) => i + .125);
  source.semanticMasks = { feature: Uint8Array.from({ length: n }, (_, i) => i * 7) };
  source.x = -12.5; source.rig = { socket: [3, 4] };
  const snapshot = structuredClone(source), selection = new Uint8Array(n).fill(1), out = transformPixelSelection2D(source, selection, { quarterTurns: 1 });
  const order = [6, 3, 0, 7, 4, 1, 8, 5, 2];
  for (let i = 0; i < n; i++) {
    const from = order[i];
    assert.equal(out.sprite.pixels[i], source.pixels[from]); assert.equal(out.sprite.mask.data[i], source.mask.data[from]);
    assert.equal(out.sprite.channels.material[i], source.channels.material[from]); assert.equal(out.sprite.channels.height[i], source.channels.height[from]);
    assert.deepEqual([...out.sprite.channels.normal.slice(i * 3, i * 3 + 3)], [-.5, .25, .75]);
    assert.deepEqual(out.sprite.emission.slice(i * 3, i * 3 + 3), source.emission.slice(from * 3, from * 3 + 3));
    assert.equal(out.sprite.semanticMasks.feature[i], source.semanticMasks.feature[from]);
  }
  let rotated = out;
  for (let i = 1; i < 4; i++) rotated = transformPixelSelection2D(rotated.sprite, rotated.selection, { quarterTurns: 1 });
  assert.deepEqual(rotated.sprite, source, 'four exact quarter turns recover all raster channels');
  assert.equal(out.sprite.rig, source.rig); assert.equal(out.sprite.x, source.x);
  assert.notEqual(out.sprite.channels, source.channels); assert.notEqual(out.sprite.emission, source.emission);
  assert.deepEqual(source, snapshot);
});

test('cleared cells zero their old geometry and emission; protected source keeps the original anchor', () => {
  const source = raster(6, 1), selection = maskAt(6, 1, [1, 2]), protection = maskAt(6, 1, [1]);
  source.channels = { w: 6, h: 1, material: new Uint16Array(6).fill(5), height: new Float32Array(6).fill(2), normal: new Float32Array(18).fill(.5) };
  source.emission = new Float32Array(18).fill(3); source.semanticMasks = { subject: new Uint8Array(6).fill(7) };
  const out = transformPixelSelection2D(source, selection, { offset: [2, 0], flipX: true, protectedMask: protection });
  assert.deepEqual(selected(out.selection), [3]); assert.equal(out.sprite.pixels[1], source.pixels[1]);
  assert.equal(out.sprite.channels.material[2], 0); assert.equal(out.sprite.channels.height[2], 0);
  assert.deepEqual([...out.sprite.channels.normal.slice(6, 9)], [0, 0, 0]); assert.deepEqual([...out.sprite.emission.slice(6, 9)], [0, 0, 0]);
  assert.equal(out.sprite.semanticMasks.subject[2], 0);
  assert.equal(out.sprite.channels.normal[9], -.5); assert.equal(out.sprite.channels.normal[10], .5);
});

test('rejected clipping and protected collisions leave every input unchanged; explicit clip counts losses', () => {
  const source = raster(5, 1), before = structuredClone(source), selection = maskAt(5, 1, [3, 4]);
  assert.throws(() => transformPixelSelection2D(source, selection, { offset: [1, 0] }), /leave the canvas/);
  assert.throws(() => transformPixelSelection2D(source, maskAt(5, 1, [1]), { offset: [1, 0], protectedMask: maskAt(5, 1, [2]) }), /protected/);
  const out = transformPixelSelection2D(source, selection, { offset: [1, 0], boundary: 'clip' });
  assert.equal(out.clipped, 1); assert.equal(out.sprite.pixels[3], 0); assert.equal(out.sprite.pixels[4], source.pixels[3]);
  assert.deepEqual(selected(out.selection), [4]);
  const copy = transformPixelSelection2D(source, selection, { offset: [1, 0], boundary: 'clip', copy: true });
  assert.equal(copy.clipped, 1); assert.equal(copy.sprite.pixels[3], source.pixels[3]);
  assert.deepEqual(source, before);
});

test('tile wrapping is lossless for translation and rejects non-injective wrapped rotations', () => {
  const source = raster(5, 3), selection = new Uint8Array(15).fill(1);
  const out = transformPixelSelection2D(source, selection, { offset: [-1, 1], boundary: 'wrap' });
  for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++)
    assert.equal(out.sprite.pixels[((y + 1) % 3) * 5 + (x + 4) % 5], source.pixels[y * 5 + x]);
  assert.deepEqual(transformPixelSelection2D(out.sprite, out.selection, { offset: [1, -1], boundary: 'wrap' }).sprite, source);
  assert.deepEqual(out.sprite, transformPixelSelection2D(source, selection, { offset: [14, -8], boundary: 'wrap' }).sprite);
  assert.throws(() => transformPixelSelection2D(raster(2, 3), new Uint8Array(6).fill(1), { quarterTurns: 1, boundary: 'wrap' }), /multiple/);
});

test('shade brush advances authored palette steps once and preserves alpha, silhouettes and other materials', () => {
  const source = raster(8, 1, Uint32Array.of(0xff000000, 0x01444444, 0xffffffff, 0xff123456, 0x00444444, 0xff444444, 0xff444444, 0x80444444));
  source.mask.data[5] = 0; source.mask.data[7] = 255;
  source.channels = { height: new Float32Array(8) }; source.emission = new Float32Array(24);
  const snapshot = structuredClone(source), all = new Uint8Array(8).fill(1), protection = maskAt(8, 1, [6]);
  const ramp = ['#000000', '#444', '#444444', '#ffffff'];
  const light = shadePixelMask2D(source, all, ramp, 1, { protectedMask: protection });
  assert.deepEqual([...light.pixels], [0xff444444, 0x01ffffff, 0xffffffff, 0xff123456, 0x00444444, 0xff444444, 0xff444444, 0x80ffffff]);
  assert.deepEqual(light.mask.data, source.mask.data); assert.equal(light.channels, source.channels); assert.equal(light.emission, source.emission);
  const dark = shadePixelMask2D(source, all, ramp, -1, { selection: maskAt(8, 1, [0, 1, 2]) });
  assert.deepEqual([...dark.pixels.slice(0, 4)], [0xff000000, 0x01000000, 0xff444444, 0xff123456]);
  assert.deepEqual(shadePixelMask2D(source, all, ramp, 0), source); assert.deepEqual(source, snapshot);
});

test('invalid editing dimensions, options and channel layouts fail before modifying artwork', () => {
  const source = raster(2, 2), all = new Uint8Array(4).fill(1), before = structuredClone(source);
  for (const input of [{ offset: [1.5, 0] }, { offset: [Infinity, 0] }, { offset: null }, { quarterTurns: -1 }, { quarterTurns: null }, { boundary: 'smear' }, { copy: 1 }, { flipX: null }])
    assert.throws(() => validatePixelSelectionTransformOptions2D(input), RangeError);
  assert.deepEqual(validatePixelSelectionTransformOptions2D(), { offset: [0, 0], flipX: false, flipY: false, quarterTurns: 0, copy: false, boundary: 'reject' });
  assert.throws(() => pixelSelectionBounds2D(2, 2, [1, NaN, 0, 0]), RangeError);
  assert.throws(() => invertPixelSelection2D(2, 2, all, [1]), RangeError);
  assert.throws(() => rasterizePixelLasso2D(2, 2, [{ x: NaN, y: 0 }]), RangeError);
  assert.throws(() => transformPixelSelection2D(source, [1]), RangeError);
  assert.throws(() => transformPixelSelection2D({ ...source, emission: new Float32Array(3) }, all), RangeError);
  assert.throws(() => shadePixelMask2D(source, all, [0x80000000], 1), RangeError);
  assert.throws(() => shadePixelMask2D(source, all, ['#000', '#fff'], .5), RangeError);
  assert.deepEqual(source, before);
});
