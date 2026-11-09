// Numeric contracts, not art certification or viewing evidence.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createChargeVolume2D,createFrame,Painter,PAL,hex} from '../build/core/index.js';
import {createGeneratedEffect2D,createGenerationPlan2D} from '../build/authoring/generation.js';
const palette=['#fff1ac','#ffb238','#f76a19','#b93316','#57151b'];
const state={time:.6,position:[0,0],size:[20,15],progress:.2,id:218};
const hash=f=>createHash('sha256').update(new Uint8Array(f.color.buffer)).update(new Uint8Array(f.light.buffer)).digest('hex');
const draw=(m,i,t)=>{const f=createFrame(...m.meta.size),p=new Painter(f).place(...m.meta.origin);i.drawBack?.(p,t);i.draw(p,t);return f};
const render=(v,patch={})=>{const f=createFrame(128,128);v.draw(new Painter(f).place(64,64),{...state,...patch});return f};
const count=f=>f.color.filter(c=>c>>>24).length;

test('charge clusters share a deterministic local spend law without path history or implicit light',()=>{
 const v=createChargeVolume2D({seed:17,palette}),expected=render(v);assert.ok(count(expected)>50);
 render(v,{time:2,id:8191});render(v,{time:.01});assert.deepEqual(render(v),expected);
 assert.deepEqual(render(createChargeVolume2D({seed:17,palette})),expected);
 for(const patch of[{id:219},{time:.7},{angle:Math.PI/2}])assert.notDeepEqual(render(v,patch),expected);
 assert.notDeepEqual(render(createChargeVolume2D({seed:18,palette})),expected);
 assert.ok(expected.light.every(c=>c===0));assert.equal(count(render(v,{progress:1})),0);assert.equal(count(render(v,{opacity:0})),0);
 assert.ok(count(render(v,{progress:.95}))<count(expected)/3);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(expected.color[y*128+x]>>>24)assert.ok(Math.abs(x-64)<=22&&Math.abs(y-64)<=17);
});

test('charge renderer snapshots palette and samples, and guards malformed finite inputs',()=>{
 const colors=[...palette],v=createChargeVolume2D({palette:colors}),expected=render(v);colors.fill('#000');assert.deepEqual(render(v),expected);
 const q=v.sample(state);q.lobes[0].x=900;q.position[0]=700;assert.deepEqual(render(v),expected);
 assert.equal(count(render(createChargeVolume2D({palette:[0x00112233]}))),0);
 for(const options of[null,[],4,{palette:[]},{palette:new Array(2)},{palette:['bad']},{palette,seed:-1},{palette,seed:2**32}])assert.throws(()=>createChargeVolume2D(options),RangeError);
 for(const patch of[{time:NaN},{time:3601},{position:[,0]},{position:new Array(2)},{size:[,20]},{size:[0,20]},
  {size:[129,20]},{id:8192},{id:-1},{progress:2},{opacity:Infinity},{angle:NaN}])assert.throws(()=>render(v,patch),RangeError);
 assert.throws(()=>v.sample(null),RangeError);
 const allowed=new Set(palette.map(hex));let cells=0;
 v.draw({shade(x0,y0,x1,y1,fn){for(let y=Math.floor(y0);y<=y1;y++)for(let x=Math.floor(x0);x<=x1;x++){const o={c:0,a:1};fn(x,y,o);if(o.c){cells++;assert.ok(allowed.has(o.c));assert.ok(Number.isFinite(o.a)&&o.a>=0&&o.a<=1);}}}},state);assert.ok(cells>0);
});

test('existing body and volumes outputs retain exact checkpoint hashes',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/charge-legacy-frame-hashes.json',import.meta.url)));
 const cache=new Map();for(const q of fixture.frames){const key=[q.material,q.action,q.composition,q.seed].join('/');
  if(!cache.has(key)){const m=createGeneratedEffect2D(createGenerationPlan2D({material:q.material,action:q.action,seed:q.seed}),{composition:q.composition});cache.set(key,[m,m.create(m.meta.options)]);}
  const[m,i]=cache.get(key);assert.equal(hash(draw(m,i,q.time)),q.sha256,key+' '+q.time);
 }
});

test('new material mode preserves fire and gives energy a distinct short-lived response',()=>{
 for(const action of['dash','plume'])for(const seed of[1,17,218,0x80000000,0xffffffff]){
  const make=(material,composition)=>{const m=createGeneratedEffect2D(createGenerationPlan2D({material,action,seed}),{composition});return[m,m.create({...m.meta.options,palette:PAL.ice,layers:{light:false}})];};
  const[f,fi]=make('fire','material-volumes'),[old,oi]=make('fire','volumes'),[e,ei]=make('energy','material-volumes');
  for(const t of[.15,.35,.55,.9,1.3,1.8])assert.deepEqual(draw(f,fi,t),draw(old,oi,t));
  assert.notDeepEqual(draw(f,fi,.9).color,draw(e,ei,.9).color);
  const frame=draw(e,ei,.9);draw(e,ei,1.5);draw(e,ei,.1);assert.deepEqual(draw(e,ei,.9),frame);
  assert.ok(frame.light.every(c=>c===0));assert.equal(count(draw(e,ei,e.meta.duration)),0);
  const end=e.events.find(q=>q.kind==='source-emission-end').at;
  assert.equal(count(draw(e,ei,end+.4)),0,'spent energy does not keep a fire-like residue');
 }
});

test('new energy mode has bounded supported travel, layer controls and unchanged event clocks',()=>{
 for(const action of['dash','plume'])for(const limits of action==='dash'?[{distance:24,travel:.25},{distance:160,travel:.25},{distance:24,travel:3},{distance:160,travel:3}]:[{}]){
  const plan=createGenerationPlan2D({material:'energy',action,seed:0xffffffff,...limits}),m=createGeneratedEffect2D(plan,{composition:'material-volumes'}),i=m.create(m.meta.options);
  assert.deepEqual(m.events,plan.events);assert.equal(m.meta.duration,plan.timing.end);
  for(let n=0;n<=Math.ceil(m.meta.duration*40);n++){const f=draw(m,i,n/40);for(let x=0;x<f.w;x++)for(const y of[0,f.h-1])assert.equal(f.color[y*f.w+x],0);for(let y=0;y<f.h;y++)for(const x of[0,f.w-1])assert.equal(f.color[y*f.w+x],0);}
  const layers={body:false,trail:false,sparks:false,response:false,residue:false,light:false},off=m.create({...m.meta.options,layers});layers.body=true;
  for(const t of[.15,.55,.9,plan.timing.sourceEmissionEnd+.1]){const f=draw(m,off,t);assert.equal(count(f),0);assert.ok(f.light.every(c=>c===0));}
 }
 for(const intent of[{material:'ice',action:'shatter'},{material:'energy',action:'burst'},{material:'energy',action:'dash',response:'burst'}])assert.throws(()=>createGeneratedEffect2D(createGenerationPlan2D(intent),{composition:'material-volumes'}),RangeError);
});
