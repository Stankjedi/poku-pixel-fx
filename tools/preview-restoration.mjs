#!/usr/bin/env node
// Run after npm run build. One restorative interaction, checked on a moving body and without bloom.
import { join } from 'node:path';
import { createFx, createFrame, clearFrame, composite, painterFor, drawActor, stockActor, backdrop, hex, restorationPulseCrossed } from '../build/core/index.js';
import * as heal from '../build/fx/holy/heal.js';
import { loadEffect, renderAct, writeVideo, save, contactSheet } from '../build-tools/tools/lib/fxlib.mjs';
const out = process.argv[2] ?? 'records/restoration-review';
const actor = stockActor(2), W = 360, H = 120, fps = 30, originY = 98;
const variants = [
  { label: 'ATTACHED', light: 1, seed: 2 },
  { label: 'NO GLOW', light: 0, seed: 7 },
  { label: 'WARM', light: .85, seed: 13, flip: true, palette: ['#331b32','#603649','#985b66','#cb8c82','#e3b99b','#f1d4b5','#fff0d5','#fff9e4'] },
];
const instances = variants.map((o,i) => createFx(heal, { ...o, x: i * 120 + 60, y: originY }));
const f = createFrame(W,H), bg = backdrop('ground',W,H,originY), frames = [];
let beats = 0;
for (let i = 0; i <= Math.round(heal.meta.duration * fps); i++) {
  const t = i / fps;
  if (i) { instances.forEach(fx => fx.update(1/fps)); if (restorationPulseCrossed(heal.restoration,(i-1)/fps,t)) beats++; }
  clearFrame(f);
  for (let k = 0; k < variants.length; k++) {
    const fx = instances[k], variant = variants[k];
    fx.options.x = k * 120 + 60 + Math.round(Math.sin(t * 2.3) * 10);
    fx.draw(f,'back'); drawActor(painterFor(f).place(fx.options.x,originY,!!variant.flip),actor); fx.draw(f,'front');
    painterFor(f).text(variant.label,k*120+60,7,hex('#c4ced4'),{align:'center'});
  }
  const rgba = composite(f,new Uint8ClampedArray(W*H*4),bg);
  frames.push({t,color:rgba,clear:rgba});
}
if (beats !== 1) throw new Error(`Expected one restoration beat, found ${beats}`);
const r={w:W,h:H,fps,n:frames.length,frames};
if (!writeVideo(join(out,'healing-target-review.gif'),r,3)) throw new Error('ffmpeg is required for motion review');
save(join(out,'contact.png'),contactSheet({id:'holy/heal',meta:heal.meta},r,{max:8,cols:2,zoom:2}));
const acted = renderAct(await loadEffect('holy/heal'),{fps:30});
if (!writeVideo(join(out,'healing-act.gif'),acted,4)) throw new Error('ffmpeg is required for motion review');
console.log(`Restoration review: ${out}; one pulse at ${heal.restoration.pulseAt}s, moving attachments, reduced glow and palette/flip variants.`);
