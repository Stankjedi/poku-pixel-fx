/** Cross-runtime golden comparison: TS CPU DrawIR + cinematic versus actual native wgpu/WGSL. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { renderDrawSceneCPU } from '../build/render/draw-ir.js';
import { CinematicCompositor } from '../build/render/cinematic.js';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { drawTileFixtures } from '../tests/fixtures/draw-tiles.mjs';
const binary = resolve(process.env.GPU_NATIVE_BINARY ?? 'native/target/debug/poku-player');
const directory = await mkdtemp(join(tmpdir(), 'poku-native-qa-')), checks = [];
const run = args => execFileSync(binary, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
const compositor = new CinematicCompositor(); let adapter, capturedNativeFrames = 0;
const difference = (a, b) => { if (a.length !== b.length) throw new Error('Native image dimensions differ from reference'); let maxDelta = 0, differentChannels = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); maxDelta = Math.max(maxDelta, d); if (d) differentChannels++; } return { maxDelta, differentChannels, channels: a.length }; };
async function checkScene(name, scene, options = {}) {
  const path = join(directory, name); await mkdir(path); await writeFile(join(path, 'scene.json'), JSON.stringify(scene)); await writeFile(join(path, 'options.json'), JSON.stringify(options));
  run([join(path, 'scene.json'), '--options', join(path, 'options.json'), '--out', path, '--frames', '2']);
  capturedNativeFrames += 2;
  const native = decodePNG(await readFile(join(path, 'frame-00000.png'))), frame = renderDrawSceneCPU(scene), expected = compositor.render(frame, new Uint8ClampedArray(scene.width * scene.height * 4), options);
  const d = difference(expected, native.rgba); if (d.maxDelta > 2) throw new Error(`${name}: CPU/native delta exceeds 2: ${JSON.stringify(d)}`);
  const replay = decodePNG(await readFile(join(path, 'frame-00001.png'))); if (difference(native.rgba, replay.rgba).maxDelta !== 0) throw new Error(`${name}: same-device replay differs`);
  const playback = JSON.parse(await readFile(join(path, 'playback.json'), 'utf8')); adapter = { info: playback.adapter, software: playback.software }; checks.push({ name, ...d, firstUploadBytes: playback.frames[0].uploadBytes, secondUploadBytes: playback.frames[1].uploadBytes });
}
let report;
try {
  const scene = JSON.parse(await readFile('native/examples/draw-scene.json', 'utf8'));
  await checkScene('mixed-default', scene);
  await checkScene('mixed-reinhard-hdr-background', scene, { background: 0xff1a0903, toneMap: 'reinhard', highlightColor: .8, bloom: { levels: 6, threshold: .12, knee: 0 }, chromaticFringe: 1.3 });
  await checkScene('mixed-ungraded', scene, { bloom: false, toneMap: 'none', exposure: 1, contrast: 1, saturation: 1, vignette: 0 });
  await checkScene('mixed-final-palette', scene, { finalPalette: [0xff112233, 0xff778899, 0xffccddff], bloom: { levels: 3 }, exposure: 1.8 });
  const material = { color: 0xffffffff, opacity: .5, emission: [.7, .1, .3] };
  await checkScene('mesh-shared-edge', { schema: 'poku-draw/v1', width: 5, height: 5, commands: [{ op: 'mesh', vertices: [[0, 0, 0], [5, 0, 0], [5, 5, 0], [0, 5, 0]], indices: [0, 1, 2, 0, 2, 3], material }] });
  const rect = (depth, color, opacity, emission, blend = 'alpha') => ({ op: 'rect', origin: [0, 0, depth], size: [3, 3], material: { color, opacity, emission, blend } });
  const layers = [rect(0, 0xff0000ff, 1, [3, 0, 0], 'opaque'), rect(1, 0xff00ff00, .25, [0, 1, 0]), rect(2, 0xffff0000, .5, [0, 0, .3])];
  for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) await checkScene(`depth-order-${order.join('')}`, { schema: 'poku-draw/v1', width: 3, height: 3, commands: order.map(i => layers[i]) });
  await checkScene('one-pixel-bloom', { schema: 'poku-draw/v1', width: 1, height: 1, commands: [rect(0, 0xff887766, 1, [0, 0, 12])] }, { bloom: { levels: 6 }, highlightColor: 1 });

  for (const { name, scene: tileScene } of drawTileFixtures()) {
    await checkScene(`tiled-${name}`, tileScene, { drawCulling: 'tiled', bloom: false });
  }

  const assetDir = join(directory, 'asset'); await mkdir(assetDir);
  const color = new Uint32Array([0xff0000ff, 0, 0xff00ff00, 0x80ff0000, 0xffffffff, 0xff0000ff, 0xff00ff00, 0xffff0000]);
  const bytes = new Uint8Array(color.length * 4); color.forEach((c, i) => bytes.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24], i * 4));
  const hdr = new Float32Array(24); hdr[0] = 2; hdr[7] = 1.5; const emissionBytes = Buffer.alloc(hdr.byteLength); hdr.forEach((v, i) => emissionBytes.writeFloatLE(v, i * 4));
  const files = [{ path: 'fixture.png', data: encodePNG(4, 2, bytes) }, { path: 'fixture.f32', data: emissionBytes }];
  for (const f of files) await writeFile(join(assetDir, f.path), f.data);
  const frames = [0, 1].map((i) => ({ page: 0, rect: { x: i * 2, y: 0, w: 2, h: 2 }, sourceSize: [4, 4], trimOffset: [1, 1], pivot: [2, 3], duration: i ? 120 : 40, time: i ? 0 : -.04, sockets: { hand: { x: 3, y: 2 - i } } }));
  const manifest = { schema: 'poku-asset/v1', id: 'fixture', name: 'fixture', loop: true, durationMs: 160, frames, pages: [{ image: 'fixture.png', width: 4, height: 2, emission: { image: 'fixture.f32', format: 'float32-le', channels: 3, colorSpace: 'linear-srgb' } }], events: [{ name: 'hit', timeMs: 40, sourceTime: 0 }], files: files.map(f => ({ path: f.path, bytes: f.data.length, sha256: createHash('sha256').update(f.data).digest('hex') })) };
  // This raw fixture intentionally uses CinematicCompositor defaults; do not infer a 2D preview policy.
  manifest.settings = { renderMode: 'cinematic', renderProfile: { cinematic: { bloom: { threshold: .16, knee: .18, intensity: .9, levels: 4 }, toneMap: 'aces', exposure: 1.15 } } };
  await writeFile(join(assetDir, 'asset.json'), JSON.stringify(manifest)); run([join(assetDir, 'asset.json'), '--out', assetDir, '--frames', '8', '--fps', '25', '--socket', 'hand']);
  capturedNativeFrames += 8;
  const playback = JSON.parse(await readFile(join(assetDir, 'playback.json'), 'utf8')); const expectedIndices = [0, 1, 1, 1, 0, 1, 1, 1];
  if (playback.frames.map(f => f.frame).join() !== expectedIndices.join()) throw new Error('Native player variable-duration/loop timing mismatch');
  for (let tick = 0; tick < 8; tick++) {
    const index = expectedIndices[tick], frame = frames[index];
    const referenceScene = { schema: 'poku-draw/v1', width: 4, height: 4, assets: [{ id: 'page-0', revision: 1, width: 4, height: 2, color, emission: hdr }], commands: [{ op: 'sprite', asset: 'page-0', origin: [1, 1, 0], region: frame.rect, material: { color: 0xffffffff } }] };
    const expected = compositor.render(renderDrawSceneCPU(referenceScene), new Uint8ClampedArray(64)); const actual = decodePNG(await readFile(join(assetDir, `frame-${String(tick).padStart(5, '0')}.png`))).rgba;
    const d = difference(expected, actual); if (d.maxDelta > 2 || playback.frames[tick].socket.x !== 3 || playback.frames[tick].socket.y !== 2 - index) throw new Error(`Native asset frame/socket mismatch at ${tick}`); checks.push({ name: `asset-frame-${tick}`, ...d });
  }
  if (playback.frames.flatMap(f => f.events).length !== 2) throw new Error('Native hit event should fire once in each of two loops');
  const sourcePalette = [0xff112233, 0xffccddff]; manifest.settings = { project: { renderProfile: { mode: 'cinematic', cinematic: { exposure: 1.7 } }, pixelStyle: { finalColorPolicy: 'palette-locked', palette: sourcePalette } } };
  await writeFile(join(assetDir, 'asset.json'), JSON.stringify(manifest)); await writeFile(join(assetDir, 'options.json'), JSON.stringify({ exposure: 2, finalPalette: [0xff000000] }));
  run([join(assetDir, 'asset.json'), '--out', assetDir, '--options', join(assetDir, 'options.json'), '--frames', '1']);
  capturedNativeFrames++;
  const paletteScene = { schema: 'poku-draw/v1', width: 4, height: 4, assets: [{ id: 'page-0', revision: 1, width: 4, height: 2, color, emission: hdr }], commands: [{ op: 'sprite', asset: 'page-0', origin: [1, 1, 0], region: frames[0].rect, material: { color: 0xffffffff } }] };
  const paletteExpected = compositor.render(renderDrawSceneCPU(paletteScene), new Uint8ClampedArray(64), { bloom: { threshold: .12, knee: .2, intensity: .7, levels: 3 }, toneMap: 'aces', exposure: 2, finalPalette: sourcePalette });
  const paletteActual = decodePNG(await readFile(join(assetDir, 'frame-00000.png'))).rgba, delta = difference(paletteExpected, paletteActual);
  if (delta.maxDelta > 2) throw new Error('Manifest palette lock or cinematic defaults were not respected');
  checks.push({ name: 'asset-declared-palette-policy', ...delta });
  const sourceRadiance = new Float32Array([.2, .1, .7, 1.2, .6, .1, .7, 0, .2, .1, .3, .5, .3, .1, .2, .9, .1, .2, .2, .4, .7, .3, 1.1, .6]);
  const sourceAO = new Float32Array([.1, .2, .4, .3, .6, .7, .9, 1]);
  const floatBytes = a => { const b = Buffer.alloc(a.byteLength); a.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  for (const [path, a] of [['radiance.f32', sourceRadiance], ['occlusion.f32', sourceAO]]) {
    const data = floatBytes(a); await writeFile(join(assetDir, path), data);
    manifest.files.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  manifest.pages[0].radiance = { image: 'radiance.f32', format: 'float32-le', channels: 3, colorSpace: 'linear-srgb' };
  manifest.pages[0].occlusion = { image: 'occlusion.f32', format: 'float32-le', channels: 1, colorSpace: 'linear' };
  const litOptions = { bloom: { threshold: .12, knee: .2, intensity: .7, levels: 3 }, toneMap: 'reinhard', exposure: 1.2, lightStrength: .35 };
  manifest.settings = { renderMode: 'cinematic', renderProfile: { cinematic: litOptions }, project: { kind: '3d' } };
  await writeFile(join(assetDir, 'asset.json'), JSON.stringify(manifest)); run([join(assetDir, 'asset.json'), '--out', assetDir, '--frames', '2', '--fps', '25']);
  capturedNativeFrames += 2;
  const restoredLighting = index => {
    const radiance = new Float32Array(48), occlusion = new Float32Array(16).fill(1);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const source = y * 4 + x + index * 2, target = (y + 1) * 4 + x + 1; radiance.set(sourceRadiance.subarray(source * 3, source * 3 + 3), target * 3); occlusion[target] = sourceAO[source]; }
    return { radiance, occlusion };
  };
  for (let index = 0; index < 2; index++) {
    const expectedScene = { ...paletteScene, commands: [{ ...paletteScene.commands[0], region: frames[index].rect }] };
    const expected = compositor.render(renderDrawSceneCPU(expectedScene), new Uint8ClampedArray(64), { ...litOptions, ...restoredLighting(index) });
    const actual = decodePNG(await readFile(join(assetDir, `frame-${String(index).padStart(5, '0')}.png`))).rgba, d = difference(expected, actual);
    if (d.maxDelta > 2) throw new Error(`Native radiance/occlusion sidecar mismatch at frame ${index}: ${JSON.stringify(d)}`);
    checks.push({ name: `asset-lighting-sidecars-${index}`, ...d });
  }
  manifest.settings.renderMode = 'linear-transparent'; delete manifest.settings.project;
  await writeFile(join(assetDir, 'asset.json'), JSON.stringify(manifest)); run([join(assetDir, 'asset.json'), '--out', assetDir, '--frames', '1']); capturedNativeFrames++;
  const linearExpected = compositor.render(renderDrawSceneCPU(paletteScene), new Uint8ClampedArray(64), { bloom: false, toneMap: 'none', exposure: 1, contrast: 1, saturation: 1, vignette: 0, chromaticFringe: 0, ...restoredLighting(0) });
  const linearActual = decodePNG(await readFile(join(assetDir, 'frame-00000.png'))).rgba, linearDelta = difference(linearExpected, linearActual);
  if (linearDelta.maxDelta > 2) throw new Error('Direct 3D linear-transparent profile was not respected');
  checks.push({ name: 'asset-linear-transparent-profile', ...linearDelta });
  // Production scene -> real paged export -> native playback, including moving camera pivots.
  const { scene3D } = await import('../build-tools/tools/lib/scene3d.mjs');
  const { createAssetBundle } = await import('../build-tools/tools/lib/asset-bundle.mjs');
  const frost = await scene3D('frost', { width: '64', height: '48', frames: '4', fps: '4', cinematic: 'true', background: 'none', grid: 'true', 'camera-motion': 'true' }, 'atlas');
  const frostFrames = [...frost.sequence.frames], frostDir = join(directory, 'frost'); await mkdir(frostDir);
  const sink = createAssetBundle(join(frostDir, 'frost'), frost.effect, frost.sequence, { maxTextureSize: 128, trim: true, deduplicate: true });
  try { frostFrames.forEach((frame, i) => sink.push(frame, i)); sink.finish(); } finally { sink.abort(); }
  if (!frostFrames.some(frame => frame.layers.radiance.some(value => value > 0))) throw new Error('3D fixture must exercise external radiance');
  run([join(frostDir, 'frost.asset.json'), '--out', frostDir, '--frames', '4', '--fps', '4']); capturedNativeFrames += 4;
  for (let i = 0; i < 4; i++) {
    const actual = decodePNG(await readFile(join(frostDir, `frame-${String(i).padStart(5, '0')}.png`))).rgba, d = difference(frostFrames[i].clear, actual);
    if (d.maxDelta > 2) throw new Error(`Production frost export/native mismatch at ${i}: ${JSON.stringify(d)}`);
    checks.push({ name: `catalog-frost-lighting-${i}`, ...d });
  }
  report = { status: 'passed', adapter, checks, sceneCases: 9 + drawTileFixtures().length, catalogCases: 1, capturedNativeFrames, comparedChannels: checks.reduce((n, c) => n + c.channels, 0), tolerance: 'max 2 encoded channel values; same-device replay exact', scope: 'Actual native wgpu shared WGSL and production 3D export. Software adapter is reported; browser canvas and physical GPUs remain separate validation targets.' };
} catch (error) { report = { status: error.code === 'ENOENT' ? 'unavailable' : 'failed', reason: String(error), checks, adapter }; }
finally { await rm(directory, { recursive: true, force: true }); }
console.log(JSON.stringify(report, null, 2)); if (process.env.GPU_NATIVE_REPORT_PATH) await writeFile(process.env.GPU_NATIVE_REPORT_PATH, JSON.stringify(report, null, 2));
if (report.status === 'failed' || process.env.GPU_NATIVE_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
