import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationPlan2D,createGeneratedEffect2D,parseGenerationMeaning2D,resolveGenerationPlan2D} from '../build/authoring/generation.js';
import {createFrame,createFx,Painter,PAL} from '../build/core/index.js';
import {collectAssetEvents} from '../build/render/export.js';
const make=(seed=17,opts={})=>{const plan=createGenerationPlan2D({material:'ice',action:'shatter',seed}),mod=createGeneratedEffect2D(plan),impl=mod.create({...mod.meta.options,...opts});
 return{plan,mod,at(t){const f=createFrame(...mod.meta.size),p=new Painter(f).place(...mod.meta.origin);impl.drawBack(p,t);impl.draw(p,t);return f}}};
const empty=f=>f.color.every(c=>!c)&&f.light.every(c=>!c);
test('explicit ice/shatter vocabulary has a shared fracture clock and rejects unsupported combinations',()=>{
 assert.deepEqual(parseGenerationMeaning2D('얼음','파쇄'),{material:'ice',action:'shatter'});
 const p=make().plan;assert.deepEqual(resolveGenerationPlan2D(JSON.parse(JSON.stringify(p))),p);
 assert.equal(p.events.find(e=>e.id==='shatter').at,p.timing.release);assert.equal(p.events.some(e=>e.kind==='burst'),false);
 for(const input of[{material:'ice',action:'dash'},{material:'ice',action:'burst'},{material:'fire',action:'shatter'},
  {material:'ice',action:'shatter',response:'burst'},{material:'ice',action:'shatter',travel:.7}])assert.throws(()=>createGenerationPlan2D(input),RangeError);
 const p2=JSON.parse(JSON.stringify(p));p2.events[1].at+=.02;assert.throws(()=>resolveGenerationPlan2D(p2),/disagrees/);
});
test('generated ice is bounded, seekable, non-emissive and ends empty across independent seeds',()=>{
 for(const seed of[0,1,17,218,0xffffffff]){
  const s=make(seed),saved=s.at(.65);s.at(1.2);s.at(.1);assert.deepEqual(s.at(.65),saved);assert.deepEqual(make(seed).at(.65),saved);
  for(let i=0;i<=Math.ceil(s.mod.meta.duration*40);i++){
   const f=s.at(i/40);assert.ok(f.light.every(c=>!c));
   for(let x=0;x<f.w;x++)for(const y of[0,f.h-1])assert.equal(f.color[y*f.w+x],0,`crop at ${i/40}, seed ${seed}`);
   for(let y=0;y<f.h;y++)for(const x of[0,f.w-1])assert.equal(f.color[y*f.w+x],0);
  }
  for(const t of[0,s.mod.meta.duration,s.mod.meta.duration+1])assert.ok(empty(s.at(t)));
 }
});
test('body-to-pieces handoff preserves matter; ice is not a recolored fire burst',()=>{
 const s=make(17,{layers:{sparks:false}}),r=s.plan.timing.release;
 const mass=f=>f.color.reduce((n,c)=>n+(c>>>24),0),a=s.at(r-1e-7),b=s.at(r),c=s.at(r+1e-7);
 assert.deepEqual(a,b);assert.ok(Math.abs(mass(c)/mass(b)-1)<.025);
 const plan=createGenerationPlan2D({material:'fire',action:'burst',seed:17}),mod=createGeneratedEffect2D(plan),impl=mod.create({...mod.meta.options,palette:PAL.ice,layers:{light:false}});
 const f=createFrame(...mod.meta.size),p=new Painter(f).place(...mod.meta.origin);impl.drawBack(p,.55);impl.draw(p,.55);
 assert.notDeepEqual(s.at(.55).color,f.color);assert.notDeepEqual(s.at(.75).color,s.at(.55).color);
 assert.deepEqual(make(17,{layers:{light:false}}).at(.55),make().at(.55));
});
test('ice layers, palette and runtime events remain independently controllable',()=>{
 const disabled={body:false,response:false,sparks:false,trail:false,residue:false,light:false},s=make(17,{layers:disabled});
 for(const t of[.1,.3,.36,.6,1])assert.ok(empty(s.at(t)));
 assert.ok(empty(make(17,{layers:{body:false}}).at(.2)));
 assert.ok(empty(make(17,{layers:{response:false,sparks:false}}).at(.6)));
 assert.notDeepEqual(make(17,{palette:['#222','#888','#fff']}).at(.6).color,make().at(.6).color);
 const live=make(),fx=createFx(live.mod,{x:live.mod.meta.origin[0],y:live.mod.meta.origin[1]});fx.update(.6);
 const f=createFrame(...live.mod.meta.size);fx.draw(f);assert.deepEqual(f,live.at(.6));
 assert.equal(collectAssetEvents(live.mod).find(e=>e.id==='shatter').at,live.plan.timing.release);
 for(const layers of[null,[],{typo:true},{body:'false'}])assert.throws(()=>make(17,{layers}),/layer flags/);
 assert.throws(()=>make().at(NaN),RangeError);
});
