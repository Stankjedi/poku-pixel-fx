import { createAtlasPacker, frameContentBounds, frameDurationMs, resolveAssetEvents, resolveAtlasExportSettings, extrudeAtlasRegion, type AssetManifest } from '../src/render/export.js';
import { serializeProject, type ResolvedProject } from '../src/authoring/project.js';
import { encodeRGBAPNG } from './png.js';
import { ENGINE_VERSION } from '../src/version.js';
import { AtlasPageBuffer } from '../src/render/atlas-page.js';

export interface DownloadFile {name:string;blob:Blob}
const encoder=new TextEncoder(),MAX_BYTES=128*1024*1024;
export async function sha256(data:Blob|ArrayBuffer):Promise<string>{
  const buffer=data instanceof Blob?await data.arrayBuffer():data;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
/** Portable STORE ZIP. Blob parts avoid making a second full copy of the asset bundle. */
export async function zipFiles(files:readonly DownloadFile[]):Promise<Blob>{
  const parts:BlobPart[]=[],directory:Uint8Array[]=[];let offset=0;
  for(const file of files){
    const name=encoder.encode(file.name),bytes=new Uint8Array(await file.blob.arrayBuffer());let crc=0xffffffff;
    for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
    l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);local.set(name,30);
    const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
    c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
    parts.push(local.buffer,file.blob);directory.push(central);offset+=local.length+bytes.length;
  }
  const directoryBytes=directory.reduce((n,d)=>n+d.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,directoryBytes,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...directory.map(a=>a.buffer as ArrayBuffer),end.buffer],{type:'application/zip'});
}

/** One worker frame is in flight. Each page is encoded and released before the next page begins. */
export function exportProjectAtlas(project:ResolvedProject,onProgress:(message:string)=>void){
  const settings=resolveAtlasExportSettings({trim:true,...project.exportSettings}),PAGE=settings.maxTextureSize;
  if(PAGE>2048)throw new RangeError('브라우저 atlas는 최대 2048입니다. 더 큰 페이지는 CLI에서 내보내세요.');
  const worker=new Worker(new URL('./studio-worker.js',import.meta.url),{type:'module'}),id=1;
  let cancelled=false,settled=false,finish!:(value:DownloadFile[])=>void,fail!:(reason:unknown)=>void;
  const promise=new Promise<DownloadFile[]>((resolve,reject)=>{finish=resolve;fail=reject;});
  const packer=createAtlasPacker(PAGE,settings.padding),files:DownloadFile[]=[],records:AssetManifest['files']=[];
  const duplicates=new Map<string,{page:number;rect:{x:number;y:number;w:number;h:number}}>();let reused=0;
  const renderMode=project.renderProfile?.mode==='cinematic'?'cinematic':'legacy';
  let info:any,page=-1,pageBuffer:AtlasPageBuffer|undefined,bytes=0;
  const manifest:AssetManifest={schema:'poku-asset/v1',id:project.id,name:project.name,loop:false,durationMs:0,
    color:{format:'RGBA8888',colorSpace:'srgb',alpha:'straight'},coordinates:'untrimmed-pixel-edges-y-down',pages:[],frames:[],tags:[],
    settings:{project,renderMode,renderProfile:{...project.renderProfile,mode:renderMode},atlas:settings,assetLayers:'straight color + linear HDR emission',previewBackground:project.bg},source:{engineVersion:ENGINE_VERSION,rng:'poku-rng/v1',...(project.sourceRevision?{sourceRevision:project.sourceRevision}:{})},files:records};
  async function add(name:string,blob:Blob){
    if(cancelled)throw new Error('내보내기가 취소되었습니다.');
    bytes+=blob.size;if(bytes>MAX_BYTES)throw new RangeError('브라우저 내보내기 한도(128 MiB)를 넘었습니다. CLI asset-bundle 내보내기를 사용하세요.');
    files.push({name,blob});records.push({path:name,bytes:blob.size,sha256:await sha256(blob)});
  }
  async function flush(){
    if(page<0||!pageBuffer)return;const {w,h}=packer.pages[page],color=new Uint8Array(w*h*4),emission=new Float32Array(w*h*3);let hasEmission=false;
    const {color:pageColor,emission:pageEmission,width:stride}=pageBuffer;
    for(let y=0;y<h;y++){color.set(pageColor.subarray(y*stride*4,y*stride*4+w*4),y*w*4);emission.set(pageEmission!.subarray(y*stride*3,y*stride*3+w*3),y*w*3);}
    for(const v of emission)if(v!==0){hasEmission=true;break;}
    const name=`atlas-${page}.png`;await add(name,await encodeRGBAPNG(w,h,color));
    const entry:AssetManifest['pages'][number]={image:name,width:w,height:h};
    if(hasEmission){const name=`atlas-${page}.emission.f32`,le=new ArrayBuffer(emission.byteLength),view=new DataView(le);for(let i=0;i<emission.length;i++)view.setFloat32(i*4,emission[i],true);await add(name,new Blob([le],{type:'application/octet-stream'}));entry.emission={image:name,format:'float32-le',channels:3,colorSpace:'linear-srgb'};}
    manifest.pages.push(entry);pageBuffer=undefined;
  }
  async function message(m:any){
    if(cancelled||m.id!==id)return;
    if(m.type==='begin'){info=m;manifest.loop=m.loop;manifest.contacts=m.contacts;manifest.tags=[{name:project.options.clip??project.name,from:0,to:m.count-1,direction:'forward'}];return;}
    if(m.type==='error')throw new Error(m.message);
    if(m.type==='frame'){
      const rgba=new Uint8Array(m.rgba),emission=new Float32Array(m.emission),trim=settings.trim?frameContentBounds(info.width,info.height,rgba,emission):{x:0,y:0,w:info.width,h:info.height};
      let key='';
      if(settings.deduplicate){
        const data=new Uint8Array(8+trim.w*trim.h*16),view=new DataView(data.buffer);view.setUint32(0,trim.w,true);view.setUint32(4,trim.h,true);let at=8;
        for(let y=0;y<trim.h;y++)for(let x=0;x<trim.w;x++){
          const src=(trim.y+y)*info.width+trim.x+x;data.set(rgba.subarray(src*4,src*4+4),at);at+=4;
          for(let c=0;c<3;c++){view.setFloat32(at,emission[src*3+c],true);at+=4;}
        }
        key=await sha256(data.buffer);
      }
      const previous=settings.deduplicate?duplicates.get(key):undefined,placement=previous??packer.place(trim.w,trim.h);
      if(previous)reused++;
      else{
        if(placement.page!==page){await flush();page=placement.page;if(page>=16)throw new RangeError('브라우저 내보내기는 최대 16개 atlas 페이지입니다. CLI를 사용하세요.');pageBuffer=new AtlasPageBuffer(PAGE,{emission:true});}
        const used=packer.pages[page];pageBuffer!.ensure(used.w,used.h);
        const {color:pageColor,emission:pageEmission,width:stride}=pageBuffer!;
        for(let y=0;y<trim.h;y++){
          const source=(y+trim.y)*info.width+trim.x,dest=(placement.rect.y+y)*stride+placement.rect.x;
          pageColor.set(rgba.subarray(source*4,(source+trim.w)*4),dest*4);pageEmission!.set(emission.subarray(source*3,(source+trim.w)*3),dest*3);
        }
        if(settings.extrude){extrudeAtlasRegion(pageColor,stride,4,placement.rect,settings.extrude);extrudeAtlasRegion(pageEmission!,stride,3,placement.rect,settings.extrude);}
        if(settings.deduplicate)duplicates.set(key,placement);
      }
      manifest.frames.push({...placement,sourceSize:[info.width,info.height],trimOffset:[trim.x,trim.y],pivot:info.origin,duration:frameDurationMs(m.index,info.fps),time:m.time,frozen:m.frozen,...(m.sockets?{sockets:m.sockets}:{})});
      onProgress(`${m.index+1} / ${info.count} 프레임 · ${page+1}페이지 · 중복 ${reused}장 재사용 · 출력 ${Math.round(bytes/1048576)} MiB · 페이지 버퍼 ${((pageBuffer?.byteLength??0)/1048576).toFixed(1)} MiB`);
      worker.postMessage({type:'ack',id});return;
    }
    if(m.type==='done'){
      await flush();const json=serializeProject(project),blob=new Blob([json],{type:'application/json'});
      manifest.source.projectSha256=await sha256(blob);await add('project.json',blob);manifest.durationMs=manifest.frames.reduce((n,f)=>n+f.duration,0);
      manifest.events=resolveAssetEvents(info.events??[],manifest.frames,manifest.loop?info.effectDuration:undefined);
      files.push({name:'asset.json',blob:new Blob([JSON.stringify(manifest,null,2)+'\n'],{type:'application/json'})});
      onProgress('자산 파일을 ZIP으로 묶는 중');const zip=await zipFiles(files);
      if(cancelled)return;settled=true;worker.terminate();finish([{name:project.id.replace('/','-')+'.poku-asset.zip',blob:zip},...files]);
    }
  }
  worker.onmessage=e=>{void message(e.data).catch(error=>{if(!settled){settled=true;worker.terminate();pageBuffer=undefined;files.length=0;fail(error);}});};
  worker.onerror=e=>{if(!settled){settled=true;worker.terminate();pageBuffer=undefined;files.length=0;fail(new Error(e.message));}};
  worker.postMessage({type:'bake',id,project});
  return{promise,cancel(){if(settled)return;cancelled=true;settled=true;worker.postMessage({type:'cancel',id});worker.terminate();pageBuffer=undefined;files.length=0;fail(new Error('내보내기가 취소되었습니다.'));}};
}
