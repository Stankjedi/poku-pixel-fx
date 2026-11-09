// Original fresh phoenix: articulated thermal feathers rendered with the POKU painter.
// No raster sprites, old phoenix helpers or image-generation assets are used.
import { fit, hex, Rng, clamp, smooth, lerp, noise2, cubicBezier, createCinematicParticles2D, createThermalRibbon2D, rand } from '../../core/index.js';
import type { Painter, Point } from '../../core/painter.js';
export const meta = {
 name:'Auric Phoenix',desc:'A new frontal firebird with moving thermal feather planes, detached wakes and a chest-driven solar release.',
 tags:['phoenix','fire','cinematic','particles','flight'],size:[480,360],origin:[240,200],duration:5.6,loop:false,fps:30,bg:'black',
 options:{seed:112701,palette:['#180d22','#5e1128','#b12622','#ec4a16','#ff8c22','#ffca51','#ffe89a','#fff8da'],particleDensity:1}
};
export const timing={unfurl:.72,charge:2.28,release:3.28,end:5.6};
type Options=typeof meta.options;
const TAU=Math.PI*2;
const S=(a:number,b:number,t:number)=>smooth(a,b,t);
const B=(u:number)=>Math.sin(Math.PI*clamp(u));
function pose(t:number){
 const open=S(.06,.75,t),charge=S(2.28,3.22,t),beat=Math.sin((t-.30)*TAU/1.22);
 const lift=beat*(1-charge)*.34+charge*.21;
 const size=(.62+.34*S(.1,1.2,t)+.09*S(2.8,3.26,t))*open;
 return {open,charge,lift,size,x:(-17+36*S(.35,1.65,t))*(1-S(1.8,2.7,t)),y:24-35*S(.1,1.9,t)+Math.sin(t*TAU/1.22)*4*(1-charge),bank:Math.sin((t-.2)*2.1)*.10*(1-charge)};
}
function world(x:number,y:number,t:number):Point{const q=pose(t);return[q.x+(x*Math.cos(q.bank)-y*Math.sin(q.bank))*q.size,q.y+(x*Math.sin(q.bank)+y*Math.cos(q.bank))*q.size];}
function wingPoint(x:number,y:number,side:number,t:number):Point{
 const q=pose(t),u=clamp((x-14)/145),angle=-(q.lift+side*.045*Math.sin(t*5))*(.35+.65*u);
 const px=14+(x-14)*Math.cos(angle)-y*Math.sin(angle);
 const py=-12+(x-14)*Math.sin(angle)+y*Math.cos(angle);
 return world(side*px,py,t);
}
function feather(side:number,index:number,t:number,secondary=false):{a:Point,b:Point,c:Point,d:Point,w:number}{
 const q=pose(t),u=index/(secondary?7:10);
 let ax,ay,dx,dy,w;
 if(secondary){ax=14+u*61;ay=-2-u*23;dx=33+u*70;dy=35-u*12;w=10.4-3*u;}
 else{ax=65+36*(1-u);ay=-35+18*u;dx=166-76*u;dy=-85+119*u;w=7+4*Math.sin(u*Math.PI);}
 const wave=Math.sin(t*10-u*5+side*.5)*2.2;
 dx+=wave*(.4+u*.6);dy+=Math.sin(t*7-u*4)*3;
 const bend=secondary?8:-7;
 return{a:wingPoint(ax,ay,side,t),b:wingPoint(ax+(dx-ax)*.34,ay+(dy-ay)*.28+bend,side,t),
 c:wingPoint(ax+(dx-ax)*.73,ay+(dy-ay)*.72+wave,side,t),d:wingPoint(dx,dy,side,t),w:w*q.size};
}
function sampleCurve(f:{a:Point,b:Point,c:Point,d:Point},u:number):Point{
 const v=1-u;return[v*v*v*f.a[0]+3*v*v*u*f.b[0]+3*v*u*u*f.c[0]+u*u*u*f.d[0],v*v*v*f.a[1]+3*v*v*u*f.b[1]+3*v*u*u*f.c[1]+u*u*u*f.d[1]];
}
// All attached flames use longitudinally moving coherent hot folds, not flickering per-frame random pixels.
function fireFeather(p:Painter,path:Point[],width:number,t:number,phase:number,C:number[],alpha:number,back=false){
 const shape=(u:number,v:number)=>{
  const taper=Math.pow(Math.sin(Math.PI*(.07+.93*u)),.56)*(1-.34*u);
  const fold=.07*Math.sin(u*25-t*11+phase)+.06*Math.sin(u*52-t*17-phase);
  const edge=taper+fold*(.15+u*.85);
  if(v>edge)return 0;
  const core=clamp(1-v/Math.max(.1,edge)),heat=core*.63+.22+.15*Math.sin(u*20-t*10+phase)+.1*Math.sin(u*45-t*15+phase);
  const n=Math.floor(clamp(heat-(back?.18:0))*6.6);
  return C[Math.max(1,Math.min(7,n+1))];
 };
 p.path(path,shape,alpha,width*2);
 p.path(path,(u)=>C[u>.86?4:6],(u,v)=>alpha*.65*(1-S(.6,1,u))*B(u+.03),Math.max(.8,width*.15));
 if(!back)p.glowPath(path,Math.max(4,width*1.7),C[4],alpha*.18);
}
function crown(p:Painter,t:number,C:number[],alpha:number){
 const q=pose(t),P=(x:number,y:number)=>world(x,y,t);
 const head=cubicBezier(P(-7,-24),P(-11,-48),P(8,-51),P(7,-25));
 fireFeather(p,head,7*q.size,t,4,C,alpha);
 // Curved brow and beak remain graphic anchors amid the flames.
 const beak=[P(-3,-35),P(4,-37),P(7,-32),P(1,-28),P(-1,-33)];
 p.poly(beak,C[6],alpha);p.path([P(1,-33),P(6,-32)],C[1],alpha,1);
 p.path([P(-7,-41),P(-3,-39),P(-1,-39)],C[1],alpha,2);p.line(...P(-5,-40),...P(-2,-39),C[7],alpha);
 p.path([P(1,-39),P(4,-40),P(7,-42)],C[1],alpha,2);p.line(...P(2,-39),...P(5,-40),C[7],alpha);
 for(let k=0;k<3;k++){
  const x=(k-1)*5,ap=P(x,-43),end=P(x*2+Math.sin(t*7+k)*2,-62-(k===1?8:0));
  fireFeather(p,cubicBezier(ap,P(x-2,-48),P(x*1.6,-55),end),(k===1?3:2.4)*q.size,t,k+8,C,alpha);
 }
}
export function create(o:Options){
 const C=fit(o.palette,8),R=new Rng(o.seed);
 const atmosphere=Array.from({length:190},(_,i)=>({x:R.range(-212,212),y:R.range(-90,130),phase:R.range(0,TAU),r:R.range(.4,1.2),speed:R.range(3,10)}));
 const source=(birth:number,id:number,u:number):Point=>sampleCurve(feather(id%2?1:-1,Math.floor(u*11),birth),.35+.65*rand(o.seed,id,5));
 const inherited=(birth:number,id:number,u:number):Point=>{const a=source(birth,id,u),b=source(Math.max(0,birth-.016),id,u);return[(a[0]-b[0])/.016*.38+(id%2?1:-1)*12,(a[1]-b[1])/.016*.32+16];};
 const wakeBack=createCinematicParticles2D({count:Math.round(2200*o.particleDensity),seed:o.seed+41,palette:[C[6],C[5],C[4],C[3],C[2]],
  source,inheritedVelocity:inherited,start:.14,duration:3.05,life:[.28,.85],speed:[8,32],angle:Math.PI/2,spread:1.7,drag:1.6,gravity:-18,
  size:[.6,1.7],endSize:.32,style:'spark',trailSeconds:.055,trailSamples:5,emission:.10,lightRadius:3,curl:{amplitude:7,frequency:1.2},layer:'back'});
 const wakeFront=createCinematicParticles2D({count:Math.round(240*o.particleDensity),seed:o.seed+70,palette:[C[7],C[6],C[4],C[2]],
  source,inheritedVelocity:inherited,start:.28,duration:2.95,life:[.20,.64],speed:[15,45],angle:-Math.PI/2,spread:2.2,drag:1.2,gravity:-6,
  size:[1.2,2.4],endSize:.25,style:'ribbon',trailSeconds:.10,trailSamples:6,emission:.10,lightRadius:4,curl:{amplitude:9,frequency:.85},layer:'front'});
 const wingFlame=createCinematicParticles2D({count:880,seed:o.seed+51,palette:[C[6],C[5],C[4],C[3],C[1]],
  source:(birth,id,u)=>sampleCurve(feather(id%2?1:-1,Math.floor(u*11),birth),.8+.2*rand(o.seed,id,8)),
  inheritedVelocity:(birth,id,u)=>{const v=inherited(birth,id,u);return[v[0]+(id%2?1:-1)*15,v[1]-18];},
  start:.2,duration:2.99,life:[.3,.9],speed:[10,35],angle:-Math.PI/2,spread:2,drag:.8,gravity:-8,size:[1.4,3.5],endSize:.18,
  style:'ribbon',trailSeconds:.105,trailSamples:6,emission:.11,lightRadius:4,curl:{amplitude:12,frequency:.7},layer:'back'});
 const explosion=createCinematicParticles2D({count:1250,seed:o.seed+99,palette:[C[7],C[6],C[5],C[4],C[2]],source:world(0,-5,timing.release),
  start:timing.release,duration:.14,life:[.45,2.05],speed:[90,290],spread:TAU,drag:2.0,gravity:15,size:[.6,2.2],endSize:.2,
  style:'spark',trailSeconds:.075,trailSamples:5,emission:.12,lightRadius:3,curl:{amplitude:5,frequency:.6}});
 // The wing material is now finite, unequal flame fronts. Existing sparks remain unchanged.
 const wingSource=(t:number,id:number,u:number)=>{
  const f=feather(id%2?1:-1,Math.floor((id%22)/2),t);
  return cubicBezier(f.a,f.b,f.c,f.d);
 };
 const thermalWings=createThermalRibbon2D({seed:o.seed+204,count:264,start:.08,duration:3.14,source:wingSource,
  palette:[C[6],C[5],C[4],C[3],C[2]],life:[.52,.82],width:[6.2,13.1],length:[.55,1.15],curl:5.2,split:.9,emission:.14,
  velocity:(t,id,u)=>{const a=sampleCurve(feather(id%2?1:-1,Math.floor((id%22)/2),t),.75),b=sampleCurve(feather(id%2?1:-1,Math.floor((id%22)/2),t-.015),.75);return[(a[0]-b[0])/.015*.25,(a[1]-b[1])/.015*.25-10];}});
 const thermalUnder=createThermalRibbon2D({seed:o.seed+311,count:160,start:.08,duration:3.14,
  source:(t,id,u)=>{const f=feather(id%2?1:-1,Math.floor((id%16)/2),t,true);return cubicBezier(f.a,f.b,f.c,f.d);},
  palette:[C[6],C[5],C[4],C[3],C[2]],life:[.48,.74],width:[5,10.4],length:[.55,1.07],curl:5.8,split:.8,emission:.07,velocity:[0,-9]});
 const shoulderFlow=createThermalRibbon2D({seed:o.seed+401,count:46,start:.05,duration:3.17,
  source:(t,id,u)=>{const side=id%2?1:-1;return cubicBezier(wingPoint(9,-5,side,t),wingPoint(34,-27,side,t),wingPoint(67,-34,side,t),wingPoint(109,-52,side,t));},
  palette:[C[6],C[5],C[4],C[3],C[2]],life:[.32,.61],width:[3.5,8],length:[.34,.92],curl:4.3,split:.65,emission:.12,velocity:[0,-10]});
 const smoke=Array.from({length:24},(_,i)=>({a:i/24*TAU,r:R.range(15,28),v:R.range(65,125),phase:R.range(0,TAU)}));
 return {draw(p:Painter,t:number){
  if(t<=0||t>=meta.duration)return;
  const life=S(0,.30,t)*(1-S(5.0,5.6,t)),q=pose(t),bird=1-S(3.28,3.42,t);
  // Sparse far-plane rising dust makes depth readable without a pasted background.
  for(const f of atmosphere){const a=.28*(.6+.4*Math.sin(t*2+f.phase))*life;p.dot(f.x+Math.sin(t*.3+f.phase)*3,f.y-t*f.speed,C[3],a);}
  if(t<3.4){
   const aura=S(.08,.55,t)*bird;
   p.glow(q.x,q.y,104,C[2],aura*.12);p.glow(q.x,q.y-2,38,C[4],aura*(.25+q.charge*.25));
  }
  wakeBack.draw(p,t);wingFlame.draw(p,t);
  if(bird>.001&&q.open>.01){
   const alpha=bird*S(.05,.5,t);
   // Lagging tail feathers are connected to the moving rump, not a static exhaust.
   for(let i=0;i<5;i++){
    const z=(i-2),a=world(z*2,18,t),b=world(z*8+Math.sin(t*5-i)*4,54,t),c=world(z*18+Math.sin(t*5.5-i)*8,85,t),d=world(z*20+Math.sin(t*6-i)*9,117-Math.abs(z)*12,t);
    fireFeather(p,cubicBezier(a,b,c,d),(5.1-Math.abs(z)*.7)*q.size,t,i*1.7,C,alpha*(i%2?.8:1),i%2===1);
   }
   const priorFade=p.fade;p.fade*=alpha;
   thermalUnder.draw(p,t);thermalWings.draw(p,t);shoulderFlow.draw(p,t);
   p.fade=priorFade;
   // A broad chest and pinched neck preserve avian anatomy inside the light.
   p.shade(q.x-18*q.size,q.y-37*q.size,q.x+18*q.size,q.y+35*q.size,(xx,yy,out)=>{
    const rx=(xx-q.x)/q.size,ry=(yy-q.y)/q.size,y=ry*Math.cos(q.bank)-rx*Math.sin(q.bank),x=rx*Math.cos(q.bank)+ry*Math.sin(q.bank);
    const width=y< -22?6.5:y< -6?lerp(6.5,13,(y+22)/16):y<12?13-2*(y+6)/18:Math.max(0,11*(1-(y-12)/23));
    const wav=.7*Math.sin(y*.45-t*7)+.4*Math.sin(y*.8+t*5),edge=width+wav;
    if(Math.abs(x)>edge)return;
    const center=.5+Math.sin(y*.11-t*3)*2.1,heat=clamp(1-Math.abs(x-center)/Math.max(1,edge))*.65+.2+.1*Math.sin(y*.6-t*9+x*.4);
    out.c=C[Math.max(1,Math.min(7,Math.floor(heat*7.8)))];out.a=alpha;
   });
   p.glow(...world(0,-3,t),22*q.size,C[4],alpha*.35);
   crown(p,t,C,alpha);
   // Paired claws, kept subordinate to the face and central flame mass.
   for(const side of [-1,1]){
    const a=world(side*5,15,t),b=world(side*13,22,t),c=world(side*12,28,t);
    p.path([a,b,c],C[4],alpha,2);for(let j=0;j<3;j++)p.path([c,world(side*(10+j*3),30+j,t)],C[6],alpha,.9);
   }
   // Inward streaming charge has a destination: the chest, then one release.
   if(q.charge>0){
    const core=world(0,-5,t);p.glow(...core,18+q.charge*14,C[5],q.charge*.75);
    for(let k=0;k<22;k++){
     const phase=(t*2.1+k*.618)%1,side=k%2?1:-1,fr=feather(side,k%11,t),a=sampleCurve(fr,.8),u=1-(1-phase)**2;
     const x=lerp(a[0],core[0],u),y=lerp(a[1],core[1],u)+Math.sin(phase*Math.PI)*7;
     p.line(x+(a[0]-core[0])*.045,y+(a[1]-core[1])*.045,x,y,C[6],q.charge*B(phase));
    }
    p.circle(...core,2+q.charge*3,C[7],q.charge);
   }
  }
  wakeFront.draw(p,t);
  const age=t-timing.release;
  if(age>=0){
   const center=world(0,-5,timing.release),flash=Math.exp(-age*21);
   p.glow(...center,100,C[4],flash*1.2);p.glow(...center,42,C[6],flash*1.5);
   if(age<.72){
    const radius=14+75*(1-Math.exp(-age*4.6)),opacity=1-S(.19,.72,age);
    p.shade(center[0]-radius*1.3,center[1]-radius,center[0]+radius*1.3,center[1]+radius,(x,y,out)=>{
     const dx=(x-center[0])/1.2,dy=y-center[1],d=Math.hypot(dx,dy)/radius,a=Math.atan2(dy,dx);
     const edge=.84+.09*Math.sin(a*7+age*4)+.07*Math.sin(a*13-age*5);
     if(d>edge)return;
     const n=noise2(dx*.095+age*1.3,dy*.095-age*2.3,o.seed),m=noise2(dx*.043-age*2,dy*.043+age*.4,o.seed+4);
     const holes=S(.17,.61,age)*.74;if(n*.55+m*.45<holes)return;
     const hot=clamp((1-d)*.45+n*.25+m*.25+.23-age*.38);
     out.c=C[Math.max(1,Math.min(7,Math.floor(hot*7.6)))];out.a=opacity;
    });
    p.glow(...center,radius*1.5,C[4],opacity*.32);
   }
   // Broken, expanding fire fronts: angular sectors are independently curled and consumed.
   for(const f of smoke){
    const r=15+f.v*1.7*(1-Math.exp(-age*2.1))/2.1,theta=f.a+.14*Math.sin(age*3+f.phase);
    const x=center[0]+Math.cos(theta)*r*1.30,y=center[1]+Math.sin(theta)*r*.82;
    const a=S(0,.025,age)*(1-S(.24,.92,age));
    const radius=f.r*(.55+age*.55);
    if(a>0){
     p.disc(x,y,radius,C[1],(d:number)=>a*.22*(1-d));
     const root:Point=[center[0]+Math.cos(theta-.10)*r*.30,center[1]+Math.sin(theta-.10)*r*.24];
     const tip:Point=[x,y],b:Point=[center[0]+Math.cos(theta+.13)*r*.65,center[1]+Math.sin(theta+.13)*r*.47];
     const c:Point=[center[0]+Math.cos(theta-.1)*r,center[1]+Math.sin(theta-.1)*r*.62];
     fireFeather(p,cubicBezier(root,b,c,tip),(7+f.r*.2)*(1-S(.3,.92,age)),t*1.2,f.phase,C,a,false);
    }
   }
   explosion.draw(p,t);
   if(age<.09){const z=1-age/.09;p.line(center[0]-60*z,center[1],center[0]+60*z,center[1],C[7],z*.85);p.circle(...center,11*z,C[7],z);}
  }
 }};
}
