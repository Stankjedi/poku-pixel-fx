import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePixelArt2D } from '../build/core/pixel-art-analysis.js';

const color = (r, g = r, b = r, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
function sprite(w, h, sample = () => color(64)) {
  const pixels = new Uint32Array(w * h), data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = sample(x, y) >>> 0, i = y * w + x;
    pixels[i] = c; data[i] = c >>> 24 ? 1 : 0;
  }
  return { w, h, pixels, mask: { w, h, data } };
}
const issuesOf = (analysis, kind) => analysis.issues.filter(issue => issue.kind === kind);

test('measurement-only analysis leaves authored pixels and masks intact and makes no judgement', () => {
  const source = sprite(24, 16), before = structuredClone(source);
  const result = diagnosePixelArt2D(source);
  assert.deepEqual(source, before);
  assert.deepEqual(result.metrics, {
    occupied: 384, analyzed: 384, paletteSize: 1, nearFlatRegionCount: 1,
    largestFlatRegion: 384, dominantFlatRegionRatio: 1, silhouetteCells: 76,
    longestStraightRun: 24, interiorCells: 308, isolatedColorCells: 0, isolatedColorRatio: 0,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.totalIssues, 0);
  assert.ok(result.heatmap.every(value => value === 0));
  assert.deepEqual(result, diagnosePixelArt2D(source), 'the same native raster is measured deterministically');
});

test('organic, cel-shaded and geometric expectations distinguish deliberate flat art', () => {
  const source = sprite(24, 16);
  const organic = diagnosePixelArt2D(source, { expectedStyle: 'organic' });
  const cel = diagnosePixelArt2D(source, { expectedStyle: 'cel-shaded' });
  const geometric = diagnosePixelArt2D(source, { expectedStyle: 'geometric' });
  assert.equal(issuesOf(organic, 'flat-region').length, 1);
  assert.equal(issuesOf(organic, 'straight-contour').length, 4);
  assert.equal(organic.totalIssues, 5);
  const region = issuesOf(organic, 'flat-region')[0];
  assert.deepEqual(region.bounds, { x: 0, y: 0, w: 24, h: 16 });
  assert.equal(region.area, 384);
  assert.equal(region.evidence.ratio, 1);
  assert.equal(region.evidence.maxChannelSpread, 0);
  assert.ok(organic.issues.every(issue => issue.confidence === 'heuristic'));
  assert.equal(organic.heatmap[0], 3, 'a flat contour carries both flags');
  assert.equal(organic.heatmap[25], 1, 'flat interior is not a straight silhouette');
  assert.equal(issuesOf(cel, 'flat-region').length, 0);
  assert.equal(issuesOf(cel, 'straight-contour').length, 4);
  assert.deepEqual(geometric.issues, []);
  assert.deepEqual(organic.metrics, cel.metrics);
  assert.deepEqual(cel.metrics, geometric.metrics, 'expectation changes suggestions, not measurement');
});

test('near-duplicate face colors form one region while alpha never becomes a new palette entry', () => {
  const source = sprite(32, 16, (x, y) => (x + y) % 2
    ? color(32, 50, 64, 96) : color(38, 55, 70));
  const near = diagnosePixelArt2D(source, { expectedStyle: 'organic', colorTolerance: 6 });
  const exact = diagnosePixelArt2D(source, { expectedStyle: 'organic', colorTolerance: 0 });
  assert.equal(near.metrics.paletteSize, 2);
  assert.equal(near.metrics.largestFlatRegion, 512);
  assert.equal(issuesOf(near, 'flat-region')[0].evidence.maxChannelSpread, 6);
  assert.equal(exact.metrics.largestFlatRegion, 1, 'four-connected exact colors cannot cross the alternating neighbors');
  assert.equal(issuesOf(exact, 'flat-region').length, 0);
  assert.equal(exact.metrics.isolatedColorCells, 0, 'diagonally connected ordered patterns are not singleton noise');
  const coverage = sprite(32, 16, (x, y) => color(38, 55, 70, (x + y) % 2 ? 96 : 255));
  assert.equal(diagnosePixelArt2D(coverage).metrics.paletteSize, 1);
});

test('similar adjacent steps do not merge an entire value ramp into a flat region', () => {
  const source = sprite(64, 16, x => color(x * 4));
  const result = diagnosePixelArt2D(source, { expectedStyle: 'organic', colorTolerance: 10 });
  assert.equal(result.metrics.largestFlatRegion, 3 * 16);
  assert.equal(result.metrics.dominantFlatRegionRatio, 3 / 64);
  assert.equal(issuesOf(result, 'flat-region').length, 0);
  assert.equal(result.metrics.isolatedColorCells, 0);
});

test('separated same-color faces have separate native bounds and do not merge across transparency', () => {
  const source = sprite(30, 12, (x, y) => y >= 2 && y < 10
    && (x >= 2 && x < 12 || x >= 18 && x < 28) ? color(64) : 0);
  const result = diagnosePixelArt2D(source, { expectedStyle: 'organic' });
  const faces = issuesOf(result, 'flat-region');
  assert.equal(result.metrics.occupied, 160);
  assert.equal(result.metrics.largestFlatRegion, 80);
  assert.equal(result.metrics.dominantFlatRegionRatio, .5);
  assert.deepEqual(faces.map(face => face.bounds), [
    { x: 2, y: 2, w: 10, h: 8 }, { x: 18, y: 2, w: 10, h: 8 },
  ]);
  assert.ok(faces.every(face => face.area === 80));
  assert.equal(result.heatmap[4 * 30 + 14], 0);
});

test('protected regions suppress suggestions without becoming fake silhouette holes', () => {
  const source = sprite(24, 16);
  const protection = Uint8Array.from(source.pixels, (_, i) => i % 24 < 12 ? 1 : 0);
  const result = diagnosePixelArt2D(source, { expectedStyle: 'organic', protected: protection });
  assert.equal(result.metrics.occupied, 384);
  assert.equal(result.metrics.analyzed, 192);
  assert.equal(result.metrics.largestFlatRegion, 192);
  assert.equal(result.metrics.longestStraightRun, 16);
  assert.equal(result.metrics.silhouetteCells, 38);
  const edges = issuesOf(result, 'straight-contour');
  assert.equal(edges.length, 3);
  assert.ok(edges.every(edge => !edge.evidence.exposedSide.includes('left')));
  for (let i = 0; i < protection.length; i++) if (protection[i]) assert.equal(result.heatmap[i], 0);
  assert.equal(result.heatmap[8 * 24 + 12], 1, 'selection boundary remains an interior flat cell');
  const allProtected = diagnosePixelArt2D(source, { expectedStyle: 'organic', protected: new Uint8Array(384).fill(1) });
  assert.equal(allProtected.metrics.occupied, 384);
  assert.equal(allProtected.metrics.analyzed, 0);
  assert.equal(allProtected.metrics.dominantFlatRegionRatio, 0);
  assert.equal(allProtected.metrics.longestStraightRun, 0);
  assert.deepEqual(allProtected.issues, []);
  assert.ok(allProtected.heatmap.every(value => value === 0));
});

test('axis contours report all four sides, and both 45-degree directions are measured', () => {
  const box = diagnosePixelArt2D(sprite(24, 16), { expectedStyle: 'cel-shaded' });
  assert.deepEqual(issuesOf(box, 'straight-contour').map(issue => issue.evidence.exposedSide).sort(),
    ['bottom', 'left', 'right', 'top']);
  const down = diagnosePixelArt2D(sprite(32, 32, (x, y) => x >= y ? color(60) : 0),
    { expectedStyle: 'cel-shaded' });
  const up = diagnosePixelArt2D(sprite(32, 32, (x, y) => x + y >= 31 ? color(60) : 0),
    { expectedStyle: 'cel-shaded' });
  const downEdge = issuesOf(down, 'straight-contour').find(issue => issue.evidence.direction === 'diagonal-down');
  const upEdge = issuesOf(up, 'straight-contour').find(issue => issue.evidence.direction === 'diagonal-up');
  assert.equal(downEdge?.area, 32);
  assert.equal(upEdge?.area, 32);
  assert.deepEqual(downEdge?.bounds, { x: 0, y: 0, w: 32, h: 32 });
  assert.deepEqual(upEdge?.bounds, { x: 0, y: 0, w: 32, h: 32 });
  for (let i = 0; i < 32; i++) {
    assert.ok(down.heatmap[i * 32 + i] & 2);
    assert.ok(up.heatmap[(31 - i) * 32 + i] & 2);
  }
});

test('ordered patterns and thin authored contours are not treated as interior singleton noise', () => {
  const checker = sprite(24, 24, (x, y) => color((x + y) % 2 ? 255 : 0));
  const narrow = sprite(24, 24, (x, y) => x === y ? color(x % 2 ? 255 : 0) : 0);
  for (const source of [checker, narrow]) {
    const result = diagnosePixelArt2D(source, { expectedStyle: 'geometric', colorTolerance: 0 });
    assert.equal(result.metrics.isolatedColorCells, 0);
    assert.equal(issuesOf(result, 'color-noise').length, 0);
  }
});

test('excessive isolated interior colors have an explainable ratio and a bounded heatmap', () => {
  const source = sprite(16, 16, (x, y) => color(x * 11, y * 11, (x + y) * 5));
  const result = diagnosePixelArt2D(source, {
    expectedStyle: 'geometric', colorTolerance: 0, maxIsolatedColorRatio: .5,
  });
  assert.equal(result.metrics.interiorCells, 196);
  assert.equal(result.metrics.isolatedColorCells, 196);
  assert.equal(result.metrics.isolatedColorRatio, 196 / 256);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].kind, 'color-noise');
  assert.deepEqual(result.issues[0].bounds, { x: 1, y: 1, w: 14, h: 14 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    assert.equal(result.heatmap[y * 16 + x], x && y && x < 15 && y < 15 ? 4 : 0);
  assert.deepEqual(diagnosePixelArt2D(source, {
    expectedStyle: 'geometric', colorTolerance: 0, maxIsolatedColorRatio: .8,
  }).issues, [], 'a user-selected noise budget is respected');
});

test('intentional glints can be protected; one isolated highlight never produces a noise warning', () => {
  const source = sprite(24, 24), protectedGlints = new Uint8Array(24 * 24);
  for (let y = 2; y < 23; y += 3) for (let x = 2; x < 23; x += 3) {
    source.pixels[y * 24 + x] = color(240); protectedGlints[y * 24 + x] = 1;
  }
  assert.equal(issuesOf(diagnosePixelArt2D(source, { expectedStyle: 'geometric' }), 'color-noise').length, 1);
  const protectedResult = diagnosePixelArt2D(source, { expectedStyle: 'organic', protected: protectedGlints });
  assert.equal(protectedResult.metrics.isolatedColorCells, 0);
  assert.equal(issuesOf(protectedResult, 'color-noise').length, 0);
  for (let i = 0; i < protectedGlints.length; i++) if (protectedGlints[i]) assert.equal(protectedResult.heatmap[i], 0);
  const single = sprite(24, 24); single.pixels[12 * 24 + 12] = color(240);
  const result = diagnosePixelArt2D(single, { expectedStyle: 'geometric', maxIsolatedColorRatio: 0 });
  assert.equal(result.metrics.isolatedColorCells, 1);
  assert.deepEqual(result.issues, []);
});

test('description limits do not truncate evidence measurements or heatmap coverage', () => {
  const source = sprite(24, 16);
  const all = diagnosePixelArt2D(source, { expectedStyle: 'organic' });
  const limited = diagnosePixelArt2D(source, { expectedStyle: 'organic', maxIssues: 2 });
  assert.equal(limited.issues.length, 2);
  assert.equal(limited.totalIssues, 5);
  assert.deepEqual(limited.issues, all.issues.slice(0, 2));
  assert.deepEqual(limited.metrics, all.metrics);
  assert.deepEqual(limited.heatmap, all.heatmap);
});

test('transparent hidden colors and mask-excluded cells are not measured as surfaces', () => {
  const source = sprite(12, 12, () => 0x00123456);
  source.pixels[0] = color(255); // Mask intentionally excludes this stored pixel.
  const result = diagnosePixelArt2D(source, { expectedStyle: 'organic' });
  assert.equal(result.metrics.occupied, 0);
  assert.equal(result.metrics.paletteSize, 0);
  assert.equal(result.metrics.dominantFlatRegionRatio, 0);
  assert.equal(result.metrics.isolatedColorRatio, 0);
  assert.deepEqual(result.issues, []);
  assert.ok(Object.values(result.metrics).every(Number.isFinite));
  assert.ok(result.heatmap.every(value => value === 0));
});

test('invalid raster dimensions, selections and thresholds fail before producing diagnostics', () => {
  const source = sprite(8, 8);
  for (const bad of [
    { ...source, w: 8.5 }, { ...source, h: 0 },
    { ...source, pixels: new Uint32Array(63) },
    { ...source, mask: { ...source.mask, w: 7 } },
    { ...source, mask: { ...source.mask, data: new Uint8Array(63) } },
  ]) assert.throws(() => diagnosePixelArt2D(bad), RangeError);
  for (const options of [
    { expectedStyle: 'automatic-beauty-score' }, { protected: new Uint8Array(63) },
    { colorTolerance: -1 }, { colorTolerance: 256 }, { colorTolerance: NaN },
    { minFlatArea: 0 }, { minFlatArea: 1.2 }, { flatRegionRatio: -1 }, { flatRegionRatio: 1.1 },
    { minStraightRun: 1 }, { minStraightRun: Infinity },
    { maxIsolatedColorRatio: -1 }, { maxIsolatedColorRatio: NaN },
    { maxIssues: 0 }, { maxIssues: 4097 },
  ]) assert.throws(() => diagnosePixelArt2D(source, options), RangeError);
});
