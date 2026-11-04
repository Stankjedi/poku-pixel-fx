/** A droplet strikes a water surface: sheet crown, break-up, rebound and overlapping ripples. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D } from "../frame.js";
import { type Vec3, clamp3, Rng3D, smooth3, TAU3 } from "../math.js";
import { Painter3D } from "../painter.js";
import { WATER_RAMP_3D, LiquidDrops3D, drawLiquidDrop3D, drawLiquidCrown3D, sampleLiquidCrown3D, drawSurfaceRipple3D } from "../liquid.js";

export interface CrownSplash3DOptions { seed: number; size: number; force: number; palette: Color3D[] }
export const CROWN_SPLASH_IMPACT = 0.5;
export const meta: EffectMeta3D<CrownSplash3DOptions> = {
  id: "water/crown-splash-3d", name: "Crown Splash 3D",
  description: "A falling water drop opens a thin lobed crown, sheds rounded droplets, rebounds from the center and settles into overlapping surface ripples. Art-directed water, not a fluid solver.",
  duration: 3.8, loop: false,
  stages: [{at:0,label:"FALL"},{at:0.5,label:"IMPACT"},{at:0.66,label:"CROWN"},{at:0.84,label:"BREAKUP"},{at:1.1,label:"REBOUND"},{at:1.8,label:"RIPPLES"},{at:2.9,label:"SETTLE"}],
  cues: [{at:CROWN_SPLASH_IMPACT,type:"hit",value:0.6},{at:CROWN_SPLASH_IMPACT,type:"sound",value:0.7}],
  options: {seed:24017,size:1,force:1,palette:[...WATER_RAMP_3D]},
};
export function create(options:CrownSplash3DOptions) {
  const size=clamp3(Number.isFinite(options.size)?options.size:1,0.4,1.5),force=clamp3(Number.isFinite(options.force)?options.force:1,0.3,1.45);
  const palette=options.palette.length?options.palette:meta.options.palette,rng=new Rng3D(options.seed);
  const drops=new LiquidDrops3D(0.04,64), ripples:{origin:Vec3;born:number;strength:number;life:number;speed:number;seed:number}[]=[];
  const lobes=9,detach=0.33;
  const crown=(age:number)=>({center:[0,0.04,0] as Vec3,radius:size*(0.65+1.7*smooth3(0,0.75,age)),baseRadius:size*(0.52+1.15*smooth3(0,0.85,age)),height:size*force*1.62*smooth3(0,0.2,age)*(1-smooth3(0.3,1,age)),lobes,seed:options.seed,palette,breakup:smooth3(0.4,0.86,age)});
  let t=0,impacted=false,detached=false,rebounded=false,secondaryWave=false;
  function detachDrops() {
    const edge=sampleLiquidCrown3D({...crown(detach),segments:72});
    const peaks=edge.map((v,i)=>({v,i})).filter(({v,i})=>v[1]>=edge[(i+71)%72][1]&&v[1]>=edge[(i+1)%72][1]);
    for(const {v,i} of peaks) {
      const a=i/72*TAU3,speed=rng.range(0.8,2.2)*size;
      drops.spawn({position:v,velocity:[Math.cos(a)*speed,rng.range(1.3,3.8)*force,Math.sin(a)*speed],radius:rng.range(0.075,0.125)*size,gravity:10.8,drag:0.24});
      if(rng.chance(0.7)) drops.spawn({position:v,velocity:[Math.cos(a+0.08)*speed*1.13,rng.range(1.2,2.1)*force,Math.sin(a+0.08)*speed*1.13],radius:rng.range(0.035,0.06)*size,gravity:10.8,drag:0.36});
    }
  }
  return {
    update(dt:number) {
      t+=dt; drops.update(dt);
      for(const hit of drops.drainImpacts()) ripples.push({origin:hit.position,born:t-dt+hit.at,strength:clamp3(hit.radius*4,0.15,0.7),life:0.5+hit.radius*2,speed:1.1,seed:rng.int(0,100000)});
      if(!impacted&&t+1e-9>=CROWN_SPLASH_IMPACT) {
        impacted=true;
        ripples.push({origin:[0,0.04,0],born:CROWN_SPLASH_IMPACT,strength:1.1,life:2.9,speed:1.8*size,seed:options.seed});
      }
      if(!detached&&t+1e-9>=CROWN_SPLASH_IMPACT+detach) {detached=true;detachDrops();}
      if(!secondaryWave&&t+1e-9>=1.03) {
        secondaryWave=true;
        ripples.push({origin:[0,0.042,0],born:1.03,strength:0.65,life:2.35,speed:1.45*size,seed:options.seed+1});
      }
      if(!rebounded&&t+1e-9>=1.22) {
        rebounded=true;
        drops.spawn({position:[0,1.2*size,0],velocity:[0.13,3.2*force,0.08],radius:0.17*size,gravity:10.8,drag:0.08});
      }
      for(let i=ripples.length-1;i>=0;i--) if(t-ripples[i].born>=ripples[i].life) ripples.splice(i,1);
    },
    draw(p:Painter3D) {
      if(t<=0||t>=meta.duration-1e-8) return;
      const fade=1-smooth3(2.85,3.7,t),age=t-CROWN_SPLASH_IMPACT;
      // Low non-emissive surface patch provides a wet base without turning into an energy disc.
      if(age>=0) {
        const radius=size*(0.6+2.35*smooth3(0,1.35,age)),alpha=0.34*fade*(1-smooth3(1.5,3.0,age));
        const segments=72;
        for(let i=0;i<segments;i++) {
          const a=i/segments*TAU3,b=(i+1)/segments*TAU3;
          p.triangle([0,0.018,0],[Math.cos(a)*radius,0.018,Math.sin(a)*radius],[Math.cos(b)*radius,0.018,Math.sin(b)*radius],palette[0],alpha);
        }
      }
      for(const ripple of ripples) drawSurfaceRipple3D(p,{origin:ripple.origin,age:t-ripple.born,strength:ripple.strength,speed:ripple.speed,life:ripple.life,palette,seed:ripple.seed,opacity:fade});
      if(t<CROWN_SPLASH_IMPACT) {
        const u=t/CROWN_SPLASH_IMPACT,y=size*(4.5*(1-u*u)+0.17);
        drawLiquidDrop3D(p,[0,y,0],[0,-4-9*u,0],0.23*size,palette,smooth3(0,0.09,t));
      }
      if(age>0&&age<1) drawLiquidCrown3D(p,{...crown(age),opacity:0.84*fade*(1-smooth3(0.66,1,age))});
      // Rebound jet narrows as its leading drop detaches. Smooth, rounded water, no crystal spikes.
      const jetAge=t-0.98,jet=smooth3(0,0.2,jetAge)*(1-smooth3(0.25,0.58,jetAge));
      if(jet>0) {
        const levels=8,sides=12,height=1.28*size*jet;
        const point=(i:number,j:number):Vec3=>{
          const u=i/levels,a=j/sides*TAU3,r=size*(0.25*(1-u)**2+0.045)*jet;
          return [Math.cos(a)*r+0.04*u*u,height*u+0.04,Math.sin(a)*r];
        };
        for(let i=0;i<levels;i++) for(let j=0;j<sides;j++) {
          const a=point(i,j),b=point(i,j+1),c=point(i+1,j),d=point(i+1,j+1);
          const shade=0.3+Math.max(0,Math.cos((j+0.5)/sides*TAU3-2.2))*0.5;
          const color=palette[Math.round(shade*(palette.length-1))];
          p.triangle(a,b,c,color,fade);p.triangle(b,d,c,color,fade);
        }
        drawLiquidDrop3D(p,[0.04,height+0.04,0],[0,1,0],0.05*size*jet,palette,fade);
      }
      drops.draw(p,palette,fade);
    },
  };
}
