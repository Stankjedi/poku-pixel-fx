import { createPixelColorReplacer2D, createPixelRampMapper2D, sortPixelColorsByLightness2D,
  type PixelRampMappingOptions2D } from '../src/core/pixel-color-edit.js';
import { renderPixelArtDocument2D, writePixelArtPaintLayer2D, type PixelArtDocument2D } from '../src/authoring/pixel-art-document.js';
import type { PixelArtAnimation2D } from '../src/authoring/pixel-art-animation.js';
import { importPixelArtAnimationSheet2D, slicePixelArtAnimationSheet2D } from '../src/authoring/pixel-art-sheet.js';
import { decodePixelArtPNG } from './png-import.js';

interface ProductionHost {
  outputDocument(): PixelArtDocument2D;
  finishStroke(): void;
  commit(document: PixelArtDocument2D): void;
  palette(): readonly number[];
  setPalette(colors: readonly number[]): void;
  applyToFrames(edit: (document: PixelArtDocument2D) => PixelArtDocument2D): number | undefined;
  importAnimation(animation: PixelArtAnimation2D): void;
  status(message: string, error?: boolean): void;
}
const el = (id: string) => document.getElementById(id)!;
const field = (id: string) => el(id) as HTMLInputElement;
const select = (id: string) => el(id) as HTMLSelectElement;
const button = (id: string) => el(id) as HTMLButtonElement;
function numeric(id: string): number {
  const text = field(id).value.trim(), value = Number(text);
  if (!text || !Number.isFinite(value)) throw new RangeError('유효한 수치를 입력해 주세요.');
  return value;
}

/** Exact color operations create a sparse layer. Underlying pixels and every surface
 * channel remain editable; an animation batch is committed as one undo transaction. */
export function installPixelArtProduction(host: ProductionHost) {
  const attempt = (fn: () => void) => { try { fn(); } catch (error) { host.status(error instanceof Error ? error.message : String(error), true); } };
  function applyColor(edit: (source: ReturnType<typeof renderPixelArtDocument2D>, document: PixelArtDocument2D) => ReturnType<typeof renderPixelArtDocument2D>, name: string) {
    host.finishStroke();
    const operation = (document: PixelArtDocument2D): PixelArtDocument2D => {
      const source = renderPixelArtDocument2D(document), result = edit(source, document);
      const touched = Uint8Array.from(source.pixels, (color, i) => Number(color !== result.pixels[i]));
      if (!touched.some(Boolean)) return document;
      const next = writePixelArtPaintLayer2D(document, result, touched);
      return { ...next, layers: next.layers.map(layer => layer.id === next.activeLayerId ? { ...layer, name } : layer) };
    };
    let changed: number | undefined;
    if (field('color-all-frames').checked) changed = host.applyToFrames(operation);
    if (changed === undefined) {
      const current = host.outputDocument(), next = operation(current); changed = Number(next !== current);
      if (changed) host.commit(next);
    }
    host.status(changed ? `${name} · ${changed}개 프레임에 적용했습니다. 실행 취소로 한 번에 되돌릴 수 있습니다.` : '현재 색과 선택 범위에서 바뀔 픽셀이 없습니다.');
  }
  const region = (document: PixelArtDocument2D) => {
    const material=document.layers.filter(layer=>layer.kind==='material').at(-1);
    const protection=document.protectedMask??material?.protectedMask;
    return {
      ...(field('color-selection-only').checked ? { selection: document.selection??material?.selection
        ??Uint8Array.from(document.pixels,(color,i)=>(document.mask?.[i]??1)&&(color>>>24)?1:0) } : {}),
      ...(protection ? { protectedMask: protection } : {}),
    };
  };
  button('color-use-picked').onclick = () => { field('color-from').value = field('paint-color').value; };
  button('replace-exact-color').onclick = () => attempt(() => {
    const from = field('color-from').value, to = field('color-to').value;
    const replacements = [{ from, to }];
    if (field('color-swap').checked && from !== to) replacements.push({ from: to, to: from });
    const replacer = createPixelColorReplacer2D(replacements);
    applyColor((source, document) => replacer.replace(source, region(document)), field('color-swap').checked ? '두 색 맞교환' : '정확한 색 교체');
  });
  button('sort-working-palette').onclick = () => attempt(() => {
    host.setPalette(sortPixelColorsByLightness2D(host.palette()));
    host.status('작업 팔레트를 어두운 색부터 정렬했습니다. 그림의 색은 적용할 때 바뀝니다.');
  });
  button('reverse-working-palette').onclick = () => attempt(() => {
    host.setPalette([...host.palette()].reverse()); host.status('작업 팔레트의 순서를 뒤집었습니다.');
  });
  button('gradient-fit-horizontal').onclick = () => {
    const document = host.outputDocument();
    field('gradient-start-x').value = '0'; field('gradient-start-y').value = '0';
    field('gradient-end-x').value = String(Math.max(1, document.width - 1)); field('gradient-end-y').value = '0';
  };
  button('apply-ramp-map').onclick = () => attempt(() => {
    const mode = select('gradient-mode').value as PixelRampMappingOptions2D['mode'];
    const mapper = createPixelRampMapper2D(host.palette(), {
      mode, start: [numeric('gradient-start-x'), numeric('gradient-start-y')],
      end: [numeric('gradient-end-x'), numeric('gradient-end-y')],
      valueRange: [numeric('gradient-low'), numeric('gradient-high')], gamma: numeric('gradient-gamma'),
      dither: select('gradient-dither').value as PixelRampMappingOptions2D['dither'],
    });
    const name = mode === 'value' ? '팔레트 명암 매핑' : mode === 'radial' ? '방사형 픽셀 명암' : '선형 픽셀 명암';
    applyColor((source, document) => mapper.map(source, region(document)), name);
  });
  function gradientControls() {
    const value = select('gradient-mode').value === 'value';
    el('gradient-spatial-controls').hidden = value; el('gradient-value-controls').hidden = !value;
  }
  select('gradient-mode').onchange = gradientControls; gradientControls();

  let importing = false;
  function sheetControls() {
    const manifest = select('sheet-import-mode').value === 'manifest';
    el('sheet-grid-controls').hidden = manifest; el('sheet-manifest-control').hidden = !manifest;
  }
  select('sheet-import-mode').onchange = sheetControls; sheetControls();
  button('import-animation-sheet').onclick = () => {
    if (importing) return;
    void (async () => {
      const file = field('animation-sheet-file').files?.[0];
      if (!file) throw new Error('가져올 스프라이트시트 PNG를 선택해 주세요.');
      const manifestMode = select('sheet-import-mode').value === 'manifest';
      const manifestFile = field('animation-sheet-manifest').files?.[0];
      if (manifestMode && !manifestFile) throw new Error('PNG와 함께 내보낸 시간 JSON을 선택해 주세요.');
      if (file.size > 64 * 1024 * 1024) throw new RangeError('시트 PNG는 64 MiB 이하로 열어 주세요.');
      if (manifestMode && manifestFile && manifestFile.size > 4 * 1024 * 1024) throw new RangeError('시트 시간 JSON은 4 MiB 이하로 열어 주세요.');
      host.finishStroke();
      const before = host.outputDocument();
      const options = manifestMode ? undefined : {
        frameWidth: numeric('slice-width'), frameHeight: numeric('slice-height'),
        margin: [numeric('slice-margin-x'), numeric('slice-margin-y')] as [number, number],
        gap: [numeric('slice-gap-x'), numeric('slice-gap-y')] as [number, number],
        order: select('slice-order').value as 'row-major' | 'column-major', start: numeric('slice-start'),
        ...(numeric('slice-count') ? { count: numeric('slice-count') } : {}),
        skipEmpty: field('slice-skip-empty').checked, durationMs: numeric('slice-duration'),
        name: file.name.replace(/\.png$/i, '').slice(0, 160) || 'Imported animation',
      };
      importing = true; button('import-animation-sheet').disabled = true;
      host.status('원본 픽셀을 읽고 프레임 경계와 재생 시간을 확인하고 있습니다…');
      try {
        const decoded = await decodePixelArtPNG(new Uint8Array(await file.arrayBuffer()), {
          maxDimension: 16384, maxPixels: 16_777_216, maxFileBytes: 64 * 1024 * 1024, maxInflatedBytes: 128 * 1024 * 1024,
        });
        if (decoded.kind !== 'decoded') throw new Error('시트의 정확한 RGB·알파를 유지하려면 8비트 PNG로 저장해 주세요.');
        const { w, h, pixels } = decoded, source = { w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, color => color >>> 24 ? 1 : 0) } };
        const animation = manifestMode
          ? importPixelArtAnimationSheet2D(source, JSON.parse(await manifestFile!.text()))
          : slicePixelArtAnimationSheet2D(source, options!);
        host.finishStroke();
        if (host.outputDocument() !== before) throw new Error('가져오는 동안 작업이 변경되었습니다. 현재 작업을 유지했습니다. 시트 가져오기를 다시 눌러 주세요.');
        host.importAnimation(animation);
        const note = `${w} × ${h} 시트 → ${animation.frames.length}개 프레임 · ${animation.width} × ${animation.height} px. RGB·알파와 재생 시간을 보존했습니다.`;
        el('sheet-import-note').textContent = note + (decoded.warnings.length ? ' 색상 프로파일은 원본 수치를 유지하기 위해 변환하지 않았습니다.' : '');
        host.status(note);
      } finally { importing = false; button('import-animation-sheet').disabled = false; }
    })().catch(error => host.status(error instanceof Error ? error.message : String(error), true));
  };
}
