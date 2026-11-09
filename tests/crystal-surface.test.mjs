import test from 'node:test';import assert from 'node:assert/strict';
import {createCrystalSurface2D,createFrame,Painter,PAL,enableHDRLight} from '../build/core/index.js';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
const polygon=[[-20,-30],[14,-26],[23,6],[5,27],[-21,15]],options={polygon,palette:PAL.ice,seed:37};
function draw(surface,state={}){const f=enableHDRLight(createFrame(128,128));surface.draw(new Painter(f).place(64,64),state);return f;}
const copy=f=>({color:f.color.slice(),light:f.light.slice(),hdr:f.hdrLight.slice()});
test('crystal remains clipped, nonemissive, transmitting, deterministic and light-dependent',()=>{
 const a=createCrystalSurface2D(options),b=createCrystalSurface2D(options),base=draw(a);
 assert.deepEqual(copy(base),copy(draw(b)));const solid=Array.from(base.color).filter(c=>c>>>24);
 assert.ok(solid.length>500);assert.ok(solid.some(c=>(c>>>24)>210));assert.ok(solid.some(c=>(c>>>24)<150));
 assert.ok(base.light.every(v=>v===0)&&base.hdrLight.every(v=>v===0));
 assert.notDeepEqual(draw(createCrystalSurface2D({...options,light:[.6,.7,.7]})).color,base.color);
 assert.ok(draw(a,{opacity:0}).color.every(c=>c===0));
 for(const angle of [0,.31,-.6,1.8,0])assert.deepEqual(copy(draw(a,{angle,cutEdges:.5})),copy(draw(b,{angle,cutEdges:.5})));
 for(const angle of [0,.31,1.8]){const f=draw(a,{angle});for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(f.color[y*128+x]>>>24)assert.ok(Math.hypot(x-64,y-64)<40);}
 const moved=draw(a,{position:[7,-5]});for(let y=30;y<96;y++)for(let x=32;x<96;x++)assert.equal(base.color[y*128+x],moved.color[(y-5)*128+x+7]);
});
test('material coordinates survive partitioning, and mutable geometry never gives stale cached pixels',()=>{
 const s=createCrystalSurface2D({polygon:[[-20,-20],[20,-20],[20,20],[-20,20]],palette:PAL.ice,seed:218});
 const whole=draw(s),parts=createFrame(128,128),p=new Painter(parts).place(64,64);
 s.draw(p,{polygon:[[-10,-20],[10,-20],[10,20],[-10,20]],materialOrigin:[-10,0],position:[-10,0]});
 s.draw(p,{polygon:[[-10,-20],[10,-20],[10,20],[-10,20]],materialOrigin:[10,0],position:[10,0]});
 assert.deepEqual(parts.color,whole.color);
 const mutable=[[-10,-10],[10,-10],[10,10],[-10,10]],before=draw(s,{polygon:mutable});mutable[1][0]=5;mutable[2][0]=5;
 assert.notDeepEqual(before.color,draw(s,{polygon:mutable}).color);
 const frozen=Object.freeze(mutable.map(q=>Object.freeze(q.slice())));assert.deepEqual(draw(s,{polygon:mutable}).color,draw(s,{polygon:frozen}).color);
});
test('invalid crystal configuration/state fails with bounded finite inputs',()=>{
 for(const bad of [null,[],{...options,other:true},{...options,seed:-1},{...options,seed:1.5},{...options,palette:[]},{...options,palette:['oops']},{...options,light:[0,0,0]},{...options,light:[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE]},
  {...options,polygon:[[0,0],[1,1],[2,2]]},{...options,polygon:[[0,0],[2,0],[1,1],[2,2],[0,2]]}])assert.throws(()=>createCrystalSurface2D(bad));
 const s=createCrystalSurface2D(options);for(const state of [null,[],{other:1},{opacity:-1},{opacity:2},{cutEdges:2},{angle:NaN},{position:[Infinity,0]},{position:[,0]},{materialOrigin:[0,]},{materialOrigin:[0,100]},{polygon:[[100,0],[110,0],[100,10]]},{polygon:[[0,0],[0,0],[1,1]]}])assert.throws(()=>draw(s,state));
});
test('new ice opt-in keeps legacy output exact and rejects unrelated materials',()=>{
 const render=(mod,t)=>{const f=enableHDRLight(createFrame(384,256)),p=new Painter(f).place(192,170),fx=mod.create(mod.meta.options);fx.drawBack(p,t);fx.draw(p,t);return copy(f);};
 for(const seed of [1,37,218]){
  const plan=createGenerationPlan2D({material:'ice',action:'shatter',seed}),legacy=createGeneratedEffect2D(plan),facets=createGeneratedEffect2D(plan,{iceSurface:'facets'}),crystal=createGeneratedEffect2D(plan,{iceSurface:'crystal'});
  assert.deepEqual(legacy.meta,crystal.meta);assert.deepEqual(legacy.events,crystal.events);
  for(const t of [0,.15,.35,.36,.375,.55,.75,1.05,plan.timing.end]){
   assert.deepEqual(render(legacy,t),render(facets,t));const f=render(crystal,t);assert.ok(f.light.every(v=>v===0)&&f.hdr.every(v=>v===0));
   assert.deepEqual(render(crystal,t),f);
  }
  assert.notDeepEqual(render(legacy,.55).color,render(crystal,.55).color);
  assert.throws(()=>createGeneratedEffect2D(plan,{composition:'volumes',iceSurface:'crystal'}));
 }
 for(const material of ['fire','energy'])assert.throws(()=>createGeneratedEffect2D(createGenerationPlan2D({material,action:'dash'}),{iceSurface:'crystal'}));
});
