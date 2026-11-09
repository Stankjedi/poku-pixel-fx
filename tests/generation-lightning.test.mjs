import test from 'node:test';import assert from 'node:assert/strict';
import {createGenerationPlan2D,resolveGenerationPlan2D,parseGenerationMeaning2D,createGeneratedEffect2D}from'../build/authoring/index.js';
import {lightningChannels2D}from'../build/authoring/lightning-generation.js';
import {createFrame,Painter,enableHDRLight,createFx,PAL}from'../build/core/index.js';
const plan=seed=>createGenerationPlan2D({material:'lightning',action:'strike',seed});
const draw=(m,i,t)=>{const f=createFrame(...m.meta.size);enableHDRLight(f);const p=new Painter(f).place(...m.meta.origin);i.drawBack(p,t);i.draw(p,t);return f;};
const empty=f=>[f.color,f.light,f.hdrLight].every(a=>a.every(x=>x===0));
const trace=(i,t,back=false)=>{const calls=[],p={path:(points,color,alpha,width)=>calls.push({points,color,alpha,width}),glowPath(){},ellipse(){},glow(){}};(back?i.drawBack:i.draw)(p,t);return calls;};
test('lightning/strike is canonical, bounded and separate from material projectiles',()=>{
 assert.deepEqual(parseGenerationMeaning2D(' 번개 ','낙뢰'),{material:'lightning',action:'strike'});
 for(const seed of[0,1,37,218,0xffffffff]){
  const p=plan(seed);assert.deepEqual(resolveGenerationPlan2D(JSON.parse(JSON.stringify(p))),p);assert.ok(Object.isFrozen(p.events[0].payload));
  assert.deepEqual(p.events.map(e=>[e.id,e.at]),[['release',.06],['arrival',.23],['strike',.23],['restrike',.41],['source-emission-end',.48],['emission-end',.48]]);
 }
 for(const x of[{action:'dash'},{action:'burst'},{response:'burst'},{distance:80},{travel:.8},{seed:-1},{seed:NaN},{seed:2**32}])assert.throws(()=>createGenerationPlan2D({material:'lightning',action:'strike',...x}),RangeError);
 for(const material of['fire','energy','ice','water'])assert.throws(()=>createGenerationPlan2D({material,action:'strike'}),RangeError);
 for(const options of[{composition:'volumes'},{composition:'material-volumes'},{iceSurface:'crystal'}])assert.throws(()=>createGeneratedEffect2D(plan(1),options),RangeError);
});
test('branched topology is seeded, frozen and rooted exactly in its parent',()=>{
 for(const seed of[0,1,37,218,0xffffffff]){
  const p=plan(seed),cs=lightningChannels2D(seed,p.from,p.to);assert.deepEqual(cs,lightningChannels2D(seed,p.from,p.to));assert.ok(Object.isFrozen(cs));
  assert.deepEqual(cs[0].points[0],p.from);assert.deepEqual(cs[0].points.at(-1),p.to);
  for(let n=1;n<cs.length;n++){const c=cs[n],parent=cs[c.parent];assert.ok(c.parent<n);assert.deepEqual(c.points[0],parent.points[c.attachment]);assert.equal(c.rootDistance,parent.rootDistance+parent.distances[c.attachment]);assert.ok(c.strength<parent.strength);assert.ok(Object.isFrozen(c.points[0]));}
  assert.ok(new Set(cs.slice(1).map(c=>c.length)).size>2);
 }
 for(const args of[[-1,[0,0],[0,20]],[1,[0,0],[0,0]],[1,[0,0],[0,513]],[1,[0,NaN],[0,20]],[1,new Array(2),[0,20]]])assert.throws(()=>lightningChannels2D(...args),RangeError);
});
test('restrike is a weaker reuse of the same trunk without fresh bright branches',()=>{
 for(const seed of[1,37,218]){const m=createGeneratedEffect2D(plan(seed)),i=m.create(m.meta.options),a=trace(i,.25),b=trace(i,.43);assert.ok(a.length>3);assert.equal(b.length,3);for(const c of b)assert.deepEqual(c.points,a.find(c=>c.width===3.2).points);assert.equal(b.find(c=>c.width===3.2).alpha(0),.34);assert.equal(a.find(c=>c.width===3.2).alpha(0),.5);}
});
test('lightning arbitrary seeks, snapshots, layers and empty ending are deterministic',()=>{
 for(const seed of[0,37,0xffffffff]){
  const m=createGeneratedEffect2D(plan(seed)),options={...m.meta.options,palette:[...PAL.electric],layers:{}},i=m.create(options),times=[0,.1,.225,.23,.234,.25,.425,.6,.95];const frames=times.map(t=>draw(m,i,t));options.seed=22;options.palette.fill('#f00');options.layers.body=false;
  for(const k of[8,4,0,7,1,6,2,5,3])assert.deepEqual(draw(m,i,times[k]),frames[k]);
  for(const t of[-1,0,.95,3])assert.ok(empty(draw(m,i,t)));
  const off=m.create({...m.meta.options,layers:{body:false,trail:false,response:false,residue:false}});assert.ok(empty(draw(m,off,.25)));
  const unlit=m.create({...m.meta.options,layers:{light:false}}),f=draw(m,unlit,.25);assert.deepEqual(f.color,frames[5].color);assert.ok(f.light.every(c=>c===0)&&f.hdrLight.every(c=>c===0));
  assert.notDeepEqual(draw(m,m.create({...m.meta.options,palette:PAL.fire}),.25).color,frames[5].color);
 }
});
test('lightning runtime validates owned options and host time partitions/checkpoints',()=>{
 const m=createGeneratedEffect2D(plan(1));for(const x of[{seed:-1},{seed:NaN},{palette:[]},{palette:new Array(2)},{palette:['invalid']},{layers:{typo:false}},{layers:{body:0}}])assert.throws(()=>m.create({...m.meta.options,...x}),RangeError);assert.throws(()=>draw(m,m.create(m.meta.options),NaN),RangeError);
 const at=parts=>{const fx=createFx(m,{x:m.meta.origin[0],y:m.meta.origin[1]});for(const dt of parts)fx.update(dt);const f=createFrame(...m.meta.size);fx.draw(f);return{fx,f};};const a=at([.25]),b=at(Array(10).fill(.025));assert.deepEqual(a.f,b.f);const snapshot=a.fx.capture();a.fx.update(.4);a.fx.restore(snapshot);const f=createFrame(...m.meta.size);a.fx.draw(f);assert.deepEqual(f,a.f);
});
