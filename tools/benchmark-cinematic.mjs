#!/usr/bin/env node
/** Build first. Compare a previous compiled compositor with the current shared finish.
 * node tools/benchmark-cinematic.mjs --baseline ../previous/build --out records/cinematic
 * Normal catalog settings are checked separately from deliberately boosted HDR stress cases.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createFrame, clearFrame, createFx, enableHDRLight, CinematicCompositor } from '../build/core/index.js';
import { createFrame3D, Painter3D, createFx3D, color3D, CinematicLighting3D } from '../build/3d/index.js';
import { canvas, save, writeVideo } from '../build-tools/tools/lib/fxlib.mjs';
const flags = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--baseline', '--out'].includes(process.argv[i]) || !process.argv[i + 1]) throw Error('Expected --baseline <compiled build directory> --out <directory>');
  flags[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!flags.baseline) throw Error('--baseline is required; preserve the previous compiled build before applying the patch.');
const { CinematicCompositor: PreviousCompositor } = await import(pathToFileURL(join(resolve(flags.baseline), 'render/cinematic.js')).href);
const before = new PreviousCompositor(), after = new CinematicCompositor();
const out = resolve(flags.out ?? 'records/cinematic'); mkdirSync(out, { recursive: true });
const grade = { bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 }, exposure: 1.25, saturation: 1.12, contrast: 1.05, vignette: 0.07, chromaticFringe: 0.5 };
const W = 192, H = 128, HEAD = 19, GAP = 4, bg = color3D('#0a1525');
const scenes = [
  ['3D FROST', '3d/effects/frost-nova', .59, { zoom: 1, y: .75 }],
  ['3D SLASH', '3d/effects/arc-slash', .18, { zoom: 1.1, y: 1.4 }],
  ['3D WIND', '3d/effects/wind-rasenshuriken', 3.06, { zoom: 1.18, y: 2.35, yaw: .32, elevation: .22 }],
  ['3D FLAME', '3d/effects/thermal-plume', 1.4, { zoom: 1.65, y: 1.95 }],
  ['3D LIGHTNING', '3d/effects/forked-lightning', .65, { zoom: 1.35, y: 2.6 }],
  ['2D RUNE', 'fx/arcane/rune-circle', 1.1],
  ['2D FIRE', 'fx/fire/convection-plume', 1.4],
  ['2D LIGHTNING', 'fx/lightning/lightning-strike', .79],
];
async function setup(def) {
  const [label, path, time, c] = def, mod = await import(new URL('../build/' + path + '.js', import.meta.url));
  const is3D = !!c, frame = enableHDRLight(is3D ? createFrame3D(W, H) : createFrame(...mod.meta.size));
  const painter = is3D ? new Painter3D(frame, { yaw: c.yaw ?? .68, elevation: c.elevation ?? .49, zoom: c.zoom, target: [0, c.y, 0] }) : undefined;
  const fx = is3D ? createFx3D(mod, { seed: 308 }) : createFx(mod, { x: mod.meta.origin[0], y: mod.meta.origin[1], seed: 308 });
  const draw = t => {
    if (is3D) { fx.seek(t); painter.begin('#0a1525'); fx.draw(painter); }
    else {
      // Fresh deterministic replay: pure and simulated effects share this capture contract.
      const fresh = createFx(mod, { x: mod.meta.origin[0], y: mod.meta.origin[1], seed: 308 });
      const steps = Math.ceil(t * 120); for (let i = 0; i < steps; i++) fresh.update(Math.min(1 / 120, t - i / 120));
      fresh.draw(clearFrame(frame));
    }
    return frame;
  };
  return { label, path, time, mod, frame, draw, is3D, painter };
}
const setups = await Promise.all(scenes.map(setup));
const rgba = (renderer, frame, options = {}) => renderer.render(frame, new Uint8ClampedArray(frame.w * frame.h * 4), { ...grade, background: bg, ...options });
const digest = array => createHash('sha256').update(array).digest('hex');
const diffPixels = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
const report = { configuration: { seed: 308, baselineBuild: resolve(flags.baseline), grade }, defaultCompatibility: [], legacyEmissionCompatibility: [], zeroStrength: [], highlightCalibration: [], stress: [] };
for (const s of setups) {
  const checks = [];
  for (const t of [0, s.time, s.mod.meta.duration * .55, s.mod.meta.duration * .9]) {
    const f = s.draw(t), a = rgba(before, f), b = rgba(after, f);
    const changedPixels = diffPixels(a, b); assert.equal(changedPixels, 0, `${s.label} default at ${t}`);
    checks.push({ time: t, changedPixels, sha256: digest(b) });
  }
  report.defaultCompatibility.push({ effect: s.path, samples: checks });
  const legacy = { ...s.draw(s.time), hdrLight: undefined }, strengths = [];
  for (const lightStrength of [0, .25, 1, 2]) {
    const a = rgba(before, legacy, { lightStrength }), b = rgba(after, legacy, { lightStrength });
    const changedPixels = diffPixels(a, b); assert.equal(changedPixels, 0, s.label + ' packed-only strength ' + lightStrength);
    strengths.push({ lightStrength, changedPixels });
  }
  report.legacyEmissionCompatibility.push({ effect: s.path, strengths });
  const f = s.draw(s.time), unlit = { ...f, light: new Uint32Array(f.light.length), hdrLight: undefined };
  const expected = rgba(after, unlit), a = rgba(before, f, { lightStrength: 0 }), b = rgba(after, f, { lightStrength: 0 });
  assert.equal(diffPixels(b, expected), 0, s.label + ' zero emission');
  report.zeroStrength.push({ effect: s.path, beforeResidualPixels: diffPixels(a, expected), afterResidualPixels: diffPixels(b, expected) });
}
const linear = b => { const x = b / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; };
const swatch = createFrame(1, 1);
for (const input of [[12, 3, .5], [.5, 12, 3], [3, .5, 12], [12, 12, 12]]) {
  const opts = { radiance: new Float32Array(input), background: color3D('#000'), bloom: false, exposure: 1, saturation: 1, contrast: 1, vignette: 0 };
  const a = rgba(before, swatch, opts), b = rgba(after, swatch, { ...opts, highlightColor: 1 });
  const error = output => { const v = Array.from(output.subarray(0, 3), linear), peak = Math.max(...v), expected = Math.max(...input); return v.reduce((sum, x, i) => sum + Math.abs(x / peak - input[i] / expected), 0); };
  report.highlightCalibration.push({ linearRGB: input, beforeRGBA: [...a], protectedRGBA: [...b], beforeRatioError: error(a), protectedRatioError: error(b) });
}
// Side-by-side ordinary catalog control test: both panes receive the exact same source frame.
// The label displays the requested lightStrength, not a change to effect time/shape.
const controlScenes = [setups[0], setups[5]], fps = 20, frames = 80;
const controls = { w: W * 2 + GAP, h: (H + HEAD) * 2 + GAP, fps, n: frames, frames: [] };
function pasteFit(c, image, frame, x, y) {
  // Center/crop only; no interpolation, geometry filtering or camera changes.
  const ox = Math.floor((W - frame.w) / 2), oy = Math.floor((H - frame.h) / 2);
  for (let sy = 0; sy < frame.h; sy++) for (let sx = 0; sx < frame.w; sx++) {
    const dx = sx + ox, dy = sy + oy; if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
    const source = (sy * frame.w + sx) * 4, dest = ((y + dy) * c.w + x + dx) * 4;
    c.data.set(image.subarray(source, source + 4), dest);
  }
}
for (let i = 0; i < frames; i++) {
  const strength = i < 20 ? 1 : i < 40 ? 1 - (i - 20) / 19 : i < 60 ? 0 : (i - 60) / 19;
  const c = canvas(controls.w, controls.h);
  controlScenes.forEach((s, row) => {
    const f = s.draw(s.time), y = row * (H + HEAD + GAP);
    const a = rgba(before, f, { lightStrength: strength }), b = rgba(after, f, { lightStrength: strength });
    c.text(`${s.label} BEFORE L=${strength.toFixed(2)}`, 4, y + 4, 1);
    c.text(`FIXED L=${strength.toFixed(2)}`, W + GAP + 4, y + 4, 1);
    pasteFit(c, a, f, 0, y + HEAD); pasteFit(c, b, f, W + GAP, y + HEAD);
  });
  controls.frames.push({ t: i / fps, color: c.data });
  if (i === 46) save(join(out, 'hdr-strength-zero.png'), c.png());
}
if (!writeVideo(join(out, 'hdr-strength-before-after.gif'), controls, 2)) throw Error('GIF encoder unavailable');
// Overexposure stress: amplify native HDR only. This is intentionally NOT a claim
// about default artwork quality. Original body, geometry, alpha and timing stay fixed.
const stressScenes = [setups[1], setups[5]], stress = { w: controls.w, h: controls.h, fps, n: 50, frames: [] };
for (let i = 0; i < stress.n; i++) {
  const c = canvas(stress.w, stress.h);
  stressScenes.forEach((s, row) => {
    const t = row === 0 ? .06 + i / 49 * .56 : i / fps;
    const f = s.draw(t), original = [f.color.slice(), f.light.slice(), f.hdrLight.slice()];
    const nativeHDRGain = 20;
    f.hdrLight.forEach((v, index, values) => { values[index] = v * nativeHDRGain; });
    const a = rgba(before, f), b = rgba(after, f, { highlightColor: .85 }), y = row * (H + HEAD + GAP);
    c.text(`${s.label} HDR X20 / BEFORE`, 4, y + 4, 1); c.text('PROTECT COLOR 0.85', W + GAP + 4, y + 4, 1);
    pasteFit(c, a, f, 0, y + HEAD); pasteFit(c, b, f, W + GAP, y + HEAD);
    assert.deepEqual(f.color, original[0]); assert.deepEqual(f.light, original[1]);
    let beforeWhite = 0, afterWhite = 0, changed = 0;
    for (let p = 0; p < a.length; p += 4) {
      if (Math.min(a[p], a[p + 1], a[p + 2]) >= 245) beforeWhite++;
      if (Math.min(b[p], b[p + 1], b[p + 2]) >= 245) afterWhite++;
      if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2]) changed++;
    }
    report.stress.push({ effect: s.path, time: t, nativeHDRGain, highlightColor: .85, beforeNearWhitePixels: beforeWhite, protectedNearWhitePixels: afterWhite, changedPixels: changed });
  });
  stress.frames.push({ t: i / fps, color: c.data });
  if (i === 12) save(join(out, 'hdr-color-stress.png'), c.png());
}
if (!writeVideo(join(out, 'hdr-color-before-after.gif'), stress, 2)) throw Error('GIF encoder unavailable');
// Same workload, warmed compositor. CPU numbers vary; this is not a cross-machine claim.
const f = setups[0].draw(.59), shade = new CinematicLighting3D().evaluate(f, setups[0].painter.camera,
 [{ position: [-2, 3, 2], radius: 7, color: '#88dfff', intensity: 2 }]);
const destination = new Uint8ClampedArray(f.w * f.h * 4);
const runs = [['before', before, {}], ['after-default', after, {}], ['after-protected', after, { highlightColor: .85 }]]
  .map(([label, compositor, opts]) => ({ label, compositor, args: { ...grade, ...opts, radiance: shade.radiance, occlusion: shade.occlusion }, samples: [] }));
for (let i = 0; i < 20; i++) for (const run of runs) run.compositor.render(f, destination, run.args);
// Rotate timing order to reduce warmup/CPU-frequency bias between modes.
for (let i = 0; i < 60; i++) for (let j = 0; j < runs.length; j++) {
  const run = runs[(i + j) % runs.length], start = performance.now();
  run.compositor.render(f, destination, run.args); run.samples.push(performance.now() - start);
}
report.performance = runs.map(({ label, samples }) => {
  samples.sort((a, b) => a - b);
  return { label, width: f.w, height: f.h, samples: samples.length, medianMs: (samples[29] + samples[30]) / 2, p95Ms: samples[56] };
});
writeFileSync(join(out, 'metrics.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out, defaultFramesVerified: report.defaultCompatibility.length * 4, packedOnlyFramesVerified: report.legacyEmissionCompatibility.length * 4, zeroStrength: report.zeroStrength, calibration: report.highlightCalibration, performance: report.performance }, null, 2));
