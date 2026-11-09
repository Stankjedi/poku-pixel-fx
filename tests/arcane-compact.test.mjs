// Rendering and routing contracts, not visual approval.
import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,readFileSync,rmSync,cpSync,mkdirSync,existsSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';import{transformSync}from'esbuild';
import{cinematicTemplate}from'../build-tools/tools/lib/cinematic-template.mjs';import{createFrame,enableHDRLight,Painter,createFx}from'../build/core/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const draw=(m,i,t,pad=0)=>{const f=createFrame(m.meta.size[0]+2*pad,m.meta.size[1]+2*pad);enableHDRLight(f);const p=new Painter(f).place(m.meta.origin[0]+pad,m.meta.origin[1]+pad);i.drawBack(p,t);i.draw(p,t);return f;};
const compile=async(dir,name,form)=>{const src=cinematicTemplate(name,'arcane',false,'2026-11-07T00:00:00Z',form).replaceAll('../../core/',pathToFileURL(join(root,'build/core/')).href);const out=transformSync(src,{loader:'ts',format:'esm',target:'es2022'});assert.deepEqual(out.warnings,[]);const p=join(dir,name+'.mjs');writeFileSync(p,out.code);return import(pathToFileURL(p).href);};
test('old template sources remain exact and compact option is bounded one-shot only',()=>{
 for(const q of JSON.parse(readFileSync(new URL('./fixtures/arcane-template-legacy.json',import.meta.url)))){const s=cinematicTemplate('Legacy template',q.category,q.loop,'2026-11-07T00:00:00Z');assert.equal(createHash('sha256').update(s).digest('hex'),q.sha256);assert.equal(cinematicTemplate('Legacy template',q.category,q.loop,'2026-11-07T00:00:00Z','ribbon'),s);}
 for(const form of['other',null,{},true])assert.throws(()=>cinematicTemplate('x','arcane',false,undefined,form),RangeError);assert.throws(()=>cinematicTemplate('x','arcane',true,undefined,'volume'),RangeError);
});
test('compact template changes matter coverage while keeping original light, bounds and deterministic ending',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'poku-arcane-'));
 try{const old=await compile(dir,'legacy','ribbon'),neo=await compile(dir,'compact','volume');
 for(const seed of[1,17,218]){const a=old.create({...old.meta.options,seed}),b=neo.create({...neo.meta.options,seed});let changed=0;
  for(let n=0;n<=96;n++){const t=n/40,f=draw(old,a,t),g=draw(neo,b,t);assert.deepEqual(g.light,f.light);assert.deepEqual(g.hdrLight,f.hdrLight);if(!g.color.every((c,i)=>c===f.color[i]))changed++;
   for(let x=0;x<g.w;x++)for(const y of[0,g.h-1])assert.equal(g.color[y*g.w+x],0);for(let y=0;y<g.h;y++)for(const x of[0,g.w-1])assert.equal(g.color[y*g.w+x],0);
  }assert.ok(changed>30);
  for(const t of[-1,0,2.4,4]){const f=draw(neo,b,t);assert.ok(f.color.every(c=>c===0)&&f.light.every(c=>c===0)&&f.hdrLight.every(c=>c===0));}
  const target=draw(neo,b,.65);for(const t of[1.8,.1,.65,1.3,.65]){const f=draw(neo,b,t);if(t===.65)assert.deepEqual(f,target);}
  const fx=createFx(neo,{x:neo.meta.origin[0],y:neo.meta.origin[1],seed});fx.update(.65);const f=createFrame(...neo.meta.size);enableHDRLight(f);fx.draw(f);assert.deepEqual(f,target);
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual CLI selects compact only for plain arcane one-shots and preserves explicit modes',{timeout:60000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'poku-arcane-cli-'));
 try{for(const d of['src','build','build-tools'])cpSync(join(root,d),join(dir,d),{recursive:true});for(const f of['package.json','tools/lib/effect-intent.mjs']){mkdirSync(join(dir,f,'..'),{recursive:true});cpSync(join(root,f),join(dir,f));}
 const cases=[['arcane/plain',[],true],['arcane/generic',['--cinematic'],false],['arcane/loop',['--loop'],false],['arcane/generic-loop',['--cinematic','--loop'],false],['arcane/min',['--minimal'],false],['arcane/timing',['--timing'],false],['arcane/explicit',['--material','energy','--action','dash'],false],['holy/plain',[],false],['fire/plain',[],false]];const files=[];
 for(const[id,flags,compact]of cases){const q=spawnSync(process.execPath,['build-tools/tools/new.mjs',id,...flags],{cwd:dir,encoding:'utf8'});assert.equal(q.status,0,q.stderr);const file=join(dir,'src/fx',id+'.ts'),s=readFileSync(file,'utf8');files.push(file);assert.equal(s.includes('const matterVolume'),compact);if(compact){assert.match(q.stdout,/짧은 부피 입자/);assert.equal(existsSync(join(dir,'authoring',id+'.generation.json')),false);} }
 const q=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--ignoreConfig','--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext',...files],{cwd:dir,encoding:'utf8'});assert.equal(q.status,0,q.stdout+q.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
