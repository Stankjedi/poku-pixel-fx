/** Four 3D helical wind blades, discrete palette lightning, deterministic particulate flow. */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D } from "../frame.js";
import type { Vec3 } from "../math.js";
import { TAU3, clamp3, smooth3, outCubic3, Rng3D } from "../math.js";
import { Painter3D } from "../painter.js";
import { color3D } from "../frame.js";

export interface WindRasenshurikenOptions { seed:number; radius:number; intensity:number; palette:Color3D[] }
export const meta: EffectMeta3D<WindRasenshurikenOptions> = {
  id:"arcane/wind-rasenshuriken-3d", name:"Wind Rasenshuriken · Refined",
  description:"Volumetric four-wing wind shuriken: spiralling vortex core, curved 3D airfoil ribbons, pressure filaments, launch and turbulent detonation.",
  duration:4.6, loop:false,
  options:{seed:308,radius:3.05,intensity:1,palette:["#041229","#103455","#146084","#198caf","#30bdd6","#6fe9ee","#b2fbfa","#f3ffff"]},
  stages:[{at:0,label:"CONDENSE"},{at:0.58,label:"FORM BLADES"},{at:1.25,label:"HURRICANE"},{at:2.35,label:"LAUNCH"},{at:3.02,label:"SHATTER"},{at:4.05,label:"DISSIPATE"}],
  cues:[{at:0.68,type:"sound",value:0.5},{at:2.35,type:"sound",value:1},{at:3.05,type:"hit",value:1},{at:3.07,type:"shake",value:0.35},{at:3.09,type:"flash",value:0.75}],
};
const CY=2.35, SAT=(x:number)=>clamp3(x,0,1);
export function create(options:WindRasenshurikenOptions){
  const rng=new Rng3D(options.seed), colors=options.palette.map(color3D);
  const R=Math.max(0.5,options.radius), power=clamp3(options.intensity,0.2,2);
  const specks=Array.from({length:180},(_,i)=>({
    a:rng.range(0,TAU3),r:rng.range(0.35,R*1.75),z:rng.range(-1,1),
    v:rng.range(1.6,6.8),phase:rng.range(0,TAU3),
    size:rng.range(0.018,0.082),tone:rng.int(3,7),band:i%5,
  }));
  const debris=Array.from({length:180},(_,i)=>({
    a:rng.range(0,TAU3),v:rng.range(3,11),z:rng.range(-0.9,0.9),
    size:rng.range(0.023,0.12),phase:rng.range(0,TAU3),tone:rng.int(3,7),band:i%4,
  }));
  let t=0;
  const pos=(a:number,r:number,z=0,shift=0):Vec3=>[shift+Math.cos(a)*r,CY+Math.sin(a)*r,z];
  return {
    update(dt:number){t+=dt;},
    draw(p:Painter3D){
      if(t>=meta.duration)return;
      const formation=smooth3(0.04,0.68,t),ring=smooth3(0.30,0.93,t);
      const flight=smooth3(2.35,3.05,t),impact=smooth3(3.03,3.33,t);
      const death=1-smooth3(3.95,4.6,t), body=formation*(1-smooth3(3.02,3.22,t))*death;
      const shift=1.18*flight;
      const center:Vec3=[shift,CY,0], rot=t*(10.5+1.8*formation);
      // Ten concentric helical filaments: bright core with counterrotating undertow.
      for(let k=0;k<10;k++){
        const direction=k%2?1:-1, phase=k*TAU3/10;
        let prev:Vec3|undefined;
        for(let i=0;i<=24;i++){
          const u=i/24, r=(0.06+0.88*u)*(0.65+0.35*formation);
          const a=phase+direction*rot*0.84+u*(4.4+0.5*Math.sin(t*2+phase));
          const q=pos(a,r,0.48*Math.sin(u*TAU3*1.4+phase-rot*0.37)*(0.25+u*0.75),shift);
          if(prev)p.line(prev,q,k%3===0?0.028:0.016,colors[k%3===0?7:5],body*(1-u*0.34)*(k%3===0?0.74:0.45),0.04*body);
          prev=q;
        }
      }
      // World-space curved airfoils, faceted for pixel-crisp silhouette and true z occlusion.
      if(body>0.003)for(let arm=0;arm<4;arm++){
        const start=rot+arm*TAU3/4;
        for(let layer=0;layer<2;layer++){
          let a0:Vec3|undefined,b0:Vec3|undefined;
          const n=30;
          for(let j=0;j<=n;j++){
            const u=j/n, theta=start+0.48*u*u+0.085*Math.sin(u*12-t*3+arm),
              r=R*(0.13+0.89*u)*formation,
              w=(0.07+0.74*Math.pow(Math.sin(Math.PI*u),0.72))*(1-0.20*layer)*formation;
            const sweep=theta+Math.PI/2+0.15*Math.sin(u*8+t),
              z=(layer?-0.33:0.16)+0.55*u*Math.sin(u*4+arm*0.9+rot*0.18);
            const A:Vec3=[shift+Math.cos(theta)*r+Math.cos(sweep)*w*0.52,CY+Math.sin(theta)*r+Math.sin(sweep)*w*0.52,z+0.10];
            const B:Vec3=[shift+Math.cos(theta)*r-Math.cos(sweep)*w*0.48,CY+Math.sin(theta)*r-Math.sin(sweep)*w*0.48,z-0.14];
            if(a0&&b0){
              const col=colors[layer?2+(j%3):j%7===0?7:3+Math.min(3,Math.floor(u*4))];
              p.triangle(a0,b0,A,col,body*(layer?0.72:0.96),0.025*body);
              p.triangle(A,b0,B,col,body*(layer?0.72:0.96),0.025*body);
              if(j%2===0){
                p.line(a0,A,layer?0.016:0.045,colors[layer?4:7],body*(layer?0.37:0.9),0.10*body);
                if(j%3===0)p.line(b0,B,0.022,colors[layer?3:5],body*0.46,0.02*body);
              }
            }
            a0=A;b0=B;
          }
        }
        // Spiky swept wake behind each wing tip, in multiple depth planes.
        for(let ray=0;ray<3;ray++){
          const base=start+0.48+ray*0.085;
          let prev:Vec3|undefined;
          for(let j=0;j<=18;j++){
            const u=j/18, theta=base-0.3*u-t*0.12*u,
              r=R*(1.0+0.47*u),z=0.25+0.5*Math.sin(u*9+arm+ray);
            const pt=pos(theta,r,z,shift);
            if(prev)p.line(prev,pt,ray===0?0.026:0.013,colors[ray===0?6:4],body*(1-u)*(ray===0?0.66:0.34),0.025*body);
            prev=pt;
          }
        }
      }
      // High-frequency turbulence: seeded once, evaluated analytically at any frame.
      if(body>0.003)for(const s of specks){
        const theta=s.a+rot*(0.5+s.v*0.047),rr=s.r*(0.78+0.17*Math.sin(t*s.v+s.phase));
        const z=s.z+0.34*Math.sin(t*3.5+s.phase),a=body*(0.14+0.56*Math.sin(t*5+s.phase)**2);
        if(s.band===0){
          const a0=pos(theta,rr,z,shift),a1=pos(theta-0.09,rr+0.16,z-0.1,shift);
          p.line(a0,a1,0.018,colors[s.tone],a,0.02*a);
        }else p.point(pos(theta,rr,z,shift),s.size,colors[s.tone],a,0.018*a);
      }
      // Pixel rings are visibly 3D: counter-tilted annuli follow the spinning eye.
      if(ring>0.01&&body>0.003)for(let k=0;k<4;k++){
        const rr=R*(0.56+k*0.13)*ring;
        let prev:Vec3|undefined;
        for(let j=0;j<=96;j++){
          const a=j*TAU3/96,wa=a+t*(k%2?0.7:-0.7),z=0.12*Math.sin(wa*3+k);
          const q=pos(a,rr,z,shift);
          if(prev&&Math.sin(a*11-t*4+k)>-0.43)p.line(prev,q,0.012,colors[k%2?3:5],body*0.27,0.01*body);
          prev=q;
        }
      }
      // Pre-impact eye and soft emission are kept behind the white pixel core.
      if(body>0.001){
        p.glow(center,1.6*formation,colors[4],0.25*body);
        p.glow([shift,CY,0.17],0.84*formation,colors[6],0.43*body);
        p.point(center,0.54*formation,colors[5],body,0.28*body);
        p.point([shift,CY,0.25],0.30*formation,colors[7],body,0.26*body);
      }
      // Impact: separate shock fronts, vortex fragments, hard white crackle and wispy streaks.
      if(t>=3.03){
        const age=t-3.03, blast=(1-smooth3(3.60,4.55,t))*death,rr=outCubic3(SAT(age/0.75))*R*2.6;
        for(let k=0;k<3;k++){
          const rad=rr*(0.70+k*0.17),f=blast*(1-smooth3(0.24,1.3,age));
          let prev:Vec3|undefined;
          for(let j=0;j<=128;j++){
            const a=j*TAU3/128,z=0.35*Math.sin(a*3+t*5+k),q=pos(a,rad,z,shift);
            if(prev&&(j+k)%9!==0)p.line(prev,q,k===1?0.054:0.027,colors[k===1?6:4],f*(k===1?0.62:0.33),0.035*f);
            prev=q;
          }
        }
        for(const s of debris){
          const u=age*s.v, distance=u*(0.38+0.08*s.band),ang=s.a+0.26*Math.sin(u*0.65+s.phase),
            z=s.z+0.42*Math.sin(u+s.phase),fade=blast*(1-smooth3(0.30,1.6,age));
          if(fade<=0.002)continue;
          const q=pos(ang,distance,z,shift);
          if(s.band<2){
            const tail=pos(ang-0.025,distance*(0.88+0.02*s.band),z-0.15,shift);
            p.line(tail,q,s.size*0.76,colors[s.tone],fade*0.76,fade*0.11);
          }else p.point(q,s.size,colors[s.tone],fade*0.72,fade*0.11);
        }
        const flash=Math.exp(-(((age-0.07)/0.105)**2))*0.8*power;
        if(flash>0.01){p.glow(center,2.8,colors[6],flash*0.7);p.point(center,0.45+flash,colors[7],flash,flash*0.3);}
      }
    },
  };
}
