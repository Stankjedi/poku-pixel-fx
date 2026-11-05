// Controlled authoring-path comparison, not an automatic art-quality claim.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFrame, Painter, composite } from '../build/core/index.js';
import { stockActor, drawActor, withActorPixels } from '../build/core/actor.js';
import { editSpriteCluster2D } from '../build/core/sprite-edit.js';
import { ROOT, canvas, upscale } from '../build-tools/tools/lib/fxlib.mjs';

const stock = stockActor(2);
const edited = editSpriteCluster2D(stock, { x: 9, y: 8, rows: ['.hhh.', 'hxxxh', '.hhh.'], palette: { h: 0xff70ceff, x: null } });
const actors = [stock, edited, withActorPixels(edited)];
const labels = ['STOCK', 'EDIT / LEGACY', 'EDIT / PIXELS'];
const frames = actors.map(actor => {
  const f = createFrame(40, 48);
  drawActor(new Painter(f).place(20, 43), actor);
  return { raw: f.color, rgba: composite(f, new Uint8ClampedArray(40 * 48 * 4), 0xff201a18) };
});
const img = canvas(1000, 540);
img.text('11 EDITED CELLS: EXPLICIT RASTER ACTOR CONNECTION', 16, 12, 2);
frames.forEach((f, i) => {
  const x = 16 + i * 328;
  img.text(labels[i], x, 42, 2);
  img.paste(f.rgba, 40, 48, x, 62);
  img.paste(upscale(f.rgba, 40, 48, 8), 320, 384, x, 126);
});
const dir = join(ROOT, 'records', 'actor-pixels'); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'comparison.png'), img.png());
const changed = (a, b) => a.reduce((n, c, i) => n + (c !== b[i]), 0);
const report = { editedBufferCells: changed(stock.pixels, edited.pixels), legacyOutputChangedCells: changed(frames[0].raw, frames[1].raw),
  optedInOutputChangedCells: changed(frames[0].raw, frames[2].raw), note: 'Golden cluster repaint and transparent erasures are intentional diagnostic edits, not claimed artistic improvement.' };
writeFileSync(join(dir, 'comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ image: join(dir, 'comparison.png'), ...report }, null, 2));
