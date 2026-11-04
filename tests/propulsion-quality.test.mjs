import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CubicFlightPath, createExhaustWake, dragDisplacement, drawRocketJet, createFrame, clearFrame, createFx, Painter, fit } from '../build/core/index.js';
import * as salvo from '../build/fx/projectiles/missile-salvo.js';
import * as rocket from '../build/fx/projectiles/rocket.js';
import { effects } from '../build/fx/index.js';

const line = () => new CubicFlightPath([[0,0], [1,0], [99,0], [100,0]]);
const curve = () => new CubicFlightPath([[0,0], [0,-100], [100,-100], [100,0]]);
const close = (a,b,e=1e-7) => assert.ok(Math.abs(a-b) < e, `${a} != ${b}`);
test('powered flight uses arc length, preserves endpoints, and returns normalized headings', () => {
  const path = line(); close(path.length, 100);
  for (let i=0;i<=20;i++) { const s=path.atTime(i/20,1); close(s.x,i*5,.003); close(s.y,0); close(s.speed,100); }
  const c=curve(); assert.deepEqual([c.atDistance(0).x,c.atDistance(0).y],[0,0]);
  assert.deepEqual([c.atDistance(1).x,c.atDistance(1).y],[100,0]);
  for(let i=0;i<=20;i++) { const s=c.atDistance(i/20);close(Math.hypot(s.dx,s.dy),1); }
  close(c.atDistance(0).angle,-Math.PI/2);close(c.atDistance(1).angle,Math.PI/2);
  assert.equal(path.atTime(-1,1).speed,0);assert.equal(path.atTime(2,1).speed,0);
  close(path.atTime(.5,1,2).x,25,.003); close(path.atTime(.5,1,2).speed,100);
});
test('coincident and endpoint-stationary flight stays finite and copies inputs', () => {
  const input=[[2,3],[2,3],[2,3],[2,3]], p=new CubicFlightPath(input); input[0][0]=999;
  assert.equal(p.length,0);assert.deepEqual(p.atTime(.5,1),{x:2,y:3,angle:0,dx:1,dy:0,speed:0});
  const q=new CubicFlightPath([[0,0],[0,0],[100,0],[100,0]]);
  assert.equal(q.atDistance(0).dx,1);assert.equal(q.atDistance(1).dx,1);
});
test('drag displacement is analytic at zero drag and stable near zero', () => {
  close(dragDisplacement(30,-9,2,0),42);
  close(dragDisplacement(30,-9,2,1e-12),42,1e-8);
  const d=2,t=.7,v=33,a=-8,e=Math.exp(-d*t);
  close(dragDisplacement(v,a,t,d),v*(1-e)/d+a/d*(t-(1-e)/d));
  for(const args of [[1,1,-1,0],[1,1,1,-1],[NaN,1,1,0]])assert.throws(()=>dragDisplacement(...args),RangeError);
});
test('exhaust is deterministic, detached and seekable with no per-frame emission', () => {
  const path=curve(), options={duration:1,spacing:2,power:1.4,seed:7};
  const a=createExhaustWake(path,options), b=createExhaustWake(path,options);
  assert.equal(a.count,Math.ceil(path.length/2));assert.deepEqual(a.sample(-1),[]);assert.deepEqual(a.sample(10),[]);
  const snapshot=a.sample(.6); a.sample(1.4); a.sample(.1);
  assert.deepEqual(a.sample(.6),snapshot);assert.deepEqual(snapshot,b.sample(.6));
  assert.notDeepEqual(snapshot,createExhaustWake(path,{...options,seed:8}).sample(.6));
  assert.ok(a.sample(1.1).length>0,'exhaust remains after impact');
  for(const q of a.sample(.8))assert.ok(Object.values(q).every(Number.isFinite));
  const stationary = createExhaustWake(new CubicFlightPath([[0,0],[0,0],[0,0],[0,0]]),options);
  assert.deepEqual(stationary.sample(.5),[]);
});
test('propulsion validates finite dimensions and bounds allocation',()=>{
  assert.throws(()=>new CubicFlightPath([[0,0],[0,NaN],[1,1],[2,2]]),RangeError);
  assert.throws(()=>new CubicFlightPath([[0,0],[0,0],[1,1],[2,2]],8),RangeError);
  for(const options of [{duration:0},{duration:1,spacing:0},{duration:1,spacing:.0001},{duration:1,drag:-1},{duration:1,power:.5}])
    assert.throws(()=>createExhaustWake(line(),options),RangeError);
  assert.throws(()=>line().atTime(NaN,1),RangeError);
  assert.throws(()=>line().atDistance(Infinity),RangeError);
});
test('oriented nozzle jets are deterministic and do not alter parent painter placement',()=>{
  const f=createFrame(128,128),p=new Painter(f),palette=fit(salvo.meta.options.palette,9);
  p.place(64,64,true,.32);const before=[p.tx,p.ty,p.fx,p.cs,p.sn,p.fade];
  drawRocketJet(p,{x:0,y:0,angle:.75,palette});
  assert.deepEqual([p.tx,p.ty,p.fx,p.cs,p.sn,p.fade],before);assert.ok(f.color.some(v=>v>>>24));
  const a=f.color.slice();clearFrame(f);drawRocketJet(p,{x:0,y:0,angle:.75,palette});assert.deepEqual(f.color,a);
  assert.throws(()=>drawRocketJet(p,{x:0,y:0,palette:[]}),RangeError);
});
function render(t,{seed=23,flip=false,palette}={}) {
  const f=createFrame(...salvo.meta.size),fx=createFx(salvo,{x:flip?salvo.meta.size[0]-salvo.meta.origin[0]:salvo.meta.origin[0],y:salvo.meta.origin[1],seed,flip,...(palette?{palette}: {})});
  fx.update(t);fx.draw(f);return f;
}
test('salvo is registered, seekable and different seeds/recolors remain meaningful',()=>{
  assert.equal(effects['projectiles/missile-salvo'],salvo);
  const a=render(1.4), b=render(1.4); assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);
  const fx=createFx(salvo,{x:salvo.meta.origin[0],y:salvo.meta.origin[1]});
  for(let i=0;i<42;i++)fx.update(1/30);const f=createFrame(...salvo.meta.size);fx.draw(f);
  assert.deepEqual(f.color,a.color);assert.deepEqual(f.light,a.light);
  assert.notDeepEqual(a.color,render(1.4,{seed:7}).color);
  assert.notDeepEqual(a.color,render(1.4,{palette:['#06182b','#1874b2','#64dce2','#ffffff']}).color);
  const end=render(salvo.meta.duration);assert.ok(end.color.every(v=>v===0));assert.ok(end.light.every(v=>v===0));
});
test('salvo remains inside native bounds for seeds, mirrored views and all impact instants',()=>{
  const [w,h]=salvo.meta.size,margin=32;
  for(const seed of [0,1,7,23,128,-1,4294967295])for(const flip of [false,true]) {
    const f=createFrame(w+2*margin,h+2*margin,-margin,-margin);
    const fx=createFx(salvo,{x:flip?w-salvo.meta.origin[0]:salvo.meta.origin[0],y:salvo.meta.origin[1],seed,flip});
    const times=[...Array.from({length:77},(_,i)=>i/20),...salvo.missileTimings.flatMap(m=>[m.launch,m.launch+m.flight,m.launch+m.flight+.001])].sort((a,b)=>a-b);
    let last=0;
    for(const t of times){fx.update(t-last);last=t;fx.draw(clearFrame(f));
      for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
        if(y>=margin&&y<h+margin&&x===margin){x+=w-1;continue;}
        assert.equal(f.color[y*f.w+x]>>>24,0,`seed=${seed} flip=${flip} t=${t} x=${x-margin} y=${y-margin}`);
      }
    }
  }
});
test('existing rocket still draws a finite recolorable loop with shared nozzle renderer',()=>{
  for(const angle of [0,.5,Math.PI/2]){
    const f=createFrame(400,400),fx=createFx(rocket,{x:260,y:200,angle,seed:5});fx.update(.37);fx.draw(f);
    assert.ok(f.color.some(v=>v>>>24));assert.ok(f.light.some(v=>v&0xffffff));
  }
});

test('legacy rocket profile retains all 216 original color and light frames',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/rocket-before-propulsion.json',import.meta.url),'utf8'));
  for(const [key,expected] of Object.entries(fixture.hashes)){
    const [seed,mirror]=key.split('/'),flip=mirror==='true';
    const f=createFrame(...rocket.meta.size),fx=createFx(rocket,{x:flip?rocket.meta.size[0]-rocket.meta.origin[0]:rocket.meta.origin[0],y:rocket.meta.origin[1],seed:+seed,flip}),hash=createHash('sha256');
    for(let i=0;i<fixture.frames;i++){if(i)fx.update(1/30);fx.draw(clearFrame(f));hash.update(f.color);hash.update(f.light);}
    assert.equal(hash.digest('hex'),expected,key);
  }
});
