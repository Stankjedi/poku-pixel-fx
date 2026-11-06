/** Standalone native authoring studies; does not modify the FX catalog or renderer defaults.
 * Run after npm run build. All pixels come from authored paths/height and the real core APIs.
 * The large comparison uses exact 3x pixel repetition, never interpolated image enlargement. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { hex } from '../build/core/color.js';
import { rasterizePixelContour2D } from '../build/core/pixel-contour.js';
import { rasterizePixelBrush2D, rasterizePixelShape2D } from '../build/core/pixel-brush.js';
import { createMaterialChannels2D } from '../build/core/material-surface.js';
import { createPixelMaterial2D } from '../build/core/pixel-material.js';
import { createPixelRelighter2D } from '../build/core/pixel-relight.js';
import { extractPixelAnimationPalette2D, createPixelPaletteMapper2D, createPixelPaletteRamp2D } from '../build/core/pixel-palette.js';
import { canvas, upscale } from '../build-tools/tools/lib/fxlib.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'docs/previews/pixel-art-pro');
mkdirSync(out, { recursive: true });
const W = 224, H = 160, SEED = 41, files = [];
const pack = c => hex(c) >>> 0, clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const digest = data => createHash('sha256').update(data).digest('hex');
const rgba = sprite => {
  const data = new Uint8Array(sprite.w * sprite.h * 4);
  for (let i = 0; i < sprite.pixels.length; i++) {
    const c = sprite.mask.data[i] ? sprite.pixels[i] : 0;
    data.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24], i * 4);
  }
  return data;
};
const countColors = sprite => new Set([...sprite.pixels].filter((c, i) => c >>> 24 && sprite.mask.data[i]).map(c => c & 0xffffff)).size;
const sameCoverage = (a, b) => a.pixels.every((c, i) => c >>> 24 === b.pixels[i] >>> 24 && a.mask.data[i] === b.mask.data[i]);
function save(name, sprite) {
  const data = rgba(sprite), png = encodePNG(sprite.w, sprite.h, data);
  writeFileSync(join(out, name), png);
  files.push({ name, width: sprite.w, height: sprite.h, rgbaSHA256: digest(data), pngSHA256: digest(png) });
}
function saveCanvas(name, image) {
  const png = image.png(); writeFileSync(join(out, name), png);
  files.push({ name, width: image.w, height: image.h, rgbaSHA256: digest(image.data), pngSHA256: digest(png) });
}
function curve(a, b, c, d, count = 50) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, s = 1 - t;
    return { x: a[0] * s ** 3 + b[0] * 3 * s * s * t + c[0] * 3 * s * t * t + d[0] * t ** 3,
      y: a[1] * s ** 3 + b[1] * 3 * s * s * t + c[1] * 3 * s * t * t + d[1] * t ** 3 };
  });
}

// A silk standard with a raised enamel-and-bronze heraldic clasp. Color is authored separately
// from height: the plain albedo is not an image whose brightness was turned into geometry.
function heraldry(scale = 1, phase = 0) {
  const w = W * scale, h = H * scale, n = w * h, pixels = new Uint32Array(n), data = new Uint8Array(n);
  const heights = new Float32Array(n), materials = new Uint16Array(n);
  const satin = ['#132840', '#1b3954', '#244e6b', '#336680', '#4c8095', '#76a4af'].map(pack);
  const bronze = ['#654133', '#885938', '#aa754a', '#c8955e', '#e4b97b', '#f4d9a3'].map(pack);
  const enamel = ['#102e3b', '#144759', '#1e6272', '#2b7d88', '#4b9e9e', '#7abbbb'].map(pack);
  const gem = ['#124451', '#1c6670', '#278e91', '#49b9b3', '#86d9c6', '#c8f0da'].map(pack);
  const contour = (commands, inset = 1) => rasterizePixelContour2D(w, h, commands.map(command => {
    const c = { ...command };
    for (const key of ['to', 'control', 'control1', 'control2']) if (command[key])
      c[key] = [(112 + (command[key][0] - 112) * inset) * scale, (79 + (command[key][1] - 79) * inset) * scale];
    return c;
  })).data;
  function fill(mask, id, sample) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const [color, height] = sample((x + .5) / scale, (y + .5) / scale);
      pixels[i] = color; data[i] = 1; heights[i] = height * scale; materials[i] = id;
    }
  }
  const clothPath = [
    { kind: 'move', to: [23, 25] }, { kind: 'cubic', control1: [79, 7], control2: [139, 35], to: [200, 17] },
    { kind: 'quadratic', control: [188, 79], to: [191, 139] },
    { kind: 'cubic', control1: [148, 150], control2: [89, 125 + phase * 2], to: [33, 147] },
    { kind: 'cubic', control1: [36, 106], control2: [26, 64], to: [23, 25] }, { kind: 'close' },
  ];
  const clothMask = contour(clothPath);
  fill(clothMask, 1, (x, y) => {
    const fold = Math.sin(x / 11 + Math.sin(y / 37) * .65 + phase * .28);
    const weave = ((Math.floor(x) + Math.floor(y)) % 5 === 0 ? 1 : 0) * .055;
    const tone = .42 + .14 * Math.sin(x / 28 + y / 37) + .075 * Math.sin(y / 8 + x / 27) + weave;
    return [satin[Math.floor(clamp(tone) * (satin.length - 1))], 6 + 5.2 * fold + .6 * Math.cos((x + y) / 32)];
  });
  const shield = [
    { kind: 'move', to: [112, 18] }, { kind: 'cubic', control1: [135, 18], control2: [159, 29], to: [168, 45] },
    { kind: 'line', to: [162, 92] }, { kind: 'cubic', control1: [157, 119], control2: [131, 135], to: [112, 144] },
    { kind: 'cubic', control1: [93, 135], control2: [67, 119], to: [62, 92] },
    { kind: 'line', to: [56, 45] }, { kind: 'cubic', control1: [65, 29], control2: [89, 18], to: [112, 18] }, { kind: 'close' },
  ];
  const plateHeight = (x, y) => 12 + 5 * Math.sqrt(Math.max(0, 1 - ((x - 112) / 61) ** 2 - ((y - 79) / 77) ** 2));
  fill(contour(shield), 2, (x, y) => [bronze[Math.floor(clamp(.46 + .17 * Math.cos((x - 112) / 11) + .08 * Math.sin(y / 13)) * 5)], plateHeight(x, y)]);
  fill(contour(shield, .93), 2, (x, y) => [bronze[1], plateHeight(x, y) + .3]);
  fill(contour(shield, .895), 2, (x, y) => [bronze[4], plateHeight(x, y) + .8]);
  fill(contour(shield, .855), 3, (x, y) => {
    const dx = x - 112, dy = y - 79, angle = Math.atan2(dy, dx), r = Math.hypot(dx / 47, dy / 56);
    const tone = .39 + .14 * Math.cos(r * 12 + Math.sin(angle * 3) * .4) + .04 * Math.sin(angle * 11);
    return [enamel[Math.floor(clamp(tone) * 5)], plateHeight(x, y) + 1.4];
  });
  function stroke(points, color, diameter, id, raise = .5, allowed = undefined) {
    const size = Math.max(1, Math.round(diameter * scale));
    const mask = rasterizePixelBrush2D(w, h, points.map(p => ({ x: p.x * scale, y: p.y * scale })), { size, pixelPerfect: size === 1 });
    for (let i = 0; i < n; i++) if (mask[i] && data[i] && (!allowed || allowed.includes(materials[i]))) {
      pixels[i] = pack(color); materials[i] = id; heights[i] += raise * scale;
    }
  }
  for (const side of [-1, 1]) {
    const mirror = points => points.map(p => ({ x: 112 + (p.x - 112) * side, y: p.y }));
    const branches = [
      curve([106, 123], [81, 124], [69, 95], [80, 62]),
      curve([84, 100], [71, 94], [75, 78], [91, 76]),
      curve([80, 84], [76, 70], [85, 51], [97, 43]),
      curve([89, 112], [95, 108], [92, 98], [84, 95]),
      curve([81, 67], [70, 64], [75, 48], [89, 45]),
    ];
    for (const path of branches) {
      stroke(mirror(path), '#70503b', 3, 2, .35);
      stroke(mirror(path), '#ddb47a', 1, 2, .6);
    }
    for (let k = 0; k < 4; k++) {
      const x = 87 + k * 3, y = 108 - k * 17;
      const leaf = curve([x, y], [x - 10, y - 11], [x - 15, y - 7], [x - 8, y + 2])
        .concat(curve([x - 8, y + 2], [x - 5, y + 5], [x - 1, y + 1], [x, y]));
      stroke(mirror(leaf), '#bf8c54', 2, 2, .45);
      stroke(mirror(curve([x - 8, y - 4], [x - 5, y - 2], [x - 3, y - 1], [x, y])), '#edc88e', 1, 2, .45);
    }
  }
  const jewel = [
    { kind: 'move', to: [112, 43] }, { kind: 'cubic', control1: [127, 55], control2: [133, 75], to: [127, 90] },
    { kind: 'quadratic', control: [120, 104], to: [112, 111] },
    { kind: 'quadratic', control: [103, 104], to: [97, 90] },
    { kind: 'cubic', control1: [91, 75], control2: [97, 55], to: [112, 43] }, { kind: 'close' },
  ];
  fill(contour(jewel, 1.13), 2, (x, y) => [bronze[3], plateHeight(x, y) + 2]);
  fill(contour(jewel), 4, (x, y) => {
    const u = (x - 112) / 19, v = (y - 79) / 35, body = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const vein = Math.max(0, 1 - Math.abs(x - 109 - 2.5 * Math.sin(y / 11)) / 2);
    return [gem[Math.floor(clamp(.33 + .27 * body + .15 * vein + .035 * Math.sin(y / 7)) * 5)], 18 + 14 * body];
  });
  stroke(curve([109, 52], [101, 63], [99, 78], [105, 87]), '#9ae8d1', 1, 4, .15, [4]);
  for (const path of [curve([34, 30], [87, 16], [140, 42], [190, 27]), curve([42, 136], [88, 122], [147, 145], [180, 131])]) {
    stroke(path, '#a47b4e', 3, 2, .2, [1]); stroke(path, '#e4b97b', 1, 2, .2, [1, 2]);
  }
  // Fine stitch groups are placed on the cloth border, not used as a substitute for material form.
  for (let k = 0; k < 14; k++) {
    const x = 41 + k * 10, y = 134 + 3 * Math.sin(k * .57);
    stroke([{ x, y }, { x: x + 1.8, y: y - 3 }], '#b88f5e', 1, 2, .15, [1]);
  }
  const channels = createMaterialChannels2D(w, h, { height: heights, material: materials });
  return { w, h, pixels, mask: { w, h, data }, channels };
}

const key = { direction: [-.8, -.65, 1], color: '#ffe5ba', intensity: 1.15, castShadow: .8, shadowDistance: 40 };
const fill = { direction: [.8, .15, .65], color: '#8ac3ef', intensity: .42 };
const lightOptions = { lights: [key, fill], ambient: .3, ambientColor: '#c8d9e9', diffuseBands: 12,
  ambientOcclusion: .55, occlusionRadius: 10, strength: 1 };
function illuminate(source, options = lightOptions) {
  let result = source;
  for (const [id, roughness, specular] of [[1, .9, .015], [2, .35, .3], [3, .55, .1], [4, .2, .4]]) {
    const selection = Uint8Array.from(source.channels.material, material => material === id ? 1 : 0);
    result = createPixelRelighter2D({ ...options, roughness, specular }).shade(result, { selection });
  }
  return result;
}
const albedo = heraldry(), relit = illuminate(albedo);
const otherLight = illuminate(albedo, { ...lightOptions,
  lights: [{ ...key, direction: [.8, -.4, 1], color: '#e0edff' }, { ...fill, direction: [-.7, .1, .7], color: '#ffc77d' }] });
save('relight-albedo-native.png', albedo); save('relight-warm-native.png', relit); save('relight-cool-native.png', otherLight);

// Same wood recipe, once as an open field and once as a periodic field. Repetition makes
// the boundary behavior visible; these are two authoring modes, not an imported-image repair.
const tw = W / 2, th = H / 2, tileSource = { w: tw, h: th, pixels: new Uint32Array(tw * th).fill(pack('#a77a4d')),
  mask: { w: tw, h: th, data: new Uint8Array(tw * th).fill(1) } };
const woodPalette = createPixelPaletteRamp2D({ shadow: '#22242c', midtone: '#8f674e', highlight: '#edd0a1', colors: 16 });
const woodOptions = { kind: 'wood', palette: woodPalette, seed: SEED, scale: 24, detail: .68, relief: 1.5,
  bevel: 0, grainAngle: .11, ambient: .24, roughness: .73, light: [-.6, -.2, 1], ambientOcclusion: .25, castShadow: .3 };
const tileOpen = createPixelMaterial2D(woodOptions).shade(tileSource);
const tile = createPixelMaterial2D({ ...woodOptions, tileSize: [tw, th] }).shade(tileSource);
function tiled(source, columns = 2, rows = 2) {
  const w = source.w * columns, h = source.h * rows, pixels = new Uint32Array(w * h), data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = (y % source.h) * source.w + x % source.w;
    pixels[i] = source.pixels[j]; data[i] = source.mask.data[j];
  }
  return { w, h, pixels, mask: { w, h, data } };
}
const openRepeated = tiled(tileOpen), tileRepeated = tiled(tile);
save('tile-open-native.png', tileOpen); save('tile-seamless-native.png', tile);
save('tile-open-repeat-native.png', openRepeated); save('tile-seamless-repeat-native.png', tileRepeated);
save('tile-seamless-3x3-native.png', tiled(tile, 3, 3));

// Four distinct authored cloth phases share one fitted color budget. Each sprite is rasterized
// at its own native 112x80 resolution, not obtained by shrinking the larger study.
const durations = [.10, .16, .12, .18];
const frames = durations.map((duration, i) => ({ sprite: illuminate(heraldry(.5, i * .8), {
  ...lightOptions, ambientOcclusion: .3, occlusionRadius: 5,
  lights: [{ ...key, shadowDistance: 20 }, fill],
}), duration }));
const palette = extractPixelAnimationPalette2D(frames, { colors: 24, weighting: 'duration', iterations: 8,
  locked: ['#122539', '#ffe4ac', '#8ad6c2'] });
const mapper = createPixelPaletteMapper2D(palette), reduced = frames.map(frame => mapper.remap(frame.sprite));
function cels(sprites) {
  const pixels = new Uint32Array(W * H), data = new Uint8Array(W * H);
  sprites.forEach((sprite, frame) => {
    const ox = frame % 2 * sprite.w, oy = Math.floor(frame / 2) * sprite.h;
    for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
      const from = y * sprite.w + x, to = (y + oy) * W + x + ox;
      pixels[to] = sprite.pixels[from]; data[to] = sprite.mask.data[from];
    }
  });
  return { w: W, h: H, pixels, mask: { w: W, h: H, data } };
}
const originalCels = cels(frames.map(frame => frame.sprite)), sharedCels = cels(reduced);
save('animation-source-native.png', originalCels); save('animation-shared-native.png', sharedCels);
reduced.forEach((sprite, i) => save(`animation-cel-${i}-native.png`, sprite));

const studies = [
  { title: '01 / AUTHORED COLOR + FORM', before: albedo, after: relit,
    left: 'PAINTED ALBEDO / SAME HEIGHT', right: 'WARM KEY + COOL FILL / 4 MATERIALS',
    note: 'CURVED SHAPES, SILK FOLDS, ENAMEL, RAISED FILIGREE. NO RGB-TO-DEPTH.' },
  { title: '02 / REPEATING MATERIAL FIELD', before: openRepeated, after: tileRepeated,
    left: 'OPEN WOOD FIELD / 2 X 2', right: 'PERIODIC HEIGHT + LIGHT / 2 X 2',
    note: 'SAME WOOD RECIPE. PERIODIC STRUCTURE AND WRAPPED VISIBILITY; NO BORDER COPY.' },
  { title: '03 / ONE PALETTE FOR EVERY CEL', before: originalCels, after: sharedCels,
    left: `${countColors(originalCels)} SOURCE COLORS / 4 CELS`, right: '24 SHARED COLORS / ALPHA UNCHANGED',
    note: 'DURATION-WEIGHTED SHARED PALETTE. EACH CEL KEEPS ITS OWN NATIVE SHAPE.' },
];
function comparison(scale) {
  const pad = 24, imageW = W * scale, imageH = H * scale, font = scale === 1 ? 1 : 2;
  const header = scale === 1 ? 68 : 92, rowH = imageH + (scale === 1 ? 79 : 112);
  const sheet = canvas(imageW * 2 + pad * 3, header + rowH * studies.length + 30, [10, 16, 23, 255]);
  sheet.text(`PIXEL ART PRO / ${scale === 1 ? 'NATIVE 1X' : 'NEAREST 3X'}`, pad, 18, 2, [224, 233, 220], 'big');
  sheet.text('NATIVE ENGINE OUTPUT / EXPLICIT ARTWORK / EXISTING EFFECTS PRESERVED', pad, 43, font, [140, 162, 180]);
  studies.forEach((study, i) => {
    const top = header + i * rowH, labelH = scale === 1 ? 34 : 45, second = pad * 2 + imageW;
    sheet.text(study.title, pad, top, font, [210, 193, 145]);
    sheet.text(study.left, pad, top + (scale === 1 ? 16 : 22), font, [147, 169, 184]);
    sheet.text(study.right, second, top + (scale === 1 ? 16 : 22), font, [211, 225, 214]);
    for (const [x, sprite] of [[pad, study.before], [second, study.after]]) {
      sheet.rect(x, top + labelH, imageW, imageH, [18, 27, 36, 255]);
      sheet.paste(upscale(rgba(sprite), W, H, scale), imageW, imageH, x, top + labelH);
    }
    sheet.text(study.note, pad, top + labelH + imageH + (scale === 1 ? 12 : 19), font, [132, 153, 171]);
  });
  sheet.text('AUTHORING STUDIES / NO BLUR, GENERATED IMAGERY OR AESTHETIC CERTIFICATION', pad, sheet.h - 21, font, [132, 153, 171]);
  return sheet;
}
saveCanvas('comparison-native.png', comparison(1)); saveCanvas('comparison-3x.png', comparison(3));
const sourcePaths = ['tools/preview-pixel-art-pro.mjs', 'src/core/pixel-relight.ts', 'src/core/pixel-material.ts',
  'src/core/pixel-surface-maps.ts', 'src/core/pixel-palette.ts'];
const metadata = {
  schema: 'poku.pixel-art-pro-evidence/v1', nativeSize: [W, H], seed: SEED,
  scope: 'New standalone authoring studies; no pre-existing effect artwork is edited.',
  technique: 'Native contour masks, explicit material/color groups, height, curves and fine pixel strokes; exact 3x nearest enlargement.',
  relighting: { options: lightOptions, materialResponses: ['silk', 'bronze', 'enamel', 'gem'],
    unchangedCoverage: sameCoverage(albedo, relit), sourceColors: countColors(albedo), outputColors: countColors(relit),
    sameGeometryReference: albedo.channels === relit.channels },
  tile: { size: [tw, th], options: createPixelMaterial2D({ ...woodOptions, tileSize: [tw, th] }).options,
    unchangedCoverage: sameCoverage(tileOpen, tile), comparison: 'Open versus periodic procedural authoring modes, not an image seam repair.' },
  animation: { durationSeconds: durations, weighting: 'duration', requestedColors: 24, palette,
    outputColors: countColors(sharedCels), unchangedCoverage: frames.every((frame, i) => sameCoverage(frame.sprite, reduced[i])) },
  visualReview: { status: 'pending native-size visual inspection', artisticQualityCertified: false },
  sourceFiles: sourcePaths.map(path => ({ path, sha256: digest(readFileSync(join(root, path))) })), files,
};
writeFileSync(join(out, 'evidence.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ output: out, files: files.map(file => file.name),
  preserved: { relightCoverage: metadata.relighting.unchangedCoverage, relightGeometry: metadata.relighting.sameGeometryReference,
    tileCoverage: metadata.tile.unchangedCoverage, animationCoverage: metadata.animation.unchangedCoverage },
  animationColors: metadata.animation.outputColors }, null, 2));
