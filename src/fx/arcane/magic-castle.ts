import type { Painter, Point } from '../../core/painter.js';
import { fit, cycle, sparkle, TAU, WHITE } from '../../core/index.js';

/** An original floating castle summoned from a ring of starlight. */
export const meta = {
  name: 'Astral castle',
  desc: 'A floating spectral castle appears over a rotating magical seal, with crystal towers, lit windows and orbiting stars.',
  tags: ['arcane', 'castle', 'summon', 'magic', 'astral', 'palace', 'portal', 'loop'],
  size: [192, 160], origin: [96, 139], duration: 4, loop: true, fps: 24, bg: 'dark',
  options: { palette: ['#120d30', '#25205c', '#403885', '#6759bc', '#81a2ef', '#9be8ff', '#e0ffff'], seed: 37 },
};
const D = meta.duration;

function tower(p: Painter, x: number, top: number, height: number, width: number, c: number[], light: number) {
  const half = width / 2;
  p.rect(x-half, top, width, height, c[1]);
  p.rect(x-half+2, top+1, width-4, height-2, c[2]);
  p.line(x-half+1,top+1,x-half+1,top+height-2,c[4]);
  p.line(x+half-2,top+1,x+half-2,top+height-2,c[0]);
  const roof: Point[] = [[x-half-2,top],[x,top-width*1.35],[x+half+2,top]];
  p.poly(roof,c[1]);
  p.line(x-half-2,top,x,top-width*1.35,c[5]);
  p.line(x,top-width*1.35,x+half+2,top,c[3]);
  p.line(x,top-width*1.35-5,x,top-width*1.35,c[5]);
  p.dot(x,top-width*1.35-6,WHITE,light);
  p.rect(x-2,top+5,4,7,c[0]); p.rect(x-1,top+6,2,4,c[5],light);
  p.rect(x-1,top+12,2,1,c[4]);
}

export function draw(p: Painter, t: number, o: typeof meta.options) {
  const c = fit(o.palette,7), phase = t / D * TAU;
  const bob = Math.sin(phase) * 1.5, shine = .65 + .35 * Math.sin(phase * 2);
  // Ground seal: multiple linked elliptical orbits, a turning diamond and dancing runes.
  const floorY = -3;
  p.glow(0,floorY-1,57,c[3],.28);
  for (let i=0;i<144;i++) {
    const a=i*TAU/144, bright=Math.sin(a*3-phase*2)>.68;
    p.dot(Math.cos(a)*57,floorY+Math.sin(a)*11,bright?c[6]:c[3],.95);
    p.dot(Math.cos(a)*42,floorY+Math.sin(a)*8,c[4],.75);
  }
  const diamond: Point[] = [[0,-12],[40,-3],[0,6],[-40,-3]];
  for(let i=0;i<4;i++){const a=diamond[i],b=diamond[(i+1)%4];p.line(a[0],a[1],b[0],b[1],c[4],.8);}
  for(let i=0;i<12;i++) {
    const a=i*TAU/12+phase/3, x=Math.cos(a)*49,y=floorY+Math.sin(a)*9;
    p.rect(x-1,y-1,3,2,c[5]); if(i%4===0)p.dot(x,y-3,WHITE,.8);
  }
  // Castle silhouette and floating foundation.
  const yy = -35+bob;
  p.poly([[-48,yy],[-38,yy+10],[-18,yy+18],[0,yy+23],[18,yy+18],[38,yy+10],[48,yy]],c[0]);
  p.poly([[-44,yy+1],[-26,yy+10],[0,yy+17],[25,yy+10],[43,yy+1]],c[2]);
  p.line(-39,yy+2,-10,yy+12,c[4]); p.line(0,yy+15,30,yy+5,c[3]);
  p.rect(-38,yy-28,76,29,c[1]); p.rect(-35,yy-25,70,24,c[2]);
  for(let x=-36;x<=34;x+=8) p.rect(x,yy-30,5,4,c[4]);
  tower(p,-34,yy-36,37,14,c,shine); tower(p,34,yy-36,37,14,c,shine);
  tower(p,-18,yy-48,48,16,c,shine); tower(p,18,yy-48,48,16,c,shine);
  tower(p,0,yy-59,59,19,c,shine);
  // Foreground central gate and windows.
  p.rect(-14,yy-20,28,20,c[1]); p.line(-13,yy-20,13,yy-20,c[5]);
  p.rect(-5,yy-15,10,15,c[0]); p.poly([[-5,yy-15],[0,yy-21],[5,yy-15]],c[0]);
  p.line(0,yy-20,0,yy-2,c[5],.8); p.rect(-2,yy-13,4,7,c[4],.8);
  for(const x of [-27,-20,20,27]) { p.rect(x-1,yy-16,3,6,c[0]); p.dot(x,yy-14,c[6],shine); }
  p.line(-38,yy,-15,yy,c[5]); p.line(15,yy,38,yy,c[5]);
  p.glow(0,yy-38,47,c[3],.17); p.glow(0,yy-65,16,c[5],.28);
  // Stars and sparkling fragments rise around the towers, re-seeded deterministically per cycle.
  cycle(t,D,16,o.seed,(r)=>r.range(.8,1.6),(age,life,r)=>{
    const u=age/life, x=r.range(-61,61)+Math.sin(u*TAU+r.range(0,TAU))*2, y=-15-u*r.range(30,95);
    const k=Math.sin(u*Math.PI); if(Math.abs(x)<24&&y<yy-28&&y>yy-64)return;
    sparkle(p,x,y,1+2*k,c[6],c[4],.7*k);
  });
  for(let i=0;i<3;i++){const a=phase+i*TAU/3,x=Math.cos(a)*62,y=yy-34+Math.sin(a)*26; sparkle(p,x,y,2.5,WHITE,c[5],.8);}
}

