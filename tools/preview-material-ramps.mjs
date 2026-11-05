import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composite } from '../build/core/fx.js';
import { renderMaterialRampStudy, MATERIAL_STUDY_PALETTES } from '../build/examples/material-ramp-study.js';
import { canvas, upscale, writeVideo } from '../build-tools/tools/lib/fxlib.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { hex } from '../build/core/color.js';

const out = process.argv[2] ?? 'records/material-ramp-study'; mkdirSync(out, { recursive: true });
const w = 128, h = 108;
function render(mode, light) {
  const result = renderMaterialRampStudy(mode, light);
  return { ...result, rgba: composite(result.frame, new Uint8ClampedArray(w * h * 4), hex('#141c28')) };
}
const before = render('uniform'), after = render('authored');
const compare = canvas(800, 552, [13, 18, 28, 255]);
compare.text('MATERIAL RESPONSE / SAME SHAPE + LIGHT', 18, 14, 2, [226, 237, 235]);
for (const [i, [label, result]] of [['UNIFORM BANDS', before], ['AUTHORED BANDS + STEEL GLINT', after]].entries()) {
  const x = 8 + i * 400;
  compare.text(label, x + 10, 42, 1, [165, 199, 204]);
  compare.paste(upscale(result.rgba, w, h, 3), w * 3, h * 3, x, 60);
  compare.text('NATIVE 1X', x + 20, 408, 1, [165, 199, 204]);
  compare.paste(result.rgba, w, h, x + 20, 425);
  for (const [row, [name, palette]] of Object.entries(MATERIAL_STUDY_PALETTES).entries()) {
    compare.text(name.toUpperCase(), x + 175, 428 + row * 29, 1, [165, 199, 204]);
    palette.forEach((color, j) => { const c = hex(color); compare.rect(x + 175 + j * 23, 440 + row * 29, 22, 10, [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, 255]); });
    if (i === 1 && name === 'steel') compare.rect(x + 267, 440, 10, 10, [255, 240, 196, 255]);
  }
}
writeFileSync(join(out, 'before-after.png'), compare.png());
writeFileSync(join(out, 'authored-native.png'), encodePNG(w, h, composite(after.frame, new Uint8ClampedArray(w * h * 4), null)));
const lightReview = canvas(w * 4, h + 20, [13, 18, 28, 255]);
for (const [i, [label, mode, light]] of [
  ['LEFT / UNIFORM', 'uniform', [-.8, -.55, -1]], ['LEFT / AUTHORED', 'authored', [-.8, -.55, -1]],
  ['RIGHT / UNIFORM', 'uniform', [.8, -.55, -1]], ['RIGHT / AUTHORED', 'authored', [.8, -.55, -1]],
].entries()) { lightReview.text(label, i * w + 3, 6, 1, [165, 199, 204]); lightReview.paste(render(mode, light).rgba, w, h, i * w, 20); }
writeFileSync(join(out, 'light-direction-review.png'), encodePNG(w * 8, (h + 20) * 2, upscale(lightReview.data, w * 4, h + 20, 2)));
if (!process.argv.includes('--still')) {
  const frames = [], fps = 24, n = 48;
  for (let i = 0; i < n; i++) {
    const angle = i / n * Math.PI * 2, light = [-.85 * Math.cos(angle), -.52, -1];
    const c = canvas(w * 2, h + 18, [13, 18, 28, 255]);
    c.text('UNIFORM BANDS', 4, 6, 1, [165, 199, 204]); c.text('MATERIAL RESPONSE', w + 4, 6, 1, [226, 237, 235]);
    c.paste(render('uniform', light).rgba, w, h, 0, 18); c.paste(render('authored', light).rgba, w, h, w, 18);
    frames.push({ t: i / fps, color: c.data, clear: c.data });
  }
  writeVideo(join(out, 'moving-key-comparison.gif'), { w: w * 2, h: h + 18, fps, n, frames }, 3);
}
const changed = after.frame.color.reduce((n, color, i) => n + Number(color !== before.frame.color[i]), 0);
writeFileSync(join(out, 'validation.json'), JSON.stringify({ logicalSize: [w, h], changedColorCells: changed,
  identicalAlpha: after.frame.color.every((c, i) => (c >>> 24) === (before.frame.color[i] >>> 24)),
  identicalMaterialMasks: after.material.every((m, i) => m === before.material[i]),
  noGlow: after.frame.light.every(c => c === 0) && before.frame.light.every(c => c === 0),
  artisticQualityCertified: false }, null, 2) + '\n');
console.log(join(out, 'before-after.png'));
