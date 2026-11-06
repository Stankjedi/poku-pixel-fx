import { createPixelMaterial2D, PIXEL_MATERIAL_PALETTES_2D, type PixelMaterialOptions2D, type PixelMaterialKind2D } from '../src/core/pixel-material.js';
import { diagnosePixelArt2D } from '../src/core/pixel-art-analysis.js';
import type { EditableSprite2D } from '../src/core/sprite-edit.js';
import type { MaterialChannels2D } from '../src/core/material-surface.js';
import { createPixelArtStudy2D, type PixelArtStudyShape2D } from '../src/examples/pixel-art-study.js';
import { pixelArtLayerLimit2D } from '../src/authoring/pixel-art-project.js';
import { createPixelArtDocument2D, renderPixelArtDocument2D, renderPixelArtAuthoredHeight2D, parsePixelArtDocument2D, serializePixelArtDocument2D, nextPixelArtLayerId2D, PixelArtDocumentHistory2D,
  type PixelArtMaterialLayer2D, type PixelArtDocument2D } from '../src/authoring/pixel-art-document.js';
import { installPixelArtWorkbench } from './pixel-art-workbench.js';
import { installPixelArtTimeline } from './pixel-art-timeline.js';
import { installPixelArtViewport } from './pixel-art-viewport.js';
import { installPixelArtRecovery } from './pixel-art-recovery.js';
import { encodeRGBAPNG } from './png.js';
import { decodePixelArtPNG } from './png-import.js';

const element = (id: string) => document.getElementById(id)!;
const input = (id: string) => element(id) as HTMLInputElement;
const select = (id: string) => element(id) as HTMLSelectElement;
const button = (id: string) => element(id) as HTMLButtonElement;
const number = (id: string) => Number(input(id).value);
const canvas = (id: string) => element(id) as HTMLCanvasElement;
const labels: Record<PixelMaterialKind2D,string> = {stone:'돌',metal:'금속',wood:'나무',fabric:'천',crystal:'수정'};
const rangeIds = ['scale','detail','relief','bevel','roughness','light-angle','light-height','ambient','grain-angle','ambient-occlusion','cast-shadow'];
let project: PixelArtDocument2D;
let committed: EditableSprite2D, rendered: EditableSprite2D;
let selection: Uint8Array, protectedMask: Uint8Array, authoredHeight: Float32Array | undefined;
let sourceAuthoredHeight: Float32Array | undefined;
let draft = true, queued = false, busy = false;
let workingOptions: PixelMaterialOptions2D = {};
let materialOrigin: [number,number] | undefined;
let history: PixelArtDocumentHistory2D;
let revision = 0, renderedRevision = -1;
let paintPreview: EditableSprite2D | undefined;
let editingMaterialId: string | undefined;
let workbench: ReturnType<typeof installPixelArtWorkbench> | undefined;
let timeline: ReturnType<typeof installPixelArtTimeline> | undefined;
let recovery: ReturnType<typeof installPixelArtRecovery> | undefined;
let protectionVersion=0,beforeAnalysisKey='',beforeAnalysis:ReturnType<typeof diagnosePixelArt2D>|undefined;
let previewVersion=0,outputKey='',cachedOutput:EditableSprite2D|undefined;
let afterAnalysis:ReturnType<typeof diagnosePixelArt2D>|undefined,analysisSource:EditableSprite2D|undefined,analysisKey='';
let outputDocumentKey='',outputDocumentCache:PixelArtDocument2D|undefined;
const urls: string[] = [];
const canvasFrames = new Map<string, { sprite: EditableSprite2D; mode: string; heatmap?: Uint8Array; overlays: string; image: ImageData }>();

function status(message: string, error = false) {
  element('status').textContent = message; element('status').classList.toggle('error', error);
}
function attempt(fn: () => void) { try { fn(); } catch (error) { status(error instanceof Error ? error.message : String(error), true); } }
function colorHex(c: string | number): string {
  return typeof c === 'string' ? c : '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map(v => v.toString(16).padStart(2,'0')).join('');
}
function palette(colors: readonly (string | number)[]) {
  element('palette').replaceChildren(...colors.map((c, i) => {
    const swatch = document.createElement('input'); swatch.type = 'color'; swatch.value = colorHex(c);
    swatch.setAttribute('aria-label', `팔레트 ${i + 1}`); swatch.title = `팔레트 ${i + 1}`;
    swatch.addEventListener('input', () => {
      workingOptions.palette=Array.from(element('palette').querySelectorAll('input'), v=>v.value);changed();
    }); return swatch;
  }));
}
function settings(): PixelMaterialOptions2D {
  return structuredClone(workingOptions);
}
function matchTilePeriodToCanvas() {
  if(project.width<2||project.height<2){
    delete workingOptions.tileSize;
    input('seamless-material').checked=false;
    element('tile-material-note').textContent='반복 재질은 가로·세로가 모두 2픽셀 이상인 캔버스에서 사용합니다.';
    return;
  }
  workingOptions={...workingOptions,tileSize:[project.width,project.height],bevel:0};
  input('seamless-material').checked=true;input('bevel').value='0';
  element('tile-material-note').textContent=`${project.width} × ${project.height} px 간격으로 무늬가 반복됩니다. 전체를 채운 타일에서 사용하세요.`;
}
function loadSettings(options: PixelMaterialOptions2D) {
  const p = createPixelMaterial2D(options).options;
  workingOptions=structuredClone(p);
  for(const id of rangeIds)input(id).step='any';
  select('material').value = p.kind;
  for (const id of ['seed','scale','detail','relief','bevel','roughness','ambient']) {
    const control=input(id),value=Number(p[id as keyof typeof p]);
    if(control.type==='range'){control.min=String(Math.min(Number(control.min),value));control.max=String(Math.max(Number(control.max),value));}
    control.value=String(value);
  }
  input('light-angle').value = String(Math.atan2(p.light[1],p.light[0]) * 180 / Math.PI);
  input('light-height').value = String(Math.atan2(p.light[2],Math.hypot(p.light[0],p.light[1])) * 180 / Math.PI);
  input('grain-angle').value = String(((p.grainAngle * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
  input('ambient-occlusion').value=String(p.ambientOcclusion);
  input('cast-shadow').value=String(p.castShadow);
  input('seamless-material').checked=!!p.tileSize;
  element('tile-material-note').textContent=p.tileSize?`${p.tileSize[0]} × ${p.tileSize[1]} px 간격으로 무늬가 반복됩니다. 3 × 3 타일 보기로 경계를 확인하세요.`:'반복 무늬를 만들 때 사용합니다. 켜면 가장자리 입체감은 0이 됩니다.';
  palette(p.palette);
}
function editSetting(id:string) {
  if(input(id).type==='range')input(id).value=String(Math.round(number(id)*1000)/1000);
  if(id==='light-angle'||id==='light-height'){
    const a=number('light-angle')*Math.PI/180,e=number('light-height')*Math.PI/180;
    workingOptions.light=[Math.cos(a)*Math.cos(e),Math.sin(a)*Math.cos(e),Math.sin(e)];
  }else if(id==='grain-angle')workingOptions.grainAngle=number(id)*Math.PI/180;
  else if(id==='ambient-occlusion')workingOptions.ambientOcclusion=number(id);
  else if(id==='cast-shadow')workingOptions.castShadow=number(id);
  else if(id==='seamless-material'){
    if(input(id).checked)matchTilePeriodToCanvas();
    else {delete workingOptions.tileSize;element('tile-material-note').textContent='반복 재질을 껐습니다.';}
  }
  else if(id!=='use-height')workingOptions={...workingOptions,[id]:number(id)};
  changed();
}
function pendingLayer(): PixelArtMaterialLayer2D {
  const existing=project.layers.find(layer=>layer.id===editingMaterialId);
  return {kind:'material',id:editingMaterialId??nextPixelArtLayerId2D(project,'material'),name: existing?.name??`${labels[select('material').value as PixelMaterialKind2D]} · ${number('seed')}`,
    ...(existing?.visible!==undefined?{visible:existing.visible}:{}),...(existing?.locked!==undefined?{locked:existing.locked}:{}),material:settings(),
    selection:Array.from(selection), protectedMask:Array.from(protectedMask),
    ...(materialOrigin ? {origin:[...materialOrigin] as [number,number]} : {}),
    ...(input('use-height').checked && authoredHeight ?
      existing?.kind === 'material' && existing.heightSource !== 'authored' ? {height:Array.from(authoredHeight)} : {heightSource:'authored' as const}
      : {})};
}
function canAddLayer(): boolean {
  return !!editingMaterialId || !project || project.layers.length < pixelArtLayerLimit2D(project.width,project.height);
}
function canEditMasks(): boolean {
  return canAddLayer()||project.layers.some(layer=>layer.kind==='paint'&&!layer.locked&&layer.visible!==false);
}
function outputProject(): PixelArtDocument2D {
  const key=`${revision}:${previewVersion}:${draft}:${editingMaterialId??''}`;
  if(outputDocumentCache&&outputDocumentKey===key)return outputDocumentCache;
  const layers=draft&&canAddLayer()?(editingMaterialId?project.layers.map(layer=>layer.id===editingMaterialId?pendingLayer():layer):[...project.layers,pendingLayer()]):project.layers;
  outputDocumentKey=key;
  const workingPalette=workbench?.authoredPalette()??project.workingPalette;
  return outputDocumentCache={...project,layers,selection:Array.from(selection),protectedMask:Array.from(protectedMask),...(sourceAuthoredHeight?{authoredHeight:Array.from(sourceAuthoredHeight)}:{}),
    ...(workingPalette?{workingPalette:[...workingPalette]}:{})};
}
function resetHistory() {
  const {activeLayerId,...base}=project;
  history=new PixelArtDocumentHistory2D({...base,layers:[]});
  for(let i=1;i<=project.layers.length;i++)history.commit({...base,layers:project.layers.slice(0,i),...(activeLayerId&&project.layers.slice(0,i).some(layer=>layer.id===activeLayerId)?{activeLayerId}:{})});
  if(!project.layers.length)history=new PixelArtDocumentHistory2D(project);
}
function commitDocument(next:PixelArtDocument2D) {
  if(timeline?.enabled){timeline.commitFrame(next);return;}
  const raster=renderPixelArtDocument2D(next);
  element('status').classList.remove('error');
  if(history.commit(next)){project=history.value;revision++;committed=raster;renderedRevision=revision;}
  if(next.selection)selection=Uint8Array.from(next.selection);
  if(next.protectedMask){protectedMask=Uint8Array.from(next.protectedMask);protectionVersion++;}
  sourceAuthoredHeight=next.authoredHeight?Float32Array.from(next.authoredHeight):undefined;
  authoredHeight=renderPixelArtAuthoredHeight2D(next);
  draft=false;editingMaterialId=undefined;paintPreview=undefined;schedule();recovery?.changed();
}
function moveHistory(direction:'undo'|'redo') {
  if(timeline?.enabled){timeline[direction]();return;}
  prepareImported(direction==='undo'?history.undo():history.redo(),false);
}
function sizeCanvases() {
  const dpr = window.devicePixelRatio || 1, requested = select('zoom').value;
  for (const id of ['source','result']) {
    const c = canvas(id), host = element(id + '-host');
    const scale = requested === 'auto' ? Math.max(1,Math.floor(Math.min((host.clientWidth - 12) * dpr / c.width,(host.clientHeight - 12) * dpr / c.height))) : Number(requested) * dpr;
    const integerScale = Math.max(1,Math.floor(scale));
    c.style.width = `${c.width * integerScale / dpr}px`; c.style.height = `${c.height * integerScale / dpr}px`;
    host.style.justifyContent = c.width * integerScale / dpr > host.clientWidth ? 'flex-start' : 'center';
    host.style.alignItems = c.height * integerScale / dpr > host.clientHeight ? 'flex-start' : 'center';
  }
}
function paint(id: string, sprite: EditableSprite2D, mode = 'color', heatmap?: Uint8Array) {
  const c = canvas(id), overlays = id === 'source' ? `${previewVersion}:${protectionVersion}` : '';
  const cached = canvasFrames.get(id);
  if (cached?.sprite === sprite && cached.mode === mode && cached.heatmap === heatmap && cached.overlays === overlays) return;
  if(c.width!==sprite.w)c.width=sprite.w;if(c.height!==sprite.h)c.height=sprite.h;
  const ctx = c.getContext('2d')!, image = cached?.image.width === sprite.w && cached.image.height === sprite.h ? cached.image : ctx.createImageData(c.width,c.height);
  const channels = (sprite as EditableSprite2D & {channels?:MaterialChannels2D}).channels;
  let low = Infinity, high = -Infinity;
  if (mode === 'height' && channels) for (let i=0;i<sprite.pixels.length;i++) if (sprite.pixels[i]>>>24) {low=Math.min(low,channels.height[i]);high=Math.max(high,channels.height[i]);}
  for (let i=0;i<sprite.pixels.length;i++) {
    const packed=sprite.pixels[i],j=i*4,x=i%sprite.w,y=Math.floor(i/sprite.w);
    let r=packed&255,g=(packed>>>8)&255,b=(packed>>>16)&255;
    if (mode==='value') r=g=b=Math.round(r*.2126+g*.7152+b*.0722);
    if (mode==='height') r=g=b=channels?Math.round((channels.height[i]-low)/(high-low||1)*255):0;
    if (mode==='normal') {r=channels?Math.round((channels.normal[i*3]+1)*127.5):127;g=channels?Math.round((channels.normal[i*3+1]+1)*127.5):127;b=channels?Math.round((channels.normal[i*3+2]+1)*127.5):255;}
    if (mode==='analysis'&&heatmap?.[i]) {const flag=heatmap[i];r=flag&1?235:100;g=flag&2?207:119;b=flag&4?240:80;}
    if (id==='source' && packed>>>24) {
      if (protectedMask[i]) {r=Math.round(r*.35+206*.65);g=Math.round(g*.35+139*.65);b=Math.round(b*.35+248*.65);}
      else if (selection[i] && ((x>0&&!selection[i-1])||(x+1<sprite.w&&!selection[i+1])||(y>0&&!selection[i-sprite.w])||(y+1<sprite.h&&!selection[i+sprite.w]))) {r=160;g=223;b=188;}
    }
    image.data.set([r,g,b,sprite.mask.data[i]?packed>>>24:0],j);
  }
  ctx.putImageData(image,0,0);
  canvasFrames.set(id,{sprite,mode,heatmap,overlays,image});
}
function update() {
  queued=false;
  let valid=false;
  attempt(() => {
    const hasLayerRoom=canAddLayer();
    if(!hasLayerRoom)draft=false;
    for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('.inspector input,.inspector select,#new-seed,#reset-palette'))if(!control.closest('.relight-panel'))control.disabled=!hasLayerRoom;
    for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('.selection-bar input,.selection-bar select,.selection-bar button'))control.disabled=!canEditMasks();
    input('use-height').disabled=!hasLayerRoom||!authoredHeight;
    canvas('source').setAttribute('aria-disabled',String(!canEditMasks()));
    canvas('source').style.cursor=canEditMasks()?'crosshair':'default';
    for (const id of rangeIds) {
      const out=element(id+'-value'),value=number(id),rounded=Math.round(value*1000)/1000;
      out.textContent=(value!==rounded?'≈':'')+String(rounded)+(['light-angle','light-height','grain-angle'].includes(id)?'°':id==='scale'||id==='bevel'?' px':'');
      out.title=String(value);
    }
    const started=performance.now();
    if(renderedRevision!==revision){committed=renderPixelArtDocument2D(project);renderedRevision=revision;}
    const nextOutputKey=`${revision}:${previewVersion}:${draft}:${editingMaterialId??''}`;
    if(!cachedOutput||outputKey!==nextOutputKey){cachedOutput=draft?(editingMaterialId?renderPixelArtDocument2D(outputProject()):createPixelMaterial2D(settings()).shade(committed,
      {...pendingLayer(),...(input('use-height').checked&&authoredHeight?{height:authoredHeight}:{})})):committed;outputKey=nextOutputKey;}
    rendered=paintPreview??cachedOutput;
    const style=select('expected-style').value as 'organic'|'cel-shaded'|'geometric';
    const options={expectedStyle:style,protected:protectedMask};
    const key=`${revision}:${style}:${protectionVersion}`;
    if(key!==beforeAnalysisKey||!beforeAnalysis){beforeAnalysis=diagnosePixelArt2D(committed,options);beforeAnalysisKey=key;}
    // During a stroke, show the last completed analysis; expensive region diagnosis runs once at commit.
    if(!afterAnalysis||!paintPreview&&(analysisSource!==rendered||analysisKey!==key)){
      afterAnalysis=diagnosePixelArt2D(rendered,options);analysisSource=rendered;analysisKey=key;
    }
    const before=beforeAnalysis,after=afterAnalysis;
    paint('source',committed);paint('result',rendered,select('view').value,after.heatmap);sizeCanvases();
    element('source-size').textContent=`${project.width} × ${project.height}`;
    element('metric-flat').textContent=`${(after.metrics.dominantFlatRegionRatio*100).toFixed(1)}%`;
    element('metric-flat-before').textContent=`적용 전 ${(before.metrics.dominantFlatRegionRatio*100).toFixed(1)}%`;
    element('metric-colors').textContent=String(after.metrics.paletteSize);
    element('metric-colors-before').textContent=`적용 전 ${before.metrics.paletteSize}색`;
    element('metric-edge').textContent=`${after.metrics.longestStraightRun} px`;
    element('metric-noise').textContent=`${(after.metrics.isolatedColorRatio*100).toFixed(1)}%`;
    const descriptions={'flat-region':'비슷한 색이 연결된 넓은 면','straight-contour':'길게 이어지는 직선 윤곽','color-noise':'주변과 떨어진 작은 색 점'};
    element('issues').replaceChildren(...after.issues.slice(0,5).map(issue=>{const li=document.createElement('li');li.textContent=`${descriptions[issue.kind]} · (${issue.x}, ${issue.y}) · ${issue.area} px`;return li;}));
    if(!after.issues.length){const li=document.createElement('li');li.textContent='현재 기준에서 별도로 표시할 검토 위치가 없습니다.';element('issues').append(li);}
    const count=selection.reduce((n,v,i)=>n+Number(v>0&&!protectedMask[i]&&committed.mask.data[i]>0&&(committed.pixels[i]>>>24)>0),0);
    element('selection-count').textContent=`선택 ${count.toLocaleString()} px · 보호 ${protectedMask.reduce((n,v)=>n+Number(v>0),0).toLocaleString()} px`;
    element('render-state').textContent=draft?'PREVIEW':'APPLIED';
    element('result-caption').textContent=!hasLayerRoom?'적용한 결과를 표시합니다. 실행 취소로 레이어를 줄이면 재질 편집을 계속할 수 있습니다.':draft?'설정을 바꿔 비교한 뒤, 선택 영역에 재질을 적용하세요.':'적용한 레이어를 원본에서 다시 계산한 결과입니다.';
    element('layer-count').textContent=String(project.layers.length);
    workbench?.sync();
    element('empty-layers').hidden=project.layers.length>0;
    button('undo').disabled=!history.canUndo;button('redo').disabled=!history.canRedo;
    timeline?.sync();
    button('apply-material').disabled=!draft||!count||!hasLayerRoom;
    button('apply-material').textContent=editingMaterialId?'수정한 재질 적용':'선택 영역에 재질 적용';
    button('cancel-preview').disabled=!draft;
    if(!element('status').classList.contains('error'))status(hasLayerRoom?`${paintPreview?'편집 중':draft?'미리보기':'적용 완료'} · ${Math.round(performance.now()-started)} ms · ${after.metrics.paletteSize}색`:`이 해상도의 레이어 한도 ${pixelArtLayerLimit2D(project.width,project.height)}개 · 실행 취소하면 계속 편집할 수 있습니다.`);
    element('result').dataset.ready='true';
    valid=true;
  });
  return valid;
}
function schedule() {if(!queued){queued=true;requestAnimationFrame(update);}}
function changed() {element('status').classList.remove('error');paintPreview=undefined;previewVersion++;draft=canAddLayer();schedule();recovery?.changed();}
function masksChanged() {element('status').classList.remove('error');paintPreview=undefined;previewVersion++;schedule();recovery?.changed();}
function study() {
  const shape=select('shape').value;
  if(shape==='imported')return;
  timeline?.close();
  const result=createPixelArtStudy2D(shape as PixelArtStudyShape2D,number('seed'),input('organic').checked);
  project={...createPixelArtDocument2D(result.sprite,`POKU ${shape}`),authoredHeight:Array.from(result.height)};
  workbench?.restorePalette();
  sourceAuthoredHeight=result.height;authoredHeight=result.height;materialOrigin=undefined;editingMaterialId=undefined;paintPreview=undefined;
  selection=result.sprite.mask.data.slice();protectedMask=new Uint8Array(selection.length);resetHistory();revision++;draft=true;
  input('use-height').disabled=false;input('use-height').checked=true;
  input('organic').disabled=!['stone-path','boulder'].includes(shape);
  schedule();recovery?.changed();
}
function resetMaterial() {
  const kind=select('material').value as PixelMaterialKind2D;
  const seed=number('seed');
  loadSettings({kind,seed,roughness:kind==='metal'?.25:kind==='crystal'?.3:.65,scale:kind==='fabric'?12:15,light:[-.67,-.74,.8],ambient:.18});
  changed();
}
function addDownload(blob: Blob, filename: string) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');urls.push(url);a.href=url;a.download=filename;a.textContent=filename;
  element('downloads').prepend(a);a.click();
  while(urls.length>8){URL.revokeObjectURL(urls.shift()!);element('downloads').lastElementChild?.remove();}
  status(`저장 준비 완료 · ${filename}`);
}
function filename() {return (project.name.replace(/[^a-z0-9가-힣_-]+/gi,'-').replace(/^-|-$/g,'')||'poku-pixel-art').slice(0,80);}
function savePNG() {
  if(!update())return;const rgba=new Uint8Array(rendered.w*rendered.h*4),name=filename()+'.png';
  status('네이티브 PNG 인코딩 중…');
  for(let i=0;i<rendered.pixels.length;i++){const c=rendered.pixels[i];rgba.set([c&255,(c>>>8)&255,(c>>>16)&255,rendered.mask.data[i]?c>>>24:0],i*4);}
  void encodeRGBAPNG(rendered.w,rendered.h,rgba).then(blob=>addDownload(blob,name)).catch(error=>status(String(error),true));
}

for(const id of [...rangeIds,'seed','use-height','seamless-material'])element(id).addEventListener('input',()=>editSetting(id));
for(const id of ['view','expected-style','zoom'])element(id).addEventListener('change',schedule);
select('material').addEventListener('change',()=>attempt(resetMaterial));
select('shape').addEventListener('change',()=>attempt(()=>{
  const shape=select('shape').value;
  if(shape!=='imported'){
    select('material').value=shape==='blade'?'metal':shape==='cloth'?'fabric':shape==='crystal'?'crystal':'stone';
    select('expected-style').value=shape==='crystal'?'geometric':'organic';
    resetMaterial();study();
  }
}));
input('organic').addEventListener('change',()=>attempt(study));
button('new-seed').onclick=()=>attempt(()=>{input('seed').value=String((number('seed')+1)>>>0);editSetting('seed');});
button('reset-palette').onclick=()=>attempt(()=>{workingOptions.palette=[...PIXEL_MATERIAL_PALETTES_2D[select('material').value as PixelMaterialKind2D]];delete workingOptions.thresholds;palette(workingOptions.palette);changed();});
button('select-all').onclick=()=>{selection=Uint8Array.from(committed.pixels,(c,i)=>committed.mask.data[i]&&c>>>24?1:0);masksChanged();};
button('clear-selection').onclick=()=>{selection.fill(0);masksChanged();};
button('clear-protection').onclick=()=>{protectedMask.fill(0);protectionVersion++;masksChanged();};
button('apply-material').onclick=()=>attempt(()=>{if(draft)commitDocument(outputProject());});
button('cancel-preview').onclick=()=>{draft=false;editingMaterialId=undefined;paintPreview=undefined;previewVersion++;schedule();recovery?.changed();};
button('undo').onclick=()=>attempt(()=>moveHistory('undo'));
button('redo').onclick=()=>attempt(()=>moveHistory('redo'));
button('save-png').onclick=()=>attempt(savePNG);
button('save-project').onclick=()=>attempt(()=>{if(update())addDownload(new Blob([timeline?.serialize()??serializePixelArtDocument2D(outputProject())],{type:'application/json'}),filename()+'.poku-pixel-art.json');});
button('focus-workspace').onclick=()=>{const enabled=document.body.classList.toggle('focus-mode');button('focus-workspace').setAttribute('aria-pressed',String(enabled));button('focus-workspace').textContent=enabled?'비교 화면으로':'작업 화면 확대';schedule();};
button('import-png').onclick=()=>input('png-file').click();
button('open-project').onclick=()=>input('project-file').click();

function prepareImported(next: PixelArtDocument2D,replaceHistory=true,preparedRaster?: EditableSprite2D,restoreWorkingPalette=true) {
  if(next.width>4096||next.height>4096)throw new RangeError('브라우저 작업실에서는 가로·세로 4096픽셀 이하의 프로젝트를 사용해 주세요.');
  serializePixelArtDocument2D(next);
  const raster=preparedRaster??renderPixelArtDocument2D(next);
  if(restoreWorkingPalette)workbench?.restorePalette(next.workingPalette);
  element('status').classList.remove('error');
  project=next;select('shape').value='imported';input('organic').disabled=true;
  const last=project.layers.filter((layer):layer is PixelArtMaterialLayer2D=>layer.kind==='material').at(-1);
  sourceAuthoredHeight=next.authoredHeight?Float32Array.from(next.authoredHeight):last?.height?Float32Array.from(last.height):undefined;
  authoredHeight=renderPixelArtAuthoredHeight2D(sourceAuthoredHeight&&!next.authoredHeight?{...next,authoredHeight:Array.from(sourceAuthoredHeight)}:next);
  materialOrigin=last?.origin?[...last.origin]:undefined;
  input('use-height').checked=!!authoredHeight;input('use-height').disabled=!authoredHeight;
  selection=next.selection?Uint8Array.from(next.selection):last?.selection?Uint8Array.from(last.selection):Uint8Array.from(project.pixels,(c,i)=>(project.mask?.[i]??1)&&c>>>24?1:0);
  protectedMask=next.protectedMask?Uint8Array.from(next.protectedMask):last?.protectedMask?Uint8Array.from(last.protectedMask):new Uint8Array(selection.length);protectionVersion++;
  if(last)loadSettings(last.material);
  else if(workingOptions.tileSize){
    // The UI mode follows a new canvas; authored material layers retain their
    // explicit periods through loadSettings above, including non-canvas periods.
    matchTilePeriodToCanvas();
  }
  if(replaceHistory)resetHistory();revision++;committed=raster;renderedRevision=revision;draft=false;editingMaterialId=undefined;paintPreview=undefined;schedule();recovery?.changed();
}
function restoreProjectJSON(json:string) {
  const header=JSON.parse(json);
  if(header?.schema==='poku-pixel-art/v3')timeline!.open(json);
  else {
    const next=parsePixelArtDocument2D(json);
    if(next.width>4096||next.height>4096)throw new RangeError('브라우저 작업실에서는 가로·세로 4096픽셀 이하의 프로젝트를 사용해 주세요.');
    const raster=renderPixelArtDocument2D(next);timeline?.close();prepareImported(next,true,raster);
  }
}
input('project-file').onchange=async()=>{
  const file=input('project-file').files?.[0];if(!file||busy)return;busy=true;
  try{
    if(file.size>64*1024*1024)throw new RangeError('프로젝트는 64 MiB 이하로 열어 주세요.');
    restoreProjectJSON(await file.text());
  }
  catch(error){status(String(error),true);}finally{busy=false;input('project-file').value='';}
};
input('png-file').onchange=async()=>{
  const file=input('png-file').files?.[0];if(!file||busy)return;busy=true;
  let bitmap:ImageBitmap|undefined;
  try{
    if(file.size>16*1024*1024)throw new RangeError('PNG는 16 MiB 이하로 열어 주세요.');
    const decoded=await decodePixelArtPNG(new Uint8Array(await file.arrayBuffer())),{w,h}=decoded;
    let pixels:Uint32Array;
    if(decoded.kind==='decoded')pixels=decoded.pixels;
    else{
      bitmap=await createImageBitmap(file);const c=document.createElement('canvas');c.width=w;c.height=h;
      const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);const rgba=ctx.getImageData(0,0,w,h).data;pixels=new Uint32Array(w*h);
      for(let i=0;i<pixels.length;i++)pixels[i]=(rgba[i*4]|rgba[i*4+1]<<8|rgba[i*4+2]<<16|rgba[i*4+3]<<24)>>>0;
    }
    const next=createPixelArtDocument2D({w,h,pixels,mask:{w,h,data:Uint8Array.from(pixels,p=>p>>>24?1:0)}},file.name.replace(/\.png$/i,''));
    timeline?.close();prepareImported(next);
    element('import-note').textContent=decoded.kind==='decoded'
      ?`PNG 원본 RGB·알파를 그대로 가져왔습니다.${decoded.warnings.length?' 색상 프로파일은 원본 수치 보존을 위해 변환하지 않았습니다.':''}`
      :`${decoded.reason==='16-bit'?'16비트':'Adam7 인터레이스'} PNG를 브라우저에서 변환했습니다. 원본 수치를 그대로 편집하려면 비인터레이스 8비트 PNG를 사용하세요.`;
  }catch(error){status(String(error),true);}finally{bitmap?.close();busy=false;input('png-file').value='';}
};

function point(event: PointerEvent): [number,number] {
  const c=canvas('source'),r=c.getBoundingClientRect();
  return [Math.floor((event.clientX-r.left)*c.width/r.width),Math.floor((event.clientY-r.top)*c.height/r.height)];
}
function connected(x:number,y:number,add:boolean) {
  const w=project.width,h=project.height;if(x<0||y<0||x>=w||y>=h)return;
  const start=y*w+x,reference=committed.pixels[start];if(!(reference>>>24)||!committed.mask.data[start])return;
  const tolerance=Math.max(0,Math.min(100,number('tolerance'))),seen=new Uint8Array(w*h),queue=new Uint32Array(w*h);
  let head=0,tail=0;queue[tail++]=start;seen[start]=1;if(!add)selection.fill(0);
  while(head<tail){const i=queue[head++],c=committed.pixels[i];if(!(c>>>24)||!committed.mask.data[i]||Math.max(Math.abs((c&255)-(reference&255)),Math.abs(((c>>>8)&255)-((reference>>>8)&255)),Math.abs(((c>>>16)&255)-((reference>>>16)&255)))>tolerance)continue;
    selection[i]=1;const px=i%w,py=Math.floor(i/w);
    for(const n of [px>0?i-1:-1,px+1<w?i+1:-1,py>0?i-w:-1,py+1<h?i+w:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}
  }
}
function brush(x:number,y:number) {
  const tool=select('selection-tool').value,r=Math.max(1,Math.min(32,number('brush-size')))/2;
  const target=tool==='protect'||tool==='unprotect'?protectedMask:selection,value=tool==='erase'||tool==='unprotect'?0:1;
  if(target===protectedMask)protectionVersion++;
  for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(project.height-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(project.width-1,Math.ceil(x+r));px++){
    const i=py*project.width+px;if((px-x)**2+(py-y)**2<=r*r&&committed.mask.data[i]&&(committed.pixels[i]>>>24))target[i]=value;
  }
}
let pointer:number|undefined,lastPoint:[number,number]|undefined;
canvas('source').onpointerdown=event=>{
  if(event.button!==0||!canEditMasks())return;const [x,y]=point(event);event.preventDefault();
  if(select('selection-tool').value==='connected'){connected(x,y,event.shiftKey);masksChanged();return;}
  pointer=event.pointerId;lastPoint=[x,y];canvas('source').setPointerCapture(pointer);brush(x,y);masksChanged();
};
canvas('source').onpointermove=event=>{
  if(pointer!==event.pointerId||!lastPoint||!canEditMasks())return;const next=point(event),dx=next[0]-lastPoint[0],dy=next[1]-lastPoint[1],steps=Math.max(1,Math.abs(dx),Math.abs(dy));
  for(let i=1;i<=steps;i++)brush(Math.round(lastPoint[0]+dx*i/steps),Math.round(lastPoint[1]+dy*i/steps));lastPoint=next;masksChanged();
};
const endStroke=()=>{const previous=pointer;pointer=undefined;lastPoint=undefined;if(previous!==undefined&&canvas('source').hasPointerCapture(previous))canvas('source').releasePointerCapture(previous);};
canvas('source').onpointerup=endStroke;canvas('source').onpointercancel=endStroke;
new ResizeObserver(schedule).observe(element('source-host'));
window.addEventListener('resize',schedule);
window.addEventListener('beforeunload',()=>urls.forEach(url=>URL.revokeObjectURL(url)));
workbench=installPixelArtWorkbench({
  document:()=>project, outputDocument:outputProject, committed:()=>committed, output:()=>rendered,
  selection:()=>selection, protection:()=>protectedMask,
  palette:()=>createPixelMaterial2D(settings()).options.palette,
  setPalette:colors=>{workingOptions.palette=[...colors];delete workingOptions.thresholds;palette(colors);changed();},
  setSelection:mask=>{selection=mask;previewVersion++;element('status').classList.remove('error');schedule();recovery?.changed();},
  paletteChanged:()=>{previewVersion++;schedule();recovery?.changed();},
  commit:commitDocument, load:prepareImported,
  newCanvas:next=>{if(timeline?.enabled){timeline.newDocument(next);return;}history.commit(outputProject());prepareImported(next,false);history.commit(project);},
  preview:sprite=>{paintPreview=sprite;if(sprite)element('status').classList.remove('error');schedule();},
  refresh:schedule, status, download:addDownload, filename,
  discardPreview:()=>{draft=false;editingMaterialId=undefined;paintPreview=undefined;previewVersion++;schedule();recovery?.changed();},
  editMaterial:id=>attempt(()=>{
    const layer=project.layers.find((layer):layer is PixelArtMaterialLayer2D=>layer.id===id&&layer.kind==='material');
    if(!layer||layer.locked)return;
    editingMaterialId=id;loadSettings(layer.material);
    selection=layer.selection?Uint8Array.from(layer.selection):new Uint8Array(project.width*project.height).fill(1);
    protectedMask=layer.protectedMask?Uint8Array.from(layer.protectedMask):new Uint8Array(selection.length);protectionVersion++;
    authoredHeight=layer.heightSource==='authored'?renderPixelArtAuthoredHeight2D({...project,layers:project.layers.slice(0,project.layers.indexOf(layer))}):layer.height?Float32Array.from(layer.height):undefined;materialOrigin=layer.origin?[...layer.origin]:undefined;
    input('use-height').checked=!!authoredHeight;previewVersion++;draft=true;schedule();
  }),
});
timeline=installPixelArtTimeline({
  outputDocument:outputProject,restore:(next,raster)=>prepareImported(next,false,raster,false),finishStroke:()=>workbench?.finishStroke(),
  palette:()=>workbench!.palette(),setPalette:colors=>workbench!.setAuthoredPalette(colors),
  workingPalette:()=>workbench!.authoredPalette(),restorePalette:colors=>workbench!.restorePalette(colors),
  refresh:schedule,status,download:addDownload,filename,
});
installPixelArtViewport();
attempt(()=>{resetMaterial();study();});
recovery=installPixelArtRecovery({
  snapshot:()=>({json:timeline?.serialize()??serializePixelArtDocument2D(outputProject()),name:project.name,frames:timeline?.frameCount??1}),
  restore:restoreProjectJSON,finish:()=>{if(busy)throw new Error('파일을 불러오는 중입니다. 완료한 뒤 복구본을 저장하거나 열어 주세요.');endStroke();workbench?.finishStroke();},
});
