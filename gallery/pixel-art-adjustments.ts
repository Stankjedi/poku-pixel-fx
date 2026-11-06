import { hex } from '../src/core/color.js';
import { createPixelRelighter2D, type PixelRelightOptions2D } from '../src/core/pixel-relight.js';
import { renderPixelArtDocument2D, nextPixelArtLayerId2D, type PixelArtDocument2D,
  type PixelArtPaletteLayer2D, type PixelArtRelightLayer2D } from '../src/authoring/pixel-art-document.js';
import { pixelArtLayerLimit2D } from '../src/authoring/pixel-art-project.js';
import type { PixelArtWorkbenchHost } from './pixel-art-workbench.js';

const el = (id: string) => document.getElementById(id)!;
const field = (id: string) => el(id) as HTMLInputElement;
const choice = (id: string) => el(id) as HTMLSelectElement;
const button = (id: string) => el(id) as HTMLButtonElement;
const cssColor = (c: string | number) => typeof c === 'string' ? c : '#' + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map(v => v.toString(16).padStart(2, '0')).join('');
type Adjustment = PixelArtPaletteLayer2D | PixelArtRelightLayer2D;

/** Re-edit a saved adjustment in place. A preview never replaces the document until
 * Apply/Save; Cancel and unrelated document changes discard the temporary candidate. */
export function installPixelArtAdjustments(host: PixelArtWorkbenchHost, palette: () => readonly number[], setPalette: (colors: number[]) => void,
  finishStroke: () => void) {
  let editing: { base: PixelArtDocument2D; layer: Adjustment; changed: Set<string>; candidate?: PixelArtDocument2D } | undefined;
  let queued = 0, loading = false;
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); } };
  const note = document.createElement('p'); note.className = 'hint'; note.id = 'adjustment-edit-state'; note.hidden = true;
  el('layer-list').before(note);
  const cancelButtons = ['palette', 'relight'].map(kind => {
    const cancel = document.createElement('button'); cancel.id = `cancel-${kind}-edit`; cancel.textContent = '수정 취소'; cancel.hidden = true;
    button(`apply-${kind}`).after(cancel); cancel.onclick = () => cancelEdit(); return cancel;
  });
  const strengthLabel = document.createElement('label'); strengthLabel.textContent = '적용 강도 ';
  const strength = document.createElement('input'); strength.id = 'palette-strength'; strength.type = 'number'; strength.min = '0'; strength.max = '1'; strength.step = '0.05'; strength.value = '1';
  strengthLabel.append(strength); button('apply-palette').before(strengthLabel);

  function cancelEdit(clearPreview = true) {
    if (queued) cancelAnimationFrame(queued); queued = 0;
    const hadPreview = !!editing?.candidate;
    editing = undefined; syncLabels();
    if (clearPreview && hadPreview) host.preview(undefined);
  }
  function setNumber(id: string, value: number) {
    const control = field(id); control.step = 'any';
    if (control.min !== '') control.min = String(Math.min(Number(control.min), value));
    if (control.max !== '') control.max = String(Math.max(Number(control.max), value));
    control.value = String(value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function readNewLight(): PixelRelightOptions2D {
    const a = Number(field('relight-angle').value) * Math.PI / 180, e = Number(field('relight-elevation').value) * Math.PI / 180;
    return { lights: [
      { direction: [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)], color: field('relight-key-color').value,
        intensity: Number(field('relight-intensity').value), castShadow: Number(field('relight-shadow').value) },
      { direction: [-Math.cos(a), -Math.sin(a), .7], color: field('relight-fill-color').value, intensity: Number(field('relight-fill').value) },
    ], ambient: Number(field('relight-ambient').value), diffuseBands: Number(field('relight-bands').value), roughness: Number(field('relight-roughness').value),
      ambientOcclusion: Number(field('relight-ao').value), strength: Number(field('relight-strength').value), wrap: field('relight-wrap').checked,
      ...(field('relight-palette').checked ? { palette: [...palette()] } : {}) };
  }
  function readEditedLight(layer: PixelArtRelightLayer2D, changed: Set<string>): PixelRelightOptions2D {
    const original = structuredClone(createPixelRelighter2D(layer.lighting).options), input = readNewLight();
    const lights = original.lights.map(light => ({ ...light, direction: [...light.direction] as [number, number, number] }));
    const keyChanged = ['relight-angle', 'relight-elevation', 'relight-key-color', 'relight-intensity', 'relight-shadow'].some(id => changed.has(id));
    if (keyChanged) {
      const source = lights[0] ?? input.lights![0];
      lights[0] = { ...source, direction: [...source.direction] as [number, number, number],
        ...(changed.has('relight-angle') || changed.has('relight-elevation') ? { direction: [...input.lights![0].direction] as [number, number, number] } : {}),
        ...(changed.has('relight-key-color') ? { color: hex(field('relight-key-color').value) } : {}),
        ...(changed.has('relight-intensity') ? { intensity: input.lights![0].intensity } : {}),
        ...(changed.has('relight-shadow') ? { castShadow: input.lights![0].castShadow } : {}) } as typeof lights[number];
    }
    if (changed.has('relight-fill-color') || changed.has('relight-fill')) {
      if (!lights[0]) lights[0] = { ...createPixelRelighter2D({ lights: [{ direction: [0, 0, 1], intensity: 0 }] }).options.lights[0], direction: [0, 0, 1] };
      const source = lights[1] ?? createPixelRelighter2D({ lights: [input.lights![1]] }).options.lights[0];
      lights[1] = { ...source, direction: [...source.direction] as [number, number, number],
        ...(changed.has('relight-fill-color') ? { color: hex(field('relight-fill-color').value) } : {}),
        ...(changed.has('relight-fill') ? { intensity: Number(field('relight-fill').value) } : {}) };
    }
    const result: PixelRelightOptions2D = { ...original, lights };
    const mapping = { ambient: 'ambient', bands: 'diffuseBands', roughness: 'roughness', ao: 'ambientOcclusion', strength: 'strength' } as const;
    for (const [control, key] of Object.entries(mapping)) if (changed.has(`relight-${control}`)) (result as Record<string, unknown>)[key] = Number(field(`relight-${control}`).value);
    if (changed.has('relight-wrap')) result.wrap = field('relight-wrap').checked;
    if (changed.has('relight-palette') || changed.has('palette-colors') && field('relight-palette').checked) {
      if (field('relight-palette').checked) result.palette = [...palette()]; else delete result.palette;
    }
    return result;
  }
  function candidate() {
    if (!editing || editing.base !== host.document()) throw new Error('편집할 레이어가 바뀌었습니다. 설정을 다시 열어 주세요.');
    const { base, layer, changed } = editing;
    const replacement: Adjustment = layer.kind === 'palette' ? { ...layer, palette: [...palette()],
      dither: choice('palette-dither').value as PixelArtPaletteLayer2D['dither'], strength: Number(strength.value) }
      : { ...layer, lighting: readEditedLight(layer, changed) };
    return { ...base, layers: base.layers.map(item => item.id === layer.id ? replacement : item), activeLayerId: layer.id };
  }
  function preview() {
    queued = 0;
    if (!editing || !editing.changed.size || editing.base !== host.document()) return;
    attempt(() => {
      const next = candidate(), raster = renderPixelArtDocument2D(next);
      editing!.candidate = next; host.preview(raster);
      note.textContent = `${editing!.layer.name} 수정 중 · 같은 레이어에 적용합니다.`;
    });
  }
  function mark(id: string) {
    if (loading || !editing) return;
    if (editing.layer.kind === 'palette' && !['palette-dither', 'palette-strength', 'palette-colors'].includes(id)) return;
    if (editing.layer.kind === 'relight' && !id.startsWith('relight-') && id !== 'palette-colors') return;
    editing.changed.add(id);
    if (!queued) queued = requestAnimationFrame(preview);
  }
  for (const id of ['palette-dither', 'palette-strength', 'relight-angle', 'relight-elevation', 'relight-key-color', 'relight-fill-color',
    'relight-intensity', 'relight-fill', 'relight-ambient', 'relight-roughness', 'relight-ao', 'relight-shadow', 'relight-strength', 'relight-bands', 'relight-wrap', 'relight-palette']) {
    el(id).addEventListener('input', () => mark(id)); el(id).addEventListener('change', () => mark(id));
  }
  el('workbench-palette').addEventListener('input', () => mark('palette-colors'));

  function edit(id: string) {
    finishStroke(); cancelEdit(); host.discardPreview();
    const base = host.document(), layer = base.layers.find(layer => layer.id === id);
    if (!layer || layer.kind !== 'palette' && layer.kind !== 'relight' || layer.locked || layer.visible === false) return;
    loading = true;
    try {
      editing = { base, layer: structuredClone(layer), changed: new Set() };
      if (layer.kind === 'palette') {
        setPalette(layer.palette.map(c => typeof c === 'string' ? hex(c) : c));
        choice('palette-dither').value = layer.dither ?? 'none'; strength.value = String(layer.strength ?? 1);
        el('palette-note').textContent = `${layer.name}의 팔레트를 수정합니다. 저장된 선택·보호·좌표는 유지됩니다.`;
        el('palette-note').scrollIntoView({ block: 'nearest' });
      } else {
        const options = createPixelRelighter2D(layer.lighting).options, key = options.lights[0], fill = options.lights[1], direction = key?.direction ?? [-.6, -.7, 1];
        setNumber('relight-angle', Math.atan2(direction[1], direction[0]) * 180 / Math.PI);
        setNumber('relight-elevation', Math.atan2(direction[2], Math.hypot(direction[0], direction[1])) * 180 / Math.PI);
        field('relight-key-color').value = cssColor(key?.color ?? '#ffffff'); field('relight-fill-color').value = cssColor(fill?.color ?? '#ffffff');
        for (const [name, value] of Object.entries({ intensity: key?.intensity ?? 0, fill: fill?.intensity ?? 0, ambient: options.ambient,
          roughness: options.roughness, ao: options.ambientOcclusion, shadow: key?.castShadow ?? 0, strength: options.strength, bands: options.diffuseBands })) setNumber(`relight-${name}`, value);
        field('relight-wrap').checked = options.wrap; field('relight-palette').checked = !!options.palette;
        if (options.palette) setPalette([...options.palette]);
        (el('apply-relight').closest('details') as HTMLDetailsElement).open = true;
        el('apply-relight').scrollIntoView({ block: 'nearest' });
      }
      syncLabels();
    } finally { loading = false; }
  }
  function applyEditing() {
    if (!editing) return false;
    if (!editing.changed.size) { cancelEdit(); return true; }
    const next = candidate(); renderPixelArtDocument2D(next);
    cancelEdit(false); host.commit(next); return true;
  }
  function apply(kind: 'palette' | 'relight') {
    finishStroke();
    if (editing?.layer.kind === kind) { applyEditing(); return; }
    cancelEdit();
    const doc = host.outputDocument(), id = nextPixelArtLayerId2D(doc, kind);
    const masks = { ...(field('paint-in-selection').checked ? { selection: Array.from(host.selection()) } : {}), protectedMask: Array.from(host.protection()) };
    const layer: Adjustment = kind === 'palette' ? { kind, id, name: `팔레트 · ${palette().length}색`, palette: [...palette()],
      dither: choice('palette-dither').value as PixelArtPaletteLayer2D['dither'], strength: Number(strength.value), ...masks }
      : { kind, id, name: '원화 색 유지 · 재조명', lighting: createPixelRelighter2D(readNewLight()).options, ...masks };
    if (kind === 'relight' && !renderPixelArtDocument2D(doc).channels) throw new Error('높이 조각이나 재질로 표면을 만든 뒤 재조명을 사용하세요.');
    host.commit({ ...doc, layers: [...doc.layers, layer], activeLayerId: id });
  }
  button('apply-palette').onclick = () => attempt(() => apply('palette'));
  button('apply-relight').onclick = () => attempt(() => apply('relight'));
  function syncLabels() {
    note.hidden = !editing;
    if (editing && !editing.changed.size) note.textContent = `${editing.layer.name} 설정 · 값을 바꾼 뒤 적용하거나 취소하세요.`;
    for (const kind of ['palette', 'relight'] as const) {
      const active = editing?.layer.kind === kind;
      button(`apply-${kind}`).textContent = active ? (kind === 'palette' ? '팔레트 수정 적용' : '조명 수정 적용') : (kind === 'palette' ? '팔레트 조정 레이어 추가' : '재조명 레이어 추가');
      cancelButtons[kind === 'palette' ? 0 : 1].hidden = !active;
    }
  }
  return { edit, cancel: cancelEdit, finish: () => { if (editing?.changed.size) applyEditing(); }, paletteChanged: () => mark('palette-colors'),
    sync() {
      if (editing && editing.base !== host.document()) cancelEdit();
      const hasRoom = host.outputDocument().layers.length < pixelArtLayerLimit2D(host.document().width, host.document().height);
      button('apply-palette').disabled = !hasRoom && editing?.layer.kind !== 'palette';
      button('apply-relight').disabled = !hasRoom && editing?.layer.kind !== 'relight' || !(host.output() as { channels?: unknown }).channels;
      syncLabels();
    } };
}
