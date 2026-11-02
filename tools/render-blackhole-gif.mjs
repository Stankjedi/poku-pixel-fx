#!/usr/bin/env node
/**
 * Export the real procedural POKU Pixel FX 3D Black Hole to a looping GIF.
 * Not a moving reference image: every frame is freshly simulated and ray-rendered.
 *
 *   npm run build
 *   node tools/render-blackhole-gif.mjs --out records/3d/black-hole-cinematic.gif
 * Requires ffmpeg in PATH (only for final GIF palette encoding).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, openSync, writeSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createFrame3D, compositeFrame3D, Painter3D, createFx3D, blackHole3D } from '../build/3d/index.js';

const argv = process.argv.slice(2);
const get = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
};
const int = (name, fallback, lo, hi) => {
  const n = Number(get(name, fallback));
  if (!Number.isInteger(n) || n < lo || n > hi) throw new RangeError(`${name} must be ${lo}..${hi}`);
  return n;
};
const width = int('width', 320, 96, 800);
const height = int('height', 240, 72, 600);
const fps = int('fps', 20, 8, 60);
const scale = int('scale', 3, 1, 6);
const seed = int('seed', blackHole3D.meta.options.seed, 0, 2147483647);
const out = resolve(get('out', 'records/3d/black-hole-cinematic.gif'));
const frames = Math.round(blackHole3D.meta.duration * fps);
const temporary = mkdtempSync(join(tmpdir(), 'poku-black-hole-'));
const raw = join(temporary,'frames.rgba');
const palette = join(temporary,'palette.png');
const run = (args) => {
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error', ...args], {encoding:'utf8'});
  if (result.error || result.status !== 0) throw new Error(`ffmpeg failed: ${result.error?.message ?? result.stderr}`);
};
try {
  const frame=createFrame3D(width,height);
  const painter=new Painter3D(frame,{yaw:0.68,elevation:0.49,zoom:1.36,target:[0,1.12,0]});
  const fx=createFx3D(blackHole3D,{seed});
  const pixels=new Uint8ClampedArray(width*height*4);
  const fd=openSync(raw,'w');
  try {
    for(let n=0;n<frames;n++) {
      if(n>0) fx.update(1/fps);
      painter.begin('#05030e'); fx.draw(painter);
      compositeFrame3D(frame,pixels);
      writeSync(fd,Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength));
    }
  } finally {closeSync(fd);}
  const base=['-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i',raw];
  const scaled=`scale=${width*scale}:${height*scale}:flags=neighbor`;
  run([...base,'-vf',`${scaled},palettegen=stats_mode=full:max_colors=256`,'-frames:v','1','-y',palette]);
  mkdirSync(dirname(out),{recursive:true});
  run([...base,'-i',palette,'-filter_complex',`[0:v]${scaled}[v];[v][1:v]paletteuse=dither=none`, '-loop','0','-y',out]);
  process.stdout.write(`Cinematic Black Hole: ${frames} real 3D frames, ${width*scale}×${height*scale}, ${fps}fps → ${out}\n`);
} finally {rmSync(temporary,{recursive:true,force:true});}
