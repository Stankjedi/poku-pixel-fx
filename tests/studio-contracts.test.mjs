import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,createRecipePack} from '../build/authoring/project.js';
import {EditHistory} from '../build/authoring/history.js';
import {PlaybackClock,integerViewport} from '../build/authoring/clock.js';
import {BudgetCache,CheckpointTimeline} from '../build/authoring/cache.js';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {createRecipeSpec} from '../build/authoring/recipes.js';
import {applyProjectEdits,finishProjectRGBA} from '../build/authoring/edits.js';
import {createFx,createFrame,clearFrame} from '../build/core/fx.js';
import {checkpointFountain} from '../build/examples/checkpoint-simulation.js';
import {chain} from '../build/core/chain.js';
import {renderProject} from '../build-tools/tools/lib/project-render.mjs';
import {observationsFromReview} from '../build/authoring/review.js';

test('portable projects round-trip and reject runtime objects, invalid seed and prototype keys',()=>{
  const p=createProject({id:'melee/tempered-crescent',kind:'recipe',seed:7,recipe:createRecipeSpec('thrown-blade'),notes:'검 회전'});
  assert.deepEqual(parseProject(serializeProject(p)),p);
  for(const input of [{id:'../escape'},{id:'a/b',seed:1.5},{id:'a/b',options:{n:NaN}},{id:'a/b',options:{array:new Uint8Array(2)}}])assert.throws(()=>createProject(input));
  assert.throws(()=>parseProject('{"id":"a/b","options":{"__proto__":{"admin":true}}}'));
  const pack=createRecipePack(p,[{time:.4,note:'고체 검 형태'}],['주형태를 먼저 검토한다']);
  assert.equal(pack.schema,'poku.recipe-pack/v1');assert(!('review' in pack));assert(!('approved' in pack));
});
test('history preserves semantic edits, trims old states, and clears redo after a new branch',()=>{
  const h=new EditHistory({edits:[]},2);h.commit({edits:[1]});h.commit({edits:[1,2]});h.commit({edits:[1,2,3]});
  assert.deepEqual(h.undo(),{edits:[1,2]});assert.deepEqual(h.undo(),{edits:[1]});assert.equal(h.canUndo,false);
  h.commit({edits:[9]});assert.equal(h.canRedo,false);const value=h.value;value.edits.push(10);assert.deepEqual(h.value,{edits:[9]});
});
test('existing intent and visual review records resolve to editable frame references without changing approvals',()=>{
  const record={viewed:{playback:false},observations:{meaning:{note:'Blade silhouette is lost at contact',frameRanges:[{from:24,to:30}],layer:'body',parameter:'width'},timing:'Watch the recovery'}};
  const observations=observationsFromReview(record);assert.equal(observations[0].frameRanges[0].from,24);assert.equal(observations[0].parameter,'width');assert.equal(observations[1].note,'Watch the recovery');assert.equal(record.viewed.playback,false);
});
test('visible host stalls preserve elapsed time and hidden tabs explicitly suspend',()=>{
  const clock=new PlaybackClock(10,true);clock.playing=true;clock.tick(0);clock.tick(500);assert.equal(clock.time,.5);
  clock.tick(1300);assert.equal(clock.time,1.3);clock.tick(9000,false);clock.tick(10000,true);assert.equal(clock.time,1.3);
  clock.tick(10100,true);assert.equal(clock.time,1.4000000000000001);
  assert.deepEqual(integerViewport(100,60,475,300),{scale:4,x:37,y:30,width:400,height:240,clipped:false});
  assert.equal(integerViewport(100,60,80,30).scale,1);assert.equal(integerViewport(100,60,80,30).clipped,true);
});
test('cache byte budget and targeted invalidation do not evict unrelated assets',()=>{
  const c=new BudgetCache(100);c.set('a',1,40,['frame']);c.set('b',2,40,['asset']);c.get('a');c.set('c',3,40,['frame']);
  assert.equal(c.get('b'),undefined);assert.equal(c.bytes,80);c.invalidate('frame');assert.equal(c.bytes,0);
  c.set('oversize',4,101);assert.equal(c.size,0);
});
test('checkpoint restore includes simulation state, RNG and fractional presentation remainder',()=>{
  const a=createFx(checkpointFountain,{seed:19}),b=createFx(checkpointFountain,{seed:19});
  a.update(.517);const state=a.capture();a.update(.843);const f=createFrame(128,128);a.options.x=64;a.options.y=112;a.draw(f);
  b.restore(state);b.options.x=64;b.options.y=112;b.update(.843);const g=createFrame(128,128);b.draw(g);
  assert.equal(a.tick,b.tick);assert.equal(a.t,b.t);assert.deepEqual(f.color,g.color);
  a.restore(state);a.update(.843);a.draw(clearFrame(f));assert.deepEqual(f.color,g.color);
  const legacy=createFx({meta:{duration:5},create(){let x=0;return{update(){x++;},draw(){void x;}};}});
  assert.equal(legacy.supportsCheckpoint,false);assert.throws(()=>legacy.capture());
});
test('checkpoint authoring seeks reproduce a fresh simulation without cloning arbitrary closures',async()=>{
  const p=createProject({id:'examples/checkpoint-fountain',seed:21,fps:30,bg:'none'}),a=await createProjectRuntime(p,checkpointFountain),b=await createProjectRuntime(p,checkpointFountain);
  for(const time of [0,1,2,3])a.render(time,Math.round(time*30),false);
  const fromCheckpoint=a.render(1.2,36,false).frame.color.slice(),fresh=b.render(1.2,36,false).frame.color;
  assert.deepEqual(fromCheckpoint,fresh);assert.equal(a.seekStats.mode,'checkpoint');assert(a.seekStats.bytes<=8*1024*1024);
  a.dispose();b.dispose();
});
test('finishing edits keep simulation checkpoints, while physics edits require a new runtime',async()=>{
  const p=createProject({id:'examples/checkpoint-fountain',seed:21,fps:30,bg:'none'}),runtime=await createProjectRuntime(p,checkpointFountain);
  runtime.render(2,60);const before=runtime.seekStats.checkpoints;
  const next={...p,edits:[{frame:60,x:64,y:64,color:0xff112233}],notes:'Preserve the simulated state',renderProfile:{mode:'cinematic',cinematic:{bloom:false}}};
  assert.equal(runtime.tryUpdateProject(next),true);assert.equal(runtime.seekStats.checkpoints,before);assert.equal(runtime.cache.bytes,0);
  assert.equal(runtime.render(2,60).frame.color[8256],0xff112233);assert.equal(runtime.tryUpdateProject({...next,seed:22}),false);runtime.dispose();
});
test('generic checkpoint timeline restores the nearest retained complete state',()=>{
  let state={x:0,seed:2};const sim={step(){state.x+=state.seed;state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;},capture:()=>({...state}),restore:s=>{state={...s};}};
  const timeline=new CheckpointTimeline(sim,10,10,4);timeline.seek(3);const result=timeline.seek(1.2);assert.equal(result.replayedTicks,2);
  const actual={...state};state={x:0,seed:2};for(let i=0;i<12;i++)sim.step();assert.deepEqual(actual,state);
});
test('conservative cue culling skips only rasterization, preserving simulation and optical halo',()=>{
  let draws=0,updates=0;const mod={meta:{duration:4},create(){return{update(){updates++;},draw(p){draws++;p.px(0,0,0xffffffff);}};}};
  const composed=chain([{fx:mod,x:200,cullBounds:{x:-1,y:-1,width:2,height:2},cullHalo:3}])({seed:1});
  composed.update(.1);const frame=createFrame(20,20);composed.draw({frame,tx:0,ty:0,fx:1,cs:1,sn:0,fade:1,lightK:1});
  assert.equal(draws,0);assert.equal(updates,12);
  const visible=chain([{fx:mod,x:21,cullBounds:{x:-1,y:-1,width:2,height:2},cullHalo:3}])({seed:1});visible.draw({frame,tx:0,ty:0,fx:1,cs:1,sn:0,fade:1,lightK:1});assert.equal(draws,1);
});
test('native pixel edits honor output frame indices even during a frozen effect time',()=>{
  const f=createFrame(3,2);const edits=[{frame:3,x:1,y:1,color:0xff332211},{frame:'all',x:0,y:0,color:0xffeeddcc,mask:'solidSubject'}];
  applyProjectEdits(f,edits,.5,30,2);assert.equal(f.color[4],0);applyProjectEdits(f,edits,.5,30,3);assert.equal(f.color[4],0xff332211);assert.equal(f.semanticMasks.solidSubject[0],1);
});
test('final palette lock is applied after compositing and preserves coverage',()=>{
  const p=createProject({id:'examples/palette',pixelStyle:{finalColorPolicy:'palette-locked',palette:[0xff000000,0xffffffff]}}),rgba=new Uint8ClampedArray([220,240,200,128,20,50,40,220]);
  finishProjectRGBA(rgba,p);assert.deepEqual([...rgba],[255,255,255,128,0,0,0,220]);
});
test('Studio and CLI share recipe frames, margin, edits, seed and composition',async()=>{
  const project=createProject({id:'melee/tempered-crescent',kind:'recipe',recipe:createRecipeSpec('thrown-blade'),seed:13,fps:12,seconds:.5,bg:'light',margin:3,actor:false,
    edits:[{frame:3,x:9,y:11,color:0xff00ffff}],renderProfile:{mode:'cinematic',cinematic:{bloom:false,toneMap:'none',exposure:1}}});
  const runtime=await createProjectRuntime(project),{sequence}=await renderProject(project,{layers:true});assert.equal(runtime.frameCount,sequence.n);assert.equal(runtime.width,sequence.w);assert.deepEqual(runtime.origin,sequence.pivot);
  let i=0;for(const frame of sequence.frames){const current=runtime.render(i/project.fps,i,false);assert.deepEqual(current.rgba,frame.color,`frame ${i}`);i++;}runtime.dispose();
});
test('ACT Studio and CLI have the same windup, hit-stop and natural completion frame count',async()=>{
  const project=createProject({id:'melee/sword-slash',kind:'act',fps:12,bg:'none',actor:false,target:false,cameraMotion:0});
  const runtime=await createProjectRuntime(project),{sequence}=await renderProject(project,{layers:true});assert.equal(runtime.frameCount,sequence.n);assert.deepEqual(runtime.origin,sequence.pivot);
  let i=0;for(const frame of sequence.frames){const current=runtime.render(i/project.fps,i,false);assert(Math.abs(current.time-frame.t)<1e-9);assert.deepEqual(current.rgba,frame.color,`ACT ${i}`);i++;}runtime.dispose();
});
