import {
  GRAVITY,
  P,
  PF,
  Particles
} from "./chunk-Z77DUDLI.js";
import {
  TAU,
  WHITE,
  hex,
  rand
} from "./chunk-MBWWV6CB.js";

// src/fx/scifi/_lib.ts
var SOFT = /* @__PURE__ */ new Set([P.VAPOUR, P.DUST, P.SMOKE]);
var STEP = 1 / 240;
function move(q, dt, age, ground) {
  switch (q.k) {
    case P.FIRE:
      q.vy -= 95 * dt;
      q.vx += Math.sin(age * 17 + q.seed) * 30 * dt;
      q.vx -= q.vx * 5 * dt;
      q.vy -= q.vy * 3.2 * dt;
      break;
    case P.GRIT: {
      q.vy += GRAVITY * dt;
      q.vx -= q.vx * 0.8 * dt;
      const g = ground(q.x), ny = q.y + q.vy * dt;
      q.x += q.vx * dt;
      if (q.vy > 0 && q.y <= g && ny >= g) {
        q.y = g - 0.25;
        if (q.vy > 130 && rand(q.seed * 1e3, q.hops++) < 0.4) q.vy = -q.vy * 0.25, q.vx = q.vx * 0.5;
        else q.vx = q.vy = 0, q.life = Math.min(q.life, 0.5);
      } else q.y = ny;
      return;
    }
    case P.SPARK: {
      q.vy += GRAVITY * 0.45 * dt;
      q.vx -= q.vx * 2.2 * dt;
      q.vy -= q.vy * 2.2 * dt;
      const g = ground(q.x), ny = q.y + q.vy * dt;
      q.x += q.vx * dt;
      if (q.vy > 0 && q.y <= g && ny >= g) q.vy = -q.vy * 0.45, q.vx *= 0.7, q.y = g - 0.25;
      else q.y = ny;
      return;
    }
    case P.STREAK:
      q.vx += q.vx * 3 * dt, q.vy += q.vy * 3 * dt;
      break;
    case P.FLAKE:
      q.vx -= q.vx * 2.2 * dt;
      q.vy -= q.vy * 2.2 * dt - 35 * dt;
      q.x += Math.sin(age * 2.5 + q.seed) * 7 * dt;
      break;
    case P.EMBER:
      q.vy += (-30 + Math.sin(age * 3 + q.seed) * 20) * dt;
      q.vx += Math.cos(age * 2.3 + q.seed) * 45 * dt;
      q.vx -= q.vx * 1.6 * dt;
      q.vy -= q.vy * 1.6 * dt;
      break;
    case P.SMOKE: {
      const big = q.flag & PF.BIG;
      q.vy -= (big ? 23 : 16) * dt;
      q.vx += Math.sin(age * 1.3 + q.seed) * 8 * dt;
      q.vx -= q.vx * 1.6 * dt;
      q.vy -= q.vy * 1.2 * dt;
      break;
    }
    case P.MOTE:
      q.vx -= q.vx * 0.6 * dt;
      q.vy -= q.vy * 0.6 * dt;
      break;
    default: {
      const drag = SOFT.has(q.k) ? 4 : 1.6;
      q.vx -= q.vx * drag * dt;
      q.vy -= q.vy * drag * dt + 5 * dt;
    }
  }
  q.x += q.vx * dt;
  q.y += q.vy * dt;
}
var Ghosts = class {
  D;
  ground;
  box;
  ps;
  specs;
  constructor(period, opts = {}) {
    this.D = period;
    this.ground = opts.ground ?? (() => Infinity);
    this.box = opts.box ?? null;
    this.ps = new Particles({ ground: this.ground, sparks: opts.sparks, haze: opts.haze });
    this.specs = [];
  }
  add(born, k, x, y, vx, vy, life, col = WHITE, size = 1, flag = 0) {
    const n = this.specs.length, D = this.D;
    let seed = rand(n, 41) * 100;
    if (k === P.STAR) {
      const m = Math.ceil(8 * D / TAU), f = TAU * m / D - 8;
      if (f < 5) seed = f + 5 * Math.floor(rand(n, 43) * 19);
    }
    this.specs.push({ born: (born % D + D) % D, k, x, y, vx, vy, life, col: col ? hex(col) : 0, size, flag, seed });
  }
  get count() {
    return this.specs.length;
  }
  /** The state of one particle `age` seconds after its birth, or null if it's gone. */
  state(s, age) {
    const q = { k: s.k, x: s.x, y: s.y, vx: s.vx, vy: s.vy, life: s.life, max: s.life, col: s.col, size: s.size, seed: s.seed, delay: 0, flag: s.flag, hops: 0 };
    let a = 0;
    while (a < age - 1e-9) {
      const dt = Math.min(STEP, age - a);
      move(q, dt, a, this.ground);
      a += dt;
      q.life -= dt;
      if (q.life <= 0) {
        if (q.k !== P.FIRE || !(q.flag & PF.SMOKES)) return null;
        const big = q.flag & PF.BIG, L = big ? 1.3 + rand(s.seed * 7, 1) : 0.8 + rand(s.seed * 7, 1) * 0.6;
        Object.assign(q, { k: P.SMOKE, vx: q.vx * 0.6, vy: q.vy * 0.6 - 6, life: L, max: L, col: 0, size: q.size * (big ? 0.85 : 0.7), flag: big ? PF.BIG : 0 });
      }
    }
    if (this.box) {
      const [x0, y0, x1, y1] = this.box;
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) return null;
    }
    return q;
  }
  at(t) {
    const D = this.D, list = [];
    for (const s of this.specs) {
      const span = s.k === P.FIRE && s.flag & PF.SMOKES ? s.life + 2.4 : s.life;
      for (let age = ((t - s.born) % D + D) % D; age < span; age += D) {
        const q = this.state(s, age);
        if (q) list.push(q);
      }
    }
    this.ps.list = list;
    this.ps.t = t;
    return this.ps;
  }
};
function flash(p, t, t0, x, y, r, c, k, life) {
  const a = t - t0;
  if (a < 0 || a >= life) return;
  const q = 1 - a / life;
  p.glow(x, y, r * (0.55 + 0.45 * q), c, k * q * q);
}
var since = (t, t0, D) => ((t - t0) % D + D) % D;
function strokeArc(p, pts, C, k = 1, w = 1) {
  const [halo, body, glow] = C;
  for (const pass of [0, 1, 2])
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.max(1, Math.hypot(bx - ax, by - ay));
      for (let d = 0; d <= L; d += 0.5) {
        const x = ax + (bx - ax) * d / L, y = ay + (by - ay) * d / L;
        if (pass === 0) p.circle(x, y, (k > 0.6 ? 1.6 : 1.1) * w, halo);
        else if (pass === 1) p.circle(x, y, (k > 0.6 ? 0.9 : 0.6) * w, body);
        else if (k > 0.3) p.px(x, y, WHITE);
      }
      if (pass === 0 && i % 3 === 0) p.glow(ax, ay, 9 * w, glow, 0.45 * k);
    }
}

export {
  Ghosts,
  flash,
  since,
  strokeArc
};
