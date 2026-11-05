import { blitSprite2D } from './sprite-raster.js';
/** Original adult portrait studies. Native face budgets, semantic eyes and joined color masses. */
import { Painter } from './painter.js';
import { hex } from './color.js';
import { characterPalette } from './character-cache.js';
import type { PaintFrame } from './painter.js';
export type HumanPortraitResolution=64|96|128|192;
export type HumanPortraitExpression='neutral'|'smile'|'determined'|'surprised';
export interface HumanPortraitStyle {
  /** Target design resolution. This controls detail tiers, not a bitmap resize. */
  resolution?:HumanPortraitResolution;
  /** Optional padding only. Changing it never changes actor pixel size or detail. */
  canvas?:readonly[number,number];
  facing?:'right'|'left';
  face?:'oval'|'angular'|'long';
  skin?:'light'|'warm'|'brown'|'deep';
  hair?:'long'|'bob'|'ponytail'|'braid';
  hairColor?:'ink'|'copper'|'plum'|'silver';
  eyes?:'teal'|'amber'|'violet'|'brown';
  clothing?:'blouse'|'coat'|'knit';
  cloth?:'ocean'|'rose'|'moss'|'violet';
  outline?:string|null;
  /** Palette identity shared with native full-body construction, without resizing either image. */
  palettes?:{skin?:readonly[string,string,string,string];hair?:readonly[string,string,string,string];cloth?:readonly[string,string,string,string];eyes?:readonly[string,string,string]};
}
export interface HumanPortraitPose {
  expression?:HumanPortraitExpression;gaze?:number;blink?:boolean;
  /** Seekable two-second idle. Head features share one integer raster anchor. */
  time?:number;reducedMotion?:boolean;
}
export interface HumanPortraitSprite {
  w:number;h:number;pixels:Uint32Array;mask:{w:number;h:number;data:Uint8Array};
  /** Anatomical face and reserved eye regions, in this full native canvas. */
  faceMask:Uint8Array;eyeRegionMask:Uint8Array;eyeMask:Uint8Array;frontHairMask:Uint8Array;
  headAnchor:readonly[number,number];eyeAnchors:readonly[readonly[number,number],readonly[number,number]];
  resolution:HumanPortraitResolution;detailTier:'compact'|'standard'|'rich';blink:boolean;
}
const SKIN={light:['#a96d65','#ce9282','#e9b5a0','#f2cbb3'],warm:['#945b49','#bd805c','#d9a578','#ebbf91'],brown:['#68433f','#98634f','#bc8968','#d4a682'],deep:['#42333e','#6b4a43','#936650','#b38365']};
const HAIR={ink:['#272838','#3d4157','#62657c','#8b8da0'],copper:['#593d40','#8c5345','#bd7b52','#dba36a'],plum:['#3f304d','#654966','#95698c','#bd91aa'],silver:['#535c70','#7c8a9c','#afb9c4','#d7d9d5']};
const CLOTH={ocean:['#304b60','#4b7386','#79a0ad','#a4c3c7'],rose:['#684650','#956672','#bb8d92','#dfb4ac'],moss:['#354e49','#5c7863','#8aa084','#b6c3a5'],violet:['#4d465f','#756b8c','#a095b2','#c3bad0']};
const EYES={teal:['#334e58','#477f84','#7bafa7'],amber:['#644c39','#9e793f','#cfa75e'],violet:['#493f66','#7c679f','#af94c8'],brown:['#534038','#845c46','#b48a5e']};
const choices={facing:['right','left'],face:['oval','angular','long'],skin:Object.keys(SKIN),hair:['long','bob','ponytail','braid'],hairColor:Object.keys(HAIR),eyes:Object.keys(EYES),clothing:['blouse','coat','knit'],cloth:Object.keys(CLOTH)};
function validate(style:HumanPortraitStyle,pose:HumanPortraitPose){
  const resolution=style.resolution??128;if(![64,96,128,192].includes(resolution))throw new RangeError('Portrait resolution must be 64, 96, 128 or 192');
  for(const[key,allowed]of Object.entries(choices)){const value=(style as Record<string,unknown>)[key];if(value!==undefined&&!allowed.includes(value as string))throw new RangeError(`Unknown portrait ${key}: ${value}`);}
  if(style.canvas!==undefined&&(!Array.isArray(style.canvas)||style.canvas.length!==2||!Array.from(style.canvas).every(n=>Number.isInteger(n)&&n>=resolution&&n<=512)))throw new RangeError('Portrait canvas must be two integers from resolution through 512');
  if(style.outline!==undefined&&style.outline!==null&&!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(style.outline))throw new TypeError('Portrait outline must be null or a hex color');
  for(const[key,colors]of Object.entries(style.palettes??{}))if(!['skin','hair','cloth','eyes'].includes(key)||!Array.isArray(colors)||colors.length!==(key==='eyes'?3:4)||!colors.every(c=>typeof c==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(c)))throw new RangeError('Invalid shared portrait palette');
  if(!['neutral','smile','determined','surprised'].includes(pose.expression??'neutral'))throw new RangeError('Unknown portrait expression');
  for(const key of['time','gaze']as const)if(pose[key]!==undefined&&!Number.isFinite(pose[key]))throw new RangeError(`${key} must be finite`);
  for(const key of['blink','reducedMotion']as const)if(pose[key]!==undefined&&typeof pose[key]!=='boolean')throw new TypeError(`${key} must be boolean`);
  return resolution;
}
function frame(w:number,h:number):PaintFrame{return{w,h,ox:0,oy:0,color:new Uint32Array(w*h),light:new Uint32Array(w*h)};}
/** Front-facing bust, with optional whole-canvas reflection of hair/lighting. No 3D projection. */
function renderPortraitUncached(style:HumanPortraitStyle={},pose:HumanPortraitPose={}):HumanPortraitSprite {
  const resolution=validate(style,pose);
  if(style.facing==='left'){
    const a=renderPortraitUncached({...style,facing:'right'},pose),flip=<T extends Uint32Array|Uint8Array>(src:T):T=>{const out=src.slice() as T;for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)out[y*a.w+a.w-1-x]=src[y*a.w+x];return out;};
    return{...a,pixels:flip(a.pixels),mask:{...a.mask,data:flip(a.mask.data)},faceMask:flip(a.faceMask),eyeRegionMask:flip(a.eyeRegionMask),eyeMask:flip(a.eyeMask),frontHairMask:flip(a.frontHairMask),headAnchor:[a.w-1-a.headAnchor[0],a.headAnchor[1]],eyeAnchors:a.eyeAnchors.map(q=>[a.w-1-q[0],q[1]]) as [[number,number],[number,number]]};
  }
  const [w,h]=style.canvas??[resolution,resolution],s=resolution/128,t=((pose.time??0)%2+2)%2,compact=resolution===64,rich=resolution===192;
  // Idle is a blink, not a rigid whole-bust bob or an unsupported hair simulation.
  const ox=Math.floor((w-resolution)/2),oy=Math.floor((h-resolution)/2),cx=ox+Math.round(resolution*.5),cy=oy+Math.round(resolution*.375);
  const skin=characterPalette(style.palettes?.skin??SKIN[style.skin??'warm']),hair=characterPalette(style.palettes?.hair??HAIR[style.hairColor??'ink']),cloth=characterPalette(style.palettes?.cloth??CLOTH[style.cloth??'ocean']),iris=characterPalette(style.palettes?.eyes??EYES[style.eyes??'teal']);
  const base=frame(w,h),face=frame(w,h),front=frame(w,h),eye=frame(w,h),safe=frame(w,h),p=new Painter(base),fp=new Painter(face),hp=new Painter(front),ep=new Painter(eye),rp=new Painter(safe);
  const pt=(x:number,y:number):[number,number]=>[cx+Math.round(x*s),cy+Math.round(y*s)];
  const poly=(p:Painter,a:number[][],c:number)=>p.poly(a.map(([x,y])=>pt(x,y)),c);
  const line=(p:Painter,a:number[][],c:number)=>p.polyline(a.map(([x,y])=>pt(x,y)),c);
  const dot=(p:Painter,x:number,y:number,c:number)=>{const q=pt(x,y);p.px(q[0],q[1],c);};
  const ell=(p:Painter,x:number,y:number,rx:number,ry:number,c:number)=>{const q=pt(x,y);p.ellipse(q[0],q[1],Math.max(.6,rx*s),Math.max(.6,ry*s),c);};
  const hairStyle=style.hair??'long',clothing=style.clothing??'blouse',shape=style.face??'oval',jaw=shape==='angular'?14:11,chin=shape==='long'?27:24;
  // One rear mass per hairstyle, never individually inked locks.
  if(hairStyle==='long'||hairStyle==='braid')poly(p,[[-20,-16],[-8,-28],[12,-26],[22,-12],[25,17],[24,50],[18,57],[14,39],[-14,42],[-23,55],[-25,48],[-25,13]],hair[0]);
  if(hairStyle==='bob')poly(p,[[-22,-22],[-9,-31],[13,-29],[24,-17],[27,19],[22,32],[15,34],[-16,33],[-27,24],[-27,3]],hair[0]);
  if(hairStyle==='ponytail'){
    poly(p,[[-21,-22],[-29,-18],[-36,1],[-34,24],[-24,40],[-18,34],[-24,12],[-18,-4]],hair[0]);
    poly(p,[[-29,-10],[-33,4],[-30,24],[-25,32],[-25,14],[-23,-5]],hair[1]);
  }
  // Neck connects into the shoulder slope. Folds are sparse and follow tension.
  const shoulder=clothing==='coat'?43:40;
  poly(p,[[-8,25],[-11,32],[-24,36],[-35,43],[-42,54],[-46,73],[46,73],[42,54],[35,43],[24,36],[11,32],[8,25]],cloth[1]);
  poly(p,[[20,37],[31,41],[40,51],[46,73],[31,73],[28,57],[24,46]],cloth[0]);
  poly(p,[[-26,38],[-35,44],[-40,53],[-43,65],[-38,68],[-32,57],[-29,48]],cloth[2]);
  poly(p,[[-8,chin-4],[8,chin-4],[8,32],[2,39],[-2,39],[-9,32]],skin[1]);
  poly(p,[[-6,chin-1],[2,chin],[3,31],[-1,35],[-6,31]],skin[2]);
  if(clothing==='coat'){
    poly(p,[[-7,32],[0,38],[7,32],[10,73],[-10,73]],hex('#cfbdab'));
    poly(p,[[-9,29],[-18,35],[-11,48],[-5,42],[-9,73],[-1,67]],cloth[0]);
    poly(p,[[9,29],[18,35],[11,48],[5,42],[9,73],[2,67]],cloth[2]);
    if(!compact){line(p,[[-27,48],[-24,57]],cloth[0]);line(p,[[27,48],[29,57]],cloth[1]);}
  }else if(clothing==='knit'){
    poly(p,[[-10,27],[0,31],[10,27],[12,35],[4,41],[-6,39],[-12,34]],cloth[1]);
    poly(p,[[-10,29],[-7,34],[3,36],[10,32],[9,36],[1,40],[-9,36]],cloth[0]);
    if(!compact)line(p,[[-8,29],[-4,31],[3,32],[8,29]],cloth[2]);
    poly(p,[[-26,50],[-22,55],[-20,65],[-23,60]],cloth[0]);
  }else{
    poly(p,[[-9,29],[-15,34],[-8,43],[0,38]],cloth[2]);
    poly(p,[[9,29],[15,34],[8,43],[0,38]],cloth[0]);
    if(!compact){line(p,[[0,40],[0,68]],cloth[2]);dot(p,1,48,cloth[0]);dot(p,1,58,cloth[0]);}
    poly(p,[[-27,49],[-23,55],[-22,63],[-25,58]],cloth[0]);
  }
  if(rich){line(p,[[-34,59],[-30,65]],cloth[0]);line(p,[[32,60],[30,66]],cloth[1]);}
  // Face-region mask is independent of later hair, eyes and material colors.
  poly(fp,[[-13,-25],[7,-27],[18,-20],[21,-7],[20,8],[jaw,17],[5,chin-1],[0,chin],[-7,chin-2],[-jaw,17],[-20,8],[-21,-7],[-19,-19]],skin[2]);
  ell(fp,-21,6,3,5,skin[2]);ell(fp,21,6,2.5,4.5,skin[1]);
  const faceMask=Uint8Array.from(face.color,c=>c?1:0);
  poly(fp,[[14,-21],[19,-16],[21,-6],[20,8],[jaw,17],[0,chin],[8,17],[15,8],[16,-3]],skin[1]);
  if(!compact)poly(fp,[[-10,-17],[-3,-20],[3,-14],[2,-6],[-5,-5],[-11,-8]],skin[3]);
  for(let i=0;i<face.color.length;i++)if(face.color[i])base.color[i]=face.color[i];
  const expression=pose.expression??'neutral',blink=pose.blink??(!pose.reducedMotion&&t>1.55&&t<1.68),gaze=Math.max(-1,Math.min(1,pose.gaze??0));
  const eyeAnchors=[pt(-10,1),pt(10,1)] as [[number,number],[number,number]];
  // Reserve the anatomical eye/brow space before painting bangs. Never put eyes on hair.
  for(const x of[-10,10]){const lo=pt(x-6,-10),hi=pt(x+6,7);rp.rect(lo[0],lo[1],hi[0]-lo[0]+1,hi[1]-lo[1]+1,0xffffffff);}
  const eyeRegionMask=Uint8Array.from(safe.color,(c,i)=>c&&faceMask[i]?1:0);
  // Crown and large locks. Highlights follow form; no black strand grid.
  // Separate part/fringe construction, not a shared wig with different rear tails.
  if(hairStyle==='long'){
    poly(hp,[[-23,16],[-28,-7],[-25,-24],[-15,-32],[-7,-35],[7,-35],[16,-31],[24,-23],[27,-8],[23,17],[19,10],[19,-10],[10,-19],[2,-26],[-1,-19],[-10,-11],[-18,-5],[-18,14]],hair[1]);
    poly(hp,[[-25,-9],[-22,-24],[-13,-31],[-2,-33],[-5,-24],[-13,-17],[-21,-10]],hair[2]);
    poly(hp,[[1,-33],[13,-31],[22,-22],[24,-10],[18,-15],[11,-23],[3,-28]],hair[0]);
    if(!compact)poly(hp,[[-17,-24],[-12,-28],[-7,-29],[-10,-25],[-16,-21]],hair[3]);
  }else if(hairStyle==='bob'){
    poly(hp,[[-24,15],[-28,-8],[-24,-25],[-13,-34],[7,-35],[21,-29],[28,-15],[27,16],[20,21],[18,-10],[11,-8],[8,-15],[3,-9],[-3,-11],[-7,-8],[-14,-11],[-19,-8],[-18,18]],hair[1]);
    poly(hp,[[-25,-10],[-22,-24],[-12,-31],[6,-32],[16,-27],[20,-19],[11,-20],[3,-24],[-8,-23],[-19,-15]],hair[2]);
    poly(hp,[[16,-28],[23,-21],[26,-10],[22,10],[18,-11],[11,-8],[9,-14],[17,-14]],hair[0]);
    if(!compact)poly(hp,[[-18,-25],[-10,-29],[5,-30],[12,-27],[2,-27],[-9,-26],[-19,-20]],hair[3]);
  }else if(hairStyle==='braid'){
    poly(hp,[[-23,15],[-28,-8],[-24,-24],[-13,-32],[-4,-35],[8,-35],[19,-29],[27,-18],[26,8],[20,18],[18,-8],[14,-19],[5,-18],[-3,-10],[-11,-8],[-18,-4],[-18,18]],hair[1]);
    poly(hp,[[-25,-10],[-20,-25],[-10,-31],[4,-32],[8,-28],[2,-22],[-7,-16],[-17,-10]],hair[2]);
    poly(hp,[[10,-31],[19,-27],[25,-17],[25,-5],[19,-13],[15,-23]],hair[0]);
    if(!compact)poly(hp,[[-19,-22],[-9,-28],[4,-29],[0,-25],[-11,-20]],hair[3]);
  }else{
    poly(hp,[[-23,10],[-27,-10],[-22,-26],[-10,-34],[8,-34],[22,-24],[26,-10],[23,12],[18,17],[18,-6],[15,-17],[8,-22],[-2,-20],[-9,-13],[-17,-9],[-18,9]],hair[1]);
    poly(hp,[[-23,-10],[-20,-24],[-10,-31],[6,-31],[11,-27],[1,-27],[-9,-20],[-18,-11]],hair[2]);
    poly(hp,[[12,-29],[21,-22],[24,-9],[21,7],[18,-7],[15,-18]],hair[0]);
    if(!compact)poly(hp,[[-18,-23],[-9,-28],[4,-29],[-4,-25],[-13,-18]],hair[3]);
  }
  if(hairStyle==='bob'){
    poly(hp,[[-23,-6],[-19,-2],[-18,21],[-12,29],[-20,30],[-25,23]],hair[1]);
    poly(hp,[[21,-5],[25,1],[24,23],[18,30],[13,28],[19,19]],hair[0]);
    if(!compact)poly(hp,[[-22,3],[-20,10],[-20,21],[-17,26],[-21,23]],hair[2]);
  }else if(hairStyle==='long'){
    poly(hp,[[-23,-6],[-19,-2],[-18,23],[-19,46],[-23,51],[-25,27]],hair[1]);
    poly(hp,[[21,-3],[25,4],[25,28],[21,51],[17,46],[20,22]],hair[0]);
    if(!compact)poly(hp,[[-22,8],[-20,18],[-21,43],[-23,47],[-23,25]],hair[2]);
  }else if(hairStyle==='braid'){
    poly(hp,[[19,9],[24,15],[25,24],[22,32],[24,40],[20,49],[19,56],[13,54],[16,46],[15,38],[18,30],[17,23]],hair[1]);
    poly(hp,[[20,15],[22,21],[20,27],[22,34],[20,40],[19,46],[17,42],[19,34],[17,28],[20,22]],hair[2]);
    if(!compact)line(hp,[[19,16],[21,21],[19,25]],hair[3]);
  }else{
    poly(hp,[[-22,-7],[-18,-3],[-18,10],[-20,14],[-22,11]],hair[0]);
    poly(hp,[[20,-5],[23,0],[21,15],[18,19],[18,6]],hair[1]);
  }
  const frontHairMask=new Uint8Array(w*h);
  for(let i=0;i<front.color.length;i++)if(front.color[i]&&!eyeRegionMask[i]){base.color[i]=front.color[i];frontHairMask[i]=1;}
  const lid=hex('#403447'),white=hex('#eee5d5'),mouth=skin[0];
  for(let side=0;side<2;side++){
    const x=side?10:-10,sign=side?1:-1;
    if(blink){line(ep,[[x-4,1],[x-1,2],[x+2,2],[x+5,0]],lid);}
    else{
      const center=pt(x,0),half=compact?2:Math.round(5*s),eyeHeight=compact?(expression==='surprised'?5:expression==='smile'?3:4):Math.round((expression==='surprised'?8:expression==='smile'?5:7)*s);
      const top=center[1]-Math.floor(eyeHeight/2),whiteLayer=frame(w,h),margin=compact?1:Math.max(1,Math.round(1.6*s));
      // Author each native eye as ordered integer rows. Tiny eyes do not inherit fractional polygon slivers.
      for(let row=0;row<eyeHeight;row++){
        const inset=row===0||row===eyeHeight-1?margin:row===1||row===eyeHeight-2?Math.max(0,margin-1):0;
        for(let col=-half+inset;col<=half-inset;col++)whiteLayer.color[(top+row)*w+center[0]+col]=white;
      }
      const ix=center[0]+Math.round(gaze*(compact?0:rich?2:1)),iy=top+Math.floor(eyeHeight*.55),rx=compact?0:Math.max(1,Math.round(2*s)),ry=Math.ceil(eyeHeight*.5);
      for(let yy=top;yy<top+eyeHeight;yy++)for(let xx=ix-rx;xx<=ix+rx;xx++){
        const i=yy*w+xx;if(!whiteLayer.color[i]||((xx-ix)/(rx+.65))**2+((yy-iy)/(ry+.5))**2>1.15)continue;
        whiteLayer.color[i]=yy<iy?iris[0]:iris[1];
        if(xx===ix&&yy<=iy)whiteLayer.color[i]=lid;
      }
      if(rich){const i=(iy-1)*w+ix-1;if(whiteLayer.color[i]&&whiteLayer.color[i]!==white)whiteLayer.color[i]=hex('#fff4de');}
      // One continuous upper lid, a short outer corner and no checkered lower edge.
      for(let col=-half;col<=half;col++){
        const curve=Math.round((Math.abs(col)/half)**2*(compact?1:2*s)),tilt=expression==='determined'?(Math.sign(col)===-sign?1:0):0;
        const yy=top+curve+tilt;for(let above=top;above<yy;above++)whiteLayer.color[above*w+center[0]+col]=0;whiteLayer.color[yy*w+center[0]+col]=lid;
      }
      for(let i=0;i<eye.color.length;i++)if(whiteLayer.color[i])eye.color[i]=whiteLayer.color[i];
    }
    const brow=expression==='surprised'?-10:expression==='determined'?-4:-7;
    if(expression==='determined')line(fp,[[x-sign*4,brow+1],[x+sign*3,brow-2]],hair[0]);
    else line(fp,[[x-4,brow+1],[x,brow],[x+4,brow+1]],hair[0]);
  }
  const eyeMask=new Uint8Array(w*h);
  for(let i=0;i<eye.color.length;i++)if(eye.color[i]&&faceMask[i]&&!frontHairMask[i]){base.color[i]=eye.color[i];eyeMask[i]=1;}
  // Brows belong to face shading, not the hair layer or eye mask.
  for(let i=0;i<face.color.length;i++)if(face.color[i]&&(face.color[i]===hair[0])&&!frontHairMask[i])base.color[i]=face.color[i];
  if(!compact){poly(p,[[2,6],[3,9],[2,11],[-1,11]],skin[1]);dot(p,-1,10,skin[3]);}
  else dot(p,1,9,skin[1]);
  if(expression==='surprised'){ell(p,0,17,2.2,2.8,mouth);if(!compact)line(p,[[-1,19],[1,19]],skin[3]);}
  else if(expression==='smile'){line(p,[[-4,15],[-2,17],[1,18],[4,15]],mouth);if(!compact)line(p,[[-2,16],[1,17],[3,15]],hex('#e5c7b4'));}
  else if(expression==='determined')line(p,[[-3,17],[2,17]],skin[0]);
  else {line(p,[[-2,17],[1,17],[3,16]],mouth);if(rich)line(p,[[-1,19],[2,18]],skin[3]);}
  const pixels=base.color.slice(),ink=style.outline===null?0:hex(style.outline??'#292738');
  if(ink)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!base.color[i]&&(base.color[i-1]||base.color[i+1]||base.color[i-w]||base.color[i+w]))pixels[i]=ink;}
  return{w,h,pixels,mask:{w,h,data:Uint8Array.from(pixels,c=>c?1:0)},faceMask,eyeRegionMask,eyeMask,frontHairMask,headAnchor:[cx,cy],eyeAnchors,resolution,detailTier:compact?'compact':rich?'rich':'standard',blink};
}
const portraitCache = new Map<string, HumanPortraitSprite>();
/** Owned output arrays, with a bounded cache of discrete eye/expression states. */
export function renderHumanPortrait2D(style:HumanPortraitStyle={},pose:HumanPortraitPose={}):HumanPortraitSprite {
  validate(style,pose);
  const t=((pose.time??0)%2+2)%2;
  const sample={expression:pose.expression??'neutral',gaze:Math.max(-1,Math.min(1,pose.gaze??0)),blink:pose.blink??(!pose.reducedMotion&&t>1.55&&t<1.68)};
  const key=JSON.stringify([Object.keys(style).sort().map(k=>[k,style[k as keyof HumanPortraitStyle]]),sample]);
  let a=portraitCache.get(key);
  if(!a){
    a=renderPortraitUncached(style,sample);
    if(portraitCache.size>=12)portraitCache.delete(portraitCache.keys().next().value!);
    portraitCache.set(key,a);
  } else {portraitCache.delete(key);portraitCache.set(key,a);}
  return {...a,pixels:a.pixels.slice(),mask:{...a.mask,data:a.mask.data.slice()},faceMask:a.faceMask.slice(),eyeRegionMask:a.eyeRegionMask.slice(),eyeMask:a.eyeMask.slice(),frontHairMask:a.frontHairMask.slice(),headAnchor:[...a.headAnchor],eyeAnchors:[[...a.eyeAnchors[0]],[...a.eyeAnchors[1]]]};
}
export function drawHumanPortrait2D(p:Painter,style:HumanPortraitStyle={},pose:HumanPortraitPose={}):HumanPortraitSprite {const a=renderHumanPortrait2D(style,pose);blitSprite2D(p,a);return a;}
