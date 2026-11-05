import { resolveProject, type ResolvedProject } from './project.js';
import { createRecipeEffect } from './recipes.js';
import { createFrame, clearFrame, createFx, painterFor,sceneCameraOffset } from '../core/fx.js';
import { createAct, actBounds } from '../core/act.js';
import { drawActor, stockActor, actorAlphaOf } from '../core/actor.js';
import { resolveEffectExport, resolveActExport, exportLayout2D, edgeFade,transformExportSockets,transformExportContacts,collectAssetEvents,resolveAtlasExportSettings,type AssetSocket } from '../render/export.js';
import { enableHDRLight } from '../render/hdr.js';
import { backdrop } from '../core/scene.js';
import { loadCatalogEffect } from './registry.js';
import { createCharacterEffect } from './character-effect.js';
import { createSequenceEffect } from './sequence.js';
import { postprocessProjectFrame, prepareProjectStyle } from './edits.js';
import { compositeProjectFrame } from './composite.js';
import { BudgetCache, retainedBytes } from './cache.js';
import { pixelTransform2D } from '../core/sprite-raster.js';
import type {EffectCheckpoint, EffectInstance} from '../core/fx.js';

export interface ProjectFrameSample {
  frame: ReturnType<typeof createFrame>; rgba: Uint8ClampedArray; time: number;
  frameIndex: number; drawMs: number; cached: boolean;
  sockets?:Record<string,AssetSocket>;frozen:boolean;shake:readonly[number,number];
}
/** 2D authoring evaluator. Arbitrary legacy closures honestly replay on backward seeks; rendered cels are cached. */
export async function createProjectRuntime(input: unknown, suppliedModule?: any) {
  let project = resolveProject(input);
  if (project.kind === '3d') throw new RangeError('Use the 3D profile player for 3D projects');
  prepareProjectStyle(project);resolveAtlasExportSettings(project.exportSettings);
  const mod = suppliedModule ?? (project.kind === 'recipe' ? createRecipeEffect(project.recipe)
    : project.kind === 'character' ? createCharacterEffect(project.character, project.options.clip,project.fps)
    : project.kind === 'sequence' ? await createSequenceEffect(project.sequence,undefined,project.fps)
    : await loadCatalogEffect(project.id));
  const options:Record<string,any> = { ...project.options, seed:project.seed, layers:project.layers, ...(project.cameraMotion !== undefined?{cameraMotion:project.cameraMotion}:{}) };
  const acted = project.kind === 'act';
  let plan = resolveEffectExport(mod.meta,{fps:project.fps,seconds:project.seconds,options,margin:project.margin??0,edgeFade:project.pixelStyle?.edgeFade});
  let layout = plan.layout;
  if (acted) {
    const b=actBounds(mod,options),pad=project.pad??6;
    layout=exportLayout2D([b.x1-b.x0,b.y1-b.y0],[-b.x0,-b.y0],{flip:!!options.flip,margin:pad,x:options.x,y:options.y});
  }
  const {w,h,x,y}=layout;
  if(w*h>4_194_304)throw new RangeError('Studio native frame exceeds four megapixels; reduce canvas size or export with the CLI');
  const frame=enableHDRLight(createFrame(w,h,layout.ox,layout.oy)) as ReturnType<typeof createFrame> & {hdrLight:Float32Array;semanticMasks?:Record<string,Uint8Array>};
  const rgba=new Uint8ClampedArray(w*h*4);let bg=project.bg==='none'?null:backdrop(project.bg,w,h,y-layout.oy);
  const shifted=new Uint8ClampedArray(w*h*4);
  const make=()=>acted?createAct(mod,{...options,x,y}):createFx(mod,{...options,x,y});
  let instance=make(), last=0;
  const facts=acted?(instance as ReturnType<typeof createAct>).fx:instance as EffectInstance;
  const contacts=transformExportContacts(facts.contacts,facts.options),events=mod.eventsFor?.(facts.options)??collectAssetEvents(mod);
  const checkpoints=new Map<number,{snapshot:EffectCheckpoint;bytes:number}>();let checkpointBytes=0,lastCheckpoint=-1;
  const supportsCheckpoint=!acted&&(instance as EffectInstance).supportsCheckpoint;
  function capture(time:number){
    if(!supportsCheckpoint||time-lastCheckpoint<1)return;
    const snapshot=(instance as EffectInstance).capture(),bytes=retainedBytes(snapshot);
    if(bytes>8*1024*1024)return;
    while(checkpointBytes+bytes>8*1024*1024||checkpoints.size>=32){const key=checkpoints.keys().next().value;if(key===undefined)break;checkpointBytes-=checkpoints.get(key)!.bytes;checkpoints.delete(key);}
    checkpoints.set(time,{snapshot,bytes});checkpointBytes+=bytes;lastCheckpoint=time;
  }
  capture(0);
  // ACT events are authored before/after effect t=0; the presentation clock also includes
  // windup and earlier hit-stops. Retain only known marker times during the existing count walk.
  const markerSources=[...new Set([...contacts,...events].map((event:any)=>Number(event.sourceTime??event.t??event.at??event.time)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const markerTimes=new Map<number,number>();let nextMarker=0;
  const actPlan=acted?resolveActExport(mod,make() as ReturnType<typeof createAct>,{fps:project.fps,seconds:project.seconds,hold:project.hold},(sourceTime,frameIndex)=>{
    if(frameIndex===0)while(nextMarker<markerSources.length&&markerSources[nextMarker]<sourceTime-1e-9)nextMarker++;
    while(nextMarker<markerSources.length&&markerSources[nextMarker]<=sourceTime+1e-9)markerTimes.set(markerSources[nextMarker++],frameIndex/project.fps);
  }):null;
  const frameCount=actPlan?.n??plan.n;
  const duration=actPlan?.duration??(project.seconds??mod.meta.duration);
  type Metadata=Pick<ProjectFrameSample,'sockets'|'frozen'|'shake'>;
  const cache=new BudgetCache<{color:Uint32Array;light:Uint32Array;hdr:Float32Array;rgba:Uint8ClampedArray;time:number;masks:Record<string,Uint8Array>;metadata:Metadata}>(16*1024*1024);
  function render(time:number, frameIndex=Math.max(0,Math.floor(time*project.fps+1e-6)), useCache=true, finish=true, purpose:'preview'|'asset'='preview'):ProjectFrameSample {
    if (!Number.isFinite(time)||time<0)throw new RangeError('Presentation time must be non-negative');
    const key=`${frameIndex}:${time.toFixed(8)}:${finish}:${purpose}`, previous=useCache?cache.get(key):undefined;
    if(previous){frame.color.set(previous.color);frame.light.set(previous.light);frame.hdrLight!.set(previous.hdr);rgba.set(previous.rgba);frame.semanticMasks=Object.fromEntries(Object.entries(previous.masks).map(([n,m])=>[n,m.slice()]));return{frame,rgba,time:previous.time,frameIndex,drawMs:0,cached:true,...previous.metadata};}
    const start=performance.now();
    if(time<last){
      let closest=-1;for(const t of checkpoints.keys())if(t<=time&&t>closest)closest=t;
      if(closest>=0){(instance as EffectInstance).restore(checkpoints.get(closest)!.snapshot);last=closest;}
      else{instance=make();last=0;}
    }
    instance.update(time-last);last=time;
    capture(time);
    clearFrame(frame);
    frame.semanticMasks=Object.create(null);
    if(acted) (instance as ReturnType<typeof createAct>).draw(frame,{body:project.actor,target:project.target});
    else {
      const fx=instance as ReturnType<typeof createFx>;
      fx.draw(frame,'back');
      if(mod.meta.actor&&project.actor)drawActor(painterFor(frame).place(x,y,!!options.flip,options.angle??0),fx.options.actor as any??stockActor(),actorAlphaOf(mod,mod.meta.loop?fx.t%mod.meta.duration:Math.min(fx.t,mod.meta.duration),fx.options));
      fx.draw(frame,'front');
    }
    const actual=acted?(instance as ReturnType<typeof createAct>).fx.options:(instance as EffectInstance).options;
    const pivot=acted?[(actual.x??x)-layout.ox,(actual.y??y)-layout.oy]:layout.pivot;
    const metadata:Metadata={sockets:transformExportSockets(mod.socketsAt?.(instance.t,actual),mod.meta.origin,pivot,actual),frozen:acted?(instance as ReturnType<typeof createAct>).frozen:false,shake:sceneCameraOffset(instance.shake as readonly[number,number],false,bg===null)};
    postprocessProjectFrame(frame,project,instance.t,frameIndex,{objectToWorld:pixelTransform2D(actual.x??x,actual.y??y,actual.angle??0,!!actual.flip),cameraOffset:purpose==='asset'?[0,0]:metadata.shake});
    if(!acted)edgeFade(frame,plan.settings.edgeFade);
    if(finish){
      compositeProjectFrame(frame,rgba,project,bg);
      const[sx,sy]=metadata.shake;if(sx||sy){shifted.set(rgba);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const src=(Math.max(0,Math.min(h-1,yy-sy))*w+Math.max(0,Math.min(w-1,xx-sx)))*4,dest=(yy*w+xx)*4;rgba.set(shifted.subarray(src,src+4),dest);}}
    }
    if(useCache){const masks=Object.fromEntries(Object.entries(frame.semanticMasks??{}).map(([n,m])=>[n,m.slice()]));cache.set(key,{color:frame.color.slice(),light:frame.light.slice(),hdr:frame.hdrLight!.slice(),rgba:rgba.slice(),time:instance.t,masks,metadata},w*h*(24+Object.keys(masks).length)+retainedBytes(metadata),['frame']);}
    return{frame,rgba,time:instance.t,frameIndex,drawMs:performance.now()-start,cached:false,...metadata};
  }
  function simulationKey(p:ResolvedProject){
    const {name,notes,intentRef,intentSha256,sourceRevision,renderProfile,exportSettings,pixelStyle,edits,bg,...simulation}=p;
    return JSON.stringify(simulation);
  }
  return{get project(){return project;},mod,width:w,height:h,origin:layout.pivot,duration,frameCount,loop:!!mod.meta.loop,contacts,events,frame,rgba,get bg(){return bg;},cache,render,
    /** First displayed frame reaching a known ACT marker; other effects use their native clock. */
    markerTime(sourceTime:number):number|undefined{
      if(!Number.isFinite(sourceTime))return undefined;
      if(acted)return markerTimes.get(sourceTime);
      const index=Math.max(0,Math.ceil((sourceTime-1e-9)*project.fps));
      return sourceTime>=0&&sourceTime<=duration&&index<frameCount?index/project.fps:undefined;
    },
    /** Finishing/paint edits invalidate rendered cels, while complete simulation checkpoints remain valid. */
    tryUpdateProject(input:unknown){
      const next=resolveProject(input);if(simulationKey(next)!==simulationKey(project))return false;
      prepareProjectStyle(next);resolveAtlasExportSettings(next.exportSettings);
      const nextPlan=resolveEffectExport(mod.meta,{fps:next.fps,seconds:next.seconds,options,margin:next.margin??0,edgeFade:next.pixelStyle?.edgeFade});
      const nextBg=next.bg===project.bg?bg:next.bg==='none'?null:backdrop(next.bg,w,h,y-layout.oy);
      const finishingKey=(p:ResolvedProject)=>JSON.stringify([p.renderProfile,p.pixelStyle,p.edits,p.bg]);
      const invalidate=finishingKey(next)!==finishingKey(project);
      project=next;plan=nextPlan;bg=nextBg;if(invalidate)cache.clear();return true;
    },
    get seekStats(){return{mode:supportsCheckpoint?'checkpoint':'replay',checkpoints:checkpoints.size,bytes:checkpointBytes};},
    reset(){instance=make();last=0;cache.clear();checkpoints.clear();checkpointBytes=0;lastCheckpoint=-1;capture(0);},dispose(){cache.clear();checkpoints.clear();checkpointBytes=0;}};
}
