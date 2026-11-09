import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { createFlameMatter2D } = await import(process.env.FLAME_MATTER_MODULE || '../build/core/flame-matter.js');
const palette = ['#601010', '#e53210', '#ff8a19', '#ffe368', '#fff7d9'];
const state = { id: 7, position: [0, 0], size: [12, 24], time: .37 };
const capture = (renderer, s = state) => {
  let call;
  renderer.draw({ shade(...args) { call = args; } }, s);
  return call;
};
const pixel = (call, x, y) => {
  const out = { c: 0, a: 1, l: 0, k: 0 };
  call[4](x, y, out);
  return out;
};
const raster = call => {
  const result = [];
  for (let y = -36; y <= 36; y++) for (let x = -36; x <= 36; x++) result.push(pixel(call, x, y));
  return result;
};
test('invalid options, sparse palettes and nonfinite or huge inputs fail explicitly', () => {
  for (const options of [null, [], {}, { palette: [] }, { palette: new Array(3) },
    { palette: ['#fff', , '#000'] }, { palette: ['bad'] }, { palette: [NaN] },
    { palette, seed: -1 }, { palette, seed: 2 ** 32 }, { palette, seed: .1 }]) {
    assert.throws(() => createFlameMatter2D(options), RangeError);
  }
  const r = createFlameMatter2D({ palette });
  for (const s of [null, [], { ...state, position: [, 0] }, { ...state, size: [1, ,] },
    ...['time', 'angle', 'flowAngle', 'opacity', 'burnout', 'id'].flatMap(k => [NaN, Infinity, 1e300].map(v => ({ ...state, [k]: v }))),
    { ...state, position: [1e7, 0] }, { ...state, size: [0, 1] }, { ...state, size: [129, 1] },
    { ...state, size: [.124, 1] }, { ...state, profile: 'bad' }, { ...state, id: -.1 },
    { ...state, opacity: -1 }, { ...state, burnout: -1 }]) assert.throws(() => capture(r, s), RangeError);
});
test('frozen API, empty terminal states, opaque palette snapshots and no light', () => {
  const input = [...palette];
  const r = createFlameMatter2D({ palette: input });
  assert.ok(Object.isFrozen(r));
  assert.equal(capture(r, { ...state, opacity: 0 }), undefined);
  assert.equal(capture(r, { ...state, burnout: 1 }), undefined);
  const before = raster(capture(r));
  input.fill('#000');
  assert.deepEqual(raster(capture(r)), before);
  assert.ok(before.some(p => p.c !== 0));
  for (const p of before) {
    assert.equal(p.k, 0); assert.equal(p.l, 0);
    if (p.c) { assert.equal(p.c >>> 24, 255); assert.equal(p.a, 1); }
  }
  assert.equal(pixel(capture(createFlameMatter2D({ palette: [0] })), 0, 0).c >>> 24, 255);
});
test('center is a guaranteed occupied birth point for both profiles at zero burnout', () => {
  for (const seed of [0, 1, 218, 0x80000000, 0xffffffff]) {
    const r = createFlameMatter2D({ seed, palette });
    for (const profile of ['mass', 'tongue']) for (let i = 0; i < 401; i++) {
      const s = { ...state, profile, time: -3600 + 18 * i, id: i * 1000003,
        angle: Math.sin(i) * 1e6, position: [1e6, -1e6], size: [.125, 128] };
      assert.notEqual(pixel(capture(r, s), ...s.position).c, 0);
    }
  }
});
test('full rotated AABB and bounded local support, including offscreen and extreme inputs', () => {
  const r = createFlameMatter2D({ palette });
  for (const angle of [0, .17, Math.PI / 4, Math.PI / 2, 1e6]) {
    const s = { ...state, angle, size: [128, 90], position: [-1e6, 1e6] };
    const c = capture(r, s), cs = Math.cos(angle), sn = Math.sin(angle);
    const ex = Math.abs(cs) * 128 + Math.abs(sn) * 90;
    const ey = Math.abs(sn) * 128 + Math.abs(cs) * 90;
    assert.deepEqual(c.slice(0, 4), [-1e6 - ex, 1e6 - ey, -1e6 + ex, 1e6 + ey]);
    for (const [x,y] of [[129,0],[-129,0],[0,91],[0,-91],[129,91]]) {
      assert.equal(pixel(c, s.position[0] + x * cs - y * sn, s.position[1] + x * sn + y * cs).c, 0);
    }
    for (const v of [NaN, Infinity, 1e300]) assert.equal(pixel(c, v, v).c, 0);
  }
});
test('seek independence and retained callback geometry survive mutable samples and nested draws', () => {
  const r = createFlameMatter2D({ palette, seed: 9 });
  const mutable = { ...state, position: [...state.position], size: [...state.size] };
  const first = capture(r, mutable), expected = raster(first);
  mutable.position[0] = 100; mutable.size[0] = 1; mutable.time = 3;
  capture(r, mutable);
  assert.deepEqual(raster(first), expected);
  for (const time of [3, -.4, 10, .37]) capture(r, { ...state, time });
  assert.deepEqual(raster(capture(r)), expected);
  let nested;
  r.draw({ shade(...args) { nested = args; capture(r, mutable); } }, state);
  assert.deepEqual(raster(nested), expected);
  assert.notDeepEqual(raster(capture(r, { ...state, time: .8 })), expected);
});
test('burnout consumes finite support and opacity is uniform, not implicit translucent light', () => {
  const r = createFlameMatter2D({ palette });
  const full = raster(capture(r)).filter(p => p.c).length;
  const dying = raster(capture(r, { ...state, burnout: .95, opacity: .4 })).filter(p => p.c);
  assert.ok(dying.length < full);
  for (const p of dying) assert.equal(p.a, .4);
});

test('upper-axis source has analytic positive margin and survives transformed samples', () => {
  // Independent worst-case interval proof; not an inference from the sample grid.
  const y = -.45;
  const maxBend = .12 * (.4 - y) + .10 * (.7 - .3 * y);
  const split = .167, offset = .035 + .16 * y * y;
  const maxCentralE = Math.max(Math.abs(-maxBend + offset), Math.abs(split + offset));
  const maxRightC = Math.max(Math.abs(split - .37 + .13 * y * y),
    Math.abs(maxBend - .27 + .13 * y * y));
  const noisePenalty = .15 + .065;
  const centralMargin = 1 - maxCentralE ** 2 / .11 - (y + .12) ** 2 / .48 - noisePenalty;
  const rightMargin = 1 - maxRightC ** 2 / .071 - .30 ** 2 / .30 - noisePenalty;
  assert.ok(centralMargin > .058, String(centralMargin));
  assert.ok(rightMargin > .045, String(rightMargin));
  for (const seed of [0, 1, 218, 0x80000000, 0xffffffff]) {
    const r = createFlameMatter2D({ seed, palette });
    for (const profile of ['tongue', 'mass']) for (let i = 0; i <= 400; i++) {
      const angle = Math.sin(i * 1.71) * 1e6;
      const s = { ...state, profile, angle, time: -3600 + i * 18, id: i * 1000003,
        position: [1e6, -1e6], size: i % 2 ? [.125, 128] : [128, .125] };
      const x = s.position[0] + Math.sin(angle) * .45 * s.size[1];
      const y = s.position[1] - Math.cos(angle) * .45 * s.size[1];
      assert.notEqual(pixel(capture(r, s), x, y).c, 0);
    }
  }
});

test('flow angle defaults exactly to geometry angle and independently changes rotated material', () => {
  const r = createFlameMatter2D({ palette, seed: 218 });
  for (const angle of [0, .37, Math.PI / 2, Math.PI, -1e6, 1e6]) {
    const s = { ...state, angle };
    assert.deepEqual(raster(capture(r, s)), raster(capture(r, { ...s, flowAngle: angle })));
  }
  const rotated = { ...state, angle: Math.PI / 2, time: .71 };
  const local = capture(r, rotated), world = capture(r, { ...rotated, flowAngle: 0 });
  assert.deepEqual(local.slice(0, 4), world.slice(0, 4));
  assert.notDeepEqual(raster(local), raster(world));
  for (const flowAngle of [-1e6 - 1, 1e6 + 1, null, '0']) {
    assert.throws(() => capture(r, { ...state, flowAngle }), RangeError);
  }
  // The analytic occupancy proof uses only bounded noise, so remains valid for
  // arbitrary independent flow direction. Exercise transformed source points too.
  for (const profile of ['tongue', 'mass']) for (let i = 0; i < 301; i++) {
    const angle = Math.sin(i) * 1e6;
    const s = { ...state, profile, angle, flowAngle: Math.cos(i * 3) * 1e6,
      time: -3600 + 24 * i, id: i * 1000003 };
    const c = capture(r, s);
    assert.notEqual(pixel(c, 0, 0).c, 0);
    assert.notEqual(pixel(c, Math.sin(angle) * .45 * s.size[1], -Math.cos(angle) * .45 * s.size[1]).c, 0);
  }
});

test('actual noise coordinates cancel effect-local displacement after rotation, aspect and shrink', async () => {
  const moduleURL = new URL(process.env.FLAME_MATTER_MODULE || '../build/core/flame-matter.js', import.meta.url);
  let code = await readFile(moduleURL, 'utf8');
  // Instrument only the imported noise function; execute the actual compiled shader.
  // This checks its coordinates, independently of changing silhouette/heat or palette quantization.
  assert.match(code, /\bnoise2\s*}/);
  code = code.replace(/\bnoise2\s*}/, 'noise2 as originalNoise2 }')
    .replace(/from (['"])(\.\/[^'"]+)\1/g, (_, quote, path) => `from ${quote}${new URL(path, moduleURL).href}${quote}`);
  code += '\nexport const noiseCalls = [];\nfunction noise2(...args) { noiseCalls.push(args); return originalNoise2(...args); }';
  const instrumented = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const r = instrumented.createFlameMatter2D({ palette, seed: 218 });
  const calls = instrumented.noiseCalls;
  const dt = .001;
  for (const size of [[5, 29], [31, 3], [.125, 128]])
    for (const angle of [.37, 1.2, -2.4]) for (const flowAngle of [0, .71, -1.3])
      for (const burnout of [0, .7]) {
        const s = { ...state, size, angle, flowAngle, burnout, time: .13 };
        calls.length = 0;
        pixel(capture(r, s), 0, 0);
        assert.equal(calls.length, 2);
        const baseline = calls.map(c => [...c]);
        for (const [field, speed] of [[0, 1], [1, 1.63]]) {
          const distance = dt * 2.9 * Math.min(...size) * speed;
          const worldX = Math.sin(flowAngle) * distance;
          const worldY = -Math.cos(flowAngle) * distance;
          calls.length = 0;
          pixel(capture(r, { ...s, time: s.time + dt }), worldX, worldY);
          assert.equal(calls.length, 2);
          for (let axis = 0; axis < 2; axis++) {
            assert.ok(Math.abs(calls[field][axis] - baseline[field][axis]) < 1e-10,
              JSON.stringify({ size, angle, flowAngle, burnout, field, axis, actual: calls[field], baseline: baseline[field] }));
          }
          assert.equal(calls[field][2], baseline[field][2]);
        }
      }
});

test('burnout narrows only traversal and preserves actual Painter RGBA/light/HDR buffers', async () => {
  const moduleURL = new URL(process.env.FLAME_MATTER_MODULE || '../build/core/flame-matter.js', import.meta.url);
  const { Painter } = await import(new URL('./painter.js', moduleURL));
  const r = createFlameMatter2D({ seed: 218, palette });
  let cases = 0;
  for (const size of [[.125, .125], [.125, 128], [128, .125], [128, 128], [7, 19]])
    for (const angle of [0, .37, Math.PI / 2, 1e6])
      for (const burnout of [0, 1e-14, .25, .7, .999999])
        for (const mode of ['coverage', 'dither']) {
          const s = { ...state, size, angle, burnout, opacity: .43, flowAngle: -.73,
            profile: cases % 2 ? 'mass' : 'tongue' };
          const call = capture(r, s), cs = Math.cos(angle), sn = Math.sin(angle);
          const ex = Math.abs(cs) * size[0] + Math.abs(sn) * size[1];
          const ey = Math.abs(sn) * size[0] + Math.abs(cs) * size[1];
          assert.ok(call[0] >= -ex && call[1] >= -ey && call[2] <= ex && call[3] <= ey);
          if (burnout >= .25) assert.ok(call[2] < ex && call[3] < ey);
          const frame = () => ({ w: 96, h: 96, ox: -48, oy: -48, alphaMode: mode,
            color: new Uint32Array(96 * 96).fill(0x80603010),
            light: new Uint32Array(96 * 96).fill(0xff123456),
            hdrLight: new Float32Array(96 * 96 * 3).fill(.375) });
          const a = frame(), b = frame();
          const setup = f => new Painter(f).place(.17, -.31, cases % 3 === 0, cases % 2 ? .71 : 0);
          // The full legacy box runs the very same retained shader. Empty skipped
          // samples must not affect coverage, dither, existing light or HDR.
          setup(a).shade(-ex, -ey, ex, ey, call[4]);
          setup(b).shade(...call);
          for (const key of ['color', 'light', 'hdrLight']) assert.deepEqual(b[key], a[key], `${cases}:${key}`);
          cases++;
        }
  assert.equal(cases, 200);
});
