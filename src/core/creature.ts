import { blitSprite2D } from './sprite-raster.js';
/** Authored side-view creature studies. Pure 2D, seekable and independent of the human rig. */
import { Painter, type PaintFrame } from './painter.js';
import { hex, mix } from './color.js';
export type CreatureSpecies = 'fox' | 'cat' | 'owl' | 'dragon';
export type CreatureMotion = 'idle' | 'walk' | 'trot' | 'fly';
export type CreaturePoint = [number, number];
export type CreaturePalette = [string, string, string, ...string[]];
export interface CreatureStyle {
  species?: CreatureSpecies;
  /** Canonical construction scale, 32..192; tails/wings may extend beyond this nominal size. */
  size?: number;
  facing?: 'right' | 'left';
  /** Three to six opaque colors, ordered dark to light; larger sprites use extra steps. */
  body?: CreaturePalette;
  accent?: CreaturePalette;
  /** No contour by default. If set, only the finished union receives a 1px contour. */
  outline?: string | null;
}
export interface CreatureOptions { reducedMotion?: boolean }
export interface CreatureLeg {
  name: 'nearFront' | 'farFront' | 'nearHind' | 'farHind';
  root: CreaturePoint; joint: CreaturePoint; ankle: CreaturePoint; toe: CreaturePoint;
  lengths: [number, number, number]; contact: boolean; phase: number;
}
export interface CreatureWing {
  shoulder: CreaturePoint; elbow: CreaturePoint; wrist: CreaturePoint;
  tips: CreaturePoint[]; lengths: [number, number]; far: boolean;
}
export interface CreatureRig {
  species: CreatureSpecies; motion: CreatureMotion; facing: 'right' | 'left';
  scale: number; phase: number; period: number; root: CreaturePoint; head: CreaturePoint;
  legs: CreatureLeg[]; wings: CreatureWing[]; tail: CreaturePoint[];
  /** Forward virtual treadmill speed; add speed*t to in-place x for grounded travel. */
  travelSpeed: number;
}
export interface CreatureSprite {
  x: number; y: number; w: number; h: number; pixels: Uint32Array;
  mask: {w: number; h: number; data: Uint8Array}; rig: CreatureRig;
}
const TAU=Math.PI*2;
const speciesList: CreatureSpecies[]=['fox','cat','owl','dragon'];
const colors={
  fox:{body:['#965235','#c77943','#e7aa60'],accent:['#ac9982','#d6c7a2','#f1e1bb']},
  cat:{body:['#526779','#788d9d','#acbdc6'],accent:['#9a8d84','#c3b8a4','#e4d9bb']},
  owl:{body:['#71604e','#a18460','#c9ac7e'],accent:['#a49678','#d1c7a3','#eee3bd']},
  dragon:{body:['#34685e','#508e76','#80b28b'],accent:['#7c5062','#aa7180','#d2999b']},
};
const finite=(n:number,label:string)=>{if(!Number.isFinite(n))throw new RangeError(`${label} must be finite`);return n;};
const validColor=(c:unknown)=>typeof c==='string'&&/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c);
function validate(style:CreatureStyle,motion:CreatureMotion,t:number,options:CreatureOptions){
  const species=style.species??'fox',size=style.size??96;
  if(!speciesList.includes(species))throw new RangeError(`Unknown creature species: ${species}`);
  finite(size,'size');if(size<32||size>192)throw new RangeError('creature size must be 32..192');
  finite(t,'time');if(Math.abs(t)>1e9)throw new RangeError('time must be within ±1e9 seconds');
  if(style.facing!==undefined&&!['right','left'].includes(style.facing))throw new RangeError('facing must be right or left');
  for(const key of ['body','accent'] as const){const v=style[key];if(v!==undefined&&(!Array.isArray(v)||v.length<3||v.length>6||!Array.from(v).every(validColor)))throw new TypeError(`${key} needs three to six #rgb or #rrggbb colors`);}
  if(style.outline!==undefined&&style.outline!==null&&!validColor(style.outline))throw new TypeError('outline must be a color or null');
  if(options.reducedMotion!==undefined&&typeof options.reducedMotion!=='boolean')throw new TypeError('reducedMotion must be boolean');
  const allowed=species==='fox'||species==='cat'?['idle','walk','trot']:['idle','fly'];
  if(!allowed.includes(motion))throw new RangeError(`${species} supports ${allowed.join(', ')}, not ${motion}`);
  return {species,size};
}
const polar=(p:CreaturePoint,length:number,angle:number):CreaturePoint=>[p[0]+length*Math.cos(angle),p[1]+length*Math.sin(angle)];
function twoBone(a:CreaturePoint,b:CreaturePoint,upper:number,lower:number,bend:number):CreaturePoint{
  const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);
  if(d>=upper+lower||d<=Math.abs(upper-lower))throw new RangeError('Creature preset contains an unreachable leg');
  const c=(upper*upper-lower*lower+d*d)/(2*d),h=Math.sqrt(Math.max(0,upper*upper-c*c));
  return[a[0]+dx/d*c-dy/d*h*bend,a[1]+dy/d*c+dx/d*h*bend];
}
const phaseAt=(t:number,period:number)=>{const p=((t%period)+period)%period/period;return p<1e-12||1-p<1e-12?0:p;};
/** Independent quadruped footfalls and articulated avian/membrane wings; no human joint mapping. */
export function creatureRig2D(style:CreatureStyle={},motion:CreatureMotion='idle',seconds=0,options:CreatureOptions={}):CreatureRig{
  const {species,size}=validate(style,motion,seconds,options),scale=size/96;
  const quadruped=species==='fox'||species==='cat',moving=!options.reducedMotion;
  const period=motion==='trot'?1:motion==='walk'?2:motion==='fly'?1.5:3;
  const phase=moving?phaseAt(seconds,period):0,a=phase*TAU;
  const active=moving&&motion!=='idle';
  const bob=active?(motion==='fly'?1.8*Math.sin(a-.5):motion==='trot'?-1.2*(1-Math.cos(a*2)):-.35*(1-Math.cos(a*4))):moving?.4*Math.sin(a):0;
  const root:CreaturePoint=[0,(quadruped?-27:-37)+bob];
  const head:CreaturePoint=quadruped?[species==='fox'?29:25,root[1]-(species==='fox'?9:8)]:[species==='owl'?18:27,root[1]-(species==='owl'?4:5)];
  const legs:CreatureLeg[]=[],wings:CreatureWing[]=[];
  const duty=motion==='trot'?.54:.76,span=motion==='trot'?18:13;
  const travelSpeed=active&&quadruped?span/(duty*period):0;
  if(quadruped){
    const names:CreatureLeg['name'][]=['farHind','farFront','nearHind','nearFront'];
    // A lateral-sequence four-beat walk; diagonal pairs share phase only in trot.
    const walkOffsets={nearHind:0,nearFront:.75,farHind:.5,farFront:.25};
    const trotOffsets={nearHind:0,nearFront:.5,farHind:.5,farFront:0};
    for(const name of names){
      const front=name.endsWith('Front'),far=name.startsWith('far');
      const p=active?phaseAt(phase+(motion==='trot'?trotOffsets:walkOffsets)[name],1):0;
      const contact=!active||p<duty;
      const stride=active?(contact?span/2-span*p/duty:-span/2+span*(.5-.5*Math.cos(Math.PI*(p-duty)/(1-duty)))):0;
      const lift=active&&!contact?(motion==='trot'?7:5)*Math.sin(Math.PI*(p-duty)/(1-duty)):0;
      const x=(front?16:-17)+(far?1.8:0),toe:CreaturePoint=[x+stride,-1-lift];
      const ankle:CreaturePoint=[toe[0]-(front?1:3),toe[1]-3];
      const rr:CreaturePoint=[x,root[1]+(front?0:1)];
      const upper=front?14:15,lower=front?14:14;
      legs.push({name,root:rr,joint:twoBone(rr,ankle,upper,lower,front?1:-1),ankle,toe,lengths:[upper,lower,Math.hypot(toe[0]-ankle[0],toe[1]-ankle[1])],contact,phase:p});
    }
  }else{
    for(const far of [true,false]){
      const flap=motion==='fly'&&moving?Math.sin(a):-.5;
      const sh:CreaturePoint=[species==='owl'?-4:-2,root[1]-4+(far?-2:0)];
      // Bone lengths stay constant. Recovery folds at the elbow; it is not a rigid fan rotation.
      const theta=Math.PI-(.18+flap*1.05)+(far?.16:0),upper=species==='owl'?19:25,lower=species==='owl'?19:27;
      const el=polar(sh,upper,theta),wr=polar(el,lower,theta+.14+.38*Math.max(0,-flap));
      const tips:CreaturePoint[]=[];
      for(let i=0;i<6;i++){
        const angle=theta+.2+i*(species==='owl'?.24:.31),length=(species==='owl'?24:34)*(1-i*.065);
        tips.push(polar(wr,length,angle));
      }
      wings.push({shoulder:sh,elbow:el,wrist:wr,tips,lengths:[upper,lower],far});
    }
  }
  const tail:CreaturePoint[]=[];
  for(let i=0;i<=12;i++){
    const u=i/12;
    if(species==='fox')tail.push([-22-u*36,root[1]+3+Math.sin(u*Math.PI)*5-u*9+(moving?Math.sin(a-u*1.8)*u*2.4:0)]);
    else if(species==='cat')tail.push([-22-30*Math.sin(u*1.45),root[1]+2-26*u*u+(moving?Math.sin(a-u*2)*u*2:0)]);
    else if(species==='dragon')tail.push([-20-u*49,root[1]+3+Math.sin(u*Math.PI)*10+(moving?Math.sin(a-u*2.5)*u*6:0)]);
    else tail.push([-14-u*18,root[1]+5+u*6]);
  }
  const facing=style.facing??'right',mult=facing==='left'?-1:1;
  const pt=(p:CreaturePoint):CreaturePoint=>[p[0]*scale*mult,p[1]*scale];
  return{species,motion,facing,scale,phase,period,root:pt(root),head:pt(head),travelSpeed:travelSpeed*scale*mult,
    legs:legs.map(l=>({...l,root:pt(l.root),joint:pt(l.joint),ankle:pt(l.ankle),toe:pt(l.toe),lengths:l.lengths.map(n=>n*scale) as [number,number,number]})),
    wings:wings.map(w=>({...w,shoulder:pt(w.shoulder),elbow:pt(w.elbow),wrist:pt(w.wrist),tips:w.tips.map(pt),lengths:w.lengths.map(n=>n*scale) as [number,number]})),tail:tail.map(pt)};
}
function reflected(sp:CreatureSprite,rig:CreatureRig):CreatureSprite{
  const pixels=new Uint32Array(sp.pixels.length),data=new Uint8Array(sp.pixels.length);
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const to=y*sp.w+sp.w-x-1,from=y*sp.w+x;pixels[to]=sp.pixels[from];data[to]=sp.mask.data[from];}
  return{...sp,x:-sp.x-sp.w,pixels,mask:{w:sp.w,h:sp.h,data},rig};
}
/** Render a crisply quantized, opaque material sprite and reusable mask. Origin remains fixed. */
export function renderCreature2D(style:CreatureStyle={},motion:CreatureMotion='idle',seconds=0,options:CreatureOptions={}):CreatureSprite{
  const r=creatureRig2D(style,motion,seconds,options);
  if(style.facing==='left')return reflected(renderCreature2D({...style,facing:'right'},motion,seconds,options),r);
  const s=r.scale,species=r.species,quadruped=species==='fox'||species==='cat';
  // Conservative construction bounds are constant for a species/size, so atlas pivots never drift.
  const x=Math.floor(-110*s)-3,y=Math.floor(-125*s)-3,w=Math.ceil(165*s)+7,h=Math.ceil(170*s)+7;
  const frame:PaintFrame={w,h,ox:x,oy:y,color:new Uint32Array(w*h),light:new Uint32Array(w*h)},p=new Painter(frame);
  const bodyRamp=(style.body??colors[species].body).map(hex),accentRamp=(style.accent??colors[species].accent).map(hex);
  const select=(ramp:number[])=>[ramp[0],ramp[Math.floor((ramp.length-1)/2)],ramp[ramp.length-1]];
  const rawBody=select(bodyRamp),rawAccent=select(accentRamp);
  // One coat material spans torso, neck and near limbs. Extremes are reserved for eyes/markings,
  // not painted as specular lines along every bone. Adjacent volume steps stay close in value.
  const body=[mix(rawBody[1],rawBody[0],.42),rawBody[1],mix(rawBody[1],rawBody[2],.34)];
  const acc=[mix(rawAccent[1],rawAccent[0],.50),rawAccent[1],mix(rawAccent[1],rawAccent[2],.45)];
  const occluded=mix(body[1],rawBody[0],.52),furShadow=mix(body[1],rawBody[0],.28);
  const feather=species==='owl'?mix(body[1],acc[1],.38):acc[1];
  const dark=hex(species==='fox'?'#634633':species==='cat'?'#3d5266':species==='owl'?'#594b41':'#294e4f'),eye=hex('#272d39');
  const P=(points:CreaturePoint[],c:number)=>{
    const cells:CreaturePoint[]=points.map(q=>[Math.round(q[0]),Math.round(q[1])]);
    p.poly(cells,c);
    // Same-material boundary coverage keeps acute feathers and horns joined, never adds ink.
    p.polyline([...cells,cells[0]],c);
  };
  const off=(q:CreaturePoint,dx:number,dy:number):CreaturePoint=>[q[0]+dx*s,q[1]+dy*s];
  const ell=(q:CreaturePoint,rx:number,ry:number,c:number)=>p.ellipse(Math.round(q[0]),Math.round(q[1]),Math.max(.65,rx*s),Math.max(.65,ry*s),c);
  const band=(a:CreaturePoint,b:CreaturePoint,ra:number,rb:number,c:number)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy),nx=d?-dy/d:0,ny=d?dx/d:1;
    // Subpixel limb/tail segments keep a readable one-cell connected core at small scales.
    const ar=Math.max(.8,ra*s),br=Math.max(.8,rb*s);
    P([[a[0]+nx*ar,a[1]+ny*ar],[b[0]+nx*br,b[1]+ny*br],[b[0]-nx*br,b[1]-ny*br],[a[0]-nx*ar,a[1]-ny*ar]],c);
    ell(a,ra,ra,c);ell(b,rb,rb,c);
    p.line(Math.round(a[0]),Math.round(a[1]),Math.round(b[0]),Math.round(b[1]),c);
  };
  // Tail painted first, with continuous taper and species-specific mass.
  for(let i=1;i<r.tail.length;i++){
    const u=i/(r.tail.length-1),radius=species==='fox'?1+4.8*Math.sin(Math.PI*u*.94):species==='cat'?2*(1-u*.7):species==='dragon'?3.5*(1-u)+.6:4-u;
    band(r.tail[i-1],r.tail[i],radius,radius*.95,species==='fox'&&u>.71?acc[1]:body[1]);
  }
  const leg=(l:CreatureLeg)=>{
    const far=l.name.startsWith('far'),front=l.name.endsWith('Front'),c=far?occluded:body[1];
    band(l.root,l.joint,front?3.1:4.7,front?2.3:3.1,c);band(l.joint,l.ankle,front?2.3:3.1,1.3,c);
    // The same fur fill passes through shoulder/hip, elbow/knee and ankle.
    // Only the small paw end carries a restrained natural fox marking.
    band(l.ankle,l.toe,1.4,1.7,c);
    ell(off(l.toe,1,-.1),2.8,1.1,species==='fox'?mix(c,dark,.48):c);
  };
  const wing=(v:CreatureWing)=>{
    const c=v.far?occluded:body[1],wingAcc=v.far?mix(feather,acc[0],.40):feather;
    if(species==='owl'){
      const base=off(v.shoulder,2,10);
      P([v.shoulder,v.elbow,v.wrist,...v.tips,base],c);
      // Primary feather tips are grouped, not outlined as separate panels.
      for(let i=0;i<v.tips.length;i++){
        const tip=v.tips[i],start:CreaturePoint=[v.wrist[0]+(base[0]-v.wrist[0])*i/8,v.wrist[1]+(base[1]-v.wrist[1])*i/8];
        band(start,tip,3.5,1,wingAcc);
        // Feather shafts are not painted as luminous sticks; overlap carries the structure.
      }
      P([v.shoulder,v.elbow,v.wrist,off(v.tips[0],8,4),base],c);
      band(v.shoulder,v.elbow,4,3,c);band(v.elbow,v.wrist,3,1.5,c);
      if(!v.far&&s>=.66&&bodyRamp.length>3){
        const mid:CreaturePoint=[(v.shoulder[0]+v.elbow[0])*.5,(v.shoulder[1]+v.elbow[1])*.5];
        ell(mid,3,2,mix(c,bodyRamp[bodyRamp.length-2],.20));
      }
    }else{
      const base=off(r.root,-14,10),edge:CreaturePoint[]=[];
      for(let i=0;i<v.tips.length;i++){
        const q=v.tips[i];edge.push(q);
        const next=v.tips[i+1]??base;edge.push([(q[0]+next[0])*.5+(v.wrist[0]-(q[0]+next[0])*.5)*.28,(q[1]+next[1])*.5+(v.wrist[1]-(q[1]+next[1])*.5)*.28]);
      }
      P([v.shoulder,v.elbow,v.wrist,...edge,base],wingAcc);
      for(let i=0;i<v.tips.length;i++)band(v.wrist,v.tips[i],.75,.45,mix(wingAcc,acc[0],.30));
      band(v.shoulder,v.elbow,3,2,c);band(v.elbow,v.wrist,2,1.2,c);
      ell(v.wrist,1.8,1.8,c);
      if(!v.far&&s>=.66&&accentRamp.length>3)for(let i=1;i<v.tips.length;i+=2){const tip=v.tips[i];band(v.wrist,[(v.wrist[0]+tip[0])*.5,(v.wrist[1]+tip[1])*.5],1,.6,mix(wingAcc,accentRamp[accentRamp.length-2],.18));}
    }
  };
  r.wings.filter(v=>v.far).forEach(wing);r.legs.filter(l=>l.name.startsWith('far')).forEach(leg);
  // Ribcage and haunch form a single connected value mass, never separately inked blobs.
  if(quadruped){
    ell(r.root,species==='cat'?24:23,species==='cat'?8:9,body[1]);
    ell(off(r.root,-14,1),10,9,body[1]);ell(off(r.root,14,-1),9,11,body[1]);
    // Broad planes follow the ribcage volume; no bright back stripe or joint edging.
    P([off(r.root,-14,4),off(r.root,13,3),off(r.root,12,7),off(r.root,1,8),off(r.root,-9,6)],furShadow);
    ell(off(r.root,-3,-3),17,4.8,body[2]);
    if(s>=.66&&bodyRamp.length>3){
      ell(off(r.root,-9,-2),9,3,mix(body[1],bodyRamp[bodyRamp.length-2],.23));
    }
    // A thick neck bridge connects muzzle/head to the thorax.
    band(off(r.root,16,-1),off(r.head,-4,2),7,7,body[1]);
    if(species==='fox')P([off(r.head,-7,0),off(r.head,5,6),off(r.root,16,13),off(r.root,11,5)],acc[1]);
    r.legs.filter(l=>l.name.startsWith('near')).forEach(leg);
    const H=r.head;
    ell(H,species==='fox'?9:9,species==='fox'?7:8,body[1]);
    if(species==='fox'){
      P([off(H,3,-3),off(H,17,2),off(H,14,5),off(H,2,6),off(H,-2,3)],body[2]);
      P([off(H,3,3),off(H,14,4),off(H,9,7),off(H,-3,7)],acc[2]);
      P([off(H,-7,-4),off(H,-7,-18),off(H,1,-7)],body[0]);P([off(H,-1,-5),off(H,3,-18),off(H,8,-4)],body[1]);
      P([off(H,1,-8),off(H,3,-14),off(H,5,-7)],acc[0]);ell(off(H,15,2),2,1.4,dark);
    }else{
      P([off(H,-8,-4),off(H,-7,-16),off(H,0,-8)],body[0]);P([off(H,0,-7),off(H,6,-15),off(H,8,-2)],body[1]);
      P([off(H,2,-8),off(H,5,-12),off(H,6,-5)],acc[0]);ell(off(H,7,3),4,3,acc[1]);ell(off(H,10,2),1.5,1,acc[0]);
      if(s>=.7){P([off(r.root,-13,-7),off(r.root,-9,-8),off(r.root,-11,-1)],furShadow);P([off(r.root,-3,-8),off(r.root,1,-8),off(r.root,-1,-2)],furShadow);}
    }
    ell(off(H,species==='fox'?6:5,-2),1.2,1.2,eye);if(s>=1)ell(off(H,species==='fox'?6:5,-2.5),.5,.5,acc[2]);
  }else{
    ell(r.root,species==='owl'?20:24,species==='owl'?10:9,body[1]);
    P([off(r.root,-17,3),off(r.root,15,2),off(r.root,8,9),off(r.root,-6,10)],species==='owl'?acc[1]:body[0]);
    band(off(r.root,13,-1),off(r.head,-4,1),7,6,body[1]);
    // Tucked clawed hind feet belong to flyers; there are no dangling human arms.
    for(const dx of [-12,7]){
      band(off(r.root,dx,5),off(r.root,dx-4,12),3,1.5,body[0]);
      P([off(r.root,dx-5,11),off(r.root,dx+2,12),off(r.root,dx+5,16),off(r.root,dx,14),off(r.root,dx-4,14)],acc[0]);
    }
    if(species==='owl'){
      ell(r.head,11,11,body[1]);ell(off(r.head,4,0),7,8,acc[1]);
      ell(off(r.head,7,-1),3.4,3.8,acc[2]);ell(off(r.head,8,-1),1.8,2,eye);
      P([off(r.head,9,3),off(r.head,16,4),off(r.head,13,8)],hex('#a9894e'));
      P([off(r.head,-8,-6),off(r.head,-8,-13),off(r.head,-3,-10)],body[0]);
    }else{
      ell(r.head,10,6.5,body[1]);P([off(r.head,3,-3),off(r.head,18,0),off(r.head,18,4),off(r.head,5,6)],body[2]);
      P([off(r.head,-6,-5),off(r.head,-15,-13),off(r.head,-4,-9),off(r.head,0,-5)],acc[1]);
      P([off(r.head,0,-6),off(r.head,-5,-14),off(r.head,4,-7)],acc[2]);
      ell(off(r.head,6,-2),2,1.5,acc[2]);ell(off(r.head,7,-2),.7,1.2,eye);ell(off(r.head,16,1),1,.7,body[0]);
      for(let i=0;i<5;i++){const q=r.tail[2+i*2];P([off(q,2,-1),off(q,-1,-6+i*.5),off(q,-4,0)],body[2]);}
    }
    r.wings.filter(v=>!v.far).forEach(wing);
  }
  const pixels=frame.color.slice(),ink=style.outline?hex(style.outline):0;
  if(ink)for(let yy=1;yy<h-1;yy++)for(let xx=1;xx<w-1;xx++){
    const i=yy*w+xx;if(!frame.color[i]&&(frame.color[i-1]||frame.color[i+1]||frame.color[i-w]||frame.color[i+w]))pixels[i]=ink;
  }
  return{x,y,w,h,pixels,mask:{w,h,data:Uint8Array.from(pixels,c=>c?1:0)},rig:r};
}
/** Draw with the caller's Painter placement, mirroring, opacity and rotation. */
export function drawCreature2D(p:Painter,style:CreatureStyle={},motion:CreatureMotion='idle',seconds=0,options:CreatureOptions={}):CreatureSprite{
  const sp=renderCreature2D(style,motion,seconds,options);
  blitSprite2D(p,sp);
  return sp;
}

export interface CreatureCanvasOptions extends CreatureOptions {
  width: number; height: number;
  /** Integer sprite origin inside the export canvas. No auto-fit or resampling occurs. */
  pivot?: CreaturePoint;
}
export interface CreatureCanvas {
  w: number; h: number; pivot: CreaturePoint; pixels: Uint32Array;
  mask: {w:number; h:number; data:Uint8Array}; rig: CreatureRig;
  /** Place at 1:1 in a shared scene grid; magnify only the completed scene. */
  sourcePixelsPerScenePixel: 1;
}
/** Export onto an explicit canvas without resizing the art. Clipping is an error, never silent. */
export function renderCreatureCanvas2D(style:CreatureStyle={},motion:CreatureMotion='idle',seconds=0,canvas:CreatureCanvasOptions={width:128,height:128}):CreatureCanvas{
  const {width:w,height:h}=canvas;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>2048||h>2048||w*h>1_048_576)throw new RangeError('Creature canvas needs integer dimensions 1..2048 and at most 1048576 pixels');
  const pivot=canvas.pivot??[Math.round(w*.67),Math.floor(h*.78)];
  if(!Array.isArray(pivot)||pivot.length!==2||!pivot.every(Number.isInteger)||pivot[0]<0||pivot[0]>=w||pivot[1]<0||pivot[1]>=h)throw new RangeError('Creature canvas pivot must be an integer point inside the canvas');
  const sp=renderCreature2D(style,motion,seconds,canvas),pixels=new Uint32Array(w*h);
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){
    const c=sp.pixels[y*sp.w+x];if(!c)continue;
    const xx=sp.x+x+pivot[0],yy=sp.y+y+pivot[1];
    if(xx<0||yy<0||xx>=w||yy>=h)throw new RangeError('Creature exceeds the requested canvas; enlarge the canvas or choose a different physical size/pivot');
    pixels[yy*w+xx]=c;
  }
  return{w,h,pivot:[pivot[0],pivot[1]],pixels,mask:{w,h,data:Uint8Array.from(pixels,c=>c?1:0)},rig:sp.rig,sourcePixelsPerScenePixel:1};
}
