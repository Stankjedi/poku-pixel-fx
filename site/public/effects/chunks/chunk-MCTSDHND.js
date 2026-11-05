import {
  composite
} from "./chunk-YQJJU7UN.js";
import {
  Rng,
  TAU,
  WHITE,
  clamp,
  defineImpactContact2D,
  drawTrail,
  hex,
  impactContactAge2D,
  lerp,
  mix,
  motionTrail,
  particleEnvelope,
  pathLengths,
  rand,
  rng,
  scale,
  smooth
} from "./chunk-FEXYTCCO.js";

// src/core/particles.ts
function fly(x, y, vx, vy, t, g = 0, drag = 0) {
  if (drag <= 0) return [x + vx * t, y + vy * t + 0.5 * g * t * t];
  const f = -Math.expm1(-drag * t) / drag;
  return [x + vx * f, y + vy * f + g * accelerationTime(t, drag, f)];
}
function flyV(vx, vy, t, g = 0, drag = 0) {
  if (drag <= 0) return [vx, vy + g * t];
  const e = Math.exp(-drag * t), f = -Math.expm1(-drag * t) / drag;
  return [vx * e, vy * e + g * f];
}
function accelerationTime(t, drag, f) {
  const z = drag * t;
  return Math.abs(z) < 1e-3 ? t * t * (0.5 + z * (-1 / 6 + z * (1 / 24 + z * (-1 / 120 + z / 720)))) : (t - f) / drag;
}
function integrateMotion2D(p, dt, ax = 0, ay = 0, drag = 0, dragY = drag) {
  const ex = Math.exp(-drag * dt), fx = drag === 0 ? dt : -Math.expm1(-drag * dt) / drag;
  const gx = accelerationTime(dt, drag, fx);
  const ey = dragY === drag ? ex : Math.exp(-dragY * dt);
  const fy = dragY === drag ? fx : dragY === 0 ? dt : -Math.expm1(-dragY * dt) / dragY;
  const gy = dragY === drag ? gx : accelerationTime(dt, dragY, fy);
  p.x += p.vx * fx + ax * gx;
  p.y += p.vy * fy + ay * gy;
  p.vx = p.vx * ex + ax * fx;
  p.vy = p.vy * ey + ay * fy;
}
function cycle(t, period, count, seed, life, fn) {
  const limit = 65536;
  if (!Number.isFinite(period) || period <= 0) throw new RangeError("Cycle period must be finite and positive");
  if (!Number.isFinite(t) || !Number.isFinite(seed)) throw new RangeError("Cycle time and seed must be finite");
  if (!Number.isFinite(count) || count < 0 || count > limit) throw new RangeError(`Cycle count must be finite and between 0 and ${limit}`);
  if (typeof life !== "function" && !Number.isFinite(life)) throw new RangeError("Cycle lifetime must be finite");
  let remaining = limit;
  for (let i = 0; i < count; i++) {
    const g = rng(seed, i, 911);
    const born = g.next() * period;
    const L = typeof life === "function" ? life(g) : life;
    if (!Number.isFinite(L)) throw new RangeError("Cycle lifetime must be finite");
    let age = ((t - born) % period + period) % period;
    if (!Number.isFinite(age)) throw new RangeError("Cycle time overflow");
    if (Math.max(0, Math.ceil((L - age) / period)) > remaining)
      throw new RangeError(`Cycle exceeds ${limit} live copies; reduce count/life or increase period`);
    for (; age < L; age += period) {
      if (remaining-- === 0) throw new RangeError(`Cycle exceeds ${limit} live copies`);
      fn(age, L, rng(seed, i), i);
    }
  }
}

// src/core/flow.ts
function flowMotion(initial, age, phases) {
  if (!Number.isFinite(age) || age < 0 || ![initial.x, initial.y, initial.vx, initial.vy].every(Number.isFinite))
    throw new RangeError("Flow state and non-negative age must be finite");
  for (let i = 0; i < phases.length; i++) {
    const q = phases[i], drag = q.drag ?? 0;
    if (!(q.duration > 0) || !Number.isFinite(q.duration) && !(q.duration === Infinity && i === phases.length - 1) || ![q.ax ?? 0, q.ay ?? 0, drag, q.dragY ?? drag].every(Number.isFinite))
      throw new RangeError("Flow phases need positive durations and finite forces; only the last duration may be infinite");
  }
  const state = { x: initial.x, y: initial.y, vx: initial.vx, vy: initial.vy };
  let remaining = age;
  for (const q of phases) {
    if (!(remaining > 0)) break;
    const dt = Math.min(remaining, q.duration), drag = q.drag ?? 0;
    integrateMotion2D(state, dt, q.ax ?? 0, q.ay ?? 0, drag, q.dragY ?? drag);
    remaining -= dt;
  }
  return state;
}

// src/core/air.ts
function helicalAirflow(u, o) {
  const { height, turns = 2, phase = 0, perspective = 0.28, shear = 0.3 } = o;
  if (![u, height, turns, phase, perspective, shear].every(Number.isFinite) || !(height > 0) || Math.abs(shear) > 0.9)
    throw new RangeError("Helical airflow requires finite dimensions, positive height, and shear within -0.9..0.9");
  const k = clamp(u), radius = typeof o.radius === "function" ? o.radius(k) : o.radius, axis = o.axis?.(k) ?? 0;
  if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(axis)) throw new RangeError("Airflow radius must be finite and non-negative; axis must be finite");
  const angle = phase + TAU * turns * (k + shear * Math.sin(Math.PI * k) / Math.PI), depth = Math.sin(angle) * radius;
  return { x: axis + Math.cos(angle) * radius, y: -height * k + perspective * depth, depth };
}
function airflowTrail(position, age, seconds = 0.18, samples = 32, since = 0) {
  if (![age, seconds, samples, since].every(Number.isFinite) || seconds < 0 || samples < 2 || samples > 256 || !Number.isInteger(samples))
    throw new RangeError("Airflow trail needs finite times, non-negative length, and 2..256 integer samples");
  if (age <= since || seconds === 0) return [];
  const start = Math.max(since, age - seconds), points = [];
  for (let i = 0; i < samples; i++) {
    const q = position(start + (age - start) * i / (samples - 1));
    if (![q.x, q.y, q.depth].every(Number.isFinite)) throw new RangeError("Airflow positions must be finite");
    points.push({ ...q });
  }
  const lengths = pathLengths(points.map((q) => [q.x, q.y])), total = lengths[lengths.length - 1];
  if (!(total > 0)) return [];
  const runs = [];
  const append = (a, b, from, to, back) => {
    if (to <= from) return;
    let run = runs[runs.length - 1];
    if (!run || run.back !== back) {
      run = { points: [[a.x, a.y]], from, to, back };
      runs.push(run);
    }
    run.points.push([b.x, b.y]);
    run.to = to;
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], from = lengths[i - 1] / total, to = lengths[i] / total;
    if (a.depth < 0 !== b.depth < 0 && a.depth !== b.depth) {
      const k = -a.depth / (b.depth - a.depth), q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, depth: 0 };
      const cut = from + (to - from) * k;
      append(a, q, from, cut, a.depth < 0);
      append(q, b, cut, to, b.depth < 0);
    } else append(a, b, from, to, a.depth + b.depth < 0);
  }
  return runs;
}
function drawAirflow(p, runs, style) {
  const { alpha = 1, width = 1, color, head = color, back } = style;
  if (![alpha, width].every(Number.isFinite) || alpha < 0 || width < 0) throw new RangeError("Airflow opacity and width must be finite and non-negative");
  if (!(alpha > 0) || !(width > 0)) return;
  for (const run of runs) {
    if (back !== void 0 && run.back !== back) continue;
    const global = (u) => run.from + (run.to - run.from) * u;
    p.path(
      run.points,
      (u) => global(u) > 0.58 ? head : color,
      (u) => alpha * smooth(0, 0.34, global(u)) * (1 - smooth(0.9, 1, global(u))),
      width
    );
  }
}

// src/core/liquid.ts
function parameters(launch, physics) {
  const x = launch.x ?? 0, z = launch.z ?? 0, h = launch.h ?? 0;
  const vx = launch.vx ?? 0, vz = launch.vz ?? 0, vh = launch.vh ?? 0;
  const gravity = physics.gravity ?? 820, drag = physics.drag ?? 0.35, depthScale = physics.depthScale ?? 0.22;
  if (![x, z, h, vx, vz, vh, gravity, drag, depthScale].every(Number.isFinite) || h < 0 || gravity <= 0 || drag < 0 || depthScale < 0)
    throw new RangeError("Liquid launch and physics must be finite; height, drag and depthScale non-negative, gravity positive");
  return { x, z, h, vx, vz, vh, gravity, drag, depthScale };
}
function liquidMotion(launch, age, physics = {}) {
  if (!Number.isFinite(age) || age < 0) throw new RangeError("Liquid age must be finite and non-negative");
  const q = parameters(launch, physics);
  const [x, negativeH] = fly(q.x, -q.h, q.vx, -q.vh, age, q.gravity, q.drag);
  const [z] = fly(q.z, 0, q.vz, 0, age, 0, q.drag);
  const [vx, negativeVh] = flyV(q.vx, -q.vh, age, q.gravity, q.drag);
  const [vz] = flyV(q.vz, 0, age, 0, q.drag);
  return {
    x,
    z,
    h: -negativeH,
    vx,
    vz,
    vh: -negativeVh,
    y: z * q.depthScale + negativeH,
    vy: vz * q.depthScale + negativeVh
  };
}
function liquidImpactTime(launch, physics = {}) {
  const q = parameters(launch, physics);
  if (q.h === 0 && q.vh <= 0) return 0;
  const root = Math.hypot(q.vh, Math.sqrt(2 * q.gravity * q.h));
  const ballistic = q.vh < 0 ? 2 * q.h / (root - q.vh) : (q.vh + root) / q.gravity;
  if (q.drag === 0) return ballistic;
  let low = 0, high = Math.max(1e-3, ballistic);
  const height = (age) => -fly(0, -q.h, 0, -q.vh, age, q.gravity, q.drag)[1];
  while (height(high) > 0) {
    high *= 2;
    if (!Number.isFinite(high)) throw new RangeError("Liquid landing time exceeds the numeric range");
  }
  for (let i = 0; i < 52; i++) {
    const middle = (low + high) / 2;
    if (height(middle) > 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// src/core/smoke.ts
function smokeVolume(p, cells, palette, style = {}) {
  const opacity = style.opacity ?? 1, lx = style.lightX ?? -0.6, ly = style.lightY ?? -0.8;
  if (![opacity, lx, ly].every(Number.isFinite) || opacity < 0) throw new RangeError("Smoke style must be finite, with non-negative opacity");
  if (!palette.length || !cells.length || opacity === 0) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (![c.x, c.y, c.rx, c.ry, c.density].every(Number.isFinite) || c.rx <= 0 || c.ry <= 0)
      throw new RangeError("Smoke cells need finite values and positive radii");
    x0 = Math.min(x0, Math.floor(c.x - c.rx) - 1);
    x1 = Math.max(x1, Math.ceil(c.x + c.rx) + 1);
    y0 = Math.min(y0, Math.floor(c.y - c.ry) - 1);
    y1 = Math.max(y1, Math.ceil(c.y + c.ry) + 1);
  }
  const w = x1 - x0, h = y1 - y0;
  if (w * h > 4194304) throw new RangeError("Smoke field exceeds 4 million logical cells");
  const field = new Float32Array(w * h);
  for (const c of cells) {
    if (c.density === 0) continue;
    const ax = Math.max(0, Math.floor(c.x - c.rx) - x0), bx = Math.min(w - 1, Math.ceil(c.x + c.rx) - x0);
    const ay = Math.max(0, Math.floor(c.y - c.ry) - y0), by = Math.min(h - 1, Math.ceil(c.y + c.ry) - y0);
    const ix = 1 / c.rx, iy = 1 / c.ry;
    for (let y = ay; y <= by; y++) {
      const dy = (y + y0 + 0.5 - c.y) * iy, yy = dy * dy;
      if (yy >= 1) continue;
      for (let x = ax; x <= bx; x++) {
        const dx = (x + x0 + 0.5 - c.x) * ix, q = 1 - dx * dx - yy;
        if (q > 0) field[y * w + x] += c.density * q * q;
      }
    }
  }
  const lightLength = Math.hypot(lx, ly) || 1;
  p.each(x0, y0, x1, y1, (x, y, sx, sy) => {
    const xx = Math.floor(x) - x0, yy = Math.floor(y) - y0, j = yy * w + xx, d = field[j];
    if (!(d > 8e-3) || xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) return;
    const nx = field[j - 1] - field[j + 1], ny = field[j - w] - field[j + w];
    const diffuse = (nx * lx + ny * ly) / ((Math.hypot(nx, ny) + 0.14) * lightLength);
    const brightness = Math.max(0, Math.min(0.999, 0.51 + diffuse * 0.37 - Math.min(0.17, d * 0.045)));
    const color = palette[Math.floor(brightness * palette.length)];
    p.blendPx(sx, sy, color, 1 - Math.exp(-d * opacity));
  });
}
function smokeCurl(cells, x, y, radius, angle, turn, thickness, density, steps = 14) {
  if (![x, y, radius, angle, turn, thickness, density, steps].every(Number.isFinite) || radius <= 0 || thickness <= 0 || steps < 2 || steps > 128)
    throw new RangeError("Smoke curl needs finite dimensions and 2..128 steps");
  const n = Math.floor(steps);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = angle + turn * u, r = radius * (1 - 0.76 * u);
    const width = thickness * (1 - 0.48 * u);
    cells.push({
      x: x + Math.cos(a) * r,
      y: y + Math.sin(a) * r,
      rx: width,
      ry: width * 0.91,
      density: density * (1 - 0.5 * u) / n * 6
    });
  }
}

// src/core/stone.ts
function cell(polygon) {
  let twiceArea = 0, x = 0, y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }
  return { polygon, area: twiceArea / 2, center: [x / (3 * twiceArea), y / (3 * twiceArea)] };
}
function clip(polygon, nx, ny, d) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a[0] * nx + a[1] * ny - d, db = b[0] * nx + b[1] * ny - d;
    if (da <= 0) result.push([a[0], a[1]]);
    if (da < 0 && db > 0 || da > 0 && db < 0) {
      const t = da / (da - db);
      result.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  return result;
}
function fractureStone(points, options = {}) {
  const { seed = 1, pieces = 14, minArea = 4 } = options;
  if (!Number.isFinite(seed) || !Number.isInteger(pieces) || pieces < 1 || pieces > 256 || !Number.isFinite(minArea) || minArea <= 0 || points.length < 3 || points.length > 256 || points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6)))
    throw new RangeError("Stone needs 3..256 finite convex vertices, 1..256 pieces and positive minArea");
  let polygon = points.map((p) => [p[0], p[1]]);
  if (cell(polygon).area < 0) polygon.reverse();
  const base = cell(polygon);
  if (!(base.area > 1e-8) || !base.center.every(Number.isFinite)) throw new RangeError("Stone polygon must have positive area");
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 1e-8 || polygon.some((p) => dx * (p[1] - a[1]) - dy * (p[0] - a[0]) < -1e-7))
      throw new RangeError("Stone polygon must be convex with no repeated adjacent vertices");
  }
  const result = [base], rng2 = new Rng(seed), blocked = /* @__PURE__ */ new Set();
  while (result.length < pieces) {
    const target = result.filter((c) => c.area >= minArea * 2 && !blocked.has(c)).sort((a, b) => b.area - a.area)[0];
    if (!target) break;
    let halves, best = -Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng2.range(0, Math.PI), nx = Math.cos(angle), ny = Math.sin(angle);
      const projections = target.polygon.map((p) => p[0] * nx + p[1] * ny);
      const d = lerp(Math.min(...projections), Math.max(...projections), rng2.range(0.38, 0.62));
      const a = cell(clip(target.polygon, nx, ny, d)), b = cell(clip(target.polygon, -nx, -ny, -d));
      if (a.area >= minArea && b.area >= minArea) {
        const compactness = (c) => {
          let perimeter = 0;
          for (let i = 0; i < c.polygon.length; i++) {
            const p = c.polygon[i], q = c.polygon[(i + 1) % c.polygon.length];
            perimeter += Math.hypot(q[0] - p[0], q[1] - p[1]);
          }
          return c.area / (perimeter * perimeter);
        };
        const score = Math.min(compactness(a), compactness(b));
        if (score > best) {
          best = score;
          halves = [a, b];
        }
      }
    }
    if (halves) result.splice(result.indexOf(target), 1, ...halves);
    else blocked.add(target);
  }
  return result;
}
function rubblePath(vertices, launch, options = {}) {
  const { duration = 3, gravity = 720, bounce = 0.24, friction = 0.68, ground = 0 } = options;
  const { x, y, vx, vy, angle = 0, spin = 0 } = launch;
  if (!vertices.length || vertices.length > 256 || vertices.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6)) || ![x, y, vx, vy, angle, spin, duration, gravity, bounce, friction, ground].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6) || duration <= 0 || duration > 30 || gravity <= 0 || bounce < 0 || bounce >= 1 || friction < 0 || friction > 1)
    throw new RangeError("Rubble values must be finite within +/-1e6, duration 0..30, gravity positive, bounce [0,1), friction [0,1]");
  const shape = vertices.map((p) => [p[0], p[1]]);
  const support = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return Math.max(...shape.map((p) => p[0] * s + p[1] * c));
  };
  const steps = Math.ceil(duration * 240), dt = duration / steps, impacts = [];
  const state = { x, y: Math.min(y, ground - support(angle)), vx, vy, angle, spin, resting: false };
  const frames = [{ ...state }];
  for (let i = 1; i <= steps; i++) {
    if (!state.resting) {
      state.x += state.vx * dt;
      state.y += state.vy * dt + gravity * dt * dt / 2;
      state.vy += gravity * dt;
      state.angle += state.spin * dt;
      const floor = ground - support(state.angle);
      if (state.y >= floor && state.vy > 0) {
        state.y = floor;
        impacts.push({ time: i * dt, x: state.x, y: ground, speed: state.vy });
        state.vx *= 1 - friction;
        state.spin *= -0.3;
        if (state.vy * bounce < 28) {
          state.resting = true;
          state.vx = state.vy = state.spin = 0;
        } else state.vy *= -bounce;
      } else if (state.y > floor) state.y = floor;
    }
    frames.push({ ...state });
  }
  return {
    duration,
    impacts,
    sample(time) {
      if (!Number.isFinite(time) || time < 0) throw new RangeError("Rubble time must be finite and non-negative");
      const f = Math.min(time / dt, steps), i = Math.floor(f), a = frames[i], b = frames[Math.min(i + 1, steps)], u = f - i;
      const angle2 = lerp(a.angle, b.angle, u);
      return {
        x: lerp(a.x, b.x, u),
        y: Math.min(lerp(a.y, b.y, u), ground - support(angle2)),
        vx: lerp(a.vx, b.vx, u),
        vy: lerp(a.vy, b.vy, u),
        angle: angle2,
        spin: lerp(a.spin, b.spin, u),
        resting: a.resting
      };
    }
  };
}

// src/core/glass.ts
function areaCenter(p) {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }
  return { area: area / 2, center: [x / (3 * area), y / (3 * area)] };
}
function clip2(p, axis, boundary, sign) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], da = (a[axis] - boundary) * sign, db = (b[axis] - boundary) * sign;
    if (da <= 1e-10) out.push(a);
    if (da < 0 && db > 0 || da > 0 && db < 0) {
      const u = da / (da - db);
      out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
    }
  }
  return out.filter((a, i) => {
    const b = out[(i + 1) % out.length];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-8;
  });
}
var freezePoint = (p) => Object.freeze([p[0], p[1]]);
function fractureGlass(bounds, impact, options = {}) {
  const { left, top, right, bottom } = bounds, { seed = 1, spokes = 12, rings = 3 } = options;
  if (![left, top, right, bottom, seed, ...impact].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e5) || impact.length !== 2 || right - left < 1 || bottom - top < 1 || !Number.isInteger(spokes) || spokes < 6 || spokes > 32 || !Number.isInteger(rings) || rings < 1 || rings > 5 || impact[0] <= left || impact[0] >= right || impact[1] <= top || impact[1] >= bottom)
    throw new RangeError("Glass needs finite bounds, an interior impact, 6..32 spokes and 1..5 rings");
  const rng2 = new Rng(seed), step = TAU / spokes, phase = rng2.range(0, step);
  const angles = Array.from({ length: spokes }, (_, i) => phase + step * (i + rng2.range(-0.18, 0.18)));
  const radius = Math.max(...[[left, top], [right, top], [right, bottom], [left, bottom]].map((p) => Math.hypot(p[0] - impact[0], p[1] - impact[1])));
  const outer = angles.map((a) => [impact[0] + Math.cos(a) * radius * 1.7, impact[1] + Math.sin(a) * radius * 1.7]);
  const fractions = Array.from({ length: rings }, (_, i) => Math.pow((i + 1) / (rings + 1), 1.9) * 0.48);
  const levels = [
    Array.from({ length: spokes }, () => [impact[0], impact[1]]),
    ...[...fractions, 1].map((f) => outer.map((p) => [lerp(impact[0], p[0], f), lerp(impact[1], p[1], f)]))
  ];
  const cells = [], cracks = [], seen = /* @__PURE__ */ new Set();
  for (let ring = 0; ring + 1 < levels.length; ring++) for (let i = 0; i < spokes; i++) {
    const next = (i + 1) % spokes;
    let polygon = ring === 0 ? [impact, levels[1][i], levels[1][next]] : [levels[ring][i], levels[ring + 1][i], levels[ring + 1][next], levels[ring][next]];
    for (const [axis, edge, sign] of [[0, left, -1], [0, right, 1], [1, top, -1], [1, bottom, 1]]) polygon = clip2(polygon, axis, edge, sign);
    if (polygon.length < 3) continue;
    const c = areaCenter(polygon);
    if (c.area <= 1e-7) continue;
    const frozen = Object.freeze(polygon.map(freezePoint));
    cells.push(Object.freeze({ polygon: frozen, center: freezePoint(c.center), area: c.area, ring, spoke: i }));
    for (let k = 0; k < polygon.length; k++) {
      const a = polygon[k], b = polygon[(k + 1) % polygon.length];
      if ([left, right].some((x) => Math.abs(a[0] - x) < 1e-7 && Math.abs(b[0] - x) < 1e-7) || [top, bottom].some((y) => Math.abs(a[1] - y) < 1e-7 && Math.abs(b[1] - y) < 1e-7)) continue;
      const keys = [a, b].map((p) => p.map((v) => v.toFixed(6)).join(",")).sort(), key = keys.join("|");
      if (!seen.has(key)) {
        seen.add(key);
        cracks.push(Object.freeze([freezePoint(a), freezePoint(b)]));
      }
    }
  }
  return Object.freeze({ cells: Object.freeze(cells), cracks: Object.freeze(cracks) });
}
function glassVertices(vertices, pose) {
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle), turn = Math.cos(pose.tumble);
  return vertices.map(([x, y]) => [pose.x + x * turn * c - y * s, pose.y + (x * turn * s + y * c) * pose.flatten]);
}
function glassShardPath(vertices, launch, options = {}) {
  const { duration = 2.5, gravity = 420, drag = 0.6, bounce = 0.26, friction = 0.62, ground = 0 } = options;
  const { x, y, vx, vy, angle = 0, spin = 0, tumble = 0, tumbleSpeed = 0 } = launch;
  if (!vertices.length || vertices.length > 32 || vertices.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e4)) || ![x, y, vx, vy, angle, spin, tumble, tumbleSpeed, duration, gravity, drag, bounce, friction, ground].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e5) || duration <= 0 || duration > 12 || gravity <= 0 || drag < 0 || bounce < 0 || bounce >= 1 || friction < 0 || friction > 1)
    throw new RangeError("Glass motion needs bounded finite values, duration 0..12, gravity > 0, drag >= 0, bounce [0,1), friction [0,1]");
  const shape = vertices.map((p) => [...p]), steps = Math.ceil(duration * 240), dt = duration / steps;
  const pose = { x, y, vx, vy, angle, tumble, flatten: 1, resting: false }, impacts = [];
  let spinNow = spin, tumbleNow = tumbleSpeed, settlingAt = -1, settleAngle = angle, settleTumble = tumble;
  const support = (p) => glassVertices(shape, { ...p, x: 0, y: 0 }).reduce((a, b) => a[1] > b[1] ? a : b);
  pose.y = Math.min(pose.y, ground - support(pose)[1]);
  const frames = [{ ...pose }];
  for (let i = 1; i <= steps; i++) {
    if (settlingAt >= 0) {
      const u = clamp((i * dt - settlingAt) / 0.16), eased = u * u * (3 - 2 * u);
      pose.angle = lerp(settleAngle, Math.round(settleAngle / Math.PI) * Math.PI, eased);
      pose.tumble = lerp(settleTumble, Math.round(settleTumble / TAU) * TAU, eased);
      pose.flatten = lerp(1, 0.16, eased);
      pose.x += pose.vx * dt;
      pose.vx *= Math.exp(-dt * 22);
      pose.y = ground - support(pose)[1];
      if (u === 1) {
        pose.resting = true;
        pose.vx = 0;
      }
    } else {
      pose.x += pose.vx * dt;
      pose.y += pose.vy * dt + 0.5 * gravity * dt * dt;
      pose.vy += gravity * dt;
      pose.vx *= Math.exp(-drag * dt);
      pose.angle += spinNow * dt;
      pose.tumble += tumbleNow * dt;
      const lowest = support(pose), floor = ground - lowest[1];
      if (pose.y >= floor && pose.vy > 0) {
        pose.y = floor;
        impacts.push(Object.freeze({ time: i * dt, x: pose.x + lowest[0], y: ground, speed: pose.vy }));
        pose.vx *= 1 - friction;
        spinNow *= -0.32;
        tumbleNow *= 0.4;
        if (pose.vy * bounce < 26 || impacts.length >= 3) {
          settlingAt = i * dt;
          settleAngle = pose.angle;
          settleTumble = pose.tumble;
          pose.vy = 0;
        } else pose.vy *= -bounce;
      } else if (pose.y > floor) pose.y = floor;
    }
    frames.push({ ...pose });
  }
  return Object.freeze({ duration, impacts: Object.freeze(impacts), sample(time) {
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Glass sample time must be finite and non-negative");
    const f = Math.min(time / dt, steps), i = Math.floor(f), a = frames[i], b = frames[Math.min(i + 1, steps)], u = f - i;
    const p = {
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      vx: lerp(a.vx, b.vx, u),
      vy: lerp(a.vy, b.vy, u),
      angle: lerp(a.angle, b.angle, u),
      tumble: lerp(a.tumble, b.tumble, u),
      flatten: lerp(a.flatten, b.flatten, u),
      resting: a.resting
    };
    p.y = Math.min(p.y, ground - support(p)[1]);
    return p;
  } });
}

// src/core/frost.ts
var point = (x, y) => Object.freeze([x, y]);
function frostAccretion2D(input, options = {}) {
  const contact = defineImpactContact2D(input);
  const { seed = 1, count = 11, halfSpan = 36, length = 19, exposure = 0.85, spreadSpeed = 85, hold = 0.24 } = options;
  if (![seed, count, halfSpan, length, exposure, spreadSpeed, hold].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e5) || !Number.isInteger(count) || count < 3 || count > 32 || halfSpan <= 0 || length <= 0 || exposure <= 0 || exposure > 12 || spreadSpeed <= 0 || hold < 0 || hold > 12)
    throw new RangeError("Frost needs finite bounds, 3..32 roots, positive dimensions/exposure/speed and nonnegative hold");
  const rng2 = new Rng(seed), [nx, ny] = contact.normal, tx = -ny, ty = nx, [cx, cy] = contact.position;
  const ends = contact.at + exposure, branches = [];
  const add = (root, tip, width, parent, attachment, startsAt, growsFor, releasesAt) => branches.push(Object.freeze({ root, tip, width, parent, attachment, startsAt, growsFor, releasesAt }));
  for (let i = 0; i < count; i++) {
    const along = halfSpan * (-1 + 2 * (i + 0.5 + (i === (count - 1) / 2 ? 0 : rng2.range(-0.2, 0.2))) / count), root = point(cx + tx * along, cy + ty * along);
    const reach = length * rng2.range(0.67, 1.12) * (1 - 0.18 * Math.abs(along) / halfSpan);
    const lean = along * 0.16 + rng2.range(-2.5, 2.5), tip = point(root[0] + nx * reach + tx * lean, root[1] + ny * reach + ty * lean);
    const start = contact.at + Math.abs(along) / spreadSpeed, grow = rng2.range(0.25, 0.36), release = ends + hold + rng2.range(0, 0.34) + Math.abs(along) * 1e-3;
    const index = branches.length;
    add(root, tip, rng2.range(4.1, 6.6), -1, 0, start, grow, release);
    for (const sign of [-1, 1]) {
      const at = rng2.range(0.44, 0.64), childRoot = point(lerp(root[0], tip[0], at), lerp(root[1], tip[1], at));
      const reach2 = length * rng2.range(0.25, 0.39), childTip = point(
        childRoot[0] + nx * reach2 * 0.65 + tx * reach2 * 0.76 * sign,
        childRoot[1] + ny * reach2 * 0.65 + ty * reach2 * 0.76 * sign
      );
      add(childRoot, childTip, rng2.range(1.6, 2.5), index, at, start + grow * at, grow * 0.48, release - 0.055);
    }
  }
  const frozen = Object.freeze(branches);
  return Object.freeze({ contact, branches: frozen, exposureEndsAt: ends, sample(index, time) {
    if (!Number.isInteger(index) || index < 0 || index >= branches.length || !Number.isFinite(time)) throw new RangeError("Frost sample needs a valid branch index and finite time");
    const b = branches[index], age = impactContactAge2D(contact, time);
    const growth = age < 0 ? 0 : clamp((Math.min(time, ends) - b.startsAt) / b.growsFor);
    const tip = point(lerp(b.root[0], b.tip[0], growth), lerp(b.root[1], b.tip[1], growth));
    const dx = b.tip[0] - b.root[0], dy = b.tip[1] - b.root[1], distance = Math.hypot(dx, dy), width = b.width * Math.min(1, growth * 2), ux = -dy / distance, uy = dx / distance;
    const shoulder = point(lerp(b.root[0], tip[0], 0.24), lerp(b.root[1], tip[1], 0.24));
    const polygon = Object.freeze([
      b.root,
      point(shoulder[0] + ux * width * 0.5, shoulder[1] + uy * width * 0.5),
      tip,
      point(shoulder[0] - ux * width * 0.5, shoulder[1] - uy * width * 0.5)
    ]);
    return Object.freeze({ growth, attached: growth > 0 && time < b.releasesAt, fracture: growth > 0 ? clamp((time - b.releasesAt + 0.1) / 0.1) : 0, polygon, tip });
  } });
}

// src/core/corrosion.ts
function surfaceCorrosion2D(input, target, options = {}) {
  const contact = defineImpactContact2D(input), { x, y, mask } = target;
  const { seed = 1, reach = 44, spreadSpeed = 70, wetFor = 1.1, dryFor = 0.6, flow = [0, 1] } = options;
  if (![x, y, mask.w, mask.h, seed, reach, spreadSpeed, wetFor, dryFor].every(Number.isFinite) || !Number.isInteger(mask.w) || !Number.isInteger(mask.h) || mask.w < 1 || mask.h < 1 || mask.w > 512 || mask.h > 512 || mask.data.length !== mask.w * mask.h || Math.abs(x) > 1e6 || Math.abs(y) > 1e6 || reach <= 0 || reach > 2048 || spreadSpeed <= 0 || spreadSpeed > 1e5 || wetFor <= 0 || wetFor > 30 || dryFor <= 0 || dryFor > 30 || !Array.isArray(flow) || flow.length !== 2 || !flow.every(Number.isFinite))
    throw new RangeError("Corrosion needs a complete 1..512 mask, finite placement/flow and positive bounded timing");
  const n = mask.w * mask.h, occupied = new Uint8Array(n), distances = new Float64Array(n).fill(Infinity);
  let root = -1, nearest = Infinity;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(mask.data[i])) throw new RangeError("Corrosion mask values must be finite");
    if (mask.data[i] <= 0) continue;
    occupied[i] = 1;
    const d = (x + i % mask.w - contact.position[0]) ** 2 + (y + Math.floor(i / mask.w) - contact.position[1]) ** 2;
    if (d < nearest) {
      root = i;
      nearest = d;
    }
  }
  if (root < 0 || nearest > 2.25) throw new RangeError("Corrosion contact must touch an occupied surface pixel");
  const fl = Math.hypot(...flow);
  if (!Number.isFinite(fl)) throw new RangeError("Corrosion flow length must be finite");
  const fx = fl > 0 ? flow[0] / fl : 0, fy = fl > 0 ? flow[1] / fl : 0;
  const heap = [];
  const push = (i, d) => {
    const item = { i, d };
    let at = heap.length;
    heap.push(item);
    while (at > 0) {
      const p = at - 1 >> 1;
      if (heap[p].d <= d) break;
      heap[at] = heap[p];
      at = p;
    }
    heap[at] = item;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let at = 0;
      while (at * 2 + 1 < heap.length) {
        let c = at * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].d < heap[c].d) c++;
        if (heap[c].d >= last.d) break;
        heap[at] = heap[c];
        at = c;
      }
      heap[at] = last;
    }
    return first;
  };
  distances[root] = 0;
  push(root, 0);
  while (heap.length) {
    const q = pop();
    if (q.d !== distances[q.i]) continue;
    const ix = q.i % mask.w, iy = Math.floor(q.i / mask.w);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const xx = ix + dx, yy = iy + dy;
      if (xx < 0 || yy < 0 || xx >= mask.w || yy >= mask.h) continue;
      const j = yy * mask.w + xx;
      if (!occupied[j]) continue;
      if (dx && dy && (!occupied[iy * mask.w + xx] || !occupied[yy * mask.w + ix])) continue;
      const roughness = 0.92 + 0.16 * rand(Math.floor(xx / 5), Math.floor(yy / 5), seed + 137);
      const cost = (Math.hypot(dx, dy) - 0.42 * (dx * fx + dy * fy)) * roughness, d = q.d + cost;
      if (d > reach || d >= distances[j]) continue;
      distances[j] = d;
      push(j, d);
    }
  }
  const inside = (i, j) => i >= 0 && j >= 0 && i < mask.w && j < mask.h && !!occupied[j * mask.w + i];
  const cells = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(distances[i])) {
    const ix = i % mask.w, iy = Math.floor(i / mask.w), distance = distances[i], dose = clamp(1 - distance / reach);
    const cluster = rand(Math.floor(ix / 3), Math.floor(iy / 3), seed), pit = cluster > 0.5 ? clamp((cluster - 0.48) * 2.2) : 0;
    cells.push(Object.freeze({
      x: x + ix,
      y: y + iy,
      distance,
      startsAt: contact.at + distance / spreadSpeed,
      dose,
      edge: !inside(ix - 1, iy) || !inside(ix + 1, iy) || !inside(ix, iy - 1) || !inside(ix, iy + 1),
      pit
    }));
  }
  return Object.freeze({
    contact,
    cells: Object.freeze(cells),
    driesAt: contact.at + reach / spreadSpeed + wetFor + dryFor,
    sample(index, time) {
      if (!Number.isInteger(index) || index < 0 || index >= cells.length || !Number.isFinite(time)) throw new RangeError("Corrosion sample needs a valid cell and finite time");
      const c = cells[index], age = time - c.startsAt;
      if (impactContactAge2D(contact, time) < 0 || age < 0) return Object.freeze({ wet: 0, etch: 0, active: false });
      const wet = smooth(0, 0.055, age) * (1 - smooth(wetFor, wetFor + dryFor, age)) * c.dose;
      const etch = smooth(0.12, wetFor + 0.15, age) * c.dose * (0.24 + 0.76 * c.pit) * clamp(contact.strength, 0, 2);
      return Object.freeze({ wet, etch: clamp(etch), active: wet > 0.02 });
    }
  });
}

// src/core/sigil.ts
function projectSigilPath(points, plane = {}) {
  const { x = 0, y = 0, rotation = 0, perspective = 0.3, height = 0 } = plane;
  if (![x, y, rotation, perspective, height].every(Number.isFinite) || perspective < 0 || perspective > 1)
    throw new RangeError("A sigil plane needs finite dimensions and perspective within 0..1");
  if (points.length > 1024) throw new RangeError("A sigil stroke supports at most 1024 vertices");
  const cs = Math.cos(rotation), sn = Math.sin(rotation);
  const vertices = points.map(([u, v, lift = 0]) => {
    if (![u, v, lift].every(Number.isFinite)) throw new RangeError("Sigil coordinates must be finite");
    const depth = u * sn + v * cs;
    const q = { x: x + u * cs - v * sn, y: y + depth * perspective - height - lift, depth };
    if (![q.x, q.y, q.depth].every(Number.isFinite)) throw new RangeError("Projected sigil coordinates must remain finite");
    return q;
  });
  if (vertices.length < 2) return [];
  const lengths = pathLengths(vertices.map((q) => [q.x, q.y])), total = lengths[lengths.length - 1];
  if (!Number.isFinite(total)) throw new RangeError("Projected sigil length must remain finite");
  if (!(total > 0)) return [];
  const runs = [];
  const append = (a, b, from, to, back) => {
    if (to <= from) return;
    let run = runs.at(-1);
    if (!run || run.back !== back) {
      run = { points: [[a.x, a.y]], back, from, to };
      runs.push(run);
    }
    run.points.push([b.x, b.y]);
    run.to = to;
  };
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1], b = vertices[i], from = lengths[i - 1] / total, to = lengths[i] / total;
    if (a.depth < 0 !== b.depth < 0 && a.depth !== b.depth) {
      const u = -a.depth / (b.depth - a.depth), q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, depth: 0 };
      const cut = from + (to - from) * u;
      append(a, q, from, cut, a.depth < 0);
      append(q, b, cut, to, b.depth < 0);
    } else append(a, b, from, to, a.depth + b.depth < 0);
  }
  return runs;
}
function sigilArc(radius, start = 0, end = Math.PI * 2, tolerance = 0.18) {
  if (![radius, start, end, tolerance].every(Number.isFinite) || radius < 0 || !(tolerance > 0))
    throw new RangeError("Sigil arcs need a finite non-negative radius and positive tolerance");
  const span = end - start;
  if (Math.abs(span) > Math.PI * 2 + 1e-10) throw new RangeError("A sigil arc supports at most one complete turn");
  if (radius === 0 || span === 0) return [[Math.cos(start) * radius, Math.sin(start) * radius]];
  const step = 2 * Math.acos(Math.max(-1, 1 - tolerance / radius));
  const n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2)), Math.ceil(Math.abs(span) / step));
  if (n > 1023 || !Number.isFinite(n)) throw new RangeError("Sigil arc tolerance needs more than 1024 vertices");
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const a = start + span * i / n;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  if (Math.abs(Math.abs(span) - Math.PI * 2) < 1e-12) points[n] = [...points[0]];
  return points;
}

// src/core/propulsion.ts
var positive = (n, name) => {
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${name} must be finite and positive`);
};
var CubicFlightPath = class {
  length;
  points;
  lengths;
  segments;
  constructor(points, segments = 256) {
    if (points.length !== 4 || points.some((p) => p.length !== 2 || !p.every(Number.isFinite))) throw new RangeError("Flight needs four finite 2D control points");
    if (!Number.isInteger(segments) || segments < 16 || segments > 4096) throw new RangeError("Flight segments must be an integer from 16 to 4096");
    this.points = points.map((p) => [p[0], p[1]]);
    this.segments = segments;
    this.lengths = new Float64Array(segments + 1);
    let last = this.position(0);
    for (let i = 1; i <= segments; i++) {
      const next = this.position(i / segments);
      this.lengths[i] = this.lengths[i - 1] + Math.hypot(next[0] - last[0], next[1] - last[1]);
      last = next;
    }
    this.length = this.lengths[segments];
    if (!Number.isFinite(this.length)) throw new RangeError("Flight length overflow");
  }
  position(u) {
    const v = 1 - u, [a, b, c, d] = this.points;
    return [
      a[0] * v * v * v + 3 * b[0] * v * v * u + 3 * c[0] * v * u * u + d[0] * u * u * u,
      a[1] * v * v * v + 3 * b[1] * v * v * u + 3 * c[1] * v * u * u + d[1] * u * u * u
    ];
  }
  /** Sample normalized arc distance, with analytic tangent and an endpoint fallback for zero derivatives. */
  atDistance(fraction) {
    if (!Number.isFinite(fraction)) throw new RangeError("Flight distance must be finite");
    if (this.length === 0) return { x: this.points[0][0], y: this.points[0][1], dx: 1, dy: 0, angle: 0, speed: 0 };
    const distance = clamp(fraction) * this.length;
    let lo = 0, hi = this.segments;
    while (hi - lo > 1) {
      const mid = lo + hi >>> 1;
      if (this.lengths[mid] < distance) lo = mid;
      else hi = mid;
    }
    const span = this.lengths[hi] - this.lengths[lo];
    const u = this.length ? (lo + (span ? (distance - this.lengths[lo]) / span : 0)) / this.segments : 0;
    const [x, y] = this.position(u), v = 1 - u, [a, b, c, d] = this.points;
    let dx = 3 * v * v * (b[0] - a[0]) + 6 * v * u * (c[0] - b[0]) + 3 * u * u * (d[0] - c[0]);
    let dy = 3 * v * v * (b[1] - a[1]) + 6 * v * u * (c[1] - b[1]) + 3 * u * u * (d[1] - c[1]);
    if (Math.hypot(dx, dy) < 1e-9) {
      const before = this.position(Math.max(0, u - 1e-4)), after = this.position(Math.min(1, u + 1e-4));
      dx = after[0] - before[0];
      dy = after[1] - before[1];
    }
    const magnitude = Math.hypot(dx, dy);
    dx = magnitude > 1e-12 ? dx / magnitude : 1;
    dy = magnitude > 1e-12 ? dy / magnitude : 0;
    return { x, y, dx, dy, angle: Math.atan2(dy, dx), speed: 0 };
  }
  /** power >= 1 gives controllable acceleration. Endpoint speed is zero outside the flight interval. */
  atTime(time, duration, power = 1) {
    positive(duration, "Flight duration");
    if (!Number.isFinite(time) || !Number.isFinite(power) || power < 1) throw new RangeError("Flight time must be finite and power at least 1");
    const q = clamp(time / duration), pose = this.atDistance(q ** power);
    pose.speed = time < 0 || time > duration ? 0 : this.length / duration * power * q ** (power - 1);
    return pose;
  }
};
function dragDisplacement(velocity, acceleration, age, drag) {
  if (![velocity, acceleration, age, drag].every(Number.isFinite) || age < 0 || drag < 0) throw new RangeError("Drag motion requires finite values and non-negative age/drag");
  const z = drag * age;
  const integral = z < 1e-4 ? age * (1 - z / 2 + z * z / 6 - z * z * z / 24) : -Math.expm1(-z) / drag;
  const forceIntegral = z < 1e-4 ? age * age * (0.5 - z / 6 + z * z / 24 - z * z * z / 120) : (age - integral) / drag;
  return velocity * integral + acceleration * forceIntegral;
}
function createExhaustWake(path, options) {
  const {
    duration,
    power = 1.25,
    spacing = 2,
    nozzle = 7,
    speed = 30,
    inherit = 0.08,
    drag = 3.2,
    buoyancy = 7,
    life = 1.25,
    radius = 5,
    seed = 1
  } = options;
  positive(duration, "Exhaust duration");
  positive(spacing, "Exhaust spacing");
  positive(life, "Exhaust life");
  positive(radius, "Exhaust radius");
  if (![power, nozzle, speed, inherit, drag, buoyancy, seed].every(Number.isFinite) || power < 1 || drag < 0) throw new RangeError("Invalid exhaust parameters");
  const count = Math.ceil(path.length / spacing);
  if (count > 4096) throw new RangeError("Exhaust exceeds 4096 spatial cells; increase spacing");
  const random = new Rng(seed);
  const particles = Array.from({ length: count }, (_, i) => {
    const f = (i + 0.5) / count, born = duration * f ** (1 / power), s = path.atTime(born, duration, power);
    const side = random.range(-5, 5), e = speed * random.range(0.65, 1.2), forward = s.speed * inherit - e;
    return {
      born,
      x: s.x - s.dx * nozzle,
      y: s.y - s.dy * nozzle,
      vx: s.dx * forward - s.dy * side,
      vy: s.dy * forward + s.dx * side,
      life: life * random.range(0.95, 1.05),
      radius: radius * random.range(0.88, 1.12),
      phase: random.range(0, 6.28),
      brightness: random.range(0.72, 0.95)
    };
  });
  return {
    count,
    sample(time) {
      if (!Number.isFinite(time)) throw new RangeError("Exhaust time must be finite");
      const out = [];
      for (const q of particles) {
        const age = time - q.born, u = age / q.life;
        if (age < 0 || u >= 1) continue;
        const fade = smooth(0, 0.035, age) * (1 - smooth(0.2, 1, u));
        out.push({
          x: q.x + dragDisplacement(q.vx, 0, age, drag),
          y: q.y + dragDisplacement(q.vy, -buoyancy, age, drag) + Math.sin(age * 2 + q.phase) * Math.min(age, 1),
          r: 1.25 + (q.radius - 1.25) * (1 - Math.exp(-age * 3.8)),
          a: fade * 0.48,
          b: q.brightness - u * 0.35,
          w: Math.exp(-age * 8)
        });
      }
      return out;
    }
  };
}
function drawRocketJet(p, options) {
  const { x, y, angle = 0, length = 20, width = 1, wobble = 1, frame = 0, palette: F, profile = "oriented" } = options;
  if (![x, y, angle, length, width, wobble, frame].every(Number.isFinite) || length <= 0 || width <= 0 || wobble <= 0) throw new RangeError("Jet dimensions must be finite and positive");
  if (F.length < 9 || !F.every(Number.isFinite)) throw new RangeError("Jet palette needs nine finite colors");
  const legacy = profile === "legacy-horizontal";
  if (legacy && (angle !== 0 || width !== 1)) throw new RangeError("Legacy horizontal jets require angle 0 and width 1");
  const cs = Math.cos(angle), sn = Math.sin(angle), endX = x - cs * length, endY = y - sn * length, pad = 6 * width * wobble + 2;
  const diamonds = [0, 1, 2, 3].map((i) => (3.6 + i * 4.3 + (rand(frame, i, 41) - 0.5) * 0.7) * (legacy ? 1 : length / 22));
  p.shade(
    legacy ? x - length - 2 : Math.min(x, endX) - pad,
    legacy ? y - 6 : Math.min(y, endY) - pad,
    legacy ? x : Math.max(x, endX) + pad,
    legacy ? y + 6 : Math.max(y, endY) + pad,
    (px, py) => {
      const u = -(px - x) * cs - (py - y) * sn, side = -(px - x) * sn + (py - y) * cs, q = u / length;
      if (q < 0 || q > 1.05) return;
      const ady = Math.abs(side) / width, qq = Math.min(q, 1), w = (2.6 + 2.4 * qq ** 0.7) * (1 - qq * qq) * wobble;
      const noise = legacy ? Math.floor(px) * 7 + Math.floor(py) * 131 : Math.floor(u) * 7 + Math.floor(side / width) * 131;
      const edge = w - ady + (rand(noise, frame) - 0.5) * (legacy ? 0.9 : 0.6) * Math.min(1, 0.25 + q * 2);
      if (edge < -0.5) return;
      if (edge < 0.5) return F[q < 0.45 ? 3 : 2];
      for (let i = 0; i < diamonds.length; i++) {
        if (diamonds[i] > length * 0.72) break;
        const d = Math.abs(u - diamonds[i]) / ((1.9 - i * 0.15) * (legacy ? 1 : length / 22)) + ady / (1.7 - i * 0.25);
        if (d < 1) return F[d < 0.55 && i < 3 ? 8 : 7];
      }
      if (u < 1.6 && ady < 1.6) return F[8];
      const level = (1 - ady / Math.max(0.6, w)) * (1 - qq ** 1.5);
      return F[level > 0.62 ? u < 3 ? 7 : 5 : level > 0.38 ? 5 : level > 0.16 ? 4 : 3];
    }
  );
}
function flightEndpointAtContact(contact, previousControl, support) {
  if ([contact, previousControl, support].some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))
    throw new RangeError("Flight contact needs finite 2D points");
  const dx = contact[0] - previousControl[0], dy = contact[1] - previousControl[1], distance = Math.hypot(dx, dy), [forward, lateral] = support;
  if (!Number.isFinite(distance) || distance <= Math.abs(lateral) || distance * Math.sqrt(1 - (lateral / distance) ** 2) <= forward)
    throw new RangeError("Contact support must fit ahead of the previous flight control");
  const angle = Math.atan2(dy, dx) - Math.asin(lateral / distance), c = Math.cos(angle), s = Math.sin(angle);
  const point2 = [contact[0] - forward * c + lateral * s, contact[1] - forward * s - lateral * c];
  if (!point2.every(Number.isFinite)) throw new RangeError("Flight contact endpoint overflow");
  return point2;
}

// src/core/ground-impact.ts
function impactKick2D(age, strength = 1, seed = 1) {
  if (![age, strength, seed].every(Number.isFinite)) throw new RangeError("Impact kick requires finite values");
  if (age < 0 || age >= 0.55 || strength <= 0) return [0, 0];
  const k = clamp(strength, 0, 2) * Math.exp(-age * 6) * (1 - age / 0.55);
  const side = (seed | 0) & 1 ? -1 : 1;
  return [Math.round(side * 2.2 * Math.cos(age * 57) * k), Math.round(3.6 * Math.cos(age * 44) * k)];
}
function createGroundImpact(options = {}) {
  const { seed = 1, radius = 24, strength = 1, direction = 0, material = "stone", duration = 2.1 } = options;
  if (![seed, radius, strength, direction, duration].every(Number.isFinite) || radius < 8 || radius > 64 || strength < 0 || strength > 2 || Math.abs(direction) > 1 || duration < 1 || duration > 6 || material !== "stone" && material !== "soil") throw new RangeError("Invalid ground impact dimensions, material or timing");
  const rng2 = new Rng(seed), rock = material === "stone", unit = radius / 24;
  const chunks = [], dust = [], plates = [];
  const plume = (x, at, size, count, speed) => {
    for (let i = 0; i < count; i++) dust.push({
      x,
      at: at + rng2.range(0, 0.025),
      vx: (i % 2 ? 1 : -1) * rng2.range(speed * 0.55, speed) + direction * speed * 0.15,
      rise: rng2.range(1.2, 3.8) * unit,
      radius: size * rng2.range(0.8, 1.15),
      life: rng2.range(0.55, 0.86),
      phase: rng2.range(0, Math.PI * 2),
      front: i % 3 === 0
    });
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = (9 + i * 9) * unit;
      plates.push({
        left: side < 0 ? -x - 8.4 * unit : x,
        right: side < 0 ? -x : x + 8.4 * unit,
        depth: rng2.range(3.5, 5.5) * unit,
        shade: rng2.int(2, 3),
        edge: rng2.range(-0.6, 0.6)
      });
    }
    plume(side * 9 * unit, 0.015, (rock ? 6.5 : 8.5) * unit, 5, 100 * unit * strength);
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, size = (i < 6 ? rng2.range(2.5, 4) : rng2.range(1.1, 2)) * unit;
    const vertices = [[-0.9, -0.35], [-0.35, -0.85], [0.5, -0.7], [1, 0], [0.55, 0.7], [-0.5, 0.75]].map(([x2, y]) => [x2 * size, y * size]);
    const delay = rng2.range(0, 0.045), x = side * rng2.range(3, 14) * unit;
    const path = rubblePath(
      vertices,
      {
        x,
        y: -size,
        vx: (side * rng2.range(37, 74) + direction * 19) * unit * strength,
        vy: -rng2.range(i < 6 ? 62 : 80, i < 6 ? 104 : 135) * unit * strength,
        angle: rng2.range(-0.8, 0.8),
        spin: rng2.range(-5, 5)
      },
      { duration, gravity: 420 * unit, bounce: rock ? 0.24 : 0.1, friction: rock ? 0.67 : 0.85 }
    );
    chunks.push({ vertices, path, delay, shade: rng2.int(2, 4) });
    for (const hit of path.impacts) if (hit.speed > 44) plume(hit.x, delay + hit.time, size * 1.15, 2, 30 * unit);
  }
  function displacement(x, age) {
    if (![x, age].every(Number.isFinite)) throw new RangeError("Ground sample must be finite");
    if (age < 0 || age >= duration || strength === 0) return 0;
    const d = Math.abs(x) / unit, q = age - Math.max(0, d - 8) / 230;
    if (q <= 0) return 0;
    const wave = -Math.sin(Math.min(q / 0.045, 1) * Math.PI / 2) * Math.exp(-q * 6) * Math.cos(q * 14);
    const taper = 1 - smooth(30, 57, d), fall = 1 - smooth(duration * 0.64, duration, age);
    return (wave * 10 + smooth(0.1, 0.5, q) * 0.7) * strength * unit * taper * fall;
  }
  function draw(p, age, layer, style) {
    if (!Number.isFinite(age)) throw new RangeError("Ground impact age must be finite");
    if (style.palette.length < 6 || !style.palette.every(Number.isFinite)) throw new RangeError("Ground palette needs six finite colors");
    const { x = 0, y = 0, palette: C } = style;
    if (![x, y].every(Number.isFinite)) throw new RangeError("Ground anchor must be finite");
    if (age < 0 || age >= duration || strength === 0) return;
    const fade = 1 - smooth(duration * 0.64, duration, age), open = smooth(0, 0.045, age);
    if (layer === "back") {
      p.poly([[-23, 0], [-15, -3], [-5, -2], [4, -4], [14, -2], [23, 1], [15, 4], [-8, 4]].map(([a, b]) => [x + a * unit, y + b * unit]), C[0], fade * 0.8 * open);
      for (const plate of plates) {
        const a = plate.left, b = plate.right, dy0 = displacement(a, age), dy1 = displacement(b, age);
        const activated = smooth(0, 0.025, age - Math.max(0, Math.min(Math.abs(a), Math.abs(b)) / unit - 8) / 230);
        if (activated <= 0) continue;
        const opacity = fade * activated;
        p.poly([[x + a, y + 1], [x + b, y + 1], [x + b, y + dy1], [x + a, y + dy0]], C[0], opacity * 0.8);
        p.poly([[x + a, y + dy0], [x + b, y + dy1], [x + b - 0.8 * unit, y + dy1 + plate.depth], [x + a + 0.7 * unit, y + dy0 + plate.depth]], C[plate.shade - 1], opacity);
        p.poly([[x + a, y + dy0], [x + (a + b) * 0.5, y + (dy0 + dy1) * 0.5 - 1.4 * unit + plate.edge], [x + b, y + dy1], [x + b - 0.8 * unit, y + dy1 + 1.4 * unit], [x + a + 0.7 * unit, y + dy0 + 1.4 * unit]], C[plate.shade], opacity);
        p.line(x + a + 0.7 * unit, y + dy0, x + (a + b) * 0.5, y + (dy0 + dy1) * 0.5 - 1.4 * unit + plate.edge, C[4], opacity * 0.65);
      }
    } else {
      for (const q of chunks) {
        const local = age - q.delay;
        if (local < 0) continue;
        const s = q.path.sample(local), cs = Math.cos(s.angle), sn = Math.sin(s.angle);
        const shrink = 1 - smooth(duration * 0.7, duration, age), centerY = s.resting ? s.y * shrink : s.y;
        const vertices = q.vertices.map(([a, b]) => [x + s.x + (a * cs - b * sn) * shrink, y + centerY + (a * sn + b * cs) * shrink]);
        p.poly(vertices, C[q.shade], fade);
        for (let i = 0; i < vertices.length; i++) {
          const a = vertices[i], b = vertices[(i + 1) % vertices.length], dx = b[0] - a[0], dy = b[1] - a[1];
          if (Math.hypot(dx, dy) < 2.2) continue;
          p.line(a[0], a[1], b[0], b[1], C[dy - dx > 0.4 ? 4 : 1], fade * 0.8);
        }
      }
    }
    for (const d of dust) {
      if (d.front !== (layer === "front")) continue;
      const a = age - d.at, u = a / d.life;
      if (u <= 0 || u >= 1) continue;
      const r = d.radius * (0.5 + 0.7 * Math.sqrt(u)), cx = x + d.x + d.vx * -Math.expm1(-a * 4) / 4;
      const cy = y - 1 - Math.sin(u * Math.PI) * d.rise;
      const alpha = smooth(0, 0.07, a) * (1 - smooth(0.2, 1, u)) * fade * (rock ? 0.33 : 0.42);
      p.shade(cx - r * 1.7, cy - r * 0.65, cx + r * 1.7, y, (px, py, out) => {
        const dx = (px - cx) / (r * 1.7), dy = (py - cy) / (r * 0.65), q = dx * dx + dy * dy;
        if (q > 1 + 0.06 * Math.sin(dx * 5 + d.phase) || py > y) return;
        out.c = C[dy < -0.25 ? 4 : 3];
        out.a = alpha * (q > 0.68 ? 0.35 : 1);
      });
    }
  }
  return { duration, chunks, displacement, draw };
}

// src/core/shapes.ts
function bolt(r, x0, y0, x1, y1, { jag = 0.22, depth = 5 } = {}) {
  let pts = [[x0, y0], [x1, y1]];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      const off = (r.next() * 2 - 1) * jag * L;
      next.push([(ax + bx) / 2 + -dy / (L || 1) * off, (ay + by) / 2 + dx / (L || 1) * off], pts[i]);
    }
    pts = next;
  }
  return pts;
}
function forks(r, path, { count = 3, len = 20, jag = 0.3, spread = 0.9 } = {}) {
  const out = [];
  if (path.length < 2) return out;
  for (let k = 0; k < count; k++) {
    const i = 1 + Math.floor(r.next() * (path.length - 2)), [x, y] = path[i], [px, py] = path[i - 1];
    const a = Math.atan2(y - py, x - px) + (r.next() < 0.5 ? -1 : 1) * spread * (0.4 + 0.6 * r.next());
    const l = len * (0.4 + 0.6 * r.next());
    out.push(bolt(r, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, { jag, depth: 3 }));
  }
  return out;
}
function star(cx, cy, r0, r1, n = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n, r = i % 2 ? r0 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// src/core/sim.ts
var GRAVITY = 950;
var CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
var HOT = ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"].map(hex);
var FIRE_RAMP = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4a1712"].map(hex);
var SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
var rampAt = (r, t) => r[Math.min(r.length - 1, Math.max(0, Math.floor(t * r.length)))];
var P = { SPARK: 0, MOTE: 1, STREAK: 2, FLAKE: 3, VAPOUR: 4, DUST: 5, STAR: 6, EMBER: 7, SMOKE: 8, FIRE: 9, BRAND: 10, GRIT: 11 };
var PF = { SMOKES: 1, BIG: 2, BACK: 4 };
var SOFT = /* @__PURE__ */ new Set([P.VAPOUR, P.DUST, P.SMOKE]);
function slopeContact(ground, p, x0, y0, vx0, vy0, g0, dt, gravity, drag, dragY = drag) {
  const g1 = ground(p.x);
  if (g1 === g0) return void 0;
  if (!Number.isFinite(g0) || !Number.isFinite(g1) || p.y < g1) return null;
  const at = (time) => {
    const q2 = { x: x0, y: y0, vx: vx0, vy: vy0 };
    integrateMotion2D(q2, time, 0, gravity, drag, dragY);
    return q2;
  };
  let lo = 0, hi = dt;
  if (y0 <= g0) for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2, q2 = at(mid), height = ground(q2.x);
    if (!Number.isFinite(height)) return null;
    if (q2.y >= height) hi = mid;
    else lo = mid;
  }
  const q = at(hi), y = ground(q.x);
  if (!Number.isFinite(y)) return null;
  const delta = 1e-3, left = ground(q.x - delta), right = ground(q.x + delta);
  const slope = Number.isFinite(left) && Number.isFinite(right) ? (right - left) / (2 * delta) : (g1 - g0) / (p.x - x0);
  const length = Math.hypot(slope, 1);
  if (!Number.isFinite(length)) return null;
  return { ...q, y, nx: slope / length, ny: -1 / length };
}
function reflectGround(p, hit, bounce, friction, jitter = 0) {
  const normal = Math.max(0, -(hit.vx * hit.nx + hit.vy * hit.ny)) * bounce;
  const tangent = (-hit.vx * hit.ny + hit.vy * hit.nx) * friction + jitter;
  p.x = hit.x;
  p.y = hit.y - 0.25;
  p.vx = normal * hit.nx - tangent * hit.ny;
  p.vy = normal * hit.ny + tangent * hit.nx;
  p.trailAge = 0;
}
var Particles = class {
  R;
  list;
  t;
  ground;
  sparks;
  haze;
  onLand;
  renderStyle;
  constructor(opts = {}) {
    this.R = opts.rng ?? new Rng(opts.seed ?? 1);
    this.renderStyle = opts.renderStyle ?? "refined";
    this.list = [];
    this.t = 0;
    this.ground = opts.ground ?? (() => Infinity);
    this.sparks = (opts.sparks ?? HOT).map(hex);
    this.haze = opts.haze === void 0 ? null : hex(opts.haze);
    this.onLand = opts.onLand ?? null;
  }
  /** delay: seconds before it appears; flag: PF bits. col 0 lets FIRE and SMOKE use their own ramps. */
  spawn(k, x, y, vx, vy, life, col = WHITE, size = 1, delay = 0, flag = 0) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col: col ? hex(col) : 0, size, seed: this.R.next() * 100, delay, flag, trailAge: 0 });
  }
  get count() {
    return this.list.length;
  }
  update(elapsed) {
    if (elapsed === 0) return;
    this.t += elapsed;
    const R = this.R, t = this.t;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      let dt = elapsed;
      if (p.delay > 0) {
        if (p.delay >= dt) {
          p.delay -= dt;
          continue;
        }
        dt -= p.delay;
        p.delay = 0;
      }
      if ((p.life -= dt) <= 0) {
        if (p.k === P.FIRE && p.flag & PF.SMOKES) {
          const big = p.flag & PF.BIG;
          this.spawn(P.SMOKE, p.x, p.y, p.vx * 0.6, p.vy * 0.6 - 6, big ? R.range(1.3, 2.3) : R.range(0.8, 1.4), 0, p.size * (big ? 0.85 : 0.7), 0, big ? PF.BIG : 0);
        }
        continue;
      }
      p.trailAge = (p.trailAge ?? Math.max(0, p.max - p.life - dt)) + dt;
      switch (p.k) {
        case P.FIRE:
          integrateMotion2D(p, dt, Math.sin(t * 17 + p.seed) * 30, -95, 5, 3.2);
          break;
        case P.GRIT: {
          const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, g = this.ground(x0);
          integrateMotion2D(p, dt, 0, GRAVITY, 0.8, 0);
          const hit = slopeContact(this.ground, p, x0, y0, vx0, vy0, g, dt, GRAVITY, 0.8, 0);
          if (hit) {
            const speed = -(hit.vx * hit.nx + hit.vy * hit.ny);
            if (speed > 130 && R.chance(0.4)) reflectGround(p, hit, 0.25, 0.5, R.range(-10, 10));
            else {
              p.x = hit.x;
              p.y = hit.y - 0.25;
              p.vx = p.vy = 0;
              p.life = Math.min(p.life, 0.5);
            }
          } else if (hit === void 0 && p.vy > 0 && y0 <= g && p.y >= g) {
            p.y = g - 0.25;
            if (p.vy > 130 && R.chance(0.4)) p.vy = -p.vy * 0.25, p.vx = p.vx * 0.5 + R.range(-10, 10);
            else p.vx = p.vy = 0, p.life = Math.min(p.life, 0.5);
          }
          break;
        }
        case P.BRAND: {
          const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, g = this.ground(x0);
          integrateMotion2D(p, dt, 0, GRAVITY * 0.8, 0.9, 0);
          if (R.chance(0.9 * Math.min(1, dt * 60))) this.spawn(P.FIRE, x0, y0, p.vx * 0.1 + R.range(-7, 7), p.vy * 0.1 - 10, R.range(0.16, 0.32), 0, R.range(0.9, 1.7) * (0.5 + p.life / p.max * 0.6), 0, R.chance(0.4) ? PF.SMOKES : 0);
          const hit = slopeContact(this.ground, p, x0, y0, vx0, vy0, g, dt, GRAVITY * 0.8, 0.9, 0);
          if (hit) {
            p.x = hit.x;
            p.y = hit.y;
            this.onLand?.(hit.x, hit.y);
            p.life = 0;
          } else if (hit === void 0 && p.vy > 0 && y0 <= g && p.y >= g) {
            this.onLand?.(p.x, g);
            p.life = 0;
          }
          break;
        }
        case P.SPARK: {
          const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, g = this.ground(x0);
          integrateMotion2D(p, dt, 0, GRAVITY * 0.45, 2.2);
          const hit = slopeContact(this.ground, p, x0, y0, vx0, vy0, g, dt, GRAVITY * 0.45, 2.2);
          if (hit) reflectGround(p, hit, 0.45, 0.7);
          else if (hit === void 0 && p.vy > 0 && y0 <= g && p.y >= g) {
            p.vy = -p.vy * 0.45;
            p.vx *= 0.7;
            p.y = g - 0.25;
            p.trailAge = 0;
          }
          break;
        }
        case P.STREAK:
          integrateMotion2D(p, dt, 0, 0, -3);
          break;
        case P.FLAKE:
          integrateMotion2D(p, dt, 0, 35, 2.2);
          p.x += Math.sin(t * 2.5 + p.seed) * 7 * dt;
          break;
        case P.EMBER:
          integrateMotion2D(p, dt, Math.cos(t * 2.3 + p.seed) * 45, -30 + Math.sin(t * 3 + p.seed) * 20, 1.6);
          break;
        case P.SMOKE: {
          const big = p.flag & PF.BIG;
          integrateMotion2D(p, dt, Math.sin(t * 1.3 + p.seed) * 8, big ? -23 : -16, 1.6, 1.2);
          break;
        }
        case P.MOTE:
          integrateMotion2D(p, dt, 0, 0, 0.6);
          break;
        default:
          integrateMotion2D(p, dt, 0, -5, SOFT.has(p.k) ? 4 : 1.6);
      }
    }
    let write = 0;
    for (const p of this.list) if (p.life > 0) this.list[write++] = p;
    this.list.length = write;
  }
  draw(p, layer) {
    for (const q of this.list) {
      if (q.delay > 0) continue;
      if (layer && (SOFT.has(q.k) || q.flag & PF.BACK ? "back" : "front") !== layer) continue;
      const k = q.life / q.max, x = q.x, y = q.y, sp = Math.hypot(q.vx, q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
      if (this.renderStyle === "refined" && p.particleStyle !== "classic" && p.path && q.trailAge !== void 0 && (q.k === P.SPARK || q.k === P.MOTE || q.k === P.STREAK)) {
        const spark = q.k === P.SPARK, mote = q.k === P.MOTE;
        const drag = spark ? 2.2 : mote ? 0.6 : -3, gravity = spark ? GRAVITY * 0.45 : 0;
        const trailAge = q.trailAge;
        const length = spark ? Math.min(9, 1 + sp * 0.022) : mote ? Math.min(16, 0.5 + sp * 0.026) * q.size : clamp(sp / 30, 1, 7);
        const seconds = Math.min(trailAge, length / sp);
        const points = motionTrail((time) => {
          const previous = { x, y, vx: q.vx, vy: q.vy };
          integrateMotion2D(previous, time - trailAge, 0, gravity, drag);
          return [previous.x, previous.y];
        }, trailAge, seconds, 5);
        const S = this.sparks, head = spark ? k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2] : mote ? q.col : WHITE;
        drawTrail(p, points, {
          color: spark ? k > 0.5 ? head : S[S.length - 1] : mote ? scale(q.col, 0.65) : q.col,
          head,
          alpha: Math.min(1, k / 0.22),
          width: 1,
          light: (spark ? 0.28 : 0.22) * k,
          lightRadius: mote ? 2.5 + q.size : spark ? 3 : 4
        });
        continue;
      }
      switch (q.k) {
        case P.SPARK: {
          const S = this.sparks, head = k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2], len = Math.min(9, 1 + sp * 0.022);
          p.line(x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? head : S[S.length - 1]);
          p.line(x - ux * len * 0.45, y - uy * len * 0.45, x, y, head);
          p.glow(x, y, 3, head, 0.45 * k);
          break;
        }
        case P.MOTE: {
          const len = Math.min(16, 0.5 + sp * 0.026) * q.size, a = k < 0.35 ? k / 0.35 : 1;
          p.line(x - ux * len, y - uy * len, x - ux * len * 0.35, y - uy * len * 0.35, scale(q.col, 0.55), a);
          p.line(x - ux * len * 0.4, y - uy * len * 0.4, x, y, q.col, a);
          p.glow(x, y, 2.5 + q.size, q.col, 0.4 * k);
          break;
        }
        case P.STREAK: {
          const L = clamp(sp / 30, 1, 7);
          for (let d = L; d >= 0; d -= 0.5) p.dot(x - ux * d, y - uy * d, d < 1 ? WHITE : d < L * 0.5 ? q.col : scale(q.col, 0.6), d < L * 0.5 ? 1 : 1.2 - d / L);
          p.glow(x, y, 4, q.col, 0.4);
          break;
        }
        case P.FLAKE: {
          const a = Math.min(1, k * 3);
          p.dot(x, y, q.col, a);
          if (q.size > 1.3) for (const [dx, dy] of CROSS) p.dot(x + dx, y + dy, scale(q.col, 0.8), a * 0.8);
          break;
        }
        case P.VAPOUR: {
          const r = q.size * (0.6 + (1 - k) * 0.9);
          p.disc(x, y, r, q.col, Math.pow(k, 1.3) * 0.45);
          if (this.haze) p.glow(x, y, r * 1.8, this.haze, 0.16 * k);
          break;
        }
        case P.DUST:
          p.disc(x, y, q.size * (0.6 + (1 - k) * 0.9), q.col, Math.pow(k, 1.3) * 0.7);
          break;
        case P.SMOKE: {
          const age = 1 - k, big = q.flag & PF.BIG;
          const r = q.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * (big ? 0.5 : 0.4));
          const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * (big ? 0.7 : 0.58);
          const c = q.col ? mix(q.col, rampAt(SMOKE_RAMP, age), age) : rampAt(SMOKE_RAMP, age * 1.05);
          p.disc(x, y, r, c, a * 0.45);
          p.disc(x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
          if (age < 0.5) p.disc(x - r * 0.22, y - r * 0.3, r * 0.5, mix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
          break;
        }
        case P.FIRE: {
          const age = 1 - k, heat = Math.min(0.999, Math.pow(age, 0.62) + q.seed % 1 * 0.1), F = FIRE_RAMP, n = F.length;
          const idx = Math.min(n - 2, Math.floor(heat * (n - 1)));
          const r = q.size * (0.55 + 0.45 * Math.min(1, age * 7)) * (1 - age * 0.55), c = F[idx];
          if (idx >= n - 2) p.disc(x, y, r, c, Math.min(1, k * 3) * 0.85);
          else {
            p.circle(x, y, r, F[Math.min(n - 1, idx + 2)]);
            p.circle(x - r * 0.16, y - r * 0.22, r * 0.78, c);
            if (r > 1.6) p.circle(x, y - r * 0.9, r * 0.42, c);
            if (idx <= 3 && r > 1.8) p.circle(x - r * 0.28, y - r * 0.34, r * 0.36, F[Math.max(0, idx - 1)]);
            if (idx < 6) p.glow(x, y, r * 2.4 + 2, c, 0.18 * k);
          }
          break;
        }
        case P.BRAND:
          p.circle(x, y, 1.6, HOT[3]);
          p.px(x, y, Math.sin(this.t * 40 + q.seed) > 0 ? HOT[0] : HOT[1]);
          p.px(x + 1, y, HOT[1]);
          p.glow(x, y, 7, HOT[2], 0.45);
          break;
        case P.GRIT:
          if (k > 0.25 || k * 4 > 0.5) {
            p.px(x, y, q.col);
            if (q.size >= 2) p.px(x + 1, y, q.col), p.px(x, y + 1, scale(q.col, 0.8)), p.px(x + 1, y + 1, scale(q.col, 0.7));
          }
          break;
        case P.EMBER: {
          const c = k > 0.6 ? this.sparks[0] : k > 0.3 ? this.sparks[1] : this.sparks[2];
          if (k < 0.25 && Math.sin(this.t * 40 + q.seed) < 0) break;
          p.px(x, y, c);
          if (q.size > 1.5) p.px(x, y + 1, this.sparks[this.sparks.length - 1]);
          p.glow(x, y, 3 + q.size, c, 0.35 * k);
          break;
        }
        default: {
          const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + q.seed % 5) + q.seed);
          if (q.size < 1) {
            if (tw * k > 0.25) p.px(x, y, tw > 0.8 ? WHITE : q.col);
            p.glow(x, y, 3, q.col, 0.4 * k * tw);
            break;
          }
          sparkle(p, x, y, q.size * tw * Math.min(1, k * 3), q.col, scale(q.col, 0.75), 0.5 * k * tw);
        }
      }
    }
  }
};
var Blazes = class {
  ps;
  list;
  constructor(ps) {
    this.ps = ps;
    this.list = [];
  }
  add(x, y, life, power) {
    this.list.push({ x, y, life, max: life, acc: this.ps.R.next(), power });
  }
  get count() {
    return this.list.length;
  }
  update(dt) {
    const ps = this.ps, R = ps.R;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if ((b.life -= dt) <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      const k = b.life / b.max, intensity = b.power * (k > 0.7 ? 1 : 0.35 + k / 0.7 * 0.65);
      for (b.acc += dt * (6 + 16 * intensity); b.acc > 1; b.acc--) {
        const s = R.range(1.2, 2.8) * intensity;
        ps.spawn(P.FIRE, b.x + R.range(-1.5, 1.5), b.y - s * 0.6, R.range(-6, 6), R.range(-30, -12), R.range(0.28, 0.6), 0, s, 0, PF.BACK | (R.chance(0.3) ? PF.SMOKES : 0));
        if (R.chance(0.06)) ps.spawn(P.EMBER, b.x, b.y - 1.5, R.range(-15, 15), R.range(-45, -15), R.range(0.6, 1.4), HOT[2], 1, 0, PF.BACK);
      }
    }
  }
  drawBack(p) {
    for (const b of this.list) {
      const k = b.life / b.max;
      p.px(b.x, b.y, k > 0.4 ? Math.sin(b.life * 31 + b.x) > 0 ? HOT[1] : HOT[2] : HOT[3]);
      p.glow(b.x, b.y, 6 + 5 * k * b.power, HOT[2], 0.3 * k * b.power);
    }
  }
};
var B = { SHARD: 0, CHUNK: 1, DRIP: 2 };
var Bits = class {
  list;
  ground;
  constructor(opts = {}) {
    this.list = [];
    this.ground = opts.ground ?? (() => Infinity);
  }
  add(b) {
    const life = b.life ?? 1;
    this.list.push({ kind: B.SHARD, vx: 0, vy: 0, a: 0, va: 0, s: 1, c: WHITE, g: 1, drag: 0, bounce: 0, rest: false, ...b, life, max: life });
  }
  get count() {
    return this.list.length;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if ((b.life -= dt) <= 0 || b.rest) continue;
      integrateMotion2D(b, dt, 0, GRAVITY * b.g, b.drag);
      b.a += b.va * dt;
      const floor = this.ground(b.x), sp = b.vy;
      if (b.g <= 0 || b.y < floor || sp <= 0) continue;
      b.y = floor - 0.01;
      if (b.kind === B.DRIP) b.life = 0;
      else if (b.bounce > 0 && sp > 70) b.vy = -sp * b.bounce, b.vx *= 0.7, b.va *= 0.6;
      else b.rest = true, b.vx = b.vy = 0;
    }
    let write = 0;
    for (const b of this.list) if (b.life > 0) this.list[write++] = b;
    this.list.length = write;
  }
  draw(p) {
    for (const b of this.list) {
      const a = Math.min(1, b.life / 0.4), ca = Math.cos(b.a), sa = Math.sin(b.a);
      if (b.kind === B.SHARD) {
        for (let d = -b.s / 2; d <= b.s / 2; d += 0.5) p.dot(b.x + ca * d, b.y + sa * d, d > b.s / 2 - 0.6 ? WHITE : hex(b.c), a);
      } else if (b.kind === B.DRIP) {
        p.dot(b.x, b.y, hex(b.c), a);
        p.dot(b.x, b.y - 1, hex(b.c), a * 0.5);
      } else {
        const R = (b.ramp ?? ["#1c2030", "#3a4a66", "#6e86a8", "#a8c0dc", "#e8f2ff"]).map(hex), n = R.length;
        const x = Math.round(b.x), y = Math.round(b.y), r = Math.ceil(b.s) + 1;
        for (let py = -r; py <= r; py++)
          for (let px = -r; px <= r; px++) {
            const u = (px + 0.5) * ca + (py + 0.5) * sa, v = -(px + 0.5) * sa + (py + 0.5) * ca;
            const d = Math.abs(u) / b.s + Math.abs(v) / (b.s * 0.62);
            if (d > 1.3) continue;
            p.dot(x + px, y + py, d > 1 ? R[0] : v < 0 ? u < 0 ? R[n - 1] : R[n - 2] : u < 0 ? R[n - 3] : R[Math.max(1, n - 4)], a);
          }
      }
    }
  }
};
var Lights = class {
  list;
  constructor() {
    this.list = [];
  }
  add(x, y, r, color, k, life) {
    this.list.push({ x, y, r, color: hex(color), k, life, max: life });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) if ((this.list[i].life -= dt) <= 0) this.list.splice(i, 1);
  }
  draw(p) {
    for (const l of this.list) {
      const k = l.life / l.max;
      p.glow(l.x, l.y, l.r * (0.55 + 0.45 * k), l.color, l.k * k * k);
    }
  }
};
function sparkle(p, x, y, arm, c, tip = c, k = 0.6) {
  const n = Math.round(arm);
  if (n < 1) return;
  const X = Math.floor(x), Y = Math.floor(y);
  for (let d = 1; d <= n; d++) {
    const cc = d > n * 0.6 ? tip : c;
    for (const [dx, dy] of CROSS) p.px(X + dx * d, Y + dy * d, cc);
  }
  if (n >= 3) for (const [dx, dy] of DIAG) p.px(X + dx, Y + dy, c);
  if (n >= 6) for (const [dx, dy] of DIAG) p.px(X + dx * 2, Y + dy * 2, tip);
  p.px(X, Y, WHITE);
  p.glow(x, y, 4 + n * 2, c, k);
}
function flare(p, x, y, L, k, ramp) {
  if (L < 1) return;
  const R = ramp.map(hex), n = R.length;
  for (let i = 0; i < 8; i++) {
    const an = i * Math.PI / 4, len = i % 4 === 0 ? L : i % 2 === 0 ? L * 0.6 : L * 0.3, ca = Math.cos(an), sa = Math.sin(an);
    for (let d = 0; d <= len; d += 0.5) {
      const u = d / len;
      p.dot(x + ca * d, y + sa * d, u < 0.35 ? WHITE : u < 0.7 ? R[n - 2] : R[n - 3], u < 0.6 ? 1 : k * 1.5 * (1 - u) + 0.2);
    }
  }
}
function band(p, cx, cy, r, sy, th, k, ramp, keep = () => true, hot = false) {
  if (r <= 0 || k <= 0 || th <= 0) return;
  const R = ramp.map(hex), n = R.length, inner = Math.max(0, r - th), middle = (r + inner) * 0.5;
  const squash = sy === 0 ? 0.5 / r : sy, height = r * Math.abs(squash);
  p.shade(cx - r - 1, cy - height - 1, cx + r + 1, cy + height + 1, (x, y, out) => {
    const dx = x - cx, dy = (y - cy) / squash, radius = Math.hypot(dx, dy);
    const gradient = radius > 0 ? Math.hypot(dx, dy / squash) / radius : 1;
    const halfWidth = Math.max((r - inner) * 0.5, Math.SQRT1_2 * gradient);
    if (Math.abs(radius - middle) > halfWidth) return;
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += TAU;
    if (!keep(angle)) return;
    const u = clamp((r - radius) / th);
    out.c = u < 0.15 ? hot ? WHITE : R[n - 1] : u < 0.4 ? R[n - 2] : u < 0.7 ? R[n - 3] : R[n - 4];
    out.a = k * (u < 0.4 ? 1.2 : 1.15 - u);
  });
}
function crystal(p, x, base, h, w, lean, ramp, opts = {}) {
  if (h < 1.5) return;
  const R = ramp.map(hex), n = R.length, C = (i) => R[Math.max(0, n - 1 - i)];
  const a = opts.a ?? 1, top = base - h, ridge0 = x - w * 0.14, glint = opts.glint ?? -1;
  const inside = (px, py) => {
    const u = (base - (py + 0.5)) / h;
    return u >= 0 && u <= 1 && Math.abs(px + 0.5 - (x + lean * u)) <= w / 2 * (1 - u) + 0.35;
  };
  for (let py = Math.floor(top) - 1; py < Math.ceil(base); py++)
    for (let px = Math.floor(x - w / 2 - Math.abs(lean) - 2); px <= Math.ceil(x + w / 2 + Math.abs(lean) + 2); px++) {
      if (!inside(px, py)) {
        if (inside(px - 1, py) || inside(px + 1, py) || inside(px, py + 1) || inside(px, py - 1) && py < base - 1) p.dot(px, py, R[0], a);
        continue;
      }
      if (opts.white) {
        p.dot(px, py, WHITE, a);
        continue;
      }
      const u = (base - (py + 0.5)) / h, rx = ridge0 + (x + lean - ridge0) * u, c = x + lean * u, hw = w / 2 * (1 - u) + 0.35, fx = px + 0.5;
      let col = u > 0.9 ? WHITE : Math.abs(fx - rx) < 0.55 ? C(1) : fx < rx ? fx - (c - hw) < 1 ? C(1) : (fx - (c - hw)) / Math.max(1, rx - (c - hw)) > 0.55 ? C(2) : C(3) : c + hw - fx < 1.2 ? C(Math.min(n - 2, 6)) : (fx - rx) / Math.max(1, c + hw - rx) > 0.5 ? C(5) : C(4);
      if (glint >= 0 && fx <= rx + 0.6) {
        const g = Math.abs(u - glint);
        if (g < 0.05) col = WHITE;
        else if (g < 0.1) col = C(1);
      }
      p.dot(px, py, col, a);
    }
}

// src/core/poses.ts
var READY = { crouch: 3, fx: 11, fy: -21, bx: 9, by: -21, ffx: 7, fbx: -7 };

// src/core/restoration.ts
function defineRestorationTiming2D(input) {
  const { startsAt, pulseAt, liftedAt, endsAt } = input;
  if (![startsAt, pulseAt, liftedAt, endsAt].every(Number.isFinite) || startsAt < 0 || !(startsAt < pulseAt && pulseAt < liftedAt && liftedAt < endsAt))
    throw new RangeError("Restoration timing must be finite and ordered: start < pulse < lift < end");
  return Object.freeze({ startsAt, pulseAt, liftedAt, endsAt });
}
function restorationField2D(target, input) {
  const { x, y, mask } = target;
  if (![x, y, mask.w, mask.h].every(Number.isFinite) || !Number.isInteger(mask.w) || !Number.isInteger(mask.h) || mask.w < 1 || mask.h < 1 || mask.w > 2048 || mask.h > 2048 || mask.data.length !== mask.w * mask.h || target.pixels && target.pixels.length !== mask.data.length) throw new RangeError("Restoration target needs finite placement and a complete 1..2048 pixel mask");
  const timing = defineRestorationTiming2D(input), { startsAt, pulseAt, liftedAt, endsAt } = timing;
  const cells = [], rows = /* @__PURE__ */ new Map();
  const inside = (i, j) => i >= 0 && j >= 0 && i < mask.w && j < mask.h && mask.data[j * mask.w + i] > 0;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let j = 0; j < mask.h; j++) for (let i = 0; i < mask.w; i++) if (inside(i, j)) {
    const px = x + i, py = y + j, edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
    cells.push(Object.freeze({ x: px, y: py, edge, color: target.pixels?.[j * mask.w + i] ?? 0 }));
    left = Math.min(left, px);
    right = Math.max(right, px);
    top = Math.min(top, py);
    bottom = Math.max(bottom, py);
    const row = rows.get(py);
    if (row) row[1] = px;
    else rows.set(py, [px, px]);
  }
  if (!cells.length) throw new RangeError("Restoration target must contain at least one occupied pixel");
  const centerX = (left + right) / 2;
  const chest = Object.freeze([
    Number.isFinite(target.chest?.[0]) ? clamp(target.chest[0], left, right) : centerX,
    Number.isFinite(target.chest?.[1]) ? clamp(target.chest[1], top, bottom) : lerp(bottom, top, 0.65)
  ]);
  for (const row of rows.values()) Object.freeze(row);
  const spanAt = (height) => {
    if (!Number.isFinite(height)) throw new RangeError("Restoration row must be finite");
    let best = rows.values().next().value, distance = Infinity;
    for (const [rowY, span] of rows) {
      const d = Math.abs(rowY - height);
      if (d < distance) {
        distance = d;
        best = span;
      }
    }
    return best;
  };
  const sample = (time) => {
    if (!Number.isFinite(time)) throw new RangeError("Restoration time must be finite");
    const sweepY = time <= pulseAt ? lerp(bottom + 1, chest[1], smooth(startsAt, pulseAt, time)) : lerp(chest[1], top - 5, smooth(pulseAt, liftedAt, time));
    return Object.freeze({
      active: time > startsAt && time < endsAt,
      sweepY,
      progress: clamp((bottom + 1 - sweepY) / (bottom + 6 - top)),
      // Gradual attack followed by a longer soft release. No impact-shaped white frame.
      pulse: smooth(Math.max(startsAt, pulseAt - 0.13), pulseAt, time) * (1 - smooth(pulseAt, Math.min(liftedAt, pulseAt + 0.27), time)),
      coverage: smooth(startsAt, Math.min(pulseAt, startsAt + 0.14), time) * (1 - smooth(liftedAt, endsAt, time))
    });
  };
  return Object.freeze({
    cells: Object.freeze(cells),
    timing,
    top,
    bottom,
    centerX,
    chest,
    spanAt,
    sample,
    responseAt(height, time) {
      if (!Number.isFinite(height)) throw new RangeError("Restoration response row must be finite");
      const state = sample(time), distance = height - state.sweepY;
      return state.coverage * (Math.exp(-distance * distance / 18) * 0.72 + 0.12 * state.pulse * Math.exp(-((height - chest[1]) ** 2) / 32));
    }
  });
}

// src/core/point-light-2d.ts
function vector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
    throw new RangeError(`${label} must be a finite [x, y, z] vector`);
}
function validate(light) {
  vector(light.position, "Point light position");
  if (!Number.isFinite(light.radius) || light.radius <= 0) throw new RangeError("Point light radius must be finite and positive");
  if (!Number.isFinite(light.intensity ?? 1) || (light.intensity ?? 1) < 0) throw new RangeError("Point light intensity must be finite and non-negative");
}
function samplePointLight2D(light, position, normal) {
  validate(light);
  vector(position, "Surface position");
  vector(normal, "Surface normal");
  const length = Math.hypot(...normal);
  if (!Number.isFinite(length) || length < 1e-12) throw new RangeError("Surface normal must be finite and nonzero");
  const dx = light.position[0] - position[0], dy = light.position[1] - position[1], dz = light.position[2] - position[2];
  const distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance)) throw new RangeError("Point light separation overflow");
  const direction = distance > 0 ? [dx / distance, dy / distance, dz / distance] : [0, 0, 0];
  const attenuation = distance < light.radius ? (1 - (distance / light.radius) ** 2) ** 2 : 0;
  const lambert = Math.max(0, Math.min(1, normal[0] / length * direction[0] + normal[1] / length * direction[1] + normal[2] / length * direction[2]));
  const diffuse = lambert * attenuation * (light.intensity ?? 1);
  if (!Number.isFinite(diffuse)) throw new RangeError("Point light response overflow");
  return { direction, distance, attenuation, diffuse };
}
function localPointLight2D(placement, light) {
  validate(light);
  const position = [placement.fromX(light.position[0], light.position[1]), placement.fromY(light.position[0], light.position[1]), light.position[2]];
  vector(position, "Local light position");
  return { ...light, position };
}
function createPointLightSampler2D(light, normal) {
  validate(light);
  vector(normal, "Surface normal");
  const length = Math.hypot(...normal);
  if (!Number.isFinite(length) || length < 1e-12) throw new RangeError("Surface normal must be finite and nonzero");
  const nx = normal[0] / length, ny = normal[1] / length, nz = normal[2] / length;
  const [lx, ly, lz] = light.position, radius = light.radius, intensity = light.intensity ?? 1;
  return (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new RangeError("Surface position must be finite");
    const dx = lx - x, dy = ly - y, dz = lz - z, distance = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(distance)) throw new RangeError("Point light separation overflow");
    if (distance === 0 || distance >= radius || intensity === 0) return 0;
    const lambert = Math.max(0, Math.min(1, (nx * dx + ny * dy + nz * dz) / distance));
    const diffuse = lambert * (1 - (distance / radius) ** 2) ** 2 * intensity;
    if (!Number.isFinite(diffuse)) throw new RangeError("Point light response overflow");
    return diffuse;
  };
}

// src/core/detail-particles.ts
function checkedRange(value, name, positive2 = false) {
  const pair = typeof value === "number" ? [value, value] : value;
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || pair[0] < 0 || positive2 && pair[0] === 0 || pair[1] < pair[0])
    throw new RangeError(`${name} must be finite, ${positive2 ? "positive" : "non-negative"}, and ordered`);
  return [pair[0], pair[1]];
}
function checkedPoint(value, name = "origin") {
  if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]))
    throw new RangeError(`Detail emitter ${name} must be a finite [x, y]`);
  return [value[0], value[1]];
}
function createDetailParticles2D(options) {
  const {
    count,
    palette,
    seed = 1,
    origin = [0, 0],
    inheritedVelocity = [0, 0],
    start = 0,
    duration = 0,
    angle = -Math.PI / 2,
    spread = TAU,
    gravity = 0,
    drag = 0,
    endSize = 0.35,
    opacity = 1,
    attack = 0.025,
    fadeStart = 0.35,
    style = "spark",
    trailSeconds = 0.045,
    trailSamples = 7,
    emission = 0,
    lightRadius = 2.5,
    layer = "front"
  } = options;
  if (!Number.isInteger(count) || count < 0 || count > 4096)
    throw new RangeError("Detail particle count must be an integer from 0 to 4096");
  if (![
    seed,
    start,
    duration,
    angle,
    spread,
    gravity,
    drag,
    endSize,
    opacity,
    attack,
    fadeStart,
    trailSeconds,
    emission,
    lightRadius
  ].every(Number.isFinite) || duration < 0 || spread < 0 || spread > TAU || drag < 0 || endSize < 0 || opacity < 0 || opacity > 1 || attack < 0 || attack >= 1 || fadeStart < attack || fadeStart >= 1 || trailSeconds < 0 || emission < 0 || lightRadius <= 0)
    throw new RangeError("Invalid detail particle timing, motion, size or opacity");
  if (!Number.isInteger(trailSamples) || trailSamples < 2 || trailSamples > 64)
    throw new RangeError("Detail trail samples must be an integer from 2 to 64");
  if (style !== "point" && style !== "spark" || layer !== "back" && layer !== "front")
    throw new RangeError("Invalid detail particle style or layer");
  if (!Array.isArray(palette) || palette.length === 0 || palette.some((c) => typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
    throw new RangeError("Detail palette needs packed 32-bit colors or #rgb/#rrggbb colors");
  const colors = palette.map(hex), life = checkedRange(options.life ?? [0.3, 0.7], "Life", true);
  const speed = checkedRange(options.speed ?? [20, 60], "Speed"), size = checkedRange(options.size ?? [0.6, 1.2], "Size");
  const source = typeof origin === "function" ? origin : void 0;
  const fixedOrigin = typeof origin === "function" ? void 0 : checkedPoint(origin);
  const velocitySource = typeof inheritedVelocity === "function" ? inheritedVelocity : void 0;
  const fixedVelocity = typeof inheritedVelocity === "function" ? void 0 : checkedPoint(inheritedVelocity, "inheritedVelocity");
  const particles = [];
  let end = start;
  for (let id = 0; id < count; id++) {
    const r = rng(seed, id, 1729), born = start + r.next() * duration;
    const direction = angle + (r.next() - 0.5) * spread, velocity = r.range(...speed);
    const lifetime = r.range(...life), width = r.range(...size);
    if (![born, born + lifetime, width * endSize].every(Number.isFinite))
      throw new RangeError("Detail particle time or size overflow");
    const [x, y] = source ? checkedPoint(source(born, id)) : fixedOrigin;
    const [inheritedX, inheritedY] = velocitySource ? checkedPoint(velocitySource(born, id), "inheritedVelocity") : fixedVelocity;
    const launchX = Math.cos(direction) * velocity, launchY = Math.sin(direction) * velocity;
    const vx = inheritedX === 0 ? launchX : launchX + inheritedX;
    const vy = inheritedY === 0 ? launchY : launchY + inheritedY;
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) throw new RangeError("Detail particle initial velocity overflow");
    particles.push(Object.freeze({
      id,
      born,
      life: lifetime,
      x,
      y,
      vx,
      vy,
      size: width
    }));
    end = Math.max(end, born + lifetime);
  }
  Object.freeze(particles);
  function sample(time) {
    if (!Number.isFinite(time)) throw new RangeError("Detail sample time must be finite");
    const result = [];
    if (time < start || time >= end) return result;
    for (const p of particles) {
      const age = time - p.born;
      if (age < 0 || age >= p.life) continue;
      const progress = age / p.life, [x, y] = fly(p.x, p.y, p.vx, p.vy, age, gravity, drag);
      const [vx, vy] = flyV(p.vx, p.vy, age, gravity, drag);
      if (![x, y, vx, vy].every(Number.isFinite)) throw new RangeError("Detail particle motion overflow");
      result.push({
        id: p.id,
        born: p.born,
        age,
        life: p.life,
        progress,
        x,
        y,
        vx,
        vy,
        size: p.size * (1 + (endSize - 1) * progress),
        alpha: opacity * particleEnvelope(age, p.life, attack, fadeStart),
        color: colors[Math.min(colors.length - 1, Math.floor(progress * colors.length))]
      });
    }
    return result;
  }
  return Object.freeze({
    count,
    end,
    particles,
    sample,
    draw(p, time, requestedLayer) {
      if (!Number.isFinite(time)) throw new RangeError("Detail draw time must be finite");
      if (requestedLayer !== void 0 && requestedLayer !== "back" && requestedLayer !== "front")
        throw new RangeError("Invalid detail draw layer");
      if (requestedLayer !== void 0 && requestedLayer !== layer) return;
      for (const q of sample(time)) {
        if (!(q.alpha > 0) || !(q.size > 0)) continue;
        const birth = particles[q.id];
        const points = style === "spark" ? motionTrail((age) => fly(
          birth.x,
          birth.y,
          birth.vx,
          birth.vy,
          age,
          gravity,
          drag
        ), q.age, trailSeconds, trailSamples) : [[q.x, q.y]];
        if (points.length > 1) {
          const tail = colors[Math.min(colors.length - 1, Math.floor(q.progress * colors.length) + 1)];
          drawTrail(p, points, {
            color: tail,
            head: q.color,
            width: q.size,
            alpha: q.alpha,
            light: emission,
            lightRadius
          });
        } else {
          if (q.size <= 1) p.dot(q.x, q.y, q.color, q.alpha * q.size);
          else p.circle(q.x, q.y, q.size / 2, q.color, q.alpha);
          if (emission > 0) p.glow(q.x, q.y, lightRadius, q.color, emission * q.alpha);
        }
      }
    }
  });
}

// src/core/example-code.ts
function effectExampleCode2D(s) {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(s.id)) throw new RangeError("Invalid effect module id");
  const make = s.acted ? "createAct" : "createFx", gpu = s.renderer === "auto";
  const options = { ...s.options, x: s.x, y: s.y, flip: s.flip };
  delete options.actorAdapter;
  const draw = s.acted ? ["  fx.draw(frame, { body: true, target: true });"] : [
    '  fx.draw(frame, "back");',
    ...s.actor ? [
      "  if (effect.meta.actor) drawActor(painterFor(frame).place(options.x, options.y, options.flip),",
      "    fx.options.actor ?? stockActor(), actorAlphaOf(effect, fx.t, fx.options));"
    ] : [],
    '  fx.draw(frame, "front");'
  ];
  return [
    `import { createFrame, clearFrame, ${make}, ${gpu ? "FrameRenderer" : "composite"}, backdrop, drawActor, painterFor, stockActor, actorAlphaOf, sceneCameraOffset } from "poku-pixel-fx";`,
    `import * as effect from "poku-pixel-fx/fx/${s.id}";`,
    "",
    'const canvas = document.createElement("canvas");',
    `canvas.width = ${s.width}; canvas.height = ${s.height};`,
    'canvas.style.imageRendering = "pixelated";',
    "document.body.append(canvas);",
    ...gpu ? ['const renderer = new FrameRenderer(canvas, { backend: "auto" });', "// renderer.status reports WebGL2 or a CPU fallback reason."] : [
      'const ctx = canvas.getContext("2d");',
      "const imageData = ctx.createImageData(canvas.width, canvas.height);"
    ],
    `const frame = createFrame(${s.width}, ${s.height});`,
    `const options = ${JSON.stringify(options, null, 2)};`,
    `const background = ${s.background === "none" ? "null" : `backdrop(${JSON.stringify(s.background)}, canvas.width, canvas.height, options.y)`};`,
    `let fx = ${make}(effect, options);`,
    "let last = performance.now();",
    "function animate(now) {",
    `  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)) * ${s.speed};`,
    "  last = now;",
    `  if (fx.done()) fx = ${make}(effect, options);`,
    "  fx.update(dt);",
    "  clearFrame(frame);",
    ...draw,
    ...!gpu ? ["  composite(frame, imageData.data, background);"] : [],
    '  const [sx, sy] = sceneCameraOffset(fx.shake, matchMedia("(prefers-reduced-motion: reduce)").matches, background === null);',
    ...gpu ? ["  renderer.render(frame, background, 1, [sx, sy]);"] : [
      "  ctx.clearRect(0, 0, canvas.width, canvas.height);",
      "  ctx.putImageData(imageData, sx, sy);"
    ],
    "  requestAnimationFrame(animate);",
    "}",
    "requestAnimationFrame(animate);"
  ].join("\n");
}

// src/render/webgl-compositor.ts
function validateCompositeFrame(frame, background, lightK) {
  const n = frame.w * frame.h;
  if (!Number.isSafeInteger(frame.w) || !Number.isSafeInteger(frame.h) || frame.w < 1 || frame.h < 1 || n > 16777216 || !(frame.color instanceof Uint32Array) || !(frame.light instanceof Uint32Array) || frame.color.length !== n || frame.light.length !== n)
    throw new RangeError("Frame needs positive integer dimensions and matching Uint32 color/light buffers (at most 16,777,216 cells)");
  if (background !== null && typeof background !== "number" && (!(background instanceof Uint32Array) || background.length !== n))
    throw new RangeError("Background must be a packed color, null, or a matching Uint32 buffer");
  if (typeof background === "number" && (!Number.isInteger(background) || background < -2147483648 || background > 4294967295))
    throw new RangeError("Background color must be a packed 32-bit integer");
  if (!Number.isFinite(lightK) || lightK < 0) throw new RangeError("Light strength must be finite and non-negative");
}
var VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
var FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D u_color;
uniform usampler2D u_light;
uniform usampler2D u_background;
uniform uint u_flat;
uniform int u_backgroundMode;
uniform int u_height;
uniform float u_lightK;
out vec4 outColor;
vec4 unpackColor(uint c) {
  return vec4(float(c & 255u), float((c >> 8) & 255u), float((c >> 16) & 255u), float(c >> 24));
}
void main() {
  // Uploaded row zero is the top row; gl_FragCoord counts from the bottom.
  ivec2 p = ivec2(int(gl_FragCoord.x), u_height - 1 - int(gl_FragCoord.y));
  uint pixelColor = texelFetch(u_color, p, 0).r;
  uint light = texelFetch(u_light, p, 0).r & 0xffffffu;
  vec4 c = unpackColor(pixelColor);
  if (c.a != 255.0 && u_backgroundMode != 0) {
    vec3 bg = unpackColor(u_backgroundMode == 1 ? u_flat : texelFetch(u_background, p, 0).r).rgb;
    c.rgb = c.rgb * (c.a / 255.0) + bg * (1.0 - c.a / 255.0);
    c.a = 255.0;
  }
  if (light != 0u) {
    vec3 l = unpackColor(light).rgb * u_lightK;
    if (c.a < 255.0) {
      float pa = c.a / 255.0;
      vec3 pr = c.rgb * pa + l;
      float na = min(1.0, max(pa, max(l.r, max(l.g, l.b)) / 255.0));
      if (na > 0.0) { c.rgb = min(vec3(255.0), pr / na); c.a = na * 255.0; }
    } else c.rgb = min(vec3(255.0), c.rgb + l);
  }
  // Match Uint8ClampedArray's nearest-even byte conversion. Float32 arithmetic may differ by 1 byte.
  outColor = roundEven(clamp(c, 0.0, 255.0)) / 255.0;
}`;
var WebGLCompositor = class {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true
    });
    if (!gl) throw new Error("WebGL2 context is unavailable");
    this.gl = gl;
    this.renderer = String(gl.getParameter(gl.RENDERER));
    const shaders = [];
    try {
      const attributes = gl.getContextAttributes();
      if (!attributes || !attributes.alpha || attributes.premultipliedAlpha || attributes.antialias)
        throw new Error("WebGL context cannot preserve the requested straight-alpha, non-MSAA contract");
      this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Could not allocate WebGL shader");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`WebGL shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
      }
      const program = gl.createProgram();
      if (!program) throw new Error("Could not allocate WebGL program");
      this.program = program;
      shaders.forEach((shader) => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`WebGL link failed: ${gl.getProgramInfoLog(program)}`);
      gl.useProgram(program);
      for (const name of ["color", "light", "background", "flat", "backgroundMode", "height", "lightK"])
        this.uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
      for (let i = 0; i < 3; i++) {
        const texture = gl.createTexture();
        if (!texture) throw new Error("Could not allocate WebGL texture");
        this.textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.uniform1i(this.uniforms.color, 0);
      gl.uniform1i(this.uniforms.light, 1);
      gl.uniform1i(this.uniforms.background, 2);
      this.upload(2, 1, 1, new Uint32Array(1));
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.SCISSOR_TEST);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL compositor initialization failed");
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  }
  gl;
  renderer;
  program;
  textures = [];
  uniforms = {};
  widths = [0, 0, 0];
  heights = [0, 0, 0];
  disposed = false;
  rendered = false;
  maxTextureSize = 0;
  upload(unit, width, height, pixels) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[unit]);
    if (this.widths[unit] !== width || this.heights[unit] !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels);
      this.widths[unit] = width;
      this.heights[unit] = height;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels);
  }
  render(frame, background = null, lightK = 1) {
    validateCompositeFrame(frame, background, lightK);
    if (this.disposed || this.gl.isContextLost()) throw new Error("WebGL compositor is disposed or its context was lost");
    if (!Number.isFinite(Math.fround(lightK))) throw new RangeError("Light strength exceeds GPU float precision");
    const gl = this.gl;
    if (frame.w > this.maxTextureSize || frame.h > this.maxTextureSize) throw new RangeError("Frame exceeds this GPU texture size limit");
    if (this.canvas.width !== frame.w) this.canvas.width = frame.w;
    if (this.canvas.height !== frame.h) this.canvas.height = frame.h;
    if (gl.drawingBufferWidth !== frame.w || gl.drawingBufferHeight !== frame.h)
      throw new Error("WebGL drawing buffer could not retain the native frame dimensions");
    gl.viewport(0, 0, frame.w, frame.h);
    gl.useProgram(this.program);
    this.upload(0, frame.w, frame.h, frame.color);
    this.upload(1, frame.w, frame.h, frame.light);
    if (background instanceof Uint32Array) this.upload(2, frame.w, frame.h, background);
    gl.uniform1ui(this.uniforms.flat, typeof background === "number" ? background >>> 0 : 0);
    gl.uniform1i(this.uniforms.backgroundMode, background === null ? 0 : typeof background === "number" ? 1 : 2);
    gl.uniform1i(this.uniforms.height, frame.h);
    gl.uniform1f(this.uniforms.lightK, lightK);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL compositing failed or context was lost");
    this.rendered = true;
    return this.canvas;
  }
  /** Diagnostic/export readback only. Normal presentation never reads pixels back to the CPU. */
  readPixels() {
    if (this.disposed || this.gl.isContextLost() || !this.rendered) throw new Error("WebGL compositor has no available rendered frame");
    const { width: w, height: h } = this.canvas, bottomUp = new Uint8Array(w * h * 4), out = new Uint8ClampedArray(bottomUp.length);
    this.gl.readPixels(0, 0, w, h, this.gl.RGBA, this.gl.UNSIGNED_BYTE, bottomUp);
    if (this.gl.getError() !== this.gl.NO_ERROR) throw new Error("WebGL pixel readback failed");
    for (let y = 0; y < h; y++) out.set(bottomUp.subarray((h - y - 1) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
};

// src/render/frame-renderer.ts
var FrameRenderer = class {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    if (!["cpu", "auto", "webgl2"].includes(options.backend ?? "cpu")) throw new RangeError("Unknown frame renderer backend");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Presentation needs an available 2D canvas");
    this.context = ctx;
    if (options.backend && options.backend !== "cpu") {
      try {
        this.gpu = new WebGLCompositor(canvas.ownerDocument.createElement("canvas"));
        this.current = { backend: "webgl2", reason: null };
      } catch (error) {
        this.current.reason = error instanceof Error ? error.message : String(error);
      }
    }
    options.onStatus?.(this.status);
  }
  context;
  gpu = null;
  image = null;
  current = { backend: "cpu", reason: null };
  disposed = false;
  get status() {
    return Object.freeze({ ...this.current });
  }
  /** Integer native-pixel camera offset; clipping/clearing match ordinary canvas presentation. */
  render(frame, background = null, lightK = 1, offset = [0, 0]) {
    if (this.disposed) throw new Error("Frame renderer is disposed");
    validateCompositeFrame(frame, background, lightK);
    if (offset.length !== 2 || !offset.every(Number.isSafeInteger)) throw new RangeError("Camera offset must contain two integer pixel coordinates");
    if (this.canvas.width !== frame.w) this.canvas.width = frame.w;
    if (this.canvas.height !== frame.h) this.canvas.height = frame.h;
    const ctx = this.context, [sx, sy] = offset;
    if (this.gpu) {
      try {
        const rendered = this.gpu.render(frame, background, lightK);
        ctx.save();
        try {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "copy";
          ctx.filter = "none";
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, frame.w, frame.h);
          ctx.drawImage(rendered, sx, sy);
        } finally {
          ctx.restore();
        }
        return;
      } catch (error) {
        this.gpu.dispose();
        this.gpu = null;
        this.current = { backend: "cpu", reason: error instanceof Error ? error.message : String(error) };
        this.options.onStatus?.(this.status);
      }
    }
    if (!this.image || this.image.width !== frame.w || this.image.height !== frame.h) this.image = ctx.createImageData(frame.w, frame.h);
    composite(frame, this.image.data, background, lightK);
    if (sx || sy) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, frame.w, frame.h);
      ctx.restore();
    }
    ctx.putImageData(this.image, sx, sy);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gpu?.dispose();
    this.gpu = null;
  }
};

export {
  fly,
  flyV,
  cycle,
  flowMotion,
  helicalAirflow,
  airflowTrail,
  drawAirflow,
  liquidMotion,
  liquidImpactTime,
  smokeVolume,
  smokeCurl,
  fractureStone,
  rubblePath,
  fractureGlass,
  glassVertices,
  glassShardPath,
  frostAccretion2D,
  surfaceCorrosion2D,
  projectSigilPath,
  sigilArc,
  CubicFlightPath,
  dragDisplacement,
  createExhaustWake,
  drawRocketJet,
  flightEndpointAtContact,
  impactKick2D,
  createGroundImpact,
  bolt,
  forks,
  star,
  GRAVITY,
  FIRE_RAMP,
  SMOKE_RAMP,
  P,
  PF,
  Particles,
  Blazes,
  B,
  Bits,
  Lights,
  sparkle,
  flare,
  band,
  crystal,
  READY,
  defineRestorationTiming2D,
  restorationField2D,
  samplePointLight2D,
  localPointLight2D,
  createPointLightSampler2D,
  createDetailParticles2D,
  effectExampleCode2D,
  FrameRenderer
};
