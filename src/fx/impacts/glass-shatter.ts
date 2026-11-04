import type { Painter } from "../../core/painter.js";
import { Rng, fit, clamp, smooth, defineImpactContact2D, impactContactAge2D } from "../../core/index.js";
import { fractureGlass, glassShardPath, glassVertices, type GlassPoint } from "../../core/glass.js";

export const meta = {
  name: "Glass shatter",
  desc: "A clear pane spiders from one strike, peels into fitted translucent slivers, turns edge-on, pings at real floor contacts, and settles. No dust or glow.",
  tags: ["impacts", "glass", "shatter", "fracture", "transparent", "contact", "one-shot"],
  size: [288, 160], origin: [132, 136], duration: 2.6, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#1c333c", "#32606a", "#5a9297", "#8ec0c0", "#c4e5df", "#f3fff5"], seed: 23, spokes: 14, force: 1 },
};
type Options = Omit<typeof meta.options, "palette"> & { palette: (number | string)[] };
export const GLASS_CONTACT_TIME = .3;
const PANE = { left: -28, right: 28, top: -66, bottom: -3 };
const HIT: GlassPoint = [-8, -37], RELEASE_DELAY = .10;
const contact = (o: Options) => defineImpactContact2D({ id: "glass-strike", at: GLASS_CONTACT_TIME, position: HIT,
  normal: [-1, 0], material: "glass", strength: clamp(Number.isFinite(o.force) ? o.force : 1, .5, 1.35), radius: 3 });
export const contacts = (o: Options) => [contact(o)];

export function create(o: Options) {
  const hit = contact(o), C = fit(o.palette, 6), rng = new Rng(o.seed);
  const mesh = fractureGlass(PANE, hit.position, { seed: o.seed, spokes: Math.round(clamp(Number.isFinite(o.spokes) ? o.spokes : 14, 8, 18)), rings: 2 });
  const release = hit.at + RELEASE_DELAY;
  const shards = mesh.cells.map((cell, index) => {
    const [x, y] = cell.center, dx = x - HIT[0], dy = y - HIT[1], distance = Math.hypot(dx, dy), force = hit.strength;
    const vertices = cell.polygon.map(p => [p[0] - x, p[1] - y] as GlassPoint);
    const at = release + distance * .0005, speed = (1 - Math.min(distance / 100, .7));
    const path = glassShardPath(vertices, { x, y, vx: (dx * 3.05 + 35 + rng.range(-11, 11)) * force * speed,
      vy: (dy * 1.0 - 68 - rng.range(0, 22)) * force, spin: rng.range(-4.5, 4.5), tumbleSpeed: rng.range(-9, 9) },
      { duration: meta.duration - release, gravity: 420, bounce: .23 + rng.range(0, .07), friction: .58, drag: .65 });
    return { cell, index, vertices, at, path, gleam: rng.range(0, Math.PI * 2) };
  });
  const outline: [number, number][] = [[PANE.left, PANE.top], [PANE.right, PANE.top], [PANE.right, PANE.bottom], [PANE.left, PANE.bottom]];
  const line = (p: Painter, a: GlassPoint, b: GlassPoint, color: number, alpha: number) => p.line(a[0], a[1], b[0], b[1], color, alpha);
  function drawPane(p: Painter, t: number) {
    if (t >= release) return;
    p.poly(outline, C[2], .14);
    // A narrow rear edge, not a thick extruded block. The background remains visible through the face.
    p.line(PANE.right + 1, PANE.top + 1, PANE.right + 1, PANE.bottom, C[1], .55);
    for (let i = 0; i < 4; i++) line(p, outline[i], outline[(i + 1) % 4], C[i < 2 ? 4 : 2], i < 2 ? .72 : .55);
    p.poly([[-23,-61],[-17,-61],[6,-8],[2,-8]], C[5], .10);
    p.poly([[-13,-61],[-11,-61],[12,-8],[11,-8]], C[5], .16);
    const age = impactContactAge2D(hit, t);
    if (age < 0) return;
    const reach = 1 + age * 880;
    for (const edge of mesh.cracks) {
      let [a, b] = edge;
      let da = Math.hypot(a[0] - HIT[0], a[1] - HIT[1]), db = Math.hypot(b[0] - HIT[0], b[1] - HIT[1]);
      if (da > db) { [a, b] = [b, a]; [da, db] = [db, da]; }
      if (da > reach) continue;
      const u = clamp((reach - da) / Math.max(.01, db - da)), end: GlassPoint = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      // A dark refractive lip keeps the bright crack readable on light scenes too.
      p.line(a[0], a[1] + 1, end[0], end[1] + 1, C[0], .42);
      line(p, a, end, C[4], .82);
    }
  }
  function drawShard(p: Painter, shard: typeof shards[number], t: number) {
    const age = t - shard.at;
    if (age < 0) {
      if (t >= release) {
        const v = shard.cell.polygon;
        p.poly(v.map(q => [...q]), C[2], .14);
        for (let i = 0; i < v.length; i++) line(p, v[i], v[(i + 1) % v.length], C[4], .62);
      }
      return;
    }
    const pose = shard.path.sample(age), fade = 1 - smooth(2.06 + shard.index % 4 * .04, meta.duration - .03, t);
    if (fade <= 0) return;
    const vertices = glassVertices(shard.vertices, pose), facing = Math.abs(Math.cos(pose.tumble));
    const reflect = Math.pow(Math.max(0, Math.sin(pose.tumble * 1.3 + pose.angle + shard.gleam)), 10);
    // Thin clear faces and a single directional edge highlight, never solid stone-colored faces.
    p.poly(vertices, C[2 + (Math.cos(pose.tumble) > 0 ? 1 : 0)], fade * (.08 + .12 * facing + .06 * reflect));
    let brightest = -Infinity, edgeIndex = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      const light = length ? (dx * .7 - dy * .7) / length : 0;
      line(p, a, b, C[light > 0 ? 3 : 1], fade * (light > 0 ? .68 : .37));
      if (light > brightest && length > 2) { brightest = light; edgeIndex = i; }
    }
    if (reflect > .34 && !pose.resting) {
      const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length];
      line(p, a, b, C[5], fade * reflect * .9);
      if (reflect > .75) p.blend(a[0], a[1], C[5], fade * reflect);
    }
  }
  return {
    drawBack(p: Painter, t: number) {
      t = Math.round(t * 1e9) / 1e9;
      if (t >= meta.duration) return;
      const fade = 1 - smooth(2.0, 2.55, t);
      if (t < release) p.ellipse(0, 0, 29, 1.2, C[0], .14);
      else for (const s of shards) {
        const age = t - s.at; if (age < 0) continue;
        const pose = s.path.sample(age), alpha = fade * .1 * (1 - clamp(-pose.y / 80));
        p.ellipse(pose.x, 1, Math.min(7, Math.sqrt(s.cell.area) * .5), .7, C[0], alpha);
      }
    },
    draw(p: Painter, t: number) {
      t = Math.round(t * 1e9) / 1e9;
      if (t >= meta.duration) return;
      drawPane(p, t);
      if (t >= release) for (const s of shards) drawShard(p, s, t);
      const age = impactContactAge2D(hit, t);
      // One crisp reflected impact star, only at contact. Glass never adds light to the light buffer.
      if (age >= 0 && age < .067) {
        const k = 1 - age / .067;
        p.line(HIT[0] - 4 * k, HIT[1], HIT[0] + 4 * k, HIT[1], C[5], k);
        p.line(HIT[0], HIT[1] - 5 * k, HIT[0], HIT[1] + 3 * k, C[5], k);
      }
      // Secondary pings are anchored to real polygon contact points. Sparse tiny splinters, no dust.
      for (const s of shards) for (const h of s.path.impacts) {
        const a = t - s.at - h.time; if (a < 0 || a > .15 || h.speed < 100 || s.index % 3) continue;
        const fade = 1 - a / .15, length = 1 + a * 18;
        p.line(h.x - length, -1 - a * 20, h.x - length - 1, -2 - a * 20, C[4], fade * .7);
        p.line(h.x + length, -1 - a * 12, h.x + length + 1, -1 - a * 12, C[5], fade * .8);
      }
    },
  };
}
