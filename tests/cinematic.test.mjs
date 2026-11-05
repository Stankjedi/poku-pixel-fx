import test from "node:test";
import assert from "node:assert/strict";
import { createFrame, clearFrame, painterFor, CinematicCompositor, enableHDRLight } from "../build/index.js";
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


test("existing 2D painter emission can accumulate above the 8-bit ceiling", () => {
  const frame = enableHDRLight(createFrame(9, 9));
  const p = painterFor(frame);
  p.add(4, 4, color3D("#ffffff"), 1.4);
  p.add(4, 4, color3D("#ffffff"), 1.4);
  const i = 4 * frame.w + 4;
  assert.equal(frame.light[i] & 255, 255, "legacy 8-bit mirror saturates as before");
  assert.ok(frame.hdrLight[i * 3] > 2.7, "HDR buffer retains energy beyond 1");
  const film = new CinematicCompositor();
  const hdr = film.render(frame, new Uint8ClampedArray(frame.w * frame.h * 4), {
    bloom: { threshold: 0.1, intensity: 1.5 }, exposure: 0.55,
  });
  const classic = film.render({ ...frame, hdrLight: undefined }, new Uint8ClampedArray(hdr.length), {
    bloom: { threshold: 0.1, intensity: 1.5 }, exposure: 0.55,
  });
  assert.ok(sum(pixel(hdr, 9, 4, 4)) >= sum(pixel(classic, 9, 4, 4)));
  clearFrame(frame);
  assert.ok(frame.hdrLight.every(v => v === 0), "HDR light is reset with the frame");
});

test("3D horizon occludes native HDR energy and begin resets the optional buffer", () => {
  const frame = enableHDRLight(createFrame3D(72, 54));
  const p = new Painter3D(frame);
  p.begin("#080b11");
  p.point([0, 0, 0], 0.8, "#c5d7ff", 1, 2.8);
  const center = p.project([0, 0, 0]), i = Math.floor(center.y) * frame.w + Math.floor(center.x);
  assert.ok(frame.hdrLight[i * 3] > 0);
  p.sphere([0, 0, 0], 1.2, "#050508");
  assert.equal(frame.hdrLight[i * 3], 0, "opaque sphere suppresses hidden radiance");
  p.begin();
  assert.ok(frame.hdrLight.every(v => v === 0));
});

const ungraded = { toneMap: "none", exposure: 1, contrast: 1, saturation: 1, vignette: 0, bloom: false, background: color3D("#000") };
const linear = byte => { const x = byte / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };

test("lightStrength dims native HDR and its packed mirror together in 2D and 3D", () => {
  for (const is3D of [false, true]) {
    const f = enableHDRLight(is3D ? createFrame3D(25, 25) : createFrame(25, 25));
    if (is3D) { const p = new Painter3D(f); p.begin("#000"); p.glow([0, 0, 0], 2, "#ff8050", 3); }
    else { painterFor(f).glow(12, 12, 7, color3D("#ff8050"), 3); }
    const before = [f.color.slice(), f.light.slice(), f.hdrLight.slice()];
    const film = new CinematicCompositor(), out = () => new Uint8ClampedArray(f.w * f.h * 4);
    const dark = film.render(f, out(), { ...ungraded, lightStrength: 0, bloom: { threshold: 0.01 } });
    assert.ok(dark.every((v, i) => i % 4 === 3 ? v === 255 : v === 0), "zero strength also removes indirect bloom");
    const full = film.render(f, out(), { ...ungraded, lightStrength: 0.15 });
    const half = film.render(f, out(), { ...ungraded, lightStrength: 0.075 });
    assert.ok(full.some((v, i) => i % 4 !== 3 && v > 30));
    full.forEach((v, i) => {
      if (i % 4 === 3 || v < 30) return;
      assert.ok(Math.abs(linear(half[i]) / linear(v) - 0.5) < 0.04, `linear dimming at ${i}`);
    });
    [f.color, f.light, f.hdrLight].forEach((b, i) => assert.deepEqual(b, before[i]));
  }
});

test("emission strength applies to authoritative HDR without changing independent world radiance", () => {
  const f = enableHDRLight(createFrame(2, 1));
  f.light[0] = color3D("#808080"); f.hdrLight.set([0.04, 0.4, 0.08]);
  // Packed-only light is supplied separately; frame.light is only a mirror when HDR exists.
  f.light[1] = color3D("#804020");
  const legacyLight = new Uint32Array([0, f.light[1]]);
  const extra = new Float32Array([0.15, 0.1, 0.05, 0.03, 0.02, 0.01]);
  const film = new CinematicCompositor();
  const actual = film.render(f, new Uint8ClampedArray(8), { ...ungraded, lightStrength: 0, radiance: extra });
  const expected = film.render(createFrame(2, 1), new Uint8ClampedArray(8), { ...ungraded, radiance: extra });
  assert.deepEqual(actual, expected, "world light is not an emission control");
  const scaled = film.render(f, new Uint8ClampedArray(8), { ...ungraded, lightStrength: 0.5, legacyLight });
  assert.ok(Math.abs(linear(scaled[0]) - 0.04 * 0.5) < 0.004);
  assert.ok(Math.abs(linear(scaled[1]) - 0.4 * 0.5) < 0.004);
  assert.ok(scaled[4] > scaled[5] && scaled[5] > scaled[6]);
});

test("highlightColor retains linear hue ratios in HDR highlights for ACES and Reinhard", () => {
  const f = createFrame(1, 1), film = new CinematicCompositor();
  for (const toneMap of ["aces", "reinhard"]) {
    const radiance = new Float32Array([12, 3, 0.5]);
    const old = film.render(f, new Uint8ClampedArray(4), { ...ungraded, toneMap, radiance });
    const kept = film.render(f, new Uint8ClampedArray(4), { ...ungraded, toneMap, radiance, highlightColor: 1 });
    const error = image => Math.abs(linear(image[1]) / linear(image[0]) - 0.25) + Math.abs(linear(image[2]) / linear(image[0]) - 1 / 24);
    assert.ok(error(kept) < 0.01, `linear RGB ratio stays within 8-bit quantization: ${error(kept)}`);
    assert.ok(error(kept) < error(old) * 0.03);
    assert.equal(kept[0], old[0], "the peak channel keeps the same brightness");
    assert.equal(kept[3], old[3]);
  }
});

test("highlightColor is opt-in, leaves midtones and neutral cores alone, and does not alter toneMap none", () => {
  const f = createFrame(3, 1), film = new CinematicCompositor();
  const radiance = new Float32Array([0.8, 0.3, 0.1, 12, 12, 12, 0.2, 0.5, 0.7]);
  for (const toneMap of ["aces", "reinhard", "none"]) {
    const args = { ...ungraded, toneMap, radiance };
    const original = film.render(f, new Uint8ClampedArray(12), args);
    assert.deepEqual(film.render(f, new Uint8ClampedArray(12), { ...args, highlightColor: 0 }), original);
    assert.deepEqual(film.render(f, new Uint8ClampedArray(12), { ...args, highlightColor: 1 }), original);
  }
});

test("highlightColor preserves source geometry and transparent bloom coverage while remaining deterministic", () => {
  const f = enableHDRLight(createFrame(33, 21)), p = painterFor(f), film = new CinematicCompositor();
  p.line(7, 6, 25, 14, color3D("#5080a0"));
  p.glow(16, 10, 8, color3D("#ff6040"), 18);
  const saved = [f.color.slice(), f.light.slice(), f.hdrLight.slice()];
  const opts = { highlightColor: 0.75, bloom: { threshold: 0.1, intensity: 1.1, levels: 3 } };
  const out = () => new Uint8ClampedArray(f.w * f.h * 4);
  const original = film.render(f, out(), { ...opts, highlightColor: 0 });
  const first = film.render(f, out(), opts), second = film.render(f, out(), opts);
  assert.deepEqual(first, second);
  for (let i = 3; i < first.length; i += 4) assert.equal(first[i], original[i], "alpha footprint is independent of highlight grading");
  [f.color, f.light, f.hdrLight].forEach((b, i) => assert.deepEqual(b, saved[i]));
  assert.ok(first.some((v, i) => i % 4 !== 3 && v !== original[i]));
});
