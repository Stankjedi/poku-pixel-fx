// Original Spatial Severance reference, refined through rendered comparisons.
// Uses the shared engine without baked images or effect-specific rasterizers.
import { hex, fit, Rng, clamp, smooth, ease, sparkle, pointedRibbon, motionTrail, fly } from "../../core/index.js";
import type { Painter, Point } from "../../core/painter.js";

export const meta = {
  name:'Spatial Severance', desc:'A 54 ms razor punches a white-hot flash through a smooth cyan-violet incision, carries a bright crest along its rim, then seals to a needle.',
  tags:['spatial','slash','rift','ultimate','one-shot'], size:[384,216], origin:[192,108], duration:1.08, loop:false, fps:50, bg:'black',
  options:{seed:1207, palette:['#050611','#0e133b','#283b80','#714bff','#30c8ef','#a5f5ff','#f1ffff'], variant:0, revision:8}
};
export const timing = {speed:10/9, attackStart:.126, impact:.18, sweepMilliseconds:54};
const progress=(t: number,a: number,b: number)=>clamp((t-a)/(b-a));
const out=(t: number,a: number,b: number)=>ease.outQuart(progress(t,a,b));
const vanish=(t: number,a: number,b: number)=>1-smooth(a,b,t);
const H=hex;


type EffectOptions = { [K in keyof typeof meta.options]: (typeof meta.options)[K] extends string[] ? (string | number)[] : (typeof meta.options)[K] };
export function create(o: EffectOptions) {
  const C=fit(o.palette,7), R=new Rng(o.seed), white=C[6], cyan=C[5];
  // Stratified emission creates clear negative space instead of random clusters.
  const sparks=Array.from({length:14},(_,i)=>({
    x:-130+i*17+R.range(-3,3), sign:i%2?-1:1,
    vx:R.range(260,390),vy:(i%2?-1:1)*R.range(150,230)*(1-.35*i/13),
    life:R.range(.21,.36),d:R.range(0,.022),trail:R.range(.055,.085),
    size:R.range(1.1,1.6),col:i%5===0?3:4
  }));
  const chips=Array.from({length:6},(_,i)=>({
    x:-112+i*39+R.range(-5,5),sign:i%2?-1:1,
    vx:R.range(55,85),vy:(i%2?-1:1)*R.range(85,130),
    size:R.range(2.3,3.6),life:R.range(.28,.39),phase:R.range(-.2,.2)
  }));
  const angle=[-.40,-.64,-.18][o.variant]??-.40;
  return {draw(p: Painter,t: number){
    if(t<=0 || t>=meta.duration)return;
    // Ten percent shorter, with the white impact aligned exactly to a 50 fps frame.
    // One shared clock preserves the curved silhouette and deterministic particle paths.
    t*=timing.speed;
    const cs=p.cs,sn=p.sn;
    p.cs=Math.cos(angle)*cs-Math.sin(angle)*sn;
    p.sn=Math.sin(angle)*cs+Math.cos(angle)*sn;
    const cut=progress(t,.14,.20);
    const hot=t>=.199?Math.exp(-Math.max(0,t-.20)*34):0;
    const open=out(t,.19,.25)*vanish(t,.39,.69);
    const fade=vanish(t,.48,.77);
    const L=158*(1-.07*smooth(.5,.74,t));
    const w=13*open;

    if(t>.035 && t<.14){
      const q=progress(t,.035,.14),a=Math.sin(q*Math.PI*.85);
      p.path([[-29*(1-q),0],[25*(1-q),0]],C[5],a*.8,1);
      p.glow(0,0,8,C[4],a*.24);
      sparkle(p,0,0,2+2*q,white,cyan,a);
    }
    // Three short, softly tapered speed lines. No ring or unrelated secondary orbit.
    if(t>=.14 && t<.33){
      const q=progress(t,.14,.22),a=vanish(t,.215,.33);
      for(let i=0;i<3;i++){
        const y=(i===1?-1:1)*(17+i*8),x=-150+i*17+q*25;
        p.cubic([x,y],[x+25*q,y-1],[x+55*q,y-1],[x+(72+i*12)*q,y],C[4],u=>a*Math.sin(Math.PI*u)*.5,1);
      }
    }
    if(open>.001){
      p.glowLine(-145,-1,149,-1,16,C[3],open*.22);
      p.glowLine(-144,-2,149,-2,7,C[4],open*.24);
    }
    // Solid, lit diamond fragments replace noisy hollow triangle outlines.
    for(const f of chips){
      const age=t-.205,q=age/f.life;
      if(q<=0||q>=1)continue;
      const [x,y]=fly(f.x,f.sign*7,f.vx,f.vy,age,0,5.5);
      const a=smooth(0,.035,age)*vanish(q,.30,1),z=f.size*(1-q*.45);
      const tilt=f.phase+q*.45*f.sign;
      const u=[Math.cos(tilt)*z*1.8,Math.sin(tilt)*z*1.8],v=[-Math.sin(tilt)*z*.35,Math.cos(tilt)*z*.35];
      const A: Point=[x+u[0],y+u[1]],B: Point=[x+v[0],y+v[1]],D: Point=[x-u[0],y-u[1]],E: Point=[x-v[0],y-v[1]];
      p.poly([A,B,D,E],C[f.sign<0?4:3],a*.65);
      p.path([D,E,A],C[f.sign<0?5:4],u=>a*(.35+.5*u),.9);
    }
    // A single uninterrupted curved silhouette and continuous razor highlight.
    if(open>.001){
      const outer=pointedRibbon(-L,L,w*1.55,w*.83,-w*.08);
      const inner=pointedRibbon(-L+.8,L-.8,w*.87,w*.39,-w*.04);
      p.poly(outer.shape,C[2],fade*.9);
      p.poly(inner.shape,H('#01020a'),fade);
      p.path(outer.top,C[4],u=>fade*(.68+.32*Math.sin(Math.PI*u)),1.7);
      p.path(outer.bottom,C[3],u=>fade*(.4+.5*Math.sin(Math.PI*u)),1.5);
      p.path(inner.top,C[5],u=>fade*.94*Math.sin(Math.PI*u)**.25,1);
      // White is reserved for one short, traveling crest rather than broken outline speckles.
      const crest=progress(t,.20,.36);
      p.path(outer.top,white,u=>fade*Math.exp(-(((u-(.48+.40*crest))/.19)**2))*vanish(t,.28,.44),1.3);
      if(hot>.3)p.path([[-L*.95,0],[L,0]],white,hot,1);
      const glint=vanish(t,.30,.53);
      if(glint>0)sparkle(p,L,0,3.2,white,cyan,glint*.9);
    }
    // 54 ms attack; curved continuous ribbons retain a sharp, unbroken point.
    if(t>=.14 && t<.20){
      const head=-158+322*(1-(1-cut)**2),tail=-164,width=6+8*cut;
      const outer=pointedRibbon(tail,head,width,width*.33,-2*cut);
      const middle=pointedRibbon(tail,head,width*.64,width*.17,-cut);
      const core=pointedRibbon(tail,head,width*.27,width*.06,0);
      p.poly(outer.shape,C[3]);
      p.poly(middle.shape,C[4]);
      p.poly(core.shape,white);
      p.path(outer.top,C[5],u=>Math.sin(Math.PI*u)*.7,1);
      p.glowLine(Math.max(tail,head-110),0,head,0,7,C[4],.45);
      sparkle(p,head,0,3.5+cut*2,white,cyan,1);
    }
    // Two-frame white impact, then immediate return to readable dark negative space.
    if(hot>.04){
      const z=10.5*hot;
      p.poly(pointedRibbon(-166,168,z*1.8,z*.9).shape,C[4],hot);
      p.poly(pointedRibbon(-164,166,z*1.2,z*.48).shape,white,hot);
      p.glowLine(-155,0,161,0,10,C[4],hot*.55);
      const bx=104;
      p.poly([[bx-1.5,-1],[bx-4,-25*hot],[bx+2,-1],[bx+19*hot,0],[bx+1.5,1],[bx+3,17*hot],[bx-2,1],[bx-20*hot,0]],white,hot);
      // A localized leading-edge flare adds brilliance without a full-screen wash.
      p.glow(156,0,12,C[4],hot*.3);
    }
    // Age-derived trails follow exact damped trajectories and taper toward a bright head.
    for(const s of sparks){
      const age=t-.20-s.d,q=age/s.life;
      if(q<=0||q>=1)continue;
      const a=smooth(0,.012,age)*vanish(q,.18,1);
      const trajectory=(dt: number)=>fly(s.x,s.sign*9,s.vx,s.vy,Math.max(0,dt),s.sign*200,5.5);
      const pts=motionTrail(trajectory,age,s.trail);
      p.path(pts,C[s.col],u=>a*(.15+.85*u*u),s.size);
      p.path(pts.slice(-3),q<.34?white:C[5],u=>a*u,1);
      const [x,y]=pts[pts.length-1];
      if(q<.28)p.glow(x,y,2.4,C[4],a*.10);
    }
    const seal=smooth(.61,.69,t)*vanish(t,.71,.89);
    if(seal>0){
      const len=139*vanish(t,.70,.87);
      p.path([[-len,0],[len,0]],C[5],u=>seal*.8*Math.sin(Math.PI*u)**.25,1);
      p.glowLine(-len,0,len,0,4,C[4],seal*.18);
    }
    const end=smooth(.78,.82,t)*vanish(t,.83,.96);
    if(end>0)sparkle(p,0,0,2.5*end,white,cyan,end*.5);
    p.cs=cs;p.sn=sn;
  }};
}
