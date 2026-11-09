// Frozen pre-optimization reference from 3b151ea. Exact-output regression only.
import { hex } from "../../build/core/color.js";
import { clamp, noise2, rng, smooth, TAU } from "../../build/core/math.js";
function createChargeVolume2D(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new RangeError("Invalid charge volume options");
  const { seed = 1 } = options;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError("Charge seed must be uint32");
  if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32 || Array.from(options.palette).some((c) => typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : typeof c !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c))) throw new RangeError("Invalid charge palette");
  const C = options.palette.map(hex);
  const make = (id) => {
    const r = rng(seed, id, 3191);
    return Array.from({ length: 3 }, (_, i) => ({
      x: i === 0 ? 0.2 : r.range(-0.3, -0.08),
      y: i === 0 ? 0 : (i === 1 ? -1 : 1) * r.range(0.2, 0.37),
      radius: i === 0 ? 0.4 : r.range(0.29, 0.39),
      phase: r.range(0, 1),
      rate: r.range(3.2, 5.1),
      lean: r.range(-0.12, 0.12),
      turn: r.range(-0.3, 0.3)
    }));
  };
  const seeds = [];
  const point = (p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite);
  function resolve(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new RangeError("Invalid charge volume state");
    const { time, position, size, angle = 0, opacity = 1, progress = 0, id = 0 } = state;
    if (!state || !Number.isFinite(time) || Math.abs(time) > 3600 || !point(position) || !point(size) || size.some((v) => v <= 0 || v > 128) || ![angle, opacity, progress].every(Number.isFinite) || opacity < 0 || opacity > 1 || progress < 0 || progress > 1 || !Number.isInteger(id) || id < 0 || id > 8191) throw new RangeError("Invalid charge volume state");
    const descriptors = seeds[id] ?? (seeds[id] = make(id));
    const spent = smooth(0.12, 0.82, progress), collapse = 1 - 0.65 * spent;
    const lobes = descriptors.map((s, i) => {
      const phase = ((time * s.rate + s.phase) % 1 + 1) % 1;
      const discharge = smooth(0.48, 0.62, phase) * (1 - smooth(0.76, 0.93, phase));
      const compact = (i === 0 ? 1 - 0.18 * discharge : 1 - 0.42 * discharge) * collapse;
      return {
        x: s.x * collapse,
        y: (s.y + s.lean * Math.sin(time * 5 + s.phase * TAU)) * collapse,
        rx: s.radius * compact,
        ry: s.radius * (i === 0 ? 0.95 : 0.9) * compact,
        charge: (i === 0 ? 0.82 : 0.68) - discharge * 0.25,
        discharge: discharge * (1 - spent),
        turn: s.turn,
        side: i === 1 ? -1 : 1,
        phase,
        seed: seed + id * 13 + i * 197
      };
    });
    return {
      time,
      position: [...position],
      size: [...size],
      angle,
      opacity,
      progress,
      fade: 1 - smooth(0.6, 1, progress),
      lobes
    };
  }
  return Object.freeze({
    sample: resolve,
    draw(p, state) {
      const s = resolve(state);
      if (s.opacity === 0 || s.fade === 0) return;
      const [rx, ry] = s.size, cs = Math.cos(s.angle), sn = Math.sin(s.angle);
      const ex = Math.abs(cs) * rx * 1.1 + Math.abs(sn) * ry * 1.1;
      const ey = Math.abs(sn) * rx * 1.1 + Math.abs(cs) * ry * 1.1;
      p.shade(s.position[0] - ex, s.position[1] - ey, s.position[0] + ex, s.position[1] + ey, (px, py, out) => {
        const dx = px - s.position[0], dy = py - s.position[1], x = (dx * cs + dy * sn) / rx, y = (-dx * sn + dy * cs) / ry;
        if (Math.abs(x) > 1.05 || Math.abs(y) > 1.05) return;
        let charge = 0, coverage = 0;
        for (const l of s.lobes) {
          const u = (x - l.x) / l.rx, v = (y - l.y) / l.ry;
          const warp = noise2(u * 2.2 + l.phase * 1.3, v * 2.2, l.seed);
          const d = Math.max(Math.abs(u) * 0.82 + Math.abs(v + l.turn * u) * 0.62, Math.abs(v) * 1.12);
          const boundary = 1 + 0.16 * warp;
          if (d < boundary) {
            charge = Math.max(charge, l.charge + 0.13 * (1 - d) + 0.06 * warp - 0.12 * smooth(0.55, 1, d));
            coverage = Math.max(coverage, 0.78 + 0.22 * (1 - d));
          }
          if (l.discharge <= 0.08) continue;
          const ax = l.x - 0.15, ay = l.y, bx = l.x - 0.35, by = l.y + l.side * (0.13 + l.turn), cx = l.x - 0.56, cy = l.y + l.side * (0.23 + l.turn);
          let distance = Infinity;
          for (const [x0, y0, x1, y1] of [[ax, ay, bx, by], [bx, by, cx, cy]]) {
            const vx = x1 - x0, vy = y1 - y0, u2 = clamp(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy));
            distance = Math.min(distance, Math.hypot(x - x0 - vx * u2, y - y0 - vy * u2));
          }
          const width = (0.035 + 0.045 * l.discharge) * (1 - 0.55 * clamp((l.x - x) / 0.6));
          if (distance < width) {
            charge = Math.max(charge, 0.75 + 0.15 * l.discharge);
            coverage = Math.max(coverage, l.discharge);
          }
        }
        if (coverage === 0) return;
        out.c = C[Math.min(C.length - 1, Math.floor((1 - clamp(charge)) * C.length))];
        out.a = s.opacity * s.fade * coverage;
      });
    }
  });
}
export {
  createChargeVolume2D
};
