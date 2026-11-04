// Merged smoke volume and sprite rotation use the projectile helpers adapted from Sprite Fusion's
// open-source VFX (https://www.spritefusion.com/pixel-art-vfx/explosion), MIT, Copyright (c) 2026 Hugo Duprez.
import { CubicFlightPath, createExhaustWake, drawRocketJet, dragDisplacement, Rng, fit, smooth, mix, clamp,
  drawTrail, motionTrail, rand, WHITE, createGroundImpact, impactKick2D, defineImpactContact2D, impactContactAge2D, flightEndpointAtContact } from '../../core/index.js';
import type { Painter } from '../../core/painter.js';
import type { Point } from '../../core/shapes.js';
import type { ExhaustPuff } from '../../core/propulsion.js';
import { cloud, turnSprite } from './_lib.js';

export const meta = {
  name: 'Missile salvo',
  desc: 'Three steel missiles arc through hanging exhaust. Staggered contacts buckle mineral ground, eject bouncing rubble and spread low dust under sharp flame tongues.',
  tags: ['projectile', 'missile', 'salvo', 'rocket', 'smoke', 'explosion', 'one-shot'],
  size: [352, 232], origin: [232, 204], duration: 3.8, loop: false, fps: 30, bg: 'ground',
  options: {
    palette: ['#381823', '#702329', '#ad3228', '#e25328', '#fa8634', '#ffb849', '#ffdb73', '#fff2bd', '#ffffff'],
    metal: ['#151925', '#323e53', '#63758b', '#a6bacb', '#e5eff1'],
    ground: ['#19171b', '#312a29', '#514238', '#77614e', '#a0896c', '#c5b18b'],
    smoke: ['#20212b', '#34333d', '#4d4952', '#68616c', '#8a7f89', '#aea0a7', '#d0c1c4'],
    groundMaterial: 'stone' as 'stone' | 'soil', impactStrength: 1.05, seed: 23,
  },
};
type Options = typeof meta.options;
const SHIP = [
  'ff.................', '.f.hhhhhhhhhhrr....', '.ffmmmmmmmmmmrrrh..',
  'nmmmmmmmmmmmmrrrrrw', '.ffssssssssssrrrd..', '.f.ddddddddddrr....', 'ff.................',
];
export const missileTimings = [
  { launch: 0.08, flight: 1.00, target: -24 },
  { launch: 0.26, flight: 0.99, target: 0 },
  { launch: 0.44, flight: 1.10, target: 24 },
] as const;
export const missileContacts = Object.freeze(missileTimings.map((m, i) => defineImpactContact2D({
  id: `missile-${i + 1}`, at: m.launch + m.flight, position: [m.target, 0], normal: [0, -1],
  material: 'stone', strength: 1.05, radius: 22,
})));
export function contacts(o: Options) {
  if (!Number.isFinite(o.impactStrength)) throw new RangeError('Impact strength must be finite');
  return missileContacts.map(c => defineImpactContact2D({ ...c, material: o.groundMaterial,
    strength: clamp(o.impactStrength, 0, 1.3) }));
}
const CURVES: [Point, Point, Point][] = [
  [[-180, -29], [-180, -193], [-52, -200]],
  [[-180, -29], [-130, -112], [-95, -156]],
  [[-180, -29], [-140, -49], [-8, -122]],
];
// The visible nose cell spans heading-local x=[9,10], y=[-.5,.5]. Its lower front
// corner, not the missile's center, reaches the floor at the authored contact.
export const missilePaths = Object.freeze(missileContacts.map((contact, i) => {
  const curve = CURVES[i];
  const endpoint = flightEndpointAtContact([...contact.position], curve[2], [10, .5]);
  return new CubicFlightPath([curve[0], curve[1], curve[2], endpoint]);
}));

export function create(o: Options) {
  const F = fit(o.palette, 9), M = fit(o.metal, 5), S = fit(o.smoke, 7), G = fit(o.ground, 6), rng = new Rng(o.seed);
  const warm = [mix(S[0], F[0], .5), mix(S[1], F[1], .5), mix(S[2], F[2], .45), F[3], F[4], F[6], F[7]];
  const palette = { f: M[1], h: M[4], m: M[3], s: M[2], d: M[0], n: M[0], r: F[2], w: F[7] };
  const hits = contacts(o);
  const missiles = missileTimings.map((timing, i) => {
    const contact = hits[i], path = missilePaths[i];
    return { ...timing, target: contact.position[0], path, contact, impact: contact.at,
      ground: createGroundImpact({ seed: o.seed + i * 431, material: o.groundMaterial, radius: contact.radius, strength: contact.strength, direction: path.atDistance(1).dx, duration: 2.05 }),
      wake: createExhaustWake(path, { duration: timing.flight, power: 1.38, spacing: 2.1,
        nozzle: 9, speed: 33, inherit: .03, drag: 3.5, life: 1.22, radius: 5.6, seed: o.seed + i * 97 }),
      fire: Array.from({ length: 9 }, (_, j) => {
        const side = (j - 4) / 4;
        return { vx: side * rng.range(54, 94), vy: -rng.range(65, 145) * (1.1 - Math.abs(side) * .4),
          life: rng.range(.38, .68), radius: rng.range(5.8, 10), phase: rng.range(0, 6.28) };
      }),
      smoke: Array.from({ length: 14 }, (_, j) => ({ vx: rng.range(-36, 36), vy: -rng.range(20, 72),
        delay: .09 + j * .015, life: rng.range(1.05, 1.58), radius: rng.range(8, 15), phase: rng.range(0, 6.28) })),
      fragments: Array.from({ length: 24 }, (_, j) => ({ vx: rng.range(-106, 106), vy: -rng.range(42, 150),
        life: rng.range(.38, .92), size: j < 7 ? 2 : 1, hot: j % 3 !== 0 })),
    };
  });
  function smokeAt(t: number) {
    const list: ExhaustPuff[] = [];
    for (const m of missiles) {
      list.push(...m.wake.sample(t - m.launch));
      for (const q of m.smoke) {
        const a = t - m.impact - q.delay, u = a / q.life;
        if (a <= 0 || u >= 1) continue;
        list.push({ x: m.target + dragDisplacement(q.vx, 0, a, 2.8),
          y: -5 + dragDisplacement(q.vy, -12, a, 2.8), r: q.radius * (.35 + .8 * Math.sqrt(u)),
          a: smooth(0, .09, a) * (1 - smooth(.18, 1, u)) * .52, b: .76 - u * .27, w: Math.exp(-a * 5) * .8 });
      }
    }
    return list;
  }
  return {
    drawBack(p: Painter, t: number) {
      if (t < meta.duration) for (const m of missiles) m.ground.draw(p, impactContactAge2D(m.contact, t), 'back', { x: m.target, palette: G });
    },
    draw(p: Painter, t: number) {
      if (t >= meta.duration) return;
      cloud(p, smokeAt(t), S, warm, { dens: 1.15, max: .78, lit: 1.1 });
      for (const [i, m] of missiles.entries()) {
        const local = t - m.launch, a = impactContactAge2D(m.contact, t);
        if (local >= 0 && a < 0) {
          const s = m.path.atTime(local, m.flight, 1.38), nx = s.x - s.dx * 9, ny = s.y - s.dy * 9;
          const frame = Math.floor(t * 30 + 1e-6), flicker = .9 + rand(frame, o.seed, i) * .2;
          drawRocketJet(p, { x: nx, y: ny, angle: s.angle, length: 13 * flicker, width: .58,
            frame: frame + i * 31, palette: F });
          p.glow(nx - s.dx * 5, ny - s.dy * 5, 13, F[4], .22);
          turnSprite(p, SHIP, palette, s.x, s.y, s.angle, 9, 3.5);
          p.dot(nx, ny, F[7]);
        }
        if (a < 0 || a >= 1.65) continue;
        const lobes = m.fire.flatMap(q => {
          const u = a / q.life; if (u >= 1) return [];
          return [{ x: m.target + dragDisplacement(q.vx, 0, a, 3.8),
            y: -7 + dragDisplacement(q.vy, -20, a, 3.8),
            r: q.radius * Math.sin(Math.PI * (.12 + .88*u)) * (1-u*.3),
            alpha: 1-smooth(.5, 1, u), heat: 1-u, phase: q.phase }];
        });
        // Merge burning gas before palette quantization: coherent tongues, never concentric fire beads.
        if (lobes.length) {
          const left = Math.min(...lobes.map(q=>q.x-q.r*1.2)), right = Math.max(...lobes.map(q=>q.x+q.r*1.2));
          const top = Math.min(...lobes.map(q=>q.y-q.r*2.1)), bottom = Math.min(0, Math.max(...lobes.map(q=>q.y+q.r*2.1)));
          p.shade(left,top,right,bottom,(x,y,out)=>{
            let density=0, heat=0;
            for(const q of lobes) {
              const dy=(y-q.y)/(q.r*1.9), width=.43+.23*Math.max(0,Math.min(1,dy+1));
              const dx=(x-q.x-Math.sin(dy*3+q.phase)*q.r*.10)/(q.r*width);
              const d=Math.abs(dx)**1.45+Math.abs(dy)**1.35;
              if(d>=1)continue;
              const w=(1-d)*q.alpha; density+=w;heat+=w*q.heat;
            }
            if(density<.08)return;
            const temp=heat/Math.max(.001,density), center=Math.min(1,density*.65);
            const level=density<.24?1: Math.min(7,Math.floor(2+temp*3.5+center*1.5));
            out.c=F[level];out.a=Math.min(1,density*3)*(1-smooth(.65,.78,a));
          });
        }
        for (const q of m.fragments) {
          if (!q.hot || a >= q.life) continue;
          const position = (age: number): Point => [m.target + q.vx * age, -6 + q.vy * age + 170 * age*age];
          const [x, y] = position(a); if (y > -1) continue;
          const alpha = 1 - smooth(q.life*.5, q.life, a);
          drawTrail(p, motionTrail(position, a, .035, 4), { color: F[3], head: F[a < .2 ? 7 : 5], alpha, width: 1, light: .1 });
        }
        if (a < .075) {
          const k = 1 - a / .075;
          const burst: Point[] = [[-15,1],[-6,-8],[-17,-17],[-5,-12],[-1,-27],[4,-12],[12,-20],[8,-6],[19,-2],[7,2]];
          const scale=.78+k*.22;
          p.poly(burst.map(([x,y])=>[m.target+x*scale,y*scale] as Point),F[5]);
          p.poly(burst.map(([x,y])=>[m.target+x*scale*.65,y*scale*.75-2] as Point),a<.035?WHITE:F[7]);
          p.glow(m.target, -8, 34, F[5], .35*k);
        }
        p.glow(m.target, -14 - 18*a, 30, F[4], .19 * (1 - smooth(.05, .5, a)));
      }
      for (const m of missiles) m.ground.draw(p, impactContactAge2D(m.contact, t), 'front', { x: m.target, palette: G });
    },
  };
}

/** Host-side whole-scene shake; skip or set strength=0 for reduced motion. */
export function cameraShake(t: number, options: Options): Point {
  const result: Point = [0, 0];
  for (const [i, contact] of missileContacts.entries()) {
    const kick = impactKick2D(impactContactAge2D(contact, t), clamp(options.impactStrength, 0, 1.3), options.seed + i);
    result[0] += kick[0]; result[1] += kick[1];
  }
  return [Math.max(-5, Math.min(5, result[0])), Math.max(-5, Math.min(5, result[1]))];
}
