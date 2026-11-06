import { hex } from '../src/core/color.js';
import type { EditableSprite2D } from '../src/core/sprite-edit.js';
import type { PixelBrushPoint2D } from '../src/core/pixel-brush.js';
import { capturePixelClusterBrush2D, clonePixelBrush2D, parsePixelClusterBrush2D, serializePixelClusterBrush2D,
  stampPixelClusterBrush2D, type PixelClusterBrush2D, type PixelClusterStampOptions2D, type PixelCloneBrushOptions2D } from '../src/core/pixel-cluster-brush.js';
import { renderPixelArtDocument2D, writePixelArtPaintLayer2D, type PixelArtDocument2D } from '../src/authoring/pixel-art-document.js';
import { pixelArtLayerLimit2D } from '../src/authoring/pixel-art-project.js';
import type { PixelArtWorkbenchHost } from './pixel-art-workbench.js';

export const pixelArtClusterTools = new Set(['cluster', 'clone']);
export const pixelArtWrappedPaintTools = new Set(['pencil', 'eraser', 'line', 'shade-light', 'shade-dark', 'cluster', 'clone']);
export interface PixelArtBrushSurface { canvas: HTMLCanvasElement; tile?: boolean }

const el = (id: string) => document.getElementById(id)!;
const input = (id: string) => el(id) as HTMLInputElement;
const select = (id: string) => el(id) as HTMLSelectElement;
const button = (id: string) => el(id) as HTMLButtonElement;
const modulo = (value: number, period: number) => (value % period + period) % period;
const integer = (id: string, low: number, high: number) => {
  const value = Number(input(id).value);
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${input(id).getAttribute('aria-label') ?? id}: ${low}~${high} 범위의 정수를 입력해 주세요.`);
  return value;
};

/** The repeated canvas uses its center tile as the origin. Never fold pointer coordinates
 * before interpolation: x=w-1 -> x=w+1 must cross the seam, not the middle of the image. */
export function pixelArtSurfacePoint(event: PointerEvent, surface: PixelArtBrushSurface, width: number, height: number, continuous = false): PixelBrushPoint2D {
  const { canvas, tile } = surface, rect = canvas.getBoundingClientRect();
  const native = (value: number) => continuous ? value : Math.floor(value);
  return { x: native((event.clientX - rect.left) * canvas.width / rect.width) - (tile ? width : 0),
    y: native((event.clientY - rect.top) * canvas.height / rect.height) - (tile ? height : 0),
    ...(event.pointerType === 'pen' && input('pen-pressure').checked ? { pressure: event.pressure } : {}) };
}

function exampleBrush(name: string, rows: string[], colors: Record<string, string>, anchor: [number, number]): PixelClusterBrush2D {
  const pixels = rows.flatMap(row => [...row].map(cell => colors[cell] ? hex(colors[cell]) >>> 0 : 0));
  return { schema: 'poku-pixel-cluster-brush/v1', name, width: rows[0].length, height: rows.length,
    pixels, mask: pixels.map(color => color >>> 24 ? 1 : 0), anchor };
}

/** Captured clusters and source cloning are color editing tools. They use the visible
 * pre-stroke image, then store exact replacements above it so layer opacity and later
 * adjustment layers are never applied to a sampled color twice. */
export function installPixelArtBrushes(host: PixelArtWorkbenchHost, surfaces: readonly PixelArtBrushSurface[], beforeAction: () => void) {
  const brushes: PixelClusterBrush2D[] = [
    exampleBrush('작은 잎 · 작성 예', ['...a.', '..aba', '.abca', 'abcb.', 'abc..', '.b...', '.b...'], { a: '#376d63', b: '#7eaa75', c: '#c0d99b' }, [1, 5]),
    exampleBrush('실땀 · 작성 예', ['a...a', '.b.b.', '..c..'], { a: '#b98455', b: '#e2b778', c: '#f3dfa6' }, [2, 1]),
  ];
  let selected = 0, frame: number | undefined, picking = false, importRevision = 0;
  let cloneSource: [number, number] | undefined, cloneDestination: [number, number] | undefined;
  // The workbench installs its controls before the host creates the first study.
  let dimensions = '';
  let hover: { point: PixelBrushPoint2D; surface: PixelArtBrushSurface } | undefined;
  let stroke: {
    pointer: number; surface: PixelArtBrushSurface; owner: PixelArtDocument2D; document: PixelArtDocument2D;
    source: EditableSprite2D; points: PixelBrushPoint2D[]; tool: 'cluster' | 'clone'; layerId?: string;
    brush: PixelClusterBrush2D; stamp: PixelClusterStampOptions2D; clone: PixelCloneBrushOptions2D;
    from: [number, number]; to: [number, number]; candidate?: PixelArtDocument2D;
  } | undefined;
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); } };
  const svgNS = 'http://www.w3.org/2000/svg';
  const overlays = surfaces.map(surface => {
    const overlay = document.createElementNS(svgNS, 'svg'); overlay.classList.add('brush-overlay'); overlay.setAttribute('aria-hidden', 'true');
    surface.canvas.parentElement!.append(overlay); return { surface, overlay };
  });
  const brush = () => brushes[selected];
  const wrap = () => input('paint-wrap').checked && pixelArtWrappedPaintTools.has(select('paint-tool').value);
  function chooseTool(tool: 'cluster' | 'clone') {
    select('paint-tool').value = tool; select('paint-tool').dispatchEvent(new Event('change')); host.refresh();
  }
  function release(value: typeof stroke) { if (value?.surface.canvas.hasPointerCapture(value.pointer)) value.surface.canvas.releasePointerCapture(value.pointer); }
  function cancelFrame() { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; }
  function schedule() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; attempt(preview); });
  }
  function topPaint(doc: PixelArtDocument2D) {
    const active = doc.layers.find(layer => layer.id === doc.activeLayerId), last = doc.layers.at(-1);
    if (active?.kind === 'paint' && (active.locked || active.visible === false)) throw new Error('선택한 그림 레이어의 표시와 잠금을 확인해 주세요.');
    return active?.id === last?.id && last?.kind === 'paint' && !last.locked && last.visible !== false && (last.opacity ?? 1) === 1 ? last.id : undefined;
  }
  function preview() {
    if (!stroke) return;
    const { source, points, tool, brush: pattern, stamp, clone, from, to, document: doc, layerId } = stroke;
    const output = tool === 'cluster' ? stampPixelClusterBrush2D(source, points, pattern, stamp) : clonePixelBrush2D(source, points, from, to, clone);
    let next = writePixelArtPaintLayer2D(doc, output.sprite, output.touched, layerId);
    if (!layerId && next !== doc) next = { ...next, layers: next.layers.map(layer => layer.id === next.activeLayerId
      ? { ...layer, name: tool === 'cluster' ? `군집 · ${pattern.name}`.slice(0, 160) : '클론 그리기' } : layer) };
    stroke.candidate = next;
    host.preview(next === doc ? undefined : renderPixelArtDocument2D(next));
    drawOverlays();
  }
  function finish() {
    if (!stroke) return;
    cancelFrame();
    try {
      preview();
      const completed = stroke; stroke = undefined; release(completed);
      if (completed.owner !== host.document()) { host.preview(undefined); return; }
      if (completed.candidate && completed.candidate !== completed.document) {
        host.commit(completed.candidate);
      } else host.preview(undefined);
      if (completed.tool === 'clone' && input('clone-aligned').checked) cloneDestination = [...completed.to];
    } catch (error) {
      const failed = stroke; stroke = undefined; release(failed); host.preview(undefined); throw error;
    } finally { drawOverlays(); }
  }
  function cancel() {
    cancelFrame(); const old = stroke; stroke = undefined; release(old); picking = false;
    if (old) host.preview(undefined);
    syncClone(); drawOverlays();
  }
  function setSource(point: [number, number]) {
    cloneSource = point; cloneDestination = undefined; picking = false; syncClone(); drawOverlays();
    host.status(`복제 기준: x ${point[0]} · y ${point[1]}. 현재 그림에서 이 위치를 읽습니다.`);
  }
  function start(event: PointerEvent, surface: PixelArtBrushSurface) {
    const tool = select('paint-tool').value;
    if (event.button !== 0 || !pixelArtClusterTools.has(tool) || stroke) return;
    if (surface.tile && !wrap()) { host.status('타일 위에서 그리려면 반대쪽 경계로 이어 그리기를 켜 주세요.'); return; }
    event.preventDefault(); finish(); beforeAction();
    const doc = host.outputDocument(), point = pixelArtSurfacePoint(event, surface, doc.width, doc.height, tool === 'cluster');
    if (!surface.tile && (point.x < 0 || point.y < 0 || point.x >= doc.width || point.y >= doc.height)) return;
    if (tool === 'clone' && (event.altKey || picking || !cloneSource)) { setSource([modulo(point.x, doc.width), modulo(point.y, doc.height)]); return; }
    const layerId = topPaint(doc);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError('최상단의 불투명도 1인 그림 레이어를 선택하거나 레이어 공간을 만든 뒤 그려 주세요.');
    const region = { ...(input('paint-in-selection').checked ? { selection: host.selection().slice() } : {}),
      protectedMask: host.protection().slice(), alphaLock: input('alpha-lock').checked, wrap: wrap() };
    stroke = { pointer: event.pointerId, surface, owner: host.document(), document: doc, source: renderPixelArtDocument2D(doc), points: [point],
      tool: tool as 'cluster' | 'clone', layerId, brush: structuredClone(brush()),
      stamp: { ...region, spacing: tool === 'cluster' ? integer('cluster-spacing', 1, 256) : 1, rotation: Number(select('cluster-rotation').value) as 0 | 90 | 180 | 270,
        flipX: input('cluster-flip-x').checked, flipY: input('cluster-flip-y').checked },
      clone: { ...region, size: tool === 'clone' ? integer('paint-size', 1, 64) : 1, tip: select('paint-tip').value as 'round' | 'square',
        pixelPerfect: input('pixel-perfect').checked, symmetry: select('paint-symmetry').value as PixelCloneBrushOptions2D['symmetry'] },
      from: cloneSource ? [...cloneSource] : [0, 0], to: input('clone-aligned').checked && cloneDestination ? [...cloneDestination] : [point.x, point.y] };
    surface.canvas.setPointerCapture(event.pointerId); preview();
  }
  for (const surface of surfaces) {
    surface.canvas.addEventListener('pointerdown', event => attempt(() => start(event, surface)));
    surface.canvas.addEventListener('pointermove', event => attempt(() => {
      const doc = host.document(); hover = { point: pixelArtSurfacePoint(event, surface, doc.width, doc.height), surface };
      if (stroke?.surface === surface && stroke.pointer === event.pointerId) {
        const samples = event.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event]) {
          const next = pixelArtSurfacePoint(sample, surface, doc.width, doc.height, stroke.tool === 'cluster'), last = stroke.points.at(-1)!;
          if (next.x !== last.x || next.y !== last.y || next.pressure !== last.pressure) stroke.points.push(next);
        }
        schedule();
      }
      drawOverlays();
    }));
    surface.canvas.addEventListener('pointerup', event => attempt(() => {
      if (stroke?.surface !== surface || stroke.pointer !== event.pointerId) return;
      const p = pixelArtSurfacePoint(event, surface, stroke.document.width, stroke.document.height, stroke.tool === 'cluster'), last = stroke.points.at(-1)!;
      if (event.pointerType === 'pen') p.pressure = last.pressure;
      if (p.x !== last.x || p.y !== last.y) stroke.points.push(p);
      finish();
    }));
    surface.canvas.addEventListener('pointercancel', event => { if (stroke?.surface === surface && stroke.pointer === event.pointerId) cancel(); });
    surface.canvas.addEventListener('lostpointercapture', event => { if (stroke?.surface === surface && stroke.pointer === event.pointerId) cancel(); });
    surface.canvas.addEventListener('pointerleave', () => { if (!stroke && hover?.surface === surface) { hover = undefined; drawOverlays(); } });
  }

  function showBrush() {
    const current = brush();
    select('cluster-brush').replaceChildren(...brushes.map((item, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = item.name; return option; }));
    select('cluster-brush').value = String(selected); input('cluster-name').value = current.name;
    input('cluster-anchor-x').max = String(current.width - 1); input('cluster-anchor-y').max = String(current.height - 1);
    input('cluster-anchor-x').value = String(current.anchor[0]); input('cluster-anchor-y').value = String(current.anchor[1]);
    const canvas = el('cluster-preview') as HTMLCanvasElement, scale = Math.max(1, Math.min(8, Math.floor(112 / Math.max(current.width, current.height))));
    canvas.width = current.width; canvas.height = current.height; canvas.style.width = `${current.width * scale}px`; canvas.style.height = `${current.height * scale}px`;
    const context = canvas.getContext('2d')!, image = context.createImageData(current.width, current.height);
    current.pixels.forEach((color, i) => image.data.set([color & 255, color >>> 8 & 255, color >>> 16 & 255, current.mask[i] ? color >>> 24 : 0], i * 4));
    context.putImageData(image, 0, 0);
    const anchor = el('cluster-preview-anchor');
    anchor.style.left = `${current.anchor[0] * scale}px`; anchor.style.top = `${current.anchor[1] * scale}px`; anchor.style.width = `${scale}px`; anchor.style.height = `${scale}px`;
    const visible = current.pixels.filter((color, i) => color >>> 24 && current.mask[i]);
    el('cluster-info').textContent = `${current.width} × ${current.height}px · ${new Set(visible).size}색 · ${visible.length}셀 · 기준 ${current.anchor.join(', ')}`;
    button('cluster-remove').disabled = brushes.length === 1; drawOverlays();
  }
  function addBrush(value: PixelClusterBrush2D) {
    if (brushes.length >= 32) throw new RangeError('현재 붓 목록은 32개까지입니다. 필요한 붓을 파일로 저장하고 사용하지 않는 붓을 지워 주세요.');
    brushes.push(value); selected = brushes.length - 1; showBrush(); chooseTool('cluster');
  }
  button('cluster-capture').onclick = () => attempt(() => {
    finish(); beforeAction();
    const source = renderPixelArtDocument2D(host.outputDocument());
    const captured = capturePixelClusterBrush2D(source, host.selection(), { name: `선택한 픽셀 ${brushes.length - 1}` });
    if (!captured.pixels.some((color, i) => color >>> 24 && captured.mask[i])) throw new Error('선택한 곳에 보이는 픽셀이 없습니다. 먼저 작은 무늬를 그린 뒤 선택하세요.');
    addBrush(captured); host.status('선택한 픽셀을 붓으로 가져왔습니다. 목적지를 제한하려면 선택 내부만을 켜세요.');
  });
  button('cluster-use').onclick = () => attempt(() => { finish(); beforeAction(); chooseTool('cluster'); });
  select('cluster-brush').onchange = () => attempt(() => { finish(); selected = Number(select('cluster-brush').value); showBrush(); });
  input('cluster-name').onchange = () => attempt(() => {
    const name = input('cluster-name').value.trim();
    if (!name || name.length > 160) throw new RangeError('붓 이름을 1~160자로 입력해 주세요.');
    brushes[selected] = { ...brush(), name }; showBrush();
  });
  for (const id of ['cluster-anchor-x', 'cluster-anchor-y']) input(id).onchange = () => attempt(() => {
    finish(); brushes[selected] = { ...brush(), anchor: [integer('cluster-anchor-x', 0, brush().width - 1), integer('cluster-anchor-y', 0, brush().height - 1)] }; showBrush();
  });
  el('cluster-preview').addEventListener('pointerdown', event => attempt(() => {
    if (event.button !== 0) return;
    event.preventDefault(); finish();
    const canvas = el('cluster-preview') as HTMLCanvasElement, rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width), y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height);
    if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) { brushes[selected] = { ...brush(), anchor: [x, y] }; showBrush(); }
  }));
  button('cluster-remove').onclick = () => attempt(() => {
    finish(); if (brushes.length <= 1) return;
    brushes.splice(selected, 1); selected = Math.min(selected, brushes.length - 1); showBrush();
  });
  button('cluster-export').onclick = () => attempt(() => {
    finish(); const current = brush(), name = current.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'pixel-brush';
    host.download(new Blob([serializePixelClusterBrush2D(current)], { type: 'application/json' }), `${name}.poku-pixel-brush.json`);
    host.status('픽셀 붓을 저장했습니다. 다른 프로젝트에서도 붓 열기로 사용할 수 있습니다.');
  });
  button('cluster-import').onclick = () => input('cluster-brush-file').click();
  input('cluster-brush-file').onchange = async () => {
    const file = input('cluster-brush-file').files?.[0], revision = ++importRevision;
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new RangeError('픽셀 붓 파일은 1MiB 이하여야 합니다.');
      const value = parsePixelClusterBrush2D(await file.text());
      if (revision !== importRevision) return;
      finish(); addBrush(value); host.status('픽셀 붓의 색·알파·기준점을 그대로 열었습니다.');
    } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); }
    finally { if (revision === importRevision) input('cluster-brush-file').value = ''; }
  };
  for (const id of ['cluster-spacing', 'cluster-rotation', 'cluster-flip-x', 'cluster-flip-y']) el(id).addEventListener('input', drawOverlays);

  function syncClone() {
    const doc = host.document();
    if (!doc) return;
    input('clone-source-x').max = String(doc.width - 1); input('clone-source-y').max = String(doc.height - 1);
    if (cloneSource) {
      if (document.activeElement !== input('clone-source-x')) input('clone-source-x').value = String(cloneSource[0]);
      if (document.activeElement !== input('clone-source-y')) input('clone-source-y').value = String(cloneSource[1]);
    }
    button('clone-pick').setAttribute('aria-pressed', String(picking));
    button('clone-pick').textContent = picking ? '복제할 곳을 클릭하세요' : '복제 기준 고르기';
    el('clone-info').textContent = !cloneSource ? 'Alt + 클릭 또는 기준점 고르기로 원본 위치를 지정하세요.'
      : `읽는 기준 x ${cloneSource[0]} · y ${cloneSource[1]}${cloneDestination && input('clone-aligned').checked ? ` · 간격 ${cloneDestination[0] - cloneSource[0]}, ${cloneDestination[1] - cloneSource[1]}` : ' · 다음 획에서 목적지 기준 지정'}`;
  }
  button('clone-pick').onclick = () => attempt(() => { finish(); beforeAction(); picking = !picking; chooseTool('clone'); syncClone(); });
  button('clone-use').onclick = () => attempt(() => { finish(); beforeAction(); chooseTool('clone'); });
  button('clone-set-source').onclick = () => attempt(() => {
    finish(); const doc = host.document(); setSource([integer('clone-source-x', 0, doc.width - 1), integer('clone-source-y', 0, doc.height - 1)]); chooseTool('clone');
  });
  button('clone-clear').onclick = () => { cancel(); cloneSource = cloneDestination = undefined; syncClone(); drawOverlays(); };
  input('clone-aligned').onchange = () => { cloneDestination = undefined; syncClone(); drawOverlays(); };

  function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) {
    const node = document.createElementNS(svgNS, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); return node;
  }
  function drawOverlays() {
    const doc = host.document(), tool = select('paint-tool').value, wrapping = wrap();
    if (!doc) { for (const { overlay } of overlays) overlay.style.display = 'none'; return; }
    for (const { surface, overlay } of overlays) {
      const { canvas, tile } = surface, elements: SVGElement[] = [], sx = tile ? doc.width : 0, sy = tile ? doc.height : 0;
      overlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
      overlay.style.width = canvas.style.width || `${canvas.width}px`; overlay.style.height = canvas.style.height || `${canvas.height}px`;
      const scale = canvas.getBoundingClientRect().width / canvas.width || 1, line = { 'vector-effect': 'non-scaling-stroke', 'stroke-width': 1.2 };
      const offsets = tile || wrapping ? [-1, 0, 1] : [0];
      if (tool === 'cluster' && hover && (!tile || wrapping)) {
        const current = brush(), flipX = input('cluster-flip-x').checked, flipY = input('cluster-flip-y').checked, rotation = Number(select('cluster-rotation').value);
        const u = flipX ? current.width - 1 - current.anchor[0] : current.anchor[0], v = flipY ? current.height - 1 - current.anchor[1] : current.anchor[1];
        const pivot = rotation === 90 ? [current.height - 1 - v, u] : rotation === 180 ? [current.width - 1 - u, current.height - 1 - v]
          : rotation === 270 ? [v, current.width - 1 - u] : [u, v];
        const width = rotation % 180 ? current.height : current.width, height = rotation % 180 ? current.width : current.height;
        const px = wrapping ? modulo(hover.point.x, doc.width) : hover.point.x, py = wrapping ? modulo(hover.point.y, doc.height) : hover.point.y;
        for (const y of offsets) for (const x of offsets) elements.push(svg('rect', { x: px - pivot[0] + sx + x * doc.width, y: py - pivot[1] + sy + y * doc.height,
          width, height, fill: 'none', stroke: '#d1e9b9', 'stroke-dasharray': '4 3', ...line }));
      }
      if (tool === 'clone' && cloneSource && (!tile || wrapping)) {
        let point: [number, number] = [...cloneSource];
        const target = stroke?.tool === 'clone' ? stroke.to : input('clone-aligned').checked ? cloneDestination : undefined;
        if (hover && target && !picking) point = [hover.point.x + cloneSource[0] - target[0], hover.point.y + cloneSource[1] - target[1]];
        if (wrapping) point = [modulo(point[0], doc.width), modulo(point[1], doc.height)];
        for (const y of offsets) for (const x of offsets) {
          const cx = point[0] + .5 + sx + x * doc.width, cy = point[1] + .5 + sy + y * doc.height, r = 6 / scale;
          elements.push(svg('path', { d: `M ${cx - r} ${cy} H ${cx + r} M ${cx} ${cy - r} V ${cy + r}`, fill: 'none', stroke: '#8ee2ed', ...line }));
          elements.push(svg('circle', { cx, cy, r: 3 / scale, fill: 'none', stroke: '#102832', ...line }));
        }
      }
      overlay.replaceChildren(...elements); overlay.style.display = elements.length ? '' : 'none';
    }
  }
  function sync() {
    const doc = host.document();
    if (!doc) return;
    if (stroke && stroke.owner !== doc) cancel();
    const nextDimensions = `${doc.width}x${doc.height}`;
    if (dimensions !== nextDimensions) { dimensions = nextDimensions; cloneSource = cloneDestination = undefined; picking = false; hover = undefined; }
    const tool = select('paint-tool').value, cluster = tool === 'cluster';
    for (const id of ['paint-size', 'paint-tip', 'pixel-perfect', 'paint-symmetry']) (el(id) as HTMLInputElement | HTMLSelectElement).disabled = cluster;
    input('paint-color').disabled = pixelArtClusterTools.has(tool);
    if (cluster) { (el('cluster-panel') as HTMLDetailsElement).open = true; el('paint-hint').textContent = '선택한 여러 색의 픽셀 묶음을 그대로 배치합니다. 간격·90° 회전·반전·기준점을 조절할 수 있습니다.'; }
    if (tool === 'clone') { (el('clone-panel') as HTMLDetailsElement).open = true; el('paint-hint').textContent = picking || !cloneSource
      ? '복제할 원본 위치를 클릭하세요. 색은 바뀌지 않습니다. Escape: 기준 선택 취소.' : 'Alt + 클릭: 복제 원본 기준 · 드래그: 현재 그림의 픽셀 복제 · 한 획 안에서는 원본을 고정해 읽습니다.'; }
    syncClone(); drawOverlays();
  }
  select('paint-tool').addEventListener('change', () => attempt(() => {
    if (stroke) finish(); if (select('paint-tool').value !== 'clone') picking = false;
    if (pixelArtClusterTools.has(select('paint-tool').value) && select('view').value !== 'color') { select('view').value = 'color'; select('view').dispatchEvent(new Event('change')); }
    sync();
  }));
  input('paint-wrap').addEventListener('change', () => attempt(() => { finish(); cloneDestination = undefined; sync(); }));
  window.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
    if (event.key === 'Escape' && (stroke || picking)) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'c') { event.preventDefault(); attempt(() => { finish(); beforeAction(); chooseTool(event.key.toLowerCase() === 'j' ? 'cluster' : 'clone'); }); }
  }, { capture: true });
  showBrush(); sync();
  return { finish, cancel, sync };
}
