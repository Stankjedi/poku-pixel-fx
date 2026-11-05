import test from'node:test';import assert from'node:assert/strict';
import{samplePointLight2D,localPointLight2D,createPointLightSampler2D,createFrame,Painter,createFx}from'../build/core/index.js';
import * as effect from'../build/fx/arcane/point-lit-rupture.js';
const light={position:[0,0,-10],radius:20,intensity:2};
test('surface response uses normalized normals, finite range and intensity',()=>{
 const a=samplePointLight2D(light,[0,0,0],[0,0,-1]);assert.equal(a.distance,10);assert.equal(a.attenuation,.5625);assert.equal(a.diffuse,1.125);
 assert.deepEqual(a,samplePointLight2D(light,[0,0,0],[0,0,-8]));
 assert.equal(samplePointLight2D(light,[0,0,0],[0,0,1]).diffuse,0);
 assert.equal(samplePointLight2D(light,[0,0,10],[0,0,-1]).attenuation,0);
 assert.equal(samplePointLight2D({...light,intensity:0},[0,0,0],[0,0,-1]).diffuse,0);
 assert.equal(samplePointLight2D(light,[0,0,-10],[0,0,-1]).diffuse,0);
});
test('world-to-local light follows rigid painter placement and is pure',()=>{
 const f=createFrame(10,10,4,9),p=new Painter(f).place(20,30,true,Math.PI/2),source={position:[25,36,-7],radius:40,intensity:1};
 const before=structuredClone(source),local=localPointLight2D(p,source);
 assert.ok(Math.abs(p.toX(local.position[0],local.position[1])-25)<1e-9);assert.ok(Math.abs(p.toY(local.position[0],local.position[1])-36)<1e-9);assert.equal(local.position[2],-7);assert.deepEqual(source,before);
});
test('invalid light and surface inputs fail before drawing',()=>{
 for(const patch of[{radius:0},{radius:Infinity},{intensity:-1},{position:[0,NaN,0]}])assert.throws(()=>samplePointLight2D({...light,...patch},[0,0,0],[0,0,-1]),RangeError);
 assert.throws(()=>samplePointLight2D(light,[0,0,0],[0,0,0]),RangeError);
 assert.throws(()=>samplePointLight2D(light,[Infinity,0,0],[0,0,1]),RangeError);
});
function frame(t,receiveLight=true,extra={}){const f=createFrame(256,224),fx=createFx(effect,{x:128,y:154,receiveLight,...extra});fx.update(t);fx.draw(f);return f;}
test('practical scene receives point light without altering shape or glow',()=>{
 let changed=0;for(const t of[.2,.44,.8,1.10,1.24,1.4,1.8]){
  const a=frame(t,false),b=frame(t,true);for(let i=0;i<a.color.length;i++){assert.equal(a.color[i]>>>24,b.color[i]>>>24);changed+=Number(a.color[i]!==b.color[i]);}assert.deepEqual(a.light,b.light);
 }assert.ok(changed>1000);
});
test('scene is deterministic, directly seekable and ends empty',()=>{
 for(const t of[0,.44,1.24,1.42,2.6]){const a=frame(t),b=frame(t);assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);}
 for(const t of[0,2.6]){const f=frame(t);assert.ok(f.color.every(x=>x===0));assert.ok(f.light.every(x=>x===0));}
});

test('compiled fixed-normal sampler matches reference and snapshots inputs',()=>{
 const source={position:[3,-5,-9],radius:35,intensity:1.7},normal=[.2,-.4,-.8];
 const snapshot=structuredClone(source),N=[...normal],sample=createPointLightSampler2D(source,normal);
 source.position[0]=999;normal[0]=999;
 for(let i=0;i<30;i++){const pos=[i-15,i%7-3,2];assert.ok(Math.abs(sample(...pos)-samplePointLight2D(snapshot,pos,N).diffuse)<1e-12);}
 assert.throws(()=>sample(NaN,0,0),RangeError);
});
