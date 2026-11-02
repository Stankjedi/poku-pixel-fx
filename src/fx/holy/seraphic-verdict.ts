import type { Painter } from '../../core/painter.js';
import { fit, sparkle, clamp, TAU, WHITE } from '../../core/index.js';

export const meta = {
  name: 'Seraphic verdict',
  desc: 'A golden seal unfolds into a cascading pillar of light; radiant wings and concentric halos burst outward before falling into motes.',
  tags: ['holy', 'seraph', 'divine', 'verdict', 'beam', 'wings', 'light', 'burst', 'one-shot'],
  size: [240, 220], origin: [120, 200], duration: 2.8, loop: false, fps: 30, bg: 'dark',
  options: { palette: ['#30193e', '#8b4d47', '#cf8b46', '#f8c665', '#fff1ae', '#ffffff'], seed: 23 },
};
const peak = (t: number, a: number, b: number) => clamp((t-a)/(b-a));
export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t >= meta.duration) return;
  const c = fit(o.palette, 6), appear = peak(t,0.04,0.32), fade = 1-peak(t,1.85,2.8);
  const blast = peak(t,0.22,0.36), pulse = Math.exp(-Math.max(0,t-0.28)*3.0), y = -86;
  // Long layered beam: a narrow white core and discrete gold ribs instead of a smooth gradient.
  const beam = appear*fade*(1-0.35*peak(t,1.4,2.3));
  if (beam > 0) {
    p.glow(0,y,82,c[3],0.23*beam);
    p.rect(-14,-185,28,180,c[1],0.25*beam);
    p.rect(-9,-185,18,180,c[2],0.4*beam);
    p.rect(-4,-185,8,180,c[4],0.58*beam);
    p.rect(-1,-185,2,180,WHITE,0.72*beam);
    for (let i=0;i<12;i++) {
      const phase = ((t*0.6+i*0.137)%1), yy = -185+phase*180;
      const xx = Math.sin(i*31+o.seed)*12;
      p.line(xx,yy,xx,yy-12-14*phase,c[4],0.6*beam*(1-phase));
    }
  }
  // Two perspective halos expand and rotate around the strike.
  for(let ring=0;ring<3;ring++) {
    const r=(18+ring*21)*(0.35+0.65*blast), yr=3.2+ring*2.2, ry=-4-ring*3;
    const alpha=fade*(0.8-ring*0.12)*appear;
    for(let j=0;j<144;j++) {
      const a=TAU*j/144, x=Math.cos(a)*r, z=Math.sin(a)*yr;
      p.dot(x,ry+z,j%9<2?c[5]:c[3],alpha);
      if(j%18===0) p.glow(x,ry+z,6,c[3],0.25*alpha);
    }
  }
  // Symmetric feathered wings unfurl, their shafts and barbs held on the pixel grid.
  const wing=appear*fade, stretch=0.3+0.7*blast;
  for(const side of [-1,1]) for(let i=0;i<7;i++) {
    const x=side*(14+i*7)*stretch, yy=y+4+i*3;
    const tipx=side*(44+i*8)*stretch, tipy=y-18+i*6;
    p.line(side*3,y+14,x,yy,c[2],wing*0.75);
    p.line(x,yy,tipx,tipy,c[i%2?3:4],wing);
    p.line(x,yy+2,tipx*0.88,tipy+6,c[2],wing*0.6);
    if(i%2===0) sparkle(p,tipx,tipy,1+2*wing,c[5],c[3],wing*0.65);
  }
  if (pulse>0.01) { sparkle(p,0,y,10+24*pulse,WHITE,c[4],fade); p.glow(0,y,52,c[4],0.6*pulse*fade); }
  // Rising asymmetric ember-stars fill the space without obscuring the core.
  for(let i=0;i<32;i++) {
    const phase=(t*0.32+i*0.381+o.seed*0.071)%1;
    const x=Math.sin(i*71+o.seed)*78, yy=-12-phase*170;
    const alpha=Math.sin(Math.PI*phase)*fade*appear;
    p.dot(x,yy,i%3===0?c[5]:c[3],alpha);
    if(i%6===0) sparkle(p,x,yy,1+2*alpha,c[5],c[3],alpha*0.7);
  }
}
