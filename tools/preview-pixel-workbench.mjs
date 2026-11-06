/** Deterministic authoring evidence, separate from the existing effect catalog.
 * Run after npm run build. No external images, generated art, antialiasing or resampling
 * enter the native studies; the 3x sheet repeats each native pixel exactly 3x3 times. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { hex } from '../build/core/color.js';
import { createPixelMaterial2D } from '../build/core/pixel-material.js';
import { exportPixelSurfaceMaps2D } from '../build/core/pixel-surface-maps.js';
import { createPixelPaletteRamp2D, extractPixelPalette2D, remapPixelPalette2D } from '../build/core/pixel-palette.js';
import { rasterizePixelBrush2D, rasterizePixelShape2D, paintPixelMask2D } from '../build/core/pixel-brush.js';
import { createPixelArtStudy2D } from '../build/examples/pixel-art-study.js';
import { canvas, upscale } from '../build-tools/tools/lib/fxlib.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'docs/previews/pixel-workbench');
mkdirSync(out, { recursive: true });
const W = 192, H = 112, SEED = 41, files = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hexString = color => '#' + [color & 255, color >>> 8 & 255, color >>> 16 & 255]
  .map(c => c.toString(16).padStart(2, '0')).join('');
const bytes = typed => new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
const rgba = sprite => {
  const data = new Uint8Array(sprite.w * sprite.h * 4);
  for (let i = 0; i < sprite.pixels.length; i++) {
    const c = sprite.mask.data[i] ? sprite.pixels[i] : 0;
    data.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24], i * 4);
  }
  return data;
};
const colors = sprite => [...new Set([...sprite.pixels].filter((c, i) => c >>> 24 && sprite.mask.data[i])
  .map(c => (c | 0xff000000) >>> 0))];
const alphaEqual = (a, b) => a.pixels.every((c, i) => (c >>> 24) === (b.pixels[i] >>> 24));
const maskEqual = (a, b) => a.mask.data.every((c, i) => c === b.mask.data[i]);
const changed = (a, b) => a.pixels.reduce((n, c, i) => n + Number(c !== b.pixels[i]), 0);
const union = (target, mask, source) => {
  for (let i = 0; i < target.length; i++) if (mask[i] && source.mask.data[i] && source.pixels[i] >>> 24) target[i] = 1;
};
function saveSprite(name, sprite) {
  const raw = rgba(sprite), png = encodePNG(sprite.w, sprite.h, raw);
  writeFileSync(join(out, name), png);
  files.push({ name, width: sprite.w, height: sprite.h, rgbaSHA256: hash(raw), pngSHA256: hash(png) });
}
function saveSheet(name, sheet) {
  const png = sheet.png(); writeFileSync(join(out, name), png);
  files.push({ name, width: sheet.w, height: sheet.h, rgbaSHA256: hash(sheet.data), pngSHA256: hash(png) });
}
function curve(a, b, c, d, count = 36) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, s = 1 - t;
    return { x: s ** 3 * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t ** 3 * d[0],
      y: s ** 3 * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t ** 3 * d[1] };
  });
}

// Study 1: an explicitly carved recess in the existing standalone boulder study.
// Both versions share silhouette, height, seed, material, light and the identical ramp.
const stoneStudy = createPixelArtStudy2D('boulder', SEED, true);
const stoneHeight = stoneStudy.height.slice();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (!stoneStudy.sprite.mask.data[i]) continue;
  const r = ((x + .5 - 97) / 32) ** 2 + ((y + .5 - 57) / 18) ** 2;
  const t = Math.max(0, Math.min(1, (1 - r) / .32));
  stoneHeight[i] -= 10 * t * t * (3 - 2 * t);
}
const stoneOptions = { kind: 'stone', seed: SEED, scale: 16, detail: .55, relief: 1.6, bevel: 4,
  roughness: .76, ambient: .3, light: [-.8, -.45, .55] };
const stoneOff = createPixelMaterial2D(stoneOptions).shade(stoneStudy.sprite, { height: stoneHeight });
const stoneOnOptions = { ...stoneOptions, ambientOcclusion: .85, occlusionRadius: 12, castShadow: 1, shadowDistance: 48 };
const stoneShader = createPixelMaterial2D(stoneOnOptions);
const stoneOn = stoneShader.shade(stoneStudy.sprite, { height: stoneHeight });
const maps = exportPixelSurfaceMaps2D(stoneOn, {
  normalConvention: 'opengl', heightRange: [0, 20],
  lighting: { light: stoneOptions.light, ambientOcclusion: 1, occlusionRadius: 12, castShadow: 1, shadowDistance: 48 },
});

// Study 2: a 32-step authored blue fabric ramp with three precise gold/cyan accent colors.
// Extraction excludes the protected embroidery and also locks those colors in the 12-color
// budget. The image is not rescaled, blurred, spatially cleaned or repainted after remapping.
const clothStudy = createPixelArtStudy2D('cloth', SEED, true);
const clothRamp = createPixelPaletteRamp2D({ shadow: '#0a1229', midtone: '#315978', highlight: '#b9dfd4', colors: 32, midpoint: .55 });
const clothOptions = { kind: 'fabric', seed: SEED, palette: clothRamp, scale: 12, detail: .7,
  relief: 1.4, bevel: 3, light: [-.7, -.75, .85], ambient: .2 };
let clothSource = createPixelMaterial2D(clothOptions).shade(clothStudy.sprite, { height: clothStudy.height });
const protectedMask = new Uint8Array(W * H), accentColors = ['#c89348', '#ffe1a0', '#86f6de'];
const embroider = (mask, color) => {
  union(protectedMask, mask, clothSource);
  clothSource = paintPixelMask2D(clothSource, mask, hex(color), { alphaLock: true });
};
embroider(rasterizePixelShape2D(W, H, 'ellipse', [80, 39], [111, 76], { size: 1 }), accentColors[0]);
embroider(rasterizePixelShape2D(W, H, 'ellipse', [84, 43], [107, 72], { size: 1 }), accentColors[1]);
for (const path of [
  curve([91, 56], [86, 39], [62, 36], [67, 49]).concat(curve([67, 49], [69, 59], [84, 65], [91, 56])),
  curve([91, 62], [82, 73], [74, 75], [77, 85]),
  curve([31, 28], [69, 16], [79, 35], [95, 30]),
  curve([38, 87], [62, 80], [81, 88], [95, 90]),
]) embroider(rasterizePixelBrush2D(W, H, path, { size: 1, pixelPerfect: true, symmetry: 'x' }), accentColors[0]);
embroider(rasterizePixelShape2D(W, H, 'ellipse', [91, 53], [100, 62], { filled: true }), accentColors[2]);
const reducedPalette = extractPixelPalette2D(clothSource, { colors: 12, locked: accentColors, protectedMask, iterations: 8 });
const clothReduced = remapPixelPalette2D(clothSource, reducedPalette, { protectedMask, dither: 'none' });

// Study 3: a rounded metal blank, then explicitly authored mirrored strokes. The common
// source is unchanged; the right image deliberately adds artwork rather than claiming
// that a diagnostic or a filter can infer an artist's ornament.
const plateMask = rasterizePixelShape2D(W, H, 'ellipse', [35, 13], [156, 98], { filled: true });
const plate = { w: W, h: H, pixels: Uint32Array.from(plateMask, v => v ? hex('#394d5d') : 0),
  mask: { w: W, h: H, data: plateMask } };
const plateHeight = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const u = (x - 95.5) / 61, v = (y - 55.5) / 43;
  plateHeight[y * W + x] = Math.sqrt(Math.max(0, 1 - u * u - v * v)) * 12;
}
const plateRamp = createPixelPaletteRamp2D({ shadow: '#101a2d', midtone: '#365d6d', highlight: '#d5e9d4', colors: 12 });
const plateOptions = { kind: 'metal', seed: SEED, palette: plateRamp, scale: 18, detail: .28,
  relief: 1, bevel: 3, roughness: .5, light: [-.6, -.8, .85], ambient: .22 };
const brushBase = createPixelMaterial2D(plateOptions).shade(plate, { height: plateHeight });
let brushDetail = brushBase;
const paintedMask = new Uint8Array(W * H), brushOperations = [];
function draw(mask, color, description) {
  union(paintedMask, mask, brushDetail);
  brushDetail = paintPixelMask2D(brushDetail, mask, hex(color), { alphaLock: true });
  brushOperations.push({ description, color, writtenCells: mask.reduce((n, v, i) => n + Number(v && brushBase.mask.data[i]), 0) });
}
const branches = [
  curve([88, 83], [57, 84], [41, 53], [55, 27]),
  curve([76, 77], [65, 76], [49, 68], [45, 55]),
  curve([67, 67], [57, 64], [47, 53], [47, 43]),
  curve([60, 54], [55, 46], [55, 35], [62, 29]),
];
for (const [index, path] of branches.entries()) {
  draw(rasterizePixelBrush2D(W, H, path, { size: 3, symmetry: 'x' }), '#805e3b', `Mirrored branch ${index + 1}, 3-cell underpaint`);
  draw(rasterizePixelBrush2D(W, H, path, { size: 1, symmetry: 'x', pixelPerfect: true }), '#f0c979', `Mirrored branch ${index + 1}, cleaned 1-cell highlight`);
}
draw(rasterizePixelShape2D(W, H, 'ellipse', [83, 27], [108, 68], { filled: true }), '#805e3b', 'Central gem surround');
draw(rasterizePixelShape2D(W, H, 'ellipse', [86, 30], [105, 65], { filled: true }), '#3c9b9d', 'Central gem body');
draw(rasterizePixelShape2D(W, H, 'ellipse', [90, 35], [101, 55], { filled: true }), '#9be6ce', 'Central gem highlight');
draw(rasterizePixelShape2D(W, H, 'ellipse', [83, 27], [108, 68], { size: 1 }), '#f0c979', 'One-cell gem rim');
draw(rasterizePixelBrush2D(W, H, curve([95, 70], [87, 74], [87, 80], [95, 88]), {
  size: 1, symmetry: 'x', pixelPerfect: true,
}), '#f0c979', 'Mirrored central flourish');

const cases = [
  { id: 'surface', title: '01. AUTHORED HEIGHT / SAME PALETTE', before: stoneOff, after: stoneOn,
    beforeLabel: 'LOCAL LIGHT ONLY', afterLabel: 'AO 0.85 + CAST SHADOW 1',
    beforePalette: stoneShader.options.palette, afterPalette: stoneShader.options.palette,
    note: 'SAME NATIVE SHAPE, HEIGHT, SEED AND LIGHT; ONLY VISIBILITY CHANGES.' },
  { id: 'palette', title: '02. PERCEPTUAL PALETTE / PROTECTED ACCENTS', before: clothSource, after: clothReduced,
    beforeLabel: `${colors(clothSource).length} INPUT COLORS`, afterLabel: `${colors(clothReduced).length} COLORS / ACCENTS RETAINED`,
    beforePalette: [...clothRamp, ...accentColors.map(hex)], afterPalette: reducedPalette,
    note: '12-COLOR BUDGET INCLUDING LOCKS. NO DITHER, RESIZE OR BLUR.' },
  { id: 'brush', title: '03. NATIVE BRUSH / AUTHORED MIRRORED DETAIL', before: brushBase, after: brushDetail,
    beforeLabel: 'COMMON METAL BASE', afterLabel: 'CURVES + 1-CELL DETAIL + X MIRROR',
    beforePalette: plateRamp, afterPalette: [...plateRamp, ...['#805e3b', '#f0c979', '#3c9b9d', '#9be6ce'].map(hex)],
    note: 'EXPLICIT ARTIST STROKES ON THE SAME BASE; ALPHA-LOCKED PAINT.' },
];
for (const c of cases) {
  saveSprite(`${c.id}-before-native.png`, c.before);
  saveSprite(`${c.id}-after-native.png`, c.after);
}
for (const name of ['normal', 'height', 'occlusion', 'shadow']) saveSprite(`surface-${name}-native.png`, maps[name]);

const BG = [11, 17, 24, 255], PANEL = [18, 26, 34, 255], LIGHT = [221, 233, 217], MUTED = [143, 162, 179], ACCENT = [197, 224, 162];
function swatches(sheet, palette, x, y, width, height) {
  for (let i = 0; i < palette.length; i++) {
    const left = Math.floor(i * width / palette.length), right = Math.floor((i + 1) * width / palette.length);
    const c = palette[i]; sheet.rect(x + left, y, Math.max(1, right - left - 1), height, [c & 255, c >>> 8 & 255, c >>> 16 & 255, 255]);
  }
}
function studySheet(scale) {
  const pad = scale === 1 ? 20 : 24, tw = W * scale, th = H * scale;
  const font = scale === 1 ? 1 : 2, head = scale === 1 ? 68 : 92, row = th + (scale === 1 ? 88 : 110);
  const sheet = canvas(tw * 2 + pad * 3, head + cases.length * row + 34, BG);
  sheet.text(`PIXEL WORKBENCH / ${scale === 1 ? 'NATIVE 1X' : 'NEAREST 3X'}`, pad, 18, 2, LIGHT, 'big');
  sheet.text('NEW AUTHORING STUDIES / EXISTING EFFECTS UNCHANGED', pad, 43, font, MUTED);
  for (const [index, c] of cases.entries()) {
    const top = head + index * row, imageY = top + (scale === 1 ? 34 : 42), second = tw + pad * 2;
    sheet.text(c.title, pad, top, font, ACCENT);
    sheet.text(c.beforeLabel, pad, top + (scale === 1 ? 17 : 22), font, MUTED);
    sheet.text(c.afterLabel, second, top + (scale === 1 ? 17 : 22), font, LIGHT);
    for (const [x, sprite] of [[pad, c.before], [second, c.after]]) {
      sheet.rect(x, imageY, tw, th, PANEL);
      sheet.paste(upscale(rgba(sprite), W, H, scale), tw, th, x, imageY);
    }
    swatches(sheet, c.beforePalette, pad, imageY + th + 9, tw, scale === 1 ? 7 : 11);
    swatches(sheet, c.afterPalette, second, imageY + th + 9, tw, scale === 1 ? 7 : 11);
    sheet.text(c.note, pad, imageY + th + (scale === 1 ? 27 : 34), font, MUTED);
  }
  sheet.text('COLOR COUNTS ARE BUDGETS, NOT ARTISTIC QUALITY SCORES.', pad, sheet.h - 24, font, MUTED);
  return sheet;
}
saveSheet('comparison-native.png', studySheet(1));
saveSheet('comparison-3x.png', studySheet(3));

function mapSheet(scale) {
  const pad = 20, tw = W * scale, th = H * scale, label = scale === 1 ? 22 : 30, font = scale === 1 ? 1 : 2;
  const sheet = canvas(tw * 2 + pad * 3, (th + label + pad) * 2 + 84, BG);
  sheet.text(`EXPLICIT SURFACE DATA / ${scale}X`, pad, 16, 2, LIGHT, 'big');
  sheet.text('SAME HEIGHT FIELD / RGB DOES NOT SUPPLY GEOMETRY', pad, 42, font, MUTED);
  for (const [i, [name, title]] of [['normal', 'NORMAL / OPENGL Y-UP'], ['height', 'HEIGHT / FIXED 0..20'],
    ['occlusion', 'AMBIENT VISIBILITY'], ['shadow', 'DIRECTIONAL VISIBILITY']].entries()) {
    const x = pad + (i % 2) * (tw + pad), y = 67 + Math.floor(i / 2) * (th + label + pad);
    sheet.text(title, x, y, font, ACCENT); sheet.rect(x, y + label, tw, th, PANEL);
    sheet.paste(upscale(rgba(maps[name]), W, H, scale), tw, th, x, y + label);
  }
  return sheet;
}
saveSheet('surface-maps-native.png', mapSheet(1));
saveSheet('surface-maps-3x.png', mapSheet(3));

const sourceFiles = [
  'tools/preview-pixel-workbench.mjs', 'src/core/pixel-material.ts', 'src/core/pixel-surface-maps.ts',
  'src/core/pixel-palette.ts', 'src/core/pixel-brush.ts', 'src/examples/pixel-art-study.ts',
  'build/core/pixel-material.js', 'build/core/pixel-surface-maps.js', 'build/core/pixel-palette.js',
  'build/core/pixel-brush.js', 'build/examples/pixel-art-study.js', 'build-tools/tools/lib/png.mjs',
];
let revision = null;
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const symmetry = paintedMask.every((value, i) => value === paintedMask[Math.floor(i / W) * W + W - 1 - i % W]);
const metadata = {
  schema: 'poku.pixel-workbench-evidence/v1', nativeSize: [W, H], seed: SEED,
  engineVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  nodeVersion: process.version, revisionAtGeneration: revision,
  scope: 'Deterministic standalone authoring studies; no existing effect is edited or presented as a before/after result.',
  interpretation: 'Palette reduction is a color-budget tradeoff. Brush detail is explicitly authored. Numeric preservation checks do not certify artistic quality.',
  resampling: { native: 1, enlarged: 3, method: 'exact nearest-neighbor pixel repetition; no antialiasing or blur' },
  sourceFiles: sourceFiles.map(path => ({ path, sha256: hash(readFileSync(join(root, path))) })),
  studies: {
    surface: {
      source: 'createPixelArtStudy2D(boulder, 41, true), with the explicit oval recess defined in this generator',
      sourceRGBA_SHA256: hash(rgba(stoneStudy.sprite)), authoredHeightSHA256: hash(bytes(stoneHeight)),
      before: createPixelMaterial2D(stoneOptions).options, after: stoneShader.options,
      changedColorCells: changed(stoneOff, stoneOn), sameAlpha: alphaEqual(stoneOff, stoneOn), sameSilhouette: maskEqual(stoneOff, stoneOn),
      sameHeights: stoneOff.channels.height.every((v, i) => v === stoneOn.channels.height[i]),
      sameNormals: stoneOff.channels.normal.every((v, i) => v === stoneOn.channels.normal[i]),
      palette: stoneShader.options.palette.map(hexString), heightMapRange: maps.heightRange, normalConvention: maps.normalConvention,
    },
    palette: {
      source: 'Standalone cloth study with a 32-step Oklch material ramp and explicitly authored embroidery',
      inputColors: colors(clothSource).length, outputColors: colors(clothReduced).length, requestedBudget: 12,
      dither: 'none', locked: accentColors, protectedCells: protectedMask.reduce((n, v) => n + v, 0),
      protectedPixelsUnchanged: clothSource.pixels.every((c, i) => !protectedMask[i] || c === clothReduced.pixels[i]),
      sameAlpha: alphaEqual(clothSource, clothReduced), sameSilhouette: maskEqual(clothSource, clothReduced),
      palette: reducedPalette.map(hexString),
    },
    brush: {
      source: 'One native elliptical metal blank; right image adds the exact stroke/shape instructions in this generator',
      operations: brushOperations, pixelPerfect: 'Enabled for 1-cell curves', symmetry: 'x about column 95.5',
      editedMaskIsSymmetric: symmetry, changedColorCells: changed(brushBase, brushDetail),
      sameAlpha: alphaEqual(brushBase, brushDetail), sameSilhouette: maskEqual(brushBase, brushDetail),
    },
  },
  files,
};
writeFileSync(join(out, 'evidence.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ output: relative(root, out), files: [...files.map(f => f.name), 'evidence.json'],
  preservation: { surfaceAlpha: metadata.studies.surface.sameAlpha, surfaceGeometry: metadata.studies.surface.sameHeights && metadata.studies.surface.sameNormals,
    paletteAccents: metadata.studies.palette.protectedPixelsUnchanged, brushSymmetry: symmetry }, artisticQualityCertified: false }, null, 2));
