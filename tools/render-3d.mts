#!/usr/bin/env node
/** 3D inspection sheets, or opt-in game atlases with color/coverage and true HDR emission. */
import { basename, dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { canvas, createSpriteSheet, save } from "./lib/fxlib.mjs";
import { createLayerSheet } from "./lib/layers.mjs";
import { parseFlags3D, positiveInteger, scene3D } from "./lib/scene3d.mjs";

const args = process.argv.slice(2), name = args[0] ?? "frost", flags = parseFlags3D(args.slice(1));
const atlas = flags.atlas === "true" || flags.atlas === "1", split = flags.layers === "true" || flags.layers === "1";
if (split && !atlas) throw new Error("--layers requires --atlas true (game assets use a continuous frame timeline)");
const run = await scene3D(name, flags, atlas ? "atlas" : "contact"), r = run.sequence;
const columns = positiveInteger(flags.columns, atlas ? Math.max(1, Math.ceil(Math.sqrt(r.n * r.h / r.w))) : 6, "columns");
const destination = resolve(flags.out ?? `records/3d/${name}${atlas ? ".atlas" : ""}.png`);
const out = destination.toLowerCase().endsWith(".png") ? destination : destination + ".png", base = out.slice(0, -4);
if (atlas) {
  const info = { ...r, columns: Math.min(columns, r.n) }, sink = createSpriteSheet(run.effect, info, name, basename(out));
  let layers: ReturnType<typeof createLayerSheet> | undefined;
  try {
    if (split) layers = createLayerSheet(base, run.effect, info);
    let i = 0; for (const frame of r.frames) { sink.push(frame, i); layers?.push(frame, i); i++; }
    const result = sink.result(), made = [save(out, result.png), save(base + ".json", JSON.stringify(result.json, null, 2))];
    if (layers) made.push(...layers.finish());
    console.log(`${run.meta.id}: ${r.n} game frames at ${r.fps} fps → ${made.join("  ")}`);
  } finally { layers?.abort(); }
} else {
  const rows = Math.ceil(r.n / columns), sheet = canvas(r.w * columns, r.h * rows, [0, 0, 0, 0]);
  const timeSamples: number[] = [];
  let i = 0;
  for (const frame of r.frames) {
    sheet.copy(frame.color, r.w, r.h, i % columns * r.w, Math.floor(i / columns) * r.h);
    timeSamples.push(frame.t); i++;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sheet.png());
  writeFileSync(base + ".json", JSON.stringify({
    id: run.meta.id, frames: r.n, columns, frameWidth: r.w, frameHeight: r.h, duration: run.meta.duration,
    output: "inspection-sheet-3d", renderMode: r.settings?.renderMode,
    options: run.options, camera: run.camera, cameraMotion: run.cameraMotion, timeSamples, settings: r.settings,
  }, null, 2));
  console.log(`${run.meta.id}: ${r.n} inspection samples → ${out}`);
}
