import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFrame, createFx, clearFrame, painterFor, resolveOptions } from '../build/core/fx.js';
import { helicalAirflow, airflowTrail, drawAirflow } from '../build/core/air.js';
import * as tornado from '../build/fx/nature/tornado.js';
import * as leaves from '../build/fx/nature/leaf-storm.js';
import * as gust from '../build/fx/weather/crosswind-gust.js';
function shot(mod,t,opts={},padding=0){const [w,h]=mod.meta.size,f=createFrame(w+padding*2,h+padding*2,-padding,-padding),p=painterFor(f);
  p.place(...mod.meta.origin,opts.flip??false,opts.angle??0);const o=resolveOptions(mod.meta,opts);mod.drawBack?.(p,t,o);mod.draw(p,t,o);return f;}
function digest(mod,opts={}){const f=createFrame(...mod.meta.size),fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],...opts}),h=createHash('sha256');
  for(let i=0;i<=mod.meta.duration*30;i++){if(i)fx.update(1/30);clearFrame(f);fx.draw(f);h.update(new Uint8Array(f.color.buffer));h.update(new Uint8Array(f.light.buffer));}return h.digest('hex');}

test('helical airflow rises and expands, keeping physical depth separate from its projection',()=>{
  const spec={height:100,radius:u=>5+25*u,axis:u=>u*4,turns:2,phase:.3,shear:.4,perspective:0};
  const pts=Array.from({length:101},(_,i)=>helicalAirflow(i/100,spec));
  for(let i=0;i<pts.length;i++){
    assert.ok(Math.abs(pts[i].y+i)<1e-12);
    assert.ok(Math.abs(Math.hypot(pts[i].x-i*.04,pts[i].depth)-(5+i*.25))<1e-10);
    const q=helicalAirflow(i/100,{...spec,perspective:.3});assert.equal(q.depth,pts[i].depth);assert.ok(Math.abs(q.y-pts[i].y-.3*q.depth)<1e-12);
  }
  assert.deepEqual(helicalAirflow(-1,spec),pts[0]);assert.deepEqual(helicalAirflow(2,spec),pts[100]);
});

test('air trail clips at birth and splits at the depth plane without false foreground chords',()=>{
  const sampled=[],path=t=>{sampled.push(t);return{x:t*10,y:t*4,depth:t-.5};};
  const runs=airflowTrail(path,1,1,3);
  assert.equal(runs.length,2);assert.equal(runs[0].back,true);assert.equal(runs[1].back,false);
  assert.deepEqual(runs[0].points.at(-1),[5,2]);assert.deepEqual(runs[1].points[0],[5,2]);
  assert.equal(runs[0].to,runs[1].from);assert.equal(runs[0].from,0);assert.equal(runs[1].to,1);
  sampled.length=0;airflowTrail(path,.2,1,8,.1);assert.ok(sampled.every(t=>t>=.1&&t<=.2));
  assert.deepEqual(airflowTrail(path,.1,.2,8,.1),[]);assert.deepEqual(airflowTrail(()=>({x:2,y:3,depth:1}),1),[]);
});

test('air trail retains its complete-path taper across multiple depth crossings and emits no light',()=>{
  const position=t=>({x:10+t*50,y:25+Math.sin(t*4)*10,depth:Math.sin(t*10)}),runs=airflowTrail(position,1,1,64);
  let last=0;for(const run of runs){assert.ok(run.to>run.from);assert.equal(run.from,last);last=run.to;}assert.equal(last,1);
  const f=createFrame(80,60),p=painterFor(f);drawAirflow(p,runs,{color:0xff779999,head:0xffccdddd,width:1.4});
  assert.ok(f.color.some(c=>c>>>24));assert.ok(f.light.every(c=>c===0));
  const seen=[];drawAirflow({path:(points,color,alpha)=>seen.push(alpha(0))},runs,{color:1,alpha:.8});
  assert.equal(seen[0],0);assert.ok(seen.slice(1).some(a=>a>.4),'depth crossings must not restart the tail fade');
});

test('air authoring rejects non-finite values and bounds sampling work',()=>{
  for(const spec of [{height:0,radius:1},{height:4,radius:-1},{height:4,radius:()=>NaN},{height:4,radius:1,shear:1},{height:4,radius:1,axis:()=>Infinity}])
    assert.throws(()=>helicalAirflow(.5,spec),RangeError);
  for(const n of [1,257,2.5,Infinity])assert.throws(()=>airflowTrail(()=>({x:1,y:1,depth:1}),1,.2,n),RangeError);
  assert.throws(()=>airflowTrail(()=>({x:NaN,y:0,depth:1}),1),RangeError);
  assert.throws(()=>drawAirflow({path(){}},[],{color:1,width:-1}),RangeError);
});

test('classic air style preserves every original color and light frame',()=>{
  assert.equal(digest(tornado,{airStyle:'classic'}),'a3b8e940e7a80162dfd9628b3c9e485fcd488a341d49e0e080a3909d8d42b21c');
  assert.equal(digest(leaves,{airStyle:'classic'}),'3e3ec37f701c0f06f6a0417fb385eeae6c975895d514f42049792aa5fd686340');
  assert.notEqual(digest(tornado),digest(tornado,{airStyle:'classic'}));assert.notEqual(digest(leaves),digest(leaves,{airStyle:'classic'}));
});

test('updraft loops are seekable with exact seams, seeds, recolors and transforms',()=>{
  for(const mod of [tornado,leaves])for(const opts of [{},{seed:2},{seed:7,flip:true},{palette:['#234','#789','#ded'],angle:.2}]){
    const first=shot(mod,0,opts),last=shot(mod,mod.meta.duration,opts);assert.deepEqual(first.color,last.color);assert.deepEqual(first.light,last.light);
    const at=shot(mod,.83,opts);shot(mod,.2,opts);assert.deepEqual(at.color,shot(mod,.83,opts).color);
  }
});

test('wind effects retain their silhouettes inside native bounds across every frame and seed',()=>{
  for(const mod of [tornado,leaves,gust])for(const opts of [{},{seed:2},{seed:7},{seed:11,flip:true},...(mod===gust?[{curl:0},{curl:1.4,density:1.6}]:[])]){
    const [w,h]=mod.meta.size;
    for(let i=0;i<=Math.round(mod.meta.duration*30);i++){
      const f=shot(mod,i/30,opts,24);
      f.color.forEach((c,j)=>{if(!(c>>>24))return;const x=j%f.w-24,y=Math.floor(j/f.w)-24;
        assert.ok(x>=0&&y>=0&&x<w&&y<h,`${mod.meta.name} ${JSON.stringify(opts)} frame ${i}: ${x},${y}`);});
    }
  }
});

test('crosswind is non-emissive, deterministic, recolorable and finishes without a pop',()=>{
  for(const opts of [{},{seed:7},{curl:0},{curl:1.4,density:1.6},{palette:['#522','#a74','#fed'],flip:true}]){
    const f=shot(gust,1.1,opts);assert.ok(f.color.some(c=>c>>>24));assert.ok(f.light.every(c=>c===0));
    assert.deepEqual(f.color,shot(gust,1.1,opts).color);
    for(const t of [0,gust.meta.duration]){const end=shot(gust,t,opts);assert.ok(end.color.every(c=>c===0));assert.ok(end.light.every(c=>c===0));}
  }
  assert.ok(shot(gust,1,{density:0}).color.every(c=>c===0));assert.notDeepEqual(shot(gust,1).color,shot(gust,1,{seed:7}).color);
  assert.notDeepEqual(shot(gust,1).color,shot(gust,1,{palette:['#224','#a67','#fce']}).color);
});

test('gust roll-up joins share position and tangent direction with the translating air tongue',()=>{
  for(const lane of [-62,-20])for(const phase of [-1.4,0,1.4])for(const curl of [0,1,1.4]){
    const eps=1e-7,a=gust.gustTrajectory(.56-eps,lane,phase,curl),b=gust.gustTrajectory(.56,lane,phase,curl),c=gust.gustTrajectory(.56+eps,lane,phase,curl);
    assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<1e-3);assert.ok(Math.hypot(c.x-b.x,c.y-b.y)<1e-3);
    assert.ok(b.x>a.x&&c.x>b.x);assert.ok(Math.abs((b.y-a.y)/(b.x-a.x))<1e-4);assert.ok(Math.abs((c.y-b.y)/(c.x-b.x))<1e-4);
  }
});
