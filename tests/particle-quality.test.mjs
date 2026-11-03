import test from "node:test";
import assert from "node:assert/strict";
import { fly, flyV, integrateMotion2D, Particles as SimpleParticles } from "../build/core/particles.js";
import { Particles, Bits, P, PF, B, band } from "../build/core/sim.js";
import { Particles3D } from "../build/3d/particles.js";
import { createFrame } from "../build/core/fx.js";
import { Painter } from "../build/core/painter.js";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const compareMotion = (a, b, keys = ["x", "y", "vx", "vy"]) => {
  for (const key of keys) close(a[key], b[key]);
};

test("analytic trajectories stay continuous as drag approaches zero", () => {
  const ballistic = fly(4, -9, 23, -16, 0.7, 950, 0);
  const velocity = flyV(23, -16, 0.7, 950, 0);
  for (const drag of [1e-16, 1e-12, 1e-9]) {
    fly(4, -9, 23, -16, 0.7, 950, drag).forEach((v, i) => close(v, ballistic[i], 1e-6));
    flyV(23, -16, 0.7, 950, drag).forEach((v, i) => close(v, velocity[i], 1e-6));
  }
});

test("exact drag integration composes across timestep partitions and does not reverse velocity", () => {
  const a = { x: 4, y: -9, vx: 23, vy: -16 }, b = { ...a };
  integrateMotion2D(a, 0.7, 17, 950, 1.3, 2.2);
  for (let i = 0; i < 84; i++) integrateMotion2D(b, 1 / 120, 17, 950, 1.3, 2.2);
  compareMotion(a, b);
  const fastDrag = { x: 0, y: 0, vx: 100, vy: 0 };
  integrateMotion2D(fastDrag, 0.5, 0, 0, 80);
  assert.ok(fastDrag.vx >= 0 && fastDrag.x > 0 && fastDrag.x <= 1.25);
});

test("simple particle removal preserves survivor identity and analytic motion", () => {
  const ps = new SimpleParticles();
  const input = { x: 0, y: -100, vx: 30, vy: -5, life: 2, g: 80, drag: 2 };
  const first = ps.add({ ...input }), expired = ps.add({ ...input, life: 0.01 });
  const last = ps.add({ ...input, life: 3 });
  ps.update(0.1);
  assert.deepEqual(ps.list, [first, last]);
  assert.ok(!ps.list.includes(expired));
  const expected = fly(0, -100, 30, -5, 0.1, 80, 2);
  close(first.x, expected[0]); close(first.y, expected[1]);
});

test("delayed 2D particles receive exactly the time after birth", () => {
  const make = () => {
    const ps = new Particles({ seed: 5 });
    ps.spawn(P.MOTE, 0, -20, 80, -10, 2, "#fff", 1, 0.075);
    return ps;
  };
  const a = make(), b = make();
  a.update(0.1);
  for (let i = 0; i < 12; i++) b.update(1 / 120);
  close(a.list[0].life, 1.975);
  close(a.list[0].delay, 0);
  compareMotion(a.list[0], b.list[0]);
  close(a.list[0].life, b.list[0].life);
});

test("catalog sparks and rigid debris retain their trajectories across frame partitions", () => {
  const a = new Particles(), b = new Particles();
  for (const ps of [a, b]) ps.spawn(P.SPARK, 0, -100, 90, -120, 2);
  a.update(0.5);
  for (let i = 0; i < 60; i++) b.update(1 / 120);
  compareMotion(a.list[0], b.list[0]);
  const c = new Bits(), d = new Bits();
  for (const bits of [c, d]) bits.add({ kind: B.SHARD, x: 0, y: -200, vx: 30, vy: -60, life: 2, g: 0.4, drag: 2 });
  c.update(0.5);
  for (let i = 0; i < 60; i++) d.update(1 / 120);
  compareMotion(c.list[0], d.list[0]);
});

test("catalog compaction preserves reverse spawn order and leaves newborn smoke unadvanced", () => {
  const ps = new Particles({ seed: 11 });
  ps.spawn(P.MOTE, 1, 0, 0, 0, 1);
  ps.spawn(P.FIRE, 2, 0, 0, 0, 0.01, 0, 1, 0, PF.SMOKES);
  ps.spawn(P.MOTE, 3, 0, 0, 0, 1);
  ps.spawn(P.FIRE, 4, 0, 0, 0, 0.01, 0, 1, 0, PF.SMOKES);
  const survivors = [ps.list[0], ps.list[2]];
  ps.update(0.02);
  assert.deepEqual(ps.list.slice(0, 2), survivors);
  assert.deepEqual(ps.list.slice(2).map(p => [p.k, p.x]), [[P.SMOKE, 4], [P.SMOKE, 2]]);
  for (const child of ps.list.slice(2)) assert.equal(child.life, child.max);
});

function spark3D(overrides = {}) {
  return { position: [0, 2, 0], velocity: [3, 4, -2], life: 2, radius: 0.05,
    color: "#fff", gravity: 9.81, drag: 0.7, style: "spark", ...overrides };
}

test("3D particles analytically integrate drag and gravity without timestep drift", () => {
  const a = new Particles3D(-100), b = new Particles3D(-100);
  a.spawn(spark3D()); b.spawn(spark3D());
  a.update(0.5);
  for (let i = 0; i < 60; i++) b.update(1 / 120);
  compareMotion(a.list[0], b.list[0], ["x", "y", "z", "vx", "vy", "vz"]);
  const expected = fly(0, 2, 3, 4, 0.5, -9.81, 0.7);
  close(a.list[0].x, expected[0]); close(a.list[0].y, expected[1]);
});

test("3D spark trails start at birth and stop at a bounce instead of crossing the floor", () => {
  const ps = new Particles3D(0);
  ps.spawn(spark3D());
  let line;
  const painter = { project(at) { return { depth: at[2] }; }, line(...args) { line = args; } };
  const before = JSON.stringify(ps.list);
  ps.draw(painter);
  assert.deepEqual(line[0], line[1], "newborn has no pre-birth tail");
  assert.equal(JSON.stringify(ps.list), before, "drawing does not mutate particle state");
  ps.update(0.01); ps.draw(painter);
  line[1].forEach((v, i) => close(v, [0, 2, 0][i]));
  ps.clear();
  ps.spawn(spark3D({ position: [0, 0.01, 0], velocity: [2, -10, 0], bounce: 0.5 }));
  ps.update(0.01); ps.draw(painter);
  assert.equal(line[0][1], 0);
  assert.deepEqual(line[0], line[1], "bounce resets the trail instead of rewinding below ground");
  ps.update(0.01); ps.draw(painter);
  close(line[1][1], 0);
  assert.ok(line[0][1] > 0);
});


test("translucent 3D particle submission is far-to-near while simulation order remains unchanged", () => {
  const ps = new Particles3D(-100);
  for (const z of [3, -2, 1, -2]) ps.spawn(spark3D({ position: [0, 2, z], velocity: [0, 0, 0], style: "point" }));
  const original = ps.list.slice(), state = JSON.stringify(ps.list), rendered = [];
  const painter = { project(at) { return { depth: at[2] }; }, point(at) { rendered.push(at[2]); } };
  ps.draw(painter);
  assert.deepEqual(rendered, [-2, -2, 1, 3]);
  assert.deepEqual(ps.list, original);
  assert.equal(JSON.stringify(ps.list), state);
  rendered.length = 0;
  // A camera reversal must change submission order without advancing or rebuilding the simulation.
  painter.project = at => ({ depth: -at[2] });
  ps.draw(painter);
  assert.deepEqual(rendered, [3, 1, -2, -2]);
  assert.deepEqual(ps.list, original);
});

const BAND_RAMP = ["#204060", "#4080a0", "#80c0e0", "#e0ffff"];
function renderBand(keep = () => true, angle = 0) {
  const frame = createFrame(112, 80), painter = new Painter(frame);
  painter.place(56, 40, false, angle);
  band(painter, 0, 0, 32, 0.16, 1, 0.35, BAND_RAMP, keep);
  return frame;
}

test("inverse-raster bands write each cell once and preserve far/near partitioning", () => {
  const frame = createFrame(112, 80), painter = new Painter(frame), hits = new Uint8Array(frame.color.length);
  painter.place(56, 40);
  const put = painter.put.bind(painter);
  painter.put = (x, y, ...rest) => { hits[y * frame.w + x]++; put(x, y, ...rest); };
  band(painter, 0, 0, 32, 0.16, 1, 0.35, BAND_RAMP);
  assert.ok(hits.some(n => n === 1));
  assert.ok(hits.every(n => n <= 1), "a single band never accumulates its own opacity");
  assert.ok(frame.color.every(c => (c >>> 24) <= 108), "opacity is bounded by the authored 0.35 * 1.2");
  const parts = createFrame(112, 80), split = new Painter(parts);
  split.place(56, 40);
  band(split, 0, 0, 32, 0.16, 1, 0.35, BAND_RAMP, angle => Math.sin(angle) < 0);
  band(split, 0, 0, 32, 0.16, 1, 0.35, BAND_RAMP, angle => Math.sin(angle) >= 0);
  assert.deepEqual(parts.color, frame.color);
});

test("thin elliptical bands stay pixel-connected under arbitrary effect rotation", () => {
  for (const angle of [0, 0.37, 1.11]) {
    const frame = renderBand(() => true, angle), cells = new Set();
    frame.color.forEach((color, i) => { if (color >>> 24) cells.add(i); });
    assert.ok(cells.size > 90, "the thin ring remains visible");
    const stack = [cells.values().next().value];
    cells.delete(stack[0]);
    while (stack.length) {
      const i = stack.pop(), x = i % frame.w, y = Math.floor(i / frame.w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= frame.w || yy < 0 || yy >= frame.h) continue;
        const next = yy * frame.w + xx;
        if (cells.delete(next)) stack.push(next);
      }
    }
    assert.equal(cells.size, 0, "all ring cells form one connected stroke");
  }
});
