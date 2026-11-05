import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
import { importAsepriteSheet } from '../build-tools/tools/lib/aseprite-data.mjs';
import { createSpriteClip2D } from '../build/core/index.js';

function fixture(fps, n) {
  const meta = { name: 'Timing fixture', size: [1, 1], origin: [0, 0], loop: true };
  const fx = { id: 'test/sheet-timing', meta, mod: {} };
  const frames = Array.from({ length: n }, (_, i) => {
    const rgba = new Uint8ClampedArray([i % 256, Math.floor(i / 256), 80, 255]);
    return { t: i / fps, color: rgba, clear: rgba };
  });
  return { fx, result: { w: 1, h: 1, fps, n, frames } };
}

test('sheet timing rounds cumulative boundaries, so per-frame millisecond error never accumulates', () => {
  for (const fps of [7, 24, 25, 29.97, 30, 50, 60, 120, 144, 240]) {
    const { fx, result } = fixture(fps, Math.round(fps * 10) + 7);
    const { json } = spriteSheet(fx, result, 'timing');
    let elapsed = 0;
    json.frames.forEach((frame, i) => {
      assert.ok(Number.isInteger(frame.duration) && frame.duration > 0);
      elapsed += frame.duration;
      assert.equal(elapsed, Math.round((i + 1) * 1000 / fps), `${fps} fps, boundary ${i + 1}`);
      if (Number.isInteger(1000 / fps)) assert.equal(frame.duration, 1000 / fps, 'exact rates are unchanged');
    });
    assert.equal(json.meta.pokuFx.fps, fps);
    assert.equal(json.meta.pokuFx.frames, result.n);
  }
});

test('standard PNG/JSON round-trip keeps one-second loops and exact frame pixels', () => {
  for (const fps of [24, 30, 60]) {
    const { fx, result } = fixture(fps, fps);
    const sheet = spriteSheet(fx, result, 'timing');
    const { data } = importAsepriteSheet(sheet.png, sheet.json);
    const clip = createSpriteClip2D(data, { loop: true });
    assert.equal(clip.duration, 1, `${fps} fps loop must last one second`);
    assert.equal(clip.frameAt(1), 0);
    assert.equal(clip.frameAt(10), 0);
    let elapsed = 0;
    result.frames.forEach((frame, i) => {
      assert.deepEqual(new Uint8Array(clip.framePixels(i).buffer), new Uint8Array(frame.clear));
      assert.equal(clip.frameAt((elapsed + sheet.json.frames[i].duration / 2) / 1000), i);
      elapsed += sheet.json.frames[i].duration;
    });
  }
});


test('one-shot export retains its terminal frame and rounds the complete displayed timeline', () => {
  const meta = { name: 'Endpoint fixture', size: [1, 1], origin: [0, 0], fps: 60, duration: 1, loop: false, bg: 'none', options: {} };
  const fx = { id: 'test/endpoint', meta, mod: { meta, draw(p) { p.rect(0, 0, 1, 1, 0xffffffff); } } };
  const result = renderFrames(fx), sheet = spriteSheet(fx, result, 'endpoint');
  assert.equal(result.frames.length, 61);
  assert.equal(result.frames.at(-1).t, 1);
  assert.equal(sheet.json.frames.length, 61);
  assert.equal(sheet.json.frames.reduce((sum, frame) => sum + frame.duration, 0), 1017);
  assert.equal(sheet.json.meta.pokuFx.loop, false);
  assert.deepEqual(sheet.json.meta.frameTags, [{ name: 'endpoint', from: 0, to: 60, direction: 'forward' }]);
});
