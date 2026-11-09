import test from 'node:test';
import assert from 'node:assert/strict';
import {createKineticBody2D,createFrame,Painter,PAL} from '../build/core/index.js';
const state={time:.43,position:[0,0],size:[34,18],angle:.43,progress:.37};
const frame=(body,time)=>{const f=createFrame(160,160);body.draw(new Painter(f).place(80,80),{...state,time});return f};
test('opt-in kinetic flow closes both geometry and material exactly across positive and negative cycles',()=>{
 for(const material of ['fire','energy'])for(const profile of ['stream','plume','burst'])for(const period of [.7,3.2,5]){
  const b=createKineticBody2D({seed:6127,material,profile,period,palette:PAL.arcane});
  for(const t of [0,.013,.137,.43,period-.013]){
   const a=frame(b,t);assert.deepEqual(frame(b,t+period),a);assert.deepEqual(frame(b,t-period),a);
   for(const u of [0,.15,.4,.75,1]){
    const s=b.sampleSurface({...state,time:t},u),q=b.sampleSurface({...state,time:t+period},u);
    assert.deepEqual(q,s);
   }
  }
  const before=frame(b,period-1e-7),after=frame(b,1e-7);
  assert.ok(before.color.filter((c,i)=>c!==after.color[i]).length<8,'no phase-reset material/silhouette jump');
 }
});
test('cyclic flow deforms the same source rather than only moving or recoloring a fixed contour',()=>{
 const b=createKineticBody2D({seed:6127,material:'energy',profile:'stream',period:3.2,palette:['#fff']});
 const a=frame(b,.2),c=frame(b,1.1);
 assert.ok(a.color.filter((v,i)=>(v>>>24)!==(c.color[i]>>>24)).length>10, 'fixed-pose binary silhouette must change, not just its colors');
 assert.ok(a.light.every(c=>c===0));
});
test('period options are snapshotted and invalid periods reject before drawing',()=>{
 const options={seed:7,material:'energy',profile:'stream',period:3.2,palette:PAL.arcane},b=createKineticBody2D(options),a=frame(b,.4);
 options.period=.7;assert.deepEqual(frame(b,.4),a);
 for(const period of [null,0,-1,.001,3601,Infinity,NaN,'3.2'])assert.throws(()=>createKineticBody2D({...options,period}),RangeError);
});
