import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrame3D, compositeFrame3D, color3D, Painter3D, createFx3D, Rng3D,
  frostNova3D, arcSlash3D, blackHole3D,
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

// Cinematic black-hole regression checks: real geometry, seed and timeline stability.
test("cinematic black hole remains deterministic and seeded", () => {
  const a=render(blackHole3D,2.4,4318,[144,104]);
  assert.deepEqual(a,render(blackHole3D,2.4,4318,[144,104]));
  assert.notDeepEqual(a,render(blackHole3D,2.4,4319,[144,104]));
});
test("cinematic black hole evolves over time, then leaves no pixels after its duration", () => {
  assert.notDeepEqual(render(blackHole3D,1.7,3,[120,80]),render(blackHole3D,3.9,3,[120,80]));
  const fx=createFx3D(blackHole3D); fx.seek(7);
  const frame=createFrame3D(120,80),p=new Painter3D(frame);
  p.begin("#05030e"); const c=frame.color.slice();fx.draw(p);
  assert.deepEqual(frame.color,c);
  assert.equal(fx.done(),true);
});
test("cinematic black hole has a black core, photon emission and finite depth", () => {
  const frame=createFrame3D(200,144);
  const p=new Painter3D(frame,{yaw:.68,elevation:.49,zoom:1.3,target:[0,1.12,0]});
  const fx=createFx3D(blackHole3D);fx.seek(2.3);p.begin("#05030e");fx.draw(p);
  const c=p.project([0,2.1,0]),idx=Math.floor(c.y)*frame.w+Math.floor(c.x);
  const center=frame.color[idx];
  assert.ok((center&255)<30 && ((center>>>8)&255)<30, "core remains dark");
  assert.ok(frame.light.some(v => (v&255)>75), "bright emission ring exists");
  assert.ok(frame.depth.some(Number.isFinite), "solid 3D occlusion exists");
});
test("cinematic black hole changes shape from real 3D camera orbit", () => {
  const fx=createFx3D(blackHole3D); fx.seek(2.5);
  const frames=[0.12,1.32].map(yaw=>{
    const f=createFrame3D(120,90),p=new Painter3D(f,{yaw,elevation:.49,zoom:1.2,target:[0,1.12,0]});
    p.begin("#05030e");fx.draw(p);return [...f.color];
  });
  assert.notDeepEqual(frames[0],frames[1]);
});
