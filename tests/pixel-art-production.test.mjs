import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankPixelArtDocument2D, validatePixelArtDocument2D, serializePixelArtDocument2D,
  parsePixelArtDocument2D, flattenPixelArtDocument2D, renderPixelArtDocument2D, PixelArtDocumentHistory2D } from '../build/authoring/pixel-art-document.js';
import { createPixelArtAnimation2D, addPixelArtAnimationFrame2D, duplicatePixelArtAnimationFrame2D,
  serializePixelArtAnimation2D, parsePixelArtAnimation2D } from '../build/authoring/pixel-art-animation.js';

const colors = [0xff151011, 0xff546367, 0xffc7ecd5];
function fixture() {
  return { ...createBlankPixelArtDocument2D(3, 2, 'Working palette'),
    pixels: [0xff443322, 0x01030201, 0x001e140a, 0xff557788, 0, 0], workingPalette: colors.slice() };
}

test('working swatches survive exact save/reopen without recoloring or sharing caller arrays', () => {
  const document = fixture(), saved = serializePixelArtDocument2D(document), restored = parsePixelArtDocument2D(saved);
  assert.deepEqual(restored.workingPalette, colors);
  assert.deepEqual([...renderPixelArtDocument2D(restored).pixels], document.pixels);
  restored.workingPalette[0] = 0xffffffff;
  assert.deepEqual(document.workingPalette, colors);
  assert.deepEqual(parsePixelArtDocument2D(saved).workingPalette, colors);
});

test('flatten and bounded history keep swatches independent of applied palette layers', () => {
  const document = fixture(), history = new PixelArtDocumentHistory2D(document);
  const changed = { ...document, workingPalette: [0xff332211], layers: [{ kind: 'palette', id: 'palette-1', name: 'Output colors', palette: ['#ffffff'] }] };
  history.commit(changed);
  const flat = flattenPixelArtDocument2D(changed);
  assert.deepEqual(flat.workingPalette, [0xff332211]);
  assert.equal(flat.layers.length, 0);
  assert.deepEqual(history.undo().workingPalette, colors);
  assert.deepEqual(history.redo().workingPalette, [0xff332211]);
  assert.deepEqual([...renderPixelArtDocument2D(flat).pixels], [...renderPixelArtDocument2D(changed).pixels]);
});

test('new blank cels inherit a copy of working swatches and v3 retains each frame palette', () => {
  const original = createPixelArtAnimation2D(fixture()), next = addPixelArtAnimationFrame2D(original);
  assert.deepEqual(next.frames[1].document.workingPalette, colors);
  assert(next.frames[1].document.pixels.every(value => value === 0));
  next.frames[1].document.workingPalette[0] = 0xffffffff;
  assert.deepEqual(original.frames[0].document.workingPalette, colors);
  const copy = duplicatePixelArtAnimationFrame2D(next);
  const restored = parsePixelArtAnimation2D(serializePixelArtAnimation2D(copy));
  assert.deepEqual(restored.frames.map(frame => frame.document.workingPalette), [colors, [0xffffffff, ...colors.slice(1)], [0xffffffff, ...colors.slice(1)]]);
});

test('invalid working palette metadata is rejected and old documents stay unchanged', () => {
  const empty = createBlankPixelArtDocument2D(1, 1);
  assert.equal('workingPalette' in validatePixelArtDocument2D(empty), false);
  for (const workingPalette of [[], [0x00112233], [NaN], [1.5], new Array(257).fill(0xffffffff), { length: 1, 0: 0xffffffff }, Array(1)]) {
    assert.throws(() => validatePixelArtDocument2D({ ...empty, workingPalette }), /Working palette/);
  }
  assert.deepEqual(validatePixelArtDocument2D({ ...empty, workingPalette: [0xffffffff, 0xffffffff] }).workingPalette, [0xffffffff, 0xffffffff]);
});
