import test from 'node:test';
import assert from 'node:assert/strict';
const moduleURL = process.env.FLAME_ENSEMBLE_MODULE || new URL('../build/core/flame-ensemble.js', import.meta.url).href;
const { createFlameEnsemble2D } = await import(moduleURL);
const { Painter } = await import(new URL('./painter.js', moduleURL));
const palette = ['#601010', '#d32b10', '#ff8015', '#ffd36c'];
const emissionFrame = (birth, id, u) => ({ position: [Math.sin(birth * 2) * 12 + u * 20, -birth * 12], direction: [u - .5, -1], inheritedVelocity: [3, -8] });
const options = { palette, seed: 174, emissionFrame };
function render(r, t, hdr = false) {
  const f = { w: 192, h: 192, ox: -96, oy: -96, color: new Uint32Array(192 ** 2), light: new Uint32Array(192 ** 2), ...(hdr ? { hdrLight: new Float32Array(192 ** 2 * 3) } : {}) };
  const p = new Painter(f);
  r.drawBack(p, t); r.draw(p, t);
  return f;
}
test('fixed finite budgets, deterministic seeking and terminal empty buffers', () => {
  const a = createFlameEnsemble2D(options), b = createFlameEnsemble2D(options);
  assert.ok(Object.isFrozen(a)); assert.equal(a.count, 104); assert.ok(a.end < 3.9);
  for (const t of [1.7, .4, 2.7, 1.7]) assert.deepEqual(render(a, t), render(b, t));
  assert.ok(render(a, 1.7).color.some(Boolean));
  for (const t of [-1, .3, a.end, 4.2, 3600]) {
    assert.deepEqual(a.sample(t), []);
    const f = render(a, t); assert.ok(!f.color.some(Boolean)); assert.ok(!f.light.some(Boolean));
  }
  assert.notDeepEqual(createFlameEnsemble2D({ ...options, seed: 175 }).sample(1.7), a.sample(1.7));
});
test('source is called only at construction; snapshots and cache cannot be mutated externally', () => {
  let calls = 0;
  const shared = { position: [4, 5], direction: [0, -1], inheritedVelocity: [2, -3] };
  const colors = [...palette], layers = { light: false }, intensity = [[0, .5], [1, 1]];
  const r = createFlameEnsemble2D({ palette: colors, layers, intensity, emissionFrame() { calls++; return shared; } });
  const first = r.sample(1), frame = render(r, 1);
  assert.equal(calls, 104);
  colors.fill('#000'); shared.position.fill(100); shared.direction.fill(10); shared.inheritedVelocity.fill(80); layers.light = true; intensity[0][1] = 0;
  r.prepare(1); r.drawBack(new Painter(render(r, -1)), 1);
  const changed = r.sample(1); changed[0].x = 10000; changed.length = 0;
  assert.deepEqual(r.sample(1), first); assert.deepEqual(render(r, 1), frame);
  r.sample(2); assert.deepEqual(r.sample(1), first); assert.equal(calls, 104);
});
test('light-off preserves color exactly and writes no packed/HDR light; layers isolate', () => {
  const on = createFlameEnsemble2D(options), off = createFlameEnsemble2D({ ...options, layers: { light: false } });
  for (const t of [.6, 1.4, 2.4, 3.2]) for (const hdr of [false, true]) {
    const a = render(on, t, hdr), b = render(off, t, hdr);
    assert.deepEqual(a.color, b.color); assert.ok(!b.light.some(Boolean));
    if (hdr) assert.ok(!b.hdrLight.some(Boolean));
  }
  const fine = createFlameEnsemble2D({ ...options, layers: { coarse: false, sparks: false, light: false } });
  assert.equal(fine.count, 48);
  assert.deepEqual(fine.sample(1.3), on.sample(1.3).filter(s => s.kind === 'fine'));
  const empty = createFlameEnsemble2D({ ...options, layers: { coarse: false, fine: false, sparks: false, light: false } });
  assert.equal(empty.count, 0); assert.deepEqual(empty.sample(1), []);
});
test('invalid, sparse, extreme and malformed values fail explicitly', () => {
  for (const v of [null, [], {}, { ...options, palette: new Array(3) }, { ...options, palette: ['#fff', , '#000'] },
    ...['start', 'duration', 'seed', 'sizeScale', 'speedScale', 'inheritedVelocityScale', 'density'].flatMap(k => [NaN, Infinity, 1e100, -1].map(v => ({ ...options, [k]: v }))),
    { ...options, seed: .5 }, { ...options, start: 3598, duration: 1 }, { ...options, layers: null },
    { ...options, layers: { fine: 1 } }, { ...options, layers: { fire: true } },
    ...[null, [], new Array(2), [[0, 1], [, 1]], [[0, -1], [1, 1]], [[0, 1], [0, .5]], [[.1, 1], [1, 1]]].map(intensity => ({ ...options, intensity }))])
    assert.throws(() => createFlameEnsemble2D(v), RangeError);
  for (const source of [null, [], { position: [, 1], direction: [0, 1] }, { position: [0, 0], direction: [0, 0] },
    { position: [1e10, 0], direction: [0, 1] }, { position: [0, 0], direction: [Infinity, 1] },
    { position: [0, 0], direction: [0, 1], inheritedVelocity: [, 1] }])
    assert.throws(() => createFlameEnsemble2D({ ...options, emissionFrame: () => source }), RangeError);
  const r = createFlameEnsemble2D(options);
  for (const t of [NaN, Infinity, 3601, -3601]) for (const method of ['prepare', 'sample']) assert.throws(() => r[method](t), RangeError);
});
test('bounded geometry and source motion including exact velocity cancellation remain finite', () => {
  const r = createFlameEnsemble2D({ ...options, sizeScale: 3, duration: 0, emissionFrame: () => ({ position: [100000, -100000], direction: [10000, -10000], inheritedVelocity: [10000, -10000] }) });
  for (let t = .31; t < 1.7; t += .03) for (const s of r.sample(t)) {
    for (const v of Object.values(s)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
    assert.ok(s.width < 34 && s.height < 60); assert.ok(Math.abs(s.x) < 120000 && Math.abs(s.y) < 120000);
  }
  let maxGlow = 0;
  const sink = { shade() {}, path(points) { for (const p of points) assert.ok(p.every(Number.isFinite)); }, glow() { maxGlow++; } };
  for (let t = 0; t < 4.2; t += .03) { maxGlow = 0; r.drawBack(sink, t); r.draw(sink, t); assert.ok(maxGlow <= 6); }
});
test('zero intensity is empty; cancelled spark motion has finite points; all layer budgets bounded', async () => {
  const zero = createFlameEnsemble2D({ ...options, intensity: [[0, 0], [1, 0]] });
  for (const t of [.3, 1, 2, 3, 4.2]) {
    assert.deepEqual(zero.sample(t), []);
    const f = render(zero, t, true); assert.ok(!f.color.some(Boolean)); assert.ok(!f.light.some(Boolean)); assert.ok(!f.hdrLight.some(Boolean));
  }
  const { rand } = await import(new URL('./math.js', moduleURL));
  const stopped = createFlameEnsemble2D({ ...options, layers: { coarse: false, fine: false, light: false }, emissionFrame(birth, id) {
    const angle = (rand(174, id, 3) - .5) * .8, speed = 100 + rand(174, id, 4) * 70;
    return { position: [0, 0], direction: [0, -1], inheritedVelocity: [-Math.sin(angle) * speed, Math.cos(angle) * speed] };
  } });
  let paths = 0;
  stopped.draw({ shade() {}, glow() {}, path(points) { paths++; assert.ok(points.flat().every(Number.isFinite)); assert.deepEqual(points, [[0, 0], [0, 0]]); } }, 1.7);
  assert.ok(paths > 0);
  const r = createFlameEnsemble2D(options);
  for (let t = 0; t < 4; t += .04) {
    const s = r.sample(t);
    assert.ok(s.filter(v => v.kind === 'coarse').length <= 32);
    assert.ok(s.filter(v => v.kind === 'fine').length <= 48);
    assert.ok(s.filter(v => v.kind === 'sparks').length <= 24);
    let glows = 0;
    r.drawBack({ path() {}, shade() {}, glow(x, y, radius, color, strength) { glows++; assert.ok(radius <= 19.8 && strength <= .16); } }, t);
    assert.ok(glows <= 6);
  }
});
test('independent expressive size/speed/density controls and maximum budgets', () => {
  const base = createFlameEnsemble2D(options).sample(1.4);
  const large = createFlameEnsemble2D({ ...options, sizeScale: 2 }).sample(1.4);
  const fast = createFlameEnsemble2D({ ...options, speedScale: 2 }).sample(1.4);
  assert.equal(base.length, large.length); assert.equal(base.length, fast.length);
  for (let i = 0; i < base.length; i++) {
    assert.equal(large[i].x, base[i].x); assert.equal(large[i].y, base[i].y);
    assert.equal(large[i].vx, base[i].vx); assert.equal(large[i].width, base[i].width * 2);
    assert.equal(fast[i].width, base[i].width); assert.equal(fast[i].height, base[i].height);
    assert.notEqual(fast[i].y, base[i].y);
  }
  for (const density of [.25, 1, 3, 4]) {
    const r = createFlameEnsemble2D({ ...options, density, sizeScale: 3, speedScale: 6 });
    assert.equal(r.count, [32, 48, 24].reduce((n, b) => n + Math.ceil(b * density), 0));
    assert.ok(r.count <= 416 && r.end <= 3.9);
    for (const s of r.sample(1.7)) assert.ok(s.width <= 33 && s.height <= 52.8);
  }
  for (const bad of [{ sizeScale: 3.01 }, { speedScale: 6.01 }, { density: 4.01 }, { density: .249 }, { scale: 1 },
    { flutter: null }, { flutter: {} }, { flutter: { amplitude: 33, frequency: 1 } }, { flutter: { amplitude: 1, frequency: 7 } },
    { flutter: { amplitude: NaN, frequency: 1 } }]) assert.throws(() => createFlameEnsemble2D({ ...options, ...bad }), RangeError);
});
test('stable light IDs never reassign as a simultaneous burst dies', () => {
  const r = createFlameEnsemble2D({ ...options, duration: 0, density: 4 });
  function lights(t) {
    const samples = r.sample(t), ids = [];
    r.drawBack({ shade() {}, path() {}, glow(x, y, radius, c, alpha) {
      assert.ok(radius <= 24 && alpha <= .16);
      ids.push(samples.find(s => s.kind === 'coarse' && s.x === x && s.y === y).id);
    } }, t);
    return ids;
  }
  const initial = lights(.30001); assert.equal(initial.length, 6);
  let previous = initial;
  for (let t = .31; t < 1.7; t += .01) {
    const current = lights(t);
    for (const id of current) assert.ok(previous.includes(id), `new light ${id} at ${t}`);
    previous = current;
  }
});
test('flutter has zero birth displacement/velocity, bounded analytic derivative and immutable inputs', () => {
  const flutter = { amplitude: 12, frequency: 2.5 };
  const plain = createFlameEnsemble2D({ ...options, duration: 0 });
  const r = createFlameEnsemble2D({ ...options, duration: 0, flutter });
  flutter.amplitude = 32; flutter.frequency = 6;
  const first = r.sample(.7); r.sample(1); assert.deepEqual(r.sample(.7), first);
  for (const age of [1e-8, .01, .1, .3, .5]) {
    const t = .3 + age, a = plain.sample(t), b = r.sample(t);
    for (let i = 0; i < a.length; i++) {
      const displacement = Math.hypot(b[i].x - a[i].x, b[i].y - a[i].y);
      const speed = Math.hypot(b[i].vx - a[i].vx, b[i].vy - a[i].vy);
      assert.ok(displacement <= 12 + 1e-10); assert.ok(speed <= 12 * Math.PI * 2.5 + 1e-10);
      if (age === 1e-8) { assert.ok(displacement < 1e-10); assert.ok(speed < .0001); }
    }
    const eps = 1e-6, before = r.sample(t - eps), after = r.sample(t + eps);
    if (age > eps) for (const s of b) {
      const lo = before.find(v => v.id === s.id), hi = after.find(v => v.id === s.id);
      if (lo && hi) {
        assert.ok(Math.abs((hi.x - lo.x) / (2 * eps) - s.vx) < 1e-5);
        assert.ok(Math.abs((hi.y - lo.y) / (2 * eps) - s.vy) < 1e-5);
      }
    }
  }
});

test('role outgoing speeds and independent inherited-motion scaling match initial velocity formula', async () => {
  const { rand } = await import(new URL('./math.js', moduleURL));
  const source = () => ({ position: [0, 0], direction: [0, -1], inheritedVelocity: [25, 65] });
  for (const inheritedVelocityScale of [0, .3, 1]) for (const speedScale of [.25, 1, 6]) {
    const r = createFlameEnsemble2D({ ...options, duration: 0, emissionFrame: source, inheritedVelocityScale, speedScale });
    const samples = r.sample(.300001);
    assert.equal(samples.length, 104);
    for (const s of samples) {
      const role = ['coarse', 'fine', 'sparks'].indexOf(s.kind);
      const speed = ([65, 100, 100][role] + rand(174, s.id, 4) * [40, 60, 70][role]) * speedScale;
      const decay = Math.exp(-(s.kind === 'sparks' ? .65 : 1.7) * (.300001 - .3));
      assert.ok(Math.abs(s.vx / decay - (Math.sin(s.angle) * speed + 25 * inheritedVelocityScale)) < 1e-10);
      assert.ok(Math.abs(s.vy / decay - (-Math.cos(s.angle) * speed + 65 * inheritedVelocityScale)) < 1e-10);
    }
  }
  const a = createFlameEnsemble2D({ ...options, inheritedVelocityScale: 0 }).sample(1.4);
  const b = createFlameEnsemble2D({ ...options, inheritedVelocityScale: 1 }).sample(1.4);
  for (let i = 0; i < a.length; i++) {
    for (const key of ['id', 'kind', 'born', 'life', 'width', 'height', 'angle', 'alpha', 'color', 'progress']) assert.equal(a[i][key], b[i][key]);
    assert.notEqual(a[i].y, b[i].y);
  }
  assert.throws(() => createFlameEnsemble2D({ ...options, inheritedVelocityScale: 1.001 }), RangeError);
});

test('absolute particle deaths and ensemble end are empty even after rounded time subtraction', () => {
  for (const start of [0, .3, 100, 3598]) for (const seed of [2, 3, 174]) {
    const r = createFlameEnsemble2D({ ...options, start, duration: 0, seed });
    const initial = r.sample(start + .01);
    assert.equal(initial.length, 104);
    for (const s of initial) {
      assert.ok(!r.sample(s.born + s.life).some(v => v.id === s.id), `${start}:${seed}:${s.id}`);
    }
    // Exercise terminal cache replacement and seeking back into live time.
    for (let seek = 0; seek < 2; seek++) {
      assert.deepEqual(r.sample(start + .01), initial);
      assert.deepEqual(r.sample(r.end), []);
      const f = render(r, r.end, true);
      for (const key of ['color', 'light', 'hdrLight']) assert.ok(!f[key].some(Boolean));
    }
    assert.deepEqual(r.sample(3600), []);
    for (const time of [NaN, Infinity, 3601, -3601]) assert.throws(() => r.sample(time), RangeError);
  }
});

test('all finite nonzero direction magnitudes including subnormals preserve their axis', () => {
  const source = direction => () => ({ position: [0, 0], direction });
  for (const axis of [[1, 0], [0, -1], [1, 1], [-1, -1]]) {
    const baseline = createFlameEnsemble2D({ ...options, duration: 0, emissionFrame: source(axis) }).sample(.5);
    for (const magnitude of [Number.MIN_VALUE, 1e-320, 1e-9, 1e-8, 10000]) {
      const direction = axis.map(v => v * magnitude);
      const r = createFlameEnsemble2D({ ...options, duration: 0, emissionFrame: source(direction) });
      assert.deepEqual(r.sample(.5), baseline);
    }
  }
  for (const direction of [[0, 0], [-0, -0]]) {
    assert.throws(() => createFlameEnsemble2D({ ...options, emissionFrame: source(direction) }), RangeError);
  }
});

test('simultaneous and near-zero bursts retain varying normalized-stratum birth strengths', async () => {
  const { rand } = await import(new URL('./math.js', moduleURL));
  const source = () => ({ position: [0, 0], direction: [0, -1] });
  const burstOptions = { ...options, emissionFrame: source, intensity: [[0, 0], [1, 1]] };
  const baseline = createFlameEnsemble2D({ ...burstOptions, duration: 0 }).sample(.5);
  assert.equal(baseline.length, 104);
  for (const duration of [0, Number.MIN_VALUE, 1e-20, 1e-9]) {
    const samples = createFlameEnsemble2D({ ...burstOptions, duration }).sample(.5);
    assert.equal(samples.length, 104);
    const strengths = [];
    for (const s of samples) {
      const budget = { coarse: 32, fine: 48, sparks: 24 }[s.kind];
      const expected = (s.id % 1024 + rand(174, s.id, 1)) / budget;
      const strength = s.alpha / (Math.min(1, s.progress / .12) * Math.min(1, (1 - s.progress) / .4));
      assert.ok(Math.abs(strength - expected) < 1e-14);
      strengths.push(strength);
    }
    assert.ok(Math.max(...strengths) - Math.min(...strengths) > .9);
    if (duration <= 1e-20) assert.deepEqual(samples, baseline);
  }
});
