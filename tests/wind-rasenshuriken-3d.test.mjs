import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrame3D, compositeFrame3D, Painter3D, createFx3D, Particles3D,
  windRasenshuriken3D, windRasenshurikenLegacy3D,
} from "../build/3d/index.js";
import { createFx, chain } from "../build/core/index.js";

function render(mod, time, seed=308, yaw=0.32) {
  const fx=createFx3D(mod,{seed});
  fx.seek(time);
  const frame=createFrame3D(180,120);
  const painter=new Painter3D(frame,{yaw,elevation:0.22,zoom:1.18,target:[0,2.35,0]});
  painter.begin("#061222");fx.draw(painter);
  return compositeFrame3D(frame,new Uint8ClampedArray(frame.w*frame.h*4));
}
test("wind effects deterministically render different blade silhouettes",()=>{
  const a=render(windRasenshuriken3D,1.5),b=render(windRasenshurikenLegacy3D,1.5);
  assert.deepEqual(a,render(windRasenshuriken3D,1.5));
  assert.notDeepEqual(a,b);
  assert.notDeepEqual(a,render(windRasenshuriken3D,1.5,309));
  assert.notDeepEqual(a,render(windRasenshuriken3D,1.5,308,1.2));
});
test("wind effect is frame-rate independent and ends visually empty",()=>{
  const a=createFx3D(windRasenshuriken3D),b=createFx3D(windRasenshuriken3D);
  for(let i=0;i<60;i++)a.update(1/30);
  for(let i=0;i<240;i++)b.update(1/120);
  const draw=fx=>{const f=createFrame3D(100,72),p=new Painter3D(f);p.begin("#061222");fx.draw(p);return f.color;};
  assert.deepEqual(draw(a),draw(b));
  a.seek(a.meta.duration);
  assert.ok(a.done());
  assert.ok(draw(a).every(c=>c===0xff221206));
  // Very large time deltas must not execute millions of useless one-shot steps.
  a.restart();a.update(1000000);assert.ok(a.done());
});
test("explicit looping effects continue; invalid dt is rejected",()=>{
  let creates=0;
  const loop={meta:{id:"test/loop",name:"Loop",description:"Loop",duration:0.1,loop:true,options:{}},
    create(){creates++;return{update(){},draw(){}}}};
  const fx=createFx3D(loop);
  fx.update(0.33);assert.ok(!fx.done());assert.ok(creates>=4);
  assert.throws(()=>fx.update(-1),RangeError);
  const legacy=createFx({meta:{duration:1},create:()=>({draw(){}})});
  assert.throws(()=>legacy.update(Infinity),RangeError);
});
test("cue crossing forwards only active-time dt into sub-effects",()=>{
  let progressed=0;
  const sub={meta:{duration:2,loop:false},create:()=>({update(dt){progressed+=dt},draw(){}})};
  const seq=chain([{fx:sub,t:0.25,until:0.75}])({seed:1});
  seq.update(0.5);
  assert.ok(Math.abs(progressed-0.25)<1e-9);
  seq.update(0.5);
  assert.ok(Math.abs(progressed-0.5)<1e-9);
});
test("particle compaction preserves survivor order",()=>{
  const ps=new Particles3D();
  for(const life of [2,0.02,3,0.01,4])ps.spawn({position:[0,1,0],velocity:[0,0,0],life,radius:0.1,color:"#fff"});
  ps.update(0.05);
  assert.deepEqual(ps.list.map(x=>x.max),[2,3,4]);
  const f=createFrame3D(48,48),p=new Painter3D(f);p.begin();ps.draw(p);
  assert.throws(()=>p.grid(8,0),RangeError);
});
