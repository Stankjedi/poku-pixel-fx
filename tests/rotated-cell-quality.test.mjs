import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, Painter, createSpriteClip2D } from '../build/core/index.js';

const width = 8, height = 8;
function clipOf(pixels) {
  return createSpriteClip2D({ version: 1, width, height, pivot: [0, 0],
    frames: [{ durationMs: 100, runs: [...pixels].flatMap(color => [1, color]) }] });
}
// Deliberately scan the whole destination, without the painter's transformed candidate bounds.
function reference(frame, placement, pixels, fade) {
  const p = new Painter(frame).place(...placement); p.fade = fade;
  for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
    const sx = x + frame.ox, sy = y + frame.oy;
    const lx = p.fromX(sx + .5, sy + .5), ly = p.fromY(sx + .5, sy + .5);
    if (lx >= 0 && ly >= 0 && lx < width && ly < height)
      p.put(sx, sy, pixels[Math.floor(ly) * width + Math.floor(lx)]);
  }
}

test('half-pixel cardinal rotation does not discard cells before inverse mapping', () => {
  const pixels = new Uint32Array(width * height).fill(0xffffffff), clip = clipOf(pixels);
  const actual = createFrame(16, 16), expected = createFrame(16, 16), sprite = createFrame(16, 16);
  const placement = [8.5, 8, false, Math.PI];
  clip.draw(new Painter(actual).place(...placement), 0);
  reference(expected, placement, pixels, 1);
  new Painter(sprite).place(...placement).sprite(Array(height).fill('a'.repeat(width)), { a: 0xffffffff }, 0, 0);
  for (const [x, y] of [[1, 4], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 6]])
    assert.equal(actual.color[y * actual.w + x], 0xffffffff, `previously lost (${x},${y})`);
  assert.deepEqual(actual.color, expected.color);
  assert.deepEqual(actual.color, sprite.color);
});

test('rotated cell tiles match independent inverse sampling without duplicate translucent coverage', () => {
  const pixels = Uint32Array.from({ length: width * height }, (_, i) =>
    ((i % 4 === 0 ? 255 : 128) << 24 | (i * 3) << 16 | 0x9000 | (i * 7 % 256)) >>> 0);
  const clip = clipOf(pixels);
  for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, Math.PI * 2, .37, Math.PI / 4, Math.PI - 1e-10, Math.PI + 1e-10])
    for (const flip of [false, true]) for (const [tx, ty] of [[0, 0], [.5, 0], [0, .5], [.25, -.75], [8.5, 8], [8, 8.5]])
      for (const mode of ['coverage', 'dither']) {
        const actual = createFrame(32, 32, -16, -16), expected = createFrame(32, 32, -16, -16);
        actual.alphaMode = expected.alphaMode = mode;
        actual.color.fill(0x70402010); expected.color.fill(0x70402010);
        actual.light.fill(0x10302040); expected.light.fill(0x10302040);
        const placement = [tx, ty, flip, angle], p = new Painter(actual).place(...placement); p.fade = .6;
        clip.draw(p, 0); reference(expected, placement, pixels, .6);
        assert.deepEqual(actual.color, expected.color, `${mode}, angle=${angle}, flip=${flip}, origin=${tx},${ty}`);
        assert.deepEqual(actual.light, expected.light);
      }
});
