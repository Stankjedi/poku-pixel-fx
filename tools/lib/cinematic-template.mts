/** Layered, source-bound generation starter. The subject silhouette still belongs to the author. */
export function cinematicTemplate(name: string, category: string, loop: boolean, addedAt = new Date().toISOString(), particleForm: 'ribbon' | 'volume' = 'ribbon'): string {
  if (!['ribbon', 'volume'].includes(particleForm) || (particleForm === 'volume' && loop))
    throw new RangeError('Compact particle template supports one-shot volume or existing ribbons');
  const compact = particleForm === 'volume';
  const palette = ({ fire: 'fire', explosions: 'fire', ice: 'ice', water: 'water', holy: 'holy',
    shadow: 'shadow', lightning: 'electric', nature: 'leaf', scifi: 'cyber' } as Record<string, string>)[category] ?? 'arcane';
  return `import { PAL, fit, createCinematicParticles2D, createKineticBody2D, ${compact ? 'createParticleVolume2D, ' : ''}motionTrail,
  drawTrail, smooth, TAU, loopTime } from "../../core/index.js";
import type { Painter, Point } from "../../core/painter.js";

export const meta = {
  addedAt: ${JSON.stringify(addedAt)},
  name: ${JSON.stringify(name)},
  desc: ${JSON.stringify(compact ? "Luminous source study shedding finite arcane motes. Editable motion, not inferred spell semantics." : "Path-oriented luminous source study with a changing primary body. Category selects palette, not physical material or subject.")},
  tags: [${JSON.stringify(category)}, "layered-particles"],
  size: [240, 160], origin: [100, 100], duration: ${loop ? '3.2' : '2.4'}, loop: ${loop}, fps: 40, bg: "dark",
  options: { palette: PAL.${palette}, seed: 1 },
};

// First-generation composition: primary silhouette > coherent ribbons > sparse sparks > local light.
// Replace these paths with the requested subject (wings, blade, plume, etc.), not another generic burst.
const sourcePosition = (t: number): Point => {
${loop ? `  const angle = t / meta.duration * TAU;
  return [Math.cos(angle) * 25, -24 + Math.sin(angle) * 12];` : `  const u = smooth(0.28, 1.32, t);
  return [-34 + 90 * u, -18 - 22 * Math.sin(u * Math.PI)];`}
};
const sourceVelocity = (t: number): Point => {
  const a = sourcePosition(t - 0.001), b = sourcePosition(t + 0.001);
  return [(b[0] - a[0]) / 0.002, (b[1] - a[1]) / 0.002];
};
// The geometric tangent remains defined at rest, unlike a zero source velocity.
const sourceTangent = (t: number): Point => {
${loop ? `  const angle = t / meta.duration * TAU;
  return [-25 * Math.sin(angle), 12 * Math.cos(angle)];` : `  const u = smooth(0.28, 1.32, t);
  return [90, -22 * Math.PI * Math.cos(u * Math.PI)];`}
};

export function create(o: typeof meta.options) {
  const C = fit(o.palette, 7), hotToCool = [C[5], C[4], C[3], C[2]];
${compact ? '  const matterVolume = createParticleVolume2D({ seed: o.seed, profile: "energy", palette: hotToCool });\n' : ''}  // This generic source is luminous matter, not ice/fire/water inferred from its folder.
  // For material-specific behavior use the explicit --material / --action recipe instead.
  const body = createKineticBody2D({ seed: o.seed, material: "energy", profile: "stream",
    palette: [C[6], C[5], C[4], C[3], C[2]]${loop ? ', period: meta.duration' : ''} });
  const bodyState = (time: number) => {
    const tangent = sourceTangent(time), growth = ${loop ? '1' : '0.35 + 0.65 * smooth(0, 0.28, time)'};
    return { time, position: sourcePosition(time), size: [18 * growth, 9 * growth] as Point,
      angle: Math.atan2(tangent[1], tangent[0]) };
  };
  const common = { seed: o.seed, palette: hotToCool,
    emissionFrame: (birth: number, _id: number, u: number) => {
      const state = bodyState(birth), surface = body.sampleSurface(state, 0.25 + u * 0.5);
      const rear: Point = [-Math.cos(state.angle), -Math.sin(state.angle)];
      return { position: surface.position,
        direction: [rear[0] * 0.75 + surface.normal[0] * 0.25, rear[1] * 0.75 + surface.normal[1] * 0.25] as Point,
        inheritedVelocity: sourceVelocity(birth) };
    }, start: ${loop ? '0' : '0.2'}, duration: ${loop ? 'meta.duration' : '1.12'}, spread: 1.1 };
  // Different scales and decay rates give hierarchy. Particle count is not a substitute for shape.
  const ribbons = createCinematicParticles2D({ ...common, count: ${loop ? '180' : '80'}, style: "ribbon", life: [0.35, 0.7],
    speed: [16, 38], size: [2, 4.5], curl: { amplitude: 4, frequency: 1.3 },
    trailSeconds: 0.2, emission: 0.08, lightRadius: 4, layer: "back" });
  const sparks = createCinematicParticles2D({ ...common, seed: o.seed + 71, count: ${loop ? '220' : '100'}, style: "spark",
    life: [0.25, 0.65], speed: [20, 68], size: [0.55, 1.1], spread: 2.2, gravity: 22,
    trailSeconds: 0.07, curl: { amplitude: 2, frequency: 1 }, emission: 0.08 });
  const embers = createCinematicParticles2D({ ...common, seed: o.seed + 193, count: ${loop ? '70' : '32'}, style: "ember",
    palette: [C[4], C[3], C[2]], life: [0.45, 0.85], speed: [6, 18], size: [0.5, 1.3],
    gravity: -12, drag: 1.4, curl: { amplitude: 3, frequency: 0.7 }, emission: 0.025, layer: "back" });
${loop ? `  // Canonicalize sub-nanosecond modulo noise before pixel-edge coverage decisions.
  const phase = (t: number) => (Math.round(loopTime(t, meta.duration) * 1e9) / 1e9) % meta.duration;
` : ''}  const times = (t: number) => ${loop ? '[phase(t), phase(t) + meta.duration]' : '[t]'};
  return {
    drawBack(p: Painter, t: number) {
      ${loop ? '' : 'if (t <= 0 || t >= meta.duration) return;'}
      for (const time of times(t)) { ${compact ? `for (const q of ribbons.sample(time)) {
        if (!(q.alpha > 0) || !(q.size > 0)) continue;
        matterVolume.draw(p, q);
        // Keep exactly the previous single head-light call, independent of the new footprint.
        p.glow(q.x, q.y, 4, q.color, 0.08 * q.alpha);
      }` : 'ribbons.draw(p, time, "back");'} embers.draw(p, time, "back"); }
    },
    draw(p: Painter, t: number) {
      ${loop ? 't = phase(t);' : 'if (t <= 0 || t >= meta.duration) return;'}
      const a = ${loop ? '0.85 + 0.15 * Math.sin(t / meta.duration * TAU)' : 'smooth(0, 0.22, t) * (1 - smooth(1.26, 1.65, t))'};
      const [x, y] = sourcePosition(t);
      const trail = motionTrail(sourcePosition, t${loop ? ' + meta.duration' : ''}, 0.23, 14);
      drawTrail(p, trail, { color: C[2], head: C[4], width: 4, alpha: a * 0.7, light: 0 });
      // One changing curved primary, not a fixed right-facing polygon with moving decoration.
      body.draw(p, { ...bodyState(t), opacity: a });
      p.glow(x, y, 16, C[4], a * 0.2);
      for (const time of times(t)) sparks.draw(p, time, "front");
    },
  };
}

// This is an editable starting composition, not proof of artistic quality or a finished subject.
// Keep one dominant silhouette and negative space. Inspect the first complete generation at 1x and full speed.
`;
}
