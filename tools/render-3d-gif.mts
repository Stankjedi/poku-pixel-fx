#!/usr/bin/env node
/** Deterministic, streamed 3D video export; requires local ffmpeg. */
import { resolve } from "node:path";
import { writeVideo } from "./lib/video.mjs";
import { parseFlags3D, positiveInteger, scene3D } from "./lib/scene3d.mjs";
const args = process.argv.slice(2), name = args[0] ?? "wind", flags = parseFlags3D(args.slice(1));
const { sequence, meta } = await scene3D(name, flags, "video");
const out = resolve(flags.out ?? `records/3d/${name}.gif`), scale = positiveInteger(flags.scale, 2, "scale");
if (!writeVideo(out, sequence, scale)) throw new Error("Requested video could not be created: ffmpeg is not available on PATH");
console.log(`${meta.id}: ${sequence.n} frames at ${sequence.fps} fps (${sequence.settings?.renderMode}) -> ${out}`);
