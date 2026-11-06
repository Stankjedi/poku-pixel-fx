import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPixelMaterial2D, PIXEL_MATERIAL_PALETTES_2D } from '../build/core/pixel-material.js';
import { createMaterialShader2D } from '../build/core/material-surface.js';

function sprite(w = 64, h = 48, fill = 0xff8a6f54) {
  return { w, h, pixels: new Uint32Array(w * h).fill(fill), mask: { w, h, data: new Uint8Array(w * h).fill(1) } };
}

function dome(w = 64, h = 48) {
  const out = sprite(w, h), height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, r = ((x + .5 - w / 2) / (w * .43)) ** 2 + ((y + .5 - h / 2) / (h * .4)) ** 2;
    if (r >= 1) { out.pixels[i] = 0; out.mask.data[i] = 0; }
    else height[i] = Math.sqrt(1 - r) * h * .22;
  }
  return { source: out, height };
}

const digest = values => createHash('sha256').update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)).digest('hex');

test('compiled materials are seeded, serializable and independent of caller mutations', () => {
  const palette = [...PIXEL_MATERIAL_PALETTES_2D.stone], light = [-.6, -.7, 1];
  const material = createPixelMaterial2D({ seed: 29, palette, light });
  const { source, height } = dome(), first = material.shade(source, { height });
  palette[2] = '#fff'; light[0] = 8;
  assert.deepEqual(material.shade(source, { height }), first);
  assert.deepEqual(createPixelMaterial2D(JSON.parse(JSON.stringify(material.options))).shade(source, { height }), first);
  assert.ok(Object.isFrozen(material.options) && Object.isFrozen(material.options.palette) && Object.isFrozen(material.options.light));
  const changedSeed = createPixelMaterial2D({ ...material.options, seed: 30 }).shade(source, { height });
  assert.notEqual(digest(changedSeed.pixels), digest(first.pixels));
  assert.notEqual(digest(changedSeed.channels.height), digest(first.channels.height));
});

test('five material structures are distinct, palette locked and produce finite reusable channels', () => {
  const { source, height } = dome(92, 68), commonPalette = PIXEL_MATERIAL_PALETTES_2D.stone;
  const appearances = new Set(), fields = new Set();
  for (const kind of ['stone', 'wood', 'metal', 'fabric', 'crystal']) {
    const material = createPixelMaterial2D({ kind, palette: commonPalette, materialId: 43, seed: 42 });
    const output = material.shade(source, { height }), colors = new Set(material.options.palette.map(c => c & 0xffffff));
    appearances.add(digest(output.pixels)); fields.add(digest(output.channels.height));
    const occupiedColors = new Set();
    for (let i = 0; i < source.pixels.length; i++) {
      assert.equal(output.pixels[i] >>> 24, source.pixels[i] >>> 24);
      assert.equal(output.mask.data[i], source.mask.data[i]);
      assert.ok(Number.isFinite(output.channels.height[i]));
      const normal = output.channels.normal.subarray(i * 3, i * 3 + 3);
      assert.ok([...normal].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
      if (!source.mask.data[i]) { assert.equal(output.channels.material[i], 0); continue; }
      assert.equal(output.channels.material[i], 43);
      assert.ok(colors.has(output.pixels[i] & 0xffffff));
      occupiedColors.add(output.pixels[i]);
    }
    assert.ok(occupiedColors.size >= 4, `${kind} has more than a flat face fill; this is not an aesthetic score`);
    const relit = createMaterialShader2D([{ id: 43, palette: material.options.palette }], [], { ambient: .5 })(output, output.channels);
    assert.deepEqual(relit.mask, source.mask, 'channels remain compatible with the existing surface shader');
  }
  assert.equal(appearances.size, 5); assert.equal(fields.size, 5);
});

test('painting selections and protected accents does not alter alpha, hidden RGB, metadata or HDR', () => {
  const source = sprite(24, 18), count = source.w * source.h;
  source.pixels[1] = 0x00010203; source.pixels[2] = 0x7faabbcc; source.mask.data[3] = 0;
  source.mask.data[4] = 127;
  source.emission = new Float32Array(count * 3).fill(3.5);
  source.sockets = { grip: { x: 7, y: 4 } };
  source.channels = { w: source.w, h: source.h, material: new Uint16Array(count).fill(19), height: new Float32Array(count).fill(7), normal: new Float32Array(count * 3).fill(.5) };
  const selection = new Uint8Array(count).fill(1), protectedMask = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (i % source.w > 12) selection[i] = 0;
  protectedMask[8] = 1;
  const snapshot = structuredClone(source), material = createPixelMaterial2D({ materialId: 7 });
  const all = material.shade(source), output = material.shade(source, { selection, protectedMask });
  for (let i = 0; i < count; i++) {
    assert.equal(output.pixels[i] >>> 24, source.pixels[i] >>> 24);
    if (!selection[i] || protectedMask[i] || !source.mask.data[i] || !(source.pixels[i] >>> 24)) {
      assert.equal(output.pixels[i], source.pixels[i]);
      assert.equal(output.channels.material[i], source.channels.material[i]);
      assert.equal(output.channels.height[i], source.channels.height[i]);
      assert.deepEqual(output.channels.normal.subarray(i * 3, i * 3 + 3), source.channels.normal.subarray(i * 3, i * 3 + 3));
    } else {
      assert.equal(output.pixels[i], all.pixels[i], 'selection is a write mask, not another artificial bevel');
      assert.equal(output.channels.material[i], 7);
    }
  }
  assert.deepEqual(source, snapshot, 'authoring is non-mutating');
  assert.deepEqual(output.mask, source.mask);
  assert.notEqual(output.pixels, source.pixels); assert.notEqual(output.mask.data, source.mask.data);
  assert.notEqual(output.channels.height, source.channels.height);
  assert.equal(output.emission, source.emission); assert.equal(output.sockets, source.sockets);
  assert.equal(Object.hasOwn(material.shade(sprite()), 'emission'), false, 'surface materials do not synthesize optical emission');
});

test('object texture is stable under placement and explicit crop origins, including crop boundary normals', () => {
  const material = createPixelMaterial2D({ kind: 'wood', bevel: 0, scale: 12, grainAngle: .17 });
  const source = sprite(61, 47), full = material.shade(source, { origin: [-9.25, 4.5] });
  assert.deepEqual(material.shade({ ...source, x: 90, y: -70 }, { origin: [-9.25, 4.5] }).pixels, full.pixels);
  const cropX = 13, cropY = 11, small = sprite(23, 19);
  const cropped = material.shade(small, { origin: [-9.25 + cropX, 4.5 + cropY] });
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++) {
    const i = y * small.w + x, j = (y + cropY) * source.w + x + cropX;
    assert.equal(cropped.pixels[i], full.pixels[j]);
    assert.equal(cropped.channels.height[i], full.channels.height[j]);
    assert.deepEqual(cropped.channels.normal.subarray(i * 3, i * 3 + 3), full.channels.normal.subarray(j * 3, j * 3 + 3));
  }
});

test('authored height controls form without inferring depth from colors or scaling it by relief', () => {
  const source = sprite(20, 16), height = new Float32Array(source.w * source.h);
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) height[y * source.w + x] = .5 * x + .25 * y;
  const a = createPixelMaterial2D({ detail: 0, relief: 0, bevel: 0 }).shade(source, { height });
  const b = createPixelMaterial2D({ detail: 0, relief: 20, bevel: 0, seed: 938 }).shade(source, { height });
  assert.deepEqual(a, b); assert.deepEqual(a.channels.height, height);
  const normal = [-.5, -.25, 1], length = Math.hypot(...normal);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.channels.normal[(8 * source.w + 8) * 3 + k] - normal[k] / length) < 1e-7);
  assert.deepEqual(createPixelMaterial2D({ detail: 0, relief: 0, bevel: 0 }).shade(sprite(20, 16, 0xff234567), { height }).pixels, a.pixels);
});

test('bevel height uses Euclidean silhouette distance, including holes and the canvas exterior', () => {
  const source = sprite(21, 17), depth = 3, bevel = 9;
  for (let y = 5; y < 8; y++) for (let x = 6; x < 9; x++) { const i = y * source.w + x; source.mask.data[i] = 0; source.pixels[i] = 0; }
  const output = createPixelMaterial2D({ detail: 0, relief: depth / 1.5, bevel }).shade(source);
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
    const i = y * source.w + x;
    if (!source.mask.data[i]) continue;
    // Independent exhaustive nearest-exterior oracle, not the separable implementation.
    let nearest = Infinity;
    for (let sy = -1; sy <= source.h; sy++) for (let sx = -1; sx <= source.w; sx++) {
      if (sx >= 0 && sy >= 0 && sx < source.w && sy < source.h && source.mask.data[sy * source.w + sx]) continue;
      nearest = Math.min(nearest, Math.hypot(sx - x, sy - y));
    }
    const expected = depth * Math.sin(Math.min(1, (nearest - .5) / bevel) * Math.PI / 2);
    assert.ok(Math.abs(output.channels.height[i] - expected) < 1e-6, `Euclidean bevel at ${x},${y}`);
  }
});

test('light direction changes material shading while retaining geometry, palette and coverage', () => {
  const { source, height } = dome(), common = { kind: 'metal', seed: 19 };
  const left = createPixelMaterial2D({ ...common, light: [-1, -.5, .7] }).shade(source, { height });
  const right = createPixelMaterial2D({ ...common, light: [1, -.5, .7] }).shade(source, { height });
  assert.notEqual(digest(left.pixels), digest(right.pixels));
  assert.deepEqual(left.channels, right.channels, 'relighting does not bake a different material relief');
  assert.deepEqual(left.mask, right.mask);
});

test('zero detail removes procedural variation without removing the authored form or material reflection', () => {
  const { source, height } = dome();
  for (const kind of ['stone', 'wood', 'metal', 'fabric', 'crystal']) {
    const a = createPixelMaterial2D({ kind, seed: 1, detail: 0 }).shade(source, { height });
    const b = createPixelMaterial2D({ kind, seed: 99, detail: 0 }).shade(source, { height });
    assert.deepEqual(a, b);
  }
});

test('empty and one-cell subjects remain finite and preserve transparent data', () => {
  const material = createPixelMaterial2D();
  const empty = sprite(1, 1, 0x00123456); empty.mask.data[0] = 0;
  const output = material.shade(empty);
  assert.equal(output.pixels[0], 0x00123456); assert.equal(output.channels.material[0], 0);
  assert.deepEqual([...output.channels.normal], [0, 0, 1]);
  const dot = material.shade(sprite(1, 1));
  assert.equal(dot.pixels[0] >>> 24, 255); assert.equal(dot.mask.data[0], 1);
  assert.ok(dot.channels.height.every(Number.isFinite) && dot.channels.normal.every(Number.isFinite));
  const selection = new Uint8Array(64 * 48), untouched = sprite();
  assert.deepEqual(material.shade(untouched, { selection }).pixels, untouched.pixels);
});

test('invalid parameters and malformed buffers fail before mutating source data', () => {
  for (const input of [
    { kind: 'lava' }, { seed: 1.2 }, { seed: 0x100000000 }, { seed: NaN }, { palette: [] }, { palette: ['red'] },
    { palette: [0x00ffffff] }, { thresholds: [.5] }, { scale: 0 }, { detail: 1.1 }, { relief: -1 }, { bevel: Infinity },
    { roughness: -1 }, { light: [0, 0, 0] }, { light: [1, 2] }, { light: [1, NaN, 1] },
    { ambient: NaN }, { materialId: 0 }, { materialId: 65536 }, { grainAngle: Infinity },
  ]) assert.throws(() => createPixelMaterial2D(input), RangeError);
  const source = sprite(3, 2), before = structuredClone(source), material = createPixelMaterial2D();
  for (const edit of [
    { selection: [1] }, { protectedMask: [1] }, { selection: [1, 1, NaN, 1, 1, 1] },
    { height: [0, 0, 0, 0, NaN, 0] }, { height: [0, 0, 0, 0, 1e308, 0] },
    { origin: [Infinity, 0] }, { origin: [0, 0, 0] },
  ]) assert.throws(() => material.shade(source, edit), RangeError);
  assert.throws(() => material.shade({ ...source, pixels: new Uint32Array(1) }), RangeError);
  assert.throws(() => material.shade({ ...source, mask: { ...source.mask, w: 2 } }), RangeError);
  assert.throws(() => material.shade({ ...source, channels: { w: 3, h: 2, material: new Uint16Array(6), height: new Float32Array(6).fill(NaN), normal: new Float32Array(18) } }), RangeError);
  assert.deepEqual(source, before);
});
