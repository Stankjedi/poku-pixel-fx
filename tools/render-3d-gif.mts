#!/usr/bin/env node
/** Deterministic GIF export with optional cinematic lighting; requires local ffmpeg. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { encodePNG } from "./lib/png.mjs";
const { createFrame3D, compositeFrame3D, Painter3D, createFx3D, enableHDRLight, CinematicLighting3D, CinematicCompositor } = await import(new URL("../../build/3d/index.js", import.meta.url).href);
const frost = await import(new URL("../../build/3d/effects/frost-nova.js", import.meta.url).href);
const slash = await import(new URL("../../build/3d/effects/arc-slash.js", import.meta.url).href);
const blackhole = await import(new URL("../../build/3d/effects/black-hole.js", import.meta.url).href);
const wind = await import(new URL("../../build/3d/effects/wind-rasenshuriken.js", import.meta.url).href);
const windOriginal = await import(new URL("../../build/3d/effects/wind-rasenshuriken-legacy.js", import.meta.url).href);
const mods = { frost, slash, blackhole, wind, windOriginal };
const args = process.argv.slice(2), name = args[0] ?? "wind";
if (!Object.prototype.hasOwnProperty.call(mods, name)) throw new Error("Usage: render-3d-gif wind|windOriginal|frost|slash|blackhole [--fps 20 --width 260 --height 180 --seed 308 --out output.gif --cinematic true]");
const flags: Record<string, string> = {};
for (let i = 1; i < args.length; i += 2) {
  if (!args[i].startsWith("--") || args[i + 1] === undefined) throw new Error("Expected --option value");
  flags[args[i].slice(2)] = args[i + 1];
}
const integer = (key: string, fallback: number) => {
  const n = Number(flags[key] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(key + " must be a positive integer");
  return n;
};
const fps = integer("fps", 20), w = integer("width", 260), h = integer("height", 180);
const mod = mods[name as keyof typeof mods], seed = Number(flags.seed ?? mod.meta.options.seed);
if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError("seed must be a non-negative integer");
const cinematicMode = flags.cinematic === "true" || flags.cinematic === "1";
const fx = createFx3D(mod, { seed });
const isWind = name === "wind" || name === "windOriginal";
const frame = createFrame3D(w, h);
if (cinematicMode && name !== "blackhole") enableHDRLight(frame);
const painter = new Painter3D(frame, {
  yaw: isWind ? 0.32 : 0.68, elevation: isWind ? 0.22 : 28 * Math.PI / 180,
  zoom: name === "blackhole" ? 1.36 : isWind ? 1.18 : 1,
  target: [0, name === "slash" ? 1.4 : name === "blackhole" ? 1.12 : isWind ? 2.35 : 0.75, 0],
});
const lighting = new CinematicLighting3D(), film = new CinematicCompositor();
const rig = [
  { position: [-2.3, 3.2, 1.6] as const, radius: 7, color: "#88dfff", intensity: 1.75, specular: 0.5, rim: 0.2 },
  { position: [2.4, 2.1, -1.7] as const, radius: 6, color: "#ff9dce", intensity: 1.3, specular: 0.38, rim: 0.22 },
];
const rgba = new Uint8ClampedArray(w * h * 4), frames = Math.ceil(mod.meta.duration * fps);
const out = resolve(flags.out ?? ("records/3d/" + name + ".gif"));
function run(a: string[]) {
  const p = spawnSync("ffmpeg", a, { encoding: "utf8" });
  if (p.error) throw new Error("ffmpeg unavailable: " + p.error.message);
  if (p.status !== 0) throw new Error("ffmpeg failed: " + p.stderr);
}
// Fail before rasterizing the sequence when the optional encoder is missing.
run(["-version"]);
const temp = mkdtempSync(join(tmpdir(), "poku-3d-gif-"));
try {
  for (let i = 0; i < frames; i++) {
    // Sequential export uses the same fixed-step timeline without replaying from t=0 per frame.
    if (i > 0) fx.update(1 / fps);
    painter.begin(name === "blackhole" ? "#05030d" : isWind ? "#061222" : "#0a1525");
    if (name !== "blackhole" && !isWind) painter.grid();
    fx.draw(painter);
    if (cinematicMode) {
      const shade = lighting.evaluate(frame, painter.camera, rig, {
        ambientOcclusion: { radius: 3, bias: 0.1, intensity: 0.36 },
      });
      film.render(frame, rgba, {
        radiance: shade.radiance, occlusion: shade.occlusion,
        bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 },
        exposure: 1.25, toneMap: "aces", saturation: 1.12, contrast: 1.05,
        vignette: 0.07, chromaticFringe: 0.5,
      });
    } else compositeFrame3D(frame, rgba);
    writeFileSync(join(temp, "frame-" + String(i).padStart(4, "0") + ".png"), encodePNG(w, h, rgba));
  }
  mkdirSync(dirname(out), { recursive: true });
  const input = join(temp, "frame-%04d.png"), palette = join(temp, "palette.png");
  run(["-v", "error", "-y", "-framerate", String(fps), "-i", input,
    "-vf", "scale=iw*2:ih*2:flags=neighbor,palettegen=stats_mode=full", "-frames:v", "1", palette]);
  run(["-v", "error", "-y", "-framerate", String(fps), "-i", input, "-i", palette,
    "-lavfi", "[0:v]scale=iw*2:ih*2:flags=neighbor[v];[v][1:v]paletteuse=dither=none",
    "-loop", "0", out]);
  console.log(mod.meta.id + ": " + frames + " frames at " + fps + "fps (" + (cinematicMode ? "cinematic" : "legacy") + ") -> " + out);
} finally { rmSync(temp, { recursive: true, force: true }); }
