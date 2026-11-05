#!/usr/bin/env node
// Compare evenly spaced samples. Each effect is drawn into its row and released before the next one.
import { join } from "node:path";
import { ROOT, resolveIds, loadEffect, renderSequence, pickFrames, upscale, canvas, save } from "./lib/fxlib.mjs";

const args = process.argv.slice(2), flags: Record<string, string> = {}, pats: string[] = [];
for (let i = 0; i < args.length; i++) args[i].startsWith("--") ? (flags[args[i].slice(2)] = args[++i]) : pats.push(args[i]);
const ids = resolveIds(pats, undefined, { strict: true }), cols = +(flags.frames ?? 8);
if (!ids.length) { console.error("비교할 이펙트가 없습니다"); process.exit(1); }
if (!Number.isSafeInteger(cols) || cols < 1) throw new RangeError("frames must be a positive integer");
const effects = await Promise.all(ids.map(id => loadEffect(id)));
// These are lazy descriptors: there is no rendered frame sequence in this array.
const runs = effects.map(fx => ({ fx, r: renderSequence(fx) }));
const w = Math.max(...runs.map(x => x.r.w)), h = Math.max(...runs.map(x => x.r.h));
const k = Math.max(1, Math.min(4, Math.floor(1500 / cols / (w + 6))));
const pad = 6, label = 22, img = canvas(pad + cols * (w * k + pad), runs.length * (h * k + label + pad) + pad);
for (const [row, { fx, r }] of runs.entries()) {
  const y = pad + row * (h * k + label + pad), samples = new Map(pickFrames(r.n, cols).map((fi, col) => [fi, col]));
  img.text(fx.id, pad, y + 2, 3);
  let i = 0;
  for (const frame of r.frames) {
    const col = samples.get(i++);
    if (col === undefined) continue;
    const x = pad + col * (w * k + pad) + Math.floor(((w - r.w) * k) / 2);
    img.paste(upscale(frame.color, r.w, r.h, k), r.w * k, r.h * k, x, y + label + Math.floor(((h - r.h) * k) / 2));
  }
}
const out = flags.out ?? join(ROOT, "records", "compare.png");
save(out, img.png());
console.log(`이펙트 ${runs.length}개 x 시점 ${cols}개 -> ${out}`);
