import { Painter, type Point } from '../core/painter.js';
import { hex, fit } from '../core/color.js';
import { smooth, clamp } from '../core/math.js';
import { createTimingCurve, type TimingCurveKey } from '../core/timing-curve.js';
import { motionTrail, drawTrail } from '../core/quality.js';
import { defineImpactContact2D } from '../core/impact-contact.js';
import { cloneJSON } from './project.js';
import { resolveParameters, type Parameter } from './parameters.js';

export const RECIPE_KINDS = ['thrown-blade', 'ribbon-slash', 'lightning', 'explosion', 'flame', 'portal'] as const;
export type RecipeKind = typeof RECIPE_KINDS[number];
export type RecipeLayer = 'body' | 'trail' | 'glow' | 'debris' | 'environment';
export const RECIPE_LAYERS: readonly RecipeLayer[] = ['environment', 'trail', 'body', 'debris', 'glow'];
export interface RecipeSpec {
  schema: 'poku.effect-recipe/v1'; kind: RecipeKind; intentRef: string;
  duration: number; loop: boolean; seed: number;
  size: [number, number]; origin: [number, number];
  parameters: Record<string, any>;
  path: [Point, Point, Point, Point];
  tracks: Record<RecipeLayer, TimingCurveKey[]>;
  layers: Record<RecipeLayer, boolean>;
}
const TAU = Math.PI * 2;
const titles: Record<RecipeKind, [string, string]> = {
  'thrown-blade': ['Tempered Crescent', 'A visible forged blade spins independently along its thrown path, then strikes metal.'],
  'ribbon-slash': ['Socket Ribbon Slash', 'A blade sweep leads a tapered ribbon with a compact contact response.'],
  lightning: ['Focused Arc', 'A dominant lightning channel leads thinner branches into one grounded contact.'],
  explosion: ['Layered Detonation', 'A rapid pressure front is followed by heavy fragments and cooling smoke.'],
  flame: ['Folded Flame', 'Connected rising flame folds feed a quieter, non-emissive smoke plume.'],
  portal: ['Depth Portal', 'A stable elliptical opening, rear rim and front rim preserve the passage silhouette.'],
};
export const RECIPE_PARAMETERS: readonly Parameter[] = [
  { key: 'width', label: '주형태 두께', group: '형태', type: 'number', default: 5, min: 1, max: 18, step: .5, unit: 'px', invalidates: 'frame' },
  { key: 'spin', label: '자체 회전', group: '운동', type: 'number', default: 1.8, min: -8, max: 8, step: .1, unit: 'turn/s', invalidates: 'frame' },
  { key: 'travel', label: '이동 시간', group: '운동', type: 'number', default: 1.1, min: .2, max: 4, step: .05, unit: 's', invalidates: 'frame' },
  { key: 'density', label: '보조 입자', group: '보조 표현', type: 'number', default: 20, min: 0, max: 100, step: 1, unit: '개', invalidates: 'asset', randomize: true },
  { key: 'glow', label: '광학 발광', group: '빛', type: 'number', default: .45, min: 0, max: 2, step: .05, invalidates: 'frame' },
  { key: 'trail', label: '잔상 길이', group: '운동', type: 'number', default: .11, min: 0, max: .4, step: .01, unit: 's', invalidates: 'frame' },
  { key: 'material', label: '접촉 재질', group: '접촉', type: 'enum', default: 'metal', choices: ['metal', 'stone', 'water', 'ice'], invalidates: 'asset' },
  { key: 'palette', label: '주 팔레트', group: '빛', type: 'color-ramp', default: ['#101c32', '#284c70', '#3c8fc1', '#70d9ee', '#d0fbf3', '#f8fff4'], invalidates: 'frame', protected: true },
];
const durationOf = (kind: RecipeKind) => ({ 'thrown-blade': 2.2, 'ribbon-slash': 1.2, lightning: 1.6, explosion: 2.4, flame: 3, portal: 3 })[kind];
export function createRecipeSpec(kind: RecipeKind, overrides: Partial<RecipeSpec> = {}): RecipeSpec {
  if (!RECIPE_KINDS.includes(kind)) throw new RangeError('Unknown recipe kind');
  const duration = overrides.duration ?? durationOf(kind), loop = overrides.loop ?? (kind === 'flame' || kind === 'portal');
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60 || typeof loop !== 'boolean') throw new RangeError('Invalid recipe duration/loop');
  const keys = loop ? [{ time: 0, value: 1 }, { time: duration, value: 1 }] : [
    { time: 0, value: 0 }, { time: .05 * duration, value: 1 }, { time: .72 * duration, value: 1 }, { time: duration, value: 0 },
  ];
  const parameters = resolveParameters(RECIPE_PARAMETERS, overrides.parameters);
  if(kind==='thrown-blade'&&duration<=.14+parameters.travel)throw new RangeError('Thrown blade duration must include its travel and contact; use project.seconds for an intentional crop');
  if (kind === 'flame' || kind === 'explosion') parameters.palette = overrides.parameters?.palette ?? ['#241c32', '#6f2941', '#bf4939', '#f68a3c', '#ffd778', '#fff1c9'];
  const spec: RecipeSpec = {
    schema: 'poku.effect-recipe/v1', kind, intentRef: overrides.intentRef ?? '', duration, loop, seed: overrides.seed ?? 1,
    size: overrides.size ?? [320, 180], origin: overrides.origin ?? [50, 146], parameters,
    path: overrides.path ?? [[0, -36], [76, -79], [162, -59], [210, -27]],
    tracks: Object.fromEntries(RECIPE_LAYERS.map(l => [l, cloneJSON(overrides.tracks?.[l] ?? keys)])) as RecipeSpec['tracks'],
    layers: { body: true, trail: true, glow: true, debris: true, environment: true, ...overrides.layers },
  };
  if (!Number.isSafeInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffffffff) throw new RangeError('Invalid recipe seed');
  if (spec.size.length !== 2 || spec.size.some(n => !Number.isInteger(n) || n < 16 || n > 2048) || spec.origin.length !== 2 || spec.origin.some(n => !Number.isFinite(n))) throw new RangeError('Invalid recipe canvas');
  if (!Array.isArray(spec.path) || spec.path.length !== 4 || spec.path.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new RangeError('Path needs four finite Bézier points');
  for (const layer of RECIPE_LAYERS) { createTimingCurve(spec.tracks[layer]); if (typeof spec.layers[layer] !== 'boolean') throw new TypeError('Invalid layer visibility'); }
  return cloneJSON(spec);
}
export function resolveRecipe(input: unknown): RecipeSpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Recipe must be an object');
  const s = input as RecipeSpec;
  if (s.schema !== 'poku.effect-recipe/v1') throw new RangeError('Unsupported recipe schema');
  return createRecipeSpec(s.kind, s);
}
export function recipePosition(spec: RecipeSpec, time: number): Point {
  const u = clamp((time - .14) / spec.parameters.travel), v = 1 - u, [a, b, c, d] = spec.path;
  return [v ** 3 * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u ** 3 * d[0], v ** 3 * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u ** 3 * d[1]];
}
function hash(seed: number, i: number): number {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ x >>> 16, 0x7feb352d); x = Math.imul(x ^ x >>> 15, 0x846ca68b);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
}
function rotated(points: readonly Point[], x: number, y: number, angle: number, scale = 1): Point[] {
  const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
  return points.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}
/** A real solid double-bevel blade, guard and grip; its rotation does not steer the trajectory. */
function blade(p: Painter, x: number, y: number, angle: number, width: number, alpha: number) {
  const edge: Point[] = [[-17, -2], [-11, -width], [7, -width - 1], [21, 0], [7, width + 1], [-11, width], [-17, 2]];
  p.poly(rotated(edge, x, y, angle), hex('#142333'), alpha);
  p.poly(rotated([[-13, -1], [-9, -width + 1], [7, -width + 1], [19, 0], [0, 0]], x, y, angle), hex('#d5f4ef'), alpha);
  p.poly(rotated([[-13, 1], [0, 0], [19, 0], [7, width - 1], [-9, width - 1]], x, y, angle), hex('#6298ad'), alpha);
  p.path(rotated([[-12, 0], [18, 0]], x, y, angle), hex('#f4ffed'), alpha, 1);
  p.path(rotated([[-16, -7], [-16, 7]], x, y, angle), hex('#bc8748'), alpha, 3);
  p.path(rotated([[-26, 0], [-17, 0]], x, y, angle), hex('#42313c'), alpha, 4);
  p.path(rotated([[-26, -1], [-18, -1]], x, y, angle), hex('#ba9d7a'), alpha, 1);
}
function contact(p: Painter, x: number, y: number, age: number, spec: RecipeSpec, colors: number[], density: number) {
  if (age <= 0 || age > .8) return;
  const material = spec.parameters.material, fade = 1 - smooth(.2, .8, age);
  const water = material === 'water', stone = material === 'stone', ice = material === 'ice';
  const color = hex(water ? '#79bed0' : stone ? '#9d927e' : ice ? '#b2e4ed' : '#ffe1a1');
  for (let i = 0; i < density; i++) {
    const h = hash(spec.seed, i + 101), a = -Math.PI + h * Math.PI, velocity = 30 + hash(spec.seed, i + 451) * 95;
    // Closed-form linear drag keeps fast sparks compact; gravity is integrated with
    // the same drag, and fragments end when they reach the shared native floor.
    const drag=2,travel=(1-Math.exp(-drag*age))/drag,gravity=water?150:260;
    const px=x+Math.cos(a)*velocity*travel,py=y+Math.sin(a)*velocity*travel+gravity/drag*(age-travel);
    if(py>1)continue;
    if (stone || ice) p.poly(rotated([[-2, -2], [2, -1], [1, 2], [-2, 1]], px, py, h * 9 + age * 6), color, fade);
    else if (water) p.disc(px, py, 1.5 + h * 1.5, color, fade * .8);
    else p.beam(px, py, px - Math.cos(a) * 4, py - Math.sin(a) * 4, 1, color, fade);
  }
  if (water) p.ellipse(x, y + 1, 6 + age * 30, 2 + age * 3, color, fade * .3);
}

export function createRecipeEffect(input: unknown) {
  const spec = resolveRecipe(input), colors = fit(spec.parameters.palette, 6);
  const tracks = Object.fromEntries(RECIPE_LAYERS.map(l => [l, createTimingCurve(spec.tracks[l])])) as Record<RecipeLayer, ReturnType<typeof createTimingCurve>>;
  const [name, desc] = titles[spec.kind], impactTime = .14 + spec.parameters.travel;
  const contactAt = spec.kind === 'thrown-blade' ? impactTime : spec.kind === 'ribbon-slash' ? .4 : .32;
  const endPoint: Point = spec.kind === 'thrown-blade' ? spec.path[3] : spec.kind === 'ribbon-slash' ? [151, -25] : [155, -9];
  const contacts = ['thrown-blade', 'ribbon-slash', 'lightning'].includes(spec.kind)
    ? [defineImpactContact2D({ id: 'primary', at: contactAt, position: endPoint, normal: spec.kind === 'lightning' ? [0, -1] : [-1, 0], material: spec.parameters.material })] : [];
  let coefficientSeed=-1; let coefficients:number[][]=[];
  function resolveCoefficients(seed:number){if(seed!==coefficientSeed){coefficientSeed=seed;coefficients=Array.from({length:Math.round(spec.parameters.density)},(_,i)=>[hash(seed,i),hash(seed,i+193),hash(seed,i+773)]);}return coefficients;}
  function draw(p: Painter, absoluteTime: number, options: Record<string, any> = {}) {
    const t = spec.loop ? ((absoluteTime % spec.duration) + spec.duration) % spec.duration : absoluteTime;
    if (t < 0 || (!spec.loop && t >= spec.duration)) return;
    const seed=Number.isSafeInteger(options.seed)?options.seed>>>0:spec.seed;
    const liveSpec=seed===spec.seed?spec:{...spec,seed};
    const coefficients=resolveCoefficients(seed);
    const C = options.palette ? fit(options.palette, 6) : colors;
    const density = coefficients.length, k = spec.parameters.glow;
    const layer = (id: RecipeLayer, body: () => void) => {
      if (!spec.layers[id] || options.layers?.[id] === false) return;
      const fade = p.fade; p.fade *= clamp(tracks[id].sample(t).value);
      try { if (p.fade > .001) body(); } finally { p.fade = fade; }
    };
    if (spec.kind === 'thrown-blade') {
      const age = t - .14, [x, y] = recipePosition(spec, t), a = age * TAU * spec.parameters.spin;
      const alive = age >= 0 && t < impactTime;
      layer('environment', () => { if (alive) p.ellipse(x, 2, 14, 3, C[0], .35); });
      layer('trail', () => {
        if (!alive || spec.parameters.trail <= 0) return;
        const pts = motionTrail(s => recipePosition(spec, s), t, spec.parameters.trail, 13, .14);
        drawTrail(p, pts, { color: C[2], head: C[3], width: 3, alpha: .62, light: 0 });
      });
      layer('body', () => { if (alive) blade(p, x, y, a, spec.parameters.width, 1); });
      layer('glow', () => { if (alive) p.glow(x, y, 15, C[3], k * .2);const a=t-impactTime;if(a>0&&a<.8&&['metal','ice'].includes(spec.parameters.material))p.glow(spec.path[3][0],spec.path[3][1],7+a*15,C[3],(1-smooth(.2,.8,a))*.25*k); });
      layer('debris', () => contact(p, ...spec.path[3], t - impactTime, liveSpec, C, density));
    } else if (spec.kind === 'ribbon-slash') {
      const u = smooth(.12, .47, t), angle = -1.8 + u * 2.6, cx = 76, cy = -34, radius = 70;
      const head: Point = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * .67];
      layer('trail', () => {
        if (t < .12 || t > .76) return;
        const fade = 1 - smooth(.43, .76, t), arc: Point[] = [];
        const lower: Point[] = [];
        for (let i = 0; i <= 32; i++) {
          const f = i / 32, a = angle - (1 - f) * Math.min(u * 2.6, 1.9), w = Math.sin(f * Math.PI) * spec.parameters.width * 2;
          arc.push([cx + Math.cos(a) * (radius + w), cy + Math.sin(a) * (radius + w) * .67]);
          lower.push([cx + Math.cos(a) * (radius - w), cy + Math.sin(a) * (radius - w) * .67]);
        }
        p.poly([...arc, ...lower.reverse()], C[2], fade * .75);
        p.path(arc, C[4], fade, 1.2);
      });
      layer('body', () => { if (t > .08 && t < .6) blade(p, head[0] - Math.cos(angle) * 10, head[1] - Math.sin(angle) * 10, angle + Math.PI / 2, spec.parameters.width * .65, 1 - smooth(.45, .6, t)); });
      layer('glow',()=>{if(t<.12||t>.76)return;const pts:Point[]=Array.from({length:33},(_,i)=>{const f=i/32,a=angle-(1-f)*Math.min(u*2.6,1.9),r=radius+Math.sin(f*Math.PI)*spec.parameters.width*2;return[cx+Math.cos(a)*r,cy+Math.sin(a)*r*.67];});p.glowPath(pts,4,C[3],(1-smooth(.43,.76,t))*k*.15);});
      layer('debris', () => contact(p, 151, -25, t - .4, liveSpec, C, density));
    } else if (spec.kind === 'lightning') {
      const flicker = t < .32 ? smooth(.02, .12, t) : (1 - smooth(.45, 1.25, t)) * (.55 + .45 * Math.cos(t * 30) ** 2);
      const pts: Point[] = Array.from({ length: 13 }, (_, i) => [48 + i * 8.9 + (i === 0 || i === 12 ? 0 : (hash(seed, i) - .5) * 20), -125 + i * 9.66]);
      layer('body', () => { p.path(pts, C[2], flicker, spec.parameters.width); p.path(pts, C[5], flicker, 1.5); });
      layer('trail', () => {
        for (let i = 2; i < 11; i += 2) {
          const [x, y] = pts[i], side = i % 4 ? -1 : 1;
          p.path([[x, y], [x + side * 19, y + 3], [x + side * 12, y + 17], [x + side * 32, y + 24]], C[3], flicker * .6, 1);
        }
      });
      layer('glow', () => { p.glowPath(pts, 9, C[3], flicker * k * .45); p.glow(155, -9, 20, C[4], flicker * k); });
      layer('debris', () => contact(p, 155, -9, t - .32, liveSpec, C, density));
      layer('environment', () => p.ellipse(155, 1, 26, 4, C[1], flicker * .5));
    } else if (spec.kind === 'explosion') {
      const age = Math.max(0, t - .12), attack = smooth(0, .15, age), decay = 1 - smooth(.25, 1.05, age), radius = 12 + 48 * (1 - Math.exp(-age * 8));
      layer('environment', () => {
        if (age >= .5) return;
        // The pressure wave spreads across the ground plane, beneath the rising
        // fireball, rather than expanding below the native canvas as a full disc.
        const r=10+age*150;
        const front:Point[]=Array.from({length:65},(_,i)=>{const a=i*TAU/64;return[110+Math.cos(a)*r,1+Math.sin(a)*r*.18];});
        p.path(front,C[3],(1-age/.5)*.6,2);
      });
      layer('trail', () => {
        for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + hash(seed,i+711)*.45, r = 7 + age * (13+hash(seed,i+721)*9),lift=age*(11+hash(seed,i+731)*17); p.disc(110 + Math.cos(a) * r, -32 + Math.sin(a) * r * .5 - lift, 6 + age * (9+hash(seed,i+741)*8), hex(i%3===0?'#59505b':'#3f3c4b'), smooth(.25, .6, age) * (1 - smooth(1, 2.2, age)) * .48); }
      });
      layer('body', () => {
        const shape=(scale:number,phase:number,dx=0,dy=0):Point[]=>Array.from({length:24},(_,i)=>{
          const a=i*TAU/24,fold=(i%3===0?1.06:.79)+hash(seed,811+i)*.19;
          const r=radius*scale*fold;return[110+dx+Math.cos(a+phase)*r,-34+dy+Math.sin(a+phase)*r*.82];
        });
        p.poly(shape(1.05,0),C[1],attack*decay*.92);
        p.poly(shape(.91,.025,-1,-2),C[2],attack*decay);
        p.poly(shape(.69,.08,-3,-5),C[3],attack*decay);
        p.poly(shape(.46,.12,-6,-9),C[4],attack*decay);
        p.poly(shape(.23,.17,-8,-12),C[5],attack*decay);
      });
      layer('debris', () => contact(p, 110, -20, age * .65, { ...liveSpec, parameters: { ...spec.parameters, material: 'stone' } }, C, density));
      layer('glow', () => p.glow(110, -34, radius * 1.25, C[3], attack * decay * k));
    } else if (spec.kind === 'flame') {
      const phase = t / spec.duration * TAU;
      layer('environment', () => { p.ellipse(110, 1, 34, 7, C[0], .8); p.poly([[83, 0], [90, -7], [139, -1], [134, 5]], hex('#463a3b')); });
      layer('trail', () => {
        for (let i = 0; i < 6; i++) { const u = (t / spec.duration + i / 6) % 1; p.disc(110 + Math.sin(u * TAU + phase) * (7 + u * 7), -64 - u * 57, 6 + u * 14, hex('#565468'), Math.sin(u * Math.PI) * .22); }
      });
      layer('body', () => {
        for (let side = -1; side <= 1; side++) {
          const height = 77 + 11 * Math.sin(phase + side * 2), x = 110 + side * 13;
          const tip = x + Math.sin(phase * 2 + side) * 10;
          const shape: Point[] = [[x - 20, 0], [x - 24, -22], [x - 15, -45], [tip, -height], [x + 7, -height * .55], [x + 20, -29], [x + 17, -5]];
          p.poly(shape, C[side === 0 ? 3 : 2], .95);
          p.poly([[x - 9, -1], [x - 11, -21], [x + Math.sin(phase + side) * 5, -height * .63], [x + 10, -17], [x + 7, 0]], C[4], .95);
          p.poly([[x - 4, -1], [x - 5, -13], [x + 2, -29], [x + 5, -1]], C[5]);
        }
      });
      layer('debris', () => { coefficients.forEach(([a, b], i) => { const u = (t / spec.duration + a) % 1; const x = 110 + (b - .5) * 60 + Math.sin(u * TAU + i) * 6, y = -10 - u * 115; p.beam(x, y, x - 1, y + 3, 1, C[4], Math.sin(u * Math.PI) * .7); }); });
      layer('glow', () => p.glow(110, -23, 55, C[3], k * (.75 + .08 * Math.sin(phase))));
    } else {
      const phase = t / spec.duration * TAU, cx = 126, cy = -66, rx = 29, ry = 51;
      layer('environment', () => p.ellipse(cx, 1, 39, 6, C[1], .5));
      layer('body', () => {
        p.ellipse(cx, cy, rx, ry, hex('#080e22'));
        p.ellipse(cx, cy, rx - 4, ry - 6, C[0]);
        for (let i = 0; i < 7; i++) { const a = phase + i * TAU / 7; p.beam(cx + Math.cos(a) * 7, cy + Math.sin(a) * 13, cx + Math.cos(a + .35) * 20, cy + Math.sin(a + .35) * 39, 1.5, C[1], .65); }
      });
      layer('trail', () => {
        for (let half = 0; half < 2; half++) {
          const pts: Point[] = Array.from({ length: 49 }, (_, i) => { const a = i / 48 * Math.PI + half * Math.PI; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
          p.path(pts, half ? C[4] : C[2], 1, half ? 3 : 2);
        }
      });
      layer('debris', () => coefficients.forEach(([a, b]) => { const u = phase + a * TAU, r = 1.1 + b * .2; p.rect(cx + Math.cos(u) * rx * r - 1, cy + Math.sin(u) * ry * r - 1, 2, 2, C[3], .8); }));
      layer('glow', () => {
        const pts: Point[] = Array.from({ length: 97 }, (_, i) => [cx + Math.cos(i / 96 * TAU) * rx, cy + Math.sin(i / 96 * TAU) * ry]);
        p.glowPath(pts, 8, C[3], k * .25);
      });
    }
  }
  return {
    meta: { name, desc, tags: ['recipe', spec.kind, spec.parameters.material], size: spec.size, origin: spec.origin, duration: spec.duration, loop: spec.loop, fps: 30, bg: 'dark', heroTime:({'thrown-blade':.65,'ribbon-slash':.35,lightning:.38,explosion:.45,flame:.7,portal:1})[spec.kind],options: { seed: spec.seed, palette: spec.parameters.palette }, recipe: spec.kind },
    contacts: () => contacts,
    draw,
  };
}
