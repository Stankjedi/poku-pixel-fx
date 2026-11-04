/** Four airfoil blades collapse into a fast gust, then transfer pressure into a grounded prop. */
import type { EffectMeta3D } from "../fx.js";
import type { Color3D } from "../frame.js";
import type { Vec3 } from "../math.js";
import { TAU3, clamp3, smooth3, Rng3D } from "../math.js";
import { Painter3D } from "../painter.js";
import { color3D } from "../frame.js";
import { gustImpulse3D, advectGust3D } from "../wind-pressure.js";

export interface WindRasenshurikenOptions { seed:number; radius:number; intensity:number; palette:Color3D[]; targetVisible?:boolean }
export const WIND_CONTACT_3D = Object.freeze({
  at: 3.05, position: Object.freeze([3.15, 2.35, 0]) as Vec3,
  normal: Object.freeze([-1, 0, 0]) as Vec3, material: 'wood',
});
const RELEASE = 2.65;
export const meta: EffectMeta3D<WindRasenshurikenOptions> = {
  id:"arcane/wind-rasenshuriken-3d", name:"Wind Rasenshuriken · Refined",
  description:"Volumetric four-wing wind shuriken: spiralling vortex core, curved 3D airfoil ribbons, pressure filaments and a fast compressed launch. Air splits around a wooden target, rocks and slides it, then carries dust and leaves downstream.",
  duration:4.6, loop:false,
  options:{seed:308,radius:3.05,intensity:1,palette:["#102831","#27434a","#42646a","#63868a","#88aaac","#b0c7bf","#dbe5ce","#f0f3dc"],targetVisible:true},
  stages:[{at:0,label:"CONDENSE"},{at:0.58,label:"FORM BLADES"},{at:1.25,label:"HURRICANE"},{at:RELEASE,label:"FAST GUST"},{at:WIND_CONTACT_3D.at,label:"PRESSURE STRIKE"},{at:4.05,label:"DISSIPATE"}],
  cues:[{at:0.68,type:"sound",value:0.5},{at:RELEASE,type:"sound",value:1},{at:WIND_CONTACT_3D.at,type:"hit",value:1},{at:WIND_CONTACT_3D.at,type:"shake",value:0.16}],
};
const CY=WIND_CONTACT_3D.position[1];
const WOOD=["#322e2a","#51463a","#78634b","#a38960","#c1aa79"], SOIL=["#394138","#59604a","#818066"], LEAF=["#647e49","#a6ad69","#c2bd7d"];
export function create(options:WindRasenshurikenOptions){
  const rng=new Rng3D(options.seed), palette=options.palette?.length?options.palette:meta.options.palette;
  const colors=Array.from({length:8},(_,i)=>color3D(palette[Math.round(i/7*(palette.length-1))]));
  const R=clamp3(Number.isFinite(options.radius)?options.radius:3.05,0.5,3.4), power=clamp3(Number.isFinite(options.intensity)?options.intensity:1,0,2);
  const specks=Array.from({length:84},(_,i)=>({
    a:rng.range(0,TAU3),r:rng.range(Math.min(.35,R*.5),R*1.3),z:rng.range(-1,1),
    v:rng.range(1.6,6.8),phase:rng.range(0,TAU3),
    size:rng.range(0.018,0.082),tone:rng.int(3,7),band:i%5,
  }));
  const carried=Array.from({length:66},(_,i)=>({
    born: i<18?0.012+i*0.008:0.08+(i-18)*0.009,
    x:rng.range(2.9,3.3),z:rng.range(-0.9,0.95), y:i%3===0?rng.range(0.2,1.1):rng.range(0.03,0.2),
    speed:rng.range(4.4,8.4),phase:rng.range(0,TAU3),size:rng.range(0.08,0.17),leaf:i%3===0,tone:rng.int(0,2),life:rng.range(0.65,1.2),
  }));
  const grass=Array.from({length:9},(_,i)=>({x:2.25+i*.38,z:(i%2?1:-1)*(.61+(i%3)*.14),h:rng.range(.22,.52)}));
  let t=0;
  const contactAge=()=>Math.abs(t-WIND_CONTACT_3D.at)<1e-9?0:t-WIND_CONTACT_3D.at;
  const visible=()=>smooth3(.025,.20,t)*(1-smooth3(4.28,4.6,t));
  function targetPoint(x:number,y:number,z:number):Vec3{
    const kick=gustImpulse3D(contactAge(),power),angle=Math.max(0,kick.deflection)*.50;
    const pivot=4.25,dx=x-pivot;
    return [pivot+dx*Math.cos(angle)+y*Math.sin(angle)+.55*kick.drift,-dx*Math.sin(angle)+y*Math.cos(angle),z];
  }
  function target(p:Painter3D){
    const a=visible();if(a<=0)return;
    // The narrow soil bed and rooted grass establish the contact plane without a generic shock ring.
    p.triangle([1.9,0,-1.16],[6.2,0,-1.16],[6.2,0,1.16],SOIL[0],a*.72);
    p.triangle([1.9,0,-1.16],[6.2,0,1.16],[1.9,0,1.16],SOIL[0],a*.72);
    for(const g of grass){
      const response=gustImpulse3D(contactAge()-Math.max(0,g.x-3.15)/12,power), bend=response.deflection*.75;
      for(let j=0;j<3;j++){
        const root:Vec3=[g.x+j*.035,.015,g.z],tip:Vec3=[g.x+j*.035+bend+(.09-j*.08),g.h*(1-Math.min(.5,Math.abs(bend)*.6)),g.z+.025*j];
        p.line(root,tip,.015,LEAF[j],a*.85);
      }
    }
    if(options.targetVisible===false)return;
    const v=[targetPoint(3.15,.04,-.36),targetPoint(4.25,.04,-.36),targetPoint(4.25,3.55,-.36),targetPoint(3.15,3.55,-.36),
      targetPoint(3.15,.04,.36),targetPoint(4.25,.04,.36),targetPoint(4.25,3.55,.36),targetPoint(3.15,3.55,.36)];
    for(const [i,j,k,l,c] of [[0,1,2,3,0],[4,5,6,7,2],[0,4,7,3,1],[1,2,6,5,1],[3,7,6,2,3]]){
      p.triangle(v[i],v[j],v[k],WOOD[c],a);p.triangle(v[i],v[k],v[l],WOOD[c],a);
    }
    for(const x of [3.44,3.79,4.08])p.line(targetPoint(x,.1,.365),targetPoint(x,3.47,.365),.018,WOOD[1],a*.7);
    // Two bands belong to the prop and follow its exact tilt and skid transform.
    for(const y of [.68,2.85]){
      p.line(targetPoint(3.16,y,.377),targetPoint(4.24,y,.377),.065,WOOD[0],a);
      p.point(targetPoint(3.31,y,.39),.025,WOOD[4],a);
      p.point(targetPoint(4.09,y,.39),.025,WOOD[4],a);
    }
  }
  function contact(p:Painter3D){
    const age=contactAge();if(age<0)return;
    const a=visible(), kick=gustImpulse3D(age,power);
    // A thin compression patch sits on the struck face at the exact contact, then vanishes.
    if(kick.pressure>.01){
      const v=[targetPoint(3.125,CY-.65,-.35),targetPoint(3.125,CY+.65,-.35),targetPoint(3.125,CY+.65,.38),targetPoint(3.125,CY-.65,.38)];
      p.triangle(v[0],v[1],v[2],colors[6],a*kick.pressure*.48,0);
      p.triangle(v[0],v[2],v[3],colors[5],a*kick.pressure*.4,0);
    }
    // Broken C-shaped pressure fronts hug the incoming face, opening downstream. Never a radial explosion.
    for(let lane=0;lane<4;lane++){
      const born=lane*.041,local=age-born;if(local<0||local>.55)continue;
      const fade=(1-smooth3(.08,.55,local))*a*.7, spread=.65+local*2.5;
      let prev:Vec3|undefined;
      for(let j=0;j<=20;j++){
        const u=j/20,theta=-1.1+u*2.2,side=lane%2?1:-1;
        const q:Vec3=[3.08+.55*kick.drift+local*4-Math.cos(theta)*(.2+spread*.35),CY+Math.sin(theta)*spread*(.8+lane*.09),side*(.45+spread*.24)];
        if(prev)p.line(prev,q,.02+(1-u)*.008,colors[lane%3+4],fade,0);prev=q;
      }
    }
    // Flow divides around the obstacle's sides. Gaps and finite tongues retain air, not laser, semantics.
    for(let lane=0;lane<8;lane++){
      const local=age-lane*.022;if(local<0||local>.50)continue;
      const lead=Math.min(1,local*4.4),tail=Math.max(0,lead-.45),side=lane%2?1:-1;
      let prev:Vec3|undefined;
      for(let j=0;j<=14;j++){
        const u=tail+(lead-tail)*j/14;
        const q:Vec3=[2.45+u*3.1+.55*kick.drift,.5+(lane%4)*.66+Math.sin(u*Math.PI)*.1,side*(.46+Math.sin(u*Math.PI)*.42)];
        if(prev)p.line(prev,q,.016,colors[4+lane%3],a*(1-smooth3(.15,.50,local))*.68,0);prev=q;
      }
    }
    for(const q of carried){
      const local=age-q.born;if(local<0||local>=q.life)continue;
      const moved=advectGust3D([q.x,q.y,q.z],[1,.04,q.z*.12],local,q.speed*Math.min(1.15,power),2.7);
      const y=q.leaf?Math.max(.04,moved[1]+.6*Math.sin(local*Math.PI/q.life)+.12*Math.sin(local*15+q.phase)*Math.sin(Math.min(1,local*6)*Math.PI/2)):moved[1]+.30*Math.sin(local*Math.PI/q.life);
      const pos:Vec3=[moved[0],y,moved[2]],fade=a*(1-smooth3(q.life*.55,q.life,local));
      if(q.leaf){
        const angle=q.phase+local*16,dx=Math.cos(angle)*q.size*1.6,dz=Math.sin(angle)*q.size*.7;
        p.triangle([pos[0]-dx,y,pos[2]-dz],[pos[0],y+q.size*.58,pos[2]+q.size*.55],[pos[0]+dx,y,pos[2]+dz],LEAF[q.tone],fade);
        p.triangle([pos[0]-dx,y,pos[2]-dz],[pos[0],y-q.size*.35,pos[2]-q.size*.55],[pos[0]+dx,y,pos[2]+dz],LEAF[(q.tone+1)%3],fade);
      }else{
        const r=q.size*(1+local*2.6);
        p.line([pos[0]-r*1.5,y,pos[2]],pos,r*.85,SOIL[q.tone],fade*.64,0);
      }
    }
  }
  const flight=()=>smooth3(RELEASE,WIND_CONTACT_3D.at,t);
  // Squash the rotating airfoil into a narrow travelling tongue before contact. Its outer
  // support is held upstream of the contact plane until the same authored hit time.
  const world=(x:number,y:number,z:number):Vec3=>{
    const f=flight(),sx=1-.92*f,sy=1-.48*f,support=Math.max(1,Math.min(R*1.47,4.4)+.1);
    const start=Math.min(-1.5,WIND_CONTACT_3D.position[0]-support-.55),endpoint=WIND_CONTACT_3D.position[0]-support*.08-.05;
    return [start+(endpoint-start)*f+x*sx,CY+.9*(1-f)+y*sy,z*(1+.2*f)];
  };
  const pos=(a:number,r:number,z=0):Vec3=>world(Math.cos(a)*r,Math.sin(a)*r,z);
  return {
    update(dt:number){t+=dt;},
    draw(p:Painter3D){
      if(t<=0||t>=meta.duration-1e-8||power<=0)return;
      target(p);
      const formation=smooth3(0.04,0.68,t),ring=smooth3(0.30,0.93,t);
      const body=formation*(1-smooth3(WIND_CONTACT_3D.at,WIND_CONTACT_3D.at+.12,t))*Math.min(1,power);
      const rot=t*(10.5+1.8*formation);
      // Ten concentric helical filaments: bright core with counterrotating undertow.
      for(let k=0;k<10;k++){
        const direction=k%2?1:-1, phase=k*TAU3/10;
        let prev:Vec3|undefined;
        for(let i=0;i<=24;i++){
          const u=i/24, r=(0.06+0.88*u)*(0.65+0.35*formation);
          const a=phase+direction*rot*0.84+u*(4.4+0.5*Math.sin(t*2+phase));
          const q=pos(a,r,0.48*Math.sin(u*TAU3*1.4+phase-rot*0.37)*(0.25+u*0.75));
          if(prev)p.line(prev,q,k%3===0?0.028:0.016,colors[k%3===0?7:5],body*(1-u*0.34)*(k%3===0?0.74:0.45),0);
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
            const A=world(Math.cos(theta)*r+Math.cos(sweep)*w*0.52,Math.sin(theta)*r+Math.sin(sweep)*w*0.52,z+0.10);
            const B=world(Math.cos(theta)*r-Math.cos(sweep)*w*0.48,Math.sin(theta)*r-Math.sin(sweep)*w*0.48,z-0.14);
            if(a0&&b0){
              const col=colors[layer?2+(j%3):j%7===0?7:3+Math.min(3,Math.floor(u*4))];
              p.triangle(a0,b0,A,col,body*(layer?0.72:0.96),0);
              p.triangle(A,b0,B,col,body*(layer?0.72:0.96),0);
              if(j%2===0){
                p.line(a0,A,layer?0.016:0.045,colors[layer?4:7],body*(layer?0.37:0.9),0);
                if(j%3===0)p.line(b0,B,0.022,colors[layer?3:5],body*0.46,0);
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
              r=R+(Math.min(R*1.47,4.4)-R)*u,z=0.25+0.5*Math.sin(u*9+arm+ray);
            const pt=pos(theta,r,z);
            if(prev)p.line(prev,pt,ray===0?0.026:0.013,colors[ray===0?6:4],body*(1-u)*(ray===0?0.66:0.34),0);
            prev=pt;
          }
        }
      }
      // High-frequency turbulence: seeded once, evaluated analytically at any frame.
      if(body>0.003)for(const s of specks){
        const theta=s.a+rot*(0.5+s.v*0.047),rr=s.r*(0.78+0.17*Math.sin(t*s.v+s.phase));
        const z=s.z+0.34*Math.sin(t*3.5+s.phase),a=body*(0.14+0.56*Math.sin(t*5+s.phase)**2);
        if(s.band===0){
          const a0=pos(theta,rr,z),a1=pos(theta-0.09,rr+0.16,z-0.1);
          p.line(a0,a1,0.018,colors[s.tone],a,0);
        }else p.point(pos(theta,rr,z),s.size,colors[s.tone],a,0);
      }
      // Pixel rings are visibly 3D: counter-tilted annuli follow the spinning eye.
      if(ring>0.01&&body>0.003)for(let k=0;k<4;k++){
        const rr=R*(0.56+k*0.13)*ring;
        let prev:Vec3|undefined;
        for(let j=0;j<=96;j++){
          const a=j*TAU3/96,wa=a+t*(k%2?0.7:-0.7),z=0.12*Math.sin(wa*3+k);
          const q=pos(a,rr,z);
          if(prev&&Math.sin(a*11-t*4+k)>-0.43)p.line(prev,q,0.012,colors[k%2?3:5],body*0.27,0);
          prev=q;
        }
      }
      // Short curved wakes expose launch speed without introducing a continuous beam.
      if(t>RELEASE&&t<WIND_CONTACT_3D.at+.07){
        const f=flight(),a=smooth3(RELEASE,RELEASE+.07,t)*(1-smooth3(WIND_CONTACT_3D.at-.02,WIND_CONTACT_3D.at+.07,t));
        for(let lane=0;lane<7;lane++){
          const center=world(0,0,0),side=lane%2?1:-1;
          let prev:Vec3|undefined;
          for(let j=0;j<=14;j++){
            const u=j/14,q:Vec3=[center[0]-u*(.5+f*2.4),center[1]+(lane-3)*.18+Math.sin(u*3.4+lane)*u*.3,side*(.42+Math.sin(u*3)*.18)];
            if(prev)p.line(prev,q,.018,colors[lane%3+4],a*(1-u)*.6,0);prev=q;
          }
        }
      }
      // The core stays hollow: crossing filaments, not a glowing plasma sphere.
      contact(p);
    },
  };
}
