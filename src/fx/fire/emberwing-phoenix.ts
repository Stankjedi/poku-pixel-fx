/** New particle-led phoenix study. Original authored stream geometry rendered by POKU.
 * Niagara is an aesthetic reference only: this is deterministic CPU 2D, not UE or a fluid solver. */
import { fit, smooth, clamp, rand, noise2, createCinematicParticles2D, createCurlFlow2D } from '../../core/index.js';
import type { Painter, Point } from '../../core/painter.js';
export const meta = {
 name:'Emberwing Phoenix',desc:'Irregular short-lived fire volumes form a frontal phoenix, then fold into the same dash and particle release.',
 tags:['phoenix','fire','particle-led','cinematic'],size:[480,360],origin:[202,195],duration:5.8,loop:false,fps:30,bg:'black',
 options:{seed:112743,palette:['#240c16','#6c1820','#c7391c','#f65c17','#ff972e','#ffc65a','#ffe6a8','#fff9e6'],particleDensity:1,glowStrength:1}
};
export const timing={unfurl:.75,charge:2.65,dash:3.05,impact:3.5,end:5.8};
const TAU=Math.PI*2,S=smooth;
type Options=typeof meta.options;
type Curve={a:Point,b:Point,c:Point,d:Point};
function pose(t:number){
 const open=S(.04,.72,t),charge=S(2.60,3.05,t),dash=S(timing.dash,timing.impact,t);
 const size=(.60+.40*S(.1,.95,t))*(1-.46*dash);
 return {open,charge,dash,size,x:155*dash-8*Math.sin(t*1.1)*(1-dash),y:12-24*S(.1,1.5,t)-11*dash+3*Math.sin(t*4.1)*(1-dash),
  bank:.06*Math.sin(t*2.2)*(1-dash)+1.4*dash,lift:.19*Math.sin((t-.3)*5.3)*(1-charge)+.16*charge,spread:open*(1-.30*charge)*(1-.58*dash)};
}
export function phoenixPoint(x:number,y:number,t:number):Point{const q=pose(t),cs=Math.cos(q.bank),sn=Math.sin(q.bank);return[(q.x+(x*cs-y*sn)*q.size)*.75,(q.y+(x*sn+y*cs)*q.size)*.75];}
function wingPoint(x:number,y:number,side:number,t:number):Point{
 const q=pose(t),u=clamp((x-16)/170),a=-q.lift*(.3+.7*u);
 return phoenixPoint(side*(16+((x-16)*Math.cos(a)-y*Math.sin(a))*q.spread),-18+(x-16)*Math.sin(a)+y*Math.cos(a),t);
}
export function featherCurve(side:number,k:number,t:number,secondary=false):Curve{
 const u=k/(secondary?6:10),w=Math.sin(t*7.3-u*3.1+side*1.4);
 const ax=secondary?18+u*57:64+34*(1-u),ay=secondary?-3-u*27:-32+13*u;
 const dx=secondary?39+u*72:193-94*u,dy=secondary?39-u*9:-81+132*u;
 return {a:wingPoint(ax,ay,side,t),b:wingPoint(ax+(dx-ax)*.30,ay+(dy-ay)*.21-8,side,t),
 c:wingPoint(ax+(dx-ax)*.72,ay+(dy-ay)*.66-3+w*2.4,side,t),d:wingPoint(dx+w*2.2,dy+w*3.5,side,t)};
}
function curvePoint(f:Curve,u:number):Point{const v=1-u;return[v*v*v*f.a[0]+3*v*v*u*f.b[0]+3*v*u*u*f.c[0]+u*u*u*f.d[0],v*v*v*f.a[1]+3*v*v*u*f.b[1]+3*v*u*u*f.c[1]+u*u*u*f.d[1]];}
function tailCurve(k:number,t:number):Curve{
 const z=k-2,lag=t-.10-Math.abs(z)*.025;
 return {a:phoenixPoint(z*2,15,t),b:phoenixPoint(z*9+Math.sin(lag*5+z)*4,48,lag),c:phoenixPoint(z*20+Math.sin(lag*5.5+z)*8,108,lag),d:phoenixPoint(z*23+Math.sin(lag*5+z)*12,174-Math.abs(z)*20,lag)};
}
function bodyCurve(k:number,t:number):Curve{
 const z=k-2;
 return {a:phoenixPoint(z*2.2,-39,t),b:phoenixPoint(z*6,-24,t),c:phoenixPoint(z*6.8,8,t),d:phoenixPoint(z*1.3,31,t)};
}
/** Finite flame packet, not a trajectory ribbon or a line following the skeleton.
 * The local material erodes and changes silhouette through its life. */
function drawFlamePacket(p:Painter,q:{id:number;x:number;y:number;vx:number;vy:number;size:number;alpha:number;progress:number;age:number},C:number[],seed:number,opacity=1,soft=false){
 if(q.alpha<.005||q.size<.15)return;
 const phase=rand(seed,q.id,301)*TAU,angle=Math.atan2(q.vy,q.vx)+(rand(seed,q.id,302)-.5)*1.0+.12*Math.sin(q.age*9+phase);
 const cs=Math.cos(angle),sn=Math.sin(angle),length=q.size*(soft?.8+rand(seed,q.id,303)*.5:.95+rand(seed,q.id,303)*.75),width=q.size*(soft?.65+rand(seed,q.id,304)*.4:.48+rand(seed,q.id,304)*.45),radius=length+width;
 const depletion=S(.22,.94,q.progress),alpha=q.alpha*opacity;
 const lobeA=.58+rand(seed,q.id,310)*.35,lobeB=.52+rand(seed,q.id,311)*.33,lean=(rand(seed,q.id,312)-.5)*.8,split=rand(seed,q.id,313);
 p.shade(q.x-radius,q.y-radius,q.x+radius,q.y+radius,(x,y,out)=>{
  const dx=x-q.x,dy=y-q.y,u=(dx*cs+dy*sn)/length,v=(-dx*sn+dy*cs)/width;
  if(u< -1.15||u>1.2||Math.abs(v)>1.3)return;
  const bend=.16*Math.sin(u*4-q.age*7+phase),vv=v-bend;
  const a=((u+.23)/lobeA)**2+(vv/lobeB)**2,b=((u-.28)/(.45+split*.3))**2+((vv-lean)/(.25+split*.23))**2,c=split>.35?((u-.13)/.47)**2+((vv+.38)/.29)**2:10;
  const distance=soft?Math.min(((u+.12)/.85)**2+(vv/.92)**2,((u-.30)/.68)**2+((vv+.15*Math.sin(phase))/.65)**2):Math.min(a,b,c),n=noise2(u*3.4+q.age*4,v*3.0-phase,seed+q.id*13),m=noise2(u*7.1-q.age*6,v*6.1+phase,seed+q.id*17);
  if(distance>1+n*.29+m*.09)return;
  if(.57+.33*n+.18*m<depletion*.9)return;
  const thermal=rand(seed,q.id,305),hot=thermal>.80;
  const heat=clamp(.13+.42*(1-distance)+.12*n+.08*m+.12*(1-q.progress)+(hot?.15:0));
  const index=soft?Math.max(2,Math.min(4,Math.floor(heat*5.2)+1)):Math.max(1,Math.min(7,Math.floor(heat*7.9)));
  out.c=C[index];out.a=alpha*(soft?clamp((1-distance)*1.6)**.7*(.7+.3*n):(.58+.42*clamp((1-distance)*2)));
  out.l=C[Math.min(6,index+1)];out.k=alpha*(soft?.02:.08)*clamp(heat-.35);
 });
 p.glow(q.x,q.y,Math.max(2,width*1.5),C[4],alpha*.065);
}
export function create(o:Options){
 const C=fit(o.palette,8),seed=o.seed,density=clamp(o.particleDensity,0,1.2);
 const flow=createCurlFlow2D({seed:seed+97,scale:22,strength:70,drift:[5,-22]});
 const sourceFrame=(birth:number,id:number,u:number)=>{
  const side=id%2?1:-1,k=Math.floor(u*11),role=rand(seed,id,200);let v=.025+.95*rand(seed,id,15);
  const P=(x:number,y:number)=>phoenixPoint(x,y,birth);
  let f:Curve,spread:number;
  if(role<.08){
   const z=(id%3)-1;
   f={a:P(z*3,-35),b:P(z*5,-44),c:P(z*5,-54),d:P(z*9,-68)};spread=2.0;
  }else if(role<.22){f=bodyCurve(id%5,birth);v=.27+.73*v;spread=3.5;}
  else if(role<.38){f=tailCurve(id%5,birth);spread=1.5+(1-v)*7.0;}
  else if(role<.53){
   f={a:wingPoint(5,-2,side,birth),b:wingPoint(33,-31,side,birth),c:wingPoint(67,-43,side,birth),d:wingPoint(112,-48,side,birth)};spread=6.5;
  }else{const secondary=role<.73;f=featherCurve(side,secondary?k%7:k,birth,secondary);spread=(secondary?5.0:6.0)*(1-.45*v);}
  const pos=curvePoint(f,v),a=curvePoint(f,Math.max(0,v-.02)),b=curvePoint(f,Math.min(1,v+.02)),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
  const cross=(rand(seed,id,202)-.5)*2*spread*Math.sin(Math.PI*v)**.35;
  return {position:[pos[0]-dy/len*cross,pos[1]+dx/len*cross] as Point,tangent:[dx/len,dy/len] as Point,role,cross};
 };
 const wingSource=(birth:number,id:number,u:number):Point=>sourceFrame(birth,id,u).position;
 const velocity=(birth:number,id:number,u:number):Point=>{
  const a=wingSource(birth,id,u),b=wingSource(Math.max(0,birth-.02),id,u);
  return[(a[0]-b[0])*14+(id%2?1:-1)*5,Math.min(-10,(a[1]-b[1])*10-15)];
 };
 const flameFrame=(birth:number,id:number,u:number)=>{
  const s=sourceFrame(birth,id,u),v=velocity(birth,id,u);
  return {position:s.position,direction:[s.tangent[0],s.tangent[1]-.25] as Point,inheritedVelocity:v};
 };
 const hot=createCinematicParticles2D({count:Math.round(5800*density),seed:seed+3,palette:[C[6],C[5],C[4],C[3],C[1]],
  emissionFrame:flameFrame,start:.12,duration:3.32,life:[.22,.48],speed:[12,38],spread:1.20,
  gravity:-45,drag:1.4,size:[4.3,9.2],endSize:.18,style:'ember',emission:0,flow,flowStep:1/100});
 const massSource=(birth:number,id:number,u:number):Point=>{
  const side=id%2?1:-1;let f:Curve,v=.15+u*.70;
  if(id%5===0){f=bodyCurve(id%5,birth);v=.36+u*.47;}
  else if(id%3===0){f=featherCurve(side,1+id%5,birth,true);v=.08+u*.5;}
  else f={a:wingPoint(7,-3,side,birth),b:wingPoint(32,-29,side,birth),c:wingPoint(68,-41,side,birth),d:wingPoint(108,-47,side,birth)};
  const p=curvePoint(f,v);return[p[0]+(rand(seed,id,211)-.5)*5,p[1]+(rand(seed,id,212)-.5)*8];
 };
 const masses=createCinematicParticles2D({count:Math.round(750*density),seed:seed+41,palette:[C[4],C[3],C[2]],
  source:massSource,inheritedVelocity:(birth,id,u)=>{const a=massSource(birth,id,u),b=massSource(birth-.02,id,u);return[(a[0]-b[0])*14,Math.min(-6,(a[1]-b[1])*12-10)];},
  start:.10,duration:3.34,life:[.30,.56],speed:[5,18],angle:-Math.PI/2,spread:1.6,
  gravity:-18,drag:1.8,size:[8,14],endSize:.30,style:'ember',emission:0,flow,flowStep:1/100});
 const wisps=createCinematicParticles2D({count:Math.round(850*density),seed:seed+71,palette:[C[5],C[4],C[3],C[2]],
  source:wingSource,inheritedVelocity:velocity,start:.18,duration:3.25,life:[.26,.65],speed:[22,55],angle:-Math.PI/2,spread:1.6,
  gravity:-30,drag:1.4,size:[2.5,6.5],endSize:.07,style:'ember',emission:0,flow,flowStep:1/100});
 const sparks=createCinematicParticles2D({count:Math.round(1500*density),seed:seed+89,palette:[C[7],C[6],C[4],C[2]],
  source:wingSource,inheritedVelocity:velocity,start:.20,duration:3.28,life:[.25,.95],speed:[11,54],angle:-Math.PI/2,spread:2.2,
  gravity:-18,drag:.75,size:[.45,1.2],endSize:.2,style:'spark',trailSeconds:.033,trailSamples:4,emission:.11,lightRadius:2.6,
  flow,flowStep:1/100});
 const center=phoenixPoint(0,-10,timing.impact);
 const blast=createCinematicParticles2D({count:Math.round(670*density),seed:seed+131,palette:[C[7],C[6],C[5],C[4],C[2]],
  source:(birth,id,u)=>[center[0]+(rand(seed,id,41)-.5)*10,center[1]+(rand(seed,id,42)-.5)*10],start:timing.impact,duration:.075,
  life:[.3,1.65],speed:[45,233],spread:TAU,drag:2.1,gravity:-7,size:[.4,1.5],endSize:.1,style:'spark',trailSeconds:.10,
  trailSamples:5,emission:.11,lightRadius:3,flow,flowStep:1/100});
 const blastFire=createCinematicParticles2D({count:Math.round(380*density),seed:seed+151,palette:[C[6],C[5],C[4],C[3],C[1]],
  source:center,start:timing.impact+.015,duration:.14,life:[.25,.85],speed:[49,173],spread:TAU,drag:2.3,gravity:-26,
  size:[3.2,8.2],endSize:.05,style:'ribbon',ribbonProfile:'wispy',trailSeconds:.17,trailSamples:7,emission:.12,lightRadius:5,flow,flowStep:1/100});
 const afterburn=createCinematicParticles2D({count:Math.round(500*density),seed:seed+163,palette:[C[6],C[5],C[4],C[3],C[1]],
  source:(birth,id,u)=>{const a=rand(seed,id,52)*TAU,r=rand(seed,id,53)*19;return[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r*.75];},
  start:timing.impact,duration:.22,life:[.25,.62],speed:[19,79],spread:TAU,drag:2.6,gravity:-55,
  size:[3.8,9.5],endSize:.05,style:'ribbon',ribbonProfile:'wispy',trailSeconds:.14,trailSamples:7,emission:.14,lightRadius:6,flow,flowStep:1/100});
 return {emitters:{hot,masses,wisps,sparks,blast,blastFire,afterburn},sourceFrame,draw(p:Painter,t:number){
  if(t<=0||t>=meta.duration)return;
  const q=pose(t),alive=S(0,.28,t)*(1-S(timing.impact-.025,timing.impact+.045,t));
  const oldLight=p.lightK;p.lightK*=o.glowStrength;
  for(const packet of masses.sample(t)){const factor=packet.id%5===0?.65:1;drawFlamePacket(p,{...packet,size:packet.size*factor},C,seed+41,.55,true);}
  for(const q of wisps.sample(t))drawFlamePacket(p,q,C,seed+71,.45);
  for(const packet of hot.sample(t)){const role=rand(seed,packet.id,200),factor=role<.08?.62:role<.22?.8:role<.38?1-.42*rand(seed,packet.id,15):1;drawFlamePacket(p,{...packet,size:packet.size*factor},C,seed+3);}
  if(alive>.001){
   p.glow(...phoenixPoint(0,-8,t),42*q.size,C[3],alive*.11);
   const alpha=alive*q.open,P=(x:number,y:number)=>phoenixPoint(x,y,t);
   // Only compact facial anchors remain. No long anatomical guide is painted.
   p.path([P(-8,-43),P(-4,-40),P(-2,-41)],C[6],alpha,1.1);
   p.path([P(8,-43),P(4,-40),P(2,-41)],C[6],alpha,1.1);
   p.path([P(-2,-38),P(1,-33),P(4,-39)],C[5],alpha,1.4);
   p.glow(...P(0,-39),8*q.size,C[4],alpha*.18);
   if(q.charge>0)p.glow(...P(0,-9),18,C[5],q.charge*.4);
  }
  sparks.draw(p,t);
  const age=t-timing.impact;
  if(age>=0){
   const flash=Math.exp(-age*20);
   p.glow(...center,56,C[4],flash*1.6);p.glow(...center,22,C[6],flash*1.2);
   for(const packet of afterburn.sample(t))drawFlamePacket(p,packet,C,seed+163,.64,true);
   for(const packet of blastFire.sample(t))drawFlamePacket(p,packet,C,seed+151,.92);
   blast.draw(p,t);
   if(age<.075){const a=1-age/.075;p.path([[center[0]-30*a,center[1]],[center[0]+30*a,center[1]]],C[7],a,.8);}
  }
  p.lightK=oldLight;
 }};
}
