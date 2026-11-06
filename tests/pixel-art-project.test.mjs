import test from 'node:test';
import assert from 'node:assert/strict';
import { hex } from '../build/core/color.js';
import {
  createPixelArtProject2D, validatePixelArtProject2D, pixelArtSource2D,
  renderPixelArtProject2D, serializePixelArtProject2D, parsePixelArtProject2D, pixelArtLayerLimit2D,
} from '../build/authoring/pixel-art-project.js';
import { createPixelArtStudy2D } from '../build/examples/pixel-art-study.js';

function fixture() {
  const w = 24, h = 18, pixels = new Uint32Array(w * h).fill(0x00123456), data = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x, alpha = (x + y) % 5 === 0 ? 72 : (x + y) % 7 === 0 ? 153 : 255;
    pixels[i] = ((alpha << 24) | 0x6f4a7c) >>> 0;
    data[i] = 1;
  }
  data[5 * w + 5] = 0; // Intentionally excluded opaque source pixel.
  pixels[7 * w + 8] = 0x00c4a178; // A transparent source cell carrying hidden RGB and an independent mask.
  return { w, h, pixels, mask: { w, h, data } };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function layeringProject() {
  const source = fixture(), project = createPixelArtProject2D(source, '선택 재질 · source fidelity');
  const selectionA = Array.from(source.pixels, (_, i) => i % source.w < 13 ? 1 : 0);
  const protectedA = Array.from(source.pixels, (_, i) => i % source.w === 7 ? 1 : 0);
  const selectionB = Array.from(source.pixels, (_, i) => i % source.w >= 9 && Math.floor(i / source.w) >= 6 ? 1 : 0);
  const protectedB = Array.from(source.pixels, (_, i) => i % source.w === 10 ? 1 : 0);
  project.layers.push(
    { name: 'Warm stone', material: { kind: 'stone', seed: 11, palette: ['#a83025'], materialId: 11 }, selection: selectionA, protectedMask: protectedA },
    { name: 'Cool inlay', material: { kind: 'metal', seed: 19, palette: ['#26c0d0'], materialId: 22 }, selection: selectionB, protectedMask: protectedB },
  );
  return { source, project };
}

test('pixel art source creation preserves alpha, hidden RGB and independent silhouette exactly', () => {
  const source = fixture(), original = structuredClone(source), project = createPixelArtProject2D(source);
  const restored = pixelArtSource2D(parsePixelArtProject2D(serializePixelArtProject2D(project)));
  assert.deepEqual(restored, source);
  assert.deepEqual(renderPixelArtProject2D(project), source, 'zero operations is an exact identity');
  assert.deepEqual(source, original);
  assert.equal(project.pixels[0], 0x00123456, 'transparent RGB survives creation');
  assert.equal(project.mask[5 * source.w + 5], 0, 'excluded opaque cell stays outside the source silhouette');
  assert.equal(project.mask[7 * source.w + 8], 1, 'source mask is not reconstructed from alpha when present');
  project.pixels[0] = 0;
  project.mask[0] = 1;
  assert.deepEqual(source, original, 'project buffers never alias the source');
});

test('projects without the optional silhouette retain source pixels and derive occupancy from alpha', () => {
  const project = {
    schema: 'poku-pixel-art/v1', name: 'Earlier v1', width: 3, height: 1,
    pixels: [0x00123456, 0x80445566, 0xff778899], layers: [],
  };
  const source = pixelArtSource2D(parsePixelArtProject2D(JSON.stringify(project)));
  assert.deepEqual([...source.mask.data], [0, 1, 1]);
  assert.deepEqual([...source.pixels], project.pixels);
});

test('nonzero source mask bytes normalize to binary occupancy without changing source color or alpha', () => {
  const source = fixture();
  for (let i = 0; i < source.mask.data.length; i++) if (source.mask.data[i]) source.mask.data[i] = i % 2 ? 127 : 255;
  const before = structuredClone(source), project = createPixelArtProject2D(source);
  const reopened = parsePixelArtProject2D(serializePixelArtProject2D(project)), rendered = renderPixelArtProject2D(reopened);
  assert.deepEqual(rendered.pixels, source.pixels);
  assert.deepEqual([...rendered.mask.data], Array.from(source.mask.data, value => value ? 1 : 0));
  assert.deepEqual(source, before, 'normalization belongs to the new project, not the source sprite');
  assert.throws(() => validatePixelArtProject2D({ ...project, mask: Array(project.pixels.length).fill(127) }), /binary/,
    'serialized projects continue requiring a binary silhouette');
});

test('layer order, independent selection and per-layer protection have exact pixel ownership', () => {
  const { source, project } = layeringProject(), result = renderPixelArtProject2D(project);
  const colors = [hex('#a83025'), hex('#26c0d0')];
  let changed = 0, overlap = 0;
  for (let i = 0; i < source.pixels.length; i++) {
    let expected = source.pixels[i], materialId = 0, owners = 0;
    for (let k = 0; k < project.layers.length; k++) {
      const layer = project.layers[k];
      if (source.mask.data[i] && source.pixels[i] >>> 24 && layer.selection[i] && !layer.protectedMask[i]) {
        expected = ((source.pixels[i] & 0xff000000) | (colors[k] & 0xffffff)) >>> 0;
        materialId = layer.material.materialId;
        owners++;
      }
    }
    assert.equal(result.pixels[i], expected, `native pixel ${i}`);
    assert.equal(result.pixels[i] >>> 24, source.pixels[i] >>> 24, 'coverage remains authored');
    assert.equal(result.channels.material[i], materialId, 'channel ownership follows the same selection');
    if (expected !== source.pixels[i]) changed++;
    if (owners === 2) overlap++;
  }
  assert.ok(changed > 100 && overlap > 10, 'fixture exercises repainting and overlapping layers');
  assert.deepEqual(result.mask, source.mask, 'material operations preserve every mask cell');
});

test('save/reopen replays exact material colors and height/normal channels without cumulative repainting', () => {
  const source = fixture(), project = createPixelArtProject2D(source, 'Round trip');
  project.layers.push({
    name: 'Authored relief', material: { kind: 'stone', seed: 194, scale: 9, detail: .8, relief: 2.1, bevel: 3, light: [-.7, -.4, 1] },
    origin: [-31.25, 12.75], height: Array.from(source.pixels, (_, i) => Math.sin(i % source.w / 4) * 2 + Math.floor(i / source.w) * .17),
    selection: Array.from(source.pixels, (_, i) => i % source.w !== 15 ? 1 : 0),
    protectedMask: Array.from(source.pixels, (_, i) => i % source.w === 4 ? 1 : 0),
  });
  const before = structuredClone(project), sourceBefore = structuredClone(source);
  freeze(project);
  const result = renderPixelArtProject2D(project), saved = serializePixelArtProject2D(project);
  const reopened = parsePixelArtProject2D(saved);
  assert.deepEqual(renderPixelArtProject2D(reopened), result, 'RGBA, mask and every material channel reproduce');
  assert.equal(serializePixelArtProject2D(reopened), saved, 'canonical saved settings remain stable');
  assert.deepEqual(project, before, 'rendering and saving do not modify source or operation settings');
  assert.deepEqual(source, sourceBefore);
  result.pixels.fill(0);
  result.mask.data.fill(0);
  result.channels.height.fill(0);
  assert.deepEqual(renderPixelArtProject2D(project), renderPixelArtProject2D(reopened), 'preview buffers do not alias saved input');
});

test('validation snapshots nested material, selection and height settings', () => {
  const { project } = layeringProject();
  project.layers[0].origin = [2, -3];
  project.layers[0].height = Array(project.pixels.length).fill(.25);
  const before = structuredClone(project), validated = validatePixelArtProject2D(project);
  validated.pixels[0] = 0;
  validated.mask[0] = 1;
  validated.layers[0].selection[0] = 0;
  validated.layers[0].protectedMask[0] = 1;
  validated.layers[0].height[0] = 99;
  validated.layers[0].origin[0] = 99;
  validated.layers[0].material.palette[0] = 0xffffffff;
  assert.deepEqual(project, before);
});

test('malformed imported projects reject invalid dimensions, pixels, masks and layer budgets', () => {
  const base = { schema: 'poku-pixel-art/v1', name: 'Import', width: 2, height: 2, pixels: [0, 0, 0, 0], layers: [] };
  const invalid = [
    null, [], { ...base, schema: 'poku-pixel-art/v2' }, { ...base, name: '' }, { ...base, width: 0 },
    { ...base, width: 2.5 }, { ...base, width: 1_048_577, height: 1 },
    { ...base, pixels: [0] }, { ...base, pixels: Array(4) }, { ...base, pixels: [0, 0, 0, -1] },
    { ...base, pixels: [0, 0, 0, 0x100000000] }, { ...base, pixels: [0, 0, 0, NaN] },
    { ...base, mask: null }, { ...base, mask: [0, 1, 2, 0] }, { ...base, mask: Array(4) },
    { ...base, layers: null }, { ...base, layers: Array(1) },
    { ...base, layers: Array.from({ length: 33 }, () => ({ name: 'Too many', material: {} })) },
  ];
  for (const value of invalid) assert.throws(() => validatePixelArtProject2D(value));
  assert.throws(() => parsePixelArtProject2D('{broken'), SyntaxError);
  assert.throws(() => parsePixelArtProject2D({}), TypeError);
  assert.throws(() => createPixelArtProject2D({ ...fixture(), mask: { w: 1, h: 1, data: new Uint8Array(1) } }), /match/);
});

test('defined but invalid material selections, origins and authored heights cannot be silently discarded', () => {
  const base = { schema: 'poku-pixel-art/v1', name: 'Import layer', width: 2, height: 2, pixels: [0, 0, 0, 0], layers: [] };
  const layer = { name: 'Surface', material: { kind: 'stone' } };
  const invalid = [
    { ...layer, material: null }, { ...layer, material: { kind: 'unknown' } },
    ...[null, false, 0, [0], [0, Infinity], Array(2)].map(origin => ({ ...layer, origin })),
    ...[null, false, 0, [0], [0, 0, 0, Infinity], [0, 0, 0, 1e40], Array(4)].map(height => ({ ...layer, height })),
    ...[null, [0], [0, 0, .5, 1], Array(4)].map(selection => ({ ...layer, selection })),
    ...[null, [0], [0, 0, 0, 2], Array(4)].map(protectedMask => ({ ...layer, protectedMask })),
  ];
  for (const badLayer of invalid) assert.throws(() => validatePixelArtProject2D({ ...base, layers: [badLayer] }));
});

test('authoring layer capacity uses the same count and total-cell limits as project validation', () => {
  assert.equal(pixelArtLayerLimit2D(8, 8), 32);
  assert.equal(pixelArtLayerLimit2D(1024, 512), 32);
  assert.equal(pixelArtLayerLimit2D(1025, 512), 31);
  assert.equal(pixelArtLayerLimit2D(1024, 768), 21);
  assert.equal(pixelArtLayerLimit2D(1024, 1024), 16);
  const project = {
    schema: 'poku-pixel-art/v1', name: 'Cell budget boundary', width: 1024, height: 1024,
    pixels: Array(1024 * 1024).fill(0),
    layers: Array.from({ length: 16 }, (_, i) => ({ name: `Layer ${i + 1}`, material: { kind: 'stone' } })),
  };
  assert.equal(validatePixelArtProject2D(project).layers.length, 16, 'the exact cell budget remains valid without rendering it');
  project.layers.push({ name: 'One layer too many', material: { kind: 'stone' } });
  assert.throws(() => validatePixelArtProject2D(project), /layer budget/);
});

test('project imports enforce the material shader origin range before rendering', () => {
  const project = createPixelArtProject2D(fixture());
  for (const origin of [[-1e9, 1e9], [1e9, -1e9]]) {
    project.layers = [{ name: 'Boundary origin', material: { kind: 'stone' }, origin }];
    const parsed = parsePixelArtProject2D(serializePixelArtProject2D(project)), result = renderPixelArtProject2D(parsed);
    assert.deepEqual(parsed.layers[0].origin, origin);
    assert.ok(result.channels.height.every(Number.isFinite));
    assert.ok(result.channels.normal.every(Number.isFinite));
  }
  for (const origin of [[1e9 + 1, 0], [-1e9 - 1, 0], [0, 1e9 + 1], [0, -1e9 - 1]]) {
    project.layers = [{ name: 'Out of range', material: { kind: 'stone' }, origin }];
    assert.throws(() => parsePixelArtProject2D(JSON.stringify(project)), /origin.*1e9/);
  }
  assert.throws(() => parsePixelArtProject2D(' '.repeat(64 * 1024 * 1024 + 1)), /64 MiB/);
});

test('all native material studies produce deterministic bounded pixels and finite authored height', () => {
  for (const shape of ['stone-path', 'boulder', 'blade', 'cloth', 'crystal']) {
    const a = createPixelArtStudy2D(shape, 41, true), b = createPixelArtStudy2D(shape, 41, true);
    assert.deepEqual(a, b, shape);
    assert.equal(a.sprite.w, 192);
    assert.equal(a.sprite.h, 112);
    assert.equal(a.height.length, a.sprite.w * a.sprite.h);
    assert.ok(a.height.every(Number.isFinite));
    let occupied = 0;
    for (let i = 0; i < a.height.length; i++) {
      assert.equal(a.sprite.mask.data[i], a.sprite.pixels[i] >>> 24 ? 1 : 0);
      if (a.sprite.mask.data[i]) { assert.equal(a.sprite.pixels[i] >>> 24, 255); occupied++; }
      else { assert.equal(a.sprite.pixels[i], 0); assert.equal(a.height[i], 0); }
    }
    assert.ok(occupied > 200 && occupied < a.height.length, shape + ' has occupied form and transparent padding');
  }
});

test('organic comparison changes only the rock study geometry and accepts every uint32 seed', () => {
  for (const shape of ['stone-path', 'boulder']) {
    const organic = createPixelArtStudy2D(shape, 0xffffffff, true), polygon = createPixelArtStudy2D(shape, 0xffffffff, false);
    assert.notDeepEqual(organic.sprite.mask.data, polygon.sprite.mask.data);
    assert.deepEqual(organic, createPixelArtStudy2D(shape, 0xffffffff, true));
    assert.notDeepEqual(organic.sprite.mask.data, createPixelArtStudy2D(shape, 0, true).sprite.mask.data);
  }
  for (const shape of ['blade', 'cloth', 'crystal'])
    assert.deepEqual(createPixelArtStudy2D(shape, 41, true), createPixelArtStudy2D(shape, 41, false));
  for (const seed of [-1, .5, 0x100000000, Infinity, NaN])
    assert.throws(() => createPixelArtStudy2D('blade', seed), /seed/);
  assert.throws(() => createPixelArtStudy2D('unknown'), /shape/);
  assert.throws(() => createPixelArtStudy2D('blade', 1, 'false'), /boolean/);
});
