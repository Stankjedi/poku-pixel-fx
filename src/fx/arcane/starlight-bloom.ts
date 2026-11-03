import type { Painter } from '../../core/painter.js';
import { clamp, fit, rand, sparkle, TAU, WHITE } from '../../core/index.js';

// Source version of the shared Starlight Bloom; the published PNG remains separate.
export const meta = {
  sharedSource: true,
  name: 'Starlight bloom', desc: 'A turquoise star unfolds into crystal petals, then sheds luminous fragments.',
  tags: ['magic', 'star', 'burst', 'bloom', 'crystal', '별빛', '마법'], size: [96, 96], origin: [48, 48],
  duration: 1.2, loop: false, fps: 20, bg: 'dark',
  options: { palette: ['#10265a', '#315cba', '#39c6ce', '#a2fff0', '#ffffff'], seed: 17 },
};
export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t <= 0 || t >= meta.duration) return;
  const c = fit(o.palette, 5), u = t / meta.duration;
  const bloom = clamp((u - .06) / .24), fade = Math.pow(1-u, 1.4);
  const flash = Math.max(0, 1 - Math.abs(u-.16)/.12);
  p.glow(0, 0, 25 + 12*bloom, c[2], .34*fade);
  // Long and short faceted petals unfold at different speeds around a dark heart.
  for (let i=0; i<8; i++) {
    const a=i*TAU/8+.1*u, ca=Math.cos(a), sa=Math.sin(a);
    const petal=clamp((u-.06-(i%4)*.012)/.24);
    const length=(i%2 ? 18 : 30)*petal*(1-.25*u), width=(i%2 ? 2.5 : 4)*petal;
    const tipX=ca*length, tipY=sa*length, mx=ca*length*.48, my=sa*length*.48;
    p.poly([[0,0],[mx-sa*width,my+ca*width],[tipX,tipY],[mx+sa*width,my-ca*width]],c[1],fade);
    p.poly([[0,0],[mx-sa*width,my+ca*width],[tipX,tipY]],c[2],fade);
    p.line(0,0,tipX,tipY,c[3],fade*.8);
  }
  p.disc(0,0,4+2*bloom,c[2],fade); p.disc(0,0,2+3*flash,c[4],fade);
  if (flash>0) sparkle(p,0,0,15*flash,WHITE,c[3],flash);
  // Staggered fragments accelerate outward and leave short, individually timed trails.
  for (let i=0; i<18; i++) {
    const q=clamp((u-.16-rand(i,o.seed,1)*.16)/(.65+rand(i,o.seed,2)*.18));
    if(q<=0 || q>=1) continue;
    const a=i*TAU/18+rand(i,o.seed,3)*.14, d=7+(18+rand(i,o.seed,4)*20)*(1-(1-q)**2);
    const x=Math.cos(a)*d,y=Math.sin(a)*d, k=Math.sin(Math.PI*q)*fade;
    p.line(x-Math.cos(a)*4*k,y-Math.sin(a)*4*k,x,y,c[2],k*.7);
    if(i%3===0) sparkle(p,x,y,2+2*k,c[4],c[2],k); else p.dot(x,y,c[3],k);
  }
}
