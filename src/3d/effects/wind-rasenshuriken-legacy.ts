/** Baseline wind shuriken: four simple planar blades on the original 3D painter API. */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D } from "../frame.js";
import type { Vec3 } from "../math.js";
import { TAU3, clamp3, smooth3, Rng3D } from "../math.js";
import { Painter3D } from "../painter.js";

export interface WindShurikenLegacyOptions { seed: number; radius: number; palette: Color3D[] }
export const meta: EffectMeta3D<WindShurikenLegacyOptions> = {
  id: "arcane/wind-rasenshuriken-legacy-3d",
  name: "Wind Rasenshuriken · Original Technique",
  description: "A four-wing wind blade on the pre-optimization 3D drawing contract, with simple spinning geometry and sparse sparks.",
  duration: 4.6, loop: false,
  options: { seed: 308, radius: 2.85, palette: ["#102449", "#17527b", "#247daa", "#55c9e8", "#b5f5ff", "#ffffff"] },
  stages: [{at:0,label:"CHARGE"},{at:0.75,label:"SPIN"},{at:2.4,label:"LAUNCH"},{at:3.05,label:"IMPACT"},{at:4.0,label:"FADE"}],
  cues: [{at:2.4,type:"sound",value:1},{at:3.05,type:"hit",value:1},{at:3.05,type:"shake",value:0.16}],
};
const CENTER = 2.35;
export function create(options: WindShurikenLegacyOptions) {
  const random = new Rng3D(options.seed);
  const sparks = Array.from({length:65},()=>({ a:random.range(0,TAU3), r:random.range(0.65,3.6), speed:random.range(0.3,2.1), z:random.range(-0.5,0.5), size:random.range(0.025,0.07) }));
  const C=options.palette, R=Math.max(0.4,options.radius);
  let t=0;
  return {
    update(dt:number){t+=dt;},
    draw(p:Painter3D){
      if(t>=meta.duration)return;
      const born=smooth3(0.08,0.7,t), fade=1-smooth3(3.6,4.6,t);
      const power=born*fade, travel=smooth3(2.37,3.0,t)*1.25;
      const center:Vec3=[travel,CENTER,0];
      const rot=t*9.6;
      // Original contract: per-blade triangles without curved geometry or ribbon subdivision.
      for(let arm=0;arm<4;arm++){
        const a=rot+arm*TAU3/4, ca=Math.cos(a), sa=Math.sin(a);
        const inner:Vec3=[center[0]+ca*0.32,CENTER+sa*0.32,0];
        const outer:Vec3=[center[0]+ca*R*born,CENTER+sa*R*born,0];
        const left:Vec3=[center[0]+ca*(R*0.58)-sa*0.56*born,CENTER+sa*(R*0.58)+ca*0.56*born,0];
        const right:Vec3=[center[0]+ca*(R*0.58)+sa*0.34*born,CENTER+sa*(R*0.58)-ca*0.34*born,0];
        p.triangle(inner,left,outer,C[2],power);
        p.triangle(inner,outer,right,C[3],power);
        p.line(inner,outer,0.055,C[4],power,0.05*power);
        p.point(outer,0.085,C[5],0.74*power,0.10*power);
      }
      for(const s of sparks){
        const a=s.a+t*s.speed, r=s.r*(0.8+0.18*Math.sin(t*3+s.a));
        const q:Vec3=[center[0]+Math.cos(a)*r,CENTER+Math.sin(a)*r,s.z];
        p.point(q,s.size,C[3],power*(0.35+0.25*Math.cos(t*8+s.a)),0.015*power);
      }
      p.glow(center,1.12*born,C[3],0.22*power);
      p.point(center,0.38*born,C[4],power,0.12*power);
      p.point([center[0],CENTER,0.15],0.16*born,C[5],power,0.15*power);
      if(t>=3.05){
        const shock=smooth3(3.05,3.55,t), f=(1-smooth3(3.4,3.95,t))*power;
        const rr=shock*5.2;
        for(let i=0;i<72;i++){
          const a=i*TAU3/72, b=(i+1)*TAU3/72;
          p.line([center[0]+Math.cos(a)*rr,CENTER+Math.sin(a)*rr,0],
                 [center[0]+Math.cos(b)*rr,CENTER+Math.sin(b)*rr,0],0.035,C[3],f,0.035*f);
        }
      }
    },
  };
}
