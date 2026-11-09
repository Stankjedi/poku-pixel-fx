/** Compact particle matter, separate from its birth position and motion. No path is painted. */
import { hex } from './color.js';
import { clamp, noise2, rng, smooth, TAU } from './math.js';
import type { Painter } from './painter.js';
export interface ParticleVolumeOptions2D {
  seed?: number;
  /** Hot/young to cool/old; output uses only this ramp. */
  palette: readonly (string | number)[];
  profile: 'fire' | 'energy';
  /** Optional single head light. No per-pixel glow or implicit white. */
  emission?: number;
  lightRadius?: number;
}
export interface ParticleVolumeSample2D {
  id: number; x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; progress: number;
  /** Birth-relative seconds, bounded to one hour. */
  age: number;
}
/** Reusable native-pixel volume renderer for sampled particles. Each particle has its own
 * unequal lobes, phase and cooling, rather than carrying a history-length ribbon. Fire consumes
 * into torn tongues; energy has slower boundary motion and later erosion.
 * This is authored 2D material, not a fluid simulation, depth solve or general material model. */
export function createParticleVolume2D(options: ParticleVolumeOptions2D) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid particle volume options');
  const { seed = 1, profile, emission = 0, lightRadius = 3 } = options;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !['fire','energy'].includes(profile)
    || !Number.isFinite(emission) || emission < 0 || emission > 10 || !Number.isFinite(lightRadius) || lightRadius <= 0 || lightRadius > 256)
    throw new RangeError('Invalid particle volume material/light');
  if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32
    || Array.from(options.palette).some(c => typeof c === 'number' ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff
      : typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c))) throw new RangeError('Invalid particle volume palette');
  const C = options.palette.map(hex), fire = profile === 'fire';
  const shape = (id: number) => {
    const r = rng(seed,id,6319);
    return { phase:r.range(0,TAU), angle:r.range(-.55,.55), length:r.range(.85,1.55), width:r.range(.52,.92),
      lobeA:r.range(.55,.94), lobeB:r.range(.45,.84), lean:r.range(-.35,.35), split:r.next(), heat:r.range(-.08,.12) };
  };
  // At most 8192 small records; no frame-dependent cache growth or caller-owned state retained.
  const shapes: (ReturnType<typeof shape> | undefined)[] = [];
  return Object.freeze({ draw(p:Pick<Painter,'shade'|'glow'>,q:ParticleVolumeSample2D) {
    if (!q || !Number.isInteger(q.id) || q.id < 0 || q.id > 8191
      || ![q.x,q.y,q.vx,q.vy,q.size,q.alpha,q.progress,q.age].every(Number.isFinite)
      || q.size < 0 || q.size > 128 || q.alpha < 0 || q.alpha > 1 || q.progress < 0 || q.progress > 1 || q.age < 0 || q.age > 3600)
      throw new RangeError('Invalid particle volume sample');
    if (q.alpha === 0 || q.size === 0 || q.progress === 1) return;
    const s = shapes[q.id] ?? (shapes[q.id] = shape(q.id));
    const angle = Math.atan2(q.vy,q.vx) + s.angle + (fire ? .13*Math.sin(q.age*7+s.phase) : 0);
    const cs=Math.cos(angle),sn=Math.sin(angle),length=q.size*s.length,width=q.size*s.width,radius=length+width;
    const depletion=smooth(fire?.22:.5,1,q.progress);
    p.shade(q.x-radius,q.y-radius,q.x+radius,q.y+radius,(x,y,out)=>{
      const dx=x-q.x,dy=y-q.y,u=(dx*cs+dy*sn)/length,v=(-dx*sn+dy*cs)/width;
      if(u< -1.3||u>1.3||Math.abs(v)>1.4)return;
      const bend=fire?.15*Math.sin(u*4-q.age*7+s.phase):.06*Math.sin(u*3+s.phase);
      const vv=v-bend;
      const a=((u+.2)/s.lobeA)**2+(vv/s.lobeB)**2;
      const b=((u-.3)/(.42+s.split*.28))**2+((vv-s.lean)/(.25+s.split*.24))**2;
      const c=s.split>.35?((u-.1)/.45)**2+((vv+.34)/.31)**2:10;
      const d=Math.min(a,b,c),n=noise2(u*3.2+q.age*(fire?3.2:1.1),v*3-s.phase,seed+q.id*13);
      const m=noise2(u*6.8-q.age*(fire?4.7:1.4),v*5.8+s.phase,seed+q.id*17);
      if(d>1+n*(fire?.27:.14)+m*.06 || .58+.31*n+.16*m<depletion*.92)return;
      const heat=clamp(.18+.43*(1-d)+.12*n+.06*m+.16*(1-q.progress)+s.heat);
      const index=Math.min(C.length-1,Math.floor((1-heat)*C.length));
      out.c=C[index];out.a=q.alpha*(.55+.45*clamp((1-d)*2));
    });
    if(emission>0)p.glow(q.x,q.y,lightRadius,C[Math.min(C.length-1,Math.floor(q.progress*C.length))],emission*q.alpha);
  }});
}
