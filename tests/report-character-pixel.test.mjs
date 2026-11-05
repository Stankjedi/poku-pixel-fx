import test from 'node:test';
import assert from 'node:assert/strict';
import {Painter} from '../build/core/painter.js';
import {hex} from '../build/core/color.js';
import {renderHuman2D,drawHuman2D,humanPalettes2D} from '../build/core/human.js';
import {renderCreature2D,drawCreature2D} from '../build/core/creature.js';
import {renderHumanPortrait2D,drawHumanPortrait2D} from '../build/core/human-portrait.js';
import {renderHumanWeapon2D,drawHumanWeapon2D} from '../build/core/human-weapon.js';
import {createSpriteClip2D} from '../build/core/sprite-clip.js';
import {createActorAdapter2D} from '../build/core/actor-adapter.js';
import {createCharacterAsset2D,createStudioCharacter2D,createCharacterPlayer2D,serializeCharacterAsset2D,parseCharacterAsset2D,editCharacterCel2D,paintCharacterSemanticMask2D,equipCharacter2D,bakeCharacterFootPlant2D} from '../build/core/character-asset.js';
import {renderCharacterPortrait2D} from '../build/core/character-identity.js';
import {HUMAN_ANIMATIONS_2D,createCharacterEventCursor2D,connectCharacterEvents2D,bakeSecondaryMotion2D,solveFootPlant2D} from '../build/core/character-animation.js';
import {createSerpentRig2D,compileCreatureRig2D} from '../build/core/creature-asset.js';
import {pixelTransform2D,composePixelTransform2D,transformPixelPoint2D,invertPixelTransform2D,transformSprite2D} from '../build/core/sprite-raster.js';
import {indexSprite2D,renderIndexedSprite2D,swapIndexedPalette2D,ditherSprite2D,selectiveOutline2D,compileAuthoredPixelTrack2D,diagnosePixelSprite2D,diagnosePixelMotion2D,applyOpticalCorrection2D} from '../build/core/pixel-tools.js';
import {createPixelStyleProfile2D,compilePixelStyle2D,serializePixelStyle2D,parsePixelStyle2D} from '../build/core/pixel-style.js';
import {createMaterialChannels2D,createMaterialShader2D,textureMaterial2D,paintMaterialChannel2D} from '../build/core/material-surface.js';
import {createLanternlingCharacter2D,createCharacterReferencePack2D} from '../build/examples/character-studio.js';
import {createPixelToolkitStudies2D} from '../build/examples/pixel-toolkit.js';

const frame=(w,h)=>({w,h,ox:0,oy:0,color:new Uint32Array(w*h),light:new Uint32Array(w*h)});
const raster=(w,h,values,x=0,y=0)=>({x,y,w,h,pixels:Uint32Array.from(values),mask:{w,h,data:Uint8Array.from(values,c=>c>>>24?1:0)}});
const count=a=>a.reduce((n,c)=>n+(c?1:0),0);
const almost=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('P01 direct human, creature, portrait and weapon helpers match an independent inverse-cell oracle',()=>{
  const style={height:96,view:'three-quarter'};
  const cases=[
    [renderHuman2D(style),p=>drawHuman2D(p,style)],
    [renderCreature2D({species:'cat',size:96},'idle',0),p=>drawCreature2D(p,{species:'cat',size:96},'idle',0)],
    [renderHumanPortrait2D({resolution:96}),p=>drawHumanPortrait2D(p,{resolution:96})],
    [renderHumanWeapon2D('sword',0,style).actor,p=>drawHumanWeapon2D(p,'sword',0,style)],
  ];
  for(const [source,draw] of cases)for(const flip of [false,true]){
    const f=frame(384,384),p=new Painter(f).place(192,230,flip,Math.PI/4),expected=new Uint32Array(f.color.length);draw(p);
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const sx=Math.floor(p.fromX(x+.5,y+.5)-(source.x??0)),sy=Math.floor(p.fromY(x+.5,y+.5)-(source.y??0));
      if(sx>=0&&sy>=0&&sx<source.w&&sy<source.h&&source.mask.data[sy*source.w+sx])expected[y*f.w+x]=source.pixels[sy*source.w+sx];
    }
    assert.deepEqual(f.color,expected);assert.ok(count(f.color)>500);
  }
});

test('C01 all shipped human animation modules are selectable through ActorAdapter without changing native height',()=>{
  const fingerprints=new Set();
  for(const motion of HUMAN_ANIMATIONS_2D){
    const adapter=createActorAdapter2D({kind:'human',height:64,style:{view:'side'},motion,weapon:'auto'}),sample=adapter.sample(.42);
    assert.ok(count(sample.actor.pixels)>100);assert.equal(sample.actor.k,64/19);assert.ok(sample.sockets['hand.grip']);fingerprints.add([...sample.actor.pixels].join(','));
  }
  assert.ok(fingerprints.size>=9);
  const moved=createActorAdapter2D({kind:'human',height:64,style:{view:'side'},motion:'run',rootMotion:true}).sample(.2);
  assert.ok(moved.rootMotion[0]>0);almost(moved.anchors.root[0],moved.rootMotion[0]);
});

test('C03/C09 raster actors retain frame timing, pivot, emission and per-frame sockets',()=>{
  const data={version:1,width:2,height:1,pivot:[1,.5],frames:[
    {durationMs:100,runs:[1,0,1,0xff0000ff],sockets:{muzzle:{x:2,y:0,angle:.25}},emission:[.25,.1,0,1,2,3]},
    {durationMs:250,runs:[2,0xff00ff00],sockets:{muzzle:{x:1,y:1,visible:false,basisX:[-1,0],basisY:[0,1],mirrorPolicy:'reflect'}}},
  ]};
  const clip=createSpriteClip2D(data,{loop:true});assert.deepEqual(clip.socketAt('muzzle',0),{x:1,y:-.5,angle:.25});
  assert.equal(clip.socketAt('muzzle',.1).visible,false);assert.deepEqual(clip.socketAt('muzzle',.1).basisX,[-1,0]);const socketCopy=clip.frameSockets(1);socketCopy.muzzle.basisX[0]=99;assert.equal(clip.frameSockets(1).muzzle.basisX[0],-1);assert.equal(clip.frameAt(.35),0);
  const copied=clip.frameEmission(0);copied[0]=999;almost(clip.frameEmission(0)[0],.25);
  data.frames[0].sockets.muzzle.x=99;assert.equal(clip.frameSockets(0).muzzle.x,2);
  const f=frame(5,3),p=new Painter(f).place(2,1.5);p.fade=.5;p.lightK=2;clip.draw(p,0);
  const i=1*5+1;assert.equal(f.color[i],0);almost(f.hdrLight[i*3],.25);almost(f.hdrLight[(i+1)*3+2],3);
  const character=createLanternlingCharacter2D(),player=createCharacterPlayer2D(character),sample=player.sample(.13);
  assert.equal(sample.frameIndex,1);assert.equal(sample.actor.w,20);assert.equal(sample.actor.h,24);assert.equal(count(player.sample(-.1).actor.pixels),0);assert.ok(sample.emission.some(v=>v>0));
  assert.deepEqual(createActorAdapter2D({kind:'asset',asset:character}).sample(.13).actor.pixels,sample.actor.pixels);
});

test('sprite emission distinguishes optical radiance from an occludable surface',()=>{
  const data={version:1,width:1,height:1,pivot:[0,0],frames:[{durationMs:100,runs:[1,0],emission:[2,1,.5]}]};
  for(const kind of ['surface','optical']){
    const f=frame(2,2),p=new Painter(f);createSpriteClip2D(data,{emissionKind:kind}).draw(p,0);p.rect(0,0,1,1,0xffffffff);
    almost(f.hdrLight[0],kind==='surface'?0:2);assert.equal(f.color[0],0xffffffff);
  }
});

test('C04/C05 equipment uses oriented mirrored sockets and body hand occlusion',()=>{
  const base=createStudioCharacter2D({height:64,view:'side'}),equipped=equipCharacter2D(base,'mainHand','wayfarer-sword');
  assert.equal(equipped.loadout.mainHand,'wayfarer-sword');
  const r=createCharacterPlayer2D(base).sample(.44,'sword'),left=createStudioCharacter2D({height:64,view:'side',facing:'left'}),l=createCharacterPlayer2D(left).sample(.44,'sword');
  const released=createCharacterPlayer2D(base).sample(.9,'bow');assert.ok(released.projectiles.length===1);assert.ok(released.bounds.x1>=released.projectiles[0].x+released.projectiles[0].w);
  assert.ok(count(r.semanticMasks.metal)>10);assert.ok(count(r.semanticMasks.hands)>0);
  for(let i=0;i<r.actor.pixels.length;i++)assert.ok(!(r.semanticMasks.metal[i]&&r.semanticMasks.hands[i]));
  const a=r.sockets['weapon.tip'],b=l.sockets['weapon.tip'];almost(a.position[0],-b.position[0]);almost(a.position[1],b.position[1]);
  const grip=l.sockets['hand.grip'];assert.ok(grip.basisX[0]*grip.basisY[1]-grip.basisX[1]*grip.basisY[0]<0);
  assert.throws(()=>equipCharacter2D(base,'unknown','wayfarer-sword'),/slot|fit/);
});

test('C10/C11 saved cel and semantic edits survive regeneration; erasure removes every occupied semantic mask',()=>{
  let asset=createCharacterAsset2D({...createStudioCharacter2D({height:64}),equipment:{},slots:[],loadout:{},layers:[],clips:{idle:{kind:'human',action:'idle'}}});
  const sample=createCharacterPlayer2D(asset).sample(0),i=sample.semanticMasks.cloth.findIndex(v=>v),x=sample.actor.x+i%sample.actor.w,y=sample.actor.y+Math.floor(i/sample.actor.w),color=0xff80c2f2;
  asset=editCharacterCel2D(asset,{id:'retouch',clip:'idle',frame:0,patch:{x,y,rows:['x'],palette:{x:color}},semantic:'badge'});
  asset=paintCharacterSemanticMask2D(asset,{id:'region',name:'protectedDetail',clip:'idle',frame:0,x,y,rows:['+']});
  const restored=parseCharacterAsset2D(serializeCharacterAsset2D(asset)),painted=createCharacterPlayer2D(restored).sample(0);
  assert.equal(painted.actor.pixels[i],color);assert.equal(painted.semanticMasks.badge[i],1);assert.equal(painted.semanticMasks.protectedDetail[i],1);
  assert.notEqual(createCharacterPlayer2D(restored).sample(.1).actor.pixels[i],color,'frame-scoped paint does not leak to later cels');
  const erased=editCharacterCel2D({...restored,maskEdits:[]},{id:'retouch',clip:'idle',frame:0,patch:{x,y,rows:['x'],palette:{x:null}}}),out=createCharacterPlayer2D(erased).sample(0);
  assert.equal(out.actor.pixels[i],0);assert.equal(out.actor.mask.data[i],0);for(const mask of Object.values(out.semanticMasks))assert.equal(mask[i],0);
  const hole=paintCharacterSemanticMask2D(erased,{id:'intentional-hole',name:'negativeSpace',clip:'idle',frame:0,x,y,rows:['+']}),marked=createCharacterPlayer2D(hole).sample(0);assert.equal(marked.actor.pixels[i],0);assert.equal(marked.semanticMasks.negativeSpace[i],1);
  const cleared=createCharacterPlayer2D(paintCharacterSemanticMask2D(hole,{id:'intentional-hole',name:'negativeSpace',clip:'idle',frame:0,x,y,rows:['-']})).sample(0);assert.equal(cleared.semanticMasks.negativeSpace?.[i]??0,0);
});

test('C12 full-body and portrait share source palette identity while preserving separate native geometry',()=>{
  const asset=createStudioCharacter2D({style:{skinRamp:['#442f48','#815159','#b88172','#e8b79a'],cloth:['#314f4a','#5f8470','#aac0a0']}}),p=humanPalettes2D(asset.source.style),portrait=renderCharacterPortrait2D(asset.identity,{resolution:128,pose:{expression:'smile'}}),body=createCharacterPlayer2D(asset).sample(0);
  assert.equal(portrait.w,128);assert.equal(asset.nativeHeight,96);
  for(const color of [p.skin[2],p.cloth[1]]){assert.ok(portrait.pixels.includes(hex(color)>>>0));assert.ok(body.actor.pixels.includes(hex(color)>>>0));}
});

test('C07 foot constraints hold a planted world endpoint and baked root tracks are seekable',()=>{
  const solved=solveFootPlant2D([{time:0,root:[0,0],left:[2,0],right:[8,0],contacts:{left:true,right:false}},{time:.1,root:[4,0],left:[0,0],right:[5,0],contacts:{left:true,right:false}}]);
  almost(solved[0].root[0]+2,solved[1].root[0]);assert.equal(solved[1].error,0);
  const base=createStudioCharacter2D({height:32,view:'side'}),{asset,samples,maxResidual}=bakeCharacterFootPlant2D(base,'run',{fps:30}),player=createCharacterPlayer2D(asset);
  assert.equal(samples,25);assert.ok(Number.isFinite(maxResidual));assert.equal(asset.clips.run.rootTrack.length,samples);
  const a=player.sample(.1,'run',{applyRootMotion:true}),b=player.sample(.1,'run',{applyRootMotion:true});assert.deepEqual(a.actor.pixels,b.actor.pixels);assert.deepEqual(a.anchors,b.anchors);
  almost(player.sample(.8,'run').rootMotion[0],asset.clips.run.rootTrack.at(-1).position[0]);
});

test('C08 timeline events fire once across loop boundaries; seek and ACT/cue bridges have explicit semantics',()=>{
  const decimal=createCharacterEventCursor2D(.8,[{id:'step',at:0,kind:'footstep'}],true);assert.deepEqual(decimal.advance(2.4).map(e=>e.cycle),[0,1,2,3]);assert.equal(decimal.advance(2.4).length,0);assert.deepEqual(createCharacterEventCursor2D(.3,[{id:'x',at:0,kind:'x'}],true).advance(.9).map(e=>e.cycle),[0,1,2,3]);
  assert.deepEqual(createCharacterEventCursor2D(1,[],true).advance(1e100),[]);
  assert.throws(()=>createCharacterEventCursor2D(1,[{id:'x',at:0,kind:'x'}],true).advance(1e100),/safe integer/);
  assert.equal(createCharacterPlayer2D(createStudioCharacter2D({height:32})).sample(2.4,'run').frameIndex,0);
  const cursor=createCharacterEventCursor2D(1,[{id:'step',at:0,kind:'footstep'},{id:'hit',at:.4,kind:'contact'}],true);
  assert.deepEqual(cursor.advance(0).map(e=>e.id),['step']);assert.equal(cursor.advance(0).length,0);
  assert.deepEqual(cursor.advance(1.1).map(e=>[e.id,e.cycle]),[['hit',0],['step',1]]);cursor.seek(5);assert.equal(cursor.advance(5).length,0);assert.equal(cursor.advance(4).length,0);
  let oldCalls=0;const old=()=>oldCalls++,act={onHit:old},output=[],queue=[{id:'spark',time:2,type:'release'}];
  const bridge=connectCharacterEvents2D({act,time:()=>1,cueSource:{drainCues:()=>queue.splice(0)},sink:e=>output.push(e)});act.onHit({target:'dummy'});bridge.poll();bridge.poll();bridge.dispose();
  assert.equal(oldCalls,1);assert.deepEqual(output.map(e=>e.source),['act','cue3d']);assert.equal(act.onHit,old);
});

test('C13 data-driven creature bones keep lengths and semantic ownership independent of visible RGB',()=>{
  const definition=createSerpentRig2D(64);for(const part of definition.parts)part.color='#556677';
  const rig=compileCreatureRig2D(definition),a=rig.sample(0),b=rig.sample(.6),scale=64/96;
  for(const bone of definition.bones)for(const sample of [a,b]){const q=sample.bones[bone.id];almost(Math.hypot(q.end[0]-q.start[0],q.end[1]-q.start[1]),bone.length*scale);}
  assert.notDeepEqual(a.bones.segment5.end,b.bones.segment5.end);assert.ok(count(a.semanticMasks.head)>10);assert.ok(count(a.semanticMasks.eyes)>0);assert.ok(count(a.semanticMasks.scales)>10);
});

test('C14 secondary motion is baked, bounded and independent of sample order',()=>{
  const input={duration:1,targets:[{at:0,angle:0},{at:.1,angle:2},{at:.5,angle:-2},{at:1,angle:0}],fps:30,maxAngle:.25};
  const a=bakeSecondaryMotion2D(input),b=bakeSecondaryMotion2D(input);assert.deepEqual(a,b);assert.ok(a.every(k=>Math.abs(k.angle)<=.25));assert.ok(a.some(k=>Math.abs(k.angle)>.01));
  const player=createCharacterPlayer2D(createStudioCharacter2D()),first=player.sample(.3);player.sample(1.7);assert.deepEqual(player.sample(.3).actor.pixels,first.actor.pixels);
});

test('P04 affine hierarchy preserves continuous socket coordinates until one inverse-cell raster',()=>{
  const a=pixelTransform2D(3.25,4.5,.7),b=pixelTransform2D(-1.25,.125,-.2,true),m=composePixelTransform2D(a,b),q=[7.125,-4.25],result=transformPixelPoint2D(m,q),expected=transformPixelPoint2D(a,transformPixelPoint2D(b,q));
  almost(result[0],expected[0]);almost(result[1],expected[1]);const back=transformPixelPoint2D(invertPixelTransform2D(m),result);almost(back[0],q[0]);almost(back[1],q[1]);
  const source=raster(2,2,[0xffffffff,0xffffffff,0xffffffff,0xffffffff]),rotated=transformSprite2D(source,pixelTransform2D(0,0,Math.PI/4));assert.ok(count(rotated.pixels)>0);assert.deepEqual([...source.pixels],Array(4).fill(0xffffffff));
});

test('P03/P06/P07 profile, palette cycling and coordinate-anchored dither keep explicit contracts',()=>{
  const source=raster(2,1,[0xff0000ff,0x8000ff00]),indexed=indexSprite2D(source),swapped=swapIndexedPalette2D(indexed,[0xff112233,0xff445566]);
  assert.deepEqual(swapped.indices,indexed.indices);assert.deepEqual(swapped.alpha,indexed.alpha);
  const cycled=renderIndexedSprite2D(indexed,1,[{indices:[0,1],fps:1}]);assert.equal(cycled.pixels[0],0xff00ff00);assert.equal(cycled.pixels[1]>>>24,128);
  const ditherSource=raster(4,4,Array(16).fill(0x80ffffff));
  const object=ditherSprite2D(ditherSource,{anchor:'object'},{objectToWorld:pixelTransform2D(1,0)}),fixed=ditherSprite2D(ditherSource,{anchor:'object'}),world=ditherSprite2D(ditherSource,{anchor:'world'},{objectToWorld:pixelTransform2D(1,0)});
  assert.deepEqual(object.pixels,fixed.pixels);assert.notDeepEqual(world.pixels,fixed.pixels);assert.equal(count(world.pixels),8);
  const profile=createPixelStyleProfile2D({surfaceColors:'indexed',palette:indexed.palette,emission:'none',finalColorPolicy:'palette-locked',alpha:'solid'}),roundtrip=parsePixelStyle2D(serializePixelStyle2D(profile)),out=compilePixelStyle2D(roundtrip).apply(source);
  assert.ok(out.pixels.every(c=>c>>>24===255));assert.throws(()=>createPixelStyleProfile2D({finalColorPolicy:'palette-locked'}),/palette/i);
});

test('P05/P09 diagnostics distinguish semantic contracts from artistic candidates',()=>{
  const white=0xffffffff,source=raster(5,5,[0,0,0,0,0,0,white,white,white,0,0,white,0,white,0,0,white,white,white,0,0,0,0,0,0]),solid=new Uint8Array(25),intentional=new Uint8Array(25);solid[12]=1;
  const report=diagnosePixelSprite2D(source,{masks:{solidSubject:solid}});assert.ok(report.issues.some(i=>i.kind==='solid-gap'&&i.confidence==='contract'));assert.ok(report.issues.some(i=>i.kind==='enclosed-hole'&&i.confidence==='heuristic'));
  intentional[12]=1;const protectedReport=diagnosePixelSprite2D(source,{masks:{solidSubject:solid,negativeSpace:intentional}});assert.ok(!protectedReport.issues.some(i=>i.kind==='solid-gap'||i.kind==='enclosed-hole'));assert.equal(source.pixels[12],0);
});

test('P08/P10/P11 outline protection, approved AA/subpixel colors and native optical tiers do not blur',()=>{
  const source=raster(5,5,Array.from({length:25},(_,i)=>i===12?0xff8899aa:0)),protectedMask=new Uint8Array(25);protectedMask[13]=1;
  const outlined=selectiveOutline2D(source,{shadow:0xff000000,protected:protectedMask});assert.equal(outlined.pixels[13],0);assert.equal(outlined.pixels[12],source.pixels[12]);
  const track={duration:1,loop:true,purpose:'subpixel',allowedColors:[0xffaabbcc],keys:[{at:0,patches:[]},{at:.5,patches:[{x:1,y:2,rows:['x'],palette:{x:0xffaabbcc}}]}]},compiled=compileAuthoredPixelTrack2D(track);track.duration=7;
  assert.equal(compiled(source,.6).pixels[11],0xffaabbcc);assert.equal(compiled(source,1.1).pixels[11],0);assert.equal(source.pixels[11],0);
  assert.throws(()=>compileAuthoredPixelTrack2D({...track,allowedColors:[]}),/allowed/);
  const corrected=applyOpticalCorrection2D(source,32,[{minHeight:16,maxHeight:32,patches:[{x:2,y:1,rows:['x'],palette:{x:0xffaabbcc}}]}]);assert.equal(corrected.pixels[7],0xffaabbcc);assert.equal(applyOpticalCorrection2D(source,64,[{minHeight:16,maxHeight:32,patches:[]}]).pixels[7],0);
});

test('P12 aligned temporal diagnosis sees growth outside the first canvas without calling all change defective',()=>{
  const a=raster(2,1,[0xffffffff,0xff998877]),b={...a,x:1},report=diagnosePixelMotion2D([{sprite:a,time:0},{sprite:b,time:1,transform:pixelTransform2D(-1,0)}],{expectedStill:true});
  assert.equal(report.pairs[0].changed,0);assert.equal(report.pairs[0].unexpected,false);
  const growth=diagnosePixelMotion2D([{sprite:a,time:0},{sprite:raster(3,1,[...a.pixels,0xffffffff]),time:1}]);assert.equal(growth.width,3);assert.equal(growth.pairs[0].silhouetteChanged,1);assert.equal(growth.pairs[0].unexpected,false);
});

test('P13 material IDs, normals and height shade to exact ramp colors and preserve separate HDR energy',()=>{
  const source=raster(3,1,[0xffffffff,0xffffffff,0x80ffffff]),channels=createMaterialChannels2D(3,1,{height:[0,1,0]}),palette=[0xff223344,0xff667788,0xffaabbcc],shader=createMaterialShader2D([{id:1,palette,emission:[2,1,0]}],[{position:[1,0,5],radius:20,intensity:.8}]),out=shader(source,channels);
  for(const c of out.pixels)assert.ok(palette.some(q=>(q&0xffffff)===(c&0xffffff)));almost(out.emission[0],2);almost(out.emission[6],2*128/255,1e-6);
  assert.notEqual(channels.normal[0],0);assert.notEqual(channels.normal[6],0);assert.equal(paintMaterialChannel2D(channels,[0,1,0],2,3).material[1],2);assert.equal(channels.material[1],1);
  assert.throws(()=>createMaterialChannels2D(1,1,{material:[65536]}),/16-bit/);
});

test('C06/P14 reference assets and native material/cluster examples are executable and serializable',()=>{
  const pack=createCharacterReferencePack2D();assert.deepEqual(Object.keys(pack),['wayfarer','copperSmith','lanternling','mossSerpent']);
  for(const asset of Object.values(pack)){const parsed=parseCharacterAsset2D(serializeCharacterAsset2D(asset));assert.ok(count(createCharacterPlayer2D(parsed).sample(.2).actor.pixels)>10);}
  const studies=createPixelToolkitStudies2D(.4);assert.equal(studies.length,12);for(const item of studies){assert.equal(item.sprite.w,32);assert.ok(count(item.sprite.pixels)>50);}
  const source=studies[0].sprite,settings={kind:'stone',palette:[0xff334455,0xff667788],coordinates:{anchor:'object'},seed:55};assert.deepEqual(textureMaterial2D(source,settings).pixels,textureMaterial2D(source,settings).pixels);
});
