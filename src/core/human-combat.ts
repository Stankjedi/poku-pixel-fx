/** Authored 2D combat gestures: shared ready pose, one-shot actions and explicit sync cues. */
import { humanRig2D } from './human.js';
import { humanLimbTarget2D } from './human-action.js';
import { defineImpactContact2D, impactContactAge2D } from './impact-contact.js';
import type { HumanStyle, HumanPose, HumanRig, HumanPoint, HumanSprite } from './human.js';
import type { ImpactContact2D } from './impact-contact.js';
export type HumanCombatAction='punch'|'block'|'hit';
export type HumanCombatPhase='ready'|'windup'|'strike'|'brace'|'recoil'|'recovery';
export interface HumanCombatSample {
  pose:HumanPose;phase:HumanCombatPhase;time:number;duration:number;done:boolean;loop:false;
  contacts:{left:true;right:true};
  /** Current continuous geometric anchor in local pixel units, facing-adjusted.
   * Not necessarily an occupied pixel; use humanContactPixel2D for raster attachment. */
  anchor:HumanPoint;
  /** Authored synchronization point at the cue time, not a collision detector or event emitter. */
  contact:ImpactContact2D|null;
  contactAge:number|null;contactActive:boolean;
  anchorName:'leftHandTip'|'rightHandTip'|'chest';
}
export const HUMAN_COMBAT_TIMING=Object.freeze({
  punch:Object.freeze({duration:.9,windup:.2,contact:.34,holdEnd:.40,recoveryEnd:.9}),
  block:Object.freeze({duration:1.1,windup:.24,contact:.36,holdEnd:.64,recoveryEnd:1.1}),
  hit:Object.freeze({duration:.9,windup:.1,contact:.1,holdEnd:.29,recoveryEnd:.9}),
});
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
type Angles=readonly[number,number];
type Key={x:number;lean:number;y:number;left:Angles;right:Angles};
/** Matches the renderer's continuous hand-axis tip, before its final pixel-cell snapping. */
export function humanHandTip2D(r:HumanRig,side:'left'|'right'):HumanPoint {
  if(side!=='left'&&side!=='right')throw new RangeError('Hand side must be left or right');
  const a=r[`${side}Elbow`],b=r[`${side}Hand`],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,l=(r.pose.fists?(r.view==='front'?2.6:2.4):(r.view==='front'?3.9:3.6))*r.scale;
  return [b[0]+(b[0]-a[0])*l/d,b[1]+(b[1]-a[1])*l/d];
}
function blend(a:Key,b:Key,u:number):Key {return{x:mix(a.x,b.x,u),lean:mix(a.lean,b.lean,u),y:mix(a.y,b.y,u),left:[mix(a.left[0],b.left[0],u),mix(a.left[1],b.left[1],u)],right:[mix(a.right[0],b.right[0],u),mix(a.right[1],b.right[1],u)]};}
function choreography(action:HumanCombatAction,t:number,style:HumanStyle):{pose:HumanPose;phase:HumanCombatPhase} {
  const view=style.view??'front',side=view==='side',quarter=view==='three-quarter',back=view==='back',broad=!side&&!quarter;
  const active=broad?'right':'left',stance=side?12:quarter?13:14;
  const ready:Key={x:-1,lean:side?1:quarter?.5:0,y:broad?2:4,left:side?[.3,2.6]:quarter?[.8,2.1]:[-.1,3],right:side?[.55,2.4]:quarter?[.1,-3]:[.35,2.6]};
  const timing=HUMAN_COMBAT_TIMING[action];let key=ready,phase:HumanCombatPhase='ready';
  if(action==='punch'){
    const prep:Key={...ready,x:-3,lean:-1.5,y:broad?4:6,[active]:broad?[.05,2.75]:[-.15,2.7]};
    const strike:Key={...ready,x:4,lean:side?5:quarter?4:3,y:broad?3:4,[active]:[1.45,.16]};
    // Guard, drive, extension all use the same elbow branch. The hip leads the
    // shoulder, with neither a locked elbow nor a wrist winding around the body.
    // Aim the hand-axis tip at the shared ready-chest height. Equal-sized partners
    // can synchronize punch/hit cues on the same floor without lifting either actor.
    const feet={leftFoot:[-stance,-4] as HumanPoint,rightFoot:[stance,-4] as HumanPoint};
    const targetY=humanRig2D(style,{...feet,x:ready.x,lean:ready.lean,y:ready.y}).chest[1];
    const shoulderY=humanRig2D(style,{...feet,x:strike.x,lean:strike.lean,y:strike.y})[`${active}Shoulder`][1];
    const bend=strike[active][1],a=18.2,b=16.6+(view==='front'?2.6:2.4),cx=a+b*Math.cos(bend),cy=b*Math.sin(bend);
    strike[active]=[Math.acos(Math.max(-1,Math.min(1,(targetY-shoulderY)/Math.hypot(cx,cy))))-Math.atan2(cy,cx),bend];
    if(t>0&&t<timing.windup){key=blend(ready,prep,smooth(t/timing.windup));phase='windup';}
    else if(t<timing.contact&&t>0){
      const u=(t-timing.windup)/(timing.contact-timing.windup);
      key=blend(prep,strike,smooth(u));
      // Hips start the drive before the fist opens out; extension then catches up.
      key.x=mix(prep.x,strike.x,smooth(Math.min(1,u*1.35)));
      phase='strike';
    }
    else if(t>=timing.contact&&t<timing.holdEnd){key=strike;phase='strike';}
    else if(t<timing.duration&&t>=timing.holdEnd){
      const u=(t-timing.holdEnd)/(timing.duration-timing.holdEnd);
      key=blend(strike,ready,smooth(Math.min(1,u*1.6)));
      // Bring the fist back before the hips settle. Recovery is not a reversed punch.
      key.x=mix(strike.x,ready.x,smooth(u));
      key.lean=mix(strike.lean,ready.lean,smooth(u));
      key.y=mix(strike.y,ready.y,smooth(u))+.6*Math.sin(Math.PI*u);
      phase='recovery';
    }
  }else if(action==='block'){
    const brace:Key={x:-1.5,lean:side?-.5:0,y:broad?4:7,
      left:side?[1.05,2.1]:quarter?[1.1,1.9]:back?[-1.4,3.8]:[1,1.9],
      right:side?[.85,2.25]:quarter?[.1,-3]:back?[1.4,Math.PI*2-3.8]:[-1,-1.9]};
    if(t>0&&t<timing.windup){key=blend(ready,brace,smooth(t/timing.windup));phase='windup';}
    else if(t>=timing.windup&&t<timing.holdEnd){
      key={...brace};
      if(t>=timing.contact){const q=(t-timing.contact)/(timing.holdEnd-timing.contact),give=Math.sin(Math.PI*q);key.x-=2*give;key.y+=1.6*give;key.lean-=1.3*give;}
      phase='brace';
    }
    else if(t>=timing.holdEnd&&t<timing.duration){key=blend(brace,ready,smooth((t-timing.holdEnd)/(timing.duration-timing.holdEnd)));phase='recovery';}
  }else{
    const recoil:Key={x:-5,lean:side?-7:quarter?-6:-5,y:broad?4:7,left:side?[-.4,1.6]:[-.3,1.8],right:side?[1.2,1.5]:[.3,-1.8]};
    if(t>=timing.contact&&t<.22){key=blend(ready,recoil,smooth((t-timing.contact)/.12));phase='recoil';}
    else if(t>=.22&&t<timing.holdEnd){key=recoil;phase='recoil';}
    else if(t>=timing.holdEnd&&t<timing.duration){key=blend(recoil,ready,smooth((t-timing.holdEnd)/(timing.duration-timing.holdEnd)));phase='recovery';}
  }
  const base:HumanPose={x:key.x,lean:key.lean,y:key.y,leftFoot:[-stance,-4],rightFoot:[stance,-4],leftKnee:broad?1:-1,rightKnee:-1,armsFront:!back,fists:true,blink:action==='hit'&&t>=timing.contact&&t<.29};
  const body=humanRig2D(style,base),l=humanLimbTarget2D(body.leftShoulder,...key.left,body.lengths.upperArm,body.lengths.forearm),r=humanLimbTarget2D(body.rightShoulder,...key.right,body.lengths.upperArm,body.lengths.forearm);
  return{phase,pose:{...base,leftHand:l.target,rightHand:r.target,leftElbow:l.pole,rightElbow:r.pole}};
}
/** Time clamps: every action starts/ends at the same authored ready stance. */
export function humanCombat2D(action:HumanCombatAction,time:number,style:HumanStyle={},reducedMotion=false):HumanCombatSample {
  if(!['punch','block','hit'].includes(action))throw new RangeError(`Unknown human combat action: ${action}`);
  if(!Number.isFinite(time))throw new RangeError('time must be finite');
  humanRig2D(style); // Validate all public appearance/view/facing/height inputs.
  const view=style.view??'front',duration=HUMAN_COMBAT_TIMING[action].duration,t=Math.max(0,Math.min(duration,time)),canonical={...style,height:96,facing:'right' as const};
  const sample=choreography(action,reducedMotion?0:t,canonical),rig=humanRig2D(style,sample.pose),active=action==='block'&&view==='front'?'left':view==='front'||view==='back'?'right':'left';
  const anchorName=action==='hit'?'chest':`${active}HandTip` as 'leftHandTip'|'rightHandTip';
  const anchor=action==='hit'?rig.chest:humanHandTip2D(rig,active);
  const at=HUMAN_COMBAT_TIMING[action].contact,atPose=choreography(action,at,canonical).pose,atRig=humanRig2D(style,atPose);
  const position=action==='hit'?atRig.chest:humanHandTip2D(atRig,active);
  const contact=reducedMotion?null:defineImpactContact2D({id:`human-${action}`,at,position,normal:[(action==='punch'?-1:1)*(style.facing==='left'?-1:1),0],material:'character',strength:action==='punch'?1:action==='block'?.6:.8,radius:2.4*rig.scale});
  const age=contact?impactContactAge2D(contact,time):null;
  return{...sample,time:t,duration,done:time>=duration,loop:false,contacts:{left:true,right:true},anchor,anchorName,contact,contactAge:age,contactActive:age!==null&&age>=0&&age<.06};
}

/** Nearest occupied pixel cell within 2px of a geometric attachment point.
 * Returns the integer local pixel origin (x mirrors to -x-1), or null if no nearby cell is occupied.
 * Includes an optional sprite contour. It does not discover collisions or hidden limbs. */
export function humanContactPixel2D(sprite:HumanSprite,point:HumanPoint):HumanPoint|null {
  if(!Array.isArray(point)||point.length!==2||!Array.from(point).every(Number.isFinite))throw new TypeError('Attachment point must contain two finite coordinates');
  const {w,h,x:ox,y:oy,pixels}=sprite;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>1_000_000||pixels.length!==w*h||!Number.isInteger(ox)||!Number.isInteger(oy))throw new RangeError('Invalid human sprite');
  const loX=Math.max(0,Math.floor(point[0]-ox-2.5)),hiX=Math.min(w-1,Math.ceil(point[0]-ox+1.5));
  const loY=Math.max(0,Math.floor(point[1]-oy-2.5)),hiY=Math.min(h-1,Math.ceil(point[1]-oy+1.5));
  let best:HumanPoint|null=null,distance=4,order=Infinity;
  for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
    if(!pixels[y*w+x])continue;
    const px=ox+x,py=oy+y,dx=px+.5-point[0],dy=py+.5-point[1],d=dx*dx+dy*dy;
    // Resolve equally close cells in canonical facing order so mirrored sprites agree.
    const rank=y*w+(sprite.rig.facing==='left'?w-1-x:x);
    if(d<distance-1e-12||(d<=4&&Math.abs(d-distance)<1e-12&&rank<order)){best=[px,py];distance=d;order=rank;}
  }
  return best;
}
