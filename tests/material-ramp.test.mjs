import test from 'node:test';
import assert from 'node:assert/strict';
import { hex, at } from '../build/core/color.js';
import { createMaterialRamp2D } from '../build/core/material-ramp.js';
import { renderMaterialRampStudy, MATERIAL_STUDY_PALETTES } from '../build/examples/material-ramp-study.js';

const palette = ['#13233b', '#3b5268', '#8babae', '#e0e8d1'];
const color = value => hex(value) >>> 0;
test('default material bands match the existing uniform palette lookup', () => {
  const ramp = palette.map(color), shade = createMaterialRamp2D(palette);
  for (let i = -10; i <= 150; i++) assert.equal(shade(i / 128), at(ramp, i / 128));
});

test('authored thresholds reserve narrow bright bands without generating extra colors', () => {
  const shade = createMaterialRamp2D(palette, { thresholds: [.08, .55, .94] });
  assert.equal(shade(-1), color(palette[0])); assert.equal(shade(.079), color(palette[0]));
  assert.equal(shade(.08), color(palette[1])); assert.equal(shade(.54), color(palette[1]));
  assert.equal(shade(.55), color(palette[2])); assert.equal(shade(.939), color(palette[2]));
  assert.equal(shade(.94), color(palette[3])); assert.equal(shade(4), color(palette[3]));
  for (let i = 0; i <= 1000; i++) assert.ok(palette.map(color).includes(shade(i / 1000)));
});

test('optional specular color is selected separately and cannot light an unlit input', () => {
  const shade = createMaterialRamp2D(palette, { highlight: { color: '#fff0c4', threshold: .9 } });
  assert.equal(shade(.5, .89), color(palette[2])); assert.equal(shade(.5, .9), color('#fff0c4'));
  assert.equal(shade(0, 1), color(palette[0])); assert.equal(shade(-1, 1), color(palette[0]));
  assert.equal(createMaterialRamp2D(['#234'])(1), color('#234'));
});

test('compiled materials snapshot caller settings and reject malformed input', () => {
  const input = [...palette], thresholds = [.1, .4, .8], highlight = { color: '#fff', threshold: .8 };
  const shade = createMaterialRamp2D(input, { thresholds, highlight });
  input[1] = '#000'; thresholds[0] = .3; highlight.color = '#000'; highlight.threshold = .1;
  assert.equal(shade(.2), color(palette[1])); assert.equal(shade(.2, .8), color('#fff'));
  for (const p of [[], Array(2), ['red'], ['#1234'], [NaN], [0x7fffffff]]) assert.throws(() => createMaterialRamp2D(p), RangeError);
  for (const thresholds of [[.1], [.1, .1, .9], [.1, .9, .7], [0, .5, .9], [.2, .5, 1], [.2, NaN, .9]])
    assert.throws(() => createMaterialRamp2D(palette, { thresholds }), RangeError);
  for (const threshold of [0, -1, 1.1, NaN]) assert.throws(() => createMaterialRamp2D(palette, { highlight: { color: '#fff', threshold } }), RangeError);
  assert.throws(() => shade(NaN), RangeError); assert.throws(() => shade(.5, Infinity), RangeError);
});

test('the visual study holds geometry, material masks, alpha and zero emission constant', () => {
  for (const light of [[-.65, -.55, -1], [.65, -.55, -1], [0, 0, 1]]) {
    const a = renderMaterialRampStudy('uniform', light), b = renderMaterialRampStudy('authored', light);
    assert.deepEqual(a.material, b.material);
    assert.deepEqual(a.frame.light, b.frame.light); assert.ok(b.frame.light.every(v => v === 0));
    for (let i = 0; i < a.frame.color.length; i++) assert.equal(a.frame.color[i] >>> 24, b.frame.color[i] >>> 24);
    assert.deepEqual(b.frame.color, renderMaterialRampStudy('authored', light).frame.color);
  }
});

test('reserved highlights are confined to steel and shift with light direction', () => {
  const left = renderMaterialRampStudy('authored', [-.65, -.55, -1]), right = renderMaterialRampStudy('authored', [.65, -.55, -1]);
  const highlight = color('#fff0c4');
  const coordinates = result => {
    const xs = [];
    result.frame.color.forEach((c, i) => { if (c === highlight) { assert.equal(result.material[i], 1); xs.push(i % result.frame.w); } });
    assert.ok(xs.length > 0); return xs.reduce((a, b) => a + b) / xs.length;
  };
  assert.ok(coordinates(right) > coordinates(left) + 10);
  for (const [id, key] of [[2, 'wood'], [3, 'cloth']]) {
    const colors = new Set(MATERIAL_STUDY_PALETTES[key].map(color));
    left.frame.color.forEach((c, i) => { if (left.material[i] === id) assert.ok(colors.has(c)); });
  }
});
