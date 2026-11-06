import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizePixelPath2D, validatePixelArtPath2D } from '../build/core/pixel-path.js';

const area = mask => mask.reduce((sum, value) => sum + value, 0);
const at = (mask, w, x, y) => mask[y * w + x];
const reverse = nodes => nodes.slice().reverse().map(node => ({ point: [...node.point],
  ...(node.out ? { in: [...node.out] } : {}), ...(node.in ? { out: [...node.in] } : {}) }));

function connected(mask, w, h) {
  const first = mask.indexOf(1);
  if (first < 0) return 0;
  const queue = [first], seen = new Uint8Array(mask.length); seen[first] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy, j = yy * w + xx;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || seen[j] || !mask[j]) continue;
      seen[j] = 1; queue.push(j);
    }
  }
  return queue.length;
}

test('editable paths normalize independent anchor/handle copies and inherit endpoint widths', () => {
  const nodes = [{ point: [2.25, 9], out: [3.5, 2] }, { point: [17, 9], in: [12, 1] }], snapshot = structuredClone(nodes);
  const input = { strokeWidth: 4, endWidth: 0, pixelPerfect: true }, result = validatePixelArtPath2D(nodes, input);
  assert.deepEqual(result.options, { closed: false, fill: false, strokeWidth: 4, startWidth: 4, endWidth: 0, pixelPerfect: true, symmetry: 'none' });
  assert.deepEqual(result.nodes, nodes);
  result.nodes[0].point[0] = 20; result.nodes[0].out[0] = -10; result.options.strokeWidth = 8;
  assert.deepEqual(nodes, snapshot); assert.equal(input.strokeWidth, 4);
});

test('a straight one-cell path has inclusive connected endpoints and exact native coverage', () => {
  const mask = rasterizePixelPath2D(30, 20, [{ point: [2, 3] }, { point: [26, 12] }]);
  assert.equal(area(mask), 25);
  assert.equal(at(mask, 30, 2, 3), 1); assert.equal(at(mask, 30, 26, 12), 1);
  assert.equal(connected(mask, 30, 20), area(mask));
  assert.ok(mask instanceof Uint8Array && mask.every(value => value === 0 || value === 1));
});

test('cubic strokes follow the curve rather than its control hull and remain one native component', () => {
  const nodes = [{ point: [6, 40], out: [6, 0] }, { point: [58, 40], in: [58, 0] }];
  for (const pixelPerfect of [false, true]) {
    const mask = rasterizePixelPath2D(64, 48, nodes, { pixelPerfect });
    assert.equal(at(mask, 64, 6, 40), 1); assert.equal(at(mask, 64, 58, 40), 1);
    assert.equal(at(mask, 64, 32, 10), 1, 'the analytic symmetric cubic reaches (32,10) at t=1/2');
    assert.equal(area(mask.subarray(0, 64 * 10)), 0, 'the controls at y=0 are not themselves painted');
    assert.equal(at(mask, 64, 32, 40), 0, 'an open curve is not implicitly closed with a baseline');
    assert.equal(connected(mask, 64, 48), area(mask));
  }
});

test('joined cubic segments share their anchor without holes or isolated sample dots', () => {
  const nodes = [{ point: [2, 26], out: [2, 9] }, { point: [17, 8], in: [8, 8], out: [26, 8] }, { point: [33, 28], in: [33, 15] }];
  const mask = rasterizePixelPath2D(36, 32, nodes, { startWidth: 7, endWidth: 1 });
  assert.equal(at(mask, 36, 17, 8), 1);
  assert.equal(connected(mask, 36, 32), area(mask));
  assert.ok(area(mask) > 120);
});

test('reversing anchors and handles with the taper preserves exact stroke pixels', () => {
  const nodes = [{ point: [5, 31], out: [4, 2] }, { point: [27, 14], in: [20, 3], out: [44, 41] }, { point: [54, 5], in: [52, 36] }];
  for (const [startWidth, endWidth, pixelPerfect] of [[1, 1, false], [1, 1, true], [1.25, 6.25, false]]) {
    const mask = rasterizePixelPath2D(64, 48, nodes, { startWidth, endWidth, pixelPerfect });
    assert.deepEqual(mask, rasterizePixelPath2D(64, 48, reverse(nodes), { startWidth: endWidth, endWidth: startWidth, pixelPerfect }));
  }
});

test('taper tracks arc length instead of the number of anchors and ends in native cells', () => {
  const options = { startWidth: 1, endWidth: 9 };
  const simple = rasterizePixelPath2D(36, 32, [{ point: [4, 16] }, { point: [28, 16] }], options);
  const extraAnchor = rasterizePixelPath2D(36, 32, [{ point: [4, 16] }, { point: [6, 16] }, { point: [28, 16] }], options);
  assert.deepEqual(extraAnchor, simple, 'an unevenly placed collinear anchor does not reset or stretch the taper');
  const taper = rasterizePixelPath2D(36, 32, [{ point: [4, 16] }, { point: [28, 16] }], { startWidth: 8, endWidth: 0 });
  const column = x => Array.from({ length: 32 }, (_, y) => at(taper, 36, x, y)).reduce((a, b) => a + b, 0);
  assert.ok(column(8) > column(24));
  for (let x = 4; x < 28; x++) assert.equal(at(taper, 36, x, 16), 1);
  assert.equal(at(taper, 36, 28, 16), 0, 'a zero-diameter endpoint does not add an isolated dot');
  assert.equal(connected(taper, 36, 32), area(taper));
});

test('closed fill uses half-open pixel-center coverage, independently of winding', () => {
  const nodes = [[2, 2], [9, 2], [9, 7], [2, 7]].map(point => ({ point }));
  const options = { closed: true, fill: true, strokeWidth: 0 };
  const mask = rasterizePixelPath2D(12, 10, nodes, options);
  assert.equal(area(mask), 35);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++)
    assert.equal(at(mask, 12, x, y), Number(x >= 2 && x < 9 && y >= 2 && y < 7));
  assert.deepEqual(mask, rasterizePixelPath2D(12, 10, reverse(nodes), options));
  const outlined = rasterizePixelPath2D(12, 10, nodes, { ...options, strokeWidth: 1 });
  assert.equal(at(outlined, 12, 9, 7), 1); assert.equal(at(mask, 12, 9, 7), 0);
  for (let i = 0; i < mask.length; i++) if (mask[i]) assert.equal(outlined[i], 1, 'a stroke adds to the fill instead of cutting it');
});

test('closing handles shape the final segment and a one-anchor cubic loop can enclose native area', () => {
  const nodes = [{ point: [12, 20], out: [0, 0], in: [24, 0] }];
  const mask = rasterizePixelPath2D(24, 24, nodes, { closed: true, fill: true, strokeWidth: 0 });
  assert.ok(area(mask) > 40);
  assert.equal(at(mask, 24, 12, 10), 1);
  assert.equal(at(mask, 24, 1, 1), 0);
  assert.deepEqual(mask, rasterizePixelPath2D(24, 24, reverse(nodes), { closed: true, fill: true, strokeWidth: 0 }));
});

test('concave off-canvas fills keep their authored boundary instead of drawing the clip rectangle', () => {
  const nodes = [[-2, -2], [8, -2], [8, 3], [3, 3], [3, 10], [-2, 10]].map(point => ({ point }));
  const mask = rasterizePixelPath2D(12, 12, nodes, { closed: true, fill: true, strokeWidth: 0 });
  assert.equal(area(mask), 45);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++)
    assert.equal(at(mask, 12, x, y), Number(y < 3 && x < 8 || y < 10 && x < 3));
});

test('cropping a curve leaves its staircase and global taper phase unchanged', () => {
  const nodes = [{ point: [-25, -4], out: [0, 60] }, { point: [52, 12], in: [20, -28] }];
  const options = { startWidth: 1.5, endWidth: 7 }, small = rasterizePixelPath2D(24, 18, nodes, options);
  const shift = pair => [pair[0] + 40, pair[1] + 30];
  const translated = nodes.map(node => ({ point: shift(node.point), ...(node.in ? { in: shift(node.in) } : {}), ...(node.out ? { out: shift(node.out) } : {}) }));
  const large = rasterizePixelPath2D(120, 100, translated, options);
  assert.ok(area(small) > 0);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++)
    assert.equal(at(small, 24, x, y), at(large, 120, x + 40, y + 30));
  assert.equal(area(rasterizePixelPath2D(8, 8, [{ point: [-1_000_000, 3] }, { point: [1_000_000, 3] }])), 8);
});

test('symmetry mirrors final even-width coverage exactly and produces binary unions', () => {
  const nodes = [{ point: [2, 4], out: [4, 1] }, { point: [10, 7], in: [7, 2] }];
  for (const [w, h] of [[28, 18], [29, 19]]) {
    const mask = rasterizePixelPath2D(w, h, nodes, { strokeWidth: 4, symmetry: 'xy' });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      assert.equal(at(mask, w, x, y), at(mask, w, w - 1 - x, y));
      assert.equal(at(mask, w, x, y), at(mask, w, x, h - 1 - y));
    }
    assert.ok(mask.every(value => value === 0 || value === 1));
  }
});

test('empty, repeated and zero-width anchors have explicit stable degenerate behavior', () => {
  assert.equal(area(rasterizePixelPath2D(8, 8, [])), 0);
  assert.equal(area(rasterizePixelPath2D(8, 8, [{ point: [3, 3] }])), 1);
  assert.equal(area(rasterizePixelPath2D(8, 8, [{ point: [3, 3] }, { point: [3, 3] }])), 1);
  assert.equal(area(rasterizePixelPath2D(8, 8, [{ point: [3, 3] }], { strokeWidth: 0 })), 0);
  assert.equal(area(rasterizePixelPath2D(8, 8, [{ point: [3, 3] }], { closed: true, fill: true, strokeWidth: 0 })), 0);
  const nodes = [{ point: [1, 6], out: [1, 1] }, { point: [7, 6], in: [7, 1] }], snapshot = structuredClone(nodes);
  assert.deepEqual(rasterizePixelPath2D(8, 8, nodes), rasterizePixelPath2D(8, 8, nodes));
  assert.deepEqual(nodes, snapshot);
});

test('invalid geometry, discontinuous closed tapers and authoring budgets fail before changing input', () => {
  const nodes = [{ point: [1, 2], out: [3, 4] }, { point: [6, 7] }], original = structuredClone(nodes);
  for (const size of [[0, 8], [8, -1], [1.5, 8], [4097, 8], [8, Infinity]])
    assert.throws(() => rasterizePixelPath2D(...size, nodes), RangeError);
  for (const input of [null, [null], [{ point: [NaN, 1] }], [{ point: [1] }], [{ point: [0, 0], in: [Infinity, 1] }],
    [{ point: [1_048_577, 1] }], Array.from({ length: 1025 }, () => ({ point: [0, 0] }))])
    assert.throws(() => rasterizePixelPath2D(8, 8, input), RangeError);
  for (const options of [null, { fill: true }, { closed: 1 }, { fill: 'yes' }, { pixelPerfect: 1 }, { symmetry: 'radial' },
    { strokeWidth: -1 }, { startWidth: NaN }, { endWidth: Infinity }, { strokeWidth: 257 }, { closed: true, startWidth: 3, endWidth: 1 }])
    assert.throws(() => rasterizePixelPath2D(8, 8, nodes, options), RangeError);
  assert.deepEqual(nodes, original);
});
