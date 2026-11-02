import type { Painter } from '../../core/painter.js';
import { fit, clamp, smooth, rand, sparkle, WHITE } from '../../core/index.js';

// A ground fissure splits open into a vertical lava fountain; molten fragments arc
// outward, cool into dark rock and fade as the fissure closes.
export const meta = {
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
  // An uneven fan of lava tongues spreads with height; seeded values remain deterministic.
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
