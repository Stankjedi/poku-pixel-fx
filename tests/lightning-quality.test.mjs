import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFrame, Painter, fit, enableHDRLight } from '../build/core/index.js';
import { VOLT, stroke, crackle } from '../build/fx/lightning/_lib.js';
import { loadEffect, renderFrames } from '../build-tools/tools/lib/fxlib.mjs';

const palette = fit(VOLT, 8);
const path = [[-24, 0], [24, 0]];
const divided = Array.from({ length: 49 }, (_, i) => [-24 + i, 0]);
const retraced = [[-24, 0], [24, 0], [-24, 0], [24, 0]];
function draw(points, { kind = 'stroke', alpha = 1, angle = 0, flip = false, minY, light = .6, fade = 1, lightK = 1, width = 1 } = {}) {
  const frame = createFrame(96, 96, -8, -8); enableHDRLight(frame);
  const painter = new Painter(frame).place(40, 40, flip, angle);
  painter.fade = fade; painter.lightK = lightK;
  const bolt = { paths: [{ pts: points, w: width }] };
  if (kind === 'stroke') stroke(painter, bolt, .9, palette, 1, { a: alpha, minY, light });
  else crackle(painter, bolt, .9, palette, light, alpha);
  return frame;
}

for (const kind of ['stroke', 'crackle']) {
  test(`${kind}: light is invariant to tessellation and retracing, also after transforms`, () => {
    for (const angle of [0, .37]) for (const flip of [false, true]) {
      const opts = { kind, angle, flip };
      const base = draw(path, opts);
      assert.ok(base.light.some(v => v !== 0));
      for (const pts of [divided, retraced]) {
        const other = draw(pts, opts);
        assert.deepEqual(other.light, base.light);
        assert.deepEqual(other.hdrLight, base.hdrLight);
      }
    }
  });
  test(`${kind}: opacity fades both ink and light; zero opacity leaves no ghost illumination`, () => {
    const full = draw(path, { kind }), half = draw(path, { kind, alpha: .5 }), empty = draw(path, { kind, alpha: 0 });
    assert.ok(empty.color.every(v => v === 0)); assert.ok(empty.light.every(v => v === 0));
    assert.ok(empty.hdrLight.every(v => v === 0));
    // Painter.add intentionally discards final source strengths <= .004 at the outer falloff.
    full.hdrLight.forEach((v, i) => assert.ok(half.hdrLight[i] === 0 ? v * .5 <= .004 : Math.abs(half.hdrLight[i] - v * .5) < 1e-7));
    const faded = draw(path, { kind, fade: .5, lightK: .5 });
    full.hdrLight.forEach((v, i) => assert.ok(faded.hdrLight[i] === 0 ? v * .25 <= .004 : Math.abs(faded.hdrLight[i] - v * .25) < 1e-7));
  });
  test(`${kind}: a continuous channel has no periodic light beads or unlit endpoints`, () => {
    const frame = draw(path, { kind });
    const values = Array.from({ length: 45 }, (_, i) => frame.light[(40 + 8) * 96 + 18 + i + 8]);
    assert.equal(new Set(values).size, 1);
    assert.ok(values[0] & 0xffffff);
  });
  test(`${kind}: disabling light preserves the exact crisp ink buffer`, () => {
    const lit = draw(divided, { kind }), unlit = draw(divided, { kind, light: 0 });
    assert.deepEqual(lit.color, unlit.color); assert.ok(unlit.light.every(v => v === 0));
    assert.ok(new Set(lit.color).size <= 5, 'bolt ink stays palette stepped, not blurred');
  });
}

test('light clipping intersects the source centerline independently of control-point spacing', () => {
  const coarse = [[-12, -20], [12, 20]];
  const fine = Array.from({ length: 21 }, (_, i) => [-12 + 24 * i / 20, -20 + 2 * i]);
  const a = draw(coarse, { minY: 0 }), b = draw(fine, { minY: 0 });
  assert.deepEqual(a.light, b.light);
  for (let i = 0; i < a.hdrLight.length; i++) assert.ok(Math.abs(a.hdrLight[i] - b.hdrLight[i]) < 1e-6);
  const outside = draw([[-20, -20], [20, -20]], { minY: 0 });
  assert.ok(outside.light.every(v => v === 0));
  const clipped = draw([[0, 0], [12, 20]]);
  assert.deepEqual(a.light, clipped.light);
});

// Captured from the isolated starting snapshot, including its existing uncommitted changes.
// Raw RGBA ink only: this intentional lighting refinement must not repaint the pixel silhouettes.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/lightning-color.json', import.meta.url), 'utf8'));
for (const [id, expected] of Object.entries(fixtures)) test(`${id}: every raw-color frame retains the baseline pixel artwork`, async () => {
  const effect = await loadEffect(id), rendered = renderFrames(effect), hash = createHash('sha256');
  for (const frame of rendered.frames) hash.update(frame.raw);
  assert.equal(rendered.n, expected.frames); assert.equal(hash.digest('hex'), expected.colorHash);
});

test('constant path-light cutoff optimization is pixel-identical to the uncropped callback reference', () => {
  for (const radius of [1, 4, 14, 45]) for (const strength of [0, .003, .004, .004001, .009, .1, .6, 2]) {
    for (const flip of [false, true]) {
      const make = callback => {
        const frame = createFrame(76, 64, -8, -9); enableHDRLight(frame);
        const p = new Painter(frame).place(26.37, 20.19, flip, .37);p.fade=.7;p.lightK=.8;
        p.glowPath([[-23.4, 4.2], [-4.9, -14.7], [9.8, 8.3], [22.6, -5.5]], radius, palette[4], callback ? () => strength : strength);
        return frame;
      };
      const constant=make(false),reference=make(true);
      assert.deepEqual(constant.light,reference.light);assert.deepEqual(constant.hdrLight,reference.hdrLight);
    }
  }
});
