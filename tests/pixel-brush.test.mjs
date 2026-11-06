import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rasterizePixelBrush2D, rasterizePixelShape2D, paintPixelMask2D, selectPixelRegion2D,
  combinePixelSelections2D, resizePixelSelection2D,
} from '../build/core/pixel-brush.js';

const area = mask => mask.reduce((sum, value) => sum + Number(!!value), 0);
const cell = (mask, w, x, y) => mask[y * w + x];
const sprite = (w, h, pixels = new Uint32Array(w * h)) => ({
  w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, c => c >>> 24 ? 1 : 0) },
});

test('sparse pointer events make a continuous native line in every octant, independent of direction', () => {
  const w = 41, h = 41, a = { x: 20, y: 20 };
  for (const [dx, dy] of [[17, 6], [6, 17], [-17, 6], [-6, 17], [17, -6], [6, -17], [-17, -6], [-6, -17], [0, 17], [17, 0]]) {
    const b = { x: a.x + dx, y: a.y + dy }, mask = rasterizePixelBrush2D(w, h, [a, b]);
    assert.deepEqual(mask, rasterizePixelBrush2D(w, h, [b, a]), `reverse (${dx},${dy})`);
    assert.equal(area(mask), Math.max(Math.abs(dx), Math.abs(dy)) + 1);
    assert.equal(cell(mask, w, a.x, a.y), 1); assert.equal(cell(mask, w, b.x, b.y), 1);
    const connected = selectPixelRegion2D(sprite(w, h, Uint32Array.from(mask, value => value ? 0xffffffff : 0)), a, { connectivity: 8 });
    assert.deepEqual(connected, mask, 'all interpolated cells form one 8-connected component');
  }
});

test('clipping a stroke keeps its original stair-step phase and never walks the remote endpoint range', () => {
  const points = [{ x: -14, y: -3 }, { x: 43, y: 19 }], small = rasterizePixelBrush2D(24, 16, points);
  const offset = 20, large = rasterizePixelBrush2D(84, 64, points.map(p => ({ x: p.x + offset, y: p.y + offset })));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++)
    assert.equal(small[y * 24 + x], large[(y + offset) * 84 + x + offset]);
  assert.equal(area(rasterizePixelBrush2D(8, 8, [{ x: -1_000_000, y: 3 }, { x: 1_000_000, y: 3 }])), 8);
  assert.equal(area(rasterizePixelBrush2D(8, 8, [{ x: -1_000_000, y: -3 }, { x: 1_000_000, y: -3 }])), 0);
});

test('pixel-perfect cleanup removes only the current stroke corner, preserving pre-existing artwork', () => {
  const points = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  const raw = rasterizePixelBrush2D(5, 5, points), clean = rasterizePixelBrush2D(5, 5, points, { pixelPerfect: true });
  assert.equal(area(raw), 3); assert.equal(area(clean), 2); assert.equal(cell(clean, 5, 2, 1), 0);
  assert.equal(cell(clean, 5, 1, 1), 1); assert.equal(cell(clean, 5, 2, 2), 1);
  const source = sprite(5, 5); source.pixels[7] = 0xff0a0b0c; source.mask.data[7] = 1;
  const painted = paintPixelMask2D(source, clean, 0xffd0e0f0);
  assert.equal(painted.pixels[7], source.pixels[7]); assert.equal(painted.mask.data[7], 1);
  assert.equal(painted.pixels[6], 0xffd0e0f0); assert.equal(painted.pixels[12], 0xffd0e0f0);
  assert.deepEqual(rasterizePixelBrush2D(5, 5, points, { size: 3, pixelPerfect: true }),
    rasterizePixelBrush2D(5, 5, points, { size: 3 }), 'corner cleanup does not hollow out wider tips');
});

test('zero pressure paints nothing, diameter pressure is interpolated, and tips stay binary', () => {
  assert.equal(area(rasterizePixelBrush2D(20, 20, [{ x: 8, y: 8, pressure: 0 }], { size: 7 })), 0);
  assert.equal(area(rasterizePixelBrush2D(20, 20, [{ x: 8, y: 8, pressure: .5 }], { size: 6, tip: 'square' })), 9);
  const mask = rasterizePixelBrush2D(32, 24, [{ x: 4, y: 12, pressure: 0 }, { x: 26, y: 12, pressure: 1 }], { size: 8 });
  assert.equal(cell(mask, 32, 4, 12), 0);
  for (let x = 5; x <= 26; x++) assert.equal(cell(mask, 32, x, 12), 1, 'pressure never leaves gaps along the positive-pressure centerline');
  assert.ok(area(mask) > 70); assert.ok(mask.every(value => value === 0 || value === 1));
  assert.ok(area(rasterizePixelBrush2D(16, 16, [{ x: 7, y: 7 }], { size: 8, tip: 'round' }))
    < area(rasterizePixelBrush2D(16, 16, [{ x: 7, y: 7 }], { size: 8, tip: 'square' })));
});

test('symmetry mirrors complete odd/even brush footprints and overlap is painted only once', () => {
  for (const [w, h] of [[10, 8], [11, 9]]) for (const size of [1, 2, 3, 4]) {
    const mask = rasterizePixelBrush2D(w, h, [{ x: 1, y: 1 }, { x: 4, y: 3 }], { size, symmetry: 'xy' });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      assert.equal(cell(mask, w, x, y), cell(mask, w, w - 1 - x, y));
      assert.equal(cell(mask, w, x, y), cell(mask, w, x, h - 1 - y));
    }
    const painted = paintPixelMask2D(sprite(w, h), mask, 0x80ffffff, { mode: 'over' });
    for (let i = 0; i < mask.length; i++) assert.equal(painted.pixels[i] >>> 24, mask[i] ? 128 : 0);
  }
});

test('inclusive drag shapes provide symmetric ellipses, inward outlines and degenerate one-cell shapes', () => {
  const filled = rasterizePixelShape2D(12, 10, 'rectangle', [2, 2], [8, 6], { filled: true });
  const ring = rasterizePixelShape2D(12, 10, 'rectangle', [8, 6], [2, 2]);
  assert.equal(area(filled), 35); assert.equal(area(ring), 20);
  assert.equal(cell(ring, 12, 5, 4), 0); assert.equal(cell(ring, 12, 2, 4), 1);
  const ellipse = rasterizePixelShape2D(13, 13, 'ellipse', [1, 2], [11, 10], { filled: true });
  const outline = rasterizePixelShape2D(13, 13, 'ellipse', [1, 2], [11, 10]);
  assert.ok(area(ellipse) > area(outline)); assert.equal(cell(ellipse, 13, 1, 2), 0);
  assert.equal(cell(ellipse, 13, 6, 6), 1); assert.equal(cell(outline, 13, 6, 6), 0);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    assert.equal(cell(ellipse, 13, x, y), cell(ellipse, 13, 12 - x, y));
    assert.equal(cell(ellipse, 13, x, y), cell(ellipse, 13, x, 12 - y));
  }
  for (const shape of ['rectangle', 'ellipse', 'line'])
    assert.equal(area(rasterizePixelShape2D(5, 5, shape, [2, 2], [2, 2])), 1);
  assert.equal(area(rasterizePixelShape2D(5, 5, 'rectangle', [-4, -4], [-1, -1], { filled: true })), 0);
  const thin = rasterizePixelShape2D(105, 7, 'ellipse', [2, 2], [101, 4]);
  const thinSprite = sprite(105, 7, Uint32Array.from(thin, value => value ? 0xffffffff : 0));
  const first = thin.findIndex(Boolean);
  assert.equal(area(selectPixelRegion2D(thinSprite, { x: first % 105, y: Math.floor(first / 105) }, { connectivity: 8 })),
    area(thin), 'native outline keeps the end caps attached even on an extremely wide 3-cell ellipse');
  assert.equal(area(rasterizePixelShape2D(5, 5, 'ellipse', [-100, -100], [100, 100])), 0,
    'clipping a large ellipse does not create a false outline at the canvas boundary');
});

test('paint respects masks, exact palette colors, independent source silhouettes and metadata', () => {
  const source = sprite(5, 1, Uint32Array.of(0xff010203, 0x80556677, 0xff123456, 0, 0xffabcdef));
  source.mask.data[4] = 0;
  source.x = -7; source.channels = { height: new Float32Array(5) }; source.emission = new Float32Array(15);
  const snapshot = structuredClone(source), selected = Uint8Array.of(1, 1, 1, 1, 0), protectedMask = Uint8Array.of(0, 1, 0, 0, 0);
  const out = paintPixelMask2D(source, new Uint8Array(5).fill(1), 0x70345678, { selection: selected, protectedMask });
  assert.deepEqual([...out.pixels], [0x70345678, source.pixels[1], 0x70345678, 0x70345678, source.pixels[4]]);
  assert.deepEqual([...out.mask.data], [1, 1, 1, 1, 0]);
  assert.deepEqual(source, snapshot); assert.notEqual(source.pixels, out.pixels); assert.notEqual(source.mask.data, out.mask.data);
  assert.equal(out.channels, source.channels); assert.equal(out.emission, source.emission); assert.equal(out.x, -7);
  const erased = paintPixelMask2D(out, Uint8Array.of(1, 0, 0, 0, 0), null);
  assert.equal(erased.pixels[0], 0); assert.equal(erased.mask.data[0], 0);
  assert.equal(out.pixels[0], 0x70345678);
});

test('alpha lock preserves fractional coverage, mask values and hidden pixels, including locked erasure', () => {
  const source = sprite(4, 1, Uint32Array.of(0x40030201, 0xff665544, 0, 0x80fedcba));
  source.mask.data[0] = 255; source.mask.data[3] = 0;
  const all = new Uint8Array(4).fill(1), replaced = paintPixelMask2D(source, all, 0xffabcdef, { alphaLock: true });
  assert.equal(replaced.pixels[0], 0x40abcdef); assert.equal(replaced.pixels[1], 0xffabcdef);
  assert.equal(replaced.pixels[2], 0); assert.equal(replaced.pixels[3], source.pixels[3]);
  assert.deepEqual(replaced.mask.data, source.mask.data);
  assert.deepEqual(paintPixelMask2D(source, all, null, { alphaLock: true }), source);
  assert.deepEqual(paintPixelMask2D(source, all, 0x00112233, { alphaLock: true }), source);
});

test('explicit source-over and locked source-atop use straight alpha without hidden-color fringes', () => {
  const source = sprite(3, 1, Uint32Array.of(0x400000ff, 0x400000ff, 0xff00ff00));
  source.mask.data[2] = 0;
  const mask = new Uint8Array(3).fill(1), ink = 0x80ff0000;
  const over = paintPixelMask2D(source, mask, ink, { mode: 'over' });
  // Independent Porter-Duff expectation: 50% blue over 25% red yields ~62.65% coverage.
  const sa = 128 / 255, da = 64 / 255, a = sa + da * (1 - sa);
  assert.equal(over.pixels[0] >>> 24, Math.round(a * 255));
  assert.equal(over.pixels[0] & 255, Math.round(255 * da * (1 - sa) / a));
  assert.equal(over.pixels[0] >>> 16 & 255, Math.round(255 * sa / a));
  assert.equal(over.pixels[2], ink, 'masked green is not a visible destination');
  const atop = paintPixelMask2D(source, mask, ink, { mode: 'over', alphaLock: true });
  assert.equal(atop.pixels[0], 0x4080007f); assert.equal(atop.pixels[0] >>> 24, 64);
  assert.equal(atop.pixels[2], source.pixels[2]); assert.equal(atop.mask.data[2], 0);
  assert.deepEqual(paintPixelMask2D(source, mask, 0x00010203, { mode: 'over' }), source);
});

test('connected selection compares every cell to the seed without growing through similar-color chains', () => {
  const source = sprite(6, 1, Uint32Array.of(0xff202020, 0xff252525, 0xff2a2a2a, 0xff2f2f2f, 0xff000000, 0xff202020));
  assert.deepEqual([...selectPixelRegion2D(source, { x: 0, y: 0 }, { tolerance: 7 })], [1, 1, 0, 0, 0, 0]);
  assert.deepEqual([...selectPixelRegion2D(source, { x: 0, y: 0 }, { tolerance: 7, contiguous: false })], [1, 1, 0, 0, 0, 1]);
  const constraint = Uint8Array.of(1, 0, 1, 1, 1, 1);
  assert.deepEqual([...selectPixelRegion2D(source, { x: 0, y: 0 }, { tolerance: 255, selection: constraint })], [1, 0, 0, 0, 0, 0]);
});

test('bucket handles blank canvases, hidden RGB, diagonal islands and optional alpha matching', () => {
  const empty = sprite(8, 6);
  assert.equal(area(selectPixelRegion2D(empty, { x: 1, y: 1 })), 0);
  assert.equal(area(selectPixelRegion2D(empty, { x: 1, y: 1 }, { includeTransparent: true })), 48);
  const source = sprite(3, 3, Uint32Array.of(0xffffffff, 0, 0, 0, 0x80ffffff, 0, 0, 0, 0xffffffff));
  assert.equal(area(selectPixelRegion2D(source, { x: 0, y: 0 })), 1);
  assert.equal(area(selectPixelRegion2D(source, { x: 0, y: 0 }, { connectivity: 8 })), 3);
  assert.equal(area(selectPixelRegion2D(source, { x: 0, y: 0 }, { connectivity: 8, matchAlpha: true })), 1);
  source.pixels[2] = 0xffabcdef; // Existing independent silhouette still hides this opaque RGB.
  const transparent = selectPixelRegion2D(source, { x: 1, y: 0 }, { includeTransparent: true, contiguous: false });
  assert.equal(area(transparent), 6); assert.equal(transparent[2], 1);
  assert.equal(area(selectPixelRegion2D(source, { x: -1, y: 0 }, { includeTransparent: true })), 0);
});

test('selection set operations normalize masks without mutating either operand', () => {
  const a = Uint8Array.of(255, 0, 1, 0), b = Uint8Array.of(1, 7, 0, 0), first = a.slice(), second = b.slice();
  for (const [operation, expected] of [
    ['replace', [1, 1, 0, 0]], ['add', [1, 1, 1, 0]], ['subtract', [0, 0, 1, 0]],
    ['intersect', [1, 0, 0, 0]], ['xor', [0, 1, 1, 0]],
  ]) assert.deepEqual([...combinePixelSelections2D(a, b, operation)], expected);
  assert.deepEqual(a, first); assert.deepEqual(b, second);
});

test('selection grow is an exact Euclidean disc and erosion includes the unselected canvas exterior', () => {
  const w = 15, h = 13, one = new Uint8Array(w * h); one[6 * w + 7] = 1;
  const grown = resizePixelSelection2D(w, h, one, 5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    assert.equal(grown[y * w + x], Number((x - 7) ** 2 + (y - 6) ** 2 <= 25));
  assert.equal(cell(grown, w, 10, 10), 1, 'a 3-4-5 diagonal uses Euclidean distance, not a diamond distance');
  const full = new Uint8Array(9 * 7).fill(255), shrunk = resizePixelSelection2D(9, 7, full, -2);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++)
    assert.equal(shrunk[y * 9 + x], Number(x >= 2 && x < 7 && y >= 2 && y < 5));
  assert.equal(area(resizePixelSelection2D(w, h, one, -1)), 0);
  assert.equal(area(resizePixelSelection2D(2, 2, new Uint8Array(4), 4096)), 0);
  assert.equal(area(resizePixelSelection2D(2, 2, new Uint8Array(4).fill(1), -4096)), 0);
  assert.deepEqual([...resizePixelSelection2D(2, 2, Uint8Array.of(0, 3, 255, 0), 0)], [0, 1, 1, 0]);
});

test('selection erosion responds to authored internal holes without altering the art or input mask', () => {
  const w = 11, h = 11, selection = new Uint8Array(w * h).fill(1); selection[5 * w + 5] = 0;
  const snapshot = selection.slice(), radius = 2, shrunk = resizePixelSelection2D(w, h, selection, -radius);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const distanceToOutside = Math.min(x + 1, y + 1, w - x, h - y);
    assert.equal(shrunk[y * w + x], Number(distanceToOutside > radius && (x - 5) ** 2 + (y - 5) ** 2 > radius ** 2));
  }
  assert.deepEqual(selection, snapshot);
});

test('invalid brush, shape, paint and selection inputs reject before changing artwork', () => {
  const source = sprite(3, 3, new Uint32Array(9).fill(0xff234567)), before = structuredClone(source), all = new Uint8Array(9).fill(1);
  for (const options of [{ size: 0 }, { size: 1.5 }, { size: 257 }, { tip: 'blur' }, { symmetry: 'radial' }])
    assert.throws(() => rasterizePixelBrush2D(3, 3, [{ x: 1, y: 1 }], options), RangeError);
  for (const point of [{ x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1, y: 1, pressure: -1 }, { x: 1, y: 1, pressure: 2 }])
    assert.throws(() => rasterizePixelBrush2D(3, 3, [point]), RangeError);
  assert.throws(() => rasterizePixelShape2D(3, 3, 'triangle', [0, 0], [2, 2]), RangeError);
  assert.throws(() => paintPixelMask2D(source, [1], 0xffffffff), RangeError);
  assert.throws(() => paintPixelMask2D(source, all, NaN), RangeError);
  assert.throws(() => paintPixelMask2D(source, all, 0xffffffff, { selection: new Uint8Array(8) }), RangeError);
  assert.throws(() => selectPixelRegion2D(source, { x: 1, y: 1 }, { tolerance: -1 }), RangeError);
  assert.throws(() => selectPixelRegion2D(source, { x: 1, y: 1 }, { connectivity: 6 }), RangeError);
  assert.throws(() => resizePixelSelection2D(3, 3, all, 1.5), RangeError);
  assert.throws(() => combinePixelSelections2D(all, [1]), RangeError);
  assert.deepEqual(source, before);
});
