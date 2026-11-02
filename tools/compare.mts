#!/usr/bin/env node
// Drafts side by side: one row per effect, the same moments in each column, so you can pick the best.
//
//   node build-tools/tools/compare.mjs "arcane/my-spell-*"          -> records/compare.png
//   node build-tools/tools/compare.mjs fire/torch fire/campfire --frames 8 --out records/fires.png

import { join } from "node:path";
import { ROOT, resolveIds, loadEffect, renderFrames, pickFrames, upscale, canvas, save } from "./lib/fxlib.mjs";

const args = process.argv.slice(2), flags: Record<string, string> = {}, pats: string[] = [];
for (let i = 0; i < args.length; i++) args[i].startsWith("--") ? (flags[args[i].slice(2)] = args[++i]) : pats.push(args[i]);
const ids: string[] = resolveIds(pats);
const cols = +(flags.frames ?? 8);
if (!ids.length) process.exit(1);
const runs: Array<{id: string; fx: any; r: any}> = [];
for (const id of ids) {
  const fx = await loadEffect(id);
  runs.push({ id, fx, r: renderFrames(fx) });
}
const w = Math.max(...runs.map((x) => x.r.w)), h = Math.max(...runs.map((x) => x.r.h));
const k = Math.max(1, Math.min(4, Math.floor(1500 / cols / (w + 6))));
const pad = 6, label = 22, img = canvas(pad + cols * (w * k + pad), runs.length * (h * k + label + pad) + pad);
runs.forEach(({ id, r }, row) => {
  const y = pad + row * (h * k + label + pad);
  img.text(id, pad, y + 2, 3);
  pickFrames(r.n, cols).forEach((fi: number, c: number) => {
    const x = pad + c * (w * k + pad) + Math.floor(((w - r.w) * k) / 2);
    img.paste(upscale(r.frames[fi].color, r.w, r.h, k), r.w * k, r.h * k, x, y + label + Math.floor(((h - r.h) * k) / 2));
  });
});
const out = flags.out ?? join(ROOT, "records", "compare.png");
save(out, img.png());
console.log(`이펙트 ${runs.length}개 x 시점 ${cols}개 -> ${out}`);
