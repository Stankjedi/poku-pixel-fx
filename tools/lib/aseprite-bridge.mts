import {existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEffect,renderFrames,spriteSheet} from './fxlib.mjs';
import {importAsepriteSheet} from './aseprite-data.mjs';
import type {SpriteClipData2D} from '../../src/core/sprite-clip.js';
const {createSpriteClip2D}=await import(new URL('../../../build/core/index.js',import.meta.url).href);
export interface AsepriteProject {
  format:'poku-aseprite-project';version:1;effectId:string;width:number;height:number;
  pivot:readonly[number,number];fps:number;durationsMs:number[];loop:boolean;
  tags:{name:string;from:number;to:number;direction:string}[];
  flattened:true;bakedEmission:true;
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
  if(!Number.isInteger(project.width)||!Number.isInteger(project.height)||project.width<1||project.height<1||project.width>4096||project.height>4096||n<1||n>4096||project.width*project.height*n>16_777_216
    ||Array.from({length:n},(_,i)=>!Object.hasOwn(project.durationsMs,i)||!Number.isInteger(project.durationsMs[i])||project.durationsMs[i]<1||project.durationsMs[i]>65535).some(Boolean))throw new Error('Aseprite import needs dimensions and 1..65535 ms frame durations');
  const enums:Record<string,string>={forward:'FORWARD',reverse:'REVERSE',pingpong:'PING_PONG',pingpong_reverse:'PING_PONG_REVERSE'};
  const tags=Array.from(project.tags,tag=>{
    if(!tag||typeof tag.name!=='string')throw new Error('Invalid import tag');
    if(!Number.isInteger(tag.from)||!Number.isInteger(tag.to)||tag.from<0||tag.to<tag.from||tag.to>=n||!enums[tag.direction])throw new Error('Invalid import tag');
    return `do\n  local direction = assert(AniDir.${enums[tag.direction]}, "Aseprite version lacks tag direction")\n  local tag = s:newTag(${tag.from+1}, ${tag.to+1})\n  tag.name = ${luaString(tag.name)}\n  tag.aniDir = direction\nend`;
  }).join('\n');
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
local output=assert(app.params.output, "Missing --script-param output")
s:saveAs(output)
`;
}
export async function exportAsepriteProject(id:string,output:string,options:{fps?:number;effectOptions?:Record<string,unknown>}={}):Promise<AsepriteProject>{
  if(!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id))throw new Error('Effect id must be category/name');
  const fx=await loadEffect(id),fps=options.fps??fx.meta.fps;
  if(!Number.isInteger(fps)||fps<1||fps>240)throw new Error('Export fps must be an integer from 1 to 240');
  const expected=Math.round(fx.meta.duration*fps)+(fx.meta.loop?0:1),[width,height]=fx.meta.size;
  if(![width,height,expected].every(Number.isSafeInteger)||width<1||height<1||width>4096||height>4096||expected<1||expected>4096||width*height*expected>16_777_216)throw new Error('Export exceeds sprite-clip bounds; reduce fps, canvas size or duration');
  const frames=renderFrames(fx,{fps,bg:'none',actor:false,options:options.effectOptions}),sheet=spriteSheet(fx,frames,'source');
  if(sheet.json.meta.size.w*sheet.json.meta.size.h>16_777_216)throw new Error('Padded atlas exceeds PNG import bounds; reduce fps, canvas size or duration');
  const durationsMs=frames.frames.map((_,i)=>Math.round((i+1)*1000/fps)-Math.round(i*1000/fps));
  sheet.json.frames.forEach((f,i)=>f.duration=durationsMs[i]);
  const project:AsepriteProject={format:'poku-aseprite-project',version:1,effectId:id,width:frames.w,height:frames.h,
    pivot:frames.pivot as [number,number],fps,durationsMs,loop:!!fx.meta.loop,tags:sheet.json.meta.frameTags,flattened:true,bakedEmission:true};
  const script=createAsepriteImportScript(project),dir=emptyOutputDirectory(output);
  writeNew(join(dir,'source.png'),sheet.png);writeNew(join(dir,'source.json'),JSON.stringify(sheet.json,null,2));
  writeNew(join(dir,'bridge.json'),JSON.stringify(project,null,2));writeNew(join(dir,'import.lua'),script);
  writeNew(join(dir,'README.txt'),'POKU Pixel FX -> Aseprite project\n\nsource.png/source.json: flattened RGBA frames with timing. Glow is baked, not an editable light buffer.\nbridge.json: frame sizes, timing and original pivot. Keep it with the project.\nimport.lua: optional official Aseprite Lua import, run through the bridge create command and your explicitly supplied executable.\nNo .aseprite file has been written by POKU itself. See docs/ASEPRITE_BRIDGE.md.\n');
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
  runAseprite(executable,['--batch','--oneframe',join(dir,'source.png'),'--script-param',`output=${output}`,'--script',scriptPath]);
  if(!existsSync(output)||statSync(output).size<128)throw new Error('Aseprite returned without a complete editable.aseprite file');
  const header=readFileSync(output);if(header.readUInt16LE(4)!==0xa5e0)throw new Error('Output does not have an Aseprite file header');
  return{file:output,version};
}
export function writeImportedClip(output:string,data:SpriteClipData2D,warnings:string[],options:{name?:string;loop?:boolean;tag?:string}={}):{directory:string;effect:string}{
  const name=options.name??'edited-fx';if(!/^[a-z][a-z0-9-]*$/.test(name))throw new Error('Generated effect name must be lowercase kebab-case');
  const playback={loop:!!options.loop,...(options.tag?{tag:options.tag}:{})},clip=createSpriteClip2D(data,playback),dir=emptyOutputDirectory(output);
  writeNew(join(dir,'clip.json'),JSON.stringify(data));
  writeNew(join(dir,`_${name}.ts`),`// Imported flattened pixels and original frame durations. Generated by the Aseprite bridge.\nimport type { SpriteClipData2D } from "../../core/sprite-clip.js";\nconst data: SpriteClipData2D = ${JSON.stringify(data)};\nexport default data;\n`);
  const source=`import { createSpriteClip2D } from "../../core/index.js";\nimport data from "./_${name}.js";\nconst clip=createSpriteClip2D(data,${JSON.stringify(playback)});\nexport const meta={name:${JSON.stringify(name)},tags:["aseprite","raster","imported"],desc:"Aseprite-edited raster animation; baked color, no separate emission buffer.",size:[${clip.width},${clip.height}],origin:${JSON.stringify(clip.pivot)},duration:clip.duration,loop:${!!options.loop},fps:60,bg:"black",options:{}};\nexport function draw(p:import("../../core/painter.js").Painter,t:number){clip.draw(p,t);}\n`;
  writeNew(join(dir,`${name}.ts`),source);
  writeNew(join(dir,'import-report.json'),JSON.stringify({width:clip.width,height:clip.height,frames:clip.frameCount,duration:clip.duration,pivot:clip.pivot,playback,warnings},null,2));
  writeNew(join(dir,'README.txt'),`Copy ${name}.ts and _${name}.ts together to src/fx/<category>/, rebuild, then use the normal engine renderer. No registry is modified automatically.\nFrame durations are preserved in the clip. fps:60 in the wrapper only controls uniform preview sampling; it does not resample the imported data.\nPNG color is already composited. Layer metadata is not reapplied.\nWarnings:\n${warnings.map(w=>'- '+w).join('\n')}\n`);
  return{directory:dir,effect:join(dir,`${name}.ts`)};
}
export function importAsepriteFiles(sheet:string,json:string,output:string,options:{pivot?:readonly[number,number];name?:string;loop?:boolean;tag?:string}={}){
  if(statSync(sheet).size>64*1024*1024)throw new Error('PNG input exceeds 64 MiB');
  const {data,warnings}=importAsepriteSheet(readFileSync(sheet),readJSON(json),{pivot:options.pivot});
  return{...writeImportedClip(output,data,warnings,options),data,warnings};
}
export function pullAsepriteProject(directory:string,executable:string,options:{output?:string;layer?:string;name?:string;tag?:string}={}){
  const dir=resolve(directory),project=readAsepriteProject(dir),document=join(dir,'editable.aseprite');
  if(!existsSync(document))throw new Error('No editable.aseprite found. Create it with your configured Aseprite executable, then edit and save it.');
  const version=checkAsepriteVersion(executable);
  let output=options.output;
  if(!output){const parent=join(dir,'revisions');mkdirSync(parent,{recursive:true});let number=1;while(existsSync(join(parent,String(number).padStart(3,'0'))))number++;output=join(parent,String(number).padStart(3,'0'));}
  const revision=emptyOutputDirectory(output),png=join(revision,'edited.png'),json=join(revision,'edited.json');
  const args=['--batch',...(options.layer?['--layer',options.layer]:[]),'--list-tags','--list-layers',document,
    '--format','json-array','--sheet-type','rows','--sheet',png,'--data',json];
  runAseprite(executable,args);
  if(!existsSync(png)||!existsSync(json))throw new Error('Aseprite export did not create both PNG and JSON');
  const result=importAsepriteFiles(png,json,join(revision,'engine'),{pivot:project.pivot,name:options.name,loop:project.loop,tag:options.tag});
  return{...result,revision,version,selectedLayer:options.layer??null};
}
