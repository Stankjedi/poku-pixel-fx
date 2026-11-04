/** Ground-hugging impact pressure fronts: lifted soil ridges, not camera-facing energy circles. */
import { type Vec3, clamp3, smooth3, TAU3 } from "./math.js";
import { type Color3D } from "./frame.js";
import { Painter3D } from "./painter.js";
export interface GroundShockwave3DOptions {
  age:number; center?:Vec3; radius?:number; speed?:number; width?:number; height?:number;
  life?:number; seed?:number; palette?:readonly Color3D[]; hotColor?:Color3D;
}
const DUST:readonly Color3D[]=["#3c353a","#79685d","#b49a7b","#ddc3a0","#fff1ca"];
/** Finite, monotonically expanding, decelerating front. Return zero before the event. */
export function groundShockwaveRadius3D(age:number,radius=4.6,speed=17):number {
  if(!Number.isFinite(age)||!Number.isFinite(radius)||!Number.isFinite(speed)||radius<=0||speed<=0) return 0;
  return radius*-Math.expm1(-speed*Math.max(0,age)/radius);
}
/** Real XYZ annular ridge, tapered to its floor on both sides, with an irregular seeded crest. */
export function drawGroundShockwave3D(p:Painter3D,o:GroundShockwave3DOptions) {
  const life=Number.isFinite(o.life)?Math.max(0.05,o.life!):1.05,age=o.age;
  if(!Number.isFinite(age)||age<=0||age>=life) return;
  const center=o.center??[0,0.035,0],radius=groundShockwaveRadius3D(age,o.radius??4.6,o.speed??17);
  if(radius<=0||!center.every(Number.isFinite)) return;
  const source=o.palette?.length?o.palette:DUST,palette=Array.from({length:5},(_,i)=>source[Math.round(i/4*(source.length-1))]);
  const width=Math.min(radius*0.65,Math.max(0.02,Number.isFinite(o.width)?o.width!:0.6)*(0.65+age*0.55));
  const height=Math.max(0,Number.isFinite(o.height)?o.height!:0.48)*smooth3(0,0.045,age)*(1-smooth3(0.18,life,age));
  const opacity=smooth3(0,0.025,age)*(1-smooth3(life*0.36,life,age));
  const phase=(Number.isFinite(o.seed)?o.seed!:1)*0.173,segments=112,heat=1-smooth3(0.09,0.46,age);
  const station=(i:number,level:number):Vec3=> {
    const a=i/segments*TAU3,bump=0.025*Math.sin(a*9+phase)+0.018*Math.cos(a*17-phase);
    const r=Math.max(0,radius*(1+bump)-width*(1-level));
    const crest=height*(0.76+0.24*Math.sin(a*11+phase))*(level===0.65?1:0);
    return [center[0]+Math.cos(a)*r,center[1]+crest,center[2]+Math.sin(a)*r];
  };
  // Sort translucent wedges by their actual world depth. Geometry is independent of camera.
  const order=Array.from({length:segments},(_,i)=>i).sort((a,b)=>p.project(station(a+0.5,0.65)).depth-p.project(station(b+0.5,0.65)).depth);
  for(const i of order) {
    const breakup=age>life*0.28?clamp3((Math.sin(i*0.73+phase)+1.2)*(1-(age/life-0.28)*1.5)):1;
    const alpha=opacity*breakup;
    if(alpha<=0.01) continue;
    const a=station(i,0),b=station(i+1,0),c=station(i,0.65),d=station(i+1,0.65),e=station(i,1),f=station(i+1,1);
    p.triangle(a,b,c,palette[1],alpha*0.8);p.triangle(b,d,c,palette[1],alpha*0.8);
    p.triangle(c,d,e,palette[i%5===0?3:2],alpha);p.triangle(d,f,e,palette[i%5===0?3:2],alpha);
    // A short pressure flash reads as a ground shock; the much longer body is non-emissive dust.
    if(heat>0) p.line(e,f,0.045+heat*0.025,heat>0.72?palette[4]:(o.hotColor??palette[4]),alpha*heat,0.24*heat);
    else if(i%5<3) p.line(c,d,0.018,palette[3],alpha*0.6);
    if(i%5===0&&age>0.08) {
      const puff:Vec3=[c[0],c[1]+0.045,c[2]];
      p.point(puff,0.08+age*0.18,palette[3],alpha*0.58);
    }
  }
}
