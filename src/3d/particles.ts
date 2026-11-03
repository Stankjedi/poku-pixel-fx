import { type Vec3, clamp3, smooth3 } from "./math.js";
import { type Color3D } from "./frame.js";
import { Painter3D } from "./painter.js";

export type ParticleStyle3D = "point" | "spark" | "shard";
export interface ParticleSpec3D {
  position: Vec3;
  velocity: Vec3;
  life: number;
  radius: number;
  color: Color3D;
  ramp?: readonly Color3D[];
  gravity?: number;
  drag?: number;
  bounce?: number;
  emission?: number;
  style?: ParticleStyle3D;
}
export interface Particle3D {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; radius: number;
  /** Time since birth or the last bounce; a trail must not rewind through either event. */
  trailAge: number;
  color: Color3D; ramp?: readonly Color3D[];
  gravity: number; drag: number; bounce: number; emission: number;
  style: ParticleStyle3D;
}

// Keep 3D independent of src/core. These are exact integrals of dv/dt = acceleration - drag * v.
function accelerationTime(dt: number, drag: number, travel: number) {
  const z = drag * dt;
  return Math.abs(z) < 1e-3
    ? dt * dt * (0.5 + z * (-1 / 6 + z * (1 / 24 + z * (-1 / 120 + z / 720))))
    : (dt - travel) / drag;
}

/** Deterministic, allocation-free-per-step analytic particle movement with optional ground bounce. */
export class Particles3D {
  readonly list: Particle3D[] = [];
  private readonly renderOrder: number[] = [];
  private readonly renderDepth: number[] = [];
  constructor(public ground = 0, public limit = 2000) {}
  spawn(p: ParticleSpec3D) {
    if (this.list.length >= this.limit || p.life <= 0) return;
    this.list.push({
      x: p.position[0], y: p.position[1], z: p.position[2],
      vx: p.velocity[0], vy: p.velocity[1], vz: p.velocity[2],
      max: p.life, life: p.life, radius: p.radius, color: p.color, trailAge: 0,
      ramp: p.ramp, gravity: p.gravity ?? 0, drag: p.drag ?? 0, bounce: p.bounce ?? 0,
      emission: p.emission ?? 0, style: p.style ?? "point",
    });
  }
  clear() { this.list.length = 0; }
  update(dt: number) {
    // O(n) stable in-place compaction avoids splice shifts and preserves draw order.
    let write = 0;
    for (let read = 0; read < this.list.length; read++) {
      const p = this.list[read];
      p.life -= dt;
      if (p.life <= 0) continue;
      const damping = Math.exp(-p.drag * dt);
      const travel = p.drag === 0 ? dt : -Math.expm1(-p.drag * dt) / p.drag;
      const fall = accelerationTime(dt, p.drag, travel);
      p.x += p.vx * travel; p.z += p.vz * travel;
      p.y += p.vy * travel - p.gravity * fall;
      p.vx *= damping; p.vz *= damping; p.vy = p.vy * damping - p.gravity * travel;
      p.trailAge += dt;
      if (p.y < this.ground && p.vy < 0) {
        p.y = this.ground;
        p.trailAge = 0;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.65; p.vz *= 0.65;
        if (Math.abs(p.vy) < 0.08) p.vy = 0;
      }
      this.list[write++] = p;
    }
    this.list.length = write;
  }
  draw(painter: Painter3D) {
    // Submit transparent particles far-to-near without changing simulation, spawn or RNG order.
    // Reuse only renderer scratch; equal depths keep the authored list order deterministically.
    const order = this.renderOrder, depth = this.renderDepth, position: [number, number, number] = [0, 0, 0];
    const count = this.list.length;
    order.length = depth.length = count;
    for (let i = 0; i < count; i++) {
      const p = this.list[i];
      position[0] = p.x; position[1] = p.y; position[2] = p.z;
      order[i] = i;
      depth[i] = painter.project(position).depth;
    }
    order.sort((a, b) => depth[a] - depth[b] || a - b);
    for (const i of order) {
      const p = this.list[i];
      const age = 1 - p.life / p.max, opacity = 1 - smooth3(0.6, 1, age);
      const color = p.ramp?.[Math.min(p.ramp.length - 1, Math.floor(age * p.ramp.length))] ?? p.color;
      const at: Vec3 = [p.x, p.y, p.z];
      const size = p.radius * (1 - 0.4 * clamp3(age));
      if (p.style === "spark") {
        // Evaluate the real trajectory backwards instead of extrapolating a straight velocity vector.
        // Limit it at birth/bounce so a new spark cannot grow a tail before it exists or below the floor.
        const dt = -Math.min(0.035 * (1 - age), p.trailAge);
        const travel = p.drag === 0 ? dt : -Math.expm1(-p.drag * dt) / p.drag;
        const fall = accelerationTime(dt, p.drag, travel);
        const tail: Vec3 = [p.x + p.vx * travel, p.y + p.vy * travel - p.gravity * fall, p.z + p.vz * travel];
        painter.line(at, tail, size * 0.65, color, opacity, p.emission * (1 - age));
      } else if (p.style === "shard") {
        painter.line([p.x - size * 0.3, p.y, p.z], [p.x + size * 0.3, p.y + size * 2.2, p.z + size * 0.3], size, color, opacity, p.emission);
      } else {
        painter.point(at, size, color, opacity, p.emission * (1 - age));
      }
    }
  }
}
