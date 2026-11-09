import test from 'node:test';import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {createGenerationStarter2D,createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/index.js';
import {createFrame,Painter,PAL} from '../build/core/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const expected={fire:{material:'fire',action:'plume'},ice:{material:'ice',action:'shatter'},scifi:{material:'energy',action:'dash'},water:{material:'water',action:'pour'},lightning:{material:'lightning',action:'strike'}};

test('category examples are explicit immutable bounded recipes, not effect-name parsing or implicit impacts',()=>{
 for(const[category,intent]of Object.entries(expected)){
  const starter=createGenerationStarter2D(category,218);assert.equal(starter.selection,'category-example');assert.equal(starter.category,category);assert.ok(starter.label.length>10);
  assert.deepEqual(starter.plan,createGenerationPlan2D({...intent,response:'dissipate',seed:218}));
  assert.ok(Object.isFrozen(starter)&&Object.isFrozen(starter.plan.intent));
  assert.equal(starter.plan.events.some(e=>e.kind==='burst'),false);
  assert.deepEqual(createGenerationStarter2D(category,218),starter);
 }
 for(const value of ['arcane','Fire','fire phoenix','ice-shield','__proto__','constructor',''])assert.equal(createGenerationStarter2D(value),undefined);
 for(const value of [null,{},17])assert.throws(()=>createGenerationStarter2D(value),TypeError);
 for(const seed of [-1,1.2,NaN,0x100000000])assert.throws(()=>createGenerationStarter2D('fire',seed),RangeError);
});

test('material starters use the existing renderer exactly and differ with matched palettes and no light',()=>{
 const all=[];
 for(const[category,intent]of Object.entries(expected)){
  const a=createGeneratedEffect2D(createGenerationStarter2D(category,218).plan),b=createGeneratedEffect2D(createGenerationPlan2D({...intent,seed:218}));
  const instances=[a,b].map(m=>m.create({...m.meta.options,palette:PAL.ice,layers:{light:false}}));
  for(const t of [0,.15,.35,.55,.9,1.3,1.8,3]){
   const frames=instances.map(i=>{const f=createFrame(384,256),p=new Painter(f).place(192,170);i.drawBack(p,t);i.draw(p,t);return f});
   assert.deepEqual(frames[0],frames[1]);assert.ok(frames[0].light.every(c=>c===0));
   if(t===.55)all.push(frames[0].color);
  }
 }
 for(let a=0;a<all.length;a++)for(let b=a+1;b<all.length;b++)assert.notDeepEqual(all[a],all[b]);
});

test('actual CLI uses category examples, honors explicit overrides and preserves opt-in generic modes', {timeout:60000},()=>{
 const temp=mkdtempSync(join(tmpdir(),'poku-starter-cli-'));
 try{
  for(const d of ['src','build','build-tools'])cpSync(join(root,d),join(temp,d),{recursive:true});
  for(const f of ['package.json','tools/lib/effect-intent.mjs']){mkdirSync(join(temp,f,'..'),{recursive:true});cpSync(join(root,f),join(temp,f))}
  const run=(id,...flags)=>spawnSync(process.execPath,['build-tools/tools/new.mjs',id,...flags],{cwd:temp,encoding:'utf8'}),readPlan=id=>JSON.parse(readFileSync(join(temp,'authoring',id+'.generation.json'),'utf8'));
  const files=[];
  for(const[category,intent]of Object.entries(expected)){
   const id=category+'/default-starter',result=run(id);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/카테고리 시작 예제/);assert.match(result.stdout,/이름의 의미를 해석한 결과가 아닙니다/);
   const plan=readPlan(id);assert.equal(plan.intent.material,intent.material);assert.equal(plan.intent.action,intent.action);
   assert.equal(JSON.parse(readFileSync(join(temp,'authoring',id+'.intent.json'))).intent.oneSentence,'');
   const source=join(temp,'src/fx',id+'.ts');files.push(source);const saved=readFileSync(source,'utf8');if(['ice','water','lightning'].includes(category))assert.doesNotMatch(saved,/composition: "material-volumes"/);else assert.match(saved,/composition: "material-volumes"/);assert.equal(run(id).status,1);assert.equal(readFileSync(source,'utf8'),saved);
   const genericId=category+'/generic-loop',generic=run(genericId,'--cinematic','--loop');assert.equal(generic.status,0,generic.stderr);
   assert.equal(existsSync(join(temp,'authoring',genericId+'.generation.json')),false);assert.match(readFileSync(join(temp,'src/fx',genericId+'.ts'),'utf8'),/createCinematicParticles2D/);
   const registry=readFileSync(join(temp,'src/fx/index.ts'),'utf8'),badId=category+'/unsupported-loop',bad=run(badId,'--loop');assert.equal(bad.status,1);assert.match(bad.stderr,/재질 루프는 아직 지원하지 않습니다/);
   for(const suffix of ['.ts','.intent.json','.generation.json'])assert.equal(existsSync(join(temp,suffix==='.ts'?'src/fx':'authoring',badId+suffix)),false);
   assert.equal(readFileSync(join(temp,'src/fx/index.ts'),'utf8'),registry);
  }
  const override=run('fire/explicit-ice','--material','ice','--action','shatter');assert.equal(override.status,0,override.stderr);assert.equal(readPlan('fire/explicit-ice').intent.material,'ice');assert.doesNotMatch(override.stdout,/카테고리 시작 예제/);
  assert.equal(run('fire/conflicting','--material','fire','--action','plume','--cinematic').status,1);
  assert.equal(existsSync(join(temp,'src/fx/fire/conflicting.ts')),false);
  const protectedPlan=join(temp,'authoring/ice/protected.generation.json');writeFileSync(protectedPlan,'{"keep":true}\n');const registry=readFileSync(join(temp,'src/fx/index.ts'),'utf8');
  assert.equal(run('ice/protected').status,1);assert.equal(readFileSync(protectedPlan,'utf8'),'{"keep":true}\n');assert.equal(readFileSync(join(temp,'src/fx/index.ts'),'utf8'),registry);assert.equal(existsSync(join(temp,'src/fx/ice/protected.ts')),false);
  const checked=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext',...files],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(checked.status,0,checked.stdout+checked.stderr);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
