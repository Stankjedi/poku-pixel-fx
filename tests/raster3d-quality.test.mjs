import test from "node:test";
import assert from "node:assert/strict";
import { createFrame3D, Painter3D, color3D } from "../build/3d/index.js";

function scene(camera = {}) {
  const frame = createFrame3D(64, 64);
  const p = new Painter3D(frame, { yaw: 0, elevation: 0, zoom: 1, ...camera });
  p.begin("#000");
  return { frame, p };
}

// Inverse of the yaw=0, elevation=0 camera, including its perspective scale.
function at(p, x, y, z = 0) {
  const scale = p.project([0, 0, z]).scale;
  return [(x - p.frame.w * 0.5) / scale, (p.frame.h * 0.61 - y) / scale, z];
}

function quad(p, alpha = 0.5, emission = 0.25) {
  const a = at(p, 8, 8), b = at(p, 56, 8), c = at(p, 56, 56), d = at(p, 8, 56);
  p.triangle(a, b, c, "#f00", alpha, emission);
  // Reverse the second winding as well: shared-edge ownership is winding-independent.
  p.triangle(d, c, a, "#f00", alpha, emission);
}

test("translucent triangle meshes fill every cell once, including their shared diagonal", () => {
  const { frame, p } = scene();
  quad(p);
  for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
    const inside = x >= 8 && x < 56 && y >= 8 && y < 56, i = y * frame.w + x;
    assert.equal(frame.color[i] & 255, inside ? 128 : 0, `color at ${x},${y}`);
    assert.equal(frame.light[i] & 255, inside ? 31 : 0, `emission at ${x},${y}`);
  }
});

test("ordered stippling remains explicitly selectable", () => {
  const { frame, p } = scene();
  p.alphaMode = "dither";
  quad(p, 0.5, 0);
  assert.equal(frame.alphaMode, "dither");
  assert.equal(frame.color.filter(c => (c & 255) === 255).length, 48 * 48 / 2);
});

test("tiny particles stay visible between pixel centers without enlarging to four cells", () => {
  const { frame, p } = scene();
  for (const offset of [0, 0.25, 0.5, 0.75]) {
    p.begin("#000");
    p.point(at(p, 20 + offset, 20 + offset), 0.001, "#f00", 0.4);
    assert.equal(frame.color.filter(c => (c & 255) > 0).length, 1);
    assert.equal(frame.color[20 * frame.w + 20] & 255, 102);
  }
  p.begin("#000");
  p.point(at(p, 20, 20), 0, "#fff");
  p.line(at(p, 10, 10), at(p, 50, 50), 0, "#fff");
  assert.ok(frame.color.every(c => c === color3D("#000")));
});

test("packed source alpha and repeated equal-depth coverage compose correctly", () => {
  const { frame, p } = scene();
  const pos = at(p, 20.5, 20.5, 0.1), i = 20 * frame.w + 20;
  p.point(pos, 0.001, 0x800000ff, 0.5);
  assert.equal(frame.color[i] & 255, 64);
  p.point(pos, 0.001, "#f00", 0.5);
  assert.equal(frame.color[i] & 255, 160, "Float32 depth rounding must not reject the same surface");
});

test("perspective depth follows reciprocal projection scale in triangles and strokes", () => {
  const { frame, p } = scene({ projection: "perspective", perspective: 0.04 });
  const a = at(p, 8, 8, 0), b = at(p, 56, 8, 10), c = at(p, 8, 56, 5);
  p.triangle(a, b, c, "#fff");
  const x = 16, y = 20, v = (x + 0.5 - 8) / 48, t = (y + 0.5 - 8) / 48, u = 1 - v - t;
  const A = p.project(a), B = p.project(b), C = p.project(c);
  const expected = (v * B.scale * 10 + t * C.scale * 5) / (u * A.scale + v * B.scale + t * C.scale);
  assert.ok(Math.abs(frame.depth[y * frame.w + x] - expected) < 1e-6);

  p.begin("#000");
  const start = at(p, 8.5, 32.5, 0), end = at(p, 55.5, 32.5, 10);
  p.line(start, end, 0.02, "#fff");
  const f = (31.5 - 8.5) / 47, s0 = p.project(start).scale, s1 = p.project(end).scale;
  const lineDepth = 10 * f * s1 / ((1 - f) * s0 + f * s1);
  assert.ok(Math.abs(frame.depth[32 * frame.w + 31] - lineDepth) < 1e-6);
});

test("ring subdivision never accumulates extra opacity or emission at capsule joins", () => {
  const { frame, p } = scene({ elevation: Math.PI / 2 });
  p.ring(3, 0.16, "#f00", 0.5, 0.25, 0, 320);
  assert.ok(frame.color.filter(c => (c & 255) > 0).length > 40);
  assert.ok(frame.color.every(c => (c & 255) <= 128));
  assert.ok(frame.light.every(c => (c & 255) <= 31));
  const first = frame.color.slice();
  p.begin("#000");
  p.ring(3, 0.16, "#f00", 0.5, 0.25, 0, 320);
  assert.deepEqual(frame.color, first, "reused coverage buffers clear completely");
});

test("an infinitesimal lens warp keeps the nearest pixel instead of shifting half a cell", () => {
  const { frame, p } = scene();
  for (let i = 0; i < frame.color.length; i++) frame.color[i] = i + 1;
  const before = frame.color.slice();
  p.lensWarp([0, 0, 0], 0.5, 5, 1e-9);
  assert.deepEqual(frame.color, before);
});
