import {Painter,type PaintFrame} from './painter.js';
import {hex} from './color.js';
import {renderHuman2D,humanRig2D,type HumanStyle,type HumanPose,type HumanSprite} from './human.js';
import {renderCreature2D,type CreatureStyle,type CreatureMotion} from './creature.js';
import {renderHumanWeapon2D,renderHumanWeaponPose2D,HUMAN_WEAPON_TIMING} from './human-weapon.js';
import {createSpriteClip2D,type SpriteClipData2D,type SpriteClipOptions2D,type SpriteClip2D} from './sprite-clip.js';
import {blitSprite2D,transformSprite2D,pixelTransform2D,composePixelTransform2D,invertPixelTransform2D,transformPixelPoint2D,encodeSpritePixels2D,type RasterSprite2D,type PixelTransform2D} from './sprite-raster.js';
import {sampleHumanAnimation2D,humanAnimationInfo2D,humanSockets2D,characterSocket2D,socketTransform2D,transformCharacterSocket2D,compileHumanPoseClip2D,createCharacterEventCursor2D,sampleSecondaryMotion2D,bakeSecondaryMotion2D,solveFootPlant2D,characterClipTime2D,HUMAN_ANIMATIONS_2D,type HumanAnimation2D,type CharacterSocket2D,type CharacterEvent2D,type HumanPoseClip2D,type SecondaryKey2D} from './character-animation.js';
import {compileCreatureRig2D,createCreatureRigAsset2D,type CreatureRigAsset2D} from './creature-asset.js';
import {createCharacterIdentity2D,type CharacterIdentity2D} from './character-identity.js';
import {compilePixelStyle2D,createPixelStyleProfile2D,type PixelStyleProfile2D} from './pixel-style.js';
import {addLinearLight2D} from '../render/surface2d.js';
import type {SpriteClusterPatch2D} from './sprite-edit.js';
import type {PixelPatternContext2D} from './pixel-tools.js';
import type {ActorAnchors2D,AdaptedActor2D,ActorSample2D} from './actor-adapter.js';
import {validateCharacterSocketTrack2D,compileCharacterSocketTrack2D,applyCharacterSocketKey2D,type CharacterSocketTrack2D,type CharacterSocketKey2D} from './character-sockets.js';
export {sampleCharacterSocketTrack2D,compileCharacterSocketTrack2D,applyCharacterSocketKey2D,validateCharacterSocketTrack2D,type CharacterSocketTrack2D,type CharacterSocketKey2D} from './character-sockets.js';

export type CharacterSource2D =
  | {kind:'human';style:HumanStyle}
  | {kind:'creature';style:CreatureStyle}
  | {kind:'creature-rig';rig:CreatureRigAsset2D}
  | {kind:'sprite';clip:SpriteClipData2D;options?:SpriteClipOptions2D};
export interface CharacterClipBase2D {
  /** Optional exact cel cadence. It never changes the simulation step. */
  fps?:number;events?:readonly CharacterEvent2D[];
  /** Overrides named equipment slots during this clip; null hides a slot. */
  loadout?:Readonly<Record<string,string|null>>;
  rootMotion?:boolean;
  /** Absolute native root positions, including an endpoint at duration. Loops accumulate their end-to-start displacement. */
  rootTrack?:readonly {at:number;position:readonly[number,number]}[];
  /** Authored discrete facial keys; no interpolation of eyelid topology. */
  faceTrack?:readonly {at:number;blink?:boolean;gaze?:number}[];
  /** Per-socket local corrections, evaluated before attached equipment. Does not deform the body rig. */
  socketTracks?:Readonly<Record<string,CharacterSocketTrack2D>>;
}
export type CharacterClip2D = CharacterClipBase2D & (
  | {kind:'human';action:HumanAnimation2D}
  | {kind:'key-pose';poses:HumanPoseClip2D}
  | {kind:'creature';motion:CreatureMotion;duration?:number}
  | {kind:'creature-rig';duration?:number}
  | {kind:'sprite';data?:SpriteClipData2D;options?:SpriteClipOptions2D}
);
export interface CharacterLayer2D {
  id:string;clip:SpriteClipData2D;options?:SpriteClipOptions2D;
  /** Optional native articulated equipment; clip remains its portable inventory thumbnail. */
  generator?:'human-sword'|'human-bow';
  /** If omitted on equipment, the slot's socket is used. */
  socket?:string;offset?:readonly[number,number];angle?:number;
  /** Negative layers sit behind body/effects; zero and positive layers are foreground. */
  order?:number;semantic:string;visibleIn?:readonly string[];
  /** Body semantic masks cut an equipment layer, e.g. hands over the sword grip. */
  occludedBy?:readonly string[];
  secondary?:{duration:number;loop?:boolean;keys:readonly SecondaryKey2D[]};
}
export interface CharacterSlot2D { id:string;socket:string;order:number }
export interface CharacterEquipment2D { id:string;slots:readonly string[];layers:readonly CharacterLayer2D[] }
export interface CharacterCelEdit2D {
  id:string;clip?:string;frame?:number;
  /** 'body' or a layer ID. Native local coordinates survive changing raster padding. */
  target?:string;space?:'local'|'socket';socket?:string;
  patch:SpriteClusterPatch2D;semantic?:string;
}
export interface CharacterMaskEdit2D {
  id:string;name:string;clip?:string;frame?:number;target?:string;
  space?:'local'|'socket';socket?:string;x:number;y:number;rows:readonly string[];
  /** Regions such as intentional negative space may contain transparent cells. */
  allowEmpty?:boolean;
  /** '+' adds an occupied cell, '-' clears membership, every other symbol is untouched. */
}
export interface CharacterAsset2D {
  schema:'poku.character/v1';id:string;name:string;nativeHeight:number;
  source:CharacterSource2D;defaultClip:string;clips:Readonly<Record<string,CharacterClip2D>>;
  identity?:CharacterIdentity2D;
  slots?:readonly CharacterSlot2D[];equipment?:Readonly<Record<string,CharacterEquipment2D>>;
  loadout?:Readonly<Record<string,string|null>>;layers?:readonly CharacterLayer2D[];
  celEdits?:readonly CharacterCelEdit2D[];maskEdits?:readonly CharacterMaskEdit2D[];
  pixelStyle?:PixelStyleProfile2D;
}
/** Compatibility spelling used by studio projects. */
export type CharacterAsset=CharacterAsset2D;
export interface CharacterSample2D extends ActorSample2D {
  sockets:Record<string,CharacterSocket2D>;semanticMasks:Record<string,Uint8Array>;
  events:readonly CharacterEvent2D[];rootMotion:[number,number];frameIndex:number;
  clip:string;duration:number;loop:boolean;contacts:{left:boolean;right:boolean};
  /** Coverage-weighted native radiance aligned with actor pixels, independent of color alpha. */
  emission:Float32Array;
  /** Detached projectiles draw in front but never enter the body/status-effect silhouette. */
  projectiles:readonly RasterSprite2D[];
}
export interface CharacterSampleOptions2D {
  x?:number;y?:number;applyRootMotion?:boolean;pixelContext?:PixelPatternContext2D;
  /** Return the source sockets/attachments so an editor can derive an inverse delta. */
  ignoreSocketTracks?:boolean;
}
interface NativeLayer {
  id:string;sprite:RasterSprite2D;masks:Record<string,Uint8Array>;emission:Float32Array|null;
  emissionKind:'surface'|'optical';order:number;semantic:string;
}
const finitePoint=(p:readonly number[])=>p.length===2&&p.every(Number.isFinite);
const own=(o:object,key:string)=>Object.prototype.hasOwnProperty.call(o,key);
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const maskMap=():Record<string,Uint8Array>=>Object.create(null);
const emptyEmission=(sprite:RasterSprite2D)=>new Float32Array(sprite.w*sprite.h*3);
function validName(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=128&&!['__proto__','prototype','constructor'].includes(value);}
function validatePatch(patch:SpriteClusterPatch2D){
  if(!Number.isSafeInteger(patch.x)||!Number.isSafeInteger(patch.y)||!Array.isArray(patch.rows)||patch.rows.length>4096||!patch.rows.every(r=>typeof r==='string'&&[...r].length<=4096)||!patch.palette||typeof patch.palette!=='object')throw new RangeError('Invalid persisted cel patch');
  for(const[symbol,color]of Object.entries(patch.palette))if([...symbol].length!==1||color!==null&&(!Number.isInteger(color)||color< -0x80000000||color>0xffffffff))throw new RangeError('Cel patch palette needs code points and packed colors/null');
}
function clipMetadata(source:CharacterSource2D,clip:CharacterClip2D):{duration:number;loop:boolean;events:readonly CharacterEvent2D[]}{
  let duration:number,loop:boolean,events:readonly CharacterEvent2D[]=[];
  if(clip.kind==='human'){({duration,loop,events}=humanAnimationInfo2D(clip.action));}
  else if(clip.kind==='key-pose'){duration=clip.poses.duration;loop=clip.poses.loop??false;events=clip.poses.events??[];}
  else if(clip.kind==='sprite'){const data=clip.data??(source.kind==='sprite'?source.clip:undefined);if(!data)throw new RangeError('Sprite clip data is required');const c=createSpriteClip2D(data,clip.options??(source.kind==='sprite'?source.options:undefined));duration=c.duration;loop=clip.options?.loop??(source.kind==='sprite'?source.options?.loop:false)??false;}
  else if(clip.kind==='creature-rig'){duration=clip.duration??(source.kind==='creature-rig'?source.rig.duration:2);loop=true;}
  else {duration=clip.duration??2;loop=true;}
  events=clip.events??events;createCharacterEventCursor2D(duration,events,loop);return{duration,loop,events};
}
/** Snapshot portable authoring data. Invalid rig, clip, equipment or edit references fail on load. */
export function createCharacterAsset2D(input:CharacterAsset2D):CharacterAsset2D {
  const asset=copy(input);
  if(asset.schema!=='poku.character/v1'||!validName(asset.id)||!validName(asset.name)||!Number.isInteger(asset.nativeHeight)||asset.nativeHeight<16||asset.nativeHeight>384||!asset.source||!asset.clips||Array.isArray(asset.clips)||Object.keys(asset.clips).length<1||Object.keys(asset.clips).length>128||!own(asset.clips,asset.defaultClip))throw new RangeError('Invalid character asset identity, native height or clip map');
  const source=asset.source;
  const rasterDefinitions:SpriteClipData2D[]=[];
  for(const clip of Object.values(asset.clips))if(clip.kind==='sprite'){const data=clip.data??(source.kind==='sprite'?source.clip:undefined);if(data)rasterDefinitions.push(data);}
  for(const layer of [...asset.layers??[],...Object.values(asset.equipment??{}).flatMap(item=>item.layers??[])])if(layer.clip)rasterDefinitions.push(layer.clip);
  let decodedCells=0;for(const data of rasterDefinitions){decodedCells+=data.width*data.height*(data.frames?.length??0);if(!Number.isSafeInteger(decodedCells)||decodedCells>16_777_216)throw new RangeError('Character clips exceed the total decoded-cell budget');}

  if(source.kind==='human')humanRig2D({...source.style,height:asset.nativeHeight});
  else if(source.kind==='creature')renderCreature2D({...source.style,size:asset.nativeHeight},'idle',0);
  else if(source.kind==='creature-rig'){source.rig=createCreatureRigAsset2D(source.rig);if(source.rig.nativeHeight!==asset.nativeHeight)throw new RangeError('Creature rig native height must match its character asset');}
  else if(source.kind==='sprite')createSpriteClip2D(source.clip,source.options);
  else throw new RangeError('Unknown character source');
  const slots=new Map<string,CharacterSlot2D>();
  for(const slot of asset.slots??[]){if(!validName(slot.id)||slots.has(slot.id)||!validName(slot.socket)||!Number.isFinite(slot.order))throw new RangeError('Equipment slots need unique IDs, sockets and finite layer order');slots.set(slot.id,slot);}
  if(slots.size>64||Object.keys(asset.equipment??{}).length>128||(asset.layers?.length??0)>256)throw new RangeError('Character layer budget exceeded');
  const layerIds=new Set<string>();
  const layer=(l:CharacterLayer2D)=>{
    if(!validName(l.id)||layerIds.has(l.id)||!validName(l.semantic)||l.order!==undefined&&!Number.isFinite(l.order)||l.angle!==undefined&&!Number.isFinite(l.angle)||l.offset!==undefined&&!finitePoint(l.offset))throw new RangeError('Character layers need unique IDs, semantics and finite transforms');
    if(l.generator&&(source.kind!=='human'||!['human-sword','human-bow'].includes(l.generator)||l.offset!==undefined||l.angle!==undefined||l.secondary!==undefined||l.socket!==undefined&&l.socket!=='hand.grip'))throw new RangeError('Articulated human equipment uses the human grip, without a second local transform');
    layerIds.add(l.id);createSpriteClip2D(l.clip,l.options);
    for(const name of l.visibleIn??[])if(!own(asset.clips,name))throw new RangeError('Layer references an unknown clip');
    if(l.secondary){if(!Number.isFinite(l.secondary.duration)||l.secondary.duration<=0||!l.secondary.keys.length)throw new RangeError('Invalid baked secondary track');l.secondary.keys.forEach((k,i)=>{if(!Number.isFinite(k.at)||k.at<0||k.at>l.secondary!.duration||!Number.isFinite(k.angle)||i>0&&k.at<=l.secondary!.keys[i-1].at)throw new RangeError('Invalid secondary motion keys');});}
  };
  for(const l of asset.layers??[])layer(l);
  for(const[id,item]of Object.entries(asset.equipment??{})){if(id!==item.id||!validName(id)||!item.slots.length||!item.slots.every(s=>slots.has(s))||item.layers.length>32)throw new RangeError('Invalid equipment entry');for(const l of item.layers)layer(l);}
  const loadout=(load:Readonly<Record<string,string|null>>|undefined)=>{for(const[slot,id]of Object.entries(load??{})){if(!slots.has(slot)||id!==null&&(!own(asset.equipment??{},id)||!asset.equipment![id].slots.includes(slot)))throw new RangeError('Equipment does not fit its selected slot');}};loadout(asset.loadout);
  for(const[name,clip]of Object.entries(asset.clips)){
    if(!validName(name)||!clip||!['human','key-pose','creature','creature-rig','sprite'].includes(clip.kind))throw new RangeError('Invalid character clip');
    if((clip.kind==='human'||clip.kind==='key-pose')&&source.kind!=='human'||clip.kind==='creature'&&source.kind!=='creature'||clip.kind==='creature-rig'&&source.kind!=='creature-rig')throw new RangeError('Clip and source anatomy must agree');
    if(clip.fps!==undefined&&(!Number.isInteger(clip.fps)||clip.fps<1||clip.fps>240))throw new RangeError('Authored cel cadence must be 1..240 fps');
    if(clip.kind==='key-pose')compileHumanPoseClip2D(clip.poses);
    if(clip.kind==='creature'&&source.kind==='creature')renderCreature2D({...source.style,size:asset.nativeHeight},clip.motion,0);
    const info=clipMetadata(source,clip);loadout(clip.loadout);
    if(clip.socketTracks){
      if(typeof clip.socketTracks!=='object'||Array.isArray(clip.socketTracks)||Object.keys(clip.socketTracks).length>128)throw new RangeError('Socket tracks need a named map with at most 128 sockets');
      let keys=0;for(const[name,track]of Object.entries(clip.socketTracks)){if(!validName(name))throw new RangeError('Invalid socket track name');validateCharacterSocketTrack2D(track,info.duration);keys+=track.keys.length;}if(keys>16384)throw new RangeError('Socket track key budget exceeded');
    }
    if(clip.rootTrack){const keys=clip.rootTrack;if(keys.length<2||keys[0].at!==0||keys[keys.length-1].at!==info.duration)throw new RangeError('Root track must span zero through clip duration');keys.forEach((k,i)=>{if(!Number.isFinite(k.at)||k.at<0||k.at>info.duration||!finitePoint(k.position)||i>0&&k.at<=keys[i-1].at)throw new RangeError('Invalid root track');});}
    if(clip.faceTrack){if(source.kind!=='human')throw new RangeError('Face tracks require a human source');clip.faceTrack.forEach((k,i)=>{if(!Number.isFinite(k.at)||k.at<0||k.at>info.duration||i>0&&k.at<=clip.faceTrack![i-1].at||k.blink!==undefined&&typeof k.blink!=='boolean'||k.gaze!==undefined&&(!Number.isFinite(k.gaze)||Math.abs(k.gaze)>1))throw new RangeError('Invalid facial keys');});}
  }
  const editIds=new Set<string>();
  for(const edit of [...asset.celEdits??[],...asset.maskEdits??[]]){
    if(!validName(edit.id)||editIds.has(edit.id)||edit.clip!==undefined&&!own(asset.clips,edit.clip)||edit.frame!==undefined&&(!Number.isInteger(edit.frame)||edit.frame<0)||edit.target!==undefined&&edit.target!=='body'&&!layerIds.has(edit.target)||edit.space!==undefined&&!['local','socket'].includes(edit.space)||edit.space==='socket'&&!validName(edit.socket))throw new RangeError('Invalid persisted edit reference');editIds.add(edit.id);
    if('patch'in edit){validatePatch(edit.patch);if(edit.semantic!==undefined&&!validName(edit.semantic))throw new RangeError('Invalid cel semantic name');}else{if(edit.allowEmpty!==undefined&&typeof edit.allowEmpty!=='boolean'||!validName(edit.name)||!Number.isSafeInteger(edit.x)||!Number.isSafeInteger(edit.y)||!Array.isArray(edit.rows)||!edit.rows.every(r=>typeof r==='string'))throw new RangeError('Invalid semantic mask edit');}
  }
  if(editIds.size>4096)throw new RangeError('Character edit budget exceeded');
  if(asset.pixelStyle)asset.pixelStyle=createPixelStyleProfile2D(asset.pixelStyle);
  if(asset.identity){if(source.kind!=='human')throw new RangeError('Shared human portrait identity needs a human source');asset.identity={...asset.identity,body:copy({...source.style,height:asset.nativeHeight})};}
  return asset;
}
export function serializeCharacterAsset2D(asset:CharacterAsset2D):string{return JSON.stringify(createCharacterAsset2D(asset),null,2);}
export function parseCharacterAsset2D(json:string):CharacterAsset2D{if(typeof json!=='string'||json.length>64*1024*1024)throw new RangeError('Character JSON exceeds 64 MiB');return createCharacterAsset2D(JSON.parse(json));}
export function editCharacterCel2D(asset:CharacterAsset2D,edit:CharacterCelEdit2D):CharacterAsset2D{return createCharacterAsset2D({...asset,celEdits:[...(asset.celEdits??[]).filter(e=>e.id!==edit.id),edit]});}
export function paintCharacterSemanticMask2D(asset:CharacterAsset2D,edit:CharacterMaskEdit2D):CharacterAsset2D{return createCharacterAsset2D({...asset,maskEdits:[...(asset.maskEdits??[]).filter(e=>e.id!==edit.id),edit]});}
export function equipCharacter2D(asset:CharacterAsset2D,slot:string,item:string|null):CharacterAsset2D{return createCharacterAsset2D({...asset,loadout:{...asset.loadout,[slot]:item}});}
/** Upsert one key while preserving unrelated clips, gear, masks and cel edits. */
export function setCharacterSocketKey2D(asset:CharacterAsset2D,clipName:string,socketName:string,key:CharacterSocketKey2D,mode:CharacterSocketTrack2D['mode']='delta'):CharacterAsset2D{
  if(!own(asset.clips,clipName)||!validName(socketName))throw new RangeError('Unknown clip or invalid socket name');
  const clip=asset.clips[clipName],old=clip.socketTracks?.[socketName],keys=[...(old?.keys??[]).filter(k=>k.at!==key.at),key].sort((a,b)=>a.at-b.at);
  return createCharacterAsset2D({...asset,clips:{...asset.clips,[clipName]:{...clip,socketTracks:{...clip.socketTracks,[socketName]:{mode,keys}}}}});
}

/** A second ID-color construction pass identifies visible material ownership even when display palettes coincide. */
function humanMasks(style:HumanStyle,pose:HumanPose,sprite:HumanSprite):Record<string,Uint8Array>{
  const roles=['skin','hair','cloth','trousers','shoes'] as const,sentinel=(n:number)=>('#'+n.toString(16).padStart(6,'0'));
  const values=roles.map((_,i)=>[0,1,2,3].map(j=>sentinel(0x100100+i*0x10000+j*0x20)));
  const tagged=renderHuman2D({...style,skinRamp:values[0] as [string,string,string,string],hairRamp:values[1].slice(0,3) as [string,string,string],cloth:values[2].slice(0,3) as [string,string,string],trousers:values[3].slice(0,3) as [string,string,string],shoeRamp:values[4].slice(0,3) as [string,string,string]},pose);
  const map=new Map<number,string>();values.forEach((colors,i)=>colors.forEach(c=>map.set(hex(c)>>>0,roles[i])));
  const masks=maskMap();for(const name of [...roles,'body','head','hands','outline','features','solidSubject'])masks[name]=new Uint8Array(sprite.w*sprite.h);
  const r=sprite.rig;
  for(let i=0;i<sprite.pixels.length;i++)if(sprite.mask.data[i]){
    masks.body[i]=masks.solidSubject[i]=1;const role=map.get(tagged.pixels[i]>>>0);if(role)masks[role][i]=1;else masks.features[i]=1;
    const x=sprite.x+i%sprite.w+.5,y=sprite.y+Math.floor(i/sprite.w)+.5;
    if(Math.hypot((x-r.head[0])/9,(y-r.head[1])/12)<=r.scale)masks.head[i]=1;
    if(role==='skin'&&[r.leftHand,r.rightHand].some(p=>Math.hypot(x-p[0],y-p[1])<=6*r.scale))masks.hands[i]=1;
    if(style.outline!==null&&sprite.pixels[i]===(hex(style.outline??'#252633')>>>0))masks.outline[i]=1;
  }
  return masks;
}
function clipLayer(clip:SpriteClip2D,time:number,id:string,semantic:string,order:number,kind:'surface'|'optical'):NativeLayer{
  const index=clip.frameAt(time),pixels=index<0?new Uint32Array(clip.width*clip.height):clip.framePixels(index),mask=Uint8Array.from(pixels,c=>c>>>24?1:0);
  const sprite:RasterSprite2D={x:-clip.pivot[0],y:-clip.pivot[1],w:clip.width,h:clip.height,pixels,mask:{w:clip.width,h:clip.height,data:mask}};
  return{id,sprite,masks:{[semantic]:mask.slice()},emission:index<0?null:clip.frameEmission(index),emissionKind:kind,order,semantic};
}
function transformedLayer(layer:NativeLayer,m:PixelTransform2D):NativeLayer{
  if(m[0]===1&&m[1]===0&&m[2]===0&&m[3]===1&&Number.isInteger(m[4])&&Number.isInteger(m[5])&&Number.isInteger(layer.sprite.x)&&Number.isInteger(layer.sprite.y))return{...layer,sprite:{...layer.sprite,x:layer.sprite.x+m[4],y:layer.sprite.y+m[5]}};
  const sprite=transformSprite2D(layer.sprite,m),inverse=invertPixelTransform2D(m),masks=maskMap(),emission=layer.emission?emptyEmission(sprite):null;
  for(const name of Object.keys(layer.masks))masks[name]=new Uint8Array(sprite.w*sprite.h);
  for(let y=0;y<sprite.h;y++)for(let x=0;x<sprite.w;x++){
    const q=transformPixelPoint2D(inverse,[sprite.x+x+.5,sprite.y+y+.5]),sx=Math.floor(q[0]-layer.sprite.x),sy=Math.floor(q[1]-layer.sprite.y);
    if(sx<0||sy<0||sx>=layer.sprite.w||sy>=layer.sprite.h)continue;const i=y*sprite.w+x,j=sy*layer.sprite.w+sx;
    for(const[name,data]of Object.entries(layer.masks))masks[name][i]=data[j];
    if(emission&&layer.emission)emission.set(layer.emission.subarray(j*3,j*3+3),i*3);
  }
  return{...layer,sprite,masks,emission};
}
function editLayer(layer:NativeLayer,asset:CharacterAsset2D,clip:string,frame:number,sockets:Record<string,CharacterSocket2D>):void{
  const matches=(e:{target?:string;clip?:string;frame?:number})=>(e.target??'body')===layer.id&&(e.clip===undefined||e.clip===clip)&&(e.frame===undefined||e.frame===frame);
  const visit=(patch:{x:number;y:number;rows:readonly string[]},space:'local'|'socket'|undefined,socketName:string|undefined,fn:(i:number,symbol:string)=>void)=>{
    const socket=space==='socket'?sockets[socketName!]:undefined;if(space==='socket'&&!socket)throw new RangeError('Unknown edit socket: '+socketName);
    const inverse=invertPixelTransform2D(socket?socketTransform2D(socket):pixelTransform2D()),rows=patch.rows.map(r=>[...r]);
    for(let y=0;y<layer.sprite.h;y++)for(let x=0;x<layer.sprite.w;x++){
      const p=transformPixelPoint2D(inverse,[layer.sprite.x+x+.5,layer.sprite.y+y+.5]),row=Math.floor(p[1]-patch.y),col=Math.floor(p[0]-patch.x);
      if(row<0||row>=rows.length||col<0||col>=rows[row].length)continue;fn(y*layer.sprite.w+x,rows[row][col]);
    }
  };
  for(const e of asset.celEdits??[])if(matches(e))visit(e.patch,e.space,e.socket,(i,symbol)=>{
    if(!own(e.patch.palette,symbol))return;const value=e.patch.palette[symbol],color=value===null?0:value>>>0;
    layer.sprite.pixels[i]=color;layer.sprite.mask.data[i]=color>>>24?1:0;
    if(!(color>>>24)){for(const mask of Object.values(layer.masks))mask[i]=0;if(layer.emission)layer.emission.fill(0,i*3,i*3+3);}
    else{(layer.masks[e.semantic??layer.semantic]??=new Uint8Array(layer.sprite.w*layer.sprite.h))[i]=1;if(layer.id==='body'){(layer.masks.body??=new Uint8Array(layer.sprite.w*layer.sprite.h))[i]=1;}}
  });
  for(const e of asset.maskEdits??[])if(matches(e)){
    const data=layer.masks[e.name]??=new Uint8Array(layer.sprite.w*layer.sprite.h);
    visit(e,e.space,e.socket,(i,symbol)=>{if(symbol==='+')data[i]=e.allowEmpty||e.name==='negativeSpace'?1:layer.sprite.mask.data[i]?1:0;else if(symbol==='-')data[i]=0;});
  }
}
function drawLayer(p:Painter,layer:NativeLayer,alpha=1):void{
  blitSprite2D(p,layer.sprite,alpha);
  if(!layer.emission)return;const s=layer.sprite,emission=layer.emission,gain=Math.max(0,alpha*p.fade*p.lightK);
  if(!(gain>0))return;
  p.each(s.x,s.y,s.x+s.w,s.y+s.h,(x,y,sx,sy)=>{const ix=Math.floor(x-s.x),iy=Math.floor(y-s.y);if(ix<0||iy<0||ix>=s.w||iy>=s.h)return;const j=(iy*s.w+ix)*3,i=(sy-p.frame.oy)*p.frame.w+sx-p.frame.ox;addLinearLight2D(p.frame,i,emission[j]*gain,emission[j+1]*gain,emission[j+2]*gain,layer.emissionKind);});
}
function assembled(layers:readonly NativeLayer[],bounds:{x0:number;y0:number;x1:number;y1:number},emptyMasks:ReadonlySet<string>):NativeLayer{
  const x=Math.floor(bounds.x0),y=Math.floor(bounds.y0),w=Math.max(1,Math.ceil(bounds.x1)-x),h=Math.max(1,Math.ceil(bounds.y1)-y);
  if(w*h>4_194_304)throw new RangeError('Character assembly exceeds four million native cells');
  const frame:PaintFrame={w,h,ox:x,oy:y,color:new Uint32Array(w*h),light:new Uint32Array(w*h)},p=new Painter(frame),masks=maskMap();
  for(const layer of layers){drawLayer(p,layer);const s=layer.sprite,empty=Object.entries(layer.masks).filter(([name])=>emptyMasks.has(name)).map(([,data])=>data);
    for(let yy=0;yy<s.h;yy++)for(let xx=0;xx<s.w;xx++){
      const src=yy*s.w+xx;if(!s.mask.data[src]&&!empty.some(data=>data[src]))continue;const dx=Math.floor(s.x+xx-x),dy=Math.floor(s.y+yy-y);if(dx<0||dy<0||dx>=w||dy>=h)continue;const dest=dy*w+dx;
      if(s.mask.data[src])for(const m of Object.values(masks))m[dest]=0;
      for(const[name,data]of Object.entries(layer.masks))if(data[src])(masks[name]??=new Uint8Array(w*h))[dest]=1;
    }
  }
  const sprite:RasterSprite2D={x,y,w,h,pixels:frame.color,mask:{w,h,data:Uint8Array.from(frame.color,c=>c>>>24?1:0)}};
  return{id:'assembly',sprite,masks,emission:frame.hdrLight??null,emissionKind:'surface',semantic:'body',order:0};
}

/** Compile clips/layers once, then seek without retaining gameplay or spring state. */
export function createCharacterPlayer2D(input:CharacterAsset2D){
  const asset=createCharacterAsset2D(input),source=asset.source,clips=Object.freeze(Object.keys(asset.clips));
  const metadata=new Map(clips.map(name=>[name,clipMetadata(source,asset.clips[name])]));
  const socketTracksByClip=new Map(clips.map(name=>[name,new Map(Object.entries(asset.clips[name].socketTracks??{}).map(([socket,track])=>[socket,compileCharacterSocketTrack2D(track,metadata.get(name)!.duration)]))]));
  const spriteClips=new Map<string,SpriteClip2D>(),poseClips=new Map<string,ReturnType<typeof compileHumanPoseClip2D>>();
  for(const name of clips){const clip=asset.clips[name];if(clip.kind==='sprite')spriteClips.set(name,createSpriteClip2D(clip.data??(source as {clip:SpriteClipData2D}).clip,clip.options??(source.kind==='sprite'?source.options:undefined)));if(clip.kind==='key-pose')poseClips.set(name,compileHumanPoseClip2D(clip.poses));}
  const rig=source.kind==='creature-rig'?compileCreatureRig2D(source.rig):undefined;
  const allLayerDefs=[...asset.layers??[],...Object.values(asset.equipment??{}).flatMap(item=>item.layers)];
  const layerClips=new Map(allLayerDefs.map(l=>[l.id,createSpriteClip2D(l.clip,{loop:true,...l.options})]));
  const layerSocketNames=new Map(allLayerDefs.map(l=>[l.id,new Set(l.generator?['weapon.base','weapon.tip','weapon.edge',...(l.generator==='human-bow'?['bow.upperTip','bow.lowerTip','bow.nock','muzzle']:[])]:l.clip.frames.flatMap(frame=>Object.keys(frame.sockets??{})))]));
  const style=asset.pixelStyle?compilePixelStyle2D(asset.pixelStyle):undefined,emptyMasks=new Set(['negativeSpace',...(asset.maskEdits??[]).filter(e=>e.allowEmpty).map(e=>e.name)]);
  let reach=asset.nativeHeight*1.7;
  for(const l of allLayerDefs)reach=Math.max(reach,asset.nativeHeight+Math.max(Math.hypot(...l.clip.pivot),Math.hypot(l.clip.width-l.clip.pivot[0],l.clip.height-l.clip.pivot[1]))+Math.hypot(...l.offset??[0,0]));
  if(source.kind==='sprite')reach=Math.max(reach,Math.hypot(source.clip.width,source.clip.height)+Math.hypot(...source.clip.pivot));
  if(rig)reach=Math.max(reach,Math.abs(rig.bounds.x0),Math.abs(rig.bounds.y0),Math.abs(rig.bounds.x1),Math.abs(rig.bounds.y1));
  for(const compiled of poseClips.values())for(const key of compiled.clip.keys)for(const value of Object.values(key.pose))if(Array.isArray(value)&&finitePoint(value))reach=Math.max(reach,Math.hypot(...value)*asset.nativeHeight/96+asset.nativeHeight);
  if(clips.some(name=>asset.clips[name].kind==='human'&&(asset.clips[name] as {action:HumanAnimation2D}).action==='bow'))reach=Math.max(reach,asset.nativeHeight*3);
  const nativeReach=reach;
  for(const clip of Object.values(asset.clips))for(const track of Object.values(clip.socketTracks??{}))for(const key of track.keys){const scale=key.basisX&&key.basisY?Math.hypot(...key.basisX)+Math.hypot(...key.basisY):1;reach=Math.max(reach,nativeReach*Math.max(1,scale)+Math.hypot(...key.position??[0,0]));}
  const bounds={x0:-Math.ceil(reach),y0:-Math.ceil(reach),x1:Math.ceil(reach),y1:Math.ceil(reach)},boundsCache=new Map<string,typeof bounds>();
  const releaseCorrections=new Map<string,PixelTransform2D>();
  const player={asset,clips,bounds,
    /** Exact envelope for this export frame grid, with two native cells of guard padding. */
    boundsForClip(clipName=asset.defaultClip,fps=30){
      if(!Number.isInteger(fps)||fps<1||fps>240)throw new RangeError('Bounds cadence must be 1..240 fps');const info=metadata.get(clipName);if(!info)throw new RangeError('Unknown character clip: '+clipName);const key=clipName+'@'+fps,cached=boundsCache.get(key);if(cached)return{...cached};
      const n=Math.ceil(info.duration*fps);if(n>28800)throw new RangeError('Clip bounds frame budget exceeded');const box={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};for(let i=0;i<Math.max(1,n);i++){const b=player.sample(i/fps,clipName).bounds;box.x0=Math.min(box.x0,b.x0);box.y0=Math.min(box.y0,b.y0);box.x1=Math.max(box.x1,b.x1);box.y1=Math.max(box.y1,b.y1);}const result={x0:Math.floor(box.x0)-2,y0:Math.floor(box.y0)-2,x1:Math.ceil(box.x1)+2,y1:Math.ceil(box.y1)+2};boundsCache.set(key,result);return{...result};
    },
    clipInfo(clipName=asset.defaultClip){const info=metadata.get(clipName);if(!info)throw new RangeError('Unknown character clip: '+clipName);return copy(info);},
    createEventCursor(clipName=asset.defaultClip){const info=metadata.get(clipName);if(!info)throw new RangeError('Unknown character clip: '+clipName);return createCharacterEventCursor2D(info.duration,info.events,info.loop);},
    sample(time:number,clipName=asset.defaultClip,options:CharacterSampleOptions2D={}):CharacterSample2D{
      if(!Number.isFinite(time)||Math.abs(time)>1e9||!Number.isFinite(options.x??0)||!Number.isFinite(options.y??0))throw new RangeError('Character sample needs finite time and placement');
      if(!own(asset.clips,clipName))throw new RangeError('Unknown character clip: '+clipName);
      const clip=asset.clips[clipName],info=metadata.get(clipName)!,t=clip.fps?Math.floor((clip.kind==='sprite'?time:Math.max(0,time))*clip.fps)/clip.fps:clip.kind==='sprite'?time:Math.max(0,time),wrappedTime=characterClipTime2D(t,info.duration,info.loop),phaseTime=wrappedTime.time;
      const socketTracks=options.ignoreSocketTracks?undefined:socketTracksByClip.get(clipName);
      const correctSocket=(name:string,baseline:CharacterSocket2D|undefined,at=phaseTime)=>{const track=socketTracks?.get(name);return track?applyCharacterSocketKey2D(baseline,track.sample(at),track.mode):baseline;};
      let sockets:Record<string,CharacterSocket2D>=Object.create(null),rootMotion:[number,number]=[0,0],contacts={left:false,right:false};
      let frameIndex=Math.floor(phaseTime*(clip.fps??60)),body:NativeLayer,humanPose:HumanPose|undefined,currentHumanStyle:HumanStyle|undefined;const projectiles:RasterSprite2D[]=[];
      if(clip.kind==='human'||clip.kind==='key-pose'){
        const humanStyle:HumanStyle={...(source as {style:HumanStyle}).style,height:asset.nativeHeight};let sprite:HumanSprite,pose:HumanPose;
        if(clip.kind==='human'){const sampled=sampleHumanAnimation2D(clip.action,t,humanStyle,{weaponPixels:false,rootMotion:clip.rootMotion??false});({sprite,pose,sockets,rootMotion,contacts}=sampled);}
        else{const key=poseClips.get(clipName)!.sample(t);pose=key.pose;rootMotion=key.rootMotion;contacts=key.contacts;sprite=renderHuman2D(humanStyle,pose);sockets=humanSockets2D(sprite);}
        const face=clip.faceTrack?.filter(key=>key.at<=phaseTime).at(-1);if(face){pose={...pose,...(face.blink===undefined?{}:{blink:face.blink}),...(face.gaze===undefined?{}:{gaze:face.gaze})};sprite=renderHuman2D(humanStyle,pose);}
        humanPose=pose;currentHumanStyle=humanStyle;body={id:'body',sprite,masks:humanMasks(humanStyle,pose,sprite),emission:null,emissionKind:'surface',order:0,semantic:'body'};
      }else if(clip.kind==='creature'){
        const creatureStyle={...(source as {style:CreatureStyle}).style,size:asset.nativeHeight},sprite=renderCreature2D(creatureStyle,clip.motion,t),r=sprite.rig,near=r.legs.find(l=>l.name==='nearFront'),far=r.legs.find(l=>l.name==='farFront'),flip=r.facing==='left';
        sockets={root:characterSocket2D([0,0],0,0,flip),head:characterSocket2D(r.head,0,0,flip),chest:characterSocket2D(r.root,0,0,flip),mouth:characterSocket2D([r.head[0]+(flip?-7:7)*r.scale,r.head[1]+3*r.scale],0,0,flip),hand:characterSocket2D(near?.toe??r.head),otherHand:characterSocket2D(far?.toe??r.head),foot:characterSocket2D(near?.toe??[0,0]),otherFoot:characterSocket2D(far?.toe??[0,0])};
        sockets['hand.grip']=sockets.hand;rootMotion=[clip.rootMotion?r.travelSpeed*t*(flip?-1:1):0,0];contacts={left:near?.contact??false,right:far?.contact??false};
        body={id:'body',sprite,masks:{body:sprite.mask.data.slice(),solidSubject:sprite.mask.data.slice()},emission:null,emissionKind:'surface',order:0,semantic:'body'};
      }else if(clip.kind==='creature-rig'){
        const sampled=rig!.sample(t);sockets=sampled.sockets;body={id:'body',sprite:sampled.sprite,masks:{...sampled.semanticMasks,body:sampled.sprite.mask.data.slice(),solidSubject:sampled.sprite.mask.data.slice()},emission:null,emissionKind:'surface',order:0,semantic:'body'};
      }else{
        const c=spriteClips.get(clipName)!;frameIndex=c.frameAt(t);body=clipLayer(c,t,'body','body',0,clip.options?.emissionKind??(source.kind==='sprite'?source.options?.emissionKind:undefined)??'optical');
        sockets.root=characterSocket2D([0,0]);if(frameIndex>=0)for(const[name,socket]of Object.entries(c.frameSockets(frameIndex))){sockets[name]=characterSocket2D([socket.x-c.pivot[0],socket.y-c.pivot[1]],socket.angle??0);sockets[name].visible=socket.visible??true;if(socket.basisX&&socket.basisY){sockets[name].basisX=[...socket.basisX];sockets[name].basisY=[...socket.basisY];}sockets[name].mirrorPolicy=socket.mirrorPolicy??'authored';}
        body.masks.solidSubject=body.sprite.mask.data.slice();
      }
      if(clip.rootTrack){const keys=clip.rootTrack;let a=keys[0],b=a;for(const key of keys){if(key.at<=phaseTime)a=key;else{b=key;break;}b=a;}const u=b.at>a.at?(phaseTime-a.at)/(b.at-a.at):0,cycles=wrappedTime.cycle,first=keys[0].position,last=keys[keys.length-1].position;rootMotion=[a.position[0]+(b.position[0]-a.position[0])*u+cycles*(last[0]-first[0]),a.position[1]+(b.position[1]-a.position[1])*u+cycles*(last[1]-first[1])];}
      sockets.root??=characterSocket2D([0,0]);sockets.head??=characterSocket2D([0,body.sprite.y]);sockets.chest??=characterSocket2D([0,body.sprite.y+body.sprite.h*.45]);
      for(const name of ['hand','otherHand','foot','otherFoot'])sockets[name]??=characterSocket2D(name.includes('oot')?[0,0]:sockets.chest.position);
      sockets['hand.grip']??=sockets.hand;
      for(const name of socketTracks?.keys()??[]){const corrected=correctSocket(name,sockets[name]);if(corrected)sockets[name]=corrected;}
      const sourceVisible=clip.kind!=='sprite'||frameIndex>=0;if(!sourceVisible)for(const socket of Object.values(sockets))socket.visible=false;
      if(sourceVisible)editLayer(body,asset,clipName,frameIndex,sockets);
      const selected:{definition:CharacterLayer2D;slot?:CharacterSlot2D}[]=(asset.layers??[]).map(definition=>({definition}));
      const loadout={...asset.loadout,...clip.loadout};for(const slot of asset.slots??[]){const item=loadout[slot.id];if(item)for(const definition of asset.equipment![item].layers)selected.push({definition,slot});}
      const layers:NativeLayer[]=[body];
      for(const{definition:l,slot}of selected){
        if(!sourceVisible)continue;
        const hidePublishedSockets=(visibleNames?:ReadonlySet<string>)=>{for(const name of layerSocketNames.get(l.id)??[])if(!visibleNames?.has(name))sockets[name]={...(sockets[name]??characterSocket2D([0,0])),visible:false};};
        if(l.visibleIn&&!l.visibleIn.includes(clipName)){hidePublishedSockets();continue;}
        const attachmentName=l.generator?'hand.grip':l.socket??slot?.socket??'root',socket=sockets[attachmentName];if(!socket)throw new RangeError('Unknown equipment socket: '+attachmentName);if(!socket.visible){hidePublishedSockets();continue;}
        const localTime=l.secondary?.loop?phaseTime%l.secondary.duration:phaseTime,secondary=l.secondary?sampleSecondaryMotion2D(l.secondary.keys,localTime):0;
        const transform=composePixelTransform2D(socketTransform2D(socket),pixelTransform2D(l.offset?.[0]??0,l.offset?.[1]??0,(l.angle??0)+secondary));
        const nativeClip=layerClips.get(l.id)!;let layer:NativeLayer;
        if(l.generator&&humanPose&&currentHumanStyle){
          const kind=l.generator==='human-sword'?'sword':'bow',weapon=clip.kind==='human'&&clip.action===kind?renderHumanWeapon2D(kind,t,currentHumanStyle):renderHumanWeaponPose2D(kind,humanPose,currentHumanStyle);
          layer={id:l.id,sprite:weapon.held,masks:{[l.semantic]:weapon.held.mask.data.slice()},emission:null,emissionKind:'surface',order:l.order??slot?.order??1,semantic:l.semantic};
          const weaponSockets=humanSockets2D(weapon.actor,weapon.sample.geometry),nativeGrip=weaponSockets['hand.grip'],desiredGrip=correctSocket('hand.grip',nativeGrip)!;
          const correctionFor=(base:CharacterSocket2D,at:number):PixelTransform2D=>{
            const key=socketTracks?.get('hand.grip')?.sample(at);if(!key)return pixelTransform2D();
            const corrected=applyCharacterSocketKey2D(base,key,socketTracks!.get('hand.grip')!.mode)!,m=composePixelTransform2D(socketTransform2D(corrected),invertPixelTransform2D(socketTransform2D(base))),identity=pixelTransform2D();
            return m.every((v,i)=>Math.abs(v-identity[i])<1e-10)?identity:m;
          };
          const correction=correctionFor(nativeGrip,phaseTime);
          layer=transformedLayer(layer,correction);
          for(const[name,point]of Object.entries(weaponSockets))if(name.startsWith('weapon.')||name.startsWith('bow.')||name==='muzzle')sockets[name]=correctSocket(name,transformCharacterSocket2D(point,correction))!;
          sockets['hand.grip']=desiredGrip;
          if(weapon.projectile){
            // A released arrow retains the correction at release; later hand keys cannot drag it in flight.
            if(!socketTracks?.has('hand.grip'))projectiles.push(weapon.projectile);
            else{let releaseCorrection=releaseCorrections.get(clipName);if(!releaseCorrection){const release=HUMAN_WEAPON_TIMING.bow.cue,atRelease=renderHumanWeapon2D('bow',release,currentHumanStyle),releaseGrip=humanSockets2D(atRelease.actor,atRelease.sample.geometry)['hand.grip'];releaseCorrection=correctionFor(releaseGrip,release);releaseCorrections.set(clipName,releaseCorrection);}projectiles.push(transformSprite2D(weapon.projectile,releaseCorrection));}
          }
        }else{
          layer=transformedLayer(clipLayer(nativeClip,t,l.id,l.semantic,l.order??slot?.order??1,l.options?.emissionKind??'surface'),transform);
          const sourceFrame=nativeClip.frameAt(t),frameSockets=sourceFrame>=0?nativeClip.frameSockets(sourceFrame):{};hidePublishedSockets(new Set(Object.keys(frameSockets)));
          for(const[name,point]of Object.entries(frameSockets)){const local=characterSocket2D([point.x-nativeClip.pivot[0],point.y-nativeClip.pivot[1]],point.angle??0);local.visible=point.visible??true;if(point.basisX&&point.basisY){local.basisX=[...point.basisX];local.basisY=[...point.basisY];}local.mirrorPolicy=point.mirrorPolicy??'authored';sockets[name]=correctSocket(name,transformCharacterSocket2D(local,transform))!;}
        }
        editLayer(layer,asset,clipName,frameIndex,sockets);
        if(l.occludedBy?.length){const base=body.sprite;
          for(let yy=0;yy<layer.sprite.h;yy++)for(let xx=0;xx<layer.sprite.w;xx++){
            const px=Math.floor(layer.sprite.x+xx+.5-base.x),py=Math.floor(layer.sprite.y+yy+.5-base.y);if(px<0||py<0||px>=base.w||py>=base.h)continue;const bi=py*base.w+px;
            if(!l.occludedBy.some(name=>body.masks[name]?.[bi]))continue;const i=yy*layer.sprite.w+xx;layer.sprite.pixels[i]=0;layer.sprite.mask.data[i]=0;for(const mask of Object.values(layer.masks))mask[i]=0;layer.emission?.fill(0,i*3,i*3+3);
          }
        }
        layers.push(layer);
      }
      const dx=(options.x??0)+(options.applyRootMotion?rootMotion[0]:0),dy=(options.y??0)+(options.applyRootMotion?rootMotion[1]:0),placement=pixelTransform2D(dx,dy);
      for(const[name,socket]of Object.entries(sockets))sockets[name]=transformCharacterSocket2D(socket,placement);
      const placed=layers.sort((a,b)=>a.order-b.order).map(layer=>{
        if(style){layer.sprite=style.apply(layer.sprite,t,{objectToWorld:placement,...options.pixelContext});if(style.profile.emission==='none')layer.emission=null;for(const[name,mask]of Object.entries(layer.masks))if(!emptyMasks.has(name))for(let i=0;i<mask.length;i++)if(!layer.sprite.mask.data[i])mask[i]=0;}
        return transformedLayer(layer,placement);
      });
      const placedProjectiles=projectiles.map(sprite=>transformSprite2D(sprite,placement));
      const sampleBounds={x0:Math.min(...placed.map(l=>l.sprite.x)),y0:Math.min(...placed.map(l=>l.sprite.y)),x1:Math.max(...placed.map(l=>l.sprite.x+l.sprite.w)),y1:Math.max(...placed.map(l=>l.sprite.y+l.sprite.h))},flat=assembled(placed,sampleBounds,emptyMasks);
      const drawingBounds={...sampleBounds};for(const s of placedProjectiles){drawingBounds.x0=Math.min(drawingBounds.x0,s.x);drawingBounds.y0=Math.min(drawingBounds.y0,s.y);drawingBounds.x1=Math.max(drawingBounds.x1,s.x+s.w);drawingBounds.y1=Math.max(drawingBounds.y1,s.y+s.h);}
      const anchors:ActorAnchors2D={root:sockets.root.position,head:sockets.head.position,chest:sockets.chest.position,hand:sockets.hand.position,otherHand:sockets.otherHand.position,foot:sockets.foot.position,otherFoot:sockets.otherFoot.position};
      const actor:AdaptedActor2D={...flat.sprite,renderSource:'pixels',k:asset.nativeHeight/19,head:[anchors.head[0],flat.sprite.y],chest:[...anchors.chest],anchors};
      return{actor,bounds:drawingBounds,pivot:[-flat.sprite.x,-flat.sprite.y],anchors,sockets,semanticMasks:flat.masks,rootMotion,frameIndex,clip:clipName,...info,contacts,emission:flat.emission??emptyEmission(flat.sprite),projectiles:placedProjectiles,
        drawBack(p:Painter,alpha=1){for(const layer of placed)if(layer.order<0)drawLayer(p,layer,alpha);},
        drawFront(p:Painter,alpha=1){for(const layer of placed)if(layer.order>=0)drawLayer(p,layer,alpha);for(const projectile of placedProjectiles)blitSprite2D(p,projectile,alpha);}};
    },
    draw(painter:Painter,time:number,clipName=asset.defaultClip,options:CharacterSampleOptions2D={}):CharacterSample2D{const sampled=player.sample(time,clipName,options);sampled.drawBack(painter);sampled.drawFront(painter);return sampled;}
  };
  return player;
}

function nativeLayerClip(width:number,height:number,pivot:readonly[number,number],paint:(p:Painter)=>void):SpriteClipData2D{
  const frame:PaintFrame={w:width,h:height,ox:0,oy:0,color:new Uint32Array(width*height),light:new Uint32Array(width*height)},p=new Painter(frame);paint(p);
  return{version:1,width,height,pivot,frames:[{durationMs:1000,runs:encodeSpritePixels2D(frame.color)}]};
}
/** Original Wayfarer study: native geometry, replaceable equipment, held poses and baked cape/hair. */
export function createStudioCharacter2D(options:{id?:string;name?:string;height?:number;view?:HumanStyle['view'];facing?:HumanStyle['facing'];style?:HumanStyle}={}):CharacterAsset2D{
  const height=options.height??options.style?.height??96,s=height/96;
  const humanStyle:HumanStyle={view:'three-quarter',build:'regular',skin:'warm',hair:'bob',hairColor:'chestnut',faceShape:'oval',outfit:'jacket',cloth:['#293e54','#41677b','#77a49a'],trousers:['#35354b','#515268','#797785'],outline:'#242635',...options.style,height,...(options.view?{view:options.view}:{}),...(options.facing?{facing:options.facing}:{})};
  const swordW=Math.max(12,Math.ceil(43*s)),swordH=Math.max(7,Math.ceil(13*s)),swordPivot:[number,number]=[Math.ceil(6*s),Math.floor(swordH/2)];
  const sword=nativeLayerClip(swordW,swordH,swordPivot,p=>{const x=swordPivot[0],y=swordPivot[1];p.poly([[x+4*s,y-2*s],[x+30*s,y-2*s],[x+35*s,y],[x+30*s,y+2*s],[x+4*s,y+2*s]],hex('#9faebc'));p.line(x+5*s,y-1*s,x+31*s,y-1*s,hex('#e2e8da'));p.rect(x-5*s,y-1*s,9*s,3*s,hex('#76513e'));p.rect(x+3*s,y-5*s,2*s,10*s,hex('#c3a46a'));});
  const bowW=Math.max(9,Math.ceil(20*s)),bowH=Math.max(16,Math.ceil(43*s)),bowPivot:[number,number]=[Math.ceil(16*s),Math.floor(bowH/2)];
  const bow=nativeLayerClip(bowW,bowH,bowPivot,p=>{const x=bowPivot[0]-12*s,y=bowPivot[1];p.polyline([[x,y-19*s],[x+8*s,y-14*s],[x+12*s,y],[x+8*s,y+14*s],[x,y+19*s]],hex('#b88a57'));p.line(x,y-19*s,x,y+19*s,hex('#c5c5ae'));p.rect(x+10*s,y-3*s,3*s,6*s,hex('#614b42'));});
  const capeW=Math.max(10,Math.ceil(33*s)),capeH=Math.max(10,Math.ceil(46*s)),capePivot:[number,number]=[Math.floor(capeW/2),Math.ceil(3*s)];
  const cape=nativeLayerClip(capeW,capeH,capePivot,p=>{const[cx,cy]=capePivot;p.poly([[cx-5*s,cy],[cx+6*s,cy],[cx+14*s,cy+35*s],[cx+8*s,cy+40*s],[cx-12*s,cy+38*s]],hex('#563b56'));p.poly([[cx-4*s,cy+2*s],[cx+1*s,cy+3*s],[cx+6*s,cy+35*s],[cx-6*s,cy+34*s]],hex('#805477'));p.line(cx-6*s,cy+36*s,cx+8*s,cy+38*s,hex('#b28a90'));});
  const strandW=Math.max(4,Math.ceil(10*s)),strandH=Math.max(8,Math.ceil(24*s)),strandPivot:[number,number]=[Math.floor(strandW/2),Math.ceil(2*s)];
  const strand=nativeLayerClip(strandW,strandH,strandPivot,p=>{const[x,y]=strandPivot;p.poly([[x-2*s,y],[x+2*s,y],[x+3*s,y+12*s],[x-1*s,y+20*s],[x-3*s,y+15*s]],hex('#7b4e3b'));p.line(x,y+3*s,x+1*s,y+12*s,hex('#a36c48'));p.rect(x-2*s,y+6*s,4*s,2*s,hex('#c3a46a'));});
  const capeKeys=bakeSecondaryMotion2D({duration:2,targets:[{at:0,angle:-.08},{at:.35,angle:.22},{at:.8,angle:-.22},{at:1.3,angle:.16},{at:1.8,angle:-.08},{at:2,angle:-.08}],maxAngle:.3});
  // A closed-period hand-authored correction keeps the exported secondary loop seamless.
  const first=capeKeys[0].angle,last=capeKeys[capeKeys.length-1].angle;for(const key of capeKeys)key.angle+=(first-last)*(key.at/2);
  const clips:Record<string,CharacterClip2D>={};
  for(const action of HUMAN_ANIMATIONS_2D)clips[action]={kind:'human',action,...(action==='run'||action==='walk'?{rootMotion:true}:{}),loadout:{mainHand:action==='sword'?'wayfarer-sword':action==='bow'?'wayfarer-bow':null}};
  clips['key-strike']={kind:'key-pose',fps:12,poses:{duration:1.2,loop:false,keys:[
    {at:0,interpolation:'hold',pose:{lean:-5,leftHand:[-9,-39],rightHand:[12,-45],leftFoot:[-10,-4],rightFoot:[10,-4],fists:true,armsFront:true}},
    {at:.3,interpolation:'linear',pose:{lean:-10,leftHand:[-17,-46],rightHand:[10,-48],leftFoot:[-14,-4],rightFoot:[9,-4],fists:true,armsFront:true}},
    {at:.5,interpolation:'hold',pose:{lean:8,leftHand:[38,-48],rightHand:[6,-42],leftFoot:[-16,-4],rightFoot:[18,-4],fists:true,armsFront:true}},
    {at:.65,interpolation:'smooth',pose:{lean:3,leftHand:[27,-43],rightHand:[8,-45],leftFoot:[-14,-4],rightFoot:[16,-4],fists:true,armsFront:true}},
    {at:1.2,interpolation:'hold',pose:{lean:-5,leftHand:[-9,-39],rightHand:[12,-45],leftFoot:[-10,-4],rightFoot:[10,-4],fists:true,armsFront:true}}
  ],contacts:[{at:0,left:true,right:true}],events:[{id:'strike-impact',at:.5,kind:'contact',socket:'hand.grip'}]},loadout:{mainHand:null}};
  clips.idle={...clips.idle,faceTrack:[{at:0,blink:false,gaze:0},{at:1.48,blink:true},{at:1.64,blink:false}]};
  const id=options.id??'wayfarer',name=options.name??'Wayfarer';
  return createCharacterAsset2D({schema:'poku.character/v1',id,name,nativeHeight:height,source:{kind:'human',style:humanStyle},identity:createCharacterIdentity2D(id,name,humanStyle),defaultClip:'idle',clips,
    slots:[{id:'mainHand',socket:'hand.grip',order:10},{id:'back',socket:'chest',order:-20}],
    equipment:{'wayfarer-sword':{id:'wayfarer-sword',slots:['mainHand'],layers:[{id:'sword',clip:sword,generator:'human-sword',semantic:'metal',occludedBy:['hands']}]},'wayfarer-bow':{id:'wayfarer-bow',slots:['mainHand'],layers:[{id:'bow',clip:bow,generator:'human-bow',semantic:'wood',occludedBy:['hands']}]},'wayfarer-cape':{id:'wayfarer-cape',slots:['back'],layers:[{id:'cape',clip:cape,semantic:'cloth',offset:[-3*s,-6*s],secondary:{duration:2,loop:true,keys:capeKeys}}]}},
    loadout:{mainHand:null,back:'wayfarer-cape'},layers:[{id:'hair-lock',socket:'head',order:-10,clip:strand,offset:[-7*s,0],angle:.1,semantic:'hair',secondary:{duration:2,loop:true,keys:capeKeys.map(k=>({at:k.at,angle:-k.angle*.6}))}}],celEdits:[],maskEdits:[]});
}

/** Bake planted-foot corrections into portable root keys. Two-foot constraints report residual error. */
export function bakeCharacterFootPlant2D(input:CharacterAsset2D,clipName:string,options:{fps?:number}={}):{asset:CharacterAsset2D;maxResidual:number;samples:number}{
  const fps=options.fps??120;if(!Number.isInteger(fps)||fps<15||fps>240)throw new RangeError('Foot-plant bake uses 15..240 samples per second');
  const asset=createCharacterAsset2D(input);if(!own(asset.clips,clipName))throw new RangeError('Unknown character clip');
  if(!['human','key-pose','creature'].includes(asset.clips[clipName].kind))throw new RangeError('Foot-plant bake requires a contact-aware human or creature clip');
  const clip={...asset.clips[clipName],rootMotion:true,rootTrack:undefined},raw=createCharacterPlayer2D({...asset,clips:{...asset.clips,[clipName]:clip}}),duration=raw.clipInfo(clipName).duration;
  if(duration>120)throw new RangeError('Foot-plant clips must not exceed 120 seconds');
  const n=Math.ceil(duration*fps),samples=[];
  for(let i=0;i<=n;i++){const time=Math.min(duration,i/fps),sample=raw.sample(time,clipName);samples.push({time,root:sample.rootMotion,left:sample.anchors.foot,right:sample.anchors.otherFoot,contacts:sample.contacts});}
  const solved=solveFootPlant2D(samples),rootTrack=solved.map(s=>({at:s.time,position:s.root}));
  return{asset:createCharacterAsset2D({...asset,clips:{...asset.clips,[clipName]:{...clip,rootTrack}}}),maxResidual:Math.max(0,...solved.map(s=>s.error)),samples:solved.length};
}
