import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createActorAdapter2D, actorEffectOffset2D, createAct, createFrame, clearFrame, enableHDRLight,
  renderHuman2D, renderHumanPortrait2D, effectExampleCode2D, actBounds } from '../build/core/index.js';
import * as slash from '../build/fx/melee/sword-slash.js';
import * as burning from '../build/fx/status/burning.js';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';

test('reused character scratch and discrete portrait cache never expose mutable shared output',()=>{
  const a=renderHuman2D({height:96}),pixels=a.pixels.slice();
  renderHuman2D({height:96},{lean:4,rightHand:[20,-60]});
  assert.deepEqual(a.pixels,pixels);
  const p=renderHumanPortrait2D({resolution:96},{time:1.57});
  const pristine=p.pixels.slice();p.pixels.fill(0);p.eyeMask.fill(0);p.eyeAnchors[0][0]=-999;
  const again=renderHumanPortrait2D({resolution:96},{time:1.6});
  assert.deepEqual(again.pixels,pristine);assert(again.eyeMask.some(Boolean));assert(again.eyeAnchors[0][0]>0);
});

test('Human and Creature adapters keep native masks, attachment landmarks and old samples',()=>{
  for(const selection of [{kind:'human',height:96,weapon:'sword'},{kind:'creature',species:'cat',height:64,motion:'walk'}]){
    const adapter=createActorAdapter2D(selection),sample=adapter.sample(.2,{weapon:'sword',fx:16,fy:-26});
    assert.equal(sample.actor.renderSource,'pixels');assert.equal(sample.actor.mask.data.length,sample.actor.w*sample.actor.h);
    for(let i=0;i<sample.actor.pixels.length;i++)assert.equal(sample.actor.mask.data[i],sample.actor.pixels[i]?1:0);
    for(const point of Object.values(sample.anchors))assert(point.every(Number.isFinite));
    const old=sample.actor.pixels.slice();adapter.sample(.8,{fx:-12,fy:-30});assert.deepEqual(sample.actor.pixels,old);
    assert.deepEqual(actorEffectOffset2D(sample,{},true,selection),[0,0]);
  }
});

test('selected actors attach to slash/status ACT and stay invariant under world/frame translation',()=>{
  for(const mod of[slash,burning])for(const selection of[{kind:'human',height:64,weapon:'auto'},{kind:'creature',species:'cat',height:48,motion:'idle'}]){
    const a=createAct(mod,{x:150,y:160,seed:17,actorSelection:selection}),b=createAct(mod,{x:173,y:171,seed:17,actorSelection:selection});
    a.update(.8);b.update(.8);
    const fa=createFrame(350,240),fb=createFrame(350,240,23,11);enableHDRLight(fa);enableHDRLight(fb);
    a.draw(clearFrame(fa));b.draw(clearFrame(fb));
    assert.deepEqual(fa.color,fb.color);assert.deepEqual(fa.light,fb.light);assert.deepEqual(fa.hdrLight,fb.hdrLight);
    assert(fa.color.some(c=>c>>>24));
    const bounds=actBounds(mod,{actorSelection:selection});assert(bounds.y0<=-selection.height);
  }
});

test('copied gallery examples are complete valid JavaScript with exact selection and per-frame clearing',()=>{
  const code=effectExampleCode2D({id:'melee/sword-slash',width:160,height:120,x:50,y:100,
    options:{seed:73,palette:['#012345','#fedcba'],actorSelection:{kind:'human',height:64}},flip:true,acted:false,actor:false,background:'none',speed:.5});
  assert.doesNotThrow(()=>new Function(code.replace(/^import .*;$/gm,'')));
  assert(code.includes('clearFrame(frame)'));assert(code.includes('"seed": 73'));assert(!code.includes('…'));
  assert(code.includes('"#012345"'));assert(!code.includes('createAct'));assert(!code.includes('if (effect.meta.actor)'));
  const frames=[];let buffer;
  const context={createImageData(w,h){buffer=new Uint8ClampedArray(w*h*4);return{data:buffer};},clearRect(){},putImageData(){frames.push(buffer.slice());}};
  const imports=awaitableImports;
  const run=new Function(...Object.keys(imports),'document','performance','matchMedia','requestAnimationFrame','effect',code.replace(/^import .*;$/gm,''));
  let next;
  run(...Object.values(imports),{createElement(){return{style:{},getContext(){return context;}};},body:{append(){}}},{now:()=>0},()=>({matches:true}),fn=>{next=fn;},slash);
  next(16);next(32);assert.equal(frames.length,2);assert(frames[1].some(Boolean));
});
import { createFx, composite, backdrop, drawActor, painterFor, stockActor, actorAlphaOf, sceneCameraOffset } from '../build/core/index.js';
const awaitableImports={createFrame,clearFrame,createFx,composite,backdrop,drawActor,painterFor,stockActor,actorAlphaOf,sceneCameraOffset};

test('browser PNG download preserves low-alpha RGB and transparent hidden RGB exactly',async()=>{
  const bundled=await build({entryPoints:['gallery/png.ts'],bundle:true,format:'esm',write:false,platform:'node'});
  const {encodeRGBAPNG,copyAtlasFrame}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
  const source=Uint8Array.from([255,64,32,128,113,113,123,3,84,32,16,0,1,2,3,255]);
  const atlas=new Uint8Array(4*2*4);copyAtlasFrame(atlas,4,source,2,2,1,0);
  const blob=await encodeRGBAPNG(4,2,atlas),decoded=decodePNG(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(new Uint8Array(decoded.rgba),atlas);
});
