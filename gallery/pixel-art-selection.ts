import { combinePixelSelections2D, rasterizePixelShape2D, type PixelSelectionOperation2D } from '../src/core/pixel-brush.js';
import { rasterizePixelLasso2D, pixelSelectionBounds2D } from '../src/core/pixel-selection.js';
import { transformPixelSelection2D, type PixelSelectionTransformOptions2D } from '../src/core/pixel-transform.js';
import { nextPixelArtLayerId2D, renderPixelArtDocument2D, type PixelArtDocument2D, type PixelArtDocumentRaster2D, type PixelArtTransformLayer2D } from '../src/authoring/pixel-art-document.js';
import type { PixelArtWorkbenchHost } from './pixel-art-workbench.js';

const el = (id: string) => document.getElementById(id)!;
const field = (id: string) => el(id) as HTMLInputElement;
const select = (id: string) => el(id) as HTMLSelectElement;
const button = (id: string) => el(id) as HTMLButtonElement;
export const selectionDrawingTools = new Set(['select-rectangle', 'select-ellipse', 'lasso', 'move']);

interface TranslationBase {
  layer: PixelArtTransformLayer2D;
  source: PixelArtDocumentRaster2D;
}
const sameMask = (a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined, count: number) => {
  if (a && a.length !== count || b && b.length !== count) return false;
  for (let i = 0; i < count; i++) if (!!a?.[i] !== !!b?.[i]) return false;
  return true;
};
const translationOnly = (transform: PixelSelectionTransformOptions2D) =>
  !transform.copy && !transform.flipX && !transform.flipY && (transform.quarterTurns ?? 0) === 0;

/** A nudge edits the selected object's last transform, not an unrelated selection or paint layer.
 * Render below that transform once per gesture; drag previews can reuse the proved native input. */
function translationBase(doc: PixelArtDocument2D, selected: Uint8Array, transform: PixelSelectionTransformOptions2D): TranslationBase | undefined {
  const layer = doc.layers.at(-1), boundary = transform.boundary ?? 'reject';
  if (!translationOnly(transform) || boundary === 'clip' || layer?.kind !== 'transform'
    || doc.activeLayerId !== layer.id || layer.locked || layer.visible === false || layer.transform.copy
    || (layer.transform.boundary ?? 'reject') !== boundary
    || !sameMask(layer.protectedMask, transform.protectedMask, selected.length)) return;
  const { activeLayerId, ...input } = doc;
  const source = renderPixelArtDocument2D({ ...input, layers: doc.layers.slice(0, -1) });
  const prior = transformPixelSelection2D(source, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask });
  if (!sameMask(prior.selection, selected, selected.length)) return;
  return { layer, source };
}

function translatedLayer(base: TranslationBase | undefined, transform: PixelSelectionTransformOptions2D) {
  if (!base || !translationOnly(transform) || (transform.boundary ?? 'reject') !== (base.layer.transform.boundary ?? 'reject')
    || !sameMask(base.layer.protectedMask, transform.protectedMask, base.source.pixels.length)) return;
  const previous = base.layer.transform.offset ?? [0, 0], step = transform.offset ?? [0, 0];
  const offset: [number, number] = [previous[0] + step[0], previous[1] + step[1]];
  if (transform.boundary === 'wrap') { offset[0] %= base.source.w; offset[1] %= base.source.h; }
  if (!offset.every(v => Number.isSafeInteger(v) && Math.abs(v) <= 1_048_576)) return;
  const layer: PixelArtTransformLayer2D = { ...base.layer, transform: { ...base.layer.transform, offset } };
  try {
    const result = transformPixelSelection2D(base.source, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask });
    return { layer, result };
  } catch (error) {
    // Never replace a valid current edit with an invalid combined mapping. It can still
    // be represented by a separate transform, with the ordinary boundary/protection checks.
    if (!(error instanceof RangeError)) throw error;
  }
}

/** Selection outlines are a separate overlay: canvas reads and exports remain exact artwork. */
export function installPixelArtSelection(host: PixelArtWorkbenchHost, finishPaint: () => void) {
  const canvas = el('result') as HTMLCanvasElement;
  const overlay = document.createElement('canvas');
  overlay.className = 'selection-overlay'; overlay.setAttribute('aria-hidden', 'true');
  canvas.parentElement!.append(overlay);
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(String(error instanceof Error ? error.message : error), true); } };
  let temporary: Uint8Array | undefined;
  let drag: { pointer: number; tool: string; points: { x: number; y: number }[]; original: Uint8Array;
    document: PixelArtDocument2D; source: PixelArtDocumentRaster2D; operation: PixelSelectionOperation2D;
    offset: [number, number]; translation?: TranslationBase; combinedLayer?: PixelArtTransformLayer2D;
    candidate?: ReturnType<typeof transformPixelSelection2D>; error?: string } | undefined;
  let queued: number | undefined;
  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.floor((event.clientX - rect.left) * canvas.width / rect.width), y: Math.floor((event.clientY - rect.top) * canvas.height / rect.height) };
  };
  const options = (): PixelSelectionTransformOptions2D => ({
    copy: field('transform-copy').checked, boundary: select('transform-boundary').value as PixelSelectionTransformOptions2D['boundary'],
    protectedMask: host.protection(),
  });
  function commitTransform(doc: PixelArtDocument2D, selected: Uint8Array, transform: PixelSelectionTransformOptions2D,
    result?: ReturnType<typeof transformPixelSelection2D>, combinedLayer?: PixelArtTransformLayer2D) {
    const combined = combinedLayer && result ? { layer: combinedLayer, result }
      : translatedLayer(translationBase(doc, selected, transform), transform);
    const changed = combined?.result ?? result ?? transformPixelSelection2D(renderPixelArtDocument2D(doc), selected, transform);
    if (!changed.touched.some(Boolean)) { host.preview(undefined); host.setSelection(changed.selection); return; }
    const { protectedMask, ...grid } = transform, id = combined?.layer.id ?? nextPixelArtLayerId2D(doc, 'transform');
    const layers = combined ? [...doc.layers.slice(0, -1), combined.layer] : [...doc.layers, {
      kind: 'transform' as const, id, name: grid.copy ? '선택 복제 / 변형' : '선택 이동 / 변형', selection: Array.from(selected),
      ...(protectedMask ? { protectedMask: Array.from(protectedMask) } : {}), transform: grid,
    }];
    try {
      host.commit({ ...doc, activeLayerId: id, selection: Array.from(changed.selection),
        layers });
    } finally { host.preview(undefined); }
    host.setSelection(changed.selection);
    if (changed.clipped) host.status(`명시한 자르기 설정으로 ${changed.clipped}개의 선택 셀이 캔버스 밖에서 잘렸습니다.`);
  }
  function transform(extra: PixelSelectionTransformOptions2D) {
    finishPaint(); finish();
    const doc = host.outputDocument(), selected = host.selection();
    if (!selected.some(Boolean)) throw new Error('먼저 옮기거나 변형할 영역을 선택하세요.');
    commitTransform(doc, selected, { ...options(), ...extra });
  }
  const bind = (id: string, operation: () => PixelSelectionTransformOptions2D) => {
    button(id).onclick = () => attempt(() => transform(operation()));
  };
  bind('transform-apply', () => {
    const offset: [number, number] = [Number(field('transform-x').value), Number(field('transform-y').value)];
    if (!offset.every(v => Number.isSafeInteger(v) && Math.abs(v) <= 1_048_576)) throw new Error('이동량은 정수 픽셀로 입력하세요.');
    return { offset };
  });
  bind('flip-selection-x', () => ({ flipX: true }));
  bind('flip-selection-y', () => ({ flipY: true }));
  bind('rotate-selection-left', () => ({ quarterTurns: 3 }));
  bind('rotate-selection-right', () => ({ quarterTurns: 1 }));

  function preview() {
    queued = undefined;
    if (!drag) return;
    const d = drag, a = d.points[0], b = d.points.at(-1)!;
    if (d.tool === 'move') {
      d.offset = [b.x - a.x, b.y - a.y];
      try {
        const transform = { ...options(), offset: d.offset }, combined = translatedLayer(d.translation, transform);
        d.candidate = combined?.result ?? transformPixelSelection2D(d.source, d.original, transform);
        d.combinedLayer = combined?.layer;
        d.error = undefined; temporary = d.candidate.selection; host.preview(d.candidate.sprite);
      } catch (error) {
        d.candidate = undefined; d.combinedLayer = undefined; d.error = error instanceof Error ? error.message : String(error);
        temporary = d.original; host.preview(d.source); host.status(d.error, true);
      }
    } else {
      const mask = d.tool === 'lasso'
        ? rasterizePixelLasso2D(d.source.w, d.source.h, d.points)
        : rasterizePixelShape2D(d.source.w, d.source.h, d.tool === 'select-rectangle' ? 'rectangle' : 'ellipse', [a.x, a.y], [b.x, b.y], { filled: true });
      temporary = combinePixelSelections2D(d.original, mask, d.operation);
      sync();
    }
  }
  function cancel() {
    if (queued !== undefined) cancelAnimationFrame(queued);
    queued = undefined; const previous = drag; drag = undefined; temporary = undefined;
    if (previous && canvas.hasPointerCapture(previous.pointer)) canvas.releasePointerCapture(previous.pointer);
    host.preview(undefined); sync();
  }
  function finish() {
    if (!drag) return;
    if (queued !== undefined) cancelAnimationFrame(queued);
    preview(); const completed = drag; drag = undefined;
    if (canvas.hasPointerCapture(completed.pointer)) canvas.releasePointerCapture(completed.pointer);
    const selected = temporary; temporary = undefined;
    if (completed.tool === 'move') {
      if (completed.candidate && completed.offset.some(Boolean)) commitTransform(completed.document, completed.original, { ...options(), offset: completed.offset }, completed.candidate, completed.combinedLayer);
      else { host.preview(undefined); if (completed.error) host.status(completed.error, true); }
    } else if (selected) host.setSelection(selected);
    sync();
  }
  canvas.addEventListener('pointerdown', event => attempt(() => {
    const tool = select('paint-tool').value;
    if (event.button !== 0 || !selectionDrawingTools.has(tool)) return;
    event.preventDefault(); finishPaint();
    const p = point(event), doc = host.outputDocument(), source = renderPixelArtDocument2D(doc);
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    if (tool === 'move' && !host.selection().some(Boolean)) throw new Error('먼저 선택 도구로 이동할 영역을 지정하세요.');
    const operation = event.shiftKey && event.altKey ? 'intersect' : event.shiftKey ? 'add' : event.altKey ? 'subtract' : select('selection-mode').value as PixelSelectionOperation2D;
    const original = host.selection().slice();
    drag = { pointer: event.pointerId, tool, points: [p], original, document: doc, source, operation, offset: [0, 0],
      translation: tool === 'move' ? translationBase(doc, original, options()) : undefined };
    canvas.setPointerCapture(event.pointerId); preview();
  }));
  canvas.addEventListener('pointermove', event => attempt(() => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) {
      const p = point(sample), last = drag.points.at(-1)!;
      if (p.x !== last.x || p.y !== last.y) drag.points.push(p);
    }
    if (queued === undefined) queued = requestAnimationFrame(() => attempt(preview));
  }));
  canvas.addEventListener('pointerup', event => attempt(() => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.points.push(point(event)); finish();
  }));
  canvas.addEventListener('pointercancel', () => { if (drag) cancel(); });
  canvas.addEventListener('lostpointercapture', () => { if (drag) cancel(); });
  select('paint-tool').addEventListener('change', () => { if (drag) cancel(); });
  window.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
    if (event.key === 'Escape' && drag) { event.preventDefault(); cancel(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcut: Record<string, string> = { m: 'select-rectangle', q: 'lasso', v: 'move' };
    if (shortcut[event.key.toLowerCase()]) {
      event.preventDefault(); select('paint-tool').value = shortcut[event.key.toLowerCase()]; select('paint-tool').dispatchEvent(new Event('change')); host.refresh();
    }
    if (select('paint-tool').value !== 'move') return;
    const step = event.shiftKey ? 10 : 1;
    const shifts: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (shifts[event.key]) { event.preventDefault(); attempt(() => transform({ offset: shifts[event.key] })); }
  });
  for (const id of ['save-png', 'save-project', 'undo', 'redo', 'new-canvas', 'open-project', 'import-png', 'add-frame', 'duplicate-frame', 'save-animation-sheet',
    'save-normal','save-height','save-occlusion','save-shadow','save-map-info','apply-material','apply-palette','apply-relight','flatten-layers','new-paint-layer'])
    button(id).addEventListener('click', () => attempt(finish), { capture: true });
  function sync() {
    const mask = temporary ?? host.selection(), w = canvas.width, h = canvas.height;
    overlay.width = w; overlay.height = h; overlay.style.width = canvas.style.width; overlay.style.height = canvas.style.height;
    const ctx = overlay.getContext('2d')!, image = ctx.createImageData(w, h);
    const active = selectionDrawingTools.has(select('paint-tool').value) || field('paint-in-selection').checked;
    if (active && mask.length === w * h) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || (x > 0 && x + 1 < w && y > 0 && y + 1 < h && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w])) continue;
      image.data.set((x + y) % 4 < 2 ? [226, 255, 206, 210] : [24, 45, 34, 210], i * 4);
    }
    ctx.putImageData(image, 0, 0);
    const bounds = pixelSelectionBounds2D(w, h, mask);
    el('transform-info').textContent = bounds ? '선택한 셀과 높이·법선을 함께 변형합니다. Shift + 방향키는 10px 이동입니다.' : '오른쪽 그림에서 사각·타원·올가미로 영역을 선택하세요.';
    for (const id of ['transform-apply', 'flip-selection-x', 'flip-selection-y', 'rotate-selection-left', 'rotate-selection-right']) button(id).disabled = !bounds;
  }
  return { sync, finish, cancel };
}
