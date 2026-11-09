import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {createProject} from '../build/authoring/project.js';
import {createSequenceSpec,createSequenceEffect} from '../build/authoring/sequence.js';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
function adjacent(x,d){const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,x);v.setBigUint64(0,v.getBigUint64(0)+BigInt(d));return v.getFloat64(0);}
function snap(s){return {color:s.frame.color.slice(),light:s.frame.light.slice(),hdr:s.frame.hdrLight.slice(),rgba:s.rgba.slice(),time:s.time,frameIndex:s.frameIndex,sockets:s.sockets,frozen:s.frozen,shake:s.shake};}
async function fixture(parent=false){
 const original=createGeneratedEffect2D(createGenerationPlan2D({material:'lightning',action:'strike',seed:1})),at=parent?.123:0;
 const sequence=createSequenceSpec({size:original.meta.size,origin:original.meta.origin,cues:[{id:'strike',at,seed:1,source:{kind:'generation',intent:{material:'lightning',action:'strike'}}}]});
 const mod=parent?await createSequenceEffect(sequence):original;
 const project=createProject({id:'test/cache',kind:'sequence',sequence,bg:'none',seed:1,options:{light:1}});
 return {at,make:()=>createProjectRuntime(project,mod)};
}
for(const parent of [false,true])test(`exact generated event cache identity, both seek histories: ${parent?'parent':'source'}`,async()=>{
 const {at,make}=await fixture(parent);
 for(const local of [.23,.41])for(const d of [-1,1]){
  const event=at+local,near=adjacent(event,d);
  for(const [first,last]of [[near,event],[event,near]]){
   const rt=await make(),oracle=await make();rt.render(first);const actual=rt.render(last);
   assert.equal(actual.cached,false,'different finite time must miss even inside same frame');
   assert.deepEqual(snap(actual),snap(oracle.render(last,undefined,false)));
   const expected=snap(actual);assert.equal(rt.render(last).cached,true);assert.deepEqual(snap(rt.render(last)),expected);
   assert.equal(actual.time,last);
  }
 }
});
test('ordinary frames, preceding-frame onion sampling and repeated hits preserve oracle',async()=>{
 const {make}=await fixture(true),rt=await make(),oracle=await make();
 for(const i of [0,1,7,13,24,5,7,13,24]){
  if(i)rt.render((i-1)/30,i-1);
  const actual=snap(rt.render(i/30,i));assert.deepEqual(actual,snap(oracle.render(i/30,i,false)));
  assert.equal(rt.render(i/30,i).cached,true);assert.deepEqual(snap(rt.render(i/30,i)),actual);
 }
});
test('finish, purpose and explicit frame index remain independent cache identities',async()=>{
 const {make}=await fixture(),rt=await make();
 for(const finish of [false,true])for(const purpose of ['preview','asset'])for(const index of [7,8]){
  const s=rt.render(.233,index,true,finish,purpose);assert.equal(s.cached,false);const expected=snap(s);
  assert.equal(rt.render(.233,index,true,finish,purpose).cached,true);assert.deepEqual(snap(rt.render(.233,index,true,finish,purpose)),expected);
 }
 assert.equal(rt.cache.size,8);
});
test('distinct time entries stay within existing byte cap and evict old frames',async()=>{
 const {make}=await fixture(),rt=await make();
 const t=.233;rt.render(t);const bytes=rt.cache.bytes;assert.ok(bytes>0);
 const n=Math.floor(rt.cache.maxBytes/bytes)+2;
 for(let i=1;i<=n;i++){rt.render(t+i*1e-10);assert.ok(rt.cache.bytes<=16*1024*1024);}
 assert.ok(rt.cache.size<n);assert.equal(rt.render(t).cached,false);
 assert.equal(rt.render(t).cached,true);
});
