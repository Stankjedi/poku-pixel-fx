import test from "node:test";
import assert from "node:assert/strict";
import { cubicBezier, quadraticBezier, catmullRom, pathLengths, resamplePath, forks } from "../build/core/shapes.js";

const pointDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function distanceToPath(point, path) {
  let distance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const u = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, pointDistance(point, [a[0] + dx * u, a[1] + dy * u]));
  }
  return distance;
}

test("adaptive Bézier paths follow curved and collinear reversing trajectories within a quarter pixel", () => {
  for (const controls of [
    [[0, 0], [90, -80], [-40, 70], [60, 10]],
    [[0, 0], [60, 0], [-60, 0], [1, 0]],
    [[0, 0], [60, 80], [-60, 80], [0, 0]],
  ]) {
    const points = cubicBezier(...controls);
    assert.deepEqual(points[0], controls[0]);
    assert.deepEqual(points.at(-1), controls[3]);
    for (let sample = 0; sample <= 1000; sample++) {
      const t = sample / 1000, v = 1 - t;
      const point = [0, 1].map(axis => v ** 3 * controls[0][axis] + 3 * v ** 2 * t * controls[1][axis] + 3 * v * t ** 2 * controls[2][axis] + t ** 3 * controls[3][axis]);
      assert.ok(distanceToPath(point, points) <= 0.251, `curve deviation at t=${t}`);
    }
  }
  assert.equal(cubicBezier([0, 0], [10, 0], [20, 0], [30, 0]).length, 2);
  const q = quadraticBezier([0, 0], [10, 20], [20, 0]);
  assert.ok(q.some(p => pointDistance(p, [10, 10]) < 0.001));
});

test("centripetal splines retain every waypoint and handle repeated or closed endpoints", () => {
  const points = [[0, 0], [0, 0], [1, 2], [50, 3], [51, 40]];
  const open = catmullRom(points);
  for (const point of points) assert.ok(open.some(p => pointDistance(p, point) < 1e-9));
  assert.ok(open.flat().every(Number.isFinite));
  assert.deepEqual(open, catmullRom(points));
  const closed = catmullRom([...points, points[0]], { closed: true });
  assert.deepEqual(closed[0], closed.at(-1));
  assert.ok(closed.flat().every(Number.isFinite));
  assert.deepEqual(catmullRom([[4, 7], [4, 7], [4, 7]]), [[4, 7]]);
  // Uniform Catmull–Rom loops backwards on the tiny outer segments of this path.
  const uneven = catmullRom([[0, 0], [1, 1], [100, 1], [101, 0]], { tolerance: 0.01 });
  for (let i = 1; i < uneven.length; i++) assert.ok(uneven[i][0] >= uneven[i - 1][0]);
});

test("distance resampling preserves sharp corners, endpoints and particle spacing through unequal segments", () => {
  const original = [[0, 0], [2.25, 0], [2.25, 2.25], [2.25, 2.25], [7, 2.25]];
  const path = resamplePath(original, 0.75), lengths = pathLengths(path);
  assert.deepEqual(path[0], original[0]);
  assert.deepEqual(path.at(-1), original.at(-1));
  for (const point of original) assert.ok(path.some(p => pointDistance(p, point) < 1e-9));
  for (let i = 1; i < path.length; i++) assert.ok(lengths[i] - lengths[i - 1] > 0 && lengths[i] - lengths[i - 1] <= 0.750000001);
  assert.ok(Math.abs(lengths.at(-1) - pathLengths(original).at(-1)) < 1e-9);
  assert.throws(() => resamplePath(original, 0), RangeError);
});

test("collapsed lightning paths produce no invalid forks or RNG draws", () => {
  const r = { next: () => assert.fail("empty geometry must not consume random numbers") };
  assert.deepEqual(forks(r, []), []);
  assert.deepEqual(forks(r, [[2, 3]]), []);
});
