import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFrame3D, Painter3D, createFx3D, color3D, createBeamFrame3D, beamPoint3D, beamEnvelope3D, drawCoherentBeam3D, DEFAULT_BEAM_TIMING_3D, coherentLaser3D, enableHDRLight, dot3, len3, sub3, laserContactState3D, createLaserMetalContact3D } from "../build/3d/index.js";
const camera = { yaw: 0.68, elevation: 28 * Math.PI / 180, zoom: 1.45, target: [0, 1.2, 0] };
const occupied = f => [...f.depth].filter(Number.isFinite).length;
function render(fx, yaw = camera.yaw, size = [240,160]) {
  const frame = createFrame3D(...size), p = new Painter3D(frame, {...camera, yaw});
  enableHDRLight(frame); p.begin("#0a1525"); fx.draw(p); return frame;
}
function at(time, options={}) { const fx=createFx3D(coherentLaser3D,options);fx.seek(time);return fx; }

test("beam coordinate frame is orthonormal for arbitrary axes and does not retain endpoint references",()=>{
  for(const [start,end] of [[[0,0,0],[9,0,0]],[[2,3,4],[2,8,4]],[[-3,2,1],[4,-1,8]]]) {
    const frame=createBeamFrame3D(start,end);
    for(const a of [frame.axis,frame.u,frame.v]) assert.ok(Math.abs(len3(a)-1)<1e-12);
    for(const [a,b] of [[frame.axis,frame.u],[frame.axis,frame.v],[frame.u,frame.v]]) assert.ok(Math.abs(dot3(a,b))<1e-12);
    assert.deepEqual(beamPoint3D(frame,0),start);assert.deepEqual(beamPoint3D(frame,1),end);
    assert.ok(Math.abs(len3(sub3(beamPoint3D(frame,0.5,3,4),beamPoint3D(frame,0.5)))-5)<1e-12);
    assert.notEqual(frame.start,start);assert.notEqual(frame.end,end);
  }
  assert.equal(createBeamFrame3D([1,2,3],[1,2,3]),null);
  assert.throws(()=>createBeamFrame3D([NaN,0,0],[1,0,0]),RangeError);
  assert.throws(()=>createBeamFrame3D([0,0,0],[Infinity,0,0]),RangeError);
});

test("envelope separates charge, propagation, coherent hold, traveling shutoff and cooling",()=>{
  const T=DEFAULT_BEAM_TIMING_3D;
  assert.equal(beamEnvelope3D(0.3).head,0);assert.ok(beamEnvelope3D(0.3).charge>0);
  assert.ok(Math.abs(beamEnvelope3D((T.fire+T.arrive)/2).head-0.5)<1e-10);
  for(const t of [0.7,0.9,1.2,1.6,1.89]) {
    const e=beamEnvelope3D(t);assert.equal(e.head,1);assert.equal(e.tail,0);assert.equal(e.power,1);assert.equal(e.impact,1);
  }
  const closing=beamEnvelope3D((T.release+T.clear)/2);assert.ok(Math.abs(closing.tail-0.5)<1e-10);assert.equal(closing.head,1);
  assert.equal(beamEnvelope3D(2.2).power,0);assert.ok(beamEnvelope3D(2.2).cooling>0);
  for(const t of [-1,0,NaN,Infinity,T.end,10]) assert.deepEqual(beamEnvelope3D(t),{charge:0,head:0,tail:0,power:0,impact:0,cooling:0});
  assert.throws(()=>beamEnvelope3D(1,{...T,arrive:T.fire}),RangeError);
  assert.throws(()=>beamEnvelope3D(1,{...T,end:NaN}),RangeError);
});

test("core remains straight, connected and narrower than its sheath through every hold frame",()=>{
  const frame=createBeamFrame3D([-4.5,1.8,0],[4.5,1.8,0]);
  const before=structuredClone(frame),calls=[];
  const p={line(...args){calls.push(args);}};
  for(const t of [0.7,1.1,1.6]) {
    drawCoherentBeam3D(p,frame,beamEnvelope3D(t));
    const set=calls.splice(0);
    assert.equal(set.length,3);
    assert.ok(set[0][2]>set[1][2]&&set[1][2]>set[2][2]);
    for(const [a,b] of set) {assert.deepEqual(a,frame.start);assert.deepEqual(b,frame.end);}
  }
  assert.deepEqual(frame,before);
});

test("opening and shutoff clip the same physical axis, without detached segments",()=>{
  const frame=createBeamFrame3D([1,2,3],[9,2,3]),calls=[];
  const p={line(...args){calls.push(args);}};
  drawCoherentBeam3D(p,frame,{head:0.8,tail:0.2});
  for(const [a,b] of calls) {assert.ok(len3(sub3(a,[2.6,2,3]))<1e-12);assert.ok(len3(sub3(b,[7.4,2,3]))<1e-12);}
  for(const options of [{head:0},{tail:1},{head:0.3,tail:0.5},{power:0},{radius:0}]) {
    calls.length=0;drawCoherentBeam3D(p,frame,options);assert.equal(calls.length,0);
  }
});

test("beam helper honors occlusion in both light buffers and supports empty/short palettes",()=>{
  const beam=createBeamFrame3D([-4,1.8,0],[4,1.8,0]);
  const f=createFrame3D(200,140),p=new Painter3D(f,camera);enableHDRLight(f);
  for(const palette of [[],["#0cf"],["#124","#fff"]]) {
    p.begin("#000");drawCoherentBeam3D(p,beam,{palette});assert.ok(occupied(f)>150);
  }
  p.begin("#000");f.depth.fill(100);
  drawCoherentBeam3D(p,beam);
  assert.ok([...f.color].every(c=>c===color3D("#000")));assert.ok(f.light.every(c=>c===0));assert.ok(f.hdrLight.every(c=>c===0));
  for(const options of [{head:NaN,tail:NaN,radius:Infinity,power:NaN,emission:NaN},{radius:1e9,power:1e9,emission:1e9}]) {
    p.begin();drawCoherentBeam3D(p,beam,options);assert.ok(occupied(f)>0);assert.ok([...f.hdrLight].every(Number.isFinite));
  }
});

test("effect matches partitioned updates, seek, repeated draw, restart and seed zero",()=>{
  const a=createFx3D(coherentLaser3D),b=createFx3D(coherentLaser3D);
  for(let i=0;i<43;i++)a.update(1/30);
  for(let i=0;i<172;i++)b.update(1/120);
  assert.deepEqual(render(a),render(b));assert.deepEqual(render(a),render(at(43/30)));assert.deepEqual(render(a),render(a));
  a.restart();a.seek(43/30);assert.deepEqual(render(a),render(b));
  assert.notDeepEqual(render(at(0.9,{seed:0})).color,render(at(0.9,{seed:1})).color);
});

test("coherent hold stays present, source and destination differ, and cooling ends empty",()=>{
  const blank=render({draw(){}});
  assert.deepEqual(render(at(0)),blank);assert.deepEqual(render(at(coherentLaser3D.meta.duration)),blank);
  const charge=render(at(0.4)),hold=render(at(1.0)),cool=render(at(2.3));
  assert.ok(occupied(charge)>0);assert.ok(occupied(hold)>occupied(charge)*1.5);assert.ok(occupied(cool)>0&&occupied(cool)<occupied(hold)*0.65);
  assert.ok(cool.hdrLight.reduce((a,b)=>a+b,0)<hold.hdrLight.reduce((a,b)=>a+b,0)*0.15,"cool metal must outlast the beam without remaining white-hot");
  for(let i=0;i<36;i++)assert.ok(occupied(render(at(0.7+i/30)))>300);
  assert.equal(at(coherentLaser3D.meta.duration).done(),true);
  assert.notDeepEqual(render(at(0.9),0.1).color,render(at(0.9),1.3).color);
});

test("cues fire only once at ignition and actual contact, and seeking is silent",()=>{
  const fx=createFx3D(coherentLaser3D);
  fx.update(0.55);assert.deepEqual(fx.drainCues(),[]);
  fx.update(0.025);assert.deepEqual(fx.drainCues().map(c=>c.type),["sound"]);
  fx.update(0.05);assert.deepEqual(fx.drainCues().map(c=>c.type),["hit","flash","shake"]);
  fx.update(3);assert.deepEqual(fx.drainCues(),[]);fx.seek(1);assert.deepEqual(fx.drainCues(),[]);
});

test("default silhouettes fit the exported camera across seeds and lifecycle",()=>{
  for(const seed of [0,42,2419,98765])for(let i=0;i<93;i++) {
    const f=render(at(i/30,{seed}));
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(Number.isFinite(f.depth[y*f.w+x]))assert.ok(x>1&&x<f.w-2&&y>1&&y<f.h-2,`seed ${seed}, time ${i/30}, pixel ${x},${y}`);
  }
});

test("custom palettes and bounded options remain safe; 3D does not import the 2D core",()=>{
  for(const palette of [[],["#0cf"],["#127","#fff"]])assert.ok(occupied(render(at(1,{palette})))>0);
  assert.equal(occupied(render(at(1,{intensity:0}))),0);
  for(const options of [{length:NaN,width:Infinity,intensity:NaN},{length:-1,width:-1,intensity:-1},{length:1e8,width:1e8,intensity:1e8}])assert.ok([...render(at(1,options)).hdrLight].every(Number.isFinite));
  for(const name of ["src/3d/beam.ts","src/3d/laser-impact.ts","src/3d/effects/coherent-laser.ts"]) {
    const s=readFileSync(new URL("../"+name,import.meta.url),"utf8");assert.ok(!s.includes("/core/"));assert.ok(!s.includes("Math.random"));
  }
});

test("reviewed charge, front, impact, hold, shutoff, cooling and orbit retain exact buffers",async()=>{
  const {createHash}=await import("node:crypto");
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/coherent-laser-render.json",import.meta.url),"utf8"));
  const hash=a=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
  for(const sample of fixture.samples) {
    const frame=render(at(sample.time,{seed:sample.seed}),sample.yaw);
    for(const key of ["color","light","depth","hdrLight"])assert.equal(hash(frame[key]),sample[key],`${key} time=${sample.time} seed=${sample.seed}`);
  }
});

test("contact energy begins only on arrival, pressure stays fed until the tail arrives, and metal cools separately",()=>{
  const T=DEFAULT_BEAM_TIMING_3D;
  const before=laserContactState3D(T.arrive-1e-6);assert.equal(before.flash,0);assert.equal(before.heat,0);assert.equal(before.pressure,0);
  assert.equal(laserContactState3D(T.arrive).flash,1);
  assert.ok(laserContactState3D(.67).flash>.2);assert.equal(laserContactState3D(.82).flash,0);
  for(const time of [.8,1.2,1.8,1.95,2.02]) {const state=laserContactState3D(time);assert.equal(state.heat,1);assert.ok(state.pressure>=.26-1e-12);}
  assert.equal(laserContactState3D(2.2).pressure,0);assert.ok(laserContactState3D(2.2).heat>.6);
  assert.ok(laserContactState3D(2.7).heat<laserContactState3D(2.3).heat);
  const bores=[.63,.7,.9,1.2,1.6,2.4].map(t=>laserContactState3D(t).bore);assert.ok(bores.every((v,i)=>!i||v>=bores[i-1]));
  for(const t of [-1,NaN,Infinity,T.end])assert.equal(laserContactState3D(t).visible,0);
  assert.throws(()=>laserContactState3D(1,{...T,clear:T.release}),RangeError);
});

test("metal contact occupies a fixed oblique plane with upward local Y and target geometry can be omitted",()=>{
  const beam=createBeamFrame3D([-4.5,1.8,0],[4.5,1.8,0]);
  const metal=createLaserMetalContact3D(beam,{seed:0});
  assert.ok(metal.normal[0]<0,"pressure must point against the incoming ray");
  assert.ok(metal.point(0,1)[1]>beam.end[1],"molten runs use negative surface Y to flow down");
  assert.ok(Math.abs(dot3(sub3(metal.point(.5,.3),beam.end),metal.normal))<1e-12);
  const renderContact=(show,t)=>{
    const helper=createLaserMetalContact3D(beam,{seed:0,targetVisible:show}),f=createFrame3D(240,160),p=new Painter3D(f,camera);enableHDRLight(f);p.begin();helper.surface(p,t);helper.contact(p,t);return f;
  };
  assert.ok(occupied(renderContact(true,.4))>300);assert.equal(occupied(renderContact(false,.4)),0);
  assert.ok(occupied(renderContact(false,1.2))>0,"host target suppression must retain hit response");
  assert.deepEqual(renderContact(true,1.2),renderContact(true,1.2));
});

test("contact response is localized, leaves a true dark bore, and no particles cross the floor",()=>{
  const beam=createBeamFrame3D([-4.5,1.8,0],[4.5,1.8,0]),helper=createLaserMetalContact3D(beam,{seed:0});
  const points=[],calls=[];
  const p={triangle(a,b,c,color,alpha,emission){points.push(a,b,c);calls.push({type:"triangle",color,alpha,emission});},line(a,b,r,color,alpha,emission){points.push(a,b);},point(a,r,color,alpha,emission){points.push(a);},glow(){}};
  for(let i=0;i<93;i++) {points.length=0;helper.surface(p,i/30);helper.contact(p,i/30);for(const q of points){assert.ok(q.every(Number.isFinite));assert.ok(q[1]>=0);assert.ok(len3(sub3(q,beam.end))<3.6,"impact must not become a large explosion");}}
  const hole=helper.state(1.5).bore;assert.equal(hole,1);
  const f=createFrame3D(240,160),painter=new Painter3D(f,camera);painter.begin("#000");helper.surface(painter,2.85);
  const center=painter.project(helper.point(0,0,-.19)),cx=Math.floor(center.x),cy=Math.floor(center.y),pixel=f.color[cy*f.w+cx];
  assert.ok((pixel&255)<90&&((pixel>>>8)&255)<90&&((pixel>>>16)&255)<90,"cooled center must be a dark recessed bore, not a filled hot disc");
});

test("impact options are independently recolorable, bounded, and HDR-safe",()=>{
  for(const options of [{impactPalette:[]},{impactPalette:["#0cf"]},{impactPalette:["#225","#fff"],targetVisible:false},{impactScale:NaN},{impactScale:Infinity},{impactScale:-100}]) {
    const f=render(at(1.1,options));assert.ok(occupied(f)>0);assert.ok([...f.hdrLight].every(Number.isFinite));
  }
  assert.notDeepEqual(render(at(1.1)).color,render(at(1.1,{impactPalette:["#004","#00f"]})).color);
});
