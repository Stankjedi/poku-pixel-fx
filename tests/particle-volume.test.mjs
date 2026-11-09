// Rendering contracts only. Pixel tests do not certify material readability or user approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createParticleVolume2D,createFrame,Painter,hex} from '../build/core/index.js';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
import {meaningTemplate} from '../build-tools/tools/lib/meaning-template.mjs';
const palette=['#fff1ac','#ffb238','#f76a19','#b93316','#57151b'];
const q={id:17,x:0,y:0,vx:15,vy:-24,size:10,alpha:.8,progress:.3,age:.2};
function render(volume,patch={}) {
 const f=createFrame(96,96);volume.draw(new Painter(f).place(48,48),{...q,...patch});return f;
}
function draw(module,impl,t) {
 const f=createFrame(...module.meta.size),p=new Painter(f).place(...module.meta.origin);
 impl.drawBack?.(p,t);impl.draw(p,t);return f;
}
const visible=f=>f.color.some(c=>c>>>24);
const bounds=f=>{const xy=[];for(let i=0;i<f.color.length;i++)if(f.color[i]>>>24)xy.push([i%f.w,Math.floor(i/f.w)]);return xy};

test('finite particle matter is seeded, seekable and independent of velocity magnitude',()=>{
 for(const profile of ['fire','energy']){
  const a=createParticleVolume2D({seed:218,profile,palette}),b=createParticleVolume2D({seed:218,profile,palette});
  const expected=render(a);assert.ok(visible(expected));assert.deepEqual(render(b),expected);
  render(a,{id:8191,age:.8,progress:.8});render(a,{age:.01,progress:.01});assert.deepEqual(render(a),expected);
  assert.deepEqual(render(a,{vx:q.vx*100,vy:q.vy*100}),expected,'speed does not turn matter into a history-length stripe');
  assert.notDeepEqual(render(a,{id:18}).color,expected.color);
  assert.notDeepEqual(render(a,{vx:24,vy:15}).color,expected.color);
  assert.notDeepEqual(render(a,{age:.6}).color,expected.color);
  assert.notDeepEqual(render(createParticleVolume2D({seed:219,profile,palette})).color,expected.color);
  for(const [x,y] of bounds(expected))assert.ok(Math.hypot(x-48,y-48)<q.size*2.5);
  assert.ok(expected.light.every(c=>c===0));
 }
});

test('palette, alpha, finite shader output and optional lighting stay explicit',()=>{
 for(const profile of ['fire','energy']){
  const colors=[...palette],options={seed:1,profile,palette:colors},v=createParticleVolume2D(options),expected=render(v);
  colors.fill('#000');options.profile='fire';options.seed=999;assert.deepEqual(render(v),expected);
  const transparent=createParticleVolume2D({profile,palette:[0x00112233]});assert.ok(!visible(render(transparent)));
  for(const patch of [{alpha:0},{size:0},{progress:1}])assert.ok(!visible(render(v,patch)));
  const late=render(v,{progress:.98});assert.ok(bounds(late).length<bounds(expected).length);
  const lit=createParticleVolume2D({profile,palette,emission:.1});assert.ok(render(lit).light.some(Boolean));
  const allowed=new Set(palette.map(c=>hex(c)&0xffffff));
  let cells=0;
  v.draw({shade(x0,y0,x1,y1,shader){for(let y=Math.floor(y0);y<=y1;y++)for(let x=Math.floor(x0);x<=x1;x++){
   const out={c:0,a:1};shader(x,y,out);if(!out.c)continue;cells++;
   assert.ok(allowed.has(out.c&0xffffff));assert.ok(Number.isFinite(out.a)&&out.a>=0&&out.a<=q.alpha);
  }},glow(){assert.fail('unrequested light');}},q);
  assert.ok(cells>0);
 }
 assert.notDeepEqual(render(createParticleVolume2D({profile:'fire',palette})).color,
  render(createParticleVolume2D({profile:'energy',palette})).color);
});

test('particle matter rejects malformed or unbounded samples before drawing',()=>{
 const base={profile:'fire',palette};
 for(const options of [null,[],4,{...base,seed:-1},{...base,seed:2**32},{...base,profile:'ice'},
  {...base,palette:[]},{...base,palette:new Array(2)},{...base,palette:['bad']},{...base,palette:[null]},
  {...base,emission:Infinity},{...base,emission:-1},{...base,lightRadius:0},{...base,lightRadius:257}])
  assert.throws(()=>createParticleVolume2D(options),RangeError);
 const v=createParticleVolume2D(base),p={shade(){assert.fail('validation must precede rendering')},glow(){assert.fail('invalid light')}};
 for(const patch of [{id:-1},{id:8192},{id:.5},{x:NaN},{vy:Infinity},{size:-1},{size:129},{alpha:2},
  {progress:-1},{progress:NaN},{age:-1},{age:3601},{age:1e308}])assert.throws(()=>v.draw(p,{...q,...patch}),RangeError);
});

test('volume generation preserves clock, direct-time replay, uint32 seeds and layer controls',()=>{
 for(const material of ['fire','energy'])for(const action of ['dash','plume'])for(const seed of [0,1,218,0x80000000,0xffffffff]){
  const plan=createGenerationPlan2D({material,action,seed}),m=createGeneratedEffect2D(plan,{composition:'volumes'}),i=m.create(m.meta.options);
  assert.deepEqual(m.events,plan.events);assert.equal(m.meta.duration,plan.timing.end);
  const expected=draw(m,i,.9);assert.ok(visible(expected));draw(m,i,1.5);draw(m,i,.1);assert.deepEqual(draw(m,i,.9),expected);
  for(const t of [0,m.meta.duration,m.meta.duration+1]){const f=draw(m,i,t);assert.ok(!visible(f));assert.ok(f.light.every(c=>c===0));}
  for(const t of [.15,.35,.55,.9,1.3,1.8]){const f=draw(m,i,t);for(const [x,y]of bounds(f))assert.ok(x>0&&x<f.w-1&&y>0&&y<f.h-1);}
  const off=m.create({...m.meta.options,layers:{body:false,trail:false,sparks:false,response:false,residue:false,light:false}});
  assert.ok(!visible(draw(m,off,.9)));assert.ok(draw(m,off,.9).light.every(c=>c===0));
  const layers={light:false},unlit=m.create({...m.meta.options,layers}),noLight=draw(m,unlit,.9);layers.light=true;
  assert.ok(noLight.light.every(c=>c===0));assert.deepEqual(draw(m,unlit,.9),noLight);
 }
});

test('primary ignition and plume anchoring remain authored; legacy calls remain exact',()=>{
 for(const material of ['fire','energy'])for(const action of ['dash','plume']){
  const plan=createGenerationPlan2D({material,action,seed:218});
  const modules=[createGeneratedEffect2D(plan),createGeneratedEffect2D(plan,{composition:'body'}),createGeneratedEffect2D(plan,{composition:'volumes'})];
  const instances=modules.map(m=>m.create({...m.meta.options,layers:{trail:false,sparks:false,light:false}}));
  for(const t of [.15,.35,.55,.9,1.3]){
   const frames=modules.map((m,j)=>draw(m,instances[j],t));assert.deepEqual(frames[0],frames[1]);
   if(action==='plume'||t<plan.timing.release)assert.deepEqual(frames[0],frames[2]);
  }
 }
 for(const intent of [{material:'ice',action:'shatter'},{material:'fire',action:'burst'},
  {material:'energy',action:'dash',response:'burst'}])
  assert.throws(()=>createGeneratedEffect2D(createGenerationPlan2D(intent),{composition:'volumes'}),RangeError);
 for(const options of [null,[],4,{composition:'bad'},{composition:'body',other:true}])
  assert.throws(()=>createGeneratedEffect2D(createGenerationPlan2D({material:'fire',action:'plume'}),options),RangeError);
});

test('new meaning templates explicitly select volumes only where supported',()=>{
 for(const material of ['fire','energy'])for(const action of ['dash','plume','burst']){
  const source=meaningTemplate('fresh','test',createGenerationPlan2D({material,action}),'2026-11-07T00:00:00Z');
  if(action==='burst')assert.doesNotMatch(source,/composition: "material-volumes"/);else assert.match(source,/composition: "material-volumes"/);
 }
 for(const intent of [{material:'ice',action:'shatter'},{material:'fire',action:'dash',response:'burst'}])
  assert.doesNotMatch(meaningTemplate('fresh','test',createGenerationPlan2D(intent)),/composition: "material-volumes"/);
});
