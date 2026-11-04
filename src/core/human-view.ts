/** Authored 2D side and three-quarter shapes, sharing the human rig and final union contour.
 * Far limbs use material shadows; near limbs overlap naturally without ink seams.
 */
import type { HumanPoint, HumanStyle, HumanRig } from './human.js';
import type { Painter } from './painter.js';
import { humanHeadOffset, paintHumanHair2D, paintHumanFacialHair2D, paintHumanGarment2D } from './human-appearance.js';
import { hex } from './color.js';
type Materials={skin:number[];hair:number[];cloth:number[];pants:number[];shoe:number[]};
export function paintHumanView2D(p:Painter,style:HumanStyle,r:HumanRig,colors:Materials):void {
 const {skin,hair,cloth,pants,shoe}=colors,s=r.scale,wf=r.width,side=r.view==='side',back=r.view==='back';
 const gaze=Math.max(-1,Math.min(1,r.pose.gaze??0));
 const outfit=style.outfit??'shirt',hairStyle=style.hair??'swept';
 const P=(v:HumanPoint[],c:number)=>p.poly(v.map(q=>[Math.round(q[0]),Math.round(q[1])]),c);
 const L=(v:HumanPoint[],c:number)=>p.polyline(v.map(q=>[Math.round(q[0]),Math.round(q[1])]),c);
 const D=(v:HumanPoint,c:number)=>p.px(Math.round(v[0]),Math.round(v[1]),c);
 const off=(v:HumanPoint,dx:number,dy:number):HumanPoint=>v===r.head?humanHeadOffset(r,style,dx,dy):[v[0]+dx*s,v[1]+dy*s];
 const lerp=(a:HumanPoint,b:HumanPoint,t:number):HumanPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 const E=(v:HumanPoint,rx:number,ry:number,c:number)=>p.ellipse(Math.round(v[0]),Math.round(v[1]),Math.max(.65,rx*s),Math.max(.65,ry*s),c);
 function limb(a:HumanPoint,b:HumanPoint,wa:number,wb:number,c:number){
  const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/d*s,ny=(b[0]-a[0])/d*s;
  P([[a[0]+nx*wa,a[1]+ny*wa],[b[0]+nx*wb,b[1]+ny*wb],[b[0]-nx*wb,b[1]-ny*wb],[a[0]-nx*wa,a[1]-ny*wa]],c);E(a,wa,wa,c);E(b,wb,wb,c);
 }
 function leg(near:boolean){
  const a=near?r.leftHip:r.rightHip,b=near?r.leftKnee:r.rightKnee,c=near?r.leftAnkle:r.rightAnkle,tone=near?1:0;
  limb(a,b,4.3*wf,3.25*wf,pants[tone]);limb(b,c,3.25*wf,2.35*wf,pants[tone]);
  if(near&&r.height>=48){limb(off(lerp(a,b,.15),-1,0),off(lerp(a,b,.83),-.8,0),1.1,.75,pants[2]);limb(off(lerp(b,c,.18),-.7,0),off(lerp(b,c,.88),-.6,0),.8,.6,pants[2]);}
  // Side toes point with the view; rear feet show a compact heel instead.
  if(back){
    P([off(c,-2.6,-1.8),off(c,2.6,-1.8),off(c,3.6,1.5),off(c,3.6,4),off(c,-3.6,4),off(c,-3.6,1.5)],shoe[near?1:0]);
    if(near&&r.height>=48)L([off(c,-2,1),off(c,2,1)],shoe[2]);
    L([off(c,-3,3),off(c,3,3)],shoe[0]);
  }else{
  P([off(c,-2.4,-1.7),off(c,2.4,-1.7),off(c,3.3,1),off(c,7,2),off(c,7,4),off(c,-3,4),off(c,-3,1)],shoe[near?1:0]);
  if(near&&r.height>=48)L([off(c,-1,0),off(c,3,1)],shoe[2]);
  L([off(c,-2,3),off(c,6,3)],shoe[0]);
  }
 }
 function arm(near:boolean){
  const a=near?r.leftShoulder:r.rightShoulder,b=near?r.leftElbow:r.rightElbow,c=near?r.leftHand:r.rightHand,tone=near?2:1;
  limb(a,b,3.45*wf,2.65*wf,skin[tone]);limb(b,c,2.65*wf,1.8*wf,skin[tone]);
  if(near&&r.height>=56)limb(off(lerp(b,c,.2),-.5,0),off(lerp(b,c,.8),-.5,0),.75,.6,skin[3]);
  const cut=outfit==='sleeveless'?.12:outfit==='sweater'?1:outfit==='jacket'?.94:.48,end=lerp(a,b,cut);
  limb(a,end,(outfit==='sweater'?4.7:4.0)*wf,(outfit==='sweater'?3.7:3.15)*wf,cloth[near?1:0]);
  if(outfit==='jacket'||outfit==='sweater')limb(b,lerp(b,c,.82),3.1*wf,2.25*wf,cloth[near?1:0]);
  if(near&&r.height>=56)limb(off(lerp(a,end,.1),-.8,0),off(lerp(a,end,.8),-.8,0),1.1,.75,cloth[2]);
  const d=Math.hypot(c[0]-b[0],c[1]-b[1])||1,ux=(c[0]-b[0])/d,uy=(c[1]-b[1])/d;
  const fist=r.pose.fists===true,reach=fist?2.4:3.6;
  limb(c,[c[0]+ux*reach*s,c[1]+uy*reach*s],fist?2.2:1.8,fist?2:1.5,skin[tone]);
  if(near&&r.height>=64)E([c[0]-uy*1.8*s+ux*s,c[1]+ux*1.8*s+uy*s],1,1.3,skin[tone]);
 }
 const H=r.head,N=r.neck,C=r.chest,V=r.pelvis,half=(back?10:side?6.8:9.2)*wf;
 paintHumanHair2D(p,style,r,colors,'behind');
 // Back hair and far limbs precede the joined torso; no dark outlines between layers.
 if(!back&&hairStyle==='bob')P([off(H,-6,-5),off(H,2,-6),off(H,4,13),off(H,-1,16),off(H,-7,13),off(H,-8,1)],hair[0]);
 if(!back&&hairStyle==='bun')E(off(H,-5.5,-7),4.1,3.8,hair[0]);
 arm(false);if(back)arm(true);leg(false);
 P([off(V,-half,-4),off(V,half,-4),off(V,half,4),off(V,1,8),off(V,-half,4)],pants[1]);
 leg(true);
 // One torso silhouette: back curve, chest, waist and hem. Light follows the whole material.
 P([off(N,-2.5,0),off(C,-half,-5),off(C,-half-1,4),off(V,-half+1,-6),off(V,-half,2),off(V,half,2),off(V,half-1,-6),off(C,half,1),off(C,half-1,-6),off(N,2.5,0)],cloth[1]);
 P([off(N,-2,1),off(C,-half,-4),off(C,-half-1,4),off(V,-half+1,-5),off(V,-half,1),off(V,-half+3,1),off(C,-half+4,-1)],cloth[0]);
 P([off(N,1,1),off(C,half-2,-4),off(C,half-1,1),off(C,half-3,7),off(V,2,-3),off(C,0,1)],cloth[2]);
 if(!back&&outfit==='jacket'&&r.height>=48){
  P([off(N,1,1),off(N,3,1),off(V,half-1,0),off(V,half-4,0),off(C,3,3)],hex('#c8b99a'));
  L([off(N,3,2),off(C,half-1,-1),off(C,3,5)],cloth[0]);
 }
 if(outfit==='tunic'){
  P([off(V,-half,-3),off(V,half,-3),off(V,half+2,12),off(V,2,13),off(V,0,8),off(V,-half-2,12)],cloth[1]);
  P([off(V,-half,-2),off(V,-half+3,-2),off(V,-half+1,11),off(V,-half-2,11)],cloth[0]);
 }
 if(r.height>=72)L([off(V,-half+2,0),off(V,1,1),off(V,half-1,0)],cloth[0]);
 paintHumanGarment2D(p,style,r,colors);
 // Near arm overlays the torso as a colored volume, never an outlined cutout.
 if(r.pose.armsFront)arm(false);
 if(!back||r.pose.armsFront)arm(true);
 // Neck and shaped jaw connect directly, with only warm contact shading under the chin.
 if(back)P([off(N,-2.8,-5),off(N,2.8,-5),off(N,3,0),off(N,1.8,1.3),off(N,-1.8,1.3),off(N,-3,0)],skin[1]);
 else P([off(N,-2.5,-5),off(N,2.5,-5),off(N,3,1),off(N,0,3),off(N,-3,1)],skin[1]);
 P([off(N,-1,-3),off(N,1.6,-3),off(N,2,1),off(N,0,2)],skin[2]);
 if(back){
  // Nape and ears, then a full back-of-head hair mass. No face marks or nose.
  E(off(H,-6,.5),1.1,1.7,skin[2]);E(off(H,6,.5),1.1,1.7,skin[1]);
  if(paintHumanHair2D(p,style,r,colors,'head')){} else if(hairStyle==='bob'){
    P([off(H,-5,-8),off(H,2,-9),off(H,6,-6),off(H,7,2),off(H,8,14),off(H,3,17),off(H,-3,16),off(H,-8,13),off(H,-7,-3)],hair[0]);
    P([off(H,-4,-6),off(H,0,-7),off(H,1,2),off(H,2,14),off(H,-3,13),off(H,-5,5)],hair[1]);
    if(r.height>=48)L([off(H,-3,-5),off(H,-2,2),off(H,-2,10)],hair[2]);
  }else if(hairStyle==='curls'){
    P([off(H,-6,4),off(H,-8,0),off(H,-8,-5),off(H,-6,-8),off(H,-2,-10),off(H,1,-9),off(H,5,-9),off(H,7,-6),off(H,8,-2),off(H,6,4),off(H,3,7),off(H,0,6),off(H,-3,7)],hair[0]);
    for(const [xx,yy]of[[-5,-5],[-2,-7],[2,-6],[-4,0],[0,-2],[3,2]])E(off(H,xx,yy),1.6,1.4,hair[1]);
  }else{
    P([off(H,-5,-7),off(H,-1,-9),off(H,4,-8),off(H,6,-5),off(H,6,2),off(H,4,5),off(H,2,7),off(H,0,6),off(H,-2,7),off(H,-5,4),off(H,-6,0),off(H,-6,-4)],hair[0]);
    P([off(H,-4,-5),off(H,-1,-7),off(H,3,-6),off(H,3,-3),off(H,0,0),off(H,-3,2),off(H,-4,-1)],hair[1]);
    if(r.height>=48)L([off(H,-3,-5),off(H,0,-6),off(H,2,-5)],hair[2]);
    if(hairStyle==='bun'){E(off(H,0,-6.5),4.4,4.0,hair[1]);E(off(H,-1.2,-7.3),2.2,1.7,hair[2]);}
  }
 }else if(side){
  P([off(H,-4,-7),off(H,2,-7),off(H,5,-4.5),off(H,5,-1.5),off(H,8,0),off(H,6,1.5),off(H,6,4),off(H,3.5,6.5),off(H,0,7),off(H,-3,5.5),off(H,-6,1),off(H,-6,-4)],skin[2]);
  P([off(H,-5,-3),off(H,-1,-3),off(H,-1,3),off(H,2,6),off(H,0,7),off(H,-3,5.5),off(H,-6,1)],skin[1]);
  if(r.height>=48)P([off(H,1,-3),off(H,4,-3),off(H,4,-1),off(H,2,1),off(H,1,3)],skin[3]);
  E(off(H,-1.5,.5),1.5,2,skin[2]);
  D(off(H,3.2+.5*gaze,-.5),r.pose.blink?skin[0]:hex('#3b3038'));
  if(r.height>=64){D(off(H,-1.5,.5),skin[0]);L([off(H,4.5,3.5),off(H,6,3.5)],skin[0]);}
 } else {
  P([off(H,-4.5,-7),off(H,2.5,-7.5),off(H,5,-4),off(H,5,-1),off(H,7,1),off(H,5,2),off(H,4.5,5),off(H,1.5,7.5),off(H,-1.5,7),off(H,-5,4),off(H,-6,0),off(H,-6,-4)],skin[2]);
  P([off(H,-5,-4),off(H,-2,-4),off(H,-2,2),off(H,0,5.5),off(H,1.5,7.5),off(H,-1.5,7),off(H,-5,4),off(H,-6,0)],skin[1]);
  if(r.height>=48)P([off(H,0,-3),off(H,3,-4),off(H,4,-1),off(H,2,2),off(H,0,1)],skin[3]);
  E(off(H,-5.5,.5),1.2,1.9,skin[2]);
  D(off(H,-.5+.6*gaze,.2),r.pose.blink?skin[0]:hex('#3b3038'));
  // A second eye needs separate pixels. At 32px the near eye carries the expression.
  if(r.height>=48)D(off(H,3.6+.3*gaze,.2),r.pose.blink?skin[0]:hex('#3b3038'));
  if(r.height>=64){D(off(H,4,2),skin[1]);L([off(H,1,5),off(H,3,5)],skin[0]);}
 }
 // Asymmetric hair masses leave the nose silhouette and eye area clear.
 if(back)return;
 paintHumanFacialHair2D(p,style,r,colors);
 if(paintHumanHair2D(p,style,r,colors,'head')){} else if(hairStyle==='crop'){
  P([off(H,-6,1),off(H,-7,-4),off(H,-5,-7),off(H,0,-9),off(H,4,-7),off(H,5,-4),off(H,2,-4),off(H,0,-5),off(H,-3,-2),off(H,-3,1)],hair[0]);
  P([off(H,-5,-5),off(H,-2,-7),off(H,1,-7),off(H,2,-5),off(H,-1,-4)],hair[1]);
 } else if(hairStyle==='curls'){
  P([off(H,-6,2),off(H,-8,-2),off(H,-8,-6),off(H,-5,-8),off(H,-3,-10),off(H,0,-9),off(H,3,-9),off(H,5,-6),off(H,4,-3),off(H,1,-3),off(H,-1,-4),off(H,-3,-1),off(H,-3,2)],hair[0]);
  for(const [x,y] of [[-5,-6],[-2,-8],[1,-7],[3,-5]])E(off(H,x,y),1.4,1,hair[1]);
 } else if(hairStyle==='bob'){
  P([off(H,-7,8),off(H,-8,-3),off(H,-5,-8),off(H,1,-9),off(H,5,-6),off(H,5,-3),off(H,2,-4),off(H,-1,-3),off(H,-3,0),off(H,-3,7),off(H,-5,9)],hair[1]);
  P([off(H,-6,-4),off(H,-4,-7),off(H,0,-8),off(H,3,-6),off(H,-1,-5),off(H,-4,-1)],hair[2]);
 } else {
  P([off(H,-6,3),off(H,-7,-3),off(H,-6,-7),off(H,-2,-9),off(H,3,-9),off(H,6,-6),off(H,4,-3),off(H,1,-4),off(H,-2,-2),off(H,-3,2)],hair[0]);
  P([off(H,-5,-5),off(H,-2,-7),off(H,2,-8),off(H,4,-6),off(H,0,-5),off(H,-3,-3)],hair[1]);
  if(r.height>=72)L([off(H,-3,-6),off(H,0,-7),off(H,2,-7)],hair[2]);
 }
}
