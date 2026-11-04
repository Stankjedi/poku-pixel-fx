/** Optional authored appearance clusters. They never ink individual parts. */
import { hex } from './color.js';
import type { Painter } from './painter.js';
import type { HumanPoint, HumanRig, HumanStyle } from './human.js';
type Materials = { skin: number[]; hair: number[]; cloth: number[]; pants: number[] };
/** Shape the head and its attached hair, not the skeleton or its animation. */
export function humanHeadOffset(r:HumanRig,style:HumanStyle,dx:number,dy:number):HumanPoint {
  const shape=style.faceShape??'oval';
  if(shape==='round'){dx*=1.18;dy*=.92;}
  else if(shape==='long'){dx*=.9;dy*=1.14;}
  else if(shape==='square'){
    dx*=1.12;
    // Give the lower jaw extra width beyond the broader skull.
    if(dy>3&&dy<9&&Math.abs(dx)>1)dx+=Math.sign(dx)*1.15;
    if(dy>6&&dy<9)dy=6+(dy-6)*.6;
  }
  return [r.head[0]+dx*r.scale,r.head[1]+dy*r.scale];
}
/** Return true when a new hair style owns this stage; old styles remain untouched. */
export function paintHumanHair2D(p:Painter,style:HumanStyle,r:HumanRig,colors:Materials,stage:'behind'|'head'):boolean {
  const kind=style.hair;
  if(kind!=='shaved'&&kind!=='ponytail'&&kind!=='parted')return false;
  const {skin,hair}=colors,back=r.view==='back',front=r.view==='front',s=r.scale;
  const pt=(x:number,y:number)=>humanHeadOffset(r,style,x,y);
  const P=(a:number[][],c:number)=>p.poly(a.map(([x,y])=>pt(x,y).map(Math.round) as [number,number]),c);
  const E=(x:number,y:number,rx:number,ry:number,c:number)=>{const a=pt(x,y);p.ellipse(Math.round(a[0]),Math.round(a[1]),Math.max(.65,rx*s),Math.max(.65,ry*s),c);};
  if(stage==='behind'){
    if(kind==='ponytail'){
      if(front)P([[4,-4],[8,-3],[10,4],[9,14],[6,20],[3,18],[5,8]],hair[0]);
      else if(back)P([[-3,-1],[3,-1],[5,7],[3,17],[-1,21],[-4,17],[-3,7]],hair[0]);
      else P([[-6,-5],[-10,-3],[-12,4],[-12,12],[-8,18],[-6,14],[-8,5],[-4,-1]],hair[0]);
    }
    return true;
  }
  if(kind==='shaved'){
    if(back){
      P([[-4,-7],[3,-7],[6,-3],[6,2],[3,6],[0,7],[-4,5],[-6,1],[-6,-3]],skin[2]);
      P([[3,-6],[6,-3],[6,2],[3,6],[0,7],[2,2]],skin[1]);
      if(r.height>=48)P([[-4,-5],[-2,-7],[2,-7],[4,-5],[3,-4],[-3,-4]],skin[0]);
    } else if(r.height>=48){
      // Close-cut scalp shadow, not an opaque dark helmet.
      P(front?[[-6,-3],[-6,-5],[-4,-7],[3,-7.5],[5,-5],[5,-3],[3,-5],[-3,-5]]:[[-6,-1],[-6,-4],[-4,-7],[1,-7.5],[4,-5],[3,-4],[0,-6],[-3,-4],[-4,0]],skin[0]);
    }
    return true;
  }
  if(back){
    P([[-5,-7],[-1,-9],[4,-8],[6,-5],[6,2],[4,5],[1,7],[-2,6],[-5,4],[-6,0],[-6,-4]],hair[0]);
    P([[-4,-5],[-1,-7],[2,-7],[3,-3],[0,0],[-3,2],[-4,-1]],hair[1]);
    if(kind==='parted')P([[0,-8],[3,-7],[5,-4],[4,1],[2,3],[2,-3]],hair[2]);
    else {E(0,0,3.5,3,hair[1]);P([[-2,3],[2,3],[2,13],[-1,18],[-2,13]],hair[1]);}
    return true;
  }
  if(kind==='parted'){
    P(front?[[-7,3],[-8,-3],[-5,-8],[-1,-9],[0,-7],[2,-9],[6,-7],[7,-3],[6,3],[4,1],[4,-4],[1,-6],[-1,-4],[-4,-3],[-5,3]]:[[-6,4],[-8,-2],[-6,-7],[-2,-9],[0,-7],[2,-9],[5,-6],[5,-3],[2,-4],[0,-6],[-2,-3],[-3,3]],hair[0]);
    P(front?[[-6,-4],[-4,-7],[-1,-8],[-1,-6],[-4,-4]]:[[-6,-4],[-4,-7],[-2,-8],[-1,-6],[-4,-3]],hair[1]);
    P(front?[[1,-7],[3,-8],[5,-6],[5,-4],[3,-5]]:[[1,-7],[2,-8],[4,-6],[3,-5]],hair[2]);
  }else{
    P(front?[[-6,1],[-7,-4],[-5,-8],[1,-9],[5,-7],[7,-3],[5,1],[4,-4],[1,-6],[-2,-5],[-4,-2],[-5,2]]:[[-6,3],[-7,-3],[-6,-7],[-2,-9],[3,-8],[5,-5],[4,-3],[1,-4],[-2,-4],[-3,1]],hair[0]);
    P(front?[[-5,-5],[-2,-7],[2,-7],[4,-5],[0,-6],[-3,-4]]:[[-5,-5],[-3,-7],[1,-7],[3,-5],[0,-5],[-3,-3]],hair[1]);
  }
  // No strands or forehead bands at tiny resolutions.
  return true;
}
/** Beard is a connected lower-face color mass, omitted entirely from the back. */
export function paintHumanFacialHair2D(p:Painter,style:HumanStyle,r:HumanRig,colors:Materials):void {
  if(!style.facialHair||style.facialHair==='none'||r.view==='back')return;
  const {skin,hair}=colors,front=r.view==='front',side=r.view==='side';
  const P=(a:number[][],c:number)=>p.poly(a.map(([x,y])=>humanHeadOffset(r,style,x,y).map(Math.round) as [number,number]),c);
  P(front?[[-5,2],[-3,3],[-2,5],[2,5],[4,2],[5,2],[4,7],[1,10],[-2,9],[-4,6]]:side?[[-2,2],[0,3],[2,5],[5,3],[6,4],[4,8],[1,9],[-2,6]]:[[-5,2],[-2,4],[0,5],[3,4],[4,3],[4,7],[1,10],[-2,8],[-4,6]],hair[1]);
  if(r.height>=48)P(front?[[-3,6],[0,7],[3,5],[2,8],[0,9],[-2,8]]:[[-1,6],[2,6],[3,5],[2,8],[0,8]],hair[2]);
  // Keep the mouth as a small warm gap, not an ink outline around the beard.
  if(r.height>=64)P(front?[[-1,4],[1,4],[1,5],[-1,5]]:side?[[4,3],[5,3],[5,4],[4,4]]:[[1,4],[3,4],[3,5],[1,5]],skin[0]);
}
/** Optional garment construction. Bib and straps share the trouser color ramp. */
export function paintHumanGarment2D(p:Painter,style:HumanStyle,r:HumanRig,colors:Materials):void {
  const outfit=style.outfit;if(outfit!=='sweater'&&outfit!=='overalls')return;
  const {cloth,pants}=colors,s=r.scale,broad=r.view==='front'||r.view==='back',back=r.view==='back',side=r.view==='side';
  const off=(a:HumanPoint,x:number,y:number):[number,number]=>[Math.round(a[0]+x*s),Math.round(a[1]+y*s)];
  const P=(a:[number,number][],c:number)=>p.poly(a,c),N=r.neck,C=r.chest,V=r.pelvis;
  if(outfit==='sweater'){
    if(r.height>=48){P([off(V,-8*r.width,-2),off(V,8*r.width,-2),off(V,8*r.width,2),off(V,-8*r.width,2)],cloth[0]);
      P([off(N,-4,0),off(N,0,3),off(N,4,0),off(N,3,3),off(N,0,5),off(N,-3,3)],cloth[0]);}
    return;
  }
  const l=broad?-5:side?2:-1,rr=broad?5:side?6:6;
  P([off(C,l,back?5:1),off(C,rr,back?5:1),off(V,side?5:8*r.width,2),off(V,side?-5:-8*r.width,2)],pants[1]);
  if(broad){
    P([off(r.leftShoulder,1,0),off(r.leftShoulder,3,0),off(C,-3,5),off(C,-5,5)],pants[2]);
    P([off(r.rightShoulder,-3,0),off(r.rightShoulder,-1,0),off(C,5,5),off(C,3,5)],pants[0]);
  } else {
    P([off(N,0,1),off(N,2,1),off(C,rr,5),off(C,rr-2,5)],pants[2]);
  }
  if(r.height>=64&&!back)P([off(C,l+1,7),off(C,rr-1,7),off(C,rr-1,10),off(C,l+2,11)],pants[2]);
}

/** Reserve readable pupil/lid cells after new clusters snap to very small pixels.
 * Legacy appearance defaults never enter this pass, preserving existing sprites. */
export function paintHumanAppearanceEyes2D(p:Painter,style:HumanStyle,r:HumanRig,colors:Materials):void {
  if(r.view==='back'||(!style.faceShape||style.faceShape==='oval')&&style.facialHair!=='beard'&&!['shaved','ponytail','parted'].includes(style.hair??''))return;
  const gaze=Math.max(-1,Math.min(1,r.pose.gaze??0)),c=r.pose.blink?colors.skin[0]:hex('#3b3038');
  const dot=(x:number,y:number)=>{const q=humanHeadOffset(r,style,x,y);p.px(Math.round(q[0]),Math.round(q[1]),c);};
  if(r.view==='front'){dot(-2.8+gaze,.2);dot(2.6+gaze,.2);}
  else if(r.view==='side')dot(3.2+.5*gaze,-.5);
  else {dot(-.5+.6*gaze,.2);if(r.height>=48)dot(3.6+.3*gaze,.2);}
}
