import { blitSprite2D } from './sprite-raster.js';
/** Pure 2D human construction. No projected meshes and no per-part black outlines.
 * Bones are solved in continuous space; only the final painted clusters snap to pixels.
 */
import { Painter } from './painter.js';
import { hex } from './color.js';
import { characterScratch, characterPalette } from './character-cache.js';
import { humanHeadOffset, paintHumanHair2D, paintHumanFacialHair2D, paintHumanGarment2D, paintHumanAppearanceEyes2D } from './human-appearance.js';
import { paintHumanView2D } from './human-view.js';
import type { PaintFrame } from './painter.js';

export type HumanView = 'front' | 'three-quarter' | 'side' | 'back';
export type HumanFacing = 'right' | 'left';
export type HumanPoint = readonly [number, number];
export type HumanMotion = 'idle' | 'walk' | 'wave' | 'guard' | 'crouch';
export type HumanBuild = 'slender' | 'regular' | 'broad';
export type HumanHair = 'crop' | 'bob' | 'curls' | 'swept' | 'bun' | 'shaved' | 'ponytail' | 'parted';
export type HumanFaceShape = 'oval' | 'round' | 'square' | 'long';
export type HumanOutfit = 'shirt' | 'tunic' | 'jacket' | 'sleeveless' | 'sweater' | 'overalls';
export interface HumanStyle {
  /** Discrete authored 2D view. Facing reflects the authored local pose. */
  view?: HumanView;
  /** Reflect the complete authored pose, pixels and returned local landmarks. */
  facing?: HumanFacing;
  height?: number;
  build?: HumanBuild;
  skin?: 'light' | 'warm' | 'brown' | 'deep';
  hair?: HumanHair;
  /** Shaped head clusters; does not change skeleton or motion. */
  faceShape?: HumanFaceShape;
  facialHair?: 'none' | 'beard';
  hairColor?: 'dark' | 'chestnut' | 'gold' | 'silver';
  outfit?: HumanOutfit;
  /** Three shades, dark to light. Interior shadows remain colored, never ink panels. */
  cloth?: readonly [string, string, string];
  trousers?: readonly [string, string, string];
  outline?: string | null;
  /** Shared CharacterIdentity palettes; defaults retain the existing studies byte for byte. */
  skinRamp?: readonly [string,string,string,string];
  hairRamp?: readonly [string,string,string];
  shoeRamp?: readonly [string,string,string];
}
export interface HumanPose {
  /** Root displacement in canonical 96px coordinates. */
  x?: number; y?: number; lean?: number;
  leftHand?: HumanPoint; rightHand?: HumanPoint;
  leftFoot?: HumanPoint; rightFoot?: HumanPoint;
  leftElbow?: -1 | 1; rightElbow?: -1 | 1;
  leftKnee?: -1 | 1; rightKnee?: -1 | 1;
  /** Pupil gaze, -1..1. View silhouettes are discrete, not a turntable. */
  gaze?: number;
  blink?: boolean;
  /** Compact closed hands for authored combat poses. Defaults to relaxed hands. */
  fists?: boolean;
  /** Forearms/hands may cross the torso in a guard or resting pose. */
  armsFront?: boolean;
}
export interface HumanRig {
  height: number; scale: number; width: number; view: HumanView; facing: HumanFacing; pose: HumanPose;
  head: HumanPoint; neck: HumanPoint; chest: HumanPoint; pelvis: HumanPoint;
  leftShoulder: HumanPoint; rightShoulder: HumanPoint;
  leftElbow: HumanPoint; rightElbow: HumanPoint;
  leftHand: HumanPoint; rightHand: HumanPoint;
  leftHip: HumanPoint; rightHip: HumanPoint;
  leftKnee: HumanPoint; rightKnee: HumanPoint;
  leftAnkle: HumanPoint; rightAnkle: HumanPoint;
  lengths: { upperArm: number; forearm: number; thigh: number; shin: number };
  /** Actual clamped IK endpoints, never promised unreachable targets. */
  clamped: string[];
}
export interface HumanSprite {
  w: number; h: number; x: number; y: number;
  pixels: Uint32Array; mask: { w: number; h: number; data: Uint8Array };
  rig: HumanRig;
}
const SKIN = {
  light: ['#b78070','#d9a18b','#edbea0','#f4caaa'],
  warm: ['#985d49','#bc805d','#d7a174','#e5b685'],
  brown: ['#70463e','#96634e','#b78464','#c79975'],
  deep: ['#47353b','#684a41','#885f4e','#a07860'],
};
const HAIR = {
  dark: ['#282630','#3b343e','#52434b'],
  chestnut: ['#533b37','#7b4e3b','#a36c48'],
  gold: ['#916638','#bd914e','#e1bf72'],
  silver: ['#727782','#a3aab2','#d6d8cf'],
};
const finite = (x: number, name: string) => { if (!Number.isFinite(x)) throw new RangeError(`${name} must be finite`); return x; };
const coordinate = (x:number,name:string) => { finite(x,name); if(Math.abs(x)>4096)throw new RangeError(`${name} must be within -4096..4096`); return x; };
const colorValid = (c:unknown) => typeof c==='string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
function validate(style:HumanStyle,pose:HumanPose){
  for(const [key,allowed] of Object.entries({view:['front','three-quarter','side','back'],facing:['right','left'],build:['slender','regular','broad'],skin:Object.keys(SKIN),hair:['crop','bob','curls','swept','bun','shaved','ponytail','parted'],faceShape:['oval','round','square','long'],facialHair:['none','beard'],hairColor:Object.keys(HAIR),outfit:['shirt','tunic','jacket','sleeveless','sweater','overalls']})){
    const value=(style as Record<string,unknown>)[key];if(value!==undefined&&!allowed.includes(value as string))throw new RangeError(`Unknown human ${key}: ${value}`);
  }
  if(style.skinRamp!==undefined&&(!Array.isArray(style.skinRamp)||style.skinRamp.length!==4||!style.skinRamp.every(colorValid)))throw new TypeError('skinRamp needs four hex colors');
  for(const key of ['cloth','trousers','hairRamp','shoeRamp'] as const){const v=style[key];if(v!==undefined&&(!Array.isArray(v)||v.length!==3||!Array.from(v).every(colorValid)))throw new TypeError(`${key} must contain three #rgb or #rrggbb colors`);}
  if(style.outline!==undefined&&style.outline!==null&&!colorValid(style.outline))throw new TypeError('outline must be null or a #rgb or #rrggbb color');
  if(pose.fists!==undefined&&typeof pose.fists!=='boolean')throw new TypeError('fists must be boolean');
  for(const key of ['leftElbow','rightElbow','leftKnee','rightKnee'] as const){const v=pose[key];if(v!==undefined&&v!==-1&&v!==1)throw new RangeError(`${key} must be -1 or 1`);}
}
function point(p: HumanPoint, name: string): HumanPoint { if(!Array.isArray(p)||p.length!==2)throw new TypeError(`${name} must be [x,y]`);return [coordinate(p[0],name),coordinate(p[1],name)]; }
const add = (p: HumanPoint, q: HumanPoint): HumanPoint => [p[0]+q[0],p[1]+q[1]];
const lerp = (a: HumanPoint,b: HumanPoint,t:number): HumanPoint => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function ik(root: HumanPoint, target: HumanPoint, a: number, b: number, side: number) {
  const dx=target[0]-root[0],dy=target[1]-root[1],d=Math.hypot(dx,dy);
  const reach=Math.max(Math.abs(a-b)+1e-4,Math.min(a+b-1e-4,d));
  const ux=d<1e-8?0:dx/d,uy=d<1e-8?1:dy/d,c=(a*a-b*b+reach*reach)/(2*reach),h=Math.sqrt(Math.max(0,a*a-c*c));
  return { joint:[root[0]+ux*c-uy*h*side,root[1]+uy*c+ux*h*side] as HumanPoint,
    end:[root[0]+ux*reach,root[1]+uy*reach] as HumanPoint, clamped:Math.abs(reach-d)>1e-3 };
}
/** Solve an authored front/three-quarter/side/back 2D human. Limb lengths remain fixed. */
export function humanRig2D(style: HumanStyle = {}, pose: HumanPose = {}): HumanRig {
  validate(style,pose);
  if(style.facing==='left')return mirrorHumanRig(humanRig2D({...style,facing:'right'},pose));
  const height=finite(style.height??96,'height');
  if(height<32||height>192) throw new RangeError('human height must be 32..192 pixels');
  const view=style.view??'front';
  const broadView=view==='front'||view==='back';
  const shoulderSpread=broadView?11.4:view==='three-quarter'?7.6:1.8;
  const hipSpread=broadView?5.6:view==='three-quarter'?4:1.6;
  const footSpread=broadView?8.5:view==='three-quarter'?5.5:3;
  const handSpread=broadView?17.5:view==='three-quarter'?11:3.5;
  const s=height/96,width=style.build==='broad'?1.15:style.build==='slender'?0.86:1;
  const x=coordinate(pose.x??0,'x'), lean=coordinate(pose.lean??0,'lean');
  if(Math.abs(lean)>32)throw new RangeError('lean must be within -32..32 canonical pixels');
  let y=coordinate(pose.y??0,'y');
  // Keep reachable feet planted: lower the root rather than stretching a leg.
  for (const [hipX, foot] of [[x+lean*.25-hipSpread*width,pose.leftFoot??[x-footSpread*width,-4]],[x+lean*.25+hipSpread*width,pose.rightFoot??[x+footSpread*width,-4]]] as [number, HumanPoint][]) {
    point(foot,'foot');
    const dx=hipX-foot[0], reach=40.7-1e-3;
    if(Math.abs(dx)<reach) y=Math.max(y,foot[1]-Math.sqrt(reach*reach-dx*dx)+44.5);
  }
  finite(pose.gaze??0,'gaze');
  const at=(xx:number,yy:number):HumanPoint=>[(x+xx)*s,(y+yy)*s];
  const chest=at(lean,-68),pelvis=at(lean*.25,-44.5),neck=at(lean,-78.4),head=at(lean*.85+(view==='side'?1.4:view==='three-quarter'?1:0),-88.5);
  const ls=at(lean-shoulderSpread*width,-74),rs=at(lean+shoulderSpread*width,-74),lh=at(lean*.25-hipSpread*width,-44.5),rh=at(lean*.25+hipSpread*width,-44.5);
  const target=(v:HumanPoint):HumanPoint=>{const p=point(v,'target');return [p[0]*s,p[1]*s];};
  const armA=18.2*s,armB=16.6*s,legA=20.2*s,legB=20.5*s;
  const la=ik(ls,target(pose.leftHand??[x-handSpread*width,y-40]),armA,armB,pose.leftElbow??1);
  const ra=ik(rs,target(pose.rightHand??[x+handSpread*width,y-40]),armA,armB,pose.rightElbow??-1);
  const ll=ik(lh,target(pose.leftFoot??[x-footSpread*width,-4]),legA,legB,pose.leftKnee??(broadView?1:-1));
  const rl=ik(rh,target(pose.rightFoot??[x+footSpread*width,-4]),legA,legB,pose.rightKnee??-1);
  return {height,scale:s,width,view,facing:'right',pose,head,neck,chest,pelvis,leftShoulder:ls,rightShoulder:rs,leftElbow:la.joint,rightElbow:ra.joint,leftHand:la.end,rightHand:ra.end,leftHip:lh,rightHip:rh,leftKnee:ll.joint,rightKnee:rl.joint,leftAnkle:ll.end,rightAnkle:rl.end,
    lengths:{upperArm:armA,forearm:armB,thigh:legA,shin:legB},clamped:[['leftHand',la],['rightHand',ra],['leftFoot',ll],['rightFoot',rl]].filter(([,v])=>(v as typeof la).clamped).map(([k])=>k as string)};
}
/** Reflect local landmark coordinates while preserving authored limb identities. */
function mirrorHumanRig(r:HumanRig):HumanRig {
  const out={...r,facing:'left' as const};
  for(const key of ['head','neck','chest','pelvis','leftShoulder','rightShoulder','leftElbow','rightElbow','leftHand','rightHand','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'] as const)out[key]=[-r[key][0],r[key][1]];
  return out;
}
/** Whole pixel-cell reflection about x=0: cell x becomes -x-1. */
function mirrorHumanSprite(sp:HumanSprite):HumanSprite {
  const pixels=new Uint32Array(sp.pixels.length),data=new Uint8Array(sp.mask.data.length);
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const from=y*sp.w+x,to=y*sp.w+(sp.w-1-x);pixels[to]=sp.pixels[from];data[to]=sp.mask.data[from];}
  return {...sp,x:-sp.x-sp.w,pixels,mask:{w:sp.w,h:sp.h,data},rig:mirrorHumanRig(sp.rig)};
}

/** Seekable periodic poses, in seconds. A cycle is exactly 2 seconds, including at t=2. */
export function humanMotion2D(motion: HumanMotion, t: number, reducedMotion = false): HumanPose {
  finite(t,'time');
  if(!['idle','walk','wave','guard','crouch'].includes(motion))throw new RangeError(`Unknown human motion: ${motion}`);
  const phase=((t%2)+2)%2/2,a=phase*Math.PI*2,s=Math.sin(a),c=Math.cos(a);
  const blink=phase>.79&&phase<.835;
  if(reducedMotion) return {blink:false};
  switch(motion){
    case 'walk': return { y:-.8*(1-Math.cos(a*2)),lean:1.5,
      leftFoot:[-8+8*s,-4-6*Math.max(0,c)],rightFoot:[8-8*s,-4-6*Math.max(0,-c)],
      leftHand:[-17-5*s,-45-c],rightHand:[17+5*s,-45+c],blink};
    case 'wave': return {lean:-1,y:-.4*(1-c),leftHand:[-18,-41],rightHand:[25+3*s,-91+1.5*c],rightElbow:1,gaze:.25,blink};
    case 'guard': return {lean:2,y:2+.5*s,leftFoot:[-15,-4],rightFoot:[17,-4],leftHand:[-8,-68+.7*c],rightHand:[11,-67+.7*s],armsFront:true,blink};
    case 'crouch': return {lean:4,y:10+.6*s,leftFoot:[-20,-4],rightFoot:[21,-4],leftHand:[-18,-33],rightHand:[20,-33],armsFront:true,blink};
    default: return {lean:.6*s,y:-.5*(1-c),leftHand:[-18,-41-.5*(1-c)],rightHand:[18,-41-.5*(1-c)],blink};
  }
}

/** Authored view-specific pose targets. Explicit endpoints remain 2D, never projected. */
export function humanViewMotion2D(view: HumanView, motion: HumanMotion, t: number, reducedMotion = false): HumanPose {
  if(!['front','three-quarter','side','back'].includes(view))throw new RangeError(`Unknown human view: ${view}`);
  if(view==='front')return humanMotion2D(motion,t,reducedMotion);
  if(view==='back'){
    const base=humanMotion2D(motion,t,reducedMotion);
    if(reducedMotion)return base;
    if(motion!=='walk')return {...base,armsFront:false,gaze:0};
    const a=(((t%2)+2)%2/2)*Math.PI*2,sw=Math.sin(a),co=Math.cos(a);
    return {...base,leftFoot:[-6+1.5*sw,-4-3*Math.max(0,co)],rightFoot:[6-1.5*sw,-4-3*Math.max(0,-co)],leftHand:[-16+.7*sw,-40.8+.4*co],rightHand:[16-.7*sw,-40.8-.4*co],armsFront:false};
  }
  humanMotion2D(motion,t); // shared time and motion validation
  const u=((t%2)+2)%2/2,a=u*Math.PI*2,sw=Math.sin(a),co=Math.cos(a),side=view==='side';
  const rest:HumanPose={leftHand:side?[2,-41]:[-10,-41],rightHand:side?[5,-42]:[11,-42],leftFoot:side?[-2.5,-4]:[-5,-4],rightFoot:side?[3.5,-4]:[6,-4],leftKnee:-1,rightKnee:-1};
  if(reducedMotion)return {...rest,blink:false};
  const blink=u>.79&&u<.835;
  if(motion==='walk'){
    const foot=(phase:number,offset:number):HumanPoint=>{const v=phase%1,span=side?10:8;return [offset+(v<.5?span-4*span*v:-span+4*span*(v-.5)),-4-(v<.5?0:6*Math.sin((v-.5)*Math.PI*2))];};
    const left=foot(u,side?0:-3),right=foot((u+.5)%1,side?0:3);
    const lean=side?2:1.2,rootY=1+.6*Math.cos(a*2);
    // Swing the whole arm, with a small elbow flex, instead of keeping both hands on hips.
    const hand=(near:boolean,footX:number):HumanPoint=>{
      const spread=side?1.8:7.6,offset=side?0:near?-3:3,theta=-(side?.33:.22)*(footX-offset)/(side?10:8),bend=side?.18:.14;
      return [lean+(near?-spread:spread)+.975*(18.2*Math.sin(theta)+16.6*Math.sin(theta+bend)),rootY-74+.975*(18.2*Math.cos(theta)+16.6*Math.cos(theta+bend))];
    };
    return {lean,y:rootY,leftFoot:left,rightFoot:right,leftHand:hand(true,left[0]),rightHand:hand(false,right[0]),leftElbow:1,rightElbow:1,leftKnee:-1,rightKnee:-1,blink};
  }
  if(motion==='wave')return {...rest,lean:-.4,leftHand:side?[18+2*sw,-88+co]:[-10,-41],rightHand:side?[5,-42]:[23+2*sw,-90+co],leftElbow:1,rightElbow:1,blink};
  if(motion==='guard')return {...rest,lean:2,y:2+.4*sw,leftHand:side?[14,-66]:[3,-66],rightHand:side?[10,-69]:[13,-68],leftFoot:side?[-9,-4]:[-10,-4],rightFoot:side?[11,-4]:[13,-4],leftElbow:1,rightElbow:1,armsFront:true,blink};
  if(motion==='crouch')return {...rest,lean:6,y:11+.4*sw,leftHand:side?[17,-34]:[-8,-33],rightHand:side?[20,-36]:[15,-35],leftFoot:side?[-6,-4]:[-12,-4],rightFoot:side?[14,-4]:[16,-4],leftElbow:1,rightElbow:1,armsFront:true,blink};
  return {...rest,lean:.3*sw,y:.3*(1-co),blink};
}

/** Paint anatomical clusters into a temporary 2D Painter; the silhouette is outlined only once. */
export function renderHuman2D(style: HumanStyle = {}, pose: HumanPose = {}): HumanSprite {
  if(style.facing==='left')return mirrorHumanSprite(renderHuman2D({...style,facing:'right'},pose));
  const r=humanRig2D(style,pose),s=r.scale,wf=r.width;
  const joints=[r.head,r.neck,r.chest,r.pelvis,r.leftShoulder,r.rightShoulder,r.leftElbow,r.rightElbow,r.leftHand,r.rightHand,r.leftHip,r.rightHip,r.leftKnee,r.rightKnee,r.leftAnkle,r.rightAnkle];
  const pad=Math.ceil((style.hair==='ponytail'?23:style.faceShape&&style.faceShape!=='oval'?17:14)*s)+3,x=Math.floor(Math.min(...joints.map(p=>p[0])))-pad,y=Math.floor(Math.min(...joints.map(p=>p[1])))-pad;
  const w=Math.ceil(Math.max(...joints.map(p=>p[0])))-x+pad+1,h=Math.ceil(Math.max(...joints.map(p=>p[1])))-y+pad+1;
  if(w*h>1_000_000)throw new RangeError('Human pose exceeds the 1 million pixel sprite budget');
  const {frame,painter:p}=characterScratch(w,h,x,y),skin=characterPalette(style.skinRamp??SKIN[style.skin??'warm']),hair=characterPalette(style.hairRamp??HAIR[style.hairColor??'dark']);
  const cloth=characterPalette(style.cloth??['#34556d','#507e91','#7aa6aa']),pants=characterPalette(style.trousers??['#3c414f','#545966','#727981']);
  const shoe=characterPalette(style.shoeRamp??['#3b3034','#57413a','#78604a']),outfit=style.outfit??'shirt',hairStyle=style.hair??'swept';
  if(r.view!=='front'){paintHumanView2D(p,style,r,{skin,hair,cloth,pants,shoe});} else {
  const P=(v:HumanPoint[],color:number)=>p.poly(v.map(q=>[Math.round(q[0]),Math.round(q[1])]),color);
  const line=(v:HumanPoint[],color:number)=>p.polyline(v.map(q=>[Math.round(q[0]),Math.round(q[1])]),color);
  const dot=(v:HumanPoint,color:number)=>p.px(Math.round(v[0]),Math.round(v[1]),color);
  const ell=(v:HumanPoint,rx:number,ry:number,color:number)=>p.ellipse(Math.round(v[0]),Math.round(v[1]),Math.max(.6,rx*s),Math.max(.6,ry*s),color);
  const off=(v:HumanPoint,dx:number,dy:number):HumanPoint=>v===r.head?humanHeadOffset(r,style,dx,dy):[v[0]+dx*s,v[1]+dy*s];
  function segment(a:HumanPoint,b:HumanPoint,wa:number,wb:number,color:number){
    const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/d*s,ny=(b[0]-a[0])/d*s;
    P([[a[0]+nx*wa,a[1]+ny*wa],[b[0]+nx*wb,b[1]+ny*wb],[b[0]-nx*wb,b[1]-ny*wb],[a[0]-nx*wa,a[1]-ny*wa]],color);
    ell(a,wa,wa,color);ell(b,wb,wb,color);
  }
  const colors={skin,hair,cloth,pants,shoe};
  paintHumanHair2D(p,style,r,colors,'behind');
  // Hair behind shoulders. These are color masses, not individually inked panels.
  if(hairStyle==='bob') P([off(r.head,-7,-4),off(r.head,7,-4),off(r.head,9,15),off(r.head,5,17),off(r.head,-8,15)],hair[0]);
  if(hairStyle==='bun') ell(off(r.head,5,-8),4.8,4.2,hair[0]);
  // Trousers: shared hip fill joins both thighs. Rounded knees have no black seams.
  P([off(r.pelvis,-9*wf,-4),off(r.pelvis,9*wf,-4),off(r.pelvis,9*wf,5),off(r.pelvis,0,9),off(r.pelvis,-9*wf,5)],pants[1]);
  function leg(side:'left'|'right'){
    const l=side==='left',hip=l?r.leftHip:r.rightHip,knee=l?r.leftKnee:r.rightKnee,ankle=l?r.leftAnkle:r.rightAnkle;
    segment(hip,knee,4.7*wf,3.6*wf,pants[l?1:0]);segment(knee,ankle,3.6*wf,2.5*wf,pants[l?1:0]);
    if(r.height>=48){segment(off(hip,-1.2,1),off(lerp(hip,knee,.85),-1,0),1.2*wf,1.0*wf,pants[l?2:1]);segment(off(knee,-.8,2),off(ankle,-.6,-1),1.0,.7,pants[l?2:1]);}
    // Shoe and sole form one foot, anchored to ankle. No black ankle bands.
    const dir=l?-1:1;
    P([off(ankle,-2.8,-1),off(ankle,2.8,-1),off(ankle,dir*6,2.7),off(ankle,dir*6,4),off(ankle,-dir*3,4),off(ankle,-dir*3,1)],shoe[1]);
    line([off(ankle,-dir*2,3),off(ankle,dir*5,3)],shoe[0]);
    if(r.height>=64)line([off(ankle,-dir,0),off(ankle,dir*3,1)],shoe[2]);
  }
  leg('right');leg('left');
  // Arms are continuous tapered skin; short sleeves overlap with a colored cuff shadow.
  function arm(side:'left'|'right'){
    const l=side==='left',a=l?r.leftShoulder:r.rightShoulder,b=l?r.leftElbow:r.rightElbow,c=l?r.leftHand:r.rightHand;
    const tone=l?2:1;
    segment(a,b,3.4*wf,2.65*wf,skin[tone]);segment(b,c,2.65*wf,1.8*wf,skin[tone]);
    if(r.height>=48){segment(off(lerp(b,c,.15),-0.6,-.2),off(lerp(b,c,.83),-.6,0),.8,.6,skin[Math.min(3,tone+1)]);}
    const sleeve=outfit==='sleeveless'?.16:outfit==='sweater'?1:outfit==='jacket'?.93:.52;
    const end=lerp(a,b,sleeve);segment(a,end,(outfit==='sweater'?4.8:4.2)*wf,(outfit==='sweater'?3.8:3.2)*wf,cloth[l?1:0]);
    if(outfit==='jacket'||outfit==='sweater'){segment(b,lerp(b,c,.82),3.1*wf,2.3*wf,cloth[l?1:0]);}
    if(r.height>=64)segment(off(a,-1.0,-.4),off(end,-1,0),1.2,1,cloth[l?2:1]);
    const d=Math.hypot(c[0]-b[0],c[1]-b[1])||1,ux=(c[0]-b[0])/d,uy=(c[1]-b[1])/d;
    const fist=pose.fists===true,reach=fist?2.6:3.9;
    const endHand:HumanPoint=[c[0]+ux*reach*s,c[1]+uy*reach*s];
    segment(c,endHand,fist?2.3:1.9,fist?2.1:1.6,skin[tone]);
    if(r.height>=56){const thumb:HumanPoint=[c[0]-uy*2.4*s+ux*s,c[1]+ux*2.4*s+uy*s];ell(thumb,1.1,1.4,skin[tone]);}
  }
  arm('right');arm('left');
  // Torso is a single flowing cloth mass with large light/shadow clusters, not breast plates.
  const L=r.leftShoulder,R=r.rightShoulder,V=r.pelvis;
  P([off(L,-1,-1),off(r.neck,-3.5,1),off(r.neck,3.5,1),off(R,1,-1),off(R,0,9),off(V,8.8*wf,-5),off(V,10*wf,2),off(V,-10*wf,2),off(V,-8.8*wf,-5),off(L,0,9)],cloth[1]);
  P([off(r.neck,3,2),off(R,1,0),off(R,0,9),off(V,8.8*wf,-5),off(V,10*wf,1),off(V,4*wf,1),off(r.chest,5,0)],cloth[0]);
  P([off(r.neck,-3,2),off(L,1,0),off(L,2,8),off(r.chest,-5,8),off(V,-4,-2),off(r.chest,-1,0)],cloth[2]);
  if(outfit==='tunic'){
    P([off(V,-9,-3),off(V,9,-3),off(V,12,12),off(V,3,13),off(V,0,8),off(V,-3,13),off(V,-12,12)],cloth[1]);
    P([off(V,5,-2),off(V,9,-2),off(V,12,11),off(V,6,11)],cloth[0]);
  }
  if(outfit==='jacket'&&r.height>=48){
    P([off(r.neck,-2.5,1),off(r.neck,2.5,1),off(V,2,0),off(V,-2,0)],hex('#c8b99a'));
    P([off(r.neck,-3,1),off(r.neck,-7,5),off(r.chest,-3,8),off(r.chest,-1,-1)],cloth[0]);
    P([off(r.neck,3,1),off(r.neck,6,5),off(r.chest,3,7),off(r.chest,1,-1)],cloth[2]);
  }
  // A restrained seam or two, not an outlined grid.
  if(r.height>=72){line([off(V,-7,0),off(V,1,1),off(V,7,0)],cloth[0]);line([off(r.chest,-8,7),off(r.chest,-6,10)],cloth[1]);}
  paintHumanGarment2D(p,style,r,colors);
  if(pose.armsFront){arm('right');arm('left');}
  // Neck enters the neckline without a black separator.
  P([off(r.neck,-3,-5),off(r.neck,3,-5),off(r.neck,3.5,1),off(r.neck,0,3.5),off(r.neck,-3.5,1)],skin[1]);
  P([off(r.neck,-2,-3),off(r.neck,1.5,-3),off(r.neck,1.5,1),off(r.neck,-.5,2)],skin[2]);
  // Head uses a shaped jaw, ears, one shadow plane, readable negative space around eyes.
  const H=r.head;
  P([off(H,-4.5,-7),off(H,3.5,-7.5),off(H,6,-4.5),off(H,6,2.5),off(H,3.5,6.5),off(H,0,8),off(H,-3.5,6),off(H,-6,2),off(H,-6,-4)],skin[2]);
  P([off(H,3.5,-5),off(H,6,-3),off(H,6,3),off(H,3.5,6.5),off(H,0,8),off(H,.3,5.5),off(H,3.5,3)],skin[1]);
  ell(off(H,-6,0),1.3,2.1,skin[2]);ell(off(H,6,0),1.1,1.8,skin[1]);
  if(r.height>=56)P([off(H,-3,-3),off(H,1,-4),off(H,2,-1),off(H,-.5,2),off(H,-3,1)],skin[3]);
  const gaze=Math.max(-1,Math.min(1,pose.gaze??0));
  const eyeY=Math.round(off(H,0,.2)[1]),leftX=Math.round(off(H,-2.8+gaze,.2)[0]),rightX=Math.round(off(H,2.6+gaze,.2)[0]);
  const eye=hex('#3b3038');
  if(pose.blink){p.px(leftX,eyeY,skin[0]);p.px(rightX,eyeY,skin[0]);}
  else {p.px(leftX,eyeY,eye);p.px(rightX,eyeY,eye);if(r.height>=110){p.px(leftX-1,eyeY,skin[3]);p.px(rightX-1,eyeY,skin[3]);}}
  if(r.height>=64){dot(off(H,gaze+1,2.5),skin[1]);line([off(H,-1,5),off(H,1.5,5)],skin[0]);}
  if(r.height>=88){line([off(H,-4,-1.5),off(H,-2,-2)],skin[0]);line([off(H,2,-2),off(H,4,-1.5)],skin[0]);}
  paintHumanFacialHair2D(p,style,r,colors);
  // Hair silhouettes are deliberately different; no segmented ink strands.
  if(paintHumanHair2D(p,style,r,colors,'head')){} else if(hairStyle==='crop'){
    P([off(H,-6,-1),off(H,-7,-5),off(H,-4,-8),off(H,3,-8.5),off(H,6,-5),off(H,6,-1),off(H,4,-3),off(H,2,-5),off(H,-3,-4),off(H,-5,-1)],hair[0]);
    P([off(H,-5,-5),off(H,-3,-7),off(H,2,-7),off(H,3,-5)],hair[1]);
  } else if(hairStyle==='curls'){
    P([off(H,-7,-1),off(H,-8,-5),off(H,-6,-7),off(H,-6,-9),off(H,-2,-10),off(H,1,-9),off(H,4,-10),off(H,7,-7),off(H,8,-4),off(H,6,0),off(H,4,-3),off(H,1,-3),off(H,-2,-4),off(H,-4,-2)],hair[0]);
    for(const [dx,dy] of [[-5,-6],[-2,-8],[2,-7],[5,-6]])ell(off(H,dx,dy),1.6,1.2,hair[1]);
  } else if(hairStyle==='bob'){
    P([off(H,-7,7),off(H,-8,-4),off(H,-5,-8),off(H,2,-9),off(H,6,-6),off(H,7,6),off(H,5,8),off(H,4,-3),off(H,0,-5),off(H,-3,-2),off(H,-5,-1),off(H,-5,7)],hair[1]);
    P([off(H,-6,-4),off(H,-4,-7),off(H,1,-8),off(H,3,-6),off(H,-1,-5),off(H,-4,-2)],hair[2]);
  } else {
    P([off(H,-6,2),off(H,-7,-4),off(H,-6,-7),off(H,-2,-9),off(H,3,-9),off(H,6,-7),off(H,7,-3),off(H,5,1),off(H,4,-4),off(H,1,-5),off(H,-1,-3),off(H,-4,-2),off(H,-5,2)],hair[0]);
    P([off(H,-5,-5),off(H,-2,-7),off(H,3,-8),off(H,5,-6),off(H,1,-6),off(H,-2,-4)],hair[1]);
    if(r.height>=72)line([off(H,-3,-6),off(H,1,-7),off(H,3,-7)],hair[2]);
  }
  }
  paintHumanAppearanceEyes2D(p,style,r,{skin,hair,cloth,pants});
  // Only the union silhouette gets a contour. No outlines along overlapping limbs or clothes.
  const pixels=frame.color.slice(),ink=style.outline===null?0:hex(style.outline??'#252633');
  if(ink)for(let yy=1;yy<h-1;yy++)for(let xx=1;xx<w-1;xx++){
    const i=yy*w+xx;if(frame.color[i])continue;
    if(frame.color[i-1]||frame.color[i+1]||frame.color[i-w]||frame.color[i+w])pixels[i]=ink;
  }
  const mask={w,h,data:Uint8Array.from(pixels,c=>c?1:0)};
  return {w,h,x,y,pixels,mask,rig:r};
}
/** Draw using the engine's Painter transform and placement; returns the reusable sprite/mask. */
export function drawHuman2D(p: Painter, style: HumanStyle = {}, pose: HumanPose = {}): HumanSprite {
  const sprite=renderHuman2D(style,pose);
  blitSprite2D(p,sprite);
  return sprite;
}

/** Independent role palettes used by the shared identity and material authoring APIs. */
export function humanPalettes2D(style:HumanStyle={}):{skin:[string,string,string,string];hair:[string,string,string];cloth:[string,string,string];trousers:[string,string,string];shoe:[string,string,string]}{
  validate(style,{});return{skin:[...(style.skinRamp??SKIN[style.skin??'warm'])] as [string,string,string,string],hair:[...(style.hairRamp??HAIR[style.hairColor??'dark'])] as [string,string,string],cloth:[...(style.cloth??['#34556d','#507e91','#7aa6aa'])] as [string,string,string],trousers:[...(style.trousers??['#3c414f','#545966','#727981'])] as [string,string,string],shoe:[...(style.shoeRamp??['#3b3034','#57413a','#78604a'])] as [string,string,string]};
}
