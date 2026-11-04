import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFrame3D, Painter3D, createFx3D, color3D, enableHDRLight, createSweep3D, drawSweep3D, voidRift3D, dot3 } from '../build/3d/index.js';
const camera={yaw:0.68,elevation:28*Math.PI/180,zoom:1.3,target:[0,2.5,0]};
const at=(t,opts={})=>{const fx=createFx3D(voidRift3D,opts);fx.seek(t);return fx;};
function render(fx,settings={}) {const f=createFrame3D(200,160),p=new Painter3D(f,{...camera,...settings});enableHDRLight(f);p.begin('#0a1525');fx.draw(p);return f;}
const occupied=f=>f.depth.reduce((n,v)=>n+Number.isFinite(v),0);
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');

test('swept meshes produce capped, indexed solid topology with elliptical cross sections',()=>{
  const sections=[{position:[0,0,0],width:1,thickness:0.4},{position:[0,2,0],width:0.5,thickness:0.2},{position:[0,3,0],width:0}];
  const mesh=createSweep3D(sections,6),copy=structuredClone(sections);
  assert.equal(mesh.vertices.length,18);assert.equal(mesh.faces.length,32);assert.equal(mesh.frames.length,3);
  assert.ok(mesh.faces.flat().every(i=>Number.isSafeInteger(i)&&i>=0&&i<18));
  assert.ok(mesh.vertices.flat().every(Number.isFinite));assert.deepEqual(sections,copy);
  close(Math.max(...mesh.vertices.slice(0,6).map(v=>v[0])),1);
  assert.ok(Math.max(...mesh.vertices.slice(0,6).map(v=>Math.abs(v[2])))<0.41);
  assert.ok(mesh.vertices.slice(-6).every(v=>v[0]===0&&v[1]===3&&v[2]===0));
});

test('transported frames stay orthonormal and continuous as a path crosses world up',()=>{
  const sections=Array.from({length:41},(_,i)=>{const a=-Math.PI/3+i/40*Math.PI*2/3;return {position:[Math.cos(a),Math.sin(a)+2,Math.sin(a*0.6)*0.3],width:0.2,twist:i/40*Math.PI};});
  const mesh=createSweep3D(sections,5,[0,1,0]);
  for(const [i,f] of mesh.frames.entries()) {
    for(const v of [f.tangent,f.normal,f.binormal]) close(Math.hypot(...v),1);
    close(dot3(f.normal,f.tangent),0);close(dot3(f.binormal,f.tangent),0);close(dot3(f.normal,f.binormal),0);
    if(i) assert.ok(dot3(f.normal,mesh.frames[i-1].normal)>0.95,'the sweep must not flip at a world-up crossing');
  }
  const noTwist=createSweep3D(sections.map(s=>({...s,twist:0})),5,[0,1,0]);assert.notDeepEqual(mesh.vertices,noTwist.vertices);assert.deepEqual(mesh.frames,noTwist.frames);
});

test('sweeps reject malformed controls and handle empty paths and parallel initial normals',()=>{
  assert.deepEqual(createSweep3D([]),{vertices:[],faces:[],frames:[]});
  assert.equal(createSweep3D([{position:[0,0,0],width:1}]).vertices.length,0);
  const path=[{position:[0,0,0],width:1},{position:[0,1,0],width:0.5}];
  for(const sides of [2,33,NaN,4.5]) assert.throws(()=>createSweep3D(path,sides),RangeError);
  for(const last of [{position:[0,0,0],width:1},{position:[NaN,2,0],width:1},{position:[0,2,0],width:-1},{position:[0,2,0],width:1,twist:NaN},{position:[0,2,0],width:1,thickness:-1}]) assert.throws(()=>createSweep3D([path[0],last]),RangeError);
  assert.ok(createSweep3D(path,5,[0,1,0]).vertices.flat().every(Number.isFinite));
  assert.ok(createSweep3D(path,5,[0,0,0]).vertices.flat().every(Number.isFinite));
});

test('sweep rendering is palette-crisp, camera-independent and depth-tested',()=>{
  const palette=['#123','#456','#789','#abc'],mesh=createSweep3D([{position:[0,1,0],width:0.6},{position:[0.5,3,0.3],width:0.5},{position:[1,4,0],width:0}],5);
  const fx={draw:p=>drawSweep3D(p,mesh,palette)},f=render(fx),allowed=new Set([color3D('#0a1525'),...palette.map(color3D)]);
  assert.ok(occupied(f)>100);assert.ok(f.color.every(v=>allowed.has(v)));assert.ok(f.light.every(v=>v===0));
  assert.notDeepEqual(f.color,render(fx,{yaw:2}).color);
  const blocked=render({draw:p=>{p.frame.depth.fill(100);drawSweep3D(p,mesh,palette);}});assert.ok(blocked.color.every(v=>v===color3D('#0a1525')));
  assert.equal(occupied(render({draw:p=>drawSweep3D(p,mesh,[])})),0);
});

test('rift preserves its seed through seek, fixed-step partitions, repeated draw and restart',()=>{
  const a=createFx3D(voidRift3D),b=createFx3D(voidRift3D);
  for(let i=0;i<69;i++)a.update(1/30);for(let i=0;i<276;i++)b.update(1/120);
  assert.deepEqual(render(a),render(b));assert.deepEqual(render(a),render(at(2.3)));assert.deepEqual(render(a),render(a));
  a.restart();a.seek(2.3);assert.deepEqual(render(a),render(b));
  assert.notDeepEqual(render(at(2.3,{seed:0})).color,render(at(2.3,{seed:1})).color);
});

test('rift opens, holds a dark throat, sutures and ends empty with no orphan particles',()=>{
  const counts=[0,0.4,1.5,3,4.1,4.9,5.2].map(t=>occupied(render(at(t))));
  assert.equal(counts[0],0);assert.ok(counts[2]>counts[1]*5);assert.ok(counts[3]>300);assert.ok(counts[4]<counts[3]);assert.ok(counts[5]<counts[4]);assert.equal(counts[6],0);
  const f=render(at(2));const dark=f.color.reduce((n,c,i)=>n+(Number.isFinite(f.depth[i])&&c===color3D(voidRift3D.meta.options.palette[0])),0);
  assert.ok(dark>100,'negative space should stay dark, not become an emissive filled orb');
  assert.ok(f.hdrLight.reduce((sum,v)=>sum+v,0)<15,'narrow seams must not wash out the shape');
  for(const pull of [0.4,1,1.7]) assert.equal(occupied(render(at(5.2,{pull}))),0);
  assert.equal(at(5.2).done(),true);
});

test('cue boundaries fire once, stages match material events and scrubbing is silent',()=>{
  const fx=createFx3D(voidRift3D);fx.update(0.61);assert.deepEqual(fx.drainCues(),[]);fx.update(0.02);assert.deepEqual(fx.drainCues().map(c=>c.type),['sound','shake']);
  fx.update(3);assert.deepEqual(fx.drainCues().map(c=>c.type),['hit','shake']);fx.update(2);assert.deepEqual(fx.drainCues(),[]);fx.seek(3.7);assert.deepEqual(fx.drainCues(),[]);
  assert.equal(at(0.3).stage(),'INCISION');assert.equal(at(0.9).stage(),'UNFOLD');assert.equal(at(2).stage(),'DEVOUR');assert.equal(at(3.8).stage(),'SUTURE');assert.equal(at(4.7).stage(),'SCAR');
});

test('default silhouettes remain framed across seeds, time and front/rear orbit',()=>{
  for(const seed of [0,42,4967])for(const yaw of [0.1,0.68,2.27])for(let i=0;i<52;i++) {
    const f=render(at(i/10,{seed}),{yaw});
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(Number.isFinite(f.depth[y*f.w+x]))assert.ok(x>1&&x<f.w-2&&y>1&&y<f.h-2,`seed=${seed} yaw=${yaw} t=${i/10} pixel=${x},${y}`);
  }
  assert.notDeepEqual(render(at(2),{yaw:0.1}).color,render(at(2),{yaw:2.27}).color);
});

test('bounded controls, short palettes and independent 3D source are safe',()=>{
  for(const palette of [[],['#83b'],['#213','#b9e']])assert.ok(occupied(render(at(2,{palette})))>0);
  for(const size of [NaN,Infinity,-100,100])assert.ok(occupied(render(at(2,{size,pull:NaN})))>0);
  for(const name of ['src/3d/sweep.ts','src/3d/effects/void-rift.ts']){const s=readFileSync(new URL('../'+name,import.meta.url),'utf8');assert.ok(!s.includes('/core/'));assert.ok(!s.includes('Math.random'));}
});

test('reviewed rift buffers remain stable through incision, devour, suture and rear view',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/void-rift-3d-render.json',import.meta.url),'utf8'));
  for(const sample of fixture.samples){const f=render(at(sample.time,{seed:sample.seed}),{yaw:sample.yaw});for(const key of ['color','depth','light','hdrLight'])assert.equal(hash(f[key]),sample[key],`${key} at ${sample.time}, yaw=${sample.yaw}`);}
});
