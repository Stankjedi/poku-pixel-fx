#!/usr/bin/env node
import {exportAsepriteProject,createEditableAseprite,pullAsepriteProject,importAsepriteFiles} from './lib/aseprite-bridge.mjs';
const args=process.argv.slice(2),command=args.shift(),positionals:string[]=[],flags:Record<string,string>={};
const allowed=new Set(['out','aseprite','fps','opts','sheet','data','pivot','name','tag','layer','loop']);
try{
 for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')){positionals.push(args[i]);continue;}
  const key=args[i].slice(2);if(!allowed.has(key)||Object.hasOwn(flags,key))throw new Error(`Unknown or repeated option --${key}`);
  if(key==='loop')flags[key]='true';else{if(i+1>=args.length||args[i+1].startsWith('--'))throw new Error(`Missing value for --${key}`);flags[key]=args[++i];}
 }
 const perCommand:Record<string,string[]>={export:['out','aseprite','fps','opts'],create:['aseprite'],pull:['aseprite','out','layer','name','tag'],import:['sheet','data','out','pivot','name','tag','loop']};
 if(command&&perCommand[command])for(const key of Object.keys(flags))if(!perCommand[command].includes(key))throw new Error(`--${key} is not supported by ${command}`);
 const requireFlag=(name:string)=>{if(!flags[name])throw new Error(`Missing --${name}`);return flags[name];};
 const oneTarget=()=>{if(positionals.length!==1)throw new Error('This command requires exactly one effect id or project directory');return positionals[0];};
 if(command==='export'){
  const opts=flags.opts?JSON.parse(flags.opts):undefined;if(flags.opts&&(!opts||typeof opts!=='object'||Array.isArray(opts)))throw new Error('--opts must be a JSON object');
  const result=await exportAsepriteProject(oneTarget(),requireFlag('out'),{fps:flags.fps?Number(flags.fps):undefined,effectOptions:opts});
  console.log(JSON.stringify({project:flags.out,frames:result.durationsMs.length,flattened:true,bakedEmission:true,...(flags.aseprite?createEditableAseprite(flags.out,flags.aseprite):{editableCreated:false})},null,2));
 }else if(command==='create'){
  console.log(JSON.stringify(createEditableAseprite(oneTarget(),requireFlag('aseprite')),null,2));
 }else if(command==='pull'){
  const r=pullAsepriteProject(oneTarget(),requireFlag('aseprite'),{output:flags.out,layer:flags.layer,name:flags.name,tag:flags.tag});
  console.log(JSON.stringify({revision:r.revision,effect:r.effect,version:r.version,warnings:r.warnings},null,2));
 }else if(command==='import'){
  if(positionals.length)throw new Error('import takes --sheet, --data and --out, not a positional target');
  const pivot=flags.pivot?flags.pivot.split(',').map(Number):undefined;if(pivot&&(pivot.length!==2||!pivot.every(Number.isFinite)))throw new Error('--pivot must be x,y');
  const r=importAsepriteFiles(requireFlag('sheet'),requireFlag('data'),requireFlag('out'),{pivot:pivot as [number,number]|undefined,name:flags.name,tag:flags.tag,loop:!!flags.loop});
  console.log(JSON.stringify({directory:r.directory,effect:r.effect,warnings:r.warnings},null,2));
 }else{
  console.log('POKU <-> Aseprite (no auto-install or implicit executable)\n  export category/effect --out PROJECT [--aseprite EXECUTABLE]\n  create PROJECT --aseprite EXECUTABLE\n  pull PROJECT --aseprite EXECUTABLE [--layer NAME] [--out REVISION] [--name EFFECT]\n  import --sheet PNG --data JSON --out DIRECTORY [--pivot x,y] [--name EFFECT] [--tag NAME] [--loop]\nSee docs/ASEPRITE_BRIDGE.md. Existing output directories/files are not overwritten.');
  if(command&&command!=='help'&&command!=='--help')process.exitCode=1;
 }
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
