import { WebGPUCinematicRenderer } from '../src/render/webgpu.js';
import { WebGPUDrawRenderer } from '../src/render/draw-ir-gpu.js';
import { GpuParticleSystem, type CosmeticParticleSpawn } from '../src/render/gpu-particles.js';
import { parseDrawScene, serializeDrawScene, type DrawScene } from '../src/render/draw-ir.js';
import { createGpuLabScene, type GpuLabDistribution } from '../src/examples/gpu-lab.js';
import { integerViewport, PlaybackClock } from '../src/authoring/clock.js';
import type { CinematicOptions } from '../src/render/cinematic.js';
import type { DrawCullingMode } from '../src/render/draw-tiles.js';
import { encodeRGBAPNG } from './png.js';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const select = (id: string) => element<HTMLSelectElement>(id);
const input = (id: string) => element<HTMLInputElement>(id);
const button = (id: string) => element<HTMLButtonElement>(id);
const canvas = element<HTMLCanvasElement>('view'), context = canvas.getContext('2d')!;
const viewport = element('viewport'), native = document.createElement('canvas'), nativeContext = native.getContext('2d')!;
const clock = new PlaybackClock(6, true);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let gpu: WebGPUCinematicRenderer | undefined, draw: WebGPUDrawRenderer | undefined, particles: GpuParticleSystem | undefined;
let gpuSurface: HTMLCanvasElement | undefined, worker: Worker | undefined;
let generation = 0, cpuId = 0, gpuBusy = false, cpuBusy = false, dirty = true, busyAction = false;
let pendingCpu: { id: number; scene: DrawScene; options: CinematicOptions } | undefined;
let imported: DrawScene | undefined, currentScene = createGpuLabScene();
let cpuImage: Uint8ClampedArray | undefined, lastSubmit = 0, hasFrame = false;
const palette = [0xff17100b, 0xff36241d, 0xff654b34, 0xffa87848, 0xffd8b565, 0xff9a62de, 0xffd39ff3, 0xfffff0d0];

function status(message: string, error = false): void { element('status').textContent = message; element('status').classList.toggle('error', error); }
function options(): CinematicOptions { return { background: null, bloom: input('bloom').checked ? { levels: 4, threshold: .18, intensity: .5, knee: .15 } : false, exposure: 1, contrast: 1.02, saturation: 1.05, vignette: 0, chromaticFringe: 0, finalPalette: input('palette').checked ? palette : undefined }; }
function scene(): DrawScene { return imported ?? createGpuLabScene(clock.time, { count: Number(select('count').value), distribution: select('distribution').value as GpuLabDistribution }); }
function syncControls(): void {
  button('play').textContent = clock.playing ? '일시정지' : '재생';
  button('play').disabled = !gpu || !!imported || busyAction;
  for (const id of ['burst', 'inspect', 'compare']) button(id).disabled = !gpu || busyAction;
  button('retry').disabled = busyAction;
  select('distribution').disabled = select('count').disabled = !!imported;
  input('timeline').disabled = !!imported;
  input('timeline').value = String(clock.time); element('time').textContent = `${clock.time.toFixed(2)} s`;
}
function present(surface: CanvasImageSource, w: number, h: number): void {
  const box = viewport.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width * dpr)), height = Math.max(1, Math.round(box.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const view = integerViewport(w, h, width, height);
  context.fillStyle = '#060b12'; context.fillRect(0, 0, width, height); context.imageSmoothingEnabled = false;
  context.drawImage(surface, view.x, view.y, view.width, view.height);
  element('native-size').textContent = `${w} × ${h} · ${view.scale}× 물리 픽셀${view.clipped ? ' · 일부 잘림' : ''}`;
  hasFrame = true;
}
function metrics(): void {
  const resources = draw?.resources;
  element('submit-time').textContent = gpu ? `${lastSubmit.toFixed(2)} ms` : 'CPU 기준';
  element('gpu-time').textContent = gpu?.timings.gpu != null ? `${gpu.timings.gpu.toFixed(2)} ms` : '미제공';
  element('primitives').textContent = resources ? resources.primitives.toLocaleString() : currentScene.commands.length.toLocaleString();
  element('tile-count').textContent = resources ? resources.culling === 'tiled' ? `${resources.tiles}개 타일 · ${(resources.tileBytes / 1024).toFixed(0)} KiB` : '전체 도형 직접 검사' : 'CPU reference · 정지화면';
  element('particle-count').textContent = particles ? `입자 ${particles.active} / ${particles.capacity} · 제출 슬롯 ${particles.count}` : 'GPU 입자 비활성';
}
function requestCpu(): void {
  currentScene = scene();
  pendingCpu = { id: ++cpuId, scene: currentScene, options: options() };
  if (!worker) {
    worker = new Worker(new URL('./gpu-lab-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const data = event.data; cpuBusy = false;
      if (!gpu && data.id === cpuId) {
        if (data.error) status(`CPU 기준 렌더 실패: ${data.error}`, true);
        else {
          cpuImage = new Uint8ClampedArray(data.rgba); native.width = data.width; native.height = data.height;
          nativeContext.putImageData(new ImageData(new Uint8ClampedArray(cpuImage), data.width, data.height), 0, 0);
          present(native, data.width, data.height); metrics(); element('submit-time').textContent = `${data.milliseconds.toFixed(1)} ms`;
          element('submit-time').parentElement!.querySelector('span')!.textContent = 'CPU 기준 프레임 전체';
        }
      }
      sendCpu();
    };
    worker.onerror = event => { cpuBusy = false; status(`CPU worker 오류: ${event.message}`, true); };
  }
  sendCpu();
}
function sendCpu(): void { if (!worker || cpuBusy || !pendingCpu) return; cpuBusy = true; const next = pendingCpu; pendingCpu = undefined; worker.postMessage(next); }
function releaseGpu(): void { particles?.dispose(); draw?.dispose(); gpu?.dispose(); particles = undefined; draw = undefined; gpu = undefined; gpuSurface = undefined; }
function fallback(reason: string): void {
  ++generation; releaseGpu(); gpuBusy = false; clock.playing = false; clock.suspend();
  element('backend-badge').textContent = 'CPU 기준 정지화면'; status(`WebGPU 대체 표시 · ${reason}`); syncControls(); requestCpu();
}
async function connect(): Promise<void> {
  const token = ++generation; releaseGpu(); gpuBusy = false; busyAction = true; syncControls(); status('GPU 어댑터와 렌더 파이프라인을 준비하고 있습니다.');
  let candidate: WebGPUCinematicRenderer | undefined, candidateDraw: WebGPUDrawRenderer | undefined, candidateParticles: GpuParticleSystem | undefined;
  try {
    const surface = document.createElement('canvas');
    candidate = await WebGPUCinematicRenderer.create(surface, { maxBytes: 64 * 1024 * 1024, captureSlots: 2, onStatus: state => { if (token === generation && state.state === 'lost') fallback(state.reason ?? 'GPU device lost'); } });
    candidateDraw = await WebGPUDrawRenderer.create(candidate.device, 64 * 1024 * 1024, { culling: select('culling').value as DrawCullingMode });
    candidateParticles = await GpuParticleSystem.create(candidate.device, { capacity: 512, seed: 42, hz: 120 });
    if (token !== generation) { candidateParticles.dispose(); candidateDraw.dispose(); candidate.dispose(); return; }
    gpu = candidate; draw = candidateDraw; particles = candidateParticles; gpuSurface = surface;
    ++cpuId; pendingCpu = undefined; clock.playing = !reducedMotion.matches && !imported; clock.suspend();
    const adapter = gpu.status.adapter, kind = adapter?.software === true ? '소프트웨어 어댑터' : adapter?.software === false ? 'GPU 어댑터' : '어댑터 종류 미확인';
    element('backend-badge').textContent = `WebGPU · ${kind}`;
    status(`${kind} · ${adapter?.description || adapter?.device || adapter?.vendor || '장치 정보 미제공'} · 도형 래스터와 장식 입자가 GPU에서 실행됩니다.`);
    element('submit-time').parentElement!.querySelector('span')!.textContent = 'CPU 명령 작성·제출';
    dirty = true;
  } catch (error) {
    candidateParticles?.dispose(); candidateDraw?.dispose(); candidate?.dispose();
    if (token === generation) fallback(error instanceof Error ? error.message : String(error));
  } finally { if (token === generation || !gpu) { busyAction = false; syncControls(); } }
}
function renderGpu(): void {
  if (!gpu || !draw || !gpuSurface) return;
  const start = performance.now(); currentScene = scene(); draw.setCulling(select('culling').value as DrawCullingMode);
  gpu.renderBuffers(draw.render(currentScene, particles?.active ? particles : undefined), options());
  lastSubmit = performance.now() - start; present(gpuSurface, currentScene.width, currentScene.height); metrics();
}
function invalidate(): void { dirty = true; element('inspector').textContent = '장면이 변경되었습니다. 현재 프레임을 검사하면 새 후보 수를 확인할 수 있습니다.'; if (!gpu && !busyAction) requestCpu(); }
async function action(work: () => Promise<void>): Promise<void> {
  if (busyAction) return;
  busyAction = true; clock.playing = false; clock.suspend(); syncControls();
  try { await work(); } catch (error) { status(error instanceof Error ? error.message : String(error), true); }
  finally { busyAction = false; syncControls(); }
}
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
button('play').onclick = () => { clock.playing = !clock.playing; clock.suspend(); syncControls(); };
button('reset').onclick = () => { imported = undefined; particles?.clear(); clock.reset(); element('scene-title').textContent = 'Orbital drawing study'; syncControls(); invalidate(); };
button('retry').onclick = () => { void connect(); };
for (const id of ['distribution', 'count', 'culling']) select(id).onchange = invalidate;
for (const id of ['bloom', 'palette']) input(id).onchange = invalidate;
input('timeline').oninput = () => { clock.playing = false; clock.seek(Number(input('timeline').value)); particles?.clear(); syncControls(); invalidate(); };
button('burst').onclick = () => {
  if (!particles || busyAction) return;
  const available = particles.capacity - particles.active, burst: CosmeticParticleSpawn[] = [];
  for (let i = 0; i < Math.min(available, 128); i++) {
    const angle = i * 2.399963229728653, speed = 18 + i % 41;
    burst.push({ position: [currentScene.width / 2, currentScene.height / 2, 30], velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed - 10, 0], gravity: [0, 16, 0], lifetime: 2, radius: i % 5 ? .65 : 1.2, color: i % 2 ? 0xffffd86a : 0xffb06bff, emission: .8, spread: 2, drag: .1 });
  }
  particles.spawnBatch(burst); particles.advance(0); clock.playing = true; clock.suspend(); dirty = true; syncControls();
};
button('inspect').onclick = () => { void action(async () => {
  renderGpu(); const stats = await draw!.inspectCulling();
  const reduction = stats.directPixelVisits ? (1 - stats.candidatePixelVisits / stats.directPixelVisits) * 100 : 0;
  element('inspector').textContent = `현재 ${stats.mode === 'tiled' ? '타일' : '직접'} 경로\n픽셀 후보 검사: ${stats.candidatePixelVisits.toLocaleString()} / 전체 ${stats.directPixelVisits.toLocaleString()}\n후보 감소: ${reduction.toFixed(2)}%\n전체 검사로 전환된 타일: ${stats.overflowTiles} / ${stats.tiles}\n타일 bounds 검사 상한: ${stats.binningBoundsUpperBound.toLocaleString()}\n이 수치는 실제 GPU bin을 읽은 연산량 지표이며 속도 향상 배수가 아닙니다.`;
}); };
button('compare').onclick = () => { void action(async () => {
  if (!gpu || !draw) return;
  currentScene = scene(); const previous = select('culling').value as DrawCullingMode;
  try {
    draw.setCulling('none'); gpu.renderBuffers(draw.render(currentScene, particles?.active ? particles : undefined), options()); const direct = await gpu.capture();
    draw.setCulling('tiled'); gpu.renderBuffers(draw.render(currentScene, particles?.active ? particles : undefined), options()); const tiled = await gpu.capture();
    let changed = 0, maximum = 0;
    for (let i = 0; i < direct.length; i++) { const delta = Math.abs(direct[i] - tiled[i]); if (delta) changed++; maximum = Math.max(maximum, delta); }
    element('inspector').textContent = `직접 / 타일 비교 · 같은 장면과 시점\n검사한 RGBA 채널: ${direct.length.toLocaleString()}\n다른 채널: ${changed.toLocaleString()} · 최대 차이: ${maximum}\n${changed === 0 ? '현재 어댑터의 두 경로 출력이 정확히 일치합니다.' : '출력 차이를 발견했습니다. 직접 경로를 선택하고 장면 JSON을 보관하세요.'}`;
  } finally { draw.setCulling(previous); renderGpu(); }
}); };
button('png').onclick = () => { void action(async () => {
  if (gpu) { renderGpu(); const rgba = await gpu.capture(); download(await encodeRGBAPNG(currentScene.width, currentScene.height, rgba), 'poku-gpu-frame.png'); }
  else {
    if (cpuBusy || pendingCpu || !cpuImage || !hasFrame) throw new Error('현재 CPU 기준 프레임의 계산이 끝난 뒤 저장하세요.');
    download(await encodeRGBAPNG(native.width, native.height, cpuImage), 'poku-cpu-reference.png');
  }
}); };
button('save').onclick = () => { try { download(new Blob([serializeDrawScene(scene())], { type: 'application/json' }), 'poku-draw-scene.json'); status('현재 도형 명령 JSON을 저장했습니다. 별도 GPU 장식 입자의 상태는 포함하지 않습니다.'); } catch (error) { status(String(error), true); } };
button('open').onclick = () => input('file').click();
input('file').onchange = () => { const file = input('file').files?.[0]; if (!file) return; void action(async () => {
  if (file.size > 4 * 1024 * 1024) throw new Error('GPU Lab JSON은 최대 4 MiB까지 열 수 있습니다.');
  const loaded = parseDrawScene(await file.text());
  if (loaded.width > 1024 || loaded.height > 1024) throw new Error('GPU Lab 미리보기는 최대 1024×1024 네이티브 픽셀을 지원합니다.');
  imported = loaded; particles?.clear(); element('scene-title').textContent = file.name; dirty = true; input('file').value = '';
  if (!gpu) requestCpu(); status(`${file.name} · DrawIR 장면을 열었습니다. 초기화로 기본 예제로 돌아갈 수 있습니다.`);
}); };
new ResizeObserver(() => { if (gpuSurface && hasFrame) present(gpuSurface, currentScene.width, currentScene.height); else if (cpuImage) present(native, native.width, native.height); }).observe(viewport);
document.addEventListener('visibilitychange', () => clock.suspend());
reducedMotion.addEventListener('change', event => { if (event.matches) { clock.playing = false; clock.suspend(); syncControls(); } });
function tick(now: number): void {
  requestAnimationFrame(tick);
  if (!gpu || gpuBusy || busyAction || document.hidden) return;
  const update = clock.tick(now);
  if (!clock.playing && !dirty) return;
  try {
    let elapsed = update.elapsed;
    while (elapsed > 2) { particles?.advance(2); elapsed -= 2; }
    if (elapsed > 0) particles?.advance(elapsed);
    renderGpu(); dirty = false; syncControls(); gpuBusy = true;
    const device = gpu.device, token = generation;
    void device.queue.onSubmittedWorkDone().then(() => { if (token === generation) gpuBusy = false; }).catch(error => { if (token === generation) fallback(String(error)); });
  } catch (error) { fallback(error instanceof Error ? error.message : String(error)); }
}
window.addEventListener('pagehide', () => { ++generation; releaseGpu(); worker?.terminate(); });
requestAnimationFrame(tick); void connect();
