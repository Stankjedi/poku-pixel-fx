/** A proper 3D ribbon with curved tip, fading echo, sparks and impact cue. */
import { type EffectMeta3D } from "../fx.js";
import { type Color3D } from "../frame.js";
import { type Vec3, Rng3D, clamp3, outCubic3, smooth3, TAU3 } from "../math.js";
import { Particles3D } from "../particles.js";
import { Painter3D } from "../painter.js";

export interface ArcSlash3DOptions {
  seed: number;
  radius: number;
  palette: Color3D[];
}
export const meta: EffectMeta3D<ArcSlash3DOptions> = {
  id: "melee/arc-slash-3d",
  name: "Arc Slash 3D",
  description: "Two curved ribbon surfaces sweep in real 3D, with a cool trailing edge and hot sparks thrown from the tip.",
  duration: 1.25, loop: false,
  options: { seed: 81, radius: 3.25, palette: ["#203365", "#2f5ba4", "#3d8ad3", "#63d1ed", "#b2f2ff", "#ffffff"] },
  stages: [{ at: 0, label: "WINDUP" }, { at: 0.13, label: "CUT" }, { at: 0.35, label: "TRAIL" }, { at: 0.8, label: "RECOVERY" }],
  cues: [{ at: 0.145, type: "hit", value: 1 }, { at: 0.145, type: "shake", value: 0.18 }],
};
const START = -2.55, SPAN = 3.4;
export function create(options: ArcSlash3DOptions) {
  const rng = new Rng3D(options.seed), ps = new Particles3D(0, 400), colors = options.palette;
  let t = 0, impact = false;
  const arc = (theta: number, radius: number, layer = 0): Vec3 => {
    const x = 0.4 + Math.cos(theta) * radius;
    const y = 2.55 + Math.sin(theta) * radius * 0.78 + layer * 0.08;
    const z = Math.cos(theta * 1.5) * radius * 0.12 - layer * 0.28;
    return [x, y, z];
  };
  return {
    update(dt: number) {
      t += dt;
      if (!impact && t >= 0.145) {
        impact = true;
        const head = arc(START + SPAN, options.radius);
        for (let i = 0; i < 56; i++) {
          const theta = rng.range(START + SPAN - 0.5, START + SPAN + 0.6);
          const power = rng.range(1, 6);
          ps.spawn({
            position: [head[0] + rng.range(-0.2, 0.2), head[1] + rng.range(-0.3, 0.3), head[2]],
            velocity: [Math.cos(theta) * power, rng.range(-0.8, 3.4), Math.sin(theta) * power],
            life: rng.range(0.14, 0.6), radius: rng.range(0.03, 0.095), gravity: 5, drag: 0.9,
            color: rng.pick(colors.slice(3)), style: "spark", emission: 0.3,
          });
        }
      }
      ps.update(dt);
    },
    draw(p: Painter3D) {
      const lead = outCubic3(t / 0.15);
      const tail = smooth3(0.17, 0.59, t);
      if (lead > tail) {
        const n = 56, a0 = START + SPAN * tail, a1 = START + SPAN * lead;
        for (let i = 0; i < n; i++) {
          const u0 = i / n, u1 = (i + 1) / n;
          const angle0 = a0 + (a1 - a0) * u0, angle1 = a0 + (a1 - a0) * u1;
          const w0 = 0.04 + 0.58 * Math.pow(Math.max(0, Math.sin(Math.PI * u0)), 0.65) * (1 - tail * 0.55);
          const w1 = 0.04 + 0.58 * Math.pow(Math.max(0, Math.sin(Math.PI * u1)), 0.65) * (1 - tail * 0.55);
          const out0 = arc(angle0, options.radius), out1 = arc(angle1, options.radius);
          const in0 = arc(angle0, options.radius - w0), in1 = arc(angle1, options.radius - w1);
          const c = colors[Math.min(colors.length - 1, Math.max(0, Math.floor(2 + u0 * 4 - tail * 2)))];
          p.triangle(out0, in0, out1, c, 1, 0.15);
          p.triangle(out1, in0, in1, c, 1, 0.15);
          p.line(out0, out1, 0.035, colors[colors.length - 1], 0.65 * (1 - tail), 0.2);
        }
      }
      // Secondary echo lives in a slightly different depth plane, not a 2D overlay.
      const echo = clamp3((t - 0.03) / 0.18) * (1 - smooth3(0.3, 0.72, t));
      if (echo > 0) for (let i = 1; i <= 22; i++) {
        const a = START + SPAN * i / 22 * echo;
        const b = START + SPAN * (i - 1) / 22 * echo;
        p.line(arc(a, options.radius * 0.79, 1), arc(b, options.radius * 0.79, 1), 0.055, colors[2], (1 - smooth3(0.4, 0.7, t)) * 0.9, 0.1);
      }
      if (t > 0.08 && t < 0.6) {
        const head = arc(START + SPAN * clamp3(t / 0.15), options.radius);
        p.glow(head, 1.05, colors[3], 0.45 * (1 - smooth3(0.13, 0.6, t)));
        p.point(head, 0.1, colors[5], 1, 0.3);
      }
      ps.draw(p);
    },
  };
}
