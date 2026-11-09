import test from 'node:test';
import assert from 'node:assert/strict';
import { createDissipationPose2D, createFrame, Painter } from '../build/core/index.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
const options = { start: .8, duration: .4, position: [12, -8], size: [23, 11], angle: .3,
  drift: [0, -7], endScale: [.55, .8], fadeStart: .1 };
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('dissipation preserves the starting pose and gives a pure, finite terminal interval', () => {
  const p=createDissipationPose2D(options), s=p.sample(options.start);
  assert.ok(Object.isFrozen(p)); assert.equal(p.end,options.start+options.duration);
  assert.deepEqual(s,{time:.8,fraction:0,position:[12,-8],size:[23,11],angle:.3,opacity:1});
  assert.equal(p.sample(.799),undefined); assert.equal(p.sample(p.end),undefined); assert.equal(p.sample(10),undefined);
  const saved=p.sample(1);p.sample(1.1);p.sample(.85);assert.deepEqual(p.sample(1),saved);
  assert.throws(()=>p.sample(NaN),RangeError);
  assert.equal('progress' in s,false,'handoff fraction must not overwrite a kinetic burst expansion progress');
});

test('drift and deformation start/end smoothly while opacity falls monotonically', () => {
  const p=createDissipationPose2D(options), eps=1e-6, first=p.sample(p.start), next=p.sample(p.start+eps), last=p.sample(p.end-eps);
  assert.ok(Math.abs((next.position[1]-first.position[1])/eps)<.001);
  assert.ok(Math.abs((next.size[0]-first.size[0])/eps)<.001);
  near(last.position[1],-15,1e-7);near(last.size[0],23*.55,1e-7);assert.ok(last.opacity<1e-8);
  let opacity=1;
  for(let i=0;i<100;i++){const s=p.sample(p.start+(p.end-p.start)*i/100);assert.ok(s.opacity<=opacity&&s.opacity>=0);opacity=s.opacity;
    assert.ok(s.size[0]>=23*.55&&s.size[0]<=23);assert.ok(s.position[1]>=-15&&s.position[1]<=-8);}
});

test('input arrays and returned poses cannot mutate a dissipation instance', () => {
  const o=structuredClone(options),p=createDissipationPose2D(o),saved=p.sample(1);
  o.position.fill(999);o.size.fill(999);o.drift.fill(999);o.endScale.fill(999);o.angle=9;o.duration=9;
  const s=p.sample(1);s.position.fill(-999);s.size.fill(-999);
  assert.deepEqual(p.sample(1),saved);
  const still=createDissipationPose2D({start:0,duration:1,position:[8,4],size:[12,10]});
  assert.deepEqual(still.sample(.8).position,[8,4],'omitting drift must not invent motion');
});

test('invalid or unrepresentable handoffs fail explicitly; tiny positive end sizes remain positive', () => {
  for(const patch of[{start:NaN},{duration:0},{duration:null},{start:1e308,duration:1},{start:1e308,duration:1e308},
    {size:[0,1]},{size:[1,Infinity]},{position:[NaN,0]},{endScale:[0,1]},{endScale:null},{drift:[0,Infinity]},
    {position:[1e308,0],drift:[1e308,0]},{size:[1e308,1],endScale:[2,1]},
    {size:[Number.MIN_VALUE,1],endScale:[.1,1]},{angle:null},{fadeStart:1},{fadeStart:-1}])
    assert.throws(()=>createDissipationPose2D({...options,...patch}),RangeError);
  const p=createDissipationPose2D({...options,start:0,duration:1,endScale:[1e-300,1e-300]});
  assert.ok(p.sample(1-Number.EPSILON).size.every(x=>x>0&&Number.isFinite(x)));
  const tiny=createDissipationPose2D({...options,start:0,duration:1,size:[Number.MIN_VALUE,Number.MIN_VALUE],endScale:[1,1]});
  assert.ok(tiny.sample(.5).size.every(x=>x===Number.MIN_VALUE));
});

function scene(material,seed,distance=128,travel=.74,layers={}) {
  const plan=createGenerationPlan2D({material,action:'dash',seed,distance,travel});
  const mod=createGeneratedEffect2D(plan),impl=mod.create({...mod.meta.options,layers});
  return {plan,at(t){const f=createFrame(...mod.meta.size),p=new Painter(f).place(...mod.meta.origin);impl.drawBack(p,t);impl.draw(p,t);return f;}};
}
const alpha=f=>f.color.reduce((sum,c)=>sum+(c>>>24),0);
const light=f=>f.light.reduce((sum,c)=>sum+(c&255)+((c>>>8)&255)+((c>>>16)&255),0);

test('generated dash matter and head light remain continuous across source cutoff', () => {
  for(const material of['fire','energy'])for(const seed of[5,17,41])for(const [distance,travel]of[[128,.74],[24,.25],[160,3]]){
    const primary=scene(material,seed,distance,travel,{trail:false,sparks:false,residue:false,light:false});
    const full=scene(material,seed,distance,travel),t=primary.plan.timing.arrival;
    const before=primary.at(t-.0001),at=primary.at(t),after=primary.at(t+.0001);
    assert.ok(alpha(at)/alpha(before)>.97&&alpha(at)/alpha(before)<1.03,`${material}/${seed}: cutoff mass discontinuity`);
    assert.ok(alpha(after)/alpha(at)>.97&&alpha(after)/alpha(at)<1.03);
    assert.ok(light(full.at(t))/light(full.at(t-.0001))>.97,'head glow must not shut off at the handoff');
    assert.ok(alpha(primary.at(t+.08))>alpha(at)*.5,'dissipation must remain a visible stage, not a one-frame replacement');
    assert.equal(alpha(primary.at(t+.4)),0,'retained body must finish and not become a permanent ghost');
    assert.ok(primary.at(primary.plan.timing.end).color.every(c=>c===0));
  }
});

test('handoff frames seek deterministically and respect response/light layer controls', () => {
  for(const material of['fire','energy']){
    const a=scene(material,17),t=a.plan.timing.arrival+.15,saved=a.at(t);a.at(t+.4);a.at(.1);assert.deepEqual(a.at(t),saved);
    const noResponse=scene(material,17,128,.74,{response:false,trail:false,sparks:false,light:false,residue:false});
    assert.equal(alpha(noResponse.at(t)),0);
    const dark=scene(material,17,128,.74,{light:false});assert.equal(light(dark.at(t)),0);
    assert.equal(a.plan.events.filter(e=>e.kind==='burst').length,0,'dissipate must not invent a burst event');
    assert.equal(a.plan.timing.emissionEnd,a.plan.timing.arrival);
  }
});
