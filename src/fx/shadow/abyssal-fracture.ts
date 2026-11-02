import type { Painter } from '../../core/painter.js';
import { fit, sparkle, clamp, TAU, WHITE } from '../../core/index.js';

export const meta = {
  name: 'Abyssal fracture',
  desc: 'A serrated violet rift tears through space, draws in orbiting shards and snaps shut in a final flash.',
  tags: ['shadow', 'abyss', 'rift', 'fracture', 'void', 'portal', 'dark', 'burst', 'one-shot'],
  size: [224, 224], origin: [112, 112], duration: 3, loop: false, fps: 30, bg: 'dark',
  options: { palette: ['#080510', '#1f1039', '#4e226d', '#9d3dc0', '#e18df2', '#ffffff'], seed: 41 },
};
const ramp=(t:number,a:number,b:number)=>clamp((t-a)/(b-a));
export function draw(p: Painter, t: number, o: typeof meta.options) {
  if(t>=meta.duration) return;
  const c=fit(o.palette,6), rise=ramp(t,0.08,0.7), fade=1-ramp(t,2.12,3), close=1-ramp(t,1.95,2.65), k=rise*fade;
  const width=(2+23*rise)*close, height=68*rise*close;
  p.glow(0,0,74,c[2],0.32*k);
  // Three tilted, counter-rotating fragment rings create the pull towards the tear.
  for(let ring=0;ring<3;ring++) {
    const radius=(30+ring*20)*(0.5+0.5*rise), rot=t*(ring%2?-.9:1.15), squash=.55+ring*.11;
    for(let j=0;j<38;j++) {
      const a=TAU*j/38+rot, dash=(j+ring*5)%5;
      if(dash===0) continue;
      const x=Math.cos(a)*radius, y=Math.sin(a)*radius*squash;
      p.dot(x,y,dash===1?c[4]:c[2],k*(.45+ring*.1));
      if(dash===1) p.light(x,y,c[3],0.25*k);
    }
  }
  // A jagged black wound, outlined with sharp alternating lilac sparks.
  if(width>0.1 && height>0.1) {
    const left:[number,number][]=[],right:[number,number][]=[];
    for(let i=0;i<=12;i++) {
      const u=i/12, yy=(u*2-1)*height;
      const jag=0.7+0.3*Math.sin(i*7.2+o.seed);
      const w=width*Math.sin(Math.PI*u)*jag;
      left.push([-w,yy]);right.unshift([w,yy]);
    }
    p.poly([...left,...right],c[0],k);
    for(let i=0;i<left.length-1;i++) {
      p.line(left[i][0],left[i][1],left[i+1][0],left[i+1][1],i%3===0?c[4]:c[3],k);
      const j=right.length-1-i;
      p.line(right[j][0],right[j][1],right[j-1][0],right[j-1][1],i%3===1?c[5]:c[3],k);
    }
    p.glowLine(0,-height*.7,0,height*.7,12,c[3],0.22*k);
  }
  // Shards spin inward while their strobing trails leave a crisp serrated silhouette.
  for(let i=0;i<28;i++) {
    const q=(i*0.173+t*0.43+o.seed*.01)%1, a=i*2.399+t*(i%2?1:-1), r=15+(1-q)*80;
    const x=Math.cos(a)*r,y=Math.sin(a)*r*.85, alpha=Math.sin(Math.PI*q)*k;
    p.line(x,y,x+Math.cos(a)*8*(1-q),y+Math.sin(a)*8*(1-q),c[i%3===0?4:3],alpha);
    p.dot(x,y,c[i%4===0?5:4],alpha);
    if(i%7===0) sparkle(p,x,y,1+2*alpha,c[5],c[3],alpha*.55);
  }
  const strike=Math.exp(-Math.abs(t-2.35)*12)*fade;
  if(strike>.01) { sparkle(p,0,0,28*strike,WHITE,c[4],strike); p.glow(0,0,44,c[4],strike*.7); }
}
