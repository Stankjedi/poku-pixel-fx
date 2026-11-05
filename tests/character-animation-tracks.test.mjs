import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpriteClip2D} from '../build/core/sprite-clip.js';
import {compileHumanPoseClip2D} from '../build/core/character-animation.js';
import {createCharacterAsset2D,createCharacterPlayer2D,serializeCharacterAsset2D,parseCharacterAsset2D} from '../build/core/character-asset.js';
import {createSynchronizedLanternling2D} from '../build/examples/character-studio.js';

const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const rasterClip=(durations,colors=durations.map((_,i)=>0xff102030+i))=>({version:1,width:1,height:1,pivot:[0,0],frames:durations.map((durationMs,i)=>({durationMs,runs:[1,colors[i]]}))});
const spriteAsset=(clip,clips={play:{kind:'sprite',options:{loop:true}}},layers=[])=>createCharacterAsset2D({
  schema:'poku.character/v1',id:'animation-study',name:'Animation Study',nativeHeight:16,
  source:{kind:'sprite',clip},defaultClip:Object.keys(clips)[0],clips,layers,
});
const humanAsset=clips=>createCharacterAsset2D({
  schema:'poku.character/v1',id:'pose-study',name:'Pose Study',nativeHeight:64,
  source:{kind:'human',style:{view:'side',facing:'right'}},defaultClip:Object.keys(clips)[0],clips,
});

test('sprite tag views retain immutable native data and exact normalized endpoint selection',()=>{
  const source=rasterClip([100,200,50,150]);
  source.tags=[{name:'reverse',from:1,to:3,direction:'reverse'},{name:'bounce',from:1,to:3,direction:'pingpong_reverse'}];
  source.frames[2].sockets={tip:{x:3,y:2}};source.frames[2].emission=[2,1,0];
  const base=createSpriteClip2D(source,{loop:true}),reverse=base.withOptions({tag:'reverse',loop:false});
  assert.equal(base.duration,.5);assert.equal(reverse.duration,.4);
  assert.deepEqual([0,.374,.375,.5,1].map(p=>reverse.frameAtPhase(p)),[3,3,2,1,1]);
  assert.equal(reverse.frameAt(reverse.duration),-1);
  source.tags[0].direction='forward';source.tags[0].from=0;source.frames[2].runs[1]=0;
  source.frames[2].sockets.tip.x=999;source.frames[2].emission[0]=999;
  const again=base.withOptions({tag:'reverse'});
  assert.equal(again.frameAtPhase(0),3);assert.equal(again.framePixels(2)[0],0xff102032);
  assert.equal(again.frameSockets(2).tip.x,3);almost(again.frameEmission(2)[0],2);
  const copy=again.framePixels(2);copy.fill(0);assert.equal(reverse.framePixels(2)[0],0xff102032);
  const full=reverse.withOptions({tag:undefined,loop:true});assert.equal(full.duration,.5);assert.equal(full.frameAt(.5),0);
  const bounce=full.withOptions({tag:'bounce'});
  assert.deepEqual([.01,.16,.21,.41].map(t=>bounce.frameAt(t)),[3,2,1,2]);
  assert.equal(bounce.frameAtPhase(1),2);
  for(const phase of [-.01,1.01,NaN,Infinity])assert.equal(base.frameAtPhase(phase),-1);
  assert.throws(()=>base.withOptions({tag:'missing'}),/tag/);
});

test('sparse pose channels interpolate between their own keys and hold independent switches',()=>{
  const definition={duration:1,keys:[
    {at:0,interpolation:'linear',pose:{x:0,leftHand:[-10,-40],rightHand:[12,-42],fists:true,leftElbow:1}},
    {at:.25,interpolation:'hold',pose:{gaze:.75,blink:true}},
    {at:.5,interpolation:'linear',pose:{x:10,leftHand:[20,-55],leftElbow:-1}},
    {at:.75,pose:{blink:false}},
    {at:1,pose:{x:20,leftHand:[30,-45],fists:false}},
  ]};
  const compiled=compileHumanPoseClip2D(definition),a=compiled.sample(.25).pose;
  almost(a.x,5);assert.deepEqual(a.leftHand,[5,-47.5]);assert.deepEqual(a.rightHand,[12,-42]);
  assert.equal(a.fists,true);assert.equal(a.leftElbow,1);assert.equal(a.blink,true);
  const b=compiled.sample(.75).pose;
  almost(b.x,15);assert.deepEqual(b.leftHand,[25,-50]);assert.deepEqual(b.rightHand,[12,-42]);
  assert.equal(b.gaze,.75);assert.equal(b.blink,false);assert.equal(b.leftElbow,-1);assert.equal(b.fists,true);
  assert.equal(compiled.sample(.1).pose.gaze,undefined,'an unauthored future gaze is not applied early');
  assert.equal(compiled.sample(1).pose.fists,false);
  definition.keys[0].pose.rightHand[0]=100;compiled.clip.keys[0].pose.rightHand[0]=200;
  b.rightHand[0]=300;assert.deepEqual(compiled.sample(.75).pose.rightHand,[12,-42]);
});

test('authored pose root displacement accumulates over loops and rejects invalid key data',()=>{
  const definition={duration:.8,loop:true,keys:[{at:0,pose:{}}],root:[{at:0,position:[2,1]},{at:.8,position:[10,3]}]};
  const clip=compileHumanPoseClip2D(definition);
  assert.deepEqual(clip.sample(0).rootMotion,[2,1]);assert.deepEqual(clip.sample(.8).rootMotion,[10,3]);
  assert.deepEqual(clip.sample(2.4).rootMotion,[26,7]);
  almost(clip.sample(1.2).rootMotion[0],14);
  for(const pose of [{x:NaN},{y:null},{leftHand:[1,Infinity]},{blink:1},{armsFront:'yes'}])
    assert.throws(()=>compileHumanPoseClip2D({duration:1,keys:[{at:0,pose}]}),/finite|boolean/);
  assert.throws(()=>compileHumanPoseClip2D({duration:1,keys:[{at:0,pose:{},interpolation:'catmull'}]}),/interpolation/);
  assert.throws(()=>compileHumanPoseClip2D({...definition,root:[{at:-1,position:[0,0]}]}),/zero/);
});

test('sparse face keys preserve gaze and blinking independently through rendering',()=>{
  const sparse=[{at:0,gaze:.8,blink:false},{at:.2,blink:true},{at:.4,blink:false},{at:.6,gaze:-.7}],
    expanded=[{at:0,gaze:.8,blink:false},{at:.2,gaze:.8,blink:true},{at:.4,gaze:.8,blink:false},{at:.6,gaze:-.7,blink:false}];
  const a=createCharacterPlayer2D(humanAsset({idle:{kind:'human',action:'idle',faceTrack:sparse}})),
    b=createCharacterPlayer2D(humanAsset({idle:{kind:'human',action:'idle',faceTrack:expanded}}));
  for(const time of [.1,.3,.5,.7,2.3]){
    const x=a.sample(time),y=b.sample(time);assert.deepEqual(x.actor.pixels,y.actor.pixels);assert.deepEqual(x.sockets,y.sockets);
  }
});

test('authored cel cadence resets at each nonintegral loop instead of drifting across cycles',()=>{
  const asset=humanAsset({run:{kind:'human',action:'run',fps:12,rootMotion:true,socketTracks:{head:{mode:'delta',keys:[{at:0,position:[0,0]},{at:.7,position:[4,0]}]}}}}),
    player=createCharacterPlayer2D(asset),start=player.sample(0),next=player.sample(1/12);
  for(const time of [.8,1.6,2.4,8]){
    const sample=player.sample(time);assert.equal(sample.frameIndex,0);assert.equal(sample.phaseTime,0);assert.equal(sample.cycle,Math.round(time/.8));assert.deepEqual(sample.actor.pixels,start.actor.pixels);assert.deepEqual(sample.sockets.head,start.sockets.head);assert.ok(sample.rootMotion[0]>0);
    const held=player.sample(time+.09);assert.equal(held.frameIndex,1);almost(held.phaseTime,1/12);assert.deepEqual(held.actor.pixels,next.actor.pixels);assert.deepEqual(held.sockets.head,next.sockets.head);
  }
});

test('one-shot endpoints remain exact with a held cel cadence',()=>{
  const data=rasterClip([120,130]),sprite=createCharacterPlayer2D(spriteAsset(data,{play:{kind:'sprite',fps:6}}));
  assert.ok(sprite.sample(.249).actor.pixels.some(Boolean));
  assert.equal(sprite.sample(.25).frameIndex,-1);assert.ok(sprite.sample(.25).actor.pixels.every(c=>c===0));
  const asset=humanAsset({pose:{kind:'key-pose',fps:6,poses:{duration:.3,keys:[{at:0,pose:{lean:0}},{at:.3,pose:{lean:8}}],root:[{at:0,position:[0,0]},{at:.3,position:[12,0]}]}}}),player=createCharacterPlayer2D(asset);
  assert.deepEqual(player.sample(.3).rootMotion,[12,0]);assert.deepEqual(player.sample(1).actor.pixels,player.sample(.3).actor.pixels);
  const terminal=createCharacterPlayer2D(humanAsset({move:{kind:'key-pose',poses:{duration:.2,keys:[{at:0,interpolation:'hold',pose:{x:0}},{at:.2,pose:{x:80}}]}}}));
  const bounds=terminal.boundsForClip('move',4),last=terminal.sample(.2).bounds;
  assert.ok(bounds.x0<=last.x0&&bounds.x1>=last.x1&&bounds.y0<=last.y0&&bounds.y1>=last.y1,'export envelope includes a final strong pose beyond every earlier cel');
});

test('phase-bound gear retimes tags with shared color, emission and socket cels',()=>{
  const gear=rasterClip([100,20,60,20]);gear.tags=[{name:'rest',from:0,to:0},{name:'pulse',from:1,to:3,direction:'pingpong'}];
  gear.frames.forEach((f,i)=>{f.sockets={'lamp.tip':{x:i,y:0}};f.emission=[i,0,0];});
  const asset=spriteAsset(rasterClip([800]),undefined,[{id:'lamp',clip:gear,options:{tag:'rest'},socket:'root',offset:[2,0],semantic:'lamp',animations:{play:{tag:'pulse',sync:'phase'}}}]),
    player=createCharacterPlayer2D(parseCharacterAsset2D(serializeCharacterAsset2D(asset)));
  for(const [time,frame]of [[0,1],[.11,2],[.41,3],[.51,2],[.79,2],[.8,1],[1.21,3]]){
    const sample=player.sample(time),s=sample.actor,index=(0-s.y)*s.w+2-s.x;
    assert.equal(sample.layerFrames.lamp,frame,`time ${time}`);assert.equal(s.pixels[index],gear.frames[frame].runs[1]);
    assert.deepEqual(sample.sockets['lamp.tip'].position,[frame+2,0]);almost(sample.emission[index*3],frame);
  }
  assert.equal(asset.layers[0].options.tag,'rest','per-clip bindings do not rewrite inventory/default selection');
});

test('phase-bound accessories hold their final cel at a settled non-looping human pose',()=>{
  const gear=rasterClip([100,100,100]),base=humanAsset({pose:{kind:'key-pose',poses:{duration:1,keys:[{at:0,pose:{}}]}}});
  const player=createCharacterPlayer2D({...base,layers:[{id:'badge',clip:gear,socket:'chest',semantic:'badge',animations:{pose:{sync:'phase'}}}]});
  assert.equal(player.sample(0).layerFrames.badge,0);assert.equal(player.sample(.5).layerFrames.badge,1);
  assert.equal(player.sample(1).layerFrames.badge,2);assert.equal(player.sample(2).layerFrames.badge,2);
});

test('source-frame equipment follows original reverse/pingpong body cels despite different gear timing',()=>{
  const body=rasterClip([100,200,50,150]),gear=rasterClip([10,10,10,10]);
  body.tags=[{name:'return',from:1,to:3,direction:'pingpong_reverse'}];
  gear.frames.forEach((f,i)=>{f.sockets={'armor.tip':{x:i,y:1}};});
  const player=createCharacterPlayer2D(spriteAsset(body,{play:{kind:'sprite',options:{tag:'return',loop:true}}},[
    {id:'armor',clip:gear,options:{loop:false},socket:'root',offset:[2,0],semantic:'armor',animations:{play:{sync:'source-frame'}}},
  ]));
  for(const [time,index]of [[0,3],[.15,2],[.2,1],[.4,2],[.45,3],[.65,1]]){
    const sample=player.sample(time);assert.equal(sample.frameIndex,index);assert.equal(sample.layerFrames.armor,index);assert.deepEqual(sample.sockets['armor.tip'].position,[index+2,1]);
  }
});

test('tag-only body overrides inherit loop and emission policy consistently with metadata',()=>{
  const data=rasterClip([100,100,100]);data.tags=[{name:'rest',from:0,to:0},{name:'move',from:1,to:2}];
  data.frames[1].emission=[2,0,0];
  const base=spriteAsset(data,{rest:{kind:'sprite',options:{tag:'rest'}},move:{kind:'sprite',options:{tag:'move'}}});
  const player=createCharacterPlayer2D({...base,source:{...base.source,options:{loop:true,emissionKind:'surface'}}});
  assert.equal(player.clipInfo('move').loop,true);
  for(const time of [0,.2,.4,.6]){const sample=player.sample(time,'move');assert.equal(sample.frameIndex,1);assert.equal(sample.actor.pixels[0],data.frames[1].runs[1]);almost(sample.emission[0],2);}
  const oneShot=createCharacterPlayer2D({...player.asset,clips:{...player.asset.clips,move:{kind:'sprite',options:{tag:'move',loop:false}}}});
  assert.equal(oneShot.clipInfo('move').loop,false);assert.equal(oneShot.sample(.2,'move').frameIndex,-1);
  const full=createCharacterPlayer2D(spriteAsset(data));
  for(const time of [.3,.6,.9,1.2])assert.equal(full.sample(time).frameIndex,0,'stable .3-second loop must not be undone by cumulative-time reconstruction');
});

test('unbound layers retain independent time and invalid synchronization fails when loading',()=>{
  const body=rasterClip([800]),gear=rasterClip([100,100]);
  const asset=spriteAsset(body,undefined,[{id:'glint',clip:gear,semantic:'glint'}]);
  const player=createCharacterPlayer2D(asset);
  for(const time of [0,.1,.2,.31])assert.equal(player.sample(time).layerFrames.glint,createSpriteClip2D(gear,{loop:true}).frameAt(time));
  for(const animations of [{missing:{sync:'phase'}},{play:{sync:'bad'}},{play:{tag:'missing'}},{play:{sync:'source-frame'}}])
    assert.throws(()=>createCharacterAsset2D({...asset,layers:[{...asset.layers[0],animations}]}),/clip|mode|tag|frame/);
  const matching=spriteAsset(rasterClip([100,100]),undefined,[{id:'gear',clip:gear,semantic:'gear',animations:{play:{sync:'source-frame'}}}]);
  assert.throws(()=>createCharacterAsset2D({...matching,layers:[{...matching.layers[0],animations:{play:{sync:'source-frame',tag:'any'}}}]}),/tag/);
});

test('synchronized lantern example survives save/reload with matching equipment frames',()=>{
  const asset=parseCharacterAsset2D(serializeCharacterAsset2D(createSynchronizedLanternling2D())),player=createCharacterPlayer2D(asset);
  for(const name of player.clips)for(const time of [0,.13,.33,.5,1.2]){
    const sample=player.sample(time,name);assert.equal(sample.layerFrames.crest,sample.frameIndex);assert.ok(sample.actor.pixels.some(Boolean));
  }
});
