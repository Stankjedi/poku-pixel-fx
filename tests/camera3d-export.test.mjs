import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {exportCamera3D} from "../build-tools/tools/lib/camera3d.mjs";
const defaults={yaw:0.68,elevation:28*Math.PI/180,zoom:1.28,target:[0,1.05,0]};

test("shared camera flags retain effect defaults and convert degree overrides",()=>{
  const a=exportCamera3D({},defaults);assert.equal(a.yaw,defaults.yaw);assert.equal(a.elevation,defaults.elevation);assert.equal(a.zoom,defaults.zoom);assert.deepEqual(a.target,defaults.target);
  const b=exportCamera3D({yaw:"90",elevation:"45",zoom:"2","target-y":"3"},defaults);assert.deepEqual(b,{yaw:Math.PI/2,elevation:Math.PI/4,zoom:2,target:[0,3,0]});assert.deepEqual(defaults.target,[0,1.05,0]);
});
test("invalid orbit overrides fail explicitly",()=>{
  for(const flags of [{yaw:"NaN"},{zoom:"0"},{zoom:"-1"},{zoom:"99"},{elevation:"90"},{elevation:"-90"},{elevation:"Infinity"},{"target-y":"a"},{yaw:""}]) assert.throws(()=>exportCamera3D(flags,defaults),RangeError);
});
test("contact sheet export records the selected water camera in its metadata",()=>{
  const dir=mkdtempSync(join(tmpdir(),"poku-water-camera-"));try {
    const file=join(dir,"water.png");const result=spawnSync(process.execPath,["build-tools/tools/render-3d.mjs","water","--frames","3","--width","96","--height","72","--yaw","90","--elevation","45","--zoom","1.1","--target-y","1.3","--out",file],{encoding:"utf8"});assert.equal(result.status,0,result.stderr);
    const meta=JSON.parse(readFileSync(join(dir,"water.json"),"utf8"));assert.equal(meta.id,"water/crown-splash-3d");assert.deepEqual(meta.camera,{yaw:Math.PI/2,elevation:Math.PI/4,zoom:1.1,target:[0,1.3,0]});
    assert.ok(readFileSync(file).length>100);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

import {impactCamera3D} from "../build/3d/camera-motion.js";
import {createFx3D} from "../build/3d/fx.js";
import {Painter3D} from "../build/3d/painter.js";
import {createFrame3D} from "../build/3d/frame.js";

test("impact camera is deterministic, bounded, immutable and exactly settles",()=>{
  const base=Object.freeze({...defaults,target:Object.freeze([...defaults.target])});
  for(const age of [-1,-0.001,0.7,2,NaN,Infinity]) assert.equal(impactCamera3D(base,age),base);
  assert.equal(impactCamera3D(base,0.05,0),base);
  assert.equal(impactCamera3D(base,0.05,-1),base);
  assert.equal(impactCamera3D(base,0.05,NaN),base);
  const first=impactCamera3D(base,0.05,1,308);
  assert.notEqual(first.target,base.target);
  for(let i=0;i<10;i++) assert.deepEqual(impactCamera3D(base,0.05,1,308),first);
  assert.notDeepEqual(impactCamera3D(base,0.05,1,309),first);
  assert.deepEqual(base.target,defaults.target);
  for(let i=0;i<84;i++) {
    const camera=impactCamera3D(base,i/120,100,308);
    assert.ok(Math.abs(camera.yaw-base.yaw)<=0.01401);
    assert.ok(Math.abs(camera.elevation-base.elevation)<=0.01801);
    assert.ok(Math.hypot(...camera.target.map((x,j)=>x-base.target[j]))<=0.574);
    assert.ok(camera.zoom>0);
  }
  const edge=impactCamera3D({...base,elevation:Math.PI/2-0.0001,zoom:0},0);
  assert.ok(edge.elevation<Math.PI/2 && edge.zoom>0);
});

test("impact camera gives visible native-pixel jolt and damped settle in both projections",()=>{
  for(const projection of ["orthographic","perspective"]) {
    const base={...defaults,zoom:0.98,projection};
    const painter=new Painter3D(createFrame3D(260,180),base);
    const anchor=[0,0,0],rest=painter.project(anchor);
    const distance=(age)=>{painter.setCamera(impactCamera3D(base,age,1,308));const p=painter.project(anchor);return Math.hypot(p.x-rest.x,p.y-rest.y);};
    assert.ok(distance(0)>3.5 && distance(0)<5.5,`${projection} immediate jolt`);
    assert.ok(distance(0.5)<0.15,`${projection} settled by 0.5s`);
    assert.equal(distance(0.7),0);
  }
});

test("optional camera hook supports seek/restart and never accumulates",()=>{
  const module={meta:{id:"test/camera",name:"test",description:"",duration:1,loop:false,options:{seed:7}},create({seed}){let t=0;return {update(dt){t+=dt;},draw(){},camera(base){return impactCamera3D(base,t,1,seed);}};}};
  const fx=createFx3D(module),base={...defaults};
  fx.seek(0.2);const selected=fx.camera(base);
  assert.deepEqual(fx.camera(base),selected);
  fx.seek(0.1);fx.update(0.1);assert.deepEqual(fx.camera(base),selected);
  fx.restart();assert.deepEqual(fx.camera(base),impactCamera3D(base,0,1,7));
  const plain=createFx3D({...module,create(){return {update(){},draw(){}};}});
  assert.equal(plain.camera(base),base);
});

function pressureFixture(projection="orthographic") {
  const frame=createFrame3D(96,72);frame.hdrLight=new Float32Array(96*72*3);
  const painter=new Painter3D(frame,{yaw:0.68,elevation:0.49,zoom:1,target:[0,1,0],projection});
  for(let i=0;i<frame.color.length;i++) {
    frame.color[i]=i+1;frame.light[i]=(i+1)*2;frame.depth[i]=-10-(i+1)/10000;
    frame.hdrLight[i*3]=i+1;frame.hdrLight[i*3+1]=(i+1)*2;frame.hdrLight[i*3+2]=(i+1)*3;
  }
  return {frame,painter};
}
test("pressure warp samples immutable color, light, depth and HDR snapshots together",()=>{
  for(const projection of ["orthographic","perspective"]) {
    const {frame,painter}=pressureFixture(projection),source=frame.depth.slice();
    painter.pressureWarp([0,0.25,0],3,1,0.5);
    let changed=0;
    for(let i=0;i<frame.color.length;i++) {
      const id=frame.color[i];assert.ok(id>=1 && id<=source.length);
      if(id!==i+1) changed++;
      assert.equal(frame.light[i],id*2);assert.equal(frame.depth[i],source[id-1]);
      assert.equal(frame.hdrLight[i*3],id);assert.equal(frame.hdrLight[i*3+1],id*2);assert.equal(frame.hdrLight[i*3+2],id*3);
    }
    assert.ok(changed>10,`${projection} refracts visible pixels`);
    // Both source and destination checks must preserve an occluding foreground.
    const near=pressureFixture(projection);near.frame.depth.fill(100);
    const before=near.frame.color.slice();near.painter.pressureWarp([0,0.25,0],3,1,0.5);
    assert.deepEqual(near.frame.color,before);
  }
});
test("pressure warp rejects invalid/overflow inputs and never invents nonfinite depth or HDR",()=>{
  for(const args of [
    [[0,0,0],0,1,1],[[0,0,0],1,0,1],[[0,0,0],1,1,0],
    [[NaN,0,0],1,1,1],[[0,0,0],Infinity,1,1],
    [[0,0,0],Number.MAX_VALUE,Number.MAX_VALUE,1],
  ]) {
    const {frame,painter}=pressureFixture(),before=frame.color.slice();
    painter.pressureWarp(...args);
    assert.ok(frame.color.every((v,i)=>v===before[i]),"invalid inputs leave color unchanged");
    assert.ok(frame.depth.every(Number.isFinite));assert.ok(frame.hdrLight.every(Number.isFinite));
  }
});

test("optional pressure condensation does not make air opaque or emissive",()=>{
 const plain=pressureFixture(),air=pressureFixture();
 plain.painter.pressureWarp([0,.25,0],3,1,.5);
 air.painter.pressureWarp([0,.25,0],3,1,.5,{tint:"#a5b8c6",opacity:.17});
 assert.notDeepEqual(plain.frame.color,air.frame.color);
 for(const key of ["depth","light","hdrLight"])assert.deepEqual(plain.frame[key],air.frame[key]);
 const near=pressureFixture();near.frame.depth.fill(100);const before=near.frame.color.slice();
 near.painter.pressureWarp([0,.25,0],3,1,.5,{tint:"#a5b8c6",opacity:.17});assert.deepEqual(near.frame.color,before);
});
