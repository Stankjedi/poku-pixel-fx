// Original functional demonstration of opt-in point-light material response.
import {fit,clamp,smooth,ease,TAU,rand,samplePointLight2D,localPointLight2D,createPointLightSampler2D} from '../../core/index.js';
import type {PointLight2D,LightVector2D} from '../../core/point-light-2d.js';
import type {Painter,Point} from '../../core/painter.js';
export const meta={name:'Point-lit Rupture',desc:'A moving charge and short rupture illuminate nearby stone faces and the floor through position, normals and finite-range material lighting.',
 tags:['arcane','point-light','material','rupture','scene','one-shot'],size:[256,224],origin:[128,154],duration:2.6,loop:false,fps:50,bg:'black',
 options:{seed:107,receiveLight:true,pointLight:null as PointLight2D|null,palette:['#080d1a','#162535','#293f51','#426573','#71979e','#a4c5c1','#d5e9db','#f2fff3']}};
type Options=Omit<typeof meta.options,'palette'>&{palette:(string|number)[]};
const q=(t:number,a:number,b:number)=>clamp((t-a)/(b-a)),fade=(t:number,a:number,b:number)=>1-smooth(a,b,t);
export const releaseTime=1.18;
export function sourceAt(t:number):PointLight2D{
 const u=ease.inOutCubic(q(t,.12,.88)),age=t-releaseTime;
 const x=-61+61*u,y=-39-13*Math.sin(u*Math.PI)-8*u;
 const intensity=age<0?1.2+.65*smooth(.83,releaseTime,t):3.9*Math.exp(-age*8.5);
 return {position:[x,y,-38],radius:122,intensity:intensity*smooth(.03,.12,t)*fade(t,1.65,2.20)};
}
export function create(o:Options){
 const C=fit(o.palette,8),E=fit(['#102c42','#236578','#389eb1','#7cddd8','#c8fae7','#fbfff3'],6);
 const stones=[{x:-62,y:0,w:17,h:34},{x:63,y:7,w:17,h:40},{x:-36,y:27,w:13,h:18},{x:37,y:34,w:16,h:24},{x:3,y:42,w:13,h:14}];
 return {draw(p:Painter,t:number){
  if(t<=0||t>=meta.duration)return;
  const opacity=smooth(0,.12,t)*fade(t,2.15,2.6),before=p.fade;p.fade*=opacity;
  const source=sourceAt(t),light=o.pointLight?localPointLight2D(p,o.pointLight):source;
  const received=(pos:LightVector2D,N:LightVector2D)=>o.receiveLight?samplePointLight2D(light,pos,N).diffuse:0;
  const shade=(pos:LightVector2D,N:LightVector2D,base:number)=>C[Math.min(6,Math.max(1,Math.floor(base+received(pos,N)*3.4)))];
  const floorLight=o.receiveLight?createPointLightSampler2D(light,[0,-.48,-.88]):()=>0;
  // A receiving floor, not another additive ellipse. Its finite falloff moves with the source.
  p.shade(-101,-10,101,65,(x,y,out)=>{
   if((x/101)**2+((y-27)/36)**2>1)return;
   const stagger=Math.floor((y+10)/12)%2*12,tx=Math.floor((x+stagger)/24),ty=Math.floor((y+10)/12);
   const edge=((x+stagger+2400)%24)<1||((y+10)%12)<1;
   const base=edge?1:1.65+rand(o.seed,tx,ty)*.42;
   out.c=C[Math.min(6,Math.max(1,Math.floor(base+floorLight(x,y,14)*3.4)))];out.a=edge?.88:1;
  });
  const drawStone=(s:typeof stones[number],i:number)=>{
   const {x,y,w,h}=s,top=y-h;
   const front:Point[]=[[x-w,top+5],[x+2,top+10],[x+2,y+4],[x-w+2,y-1]];
   const side:Point[]=[[x+2,top+10],[x+w,top+2],[x+w-2,y-4],[x+2,y+4]];
   const roof:Point[]=[[x-w,top+5],[x-3,top-2],[x+w,top+2],[x+2,top+10]];
   p.poly(front,shade([x-w*.4,top+h*.55,-9],[-.56,.03,-.83],2.0));
   p.poly(side,shade([x+w*.6,top+h*.52,-7],[.76,.05,-.65],1.35));
   p.poly(roof,shade([x,top+3,-10],[0,-.80,-.60],2.25));
   // Sparse attached chips and seams follow surfaces. They are not free-floating noise.
   p.path([[x-w+3,top+8],[x-6,top+12],[x-8,top+17]],C[1],.72,.8);
   p.path([[x+4,top+13],[x+w-3,top+9]],shade([x+w*.6,top+10,-7],[.76,0,-.65],1.0),.8,.8);
   p.path([roof[0],roof[1],roof[2]],shade([x,top,-10],[0,-.85,-.52],2.55),.8,.8);
  };
  stones.slice(0,2).forEach(drawStone);
  const [cx,cy]=source.position,age=t-releaseTime;
  if(age<0){
   const compression=1-.55*smooth(.92,releaseTime,t),r=(4.5+Math.sin(t*9)*.35)*compression;
   p.glow(cx,cy,18,E[2],.19);
   p.poly([[cx,cy-r*1.6],[cx+r,cy],[cx,cy+r*1.6],[cx-r,cy]],E[2]);
   p.poly([[cx,cy-r*1.5],[cx+r*.45,cy],[cx,cy+r],[cx-r*.4,cy]],E[4]);
   p.path([[cx-r*.6,cy],[cx,cy-r*1.2]],E[5],.9,.9);
   // Short coherent wake, which is gone before the release.
   if(t<.92){const tail:Point[]=[];for(let j=0;j<10;j++){const past=sourceAt(Math.max(0,t-j*.012));tail.unshift([past.position[0],past.position[1]]);}
    p.path(tail,E[2],u=>u*.6,1.5);}
  }else if(age<.50){
   const lobes=[[-.52,54,21,.34,.2],[-1.42,36,17,.30,1.8],[-2.7,31,13,.27,2.7],[.5,39,17,.37,3.8],[1.6,28,14,.35,2.1]].map(([an,reach,r,life,phase],i)=>{
    const a=Math.max(0,age-i*.006),growth=ease.outQuart(q(a,0,.15));
    const spread=growth*(.58+.42*smooth(.035,.14,a));
    return {an,life,phase,a,x:cx+Math.cos(an)*reach*spread,y:cy+Math.sin(an)*reach*spread,
     radius:r*(.28+.72*growth)*fade(a,.08,life),cut:smooth(.04,.22,a),heat:fade(a,.015,.20)};
   });
   const hole=30*ease.outCubic(q(age,.065,.22));
   p.shade(-83,-120,90,8,(x,y,out)=>{
    if(Math.hypot(x-cx,(y-cy)*1.1)<hole)return;
    let best=-1,heat=0;
    for(const f of lobes){
     if(f.radius<.3||f.a>=f.life)continue;
     const dx=x-f.x,dy=y-f.y,c=Math.cos(f.an),s=Math.sin(f.an),u=dx*c+dy*s,v=-dx*s+dy*c;
     const theta=Math.atan2(v,u),wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
     const cut=Math.max(0,1-Math.abs(wrap(theta-2.3-Math.sin(f.phase)*.3))/.28)*.22;
     const boundary=1+.16*Math.sin(theta*3+f.phase)+.07*Math.sin(theta*5-f.phase)-cut*smooth(.02,.09,f.a);
     const d=Math.hypot(u,v)/(f.radius*boundary);
     if(d>=1)continue;
     const cavity=Math.hypot(u+f.radius*.75,v+f.radius*.1)-f.radius*f.cut*1.2;
     if(cavity<0)continue;
     const edge=Math.min(1-d,cavity/f.radius);
     if(edge>best){best=edge;heat=f.heat;}
    }
    if(best<0)return;
    const energy=heat*(.24+Math.min(.65,best*1.8));
    out.c=E[energy>.72&&age<.055?5:energy>.52?4:energy>.27?3:energy>.10?2:1];out.a=fade(age,.27,.44);
   });
   if(age<.04){const star:Point[]=[];for(let i=0;i<14;i++){const an=i*TAU/14,r=i%2?8:22;star.push([cx+Math.cos(an)*r,cy+Math.sin(an)*r]);}p.poly(star,E[5],fade(age,.01,.04));}
   p.glow(cx,cy,25,E[3],fade(age,.025,.15)*.3);
  }
  // Fourteen finite-lived sparks, aligned to the blast. Counts are not the lighting feature.
  if(age>0&&age<.70)for(let i=0;i<14;i++){
   const an=rand(o.seed,i,1)*TAU,travel=(25+rand(o.seed,i,2)*48)*(1-Math.exp(-age*5));
   const x=cx+Math.cos(an)*travel,y=cy+Math.sin(an)*travel+age*age*18,a=fade(age,.10,.32+rand(o.seed,i,3)*.30);
   if(a>.01)p.path([[x-Math.cos(an)*3,y-Math.sin(an)*3],[x,y]],E[i%3?2:4],a*.75,.85);
  }
  stones.slice(2).forEach(drawStone);
  p.fade=before;
 }};
}
