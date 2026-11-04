import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, clearFrame, createFx } from '../build/core/index.js';
import * as splash from '../build/fx/water/splash.js';
import * as slash from '../build/fx/melee/sword-slash.js';
import * as warp from '../build/fx/scifi/warp-in.js';
import * as explosion from '../build/fx/explosions/big-explosion.js';

const seeds = [0, 1, 2, 3, 7, 8, 33, 60, 92, 142, 186, 255];
const styles = ['refined', 'classic'];
const empty = (frame, context) => {
  assert.ok(frame.color.every(c => !(c >>> 24)), `${context}: residual color`);
  assert.ok(frame.light.every(c => !(c & 0xffffff)), `${context}: residual light`);
};

for (const effect of [splash, slash]) test(`${effect.meta.name} retains all particles within the declared canvas across seeds and mirrors`, () => {
  const { meta } = effect, [w, h] = meta.size, margin = 32;
  const frame = createFrame(w + margin * 2, h + margin * 2, -margin, -margin);
  for (const seed of seeds) for (const particleStyle of styles) for (const flip of [false, true]) {
    // Mirror the pivot too, so the same local support occupies the mirrored sheet cell.
    const fx = createFx(effect, { seed, particleStyle, flip, x: flip ? w - meta.origin[0] : meta.origin[0], y: meta.origin[1] });
    for (let i = 0; i <= Math.ceil(meta.duration * meta.fps); i++) {
      if (i) fx.update(1 / meta.fps);
      clearFrame(frame); fx.draw(frame);
      for (let j = 0; j < frame.color.length; j++) {
        if (!(frame.color[j] >>> 24)) continue;
        const x = j % frame.w - margin, y = Math.floor(j / frame.w) - margin;
        assert.ok(x >= 0 && x < w && y >= 0 && y < h,
          `${meta.name}, seed ${seed}, ${particleStyle}, flip ${flip}, frame ${i}: ${x},${y}`);
      }
    }
  }
});

for (const effect of [warp, explosion]) test(`${effect.meta.name} naturally clears both buffers at its deadline and stays empty`, () => {
  const { meta } = effect;
  for (const seed of [0, 1, 2, 3, 7, 11, 17, 31]) for (const fps of [24, 30, 60, 120]) for (const particleStyle of styles) {
    const fx = createFx(effect, { seed, particleStyle, x: meta.origin[0], y: meta.origin[1] });
    let elapsed = 0;
    while (elapsed < meta.duration - 1e-10) {
      const dt = Math.min(1 / fps, meta.duration - elapsed);
      fx.update(dt); elapsed += dt;
    }
    const frame = createFrame(...meta.size), context = `${meta.name}, seed ${seed}, ${fps}fps, ${particleStyle}`;
    fx.draw(frame); empty(frame, context);
    fx.update(.2); clearFrame(frame); fx.draw(frame); empty(frame, `${context} after completion`);
  }
});

test('boundary repairs retain one-shot timing and the completed warp actor', () => {
  assert.equal(splash.meta.duration, 2.5);
  assert.equal(slash.meta.duration, .75);
  assert.equal(warp.meta.duration, 3);
  assert.equal(explosion.meta.duration, 7.2);
  assert.equal(warp.actorAlpha(0), 0);
  assert.equal(warp.actorAlpha(warp.meta.duration), 1);
});
