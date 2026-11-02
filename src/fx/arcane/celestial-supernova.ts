import type { Painter } from '../../core/painter.js';
import { fit, rand, sparkle, TAU, WHITE, clamp } from '../../core/index.js';

/** An original celestial impact with a rising star, rings and refracted stardust. */
export const meta = {
  addedAt: '2026-11-02T13:49:39Z',
  name: 'Celestial Supernova',
  desc: 'A star ascends, compresses into white light, then erupts into concentric celestial rings and streaking shards.',
  tags: ['arcane', 'celestial', 'star', 'nova', 'burst', 'magic', 'cosmic', 'explosion', 'one-shot'],
  size: [224, 184], origin: [112, 170], duration: 2.8, loop: false, fps: 30, bg: 'ground',
  options: { palette: ['#100d31', '#34246d', '#7044bf', '#ed6bd1', '#ffb77c', '#fff4bc', '#ffffff'], seed: 31 },
};

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 7), CY = -72;
  const gather = clamp(t / .44), fade = clamp((2.8 - t) / .62);
  const lift = CY + (1-gather) * 54;
  // A rising stellar bead draws its own ladder of light.
  if (t < .52) {
    p.glow(0, lift, 18 + 10*gather, C[3], .24 + .38*gather);
    for (let j=0; j<5; j++) p.dot(0, lift + j*4, C[4], gather * (1-j/5));
    sparkle(p, 0, lift, 2 + gather*7, C[5], C[3], .3*gather);
  }
  if (t < .44) return;
  const age = Math.max(0, t-.44), power = Math.max(0, 1-age/1.75), r = 10 + 67*(1-Math.exp(-age*2.25));
  // Nebula lobes billow outward as a coherent, tiered fireball rather than isolated dots.
  // Each lobe carries a dark rim, an illuminated edge and a cooling inner core.
  for (let i=0; i<24; i++) {
    const a = i*TAU/24 + (rand(o.seed,i,14)-.5)*.18;
    const speed = 24 + 21*rand(o.seed,i,15);
    const q = clamp(age/(1.20+rand(o.seed,i,16)*.38));
    if(q>=1) continue;
    const travel = speed*(1-Math.pow(1-q,2.5));
    const x=Math.cos(a)*travel, y=CY+Math.sin(a)*travel*.72-8*q;
    const swell = Math.min(1,age/.19) * (1-q*.65), radius=(9+8*rand(o.seed,i,17))*swell;
    if(radius<1) continue;
    const opacity = Math.min(1,(1-q)*3)*fade;
    p.disc(x,y,radius+2,C[0],opacity);
    p.disc(x-1,y-1,radius,C[1],opacity);
    p.disc(x-2,y-3,radius*.72,C[2],opacity);
    if(q<.64) p.disc(x-3,y-4,radius*(.50-q*.35),C[3+(i%2)],opacity);
    if(q<.26) p.disc(x-4,y-5,Math.max(1,radius*(.19-q*.45)),C[5],opacity);
  }
  // Eight fractured flare blades: a broad colored wedge with a white-hot inner ridge.
  if(age < .85) {
    const u=age/.85, stretch=(1-Math.exp(-age*10)), tip=32+59*stretch;
    const alpha=(1-u)*(1-u)*fade;
    for(let i=0;i<8;i++) {
      const a=i*TAU/8, vx=Math.cos(a),vy=Math.sin(a)*.72, nx=-Math.sin(a),ny=Math.cos(a)*.72;
      const breadth=(i%2?4:7)*(1-u*.65), base=5+u*11;
      p.poly([[vx*base+nx*breadth,CY+vy*base+ny*breadth],[vx*tip,CY+vy*tip],[vx*base-nx*breadth,CY+vy*base-ny*breadth]],C[3],alpha);
      p.line(vx*base,CY+vy*base,vx*(tip*.83),CY+vy*(tip*.83),i%2?C[5]:WHITE,alpha);
    }
  }
  // Contrasting dark fissures and hot beads tumble around the receding nebula.
  for(let i=0;i<20;i++) {
    const u=clamp((age-.10-rand(o.seed,i,20)*.12)/(1.3+rand(o.seed,i,21)*.6));
    if(u<=0||u>=1) continue;
    const a=TAU*rand(o.seed,i,22), d=20+u*(42+rand(o.seed,i,23)*22);
    const x=Math.cos(a)*d,y=CY+Math.sin(a)*d*.68+u*u*15, size=(1-u)*(3+rand(o.seed,i,24)*3);
    p.disc(x,y,size+1,C[0],(1-u)*fade);
    p.disc(x-1,y-1,size*.75,i%3===0?C[5]:C[3],(1-u)*fade);
    if(i%4===0) p.glow(x,y,8,C[4],.15*(1-u)*fade);
  }
  // The impact disk, layered in flat color ramps, gives the flash a hard pixel silhouette.
  const core = Math.max(0, 1-age/.48);
  if (core > .04) {
    p.disc(0, CY, 2 + core*16, C[3], core);
    p.disc(0, CY, 1 + core*9, C[5], core);
    p.disc(0, CY, 1 + core*4, WHITE, core);
  }
  p.glow(0, CY, 26 + core*42, C[3], .46*power*fade);
  // Tilted orbit rings move at separate speeds and phase, avoiding a flat circular sticker.
  for (let ring=0; ring<3; ring++) {
    const a = age - ring*.13; if (a <= 0 || a > 1.75) continue;
    const rad = 8 + 72*(1-Math.exp(-a*(2.5-ring*.25)));
    const alpha = Math.pow(1-clamp(a/1.75), 1.3)*fade;
    for (let j=0; j<128; j++) {
      const theta = j*TAU/128 + ring*.55, x = Math.cos(theta)*rad, y = CY + Math.sin(theta)*rad*(.46+ring*.17);
      const pulse = .5 + .5*Math.sin(theta*4 - age*9 + ring);
      p.dot(x, y, pulse>.8? C[6] : C[3+ring], alpha*(.5 + .5*pulse));
      if (ring===0 && j%5===0) p.light(x, y, C[4], alpha*.28);
    }
  }
  // Seeded fragments stream outward on diverse arcs; larger shards leave tapered streaks.
  for (let i=0;i<46;i++) {
    const delay=rand(o.seed,i,1)*.23, u=clamp((age-delay)/(1.15+rand(o.seed,i,2)*.8));
    if (u<=0 || u>=1) continue;
    const theta=TAU*rand(o.seed,i,3), d=(18+rand(o.seed,i,4)*78)*(1-Math.pow(1-u,2));
    const x=Math.cos(theta)*d, y=CY+Math.sin(theta)*d*.66 + 22*u*u;
    const alpha=Math.sin(Math.PI*u)*fade, c=i%5===0?WHITE:C[3+i%3];
    if (i%4===0) {
      p.line(x-Math.cos(theta)*(2+7*alpha),y-Math.sin(theta)*(2+7*alpha)*.66,x,y,c,alpha);
      if (alpha>.4) sparkle(p,x,y,1+2*alpha,c,C[4],alpha*.15);
    } else p.dot(x,y,c,alpha);
  }
  // Ground reflection anchors the blast without extending below the floor.
  if (power > 0) { p.ellipse(0,-2, r*.67, Math.max(1,r*.12), C[2], power*.55*fade); p.glow(0,-3,43,C[3],power*.2*fade); }
}
