import {
  Painter,
  createFrame
} from "./chunk-NPBZD3DI.js";
import {
  WHITE,
  hex,
  rand,
  scale
} from "./chunk-MBWWV6CB.js";

// src/fx/pickups/_lib.ts
var Layer = class {
  constructor(w = 64, h = 64) {
    this.f = createFrame(w, h);
    this.q = new Painter(this.f);
    this.tmp = new Uint32Array(w * h);
  }
  /** Clear it and put its top-left at local (x0, y0). Returns the layer's painter. */
  begin(x0, y0) {
    const f = this.f;
    f.ox = Math.floor(x0);
    f.oy = Math.floor(y0);
    f.color.fill(0);
    f.light.fill(0);
    return this.q.reset().place(0, 0);
  }
  idx(x, y) {
    const f = this.f, i = Math.floor(x) - f.ox, j = Math.floor(y) - f.oy;
    return i < 0 || j < 0 || i >= f.w || j >= f.h ? -1 : j * f.w + i;
  }
  get(x, y) {
    const i = this.idx(x, y);
    return i < 0 ? 0 : this.f.color[i];
  }
  set(x, y, c) {
    const i = this.idx(x, y);
    if (i >= 0) this.f.color[i] = c;
  }
  /** Fill each pixel from fn(x, y) at the pixel's center (x + 0.5, y + 0.5): return a color or 0. */
  fill(x0, y0, x1, y1, fn) {
    for (let y = Math.floor(y0); y <= y1; y++)
      for (let x = Math.floor(x0); x <= x1; x++) {
        const c = fn(x + 0.5, y + 0.5);
        if (c) this.set(x, y, c);
      }
  }
  /** A 1 px outline around everything drawn: c is a color or fn(x, y, neighbour color). corners adds diagonals. */
  outline(c, corners = false) {
    const f = this.f, C = f.color, T = this.tmp, w = f.w, h = f.h;
    T.fill(0);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (C[k]) continue;
        let n = i > 0 && C[k - 1] || i < w - 1 && C[k + 1] || j > 0 && C[k - w] || j < h - 1 && C[k + w];
        if (!n && corners) n = i > 0 && j > 0 && C[k - w - 1] || i < w - 1 && j > 0 && C[k - w + 1] || i > 0 && j < h - 1 && C[k + w - 1] || i < w - 1 && j < h - 1 && C[k + w + 1];
        if (n) T[k] = typeof c === "function" ? c(i + f.ox, j + f.oy, n) : c;
      }
    for (let k = 0; k < w * h; k++) if (T[k]) C[k] = T[k];
    return this;
  }
  /** Recolor every drawn pixel: fn(x, y, c) returns the new color. */
  map(fn) {
    const f = this.f, C = f.color;
    for (let k = 0; k < C.length; k++) if (C[k]) C[k] = fn(k % f.w + f.ox, Math.floor(k / f.w) + f.oy, C[k]) || C[k];
    return this;
  }
  /** Stamp the layer onto p, offset by (dx, dy), at alpha a (dithered); clip [x0, x1] keeps x0 <= x < x1. */
  draw(p, dx = 0, dy = 0, a = 1, clip = null) {
    const f = this.f, C = f.color;
    for (let k = 0; k < C.length; k++) {
      if (!C[k]) continue;
      const x = k % f.w + f.ox + dx;
      if (clip && (x < clip[0] || x >= clip[1])) continue;
      p.dot(x, Math.floor(k / f.w) + f.oy + dy, C[k], a);
    }
    return this;
  }
};
var SHADOW = hex("#100e17");
function pillow(L, x0, y0, x1, y1, sdf, color, { bevel = 3, light = [-0.5, -0.6, 0.62], clip = null } = {}) {
  L.fill(x0, y0, x1, y1, (x, y) => {
    const d = sdf(x, y);
    if (d > 0 || clip && clip(x, y)) return 0;
    const e = -d;
    let gx = sdf(x + 0.5, y) - sdf(x - 0.5, y), gy = sdf(x, y + 0.5) - sdf(x, y - 0.5);
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl;
    gy /= gl;
    const k = Math.max(0, 1 - e / bevel) * 1.25, sn = Math.sin(k), cs = Math.cos(k);
    return color(gx * sn * light[0] + gy * sn * light[1] + cs * light[2], e, x, y);
  });
}
function heartSdf(x, y, cx, cy, w, h = w) {
  const S = w / 1.14, X = (x - cx) / S, Y = -(y - cy) / (h / 1.14) + 0.12;
  const q = X * X + Y * Y - 1, f = q * q * q - X * X * Y * Y * Y;
  const gx = 6 * X * q * q - 2 * X * Y * Y * Y, gy = 6 * Y * q * q - 3 * X * X * Y * Y;
  return f / Math.max(Math.hypot(gx, gy), 0.6) * S;
}
var INK = hex("#0b0814");
function blobShadow(p, x, rx, k = 1, y = 0) {
  if (rx < 0.8 || k <= 0) return;
  for (let i = Math.floor(x - rx); i <= Math.ceil(x + rx); i++) {
    const u = Math.abs(i + 0.5 - x) / rx;
    if (u > 1) continue;
    const a = k * (1 - u * u);
    p.dot(i, y, INK, a * 1.1);
    if (u < 0.6) p.dot(i, y + 1, INK, a * 0.6);
  }
}
function glint(p, x, y, arm, c, k = 0.4, tip = scale(c, 0.8)) {
  const n = Math.round(arm), X = Math.floor(x), Y = Math.floor(y);
  if (n < 0) return;
  for (let d = 1; d <= n; d++) {
    const cc = d === n && n > 1 ? tip : c;
    p.px(X + d, Y, cc), p.px(X - d, Y, cc), p.px(X, Y + d, cc), p.px(X, Y - d, cc);
  }
  p.px(X, Y, n > 0 ? WHITE : c);
  p.glow(X + 0.5, Y + 0.5, 3 + n * 2.5, c, k);
}
function pool(p, x, y, rx, ry, c, k) {
  if (k <= 4e-3 || rx < 1) return;
  p.shade(x - rx, y - ry, x + rx, y + ry, (px, py, out) => {
    const dx = (px - x) / rx, dy = (py - y) / ry, d = dx * dx + dy * dy;
    if (d >= 1) return;
    const f = 1 - Math.sqrt(d);
    out.l = c;
    out.k = f * f * k;
  });
}
function coin(L, p, x, y, r, ax, spin, C, white = false, a = 1, snap = true) {
  const X = snap ? Math.round(x) : x, Y = snap ? Math.round(y) : y, cs = Math.cos(spin), sn = Math.sin(spin);
  const b = Math.max(0.5, r * Math.abs(cs)), th = 1.2 * sn * Math.sign(cs || 1), ca = Math.cos(ax), sa = Math.sin(ax);
  const face = Math.abs(cs), R = Math.ceil(r) + 2;
  L.begin(Math.floor(X) - R, Math.floor(Y) - R);
  L.fill(Math.floor(X) - R, Math.floor(Y) - R, Math.floor(X) + R, Math.floor(Y) + R, (px, py) => {
    const dx = px - X, dy = py - Y, u = dx * ca + dy * sa, w = -dx * sa + dy * ca;
    const ef = Math.hypot(u / r, w / b), er = Math.hypot(u / r, (w - th) / b);
    if (white && (ef <= 1 || er <= 1)) return WHITE;
    if (ef <= 1) {
      const lit = -(dx * 0.62 + dy * 0.78) / Math.max(1, Math.hypot(dx, dy)), dim = face < 0.45 ? 1 : 0;
      if (b < 1.1) return lit > 0 ? C[6] : C[4];
      if (ef > 0.72) return C[(lit > 0.3 ? 6 : lit > -0.35 ? 5 : 3) - dim];
      if (b > 2.2 && ef > 0.42) return C[(lit > 0.2 ? 4 : 5) - dim];
      if (face > 0.6 && lit > 0.5) return C[7];
      return C[5 - dim];
    }
    if (er <= 1) return Math.abs(w - th) < Math.abs(w) ? C[2] : C[3];
    return 0;
  });
  L.outline(C[1]).draw(p, 0, 0, a);
}
function gemlet(L, p, x, y, r, ang, G, white = false, a = 1) {
  const X = Math.round(x), Y = Math.round(y), ca = Math.cos(ang), sa = Math.sin(ang), n = G.length, R = Math.ceil(r * 1.4) + 2;
  const ct = r * 0.75, tw = r * 0.5, pv = r * 1.3;
  L.begin(X - R, Y - R);
  L.fill(X - R, Y - R, X + R - 1, Y + R - 1, (px, py) => {
    const dx = px - X, dy = py - Y, u = dx * ca + dy * sa, w = -dx * sa + dy * ca;
    let facet;
    if (w < 0) {
      if (w < -ct || Math.abs(u) > r - -w / ct * (r - tw)) return 0;
      facet = w < -ct * 0.45 && Math.abs(u) < tw * 0.95 ? 0 : u < 0 ? 1 : 2;
    } else {
      if (w > pv || Math.abs(u) > r * (1 - w / pv)) return 0;
      facet = Math.abs(u) < 0.5 ? 4 : u < 0 ? 3 : 5;
    }
    if (white) return WHITE;
    const N = [[0, -1], [-0.7, -0.7], [0.7, -0.7], [-0.6, 0.8], [0, 1], [0.6, 0.8]][facet];
    const nx = N[0] * ca - N[1] * sa, ny = N[0] * sa + N[1] * ca, l = -(nx * 0.62 + ny * 0.78);
    if (facet === 0 && l > 0.3 && u < 0) return WHITE;
    return l > 0.6 ? G[n - 1] : l > 0.2 ? G[n - 2] : l > -0.2 ? G[n - 3] : l > -0.6 ? G[n - 4] : G[n - 5];
  });
  L.outline(G[0]).draw(p, 0, 0, a);
}
function brilliant({ r = 7.5, crown = 3.6, table = 0.52, pavilion = 8, girdle = 0.8, n = 8 } = {}) {
  const planes = [{ n: [0, 1, 0], d: crown + girdle / 2, kind: 0 }];
  const cs = Math.atan2(crown, r * (1 - table)), ps = Math.atan2(pavilion, r);
  for (let i = 0; i < n * 2; i++) {
    const a = i * Math.PI / n, half = i % 2;
    const c = half ? Math.min(1.45, cs + 0.22) : cs, pv = half ? ps - 0.1 : ps;
    planes.push({ n: [Math.sin(c) * Math.cos(a), Math.cos(c), Math.sin(c) * Math.sin(a)], d: r * Math.sin(c) * (half ? 1.012 : 1) + girdle / 2 * Math.cos(c), kind: half ? 2 : 1 });
    planes.push({ n: [Math.cos(a), 0, Math.sin(a)], d: r * (half ? 1 : 1), kind: 3 });
    planes.push({ n: [Math.sin(pv) * Math.cos(a), -Math.cos(pv), Math.sin(pv) * Math.sin(a)], d: r * Math.sin(pv) * (half ? 1.03 : 1) + girdle / 2 * Math.cos(pv), kind: half ? 5 : 4 });
  }
  return { planes, r, top: crown + girdle / 2, bottom: pavilion + girdle / 2 };
}
function drawGem(L, p, g, x, y, spin, C, { tilt = 0.32, white = false, a = 1, edges = true, gain = 1 } = {}) {
  const cs = Math.cos(spin), sn = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = g.planes.map((q) => ({ n: [q.n[0] * cs - q.n[2] * sn, q.n[1], q.n[0] * sn + q.n[2] * cs], d: q.d, kind: q.kind }));
  const Lx = -0.55, Ly = 0.72, Lz = 0.42, D = [0, -st, -ct], V = [0, st, ct];
  const Hl = Math.hypot(Lx + V[0], Ly + V[1], Lz + V[2]), H = [(Lx + V[0]) / Hl, (Ly + V[1]) / Hl, (Lz + V[2]) / Hl];
  const X = Math.round(x), Y = Math.round(y), R = Math.ceil(g.r) + 2, top = Math.ceil(g.top + 2), bot = Math.ceil(g.bottom + 2);
  let best = -1, bx = X, by = Y;
  const ids = /* @__PURE__ */ new Map();
  L.begin(X - R, Y - top);
  L.fill(X - R, Y - top, X + R, Y + bot, (px, py) => {
    const sx = px - X, sy = -(py - Y);
    const o = [sx, sy * ct, -sy * st];
    let t0 = -1e9, t1 = 1e9, hit = null;
    for (const q of P) {
      const nd = q.n[0] * D[0] + q.n[1] * D[1] + q.n[2] * D[2], no = q.n[0] * o[0] + q.n[1] * o[1] + q.n[2] * o[2];
      if (Math.abs(nd) < 1e-6) {
        if (no > q.d) return 0;
        continue;
      }
      const tt = (q.d - no) / nd;
      if (nd < 0) {
        if (tt > t0) t0 = tt, hit = q;
      } else if (tt < t1) t1 = tt;
    }
    if (!hit || t0 > t1) return 0;
    if (white) return WHITE;
    ids.set((Math.floor(px) + 500) * 1e3 + Math.floor(py) + 500, P.indexOf(hit));
    const n = hit.n, pav = hit.kind === 4 || hit.kind === 5 || hit.kind === 8;
    const m = pav ? [n[0], -n[1] * 0.6, n[2]] : n, ml = Math.hypot(m[0], m[1], m[2]);
    const lam = Math.max(0, (m[0] * Lx + m[1] * Ly + m[2] * Lz) / ml), spec = Math.pow(Math.max(0, (m[0] * H[0] + m[1] * H[1] + m[2] * H[2]) / ml), 18);
    let b = pav ? 0.02 + 0.72 * Math.pow(lam, 2.4) : hit.kind === 3 ? 0.12 + 0.4 * lam : 0.04 + 0.66 * Math.pow(lam, 1.8);
    if (hit.kind === 6) b = 0.16 + 0.66 * Math.pow(Math.max(0, (n[0] * Lx + n[2] * Lz) / Math.hypot(Lx, Lz)), 1.3);
    else if (hit.kind === 7) b = 0.22 + 0.62 * Math.pow(lam, 1.2);
    else if (hit.kind === 9) b = 0.62 + 0.25 * lam;
    else if (hit.kind === 10) b = 0.3 + 0.5 * lam + (rand(Math.floor(px - X), Math.floor(py - Y), 43) - 0.5) * 0.08;
    if (hit.kind !== 9) b *= gain;
    if (hit.kind === 0) b -= 0.04;
    const s = b + spec * 0.6;
    if (s > best) best = s, bx = px, by = py;
    if (spec > 0.8) return pav ? C[6] : WHITE;
    return C[Math.max(1, Math.min(6, Math.round(1 + s * 5.6)))];
  });
  if (!white && edges) {
    const out = [];
    for (const [key, id] of ids) {
      const kx = Math.floor(key / 1e3), ky = key - kx * 1e3, x2 = kx - 500, y2 = ky - 500, r = ids.get(key + 1e3), d = ids.get(key + 1);
      if (r !== void 0 && r !== id || d !== void 0 && d !== id) {
        const c = L.get(x2, y2) >>> 0, i = C.findIndex((k) => k >>> 0 === c), pav = [4, 5, 8].includes(P[id].kind);
        if (i > 0) out.push([x2, y2, pav ? C[Math.max(1, i - 1)] : C[Math.min(7, i + 1)]]);
      }
    }
    for (const [x2, y2, c] of out) L.set(x2, y2, c);
  }
  L.outline(C[0]).draw(p, 0, 0, a);
  return { x: bx, y: by, k: best };
}
function coin3d(L, p, x, y, r, th, theta, C, { a = 1, white = false } = {}) {
  const ct = Math.cos(theta), st = Math.sin(theta), sg = ct < 0 ? -1 : 1, act = Math.abs(ct), ast = Math.abs(st);
  const xc = th / 2 * st * sg, nfx = st * sg, Lx = -0.55, Ly = 0.45, Lz = 0.7, Ln = Math.hypot(Lx, Ly, Lz);
  const lam = (nfx * Lx + act * Lz) / Ln, Hx = Lx / Ln, Hz = Lz / Ln + 1, Hn = Math.hypot(Hx, Hz);
  const base = Math.max(2, Math.min(5, Math.round(2 + lam * 3.2)));
  const X = Math.round(x), Y = Math.round(y), B = Math.ceil(r + th) + 2;
  let flash = 0;
  L.begin(X - B, Y - B);
  L.fill(X - B, Y - B, X + B, Y + B, (px, py) => {
    const sx = px - X, sy = -(py - Y);
    if (Math.abs(sy) > r) return 0;
    const s = Math.sqrt(1 - (sy / r) ** 2), hw = r * s * act, xr = -(st < 0 ? -1 : 1) * s * r * ct, rw = th / 2 * ast;
    if (white && (Math.abs(sx - xc) <= hw || Math.abs(sx - xr) <= rw + 0.05)) return WHITE;
    if (Math.abs(sx - xc) <= hw && act > 0.08) {
      const fx = (sx - xc) / act, fy = sy, d = Math.hypot(fx, fy) / r;
      const tx = nfx + fx / r * 0.3 * act, sp = Math.pow(Math.max(0, (tx * Hx + act * Hz) / Hn / Math.hypot(tx, act)), 130);
      flash = Math.max(flash, sp);
      const lit = (-fx * 0.6 + fy * 0.8) / Math.max(0.5, Math.hypot(fx, fy));
      let k;
      if (d > 0.76) k = base + (lit > 0.75 ? 2 : lit > 0.3 ? 1 : lit < -0.35 ? -1 : 0);
      else {
        const q = (Math.abs(fx) + Math.abs(fy)) / (r * 0.52);
        k = q >= 1 ? base - 1 : q < 0.45 ? base + 1 : fx <= 0 && fy >= 0 ? base + 1 : fx > 0 && fy < 0 ? base - 2 : base;
      }
      if (sp > 0.5) return sp > 0.8 ? WHITE : C[Math.min(7, k + 2)];
      return C[Math.max(2, Math.min(6, k))];
    }
    if (Math.abs(sx - xr) <= rw + 0.05) {
      const cphi = xr < 0 ? -s : s, n = [cphi * ct, sy / r, -cphi * st], l = (n[0] * Lx + n[1] * Ly + n[2] * Lz) / Ln;
      const groove = Math.floor((Math.asin(sy / r) + Math.PI) * 9) % 2;
      const edge = Math.abs(sx - xr) > rw - 0.6 && Math.sign(sx - xr) === Math.sign(xc - xr);
      return C[Math.max(1, Math.min(6, Math.round(2.6 + l * 2.6) - groove + (edge ? 1 : 0)))];
    }
    return 0;
  });
  L.outline(C[1]).draw(p, 0, 0, a);
  return flash;
}

export {
  Layer,
  pillow,
  heartSdf,
  blobShadow,
  glint,
  pool,
  coin,
  gemlet,
  brilliant,
  drawGem,
  coin3d
};
