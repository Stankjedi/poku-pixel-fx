import test from "node:test";
import assert from "node:assert/strict";
import { createFrame3D, color3D, CinematicLighting3D, Painter3D } from "../build/3d/index.js";

const camera = { yaw: 0, elevation: 0, zoom: 1 };
const rig = [{ position: [-2, 3, 6], radius: 30, intensity: 3, color: "#fff", specular: 0.8, rim: 0.5 }];
const close = (actual, expected, message, tolerance = 2e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`);
function plane(w = 68, h = 44) {
  const frame = createFrame3D(w, h);
  frame.color.fill(color3D("#8090a0"));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) frame.depth[y * w + x] = (x - w / 2) * 0.17 + (y - h / 2) * 0.12;
  return frame;
}

test("sloped surface lighting survives missing forward neighbors and depth discontinuities", () => {
  for (const blocked of [-Infinity, 15]) {
    const frame = plane(), lighting = new CinematicLighting3D(), x = 29, y = 20, j = (y * frame.w + x) * 3;
    const reference = lighting.evaluate(frame, camera, rig, { ambientOcclusion: false }).radiance.slice(j, j + 3);
    // Both forward directions encounter a silhouette or unrelated foreground surface.
    frame.depth[y * frame.w + x + 1] = blocked;
    frame.depth[(y + 1) * frame.w + x] = blocked;
    const actual = lighting.evaluate(frame, camera, rig, { ambientOcclusion: false }).radiance;
    for (let c = 0; c < 3; c++) close(actual[j + c], reference[c], `stable edge channel ${c}`);
  }
});

test("nearest-depth derivatives ignore adjacent foreground within the edge threshold", () => {
  const frame = plane(), lighting = new CinematicLighting3D(), x = 29, y = 20, j = (y * frame.w + x) * 3;
  const reference = lighting.evaluate(frame, camera, rig, { ambientOcclusion: false }).radiance.slice(j, j + 3);
  frame.depth[y * frame.w + x + 1] += 0.2;
  frame.depth[(y + 1) * frame.w + x] += 0.2;
  const actual = lighting.evaluate(frame, camera, rig, { ambientOcclusion: false }).radiance;
  for (let c = 0; c < 3; c++) close(actual[j + c], reference[c], `near-edge channel ${c}`);
});

test("SSAO never self-shadows a continuous tilted plane, including frame boundaries", () => {
  const frame = plane();
  const result = new CinematicLighting3D().evaluate(frame, camera, [], { ambientOcclusion: { bias: 0, intensity: 1, radius: 3 } });
  assert.ok(result.occlusion.every(v => v === 1), "a plane is not its own occluder");
});

test("SSAO retains local contacts while rejecting distant overlapping geometry", () => {
  const frame = createFrame3D(68, 44), lighting = new CinematicLighting3D(), x = 34, y = 22, i = y * frame.w + x;
  frame.depth.fill(0); frame.color.fill(color3D("#888"));
  frame.depth[i + 3] = 0.8;
  const settings = { ambientOcclusion: { radius: 3, bias: 0.02, intensity: 1, range: 2 } };
  const nearby = lighting.evaluate(frame, camera, [], settings).occlusion[i];
  assert.ok(nearby < 1, `nearby raised geometry must occlude (${nearby})`);
  frame.depth[i + 3] = 20;
  assert.equal(lighting.evaluate(frame, camera, [], settings).occlusion[i], 1, "far geometry must not paint a contact shadow");
});

test("perspective highlights use the per-pixel eye ray rather than an orthographic view", () => {
  const frame = createFrame3D(136, 88), p = new Painter3D(frame, { ...camera, projection: "perspective", perspective: 0.1 });
  p.begin("#000"); frame.depth.fill(0);
  const lights = new CinematicLighting3D(), x = 110, y = 35, i = y * frame.w + x, scale = p.project([0, 0, 0]).scale;
  const px = (x + 0.5 - frame.w * 0.5) / scale, py = (frame.h * 0.61 - y - 0.5) / scale;
  const len = Math.hypot(px, py, 10), view = [-px / len, -py / len, 10 / len];
  // The mirror reflection of the eye ray around the flat +Z normal gives an exact highlight.
  const light = { position: [px - view[0] * 4, py - view[1] * 4, view[2] * 4], radius: 20, intensity: 1, color: "#fff", specular: 1, rim: 0 };
  const result = lights.evaluate(frame, p.camera, [light], { ambientOcclusion: false });
  const expected = (1 - 16 / 400) ** 2 / (1 + 16 * 0.06);
  close(result.radiance[i * 3], expected, "mirror-angle highlight", 1e-6);
});

test("lights behind a facet cannot produce front-side specular highlights", () => {
  const frame = createFrame3D(68, 44);
  frame.depth.fill(0); frame.color.fill(color3D("#000"));
  const lights = new CinematicLighting3D();
  const result = lights.evaluate(frame, camera, [{ position: [12, 0, -0.1], radius: 30, intensity: 20, color: "#fff", specular: 20, rim: 0 }], { ambientOcclusion: false });
  assert.ok(result.radiance.every(v => v === 0));
});

test("lighting leaves pixel art, depth and emissions untouched and resets reused buffers", () => {
  const frame = plane(), lighting = new CinematicLighting3D();
  frame.light[0] = color3D("#f24"); frame.hdrLight = new Float32Array(frame.w * frame.h * 3); frame.hdrLight[0] = 2;
  const snapshots = [frame.color.slice(), frame.light.slice(), frame.depth.slice(), frame.hdrLight.slice()];
  const result = lighting.evaluate(frame, camera, rig);
  const repeat = lighting.evaluate(frame, camera, rig);
  assert.strictEqual(result.radiance, repeat.radiance);
  assert.strictEqual(result.occlusion, repeat.occlusion);
  [frame.color, frame.light, frame.depth, frame.hdrLight].forEach((buffer, i) => assert.deepEqual(buffer, snapshots[i]));
  frame.depth.fill(-Infinity);
  const empty = lighting.evaluate(frame, camera, rig);
  assert.ok(empty.radiance.every(v => v === 0));
  assert.ok(empty.occlusion.every(v => v === 1));
  const resized = plane(1, 1);
  assert.ok(lighting.evaluate(resized, camera, rig).radiance.every(Number.isFinite));
});

test("perspective mirror highlights follow orbit and camera target translation", () => {
  const frame = createFrame3D(136, 88), c = { yaw: 0.8, elevation: 0.45, zoom: 1, target: [2, -1, 3], projection: "perspective", perspective: 0.1 };
  const p = new Painter3D(frame, c); p.begin("#000"); frame.depth.fill(0);
  const x = 110, y = 35, i = y * frame.w + x, scale = p.project(c.target).scale;
  const u = (x + 0.5 - frame.w * 0.5) / scale, up = (frame.h * 0.61 - y - 0.5) / scale;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), ce = Math.cos(c.elevation), se = Math.sin(c.elevation);
  const forward = [sy * ce, se, cy * ce];
  const pos = [c.target[0] + u * cy - up * se * sy, c.target[1] + up * ce, c.target[2] - u * sy - up * se * cy];
  const ray = pos.map((v, a) => forward[a] - (v - c.target[a]) * c.perspective), length = Math.hypot(...ray), view = ray.map(v => v / length);
  const facing = view.reduce((sum, v, a) => sum + v * forward[a], 0);
  const reflection = view.map((v, a) => 2 * facing * forward[a] - v);
  const light = { position: pos.map((v, a) => v + reflection[a] * 4), radius: 20, intensity: 1, color: "#fff", specular: 1, rim: 0 };
  const result = new CinematicLighting3D().evaluate(frame, c, [light], { ambientOcclusion: false });
  close(result.radiance[i * 3], (1 - 16 / 400) ** 2 / (1 + 16 * 0.06), "orbiting mirror highlight", 1e-5);
});

test("the painter's clamped perspective region retains parallel view rays", () => {
  const frame = createFrame3D(136, 88), c = { ...camera, projection: "perspective", perspective: 0.1 };
  const p = new Painter3D(frame, c); p.begin("#000"); frame.depth.fill(8);
  const x = 110, y = 35, i = y * frame.w + x, scale = p.project([0, 0, 8]).scale;
  const px = (x + 0.5 - frame.w * 0.5) / scale, py = (frame.h * 0.61 - y - 0.5) / scale;
  const light = { position: [px, py, 12], radius: 20, intensity: 1, color: "#fff", specular: 1, rim: 0 };
  const result = new CinematicLighting3D().evaluate(frame, c, [light], { ambientOcclusion: false });
  close(result.radiance[i * 3], (1 - 16 / 400) ** 2 / (1 + 16 * 0.06), "clamped parallel highlight", 1e-6);
});
