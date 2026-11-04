import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createFrame3D,createFx3D,Painter3D,meteorImpact3D,createRockMesh3D,fractureRockMesh3D,createImpactGround3D,createImpactTerrain3D,impactGroundHeight3D,drawImpactTerrain3D,enableHDRLight,groundShockwaveRadius3D,drawGroundShockwave3D,dot3,cross3,sub3} from "../build/3d/index.js";
import {METEOR_IMPACT,meteorEntryPosition3D} from "../build/3d/effects/meteor-impact.js";
const camera={yaw:0.68,elevation:28*Math.PI/180,zoom:0.98,target:[0,2.3,0]};
function at(time,opts={}) {const fx=createFx3D(meteorImpact3D,opts);fx.seek(time);return fx;}
function render(fx,yaw=camera.yaw,size=[260,180]) {const f=createFrame3D(...size),p=new Painter3D(f,fx.camera?fx.camera({...camera,yaw}):{...camera,yaw});enableHDRLight(f);p.begin("#0a1525");fx.draw(p);return f;}
const occupied=f=>[...f.depth].filter(Number.isFinite).length;

test("seeded rock meshes are closed, bounded solids with shared edges",()=>{
 for(const detail of [0,1]) {
  const mesh=createRockMesh3D({seed:17,detail,radius:2});assert.deepEqual(mesh,createRockMesh3D({seed:17,detail,radius:2}));assert.notDeepEqual(mesh,createRockMesh3D({seed:18,detail,radius:2}));
  assert.equal(mesh.faces.length,detail?80:20);const edges=new Map();
  for(const [a,b,c] of mesh.faces) {
   for(const [i,j] of [[a,b],[b,c],[c,a]]) {const key=[Math.min(i,j),Math.max(i,j)].join(":");edges.set(key,(edges.get(key)??0)+1);}
   assert.ok(dot3(cross3(sub3(mesh.vertices[b],mesh.vertices[a]),sub3(mesh.vertices[c],mesh.vertices[a])),mesh.vertices[a])>0,"outward winding");
  }
  assert.ok([...edges.values()].every(n=>n===2));assert.equal(mesh.vertices.length-edges.size+mesh.faces.length,2);
  assert.ok(mesh.vertices.flat().every(Number.isFinite));assert.ok(mesh.vertices.every(v=>Math.hypot(...v)>1.2&&Math.hypot(...v)<2.7));
 }
 for(const radius of [0,-1,Infinity,NaN]) assert.throws(()=>createRockMesh3D({radius}),RangeError);
 assert.ok(createRockMesh3D({roughness:NaN}).vertices.flat().every(Number.isFinite));
});

test("entry is an oblique accelerating fall with a bounded terminal reference point",()=>{
 const points=Array.from({length:34},(_,i)=>meteorEntryPosition3D(i*0.05));
 assert.equal(points.at(-1)[1],0.78);assert.equal(points.at(-1)[0],0);
 for(let i=1;i<points.length;i++) {assert.ok(points[i][0]>points[i-1][0]);assert.ok(points[i][1]<points[i-1][1]);if(i>1) assert.ok(points[i][1]-points[i-1][1]<points[i-1][1]-points[i-2][1]);}
 for(const time of [NaN,Infinity,-Infinity]) assert.throws(()=>meteorEntryPosition3D(time),RangeError);
 assert.deepEqual(meteorEntryPosition3D(100),meteorEntryPosition3D(METEOR_IMPACT));assert.deepEqual(meteorEntryPosition3D(-1),meteorEntryPosition3D(0));
});

test("entry, ablation and debris remain identical across updates, seek, draw and restart",()=>{
 for(const time of [0.8,1.5,1.8,2.8,4.6]) {
  const a=createFx3D(meteorImpact3D),b=createFx3D(meteorImpact3D);
  for(let i=0;i<time*30;i++) a.update(1/30);for(let i=0;i<time*120;i++) b.update(1/120);
  assert.deepEqual(render(a),render(b));assert.deepEqual(render(a),render(at(time)));assert.deepEqual(render(a),render(a));a.restart();a.seek(time);assert.deepEqual(render(a),render(b));
 }
 assert.notDeepEqual(render(at(1.2,{seed:0})).color,render(at(1.2,{seed:1})).color);
});

test("meteor retains solid mass and visible impact after orbiting, and ends empty",()=>{
 for(const yaw of [-0.7,0.68,1.8]) for(const time of [0.5,1.1,1.6,1.7,2.1,3.2]) assert.ok(occupied(render(at(time),yaw))>140,`empty at ${time} yaw ${yaw}`);
 assert.notDeepEqual(render(at(1.1),0.1).color,render(at(1.1),1.3).color);
 const empty=render({draw(){}});assert.deepEqual(render(at(0)),empty);assert.deepEqual(render(at(meteorImpact3D.meta.duration)),empty);assert.ok(at(meteorImpact3D.meta.duration).done());
 assert.ok(occupied(render(at(4.6)))>occupied(render(at(5.4))),"cooling residue shrinks away");
});

test("impact cues fire once at the actual contact, and seek stays silent",()=>{
 const fx=createFx3D(meteorImpact3D);fx.update(METEOR_IMPACT-1/120);assert.equal(fx.drainCues().filter(c=>c.type==="hit").length,0);fx.update(1/120);assert.deepEqual(fx.drainCues().map(c=>c.type),["hit","flash","shake","sound"]);fx.update(10);assert.deepEqual(fx.drainCues(),[]);fx.seek(1.8);assert.deepEqual(fx.drainCues(),[]);
});

test("default meteor and ejecta stay within the export frame over seeds and timeline",()=>{
 for(const seed of [0,42,60217]) for(let i=0;i<112;i++) {
  const f=render(at(i/20,{seed}));
  for(let y=0;y<f.h;y++) for(let x=0;x<f.w;x++) if(Number.isFinite(f.depth[y*f.w+x])) assert.ok(x>1&&x<f.w-2&&y>1&&y<f.h-2,`seed=${seed} time=${i/20} at ${x},${y}`);
 }
});

test("short palettes, bounded options and independent 3D source remain supported",()=>{
 for(const palette of [[],["#f83"],["#422","#ffc"]]) for(const time of [0.8,1.8,2.4]) assert.ok(occupied(render(at(time,{palette})))>0);
 for(const opts of [{size:NaN,force:Infinity},{size:-10,force:-10},{size:100,force:100}]) assert.ok(occupied(render(at(1.8,opts)))>0);
 for(const file of ["src/3d/rock.ts","src/3d/effects/meteor-impact.ts"]) {const code=readFileSync(new URL("../"+file,import.meta.url),"utf8");assert.ok(!code.includes("/core/"));assert.ok(!code.includes("Math.random"));}
});

test("impact-time rotation lands the actual seeded rock's lowest vertex on the floor",()=>{
 for(const seed of [0,42,60217]) for(const size of [0.45,1,1.4]) {
  const impl=meteorImpact3D.create({...meteorImpact3D.meta.options,seed,size});impl.update(METEOR_IMPACT-1e-7);
  const vertices=[];
  const p={line(){},point(){},triangle(){},glow(){},facet(a,b,c){vertices.push(a,b,c);},project(){return {depth:0};}};
  impl.draw(p);
  const bottom=Math.min(...vertices.map(v=>v[1]));
  assert.ok(bottom>=0.025&&bottom<0.02501,`seed ${seed}, size ${size}, bottom ${bottom}`);
 }
});

test("reviewed entry, impact, cooling and orbit captures retain exact buffers",async()=>{
 const {createHash}=await import("node:crypto");const fixture=JSON.parse(readFileSync(new URL("./fixtures/meteor-3d-render.json",import.meta.url),"utf8"));
 for(const q of fixture.samples) {const f=render(at(q.time,{seed:q.seed}),q.yaw);for(const k of ["color","light","depth","hdrLight"])assert.equal(createHash("sha256").update(new Uint8Array(f[k].buffer,f[k].byteOffset,f[k].byteLength)).digest("hex"),q[k],`${k} at ${q.time} seed ${q.seed} yaw ${q.yaw}`);}
});


test("ground shockwave expands rapidly then decelerates without reversing",()=>{
 const radii=Array.from({length:31},(_,i)=>groundShockwaveRadius3D(i/30));
 assert.equal(radii[0],0);assert.ok(radii[3]>1.3);assert.ok(radii[30]<4.6&&radii[30]>4.3);
 for(let i=2;i<radii.length;i++) {assert.ok(radii[i]>radii[i-1]);assert.ok(radii[i]-radii[i-1]<radii[i-1]-radii[i-2]);}
 for(const args of [[NaN],[Infinity],[1,0],[1,4,NaN],[1,-1],[1,4,-1]]) assert.equal(groundShockwaveRadius3D(...args),0);
});

test("shockwave is a seeded 3D floor ridge with explicit start and expiry",()=>{
 const geometry=(age,seed=17)=>{const triangles=[],p={project(v){return {depth:v[2]};},triangle(a,b,c){triangles.push(a,b,c);},line(){},point(){}};drawGroundShockwave3D(p,{age,seed,center:[1,0.04,2],height:0.35,life:0.78});return triangles;};
 for(const age of [-1,0,0.78,10,NaN])assert.deepEqual(geometry(age),[]);
 const a=geometry(0.2);assert.ok(a.length>100);assert.deepEqual(a,geometry(0.2));assert.notDeepEqual(a,geometry(0.2,18));
 assert.ok(a.every(v=>v.every(Number.isFinite)&&v[1]>=0.04&&v[1]<=0.39));assert.ok(a.some(v=>v[1]>0.2));
 assert.ok(Math.max(...geometry(0.4).map(v=>Math.hypot(v[0]-1,v[2]-2)))>Math.max(...a.map(v=>Math.hypot(v[0]-1,v[2]-2))));
 const f=createFrame3D(160,100),p=new Painter3D(f,{...camera,target:[0,0,0]});
 p.begin();drawGroundShockwave3D(p,{age:0.2,palette:["#aaa"]});assert.ok(occupied(f)>100);
 p.begin();drawGroundShockwave3D(p,{age:0.2,center:[NaN,0,0]});assert.equal(occupied(f),0);
});

test("heavy airborne debris spreads beyond the body while the floor stays present",()=>{
 const airborne=(time)=>{const fx=at(time),f=render(fx),cam=fx.camera(camera),scale=Math.min(f.w/17,f.h/11)*cam.zoom;let min=Infinity,max=-Infinity,count=0;
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const depth=f.depth[y*f.w+x],up=(f.h*0.61-y-0.5)/scale,worldY=cam.target[1]+up*Math.cos(cam.elevation)+depth*Math.sin(cam.elevation);if(Number.isFinite(depth)&&worldY>0.55){min=Math.min(min,x);max=Math.max(max,x);count++;}}
  return {width:max-min,count};};
 const entry=airborne(1.6),impact=airborne(2.05);
 assert.ok(impact.width>entry.width*2);assert.ok(impact.count>entry.count*1.5);
 assert.ok(occupied(render(at(4.2)))>200);
});


test("meteor fracture preserves every source face and the original solid volume",()=>{
 const volume=m=>m.faces.reduce((s,[a,b,c])=>s+dot3(m.vertices[a],cross3(m.vertices[b],m.vertices[c]))/6,0);
 for(const seed of [0,42,60217]) {
  const source=createRockMesh3D({seed}),copy=structuredClone(source),pieces=fractureRockMesh3D(source);
  assert.equal(pieces.length,20);assert.deepEqual(source,copy);assert.deepEqual(pieces,fractureRockMesh3D(source));
  assert.deepEqual(pieces.flatMap(p=>p.sourceFaces).sort((a,b)=>a-b),Array.from({length:80},(_,i)=>i));
  assert.ok(Math.abs(pieces.reduce((v,p)=>v+volume(p.mesh),0)-volume(source))<1e-10);
  for(const p of pieces) {
   const edges=new Map();for(const [a,b,c] of p.mesh.faces)for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=[Math.min(u,v),Math.max(u,v)].join(":");edges.set(k,(edges.get(k)??0)+1);}
   assert.ok([...edges.values()].every(n=>n===2));assert.ok(volume(p.mesh)>0);
   for(let face=0;face<4;face++)for(let vertex=0;vertex<3;vertex++) {
    const a=p.mesh.vertices[p.mesh.faces[face][vertex]],b=source.vertices[source.faces[p.sourceFaces[face]][vertex]];
    for(let axis=0;axis<3;axis++)assert.ok(Math.abs(a[axis]+p.center[axis]-b[axis])<1e-12);
   }
  }
 }
 assert.throws(()=>fractureRockMesh3D(createRockMesh3D({detail:0})),RangeError);
 const bad=createRockMesh3D();bad.faces[0]=[0,0,0];assert.throws(()=>fractureRockMesh3D(bad),RangeError);
});

test("impact ground slabs are closed and share their actual pre-breakup rim boundaries",()=>{
 const a=createImpactGround3D(42),b=createImpactGround3D(42);assert.deepEqual(a,b);assert.notDeepEqual(a,createImpactGround3D(43));assert.equal(a.pieces.length,12);
 const world=(p,i)=>p.mesh.vertices[i].map((v,axis)=>v+p.center[axis]);
 for(let i=0;i<a.pieces.length;i++) {
  const p=a.pieces[i],next=a.pieces[(i+1)%a.pieces.length],edges=new Map();
  for(const [a,b,c] of p.mesh.faces)for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=[Math.min(u,v),Math.max(u,v)].join(":");edges.set(k,(edges.get(k)??0)+1);}
  assert.ok([...edges.values()].every(n=>n===2));assert.ok(p.release>=0.055&&p.release<=0.135);
  for(const [left,right] of [[world(p,1),world(next,0)],[world(p,2),world(next,3)]])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(left[axis]-right[axis])<1e-12);
 }
 for(const size of [0,-1,Infinity,NaN])assert.throws(()=>createImpactGround3D(1,size),RangeError);
});


test("terrain is a deterministic shared mesh with a small outward-traveling crest and rebound",()=>{
 const a=createImpactTerrain3D(42),b=createImpactTerrain3D(42);assert.deepEqual(a,b);assert.notDeepEqual(a,createImpactTerrain3D(43));
 assert.ok(a.vertices.flat().every(Number.isFinite));assert.ok(a.faces.every(f=>f.every(i=>i>=0&&i<a.vertices.length)));
 const peak=age=>{let best=-Infinity,radius=0;for(let r=0;r<5.6;r+=0.01){const h=impactGroundHeight3D(r,age);if(h>best){best=h;radius=r;}}return {radius,height:best};};
 const early=peak(.2),late=peak(.4);assert.ok(late.radius>early.radius+1.3);assert.ok(early.height>.28&&early.height<.39);assert.ok(late.height<.39);
 assert.ok(impactGroundHeight3D(early.radius-.9,.2)<0,"smaller trough follows crest");
 for(const age of [-1,0,1.25,8,NaN,Infinity])assert.equal(impactGroundHeight3D(3,age),0);
 for(const r of [NaN,Infinity,-1])assert.equal(impactGroundHeight3D(r,.2),0);
 for(const size of [0,-1,NaN,Infinity])assert.throws(()=>createImpactTerrain3D(42,size),RangeError);
 const triangles=[],p={triangle(a,b,c){triangles.push(a,b,c);},line(){}};drawImpactTerrain3D(p,a,.3,["#111","#333","#555"]);
 assert.ok(triangles.length>1000);assert.ok(triangles.every(v=>Math.hypot(v[0],v[2])<=5+1e-9));assert.ok(Math.max(...triangles.map(v=>v[1]))<.42);
});

test("meteor camera moves the whole scene only at contact and resets without a loop seam",()=>{
 const fx=createFx3D(meteorImpact3D),base=structuredClone(camera);assert.equal(fx.camera(base),base);
 fx.seek(METEOR_IMPACT-.01);assert.equal(fx.camera(base),base);fx.seek(METEOR_IMPACT+.02);assert.notDeepEqual(fx.camera(base),base);
 assert.deepEqual(base,camera);const frame=render(fx);assert.deepEqual(frame,render(fx));fx.restart();assert.equal(fx.camera(base),base);fx.seek(METEOR_IMPACT+.02);assert.deepEqual(frame,render(fx));
 fx.seek(METEOR_IMPACT+.7);assert.equal(fx.camera(base),base);fx.seek(meteorImpact3D.meta.duration);assert.equal(fx.camera(base),base);assert.deepEqual(render(fx),render({draw(){}}));
});
