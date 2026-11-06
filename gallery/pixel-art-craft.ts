import { hex } from '../src/core/color.js';
import type { PixelBrushPoint2D, PixelBrushSymmetry2D } from '../src/core/pixel-brush.js';
import { sculptPixelHeight2D } from '../src/core/pixel-sculpt.js';
import type { PixelArtPathOptions2D } from '../src/core/pixel-path.js';
import { nextPixelArtLayerId2D, renderPixelArtDocument2D, renderPixelArtAuthoredHeight2D, writePixelArtHeightLayer2D,
  type PixelArtDocument2D, type PixelArtDocumentRaster2D, type PixelArtHeightLayer2D, type PixelArtPathLayer2D } from '../src/authoring/pixel-art-document.js';
import { pixelArtLayerLimit2D } from '../src/authoring/pixel-art-project.js';
import { createPixelCraftStudy2D } from '../src/examples/pixel-craft-study.js';
import type { PixelArtWorkbenchHost } from './pixel-art-workbench.js';

export const craftDrawingTools = new Set(['height-raise', 'height-lower', 'height-flatten', 'height-smooth', 'path']);
type NativePoint = [number, number];
type PathNode = { point: NativePoint; in?: NativePoint; out?: NativePoint };
type HeightMode = 'raise' | 'lower' | 'flatten' | 'smooth';
const el = (id: string) => document.getElementById(id)!;
const input = (id: string) => el(id) as HTMLInputElement;
const choice = (id: string) => el(id) as HTMLSelectElement;
const button = (id: string) => el(id) as HTMLButtonElement;
const number = (id: string, low: number, high: number, integer = false) => {
  const value = Number(input(id).value);
  if (!Number.isFinite(value) || value < low || value > high || integer && !Number.isInteger(value))
    throw new RangeError(`${input(id).getAttribute('aria-label') ?? id}: ${low}~${high}${integer ? ' 범위의 정수' : ' 범위의 값'}를 입력해 주세요.`);
  return value;
};
const sameMask = (a: ArrayLike<number> | undefined, b: ArrayLike<number>, count: number) => {
  if (a && a.length !== count) return false;
  for (let i = 0; i < count; i++) if (!!a?.[i] !== !!b[i]) return false;
  return true;
};
const cssColor = (c: number) => '#' + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map(v => v.toString(16).padStart(2, '0')).join('');

/** Geometry painting and editable native paths. Guides live above the image and are never exported. */
export function installPixelArtCraft(host: PixelArtWorkbenchHost) {
  const result = el('result') as HTMLCanvasElement, toolSelect = choice('paint-tool');
  const svgNS = 'http://www.w3.org/2000/svg', overlay = document.createElementNS(svgNS, 'svg');
  overlay.classList.add('craft-overlay'); overlay.setAttribute('aria-hidden', 'true');
  result.parentElement!.append(overlay);
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); } };
  let queued: number | undefined, lastTool = toolSelect.value, synchronizing = false;
  let hover: PixelBrushPoint2D | undefined;
  let stroke: {
    pointer: number; owner: PixelArtDocument2D; document: PixelArtDocument2D; source: PixelArtDocumentRaster2D;
    points: PixelBrushPoint2D[]; layerId?: string; result?: ReturnType<typeof sculptPixelHeight2D>;
    options: Parameters<typeof sculptPixelHeight2D>[2];
  } | undefined;
  let path: {
    owner: PixelArtDocument2D; document: PixelArtDocument2D; layerId?: string; nodes: PathNode[]; selected: number;
    selection?: number[]; protectedMask: number[]; alphaLock: boolean; candidate?: PixelArtDocument2D; dirty: boolean;
  } | undefined;
  let drag: { pointer: number; index: number; part: 'point' | 'in' | 'out' | 'create'; start: NativePoint; nodes: PathNode[] } | undefined;
  let heightEdit: { owner: PixelArtDocument2D; document: PixelArtDocument2D; layer: PixelArtHeightLayer2D; dirty: boolean } | undefined;

  function setView(view: string) { choice('view').value = view; choice('view').dispatchEvent(new Event('change')); }
  function selectTool(tool: string) {
    toolSelect.value = tool;
    toolSelect.dispatchEvent(new Event('change'));
    host.refresh();
  }
  function nativePoint(event: PointerEvent, pressure = false): PixelBrushPoint2D {
    const rect = result.getBoundingClientRect();
    return { x: Math.floor((event.clientX - rect.left) * result.width / rect.width), y: Math.floor((event.clientY - rect.top) * result.height / rect.height),
      ...(pressure && event.pointerType === 'pen' && input('pen-pressure').checked ? { pressure: event.pressure } : {}) };
  }
  function pathPoint(event: PointerEvent): NativePoint {
    const rect = result.getBoundingClientRect(), snap = (v: number) => Math.round(v * 2) / 2;
    return [snap((event.clientX - rect.left) * result.width / rect.width), snap((event.clientY - rect.top) * result.height / rect.height)];
  }
  function release(pointer: number | undefined) { if (pointer !== undefined && result.hasPointerCapture(pointer)) result.releasePointerCapture(pointer); }
  function cancelQueue() { if (queued !== undefined) cancelAnimationFrame(queued); queued = undefined; }
  function schedulePreview() {
    if (queued !== undefined) return;
    queued = requestAnimationFrame(() => { queued = undefined; attempt(() => { if (stroke) previewSculpt(); else if (path) previewPath(); }); });
  }
  function canReuseHeightLayer(doc: PixelArtDocument2D, wrap: boolean, protection: Uint8Array): string | undefined {
    const active = doc.layers.find(layer => layer.id === doc.activeLayerId);
    if (active?.kind === 'height' && (active.locked || active.visible === false)) throw new Error('선택한 높이 레이어의 표시와 잠금을 확인해 주세요.');
    const last = doc.layers.at(-1);
    return last?.kind === 'height' && doc.activeLayerId === last.id && !last.locked && last.visible !== false
      && (last.strength ?? 1) === 1 && !!last.wrap === wrap && sameMask(last.protectedMask, protection, doc.width * doc.height) ? last.id : undefined;
  }
  function previewSculpt() {
    if (!stroke) return;
    stroke.result = sculptPixelHeight2D(stroke.source, stroke.points, stroke.options);
    host.preview(stroke.result.sprite);
    syncOverlay();
  }
  function finishSculpt() {
    if (!stroke) return;
    cancelQueue(); previewSculpt();
    const completed = stroke; stroke = undefined; release(completed.pointer);
    if (completed.owner !== host.document()) { host.preview(undefined); return; }
    try {
      if (completed.result?.touched.some(Boolean)) {
        const next = writePixelArtHeightLayer2D(completed.document, completed.result.deltas, completed.result.touched, completed.layerId,
          { wrap: completed.options?.wrap, protectedMask: completed.options?.protectedMask });
        host.commit(next);
      } else {
        host.preview(undefined);
        host.status('높이를 바꿀 셀이 없습니다. 먼저 색을 그리거나 선택·보호 영역과 붓 세기를 확인하세요.');
      }
    } catch (error) { host.preview(undefined); throw error; }
    syncOverlay();
  }
  function cancelSculpt() {
    cancelQueue(); const old = stroke; stroke = undefined; release(old?.pointer); host.preview(undefined); syncOverlay();
  }
  function startSculpt(event: PointerEvent) {
    finishPath(); finishHeightEdit();
    const doc = host.outputDocument(), source = renderPixelArtDocument2D(doc);
    const p = nativePoint(event, true);
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    const height = source.channels ? undefined : renderPixelArtAuthoredHeight2D(doc);
    if (event.altKey) {
      input('sculpt-target').value = String(source.channels?.height[p.y * source.w + p.x] ?? height?.[p.y * source.w + p.x] ?? 0);
      showValues(); host.status('이 셀의 높이를 목표 높이로 가져왔습니다.'); return;
    }
    const protection = host.protection().slice(), wrap = input('sculpt-wrap').checked, layerId = canReuseHeightLayer(doc, wrap, protection);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError('높이 레이어를 추가할 공간이 없습니다. 맨 위의 높이 레이어를 선택하거나 현재 모습을 구워 주세요.');
    stroke = { pointer: event.pointerId, owner: host.document(), document: doc, source, points: [p], layerId,
      options: { mode: toolSelect.value.slice(7) as HeightMode, size: number('sculpt-size', 1, 256, true), strength: number('sculpt-strength', 0, 64),
        hardness: number('sculpt-hardness', 0, 1), targetHeight: number('sculpt-target', -1e6, 1e6),
        symmetry: choice('paint-symmetry').value as PixelBrushSymmetry2D, wrap,
        ...(input('paint-in-selection').checked ? { selection: host.selection().slice() } : {}), protectedMask: protection, ...(height ? { height } : {}) } };
    result.setPointerCapture(event.pointerId); previewSculpt();
  }

  function pathOptions(): PixelArtPathOptions2D {
    const closed = input('path-closed').checked;
    return { closed, fill: input('path-fill').checked, strokeWidth: number('path-width', 0, 256),
      ...(input('path-taper').checked && !closed ? { startWidth: number('path-start-width', 0, 256), endWidth: number('path-end-width', 0, 256) } : {}),
      pixelPerfect: input('pixel-perfect').checked, symmetry: choice('paint-symmetry').value as PixelBrushSymmetry2D };
  }
  function pathReady(): boolean {
    if (!path?.nodes.length) return false;
    return input('path-fill').checked || (input('path-taper').checked && !input('path-closed').checked
      ? Number(input('path-start-width').value) > 0 || Number(input('path-end-width').value) > 0 : Number(input('path-width').value) > 0);
  }
  function pathDocument(): PixelArtDocument2D {
    if (!path) throw new Error('먼저 경로의 점을 추가해 주세요.');
    const existing = path.document.layers.find(layer => layer.id === path!.layerId), id = path.layerId ?? nextPixelArtLayerId2D(path.document, 'path');
    const layer: PixelArtPathLayer2D = { ...(existing ?? { id, name: '직접 그린 곡선' }), kind: 'path', nodes: structuredClone(path.nodes), options: pathOptions(),
      color: ((hex(input('paint-color').value) & 0xffffff) | number('path-alpha', 0, 255, true) << 24) >>> 0,
      selection: path.selection?.slice(), protectedMask: path.protectedMask.slice(), alphaLock: path.alphaLock };
    return { ...path.document, activeLayerId: id, layers: existing ? path.document.layers.map(old => old.id === id ? layer : old) : [...path.document.layers, layer] };
  }
  function previewPath() {
    if (!path) return;
    if (pathReady()) {
      const next = pathDocument(), raster = renderPixelArtDocument2D(next);
      path.candidate = next; host.preview(raster);
    } else { path.candidate = undefined; host.preview(undefined); }
    syncPathControls(); syncOverlay();
  }
  function newPath() {
    finishSculpt(); finishHeightEdit();
    const doc = host.outputDocument();
    if (doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError('경로 레이어를 추가할 공간이 없습니다. 기존 경로를 수정하거나 현재 모습을 구워 주세요.');
    path = { owner: host.document(), document: doc, nodes: [], selected: -1, dirty: false,
      ...(input('paint-in-selection').checked ? { selection: Array.from(host.selection()) } : {}), protectedMask: Array.from(host.protection()), alphaLock: input('alpha-lock').checked };
    (el('path-craft-panel') as HTMLDetailsElement).open = true;
    syncPathControls(); syncOverlay();
  }
  function finishPath() {
    if (!path) return;
    cancelQueue(); const oldDrag = drag; drag = undefined; release(oldDrag?.pointer);
    if (path.owner !== host.document()) { path = undefined; host.preview(undefined); return; }
    if (!path.nodes.length || !path.dirty) { path = undefined; host.preview(undefined); syncPathControls(); syncOverlay(); return; }
    if (!pathReady()) throw new Error('선을 그리려면 굵기를 0보다 크게 정하거나 닫힌 모양의 채우기를 켜 주세요.');
    const next = pathDocument();
    // Validate and render before discarding the editable draft. Rejected input remains reviewable.
    renderPixelArtDocument2D(next);
    const pending = path;
    try { host.commit(next); path = undefined; }
    catch (error) {
      if (host.document() === pending.owner) { path = pending; host.preview(renderPixelArtDocument2D(next)); }
      else { path = undefined; host.preview(undefined); }
      syncPathControls(); syncOverlay(); throw error;
    }
    syncPathControls(); syncOverlay();
  }
  function cancelPath() {
    cancelQueue(); const old = drag; drag = undefined; path = undefined; release(old?.pointer); host.preview(undefined); syncPathControls(); syncOverlay();
  }
  function hitNode(event: PointerEvent): { index: number; part: 'point' | 'in' | 'out' } | undefined {
    if (!path) return;
    const rect = result.getBoundingClientRect(), sx = rect.width / result.width, sy = rect.height / result.height;
    const distance = (p: NativePoint) => Math.hypot(rect.left + p[0] * sx - event.clientX, rect.top + p[1] * sy - event.clientY);
    const candidates: { index: number; part: 'point' | 'in' | 'out'; distance: number }[] = [];
    const selected = path.nodes[path.selected];
    if (selected) {
      candidates.push({ index: path.selected, part: 'point', distance: distance(selected.point) });
      for (const part of ['in', 'out'] as const) if (selected[part]) candidates.push({ index: path.selected, part, distance: distance(selected[part]!) });
    }
    path.nodes.forEach((node, index) => { if (index !== path!.selected) candidates.push({ index, part: 'point', distance: distance(node.point) }); });
    const nearest = candidates.filter(candidate => candidate.distance <= 8).sort((a, b) => a.distance - b.distance + (a.distance === b.distance ? Number(a.part !== 'point') - Number(b.part !== 'point') : 0))[0];
    if (nearest) return { index: nearest.index, part: nearest.part };
  }
  function startPath(event: PointerEvent) {
    finishSculpt(); finishHeightEdit();
    if (!path) newPath();
    const p = pathPoint(event), hit = hitNode(event), before = structuredClone(path!.nodes);
    if (!hit && (p[0] < 0 || p[1] < 0 || p[0] > result.width || p[1] > result.height)) return;
    if (!hit && path!.nodes.length >= 1024) throw new RangeError('한 경로에는 점을 1024개까지 둘 수 있습니다.');
    if (!hit) { path!.nodes.push({ point: p }); path!.selected = path!.nodes.length - 1; path!.dirty = true; }
    else path!.selected = hit.index;
    drag = { pointer: event.pointerId, index: path!.selected, part: hit?.part ?? 'create', start: p, nodes: before };
    result.setPointerCapture(event.pointerId); previewPath();
  }
  function movePath(event: PointerEvent) {
    if (!path || !drag || drag.pointer !== event.pointerId) return;
    const p = pathPoint(event), node = path.nodes[drag.index];
    if (drag.part === 'create') {
      if (Math.hypot(p[0] - node.point[0], p[1] - node.point[1]) < .5) return;
      node.out = p; node.in = [2 * node.point[0] - p[0], 2 * node.point[1] - p[1]];
    } else if (drag.part === 'point') {
      const original = drag.nodes[drag.index], dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      node.point = [original.point[0] + dx, original.point[1] + dy];
      if (original.in) node.in = [original.in[0] + dx, original.in[1] + dy];
      if (original.out) node.out = [original.out[0] + dx, original.out[1] + dy];
    } else {
      node[drag.part] = p;
      if (input('path-linked-handles').checked && !event.altKey) node[drag.part === 'in' ? 'out' : 'in'] = [2 * node.point[0] - p[0], 2 * node.point[1] - p[1]];
    }
    path.dirty = true; schedulePreview(); syncOverlay();
  }
  function finishPathDrag() {
    if (!drag) return;
    cancelQueue(); const previous = drag; drag = undefined; release(previous.pointer); previewPath();
  }
  function cancelPathDrag() {
    if (!drag || !path) return;
    cancelQueue(); const previous = drag; drag = undefined; path.nodes = previous.nodes; path.selected = Math.min(path.selected, path.nodes.length - 1);
    release(previous.pointer); previewPath();
  }
  function moveSelected(dx: number, dy: number) {
    if (!path || path.selected < 0) return;
    const node = path.nodes[path.selected];
    for (const part of ['point', 'in', 'out'] as const) if (node[part]) node[part] = [node[part]![0] + dx, node[part]![1] + dy];
    path.dirty = true; previewPath();
  }
  function selectedKind(smooth: boolean) {
    if (!path || path.selected < 0) return;
    const i = path.selected, node = path.nodes[i];
    if (!smooth) { delete node.in; delete node.out; }
    else {
      const previous = path.nodes[i - 1]?.point ?? node.point, next = path.nodes[i + 1]?.point ?? node.point;
      let dx = (next[0] - previous[0]) / 6, dy = (next[1] - previous[1]) / 6;
      if (Math.hypot(dx, dy) < 1) { dx = Math.max(2, result.width / 12); dy = 0; }
      node.in = [node.point[0] - dx, node.point[1] - dy]; node.out = [node.point[0] + dx, node.point[1] + dy];
    }
    path.dirty = true; previewPath();
  }
  function removeSelected() {
    if (!path || path.selected < 0) return;
    path.nodes.splice(path.selected, 1); path.selected = Math.min(path.selected, path.nodes.length - 1); path.dirty = true; previewPath();
  }

  function heightDocument(): PixelArtDocument2D {
    if (!heightEdit) throw new Error('먼저 높이 레이어를 선택하세요.');
    const strength = number('height-layer-strength', 0, 4);
    return { ...heightEdit.document, activeLayerId: heightEdit.layer.id,
      layers: heightEdit.document.layers.map(layer => layer.id === heightEdit!.layer.id ? { ...heightEdit!.layer, strength } : layer) };
  }
  function finishHeightEdit() {
    if (!heightEdit) return;
    if (heightEdit.owner !== host.document() || !heightEdit.dirty) { heightEdit = undefined; host.preview(undefined); showValues(); return; }
    const next = heightDocument(); renderPixelArtDocument2D(next);
    const pending = heightEdit;
    try { host.commit(next); heightEdit = undefined; }
    catch (error) {
      if (host.document() === pending.owner) { heightEdit = pending; host.preview(renderPixelArtDocument2D(next)); }
      else { heightEdit = undefined; host.preview(undefined); }
      showValues(); throw error;
    }
    showValues();
  }
  function cancelHeightEdit() { heightEdit = undefined; host.preview(undefined); showValues(); }
  function editLayer(id: string) {
    finish();
    host.discardPreview();
    const doc = host.outputDocument(), layer = doc.layers.find(layer => layer.id === id);
    if (!layer || layer.kind !== 'path' && layer.kind !== 'height') throw new Error('선택한 곡선 또는 높이 레이어를 찾을 수 없습니다.');
    if (layer.locked || layer.visible === false) throw new Error('레이어의 표시와 잠금을 확인한 뒤 수정하세요.');
    if (layer.kind === 'path') {
      selectTool('path');
      input('paint-color').value = cssColor(layer.color);
      input('path-alpha').value = String(layer.color >>> 24);
      input('path-closed').checked = layer.options.closed ?? false; input('path-fill').checked = layer.options.fill ?? false;
      input('path-width').value = String(layer.options.closed ? layer.options.startWidth ?? layer.options.strokeWidth ?? 1 : layer.options.strokeWidth ?? 1);
      input('path-start-width').value = String(layer.options.startWidth ?? layer.options.strokeWidth ?? 1);
      input('path-end-width').value = String(layer.options.endWidth ?? layer.options.strokeWidth ?? 1);
      input('path-taper').checked = !layer.options.closed && ((layer.options.startWidth ?? layer.options.strokeWidth ?? 1) !== (layer.options.strokeWidth ?? 1)
        || (layer.options.endWidth ?? layer.options.strokeWidth ?? 1) !== (layer.options.strokeWidth ?? 1));
      input('pixel-perfect').checked = layer.options.pixelPerfect ?? false;
      choice('paint-symmetry').value = layer.options.symmetry ?? 'none';
      input('alpha-lock').checked = layer.alphaLock ?? false; input('paint-in-selection').checked = !!layer.selection;
      path = { owner: host.document(), document: doc, layerId: layer.id, nodes: structuredClone(layer.nodes) as PathNode[], selected: layer.nodes.length ? 0 : -1,
        ...(layer.selection ? { selection: layer.selection.slice() } : {}), protectedMask: layer.protectedMask?.slice() ?? Array.from(host.protection()), alphaLock: layer.alphaLock ?? false, dirty: false };
      if (layer.selection) host.setSelection(Uint8Array.from(layer.selection));
      (el('path-craft-panel') as HTMLDetailsElement).open = true;
      previewPath();
    } else {
      selectTool('height-raise');
      heightEdit = { owner: host.document(), document: doc, layer, dirty: false };
      input('height-layer-strength').value = String(layer.strength ?? 1);
      el('height-layer-name').textContent = layer.name;
      (el('height-craft-panel') as HTMLDetailsElement).open = true;
      showValues();
    }
  }

  function showValues() {
    el('sculpt-hardness-value').textContent = `${Math.round(Number(input('sculpt-hardness').value) * 100)}%`;
    el('height-layer-strength-value').textContent = `${Number(input('height-layer-strength').value).toFixed(2)}×`;
    el('height-layer-editor').hidden = !heightEdit;
    const mode = toolSelect.value.slice(7), blended = mode === 'flatten' || mode === 'smooth';
    el('sculpt-strength-note').textContent = blended ? '맞추기·정리는 0~1 혼합 강도입니다. 1보다 큰 값은 완전 적용으로 처리합니다.' : '올리기·내리기의 세기는 네이티브 픽셀 높이입니다. 한 획 안에서 겹쳐도 중복 가산하지 않습니다.';
    for (const item of document.querySelectorAll<HTMLButtonElement>('[data-craft-tool]')) item.setAttribute('aria-pressed', String(item.dataset.craftTool === toolSelect.value));
  }
  let nodeOptionsKey = '';
  function syncPathControls() {
    const nodes = path?.nodes ?? [], selected = path?.selected ?? -1, closed = input('path-closed').checked;
    input('path-taper').disabled = closed;
    input('path-start-width').disabled = closed || !input('path-taper').checked;
    input('path-end-width').disabled = closed || !input('path-taper').checked;
    const key = `${nodes.length}:${selected}`;
    if (key !== nodeOptionsKey) {
      nodeOptionsKey = key;
      const select = choice('path-node'); select.replaceChildren(...nodes.map((_, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `점 ${i + 1}`; return option; }));
      select.value = String(selected); select.disabled = !nodes.length;
    }
    for (const id of ['path-corner', 'path-smooth', 'path-delete', 'path-x', 'path-y']) (el(id) as HTMLInputElement | HTMLButtonElement).disabled = selected < 0;
    const point = nodes[selected]?.point;
    if (point) for (const [id, value] of [['path-x', point[0]], ['path-y', point[1]]] as const) if (document.activeElement !== input(id)) input(id).value = String(Math.round(value * 1000) / 1000);
    button('path-apply').disabled = !pathReady(); button('path-cancel').disabled = !path;
    button('path-apply').textContent = path?.layerId ? '경로 수정 적용' : '경로 레이어 적용';
    el('path-info').textContent = !path ? '오른쪽 그림을 클릭해 점을 추가하세요. 누른 채 드래그하면 곡선 핸들이 생깁니다.'
      : `${path.layerId ? '기존 경로 수정' : '새 경로'} · ${nodes.length}개 점${selected >= 0 ? ` · 선택 ${selected + 1}` : ''} · Enter 적용 / Escape 취소 · 방향키로 점 이동`;
  }
  function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) {
    const node = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  }
  function syncOverlay() {
    const rect = result.getBoundingClientRect(), scale = rect.width / result.width || 1;
    overlay.setAttribute('viewBox', `0 0 ${result.width} ${result.height}`);
    overlay.style.width = result.style.width; overlay.style.height = result.style.height;
    const elements: SVGElement[] = [], line = { 'vector-effect': 'non-scaling-stroke', 'stroke-width': 1.2 };
    if (path && toolSelect.value === 'path') {
      let d = '';
      path.nodes.forEach((node, i) => {
        if (!i) { d = `M ${node.point.join(' ')}`; return; }
        const previous = path!.nodes[i - 1];
        d += previous.out || node.in ? ` C ${(previous.out ?? previous.point).join(' ')} ${(node.in ?? node.point).join(' ')} ${node.point.join(' ')}` : ` L ${node.point.join(' ')}`;
      });
      if (path.nodes.length && input('path-closed').checked) {
        const first = path.nodes[0], last = path.nodes.at(-1)!;
        d += ` C ${(last.out ?? last.point).join(' ')} ${(first.in ?? first.point).join(' ')} ${first.point.join(' ')}`;
      }
      if (d) elements.push(svg('path', { d, fill: 'none', stroke: '#dcf5cb', 'stroke-dasharray': '4 4', ...line }));
      const selected = path.nodes[path.selected];
      if (selected) for (const part of ['in', 'out'] as const) {
        const p = selected[part]; if (!p) continue;
        elements.push(svg('line', { x1: selected.point[0], y1: selected.point[1], x2: p[0], y2: p[1], stroke: '#90cfff', ...line }));
        elements.push(svg('circle', { cx: p[0], cy: p[1], r: 4 / scale, fill: '#18394e', stroke: '#bce3ff', ...line }));
      }
      path.nodes.forEach((node, i) => {
        const half = (i === path!.selected ? 4 : 3) / scale;
        elements.push(svg('rect', { x: node.point[0] - half, y: node.point[1] - half, width: half * 2, height: half * 2,
          fill: i === path!.selected ? '#d3f2b9' : '#172a23', stroke: '#d3f2b9', ...line }));
      });
    } else if (toolSelect.value.startsWith('height-') && hover) {
      const fullSize = Number(input('sculpt-size').value), size = Math.max(1, fullSize * (hover.pressure ?? 1)), wrap = input('sculpt-wrap').checked;
      const anchor = fullSize % 2 ? .5 : 1;
      for (const oy of wrap ? [-result.height, 0, result.height] : [0]) for (const ox of wrap ? [-result.width, 0, result.width] : [0]) {
        elements.push(svg('circle', { cx: hover.x + anchor + ox, cy: hover.y + anchor + oy, r: size / 2, fill: 'none', stroke: '#d9f2c4', ...line }));
      }
    }
    overlay.replaceChildren(...elements);
    overlay.style.display = elements.length ? '' : 'none';
  }
  function finish() { finishSculpt(); finishPathDrag(); finishPath(); finishHeightEdit(); }
  function cancel() { cancelQueue(); const oldStroke = stroke, oldDrag = drag; stroke = undefined; drag = undefined; path = undefined; heightEdit = undefined; release(oldStroke?.pointer); release(oldDrag?.pointer); host.preview(undefined); showValues(); syncPathControls(); syncOverlay(); }
  function sync() {
    if (synchronizing) return;
    synchronizing = true;
    try {
      if (stroke && stroke.owner !== host.document() || path && path.owner !== host.document() || heightEdit && heightEdit.owner !== host.document()) cancel();
      const tool = toolSelect.value;
      if (lastTool !== tool) {
        if (path && tool !== 'path') attempt(finishPath);
        if (stroke) attempt(finishSculpt);
        lastTool = tool;
      }
      showValues(); syncPathControls(); syncOverlay();
      if (tool === 'path') el('paint-hint').textContent = '클릭: 점 추가 · 드래그: 곡선 핸들 · 점/핸들 이동 · Enter: 적용 · Escape: 취소';
      else if (tool.startsWith('height-')) el('paint-hint').textContent = '색과 투명도를 보존하고 표면 높이를 직접 만듭니다. Alt + 클릭: 목표 높이 추출. 보호·선택·대칭을 적용합니다.';
    } finally { synchronizing = false; }
  }

  result.addEventListener('pointerdown', event => attempt(() => {
    if (event.button !== 0 || !craftDrawingTools.has(toolSelect.value)) return;
    event.preventDefault();
    if (toolSelect.value === 'path') startPath(event); else startSculpt(event);
  }));
  result.addEventListener('pointermove', event => attempt(() => {
    hover = nativePoint(event, true);
    if (stroke && stroke.pointer === event.pointerId) {
      const samples = event.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [event]) {
        const p = nativePoint(sample, true), last = stroke.points.at(-1)!;
        if (last.x !== p.x || last.y !== p.y || last.pressure !== p.pressure) stroke.points.push(p);
      }
      schedulePreview();
    } else if (drag) movePath(event);
    syncOverlay();
  }));
  result.addEventListener('pointerup', event => attempt(() => {
    if (stroke?.pointer === event.pointerId) {
      const p = nativePoint(event, true), last = stroke.points.at(-1)!;
      if (event.pointerType === 'pen') p.pressure = last.pressure;
      if (last.x !== p.x || last.y !== p.y) stroke.points.push(p);
      finishSculpt();
    } else if (drag?.pointer === event.pointerId) { movePath(event); finishPathDrag(); }
  }));
  result.addEventListener('pointercancel', () => { if (stroke) cancelSculpt(); if (drag) cancelPathDrag(); });
  result.addEventListener('lostpointercapture', () => { if (stroke) cancelSculpt(); if (drag) cancelPathDrag(); });
  result.addEventListener('pointerleave', () => { if (!stroke && !drag) { hover = undefined; syncOverlay(); } });
  toolSelect.addEventListener('change', () => attempt(() => {
    const tool = toolSelect.value;
    if (path && tool !== 'path') finishPath();
    if (stroke) finishSculpt();
    if (heightEdit && !tool.startsWith('height-')) finishHeightEdit();
    if (tool.startsWith('height-')) {
      (el('height-craft-panel') as HTMLDetailsElement).open = true;
      if (!lastTool.startsWith('height-') && choice('view').value === 'color') setView('height');
    } else if (tool === 'path') { (el('path-craft-panel') as HTMLDetailsElement).open = true; if (choice('view').value !== 'color') setView('color'); }
    lastTool = tool; sync();
  }));
  for (const item of document.querySelectorAll<HTMLButtonElement>('[data-craft-tool]')) item.onclick = () => attempt(() => selectTool(item.dataset.craftTool!));
  for (const item of document.querySelectorAll<HTMLButtonElement>('[data-craft-view]')) item.onclick = () => setView(item.dataset.craftView!);
  for (const kind of ['plume', 'folds'] as const) button(`craft-study-${kind}`).onclick = () => attempt(() => {
    cancel(); host.discardPreview();
    host.newCanvas(createPixelCraftStudy2D(kind));
    input('paint-in-selection').checked = false; input('alpha-lock').checked = false;
    selectTool('inspect'); setView('color'); choice('zoom').value = 'auto'; choice('zoom').dispatchEvent(new Event('change'));
    el('craft-study-note').textContent = kind === 'plume' ? '깃 장식의 곡선 레이어를 고르고 설정을 열어 점·핸들을 수정해 보세요.' : '천의 높이 레이어를 고르고 배율을 조절하거나, 높이 붓으로 주름을 더해 보세요.';
  });
  for (const id of ['sculpt-size', 'sculpt-strength', 'sculpt-hardness', 'sculpt-target', 'sculpt-wrap']) input(id).addEventListener('input', () => { showValues(); syncOverlay(); });
  button('path-new').onclick = () => attempt(() => { finish(); selectTool('path'); newPath(); });
  button('path-apply').onclick = () => attempt(finishPath);
  button('path-cancel').onclick = cancelPath;
  button('path-corner').onclick = () => attempt(() => selectedKind(false));
  button('path-smooth').onclick = () => attempt(() => selectedKind(true));
  button('path-delete').onclick = () => attempt(removeSelected);
  choice('path-node').onchange = () => { if (path) { path.selected = Number(choice('path-node').value); syncPathControls(); syncOverlay(); } };
  for (const [id, axis] of [['path-x', 0], ['path-y', 1]] as const) input(id).onchange = () => attempt(() => {
    if (!path || path.selected < 0) return;
    const delta = number(id, -1_048_576, 1_048_576) - path.nodes[path.selected].point[axis];
    moveSelected(axis === 0 ? delta : 0, axis === 1 ? delta : 0);
  });
  for (const id of ['path-closed', 'path-fill', 'path-width', 'path-taper', 'path-start-width', 'path-end-width', 'path-alpha']) input(id).addEventListener('input', () => attempt(() => {
    if (id === 'path-fill' && input(id).checked) input('path-closed').checked = true;
    if (id === 'path-closed' && !input(id).checked) input('path-fill').checked = false;
    if (path) { path.dirty = true; previewPath(); } else syncPathControls();
  }));
  for (const id of ['paint-color', 'paint-symmetry', 'pixel-perfect', 'paint-in-selection', 'alpha-lock']) el(id).addEventListener('input', () => attempt(() => {
    if (path) {
      if (id === 'paint-in-selection') path.selection = input(id).checked ? Array.from(host.selection()) : undefined;
      if (id === 'alpha-lock') path.alphaLock = input(id).checked;
      path.dirty = true; previewPath();
    }
  }));
  input('height-layer-strength').oninput = () => attempt(() => {
    showValues(); if (!heightEdit) return;
    heightEdit.dirty = true; host.preview(renderPixelArtDocument2D(heightDocument()));
  });
  button('height-layer-apply').onclick = () => attempt(finishHeightEdit);
  button('height-layer-cancel').onclick = cancelHeightEdit;
  window.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
    if (event.key === 'Escape' && (stroke || path || heightEdit)) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); return; }
    if (event.key === 'Enter' && (path || heightEdit)) { event.preventDefault(); attempt(finish); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (toolSelect.value === 'path' && path) {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); attempt(removeSelected); return; }
      const step = event.shiftKey ? 10 : 1, delta: Record<string, NativePoint> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (delta[event.key]) { event.preventDefault(); attempt(() => moveSelected(...delta[event.key])); return; }
    }
    if (event.key.toLowerCase() === 'p' || event.key.toLowerCase() === 'h') { event.preventDefault(); attempt(() => selectTool(event.key.toLowerCase() === 'p' ? 'path' : 'height-raise')); }
  }, { capture: true });
  showValues(); syncPathControls();
  return { sync, finish, editLayer, cancel };
}
