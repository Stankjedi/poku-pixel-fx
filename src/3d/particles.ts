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
  color: Color3D; ramp?: readonly Color3D[];
  gravity: number; drag: number; bounce: number; emission: number;
  style: ParticleStyle3D;
}

/** Deterministic, allocation-free-per-step Euler particle movement with optional ground bounce. */
export class Particles3D {
  readonly list: Particle3D[] = [];
  constructor(public ground = 0, public limit = 2000) {}
  spawn(p: ParticleSpec3D) {
    if (this.list.length >= this.limit || p.life <= 0) return;
    this.list.push({
      x: p.position[0], y: p.position[1], z: p.position[2],
      vx: p.velocity[0], vy: p.velocity[1], vz: p.velocity[2],
      max: p.life, life: p.life, radius: p.radius, color: p.color,
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
      p.vx *= damping; p.vz *= damping; p.vy = (p.vy - p.gravity * dt) * damping;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < this.ground && p.vy < 0) {
        p.y = this.ground;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.65; p.vz *= 0.65;
        if (Math.abs(p.vy) < 0.08) p.vy = 0;
      }
      this.list[write++] = p;
    }
    this.list.length = write;
  }
  draw(painter: Painter3D) {
    for (const p of this.list) {
      const age = 1 - p.life / p.max, opacity = 1 - smooth3(0.6, 1, age);
      const color = p.ramp?.[Math.min(p.ramp.length - 1, Math.floor(age * p.ramp.length))] ?? p.color;
      const at: Vec3 = [p.x, p.y, p.z];
      const size = p.radius * (1 - 0.4 * clamp3(age));
      if (p.style === "spark") {
        const trail = 0.035 * (1 - age);
        painter.line(at, [p.x - p.vx * trail, p.y - p.vy * trail, p.z - p.vz * trail], size * 0.65, color, opacity, p.emission * (1 - age));
      } else if (p.style === "shard") {
        painter.line([p.x - size * 0.3, p.y, p.z], [p.x + size * 0.3, p.y + size * 2.2, p.z + size * 0.3], size, color, opacity, p.emission);
      } else {
        painter.point(at, size, color, opacity, p.emission * (1 - age));
      }
    }
  }
}
