/** Time-evolving authored flames: growth, transported crests, forked tips and consumption.
 * This is a seekable visual model, not a fluid/combustion solver or aesthetic certification. */
import {hex} from './color.js';
import {clamp, smooth, rng, noise2} from './math.js';
import type {Painter, Point} from './painter.js';
export type ThermalRibbonSource2D = readonly (readonly [number,number])[] | ((time:number,id:number,u:number)=>readonly (readonly [number,number])[]);
export interface ThermalRibbonOptions2D {
 seed?:number; start?:number; duration:number; count:number;
 /** Hot to cool, no unrequested white is introduced. */
 palette:readonly (string|number)[];
 source:ThermalRibbonSource2D;
 life?:readonly [number,number]; width?:readonly [number,number]; length?:readonly [number,number];
 /** Native pixel curl. */
 curl?:number; split?:number; emission?:number; opacity?:number;
 /** Fraction of life following a moving source; zero snapshots the birth pose. Default .6. */
 attachment?:number;
 /** Native px/s² after detachment, in the same frame as velocity. Default [0,0]. */
 buoyancy?:readonly [number,number];
 /** Optional advective velocity after detachment, sampled at detachment. */
 velocity?:readonly [number,number] | ((time:number,id:number,u:number)=>readonly [number,number]);
}
export interface ThermalRibbonSample2D {
 id:number; born:number; age:number; progress:number; sourceU:number;
 head:number; tail:number; width:number; split:number; alpha:number;
 paths:readonly Point[][];
}
interface Birth {id:number;u:number;born:number;life:number;width:number;length:number;phase:number;curl:number;fork:number;}
const TAU=Math.PI*2;
function validPoint(p:readonly number[]){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new RangeError('Thermal source needs finite 2D points');}
function checkedPath(path:readonly (readonly [number,number])[]):Point[]{if(!Array.isArray(path)||path.length<2||path.length>512)throw new RangeError('Thermal path needs 2..512 points');return path.map(p=>{validPoint(p);return[p[0],p[1]];});}
function curveSampler(path:readonly Point[]){
 const distances=[0];for(let i=1;i<path.length;i++)distances.push(distances[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
 const total=distances[distances.length-1];
 return(u:number):Point=>{if(total<1e-7)return [...path[0]];const target=u*total;
 let j=1;while(j<path.length-1&&target>distances[j])j++;
 const a=path[j-1],b=path[j],f=(target-distances[j-1])/Math.max(1e-7,distances[j]-distances[j-1]);return[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];};
}
export function createThermalRibbon2D(o:ThermalRibbonOptions2D){
 const {seed=1,start=0,duration,count,source,life=[.35,.7],width=[3,8],length=[.7,1.2],curl=5,split=.8,emission=.12,opacity=1,velocity=[0,-8],attachment=.6,buoyancy=[0,0]}=o;
 if(!Number.isInteger(count)||count<0||count>4096||![seed,start,duration,curl,split,emission,opacity,attachment].every(Number.isFinite)||duration<0||!Number.isFinite(start+duration)||curl<0||split<0||split>1||emission<0||opacity<0||opacity>1||attachment<0||attachment>1)throw new RangeError('Invalid thermal flame timing/count');
 for(const range of [life,width,length])if(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<=0||range[1]<range[0])throw new RangeError('Thermal flame ranges must be finite, positive and ordered');
 if(!Array.isArray(o.palette)||!o.palette.length||o.palette.length>32||o.palette.some(c=>typeof c==='number'?!Number.isInteger(c)||c< -0x80000000||c>0xffffffff:!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))throw new RangeError('Thermal palette requires packed colors or #rgb/#rrggbb');
 validPoint(buoyancy);const acceleration:Point=[buoyancy[0],buoyancy[1]];
 const colors=o.palette.map(hex),births:Birth[]=[];
 const constantPath=typeof source==='function'?null:checkedPath(source);
 let constantVelocity:Point|null=null;if(typeof velocity!=='function'){validPoint(velocity);constantVelocity=[velocity[0],velocity[1]];}
 const offset=rng(seed,841).next();
 for(let id=0;id<count;id++){const r=rng(seed,id,668);births.push(Object.freeze({id,u:(offset+id*.61803398875)%1,born:start+(id+.15+r.next()*.7)/Math.max(1,count)*duration,
 life:r.range(...life),width:r.range(...width),length:r.range(...length),phase:r.range(0,TAU),curl:curl*r.range(.7,1.3)*(r.next()<.5?-1:1),fork:r.range(.52,.76)}));}
 function readPath(t:number,b:Birth){return constantPath??checkedPath((source as Exclude<ThermalRibbonSource2D,readonly (readonly [number,number])[]>)(t,b.id,b.u));}
 function readVelocity(t:number,b:Birth):Point{const v=constantVelocity??(velocity as (time:number,id:number,u:number)=>readonly [number,number])(t,b.id,b.u);validPoint(v);return[v[0],v[1]];}
 for(const b of births)if(!Number.isFinite(b.born+b.life))throw new RangeError('Thermal flame time overflow');
 const end=births.reduce((m,b)=>Math.max(m,b.born+b.life),start);
 function sample(time:number):ThermalRibbonSample2D[]{
 if(!Number.isFinite(time))throw new RangeError('Thermal sample time must be finite');
 if(time<start||time>=end)return [];
 const out:ThermalRibbonSample2D[]=[];
 for(const b of births){if(time<b.born)break;if(time>=b.born+b.life)continue;const age=time-b.born,q=age/b.life;if(q>=1)continue;
 // The source follows the actor only during growth. Later material travels from its release pose.
 const detach=b.born+b.life*attachment,path=readPath(Math.min(time,detach),b),atPoint=curveSampler(path),v=readVelocity(detach,b),drift=Math.max(0,time-detach);
 const head=b.length*(.12+.94*smooth(0,.58,q)+.30*smooth(.58,1,q));
 const tail=b.length*.92*smooth(.38,1,q);
 const swelling=(.25+.75*Math.sin(Math.PI*Math.min(.96,q/.94))**.7)*(1-.45*smooth(.64,1,q));
 const fork=split*smooth(.34,.72,q)*(1-smooth(.86,1,q));
 const paths:Point[][]=[];
 for(let branch=0;branch<3;branch++){
  if(branch>0&&fork<.02)continue;
  const isFork=branch>0,from=isFork?Math.max(tail,head*b.fork):tail,to=head*(isFork?(branch===1?1.05:.91):1),pts:Point[]=[];
  for(let j=0;j<19;j++){const u=j/18,s=from+(to-from)*u,pt=atPoint(s),a=atPoint(s-.005),z=atPoint(s+.005),dx=z[0]-a[0],dy=z[1]-a[1],n=Math.hypot(dx,dy)||1;
   const cross=b.curl*(.30+q*.7)*Math.sin((s*7.2-q*4)+b.phase)*Math.sin(Math.PI*clamp(s/Math.max(.1,head)))*(.3+.7*s);
   const forkOffset=isFork?(branch===1?-1:1)*b.width*fork*1.9*u*u:0;
   pts.push([pt[0]-dy/n*(cross+forkOffset)+v[0]*drift+.5*acceleration[0]*drift*drift,pt[1]+dx/n*(cross+forkOffset)+v[1]*drift+.5*acceleration[1]*drift*drift]);
  }if(pts.some(p=>!p.every(Number.isFinite)))throw new RangeError('Thermal flame motion overflow');paths.push(pts);
 }
 out.push({id:b.id,born:b.born,age,progress:q,sourceU:b.u,head,tail,width:b.width*swelling,split:fork,alpha:opacity*smooth(0,.065,q)*(1-smooth(.72,1,q)),paths});
 }return out;
 }
 return Object.freeze({end,births:Object.freeze(births),sample,draw(p:Pick<Painter,'path'|'glowPath'>,time:number){
 for(const f of sample(time)){
  const b=births[f.id],q=f.progress,heat=Math.min(colors.length-1,Math.floor(q*(colors.length-1)*.62));
  for(let k=f.paths.length-1;k>=0;k--){const pts=f.paths[k],branch=k>0;
   const radii=pts.map((_,j)=>{const u=j/(pts.length-1),front=.25+.55*q;
    const crest=Math.exp(-(((u-front)/.23)**2)),flank=.72+.18*Math.sin(u*13-q*8+b.phase)+.1*Math.sin(u*27-q*11+b.phase);
    const envelope=Math.sin(Math.PI*u)**.58*(.58+.58*crest)*flank;
    return f.width*envelope*(branch?.42*f.split:1)*(1-.50*f.split*smooth(.63,.95,u));});
   // One opaque thermal field follows the changing support. No broad nested polygon bands.
   const maxRadius=Math.max(...radii);if(maxRadius<.15)continue;
   p.path(pts,(u:number,v:number)=>{
    const index=u*(radii.length-1),j=Math.min(radii.length-2,Math.floor(index)),r=(radii[j]+(radii[j+1]-radii[j])*(index-j))/maxRadius;
    if(v>r||r<.001)return 0;
    const inside=1-v/r,crest=Math.exp(-(((u-(.20+.65*q))/.22)**2));
    const n=noise2(u*12-q*4,v*4.5+b.phase,b.id+seed),m=noise2(u*27-q*9,v*7-b.phase,b.id+seed+61);
    const temperature=clamp(.21+.32*inside+.34*n+.12*m+.19*crest-.13*smooth(.65,1,q));
    const thermal=temperature>.90?0:temperature>.74?1:temperature>.50?2:temperature>.26?3:4;
    return colors[Math.min(colors.length-1,thermal)];
   },f.alpha,maxRadius*2);
   if(emission>0&&!branch)p.glowPath(pts,Math.max(3,f.width*1.7),colors[Math.min(colors.length-1,1)],emission*f.alpha);

  }
 }
 }});
}
