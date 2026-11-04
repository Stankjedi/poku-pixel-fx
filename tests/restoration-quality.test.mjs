import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { defineRestorationTiming2D, restorationField2D, restorationPulseCrossed, stockActor, createFx, createAct, createFrame, clearFrame, painterFor, drawActor } from '../build/core/index.js';
import * as heal from '../build/fx/holy/heal.js';
import { loadEffect, renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
const timing = heal.restoration;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const hash=f=>createHash('sha256').update(new Uint8Array(f.color.buffer)).update(new Uint8Array(f.light.buffer)).digest('hex');
function shot(t,options={},parts=1) {
  const f=createFrame(192,160), fx=createFx(heal,{x:96,y:120,...options});
  for(let i=0;i<parts;i++)fx.update(t/parts);
  fx.draw(f); return {f,fx};
}

test('restoration has its own ordered, immutable schedule rather than an impact contact',()=>{
 const source={...timing,unused:'not serialized'},t=defineRestorationTiming2D(source);
 assert.deepEqual(t,timing);assert.ok(Object.isFrozen(t));source.pulseAt=7;assert.equal(t.pulseAt,.7);
 for(const bad of [{startsAt:-1},{startsAt:.8},{pulseAt:.14},{pulseAt:NaN},{liftedAt:.7},{endsAt:1},{endsAt:Infinity}])
  assert.throws(()=>defineRestorationTiming2D({...timing,...bad}),RangeError);
});

test('target attachment snapshots occupied pixels, sparse rows and translated anatomy',()=>{
 const actor={x:17,y:-23,mask:{w:5,h:5,data:Uint8Array.from([0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0])},pixels:new Uint32Array(25).fill(0xff123456),chest:[19,-22]};
 const field=restorationField2D(actor,timing);
 assert.equal(field.top,-22);assert.equal(field.bottom,-20);assert.equal(field.centerX,19);assert.equal(field.cells.length,4);
 assert.deepEqual(field.spanAt(-22),[18,20]);assert.deepEqual(field.spanAt(-20),[19,19]);assert.deepEqual(field.spanAt(-21),[18,20]);
 assert.deepEqual(field.chest,[19,-22]);near(field.sample(timing.pulseAt).sweepY,-22);
 assert.ok(Object.isFrozen(field)&&Object.isFrozen(field.cells)&&Object.isFrozen(field.cells[0])&&Object.isFrozen(field.spanAt(0)));
 actor.mask.data.fill(0);actor.pixels.fill(0);actor.chest[1]=0;actor.x=0;
 assert.equal(field.cells.length,4);assert.equal(field.cells[0].color,0xff123456);assert.deepEqual(field.chest,[19,-22]);
});

test('the restorative response travels upward monotonically and meets the chest on the healing beat',()=>{
 for(const actor of [stockActor(1),stockActor(2)]) {
  const field=restorationField2D(actor,timing);let last=Infinity,progress=0;
  for(let t=0;t<2.2;t+=.005){const s=field.sample(t);assert.ok(s.sweepY<=last+1e-9);assert.ok(s.progress>=progress);last=s.sweepY;progress=s.progress;
   for(const value of [s.progress,s.pulse,s.coverage])assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
  }
  near(field.sample(timing.pulseAt).sweepY,actor.chest[1]);assert.equal(field.sample(timing.pulseAt).pulse,1);
  assert.equal(field.sample(timing.startsAt).coverage,0);assert.equal(field.sample(timing.endsAt).coverage,0);
  assert.equal(field.responseAt(actor.chest[1],0),0);assert.equal(field.responseAt(actor.chest[1],3),0);
  assert.ok(field.responseAt(actor.chest[1],timing.pulseAt)>.7);
  const saved=field.sample(.51);field.sample(1.8);assert.deepEqual(field.sample(.51),saved);
 }
});

test('short restoration schedules never pulse before their authored start',()=>{
 const quick={startsAt:.1,pulseAt:.12,liftedAt:.14,endsAt:.2},f=restorationField2D(stockActor(2),quick);
 for(const t of [0,.099,.1]){assert.equal(f.sample(t).pulse,0);assert.equal(f.sample(t).coverage,0);}
 assert.equal(f.sample(.12).pulse,1);assert.equal(f.sample(.2).pulse,0);
});

test('healing beat dispatch is exact once across small, repeated and catch-up updates',()=>{
 for(const times of [[0,.2,.69,.7,.7,.72,2],[0,2],Array.from({length:252},(_,i)=>i/120)]) {
  let n=0;for(let i=1;i<times.length;i++)if(restorationPulseCrossed(timing,times[i-1],times[i]))n++;
  assert.equal(n,1);
 }
 assert.equal(restorationPulseCrossed(timing,.7,.7),false);
 for(const [a,b] of [[1,0],[NaN,1],[0,Infinity]])assert.throws(()=>restorationPulseCrossed(timing,a,b),RangeError);
});

test('restoration rejects broken masks, incomplete colors and nonfinite samples',()=>{
 const actor=stockActor(2);
 for(const bad of [{x:NaN},{mask:{w:0,h:1,data:[]}},{mask:{w:2,h:2,data:[1]}},{mask:{w:1,h:1,data:[0]},pixels:undefined},{pixels:[]}])
  assert.throws(()=>restorationField2D({...actor,...bad},timing),RangeError);
 const field=restorationField2D(actor,timing);
 for(const t of [NaN,Infinity]) {assert.throws(()=>field.sample(t),RangeError);assert.throws(()=>field.spanAt(t),RangeError);assert.throws(()=>field.responseAt(t,1),RangeError);}
});

test('heal is seeded and seekable independently of host frame partitioning',()=>{
 for(const t of [.2,.51,.7,.93,1.25,1.7,2.1]) {
  const baseline=hash(shot(t).f);for(const parts of [1,7,30,60,144])assert.equal(hash(shot(t,{},parts).f),baseline);
 }
 assert.notEqual(hash(shot(.51).f),hash(shot(.51,{seed:13}).f));
 assert.notEqual(hash(shot(.7).f),hash(shot(.7,{palette:['#381424','#b7648b','#ffe4c3']}).f));
 const lit=shot(.7).f,unlit=shot(.7,{light:0}).f;assert.deepEqual(unlit.color,lit.color);assert.ok(unlit.light.every(v=>v===0));assert.ok(lit.light.some(v=>v!==0));
});

test('every drawn component follows a moving target with no residual world-space particles',()=>{
 const {f,fx}=shot(.7);fx.options.x+=11;fx.options.y-=7;
 const moved=createFrame(f.w,f.h);fx.draw(moved);
 for(let y=7;y<f.h;y++)for(let x=0;x<f.w-11;x++){
  assert.equal(moved.color[(y-7)*f.w+x+11],f.color[y*f.w+x]);
  assert.equal(moved.light[(y-7)*f.w+x+11],f.light[y*f.w+x]);
 }
});

test('healing restores without recoil, hit-stop, debris or a screen shake',()=>{
 const fx=createFx(heal);assert.deepEqual(fx.contacts,[]);assert.deepEqual(fx.shake,[0,0]);
 assert.equal(heal.act.hits,undefined);assert.ok(heal.act.onBody);assert.ok(heal.act.poses.some(p=>p[0]===timing.pulseAt));
 const act=createAct(heal);for(let i=0;i<80;i++){act.update(1/30);assert.equal(act.frozen,false);assert.deepEqual(act.shake,[0,0]);}
 assert.equal(act.targets.length,0);
});

test('the target keeps shaded anatomy at the pulse and clean light-free readability',()=>{
 const actor=stockActor(2),f=createFrame(192,160),fx=createFx(heal,{x:96,y:120,light:0});fx.update(.7);
 fx.draw(f,'back');drawActor(painterFor(f).place(96,120),actor);fx.draw(f,'front');
 let total=0,unchanged=0,white=0;const shades=new Set();
 for(let j=0;j<actor.mask.h;j++)for(let i=0;i<actor.mask.w;i++)if(actor.mask.data[j*actor.mask.w+i]){
  total++;const c=f.color[(120+actor.y+j)*f.w+96+actor.x+i];shades.add(c);
  if(c===actor.pixels[j*actor.mask.w+i])unchanged++;
  if((c&255)>239&&((c>>>8)&255)>239&&((c>>>16)&255)>239)white++;
 }
 assert.ok(unchanged/total>.45,`${unchanged}/${total} original body pixels kept`);assert.ok(shades.size>16);assert.ok(white/total<.02);
});

test('raw default, mirrored, recolored and small-target frames fit their declared bounds',()=>{
 for(const options of [{},{seed:13},{flip:true},{light:0},{actor:stockActor(1)},{seed:8,palette:['#271b3c','#9676be','#f4e7ff']}]){
  const [w,h]=heal.meta.size,pad=24,f=createFrame(w+2*pad,h+2*pad,-pad,-pad),fx=createFx(heal,{x:heal.meta.origin[0],y:heal.meta.origin[1],...options});
  for(let i=0;i<=63;i++) {if(i)fx.update(1/30);clearFrame(f);fx.draw(f);
   for(let j=0;j<f.color.length;j++)if(f.color[j]>>>24||f.light[j]){const x=j%f.w-pad,y=Math.floor(j/f.w)-pad;assert.ok(x>=0&&y>=0&&x<w&&y<h,`frame ${i}: ${x},${y}`);}
  }
 }
});

test('sprite exports retain the non-impact healing beat and fixed pivot, and end transparent',async()=>{
 const effect=await loadEffect('holy/heal'),r=renderFrames(effect,{options:{flip:true,light:0}}),sheet=spriteSheet(effect,r,'heal');
 assert.deepEqual(sheet.json.meta.pokuFx.restoration,timing);assert.equal(sheet.json.meta.pokuFx.contacts,undefined);
 assert.deepEqual(sheet.json.meta.pokuFx.act.hits,[]);assert.deepEqual(sheet.json.meta.pokuFx.pivot,heal.meta.origin);
 assert.ok(r.frames.at(-1).clear.every(v=>v===0));
 for(const t of [heal.meta.duration,heal.meta.duration+3]){const f=shot(t).f;assert.ok(f.color.every(v=>v===0));assert.ok(f.light.every(v=>v===0));}
});
