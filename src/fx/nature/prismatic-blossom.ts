import type { Painter } from '../../core/painter.js';
import { fit, clamp, rand, sparkle, TAU, WHITE } from '../../core/index.js';

export const meta = {
  name: 'Prismatic blossom',
  desc: 'A crystalline flower unfolds into a radiant canopy of emerald petals, luminous pollen, and curling leaves before dissolving.',
  tags: ['nature', 'flower', 'blossom', 'bloom', 'crystal', 'magic', 'healing', 'burst', 'one-shot'],
  size: [224, 190], origin: [112, 166], duration: 3.4, loop: false, fps: 24, bg: 'ground',
  options: { palette: ['#0b2a2a', '#14553f', '#20885e', '#49c984', '#a9f6bc', '#e9ffcc', '#ffffff'], seed: 38 },
};
export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t < 0 || t >= meta.duration) return;
  const C = fit(o.palette, 7), open = clamp((t-.12)/.65), fade = clamp((meta.duration-t)/.9), k = open*fade;
  const cy = -58;
  p.glow(0, -4, 55, C[2], .28*k);
  // Expanding vine tracery, with a dark edge and a lighter leaf edge.
  for (let i=0;i<6;i++) {
    const dir=i<3?-1:1, n=i%3, start=.18+n*.12, grow=clamp((t-start)/.65);
    if(grow<=0) continue;
    let px=0, py=-2;
    for(let j=1;j<=30;j++) {
      const u=j/30*grow, x=dir*(u*(22+n*10)+Math.sin(u*4+n)*3), y=-u*(24+n*10);
      p.line(px,py,x,y,C[1],fade); p.line(px,py-1,x,y-1,C[3],fade*.8); px=x; py=y;
    }
    const u=grow, x=dir*(u*(22+n*10)+Math.sin(u*4+n)*3), y=-u*(24+n*10);
    p.poly([[x,y],[x+dir*(6+5*grow),y-7*grow],[x+dir*13*grow,y-5*grow],[x+dir*7*grow,y+2*grow]], C[3],fade);
    p.line(x,y,x+dir*10*grow,y-4*grow,C[5],fade*.8);
  }
  // Layered crystalline petals open from the centre, with facets and highlights.
  for(let layer=0;layer<2;layer++) for(let i=0;i<8;i++) {
    const a=TAU*(i/8)+(layer?Math.PI/8:0), r=(layer?24:41)*open, side=(layer?6:9)*open;
    const dx=Math.cos(a),dy=Math.sin(a)*.7, tx=-Math.sin(a)*side,ty=Math.cos(a)*side*.7;
    const x=dx*r, y=cy+dy*r;
    p.poly([[0,cy],[x*.56+tx,cy+(y-cy)*.56+ty],[x,y],[x*.56-tx,cy+(y-cy)*.56-ty]], layer?C[4]:C[2],fade);
    p.poly([[0,cy],[x*.56+tx,cy+(y-cy)*.56+ty],[x,y]], layer?C[5]:C[3],fade*.85);
    p.line(x*.35,cy+(y-cy)*.35,x,y,layer?WHITE:C[4],fade*.65);
  }
  p.glow(0,cy,38,C[3],.65*k);
  sparkle(p,0,cy,8+5*Math.sin(t*4)**2,WHITE,C[4],k);
  // Floating pollen rises outward on staggered arcs, fading before the end.
  for(let i=0;i<26;i++) {
    const delay=.35+rand(i,o.seed,1)*1.25, age=t-delay, life=.75+rand(i,o.seed,2)*.7;
    if(age<=0||age>=life) continue;
    const u=age/life,a=rand(i,o.seed,3)*TAU, d=20+u*(28+rand(i,o.seed,4)*25);
    const x=Math.cos(a)*d,y=cy+Math.sin(a)*d*.55-u*24, a1=Math.sin(Math.PI*u)*fade;
    if(i%4===0) sparkle(p,x,y,1+2*a1,WHITE,C[4],a1*.7); else p.dot(x,y,C[5],a1);
  }
}
