// src/core/math.ts
var TAU = Math.PI * 2;
var clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
var lerp = (a, b, t) => a + (b - a) * t;
var fract = (x) => x - Math.floor(x);
var wrap = (x, m) => (x % m + m) % m;
function loopTime(time, duration) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) throw new RangeError("Loop time and duration must be finite and duration positive");
  const cycles = time / duration, nearest = Math.round(cycles);
  if (Math.abs(cycles - nearest) <= 8 * Number.EPSILON * Math.max(1, Math.abs(cycles))) return 0;
  const local = time % duration;
  return local < 0 ? local + duration : local;
}
var seg = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
var smooth = (e0, e1, x) => {
  const t = seg(x, e0, e1);
  return t * t * (3 - 2 * t);
};
var ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inExpo: (t) => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  outExpo: (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inSine: (t) => 1 - Math.cos(t * Math.PI / 2),
  outSine: (t) => Math.sin(t * Math.PI / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inBack: (t, s = 1.70158) => t <= 0 ? 0 : t >= 1 ? 1 : (s + 1) * t * t * t - s * t * t,
  outBack: (t, s = 1.70158) => t <= 0 ? 0 : t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }
};
function hash(...ns) {
  let h = 2654435769;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
  }
  return h >>> 0;
}
var rand = (...ns) => hash(...ns) / 4294967296;
var Rng = class {
  s;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  /** Explicit RNG state for deterministic checkpoint/restore; does not change the seed algorithm. */
  captureState() {
    return this.s;
  }
  restoreState(state) {
    if (!Number.isSafeInteger(state) || state < 0 || state > 4294967295) throw new RangeError("RNG state must be uint32");
    this.s = state;
  }
  next() {
    let t = this.s = this.s + 1831565813 >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  /** Roughly normal, mean 0, sd 1. */
  gauss() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }
};
var rng = (...ns) => new Rng(hash(...ns));
function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(rand(i, seed), rand(i + 1, seed), u) * 2 - 1;
}
function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = rand(ix, iy, seed), b = rand(ix + 1, iy, seed), c = rand(ix, iy + 1, seed), d = rand(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
function fbm(x, y, seed = 0, octaves = 3) {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < octaves; o++) {
    s += noise2(x, y, seed + o * 101) * a;
    n += a;
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s / n;
}
function tileNoise(x, y, px = 0, py = 0, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = px ? wrap(ix, px) : ix, x1 = px ? wrap(ix + 1, px) : ix + 1;
  const y0 = py ? wrap(iy, py) : iy, y1 = py ? wrap(iy + 1, py) : iy + 1;
  const a = rand(x0, y0, seed), b = rand(x1, y0, seed), c = rand(x0, y1, seed), d = rand(x1, y1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
function tileFbm(x, y, px = 0, py = 0, seed = 0, octaves = 3) {
  let s = 0, a = 0.5, n = 0, k = 1;
  for (let o = 0; o < octaves; o++) {
    s += tileNoise(x * k, y * k, px * k, py * k, seed + o * 101) * a;
    n += a;
    a *= 0.5;
    k *= 2;
  }
  return s / n;
}
function loopNoise(phase, radius = 1, seed = 0) {
  const a = phase * TAU;
  return noise2(Math.cos(a) * radius + 50, Math.sin(a) * radius + 50, seed);
}

// src/core/color.ts
var rgb = (r, g, b) => 255 << 24 | (b & 255) << 16 | (g & 255) << 8 | r & 255;
var red = (c) => c & 255;
var green = (c) => c >>> 8 & 255;
var blue = (c) => c >>> 16 & 255;
function hex(h) {
  if (typeof h === "number") return h;
  let s = h.replace("#", "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const v = parseInt(s.slice(0, 6), 16);
  return rgb(v >> 16 & 255, v >> 8 & 255, v & 255);
}
var toHex = (c) => "#" + [red(c), green(c), blue(c)].map((v) => v.toString(16).padStart(2, "0")).join("");
function mix(a, b, t) {
  t = clamp(t);
  return rgb(red(a) + (red(b) - red(a)) * t, green(a) + (green(b) - green(a)) * t, blue(a) + (blue(b) - blue(a)) * t);
}
var scale = (c, k) => rgb(Math.min(255, red(c) * k), Math.min(255, green(c) * k), Math.min(255, blue(c) * k));
var luma = (c) => (0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c)) / 255;
var ramp = (list) => list.map(hex);
function fit(r, n) {
  const colors = r.map(hex);
  if (colors.length === n) return colors;
  return Array.from({ length: n }, (_, i) => colors[Math.round(i * (colors.length - 1) / Math.max(1, n - 1))]);
}
var at = (r, t) => r[clamp(Math.floor(t * r.length), 0, r.length - 1)];
var PAL = {
  fire: ["#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6"],
  ember: ["#1a0a0e", "#3d1012", "#701a14", "#a8301a", "#e0561e", "#ff8a2a", "#ffc46a"],
  lava: ["#14060a", "#380a10", "#6e1210", "#ac2410", "#e8501a", "#ff8c2a", "#ffd25a"],
  smoke: ["#0e0c12", "#1d1a22", "#2e2a35", "#433e4b", "#5c5664", "#7b7484", "#a39cab"],
  dust: ["#1c1610", "#33281c", "#4f3f2c", "#6e5a40", "#927a58", "#b89f78", "#dcc8a2"],
  ice: ["#0c1430", "#162c5c", "#1f4f94", "#2f7fcc", "#58b4ec", "#9bdcff", "#d8f4ff", "#ffffff"],
  water: ["#081830", "#0e2e5a", "#14508c", "#1c76bc", "#36a2e0", "#78ccf4", "#c4ecff", "#ffffff"],
  electric: ["#0a0f2e", "#172a78", "#2550d0", "#3f8cff", "#7cc8ff", "#c8f0ff", "#ffffff"],
  volt: ["#24160a", "#5e3a0c", "#a8680f", "#e8a218", "#ffd23c", "#fff08a", "#ffffff"],
  poison: ["#0d1a0c", "#173a14", "#265e18", "#3f8a1e", "#6cb82a", "#a8e04a", "#e0ff8a"],
  holy: ["#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff"],
  heal: ["#08201a", "#0f3f2c", "#17663e", "#24924e", "#3ec466", "#7ee88a", "#c8ffc4", "#ffffff"],
  arcane: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff"],
  shadow: ["#050308", "#0f0a18", "#1c1230", "#2c1a4a", "#432468", "#5e3290", "#8048b8", "#a970e0"],
  blood: ["#14040a", "#3a0a14", "#6a101c", "#a01824", "#d42a30", "#ff5a50", "#ff9a8a"],
  earth: ["#140e0a", "#2a1e14", "#47321e", "#69492a", "#8e6638", "#b88a52", "#dcb47c"],
  stone: ["#0e0e12", "#1c1c24", "#2c2c38", "#42424f", "#5c5c6b", "#7d7d8c", "#a4a4b2", "#d0d0da"],
  gold: ["#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff"],
  leaf: ["#0c1a0e", "#163418", "#225224", "#357530", "#4f9a3a", "#7cc048", "#b4e070", "#e4ffb0"],
  wood: ["#160c06", "#2e1a0c", "#4a2c14", "#6a421e", "#8e5c2c", "#b47c40", "#d8a464"],
  metal: ["#0c0e14", "#1c2230", "#2e3648", "#4a5468", "#6e7a90", "#9aa6ba", "#d0d8e6", "#ffffff"],
  bone: ["#1a1814", "#3a352c", "#5e5648", "#8a806c", "#b8ad96", "#e4dcc8", "#fffaf0"],
  neon: ["#1a0516", "#3d0a33", "#701560", "#b0228f", "#f53cd1", "#ff86e6", "#ffd2f6", "#ffffff"],
  cyber: ["#041418", "#08303a", "#0c5260", "#108088", "#18b4b0", "#4ce8d8", "#b4fff0", "#ffffff"],
  matrix: ["#020a04", "#05200c", "#0a3c16", "#106624", "#1a9a34", "#3cd650", "#a4ffa8", "#e8ffe8"],
  candy: ["#ff4a5a", "#ff9a2a", "#ffe03c", "#5ad84a", "#3cc8ff", "#7a6cff", "#f53cd1"],
  night: ["#07060d", "#0c0a18", "#131026", "#1b1734", "#241f44", "#2f2956"]
};
var RAMP = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, ramp(v)]));
var WHITE = hex("#ffffff");
var BLACK = hex("#000000");
var INK = hex("#0b0a10");
var PATCH = hex("#f53cd1");

// src/core/curves.ts
var middle = (a, b) => [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
var copy = (p) => [p[0], p[1]];
var same = (a, b) => a[0] === b[0] && a[1] === b[1];
function segmentDistanceSquared(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const u = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  const ex = p[0] - a[0] - u * dx, ey = p[1] - a[1] - u * dy;
  return ex * ex + ey * ey;
}
function flatten(out, a, b, c, d, error2, depth) {
  if (depth === 16 || segmentDistanceSquared(b, a, d) <= error2 && segmentDistanceSquared(c, a, d) <= error2) {
    if (!same(out[out.length - 1], d)) out.push(copy(d));
    return;
  }
  const ab = middle(a, b), bc = middle(b, c), cd = middle(c, d);
  const abc = middle(ab, bc), bcd = middle(bc, cd), center = middle(abc, bcd);
  flatten(out, a, ab, abc, center, error2, depth + 1);
  flatten(out, center, bcd, cd, d, error2, depth + 1);
}
function errorSquared(tolerance) {
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError("Curve tolerance must be a finite positive number");
  return tolerance * tolerance;
}
function cubicBezier(p0, p1, p2, p3, tolerance = 0.25) {
  const out = [copy(p0)];
  flatten(out, p0, p1, p2, p3, errorSquared(tolerance), 0);
  return out;
}
function quadraticBezier(p0, p1, p2, tolerance = 0.25) {
  return cubicBezier(
    p0,
    [p0[0] + (p1[0] - p0[0]) * 2 / 3, p0[1] + (p1[1] - p0[1]) * 2 / 3],
    [p2[0] + (p1[0] - p2[0]) * 2 / 3, p2[1] + (p1[1] - p2[1]) * 2 / 3],
    p2,
    tolerance
  );
}
function catmullRom(points, { tolerance = 0.25, closed = false } = {}) {
  const error2 = errorSquared(tolerance), pts = [];
  for (const point of points) if (!pts.length || !same(pts[pts.length - 1], point)) pts.push(point);
  if (closed && pts.length > 1 && same(pts[0], pts[pts.length - 1])) pts.pop();
  if (pts.length < 2) return pts.map(copy);
  if (pts.length === 2) return closed ? [copy(pts[0]), copy(pts[1]), copy(pts[0])] : pts.map(copy);
  const out = [copy(pts[0])], n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const b = pts[i], c = pts[(i + 1) % n];
    const a = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : [2 * b[0] - c[0], 2 * b[1] - c[1]];
    const d = i + 2 < n ? pts[i + 2] : closed ? pts[(i + 2) % n] : [2 * c[0] - b[0], 2 * c[1] - b[1]];
    const dt0 = Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const dt1 = Math.sqrt(Math.hypot(c[0] - b[0], c[1] - b[1]));
    const dt2 = Math.sqrt(Math.hypot(d[0] - c[0], d[1] - c[1]));
    const c1 = [0, 0], c2 = [0, 0];
    for (let axis = 0; axis < 2; axis++) {
      const m1 = dt1 * ((b[axis] - a[axis]) / dt0 - (c[axis] - a[axis]) / (dt0 + dt1) + (c[axis] - b[axis]) / dt1);
      const m2 = dt1 * ((c[axis] - b[axis]) / dt1 - (d[axis] - b[axis]) / (dt1 + dt2) + (d[axis] - c[axis]) / dt2);
      c1[axis] = b[axis] + m1 / 3;
      c2[axis] = c[axis] - m2 / 3;
    }
    flatten(out, b, c1, c2, c, error2, 0);
  }
  return out;
}
function pathLengths(points) {
  const lengths = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) lengths[i] = lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return lengths;
}

export {
  TAU,
  clamp,
  lerp,
  fract,
  wrap,
  loopTime,
  seg,
  smooth,
  ease,
  rand,
  Rng,
  rng,
  noise,
  noise2,
  fbm,
  tileNoise,
  tileFbm,
  loopNoise,
  rgb,
  hex,
  toHex,
  mix,
  scale,
  luma,
  ramp,
  fit,
  at,
  PAL,
  WHITE,
  cubicBezier,
  quadraticBezier,
  catmullRom,
  pathLengths
};
