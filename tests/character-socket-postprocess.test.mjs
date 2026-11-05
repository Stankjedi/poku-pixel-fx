import test from 'node:test';
import assert from 'node:assert/strict';
import {postprocessProjectFrame,applyProjectEdits} from '../build/authoring/edits.js';
import {createPixelStyleProfile2D,compilePixelStyle2D} from '../build/core/pixel-style.js';
import {ditherSprite2D} from '../build/core/pixel-tools.js';
import {createCharacterAsset2D,createCharacterPlayer2D,createStudioCharacter2D,setCharacterSocketKey2D,serializeCharacterAsset2D,parseCharacterAsset2D,sampleCharacterSocketTrack2D,compileCharacterSocketTrack2D,applyCharacterSocketKey2D} from '../build/core/character-asset.js';
import {characterSocket2D,socketTransform2D} from '../build/core/character-animation.js';
import {pixelTransform2D,composePixelTransform2D,invertPixelTransform2D,transformPixelPoint2D,transformSprite2D} from '../build/core/sprite-raster.js';

const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const frame=(w=12,h=10)=>({w,h,ox:-3,oy:-5,color:new Uint32Array(w*h).fill(0x80332211),light:new Uint32Array(w*h)});
const project=(style,edits=[])=>({fps:30,edits,pixelStyle:style});
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

test('postprocess dithering uses actual inverse object, native world and final shaken screen coordinates',()=>{
  const angle=.7,c=Math.cos(angle),s=Math.sin(angle),tx=7.25,ty=3.5,camera=[2,-1],outputs=[];
  for(const anchor of ['object','world','screen']){
    const f=frame(),style=createPixelStyleProfile2D({alpha:'authored-dither',dither:{anchor,pattern:'bayer4',scale:1,phase:[.25,-.25]}});
    postprocessProjectFrame(f,project(style),.4,12,{objectToWorld:pixelTransform2D(tx,ty,angle,true),cameraOffset:camera});
    const expected=new Uint32Array(f.color.length);
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const wx=x+.5+f.ox,wy=y+.5+f.oy;
      const [px,py]=anchor==='object'?[-(c*(wx-tx)+s*(wy-ty)),-s*(wx-tx)+c*(wy-ty)]:anchor==='world'?[wx,wy]:[x+.5+camera[0],y+.5+camera[1]];
      const xx=((Math.floor(px+.25)%4)+4)%4,yy=((Math.floor(py-.25)%4)+4)%4;
      expected[y*f.w+x]=128/255>(bayer[yy*4+xx]+.5)/16?0xff332211:0;
    }
    assert.deepEqual(f.color,expected,anchor);outputs.push([...f.color].join(','));
  }
  assert.equal(new Set(outputs).size,3,'the three anchors are observably distinct');
  for(const anchor of ['world','screen']){
    const style=createPixelStyleProfile2D({alpha:'authored-dither',dither:{anchor,phase:[.5,.5]}}),a=frame(),b=frame();
    postprocessProjectFrame(a,project(style),0,0,{objectToWorld:pixelTransform2D(),cameraOffset:camera});
    postprocessProjectFrame(b,project(style),0,0,{objectToWorld:pixelTransform2D(tx,ty,angle,true),cameraOffset:camera});
    assert.deepEqual(a.color,b.color,'world/screen threshold boundaries must not inherit object inverse roundoff');
  }
  const screen=createPixelStyleProfile2D({alpha:'authored-dither',dither:{anchor:'screen'}});
  assert.doesNotThrow(()=>postprocessProjectFrame(frame(),project(screen),0,0,{space:'screen-only',cameraOffset:camera}));
  assert.throws(()=>postprocessProjectFrame(frame(),project({...screen,dither:{anchor:'world'}}),0,0,{space:'screen-only'}),/Projected 3D/);
});

test('postprocess erasures synchronize physical masks, retain empty regions and preserve independent HDR optical light',()=>{
  const f=frame(4,4);f.hdrLight=new Float32Array(4*4*3).fill(2.5);f.light.fill(0xff8090a0);
  f.semanticMasks={body:new Uint8Array(16).fill(1),negativeSpace:new Uint8Array(16).fill(1),protectedVoid:new Uint8Array(16).fill(1),detail:new Uint8Array(16).fill(1)};
  const beforeHDR=f.hdrLight.slice(),beforeLight=f.light.slice(),colorBuffer=f.color;
  const style=createPixelStyleProfile2D({alpha:'authored-dither',dither:{anchor:'screen'}});
  postprocessProjectFrame(f,project(style),0,0,{allowEmptyMasks:['protectedVoid']});
  for(let i=0;i<16;i++){
    assert.equal(f.semanticMasks.body[i],f.color[i]?1:0);assert.equal(f.semanticMasks.detail[i],f.color[i]?1:0);
    assert.equal(f.semanticMasks.negativeSpace[i],1);assert.equal(f.semanticMasks.protectedVoid[i],1);
  }
  assert.strictEqual(f.color,colorBuffer);assert.deepEqual(f.hdrLight,beforeHDR);assert.deepEqual(f.light,beforeLight);
  // Reuse the same frame object with different pixels: no previous scratch coverage leaks into it.
  f.color.fill(0);f.color[5]=0xffffffff;f.semanticMasks.body.fill(0);f.semanticMasks.body[5]=1;
  postprocessProjectFrame(f,project(style),.1,3,{allowEmptyMasks:['protectedVoid']});
  assert.equal(f.color[5],0xffffffff);assert.equal(f.color.filter(Boolean).length,1);assert.deepEqual(f.hdrLight,beforeHDR);
  applyProjectEdits(f,[{frame:'all',x:1,y:1,color:null}],0,30);
  assert.equal(f.semanticMasks.body[5],0);assert.equal(f.semanticMasks.negativeSpace[5],1);assert.deepEqual(f.hdrLight,beforeHDR);
  const painted=frame(2,1);painted.light.set([0xff000080,0xff00ff00]);
  applyProjectEdits(painted,[{frame:'all',x:1,y:0,channel:'emission',emission:[5,2,1],color:null}],0,30);
  approx(painted.hdrLight[0],((128/255+.055)/1.055)**2.4);assert.deepEqual([...painted.hdrLight.slice(3)],[5,2,1]);
  postprocessProjectFrame(f,project({...style,emission:'none'}),0,0);assert.ok(f.hdrLight.every(v=>v===0));assert.ok(f.light.every(v=>v===0));
});

test('mutable render scratch does not weaken immutable public pixel-style/dither results',()=>{
  const source={w:4,h:4,x:0,y:0,pixels:new Uint32Array(16).fill(0x80332211),mask:{w:4,h:4,data:new Uint8Array(16).fill(1)}},copy=source.pixels.slice(),maskCopy=source.mask.data.slice();
  const style=compilePixelStyle2D(createPixelStyleProfile2D({alpha:'authored-dither',dither:{anchor:'object'}}));
  const a=style.apply(source),b=style.apply(source),c=ditherSprite2D(source,{anchor:'screen'});
  a.pixels.fill(0);a.mask.data.fill(0);assert.deepEqual(source.pixels,copy);assert.deepEqual(source.mask.data,maskCopy);assert.ok(b.pixels.some(Boolean));assert.ok(c.pixels.some(Boolean));
});

test('socket keys carry channels, interpolate short arcs and preserve a nonsingular mirrored basis',()=>{
  const track={mode:'delta',keys:[{at:.2,position:[0,0],angle:350*Math.PI/180,visible:true,interpolation:'linear'},{at:.6,visible:false},{at:1,position:[8,4],angle:10*Math.PI/180}]};
  assert.equal(sampleCharacterSocketTrack2D(track,.1),null);
  const mid=sampleCharacterSocketTrack2D(track,.6);approx(mid.position[0],4);approx(mid.position[1],2);approx(Math.sin(mid.angle),0);assert.equal(mid.visible,false);
  const snapshot=compileCharacterSocketTrack2D(track);track.keys[0].position[0]=99;approx(snapshot.sample(.6).position[0],4);
  const base=characterSocket2D([10,-3],0,0,true),delta=applyCharacterSocketKey2D(base,{at:0,position:[2,3],angle:Math.PI/2},'delta');
  assert.deepEqual(delta.position,[8,0]);approx(delta.basisX[0],0);approx(delta.basisX[1],1);assert.ok(delta.basisX[0]*delta.basisY[1]-delta.basisX[1]*delta.basisY[0]<0);
  const basisTrack={mode:'override',keys:[{at:0,basisX:[2,0],basisY:[0,3],interpolation:'linear'},{at:1,basisX:[-2,0],basisY:[0,-3]}]},turn=sampleCharacterSocketTrack2D(basisTrack,.5);
  approx(Math.hypot(...turn.basisX),2);approx(Math.hypot(...turn.basisY),3);approx(turn.basisX[0]*turn.basisY[1]-turn.basisX[1]*turn.basisY[0],6);
  const flip=sampleCharacterSocketTrack2D({mode:'override',keys:[{at:0,basisX:[1,0],basisY:[0,1],interpolation:'linear'},{at:1,basisX:[1,0],basisY:[0,-1]}]},.5);approx(flip.basisY[1],1);
  assert.throws(()=>sampleCharacterSocketTrack2D({mode:'delta',keys:[{at:0,basisX:[1,0],basisY:[2,0]}]},0),/invertible/);
  assert.throws(()=>sampleCharacterSocketTrack2D({mode:'delta',keys:[{at:0,angle:0},{at:0,angle:1}]},0),/ordered/);
});

function nativeCharacter(){
  return createCharacterAsset2D({schema:'poku.character/v1',id:'socket-study',name:'Socket study',nativeHeight:16,defaultClip:'idle',source:{kind:'sprite',options:{loop:true},clip:{version:1,width:4,height:4,pivot:[2,2],frames:[{durationMs:1000,runs:[16,0xff550000],sockets:{grip:{x:4,y:2,basisX:[1,0],basisY:[0,1]}}}]}},clips:{idle:{kind:'sprite',options:{loop:true}}},layers:[{id:'blade',socket:'grip',semantic:'metal',clip:{version:1,width:3,height:1,pivot:[0,0],frames:[{durationMs:1000,runs:[3,0xff0000ff],sockets:{tip:{x:3,y:0}}}]}},{id:'charm',socket:'tip',offset:[0,2],semantic:'cloth',clip:{version:1,width:1,height:1,pivot:[0,0],frames:[{durationMs:1000,runs:[1,0xff00ff00]}]}}]});
}
function cells(sample,color){const out=[];for(let i=0;i<sample.actor.pixels.length;i++)if(sample.actor.pixels[i]===color)out.push([sample.actor.x+i%sample.actor.w,sample.actor.y+Math.floor(i/sample.actor.w)]);return out;}

test('persisted socket edits move attachments before assembly and apply late frame sockets exactly once',()=>{
  const original=nativeCharacter(),base=createCharacterPlayer2D(original).sample(.5);
  let asset=setCharacterSocketKey2D(original,'idle','grip',{at:0,position:[1,2]},'delta');
  asset=setCharacterSocketKey2D(asset,'idle','tip',{at:0,position:[0,1]},'delta');
  asset=setCharacterSocketKey2D(asset,'idle','tip',{at:0,position:[0,1],visible:true},'delta');
  assert.equal(asset.clips.idle.socketTracks.tip.keys.length,1);
  const restored=parseCharacterAsset2D(serializeCharacterAsset2D(asset)),player=createCharacterPlayer2D(restored),out=player.sample(.5);
  assert.deepEqual(out.sockets.grip.position,[3,2]);assert.deepEqual(out.sockets.tip.position,[6,3]);
  assert.deepEqual(cells(out,0xff0000ff),[[3,2],[4,2],[5,2]]);assert.deepEqual(cells(out,0xff00ff00),[[6,5]]);assert.deepEqual(cells(out,0xff550000),cells(base,0xff550000));
  const ignored=player.sample(.5,'idle',{ignoreSocketTracks:true});assert.deepEqual(ignored.actor.pixels,base.actor.pixels);assert.deepEqual(ignored.sockets,base.sockets);
  assert.equal(original.clips.idle.socketTracks,undefined);assert.throws(()=>setCharacterSocketKey2D(original,'idle','grip',{at:2,position:[0,0]}),/duration/);
  const hidden=setCharacterSocketKey2D(asset,'idle','tip',{at:.7,visible:false},'delta'),h=createCharacterPlayer2D(hidden).sample(.8);assert.equal(cells(h,0xff00ff00).length,0);assert.ok(cells(h,0xff0000ff).length>0);
  const parentHidden=setCharacterSocketKey2D(asset,'idle','grip',{at:.7,visible:false},'delta'),ph=createCharacterPlayer2D(parentHidden).sample(.8);
  assert.equal(ph.sockets.tip.visible,false);assert.equal(cells(ph,0xff00ff00).length,0);assert.equal(cells(ph,0xff0000ff).length,0);
});

test('human grip tracks transform held sword geometry and tip sockets without moving the source body',()=>{
  const original=createStudioCharacter2D({height:32,view:'side'}),basePlayer=createCharacterPlayer2D(original),base=basePlayer.sample(.4,'sword');
  const edited=setCharacterSocketKey2D(original,'sword','hand.grip',{at:0,position:[6,-2],angle:.3},'delta'),player=createCharacterPlayer2D(edited),out=player.sample(.4,'sword'),grip=base.sockets['hand.grip'];
  const expectedGrip=transformPixelPoint2D(socketTransform2D(grip),[6,-2]);approx(out.sockets['hand.grip'].position[0],expectedGrip[0]);approx(out.sockets['hand.grip'].position[1],expectedGrip[1]);
  const correction=composePixelTransform2D(socketTransform2D(out.sockets['hand.grip']),invertPixelTransform2D(socketTransform2D(grip))),tip=transformPixelPoint2D(correction,base.sockets['weapon.tip'].position);
  approx(out.sockets['weapon.tip'].position[0],tip[0]);approx(out.sockets['weapon.tip'].position[1],tip[1]);
  assert.deepEqual(out.sockets.head,base.sockets.head);assert.deepEqual(out.sockets['hand.left'],base.sockets['hand.left']);
  assert.notDeepEqual(out.actor.pixels,base.actor.pixels);assert.deepEqual(player.sample(.4,'sword',{ignoreSocketTracks:true}).actor.pixels,base.actor.pixels);
  const hidden=setCharacterSocketKey2D(edited,'sword','hand.grip',{at:.5,visible:false}),h=createCharacterPlayer2D(hidden).sample(.6,'sword');assert.equal(h.semanticMasks.metal?.some(Boolean)??false,false);
});

test('released bow projectiles freeze the grip correction at the actual release cue',()=>{
  const original=createStudioCharacter2D({height:32,view:'side'}),base=createCharacterPlayer2D(original);
  let edited=setCharacterSocketKey2D(original,'bow','hand.grip',{at:0,position:[3,0],interpolation:'hold'});
  edited=setCharacterSocketKey2D(edited,'bow','hand.grip',{at:.8,position:[25,9],angle:1});
  const player=createCharacterPlayer2D(edited),release=base.sample(.7,'bow'),fixed=player.sample(.7,'bow'),correction=composePixelTransform2D(socketTransform2D(fixed.sockets['hand.grip']),invertPixelTransform2D(socketTransform2D(release.sockets['hand.grip'])));
  for(const time of [.9,1.1]){
    const projectile=base.sample(time,'bow').projectiles[0],out=player.sample(time,'bow').projectiles[0],expected=transformSprite2D(projectile,correction);
    assert.equal(out.x,expected.x);assert.equal(out.y,expected.y);assert.deepEqual(out.pixels,expected.pixels);
  }
  const afterOnly=setCharacterSocketKey2D(original,'bow','hand.grip',{at:.8,position:[25,9],angle:1});
  assert.deepEqual(createCharacterPlayer2D(afterOnly).sample(1,'bow').projectiles,base.sample(1,'bow').projectiles);
});
