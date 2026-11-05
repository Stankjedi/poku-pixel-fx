import { createProject, createRecipePack, parseProject, serializeProject, cloneJSON, type ResolvedProject } from '../src/authoring/project.js';
import { createProjectRuntime, type ProjectFrameSample } from '../src/authoring/runtime.js';
import { createRecipeSpec, resolveRecipe, RECIPE_KINDS, RECIPE_LAYERS, RECIPE_PARAMETERS, type RecipeKind, type RecipeLayer } from '../src/authoring/recipes.js';
import { catalogEntries, searchEffects, loadCatalogEffect } from '../src/authoring/registry.js';
import { EditHistory } from '../src/authoring/history.js';
import { PlaybackClock, integerViewport } from '../src/authoring/clock.js';
import { observationsFromReview } from '../src/authoring/review.js';
import { createTimingCurve, type TimingCurveKey } from '../src/core/timing-curve.js';
import { hex, toHex } from '../src/core/color.js';
import { createPixelStyleProfile2D } from '../src/core/pixel-style.js';
import { diagnosePixelSprite2D, diagnosePixelMotion2D } from '../src/core/pixel-tools.js';
import { createStudioCharacter2D, createCharacterAsset2D, setCharacterSocketKey2D, sampleCharacterSocketTrack2D, type CharacterAsset2D, type CharacterSocketKey2D } from '../src/core/character-asset.js';
import { characterClipTime2D } from '../src/core/character-animation.js';
import { createCharacterIdentity2D, renderCharacterPortrait2D } from '../src/core/character-identity.js';
import { pixelTransform2D, invertPixelTransform2D, transformPixelPoint2D } from '../src/core/sprite-raster.js';
import { CinematicFrameRenderer } from '../src/render/webgpu.js';
import { projectCinematicOptions } from '../src/authoring/composite.js';
import { encodeRGBAPNG } from './png.js';
import { exportProjectAtlas, type DownloadFile } from './studio-export.js';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id),select=(id:string)=>$<HTMLSelectElement>(id),button=(id:string)=>$<HTMLButtonElement>(id);
const text=(tag:string,value:string)=>{const e=document.createElement(tag);e.textContent=value;return e;};
const labels:Record<RecipeKind,[string,string,string]>={
  'thrown-blade':['투척 검','회전 · 비행 · 금속 접촉','melee/tempered-crescent'],
  'ribbon-slash':['검격 잔상','주형태 · 리본 · 타격','melee/socket-ribbon-slash'],
  lightning:['낙뢰','주 방전 · 분기 · 접지','lightning/focused-arc'],
  explosion:['폭발','압력 · 파편 · 냉각','explosions/layered-detonation'],
  flame:['불꽃','연결된 면 · 열 · 연기','fire/folded-flame'],
  portal:['포털','입구 · 전후면 · 깊이','arcane/depth-portal'],
};
const layerNames:Record<RecipeLayer,string>={body:'주형태',trail:'잔상 / 연기',glow:'광학 발광',debris:'파편 / 보조',environment:'환경 / 그림자'};
function recipeProject(kind:RecipeKind):ResolvedProject{
  const [name,desc,id]=labels[kind],intentRef=`authoring/${id}.intent.json`;
  return createProject({id,kind:'recipe',name,seed:1,fps:30,bg:'dark',intentRef,notes:desc,recipe:createRecipeSpec(kind,{intentRef}),layers:{},actor:false,target:false});
}
let project=recipeProject('thrown-blade'),history=new EditHistory(project),runtime:Awaited<ReturnType<typeof createProjectRuntime>>|undefined;
const clock=new PlaybackClock(),stage=$<HTMLCanvasElement>('stage'),ctx=stage.getContext('2d')!;
const native=document.createElement('canvas'),nativeCtx=native.getContext('2d')!,onionCanvas=document.createElement('canvas');
const shiftedCanvas=document.createElement('canvas');
let rgbaImage:ImageData,latest:ProjectFrameSample|undefined,dirty=true,loadGeneration=0,renderGeneration=0,gpu:CinematicFrameRenderer|undefined;
let lastFrame=-1,lastView='',view={x:0,y:0,width:1,height:1,scale:1,clipped:false},renderError='',drawing=false;
let showSockets=false;
let clipDetailsOpen=false,socketDetailsOpen=false,selectedSocket='hand.grip';
let newSocketMode:'delta'|'override'='delta';
const urls:string[]=[];
function status(message:string,error=false){$('status').textContent=message;$('status').style.color=error?'#f2aa92':'';}
function attempt(task:()=>void|Promise<void>){try{void Promise.resolve(task()).catch(error=>status(String(error),true));}catch(error){status(String(error),true);}}
function linkFile(file:DownloadFile,container=$('downloads')){const a=document.createElement('a'),url=URL.createObjectURL(file.blob);urls.push(url);a.href=url;a.download=file.name;a.textContent=file.name;container.append(a);return a;}
function clearDownloads(){for(const url of urls)URL.revokeObjectURL(url);urls.length=0;$('downloads').replaceChildren();}
function download(name:string,blob:Blob){const a=linkFile({name,blob});a.click();}
function record(){history.commit(project);button('undo').disabled=!history.canUndo;button('redo').disabled=!history.canRedo;}
async function setProject(next:unknown,mode:'commit'|'history'|'reset'='commit',keepTime=true){
  const candidate=createProject(next as ResolvedProject),generation=++loadGeneration;
  if(candidate.kind==='3d'){sessionStorage.setItem('poku-studio-3d-project',serializeProject(candidate));location.href='3d.html';return;}
  status('프로젝트를 준비하는 중');
  const built=runtime?.tryUpdateProject(candidate)?runtime:await createProjectRuntime(candidate);
  if(generation!==loadGeneration){if(built!==runtime)built.dispose();return;}
  const time=keepTime?clock.time:built.mod.meta.heroTime??0;if(runtime!==built)runtime?.dispose();runtime=built;project=built.project;
  clock.duration=built.duration;clock.loop=built.loop;clock.seek(Math.min(time,built.duration));
  if(mode==='reset')history.reset(project);else if(mode==='commit')history.commit(project);
  native.width=built.width;native.height=built.height;onionCanvas.width=built.width;onionCanvas.height=built.height;
  shiftedCanvas.width=built.width;shiftedCanvas.height=built.height;
  rgbaImage=new ImageData(built.width,built.height);dirty=true;lastFrame=-1;latest=undefined;renderError='';
  renderControls();await setupRenderer();
  const fallback=gpu?.status.backend==='cpu'&&project.renderProfile?.backend==='webgpu'?` · CPU fallback: ${gpu.status.reason??'GPU 사용 불가'}`:'';
  try{localStorage.setItem('poku-studio-autosave',serializeProject(project));status('프로젝트 준비됨 · 변경 사항 자동 저장'+fallback);}catch{status('프로젝트 준비됨 · 자동 저장 공간이 부족합니다. 프로젝트 저장을 사용하세요.'+fallback);}
}
async function mutate(change:(p:ResolvedProject)=>void){const next=cloneJSON(project);change(next);await setProject(next);}
async function setupRenderer(){
  const generation=++renderGeneration;gpu?.dispose();gpu=undefined;
  if(select('backend').value!=='webgpu')return;
  const created=await CinematicFrameRenderer.create(native,{backend:'webgpu'});
  if(generation!==renderGeneration){created.dispose();return;}gpu=created;dirty=true;
  if(created.status.backend==='cpu')status(`CPU로 렌더링 중 · ${created.status.reason??'WebGPU를 사용할 수 없습니다'}`);
}
function displaySize(){
  const bounds=$('viewport').getBoundingClientRect(),ratio=devicePixelRatio||1,w=Math.max(1,Math.round(bounds.width*ratio)),h=Math.max(1,Math.round(bounds.height*ratio));
  if(stage.width!==w||stage.height!==h){stage.width=w;stage.height=h;dirty=true;}
  if(!runtime)return;
  const zoom=select('zoom').value;
  view=integerViewport(runtime.width,runtime.height,w,h);
  if(zoom==='fit'){const scale=Math.min(w/runtime.width,h/runtime.height);view={scale,width:runtime.width*scale,height:runtime.height*scale,x:(w-runtime.width*scale)/2,y:(h-runtime.height*scale)/2,clipped:false};}
  else if(zoom!=='integer'){const scale=Number(zoom),width=runtime.width*scale,height=runtime.height*scale;view={scale,width,height,x:Math.floor((w-width)/2),y:Math.floor((h-height)/2),clipped:width>w||height>h};}
  $('view-label').textContent=`${runtime.width} × ${runtime.height} · ${view.scale.toFixed(zoom==='fit'?2:0)}× 기기 픽셀${zoom==='fit'?' · 화면 맞춤':view.clipped?' · 1× 이상, 가장자리 잘림':' · 정수 배율'}`;
}
function diagnostic(sample:ProjectFrameSample,previous?:Uint32Array):Uint8ClampedArray{
  const rgba=sample.rgba.slice(),mode=select('diagnostic').value,f=sample.frame;
  if(mode==='color')return rgba;
  if(mode==='silhouette')for(let i=0;i<f.color.length;i++){const alpha=f.color[i]>>>24;rgba.set([217,238,227,alpha],i*4);}
  if(mode==='value')for(let i=0;i<rgba.length;i+=4){const v=Math.round(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2]);rgba[i]=rgba[i+1]=rgba[i+2]=v;}
  if(mode==='gaps'){
    const result=diagnosePixelSprite2D({w:f.w,h:f.h,pixels:f.color,mask:{w:f.w,h:f.h,data:Uint8Array.from(f.color,c=>c>>>24?1:0)}},{masks:(f as any).semanticMasks,palette:project.pixelStyle?.finalColorPolicy==='palette-locked'?project.pixelStyle.palette:undefined});
    for(let i=0;i<result.heatmap.length;i++)if(result.heatmap[i])rgba.set(result.heatmap[i]===255?[255,75,90,255]:[255,185,55,255],i*4);
    $('view-label').textContent+=` · 계약 위반 ${result.issues.filter(i=>i.confidence==='contract').length} / 검토 후보 ${result.issues.filter(i=>i.confidence==='heuristic').length}`;
  }
  if(mode==='motion'&&previous){
    const frames=[previous,f.color].map((pixels,i)=>({time:Math.max(0,sample.time-(1-i)/project.fps),sprite:{w:f.w,h:f.h,pixels,mask:{w:f.w,h:f.h,data:Uint8Array.from(pixels,c=>c>>>24?1:0)}}}));
    const result=diagnosePixelMotion2D(frames);
    for(let i=0;i<result.heatmap.length;i++)if(result.heatmap[i])rgba.set([245,169,90,255],i*4);
    $('view-label').textContent+=` · 전 프레임과 ${result.pairs[0]?.changed??0}셀 변화`;
  }
  return rgba;
}
function render(){
  if(!runtime||!rgbaImage)return;
  const frameIndex=Math.floor(clock.time*project.fps+1e-6),time=Math.min(runtime.duration,frameIndex/project.fps),viewKey=[select('diagnostic').value,input('onion').checked,select('zoom').value].join(':');
  if(!dirty&&frameIndex===lastFrame&&viewKey===lastView)return;
  displaySize();let previous:Uint32Array|undefined;
  if((input('onion').checked||select('diagnostic').value==='motion')&&frameIndex>0){
    const old=runtime.render((frameIndex-1)/project.fps,frameIndex-1);previous=old.frame.color.slice();
    if(input('onion').checked)onionCanvas.getContext('2d')!.putImageData(new ImageData(old.rgba.slice(),runtime.width,runtime.height),0,0);
  }
  const mode=select('diagnostic').value,gpuFinish=!!gpu&&mode==='color';
  latest=runtime.render(time,frameIndex,true,!gpuFinish);
  if(gpuFinish){gpu!.render(latest.frame,projectCinematicOptions(project,runtime.bg));shiftNativeCanvas(latest.shake);}
  else{rgbaImage.data.set(diagnostic(latest,previous));nativeCtx.putImageData(rgbaImage,0,0);}
  ctx.clearRect(0,0,stage.width,stage.height);ctx.imageSmoothingEnabled=false;
  if(input('onion').checked&&frameIndex>0){ctx.globalAlpha=.22;ctx.drawImage(onionCanvas,view.x,view.y,view.width,view.height);ctx.globalAlpha=1;}
  ctx.drawImage(native,view.x,view.y,view.width,view.height);
  if(input('show-sockets')?.checked&&latest.sockets){
    ctx.strokeStyle='#edbc72';ctx.fillStyle='#edbc72';ctx.font=`${Math.max(10,10*devicePixelRatio)}px monospace`;
    for(const [name,s] of Object.entries(latest.sockets)){if(s.visible===false)continue;const x=view.x+(s.x+latest.shake[0])*view.scale,y=view.y+(s.y+latest.shake[1])*view.scale;ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();ctx.fillText(name,x+5,y-4);}
  }
  $('time').textContent=`${time.toFixed(2)} / ${runtime.duration.toFixed(2)} s · f${frameIndex}`;input('timeline').value=String(clock.time);
  button('play').textContent=clock.playing?'일시 정지':'재생';
  const backend=gpu?.status.backend==='webgpu'?`WebGPU${gpu.status.adapter?.software?' (소프트웨어 어댑터)':''}`:'CPU';
  const timing=gpu?.timings;
  $('performance').textContent=`${backend} · 그리기 ${latest.drawMs.toFixed(1)} ms · 캐시 ${(runtime.cache.bytes/1048576).toFixed(1)} MiB${timing?` · 업로드 ${timing.upload.toFixed(1)} ms${timing.gpu===null?'':` · GPU ${timing.gpu.toFixed(1)} ms`}`:''}`;
  lastFrame=frameIndex;lastView=viewKey;dirty=false;
}
function shiftNativeCanvas([dx,dy]:readonly[number,number]){
  if(!dx&&!dy)return;const w=native.width,h=native.height,copy=shiftedCanvas.getContext('2d')!;copy.clearRect(0,0,w,h);copy.drawImage(native,0,0);nativeCtx.clearRect(0,0,w,h);nativeCtx.imageSmoothingEnabled=false;
  function spans(size:number,delta:number){delta=Math.max(-size,Math.min(size,delta));const out:{src:number;len:number;dest:number;size:number}[]=[];if(delta>0)out.push({src:0,len:1,dest:0,size:delta});const start=Math.max(0,delta),end=Math.min(size,size+delta);if(end>start)out.push({src:start-delta,len:end-start,dest:start,size:end-start});if(delta<0)out.push({src:size-1,len:1,dest:size+delta,size:-delta});return out;}
  for(const x of spans(w,dx))for(const y of spans(h,dy))nativeCtx.drawImage(shiftedCanvas,x.src,y.src,x.len,y.len,x.dest,y.dest,x.size,y.size);
}
function animate(now:number){
  clock.tick(now,!document.hidden);
  try{render();}catch(error){const message=String(error);if(message!==renderError){status(message,true);renderError=message;}clock.playing=false;}
  requestAnimationFrame(animate);
}
new ResizeObserver(()=>{displaySize();dirty=true;}).observe($('viewport'));
document.addEventListener('visibilitychange',()=>clock.suspend());

function labelControl(container:HTMLElement,title:string,control:HTMLElement){const label=text('label',title);label.append(control);container.append(label);return label;}
function choice(container:HTMLElement,label:string,values:readonly string[],value:string,change:(value:string)=>void){const control=document.createElement('select');for(const v of values){const option=text('option',v) as HTMLOptionElement;option.value=v;control.append(option);}control.value=value;control.addEventListener('change',()=>change(control.value));labelControl(container,label,control);return control;}
function numberControl(container:HTMLElement,label:string,value:number,min:number,max:number,change:(value:number)=>void){const control=document.createElement('input');Object.assign(control,{type:'number',min:String(min),max:String(max),value:String(value)});control.addEventListener('change',()=>{if(control.checkValidity())change(Number(control.value));else control.reportValidity();});labelControl(container,label,control);return control;}
function renderControls(){
  $('project-name').textContent=project.name;button('undo').disabled=!history.canUndo;button('redo').disabled=!history.canRedo;
  input('seed').value=String(project.seed);input('fps').value=String(project.fps);input('duration').value=String(runtime!.duration);
  select('background').value=project.bg;input('timeline').max=String(runtime!.duration);input('timeline').step=String(1/project.fps);
  $<HTMLTextAreaElement>('intent').value=project.notes;input('intent-ref').value=project.intentRef??'';
  $<HTMLTextAreaElement>('project-json').value=serializeProject(project);
  const ps=project.pixelStyle;select('color-policy').value=ps?.finalColorPolicy??'cinematic';select('alpha-policy').value=ps?.alpha??'coverage';select('outline-policy').value=ps?.outline??'none';select('dither-anchor').value=ps?.dither?.anchor??'object';
  select('backend').value=project.renderProfile?.backend==='webgpu'?'webgpu':'cpu';
  $('target-label').hidden=project.kind!=='character';
  renderParameters();renderLayers();renderPath();renderCurve();renderCharacter();renderMarkers();
}
function renderParameters(){
  const container=$('parameters');container.replaceChildren();
  if(project.kind!=='recipe'){
    const options=project.options;
    for(const [key,value] of Object.entries(runtime?.mod.meta.options??{})){
      if(['actor','seed','actorSelection','layers'].includes(key))continue;
      if(typeof value==='number')numberControl(container,key,options[key]??value,-10000,10000,v=>attempt(()=>mutate(p=>{p.options[key]=v;})));
      else if(typeof value==='boolean')choice(container,key,['false','true'],String(options[key]??value),v=>attempt(()=>mutate(p=>{p.options[key]=v==='true';})));
    }
    if(project.kind==='act'){
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=project.actor;checkbox.onchange=()=>attempt(()=>mutate(p=>{p.actor=checkbox.checked;}));labelControl(container,'캐릭터 포함',checkbox);
      const importActor=text('button','캐릭터 파일 연결') as HTMLButtonElement;
      importActor.onclick=()=>{const file=document.createElement('input');file.type='file';file.accept='.json';file.onchange=()=>attempt(async()=>{const selected=file.files?.[0];if(!selected)return;const data=JSON.parse(await selected.text()),asset=createCharacterAsset2D(data.schema==='poku.project/v1'?data.character:data);await mutate(p=>{p.actor=true;p.options.actorSelection={kind:'asset',asset,clip:asset.defaultClip,attachment:'auto'};});});file.click();};container.append(importActor);
      const selection=project.options.actorSelection;
      if(selection?.kind==='asset'){
        choice(container,'배우 클립',Object.keys(selection.asset.clips),selection.clip??selection.asset.defaultClip,clip=>attempt(()=>mutate(p=>{p.options.actorSelection.clip=clip;})));
        choice(container,'이펙트 부착 기준',['auto','root','hand','head','chest'],selection.attachment??'auto',attachment=>attempt(()=>mutate(p=>{p.options.actorSelection.attachment=attachment;})));
      }
    }
    return;
  }
  const values=project.recipe!.parameters,groups=new Map<string,HTMLElement>();
  for(const parameter of RECIPE_PARAMETERS){
    let group=groups.get(parameter.group??'일반');if(!group){group=document.createElement('fieldset');group.append(text('legend',parameter.group??'일반'));groups.set(parameter.group??'일반',group);container.append(group);}
    const update=(value:unknown)=>attempt(()=>mutate(p=>{p.recipe!.parameters[parameter.key]=value;if(parameter.key==='palette')p.options.palette=value;if(parameter.key==='travel'&&p.recipe!.kind==='thrown-blade'&&Number(value)+.94>p.recipe!.duration){scaleDuration(p,Number(value)+.94);}}));
    if(parameter.type==='number'){
      const slider=document.createElement('input'),value=text('span',`${values[parameter.key]} ${parameter.unit??''}`);Object.assign(slider,{type:'range',min:String(parameter.min),max:String(parameter.max),step:String(parameter.step??1),value:String(values[parameter.key])});
      slider.dataset.parameter=parameter.key;const label=labelControl(group,parameter.label,slider);label.prepend(value);slider.oninput=()=>{value.textContent=`${slider.value} ${parameter.unit??''}`;};slider.onchange=()=>update(Number(slider.value));
    }else if(parameter.type==='enum')choice(group,parameter.label,parameter.choices!.map(String),values[parameter.key],update);
    else if(parameter.type==='color-ramp'){
      const row=document.createElement('div');row.className='palette';(values[parameter.key] as string[]).forEach((color,i)=>{const c=document.createElement('input');c.type='color';c.value=color;c.title=`${parameter.label} ${i+1}`;c.onchange=()=>{const ramp=[...values[parameter.key]];ramp[i]=c.value;update(ramp);};row.append(c);});labelControl(group,parameter.label,row);
    }
  }
}
function scaleDuration(p:ResolvedProject,seconds:number){
  if(p.recipe){const scale=seconds/p.recipe.duration;p.recipe.duration=seconds;for(const keys of Object.values(p.recipe.tracks) as TimingCurveKey[][])for(const key of keys as {time:number}[])key.time*=scale;}
  p.seconds=seconds;
}
function renderLayers(){
  const container=$('layers');container.replaceChildren();
  if(project.kind!=='recipe'){container.append(text('p','캐릭터 장비 또는 JSON의 레이어 설정을 사용하세요.'));return;}
  for(const layer of RECIPE_LAYERS){
    const row=document.createElement('div'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=project.recipe!.layers[layer]!==false;
    labelControl(row,layerNames[layer],checkbox);checkbox.onchange=()=>attempt(()=>mutate(p=>{p.recipe!.layers[layer]=p.layers[layer]=checkbox.checked;}));
    const solo=text('button','단독') as HTMLButtonElement;solo.onclick=()=>attempt(()=>mutate(p=>{const isSolo=RECIPE_LAYERS.every(l=>p.recipe!.layers[l]===(l===layer));for(const l of RECIPE_LAYERS)p.recipe!.layers[l]=p.layers[l]=isSolo||l===layer;}));row.append(solo);container.append(row);
  }
}
function renderPath(){
  const container=$('path-fields');container.replaceChildren();if(project.recipe?.kind!=='thrown-blade')return;
  project.recipe.path.forEach((point:number[],i:number)=>{const row=document.createElement('div');row.className='path-row';point.forEach((v,axis)=>numberControl(row,`P${i} ${axis?'Y':'X'}`,v,-2048,2048,value=>attempt(()=>mutate(p=>{p.recipe!.path[i][axis]=value;}))));container.append(row);});
}
let curveDraft:TimingCurveKey[]|undefined,curveDrag=-1;
const curveCanvas=$<HTMLCanvasElement>('curve'),curveCtx=curveCanvas.getContext('2d')!;
function renderCurve(){
  const keys=curveDraft??project.recipe?.tracks[select('track').value];curveCtx.clearRect(0,0,260,110);curveCtx.strokeStyle='#29343d';curveCtx.lineWidth=1;
  for(let i=0;i<=4;i++){curveCtx.beginPath();curveCtx.moveTo(0,i*25+5);curveCtx.lineTo(260,i*25+5);curveCtx.stroke();}
  if(!keys){curveCtx.fillStyle='#8c9ca5';curveCtx.font='11px system-ui';curveCtx.fillText('레시피에서 시간 곡선을 편집합니다.',14,56);return;}
  const duration=project.recipe!.duration,curve=createTimingCurve(keys);curveCtx.beginPath();for(let x=0;x<260;x++){const y=102-curve.sample(x/259*duration).value*94;x?curveCtx.lineTo(x,y):curveCtx.moveTo(x,y);}curveCtx.strokeStyle='#b9e6d0';curveCtx.lineWidth=2;curveCtx.stroke();
  for(const key of keys){curveCtx.fillStyle='#e5ab70';curveCtx.fillRect(key.time/duration*252+2,102-key.value*94-3,6,6);}
}
function curvePosition(event:PointerEvent|MouseEvent){const r=curveCanvas.getBoundingClientRect();return{time:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width))*project.recipe!.duration,value:Math.max(0,Math.min(1,(102-(event.clientY-r.top)/r.height*110)/94))};}
curveCanvas.onpointerdown=event=>{if(!project.recipe||event.button!==0)return;const pos=curvePosition(event);curveDraft=cloneJSON(project.recipe.tracks[select('track').value]);curveDrag=curveDraft!.findIndex(k=>Math.abs(k.time-pos.time)<project.recipe!.duration*.035);if(curveDrag<0){curveDraft!.push(pos);curveDraft!.sort((a,b)=>a.time-b.time);curveDrag=curveDraft!.indexOf(pos);}curveCanvas.setPointerCapture(event.pointerId);renderCurve();};
curveCanvas.onpointermove=event=>{if(!curveDraft||curveDrag<0)return;const pos=curvePosition(event),before=curveDraft[curveDrag-1]?.time??-.001,after=curveDraft[curveDrag+1]?.time??project.recipe!.duration+.001;curveDraft[curveDrag]={time:Math.max(before+.001,Math.min(after-.001,pos.time)),value:pos.value};renderCurve();};
curveCanvas.onpointerup=()=>{if(!curveDraft)return;const keys=curveDraft;curveDraft=undefined;curveDrag=-1;attempt(()=>mutate(p=>{p.recipe!.tracks[select('track').value]=keys;}));};
curveCanvas.oncontextmenu=event=>{event.preventDefault();if(!project.recipe)return;const pos=curvePosition(event),keys=project.recipe.tracks[select('track').value] as TimingCurveKey[],index=keys.findIndex(k=>Math.abs(k.time-pos.time)<project.recipe!.duration*.04);if(index>=0&&keys.length>2)attempt(()=>mutate(p=>{p.recipe!.tracks[select('track').value].splice(index,1);}));};
select('track').onchange=renderCurve;

function renderCharacter(){
  const container=$('character-controls');container.replaceChildren();if(project.kind!=='character')return;
  const asset=runtime!.mod.character as CharacterAsset2D,clip=project.options.clip??asset.defaultClip;
  choice(container,'애니메이션',Object.keys(asset.clips),clip,value=>attempt(()=>mutate(p=>{p.options.clip=value;delete p.seconds;})));
  const alter=(change:(asset:CharacterAsset2D)=>CharacterAsset2D)=>attempt(()=>mutate(p=>{p.character=change(p.character as CharacterAsset2D);delete p.seconds;}));
  if(asset.source.kind==='human'){
    const style=asset.source.style;
    for(const [key,label,choices,fallback] of [
      ['view','시점',['front','three-quarter','side','back'],'three-quarter'],['facing','방향',['right','left'],'right'],
      ['build','체형',['slender','regular','broad'],'regular'],['hair','머리',['crop','bob','curls','swept','bun','shaved','ponytail','parted'],'bob'],
      ['outfit','의상',['shirt','tunic','jacket','sleeveless','sweater','overalls'],'jacket'],['skin','피부',['light','warm','brown','deep'],'warm'],
      ['faceShape','얼굴',['oval','round','square','long'],'oval'],['facialHair','수염',['none','beard'],'none'],
    ] as const)choice(container,label,choices,(style as Record<string,any>)[key]??fallback,value=>alter(a=>{
      const nextStyle={...(a.source as any).style,[key]:value},trait=key==='hair'?'hair':key==='outfit'?'clothing':key==='faceShape'?'face':undefined;
      const identity=a.identity?{...a.identity,body:nextStyle,portrait:{...a.identity.portrait,...(trait?{[trait]:createCharacterIdentity2D(a.id,a.name,nextStyle).portrait[trait]}:{})}}:undefined;
      return createCharacterAsset2D({...a,source:{kind:'human',style:nextStyle},...(identity?{identity}:{})});
    }));
    container.append(text('p',`기본 높이 ${asset.nativeHeight}px · 새 캐릭터의 해상도는 왼쪽에서 선택합니다.`));
  }
  for(const slot of asset.slots??[]){
    const items=Object.values(asset.equipment??{}).filter(item=>item.slots.includes(slot.id)).map(item=>item.id),overrides=asset.clips[clip].loadout;
    const selected=(overrides&&Object.hasOwn(overrides,slot.id)?overrides[slot.id]:asset.loadout?.[slot.id])??'';
    choice(container,`장비 · ${slot.id}`,['',...items],selected,value=>alter(a=>createCharacterAsset2D({...a,clips:{...a.clips,[clip]:{...a.clips[clip],loadout:{...a.clips[clip].loadout,[slot.id]:value||null}}}})));
  }
  const loadout={...asset.loadout,...asset.clips[clip].loadout},layers=[...(asset.layers??[]),...(asset.slots??[]).flatMap(slot=>loadout[slot.id]?asset.equipment![loadout[slot.id]!].layers:[])].filter(layer=>!layer.visibleIn||layer.visibleIn.includes(clip));
  const target=select('edit-target'),oldTarget=target.value;target.replaceChildren();for(const name of ['body',...layers.map(layer=>layer.id)]){const option=text('option',name) as HTMLOptionElement;option.value=name;target.append(option);}target.value=[...target.options].some(o=>o.value===oldTarget)?oldTarget:'body';
  $('target-label').hidden=false;
  const sockets=document.createElement('input');sockets.id='show-sockets';sockets.type='checkbox';sockets.checked=showSockets;sockets.onchange=()=>{showSockets=sockets.checked;dirty=true;};labelControl(container,'관절·장착점 표시',sockets);
  renderCharacterTimeline(container,asset,clip,alter);
  renderSocketEditor(container,asset,clip,alter);
  if(asset.identity){const portrait=text('button','공유 팔레트 초상화 PNG') as HTMLButtonElement;portrait.onclick=()=>attempt(async()=>{const sprite=renderCharacterPortrait2D(asset.identity!,{resolution:128}),rgba=new Uint8ClampedArray(sprite.w*sprite.h*4);for(let i=0;i<sprite.pixels.length;i++){const c=sprite.pixels[i];rgba.set([c&255,c>>>8&255,c>>>16&255,c>>>24],i*4);}download(`${asset.id}-portrait.png`,await encodeRGBAPNG(sprite.w,sprite.h,rgba));});container.append(portrait);}
}
function renderCharacterTimeline(container:HTMLElement,asset:CharacterAsset2D,clipName:string,alter:(change:(asset:CharacterAsset2D)=>CharacterAsset2D)=>void){
  const details=document.createElement('details');details.open=clipDetailsOpen;details.ontoggle=()=>{clipDetailsOpen=details.open;};details.append(text('summary','클립 시간 · 키 포즈 · 사건'));container.append(details);
  const clip=asset.clips[clipName],info=runtime!.mod.player.clipInfo(clipName);
  const change=(edit:(clip:any)=>void)=>alter(a=>{const next=cloneJSON(a.clips[clipName]);edit(next);return createCharacterAsset2D({...a,clips:{...a.clips,[clipName]:next}});});
  numberControl(details,'원화 갱신 FPS',clip.fps??60,1,240,value=>change(c=>{c.fps=value;}));
  if(clip.kind==='key-pose'){
    clip.poses.keys.forEach((key,i)=>{
      const row=document.createElement('div');row.className='key-row';
      const at=numberControl(row,`키 ${i} · 초`,key.at,0,info.duration,value=>change(c=>{c.poses.keys[i].at=value;c.poses.keys.sort((a:any,b:any)=>a.at-b.at);}));at.step='0.001';if(i===0)at.disabled=true;
      choice(row,'다음 키까지',['hold','linear','smooth'],key.interpolation??'smooth',value=>change(c=>{c.poses.keys[i].interpolation=value;}));details.append(row);
    });
    for(const [i,key] of (clip.poses.contacts??[]).entries()){
      const row=document.createElement('div');row.className='key-row';const at=numberControl(row,'발 접촉 · 초',key.at,0,info.duration,value=>change(c=>{c.poses.contacts[i].at=value;c.poses.contacts.sort((a:any,b:any)=>a.at-b.at);}));at.step='0.001';
      for(const foot of ['left','right'] as const){const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=key[foot];checkbox.onchange=()=>change(c=>{c.poses.contacts[i][foot]=checkbox.checked;});labelControl(row,foot==='left'?'왼발 고정':'오른발 고정',checkbox);}details.append(row);
    }
  }
  const events=info.events as {id:string;at:number;kind:string;socket?:string}[];
  events.forEach((event,i)=>{
    const row=document.createElement('div');row.className='key-row';
    const at=numberControl(row,`${event.kind} · ${event.id}`,event.at,0,info.loop?Math.max(0,info.duration-1/project.fps):info.duration,value=>change(c=>{c.events=cloneJSON(events);c.events[i].at=value;}));at.step='0.001';
    const remove=text('button','사건 삭제') as HTMLButtonElement;remove.onclick=()=>change(c=>{c.events=cloneJSON(events.filter((_,j)=>j!==i));});row.append(remove);details.append(row);
  });
  const add=text('button','현재 시점에 접촉 사건 추가') as HTMLButtonElement;add.onclick=()=>change(c=>{c.events=[...cloneJSON(events),{id:`contact-${crypto.randomUUID()}`,kind:'contact',at:Math.min(Math.floor(clock.time*project.fps)/project.fps,info.loop?Math.max(0,info.duration-1/project.fps):info.duration),socket:'hand.grip'}];});details.append(add);
}
function renderSocketEditor(container:HTMLElement,asset:CharacterAsset2D,clipName:string,alter:(change:(asset:CharacterAsset2D)=>CharacterAsset2D)=>void){
  const details=document.createElement('details');details.open=socketDetailsOpen;details.ontoggle=()=>{socketDetailsOpen=details.open;};details.append(text('summary','소켓 키 편집'));container.append(details);
  const refresh=text('button','현재 프레임에서 소켓 편집') as HTMLButtonElement,fields=document.createElement('div');details.append(refresh,fields);
  refresh.onclick=()=>{clock.playing=false;clock.seek(Math.floor(clock.time*project.fps+1e-6)/project.fps);dirty=true;populate();};
  function populate(){
    fields.replaceChildren();const player=runtime!.mod.player,info=player.clipInfo(clipName),clip=asset.clips[clipName],displayTime=Math.floor(clock.time*project.fps+1e-6)/project.fps,celTime=clip.fps?Math.floor(displayTime*clip.fps)/clip.fps:displayTime,t=characterClipTime2D(celTime,info.duration,info.loop).time;
    const base=player.sample(displayTime,clipName,{ignoreSocketTracks:true}),current=player.sample(displayTime,clipName),names=[...new Set([...Object.keys(base.sockets),...Object.keys(current.sockets),...Object.keys(clip.socketTracks??{})])];if(!names.includes(selectedSocket))selectedSocket=names[0]??'root';
    choice(fields,'소켓',names,selectedSocket,value=>{selectedSocket=value;populate();});
    const name=selectedSocket,track=clip.socketTracks?.[name],mode=track?.mode??(base.sockets[name]?newSocketMode:'override'),sampled=track?sampleCharacterSocketTrack2D(track,t):null,baseline=base.sockets[name]??current.sockets[name]??{position:[0,0],basisX:[1,0],basisY:[0,1],visible:true};
    const modeControl=choice(fields,'좌표 기준',['delta','override'],mode,value=>{newSocketMode=value as 'delta'|'override';populate();});modeControl.disabled=!!track;
    const key:CharacterSocketKey2D={...(sampled??{}),at:t},position:readonly[number,number]=key.position??(mode==='delta'?[0,0]:[baseline.position[0],baseline.position[1]]);
    fields.append(text('p',`${t.toFixed(3)}s 키 · ${mode==='delta'?'움직이는 소켓 기준 보정':'캐릭터 기준 절대 위치'}`));
    const write=(edit:(key:CharacterSocketKey2D)=>void)=>{clock.playing=false;const next=cloneJSON(key);edit(next);if(next.position===undefined&&next.angle===undefined&&next.basisX===undefined&&next.visible===undefined)next.position=[position[0],position[1]];alter(a=>setCharacterSocketKey2D(a,clipName,name,next,mode));};
    for(const axis of [0,1] as const){const control=numberControl(fields,axis?'위치 Y':'위치 X',position[axis],-4096,4096,value=>write(k=>{const v:[number,number]=[position[0],position[1]];v[axis]=value;k.position=v;}));control.step='0.25';}
    if(key.basisX&&key.basisY)fields.append(text('p','이 키는 방향 행렬을 사용합니다. basis와 반사 정책은 프로젝트 JSON에서 편집합니다.'));
    else{const angle=numberControl(fields,'회전 (도)',(key.angle??(mode==='delta'?0:Math.atan2(baseline.basisX[1],baseline.basisX[0])))*180/Math.PI,-3600,3600,value=>write(k=>{k.angle=value*Math.PI/180;}));angle.step='1';}
    const visibility=document.createElement('input');visibility.type='checkbox';visibility.checked=key.visible??baseline.visible;visibility.onchange=()=>write(k=>{k.visible=visibility.checked;});labelControl(fields,'소켓과 부착 장비 표시',visibility);
    choice(fields,'다음 키까지',['hold','linear'],key.interpolation??'hold',value=>write(k=>{k.interpolation=value as 'hold'|'linear';}));
    const save=text('button','현재 값으로 키 저장') as HTMLButtonElement;save.onclick=()=>write(k=>{k.position=[position[0],position[1]];});fields.append(save);
    const remove=text('button','현재 키 삭제') as HTMLButtonElement;remove.disabled=!track?.keys.some(k=>Math.abs(k.at-t)<1e-8);
    remove.onclick=()=>alter(a=>{const c=cloneJSON(a.clips[clipName]),tracks={...c.socketTracks},current=tracks[name];if(!current)return a;const keys=current.keys.filter(k=>Math.abs(k.at-t)>=1e-8);if(keys.length)tracks[name]={...current,keys};else delete tracks[name];return createCharacterAsset2D({...a,clips:{...a.clips,[clipName]:{...c,socketTracks:tracks}}});});fields.append(remove);
  }
  if(socketDetailsOpen)populate();
}
function renderMarkers(){
  const container=$('markers');container.replaceChildren();const contacts=runtime?.contacts??[],events=runtime?.events??[];
  for(const event of [...contacts.map((c:any)=>({at:c.at,label:`접촉 · ${c.material}`})),...events.map((e:any)=>({at:e.sourceTime??e.t??e.at??e.time,label:e.id??e.kind??e.type??'사건'}))].filter(e=>Number.isFinite(e.at))){
    const elapsed=runtime!.markerTime(event.at);if(elapsed===undefined)continue;
    const b=text('button',`${event.label} · ${elapsed.toFixed(2)}s`) as HTMLButtonElement;
    b.dataset.sourceTime=String(event.at);b.dataset.elapsedTime=String(elapsed);b.dataset.frame=String(Math.round(elapsed*project.fps));
    b.onclick=()=>{clock.playing=false;clock.seek(elapsed);dirty=true;};container.append(b);
  }
}

for(const kind of RECIPE_KINDS){const b=document.createElement('button');b.append(text('b',labels[kind][0]),text('span',labels[kind][1]));b.onclick=()=>attempt(()=>setProject(recipeProject(kind),'commit',false));$('recipes').append(b);}
button('new-character').onclick=()=>attempt(()=>setProject(createProject({id:'characters/wayfarer',name:'Wayfarer',kind:'character',character:createStudioCharacter2D({height:Number(select('new-character-height').value)}),options:{clip:'idle'},bg:'dark',fps:24,actor:false,target:false}),'commit',false));
$('library-count').textContent=String(catalogEntries.length);
function search(){const results=$('results');results.replaceChildren();for(const effect of searchEffects(input('search').value,20)){const b=text('button',String(effect.meta.name??effect.id)) as HTMLButtonElement;b.append(text('small',effect.id));b.onclick=()=>attempt(async()=>{const mod=await loadCatalogEffect(effect.id);await setProject(createProject({id:effect.id,name:String(mod.meta.name??effect.id),kind:mod.recipe?'recipe':mod.act?'act':'2d',options:{...mod.meta.options},...(mod.recipe?{recipe:mod.recipe}:{}),fps:30,bg:'dark',intentRef:`authoring/${effect.id}.intent.json`}),'commit',false);});results.append(b);}}
input('search').oninput=search;search();

button('play').onclick=()=>{if(!clock.playing&&clock.time>=clock.duration)clock.reset();clock.playing=!clock.playing;clock.suspend();dirty=true;};
button('restart').onclick=()=>{clock.reset();dirty=true;};
for(const [id,direction] of [['previous',-1],['next',1]] as const)button(id).onclick=()=>{clock.playing=false;clock.step(direction,project.fps);dirty=true;};
input('timeline').oninput=()=>{clock.playing=false;clock.seek(Number(input('timeline').value));dirty=true;};
select('speed').onchange=()=>{clock.speed=Number(select('speed').value);};
for(const id of ['onion','zoom','diagnostic'])$(id).addEventListener('change',()=>{dirty=true;});
select('background').onchange=()=>attempt(()=>mutate(p=>{p.bg=select('background').value;}));
select('backend').onchange=()=>attempt(()=>mutate(p=>{const backend=select('backend').value;p.renderProfile={...p.renderProfile,backend,mode:backend==='webgpu'?'cinematic':p.renderProfile?.mode??'legacy'};}));
input('seed').onchange=()=>attempt(()=>mutate(p=>{p.seed=Number(input('seed').value);if(p.recipe)p.recipe.seed=p.seed;}));
input('fps').onchange=()=>attempt(()=>mutate(p=>{p.fps=Number(input('fps').value);}));
input('duration').onchange=()=>attempt(()=>mutate(p=>{scaleDuration(p,Number(input('duration').value));}));
$<HTMLTextAreaElement>('intent').onchange=()=>attempt(()=>mutate(p=>{p.notes=$<HTMLTextAreaElement>('intent').value;}));
input('intent-ref').onchange=()=>attempt(()=>mutate(p=>{p.intentRef=input('intent-ref').value;if(p.recipe)p.recipe.intentRef=p.intentRef;}));
for(const id of ['color-policy','alpha-policy','outline-policy','dither-anchor'])select(id).onchange=()=>attempt(()=>mutate(p=>{
  const locked=select('color-policy').value==='palette-locked';
  const current=latest?.frame.color,characterColors=current?[...new Set(Array.from(current).filter(c=>c>>>24).map(c=>(c|0xff000000)>>>0))].slice(0,256):[];
  const palette=p.pixelStyle?.palette??(p.recipe?.parameters.palette??(p.kind==='character'&&characterColors.length?characterColors:['#172333','#34526b','#528a94','#83b9ad','#c8e3cf','#fff0d1'])).map((c:string|number)=>hex(c)>>>0);
  p.pixelStyle=createPixelStyleProfile2D({...p.pixelStyle,nativeResolution:[runtime!.width,runtime!.height],surfaceColors:locked?'indexed':'authored-rgba',palette,quantization:p.pixelStyle?.quantization??'nearest',finalColorPolicy:locked?'palette-locked':'cinematic',emission:p.pixelStyle?.emission??'linear-hdr',alpha:select('alpha-policy').value as any,outline:select('outline-policy').value as any,dither:{...p.pixelStyle?.dither,pattern:p.pixelStyle?.dither?.pattern??'bayer4',anchor:select('dither-anchor').value as any}});
}));

button('undo').onclick=()=>attempt(()=>setProject(history.undo(),'history'));
button('redo').onclick=()=>attempt(()=>setProject(history.redo(),'history'));
button('save').onclick=()=>download(project.id.replace('/','-')+'.poku-project.json',new Blob([serializeProject(project)],{type:'application/json'}));
button('apply-json').onclick=()=>attempt(()=>setProject(parseProject($<HTMLTextAreaElement>('project-json').value)));
button('open').onclick=()=>input('open-file').click();
input('open-file').onchange=()=>attempt(async()=>{const file=input('open-file').files?.[0];if(!file)return;const data=JSON.parse(await file.text());await setProject(data.schema==='poku.recipe-pack/v1'?data.project:parseProject(JSON.stringify(data)),'commit',false);input('open-file').value='';});
button('save-frame').onclick=()=>attempt(async()=>{if(!runtime)return;const index=Math.floor(clock.time*project.fps+1e-6),sample=runtime.render(index/project.fps,index),blob=await encodeRGBAPNG(runtime.width,runtime.height,sample.rgba);download(project.id.replace('/','-')+`-f${index}.png`,blob);});
button('import-review').onclick=()=>input('review-file').click();
input('review-file').onchange=()=>attempt(async()=>{
  const file=input('review-file').files?.[0];if(!file)return;const review=JSON.parse(await file.text()),container=$('observations');container.replaceChildren();
  const observations=observationsFromReview(review);
  for(const o of observations){const range=o.frameRanges[0],b=text('button',`${o.topic}${range?` · f${range.from}–${range.to}`:''}: ${o.note}`) as HTMLButtonElement;
    b.onclick=()=>{clock.playing=false;clock.seek(Math.max(0,Math.min(clock.duration,o.time??(range?.from??0)/project.fps)));if(o.layer&&RECIPE_LAYERS.includes(o.layer as RecipeLayer))select('track').value=o.layer;const control=[...document.querySelectorAll<HTMLInputElement>('[data-parameter]')].find(e=>e.dataset.parameter===o.parameter);control?.focus();renderCurve();dirty=true;};container.append(b);}
  if(!observations.length)container.append(text('p','표시할 관찰 기록이 없습니다.'));status('검토 기록을 열었습니다. 기록을 클릭하면 관련 시점으로 이동합니다.');
});

let stroke:ResolvedProject|undefined,strokeCells=new Set<string>(),strokeId='';
function paint(event:PointerEvent){
  if(!stroke||!runtime)return;const rect=stage.getBoundingClientRect(),sx=(event.clientX-rect.left)*stage.width/rect.width,sy=(event.clientY-rect.top)*stage.height/rect.height;
  const x=Math.floor((sx-view.x)/view.scale),y=Math.floor((sy-view.y)/view.scale);if(x<0||y<0||x>=runtime.width||y>=runtime.height)return;
  const tool=select('brush').value,color=tool==='erase'?null:hex(input('brush-color').value)>>>0,size=Math.max(1,Math.min(16,Number(input('brush-size').value)||1)),scope=select('edit-scope').value,frame=Math.floor(clock.time*project.fps+1e-6);
  const rgb=input('brush-color').value.match(/[\da-f]{2}/gi)!.map(s=>{const v=parseInt(s,16)/255;return (v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*2;});
  for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){
    const px=x+dx,py=y+dy,key=`${px}:${py}`;if(px>=runtime.width||py>=runtime.height||strokeCells.has(key))continue;strokeCells.add(key);
    const rawX=px-(latest?.shake[0]??0),rawY=py-(latest?.shake[1]??0);
    if(project.kind==='character'&&(tool==='color'||tool==='erase'||tool==='mask')){
      const asset=stroke.character as CharacterAsset2D,clip=project.options.clip??asset.defaultClip,sample=runtime.mod.player.sample(latest?.time??frame/project.fps,clip),base={id:`stroke-${strokeId}-${key}`,clip,target:select('edit-target').value||'body',...(scope==='frame'?{frame:sample.frameIndex}:{})};
      const inverse=invertPixelTransform2D(pixelTransform2D(runtime.origin[0],runtime.origin[1],project.options.angle??0,!!project.options.flip)),local=transformPixelPoint2D(inverse,[rawX+.5,rawY+.5]),localX=Math.floor(local[0]),localY=Math.floor(local[1]);
      // Validate the complete asset once on stroke commit, not once for every painted cell.
      if(tool==='mask')stroke.character={...asset,maskEdits:[...(asset.maskEdits??[]),{...base,name:select('mask-name').value,x:localX,y:localY,rows:[select('mask-operation').value],allowEmpty:select('mask-name').value==='negativeSpace'}]};
      else stroke.character={...asset,celEdits:[...(asset.celEdits??[]),{...base,patch:{x:localX,y:localY,rows:['x'],palette:{x:color}},semantic:select('mask-name').value}]};
    }else stroke.edits.push({frame:scope==='all'?'all':frame,x:rawX,y:rawY,color:tool==='mask'&&select('mask-operation').value==='-'?null:color,...(tool==='emission'?{channel:'emission',emission:rgb}:{}),...(tool==='mask'?{mask:select('mask-name').value}:{})} as any);
    // Native live overlay is transient; the persisted patch is re-evaluated at stroke completion.
    if(tool==='color'||tool==='erase'){ctx.fillStyle=color===null?'#e76d63':input('brush-color').value;ctx.globalAlpha=color===null ? .6 : 1;ctx.fillRect(view.x+px*view.scale,view.y+py*view.scale,view.scale,view.scale);ctx.globalAlpha=1;}
  }
}
select('brush').onchange=()=>{$('mask-label').hidden=!['mask','color','erase'].includes(select('brush').value);$('mask-operation-label').hidden=select('brush').value!=='mask';if(select('brush').value!=='none')clock.playing=false;};
stage.onpointerdown=event=>{if(select('brush').value==='none'||event.button!==0)return;clock.playing=false;render();stroke=cloneJSON(project);strokeCells.clear();strokeId=crypto.randomUUID();drawing=true;stage.setPointerCapture(event.pointerId);paint(event);};
stage.onpointermove=event=>{if(drawing)paint(event);};
stage.onpointerup=()=>{if(!drawing||!stroke)return;drawing=false;const next=stroke;stroke=undefined;attempt(()=>setProject(next));};
stage.onpointercancel=()=>{drawing=false;stroke=undefined;dirty=true;};

let exportJob:ReturnType<typeof exportProjectAtlas>|undefined;
button('export').onclick=()=>attempt(async()=>{if(exportJob)return;clearDownloads();button('export').disabled=true;$('cancel-export').hidden=false;clock.playing=false;
  const job=exportJob=exportProjectAtlas(cloneJSON(project),message=>status(message));
  try{const files=await job.promise;for(const file of files)linkFile(file);status(`내보내기 완료 · ${files.length-1}개 파일 · ZIP에 프로젝트와 자산 명세 포함`);}finally{exportJob=undefined;button('export').disabled=false;$('cancel-export').hidden=true;}
});
button('cancel-export').onclick=()=>exportJob?.cancel();
const packButton=text('button','레시피 + 제작 메모 저장') as HTMLButtonElement;
packButton.onclick=()=>download(project.id.replace('/','-')+'.recipe-pack.json',new Blob([JSON.stringify(createRecipePack(project,[{time:clock.time,note:project.notes}],project.notes?[project.notes]:[]),null,2)],{type:'application/json'}));
$('intent-ref').parentElement!.after(packButton);
document.addEventListener('keydown',event=>{
  const editing=(event.target as HTMLElement)?.matches('input,textarea,select,[contenteditable=true]');
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();button('save').click();}
  if(editing)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();button(event.shiftKey?'redo':'undo').click();}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();button('redo').click();}
  else if(event.code==='Space'){event.preventDefault();button('play').click();}
});
window.addEventListener('pagehide',()=>{exportJob?.cancel();gpu?.dispose();runtime?.dispose();for(const url of urls)URL.revokeObjectURL(url);});
attempt(async()=>{
  const effect=new URLSearchParams(location.search).get('effect');
  if(effect){const mod=await loadCatalogEffect(effect);project=createProject({id:effect,kind:mod.recipe?'recipe':mod.act?'act':'2d',name:String(mod.meta.name??effect),options:mod.meta.options??{},...(mod.recipe?{recipe:mod.recipe}:{}),fps:30});}
  else{try{const saved=localStorage.getItem('poku-studio-autosave');if(saved)project=parseProject(saved);}catch{ /* A damaged local draft must not prevent creating a new project. */ }}
  await setProject(project,'reset',false);requestAnimationFrame(animate);
});
