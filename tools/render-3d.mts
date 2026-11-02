#!/usr/bin/env node
/** Export deterministic 3D VFX contact sheets for inspection and engine-independent use. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
// Runtime path is relative to build-tools/tools/render-3d.mjs after tsc emission.
const { createFrame3D, compositeFrame3D, Painter3D, createFx3D } = await import(new URL("../../build/3d/index.js", import.meta.url).href);
const frost = await import(new URL("../../build/3d/effects/frost-nova.js", import.meta.url).href);
const slash = await import(new URL("../../build/3d/effects/arc-slash.js", import.meta.url).href);
const blackhole = await import(new URL("../../build/3d/effects/black-hole.js", import.meta.url).href);
const wind = await import(new URL("../../build/3d/effects/wind-rasenshuriken.js", import.meta.url).href);
const windOriginal = await import(new URL("../../build/3d/effects/wind-rasenshuriken-legacy.js", import.meta.url).href);
import { encodePNG } from "./lib/png.mjs";

const args = process.argv.slice(2), name = args[0] ?? "frost";
const effects = { frost, slash, blackhole, wind, windOriginal };
if (!(name in effects)) throw new Error("Usage: render-3d frost|slash|blackhole|wind|windOriginal [--frames 24 --width 192 --height 128 --columns 6 --seed 123 --out records/3d/wind.png]");
const flags: Record<string, string> = {};
for (let i = 1; i < args.length; i += 2) flags[args[i].replace(/^--/, "")] = args[i + 1];
const int = (name: string, def: number) => {
  const n = Number(flags[name] ?? def);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
};
const frames = int("frames", 24), width = int("width", 192), height = int("height", 128), columns = int("columns", 6);
const rows = Math.ceil(frames / columns);
const mod = effects[name];
const fx = name === "frost" ? createFx3D(frost, { seed: int("seed", frost.meta.options.seed) })
  : name === "slash" ? createFx3D(slash, { seed: int("seed", slash.meta.options.seed) })
  : name === "blackhole" ? createFx3D(blackhole, { seed: int("seed", blackhole.meta.options.seed) })
  : name === "wind" ? createFx3D(wind, { seed: int("seed", wind.meta.options.seed) })
  : createFx3D(windOriginal, { seed: int("seed", windOriginal.meta.options.seed) });
const frame = createFrame3D(width, height);
const isWind = name === "wind" || name === "windOriginal";
const painter = new Painter3D(frame, {
  yaw: isWind ? 0.32 : 0.68, elevation: isWind ? 0.22 : 33 * Math.PI / 180,
  zoom: name === "blackhole" ? 1.3 : isWind ? 1.18 : 1,
  target: [0, name === "frost" ? 0.75 : name === "slash" ? 1.4 : isWind ? 2.35 : 2.1, 0],
});
const dest = new Uint8ClampedArray(width * height * 4);
const sheet = new Uint8Array(width * columns * height * rows * 4);
for (let n = 0; n < frames; n++) {
  const time = n / Math.max(1, frames - 1) * mod.meta.duration;
  fx.seek(time);
  painter.begin(name === "blackhole" ? "#05030d" : isWind ? "#061222" : "#0a1525");
  if (name !== "blackhole" && !isWind) painter.grid();
  fx.draw(painter);
  compositeFrame3D(frame, dest);
  const ox = (n % columns) * width, oy = Math.floor(n / columns) * height;
  for (let y = 0; y < height; y++) {
    const start = ((oy + y) * width * columns + ox) * 4;
    sheet.set(dest.subarray(y * width * 4, (y + 1) * width * 4), start);
  }
}
const destination = resolve(flags.out ?? `records/3d/${name}.png`);
const out = destination.toLowerCase().endsWith(".png") ? destination : destination + ".png";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePNG(width * columns, height * rows, sheet));
writeFileSync(out.slice(0, -4) + ".json", JSON.stringify({
  id: mod.meta.id, frames, columns, frameWidth: width, frameHeight: height, duration: mod.meta.duration,
  options: fx.options, camera: painter.camera, timeSamples: Array.from({ length: frames }, (_, i) => i / Math.max(1, frames - 1) * mod.meta.duration),
}, null, 2));
console.log(`${mod.meta.id}: ${frames} frames → ${out}`);
