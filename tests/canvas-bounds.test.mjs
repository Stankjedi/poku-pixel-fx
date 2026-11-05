import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, createFx } from '../build/core/fx.js';
import { enableHDRLight } from '../build/render/hdr.js';
import { frameBounds2D, animationBounds2D, cropFrame2D } from '../build/core/canvas-bounds.js';
import * as crystal from '../build/fx/ice/ice-crystal.js';

test('bounds include low alpha, packed light and HDR-only emission in world coordinates', () => {
  const f = enableHDRLight(createFrame(8, 6, -10, 20));
  assert.equal(frameBounds2D(f), null);
  f.light[0] = 0xff000000;
  assert.equal(frameBounds2D(f), null, 'a light alpha marker alone has no visible energy');
  f.color[2 * 8 + 3] = 0x01112233;
  f.color[3 * 8 + 4] = 0x80112233;
  f.light[1 * 8 + 1] = 0x00000001;
  f.hdrLight[(4 * 8 + 6) * 3 + 2] = .001;
  assert.deepEqual(frameBounds2D(f), { x: -9, y: 21, w: 6, h: 4 });
  assert.deepEqual(frameBounds2D(f, { includeLight: false }), { x: -7, y: 22, w: 2, h: 2 });
  assert.deepEqual(frameBounds2D(f, { includeLight: false, alphaThreshold: 2 }), { x: -6, y: 23, w: 1, h: 1 });
  assert.deepEqual(frameBounds2D(f, { padding: 2 }), { x: -11, y: 19, w: 10, h: 8 });
});

test('animation bounds use one pivot across different source canvases and empty frames', () => {
  const a = createFrame(3, 3, -5, -2), b = createFrame(2, 2, 4, 6), empty = createFrame(8, 8, -50, -50);
  a.color[0] = 0xffffffff; b.color[3] = 0xffffffff;
  const bounds = animationBounds2D([a, empty, b], { padding: 1 });
  assert.deepEqual(bounds, { x: -6, y: -3, w: 13, h: 12 });
  for (const f of [a, empty, b]) {
    const cropped = cropFrame2D(f, bounds);
    assert.deepEqual([cropped.ox, cropped.oy, cropped.w, cropped.h], [-6, -3, 13, 12]);
    assert.deepEqual(frameBounds2D(cropped), frameBounds2D(f));
  }
  assert.equal(animationBounds2D([]), null); assert.equal(animationBounds2D([empty]), null);
});

test('cropping and padding preserve color, packed light and exact HDR RGB triples without aliases', () => {
  const f = enableHDRLight(createFrame(5, 4, -2, 7)); f.alphaMode = 'dither';
  for (let i = 0; i < f.color.length; i++) {
    f.color[i] = (i + 1) * 0x1000000 + 0x123456; f.light[i] = i + 1;
    f.hdrLight.set([i * .5, i + .25, i + 10.75], i * 3);
  }
  const copy = structuredClone(f), crop = cropFrame2D(f, { x: -1, y: 8, w: 3, h: 2 });
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    const source = (y + 1) * 5 + x + 1, target = y * 3 + x;
    assert.equal(crop.color[target], f.color[source]); assert.equal(crop.light[target], f.light[source]);
    assert.deepEqual(crop.hdrLight.slice(target * 3, target * 3 + 3), f.hdrLight.slice(source * 3, source * 3 + 3));
  }
  const padded = cropFrame2D(f, { x: -4, y: 5, w: 9, h: 8 });
  assert.equal(padded.color[0], 0); assert.equal(padded.light[0], 0); assert.equal(padded.hdrLight[0], 0);
  const restored = cropFrame2D(padded, { x: f.ox, y: f.oy, w: f.w, h: f.h });
  assert.deepEqual(restored, f); assert.deepEqual(f, copy);
  assert.notEqual(restored.color, f.color); assert.notEqual(restored.light, f.light); assert.notEqual(restored.hdrLight, f.hdrLight);
  restored.color[0] = 0; assert.notEqual(restored.color[0], f.color[0]);
});

test('partially overlapping and off-canvas regions are transparent without creating an HDR buffer', () => {
  const f = createFrame(3, 3); f.color.fill(0xffffffff);
  const partial = cropFrame2D(f, { x: -1, y: -1, w: 2, h: 2 });
  assert.deepEqual([...partial.color], [0, 0, 0, 0xffffffff]);
  const empty = cropFrame2D(f, { x: 8, y: -9, w: 2, h: 4 });
  assert.equal(frameBounds2D(empty), null); assert.equal(empty.hdrLight, undefined);
});

test('invalid geometry, thresholds, padding and oversized output reject before allocation', () => {
  const f = createFrame(2, 2);
  for (const bounds of [{ x: 0, y: 0, w: 0, h: 2 }, { x: .5, y: 0, w: 2, h: 2 }, { x: NaN, y: 0, w: 2, h: 2 },
    { x: Number.MAX_SAFE_INTEGER, y: 0, w: 2, h: 2 }, { x: 0, y: 0, w: 4097, h: 4096 }])
    assert.throws(() => cropFrame2D(f, bounds), RangeError);
  for (const alphaThreshold of [0, .5, 256, NaN]) assert.throws(() => frameBounds2D(f, { alphaThreshold }), RangeError);
  for (const padding of [-1, .5, Infinity]) assert.throws(() => animationBounds2D([], { padding }), RangeError);
  assert.throws(() => frameBounds2D({ ...f, ox: .25 }), RangeError);
  assert.throws(() => frameBounds2D({ ...f, hdrLight: new Float32Array(4) }), RangeError);
  assert.throws(() => frameBounds2D({ ...f, color: new Uint32Array(5) }), RangeError);
});

test('an existing animated effect retains visible world-space cells and glow after common cropping', () => {
  const frames = [0, .3, .8, 1.3].map(time => {
    const f = enableHDRLight(createFrame(...crystal.meta.size));
    const fx = createFx(crystal, { x: crystal.meta.origin[0], y: crystal.meta.origin[1] });
    fx.update(time); fx.draw(f); return f;
  });
  const bounds = animationBounds2D(frames, { padding: 2 }); assert.ok(bounds);
  for (const original of frames) {
    const cropped = cropFrame2D(original, bounds);
    for (let y = 0; y < original.h; y++) for (let x = 0; x < original.w; x++) {
      const i = y * original.w + x, dx = original.ox + x - bounds.x, dy = original.oy + y - bounds.y;
      if ((original.color[i] >>> 24) === 0 && !(original.light[i] & 0xffffff) && original.hdrLight.slice(i * 3, i * 3 + 3).every(v => v === 0)) continue;
      assert.ok(dx >= 0 && dy >= 0 && dx < cropped.w && dy < cropped.h);
      const j = dy * cropped.w + dx;
      assert.equal(cropped.color[j], original.color[i]); assert.equal(cropped.light[j], original.light[i]);
      assert.deepEqual(cropped.hdrLight.slice(j * 3, j * 3 + 3), original.hdrLight.slice(i * 3, i * 3 + 3));
    }
  }
});
