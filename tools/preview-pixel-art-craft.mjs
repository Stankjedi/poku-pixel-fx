import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPixelCraftStudy2D } from '../build/examples/pixel-craft-study.js';
import { renderPixelArtDocument2D, serializePixelArtDocument2D } from '../build/authoring/pixel-art-document.js';
import { exportPixelSurfaceMaps2D } from '../build/core/pixel-surface-maps.js';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { canvas, upscale } from '../build-tools/tools/lib/fxlib.mjs';

const out = resolve(process.argv[2] ?? 'docs/previews/pixel-art-craft'); mkdirSync(out, { recursive: true });
const rgba = sprite => {
  const bytes = new Uint8Array(sprite.w * sprite.h * 4);
  for (let i = 0; i < sprite.pixels.length; i++) { const c = sprite.pixels[i]; bytes.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, sprite.mask.data[i] ? c >>> 24 : 0], i * 4); }
  return bytes;
};
const evidence = [];
const sheet = canvas(160 * 4 + 15 * 5, 192 * 2 + 35 * 3, [17, 22, 33, 255]);
['AUTHORED COLOR','SCULPTED HEIGHT','DERIVED NORMAL','RELIT PIXELS'].forEach((label,i)=>sheet.text(label,15+i*175,15,1,[172,191,205]));
for (const [row, kind] of ['plume', 'folds'].entries()) {
  const document = createPixelCraftStudy2D(kind), after = renderPixelArtDocument2D(document);
  const {activeLayerId,...sourceDocument}=document;
  const before = renderPixelArtDocument2D({ ...sourceDocument, layers: document.layers.filter(layer => layer.kind !== 'height' && layer.kind !== 'relight') });
  const maps = exportPixelSurfaceMaps2D(after), samples = [['color', before], ['sculpt', maps.height], ['normal', maps.normal], ['lit', after]];
  const files = [];
  for (const [column, [label, sprite]] of samples.entries()) {
    const data = rgba(sprite), name = `${kind}-${label}.png`;
    writeFileSync(join(out, name), encodePNG(sprite.w, sprite.h, data));
    files.push({ name, width: sprite.w, height: sprite.h, rgbaSHA256: createHash('sha256').update(data).digest('hex') });
    sheet.paste(data,sprite.w,sprite.h,15 + column * 175, 35 + row * 227);
  }
  writeFileSync(join(out, `${kind}.poku-pixel-art.json`), serializePixelArtDocument2D(document));
  evidence.push({ kind, layers: document.layers.length, sourceColors: new Set([...before.pixels].filter(c => c >>> 24).map(c => c & 0xffffff)).size,
    coveragePreserved: before.pixels.every((c, i) => (c >>> 24) === (after.pixels[i] >>> 24) && before.mask.data[i] === after.mask.data[i]), files });
}
writeFileSync(join(out, 'comparison-native.png'), sheet.png());
writeFileSync(join(out, 'comparison-3x.png'), encodePNG(sheet.w*3,sheet.h*3,upscale(sheet.data,sheet.w,sheet.h,3)));
writeFileSync(join(out, 'evidence.json'), JSON.stringify({ schema: 'poku.pixel-craft-studies/v1', columns: ['Authored color', 'Sculpted height', 'Derived normals', 'Relit native art'],
  note: 'Standalone editable authoring studies. Height is painted explicitly; no depth is inferred from RGB. These are not changed legacy effects or an artistic-quality score.', studies: evidence }, null, 2) + '\n');
console.log(JSON.stringify({ out, studies: evidence.map(({ kind, layers, coveragePreserved }) => ({ kind, layers, coveragePreserved })) }, null, 2));
