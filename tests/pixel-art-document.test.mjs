import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelArtProject2D, renderPixelArtProject2D } from '../build/authoring/pixel-art-project.js';
import { createPixelArtDocument2D, createBlankPixelArtDocument2D, validatePixelArtDocument2D, upgradePixelArtProject2D,
  renderPixelArtDocument2D, writePixelArtPaintLayer2D, flattenPixelArtDocument2D, serializePixelArtDocument2D, parsePixelArtDocument2D,
  PixelArtDocumentHistory2D } from '../build/authoring/pixel-art-document.js';

const A = 0xff302010, B = 0xff90a0b0, C = 0xffd04020;
function fixture() {
  return { w: 4, h: 2, pixels: Uint32Array.from([A, A, A, 0x00123456, B, 0x7f123456, C, A]),
    mask: { w: 4, h: 2, data: Uint8Array.from([1, 1, 1, 0, 1, 1, 1, 0]) } };
}
const paintLayer = (id, indices, pixels, extra = {}) => ({ kind: 'paint', id, name: id, indices, pixels, ...extra });

test('v1 material documents upgrade without changing source, coverage or geometry channels', () => {
  const project = createPixelArtProject2D(fixture(), 'Earlier artwork');
  project.layers.push({ name: 'Fine stone', material: { kind: 'stone', seed: 71, scale: 5, bevel: 2 },
    selection: [1, 0, 1, 1, 1, 1, 1, 1], protectedMask: [0, 0, 0, 0, 1, 0, 0, 0], height: [0, 1, 0, 0, 1, 2, 1, 0] });
  const before = structuredClone(project), old = renderPixelArtProject2D(project), upgraded = upgradePixelArtProject2D(project);
  assert.equal(upgraded.schema, 'poku-pixel-art/v2');
  assert.equal(upgraded.layers[0].kind, 'material');
  assert.deepEqual(renderPixelArtDocument2D(upgraded), old);
  assert.deepEqual(renderPixelArtDocument2D(parsePixelArtDocument2D(JSON.stringify(project))), old);
  assert.deepEqual(project, before);
});

test('sparse paint replaces exact cells, exposes newly painted mask cells and explicitly erases', () => {
  const doc = createPixelArtDocument2D(fixture()), before = structuredClone(doc);
  doc.layers.push(paintLayer('ink', [1, 3, 6, 7], [B, C, 0, 0x41112233]));
  const result = renderPixelArtDocument2D(doc);
  assert.deepEqual([...result.pixels], [A, B, A, C, B, 0x7f123456, 0, 0x41112233]);
  assert.deepEqual([...result.mask.data], [1, 1, 1, 1, 1, 1, 0, 1]);
  assert.deepEqual(doc.pixels, before.pixels);
  assert.deepEqual(doc.mask, before.mask);
});

test('visibility and layer order compose deterministically; locks do not hide artwork', () => {
  const doc = createBlankPixelArtDocument2D(2, 1);
  const red = paintLayer('red', [0, 1], [C, C], { locked: true }), blue = paintLayer('blue', [1], [B]);
  doc.layers = [red, blue]; assert.deepEqual([...renderPixelArtDocument2D(doc).pixels], [C, B]);
  doc.layers = [blue, red]; assert.deepEqual([...renderPixelArtDocument2D(doc).pixels], [C, C]);
  doc.layers = [red, { ...blue, visible: false }]; assert.deepEqual([...renderPixelArtDocument2D(doc).pixels], [C, C]);
});

test('partial paint replacement uses alpha-weighted colors and partial erasure without black halos', () => {
  const doc = createPixelArtDocument2D({ w: 2, h: 1, pixels: Uint32Array.from([0xffff0000, 0xff00ffff]), mask: { w: 2, h: 1, data: Uint8Array.of(1, 1) } });
  doc.layers = [paintLayer('half', [0, 1], [0x80ffffff, 0], { opacity: .5 })];
  const out = renderPixelArtDocument2D(doc);
  assert.equal(out.pixels[0] >>> 24, 192);
  assert.equal(out.pixels[0] & 255, 85);
  assert.equal(out.pixels[0] >>> 16 & 255, 255);
  assert.equal(out.pixels[1], 0x8000ffff, 'erasure lowers coverage while retaining the old nonblack RGB');
});

test('editing a sparse paint layer groups many strokes without consuming layers or aliasing state', () => {
  const doc = createBlankPixelArtDocument2D(4, 1), one = { w: 4, h: 1, pixels: Uint32Array.from([A, 0, 0, 0]), mask: { w: 4, h: 1, data: Uint8Array.of(1, 0, 0, 0) } };
  const first = writePixelArtPaintLayer2D(doc, one, Uint8Array.of(1, 0, 0, 0));
  const nextRaster = { ...one, pixels: Uint32Array.from([A, B, 0, C]), mask: { w: 4, h: 1, data: Uint8Array.of(1, 1, 0, 1) } };
  const second = writePixelArtPaintLayer2D(first, nextRaster, Uint8Array.of(0, 1, 0, 1), first.activeLayerId);
  assert.equal(second.layers.length, 1);
  assert.deepEqual(second.layers[0].indices, [0, 1, 3]);
  assert.deepEqual([...renderPixelArtDocument2D(second).pixels], [A, B, 0, C]);
  assert.deepEqual(first.layers[0].indices, [0]);
  assert.equal(doc.layers.length, 0);
  assert.equal(writePixelArtPaintLayer2D(second, nextRaster, new Uint8Array(4), second.activeLayerId), second, 'no-op strokes have no history entry');
});

test('locked/hidden layers reject writes and paint input cannot silently target another layer', () => {
  const doc = createPixelArtDocument2D(fixture());
  doc.layers = [paintLayer('ink', [], [], { locked: true })];
  assert.throws(() => writePixelArtPaintLayer2D(doc, fixture(), new Uint8Array(8).fill(1), 'ink'), /unlocked/);
  doc.layers[0] = { ...doc.layers[0], locked: false, visible: false };
  assert.throws(() => writePixelArtPaintLayer2D(doc, fixture(), new Uint8Array(8), 'ink'), /visible/);
  assert.throws(() => writePixelArtPaintLayer2D(doc, fixture(), new Uint8Array(8), 'missing'), /exist/);
});

test('palette adjustments can follow paint while exact coverage, selection and protected details survive', () => {
  const doc = createPixelArtDocument2D(fixture());
  doc.layers = [paintLayer('accent', [3], [C]), { kind: 'palette', id: 'colors', name: 'Colors', palette: [B],
    selection: [1, 1, 0, 1, 1, 1, 1, 1], protectedMask: [0, 1, 0, 0, 0, 0, 0, 0] }];
  const out = renderPixelArtDocument2D(doc);
  assert.deepEqual([...out.pixels], [B, A, A, B, B, 0x7f90a0b0, B, A]);
  assert.deepEqual([...out.mask.data], [1, 1, 1, 1, 1, 1, 1, 0]);
});

test('v2 round trips material, sparse painting, palette layers, edit masks and active selection', () => {
  const doc = createPixelArtDocument2D(fixture(), '편집 원화');
  doc.layers = [{ kind: 'material', id: 'surface', name: 'Relief', material: { kind: 'metal', seed: 19 }, height: [0, 1, 2, 0, 2, 3, 4, 0] }, paintLayer('detail', [0, 3], [0, B]),
    { kind: 'palette', id: 'ramp', name: 'Final colors', palette: [A, B, C], dither: 'bayer4', origin: [-3, 5] }];
  doc.selection = [1, 1, 0, 0, 0, 1, 1, 1]; doc.protectedMask = [0, 1, 0, 0, 0, 0, 0, 0]; doc.activeLayerId = 'detail';
  const before = structuredClone(doc), json = serializePixelArtDocument2D(doc), reopened = parsePixelArtDocument2D(json);
  assert.equal(serializePixelArtDocument2D(reopened), json);
  assert.deepEqual(renderPixelArtDocument2D(reopened), renderPixelArtDocument2D(doc));
  assert.deepEqual(doc, before);
  assert.deepEqual(reopened.selection, doc.selection); assert.equal(reopened.activeLayerId, 'detail');
});

test('flattening keeps geometry and exact colors; added or erased paint resets only affected geometry', () => {
  const doc = createPixelArtDocument2D(fixture());
  doc.layers = [{ kind: 'material', id: 'mat', name: 'Volume', material: { kind: 'stone', seed: 7 }, height: [1, 2, 3, 0, 2, 4, 5, 0] }, paintLayer('ink', [0, 3], [0, B])];
  const before = renderPixelArtDocument2D(doc), flattened = flattenPixelArtDocument2D(doc);
  assert.equal(flattened.layers.length, 0);
  assert.deepEqual(renderPixelArtDocument2D(flattened), before);
  assert.deepEqual(renderPixelArtDocument2D(parsePixelArtDocument2D(serializePixelArtDocument2D(flattened))), before);
  assert.equal(before.channels.material[0], 0); assert.equal(before.channels.material[3], 0);
  assert.deepEqual([...before.channels.normal.slice(9, 12)], [0, 0, 1]);
  assert.ok(before.channels.material[1] > 0);
});

test('history restores entire documents across dimensions, truncates redo after editing and isolates snapshots', () => {
  const initial = createBlankPixelArtDocument2D(3, 2), history = new PixelArtDocumentHistory2D(initial, 4);
  const drawn = { ...initial, layers: [paintLayer('stroke', [0], [A])] };
  assert.equal(history.commit(initial), false);
  history.commit(drawn); history.commit(createBlankPixelArtDocument2D(8, 8));
  assert.deepEqual(renderPixelArtDocument2D(history.undo()).pixels, renderPixelArtDocument2D(drawn).pixels);
  assert.equal(history.value.width, 3); assert.equal(history.redo().width, 8);
  history.undo(); history.commit({ ...drawn, name: 'A branch' }); assert.equal(history.canRedo, false);
  const detached = history.value; detached.pixels[0] = B;
  assert.equal(history.value.pixels[0], 0);
});

test('history count and memory budgets bound large edits without discarding current artwork', () => {
  const doc = createBlankPixelArtDocument2D(4, 4), history = new PixelArtDocumentHistory2D(doc, 2, 8192);
  for (let i = 0; i < 5; i++) history.commit({ ...doc, name: String(i) });
  assert.equal(history.undo().name, '3'); assert.equal(history.undo().name, '2'); assert.equal(history.canUndo, false);
  const small = new PixelArtDocumentHistory2D(doc, 64, 1);
  small.commit({ ...doc, name: 'Kept current' }); assert.equal(small.canUndo, false); assert.equal(small.value.name, 'Kept current');
});

test('document import rejects ambiguous sparse ownership, invalid active layers and foreign schemas', () => {
  const doc = createBlankPixelArtDocument2D(2, 2);
  for (const layer of [paintLayer('x', [1, 1], [A, B]), paintLayer('x', [2, 1], [A, B]), paintLayer('x', [4], [A]), paintLayer('x', [0], []), paintLayer('x', [0], [A], { opacity: 2 })])
    assert.throws(() => validatePixelArtDocument2D({ ...doc, layers: [layer] }));
  assert.throws(() => validatePixelArtDocument2D({ ...doc, activeLayerId: 'missing' }));
  assert.throws(() => validatePixelArtDocument2D({ ...doc, layers: [paintLayer('x', [], []), paintLayer('x', [], [])] }));
  assert.throws(() => validatePixelArtDocument2D({ ...doc, schema: 'poku.project/v1' }));
});
