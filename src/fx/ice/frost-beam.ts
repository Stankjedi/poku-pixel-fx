import type { Painter } from '../../core/painter.js';
import { Rng, fit, clamp, smooth, lerp, defineImpactContact2D, impactContactAge2D, frostAccretion2D,
  glassShardPath, glassVertices, type FrostPoint2D, type GlassPoint } from '../../core/index.js';

export const meta = {
  name: 'Frost beam',
  desc: 'A freezing jet stops at metal. Frost spreads across the face, grows attached crystal branches, then fractures into falling flakes that tick across the floor.',
  tags: ['ice', 'frost', 'beam', 'freeze', 'metal', 'contact', 'fracture', 'directional', 'one-shot'],
  size: [320, 176], origin: [160, 145], duration: 3.5, loop: false, fps: 30, bg: 'ground',
  options: { palette: ['#122a40','#244d68','#367f9b','#61b8ca','#a0dce0','#d6f8ee','#f7fff6'],
    surfacePalette: ['#19242c','#30424c','#4a6169','#76868a'], seed: 31, power: 1, roots: 9, surface: true },
};
type Options = Omit<typeof meta.options, 'palette' | 'surfacePalette'> & { palette: (number | string)[]; surfacePalette: (number | string)[] };
export const FROST_BEAM_CONTACT_TIME = .48, FROST_BEAM_OFF_TIME = 1.34;
const START = .28, MUZZLE = -112, HIT_X = 64, HIT_Y = -45;
const contact = (o: Options) => defineImpactContact2D({ id:'frost-beam-metal', at:FROST_BEAM_CONTACT_TIME,
  position:[HIT_X,HIT_Y], normal:[-1,0], material:'metal', strength:clamp(Number.isFinite(o.power)?o.power:1,.65,1.35), radius:5 });
export const contacts = (o: Options) => [contact(o)];
const mutable = (points: readonly FrostPoint2D[]): [number,number][] => points.map(p=>[p[0],p[1]]);

export function create(o: Options) {
  const hit=contact(o), C=fit(o.palette,7), M=fit(o.surfacePalette,4), rng=new Rng(o.seed), power=hit.strength;
  const frost=frostAccretion2D(hit,{seed:o.seed,count:Math.round(clamp(Number.isFinite(o.roots)?o.roots:9,7,15)),halfSpan:37,
    length:21*power,exposure:FROST_BEAM_OFF_TIME-hit.at,spreadSpeed:85,hold:.28});
  const flakes=frost.branches.map((branch,index)=>{
    const sample=frost.sample(index,branch.releasesAt), polygon=sample.polygon;
    const x=polygon.reduce((sum,p)=>sum+p[0],0)/polygon.length,y=polygon.reduce((sum,p)=>sum+p[1],0)/polygon.length;
    const shape=polygon.map(p=>[p[0]-x,p[1]-y] as GlassPoint), release=branch.releasesAt;
    const path=glassShardPath(shape,{x,y,vx:-rng.range(9,46)*power,vy:rng.range(-17,13),spin:rng.range(-4,4),tumbleSpeed:rng.range(-5,5)},
      {duration:meta.duration-release,gravity:280,drag:.65,bounce:.17,friction:.67});
    return {branch,index,shape,release,path};
  });
  const snow=Array.from({length:24},(_,i)=>({at:hit.at+i*.036,x:hit.position[0],y:HIT_Y+rng.range(-4,4),vx:-rng.range(18,55),vy:rng.range(-38,32),life:rng.range(.35,.64),phase:rng.range(0,6)}));
  const ribs=Array.from({length:12},(_,i)=>({offset:i/12*176+rng.range(-4,4),length:rng.range(4,8),sign:i%2?-1:1,tone:rng.int(3,5)}));
  const striations=Array.from({length:14},()=>({x:rng.range(HIT_X+1,HIT_X+14),y:rng.range(-86,-5),length:rng.range(3,10)}));
  function surface(p:Painter,t:number,fade:number) {
    if(!o.surface)return;
    // An intact metal test plate: its darker side remains visible throughout the frost failure.
    p.poly([[HIT_X,-88],[HIT_X+15,-94],[HIT_X+25,-87],[HIT_X+25,-2],[HIT_X+14,3],[HIT_X,0]],M[0],fade);
    p.poly([[HIT_X,-88],[HIT_X+15,-94],[HIT_X+15,-5],[HIT_X,0]],M[2],fade);
    p.poly([[HIT_X+15,-94],[HIT_X+25,-87],[HIT_X+25,-2],[HIT_X+15,3]],M[1],fade);
    p.line(HIT_X,-88,HIT_X+15,-94,M[3],fade);
    p.line(HIT_X+15,-94,HIT_X+15,3,M[3],fade*.65);
    for(const s of striations)p.line(s.x,s.y,s.x,s.y+s.length,M[1],fade*.4);
    for(const y of [-80,-12]){p.rect(HIT_X+6,y,3,3,M[0],fade);p.line(HIT_X+6,y,HIT_X+8,y,M[3],fade*.8);}
    // Frost is deposited on this receiving face only. A diffuse surface stain is not emissive gas.
    const age=impactContactAge2D(hit,t), reach=clamp(age*85,0,40), coat=(1-smooth(2.62,3.3,t))*fade;
    if(age>=0) p.shade(HIT_X,-87,HIT_X+14,-2,(x,y,out)=>{
      const vertical=Math.abs(y-HIT_Y), width=10*(1-clamp(vertical/Math.max(1,reach)))+2;
      if(vertical>reach||x-HIT_X>width)return;
      const rib=(Math.floor(y*1.7)+Math.floor(x*.8))%7;
      out.c=vertical>reach-2?C[5]:rib===0?C[4]:C[2];out.a=coat*(rib===0?.78:.44);
    });
    // Fine surface dendrites run vertically with the advancing cooling front, never across empty air.
    if(age>=0)for(const sign of [-1,1]){
      const end=Math.min(38,reach),x=HIT_X+3;
      p.line(x,HIT_Y,x,HIT_Y+end*sign,C[4],coat*.8);
      for(let d=6;d<end;d+=7){const len=Math.min(5,end-d);p.line(x,HIT_Y+d*sign,x+len,HIT_Y+(d+len)*sign,C[5],coat*.8);}
    }
  }
  function crystal(p:Painter,polygon:readonly FrostPoint2D[],alpha:number,index:number,fracture=0,facing=1){
    const [root,left,tip,right]=polygon;
    p.poly(mutable(polygon),C[1],alpha*.97);
    p.tri(root[0],root[1],left[0],left[1],tip[0],tip[1],C[4],alpha*.92);
    p.tri(root[0],root[1],tip[0],tip[1],right[0],right[1],C[index%3?2:3],alpha*.9);
    p.line(root[0],root[1],tip[0],tip[1],C[5],alpha*.95);
    p.line(left[0],left[1],tip[0],tip[1],C[facing>.55?6:4],alpha*.86);
    if(fracture>0){
      const u=.3+index%3*.1,x=lerp(root[0],tip[0],u),y=lerp(root[1],tip[1],u);
      p.line(x-1,y-2,x+1,y+2,C[0],alpha*fracture);
      p.line(x-2,y-2,x,y+2,C[6],alpha*fracture*.7);
    }
  }
  return {
    drawBack(p:Painter,t:number){
      if(t>=meta.duration)return;
      const fade=1-smooth(3.05,meta.duration,t);
      if(o.surface)p.ellipse(HIT_X+10,2,24,2.3,M[0],fade*.38);
      for(const s of flakes){if(t<s.release)continue;const pose=s.path.sample(t-s.release);p.ellipse(pose.x,1,3.5,.6,C[0],fade*.12*(1-clamp(-pose.y/90)));}
    },
    draw(p:Painter,t:number){
      t=Math.round(t*1e9)/1e9;if(t>=meta.duration)return;
      const fade=1-smooth(3.05,meta.duration,t),age=impactContactAge2D(hit,t);
      surface(p,t,fade);
      // Bound shards inherit their actual grown shape, not generic diamonds spawned at a center point.
      for(const s of flakes){
        if(t<s.release){const sample=frost.sample(s.index,t);if(sample.growth>0)crystal(p,sample.polygon,fade,s.index,sample.fracture);}
        else {const pose=s.path.sample(t-s.release),vertices=glassVertices(s.shape,pose);crystal(p,vertices,fade*(1-smooth(2.8+s.index%3*.07,3.45,t)),s.index,0,Math.cos(pose.tumble)*.5+.5);}
      }
      // Short charge is a narrow prismatic mouth; no circular magic sigil added to the ice shape.
      const charge=smooth(0,.20,t)*(1-smooth(FROST_BEAM_OFF_TIME-.05,FROST_BEAM_OFF_TIME+.16,t));
      if(charge>0){
        p.poly([[MUZZLE-7,HIT_Y],[MUZZLE-1,HIT_Y-5*charge],[MUZZLE+8,HIT_Y],[MUZZLE-1,HIT_Y+5*charge]],C[2],charge);
        p.line(MUZZLE-5,HIT_Y,MUZZLE+6,HIT_Y,C[6],charge);
        p.glow(MUZZLE,HIT_Y,12,C[3],charge*.24);
      }
      // Advancing front and retreating tail both terminate at the same authored contact plane.
      const head=lerp(MUZZLE,HIT_X,clamp((t-START)/(hit.at-START)));
      const tail=t<FROST_BEAM_OFF_TIME?MUZZLE:lerp(MUZZLE,HIT_X,clamp((t-FROST_BEAM_OFF_TIME)/.11));
      if(t>=START&&tail<head){
        const ramp=smooth(START,START+.035,t),width=(3.1+power)*ramp, pulse=Math.sin(t*25);
        const top:[number,number][]=[],bottom:[number,number][]=[];
        for(let x=tail;x<head;x+=7){const w=width*(.74+.21*Math.sin(x*.12-t*20));top.push([x,HIT_Y-w]);bottom.push([x,HIT_Y+w*.85]);}
        top.push([head,HIT_Y-width]);bottom.push([head,HIT_Y+width]);p.poly([...top,...bottom.reverse()],C[2],.83);
        p.poly([[tail,HIT_Y-1],[head,HIT_Y-2.1],[head,HIT_Y+.5],[tail,HIT_Y+1]],C[4],.9);
        p.line(tail,HIT_Y-.5,head,HIT_Y-.5,C[5],.9);
        // Slanted refraction ribs run with the flow; separated down-facing fragments read as frozen spray.
        for(const rib of ribs){
          const x=MUZZLE+((rib.offset+t*190)%176);if(x<tail+3||x>head-3)continue;
          const sign=rib.sign,l=rib.length,y=HIT_Y+sign*(width-1);
          p.poly([[x-l,y],[x+3,y-sign*2],[x+1,y+sign*2.3],[x-l-4,y+sign*.5]],C[rib.tone],.88);
          if(rib.tone===5)p.line(x-l,y,x+1,y-sign,C[6],.9);
        }
        p.glowLine(tail,HIT_Y,head,HIT_Y,7,C[3],.18);
        // Cold haze sags below the jet. It never rises like heated smoke or crosses the receiving plate.
        for(let i=0;i<8;i++){
          const x=MUZZLE+((i*23+t*102)%176),y=HIT_Y+5+Math.sin(i+t*9)*1.7;if(x<tail||x>head-8)continue;
          p.disc(x,y,4.6,C[3],d=>.16*(1-d*d));
        }
        if(age>=0){
          p.poly([[HIT_X,HIT_Y-8],[HIT_X-5,HIT_Y-3],[HIT_X-12,HIT_Y-7],[HIT_X-7,HIT_Y],[HIT_X-11,HIT_Y+7],[HIT_X-4,HIT_Y+3],[HIT_X,HIT_Y+9]],C[4],.9);
          p.line(HIT_X-4,HIT_Y-3,HIT_X,HIT_Y,C[6]);p.line(HIT_X,HIT_Y,HIT_X-4,HIT_Y+3,C[6]);
          p.glow(HIT_X-3,HIT_Y,12,C[4],.2+.025*pulse);
        }
      }
      // Sparse reflected snow chips: short descending arcs, not hot sparks or a radial shock ring.
      for(const s of snow){const a=t-s.at;if(a<0||a>s.life)continue;const u=a/s.life,x=s.x+s.vx*a,y=s.y+s.vy*a+54*a*a;
        p.line(x,y,x-1.3,y+1.1,C[u<.4?5:3],(1-u)*.8);}
      // Secondary floor contact comes from the actual polygon support; no dust is emitted by ice flakes.
      for(const s of flakes)for(const impact of s.path.impacts){
        const a=t-s.release-impact.time;if(a<0||a>.11||s.index%5||impact.speed<95)continue;
        const k=1-a/.11;p.line(impact.x-2-a*13,-1-a*12,impact.x-1-a*13,-2-a*12,C[5],k);
        p.dot(impact.x+1+a*19,-1-a*7,C[4],k);
      }
    },
  };
}
