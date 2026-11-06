import test from 'node:test';
import assert from 'node:assert/strict';
import { bakePixelSurfaceLighting2D, exportPixelSurfaceMaps2D } from '../build/core/pixel-surface-maps.js';
import { createPixelMaterial2D } from '../build/core/pixel-material.js';
import { createMaterialChannels2D } from '../build/core/material-surface.js';

function sprite(w, h, color = 0xff806040) {
  return { w, h, pixels: new Uint32Array(w * h).fill(color),
    mask: { w, h, data: new Uint8Array(w * h).fill(1) } };
}

function cliff(w = 13, h = 5) {
  const heights = new Float32Array(w * h);
  for (let y = 0; y < h; y++) heights[y * w + 6] = 4;
  return heights;
}

test('flat and uniformly tilted planes stay open, including borders', () => {
  const w = 19, h = 13;
  for (const tilt of [false, true]) {
    const height = Float32Array.from({ length: w * h }, (_, i) => 17 + (tilt ? (i % w) * .25 - Math.floor(i / w) * .5 : 0));
    const before = height.slice();
    const result = bakePixelSurfaceLighting2D(w, h, height, { light: [1, 0, .3], occlusionRadius: 8, bias: 0 });
    assert.ok(result.occlusion.every(v => v === 1), 'tilt alone must not be mistaken for a cavity');
    assert.ok(result.shadow.every(v => v === 1), 'a light ray just above the plane must not catch artificial cell-face steps');
    assert.deepEqual(height, before);
  }
});

test('a four-cell-high cliff casts its analytically expected shadow on the opposite side of the light', () => {
  const w = 13, h = 5, height = cliff(w, h);
  for (const direction of [-1, 1]) {
    const result = bakePixelSurfaceLighting2D(w, h, height, {
      light: [direction, 0, 1], ambientOcclusion: 0, shadowDistance: 16, bias: 0,
    });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // At 45 degrees, a 4-cell wall blocks centers .5, 1.5, 2.5 and 3.5 cells
      // from its near face. The center 4.5 cells away clears the top.
      const blocked = direction > 0 ? x >= 2 && x <= 5 : x >= 7 && x <= 10;
      assert.equal(result.shadow[y * w + x], blocked ? 0 : 1, `light ${direction}, cell ${x},${y}`);
    }
  }
  const limited = bakePixelSurfaceLighting2D(w, h, height, {
    light: [1, 0, 1], ambientOcclusion: 0, shadowDistance: 2, bias: 0,
  });
  assert.equal(limited.shadow[2 * w + 3], 1, 'the wall starts beyond the finite ray distance');
  assert.equal(limited.shadow[2 * w + 4], 0, 'a nearer wall remains inside the distance');
});

test('diagonal directional rays visit thin columns without inventing corner-side blockers', () => {
  const w = 9, h = 6, height = new Float32Array(w * h), mask = new Uint8Array(w * h).fill(1);
  height[2 * w + 4] = 3;
  const options = { light: [3, 1, 1], ambientOcclusion: 0, mask, bias: 0 };
  const hit = bakePixelSurfaceLighting2D(w, h, height, options);
  assert.equal(hit.shadow[w + 1], 0, 'the 3:1 ray enters the one-cell blocker at 4,2');
  height[2 * w + 4] = 0;
  height[w + 3] = 100;
  const corner = bakePixelSurfaceLighting2D(w, h, height, options);
  assert.equal(corner.shadow[w + 1], 1, 'the ray touches only the corner of 3,1, then enters 3,2');
});

test('transparent holes and the canvas exterior contribute no phantom occlusion or shadows', () => {
  const w = 13, h = 5, height = cliff(w, h), mask = new Uint8Array(w * h).fill(1);
  for (let y = 0; y < h; y++) mask[y * w + 6] = 0;
  const result = bakePixelSurfaceLighting2D(w, h, height, { light: [1, 0, 1], mask, bias: 0 });
  assert.ok(result.occlusion.every(v => v === 1));
  assert.ok(result.shadow.every(v => v === 1));
  const empty = bakePixelSurfaceLighting2D(w, h, height, { mask: new Uint8Array(w * h), light: [0, 0, -1] });
  assert.ok(empty.occlusion.every(v => v === 1) && empty.shadow.every(v => v === 1));
});

test('horizon AO responds to a surrounding ridge, radius and strength without frame randomness', () => {
  const w = 11, h = 11, height = new Float32Array(w * h), center = 5 * w + 5;
  for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++)
    if (x === 2 || x === 8 || y === 2 || y === 8) height[y * w + x] = 4;
  const options = { castShadow: 0, occlusionRadius: 5, ambientOcclusion: 1, bias: 0 };
  const full = bakePixelSurfaceLighting2D(w, h, height, options);
  assert.ok(full.occlusion[center] < .6, 'the raised ring closes much of the center horizon');
  assert.ok(full.occlusion.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  const short = bakePixelSurfaceLighting2D(w, h, height, { ...options, occlusionRadius: 1 });
  assert.equal(short.occlusion[center], 1, 'radius one cannot reach the ring three cells away');
  const half = bakePixelSurfaceLighting2D(w, h, height, { ...options, ambientOcclusion: .5 });
  assert.ok(Math.abs(half.occlusion[center] - (1 + full.occlusion[center]) * .5) < 1e-7);
  assert.deepEqual(bakePixelSurfaceLighting2D(w, h, height, options), full);
  assert.deepEqual(bakePixelSurfaceLighting2D(w, h, Float32Array.from(height, v => v + 32), options), full,
    'moving the entire surface vertically does not change relative occlusion');
});

test('map encoding has an explicit OpenGL/DirectX green-channel convention and exact coverage', () => {
  const source = sprite(5, 3), n = source.pixels.length;
  source.pixels[1] = 0x80402010;
  source.pixels[2] = 0x00123456;
  source.mask.data[3] = 0;
  source.channels = createMaterialChannels2D(source.w, source.h, {
    height: Float32Array.from({ length: n }, (_, i) => Math.floor(i / source.w)),
    normal: Float32Array.from({ length: n * 3 }, (_, i) => i % 3 === 0 ? 0 : i % 3 === 1 ? -Math.SQRT1_2 : Math.SQRT1_2),
  });
  const before = structuredClone(source), noVisibility = { ambientOcclusion: 0, castShadow: 0 };
  const gl = exportPixelSurfaceMaps2D(source, { normalConvention: 'opengl', heightRange: [0, 2], lighting: noVisibility });
  const dx = exportPixelSurfaceMaps2D(source, { normalConvention: 'directx', heightRange: [0, 2], lighting: noVisibility });
  assert.deepEqual([gl.normal.pixels[0] & 255, gl.normal.pixels[0] >>> 8 & 255, gl.normal.pixels[0] >>> 16 & 255], [128, 218, 218]);
  assert.deepEqual([dx.normal.pixels[0] & 255, dx.normal.pixels[0] >>> 8 & 255, dx.normal.pixels[0] >>> 16 & 255], [128, 37, 218]);
  for (const bundle of [gl, dx]) for (const key of ['normal', 'height', 'occlusion', 'shadow']) {
    const map = bundle[key];
    for (let i = 0; i < n; i++) assert.equal(map.pixels[i] >>> 24, source.mask.data[i] ? source.pixels[i] >>> 24 : 0);
    assert.deepEqual(map.mask, source.mask);
    assert.notEqual(map.mask.data, source.mask.data);
    assert.equal(map.pixels[2], 0, 'transparent hidden RGB must not appear in exported maps');
    assert.equal(map.pixels[3], 0, 'the independent silhouette masks a stored opaque color');
  }
  assert.deepEqual(source, before);
  assert.deepEqual(gl.heightRange, [0, 2]);
  assert.equal(gl.normalConvention, 'opengl');
});

test('fixed height ranges retain cross-frame meaning, clamp endpoints, and handle flat/empty surfaces', () => {
  const source = sprite(7, 1);
  source.channels = createMaterialChannels2D(7, 1, { height: [-1, 0, 1, 2, 3, 4, 5] });
  const maps = exportPixelSurfaceMaps2D(source, {
    heightRange: [0, 4], lighting: { ambientOcclusion: 0, castShadow: 0 },
  });
  assert.deepEqual([...maps.height.pixels].map(c => c & 255), [0, 0, 64, 128, 191, 255, 255]);
  const flat = sprite(1, 1);
  flat.channels = createMaterialChannels2D(1, 1, { height: [7] });
  const single = exportPixelSurfaceMaps2D(flat);
  assert.deepEqual(single.heightRange, [7, 7]);
  assert.equal(single.height.pixels[0] & 0xffffff, 0);
  assert.equal(single.normal.pixels[0], 0xffff8080);
  flat.mask.data[0] = 0;
  const empty = exportPixelSurfaceMaps2D(flat);
  assert.deepEqual(empty.heightRange, [0, 0]);
  for (const key of ['normal', 'height', 'occlusion', 'shadow']) assert.equal(empty[key].pixels[0], 0);
});

test('partial alpha and an independent mask cannot turn hidden geometry into a shadow caster', () => {
  const source = sprite(13, 5), height = cliff();
  source.channels = createMaterialChannels2D(source.w, source.h, { height });
  for (let y = 0; y < source.h; y++) source.pixels[y * source.w + 6] = 0x00406080;
  source.pixels[2 * source.w + 3] = 0x7f806040;
  const result = exportPixelSurfaceMaps2D(source, { lighting: { light: [1, 0, 1] } });
  assert.ok(result.lighting.shadow.every(v => v === 1));
  assert.ok(result.lighting.occlusion.every(v => v === 1));
  assert.equal(result.shadow.pixels[2 * source.w + 3], 0x7fffffff);
});

test('material lighting is opt-in, palette locked and uses unchanged source geometry outside the selection', () => {
  const source = sprite(13, 5), n = source.pixels.length, height = cliff();
  const palette = Array.from({ length: 32 }, (_, i) => {
    const c = Math.round(i * 255 / 31); return (0xff000000 | c | c << 8 | c << 16) >>> 0;
  });
  const settings = { detail: 0, relief: 0, bevel: 0, palette, light: [1, 0, 1], ambient: .2, materialId: 9 };
  const base = createPixelMaterial2D(settings), unlit = base.shade(source, { height });
  assert.equal(base.options.ambientOcclusion, 0); assert.equal(base.options.castShadow, 0);
  assert.deepEqual(createPixelMaterial2D({ ...settings, ambientOcclusion: 0, castShadow: 0, occlusionRadius: 32, shadowDistance: 128 }).shade(source, { height }), unlit);
  const material = createPixelMaterial2D({ ...settings, ambientOcclusion: .6, castShadow: 1 });
  const all = material.shade(source, { height });
  assert.ok((all.pixels[2 * source.w + 3] & 255) < (unlit.pixels[2 * source.w + 3] & 255));
  assert.deepEqual(all.channels, unlit.channels, 'visibility does not sculpt new geometry');
  const selection = new Uint8Array(n), protectedMask = new Uint8Array(n);
  for (let y = 0; y < source.h; y++) for (let x = 2; x <= 6; x++) selection[y * source.w + x] = 1;
  protectedMask[2 * source.w + 6] = 1;
  source.pixels[source.w + 3] = 0x7f806040;
  source.channels = createMaterialChannels2D(source.w, source.h, { height: new Float32Array(n).fill(12), defaultMaterial: 42 });
  source.emission = new Float32Array(n * 3).fill(3.5);
  const before = structuredClone(source), selected = material.shade(source, { height, selection, protectedMask });
  for (let i = 0; i < n; i++) {
    assert.equal(selected.pixels[i] >>> 24, source.pixels[i] >>> 24);
    if (!selection[i] || protectedMask[i]) {
      assert.equal(selected.pixels[i], source.pixels[i]);
      assert.equal(selected.channels.material[i], 42);
      assert.equal(selected.channels.height[i], 12);
    } else {
      assert.equal(selected.pixels[i] & 0xffffff, all.pixels[i] & 0xffffff,
        'a protected/unselected blocker still participates in the full height-field visibility');
      assert.ok(palette.some(c => (c & 0xffffff) === (selected.pixels[i] & 0xffffff)));
    }
  }
  assert.deepEqual(source, before);
  assert.deepEqual(selected.mask, source.mask);
  assert.equal(selected.emission, source.emission);
});

test('invalid inputs and excessive explicit ray work fail without mutating authored buffers', () => {
  const height = new Float32Array(20), before = height.slice();
  for (const options of [
    { mask: [1] }, { mask: Array(20).fill(NaN) }, { light: [0, 0, 0] }, { light: [1, 2] },
    { light: [1, Infinity, 1] }, { ambientOcclusion: -1 }, { castShadow: NaN },
    { occlusionRadius: 0 }, { occlusionRadius: 33 }, { occlusionRadius: 1.5 },
    { shadowDistance: 129 }, { shadowDistance: .5 }, { bias: -1 }, { bias: Infinity },
  ]) assert.throws(() => bakePixelSurfaceLighting2D(5, 4, height, options), RangeError);
  assert.throws(() => bakePixelSurfaceLighting2D(5, 4, [0]), RangeError);
  assert.throws(() => bakePixelSurfaceLighting2D(5, 4, Array(20).fill(1e308)), RangeError);
  assert.throws(() => bakePixelSurfaceLighting2D(512, 512, new Float32Array(512 * 512), {
    occlusionRadius: 32, shadowDistance: 128,
  }), /ray visits/);
  for (const options of [
    { ambientOcclusion: -1 }, { ambientOcclusion: NaN }, { castShadow: 1.1 },
    { occlusionRadius: 0 }, { occlusionRadius: 1.5 }, { shadowDistance: 129 },
  ]) assert.throws(() => createPixelMaterial2D(options), RangeError);
  const source = sprite(5, 4);
  assert.throws(() => exportPixelSurfaceMaps2D(source), /authored height and normal/);
  source.channels = createMaterialChannels2D(5, 4);
  assert.throws(() => exportPixelSurfaceMaps2D(source, { normalConvention: 'auto' }), RangeError);
  assert.throws(() => exportPixelSurfaceMaps2D(source, { heightRange: [3, 1] }), RangeError);
  assert.throws(() => exportPixelSurfaceMaps2D(source, { heightRange: [0, Infinity] }), RangeError);
  assert.deepEqual(height, before);
});
