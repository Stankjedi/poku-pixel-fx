import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrame3D, Painter3D, createFx3D, color3D, enableHDRLight, importPackedLight,
  CinematicCompositor, windRasenshuriken3D, energyShield3D,
} from "../build/3d/index.js";

const camera = { yaw: 0, elevation: 0, zoom: 1 };
const scene = (w = 17, h = 11, view = camera) => {
  const frame = enableHDRLight(createFrame3D(w, h)), painter = new Painter3D(frame, view);
  painter.begin("#000"); return { frame, painter };
};
const center = 6 * 17 + 8;
const sample = (p, z, color, alpha = 1, emission = 0) => p.point([0, .21, z], .01, color, alpha, emission);
const snapshot = f => [f.color.slice(), f.light.slice(), f.hdrLight.slice(), f.depth.slice()];

test("opaque points and triangles hide rear surface emission in either submission order", () => {
  for (const shape of ["point", "triangle"]) {
    const draw = reverse => {
      const { frame, painter: p } = scene();
      const front = () => shape === "point" ? sample(p, 1, "#000") : p.triangle([-1, -1, 1], [1, -1, 1], [0, 2, 1], "#000");
      if (reverse) front(); sample(p, 0, "#f00", 1, 1); if (!reverse) front();
      assert.equal(frame.color[center], color3D("#000"));
      assert.equal(frame.light[center], 0); assert.deepEqual([...frame.hdrLight.subarray(center * 3, center * 3 + 3)], [0, 0, 0]);
      return snapshot(frame);
    };
    assert.deepEqual(draw(false), draw(true));
  }
});

test("all translucent submission permutations retain rear color and attenuate surface emission", () => {
  const layers = [[0, "#f00", 1, 1], [1, "#00f", .5, .2], [2, "#0f0", .25, 0]];
  let reference;
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    const { frame, painter: p } = scene();
    // Two painters sharing one frame also share its fragment queue.
    const q = new Painter3D(frame, camera);
    order.forEach((index, i) => sample(i & 1 ? q : p, ...layers[index]));
    const actual = snapshot(frame); if (reference) assert.deepEqual(actual, reference); else reference = actual;
    assert.ok(Math.abs(frame.hdrLight[center * 3] - .375) < 1e-6);
    assert.ok(Math.abs(frame.hdrLight[center * 3 + 2] - .075) < 1e-6);
    assert.equal(frame.depth[center], 2, "nearest visible depth remains available to lighting");
    assert.equal(p.opaqueDepthAt(8, 6), 0, "transparent layers do not write opaque depth");
    p.begin("#000");
    assert.ok(frame.light.every(x => x === 0)); assert.ok(frame.hdrLight.every(x => x === 0));
    sample(p, 0, "#f00", 1, 1);
    assert.equal(frame.hdrLight[center * 3], 1, "reused pools contain no stale attenuation");
  }
});

test("screen glow is explicit and independent from surface occlusion", () => {
  const render = reverse => {
    const { frame, painter: p } = scene();
    if (reverse) sample(p, 2, "#000");
    p.glow([0, .21, 0], 1, "#0f0", 1);
    sample(p, 0, "#f00", 1, 1);
    if (!reverse) sample(p, 2, "#000");
    assert.equal(frame.hdrLight[center * 3], 0);
    assert.ok(frame.hdrLight[center * 3 + 1] > 0);
    return snapshot(frame);
  };
  assert.deepEqual(render(false), render(true));
});

test("equal-depth sphere repaint uses Float32 depth and replaces every old pixel", () => {
  const { frame, painter: p } = scene(128, 96, { yaw: .68, elevation: Math.PI / 5.5, zoom: 1 });
  p.sphere([0, 1.7, 0], 1.2, "#f00");
  const count = frame.color.filter(c => c === color3D("#f00")).length;
  assert.ok(count > 100);
  p.sphere([0, 1.7, 0], 1.2, "#00f");
  assert.equal(frame.color.filter(c => c === color3D("#f00")).length, 0);
  assert.equal(frame.color.filter(c => c === color3D("#00f")).length, count);
});

test("actual wind fragments equal pixelwise sorted reference at representative orbit angles", () => {
  const fx = createFx3D(windRasenshuriken3D); fx.seek(1.5);
  for (const yaw of [.1, .68, 1.6]) {
    const view = { yaw, elevation: 28 * Math.PI / 180, zoom: 1.18, target: [0, 2.35, 0] };
    const actual = scene(128, 96, view), recorder = scene(128, 96, view), reference = scene(128, 96, view);
    const fragments = [];
    recorder.painter.put = (x, y, depth, color, alpha, emission) => {
      if (x >= 0 && x < 128 && y >= 0 && y < 96 && alpha > 0) fragments.push({ x, y, z: Math.fround(depth), color, alpha, emission });
    };
    fx.draw(recorder.painter); fx.draw(actual.painter);
    assert.ok(fragments.length > 2500);
    // Global depth sort is equivalent to sorting each pixel; equal-depth ties stay stable.
    fragments.sort((a, b) => a.z - b.z);
    for (const f of fragments) reference.painter.pixel(f.x, f.y, f.z, f.color, f.alpha, f.emission);
    assert.deepEqual(snapshot(actual.frame), snapshot(reference.frame), `yaw ${yaw}`);
  }
});

const ungraded = { toneMap: "none", exposure: 1, contrast: 1, saturation: 1, vignette: 0, bloom: false, background: color3D("#000") };
test("HDR accumulation remains authoritative after the packed mirror saturates", () => {
  const { frame, painter: p } = scene(1, 1), film = new CinematicCompositor();
  p.screenLight(0, 0, "#808080", 1); p.screenLight(0, 0, "#808080", 1);
  assert.equal(frame.light[0] & 255, 255);
  assert.ok(Math.abs(frame.hdrLight[0] - .431721) < 1e-6);
  const result = film.render(frame, new Uint8ClampedArray(4), ungraded);
  assert.deepEqual([...result], [176, 176, 176, 255]);
  const mirror = film.render({ ...frame, hdrLight: undefined }, new Uint8ClampedArray(4), ungraded);
  assert.deepEqual([...mirror], [255, 255, 255, 255], "legacy composition remains an explicit fallback");
});

test("packed-only writers use an explicit HDR bridge or a separate legacy light source", () => {
  const { frame } = scene(1, 1), film = new CinematicCompositor();
  frame.light[0] = color3D("#804020");
  assert.deepEqual([...film.render(frame, new Uint8ClampedArray(4), ungraded)], [0, 0, 0, 255]);
  const extra = film.render(frame, new Uint8ClampedArray(4), { ...ungraded, legacyLight: frame.light });
  importPackedLight(frame, frame.light, "replace");
  const imported = film.render(frame, new Uint8ClampedArray(4), ungraded);
  assert.deepEqual(imported, extra);
  assert.deepEqual([...imported], [128, 64, 32, 255]);
  assert.throws(() => importPackedLight(frame, new Uint32Array(2)), RangeError);
});

test("shield reuses shared vertex projections for triangles, edges and repeat frames", () => {
  const fx = createFx3D(energyShield3D); fx.seek(2);
  const { frame, painter: p } = scene(128, 96, { yaw: .68, elevation: 28 * Math.PI / 180, zoom: 1.45, target: [0, 2.1, 0] });
  let projects = 0;
  const project = p.project.bind(p); p.project = (...args) => { projects++; return project(...args); };
  fx.draw(p); const first = snapshot(frame), firstProjects = projects;
  assert.ok(projects < 4500, `shared projections should replace 18,836 baseline calls; got ${projects}`);
  p.begin("#000"); projects = 0; fx.draw(p);
  assert.equal(projects, firstProjects); assert.deepEqual(snapshot(frame), first);
});
