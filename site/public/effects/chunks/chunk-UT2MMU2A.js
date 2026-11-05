import {
  P
} from "./chunk-KJLRN7JI.js";
import {
  TAU,
  WHITE,
  clamp,
  ease,
  hex,
  mix,
  rgb,
  scale,
  smooth
} from "./chunk-WFSCDWU6.js";

// src/fx/melee/_lib.ts
var swing = (o) => ({ cx: 0, cy: 0, R: 30, sy: 1, rot: 0, a0: 0, dir: 1, k: 0, ...o });
function through(x, y, th, dir, R, span, at = 0.55, extra = {}) {
  const a = th - dir * Math.PI / 2;
  return swing({ cx: x - Math.cos(a) * R, cy: y - Math.sin(a) * R, R, sy: 1, rot: 0, a0: a - dir * span * at, dir, span, ...extra });
}
function onSwing(s, r, u) {
  const a = s.a0 + s.dir * u, lx = Math.cos(a) * r, ly = Math.sin(a) * r * s.sy - s.k * (s.R - r), c = Math.cos(s.rot), n = Math.sin(s.rot);
  return [s.cx + lx * c - ly * n, s.cy + lx * n + ly * c];
}
function travel(s, u) {
  const [x0, y0] = onSwing(s, s.R, u), [x1, y1] = onSwing(s, s.R, u + 0.01), l = Math.hypot(x1 - x0, y1 - y0) || 1;
  return { x: x0, y: y0, dx: (x1 - x0) / l, dy: (y1 - y0) / l, a: s.a0 + s.dir * u };
}
function plane(s, x, y) {
  const c = Math.cos(s.rot), n = Math.sin(s.rot), dx = x - s.cx, dy = y - s.cy, lx = dx * c + dy * n, ly = -dx * n + dy * c;
  if (!s.k) return [Math.hypot(lx, ly / s.sy), Math.atan2(ly / s.sy, lx)];
  const m = ly + s.k * s.R, A = s.sy * s.sy - s.k * s.k, B = 2 * m * s.k, Cc = lx * lx * s.sy * s.sy + m * m;
  const r = (-B + Math.sqrt(B * B + 4 * A * Cc)) / (2 * A);
  return [r, Math.atan2((m - s.k * r) / s.sy, lx)];
}
function smear(p, s, u0, u1, wMax, fn, half = 0, pad = 1) {
  if (u1 - u0 < 5e-3) return;
  const c = Math.cos(s.rot), n = Math.sin(s.rot), A = s.R + pad + 1, Bn = A * s.sy + s.k * (wMax + 2);
  const hx = Math.hypot(A * c, Bn * n) + 1, hy = Math.hypot(A * n, Bn * c) + 1, rIn = s.R - wMax - 1;
  const over = Math.abs(n) * A + s.k * (wMax + 2) + 2, y0 = half > 0 ? s.cy - over : s.cy - hy, y1 = half < 0 ? s.cy + over : s.cy + hy;
  p.shade(s.cx - hx, y0, s.cx + hx, y1, (x, y, out) => {
    const [r, a] = plane(s, x, y);
    if (r > s.R + pad || r < rIn) return;
    if (half && (Math.sin(a) < 0 ? -1 : 1) !== half) return;
    let u = s.dir * (a - s.a0) % TAU;
    if (u < 0) u += TAU;
    while (u < u0) u += TAU;
    if (u > u1) return;
    return fn(u, r, out, a);
  });
}
function trace(p, s, r, u0, u1, c, a, half = 0, step = 0.6) {
  const du = step / Math.max(4, r);
  for (let u = u0; u <= u1; u += du) {
    const g = s.a0 + s.dir * u;
    if (half && (Math.sin(g) < 0 ? -1 : 1) !== half) continue;
    const [x, y] = onSwing(s, r, u), k = typeof a === "function" ? a(u) : a;
    if (k > 0) p.dither(x, y, typeof c === "function" ? c(u) : c, k);
  }
}
function glowAlong(p, s, r, u0, u1, rad, c, k, half = 0, step = 0.35) {
  for (let u = u0; u <= u1; u += step) {
    const g = s.a0 + s.dir * u;
    if (half && (Math.sin(g) < 0 ? -1 : 1) !== half) continue;
    const [x, y] = onSwing(s, r, u), kk = typeof k === "function" ? k(u) : k;
    if (kk > 4e-3) p.glow(x, y, rad, c, kk);
  }
}
function slash(p, s, t, half = 0) {
  const u = t - s.t0;
  if (u < 0) return;
  const R = s.ramp, n = R.length, life = s.sweep + s.hold + s.trail, hot = s.hot ?? 0;
  const head = ease.outExpo(clamp(u / s.sweep)), tail = smooth(s.sweep + s.hold, life, u), age = clamp(u / life);
  const U = s.span * head, T = s.span * tail, W = s.W * (1 - tail * 0.55);
  if (tail < 1 && U - T > 0.01) {
    smear(p, s, T, U, W, (uu, r, out) => {
      const v = (uu - T) / (U - T), w = W * Math.pow(Math.sin(Math.PI * Math.pow(v, s.lens ? 1 : 2.2)), s.lens ? 0.75 : 0.6);
      if (w < 0.35) return;
      const q = (s.R - r) / w;
      if (q < 0 || q > 1) return;
      const ci = q < 0.22 && age < 0.5 || q < hot * 0.7 ? 0 : Math.round(q * (n - 1) * 0.75 + age * 2.4 - v * 0.8 + 0.4 - hot * 3);
      out.c = R[n - 1 - clamp(ci, 0, n - 1)];
      out.a = Math.min(1, v / (s.lens ? 0.1 : 0.4));
    }, half);
    glowAlong(p, s, s.R - W * 0.4, T, U, 5 + W, R[n - 3], (uu) => (0.22 + hot * 0.3) * (1 - age) * ((uu - T) / (U - T)), half, 0.3);
  }
  const th = 0.7 * (1 - clamp((u - s.sweep - s.hold) / (s.trail + 0.2)));
  if (tail > 0.02 && th > 0) trace(p, s, s.R - 0.5, 0, T, R[2], (uu) => th * (0.4 + 0.6 * uu / s.span), half);
}
var slashEnd = (s) => travel({ ...s, R: s.R - s.W * 0.3 }, s.span);
function shavings(ps, R, s, n, colors, from = 0.3) {
  for (let i = 0; i < n; i++) {
    const [x, y] = onSwing(s, s.R, s.span * R.range(from, 1)), ox = x - s.cx, oy = y - s.cy, l = Math.hypot(ox, oy) || 1, sp = R.range(30, 100);
    ps.spawn(P.MOTE, x, y, ox / l * sp, Math.min(25, oy / l * sp) - 10, R.range(0.25, 0.55), R.pick(colors), 0.6);
  }
}
function stone(c) {
  c = hex(c);
  return { light: mix(scale(c, 1.35), WHITE, 0.08), body: c, shade: scale(c, 0.64), dust: mix(scale(c, 1.2), rgb(150, 140, 150), 0.3), dark: scale(c, 0.42) };
}
var OUTLINE = hex("#1a1422");
function rock(p, b, st) {
  const r = 0.6 + b.s * 0.75, fade = Math.min(1, b.life / 0.5), lx = Math.cos(b.a) * r * 0.4, ly = Math.sin(b.a) * r * 0.4;
  p.shade(b.x - r - 1, b.y - r - 1, b.x + r + 1, b.y + r + 1, (x, y, out) => {
    const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx * 1.15, dy);
    if (d > r + 0.9) return;
    const lit = dx * lx + dy * ly;
    out.c = d > r ? OUTLINE : lit < -0.4 ? st.light : lit > 0.6 ? st.shade : st.body;
    out.a = fade;
  });
}
function cracks(R, x0, n, reach, depth = 7, bias = 0.3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = R.chance(0.5 + bias * 0.5) ? 1 : -1, L = reach * R.range(0.45, 1) * (i < 2 ? 1 : 0.7), pts = [[x0 + side * R.range(0, 1.5), 0]];
    let x = pts[0][0], y = 0;
    while (Math.abs(x - x0) < L && y < depth) {
      x += side * R.range(1.5, 3.5);
      y = Math.min(depth, Math.max(0, y + R.range(-0.6, 1.6) * (Math.abs(x - x0) > 3 ? 1 : 0.3)));
      pts.push([Math.round(x), Math.round(y)]);
      if (R.chance(0.18) && pts.length > 3 && y < depth - 2) {
        const f = [[Math.round(x), Math.round(y)]];
        let fx = x, fy = y;
        for (let j = R.int(1, 3); j > 0; j--) fx += side * R.range(1, 3), fy += R.range(0.8, 2), f.push([Math.round(fx), Math.round(Math.min(depth + 1, fy))]);
        out.push({ pts: f, at: Math.abs(x - x0) / reach, fork: true });
      }
    }
    out.push({ pts, at: 0, fork: false });
  }
  return out;
}
function star(p, x, y, spikes, sc, th, core, body, inner, rim) {
  for (const pass of [0, 1, 2])
    for (const s of spikes) {
      const c = Math.cos(s.a), sn = Math.sin(s.a), L = s.len * sc;
      for (let d = 0; d <= L; d += 0.5) {
        const hw0 = s.w * th * (1 - d / L) * Math.min(1, 0.5 + d / 3), hw = pass === 0 ? hw0 + 0.8 : pass === 1 ? hw0 : hw0 * 0.45;
        if (pass === 2 && d > L * 0.55) break;
        for (let o = -hw; o <= hw; o += 0.5) p.px(x + c * d - sn * o, y + sn * d + c * o, pass === 0 ? rim : pass === 1 ? d < L * 0.35 ? inner : body : core);
      }
    }
  const r = 2.4 * sc * Math.sqrt(th);
  p.circle(x, y, r + 0.8, inner);
  p.circle(x, y, r, core);
}
function sliver(p, x, y, a, r, arc, c, k) {
  if (r <= 0 || arc <= 0 || k <= 0) return;
  const n = Math.max(2, Math.ceil(arc * Math.sqrt(r / 1.6)));
  const points = [];
  for (let j = 0; j <= n; j++) {
    const th = a + (j / n - 0.5) * arc;
    points.push([x + Math.cos(th) * r, y + Math.sin(th) * r]);
  }
  p.path(points, c, (u, v) => k * clamp((1 - Math.abs(2 * u - 1) - v) * 2 + 0.5), 1.4);
}
function along(pts, len, fn) {
  let d = 0;
  for (let i = 1; i < pts.length && d < len; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0), f = Math.min(1, (len - d) / l);
    fn(x0, y0, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, d);
    d += l;
  }
}

export {
  swing,
  through,
  onSwing,
  travel,
  smear,
  trace,
  glowAlong,
  slash,
  slashEnd,
  shavings,
  stone,
  rock,
  cracks,
  star,
  sliver,
  along
};
