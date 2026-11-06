import {
  TAU,
  WHITE,
  hex,
  noise,
  noise2
} from "./chunk-MBWWV6CB.js";

// src/fx/water/_lib.ts
var WATER = ["#0a1630", "#123063", "#1b5596", "#2a7fc4", "#45a9e3", "#86d3f5", "#cdf1ff", "#ffffff"];
var ROCK = ["#141219", "#221f2b", "#34303f", "#4a4558", "#655f74", "#8a8498"];
function bead(p, x, y, vx, vy, s, C, a = 1) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, tail = Math.min(5, sp * 0.011);
  if (tail >= 1) p.line(x - ux * (tail + 1), y - uy * (tail + 1), x - ux * 1.2, y - uy * 1.2, (u) => u < 0.45 ? C[3] : s > 1 ? C[5] : C[4], a);
  if (s >= 3) {
    p.circle(x, y, 1.75, C[4], a);
    p.circle(x - 0.25, y - 0.25, 1.15, C[6], a);
    p.dot(x - 0.7, y - 0.7, WHITE, a);
  } else if (s >= 2) {
    const X = Math.floor(x), Y = Math.floor(y);
    p.dot(X, Y, WHITE, a);
    p.dot(X + 1, Y, C[6], a);
    p.dot(X, Y + 1, C[5], a);
    p.dot(X + 1, Y + 1, C[4], a);
  } else p.dot(x, y, sp > 160 ? C[6] : C[5], a);
}
var Drops = class {
  sy;
  g;
  drag;
  onLand;
  list;
  constructor({ sy = 0.22, g = 820, drag = 0.35, onLand = null } = {}) {
    this.sy = sy;
    this.g = g;
    this.drag = drag;
    this.onLand = onLand;
    this.list = [];
  }
  add(d) {
    const life = d.life ?? 4;
    this.list.push({ x: 0, z: 0, h: 0, vx: 0, vz: 0, vh: 0, s: 1, delay: 0, ...d, life, max: life });
  }
  get count() {
    return this.list.length;
  }
  update(dt) {
    const k = this.drag * dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      if ((d.life -= dt) <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      d.vh -= this.g * dt;
      d.vx -= d.vx * k;
      d.vz -= d.vz * k;
      d.vh -= d.vh * k * 0.5;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      d.h += d.vh * dt;
      if (d.h <= 0 && d.vh < 0) {
        d.h = 0;
        this.list.splice(i, 1);
        this.onLand?.(d);
      }
    }
  }
  /** Draw the drops behind z = 0 ("back"), in front of it ("front"), or all. */
  draw(p, C, layer) {
    for (const d of this.list) {
      if (d.delay > 0 || layer === "back" && d.z >= 0 || layer === "front" && d.z < 0) continue;
      const x = d.x, y = d.z * this.sy - d.h;
      bead(p, x, y, d.vx, d.vz * this.sy - d.vh, d.s, C, Math.min(1, d.life / 0.2));
      p.glow(x, y, 2.5 + d.s, C[5], 0.1 + 0.05 * d.s);
    }
  }
};
function ring(p, cx, cy, r, sy, k, C, { n = 2, gap = 3, half = 0, hot = false, glint = 0, seed = 0, wob = 0 } = {}) {
  if (k <= 0.02 || r < 0.5) return;
  for (let j = 0; j < n; j++) {
    const rr = r - j * gap;
    if (rr < 0.6) break;
    const kj = k * (1 - j * 0.42), m = Math.max(6, Math.ceil(rr * TAU * 1.3)), need = 1.15 - 2.3 * Math.min(1, kj * 1.25);
    for (let i = 0; i < m; i++) {
      const a = i / m * TAU, s = Math.sin(a), near = s > 0;
      if (half > 0 && !near || half < 0 && near) continue;
      if (noise(a * 4.7 + seed * 13.1 + j * 5.3, seed) * 0.65 + noise(a * 11.3 + seed * 7.7, seed + 3) * 0.35 < need) continue;
      const lit = kj * (near ? 1 : 0.7) * (0.88 - 0.12 * Math.cos(a));
      const c = hot && near && j === 0 ? WHITE : C[lit > 0.7 ? 6 : lit > 0.38 ? 5 : 4], ra = wob ? rr + wob * noise(a * 2.6 + seed * 1.9 + j, seed + 11) : rr;
      const x = cx + Math.cos(a) * ra, y = cy + s * ra * sy;
      p.dot(x, y, c);
      if (j === 0) p.light(x, y, C[4], 0.3 * lit);
    }
  }
  if (glint > 0 && half >= 0) {
    const x = cx + Math.cos(2.05) * r, y = cy + Math.sin(2.05) * r * sy;
    p.px(x, y, WHITE);
    p.glow(x, y, 3 + glint * 2, C[5], 0.35 * glint);
  }
}
var Ripples = class {
  sy;
  list;
  seq = 0;
  constructor({ sy = 0.22 } = {}) {
    this.sy = sy;
    this.list = [];
  }
  add(x, z, r0, r1, life, o = {}) {
    this.list.push({ x, z, r0, r1, life, age: -(o.delay ?? 0), k: o.k ?? 1, n: o.n ?? 2, gap: o.gap ?? 3, hot: o.hot ?? 0.1, glint: o.glint ?? 0, seed: this.seq = (this.seq ?? 0) + 1 });
  }
  get count() {
    return this.list.length;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) if ((this.list[i].age += dt) >= this.list[i].life) this.list.splice(i, 1);
  }
  draw(p, C, half = 0) {
    for (const q of this.list) {
      if (q.age < 0) continue;
      const u = q.age / q.life, r = q.r0 + (q.r1 - q.r0) * (1 - Math.pow(1 - u, 2.6)), k = q.k * Math.pow(1 - u, 1.7);
      ring(p, q.x, q.z * this.sy, r, this.sy, k, C, { n: q.n, gap: q.gap * (0.55 + 0.6 * u), half, hot: q.age < q.hot, glint: q.glint * k, seed: q.seed });
    }
  }
};
function lace(p, cx, cy, rx, ry, k, C, t, seed = 0) {
  if (k <= 0.01 || rx < 1) return;
  const sy = ry / rx;
  p.shade(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, o) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1) return;
    const u = (x - cx) * 0.36, v = (y - cy) / sy * 0.36;
    const n = noise2(u + seed * 7.13, v - t * 0.35, seed), m = noise2(u * 2.2 - t * 0.3, v * 2.2 + seed * 3.1, seed + 9);
    const net = 1 - Math.abs(n) * 4.6 + m * 0.3, need = 1.02 - k * (1.15 - d * 0.9);
    if (net < need) return;
    o.c = net > need + 0.4 ? WHITE : C[6];
  });
}
var Mist = class {
  list;
  constructor() {
    this.list = [];
  }
  add(x, y, vx, vy, r0, r1, life, c, a = 0.25, delay = 0) {
    this.list.push({ x, y, vx, vy, r0, r1, life, max: life, c: hex(c), a, delay });
  }
  get count() {
    return this.list.length;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (m.delay > 0) {
        m.delay -= dt;
        continue;
      }
      if ((m.life -= dt) <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      m.vx -= m.vx * 2.4 * dt;
      m.vy -= m.vy * 2.4 * dt + 7 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
  }
  draw(p, haze) {
    for (const m of this.list) {
      if (m.delay > 0) continue;
      const age = 1 - m.life / m.max, r = m.r0 + (m.r1 - m.r0) * (1 - Math.pow(1 - age, 2.2));
      const a = m.a * Math.min(1, age / 0.12) * Math.pow(1 - age, 1.4);
      if (a < 0.01) continue;
      p.disc(m.x, m.y, r, m.c, (d) => a * (1 - d * d) * (1 - d * 0.5));
      p.disc(m.x - r * 0.2, m.y - r * 0.32, r * 0.55, WHITE, (d) => a * 0.25 * (1 - d) * (1 - d));
      if (haze) p.glow(m.x, m.y, r * 1.5, haze, 0.16 * a / m.a * Math.min(1, m.a * 3));
    }
  }
};
function billow(p, x, y, r, C, a = 1) {
  if (r < 0.9) return p.dot(x, y, C[6], a);
  p.circle(x + r * 0.12, y + r * 0.2, r, C[4], a);
  p.circle(x, y, r * 0.84, C[6], a);
  if (r > 1.6) p.circle(x - r * 0.3, y - r * 0.32, r * 0.46, WHITE, a);
}
function pebble(p, x, y, r, ST) {
  p.shade(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py, o) => {
    const dx = px - x, dy = py - y, d = Math.hypot(dx * 1.1, dy);
    if (d > r + 0.8) return;
    const lit = (dx + dy) / Math.max(0.5, r);
    o.c = d > r ? ST[0] : lit < -0.7 ? ST[5] : lit < 0.2 ? ST[4] : lit < 0.8 ? ST[3] : ST[2];
  });
}
var rock = () => ROCK.map(hex);

export {
  WATER,
  bead,
  Drops,
  ring,
  Ripples,
  lace,
  Mist,
  billow,
  pebble,
  rock
};
