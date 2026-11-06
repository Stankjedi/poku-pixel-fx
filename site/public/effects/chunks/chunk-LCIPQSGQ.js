import {
  clamp,
  cubicBezier,
  smooth
} from "./chunk-MBWWV6CB.js";

// src/core/impact-contact.ts
function defineImpactContact2D(input) {
  const { id, at, position, normal, material, strength = 1, radius = 1 } = input;
  if (typeof id !== "string" || !id.trim() || typeof material !== "string" || !material.trim() || !Array.isArray(position) || position.length !== 2 || !Array.isArray(normal) || normal.length !== 2 || ![at, ...position, ...normal, strength, radius].every(Number.isFinite) || at < 0 || strength < 0 || radius <= 0) throw new RangeError("Impact contact needs an id, time, finite point/normal, material and valid strength/radius");
  const length = Math.hypot(...normal);
  if (!(length > 1e-12) || !Number.isFinite(length)) throw new RangeError("Impact contact normal must be nonzero");
  return Object.freeze({
    id,
    at,
    position: Object.freeze([...position]),
    normal: Object.freeze([normal[0] / length, normal[1] / length]),
    material,
    strength,
    radius
  });
}
function transformImpactContact2D(contact, placement) {
  const { x = 0, y = 0, flip = false, angle = 0 } = placement;
  if (![x, y, angle].every(Number.isFinite)) throw new RangeError("Contact placement must be finite");
  const c = Math.cos(angle), s = Math.sin(angle), sign = flip ? -1 : 1, [px, py] = contact.position, [nx, ny] = contact.normal;
  return defineImpactContact2D({ ...contact, position: [x + sign * px * c - py * s, y + sign * px * s + py * c], normal: [sign * nx * c - ny * s, sign * nx * s + ny * c] });
}
function impactContactAge2D(contact, time) {
  if (!Number.isFinite(time)) throw new RangeError("Contact time must be finite");
  const age = time - contact.at;
  return Math.abs(age) < 1e-9 ? 0 : age;
}

// src/core/quality.ts
function pointedRibbon(left, right, upper, lower, bend = 0, tolerance = 0.12) {
  if (![left, right, upper, lower, bend].every(Number.isFinite)) throw new RangeError("Ribbon dimensions must be finite");
  const span = right - left;
  const top = cubicBezier([left, 0], [left + span * 0.27, -upper + bend], [left + span * 0.71, -upper + bend], [right, 0], tolerance);
  const bottom = cubicBezier([left, 0], [left + span * 0.3, lower + bend], [left + span * 0.75, lower + bend], [right, 0], tolerance);
  return { top, bottom, shape: [...top, ...bottom.slice().reverse()] };
}
function motionTrail(position, age, seconds = 0.06, samples = 7, since = 0) {
  if (![age, seconds, samples, since].every(Number.isFinite) || seconds < 0 || samples < 2 || samples > 256 || !Number.isInteger(samples))
    throw new RangeError("Trail times must be finite; seconds non-negative; samples an integer from 2 to 256");
  if (age < since) return [];
  const start = Math.max(since, age - seconds), points = [];
  for (let i = 0; i < samples; i++) {
    const point = position(start + (age - start) * i / (samples - 1));
    if (!point.every(Number.isFinite)) throw new RangeError("Trail positions must be finite");
    const last = points[points.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push([point[0], point[1]]);
  }
  return points;
}
function drawTrail(p, points, style) {
  const { color, head = color, width = 1, alpha = 1, light = 0.12, lightRadius = 2.5 } = style;
  if (!points.length || !(alpha > 0) || !(width > 0)) return;
  const end = points[points.length - 1];
  if (points.length === 1) p.dot(end[0], end[1], head, alpha * Math.min(1, width));
  else p.path(points, (u) => u > 0.6 ? head : color, (u) => alpha * (0.2 + 0.8 * u ** 1.5), width, { preferHead: true });
  if (light > 0) p.glow(end[0], end[1], lightRadius, color, alpha * light);
}
function particleEnvelope(age, life, attack = 0.04, fadeStart = 0.25) {
  if (!(life > 0) || age <= 0 || age >= life) return 0;
  const u = age / life;
  return smooth(0, Math.max(1e-6, attack), u) * (1 - smooth(clamp(fadeStart), 1, u));
}

// src/core/timing-curve.ts
function finite(value, label) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}
function boundary(value, label) {
  if (value === void 0) return "hold";
  if (value !== "hold" && value !== "continue") {
    throw new RangeError(`${label} must be 'hold' or 'continue'`);
  }
  return value;
}
function interiorTangent(leftWidth, rightWidth, left, right) {
  if (left === 0 || right === 0 || Math.sign(left) !== Math.sign(right)) return 0;
  const scale = Math.max(leftWidth, rightWidth);
  const a = leftWidth / scale, b = rightWidth / scale;
  const leftWeight = (a + 2 * b) / (3 * (a + b));
  const minimum = Math.min(Math.abs(left), Math.abs(right));
  return Math.sign(left) * (minimum / (leftWeight * (minimum / Math.abs(left)) + (1 - leftWeight) * (minimum / Math.abs(right))));
}
function endpointTangent(width, neighborWidth, slope, neighborSlope) {
  if (slope === 0) return 0;
  const widthScale = Math.max(width, neighborWidth);
  const weight = width / widthScale / (width / widthScale + neighborWidth / widthScale);
  const slopeScale = Math.max(Math.abs(slope), Math.abs(neighborSlope));
  const a = slope / slopeScale, b = neighborSlope / slopeScale;
  const tangent = (1 + weight) * a - weight * b;
  if (Math.sign(tangent) !== Math.sign(slope)) return 0;
  if (Math.sign(slope) !== Math.sign(neighborSlope) && Math.abs(tangent) > 3 * Math.abs(a)) {
    return 3 * slope;
  }
  return tangent * slopeScale;
}
function checkedSample(value, velocity) {
  finite(value, "Sampled timing curve value");
  finite(velocity, "Sampled timing curve velocity");
  return { value, velocity };
}
function createTimingCurve(input, options = {}) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 1024) {
    throw new RangeError("Timing curves need an array of 2..1024 keys");
  }
  if (!options || typeof options !== "object" || Array.isArray(options) || Reflect.ownKeys(options).some((key) => key !== "before" && key !== "after")) {
    throw new RangeError("Timing curve options must contain only before and after policies");
  }
  const before = boundary(options.before, "Timing curve before policy");
  const after = boundary(options.after, "Timing curve after policy");
  const source = [];
  const widths = [], changes = [], slopes = [];
  for (let i = 0; i < input.length; i++) {
    const key = input[i];
    if (!Object.hasOwn(input, i) || !key || typeof key !== "object" || Array.isArray(key)) {
      throw new RangeError(`Timing curve key ${i} must be a complete key object`);
    }
    const time = finite(key.time, `Timing curve key ${i} time`);
    const value = finite(key.value, `Timing curve key ${i} value`);
    const velocity = key.velocity;
    if (velocity !== void 0) finite(velocity, `Timing curve key ${i} velocity`);
    source.push({ time, value, velocity });
    if (i > 0) {
      const width = finite(time - source[i - 1].time, "Timing curve key span");
      if (width <= 0) throw new RangeError("Timing curve key times must be strictly increasing");
      const change = finite(value - source[i - 1].value, "Timing curve value change");
      widths.push(width);
      changes.push(change);
      slopes.push(finite(change / width, "Timing curve slope"));
    }
  }
  const last = source.length - 1;
  const keys = Object.freeze(source.map((key, i) => {
    let velocity = key.velocity;
    if (velocity === void 0) {
      if (last === 1) velocity = slopes[0];
      else if (i === 0) velocity = endpointTangent(widths[0], widths[1], slopes[0], slopes[1]);
      else if (i === last) {
        velocity = endpointTangent(widths[last - 1], widths[last - 2], slopes[last - 1], slopes[last - 2]);
      } else velocity = interiorTangent(widths[i - 1], widths[i], slopes[i - 1], slopes[i]);
    }
    return Object.freeze({ time: key.time, value: key.value, velocity: finite(velocity, "Timing curve tangent") });
  }));
  function outside(time, key, policy) {
    if (policy === "hold" || key.velocity === 0) return { value: key.value, velocity: 0 };
    return checkedSample(key.value + (time - key.time) * key.velocity, key.velocity);
  }
  function sample(time) {
    finite(time, "Timing curve sample time");
    if (time < keys[0].time) return outside(time, keys[0], before);
    if (time > keys[last].time) return outside(time, keys[last], after);
    let low = 0, high = last;
    while (low <= high) {
      const middle = low + high >>> 1, key = keys[middle];
      if (time === key.time) return { value: key.value, velocity: key.velocity };
      if (time < key.time) high = middle - 1;
      else low = middle + 1;
    }
    const i = high, left = keys[i], right = keys[i + 1];
    const u = (time - left.time) / widths[i], v = 1 - u;
    const smooth2 = u * u * (3 - 2 * u);
    const value = left.value + changes[i] * smooth2 + widths[i] * u * v * (v * left.velocity - u * right.velocity);
    const scale = Math.max(Math.abs(slopes[i]), Math.abs(left.velocity), Math.abs(right.velocity));
    const slope = scale === 0 ? 0 : slopes[i] / scale;
    const velocity = scale === 0 ? 0 : scale * (slope + v * (1 - 3 * u) * (left.velocity / scale - slope) + u * (3 * u - 2) * (right.velocity / scale - slope));
    return checkedSample(value, velocity);
  }
  return Object.freeze({ keys, sample });
}

export {
  defineImpactContact2D,
  transformImpactContact2D,
  impactContactAge2D,
  pointedRibbon,
  motionTrail,
  drawTrail,
  particleEnvelope,
  createTimingCurve
};
