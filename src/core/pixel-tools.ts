import type { EditableSprite2D, SpriteClusterPatch2D } from './sprite-edit.js';
import { editSpriteCluster2D } from './sprite-edit.js';
import { transformPixelPoint2D, composePixelTransform2D, invertPixelTransform2D, IDENTITY_PIXEL_TRANSFORM, type PixelTransform2D } from './sprite-raster.js';

export type SemanticMasks2D = Record<string, Uint8Array>;
export interface IndexedSprite2D { w:number;h:number;x:number;y:number;indices:Uint16Array;alpha:Uint8Array;palette:number[] }
export interface PaletteCycle2D { indices:readonly number[]; fps:number; phase?:number; reverse?:boolean }
const opaque=(c:number)=>(c|0xff000000)>>>0;
function rasterSize(sprite:EditableSprite2D){
  if(!Number.isInteger(sprite.w)||!Number.isInteger(sprite.h)||sprite.w<1||sprite.h<1||sprite.w*sprite.h>16_777_216||sprite.pixels.length!==sprite.w*sprite.h||sprite.mask.data.length!==sprite.pixels.length||sprite.mask.w!==sprite.w||sprite.mask.h!==sprite.h)throw new RangeError('Pixel tools require matching native raster buffers');
}
function clone<T extends EditableSprite2D>(sprite:T):T{return {...sprite,pixels:sprite.pixels.slice(),mask:{...sprite.mask,data:sprite.mask.data.slice()}};}
function colorDistance(a:number,b:number){const r=(a&255)-(b&255),g=(a>>>8&255)-(b>>>8&255),v=(a>>>16&255)-(b>>>16&255);return r*r*2+g*g*3+v*v;}
/** Exact indexing by default. Nearest-color conversion is an explicit authoring operation. */
export function indexSprite2D(sprite:EditableSprite2D&{x?:number;y?:number},palette?:readonly number[],mode:'exact'|'nearest'='exact'):IndexedSprite2D{
  rasterSize(sprite);if(!['exact','nearest'].includes(mode)||palette&&!palette.every(c=>Number.isInteger(c)&&c>=-0x80000000&&c<=0xffffffff))throw new RangeError('Invalid palette or quantization mode');const colors=palette?Array.from(palette,opaque):[],map=new Map(colors.map((c,i)=>[c,i]));
  if(colors.length>256||new Set(colors).size!==colors.length)throw new RangeError('Palette must contain at most 256 unique RGB colors');
  const indices=new Uint16Array(sprite.pixels.length),alpha=new Uint8Array(indices.length);
  for(let i=0;i<indices.length;i++){
    const c=sprite.pixels[i],a=c>>>24;if(!a||!sprite.mask.data[i])continue;alpha[i]=a;
    const rgb=opaque(c);let index=map.get(rgb);
    if(index===undefined){
      if(!palette){if(colors.length>=256)throw new RangeError('Sprite exceeds 256 colors; choose an explicit palette');index=colors.length;colors.push(rgb);map.set(rgb,index);}
      else if(mode==='exact')throw new RangeError('Sprite contains an RGB color outside the supplied palette');
      else{if(!colors.length)throw new RangeError('Cannot quantize into an empty palette');let distance=Infinity;index=0;colors.forEach((q,j)=>{const d=colorDistance(c,q);if(d<distance){index=j;distance=d;}});}
    }
    indices[i]=index;
  }
  return{w:sprite.w,h:sprite.h,x:sprite.x??0,y:sprite.y??0,indices,alpha,palette:colors};
}
export function cyclePalette2D(palette:readonly number[],cycles:readonly PaletteCycle2D[],time:number):number[]{
  if(!Number.isFinite(time))throw new RangeError('Palette time must be finite');
  const out=Array.from(palette,opaque),used=new Set<number>();
  for(const cycle of cycles){
    if(!Number.isFinite(cycle.fps)||cycle.fps<0||!Number.isFinite(cycle.phase??0)||!cycle.indices.length)throw new RangeError('Invalid palette cycle');
    for(const i of cycle.indices){if(!Number.isInteger(i)||i<0||i>=out.length||used.has(i))throw new RangeError('Palette cycle indices must be valid and disjoint');used.add(i);}
    const n=cycle.indices.length,raw=Math.floor(time*cycle.fps+(cycle.phase??0))*(cycle.reverse?-1:1),step=((raw%n)+n)%n;
    cycle.indices.forEach((index,i)=>out[index]=opaque(palette[cycle.indices[(i-step+n)%n]]));
  }
  return out;
}
export function renderIndexedSprite2D(sprite:IndexedSprite2D,time=0,cycles:readonly PaletteCycle2D[]=[]):EditableSprite2D&{x:number;y:number}{
  const palette=cyclePalette2D(sprite.palette,cycles,time),pixels=new Uint32Array(sprite.w*sprite.h),data=new Uint8Array(pixels.length);
  if(sprite.indices.length!==pixels.length||sprite.alpha.length!==pixels.length)throw new RangeError('Indexed buffers do not match dimensions');
  for(let i=0;i<pixels.length;i++)if(sprite.alpha[i]){const c=palette[sprite.indices[i]];if(c===undefined)throw new RangeError('Indexed cell is outside the palette');pixels[i]=((c&0xffffff)|(sprite.alpha[i]<<24))>>>0;data[i]=1;}
  return{w:sprite.w,h:sprite.h,x:sprite.x,y:sprite.y,pixels,mask:{w:sprite.w,h:sprite.h,data}};
}

export interface PixelPatternContext2D {
  /** Optional inverse mapping when input cells are already in a composited raster. */
  rasterToObject?:PixelTransform2D;
  /** Direct composite mappings avoid cancelling a floating-point object transform at threshold boundaries. */
  rasterToWorld?:PixelTransform2D; rasterToScreen?:PixelTransform2D;
  objectToWorld?:PixelTransform2D; worldToScreen?:PixelTransform2D;
}
export interface DitherOptions2D { anchor:'object'|'world'|'screen'; pattern?:'bayer2'|'bayer4'|'dispersed8'|'cluster4'; scale?:number; phase?:readonly[number,number] }
const BAYER2=Object.freeze([0,2,3,1]);
const BAYER4=Object.freeze([0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]);
// Fixed dispersed threshold ordering. No per-frame reseeding and no claim of an optimized noise spectrum.
const DISPERSED8=Object.freeze([0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21]);
const CLUSTER4=Object.freeze([12,5,6,13,4,0,1,7,11,3,2,8,15,10,9,14]);
/** Fixed threshold matrices, shared by alpha coverage and palette-color dithering. */
export function ditherPattern2D(pattern:DitherOptions2D['pattern']='bayer4'):Readonly<{size:number;values:readonly number[]}>{
  if(pattern==='bayer2')return{size:2,values:BAYER2};
  if(pattern==='bayer4')return{size:4,values:BAYER4};
  if(pattern==='dispersed8')return{size:8,values:DISPERSED8};
  if(pattern==='cluster4')return{size:4,values:CLUSTER4};
  throw new RangeError('Unknown dither pattern');
}
function patternTransform(options:DitherOptions2D,context:PixelPatternContext2D):PixelTransform2D{
  if(!['object','world','screen'].includes(options.anchor)||options.pattern!==undefined&&!['bayer2','bayer4','dispersed8','cluster4'].includes(options.pattern)||options.phase!==undefined&&(options.phase.length!==2||!options.phase.every(Number.isFinite))||!Number.isFinite(options.scale??1)||(options.scale??1)<=0)throw new RangeError('Invalid pattern coordinates');
  let matrix=context.rasterToObject??IDENTITY_PIXEL_TRANSFORM;
  if(options.anchor!=='object')matrix=context.rasterToWorld??composePixelTransform2D(context.objectToWorld??IDENTITY_PIXEL_TRANSFORM,matrix);
  if(options.anchor==='screen')matrix=context.rasterToScreen??composePixelTransform2D(context.worldToScreen??IDENTITY_PIXEL_TRANSFORM,matrix);
  if(matrix.length!==6||!matrix.every(Number.isFinite))throw new RangeError('Pattern transform must be finite');
  return matrix;
}
/** Pattern space is chosen before quantization. Object textures move with their surface. */
export function pixelPatternCoordinate2D(x:number,y:number,options:DitherOptions2D,context:PixelPatternContext2D={}):[number,number]{
  if(!Number.isFinite(x)||!Number.isFinite(y))throw new RangeError('Pattern position must be finite');
  const q=transformPixelPoint2D(patternTransform(options,context),[x,y]);
  const scale=options.scale??1;
  return[Math.floor(q[0]/scale+(options.phase?.[0]??0)),Math.floor(q[1]/scale+(options.phase?.[1]??0))];
}
export function ditherThreshold2D(x:number,y:number,options:DitherOptions2D,context:PixelPatternContext2D={}):number{
  const [a,b]=pixelPatternCoordinate2D(x,y,options,context),{size:n,values}=ditherPattern2D(options.pattern),xx=((a%n)+n)%n,yy=((b%n)+n)%n;
  return(values[yy*n+xx]+.5)/(n*n);
}
/** Validate and compose pattern coordinates once per raster, not once per cell. */
export function createDitherSampler2D(options:DitherOptions2D,context:PixelPatternContext2D={}):(x:number,y:number)=>number{
  const m=patternTransform(options,context),scale=options.scale??1,px=options.phase?.[0]??0,py=options.phase?.[1]??0,{size:n,values}=ditherPattern2D(options.pattern);
  return(x,y)=>{const a=Math.floor((m[0]*x+m[2]*y+m[4])/scale+px),b=Math.floor((m[1]*x+m[3]*y+m[5])/scale+py);return(values[((b%n)+n)%n*n+((a%n)+n)%n]+.5)/(n*n);};
}
/** Explicit alpha-to-pattern conversion. Coverage alpha is retained unless this operation is requested. */
export function ditherSprite2D<T extends EditableSprite2D&{x?:number;y?:number}>(source:T,options:DitherOptions2D,context:PixelPatternContext2D={}):T{
  const out=clone(source);ditherSprite2DInto(source,out,options,context);return out;
}
/** Explicit mutable destination for renderer scratch buffers. Source/destination may alias: every output cell reads only the same source cell. */
export function ditherSprite2DInto(source:EditableSprite2D&{x?:number;y?:number},out:EditableSprite2D,options:DitherOptions2D,context:PixelPatternContext2D={}):void{
  rasterSize(source);rasterSize(out);if(source.w!==out.w||source.h!==out.h)throw new RangeError('Dither destination must match source dimensions');
  const thresholdAt=createDitherSampler2D(options,context);
  for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){
    const i=y*source.w+x,c=source.pixels[i],a=(c>>>24)/255;
    const threshold=thresholdAt((source.x??0)+x+.5,(source.y??0)+y+.5);
    const keep=!!source.mask.data[i]&&a>threshold;
    out.pixels[i]=keep?opaque(c):0;out.mask.data[i]=keep?1:0;
  }
}

export interface SelectiveOutlineOptions2D {
  shadow:number; light?:number; side?:number; lightDirection?:readonly[number,number];
  /** Omit strongly light-facing edges. Existing opaque cells are never overwritten. */
  omitLit?:boolean; selection?:ArrayLike<number>; protected?:ArrayLike<number>;
}
/** One-cell selective contour inside the supplied canvas. Add transparent padding before authoring if needed. */
export function selectiveOutline2D<T extends EditableSprite2D>(source:T,options:SelectiveOutlineOptions2D):T{
  rasterSize(source);if(options.selection&&options.selection.length!==source.w*source.h||options.protected&&options.protected.length!==source.w*source.h||options.lightDirection&&!options.lightDirection.every(Number.isFinite))throw new RangeError('Outline selections and direction must match the native canvas');const out=clone(source),[lx,ly]=options.lightDirection??[-1,-1],length=Math.hypot(lx,ly)||1;
  const at=(x:number,y:number)=>x>=0&&y>=0&&x<source.w&&y<source.h&&source.mask.data[y*source.w+x]!==0;
  for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){
    const i=y*source.w+x;if(at(x,y)||options.protected?.[i]||options.selection&&!options.selection[i])continue;
    let nx=0,ny=0,n=0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(at(x-dx,y-dy)){nx+=dx;ny+=dy;n++;}
    if(!n)continue;const facing=(nx*lx+ny*ly)/(Math.hypot(nx,ny)*length||1);
    if(options.omitLit&&facing>.35)continue;
    const color=facing>.35?(options.light??options.shadow):facing<-.35?options.shadow:(options.side??options.shadow);
    out.pixels[i]=color>>>0;out.mask.data[i]=color>>>24?1:0;
  }
  return out;
}

export interface AuthoredPixelKey2D { at:number;patches:readonly SpriteClusterPatch2D[] }
export interface AuthoredPixelTrack2D { duration:number;loop?:boolean;keys:readonly AuthoredPixelKey2D[];allowedColors?:readonly number[];purpose:'aa'|'subpixel'|'optical-correction'|'cel-edit' }
/** Discrete hand-authored pixel substitutions. No interpolation, blur, or unapproved intermediate colors. */
export function compileAuthoredPixelTrack2D(track:AuthoredPixelTrack2D):(source:EditableSprite2D,time:number)=>EditableSprite2D{
  if(!Number.isFinite(track.duration)||track.duration<=0||!track.keys.length)throw new RangeError('Pixel track needs a positive duration and keys');
  const duration=track.duration,loop=track.loop??false;
  const keys=JSON.parse(JSON.stringify(track.keys)) as AuthoredPixelKey2D[],allowed=track.allowedColors?new Set(track.allowedColors.map(c=>c>>>0)):null;
  keys.forEach((key,i)=>{
    if(!Number.isFinite(key.at)||key.at<0||key.at>track.duration||i&&key.at<=keys[i-1].at)throw new RangeError('Pixel keys must be strictly ordered within duration');
    if(allowed)for(const patch of key.patches)for(const color of Object.values(patch.palette))if(color!==null&&!allowed.has(color>>>0))throw new RangeError('Authored pixel color is outside the allowed set');
  });
  return(source,time)=>{
    if(!Number.isFinite(time))throw new RangeError('Pixel track time must be finite');
    const t=loop?((time%duration)+duration)%duration:Math.max(0,Math.min(duration,time));
    let key:AuthoredPixelKey2D|undefined;for(const candidate of keys){if(candidate.at>t)break;key=candidate;}
    let out:EditableSprite2D=clone(source);for(const patch of key?.patches??[])out=editSpriteCluster2D(out,patch);return out;
  };
}

export interface PixelIssue2D { kind:'solid-gap'|'enclosed-hole'|'isolated-cell'|'palette-escape'|'jaggy-candidate'|'banding-candidate'; x:number;y:number;area:number;confidence:'contract'|'heuristic';message:string }
export interface PixelDiagnosticOptions2D { masks?:Partial<Record<'solidSubject'|'negativeSpace'|'sparkAccent'|'featureMask',ArrayLike<number>>>;palette?:readonly number[];maxHoleArea?:number }
export interface PixelDiagnostic2D { issues:PixelIssue2D[];heatmap:Uint8Array;occupied:number;paletteSize:number }
/** Diagnostics describe locations. Heuristics never erase cells or certify artistic quality. */
export function diagnosePixelSprite2D(source:EditableSprite2D,options:PixelDiagnosticOptions2D={}):PixelDiagnostic2D{
  rasterSize(source);const{w,h}=source,n=w*h,issues:PixelIssue2D[]=[],heatmap=new Uint8Array(n),m=options.masks??{},colors=new Set<number>();
  for(const mask of Object.values(m))if(mask&&mask.length!==n)throw new RangeError('Diagnostic semantic masks must match native dimensions');
  const palette=options.palette?new Set(options.palette.map(opaque)):null,occupied=new Uint8Array(n);
  const add=(kind:PixelIssue2D['kind'],x:number,y:number,area:number,confidence:PixelIssue2D['confidence'],message:string)=>{issues.push({kind,x,y,area,confidence,message});heatmap[y*w+x]=confidence==='contract'?255:128;};
  for(let i=0;i<n;i++){occupied[i]=source.mask.data[i]&&(source.pixels[i]>>>24)?1:0;if(occupied[i])colors.add(opaque(source.pixels[i]));}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,protectedCell=m.featureMask?.[i]||m.negativeSpace?.[i];
    if(m.solidSubject?.[i]&&!occupied[i]&&!protectedCell)add('solid-gap',x,y,1,'contract','Expected solid subject cell is transparent');
    if(!occupied[i])continue;
    if(palette&&!palette.has(opaque(source.pixels[i])))add('palette-escape',x,y,1,'contract','Surface color is outside the selected palette');
    const neighbors=(x>0?occupied[i-1]:0)+(x+1<w?occupied[i+1]:0)+(y>0?occupied[i-w]:0)+(y+1<h?occupied[i+w]:0);
    if(!neighbors&&!protectedCell&&!m.sparkAccent?.[i])add('isolated-cell',x,y,1,'heuristic','Isolated cell; inspect whether it is an intentional accent');
  }
  // Exterior flood fill; only enclosed transparent components become hole candidates.
  const seen=new Uint8Array(n),queue:number[]=[];
  for(let i=0;i<n;i++)if(!occupied[i]&&!seen[i]){
    queue.length=0;queue.push(i);seen[i]=1;let open=false,protectedRegion=false;
    for(let q=0;q<queue.length;q++){const j=queue[q],x=j%w,y=Math.floor(j/w);if(!x||!y||x===w-1||y===h-1)open=true;if(m.negativeSpace?.[j]||m.featureMask?.[j])protectedRegion=true;
      for(const k of[x>0?j-1:-1,x+1<w?j+1:-1,y>0?j-w:-1,y+1<h?j+w:-1])if(k>=0&&!occupied[k]&&!seen[k]){seen[k]=1;queue.push(k);}}
    if(!open&&!protectedRegion&&queue.length<=(options.maxHoleArea??8)){const j=queue[0];add('enclosed-hole',j%w,Math.floor(j/w),queue.length,'heuristic','Small enclosed negative space; inspect before repairing');}
  }
  // Outline run imbalance and repeated adjacent color steps are explainable candidates, not hard errors.
  const left:number[]=Array(h).fill(-1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(occupied[y*w+x]){left[y]=x;break;}
  for(let y=2;y<h-1;y++){
    if(left[y-2]<0||left[y-1]<0||left[y]<0||left[y+1]<0)continue;
    const a=left[y-1]-left[y-2],b=left[y]-left[y-1],c=left[y+1]-left[y];
    if(Math.abs(b)>=3&&Math.abs(a)<=1&&Math.abs(c)<=1&&!m.featureMask?.[y*w+left[y]])add('jaggy-candidate',left[y],y,1,'heuristic','Abrupt stair-step length in the left silhouette');
  }
  for(let y=0;y<h-2;y++)for(let x=0;x<w-3;x++){
    const i=y*w+x;if(m.featureMask?.[i]||!occupied[i]||!occupied[i+1]||source.pixels[i]===source.pixels[i+1])continue;
    if(source.pixels[i]===source.pixels[i+w+1]&&source.pixels[i]===source.pixels[i+2*w+2]&&source.pixels[i+1]===source.pixels[i+w+2]&&source.pixels[i+1]===source.pixels[i+2*w+3])add('banding-candidate',x,y,3,'heuristic','Parallel adjacent staircase colors; inspect deliberate material banding');
  }
  return{issues,heatmap,occupied:occupied.reduce((a,b)=>a+b,0),paletteSize:colors.size};
}

export interface PixelMotionFrame2D { sprite:EditableSprite2D&{x?:number;y?:number};transform?:PixelTransform2D;time:number }
/** Align in object space before comparison. Changed pixels are not automatically defects in moving art. */
export function diagnosePixelMotion2D(frames:readonly PixelMotionFrame2D[],options:{expectedStill?:boolean;protectedMask?:ArrayLike<number>}={}):{pairs:{from:number;to:number;changed:number;silhouetteChanged:number;unexpected:boolean}[];heatmap:Uint32Array;width:number;height:number;x:number;y:number}{
  if(!frames.length||frames.length>4096)throw new RangeError('Motion diagnosis needs 1..4096 frames');
  const points:[number,number][]=[];
  for(const f of frames){rasterSize(f.sprite);if(!Number.isFinite(f.time))throw new RangeError('Motion times must be finite');const s=f.sprite,x=s.x??0,y=s.y??0;for(const q of [[x,y],[x+s.w,y],[x,y+s.h],[x+s.w,y+s.h]] as [number,number][])points.push(transformPixelPoint2D(f.transform??IDENTITY_PIXEL_TRANSFORM,q));}
  const x0=Math.floor(Math.min(...points.map(p=>p[0]))),y0=Math.floor(Math.min(...points.map(p=>p[1]))),w=Math.ceil(Math.max(...points.map(p=>p[0])))-x0,h=Math.ceil(Math.max(...points.map(p=>p[1])))-y0;
  if(!Number.isSafeInteger(w*h)||w*h<1||w*h>16_777_216||options.protectedMask&&options.protectedMask.length!==w*h)throw new RangeError('Motion diagnostic canvas exceeds its budget or selection size');
  const heatmap=new Uint32Array(w*h),pairs=[];
  const inverses=new Map(frames.map(f=>[f,invertPixelTransform2D(f.transform??IDENTITY_PIXEL_TRANSFORM)]));
  const at=(f:PixelMotionFrame2D,world:[number,number])=>{const q=transformPixelPoint2D(inverses.get(f)!,world),x=Math.floor(q[0]-(f.sprite.x??0)),y=Math.floor(q[1]-(f.sprite.y??0));return x<0||y<0||x>=f.sprite.w||y>=f.sprite.h?0:f.sprite.pixels[y*f.sprite.w+x];};
  for(let k=1;k<frames.length;k++){
    let changed=0,silhouetteChanged=0;const a=frames[k-1],b=frames[k];
    // Caller supplies motion-alignment transforms (e.g. inverse root motion), rather than an unqualified pixel diff.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(options.protectedMask?.[i])continue;const q:[number,number]=[x0+x+.5,y0+y+.5],ca=at(a,q),cb=at(b,q);
      if(ca!==cb){changed++;heatmap[i]++;}if(!!(ca>>>24)!==!!(cb>>>24))silhouetteChanged++;
    }
    pairs.push({from:a.time,to:b.time,changed,silhouetteChanged,unexpected:!!options.expectedStill&&changed>0});
  }
  return{pairs,heatmap,width:w,height:h,x:x0,y:y0};
}

export interface OpticalCorrection2D { minHeight:number;maxHeight:number;patches:readonly SpriteClusterPatch2D[] }
/** Choose exactly one authored native-size correction. No resized pixels or universal detail hallucination. */
export function applyOpticalCorrection2D<T extends EditableSprite2D>(source:T,height:number,tiers:readonly OpticalCorrection2D[]):T{
  if(!Number.isFinite(height)||height<=0)throw new RangeError('Native optical height must be positive');
  const ordered=[...tiers].sort((a,b)=>a.minHeight-b.minHeight);ordered.forEach((t,i)=>{if(!Number.isFinite(t.minHeight)||!Number.isFinite(t.maxHeight)||t.minHeight>t.maxHeight||i>0&&t.minHeight<=ordered[i-1].maxHeight)throw new RangeError('Optical correction tiers must be disjoint finite ranges');});
  const tier=tiers.find(t=>height>=t.minHeight&&height<=t.maxHeight);let out:T=clone(source);for(const patch of tier?.patches??[])out=editSpriteCluster2D(out,patch);return out;
}

/** Replace role colors while preserving indices, coverage and native geometry. */
export function swapIndexedPalette2D(source:IndexedSprite2D,palette:readonly number[]):IndexedSprite2D{
  if(palette.length!==source.palette.length||!palette.every(c=>Number.isInteger(c)&&c>=-0x80000000&&c<=0xffffffff))throw new RangeError('Palette swap must preserve the indexed slot count');
  return{...source,indices:source.indices.slice(),alpha:source.alpha.slice(),palette:Array.from(palette,opaque)};
}
