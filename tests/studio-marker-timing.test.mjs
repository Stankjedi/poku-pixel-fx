import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {createAct} from '../build/core/act.js';
import {STAND} from '../build/core/rig.js';
import {collectAssetEvents,resolveActExport,resolveAssetEvents} from '../build/render/export.js';

const mod={
  meta:{name:'Marker clock fixture',size:[24,48],origin:[12,44],duration:1,loop:false,options:{seed:1},
    cues:[{id:'start',at:-.25},{id:'after-freeze',at:.4},{id:'outside-crop',at:2}]},
  act:{poses:[[-.25,{...STAND}],[1,{...STAND}]],hits:[{t:.1,stop:.2,target:false},{t:.5,at:0,stop:.1,target:false}]},
  draw(p){p.px(0,-10,0xffffffff);},
};

test('ACT markers map windup and earlier freezes to the first matching displayed frame',async()=>{
  const runtime=await createProjectRuntime({id:'test/marker-clock',kind:'act',fps:20,bg:'none',actor:false,target:false},mod);
  try{
    assert.equal(runtime.markerTime(-.25),0);
    assert.equal(runtime.markerTime(.1),.35);
    assert.equal(runtime.markerTime(.4),.85);
    assert.equal(runtime.markerTime(.5),.95,'ActHit.at is a target index, not the source timestamp');
    assert.equal(runtime.markerTime(2),undefined);
    for(const source of [.1,.4,.5]){
      const elapsed=runtime.markerTime(source),index=Math.round(elapsed*20);
      const before=runtime.render((index-1)/20,index-1,false).time;
      const reached=runtime.render(index/20,index,false).time;
      assert(before<source-1e-9,`frame before ${source} must still precede it`);
      assert(reached>=source-1e-9,`marker must reach ${source}`);
    }
    assert.equal(runtime.events.find(e=>e.t===.5).at,0,'original event target metadata stays intact');
  }finally{runtime.dispose();}
});

test('ACT export sampling observes the existing walk including frame zero without adding updates',()=>{
  const counter=createAct(mod),calls=[];let updates=0;const update=counter.update.bind(counter);
  counter.update=dt=>{updates++;update(dt);};
  const plan=resolveActExport(mod,counter,{fps:20,hold:.2},(sourceTime,index)=>calls.push({sourceTime,index}));
  assert.equal(calls[0].sourceTime,-.25);assert.equal(calls[0].index,0);
  assert.equal(updates,plan.steps);assert.equal(calls.length,plan.steps+1);
  assert.equal(calls.at(-1).sourceTime,plan.lastTime);
  assert.equal(plan.n,calls.length+plan.held);
});

test('cropped ACT markers exclude events outside the displayed source interval',async()=>{
  const runtime=await createProjectRuntime({id:'test/marker-clock',kind:'act',fps:20,seconds:.2,bg:'none',actor:false,target:false},mod);
  try{assert.equal(runtime.markerTime(-.25),0);assert.equal(runtime.markerTime(.1),undefined);assert.equal(runtime.markerTime(.4),undefined);}
  finally{runtime.dispose();}
});

test('exported ACT event timing preserves target indices and matches frozen presentation frames',()=>{
  const frames=[];
  resolveActExport(mod,createAct(mod),{fps:20,hold:0},time=>frames.push({time,duration:50}));
  const events=resolveAssetEvents(collectAssetEvents(mod),frames),hit=events.find(e=>e.payload.t===.5);
  assert.equal(hit.sourceTime,.5);assert.equal(hit.timeMs,950);assert.equal(hit.payload.at,0);
  assert.equal(events.find(e=>e.name==='after-freeze').timeMs,850);
  const explicit=resolveAssetEvents([{sourceTime:.4,t:.5,at:0,id:'explicit'}],frames);
  assert.equal(explicit[0].sourceTime,.4);assert.equal(explicit[0].timeMs,850);
});

test('loop events include an exact final displayed source endpoint once',()=>{
  const frames=[0,.5,1,1,1.5,2].map(time=>({time,duration:100}));
  const events=resolveAssetEvents([{id:'cycle-start',at:0},{id:'half',at:.5}],frames,1);
  assert.deepEqual(events.filter(e=>e.name==='cycle-start').map(e=>[e.sourceTime,e.timeMs]),[[0,0],[1,200],[2,500]]);
  assert.deepEqual(events.filter(e=>e.name==='half').map(e=>[e.sourceTime,e.timeMs]),[[.5,100],[1.5,400]]);
});
