import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelArtDocument2D, renderPixelArtDocument2D, renderPixelArtAuthoredHeight2D,
  serializePixelArtDocument2D, parsePixelArtDocument2D, flattenPixelArtDocument2D, writePixelArtHeightLayer2D,
  PixelArtDocumentHistory2D } from '../build/authoring/pixel-art-document.js';
import { createPixelArtAnimation2D, duplicatePixelArtAnimationFrame2D, parsePixelArtAnimation2D,
  serializePixelArtAnimation2D, renderPixelArtAnimation2D } from '../build/authoring/pixel-art-animation.js';
import { sculptPixelHeight2D } from '../build/core/pixel-sculpt.js';

const rgba = (r, g, b, a = 255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
function fixture(w = 7, h = 5) {
  const pixels = Uint32Array.from({ length: w * h }, (_, i) => rgba(50 + i, 90 + i, 110 + i, i === 0 ? 1 : 192));
  return createPixelArtDocument2D({ w, h, pixels, mask: { w, h, data: new Uint8Array(w * h).fill(1) } }, 'Native craft');
}
const height = (indices, deltas, extra = {}) => ({ kind: 'height', id: 'form', name: 'Sculpted form', indices, deltas, ...extra });
const path = (extra = {}) => ({ kind: 'path', id: 'curve', name: 'Editable native outline',
  nodes: [{ point: [1, 1] }, { point: [5, 1] }, { point: [5, 4] }, { point: [1, 4] }],
  options: { closed: true, fill: true, strokeWidth: 0 }, color: rgba(240, 190, 70), ...extra });
const withLayers = (doc, ...layers) => ({ ...doc, layers, activeLayerId: layers.at(-1)?.id });
const mask = (n, ...indices) => Array.from({ length: n }, (_, i) => Number(indices.includes(i)));

test('an explicit empty height layer initializes a neutral PNG surface without recoloring any cell', () => {
  const base = fixture(), next = withLayers(base, height([], [])), out = renderPixelArtDocument2D(next);
  assert.deepEqual(Array.from(out.pixels), base.pixels);
  assert.deepEqual(out.channels.height, new Float32Array(35));
  for (let i = 0; i < 35; i++) assert.deepEqual(Array.from(out.channels.normal.slice(i * 3, i * 3 + 3)), [0, 0, 1]);
  assert.equal(base.channels, undefined); assert.equal(base.layers.length, 0);
});

test('sparse height layers replay explicit volume, preserve exact low alpha, and update geometric neighbors', () => {
  const base = fixture(), next = withLayers(base, height([17], [4])), out = renderPixelArtDocument2D(next);
  const expected = new Float32Array(35); expected[17] = 4;
  assert.deepEqual(out.channels.height, expected); assert.deepEqual(renderPixelArtAuthoredHeight2D(next), expected);
  assert.deepEqual(Array.from(out.pixels), base.pixels); assert.equal(out.pixels[0] >>> 24, 1);
  assert.deepEqual(Array.from(out.channels.normal.slice(16 * 3, 16 * 3 + 3)), [Math.fround(-2 / Math.sqrt(5)), 0, Math.fround(1 / Math.sqrt(5))]);
  assert.deepEqual(Array.from(out.channels.normal.slice(18 * 3, 18 * 3 + 3)), [Math.fround(2 / Math.sqrt(5)), 0, Math.fround(1 / Math.sqrt(5))]);
  const hidden = renderPixelArtDocument2D(withLayers(base, height([17], [4], { visible: false })));
  assert.deepEqual(hidden, renderPixelArtDocument2D(base));
});

test('original authored height is aligned before the first sculpt layer after a native move', () => {
  const base = fixture(); base.authoredHeight = Array.from({ length: 35 }, (_, i) => i / 4);
  const move = { kind: 'transform', id: 'move', name: 'Move', selection: mask(35, 0, 1), transform: { offset: [2, 1] } };
  const doc = withLayers(base, move, height([9], [3])), out = renderPixelArtDocument2D(doc);
  assert.equal(out.channels.height[9], 3); assert.equal(out.channels.height[10], .25);
  assert.equal(out.channels.height[0], 0); assert.equal(out.channels.height[1], 0);
  assert.equal(renderPixelArtAuthoredHeight2D(doc)[9], 3); assert.equal(base.authoredHeight[1], .25);
});

test('live material form binding updates lower sculpt edits without adding prior relief twice', () => {
  const base = fixture(); base.authoredHeight = Array(35).fill(2);
  const material = { kind: 'material', id: 'material', name: 'Live form', heightSource: 'authored',
    material: { kind: 'metal', detail: 0, relief: 0, bevel: 0, light: [0, 0, 1] } };
  const first = withLayers(base, height([17], [3]), material), out = renderPixelArtDocument2D(first);
  assert.equal(out.channels.height[17], 5); assert.equal(out.channels.height[16], 2);
  const edited = withLayers(base, height([17], [5]), material);
  assert.equal(renderPixelArtDocument2D(edited).channels.height[17], 7);
  const relief = { ...material, id: 'relief', material: { kind: 'stone', seed: 7, relief: 4, detail: .7, bevel: 2 } };
  const again = withLayers(base, relief, height([17], [3]), material);
  assert.equal(renderPixelArtDocument2D(again).channels.height[17], 5);
  assert.equal(renderPixelArtAuthoredHeight2D(again)[17], 5);
});

test('saved material snapshots retain their earlier behavior alongside the new live binding', () => {
  const base = fixture(), snapshot = { kind: 'material', id: 'm', name: 'Saved form', height: Array(35).fill(9),
    material: { kind: 'metal', detail: 0, relief: 0, bevel: 0 } };
  assert.equal(renderPixelArtDocument2D(withLayers(base, height([17], [8]), snapshot)).channels.height[17], 9);
});

test('sculpt height, geometry normals, masks and source survive v2 save, flatten and undo exactly', () => {
  const base = fixture(), sculpted = withLayers(base, height([8, 9, 16, 17], [2, 4, 3, 7], { wrap: true }));
  const history = new PixelArtDocumentHistory2D(base); history.commit(sculpted);
  const out = renderPixelArtDocument2D(sculpted), opened = parsePixelArtDocument2D(serializePixelArtDocument2D(sculpted));
  assert.deepEqual(renderPixelArtDocument2D(opened), out);
  const flat = flattenPixelArtDocument2D(sculpted);
  assert.deepEqual(renderPixelArtDocument2D(flat), out); assert.deepEqual(Float32Array.from(flat.authoredHeight), renderPixelArtAuthoredHeight2D(sculpted));
  assert.deepEqual(renderPixelArtDocument2D(history.undo()), renderPixelArtDocument2D(base));
  assert.deepEqual(renderPixelArtDocument2D(history.redo()), out);
});

test('sculpt strokes coalesce without increasing layers, with strength-aware offsets and independent undo', () => {
  const base = fixture(), delta = new Float32Array(35), touched = new Uint8Array(35); delta[17] = 2; touched[17] = 1;
  const first = writePixelArtHeightLayer2D(base, delta, touched), id = first.activeLayerId;
  const weighted = { ...first, layers: [{ ...first.layers[0], strength: .5 }] };
  const second = writePixelArtHeightLayer2D(weighted, delta, touched, id);
  assert.equal(second.layers.length, 1); assert.equal(second.layers[0].deltas[0], 6);
  assert.equal(renderPixelArtDocument2D(second).channels.height[17], 3); assert.equal(first.layers[0].deltas[0], 2);
  assert.equal(writePixelArtHeightLayer2D(second, new Float32Array(35), touched, id), second);
});

test('sculpt mutation rejects locked layers, malformed changes and overflow before changing the document', () => {
  const base = fixture(), delta = new Float32Array(35), touched = new Uint8Array(35); delta[17] = 1; touched[17] = 1;
  const locked = withLayers(base, height([17], [2], { locked: true })), saved = JSON.stringify(locked);
  assert.throws(() => writePixelArtHeightLayer2D(locked, delta, touched, 'form'), /unlocked/);
  const invalid = Array(35).fill(0); invalid[17] = Infinity;
  assert.throws(() => writePixelArtHeightLayer2D(base, invalid, touched), /finite/);
  assert.throws(() => parsePixelArtDocument2D(JSON.stringify(withLayers(base, height([17, 17], [1, 1])))), /sorted/);
  assert.throws(() => parsePixelArtDocument2D(JSON.stringify(withLayers(base, height([17], [1], { strength: -1 })))), /strength/);
  assert.equal(JSON.stringify(locked), saved);
});

test('small sculpt edits after a large cancellation retain their separate exact float32 operation', () => {
  const base = fixture(1, 1); base.channels = { material: [0], height: [Math.fround(1e10)], normal: [0, 0, 1] };
  const first = withLayers(base, height([0], [-Math.fround(1e10)]));
  assert.equal(renderPixelArtDocument2D(first).channels.height[0], 0);
  const next = writePixelArtHeightLayer2D(first, [1], [1], 'form');
  assert.equal(next.layers.length, 2); assert.equal(renderPixelArtDocument2D(next).channels.height[0], 1);
  assert.equal(first.layers.length, 1); assert.equal(next.layers[0].deltas[0], -Math.fround(1e10));
});

test('coalescing retains sculpted normals after an offset cancels against an authored normal field', () => {
  const base = fixture(3, 1);
  base.channels = { material: [0, 0, 0], height: [0, 0, 0], normal: [.6, 0, .8, .6, 0, .8, .6, 0, .8] };
  const first = withLayers(base, height([1], [2])), before = renderPixelArtDocument2D(first);
  const stroke = sculptPixelHeight2D(before, [{ x: 1, y: 0 }], { mode: 'lower', size: 1, strength: 2 });
  const next = writePixelArtHeightLayer2D(first, stroke.deltas, stroke.touched, 'form');
  assert.equal(next.layers.length, 2, 'a net-zero offset must retain the new height-derived normal field');
  assert.deepEqual(renderPixelArtDocument2D(next), stroke.sprite);
  assert.deepEqual(next.layers[0], first.layers[0]);
});

test('coalescing also preserves the relief-free form when a large baked surface masks a small change', () => {
  const base = fixture(1, 1);
  base.channels = { material: [0], height: [Math.fround(1e20)], normal: [0, 0, 1] };
  base.authoredHeight = [-Math.fround(1e10)];
  const first = withLayers(base, height([0], [Math.fround(1e10)]));
  assert.equal(renderPixelArtAuthoredHeight2D(first)[0], 0);
  const next = writePixelArtHeightLayer2D(first, [1], [1], 'form');
  assert.equal(next.layers.length, 2);
  assert.equal(renderPixelArtAuthoredHeight2D(next)[0], 1);
  const material = { kind: 'material', id: 'new-surface', name: 'New material', heightSource: 'authored',
    material: { kind: 'fabric', detail: 0, relief: 0, bevel: 0 } };
  assert.equal(renderPixelArtDocument2D({ ...next, layers: [...next.layers, material] }).channels.height[0], 1);
});

test('a native path remains editable and palette-exact while honoring selection, protection and alpha lock', () => {
  const base = fixture(), region = mask(35, 8, 9, 10, 11, 15, 16, 17, 18), protect = mask(35, 9);
  const doc = withLayers(base, path({ selection: region, protectedMask: protect, alphaLock: true })), out = renderPixelArtDocument2D(doc);
  for (let i = 0; i < 35; i++) {
    const expected = region[i] && !protect[i] ? rgba(240, 190, 70, base.pixels[i] >>> 24) : base.pixels[i];
    assert.equal(out.pixels[i], expected);
  }
  const opened = parsePixelArtDocument2D(serializePixelArtDocument2D(doc));
  assert.equal(opened.layers[0].kind, 'path'); assert.equal(opened.layers[0].nodes.length, 4);
  assert.deepEqual(renderPixelArtDocument2D(opened), out); assert.deepEqual(base, fixture());
});

test('path erasure and repaint update occupancy and geometry in the same order as native painting', () => {
  const base = fixture(); base.authoredHeight = Array(35).fill(4);
  const doc = withLayers(base, height([], []), path({ color: 0 })), out = renderPixelArtDocument2D(doc);
  assert.equal(out.pixels[17], 0); assert.equal(out.mask.data[17], 0); assert.equal(out.channels.height[17], 0);
  assert.equal(renderPixelArtAuthoredHeight2D(doc)[17], 0);
  const painted = withLayers(base, height([], []), path({ color: 0 }), path({ id: 'new-curve' }));
  assert.equal(renderPixelArtDocument2D(painted).channels.height[17], 0);
  assert.equal(renderPixelArtDocument2D(painted).mask.data[17], 1);
});

test('painted occupancy reconnects sculpt normals while earlier document behavior and palette-only edits stay exact', () => {
  const base = fixture(3, 1);
  base.channels = { material: [0, 0, 0], height: [0, 6, 0], normal: [.6, 0, .8, 0, 0, 1, -.6, 0, .8] };
  const erase = { kind: 'paint', id: 'erase', name: 'Erase middle', indices: [1], pixels: [0] };
  const legacy = renderPixelArtDocument2D(withLayers(base, erase));
  assert.deepEqual([...legacy.channels.normal.slice(0, 3)], [Math.fround(.6), 0, Math.fround(.8)]);
  const sculpted = withLayers(base, height([], [], { protectedMask: mask(3, 0) }), erase);
  const out = renderPixelArtDocument2D(sculpted);
  assert.deepEqual([...out.channels.height], [0, 0, 0]);
  assert.deepEqual([...out.channels.normal], [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const palette = { kind: 'palette', id: 'palette', name: 'Color only', palette: ['#000000', '#ffffff'] };
  const recolored = renderPixelArtDocument2D(withLayers(base, height([], []), palette));
  assert.deepEqual(recolored.channels.normal, Float32Array.from(base.channels.normal));
});

test('path occupancy changes respect the current path normal protection instead of an earlier height mask', () => {
  const base = fixture(3, 1); base.authoredHeight = [0, 6, 0];
  const form = height([], []), before = renderPixelArtDocument2D(withLayers(base, form));
  const erase = path({ color: 0, nodes: [{ point: [1, 0] }, { point: [2, 0] }, { point: [2, 1] }, { point: [1, 1] }], protectedMask: mask(3, 0) });
  const out = renderPixelArtDocument2D(withLayers(base, form, erase));
  assert.equal(out.mask.data[1], 0);
  assert.deepEqual(out.channels.normal.slice(0, 3), before.channels.normal.slice(0, 3));
  assert.deepEqual([...out.channels.normal.slice(6, 9)], [0, 0, 1]);
});

test('painting into a sculpted gap and transforming a wrapped surface refresh only the new geometry neighborhood', () => {
  const base = fixture(3, 1); base.mask = [1, 0, 1]; base.authoredHeight = [0, 0, 4];
  const paint = { kind: 'paint', id: 'paint', name: 'Connect gap', indices: [1], pixels: [rgba(90, 120, 170)] };
  const out = renderPixelArtDocument2D(withLayers(base, height([], []), paint));
  assert.deepEqual([...out.channels.height], [0, 0, 4]);
  assert.deepEqual([...out.channels.normal.slice(3, 6)], [Math.fround(-2 / Math.sqrt(5)), 0, Math.fround(1 / Math.sqrt(5))]);
  assert.deepEqual([...out.channels.normal.slice(6, 9)], [Math.fround(-4 / Math.sqrt(17)), 0, Math.fround(1 / Math.sqrt(17))]);
  const tile = fixture(4, 1); tile.authoredHeight = [0, 0, 0, 4];
  const move = { kind: 'transform', id: 'move', name: 'Wrapped shift', selection: [1, 1, 1, 1], transform: { offset: [1, 0], boundary: 'wrap' } };
  const erase = { kind: 'paint', id: 'erase', name: 'Open seam', indices: [1], pixels: [0] };
  const shifted = renderPixelArtDocument2D(withLayers(tile, height([], [], { wrap: true, protectedMask: mask(4, 0) }), move, erase));
  assert.deepEqual([...shifted.channels.height], [4, 0, 0, 0]);
  assert.deepEqual([...shifted.channels.normal.slice(0, 3)], [Math.fround(-4 / Math.sqrt(17)), 0, Math.fround(1 / Math.sqrt(17))]);
});

test('height and path cels are independent in v3 and preserve exact native geometry through round trips', () => {
  const doc = withLayers(fixture(), path(), height([17], [3]));
  const animation = duplicatePixelArtAnimationFrame2D(createPixelArtAnimation2D(doc));
  animation.frames[1].document.layers[0].nodes[0].point[0] = 2;
  animation.frames[1].document.layers[1].deltas[0] = 7;
  assert.equal(animation.frames[0].document.layers[0].nodes[0].point[0], 1);
  assert.equal(animation.frames[0].document.layers[1].deltas[0], 3);
  const reopened = parsePixelArtAnimation2D(serializePixelArtAnimation2D(animation));
  assert.deepEqual(renderPixelArtAnimation2D(reopened), renderPixelArtAnimation2D(animation));
});

test('height protection retains source values and permits normal relighting without changing the form', () => {
  const base = fixture(), protectedMask = mask(35, 17), form = height([16, 17], [2, 9], { protectedMask });
  const light = { kind: 'relight', id: 'light', name: 'Form light', lighting: { ambient: .2, lights: [{ direction: [-1, -1, 1] }], specular: 0 } };
  const raw = renderPixelArtDocument2D(withLayers(base, form)), lit = renderPixelArtDocument2D(withLayers(base, form, light));
  assert.equal(raw.channels.height[17], 0); assert.equal(raw.channels.height[16], 2);
  assert.deepEqual(raw.channels, lit.channels); assert.ok(lit.pixels.some((c, i) => c !== base.pixels[i]));
  assert.ok(lit.pixels.every((c, i) => (c >>> 24) === (base.pixels[i] >>> 24)));
});
