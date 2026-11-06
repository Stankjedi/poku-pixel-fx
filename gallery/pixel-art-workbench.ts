import { hex } from '../src/core/color.js';
import type { EditableSprite2D } from '../src/core/sprite-edit.js';
import { rasterizePixelBrush2D, rasterizePixelShape2D, paintPixelMask2D, shadePixelMask2D, selectPixelRegion2D, resizePixelSelection2D,
  type PixelBrushPoint2D, type PixelBrushOptions2D, type PixelShapeKind2D } from '../src/core/pixel-brush.js';
import { extractPixelPalette2D, createPixelPaletteRamp2D } from '../src/core/pixel-palette.js';
import { sortPixelColorsByLightness2D } from '../src/core/pixel-color-edit.js';
import { exportPixelSurfaceMaps2D } from '../src/core/pixel-surface-maps.js';
import { installPixelArtSelection, selectionDrawingTools } from './pixel-art-selection.js';
import { installPixelArtCraft, craftDrawingTools } from './pixel-art-craft.js';
import { installPixelArtAdjustments } from './pixel-art-adjustments.js';
import { encodeRGBAPNG } from './png.js';
import { pixelArtLayerLimit2D } from '../src/authoring/pixel-art-project.js';
import { createBlankPixelArtDocument2D, flattenPixelArtDocument2D, renderPixelArtDocument2D, writePixelArtPaintLayer2D, nextPixelArtLayerId2D,
  type PixelArtDocument2D, type PixelArtDocumentLayer2D, type PixelArtDocumentRaster2D, type PixelArtPaletteLayer2D, type PixelArtMaterialLayer2D } from '../src/authoring/pixel-art-document.js';

export interface PixelArtWorkbenchHost {
  document(): PixelArtDocument2D;
  outputDocument(): PixelArtDocument2D;
  committed(): EditableSprite2D;
  output(): EditableSprite2D;
  selection(): Uint8Array;
  protection(): Uint8Array;
  palette(): readonly number[];
  setPalette(colors: readonly number[]): void;
  workingPaletteChanged(): void;
  setSelection(mask: Uint8Array): void;
  commit(document: PixelArtDocument2D): void;
  load(document: PixelArtDocument2D): void;
  newCanvas(document: PixelArtDocument2D): void;
  preview(sprite: EditableSprite2D | undefined): void;
  refresh(): void;
  status(message: string, error?: boolean): void;
  download(blob: Blob, name: string): void;
  filename(): string;
  editMaterial(id: string): void;
  discardPreview(): void;
}

const el = (id: string) => document.getElementById(id)!;
const field = (id: string) => el(id) as HTMLInputElement;
const choice = (id: string) => el(id) as HTMLSelectElement;
const btn = (id: string) => el(id) as HTMLButtonElement;
const integer = (id: string, low: number, high: number) => {
  const value = Number(field(id).value);
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${low}~${high} 범위의 정수를 입력해 주세요.`);
  return value;
};
const cssColor = (c: number) => '#' + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map(v => v.toString(16).padStart(2, '0')).join('');

/** Real canvas editing, not a display filter. The host owns material previews and document history. */
export function installPixelArtWorkbench(host: PixelArtWorkbenchHost) {
  const result = el('result') as HTMLCanvasElement;
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); } };
  let rowsKey = '', authoredPalette: number[] | undefined, strokeFrame:number|undefined, stroke: {
    pointer: number; points: PixelBrushPoint2D[]; tool: string; document: PixelArtDocument2D;
    source: EditableSprite2D; merged:EditableSprite2D; layerId?: string; candidate?: PixelArtDocument2D;
  } | undefined;
  let craft: ReturnType<typeof installPixelArtCraft> | undefined;
  let adjustments: ReturnType<typeof installPixelArtAdjustments> | undefined;
  const point = (event: PointerEvent): PixelBrushPoint2D => {
    const r = result.getBoundingClientRect();
    return { x: Math.floor((event.clientX - r.left) * result.width / r.width), y: Math.floor((event.clientY - r.top) * result.height / r.height),
      ...(event.pointerType === 'pen' && field('pen-pressure').checked ? { pressure: event.pressure } : {}) };
  };
  function brushOptions(): PixelBrushOptions2D {
    return { size: integer('paint-size', 1, 64), tip: choice('paint-tip').value as 'round' | 'square', pixelPerfect: field('pixel-perfect').checked,
      symmetry: choice('paint-symmetry').value as PixelBrushOptions2D['symmetry'] };
  }
  function activePaint(document: PixelArtDocument2D): string | undefined {
    const layer = document.layers.find(layer => layer.id === document.activeLayerId) ?? document.layers.at(-1);
    if(layer?.kind==='paint'&&(layer.locked||layer.visible===false))throw new Error('선택한 그림 레이어가 잠겨 있거나 숨겨져 있습니다. 표시와 잠금을 확인해 주세요.');
    return layer?.kind === 'paint' && !layer.locked && layer.visible !== false ? layer.id : undefined;
  }
  function paintLayerSource(doc:PixelArtDocument2D,id:string|undefined,merged:EditableSprite2D):EditableSprite2D {
    if(!id)return merged;
    const layer=doc.layers.find(layer=>layer.id===id);
    if(layer?.kind!=='paint')return merged;
    const pixels=new Uint32Array(doc.width*doc.height),data=new Uint8Array(pixels.length);
    layer.indices.forEach((i,j)=>{pixels[i]=layer.pixels[j];data[i]=pixels[i]>>>24?1:0;});
    return{w:doc.width,h:doc.height,pixels,mask:{w:doc.width,h:doc.height,data}};
  }
  function painted(source: EditableSprite2D, mask: Uint8Array, erase: boolean,merged?:EditableSprite2D, shadeStep=0) {
    // Existing paint layers store pre-opacity RGBA. Shading those authored cells avoids
    // applying layer opacity twice when the visible composite has reduced alpha.
    const baseline = source;
    const output = shadeStep ? shadePixelMask2D(baseline, mask, authoredPalette ?? host.palette(), shadeStep, {
      protectedMask: host.protection(), selection: field('paint-in-selection').checked ? host.selection() : undefined,
    }) : paintPixelMask2D(source, mask, erase ? null : hex(field('paint-color').value), {
      mode: 'replace', protectedMask: host.protection(), selection: field('paint-in-selection').checked ? host.selection() : undefined, alphaLock: field('alpha-lock').checked,
    });
    // Store only pixels the action actually changed; protected cells never become hidden overrides.
    const touched = Uint8Array.from(mask, (v, i) => v && (baseline.pixels[i] !== output.pixels[i] || baseline.mask.data[i] !== output.mask.data[i]) ? 1 : 0);
    if(erase&&merged&&!field('alpha-lock').checked)for(let i=0;i<touched.length;i++){
      if(mask[i]&&!host.protection()[i]&&(!field('paint-in-selection').checked||host.selection()[i])&&merged.mask.data[i]&&(merged.pixels[i]>>>24))touched[i]=1;
    }
    return { output, touched };
  }
  function previewStroke() {
    if (!stroke) return;
    const { document: doc, points, tool, source, merged, layerId } = stroke, options = brushOptions();
    const mask = ['line', 'rectangle', 'ellipse'].includes(tool)
      ? rasterizePixelShape2D(doc.width, doc.height, tool as PixelShapeKind2D, [points[0].x,points[0].y], [points.at(-1)!.x,points.at(-1)!.y], { ...options, filled: field('paint-filled').checked })
      : rasterizePixelBrush2D(doc.width, doc.height, points, options);
    const { output, touched } = painted(source, mask, tool === 'eraser',merged,tool==='shade-light'?1:tool==='shade-dark'?-1:0);
    const next = writePixelArtPaintLayer2D(doc, output, touched, layerId);
    stroke.candidate = next;
    host.preview(!layerId ? output : renderPixelArtDocument2D(next));
  }
  result.addEventListener('pointerdown', event => attempt(() => {
    const tool = choice('paint-tool').value;
    if (event.button !== 0 || tool === 'inspect' || selectionDrawingTools.has(tool) || craftDrawingTools.has(tool)) return;
    adjustments?.finish();
    event.preventDefault();
    const p = point(event), source = host.output(), doc = host.outputDocument();
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    if (tool === 'picker') {
      const i = p.y * source.w + p.x;
      if (source.mask.data[i] && source.pixels[i] >>> 24) field('paint-color').value = cssColor(source.pixels[i]);
      return;
    }
    const layerId = activePaint(doc);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError('레이어 한도입니다. 그림 레이어를 선택하거나 현재 모습을 구운 뒤 그려 주세요.');
    if (tool === 'fill') {
      const mask = selectPixelRegion2D(source, p, { tolerance: integer('tolerance', 0, 100), includeTransparent: true,
        selection: field('paint-in-selection').checked ? host.selection() : undefined });
      const { output, touched } = painted(paintLayerSource(doc,layerId,source), mask, false);
      const next = writePixelArtPaintLayer2D(doc, output, touched, layerId);
      if (next !== doc) host.commit(next);
      return;
    }
    stroke = { pointer: event.pointerId, points: [p], tool, document: doc, source:paintLayerSource(doc,layerId,source), merged:source, layerId };
    result.setPointerCapture(event.pointerId); previewStroke();
  }));
  result.addEventListener('pointermove', event => attempt(() => {
    const p = point(event);
    el('cursor-cell').textContent = p.x >= 0 && p.y >= 0 && p.x < result.width && p.y < result.height ? `x ${p.x} · y ${p.y}` : '';
    if (!stroke || stroke.pointer !== event.pointerId) return;
    for (const sample of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) {
      const next = point(sample), last = stroke.points.at(-1)!;
      if (last.x !== next.x || last.y !== next.y || last.pressure !== next.pressure) stroke.points.push(next);
    }
    if(strokeFrame===undefined)strokeFrame=requestAnimationFrame(()=>{strokeFrame=undefined;attempt(previewStroke);});
  }));
  function finishStroke() {
    if(!stroke)return;
    if(strokeFrame!==undefined){cancelAnimationFrame(strokeFrame);strokeFrame=undefined;}
    previewStroke();
    const completed=stroke;stroke=undefined;
    if(result.hasPointerCapture(completed.pointer))result.releasePointerCapture(completed.pointer);
    if(completed.candidate&&completed.candidate!==completed.document)host.commit(completed.candidate);
    else host.preview(undefined);
  }
  result.addEventListener('pointerup', event => attempt(() => {
    if (!stroke || stroke.pointer !== event.pointerId) return;
    const next = point(event), last = stroke.points.at(-1)!;
    // Pointerup reports zero pen pressure even though the final cell was painted while down.
    if (event.pointerType === 'pen') next.pressure = last.pressure;
    if (last.x !== next.x || last.y !== next.y) { stroke.points.push(next); previewStroke(); }
    finishStroke();
  }));
  const cancelStroke = () => { if(strokeFrame!==undefined){cancelAnimationFrame(strokeFrame);strokeFrame=undefined;}stroke = undefined; host.preview(undefined); };
  result.addEventListener('pointercancel', cancelStroke);
  result.addEventListener('lostpointercapture', () => { if (stroke) cancelStroke(); });
  result.addEventListener('pointerleave', () => { if (!stroke) el('cursor-cell').textContent = ''; });
  choice('paint-tool').onchange = () => attempt(() => { if (stroke) cancelStroke(); adjustments?.finish(); syncCursor(); });
  function syncCursor() {
    const tool = choice('paint-tool').value;
    result.style.cursor = tool === 'inspect' ? 'default' : 'crosshair';
    el('paint-hint').textContent = tool === 'inspect' ? '오른쪽 캔버스에 그립니다. 왼쪽에서는 선택과 보호 영역을 편집합니다.'
      : tool === 'move' ? '선택 영역을 드래그하거나 방향키로 옮기세요. Shift + 방향키: 10px. Escape: 취소.'
      : selectionDrawingTools.has(tool) ? '영역을 드래그하세요. Shift: 추가 · Alt: 빼기 · Shift + Alt: 교차.'
      : tool.startsWith('shade-') ? '작업 팔레트에 있는 색을 한 단계 바꿉니다. 팔레트 밖 색·알파·보호 영역은 유지됩니다.'
      : tool.startsWith('height-') ? '원화 색을 유지하며 높이를 조각합니다. 높이·법선 보기에서 형태를 확인하세요.'
      : tool === 'path' ? '클릭으로 점을 놓고 드래그로 곡률을 조절합니다. 제어점은 저장한 뒤에도 수정할 수 있습니다.'
      : tool === 'picker' ? '오른쪽 그림에서 색을 고른 뒤 B를 누르면 연필로 돌아갑니다.'
        : '오른쪽 캔버스에 그리세요. 한 번의 드래그가 한 번의 실행 취소에 대응합니다. 보호 영역은 유지됩니다.';
  }

  function mutateLayer(id: string, fn: (layers: PixelArtDocumentLayer2D[], index: number) => void) {
    craft?.cancel(); adjustments?.cancel();
    const doc = host.document(), layers = structuredClone(doc.layers), index = layers.findIndex(layer => layer.id === id);
    if (index < 0) return;
    fn(layers, index);
    const { activeLayerId, ...base } = doc;
    host.commit({ ...base, layers, ...(activeLayerId && layers.some(layer => layer.id === activeLayerId) ? { activeLayerId } : {}) });
  }
  const actionButton = (label: string, title: string, action: () => void, disabled = false) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = title; button.setAttribute('aria-label', title); button.disabled = disabled;
    button.onclick = () => attempt(action); return button;
  };
  function syncLayers() {
    const doc = host.document(), key = JSON.stringify([doc.activeLayerId, doc.layers.map(({ id, name, kind, visible, locked }) => ({ id, name, kind, visible, locked }))]);
    const hasRoom = host.outputDocument().layers.length < pixelArtLayerLimit2D(doc.width, doc.height);
    btn('new-paint-layer').disabled = !hasRoom;
    btn('apply-palette').disabled = !hasRoom;
    btn('flatten-layers').disabled = !doc.layers.length;
    const selected = doc.layers.find(layer => layer.id === doc.activeLayerId);
    el('active-layer').textContent = selected ? `${selected.kind === 'paint' ? '그리는 곳' : '선택한 레이어'}: ${selected.name}${selected.locked ? ' · 잠김' : ''}` : '그리면 맨 위에 그림 레이어가 생깁니다.';
    if (key === rowsKey) return;
    rowsKey = key;
    el('layer-list').replaceChildren(...doc.layers.map((layer, index) => {
      const li = document.createElement('li'); li.dataset.layerId = layer.id;
      li.classList.toggle('active', doc.activeLayerId === layer.id); li.classList.toggle('hidden-layer', layer.visible === false);
      li.append(actionButton(layer.visible === false ? '○' : '●', `${layer.name} 표시 전환`, () => mutateLayer(layer.id, (layers, i) => { layers[i].visible = layers[i].visible === false; })));
      const kind = document.createElement('span'); kind.className = 'layer-kind'; kind.textContent = { material: '재질', paint: '그림', palette: '색상', transform: '변형', relight: '조명', height:'높이', path:'곡선' }[layer.kind]; li.append(kind);
      const name = document.createElement('input'); name.value = layer.name; name.className = 'layer-name'; name.maxLength = 160; name.setAttribute('aria-label', `${layer.name} 이름`);
      name.onchange = () => attempt(() => { if (!name.value.trim()) { name.value = layer.name; return; } mutateLayer(layer.id, (layers, i) => { layers[i].name = name.value.trim(); }); });
      li.append(name, actionButton('선택', `${layer.name} 선택`, () => host.commit({ ...host.document(), activeLayerId: layer.id })));
      if (layer.kind === 'material') li.append(actionButton('설정', `${layer.name} 재질 수정`, () => {craft?.cancel();adjustments?.cancel();host.editMaterial(layer.id);}, !!layer.locked));
      if (layer.kind === 'height' || layer.kind === 'path') li.append(actionButton('설정', `${layer.name} ${layer.kind==='height'?'높이':'곡선'} 수정`, () => {adjustments?.cancel();host.discardPreview();craft?.editLayer(layer.id);}, !!layer.locked || layer.visible===false));
      if (layer.kind === 'palette' || layer.kind === 'relight') li.append(actionButton('설정', `${layer.name} ${layer.kind==='palette'?'팔레트':'조명'} 수정`, () => {craft?.cancel();adjustments?.edit(layer.id);}, !!layer.locked || layer.visible===false));
      li.append(actionButton(layer.locked ? '잠김' : '잠금', `${layer.name} 편집 잠금`, () => mutateLayer(layer.id, (layers, i) => { layers[i].locked = !layers[i].locked; })),
        actionButton('↑', `${layer.name} 위로`, () => mutateLayer(layer.id, (layers, i) => { [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]]; }), index === doc.layers.length - 1 || !!layer.locked),
        actionButton('↓', `${layer.name} 아래로`, () => mutateLayer(layer.id, (layers, i) => { [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]]; }), index === 0 || !!layer.locked),
        actionButton('×', `${layer.name} 삭제`, () => mutateLayer(layer.id, (layers, i) => { layers.splice(i, 1); }), !!layer.locked));
      return li;
    }));
  }
  btn('new-paint-layer').onclick = () => attempt(() => {
    const doc = host.outputDocument(), id = nextPixelArtLayerId2D(doc, 'paint');
    host.commit({ ...doc, activeLayerId: id, layers: [...doc.layers, { kind: 'paint', id, name: `그림 ${doc.layers.length + 1}`, indices: [], pixels: [] }] });
    choice('paint-tool').value = 'pencil'; syncCursor();
  });
  btn('flatten-layers').onclick = () => attempt(() => host.commit(flattenPixelArtDocument2D(host.outputDocument())));
  btn('new-canvas').onclick = () => attempt(() => {
    const width = integer('new-width', 1, 512), height = integer('new-height', 1, 512);
    // Kept in the same history: creating a new canvas can be undone, too.
    host.newCanvas(createBlankPixelArtDocument2D(width, height, `Artwork-${width}x${height}`));
    field('paint-in-selection').checked = false; field('alpha-lock').checked = false;
    choice('paint-tool').value = 'pencil'; syncCursor();
  });
  btn('invert-selection').onclick = () => host.setSelection(Uint8Array.from(host.selection(), v => v ? 0 : 1));
  for (const [id, radius] of [['grow-selection', 1], ['shrink-selection', -1]] as const) btn(id).onclick = () => attempt(() => {
    const doc = host.document(); host.setSelection(resizePixelSelection2D(doc.width, doc.height, host.selection(), radius));
  });

  function showAuthoredPalette(colors:readonly number[] | undefined) {
    // Core hex() returns a signed bitwise color; document metadata stores uint32.
    authoredPalette=colors ? colors.map(color=>color>>>0) : undefined;
    el('workbench-palette').replaceChildren(...(authoredPalette??[]).map((color,i)=>{
      const swatch=document.createElement('input');swatch.type='color';swatch.value=cssColor(color);swatch.setAttribute('aria-label',`작업 팔레트 ${i+1}`);
      swatch.oninput=()=>{authoredPalette![i]=hex(swatch.value)>>>0;host.workingPaletteChanged();};
      swatch.ondblclick=()=>{field('paint-color').value=swatch.value;};return swatch;
    }));
  }
  function setAuthoredPalette(colors:readonly number[]) {
    showAuthoredPalette(colors);host.workingPaletteChanged();adjustments?.paletteChanged();
  }
  btn('extract-palette').onclick = () => attempt(() => {
    const colors = extractPixelPalette2D(host.output(), { colors: integer('palette-count', 2, 64), locked: field('lock-paint-color').checked ? [field('paint-color').value] : [],
      ...(field('paint-in-selection').checked ? { selection: host.selection() } : {}) });
    if (!colors.length) throw new Error('색을 추출할 불투명한 픽셀이 없습니다. 먼저 그리거나 PNG를 가져오세요.');
    setAuthoredPalette(sortPixelColorsByLightness2D(colors)); el('palette-note').textContent = `현재 그림에서 ${colors.length}색을 추출해 어두운 색부터 정렬했습니다. 고정한 색의 값은 그대로 유지합니다.`;
  });
  btn('generate-ramp').onclick = () => attempt(() => {
    const colors = createPixelPaletteRamp2D({ shadow: field('ramp-shadow').value, midtone: field('ramp-midtone').value, highlight: field('ramp-highlight').value, colors: integer('palette-count', 2, 64) });
    setAuthoredPalette(colors); el('palette-note').textContent = `${colors.length}색 명암 팔레트 · 그림자와 밝은 면 사이에서 색상과 채도를 함께 조절했습니다.`;
  });
  btn('use-material-palette').onclick=()=>attempt(()=>host.setPalette(authoredPalette??host.palette()));
  // These controls are independent of the material inspector. Changing a light must never
  // create a material draft that would replace a hand-painted multicolor albedo on apply.
  const relightRanges = ['angle', 'elevation', 'intensity', 'fill', 'ambient', 'roughness', 'ao', 'shadow', 'strength'];
  function showRelightValues() {
    for (const name of relightRanges) {
      const value = Number(field(`relight-${name}`).value);
      el(`relight-${name}-value`).textContent = `${Math.round(value * 1000) / 1000}${name === 'angle' || name === 'elevation' ? '°' : ''}`;
    }
  }
  for (const name of relightRanges) field(`relight-${name}`).addEventListener('input', showRelightValues);
  showRelightValues();

  function spriteCanvas(sprite: EditableSprite2D) {
    const c = document.createElement('canvas'); c.width = sprite.w; c.height = sprite.h;
    const ctx = c.getContext('2d')!, image = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < sprite.pixels.length; i++) { const v = sprite.pixels[i]; image.data.set([v & 255, v >>> 8 & 255, v >>> 16 & 255, sprite.mask.data[i] ? v >>> 24 : 0], i * 4); }
    ctx.putImageData(image, 0, 0); return c;
  }
  async function downloadSprite(sprite:EditableSprite2D,name:string) {
    const rgba=new Uint8Array(sprite.w*sprite.h*4);
    for(let i=0;i<sprite.pixels.length;i++){const c=sprite.pixels[i];rgba.set([c&255,c>>>8&255,c>>>16&255,sprite.mask.data[i]?c>>>24:0],i*4);}
    host.download(await encodeRGBAPNG(sprite.w,sprite.h,rgba),name);
  }
  const grids = ['source', 'result'].map(id => {
    const c = el(id) as HTMLCanvasElement, wrapper = document.createElement('div'), grid = document.createElement('div');
    wrapper.className = 'canvas-wrap'; grid.className = 'pixel-grid'; grid.setAttribute('aria-hidden', 'true');
    c.parentNode!.insertBefore(wrapper, c); wrapper.append(c, grid); return { c, grid };
  });
  const tileHost = document.createElement('section'), tileLabel = document.createElement('div'), tileCanvas = document.createElement('canvas');
  let tileSprite: EditableSprite2D | undefined;
  tileHost.className = 'tile-proof'; tileLabel.className = 'tile-proof-label'; tileLabel.textContent = '반복 경계 확인 · 3 × 3 · 원본을 바꾸지 않는 타일 미리보기';
  tileHost.append(tileLabel, tileCanvas); el('result-host').closest('.comparison')!.after(tileHost);
  field('show-grid').onchange = () => syncOverlays(); field('tile-preview').onchange = () => syncOverlays();
  function syncOverlays() {
    for (const { c, grid } of grids) {
      const rect = c.getBoundingClientRect(), step = rect.width / c.width;
      grid.style.backgroundSize = `${step}px ${rect.height / c.height}px`;
      grid.classList.toggle('visible', field('show-grid').checked && step >= 4);
    }
    tileHost.classList.toggle('visible', field('tile-preview').checked);
    if (field('tile-preview').checked && host.output() && tileSprite!==host.output()) {
      const sprite = host.output(), source = spriteCanvas(sprite); tileSprite=sprite;tileCanvas.width = sprite.w * 3; tileCanvas.height = sprite.h * 3;
      const ctx = tileCanvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(source, x * sprite.w, y * sprite.h);
    }
  }
  new ResizeObserver(syncOverlays).observe(el('result-host'));
  function surfaceMaps() {
    const doc=host.outputDocument(),lastMaterial = doc.layers.filter((layer):layer is PixelArtMaterialLayer2D => layer.kind === 'material'&&layer.visible!==false).at(-1);
    const lastSurface = doc.layers.filter(layer => layer.visible !== false && (layer.kind === 'height' || layer.kind === 'material')).at(-1);
    const tileSize=lastMaterial?.material.tileSize;
    return exportPixelSurfaceMaps2D(renderPixelArtDocument2D(doc), { normalConvention: choice('normal-convention').value as 'opengl' | 'directx',
      lighting: { light: lastMaterial?.material.light ?? [-.6, -.7, 1], ambientOcclusion: 1, castShadow: 1,
        wrap:lastSurface?.kind==='height'?lastSurface.wrap:!!tileSize&&tileSize[0]===doc.width&&tileSize[1]===doc.height&&(lastMaterial?.material.bevel??0)===0,
        occlusionRadius:lastMaterial?.material.occlusionRadius,shadowDistance:lastMaterial?.material.shadowDistance } });
  }
  for (const kind of ['normal', 'height', 'occlusion', 'shadow'] as const) btn(`save-${kind}`).onclick = () => attempt(() => {
    const maps = surfaceMaps(), name = `${host.filename()}-${kind}${kind === 'normal' ? '-' + maps.normalConvention : ''}.png`;
    void downloadSprite(maps[kind],name).catch(error=>host.status(String(error),true));
  });
  btn('save-map-info').onclick = () => attempt(() => {
    const maps = surfaceMaps(), source = host.output();
    const info = { schema: 'poku-pixel-surface-maps/v1', width: source.w, height: source.h, normalConvention: maps.normalConvention,
      heightRange: maps.heightRange, heightUnits: 'native pixel units', heightEncoding: '8-bit: value = min + byte/255 * (max-min)',
      sourceAxes:{x:'right',y:'down',z:'toward viewer'},
      normalEncoding: maps.normalConvention==='opengl'?'RGB = round(([Nx, -Ny, Nz] + 1) * 127.5)':'RGB = round(([Nx, Ny, Nz] + 1) * 127.5)', mask: 'source alpha retained',
      occlusion: 'white is unoccluded; black is fully occluded', shadow: 'white receives direct light; black is shadowed',
      geometry: 'explicit authored and procedural height; no depth inferred from RGB' };
    host.download(new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' }), host.filename() + '-surface-maps.json');
  });
  for(const id of ['save-png','save-project','undo','redo','save-normal','save-height','save-occlusion','save-shadow','save-map-info','new-canvas','import-png','open-project','apply-palette','apply-material','apply-relight','flatten-layers'])
    btn(id).addEventListener('click',event=>{try{
      finishStroke();
      if(id==='undo'||id==='redo'){craft?.cancel();adjustments?.cancel();}
      else {craft?.finish();if(id!=='apply-palette'&&id!=='apply-relight')adjustments?.finish();}
    }catch(error){event.preventDefault();event.stopImmediatePropagation();host.status(error instanceof Error?error.message:String(error),true);}}, {capture:true});
  window.addEventListener('keydown', event => {
    const target = event.target as HTMLElement;
    if (target.closest('input,select,textarea,[contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); btn(event.shiftKey ? 'redo' : 'undo').click(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); btn('save-project').click(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') { adjustments?.cancel(); if (stroke) cancelStroke(); else if(!craftDrawingTools.has(choice('paint-tool').value)){ choice('paint-tool').value = 'inspect'; syncCursor(); } return; }
    const shortcuts: Record<string, string> = { b: 'pencil', e: 'eraser', l: 'line', r: 'rectangle', o: 'ellipse', g: 'fill', i: 'picker' };
    const tool = shortcuts[event.key.toLowerCase()];
    if (tool) { event.preventDefault(); choice('paint-tool').value = tool; syncCursor(); }
  });
  const selections = installPixelArtSelection(host, finishStroke);
  craft=installPixelArtCraft(host);
  adjustments=installPixelArtAdjustments(host,()=>authoredPalette??host.palette(),setAuthoredPalette,()=>{finishStroke();craft?.finish();});
  return { finishStroke() { finishStroke(); selections.finish(); craft?.finish(); adjustments?.finish(); }, setAuthoredPalette,
    restoreAuthoredPalette:showAuthoredPalette, storedPalette:()=>authoredPalette, palette:()=>authoredPalette??host.palette(), sync() {
    syncLayers(); syncOverlays(); syncCursor(); selections.sync();
    const mapsAvailable = !!(host.output() as PixelArtDocumentRaster2D)?.channels;
    btn('apply-relight').disabled = !mapsAvailable || host.outputDocument().layers.length >= pixelArtLayerLimit2D(host.document().width, host.document().height);
    choice('normal-convention').disabled=!mapsAvailable;
    for (const id of ['save-normal', 'save-height', 'save-occlusion', 'save-shadow', 'save-map-info']) btn(id).disabled = !mapsAvailable;
    craft?.sync();adjustments?.sync();
  } };
}
