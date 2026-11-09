import test from 'node:test';import assert from 'node:assert/strict';
import {createGenerationPlan2D,resolveGenerationPlan2D,parseGenerationMeaning2D,createGeneratedEffect2D}from'../build/authoring/index.js';
import {createFrame,Painter,enableHDRLight,createFx,PAL}from'../build/core/index.js';
const plan=seed=>createGenerationPlan2D({material:'water',action:'pour',seed});
const draw=(m,i,t)=>{const f=createFrame(...m.meta.size);enableHDRLight(f);const p=new Painter(f).place(...m.meta.origin);i.drawBack(p,t);i.draw(p,t);return f;};
const count=f=>f.color.reduce((n,c)=>n+((c>>>24)>0),0);
test('water/pour is an exact bounded meaning with canonical contact and transported cutoff',()=>{
 assert.deepEqual(parseGenerationMeaning2D(' 물 ','붓기'),{material:'water',action:'pour'});
 assert.deepEqual(parseGenerationMeaning2D('WATER','POUR','소멸'),{material:'water',action:'pour',response:'dissipate'});
 for(const seed of[0,1,37,218,0xffffffff]){
  const p=plan(seed);assert.deepEqual(resolveGenerationPlan2D(JSON.parse(JSON.stringify(p))),p);
  assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.timing)&&Object.isFrozen(p.events[0].payload));
  const fall=p.timing.arrival-p.timing.release;assert.ok(fall>.4&&fall<.7);
  assert.ok(Math.abs(p.from[1]+45*fall+210*fall*fall)<1e-10);assert.ok(Math.abs(p.to[0]-p.from[0]-70*fall)<1e-10);
  assert.equal(p.timing.emissionEnd,p.timing.sourceEmissionEnd+fall);
  assert.equal(p.events.find(e=>e.id==='arrival').at,p.timing.arrival);
  assert.deepEqual(p.events.find(e=>e.id==='arrival').payload,{x:p.to[0],y:0,material:'water'});
  assert.deepEqual(p.events.find(e=>e.id==='source-emission-end').payload,{x:p.from[0],y:p.from[1],material:'water'});
 }
 for(const input of[{material:'water',action:'dash'},{material:'water',action:'plume'},{material:'water',action:'shatter'},{material:'water',action:'pour',response:'burst'},{material:'water',action:'pour',distance:60},{material:'fire',action:'pour'},{material:'ice',action:'pour'}])assert.throws(()=>createGenerationPlan2D(input),RangeError);
 for(const options of[{composition:'volumes'},{composition:'material-volumes'},{iceSurface:'crystal'}])assert.throws(()=>createGeneratedEffect2D(plan(1),options),RangeError);
 for(const seed of[-1,1.1,NaN,0x100000000])assert.throws(()=>plan(seed),RangeError);
 const bad=structuredClone(plan(1));bad.to[0]++;assert.throws(()=>resolveGenerationPlan2D(bad),RangeError);
});
test('water stays nonemissive, partially transparent, bounded and empty after all matter settles',()=>{
 for(const seed of[1,37,218]){
  const m=createGeneratedEffect2D(plan(seed)),i=m.create(m.meta.options);let partial=0,total=0;
  for(let n=0;n<=124;n++){
   const f=draw(m,i,n/40);assert.ok(f.light.every(c=>c===0));assert.ok(f.hdrLight.every(c=>c===0));
   for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const a=f.color[y*f.w+x]>>>24;if(!a)continue;total++;if(a<255)partial++;assert.ok(x>1&&y>1&&x<f.w-2&&y<f.h-2);}
   if(n===0||n===124)assert.equal(count(f),0);
  }
  assert.ok(partial/total>.6);assert.ok(count(draw(m,i,.55))>30);assert.ok(count(draw(m,i,1.1))>100);
 }
});
test('water contact is delayed and cutoff empties the source before the lower stream',()=>{
 const p=plan(1),m=createGeneratedEffect2D(p),body=m.create({...m.meta.options,layers:{trail:false,sparks:false,response:false}}),pool=m.create({...m.meta.options,layers:{body:false,trail:false,sparks:false}});
 assert.equal(count(draw(m,pool,p.timing.arrival)),0);assert.ok(count(draw(m,pool,p.timing.arrival+.1))>0);
 const f=draw(m,body,p.timing.sourceEmissionEnd+.25);let upper=0,lower=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(f.color[y*f.w+x]>>>24){if(y<m.meta.origin[1]-65)upper++;if(y>m.meta.origin[1]-45)lower++;}
 assert.equal(upper,0);assert.ok(lower>10);assert.equal(count(draw(m,body,p.timing.emissionEnd+.01)),0);
});
test('water is seekable with immutable options and correct palette/layer isolation',()=>{
 for(const seed of[0,37,0xffffffff]){
  const m=createGeneratedEffect2D(plan(seed)),options={...m.meta.options,palette:[...PAL.water],layers:{}},i=m.create(options),times=[.2,.53,.73,1.1,1.6,1.91,2.4,3.1];
  const frames=times.map(t=>draw(m,i,t));options.seed=123;options.palette.fill('#f00');options.layers.body=false;
  for(const k of[7,4,1,6,3,0,2,5,3])assert.deepEqual(draw(m,i,times[k]),frames[k]);
  const fresh=m.create(m.meta.options);times.forEach((t,k)=>assert.deepEqual(draw(m,fresh,t),frames[k]));
  const off=m.create({...m.meta.options,layers:{body:false,trail:false,sparks:false,response:false}});assert.equal(count(draw(m,off,1.1)),0);
  const noLight=m.create({...m.meta.options,layers:{light:false}});assert.deepEqual(draw(m,noLight,1.1),frames[3]);
  assert.notDeepEqual(draw(m,m.create({...m.meta.options,palette:PAL.fire}),1.1).color,frames[3].color);
 }
});
test('water runtime validates explicit options and supports host checkpoint/partition contracts',()=>{
 const m=createGeneratedEffect2D(plan(1));
 for(const extra of[{seed:-1},{seed:NaN},{palette:[]},{palette:new Array(2)},{palette:['invalid']},{layers:{glow:false}},{layers:{body:0}}])assert.throws(()=>m.create({...m.meta.options,...extra}),RangeError);
 const i=m.create(m.meta.options);assert.throws(()=>draw(m,i,NaN),RangeError);
 const at=(parts)=>{const fx=createFx(m,{x:m.meta.origin[0],y:m.meta.origin[1]});for(const dt of parts)fx.update(dt);const f=createFrame(...m.meta.size);fx.draw(f);return {fx,f};};
 const a=at([1.1]),b=at(Array(44).fill(.025));assert.deepEqual(a.f,b.f);
 const snapshot=a.fx.capture();a.fx.update(.6);a.fx.restore(snapshot);const f=createFrame(...m.meta.size);a.fx.draw(f);assert.deepEqual(f,a.f);
});
