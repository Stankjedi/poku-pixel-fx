/** One scalar animation key. Time is in seconds; velocity is in value units per second. */
export interface TimingCurveKey {
  readonly time: number;
  readonly value: number;
  /** Omit for a shape-preserving tangent. An authored velocity may deliberately overshoot. */
  readonly velocity?: number;
}

export type TimingCurveBoundary = 'hold' | 'continue';

export interface TimingCurveOptions {
  /** Behavior strictly before the first key. Default: hold. */
  before?: TimingCurveBoundary;
  /** Behavior strictly after the last key. Default: hold. */
  after?: TimingCurveBoundary;
}

export interface TimingCurveSample {
  value: number;
  velocity: number;
}

export interface TimingCurve {
  /** Frozen copies, including the resolved velocity at every key. */
  readonly keys: readonly Readonly<Required<TimingCurveKey>>[];
  /** Pure, seekable sampling. At an exact key, returns its value and resolved tangent. */
  sample(time: number): TimingCurveSample;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function boundary(value: unknown, label: string): TimingCurveBoundary {
  if (value === undefined) return 'hold';
  if (value !== 'hold' && value !== 'continue') {
    throw new RangeError(`${label} must be 'hold' or 'continue'`);
  }
  return value;
}

/** Weighted harmonic mean, scaled so tiny slopes and large time spans remain usable. */
function interiorTangent(leftWidth: number, rightWidth: number, left: number, right: number): number {
  if (left === 0 || right === 0 || Math.sign(left) !== Math.sign(right)) return 0;
  const scale = Math.max(leftWidth, rightWidth);
  const a = leftWidth / scale, b = rightWidth / scale;
  const leftWeight = (a + 2 * b) / (3 * (a + b));
  const minimum = Math.min(Math.abs(left), Math.abs(right));
  return Math.sign(left) * (minimum / (
    leftWeight * (minimum / Math.abs(left)) + (1 - leftWeight) * (minimum / Math.abs(right))
  ));
}

/** One-sided PCHIP tangent, limited to avoid a new extremum at either end. */
function endpointTangent(width: number, neighborWidth: number, slope: number, neighborSlope: number): number {
  if (slope === 0) return 0;
  const widthScale = Math.max(width, neighborWidth);
  const weight = (width / widthScale) / (width / widthScale + neighborWidth / widthScale);
  const slopeScale = Math.max(Math.abs(slope), Math.abs(neighborSlope));
  const a = slope / slopeScale, b = neighborSlope / slopeScale;
  const tangent = (1 + weight) * a - weight * b;
  if (Math.sign(tangent) !== Math.sign(slope)) return 0;
  if (Math.sign(slope) !== Math.sign(neighborSlope) && Math.abs(tangent) > 3 * Math.abs(a)) {
    return 3 * slope;
  }
  return tangent * slopeScale;
}

function checkedSample(value: number, velocity: number): TimingCurveSample {
  finite(value, 'Sampled timing curve value');
  finite(velocity, 'Sampled timing curve velocity');
  return { value, velocity };
}

/**
 * Create an opt-in cubic scalar animation curve, independent of drawing and simulation state.
 * Times must be strictly increasing, with 2..1024 finite keys. Missing velocities use PCHIP:
 * monotone spans stay within their keyed values, and turns/plateaus get zero tangents. Explicit
 * velocities override that protection and may deliberately create anticipation or overshoot.
 *
 * Outside the keys, hold returns a constant value and zero velocity; continue extends the
 * endpoint's tangent as a straight line. At the endpoint itself the curve tangent is returned,
 * so a nonzero endpoint velocity followed by hold is an authored stop, not a smooth join.
 * Inputs are snapshotted. Unrepresentable spans, slopes, tangents or samples throw RangeError.
 */
export function createTimingCurve(
  input: readonly TimingCurveKey[], options: TimingCurveOptions = {},
): TimingCurve {
  if (!Array.isArray(input) || input.length < 2 || input.length > 1024) {
    throw new RangeError('Timing curves need an array of 2..1024 keys');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Reflect.ownKeys(options).some(key => key !== 'before' && key !== 'after')) {
    throw new RangeError('Timing curve options must contain only before and after policies');
  }
  const before = boundary(options.before, 'Timing curve before policy');
  const after = boundary(options.after, 'Timing curve after policy');
  const source: TimingCurveKey[] = [];
  const widths: number[] = [], changes: number[] = [], slopes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const key = input[i];
    if (!Object.hasOwn(input, i) || !key || typeof key !== 'object' || Array.isArray(key)) {
      throw new RangeError(`Timing curve key ${i} must be a complete key object`);
    }
    const time = finite(key.time, `Timing curve key ${i} time`);
    const value = finite(key.value, `Timing curve key ${i} value`);
    const velocity = key.velocity;
    if (velocity !== undefined) finite(velocity, `Timing curve key ${i} velocity`);
    source.push({ time, value, velocity });
    if (i > 0) {
      const width = finite(time - source[i - 1].time, 'Timing curve key span');
      if (width <= 0) throw new RangeError('Timing curve key times must be strictly increasing');
      const change = finite(value - source[i - 1].value, 'Timing curve value change');
      widths.push(width);
      changes.push(change);
      slopes.push(finite(change / width, 'Timing curve slope'));
    }
  }

  const last = source.length - 1;
  const keys = Object.freeze(source.map((key, i) => {
    let velocity = key.velocity;
    if (velocity === undefined) {
      if (last === 1) velocity = slopes[0];
      else if (i === 0) velocity = endpointTangent(widths[0], widths[1], slopes[0], slopes[1]);
      else if (i === last) {
        velocity = endpointTangent(widths[last - 1], widths[last - 2], slopes[last - 1], slopes[last - 2]);
      } else velocity = interiorTangent(widths[i - 1], widths[i], slopes[i - 1], slopes[i]);
    }
    return Object.freeze({ time: key.time, value: key.value, velocity: finite(velocity, 'Timing curve tangent') });
  }));

  function outside(time: number, key: Required<TimingCurveKey>, policy: TimingCurveBoundary): TimingCurveSample {
    if (policy === 'hold' || key.velocity === 0) return { value: key.value, velocity: 0 };
    return checkedSample(key.value + (time - key.time) * key.velocity, key.velocity);
  }

  function sample(time: number): TimingCurveSample {
    finite(time, 'Timing curve sample time');
    if (time < keys[0].time) return outside(time, keys[0], before);
    if (time > keys[last].time) return outside(time, keys[last], after);

    // Exact keys bypass polynomial evaluation, including the endpoint tangent convention.
    let low = 0, high = last;
    while (low <= high) {
      const middle = (low + high) >>> 1, key = keys[middle];
      if (time === key.time) return { value: key.value, velocity: key.velocity };
      if (time < key.time) high = middle - 1;
      else low = middle + 1;
    }
    const i = high, left = keys[i], right = keys[i + 1];
    const u = (time - left.time) / widths[i], v = 1 - u;
    const smooth = u * u * (3 - 2 * u);
    const value = left.value + changes[i] * smooth
      + (widths[i] * u * v) * (v * left.velocity - u * right.velocity);

    // Analytic Hermite derivative, scaled to avoid overflow of cancelling intermediate terms.
    const scale = Math.max(Math.abs(slopes[i]), Math.abs(left.velocity), Math.abs(right.velocity));
    const slope = scale === 0 ? 0 : slopes[i] / scale;
    const velocity = scale === 0 ? 0 : scale * (
      slope
      + v * (1 - 3 * u) * (left.velocity / scale - slope)
      + u * (3 * u - 2) * (right.velocity / scale - slope)
    );
    return checkedSample(value, velocity);
  }

  return Object.freeze({ keys, sample });
}
