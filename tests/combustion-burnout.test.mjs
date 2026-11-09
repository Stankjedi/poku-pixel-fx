import test from 'node:test';
import assert from 'node:assert/strict';
import {createKineticBody2D,createFrame,Painter} from '../build/core/index.js';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
const palette=['#fff1ac','#ffb238','#f76a19','#b93316','#57151b'];
const state={time:.5,position:[0,0],size:[36,31],progress:.56};
const render=(body,patch={})=>{const f=createFrame(160,160);body.draw(new Painter(f).place(80,80),{...state,...patch});return f};
const occupied=f=>f.color.reduce((n,c)=>n+Number((c>>>24)>0),0);

test('fire burnout is opt-in, deterministic, light-free and consumes coherent material monotonically',()=>{
 for(const seed of [0,17,3691,6689,0xffffffff]){
  const b=createKineticBody2D({seed,material:'fire',profile:'burst',palette});
  assert.deepEqual(render(b),render(b,{burnout:0}));
  let previous=render(b),start=occupied(previous);
  for(const burnout of [.2,.4,.5,.6,.7,.8,1]){
   const frame=render(b,{burnout});
   for(let i=0;i<frame.color.length;i++)if(frame.color[i]>>>24)assert.ok(previous.color[i]>>>24,'consumed material cannot regenerate');
   assert.ok(frame.light.every(c=>c===0));previous=frame;
  }
  assert.equal(occupied(previous),0);assert.ok(occupied(render(b,{burnout:.55}))<start*.85);
  const saved=render(b,{burnout:.55});render(b,{burnout:.9});render(b,{burnout:.1});
  assert.deepEqual(render(b,{burnout:.55}),saved);
 }
});

test('remaining combustion surfaces agree with the shader, and exhausted rays reject explicitly',()=>{
 let valid=0,empty=0;
 for(const seed of [17,3691])for(const burnout of [.4,.55,.65,.8]){
  const body=createKineticBody2D({seed,material:'fire',profile:'burst',palette});
  const s={...state,position:[13,-7],size:[37,19],angle:.4,burnout};
  let shader;body.draw({shade:(_a,_b,_c,_d,f)=>{shader=f}},s);
  const painted=q=>{const out={c:0,a:0};shader(...q,out);return out.a>0};
  for(let i=0;i<32;i++){
   let q;try{q=body.sampleSurface(s,i/32)}catch(error){assert.match(error.message,/No kinetic material/);empty++;continue}
   assert.ok(q.position.concat(q.normal,q.tangent).every(Number.isFinite));
   assert.ok([.01,.001,.0001].some(e=>painted(q.position.map((v,j)=>v-q.normal[j]*e))&&!painted(q.position.map((v,j)=>v+q.normal[j]*e))),`surface ${seed}/${burnout}/${i}`);
   valid++;
  }
 }
 assert.ok(valid>100&&empty>0);
 const b=createKineticBody2D({material:'fire',profile:'burst',palette});
 assert.throws(()=>b.sampleSurface({...state,burnout:1},0),/No kinetic material/);
});

test('burnout honors palette alpha, transforms, empty state and explicit invalid-input rejection',()=>{
 const body=createKineticBody2D({material:'fire',profile:'burst',palette});
 for(const burnout of [-1,1.01,NaN,null,Infinity])assert.throws(()=>render(body,{burnout}),RangeError);
 assert.throws(()=>render(createKineticBody2D({material:'energy',profile:'burst',palette}),{burnout:.5}),RangeError);
 const clear=createKineticBody2D({material:'fire',profile:'burst',palette:[0x00112233]});
 assert.equal(occupied(render(clear,{burnout:.55})),0);
 assert.equal(occupied(render(body,{burnout:.55,opacity:0})),0);
 const f=render(body,{burnout:.55,opacity:.25,angle:1.2});
 assert.ok(occupied(f)>0);assert.ok(f.color.every(c=>(c>>>24)<=64));
});

test('new fire bursts break up after emission, retain causal clocks, seek and finish empty',()=>{
 for(const action of ['burst','dash'])for(const seed of [17,3691,6689]){
  const plan=createGenerationPlan2D({material:'fire',action,...(action==='dash'?{response:'burst'}:{}),seed});
  const m=createGeneratedEffect2D(plan),i=m.create({...m.meta.options,layers:{light:false,trail:false,sparks:false,residue:false}});
  const at=t=>{const f=createFrame(...m.meta.size),p=new Painter(f).place(...m.meta.origin);i.drawBack(p,t);i.draw(p,t);return f};
  const initial=at(plan.timing.arrival+.2),late=at(plan.timing.arrival+.35);
  assert.ok(occupied(initial)>occupied(late)*2,'late material must break up, not only uniformly fade');
  assert.ok(late.light.every(c=>c===0));assert.ok(occupied(late)>0);
  at(plan.timing.end);at(.1);assert.deepEqual(at(plan.timing.arrival+.35),late);
  assert.equal(occupied(at(plan.timing.end)),0);
  assert.equal(plan.timing.emissionEnd,plan.timing.arrival+.08);
 }
});
