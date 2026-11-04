/** Art-directed water tools: gravity-driven drops, thin crowns and damped surface waves.
 * This is a deterministic VFX model, not a fluid, refraction or volume-conservation solver. */
import { type Color3D } from "./frame.js";
import { type Vec3, clamp3, cross3, dot3, len3, norm3, Rng3D, smooth3, TAU3 } from "./math.js";
import { Painter3D } from "./painter.js";

export const WATER_RAMP_3D: readonly Color3D[] = ["#102f4b", "#155674", "#217f9d", "#36adc2", "#74d2dc", "#caf3ef"];
const finite = (v: number, fallback: number) => Number.isFinite(v) ? v : fallback;
const vecFinite = (v: Vec3) => v.length === 3 && v.every(Number.isFinite);
const rampOf = (ramp?: readonly Color3D[]) => ramp?.length ? ramp : WATER_RAMP_3D;
const colorAt = (ramp: readonly Color3D[], t: number) => ramp[Math.round(clamp3(t) * (ramp.length - 1))];

export interface LiquidDrop3D {
  position: Vec3; velocity: Vec3; radius: number; life?: number; gravity?: number; drag?: number;
}
export interface LiquidImpact3D { position: Vec3; velocity: Vec3; radius: number; /** Elapsed time within the last update. */ at: number }
interface DropState extends LiquidDrop3D { age: number; life: number; gravity: number; drag: number }

/** Exact trajectory for constant gravity and linear drag over a single step. */
export function advanceLiquidDrop3D(position: Vec3, velocity: Vec3, dt: number, gravity = 9.8, drag = 0): { position: Vec3; velocity: Vec3 } {
  if (!vecFinite(position) || !vecFinite(velocity) || ![dt, gravity, drag].every(Number.isFinite) || dt < 0 || gravity < 0 || drag < 0) throw new RangeError("Invalid liquid trajectory");
  if (drag === 0) return {
    position: [position[0] + velocity[0] * dt, position[1] + velocity[1] * dt - gravity * dt * dt / 2, position[2] + velocity[2] * dt],
    velocity: [velocity[0], velocity[1] - gravity * dt, velocity[2]],
  };
  const k = drag * dt, decay = Math.exp(-k), integral = -Math.expm1(-k) / drag;
  // Stable second integral as drag tends to zero; avoid subtracting nearly equal times.
  const accelerationIntegral = dt * dt * (k < 1e-4 ? 0.5 - k / 6 + k * k / 24 - k * k * k / 120 : (k + Math.expm1(-k)) / (k * k));
  return {
    position: [position[0] + velocity[0] * integral, position[1] + velocity[1] * integral - gravity * accelerationIntegral, position[2] + velocity[2] * integral],
    velocity: [velocity[0] * decay, velocity[1] * decay - gravity * integral, velocity[2] * decay],
  };
}

/** Drops merge into the water plane once. Impacts report the contact point and sub-step time. */
export class LiquidDrops3D {
  private drops: DropState[] = [];
  private impacts: LiquidImpact3D[] = [];
  readonly surface: number;
  readonly capacity: number;
  constructor(surface = 0.035, capacity = 128) {
    this.surface = finite(surface, 0.035);
    this.capacity = Math.floor(clamp3(finite(capacity, 128), 1, 4096));
  }
  get size() { return this.drops.length; }
  clear() { this.drops.length = 0; this.impacts.length = 0; }
  spawn(drop: LiquidDrop3D): boolean {
    if (!vecFinite(drop.position) || !vecFinite(drop.velocity) || !Number.isFinite(drop.radius) || drop.radius <= 0 || drop.position[1] < this.surface || this.drops.length >= this.capacity) return false;
    this.drops.push({ ...drop, position: [...drop.position], velocity: [...drop.velocity], age: 0,
      radius: clamp3(drop.radius, 0.005, 2), life: clamp3(finite(drop.life ?? 5, 5), 0.001, 30),
      gravity: clamp3(finite(drop.gravity ?? 9.8, 9.8), 0, 100), drag: clamp3(finite(drop.drag ?? 0.1, 0.1), 0, 30) });
    return true;
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    if (dt === 0) return;
    const alive: DropState[] = [];
    for (const d of this.drops) {
      const step = Math.min(dt, d.life - d.age);
      const next = advanceLiquidDrop3D(d.position, d.velocity, step, d.gravity, d.drag);
      if (next.position[1] <= this.surface && next.velocity[1] <= 0) {
        let lo = 0, hi = step;
        for (let i = 0; i < 32; i++) {
          const mid = (lo + hi) / 2;
          if (advanceLiquidDrop3D(d.position, d.velocity, mid, d.gravity, d.drag).position[1] > this.surface) lo = mid;
          else hi = mid;
        }
        const contact = advanceLiquidDrop3D(d.position, d.velocity, hi, d.gravity, d.drag);
        this.impacts.push({ position: [contact.position[0], this.surface, contact.position[2]], velocity: contact.velocity, radius: d.radius, at: hi });
      } else if (d.age + dt < d.life) {
        d.position = next.position; d.velocity = next.velocity; d.age += dt; alive.push(d);
      }
    }
    this.drops = alive;
  }
  drainImpacts() { return this.impacts.splice(0, this.impacts.length); }
  draw(painter: Painter3D, palette: readonly Color3D[] = WATER_RAMP_3D, opacity = 1) {
    for (const drop of this.drops) drawLiquidDrop3D(painter, drop.position, drop.velocity, drop.radius, palette, opacity);
  }
}

/** Rounded real-XYZ drop, stretched along travel; five discrete material bands, no additive light. */
export function drawLiquidDrop3D(p: Painter3D, position: Vec3, velocity: Vec3, radius: number, palette?: readonly Color3D[], opacity = 1) {
  if (!vecFinite(position) || !vecFinite(velocity) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(opacity) || opacity <= 0) return;
  const ramp = rampOf(palette), speed = len3(velocity), axis = speed > 0.01 ? norm3(velocity) : [0, 1, 0] as Vec3;
  const side = norm3(cross3(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const across = cross3(axis, side), stretch = 1 + Math.min(0.75, speed * 0.075), width = radius / Math.sqrt(stretch);
  const rings = 5, sectors = 8, vertices: Vec3[][] = [];
  for (let j = 0; j <= rings; j++) {
    const theta = j / rings * Math.PI, y = Math.cos(theta) * radius * stretch, r = Math.sin(theta) * width;
    vertices.push(Array.from({length: sectors}, (_, i): Vec3 => {
      const a = i / sectors * TAU3;
      return [0, 1, 2].map(k => position[k] + axis[k] * y + (side[k] * Math.cos(a) + across[k] * Math.sin(a)) * r) as unknown as Vec3;
    }));
  }
  // Sort translucent triangles back-to-front; the engine keeps a nearest-surface depth buffer.
  const faces: { a: Vec3; b: Vec3; c: Vec3; depth: number; color: Color3D }[] = [];
  const light: Vec3 = norm3([-0.5, 1, 0.5]);
  const add = (a: Vec3, b: Vec3, c: Vec3) => {
    const center: Vec3 = [0, 1, 2].map(k => (a[k] + b[k] + c[k]) / 3) as unknown as Vec3;
    const n = norm3([center[0] - position[0], center[1] - position[1], center[2] - position[2]]);
    const brightness = clamp3(0.42 + dot3(n, light) * 0.52);
    faces.push({ a, b, c, depth: p.project(center).depth, color: colorAt(ramp, brightness) });
  };
  for (let j = 0; j < rings; j++) for (let i = 0; i < sectors; i++) {
    const n = (i + 1) % sectors;
    if (j > 0) add(vertices[j][i], vertices[j+1][i], vertices[j][n]);
    if (j < rings - 1) add(vertices[j][n], vertices[j+1][i], vertices[j+1][n]);
  }
  faces.sort((a,b) => a.depth-b.depth);
  for (const face of faces) p.triangle(face.a, face.b, face.c, face.color, opacity);
  // Preserve even the smallest droplet as one solid pixel, without a glow halo.
  if (radius * p.project(position).scale < 1) p.point(position, radius, colorAt(ramp, 0.7), opacity);
}

export interface LiquidCrown3DOptions {
  center?: Vec3; radius: number; baseRadius?: number; height: number; seed?: number;
  lobes?: number; segments?: number; /** Art-directed drainage opens gaps from the rim. */ breakup?: number; palette?: readonly Color3D[]; opacity?: number;
}
/** Pure crown sampling. Shared rim samples let detachments start on the actual liquid edge. */
export function sampleLiquidCrown3D(options: LiquidCrown3DOptions): Vec3[] {
  const center = options.center ?? [0, 0.04, 0];
  if (!vecFinite(center) || !Number.isFinite(options.radius) || !Number.isFinite(options.height) || options.radius <= 0 || options.height <= 0) return [];
  const segments = Math.floor(clamp3(finite(options.segments ?? 64, 64), 12, 192));
  const lobes = Math.floor(clamp3(finite(options.lobes ?? 9, 9), 3, 20)), rng = new Rng3D(options.seed ?? 1), phase = rng.range(0, TAU3), phase2 = rng.range(0, TAU3);
  return Array.from({length: segments}, (_, i): Vec3 => {
    const a = i / segments * TAU3;
    const finger = (0.5 + 0.5 * Math.cos(a * lobes + phase)) ** 1.65;
    const height = options.height * (0.64 + 0.36 * finger) * (0.9 + 0.1 * Math.sin(a * 3 + phase2));
    const r = options.radius * (1 + 0.035 * Math.sin(a * 5 + phase2) + 0.055 * finger);
    return [center[0] + Math.cos(a) * r, center[1] + height, center[2] + Math.sin(a) * r];
  });
}

/** A curved thin sheet with a lobed liquid rim. No solid crystal normals or emission. */
export function drawLiquidCrown3D(p: Painter3D, options: LiquidCrown3DOptions) {
  const rim = sampleLiquidCrown3D(options), opacity = clamp3(finite(options.opacity ?? 1, 1));
  if (!rim.length || opacity <= 0) return;
  const center = options.center ?? [0,0.04,0], ramp = rampOf(options.palette);
  const base = Math.max(0, finite(options.baseRadius ?? options.radius * 0.58, options.radius * 0.58));
  const strips = 5, vertices: Vec3[][] = [];
  const breakup=clamp3(finite(options.breakup??0,0)),phase=new Rng3D(options.seed??1).range(0,TAU3);
  const torn=(i:number,level:number)=>level>1-breakup*0.72 && Math.sin(i/rim.length*TAU3*7+phase)>1-breakup*1.75;
  for (let j=0;j<=strips;j++) {
    const u=j/strips;
    vertices.push(rim.map((tip,i): Vec3 => {
      const a=i/rim.length*TAU3, r=base+(Math.hypot(tip[0]-center[0],tip[2]-center[2])-base)*(u*u*0.7+u*0.3);
      return [center[0]+Math.cos(a)*r,center[1]+(tip[1]-center[1])*u,center[2]+Math.sin(a)*r];
    }));
  }
  const faces: {a:Vec3;b:Vec3;c:Vec3;color:Color3D;depth:number}[]=[];
  for(let j=0;j<strips;j++) for(let i=0;i<rim.length;i++) {
    if(torn(i,(j+0.5)/strips)) continue;
    const n=(i+1)%rim.length, a=vertices[j][i],b=vertices[j][n],c=vertices[j+1][i],d=vertices[j+1][n];
    const angle=(i+0.5)/rim.length*TAU3;
    const level=0.22+j/strips*0.35+Math.max(0,Math.cos(angle-2.2))*0.22;
    for(const tri of [[a,b,c],[b,d,c]]) faces.push({a:tri[0],b:tri[1],c:tri[2],color:colorAt(ramp,level),depth:(p.project(tri[0]).depth+p.project(tri[1]).depth+p.project(tri[2]).depth)/3});
  }
  faces.sort((a,b)=>a.depth-b.depth);
  for(const f of faces) p.triangle(f.a,f.b,f.c,f.color,opacity);
  // Continuous thin lip with sparse bright crests, not identical radial rays.
  for(let i=0;i<rim.length;i++) {
    if(torn(i,1)) continue;
    const a=i/rim.length*TAU3, highlight=Math.max(0,Math.cos(a-2.2));
    p.line(rim[i],rim[(i+1)%rim.length],0.028,colorAt(ramp,0.52+highlight*0.42),opacity);
  }
}

export interface SurfaceRipple3DOptions {
  origin: Vec3; age: number; strength?: number; speed?: number; life?: number;
  width?: number; seed?: number; palette?: readonly Color3D[]; opacity?: number;
}
/** A finite-width low annular crest with darker trailing trough and fading broken highlights. */
export function drawSurfaceRipple3D(p: Painter3D, options: SurfaceRipple3DOptions) {
  const {origin,age}=options;
  if(!vecFinite(origin)||!Number.isFinite(age)||age<=0) return;
  const life=clamp3(finite(options.life??2.5,2.5),0.01,30);
  if(age>=life) return;
  const strength=clamp3(finite(options.strength??1,1),0,3), speed=clamp3(finite(options.speed??2.2,2.2),0,20);
  const opacity=clamp3(finite(options.opacity??1,1))*clamp3(strength)*Math.exp(-age*0.45)*(1-smooth3(life*0.4,life,age));
  const rise=smooth3(0,0.07,age), damping=Math.exp(-age*1.3)*strength*rise;
  if(!strength||!speed||opacity<=0) return;
  const radius=speed*age, width=Math.min(radius*0.6,clamp3(finite(options.width??0.2,0.2),0.01,2)*(0.8+age*0.15));
  const count=Math.min(160,Math.max(32,Math.ceil(radius*28))), ramp=rampOf(options.palette), phase=new Rng3D(options.seed??1).range(0,TAU3);
  const ring=(i:number,r:number,y:number):Vec3=>{const a=i/count*TAU3;return [origin[0]+Math.cos(a)*r,origin[1]+y,origin[2]+Math.sin(a)*r];};
  for(let i=0;i<count;i++) {
    const a=i/count*TAU3,n=i+1;
    const crest=0.065*damping*(0.86+0.14*Math.sin(a*5+phase));
    const outer0=ring(i,radius+width,0),outer1=ring(n,radius+width,0),top0=ring(i,radius,crest),top1=ring(n,radius,crest),inner0=ring(i,Math.max(0,radius-width),0),inner1=ring(n,Math.max(0,radius-width),0);
    const lit=0.24+Math.max(0,Math.cos(a-2.2))*0.28;
    p.triangle(inner0,top0,inner1,colorAt(ramp,0.18),opacity); p.triangle(inner1,top0,top1,colorAt(ramp,0.18),opacity);
    p.triangle(top0,outer0,top1,colorAt(ramp,lit),opacity); p.triangle(top1,outer0,outer1,colorAt(ramp,lit),opacity);
    if(Math.sin(a*3+phase)>0.1 && damping>0.05) p.line(top0,top1,0.012,colorAt(ramp,0.66),opacity*clamp3(damping));
  }
}
