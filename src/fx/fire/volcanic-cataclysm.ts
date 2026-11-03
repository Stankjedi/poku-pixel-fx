import type { Painter } from '../../core/painter.js';
import { fit, clamp, smooth, rand, sparkle, WHITE } from '../../core/index.js';

// A ground fissure splits open into a vertical lava fountain; molten fragments arc
// outward, cool into dark rock and fade as the fissure closes.
export const meta = {
  addedAt: '2026-11-02T13:49:39Z',
  name: 'Volcanic cataclysm',
  desc: 'The ground tears open in a red-hot fissure, a giant eruption rises, and molten shards shower out through an expanding shockwave.',
  tags: ['fire', 'lava', 'volcano', 'eruption', 'explosion', 'fissure', 'ground', 'debris', 'one-shot'],
  size: [300, 230], origin: [150, 204], duration: 3.6, loop: false, fps: 30, bg: 'ground',
  options: { palette: ['#1b0b18', '#511827', '#a2271f', '#e84a20', '#ff8628', '#ffc84c', '#fff0a1', '#ffffff'], seed: 57 },
};

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8), S = o.seed * 19;
  const eruption = smooth(.08, .36, t) * (1 - smooth(1.15, 2.8, t));
  const fade = 1 - smooth(2.35, 3.6, t);
  const flare = Math.max(0, 1 - Math.abs(t - .23) / .2);
  const crack = smooth(0, .25, t) * fade;
  // Broken, glowing zigzags open along the ground, with an orange core.
  const segs = [[-115,-2,-77,-8],[-77,-8,-43,-3],[-43,-3,0,-5],[0,-5,34,-1],[34,-1,68,-7],[68,-7,114,-2]];
  for (const [x,y,x2,y2] of segs) {
    p.line(x,y,x2,y2,C[1],crack); p.line(x,y-1,x2,y2-1,C[3],crack);
    p.line(x*.9,y+1,x2*.9,y2+1,C[5],crack*.7);
  }
  p.glow(0,-9,75,C[3],0.7*crack); p.glow(0,-24,48,C[5],0.5*flare);
  // Concentric oval ground shockwaves spread outward and disappear rapidly.
  if (t < 1.1) {
    const u=clamp(t/1.1), radius=18+u*119, alpha=(1-u)*.85;
    for(let i=0;i<100;i++) {
      const a=i*Math.PI*2/100;
      p.dot(Math.cos(a)*radius, -4+Math.sin(a)*radius*.09, i%5===0?C[7]:C[4],alpha);
    }
  }
  // A full-bodied, billowing eruption: uneven lobes, deep crust edges and bright
  // upward-flowing seams make the fountain read as a solid volume, not lines.
  const force = smooth(.08, .32, t) * (1 - smooth(1.7, 3.35, t));
  if (force > .01) {
    const height = 150 * Math.min(1, force * 1.8);
    // Ash rolls upward from both sides of the vent and cools as it spreads.
    for (let i=0;i<12;i++) {
      const age=t-(.18+i*.075); if(age<=0 || age>=1.5) continue;
      const q=age/1.5, side=i%2?1:-1;
      const x=side*(16+rand(i,S+110)*24+q*(12+rand(i,S+111)*23));
      const y=-12-q*(65+rand(i,S+112)*55), r=(5+q*10)*(1-.35*q);
      const alpha=Math.sin(Math.PI*q)*fade*.45;
      p.disc(x,y,r,C[0],alpha); p.disc(x-2,y-3,r*.55,C[1],alpha*.55);
    }
    // Dark ash lobes sit behind the luminous column and rise with its crown.
    for (let j = 0; j < 13; j++) {
      const f = rand(j, S + 70), g = rand(j, S + 71);
      const x = (f - .5) * 92, y = -height * (.48 + .42 * g) - 6;
      const rr = (9 + 13 * rand(j, S + 72)) * Math.min(1, force * 2);
      p.disc(x, y, rr, C[0], .72 * force);
      p.disc(x - rr * .2, y - rr * .18, rr * .68, C[1], .4 * force);
    }
    p.shade(-67, -height - 10, 67, -3, (x, y, out) => {
      const h = (-y - 3) / height;
      if (h < 0 || h > 1) return;
      const wobble = Math.sin(y * .115 + t * 5) * 3 + Math.sin(y * .25 - t * 7) * 1.6;
      const width = ((15 + 27 * Math.sin(h * Math.PI * .85)) * force + 3) * (1 - smooth(.82, 1, h));
      if (width < .5) return;
      const nx = (x - wobble) / width;
      const edge = Math.abs(nx);
      const rough = rand(Math.floor(x / 3), Math.floor(y / 3), S + 75);
      if (edge > 1 + .17 * (rough - .5)) return;
      out.a = Math.min(1, force * 2);
      const band = Math.sin(y * .23 + t * 13 + nx * 7) + Math.sin(x * .18 - y * .1 - t * 5);
      const heat = (1 - edge) * 1.1 + (1 - h) * .35 + band * .11;
      if (edge > .82) out.c = C[1];
      else if (heat < .38) out.c = C[2];
      else if (heat < .65) out.c = C[3];
      else if (heat < .95) out.c = C[4];
      else if (heat < 1.25) out.c = C[5];
      else out.c = C[6];
      if (rough > .91 && edge < .72) out.c = C[Math.max(2, Math.min(6, Math.floor(heat * 4)))];
      if (heat > 1.05) { out.l = C[4]; out.k = .12 * force; }
    });
    p.glow(0, -height * .38, 46, C[3], .18 * force);
  }
  // A flared collar of molten rock and jagged ground debris gives the impact weight.
  for (let i = 0; i < 22; i++) {
    const q = rand(i, S + 90), side = i % 2 ? 1 : -1;
    const x = side * (14 + q * 64), rise = (3 + rand(i, S + 91) * 13) * force;
    const w = 4 + rand(i, S + 92) * 9;
    p.beam(x - w / 2, -2, x + w / 2, -2 - rise * .2, Math.max(2, rise * .45), C[1], fade);
    p.line(x - w / 2, -3 - rise * .2, x + w / 2, -3 - rise * .4, C[3], fade * force);
    if (i % 3 === 0) p.dot(x, -4 - rise * .3, C[5], fade * force);
  }
  // An uneven fan of lava tongues spreads with height; seeded values remain deterministic.
  // Cooling crust breaks off the rising column; bright cracks narrow as it cools.
  for (let i=0;i<13;i++) {
    const age=t-.24-i*.035, life=1.25+rand(i,S+103)*.5;
    if(age<=0 || age>=life) continue;
    const u=age/life, side=i%2?1:-1;
    const x=side*(8+rand(i,S+104)*42)*u, y=-15-(42+rand(i,S+105)*95)*u+35*u*u;
    const r=(3+rand(i,S+106)*4)*(1-.35*u), a=Math.sin(Math.PI*u)*fade;
    p.poly([[x-r,y],[x-r*.45,y-r],[x+r*.65,y-r*.7],[x+r,y+r*.3],[x,y+r]],C[0],a);
    p.line(x-r*.4,y,x+r*.5,y-r*.35,C[3],a*(1-u));
  }
  for (let i=0;i<34;i++) {
    const phase=rand(i,S), width=rand(i,S+1), shift=rand(i,S+2);
    const height=(38+phase*115)*eruption;
    const x=(i-16.5)*2.4;
    const y=-8-height*(.65+.35*Math.sin(t*9+phase*8)**2);
    const drift=(shift-.5)*height*.31;
    const hot=phase>.73?C[6]:phase>.35?C[4]:C[3];
    const a=eruption*(.45+.55*width);
    p.line(x,-6,x+drift,y,hot,a);
    p.line(x+1,-6,x+drift+1,y+6,C[2],a*.75);
    if(height>18) p.disc(x+drift,y,1.4+width*2.6,hot,a);
  }
  // Independently delayed ballistic fragments, with dark crust and glowing cores.
  for (let i=0;i<65;i++) {
    const start=.12+rand(i,S+3)*.62, life=1.15+rand(i,S+4)*.72, age=(t-start)/life;
    if(age<=0||age>=1)continue;
    const vx=(rand(i,S+5)-.5)*205, vy=-(90+rand(i,S+6)*145);
    const x=vx*age, y=-8+vy*age+110*age*age;
    if(y>5) continue;
    const a=Math.sin(Math.PI*age)*fade, r=1+rand(i,S+7)*3.4;
    p.disc(x,y,r+1,C[0],a*.9); p.disc(x,y,r,age<.65?C[3]:C[1],a);
    p.dot(x-1,y-1,age<.45?C[6]:C[4],a);
    if(i%5===0) p.glow(x,y,5+r,C[4],a*.35);
  }
  // Brief white spark crown sells the moment of impact without covering the whole frame.
  if (flare>0) for(let i=0;i<8;i++) {
    const a=i*Math.PI/4, r=12+26*(1-flare);
    sparkle(p,Math.cos(a)*r,-22+Math.sin(a)*r*.45,1+3*flare,WHITE,C[5],flare*.7);
  }
}
