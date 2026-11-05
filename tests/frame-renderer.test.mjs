import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameRenderer, createFrame, composite } from '../build/core/index.js';

function host(gl = null) {
  const calls = { images: [], gpu: 0, clear: 0, statuses: [] };
  const context = {
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(image, x, y) { calls.images.push({ data: image.data.slice(), x, y }); },
    drawImage() { calls.gpu++; }, clearRect() { calls.clear++; }, save() {}, restore() {}, setTransform() {},
  };
  const gpuCanvas = { width: 0, height: 0, getContext: () => gl };
  if (gl) Object.defineProperties(gl, { drawingBufferWidth: { get: () => gpuCanvas.width }, drawingBufferHeight: { get: () => gpuCanvas.height } });
  const canvas = { width: 0, height: 0, getContext: () => context, ownerDocument: { createElement: () => gpuCanvas } };
  return { canvas, calls };
}
function fixture() {
  const f = createFrame(7, 3);
  f.color.set([0, 0x01010203, 0x7f234567, 0x80203040, 0xfe101010, 0xffffffff, 0x00123456]);
  f.light.set([0x00ffffff, 0x00000302, 0x00100903, 0x000000ff, 0, 0x00010203]);
  return f;
}
function fakeGL() {
  // A call-contract mock, not execution of GLSL or a GPU correctness test.
  const gl = { lost: false, draws: 0, uploads: [], released: 0 };
  ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE0','TEXTURE_2D','TEXTURE_MIN_FILTER',
    'TEXTURE_MAG_FILTER','NEAREST','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','R32UI','RED_INTEGER',
    'UNSIGNED_INT','BLEND','DITHER','DEPTH_TEST','SCISSOR_TEST','RENDERER','MAX_TEXTURE_SIZE','TRIANGLES'].forEach((k,i)=>gl[k]=i+1);
  gl.NO_ERROR = 0;
  for (const name of ['createShader', 'createProgram', 'createTexture']) gl[name] = () => ({});
  for (const name of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','activeTexture','bindTexture',
    'texParameteri','uniform1i','uniform1ui','uniform1f','disable','deleteTexture','deleteProgram','deleteShader','viewport']) gl[name] = () => {};
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getContextAttributes = () => ({ alpha: true, premultipliedAlpha: false, antialias: false });
  gl.getUniformLocation = (_p,name) => name;
  gl.getParameter = p => p === gl.MAX_TEXTURE_SIZE ? 4096 : 'Mock GL';
  gl.getError = () => 0; gl.isContextLost = () => gl.lost;
  gl.getExtension = () => ({ loseContext() { gl.released++; } });
  gl.texImage2D = (...args) => gl.uploads.push(args);
  gl.texSubImage2D = (...args) => gl.uploads.push(args);
  gl.drawArrays = () => { gl.draws++; };
  return gl;
}

test('CPU default and unavailable WebGL fallback preserve straight alpha, light, backgrounds and offsets', () => {
  for (const backend of [undefined, 'cpu', 'auto', 'webgl2']) {
    const { canvas, calls } = host(), renderer = new FrameRenderer(canvas, { backend, onStatus: s => calls.statuses.push(s) });
    assert.equal(renderer.status.backend, 'cpu');
    assert.equal(!!renderer.status.reason, backend === 'auto' || backend === 'webgl2');
    const f = fixture(), beforeC = f.color.slice(), beforeL = f.light.slice();
    for (const background of [null, 0xff103050, new Uint32Array(f.w * f.h).fill(0xffe0d0c0)]) {
      renderer.render(f, background, .7, [2, -1]);
      assert.deepEqual(calls.images.at(-1).data, composite(f, new Uint8ClampedArray(f.w * f.h * 4), background, .7));
      assert.deepEqual([calls.images.at(-1).x, calls.images.at(-1).y], [2, -1]);
    }
    assert.deepEqual(f.color, beforeC); assert.deepEqual(f.light, beforeL);
    assert.equal(calls.gpu, 0); assert.equal(canvas.width, 7); assert.equal(canvas.height, 3);
    renderer.render(createFrame(2, 5)); assert.equal(canvas.width, 2); assert.equal(canvas.height, 5);
    renderer.dispose(); renderer.dispose(); assert.throws(() => renderer.render(f), /disposed/);
  }
});

test('mock WebGL lifecycle uploads packed cells and context loss falls back without losing the current frame', () => {
  const gl = fakeGL(), { canvas, calls } = host(gl), f = fixture();
  const renderer = new FrameRenderer(canvas, { backend: 'auto', onStatus: s => calls.statuses.push(s) });
  assert.equal(renderer.status.backend, 'webgl2'); renderer.render(f);
  assert.equal(gl.draws, 1); assert.equal(calls.gpu, 1); assert.equal(calls.images.length, 0);
  assert.ok(gl.uploads.some(a => a.at(-1) === f.color)); assert.ok(gl.uploads.some(a => a.at(-1) === f.light));
  gl.lost = true; renderer.render(f, 0xff000000);
  assert.equal(renderer.status.backend, 'cpu'); assert.match(renderer.status.reason, /lost/);
  assert.deepEqual(calls.images.at(-1).data, composite(f, new Uint8ClampedArray(f.w * f.h * 4), 0xff000000));
  assert.equal(calls.statuses.length, 2); assert.equal(gl.released, 1);
  renderer.render(f); assert.equal(calls.statuses.length, 2); renderer.dispose(); assert.equal(gl.released, 1);
});

test('optional renderer rejects invalid input before drawing and does not hide caller errors as GPU failures', () => {
  const gl = fakeGL(), { canvas } = host(gl), renderer = new FrameRenderer(canvas, { backend: 'auto' }), f = fixture();
  for (const bad of [{ ...f, w: 1.5 }, { ...f, light: new Uint32Array(1) }, { ...f, color: [] }])
    assert.throws(() => renderer.render(bad), /Frame needs/);
  assert.throws(() => renderer.render(f, new Uint32Array(1)), /Background/);
  assert.throws(() => renderer.render(f, NaN), /Background/);
  assert.throws(() => renderer.render(f, null, Infinity), /Light strength/);
  assert.throws(() => renderer.render(f, null, 1, [.5, 0]), /Camera offset/);
  assert.equal(renderer.status.backend, 'webgl2'); assert.equal(gl.draws, 0); renderer.dispose();
  const badGL = fakeGL(); badGL.getContextAttributes = () => ({ alpha: true, premultipliedAlpha: true, antialias: true });
  const rejected = new FrameRenderer(host(badGL).canvas, { backend: 'auto' });
  assert.equal(rejected.status.backend, 'cpu'); assert.match(rejected.status.reason, /straight-alpha/);
  assert.equal(badGL.released, 1); rejected.dispose();
});

test('gallery GPU toggling preserves playback time and CPU output, and disposes on request', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const { transformSync } = await import('esbuild');
  const core = await import('../build/core/index.js');
  const source = readFileSync(new URL('../gallery/app.ts', import.meta.url), 'utf8');
  const playerSource = source.slice(source.indexOf('class Player {'), source.indexOf('// ---- tiles'));
  const javascript = transformSync(playerSource, { loader: 'ts', target: 'es2022' }).code;
  const scope = { ...core, devicePixelRatio: 1, reduced: false, detail: null, queueMicrotask: fn => fn(), gpuStatus() {} };
  runInNewContext(javascript + '\nglobalThis.GalleryPlayer = Player;', scope);
  const { canvas, calls } = host(); canvas.style = {}; canvas.getBoundingClientRect = () => ({ width: 8 });
  const meta = { size: [8, 8], origin: [0, 0], duration: 2, fps: 30, loop: true, bg: 'black', options: {} };
  const mod = { meta, draw(p,t) { p.rect(Math.floor(t * 2), 1, 2, 2, 0x8050aaff); p.glow(4, 4, 3, 0xff80ffff, .4); } };
  const player = new scope.GalleryPlayer(canvas, { meta, mod }, 1, 1);
  player.seek(.5); const before = calls.images.at(-1).data, time = player.inst.t, instance = player.inst;
  player.setGpu(true); player.render();
  assert.equal(player.presenter.status.backend, 'cpu'); assert.match(player.presenter.status.reason, /unavailable/);
  assert.deepEqual(calls.images.at(-1).data, before); assert.equal(player.inst.t, time); assert.equal(player.inst, instance);
  const renderer = player.presenter; player.setGpu(false); player.render();
  assert.equal(player.presenter, null); assert.equal(player.inst.t, time); assert.deepEqual(calls.images.at(-1).data, before);
  assert.throws(() => renderer.render(player.frame), /disposed/); player.dispose();
});

test('copied GPU example retains exact options and executes with CPU fallback', async () => {
  const { runInNewContext } = await import('node:vm');
  const core = await import('../build/core/index.js');
  const { canvas, calls } = host(); canvas.style = {};
  const selection = { id: 'test/gpu-example', width: 8, height: 8, x: 0, y: 0, options: { seed: 17, palette: ['#123456', '#abcdef'] },
    flip: true, acted: false, actor: false, background: 'none', speed: .5, renderer: 'auto' };
  const source = core.effectExampleCode2D(selection);
  assert.match(source, /new FrameRenderer\(canvas/); assert.match(source, /"seed": 17/); assert.match(source, /#abcdef/);
  assert.doesNotMatch(source, /putImageData|imageData/);
  const scheduled = [];
  runInNewContext(source.replace(/^import .*;$/gm, ''), { ...core,
    document: { createElement: () => canvas, body: { append() {} } },
    effect: { meta: { duration: 1, loop: true }, draw(p) { p.rect(-1, 0, 1, 1, 0xff804020); } },
    performance: { now: () => 0 }, requestAnimationFrame: fn => scheduled.push(fn), matchMedia: () => ({ matches: false }),
  });
  assert.equal(scheduled.length, 1); scheduled.shift()(16);
  assert.equal(calls.images.length, 1); assert.equal(calls.gpu, 0); assert.equal(scheduled.length, 1);
});
