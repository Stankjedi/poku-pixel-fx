import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createFrame3D,Painter3D,createFx3D,enableHDRLight,color3D,advanceLiquidDrop3D,LiquidDrops3D,drawLiquidDrop3D,sampleLiquidCrown3D,drawLiquidCrown3D,drawSurfaceRipple3D,crownSplash3D} from "../build/3d/index.js";
const camera={yaw:0.68,elevation:28*Math.PI/180,zoom:1.28,target:[0,1.05,0]};
function render(fx,settings={}) {const frame=createFrame3D(220,160),p=new Painter3D(frame,{...camera,...settings});enableHDRLight(frame);p.begin("#0a1525");fx.draw(p);return frame;}
function at(t,opts={}) {const fx=createFx3D(crownSplash3D,opts);fx.seek(t);return fx;}
const occupied=f=>f.depth.reduce((n,v)=>n+Number.isFinite(v),0);
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const hash=a=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");

test("liquid gravity and linear drag integrate independently of frame partition",()=>{
  for(const drag of [0,1e-12,1e-8,0.01,0.2,1.4]) {
    const p=[0.2,2,-0.5],v=[2,4,-1],whole=advanceLiquidDrop3D(p,v,0.9,10.8,drag);
    let many={position:p,velocity:v};for(let i=0;i<108;i++) many=advanceLiquidDrop3D(many.position,many.velocity,1/120,10.8,drag);
    for(const key of ["position","velocity"]) for(let i=0;i<3;i++) close(many[key][i],whole[key][i]);
    assert.ok(whole.velocity[1]<v[1]);assert.ok(Math.abs(whole.velocity[0])<=Math.abs(v[0]));
  }
  const free=advanceLiquidDrop3D([0,0,0],[1,2,3],1,10,0);assert.deepEqual(free,{position:[1,-3,3],velocity:[1,-8,3]});
  for(const args of [[[NaN,0,0],[0,0,0],1],[[0,0,0],[0,0,0],-1],[[0,0,0],[0,0,0],1,-1],[[0,0,0],[0,0,0],Infinity]]) assert.throws(()=>advanceLiquidDrop3D(...args),RangeError);
});

test("drops merge once at their precise contact time and never bounce like solid debris",()=>{
  const drops=new LiquidDrops3D(0,10);drops.spawn({position:[0,1,0],velocity:[2,0,-1],radius:0.1,gravity:8,drag:0});
  drops.update(0.7);assert.equal(drops.size,0);const [hit]=drops.drainImpacts();
  close(hit.at,0.5,1e-8);close(hit.position[0],1,1e-8);close(hit.position[2],-0.5,1e-8);close(hit.position[1],0);close(hit.velocity[1],-4,1e-8);
  drops.update(10);assert.deepEqual(drops.drainImpacts(),[]);
  drops.spawn({position:[0,0,0],velocity:[0,4,0],radius:0.1,gravity:8});drops.update(0.1);assert.equal(drops.size,1);drops.update(2);assert.equal(drops.drainImpacts().length,1);
});

test("drop collections bound capacity, copy caller vectors, expire, clear, and reject invalid input",()=>{
  const drops=new LiquidDrops3D(0,1),p=[0,3,0],v=[1,0,0];
  assert.equal(drops.spawn({position:p,velocity:v,radius:0.1,life:0.2}),true);
  assert.equal(drops.spawn({position:p,velocity:v,radius:0.1}),false);
  p[1]=-100;v[1]=-100;drops.update(0.1);assert.equal(drops.size,1);assert.deepEqual(drops.drainImpacts(),[]);
  drops.update(0.2);assert.equal(drops.size,0);assert.deepEqual(drops.drainImpacts(),[]);
  for(const spec of [{position:[0,-1,0],velocity:[0,0,0],radius:0.1},{position:[NaN,1,0],velocity:[0,0,0],radius:0.1},{position:[0,1,0],velocity:[0,0,0],radius:0}]) assert.equal(drops.spawn(spec),false);
  assert.throws(()=>drops.update(-1),RangeError);assert.throws(()=>drops.update(NaN),RangeError);
  drops.spawn({position:[0,1,0],velocity:[0,0,0],radius:0.1});drops.clear();assert.equal(drops.size,0);assert.deepEqual(drops.drainImpacts(),[]);
});

test("crown rim is seeded, truly 3D, finite, bounded and shared with detachments",()=>{
  const spec={radius:2,height:1.5,seed:2};const a=sampleLiquidCrown3D(spec);
  assert.deepEqual(a,sampleLiquidCrown3D(spec));assert.notDeepEqual(a,sampleLiquidCrown3D({...spec,seed:3}));
  assert.equal(a.length,64);assert.ok(a.flat().every(Number.isFinite));
  assert.ok(Math.max(...a.map(v=>v[2]))-Math.min(...a.map(v=>v[2]))>3.8);
  assert.ok(Math.max(...a.map(v=>v[1]))-Math.min(...a.map(v=>v[1]))>0.4);
  for(const segments of [-1,Infinity,NaN,9999]) assert.ok(sampleLiquidCrown3D({...spec,segments}).length<=192);
  for(const spec of [{radius:0,height:1},{radius:1,height:0},{radius:NaN,height:1}]) assert.deepEqual(sampleLiquidCrown3D(spec),[]);
});

test("water helpers obey palette and occlusion, work with single colors, and do not emit light",()=>{
  const palette=["#123","#357","#68b","#bdf"],draw=p=>{drawLiquidDrop3D(p,[0,2,0],[1,-2,0],0.4,palette);drawLiquidCrown3D(p,{radius:1.5,height:1,palette});drawSurfaceRipple3D(p,{origin:[0,0.04,0],age:0.4,palette});};
  const f=render({draw});assert.ok(occupied(f)>100);assert.ok(f.light.every(c=>c===0));assert.ok(f.hdrLight.every(c=>c===0));
  const allowed=new Set([color3D("#0a1525"),...palette.map(color3D)]);
  const opaque=render({draw:p=>{drawLiquidDrop3D(p,[0,2,0],[1,-2,0],0.4,palette);drawLiquidCrown3D(p,{radius:1.5,height:1,palette});}});
  assert.ok(opaque.color.every(c=>allowed.has(c)));
  const occluded=render({draw:p=>{p.frame.depth.fill(100);draw(p);}});assert.ok(occluded.color.every(c=>c===color3D("#0a1525")));
  for(const palette of [[],["#0cf"]]) assert.ok(occupied(render({draw:p=>drawLiquidCrown3D(p,{radius:1,height:1,palette})}))>0);
});

test("ripple envelope has empty endpoints, decreases at the end, and translates to its impact",()=>{
  const counts=[0,0.3,1,2.3,2.5].map(age=>occupied(render({draw:p=>drawSurfaceRipple3D(p,{origin:[0,0.04,0],age})})));
  assert.equal(counts[0],0);assert.ok(counts[1]>0);assert.equal(counts.at(-1),0);
  const left=render({draw:p=>drawSurfaceRipple3D(p,{origin:[-2,0.04,0],age:0.3})}),right=render({draw:p=>drawSurfaceRipple3D(p,{origin:[2,0.04,0],age:0.3})});assert.notDeepEqual(left.color,right.color);
  for(const options of [{strength:0},{speed:0},{opacity:0}]) assert.equal(occupied(render({draw:p=>drawSurfaceRipple3D(p,{origin:[0,0,0],age:0.3,...options})})),0);
});

test("effect is deterministic across seek, update partitions, draw repetition and restart",()=>{
  const a=createFx3D(crownSplash3D),b=createFx3D(crownSplash3D);
  for(let i=0;i<57;i++) a.update(1/30);for(let i=0;i<228;i++) b.update(1/120);
  assert.deepEqual(render(a),render(b));assert.deepEqual(render(a),render(at(1.9)));assert.deepEqual(render(a),render(a));
  a.restart();a.seek(1.9);assert.deepEqual(render(a),render(b));
  assert.notDeepEqual(render(at(0.9,{seed:0})).color,render(at(0.9,{seed:1})).color);
});

test("water stages, silent scrubbing, proper one-shot endpoints and orbit parallax",()=>{
  assert.equal(at(0).stage(),"FALL");assert.equal(at(0.7).stage(),"CROWN");assert.equal(at(1.3).stage(),"REBOUND");assert.equal(at(3).stage(),"SETTLE");
  const fx=createFx3D(crownSplash3D);fx.update(0.49);assert.deepEqual(fx.drainCues(),[]);fx.update(0.02);assert.deepEqual(fx.drainCues().map(c=>c.type),["hit","sound"]);fx.update(4);assert.deepEqual(fx.drainCues(),[]);fx.seek(0.6);assert.deepEqual(fx.drainCues(),[]);
  assert.equal(occupied(render(at(0))),0);assert.equal(occupied(render(at(3.8))),0);assert.equal(at(3.8).done(),true);
  assert.notDeepEqual(render(at(0.9),{yaw:0.1}).color,render(at(0.9),{yaw:1.7}).color);
  for(const t of [0.3,0.75,1.1,1.8,2.5]) assert.ok(render(at(t)).light.every(c=>c===0));
});

test("default water remains framed throughout its motion across seeds and orbit angles",()=>{
  for(const seed of [0,42,24017,98765]) for(const yaw of [0.1,0.68,1.7]) for(let i=0;i<76;i++) {
    const f=render(at(i/20,{seed}),{yaw});for(let y=0;y<f.h;y++) for(let x=0;x<f.w;x++) if(Number.isFinite(f.depth[y*f.w+x])) assert.ok(x>1&&x<f.w-2&&y>1&&y<f.h-2,`seed=${seed}, yaw=${yaw}, t=${i/20}, pixel=${x},${y}`);
  }
});

test("effect supports short palettes and bounded controls without importing 2D machinery",()=>{
  for(const palette of [[],["#0cf"],["#036","#bff"]]) assert.ok(occupied(render(at(0.9,{palette})))>0);
  for(const size of [NaN,Infinity,-100,100]) assert.ok(occupied(render(at(0.9,{size,force:NaN})))>0);
  for(const filename of ["src/3d/liquid.ts","src/3d/effects/crown-splash.ts"]) {const source=readFileSync(new URL("../"+filename,import.meta.url),"utf8");assert.ok(!source.includes("/core/"));assert.ok(!source.includes("Math.random"));}
});

test("gallery dispatch accepts all catalog keys rather than a stale effect-name whitelist",()=>{
  const source=readFileSync(new URL("../gallery/3d.ts",import.meta.url),"utf8");
  assert.ok(source.includes("Object.prototype.hasOwnProperty.call(effects, value)"));
  const html=readFileSync(new URL("../gallery/3d.html",import.meta.url),"utf8");assert.ok(html.includes('value="water"'));assert.ok(html.includes('value="lightning"'));
});

test("reviewed crown, breakup, rebound and ripples retain exact color, depth and light buffers",()=>{
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/liquid-3d-render.json",import.meta.url),"utf8"));
  for(const s of fixture.samples) {const f=render(at(s.time,{seed:s.seed}),{yaw:s.yaw});for(const key of ["color","depth","light","hdrLight"]) assert.equal(hash(f[key]),s[key],`${key} at ${s.time}, yaw=${s.yaw}, seed=${s.seed}`);}
});
