import {humanViewMotion2D,renderHuman2D,humanRig2D,type HumanStyle,type HumanPose,type HumanMotion,type HumanSprite,type HumanPoint} from './human.js';
import {humanAction2D,HUMAN_ACTION_TIMING,type HumanAction} from './human-action.js';
import {humanCombat2D,HUMAN_COMBAT_TIMING,type HumanCombatAction} from './human-combat.js';
import {humanWeapon2D,renderHumanWeapon2D,humanGrip2D,HUMAN_WEAPON_TIMING,type HumanWeapon,type HumanWeaponGeometry,type HumanWeaponPixels} from './human-weapon.js';
import {pixelTransform2D,composePixelTransform2D,transformPixelPoint2D,type PixelTransform2D} from './sprite-raster.js';

export type HumanAnimation2D=HumanMotion|HumanAction|HumanCombatAction|HumanWeapon;
export interface CharacterEvent2D { id:string;at:number;kind:string;socket?:string;data?:Record<string,unknown> }
export interface CharacterPlaybackEvent2D extends CharacterEvent2D { time:number;cycle:number;source:'timeline'|'act'|'cue3d' }
export interface CharacterSocket2D { position:[number,number];basisX:[number,number];basisY:[number,number];visible:boolean;layer:number;mirrorPolicy:'reflect'|'swap-hand'|'authored' }
export interface HumanAnimationSample2D {
  sprite:HumanSprite;pose:HumanPose;duration:number;loop:boolean;phase:string;contacts:{left:boolean;right:boolean};
  rootMotion:[number,number];sockets:Record<string,CharacterSocket2D>;events:CharacterEvent2D[];weapon?:HumanWeaponGeometry;projectile?:HumanWeaponPixels|null;
}
export const HUMAN_ANIMATIONS_2D:readonly HumanAnimation2D[]=Object.freeze(['idle','walk','wave','guard','crouch','run','jump','punch','block','hit','sword','bow']);
export function characterSocket2D(position:HumanPoint,angle=0,layer=0,flip=false):CharacterSocket2D{
  const m=pixelTransform2D(position[0],position[1],angle,flip);return{position:[m[4],m[5]],basisX:[m[0],m[1]],basisY:[m[2],m[3]],visible:true,layer,mirrorPolicy:'reflect'};
}
export function socketTransform2D(socket:CharacterSocket2D):PixelTransform2D{return[socket.basisX[0],socket.basisX[1],socket.basisY[0],socket.basisY[1],socket.position[0],socket.position[1]];}
export function transformCharacterSocket2D(socket:CharacterSocket2D,transform:PixelTransform2D):CharacterSocket2D{
  const m=composePixelTransform2D(transform,socketTransform2D(socket));return{...socket,position:[m[4],m[5]],basisX:[m[0],m[1]],basisY:[m[2],m[3]]};
}
export function humanSockets2D(sprite:HumanSprite,weapon?:HumanWeaponGeometry):Record<string,CharacterSocket2D>{
  const r=sprite.rig,near=r.view==='front'||r.view==='back'?'right':'left',far=near==='right'?'left':'right',f=r.facing==='left';
  const oriented=(position:HumanPoint,angle:number,layer=1)=>characterSocket2D(position,angle+(f?Math.PI:0),layer,f);
  const hand=(side:'left'|'right')=>{const a=r[`${side}Elbow`],b=r[`${side}Hand`];return oriented(humanGrip2D(r,side),Math.atan2(b[1]-a[1],b[0]-a[0]));};
  const out:Record<string,CharacterSocket2D>={root:characterSocket2D([0,0],0,0,f),head:characterSocket2D(r.head,0,0,f),chest:characterSocket2D(r.chest,0,0,f),mouth:characterSocket2D([r.head[0]+(f?-4:4)*r.scale,r.head[1]+4*r.scale],0,0,f),hand:hand(near),otherHand:hand(far),'hand.grip':hand(near),'hand.left':hand('left'),'hand.right':hand('right'),foot:characterSocket2D(r.leftAnkle,0,0,f),otherFoot:characterSocket2D(r.rightAnkle,0,0,f),'foot.left':characterSocket2D(r.leftAnkle,0,0,f),'foot.right':characterSocket2D(r.rightAnkle,0,0,f)};
  if(weapon){const angle=Math.atan2(weapon.direction[1],weapon.direction[0]);out['weapon.base']=oriented(weapon.grip,angle);out['weapon.tip']=oriented(weapon.tip,angle);out['weapon.edge']=oriented([(weapon.grip[0]+weapon.tip[0])/2,(weapon.grip[1]+weapon.tip[1])/2],angle);out['hand.grip']=oriented(weapon.grip,angle);if(weapon.upperTip)out['bow.upperTip']=oriented(weapon.upperTip,angle);if(weapon.lowerTip)out['bow.lowerTip']=oriented(weapon.lowerTip,angle);if(weapon.nock)out['bow.nock']=oriented(weapon.nock,angle);if(weapon.arrowTip)out.muzzle=oriented(weapon.arrowTip,angle);}
  return out;
}
export function humanAnimationInfo2D(action:HumanAnimation2D):{duration:number;loop:boolean;events:CharacterEvent2D[]}{
  if(!HUMAN_ANIMATIONS_2D.includes(action))throw new RangeError('Unknown human animation: '+action);
  if(action==='run')return{duration:HUMAN_ACTION_TIMING.run.duration,loop:true,events:[{id:'left-step',kind:'footstep',at:0,socket:'foot.left'},{id:'right-step',kind:'footstep',at:.4,socket:'foot.right'}]};
  if(action==='jump')return{duration:HUMAN_ACTION_TIMING.jump.duration,loop:false,events:[{id:'takeoff',kind:'takeoff',at:HUMAN_ACTION_TIMING.jump.takeoff},{id:'landing',kind:'landing',at:HUMAN_ACTION_TIMING.jump.landing}]};
  if(action==='punch'||action==='block'||action==='hit')return{duration:HUMAN_COMBAT_TIMING[action].duration,loop:false,events:[{id:action+'-contact',kind:'contact',at:HUMAN_COMBAT_TIMING[action].contact,socket:action==='hit'?'chest':'hand.grip'}]};
  if(action==='sword'||action==='bow')return{duration:HUMAN_WEAPON_TIMING[action].duration,loop:false,events:[{id:action+'-cue',kind:action==='sword'?'slash':'release',at:HUMAN_WEAPON_TIMING[action].cue,socket:action==='sword'?'weapon.tip':'muzzle'}]};
  return{duration:2,loop:true,events:action==='walk'?[{id:'left-step',kind:'footstep',at:0,socket:'foot.left'},{id:'right-step',kind:'footstep',at:1,socket:'foot.right'}]:[]};
}
/** Analytic treadmill speed from the existing stance interval, in native pixels/second. */
export function humanTravelSpeed2D(action:HumanAnimation2D,style:HumanStyle={}):number{
  const view=style.view??'front',scale=(style.height??96)/96,sign=style.facing==='left'?-1:1;
  const speed=action==='run'?(view==='side'?30:view==='three-quarter'?18:4.5)/(.8*.32):action==='walk'?(view==='side'?20:view==='three-quarter'?16:0):0;
  return speed*scale*sign;
}
/** One public sampler for all existing human motion modules; no new global simulation clock. */
export function sampleHumanAnimation2D(action:HumanAnimation2D,time:number,style:HumanStyle={},options:{weaponPixels?:boolean;rootMotion?:boolean;reducedMotion?:boolean}={}):HumanAnimationSample2D{
  if(!Number.isFinite(time))throw new RangeError('Animation time must be finite');const info=humanAnimationInfo2D(action),reduced=options.reducedMotion??false;
  let pose:HumanPose,phase:string=action,contacts={left:true,right:true},weapon:HumanWeaponGeometry|undefined;
  if(action==='run'||action==='jump'){const a=humanAction2D(action,time,style,reduced);pose=a.pose;phase=a.phase;contacts=a.contacts;}
  else if(action==='punch'||action==='block'||action==='hit'){const a=humanCombat2D(action,time,style,reduced);pose=a.pose;phase=a.phase;contacts=a.contacts;}
  else if(action==='sword'||action==='bow'){const a=humanWeapon2D(action,time,style,reduced);pose=a.pose;phase=a.phase;weapon=a.geometry;}
  else{pose=humanViewMotion2D(style.view??'front',action,time,reduced);if(action==='walk'&&!reduced){const u=((time%2)+2)%2/2;contacts={left:u<.5,right:u>=.5};}}
  const rendered=weapon&&options.weaponPixels!==false?renderHumanWeapon2D(action as HumanWeapon,time,style,reduced):undefined,sprite=rendered?.actor??renderHuman2D(style,pose);
  return{sprite,pose,projectile:rendered?.projectile,...info,phase,contacts,weapon,sockets:humanSockets2D(sprite,weapon),rootMotion:[options.rootMotion&&!reduced?humanTravelSpeed2D(action,style)*Math.max(0,time):0,0]};
}

/** Stable decimal-loop boundaries (for example 2.4 seconds in a .8-second clip). */
export function characterClipTime2D(time:number,duration:number,loop:boolean):{time:number;cycle:number}{
  if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)throw new RangeError('Clip time and duration must be finite');
  if(!loop)return{time:Math.max(0,Math.min(time,duration)),cycle:0};
  const q=time/duration,nearest=Math.round(q),snapped=Math.abs(q-nearest)<=8*Number.EPSILON*Math.max(1,Math.abs(q)),cycle=snapped?nearest:Math.floor(q);
  const local=snapped?0:time-cycle*duration;return{time:Math.max(0,Math.min(duration,local)),cycle};
}

export interface HumanPoseKey2D {
  at:number;
  /** Sparse channels: an omitted control retains its last authored value. */
  pose:HumanPose;
  /** Outgoing interpolation for the channels authored on this key. */
  interpolation?:'hold'|'linear'|'smooth';
}
export interface HumanPoseClip2D { duration:number;loop?:boolean;keys:readonly HumanPoseKey2D[];events?:readonly CharacterEvent2D[];root?:readonly {at:number;position:readonly[number,number]}[];contacts?:readonly{at:number;left:boolean;right:boolean}[] }
const poseScalars=['x','y','lean','gaze'] as const,posePoints=['leftHand','rightHand','leftFoot','rightFoot'] as const;
const poseDiscrete=['leftElbow','rightElbow','leftKnee','rightKnee','blink','fists','armsFront'] as const;
/** Last key at or before time; -1 means the channel has not been authored yet. */
function keyAt<T extends {at:number}>(keys:readonly T[],time:number):number{
  let low=0,high=keys.length;while(low<high){const mid=(low+high)>>>1;if(keys[mid].at<=time)low=mid+1;else high=mid;}return low-1;
}
function poseWeight(a:HumanPoseKey2D,b:HumanPoseKey2D|undefined,time:number):number{
  if(!b||a.interpolation==='hold')return 0;const u=(time-a.at)/(b.at-a.at);return a.interpolation==='linear'?u:u*u*(3-2*u);
}
/** Retains strong keys and explicit holds; booleans and IK branches change only at authored key boundaries. */
export function compileHumanPoseClip2D(input:HumanPoseClip2D){
  if(!input||!Number.isFinite(input.duration)||input.duration<=0||!Array.isArray(input.keys)||!input.keys.length||input.keys[0]?.at!==0||input.loop!==undefined&&typeof input.loop!=='boolean')throw new RangeError('Pose clip needs a positive duration and first key at zero');
  // Validate before JSON snapshotting: NaN/null coordinates must not silently become defaults.
  input.keys.forEach((k,i)=>{
    if(!k||!Number.isFinite(k.at)||k.at<0||k.at>input.duration||i>0&&k.at<=input.keys[i-1].at||k.interpolation!==undefined&&!['hold','linear','smooth'].includes(k.interpolation)||!k.pose||typeof k.pose!=='object'||Array.isArray(k.pose))throw new RangeError('Pose keys must be strictly ordered with a valid interpolation');
    for(const name of poseScalars)if(k.pose[name]!==undefined&&!Number.isFinite(k.pose[name]))throw new RangeError('Pose channels must be finite');
    for(const name of posePoints){const p=k.pose[name];if(p!==undefined&&(!Array.isArray(p)||p.length!==2||!Array.from(p).every(Number.isFinite)))throw new RangeError('Pose targets need two finite coordinates');}
    for(const name of ['blink','fists','armsFront'] as const)if(k.pose[name]!==undefined&&typeof k.pose[name]!=='boolean')throw new RangeError('Pose switches must be boolean');
    humanRig2D({},k.pose);
  });
  const inputRoot=input.root??[{at:0,position:[0,0] as const}];
  if(!Array.isArray(inputRoot)||!inputRoot.length||inputRoot[0]?.at!==0)throw new RangeError('Root motion track must start at zero');
  inputRoot.forEach((k,i)=>{if(!k||!Number.isFinite(k.at)||k.at<0||k.at>input.duration||!Array.isArray(k.position)||k.position.length!==2||!Array.from(k.position).every(Number.isFinite)||i>0&&k.at<=inputRoot[i-1].at)throw new RangeError('Invalid root motion track');});
  if(input.contacts!==undefined&&!Array.isArray(input.contacts))throw new RangeError('Authored contact keys must be an array');
  input.contacts?.forEach((k,i)=>{if(!k||!Number.isFinite(k.at)||k.at<0||k.at>input.duration||typeof k.left!=='boolean'||typeof k.right!=='boolean'||i>0&&k.at<=input.contacts![i-1].at)throw new RangeError('Invalid authored contact keys');});
  createCharacterEventCursor2D(input.duration,input.events??[],input.loop??false);
  const clip=JSON.parse(JSON.stringify(input)) as HumanPoseClip2D;
  const root=clip.root??[{at:0,position:[0,0] as const}];
  const tracks=new Map([...poseScalars,...posePoints,...poseDiscrete].map(name=>[name,clip.keys.filter(k=>k.pose[name]!==undefined)]));
  return{get clip():HumanPoseClip2D{return JSON.parse(JSON.stringify(clip));},sample(time:number):{pose:HumanPose;rootMotion:[number,number];contacts:{left:boolean;right:boolean}}{
    if(!Number.isFinite(time))throw new RangeError('Pose time must be finite');const wrapped=characterClipTime2D(time,clip.duration,clip.loop??false),t=wrapped.time;
    const pose:HumanPose={};
    for(const name of poseScalars){const keys=tracks.get(name)!,i=keyAt(keys,t);if(i<0)continue;const a=keys[i],b=keys[i+1],u=poseWeight(a,b,t);pose[name]=a.pose[name]!+((b?.pose[name]??a.pose[name])!-a.pose[name]!)*u;}
    for(const name of posePoints){const keys=tracks.get(name)!,i=keyAt(keys,t);if(i<0)continue;const a=keys[i],b=keys[i+1],u=poseWeight(a,b,t),p=a.pose[name]!,q=b?.pose[name]??p;pose[name]=[p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u];}
    for(const name of poseDiscrete){const keys=tracks.get(name)!,i=keyAt(keys,t);if(i>=0)Object.assign(pose,{[name]:keys[i].pose[name]});}
    const ri=keyAt(root,t),r=root[Math.max(0,ri)],s=root[ri+1]??r,v=s.at>r.at?(t-r.at)/(s.at-r.at):0,first=root[0].position,last=root[root.length-1].position;
    const contacts=clip.contacts??[],contact=contacts[keyAt(contacts,t)];
    return{pose,rootMotion:[r.position[0]+(s.position[0]-r.position[0])*v+wrapped.cycle*(last[0]-first[0]),r.position[1]+(s.position[1]-r.position[1])*v+wrapped.cycle*(last[1]-first[1])],contacts:{left:contact?.left??false,right:contact?.right??false}};
  }};
}

/** Root corrections for authored contact samples. Anchors are held until that foot leaves contact. */
export function solveFootPlant2D(samples:readonly{time:number;root:readonly[number,number];left:HumanPoint;right:HumanPoint;contacts:{left:boolean;right:boolean}}[]):{time:number;root:[number,number];error:number}[]{
  let previous=-Infinity,lastCorrection:[number,number]=[0,0];const anchors:Partial<Record<'left'|'right',[number,number]>>={},result=[];
  for(const sample of samples){if(!Number.isFinite(sample.time)||sample.time<=previous)throw new RangeError('Foot samples must have increasing times');previous=sample.time;if(![sample.root,sample.left,sample.right].every(p=>p.length===2&&p.every(Number.isFinite))||typeof sample.contacts.left!=='boolean'||typeof sample.contacts.right!=='boolean')throw new RangeError('Foot samples need finite points and explicit contacts');let dx=0,dy=0,count=0;
    for(const foot of ['left','right'] as const){if(!sample.contacts[foot]){delete anchors[foot];continue;}const point=sample[foot],world:[number,number]=[point[0]+sample.root[0],point[1]+sample.root[1]];anchors[foot]??=[world[0]+lastCorrection[0],world[1]+lastCorrection[1]];dx+=anchors[foot]![0]-world[0];dy+=anchors[foot]![1]-world[1];count++;}
    const correction:[number,number]=count?[dx/count,dy/count]:lastCorrection,root:[number,number]=[sample.root[0]+correction[0],sample.root[1]+correction[1]];lastCorrection=correction;let error=0;
    for(const foot of ['left','right'] as const)if(sample.contacts[foot]&&anchors[foot])error=Math.max(error,Math.hypot(root[0]+sample[foot][0]-anchors[foot]![0],root[1]+sample[foot][1]-anchors[foot]![1]));
    result.push({time:sample.time,root,error});
  }
  return result;
}

/** Event cursor is independent of pure sampling. Seeking/reversing never emits missed gameplay events. */
export function createCharacterEventCursor2D(duration:number,events:readonly CharacterEvent2D[],loop=false){
  if(!Number.isFinite(duration)||duration<=0)throw new RangeError('Event duration must be positive');
  const track=JSON.parse(JSON.stringify(events)) as CharacterEvent2D[],ids=new Set<string>();
  for(const event of track){if(!event.id||ids.has(event.id)||!Number.isFinite(event.at)||event.at<0||event.at>duration)throw new RangeError('Events need unique IDs and times inside the clip');if(loop&&event.at===duration)throw new RangeError('Loop endpoint events belong at time zero');ids.add(event.id);}track.sort((a,b)=>a.at-b.at);
  let previous=-Number.EPSILON;
  return{seek(time:number){if(!Number.isFinite(time))throw new RangeError('Seek time must be finite');previous=time;},restart(){previous=-Number.EPSILON;},advance(time:number):CharacterPlaybackEvent2D[]{
    if(!Number.isFinite(time))throw new RangeError('Playback time must be finite');if(time<previous){previous=time;return[];}const from=previous;if(time<0){previous=time;return[];}
    if(!track.length){previous=time;return[];}
    const tolerance=8*Number.EPSILON*Math.max(Math.abs(time),from>=0?Math.abs(from):0,duration);
    const first=loop?Math.max(0,characterClipTime2D(Math.max(0,from),duration,true).cycle):0,last=loop?characterClipTime2D(time,duration,true).cycle:0;
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last))throw new RangeError('Loop cycle exceeds safe integer playback; use a local clock');
    if((last-first+1)*track.length>100_000)throw new RangeError('Playback jump contains too many events; use seek explicitly');
    previous=time;const out:CharacterPlaybackEvent2D[]=[];for(let cycle=first;cycle<=last;cycle++)for(const event of track){const at=cycle*duration+event.at;if(at>(from<0?from:from+tolerance)&&at<=time+tolerance)out.push({...event,time:at,cycle,source:'timeline'});}return out;
  }};
}
/** Reuse ACT onHit and optional 3D cue drains without coupling either engine to character drawing. */
export function connectCharacterEvents2D(options:{act?:{onHit?:((hit:any)=>void)};cueSource?:{drainCues():readonly Record<string,unknown>[]};time:()=>number;sink:(event:CharacterPlaybackEvent2D)=>void}){
  const old=options.act?.onHit;let serial=0;const handler=(hit:unknown)=>{old?.(hit);const at=options.time();options.sink({id:'act-'+serial++,at,time:at,kind:'hit',data:{hit},source:'act',cycle:0});};if(options.act)options.act.onHit=handler;
  return{poll(){for(const cue of options.cueSource?.drainCues()??[]){const at=typeof cue.time==='number'?cue.time:options.time();options.sink({id:String(cue.id??'cue-'+serial++),at,time:at,kind:String(cue.kind??cue.type??'cue'),data:{...cue},source:'cue3d',cycle:0});}},dispose(){if(options.act?.onHit===handler)options.act.onHit=old;}};
}

export interface SecondaryKey2D { at:number;angle:number }
/** Deterministic scalar spring bake for cape/hair attachment angles; clamps remove unstable overshoot. */
export function bakeSecondaryMotion2D(input:{duration:number;targets:readonly SecondaryKey2D[];fps?:number;stiffness?:number;damping?:number;maxAngle?:number}):SecondaryKey2D[]{
  const fps=input.fps??60,stiffness=input.stiffness??55,damping=input.damping??12,limit=input.maxAngle??.7;
  if(!Number.isFinite(input.duration)||input.duration<=0||input.duration>120||!Number.isInteger(fps)||fps<1||fps>240||!input.targets.length||![stiffness,damping,limit].every(n=>Number.isFinite(n)&&n>=0)||stiffness>1000||damping>120||limit>Math.PI)throw new RangeError('Invalid secondary motion bake');
  const targets=Array.from(input.targets);targets.forEach((q,i)=>{if(!Number.isFinite(q.at)||!Number.isFinite(q.angle)||i&&q.at<=targets[i-1].at)throw new RangeError('Secondary targets must be ordered');});
  const target=(t:number)=>{let a=targets[0],b=a;for(const q of targets){if(q.at<=t)a=q;else{b=q;break;}b=a;}const u=b.at>a.at?Math.max(0,Math.min(1,(t-a.at)/(b.at-a.at))):0;return Math.max(-limit,Math.min(limit,a.angle+(b.angle-a.angle)*u));};
  const dt=1/240,n=Math.ceil(input.duration*240),result:SecondaryKey2D[]=[];let angle=target(0),velocity=0,next=0;
  for(let i=0;i<=n;i++){const t=Math.min(input.duration,i*dt);while(next/fps<=t+1e-10&&next/fps<=input.duration){result.push({at:next/fps,angle});next++;}const acceleration=(target(t)-angle)*stiffness-velocity*damping;velocity+=acceleration*dt;angle+=velocity*dt;if(angle>limit||angle< -limit){angle=Math.max(-limit,Math.min(limit,angle));velocity=0;}}
  if(result[result.length-1].at<input.duration)result.push({at:input.duration,angle});return result;
}
export function sampleSecondaryMotion2D(keys:readonly SecondaryKey2D[],time:number):number{
  if(!keys.length)return 0;let a=keys[0],b=a;for(const key of keys){if(key.at<=time)a=key;else{b=key;break;}b=a;}const u=b.at>a.at?Math.max(0,Math.min(1,(time-a.at)/(b.at-a.at))):0;return a.angle+(b.angle-a.angle)*u;
}
