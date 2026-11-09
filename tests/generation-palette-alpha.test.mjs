import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { resolveOptions, createFx, createFrame } from '../build/core/fx.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
import { fit } from '../build/core/color.js';
import { enableHDRLight } from '../build/render/hdr.js';
import { createSequenceSpec, createSequenceEffect } from '../build/authoring/sequence.js';

const digest = frame => ['color','light','hdrLight'].map(key => createHash('sha256').update(Buffer.from(frame[key].buffer)).digest('hex'));
function render(mod, palette, time = .65) {
  const frame = enableHDRLight(createFrame(...mod.meta.size));
  const fx = createFx(mod, { palette, layers: { light: false }, x: mod.meta.origin[0], y: mod.meta.origin[1] });
  fx.update(time); fx.draw(frame); return frame;
}
test('resampling packed ramps preserves alpha, zero, RGB, and caller ownership', () => {
  const meta = { options: { palette: Array(8).fill('#fff') } };
  for (const palette of [[0x400000ff], [0], [0x000000ff, 0x8000ff00], ['#123', 0x400000ff, '#abc']]) {
    const before = [...palette], actual = resolveOptions(meta, { palette }).palette;
    assert.deepEqual(fit(actual, 8).map(c => c >>> 0), fit(palette, 8).map(c => c >>> 0));
    assert.deepEqual(palette, before);
  }
});
test('opaque resampled ramps keep their existing hex representation', () => {
  const meta = { options: { palette: Array(4).fill('#fff') } };
  assert.deepEqual(resolveOptions(meta, { palette: [0xff0000ff, '#0f0'] }).palette,
    ['#ff0000', '#ff0000', '#00ff00', '#00ff00']);
});
test('generated fire and energy match equivalent pre-expanded packed palettes', () => {
  for (const [material, action, seed] of [['fire', 'plume', 17], ['energy', 'dash', 83]]) {
    const mod = createGeneratedEffect2D(createGenerationPlan2D({ material, action, seed }));
    for (const palette of [[0x400000ff], [0], [0x000000ff, 0x8000ff00]]) {
      const expected = render(mod, fit(palette, 8)), actual = render(mod, palette);
      assert.deepEqual(digest(actual), digest(expected), `${material}/${action} packed ramp`);
    }
  }
});
test('generation sequence cue options retain packed alpha during child creation', async () => {
  const make = palette => createSequenceEffect(createSequenceSpec({ cues: [{ id: 'fire',
    source: { kind: 'generation', intent: { material: 'fire', action: 'plume' } }, seed: 17,
    options: { palette, layers: { light: false } } }] }));
  const short = await make([0x400000ff]), expanded = await make(Array(8).fill(0x400000ff));
  assert.deepEqual(digest(render(short, undefined)), digest(render(expanded, undefined)));
});
