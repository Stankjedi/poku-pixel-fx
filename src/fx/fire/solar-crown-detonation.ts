import type { Painter } from '../../core/painter.js';
import { fit, sparkle, rand, TAU, WHITE, clamp } from '../../core/index.js';

/** A brief, rising miniature sun that breaks into hot spokes and orbiting embers. */
export const meta = {
  addedAt: '2026-11-02T13:49:39Z',
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
  // The corona is a filled, angular fire silhouette rather than isolated light strokes.
  const burst = smoothstep((t - 0.02) / 0.20) * Math.pow(clamp((1.9 - t) / 1.15), 0.55);
  const radius = (16 + 34 * release) * burst;
  if (radius > 0.5) {
    p.glow(0, centerY, 48 + 35 * release, C[3], 0.48 * life);
    p.shade(-radius * 1.8, -radius * 1.8, radius * 1.8, radius * 1.8, (x, y, out) => {
      const d = Math.hypot(x, y), angle = Math.atan2(y, x);
      const tooth = Math.pow(Math.max(0, Math.cos(angle * 10 - t * 3)), 5);
      const rolling = Math.sin(angle * 5 + t * 9) * 0.11 + Math.sin(angle * 13 - t * 7) * 0.06;
      const edge = radius * (0.86 + rolling + tooth * (0.7 + 0.2 * release));
      if (d > edge) return;
      const u = d / edge;
      const noise = rand(Math.floor(x / 3), Math.floor(y / 3), Math.floor(t * 8), o.seed);
      out.c = u > 0.92 ? C[1] : u > 0.78 ? C[2] : u > 0.62 ? C[3] : u > 0.43 ? C[4] : u > 0.23 ? C[5] : WHITE;
      if (u > 0.4 && noise > 0.75) out.c = C[Math.min(6, Math.max(2, Math.floor((1 - u) * 4 + 2)))];
      out.a = life;
    });
    p.glow(0, centerY, 19, WHITE, 0.3 * life);
  }
  // Expanding, jagged tapered rays with hot cores and molten orange borders.
  const rayLife = Math.sin(Math.PI * clamp((t - 0.12) / 1.58)) * life;
  if (rayLife > 0) for (let i = 0; i < 12; i++) {
    const angle = i * TAU / 12 + 0.14 * t;
    const inner = radius * 0.6, length = (i % 2 ? 32 : 60) * (0.82 + 0.18 * rand(i, o.seed)) * rayLife;
    const ca = Math.cos(angle), sa = Math.sin(angle), outer = inner + length;
    const spread = 2 + 6 * rayLife * (i % 2 ? 0.6 : 1), pad = spread + 2;
    p.shade(Math.min(ca * inner, ca * outer) - pad, Math.min(sa * inner, sa * outer) - pad,
      Math.max(ca * inner, ca * outer) + pad, Math.max(sa * inner, sa * outer) + pad, (x, y, out) => {
        const along = x * ca + y * sa - inner; if (along < 0 || along > length || length < 0.1) return;
        const u = along / length, across = Math.abs(-x * sa + y * ca);
        const width = Math.max(0.45, spread * (1-u) * (0.8 + 0.2 * Math.sin(u * 13 + i)));
        if (across > width) return;
        out.c = across > width * 0.72 ? C[2] : u < 0.34 ? C[6] : u < 0.72 ? C[4] : C[3];
        out.a = rayLife;
      });
    p.glowLine(ca * inner, sa * inner, ca * (inner + length * 0.8), sa * (inner + length * 0.8), 5, C[3], 0.14 * rayLife);
    if (i % 2 === 0 && rayLife > 0.2) sparkle(p, ca * outer, sa * outer, 3 + 3 * rayLife, WHITE, C[4], rayLife * 0.5);
  }
  // Two sharp shockwaves move at different speeds; rings fade as the cinders escape.
  // Curved prominences rise over the rim before snapping away from the crown.
  const prominence = smoothstep((t-.08)/.24) * (1-smoothstep((t-1.0)/.5)) * life;
  if (prominence > .01) for (let i=0;i<5;i++) {
    const a=TAU*i/5+t*.24, r=radius*.86, spread=.14+.04*rand(i,o.seed,20);
    const rootA=a-spread, rootB=a+spread, tip=r+15+9*prominence;
    p.tri(Math.cos(rootA)*r,Math.sin(rootA)*r,
      Math.cos(a+.09)*tip,Math.sin(a+.09)*tip,
      Math.cos(rootB)*r,Math.sin(rootB)*r,C[2],prominence*.8);
    p.line(Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.09)*tip,Math.sin(a+.09)*tip,C[4],prominence*.75);
  }
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
    const r = (1.2 + 2.4 * rand(i, o.seed + 4)) * (1-u) + 0.35;
    p.disc(x - Math.cos(angle) * 3, y - Math.sin(angle) * 3, r * 1.35, C[2], fade * 0.8);
    p.disc(x, y, r, u < 0.4 ? C[6] : C[3], fade);
    p.line(x, y, x - Math.cos(angle) * (4 + 7 * (1-u)), y - Math.sin(angle) * (4 + 7 * (1-u)), C[3], fade * 0.7);
    if (i % 4 === 0) p.glow(x, y, 5, C[4], 0.14 * fade);
  }
}
