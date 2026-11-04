import test from 'node:test';
import assert from 'node:assert/strict';
import { gustImpulse3D, advectGust3D, createFrame3D, Painter3D, createFx3D, color3D } from '../build/3d/index.js';
import * as wind from '../build/3d/effects/wind-rasenshuriken.js';

const camera={yaw:.32,elevation:.22,zoom:1.18,target:[0,2.35,0]};
function render(time,options={},cam=camera){
  const fx=createFx3D(wind,options);fx.seek(time);
  const f=createFrame3D(180,120),p=new Painter3D(f,cam);p.begin(0);fx.draw(p);return f;
}
function recorded(time,options={}){
  const opts={...wind.meta.options,...options},fx=wind.create(opts),calls=[];
  fx.update(time);
  const p={
    line(a,b,r,c,alpha=1,emission=0){if(alpha>0)calls.push({kind:'line',points:[a,b],c:color3D(c),r,alpha,emission});},
    triangle(a,b,c,col,alpha=1,emission=0){if(alpha>0)calls.push({kind:'triangle',points:[a,b,c],c:color3D(col),alpha,emission});},
    point(a,r,c,alpha=1,emission=0){if(alpha>0)calls.push({kind:'point',points:[a],c:color3D(c),r,alpha,emission});},
    glow(){assert.fail('Air/wood/dust must not emit light');},
  };
  fx.draw(p);return calls;
}

test('pressure impulse is causal, finite, strength-controlled and decays before prop recovery',()=>{
  assert.deepEqual(gustImpulse3D(-.01),{pressure:0,deflection:0,drift:0,velocity:0});
  assert.deepEqual(gustImpulse3D(.1,0),{pressure:0,deflection:0,drift:0,velocity:0});
  assert.equal(gustImpulse3D(0).pressure,1);assert.equal(gustImpulse3D(0).deflection,0);
  assert.ok(gustImpulse3D(.12).deflection>.5);assert.ok(gustImpulse3D(.42).deflection<0,'rooted foliage springs back');
  assert.ok(gustImpulse3D(.45).pressure<.004);assert.ok(Math.abs(gustImpulse3D(2).deflection)<.001);
  for(let i=1;i<100;i++){assert.ok(gustImpulse3D(i/40).drift>=gustImpulse3D((i-1)/40).drift);assert.ok(gustImpulse3D(i/40).velocity<=gustImpulse3D((i-1)/40).velocity);}
  assert.equal(gustImpulse3D(.1,2).deflection,2*gustImpulse3D(.1).deflection);
  assert.deepEqual(gustImpulse3D(Number.MAX_VALUE),{pressure:0,deflection:0,drift:1,velocity:0});
  for(const args of [[NaN],[Infinity],[0,NaN]])assert.throws(()=>gustImpulse3D(...args),RangeError);
});

test('downstream advection normalizes direction and preserves drag-free and delayed limits',()=>{
  assert.deepEqual(advectGust3D([1,2,3],[4,0,0],-.1,6),[1,2,3]);
  assert.deepEqual(advectGust3D([1,2,3],[4,0,0],.5,6,0),[4,2,3]);
  assert.deepEqual(advectGust3D([1,2,3],[4,0,0],.5,6),advectGust3D([1,2,3],[1,0,0],.5,6));
  assert.ok(advectGust3D([0,0,0],[1,0,0],2,6)[0]<6/2.6);
  assert.throws(()=>advectGust3D([0,0,0],[0,0,0],1,6),RangeError);
  assert.throws(()=>advectGust3D([0,0,0],[1,0,0],1,6,-1),RangeError);
  assert.throws(()=>advectGust3D([0,NaN,0],[1,0,0],1,6),RangeError);
  assert.throws(()=>advectGust3D([0,0,0],[1,0,0],Number.MAX_VALUE,6,0),RangeError);
  assert.throws(()=>advectGust3D([0,0],[1,0,0],1,6),RangeError);
});

test('one frozen surface contact drives the hit cue and wind geometry remains upstream beforehand',()=>{
  const hit=wind.WIND_CONTACT_3D;
  assert.ok(Object.isFrozen(hit));assert.ok(Object.isFrozen(hit.position));assert.ok(Object.isFrozen(hit.normal));
  assert.equal(wind.meta.cues.find(c=>c.type==='hit').at,hit.at);
  assert.ok(!wind.meta.cues.some(c=>c.type==='flash'));
  const palette=new Set(wind.meta.options.palette.map(color3D));
  for(const radius of [.5,3.05,3.4])for(const t of [1.5,2.65,2.8,3,3.049]){
    const points=recorded(t,{radius}).filter(c=>palette.has(c.c)).flatMap(c=>c.points);
    assert.ok(points.length>100);assert.ok(points.every(p=>p[0]<=hit.position[0]),`radius ${radius}, t ${t}: no early contact`);
  }
});

test('wood reacts only after contact, rocks on its floor support, skids downstream and settles',()=>{
  const wood=new Set(['#322e2a','#51463a','#78634b','#a38960','#c1aa79'].map(color3D));
  const prop=t=>recorded(t).filter(c=>wood.has(c.c)).flatMap(c=>c.points);
  assert.deepEqual(prop(1),prop(wind.WIND_CONTACT_3D.at));
  const before=prop(3.05),hit=prop(3.18),settled=prop(4.2);
  assert.notDeepEqual(hit,before);assert.ok(Math.max(...hit.map(p=>p[0]))>Math.max(...before.map(p=>p[0]))+.5);
  assert.ok(Math.min(...settled.map(p=>p[0]))>Math.min(...before.map(p=>p[0]))+.5);
  for(let i=0;i<120;i++)assert.ok(prop(3.05+i/120).every(p=>p[1]>=0),'prop never penetrates ground');
  assert.equal(recorded(3.2,{targetVisible:false}).filter(c=>wood.has(c.c)).length,0);
});

test('wind remains non-emissive, seeded and recolorable through formation, strike and settling',()=>{
  for(const t of [.5,1.5,2.9,3.05,3.2,3.45,3.85,4.3]){
    const a=render(t);assert.deepEqual(a.color,render(t).color);assert.ok(a.light.every(c=>c===0));
    assert.ok(a.color.some(c=>c>>>24));
    assert.ok(recorded(t).every(c=>c.emission===0));
  }
  assert.notDeepEqual(render(3.4).color,render(3.4,{seed:907}).color);
  assert.notDeepEqual(render(3.2).color,render(3.2,{palette:['#273246','#d3def2']}).color);
  for(const time of [0,4.6,100])assert.ok(render(time).color.every(c=>c===0));
  assert.ok(render(1,{intensity:0}).color.every(c=>c===0));
  for(const opts of [{palette:[]},{palette:['#cbd9bd']},{radius:NaN,intensity:Infinity}])assert.doesNotThrow(()=>render(3.2,opts));
});

test('pressure contact is independent of seek, update rate, repeated draw and camera angle',()=>{
  const a=createFx3D(wind),b=createFx3D(wind),c=createFx3D(wind);a.seek(3.4);
  for(let i=0;i<102;i++)b.update(1/30);for(let i=0;i<408;i++)c.update(1/120);
  const draw=fx=>{const f=createFrame3D(180,120),p=new Painter3D(f,camera);p.begin(0);fx.draw(p);return f.color;};
  assert.deepEqual(draw(a),draw(b));assert.deepEqual(draw(b),draw(c));assert.deepEqual(draw(a),draw(a));
  for(const yaw of [-.8,.32,1.1,2.6])for(const time of [1.5,3.2,3.6]){
    const f=render(time,{}, {...camera,yaw,elevation:.48,zoom:.92});assert.ok(f.color.some(c=>c>>>24));assert.ok(f.light.every(c=>c===0));
  }
});

test('default and largest supported wind stay inside native export borders through the full sequence',()=>{
  for(const radius of [3.05,3.4])for(const seed of [308,7])for(const intensity of [1,2])for(let i=0;i<111;i++){
    const f=render(i/24,{radius,seed,intensity});
    for(let x=0;x<f.w;x++){
      assert.ok((f.color[x]>>>24)<=10,`top: radius ${radius}, seed ${seed}, frame ${i}`);
      assert.ok((f.color[(f.h-1)*f.w+x]>>>24)<=10,`bottom: radius ${radius}, seed ${seed}, frame ${i}`);
    }
    for(let y=0;y<f.h;y++){
      assert.ok((f.color[y*f.w]>>>24)<=10,`left: radius ${radius}, seed ${seed}, frame ${i}`);
      assert.ok((f.color[y*f.w+f.w-1]>>>24)<=10,`right: radius ${radius}, seed ${seed}, frame ${i}`);
    }
  }
});
