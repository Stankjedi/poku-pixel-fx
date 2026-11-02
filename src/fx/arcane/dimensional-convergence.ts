import type { Painter } from '../../core/painter.js';
import { fit, rand, sparkle, TAU, WHITE } from '../../core/index.js';

/** A complete summoning sequence: the floor opens, rings converge, a dimensional core appears and dissolves. */
export const meta = {
  addedAt: '2026-11-02T13:49:39Z',
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
  if (t >= meta.duration - 1e-6 || t <= 0) return;
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
  // A torn, opaque rift is the main silhouette, with layered moving sheets of energy.
  // Its irregular outline expands from a thin seam and contracts before the final fade.
  const opening = easeOut((t-.13)/.42) * fade;
  const shiver = Math.sin(t*13)*1.4 + Math.sin(t*7)*2;
  const centerY = -57, width = (24+3*Math.sin(t*4))*opening, height = 43*opening;
  if (width > 1 && height > 1) {
    const wobble = (i:number) => Math.sin(t*5+i*2.1)*width*.12;
    const shell: [number,number][] = [[0,centerY-height],[width*.36+wobble(0),centerY-height*.65],[width*.8+wobble(1),centerY-height*.4],[width,centerY+shiver],[width*.72+wobble(2),centerY+height*.48],[width*.34+wobble(3),centerY+height*.76],[0,centerY+height],[-width*.36+wobble(4),centerY+height*.68],[-width*.85+wobble(5),centerY+height*.35],[-width,centerY-shiver],[-width*.8+wobble(6),centerY-height*.4],[-width*.35+wobble(7),centerY-height*.72]];
    p.poly(shell,C[1],aura);
    // Offset luminous internal currents form interlocking broad shards.
    const sweep = Math.sin(t*3.8)*width*.22;
    p.poly([[0,centerY-height*.92],[width*.72+sweep,centerY-height*.19],[width*.25+sweep,centerY+height*.2],[0,centerY+height*.86],[-width*.65+sweep,centerY+height*.08],[-width*.28+sweep,centerY-height*.32]],C[2],aura);
    p.poly([[0,centerY-height*.78],[width*.37+sweep,centerY-height*.18],[width*.2+sweep,centerY+height*.18],[0,centerY+height*.73],[-width*.38+sweep,centerY+height*.08],[-width*.17+sweep,centerY-height*.3]],C[3],aura);
    p.poly([[0,centerY-height*.53],[width*.18+sweep*.4,centerY-height*.08],[0,centerY+height*.5],[-width*.17+sweep*.4,centerY+height*.08]],C[4],aura);
    p.glow(0,centerY,37*opening,C[3],.5*aura);
    // Chunky violet/teal torn tongues extend past the shell and move independently.
    for (let i=0; i<9; i++) {
      const side=i%2?1:-1, y=centerY-height*.72+(i/8)*height*1.44;
      const tip=side*(width*(1.08+.32*rand(i,o.seed,55)) + 3*Math.sin(t*8+i));
      p.poly([[side*width*.55,y-5],[tip,y-7],[side*(width*.85),y+2],[side*width*.35,y+6]],C[i%3===0?4:2],fade*.9);
      p.line(side*width*.55,y-5,tip,y-7,C[4],fade*.8);
    }
  }
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
      sparkle(p,x,y,3*fade,C[6],C[4],.35*fade);
    }
  }
  // Diamond facets open around the core. Alternating outlines make its spin legible even at 1x.
  const core= Math.sin(Math.PI*clamp01((t-.2)/2.9));
  if (core>0) {
    const r=(11+4*Math.sin(t*2.5))*open, x=Math.cos(phase)*r*.34;
    p.poly([[x,cy-r*1.5],[x+r,cy],[x,cy+r*1.5],[x-r,cy]],C[2],aura);
    p.line(x,cy-r*1.5,x+r,cy,C[5],aura); p.line(x+r,cy,x,cy+r*1.5,C[4],aura);
    p.line(x,cy+r*1.5,x-r,cy,C[3],aura); p.line(x-r,cy,x,cy-r*1.5,C[6],aura);
    p.line(x,cy-r*.9,x,cy+r*.9,C[5],.8*aura);
    p.glow(x,cy,22,C[4],.35*core*fade);
    sparkle(p,x,cy,(4+3*core)*fade,WHITE,C[4],.45*core*fade);
  }
  // A short central flare rises through the symbol at the moment of convergence.
  const beam = Math.max(0, 1-Math.abs(t-1.05)/.32)*fade;
  if (beam>0) { p.glowLine(0,-5,0,-108,12,C[4],.35*beam); p.line(0,-5,0,-108,C[6],beam); p.line(-2,-10,-2,-102,C[4],beam*.7); p.line(2,-10,2,-102,C[4],beam*.7); }
  // Two fast, irregular impact shockwaves and prism fragments sell the release.
  for (const burstTime of [0.82, 1.93]) {
    const u=(t-burstTime)/.65;
    if (u<=0 || u>=1) continue;
    const r=(9+65*easeOut(u)), a=(1-u)*fade;
    for (let j=0;j<100;j++) {
      const ang=j*TAU/100, gap=rand(Math.floor(j/4),o.seed,Math.round(burstTime*100));
      if (gap<.23) continue;
      const rr=r+(gap-.5)*7, x=Math.cos(ang)*rr, y=centerY+Math.sin(ang)*rr*.72;
      p.dot(x,y,C[5],a); p.dot(x+Math.cos(ang)*2,y+Math.sin(ang)*1.5,C[3],a*.8);
    }
    for(let j=0;j<18;j++) {
      const angle=rand(j,o.seed,81)*TAU, d=r*(.45+.5*rand(j,o.seed,83)), x=Math.cos(angle)*d, y=centerY+Math.sin(angle)*d*.68;
      const length=(4+9*rand(j,o.seed,84))*(1-u), dx=Math.cos(angle)*length, dy=Math.sin(angle)*length;
      p.poly([[x-dy*.18,y+dx*.18],[x+dx,y+dy],[x+dy*.18,y-dx*.18]],C[j%3?4:5],a);
      p.glow(x,y,5,C[4],.25*a);
    }
    if (u<.14) { p.disc(0,centerY,17*(1-u/.14),C[6],.72*a); p.glow(0,centerY,50,C[5],.7*a); }
  }
  // Staggered fragments orbit outward and upward with per-particle deterministic variation.
  for (let i=0;i<28;i++) {
    const delay=.18+rand(i,o.seed,1)*.9, u=clamp01((t-delay)/1.65);
    if (u<=0 || u>=1) continue;
    const angle=rand(i,o.seed,2)*TAU + u*(i%2?2.4:-2.1), radius=(12+rand(i,o.seed,3)*35)*(0.3+u*.7);
    const x=Math.cos(angle)*radius, y=cy+Math.sin(angle)*radius*.58-u*20, k=Math.sin(Math.PI*u)*fade;
    if (i%3===0) sparkle(p,x,y,3*k,C[6],C[4],.32*k);
    else { p.dot(x,y,C[i%2?4:5],k); p.light(x,y,C[3],.3*k); }
  }
}
