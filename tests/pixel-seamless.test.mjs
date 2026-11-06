import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelMaterial2D } from '../build/core/pixel-material.js';
import { bakePixelSurfaceLighting2D } from '../build/core/pixel-surface-maps.js';
import { relightPixelArt2D } from '../build/core/pixel-relight.js';

function sprite(w, h) {
  return { w, h, pixels: new Uint32Array(w * h).fill(0xffa09070), mask: { w, h, data: new Uint8Array(w * h).fill(1) } };
}

test('each material repeats its colors, heights and normals at the authored period and object origin', () => {
  const source = sprite(32, 24);
  for (const kind of ['stone', 'metal', 'wood', 'fabric', 'crystal']) {
    const material = createPixelMaterial2D({ kind, tileSize: [32, 24], bevel: 0, grainAngle: .37 });
    const first = material.shade(source, { origin: [3.25, -1.5] });
    assert.deepEqual(material.shade(source, { origin: [3.25 + 32 * 7, -1.5 - 24 * 11] }), first);
    assert.deepEqual(material.shade({ ...source, x: 101, y: -300 }, { origin: [3.25, -1.5] }).pixels, first.pixels);
  }
});

test('a full seamless tile equals an interior crop of a larger native procedural surface', () => {
  const w = 24, h = 18, material = createPixelMaterial2D({ kind: 'stone', tileSize: [w, h], bevel: 0, scale: 10 });
  const small = material.shade(sprite(w, h)), large = material.shade(sprite(w * 3, h * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = (y + h) * large.w + x + w;
    assert.equal(small.pixels[i], large.pixels[j]);
    assert.equal(small.channels.height[i], large.channels.height[j]);
    assert.deepEqual(small.channels.normal.subarray(i * 3, i * 3 + 3), large.channels.normal.subarray(j * 3, j * 3 + 3));
  }
});

test('authored height normals wrap across tile boundaries instead of creating flat seam strips', () => {
  const w = 13, h = 9, source = sprite(w, h);
  const height = Float32Array.from({ length: w * h }, (_, i) => Math.sin((i % w) * 2 * Math.PI / w) * 3
    + Math.cos(Math.floor(i / w) * 2 * Math.PI / h) * 2);
  const out = createPixelMaterial2D({ tileSize: [w, h], bevel: 0, detail: 0, relief: 0 }).shade(source, { height });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, nx = (height[y * w + (x + w - 1) % w] - height[y * w + (x + 1) % w]) / 2;
    const ny = (height[((y + h - 1) % h) * w + x] - height[((y + 1) % h) * w + x]) / 2;
    const length = Math.hypot(nx, ny, 1);
    assert.deepEqual([...out.channels.normal.subarray(i * 3, i * 3 + 3)], [nx / length, ny / length, 1 / length].map(Math.fround));
  }
});

test('a height wall beyond the wrapped border casts its analytically expected shadow', () => {
  const w = 8, h = 3, height = new Float32Array(w * h), mask = new Uint8Array(w * h).fill(1);
  for (let y = 0; y < h; y++) height[y * w] = 3;
  const settings = { wrap: true, light: [1, 0, 1], castShadow: 1, ambientOcclusion: 0, shadowDistance: 8, bias: 0 };
  const output = bakePixelSurfaceLighting2D(w, h, height, settings);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.equal(output.shadow[y * w + x], x >= 5 ? 0 : 1);
  assert.ok(bakePixelSurfaceLighting2D(w, h, height, { ...settings, wrap: false }).shadow.every(v => v === 1));
  for (let y = 0; y < h; y++) mask[y * w] = 0;
  assert.ok(bakePixelSurfaceLighting2D(w, h, height, { ...settings, mask }).shadow.every(v => v === 1));
});

test('wrapped visibility and albedo relighting equal a central tile of explicitly repeated geometry', () => {
  const w = 8, h = 7, source = sprite(w, h), tiles = 7, large = sprite(w * tiles, h * tiles);
  const height = Float32Array.from({ length: w * h }, (_, i) => (i % w === 2 ? 3 : 0)
    + (Math.floor(i / w) === 4 ? 2 : 0));
  source.mask.data[3 * w + 2] = 0;
  const repeated = new Float32Array(large.w * large.h);
  for (let y = 0; y < large.h; y++) for (let x = 0; x < large.w; x++) {
    const i = y * large.w + x, j = y % h * w + x % w;
    repeated[i] = height[j]; large.mask.data[i] = source.mask.data[j];
  }
  const settings = { light: [1, .3, .8], ambientOcclusion: .7, occlusionRadius: 5, castShadow: .8, shadowDistance: 9 };
  const a = bakePixelSurfaceLighting2D(w, h, height, { ...settings, mask: source.mask.data, wrap: true });
  const b = bakePixelSurfaceLighting2D(large.w, large.h, repeated, { ...settings, mask: large.mask.data });
  const lights = [{ direction: settings.light, castShadow: .8, shadowDistance: 9 }];
  const smallLit = relightPixelArt2D(source, { lights, ambientOcclusion: .7, occlusionRadius: 5, wrap: true }, { height });
  const largeLit = relightPixelArt2D(large, { lights, ambientOcclusion: .7, occlusionRadius: 5 }, { height: repeated });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = (y + h * 3) * large.w + x + w * 3;
    assert.equal(a.occlusion[i], b.occlusion[j]); assert.equal(a.shadow[i], b.shadow[j]);
    assert.equal(smallLit.pixels[i], largeLit.pixels[j]);
  }
});

test('tile options snapshot, serialize and leave the unrequested material path unchanged', () => {
  const source = sprite(12, 8), tileSize = [12, 8], input = { kind: 'wood', tileSize, bevel: 0 };
  const material = createPixelMaterial2D(input), output = material.shade(source);
  tileSize[0] = 32;
  assert.deepEqual(material.shade(source), output);
  assert.ok(Object.isFrozen(material.options.tileSize));
  assert.deepEqual(createPixelMaterial2D(JSON.parse(JSON.stringify(material.options))).shade(source), output);
  assert.deepEqual(createPixelMaterial2D({ kind: 'wood', tileSize: undefined }).shade(source), createPixelMaterial2D({ kind: 'wood' }).shade(source));
  for (const tileSize of [[0, 8], [8], [3.5, 8], [8192, 8], [8, NaN]])
    assert.throws(() => createPixelMaterial2D({ tileSize }), RangeError);
  assert.throws(() => bakePixelSurfaceLighting2D(1, 1, [0], { wrap: 1 }), RangeError);
});
