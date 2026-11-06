import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizePixelContour2D, createOrganicSilhouette2D } from '../build/core/pixel-contour.js';

const rect = (x0, y0, x1, y1, reverse = false) => {
  const points = reverse ? [[x0, y0], [x0, y1], [x1, y1], [x1, y0]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return points.map((to, i) => ({ kind: i ? 'line' : 'move', to })).concat({ kind: 'close' });
};
const area = mask => mask.data.reduce((a, b) => a + b, 0);

test('native contour fill has a half-open pixel-center convention, independent of winding', () => {
  const a = rasterizePixelContour2D(6, 6, rect(.5, .5, 3.5, 3.5));
  assert.equal(area(a), 9);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) assert.equal(a.data[y * 6 + x], x < 3 && y < 3 ? 1 : 0);
  assert.deepEqual(a, rasterizePixelContour2D(6, 6, rect(.5, .5, 3.5, 3.5, true)));
  assert.ok(a.data.every(value => value === 0 || value === 1), 'no softened opacity fringe');
});

test('even-odd subpaths preserve holes and nested islands without requiring opposite winding', () => {
  const outer = rect(1, 1, 11, 11), hole = rect(4, 4, 8, 8), island = rect(5, 5, 7, 7);
  const result = rasterizePixelContour2D(12, 12, [...outer, ...hole, ...island]);
  assert.equal(area(result), 88);
  assert.equal(result.data[4 * 12 + 4], 0);
  assert.equal(result.data[5 * 12 + 5], 1);
  assert.deepEqual(result, rasterizePixelContour2D(12, 12, [...outer, ...rect(4, 4, 8, 8, true), ...island]));
  assert.equal(area(rasterizePixelContour2D(12, 12, [...outer, ...outer])), 0, 'duplicate contours cancel under even-odd fill');
});

test('concave off-canvas geometry clips correctly and new moves close previous subpaths', () => {
  const path = [
    { kind: 'move', to: [-3, -3] }, { kind: 'line', to: [6, -3] },
    { kind: 'line', to: [6, 2] }, { kind: 'line', to: [2, 2] },
    { kind: 'line', to: [2, 7] }, { kind: 'line', to: [-3, 7] },
  ];
  const result = rasterizePixelContour2D(8, 8, path);
  assert.equal(area(result), 22);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    assert.equal(result.data[y * 8 + x], y < 2 && x < 6 || y < 7 && x < 2 ? 1 : 0);
  const withIsland = rasterizePixelContour2D(8, 8, [...path, ...rect(5, 5, 7, 7)]);
  assert.equal(area(withIsland), 26);
  assert.equal(area(rasterizePixelContour2D(8, 8, rect(-100, -100, 100, 100))), 64);
});

test('shared diagonal boundaries do not leave cracks or double-filled cells', () => {
  const path = [
    { kind: 'move', to: [0, 0] }, { kind: 'line', to: [6, 0] }, { kind: 'line', to: [6, 6] }, { kind: 'close' },
    { kind: 'move', to: [0, 0] }, { kind: 'line', to: [6, 6] }, { kind: 'line', to: [0, 6] }, { kind: 'close' },
  ];
  assert.equal(area(rasterizePixelContour2D(6, 6, path)), 36);
});

test('quadratic arch agrees with an independent analytic pixel-center oracle', () => {
  const path = [
    { kind: 'move', to: [2, 14] },
    { kind: 'quadratic', control: [10, -2], to: [18, 14] },
    { kind: 'close' },
  ];
  const source = structuredClone(path), result = rasterizePixelContour2D(20, 16, path, { tolerance: 1 / 256 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 20; x++) {
    const t = (x + .5 - 2) / 16, top = 14 - 32 * t * (1 - t);
    const inside = t >= 0 && t < 1 && y + .5 >= top && y + .5 < 14;
    assert.equal(result.data[y * 20 + x], Number(inside), `arch cell ${x},${y}`);
  }
  assert.deepEqual(path, source, 'control points are not mutated');
  assert.deepEqual(result, rasterizePixelContour2D(20, 16, path, { tolerance: 1 / 256 }));
});

test('cubic arch follows continuous curvature rather than its control polygon', () => {
  const result = rasterizePixelContour2D(20, 16, [
    { kind: 'move', to: [2, 14] },
    { kind: 'cubic', control1: [2, -2], control2: [18, -2], to: [18, 14] },
    { kind: 'close' },
  ], { tolerance: 1 / 256 });
  let checked = 0;
  for (let x = 2; x < 18; x++) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const t = (lo + hi) / 2, px = 2 + 48 * t * t - 32 * t * t * t;
      if (px < x + .5) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2, top = 14 - 48 * t + 48 * t * t;
    for (let y = 0; y < 16; y++) {
      if (Math.abs(y + .5 - top) < .02) continue;
      assert.equal(result.data[y * 20 + x], Number(y + .5 >= top && y < 14), `cubic cell ${x},${y}`);
      checked++;
    }
  }
  assert.ok(checked > 240, 'oracle checks nearly every curve-interior column cell');
  assert.equal(result.data[3 * 20 + 3], 0, 'does not fill the rectangle formed by the control hull');
  assert.equal(result.data[3 * 20 + 10], 1, 'retains rounded arch interior');
});

test('empty and degenerate paths remain empty', () => {
  for (const path of [[], [{ kind: 'move', to: [3, 3] }], rect(2, 2, 2, 6), rect(2, 2, 6, 2)])
    assert.equal(area(rasterizePixelContour2D(8, 8, path)), 0);
});

test('contour validation rejects malformed geometry and excessive authoring budgets', () => {
  for (const dimensions of [[0, 8], [8, -1], [2.5, 8], [4097, 1], [8, Infinity]])
    assert.throws(() => rasterizePixelContour2D(...dimensions, []), RangeError);
  for (const commands of [null, [null], [{ kind: 'line', to: [1, 1] }], [{ kind: 'close' }],
    [{ kind: 'move', to: [NaN, 1] }], [{ kind: 'move', to: [0, 0] }, { kind: 'unknown' }],
    [{ kind: 'move', to: [0, 0] }, { kind: 'quadratic', control: [0, Infinity], to: [1, 1] }],
    [{ kind: 'move', to: [0, 0] }, { kind: 'cubic', control1: [1, 2], control2: [2], to: [3, 0] }],
    [{ kind: 'move', to: [0, 0] }, { kind: 'close' }, { kind: 'line', to: [1, 1] }],
    Array.from({ length: 4097 }, () => ({ kind: 'move', to: [0, 0] }))])
    assert.throws(() => rasterizePixelContour2D(8, 8, commands), RangeError);
  for (const tolerance of [0, -1, NaN, Infinity, 1 / 1024, 2])
    assert.throws(() => rasterizePixelContour2D(8, 8, [], { tolerance }), /tolerance/);
});

test('zero irregularity produces an exact ellipse independent of seed', () => {
  const w = 65, h = 49, inset = 2.25;
  const result = createOrganicSilhouette2D(w, h, { seed: 9, inset, irregularity: 0 });
  assert.deepEqual(result, createOrganicSilhouette2D(w, h, { seed: 0, inset, irregularity: 0 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + .5 - w / 2) / (w / 2 - inset), ny = (y + .5 - h / 2) / (h / 2 - inset);
    assert.equal(result.data[y * w + x], Number(nx * nx + ny * ny <= 1));
  }
});

test('organic silhouettes are reproducible connected forms with stable padding', () => {
  const options = { seed: 37, inset: 2, irregularity: .8, lobes: 4 };
  const result = createOrganicSilhouette2D(96, 64, options);
  assert.deepEqual(result, createOrganicSilhouette2D(96, 64, options));
  assert.notDeepEqual(result.data, createOrganicSilhouette2D(96, 64, { ...options, seed: 38 }).data);
  assert.ok(result.data.every(value => value === 0 || value === 1));
  assert.ok(area(result) > 3000 && area(result) < 4500);
  for (let y = 0; y < result.h; y++) for (let x = 0; x < result.w; x++)
    if (x < 2 || y < 2 || x >= result.w - 2 || y >= result.h - 2) assert.equal(result.data[y * result.w + x], 0);
  // A four-neighbor flood from one interior cell visits every occupied cell.
  const first = result.data.indexOf(1), seen = new Uint8Array(result.data.length), queue = [first];
  seen[first] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % result.w, y = Math.floor(i / result.w);
    for (const j of [x ? i - 1 : -1, x + 1 < result.w ? i + 1 : -1, y ? i - result.w : -1, y + 1 < result.h ? i + result.w : -1])
      if (j >= 0 && result.data[j] && !seen[j]) { seen[j] = 1; queue.push(j); }
  }
  assert.equal(queue.length, area(result));
  assert.equal(area(createOrganicSilhouette2D(1, 1)), 1, 'tiny native canvas still has a valid interior');
});

test('organic silhouette options reject nonfinite or collapsed native geometry', () => {
  for (const options of [{ seed: -1 }, { seed: .5 }, { seed: 0x100000000 }, { seed: NaN },
    { inset: -1 }, { inset: 4 }, { inset: Infinity }, { irregularity: -1 }, { irregularity: 1.1 },
    { irregularity: NaN }, { lobes: 1 }, { lobes: 2.5 }, { lobes: 13 }])
    assert.throws(() => createOrganicSilhouette2D(8, 8, options), RangeError);
});
