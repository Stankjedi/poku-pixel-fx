import {
  fractureStone,
  rubblePath
} from "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  Rng,
  clamp,
  fit,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/nature/rock-fracture.ts
var meta = {
  name: "Rock fracture",
  desc: "A sandstone boulder cracks into fitted heavy blocks, falls into bouncing rubble, and settles. Low dust spreads from fractures and landing points, with no glow or crystal glints.",
  tags: ["nature", "earth", "stone", "fracture", "rubble", "dust", "one-shot"],
  size: [256, 144],
  origin: [128, 120],
  duration: 2.8,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1f1918", "#3c3028", "#5d4936", "#80664b", "#a88a61", "#c5ad82"], pieces: 16, force: 1, seed: 17 }
};
var BREAK = 0.36;
var OUTLINE = [[-27, 0], [-32, -12], [-24, -34], [-10, -44], [15, -41], [29, -23], [27, -4], [17, 0]];
function create(o) {
  const C = fit(o.palette, 6), rng = new Rng(o.seed);
  const force = clamp(Number.isFinite(o.force) ? o.force : 1, 0.5, 1.3);
  const count = Math.round(clamp(Number.isFinite(o.pieces) ? o.pieces : 16, 6, 28));
  const cells = fractureStone(OUTLINE, { seed: o.seed, pieces: count, minArea: 27 });
  const dust = [], chunks = [];
  const plume = (x, y, at, size, count2) => {
    for (let i = 0; i < count2; i++) {
      const side = i % 2 ? 1 : -1;
      dust.push({
        x: x + rng.range(-2, 2),
        y,
        at: at + rng.range(0, 0.035),
        vx: side * rng.range(18, 48),
        rise: rng.range(2, 7),
        size: size * rng.range(0.7, 1.2),
        life: rng.range(0.7, 1.15),
        phase: rng.range(0, 6),
        front: i % 3 === 0
      });
    }
  };
  for (const c of cells) {
    const [x, y] = c.center, mass = Math.sqrt(c.area), vertices = c.polygon.map((p) => [p[0] - x, p[1] - y]);
    const path = rubblePath(
      vertices,
      {
        x,
        y,
        vx: (x * 2.05 + rng.range(-13, 13)) * force,
        vy: -(95 + -y / 44 * 70 + rng.range(0, 32)) * force * (1.12 - mass / 65),
        spin: rng.range(-3, 3)
      },
      { duration: meta.duration - BREAK, gravity: 690, bounce: 0.18 + 0.045 * (1 - mass / 20), friction: 0.76 }
    );
    chunks.push({ vertices, x, y, area: c.area, shade: clamp(Math.round(3.3 - x / 33 - y / 75), 2, 4), path });
    plume(x * 0.7, Math.max(-18, y * 0.5), BREAK, 3.5, 1);
    for (const hit of path.impacts) if (hit.speed > 60) plume(hit.x, -1, BREAK + hit.time, clamp(mass / 1.9, 3, 8), 3);
  }
  plume(-13, -2, BREAK, 8, 4);
  plume(14, -2, BREAK + 0.025, 8, 4);
  const grit = Array.from({ length: 30 }, () => {
    const x = rng.range(-26, 26), y = rng.range(-32, -3), size = rng.chance(0.3) ? 2 : 1;
    return {
      size,
      shade: rng.int(2, 5),
      at: BREAK + rng.range(0, 0.05),
      life: rng.range(1.3, 2),
      path: rubblePath(
        [[-size / 2, -size / 2], [size / 2, size / 2]],
        { x, y, vx: (x * 1.9 + rng.range(-35, 35)) * force, vy: -rng.range(80, 200) * force },
        { duration: meta.duration - BREAK, gravity: 760, bounce: 0.27, friction: 0.58 }
      )
    };
  });
  let t = 0;
  function drawDust(p, front) {
    for (const d of dust) {
      const age = t - d.at, u = age / d.life;
      if (u <= 0 || u >= 1 || d.front !== front) continue;
      const drag = (1 - Math.exp(-age * 3.6)) / 3.6, x = d.x + d.vx * drag;
      const y = Math.min(-0.8, d.y - Math.sin(Math.PI * u) * d.rise + 4 * u * u);
      const r = d.size * (0.48 + 0.9 * Math.sqrt(u)), alpha = smooth(0, 0.09, u) * (1 - smooth(0.28, 1, u));
      p.shade(x - r * 1.8, y - r, x + r * 1.8, 0.1, (px, py, out) => {
        const dx = (px - x) / (r * 1.7), dy = (py - y) / (r * 0.7), q = dx * dx + dy * dy;
        const lobe = Math.sin(dx * 5 + d.phase) * 0.06;
        if (q > 1 + lobe || py > 0) return;
        out.c = dy < -0.3 ? C[4] : C[3];
        out.a = alpha * (q > 0.64 ? 0.12 : 0.32);
      });
    }
  }
  const stone = (p, c, age) => {
    const sample = c.path.sample(Math.max(0, age));
    const ca = Math.cos(sample.angle), sa = Math.sin(sample.angle);
    const shake = age < 0 ? Math.sin(t * 99) * smooth(0.12, BREAK, t) * 0.55 : 0;
    const vanish = smooth(2.06 + c.x / 160, meta.duration - 0.08, t), scale = 1 - vanish;
    if (scale <= 0) return;
    const x = sample.x + shake, y = sample.resting ? sample.y * scale : sample.y;
    const v = c.vertices.map(([a, b]) => [(a * ca - b * sa) * scale + x, (a * sa + b * ca) * scale + y]);
    const fade = 1 - vanish;
    p.poly(v, C[c.shade], fade);
    for (const level of [-11, -23, -34]) {
      const localY = level - c.y, intersections = [];
      for (let i = 0; i < c.vertices.length; i++) {
        const a = c.vertices[i], b = c.vertices[(i + 1) % c.vertices.length];
        if (a[1] <= localY && b[1] > localY || b[1] <= localY && a[1] > localY)
          intersections.push(a[0] + (b[0] - a[0]) * (localY - a[1]) / (b[1] - a[1]));
      }
      if (intersections.length !== 2) continue;
      const lo = Math.min(...intersections) + 1, hi = Math.max(...intersections) - 1;
      if (hi - lo < 3) continue;
      p.line(
        (lo * ca - localY * sa) * scale + x,
        (lo * sa + localY * ca) * scale + y,
        (hi * ca - localY * sa) * scale + x,
        (hi * sa + localY * ca) * scale + y,
        C[c.shade - 1],
        fade * 0.45
      );
    }
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const lit = dy * -0.6 - dx * -0.8;
      const edge = age >= 0 ? 1 : smooth(0.08 + (c.x + 32) / 64 * 0.14, BREAK, t);
      if (edge <= 0) continue;
      const inset = age >= 0 && c.area > 80 ? 0.14 : 0;
      if (inset) p.poly([
        a,
        b,
        [b[0] + (x - b[0]) * inset, b[1] + (y - b[1]) * inset],
        [a[0] + (x - a[0]) * inset, a[1] + (y - a[1]) * inset]
      ], C[lit > 0 ? 4 : 2], fade);
      p.line(a[0], a[1], b[0], b[1], C[age < 0 ? 1 : lit > 0 ? 4 : 1], fade * edge);
    }
  };
  return {
    update(dt) {
      t += dt;
    },
    drawBack(p) {
      if (t >= meta.duration) return;
      const fade = 1 - smooth(2.1, 2.72, t);
      if (t < BREAK) p.ellipse(0, 1, 31, 3, C[0], 0.35);
      else for (const c of chunks) {
        const s = c.path.sample(t - BREAK);
        p.ellipse(s.x, 1, Math.sqrt(c.area) * 0.6, 2, C[0], 0.17 * fade);
      }
      drawDust(p, false);
    },
    draw(p) {
      if (t >= meta.duration) return;
      for (const c of chunks) stone(p, c, t - BREAK);
      for (const g of grit) {
        const age = t - g.at;
        if (age < 0 || age >= g.life) continue;
        const s = g.path.sample(age), alpha = 1 - smooth(g.life - 0.35, g.life, age);
        p.rect(s.x, s.y - g.size / 2, g.size, g.size, C[g.shade], alpha);
      }
      drawDust(p, true);
    }
  };
}
export {
  create,
  meta
};
