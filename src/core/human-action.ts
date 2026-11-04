/** Seekable pure-2D run and jump choreography. No new per-part outlines or 3D projection. */
import { humanRig2D } from './human.js';
import type { HumanPoint, HumanPose, HumanStyle, HumanView, HumanRig } from './human.js';
export type HumanAction = 'run' | 'jump';
export interface HumanActionSample {
  pose: HumanPose;
  phase: 'rest' | 'stance' | 'flight' | 'anticipation' | 'takeoff' | 'landing' | 'recovery';
  contacts: { left: boolean; right: boolean };
  airborne: boolean;
  /** Canonical seconds. Run wraps, jump clamps and then remains at rest. */
  time: number; duration: number; loop: boolean; done: boolean;
  /** Actual solved local root displacement in canonical 96px units. */
  rootY: number;
}
export const HUMAN_ACTION_TIMING = Object.freeze({
  run: Object.freeze({ duration: .8, stanceFraction: .32 }),
  jump: Object.freeze({ duration: 1.2, anticipationEnd: .18, takeoff: .24, apex: .54, landing: .84, recoveryStart: 1.04 }),
});
const finite=(n:number,label:string)=>{if(!Number.isFinite(n))throw new RangeError(`${label} must be finite`);return n;};
const clamp=(x:number)=>Math.max(0,Math.min(1,x)),smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Forward-kinematic target and matching IK pole. Angles are radians from down toward +x.
 * Animating the bend through zero changes branches through a straight arm rather than snapping.
 */
export function humanLimbTarget2D(origin:HumanPoint,angle:number,bend:number,first:number,second:number):{target:HumanPoint;pole:-1|1}{
  if(!Array.isArray(origin)||origin.length!==2||!Array.from(origin).every(Number.isFinite))throw new TypeError('origin must contain two finite coordinates');
  finite(angle,'angle');finite(bend,'bend');finite(first,'first length');finite(second,'second length');
  angle%=Math.PI*2;bend%=Math.PI*2; // Normalize before addition, including very large finite inputs.
  if(first<=0||second<=0||first>512||second>512)throw new RangeError('limb lengths must be within 0..512');
  return {target:[origin[0]+first*Math.sin(angle)+second*Math.sin(angle+bend),origin[1]+first*Math.cos(angle)+second*Math.cos(angle+bend)],pole:Math.sin(bend)>=0?1:-1};
}
function arms(r:HumanRig,left:[number,number],right:[number,number]):HumanPose{
  const l=humanLimbTarget2D(r.leftShoulder,...left,r.lengths.upperArm,r.lengths.forearm),q=humanLimbTarget2D(r.rightShoulder,...right,r.lengths.upperArm,r.lengths.forearm);
  return {leftHand:l.target,rightHand:q.target,leftElbow:l.pole,rightElbow:q.pole};
}
function armAngles(r:HumanRig,side:'left'|'right'):[number,number]{
  const a=r[`${side}Shoulder`],b=r[`${side}Elbow`],c=r[`${side}Hand`],upper=Math.atan2(b[0]-a[0],b[1]-a[1]),fore=Math.atan2(c[0]-b[0],c[1]-b[1]);
  let bend=fore-upper;while(bend>Math.PI)bend-=Math.PI*2;while(bend<-Math.PI)bend+=Math.PI*2;return [upper,bend];
}
/** Run loops every .8s. Jump is one-shot: prep, release, flight, landing, then rest.
 * Pose inputs and contact identities remain canonical; renderHuman2D applies facing afterward.
 */
export function humanAction2D(action:HumanAction,time:number,style:HumanStyle={},reducedMotion=false):HumanActionSample{
  finite(time,'time');if(action!=='run'&&action!=='jump')throw new RangeError(`Unknown human action: ${action}`);
  humanRig2D(style); // Preserve the public style/facing/height guards even though poses use canonical units.
  const view:HumanView=style.view??'front',side=view==='side',quarter=view==='three-quarter',broad=!side&&!quarter;
  const canonical:HumanStyle={...style,height:96,facing:'right'},duration=HUMAN_ACTION_TIMING[action].duration;
  const raw=action==='run'?((time%duration)+duration)%duration:Math.max(0,Math.min(duration,time));
  const t=action==='run'?(Math.round(raw*1e12)/1e12>=duration?0:Math.round(raw*1e12)/1e12):raw;
  const stance=side?4:quarter?7:12;
  const rest:HumanPose={leftFoot:[-stance,-4],rightFoot:[stance,-4],blink:false};
  if(reducedMotion||(action==='jump'&&(t===0||t===duration))){const r=humanRig2D(canonical,rest);return {pose:rest,phase:'rest',contacts:{left:true,right:true},airborne:false,time:t,duration,loop:action==='run',done:action==='jump'&&time>=duration,rootY:r.pelvis[1]+44.5};}
  let pose:HumanPose,phase:HumanActionSample['phase'],leftContact:boolean,rightContact:boolean;
  if(action==='run'){
    const u=t/duration,a=u*Math.PI*2,co=Math.cos(a),sw=Math.sin(a),duty=HUMAN_ACTION_TIMING.run.stanceFraction;
    const foot=(v:number,near:boolean)=>{
      v%=1;const contact=v<duty,front=side?17:quarter?10:2.5,back=side?-13:quarter?-8:-2,offset=broad?(near?-6:6):quarter?(near?-3:3):0;
      const q=contact?v/duty:(v-duty)/(1-duty),x=contact?mix(front,back,q):mix(back,front,smooth(q)),lift=contact?0:(side?12:quarter?7:4)*Math.sin(Math.PI*q);
      return {point:[offset+x,-4-lift] as HumanPoint,contact};
    };
    const l=foot(u,true),r=foot((u+.5)%1,false),half=u%.5,flight=half>=duty,flightU=(half-duty)/(.5-duty);
    const y=flight?-(broad?2.5:5)*Math.sin(Math.PI*flightU):1.6*Math.sin(Math.PI*half/duty);
    const lean=side?8:quarter?4:.8*sw;
    pose={y,lean,leftFoot:l.point,rightFoot:r.point,leftKnee:-1,rightKnee:broad?1:-1,armsFront:view!=='back'&&!side,blink:false};
    const body=humanRig2D(canonical,pose);
    const left:[number,number]=side?[-.8*co,1.5]:[-.45,1.5+.5*co],right:[number,number]=side?[.8*co,1.5]:[.45,-1.5+.5*co];
    pose={...pose,...arms(body,left,right)};leftContact=l.contact;rightContact=r.contact;phase=leftContact||rightContact?'stance':'flight';
  }else{
    const timing=HUMAN_ACTION_TIMING.jump;let y=0,lift=0,raise=0;
    if(t<timing.anticipationEnd){const q=smooth(t/timing.anticipationEnd);y=6*q;raise=-.12*q;phase='anticipation';}
    else if(t<timing.takeoff){const q=smooth((t-timing.anticipationEnd)/(timing.takeoff-timing.anticipationEnd));y=6*(1-q);raise=mix(-.12,1,q);phase='takeoff';}
    else if(t<timing.landing){const q=(t-timing.takeoff)/(timing.landing-timing.takeoff);y=-20*4*q*(1-q);lift=(side?8:quarter?5:3)*Math.sin(Math.PI*q);raise=1;phase='flight';}
    else if(t<timing.recoveryStart){const q=(t-timing.landing)/(timing.recoveryStart-timing.landing);y=7*Math.sin(Math.PI*q);raise=1-smooth(q)*.8;phase='landing';}
    else{const q=smooth((t-timing.recoveryStart)/(duration-timing.recoveryStart));raise=.2*(1-q);phase='recovery';}
    // Arm swing spans preparation and early flight, rather than flipping upward in one frame.
    if(t<.06)raise=-.12*smooth(t/.06);
    else if(t<.42)raise=mix(-.12,1,smooth((t-.06)/.36));
    const air=phase==='flight',footY=air?y-4-lift:-4,heel=air&&side?-lift*.5:0,lean=side?3*Math.max(0,raise):quarter?1.5*Math.max(0,raise):0;
    pose={y,lean,leftFoot:[-stance+heel,footY],rightFoot:[stance+heel,footY],leftKnee:side||quarter?-1:1,rightKnee:-1,armsFront:view!=='back',blink:false};
    const body=humanRig2D(canonical,pose),start=humanRig2D(canonical,rest),la=armAngles(start,'left'),ra=armAngles(start,'right');
    const lUp:[number,number]=side?[2.4,.55]:[-2.25,-.6],rUp:[number,number]=side?[2.25,.6]:[2.25,.6];
    pose={...pose,...arms(body,[mix(la[0],lUp[0],raise),mix(la[1],lUp[1],raise)],[mix(ra[0],rUp[0],raise),mix(ra[1],rUp[1],raise)])};
    leftContact=rightContact=!air;
  }
  const solved=humanRig2D(canonical,pose);
  return {pose,phase,contacts:{left:leftContact,right:rightContact},airborne:!leftContact&&!rightContact,time:t,duration,loop:action==='run',done:false,rootY:solved.pelvis[1]+44.5};
}
