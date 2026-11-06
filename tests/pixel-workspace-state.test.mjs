import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlankPixelArtDocument2D, validatePixelArtDocument2D, renderPixelArtDocument2D,
  serializePixelArtDocument2D, parsePixelArtDocument2D, flattenPixelArtDocument2D, PixelArtDocumentHistory2D,
} from '../build/authoring/pixel-art-document.js';
import {
  createPixelArtAnimation2D, duplicatePixelArtAnimationFrame2D, serializePixelArtAnimation2D,
  parsePixelArtAnimation2D, validatePixelArtAnimation2D, renderPixelArtAnimation2D, PixelArtAnimationHistory2D,
} from '../build/authoring/pixel-art-animation.js';
import { hex } from '../build/core/color.js';

const palette = [hex('#183042'), hex('#6eab94'), hex('#f5dfab')];
const fixture = () => ({ ...createBlankPixelArtDocument2D(4, 3, 'Workspace swatches'), pixels: Array(12).fill(hex('#ab6521') >>> 0) });

test('working swatches preserve ordered exact RGBA independently from rendered pixels', () => {
  const source = fixture(), input = { ...source, workingPalette: [...palette, 0x19123456, 0x00123456] };
  const before = renderPixelArtDocument2D(source), normalized = validatePixelArtDocument2D(input);
  assert.deepEqual(normalized.workingPalette, input.workingPalette.map(c => c >>> 0));
  assert.deepEqual(renderPixelArtDocument2D(normalized), before);
  const reopened = parsePixelArtDocument2D(serializePixelArtDocument2D(input));
  assert.deepEqual(reopened.workingPalette, normalized.workingPalette);
  reopened.workingPalette[0] = 0;
  assert.equal(input.workingPalette[0], palette[0]);
});

test('flatten and document history retain swatches without applying a palette layer', () => {
  const original = { ...fixture(), workingPalette: palette }, history = new PixelArtDocumentHistory2D(original);
  const painted = { ...original, layers: [{ kind: 'paint', id: 'ink', name: 'Ink', indices: [5], pixels: [hex('#ffe090') >>> 0] }] };
  history.commit(painted);
  const baked = flattenPixelArtDocument2D(painted);
  assert.deepEqual(baked.workingPalette, palette.map(c => c >>> 0)); assert.equal(baked.layers.length, 0);
  assert.deepEqual(renderPixelArtDocument2D(baked), renderPixelArtDocument2D(painted));
  assert.deepEqual(history.undo().workingPalette, baked.workingPalette);
  assert.deepEqual(history.redo().workingPalette, baked.workingPalette);
});

test('v3 shared workspace swatches and per-cel metadata survive independent cloning and history', () => {
  const base = createPixelArtAnimation2D({ ...fixture(), workingPalette: palette });
  const animation = duplicatePixelArtAnimationFrame2D(base);
  animation.workingPalette = [hex('#331144'), hex('#ccaa88')];
  animation.frames[1].document.workingPalette[0] = hex('#883311') >>> 0;
  assert.equal(animation.frames[0].document.workingPalette[0], palette[0] >>> 0);
  const before = renderPixelArtAnimation2D(animation), reopened = parsePixelArtAnimation2D(serializePixelArtAnimation2D(animation));
  assert.deepEqual(reopened.workingPalette, animation.workingPalette.map(c => c >>> 0));
  assert.deepEqual(renderPixelArtAnimation2D(reopened), before);
  const history = new PixelArtAnimationHistory2D(base); history.commit(animation);
  assert.deepEqual(history.undo().workingPalette, palette.map(c => c >>> 0));
  assert.deepEqual(history.redo().workingPalette, reopened.workingPalette);
});

test('documents without workspace metadata keep their existing serialization and raster', () => {
  const source = fixture(), parsed = parsePixelArtDocument2D(serializePixelArtDocument2D(source));
  assert.ok(!Object.hasOwn(parsed, 'workingPalette'));
  assert.equal(serializePixelArtDocument2D(source), serializePixelArtDocument2D({ ...source, workingPalette: undefined }));
  const animation = createPixelArtAnimation2D(source);
  assert.ok(!Object.hasOwn(animation, 'workingPalette'));
  assert.equal(serializePixelArtAnimation2D(animation), serializePixelArtAnimation2D({ ...animation, workingPalette: undefined }));
});

test('working palette preserves the full 256-color palette-layer contract', () => {
  const full = Array.from({ length: 256 }, (_, i) => (0xff000000 | i << 16 | (255 - i) << 8 | i) >>> 0);
  const source = { ...fixture(), workingPalette: full,
    layers: [{ kind: 'palette', id: 'palette-256', name: 'Full palette', palette: full, strength: 0 }] };
  const reopened = parsePixelArtDocument2D(serializePixelArtDocument2D(source));
  assert.deepEqual(reopened.workingPalette, full); assert.deepEqual(reopened.layers[0].palette, full);
  assert.deepEqual(renderPixelArtDocument2D(reopened), renderPixelArtDocument2D({ ...source, workingPalette: undefined }));
});

test('invalid swatches are rejected before serialization without mutating documents or cels', () => {
  for (const invalid of [null, [], Array(257).fill(0), [NaN], [Infinity], [-0x80000001], [0x100000000], [1.5], new Array(2), ['#abcdef']]) {
    const doc = fixture(), copy = structuredClone(doc), animation = createPixelArtAnimation2D(doc);
    assert.throws(() => validatePixelArtDocument2D({ ...doc, workingPalette: invalid }), /Working palette/);
    assert.throws(() => validatePixelArtAnimation2D({ ...animation, workingPalette: invalid }), /Working palette/);
    assert.deepEqual(doc, copy); assert.equal(animation.frames.length, 1);
  }
});
