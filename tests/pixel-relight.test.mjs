import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelRelighter2D, relightPixelArt2D } from '../build/core/pixel-relight.js';
import { createMaterialChannels2D } from '../build/core/material-surface.js';

const gray = value => (0xff000000 | value | value << 8 | value << 16) >>> 0;
const encode = value => Math.round(255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055));
function sprite(w, h, value = 0xff998877) {
  return { w, h, pixels: new Uint32Array(w * h).fill(value), mask: { w, h, data: new Uint8Array(w * h).fill(1) } };
}

test('neutral ambient identity preserves every sRGB byte, partial alpha, hidden RGB and independent masks', () => {
  const source = sprite(256, 2);
  for (let i = 0; i < source.pixels.length; i++)
    source.pixels[i] = (i % 256 | (255 - i % 256) << 8 | (i * 73 % 256) << 16 | (i % 256) << 24) >>> 0;
  source.mask.data[3] = 0; source.mask.data[4] = 127;
  source.emission = new Float32Array(source.pixels.length * 3).fill(2.5);
  source.sockets = { grip: { x: 3, y: 1 } };
  const before = structuredClone(source), result = relightPixelArt2D(source, { lights: [], ambient: 1 });
  assert.deepEqual(result, source);
  assert.notEqual(result.pixels, source.pixels); assert.notEqual(result.mask.data, source.mask.data);
  assert.equal(result.emission, source.emission); assert.equal(result.sockets, source.sockets);
  assert.deepEqual(source, before);
});

test('ambient and multiple colored directional lights combine in linear light', () => {
  const white = sprite(1, 1, 0x7fffffff);
  const ambient = relightPixelArt2D(white, { lights: [], ambient: .25 });
  assert.equal(ambient.pixels[0], (gray(137) & 0xffffff | 0x7f000000) >>> 0);
  const output = relightPixelArt2D(white, { ambient: 0, specular: 0, diffuseBands: 0,
    lights: [{ direction: [0, 0, 7], color: '#ff0000', intensity: .25 },
      { direction: [0, 0, 1], color: '#0000ff', intensity: .5 }] });
  assert.deepEqual([output.pixels[0] & 255, output.pixels[0] >>> 8 & 255, output.pixels[0] >>> 16 & 255,
    output.pixels[0] >>> 24], [137, 0, 188, 127]);
  const half = relightPixelArt2D(sprite(1, 1, gray(255)), { lights: [], ambient: 0, strength: .5 });
  assert.equal(half.pixels[0], gray(188), 'strength interpolates linear light, not encoded byte values');
});

test('authored tilted planes retain one analytical normal at borders and alongside a hole', () => {
  const source = sprite(9, 7, gray(255)), height = new Float32Array(63);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) height[y * 9 + x] = .5 * x + .25 * y;
  source.mask.data[3 * 9 + 4] = 0;
  const normal = [-.5, -.25, 1], light = [-1, -.2, 1];
  const diffuse = normal.reduce((sum, value, i) => sum + value * light[i], 0) / (Math.hypot(...normal) * Math.hypot(...light));
  const output = relightPixelArt2D(source, { ambient: 0, specular: 0, diffuseBands: 0,
    lights: [{ direction: light, intensity: 1 }] }, { height });
  for (let i = 0; i < 63; i++) assert.equal(output.pixels[i], source.mask.data[i] ? gray(encode(diffuse)) : source.pixels[i]);
  assert.equal(Object.hasOwn(output, 'channels'), false, 'relighting does not silently replace authored geometry');
});

test('height edits recompute stale normals while explicit normals take precedence and normalize safely', () => {
  const source = sprite(5, 4, gray(255)), height = Float32Array.from({ length: 20 }, (_, i) => i % 5);
  source.channels = createMaterialChannels2D(5, 4);
  const normal = new Float32Array(60);
  for (let i = 0; i < 20; i++) normal[i * 3 + 2] = 12;
  const relighter = createPixelRelighter2D({ ambient: 0, specular: 0, diffuseBands: 0,
    lights: [{ direction: [0, 0, 1], intensity: 1 }] });
  const tilted = relighter.shade(source, { height }), flat = relighter.shade(source, { height, normal });
  assert.ok(tilted.pixels.every(c => c === gray(encode(Math.SQRT1_2))));
  assert.deepEqual(flat.pixels, source.pixels);
  assert.equal(tilted.channels, source.channels);
  assert.deepEqual(relighter.shade(source, { normal: new Float32Array(60) }).pixels, source.pixels,
    'unassigned zero normals use a defined flat normal');
});

test('source normals, not painted RGB, determine geometry and light bands', () => {
  const source = sprite(7, 1, gray(255)), normal = new Float32Array(21), zs = [0, .16, .2, .45, .6, .9, 1];
  for (let i = 0; i < 7; i++) normal.set([Math.sqrt(1 - zs[i] ** 2), 0, zs[i]], i * 3);
  const result = relightPixelArt2D(source, { ambient: 0, specular: 0, diffuseBands: 4,
    lights: [{ direction: [0, 0, 1], intensity: 1 }] }, { normal });
  for (let i = 0; i < 7; i++) assert.equal(result.pixels[i], gray(encode(Math.round(zs[i] * 3) / 3)));
  const painted = sprite(3, 1); painted.pixels.set([0xff0000ff, 0xff00ff00, 0xffff0000]);
  const preserved = relightPixelArt2D(painted, { ambient: 0, specular: 0,
    lights: [{ direction: [0, 0, 1], intensity: 1 }] });
  assert.deepEqual(preserved.pixels, painted.pixels, 'multicolor albedo is not replaced by one palette ramp');
});

test('selection and protected pixels are write masks, while their heights still cast shadows', () => {
  const source = sprite(13, 5, gray(200)), n = 65, height = new Float32Array(n);
  for (let y = 0; y < 5; y++) height[y * 13 + 6] = 4;
  const selection = new Uint8Array(n), protectedMask = new Uint8Array(n);
  for (let x = 2; x <= 6; x++) selection[2 * 13 + x] = 1;
  protectedMask[2 * 13 + 6] = 1;
  source.pixels[2 * 13 + 3] = 0x7fc8c8c8;
  source.pixels[1] = 0x00123456; source.mask.data[4] = 0;
  source.channels = createMaterialChannels2D(13, 5, { height });
  source.emission = new Float32Array(n * 3).fill(.75);
  const before = structuredClone(source);
  const options = { ambient: .2, specular: 0, ambientOcclusion: .5,
    lights: [{ direction: [1, 0, 1], intensity: 1, castShadow: 1 }] };
  const full = relightPixelArt2D(source, options), part = relightPixelArt2D(source, options, { selection, protectedMask });
  const open = relightPixelArt2D(source, { ...options, ambientOcclusion: 0,
    lights: [{ direction: [1, 0, 1], intensity: 1 }] });
  assert.ok((part.pixels[2 * 13 + 3] & 255) < (open.pixels[2 * 13 + 3] & 255));
  for (let i = 0; i < n; i++) {
    assert.equal(part.pixels[i] >>> 24, source.pixels[i] >>> 24);
    assert.equal(part.pixels[i], selection[i] && !protectedMask[i] ? full.pixels[i] : source.pixels[i]);
  }
  assert.equal(part.channels, source.channels); assert.equal(part.emission, source.emission);
  assert.deepEqual(source, before);
});

test('palette locking is opt-in, region aware, and strength zero is an exact identity', () => {
  const source = sprite(8, 3), selection = Uint8Array.from({ length: 24 }, (_, i) => i % 2);
  const protectedMask = new Uint8Array(24); protectedMask[3] = 1;
  const palette = ['#182a41', '#5f8e9c', '#ecd6ac'];
  const output = relightPixelArt2D(source, { palette }, { selection, protectedMask });
  const colors = [0xff412a18, 0xff9c8e5f, 0xffacd6ec];
  for (let i = 0; i < 24; i++)
    assert.ok(selection[i] && !protectedMask[i] ? colors.includes(output.pixels[i]) : output.pixels[i] === source.pixels[i]);
  assert.deepEqual(relightPixelArt2D(source, { palette, strength: 0, ambientOcclusion: 1 }), source);
  assert.deepEqual(relightPixelArt2D(source, { ambientOcclusion: 1 }, { selection: new Uint8Array(24) }), source);
  assert.throws(() => relightPixelArt2D(source, { ambientOcclusion: 1 }), /authored height/);
});

test('specular is light-facing and roughness shapes highlights without synthesizing HDR', () => {
  const source = sprite(1, 1, gray(0));
  const front = relightPixelArt2D(source, { ambient: 0, roughness: 0, specular: .5,
    lights: [{ direction: [0, 0, 1], intensity: 1 }] });
  const back = relightPixelArt2D(source, { ambient: 0, roughness: 0, specular: .5,
    lights: [{ direction: [0, 0, -1], intensity: 1 }] });
  assert.equal(front.pixels[0], gray(188)); assert.equal(back.pixels[0], gray(0));
  assert.equal(Object.hasOwn(front, 'emission'), false);
});

test('compiled options snapshot user arrays and serialize to the same deterministic bake', () => {
  const lights = [{ direction: [-1, -.5, 1], color: '#ffcc88', intensity: 1 }], palette = ['#111b2c', '#c4a080', '#ffedc4'];
  const relighter = createPixelRelighter2D({ lights, palette }), source = sprite(13, 8);
  const output = relighter.shade(source);
  lights[0].direction[0] = 9; lights[0].color = '#00ff00'; palette[0] = '#ff0000';
  assert.deepEqual(relighter.shade(source), output);
  assert.ok(Object.isFrozen(relighter.options) && Object.isFrozen(relighter.options.lights)
    && Object.isFrozen(relighter.options.lights[0].direction) && Object.isFrozen(relighter.options.palette));
  assert.deepEqual(createPixelRelighter2D(JSON.parse(JSON.stringify(relighter.options))).shade(source), output);
});

test('invalid light and geometry contracts reject before changing source data', () => {
  const source = sprite(3, 2), before = structuredClone(source);
  for (const options of [
    { lights: [{ direction: [0, 0, 0] }] }, { lights: [{ direction: [1, 2] }] },
    { lights: [{ direction: [0, 0, 1], intensity: -1 }] }, { ambientColor: '#ffff' },
    { ambient: Infinity }, { specular: -1 }, { roughness: 2 }, { diffuseBands: 1 },
    { diffuseBands: 2.5 }, { strength: NaN }, { palette: [] }, { wrap: 1 },
    { lights: Array(9).fill({ direction: [0, 0, 1] }) },
  ]) assert.throws(() => createPixelRelighter2D(options), RangeError);
  for (const edit of [{ height: [1] }, { normal: new Float32Array(18).fill(NaN) },
    { selection: [1] }, { protectedMask: [0, 0, 0, Infinity, 0, 0] },
    { height: [0, 0, 0, 1e308, 0, 0] }]) assert.throws(() => relightPixelArt2D(source, {}, edit), RangeError);
  assert.throws(() => relightPixelArt2D({ ...source, pixels: new Uint32Array(1) }), RangeError);
  assert.deepEqual(source, before);
});
