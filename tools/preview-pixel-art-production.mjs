/** Deterministic native color-edit evidence. Run after npm run build.
 * The source is a standalone authoring study, never an existing catalog effect.
 * All images are actual core API output. The 3x sheet repeats native pixels exactly. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { hex, toHex } from '../build/core/color.js';
import { createPixelArtStudy2D } from '../build/examples/pixel-art-study.js';
import { createPixelMaterial2D } from '../build/core/pixel-material.js';
import { createPixelPaletteRamp2D } from '../build/core/pixel-palette.js';
import { createPixelColorReplacer2D, createPixelRampMapper2D } from '../build/core/pixel-color-edit.js';
import { rasterizePixelContour2D } from '../build/core/pixel-contour.js';
import { rasterizePixelBrush2D, paintPixelMask2D } from '../build/core/pixel-brush.js';
import { createMaterialChannels2D } from '../build/core/material-surface.js';
import { createPixelArtDocument2D, writePixelArtPaintLayer2D, serializePixelArtDocument2D, renderPixelArtDocument2D } from '../build/authoring/pixel-art-document.js';
import { canvas, upscale } from '../build-tools/tools/lib/fxlib.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'docs/previews/pixel-art-production');
mkdirSync(out, { recursive: true });
const W = 192, H = 112, SEED = 41, files = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = typed => new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
const rgba = sprite => {
  const data = new Uint8Array(sprite.w * sprite.h * 4);
  for (let i = 0; i < sprite.pixels.length; i++) {
    const c = sprite.pixels[i];
    data.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, sprite.mask.data[i] ? c >>> 24 : 0], i * 4);
  }
  return data;
};
function saveSprite(name, sprite) {
  const data = rgba(sprite), png = encodePNG(sprite.w, sprite.h, data);
  writeFileSync(join(out, name), png);
  files.push({ name, width: sprite.w, height: sprite.h, rgbaSHA256: hash(data), fileSHA256: hash(png) });
}
function saveSheet(name, image) {
  const png = image.png(); writeFileSync(join(out, name), png);
  files.push({ name, width: image.w, height: image.h, rgbaSHA256: hash(image.data), fileSHA256: hash(png) });
}
function saveJSON(name, value) {
  const json = typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(join(out, name), json); files.push({ name, bytes: Buffer.byteLength(json), fileSHA256: hash(json) });
}
const ramp = (shadow, midtone, highlight, colors) => createPixelPaletteRamp2D({ shadow, midtone, highlight, colors });
const clothPalette = ramp('#211a31', '#765173', '#e7c6c1', 16);
const swapPalette = ramp('#142b37', '#3f7b81', '#c9e0c5', 16);
const valuePalette = ramp('#182b3e', '#547c9b', '#e7e4cb', 14);
const goldPalette = ramp('#2a2735', '#a57d51', '#f9e0a8', 10);
const gemPalette = ramp('#172b44', '#396e9a', '#badde0', 10);

const study = createPixelArtStudy2D('cloth', SEED, true);
const material = createPixelMaterial2D({ kind: 'fabric', seed: SEED, palette: clothPalette,
  scale: 10, detail: .55, relief: .8, bevel: 2, roughness: .92, light: [-.65, -.8, 1], ambient: .2,
  ambientOcclusion: .25, castShadow: .3, materialId: 1 });
let source = material.shade(study.sprite, { height: study.height });

// These paths are deliberately authored ornament. The color tools below do not invent them.
function curve(a, b, c, d, count = 44) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, s = 1 - t;
    return { x: s ** 3 * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t ** 3 * d[0],
      y: s ** 3 * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t ** 3 * d[1] };
  });
}
const detailProtection = new Uint8Array(W * H);
const authoredStrokes = [];
function stroke(points, color, size, symmetry = 'none', materialId = 2, lift = .35) {
  const mask = rasterizePixelBrush2D(W, H, points, { size, symmetry, pixelPerfect: size === 1 });
  source = paintPixelMask2D(source, mask, hex(color), { alphaLock: true });
  let written = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && source.mask.data[i] && source.pixels[i] >>> 24) {
    source.channels.material[i] = materialId; source.channels.height[i] += lift; detailProtection[i] = 1; written++;
  }
  authoredStrokes.push({ color, size, symmetry, writtenCells: written });
}
for (const path of [
  curve([33, 27], [76, 16], [119, 41], [158, 27]),
  curve([38, 86], [78, 78], [121, 98], [153, 83]),
]) {
  stroke(path, '#624738', 3); stroke(path, '#ddbd7e', 1);
}
for (const path of [
  curve([84, 83], [57, 88], [44, 60], [61, 38]),
  curve([61, 70], [47, 66], [47, 50], [61, 48]),
  curve([64, 53], [76, 45], [77, 59], [65, 62]),
  curve([66, 77], [77, 72], [78, 65], [70, 66]),
]) {
  stroke(path, '#785540', 3, 'x'); stroke(path, '#ebc88a', 1, 'x');
}

const gemPath = [
  { kind: 'move', to: [96, 27] },
  { kind: 'cubic', control1: [120, 35], control2: [123, 54], to: [110, 72] },
  { kind: 'quadratic', control: [101, 81], to: [96, 86] },
  { kind: 'quadratic', control: [87, 79], to: [81, 70] },
  { kind: 'cubic', control1: [69, 53], control2: [73, 35], to: [96, 27] }, { kind: 'close' },
];
function contour(scale) {
  return rasterizePixelContour2D(W, H, gemPath.map(command => {
    const next = { ...command };
    for (const name of ['to', 'control', 'control1', 'control2']) if (command[name])
      next[name] = [96 + (command[name][0] - 96) * scale, 56 + (command[name][1] - 56) * scale];
    return next;
  })).data;
}
function shapedMaterial(mask, palette, kind, materialId, heightSample, options = {}) {
  const pixels = Uint32Array.from(mask, value => value ? palette[3] : 0), height = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) height[y * W + x] = heightSample(x, y);
  const input = { w: W, h: H, pixels, mask: { w: W, h: H, data: mask } };
  const shader = createPixelMaterial2D({ kind, seed: SEED, palette, materialId, scale: 14, detail: .25,
    relief: .4, bevel: 2, roughness: .45, light: [-.8, -.65, 1], ambient: .18, ...options });
  return shader.shade(input, { height });
}
function overlay(ornament) {
  const pixels = source.pixels.slice();
  for (let i = 0; i < pixels.length; i++) if (ornament.mask.data[i] && source.mask.data[i]) {
    pixels[i] = ornament.pixels[i]; source.channels.material[i] = ornament.channels.material[i];
    source.channels.height[i] = ornament.channels.height[i]; detailProtection[i] = 0;
  }
  source = { ...source, pixels };
}
const dome = (x, y) => Math.sqrt(Math.max(0, 1 - ((x - 96) / 23) ** 2 - ((y - 56) / 31) ** 2));
overlay(shapedMaterial(contour(1), goldPalette, 'metal', 2, (x, y) => 14 + dome(x, y) * 3));
const gemMask = contour(.77);
overlay(shapedMaterial(gemMask, gemPalette, 'crystal', 3, (x, y) => 18 + dome(x, y) * 8, { roughness: .24, detail: .45 }));
stroke(curve([92, 39], [84, 46], [83, 54], [89, 62]), '#d8ede2', 1, 'none', 3, .15);
stroke(curve([99, 43], [104, 46], [106, 51], [104, 56]), '#79b5c3', 1, 'none', 3, .1);

// Recompute normals from the final explicitly assembled form once. Color operations retain it.
source = { ...source, channels: createMaterialChannels2D(W, H, { height: source.channels.height,
  material: source.channels.material }) };
const clothSelection = Uint8Array.from(source.channels.material, (id, i) => id === 1 && source.mask.data[i] ? 1 : 0);
const gemSelection = Uint8Array.from(source.channels.material, (id, i) => id === 3 && source.mask.data[i] ? 1 : 0);
const clothProtection = Uint8Array.from(source.channels.material, (id, i) => source.mask.data[i] && id !== 1 ? 1 : 0);
const replacement = createPixelColorReplacer2D(clothPalette.map((from, i) => ({ from, to: swapPalette[i] })));
const value = createPixelRampMapper2D(valuePalette, { mode: 'value', valueRange: [.16, .86], gamma: 1 });
const linear = createPixelRampMapper2D(goldPalette, { mode: 'linear', start: [84, 68], end: [106, 42], gamma: .9 });
const radialPalette = ramp('#f2e3c3', '#64aaa4', '#163b4f', 11);
const radial = createPixelRampMapper2D(radialPalette, { mode: 'radial', start: [92, 48], end: [111, 65], gamma: .85 });
const sourcePixelHash = hash(bytes(source.pixels)), sourceMaskHash = hash(bytes(source.mask.data));
const sourceChannelHashes = Object.fromEntries(['material', 'height', 'normal'].map(key => [key, hash(bytes(source.channels[key]))]));
const cases = [
  { id: 'exact-swap', title: '01 / EXACT CLOTH RECOLOR', label: '16 AUTHORED RGB PAIRS',
    note: 'COLOR ROLES STAY DISTINCT. GOLD AND GEM REMAIN EXACT.',
    output: replacement.replace(source, { selection: clothSelection, protectedMask: clothProtection }),
    settings: { operation: 'replace', ...replacement.options }, selection: clothSelection, protection: clothProtection,
    sourcePalette: clothPalette, palette: swapPalette, layerName: 'Exact cloth recolor' },
  { id: 'value-map', title: '02 / PERCEPTUAL VALUE RAMP', label: '14 BLUE VALUE STEPS',
    note: 'SOURCE LIGHTNESS RETAINS FOLDS. ORNAMENT IS PROTECTED.',
    output: value.map(source, { selection: clothSelection, protectedMask: clothProtection }),
    settings: { operation: 'ramp', ...value.options }, selection: clothSelection, protection: clothProtection,
    sourcePalette: clothPalette, palette: valuePalette, layerName: 'Perceptual cloth values' },
  { id: 'linear-map', title: '03 / DISCRETE LINEAR RAMP', label: '10 GOLD STEPS / GEM ONLY',
    note: 'EXPLICIT ENDPOINTS. FINE INCLUSIONS REMAIN PROTECTED.',
    output: linear.map(source, { selection: gemSelection, protectedMask: detailProtection }),
    settings: { operation: 'ramp', ...linear.options }, selection: gemSelection, protection: detailProtection,
    sourcePalette: gemPalette, palette: goldPalette, layerName: 'Linear ornament ramp' },
  { id: 'radial-map', title: '04 / DISCRETE RADIAL RAMP', label: '11 TEAL STEPS / GEM ONLY',
    note: 'AUTHORED CENTER AND RADIUS. NO SHAPE OR ALPHA CHANGE.',
    output: radial.map(source, { selection: gemSelection, protectedMask: detailProtection }),
    settings: { operation: 'ramp', ...radial.options }, selection: gemSelection, protection: detailProtection,
    sourcePalette: gemPalette, palette: radialPalette, layerName: 'Radial ornament ramp' },
];

function bounds(sprite) {
  let minX = sprite.w, minY = sprite.h, maxX = -1, maxY = -1, cells = 0;
  for (let i = 0; i < sprite.pixels.length; i++) if (sprite.mask.data[i] && sprite.pixels[i] >>> 24) {
    const x = i % sprite.w, y = Math.floor(i / sprite.w);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); cells++;
  }
  return cells ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, cells } : null;
}
const colorCount = sprite => new Set(Array.from(sprite.pixels, (c, i) => sprite.mask.data[i] && c >>> 24 ? c & 0xffffff : -1).filter(c => c >= 0)).size;
const sameArray = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
function invariants(entry) {
  const result = entry.output;
  return {
    changedColorCells: source.pixels.reduce((count, c, i) => count + Number(c !== result.pixels[i]), 0),
    inputColors: colorCount(source), outputColors: colorCount(result), inputBounds: bounds(source), outputBounds: bounds(result),
    alphaEqual: source.pixels.every((c, i) => c >>> 24 === result.pixels[i] >>> 24),
    silhouetteEqual: sameArray(source.mask.data, result.mask.data),
    protectedRGBEqual: source.pixels.every((c, i) => !entry.protection[i] || c === result.pixels[i]),
    outsideSelectionEqual: source.pixels.every((c, i) => entry.selection[i] || c === result.pixels[i]),
    hiddenRGBEqual: source.pixels.every((c, i) => source.mask.data[i] && c >>> 24 || c === result.pixels[i]),
    channelsSameReference: result.channels === source.channels,
    materialEqual: sameArray(source.channels.material, result.channels.material),
    heightEqual: sameArray(source.channels.height, result.channels.height),
    normalEqual: sameArray(source.channels.normal, result.channels.normal),
  };
}
const records = cases.map(entry => ({ id: entry.id, settings: entry.settings,
  selectedCells: entry.selection.reduce((sum, value) => sum + value, 0),
  protectedCells: entry.protection.reduce((sum, value) => sum + value, 0), ...invariants(entry) }));
for (const record of records) {
  for (const field of ['alphaEqual', 'silhouetteEqual', 'protectedRGBEqual', 'outsideSelectionEqual', 'hiddenRGBEqual',
    'channelsSameReference', 'materialEqual', 'heightEqual', 'normalEqual'])
    if (!record[field]) throw new Error(`Color study ${record.id} failed ${field}`);
  if (!record.changedColorCells) throw new Error(`Color study ${record.id} did not edit any cells`);
}
if (hash(bytes(source.pixels)) !== sourcePixelHash || hash(bytes(source.mask.data)) !== sourceMaskHash
  || Object.entries(sourceChannelHashes).some(([key, digest]) => hash(bytes(source.channels[key])) !== digest))
  throw new Error('Color studies mutated their common source');

saveSprite('source-native.png', source);
const sourceDoc = { ...createPixelArtDocument2D(source, 'Authored silk and gemstone color study'), workingPalette: [...clothPalette] };
saveJSON('source.poku-pixel-art.json', serializePixelArtDocument2D(sourceDoc));
for (const entry of cases) {
  saveSprite(`${entry.id}-native.png`, entry.output);
  const touched = Uint8Array.from(source.pixels, (c, i) => c !== entry.output.pixels[i] ? 1 : 0);
  const next = writePixelArtPaintLayer2D(sourceDoc, entry.output, touched);
  const document = { ...next, name: entry.layerName, workingPalette: [...entry.palette],
    selection: Array.from(entry.selection), protectedMask: Array.from(entry.protection),
    layers: next.layers.map(layer => layer.id === next.activeLayerId ? { ...layer, name: entry.layerName } : layer) };
  const reopened = renderPixelArtDocument2D(document);
  if (!sameArray(reopened.pixels, entry.output.pixels) || !sameArray(reopened.mask.data, entry.output.mask.data)
    || !sameArray(reopened.channels.height, entry.output.channels.height) || !sameArray(reopened.channels.normal, entry.output.channels.normal))
    throw new Error(`Saved paint fixture does not reproduce ${entry.id}`);
  saveJSON(`${entry.id}.poku-pixel-art.json`, serializePixelArtDocument2D(document));
}

const BG = [11, 16, 23, 255], PANEL = [19, 27, 35, 255], LIGHT = [227, 237, 222], MUTED = [140, 159, 176], ACCENT = [204, 192, 148];
function swatches(sheet, palette, x, y, width, height) {
  for (let i = 0; i < palette.length; i++) {
    const left = Math.floor(i * width / palette.length), right = Math.floor((i + 1) * width / palette.length), c = palette[i];
    sheet.rect(x + left, y, Math.max(1, right - left - 1), height, [c & 255, c >>> 8 & 255, c >>> 16 & 255, 255]);
  }
}
function comparison(scale) {
  const pad = 22, iw = W * scale, ih = H * scale, font = scale === 1 ? 1 : 2;
  const header = scale === 1 ? 64 : 85, rowHeight = ih + (scale === 1 ? 85 : 112);
  const sheet = canvas(iw * 2 + pad * 3, header + cases.length * rowHeight + 35, BG);
  sheet.text(`PIXEL COLOR / ${scale === 1 ? 'NATIVE 1X' : 'NEAREST 3X'}`, pad, 17, 2, LIGHT, 'big');
  sheet.text('ACTUAL AUTHORING OUTPUT / ONE COMMON SOURCE', pad, 43, font, MUTED);
  for (const [index, entry] of cases.entries()) {
    const y = header + index * rowHeight, imageY = y + (scale === 1 ? 31 : 43), right = iw + pad * 2;
    sheet.text(entry.title, pad, y, font, ACCENT);
    sheet.text('AUTHORED SOURCE / 192 X 112', pad, y + (scale === 1 ? 16 : 23), font, MUTED);
    sheet.text(entry.label, right, y + (scale === 1 ? 16 : 23), font, LIGHT);
    for (const [x, sprite] of [[pad, source], [right, entry.output]]) {
      sheet.rect(x, imageY, iw, ih, PANEL); sheet.paste(upscale(rgba(sprite), W, H, scale), iw, ih, x, imageY);
    }
    swatches(sheet, entry.sourcePalette, pad, imageY + ih + 8, iw, scale === 1 ? 6 : 10);
    swatches(sheet, entry.palette, right, imageY + ih + 8, iw, scale === 1 ? 6 : 10);
    sheet.text(entry.note, pad, imageY + ih + (scale === 1 ? 25 : 34), font, MUTED);
  }
  sheet.text('NATIVE SHAPE + ALPHA + MATERIAL + HEIGHT + NORMALS RETAINED', pad, sheet.h - 23, font, MUTED);
  return sheet;
}
saveSheet('comparison-native.png', comparison(1)); saveSheet('comparison-3x.png', comparison(3));

let revision = null;
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const sourceFiles = ['tools/preview-pixel-art-production.mjs', 'src/core/pixel-color-edit.ts', 'src/core/pixel-palette.ts',
  'src/core/pixel-material.ts', 'src/core/pixel-brush.ts', 'src/core/material-surface.ts', 'src/examples/pixel-art-study.ts',
  'src/authoring/pixel-art-document.ts', 'build/core/pixel-color-edit.js', 'build/core/pixel-material.js', 'build/examples/pixel-art-study.js'];
const evidence = {
  schema: 'poku.pixel-art-production-evidence/v1', nativeSize: [W, H], seed: SEED, revisionAtGeneration: revision,
  scope: 'Standalone native authoring study. No existing effect artwork is edited or shown as a before/after result.',
  source: { recipe: 'createPixelArtStudy2D(cloth,41,true), explicit fabric height, authored metal/gem contour, curved embroidery',
    material: material.options, authoredStrokes, pixelSHA256: sourcePixelHash, maskSHA256: sourceMaskHash,
    channelSHA256: sourceChannelHashes, bounds: bounds(source), colors: colorCount(source) },
  resampling: { native: 1, enlarged: 3, method: 'exact nearest-neighbor pixel repetition; no blur or added detail' },
  projectFixtures: 'Every v2 fixture retains the common baked source and geometry plus one sparse paint layer. Settings are recorded here, but baked paint layers do not automatically expose re-editable color parameters.',
  sourceUnchanged: true, cases: records,
  visualReview: { status: 'pending native-size visual inspection', artisticQualityCertified: false },
  sourceFiles: sourceFiles.map(path => ({ path, sha256: hash(readFileSync(join(root, path))) })), files,
};
writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ output: relative(root, out), files: files.map(file => file.name),
  cases: records.map(record => ({ id: record.id, changedColorCells: record.changedColorCells, alphaEqual: record.alphaEqual,
    silhouetteEqual: record.silhouetteEqual, channelsEqual: record.materialEqual && record.heightEqual && record.normalEqual })),
  artisticQualityCertified: false }, null, 2));
