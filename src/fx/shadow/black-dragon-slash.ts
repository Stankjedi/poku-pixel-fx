import type { Painter } from '../../core/painter.js';
import { clamp, fit, rand, sparkle, WHITE } from '../../core/index.js';

// A black dragon is the shadow cast by an instantaneous cut through space.
export const meta = {
  name: 'Black dragon slash',
  desc: 'A black dragon darts through an instant sword stroke, leaving a sharp, split void that closes behind it.',
  tags: ['dragon', 'black dragon', 'slash', 'sword', 'shadow', 'dark', 'void', 'rift', 'combat', 'ultimate', 'one-shot', '흑룡참', '흑룡', '용', '검격', '공간'],
  size: [256, 192], origin: [128, 96], duration: 1.65, loop: false, fps: 30, bg: 'dark',
  options: { palette: ['#050408', '#0d0b12', '#1c1823', '#352d3d', '#6d6177', '#ada5bb', '#e9e5f0', '#ffffff'], seed: 77 },
};
const smooth = (v: number) => { const x = clamp(v); return x*x*(3-2*x); };
const out = (v: number) => 1 - (1-clamp(v))**3;

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8);
  const strike = out((t-.20)/.19);
  const dragonIn = smooth(t/.12), dragonOut = 1-smooth((t-.39)/.51), a=dragonIn*dragonOut;
  const hx=-25+99*strike, hy=15-34*strike;

  // The dragon's body is almost black, with a restrained silver-violet rim.
  if(a>.001) {
    const points:[number,number][]=[];
    for(let i=0;i<=12;i++) {
      const u=i/12;
      points.push([hx-9-u*90,hy+5+u*23+Math.sin(u*7-t*12)*13*u]);
    }
    for(let i=12;i>0;i--) {
      const q=i/12, b=points[i-1], c=points[i], w=2+(1-q)*16;
      p.beam(c[0],c[1],b[0],b[1],w+2,C[0],a);
      p.beam(c[0],c[1]-2,b[0],b[1]-2,w*.69,C[2],a);
      p.line(c[0],c[1]-w*.38,b[0],b[1]-w*.38,C[4],a*.75);
      if(i<11 && i%2===0) {
        p.tri(c[0]-5,c[1]-w*.4,c[0],c[1]-w*.4-6,c[0]+4,c[1]-w*.3,C[2],a);
        p.line(c[0]-5,c[1]-w*.4,c[0],c[1]-w*.4-6,C[4],a*.7);
      }
    }
    // One angular wing and a smaller near wing break the long body into a dragon silhouette.
    const x=hx-30,y=hy+3, flap=Math.sin(t*13)*7;
    p.poly([[x,y],[x-15,y-19],[x-37,y-39-flap],[x-29,y-15],[x-46,y-5],[x-24,y-8],[x-19,y+4]],C[0],a);
    p.poly([[x-2,y-3],[x-35,y-37-flap],[x-26,y-14],[x-42,y-6],[x-24,y-10]],C[2],a);
    p.polyline([[x,y],[x-15,y-19],[x-37,y-39-flap]],C[4],a*.9);
    p.line(x-15,y-19,x-42,y-6,C[3],a);
    p.poly([[x+1,y+6],[x-9,y+21],[x-26,y+32+flap],[x-22,y+17],[x-36,y+14],[x-19,y+9]],C[1],a);
    p.polyline([[x+1,y+6],[x-9,y+21],[x-26,y+32+flap]],C[4],a*.65);
    // Horned head, open jaw and a concentrated eye glint.
    p.poly([[hx-14,hy-10],[hx-23,hy-25],[hx-13,hy-21],[hx-4,hy-12],[hx+5,hy-10],[hx+17,hy-5],[hx+26,hy+1],[hx+15,hy+4],[hx+5,hy+2],[hx+16,hy+10],[hx+23,hy+9],[hx+14,hy+16],[hx+1,hy+14],[hx-14,hy+8],[hx-20,hy-1]],C[0],a);
    p.poly([[hx-16,hy-8],[hx-11,hy-13],[hx+4,hy-11],[hx+17,hy-5],[hx+25,hy+1],[hx+13,hy+2],[hx+1,hy-2],[hx-12,hy+5]],C[2],a);
    p.polyline([[hx-22,hy-24],[hx-13,hy-19],[hx-4,hy-12],[hx+5,hy-10],[hx+17,hy-5],[hx+26,hy+1]],C[4],a);
    p.polyline([[hx-10,hy+7],[hx+1,hy+13],[hx+14,hy+15],[hx+23,hy+9]],C[3],a);
    p.tri(hx-7,hy-10,hx-14,hy-28,hx-2,hy-15,C[2],a);
    p.line(hx-14,hy-28,hx-5,hy-14,C[5],a*.8);
    p.beam(hx+2,hy-5,hx+7,hy-6,2,C[6],a);
    p.glow(hx+5,hy-5,5,C[5],a*.18);
  }

  // A fast ink-black fissure splits the frame diagonally; only its knife edge catches light.
  const reveal=out((t-.22)/.13), hold=1-smooth((t-.76)/.63), cut=reveal*hold;
  if(cut>.001) {
    const endX=-108+216*reveal, endY=57-114*reveal;
    const span=Math.hypot(endX+108,endY-57), ux=(endX+108)/(span||1), uy=(endY-57)/(span||1);
    const nx=-uy,ny=ux, width=(2+7*smooth((t-.28)/.13))*(1-.65*smooth((t-.55)/.65));
    const points:[number,number][]=[];
    for(let i=0;i<=12;i++) {
      const u=i/12, uneven=(i===0||i===12?0:Math.sin(i*5.6+o.seed)*2.1), bulge=Math.sin(Math.PI*u)*width;
      points.push([-108+ux*span*u+nx*(bulge+uneven),57+uy*span*u+ny*(bulge+uneven)]);
    }
    for(let i=12;i>=0;i--) {
      const u=i/12, uneven=(i===0||i===12?0:Math.sin(i*4.8+o.seed)*1.8), bulge=Math.sin(Math.PI*u)*width;
      points.push([-108+ux*span*u-nx*(bulge+uneven),57+uy*span*u-ny*(bulge+uneven)]);
    }
    p.poly(points,C[0],cut);
    p.polyline(points.slice(0,13),C[5],cut*.8);
    p.polyline(points.slice(13),C[3],cut*.95);
    p.line(-108,57,endX,endY,C[6],cut*.6);
    p.glowLine(-100,53,endX,endY,8,C[4],cut*.12);
    // Angular cracks peel away from the slit in opposite directions, then disappear.
    const crack=out((t-.31)/.12), crackFade=1-smooth((t-.72)/.45);
    for(let i=0;i<6;i++) {
      const u=.23+i*.1, side=i%2?1:-1, bx=-108+ux*span*u, by=57+uy*span*u;
      const length=(10+(i%3)*5)*crack;
      p.polyline([[bx,by],[bx+nx*side*length*.55+ux*5,by+ny*side*length*.55+uy*5],[bx+nx*side*length+ux*7,by+ny*side*length+uy*7]],C[4],cut*crackFade*.75);
    }
  }
  // A two-frame blade flash, then just a few receding sparks.
  const flash=Math.exp(-Math.abs(t-.34)*40);
  if(flash>.02) {
    // The silver edge widens for an instant, while the cut's interior stays black.
    p.poly([[-100,54],[-38,20],[45,-28],[100,-54],[48,-23],[-34,26]],C[5],flash*.72);
    p.line(-100,54,100,-54,C[7],flash);
    sparkle(p,39,-21,19*flash,WHITE,C[6],flash*.8);
    p.glowLine(-60,32,90,-49,7,C[5],flash*.23);
    p.glow(39,-21,24,C[6],flash*.25);
  }
  for(let i=0;i<12;i++) {
    const u=(t-.36-rand(i,o.seed)*.08)/(.55+rand(i,o.seed+1)*.32); if(u<=0||u>=1) continue;
    const angle=rand(i,o.seed+2)*6.283, distance=(10+rand(i,o.seed+3)*39)*out(u), x=31+Math.cos(angle)*distance, y=-15+Math.sin(angle)*distance*.7;
    const k=Math.sin(Math.PI*u)*.8;
    p.line(x,y,x-Math.cos(angle)*(2+6*(1-u)),y-Math.sin(angle)*(2+4*(1-u)),i%4===0?C[6]:C[4],k);
  }
}
