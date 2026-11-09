import {
  SMOKE_RAMP
} from "./chunk-JQXGDKYD.js";
import {
  WHITE,
  luma,
  mix,
  rand,
  wrap
} from "./chunk-MBWWV6CB.js";

// src/fx/status/_lib.ts
var SHAPES = /* @__PURE__ */ new WeakMap();
function shape(a) {
  const m = a.mask;
  let s = SHAPES.get(m);
  if (s) return s;
  const { w, h, data } = m, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] > 0;
  const body = [], up = [], side = [], outline = [], top = [], rows = [];
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && !on(x, y)) y++;
    top.push(y < h ? y : -1);
  }
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      if (l < 0) l = x;
      r = x;
      body.push([x, y]);
      if (!on(x, y - 1)) up.push([x, y]);
      if (!on(x - 1, y)) side.push([x, y, -1]);
      if (!on(x + 1, y)) side.push([x, y, 1]);
    }
    rows.push([l, r]);
  }
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++) {
      if (on(x, y)) continue;
      let nx = 0, ny = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) nx -= dx, ny -= dy;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) {
        const l = Math.hypot(nx, ny) || 1;
        outline.push([x, y, nx / l, ny / l]);
      }
    }
  s = { w, h, on, body, up, side, outline, top, rows };
  SHAPES.set(m, s);
  return s;
}
var colorAt = (a, x, y) => a.pixels ? a.pixels[y * a.mask.w + x] : a.mask.data[y * a.mask.w + x] ? 4285229931 : 0;
function wnoise(x, P, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = rand(wrap(i, P), seed), b = rand(wrap(i + 1, P), seed);
  return (a + (b - a) * u) * 2 - 1;
}
function tnoise(t, D, f, seed = 0, off = 0) {
  const P = Math.max(2, Math.round(f * D));
  return wnoise(t / D * P + off, P, seed);
}
var travel = (v, g, d, a) => d > 0 ? g / d * a + (v - g / d) * (1 - Math.exp(-d * a)) / d : v * a + 0.5 * g * a * a;
var LAYERS = [[1, 1, 6], [0.76, 0.86, 4], [0.54, 0.68, 2], [0.3, 0.42, 0]];
function tongue(p, x, y, h, w, sx, F, t, D, n, layers = LAYERS) {
  if (h < 1) return;
  for (const [lw, lh, ri] of layers) {
    if (ri === 0 && h < 4) continue;
    const H = h * lh, col = F[ri];
    for (let r = 0; r <= H; r++) {
      const u = r / Math.max(1, H);
      const half = w * lw * Math.pow(1 - u, 0.85) * Math.min(1, (r + 1.5) / 3.5) + tnoise(t, D, 9, n, r * 0.45) * 0.5;
      if (half < 0.3) continue;
      const cx = x + sx * u * u * lh + tnoise(t, D, 4, n + 7, r * 0.2) * u * 1.1;
      for (let px = Math.round(cx - half); px <= Math.round(cx + half); px++) p.px(px, Math.round(y - r), col);
    }
  }
}
var rampAt = (r, t) => r[Math.min(r.length - 1, Math.max(0, Math.floor(t * r.length)))];
function smoke(p, x, y, size, u, col, k = 1, warm = 0) {
  const r = size * (0.65 + Math.min(1, u * 2.5) * 0.45 + u * 0.4);
  const a = Math.min(1, u * 12) * Math.min(1, (1 - u) * 2.4) * 0.58 * k;
  if (a <= 0.01) return;
  const c = col ? mix(col, rampAt(SMOKE_RAMP, u), u) : rampAt(SMOKE_RAMP, u * 1.05);
  p.disc(x, y, r, c, a * 0.45);
  p.disc(x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
  if (warm && u < 0.6) p.disc(x + r * 0.1, y + r * 0.3, r * 0.56, mix(c, warm, 0.5), a * 0.7 * (1 - u / 0.6));
  if (u < 0.5) p.disc(x - r * 0.22, y - r * 0.3, r * 0.5, mix(c, WHITE, 0.12), a * 0.4 * (1 - u * 2));
}
function ember(p, x, y, u, E, ph, k = 1) {
  const left = 1 - u;
  if (left < 0.22 && Math.sin(ph * 40) < 0) return;
  const c = left > 0.5 ? Math.sin(ph * 22) > -0.2 ? E[0] : E[1] : left > 0.22 ? E[1] : E[2];
  p.px(x, y, c);
  p.glow(x, y, 3, c, 0.32 * left * k);
}
function bitmap(rows, k = 1, flip = false) {
  const h = rows.length, w = rows[0].length, ox = Math.floor(w * k / 2), oy = Math.floor(h * k / 2);
  return (dx, dy) => {
    let bx = Math.floor((dx + ox) / k);
    const by = Math.floor((dy + oy) / k);
    if (bx < 0 || by < 0 || bx >= w || by >= h) return "";
    if (flip) bx = w - 1 - bx;
    const c = rows[by][bx];
    return c === "." ? "" : c;
  };
}
function icon(p, x, y, ext, inside, R, a = 1, paint = null) {
  const X = Math.round(x), Y = Math.round(y), at = (dx, dy) => !!inside(dx, dy);
  for (let dy = -ext - 1; dy <= ext + 1; dy++)
    for (let dx = -ext - 1; dx <= ext + 1; dx++) {
      const ch = inside(dx, dy);
      let c;
      if (ch) {
        if (paint && paint[ch] !== void 0) c = paint[ch];
        else {
          const top = !at(dx, dy - 1), left = !at(dx - 1, dy), bottom = !at(dx, dy + 1), right = !at(dx + 1, dy);
          c = top || left ? R[3] : bottom || right ? R[1] : R[2];
        }
      } else if (R[0] && (at(dx - 1, dy) || at(dx + 1, dy) || at(dx, dy - 1) || at(dx, dy + 1))) c = R[0];
      else continue;
      p.dot(X + dx, Y + dy, c, a);
    }
}
var shaped = (f, s, ang = 0) => {
  const c = Math.cos(ang), n = Math.sin(ang);
  return (dx, dy) => {
    const x = dx + 0.5, y = dy + 0.5;
    return f((x * c + y * n) / s, (-x * n + y * c) / s) ? "#" : "";
  };
};
function starShape(r0 = 0.45) {
  return (u, v) => {
    const a = Math.atan2(v, u) + Math.PI / 2, d = Math.hypot(u, v), seg = 2 * Math.PI / 5;
    const k = 1 - Math.abs((a % seg + seg) % seg - seg / 2) / (seg / 2);
    return d <= 1 - (1 - r0) * Math.pow(k, 0.8);
  };
}
var heartShape = (u, v) => (u + 0.5) ** 2 + (v + 0.32) ** 2 <= 0.55 ** 2 || (u - 0.5) ** 2 + (v + 0.32) ** 2 <= 0.55 ** 2 || v >= -0.32 && v <= 1 && Math.abs(u) <= 1.04 * Math.pow(1 - (v + 0.32) / 1.32, 0.75);
var EYES = /* @__PURE__ */ new WeakMap();
function eyes(a) {
  let list = EYES.get(a.mask);
  if (list) return list;
  if (a.eyes) {
    list = a.eyes.map(([x, y]) => ({ x0: x, x1: x, y0: y, y1: y + 1, px: [[x, y], [x, y + 1]], skin: colorAt(a, x, y) }));
    EYES.set(a.mask, list);
    return list;
  }
  const S = shape(a), W = S.w, col = (x, y) => S.on(x, y) ? colorAt(a, x, y) : 0;
  const dark = (x, y) => S.on(x, y) && y < S.h * 0.4 && luma(col(x, y)) < 0.15 && S.on(x - 1, y) && S.on(x + 1, y) && S.on(x, y - 1) && S.on(x, y + 1);
  const seen = /* @__PURE__ */ new Set();
  list = [];
  for (const [x0, y0] of S.body) {
    if (seen.has(y0 * W + x0) || !dark(x0, y0)) continue;
    const px = [], q = [[x0, y0]];
    seen.add(y0 * W + x0);
    while (q.length) {
      const [x, y] = q.pop();
      px.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * W + nx;
        if (seen.has(k) || !(dark(nx, ny) || S.on(nx, ny) && luma(col(nx, ny)) > 0.95)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    if (px.length < 2 || px.length > 14) continue;
    const xs = px.map((p) => p[0]), ys = px.map((p) => p[1]), counts = /* @__PURE__ */ new Map();
    const e = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), px };
    for (const [x, y] of px)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]]) {
        const c = col(x + dx, y + dy), l = luma(c);
        if (c && l > 0.5 && l < 0.95 && !px.some((p) => p[0] === x + dx && p[1] === y + dy)) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    e.skin = [...counts].sort((p, q2) => q2[1] - p[1])[0]?.[0];
    if (e.skin && e.x1 - e.x0 <= 4 && e.y1 - e.y0 <= 5) list.push(e);
  }
  list.sort((p, q) => p.x0 - q.x0);
  if (list.length > 2) list = [];
  EYES.set(a.mask, list);
  return list;
}

export {
  shape,
  colorAt,
  tnoise,
  travel,
  tongue,
  smoke,
  ember,
  bitmap,
  icon,
  shaped,
  starShape,
  heartShape,
  eyes
};
