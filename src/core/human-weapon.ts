/** Held sword/bow studies, painted with the human's connected material silhouette. */
import { humanRig2D, renderHuman2D } from './human.js';
import { humanLimbTarget2D } from './human-action.js';
import { Painter } from './painter.js';
import { hex } from './color.js';
import type { HumanPoint, HumanPose, HumanStyle, HumanRig, HumanSprite } from './human.js';
import type { PaintFrame } from './painter.js';
export type HumanWeapon='sword'|'bow';
export type HumanWeaponPhase='ready'|'windup'|'swing'|'follow-through'|'draw'|'hold'|'release'|'recovery'|'unloaded';
export interface HumanWeaponGeometry {
  kind:HumanWeapon;hand:'left'|'right';grip:HumanPoint;direction:HumanPoint;
  tip:HumanPoint;upperTip?:HumanPoint;lowerTip?:HumanPoint;nock?:HumanPoint;
  drawGrip?:HumanPoint;arrowTip?:HumanPoint;loaded:boolean;
}
export interface HumanWeaponSample {
  pose:HumanPose;phase:HumanWeaponPhase;time:number;duration:number;done:boolean;loop:false;
  geometry:HumanWeaponGeometry;
  /** Frozen authored timing cue, not a collision or damage result. */
  cue:{kind:'slash'|'release';at:number;position:HumanPoint;direction:HumanPoint}|null;
  cueActive:boolean;projectile:{tail:HumanPoint;tip:HumanPoint}|null;
}
export type HumanWeaponPixels=Pick<HumanSprite,'w'|'h'|'x'|'y'|'pixels'|'mask'>;
export interface HumanWeaponFrame { actor:HumanSprite;projectile:HumanWeaponPixels|null;sample:HumanWeaponSample }
export const HUMAN_WEAPON_TIMING=Object.freeze({
  sword:Object.freeze({duration:1.2,windup:.28,cue:.44,follow:.56,recover:.66}),
  bow:Object.freeze({duration:1.4,draw:.4,cue:.7,settle:.9}),
});
const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
const blend=(a:HumanPoint,b:HumanPoint,u:number):HumanPoint=>[mix(a[0],b[0],u),mix(a[1],b[1],u)];
const add=(a:HumanPoint,b:HumanPoint,k=1):HumanPoint=>[a[0]+b[0]*k,a[1]+b[1]*k];
const unit=(a:HumanPoint,b:HumanPoint):HumanPoint=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1]);return d<1e-9?[1,0]:[(b[0]-a[0])/d,(b[1]-a[1])/d];};
/** Continuous palm center along the forearm, already scaled/facing-adjusted by the rig. */
export function humanGrip2D(r:HumanRig,hand:'left'|'right'):HumanPoint {
  if(hand!=='left'&&hand!=='right')throw new RangeError('Grip hand must be left or right');
  return add(r[`${hand}Hand`],unit(r[`${hand}Elbow`],r[`${hand}Hand`]),1.2*r.scale);
}
type Plan={pose:HumanPose;phase:HumanWeaponPhase;angle:number;pull:number};
function plan(kind:HumanWeapon,t:number,style:HumanStyle):Plan {
  const view=style.view??'front',broad=view==='front'||view==='back',side=view==='side',back=view==='back',hand=broad?'right':'left',stance=broad?14:12;
  const ground={leftFoot:[-stance,-4] as HumanPoint,rightFoot:[stance,-4] as HumanPoint,leftKnee:broad?1 as const:-1 as const,rightKnee:-1 as const,fists:true,armsFront:!back,blink:false};
  let lean=broad?0:1,y=broad?2:4,phase:HumanWeaponPhase='ready',angle=-.15,pull=0;
  if(kind==='sword'){
    // A light one-handed arming sword: weight shifts before the hand accelerates.
    // Keep the elbow on one anatomical branch. The old 4.58 rad bend wound the
    // wrist around the shoulder, reading as a baton twirl rather than a cut.
    type Key={x:number;lean:number;y:number;arm:HumanPoint;other:HumanPoint;angle:number};
    const ready:Key={x:-1,lean:broad?0:1,y:broad?4:5,arm:broad?[.9,1.45]:[.65,1.65],other:broad?[-.1,3]:[.5,2.4],angle:.24};
    const wind:Key={x:-4,lean:-2,y:broad?6:7,arm:[2.85,.92],other:broad?[-.3,2.85]:[.2,2.65],angle:-1.05};
    const drive:Key={x:0,lean:2,y:broad?3:4,arm:[2.65,.8],other:broad?[-.4,2.8]:[-.1,2.8],angle:-.92};
    const strike:Key={x:4,lean:broad?3:5,y:broad?4:5,arm:[1.35,.3],other:broad?[-.4,2.65]:[-.2,2.65],angle:1.48};
    const follow:Key={x:5,lean:broad?4:6,y:broad?5:6,arm:[.92,.55],other:broad?[-.25,2.8]:[-.1,2.75],angle:2.06};
    // The hand returns low and close to the body, rather than retracing the cut.
    const gather:Key={x:1,lean:1,y:broad?5:6,arm:[.25,2.05],other:ready.other,angle:.78};
    const settle:Key={...ready,x:-1.5,y:ready.y+.4,angle:.18};
    const lerpKey=(a:Key,b:Key,u:number):Key=>({x:mix(a.x,b.x,u),lean:mix(a.lean,b.lean,u),y:mix(a.y,b.y,u),arm:blend(a.arm,b.arm,u),other:blend(a.other,b.other,u),angle:mix(a.angle,b.angle,u)});
    let key=ready;
    if(t>0&&t<.28){key=lerpKey(ready,wind,smooth(t/.28));phase='windup';}
    else if(t>=.28&&t<.34){key=lerpKey(wind,drive,smooth((t-.28)/.06));phase='swing';}
    else if(t>=.34&&t<.44){key=lerpKey(drive,strike,smooth((t-.34)/.10));phase='swing';}
    else if(t>=.44&&t<.47){key=strike;phase='swing';}
    else if(t>=.47&&t<.56){key=lerpKey(strike,follow,smooth((t-.47)/.09));phase='follow-through';}
    else if(t>=.56&&t<.66){key=follow;phase='follow-through';}
    else if(t>=.66&&t<.94){key=lerpKey(follow,gather,smooth((t-.66)/.28));phase='recovery';}
    else if(t>=.94&&t<1.12){key=lerpKey(gather,settle,smooth((t-.94)/.18));phase='recovery';}
    else if(t>=1.12&&t<1.2){key=lerpKey(settle,ready,smooth((t-1.12)/.08));phase='recovery';}
    lean=key.lean;y=key.y;angle=key.angle;
    const base={...ground,x:key.x,lean,y},r=humanRig2D(style,base),other=broad?'left':'right';
    const otherAngles:HumanPoint=key.other;
    const a=humanLimbTarget2D(r[`${hand}Shoulder`],key.arm[0],key.arm[1],r.lengths.upperArm,r.lengths.forearm),o=humanLimbTarget2D(r[`${other}Shoulder`],otherAngles[0],otherAngles[1],r.lengths.upperArm,r.lengths.forearm);
    return{pose:{...base,[`${hand}Hand`]:a.target,[`${hand}Elbow`]:a.pole,[`${other}Hand`]:o.target,[`${other}Elbow`]:o.pole},phase,angle,pull};
  }
  const leadRest:HumanPoint=broad?[28,-55]:side?[18,-55]:[15,-55],leadFull:HumanPoint=broad?[42,-74]:side?[30,-74]:[24,-74];
  const drawRest:HumanPoint=broad?[16,-55]:side?[10,-55]:[6,-55],drawFull:HumanPoint=broad?[2,-75]:side?[3,-74]:[0,-74];
  let lead=leadRest,draw=drawRest;
  if(t>0&&t<.4){pull=smooth(t/.4);phase='draw';lead=blend(leadRest,leadFull,pull);draw=blend(drawRest,drawFull,pull);}
  else if(t>=.4&&t<.7){pull=1;phase='hold';lead=leadFull;draw=drawFull;}
  else if(t>=.7&&t<.9){pull=1;phase='release';lead=leadFull;draw=add(drawFull,[-3,-1],smooth((t-.7)/.2));}
  else if(t>=.9&&t<1.4){const u=smooth((t-.9)/.5);pull=1-u;phase='recovery';lead=blend(leadFull,leadRest,u);draw=blend(add(drawFull,[-3,-1]),drawRest,u);}
  else if(t>=1.4)phase='unloaded';
  // Arc around the shoulder's minimum-reach circle instead of passing through it.
  if(side)draw=[draw[0]-4*Math.sin(Math.PI*pull),draw[1]];
  lean=mix(broad?0:1,3,pull);
  const pose:HumanPose={...ground,lean,y,gaze:.3,[`${hand}Hand`]:lead,[`${hand}Elbow`]:1,[`${broad?'left':'right'}Hand`]:draw,[`${broad?'left':'right'}Elbow`]:broad?1:-1};
  return{pose,phase,angle,pull};
}
function geometry(kind:HumanWeapon,t:number,style:HumanStyle,p:Plan):HumanWeaponGeometry {
  const r=humanRig2D(style,p.pose),s=r.scale,hand=r.view==='front'||r.view==='back'?'right':'left',g=humanGrip2D(r,hand),sign=r.facing==='left'?-1:1;
  if(kind==='sword'){const d:HumanPoint=[Math.sin(p.angle)*sign,-Math.cos(p.angle)];return{kind,hand,grip:g,direction:d,tip:add(g,d,37*s),loaded:false};}
  const draw=humanGrip2D(r,hand==='left'?'right':'left'),d=unit(draw,g),v:HumanPoint=[-d[1]*sign,d[0]*sign],age=t-.7;
  const tension=t<.7?p.pull:Math.exp(-18*Math.max(0,age)),tipOffset=7+2*tension;
  const upperTip=add(add(g,v,-24*s),d,-tipOffset*s),lowerTip=add(add(g,v,24*s),d,-tipOffset*s);
  const nock=t<.7?draw:add(g,d,-(tipOffset+(Math.hypot(g[0]-draw[0],g[1]-draw[1])/s-tipOffset)*Math.exp(-22*age)*Math.cos(48*age))*s);
  return{kind,hand,grip:g,direction:d,tip:add(g,d,17*s),upperTip,lowerTip,nock,drawGrip:draw,arrowTip:add(g,d,17*s),loaded:t<.7};
}
export function humanWeapon2D(kind:HumanWeapon,time:number,style:HumanStyle={},reducedMotion=false):HumanWeaponSample {
  if(kind!=='sword'&&kind!=='bow')throw new RangeError(`Unknown human weapon: ${kind}`);
  if(!Number.isFinite(time))throw new RangeError('time must be finite');
  humanRig2D(style);const duration=HUMAN_WEAPON_TIMING[kind].duration,t=Math.max(0,Math.min(duration,time)),canonical={...style,height:96,facing:'right' as const};
  const p=plan(kind,reducedMotion?0:t,canonical),g=geometry(kind,reducedMotion?0:t,style,p),at=HUMAN_WEAPON_TIMING[kind].cue;
  const cp=plan(kind,at,canonical),cg=geometry(kind,kind==='bow'?at-1e-10:at,style,cp);
  const cue=reducedMotion?null:Object.freeze({kind:kind==='sword'?'slash' as const:'release' as const,at,position:Object.freeze([...cg.tip]) as HumanPoint,direction:Object.freeze([...cg.direction]) as HumanPoint});
  let projectile:HumanWeaponSample['projectile']=null;
  if(kind==='bow'&&!reducedMotion&&t>=at&&t<duration){const delta=160*(t-at)*(style.height??96)/96;projectile={tail:add(cg.drawGrip!,cg.direction,delta),tip:add(cg.arrowTip!,cg.direction,delta)};}
  return{pose:p.pose,phase:p.phase,time:t,duration,done:time>=duration,loop:false,geometry:g,cue,cueActive:!!cue&&time>=at&&time<at+.06,projectile};
}
function frame(x:number,y:number,w:number,h:number):PaintFrame{return{w,h,ox:x,oy:y,color:new Uint32Array(w*h),light:new Uint32Array(w*h)};}
function layer(f:PaintFrame):HumanWeaponPixels{return{x:f.ox,y:f.oy,w:f.w,h:f.h,pixels:f.color,mask:{w:f.w,h:f.h,data:Uint8Array.from(f.color,c=>c?1:0)}};}
function mirror<T extends HumanWeaponPixels>(a:T):T{const pixels=new Uint32Array(a.pixels.length),data=new Uint8Array(a.pixels.length);for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const i=y*a.w+x,j=y*a.w+a.w-1-x;pixels[j]=a.pixels[i];data[j]=a.mask.data[i];}return{...a,x:-a.x-a.w,pixels,mask:{w:a.w,h:a.h,data}};}
function blit(p:Painter,a:HumanWeaponPixels){for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const c=a.pixels[y*a.w+x];if(c)p.px(a.x+x,a.y+y,c);}}
function arrow(p:Painter,tail:HumanPoint,tip:HumanPoint,s:number){const d=unit(tail,tip),v:HumanPoint=[-d[1],d[0]],a=add(tip,d,-5*s);p.line(Math.round(tail[0]),Math.round(tail[1]),Math.round(a[0]),Math.round(a[1]),hex('#b99b68'));p.poly([tip,add(a,v,2*s),add(a,v,-2*s)].map(q=>q.map(Math.round) as [number,number]),hex('#aab9bd'));const f=add(tail,d,4*s);p.line(Math.round(tail[0]),Math.round(tail[1]),Math.round(add(f,v,2*s)[0]),Math.round(add(f,v,2*s)[1]),hex('#ba7668'));}
/** Render the actor/held item and the released arrow as separate reusable pixel layers. */
export function renderHumanWeapon2D(kind:HumanWeapon,time:number,style:HumanStyle={},reducedMotion=false):HumanWeaponFrame {
  if(style.facing==='left'){const a=renderHumanWeapon2D(kind,time,{...style,facing:'right'},reducedMotion),sample=humanWeapon2D(kind,time,style,reducedMotion);return{actor:{...mirror(a.actor),rig:humanRig2D(style,sample.pose)},projectile:a.projectile?mirror(a.projectile):null,sample};}
  const sample=humanWeapon2D(kind,time,style,reducedMotion),body=renderHuman2D({...style,outline:null},sample.pose),g=sample.geometry,s=body.rig.scale;
  const pts=[g.grip,g.tip,...(g.upperTip?[g.upperTip,g.lowerTip!,g.nock!,g.drawGrip!]:[])],pad=Math.ceil(7*s)+3;
  const x=Math.min(body.x,Math.floor(Math.min(...pts.map(p=>p[0])))-pad),y=Math.min(body.y,Math.floor(Math.min(...pts.map(p=>p[1])))-pad),w=Math.max(body.x+body.w,Math.ceil(Math.max(...pts.map(p=>p[0])))+pad)-x,h=Math.max(body.y+body.h,Math.ceil(Math.max(...pts.map(p=>p[1])))+pad)-y;
  const mat=frame(x,y,w,h),wire=frame(x,y,w,h),bp=frame(x,y,w,h),weapon=new Painter(mat),strings=new Painter(wire);blit(new Painter(bp),body);
  const P=(v:HumanPoint[],c:string)=>weapon.poly(v.map(q=>q.map(Math.round) as [number,number]),hex(c));
  const line=(p:Painter,a:HumanPoint,b:HumanPoint,c:string)=>p.line(Math.round(a[0]),Math.round(a[1]),Math.round(b[0]),Math.round(b[1]),hex(c));
  const d=g.direction,v:HumanPoint=[-d[1],d[0]];
  if(kind==='sword'){
    // Compact hilt + narrow steel blade, with one lit edge and a real tapered tip.
    // A dark material edge replaces the black halo around the old cyan paddle.
    const pommel=add(g.grip,d,-4.2*s),guard=add(g.grip,d,3.8*s),base=add(g.grip,d,5.1*s);
    P([add(pommel,v,-1.35*s),add(pommel,v,1.35*s),add(guard,v,1.15*s),add(guard,v,-1.15*s)],'#664a3d');
    line(weapon,pommel,guard,'#664a3d');
    P([add(add(pommel,d,-1.2*s),v,-1.4*s),add(add(pommel,d,-1.2*s),v,1.4*s),add(add(pommel,d,.6*s),v,1.5*s),add(add(pommel,d,.6*s),v,-1.5*s)],'#ad915d');
    P([add(guard,v,-4.1*s),add(guard,v,4.1*s),add(add(guard,d,1.4*s),v,3.7*s),add(add(guard,d,1.4*s),v,-3.7*s)],'#a58b59');
    line(weapon,add(guard,v,-4.1*s),add(guard,v,4.1*s),'#bfa374');
    // Rasterize the blade once in its own axis. Independent rounded polygons
    // plus an edge line used incompatible pixel coverage and left pinholes.
    const length=Math.hypot(g.tip[0]-base[0],g.tip[1]-base[1]),taper=6*s;
    const loX=Math.floor(Math.min(base[0],g.tip[0])-3*s-1),hiX=Math.ceil(Math.max(base[0],g.tip[0])+3*s+1);
    const loY=Math.floor(Math.min(base[1],g.tip[1])-3*s-1),hiY=Math.ceil(Math.max(base[1],g.tip[1])+3*s+1);
    for(let py=loY;py<=hiY;py++)for(let px=loX;px<=hiX;px++){
      const dx=px+.5-base[0],dy=py+.5-base[1],along=dx*d[0]+dy*d[1],across=dx*v[0]+dy*v[1];
      if(along<-.4||along>length+.25)continue;
      const bodyWidth=mix(2.3,1.35,Math.min(1,Math.max(0,along)/(length-taper)))*s;
      const width=Math.max(.72,along>length-taper?1.35*s*(length-along)/taper:bodyWidth);
      if(Math.abs(across)>width)continue;
      weapon.px(px,py,hex(across>width-.72?'#dae2dd':across>-.3*width?'#a4b8bd':'#536974'));
    }
    line(weapon,guard,base,'#738993');
  }else{
    const b=g.grip,up=g.upperTip!,down=g.lowerTip!,midUp=add(add(b,v,-12*s),d,-1*s),midDown=add(add(b,v,12*s),d,-1*s);
    for(const points of[[up,midUp,b],[b,midDown,down]])for(let i=0;i<2;i++){const a=points[i],c=points[i+1],n=unit(a,c),q:HumanPoint=[-n[1]*1.7*s,n[0]*1.7*s];P([add(a,q),add(c,q),add(c,q,-1),add(a,q,-1)],'#9b7047');line(weapon,a,c,'#c69b5f');}
    line(strings,up,g.nock!,'#9f9279');line(strings,g.nock!,down,'#9f9279');
    if(g.loaded)arrow(strings,g.drawGrip!,g.arrowTip!,s);
  }
  // View-specific material order, then the holding palms cover the hilt/string.
  const back=body.rig.view==='back',color=new Uint32Array(w*h),palm=(px:number,py:number)=>{
    const grips=kind==='bow'?[g.grip,g.drawGrip!]:[g.grip];return grips.some(a=>Math.hypot(px-a[0],py-a[1])<=3.2*s+.4);
  };
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const i=yy*w+xx,bodyColor=bp.color[i],held=mat.color[i];color[i]=back?(bodyColor||held):(held||bodyColor);if(bodyColor&&palm(x+xx,y+yy))color[i]=bodyColor;}
  const pixels=color.slice(),ink=style.outline===null?0:hex(style.outline??'#252633');
  if(ink)for(let yy=1;yy<h-1;yy++)for(let xx=1;xx<w-1;xx++){const i=yy*w+xx;const neighbors=style.outline!==undefined||kind!=='sword'?color:bp.color;if(!color[i]&&(neighbors[i-1]||neighbors[i+1]||neighbors[i-w]||neighbors[i+w]))pixels[i]=ink;}
  // The string/shaft is a single colored line, never a thick black triangle.
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const i=yy*w+xx;if(wire.color[i]&&!mat.color[i]&&!(bp.color[i]&&(back||palm(x+xx,y+yy))))pixels[i]=wire.color[i];}
  const actor:HumanSprite={...body,x,y,w,h,pixels,mask:{w,h,data:Uint8Array.from(pixels,c=>c?1:0)}};
  let projectile:HumanWeaponPixels|null=null;
  if(sample.projectile){const a=sample.projectile,pp=Math.ceil(4*s)+3,px=Math.floor(Math.min(a.tail[0],a.tip[0]))-pp,py=Math.floor(Math.min(a.tail[1],a.tip[1]))-pp,pw=Math.ceil(Math.max(a.tail[0],a.tip[0]))-px+pp+1,ph=Math.ceil(Math.max(a.tail[1],a.tip[1]))-py+pp+1,f=frame(px,py,pw,ph);arrow(new Painter(f),a.tail,a.tip,s);projectile=layer(f);}
  return{actor,projectile,sample};
}
export function drawHumanWeapon2D(p:Painter,kind:HumanWeapon,time:number,style:HumanStyle={},reducedMotion=false):HumanWeaponFrame {const a=renderHumanWeapon2D(kind,time,style,reducedMotion);blit(p,a.actor);if(a.projectile)blit(p,a.projectile);return a;}
