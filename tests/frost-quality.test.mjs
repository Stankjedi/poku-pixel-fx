import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { frostAccretion2D, defineImpactContact2D, createFrame, createFx, clearFrame } from '../build/core/index.js';
import * as frost from '../build/fx/ice/frost-beam.js';
import { loadEffect, renderFrames, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
const contact=defineImpactContact2D({id:'freeze',at:.48,position:[64,-45],normal:[-1,0],material:'metal'});
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const hash=f=>createHash('sha256').update(new Uint8Array(f.color.buffer)).update(new Uint8Array(f.light.buffer)).digest('hex');

test('frost roots are surface-attached and children are connected before they grow',()=>{
 for(const normal of [[-1,0],[0,-1],[3,-4]])for(const seed of [1,7,31]) {
  const c=defineImpactContact2D({...contact,normal}),f=frostAccretion2D(c,{seed});
  for(let i=0;i<f.branches.length;i++) {
   const b=f.branches[i],dx=b.root[0]-c.position[0],dy=b.root[1]-c.position[1];
   if(b.parent===-1){near(dx*c.normal[0]+dy*c.normal[1],0);assert.ok(Math.hypot(dx,dy)<=36);}
   else {
    const parent=f.branches[b.parent];near(b.root[0],parent.root[0]+(parent.tip[0]-parent.root[0])*b.attachment);
    near(b.root[1],parent.root[1]+(parent.tip[1]-parent.root[1])*b.attachment);
    near(f.sample(b.parent,b.startsAt).growth,b.attachment);assert.ok(b.releasesAt<=parent.releasesAt);
   }
   assert.ok((b.tip[0]-b.root[0])*c.normal[0]+(b.tip[1]-b.root[1])*c.normal[1]>0,'crystals grow outward');
   assert.equal(f.sample(i,c.at-1e-5).growth,0);assert.equal(f.sample(i,c.at-1e-5).attached,false);
   assert.equal(f.sample(i,b.releasesAt).attached,false);assert.equal(f.sample(i,b.releasesAt).fracture,1);
   assert.ok(Object.isFrozen(b)&&Object.isFrozen(b.root)&&Object.isFrozen(f.sample(i,1).polygon));
  }
 }
});
test('frost accumulation is monotonic, caps when exposure ends, and never grows unsupported children',()=>{
 const f=frostAccretion2D(contact,{exposure:.28});
 for(let i=0;i<f.branches.length;i++) {
  let growth=0;
  for(let t=0;t<2;t+=.007){const s=f.sample(i,t);assert.ok(s.growth>=growth);growth=s.growth;
   const b=f.branches[i];if(s.growth>0&&b.parent>=0)assert.ok(f.sample(b.parent,t).growth+1e-8>=b.attachment);
  }
  near(f.sample(i,f.exposureEndsAt).growth,f.sample(i,4).growth);
 }
 assert.ok(f.branches.some((b,i)=>f.sample(i,4).growth===0),'short beam leaves distal branches unbuilt');
 const full=frostAccretion2D(contact);assert.deepEqual(full.branches,frostAccretion2D(contact).branches);
 assert.notDeepEqual(full.branches,frostAccretion2D(contact,{seed:9}).branches);
 const sample=full.sample(8,.9);full.sample(8,3);assert.deepEqual(full.sample(8,.9),sample,'seek order does not advance growth');
});
test('frost helpers reject invalid authoring inputs and samples',()=>{
 for(const options of [{seed:NaN},{count:2},{count:33},{count:3.5},{halfSpan:0},{length:-1},{exposure:0},{exposure:13},{spreadSpeed:0},{hold:-1},{hold:Infinity}])assert.throws(()=>frostAccretion2D(contact,options),RangeError);
 const f=frostAccretion2D(contact);for(const [i,t] of [[-1,0],[f.branches.length,0],[.5,1],[0,NaN],[0,Infinity]])assert.throws(()=>f.sample(i,t),RangeError);
 const input=structuredClone(contact);frostAccretion2D(input);assert.deepEqual(input,contact);
});
function shot(time,options={},fps=120){
 const [w,h]=frost.meta.size,f=createFrame(w,h),fx=createFx(frost,{x:frost.meta.origin[0],y:frost.meta.origin[1],...options});
 const steps=Math.round(time*fps);if(steps)for(let i=0;i<steps;i++)fx.update(time/steps);fx.draw(f);return f;
}
test('frost beam is deterministic, seekable across frame partitions, palette-sensitive and ends empty',()=>{
 for(const t of [.3,.48,.7,1.2,1.5,1.8,2.3,3.2]){
  const f=shot(t);for(const fps of [30,60,144])assert.equal(hash(f),hash(shot(t,{},fps)));
  assert.equal(hash(f),hash(shot(t)));
 }
 assert.notEqual(hash(shot(1)),hash(shot(1,{seed:7})));
 assert.notEqual(hash(shot(1)),hash(shot(1,{palette:['#172030','#6f98af','#efffff']})));
 for(const t of [frost.meta.duration,frost.meta.duration+1]){const f=shot(t);assert.ok(f.color.every(c=>c===0));assert.ok(f.light.every(c=>c===0));}
});
test('frost stays non-emissive after the beam, leaves metal intact, and reports the exact contact',()=>{
 const fx=createFx(frost);assert.equal(fx.contacts.length,1);assert.equal(fx.contacts[0].at,frost.FROST_BEAM_CONTACT_TIME);
 assert.equal(fx.contacts[0].material,'metal');assert.deepEqual(fx.contacts[0].position,[64,-45]);
 const f=shot(2.2),early=shot(.1),side=(frost.meta.origin[1]-45)*f.w+frost.meta.origin[0]+84;
 assert.equal(f.color[side],early.color[side],'the receiving metal is not shattered');
 assert.ok(f.light.every(c=>c===0),'cold flakes reflect light, they do not keep glowing');
 assert.deepEqual(fx.shake,[0,0],'freezing does not use an explosion shake');
 const pre=shot(.47,{surface:false}),at=shot(.48,{surface:false});
 const crop=f=>{let n=0;for(let y=85;y<115;y++)for(let x=222;x<232;x++)if(f.color[y*f.w+x]>>>24)n++;return n;};
 assert.equal(crop(pre),0);assert.ok(crop(at)>0,'contact flare begins on the exact contact frame');
});
test('raw frost frames fit declared bounds across seeds, force, density, mirroring and surface-only export',()=>{
 for(const options of [{},{seed:2},{seed:7,power:1.35,roots:15},{seed:13,power:.65,roots:7},{flip:true},{surface:false}]){
  const [w,h]=frost.meta.size,pad=28,f=createFrame(w+2*pad,h+2*pad,-pad,-pad),fx=createFx(frost,{x:frost.meta.origin[0],y:frost.meta.origin[1],...options});
  for(let i=0;i<=Math.round(frost.meta.duration*30);i++){
   if(i)fx.update(1/30);clearFrame(f);fx.draw(f);
   for(let j=0;j<f.color.length;j++)if(f.color[j]>>>24||f.light[j]){const x=j%f.w-pad,y=Math.floor(j/f.w)-pad;assert.ok(x>=0&&y>=0&&x<w&&y<h,`seed ${options.seed} frame ${i}: ${x},${y}`);}
  }
 }
});
test('frost sheet exports contact metadata, fixed pivot and transparent terminal frame',async()=>{
 const effect=await loadEffect('ice/frost-beam'),r=renderFrames(effect,{options:{flip:true,surface:false,cameraMotion:0}}),s=spriteSheet(effect,r,'frost-beam');
 const c=s.json.meta.pokuFx.contacts[0];assert.equal(c.at,frost.FROST_BEAM_CONTACT_TIME);assert.equal(c.material,'metal');assert.deepEqual(c.position,[-64,-45]);assert.deepEqual(c.normal,[1,0]);
 assert.ok(r.frames.at(-1).clear.every(v=>v===0));
});
