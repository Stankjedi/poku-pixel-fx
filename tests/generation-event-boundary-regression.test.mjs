import test from 'node:test';
import assert from 'node:assert/strict';
import {createFx,createFrame} from '../build/core/fx.js';
import {createSequenceSpec,createSequenceEffect} from '../build/authoring/sequence.js';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
import {enableHDRLight} from '../build/render/hdr.js';
import {characterClipTime2D} from '../build/core/character-animation.js';
function render(mod,time){const f=createFrame(...mod.meta.size),fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],seed:1});fx.update(time);fx.draw(f);return f;}
for(const time of [.23,.41]) test(`generated lightning delayed cue preserves standalone event frame at ${time}`,async()=>{
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1}));
 const sequence=await createSequenceEffect(createSequenceSpec({size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at:.123,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
 const actual=render(sequence,.123+time),expected=render(original,time);
 assert.equal(actual.color.reduce((n,p,i)=>n+(p!==expected.color[i]),0),0,'cue delay must not change the authored event frame');
 assert.deepEqual(actual.light,expected.light);
});

test('exact generated events are independent of offset, update partitions and repeated layer draws',async()=>{
 for(const at of [.000123,.123,3500.123]) {
  const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1}));
  const sequence=await createSequenceEffect(createSequenceSpec({size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
  for(const local of [.23,.41]){
   const expected=render(original,local),fx=createFx(sequence,{x:sequence.meta.origin[0],y:sequence.meta.origin[1],seed:1});
   let previous=0;
   for(const target of [at/2,at,at+local/3,at+local*2/3,at+local]) {fx.update(target-previous);previous=target;}
   for(let repeat=0;repeat<2;repeat++){
    const f=createFrame(...sequence.meta.size);fx.draw(f,'back');fx.draw(f,'front');assert.deepEqual(f.color,expected.color);assert.deepEqual(f.light,expected.light);
   }
  }
 }
});

test('generated event neighbours and terminal exclusion retain ordinary timing',async()=>{
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1}));
 const at=.123,sequence=await createSequenceEffect(createSequenceSpec({size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
 for(const local of [.23-1e-8,.23+1e-8,.41-1e-8,.41+1e-8,.237123456789]){
  const a=render(sequence,at+local),e=render(original,local);assert.deepEqual(a.color,e.color);assert.deepEqual(a.light,e.light);
 }
 const terminal=render(sequence,at+original.meta.duration);assert.ok(terminal.color.every(x=>x===0));assert.ok(terminal.light.every(x=>x===0));
});

test('50 fps frame 18 preserves an arrival at cue .13 plus event .23',async()=>{
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike'}));
 const sequence=await createSequenceEffect(createSequenceSpec({size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at:.13,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
 assert.equal(.13+.23,18/50);
 assert.deepEqual(render(sequence,18/50).color,render(original,.23).color);
});

function hdrRender(mod, targets) {
 const f=enableHDRLight(createFrame(...mod.meta.size)),fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],seed:1,light:1});let last=0;
 for(const target of targets){fx.update(target-last);last=target;}fx.draw(f);return f;
}
function equalFrames(a,b){for(const key of ['color','light','hdrLight'])assert.deepEqual(a[key],b[key],key);}
function adjacent(value,direction){const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value);data.setBigUint64(0,data.getBigUint64(0)+BigInt(direction));return data.getFloat64(0);}

test('absolute authored events retain canonical HDR frames across bounded loop cycles and update partitions',async()=>{
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1})),at=.123;
 for(const duration of [2,1.2,at+original.meta.duration]){
  const sequence=await createSequenceEffect(createSequenceSpec({loop:true,duration,size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
  for(const cycle of [0,1,3])for(const event of [.23,.41]){
   const target=cycle*duration+(at+event),expected=hdrRender(original,[event]);
   equalFrames(hdrRender(sequence,[target]),expected);
   equalFrames(hdrRender(sequence,[target/3,target*2/3,target]),expected);
  }
 }
});

test('immediate representable absolute event neighbours keep raw local sampling across loops',async()=>{
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1})),at=.123;
 for(const duration of [2,1.2,at+original.meta.duration]){
  const sequence=await createSequenceEffect(createSequenceSpec({loop:true,duration,size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
  for(const cycle of [0,1,3])for(const event of [.23,.41])for(const direction of [-1,1]){
   const target=adjacent(cycle*duration+(at+event),direction);
   const raw=characterClipTime2D(target,duration,true).time-at;
   equalFrames(hdrRender(sequence,[target]),hdrRender(original,[raw]));
  }
 }
});

test('nearby genuinely lit samples retain canonical packed and HDR output',async()=>{
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1})),at=.123;
 const sequence=await createSequenceEffect(createSequenceSpec({cues:[{id:'strike',at,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]}));
 for(const local of [.233,.413]){const expected=hdrRender(original,[local]);assert.ok(expected.light.some(x=>x!==0));assert.ok(expected.hdrLight.some(x=>x>0));equalFrames(hdrRender(sequence,[at+local]),expected);}
});
