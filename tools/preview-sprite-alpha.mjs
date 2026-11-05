// Demonstrate only the export correction, keeping the rendered source frame unchanged.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFrame, createFx, composite } from '../build/core/index.js';
import * as smoke from '../build/fx/weather/rising-smoke.js';
import { ROOT, canvas, upscale, spriteSheet } from '../build-tools/tools/lib/fxlib.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';

const [w, h] = smoke.meta.size, [x, y] = smoke.meta.origin, f = createFrame(w, h);
const fx = createFx(smoke, { x, y }); fx.update(1.2); fx.draw(f);
const clear = composite(f, new Uint8ClampedArray(w * h * 4));
const previous = clear.slice();
for (let i = 0; i < previous.length; i += 4) for (let c = 0; c < 3; c++) previous[i + c] *= previous[i + 3] / 255;
const exported = canvas(w, h, [0, 0, 0, 0]); exported.paste(clear, w, h, 0, 0);
const sheet = spriteSheet({ id: 'weather/rising-smoke', meta: smoke.meta, mod: smoke, file: '' },
  { w, h, fps: 30, n: 1, frames: [{ t: 1.2, color: clear, clear }] }, 'smoke-frame');
const k = 3, pad = 16, cw = w * k;
const img = canvas(pad + 3 * (cw + pad), h * k + 74);
img.text('SAME SMOKE FRAME: TRANSPARENT PNG ALPHA FIX', pad, 10, 2);
const labels = ['SOURCE REFERENCE', 'BEFORE EXPORT', 'FIXED EXPORT'];
[clear, previous, exported.data].forEach((rgba, i) => {
  const view = canvas(w, h, [22, 24, 30, 255]); view.paste(rgba, w, h, 0, 0);
  const left = pad + i * (cw + pad); img.text(labels[i], left, 38, 2);
  img.paste(upscale(view.data, w, h, k), cw, h * k, left, 58);
});
const dir = join(ROOT, 'records', 'sprite-alpha'); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'comparison.png'), img.png());
writeFileSync(join(dir, 'before-export.png'), encodePNG(w, h, previous));
writeFileSync(join(dir, 'fixed-export.png'), sheet.png);
const countChanged = data => clear.reduce((n, v, i) => n + (i % 4 !== 3 && v !== data[i]), 0);
const result = { effect: 'weather/rising-smoke', time: 1.2, changedRGBChannelsBefore: countChanged(previous),
  changedRGBChannelsAfter: countChanged(exported.data), alphaChanged: clear.some((v, i) => i % 4 === 3 && v !== exported.data[i]),
  note: 'Export transport fidelity only. No source effect or artistic styling was changed.' };
writeFileSync(join(dir, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ image: join(dir, 'comparison.png'), ...result }, null, 2));
