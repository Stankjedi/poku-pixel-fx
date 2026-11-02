import type { Painter } from '../../core/painter.js';
import { fit, rand, sparkle, TAU, WHITE } from '../../core/index.js';

/** A complete summoning sequence: the floor opens, rings converge, a dimensional core appears and dissolves. */
export const meta = {
  name: 'Dimensional convergence',
  desc: 'A luminous floor sigil unfolds into rotating orbit rings, a prismatic core and rising arcane fragments before the rift collapses.',
  tags: ['arcane', 'summon', 'dimensional', 'portal', 'convergence', 'magic', 'ritual', 'ground', 'one-shot'],
  size: [192, 144], origin: [96, 126], duration: 3.2, loop: false, fps: 30, bg: 'ground',
  options: { palette: ['#110d34', '#292262', '#5741a8', '#865ce0', '#66cbea', '#b6fcff', '#ffffff'], seed: 101 },
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const easeOut = (n: number) => 1 - Math.pow(1-clamp01(n), 3);
const fadeOut = (t: number) => 1-clamp01((t-2.55)/0.65);

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t >= meta.duration || t <= 0) return;
  const C = fit(o.palette, 7), fade = fadeOut(t), rise = easeOut(t/0.52), cy = -57, phase = t * 1.7;
  const aura = Math.min(1, fade * 1.15);
  // Floor: three expanding and counter-rotating bands provide a stable origin for the portal.
  for (let ring = 0; ring < 3; ring++) {
    const R = (22 + ring * 13) * rise, H = R * 0.26;
    for (let j=0; j<150; j++) {
      const a = j*TAU/150, shift = phase * (ring%2 ? -1 : 1);
      const hot = Math.sin(a*6+shift*2)>0.76;
      p.dot(Math.cos(a)*R, -4+Math.sin(a)*H, hot?C[5]:C[3+ring%2], fade * (ring===1?.85:.65));
    }
  }
  p.glow(0, -4, 53*rise, C[3], .22*fade);
  // Upright concentric orbits, each with moving, bright constellation nodes.
  const open = easeOut((t-.15)/.7);
  for (let ring=0; ring<3; ring++) {
    const rx=(18+ring*11)*open, ry=(24+ring*12)*open, shift=phase*(ring%2?-1:1);
    if (rx<1) continue;
    for (let j=0; j<180; j++) {
      const a=j*TAU/180, pulse=Math.sin(a*7+shift*2), hot=pulse>.86;
      const x=Math.cos(a)*rx, y=cy+Math.sin(a)*ry;
      p.dot(x,y,hot?C[6]:C[2+ring],fade*(hot?1:.6));
      if (hot && j%9===0) p.light(x,y,C[4],.35*fade);
    }
    for(let i=0;i<6;i++) {
      const a=shift+i*TAU/6, x=Math.cos(a)*rx, y=cy+Math.sin(a)*ry;
      sparkle(p,x,y,1.5+1.5*fade,C[6],C[4],.35*fade);
    }
  }
  // Diamond facets open around the core. Alternating outlines make its spin legible even at 1x.
  const core= Math.sin(Math.PI*clamp01((t-.2)/2.9));
  if (core>0) {
    const r=(7+5*Math.sin(t*2.5))*open, x=Math.cos(phase)*r*.34;
    p.poly([[x,cy-r*1.5],[x+r,cy],[x,cy+r*1.5],[x-r,cy]],C[2],aura);
    p.line(x,cy-r*1.5,x+r,cy,C[5],aura); p.line(x+r,cy,x,cy+r*1.5,C[4],aura);
    p.line(x,cy+r*1.5,x-r,cy,C[3],aura); p.line(x-r,cy,x,cy-r*1.5,C[6],aura);
    p.line(x,cy-r*.9,x,cy+r*.9,C[5],.8*aura);
    p.glow(x,cy,22,C[4],.35*core*fade);
    sparkle(p,x,cy,4+3*core,WHITE,C[4],.45*core*fade);
  }
  // A short central flare rises through the symbol at the moment of convergence.
  const beam = Math.max(0, 1-Math.abs(t-1.05)/.32)*fade;
  if (beam>0) { p.glowLine(0,-5,0,-108,12,C[4],.35*beam); p.line(0,-5,0,-108,C[6],beam); p.line(-2,-10,-2,-102,C[4],beam*.7); p.line(2,-10,2,-102,C[4],beam*.7); }
  // Staggered fragments orbit outward and upward with per-particle deterministic variation.
  for (let i=0;i<28;i++) {
    const delay=.18+rand(i,o.seed,1)*.9, u=clamp01((t-delay)/1.65);
    if (u<=0 || u>=1) continue;
    const angle=rand(i,o.seed,2)*TAU + u*(i%2?2.4:-2.1), radius=(12+rand(i,o.seed,3)*35)*(0.3+u*.7);
    const x=Math.cos(angle)*radius, y=cy+Math.sin(angle)*radius*.58-u*20, k=Math.sin(Math.PI*u)*fade;
    if (i%3===0) sparkle(p,x,y,1+2*k,C[6],C[4],.32*k);
    else { p.dot(x,y,C[i%2?4:5],k); p.light(x,y,C[3],.3*k); }
  }
}
