import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFrame3D, Painter3D, createFx3D, enableHDRLight, color3D, createShieldSurface3D, shieldNormal3D, shieldPoint3D, shieldDistance3D, shieldResponse3D, shieldRipple3D, drawShieldSurface3D, energyShield3D, dot3, len3, sub3 } from "../build/3d/index.js";
const camera={yaw:0.68,elevation:28*Math.PI/180,zoom:1.45,target:[0,2.1,0]};
const cap=()=>createShieldSurface3D([0.6,3.2,0.65],[0.14,0,1],3.416,2.8);
const occupied=f=>f.depth.reduce((n,v)=>n+Number.isFinite(v),0);
function render(fx,yaw=camera.yaw,size=[240,180]){const f=enableHDRLight(createFrame3D(...size)),p=new Painter3D(f,{...camera,yaw});p.begin("#0a1525");fx.draw(p);return f;}
const at=(time,options={})=>{const fx=createFx3D(energyShield3D,options);fx.seek(time);return fx;};

test("spherical cap owns immutable coordinates and an orthonormal basis for arbitrary orientation",()=>{
 for(const normal of [[0,0,1],[0,1,0],[2,-3,4]]){
  const apex=[1,2,3],s=createShieldSurface3D(apex,normal,4,2.8);apex[0]=99;
  assert.deepEqual(s.apex,[1,2,3]);
  for(const v of [s.normal,s.u,s.v])assert.ok(Math.abs(len3(v)-1)<1e-12);
  for(const [a,b] of [[s.normal,s.u],[s.u,s.v],[s.normal,s.v]])assert.ok(Math.abs(dot3(a,b))<1e-12);
  for(const [u,v] of [[0,0],[2,1],[0,2.8]]){const n=shieldNormal3D(s,u,v),p=shieldPoint3D(s,n);assert.ok(Math.abs(len3(sub3(p,s.center))-4)<1e-12);assert.ok(dot3(n,s.normal)>=s.capCos-1e-12);}
  assert.equal(shieldNormal3D(s,3,0),null);assert.equal(shieldNormal3D(s,NaN,0),null);
 }
 for(const args of [[[0,0,0],[0,0,0],4,2],[[NaN,0,0],[0,0,1],4,2],[[0,0,0],[0,0,1],2,2],[[0,0,0],[0,0,1],4,-1],[[0,0,0],[0,0,1],Infinity,2]])assert.throws(()=>createShieldSurface3D(...args),RangeError);
});

test("traveling ripple maintains geodesic distance, bends in XYZ and clips at finite cap",()=>{
 const s=cap(),normal=shieldNormal3D(s,-0.5,0.5),ring=shieldRipple3D(s,normal,1.1);
 assert.equal(ring.length,97);for(const n of ring.filter(Boolean)){assert.ok(Math.abs(shieldDistance3D(s,n,normal)-1.1)<1e-11);assert.ok(dot3(n,s.normal)>=s.capCos-1e-8);}
 const points=ring.filter(Boolean).map(n=>shieldPoint3D(s,n));assert.ok(Math.max(...points.map(p=>p[2]))-Math.min(...points.map(p=>p[2]))>0.15);
 const clipped=shieldRipple3D(s,shieldNormal3D(s,2.6,0),1.2);assert.ok(clipped.some(n=>n===null));assert.ok(clipped.some(Boolean));
 assert.ok(shieldRipple3D(s,normal,100).every(n=>n===null));
 for(const args of [[s,[0,0,0],1],[s,[NaN,0,0],1],[s,normal,-1],[s,normal,1,2]])assert.throws(()=>shieldRipple3D(...args),RangeError);
});

test("impact response is causal, localized, travels at world-space speed and damps",()=>{
 const s=cap(),hit={at:1,normal:s.normal,strength:1};
 const before=shieldResponse3D(s,s.normal,hit,0.9);assert.equal(before.crest,0);assert.equal(before.contact,0);assert.equal(before.displacement,0);
 assert.ok(shieldResponse3D(s,s.normal,hit,1).displacement<-0.19);
 const normal=shieldRipple3D(s,s.normal,0.96)[0],q=shieldResponse3D(s,normal,hit,1.2);assert.ok(q.crest>0.6);assert.ok(q.contact<0.01);assert.ok(q.displacement>0);
 assert.equal(shieldResponse3D(s,normal,hit,1.03).crest,0);
 assert.ok(shieldResponse3D(s,normal,hit,2).crest<q.crest*0.01);
 assert.equal(shieldResponse3D(s,normal,{...hit,strength:0},1.2).displacement,0);
});

test("shield helper is finite for short palettes and honors external depth in both light buffers",()=>{
 const s=cap(),f=enableHDRLight(createFrame3D(180,140)),p=new Painter3D(f,camera);
 for(const palette of [[],["#0cf"],["#124","#fff"]]){p.begin();drawShieldSurface3D(p,s,{time:1.2,visibility:1,impacts:[{at:1,normal:s.normal}],palette});assert.ok(occupied(f)>150);assert.ok(f.hdrLight.every(Number.isFinite));}
 p.begin("#000");f.depth.fill(100);drawShieldSurface3D(p,s,{time:1.2,visibility:1,impacts:[{at:1,normal:s.normal}]});
 assert.ok(f.color.every(c=>c===color3D("#000")));assert.ok(f.light.every(c=>c===0));assert.ok(f.hdrLight.every(c=>c===0));
});

test("effect matches partitioned updates, seek, repeated draw and restart; seeds affect residue",()=>{
 const a=createFx3D(energyShield3D),b=createFx3D(energyShield3D);
 for(let i=0;i<35;i++)a.update(1/30);for(let i=0;i<140;i++)b.update(1/120);
 assert.deepEqual(render(a),render(b));assert.deepEqual(render(a),render(at(35/30)));assert.deepEqual(render(a),render(a));a.restart();a.seek(35/30);assert.deepEqual(render(a),render(b));
 assert.notDeepEqual(render(at(1.15,{seed:0})).color,render(at(1.15,{seed:1})).color);
});

test("deployment, curved body, three local hits and retraction remain distinct and end empty",()=>{
 const blank=render({draw(){}});assert.deepEqual(render(at(0)),blank);assert.deepEqual(render(at(energyShield3D.meta.duration)),blank);assert.ok(at(energyShield3D.meta.duration).done());
 const deploy=render(at(0.2)),guard=render(at(0.6));assert.ok(occupied(deploy)>0);assert.ok(occupied(guard)>occupied(deploy)*3);
 for(const t of [1.08,1.75,2.4])assert.notDeepEqual(render(at(t)).color,guard.color);
 assert.ok(occupied(render(at(3.7)))<occupied(guard)/3);assert.notDeepEqual(render(at(1.2),0.1).color,render(at(1.2),1.6).color);
 // Turning glow off does not hide the geometric membrane, unlike a glow-only sticker.
 const unlit=render(at(1.15,{intensity:0}));assert.ok(occupied(unlit)>1000);assert.ok(unlit.light.every(x=>x===0));assert.ok(unlit.hdrLight.every(x=>x===0));
});

test("three hit cues fire once at actual contact; seek does not replay cues",()=>{
 const fx=createFx3D(energyShield3D);fx.update(1);assert.deepEqual(fx.drainCues(),[]);fx.update(0.03);assert.deepEqual(fx.drainCues().map(c=>c.type),["hit","flash","shake"]);
 fx.update(2);assert.equal(fx.drainCues().filter(c=>c.type==="hit").length,2);fx.update(1);assert.deepEqual(fx.drainCues(),[]);fx.seek(2.5);assert.deepEqual(fx.drainCues(),[]);
});

test("full lifecycle fits the default export camera across seeds",()=>{
 for(const seed of [0,2761,9345])for(let i=0;i<119;i++){
  const f=render(at(i/30,{seed}),camera.yaw,[240,180]);for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(Number.isFinite(f.depth[y*f.w+x]))assert.ok(x>1&&x<f.w-2&&y>1&&y<f.h-2,`seed=${seed} time=${i/30} at ${x},${y}`);
 }
});

test("bounded options stay finite; geometry and choreography remain independent of the 2D core",()=>{
 for(const options of [{radius:NaN,intensity:NaN},{radius:1e7,intensity:1e7},{radius:-5,intensity:-1},{palette:[]},{palette:["#0cf"]}])assert.ok(render(at(1.15,options)).hdrLight.every(Number.isFinite));
 for(const path of ["src/3d/shield.ts","src/3d/effects/energy-shield.ts"]){const code=readFileSync(new URL("../"+path,import.meta.url),"utf8");assert.ok(!code.includes("/core/"));assert.ok(!code.includes("Math.random"));}
});

test("reviewed deployment, impacts, traveling waves, retraction and orbit retain exact buffers",async()=>{
 const {createHash}=await import("node:crypto"),fixture=JSON.parse(readFileSync(new URL("./fixtures/energy-shield-render.json",import.meta.url),"utf8"));
 const hash=a=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
 for(const sample of fixture.samples){const f=render(at(sample.time,{seed:sample.seed}),sample.yaw);for(const key of ["color","light","depth","hdrLight"])assert.equal(hash(f[key]),sample[key],`${key} time=${sample.time}`);}
});


test("neighboring hex cells emit each shared edge exactly once",()=>{
 const lines=[],p={project(v){return {depth:v[2]};},triangle(){},line(a,b){lines.push([a,b]);}};
 drawShieldSurface3D(p,cap(),{time:0.6,visibility:1});
 const keys=lines.map(edge=>edge.map(n=>n.map(v=>Math.round(v*1e6)).join(",")).sort().join("/"));
 assert.ok(lines.length>200);assert.equal(new Set(keys).size,keys.length);
});
