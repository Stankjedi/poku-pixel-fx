import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrame3D, compositeFrame3D, color3D, Painter3D, createFx3D, Rng3D,
  frostNova3D, arcSlash3D,
} from "../build/3d/index.js";

function render(effect, seconds = 0.8, seed = 42, size = [112, 80]) {
  const fx = createFx3D(effect, { seed });
  fx.seek(seconds);
  const frame = createFrame3D(...size);
  const p = new Painter3D(frame, { yaw: 0.7, elevation: 0.6, zoom: 1, target: [0, 0.7, 0] });
  p.begin("#0b1225"); fx.draw(p);
  return compositeFrame3D(frame, new Uint8ClampedArray(frame.w * frame.h * 4));
}
test("ABGR channels and independent emission buffers", () => {
  const f = createFrame3D(5, 5);
  const p = new Painter3D(f);
  p.begin("#112233");
  assert.equal(f.color[0], color3D("#112233"));
  p.point([0, 0, 0], 0.5, "#ff0000", 1, 0.5);
  assert.ok(f.light.some(c => (c & 255) > 0));
  assert.ok(f.depth.some(v => Number.isFinite(v)));
  const out = compositeFrame3D(f, new Uint8ClampedArray(100));
  assert.equal(out.length, 100);
});
test("seeded RNG is repeatable and isolated", () => {
  const a = new Rng3D(123), b = new Rng3D(123), c = new Rng3D(124);
  assert.deepEqual(Array.from({length: 12}, () => a.next()), Array.from({length: 12}, () => b.next()));
  assert.notEqual(new Rng3D(123).next(), c.next());
});
test("frost has deterministic frames, and seed influences the result", () => {
  const a = render(frostNova3D, 1.1, 7);
  assert.deepEqual(a, render(frostNova3D, 1.1, 7));
  assert.notDeepEqual(a, render(frostNova3D, 1.1, 8));
  assert.ok(a.some((v, i) => i % 4 === 0 && v > 85), "visible foreground pixels exist");
});
test("a 30 Hz update, 120 Hz update and seek agree exactly", () => {
  const a = createFx3D(frostNova3D, {seed: 9});
  const b = createFx3D(frostNova3D, {seed: 9});
  const c = createFx3D(frostNova3D, {seed: 9});
  for (let i = 0; i < 60; i++) a.update(1/30);
  for (let i = 0; i < 240; i++) b.update(1/120);
  c.seek(2);
  const snapshot = (fx) => {
    const frame = createFrame3D(96, 64), p = new Painter3D(frame);
    p.begin(); fx.draw(p);
    return frame.color;
  };
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.deepEqual(snapshot(b), snapshot(c));
});
test("cues fire only when passing through their timestamp; seek is silent", () => {
  const fx = createFx3D(arcSlash3D);
  fx.seek(0.4);
  assert.deepEqual(fx.drainCues(), []);
  fx.restart();
  fx.update(0.16);
  assert.deepEqual(fx.drainCues().map(c => c.type), ["hit", "shake"]);
  assert.deepEqual(fx.drainCues(), []);
});
test("depth test keeps the front pixel regardless of draw order", () => {
  const frame = createFrame3D(64, 64), p = new Painter3D(frame, {yaw:0,elevation:0,zoom:1});
  p.begin("#000000");
  const near = [0,0,1], far = [0,0,-1];
  p.point(near, 1, "#ff0000"); p.point(far, 1, "#0000ff");
  const c1 = frame.color.slice();
  p.begin("#000000");
  p.point(far, 1, "#0000ff"); p.point(near, 1, "#ff0000");
  assert.deepEqual(frame.color, c1);
});
test("arc slash has different time-dependent 3D ribbon frames", () => {
  const a = render(arcSlash3D, 0.19, 32);
  const b = render(arcSlash3D, 0.5, 32);
  assert.notDeepEqual(a, b);
});

test("orbit changes geometry projection without changing simulation", () => {
  const fx = createFx3D(arcSlash3D, {seed: 4});
  fx.seek(0.22);
  const pixelViews = [];
  for (const yaw of [0.25, 1.4]) {
    const frame = createFrame3D(100, 72), p = new Painter3D(frame, {yaw,elevation:.55,zoom:1});
    p.begin(); fx.draw(p); pixelViews.push([...frame.color]);
  }
  assert.notDeepEqual(pixelViews[0], pixelViews[1]);
});
