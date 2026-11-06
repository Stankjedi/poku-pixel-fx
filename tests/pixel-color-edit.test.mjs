import test from 'node:test';
import assert from 'node:assert/strict';
import { hex } from '../build/core/color.js';
import {
  createPixelColorReplacer2D, replacePixelColors2D, createPixelRampMapper2D,
  mapPixelRamp2D, sortPixelColorsByLightness2D,
} from '../build/core/pixel-color-edit.js';

const color = value => hex(value) >>> 0;
const gray = value => (0xff000000 | value << 16 | value << 8 | value) >>> 0;
const withAlpha = (value, alpha) => ((color(value) & 0xffffff) | alpha << 24) >>> 0;
function sprite(w, h, values = color('#527382')) {
  const pixels = typeof values === 'number' ? new Uint32Array(w * h).fill(values) : Uint32Array.from(values);
  return { w, h, pixels, mask: { w, h, data: new Uint8Array(w * h).fill(1) } };
}
const rgb = value => value & 0xffffff;

test('exact replacement is simultaneous for swaps and longer cycles, preserving every alpha', () => {
  const red = '#c13b4b', green = '#3ca77d', blue = '#426dcd';
  const source = sprite(6, 1, [withAlpha(red, 1), withAlpha(green, 128), withAlpha(blue, 255),
    withAlpha(red, 47), withAlpha(green, 239), withAlpha(blue, 84)]);
  const before = structuredClone(source);
  const cycle = replacePixelColors2D(source, [{ from: red, to: green }, { from: green, to: blue }, { from: blue, to: red }]);
  assert.deepEqual([...cycle.pixels], [withAlpha(green, 1), withAlpha(blue, 128), withAlpha(red, 255),
    withAlpha(green, 47), withAlpha(blue, 239), withAlpha(red, 84)]);
  const swap = replacePixelColors2D(source, [{ from: red, to: green }, { from: green, to: red }]);
  assert.deepEqual([...swap.pixels], [withAlpha(green, 1), withAlpha(red, 128), withAlpha(blue, 255),
    withAlpha(green, 47), withAlpha(red, 239), withAlpha(blue, 84)]);
  assert.deepEqual(source, before);
});

test('replacement targets only exact RGB and retains hidden RGB, region exclusions, masks and geometry', () => {
  const source = sprite(8, 1, [color('#123456'), color('#123457'), withAlpha('#123456', 0), color('#123456'),
    color('#123456'), color('#123456'), withAlpha('#123456', 37), color('#9a9a9a')]);
  source.mask.data[3] = 0; source.mask.data[6] = 193;
  source.channels = { material: new Uint16Array(8).fill(7), height: new Float32Array(8).fill(4), normal: new Float32Array(24).fill(.5) };
  source.emission = new Float32Array(24).fill(1.8);
  source.sockets = { hand: { x: 2, y: 0 } };
  const selection = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1]), protectedMask = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0]);
  const before = structuredClone(source), result = replacePixelColors2D(source, [{ from: '#123456', to: '#fedcba' }], { selection, protectedMask });
  assert.equal(result.pixels[0], color('#fedcba')); assert.equal(result.pixels[6], withAlpha('#fedcba', 37));
  for (const i of [1, 2, 3, 4, 5, 7]) assert.equal(result.pixels[i], source.pixels[i]);
  assert.deepEqual(result.mask, source.mask); assert.notEqual(result.pixels, source.pixels); assert.notEqual(result.mask.data, source.mask.data);
  assert.equal(result.channels, source.channels); assert.equal(result.emission, source.emission); assert.equal(result.sockets, source.sockets);
  assert.deepEqual(source, before);
});

test('replacement compilers snapshot their input and expose immutable serializable options', () => {
  const input = [{ from: '#123', to: '#abc' }], mapper = createPixelColorReplacer2D(input), source = sprite(1, 1, color('#123'));
  input[0].from = '#456'; input[0].to = '#def'; input.push({ from: '#eee', to: '#222' });
  assert.equal(mapper.replace(source).pixels[0], color('#abc'));
  assert.deepEqual(mapper.options.replacements, [{ from: color('#123'), to: color('#abc') }]);
  assert.ok(Object.isFrozen(mapper.options)); assert.ok(Object.isFrozen(mapper.options.replacements)); assert.ok(Object.isFrozen(mapper.options.replacements[0]));
  assert.deepEqual(createPixelColorReplacer2D(JSON.parse(JSON.stringify(mapper.options)).replacements).replace(source), mapper.replace(source));
  const identity = replacePixelColors2D(source, []);
  assert.deepEqual(identity, source); assert.notEqual(identity.pixels, source.pixels);
});

test('linear ramp positions use integer pixel centers, exact endpoints and higher-index halfway ties', () => {
  const palette = ['#210b30', '#5656ab', '#f4dea5'];
  const result = mapPixelRamp2D(sprite(9, 1), palette, { mode: 'linear', start: [2, 0], end: [6, 0] });
  assert.deepEqual([...result.pixels], [0, 0, 0, 1, 1, 2, 2, 2, 2].map(i => color(palette[i])));
  const reverse = mapPixelRamp2D(sprite(9, 1), palette, { mode: 'linear', start: [6, 0], end: [2, 0] });
  assert.deepEqual([...reverse.pixels], [2, 2, 2, 2, 1, 1, 0, 0, 0].map(i => color(palette[i])));
});

test('diagonal linear mapping follows projection, not a bounding-box or row gradient', () => {
  const palette = ['#100', '#300', '#500', '#700', '#900'];
  const result = mapPixelRamp2D(sprite(3, 3), palette, { mode: 'linear', start: [0, 0], end: [2, 2] });
  // dot([x,y],[2,2])/8 * (5-1) = x+y.
  assert.deepEqual([...result.pixels], [0, 1, 2, 1, 2, 3, 2, 3, 4].map(i => color(palette[i])));
});

test('radial mapping has a true circular radius and keeps points outside the circle on the final color', () => {
  const palette = ['#10172a', '#81969c', '#fff0c4'];
  const result = mapPixelRamp2D(sprite(7, 7), palette, { mode: 'radial', start: [3, 3], end: [5, 3] });
  const at = (x, y) => result.pixels[y * 7 + x];
  assert.equal(at(3, 3), color(palette[0]));
  for (const [x, y] of [[2, 3], [4, 3], [3, 2], [3, 4], [2, 2], [4, 4]]) assert.equal(at(x, y), color(palette[1]));
  for (const [x, y] of [[1, 3], [5, 3], [3, 1], [3, 5], [0, 0], [6, 6]]) assert.equal(at(x, y), color(palette[2]));
});

test('value mapping uses perceptual lightness rather than byte average, with authored order retained', () => {
  // Neutral Oklab L is cbrt(linear sRGB). Byte 112 has L≈.546 (> .5), while 80 has L≈.431.
  const source = sprite(4, 1, [gray(0), gray(80), gray(112), gray(255)]);
  const palette = ['#ffeec4', '#19253b']; // Deliberately reversed: never silently reorder an authored ramp.
  assert.deepEqual([...mapPixelRamp2D(source, palette).pixels], [0, 0, 1, 1].map(i => color(palette[i])));
  const mapper = createPixelRampMapper2D(['#f00', '#0f0', '#00f']);
  const primaries = mapper.map(sprite(3, 1, ['#f00', '#0f0', '#00f'].map(color)));
  // Oklab L: red≈.628, green≈.866, blue≈.452. Three ramp samples are 0,.5,1.
  assert.deepEqual([...primaries.pixels], ['#0f0', '#00f', '#0f0'].map(color));
});

test('authored value range clamps before gamma and value mapping has no normalization dependence on the source image', () => {
  const palette = ['#1a2030', '#687f91', '#f1dfba'];
  const mapper = createPixelRampMapper2D(palette, { valueRange: [.25, .75], gamma: 1 });
  // gray 34≈L.252, 99≈L.5, 174≈L.75; range endpoints clamp black/white.
  const source = sprite(5, 1, [0, 34, 99, 174, 255].map(gray)), output = mapper.map(source);
  assert.deepEqual([...output.pixels], [0, 0, 1, 2, 2].map(i => color(palette[i])));
  const isolated = mapper.map(sprite(1, 1, gray(99)));
  assert.equal(isolated.pixels[0], output.pixels[2]);
  const linear = createPixelRampMapper2D(['#000', '#f00', '#fff'], { mode: 'linear', start: [0, 0], end: [4, 0], gamma: 2 });
  assert.deepEqual([...linear.map(sprite(5, 1)).pixels], [0, 0, 1, 1, 2].map(i => linear.palette[i]));
});

test('Bayer mapping selects only neighboring authored entries and exact endpoints never dither', () => {
  const palette = ['#14253f', '#776590', '#f7deb2'];
  // On columns 0..3, t=x/8; at x=2 the ramp position is .5 and one half of a 4px Bayer column is upper.
  const source = sprite(9, 8), options = { mode: 'linear', start: [0, 0], end: [8, 0], dither: 'bayer4' };
  const out = mapPixelRamp2D(source, palette, options);
  for (let y = 0; y < 8; y++) {
    assert.equal(out.pixels[y * 9], color(palette[0]));
    assert.equal(out.pixels[y * 9 + 4], color(palette[1]));
    assert.equal(out.pixels[y * 9 + 8], color(palette[2]));
    for (let x = 1; x < 4; x++) assert.ok([color(palette[0]), color(palette[1])].includes(out.pixels[y * 9 + x]));
    for (let x = 5; x < 8; x++) assert.ok([color(palette[1]), color(palette[2])].includes(out.pixels[y * 9 + x]));
  }
  assert.deepEqual(mapPixelRamp2D(source, palette, options).pixels, out.pixels);
});

test('full Bayer tiles reproduce authored ramp-index coverage without dithering alpha', () => {
  const palette = ['#183a5c', '#f7c8a0'];
  for (const [dither, size] of [['bayer4', 4], ['bayer8', 8]]) {
    // Value mode supplies a truly constant scalar across this full pattern tile.
    // gray 99≈L.500, range [.25,.75] -> t≈.500; exactly half either Bayer tile is upper.
    const source = sprite(size, size, withAlpha('#636363', 17));
    const out = mapPixelRamp2D(source, palette, { valueRange: [.25, .75], dither });
    assert.equal([...out.pixels].filter(c => rgb(c) === rgb(color(palette[1]))).length, size * size / 2);
    assert.ok([...out.pixels].every(c => c >>> 24 === 17));
  }
});

test('origin shifts Bayer phase only and crop-adjusted spatial endpoints reproduce the full native image', () => {
  const palette = ['#172b42', '#657c89', '#dfcdac'], w = 23, h = 17;
  const fullOptions = { mode: 'linear', start: [-2, 1], end: [25, 14], dither: 'bayer8', origin: [-11, 7] };
  const full = mapPixelRamp2D(sprite(w, h), palette, fullOptions), cropX = 5, cropY = 3, cw = 11, ch = 8;
  const cropped = mapPixelRamp2D(sprite(cw, ch), palette, { ...fullOptions,
    start: [fullOptions.start[0] - cropX, fullOptions.start[1] - cropY],
    end: [fullOptions.end[0] - cropX, fullOptions.end[1] - cropY],
    origin: [fullOptions.origin[0] + cropX, fullOptions.origin[1] + cropY] });
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
    assert.equal(cropped.pixels[y * cw + x], full.pixels[(y + cropY) * w + cropX + x]);
  const plain = { ...fullOptions, dither: 'none' };
  assert.deepEqual(mapPixelRamp2D(sprite(w, h), palette, plain), mapPixelRamp2D(sprite(w, h), palette, { ...plain, origin: [100, -200] }));
  const positioned = { ...sprite(w, h), x: 728.3, y: -92.8 };
  assert.deepEqual(mapPixelRamp2D(positioned, palette, fullOptions).pixels, full.pixels, 'sprite placement is not an authoring coordinate');
});

test('ramp editing preserves independent coverage and source geometry for every mode', () => {
  const source = sprite(8, 1, [withAlpha('#335577', 1), withAlpha('#446688', 127), withAlpha('#557799', 0),
    color('#6688aa'), color('#7799bb'), color('#88aacc'), withAlpha('#99bbdd', 237), color('#aaccee')]);
  source.mask.data[3] = 0; source.mask.data[6] = 153;
  source.channels = { height: new Float32Array(8).fill(9), normal: new Float32Array(24).fill(.3) };
  source.emission = new Float32Array(24).fill(2);
  const selected = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1]), protectedMask = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0]);
  const before = structuredClone(source);
  for (const mode of ['value', 'linear', 'radial']) {
    const out = mapPixelRamp2D(source, ['#19263f', '#edcc91'], { mode, end: [7, 0], dither: 'bayer8' }, { selection: selected, protectedMask });
    for (let i = 0; i < 8; i++) {
      assert.equal(out.pixels[i] >>> 24, source.pixels[i] >>> 24);
      if ([2, 3, 4, 5].includes(i)) assert.equal(out.pixels[i], source.pixels[i]);
      else assert.ok([rgb(color('#19263f')), rgb(color('#edcc91'))].includes(rgb(out.pixels[i])));
    }
    assert.deepEqual(out.mask, source.mask); assert.equal(out.channels, source.channels); assert.equal(out.emission, source.emission);
  }
  assert.deepEqual(source, before);
});

test('compiled ramps snapshot all arrays, preserve duplicate samples and serialize reproducibly', () => {
  const palette = ['#fff', '#333', '#333', '#000'], input = { mode: 'radial', start: [3, 2], end: [6, 2], origin: [-2, 3], valueRange: [.2, .8], gamma: 2, dither: 'bayer4' };
  const mapper = createPixelRampMapper2D(palette, input), source = sprite(9, 7), before = mapper.map(source);
  palette[0] = '#f00'; input.start[0] = 1; input.end[0] = 8; input.origin[1] = -7; input.valueRange[0] = 0; input.gamma = .5;
  assert.deepEqual(mapper.map(source), before);
  assert.deepEqual(mapper.palette, ['#fff', '#333', '#333', '#000'].map(color));
  for (const value of [mapper.options, mapper.options.palette, mapper.options.start, mapper.options.end, mapper.options.origin, mapper.options.valueRange]) assert.ok(Object.isFrozen(value));
  const reopened = JSON.parse(JSON.stringify(mapper.options));
  assert.deepEqual(createPixelRampMapper2D(reopened.palette, reopened).map(source), before);
  assert.ok([...mapPixelRamp2D(source, ['#246']).pixels].every(c => c === color('#246')));
});

test('value mapper output is independent of cache history after more than 8,192 distinct colors', () => {
  const palette = ['#18223d', '#47667c', '#b4b99a', '#f9e8be'];
  const colors = Array.from({ length: 9000 }, (_, i) => (0xff000000 | i) >>> 0), source = sprite(100, 90, colors);
  const mapper = createPixelRampMapper2D(palette, { dither: 'bayer8' }), first = mapper.map(source);
  mapper.map(sprite(100, 90, colors.map(c => (c ^ 0x00ffffff) >>> 0)));
  assert.deepEqual(mapper.map(source), first);
  assert.deepEqual(createPixelRampMapper2D(palette, { dither: 'bayer8' }).map(source), first);
});

test('explicit lightness sorting preserves colors, duplicate entries and the input palette', () => {
  const palette = ['#fff', '#999', '#000', '#999', '#333'], original = [...palette];
  assert.deepEqual(sortPixelColorsByLightness2D(palette), ['#000', '#333', '#999', '#999', '#fff'].map(color));
  assert.deepEqual(palette, original); assert.deepEqual(sortPixelColorsByLightness2D([]), []);
  assert.deepEqual(sortPixelColorsByLightness2D(['#f00', '#0f0', '#00f']), ['#00f', '#f00', '#0f0'].map(color));
});

test('invalid color mappings, sparse entries, duplicate sources and non-opaque edit colors are rejected', () => {
  for (const input of [null, {}, [null], new Array(1), [{ from: '#000', to: '#fff' }, { from: '#000000', to: '#111' }],
    [{ from: '#ggg', to: '#fff' }], [{ from: '#000', to: 0x00ffffff }], [{ from: 1.5, to: '#fff' }], [{ from: '#000', to: NaN }], new Array(4097)])
    assert.throws(() => createPixelColorReplacer2D(input), RangeError);
  for (const palette of [null, [], new Array(2), ['#0000'], [0x00ffffff], new Array(257).fill('#000')])
    assert.throws(() => createPixelRampMapper2D(palette), RangeError);
});

test('invalid spatial ranges, masks and raster buffers fail before producing a partial edit', () => {
  const source = sprite(2, 2), before = structuredClone(source), palette = ['#000', '#fff'];
  for (const options of [null, [], { mode: 'other' }, { mode: 'linear', start: [0, 0], end: [0, 0] },
    { mode: 'radial', start: [4, 2], end: [4, 2] }, { start: [.5, 0] }, { end: [0, Infinity] },
    { start: [1_048_577, 0] }, { origin: [-.5, 0] }, { origin: [0] }, { valueRange: [0, 0] },
    { valueRange: [-.1, 1] }, { valueRange: [0, 1.1] }, { valueRange: [NaN, 1] }, { valueRange: new Array(2) },
    { gamma: 0 }, { gamma: Infinity }, { gamma: 65 }, { dither: 'random' }])
    assert.throws(() => createPixelRampMapper2D(palette, options), RangeError);
  for (const region of [null, [], { selection: [1] }, { protectedMask: [1, 0, NaN, 0] }, { selection: new Array(4) }]) {
    assert.throws(() => replacePixelColors2D(source, [], region), RangeError);
    assert.throws(() => mapPixelRamp2D(source, palette, {}, region), RangeError);
  }
  for (const bad of [{ ...source, w: 0 }, { ...source, pixels: new Uint32Array(3) },
    { ...source, mask: { ...source.mask, w: 3 } }, { ...source, mask: { ...source.mask, data: [1, 1, 1, 1] } }])
    assert.throws(() => mapPixelRamp2D(bad, palette), RangeError);
  assert.deepEqual(source, before);
});
