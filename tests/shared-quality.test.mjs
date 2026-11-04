import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, clearFrame, createFx, Painter, pointedRibbon, motionTrail, drawTrail, stratified, particleEnvelope, Rng, Particles, P, enableHDRLight } from '../build/core/index.js';
import * as severance from '../build/fx/shadow/spatial-severance.js';
const WHITE=0xffffffff;

test('pointed ribbons retain exact shared tips, finite adaptive geometry and deterministic output',()=>{
  for(const args of [[-80,80,12,5,0],[0,0,0,0,0],[80,-80,8,4,2],[-80,80,.2,.1,0]]){
    const r=pointedRibbon(...args);
    assert.deepEqual(r.top[0],r.bottom[0]);assert.deepEqual(r.top.at(-1),r.bottom.at(-1));
    assert.ok(r.shape.flat().every(Number.isFinite));assert.deepEqual(r,pointedRibbon(...args));
    assert.deepEqual(r.shape,[...r.top,...r.bottom.slice().reverse()]);
  }
  assert.throws(()=>pointedRibbon(0,NaN,1,1),RangeError);
});

test('motion trails clip before birth and collisions, include the current head and remain pure',()=>{
  const sample=t=>[t*50,t*t*20];
  assert.deepEqual(motionTrail(sample,-.1),[]);
  assert.deepEqual(motionTrail(sample,0),[[0,0]]);
  const p=motionTrail(sample,.04,.1,7);
  assert.deepEqual(p[0],sample(0));assert.deepEqual(p.at(-1),sample(.04));
  const clipped=motionTrail(sample,.20,.1,7,.18);
  assert.deepEqual(clipped[0],sample(.18));assert.deepEqual(clipped.at(-1),sample(.20));
  assert.ok(clipped.every(p=>p[0]>=9));
  assert.deepEqual(motionTrail(()=>[4,5],1),[[4,5]]);
  assert.throws(()=>motionTrail(sample,1,.1,1),RangeError);
  assert.throws(()=>motionTrail(()=>[NaN,0],1),RangeError);
});

test('stratified particles are repeatable and remain in their own emission cells',()=>{
  const a=stratified(20,new Rng(7)),b=stratified(20,new Rng(7));assert.deepEqual(a,b);
  a.forEach((v,i)=>assert.ok(v>=i/20 && v<(i+1)/20));
  assert.deepEqual(stratified(0,new Rng(7)),[]);
  assert.equal(particleEnvelope(0,1),0);assert.equal(particleEnvelope(1,1),0);
  assert.ok(particleEnvelope(.1,1)>.99);assert.ok(particleEnvelope(.9,1)<.1);
});

test('path lighting writes every cell once and does not overexpose subdivisions or retracing',()=>{
  for(const angle of [0,.37])for(const flip of [false,true]){
    const render=pts=>{
      const f=createFrame(64,48,-8,-6);enableHDRLight(f);const p=new Painter(f);p.place(25.2,17.3,flip,angle);
      p.fade=.6;p.lightK=.7;const hits=new Uint8Array(f.w*f.h),add=p.add.bind(p);
      p.add=(x,y,...rest)=>{hits[(y-f.oy)*f.w+x-f.ox]++;add(x,y,...rest)};
      p.glowPath(pts,4,WHITE,.4);assert.ok(hits.every(n=>n<=1));assert.ok(f.color.every(n=>n===0));return f;
    };
    const direct=render([[-16,0],[16,0]]),divided=render([[-16,0],[-8,0],[0,0],[8,0],[16,0]]);
    assert.deepEqual(divided.light,direct.light);assert.deepEqual(divided.hdrLight,direct.hdrLight);
    const retraced=render([[-16,0],[16,0],[-16,0],[16,0]]);assert.deepEqual(retraced.light,direct.light);
  }
});

test('path lighting handles single points, duplicates, clipping, reset and HDR without stale cells',()=>{
  const f=createFrame(32,32),p=new Painter(f);p.glowPath([],3,WHITE);assert.ok(f.light.every(v=>v===0));
  p.glowPath([[16,16]],4,WHITE,.3);const first=f.light.slice();clearFrame(f);p.reset();
  p.glowPath([[16,16],[16,16]],4,WHITE,.3);assert.deepEqual(f.light,first);
  clearFrame(f);p.glowPath([[-20,-20],[-10,-10]],3,WHITE);assert.ok(f.light.every(v=>v===0));
  f.w=8;f.h=8;f.color=new Uint32Array(64);f.light=new Uint32Array(64);p.reset();
  p.glowPath([[1,1],[6,6]],2,WHITE);assert.ok(f.light.some(v=>v!==0));
});

test('refined simulation trails never predate birth, draw immutably and reset at bounces',()=>{
  const ps=new Particles({seed:7,ground:()=>0});ps.spawn(P.SPARK,0,-.1,120,100,1);
  let points;const painter={path(p){points=p},dot(x,y){points=[[x,y]]},glow(){},px(){},line(){},circle(){},disc(){}};
  ps.draw(painter);assert.deepEqual(points,[[0,-.1]]);
  ps.update(.01);assert.equal(ps.list[0].trailAge,0);ps.draw(painter);assert.equal(points.length,1);
  ps.update(.01);const state=JSON.stringify(ps);ps.draw(painter);assert.equal(JSON.stringify(ps),state);
  assert.ok(points.every(pt=>pt[1]<0));assert.deepEqual(points.at(-1),[ps.list[0].x,ps.list[0].y]);
  const f=createFrame(64,64),p=new Painter(f).place(32,32);ps.draw(p);const pixels=f.color.slice(),lights=f.light.slice();
  clearFrame(f);ps.draw(p);assert.deepEqual(f.color,pixels);assert.deepEqual(f.light,lights);
});

test('legacy minimal painters and manually constructed particle records remain supported',()=>{
  const minimal={line(){},dot(){},px(){},glow(){},disc(){},circle(){}};
  const ps=new Particles();for(const kind of Object.values(P))ps.spawn(kind,0,0,20,-30,.5);
  ps.update(.05);assert.doesNotThrow(()=>ps.draw(minimal));
  delete ps.list[0].trailAge;const frame=createFrame(32,32);assert.doesNotThrow(()=>ps.draw(new Painter(frame).place(16,16)));
});

test('classic per-instance rendering does not change motion and is available through createFx',()=>{
  const make=()=>{const ps=new Particles({seed:5});ps.spawn(P.STREAK,0,0,80,-20,1);return ps};
  const ps=make(),classic=make();ps.update(.2);classic.update(.2);classic.renderStyle='classic';assert.deepEqual(ps.list,classic.list);
  const mod={meta:{duration:1},create(){const part=make();return{update:dt=>part.update(dt),draw:p=>part.draw(p)}}};
  const f=createFrame(64,32),a=createFx(mod,{x:24,y:16,particleStyle:'classic'});a.update(.2);a.draw(f);
  const g=createFrame(64,32);classic.draw(new Painter(g).place(24,16));assert.deepEqual(f.color,g.color);assert.deepEqual(f.light,g.light);
});

test('new reference renders deterministically, uses caller palette and ends fully transparent',()=>{
  for(const variant of [0,1,2]){
    const a=createFx(severance,{x:192,y:108,variant}),b=createFx(severance,{x:192,y:108,variant});
    const f=createFrame(384,216),g=createFrame(384,216);
    for(let i=0;i<=54;i++){
      if(i){a.update(.02);b.update(.02)}a.draw(clearFrame(f));b.draw(clearFrame(g));
      assert.deepEqual(f.color,g.color);assert.deepEqual(f.light,g.light);
    }
    assert.ok(f.color.every(v=>v===0));assert.ok(f.light.every(v=>v===0));
  }
  const f=createFrame(384,216),a=createFx(severance,{x:192,y:108,palette:['#110000','#330000','#661111','#994422','#cc6633','#ffaa66','#ffffcc']});
  a.update(.2);a.draw(f);assert.ok(f.color.some(v=>v!==0));
});


test('subpixel trails preserve a single bright head without accumulating opacity',()=>{
  for(const points of [[[4.1,4.1]],[[4.1,4.1],[4.2,4.1]],[[4.1,4.1],[4.125,4.1],[4.15,4.1],[4.2,4.1]],[[4.1,4.1],[4.1,4.1]]]){
    const f=createFrame(12,12);drawTrail(new Painter(f),points,{color:0xff0000ff,head:WHITE,alpha:.4,light:0});
    assert.equal(f.color[4*12+4],0x66ffffff);assert.equal(f.color.filter(v=>v!==0).length,1);
  }
});

test('singleton path lighting preserves radial color and strength callbacks',()=>{
  const render=points=>{const f=createFrame(16,16);new Painter(f).glowPath(points,4,(u,v)=>v<.5?WHITE:0xff0000ff,(u,v)=>v*.4);return f};
  const single=render([[5,5]]),duplicate=render([[5,5],[5,5]]);
  assert.deepEqual(single.light,duplicate.light);assert.ok(single.light.some(v=>v!==0));
});
