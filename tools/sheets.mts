#!/usr/bin/env node
// Export sprite sheets for every effect (or some): sheets/<category>/<name>.png + .json, and sheets/index.json.
//
//   node build-tools/tools/sheets.mjs            everything
//   node build-tools/tools/sheets.mjs fire ice   some categories

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, allIds, resolveIds, loadEffect, renderSequence, spriteSheet, save } from "./lib/fxlib.mjs";
const { actTiming } = await import(new URL("../../build/core/index.js", import.meta.url).href);

const ids = process.argv.length > 2 ? resolveIds(process.argv.slice(2)) : allIds();
const out = join(ROOT, "sheets"), index: Record<string, unknown>[] = [];
for (const id of ids) {
  const fx = await loadEffect(id), r = renderSequence(fx, { bg: "none" }), name = id.split("/")[1];
  const s = spriteSheet(fx, r, name);
  save(join(out, id + ".png"), s.png);
  save(join(out, id + ".json"), JSON.stringify(s.json, null, 1));
  const m = fx.meta;
  index.push({ id, name: m.name, desc: m.desc, tags: m.tags, loop: m.loop, fps: r.fps, frames: r.n, frameSize: m.size, pivot: m.origin, columns: s.json.meta.pokuFx.columns, image: `${id}.png`, ...(fx.mod.act ? { act: actTiming(fx.mod) } : {}) });
  process.stdout.write(".");
}
if (process.argv.length <= 2) writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 1));
console.log(`\n스프라이트 시트 ${ids.length}개 -> sheets/`);
