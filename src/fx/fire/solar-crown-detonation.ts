import type { Painter } from '../../core/painter.js';
import { fit, sparkle, rand, TAU, WHITE, clamp } from '../../core/index.js';

/** A brief, rising miniature sun that breaks into hot spokes and orbiting embers. */
export const meta = {
  name: 'Solar crown detonation',
  desc: 'A compressed sun ignites into a many-pointed crown, releases twin expanding shock rings and sheds curved golden cinders.',
  tags: ['fire', 'sun', 'solar', 'crown', 'explosion', 'burst', 'magic', 'radiant', 'one-shot'],
  size: [224, 224], origin: [112, 112], duration: 2.5, loop: false, fps: 24, bg: 'dark',
  options: { palette: ['#37132e', '#802143', '#d93b37', '#ff782d', '#ffc44d', '#ffef93', '#fffbe1', '#ffffff'], seed: 19 },
};
const smoothstep = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8), centerY = 0;
  const intro = smoothstep(t / 0.23), release = smoothstep((t - 0.25) / 0.25);
  const life = Math.pow(clamp((2.45 - t) / 0.8), 1.25);
  const core = (5 + 13 * intro + 7 * release) * Math.pow(clamp((1.95 - t) / 1.15), 0.5);
  // A dark rim gives the star a strong silhouette even over light backgrounds.
  if (core > 0.25) {
    p.glow(0, centerY, 42 + 34 * release, C[3], 0.45 * life);
    p.disc(0, centerY, core + 3, C[1], life);
    p.disc(0, centerY, core + 1, C[3], life);
    p.disc(0, centerY, core * 0.78, C[5], life);
    p.disc(-core * 0.15, centerY - core * 0.15, core * 0.48, WHITE, life);
  }
  // Alternating flares extend and then break away from the corona.
  const rayLife = Math.sin(Math.PI * clamp((t - 0.15) / 1.45)) * life;
  if (rayLife > 0) for (let i = 0; i < 16; i++) {
    const angle = i * TAU / 16 + 0.16 * t;
    const inner = core * 0.8, length = (i % 2 ? 25 : 51) * (0.75 + 0.25 * rand(i, o.seed)) * rayLife;
    const x = Math.cos(angle), y = Math.sin(angle);
    p.line(x * inner, y * inner, x * (inner + length), y * (inner + length), C[i % 2 ? 3 : 5], rayLife);
    p.glowLine(x * inner, y * inner, x * (inner + length * 0.7), y * (inner + length * 0.7), 4, C[3], 0.12 * rayLife);
    if (i % 2 === 0 && rayLife > 0.2) sparkle(p, x * (inner + length), y * (inner + length), 2 + 2 * rayLife, WHITE, C[4], rayLife * 0.6);
  }
  // Two sharp shockwaves move at different speeds; rings fade as the cinders escape.
  for (let i = 0; i < 2; i++) {
    const u = clamp((t - 0.27 - i * 0.13) / 1.05);
    if (u > 0 && u < 1) p.ring(0, centerY, 10 + 79 * (1 - Math.pow(1 - u, 2)), 1.2 + 1.4 * (1-u), C[i ? 3 : 5], (1-u) * life);
  }
  // Cinders spiral outward and cool from white to amber, at reproducible offsets.
  for (let i = 0; i < 28; i++) {
    const delay = 0.26 + rand(i, o.seed + 1) * 0.36, u = (t - delay) / (1.5 + 0.3 * rand(i, o.seed + 2));
    if (u <= 0 || u >= 1) continue;
    const angle = TAU * (i / 28 + 0.05 * rand(i, o.seed + 3)) + 0.55 * u;
    const dist = 14 + 82 * (1 - Math.pow(1-u, 1.7)), fade = Math.sin(Math.PI * u) * life;
    const x = Math.cos(angle) * dist, y = Math.sin(angle) * dist;
    p.dot(x, y, u < 0.4 ? C[6] : C[3], fade);
    p.dot(x - Math.cos(angle) * 2, y - Math.sin(angle) * 2, C[2], fade * 0.65);
    if (i % 4 === 0) p.glow(x, y, 5, C[4], 0.14 * fade);
  }
}
