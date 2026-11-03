#!/usr/bin/env node
/** Export deterministic 3D VFX contact sheets for inspection and engine-independent use. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const { createFrame3D, compositeFrame3D, Painter3D, createFx3D, enableHDRLight, CinematicLighting3D, CinematicCompositor } = await import(new URL("../../build/3d/index.js", import.meta.url).href);
const frost = await import(new URL("../../build/3d/effects/frost-nova.js", import.meta.url).href);
const slash = await import(new URL("../../build/3d/effects/arc-slash.js", import.meta.url).href);
const blackhole = await import(new URL("../../build/3d/effects/black-hole.js", import.meta.url).href);
const wind = await import(new URL("../../build/3d/effects/wind-rasenshuriken.js", import.meta.url).href);
const windOriginal = await import(new URL("../../build/3d/effects/wind-rasenshuriken-legacy.js", import.meta.url).href);
import { encodePNG } from "./lib/png.mjs";

const args = process.argv.slice(2), name = args[0] ?? "frost";
const effects = { frost, slash, blackhole, wind, windOriginal };
if (!Object.prototype.hasOwnProperty.call(effects, name)) throw new Error("Usage: render-3d frost|slash|blackhole|wind|windOriginal [--frames 24 --width 192 --height 128 --columns 6 --seed 123 --out records/3d/effect.png --cinematic true]");
const flags: Record<string, string> = {};
for (let i = 1; i < args.length; i += 2) {
  if (!args[i].startsWith("--") || args[i + 1] === undefined) throw new Error("Expected --option value");
  flags[args[i].slice(2)] = args[i + 1];
}
const int = (name: string, def: number) => {
  const n = Number(flags[name] ?? def);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
};
const frames = int("frames", 24), width = int("width", 192), height = int("height", 128), columns = int("columns", 6);
const rows = Math.ceil(frames / columns);
const cinematicMode = flags.cinematic === "true" || flags.cinematic === "1";
const mod = effects[name as keyof typeof effects];
const seed = Number(flags.seed ?? mod.meta.options.seed);
if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError("seed must be a non-negative integer");
const fx = createFx3D(mod, { seed });
const frame = createFrame3D(width, height);
if (cinematicMode && name !== "blackhole") enableHDRLight(frame);
const lighting = new CinematicLighting3D();
const film = new CinematicCompositor();
const rig = [
  { position: [-2.3, 3.2, 1.6] as const, radius: 7, color: "#88dfff", intensity: 1.75, specular: 0.5, rim: 0.2 },
  { position: [2.4, 2.1, -1.7] as const, radius: 6, color: "#ff9dce", intensity: 1.3, specular: 0.38, rim: 0.22 },
];
const isWind = name === "wind" || name === "windOriginal";
const painter = new Painter3D(frame, {
  yaw: isWind ? 0.32 : 0.68, elevation: isWind ? 0.22 : 28 * Math.PI / 180,
  zoom: name === "blackhole" ? 1.36 : isWind ? 1.18 : 1,
  target: [0, name === "slash" ? 1.4 : name === "blackhole" ? 1.12 : isWind ? 2.35 : 0.75, 0],
});
const dest = new Uint8ClampedArray(width * height * 4);
const sheet = new Uint8Array(width * columns * height * rows * 4);
for (let n = 0; n < frames; n++) {
  const time = n / Math.max(1, frames - 1) * mod.meta.duration;
  fx.seek(time);
  painter.begin(name === "blackhole" ? "#05030d" : isWind ? "#061222" : "#0a1525");
  if (name !== "blackhole" && !isWind) painter.grid();
  fx.draw(painter);
  if (cinematicMode) {
    const shade = lighting.evaluate(frame, painter.camera, rig, {
      ambientOcclusion: { radius: 3, bias: 0.1, intensity: 0.36 },
    });
    film.render(frame, dest, {
      radiance: shade.radiance, occlusion: shade.occlusion,
      bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 },
      exposure: 1.25, toneMap: "aces", saturation: 1.12, contrast: 1.05,
      vignette: 0.07, chromaticFringe: 0.5,
    });
  } else compositeFrame3D(frame, dest);
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
  renderMode: cinematicMode ? "cinematic" : "legacy",
  options: fx.options, camera: painter.camera,
  timeSamples: Array.from({ length: frames }, (_, i) => i / Math.max(1, frames - 1) * mod.meta.duration),
}, null, 2));
console.log(`${mod.meta.id}: ${frames} frames → ${out}`);
