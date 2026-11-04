/** Seekable mineral-ground response for impacts. This draws displaced surface plates,
 * irregular heavy rubble and collision-triggered dust, never emissive stone or spell rings. */
import { Rng, clamp, smooth } from './math.js';
import { rubblePath, type RubblePath } from './stone.js';
import type { Painter, Point } from './painter.js';

export interface GroundImpactOptions {
  seed?: number; radius?: number; strength?: number; direction?: number;
  material?: 'stone' | 'soil'; duration?: number;
}
export interface GroundImpactStyle { x?: number; y?: number; palette: readonly number[] }
export interface ImpactRubble {
  readonly vertices: readonly Point[]; readonly path: RubblePath; readonly shade: number; readonly delay: number;
}
interface Dust { x: number; at: number; vx: number; rise: number; radius: number; life: number; phase: number; front: boolean }
interface Plate { left: number; right: number; depth: number; shade: number; edge: number }

/** A short, damped whole-scene kick. Apply to the scene, not just the effect sprite.
 * Integer offsets keep native pixel cells crisp. strength=0 is the reduced-motion path. */
export function impactKick2D(age: number, strength = 1, seed = 1): Point {
  if (![age, strength, seed].every(Number.isFinite)) throw new RangeError('Impact kick requires finite values');
  if (age < 0 || age >= .55 || strength <= 0) return [0, 0];
  const k = clamp(strength, 0, 2) * Math.exp(-age * 6) * (1 - age / .55);
  const side = (seed | 0) & 1 ? -1 : 1;
  return [Math.round(side * 2.2 * Math.cos(age * 57) * k), Math.round(3.6 * Math.cos(age * 44) * k)];
}

/** Bakes polygon-aware collisions once. Sampling/drawing never consumes RNG and is independent
 * of caller FPS. The palette is mineral color, kept separate from fire/metal/smoke ramps. */
export function createGroundImpact(options: GroundImpactOptions = {}) {
  const { seed = 1, radius = 24, strength = 1, direction = 0, material = 'stone', duration = 2.1 } = options;
  if (![seed, radius, strength, direction, duration].every(Number.isFinite) || radius < 8 || radius > 64
    || strength < 0 || strength > 2 || Math.abs(direction) > 1 || duration < 1 || duration > 6
    || (material !== 'stone' && material !== 'soil')) throw new RangeError('Invalid ground impact dimensions, material or timing');
  const rng = new Rng(seed), rock = material === 'stone', unit = radius / 24;
  const chunks: ImpactRubble[] = [], dust: Dust[] = [], plates: Plate[] = [];
  const plume = (x: number, at: number, size: number, count: number, speed: number) => {
    for (let i = 0; i < count; i++) dust.push({ x, at: at + rng.range(0, .025),
      vx: (i % 2 ? 1 : -1) * rng.range(speed * .55, speed) + direction * speed * .15,
      rise: rng.range(1.2, 3.8) * unit, radius: size * rng.range(.8, 1.15),
      life: rng.range(.55, .86), phase: rng.range(0, Math.PI * 2), front: i % 3 === 0 });
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = (9 + i * 9) * unit;
      plates.push({ left: side < 0 ? -x - 8.4 * unit : x, right: side < 0 ? -x : x + 8.4 * unit,
        depth: rng.range(3.5, 5.5) * unit, shade: rng.int(2, 3), edge: rng.range(-.6, .6) });
    }
    plume(side * 9 * unit, .015, (rock ? 6.5 : 8.5) * unit, 5, 100 * unit * strength);
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, size = (i < 6 ? rng.range(2.5, 4) : rng.range(1.1, 2)) * unit;
    // Rounded/chipped blocks, not triangles, needles or uniformly square confetti.
    const vertices: Point[] = [[-.9,-.35],[-.35,-.85],[.5,-.7],[1,.0],[.55,.7],[-.5,.75]].map(([x,y]) => [x*size,y*size]);
    const delay = rng.range(0,.045), x = side * rng.range(3, 14) * unit;
    const path = rubblePath(vertices, { x, y: -size,
      vx: (side * rng.range(37, 74) + direction * 19) * unit * strength,
      vy: -rng.range(i < 6 ? 62 : 80, i < 6 ? 104 : 135) * unit * strength,
      angle: rng.range(-.8,.8), spin: rng.range(-5,5) },
      { duration, gravity: 420 * unit, bounce: rock ? .24 : .10, friction: rock ? .67 : .85 });
    chunks.push({ vertices, path, delay, shade: rng.int(2, 4) });
    for (const hit of path.impacts) if (hit.speed > 44) plume(hit.x, delay + hit.time, size * 1.15, 2, 30 * unit);
  }
  /** Screen y displacement of an authored surface point. Positive is compression/down.
   * The uplift travels out from contact, then rings down and leaves a shallow depression. */
  function displacement(x: number, age: number): number {
    if (![x, age].every(Number.isFinite)) throw new RangeError('Ground sample must be finite');
    if (age < 0 || age >= duration || strength === 0) return 0;
    const d = Math.abs(x) / unit, q = age - Math.max(0, d - 8) / 230;
    if (q <= 0) return 0;
    const wave = -Math.sin(Math.min(q / .045, 1) * Math.PI / 2) * Math.exp(-q * 6) * Math.cos(q * 14);
    const taper = 1 - smooth(30, 57, d), fall = 1 - smooth(duration * .64, duration, age);
    return (wave * 10 + smooth(.1, .5, q) * .7) * strength * unit * taper * fall;
  }
  function draw(p: Painter, age: number, layer: 'back' | 'front', style: GroundImpactStyle) {
    if (!Number.isFinite(age)) throw new RangeError('Ground impact age must be finite');
    if (style.palette.length < 6 || !style.palette.every(Number.isFinite)) throw new RangeError('Ground palette needs six finite colors');
    const { x = 0, y = 0, palette: C } = style;
    if (![x, y].every(Number.isFinite)) throw new RangeError('Ground anchor must be finite');
    if (age < 0 || age >= duration || strength === 0) return;
    const fade = 1 - smooth(duration * .64, duration, age), open = smooth(0,.045,age);
    if (layer === 'back') {
      // Chipped concave footprint, rather than a luminous complete ring or perfect ellipse.
      p.poly([[-23,0],[-15,-3],[-5,-2],[4,-4],[14,-2],[23,1],[15,4],[-8,4]].map(([a,b])=>[x+a*unit,y+b*unit]),C[0],fade*.8*open);
      for (const plate of plates) {
        const a=plate.left,b=plate.right,dy0=displacement(a,age),dy1=displacement(b,age);
        const activated=smooth(0,.025,age-Math.max(0,Math.min(Math.abs(a),Math.abs(b))/unit-8)/230);
        if (activated<=0) continue;
        const opacity=fade*activated;
        p.poly([[x+a,y+1],[x+b,y+1],[x+b,y+dy1],[x+a,y+dy0]],C[0],opacity*.8);
        p.poly([[x+a,y+dy0],[x+b,y+dy1],[x+b-.8*unit,y+dy1+plate.depth],[x+a+.7*unit,y+dy0+plate.depth]],C[plate.shade-1],opacity);
        p.poly([[x+a,y+dy0],[x+(a+b)*.5,y+(dy0+dy1)*.5-1.4*unit+plate.edge],[x+b,y+dy1],[x+b-.8*unit,y+dy1+1.4*unit],[x+a+.7*unit,y+dy0+1.4*unit]],C[plate.shade],opacity);
        p.line(x+a+.7*unit,y+dy0,x+(a+b)*.5,y+(dy0+dy1)*.5-1.4*unit+plate.edge,C[4],opacity*.65);
      }
    } else {
      for (const q of chunks) {
        const local=age-q.delay;if(local<0)continue;
        const s=q.path.sample(local),cs=Math.cos(s.angle),sn=Math.sin(s.angle);
        const shrink=1-smooth(duration*.7,duration,age),centerY=s.resting?s.y*shrink:s.y;
        const vertices=q.vertices.map(([a,b])=>[x+s.x+(a*cs-b*sn)*shrink,y+centerY+(a*sn+b*cs)*shrink] as Point);
        p.poly(vertices,C[q.shade],fade);
        for(let i=0;i<vertices.length;i++){
          const a=vertices[i],b=vertices[(i+1)%vertices.length],dx=b[0]-a[0],dy=b[1]-a[1];
          if(Math.hypot(dx,dy)<2.2)continue;
          p.line(a[0],a[1],b[0],b[1],C[dy-dx>.4?4:1],fade*.8);
        }
      }
    }
    for(const d of dust){
      if(d.front!==(layer==='front'))continue;
      const a=age-d.at,u=a/d.life;if(u<=0||u>=1)continue;
      const r=d.radius*(.5+.7*Math.sqrt(u)),cx=x+d.x+d.vx*(-Math.expm1(-a*4))/4;
      const cy=y-1-Math.sin(u*Math.PI)*d.rise;
      const alpha=smooth(0,.07,a)*(1-smooth(.2,1,u))*fade*(rock?.33:.42);
      p.shade(cx-r*1.7,cy-r*.65,cx+r*1.7,y,(px,py,out)=>{
        const dx=(px-cx)/(r*1.7),dy=(py-cy)/(r*.65),q=dx*dx+dy*dy;
        if(q>1+.06*Math.sin(dx*5+d.phase)||py>y)return;
        out.c=C[dy<-.25?4:3];out.a=alpha*(q>.68?.35:1);
      });
    }
  }
  return { duration, chunks: chunks as readonly ImpactRubble[], displacement, draw };
}
