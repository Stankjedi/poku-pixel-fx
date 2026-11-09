import test from 'node:test';
import assert from 'node:assert/strict';
import { createIgnitionPose2D, createFrame, Painter } from '../build/core/index.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
const options={start:.2,duration:.4,position:[8,-22],size:[22,12],angle:-Math.PI/2,anchor:[-1,0],opacity:.9,
  keys:[{at:0,scale:[.12,.4]},{at:.7,scale:[.32,.8]},{at:1,scale:[1,1]}]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function anchorWorld(p,a){const x=p.size[0]*a[0],y=p.size[1]*a[1];return[p.position[0]+Math.cos(p.angle)*x-Math.sin(p.angle)*y,p.position[1]+Math.sin(p.angle)*x+Math.cos(p.angle)*y];}
test('ignition preserves the rotated root while growing and holds the exact mature pose',()=>{
 const p=createIgnitionPose2D(options),end=p.sample(p.end),root=anchorWorld(end,options.anchor);
 assert.ok(Object.isFrozen(p));assert.equal(p.sample(.1),undefined);assert.equal(p.sample(.2).opacity,0);
 assert.deepEqual(end.size,options.size);assert.deepEqual(end.position,options.position);assert.equal(end.opacity,.9);
 for(let i=0;i<=40;i++){const s=p.sample(p.start+(p.end-p.start)*i/40),a=anchorWorld(s,options.anchor);near(a[0],root[0]);near(a[1],root[1]);assert.ok(s.size[0]>0&&s.size[0]<=22);}
 assert.deepEqual(p.sample(10),{...end,time:10});
 const before=p.sample(p.end-1e-8);near(before.size[0],end.size[0]);near(before.position[1],end.position[1]);
 assert.equal('progress' in end,false,'pose must not overwrite kinetic burst expansion progress');
});
test('ignition snapshots keys/arrays, seeks directly, and supports deliberate compression',()=>{
 const o=structuredClone(options),p=createIgnitionPose2D(o),saved=p.sample(.5);o.position.fill(999);o.size.fill(999);o.anchor.fill(1);o.keys[1].scale.fill(999);o.keys[1].at=.9;
 const result=p.sample(.5);result.position.fill(999);result.size.fill(999);p.sample(2);p.sample(.2);assert.deepEqual(p.sample(.5),saved);
 const compress=createIgnitionPose2D({...options,keys:[{at:0,scale:[.2,.2]},{at:.6,scale:[1.4,1.4]},{at:1,scale:[1,1]}]});
 near(compress.sample(.2+.4*.6).size[0],22*1.4);assert.ok(compress.sample(.55).size[0]>22);
});
test('invalid ignition transforms fail before rendering; sample times must be finite',()=>{
 for(const patch of[{duration:0},{duration:null},{start:1e308,duration:1},{angle:null},{opacity:2},
  {position:[NaN,0]},{size:[0,2]},{anchor:null},{anchor:[2,0]},{keys:null},{keys:[]},
  {keys:[{at:0,scale:[.2,.2]},{at:1,scale:[2,1]}]},{keys:[{at:0,scale:[0,1]},{at:1,scale:[1,1]}]},
  {keys:[{at:0,scale:[1,1]},{at:0,scale:[1,1]},{at:1,scale:[1,1]}]},
  {size:[1e308,1],keys:[{at:0,scale:[2,1]},{at:1,scale:[1,1]}]}])assert.throws(()=>createIgnitionPose2D({...options,...patch}),RangeError);
 assert.throws(()=>createIgnitionPose2D(options).sample(Infinity),RangeError);
});
function scene(material,action,layers={}){const plan=createGenerationPlan2D({material,action,seed:17}),mod=createGeneratedEffect2D(plan),impl=mod.create({...mod.meta.options,layers});return{plan,at(t){const f=createFrame(...mod.meta.size),p=new Painter(f).place(...mod.meta.origin);impl.drawBack(p,t);impl.draw(p,t);return f;}};}
const mass=f=>f.color.reduce((s,c)=>s+(c>>>24),0);
test('new dash preparation joins the actual launch body without a shape/angle swap',()=>{
 for(const m of['fire','energy']){const s=scene(m,'dash',{trail:false,sparks:false,light:false});const r=s.plan.timing.release;
  const a=mass(s.at(r-1e-6)),b=mass(s.at(r)),c=mass(s.at(r+1e-6));assert.ok(Math.abs(a/b-1)<.01);assert.ok(Math.abs(c/b-1)<.01);
 }
});
test('plume keeps its base supplied through release and its growth handoff',()=>{
 for(const m of['fire','energy']){const s=scene(m,'plume',{trail:false,sparks:false,light:false});const r=s.plan.timing.release;
  for(const t of[r-.02,r,r+.02,r+.12-1e-6,r+.12]){const f=s.at(t),row=Math.floor(s.plan.origin[1]+s.plan.from[1])-1;
   assert.ok(f.color.slice(row*f.w+184,row*f.w+201).some(c=>c>>>24),'root row must remain supplied');}
  const a=mass(s.at(r-1e-6)),b=mass(s.at(r)),c=mass(s.at(r+1e-6));assert.ok(Math.abs(a/b-1)<.02);assert.ok(Math.abs(c/b-1)<.02);
 }
});
test('preparation respects layer controls and does not change event clocks',()=>{
 for(const m of['fire','energy'])for(const action of['dash','burst','plume']){
  const s=scene(m,action,{body:false,trail:false,sparks:false,response:false,residue:false,light:false});assert.equal(mass(s.at(.15)),0);
  const r=s.plan.timing.release;assert.equal(r,action==='burst'?.22:.28);assert.equal(s.plan.events.find(e=>e.id==='release').at,r);
  const normal=scene(m,action),saved=normal.at(.15);normal.at(.6);normal.at(.1);assert.deepEqual(normal.at(.15),saved);
 }
});
