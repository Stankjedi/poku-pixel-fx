import type { Painter } from '../../core/painter.js';
import { Rng, fit, clamp, smooth, lerp, mix, defineImpactContact2D, impactContactAge2D,
  surfaceCorrosion2D, liquidMotion, liquidImpactTime } from '../../core/index.js';

export const meta = {
  name: 'Acid splash',
  desc: 'Green fluid flattens against metal and drains in narrow runs. Attached bubbles collapse to reveal a pitted surface. Stylized fantasy corrosion, not chemistry.',
  tags: ['nature','acid','corrosion','liquid','metal','contact','surface','directional','one-shot'],
  size:[264,160],origin:[132,136],duration:3.4,loop:false,fps:30,bg:'ground',
  options:{palette:['#122016','#24471b','#3f6d24','#6a9b2d','#9bc64a','#cde36d','#eff5ae'],
    surfacePalette:['#202a32','#344750','#52656b','#899796','#bdc4b5'],seed:6,power:1,surface:true},
};
type Options=Omit<typeof meta.options,'palette'|'surfacePalette'>&{palette:(number|string)[];surfacePalette:(number|string)[]};
export const ACID_CONTACT_TIME=.46;
const HX=30,HY=-49,TOP=-87,BOTTOM=-1,WIDTH=36,LAUNCH=-93;
const hitFor=(o:Options)=>defineImpactContact2D({id:'acid-metal-contact',at:ACID_CONTACT_TIME,
  position:[HX,HY],normal:[-1,0],material:'metal',radius:6,strength:clamp(Number.isFinite(o.power)?o.power:1,.65,1.3)});
export const contacts=(o:Options)=>[hitFor(o)];

export function create(o:Options){
  const hit=hitFor(o),C=fit(o.palette,7),M=fit(o.surfacePalette,5),rng=new Rng(o.seed),power=hit.strength;
  const mask={w:WIDTH,h:BOTTOM-TOP+1,data:new Uint8Array(WIDTH*(BOTTOM-TOP+1)).fill(1)};
  // Rivets and a raised frame remain legible; film only attaches to the recessed receiving face.
  for(let j=0;j<mask.h;j++)for(let i=0;i<mask.w;i++)if(i>32||j<3||j>mask.h-4)mask.data[j*mask.w+i]=0;
  const field=surfaceCorrosion2D(hit,{x:HX,y:TOP,mask},{seed:o.seed,reach:44*power,spreadSpeed:76,wetFor:1.04,dryFor:.68});
  const candidates=field.cells.map((cell,index)=>({cell,index})).filter(({cell})=>!cell.edge&&cell.dose>.28&&cell.x<HX+24&&cell.y>TOP+10&&cell.y<BOTTOM-10);
  const bubbles=Array.from({length:22},(_,i)=>{
    const q=candidates[rng.int(0,candidates.length-1)],startsAt=Math.max(hit.at+.31,q.cell.startsAt+rng.range(.18,.72)),life=rng.range(.25,.42);
    return {...q,startsAt,life,r: rng.range(1.7,3.1),tone:i%3};
  });
  const drops=Array.from({length:15},(_,i)=>{
    const vx=-rng.range(22,90)*power,vy=rng.range(-67,37),start=hit.at+rng.range(.025,.13),x=HX-2,y=HY+rng.range(-9,9),g=245;
    const launch={x,h:-y,vx,vh:-vy},physics={gravity:g,drag:.55};
    const land=liquidImpactTime(launch,physics),landing=liquidMotion(launch,land,physics);
    return{x,y,vx,vy,start,g,launch,physics,land,landing,r:rng.range(1,2.3)};
  });
  const runnels=Array.from({length:3},(_,i)=>({x:HX+4+i*7,length:rng.range(24,43),startsAt:hit.at+.19+i*.085,width:i%2?1:1.5}));
  const byPosition=new Map(field.cells.map((c,i)=>[`${c.x},${c.y}`,i]));
  const vapor=Array.from({length:7},(_,i)=>({x:HX+3+rng.range(0,18),y:HY+rng.range(-10,19),start:hit.at+.37+i*.14,life:rng.range(.42,.62),bend:rng.range(1,3),phase:rng.range(0,6)}));
  const fadeAt=(t:number)=>1-smooth(2.97,meta.duration,t);
  function droplet(p:Painter,x:number,y:number,rx:number,ry:number,alpha=1){
    p.ellipse(x,y,rx,ry,C[1],alpha);p.ellipse(x-.3,y-.4,rx*.72,ry*.8,C[4],alpha);
    if(rx>1.2)p.line(x-rx*.3,y-ry*.52,x,y-ry*.52,C[6],alpha);
  }
  function surface(p:Painter,t:number,fade:number){
    if(o.surface){
      p.poly([[HX-2,TOP-2],[HX+WIDTH,TOP-2],[HX+WIDTH+8,TOP+4],[HX+WIDTH+8,BOTTOM+4],[HX+WIDTH,BOTTOM+1],[HX-2,BOTTOM+1]],M[0],fade);
      p.rect(HX-1,TOP-1,WIDTH+1,BOTTOM-TOP+2,M[2],fade);
      p.poly([[HX+WIDTH,TOP-1],[HX+WIDTH+8,TOP+4],[HX+WIDTH+8,BOTTOM+4],[HX+WIDTH,BOTTOM+1]],M[1],fade);
      p.line(HX-1,TOP-1,HX+WIDTH,TOP-1,M[4],fade);p.line(HX+WIDTH,TOP,HX+WIDTH,BOTTOM,M[3],fade);
      p.line(HX-1,TOP,HX-1,BOTTOM,M[3],fade);
      for(const y of [TOP+5,BOTTOM-6])for(const x of [HX+5,HX+WIDTH-6]){
        p.rect(x-1,y-1,3,3,M[0],fade);p.line(x-1,y-1,x,y-1,M[4],fade);
      }
      for(let y=TOP+15;y<BOTTOM-12;y+=13)p.line(HX+28,y,HX+32,y+2,M[1],fade*.55);
    }
    // Film and etched color use exactly the same masked surface cells; never an emissive hole.
    for(let i=0;i<field.cells.length;i++){
      const cell=field.cells[i],s=field.sample(i,t);if(!s.active&&s.etch<=0)continue;
      if(s.etch>.06)p.dot(cell.x,cell.y,cell.pit>.45?M[0]:mix(M[1],C[1],.3),fade*s.etch);
      if(s.wet>.025){
        const tone=cell.x-HX<2?5:cell.pit>.5?2:3;
        p.dot(cell.x,cell.y,C[tone],fade*s.wet*.9);
      }
      if(s.etch>.28&&cell.pit>.6&&(Math.floor(cell.y)%3===0)&&byPosition.has(`${cell.x},${cell.y+1}`))p.dot(cell.x,cell.y+1,M[3],fade*s.etch*.43);
    }
  }
  return{
    drawBack(p:Painter,t:number){if(t>=meta.duration)return;const fade=fadeAt(t);
      if(o.surface)p.ellipse(HX+20,2,27,2,M[0],fade*.35);
      for(const d of drops){const a=t-d.start-d.land;if(a<0)continue;
        const x=d.landing.x,r=(d.r*2+1)*smooth(0,.09,a),wet=1-smooth(.35,.95,a);
        p.ellipse(x,1,r,Math.max(.6,r*.22),C[1],fade*.7);
        if(wet>0){p.ellipse(x,0,r*.87,Math.max(.5,r*.17),C[3],fade*wet*.9);p.line(x-r*.45,-1,x+r*.25,-1,C[5],fade*wet);}
      }
    },
    draw(p:Painter,t:number){
      t=Math.round(t*1e9)/1e9;if(t>=meta.duration)return;const fade=fadeAt(t),age=impactContactAge2D(hit,t);
      surface(p,t,fade);
      if(t<hit.at){
        const u=clamp(t/hit.at),x=lerp(LAUNCH,HX-6,u),y=lerp(HY-19,HY,u*u),rx=6,ry=4.2;
        // Thick teardrop head and a connected viscous tail. Its visible nose reaches contact exactly.
        p.poly([[x+rx,y],[x+2,y-ry],[x-8,y-3],[x-20,y-5],[x-9,y+2],[x+1,y+ry]],C[1]);
        p.poly([[x+rx-1,y],[x+1,y-ry+1],[x-8,y-2],[x-13,y-3],[x-7,y+1],[x+1,y+ry-1]],C[4]);
        p.line(x-8,y-2,x+2,y-2,C[6]);
        for(let i=1;i<=2;i++)droplet(p,x-22-i*6,y-4-i,1.1,1);
        p.glow(x,y,11,C[4],.12);
      }
      // Impact spreads sideways along the receiving surface then pulls back into heavy lips.
      // No radial white flash, spark system, shock ring or camera shake is used.
      if(age>=0&&age<.34){
        const k=Math.sin(Math.PI*clamp(age/.34)),reach=3+19*k,h=5+23*k;
        p.poly([[HX+1,HY-h],[HX-3,HY-h*.8],[HX-reach*.52,HY-h*.63],[HX-reach*.78,HY-h*.8],[HX-reach,HY-h*.42],[HX-reach*.86,HY-3],[HX-reach*.9,HY+8],[HX-reach*.5,HY+h*.66],[HX-3,HY+h*.75],[HX+1,HY+h]],C[1],fade);
        p.poly([[HX,HY-h*.94],[HX-3,HY-h*.67],[HX-reach*.6,HY-h*.58],[HX-reach*.77,HY-h*.45],[HX-reach*.77,HY],[HX-reach*.68,HY+8],[HX-3,HY+h*.6],[HX,HY+h*.9]],C[4],fade);
        p.line(HX-2,HY-h*.6,HX-reach*.57,HY-h*.55,C[6],fade);
        p.line(HX-reach*.57,HY-h*.55,HX-reach*.72,HY-h*.43,C[5],fade);
        droplet(p,HX-reach*.7,HY-h*.55,2.2*k,2.8*k,fade);
        droplet(p,HX-reach*.69,HY+8,2.6*k,3.2*k,fade);
        p.glow(HX-4,HY,14,C[4],.17*k);
      }
      for(const r of runnels){const a=t-r.startsAt;if(a<0)continue;
        const end=Math.floor(Math.min(BOTTOM-5,HY+r.length*smooth(0,.72,a))),startY=Math.ceil(HY+3+Math.max(0,a-.55)*24),wet=1-smooth(.9,1.55,a);
        if(wet<=0||startY>=end)continue;
        let lastX=r.x,lastY=startY,drawn=false;
        for(let y=startY;y<=end;y++){
          const x=r.x+(Math.floor((y-HY)/11)%2),i=byPosition.get(`${x},${y}`);
          if(i===undefined||field.sample(i,t).wet<.03)continue;
          p.dot(x,y,C[1],fade*wet);p.dot(x-1,y,C[4],fade*wet*.8);lastX=x;lastY=y;drawn=true;
        }
        if(drawn)droplet(p,lastX,lastY,r.width,1.8,fade*wet);
      }
      for(const b of bubbles){const a=t-b.startsAt;if(a<0||a>b.life+.08)continue;
        const state=field.sample(b.index,t);if(state.wet<.05)continue;const [x,y]=[b.cell.x,b.cell.y];
        if(a<b.life){const u=a/b.life,r=b.r*smooth(0,.65,u);
          p.ellipse(x+.5,y+.6,r+.5,r*.84,C[0],fade*.75);p.ellipse(x,y,r,r*.83,C[2],fade);
          p.ellipse(x-.35,y-.4,r*.69,r*.55,C[4],fade);if(r>1.2)p.line(x-r*.42,y-r*.48,x+.1,y-r*.48,C[6],fade);
        }else{const k=1-(a-b.life)/.08;p.line(x-2,y,x-1,y+1,C[5],fade*k);p.line(x+1,y-1,x+2,y,C[5],fade*k);}
      }
      for(const d of drops){const a=t-d.start;if(a<0||a>d.land)continue;
        const {x,y,vy}=liquidMotion(d.launch,a,d.physics);
        droplet(p,x,y,d.r,Math.min(3.4,d.r*(1+Math.abs(vy)*.004)),fade);
      }
      // Very sparse pale curls identify a surface reaction without hiding the metal under smoke.
      for(const v of vapor){const a=t-v.start,u=a/v.life;if(u<0||u>=1)continue;
        const k=Math.sin(Math.PI*u)*.3,head=17*u;
        for(let h=Math.max(0,head-7);h<head;h+=1){const q=(head-h)/7,x=v.x+Math.sin(h*.4+v.phase)*v.bend;
          p.blend(x,v.y-h,C[6],k*(1-q)*fade);}
      }
    },
  };
}
