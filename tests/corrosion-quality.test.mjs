import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { surfaceCorrosion2D, defineImpactContact2D, createFx, createFrame, clearFrame } from '../build/core/index.js';
import * as acid from '../build/fx/nature/acid-splash.js';
import { loadEffect, renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
const contact=defineImpactContact2D({id:'splat',at:.46,position:[0,8],normal:[-1,0],material:'metal'});
const target=()=>({x:0,y:0,mask:{w:24,h:24,data:new Uint8Array(24*24).fill(1)}});
const hash=f=>createHash('sha256').update(new Uint8Array(f.color.buffer)).update(new Uint8Array(f.light.buffer)).digest('hex');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('corrosion wetting is rooted at contact and cannot cross holes, islands or diagonal-only corners',()=>{
 const t=target();for(let y=0;y<24;y++)t.mask.data[y*24+12]=0;
 const f=surfaceCorrosion2D(contact,t,{reach:100});assert.ok(f.cells.every(c=>c.x<12));
 for(const c of f.cells)assert.ok(t.mask.data[c.y*24+c.x]);
 const q={x:0,y:0,mask:{w:3,h:3,data:[1,0,0,0,1,0,0,0,1]}};
 const c=defineImpactContact2D({...contact,position:[0,0]});assert.equal(surfaceCorrosion2D(c,q).cells.length,1);
 // A gap is reachable around its end only when the path budget is enough; no direct wetting through it.
 const gap=target();for(let y=0;y<20;y++)gap.mask.data[y*24+6]=0;
 const limited=surfaceCorrosion2D(contact,gap,{reach:8});assert.ok(limited.cells.every(c=>c.x<6));
 const around=surfaceCorrosion2D(contact,gap,{reach:100});assert.ok(around.cells.some(c=>c.x>6));
 const across=around.cells.find(c=>c.x===7&&c.y===8);assert.ok(across.distance>20);
});
test('runoff is projected along the chosen flow and arrival precedes surface change',()=>{
 const c=defineImpactContact2D({...contact,position:[12,12]}),f=surfaceCorrosion2D(c,target(),{reach:100,seed:1});
 const up=f.cells.find(c=>c.x===12&&c.y===5),down=f.cells.find(c=>c.x===12&&c.y===19);assert.ok(down.startsAt<up.startsAt);
 for(let i=0;i<f.cells.length;i++){
  const cell=f.cells[i];assert.ok(cell.startsAt>=contact.at);near(cell.startsAt,contact.at+cell.distance/70);
  assert.deepEqual(f.sample(i,cell.startsAt-1e-5),{wet:0,etch:0,active:false});
 }
 const reverse=surfaceCorrosion2D(c,target(),{flow:[0,-1],reach:100});
 assert.ok(reverse.cells.find(c=>c.x===12&&c.y===5).startsAt<reverse.cells.find(c=>c.x===12&&c.y===19).startsAt);
});
test('wet film dries but etched response is monotonic and persists without becoming chemistry or damage',()=>{
 const f=surfaceCorrosion2D(contact,target());
 for(let i=0;i<f.cells.length;i+=11){let etch=0;
  for(let t=0;t<4;t+=.013){const s=f.sample(i,t);assert.ok(s.wet>=0&&s.wet<=1);assert.ok(s.etch>=etch&&s.etch<=1);etch=s.etch;}
  assert.equal(f.sample(i,f.driesAt).wet,0);near(f.sample(i,f.driesAt).etch,f.sample(i,100).etch);
 }
 const zero=surfaceCorrosion2D(defineImpactContact2D({...contact,strength:0}),target());assert.ok(zero.cells.every((_,i)=>zero.sample(i,3).etch===0));
 const saved=f.sample(20,1.2);f.sample(20,10);assert.deepEqual(f.sample(20,1.2),saved);
});
test('surface masks, contact facts and deterministic seeded cells are immutable snapshots',()=>{
 const t=target(),c=structuredClone(contact),before=structuredClone(t),f=surfaceCorrosion2D(c,t);
 assert.deepEqual(t,before);assert.deepEqual(c,contact);assert.deepEqual(f.cells,surfaceCorrosion2D(c,t).cells);
 assert.notDeepEqual(f.cells,surfaceCorrosion2D(c,t,{seed:9}).cells);
 const saved=f.sample(20,1.5),cells=f.cells;t.mask.data.fill(0);t.x=9;c.position[0]=9;
 assert.equal(f.cells,cells);assert.deepEqual(f.sample(20,1.5),saved);assert.deepEqual(f.contact.position,[0,8]);
 assert.ok(Object.isFrozen(f)&&Object.isFrozen(f.cells)&&Object.isFrozen(f.cells[0])&&Object.isFrozen(saved));
});
test('corrosion rejects incomplete masks, disconnected contacts, nonfinite input and invalid samples',()=>{
 for(const o of [{seed:NaN},{reach:0},{reach:2049},{spreadSpeed:0},{wetFor:0},{wetFor:31},{dryFor:-1},{flow:[0]},{flow:[NaN,1]},{flow:[1.79e308,1.79e308]}])assert.throws(()=>surfaceCorrosion2D(contact,target(),o),RangeError);
 for(const t of [{...target(),x:NaN},{x:0,y:0,mask:{w:0,h:1,data:[]}},{x:0,y:0,mask:{w:2,h:2,data:[1]}},{x:0,y:0,mask:{w:2,h:2,data:[0,0,0,0]}},{x:0,y:0,mask:{w:2,h:2,data:[NaN,1,1,1]}}])assert.throws(()=>surfaceCorrosion2D(contact,t),RangeError);
 assert.throws(()=>surfaceCorrosion2D(defineImpactContact2D({...contact,position:[200,200]}),target()),RangeError);
 const f=surfaceCorrosion2D(contact,target());for(const [i,t] of [[-1,0],[.5,0],[f.cells.length,0],[0,NaN],[0,Infinity]])assert.throws(()=>f.sample(i,t),RangeError);
});
function shot(t,options={},parts=1){const [w,h]=acid.meta.size,f=createFrame(w,h),fx=createFx(acid,{x:acid.meta.origin[0],y:acid.meta.origin[1],...options});for(let i=0;i<parts;i++)fx.update(t/parts);fx.draw(f);return{f,fx};}
test('acid is seekable, deterministic and independent of host frame partitioning',()=>{
 for(const t of [.2,.46,.61,.93,1.2,1.8,2.6,3.4]){const base=hash(shot(t).f);for(const parts of [2,7,30,60,144])assert.equal(hash(shot(t,{},parts).f),base);}
 assert.notEqual(hash(shot(1).f),hash(shot(1,{seed:12}).f));assert.notEqual(hash(shot(1).f),hash(shot(1,{palette:['#27152b','#9f517d','#f4cca8']}).f));
});
test('contact metadata matches visible arrival, surface does not react early, and dry metal is non-emissive',()=>{
 const {fx}=shot(0);assert.equal(fx.contacts.length,1);assert.equal(fx.contacts[0].at,acid.ACID_CONTACT_TIME);assert.equal(fx.contacts[0].material,'metal');assert.deepEqual(fx.contacts[0].position,[30,-49]);assert.deepEqual(fx.shake,[0,0]);
 const a=shot(0).f,b=shot(.459).f,late=shot(2.7).f;let changed=0;
 for(let y=50;y<130;y++)for(let x=162;x<199;x++){assert.equal(a.color[y*a.w+x],b.color[y*b.w+x]);if(a.color[y*a.w+x]!==late.color[y*late.w+x])changed++;}
 assert.ok(changed>100,'dry etched area stays visible');assert.ok(late.light.every(x=>x===0));
 const before=shot(.459,{surface:false}).f,at=shot(.46,{surface:false}).f;assert.equal(before.color[(136-49)*before.w+132+30],0);assert.ok(at.color[(136-49)*at.w+132+30]>>>24);
});
test('zero glow preserves crisp color, target rim remains readable, and terminal frame is empty',()=>{
 const a=shot(.6).f,b=shot(.6,{light:0}).f;assert.deepEqual(a.color,b.color);assert.ok(a.light.some(v=>v!==0));assert.ok(b.light.every(v=>v===0));
 const first=shot(0).f;for(const t of [.6,1.2,2.6]){const f=shot(t).f;for(const [x,y] of [[170,49],[198,80],[206,100],[167,55]])assert.equal(f.color[y*f.w+x],first.color[y*f.w+x]);}
 for(const t of [3.4,4]){const f=shot(t).f;assert.ok(f.color.every(v=>v===0));assert.ok(f.light.every(v=>v===0));}
});
test('acid raw bounds contain all seeds, force variants, flip and target-free overlays',()=>{
 for(const options of [{},{seed:1},{seed:12,power:1.3},{seed:21,power:.65},{flip:true},{surface:false},{light:0}]){
  const [w,h]=acid.meta.size,pad=32,f=createFrame(w+2*pad,h+2*pad,-pad,-pad),fx=createFx(acid,{x:acid.meta.origin[0],y:acid.meta.origin[1],...options});
  for(let i=0;i<=102;i++){if(i)fx.update(1/30);clearFrame(f);fx.draw(f);for(let j=0;j<f.color.length;j++)if(f.color[j]>>>24||f.light[j]){const x=j%f.w-pad,y=Math.floor(j/f.w)-pad;assert.ok(x>=0&&y>=0&&x<w&&y<h,`${JSON.stringify(options)} frame ${i}: ${x},${y}`);}}
 }
});
test('transparent sheet exports fixed pivot, resolved contact and a blank final frame',async()=>{
 const e=await loadEffect('nature/acid-splash'),r=renderFrames(e,{options:{flip:true,surface:false,cameraMotion:0}}),s=spriteSheet(e,r,'acid-splash');
 const c=s.json.meta.pokuFx.contacts[0];assert.equal(c.at,.46);assert.deepEqual(c.position,[-30,-49]);assert.deepEqual(c.normal,[1,0]);assert.equal(c.material,'metal');assert.ok(r.frames.at(-1).clear.every(v=>v===0));assert.equal(r.n,103);
});
