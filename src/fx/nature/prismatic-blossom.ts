import type { Painter } from '../../core/painter.js';
import { fit, clamp, rand, sparkle, TAU, WHITE } from '../../core/index.js';
export const meta={addedAt:'2026-11-02T13:49:39Z',name:'Prismatic blossom',desc:'A radiant crystalline flower erupts, unfurls uneven petals, then shatters into drifting leaves and luminous pollen.',tags:['nature','flower','blossom','bloom','crystal','magic','healing','burst','one-shot'],size:[224,190],origin:[112,166],duration:3.4,loop:false,fps:24,bg:'ground',options:{palette:['#092825','#13523d','#20845c','#47bd78','#95efaa','#d8ffba','#ffffff'],seed:38}};
export function draw(p:Painter,t:number,o:typeof meta.options){
 if(t<0||t>=meta.duration)return;
 const C=fit(o.palette,7),fade=clamp((meta.duration-t)/.65),grow=clamp(t/.56), bloom=clamp((t-.28)/.65), burst=clamp(1-Math.abs(t-.86)/.22),cy=-71;
 p.glow(0,-2,58,C[2],.34*fade*grow);
 // Living stem grows, bends and subsequently disintegrates.
 const stemFade=fade*clamp((2.75-t)/.65);for(let j=0;j<36;j++){const u=j/35*grow, x=Math.sin(t*2.4+u*3)*5*u, y=-u*70;p.line(x-2,y,x+2,y,C[2],stemFade);p.dot(x-1,y,C[4],stemFade);}
 for(let i=0;i<5;i++){const dir=i%2?1:-1,n=i%3,start=.18+n*.12,g=clamp((t-start)/.55);if(g<=0)continue;let px=0,py=-3;for(let j=1;j<=24;j++){const u=j/24*g,x=dir*(u*(22+n*8)+Math.sin(t*2+u*4+n)*4*u),y=-u*(29+n*7);p.line(px,py,x,y,C[3],stemFade);px=x;py=y;}const l=8+n*2;p.poly([[px,py],[px+dir*l,py-l],[px+dir*l*2,py-l*.5],[px+dir*l,py+2]],C[3],stemFade);p.line(px,py,px+dir*l*1.8,py-l*.5,C[5],stemFade);}
 // Independent petals unroll at staggered times then break away in different directions.
 for(let layer=0;layer<2;layer++)for(let i=0;i<9;i++){
  const seed=i+layer*19, start=.25+rand(seed,o.seed,1)*.35,open=clamp((t-start)/(.35+rand(seed,o.seed,2)*.3));
  const detach=clamp((t-(1.05+rand(seed,o.seed,3)*.85))/(.75+rand(seed,o.seed,4)*.65)),rot=TAU*i/9+layer*.32+rand(seed,o.seed,5)*.25+detach*(rand(seed,o.seed,6)-.5)*1.5;
  const dx=Math.cos(rot),dy=Math.sin(rot)*.66,dist=(layer?34:57)*open+detach*(20+rand(seed,o.seed,7)*34), width=(layer?10:16)*open*(1-.45*detach),sx=dx*detach*26,sy=cy+dy*detach*18+detach*detach*24;
  const tipx=sx+dx*dist,tipy=sy+dy*dist,midX=sx+dx*dist*.55,midY=sy+dy*dist*.55,tx=-Math.sin(rot)*width,ty=Math.cos(rot)*width*.66,alpha=fade*open*(1-.8*detach);
  p.poly([[sx,sy],[midX+tx,midY+ty],[tipx,tipy],[midX-tx,midY-ty]],layer?C[3]:C[2],alpha);
  p.poly([[sx,sy],[midX+tx,midY+ty],[tipx,tipy]],layer?C[5]:C[4],alpha);p.line(midX+tx,midY+ty,tipx,tipy,C[6],alpha*.8);p.line(sx,sy,tipx,tipy,C[4],alpha*.7);
 }
 const heart=fade*bloom*clamp((2.3-t)/.9);p.glow(0,cy,55,C[3],.55*heart);p.disc(0,cy,8*heart,C[4],heart);sparkle(p,0,cy,(10+9*burst)*heart,WHITE,C[5],heart);
 // Pollen, leaf slivers and glints drift with independent motion and lifetimes.
 for(let i=0;i<48;i++){const delay=.42+rand(i,o.seed,11)*1.8,age=t-delay,life=.55+rand(i,o.seed,12)*.9;if(age<=0||age>=life)continue;const u=age/life,a=rand(i,o.seed,13)*TAU,dist=15+u*(30+rand(i,o.seed,14)*48),x=Math.cos(a)*dist,y=cy+Math.sin(a)*dist*.55-u*28+20*u*u,k=Math.sin(Math.PI*u)*fade;
  if(i%3===0){const w=1+3*k;p.poly([[x-w,y],[x,y-w*1.8],[x+w,y],[x,y+w]],C[4],k);p.dot(x,y,C[6],k);}else p.dot(x,y,C[5],k);if(i%8===0)sparkle(p,x,y,1+3*k,WHITE,C[4],k*.7);}
 if(burst)p.glow(0,cy,75,WHITE,.35*burst);
}
