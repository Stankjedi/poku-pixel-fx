import test from 'node:test';
import assert from 'node:assert/strict';
import { stockActor, drawActor, withActorPixels, HERO, HERO2, HERO_PAL, DUMMY_PAL } from '../build/core/actor.js';
import { editSpriteCluster2D } from '../build/core/sprite-edit.js';
import { createFrame, Painter } from '../build/core/index.js';
import { renderFrames } from '../build-tools/tools/lib/fxlib.mjs';

const patch = { x: 9, y: 8, rows: ['.hhh.', 'hxxxh', '.hhh.'], palette: { h: 0xff70ceff, x: null } };
function render(actor, { flip = false, angle = 0, alpha = 1, alphaMode = 'coverage' } = {}, reference = false) {
  const f = createFrame(80, 80); f.alphaMode = alphaMode;
  const p = new Painter(f).place(40.25, 55.5, flip, angle); p.fade = .8;
  if (reference) p.sprite(actor.k === 2 ? HERO2 : HERO, actor.k === 2 ? DUMMY_PAL : HERO_PAL, actor.x, actor.y, { a: alpha });
  else drawActor(p, actor, alpha);
  return f.color;
}

test('stock rendering remains byte-identical; unedited pixel opt-in matches both stock sizes, transforms and alpha modes', () => {
  for (const size of [1, 2]) for (const flip of [false, true]) for (const angle of [0, .37])
    for (const alpha of [0, .43, 1]) for (const alphaMode of ['coverage', 'dither']) {
      const actor = stockActor(size), options = { flip, angle, alpha, alphaMode };
      const before = render(actor, options, true);
      assert.deepEqual(render(actor, options), before);
      assert.deepEqual(render(withActorPixels(actor), options), before);
    }
  let called = 0;
  drawActor({ sprite() { called++; } }, stockActor());
  assert.equal(called, 1, 'legacy sprite-only painter remains supported');
});

test('explicit pixel actor carries cluster color and erasure into drawActor without changing the original', () => {
  const source = stockActor(2), before = structuredClone(source), edited = editSpriteCluster2D(source, patch);
  assert.equal(edited.pixels.reduce((n, c, i) => n + (c !== source.pixels[i]), 0), 11);
  assert.deepEqual(render(edited), render(source), 'reproduce: legacy stock path ignores edited buffers by design');
  const actor = withActorPixels(edited);
  assert.notDeepEqual(render(actor), render(source));
  assert.equal(actor.pixels, edited.pixels); assert.equal(actor.mask, edited.mask); assert.equal(actor.head, edited.head);
  assert.equal(edited.renderSource, undefined, 'opt-in does not mutate the input object');
  assert.deepEqual(source, before);
  const frame = createFrame(64, 64), p = new Painter(frame).place(32, 50);
  drawActor(p, actor);
  for (let y = 0; y < actor.h; y++) for (let x = 0; x < actor.w; x++)
    assert.equal(frame.color[(50 + actor.y + y) * frame.w + 32 + actor.x + x], actor.pixels[y * actor.w + x]);
  const erased = editSpriteCluster2D(actor, { x: 10, y: 8, rows: ['xxx'], palette: { x: null } });
  assert.equal(erased.renderSource, 'pixels', 'later edits preserve the explicit rendering intent');
  assert.notDeepEqual(render(erased), render(actor));
  const translucent = editSpriteCluster2D(actor, { x: 10, y: 8, rows: ['s'], palette: { s: 0x804020ff } });
  const alphaFrame = createFrame(64, 64);
  drawActor(new Painter(alphaFrame).place(32, 50), translucent);
  assert.equal(alphaFrame.color[(50 + actor.y + 8) * 64 + 32 + actor.x + 10], 0x804020ff,
    'packed source alpha survives the new render connection');
});

test('existing preview actor forwarding displays the opt-in pixels and invalid buffers fail before drawing', () => {
  const meta = { size: [64, 64], origin: [32, 50], duration: .25, fps: 4, loop: false, bg: 'black', actor: 2, options: {} };
  const fx = { id: 'test/edited-actor', file: 'fixture', meta, mod: { meta, draw() {} } };
  const source = stockActor(2), edited = editSpriteCluster2D(source, patch);
  const original = renderFrames(fx, { options: { actor: source } });
  const legacy = renderFrames(fx, { options: { actor: edited } });
  const optedIn = renderFrames(fx, { options: { actor: withActorPixels(edited) } });
  assert.deepEqual(original, legacy);
  for (let i = 0; i < original.frames.length; i++) {
    assert.notDeepEqual(original.frames[i].color, optedIn.frames[i].color);
    assert.deepEqual(original.frames[i].clear, optedIn.frames[i].clear, 'stand-in actor does not leak into effect-only sheet');
  }
  for (const change of [{ x: NaN }, { y: Infinity }, { pixels: new Uint32Array(1) },
    { mask: { ...edited.mask, data: new Uint8Array(1) } }, { w: .5 }])
    assert.throws(() => withActorPixels({ ...edited, ...change }), RangeError);
  const actor = withActorPixels(edited), f = createFrame(64, 64);
  assert.throws(() => drawActor(new Painter(f), { ...actor, pixels: new Uint32Array(1) }), RangeError);
  assert.ok(f.color.every(c => c === 0));
  assert.throws(() => drawActor({ sprite() {} }, actor), /mask/);
});
