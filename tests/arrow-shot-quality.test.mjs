import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFrame, clearFrame, createFx } from '../build/core/index.js';
import { loadEffect, renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
import * as arrowShot from '../build/fx/moves/arrow-shot.js';

const { meta } = arrowShot, [width, height] = meta.size, margin = 32;
const seeds = [0, 1, 2, 3, 5, 7, 15, 22, 33, 60, 92, 113, 117, 142, 186, 218, 255, -1, 2147483647, 4294967295];
const padded = () => createFrame(width + margin * 2, height + margin * 2, -margin, -margin);
const options = (seed, flip, particleStyle = 'refined') => ({
  seed, flip, particleStyle, x: flip ? width - meta.origin[0] : meta.origin[0], y: meta.origin[1],
});
function assertContained(frame, context) {
  // Inspect the actual color buffer, before export cropping or light edge fading.
  for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
    if (y >= margin && y < margin + height && x === margin) { x += width - 1; continue; }
    if (frame.color[y * frame.w + x] >>> 24)
      assert.fail(`${context}: pixel (${x - margin}, ${y - margin}) is outside the canvas`);
  }
}

test('Arrow Shot keeps the launch wake and impact spray inside its canvas at live frame rates', () => {
  const frame = padded();
  for (const fps of [24, 30, 60, 120]) for (const seed of seeds)
    for (const flip of [false, true]) for (const style of ['classic', 'refined']) {
      const fx = createFx(arrowShot, options(seed, flip, style));
      for (let i = 0; i <= Math.ceil(meta.duration * fps); i++) {
        if (i) fx.update(1 / fps);
        fx.draw(clearFrame(frame));
        assertContained(frame, `seed ${seed}, ${fps} fps, flip ${flip}, ${style}, frame ${i}`);
      }
      assert.ok(frame.color.every(c => !(c >>> 24)), 'the one-shot ends empty');
      assert.ok(frame.light.every(c => !(c & 0xffffff)), 'the one-shot light ends empty');
    }
});

test('Arrow Shot includes the exact release and subframe wake across 256 seeds and both directions', () => {
  const frame = padded();
  // The 30/60/120 fps clocks all miss 0.56 itself. The looping projectile already has
  // a mature wake on that instant; seed 15 reached x=-20 in the old 300 px canvas.
  for (let seed = 0; seed < 256; seed++) for (const flip of [false, true])
    for (const time of [.56, .5600001, .561, .5625, .565, .57, .575, .58, .59]) {
      const fx = createFx(arrowShot, options(seed, flip));
      fx.update(time); fx.draw(clearFrame(frame));
      assertContained(frame, `release seed ${seed}, flip ${flip}, t=${time}`);
      assert.ok(frame.color.some(c => c >>> 24), 'the projectile must already be visible');
    }
});

test('Arrow Shot retains every original-crop color and light frame for classic and refined drawing', () => {
  // Captured before the bounds repair, never regenerated from its output.
  const original = JSON.parse(readFileSync(new URL('./fixtures/arrow-shot-before.json', import.meta.url), 'utf8'));
  const [oldWidth, oldHeight] = original.size;
  for (const [key, expected] of Object.entries(original.hashes)) {
    const [seed, style, mirrored] = key.split('/'), flip = mirrored === 'true';
    const frame = createFrame(width, height), fx = createFx(arrowShot, options(+seed, flip, style));
    const hash = createHash('sha256');
    const dx = flip ? width - meta.origin[0] - (oldWidth - original.origin[0]) : meta.origin[0] - original.origin[0];
    const dy = meta.origin[1] - original.origin[1];
    for (let i = 0; i < original.frames; i++) {
      if (i) fx.update(1 / meta.fps);
      fx.draw(clearFrame(frame));
      for (const buffer of [frame.color, frame.light]) for (let y = 0; y < oldHeight; y++)
        hash.update(buffer.subarray((y + dy) * width + dx, (y + dy) * width + dx + oldWidth));
    }
    assert.equal(hash.digest('hex'), expected, key);
  }
});

test('Arrow Shot retains its choreography and exports its corrected bounds and pivot', async () => {
  assert.deepEqual(meta.size, [344, 88]);
  assert.deepEqual(meta.origin, [62, 80]);
  assert.equal(meta.duration, 1.9);
  assert.equal(meta.fps, 30);
  assert.equal(arrowShot.act.target.x, 180);
  assert.equal(arrowShot.act.poses[3][0], .56);
  assert.equal(arrowShot.act.hits[0].t, .8);
  const effect = await loadEffect('moves/arrow-shot');
  const render = renderFrames(effect, { actor: false });
  const sheet = spriteSheet(effect, render, 'arrow-shot');
  assert.equal(render.n, 58);
  assert.deepEqual(sheet.json.meta.pokuFx.frameSize, [344, 88]);
  assert.deepEqual(sheet.json.meta.pokuFx.pivot, [62, 80]);
  assert.equal(sheet.json.meta.pokuFx.id, 'moves/arrow-shot');
});
