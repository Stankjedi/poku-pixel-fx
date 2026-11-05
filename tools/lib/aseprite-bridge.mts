import {existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadEffect,renderSequence,spriteSheet,frameDurationMs} from './fxlib.mjs';
import {importAsepriteSheet,asepriteSocketFrames} from './aseprite-data.mjs';
import {createLayerSheet} from './layers.mjs';
import {encodePNG} from './png.mjs';
import {decodePNG} from './png-read.mjs';
import {decodeLinearRGB,emissionProxy,restoreEmissionProxy} from './hdr-edit.mjs';
import {readProjectFile,renderProject} from './project-render.mjs';
import type {SpriteClipData2D} from '../../src/core/sprite-clip.js';
import type {AssetSocket} from '../../src/render/export.js';
const {createSpriteClip2D}=await import(new URL('../../../build/core/index.js',import.meta.url).href);
export interface AsepriteProject {
  format:'poku-aseprite-project';version:1;effectId:string;width:number;height:number;
  pivot:readonly[number,number];fps:number;durationsMs:number[];loop:boolean;
  tags:{name:string;from:number;to:number;direction:string}[];
  flattened:boolean;bakedEmission:boolean;
  sockets?:Record<string,AssetSocket>[];
  layers?:{columns:number;atlasWidth:number;atlasHeight:number;emissionScale:number;emissionSha256:string;proxySha256:string};
  projectSha256?:string;
}
function readJSON(path:string):any {
  if(statSync(path).size>32*1024*1024)throw new Error('JSON input exceeds 32 MiB');
  return JSON.parse(readFileSync(path,'utf8'));
}
export function emptyOutputDirectory(path:string):string {
  const dir=resolve(path);
  if(existsSync(dir)){if(!statSync(dir).isDirectory()||readdirSync(dir).length)throw new Error(`Refusing to overwrite nonempty output: ${dir}`);}
  else mkdirSync(dir,{recursive:true});
  return dir;
}
function writeNew(path:string,data:string|Uint8Array){writeFileSync(path,data,{flag:'wx'});}
function luaString(value:string):string {
  if(typeof value!=='string'||value.includes('\0'))throw new Error('Lua string data must be text without NUL');
  // Decimal byte escapes preserve UTF-8, leading newlines and quotes on every supported Lua version.
  return '"'+[...Buffer.from(value,'utf8')].map(byte=>byte>=32&&byte<=126&&byte!==34&&byte!==92?String.fromCharCode(byte):'\\'+String(byte).padStart(3,'0')).join('')+'"';
}
export function createAsepriteImportScript(project:AsepriteProject):string {
  const n=project.durationsMs.length;
  if(!Array.isArray(project.pivot)||project.pivot.length!==2||!project.pivot.every(Number.isFinite))throw new Error('Invalid project pivot');
  if(!Number.isInteger(project.width)||!Number.isInteger(project.height)||project.width<1||project.height<1||project.width>4096||project.height>4096||n<1||n>4096||project.width*project.height*n>16_777_216
    ||Array.from({length:n},(_,i)=>!Object.hasOwn(project.durationsMs,i)||!Number.isInteger(project.durationsMs[i])||project.durationsMs[i]<1||project.durationsMs[i]>65535).some(Boolean))throw new Error('Aseprite import needs dimensions and 1..65535 ms frame durations');
  const enums:Record<string,string>={forward:'FORWARD',reverse:'REVERSE',pingpong:'PING_PONG',pingpong_reverse:'PING_PONG_REVERSE'};
  const tags=Array.from(project.tags,tag=>{
    if(!tag||typeof tag.name!=='string')throw new Error('Invalid import tag');
    if(!Number.isInteger(tag.from)||!Number.isInteger(tag.to)||tag.from<0||tag.to<tag.from||tag.to>=n||!enums[tag.direction])throw new Error('Invalid import tag');
    return `do\n  local direction = assert(AniDir.${enums[tag.direction]}, "Aseprite version lacks tag direction")\n  local tag = s:newTag(${tag.from+1}, ${tag.to+1})\n  tag.name = ${luaString(tag.name)}\n  tag.aniDir = direction\nend`;
  }).join('\n');
  if(project.layers && (!Number.isSafeInteger(project.layers.columns)||project.layers.columns<1
    ||!Number.isSafeInteger(project.layers.atlasWidth)||!Number.isSafeInteger(project.layers.atlasHeight)
    ||!Number.isFinite(project.layers.emissionScale)||project.layers.emissionScale<=0
    ||![project.layers.emissionSha256,project.layers.proxySha256].every(v=>/^[a-f0-9]{64}$/.test(v))))throw new Error('Invalid layered Aseprite bridge');
  if(project.sockets)asepriteSocketFrames({pokuFx:{socketSamples:project.sockets}},n);
  const socketNames=[...new Set((project.sockets??[]).flatMap(frame=>Object.keys(frame??{})))];
  const socketData=socketNames.map(name=>`[${luaString('socket:'+name)}]=${luaString(JSON.stringify({pokuSocket:{frames:Object.fromEntries((project.sockets??[]).flatMap((f,i)=>f?.[name]?
    [[i,{...(f[name].angle===undefined?{}:{angle:f[name].angle}),...(f[name].visible===undefined?{}:{visible:f[name].visible}),
      ...(f[name].basisX?{basisX:f[name].basisX,basisY:f[name].basisY}:{}),...(f[name].mirrorPolicy?{mirrorPolicy:f[name].mirrorPolicy}:{})}]]:[]))}}))}`).join(',\n');
  const sockets=(project.sockets??[]).flatMap((frame,index)=>Object.entries(frame??{}).map(([name,socket])=>{
    if(index>=n||!name||!Number.isFinite(socket.x)||!Number.isFinite(socket.y)
      ||socket.angle!==undefined&&!Number.isFinite(socket.angle)||socket.visible!==undefined&&typeof socket.visible!=='boolean')throw new Error('Invalid socket frame');
    const label=luaString('socket:'+name),x=Math.round(socket.x),y=Math.round(socket.y);
    return `app.frame=s.frames[${index+1}]\ndo\n  local key=${label}\n  local slice=socketSlices[key]\n  if not slice then slice=s:newSlice(Rectangle(${x},${y},1,1)); slice.name=key; slice.data=socketData[key]; socketSlices[key]=slice end\n  slice.bounds=Rectangle(${x},${y},1,1)\n  slice.pivot=Point(0,0)\nend`;
  })).join('\n');
  const layers=project.layers?`s.layers[1].name="color"
local lightSheet=Image{fromFile=assert(app.params.emission,"Missing emission proxy")}
local lightLayer=s:newLayer();lightLayer.name="emission";lightLayer.blendMode=BlendMode.ADDITION
for i=1,#durations do
  local x=((i-1)%${project.layers.columns})*${project.width}
  local y=math.floor((i-1)/${project.layers.columns})*${project.height}
  s:newCel(lightLayer,s.frames[i],Image(lightSheet,Rectangle(x,y,${project.width},${project.height})),Point(0,0))
end`:'';
  return `-- Generated data-only bridge script. Aseprite, not POKU, writes the .aseprite file.
assert(app.activeSprite, "Open the source sheet with --oneframe first")
assert(app.command.ImportSpriteSheet, "Aseprite 1.2.26+ with ImportSpriteSheet is required")
app.command.ImportSpriteSheet { ui=false, type=SpriteSheetType.ROWS,
  frameBounds=Rectangle(0,0,${project.width},${project.height}), padding=Size(0,0), partialTiles=false }
local s = assert(app.activeSprite)
local durations = {${project.durationsMs.join(',')}}
assert(#s.frames >= #durations, "Imported sheet has fewer cells than the POKU animation")
-- Delete only known unused trailing grid cells, never intentional blank animation frames.
for i=#s.frames,#durations+1,-1 do s:deleteFrame(s.frames[i]) end
for i,ms in ipairs(durations) do
  -- The application converts seconds back to integer milliseconds. Avoid float truncation by 1 ms.
  s.frames[i].duration=(ms+0.0001)/1000
  assert(math.abs(s.frames[i].duration*1000-ms)<0.01, "Aseprite did not preserve frame timing")
end
${tags}
${layers}
app.frame=s.frames[1]
local pivotSlice=s:newSlice(Rectangle(0,0,${project.width},${project.height}))
pivotSlice.name="pivot";pivotSlice.pivot=Point(${Math.round(project.pivot[0])},${Math.round(project.pivot[1])})
local socketSlices={}
local socketData={${socketData}}
${sockets}
app.frame=s.frames[1]
local output=assert(app.params.output, "Missing --script-param output")
s:saveAs(output)
`;
}
export async function exportAsepriteProject(id:string,output:string,options:{fps?:number;effectOptions?:Record<string,unknown>;layers?:boolean;projectFile?:string}={}):Promise<AsepriteProject>{
  if(!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id))throw new Error('Effect id must be category/name');
  const prepared=options.projectFile?await renderProject(readProjectFile(options.projectFile,{
    ...(options.fps===undefined?{}:{fps:options.fps}),...(options.effectOptions===undefined?{}:{options:options.effectOptions})}),{layers:!!options.layers}):undefined;
  if(prepared&&prepared.fx.id!==id)throw new Error('Aseprite project/effect id mismatch');
  if(options.layers&&prepared?.project.kind==='3d')throw new Error('Layered Aseprite editing supports 2D color/emission. Export a 3D project flattened for painting, or use --bundle to preserve its camera-lighting and occlusion snapshots.');
  const fx=prepared?.fx??await loadEffect(id),fps=prepared?.sequence.fps??options.fps??fx.meta.fps;
  if(!Number.isInteger(fps)||fps<1||fps>240)throw new Error('Export fps must be an integer from 1 to 240');
  const expected=prepared?.sequence.n??Math.round(fx.meta.duration*fps)+(fx.meta.loop?0:1),[width,height]=fx.meta.size;
  if(![width,height,expected].every(Number.isSafeInteger)||width<1||height<1||width>4096||height>4096||expected<1||expected>4096||width*height*expected>16_777_216)throw new Error('Export exceeds sprite-clip bounds; reduce fps, canvas size or duration');
  const frames=prepared?.sequence??renderSequence(fx,{fps,bg:'none',actor:false,options:options.effectOptions,layers:options.layers});
  if(frames.w>4096||frames.h>4096||frames.w*frames.h*frames.n>16_777_216)throw new Error('Transformed export exceeds sprite-clip bounds');
  const dir=emptyOutputDirectory(output),layerSink=options.layers?createLayerSheet(join(dir,'source'),fx,frames):undefined;
  let sheet:ReturnType<typeof spriteSheet>;
  try {
    function* captured(){let i=0;for(const frame of frames.frames){layerSink?.push(frame,i++);yield frame;}}
    sheet=spriteSheet(fx,{...frames,frames:captured()},'source');
    layerSink?.finish();
  }finally{layerSink?.abort();}
  if(sheet.json.meta.size.w*sheet.json.meta.size.h>16_777_216)throw new Error('Padded atlas exceeds PNG import bounds; reduce fps, canvas size or duration');
  const durationsMs=Array.from({length:frames.n},(_,i)=>frameDurationMs(i,fps));
  sheet.json.frames.forEach((f,i)=>f.duration=durationsMs[i]);
  const project:AsepriteProject={format:'poku-aseprite-project',version:1,effectId:id,width:frames.w,height:frames.h,
    pivot:frames.pivot as [number,number],fps,durationsMs,loop:!!fx.meta.loop,tags:sheet.json.meta.frameTags,flattened:!options.layers,bakedEmission:!options.layers,
    ...(sheet.json.meta.pokuFx.socketSamples?{sockets:sheet.json.meta.pokuFx.socketSamples}:{}),...(prepared?{projectSha256:prepared.variant}:{})};
  if(options.layers){
    const raw=readFileSync(join(dir,'source.emission.f32')),light=decodeLinearRGB(raw),proxy=emissionProxy(light),size=sheet.json.meta.size;
    const png=encodePNG(size.w,size.h,proxy.rgba);writeNew(join(dir,'source.emission-proxy.png'),png);
    project.layers={columns:sheet.json.meta.pokuFx.columns,atlasWidth:size.w,atlasHeight:size.h,emissionScale:proxy.scale,
      emissionSha256:createHash('sha256').update(raw).digest('hex'),proxySha256:createHash('sha256').update(png).digest('hex')};
  }
  const script=createAsepriteImportScript(project);
  writeNew(join(dir,'source.png'),sheet.png);writeNew(join(dir,'source.json'),JSON.stringify(sheet.json,null,2));
  writeNew(join(dir,'bridge.json'),JSON.stringify(project,null,2));writeNew(join(dir,'import.lua'),script);
  if(prepared)writeNew(join(dir,'project.json'),prepared.projectJSON);
  writeNew(join(dir,'README.txt'),'POKU Pixel FX -> Aseprite project\n\nsource.png/source.json: composite reference with timing.\n'+(project.layers?'Layered mode: source.color.png and emission proxy are separate editable layers. Keep source.emission.f32 and bridge.json: unchanged pixels retain original HDR; edited proxy pixels use the declared linear scale. The Aseprite preview is not the engine cinematic compositor.\n':'Flattened mode: glow is baked into the color image.\n')+'bridge.json: frame sizes, timing, pivot and source channels. Keep it with the project.\nimport.lua: official Aseprite Lua import, run through the bridge create command and your explicitly supplied executable.\nNo .aseprite file has been written by POKU itself. See docs/ASEPRITE_BRIDGE.md.\n');
  return project;
}
export function readAsepriteProject(directory:string):AsepriteProject{
  const p=readJSON(join(resolve(directory),'bridge.json'));
  if(p?.format!=='poku-aseprite-project'||p.version!==1||!Array.isArray(p.pivot)||p.pivot.length!==2||!Number.isFinite(p.pivot[0])||!Number.isFinite(p.pivot[1])||!Array.isArray(p.durationsMs)||!Array.isArray(p.tags))throw new Error('Invalid POKU Aseprite project manifest');
  createAsepriteImportScript(p);return p;
}
export function runAseprite(executable:string,args:readonly string[],timeout=120000):string{
  if(typeof executable!=='string'||!executable.trim())throw new Error('Specify the Aseprite executable explicitly with --aseprite; nothing is auto-installed');
  const result=spawnSync(executable,[...args],{encoding:'utf8',shell:false,timeout,maxBuffer:8*1024*1024});
  if(result.error)throw new Error(`Could not run configured Aseprite executable: ${result.error.message}`);
  if(result.status!==0)throw new Error(`Aseprite exited ${result.status}: ${(result.stderr||result.stdout).trim()}`);
  return result.stdout;
}
export function checkAsepriteVersion(executable:string):string{
  const version=runAseprite(executable,['--version'],10000).trim(),m=version.match(/Aseprite\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
  if(!m)throw new Error(`Cannot verify Aseprite version: ${version}`);
  const major=+m[1],minor=+m[2],patch=+(m[3]??0);
  if(major<1||(major===1&&(minor<2||(minor===2&&patch<26))))throw new Error('Aseprite 1.2.26+ is required for script-based sheet import');
  return version;
}
export function createEditableAseprite(directory:string,executable:string):{file:string;version:string}{
  const dir=resolve(directory),project=readAsepriteProject(dir),output=join(dir,'editable.aseprite');
  if(existsSync(output))throw new Error(`Refusing to overwrite edited document: ${output}`);
  const version=checkAsepriteVersion(executable);
  // Revalidate generated script inputs, but never execute an arbitrary changed script from disk.
  const script=createAsepriteImportScript(project),scriptPath=join(dir,'import.lua');
  if(readFileSync(scriptPath,'utf8')!==script)throw new Error('import.lua differs from the manifest-generated script; refusing to execute modified code');
  runAseprite(executable,['--batch','--oneframe',join(dir,project.layers?'source.color.png':'source.png'),'--script-param',`output=${output}`,
    ...(project.layers?['--script-param',`emission=${join(dir,'source.emission-proxy.png')}`]:[]),'--script',scriptPath]);
  if(!existsSync(output)||statSync(output).size<128)throw new Error('Aseprite returned without a complete editable.aseprite file');
  const header=readFileSync(output);if(header.readUInt16LE(4)!==0xa5e0)throw new Error('Output does not have an Aseprite file header');
  return{file:output,version};
}
export function writeImportedClip(output:string,data:SpriteClipData2D,warnings:string[],options:{name?:string;loop?:boolean;tag?:string}={}):{directory:string;effect:string}{
  const name=options.name??'edited-fx';if(!/^[a-z][a-z0-9-]*$/.test(name))throw new Error('Generated effect name must be lowercase kebab-case');
  const playback={loop:!!options.loop,...(options.tag?{tag:options.tag}:{})},clip=createSpriteClip2D(data,playback),dir=emptyOutputDirectory(output);
  writeNew(join(dir,'clip.json'),JSON.stringify(data));
  writeNew(join(dir,`_${name}.ts`),`// Imported color, optional linear HDR emission and original frame durations. Generated by the Aseprite bridge.\nimport type { SpriteClipData2D } from "../../core/sprite-clip.js";\nconst data: SpriteClipData2D = ${JSON.stringify(data)};\nexport default data;\n`);
  const hasEmission=data.frames.some(frame=>frame.emission!==undefined);
  const source=`import { createSpriteClip2D } from "../../core/index.js";\nimport data from "./_${name}.js";\nconst clip=createSpriteClip2D(data,${JSON.stringify(playback)});\nexport const meta={name:${JSON.stringify(name)},tags:["aseprite","raster","imported"],desc:${JSON.stringify(hasEmission?'Aseprite-edited color with separate linear HDR emission and authored frame timing.':'Aseprite-edited raster animation; baked color, no separate emission buffer.')},size:[${clip.width},${clip.height}],origin:${JSON.stringify(clip.pivot)},duration:clip.duration,loop:${!!options.loop},fps:60,bg:"black",options:{}};\nexport function draw(p:import("../../core/painter.js").Painter,t:number){clip.draw(p,t);}\nexport function socketsAt(t:number){const i=clip.frameAt(t);return i<0?{}:clip.frameSockets(i);}\n`;
  writeNew(join(dir,`${name}.ts`),source);
  writeNew(join(dir,'import-report.json'),JSON.stringify({width:clip.width,height:clip.height,frames:clip.frameCount,duration:clip.duration,pivot:clip.pivot,playback,separateEmission:hasEmission,warnings},null,2));
  writeNew(join(dir,'README.txt'),`Copy ${name}.ts and _${name}.ts together to src/fx/<category>/, rebuild, then use the normal engine renderer. No registry is modified automatically.\nFrame durations are preserved in the clip. fps:60 in the wrapper only controls uniform preview sampling; it does not resample the imported data.\n${hasEmission?'Color pixels and separate linear HDR emission are preserved; the engine composites emission at playback.':'PNG color is already composited; no separate emission buffer is present.'} Layer metadata is retained for reference and is not reapplied.\nWarnings:\n${warnings.map(w=>'- '+w).join('\n')}\n`);
  return{directory:dir,effect:join(dir,`${name}.ts`)};
}
export function importAsepriteFiles(sheet:string,json:string,output:string,options:{pivot?:readonly[number,number];name?:string;loop?:boolean;tag?:string}={}){
  if(statSync(sheet).size>64*1024*1024)throw new Error('PNG input exceeds 64 MiB');
  const {data,warnings}=importAsepriteSheet(readFileSync(sheet),readJSON(json),{pivot:options.pivot});
  return{...writeImportedClip(output,data,warnings,options),data,warnings};
}
/** Import real edited channel sheets. Unchanged proxy pixels retain their original float32 energy. */
export function importLayeredAsepriteFiles(directory:string,colorPNG:string,colorJSON:string,emissionPNG:string,emissionJSON:string,output:string,
  options:{name?:string;tag?:string;emissionGain?:number}={}) {
  const dir=resolve(directory),project=readAsepriteProject(dir),layers=project.layers;
  if(!layers)throw new Error('Project has no separate HDR source channels');
  const raw=readFileSync(join(dir,'source.emission.f32')),proxyBytes=readFileSync(join(dir,'source.emission-proxy.png'));
  if(createHash('sha256').update(raw).digest('hex')!==layers.emissionSha256||createHash('sha256').update(proxyBytes).digest('hex')!==layers.proxySha256)
    throw new Error('Original HDR/proxy sidecars changed; restore their source version before pulling edits');
  const original=decodeLinearRGB(raw),originalImage=decodePNG(proxyBytes);
  if(original.length!==layers.atlasWidth*layers.atlasHeight*3||originalImage.width!==layers.atlasWidth||originalImage.height!==layers.atlasHeight)
    throw new Error('HDR source dimensions do not match the bridge manifest');
  const sourceJSON=readJSON(join(dir,'source.json'));
  const originalData=importAsepriteSheet(proxyBytes,sourceJSON,{pivot:project.pivot}).data;
  if(originalData.width!==project.width||originalData.height!==project.height||originalData.frames.length!==project.durationsMs.length)
    throw new Error('Original proxy timeline/canvas differs from bridge.json');
  const originalClip=createSpriteClip2D(originalData);
  const color=importAsepriteSheet(readFileSync(colorPNG),readJSON(colorJSON),{pivot:project.pivot});
  const light=importAsepriteSheet(readFileSync(emissionPNG),readJSON(emissionJSON),{pivot:project.pivot});
  if(color.data.width!==light.data.width||color.data.height!==light.data.height||color.data.frames.length!==light.data.frames.length
    ||color.data.frames.some((frame,i)=>frame.durationMs!==light.data.frames[i].durationMs))throw new Error('Color and emission edits must use the same canvas, frame order and durations');
  const editedLight=createSpriteClip2D(light.data),hashes=new Map<string,number>();
  const pixelBytes=(pixels:Uint32Array)=>new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength);
  for(let i=0;i<originalData.frames.length;i++)hashes.set(createHash('sha256').update(pixelBytes(originalClip.framePixels(i))).digest('hex'),i);
  const sameCanvas=color.data.width===project.width&&color.data.height===project.height;
  const frames=color.data.frames.map((frame,i)=>{
    const edited=pixelBytes(editedLight.framePixels(i)),editedHash=createHash('sha256').update(edited).digest('hex'),exact=hashes.get(editedHash);
    const indexedMatch=sameCanvas&&i<originalData.frames.length&&createHash('sha256').update(pixelBytes(originalClip.framePixels(i))).digest('hex')===editedHash?i:undefined;
    const sourceIndex=sameCanvas?(indexedMatch??exact??(i<originalData.frames.length?i:undefined)):undefined;
    let oldProxy:Uint8Array|undefined,oldLight:Float32Array|undefined;
    if(sourceIndex!==undefined){
      oldProxy=pixelBytes(originalClip.framePixels(sourceIndex));oldLight=new Float32Array(project.width*project.height*3);
      const area=sourceJSON.frames[sourceIndex].frame;
      for(let y=0;y<project.height;y++)oldLight.set(original.subarray(((area.y+y)*layers.atlasWidth+area.x)*3,((area.y+y)*layers.atlasWidth+area.x+project.width)*3),y*project.width*3);
    }
    const restored=restoreEmissionProxy(edited,oldProxy,oldLight,layers.emissionScale,options.emissionGain??1);
    const sockets=frame.sockets?Object.fromEntries(Object.entries(frame.sockets).map(([name,s])=>{
      const original=sourceIndex===undefined?undefined:project.sockets?.[sourceIndex]?.[name];
      return[name,original?{...original,...s,...(s.x===Math.round(original.x)&&s.y===Math.round(original.y)?{x:original.x,y:original.y}:{})}:s];
    })):undefined;
    return{...frame,emission:Array.from(restored),...(sockets?{sockets}:{})};
  });
  const data:SpriteClipData2D={...color.data,frames,source:{...color.data.source,emission:{format:'linear-rgb',coverage:'independent-energy',proxyScale:layers.emissionScale,gain:options.emissionGain??1}}};
  const warnings=[...color.warnings,'Color and emission are separate. Untouched proxy pixels retain source HDR; edited proxy pixels are quantized to the declared scale. Procedural source hierarchy is not reconstructed.'];
  return{...writeImportedClip(output,data,warnings,{name:options.name,tag:options.tag,loop:project.loop}),data,warnings};
}
export function pullAsepriteProject(directory:string,executable:string,options:{output?:string;layer?:string;name?:string;tag?:string;colorLayer?:string;emissionLayer?:string;emissionGain?:number}={}){
  const dir=resolve(directory),project=readAsepriteProject(dir),document=join(dir,'editable.aseprite');
  if(!existsSync(document))throw new Error('No editable.aseprite found. Create it with your configured Aseprite executable, then edit and save it.');
  const version=checkAsepriteVersion(executable);
  let output=options.output;
  if(!output){const parent=join(dir,'revisions');mkdirSync(parent,{recursive:true});let number=1;while(existsSync(join(parent,String(number).padStart(3,'0'))))number++;output=join(parent,String(number).padStart(3,'0'));}
  const revision=emptyOutputDirectory(output),png=join(revision,'edited.png'),json=join(revision,'edited.json');
  const selectedLayer=options.layer??(project.layers?(options.colorLayer??'color'):undefined);
  const args=['--batch',...(selectedLayer?['--layer',selectedLayer]:[]),'--list-tags','--list-layers','--list-slices',document,
    '--format','json-array','--sheet-type','rows','--sheet',png,'--data',json];
  runAseprite(executable,args);
  if(!existsSync(png)||!existsSync(json))throw new Error('Aseprite export did not create both PNG and JSON');
  let result;
  if(project.layers&&!options.layer){
    const emissionPNG=join(revision,'edited.emission.png'),emissionJSON=join(revision,'edited.emission.json');
    runAseprite(executable,['--batch','--layer',options.emissionLayer??'emission','--list-tags','--list-slices',document,
      '--format','json-array','--sheet-type','rows','--sheet',emissionPNG,'--data',emissionJSON]);
    result=importLayeredAsepriteFiles(dir,png,json,emissionPNG,emissionJSON,join(revision,'engine'),options);
  }else result=importAsepriteFiles(png,json,join(revision,'engine'),{pivot:project.pivot,name:options.name,loop:project.loop,tag:options.tag});
  return{...result,revision,version,selectedLayer:options.layer??null};
}
