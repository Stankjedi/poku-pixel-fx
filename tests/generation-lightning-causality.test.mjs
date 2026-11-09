// Rendering contracts only. These tests do not certify visual readability or approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
import {lightningChannels2D} from '../build/authoring/lightning-generation.js';
import {smooth} from '../build/core/math.js';
const key=p=>JSON.stringify(p);
const make=seed=>{const plan=createGenerationPlan2D({material:'lightning',action:'strike',seed}),module=createGeneratedEffect2D(plan);return{plan,impl:module.create(module.meta.options),channels:lightningChannels2D(seed,plan.from,plan.to)}};
const trace=(impl,time,back=false)=>{const paths=[],p={path:(points,color,alpha,width)=>paths.push({points,alpha,width}),glowPath(){},ellipse(){},glow(){}};(back?impl.drawBack:impl.draw)(p,time);return paths;};
const pathLength=points=>points.slice(1).reduce((sum,p,n)=>sum+Math.hypot(p[0]-points[n][0],p[1]-points[n][1]),0);

test('lightning current and residual never exceed the completed leader extent of a branch',()=>{
 for(const seed of [0,1,2,17,37,218,0xffffffff]){
  const {impl,channels}=make(seed),length=channels[0].length;
  for(const time of [.23,.2301,.232,.234,.236,.238,.25,.30,.43,.5,.8])for(const back of [false,true]){
   const paths=trace(impl,time,back);
   for(const channel of channels.slice(1))for(const path of paths.filter(p=>key(p.points[0])===key(channel.points[0])))
    assert.ok(pathLength(path.points)<=Math.max(0,Math.min(channel.length,length-channel.rootDistance))+1e-9,`seed ${seed}, time ${time}, back ${back}`);
  }
 }
});

test('lightning residual follows the upward return front and waits at each branch junction',()=>{
 for(const seed of [0,1,17,37,218,0xffffffff]){
  const {plan,impl,channels}=make(seed),length=channels[0].length;
  assert.equal(trace(impl,plan.timing.arrival,true).length,0);
  for(let n=1;n<=80;n++){
   const time=plan.timing.arrival+n*.0001,front=(1-smooth(plan.timing.arrival,plan.timing.arrival+.008,time))*length;
   const paths=trace(impl,time,true),bright=trace(impl,time).find(p=>p.width===3.2);
   for(const channel of channels.slice(1))if(paths.some(p=>key(p.points[0])===key(channel.points[0])))assert.ok(channel.connection>=front-1e-9);
   const trunk=paths.find(p=>key(p.points.at(-1))===key(plan.to));
   if(trunk){assert.ok(pathLength(trunk.points)<=length-front+1e-9);if(bright)assert.deepEqual(trunk.points,bright.points);}
  }
 }
});

test('lightning branch residual keeps fading through a trunk-only restrike',()=>{
 for(const seed of [0,1,17,37,218,0xffffffff]){
  const {impl,channels}=make(seed),times=[.39,.40,.409999,.41,.410001,.42,.43,.45,.48,.5];
  const samples=times.map(time=>trace(impl,time,true));
  for(const channel of channels.slice(1)){
   let previous=Infinity;
   for(const paths of samples){const p=paths.find(p=>key(p.points[0])===key(channel.points[0]));const alpha=p?(typeof p.alpha==='function'?p.alpha(0):p.alpha):0;assert.ok(alpha<=previous+1e-12,`seed ${seed}, branch ${key(channel.points[0])}: ${alpha} > ${previous}`);previous=alpha;}
  }
 }
});
