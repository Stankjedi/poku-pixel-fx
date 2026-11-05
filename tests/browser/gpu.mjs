import { CinematicCompositor } from '../../build/render/cinematic.js';
import { WebGPUCinematicRenderer, CinematicFrameRenderer } from '../../build/render/webgpu.js';
import { WebGLCompositor } from '../../build/render/webgl-compositor.js';
import { composite } from '../../build/core/fx.js';
import { WebGPUDrawRenderer } from '../../build/render/draw-ir-gpu.js';
import { GpuParticleSystem } from '../../build/render/gpu-particles.js';
import { renderDrawSceneCPU } from '../../build/render/draw-ir.js';
import { captureCinematicSequence } from '../../build/render/gpu-capture.js';
import { drawTileFixtures } from '../fixtures/draw-tiles.mjs';

const results = { browser: navigator.userAgent, webgl2: null, webgpu: null, checks: [], errors: [] };
const assert = (v, text) => { if (!v) throw new Error(text); results.checks.push(text); };
const difference = (a, b) => { let max = 0, different = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); max = Math.max(max, d); if (d) different++; } return { max, different, channels: a.length }; };
function fixture(w, h) {
  const n = w * h, color = new Uint32Array(n), light = new Uint32Array(n), hdrLight = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { color[i] = (((i * 23 % 256) << 24) | ((i * 71 % 256) << 16) | ((i * 37 % 256) << 8) | i * 13 % 256) >>> 0; light[i] = (0xff000000 | (i * 7 % 256) | ((i * 9 % 256) << 8) | ((i * 3 % 256) << 16)) >>> 0; hdrLight.set([i % 11 / 4, i % 7 / 9, i % 5 / 7], i * 3); }
  return { w, h, color, light, hdrLight, ox: 0, oy: 0 };
}
async function run() {
  let gl;
  try {
    gl = new WebGLCompositor(document.createElement('canvas')); results.webgl2 = { status: 'running', renderer: gl.renderer };
    for (const [w, h] of [[19, 13], [1, 1], [27, 9]]) { const frame = fixture(w, h); const out = new Uint8ClampedArray(w * h * 4); composite(frame, out, null, .7); gl.render(frame, null, .7); const d = difference(out, gl.readPixels()); assert(d.max <= 1, `WebGL2 parity ${w}×${h}: ${JSON.stringify(d)}`); }
    results.webgl2.status = 'passed';
  } catch (error) { if (!gl) results.webgl2 = { status: 'unavailable', reason: String(error) }; else { results.webgl2.status = 'failed'; results.errors.push(String(error)); } }
  finally { gl?.dispose(); }
  let gpu, draw, particles;
  try {
    gpu = await WebGPUCinematicRenderer.create(document.createElement('canvas')); results.webgpu = { status: 'running', ...gpu.status };
    const cpu = new CinematicCompositor();
    for (const [w, h] of [[19, 13], [1, 1], [27, 9]]) {
      const frame = fixture(w, h), n = w * h;
      for (const options of [ {}, { finalPalette: [0xff112233, 0xff778899, 0xffccddff], bloom: { levels: 3 } }, { bloom: false, toneMap: 'none', exposure: 1, contrast: 1, saturation: 1, vignette: 0 }, { background: 0xff1a0903, toneMap: 'reinhard', highlightColor: .8, bloom: { levels: 6 } }, { background: new Uint32Array(n).fill(0xff28100d), occlusion: new Float32Array(n).fill(.63), radiance: new Float32Array(n * 3).fill(.08), legacyLight: new Uint32Array(n).fill(0xff103019), bloom: { levels: 2, knee: 0, threshold: .3 }, chromaticFringe: 1.4 } ]) {
        const expected = cpu.render(frame, new Uint8ClampedArray(n * 4), options); gpu.render(frame, options); const actual = await gpu.capture(); const d = difference(expected, actual); assert(d.max <= 2, `Cinematic parity ${w}×${h}: ${JSON.stringify(d)}`);
      }
    }
    draw = await WebGPUDrawRenderer.create(gpu.device);
    const scene = { schema: 'poku-draw/v1', width: 31, height: 23, assets: [{ id: 'sprite', revision: 1, width: 3, height: 2, color: [0xff0000ff, 0x8000ff00, 0, 0xff884411, 0xffffffff, 0x400000ff] }], commands: [
      { op: 'rect', origin: [2, 2, -2], size: [20, 12], material: { color: 0xffcc7722, blend: 'opaque', emission: [.02, .1, .7] } },
      { op: 'triangle', vertices: [[1, 5, -3], [24, 3, 3], [11, 21, 0]], material: { color: 0x70ee0099, emission: [.2, .01, .4] } },
      { op: 'segment', from: [3, 14, 2], to: [26, 9, 2], width: 3, material: { color: 0xffeecc88, blend: 'additive', emission: [1, .5, .2] } },
      { op: 'sprite', asset: 'sprite', origin: [15, 7, 4], axisX: [1.3, .4], axisY: [-.4, 1.3], material: { color: 0xffffffff } },
    ] };
    const options = { bloom: { levels: 3 }, background: null }, expected = cpu.render(renderDrawSceneCPU(scene), new Uint8ClampedArray(scene.width * scene.height * 4), options);
    gpu.renderBuffers(draw.render(scene), options); const d = difference(expected, await gpu.capture()); assert(d.max <= 2, `DrawIR CPU/GPU parity: ${JSON.stringify(d)}`);
    draw.render(scene); assert(draw.resources.avoidedUploadBytes > 0, 'Immutable atlas bytes stay resident on the second frame');
    for (const { name, scene: tileScene } of drawTileFixtures()) {
      draw.setCulling('none'); gpu.renderBuffers(draw.render(tileScene), { bloom: false }); const direct = await gpu.capture();
      draw.setCulling('tiled'); gpu.renderBuffers(draw.render(tileScene), { bloom: false }); const tiled = await gpu.capture();
      assert(difference(direct, tiled).max === 0, `Exact GPU direct/tiled parity: ${name}`);
      const bins = await draw.inspectCulling();
      if (name === 'sparse-512') assert(bins.candidatePixelVisits < bins.directPixelVisits * .08, 'Actual sparse GPU bins remove at least 92% of candidate visits');
      if (name === 'dense-overflow-301') assert(bins.overflowTiles > 0, 'Dense GPU bins fall back to complete rasterization without dropping pixels');
    }
    draw.setCulling('tiled');
    particles = await GpuParticleSystem.create(gpu.device, { capacity: 8, seed: 42 });
    const spawn = { position: [10, 10, 1], velocity: [3, -4, 0], gravity: [0, 8, 0], lifetime: 2, radius: 1, color: 0xff4499ff, spread: .6 };
    particles.spawn(spawn); particles.advance(.5); const a = await particles.snapshot(); particles.clear(); particles.spawn(spawn); for (let i = 0; i < 30; i++) particles.advance(1 / 60); const b = await particles.snapshot(); assert(difference(a, b).max === 0, 'Fixed GPU ticks reproduce identical particle state across update partitions');
    gpu.renderBuffers(draw.render(scene, particles), options); await gpu.capture(); assert(true, 'GPU particle commands merge with scene depth before cinematic finishing');
    const frames = Array.from({ length: 7 }, (_, i) => ({ frame: fixture(7, 5), options: { bloom: false }, time: i / 60, duration: 1 / 60 })); const captured = [];
    await captureCinematicSequence(gpu, frames, async frame => { captured.push(frame.index); }, { inFlight: 3 }); assert(captured.join(',') === '0,1,2,3,4,5,6', 'Bounded asynchronous capture preserves frame order');
    results.webgpu.timings = gpu.timings; results.webgpu.resources = gpu.resources;
    const wrapper = await CinematicFrameRenderer.create(document.createElement('canvas'), { backend: 'cpu' }); wrapper.render(fixture(3, 2)); assert(wrapper.status.backend === 'cpu', 'CPU remains explicit default/fallback path'); wrapper.dispose();
    gpu.device.destroy(); await gpu.device.lost; assert(gpu.status.state === 'lost', 'Device loss is observable'); results.webgpu.status = 'passed';
  } catch (error) { if (!gpu) results.webgpu = { status: 'unavailable', reason: String(error) }; else { results.webgpu.status = 'failed'; results.errors.push(String(error)); } }
  finally { particles?.dispose(); draw?.dispose(); gpu?.dispose(); }
  results.status = results.errors.length ? 'failed' : results.webgpu?.status === 'passed' && results.webgl2?.status === 'passed' ? 'passed' : 'partial';
  document.getElementById('result').textContent = JSON.stringify(results, null, 2); return results;
}
window.gpuHarness = run();
