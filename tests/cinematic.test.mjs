import test from "node:test";
import assert from "node:assert/strict";
import { createFrame, CinematicCompositor } from "../build/index.js";
import {
  createFrame3D, Painter3D, CinematicLighting3D, color3D,
} from "../build/3d/index.js";

const pixel = (image, w, x, y) => Array.from(image.subarray((y * w + x) * 4, (y * w + x + 1) * 4));
const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];

test("film pass is opt-in and preserves original crisp opaque pixels", () => {
  const f = createFrame(12, 7);
  const red = color3D("#db6231");
  f.color[2 * f.w + 4] = red;
  const before = f.color.slice(), lights = f.light.slice();
  const film = new CinematicCompositor();
  const out = film.render(f, new Uint8ClampedArray(f.w * f.h * 4), {
    toneMap: "none", exposure: 1, contrast: 1, saturation: 1,
    vignette: 0, bloom: false, chromaticFringe: 0,
  });
  const actual = pixel(out, f.w, 4, 2);
  assert.ok(actual.slice(0, 3).every((v, i) => Math.abs(v - [219, 98, 49][i]) <= 1));
  assert.deepEqual(actual.slice(3), [255]);
  assert.deepEqual(pixel(out, f.w, 5, 2), [0, 0, 0, 0]);
  assert.deepEqual(f.color, before);
  assert.deepEqual(f.light, lights);
});

test("multiscale bloom spreads emission without blurring opaque silhouettes", () => {
  const f = createFrame(33, 33);
  const i = 16 * f.w + 16;
  f.color[i] = color3D("#210c06");
  f.light[i] = color3D("#ff8040");
  const base = f.color.slice(), emission = f.light.slice();
  const film = new CinematicCompositor();
  const args = {
    toneMap: "none", exposure: 1, contrast: 1, saturation: 1, vignette: 0,
    bloom: { threshold: 0.01, knee: 0.1, intensity: 2, levels: 4 },
  };
  const frame1 = film.render(f, new Uint8ClampedArray(33 * 33 * 4), args);
  const frame2 = film.render(f, new Uint8ClampedArray(33 * 33 * 4), args);
  assert.deepEqual(frame1, frame2, "postprocessing is deterministic");
  assert.ok(sum(pixel(frame1, 33, 18, 16)) > 0, "visible bloom reaches nearby transparent pixels");
  assert.ok(pixel(frame1, 33, 18, 16)[3] > 0, "transparent glow has alpha");
  assert.equal(pixel(frame1, 33, 16, 16)[3], 255, "original opaque pixel remains opaque");
  assert.deepEqual(f.color, base);
  assert.deepEqual(f.light, emission);
});

test("HDR radiance adds light without clipping intermediate buffers", () => {
  const f = createFrame(3, 3);
  f.color.fill(color3D("#202020"));
  const light = new Float32Array(3 * 3 * 3);
  light[(4 * 3)] = 5.8;
  light[(4 * 3) + 1] = 1.1;
  const film = new CinematicCompositor();
  const normal = film.render(f, new Uint8ClampedArray(36), { bloom: false });
  const hdr = film.render(f, new Uint8ClampedArray(36), {
    bloom: false, radiance: light, toneMap: "aces",
  });
  assert.ok(pixel(hdr, 3, 1, 1)[0] > pixel(normal, 3, 1, 1)[0]);
  assert.ok(pixel(hdr, 3, 1, 1)[0] >= pixel(hdr, 3, 1, 1)[1]);
  assert.ok(Array.from(hdr).every(Number.isFinite));
});

test("world point light illuminates depth-tested 3D surfaces, not empty backdrop", () => {
  const f = createFrame3D(80, 60);
  const camera = { yaw: 0.4, elevation: 0.55, zoom: 1, target: [0, 0, 0] };
  const p = new Painter3D(f, camera);
  p.begin("#08111a");
  p.sphere([0, 0, 0], 1.25, "#627088", "#8da6b9");
  const lights = new CinematicLighting3D();
  const rig = [{ position: [1.4, 2, 2], radius: 5, color: "#8ee3ff", intensity: 3, specular: 0.7 }];
  const a = lights.evaluate(f, camera, rig, { ambientOcclusion: false });
  const first = a.radiance.slice();
  const b = lights.evaluate(f, camera, rig, { ambientOcclusion: false });
  assert.strictEqual(a.radiance, b.radiance, "no new HDR allocation between frames");
  assert.deepEqual(b.radiance, first);
  assert.ok(b.radiance.some(v => v > 0.03), "lighting contributes HDR illumination");
  assert.deepEqual(Array.from(b.radiance.slice(0, 3)), [0, 0, 0], "empty backdrop is unlit");
});

test("3D occlusion is finite and untouched source depth is preserved", () => {
  const f = createFrame3D(60, 50);
  const camera = { yaw: 0, elevation: 0.45, zoom: 1 };
  const p = new Painter3D(f, camera);
  p.begin();
  p.point([0, 0, 0], 1.2, "#aaccff");
  p.point([0, 0, 1], 0.3, "#334466");
  const before = f.depth.slice();
  const pass = new CinematicLighting3D();
  const result = pass.evaluate(f, camera, [], {
    ambientOcclusion: { radius: 2, intensity: 0.8 },
  });
  assert.ok(result.occlusion.every(v => Number.isFinite(v) && v >= 0.2 && v <= 1));
  assert.ok(result.occlusion.some(v => v < 1), "overlapping depth is darkened locally");
  assert.deepEqual(f.depth, before);
});

test("film effect remains identical for a 3D frame with the same lighting", () => {
  const f = createFrame3D(28, 20), p = new Painter3D(f);
  p.begin("#112033");
  p.glow([0, 0, 0], 3, "#ffbb77", 1.4);
  const film = new CinematicCompositor();
  const options = { bloom: { threshold: 0.08, intensity: 1.2, levels: 3 } };
  const a = film.render(f, new Uint8ClampedArray(f.w * f.h * 4), options);
  const b = new CinematicCompositor().render(f, new Uint8ClampedArray(f.w * f.h * 4), options);
  assert.deepEqual(a, b);
  assert.ok(a.some((v, i) => i % 4 === 0 && v > 80));
});

test("invalid HDR/occlusion output sizes fail before rendering", () => {
  const frame = createFrame(4, 4), film = new CinematicCompositor();
  assert.throws(() => film.render(frame, new Uint8ClampedArray(10)), RangeError);
  assert.throws(() => film.render(frame, new Uint8ClampedArray(64), { radiance: new Float32Array(2) }), RangeError);
  assert.throws(() => film.render(frame, new Uint8ClampedArray(64), { occlusion: new Float32Array(2) }), RangeError);
});
